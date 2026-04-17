/**
 * Chat view — slim orchestrator.
 *
 * Imports sub-modules for monitor, header, compose, thread and wires them
 * together inside the main `renderChat` template.
 */
import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import {
  renderParticipantsPanel,
  buildParticipants,
  extractActiveSenderIds,
} from "../chat/chat-participants-panel.ts";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
  renderReplyQuoteCard,
  renderGroupTypingIndicators,
} from "../chat/grouped-render.ts";
import { detectMentionToken, openMentionDropdown, closeMentionDropdown } from "../chat/mention.ts";
import type { MentionCandidate } from "../chat/mention.ts";
import { initMessageSearch, isSearchOpen, focusSearchBar } from "../chat/message-search.ts";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";
import { detectTextDirection } from "../text-direction.ts";
import { renderChatNavigationTree } from "./chat-navigation-tree.ts";
import "../components/resizable-divider.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";

// Re-export shared types for backwards compatibility
export type {
  ChatProps,
  CompactionIndicatorStatus,
  FallbackIndicatorStatus,
} from "../types/chat-props.ts";
import {
  renderContextWarning,
  getUsageRatio,
  renderTokenProgressBar,
} from "../chat/context-warning.ts";
import { handleDragOver, handleDragLeave, handleDrop } from "../chat/drag-drop.ts";
import { chatInputHistory, getInputHistory } from "../chat/input-history.ts";
import { initSidebarResize, getSavedSidebarWidth } from "../chat/sidebar-resize.ts";
import {
  detectSlashToken,
  filterSlashCommands,
  getBuiltinSlashCommands,
  renderSlashDropdown,
  slashUsageTracker,
} from "../chat/slash-commands.ts";
import type { SlashCommand } from "../chat/slash-commands.ts";
import type { ChatProps } from "../types/chat-props.ts";
import { adjustTextareaHeight, handlePaste, renderAttachmentPreview } from "./chat-compose.ts";
import {
  resolveConversationInfo,
  renderChatParticipantsInline,
  renderCompactionIndicator,
  renderFallbackIndicator,
  renderDeptIsolationWarning,
} from "./chat-header.ts";
// Sub-module imports
import { renderMonitorView, isMonitorContext } from "./chat-monitor.ts";
import { buildChatItems } from "./chat-thread.ts";

// Re-export functions used by external modules
export { resolveConversationInfo, renderChatParticipantsInline };

/**
 * 切换 tab 时重置聊天视图临时状态（导入历史、斜杠轮换 UI 等）
 * 上游版本会停止 STT 并清空临时状态，本地版本无状态需要重置。
 */
// ── Module-level reply state (Discord-style Reply Quote) ────────────────
// Since renderChat is a pure function, we store reply state at module level.
// It resets on context change (resetChatViewState) or on explicit clear.
const _replyState: { replyText: string; replyWho: string } = {
  replyText: "",
  replyWho: "",
};
function _getReplyState() {
  return _replyState;
}

export function resetChatViewState(): void {
  // 本地 chat 视图不使用上游的模块内状态，暂无需要重置
  _replyState.replyText = "";
  _replyState.replyWho = "";
}

/** @deprecated 居用 resetChatViewState */
export const cleanupChatModuleState = resetChatViewState;

