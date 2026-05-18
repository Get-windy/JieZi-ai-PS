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
import { isModelIdUsableSync, getModelManagementCacheSync } from "../gateway/server-methods/models.js";
import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
} from "../routing/session-key.js";
const log = createSubsystemLogger("agent-scope");

export { resolveAgentIdFromSessionKey };

// 上游新增函数转发：避免上游模块导入时出现 MISSING_EXPORT 警告
export { resolveAgentContextLimits, resolveDefaultAgentDir } from "../../upstream/src/agents/agent-scope-config.js";
export {
  hasSessionAutoModelFallbackProvenance,
  type AutoFallbackPrimaryProbe,
  resolveAutoFallbackPrimaryProbe,
  markAutoFallbackPrimaryProbe,
  entryMatchesAutoFallbackPrimaryProbe,
  clearAutoFallbackPrimaryProbeSelection,
  setAgentEffectiveModelPrimary,
} from "../../upstream/src/agents/agent-scope.js";

// ============================================================================
// Fallback 熔断机制 - 防止fallback风暴
//
// 当所有模型都不可用时,连续fallback会导致每秒重试上百次
// 实现熔断:连续失败N次后,暂停fallback一段时间
// ============================================================================

interface FallbackCircuitBreaker {
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 上次失败时间戳(ms) */
  lastFailureAt: number;
  /** 熔断触发时间戳(ms) */
  circuitOpenedAt?: number;
  /** 是否已触发熔断 */
  isTripped: boolean;
}

/** 全局fallback熔断器 (agentId -> breaker) */
const fallbackCircuitBreakers = new Map<string, FallbackCircuitBreaker>();

/** 熔断阈值:连续失败3次 */
const FALLBACK_FAILURE_THRESHOLD = 3;

/** 熔断持续时间:10分钟(ms) */
const FALLBACK_CIRCUIT_DURATION_MS = 10 * 60 * 1000;

// ============================================================================
// Fallback 缓存机制 - 避免重复fallback检查
//
// 两层缓存:
// 1. Provider级别缓存: 某个模型可用后,所有agent共享这个信息
// 2. Agent级别缓存: 记录每个agent使用的fallback模型
// ============================================================================

interface ProviderCacheEntry {
  /** 模型标识 */
  model: string;
  /** 是否可用 */
  isUsable: boolean;
  /** 最后检查时间戳(ms) */
  lastCheckedAt: number;
  /** 连续成功次数 */
  consecutiveSuccess: number;
}

/** Provider级别缓存 (modelString -> entry) */
const providerCache = new Map<string, ProviderCacheEntry>();

/** Provider缓存有效期:10分钟(ms) - 可用模型 */
const PROVIDER_CACHE_TTL_USABLE_MS = 10 * 60 * 1000;

/** Provider缓存有效期:1分钟(ms) - 不可用模型 */
const PROVIDER_CACHE_TTL_UNUSABLE_MS = 60 * 1000;

interface FallbackCacheEntry {
  /** 缓存的模型 */
  model: string;
  /** 缓存时间戳(ms) */
  cachedAt: number;
  /** 是否稳定(连续使用无报错) */
  isStable: boolean;
}

/** Agent级别缓存 (agentId -> cacheEntry) */
const fallbackCache = new Map<string, FallbackCacheEntry>();

/** 缓存有效期:5分钟(ms) - 不稳定模型 */
const FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;

/** 稳定模型缓存有效期:30分钟(ms) */
const FALLBACK_CACHE_STABLE_TTL_MS = 30 * 60 * 1000;

/**
 * 检查Provider级别缓存
 * @returns 如果缓存命中且有效,返回模型可用性状态;否则返回null
 */
