import { extractText } from "../chat/message-extract.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  AggregatedMessage,
  ChatConversationContext,
  ChatHistoryAggregateResult,
} from "../types.ts";
import type { ChatAttachment } from "../ui-types.ts";
import { generateUUID } from "../uuid.ts";

export type ChatState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  lastError: string | null;
  /** 聚合视图的消息列表（只在 type=all 时使用） */
  chatAggregatedMessages?: AggregatedMessage[] | null;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

// ============ Z5: 竞态保护 ============
// Module-level counter to guard against stale loadChatHistory responses
let _chatLoadRequestId = 0;

export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) {
    console.warn(
      "[Chat:调试] loadChatHistory 跳过：client=",
      !!state.client,
      "connected=",
      state.connected,
    );
    return;
  }
  const requestId = ++_chatLoadRequestId;
  console.log(
    `[Chat:调试] loadChatHistory 开始请求 sessionKey="${state.sessionKey}" requestId=${requestId}`,
  );
  state.chatLoading = true;
  state.lastError = null;
  try {
    const res = await state.client.request<{ messages?: Array<unknown>; thinkingLevel?: string }>(
      "chat.history",
      {
        sessionKey: state.sessionKey,
        limit: 200,
      },
    );
    // Z5: 竞态保护 — 如果在请求期间 sessionKey 已切换（新请求已发出），丢弃本次过期响应
    if (requestId !== _chatLoadRequestId) {
      console.warn(
        `[Chat:调试] loadChatHistory 竞态丢弃 requestId=${requestId}，当前=${_chatLoadRequestId}`,
      );
      return;
    }
    const msgCount = Array.isArray(res.messages) ? res.messages.length : 0;
    console.log(
      `[Chat:调试] loadChatHistory 响应 sessionKey="${state.sessionKey}" 消息数=${msgCount}`,
      res,
    );
    state.chatMessages = Array.isArray(res.messages) ? res.messages : [];
    state.chatThinkingLevel = res.thinkingLevel ?? null;
  } catch (err) {
    if (requestId !== _chatLoadRequestId) {
      return;
    }
    console.error("[Chat:调试] loadChatHistory 错误:", err);
    state.lastError = String(err);
  } finally {
    // Only clear loading if this is still the latest request
    if (requestId === _chatLoadRequestId) {
      state.chatLoading = false;
    }
  }
}

// ============ Z1: 上下文感知的数据加载 ============

/**
 * 加载聚合历史（全部会话节点使用）。
 * 调用 chat.history.aggregate 接口，自动发现所有活跃会话并合并消息按时间排序。
 */
export async function loadAggregatedHistory(state: ChatState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.chatLoading = true;
  state.lastError = null;
  state.chatAggregatedMessages = null;
  try {
    const res = await state.client.request<ChatHistoryAggregateResult>("chat.history.aggregate", {
      autoDiscover: true,
      limit: 200,
      activeMinutes: 60 * 24 * 30, // 最近 30 天活跃
    });
    state.chatAggregatedMessages = Array.isArray(res.messages) ? res.messages : [];
    // 聚合视图：chatMessages 也填充（展示层按 chatAggregatedMessages 优先）
    state.chatMessages = state.chatAggregatedMessages.map((m) => m.message);
  } catch (err) {
    state.lastError = String(err);
    console.error("[Chat] loadAggregatedHistory error:", err);
  } finally {
    state.chatLoading = false;
  }
}

// ============ Z1: 上下文感知的数据加载 ============

/**
 * 将 ConversationContext 解析为后端实际可识别的 sessionKey。
 *
 * 群组 sessionKey 格式：agent:{agentId}:group:{groupId}
 * 后端 loadSessionEntry 能通过 parseAgentSessionKey 正确解析此格式。
 *
 * 通道 sessionKey 后端已支持（如 "main:channel:discord:account123"），直接使用。
 */
export function resolveBackendSessionKey(context: ChatConversationContext): string {
  const key = (() => {
    switch (context.type) {
      case "agent-direct":
      case "channel-observe":
        return context.sessionKey;
      case "all":
      case "agent-all":
      case "channels-all":
        return context.sessionKey;
      case "group":
        return context.sessionKey;
      case "contact":
        // 好友对话：直接读取目标 agent 的 main session
        // agent_communicate 工具产生的消息存储在目标 agent 的 main session 里
        return `agent:${context.contactAgentId}:main`;
      case "session-history":
        return context.sessionKey;
    }
  })();
  console.log(
    `[Chat:调试] resolveBackendSessionKey type="${context.type}" context.sessionKey="${context.sessionKey}" → 解析后="${key}"`,
  );
  return key;
}

/**
 * 判断一个 chat 事件是否应该被当前上下文接受并处理。
 *
 * 用于 Z2 上下文感知的实时事件路由：
 * - all 视图接受所有事件
 * - agent-all 视图接受该 agent 的所有事件
 * - channels-all 视图接受该 agent 的所有通道事件
 * - 其他视图精确匹配 state.sessionKey
 */
