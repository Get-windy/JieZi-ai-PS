// Re-export from upstream — the overlay layer only extends runtime/ (directory).
// This shim ensures test/setup.ts can resolve `src/plugins/runtime.js` correctly.
export {
  setActivePluginRegistry,
  getActivePluginRegistry,
  requireActivePluginRegistry,
  pinActivePluginHttpRouteRegistry,
  releasePinnedPluginHttpRouteRegistry,
  getActivePluginHttpRouteRegistry,
  requireActivePluginHttpRouteRegistry,
  resolveActivePluginHttpRouteRegistry,
  getActivePluginRegistryKey,
  getActivePluginRegistryVersion,
} from "../../upstream/src/plugins/runtime.js";
