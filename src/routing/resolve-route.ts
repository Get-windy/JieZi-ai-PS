import type { ChatType } from "../../upstream/src/channels/chat-type.js";
import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { shouldLogVerbose } from "../../upstream/src/globals.js";
import { logDebug } from "../../upstream/src/logger.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { AgentChannelBindings } from "../config/types.channel-bindings.js";
import {
  buildAgentMainSessionKey,
  buildAgentPeerSessionKey,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_MAIN_KEY,
  normalizeAccountId,
  normalizeAgentId,
  sanitizeAgentId,
} from "./session-key.js";

/** @deprecated Use ChatType from channels/chat-type.js */
export type RoutePeerKind = ChatType;

export type RoutePeer = {
  kind: ChatType;
  id: string;
};

export type ResolveAgentRouteInput = {
  cfg: OpenClawConfig;
  channel: string;
  accountId?: string | null;
  peer?: RoutePeer | null;
  /** Parent peer for threads — used for binding inheritance when peer doesn't match directly. */
  parentPeer?: RoutePeer | null;
  guildId?: string | null;
  teamId?: string | null;
  /** Discord member role IDs — used for role-based agent routing. */
  memberRoleIds?: string[];
  /**
   * 当该通道账号未绑定任何助手时，系统自动通过 routeReply 回复错误提示给用户的目标地址。
   * 格式与 routeReply 的 `to` 参数相同，例如：`chat:${chatId}`、`user:${senderOpenId}`。
   * 传入后新通道插件无需任何额外处理，系统层会在 isUnbound 时自动原路回复错误提示。
   */
  replyTo?: string;
};

export type ResolvedAgentRoute = {
  agentId: string;
  channel: string;
  accountId: string;
  /** Internal session key used for persistence + concurrency. */
  sessionKey: string;
  /** Convenience alias for direct-chat collapse. */
  mainSessionKey: string;
  /** Which session should receive inbound last-route updates. */
  lastRoutePolicy: "main" | "session";
  /** Match description for debugging/logging. */
  matchedBy:
    | "binding.peer"
    | "binding.peer.parent"
    | "binding.guild+roles"
    | "binding.guild"
    | "binding.team"
    | "binding.account"
    | "binding.channel"
    | "default";
  /**
   * True when no binding matched this channel+account — the message arrived on
   * an account that has not been assigned to any agent.
   * Callers MUST reply with an error and drop the message instead of processing it.
   */
  isUnbound?: boolean;
};

export { DEFAULT_ACCOUNT_ID, DEFAULT_AGENT_ID } from "./session-key.js";

export function deriveLastRoutePolicy(params: {
  sessionKey: string;
  mainSessionKey: string;
}): ResolvedAgentRoute["lastRoutePolicy"] {
  return params.sessionKey === params.mainSessionKey ? "main" : "session";
}

export function resolveInboundLastRouteSessionKey(params: {
  route: Pick<ResolvedAgentRoute, "lastRoutePolicy" | "mainSessionKey">;
  sessionKey: string;
}): string {
  return params.route.lastRoutePolicy === "main" ? params.route.mainSessionKey : params.sessionKey;
}

function normalizeToken(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeId(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value).trim();
  }
  return "";
}

export function buildAgentSessionKey(params: {
  agentId: string;
  channel: string;
  accountId?: string | null;
  peer?: RoutePeer | null;
  /** DM session scope. */
  dmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
  identityLinks?: Record<string, string[]>;
}): string {
  const channel = normalizeToken(params.channel) || "unknown";
  const peer = params.peer;
  return buildAgentPeerSessionKey({
    agentId: params.agentId,
    mainKey: DEFAULT_MAIN_KEY,
    channel,
    accountId: params.accountId,
    peerKind: peer?.kind ?? "direct",
    peerId: peer ? normalizeId(peer.id) || "unknown" : null,
    dmScope: params.dmScope,
    identityLinks: params.identityLinks,
  });
}

function listAgents(cfg: OpenClawConfig) {
  const agents = cfg.agents?.list;
  return Array.isArray(agents) ? agents : [];
}

export function pickFirstExistingAgentId(cfg: OpenClawConfig, agentId: string): string {
  const trimmed = (agentId ?? "").trim();
  if (!trimmed) {
    return sanitizeAgentId(resolveDefaultAgentId(cfg));
  }
  const normalized = normalizeAgentId(trimmed);
  const agents = listAgents(cfg);
  if (agents.length === 0) {
    return sanitizeAgentId(trimmed);
  }
  const match = agents.find((agent) => normalizeAgentId(agent.id) === normalized);
  if (match?.id?.trim()) {
    return sanitizeAgentId(match.id.trim());
  }
  return sanitizeAgentId(resolveDefaultAgentId(cfg));
}

/**
 * 获取指定 agent 在某通道的第一个已启用 channelBindings accountId。
 * 用于系统级兜底：心跳/任务等系统消息找不到 accountId 时，使用该 agent 绑定的默认账号。
 */
