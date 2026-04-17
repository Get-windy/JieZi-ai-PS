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

/**
 * Slack/Discord 风格：同一发言者连续消息超过此时间窗口则断开新建分组
 * 标准业界实践：5 分钟（Discord = 7min，Slack = 5min，取 Slack 标准）
 */
const GROUP_TIME_WINDOW_MS = 5 * 60 * 1000;

// ── groupMessages memoization (业界最佳实践：避免每帧 O(n) 重算) ───────────────────
// Cache keyed by (items.length, last message key, last message timestamp).
// This handles the common case where only new messages are appended.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let _groupCache: {
  itemsLength: number;
  lastKey: string;
  lastTs: number;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  result: Array<ChatItem | MessageGroup>;
} | null = null;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  // Memoization: return cached result if input hasn't changed
  // Cache key: items.length + last item's key + last message item's timestamp
  const lastItem = items.length > 0 ? items[items.length - 1] : null;
  const lastKey = lastItem?.key ?? "";
  const lastTs =
    lastItem?.kind === "message"
      ? (((lastItem.message as Record<string, unknown>).timestamp as number) ?? 0)
      : 0;
  if (
    _groupCache !== null &&
    _groupCache.itemsLength === items.length &&
    _groupCache.lastKey === lastKey &&
    _groupCache.lastTs === lastTs
  ) {
    return _groupCache.result;
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  const result: Array<ChatItem | MessageGroup> = [];
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  let currentGroup: MessageGroup | null = null;
  // Track the timestamp of the last message in the current group (for time-window check)
  let lastMsgTimestamp: number = 0;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
        lastMsgTimestamp = 0;
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

    // Slack/Discord style: break group when time gap exceeds the time window
    const timeWindowExpired =
      currentGroup !== null &&
      lastMsgTimestamp > 0 &&
      timestamp - lastMsgTimestamp > GROUP_TIME_WINDOW_MS;

    if (!currentGroup || currentGroup.role !== role || senderChanged || timeWindowExpired) {
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
    lastMsgTimestamp = timestamp;
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  // Update memoization cache
  _groupCache = { itemsLength: items.length, lastKey, lastTs, result };
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    // 对抗-P0 修复：截断提示明确显示「共N条，当前仅显示最新200条」
    // 原版只显示「显示最新200条」，用户不知道有多少条被隐藏，无法判断是否需要刷新/导出
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: t("chat.history.showing", {
          count: CHAT_HISTORY_RENDER_LIMIT,
          hidden: historyStart,
          total: history.length,
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

  // Multi-agent concurrent streaming (Open WebUI / AutoGen Studio style)
  // If props.streams is set, render each agent's stream independently.
  // Agents already covered by props.stream (same key) are skipped to avoid duplication.
  if (props.streams && props.streams.size > 0) {
    for (const [agentId, streamState] of props.streams) {
      const key = `streams:${agentId}:${streamState.startedAt}`;
      if (streamState.text.trim().length > 0) {
        items.push({
          kind: "stream",
          key,
          text: streamState.text,
          startedAt: streamState.startedAt,
          // Pass senderName via extra field for multi-agent display
          senderName: streamState.senderName ?? agentId,
          // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
        } as ChatItem & { senderName?: string });
      } else {
        items.push({
          kind: "reading-indicator",
          key,
          senderName: streamState.senderName ?? agentId,
          // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
        } as ChatItem & { senderName?: string });
      }
    }
  }

  return groupMessages(items);
}

/**
 * 对抗-P0：messageKey 生成策略强化
 * 原实现在无 id/toolCallId/timestamp 时降级为纯 index，导致消息列表在流式更新时
 * repeat() 产生大量错误的 DOM 复用（新消息复用旧节点）。
 * 改进：用 role+content摘要+index 三重兜底，大幅降低冲突概率。
 */
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
  // 对抗-P0 修复：用内容摘要（前32字符hash-like替换）作为最后兜底，避免纯 index
  const content = m.content;
  let contentSnippet = "";
  if (typeof content === "string") {
    contentSnippet = content.slice(0, 32).replace(/\s+/g, "");
  } else if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown>;
    contentSnippet =
      typeof first.text === "string" ? first.text.slice(0, 32).replace(/\s+/g, "") : "";
  }
  if (contentSnippet) {
    return `msg:${role}:cs:${contentSnippet}:${index}`;
  }
  return `msg:${role}:idx:${index}`;
}
