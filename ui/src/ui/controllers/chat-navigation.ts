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
  discord: "💬",
  telegram: "✈️",
  dingtalk: "📞",
  slack: "📧",
  whatsapp: "💚",
  signal: "🔒",
  imessage: "💬",
  nostr: "🟣",
  googlechat: "💬",
  msteams: "💼",
  line: "💚",
  wechat: "💬",
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
 * 结构（匹配设计文档 2.2）：
 * 📊 全部 (聚合所有智能体消息)
 * ├─ 🤖 智能助手 A (main)
 * │  ├─ 📋 全部 (该智能体所有消息)
 * │  ├─ 📱 通道 ▼
 * │  │  ├─ 📦 全部通道 (聚合)
 * │  │  ├─ 💬 Discord - 服务器A
 * │  │  └─ ✈️ Telegram - 个人助手
 * │  ├─ 👥 群聊 ▼
 * │  │  ├─ 💼 研发团队群
 * │  │  └─ 🎨 产品讨论组
 * │  └─ 🤝 好友 ▼
 * │     ├─ 🤖 智能助手B
 * │     └─ 🤖 智能助手C
 * ├─ 🤖 智能助手 B
 * └─ 🤖 智能助手 C
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
  const sessionChildNodes: ChatNavigationNode[] = [
    ...activeUnreadSessions.map(makeSessionHistoryNode),
    ...activeSessions
      .filter((s) => !(unread[s.key] > 0))
      .slice(0, Math.max(0, MAX_SESSION_PREVIEW - activeUnreadSessions.length))
      .map(makeSessionHistoryNode),
  ];

  rootNodes.push({
    id: "__all__",
    label: "全部会话",
    icon: "📊",
    nodeType: "root",
    unreadCount: sumAllUnread(),
    context: {
      type: "all",
      sessionKey: defaultSessionKey,
    },
    children: sessionChildNodes.length > 0 ? sessionChildNodes : undefined,
  });

  // ---- 每个智能体生成一棵子树 ----
  for (const agent of agentList) {
    const agentName = agent.identity?.name || agent.name || agent.id;
    const agentEmoji = agent.identity?.emoji || "🤖";
    const agentSessionKey = `agent:${agent.id}:main`;
    const agentChildren: ChatNavigationNode[] = [];

    // 1) 📋 全部（该智能体所有消息）
    agentChildren.push({
      id: `agent-all-${agent.id}`,
      label: "全部",
      icon: "📋",
      nodeType: "item",
      unreadCount: sumUnreadByPrefix(`agent:${agent.id}:`),
      context: {
        type: "agent-all",
        agentId: agent.id,
        agentName,
        agentEmoji,
        sessionKey: agentSessionKey,
      },
    });

    // 2) 📱 通道（只显示该智能体绑定的通道，直接从 agent.channelBindings 获取）
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
        label: "通道",
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

    // 3) 🤝 好友（群聊已移至顶级独立栏目，不再挂在 agent 子树下）
    if (friendList.length > 0) {
      const friendItems: ChatNavigationNode[] = friendList.map((friend) => ({
        id: `friend-${agent.id}-${friend.id}`,
        label: friend.agentName || friend.agentId,
        icon: "🤖",
        nodeType: "item" as const,
        unreadCount: getUnread(`${agent.id}:contact:${friend.agentId}`),
        context: {
          type: "contact" as const,
          agentId: agent.id,
          contactAgentId: friend.agentId,
          contactAgentName: friend.agentName || friend.agentId,
          sessionKey: `${agent.id}:contact:${friend.agentId}`,
        },
      }));

      agentChildren.push({
        id: `friends-${agent.id}`,
        label: "好友",
        icon: "🤝",
        nodeType: "category",
        context: friendItems[0].context,
        children: friendItems,
      });
    }

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

    const groupsRootContext = groupItems[0]?.context ?? {
      type: "agent-direct" as const,
      agentId: groupAgentId,
      sessionKey: `agent:${groupAgentId}:main:main`,
    };

    rootNodes.push({
      id: "groups-root",
      label: "群聊",
      icon: "👥",
      nodeType: "category",
      unreadCount: sumUnreadByPrefix(`agent:${groupAgentId}:group:`),
      context: groupsRootContext,
      children: groupItems.length > 0 ? groupItems : undefined,
    });
    console.log(
      `[NavTree:调试] 群聊节点已加入rootNodes，groups数量=${groupItems.length}，总节点数=${rootNodes.length}`,
    );
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
  // 调试：打印 sessions.list 里所有通道会话的 lastChannel/lastAccountId
  if (sessionsResult?.sessions) {
    const channelSessions = sessionsResult.sessions.filter((s) => s.lastChannel || s.channel);
    console.log(
      `[NavTree:调试] sessions.list 通道相关会话数=${channelSessions.length}，channelSessionMap keys=`,
      [...channelSessionMap.keys()],
      "\n前5条:",
      channelSessions.slice(0, 5).map((s) => ({
        key: s.key,
        lastChannel: s.lastChannel,
        lastAccountId: s.lastAccountId,
        channel: s.channel,
      })),
    );
  }

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

      // 调试：打印匹配情况
      console.log(
        `[NavTree:调试] 通道匹配 channelId=${channelId} accountId=${accountId} bindingKey=${bindingKey}`,
        `\n  matchedSessions数=${matchedSessions.length} agentSessions数=${agentSessions.length}`,
        `\n  channelSessionMap中的key: feishu:xxx =`,
        [...channelSessionMap.entries()]
          .filter(([k]) => k.startsWith(channelId))
          .map(([k, v]) => ({ key: k, sessions: v.map((s) => s.key) })),
      );

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
 *   好友：    {agentId}:contact:{contactId}
 */
export function resolveContextType(
  sessionKey: string,
): "agent-direct" | "channel-observe" | "group" | "contact" {
  // 第一段必须是 agent 才处理通道
  if (!sessionKey.startsWith("agent:")) {
    if (sessionKey.includes(":contact:")) {
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
      const filteredChildren = node.children ? filterNavigationNodes(node.children, query) : [];

      if (labelMatch || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        };
      }
      return null;
    })
    .filter(Boolean) as ChatNavigationNode[];
}

// 注意：ChatNavState 和 loadAllAgentChannelBindings 已移除
// channelBindings 现在由后端 agent.list RPC 直接返回，不再需要单独加载
