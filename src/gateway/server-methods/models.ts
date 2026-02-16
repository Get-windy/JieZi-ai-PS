import { promises as fs } from "node:fs";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { resetModelCatalogCacheForTest } from "../../agents/model-catalog.js";
import { loadConfig } from "../../config/config.js";
import { STATE_DIR } from "../../config/paths.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";

// 模型管理配置文件路径
const MODEL_MANAGEMENT_FILE = path.join(STATE_DIR, "model-management.json");

// ============ 供应商默认模型列表 ============

/**
 * 为各供应商预定义的已知模型列表
 * 用于在供应商不支持 /models 端点时提供默认模型列表
 */
const PROVIDER_KNOWN_MODELS: Record<string, string[]> = {
  // OpenAI
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    "o1",
    "o1-mini",
    "o1-preview",
  ],

  // Anthropic
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ],

  // Google Gemini
  google: [
    "gemini-2.0-flash-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.0-pro",
  ],

  // DeepSeek
  deepseek: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],

  // 智谱 AI
  zhipu: [
    "glm-5",
    "glm-5-plus",
    "glm-5-air",
    "glm-4-plus",
    "glm-4-0520",
    "glm-4-air",
    "glm-4-airx",
    "glm-4-long",
    "glm-4-flash",
    "glm-4-flashx",
    "glm-4v",
    "glm-4v-plus",
    "glm-3-turbo",
  ],

  // 通义千问（阿里云）
  "qwen-portal": [
    "coder-model",
    "vision-model",
    "qwen-plus",
    "qwen-turbo",
    "qwen-max",
    "qwen-long",
  ],

  // 阿里通义（DashScope）
  alibaba: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long", "qwen-coder-plus"],

  // Moonshot（月之暗面）
  moonshot: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],

  // MiniMax（海螺AI）
  minimax: ["abab6.5s-chat", "abab6.5-chat", "abab5.5-chat"],

  // 百度文心
  baidu: ["ernie-4.0-8k", "ernie-3.5-8k", "ernie-speed-8k", "ernie-lite-8k"],

  // Mistral
  mistral: [
    "mistral-large-latest",
    "mistral-medium-latest",
    "mistral-small-latest",
    "open-mistral-7b",
  ],

  // Groq
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],

  // xAI
  xai: ["grok-beta", "grok-vision-beta"],
};

// ============ 新的数据结构 ============

// 供应商API模板（预置的API对接类型）
type ProviderApiTemplate = {
  id: string; // 模板ID（如 'openai-compatible', 'anthropic-compatible'）
  name: string; // 模板名称（如 'OpenAI兼容', 'Anthropic兼容'）
  description?: string; // 模板描述
  defaultBaseUrl: string; // 默认Base URL
  apiKeyPlaceholder?: string; // API Key输入提示
  authType?: "bearer" | "api-key" | "custom"; // 认证类型
  fields?: {
    // 额外字段配置
    name: string;
    label: string;
    type: "text" | "password" | "url";
    required?: boolean;
    placeholder?: string;
  }[];
};

// 用户的供应商实例（用户添加的供应商）（导出供其他模块使用）
export type ProviderInstance = {
  id: string; // 供应商实例ID（唯一标识，用户自定义）
  name: string; // 供应商名称（用户自定义）
  icon?: string; // 图标emoji
  website?: string; // 官网地址
  templateId?: string; // 基于的模板ID（可选，如果是完全自定义则为空）
  defaultBaseUrl: string; // Base URL
  apiKeyPlaceholder?: string; // API Key输入提示
  custom: boolean; // 是否完全自定义（非基于模板）
  createdAt: number; // 创建时间

  // 已知模型列表（可选，用于没有标准端点的供应商）
  knownModels?: string[];
};

// 供应商认证配置（导出供其他模块使用）
export type ProviderAuth = {
  authId: string; // 认证ID（自动生成）
  name: string; // 认证昵称（必填，用户自定义）
  provider: string; // 供应商ID
  apiKey: string; // API Key（必填）
  baseUrl?: string; // Base URL（可选）
  enabled: boolean; // 是否启用
  isDefault: boolean; // 是否为默认认证
  createdAt: number; // 创建时间

  // 认证状态检测
  status?: {
    valid: boolean; // 是否有效
    lastChecked: number; // 最后检测时间
    error?: string; // 错误信息
  };

  // 成本控制
  budgetControl?: {
    dailyLimit?: number; // 每日预算上限（美元）
    monthlyLimit?: number; // 每月预算上限（美元）
    alertThreshold?: number; // 预警阈值（百分比，如 80 表示 80%）
  };
};

// 模型配置（每个认证下的每个模型都可以单独配置）
type ModelConfig = {
  configId: string; // 配置ID（自动生成）
  authId: string; // 关联的认证ID（必填）
  provider: string; // 供应商ID
  modelName: string; // 模型名称（如 'gpt-4'）
  nickname?: string; // 模型昵称（可选，用户自定义）
  enabled: boolean; // 是否启用（默认false）
  deprecated: boolean; // 是否已被供应商停用（默认false）

  // 内容控制参数
  temperature?: number; // 随机性 (0-2)
  topP?: number; // 核采样 (0-1)
  maxTokens?: number; // 单次回复长度
  frequencyPenalty?: number; // 频率惩罚 (-2 to 2)

  // 资源与功能
  systemPrompt?: string; // System Prompt
  conversationRounds?: number; // 对话轮数保留
  maxIterations?: number; // 最大思考步骤

  // 使用限制
  usageLimits?: {
    maxRequestsPerDay?: number; // 每日最大请求数
    maxTokensPerRequest?: number; // 单次最大 tokens
  };
};

// 辅助函数：掩码 API Key（用于安全显示）
function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= 16) {
    return trimmed; // 短密钥直接返回
  }
  // 格式：前8位 + **** + 后4位
  return `${trimmed.slice(0, 8)}****${trimmed.slice(-4)}`;
}

// 存储结构（导出供其他模块使用）
export type ModelManagementStorage = {
  // API模板库（预置的，不存储，由代码提供）
  // apiTemplates 不需要存储

  // 用户的供应商实例列表
  providers: ProviderInstance[];

  // 认证：按供应商实例ID分组
  auths: Record<string, ProviderAuth[]>;

  // 模型配置：按供应商实例ID分组
  models: Record<string, ModelConfig[]>;

  // 每个供应商的默认认证ID
  defaultAuthId: Record<string, string>;
};