function checkProviderCache(modelString: string): boolean | null {
  const entry = providerCache.get(modelString);
  if (!entry) {
    return null;
  }
  
  const elapsed = Date.now() - entry.lastCheckedAt;
  const ttl = entry.isUsable ? PROVIDER_CACHE_TTL_USABLE_MS : PROVIDER_CACHE_TTL_UNUSABLE_MS;
  
  if (elapsed < ttl) {
    // 缓存有效
    log.debug(
      `[provider-cache] model="${modelString}": cache hit usable=${entry.isUsable} age=${Math.round(elapsed / 1000)}s`,
    );
    return entry.isUsable;
  }
  
  // 缓存过期,清除
  providerCache.delete(modelString);
  return null;
}

/**
 * 更新Provider级别缓存
 */
function updateProviderCache(modelString: string, isUsable: boolean): void {
  const existing = providerCache.get(modelString);
  
  if (existing && existing.isUsable === isUsable) {
    // 同一模型,续期并记录成功次数
    existing.lastCheckedAt = Date.now();
    if (isUsable) {
      existing.consecutiveSuccess++;
    }
  } else {
    // 新状态或新模型
    providerCache.set(modelString, {
      model: modelString,
      isUsable,
      lastCheckedAt: Date.now(),
      consecutiveSuccess: isUsable ? 1 : 0,
    });
  }
  
  log.debug(
    `[provider-cache] model="${modelString}": updated usable=${isUsable}`,
  );
}

/**
 * 缓存fallback成功的结果
 * 
 * 策略:只要fallback找到可用的模型,就缓存结果
 * 后续调用直接使用缓存,避免重复fallback检查
 * - 不稳定模型:缓存5分钟
 * - 稳定模型(连续无报错):缓存30分钟
 */
function cacheFallbackResult(agentId: string, model: string, isStable = false): void {
  const existing = fallbackCache.get(agentId);
  
  // 如果已有缓存且是同一个模型,续期并标记稳定
  if (existing && existing.model === model) {
    existing.cachedAt = Date.now();
    if (isStable) {
      existing.isStable = true; // 升级为稳定模型
    }
    log.debug(
      `[fallback-cache] agentId=${agentId}: refreshed cache model="${model}" stable=${existing.isStable}`,
    );
    return;
  }
  
  // 新模型或不同模型,更新缓存
  const ttl = isStable ? FALLBACK_CACHE_STABLE_TTL_MS : FALLBACK_CACHE_TTL_MS;
  fallbackCache.set(agentId, {
    model,
    cachedAt: Date.now(),
    isStable,
  });
  
  log.info(
    `[fallback-cache] agentId=${agentId}: cached model="${model}" for ${ttl / 1000 / 60}min stable=${isStable}`,
  );
}

/**
 * 清除fallback缓存(当模型调用失败时)
 */
function clearFallbackCache(agentId: string): void {
  const removed = fallbackCache.delete(agentId);
  if (removed) {
    log.warn(
      `[fallback-cache] agentId=${agentId}: cache cleared due to model call failure`,
    );
  }
}

/**
 * 标记模型为稳定(连续调用成功)
 * 延长缓存时间到30分钟
 */
function markModelAsStable(agentId: string): void {
  const existing = fallbackCache.get(agentId);
  if (existing) {
    existing.isStable = true;
    existing.cachedAt = Date.now(); // 续期
    log.debug(
      `[fallback-cache] agentId=${agentId}: model="${existing.model}" marked as stable, cached for 30min`,
    );
  }
}

/**
 * 检查fallback熔断器状态
 * @returns true=允许fallback, false=熔断中请等待
 */
function checkFallbackCircuitBreaker(agentId: string): boolean {
  const breaker = fallbackCircuitBreakers.get(agentId);
  
  if (!breaker) {
    return true; // 无记录,允许fallback
  }
  
  if (!breaker.isTripped) {
    return true; // 未触发熔断
  }
  
  // 检查熔断是否已过期
  if (breaker.circuitOpenedAt) {
    const elapsed = Date.now() - breaker.circuitOpenedAt;
    if (elapsed >= FALLBACK_CIRCUIT_DURATION_MS) {
      // 熔断过期,重置断路器
      log.info(
        `[fallback-circuit-breaker] agentId=${agentId}: circuit breaker reset after ${Math.round(elapsed / 1000)}s cooldown`,
      );
      fallbackCircuitBreakers.delete(agentId);
      return true;
    }
    // 仍在熔断期
    const remaining = Math.ceil((FALLBACK_CIRCUIT_DURATION_MS - elapsed) / 1000);
    log.warn(
      `[fallback-circuit-breaker] agentId=${agentId}: circuit breaker tripped, ${remaining}s remaining before retry`,
    );
    return false;
  }
  
  return false;
}

