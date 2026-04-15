import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { getSafeLocalStorage } from "../../local-storage.ts";
import type { AssistantIdentity } from "../assistant-identity.ts";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import { openExternalUrlSafe } from "../open-external-url.ts";
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.ts";
import { detectTextDirection } from "../text-direction.ts";
import type { MessageGroup, ToolCard } from "../types/chat-types.ts";
import { agentLogoUrl } from "../views/agents-utils.ts";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown.ts";
import {
  extractTextCached,
  extractThinkingCached,
  formatReasoningMarkdown,
} from "./message-extract.ts";
import { isToolResultMessage, normalizeRoleForGrouping } from "./message-normalizer.ts";
import { isTtsSupported, speakText, stopTts, isTtsSpeaking } from "./speech.ts";
import { extractToolCards, renderToolCardSidebar } from "./tool-cards.ts";

/** Local inter-agent communication metadata (not exported; mirrors upstream AgentCommMeta shape) */
type AgentCommMeta = {
  type: "command" | "request" | "query" | "notification";
  senderId: string;
  body: string;
};

/**
 * Matches inter-agent communication prefix: [TYPE from senderId]
 * Supports: COMMAND, REQUEST, QUERY, NOTIFICATION (case-insensitive)
 */
const AGENT_COMM_PREFIX_RE = /^\[(COMMAND|REQUEST|QUERY|NOTIFICATION)\s+from\s+([^\]]+)\]\s*/i;

function parseAgentCommPrefix(text: string): AgentCommMeta | null {
  const match = AGENT_COMM_PREFIX_RE.exec(text);
  if (!match) {
    return null;
  }
  const rawType = match[1].toLowerCase();
  const type =
    rawType === "command"
      ? "command"
      : rawType === "request"
        ? "request"
        : rawType === "query"
          ? "query"
          : "notification";
  return { type, senderId: match[2].trim(), body: text.slice(match[0].length).trim() };
}

type ImageBlock = {
  url: string;
  alt?: string;
};

type AudioClip = {
  url: string;
};

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data;
          const mediaType = (source.media_type as string) || "image/png";
          // If data is already a data URL, use it directly
          const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.url === "string") {
          images.push({ url: b.url });
        }
      } else if (b.type === "image_url") {
        // OpenAI format
        const imageUrl = b.image_url as Record<string, unknown> | undefined;
        if (typeof imageUrl?.url === "string") {
          images.push({ url: imageUrl.url });
        }
      }
    }
  }

  return images;
}

function extractAudioClips(message: unknown): AudioClip[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const clips: AudioClip[] = [];
  if (!Array.isArray(content)) {
    return clips;
  }
  for (const block of content) {
    if (typeof block !== "object" || block === null) {
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type !== "audio") {
      continue;
    }
    const source = b.source as Record<string, unknown> | undefined;
    if (source?.type === "base64" && typeof source.data === "string") {
      const data = source.data;
      const mediaType = (source.media_type as string) || "audio/mpeg";
      const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
      clips.push({ url });
    }
  }
  return clips;
}

