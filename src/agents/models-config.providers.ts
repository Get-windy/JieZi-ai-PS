import type { OpenClawConfig } from "../config/config.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import { coerceSecretRef } from "../config/types.secrets.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  DEFAULT_COPILOT_API_BASE_URL,
  resolveCopilotApiToken,
} from "../providers/github-copilot-token.js";
import { KILOCODE_BASE_URL } from "../providers/kilocode-shared.js";
import { normalizeOptionalSecretInput } from "../utils/normalize-secret-input.js";
import { ensureAuthProfileStore, listProfilesForProvider } from "./auth-profiles.js";
import { discoverBedrockModels } from "./bedrock-discovery.js";
import {
  buildBytePlusModelDefinition,
  BYTEPLUS_BASE_URL,
  BYTEPLUS_MODEL_CATALOG,
  BYTEPLUS_CODING_BASE_URL,
  BYTEPLUS_CODING_MODEL_CATALOG,
} from "./byteplus-models.js";
import {
  buildCloudflareAiGatewayModelDefinition,
  resolveCloudflareAiGatewayBaseUrl,
} from "./cloudflare-ai-gateway.js";
import {
  buildDoubaoModelDefinition,
  DOUBAO_BASE_URL,
  DOUBAO_MODEL_CATALOG,
  DOUBAO_CODING_BASE_URL,
  DOUBAO_CODING_MODEL_CATALOG,
} from "./doubao-models.js";
import {
  discoverHuggingfaceModels,
  HUGGINGFACE_BASE_URL,
  HUGGINGFACE_MODEL_CATALOG,
  buildHuggingfaceModelDefinition,
} from "./huggingface-models.js";
import { discoverKilocodeModels } from "./kilocode-models.js";
import { resolveAwsSdkEnvVarName, resolveEnvApiKey } from "./model-auth.js";
import { OLLAMA_NATIVE_BASE_URL } from "./ollama-stream.js";
import {
  buildSyntheticModelDefinition,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_MODEL_CATALOG,
} from "./synthetic-models.js";
import {
  TOGETHER_BASE_URL,
  TOGETHER_MODEL_CATALOG,
  buildTogetherModelDefinition,
} from "./together-models.js";
import { discoverVeniceModels, VENICE_BASE_URL } from "./venice-models.js";
import { discoverVercelAiGatewayModels, VERCEL_AI_GATEWAY_BASE_URL } from "./vercel-ai-gateway.js";

type ModelsConfig = NonNullable<OpenClawConfig["models"]>;
export type ProviderConfig = NonNullable<ModelsConfig["providers"]>[string];

const MINIMAX_PORTAL_BASE_URL = "https://api.minimax.io/anthropic";
const MINIMAX_DEFAULT_MODEL_ID = "MiniMax-M2.1";
const MINIMAX_DEFAULT_VISION_MODEL_ID = "MiniMax-VL-01";
const MINIMAX_DEFAULT_CONTEXT_WINDOW = 200000;
const MINIMAX_DEFAULT_MAX_TOKENS = 8192;
const MINIMAX_OAUTH_PLACEHOLDER = "minimax-oauth";
// Pricing per 1M tokens (USD) — https://platform.minimaxi.com/document/Price
const MINIMAX_API_COST = {
  input: 0.3,
  output: 1.2,
  cacheRead: 0.03,
  cacheWrite: 0.12,
};

type ProviderModelConfig = NonNullable<ProviderConfig["models"]>[number];

function buildMinimaxModel(params: {
  id: string;
  name: string;
  reasoning: boolean;
  input: ProviderModelConfig["input"];
}): ProviderModelConfig {
  return {
    id: params.id,
    name: params.name,
    reasoning: params.reasoning,
    input: params.input,
    cost: MINIMAX_API_COST,
    contextWindow: MINIMAX_DEFAULT_CONTEXT_WINDOW,
    maxTokens: MINIMAX_DEFAULT_MAX_TOKENS,
  };
}

function buildMinimaxTextModel(params: {
  id: string;
  name: string;
  reasoning: boolean;
}): ProviderModelConfig {
  return buildMinimaxModel({ ...params, input: ["text"] });
}

