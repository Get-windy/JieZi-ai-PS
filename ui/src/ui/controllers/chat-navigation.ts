/**
 * 聊天导航树数据控制器
 *
 * 职责：
 * - 从已有数据源（agents、channels、groups、friends）构建导航树
 * - 解析和生成 sessionKey
 * - 提供通道图标和显示名映射
 *
 * 数据来源：
 * - agents: 来自 agents.list (agents tab)
 * - channels: 来自 channels.status (channels tab)
 * - groups: 来自 groups.list (collaboration tab)
 * - friends: 来自 friends.list (collaboration tab)
 */

import { t } from "../i18n.ts";
import type {
  AgentsListResult,
  ChannelsStatusSnapshot,
  ChatConversationContext,
  ChatNavigationNode,
  SessionsListResult,
} from "../types.ts";
import type { GroupsListResult } from "../views/groups.ts";
import type { Friend } from "./friends.ts";

// ============ 通道工具函数 ============

const CHANNEL_ICONS: Record<string, string> = {
  // nav4 修复：每个平台使用独特 emoji，避免多通道无法区分
  discord: "🎮",      // Discord 游戏社区文化
  telegram: "✈️",    // Telegram 飞机纸船 logo 对应
  dingtalk: "📎",    // 钉钉 - 回形针（钉）
  slack: "#️⃣",       // Slack 井号格子 logo
  whatsapp: "📞",    // WhatsApp 电话
  signal: "🔒",      // Signal 加密/锁
  imessage: "🍎",    // iMessage Apple 平台
  nostr: "🟣",       // Nostr 紫色协议标志
  googlechat: "🅖",  // Google Chat G
  msteams: "🏢",     // Teams 企业/办公
  line: "🟢",        // LINE 绿色
  wechat: "💭",      // 微信 - 对话泡
};

const CHANNEL_NAMES: Record<string, string> = {
  discord: "Discord",
  telegram: "Telegram",
  dingtalk: "钉钉",
  slack: "Slack",
  whatsapp: "WhatsApp",
  signal: "Signal",
  imessage: "iMessage",
  nostr: "Nostr",
  googlechat: "Google Chat",
  msteams: "Teams",
  line: "LINE",
  wechat: "微信",
};

export function getChannelIcon(channelId: string): string {
  return CHANNEL_ICONS[channelId.toLowerCase()] || "📱";
}

export function getChannelDisplayName(channelId: string): string {
  return CHANNEL_NAMES[channelId.toLowerCase()] || channelId;
}

// ============ 导航树构建 ============

/** 智能体通道绑定数据类型 */
export type AgentChannelBinding = {
  channelId: string;
  accountId: string;
};

export interface BuildNavigationTreeOptions {
  agents: AgentsListResult | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  groups: GroupsListResult | null;
  friends: Friend[];
  /**
   * 来自 sessions.list 的历史会话列表，用于构建"全部会话"节点的子树
   * 同时用于通道节点匹配真实的后端 sessionKey
   */
  sessions?: SessionsListResult | null;
  // Z4: 未读消息计数映射（sessionKey → 未读数）
  unreadSessionMessages?: Record<string, number>;
  // 注意：channelBindings 现在直接从 agent 对象中获取，不再需要单独传递
}

/**
 * 构建完整的导航树数据（按智能体分组）
 *
 * 结构（精简版，参考 Slack/Discord 设计）：
 * 📋 全部会话 (聚合所有智能体的会话列表)
 * 🤖 智能助手 A (main) ← 点击直接进入主会话
 * │  └─ 📱 通道 ▼
 * │     ├─ 💬 Discord - 服务器A
 * │     └─ ✈️ Telegram - 个人助手
 * 🤖 智能助手 B ...
 * 🤝 Agent 间通信 (唯一入口，不与 agent 子树重复)
 * │  ├─ Agent A ↔ Agent B
 * │  └─ Agent A ↔ Agent C
 * 👥 群聊
 * │  └─ 研发团队群 ...
 *
 * 防御性处理：
 * - 所有数据源都有安全的默认值（空数组）
 * - 即使所有数据缺失仍返回有意义的空树结构
 * - 单个数据源加载失败不影响其他节点渲染
 */
