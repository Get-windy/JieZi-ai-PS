/**
 * Helpers for listing and resolving bundled web search providers.
 * These wrap the upstream plugin web-search registry to expose
 * a stable local API used by onboard/configure flows.
 */

import type { PluginWebSearchProviderEntry } from "../../upstream/src/plugins/types.js";
import { resolvePluginWebSearchProviders } from "../../upstream/src/plugins/web-search-providers.runtime.js";

/**
 * Returns all bundled web search provider entries (no runtime config required).
 * These are the built-in providers shipped with the application.
 */
export function listBundledWebSearchProviders(): PluginWebSearchProviderEntry[] {
  return resolvePluginWebSearchProviders({ bundledAllowlistCompat: true });
}

/**
 * Given a web search provider id (e.g. "brave", "tavily"),
 * returns the corresponding bundled plugin id, or undefined if not found.
 */
export function resolveBundledWebSearchPluginId(providerId?: string): string | undefined {
  if (!providerId) {
    return undefined;
  }
  const providers = listBundledWebSearchProviders();
  const entry = providers.find((p) => p.id === providerId);
  return entry?.pluginId;
}