export function renderReadingIndicatorGroup(assistant?: AssistantIdentity, basePath?: string) {
  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant, basePath)}
      <div class="chat-group-messages">
        <div class="chat-bubble chat-reading-indicator" aria-hidden="true">
          <span class="chat-reading-indicator__dots">
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>
    </div>
  `;
}

function formatMessageTimestamp(ts: number): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

export function renderStreamingGroup(
  text: string,
  startedAt: number,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
  basePath?: string,
) {
  const timestamp = formatMessageTimestamp(startedAt);
  const name = assistant?.name ?? t("chat.role.assistant_default");

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant, basePath)}
      <div class="chat-group-messages">
        ${renderGroupedMessage(
          {
            role: "assistant",
            content: [{ type: "text", text }],
            timestamp: startedAt,
          },
          { isStreaming: true, showReasoning: false },
          onOpenSidebar,
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    showReasoning: boolean;
    showToolCalls?: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
    basePath?: string;
    contextWindow?: number | null;
    onQuote?: (text: string) => void;
    onDelete?: () => void;
    /** Edit & Regenerate（参考 Helix AI Interaction.tsx）
     * 仅对 user 角色气泡生效，点击编辑按钮后进入行内编辑模式
     * text: 用户编辑后的新内容
     */
    onEditMessage?: (text: string) => void;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? t("chat.role.assistant_default");

  // Detect agent-comm role: check if the first message has an agent-comm prefix
  const firstMsg = group.messages[0]?.message as Record<string, unknown> | undefined;
  const firstInteragent = firstMsg?.__interagent as Record<string, unknown> | undefined;

  // Also check upstream provenance field: { kind: "inter_session", sourceSessionKey: "agent:doc-writer:main" }
  const firstProvenance = firstMsg?.provenance as Record<string, unknown> | undefined;
  const provenanceInterSession =
    firstProvenance?.kind === "inter_session" &&
    typeof firstProvenance.sourceSessionKey === "string"
      ? firstProvenance.sourceSessionKey
      : null;
  // Extract agentId from sourceSessionKey like "agent:doc-writer:main" → "doc-writer"
  const provenanceAgentId = provenanceInterSession
    ? (() => {
        const parts = provenanceInterSession.split(":");
        return parts.length >= 2 && parts[0] === "agent" ? parts[1] : provenanceInterSession;
      })()
    : null;

  const firstTextContent =
    !firstInteragent && !provenanceAgentId && firstMsg
      ? (() => {
          const role = typeof firstMsg.role === "string" ? firstMsg.role : "";
          if (role === "user" || role === "User") {
            const content = firstMsg.content;
            if (Array.isArray(content)) {
              const textItem = content.find(
                (c: unknown) =>
                  typeof (c as Record<string, unknown>).type === "string" &&
                  (c as Record<string, unknown>).type === "text",
              ) as Record<string, unknown> | undefined;
              return typeof textItem?.text === "string" ? textItem.text : null;
            } else if (typeof content === "string") {
              return content;
            }
          }
          return null;
        })()
      : null;
  const firstCommMeta =
    firstInteragent && typeof firstInteragent.senderId === "string"
      ? { senderId: String(firstInteragent.senderId) }
      : provenanceAgentId
        ? { senderId: provenanceAgentId }
        : firstTextContent
          ? (() => {
              const m = parseAgentCommPrefix(firstTextContent);
              return m ? { senderId: m.senderId } : null;
            })()
          : null;

  const isAgentComm = Boolean(firstCommMeta);

  // OpenClaw group chat: use __group_sender_name / __group_sender_id from the group
  const isGroupChatMsg = Boolean(group.groupSenderId);
  const groupSenderName = group.groupSenderName ?? group.groupSenderId ?? "Agent";
  const isGroupUser = group.groupSenderId === "user";

  const who = isGroupChatMsg
    ? isGroupUser
      ? t("chat.you")
      : groupSenderName
    : isAgentComm
      ? firstCommMeta!.senderId
      : normalizedRole === "user"
        ? t("chat.you")
        : normalizedRole === "assistant"
          ? assistantName
          : normalizedRole;
  const roleClass = isGroupChatMsg
    ? isGroupUser
      ? "user"
      : "agent-comm"
    : isAgentComm
      ? "agent-comm"
      : normalizedRole === "user"
        ? "user"
        : normalizedRole === "assistant"
          ? "assistant"
          : "other";
  const timestamp = formatMessageTimestamp(group.timestamp);

  const groupSenderInitial = isGroupUser ? "U" : groupSenderName.charAt(0).toUpperCase() || "A";

  // Aggregate usage/cost/model across all messages in the group
  const meta = extractGroupMeta(group, opts.contextWindow ?? null);

  return html`
    <div class="chat-group ${roleClass}">
      ${
        isGroupChatMsg
          ? isGroupUser
            ? renderAvatar("user", { name: t("chat.you"), avatar: null }, opts.basePath)
            : html`<div class="chat-avatar agent-comm" title="${groupSenderName}">${groupSenderInitial}</div>`
          : renderAvatar(
              isAgentComm ? "agent-comm" : group.role,
              {
                name: assistantName,
                avatar: opts.assistantAvatar ?? null,
              },
              opts.basePath,
            )
      }
      <div class="chat-group-messages">
        ${isAgentComm && !isGroupChatMsg ? html`<div class="chat-agent-name">${who}</div>` : nothing}
        ${isGroupChatMsg ? html`<div class="chat-agent-name">${who}</div>` : nothing}
        ${group.messages.map((item, index) =>
          renderGroupedMessage(
            item.message,
            {
              isStreaming: group.isStreaming && index === group.messages.length - 1,
              showReasoning: opts.showReasoning,
              showToolCalls: opts.showToolCalls ?? true,
              onQuote: opts.onQuote,
            },
            opts.onOpenSidebar,
          ),
        )}
        <div class="chat-group-footer">
          ${!isAgentComm && !isGroupChatMsg ? html`<span class="chat-sender-name">${who}</span>` : nothing}
          <span class="chat-group-timestamp">${timestamp}</span>
          ${renderMessageMeta(meta)}
          ${normalizedRole === "assistant" && isTtsSupported() ? renderTtsButton(group) : nothing}
          ${
            normalizedRole === "user" && opts.onEditMessage
              ? renderEditButton(extractGroupText(group), opts.onEditMessage)
              : nothing
          }
          ${
            opts.onDelete
              ? renderDeleteButton(opts.onDelete, normalizedRole === "user" ? "left" : "right")
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(
  role: string,
  assistant?: Pick<AssistantIdentity, "name" | "avatar">,
  basePath?: string,
) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || t("chat.role.assistant_default");
  const assistantAvatar = assistant?.avatar?.trim() || "";
  // agent-comm: robot emoji avatar
  if (role === "agent-comm") {
    return html`
      <div class="chat-avatar agent-comm" title="Agent">🤖</div>
    `;
  }
  const initial =
    normalized === "user"
      ? "U"
      : normalized === "assistant"
        ? assistantName.charAt(0).toUpperCase() || "A"
        : normalized === "tool"
          ? "⚙"
          : "?";
  const className =
    normalized === "user"
      ? "user"
      : normalized === "assistant"
        ? "assistant"
        : normalized === "tool"
          ? "tool"
          : "other";

  if (assistantAvatar && normalized === "assistant") {
    if (isAvatarUrl(assistantAvatar)) {
      return html`<img
        class="chat-avatar ${className}"
        src="${assistantAvatar}"
        alt="${assistantName}"
      />`;
    }
    return html`<img
      class="chat-avatar ${className} chat-avatar--logo"
      src="${agentLogoUrl(basePath ?? "")}"
      alt="${assistantName}"
    />`;
  }

  /* Assistant with no custom avatar: use logo when basePath available */
  if (normalized === "assistant" && basePath) {
    const logoUrl = agentLogoUrl(basePath);
    return html`<img
      class="chat-avatar ${className} chat-avatar--logo"
      src="${logoUrl}"
      alt="${assistantName}"
    />`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith("/") // Relative paths from avatar endpoint
  );
}

