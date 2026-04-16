/**
 * 插件 Provider 相关函数
 * 从 upstream providers.ts（静态函数）和 providers.runtime.ts（运行时函数）重新导出
 */

// 静态 provider 函数（不依赖运行时插件注册表）
export {
  withBundledProviderVitestCompat,
  resolveBundledProviderCompatPluginIds,
  resolveEnabledProviderPluginIds,
  resolveOwningPluginIdsForProvider,
  resolveOwningPluginIdsForModelRefs,
  resolveNonBundledProviderPluginIds,
  resolveCatalogHookProviderPluginIds,
  resolveDiscoveredProviderPluginIds,
  resolveDiscoverableProviderOwnerPluginIds,
  resolveActivatableProviderOwnerPluginIds,
} from "../../upstream/src/plugins/providers.js";

// 运行时 provider 函数（依赖已加载的插件）
export { resolvePluginProviders } from "../../upstream/src/plugins/providers.runtime.js";