export function buildNavigationTree(options: BuildNavigationTreeOptions): ChatNavigationNode[] {
  const { agents, channelsSnapshot, groups, friends, sessions, unreadSessionMessages } = options;

  // === 防御性默认值处理 ===
  const agentList = agents?.agents ?? [];
  const defaultId = agents?.defaultId ?? "main";
  const defaultAgent = agentList.find((a) => a.id === defaultId) ?? agentList[0];
  const defaultSessionKey = defaultAgent ? `agent:${defaultAgent.id}:main` : "agent:main:main";

  // 通道数据默认值
  const channelOrder = channelsSnapshot?.channelOrder ?? [];
  const channelAccounts = channelsSnapshot?.channelAccounts ?? {};
  const channelLabels = channelsSnapshot?.channelLabels ?? {};

  // 群组 & 好友数据默认值
  const groupList = groups?.groups ?? [];
  const friendList = Array.isArray(friends) ? friends : [];

  // Z4: 未读数查询辅助函数
  const unread = unreadSessionMessages ?? {};
  const getUnread = (sessionKey: string): number | undefined => {
    const count = unread[sessionKey];
    return count && count > 0 ? count : undefined;
  };
  // 计算某个前缀下所有 sessionKey 的未读数之和
  const sumUnreadByPrefix = (prefix: string): number | undefined => {
    let total = 0;
    for (const [key, count] of Object.entries(unread)) {
      if (key.startsWith(prefix) && count > 0) {
        total += count;
      }
    }
    return total > 0 ? total : undefined;
  };
  // 计算全部未读数之和
  const sumAllUnread = (): number | undefined => {
    let total = 0;
    for (const count of Object.values(unread)) {
      if (count > 0) {
        total += count;
      }
    }
    return total > 0 ? total : undefined;
  };

  // 顶层节点数组
  const rootNodes: ChatNavigationNode[] = [];

  // ---- 顶级: 📊 全部会话（子树直接是会话列表，无冗余按钮节点）----
  const sessionList = sessions?.sessions ?? [];
  const sortedSessions = [...sessionList].toSorted(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );

  const unreadSessions = sortedSessions.filter((s) => {
    const count = unread[s.key];
    return count !== undefined && count > 0;
  });

  const makeSessionHistoryNode = (
    s: SessionsListResult["sessions"][number],
  ): ChatNavigationNode => {
    const displayName = s.displayName?.trim() || s.label?.trim() || s.key;
    return {
      id: `session-hist-${s.key}`,
      label: displayName,
      icon: "💬",
      nodeType: "item",
      unreadCount: getUnread(s.key),
      updatedAt: s.updatedAt,
      context: {
        type: "session-history",
        sessionKey: s.key,
        displayName,
      },
    };
  };

  // 子树：未读会话优先显示，其余按时间排序
  // 过滤掉从未有过活动的空会话（updatedAt 为 null/undefined 表示从未收发过消息）
  // 默认只展示前 20 条，避免树过长
  const MAX_SESSION_PREVIEW = 20;
  const activeSessions = sortedSessions.filter((s) => s.updatedAt != null);
  const activeUnreadSessions = unreadSessions.filter((s) => s.updatedAt != null);

  // P2: 执行组折叠 — 把有相同 spawnedBy 的子会话合并为一个 "Task Group" 节点
  // 参考 Helix SessionsSidebar.tsx groupSessionsByExecutionId()
  const groupMap = new Map<string, SessionsListResult["sessions"]>();
  const ungroupedSessions: SessionsListResult["sessions"] = [];
  for (const s of activeSessions) {
    const parentKey = s.spawnedBy;
    if (parentKey) {
      // 只有 spawnedBy 的子会话才归入任务组
      const arr = groupMap.get(parentKey) ?? [];
      arr.push(s);
      groupMap.set(parentKey, arr);
    } else {
      ungroupedSessions.push(s);
    }
  }

  // 构建任务组节点（>= 2 个子会话才折叠为组）
  const taskGroupNodes: ChatNavigationNode[] = [];
  for (const [parentKey, children] of groupMap) {
    if (children.length < 2) {
      // 单个子会话不需要分组，作为普通节点显示
      ungroupedSessions.push(...children);
      continue;
    }
    // 找到最近更新的子会话作为组标题
    const sortedChildren = [...children].toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const latestChild = sortedChildren[0];
    const groupLabel = latestChild.displayName?.trim() ||
      latestChild.label?.trim() ||
      `${t("chat.nav.exec_group")} · ${parentKey.slice(-8)}`;
    const groupUnread = children.reduce((sum, c) => sum + (getUnread(c.key) ?? 0), 0);
    const parentSessionKey = activeSessions.find((s) => s.key === parentKey)?.key ?? parentKey;

    taskGroupNodes.push({
      id: `exec-group-${parentKey}`,
      label: `📦 ${groupLabel} · ${children.length} 个子任务`,
      icon: "📦",
      nodeType: "category" as const,
      unreadCount: groupUnread > 0 ? groupUnread : undefined,
      updatedAt: latestChild.updatedAt,
      context: {
        type: "session-history" as const,
        sessionKey: parentSessionKey,
        displayName: groupLabel,
      },
      children: sortedChildren.map(makeSessionHistoryNode),
    });
  }

  // 将任务组节点 + 晦散节点合并（任务组排在前面）
  const allActiveSessions = [
    ...taskGroupNodes,
    ...ungroupedSessions.filter((s) => !(unread[s.key] > 0)),
  ];

  const sessionChildNodes: ChatNavigationNode[] = [
    ...activeUnreadSessions
      .filter((s) => !s.spawnedBy)
      .map(makeSessionHistoryNode),
    ...allActiveSessions.slice(0, Math.max(0, MAX_SESSION_PREVIEW - activeUnreadSessions.length)),
  ];

  // nav1 修复：全部会话根节点本身不可点击跳转（它是容器，不是目标）
  // 当有子会话时只作为折叠/展开的分组，没有子会话时才 fallback 到 defaultSessionKey
  // 超出 MAX_SESSION_PREVIEW 时额外追加「还有N条」提示节点（nav3 修复）
  const remainingCount = activeSessions.length - sessionChildNodes.length;
  const allSessionChildren: ChatNavigationNode[] =
    sessionChildNodes.length > 0
      ? [
          ...sessionChildNodes,
          ...(remainingCount > 0
            ? [
                {
                  id: "__all_more__",
                  label: t("chat.nav.more_sessions", { count: remainingCount }),
                  icon: "⋯",
                  nodeType: "item" as const,
                  context: {
                    type: "all" as const,
                    sessionKey: defaultSessionKey,
                  },
                },
              ]
            : []),
        ]
      : [];

  rootNodes.push({
    id: "__all__",
    label: t("chat.nav.all_sessions"),
    icon: "📋",
    nodeType: "root",
    unreadCount: sumAllUnread(),
    // nav1 修复：有子节点时 context 仍保留（用于 isSameContext active 判断），
    // 但渲染层（renderRootNode）对有子节点的根节点只展开/折叠，不执行 onSelectContext
    context: {
      type: "all",
      sessionKey: defaultSessionKey,
    },
    children: allSessionChildren.length > 0 ? allSessionChildren : undefined,
  });

  // ---- 每个智能体生成一棵子树 ----
  for (const agent of agentList) {
    const agentName = agent.identity?.name || agent.name || agent.id;
    const agentEmoji = agent.identity?.emoji || "🤖";
    const agentSessionKey = `agent:${agent.id}:main`;
    const agentChildren: ChatNavigationNode[] = [];

    // 「📋 全部」子项已删除 — 点击 Agent 根节点即为该智能体主会话（Slack 模式）
    // Agent 间通信（好友/直接会话）统一在顶级「协作监控」入口

    // 📱 通道（只显示该智能体绑定的通道，直接从 agent.channelBindings 获取）
    const agentBindings: AgentChannelBinding[] =
      agent.channelBindings?.bindings?.map((b) => ({
        channelId: b.channelId,
        accountId: b.accountId,
      })) ?? [];

    const channelItems = buildAgentChannelItems(
      agent,
      channelOrder,
      channelAccounts,
      channelLabels,
      agentBindings,
      sessions,
    );
    // Z4: 为通道节点添加未读计数（用 sessionKey 匹配，也兼容旧格式）
    for (const ci of channelItems) {
      ci.unreadCount =
        getUnread(ci.context.sessionKey) ??
        getUnread((ci.context as { sessionKey: string }).sessionKey);
    }
    if (channelItems.length > 0) {
      // 通道分类节点：点击即聚合显示该 agent 所有通道消息，子节点直接是各通道账号（去掉冗余的"全部通道"）
      const channelsUnread =
        (sumUnreadByPrefix(`agent:${agent.id}:`) ?? 0) > 0
          ? sumUnreadByPrefix(`agent:${agent.id}:`)
          : undefined;
      agentChildren.push({
        id: `channels-${agent.id}`,
        label: t("chat.nav.channels"),
        icon: "📱",
        nodeType: "category",
        unreadCount: channelsUnread,
        context: {
          type: "channels-all",
          agentId: agent.id,
          agentName,
          sessionKey: agentSessionKey,
        },
        children: channelItems,
      });
    }

    // 好友/直接会话已移至顶级「协作监控」栏目，不再在每个 agent 子树下重复显示

    // 智能体根节点（未读数覆盖通道 + 直接对话两种前缀）
    const agentUnread = (() => {
      const direct = sumUnreadByPrefix(`agent:${agent.id}:`) ?? 0;
      const legacy = sumUnreadByPrefix(`${agent.id}:`) ?? 0;
      const total = direct + legacy;
      return total > 0 ? total : undefined;
    })();
    rootNodes.push({
      id: `agent-${agent.id}`,
      label: agentName,
      icon: agentEmoji,
      nodeType: "agent",
      unreadCount: agentUnread,
      context: {
        type: "agent-direct",
        agentId: agent.id,
        agentName,
        agentEmoji,
        sessionKey: agentSessionKey,
      },
      children: agentChildren,
    });
  }

  // ---- 顶级：🤝 协作监控（Agent 间通信的唯一入口）----
  // 好友/直接会话只在这里出现，不在每个 agent 子树中重复
  // 不再包含「全部 Agent 通信」节点（与「全部会话」功能完全等同，已删除）
  {
    const allContactItems: ChatNavigationNode[] = [];
    const seenFriendIds = new Set<string>();
    for (const friend of friendList) {
      if (seenFriendIds.has(friend.agentId)) {
        continue;
      }
      seenFriendIds.add(friend.agentId);
      const monitorAgentId = defaultAgent?.id ?? agentList[0]?.id ?? "main";
      const monitorAgentName = defaultAgent?.identity?.name || defaultAgent?.id || monitorAgentId;
      allContactItems.push({
        id: `monitor-contact-${friend.agentId}`,
        label: `${monitorAgentName} ↔ ${friend.agentName || friend.agentId}`,
        icon: "💬",
        nodeType: "item" as const,
        unreadCount: getUnread(`agent:${friend.agentId}:main`),
        context: {
          type: "contact" as const,
          agentId: monitorAgentId,
          contactAgentId: friend.agentId,
          contactAgentName: friend.agentName || friend.agentId,
          sessionKey: `agent:${friend.agentId}:main`,
        },
      });
    }
    // nav1 修复：协作监控根节点无好友时不再 fallback 到「全部会话」同一目标
    // 无子节点时 context 指向 agent-direct（某个 agent 主会话），行为与「全部会话」不同
    // 渲染层对有子节点的分类节点只展开/折叠不跳转，所以这里的 context 主要用于 active 判断
    const monitorAgentId = defaultAgent?.id ?? agentList[0]?.id ?? "main";
    const monitorRootContext: ChatConversationContext = allContactItems[0]?.context ?? {
      type: "agent-direct" as const,
      agentId: monitorAgentId,
      sessionKey: `agent:${monitorAgentId}:main`,
    };
    // 计算 agent 间通信的未读数（仅统计 contact 相关的 sessionKey）
    const monitorUnread = (() => {
      let total = 0;
      for (const item of allContactItems) {
        total += item.unreadCount ?? 0;
      }
      return total > 0 ? total : undefined;
    })();
    rootNodes.push({
      id: "monitor-root",
      label: t("chat.nav.monitor"),
      icon: "🤝",
      nodeType: "category" as const,
      unreadCount: monitorUnread,
      context: monitorRootContext,
      children: allContactItems.length > 0 ? allContactItems : undefined,
    });
  }

  // ---- 顶级：👥 群聊（独立栏目，不重复挂在每个 agent 下）----
  // 始终显示群聊根节点（即使暂无群组），方便用户通过 collaboration 面板创建群组
  {
    const groupAgentId = defaultAgent?.id ?? agentList[0]?.id ?? "main";
    const groupItems: ChatNavigationNode[] = groupList.map((group) => {
      const sessionKey = `agent:${groupAgentId}:group:${group.id}`;
      return {
        id: `group-${group.id}`,
        label: group.name,
        icon: "💬",
        nodeType: "item" as const,
        unreadCount: getUnread(`agent:${groupAgentId}:group:${group.id}`),
        context: {
          type: "group" as const,
          agentId: groupAgentId,
          groupId: group.id,
          groupName: group.name,
          memberAgentIds: group.members.map((m) => m.agentId),
          sessionKey,
        },
      };
    });

    // nav1 修复：群聊根节点无群组时不再 fallback 到「全部会话」
    // 指向 agent-direct 而非 type:"all"，避免三个节点点击后跳转同一地方
    const groupsRootContext: ChatConversationContext = groupItems[0]?.context ?? {
      type: "agent-direct" as const,
      agentId: groupAgentId,
      sessionKey: `agent:${groupAgentId}:main`,
    };

    rootNodes.push({
      id: "groups-root",
      label: t("chat.nav.groups"),
      icon: "👥",
      nodeType: "category",
      unreadCount: sumUnreadByPrefix(`agent:${groupAgentId}:group:`),
      context: groupsRootContext,
      children: groupItems.length > 0 ? groupItems : undefined,
    });
  }

  return rootNodes;
}