const XIAOMI_BASE_URL = "https://api.xiaomimimo.com/anthropic";
export const XIAOMI_DEFAULT_MODEL_ID = "mimo-v2-flash";
const XIAOMI_DEFAULT_CONTEXT_WINDOW = 262144;
const XIAOMI_DEFAULT_MAX_TOKENS = 8192;
const XIAOMI_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";
const MOONSHOT_DEFAULT_MODEL_ID = "kimi-k2.5";
const MOONSHOT_DEFAULT_CONTEXT_WINDOW = 256000;
const MOONSHOT_DEFAULT_MAX_TOKENS = 8192;
const MOONSHOT_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const KIMI_CODING_BASE_URL = "https://api.kimi.com/coding/";
const KIMI_CODING_DEFAULT_MODEL_ID = "k2p5";
const KIMI_CODING_DEFAULT_CONTEXT_WINDOW = 262144;
const KIMI_CODING_DEFAULT_MAX_TOKENS = 32768;
const KIMI_CODING_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const QWEN_PORTAL_BASE_URL = "https://portal.qwen.ai/v1";
const QWEN_PORTAL_OAUTH_PLACEHOLDER = "qwen-oauth";
const QWEN_PORTAL_DEFAULT_CONTEXT_WINDOW = 128000;
const QWEN_PORTAL_DEFAULT_MAX_TOKENS = 8192;
const QWEN_PORTAL_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const OLLAMA_BASE_URL = OLLAMA_NATIVE_BASE_URL;
const OLLAMA_API_BASE_URL = OLLAMA_BASE_URL;
const OLLAMA_SHOW_CONCURRENCY = 8;
const OLLAMA_SHOW_MAX_MODELS = 200;
const OLLAMA_DEFAULT_CONTEXT_WINDOW = 128000;
const OLLAMA_DEFAULT_MAX_TOKENS = 8192;
const OLLAMA_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL_ID = "auto";
const OPENROUTER_DEFAULT_CONTEXT_WINDOW = 200000;
const OPENROUTER_DEFAULT_MAX_TOKENS = 8192;
const OPENROUTER_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const VLLM_BASE_URL = "http://127.0.0.1:8000/v1";
const VLLM_DEFAULT_CONTEXT_WINDOW = 128000;
const VLLM_DEFAULT_MAX_TOKENS = 8192;
const VLLM_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const QIANFAN_BASE_URL = "https://qianfan.baidubce.com/v2";
export const QIANFAN_DEFAULT_MODEL_ID = "deepseek-v3.2";
const QIANFAN_DEFAULT_CONTEXT_WINDOW = 98304;
const QIANFAN_DEFAULT_MAX_TOKENS = 32768;
const QIANFAN_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_DEFAULT_MODEL_ID = "nvidia/llama-3.1-nemotron-70b-instruct";
const NVIDIA_DEFAULT_CONTEXT_WINDOW = 131072;
const NVIDIA_DEFAULT_MAX_TOKENS = 4096;
const NVIDIA_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const log = createSubsystemLogger("agents/model-providers");

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    family?: string;
    parameter_size?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

type VllmModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

/**
 * Derive the Ollama native API base URL from a configured base URL.
 *
 * Users typically configure `baseUrl` with a `/v1` suffix (e.g.
 * `http://192.168.20.14:11434/v1`) for the OpenAI-compatible endpoint.
 * The native Ollama API lives at the root (e.g. `/api/tags`), so we
 * strip the `/v1` suffix when present.
 */
export function resolveOllamaApiBase(configuredBaseUrl?: string): string {
  if (!configuredBaseUrl) {
    return OLLAMA_API_BASE_URL;
  }
  // Strip trailing slash, then strip /v1 suffix if present
  const trimmed = configuredBaseUrl.replace(/\/+$/, "");
  return trimmed.replace(/\/v1$/i, "");
}

async function queryOllamaContextWindow(
  apiBase: string,
  modelName: string,
): Promise<number | undefined> {
  try {
    const response = await fetch(`${apiBase}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as { model_info?: Record<string, unknown> };
    if (!data.model_info) {
      return undefined;
    }
    for (const [key, value] of Object.entries(data.model_info)) {
      if (key.endsWith(".context_length") && typeof value === "number" && Number.isFinite(value)) {
        const contextWindow = Math.floor(value);
        if (contextWindow > 0) {
          return contextWindow;
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function discoverOllamaModels(
  baseUrl?: string,
  opts?: { quiet?: boolean },
): Promise<ModelDefinitionConfig[]> {
  // Skip Ollama discovery in test environments
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return [];
  }
  try {
    const apiBase = resolveOllamaApiBase(baseUrl);
    const response = await fetch(`${apiBase}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      if (!opts?.quiet) {
        log.warn(`Failed to discover Ollama models: ${response.status}`);
      }
      return [];
    }
    const data = (await response.json()) as OllamaTagsResponse;
    if (!data.models || data.models.length === 0) {
      log.debug("No Ollama models found on local instance");
      return [];
    }
    const modelsToInspect = data.models.slice(0, OLLAMA_SHOW_MAX_MODELS);
    if (modelsToInspect.length < data.models.length && !opts?.quiet) {
      log.warn(
        `Capping Ollama /api/show inspection to ${OLLAMA_SHOW_MAX_MODELS} models (received ${data.models.length})`,
      );
    }
    const discovered: ModelDefinitionConfig[] = [];
    for (let index = 0; index < modelsToInspect.length; index += OLLAMA_SHOW_CONCURRENCY) {
      const batch = modelsToInspect.slice(index, index + OLLAMA_SHOW_CONCURRENCY);
      const batchDiscovered = await Promise.all(
        batch.map(async (model) => {
          const modelId = model.name;
          const contextWindow = await queryOllamaContextWindow(apiBase, modelId);
          const isReasoning =
            modelId.toLowerCase().includes("r1") || modelId.toLowerCase().includes("reasoning");
          return {
            id: modelId,
            name: modelId,
            reasoning: isReasoning,
            input: ["text"],
            cost: OLLAMA_DEFAULT_COST,
            contextWindow: contextWindow ?? OLLAMA_DEFAULT_CONTEXT_WINDOW,
            maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
          } satisfies ModelDefinitionConfig;
        }),
      );
      discovered.push(...batchDiscovered);
    }
    return discovered;
  } catch (error) {
    if (!opts?.quiet) {
      log.warn(`Failed to discover Ollama models: ${String(error)}`);
    }
    return [];
  }
}

