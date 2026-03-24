import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelCompatConfig } from "../../upstream/src/config/types.models.js";

export const XAI_TOOL_SCHEMA_PROFILE = "xai";
export const HTML_ENTITY_TOOL_CALL_ARGUMENTS_ENCODING = "html-entities";

function extractModelCompat(
  modelOrCompat: { compat?: unknown } | ModelCompatConfig | undefined,
): ModelCompatConfig | undefined {
  if (!modelOrCompat || typeof modelOrCompat !== "object") {
    return undefined;
  }
  if ("compat" in modelOrCompat) {
    const compat = (modelOrCompat as { compat?: unknown }).compat;
    return compat && typeof compat === "object" ? (compat as ModelCompatConfig) : undefined;
  }
  return modelOrCompat as ModelCompatConfig;
}

export function applyModelCompatPatch<T extends { compat?: ModelCompatConfig }>(
  model: T,
  patch: ModelCompatConfig,
): T {
  const nextCompat = { ...model.compat, ...patch };
  if (
    model.compat &&
    Object.entries(patch).every(
      ([key, value]) => model.compat?.[key as keyof ModelCompatConfig] === value,
    )
  ) {
    return model;
  }
  return {
    ...model,
    compat: nextCompat,
  };
}

export function applyXaiModelCompat<T extends { compat?: ModelCompatConfig }>(model: T): T {
  return applyModelCompatPatch(model, {
    toolSchemaProfile: XAI_TOOL_SCHEMA_PROFILE,
    nativeWebSearchTool: true,
    toolCallArgumentsEncoding: HTML_ENTITY_TOOL_CALL_ARGUMENTS_ENCODING,
  });
}

export function usesXaiToolSchemaProfile(
  modelOrCompat: { compat?: unknown } | ModelCompatConfig | undefined,
): boolean {
  return extractModelCompat(modelOrCompat)?.toolSchemaProfile === XAI_TOOL_SCHEMA_PROFILE;
}

export function hasNativeWebSearchTool(
  modelOrCompat: { compat?: unknown } | ModelCompatConfig | undefined,
): boolean {
  return extractModelCompat(modelOrCompat)?.nativeWebSearchTool === true;
}

export function resolveToolCallArgumentsEncoding(
  modelOrCompat: { compat?: unknown } | ModelCompatConfig | undefined,
): ModelCompatConfig["toolCallArgumentsEncoding"] | undefined {
  return extractModelCompat(modelOrCompat)?.toolCallArgumentsEncoding;
}

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

function isOpenAINativeEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "api.openai.com";
  } catch {
    return false;
  }
}

function isAnthropicMessagesModel(model: Model<Api>): model is Model<"anthropic-messages"> {
  return model.api === "anthropic-messages";
}

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}

function isZaiOrMoonshotModel(model: Model<Api>): boolean {
  if (!isOpenAiCompletionsModel(model)) return false;
  const baseUrl = model.baseUrl ?? "";
  const isZai = model.provider === "zai" || baseUrl.includes("api.z.ai");
  const isMoonshot =
    model.provider === "moonshot" ||
    baseUrl.includes("moonshot.ai") ||
    baseUrl.includes("moonshot.cn");
  return isZai || isMoonshot;
}

export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  const baseUrl = model.baseUrl ?? "";

  // Normalise anthropic-messages baseUrl: strip trailing /v1 that users may
  // have included in their config. pi-ai appends /v1/messages itself.
  if (isAnthropicMessagesModel(model) && baseUrl) {
    const normalised = normalizeAnthropicBaseUrl(baseUrl);
    if (normalised !== baseUrl) {
      return { ...model, baseUrl: normalised } as Model<"anthropic-messages">;
    }
  }

  // Local override: zai and moonshot providers do not support the `developer` role.
  if (isZaiOrMoonshotModel(model)) {
    const compat = (model as Model<"openai-completions">).compat ?? undefined;
    if (compat?.supportsDeveloperRole === false) {
      return model;
    }
    return {
      ...model,
      compat: compat ? { ...compat, supportsDeveloperRole: false } : { supportsDeveloperRole: false },
    } as typeof model;
  }

  if (!isOpenAiCompletionsModel(model)) {
    return model;
  }

  // The `developer` role and stream usage chunks are OpenAI-native behaviors.
  // Many OpenAI-compatible backends reject `developer` and/or emit usage-only
  // chunks that break strict parsers expecting choices[0]. Additionally, the
  // `strict` boolean inside tools validation is rejected by several providers
  // causing tool calls to be ignored. For non-native openai-completions endpoints,
  // default these compat flags off unless explicitly opted in.
  const compat = model.compat ?? undefined;
  // When baseUrl is empty the pi-ai library defaults to api.openai.com, so
  // leave compat unchanged and let default native behavior apply.
  const needsForce = baseUrl ? !isOpenAINativeEndpoint(baseUrl) : false;
  if (!needsForce) {
    return model;
  }
  const forcedDeveloperRole = compat?.supportsDeveloperRole === true;
  const hasStreamingUsageOverride = compat?.supportsUsageInStreaming !== undefined;
  const targetStrictMode = compat?.supportsStrictMode ?? false;
  if (
    compat?.supportsDeveloperRole !== undefined &&
    hasStreamingUsageOverride &&
    compat?.supportsStrictMode !== undefined
  ) {
    return model;
  }

  // Return a new object — do not mutate the caller's model reference.
  return {
    ...model,
    compat: compat
      ? {
          ...compat,
          supportsDeveloperRole: forcedDeveloperRole || false,
          ...(hasStreamingUsageOverride ? {} : { supportsUsageInStreaming: false }),
          supportsStrictMode: targetStrictMode,
        }
      : {
          supportsDeveloperRole: false,
          supportsUsageInStreaming: false,
          supportsStrictMode: false,
        },
  } as typeof model;
}