// API模板库（预置，不需要存储到文件）
const API_TEMPLATES: ProviderApiTemplate[] = [
  {
    id: "openai-compatible",
    name: "OpenAI 兼容 API",
    description: "适用于 OpenAI 和所有 OpenAI 兼容的接口（DeepSeek、Moonshot 等）",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-...",
    authType: "bearer",
  },
  {
    id: "anthropic-compatible",
    name: "Anthropic (Claude) API",
    description: "适用于 Anthropic Claude 系列模型",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyPlaceholder: "sk-ant-...",
    authType: "api-key",
  },
  {
    id: "google-gemini",
    name: "Google Gemini API",
    description: "适用于 Google Gemini 系列模型",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1",
    apiKeyPlaceholder: "AIza...",
    authType: "api-key",
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI API",
    description: "适用于 Microsoft Azure OpenAI 服务",
    defaultBaseUrl: "https://<your-resource>.openai.azure.com",
    apiKeyPlaceholder: "<your-api-key>",
    authType: "api-key",
  },
  {
    id: "custom",
    name: "自定义 API",
    description: "完全自定义配置",
    defaultBaseUrl: "https://",
    apiKeyPlaceholder: "...",
    authType: "custom",
  },
];

// 预置的常用供应商（初始化时自动添加，用户可以修改或删除）
const DEFAULT_PROVIDERS: ProviderInstance[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "🤖",
    website: "https://openai.com",
    templateId: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    icon: "🧠",
    website: "https://anthropic.com",
    templateId: "anthropic-compatible",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyPlaceholder: "sk-ant-...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "google",
    name: "Google (Gemini)",
    icon: "🔮",
    website: "https://ai.google.dev",
    templateId: "google-gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1",
    apiKeyPlaceholder: "AIza...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    icon: "🌪️",
    website: "https://mistral.ai",
    templateId: "openai-compatible",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    apiKeyPlaceholder: "...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "🔍",
    website: "https://www.deepseek.com",
    templateId: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    apiKeyPlaceholder: "sk-...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "moonshot",
    name: "月之暗面 (Moonshot)",
    icon: "🌙",
    website: "https://www.moonshot.cn",
    templateId: "openai-compatible",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    apiKeyPlaceholder: "sk-...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "baidu",
    name: "百度文心",
    icon: "🎨",
    website: "https://cloud.baidu.com/product/wenxinworkshop",
    templateId: "custom",
    defaultBaseUrl: "https://aip.baidubce.com/rpc/2.0/ai_custom/v1",
    apiKeyPlaceholder: "...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "alibaba",
    name: "阿里通义",
    icon: "☁️",
    website: "https://www.aliyun.com/product/dashscope",
    templateId: "openai-compatible",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    apiKeyPlaceholder: "sk-...",
    custom: false,
    createdAt: 0,
  },
  {
    id: "zhipu",
    name: "智谱 AI (GLM)",
    icon: "🧠",
    website: "https://open.bigmodel.cn",
    templateId: "openai-compatible",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyPlaceholder: "...",
    custom: false,
    createdAt: 0,
    // 智谱不支持 /models 端点，预配置已知模型列表
    knownModels: [
      "glm-5",
      "glm-5-plus",
      "glm-5-air",
      "glm-4-plus",
      "glm-4-0520",
      "glm-4-air",
      "glm-4-airx",
      "glm-4-long",
      "glm-4-flash",
      "glm-4-flashx",
      "glm-4v",
      "glm-4v-plus",
      "glm-3-turbo",
    ],
  },
];

// ============ 存储管理函数 ============

// 加载模型管理配置（导出供其他模块使用）
export async function loadModelManagement(): Promise<ModelManagementStorage> {
  try {
    const content = await fs.readFile(MODEL_MANAGEMENT_FILE, "utf-8");
    const storage = JSON.parse(content) as ModelManagementStorage;

    // 确保 providers 字段存在
    if (!storage.providers) {
      storage.providers = [];
    }

    // 如果是空的，添加预置的常用供应商
    if (storage.providers.length === 0) {
      storage.providers = [...DEFAULT_PROVIDERS];
      await saveModelManagement(storage);
      console.log("[Models] Initialized with default providers");
      return storage;
    }

    // ✅ 修复老数据：为现有供应商补充缺失的字段
    let needsSave = false;
    for (const provider of storage.providers) {
      // 查找对应的默认供应商配置
      const defaultProvider = DEFAULT_PROVIDERS.find((p) => p.id === provider.id);

      if (defaultProvider) {
        // 补充缺失的 templateId
        if (!provider.templateId && defaultProvider.templateId) {
          provider.templateId = defaultProvider.templateId;
          needsSave = true;
        }
        // 补充缺失的 defaultBaseUrl
        if (!provider.defaultBaseUrl && defaultProvider.defaultBaseUrl) {
          provider.defaultBaseUrl = defaultProvider.defaultBaseUrl;
          needsSave = true;
        }
        // 补充缺失的 apiKeyPlaceholder
        if (!provider.apiKeyPlaceholder && defaultProvider.apiKeyPlaceholder) {
          provider.apiKeyPlaceholder = defaultProvider.apiKeyPlaceholder;
          needsSave = true;
        }
        // 补充缺失的 icon
        if (!provider.icon && defaultProvider.icon) {
          provider.icon = defaultProvider.icon;
          needsSave = true;
        }
        // 补充缺失的 website
        if (!provider.website && defaultProvider.website) {
          provider.website = defaultProvider.website;
          needsSave = true;
        }
      }

      // ✅ 新增：自动补充缺失的 knownModels 配置
      if (!provider.knownModels || provider.knownModels.length === 0) {
        const defaultModels = PROVIDER_KNOWN_MODELS[provider.id];
        if (defaultModels && defaultModels.length > 0) {
          provider.knownModels = [...defaultModels];
          needsSave = true;
          console.log(
            `[Models] Auto-added knownModels for provider: ${provider.id} (${defaultModels.length} models)`,
          );
        }
      }
    }

    // 如果有修复，保存数据
    if (needsSave) {
      await saveModelManagement(storage);
      console.log("[Models] Fixed legacy provider data with missing fields");
    }

    return storage;
  } catch (err) {
    // 文件不存在时，尝试从旧配置迁移
    return await migrateFromLegacyConfig();
  }
}

// 保存模型管理配置
async function saveModelManagement(storage: ModelManagementStorage): Promise<void> {
  await fs.mkdir(path.dirname(MODEL_MANAGEMENT_FILE), { recursive: true });
  await fs.writeFile(MODEL_MANAGEMENT_FILE, JSON.stringify(storage, null, 2), "utf-8");
}

// 生成唯一ID（使用时间戳 + 随机数）
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

