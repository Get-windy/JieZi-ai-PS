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

// 校验 edits 数组：每项必须含非空 oldText 字符串和 newText 字符串
function hasValidEditsArray(record: Record<string, unknown>): boolean {
  const edits = record.edits;
  if (!Array.isArray(edits) || edits.length === 0) {
    return false;
  }
  return edits.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).oldText === "string" &&
      ((entry as Record<string, unknown>).oldText as string).trim().length > 0 &&
      typeof (entry as Record<string, unknown>).newText === "string",
  );
}

// 校验 old_string（平铺格式，兼容旧调用方式）
function hasValidOldString(record: Record<string, unknown>): boolean {
  return typeof record.old_string === "string" && record.old_string.trim().length > 0;
}

// CLAUDE_PARAM_GROUPS: shorthand for the most common required-param groups.
export const CLAUDE_PARAM_GROUPS = {
  read: [{ keys: ["path"], label: "path" }],
  write: [
    { keys: ["path"], label: "path" },
    { keys: ["content"], label: "content" },
  ],
  edit: [
    { keys: ["path"], label: "path" },
    {
      keys: ["edits", "old_string"],
      label: "edits or old_string",
      // 修复：edits 是数组类型，不能用字符串校验；需自定义 validator 兼容两种格式
      validator: (record: Record<string, unknown>) =>
        hasValidEditsArray(record) || hasValidOldString(record),
    },
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