export function resolveAgentChannelAccountId(
  cfg: OpenClawConfig,
  agentId: string,
  channel: string,
): string | null {
  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const normalizedAgentId = normalizeAgentId(agentId);
  const normalizedChannel = normalizeToken(channel);
  for (const agent of agents) {
    if (normalizeAgentId(typeof agent.id === "string" ? agent.id : "") !== normalizedAgentId) {
      continue;
    }
    const channelBindings = (agent as { channelBindings?: AgentChannelBindings }).channelBindings;
    if (!channelBindings?.bindings) {
      continue;
    }
    for (const b of channelBindings.bindings) {
      if (b.enabled === false) {
        continue;
      }
      const bChannel = (b.channelId ?? "").trim().toLowerCase();
      const bAccount = normalizeAccountId(b.accountId ?? "");
      if (bChannel === normalizedChannel && bAccount) {
        return bAccount;
      }
    }
  }
  return null;
}

/**
 * 获取系统默认 agent 在某通道的第一个 channelBindings accountId。
 * 心跳/任务等系统消息无法确定 accountId 时的最终兜底。
 */
export function resolveDefaultAgentChannelAccount(
  cfg: OpenClawConfig,
  channel: string,
): string | null {
  const defaultAgentId = resolveDefaultAgentId(cfg);
  return resolveAgentChannelAccountId(cfg, defaultAgentId, channel);
}

/**
 * 按账号归属查找绑定该账号的 agent（新机制 channelBindings）。
 * 语义：一个通道账号只能属于一个 agent，找到即直接返回，无需其他优先级。
 */
function resolveAgentByChannelAccountOwnership(
  cfg: OpenClawConfig,
  channel: string,
  accountId: string,
): string | null {
  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  for (const agent of agents) {
    const agentId = typeof agent.id === "string" ? agent.id.trim() : "";
    if (!agentId) {
      continue;
    }
    const channelBindings = (agent as { channelBindings?: AgentChannelBindings }).channelBindings;
    if (!channelBindings?.bindings) {
      continue;
    }
    for (const b of channelBindings.bindings) {
      if (b.enabled === false) {
        continue;
      }
      const bChannel = (b.channelId ?? "").trim().toLowerCase();
      const bAccount = normalizeAccountId(b.accountId ?? "");
      if (bChannel === channel && bAccount === accountId) {
        return agentId;
      }
    }
  }
  return null;
}

export function resolveAgentRoute(input: ResolveAgentRouteInput): ResolvedAgentRoute {
  const channel = normalizeToken(input.channel);
  const accountId = normalizeAccountId(input.accountId);
  const peer = input.peer ? { kind: input.peer.kind, id: normalizeId(input.peer.id) } : null;

  const dmScope = input.cfg.session?.dmScope ?? "main";
  const identityLinks = input.cfg.session?.identityLinks;

  const choose = (agentId: string, matchedBy: ResolvedAgentRoute["matchedBy"]) => {
    const resolvedAgentId = pickFirstExistingAgentId(input.cfg, agentId);
    const sessionKey = buildAgentSessionKey({
      agentId: resolvedAgentId,
      channel,
      accountId,
      peer,
      dmScope,
      identityLinks,
    }).toLowerCase();
    const mainSessionKey = buildAgentMainSessionKey({
      agentId: resolvedAgentId,
      mainKey: DEFAULT_MAIN_KEY,
    }).toLowerCase();
    return {
      agentId: resolvedAgentId,
      channel,
      accountId,
      sessionKey,
      mainSessionKey,
      lastRoutePolicy: deriveLastRoutePolicy({ sessionKey, mainSessionKey }),
      matchedBy,
    };
  };

  // 第一优先级：按通道账号归属路由（新机制 channelBindings）。
  // 语义：一个通道账号只能属于一个 agent，账号归属即路由目标，无需其他优先级。
  const ownerAgentId = resolveAgentByChannelAccountOwnership(input.cfg, channel, accountId);
  if (ownerAgentId) {
    if (shouldLogVerbose()) {
      logDebug(
        `[routing] match: matchedBy=binding.account agentId=${ownerAgentId} (channelBindings ownership)`,
      );
    }
    return choose(ownerAgentId, "binding.account");
  }

  // 账号未绑定任何 agent：触发 onUnbound 回调（通道用自己的发送接口原路回复错误提示），然后返回 isUnbound 路由。
  // 相当于「空号」——该通道账号尚未分配给任何助手，拒绝处理消息。
  const unboundRoute = choose(resolveDefaultAgentId(input.cfg), "default");
  const result: ResolvedAgentRoute = { ...unboundRoute, isUnbound: true };
  if (shouldLogVerbose()) {
    logDebug(
      `[routing] unbound: channel=${channel} accountId=${accountId} — no channelBindings found, dropping message`,
    );
  }
  if (input.replyTo) {
    // 系统层直接调用统一的 routeReply 接口原路回复错误，fire-and-forget
    const replyTo = input.replyTo;
    void import("../auto-reply/reply/route-reply.js").then(({ routeReply }) =>
      routeReply({
        payload: {
          text: "⚠️ 该通道账号尚未绑定助手，无法处理您的消息。请联系管理员在助手管理页面绑定该账号。",
        },
        channel: result.channel,
        to: replyTo,
        accountId: result.accountId,
        cfg: input.cfg,
        mirror: false,
      }).catch(() => {
        // 忽略发送失败，不影响路由结果返回
      }),
    );
  }
  return result;
}
