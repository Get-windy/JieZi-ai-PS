import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROVIDER } from "../../upstream/src/agents/defaults.js";
import { hasUsableCustomProviderApiKey } from "../../upstream/src/agents/model-auth.js";
import {
  resolveModelRefFromString,
  buildModelAliasIndex,
} from "../../upstream/src/agents/model-selection.js";
import { normalizeSkillFilter } from "../../upstream/src/agents/skills/filter.js";
import { resolveDefaultAgentWorkspaceDir } from "../../upstream/src/agents/workspace.js";
import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { resolveAgentModelFallbackValues } from "../../upstream/src/config/model-input.js";
import { resolveStateDir } from "../../upstream/src/config/paths.js";
import { createSubsystemLogger } from "../../upstream/src/logging/subsystem.js";
import { resolveUserPath } from "../../upstream/src/utils.js";
import type { AgentModelAccountsConfig } from "../config/types.agents.js";
import { isModelIdUsableSync } from "../gateway/server-methods/models.js";
import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
} from "../routing/session-key.js";
const log = createSubsystemLogger("agent-scope");

export { resolveAgentIdFromSessionKey };

/** Strip null bytes from paths to prevent ENOTDIR errors. */
function stripNullBytes(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\0/g, "");
}

type AgentEntry = NonNullable<NonNullable<OpenClawConfig["agents"]>["list"]>[number];

type ResolvedAgentConfig = {
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentEntry["model"];
  skills?: AgentEntry["skills"];
  memorySearch?: AgentEntry["memorySearch"];
  humanDelay?: AgentEntry["humanDelay"];
  heartbeat?: AgentEntry["heartbeat"];
  identity?: AgentEntry["identity"];
  groupChat?: AgentEntry["groupChat"];
  subagents?: AgentEntry["subagents"];
  sandbox?: AgentEntry["sandbox"];
  tools?: AgentEntry["tools"];
};

let defaultAgentWarned = false;

export function listAgentEntries(cfg: OpenClawConfig): AgentEntry[] {
  const list = cfg.agents?.list;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((entry): entry is AgentEntry => Boolean(entry && typeof entry === "object"));
}