// ============ 某个智能体的通道项 ============

/**
 * 构建某个智能体绑定的通道节点列表
 *
 * 关键：sessionKey 优先从 sessions.list 真实数据中匹配（lastChannel + lastAccountId），
 * 后端真实格式是 agent:{agentId}:{channelId}:{peerKind}:{peerId}，
 * 不能手动拼接，否则 peerKind/peerId 无法正确推断。
 *
 * @param agent - 智能体信息
 * @param channelOrder - 所有通道ID列表（排序）
 * @param channelAccounts - 所有通道的账号信息
 * @param channelLabels - 通道显示名称映射
 * @param agentBindings - 该智能体绑定的通道账号列表（用于过滤）
 * @param sessionsResult - sessions.list 结果，用于匹配真实 sessionKey
 */
function buildAgentChannelItems(
  agent: { id: string; name?: string; identity?: { name?: string; emoji?: string } },
  channelOrder: string[],
  channelAccounts: Record<string, Array<{ accountId: string; name?: string | null }>>,
  channelLabels: Record<string, string>,
  agentBindings: AgentChannelBinding[],
  sessionsResult?: SessionsListResult | null,
): ChatNavigationNode[] {
  const items: ChatNavigationNode[] = [];

  // 如果没有绑定信息，不显示任何通道（而不是显示所有通道）
  if (agentBindings.length === 0) {
    return items;
  }

  // 将绑定列表转换为 Set 以便快速查找
  const bindingSet = new Set(agentBindings.map((b) => `${b.channelId}:${b.accountId}`));

  // 从 sessions.list 构建通道会话映射，支持两种匹配方式：
  // 1. lastChannel + lastAccountId 精确匹配
  // 2. 按 sessionKey 前缀匹配（agent:{agentId}:{channelId}:）
  const channelSessionMap = new Map<string, SessionsListResult["sessions"][number][]>();
  if (sessionsResult?.sessions) {
    for (const s of sessionsResult.sessions) {
      // 方式1：lastChannel 字段存在时构建精确映射
      const ch = s.lastChannel;
      const acc = s.lastAccountId;
      if (ch && acc) {
        const mapKey = `${ch}:${acc}`;
        const existing = channelSessionMap.get(mapKey) ?? [];
        existing.push(s);
        channelSessionMap.set(mapKey, existing);
      }
      // 方式2：从 sessionKey 解析 channelId（格式 agent:{agentId}:{channelId}:{peerKind}:{peerId}）
      if (s.key.startsWith("agent:")) {
        const parts = s.key.split(":");
        // parts[2] 是 channelId（跳过 main 和 group）
        if (
          parts.length >= 5 &&
          parts[2] !== "main" &&
          parts[2] !== "group" &&
          parts[2] !== "cron"
        ) {
          const keyChannelId = parts[2];
          // 用 channelId:* 作为通配 key，供后续按 channelId 匹配
          const wildcardKey = `${keyChannelId}:*`;
          const existing2 = channelSessionMap.get(wildcardKey) ?? [];
          existing2.push(s);
          channelSessionMap.set(wildcardKey, existing2);
        }
      }
    }
  }
  // (Debug logging removed)

  for (const channelId of channelOrder) {
    const accounts = channelAccounts[channelId] ?? [];

    for (const account of accounts) {
      const accountId = account.accountId;
      const bindingKey = `${channelId}:${accountId}`;

      // 只显示该智能体绑定的通道账号
      if (!bindingSet.has(bindingKey)) {
        continue;
      }

      const accountName = account.name ?? accountId;
      const channelLabel = channelLabels[channelId] ?? getChannelDisplayName(channelId);

      // 优先从 sessions.list 匹配真实的后端 sessionKey
      // 方式1：精确匹配 lastChannel:lastAccountId
      const exactMatched = channelSessionMap.get(`${channelId}:${accountId}`) ?? [];
      // 方式2：通过 sessionKey 前缀匹配（agent:{agentId}:{channelId}:）
      const wildcardMatched = (channelSessionMap.get(`${channelId}:*`) ?? []).filter((s) =>
        s.key.startsWith(`agent:${agent.id}:${channelId}:`),
      );
      // 合并去重（优先精确匹配，再补充通配匹配）
      const mergedKeys = new Set(exactMatched.map((s) => s.key));
      const matchedSessions = [
        ...exactMatched,
        ...wildcardMatched.filter((s) => !mergedKeys.has(s.key)),
      ];
      // 过滤属于该 agent 的 session
      const agentSessions = matchedSessions.filter((s) => s.key.startsWith(`agent:${agent.id}:`));

      if (agentSessions.length > 0) {
        // 有真实 session：每个 session 生成一个子节点，或合并为一个节点（取最近更新的）
        const latestSession = agentSessions.toSorted(
          (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
        )[0];
        const realSessionKey = latestSession.key;
        const displayLabel =
          latestSession.displayName?.trim() || `${channelLabel} - ${accountName}`;

        items.push({
          id: `channel-${agent.id}-${channelId}-${accountId}`,
          label: displayLabel,
          icon: getChannelIcon(channelId),
          nodeType: "item",
          context: {
            type: "channel-observe",
            agentId: agent.id,
            agentName: agent.identity?.name || agent.name,
            channelId,
            channelName: channelLabel,
            accountId,
            accountName: accountName ?? undefined,
            // 使用后端 sessions.list 里的真实 key，格式：agent:{agentId}:{channelId}:{peerKind}:{peerId}
            sessionKey: realSessionKey,
          },
        });

        // 如果该通道账号有多个活跃 session（多用户），额外展示子节点
        if (agentSessions.length > 1) {
          const parentNode = items[items.length - 1];
          parentNode.label = `${channelLabel} - ${accountName}（${agentSessions.length} 个会话）`;
          parentNode.nodeType = "category";
          parentNode.children = agentSessions
            .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
            .map((s) => ({
              id: `channel-sess-${s.key}`,
              label: s.displayName?.trim() || s.key,
              icon: getChannelIcon(channelId),
              nodeType: "item" as const,
              context: {
                type: "channel-observe" as const,
                agentId: agent.id,
                channelId,
                channelName: channelLabel,
                accountId,
                sessionKey: s.key,
              },
            }));
        }
      } else {
        // 没有匹配到真实 session：仍然显示通道配置项，但标注"暂无会话"
        // sessionKey 用 agent:{agentId}:{channelId}:main（告知后端从该通道主会话查找）
        const fallbackKey = `agent:${agent.id}:${channelId}:main`;
        items.push({
          id: `channel-${agent.id}-${channelId}-${accountId}`,
          label: `${channelLabel} - ${accountName}`,
          icon: getChannelIcon(channelId),
          nodeType: "item",
          context: {
            type: "channel-observe",
            agentId: agent.id,
            agentName: agent.identity?.name || agent.name,
            channelId,
            channelName: channelLabel,
            accountId,
            accountName: accountName ?? undefined,
            sessionKey: fallbackKey,
          },
        });
      }
    }
  }

  return items;
}

// ============ 上下文比较 ============

/**
 * 比较两个 ConversationContext 是否指向同一会话
 */
export function isSameContext(
  a: ChatConversationContext | null,
  b: ChatConversationContext | null,
): boolean {
  if (!a || !b) {
    return false;
  }
  if (a.type !== b.type) {
    return false;
  }
  return a.sessionKey === b.sessionKey;
}

/**
 * 根据 sessionKey 解析出 ConversationContext 的类型
 *
 * 后端真实 key 格式：
 *   主会话：  agent:{agentId}:main
 *   通道：    agent:{agentId}:{channelId}:{peerKind}:{peerId}
 *              其中 peerKind = direct | channel | group | account | ...
 *   精山会话：agent:{agentId}:{channelId}:account:{accountId}:direct:{peerId}
 *   群组：    agent:{agentId}:group:{groupId}  或  agent:{agentId}:{channelId}:group:{groupId}
 *   好友：    agent:{contactAgentId}:main（直接指向目标 agent main session）
 */
export function resolveContextType(
  sessionKey: string,
): "agent-direct" | "channel-observe" | "group" | "contact" {
  // 第一段必须是 agent 才处理通道
  if (!sessionKey.startsWith("agent:")) {
    if (sessionKey.includes(":contact:")) {
      // 兼容旧格式（已废弃）
      return "contact";
    }
    return "agent-direct";
  }
  const parts = sessionKey.split(":");
  // agent:{agentId}:group:{groupId} → parts[2] === "group"
  if (parts[2] === "group" || parts[3] === "group") {
    return "group";
  }
  // agent:{agentId}:main → parts[2] === "main" 且只有 3 段
  if (parts[2] === "main" && parts.length <= 3) {
    return "agent-direct";
  }
  // 其他带外部通道的 key：agent:{agentId}:{channelId}:{peerKind}:{peerId}
  // parts.length >= 5 且 parts[2] 不是 main 时，认为是通道
  if (parts.length >= 5 && parts[2] !== "main") {
    return "channel-observe";
  }
  return "agent-direct";
}

/**
 * 从 sessionKey 创建默认的 ConversationContext
 *
 * 处理真实后端 key 格式：agent:{agentId}:{channelId}:{peerKind}:{peerId}
 */
export function createDefaultContext(sessionKey: string): ChatConversationContext {
  const contextType = resolveContextType(sessionKey);
  const parts = sessionKey.split(":");

  switch (contextType) {
    case "channel-observe":
      return {
        type: "channel-observe",
        // 真实格式：agent:{agentId}:{channelId}:{peerKind}:{peerId}
        // parts = ["agent", agentId, channelId, peerKind, peerId, ...]
        agentId: parts[1] ?? "main",
        channelId: parts[2] ?? "",
        accountId: parts[4] ?? parts[3] ?? "",
        sessionKey,
      };
    case "group":
      return {
        type: "group",
        // 格式: agent:{agentId}:group:{groupId} 或 agent:{agentId}:{channelId}:group:{groupId}
        agentId: parts[1] ?? "main",
        groupId: (parts[2] === "group" ? parts[3] : parts[4]) ?? "",
        sessionKey,
      };
    case "contact":
      return {
        type: "contact",
        agentId: parts[0],
        contactAgentId: parts[2] ?? "",
        sessionKey,
      };
    default:
      return {
        type: "agent-direct",
        agentId: (parts[0] === "agent" ? parts[1] : parts[0]) ?? "main",
        sessionKey,
      };
  }
}

/**
 * 在导航树中查找匹配的节点
 */
export function findNodeBySessionKey(
  nodes: ChatNavigationNode[],
  sessionKey: string,
): ChatNavigationNode | null {
  for (const node of nodes) {
    if (node.context.sessionKey === sessionKey) {
      return node;
    }
    if (node.children) {
      const found = findNodeBySessionKey(node.children, sessionKey);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * 导航树节点搜索过滤
 *
 * nav2 修复：原实现在 labelMatch 时把全部子节点透传出去（children: node.children），
 * 可能将与搜索词无关的子会话名称一并暴露（如搜索「全部」命中根节点，则全部 20 条历史会话名都显示出来）。
 * 修复策略：label 命中时只保留自身节点（无子节点展开），子节点只在有实际 match 时才随父节点一起返回。
 * 这与 VS Code / Slack 的搜索行为一致：命中父节点只高亮父节点本身，不自动展开所有子节点。
 */
export function filterNavigationNodes(
  nodes: ChatNavigationNode[],
  query: string,
): ChatNavigationNode[] {
  if (!query.trim()) {
    return nodes;
  }

  const lowerQuery = query.toLowerCase();

  return nodes
    .map((node) => {
      const labelMatch = node.label.toLowerCase().includes(lowerQuery);
      // 先递归过滤子节点（只返回子节点中真正命中搜索词的部分）
      const filteredChildren = node.children ? filterNavigationNodes(node.children, query) : [];

      if (filteredChildren.length > 0) {
        // 子节点中有命中的：展示父节点 + 命中的子节点（不展示未命中的子节点）
        return { ...node, children: filteredChildren };
      }
      if (labelMatch) {
        // nav2 修复：仅父节点 label 命中时，只展示该节点本身，
        // 不暴露其全部子节点（避免搜索「全部」暴露所有历史会话名）
        return { ...node, children: undefined };
      }
      return null;
    })
    .filter(Boolean) as ChatNavigationNode[];
}

// 注意：ChatNavState 和 loadAllAgentChannelBindings 已移除
// channelBindings 现在由后端 agent.list RPC 直接返回，不再需要单独加载
