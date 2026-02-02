import type { OpenClawConfig } from "../config/config.js";
import { buildXiaomiProvider, XIAOMI_DEFAULT_MODEL_ID } from "../agents/models-config.providers.js";
import {
  buildSyntheticModelDefinition,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_DEFAULT_MODEL_REF,
  SYNTHETIC_MODEL_CATALOG,
} from "../agents/synthetic-models.js";
import {
  buildVeniceModelDefinition,
  VENICE_BASE_URL,
  VENICE_DEFAULT_MODEL_REF,
  VENICE_MODEL_CATALOG,
} from "../agents/venice-models.js";
import {
  OPENROUTER_DEFAULT_MODEL_REF,
  VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
  XIAOMI_DEFAULT_MODEL_REF,
  ZAI_DEFAULT_MODEL_REF,
  DEEPSEEK_DEFAULT_MODEL_REF,
  BAIDU_QIANFAN_DEFAULT_MODEL_REF,
  DOUBAO_DEFAULT_MODEL_REF,
  TENCENT_HUNYUAN_DEFAULT_MODEL_REF,
  XINGHUO_DEFAULT_MODEL_REF,
  SILICONFLOW_DEFAULT_MODEL_REF,
  GROQ_DEFAULT_MODEL_REF,
  TOGETHER_AI_DEFAULT_MODEL_REF,
} from "./onboard-auth.credentials.js";
import {
  buildMoonshotModelDefinition,
  KIMI_CODING_MODEL_REF,
  MOONSHOT_BASE_URL,
  MOONSHOT_DEFAULT_MODEL_ID,
  MOONSHOT_DEFAULT_MODEL_REF,
} from "./onboard-auth.models.js";

export function applyZaiConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[ZAI_DEFAULT_MODEL_REF] = {
    ...models[ZAI_DEFAULT_MODEL_REF],
    alias: models[ZAI_DEFAULT_MODEL_REF]?.alias ?? "GLM",
  };

  const existingModel = cfg.agents?.defaults?.model;
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: ZAI_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

export function applyOpenrouterProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[OPENROUTER_DEFAULT_MODEL_REF] = {
    ...models[OPENROUTER_DEFAULT_MODEL_REF],
    alias: models[OPENROUTER_DEFAULT_MODEL_REF]?.alias ?? "OpenRouter",
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
  };
}

export function applyVercelAiGatewayProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF] = {
    ...models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF],
    alias: models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF]?.alias ?? "Vercel AI Gateway",
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
  };
}

export function applyVercelAiGatewayConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyVercelAiGatewayProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

export function applyOpenrouterConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyOpenrouterProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: OPENROUTER_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

export function applyMoonshotProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[MOONSHOT_DEFAULT_MODEL_REF] = {
    ...models[MOONSHOT_DEFAULT_MODEL_REF],
    alias: models[MOONSHOT_DEFAULT_MODEL_REF]?.alias ?? "Kimi K2",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.moonshot;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const defaultModel = buildMoonshotModelDefinition();
  const hasDefaultModel = existingModels.some((model) => model.id === MOONSHOT_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, defaultModel];
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  providers.moonshot = {
    ...existingProviderRest,
    baseUrl: MOONSHOT_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: mergedModels.length > 0 ? mergedModels : [defaultModel],
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyMoonshotConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyMoonshotProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: MOONSHOT_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

export function applyKimiCodeProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[KIMI_CODING_MODEL_REF] = {
    ...models[KIMI_CODING_MODEL_REF],
    alias: models[KIMI_CODING_MODEL_REF]?.alias ?? "Kimi K2.5",
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
  };
}

export function applyKimiCodeConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyKimiCodeProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: KIMI_CODING_MODEL_REF,
        },
      },
    },
  };
}