export function listAgentIds(cfg: OpenClawConfig): string[] {
  const agents = listAgentEntries(cfg);
  if (agents.length === 0) {
    return [DEFAULT_AGENT_ID];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of agents) {
    const id = normalizeAgentId(entry?.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : [DEFAULT_AGENT_ID];
}

export function resolveDefaultAgentId(cfg: OpenClawConfig): string {
  const agents = listAgentEntries(cfg);
  if (agents.length === 0) {
    return DEFAULT_AGENT_ID;
  }
  const defaults = agents.filter((agent) => agent?.default);
  if (defaults.length > 1 && !defaultAgentWarned) {
    defaultAgentWarned = true;
    log.warn("Multiple agents marked default=true; using the first entry as default.");
  }
  const chosen = (defaults[0] ?? agents[0])?.id?.trim();
  return normalizeAgentId(chosen || DEFAULT_AGENT_ID);
}

export function resolveSessionAgentIds(params: {
  sessionKey?: string;
  config?: OpenClawConfig;
  agentId?: string;
}): {
  defaultAgentId: string;
  sessionAgentId: string;
} {
  const defaultAgentId = resolveDefaultAgentId(params.config ?? {});
  const explicitAgentIdRaw =
    typeof params.agentId === "string" ? params.agentId.trim().toLowerCase() : "";
  const explicitAgentId = explicitAgentIdRaw ? normalizeAgentId(explicitAgentIdRaw) : null;
  const sessionKey = params.sessionKey?.trim();
  const normalizedSessionKey = sessionKey ? sessionKey.toLowerCase() : undefined;
  const parsed = normalizedSessionKey ? parseAgentSessionKey(normalizedSessionKey) : null;
  const sessionAgentId =
    explicitAgentId ?? (parsed?.agentId ? normalizeAgentId(parsed.agentId) : defaultAgentId);
  return { defaultAgentId, sessionAgentId };
}

export function resolveSessionAgentId(params: {
  sessionKey?: string;
  config?: OpenClawConfig;
}): string {
  return resolveSessionAgentIds(params).sessionAgentId;
}

function resolveAgentEntry(cfg: OpenClawConfig, agentId: string): AgentEntry | undefined {
  const id = normalizeAgentId(agentId);
  return listAgentEntries(cfg).find((entry) => normalizeAgentId(entry.id) === id);
}

export function resolveAgentConfig(
  cfg: OpenClawConfig,
  agentId: string,
): ResolvedAgentConfig | undefined {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  if (!entry) {
    return undefined;
  }
  return {
    name: typeof entry.name === "string" ? entry.name : undefined,
    workspace: typeof entry.workspace === "string" ? entry.workspace : undefined,
    agentDir: typeof entry.agentDir === "string" ? entry.agentDir : undefined,
    model:
      typeof entry.model === "string" || (entry.model && typeof entry.model === "object")
        ? entry.model
        : undefined,
    skills: Array.isArray(entry.skills) ? entry.skills : undefined,
    memorySearch: entry.memorySearch,
    humanDelay: entry.humanDelay,
    heartbeat: entry.heartbeat,
    identity: entry.identity,
    groupChat: entry.groupChat,
    subagents: typeof entry.subagents === "object" && entry.subagents ? entry.subagents : undefined,
    sandbox: entry.sandbox,
    tools: entry.tools,
  };
}

export function resolveAgentSkillsFilter(
  cfg: OpenClawConfig,
  agentId: string,
): string[] | undefined {
  return normalizeSkillFilter(resolveAgentConfig(cfg, agentId)?.skills);
}

function resolveModelPrimary(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed || undefined;
  }
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const primary = (raw as { primary?: unknown }).primary;
  if (typeof primary !== "string") {
    return undefined;
  }
  const trimmed = primary.trim();
  return trimmed || undefined;
}

export function resolveAgentExplicitModelPrimary(
  cfg: OpenClawConfig,
  agentId: string,
): string | undefined {
  const raw = resolveAgentConfig(cfg, agentId)?.model;
  return resolveModelPrimary(raw);
}

/**
 * 判断一个模型 ID（格式：providerId/modelName）对应的模型和认证是否可用。
 *
 * 优先走新的 ModelManagementStorage 数据链：
 *   modelId → ModelConfig.enabled && !deprecated → ProviderAuth.enabled
 *
 * 若新系统缓存未就绪，或模型不在新系统中，则 fallback 到旧的
 * models.providers 配置检测（指 model.primary 格式的模型字符串）。
 */
function isModelStringProviderUsable(cfg: OpenClawConfig, modelStr: string): boolean {
  // 优先：走新的 ModelManagementStorage 数据链
  const newChainResult = isModelIdUsableSync(modelStr);
  if (newChainResult !== undefined) {
    // 新系统配置了此模型，使用其结果
    return newChainResult;
  }
  // 新系统缓存未就绪或模型不在新系统，fallback 到旧逻辑
  const aliasIndex = buildModelAliasIndex({ cfg, defaultProvider: DEFAULT_PROVIDER });
  const resolved = resolveModelRefFromString({
    raw: modelStr,
    defaultProvider: DEFAULT_PROVIDER,
    aliasIndex,
  });
  if (!resolved) {
    // 无法解析的模型字符串，且不在新系统，视为不可用
    return false;
  }
  const provider = resolved.ref.provider;
  const providers = (cfg?.models?.providers ?? {}) as Record<
    string,
    { auth?: string; apiKey?: unknown }
  >;
  const providerEntry = Object.entries(providers).find(
    ([key]) => key.toLowerCase() === provider.toLowerCase(),
  )?.[1];
  if (!providerEntry) {
    // 内置 provider（不在 providers 里），视为可用
    return true;
  }
  const authMode = providerEntry.auth;
  if (authMode === "oauth" || authMode === "token" || authMode === "aws-sdk") {
    return true;
  }
  return hasUsableCustomProviderApiKey(cfg, provider);
}

/**
 * 解析 agent 有效的主模型（含 provider 可用性检测）：
 *
 * allowFallbackToDefault=false（默认，普通会话模式）：
 *   1. agent 自身 modelAccounts.defaultAccountId → provider 可用时采用
 *   2. agent 自身 model.primary → provider 可用时采用
 *   2.5. agent 自身 modelAccounts.accounts 列表中其他可用账号（不算跨agent）
 *   返回 undefined 表示「未配置模型」，上层应提示用户配置
 *
 * allowFallbackToDefault=true（系统任务模式，如心跳任务驱动）：
 *   在上述两步均失败后继续：
 *   3. 主控 agent 的 modelAccounts.defaultAccountId → provider 可用时采用
 *   4. 主控 agent 的 model.primary → provider 可用时采用
 *   5. 主控 agent 的 modelAccounts.accounts[0]（provider 不可用时的最终兜底）
 *   6. agents.defaults.model.primary（全局兜底，无可用性检测）
 *
 * 注意：modelAccounts 优先于 model.primary，避免遗留失效旧值干扰路由。
 */
export function resolveAgentEffectiveModelPrimary(
  cfg: OpenClawConfig,
  agentId: string,
  options?: { allowFallbackToDefault?: boolean },
): string | undefined {
  const allowFallback = options?.allowFallbackToDefault ?? false;

  // 1. agent 自身 modelAccounts.defaultAccountId
  const ownAccounts = resolveAgentModelAccounts(cfg, agentId);
  const ownDefault = ownAccounts?.defaultAccountId?.trim();
  if (ownDefault && isModelStringProviderUsable(cfg, ownDefault)) {
    return ownDefault;
  }

  // 2. agent 自身 model.primary
  const explicit = resolveAgentExplicitModelPrimary(cfg, agentId);
  if (explicit && isModelStringProviderUsable(cfg, explicit)) {
    return explicit;
  }

  // 2.5. agent 自身 modelAccounts.accounts 列表中的其他可用账号
  // 这不属于「跨 agent fallback」，是该 agent 自己配置的备选账号
  const allOwnAccounts = ownAccounts?.accounts ?? [];
  for (const accountId of allOwnAccounts) {
    const candidate = accountId.trim();
    if (!candidate || candidate === ownDefault || candidate === explicit) {
      continue; // 已在步骤 1/2 判过了
    }
    if (isModelStringProviderUsable(cfg, candidate)) {
      log.info(
        `[model-fallback] agentId=${agentId}: primary/default unavailable, ` +
          `falling back to own accounts candidate="${candidate}"`,
      );
      return candidate;
    }
  }

  // 自身无可用模型，且不允许跨 agent fallback → 返回 undefined，让上层提示用户
  if (!allowFallback) {
    return undefined;
  }

  // --- 以下仅在 allowFallbackToDefault=true 时执行（系统任务驱动） ---

  const defaultAgentId = resolveDefaultAgentId(cfg);
  if (normalizeAgentId(agentId) !== defaultAgentId) {
    const defaultAgentAccounts = resolveAgentModelAccounts(cfg, defaultAgentId);

    // 3. 主控 agent 的 modelAccounts.defaultAccountId
    const defaultAgentAccountId = defaultAgentAccounts?.defaultAccountId?.trim();
    if (defaultAgentAccountId && isModelStringProviderUsable(cfg, defaultAgentAccountId)) {
      return defaultAgentAccountId;
    }

    // 4. 主控 agent 的 model.primary
    const defaultAgentModelPrimary = resolveAgentExplicitModelPrimary(cfg, defaultAgentId);
    if (defaultAgentModelPrimary && isModelStringProviderUsable(cfg, defaultAgentModelPrimary)) {
      return defaultAgentModelPrimary;
    }

    // 5. 主控 agent 的 modelAccounts.accounts 中逐个遍历，找第一个通过 provider 检测的账号
    const allDefaultAccounts = defaultAgentAccounts?.accounts ?? [];
    for (const accountId of allDefaultAccounts) {
      const candidate = accountId.trim();
      if (
        !candidate ||
        candidate === defaultAgentAccountId ||
        candidate === defaultAgentModelPrimary
      ) {
        continue; // 已在步骤 3/4 判过了
      }
      if (isModelStringProviderUsable(cfg, candidate)) {
        log.info(
          `[model-fallback] agentId=${agentId}: primary provider unavailable, ` +
            `falling back to defaultAgent "${defaultAgentId}" usable account="${candidate}"`,
        );
        return candidate;
      }
    }
    // 5.5. 主控 agent 所有账号均不可用，最后无条件返回第一个（不做 provider 检测，交运行时处理）
    const firstAccount = allDefaultAccounts[0]?.trim();
    if (firstAccount) {
      log.info(
        `[model-fallback] agentId=${agentId}: primary provider unavailable, ` +
          `falling back to defaultAgent "${defaultAgentId}" accounts[0]="${firstAccount}"`,
      );
      return firstAccount;
    }
  } else {
    // 当前就是主控 agent：fallback 到自身 accounts[0]
    const ownFirstAccount = ownAccounts?.accounts?.[0]?.trim();
    if (ownFirstAccount && ownDefault !== ownFirstAccount) {
      log.info(
        `[model-fallback] defaultAgent "${agentId}": primary provider unavailable, ` +
          `falling back to accounts[0]="${ownFirstAccount}"`,
      );
      return ownFirstAccount;
    }
  }

  // 6. 最终兜底：动态查找主控 agent（或全局 accounts）中第一个可用模型
  //    优先级：主控 agent accounts 中第一个通过 provider 检测的账号
  //    → 避免依赖 agents.defaults.model.primary 这个静态配置值（容易残留过期模型）
  const fallbackAgentId = resolveDefaultAgentId(cfg);
  const fallbackAgentAccounts = resolveAgentModelAccounts(cfg, fallbackAgentId);
  const allFallbackAccounts = fallbackAgentAccounts?.accounts ?? [];
  for (const accountId of allFallbackAccounts) {
    const candidate = accountId.trim();
    if (!candidate) {
      continue;
    }
    if (isModelStringProviderUsable(cfg, candidate)) {
      log.info(
        `[model-fallback] agentId=${agentId}: ultimate fallback to defaultAgent "${fallbackAgentId}" first usable account="${candidate}"`,
      );
      return candidate;
    }
  }
  // 所有动态路径均失败，最后退化到静态配置值（不做 provider 检测，交运行时处理）
  return resolveModelPrimary(cfg.agents?.defaults?.model);
}

// Backward-compatible alias. Prefer explicit/effective helpers at new call sites.
export function resolveAgentModelPrimary(cfg: OpenClawConfig, agentId: string): string | undefined {
  return resolveAgentExplicitModelPrimary(cfg, agentId);
}

export function resolveAgentModelFallbacksOverride(
  cfg: OpenClawConfig,
  agentId: string,
): string[] | undefined {
  const raw = resolveAgentConfig(cfg, agentId)?.model;
  if (!raw || typeof raw === "string") {
    return undefined;
  }
  // Important: treat an explicitly provided empty array as an override to disable global fallbacks.
  if (!Object.hasOwn(raw, "fallbacks")) {
    return undefined;
  }
  return Array.isArray(raw.fallbacks) ? raw.fallbacks : undefined;
}

export function resolveFallbackAgentId(params: {
  agentId?: string | null;
  sessionKey?: string | null;
}): string {
  const explicitAgentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
  if (explicitAgentId) {
    return normalizeAgentId(explicitAgentId);
  }
  return resolveAgentIdFromSessionKey(params.sessionKey);
}

export function resolveRunModelFallbacksOverride(params: {
  cfg: OpenClawConfig | undefined;
  agentId?: string | null;
  sessionKey?: string | null;
}): string[] | undefined {
  if (!params.cfg) {
    return undefined;
  }
  return resolveAgentModelFallbacksOverride(
    params.cfg,
    resolveFallbackAgentId({ agentId: params.agentId, sessionKey: params.sessionKey }),
  );
}

export function hasConfiguredModelFallbacks(params: {
  cfg: OpenClawConfig | undefined;
  agentId?: string | null;
  sessionKey?: string | null;
}): boolean {
  const fallbacksOverride = resolveRunModelFallbacksOverride(params);
  const defaultFallbacks = resolveAgentModelFallbackValues(params.cfg?.agents?.defaults?.model);
  return (fallbacksOverride ?? defaultFallbacks).length > 0;
}

export function resolveEffectiveModelFallbacks(params: {
  cfg: OpenClawConfig;
  agentId: string;
  hasSessionModelOverride: boolean;
}): string[] | undefined {
  const agentFallbacksOverride = resolveAgentModelFallbacksOverride(params.cfg, params.agentId);
  if (!params.hasSessionModelOverride) {
    return agentFallbacksOverride;
  }
  const defaultFallbacks = resolveAgentModelFallbackValues(params.cfg.agents?.defaults?.model);
  return agentFallbacksOverride ?? defaultFallbacks;
}

export function resolveAgentWorkspaceDir(cfg: OpenClawConfig, agentId: string) {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.workspace?.trim();
  if (configured) {
    return stripNullBytes(resolveUserPath(configured));
  }
  const defaultAgentId = resolveDefaultAgentId(cfg);
  if (id === defaultAgentId) {
    const fallback = cfg.agents?.defaults?.workspace?.trim();
    if (fallback) {
      return stripNullBytes(resolveUserPath(fallback));
    }
    return stripNullBytes(resolveDefaultAgentWorkspaceDir(process.env));
  }
  const stateDir = resolveStateDir(process.env);
  return stripNullBytes(path.join(stateDir, `workspace-${id}`));
}

function normalizePathForComparison(input: string): string {
  const resolved = path.resolve(stripNullBytes(resolveUserPath(input)));
  let normalized = resolved;
  // Prefer realpath when available to normalize aliases/symlinks (for example /tmp -> /private/tmp)
  // and canonical path case without forcing case-folding on case-sensitive macOS volumes.
  try {
    normalized = fs.realpathSync.native(resolved);
  } catch {
    // Keep lexical path for non-existent directories.
  }
  if (process.platform === "win32") {
    return normalized.toLowerCase();
  }
  return normalized;
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveAgentIdsByWorkspacePath(
  cfg: OpenClawConfig,
  workspacePath: string,
): string[] {
  const normalizedWorkspacePath = normalizePathForComparison(workspacePath);
  const ids = listAgentIds(cfg);
  const matches: Array<{ id: string; workspaceDir: string; order: number }> = [];

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const workspaceDir = normalizePathForComparison(resolveAgentWorkspaceDir(cfg, id));
    if (!isPathWithinRoot(normalizedWorkspacePath, workspaceDir)) {
      continue;
    }
    matches.push({ id, workspaceDir, order: index });
  }

  matches.sort((left, right) => {
    const workspaceLengthDelta = right.workspaceDir.length - left.workspaceDir.length;
    if (workspaceLengthDelta !== 0) {
      return workspaceLengthDelta;
    }
    return left.order - right.order;
  });

  return matches.map((entry) => entry.id);
}

export function resolveAgentIdByWorkspacePath(
  cfg: OpenClawConfig,
  workspacePath: string,
): string | undefined {
  return resolveAgentIdsByWorkspacePath(cfg, workspacePath)[0];
}

export function resolveAgentDir(cfg: OpenClawConfig, agentId: string) {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.agentDir?.trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const root = resolveStateDir(process.env);
  return path.join(root, "agents", id, "agent");
}

/**
 * 解析智能助手的模型账号配置（用于智能路由系统）
 *
 * @param cfg - OpenClaw配置
 * @param agentId - 智能助手ID
 * @returns 模型账号配置，如果未配置则返回 undefined
 */
export function resolveAgentModelAccounts(
  cfg: OpenClawConfig,
  agentId: string,
): AgentModelAccountsConfig | undefined {
  // 直接从 agent entry 读取，而不是从 resolveAgentConfig 返回的结果
  // 因为 resolveAgentConfig 只返回预定义的字段
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  if (!entry) {
    return undefined;
  }

  // 从 entry 中读取 modelAccounts 配置
  const modelAccounts = (entry as unknown as { modelAccounts?: AgentModelAccountsConfig })
    .modelAccounts;

  return modelAccounts;
}