/**
 * 记录fallback失败,触发熔断检查
 */
function recordFallbackFailure(agentId: string): void {
  let breaker = fallbackCircuitBreakers.get(agentId);
  
  if (!breaker) {
    breaker = {
      consecutiveFailures: 0,
      lastFailureAt: 0,
      isTripped: false,
    };
  }
  
  breaker.consecutiveFailures++;
  breaker.lastFailureAt = Date.now();
  
  // 检查是否达到熔断阈值
  if (breaker.consecutiveFailures >= FALLBACK_FAILURE_THRESHOLD && !breaker.isTripped) {
    breaker.isTripped = true;
    breaker.circuitOpenedAt = Date.now();
    log.error(
      `[fallback-circuit-breaker] agentId=${agentId}: CIRCUIT BREAKER TRIPPED after ${breaker.consecutiveFailures} consecutive failures, ` +
        `pausing fallback for ${FALLBACK_CIRCUIT_DURATION_MS / 1000 / 60}min to prevent fallback storm`,
    );
  }
  
  fallbackCircuitBreakers.set(agentId, breaker);
}

/**
 * 记录fallback成功,重置断路器(预留)
 */
function _recordFallbackSuccess(agentId: string): void {
  const breaker = fallbackCircuitBreakers.get(agentId);
  
  if (breaker && breaker.isTripped) {
    log.info(
      `[fallback-circuit-breaker] agentId=${agentId}: circuit breaker reset after successful fallback`,
    );
  }
  
  fallbackCircuitBreakers.delete(agentId);
}

// resolveAgentExecutionContract: 上游在 agent-scope.ts 中定义，本地直接实现避免自循环
export function resolveAgentExecutionContract(
  cfg: OpenClawConfig | undefined,
  agentId?: string | null,
):
  | NonNullable<
      NonNullable<
        import("../../upstream/src/config/types.agent-defaults.js").AgentDefaultsConfig["embeddedPi"]
      >["executionContract"]
    >
  | undefined {
  const defaultContract = cfg?.agents?.defaults?.embeddedPi?.executionContract;
  if (!cfg || !agentId) {
    return defaultContract;
  }
  const entry = (cfg.agents?.list ?? []).find(
    (a) => typeof a?.id === "string" && a.id.toLowerCase().trim() === agentId.toLowerCase().trim(),
  );
  const agentContract = (entry as Record<string, unknown>)?.embeddedPi as
    | { executionContract?: unknown }
    | undefined;
  return (agentContract?.executionContract as typeof defaultContract) ?? defaultContract;
}

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
  return list.filter((entry): entry is AgentEntry => entry != null && typeof entry === "object");
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
  // === 检查Provider级别缓存 ===
  const cached = checkProviderCache(modelStr);
  if (cached !== null) {
    // 缓存命中,直接返回
    return cached;
  }
  
  // === 验证provider是否存在 ===
  const providerName = modelStr.split('/')[0];
  
  // 检查两个地方:1.openclaw.json 2.model-management.json
  const openclawProviders = cfg?.models?.providers ?? {};
  let providerExists = providerName in openclawProviders;
  
  // 如果openclaw.json中没有,检查model-management.json
  if (!providerExists) {
    try {
      const managementCache = getModelManagementCacheSync();
      if (managementCache?.providers) {
        providerExists = managementCache.providers.some(
          (p: unknown) => (p as Record<string, unknown>).id?.toString().toLowerCase() === providerName.toLowerCase(),
        );
      } else if (managementCache === null) {
        // model-management缓存未就绪,不判定provider不存在
        // 让后续的实际检查逻辑(isModelIdUsableSync)去判断
        log.debug(
          `[model-fallback] model-management cache not ready, skipping provider check for "${providerName}"`,
        );
        providerExists = true; // 假设存在,让后续逻辑检查
      }
    } catch {
      // model-management.json读取失败,忽略
    }
  }
  
  // 如果provider不存在,直接标记不可用并缓存
  if (!providerExists) {
    log.warn(
      `[model-fallback] provider="${providerName}" does not exist in config, model="${modelStr}" marked as unavailable`,
    );
    updateProviderCache(modelStr, false);
    return false;
  }
  
  // 缓存未命中,执行实际检查
  // 优先：走新的 ModelManagementStorage 数据链
  const newChainResult = isModelIdUsableSync(modelStr);
  let isUsable: boolean;
  
  if (newChainResult !== undefined) {
    // 新系统配置了此模型，使用其结果
    isUsable = newChainResult;
  } else {
    // 新系统缓存未就绪或模型不在新系统，fallback 到旧逻辑
    const aliasIndex = buildModelAliasIndex({ cfg, defaultProvider: DEFAULT_PROVIDER });
    const resolved = resolveModelRefFromString({
      raw: modelStr,
      defaultProvider: DEFAULT_PROVIDER,
      aliasIndex,
    });
    if (!resolved) {
      // 无法解析的模型字符串，且不在新系统，视为不可用
      isUsable = false;
    } else {
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
        isUsable = true;
      } else {
        const authMode = providerEntry.auth;
        if (authMode === "oauth" || authMode === "token" || authMode === "aws-sdk") {
          isUsable = true;
        } else {
          isUsable = hasUsableCustomProviderApiKey(cfg, provider);
        }
      }
    }
  }
  
  // === 更新Provider级别缓存 ===
  updateProviderCache(modelStr, isUsable);
  
  return isUsable;
}

