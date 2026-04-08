// Local overlay: provides CLAUDE_PARAM_GROUPS, normalizeToolParams,
// patchToolSchemaForClaudeCompatibility, and wrapToolParamNormalization
// which do not exist in upstream's pi-tools.params.ts.
// Re-exports upstream symbols that do exist.
export {
  type RequiredParamGroup,
  REQUIRED_PARAM_GROUPS,
  getToolParamsRecord,
  assertRequiredParams,
  wrapToolParamValidation,
} from "../../upstream/src/agents/pi-tools.params.js";
import type { RequiredParamGroup } from "../../upstream/src/agents/pi-tools.params.js";
import { assertRequiredParams } from "../../upstream/src/agents/pi-tools.params.js";
import type { AnyAgentTool } from "../../upstream/src/agents/pi-tools.types.js";

// CLAUDE_PARAM_GROUPS: shorthand for the most common required-param groups.
export const CLAUDE_PARAM_GROUPS = {
  read: [{ keys: ["path"], label: "path" }],
  write: [
    { keys: ["path"], label: "path" },
    { keys: ["content"], label: "content" },
  ],
  edit: [
    { keys: ["path"], label: "path" },
    { keys: ["edits", "old_string"], label: "edits or old_string" },
  ],
} as const satisfies Record<string, readonly RequiredParamGroup[]>;

// normalizeToolParams: normalize tool params from various Claude formats.
// Claude may pass params as a JSON string, nested object, or plain record.
export function normalizeToolParams(params: unknown): Record<string, unknown> | undefined {
  if (!params || typeof params !== "object") {
    if (typeof params === "string") {
      try {
        const parsed = JSON.parse(params);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // not JSON
      }
    }
    return undefined;
  }
  if (Array.isArray(params)) {
    return undefined;
  }
  // Unwrap nested "input" wrapper that some Claude versions emit.
  const record = params as Record<string, unknown>;
  if (
    Object.keys(record).length === 1 &&
    "input" in record &&
    record.input &&
    typeof record.input === "object" &&
    !Array.isArray(record.input)
  ) {
    return record.input as Record<string, unknown>;
  }
  return record;
}

// patchToolSchemaForClaudeCompatibility: adjust tool JSON schema so that
// Claude (Anthropic) accepts it (e.g. remove unsupported keywords).
export function patchToolSchemaForClaudeCompatibility(tool: AnyAgentTool): AnyAgentTool {
  const schema = (tool as unknown as { inputSchema?: unknown }).inputSchema;
  if (!schema || typeof schema !== "object") {
    return tool;
  }
  const schemaRecord = schema as Record<string, unknown>;
  // Remove additionalProperties: false — Claude rejects it in some contexts.
  const { additionalProperties: _ap, ...patchedSchema } = schemaRecord;
  return {
    ...tool,
    inputSchema: patchedSchema,
  } as unknown as AnyAgentTool;
}

// wrapToolParamNormalization: normalize params then validate required groups.
export function wrapToolParamNormalization(
  tool: AnyAgentTool,
  requiredParamGroups?: readonly RequiredParamGroup[],
): AnyAgentTool {
  const normalized: AnyAgentTool = {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const record = normalizeToolParams(params);
      if (requiredParamGroups?.length) {
        assertRequiredParams(record, requiredParamGroups, tool.name);
      }
      return tool.execute(toolCallId, record ?? params, signal, onUpdate);
    },
  };
  return normalized;
}
