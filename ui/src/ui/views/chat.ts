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
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import { detectMentionToken, openMentionDropdown, closeMentionDropdown } from "../chat/mention.ts";
import type { MentionCandidate } from "../chat/mention.ts";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";
import { detectTextDirection } from "../text-direction.ts";
import { renderChatNavigationTree } from "./chat-navigation-tree.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

// Re-export shared types for backwards compatibility
export type {
  ChatProps,
  CompactionIndicatorStatus,
  FallbackIndicatorStatus,
} from "../types/chat-props.ts";
import { renderContextWarning, getUsageRatio } from "../chat/context-warning.ts";
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

export function renderChat(props: ChatProps) {
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
    (isDeptRoom && (props.navCurrentContext as { isMember?: boolean } | null)?.isMember === false) ||
    (isDeptBroadcast && !(props.navCurrentContext as { isAdmin?: boolean } | null)?.isAdmin);
  const isReadOnly = (isChannelObserve && !props.navChannelForceJoined) || isContactView || isDeptReadOnly;

  // canSend 来自后端能力判断（如 agent 未就绪、rate-limit 等），必须和前端 canCompose 同时满足
  // 对抗-P0：原代码中 props.canSend 存在于 props 但从未被消费，相当于权限字段形同虚设
  const canCompose = props.connected && !isReadOnly && (props.canSend !== false);
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);

  // 对抗-P7 修复：按 sessionKey 隔离的输入历史，避免跨部门/跨会话历史混用
  // 原全局单例 chatInputHistory 已废弃，改用 getInputHistory(sessionKey)
  const inputHistory = getInputHistory(props.sessionKey ?? "__default__");

  // 对抗-P0：节流防抖，防止用户连点发送按钮造成大量重复请求
  // 使用 data attribute 在 DOM 层面做 300ms 节流（无需引入额外状态）
  const handleSendThrottled = (e: Event) => {
    const btn = e.currentTarget as HTMLElement;
    if (btn.dataset.sending === "1") return;
    btn.dataset.sending = "1";
    inputHistory.add(props.draft);
    props.onSend();
    setTimeout(() => { delete btn.dataset.sending; }, 300);
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
                ${
                  props.onRefresh
                    ? html`<button class="btn btn--sm" type="button" @click=${props.onRefresh}>${t("chat.empty.refresh")}</button>`
                    : nothing
                }
              </div>
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
              onQuote: (quoted: string) => {
                // Inject quoted text at the start of the draft
                const current = props.draft.trim();
                const newDraft = current ? `${quoted}${current}` : quoted;
                props.onDraftChange(newDraft);
              },
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
        <div class="chat-main-area"
          @dragover=${handleDragOver}
          @dragleave=${handleDragLeave}
          @drop=${(e: DragEvent) => handleDrop(e, props.attachments ?? [], props.onAttachmentsChange)}
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
          wrap?.querySelector(".chat-nav-backdrop")?.classList.toggle("chat-nav-backdrop--visible");
        }}
      >${icons.menu}</button>
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

      ${renderDeptIsolationWarning(props.navCurrentContext)}

      ${
        isReadOnly && isChannelObserve
          ? html`
            <div class="chat-readonly-bar">
              <span>${t("chat.readonly.channel_bar", { channel: (props.navCurrentContext as { channelName?: string } | null)?.channelName ?? "" })}</span>
              <button
                class="btn btn--sm"
                type="button"
                @click=${props.onNavChannelForceJoinToggle}
              >
                ${t("chat.readonly.force_join")}
              </button>
            </div>
          `
          : nothing
      }

      ${
        isChannelObserve && props.navChannelForceJoined
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
              <div class="chat-queue__title">${t("chat.queue.title")} (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${
                          item.text ||
                          (item.attachments?.length
                            ? `${t("chat.queue.image")} (${item.attachments.length})`
                            : "")
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

      ${
        props.showNewMessages
          ? html`
            <button
              class="btn chat-new-messages"
              type="button"
              @click=${props.onScrollToBottom}
            >
              ${t("chat.new_messages")} ${icons.arrowDown}
            </button>
          `
          : nothing
      }

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>${t("chat.compose.message")}</span>
            <div class="chat-compose__mention-wrap" style="position:relative">
            ${slashCommands.length > 0 ? renderSlashDropdown(slashCommands, onSlashSelect) : nothing}
            <textarea
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              dir=${detectTextDirection(props.draft)}
              ?disabled=${!canCompose}
              @keydown=${(e: KeyboardEvent) => {
                // Input history navigation (only when textarea is empty or single line)
                if (e.key === "ArrowUp" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
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
                if (e.key === "ArrowDown" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
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
              ${isBusy ? t("chat.compose.queue") : t("chat.compose.send")}<kbd class="btn-kbd">↵</kbd>
              ${props.queue.length > 0 ? html`<span class="chat-compose__queue-badge">${props.queue.length}</span>` : nothing}
            </button>
          </div>
        </div>
      </div>
        </div><!-- .chat-main-area -->
      </div><!-- .chat-with-nav -->
    </section>
  `;
}
