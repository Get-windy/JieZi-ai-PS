/**
 * 覆盖层：sessions-resolve
 *
 * 在 upstream 基础上增加 label fallback 逻辑：
 * 当 label 找不到活跃会话但匹配到已知 agentId 时，
 * 自动 fallback 到 agent:{agentId}:main，
 * 使消息可投递并自动激活该 agent 的主会话。
 */

import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { loadSessionStore, updateSessionStore } from "../../upstream/src/config/sessions.js";
import { listAgentIds } from "../agents/agent-scope.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { parseSessionLabel } from "../../upstream/src/sessions/session-label.js";
import {
  ErrorCodes,
  type ErrorShape,
  errorShape,
  type SessionsResolveParams,
} from "../../upstream/src/gateway/protocol/index.js";
import {
  listSessionsFromStore,
  loadCombinedSessionStoreForGateway,
  pruneLegacyStoreKeys,
  resolveGatewaySessionStoreTarget,
} from "./session-utils.js";

export type SessionsResolveResult = { ok: true; key: string } | { ok: false; error: ErrorShape };

export async function resolveSessionKeyFromResolveParams(params: {
  cfg: OpenClawConfig;
  p: SessionsResolveParams;
}): Promise<SessionsResolveResult> {
  const { cfg, p } = params;

  const key = typeof p.key === "string" ? p.key.trim() : "";
  const hasKey = key.length > 0;
  const sessionId = typeof p.sessionId === "string" ? p.sessionId.trim() : "";
  const hasSessionId = sessionId.length > 0;
  const hasLabel = typeof p.label === "string" && p.label.trim().length > 0;
  const selectionCount = [hasKey, hasSessionId, hasLabel].filter(Boolean).length;
  if (selectionCount > 1) {
    return {
      ok: false,
      error: errorShape(
        ErrorCodes.INVALID_REQUEST,
        "Provide either key, sessionId, or label (not multiple)",
      ),
    };
  }
  if (selectionCount === 0) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, "Either key, sessionId, or label is required"),
    };
  }

  if (hasKey) {
    const target = resolveGatewaySessionStoreTarget({ cfg, key });
    const store = loadSessionStore(target.storePath);
    if (store[target.canonicalKey]) {
      return { ok: true, key: target.canonicalKey };
    }
    const legacyKey = target.storeKeys.find((candidate) => store[candidate]);
    if (!legacyKey) {
      return {
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `No session found: ${key}`),
      };
    }
    await updateSessionStore(target.storePath, (s) => {
      const canonicalKey = target.canonicalKey;
      // Migrate the first legacy entry to the canonical key.
      if (!s[canonicalKey] && s[legacyKey]) {
        s[canonicalKey] = s[legacyKey];
      }
      pruneLegacyStoreKeys({ store: s, canonicalKey, candidates: target.storeKeys });
    });
    return { ok: true, key: target.canonicalKey };
  }

  if (hasSessionId) {
    const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
    const list = listSessionsFromStore({
      cfg,
      storePath,
      store,
      opts: {
        includeGlobal: p.includeGlobal === true,
        includeUnknown: p.includeUnknown === true,
        spawnedBy: p.spawnedBy,
        agentId: p.agentId,
        search: sessionId,
        limit: 8,
      },
    });
    const matches = list.sessions.filter(
      (session) => session.sessionId === sessionId || session.key === sessionId,
    );
    if (matches.length === 0) {
      return {
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `No session found: ${sessionId}`),
      };
    }
    if (matches.length > 1) {
      const keys = matches.map((session) => session.key).join(", ");
      return {
        ok: false,
        error: errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Multiple sessions found for sessionId: ${sessionId} (${keys})`,
        ),
      };
    }
    return { ok: true, key: String(matches[0]?.key ?? "") };
  }

  const parsedLabel = parseSessionLabel(p.label);
  if (!parsedLabel.ok) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, parsedLabel.error),
    };
  }

  const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
  const list = listSessionsFromStore({
    cfg,
    storePath,
    store,
    opts: {
      includeGlobal: p.includeGlobal === true,
      includeUnknown: p.includeUnknown === true,
      label: parsedLabel.label,
      agentId: p.agentId,
      spawnedBy: p.spawnedBy,
      limit: 2,
    },
  });

  if (list.sessions.length === 0) {
    // Fallback：如果 label 匹配已知 agentId，自动构造默认 session key（agent:{agentId}:main）
    // 即使该 agent 没有活跃会话，消息也能被投递并自动激活其主会话
    const normalizedLabel = normalizeAgentId(parsedLabel.label);
    const knownAgentIds = listAgentIds(cfg);
    if (knownAgentIds.includes(normalizedLabel)) {
      return { ok: true, key: `agent:${normalizedLabel}:main` };
    }
    return {
      ok: false,
      error: errorShape(
        ErrorCodes.INVALID_REQUEST,
        `No session found with label: ${parsedLabel.label}`,
      ),
    };
  }

  if (list.sessions.length > 1) {
    const keys = list.sessions.map((s) => s.key).join(", ");
    return {
      ok: false,
      error: errorShape(
        ErrorCodes.INVALID_REQUEST,
        `Multiple sessions found with label: ${parsedLabel.label} (${keys})`,
      ),
    };
  }

  return { ok: true, key: String(list.sessions[0]?.key ?? "") };
}
