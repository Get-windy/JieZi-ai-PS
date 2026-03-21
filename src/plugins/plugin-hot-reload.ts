/**
 * 插件热插拔管理器
 *
 * 功能：
 * - 监听插件目录变化（新增/移除/修改）
 * - 动态加载新插件
 * - 动态卸载已移除的插件
 * - 不需要重启进程即可生效
 */

import fs from "node:fs";
import path from "node:path";
import { clearPluginDiscoveryCache, discoverOpenClawPlugins } from "../../upstream/src/plugins/discovery.js";
import { loadOpenClawPlugins } from "../../upstream/src/plugins/loader.js";
import { resolvePluginSourceRoots } from "../../upstream/src/plugins/roots.js";
import { getActivePluginRegistry, setActivePluginRegistry } from "../../upstream/src/plugins/runtime.js";
import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { applyTestPluginDefaults, normalizePluginsConfig } from "../../upstream/src/plugins/config-state.js";
import { createPluginLoaderLogger } from "../../upstream/src/plugins/logger.js";
import { createSubsystemLogger } from "../../upstream/src/logging/subsystem.js";

// ─── 与 runtime-plugins.ts / tools.ts / channel-resolution.ts 共享的进程级单例 key ──
const SINGLETON_KEY = "__openclaw_plugin_registry_singleton__";
const SINGLETON_CKEY = "__openclaw_plugin_registry_singleton_key__";
const CACHE_KEY = "__openclaw_plugin_registry_cache__";

const hotReloadLog = createSubsystemLogger("plugins");

/**
 * 构造与 overlay 模块完全一致的稳定 cacheKey（排除 workspaceDir / entries[].config）。
 * 热重载完成后必须用此 key 更新 globalThis 单例，避免 overlay 模块下次调用时因
 * key 不匹配再次触发全量 jiti 加载。
 */