export function shouldAcceptEventForContext(
  eventSessionKey: string,
  stateSessionKey: string,
  context?: ChatConversationContext | null,
): boolean {
  if (!context) {
    // 无上下文时回退到精确匹配（向后兼容）
    return eventSessionKey === stateSessionKey;
  }
  switch (context.type) {
    case "all":
      // 全局聚合视图：接受所有 sessionKey 的事件
      return true;
    case "agent-all": {
      // 单个智能体聚合：接受以 agentId: 开头的事件
      const prefix = context.agentId + ":";
      return eventSessionKey.startsWith(prefix);
    }
    case "channels-all": {
      // 全部通道聚合：接受以 agentId:channel: 开头的事件
      const prefix = context.agentId + ":channel:";
      return eventSessionKey.startsWith(prefix);
    }
    case "agent-direct":
    case "channel-observe":
    case "group":
    case "contact":
      // contact 类型：直接匹配目标 agent main session（即 resolveBackendSessionKey 返回的 key）
      return eventSessionKey === stateSessionKey;
    default:
      return eventSessionKey === stateSessionKey;
  }
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

type AssistantMessageNormalizationOptions = {
  roleRequirement: "required" | "optional";
  roleCaseSensitive?: boolean;
  requireContentArray?: boolean;
  allowTextField?: boolean;
};

function normalizeAssistantMessage(
  message: unknown,
  options: AssistantMessageNormalizationOptions,
): Record<string, unknown> | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const candidate = message as Record<string, unknown>;
  const roleValue = candidate.role;
  if (typeof roleValue === "string") {
    const role = options.roleCaseSensitive ? roleValue : roleValue.toLowerCase();
    if (role !== "assistant") {
      return null;
    }
  } else if (options.roleRequirement === "required") {
    return null;
  }

  if (options.requireContentArray) {
    return Array.isArray(candidate.content) ? candidate : null;
  }
  if (!("content" in candidate) && !(options.allowTextField && "text" in candidate)) {
    return null;
  }
  return candidate;
}

function normalizeAbortedAssistantMessage(message: unknown): Record<string, unknown> | null {
  return normalizeAssistantMessage(message, {
    roleRequirement: "required",
    roleCaseSensitive: true,
    requireContentArray: true,
  });
}

function normalizeFinalAssistantMessage(message: unknown): Record<string, unknown> | null {
  return normalizeAssistantMessage(message, {
    roleRequirement: "optional",
    allowTextField: true,
  });
}

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const msg = message.trim();
  const hasAttachments = attachments && attachments.length > 0;
  if (!msg && !hasAttachments) {
    return null;
  }

  const now = Date.now();

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  // Add image previews to the message for display
  if (hasAttachments) {
    for (const att of attachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
      });
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: now,
    },
  ];

  state.chatSending = true;
  state.lastError = null;
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = now;

  // Convert attachments to API format
  const apiAttachments = hasAttachments
    ? attachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("chat.send", {
      sessionKey: state.sessionKey,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
    });
    return runId;
  } catch (err) {
    const error = String(err);
    console.error("[Chat] sendChatMessage error:", err);
    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.lastError = error;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  const runId = state.chatRunId;
  try {
    await state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    return true;
  } catch (err) {
    state.lastError = String(err);
    return false;
  }
}

export function handleChatEvent(
  state: ChatState,
  payload?: ChatEventPayload,
  currentContext?: ChatConversationContext | null,
) {
  if (!payload) {
    return null;
  }

  // Z2: 上下文感知的事件路由，替代原来的简单 sessionKey 字符串比对
  const accepted = shouldAcceptEventForContext(
    payload.sessionKey,
    state.sessionKey,
    currentContext,
  );
  if (!accepted) {
    return null;
  }

  // Final from another run (e.g. sub-agent announce): refresh history to show new message.
  // See https://github.com/openclaw/openclaw/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    if (payload.state === "final") {
      const finalMessage = normalizeFinalAssistantMessage(payload.message);
      if (finalMessage) {
        state.chatMessages = [...state.chatMessages, finalMessage];
        return null;
      }
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    const next = extractText(payload.message);
    if (typeof next === "string") {
      const current = state.chatStream ?? "";
      if (!current || next.length >= current.length) {
        state.chatStream = next;
      }
    }
  } else if (payload.state === "final") {
    const finalMessage = normalizeFinalAssistantMessage(payload.message);
    if (finalMessage) {
      state.chatMessages = [...state.chatMessages, finalMessage];
    }
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "aborted") {
    const normalizedMessage = normalizeAbortedAssistantMessage(payload.message);
    if (normalizedMessage) {
      state.chatMessages = [...state.chatMessages, normalizedMessage];
    } else {
      const streamedText = state.chatStream ?? "";
      if (streamedText.trim()) {
        state.chatMessages = [
          ...state.chatMessages,
          {
            role: "assistant",
            content: [{ type: "text", text: streamedText }],
            timestamp: Date.now(),
          },
        ];
      }
    }
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "error") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.lastError = payload.errorMessage ?? "chat error";
  }
  return payload.state;
}