async function discoverVllmModels(
  baseUrl: string,
  apiKey?: string,
): Promise<ModelDefinitionConfig[]> {
  // Skip vLLM discovery in test environments
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return [];
  }

  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const url = `${trimmedBaseUrl}/models`;

  try {
    const trimmedApiKey = apiKey?.trim();
    const response = await fetch(url, {
      headers: trimmedApiKey ? { Authorization: `Bearer ${trimmedApiKey}` } : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      log.warn(`Failed to discover vLLM models: ${response.status}`);
      return [];
    }
    const data = (await response.json()) as VllmModelsResponse;
    const models = data.data ?? [];
    if (models.length === 0) {
      log.warn("No vLLM models found on local instance");
      return [];
    }

    return models
      .map((m) => ({ id: typeof m.id === "string" ? m.id.trim() : "" }))
      .filter((m) => Boolean(m.id))
      .map((m) => {
        const modelId = m.id;
        const lower = modelId.toLowerCase();
        const isReasoning =
          lower.includes("r1") || lower.includes("reasoning") || lower.includes("think");
        return {
          id: modelId,
          name: modelId,
          reasoning: isReasoning,
          input: ["text"],
          cost: VLLM_DEFAULT_COST,
          contextWindow: VLLM_DEFAULT_CONTEXT_WINDOW,
          maxTokens: VLLM_DEFAULT_MAX_TOKENS,
        } satisfies ModelDefinitionConfig;
      });
  } catch (error) {
    log.warn(`Failed to discover vLLM models: ${String(error)}`);
    return [];
  }
}

const ENV_VAR_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