// ── Per-message metadata (tokens, cost, model, context %) ──

type GroupMeta = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  model: string | null;
  contextPercent: number | null;
};

function extractGroupMeta(group: MessageGroup, contextWindow: number | null): GroupMeta | null {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  let model: string | null = null;
  let hasUsage = false;

  for (const { message } of group.messages) {
    const m = message as Record<string, unknown>;
    if (m.role !== "assistant") {
      continue;
    }
    const usage = m.usage as Record<string, number> | undefined;
    if (usage) {
      hasUsage = true;
      input += usage.input ?? usage.inputTokens ?? 0;
      output += usage.output ?? usage.outputTokens ?? 0;
      cacheRead += usage.cacheRead ?? usage.cache_read_input_tokens ?? 0;
      cacheWrite += usage.cacheWrite ?? usage.cache_creation_input_tokens ?? 0;
    }
    const c = m.cost as Record<string, number> | undefined;
    if (c?.total) {
      cost += c.total;
    }
    if (typeof m.model === "string" && m.model !== "gateway-injected") {
      model = m.model;
    }
  }

  if (!hasUsage && !model) {
    return null;
  }

  const contextPercent =
    contextWindow && input > 0 ? Math.min(Math.round((input / contextWindow) * 100), 100) : null;

  return { input, output, cacheRead, cacheWrite, cost, model, contextPercent };
}

/** Compact token count formatter (e.g. 128000 → "128k"). */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

function renderMessageMeta(meta: GroupMeta | null) {
  if (!meta) {
    return nothing;
  }

  const parts: Array<ReturnType<typeof html>> = [];

  if (meta.input) {
    parts.push(html`<span class="msg-meta__tokens">↑${fmtTokens(meta.input)}</span>`);
  }
  if (meta.output) {
    parts.push(html`<span class="msg-meta__tokens">↓${fmtTokens(meta.output)}</span>`);
  }
  if (meta.cacheRead) {
    parts.push(html`<span class="msg-meta__cache">R${fmtTokens(meta.cacheRead)}</span>`);
  }
  if (meta.cacheWrite) {
    parts.push(html`<span class="msg-meta__cache">W${fmtTokens(meta.cacheWrite)}</span>`);
  }
  if (meta.cost > 0) {
    parts.push(html`<span class="msg-meta__cost">$${meta.cost.toFixed(4)}</span>`);
  }
  if (meta.contextPercent !== null) {
    const pct = meta.contextPercent;
    const cls =
      pct >= 90
        ? "msg-meta__ctx msg-meta__ctx--danger"
        : pct >= 75
          ? "msg-meta__ctx msg-meta__ctx--warn"
          : "msg-meta__ctx";
    parts.push(html`<span class="${cls}">${pct}% ctx</span>`);
  }
  if (meta.model) {
    const shortModel = meta.model.includes("/") ? meta.model.split("/").pop()! : meta.model;
    parts.push(html`<span class="msg-meta__model">${shortModel}</span>`);
  }

  if (parts.length === 0) {
    return nothing;
  }

  return html`<span class="msg-meta">${parts}</span>`;
}

function extractGroupText(group: MessageGroup): string {
  const parts: string[] = [];
  for (const { message } of group.messages) {
    const text = extractTextCached(message);
    if (text?.trim()) {
      parts.push(text.trim());
    }
  }
  return parts.join("\n\n");
}

export const SKIP_DELETE_CONFIRM_KEY = "openclaw:skipDeleteConfirm";

