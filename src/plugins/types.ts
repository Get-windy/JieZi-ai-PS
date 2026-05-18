/**
 * Re-exports all plugin type definitions from upstream.
 * Local files import from this module instead of directly referencing upstream paths.
 */
export type * from "../../upstream/src/plugins/types.js";
export {
  PluginApprovalResolutions,
  isPluginHookName,
  isPromptInjectionHookName,
  isConversationHookName,
  stripPromptMutationFieldsFromLegacyHookResult,
  AGENT_PROMPT_SURFACE_KINDS,
} from "../../upstream/src/plugins/types.js";
export type { AgentPromptSurfaceKind } from "../../upstream/src/plugins/types.js";
