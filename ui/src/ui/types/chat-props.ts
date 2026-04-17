import type { ContextUsageInfo } from "../chat/context-warning.ts";
/**
 * Shared type definitions for chat component props.
 * Extracted to avoid circular dependencies between chat sub-modules.
 */
import type {
  AgentsListResult,
  SessionsListResult,
  ChatNavigationNode,
  ChatConversationContext,
} from "../types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type FallbackIndicatorStatus = {
  phase?: "active" | "cleared";
  selected: string;
  active: string;
  previous?: string;
  reason?: string;
  attempts: string[];
  occurredAt: number;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionIndicatorStatus | null;
  fallbackStatus?: FallbackIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
  /**
   * 多 Agent 并发流式支持（Open WebUI / AutoGen Studio 最佳实践）
   * key = agentId 或 sessionKey，value = 该 agent 的当前流式输出状态
   * 与原 props.stream 共存（向下兼容），单 agent 场景仅设置 props.stream，
   * 多 agent 群组场景建议设置 props.streams
   */
  streams?: Map<string, { text: string; startedAt: number; senderName?: string }>;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  // Scroll control
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  /**
   * Reply Quote 打通：发送时将当前引用状态附加到消息元数据
   * replyText: 被引用消息摘要，replyWho: 发言者名
   * 后端可将此信息写入消息的 replyTarget 字段
   */
  onSendWithReply?: (replyText: string, replyWho: string) => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: () => void;
  /** 对抗-P1：解耦 /compact 命令，直接触发压缩而不修改 draft */
  onCompact?: () => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  // ============ 导航树相关 ============
  navNodes: ChatNavigationNode[];
  navCurrentContext: ChatConversationContext | null;
  navExpandedNodeIds: Set<string>;
  navSearchQuery: string;
  navChannelForceJoined: boolean;
  navLoading?: boolean;
  navError?: string | null;
  onNavRetry?: () => void;
  onNavSelectContext: (context: ChatConversationContext) => void;
  onNavToggleNode: (nodeId: string) => void;
  onNavSearchChange: (query: string) => void;
  onNavChannelForceJoinToggle: () => void;
  /**
   * 导航树会话重命名回调（参考 Helix SessionToolbar.tsx）
   * sessionKey: 目标会话 key
   * newName: 新名称
   */
  onNavRenameSession?: (sessionKey: string, newName: string) => void;
  // ============ 参与者列表 ============
  /** 所有 agents 列表，用于渲染参与者头部 */
  agentsList?: AgentsListResult | null;
  /** Context window usage info for warning bar */
  contextUsage?: ContextUsageInfo | null;
  /** Whether to show tool call messages inline */
  showToolCalls?: boolean;
  /** Stream segments (for tool-aware streaming) */
  streamSegments?: Array<{ text: string; ts: number }>;
  /** Base path for resolving avatar URLs */
  basePath?: string;
  /** Callback to delete a message group */
  onDeleteMessage?: () => void;
  /** Callback when user requests update */
  onRequestUpdate?: () => void;
  /** Context window size in tokens (for meta display) */
  contextWindow?: number | null;
  /**
   * 消息编辑回调（参考 Helix AI Edit & Regenerate）
   * messageIndex: 消息在 messages 数组中的下标
   * newText: 用户编辑后的新内容
   * 实现：删除该条及之后的所有消息，再以新内容重新发送
   */
  onEditMessage?: (messageIndex: number, newText: string) => void;
};
