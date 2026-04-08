/**
 * Re-exports all plugin type definitions from upstream.
 * Local files import from this module instead of directly referencing upstream paths.
 */
export type * from "../../upstream/src/plugins/types.js";
export {
  PluginApprovalResolutions,
  isPluginHookName,
  isPromptInjectionHookName,
  stripPromptMutationFieldsFromLegacyHookResult,
} from "../../upstream/src/plugins/types.js";
