import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
import { icons } from "../icons.ts";
import { detectTextDirection } from "../text-direction.ts";
import type {
  AgentsListResult,
  SessionsListResult,
  ChatNavigationNode,
  ChatConversationContext,
} from "../types.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import { renderChatNavigationTree } from "./chat-navigation-tree.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

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
};

const COMPACTION_TOAST_DURATION_MS = 5000;
const FALLBACK_TOAST_DURATION_MS = 8000;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="compaction-indicator compaction-indicator--active" role="status" aria-live="polite">
        ${icons.loader} Compacting context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="compaction-indicator compaction-indicator--complete" role="status" aria-live="polite">
          ${icons.check} Context compacted
        </div>
      `;
    }
  }

  return nothing;
}

function renderFallbackIndicator(status: FallbackIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  const phase = status.phase ?? "active";
  const elapsed = Date.now() - status.occurredAt;
  if (elapsed >= FALLBACK_TOAST_DURATION_MS) {
    return nothing;
  }
  const details = [
    `Selected: ${status.selected}`,
    phase === "cleared" ? `Active: ${status.selected}` : `Active: ${status.active}`,
    phase === "cleared" && status.previous ? `Previous fallback: ${status.previous}` : null,
    status.reason ? `Reason: ${status.reason}` : null,
    status.attempts.length > 0 ? `Attempts: ${status.attempts.slice(0, 3).join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const message =
    phase === "cleared"
      ? `Fallback cleared: ${status.selected}`
      : `Fallback active: ${status.active}`;
  const className =
    phase === "cleared"
      ? "compaction-indicator compaction-indicator--fallback-cleared"
      : "compaction-indicator compaction-indicator--fallback";
  const icon = phase === "cleared" ? icons.check : icons.brain;
  return html`
    <div
      class=${className}
      role="status"
      aria-live="polite"
      title=${details}
    >
      ${icon} ${message}
    </div>
  `;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) {
    return;
  }

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img"
            />
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

/**
 * 解析当前对话的标题和参与者列表
 */
function resolveConversationInfo(
  context: ChatConversationContext | null,
  agentsList: AgentsListResult | null | undefined,
  assistantName: string,
): {
  title: string;
  icon: string;
  participants: Array<{ id: string; label: string; emoji: string; isUser?: boolean }>;
} {
  const allAgents = agentsList?.agents ?? [];

  function getAgentLabel(agentId: string): string {
    const found = allAgents.find((a) => a.id === agentId);
    return found?.identity?.name ?? found?.name ?? agentId;
  }

  function getAgentEmoji(agentId: string): string {
    const found = allAgents.find((a) => a.id === agentId);
    return found?.identity?.emoji ?? "🤖";
  }

  const youParticipant = { id: "__you__", label: "You", emoji: "👤", isUser: true };

  if (!context) {
    return {
      title: assistantName,
      icon: "🤖",
      participants: [{ id: "main", label: assistantName, emoji: "🤖" }, youParticipant],
    };
  }

  switch (context.type) {
    case "agent-direct":
    case "agent-all": {
      const name = context.agentName ?? getAgentLabel(context.agentId);
      const emoji = context.agentEmoji ?? getAgentEmoji(context.agentId);
      return {
        title: name,
        icon: emoji,
        participants: [{ id: context.agentId, label: name, emoji }, youParticipant],
      };
    }
    case "channel-observe": {
      const agentName = context.agentName ?? getAgentLabel(context.agentId);
      const emoji = getAgentEmoji(context.agentId);
      const channelLabel = context.channelName ?? context.channelId;
      return {
        title: `${agentName} · ${channelLabel}`,
        icon: "📡",
        participants: [{ id: context.agentId, label: agentName, emoji }, youParticipant],
      };
    }
    case "group": {
      const memberIds = context.memberAgentIds ?? [];
      const participants = memberIds.map((id) => ({
        id,
        label: getAgentLabel(id),
        emoji: getAgentEmoji(id),
      }));
      // 如果没有成员列表，尝试从所有已知 agents 取
      if (participants.length === 0 && allAgents.length > 0) {
        allAgents.forEach((a) => {
          participants.push({ id: a.id, label: getAgentLabel(a.id), emoji: getAgentEmoji(a.id) });
        });
      }
      participants.push(youParticipant);
      return {
        title: context.groupName ?? `群组·${context.groupId}`,
        icon: "👥",
        participants,
      };
    }
    case "contact": {
      const contactName = context.contactAgentName ?? getAgentLabel(context.contactAgentId);
      const contactEmoji = getAgentEmoji(context.contactAgentId);
      const agentName = getAgentLabel(context.agentId);
      const agentEmoji = getAgentEmoji(context.agentId);
      return {
        title: `${agentName} ↔️ ${contactName}`,
        icon: "💬",
        participants: [
          { id: context.agentId, label: agentName, emoji: agentEmoji },
          { id: context.contactAgentId, label: contactName, emoji: contactEmoji },
          youParticipant,
        ],
      };
    }
    case "all": {
      const participants = allAgents.map((a) => ({
        id: a.id,
        label: getAgentLabel(a.id),
        emoji: getAgentEmoji(a.id),
      }));
      participants.push(youParticipant);
      return { title: "所有对话", icon: "🌐", participants };
    }
    case "channels-all": {
      const name = context.agentName ?? getAgentLabel(context.agentId);
      const emoji = getAgentEmoji(context.agentId);
      return {
        title: `${name} · 所有通道`,
        icon: "📡",
        participants: [{ id: context.agentId, label: name, emoji }, youParticipant],
      };
    }
    case "session-history": {
      return {
        title: context.displayName ?? context.sessionKey,
        icon: "📜",
        participants: [youParticipant],
      };
    }
    default:
      return { title: assistantName, icon: "🤖", participants: [youParticipant] };
  }
}