// 从旧配置迁移（openclaw.json）
async function migrateFromLegacyConfig(): Promise<ModelManagementStorage> {
  const storage: ModelManagementStorage = {
    providers: [...DEFAULT_PROVIDERS], // 初始化为预置供应商
    auths: {},
    models: {},
    defaultAuthId: {},
  };

  // 尝试从 openclaw.json 迁移
  const cfg = loadConfig();
  const providers = cfg.models?.providers as Record<string, unknown> | undefined;

  if (providers) {
    for (const [providerId, providerConfig] of Object.entries(providers)) {
      if (!providerConfig || typeof providerConfig !== "object") {
        continue;
      }

      const config = providerConfig as {
        baseUrl?: string;
        apiKey?: string;
        models?: Array<{
          id: string;
          name?: string;
          temperature?: number;
          maxTokens?: number;
        }> | null;
      };

      // 为该供应商创建一个认证
      if (config.apiKey) {
        const authId = generateId("auth");
        const auth: ProviderAuth = {
          authId,
          name: `${providerId} 主账号`, // 默认认证名称
          provider: providerId,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          enabled: true,
          isDefault: true,
          createdAt: Date.now(),
        };

        storage.auths[providerId] = [auth];
        storage.defaultAuthId[providerId] = authId;

        // 为每个模型创建配置
        const models = config.models || [];
        if (models.length > 0) {
          storage.models[providerId] = models.map((model) => {
            const modelConfig: ModelConfig = {
              configId: generateId("model"),
              authId,
              provider: providerId,
              modelName: model.id,
              nickname: model.name,
              enabled: true,
              deprecated: false,
              temperature: model.temperature,
              maxTokens: model.maxTokens,
            };
            return modelConfig;
          });
        }
      }
    }
  }

  // 保存迁移后的数据
  if (Object.keys(storage.auths).length > 0) {
    await saveModelManagement(storage);
    console.log("[Models] Migrated configuration from openclaw.json");
  }

  return storage;
}

// ============ 认证连接测试函数 ============

// 测试超时时间（10秒）
const TEST_TIMEOUT_MS = 10000;

// OpenAI 兼容 API 测试
async function testOpenAIConnection(params: {
  baseUrl: string;
  apiKey: string;
  modelName?: string; // 可选：仅在需要测试具体模型时使用
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    // 优先测试 /models 端点（不需要模型名称，更通用）
    const modelsEndpoint = params.baseUrl.endsWith("/")
      ? `${params.baseUrl}models`
      : `${params.baseUrl}/models`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

    const modelsResponse = await fetch(modelsEndpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (modelsResponse.ok) {
      return { ok: true, status: modelsResponse.status };
    }

    // 如果 /models 不可用且提供了模型名称，尝试 chat 请求
    if (params.modelName) {
      const endpoint = params.baseUrl.endsWith("/")
        ? `${params.baseUrl}chat/completions`
        : `${params.baseUrl}/chat/completions`;

      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), TEST_TIMEOUT_MS);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: params.modelName,
          messages: [{ role: "user", content: "测试连接" }],
          max_tokens: 5,
        }),
        signal: controller2.signal,
      });

      clearTimeout(timeoutId2);

      if (response.ok) {
        return { ok: true, status: response.status };
      }

      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch {
        if (errorText.length < 200) {
          errorMessage = errorText;
        }
      }

      return { ok: false, status: response.status, error: errorMessage };
    }

    // 没有模型名称且 /models 失败，返回错误
    const errorText = await modelsResponse.text();
    let errorMessage = `HTTP ${modelsResponse.status}`;

    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorData.message || errorMessage;
    } catch {
      if (errorText.length < 200) {
        errorMessage = errorText;
      }
    }

    return { ok: false, status: modelsResponse.status, error: errorMessage };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, error: "请求超时（10秒）" };
    }
    return { ok: false, error: String(err) };
  }
}

// Anthropic API 测试
async function testAnthropicConnection(params: {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const endpoint = params.baseUrl.endsWith("/")
      ? `${params.baseUrl}messages`
      : `${params.baseUrl}/messages`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: params.modelName,
        max_tokens: 10,
        messages: [{ role: "user", content: "测试连接" }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;

    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorData.message || errorMessage;
    } catch {
      if (errorText.length < 200) {
        errorMessage = errorText;
      }
    }

    return { ok: false, status: response.status, error: errorMessage };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, error: "请求超时（10秒）" };
    }
    return { ok: false, error: String(err) };
  }
}