function normalizeApiKeyConfig(value: string): string {
  const trimmed = value.trim();
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function resolveEnvApiKeyVarName(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const resolved = resolveEnvApiKey(provider, env);
  if (!resolved) {
    return undefined;
  }
  const match = /^(?:env: |shell env: )([A-Z0-9_]+)$/.exec(resolved.source);
  return match ? match[1] : undefined;
}

function resolveAwsSdkApiKeyVarName(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAwsSdkEnvVarName(env) ?? "AWS_PROFILE";
}

type ProfileApiKeyResolution = {
  apiKey: string;
  source: "plaintext" | "env-ref" | "non-env-ref";
  /** Optional secret value that may be used for provider discovery only. */
  discoveryApiKey?: string;
};

function toDiscoveryApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function resolveApiKeyFromCredential(
  cred: ReturnType<typeof ensureAuthProfileStore>["profiles"][string] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ProfileApiKeyResolution | undefined {
  if (!cred) {
    return undefined;
  }
  if (cred.type === "api_key") {
    const keyRef = coerceSecretRef(cred.keyRef);
    if (keyRef && keyRef.id.trim()) {
      if (keyRef.source === "env") {
        const envVar = keyRef.id.trim();
        return {
          apiKey: envVar,
          source: "env-ref",
          discoveryApiKey: toDiscoveryApiKey(env[envVar]),
        };
      }
      return {
        apiKey: `__secretref:${keyRef.source}__`,
        source: "non-env-ref",
      };
    }
    if (cred.key?.trim()) {
      return {
        apiKey: cred.key,
        source: "plaintext",
        discoveryApiKey: toDiscoveryApiKey(cred.key),
      };
    }
    return undefined;
  }
  if (cred.type === "token") {
    const tokenRef = coerceSecretRef(cred.tokenRef);
    if (tokenRef && tokenRef.id.trim()) {
      if (tokenRef.source === "env") {
        const envVar = tokenRef.id.trim();
        return {
          apiKey: envVar,
          source: "env-ref",
          discoveryApiKey: toDiscoveryApiKey(env[envVar]),
        };
      }
      return {
        apiKey: `__secretref:${tokenRef.source}__`,
        source: "non-env-ref",
      };
    }
    if (cred.token?.trim()) {
      return {
        apiKey: cred.token,
        source: "plaintext",
        discoveryApiKey: toDiscoveryApiKey(cred.token),
      };
    }
  }
  return undefined;
}

function resolveApiKeyFromProfiles(params: {
  provider: string;
  store: ReturnType<typeof ensureAuthProfileStore>;
  env?: NodeJS.ProcessEnv;
}): ProfileApiKeyResolution | undefined {
  const env = params.env ?? process.env;
  const ids = listProfilesForProvider(params.store, params.provider);
  for (const id of ids) {
    const resolved = resolveApiKeyFromCredential(params.store.profiles[id], env);
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
}

export function normalizeGoogleModelId(id: string): string {
  if (id === "gemini-3-pro") {
    return "gemini-3-pro-preview";
  }
  if (id === "gemini-3-flash") {
    return "gemini-3-flash-preview";
  }
  if (id === "gemini-3.1-pro") {
    return "gemini-3.1-pro-preview";
  }
  if (id === "gemini-3.1-flash-lite") {
    return "gemini-3.1-flash-lite-preview";
  }
  // Preserve compatibility with earlier OpenClaw docs/config that pointed at a
  // non-existent Gemini Flash preview ID. Google's current Flash text model is
  // `gemini-3-flash-preview`.
  if (id === "gemini-3.1-flash" || id === "gemini-3.1-flash-preview") {
    return "gemini-3-flash-preview";
  }
  return id;
}

const ANTIGRAVITY_BARE_PRO_IDS = new Set(["gemini-3-pro", "gemini-3.1-pro", "gemini-3-1-pro"]);

export function normalizeAntigravityModelId(id: string): string {
  if (ANTIGRAVITY_BARE_PRO_IDS.has(id)) {
    return `${id}-low`;
  }
  return id;
}

function normalizeProviderModels(
  provider: ProviderConfig,
  normalizeId: (id: string) => string,
): ProviderConfig {
  let mutated = false;
  const models = provider.models.map((model) => {
    const nextId = normalizeId(model.id);
    if (nextId === model.id) {
      return model;
    }
    mutated = true;
    return { ...model, id: nextId };
  });
  return mutated ? { ...provider, models } : provider;
}

function normalizeGoogleProvider(provider: ProviderConfig): ProviderConfig {
  return normalizeProviderModels(provider, normalizeGoogleModelId);
}

function normalizeAntigravityProvider(provider: ProviderConfig): ProviderConfig {
  return normalizeProviderModels(provider, normalizeAntigravityModelId);
}

export function normalizeProviders(params: {
  providers: ModelsConfig["providers"];
  agentDir: string;
  env?: NodeJS.ProcessEnv;
  secretDefaults?: {
    env?: string;
    file?: string;
    exec?: string;
  };
  secretRefManagedProviders?: Set<string>;
}): ModelsConfig["providers"] {
  const { providers } = params;
  if (!providers) {
    return providers;
  }
  const env = params.env ?? process.env;
  const authStore = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  let mutated = false;
  const next: Record<string, ProviderConfig> = {};

  for (const [key, provider] of Object.entries(providers)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      mutated = true;
      continue;
    }
    if (normalizedKey !== key) {
      mutated = true;
    }
    let normalizedProvider = provider;
    const configuredApiKey = normalizedProvider.apiKey;

    // Fix common misconfig: apiKey set to "${ENV_VAR}" instead of "ENV_VAR".
    if (
      typeof configuredApiKey === "string" &&
      normalizeApiKeyConfig(configuredApiKey) !== configuredApiKey
    ) {
      mutated = true;
      normalizedProvider = {
        ...normalizedProvider,
        apiKey: normalizeApiKeyConfig(configuredApiKey),
      };
    }

    const profileApiKey = resolveApiKeyFromProfiles({
      provider: normalizedKey,
      store: authStore,
      env,
    });

    // Reverse-lookup: if apiKey looks like a resolved secret value (not an env
    // var name), check whether it matches the canonical env var for this provider.
    const currentApiKey = normalizedProvider.apiKey;
    if (
      typeof currentApiKey === "string" &&
      currentApiKey.trim() &&
      !ENV_VAR_NAME_RE.test(currentApiKey.trim())
    ) {
      const envVarName = resolveEnvApiKeyVarName(normalizedKey, env);
      if (envVarName && env[envVarName] === currentApiKey) {
        mutated = true;
        normalizedProvider = { ...normalizedProvider, apiKey: envVarName };
      }
    }

    // If a provider defines models, pi's ModelRegistry requires apiKey to be set.
    // Fill it from the environment or auth profiles when possible.
    const hasModels =
      Array.isArray(normalizedProvider.models) && normalizedProvider.models.length > 0;
    const normalizedApiKey = normalizeOptionalSecretInput(normalizedProvider.apiKey);
    const hasConfiguredApiKey = Boolean(normalizedApiKey || normalizedProvider.apiKey);
    if (hasModels && !hasConfiguredApiKey) {
      const authMode =
        normalizedProvider.auth ?? (normalizedKey === "amazon-bedrock" ? "aws-sdk" : undefined);
      if (authMode === "aws-sdk") {
        const apiKey = resolveAwsSdkApiKeyVarName(env);
        mutated = true;
        normalizedProvider = { ...normalizedProvider, apiKey };
      } else {
        const fromEnv = resolveEnvApiKeyVarName(normalizedKey, env);
        const apiKey = fromEnv ?? profileApiKey?.apiKey;
        if (apiKey?.trim()) {
          mutated = true;
          normalizedProvider = { ...normalizedProvider, apiKey };
        }
      }
    }

    if (normalizedKey === "google") {
      const googleNormalized = normalizeGoogleProvider(normalizedProvider);
      if (googleNormalized !== normalizedProvider) {
        mutated = true;
      }
      normalizedProvider = googleNormalized;
    }

    if (normalizedKey === "google-antigravity") {
      const antigravityNormalized = normalizeAntigravityProvider(normalizedProvider);
      if (antigravityNormalized !== normalizedProvider) {
        mutated = true;
      }
      normalizedProvider = antigravityNormalized;
    }

    const existing = next[normalizedKey];
    if (existing) {
      mutated = true;
      next[normalizedKey] = {
        ...existing,
        ...normalizedProvider,
        models: normalizedProvider.models ?? existing.models,
      };
      continue;
    }
    next[normalizedKey] = normalizedProvider;
  }

  return mutated ? next : providers;
}

function buildMinimaxProvider(): ProviderConfig {
  return {
    baseUrl: MINIMAX_PORTAL_BASE_URL,
    api: "anthropic-messages",
    authHeader: true,
    models: [
      buildMinimaxTextModel({
        id: MINIMAX_DEFAULT_MODEL_ID,
        name: "MiniMax M2.1",
        reasoning: false,
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.1-lightning",
        name: "MiniMax M2.1 Lightning",
        reasoning: false,
      }),
      buildMinimaxModel({
        id: MINIMAX_DEFAULT_VISION_MODEL_ID,
        name: "MiniMax VL 01",
        reasoning: false,
        input: ["text", "image"],
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5",
        reasoning: true,
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.5-Lightning",
        name: "MiniMax M2.5 Lightning",
        reasoning: true,
      }),
    ],
  };
}

function buildMinimaxPortalProvider(): ProviderConfig {
  return {
    baseUrl: MINIMAX_PORTAL_BASE_URL,
    api: "anthropic-messages",
    authHeader: true,
    models: [
      buildMinimaxTextModel({
        id: MINIMAX_DEFAULT_MODEL_ID,
        name: "MiniMax M2.1",
        reasoning: false,
      }),
      buildMinimaxTextModel({
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5",
        reasoning: true,
      }),
    ],
  };
}

function buildMoonshotProvider(): ProviderConfig {
  return {
    baseUrl: MOONSHOT_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: MOONSHOT_DEFAULT_MODEL_ID,
        name: "Kimi K2.5",
        reasoning: false,
        input: ["text", "image"],
        cost: MOONSHOT_DEFAULT_COST,
        contextWindow: MOONSHOT_DEFAULT_CONTEXT_WINDOW,
        maxTokens: MOONSHOT_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

export function buildKimiCodingProvider(): ProviderConfig {
  return {
    baseUrl: KIMI_CODING_BASE_URL,
    api: "anthropic-messages",
    models: [
      {
        id: KIMI_CODING_DEFAULT_MODEL_ID,
        name: "Kimi for Coding",
        reasoning: true,
        input: ["text", "image"],
        cost: KIMI_CODING_DEFAULT_COST,
        contextWindow: KIMI_CODING_DEFAULT_CONTEXT_WINDOW,
        maxTokens: KIMI_CODING_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

function buildQwenPortalProvider(): ProviderConfig {
  return {
    baseUrl: QWEN_PORTAL_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: "coder-model",
        name: "Qwen Coder",
        reasoning: false,
        input: ["text"],
        cost: QWEN_PORTAL_DEFAULT_COST,
        contextWindow: QWEN_PORTAL_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_PORTAL_DEFAULT_MAX_TOKENS,
      },
      {
        id: "vision-model",
        name: "Qwen Vision",
        reasoning: false,
        input: ["text", "image"],
        cost: QWEN_PORTAL_DEFAULT_COST,
        contextWindow: QWEN_PORTAL_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QWEN_PORTAL_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

function buildSyntheticProvider(): ProviderConfig {
  return {
    baseUrl: SYNTHETIC_BASE_URL,
    api: "anthropic-messages",
    models: SYNTHETIC_MODEL_CATALOG.map(buildSyntheticModelDefinition),
  };
}

function buildDoubaoProvider(): ProviderConfig {
  return {
    baseUrl: DOUBAO_BASE_URL,
    api: "openai-completions",
    models: DOUBAO_MODEL_CATALOG.map(buildDoubaoModelDefinition),
  };
}

function buildDoubaoCodingProvider(): ProviderConfig {
  return {
    baseUrl: DOUBAO_CODING_BASE_URL,
    api: "openai-completions",
    models: DOUBAO_CODING_MODEL_CATALOG.map(buildDoubaoModelDefinition),
  };
}

function buildBytePlusProvider(): ProviderConfig {
  return {
    baseUrl: BYTEPLUS_BASE_URL,
    api: "openai-completions",
    models: BYTEPLUS_MODEL_CATALOG.map(buildBytePlusModelDefinition),
  };
}

function buildBytePlusCodingProvider(): ProviderConfig {
  return {
    baseUrl: BYTEPLUS_CODING_BASE_URL,
    api: "openai-completions",
    models: BYTEPLUS_CODING_MODEL_CATALOG.map(buildBytePlusModelDefinition),
  };
}

export function buildXiaomiProvider(): ProviderConfig {
  return {
    baseUrl: XIAOMI_BASE_URL,
    api: "anthropic-messages",
    models: [
      {
        id: XIAOMI_DEFAULT_MODEL_ID,
        name: "Xiaomi MiMo V2 Flash",
        reasoning: false,
        input: ["text"],
        cost: XIAOMI_DEFAULT_COST,
        contextWindow: XIAOMI_DEFAULT_CONTEXT_WINDOW,
        maxTokens: XIAOMI_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

async function buildVeniceProvider(): Promise<ProviderConfig> {
  const models = await discoverVeniceModels();
  return {
    baseUrl: VENICE_BASE_URL,
    api: "openai-completions",
    models,
  };
}

async function buildVercelAiGatewayProvider(): Promise<ProviderConfig> {
  return {
    baseUrl: VERCEL_AI_GATEWAY_BASE_URL,
    api: "anthropic-messages",
    models: await discoverVercelAiGatewayModels(),
  };
}

async function buildOllamaProvider(
  configuredBaseUrl?: string,
  opts?: { quiet?: boolean },
): Promise<ProviderConfig> {
  const models = await discoverOllamaModels(configuredBaseUrl, opts);
  return {
    baseUrl: resolveOllamaApiBase(configuredBaseUrl),
    api: "ollama",
    models,
  };
}

async function buildHuggingfaceProvider(apiKey?: string): Promise<ProviderConfig> {
  // Resolve env var name to value for discovery (GET /v1/models requires Bearer token).
  const resolvedSecret =
    apiKey?.trim() !== ""
      ? /^[A-Z][A-Z0-9_]*$/.test(apiKey!.trim())
        ? (process.env[apiKey!.trim()] ?? "").trim()
        : apiKey!.trim()
      : "";
  const models =
    resolvedSecret !== ""
      ? await discoverHuggingfaceModels(resolvedSecret)
      : HUGGINGFACE_MODEL_CATALOG.map(buildHuggingfaceModelDefinition);
  return {
    baseUrl: HUGGINGFACE_BASE_URL,
    api: "openai-completions",
    models,
  };
}

function buildTogetherProvider(): ProviderConfig {
  return {
    baseUrl: TOGETHER_BASE_URL,
    api: "openai-completions",
    models: TOGETHER_MODEL_CATALOG.map(buildTogetherModelDefinition),
  };
}

function buildOpenrouterProvider(): ProviderConfig {
  return {
    baseUrl: OPENROUTER_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: OPENROUTER_DEFAULT_MODEL_ID,
        name: "OpenRouter Auto",
        // reasoning: false here is a catalog default only; it does NOT cause
        // `reasoning.effort: "none"` to be sent for the "auto" routing model.
        // applyExtraParamsToAgent skips the reasoning effort injection for
        // model id "auto" because it dynamically routes to any OpenRouter model
        // (including ones where reasoning is mandatory and cannot be disabled).
        // See: openclaw/openclaw#24851
        reasoning: false,
        input: ["text", "image"],
        cost: OPENROUTER_DEFAULT_COST,
        contextWindow: OPENROUTER_DEFAULT_CONTEXT_WINDOW,
        maxTokens: OPENROUTER_DEFAULT_MAX_TOKENS,
      },
    ],
  };
}

async function buildVllmProvider(params?: {
  baseUrl?: string;
  apiKey?: string;
}): Promise<ProviderConfig> {
  const baseUrl = (params?.baseUrl?.trim() || VLLM_BASE_URL).replace(/\/+$/, "");
  const models = await discoverVllmModels(baseUrl, params?.apiKey);
  return {
    baseUrl,
    api: "openai-completions",
    models,
  };
}

export function buildQianfanProvider(): ProviderConfig {
  return {
    baseUrl: QIANFAN_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: QIANFAN_DEFAULT_MODEL_ID,
        name: "DEEPSEEK V3.2",
        reasoning: true,
        input: ["text"],
        cost: QIANFAN_DEFAULT_COST,
        contextWindow: QIANFAN_DEFAULT_CONTEXT_WINDOW,
        maxTokens: QIANFAN_DEFAULT_MAX_TOKENS,
      },
      {
        id: "ernie-5.0-thinking-preview",
        name: "ERNIE-5.0-Thinking-Preview",
        reasoning: true,
        input: ["text", "image"],
        cost: QIANFAN_DEFAULT_COST,
        contextWindow: 119000,
        maxTokens: 64000,
      },
    ],
  };
}

export function buildNvidiaProvider(): ProviderConfig {
  return {
    baseUrl: NVIDIA_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: NVIDIA_DEFAULT_MODEL_ID,
        name: "NVIDIA Llama 3.1 Nemotron 70B Instruct",
        reasoning: false,
        input: ["text"],
        cost: NVIDIA_DEFAULT_COST,
        contextWindow: NVIDIA_DEFAULT_CONTEXT_WINDOW,
        maxTokens: NVIDIA_DEFAULT_MAX_TOKENS,
      },
      {
        id: "meta/llama-3.3-70b-instruct",
        name: "Meta Llama 3.3 70B Instruct",
        reasoning: false,
        input: ["text"],
        cost: NVIDIA_DEFAULT_COST,
        contextWindow: 131072,
        maxTokens: 4096,
      },
      {
        id: "nvidia/mistral-nemo-minitron-8b-8k-instruct",
        name: "NVIDIA Mistral NeMo Minitron 8B Instruct",
        reasoning: false,
        input: ["text"],
        cost: NVIDIA_DEFAULT_COST,
        contextWindow: 8192,
        maxTokens: 2048,
      },
    ],
  };
}

export async function buildKilocodeProvider(): Promise<ProviderConfig> {
  const models = await discoverKilocodeModels();
  return {
    baseUrl: KILOCODE_BASE_URL,
    api: "openai-completions",
    models,
  };
}

async function buildKilocodeProviderWithDiscovery(): Promise<ProviderConfig> {
  return buildKilocodeProvider();
}

type ImplicitProviderParams = {
  agentDir: string;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  explicitProviders?: Record<string, ProviderConfig> | null;
};

export async function resolveImplicitProviders(
  params: ImplicitProviderParams,
): Promise<ModelsConfig["providers"]> {
  const providers: Record<string, ProviderConfig> = {};
  const env = params.env ?? process.env;
  const authStore = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });

  const resolveProviderApiKey = (
    provider: string,
  ): { apiKey: string | undefined; discoveryApiKey?: string } => {
    const envVar = resolveEnvApiKeyVarName(provider, env);
    if (envVar) {
      return {
        apiKey: envVar,
        discoveryApiKey: toDiscoveryApiKey(env[envVar]),
      };
    }
    const fromProfiles = resolveApiKeyFromProfiles({ provider, store: authStore, env });
    return {
      apiKey: fromProfiles?.apiKey,
      discoveryApiKey: fromProfiles?.discoveryApiKey,
    };
  };

  // ── Minimax ──────────────────────────────────────────────────────────
  const { apiKey: minimaxKey } = resolveProviderApiKey("minimax");
  if (minimaxKey) {
    providers.minimax = { ...buildMinimaxProvider(), apiKey: minimaxKey };
  }

  const minimaxEnvKey = resolveEnvApiKeyVarName("minimax-portal", env);
  const minimaxOauthProfile = listProfilesForProvider(authStore, "minimax-portal");
  if (minimaxEnvKey || minimaxOauthProfile.length > 0) {
    providers["minimax-portal"] = {
      ...buildMinimaxPortalProvider(),
      apiKey: MINIMAX_OAUTH_PLACEHOLDER,
    };
  }

  // ── Moonshot / Kimi ──────────────────────────────────────────────────
  const { apiKey: moonshotKey } = resolveProviderApiKey("moonshot");
  if (moonshotKey) {
    providers.moonshot = { ...buildMoonshotProvider(), apiKey: moonshotKey };
  }

  const { apiKey: kimiCodingKey } = resolveProviderApiKey("kimi-coding");
  if (kimiCodingKey) {
    providers["kimi-coding"] = { ...buildKimiCodingProvider(), apiKey: kimiCodingKey };
  }

  // ── Synthetic ─────────────────────────────────────────────────────────
  const { apiKey: syntheticKey } = resolveProviderApiKey("synthetic");
  if (syntheticKey) {
    providers.synthetic = { ...buildSyntheticProvider(), apiKey: syntheticKey };
  }

  // ── Venice ────────────────────────────────────────────────────────────
  const { apiKey: veniceKey } = resolveProviderApiKey("venice");
  if (veniceKey) {
    providers.venice = { ...(await buildVeniceProvider()), apiKey: veniceKey };
  }

  // ── Vercel AI Gateway ─────────────────────────────────────────────────
  const { apiKey: vercelKey } = resolveProviderApiKey("vercel-ai-gateway");
  if (vercelKey) {
    providers["vercel-ai-gateway"] = {
      ...(await buildVercelAiGatewayProvider()),
      apiKey: vercelKey,
    };
  }

  // ── Qwen Portal ───────────────────────────────────────────────────────
  const qwenProfiles = listProfilesForProvider(authStore, "qwen-portal");
  if (qwenProfiles.length > 0) {
    providers["qwen-portal"] = {
      ...buildQwenPortalProvider(),
      apiKey: QWEN_PORTAL_OAUTH_PLACEHOLDER,
    };
  }

  // ── Volcengine (Doubao) + BytePlus (paired) ───────────────────────────
  const { apiKey: volcengineKey } = resolveProviderApiKey("volcengine");
  if (volcengineKey) {
    providers.volcengine = { ...buildDoubaoProvider(), apiKey: volcengineKey };
    providers["volcengine-plan"] = { ...buildDoubaoCodingProvider(), apiKey: volcengineKey };
  }

  const { apiKey: byteplusKey } = resolveProviderApiKey("byteplus");
  if (byteplusKey) {
    providers.byteplus = { ...buildBytePlusProvider(), apiKey: byteplusKey };
    providers["byteplus-plan"] = { ...buildBytePlusCodingProvider(), apiKey: byteplusKey };
  }

  // ── Xiaomi ────────────────────────────────────────────────────────────
  const { apiKey: xiaomiKey } = resolveProviderApiKey("xiaomi");
  if (xiaomiKey) {
    providers.xiaomi = { ...buildXiaomiProvider(), apiKey: xiaomiKey };
  }

  // ── Cloudflare AI Gateway ─────────────────────────────────────────────
  const cloudflareProfiles = listProfilesForProvider(authStore, "cloudflare-ai-gateway");
  for (const profileId of cloudflareProfiles) {
    const cred = authStore.profiles[profileId];
    if (cred?.type !== "api_key") {
      continue;
    }
    const accountId = cred.metadata?.accountId?.trim();
    const gatewayId = cred.metadata?.gatewayId?.trim();
    if (!accountId || !gatewayId) {
      continue;
    }
    const baseUrl = resolveCloudflareAiGatewayBaseUrl({ accountId, gatewayId });
    if (!baseUrl) {
      continue;
    }
    const envVarKey = resolveEnvApiKeyVarName("cloudflare-ai-gateway", env);
    const profileCredKey = resolveApiKeyFromCredential(cred, env)?.apiKey;
    const cfApiKey = envVarKey ?? profileCredKey ?? "";
    if (!cfApiKey) {
      continue;
    }
    providers["cloudflare-ai-gateway"] = {
      baseUrl,
      api: "anthropic-messages",
      apiKey: cfApiKey,
      models: [buildCloudflareAiGatewayModelDefinition()],
    };
    break;
  }

  // ── Ollama ────────────────────────────────────────────────────────────
  const { apiKey: ollamaKey } = resolveProviderApiKey("ollama");
  const explicitOllama = params.explicitProviders?.ollama;
  const hasExplicitOllamaModels =
    Array.isArray(explicitOllama?.models) && explicitOllama.models.length > 0;
  if (hasExplicitOllamaModels && explicitOllama) {
    providers.ollama = {
      ...explicitOllama,
      baseUrl: resolveOllamaApiBase(explicitOllama.baseUrl),
      api: explicitOllama.api ?? "ollama",
      apiKey: ollamaKey ?? explicitOllama.apiKey ?? "ollama-local",
    };
  } else {
    const ollamaBaseUrl = explicitOllama?.baseUrl;
    const hasExplicitOllamaConfig = Boolean(explicitOllama);
    const ollamaProvider = await buildOllamaProvider(ollamaBaseUrl, {
      quiet: !ollamaKey && !hasExplicitOllamaConfig,
    });
    if (ollamaProvider.models.length > 0 || ollamaKey || explicitOllama?.apiKey) {
      providers.ollama = {
        ...ollamaProvider,
        apiKey: ollamaKey ?? explicitOllama?.apiKey ?? "ollama-local",
      };
    }
  }

  // ── vLLM ──────────────────────────────────────────────────────────────
  if (!params.explicitProviders?.vllm) {
    const { apiKey: vllmKey, discoveryApiKey: vllmDiscoveryKey } = resolveProviderApiKey("vllm");
    if (vllmKey) {
      providers.vllm = {
        ...(await buildVllmProvider({ apiKey: vllmDiscoveryKey })),
        apiKey: vllmKey,
      };
    }
  }

  // ── Together ──────────────────────────────────────────────────────────
  const { apiKey: togetherKey } = resolveProviderApiKey("together");
  if (togetherKey) {
    providers.together = { ...buildTogetherProvider(), apiKey: togetherKey };
  }

  // ── Huggingface ───────────────────────────────────────────────────────
  const { apiKey: huggingfaceKey, discoveryApiKey: hfDiscoveryKey } =
    resolveProviderApiKey("huggingface");
  if (huggingfaceKey) {
    providers.huggingface = {
      ...(await buildHuggingfaceProvider(hfDiscoveryKey)),
      apiKey: huggingfaceKey,
    };
  }

  // ── Qianfan ───────────────────────────────────────────────────────────
  const { apiKey: qianfanKey } = resolveProviderApiKey("qianfan");
  if (qianfanKey) {
    providers.qianfan = { ...buildQianfanProvider(), apiKey: qianfanKey };
  }

  // ── OpenRouter ────────────────────────────────────────────────────────
  const { apiKey: openrouterKey } = resolveProviderApiKey("openrouter");
  if (openrouterKey) {
    providers.openrouter = { ...buildOpenrouterProvider(), apiKey: openrouterKey };
  }

  // ── NVIDIA ────────────────────────────────────────────────────────────
  const { apiKey: nvidiaKey } = resolveProviderApiKey("nvidia");
  if (nvidiaKey) {
    providers.nvidia = { ...buildNvidiaProvider(), apiKey: nvidiaKey };
  }

  // ── Kilocode ──────────────────────────────────────────────────────────
  const { apiKey: kilocodeKey } = resolveProviderApiKey("kilocode");
  if (kilocodeKey) {
    providers.kilocode = {
      ...(await buildKilocodeProviderWithDiscovery()),
      apiKey: kilocodeKey,
    };
  }

  // ── GitHub Copilot ────────────────────────────────────────────────────
  if (!providers["github-copilot"]) {
    const implicitCopilot = await resolveImplicitCopilotProvider({
      agentDir: params.agentDir,
      env,
    });
    if (implicitCopilot) {
      providers["github-copilot"] = implicitCopilot;
    }
  }

  // ── Amazon Bedrock ────────────────────────────────────────────────────
  const implicitBedrock = await resolveImplicitBedrockProvider({
    agentDir: params.agentDir,
    config: params.config,
    env,
  });
  if (implicitBedrock) {
    const existing = providers["amazon-bedrock"];
    providers["amazon-bedrock"] = existing
      ? {
          ...implicitBedrock,
          ...existing,
          models:
            Array.isArray(existing.models) && existing.models.length > 0
              ? existing.models
              : implicitBedrock.models,
        }
      : implicitBedrock;
  }

  return providers;
}

export async function resolveImplicitCopilotProvider(params: {
  agentDir: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ProviderConfig | null> {
  const env = params.env ?? process.env;
  const authStore = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const hasProfile = listProfilesForProvider(authStore, "github-copilot").length > 0;
  const envToken = env.COPILOT_GITHUB_TOKEN ?? env.GH_TOKEN ?? env.GITHUB_TOKEN;
  const githubToken = (envToken ?? "").trim();

  if (!hasProfile && !githubToken) {
    return null;
  }

  let selectedGithubToken = githubToken;
  if (!selectedGithubToken && hasProfile) {
    // Use the first available profile as a default for discovery (it will be
    // re-resolved per-run by the embedded runner).
    const profileId = listProfilesForProvider(authStore, "github-copilot")[0];
    const profile = profileId ? authStore.profiles[profileId] : undefined;
    if (profile && profile.type === "token") {
      selectedGithubToken = profile.token?.trim() ?? "";
      if (!selectedGithubToken) {
        const tokenRef = coerceSecretRef(profile.tokenRef);
        if (tokenRef?.source === "env" && tokenRef.id.trim()) {
          selectedGithubToken = (env[tokenRef.id] ?? process.env[tokenRef.id] ?? "").trim();
        }
      }
    }
  }

  let baseUrl = DEFAULT_COPILOT_API_BASE_URL;
  if (selectedGithubToken) {
    try {
      const token = await resolveCopilotApiToken({
        githubToken: selectedGithubToken,
        env,
      });
      baseUrl = token.baseUrl;
    } catch {
      baseUrl = DEFAULT_COPILOT_API_BASE_URL;
    }
  }

  // We deliberately do not write pi-coding-agent auth.json here.
  // OpenClaw keeps auth in auth-profiles and resolves runtime availability from that store.

  // We intentionally do NOT define custom models for Copilot in models.json.
  // pi-coding-agent treats providers with models as replacements requiring apiKey.
  // We only override baseUrl; the model list comes from pi-ai built-ins.
  return {
    baseUrl,
    models: [],
  } satisfies ProviderConfig;
}

export async function resolveImplicitBedrockProvider(params: {
  agentDir: string;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<ProviderConfig | null> {
  const env = params.env ?? process.env;
  const discoveryConfig = params.config?.models?.bedrockDiscovery;
  const enabled = discoveryConfig?.enabled;
  const hasAwsCreds = resolveAwsSdkEnvVarName(env) !== undefined;
  if (enabled === false) {
    return null;
  }
  if (enabled !== true && !hasAwsCreds) {
    return null;
  }

  const region = discoveryConfig?.region ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1";
  const models = await discoverBedrockModels({
    region,
    config: discoveryConfig,
  });
  if (models.length === 0) {
    return null;
  }

  return {
    baseUrl: `https://bedrock-runtime.${region}.amazonaws.com`,
    api: "bedrock-converse-stream",
    auth: "aws-sdk",
    models,
  } satisfies ProviderConfig;
}