type DeleteConfirmSide = "left" | "right";
type DeleteConfirmPopover = {
  popover: HTMLDivElement;
  cancel: HTMLButtonElement;
  yes: HTMLButtonElement;
  check: HTMLInputElement;
};

function shouldSkipDeleteConfirm(): boolean {
  try {
    return getSafeLocalStorage()?.getItem(SKIP_DELETE_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

function createDeleteConfirmPopover(side: DeleteConfirmSide): DeleteConfirmPopover {
  const popover = document.createElement("div");
  popover.className = `chat-delete-confirm chat-delete-confirm--${side}`;

  const text = document.createElement("p");
  text.className = "chat-delete-confirm__text";
  text.textContent = "Delete this message?";

  const remember = document.createElement("label");
  remember.className = "chat-delete-confirm__remember";

  const check = document.createElement("input");
  check.className = "chat-delete-confirm__check";
  check.type = "checkbox";

  const rememberText = document.createElement("span");
  rememberText.textContent = "Don't ask again";

  remember.append(check, rememberText);

  const actions = document.createElement("div");
  actions.className = "chat-delete-confirm__actions";

  const cancel = document.createElement("button");
  cancel.className = "chat-delete-confirm__cancel";
  cancel.type = "button";
  cancel.textContent = "Cancel";

  const yes = document.createElement("button");
  yes.className = "chat-delete-confirm__yes";
  yes.type = "button";
  yes.textContent = "Delete";

  actions.append(cancel, yes);
  popover.append(text, remember, actions);

  return { popover, cancel, yes, check };
}

function renderDeleteButton(onDelete: () => void, side: DeleteConfirmSide) {
  return html`
    <span class="chat-delete-wrap">
      <button
        class="chat-group-delete"
        title="Delete"
        aria-label="Delete message"
        @click=${(e: Event) => {
          if (shouldSkipDeleteConfirm()) {
            onDelete();
            return;
          }
          const btn = e.currentTarget as HTMLElement;
          const wrap = btn.closest(".chat-delete-wrap") as HTMLElement;
          const existing = wrap?.querySelector(".chat-delete-confirm");
          if (existing) {
            existing.remove();
            return;
          }
          const { popover, cancel, yes, check } = createDeleteConfirmPopover(side);
          wrap.appendChild(popover);

          const removePopover = () => {
            popover.remove();
            document.removeEventListener("click", closeOnOutside, true);
          };

          const closeOnOutside = (evt: MouseEvent) => {
            if (!popover.contains(evt.target as Node) && evt.target !== btn) {
              removePopover();
            }
          };

          cancel.addEventListener("click", removePopover);
          yes.addEventListener("click", () => {
            if (check.checked) {
              try {
                getSafeLocalStorage()?.setItem(SKIP_DELETE_CONFIRM_KEY, "1");
              } catch {}
            }
            removePopover();
            onDelete();
          });
          requestAnimationFrame(() => document.addEventListener("click", closeOnOutside, true));
        }}
      >
        ${icons.trash ?? icons.x}
      </button>
    </span>
  `;
}

function renderTtsButton(group: MessageGroup) {
  return html`
    <button
      class="btn btn--xs chat-tts-btn"
      type="button"
      title=${isTtsSpeaking() ? "Stop speaking" : "Read aloud"}
      aria-label=${isTtsSpeaking() ? "Stop speaking" : "Read aloud"}
      @click=${(e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement;
        if (isTtsSpeaking()) {
          stopTts();
          btn.classList.remove("chat-tts-btn--active");
          btn.title = "Read aloud";
          return;
        }
        const text = extractGroupText(group);
        if (!text) {
          return;
        }
        btn.classList.add("chat-tts-btn--active");
        btn.title = "Stop speaking";
        speakText(text, {
          onEnd: () => {
            if (btn.isConnected) {
              btn.classList.remove("chat-tts-btn--active");
              btn.title = "Read aloud";
            }
          },
          onError: () => {
            if (btn.isConnected) {
              btn.classList.remove("chat-tts-btn--active");
              btn.title = "Read aloud";
            }
          },
        });
      }}
    >
      ${icons.volume2}
    </button>
  `;
}

/**
 * Edit & Regenerate 按钮（参考 Helix AI Interaction.tsx）
 * 点击后在消息气泡内展开行内编辑模式，支持确认/取消
 */
function renderEditButton(originalText: string, onEdit: (text: string) => void) {
  const handleEdit = (e: Event) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const footer = btn.closest(".chat-group-footer");
    const groupMessages = btn.closest(".chat-group-messages");
    if (!footer || !groupMessages) {return;}

    // 已经在编辑模式则关闭
    const existing = groupMessages.querySelector(".chat-edit-inline");
    if (existing) {
      existing.remove();
      return;
    }

    // 创建行内编辑器
    const editWrap = document.createElement("div");
    editWrap.className = "chat-edit-inline";

    const textarea = document.createElement("textarea");
    textarea.className = "chat-edit-textarea";
    textarea.value = originalText;
    textarea.rows = Math.min(Math.max(originalText.split("\n").length, 2), 10);

    const actions = document.createElement("div");
    actions.className = "chat-edit-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "chat-edit-cancel";
    cancelBtn.textContent = "取消";
    cancelBtn.addEventListener("click", () => editWrap.remove());

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "chat-edit-confirm";
    confirmBtn.textContent = "确认并重新生成";
    confirmBtn.addEventListener("click", () => {
      const newText = textarea.value.trim();
      if (newText && newText !== originalText) {
        editWrap.remove();
        onEdit(newText);
      } else {
        editWrap.remove();
      }
    });

    // Ctrl+Enter 快捷确认
    textarea.addEventListener("keydown", (ke: KeyboardEvent) => {
      if (ke.key === "Enter" && (ke.ctrlKey || ke.metaKey)) {
        ke.preventDefault();
        confirmBtn.click();
      }
      if (ke.key === "Escape") {
        editWrap.remove();
      }
    });

    actions.append(cancelBtn, confirmBtn);
    editWrap.append(textarea, actions);

    // 插入到 footer 之前
    groupMessages.insertBefore(editWrap, footer);
    textarea.focus();
    textarea.select();
  };

  return html`
    <button
      class="btn btn--xs chat-edit-btn"
      type="button"
      title="编辑并重新生成"
      aria-label="编辑并重新生成"
      @click=${handleEdit}
    >✏️</button>
  `;
}

/** Badge label & color for each agent communication type */
const AGENT_COMM_TYPE_LABELS: Record<AgentCommMeta["type"], { label: string; cls: string }> = {
  command: { label: "\u547d\u4ee4", cls: "agent-comm-badge--command" },
  request: { label: "\u8bf7\u6c42", cls: "agent-comm-badge--request" },
  query: { label: "\u67e5\u8be2", cls: "agent-comm-badge--query" },
  notification: { label: "\u901a\u77e5", cls: "agent-comm-badge--notification" },
};

/**
 * ThinkingWidget \u2014 \u53c2\u8003 Helix AI ThinkingWidget.tsx
 * \u5c06\u63a8\u7406\u8fc7\u7a0b\u6e32\u67d3\u4e3a\u53ef\u6298\u53e0\u7684 <details>\uff0c\u6d41\u5f0f\u65f6\u5c55\u5f00\uff0b\u663e\u793a\u8bba\u8bc1\u4e2d\u52a8\u753b\uff0c\u5b8c\u6210\u540e\u9ed8\u8ba4\u6298\u53e0
 */
function renderThinkingWidget(reasoningMarkdown: string, isStreaming: boolean) {
  const html_content = unsafeHTML(toSanitizedMarkdownHtml(reasoningMarkdown));
  if (isStreaming) {
    return html`
      <details class="chat-thinking-widget" open>
        <summary class="chat-thinking-widget__summary">
          <span class="chat-thinking-widget__spinner" aria-hidden="true"></span>
          <span class="chat-thinking-widget__label">\u63a8\u7406\u4e2d\u2026</span>
        </summary>
        <div class="chat-thinking-widget__body">${html_content}</div>
      </details>
    `;
  }
  return html`
    <details class="chat-thinking-widget chat-thinking-widget--done">
      <summary class="chat-thinking-widget__summary">
        <span class="chat-thinking-widget__icon" aria-hidden="true">\u{1f9e0}</span>
        <span class="chat-thinking-widget__label">\u67e5\u770b\u63a8\u7406\u8fc7\u7a0b</span>
      </summary>
      <div class="chat-thinking-widget__body">${html_content}</div>
    </details>
  `;
}

/**
 * Render a special bubble for inter-agent communication messages.
 * These are user-role messages whose text begins with [TYPE from agentId].
 */
function renderAgentCommMessage(
  meta: AgentCommMeta,
  isStreaming: boolean,
  _onOpenSidebar?: (content: string) => void,
) {
  const typeInfo = AGENT_COMM_TYPE_LABELS[meta.type] ?? {
    label: meta.type,
    cls: "agent-comm-badge--notification",
  };
  const { label, cls } = typeInfo;
  const bodyHtml = meta.body ? toSanitizedMarkdownHtml(meta.body) : "";
  const bubbleClasses = [
    "chat-bubble",
    "chat-bubble--agent-comm",
    isStreaming ? "streaming" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");
  return html`
    <div class=${bubbleClasses}>
      <div class="agent-comm-header">
        <span class="agent-comm-icon" aria-hidden="true">🤖</span>
        <span class="agent-comm-sender">${meta.senderId}</span>
        <span class="agent-comm-badge ${cls}">${label}</span>
      </div>
      ${
        meta.body
          ? html`<div class="chat-text agent-comm-body" dir=${detectTextDirection(meta.body)}>${unsafeHTML(bodyHtml)}</div>`
          : nothing
      }
    </div>
  `;
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) {
    return nothing;
  }

  const openImage = (url: string) => {
    openExternalUrlSafe(url, { allowDataImage: true });
  };

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image"
            @click=${() => openImage(img.url)}
          />
        `,
      )}
    </div>
  `;
}

function renderMessageAudio(clips: AudioClip[]) {
  if (clips.length === 0) {
    return nothing;
  }
  return html`
    <div class="chat-message-audio">
      ${clips.map(
        (clip) =>
          html`<audio
            class="chat-message-audio-el"
            controls
            preload="metadata"
            src=${clip.url}
          ></audio>`,
      )}
    </div>
  `;
}

/** Render tool cards inside a collapsed `<details>` element. */
function renderCollapsedToolCards(
  toolCards: ToolCard[],
  onOpenSidebar?: (content: string) => void,
) {
  const calls = toolCards.filter((c) => c.kind === "call");
  const results = toolCards.filter((c) => c.kind === "result");
  const totalTools = Math.max(calls.length, results.length) || toolCards.length;
  const toolNames = [...new Set(toolCards.map((c) => c.name))];
  const summaryLabel =
    toolNames.length <= 3
      ? toolNames.join(", ")
      : `${toolNames.slice(0, 2).join(", ")} +${toolNames.length - 2} more`;

  return html`
    <details class="chat-tools-collapse">
      <summary class="chat-tools-summary">
        <span class="chat-tools-summary__icon">${icons.zap}</span>
        <span class="chat-tools-summary__count"
          >${totalTools} tool${totalTools === 1 ? "" : "s"}</span
        >
        <span class="chat-tools-summary__names">${summaryLabel}</span>
      </summary>
      <div class="chat-tools-collapse__body">
        ${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}
      </div>
    </details>
  `;
}

/**
 * Max characters for auto-detecting and pretty-printing JSON.
 * Prevents DoS from large JSON payloads in assistant/tool messages.
 */
const MAX_JSON_AUTOPARSE_CHARS = 20_000;

/**
 * Detect whether a trimmed string is a JSON object or array.
 */
function detectJson(text: string): { parsed: unknown; pretty: string } | null {
  const trimmed = text.trim();
  if (trimmed.length > MAX_JSON_AUTOPARSE_CHARS) {
    return null;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      return { parsed, pretty: JSON.stringify(parsed, null, 2) };
    } catch {
      return null;
    }
  }
  return null;
}

/** Build a short summary label for collapsed JSON. */
function jsonSummaryLabel(parsed: unknown): string {
  if (Array.isArray(parsed)) {
    return `Array (${parsed.length} item${parsed.length === 1 ? "" : "s"})`;
  }
  if (parsed && typeof parsed === "object") {
    const keys = Object.keys(parsed as Record<string, unknown>);
    if (keys.length <= 4) {
      return `{ ${keys.join(", ")} }`;
    }
    return `Object (${keys.length} keys)`;
  }
  return "JSON";
}

/**
 * Token pattern: CONFIRM_<ACTION>_<id>
 * Matches confirmation tokens emitted by guarded tools (project_create, agent_spawn, project_delete, etc.)
 */
const CONFIRM_TOKEN_RE = /(CONFIRM_[A-Z][A-Z0-9_-]*[A-Z0-9])/g;

/**
 * Render a single confirmation token as an inline card with a one-click copy button.
 */
function renderTokenCard(token: string) {
  const handleCopy = (e: Event) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    navigator.clipboard
      .writeText(token)
      .then(() => {
        btn.setAttribute("data-copied", "1");
        setTimeout(() => btn.removeAttribute("data-copied"), 1500);
      })
      .catch(() => { /* ignore */ });
  };
  return html`<span class="chat-token-card"><code class="chat-token-card__text">${token}</code><button class="chat-token-card__copy" type="button" title="复制令牌" @click=${handleCopy}><span data-default>📋</span><span data-copied>✅</span></button></span>`;
}

