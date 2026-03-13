/**
 * Chat thread module — extracted from chat.ts
 *
 * Handles message history building, grouping consecutive messages by role,
 * and generating stable keys for efficient list rendering.
 */
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
import { t } from "../i18n.ts";
import type { ChatProps } from "../types/chat-props.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";

export const CHAT_HISTORY_RENDER_LIMIT = 200;

export function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
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

    // Extract group chat sender info from __group_sender_id / __group_sender_name
    const rawMsg = item.message as Record<string, unknown>;
    const groupSenderId =
      typeof rawMsg.__group_sender_id === "string" ? rawMsg.__group_sender_id : undefined;
    const groupSenderName =
      typeof rawMsg.__group_sender_name === "string" ? rawMsg.__group_sender_name : undefined;

    // Break group when role changes OR when group sender changes (different agents in group chat)
    const senderChanged =
      groupSenderId !== undefined && currentGroup?.groupSenderId !== groupSenderId;

    if (!currentGroup || currentGroup.role !== role || senderChanged) {
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
        groupSenderId,
        groupSenderName,
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

export function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
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
        content: t("chat.history.showing", {
          count: CHAT_HISTORY_RENDER_LIMIT,
          hidden: historyStart,
        }),
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);
    const raw = msg as Record<string, unknown>;
    const marker = raw.__openclaw as Record<string, unknown> | undefined;
    if (marker) {
      if (marker.kind === "compaction") {
        items.push({
          kind: "divider",
          key:
            typeof marker.id === "string"
              ? `divider:compaction:${marker.id}`
              : `divider:compaction:${normalized.timestamp}:${i}`,
          label: t("chat.compaction_divider"),
          timestamp: normalized.timestamp ?? Date.now(),
        });
      }
      // Skip ALL __openclaw internal messages (compaction, session_reset, compaction_flush, etc.)
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
