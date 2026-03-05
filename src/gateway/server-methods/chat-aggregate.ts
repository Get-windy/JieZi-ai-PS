/**
 * chat.history.aggregate — 多会话聚合历史查询接口（本地扩展）
 *
 * 功能：
 *   接受多个 sessionKey，读取各自的消息历史，
 *   按时间戳合并排序，每条消息附加来源 sessionKey、displayName 等元数据。
 *
 * 不影响上游：该文件是本地新增，上游同步不会覆盖。
 */

import { loadConfig } from "../../config/config.js";
import { resolveStorePath, loadSessionStore } from "../../config/sessions.js";
import { stripEnvelopeFromMessages } from "../chat-sanitize.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { getMaxChatHistoryMessagesBytes } from "../server-constants.js";
import {
  capArrayByJsonBytes,
  listSessionsFromStore,
  loadSessionEntry,
  readSessionMessages,
} from "../session-utils.js";
import type { GatewayRequestHandlers } from "./types.js";

/** 单条聚合消息（带来源元数据） */
type AggregatedMessage = {
  /** 来源 sessionKey */
  sessionKey: string;
  /** 来源会话的人类可读名称（如 "飞书 · 张三"） */
  displayName: string;
  /** 消息内容（同 chat.history 的 messages 格式） */
  message: unknown;
  /** 消息时间戳（ms），用于排序；可能为 null */
  ts: number | null;
};

/** 聚合接口的响应类型 */
type AggregateResult = {
  messages: AggregatedMessage[];
  sessionCount: number;
  truncated: boolean;
};

const AGGREGATE_HARD_MAX = 500; // 聚合结果最多返回 N 条
const AGGREGATE_DEFAULT_LIMIT = 200;

/**
 * 从消息对象中提取时间戳（兼容多种格式）。
 */
function extractTimestamp(message: unknown): number | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  // 常见字段：ts / timestamp / createdAt / time
  for (const field of ["ts", "timestamp", "createdAt", "time"]) {
    const val = m[field];
    if (typeof val === "number" && val > 0) {
      return val;
    }
    if (typeof val === "string") {
      const n = Date.parse(val);
      if (!isNaN(n)) {
        return n;
      }
    }
  }
  return null;
}

/**
 * 从 sessionKey 生成 fallback displayName（无 sessions.list 元数据时使用）。
 */
function fallbackDisplayName(sessionKey: string): string {
  // agent:main:channel:feishu:user123 → "feishu · user123"
  const channelMatch = sessionKey.match(/channel:([^:]+):(.+)$/);
  if (channelMatch) {
    const ch = channelMatch[1];
    const id = channelMatch[2];
    const labels: Record<string, string> = {
      feishu: "飞书",
      dingtalk: "钉钉",
      telegram: "Telegram",
      discord: "Discord",
      slack: "Slack",
      whatsapp: "WhatsApp",
      wechat: "微信",
    };
    return `${labels[ch] ?? ch} · ${id}`;
  }
  // agent:main:group:xxx → "群聊 xxx"
  const groupMatch = sessionKey.match(/:group:(.+)$/);
  if (groupMatch) {
    return `群聊 ${groupMatch[1]}`;
  }
  // agent:main:main → "主会话"
  if (sessionKey === "main" || sessionKey.endsWith(":main")) {
    return "主会话";
  }
  return sessionKey;
}