// Google Gemini API 测试
async function testGoogleGeminiConnection(params: {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const endpoint = params.baseUrl.endsWith("/")
      ? `${params.baseUrl}models/${params.modelName}:generateContent?key=${params.apiKey}`
      : `${params.baseUrl}/models/${params.modelName}:generateContent?key=${params.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: "测试连接" }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 10,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;

    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorData.message || errorMessage;
    } catch {
      if (errorText.length < 200) {
        errorMessage = errorText;
      }
    }

    return { ok: false, status: response.status, error: errorMessage };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, error: "请求超时（10秒）" };
    }
    return { ok: false, error: String(err) };
  }
}

// ============ 认证管理函数 ============

// 添加认证
async function addAuth(params: {
  provider: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<ProviderAuth> {
  const storage = await loadModelManagement();
  const authId = generateId("auth");

  const auth: ProviderAuth = {
    authId,
    name: params.name,
    provider: params.provider,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    enabled: true,
    isDefault: (storage.auths[params.provider] || []).length === 0, // 第一个自动为默认
    createdAt: Date.now(),
  };

  if (!storage.auths[params.provider]) {
    storage.auths[params.provider] = [];
  }
  storage.auths[params.provider].push(auth);

  // 如果是第一个认证，设置为默认
  if (auth.isDefault) {
    storage.defaultAuthId[params.provider] = authId;
  }

  await saveModelManagement(storage);
  return auth;
}

// 更新认证
async function updateAuth(params: {
  authId: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
}): Promise<void> {
  const storage = await loadModelManagement();

  for (const provider in storage.auths) {
    const auth = storage.auths[provider]?.find((a) => a.authId === params.authId);
    if (auth) {
      if (params.name !== undefined) {
        auth.name = params.name;
      }
      if (params.apiKey !== undefined) {
        auth.apiKey = params.apiKey;
      }
      if (params.baseUrl !== undefined) {
        auth.baseUrl = params.baseUrl;
      }
      if (params.enabled !== undefined) {
        auth.enabled = params.enabled;
      }

      await saveModelManagement(storage);
      return;
    }
  }
}

// 删除认证
async function deleteAuth(authId: string): Promise<void> {
  const storage = await loadModelManagement();

  for (const provider in storage.auths) {
    const index = storage.auths[provider]?.findIndex((a) => a.authId === authId);
    if (index !== undefined && index >= 0) {
      storage.auths[provider].splice(index, 1);

      // 删除关联的模型配置
      if (storage.models[provider]) {
        storage.models[provider] = storage.models[provider].filter((m) => m.authId !== authId);
      }

      // 如果删除的是默认认证，重新设置默认
      if (storage.defaultAuthId[provider] === authId) {
        const remaining = storage.auths[provider];
        if (remaining && remaining.length > 0) {
          remaining[0].isDefault = true;
          storage.defaultAuthId[provider] = remaining[0].authId;
        } else {
          delete storage.defaultAuthId[provider];
        }
      }

      await saveModelManagement(storage);
      return;
    }
  }
}

// 设置默认认证
async function setDefaultAuth(authId: string): Promise<void> {
  const storage = await loadModelManagement();

  for (const provider in storage.auths) {
    const auths = storage.auths[provider];
    if (auths) {
      for (const auth of auths) {
        auth.isDefault = auth.authId === authId;
        if (auth.isDefault) {
          storage.defaultAuthId[provider] = authId;
        }
      }
    }
  }

  await saveModelManagement(storage);
}

// ============ 模型配置管理函数 ============

// 添加模型配置
async function addModelConfig(params: {
  authId: string;
  provider: string;
  modelName: string;
  nickname?: string;
  config?: Partial<ModelConfig>;
}): Promise<ModelConfig> {
  const storage = await loadModelManagement();
  const configId = generateId("model");

  // 从 config 中排除 deprecated 字段
  const { deprecated: _, ...restConfig } = params.config || {};

  const modelConfig: ModelConfig = {
    configId,
    authId: params.authId,
    provider: params.provider,
    modelName: params.modelName,
    nickname: params.nickname,
    enabled: false, // 默认禁用
    deprecated: false, // 默认不是停用状态
    ...restConfig,
  };

  if (!storage.models[params.provider]) {
    storage.models[params.provider] = [];
  }
  storage.models[params.provider].push(modelConfig);

  await saveModelManagement(storage);
  return modelConfig;
}

// 更新模型配置
async function updateModelConfig(params: {
  configId: string;
  nickname?: string;
  enabled?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  systemPrompt?: string;
  conversationRounds?: number;
  maxIterations?: number;
  usageLimits?: ModelConfig["usageLimits"];
}): Promise<void> {
  const storage = await loadModelManagement();

  for (const provider in storage.models) {
    const model = storage.models[provider]?.find((m) => m.configId === params.configId);
    if (model) {
      // 记录是否修改了 enabled 状态
      const enabledChanged = params.enabled !== undefined && model.enabled !== params.enabled;

      if (params.nickname !== undefined) {
        model.nickname = params.nickname;
      }
      if (params.enabled !== undefined) {
        model.enabled = params.enabled;
      }
      if (params.temperature !== undefined) {
        model.temperature = params.temperature;
      }
      if (params.topP !== undefined) {
        model.topP = params.topP;
      }
      if (params.maxTokens !== undefined) {
        model.maxTokens = params.maxTokens;
      }
      if (params.frequencyPenalty !== undefined) {
        model.frequencyPenalty = params.frequencyPenalty;
      }
      if (params.systemPrompt !== undefined) {
        model.systemPrompt = params.systemPrompt;
      }
      if (params.conversationRounds !== undefined) {
        model.conversationRounds = params.conversationRounds;
      }
      if (params.maxIterations !== undefined) {
        model.maxIterations = params.maxIterations;
      }
      if (params.usageLimits !== undefined) {
        model.usageLimits = params.usageLimits;
      }

      await saveModelManagement(storage);

      // 如果修改了启用/禁用状态，清除模型目录缓存以立即生效
      if (enabledChanged) {
        resetModelCatalogCacheForTest();
        console.log(
          `[Models] Model ${model.provider}/${model.modelName} ${model.enabled ? "enabled" : "disabled"}, cache cleared`,
        );
      }

      return;
    }
  }
}

// 删除模型配置
async function deleteModelConfig(configId: string): Promise<void> {
  const storage = await loadModelManagement();

  for (const provider in storage.models) {
    const index = storage.models[provider]?.findIndex((m) => m.configId === configId);
    if (index !== undefined && index >= 0) {
      storage.models[provider].splice(index, 1);
      await saveModelManagement(storage);
      return;
    }
  }
}

// ============ 模型启用状态检查 ============

/**
 * 检查指定模型是否已启用
 * @param provider 供应商ID（如 'openai', 'anthropic'）
 * @param modelName 模型名称（如 'gpt-4', 'claude-sonnet-4'）
 * @returns 如果模型已启用返回true，如果禁用或未配置返回false
 */
export async function isModelEnabled(provider: string, modelName: string): Promise<boolean> {
  try {
    const storage = await loadModelManagement();
    const models = storage.models[provider];

    if (!models || models.length === 0) {
      // 如果没有配置，默认认为模型是启用的（向后兼容）
      return true;
    }

    // 查找匹配的模型配置
    const modelConfig = models.find((m) => m.modelName.toLowerCase() === modelName.toLowerCase());

    if (!modelConfig) {
      // 如果没有找到配置，默认认为是启用的
      return true;
    }

    // 返回模型的启用状态
    return modelConfig.enabled;
  } catch (err) {
    // 发生错误时，默认允许使用（向后兼容）
    console.error(`[Models] Failed to check model enabled status:`, err);
    return true;
  }
}

/**
 * 检查模型是否可用（已启用且认证有效）
 * @param provider 供应商ID
 * @param modelName 模型名称
 * @returns 返回检查结果 { enabled, reason }
 */
export async function checkModelAvailability(
  provider: string,
  modelName: string,
): Promise<{
  available: boolean;
  reason?: string;
}> {
  try {
    const storage = await loadModelManagement();
    const models = storage.models[provider];

    if (!models || models.length === 0) {
      return { available: true };
    }

    const modelConfig = models.find((m) => m.modelName.toLowerCase() === modelName.toLowerCase());

    if (!modelConfig) {
      return { available: true };
    }

    if (!modelConfig.enabled) {
      return {
        available: false,
        reason: `模型 ${provider}/${modelName} 已被禁用，请在模型管理界面启用后使用`,
      };
    }

    // 检查关联的认证是否启用
    const auths = storage.auths[provider];
    if (auths && auths.length > 0) {
      const auth = auths.find((a) => a.authId === modelConfig.authId);
      if (auth && !auth.enabled) {
        return {
          available: false,
          reason: `模型 ${provider}/${modelName} 关联的认证已被禁用`,
        };
      }
    }

    return { available: true };
  } catch (err) {
    console.error(`[Models] Failed to check model availability:`, err);
    return { available: true };
  }
}

// ============ 查询可用模型 ============

/**
 * 根据 Base URL 识别供应商类型，返回对应的 knownModels
 */
function inferKnownModelsByBaseUrl(baseUrl: string): string[] | null {
  if (!baseUrl) {
    return null;
  }

  const url = baseUrl.toLowerCase();

  // OpenAI
  if (url.includes("api.openai.com")) {
    return PROVIDER_KNOWN_MODELS["openai"];
  }

  // Anthropic
  if (url.includes("api.anthropic.com") || url.includes("anthropic")) {
    return PROVIDER_KNOWN_MODELS["anthropic"];
  }

  // Google Gemini
  if (url.includes("generativelanguage.googleapis.com") || url.includes("gemini")) {
    return PROVIDER_KNOWN_MODELS["google"];
  }

  // DeepSeek
  if (url.includes("deepseek.com") || url.includes("deepseek")) {
    return PROVIDER_KNOWN_MODELS["deepseek"];
  }

  // 智谱 AI
  if (url.includes("bigmodel.cn") || url.includes("zhipu")) {
    return PROVIDER_KNOWN_MODELS["zhipu"];
  }

  // 通义千问（阿里云）
  if (url.includes("portal.qwen.ai") || url.includes("qwen-portal")) {
    return PROVIDER_KNOWN_MODELS["qwen-portal"];
  }

  // 阿里通义（DashScope）
  if (url.includes("dashscope.aliyun.com") || url.includes("aliyun")) {
    return PROVIDER_KNOWN_MODELS["alibaba"];
  }

  // Moonshot
  if (url.includes("moonshot.cn") || url.includes("kimi")) {
    return PROVIDER_KNOWN_MODELS["moonshot"];
  }

  // MiniMax
  if (url.includes("minimax") || url.includes("hailuo")) {
    return PROVIDER_KNOWN_MODELS["minimax"];
  }

  // 百度文心
  if (url.includes("baidu") || url.includes("ernie")) {
    return PROVIDER_KNOWN_MODELS["baidu"];
  }

  // Mistral
  if (url.includes("mistral")) {
    return PROVIDER_KNOWN_MODELS["mistral"];
  }

  // Groq
  if (url.includes("groq")) {
    return PROVIDER_KNOWN_MODELS["groq"];
  }

  // xAI
  if (url.includes("x.ai") || url.includes("grok")) {
    return PROVIDER_KNOWN_MODELS["xai"];
  }

  return null;
}

// 查询认证可用的模型列表
async function fetchAvailableModels(auth: ProviderAuth): Promise<string[]> {
  try {
    const storage = await loadModelManagement();
    const baseUrl = auth.baseUrl || getDefaultBaseUrl(auth.provider);

    // 查找供应商实例，获取其模板ID和已知模型列表
    const providerInstance = storage.providers.find((p) => p.id === auth.provider);

    // 优先使用供应商实例配置的 knownModels
    if (providerInstance?.knownModels && providerInstance.knownModels.length > 0) {
      return providerInstance.knownModels;
    }

    const templateId = providerInstance?.templateId || "openai-compatible";

    // 根据模板ID选择查询策略
    switch (templateId) {
      case "openai-compatible": {
        // OpenAI 兼容格式：尝试使用标准的 /v1/models 端点
        const models = await fetchModelsFromOpenAIEndpoint(baseUrl, auth.apiKey);

        // 如果获取失败，尝试根据 baseUrl 推断供应商类型
        if (models.length === 0) {
          const inferredModels = inferKnownModelsByBaseUrl(baseUrl);
          if (inferredModels) {
            console.log(
              `[Models] Inferred ${inferredModels.length} models from baseUrl: ${baseUrl}`,
            );
            return inferredModels;
          }
        }

        return models;
      }

      case "anthropic-compatible":
        // Anthropic 没有模型列表端点，返回预定义的模型
        return getAnthropicKnownModels();

      case "google-gemini":
        // Google Gemini 没有标准的模型列表端点
        return getGoogleGeminiKnownModels();

      case "custom": {
        // 自定义供应商：尝试 OpenAI 格式，失败则根据 baseUrl 推断
        const models = await fetchModelsFromOpenAIEndpoint(baseUrl, auth.apiKey);

        if (models.length === 0) {
          const inferredModels = inferKnownModelsByBaseUrl(baseUrl);
          if (inferredModels) {
            console.log(
              `[Models] Inferred ${inferredModels.length} models from baseUrl for custom provider: ${baseUrl}`,
            );
            return inferredModels;
          }
        }

        return models;
      }

      default: {
        // 未知模板：尝试 OpenAI 格式
        const models = await fetchModelsFromOpenAIEndpoint(baseUrl, auth.apiKey);

        if (models.length === 0) {
          const inferredModels = inferKnownModelsByBaseUrl(baseUrl);
          if (inferredModels) {
            console.log(
              `[Models] Inferred ${inferredModels.length} models from baseUrl: ${baseUrl}`,
            );
            return inferredModels;
          }
        }

        return models;
      }
    }
  } catch (err) {
    console.error(`[Models] Failed to fetch models for ${auth.provider}:`, err);
    return [];
  }
}

// 从 OpenAI 兼容端点查询模型列表
async function fetchModelsFromOpenAIEndpoint(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id: string }> };
      return (data.data || []).map((m) => m.id);
    }
  } catch (err) {
    console.error(`[Models] Failed to fetch models from ${baseUrl}/models:`, err);
  }
  return [];
}

// Anthropic 的已知模型列表
function getAnthropicKnownModels(): string[] {
  return [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ];
}

// Google Gemini 的已知模型列表
function getGoogleGeminiKnownModels(): string[] {
  return [
    "gemini-2.0-flash-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.0-pro",
  ];
}

// 获取供应商默认 Base URL
function getDefaultBaseUrl(provider: string): string {
  const defaults: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    google: "https://generativelanguage.googleapis.com/v1",
  };
  return defaults[provider] || "https://api.openai.com/v1";
}

// ============ 余额和单价查询 ============

// 获取认证的余额信息
async function fetchAuthBalance(
  auth: ProviderAuth,
): Promise<{ amount: number; currency: string } | null> {
  try {
    switch (auth.provider.toLowerCase()) {
      case "openai":
        return await fetchOpenAIBalance(auth.apiKey, auth.baseUrl);
      // 其他供应商可以继续扩展
      default:
        return null;
    }
  } catch (err) {
    console.error(`[Models] Failed to fetch balance for ${auth.provider}:`, err);
    return null;
  }
}

// 获取 OpenAI 账户余额
async function fetchOpenAIBalance(
  apiKey: string,
  baseUrl?: string,
): Promise<{ amount: number; currency: string } | null> {
  try {
    const url = baseUrl
      ? `${baseUrl}/dashboard/billing/credit_grants`
      : "https://api.openai.com/v1/dashboard/billing/credit_grants";
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (response.ok) {
      const data = (await response.json()) as { total_available?: number };
      return {
        amount: data.total_available || 0,
        currency: "USD",
      };
    }
  } catch (err) {
    // 静默失败
  }
  return null;
}

// 模型单价数据库（主流模型的定价）
const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  // OpenAI
  "gpt-4": { inputPer1k: 0.03, outputPer1k: 0.06 },
  "gpt-4-turbo": { inputPer1k: 0.01, outputPer1k: 0.03 },
  "gpt-4o": { inputPer1k: 0.005, outputPer1k: 0.015 },
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-3.5-turbo": { inputPer1k: 0.0005, outputPer1k: 0.0015 },
  o1: { inputPer1k: 0.015, outputPer1k: 0.06 },
  "o1-mini": { inputPer1k: 0.003, outputPer1k: 0.012 },

  // Anthropic
  "claude-opus-4": { inputPer1k: 0.015, outputPer1k: 0.075 },
  "claude-sonnet-4": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-haiku-4": { inputPer1k: 0.00025, outputPer1k: 0.00125 },

  // Google
  "gemini-2.0-flash-exp": { inputPer1k: 0, outputPer1k: 0 },
  "gemini-1.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.005 },

  // DeepSeek
  "deepseek-chat": { inputPer1k: 0.00014, outputPer1k: 0.00028 },
  "deepseek-reasoner": { inputPer1k: 0.00055, outputPer1k: 0.0022 },
};

// 获取模型单价
function getModelPricing(
  modelName: string,
): { inputPer1k: number; outputPer1k: number; currency: string } | null {
  // 标准化模型名称
  const normalized = modelName.toLowerCase();

  // 精确匹配
  if (MODEL_PRICING[normalized]) {
    return { ...MODEL_PRICING[normalized], currency: "USD" };
  }

  // 模糊匹配
  for (const [key, value] of Object.entries(MODEL_PRICING)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { ...value, currency: "USD" };
    }
  }

  return null;
}

// ============ RPC 接口处理器 ============

export const modelsHandlers: GatewayRequestHandlers = {
  // 获取模型列表和供应商信息
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }

    try {
      const models = await context.loadGatewayModelCatalog();
      const storage = await loadModelManagement();

      // 从模型目录中动态提取供应商列表
      const providerSet = new Set<string>();
      models.forEach((model) => {
        if (model.provider) {
          providerSet.add(model.provider);
        }
      });

      // 供应商排序：国内优先
      const domesticProviders = ["qwen-portal", "deepseek", "minimax", "zhipu", "moonshot"];
      const internationalProviders = ["openai", "anthropic", "google"];

      const providerOrder = [
        ...domesticProviders.filter((p) => providerSet.has(p)),
        ...internationalProviders.filter((p) => providerSet.has(p)),
        ...Array.from(providerSet)
          .filter((p) => !domesticProviders.includes(p) && !internationalProviders.includes(p))
          .toSorted(),
      ];

      // 供应商显示名称
      const providerLabels: Record<string, string> = {
        openai: "OpenAI",
        anthropic: "Anthropic",
        google: "Google",
        deepseek: "DeepSeek（深度求索）",
        "qwen-portal": "通义千问（阿里云）",
        minimax: "MiniMax（海螺AI）",
        zhipu: "智谱AI（GLM）",
        moonshot: "Moonshot（月之暗面）",
      };

      // 为每个模型添加启用状态信息
      const modelsWithStatus = await Promise.all(
        models.map(async (model) => {
          const enabled = await isModelEnabled(model.provider, model.id);
          return {
            ...model,
            enabled, // 添加启用状态字段
          };
        }),
      );

      // ✅ 确保模型目录中的所有供应商都在 providerInstances 中
      const originalProviderCount = storage.providers.length;
      const providerInstancesMap = new Map(storage.providers.map((p) => [p.id, p]));

      for (const providerId of providerSet) {
        if (!providerInstancesMap.has(providerId)) {
          // 查找默认配置
          const defaultProvider = DEFAULT_PROVIDERS.find((p) => p.id === providerId);
          if (defaultProvider) {
            // 添加预置供应商
            const newProvider: ProviderInstance = { ...defaultProvider };
            storage.providers.push(newProvider);
            providerInstancesMap.set(providerId, newProvider);
            console.log(`[Models] Auto-added missing provider from catalog: ${providerId}`);
          } else {
            // 为不在预置列表的供应商（如插件提供的）创建默认实例
            const providerLabel = providerLabels[providerId] || providerId;
            // 尝试从认证配置中获取 baseUrl
            const providerAuths = storage.auths[providerId] || [];
            const firstAuth = providerAuths[0];
            const baseUrl = firstAuth?.baseUrl || "";

            // 智能推断 API 模板类型
            let templateId = "openai-compatible"; // 默认

            // 根据供应商 ID 推断模板
            if (providerId === "minimax-portal") {
              templateId = "anthropic-compatible"; // MiniMax Portal 使用 Anthropic API
            } else if (providerId === "google-antigravity" || providerId === "google-gemini-cli") {
              templateId = "custom"; // Google 使用自定义 API
            } else if (providerId === "qwen-portal") {
              templateId = "openai-compatible"; // Qwen Portal 使用 OpenAI 兼容 API
            }

            const newProvider: ProviderInstance = {
              id: providerId,
              name: providerLabel,
              icon: "🤖", // 默认图标
              website: "",
              templateId,
              defaultBaseUrl: baseUrl, // 从认证配置读取，如果没有则为空
              apiKeyPlaceholder: "...",
              custom: true, // 标记为自定义
              createdAt: Date.now(),
            };
            storage.providers.push(newProvider);
            providerInstancesMap.set(providerId, newProvider);
            console.log(
              `[Models] Auto-added plugin provider: ${providerId} with templateId: ${templateId}, baseUrl: ${baseUrl}`,
            );
          }
        }
      }

      // 如果有新增供应商，保存
      if (storage.providers.length > originalProviderCount) {
        await saveModelManagement(storage);
        console.log(
          `[Models] Saved ${storage.providers.length - originalProviderCount} new provider(s)`,
        );
      }

      respond(
        true,
        {
          models: modelsWithStatus, // 返回带有启用状态的模型列表
          ts: Date.now(),
          providerOrder,
          providerLabels,
          providers: {}, // 旧数据结构，保留向后兼容
          // 新的数据结构
          auths: Object.fromEntries(
            Object.entries(storage.auths).map(([provider, authList]) => [
              provider,
              authList.map((auth) => ({
                ...auth,
                apiKey: maskApiKey(auth.apiKey), // 安全掩码显示
              })),
            ]),
          ),
          modelConfigs: storage.models,
          defaultAuthId: storage.defaultAuthId,
          // API模板库（预置）
          apiTemplates: API_TEMPLATES,
          // 供应商实例列表（用户添加的 + 内置的）
          providerInstances: storage.providers,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ============ 供应商管理 ============

  // 获取API模板列表（预置）
  "models.apiTemplates.list": async ({ params, respond }) => {
    try {
      respond(true, { templates: API_TEMPLATES }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 获取供应商实例列表
  "models.providers.list": async ({ params, respond }) => {
    try {
      const storage = await loadModelManagement();
      respond(true, { providers: storage.providers }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 添加自定义供应商
  "models.providers.add": async ({ params, respond }) => {
    try {
      const {
        id,
        name,
        icon,
        website,
        templateId,
        defaultBaseUrl,
        apiKeyPlaceholder,
        knownModels,
      } = params as {
        id: string;
        name: string;
        icon?: string;
        website?: string;
        templateId?: string; // 基于的模板ID（可选）
        defaultBaseUrl: string;
        apiKeyPlaceholder?: string;
        knownModels?: string[]; // 已知模型列表（可选）
      };

      if (!id || !name || !defaultBaseUrl) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const storage = await loadModelManagement();

      // 检查ID是否已存在
      if (storage.providers.some((p) => p.id === id)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Provider ID already exists"),
        );
        return;
      }

      const provider: ProviderInstance = {
        id,
        name,
        icon,
        website,
        templateId,
        defaultBaseUrl,
        apiKeyPlaceholder,
        custom: !templateId, // 没有templateId则是完全自定义
        createdAt: Date.now(),
        knownModels, // 已知模型列表
      };

      storage.providers.push(provider);
      await saveModelManagement(storage);

      console.log(`[Models] Added custom provider: ${id} (${name})`);
      respond(true, { provider }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 更新供应商
  "models.providers.update": async ({ params, respond }) => {
    try {
      const {
        id,
        name,
        icon,
        website,
        templateId,
        defaultBaseUrl,
        apiKeyPlaceholder,
        knownModels,
      } = params as {
        id: string;
        name?: string;
        icon?: string;
        website?: string;
        templateId?: string;
        defaultBaseUrl?: string;
        apiKeyPlaceholder?: string;
        knownModels?: string[]; // 已知模型列表（可选）
      };

      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing provider ID"));
        return;
      }

      const storage = await loadModelManagement();
      const provider = storage.providers.find((p) => p.id === id);

      if (!provider) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Provider not found"));
        return;
      }

      // 更新字段
      if (name !== undefined) {
        provider.name = name;
      }
      if (icon !== undefined) {
        provider.icon = icon;
      }
      if (website !== undefined) {
        provider.website = website;
      }
      if (templateId !== undefined) {
        provider.templateId = templateId;
      }
      if (defaultBaseUrl !== undefined) {
        provider.defaultBaseUrl = defaultBaseUrl;
      }
      if (apiKeyPlaceholder !== undefined) {
        provider.apiKeyPlaceholder = apiKeyPlaceholder;
      }
      if (knownModels !== undefined) {
        provider.knownModels = knownModels;
      }

      await saveModelManagement(storage);

      // 清除模型目录缓存，使修改立即生效
      resetModelCatalogCacheForTest();

      console.log(`[Models] Updated provider: ${id} (${name})`);
      respond(true, { provider }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 删除供应商
  "models.providers.delete": async ({ params, respond }) => {
    try {
      const { id, cascade } = params as { id: string; cascade?: boolean };

      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing provider ID"));
        return;
      }

      const storage = await loadModelManagement();
      const provider = storage.providers.find((p) => p.id === id);

      if (!provider) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Provider not found"));
        return;
      }

      // 保护机制：不能删除最后一个供应商
      if (storage.providers.length <= 1) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "Cannot delete the last provider. At least one provider must remain.",
          ),
        );
        return;
      }

      // 检查是否有关联的认证
      const authCount = storage.auths[id]?.length || 0;
      const modelCount = storage.models[id]?.length || 0;

      if (authCount > 0 || modelCount > 0) {
        if (!cascade) {
          // 不是级联删除，返回需要级联删除的信息
          respond(
            false,
            {
              requiresCascade: true,
              authCount,
              modelCount,
            },
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `Provider has ${authCount} authentication(s) and ${modelCount} model configuration(s). Set cascade=true to delete all related data.`,
            ),
          );
          return;
        }

        // 级联删除：删除所有关联的认证和模型配置
        console.log(
          `[Models] Cascade deleting provider: ${id} (${authCount} auths, ${modelCount} models)`,
        );

        // 删除该供应商的所有认证
        delete storage.auths[id];

        // 删除该供应商的所有模型配置
        delete storage.models[id];

        // 删除默认认证记录
        delete storage.defaultAuthId[id];
      }

      // 删除供应商
      storage.providers = storage.providers.filter((p) => p.id !== id);
      await saveModelManagement(storage);

      console.log(`[Models] Deleted provider: ${id}`);
      respond(true, { success: true, cascadeDeleted: cascade }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 添加认证
  "models.auth.add": async ({ params, respond }) => {
    try {
      const { provider, name, apiKey, baseUrl } = params as {
        provider: string;
        name: string;
        apiKey: string;
        baseUrl?: string;
      };

      if (!provider || !name || !apiKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const auth = await addAuth({ provider, name, apiKey, baseUrl });
      respond(true, { auth }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 更新认证
  "models.auth.update": async ({ params, respond }) => {
    try {
      const { authId, name, apiKey, baseUrl, enabled } = params as {
        authId: string;
        name?: string;
        apiKey?: string;
        baseUrl?: string;
        enabled?: boolean;
      };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      await updateAuth({ authId, name, apiKey, baseUrl, enabled });
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 删除认证
  "models.auth.delete": async ({ params, respond }) => {
    try {
      const { authId } = params as { authId: string };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      await deleteAuth(authId);
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 设置默认认证
  "models.auth.setDefault": async ({ params, respond }) => {
    try {
      const { authId } = params as { authId: string };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      await setDefaultAuth(authId);
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 查询认证可用的模型
  "models.auth.listModels": async ({ params, respond }) => {
    try {
      const { authId } = params as { authId: string };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      const storage = await loadModelManagement();
      let auth: ProviderAuth | undefined;

      for (const provider in storage.auths) {
        auth = storage.auths[provider]?.find((a) => a.authId === authId);
        if (auth) {
          break;
        }
      }

      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      const models = await fetchAvailableModels(auth);
      respond(true, { models }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 获取认证余额
  "models.auth.getBalance": async ({ params, respond }) => {
    try {
      const { authId } = params as { authId: string };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      const storage = await loadModelManagement();
      let auth: ProviderAuth | undefined;

      for (const provider in storage.auths) {
        auth = storage.auths[provider]?.find((a) => a.authId === authId);
        if (auth) {
          break;
        }
      }

      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      const balance = await fetchAuthBalance(auth);
      respond(true, { balance }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 添加模型配置
  "models.config.add": async ({ params, respond }) => {
    try {
      const { authId, provider, modelName, nickname, config } = params as {
        authId: string;
        provider: string;
        modelName: string;
        nickname?: string;
        config?: Partial<ModelConfig>;
      };

      if (!authId || !provider || !modelName) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const modelConfig = await addModelConfig({ authId, provider, modelName, nickname, config });
      respond(true, { config: modelConfig }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 更新模型配置
  "models.config.update": async ({ params, respond }) => {
    try {
      const configParams = params as {
        configId: string;
        nickname?: string;
        enabled?: boolean;
        temperature?: number;
        topP?: number;
        maxTokens?: number;
        frequencyPenalty?: number;
        systemPrompt?: string;
        conversationRounds?: number;
        maxIterations?: number;
        usageLimits?: ModelConfig["usageLimits"];
      };

      if (!configParams.configId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing configId"));
        return;
      }

      await updateModelConfig(configParams);
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 删除模型配置
  "models.config.delete": async ({ params, respond }) => {
    try {
      const { configId } = params as { configId: string };

      if (!configId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing configId"));
        return;
      }

      await deleteModelConfig(configId);
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 获取模型单价
  "models.config.getPricing": async ({ params, respond }) => {
    try {
      const { modelName } = params as { modelName: string };

      if (!modelName) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing modelName"));
        return;
      }

      const pricing = getModelPricing(modelName);
      respond(true, { pricing }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 检查模型是否可用
  "models.checkAvailability": async ({ params, respond }) => {
    try {
      const { provider, modelName } = params as {
        provider: string;
        modelName: string;
      };

      if (!provider || !modelName) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing provider or modelName"),
        );
        return;
      }

      const result = await checkModelAvailability(provider, modelName);
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 刷新供应商可用模型列表
  "models.auth.refreshModels": async ({ params, respond }) => {
    try {
      const { authId } = params as { authId: string };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      const storage = await loadModelManagement();
      let auth: ProviderAuth | undefined;

      for (const provider in storage.auths) {
        auth = storage.auths[provider]?.find((a) => a.authId === authId);
        if (auth) {
          break;
        }
      }

      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      const availableModels = await fetchAvailableModels(auth);

      // 获取已配置的模型列表
      const configuredModels =
        storage.models[auth.provider]?.filter((m) => m.authId === authId) || [];
      const configuredModelNames = new Set(configuredModels.map((m) => m.modelName.toLowerCase()));

      // 创建供应商可用模型的Set
      const availableModelNames = new Set(availableModels.map((m) => m.toLowerCase()));

      // 更新已配置模型的deprecated状态
      let hasChanges = false;
      for (const model of configuredModels) {
        const isAvailable = availableModelNames.has(model.modelName.toLowerCase());
        const shouldBeDeprecated = !isAvailable;

        if (model.deprecated !== shouldBeDeprecated) {
          model.deprecated = shouldBeDeprecated;
          hasChanges = true;

          // 如果模型被停用，自动禁用它
          if (shouldBeDeprecated && model.enabled) {
            model.enabled = false;
            console.log(
              `[Models] Model ${model.provider}/${model.modelName} deprecated, auto-disabled`,
            );
          }
        }
      }

      // 如果有变化，保存配置
      if (hasChanges) {
        await saveModelManagement(storage);
      }

      // 标记新模型和已配置的模型
      const models = availableModels.map((modelName) => {
        const isConfigured = configuredModelNames.has(modelName.toLowerCase());
        const config = configuredModels.find(
          (m) => m.modelName.toLowerCase() === modelName.toLowerCase(),
        );
        return {
          modelName,
          isConfigured,
          isEnabled: config?.enabled || false,
          isDeprecated: config?.deprecated || false,
          configId: config?.configId,
        };
      });

      respond(true, { models, total: models.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 测试认证连接
  "models.auth.test": async ({ params, respond }) => {
    try {
      const { authId, modelName } = params as {
        authId: string;
        modelName?: string; // 可选：测试指定模型，如果不提供则使用通用测试
      };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      const storage = await loadModelManagement();
      let auth: ProviderAuth | undefined;

      // 查找认证
      for (const provider in storage.auths) {
        auth = storage.auths[provider]?.find((a) => a.authId === authId);
        if (auth) {
          break;
        }
      }

      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      // 获取供应商配置
      const providerInstance = storage.providers.find((p) => p.id === auth.provider);
      const baseUrl = auth.baseUrl || providerInstance?.defaultBaseUrl || "";
      const templateId = providerInstance?.templateId || "openai-compatible";

      if (!baseUrl) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Base URL not configured"),
        );
        return;
      }

      // 根据模板类型选择测试方法
      let result: { ok: boolean; status?: number; error?: string; responseTime?: number };

      const startTime = Date.now();

      // 选择默认测试模型：优先使用供应商的 knownModels 的第一个
      let defaultTestModel = "gpt-4o-mini";
      if (providerInstance?.knownModels && providerInstance.knownModels.length > 0) {
        defaultTestModel = providerInstance.knownModels[0];
      }

      if (templateId === "anthropic-compatible") {
        // Anthropic 测试
        result = await testAnthropicConnection({
          baseUrl,
          apiKey: auth.apiKey,
          modelName: modelName || "claude-3-5-sonnet-20241022",
        });
      } else if (templateId === "google-gemini") {
        // Google Gemini 测试（使用API Key作为query参数）
        result = await testGoogleGeminiConnection({
          baseUrl,
          apiKey: auth.apiKey,
          modelName: modelName || "gemini-1.5-flash",
        });
      } else {
        // OpenAI 兼容测试（默认）
        result = await testOpenAIConnection({
          baseUrl,
          apiKey: auth.apiKey,
          modelName: modelName || defaultTestModel,
        });
      }

      result.responseTime = Date.now() - startTime;

      // 更新认证状态
      auth.status = {
        valid: result.ok,
        lastChecked: Date.now(),
        error: result.error,
      };

      await saveModelManagement(storage);

      respond(
        true,
        {
          ok: result.ok,
          status: result.status,
          error: result.error,
          responseTime: result.responseTime,
          message: result.ok
            ? `连接成功！响应时间：${result.responseTime}ms`
            : `连接失败：${result.error || "未知错误"}`,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 批量导入模型
  "models.config.batchAdd": async ({ params, respond }) => {
    try {
      const { authId, provider, modelNames } = params as {
        authId: string;
        provider: string;
        modelNames: string[];
      };

      if (!authId || !provider || !modelNames || !Array.isArray(modelNames)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const storage = await loadModelManagement();

      // 验证认证存在
      const auth = storage.auths[provider]?.find((a) => a.authId === authId);
      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      // 获取已存在的模型
      const existingModels = storage.models[provider] || [];
      const existingModelNames = new Set(
        existingModels.filter((m) => m.authId === authId).map((m) => m.modelName.toLowerCase()),
      );

      // 过滤出新模型（不存在的）
      const newModelNames = modelNames.filter(
        (name) => !existingModelNames.has(name.toLowerCase()),
      );

      if (newModelNames.length === 0) {
        respond(
          true,
          { added: 0, skipped: modelNames.length, message: "所有模型已存在" },
          undefined,
        );
        return;
      }

      // 批量添加新模型
      const newModels: ModelConfig[] = newModelNames.map((modelName) => ({
        configId: generateId("model"),
        authId,
        provider,
        modelName,
        enabled: false, // 新导入的模型默认禁用
        deprecated: false, // 新导入的模型默认不是停用状态
      }));

      if (!storage.models[provider]) {
        storage.models[provider] = [];
      }
      storage.models[provider].push(...newModels);

      await saveModelManagement(storage);

      console.log(`[Models] Batch added ${newModels.length} models for ${provider}`);

      respond(
        true,
        {
          added: newModels.length,
          skipped: modelNames.length - newModels.length,
          models: newModels,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
