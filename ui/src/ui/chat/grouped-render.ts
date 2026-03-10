import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { AssistantIdentity } from "../assistant-identity.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import { detectTextDirection } from "../text-direction.ts";
import type { AgentCommMeta, MessageGroup } from "../types/chat-types.ts";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown.ts";
import {
  extractTextCached,
  extractThinkingCached,
  formatReasoningMarkdown,
} from "./message-extract.ts";
import {
  isToolResultMessage,
  normalizeRoleForGrouping,
  parseAgentCommPrefix,
} from "./message-normalizer.ts";
import { extractToolCards, renderToolCardSidebar } from "./tool-cards.ts";

type ImageBlock = {
  url: string;
  alt?: string;
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

export function renderReadingIndicatorGroup(assistant?: AssistantIdentity) {
  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
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
) {
  const timestamp = formatMessageTimestamp(startedAt);
  const name = assistant?.name ?? "Assistant";

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
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
    assistantName?: string;
    assistantAvatar?: string | null;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? "Assistant";

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
        // format: agent:<agentId>:<rest>
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
  // Determine if the sender is the human user
  const isGroupUser = group.groupSenderId === "user";

  const who = isGroupChatMsg
    ? (isGroupUser ? "You" : groupSenderName)
    : isAgentComm
      ? firstCommMeta!.senderId
      : normalizedRole === "user"
        ? "You"
        : normalizedRole === "assistant"
          ? assistantName
          : normalizedRole;
  const roleClass = isGroupChatMsg
    ? (isGroupUser ? "user" : "agent-comm")
    : isAgentComm
      ? "agent-comm"
      : normalizedRole === "user"
        ? "user"
        : normalizedRole === "assistant"
          ? "assistant"
          : "other";
  const timestamp = formatMessageTimestamp(group.timestamp);

  // For group chat, build a custom avatar showing the sender's initial
  const groupSenderInitial = isGroupUser
    ? "U"
    : groupSenderName.charAt(0).toUpperCase() || "A";

  return html`
    <div class="chat-group ${roleClass}">
      ${
        isGroupChatMsg
          ? isGroupUser
            ? renderAvatar("user", { name: "You", avatar: null })
            : html`<div class="chat-avatar agent-comm" title="${groupSenderName}">${groupSenderInitial}</div>`
          : renderAvatar(isAgentComm ? "agent-comm" : group.role, {
              name: assistantName,
              avatar: opts.assistantAvatar ?? null,
            })
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
            },
            opts.onOpenSidebar,
          ),
        )}
        <div class="chat-group-footer">
          ${!isAgentComm && !isGroupChatMsg ? html`<span class="chat-sender-name">${who}</span>` : nothing}
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(role: string, assistant?: Pick<AssistantIdentity, "name" | "avatar">) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || "Assistant";
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
    return html`<div class="chat-avatar ${className}">${assistantAvatar}</div>`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith("/") // Relative paths from avatar endpoint
  );
}

/** Badge label & color for each agent communication type */
const AGENT_COMM_TYPE_LABELS: Record<AgentCommMeta["type"], { label: string; cls: string }> = {
  command: { label: "命令", cls: "agent-comm-badge--command" },
  request: { label: "请求", cls: "agent-comm-badge--request" },
  query: { label: "查询", cls: "agent-comm-badge--query" },
  notification: { label: "通知", cls: "agent-comm-badge--notification" },
};

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

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image"
            @click=${() => window.open(img.url, "_blank")}
          />
        `,
      )}
    </div>
  `;
}

function renderGroupedMessage(
  message: unknown,
  opts: { isStreaming: boolean; showReasoning: boolean },
  onOpenSidebar?: (content: string) => void,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const isToolResult =
    isToolResultMessage(message) ||
    role.toLowerCase() === "toolresult" ||
    role.toLowerCase() === "tool_result" ||
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

  const toolCards = extractToolCards(message);
  const hasToolCards = toolCards.length > 0;
  const images = extractImages(message);
  const hasImages = images.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;
  const markdownBase = extractedText?.trim() ? extractedText : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
  const markdown = markdownBase;
  const canCopyMarkdown = role === "assistant" && Boolean(markdown?.trim());

  const bubbleClasses = [
    "chat-bubble",
    canCopyMarkdown ? "has-copy" : "",
    opts.isStreaming ? "streaming" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");

  if (!markdown && hasToolCards && isToolResult) {
    return html`${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}`;
  }

  if (!markdown && !hasToolCards && !hasImages) {
    return nothing;
  }

  return html`
    <div class="${bubbleClasses}">
      ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown!) : nothing}
      ${renderMessageImages(images)}
      ${
        reasoningMarkdown
          ? html`<div class="chat-thinking">${unsafeHTML(
              toSanitizedMarkdownHtml(reasoningMarkdown),
            )}</div>`
          : nothing
      }
      ${
        markdown
          ? html`<div class="chat-text" dir="${detectTextDirection(markdown)}">${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`
          : nothing
      }
      ${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}
    </div>
  `;
}