/**
 * Render markdown text, with any CONFIRM_* tokens replaced by inline token cards.
 * Non-token segments are rendered as sanitized markdown HTML.
 */
function renderChatMarkdownWithTokens(markdown: string) {
  if (!CONFIRM_TOKEN_RE.test(markdown)) {
    // Fast path: no tokens, render as plain markdown
    return html`<div class="chat-text" dir="${detectTextDirection(markdown)}">${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`;
  }
  CONFIRM_TOKEN_RE.lastIndex = 0;
  const parts: Array<{ type: "text" | "token"; value: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = CONFIRM_TOKEN_RE.exec(markdown)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: markdown.slice(last, match.index) });
    }
    parts.push({ type: "token", value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < markdown.length) {
    parts.push({ type: "text", value: markdown.slice(last) });
  }
  return html`<div class="chat-text" dir="${detectTextDirection(markdown)}">${parts.map((p) =>
    p.type === "token"
      ? renderTokenCard(p.value)
      : unsafeHTML(toSanitizedMarkdownHtml(p.value)),
  )}</div>`;
}

function renderExpandButton(markdown: string, onOpenSidebar: (content: string) => void) {
  return html`
    <button
      class="btn btn--xs chat-expand-btn"
      type="button"
      title="Open in canvas"
      aria-label="Open in canvas"
      @click=${() => onOpenSidebar(markdown)}
    >
      <span class="chat-expand-btn__icon" aria-hidden="true">${icons.panelRightOpen}</span>
    </button>
  `;
}