/**
 * 解析 agent 有效的主模型(含 provider 可用性检测):
 *
 * allowFallbackToDefault=false(默认,普通会话模式):
 *   1. agent 自身 modelAccounts.defaultAccountId → provider 可用时采用
 *   2. agent 自身 model.primary → provider 可用时采用
 *   2.5. agent 自身 modelAccounts.accounts 列表中其他可用账号(不算跨agent)
 *   返回 undefined 表示「未配置模型」,上层应提示用户配置
 *
 * allowFallbackToDefault=true(系统任务模式,如心跳任务驱动):
 *   在上述两步均失败后继续:
 *   3. 主控 agent 的 modelAccounts.defaultAccountId → provider 可用时采用
 *   4. 主控 agent 的 model.primary → provider 可用时采用
 *   5. 主控 agent 的 modelAccounts.accounts[0](provider 不可用时的最终兜底)
 *   6. agents.defaults.model.primary(全局兜底,无可用性检测)
 *
 * 注意:modelAccounts 优先于 model.primary,避免遗留失效旧值干扰路由。
 */
export function resolveAgentEffectiveModelPrimary(
  cfg: OpenClawConfig,
  agentId: string,
  options?: { allowFallbackToDefault?: boolean },
): string | undefined {
  const allowFallback = options?.allowFallbackToDefault ?? false;
  const normalizedAgentId = normalizeAgentId(agentId);
  
  // === 熔断检查:如果此agent已触发fallback熔断,直接返回undefined ===
  if (!checkFallbackCircuitBreaker(normalizedAgentId)) {
    return undefined;
  }
  
  // === 缓存检查:如果已有成功的fallback结果,直接返回 ===
  const cachedResult = fallbackCache.get(normalizedAgentId);
  if (cachedResult) {
    const elapsed = Date.now() - cachedResult.cachedAt;
    // 根据稳定性使用不同的缓存有效期
    const ttl = cachedResult.isStable ? FALLBACK_CACHE_STABLE_TTL_MS : FALLBACK_CACHE_TTL_MS;
    if (elapsed < ttl) {
      // 缓存有效,直接返回
      log.debug(
        `[fallback-cache] agentId=${agentId}: using cached model="${cachedResult.model}" stable=${cachedResult.isStable}`,
      );
      return cachedResult.model;
    }
    // 缓存过期,清除
    fallbackCache.delete(normalizedAgentId);
    log.debug(
      `[fallback-cache] agentId=${agentId}: cache expired for model="${cachedResult.model}"`,
    );
  }

  // 1. agent 自身 modelAccounts.defaultAccountId
  const ownAccounts = resolveAgentModelAccounts(cfg, agentId);
  const ownDefault = ownAccounts?.defaultAccountId?.trim();
  if (ownDefault && isModelStringProviderUsable(cfg, ownDefault)) {
    // 缓存成功的fallback结果
    cacheFallbackResult(normalizedAgentId, ownDefault);
    return ownDefault;
  }

  // 2. agent 自身 model.primary
  const explicit = resolveAgentExplicitModelPrimary(cfg, agentId);
  if (explicit && isModelStringProviderUsable(cfg, explicit)) {
    cacheFallbackResult(normalizedAgentId, explicit);
    return explicit;
  }

  // 2.5. agent 自身 modelAccounts.accounts 列表中的其他可用账号
  // 这不属于「跨 agent fallback」,是该 agent 自己配置的备选账号
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
      // 缓存成功的fallback结果
      cacheFallbackResult(normalizedAgentId, candidate);
      return candidate;
    }
  }

  // 自身无可用模型，且不允许跨 agent fallback → 返回 undefined，让上层提示用户
  if (!allowFallback) {
    // 记录fallback失败
    recordFallbackFailure(normalizedAgentId);
    return undefined;
  }

  // --- 以下仅在 allowFallbackToDefault=true 时执行（系统任务驱动） ---

  const defaultAgentId = resolveDefaultAgentId(cfg);
  if (normalizeAgentId(agentId) !== defaultAgentId) {
    const defaultAgentAccounts = resolveAgentModelAccounts(cfg, defaultAgentId);

    // 3. 主控 agent 的 modelAccounts.defaultAccountId
    const defaultAgentAccountId = defaultAgentAccounts?.defaultAccountId?.trim();
    if (defaultAgentAccountId && isModelStringProviderUsable(cfg, defaultAgentAccountId)) {
      cacheFallbackResult(normalizedAgentId, defaultAgentAccountId);
      return defaultAgentAccountId;
    }

    // 4. 主控 agent 的 model.primary
    const defaultAgentModelPrimary = resolveAgentExplicitModelPrimary(cfg, defaultAgentId);
    if (defaultAgentModelPrimary && isModelStringProviderUsable(cfg, defaultAgentModelPrimary)) {
      cacheFallbackResult(normalizedAgentId, defaultAgentModelPrimary);
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
        cacheFallbackResult(normalizedAgentId, candidate);
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
      cacheFallbackResult(normalizedAgentId, firstAccount);
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
      cacheFallbackResult(normalizedAgentId, ownFirstAccount);
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
      cacheFallbackResult(normalizedAgentId, candidate);
      return candidate;
    }
  }
  
  // 所有动态路径均失败，最后退化到静态配置值（不做 provider 检测，交运行时处理）
  const finalResult = resolveModelPrimary(cfg.agents?.defaults?.model);
  
  // 如果最终也没有找到模型,记录失败次数
  if (!finalResult) {
    recordFallbackFailure(normalizedAgentId);
  }
  
  return finalResult;
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
  const fallback = cfg.agents?.defaults?.workspace?.trim();
  if (id === defaultAgentId) {
    if (fallback) {
      return stripNullBytes(resolveUserPath(fallback));
    }
    return stripNullBytes(resolveDefaultAgentWorkspaceDir(process.env));
  }
  // 非默认 agent：优先使用 defaults.workspace 作为根目录，保证所有 agent 都落在自定义工作空间下
  if (fallback) {
    return stripNullBytes(path.join(resolveUserPath(fallback), id));
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

  // 优先从 params.modelAccounts 读取（新存储位置，避免上游 strict schema 内 Unrecognized key 报错）
  // 兼容旧数据：直接写在顶层的 modelAccounts
  const modelAccounts =
    ((entry as unknown as { params?: Record<string, unknown> }).params?.modelAccounts as
      | AgentModelAccountsConfig
      | undefined) ??
    (entry as unknown as { modelAccounts?: AgentModelAccountsConfig }).modelAccounts;

  return modelAccounts;
}