/**
 * 渲染考话顶部参与者栏（Discord/Slack 风格）
 */
function renderChatParticipantsBar(props: ChatProps) {
  const { title, icon, participants } = resolveConversationInfo(
    props.navCurrentContext,
    props.agentsList,
    props.assistantName,
  );

  const MAX_VISIBLE = 5;
  const visible = participants.slice(0, MAX_VISIBLE);
  const overflow = participants.length - MAX_VISIBLE;

  return html`
    <div class="chat-participants-bar">
      <div class="chat-participants-bar__title">
        <span class="chat-participants-bar__icon">${icon}</span>
        <span class="chat-participants-bar__name">${title}</span>
      </div>
      <div class="chat-participants-bar__members">
        <span class="chat-participants-bar__label">成员</span>
        <div class="chat-participants-bar__avatars">
          ${visible.map(
            (p) => html`
              <div
                class="chat-participant-avatar ${p.isUser ? "chat-participant-avatar--you" : ""}"
                title=${p.label}
              >
                ${p.emoji}
              </div>
            `,
          )}
          ${
            overflow > 0
              ? html`<div class="chat-participant-avatar chat-participant-avatar--overflow" title="还有${overflow}位成员">+${overflow}</div>`
              : nothing
          }
        </div>
        <span class="chat-participants-bar__count">${participants.length}人</span>
      </div>
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const isChannelObserve = props.navCurrentContext?.type === "channel-observe";
  const isContactView = props.navCurrentContext?.type === "contact";
  const isReadOnly = (isChannelObserve && !props.navChannelForceJoined) || isContactView;

  const canCompose = props.connected && !isReadOnly;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : "Message (↩ to send, Shift+↩ for line breaks, paste images)"
    : "Connect to the gateway to start chatting…";

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
    >
      ${
        props.loading
          ? html`
              <div class="muted">Loading chat…</div>
            `
          : nothing
      }
      ${repeat(
        buildChatItems(props),
        (item) => item.key,
        (item) => {
          if (item.kind === "divider") {
            return html`
              <div class="chat-divider" role="separator" data-ts=${String(item.timestamp)}>
                <span class="chat-divider__line"></span>
                <span class="chat-divider__label">${item.label}</span>
                <span class="chat-divider__line"></span>
              </div>
            `;
          }

          if (item.kind === "reading-indicator") {
            return renderReadingIndicatorGroup(assistantIdentity);
          }

          if (item.kind === "stream") {
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
            );
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              showReasoning,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
            });
          }

          return nothing;
        },
      )}
    </div>
  `;

  return html`
    <section class="card chat">
      <div class="chat-with-nav">
        <!-- 左侧导航树 -->
        <div class="chat-nav-sidebar">
          ${renderChatNavigationTree({
            nodes: props.navNodes,
            currentContext: props.navCurrentContext,
            expandedNodeIds: props.navExpandedNodeIds,
            searchQuery: props.navSearchQuery,
            channelForceJoined: props.navChannelForceJoined,
            loading: props.navLoading,
            error: props.navError,
            onRetry: props.onNavRetry,
            onSelectContext: props.onNavSelectContext,
            onToggleNode: props.onNavToggleNode,
            onSearchChange: props.onNavSearchChange,
            onChannelForceJoinToggle: props.onNavChannelForceJoinToggle,
          })}
        </div>

        <!-- 右侧聊天主区域 -->
        <div class="chat-main-area">
          ${renderChatParticipantsBar(props)}
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      ${
        props.focusMode
          ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
          : nothing
      }

      ${
        isContactView
          ? html`
            <div class="chat-readonly-bar">
              <span>💬 直接会话（只读）：正在查看与 ${
                (props.navCurrentContext as { contactAgentName?: string } | null)
                  ?.contactAgentName ?? "Agent"
              } 的直接会话记录。如需发送消息，请由 Agent 调用 <code>agent_communicate</code> 工具。</span>
            </div>
          `
          : nothing
      }

      ${
        isReadOnly && isChannelObserve
          ? html`
            <div class="chat-readonly-bar">
              <span>👁️ 通道观察模式（只读）：正在观察 ${(props.navCurrentContext as { channelName?: string } | null)?.channelName ?? "通道"} 的消息</span>
              <button
                class="btn btn--sm"
                type="button"
                @click=${props.onNavChannelForceJoinToggle}
              >
                🔧 强行接入
              </button>
            </div>
          `
          : nothing
      }

      ${
        isChannelObserve && props.navChannelForceJoined
          ? html`
            <div class="chat-force-joined-bar">
              <span>⚠️ 您正在以管理员身份直接回复通道消息，请谨慎操作</span>
              <button
                class="btn btn--sm"
                type="button"
                @click=${props.onNavChannelForceJoinToggle}
              >
                退出接入
              </button>
            </div>
          `
          : nothing
      }

      <div
        class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}"
      >
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${
          sidebarOpen
            ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                  },
                })}
              </div>
            `
            : nothing
        }
      </div>

      ${
        props.queue.length
          ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">Queued (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${
                          item.text ||
                          (item.attachments?.length ? `Image (${item.attachments.length})` : "")
                        }
                      </div>
                      <button
                        class="btn chat-queue__remove"
                        type="button"
                        aria-label="Remove queued message"
                        @click=${() => props.onQueueRemove(item.id)}
                      >
                        ${icons.x}
                      </button>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : nothing
      }

      ${renderFallbackIndicator(props.fallbackStatus)}
      ${renderCompactionIndicator(props.compactionStatus)}

      ${
        props.showNewMessages
          ? html`
            <button
              class="btn chat-new-messages"
              type="button"
              @click=${props.onScrollToBottom}
            >
              New messages ${icons.arrowDown}
            </button>
          `
          : nothing
      }

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>Message</span>
            <textarea
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              dir=${detectTextDirection(props.draft)}
              ?disabled=${!canCompose}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") {
                  return;
                }
                if (e.isComposing || e.keyCode === 229) {
                  return;
                }
                if (e.shiftKey) {
                  return;
                } // Allow Shift+Enter for line breaks
                if (!canCompose) {
                  return;
                }
                e.preventDefault();
                if (canCompose) {
                  props.onSend();
                }
              }}
              @input=${(e: Event) => {
                const target = e.target as HTMLTextAreaElement;
                adjustTextareaHeight(target);
                props.onDraftChange(target.value);
              }}
              @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
              placeholder=${composePlaceholder}
            ></textarea>
          </label>
          <div class="chat-compose__actions">
            <button
              class="btn"
              ?disabled=${!canCompose || (!canAbort && props.sending)}
              @click=${canAbort ? props.onAbort : props.onNewSession}
            >
              ${canAbort ? "Stop" : "New session"}
            </button>
            <button
              class="btn primary"
              ?disabled=${!canCompose}
              @click=${props.onSend}
            >
              ${isBusy ? "Queue" : "Send"}<kbd class="btn-kbd">↵</kbd>
            </button>
          </div>
        </div>
      </div>
        </div><!-- .chat-main-area -->
      </div><!-- .chat-with-nav -->
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);
    const raw = msg as Record<string, unknown>;
    const marker = raw.__openclaw as Record<string, unknown> | undefined;
    if (marker && marker.kind === "compaction") {
      items.push({
        kind: "divider",
        key:
          typeof marker.id === "string"
            ? `divider:compaction:${marker.id}`
            : `divider:compaction:${normalized.timestamp}:${i}`,
        label: "Compaction",
        timestamp: normalized.timestamp ?? Date.now(),
      });
      continue;
    }

    if (!props.showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  if (props.showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