export const chatAggregateHandlers: GatewayRequestHandlers = {
  /**
   * chat.history.aggregate
   *
   * params:
   *   - sessionKeys?: string[]    // 指定要聚合的 sessionKey 列表
   *   - autoDiscover?: boolean    // true 时自动发现所有活跃会话（忽略 sessionKeys）
   *   - limit?: number            // 最终返回的消息总数上限（default 200, max 500）
   *   - activeMinutes?: number    // autoDiscover 时只取最近 N 分钟活跃的会话
   *
   * response:
   *   - messages: AggregatedMessage[]
   *   - sessionCount: number
   *   - truncated: boolean
   */
  "chat.history.aggregate": async ({ params, respond }) => {
    const p = params as {
      sessionKeys?: unknown;
      autoDiscover?: unknown;
      limit?: unknown;
      activeMinutes?: unknown;
    };

    const limit =
      typeof p.limit === "number"
        ? Math.min(AGGREGATE_HARD_MAX, Math.max(1, Math.floor(p.limit)))
        : AGGREGATE_DEFAULT_LIMIT;
    const autoDiscover = p.autoDiscover === true;

    // === 1. 确定要聚合的 sessionKey 列表 ===
    let targetKeys: string[] = [];

    if (autoDiscover) {
      // 自动发现：用 sessions.list 逻辑遍历所有活跃会话
      try {
        const cfg = loadConfig();
        const storePath = resolveStorePath(cfg.session?.store, { agentId: undefined });
        const store = loadSessionStore(storePath);
        const result = listSessionsFromStore({
          cfg,
          storePath,
          store,
          opts: {
            includeGlobal: false,
            includeUnknown: false,
            includeDerivedTitles: false,
            includeLastMessage: false,
            ...(typeof p.activeMinutes === "number" ? { activeMinutes: p.activeMinutes } : {}),
            // 最多取 200 个会话（每个最多取 limit/200 条消息）
            limit: 200,
          },
        });
        targetKeys = result.sessions.map((s) => s.key);
      } catch {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "Failed to discover sessions"),
        );
        return;
      }
    } else {
      // 使用传入的 sessionKeys
      if (!Array.isArray(p.sessionKeys) || p.sessionKeys.length === 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "sessionKeys must be a non-empty array, or set autoDiscover=true",
          ),
        );
        return;
      }
      targetKeys = p.sessionKeys.filter((k): k is string => typeof k === "string" && k.length > 0);
      if (targetKeys.length === 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "sessionKeys must contain at least one valid string",
          ),
        );
        return;
      }
    }

    // === 2. 为每个 sessionKey 读取消息 ===
    const maxHistoryBytes = getMaxChatHistoryMessagesBytes();

    // 构建 displayName 映射（优先用 sessions.list 元数据，fallback 用 key 解析）
    const displayNameMap = new Map<string, string>();
    try {
      const cfg = loadConfig();
      const storePath = resolveStorePath(cfg.session?.store, { agentId: undefined });
      const store = loadSessionStore(storePath);
      const result = listSessionsFromStore({
        cfg,
        storePath,
        store,
        opts: {
          includeDerivedTitles: true,
          includeLastMessage: false,
          includeGlobal: false,
          includeUnknown: false,
        },
      });
      for (const s of result.sessions) {
        const name = s.displayName ?? s.label ?? fallbackDisplayName(s.key);
        displayNameMap.set(s.key, name);
      }
    } catch {
      // ignore — fallback displayName will be used
    }

    const allMessages: AggregatedMessage[] = [];
    let truncated = false;

    for (const sessionKey of targetKeys) {
      try {
        const { entry, storePath } = loadSessionEntry(sessionKey);
        const sessionId = entry?.sessionId;
        if (!sessionId || !storePath) {
          continue;
        }

        const raw = readSessionMessages(sessionId, storePath, entry?.sessionFile);
        const stripped = stripEnvelopeFromMessages(raw);
        const capped = capArrayByJsonBytes(stripped, maxHistoryBytes).items;

        const displayName = displayNameMap.get(sessionKey) ?? fallbackDisplayName(sessionKey);

        for (const msg of capped) {
          allMessages.push({
            sessionKey,
            displayName,
            message: msg,
            ts: extractTimestamp(msg),
          });
        }
      } catch {
        // 读取单个会话失败，跳过，不影响其他会话
        continue;
      }
    }

    // === 3. 按时间戳排序（null 排最后） ===
    allMessages.sort((a, b) => {
      if (a.ts === null && b.ts === null) {
        return 0;
      }
      if (a.ts === null) {
        return 1;
      }
      if (b.ts === null) {
        return -1;
      }
      return a.ts - b.ts;
    });

    // === 4. 裁剪到 limit ===
    let finalMessages = allMessages;
    if (allMessages.length > limit) {
      // 取最新的 limit 条（末尾）
      finalMessages = allMessages.slice(allMessages.length - limit);
      truncated = true;
    }

    respond(true, {
      messages: finalMessages,
      sessionCount: targetKeys.length,
      truncated,
    } satisfies AggregateResult);
  },
};