// ============================================================================
// 导出 Fallback 缓存管理函数 (供外部模块调用)
// ============================================================================

/**
 * 标记模型为稳定(连续调用成功)
 * 供模型运行时调用,延长缓存时间到30分钟
 * 
 * @example
 * ```typescript
 * // 模型调用成功后
 * markAgentModelAsStable('main');
 * ```
 */
export function markAgentModelAsStable(agentId: string): void {
  markModelAsStable(normalizeAgentId(agentId));
}

/**
 * 清除agent的fallback缓存(当模型调用失败时)
 * 供模型运行时调用,触发重新fallback
 * 
 * @example
 * ```typescript
 * // 模型调用失败后
 * clearAgentFallbackCache('main');
 * ```
 */
export function clearAgentFallbackCache(agentId: string): void {
  const normalizedId = normalizeAgentId(agentId);
  clearFallbackCache(normalizedId);
  
  // 同时清除Provider缓存,因为模型调用失败可能意味着Provider不可用
  const agentEntry = fallbackCache.get(normalizedId);
  if (agentEntry) {
    // 从Provider缓存中清除对应模型
    // 注意:这里不直接清除,而是由下次检查时自然更新
    // 因为可能是临时错误,不是Provider问题
  }
}

/**
 * 获取agent的fallback缓存状态(用于监控和调试)
 * 
 * @returns 缓存状态信息
 */