function buildHotReloadCacheKey(cfg: OpenClawConfig, env: NodeJS.ProcessEnv): string {
  const normalized = normalizePluginsConfig(cfg.plugins);
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

// 文件系统监听器
let fsWatcher: fs.FSWatcher | null = null;
let isWatching = false;

// 已发现的插件路径集合（用于检测变化）
const discoveredPluginPaths = new Set<string>();

// 防抖定时器
let reloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const RELOAD_DEBOUNCE_MS = 3000; // 3秒防抖

// 重载锁：防止重载期间产生的文件系统事件再次触发重载（无限循环）
let isReloading = false;
// 重载静默期：重载完成后额外静默一段时间，等待 jiti 缓存写入等副作用平息
const POST_RELOAD_SILENCE_MS = 5000;
let postReloadSilenceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 启动插件热插拔监听
 *
 * @param params - 监听参数
 */
export function startPluginHotReload(params: {
  cfg: OpenClawConfig;
  workspaceDir?: string;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}): void {
  if (isWatching) {
    return;
  }

  const env = process.env;
  const workspaceDir = params.workspaceDir?.trim();
  const workspaceRoot = workspaceDir ? path.resolve(workspaceDir) : undefined;

  // 获取插件源根目录
  const roots = resolvePluginSourceRoots({ workspaceDir: workspaceRoot, env });

  // 记录当前已发现的插件
  recordDiscoveredPlugins();

  // 设置文件系统监听
  const watchDirs = [
    roots.global,
    roots.workspace,
    ...(params.cfg.plugins?.load?.paths ?? []),
  ].filter((dir): dir is string => typeof dir === "string" && fs.existsSync(dir));

  if (watchDirs.length === 0) {
    params.log.warn("[PluginHotReload] No plugin directories to watch");
    return;
  }

  // 使用 Node.js 原生 fs.watch 监听目录变化
  fsWatcher = fs.watch(
    watchDirs[0], // 主要监听 global 目录
    { recursive: true },
    (eventType, filename) => {
      if (!filename) return;

      // 重载期间或静默期内忽略所有事件，避免 jiti 编译缓存写入引发无限循环
      if (isReloading || postReloadSilenceTimer) return;

      // 只关注插件入口文件的变化
      const isPluginFile =
        filename.endsWith("index.ts") ||
        filename.endsWith("index.js") ||
        filename.endsWith("plugin.ts") ||
        filename.endsWith("plugin.js") ||
        filename.endsWith("package.json");

      if (!isPluginFile) return;

      // 对于所有文件，只响应 rename 事件（真正新增/删除插件）
      // 忽略 change 事件：jiti 加载/编译时会反复读取 .ts/.js/package.json，
      // 导致 Node fs.watch 触发 change，从而产生无限重载循环
      if (eventType === "change") {
        return;
      }

      params.log.info(`[PluginHotReload] Detected ${eventType}: ${filename}`);

      // 防抖处理，避免短时间内多次重载
      if (reloadDebounceTimer) {
        clearTimeout(reloadDebounceTimer);
      }

      reloadDebounceTimer = setTimeout(() => {
        void handlePluginChanges(params);
      }, RELOAD_DEBOUNCE_MS);
    }
  );

  isWatching = true;
  params.log.info(`[PluginHotReload] Started watching ${watchDirs.join(", ")}`);
}

/**
 * 停止插件热插拔监听
 */
export function stopPluginHotReload(): void {
  if (fsWatcher) {
    fsWatcher.close();
    fsWatcher = null;
  }
  isWatching = false;

  if (reloadDebounceTimer) {
    clearTimeout(reloadDebounceTimer);
    reloadDebounceTimer = null;
  }

  if (postReloadSilenceTimer) {
    clearTimeout(postReloadSilenceTimer);
    postReloadSilenceTimer = null;
  }

  isReloading = false;
}

/**
 * 记录当前已发现的插件
 */
function recordDiscoveredPlugins(): void {
  const currentRegistry = getActivePluginRegistry();
  if (!currentRegistry) return;

  discoveredPluginPaths.clear();
  for (const plugin of currentRegistry.plugins) {
    discoveredPluginPaths.add(plugin.source);
    if (plugin.rootDir) {
      discoveredPluginPaths.add(plugin.rootDir);
    }
  }
}

/**
 * 处理插件变化
 */
async function handlePluginChanges(params: {
  cfg: OpenClawConfig;
  workspaceDir?: string;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}): Promise<void> {
  params.log.info("[PluginHotReload] Checking for plugin changes...");

  try {
    // 清除发现缓存，强制重新发现
    clearPluginDiscoveryCache();

    // 重新发现插件
    const newDiscovery = discoverOpenClawPlugins({
      workspaceDir: params.workspaceDir,
      extraPaths: params.cfg.plugins?.load?.paths,
      env: process.env,
    });

    // 检测新增和移除的插件
    const newPluginPaths = new Set(newDiscovery.candidates.map((c) => c.source));
    const addedPlugins: string[] = [];
    const removedPlugins: string[] = [];

    // 检测新增
    for (const candidate of newDiscovery.candidates) {
      if (!discoveredPluginPaths.has(candidate.source)) {
        addedPlugins.push(candidate.idHint || path.basename(candidate.rootDir || candidate.source));
      }
    }

    // 检测移除
    for (const oldPath of discoveredPluginPaths) {
      if (!newPluginPaths.has(oldPath)) {
        removedPlugins.push(path.basename(oldPath));
      }
    }

    if (addedPlugins.length === 0 && removedPlugins.length === 0) {
      params.log.info("[PluginHotReload] No plugin changes detected");
      return;
    }

    params.log.info(
      `[PluginHotReload] Changes detected: +${addedPlugins.length} added, -${removedPlugins.length} removed`
    );

    if (addedPlugins.length > 0) {
      params.log.info(`[PluginHotReload] Added: ${addedPlugins.join(", ")}`);
    }
    if (removedPlugins.length > 0) {
      params.log.info(`[PluginHotReload] Removed: ${removedPlugins.join(", ")}`);
    }

    // 重新加载插件注册表
    await reloadPluginRegistry(params);

  } catch (error) {
    params.log.error(`[PluginHotReload] Error handling changes: ${String(error)}`);
  }
}

/**
 * 重新加载插件注册表
 */
async function reloadPluginRegistry(params: {
  cfg: OpenClawConfig;
  workspaceDir?: string;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}): Promise<void> {
  // 设置重载锁，防止加载过程中产生的文件事件再次触发重载
  isReloading = true;
  try {
    params.log.info("[PluginHotReload] Reloading plugin registry...");

    // 加载新的插件注册表
    // 注意：不传 workspaceDir，与 overlay 模块的稳定 cacheKey 对齐，
    // 确保热重载后的 globalThis 单例 key 能被 ensureRuntimePluginsLoaded / resolvePluginTools 命中
    const env = process.env;
    const effectiveConfig = applyTestPluginDefaults(params.cfg, env);
    const newRegistry = loadOpenClawPlugins({
      config: effectiveConfig,
      // workspaceDir 意图省略：与 overlay 模块的稳定 cacheKey 保持一致，
      // 避免热重载后 overlay 层因 key 不匹配再次触发全量加载
      logger: createPluginLoaderLogger(hotReloadLog),
      activate: true,
    });

    // 计算与 overlay 模块完全一致的稳定 cacheKey
    const stableCacheKey = buildHotReloadCacheKey(effectiveConfig, env);

    // 更新活跃注册表
    setActivePluginRegistry(newRegistry);

    // ── 原子更新进程级单例（registry + key 必须同时写入）──
    // 如果只更新 registry 而不写 key，下次 overlay 调用时 key 为 undefined，
    // 与任何有效 cacheKey 都不匹配，会触发 Map 查找；Map 已清空则再次全量加载。
    const g = globalThis as Record<string, unknown>;
    g[SINGLETON_KEY] = newRegistry;
    g[SINGLETON_CKEY] = stableCacheKey;
    // 同样用新 registry 填充 Map 缓存，让后续的 Map 命中路径也生效
    const cache = g[CACHE_KEY];
    if (cache instanceof Map) {
      cache.clear();
      cache.set(stableCacheKey, newRegistry);
    }

    // 更新已发现的插件记录
    recordDiscoveredPlugins();

    params.log.info(`[PluginHotReload] Registry reloaded: ${newRegistry.plugins.length} plugins total`);

    // 广播插件变化事件（如果支持）
    broadcastPluginChange();

  } catch (error) {
    params.log.error(`[PluginHotReload] Failed to reload registry: ${String(error)}`);
  } finally {
    isReloading = false;
    // 重载完成后启动静默期，等待 jiti 缓存写入等副作用平息
    if (postReloadSilenceTimer) {
      clearTimeout(postReloadSilenceTimer);
    }
    postReloadSilenceTimer = setTimeout(() => {
      postReloadSilenceTimer = null;
    }, POST_RELOAD_SILENCE_MS);
  }
}

/**
 * 广播插件变化事件
 */
function broadcastPluginChange(): void {
  // 这里可以集成到网关的广播机制中
  // 通知所有连接的客户端插件列表已更新
}

/**
 * 手动触发插件重载
 */
export async function triggerPluginReload(params: {
  cfg: OpenClawConfig;
  workspaceDir?: string;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}): Promise<void> {
  params.log.info("[PluginHotReload] Manual reload triggered");
  await handlePluginChanges(params);
}

/**
 * 获取热插拔状态
 */
export function getPluginHotReloadStatus(): {
  isWatching: boolean;
  watchedPaths: number;
  discoveredPlugins: number;
} {
  return {
    isWatching,
    watchedPaths: fsWatcher ? 1 : 0,
    discoveredPlugins: discoveredPluginPaths.size,
  };
}
