/**
 * Local overlay for upstream/src/infra/outbound/channel-resolution.ts
 *
 * The only change: maybeBootstrapChannelPlugin routes through the
 * process-level singleton (same globalThis keys used by runtime-plugins.ts
 * and plugins/tools.ts) instead of calling loadOpenClawPlugins directly.
 * This avoids a redundant full plugin reload whenever an outbound channel
 * resolve triggers bootstrap.
 */

import { getChannelPlugin } from "../../../upstream/src/channels/plugins/index.js";
import type { ChannelPlugin } from "../../../upstream/src/channels/plugins/types.js";
import type { OpenClawConfig } from "../../../upstream/src/config/config.js";
import { applyPluginAutoEnable } from "../../../upstream/src/config/plugin-auto-enable.js";
import { loadOpenClawPlugins } from "../../../upstream/src/plugins/loader.js";
import { getActivePluginRegistry, getActivePluginRegistryKey } from "../../../upstream/src/plugins/runtime.js";
import {
  isDeliverableMessageChannel,
  normalizeMessageChannel,
  type DeliverableMessageChannel,
} from "../../../upstream/src/utils/message-channel.js";
import { applyTestPluginDefaults, normalizePluginsConfig } from "../../../upstream/src/plugins/config-state.js";
import { createPluginLoaderLogger } from "../../../upstream/src/plugins/logger.js";
import { createSubsystemLogger } from "../../../upstream/src/logging/subsystem.js";
import type { PluginRegistry } from "../../../upstream/src/plugins/registry.js";

const log = createSubsystemLogger("plugins");

// ─── 与 runtime-plugins.ts / tools.ts 共享的进程级单例 ───────────────────────
const SINGLETON_KEY = "__openclaw_plugin_registry_singleton__";
const SINGLETON_CKEY = "__openclaw_plugin_registry_singleton_key__";
const CACHE_KEY = "__openclaw_plugin_registry_cache__";

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

const bootstrapAttempts = new Set<string>();

export function normalizeDeliverableOutboundChannel(
  raw?: string | null,
): DeliverableMessageChannel | undefined {
  const normalized = normalizeMessageChannel(raw);
  if (!normalized || !isDeliverableMessageChannel(normalized)) {
    return undefined;
  }
  return normalized;
}

function maybeBootstrapChannelPlugin(params: {
  channel: DeliverableMessageChannel;
  cfg?: OpenClawConfig;
}): void {
  const cfg = params.cfg;
  if (!cfg) {
    return;
  }

  const activeRegistry = getActivePluginRegistry();
  const activeHasRequestedChannel = activeRegistry?.channels?.some(
    (entry: { plugin?: { id?: string } }) => entry?.plugin?.id === params.channel,
  );
  if (activeHasRequestedChannel) {
    return;
  }

  const registryKey = getActivePluginRegistryKey() ?? "<none>";
  const attemptKey = `${registryKey}:${params.channel}`;
  if (bootstrapAttempts.has(attemptKey)) {
    return;
  }
  bootstrapAttempts.add(attemptKey);

  const env = process.env;
  const autoEnabled = applyPluginAutoEnable({ config: cfg }).config;
  const effectiveConfig = applyTestPluginDefaults(autoEnabled, env);
  const cacheKey = buildStableCacheKey(effectiveConfig, env);

  // 快速路径：单例已存在，直接返回，不再重复加载
  const singleton = getGlobalSingleton();
  if (singleton && getGlobalSingletonKey() === cacheKey) {
    return;
  }
  const cache = getCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    setGlobalSingleton(cached, cacheKey);
    return;
  }

  // 缓存 MISS：真正加载（不传 workspaceDir）
  try {
    const registry = loadOpenClawPlugins({
      config: effectiveConfig,
      env,
      logger: createPluginLoaderLogger(log),
    });
    cache.set(cacheKey, registry);
    setGlobalSingleton(registry, cacheKey);
  } catch {
    bootstrapAttempts.delete(attemptKey);
  }
}

function resolveDirectFromActiveRegistry(
  channel: DeliverableMessageChannel,
): ChannelPlugin | undefined {
  const activeRegistry = getActivePluginRegistry();
  if (!activeRegistry) {
    return undefined;
  }
  for (const entry of activeRegistry.channels) {
    const plugin = entry?.plugin;
    if (plugin?.id === channel) {
      return plugin;
    }
  }
  return undefined;
}

export function resolveOutboundChannelPlugin(params: {
  channel: string;
  cfg?: OpenClawConfig;
}): ChannelPlugin | undefined {
  const normalized = normalizeDeliverableOutboundChannel(params.channel);
  if (!normalized) {
    return undefined;
  }

  const resolve = () => getChannelPlugin(normalized);
  const current = resolve();
  if (current) {
    return current;
  }
  const directCurrent = resolveDirectFromActiveRegistry(normalized);
  if (directCurrent) {
    return directCurrent;
  }

  maybeBootstrapChannelPlugin({ channel: normalized, cfg: params.cfg });
  return resolve() ?? resolveDirectFromActiveRegistry(normalized);
}