export function applySyntheticProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[SYNTHETIC_DEFAULT_MODEL_REF] = {
    ...models[SYNTHETIC_DEFAULT_MODEL_REF],
    alias: models[SYNTHETIC_DEFAULT_MODEL_REF]?.alias ?? "MiniMax M2.1",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.synthetic;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const syntheticModels = SYNTHETIC_MODEL_CATALOG.map(buildSyntheticModelDefinition);
  const mergedModels = [
    ...existingModels,
    ...syntheticModels.filter(
      (model) => !existingModels.some((existing) => existing.id === model.id),
    ),
  ];
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  providers.synthetic = {
    ...existingProviderRest,
    baseUrl: SYNTHETIC_BASE_URL,
    api: "anthropic-messages",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: mergedModels.length > 0 ? mergedModels : syntheticModels,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applySyntheticConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applySyntheticProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: SYNTHETIC_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

export function applyXiaomiProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[XIAOMI_DEFAULT_MODEL_REF] = {
    ...models[XIAOMI_DEFAULT_MODEL_REF],
    alias: models[XIAOMI_DEFAULT_MODEL_REF]?.alias ?? "Xiaomi",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.xiaomi;
  const defaultProvider = buildXiaomiProvider();
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const defaultModels = defaultProvider.models ?? [];
  const hasDefaultModel = existingModels.some((model) => model.id === XIAOMI_DEFAULT_MODEL_ID);
  const mergedModels =
    existingModels.length > 0
      ? hasDefaultModel
        ? existingModels
        : [...existingModels, ...defaultModels]
      : defaultModels;
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  providers.xiaomi = {
    ...existingProviderRest,
    baseUrl: defaultProvider.baseUrl,
    api: defaultProvider.api,
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: mergedModels.length > 0 ? mergedModels : defaultProvider.models,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyXiaomiConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyXiaomiProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: XIAOMI_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

/**
 * Apply Venice provider configuration without changing the default model.
 * Registers Venice models and sets up the provider, but preserves existing model selection.
 */
export function applyVeniceProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[VENICE_DEFAULT_MODEL_REF] = {
    ...models[VENICE_DEFAULT_MODEL_REF],
    alias: models[VENICE_DEFAULT_MODEL_REF]?.alias ?? "Llama 3.3 70B",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.venice;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const veniceModels = VENICE_MODEL_CATALOG.map(buildVeniceModelDefinition);
  const mergedModels = [
    ...existingModels,
    ...veniceModels.filter((model) => !existingModels.some((existing) => existing.id === model.id)),
  ];
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  providers.venice = {
    ...existingProviderRest,
    baseUrl: VENICE_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: mergedModels.length > 0 ? mergedModels : veniceModels,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

/**
 * Apply Venice provider configuration AND set Venice as the default model.
 * Use this when Venice is the primary provider choice during onboarding.
 */
export function applyVeniceConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyVeniceProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: VENICE_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

export function applyAuthProfileConfig(
  cfg: OpenClawConfig,
  params: {
    profileId: string;
    provider: string;
    mode: "api_key" | "oauth" | "token";
    email?: string;
    preferProfileFirst?: boolean;
  },
): OpenClawConfig {
  const profiles = {
    ...cfg.auth?.profiles,
    [params.profileId]: {
      provider: params.provider,
      mode: params.mode,
      ...(params.email ? { email: params.email } : {}),
    },
  };

  // Only maintain `auth.order` when the user explicitly configured it.
  // Default behavior: no explicit order -> resolveAuthProfileOrder can round-robin by lastUsed.
  const existingProviderOrder = cfg.auth?.order?.[params.provider];
  const preferProfileFirst = params.preferProfileFirst ?? true;
  const reorderedProviderOrder =
    existingProviderOrder && preferProfileFirst
      ? [
          params.profileId,
          ...existingProviderOrder.filter((profileId) => profileId !== params.profileId),
        ]
      : existingProviderOrder;
  const order =
    existingProviderOrder !== undefined
      ? {
          ...cfg.auth?.order,
          [params.provider]: reorderedProviderOrder?.includes(params.profileId)
            ? reorderedProviderOrder
            : [...(reorderedProviderOrder ?? []), params.profileId],
        }
      : cfg.auth?.order;
  return {
    ...cfg,
    auth: {
      ...cfg.auth,
      profiles,
      ...(order ? { order } : {}),
    },
  };
}

// ============================================================================
// DeepSeek 配置（深度求索）
// ============================================================================

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_DEFAULT_MODEL_ID = "deepseek-chat";

export function applyDeepseekProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[DEEPSEEK_DEFAULT_MODEL_REF] = {
    ...models[DEEPSEEK_DEFAULT_MODEL_REF],
    alias: models[DEEPSEEK_DEFAULT_MODEL_REF]?.alias ?? "DeepSeek",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.deepseek;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // DeepSeek 模型定义
  const deepseekModels = [
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.28 },
      contextWindow: 64000,
      maxTokens: 8192,
    },
    {
      id: "deepseek-coder",
      name: "DeepSeek Coder",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.28 },
      contextWindow: 64000,
      maxTokens: 8192,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === DEEPSEEK_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...deepseekModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers.deepseek = {
    ...existingProviderRest,
    baseUrl: DEEPSEEK_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : deepseekModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyDeepseekConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyDeepseekProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: DEEPSEEK_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

// ============================================================================
// 百度文心一言配置（ERNIE/千帆大模型平台）
// ============================================================================

const BAIDU_QIANFAN_BASE_URL = "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat";
const BAIDU_DEFAULT_MODEL_ID = "ernie-4.0-turbo-8k";

export function applyBaiduQianfanProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[BAIDU_QIANFAN_DEFAULT_MODEL_REF] = {
    ...models[BAIDU_QIANFAN_DEFAULT_MODEL_REF],
    alias: models[BAIDU_QIANFAN_DEFAULT_MODEL_REF]?.alias ?? "文心",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.baidu;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // 百度文心模型定义
  const baiduModels = [
    {
      id: "ernie-4.0-turbo-8k",
      name: "ERNIE 4.0 Turbo 8K",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.03, output: 0.09, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 2048,
    },
    {
      id: "ernie-3.5-8k",
      name: "ERNIE 3.5 8K",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.012, output: 0.012, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 2048,
    },
    {
      id: "ernie-speed-128k",
      name: "ERNIE Speed 128K",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === BAIDU_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...baiduModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers.baidu = {
    ...existingProviderRest,
    baseUrl: BAIDU_QIANFAN_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : baiduModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyBaiduQianfanConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyBaiduQianfanProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: BAIDU_QIANFAN_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

// ============================================================================
// 字节豆包配置（Doubao/火山引擎）
// ============================================================================

const DOUBAO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DOUBAO_DEFAULT_MODEL_ID = "doubao-pro-32k";

export function applyDoubaoProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[DOUBAO_DEFAULT_MODEL_REF] = {
    ...models[DOUBAO_DEFAULT_MODEL_REF],
    alias: models[DOUBAO_DEFAULT_MODEL_REF]?.alias ?? "豆包",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.doubao;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // 字节豆包模型定义
  const doubaoModels = [
    {
      id: "doubao-pro-32k",
      name: "Doubao Pro 32K",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.8, output: 2.0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 4096,
    },
    {
      id: "doubao-lite-32k",
      name: "Doubao Lite 32K",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.3, output: 0.6, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 4096,
    },
    {
      id: "doubao-pro-128k",
      name: "Doubao Pro 128K",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 5.0, output: 9.0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 4096,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === DOUBAO_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...doubaoModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers.doubao = {
    ...existingProviderRest,
    baseUrl: DOUBAO_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : doubaoModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyDoubaoConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyDoubaoProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: DOUBAO_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

// ============================================================================
// 腾讯混元配置（Tencent Hunyuan）
// ============================================================================

const TENCENT_HUNYUAN_BASE_URL = "https://api.hunyuan.cloud.tencent.com/v1";
const TENCENT_DEFAULT_MODEL_ID = "hunyuan-turbo";

export function applyTencentHunyuanProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[TENCENT_HUNYUAN_DEFAULT_MODEL_REF] = {
    ...models[TENCENT_HUNYUAN_DEFAULT_MODEL_REF],
    alias: models[TENCENT_HUNYUAN_DEFAULT_MODEL_REF]?.alias ?? "混元",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.tencent;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // 腾讯混元模型定义
  const hunyuanModels = [
    {
      id: "hunyuan-turbo",
      name: "Hunyuan Turbo",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.015, output: 0.05, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 4096,
    },
    {
      id: "hunyuan-lite",
      name: "Hunyuan Lite",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 4096,
    },
    {
      id: "hunyuan-pro",
      name: "Hunyuan Pro",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0.03, output: 0.1, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 4096,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === TENCENT_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...hunyuanModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers.tencent = {
    ...existingProviderRest,
    baseUrl: TENCENT_HUNYUAN_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : hunyuanModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyTencentHunyuanConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyTencentHunyuanProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: TENCENT_HUNYUAN_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

// ============================================================================
// 讯飞星火配置（iFlytek Spark）
// ============================================================================

const XINGHUO_BASE_URL = "https://spark-api-open.xf-yun.com/v1";
const XINGHUO_DEFAULT_MODEL_ID = "spark-pro";

export function applyXinghuoProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[XINGHUO_DEFAULT_MODEL_REF] = {
    ...models[XINGHUO_DEFAULT_MODEL_REF],
    alias: models[XINGHUO_DEFAULT_MODEL_REF]?.alias ?? "星火",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.xinghuo;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // 讯飞星火模型定义
  const xinghuoModels = [
    {
      id: "spark-pro",
      name: "Spark Pro",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 2.1, output: 2.1, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 4096,
    },
    {
      id: "spark-lite",
      name: "Spark Lite",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 4096,
    },
    {
      id: "spark-max",
      name: "Spark Max",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 5.6, output: 5.6, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 4096,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === XINGHUO_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...xinghuoModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers.xinghuo = {
    ...existingProviderRest,
    baseUrl: XINGHUO_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : xinghuoModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyXinghuoConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyXinghuoProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: XINGHUO_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

// ============================================================================
// 硅基流动配置（SiliconFlow - 注册送2000万Tokens）
// ============================================================================

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const SILICONFLOW_DEFAULT_MODEL_ID = "qwen-2.5-7b-instruct";

export function applySiliconflowProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[SILICONFLOW_DEFAULT_MODEL_REF] = {
    ...models[SILICONFLOW_DEFAULT_MODEL_REF],
    alias: models[SILICONFLOW_DEFAULT_MODEL_REF]?.alias ?? "硅基流动",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.siliconflow;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // 硅基流动免费模型定义
  const siliconflowModels = [
    {
      id: "qwen-2.5-7b-instruct",
      name: "Qwen 2.5 7B (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 8192,
    },
    {
      id: "deepseek-v3",
      name: "DeepSeek V3 (Free)",
      reasoning: true,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 64000,
      maxTokens: 8192,
    },
    {
      id: "glm-4-9b-chat",
      name: "GLM-4 9B (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    },
    {
      id: "internlm-2.5-7b-chat",
      name: "InternLM 2.5 7B (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 4096,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === SILICONFLOW_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...siliconflowModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers.siliconflow = {
    ...existingProviderRest,
    baseUrl: SILICONFLOW_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : siliconflowModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applySiliconflowConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applySiliconflowProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: SILICONFLOW_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

// ============================================================================
// Groq 配置（超快推理速度，免费）
// ============================================================================

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_DEFAULT_MODEL_ID = "llama-3.3-70b-versatile";

export function applyGroqProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[GROQ_DEFAULT_MODEL_REF] = {
    ...models[GROQ_DEFAULT_MODEL_REF],
    alias: models[GROQ_DEFAULT_MODEL_REF]?.alias ?? "Groq",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.groq;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // Groq 免费模型定义
  const groqModels = [
    {
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 32768,
    },
    {
      id: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B Instant (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 8192,
    },
    {
      id: "deepseek-r1-distill-llama-70b",
      name: "DeepSeek R1 Distill 70B (Free)",
      reasoning: true,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 8192,
    },
    {
      id: "mixtral-8x7b-32768",
      name: "Mixtral 8x7B (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 32768,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === GROQ_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...groqModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers.groq = {
    ...existingProviderRest,
    baseUrl: GROQ_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : groqModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyGroqConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyGroqProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: GROQ_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}

// ============================================================================
// Together AI 配置（免费模型访问）
// ============================================================================

const TOGETHER_AI_BASE_URL = "https://api.together.xyz/v1";
const TOGETHER_AI_DEFAULT_MODEL_ID = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";

export function applyTogetherAiProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[TOGETHER_AI_DEFAULT_MODEL_REF] = {
    ...models[TOGETHER_AI_DEFAULT_MODEL_REF],
    alias: models[TOGETHER_AI_DEFAULT_MODEL_REF]?.alias ?? "Together AI",
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers["together-ai"];
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  
  // Together AI 免费模型定义
  const togetherAiModels = [
    {
      id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      name: "Llama 3.1 8B Instruct Turbo (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 8192,
    },
    {
      id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      name: "Llama 3.1 70B Instruct Turbo (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 8192,
    },
    {
      id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      name: "Mixtral 8x7B Instruct (Free)",
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 8192,
    },
  ];
  
  const hasDefaultModel = existingModels.some((model) => model.id === TOGETHER_AI_DEFAULT_MODEL_ID);
  const mergedModels = hasDefaultModel ? existingModels : [...existingModels, ...togetherAiModels];
  
  const { apiKey: existingApiKey, ...existingProviderRest } = (existingProvider ?? {}) as Record<
    string,
    unknown
  > as { apiKey?: string };
  const resolvedApiKey = typeof existingApiKey === "string" ? existingApiKey : undefined;
  const normalizedApiKey = resolvedApiKey?.trim();
  
  providers["together-ai"] = {
    ...existingProviderRest,
    baseUrl: TOGETHER_AI_BASE_URL,
    api: "openai-completions",
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: (mergedModels.length > 0 ? mergedModels : togetherAiModels) as any,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyTogetherAiConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyTogetherAiProviderConfig(cfg);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: TOGETHER_AI_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}