export function renderChat(props: ChatProps) {
  // 调试日志：记录 Chat 渲染关键状态
  if (
    typeof window !== "undefined" &&
    (window as unknown as { __DEBUG_UI__?: boolean }).__DEBUG_UI__
  ) {
    console.log("[DEBUG:Chat] renderChat called with:", {
      connected: props.connected,
      loading: props.loading,
      sending: props.sending,
      sessionKey: props.sessionKey,
      messagesCount: props.messages?.length ?? 0,
      agentsListCount: props.agentsList?.agents?.length ?? 0,
      navNodesCount: props.navNodes?.length ?? 0,
      navLoading: props.navLoading,
      navError: props.navError,
      error: props.error,
    });
  }

  // 监控视图路由：contact / all / agent-all 使用专属监控面板
  if (isMonitorContext(props.navCurrentContext)) {
    return html`
      <section class="card chat">
        <div class="chat-with-nav">
          <!-- 左侧导航树 -->
          <div class="chat-nav-sidebar" style="--nav-sidebar-width:${getSavedSidebarWidth()}px">
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
            <div class="chat-nav-resize-handle" @mousedown=${initSidebarResize}></div>
          </div>
          <!-- 右侧监控面板 -->
          <div class="chat-main-area">
            ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
            ${renderMonitorView(props)}
          </div>
        </div>
      </section>
    `;
  }

  const isChannelObserve = props.navCurrentContext?.type === "channel-observe";
  const isContactView = props.navCurrentContext?.type === "contact";
  // dept-room 非成员或 dept-broadcast 非管理员 → 只读
  const isDeptRoom = props.navCurrentContext?.type === "dept-room";
  const isDeptBroadcast = props.navCurrentContext?.type === "dept-broadcast";
  const isDeptReadOnly =
    (isDeptRoom &&
      (props.navCurrentContext as { isMember?: boolean } | null)?.isMember === false) ||
    (isDeptBroadcast && !(props.navCurrentContext as { isAdmin?: boolean } | null)?.isAdmin);
  const isReadOnly =
    (isChannelObserve && !props.navChannelForceJoined) || isContactView || isDeptReadOnly;

  // canSend 来自后端能力判断（如 agent 未就绪、rate-limit 等），必须和前端 canCompose 同时满足
  // 对抗-P0：原代码中 props.canSend 存在于 props 但从未被消费，相当于权限字段形同虚设
  const canCompose = props.connected && !isReadOnly && props.canSend;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);

  // 对抗-P7 修复：按 sessionKey 隔离的输入历史，避免跨部门/跨会话历史混用
  // 原全局单例 chatInputHistory 已废弃，改用 getInputHistory(sessionKey)
  const inputHistory = getInputHistory(props.sessionKey ?? "__default__");

  // 对抗-P0：节流防抖，防止用户连点发送按钮造成大量重复请求
  // 使用 data attribute 在 DOM 层面做 300ms 节流（无需引入额外状态）
  const handleSendThrottled = (e: Event) => {
    const btn = e.currentTarget as HTMLElement;
    if (btn.dataset.sending === "1") {
      return;
    }
    btn.dataset.sending = "1";
    inputHistory.add(props.draft);
    // Reply Quote 打通：发送时如有引用状态，先通知后端附加 replyTarget 元数据
    const replySnapshot = _getReplyState();
    if (replySnapshot.replyText && props.onSendWithReply) {
      props.onSendWithReply(replySnapshot.replyText, replySnapshot.replyWho);
    }
    // 清除引用状态（无论是否成功）
    replySnapshot.replyText = "";
    replySnapshot.replyWho = "";
    props.onSend();
    setTimeout(() => {
      delete btn.dataset.sending;
    }, 300);
  };
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? t("chat.placeholder.with_images")
      : t("chat.placeholder.connected")
    : t("chat.placeholder.disconnected");

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);

  // ── Reply Quote state (Discord-style) ─────────────────────────────────────
  // Reply quote state is stored in DOM data-attributes on the compose area
  // to avoid external state dependencies (same pattern as collapsible messages).
  // The reply card renders above the textarea via renderReplyQuoteCard().
  // We use a module-level WeakMap keyed by the chat-main-area element.
  const isGroupCtxForParticipants =
    props.navCurrentContext?.type === "dept-room" || props.navCurrentContext?.type === "group";

  // ── Participants panel data ────────────────────────────────────────────────
  const participants = isGroupCtxForParticipants
    ? buildParticipants(props.navCurrentContext, props.agentsList)
    : [];
  const activeSenderIds = isGroupCtxForParticipants
    ? extractActiveSenderIds(props.messages)
    : new Set<string>();
  // Agents that are currently streaming = the current stream sender if any
  const streamingSenderIds = new Set<string>();
  if (props.stream && props.navCurrentContext?.type === "group") {
    // For group contexts, the assistantName is the streaming sender
    if (props.assistantName) {
      streamingSenderIds.add(props.assistantName);
    }
  }
  // Multi-agent concurrent streaming: add all agents from props.streams
  if (props.streams && props.streams.size > 0 && isGroupCtxForParticipants) {
    for (const [agentId, streamState] of props.streams) {
      streamingSenderIds.add(streamState.senderName ?? agentId);
    }
  }

  // Slash command detection
  const slashToken = detectSlashToken(props.draft);
  const slashCommands =
    slashToken !== null
      ? filterSlashCommands(
          getBuiltinSlashCommands({
            onNewSession: props.onNewSession,
            onStop: props.onAbort,
            onClear: props.onDeleteSession,
            onCompact: () => {
              // 对抗-P1 修复：将 /compact 解耦为直接调用回调而非字符串注入 draft
              // 原实现将 "/compact" 写入 draft 再延迟触发 onSend，存在两个风险：
              // 1. setTimeout 间隙内如果组件卸载， props.onSend 已失效且不会报错
              // 2. draft 内容被覆盖，用户如果已经写了一半内容会丢失
              // 现在：山拥有 onCompact 回调，直接调用而不修改 draft
              props.onCompact?.();
            },
            onCopy: () => {
              // Copy last assistant message to clipboard
              const lastMsg = [...props.messages]
                .toReversed()
                .find((m: unknown) => (m as { role?: string }).role === "assistant");
              if (lastMsg) {
                const text = (lastMsg as { content?: string }).content ?? "";
                navigator.clipboard.writeText(text).catch(() => {
                  /* ignore */
                });
              }
            },
            onFocus: props.onToggleFocusMode,
            onStatus: () => {
              // Show context token usage as a brief status in the draft
              const usage = props.contextUsage;
              if (usage && usage.maxTokens > 0) {
                const ratio = getUsageRatio(usage);
                const pct = Math.round(ratio * 100);
                const usedK = Math.round(usage.usedTokens / 1000);
                const maxK = Math.round(usage.maxTokens / 1000);
                props.onDraftChange(`[Status] Context: ${pct}% (${usedK}k / ${maxK}k tokens)`);
              } else {
                props.onDraftChange("[Status] Context usage data not available");
              }
            },
          }),
          slashToken,
        )
      : [];
  const onSlashSelect = (cmd: SlashCommand) => {
    slashUsageTracker.recordUsage(cmd.name);
    const replacement = cmd.action();
    if (replacement !== null) {
      props.onDraftChange(replacement);
    }
  };

  const hasMessages = props.messages.length > 0 || props.stream !== null;

  // 方向3：断连检测警告——参考 Helix AI
  // streamStartedAt 超过 45s 且 stream 正在活跃（非 null），显示断连警告
  const STREAM_STALL_MS = 45_000;
  const isStreamStalled =
    props.stream !== null &&
    props.streamStartedAt !== null &&
    Date.now() - (props.streamStartedAt ?? 0) > STREAM_STALL_MS;

  const thread = html`
    <div class="chat-thread" role="log" aria-live="polite" @scroll=${props.onChatScroll}>
      ${props.loading
        ? html`
            <div class="chat-empty-state">
              <div class="muted">${t("chat.loading")}</div>
            </div>
          `
        : !hasMessages
          ? html`
              <div class="chat-empty-state">
                <div class="chat-empty-state__icon">💬</div>
                <div class="chat-empty-state__title">${t("chat.empty.title")}</div>
                <div class="chat-empty-state__desc">${t("chat.empty.desc")}</div>
                ${props.onRefresh
                  ? html`<button class="btn btn--sm" type="button" @click=${props.onRefresh}>
                      ${t("chat.empty.refresh")}
                    </button>`
                  : nothing}
              </div>
            `
          : nothing}
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
            // Support per-sender name for multi-agent concurrent streaming
            const multiSenderName = (item as unknown as { senderName?: string }).senderName;
            return renderReadingIndicatorGroup(
              multiSenderName ? { name: multiSenderName, avatar: null } : assistantIdentity,
              props.basePath,
            );
          }

          if (item.kind === "stream") {
            // Support per-sender name for multi-agent concurrent streaming
            const multiSenderName = (item as unknown as { senderName?: string }).senderName;
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
              props.basePath,
              multiSenderName,
            );
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              showReasoning,
              showToolCalls: props.showToolCalls,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
              basePath: props.basePath,
              contextWindow: props.contextWindow ?? null,
              onQuote: (quoted: string) => {
                // Inject quoted text at the start of the draft
                const current = props.draft.trim();
                const newDraft = current ? `${quoted}${current}` : quoted;
                props.onDraftChange(newDraft);
              },
              // Discord-style Reply Quote
              onReply: (replyText: string, replyWho: string) => {
                _replyState.replyText = replyText;
                _replyState.replyWho = replyWho;
                // Trigger re-render via synthetic event
                document.dispatchEvent(new CustomEvent("chat:reply-set"));
                // Focus compose textarea
                const ta = document.querySelector<HTMLTextAreaElement>(".chat-compose textarea");
                ta?.focus();
              },
              // Edit & Regenerate（方向1）
              // 通过匹配 group 内第一条消息的时间戳查找在 messages 中的真实索引
              onEditMessage: props.onEditMessage
                ? (newText: string) => {
                    const group = item;
                    const firstMsg = group.messages[0]?.message as
                      | Record<string, unknown>
                      | undefined;
                    const targetTs = firstMsg?.timestamp as number | undefined;
                    const msgIndex = targetTs
                      ? props.messages.findIndex(
                          (m) => (m as Record<string, unknown>).timestamp === targetTs,
                        )
                      : -1;
                    props.onEditMessage!(msgIndex >= 0 ? msgIndex : 0, newText);
                  }
                : undefined,
            });
          }

          return nothing;
        },
      )}
      ${isStreamStalled
        ? html`
            <div class="chat-stall-warning" role="alert" aria-live="assertive">
              <span class="chat-stall-warning__icon" aria-hidden="true">⚠️</span>
              <span class="chat-stall-warning__text">Agent 可能已断开连接，请稍候或尝试中断</span>
              ${props.onAbort
                ? html`<button
                    class="btn btn--xs chat-stall-warning__abort"
                    type="button"
                    @click=${props.onAbort}
                  >
                    中断
                  </button>`
                : nothing}
            </div>
          `
        : nothing}
      ${renderGroupTypingIndicators(
        Array.from(streamingSenderIds).filter((_id) => {
          // Only show typing for group contexts with multiple agents
          return isGroupCtxForParticipants;
        }),
        new Map(participants.map((p) => [p.id, p.name])),
      )}
    </div>
  `;

  // ── Participants panel (right-side floating) ─────────────────────────
  const participantsPanel = isGroupCtxForParticipants
    ? renderParticipantsPanel(participants, activeSenderIds, streamingSenderIds)
    : nothing;

  // ── Reply quote state (DOM-driven, module-level map) ──────────────────
  // We keep per-chat-main-area reply state in a WeakMap so it survives re-renders.
  const replyState = _getReplyState();
  const replyQuoteCard = replyState.replyText
    ? renderReplyQuoteCard(replyState.replyText, replyState.replyWho, () => {
        replyState.replyText = "";
        replyState.replyWho = "";
        // Trigger re-render by dispatching a synthetic event
        document.dispatchEvent(new CustomEvent("chat:reply-cleared"));
      })
    : nothing;

  return html`
    <section class="card chat">
      <div class="chat-with-nav">
        <!-- Mobile backdrop -->
        <div
          class="chat-nav-backdrop"
          @click=${(e: Event) => {
            const sidebar = (e.target as HTMLElement).parentElement?.querySelector(
              ".chat-nav-sidebar",
            );
            sidebar?.classList.remove("chat-nav-sidebar--open");
            (e.target as HTMLElement).classList.remove("chat-nav-backdrop--visible");
          }}
        ></div>
        <!-- 左侧导航树 -->
        <div class="chat-nav-sidebar" style="--nav-sidebar-width:${getSavedSidebarWidth()}px">
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
          <div class="chat-nav-resize-handle" @mousedown=${initSidebarResize}></div>
        </div>

        <!-- 右侧聊天主区域 -->
        <div
          class="chat-main-area"
          @dragover=${handleDragOver}
          @dragleave=${handleDragLeave}
          @drop=${(e: DragEvent) =>
            handleDrop(e, props.attachments ?? [], props.onAttachmentsChange)}
          @keydown=${(e: KeyboardEvent) => {
            // Ctrl/Cmd + F: 打开聊天内搜索（PinchChat 功能）
            if ((e.ctrlKey || e.metaKey) && e.key === "f" && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              const mainArea = e.currentTarget as HTMLElement;
              if (isSearchOpen()) {
                focusSearchBar();
                return;
              }
              initMessageSearch(mainArea, () => mainArea.querySelector(".chat-thread"));
            }
          }}
          tabindex="-1"
        >
          <!-- Drag-drop overlay -->
          <div class="chat-dropzone">
            <span class="chat-dropzone__label">${t("chat.dropzone.label")}</span>
            <span class="chat-dropzone__hint">${t("chat.dropzone.hint")}</span>
          </div>
          <!-- Mobile hamburger toggle -->
          <button
            class="chat-nav-mobile-toggle"
            type="button"
            aria-label="Toggle navigation"
            @click=${(e: Event) => {
              const wrap = (e.target as HTMLElement).closest(".chat-with-nav");
              wrap?.querySelector(".chat-nav-sidebar")?.classList.toggle("chat-nav-sidebar--open");
              wrap
                ?.querySelector(".chat-nav-backdrop")
                ?.classList.toggle("chat-nav-backdrop--visible");
            }}
          >
            ${icons.menu}
          </button>
          ${props.disabledReason
            ? html`<div class="callout">${props.disabledReason}</div>`
            : nothing}
          ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
          ${props.focusMode
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
            : nothing}
          ${renderDeptIsolationWarning(props.navCurrentContext)}
          ${isReadOnly && isChannelObserve
            ? html`
                <div class="chat-readonly-bar">
                  <span
                    >${t("chat.readonly.channel_bar", {
                      channel:
                        (props.navCurrentContext as { channelName?: string } | null)?.channelName ??
                        "",
                    })}</span
                  >
                  <button
                    class="btn btn--sm"
                    type="button"
                    @click=${props.onNavChannelForceJoinToggle}
                  >
                    ${t("chat.readonly.force_join")}
                  </button>
                </div>
              `
            : nothing}
          ${isChannelObserve && props.navChannelForceJoined
            ? html`
                <div class="chat-force-joined-bar">
                  <span>${t("chat.readonly.force_joined_warning")}</span>
                  <button
                    class="btn btn--sm"
                    type="button"
                    @click=${props.onNavChannelForceJoinToggle}
                  >
                    ${t("chat.readonly.exit_join")}
                  </button>
                </div>
              `
            : nothing}

          <div class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}">
            <div
              class="chat-main"
              style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
            >
              ${thread}
            </div>

            ${sidebarOpen
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
              : nothing}
          </div>

          ${props.queue.length
            ? html`
                <div class="chat-queue" role="status" aria-live="polite">
                  <div class="chat-queue__title">
                    ${t("chat.queue.title")} (${props.queue.length})
                  </div>
                  <div class="chat-queue__list">
                    ${props.queue.map(
                      (item) => html`
                        <div class="chat-queue__item">
                          <div class="chat-queue__text">
                            ${item.text ||
                            (item.attachments?.length
                              ? `${t("chat.queue.image")} (${item.attachments.length})`
                              : "")}
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
            : nothing}
          ${renderFallbackIndicator(props.fallbackStatus)}
          ${renderCompactionIndicator(props.compactionStatus)}
          ${renderContextWarning(props.contextUsage, () => {
            // 对抗-P1 修复：优先使用 onCompact 回调，如不存在才列退回字符串注入方式
            if (props.onCompact) {
              props.onCompact();
            } else {
              // fallback: 字符串注入（将来删除）
              props.onDraftChange("/compact");
              setTimeout(() => props.onSend(), 0);
            }
          })}
          ${props.showNewMessages
            ? html`
                <button
                  class="btn chat-new-messages"
                  type="button"
                  @click=${props.onScrollToBottom}
                >
                  ${t("chat.new_messages")} ${icons.arrowDown}
                </button>
              `
            : nothing}

          <div class="chat-compose">
            ${participantsPanel} ${replyQuoteCard} ${renderTokenProgressBar(props.contextUsage)}
            ${renderAttachmentPreview(props)}
            <div class="chat-compose__row">
              <label class="field chat-compose__field">
                <span>${t("chat.compose.message")}</span>
                <div class="chat-compose__mention-wrap" style="position:relative">
                  ${slashCommands.length > 0
                    ? renderSlashDropdown(slashCommands, onSlashSelect)
                    : nothing}
                  <textarea
                    ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
                    .value=${props.draft}
                    dir=${detectTextDirection(props.draft)}
                    ?disabled=${!canCompose}
                    @keydown=${(e: KeyboardEvent) => {
                      // Input history navigation (only when textarea is empty or single line)
                      if (
                        e.key === "ArrowUp" &&
                        !e.shiftKey &&
                        !e.altKey &&
                        !e.ctrlKey &&
                        !e.metaKey
                      ) {
                        const ta = e.target as HTMLTextAreaElement;
                        // Only navigate history when cursor is at the start or field is single-line
                        if (ta.selectionStart === 0 || !ta.value.includes("\n")) {
                          const prev = chatInputHistory.older(ta.value);
                          if (prev !== null) {
                            e.preventDefault();
                            props.onDraftChange(prev);
                            return;
                          }
                        }
                      }
                      if (
                        e.key === "ArrowDown" &&
                        !e.shiftKey &&
                        !e.altKey &&
                        !e.ctrlKey &&
                        !e.metaKey
                      ) {
                        if (chatInputHistory.isNavigating) {
                          const next = chatInputHistory.newer();
                          if (next !== null) {
                            e.preventDefault();
                            props.onDraftChange(next);
                            return;
                          }
                        }
                      }
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
                        chatInputHistory.add(props.draft);
                        // Reply Quote 打通：键盘 Enter 发送时同样传递引用元数据
                        const rs = _getReplyState();
                        if (rs.replyText && props.onSendWithReply) {
                          props.onSendWithReply(rs.replyText, rs.replyWho);
                        }
                        rs.replyText = "";
                        rs.replyWho = "";
                        props.onSend();
                      }
                    }}
                    @input=${(e: Event) => {
                      const target = e.target as HTMLTextAreaElement;
                      adjustTextareaHeight(target);
                      props.onDraftChange(target.value);
                      // @ mention 提及逻辑（仅在群聊 context）
                      const isGroupCtx = props.navCurrentContext?.type === "group";
                      const wrap = target.closest(".chat-compose__mention-wrap");
                      if (isGroupCtx && wrap) {
                        const cursor = target.selectionStart ?? target.value.length;
                        const mention = detectMentionToken(target.value, cursor);
                        if (mention) {
                          const { participants } = resolveConversationInfo(
                            props.navCurrentContext,
                            props.agentsList,
                            props.assistantName,
                          );
                          const filtered = participants
                            .filter((p) => !p.isUser)
                            .filter(
                              (p) =>
                                mention.token === "" ||
                                p.label.toLowerCase().includes(mention.token) ||
                                p.id.toLowerCase().includes(mention.token),
                            ) as MentionCandidate[];
                          openMentionDropdown(
                            wrap,
                            target,
                            filtered,
                            mention.start,
                            (newDraft) => props.onDraftChange(newDraft),
                            adjustTextareaHeight,
                          );
                        } else {
                          closeMentionDropdown(wrap);
                        }
                      }
                    }}
                    @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
                    placeholder=${composePlaceholder}
                  ></textarea>
                </div>
              </label>
              <div class="chat-compose__actions">
                <button
                  class="btn"
                  ?disabled=${!canCompose || (!canAbort && props.sending)}
                  @click=${canAbort ? props.onAbort : props.onNewSession}
                >
                  ${canAbort ? t("chat.compose.stop") : t("chat.compose.new_session")}
                </button>
                <button
                  class="btn primary ${props.sending ? "btn--sending" : ""}"
                  ?disabled=${!canCompose}
                  @click=${handleSendThrottled}
                >
                  ${isBusy ? t("chat.compose.queue") : t("chat.compose.send")}<kbd class="btn-kbd"
                    >↵</kbd
                  >
                  ${props.queue.length > 0
                    ? html`<span class="chat-compose__queue-badge">${props.queue.length}</span>`
                    : nothing}
                </button>
              </div>
            </div>
          </div>
        </div>
        <!-- .chat-main-area -->
      </div>
      <!-- .chat-with-nav -->
    </section>
  `;
}
