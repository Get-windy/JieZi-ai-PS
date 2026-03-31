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
  // ============ 参与者列表 ============
  /** 所有 agents 列表，用于渲染参与者头部 */
  agentsList?: AgentsListResult | null;
  /** Context window usage info for warning bar */
  contextUsage?: ContextUsageInfo | null;
};