function renderGroupedMessage(
  message: unknown,
  opts: {
    isStreaming: boolean;
    showReasoning: boolean;
    showToolCalls?: boolean;
    onQuote?: (text: string) => void;
  },
  onOpenSidebar?: (content: string) => void,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const normalizedRole = normalizeRoleForGrouping(role);
  const normalizedRawRole = normalizeLowercaseStringOrEmpty(role);
  const isToolResult =
    isToolResultMessage(message) ||
    normalizedRawRole === "toolresult" ||
    normalizedRawRole === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";

  // Detect inter-agent communication messages
  // Priority 1: __interagent metadata (legacy/custom)
  const interagentMeta = m.__interagent as Record<string, unknown> | undefined;
  if (
    interagentMeta &&
    typeof interagentMeta.type === "string" &&
    typeof interagentMeta.senderId === "string"
  ) {
    const rawType = interagentMeta.type.toLowerCase();
    const commType =
      rawType === "command"
        ? "command"
        : rawType === "request"
          ? "request"
          : rawType === "query"
            ? "query"
            : "notification";
    const commMeta: AgentCommMeta = {
      type: commType,
      senderId: String(interagentMeta.senderId),
      body:
        typeof interagentMeta.body === "string"
          ? interagentMeta.body
          : (extractTextCached(message) ?? ""),
    };
    return renderAgentCommMessage(commMeta, opts.isStreaming, onOpenSidebar);
  }

  // Priority 2: upstream provenance field { kind: "inter_session", sourceSessionKey: "agent:xxx:main" }
  if ((role === "user" || role === "User") && !isToolResult) {
    const provenance = m.provenance as Record<string, unknown> | undefined;
    if (provenance?.kind === "inter_session" && typeof provenance.sourceSessionKey === "string") {
      const parts = provenance.sourceSessionKey.split(":");
      const agentId =
        parts.length >= 2 && parts[0] === "agent" ? parts[1] : provenance.sourceSessionKey;
      const commMeta: AgentCommMeta = {
        type: "notification",
        senderId: agentId,
        body: extractTextCached(message) ?? "",
      };
      return renderAgentCommMessage(commMeta, opts.isStreaming, onOpenSidebar);
    }
  }

  // Priority 3: [TYPE from agentId] text prefix
  if ((role === "user" || role === "User") && !isToolResult) {
    const textContent = extractTextCached(message);
    if (textContent) {
      const commMeta = parseAgentCommPrefix(textContent);
      if (commMeta) {
        return renderAgentCommMessage(commMeta, opts.isStreaming, onOpenSidebar);
      }
    }
  }

  const toolCards = (opts.showToolCalls ?? true) ? extractToolCards(message) : [];
  const hasToolCards = toolCards.length > 0;
  const images = extractImages(message);
  const hasImages = images.length > 0;
  const audioClips = extractAudioClips(message);
  const hasAudio = audioClips.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;
  const markdownBase = extractedText?.trim() ? extractedText : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
  const markdown = markdownBase;
  const canCopyMarkdown = role === "assistant" && Boolean(markdown?.trim());
  const canExpand = role === "assistant" && Boolean(onOpenSidebar && markdown?.trim());

  // Detect pure-JSON messages and render as collapsible block
  const jsonResult = markdown && !opts.isStreaming ? detectJson(markdown) : null;

  const bubbleClasses = [
    "chat-bubble",
    opts.isStreaming ? "streaming" : "",
    "fade-in",
    canCopyMarkdown ? "has-copy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!markdown && hasToolCards && isToolResult) {
    return renderCollapsedToolCards(toolCards, onOpenSidebar);
  }

  // Suppress empty bubbles when tool cards are the only content and toggle is off
  const visibleToolCards = hasToolCards && (opts.showToolCalls ?? true);
  if (!markdown && !visibleToolCards && !hasImages && !hasAudio) {
    return nothing;
  }

  const isToolMessage = normalizedRole === "tool" || isToolResult;
  const toolNames = [...new Set(toolCards.map((c) => c.name))];
  const toolSummaryLabel =
    toolNames.length <= 3
      ? toolNames.join(", ")
      : `${toolNames.slice(0, 2).join(", ")} +${toolNames.length - 2} more`;
  const toolPreview =
    markdown && !toolSummaryLabel ? markdown.trim().replace(/\s+/g, " ").slice(0, 120) : "";

  const hasActions = canCopyMarkdown || canExpand;

  // Hover action bar — copy + quote (only for non-streaming messages with text)
  const actionBar =
    !opts.isStreaming && markdown ? renderMessageActions(markdown, opts.onQuote) : nothing;

  return html`
    <div class="${bubbleClasses}">
      ${
        hasActions
          ? html`<div class="chat-bubble-actions">
            ${canExpand ? renderExpandButton(markdown, onOpenSidebar!) : nothing}
            ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown) : nothing}
          </div>`
          : nothing
      }
      ${!hasActions && !opts.isStreaming && markdown ? actionBar : nothing}
      ${
        isToolMessage
          ? html`
            <details class="chat-tool-msg-collapse">
              <summary class="chat-tool-msg-summary">
                <span class="chat-tool-msg-summary__icon">${icons.zap}</span>
                <span class="chat-tool-msg-summary__label">Tool output</span>
                ${
                  toolSummaryLabel
                    ? html`<span class="chat-tool-msg-summary__names">${toolSummaryLabel}</span>`
                    : toolPreview
                      ? html`<span class="chat-tool-msg-summary__preview">${toolPreview}</span>`
                      : nothing
                }
              </summary>
              <div class="chat-tool-msg-body">
                ${renderMessageImages(images)} ${renderMessageAudio(audioClips)}
                ${
                  reasoningMarkdown
                    ? renderThinkingWidget(reasoningMarkdown, opts.isStreaming)
                    : nothing
                }
                ${
                  jsonResult
                    ? html`<details class="chat-json-collapse">
                      <summary class="chat-json-summary">
                        <span class="chat-json-badge">JSON</span>
                        <span class="chat-json-label">${jsonSummaryLabel(jsonResult.parsed)}</span>
                      </summary>
                      <pre class="chat-json-content"><code>${jsonResult.pretty}</code></pre>
                    </details>`
                    : markdown
                      ? renderChatMarkdownWithTokens(markdown)
                      : nothing
                }
                ${hasToolCards ? renderCollapsedToolCards(toolCards, onOpenSidebar) : nothing}
              </div>
            </details>
          `
          : html`
            ${renderMessageImages(images)} ${renderMessageAudio(audioClips)}
            ${
              reasoningMarkdown
                ? renderThinkingWidget(reasoningMarkdown, opts.isStreaming)
                : nothing
            }
            ${
              jsonResult
                ? html`<details class="chat-json-collapse">
                  <summary class="chat-json-summary">
                    <span class="chat-json-badge">JSON</span>
                    <span class="chat-json-label">${jsonSummaryLabel(jsonResult.parsed)}</span>
                  </summary>
                  <pre class="chat-json-content"><code>${jsonResult.pretty}</code></pre>
                </details>`
                : markdown
                  ? renderChatMarkdownWithTokens(markdown)
                  : nothing
            }
            ${hasToolCards ? renderCollapsedToolCards(toolCards, onOpenSidebar) : nothing}
          `
      }
    </div>
  `;
}

