/**
 * Re-exports web search provider runtime helpers from upstream.
 * Local files import from this module instead of directly referencing upstream paths.
 */
export {
  resolvePluginWebSearchProviders,
  resolveRuntimeWebSearchProviders,
} from "../../upstream/src/plugins/web-search-providers.runtime.js";
