/**
 * Local overlay for upstream/src/agents/runtime-plugins.ts
 *
 * The upstream version calls loadOpenClawPlugins({ workspaceDir }) on every
 * invocation (called from run.ts, compact.ts, subagent-registry.ts — i.e. on
 * every agent turn). Because the loader's internal cache key includes
 * workspaceDir AND the full serialized plugins config (including
 * entries[].config which may contain freshly-created objects), the cache
 * almost always misses, triggering a full jiti-based plugin reload every
 * second.
 *
 * This overlay routes all calls through the process-level singleton in
 * src/plugins/tools.ts (getOrLoadRegistry), which:
 *   1. Uses a stable cache key (excludes entries[].config dynamic content)
 *   2. Omits workspaceDir so all agents share one registry
 *   3. Returns the singleton immediately on the hot path (no Map lookup)
 */

import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { applyTestPluginDefaults, normalizePluginsConfig } from "../../upstream/src/plugins/config-state.js";
import { loadOpenClawPlugins } from "../../upstream/src/plugins/loader.js";
import { createPluginLoaderLogger } from "../../upstream/src/plugins/logger.js";
import { createSubsystemLogger } from "../../upstream/src/logging/subsystem.js";
import type { PluginRegistry } from "../../upstream/src/plugins/registry.js";

const log = createSubsystemLogger("plugins");

// ─── 进程级单例（与 src/plugins/tools.ts 共享同一 globalThis key）─────────────
const SINGLETON_KEY = "__openclaw_plugin_registry_singleton__";
const SINGLETON_CKEY = "__openclaw_plugin_registry_singleton_key__";

function getGlobalSingleton(): PluginRegistry | undefined {
  return (globalThis as Record<string, unknown>)[SINGLETON_KEY] as PluginRegistry | undefined;
}
function setGlobalSingleton(registry: PluginRegistry, cacheKey: string): void {
  (globalThis as Record<string, unknown>)[SINGLETON_KEY] = registry;
  (globalThis as Record<string, unknown>)[SINGLETON_CKEY] = cacheKey;
}
function getGlobalSingletonKey(): string | undefined {
  return (globalThis as Record<string, unknown>)[SINGLETON_CKEY] as string | undefined;
}

// Map 级缓存（进程级，防止 rolldown 多 chunk 拆分导致 globalThis 竞争）
const CACHE_KEY = "__openclaw_plugin_registry_cache__";
function getCache(): Map<string, PluginRegistry> {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new Map<string, PluginRegistry>();
  }
  return g[CACHE_KEY] as Map<string, PluginRegistry>;
}

function buildStableCacheKey(config: OpenClawConfig | undefined, env: NodeJS.ProcessEnv): string {
  const normalized = normalizePluginsConfig(config?.plugins);
  const stable = {
    enabled: normalized.enabled,
    allow: normalized.allow,
    deny: normalized.deny,
    loadPaths: normalized.loadPaths,
    slots: normalized.slots,
    entriesEnabled: Object.fromEntries(
      Object.entries(normalized.entries).map(([k, v]) => [k, (v as { enabled?: boolean }).enabled]),
    ),
    nodeEnv: env.NODE_ENV ?? "",
  };
  return JSON.stringify(stable);
}

// ── 调试：记录 key 变化次数（防止所有条目都打印导致执行缓慢）
// 每次 key 不同时才完整输出
let _lastSeenKey: string | undefined;
let _keyChangedCount = 0;

export function ensureRuntimePluginsLoaded(params: {
  config?: OpenClawConfig;
  workspaceDir?: string | null;
}): void {
  const env = process.env;
  const effectiveConfig = applyTestPluginDefaults(params.config ?? {}, env);
  const normalized = normalizePluginsConfig(effectiveConfig.plugins);

  // 插件全局禁用时快速返回，完全避免任何加载
  if (!normalized.enabled) {
    return;
  }

  const cacheKey = buildStableCacheKey(effectiveConfig, env);

  // ── 调试：判断 key 是否发生变化 ────────────────────────────────
  if (_lastSeenKey !== undefined && _lastSeenKey !== cacheKey) {
    _keyChangedCount += 1;
    // 首次以及每 10 次打印完整 key 对比
    if (_keyChangedCount <= 3 || _keyChangedCount % 10 === 0) {
      log.info(
        `[DEBUG-PLUGINS] stable key CHANGED (#${_keyChangedCount})!\n` +
        `  OLD=${_lastSeenKey}\n` +
        `  NEW=${cacheKey}`
      );
    }
  }
  _lastSeenKey = cacheKey;
  // ────────────────────────────────────────────────────────────────

  // 快速路径：进程级单例命中
  const singleton = getGlobalSingleton();
  const singletonKey = getGlobalSingletonKey();
  if (singleton && singletonKey === cacheKey) {
    return;
  }
  if (singleton && singletonKey !== cacheKey) {
    log.info(
      `[DEBUG-PLUGINS] singleton key mismatch (#${_keyChangedCount})!\n` +
      `  singleton=${singletonKey}\n` +
      `  current  =${cacheKey}\n` +
      `  caller   =${new Error().stack?.split('\n').slice(1, 5).join(' | ') ?? '?'}`
    );
  }

  // Map 缓存命中
  const cache = getCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    setGlobalSingleton(cached, cacheKey);
    return;
  }

  // 缓存 MISS：真正加载一次（不传 workspaceDir，所有 agent 共享同一 registry）
  log.info(
    `[DEBUG-PLUGINS] cache MISS ensureRuntimePluginsLoaded\n` +
    `  key=${cacheKey}\n` +
    `  caller=${new Error().stack?.split('\n').slice(1, 5).join(' | ') ?? '?'}`
  );
  const registry = loadOpenClawPlugins({
    config: effectiveConfig,
    // workspaceDir 意图省略：避免每个 agent 因 workspaceDir 不同而导致缓存 miss
    env,
    logger: createPluginLoaderLogger(log),
  });
  cache.set(cacheKey, registry);
  setGlobalSingleton(registry, cacheKey);
}