export function getAgentFallbackCacheStatus(agentId: string): {
  cached: boolean;
  model?: string;
  isStable?: boolean;
  ageSeconds?: number;
} {
  const normalizedId = normalizeAgentId(agentId);
  const entry = fallbackCache.get(normalizedId);
  
  if (!entry) {
    return { cached: false };
  }
  
  return {
    cached: true,
    model: entry.model,
    isStable: entry.isStable,
    ageSeconds: Math.round((Date.now() - entry.cachedAt) / 1000),
  };
}

/**
 * 清理所有过期的fallback缓存(定时调用)
 * 建议每5分钟调用一次
 */
export function cleanupExpiredFallbackCache(): void {
  const now = Date.now();
  const expiredAgents: string[] = [];
  const expiredProviders: string[] = [];
  
  // 清理Agent级别缓存
  for (const [agentId, entry] of fallbackCache.entries()) {
    const ttl = entry.isStable ? FALLBACK_CACHE_STABLE_TTL_MS : FALLBACK_CACHE_TTL_MS;
    const elapsed = now - entry.cachedAt;
    
    if (elapsed >= ttl) {
      expiredAgents.push(agentId);
    }
  }
  
  for (const agentId of expiredAgents) {
    fallbackCache.delete(agentId);
    log.debug(
      `[fallback-cache] agentId=${agentId}: cache expired and removed`,
    );
  }
  
  // 清理Provider级别缓存
  for (const [modelStr, entry] of providerCache.entries()) {
    const ttl = entry.isUsable ? PROVIDER_CACHE_TTL_USABLE_MS : PROVIDER_CACHE_TTL_UNUSABLE_MS;
    const elapsed = now - entry.lastCheckedAt;
    
    if (elapsed >= ttl) {
      expiredProviders.push(modelStr);
    }
  }
  
  for (const modelStr of expiredProviders) {
    providerCache.delete(modelStr);
    log.debug(
      `[provider-cache] model="${modelStr}": cache expired and removed`,
    );
  }
  
  if (expiredAgents.length > 0 || expiredProviders.length > 0) {
    log.info(
      `[fallback-cache] cleaned up ${expiredAgents.length} agent cache(s) and ${expiredProviders.length} provider cache(s)`,
    );
  }
}
