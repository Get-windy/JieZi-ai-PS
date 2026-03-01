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
} from "../types.ts";
import type { GroupInfo, GroupsListResult } from "../views/groups.ts";
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
  const { agents, channelsSnapshot, groups, friends } = options;

  // === 防御性默认值处理 ===
  const agentList = agents?.agents ?? [];
  const defaultId = agents?.defaultId ?? "main";
  const defaultAgent = agentList.find((a) => a.id === defaultId) ?? agentList[0];
  const defaultSessionKey = defaultAgent ? `${defaultAgent.id}:main` : "main:main";

  // 通道数据默认值
  const channelOrder = channelsSnapshot?.channelOrder ?? [];
  const channelAccounts = channelsSnapshot?.channelAccounts ?? {};
  const channelLabels = channelsSnapshot?.channelLabels ?? {};

  // 群组 & 好友数据默认值
  const groupList = groups?.groups ?? [];
  const friendList = Array.isArray(friends) ? friends : [];

  // 顶层节点数组
  const rootNodes: ChatNavigationNode[] = [];

  // ---- 顶级: 📊 全部 ----
  rootNodes.push({
    id: "__all__",
    label: "全部",
    icon: "📊",
    nodeType: "root",
    context: {
      type: "all",
      sessionKey: defaultSessionKey,
    },
  });

  // ---- 每个智能体生成一棵子树 ----
  for (const agent of agentList) {
    const agentName = agent.identity?.name || agent.name || agent.id;
    const agentEmoji = agent.identity?.emoji || "🤖";
    const agentSessionKey = `${agent.id}:main`;
    const agentChildren: ChatNavigationNode[] = [];

    // 1) 📋 全部（该智能体所有消息）
    agentChildren.push({
      id: `agent-all-${agent.id}`,
      label: "全部",
      icon: "📋",
      nodeType: "item",
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
    );
    if (channelItems.length > 0) {
      // “全部通道” 聚合节点
      const allChannelsNode: ChatNavigationNode = {
        id: `channels-all-${agent.id}`,
        label: "全部通道",
        icon: "📦",
        nodeType: "item",
        context: {
          type: "channels-all",
          agentId: agent.id,
          agentName,
          sessionKey: agentSessionKey,
        },
      };

      agentChildren.push({
        id: `channels-${agent.id}`,
        label: "通道",
        icon: "📱",
        nodeType: "category",
        context: allChannelsNode.context,
        children: [allChannelsNode, ...channelItems],
      });
    }

    // 3) 👥 群聊（将所有群组关联到每个 agent，因为 group 是协作性资源）
    if (groupList.length > 0) {
      const groupItems: ChatNavigationNode[] = groupList.map((group) => ({
        id: `group-${agent.id}-${group.id}`,
        label: group.name,
        icon: "💬",
        nodeType: "item" as const,
        context: {
          type: "group" as const,
          agentId: agent.id,
          groupId: group.id,
          groupName: group.name,
          memberAgentIds: group.members.map((m) => m.agentId),
          sessionKey: `${agent.id}:group:${group.id}`,
        },
      }));

      agentChildren.push({
        id: `groups-${agent.id}`,
        label: "群聊",
        icon: "👥",
        nodeType: "category",
        context: groupItems[0].context,
        children: groupItems,
      });
    }

    // 4) 🤝 好友
    if (friendList.length > 0) {
      const friendItems: ChatNavigationNode[] = friendList.map((friend) => ({
        id: `friend-${agent.id}-${friend.id}`,
        label: friend.agentName || friend.agentId,
        icon: "🤖",
        nodeType: "item" as const,
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

    // 智能体根节点
    rootNodes.push({
      id: `agent-${agent.id}`,
      label: agentName,
      icon: agentEmoji,
      nodeType: "agent",
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

  return rootNodes;
}

// ============ 某个智能体的通道项 ============

/**
 * 构建某个智能体绑定的通道节点列表
 *
 * @param agent - 智能体信息
 * @param channelOrder - 所有通道ID列表（排序）
 * @param channelAccounts - 所有通道的账号信息
 * @param channelLabels - 通道显示名称映射
 * @param agentBindings - 该智能体绑定的通道账号列表（用于过滤）
 */
function buildAgentChannelItems(
  agent: { id: string; name?: string; identity?: { name?: string; emoji?: string } },
  channelOrder: string[],
  channelAccounts: Record<string, Array<{ accountId: string; name?: string | null }>>,
  channelLabels: Record<string, string>,
  agentBindings: AgentChannelBinding[],
): ChatNavigationNode[] {
  const items: ChatNavigationNode[] = [];

  // 如果没有绑定信息，不显示任何通道（而不是显示所有通道）
  if (agentBindings.length === 0) {
    return items;
  }

  // 将绑定列表转换为 Set 以便快速查找
  const bindingSet = new Set(agentBindings.map((b) => `${b.channelId}:${b.accountId}`));

  for (const channelId of channelOrder) {
    const accounts = channelAccounts[channelId] ?? [];
    
    for (const account of accounts) {
      const accountId = account.accountId;
      const bindingKey = `${channelId}:${accountId}`;

      // 只显示该智能体绑定的通道账号
      const isMatched = bindingSet.has(bindingKey);
      
      if (!isMatched) {
        continue;
      }

      const accountName = account.name ?? accountId;
      const channelLabel = channelLabels[channelId] ?? getChannelDisplayName(channelId);

      const item: ChatNavigationNode = {
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
          sessionKey: `${agent.id}:channel:${channelId}:${accountId}`,
        },
      };
      
      items.push(item);
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
  if (!a || !b) {return false;}
  if (a.type !== b.type) {return false;}
  return a.sessionKey === b.sessionKey;
}

/**
 * 根据 sessionKey 解析出 ConversationContext 的类型
 */
export function resolveContextType(
  sessionKey: string,
): "agent-direct" | "channel-observe" | "group" | "contact" {
  if (sessionKey.includes(":channel:")) {return "channel-observe";}
  if (sessionKey.includes(":group:")) {return "group";}
  if (sessionKey.includes(":contact:")) {return "contact";}
  return "agent-direct";
}

/**
 * 从 sessionKey 创建默认的 ConversationContext
 */
export function createDefaultContext(sessionKey: string): ChatConversationContext {
  const contextType = resolveContextType(sessionKey);
  const parts = sessionKey.split(":");

  switch (contextType) {
    case "channel-observe":
      return {
        type: "channel-observe",
        agentId: parts[0],
        channelId: parts[2] ?? "",
        accountId: parts[3] ?? "",
        sessionKey,
      };
    case "group":
      return {
        type: "group",
        groupId: parts[2] ?? "",
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
        agentId: parts[0] ?? "main",
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
    if (node.context.sessionKey === sessionKey) {return node;}
    if (node.children) {
      const found = findNodeBySessionKey(node.children, sessionKey);
      if (found) {return found;}
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
  if (!query.trim()) {return nodes;}

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
