import type { ChatType } from "../../upstream/src/channels/chat-type.js";
import { normalizeChatType } from "../../upstream/src/channels/chat-type.js";
import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { shouldLogVerbose } from "../../upstream/src/globals.js";
import { logDebug } from "../../upstream/src/logger.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { AgentChannelBindings } from "../config/types.channel-bindings.js";
import { listBindings } from "./bindings.js";
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

function matchesAccountId(match: string | undefined, actual: string): boolean {
  const trimmed = (match ?? "").trim();
  if (!trimmed) {
    return actual === DEFAULT_ACCOUNT_ID;
  }
  if (trimmed === "*") {
    return true;
  }
  return normalizeAccountId(trimmed) === actual;
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

function matchesChannel(
  match: { channel?: string | undefined } | undefined,
  channel: string,
): boolean {
  const key = normalizeToken(match?.channel);
  if (!key) {
    return false;
  }
  return key === channel;
}

type NormalizedPeerConstraint =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "valid"; kind: ChatType; id: string };

type NormalizedBindingMatch = {
  accountPattern: string;
  peer: NormalizedPeerConstraint;
  guildId: string | null;
  teamId: string | null;
  roles: string[] | null;
};

type EvaluatedBinding = {
  binding: ReturnType<typeof listBindings>[number];
  match: NormalizedBindingMatch;
};

type BindingScope = {
  peer: RoutePeer | null;
  guildId: string;
  teamId: string;
  memberRoleIds: Set<string>;
};

type EvaluatedBindingsCache = {
  /**
   * 用于检测旧的全局 config.bindings 是否变更。
   * 新的 channelBindings 存储在各 agent 内，通过 agentsRef 跟踪。
   */
  bindingsRef: OpenClawConfig["bindings"];
  agentsRef: OpenClawConfig["agents"];
  byChannelAccount: Map<string, EvaluatedBinding[]>;
};

const evaluatedBindingsCacheByCfg = new WeakMap<OpenClawConfig, EvaluatedBindingsCache>();
const MAX_EVALUATED_BINDINGS_CACHE_KEYS = 2000;

function getEvaluatedBindingsForChannelAccount(
  cfg: OpenClawConfig,
  channel: string,
  accountId: string,
): EvaluatedBinding[] {
  const bindingsRef = cfg.bindings;
  const agentsRef = cfg.agents;
  const existing = evaluatedBindingsCacheByCfg.get(cfg);
  const cache =
    existing && existing.bindingsRef === bindingsRef && existing.agentsRef === agentsRef
      ? existing
      : { bindingsRef, agentsRef, byChannelAccount: new Map<string, EvaluatedBinding[]>() };
  if (cache !== existing) {
    evaluatedBindingsCacheByCfg.set(cfg, cache);
  }

  const cacheKey = `${channel}\t${accountId}`;
  const hit = cache.byChannelAccount.get(cacheKey);
  if (hit) {
    return hit;
  }

  // 1. 旧的全局路由绑定（config.bindings[]）
  const evaluated: EvaluatedBinding[] = listBindings(cfg).flatMap((binding) => {
    if (!binding || typeof binding !== "object") {
      return [];
    }
    if (!matchesChannel(binding.match, channel)) {
      return [];
    }
    if (!matchesAccountId(binding.match?.accountId, accountId)) {
      return [];
    }
    return [{ binding, match: normalizeBindingMatch(binding.match) }];
  });

  // 2. 新的 channelBindings（存储在各 agent 配置里），合并进路由候选列表
  // channelBindings 只有 channelId + accountId，没有 peer/guild/roles 约束，
  // 等价于最基础的 account 级匹配（accountPattern = accountId）。
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
      if (!b.enabled && b.enabled !== undefined) {
        continue;
      }
      const bChannel = (b.channelId ?? "").trim().toLowerCase();
      const bAccount = normalizeAccountId(b.accountId ?? "");
      if (bChannel !== channel) {
        continue;
      }
      if (bAccount !== accountId) {
        continue;
      }
      // 构造等价的 AgentRouteBinding 以复用现有路由逻辑
      const syntheticBinding = {
        type: "route" as const,
        agentId,
        match: { channel: b.channelId, accountId: b.accountId },
      };
      evaluated.push({
        binding: syntheticBinding,
        match: normalizeBindingMatch(syntheticBinding.match),
      });
    }
  }

  cache.byChannelAccount.set(cacheKey, evaluated);
  if (cache.byChannelAccount.size > MAX_EVALUATED_BINDINGS_CACHE_KEYS) {
    cache.byChannelAccount.clear();
    cache.byChannelAccount.set(cacheKey, evaluated);
  }

  return evaluated;
}

function normalizePeerConstraint(
  peer: { kind?: string; id?: string } | undefined,
): NormalizedPeerConstraint {
  if (!peer) {
    return { state: "none" };
  }
  const kind = normalizeChatType(peer.kind);
  const id = normalizeId(peer.id);
  if (!kind || !id) {
    return { state: "invalid" };
  }
  return { state: "valid", kind, id };
}

function normalizeBindingMatch(
  match:
    | {
        accountId?: string | undefined;
        peer?: { kind?: string; id?: string } | undefined;
        guildId?: string | undefined;
        teamId?: string | undefined;
        roles?: string[] | undefined;
      }
    | undefined,
): NormalizedBindingMatch {
  const rawRoles = match?.roles;
  return {
    accountPattern: (match?.accountId ?? "").trim(),
    peer: normalizePeerConstraint(match?.peer),
    guildId: normalizeId(match?.guildId) || null,
    teamId: normalizeId(match?.teamId) || null,
    roles: Array.isArray(rawRoles) && rawRoles.length > 0 ? rawRoles : null,
  };
}

