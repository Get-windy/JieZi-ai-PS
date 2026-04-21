/**
 * Local overlay for upstream/src/plugins/tools.ts
 *
 * Instead of calling resolveRuntimePluginRegistry (which may trigger a fresh
 * plugin load on every tool construction hot-path), this version reads the
 * process-level singleton written by ensureRuntimePluginsLoaded /
 * plugin-hot-reload.ts, guaranteeing a zero-cost O(1) registry lookup once
 * plugins are loaded.
 */

import { normalizeToolName } from "../../upstream/src/agents/tool-policy.js";
import type { AnyAgentTool } from "../../upstream/src/agents/tools/common.js";
import {
  applyTestPluginDefaults,
  normalizePluginsConfig,
} from "../../upstream/src/plugins/config-state.js";
import type { PluginRegistry } from "../../upstream/src/plugins/registry-types.js";
import type { OpenClawPluginToolContext } from "../../upstream/src/plugins/types.js";

type PluginToolMeta = {
  pluginId: string;
  optional: boolean;
};

const pluginToolMeta = new WeakMap<AnyAgentTool, PluginToolMeta>();

export function getPluginToolMeta(tool: AnyAgentTool): PluginToolMeta | undefined {
  return pluginToolMeta.get(tool);
}

export function copyPluginToolMeta(source: AnyAgentTool, target: AnyAgentTool): void {
  const meta = pluginToolMeta.get(source);
  if (meta) {
    pluginToolMeta.set(target, meta);
  }
}

function normalizeAllowlist(list?: string[]) {
  return new Set((list ?? []).map(normalizeToolName).filter(Boolean));
}

function isOptionalToolAllowed(params: {
  toolName: string;
  pluginId: string;
  allowlist: Set<string>;
}): boolean {
  if (params.allowlist.size === 0) {
    return false;
  }
  const toolName = normalizeToolName(params.toolName);
  if (params.allowlist.has(toolName)) {
    return true;
  }
  const pluginKey = normalizeToolName(params.pluginId);
  if (params.allowlist.has(pluginKey)) {
    return true;
  }
  return params.allowlist.has("group:plugins");
}

// ─── 进程级单例（与 runtime-plugins.ts / plugin-hot-reload.ts 共享同一 globalThis key）─────────────
const SINGLETON_KEY = "__openclaw_plugin_registry_singleton__";
const SINGLETON_CKEY = "__openclaw_plugin_registry_singleton_key__";
const CACHE_KEY = "__openclaw_plugin_registry_cache__";

function getCache(): Map<string, PluginRegistry> {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new Map<string, PluginRegistry>();
  }
  return g[CACHE_KEY] as Map<string, PluginRegistry>;
}

function buildStableCacheKey(
  config: Record<string, unknown> | undefined,
  env: NodeJS.ProcessEnv,
): string {
  const normalized = normalizePluginsConfig((config as { plugins?: unknown })?.plugins);
  const stable = {
    enabled: normalized.enabled,
    allow: normalized.allow,
    deny: normalized.deny,
    loadPaths: normalized.loadPaths,
    slots: normalized.slots,
    entriesEnabled: Object.fromEntries(
      Object.entries(normalized.entries).map(([k, v]) => [
        k,
        (v as { enabled?: boolean }).enabled,
      ]),
    ),
    nodeEnv: env.NODE_ENV ?? "",
  };
  return JSON.stringify(stable);
}

/**
 * Returns the cached PluginRegistry singleton if the cache key matches the
 * current config, otherwise falls back to the Map cache.
 * Returns undefined if no registry has been loaded yet.
 */
function getOrLoadRegistry(
  effectiveConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): PluginRegistry | undefined {
  const g = globalThis as Record<string, unknown>;
  const singleton = g[SINGLETON_KEY] as PluginRegistry | undefined;
  const singletonKey = g[SINGLETON_CKEY] as string | undefined;
  const cacheKey = buildStableCacheKey(effectiveConfig, env);

  // 快速路径：进程级单例命中
  if (singleton && singletonKey === cacheKey) {
    return singleton;
  }

  // Map 缓存命中
  const cache = getCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    // 将命中项提升为单例
    g[SINGLETON_KEY] = cached;
    g[SINGLETON_CKEY] = cacheKey;
    return cached;
  }

  // 缓存 MISS：尚未加载，返回 undefined（调用方应先调用 ensureRuntimePluginsLoaded）
  return undefined;
}

export function resolvePluginTools(params: {
  context: OpenClawPluginToolContext;
  existingToolNames?: Set<string>;
  toolAllowlist?: string[];
  suppressNameConflicts?: boolean;
  env?: NodeJS.ProcessEnv;
}): AnyAgentTool[] {
  // Fast path: when plugins are effectively disabled, avoid discovery/jiti entirely.
  const env = params.env ?? process.env;
  const effectiveConfig = applyTestPluginDefaults(params.context.config ?? {}, env);
  const normalized = normalizePluginsConfig(effectiveConfig.plugins);
  if (!normalized.enabled) {
    return [];
  }

  // Use process-level singleton instead of calling loadOpenClawPlugins with workspaceDir
  const registry = getOrLoadRegistry(effectiveConfig as Record<string, unknown>, env);

  if (!registry) {
    return [];
  }

  const tools: AnyAgentTool[] = [];
  const existing = params.existingToolNames ?? new Set<string>();
  const existingNormalized = new Set(Array.from(existing, (tool) => normalizeToolName(tool)));
  const allowlist = normalizeAllowlist(params.toolAllowlist);
  const blockedPlugins = new Set<string>();

  for (const entry of registry.tools) {
    if (blockedPlugins.has(entry.pluginId)) {
      continue;
    }
    const pluginIdKey = normalizeToolName(entry.pluginId);
    if (existingNormalized.has(pluginIdKey)) {
      const message = `plugin id conflicts with core tool name (${entry.pluginId})`;
      if (!params.suppressNameConflicts) {
        registry.diagnostics.push({
          level: "error",
          pluginId: entry.pluginId,
          source: entry.source,
          message,
        });
      }
      blockedPlugins.add(entry.pluginId);
      continue;
    }
    let resolved: AnyAgentTool | AnyAgentTool[] | null | undefined = null;
    try {
      resolved = entry.factory(params.context);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`plugin tool failed (${entry.pluginId}): ${String(err)}`);
      continue;
    }
    if (!resolved) {
      continue;
    }
    const listRaw = Array.isArray(resolved) ? resolved : [resolved];
    const list = entry.optional
      ? listRaw.filter((tool) =>
          isOptionalToolAllowed({
            toolName: tool.name,
            pluginId: entry.pluginId,
            allowlist,
          }),
        )
      : listRaw;
    if (list.length === 0) {
      continue;
    }
    const nameSet = new Set<string>();
    for (const tool of list) {
      if (nameSet.has(tool.name) || existing.has(tool.name)) {
        const message = `plugin tool name conflict (${entry.pluginId}): ${tool.name}`;
        if (!params.suppressNameConflicts) {
          registry.diagnostics.push({
            level: "error",
            pluginId: entry.pluginId,
            source: entry.source,
            message,
          });
        }
        continue;
      }
      nameSet.add(tool.name);
      existing.add(tool.name);
      pluginToolMeta.set(tool, {
        pluginId: entry.pluginId,
        optional: entry.optional,
      });
      tools.push(tool);
    }
  }

  return tools;
}