/**
 * Render hover action buttons (Copy, Quote) for a message bubble.
 */
function renderMessageActions(text: string, onQuote?: (text: string) => void) {
  const handleCopy = (e: Event) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        btn.setAttribute("data-copied", "1");
        setTimeout(() => btn.removeAttribute("data-copied"), 1500);
      })
      .catch(() => {
        /* ignore */
      });
  };

  const handleQuote = onQuote
    ? (e: Event) => {
        e.stopPropagation();
        const lines = text.split("\n");
        const MAX_QUOTE_LINES = 5;
        // 布局-P1 修复：引用超过 5 行时无截断提示，用户无法感知内容被截断。
        // 现在在引用块末尾附加“...”指示截断（业界实践：GitHub PR review 风格）
        const truncated = lines.length > MAX_QUOTE_LINES;
        const quoteLines = lines.slice(0, MAX_QUOTE_LINES).map((line) => `> ${line}`);
        if (truncated) {
          quoteLines.push(`> _...\u5171 ${lines.length} \u884c\uff0c\u5df2\u622a\u65ad_`);
        }
        const quoted = quoteLines.join("\n");
        onQuote(quoted + "\n\n");
      }
    : null;

  return html`
    <div class="chat-msg-actions">
      <button
        class="chat-msg-action-btn"
        type="button"
        title="${t("chat.action.copy")}"
        @click=${handleCopy}
      >📋</button>
      ${
        handleQuote
          ? html`<button
            class="chat-msg-action-btn"
            type="button"
            title="${t("chat.action.quote")}"
            @click=${handleQuote}
          >💬</button>`
          : nothing
      }
    </div>
  `;
}