function hasGuildConstraint(match: NormalizedBindingMatch): boolean {
  return Boolean(match.guildId);
}

function hasTeamConstraint(match: NormalizedBindingMatch): boolean {
  return Boolean(match.teamId);
}

function hasRolesConstraint(match: NormalizedBindingMatch): boolean {
  return Boolean(match.roles);
}

function matchesBindingScope(match: NormalizedBindingMatch, scope: BindingScope): boolean {
  if (match.peer.state === "invalid") {
    return false;
  }
  if (match.peer.state === "valid") {
    if (!scope.peer || scope.peer.kind !== match.peer.kind || scope.peer.id !== match.peer.id) {
      return false;
    }
  }
  if (match.guildId && match.guildId !== scope.guildId) {
    return false;
  }
  if (match.teamId && match.teamId !== scope.teamId) {
    return false;
  }
  if (match.roles) {
    for (const role of match.roles) {
      if (scope.memberRoleIds.has(role)) {
        return true;
      }
    }
    return false;
  }
  return true;
}

export function resolveAgentRoute(input: ResolveAgentRouteInput): ResolvedAgentRoute {
  const channel = normalizeToken(input.channel);
  const accountId = normalizeAccountId(input.accountId);
  const peer = input.peer ? { kind: input.peer.kind, id: normalizeId(input.peer.id) } : null;
  const guildId = normalizeId(input.guildId);
  const teamId = normalizeId(input.teamId);
  const memberRoleIds = input.memberRoleIds ?? [];
  const memberRoleIdSet = new Set(memberRoleIds);

  const bindings = getEvaluatedBindingsForChannelAccount(input.cfg, channel, accountId);

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

  const shouldLogDebug = shouldLogVerbose();
  const formatPeer = (value?: RoutePeer | null) =>
    value?.kind && value?.id ? `${value.kind}:${value.id}` : "none";
  const formatNormalizedPeer = (value: NormalizedPeerConstraint) => {
    if (value.state === "none") {
      return "none";
    }
    if (value.state === "invalid") {
      return "invalid";
    }
    return `${value.kind}:${value.id}`;
  };

  if (shouldLogDebug) {
    logDebug(
      `[routing] resolveAgentRoute: channel=${channel} accountId=${accountId} peer=${formatPeer(peer)} guildId=${guildId || "none"} teamId=${teamId || "none"} bindings=${bindings.length}`,
    );
    for (const entry of bindings) {
      logDebug(
        `[routing] binding: agentId=${entry.binding.agentId} accountPattern=${entry.match.accountPattern || "default"} peer=${formatNormalizedPeer(entry.match.peer)} guildId=${entry.match.guildId ?? "none"} teamId=${entry.match.teamId ?? "none"} roles=${entry.match.roles?.length ?? 0}`,
      );
    }
  }
  // Thread parent inheritance: if peer (thread) didn't match, check parent peer binding
  const parentPeer = input.parentPeer
    ? { kind: input.parentPeer.kind, id: normalizeId(input.parentPeer.id) }
    : null;
  const baseScope = {
    guildId,
    teamId,
    memberRoleIds: memberRoleIdSet,
  };

  const tiers: Array<{
    matchedBy: Exclude<ResolvedAgentRoute["matchedBy"], "default">;
    enabled: boolean;
    scopePeer: RoutePeer | null;
    predicate: (candidate: EvaluatedBinding) => boolean;
  }> = [
    {
      matchedBy: "binding.peer",
      enabled: Boolean(peer),
      scopePeer: peer,
      predicate: (candidate) => candidate.match.peer.state === "valid",
    },
    {
      matchedBy: "binding.peer.parent",
      enabled: Boolean(parentPeer && parentPeer.id),
      scopePeer: parentPeer && parentPeer.id ? parentPeer : null,
      predicate: (candidate) => candidate.match.peer.state === "valid",
    },
    {
      matchedBy: "binding.guild+roles",
      enabled: Boolean(guildId && memberRoleIds.length > 0),
      scopePeer: peer,
      predicate: (candidate) =>
        hasGuildConstraint(candidate.match) && hasRolesConstraint(candidate.match),
    },
    {
      matchedBy: "binding.guild",
      enabled: Boolean(guildId),
      scopePeer: peer,
      predicate: (candidate) =>
        hasGuildConstraint(candidate.match) && !hasRolesConstraint(candidate.match),
    },
    {
      matchedBy: "binding.team",
      enabled: Boolean(teamId),
      scopePeer: peer,
      predicate: (candidate) => hasTeamConstraint(candidate.match),
    },
    {
      matchedBy: "binding.account",
      enabled: true,
      scopePeer: peer,
      predicate: (candidate) => candidate.match.accountPattern !== "*",
    },
    {
      matchedBy: "binding.channel",
      enabled: true,
      scopePeer: peer,
      predicate: (candidate) => candidate.match.accountPattern === "*",
    },
  ];

  for (const tier of tiers) {
    if (!tier.enabled) {
      continue;
    }
    const matched = bindings.find(
      (candidate) =>
        tier.predicate(candidate) &&
        matchesBindingScope(candidate.match, {
          ...baseScope,
          peer: tier.scopePeer,
        }),
    );
    if (matched) {
      if (shouldLogDebug) {
        logDebug(`[routing] match: matchedBy=${tier.matchedBy} agentId=${matched.binding.agentId}`);
      }
      return choose(matched.binding.agentId, tier.matchedBy);
    }
  }

  const fallbackRoute = choose(resolveDefaultAgentId(input.cfg), "default");
  return { ...fallbackRoute, isUnbound: true };
}
