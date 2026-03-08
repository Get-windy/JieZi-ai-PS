import { promises as fs } from "node:fs";
import path from "node:path";
import { resetModelCatalogCacheForTest } from "../../agents/model-catalog.js";
import { loadConfig } from "../../config/config.js";
import { STATE_DIR } from "../../config/paths.js";
// DEFAULT_PROVIDER and buildAllowedModelSet are reserved for future use
// import { DEFAULT_PROVIDER } from "../../agents/defaults.js";
// import { buildAllowedModelSet } from "../../agents/model-selection.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// 模型管理配置文件路径 - UI 管理系统的主存储
const MODEL_MANAGEMENT_FILE = path.join(STATE_DIR, "model-management.json");

// 官方运行时配置路径（用于同步）
const getAgentModelsPath = () => {
  const { resolveOpenClawAgentDir } = require("../../agents/agent-paths.js");
  const agentDir = resolveOpenClawAgentDir();
  return path.join(agentDir, "models.json");
};

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

  // SiliconFlow (硅基流动)
  siliconflow: [
    "Pro/Qwen/Qwen2.5-72B-Instruct",
    "Pro/Qwen/Qwen2.5-32B-Instruct",
    "Pro/Qwen/Qwen2.5-14B-Instruct",
    "Pro/Qwen/Qwen2.5-7B-Instruct",
    "Pro/deepseek-ai/DeepSeek-V3.2",
    "Pro/deepseek-ai/DeepSeek-V2.5",
    "Pro/internlm/internlm2_5-20b-chat",
    "Pro/MiniMaxAI/MiniMax-M2.1",
    "Qwen/Qwen2.5-72B-Instruct",
    "deepseek-ai/DeepSeek-V2.5",
    "THUDM/glm-4-9b-chat",
  ],
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

  // 已删除供应商黑名单（防止自动添加回来）
  deletedProviders?: string[];
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
  {
    id: "siliconflow",
    name: "硅基流动 (SiliconFlow)",
    icon: "🔹",
    website: "https://siliconflow.cn",
    templateId: "openai-compatible",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    apiKeyPlaceholder: "sk-...",
    custom: false,
    createdAt: 0,
    // SiliconFlow 的已知模型列表
    knownModels: [
      "Pro/Qwen/Qwen2.5-72B-Instruct",
      "Pro/Qwen/Qwen2.5-32B-Instruct",
      "Pro/Qwen/Qwen2.5-14B-Instruct",
      "Pro/Qwen/Qwen2.5-7B-Instruct",
      "Pro/deepseek-ai/DeepSeek-V3.2",
      "Pro/deepseek-ai/DeepSeek-V2.5",
      "Pro/internlm/internlm2_5-20b-chat",
      "Pro/MiniMaxAI/MiniMax-M2.1",
      "Qwen/Qwen2.5-72B-Instruct",
      "deepseek-ai/DeepSeek-V2.5",
      "THUDM/glm-4-9b-chat",
    ],
  },
];

// ============ 存储管理函数 ============

/**
 * 从 UI 管理结构同步到官方 models.json 格式
 */
/**
 * 规范化 provider baseUrl（直接透传，不做自动修正）
 */
function normalizeProviderBaseUrl(baseUrl: string | undefined): string | undefined {
  return baseUrl;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncToAgentModelsJson(storage: ModelManagementStorage): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {
    providers: {},
  };

  // 遍历所有认证配置
  for (const [providerId, auths] of Object.entries(storage.auths)) {
    if (!auths || auths.length === 0) {
      continue;
    }

    // 使用默认认证或第一个启用的认证
    const defaultAuth =
      auths.find((a) => a.isDefault && a.enabled) || auths.find((a) => a.enabled) || auths[0];
    if (!defaultAuth) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerConfig: any = {
      baseUrl: normalizeProviderBaseUrl(defaultAuth.baseUrl),
      apiKey: defaultAuth.apiKey,
      api: "openai-completions", // 默认 API 类型
      models: [],
    };

    // 添加模型配置
    const providerModels = storage.models[providerId] || [];

    providerConfig.models = providerModels
      .filter((m) => m.enabled)
      .map((m) => ({
        id: m.modelName,
        name: m.nickname || m.modelName,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.maxTokens || 128000,
        maxTokens: m.maxTokens || 8192,
        api: "openai-completions",
      }));

    result.providers[providerId] = providerConfig;
  }

  return result;
}

// ============ 缓存机制 ============
let cachedStorage: ModelManagementStorage | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 缓存有效期 1 小时

// 清除缓存（供其他函数在保存后调用）
export function invalidateModelManagementCache(): void {
  cachedStorage = null;
  cacheTimestamp = 0;
}

// 加载模型管理配置（导出供其他模块使用）
export async function loadModelManagement(): Promise<ModelManagementStorage> {
  // 检查缓存是否有效
  const now = Date.now();
  if (cachedStorage && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedStorage;
  }

  try {
    // 从 UI 管理系统的主存储加载
    const content = await fs.readFile(MODEL_MANAGEMENT_FILE, "utf-8");
    const storage = JSON.parse(content) as ModelManagementStorage;

    // 确保 providers 字段存在
    if (!storage.providers) {
      storage.providers = [];
    }

    // 如果是空的，添加预置的常用供应商
    if (storage.providers.length === 0) {
      storage.providers = [...DEFAULT_PROVIDERS];
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
    } else {
      // 即使没有修复数据，也只在首次加载时同步
      if (!cachedStorage) {
        await syncRuntimeFiles(storage);
      }
    }

    // 更新缓存
    cachedStorage = storage;
    cacheTimestamp = Date.now();

    return storage;
  } catch {
    // 文件不存在时，尝试从旧配置迁移
    const storage = await migrateFromLegacyConfig();
    // 更新缓存
    cachedStorage = storage;
    cacheTimestamp = Date.now();
    return storage;
  }
}

// 同步运行时文件（models.json 和 auth-profiles.json）但不保存主存储
async function syncRuntimeFiles(storage: ModelManagementStorage): Promise<void> {
  // 1. 同步到官方 models.json
  const agentModelsPath = getAgentModelsPath();
  const agentModelsData = syncToAgentModelsJson(storage);
  await fs.mkdir(path.dirname(agentModelsPath), { recursive: true });
  await fs.writeFile(agentModelsPath, JSON.stringify(agentModelsData, null, 2), "utf-8");
  console.log("[Models] Synced to agent models.json:", agentModelsPath);

  // 2. 同步到 auth-profiles.json
  await syncAuthProfiles(storage);
}

// 同步认证信息到 auth-profiles.json
async function syncAuthProfiles(storage: ModelManagementStorage): Promise<void> {
  const { resolveOpenClawAgentDir } = require("../../agents/agent-paths.js");
  const agentDir = resolveOpenClawAgentDir();
  const authProfilesPath = path.join(agentDir, "auth-profiles.json");

  // 构建 auth-profiles.json 格式
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authProfiles: any = {
    version: 1,
    profiles: {},
  };

  // 遍历所有认证，转换为 auth-profiles 格式
  for (const [providerId, auths] of Object.entries(storage.auths)) {
    if (!auths || auths.length === 0) {
      continue;
    }

    for (const auth of auths) {
      if (!auth.enabled) {
        continue;
      } // 只同步启用的认证

      const profileId = `${providerId}:${auth.name.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
      authProfiles.profiles[profileId] = {
        type: "api_key",
        provider: providerId,
        key: auth.apiKey,
        ...(auth.baseUrl && { baseUrl: normalizeProviderBaseUrl(auth.baseUrl) }),
      };
    }
  }

  await fs.writeFile(authProfilesPath, JSON.stringify(authProfiles, null, 2), "utf-8");
  console.log("[Models] Synced to auth-profiles.json:", authProfilesPath);
  console.log(`[Models] Auth profiles count: ${Object.keys(authProfiles.profiles).length}`);
}

// 保存模型管理配置（同时同步到官方 models.json 和 auth-profiles.json）
async function saveModelManagement(storage: ModelManagementStorage): Promise<void> {
  // 1. 保存到 UI 管理系统的主存储
  await fs.mkdir(path.dirname(MODEL_MANAGEMENT_FILE), { recursive: true });
  await fs.writeFile(MODEL_MANAGEMENT_FILE, JSON.stringify(storage, null, 2), "utf-8");

  // 2. 同步运行时文件
  await syncRuntimeFiles(storage);

  // 3. 清除缓存，确保下次读取最新数据
  invalidateModelManagementCache();
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
// 最佳实践：
//   1. 优先 GET /models —— 模型无关，只验证 baseUrl + apiKey 有效性
//   2. /models 返回 401/403 时，直接报认证失败，不继续尝试 chat 探针
//   3. /models 返回其他 4xx/5xx 时，若调用者传入了模型名，再做 chat 探针
//   4. 始终不使用硬编码的 fallback 模型名（如 gpt-4o-mini），避免因供应商不支持该名称而误报失败
async function testOpenAIConnection(params: {
  baseUrl: string;
  apiKey: string;
  modelName?: string; // 可选：/models 失败时用此名称做 chat 探针
}): Promise<{ ok: boolean; status?: number; error?: string; modelsListed?: string[] }> {
  try {
    // ── Step 1: GET /models（不依赖任何模型名，最通用）──
    const modelsEndpoint = params.baseUrl.endsWith("/")
      ? `${params.baseUrl}models`
      : `${params.baseUrl}/models`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

    let modelsResponse: Response;
    try {
      modelsResponse = await fetch(modelsEndpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${params.apiKey}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (modelsResponse.ok) {
      // 尝试解析模型列表（仅用于返回信息，不影响成功判定）
      let modelsListed: string[] | undefined;
      try {
        const body = await modelsResponse.json();
        const data: unknown[] = body?.data ?? (Array.isArray(body) ? body : []);
        modelsListed = data
          .map((m: unknown) => (m as { id?: string })?.id)
          .filter(Boolean) as string[];
      } catch {
        // 解析失败不影响成功
      }
      return { ok: true, status: modelsResponse.status, modelsListed };
    }

    // ── Step 2: /models 失败 ──
    // 401/403 = apiKey 明确无效，不再尝试 chat 探针（避免误导用户）
    if (modelsResponse.status === 401 || modelsResponse.status === 403) {
      const errText = await modelsResponse.text().catch(() => "");
      let errMsg = `HTTP ${modelsResponse.status}: 认证失败，请检查 API Key`;
      try {
        const d = JSON.parse(errText);
        errMsg = d.error?.message || d.message || errMsg;
      } catch {
        if (errText.length < 300) {
          errMsg = errText || errMsg;
        }
      }
      return { ok: false, status: modelsResponse.status, error: errMsg };
    }

    // 只有调用者明确传入了模型名时，才做 chat 探针；否则直接报告连接失败原因
    // 这样避免了用硬编码模型名导致的"模型不存在"误报
    if (params.modelName) {
      const chatEndpoint = params.baseUrl.endsWith("/")
        ? `${params.baseUrl}chat/completions`
        : `${params.baseUrl}/chat/completions`;

      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), TEST_TIMEOUT_MS);

      let chatResponse: Response;
      try {
        chatResponse = await fetch(chatEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.apiKey}`,
          },
          body: JSON.stringify({
            model: params.modelName,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          }),
          signal: controller2.signal,
        });
      } finally {
        clearTimeout(timeoutId2);
      }

      if (chatResponse.ok) {
        return { ok: true, status: chatResponse.status };
      }

      const chatErrorText = await chatResponse.text().catch(() => "");
      let chatErrorMsg = `HTTP ${chatResponse.status}`;
      try {
        const d = JSON.parse(chatErrorText);
        chatErrorMsg = d.error?.message || d.message || chatErrorMsg;
      } catch {
        if (chatErrorText.length < 300) {
          chatErrorMsg = chatErrorText || chatErrorMsg;
        }
      }
      return { ok: false, status: chatResponse.status, error: chatErrorMsg };
    }

    // 没有模型名，直接返回 /models 的错误
    const errorText = await modelsResponse.text().catch(() => "");
    let errorMessage = `HTTP ${modelsResponse.status}`;
    try {
      const d = JSON.parse(errorText);
      errorMessage = d.error?.message || d.message || errorMessage;
    } catch {
      if (errorText.length < 300) {
        errorMessage = errorText || errorMessage;
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
      if (params.apiKey !== undefined && params.apiKey !== "") {
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
    enabled: true, // 默认启用（用户主动添加的模型视为可用）
    deprecated: false, // 默认不是停用状态
    ...restConfig,
  };

  if (!storage.models[params.provider]) {
    storage.models[params.provider] = [];
  }
  storage.models[params.provider].push(modelConfig);

  console.log(
    `[Models] addModelConfig: added ${params.provider}/${params.modelName} configId=${configId} enabled=true (default)`,
  );

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
      // 如果模型被标记为 deprecated，说明它是迁移备份数据，不应阻止运行
      // （SmartRouting 等通过 auth profile 配置的模型不受此限制）
      if (modelConfig.deprecated) {
        return { available: true };
      }
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
  } catch {
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

      // ✅ 确保模型目录中的所有供应商都在 providerInstances 中（除非已被用户删除）
      const originalProviderCount = storage.providers.length;
      const providerInstancesMap = new Map(storage.providers.map((p) => [p.id, p]));
      const deletedProviders = storage.deletedProviders || [];

      for (const providerId of providerSet) {
        // 跳过已被用户主动删除的供应商
        if (deletedProviders.includes(providerId)) {
          console.log(`[Models] Skipping auto-add for deleted provider: ${providerId}`);
          continue;
        }

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
          modelConfigs: Object.fromEntries(
            Object.entries(storage.models).map(([providerId, modelList]) => {
              // 计算该供应商的已知模型集合（用于标注 unlisted）
              const providerInstance = storage.providers.find((p) => p.id === providerId);
              const knownModels = providerInstance?.knownModels;
              // 若供应商没有 knownModels（未刷新过或不支持目录查询），不标注 unlisted
              const knownSet =
                knownModels && knownModels.length > 0
                  ? new Set(knownModels.map((m: string) => m.toLowerCase()))
                  : null;
              return [
                providerId,
                modelList.map((model) => {
                  const isUnlisted = knownSet
                    ? !knownSet.has(model.modelName.toLowerCase())
                    : false;
                  if (isUnlisted) {
                    console.log(
                      `[Models] models.list: ${providerId}/${model.modelName} marked as unlisted (knownSet has ${knownSet?.size} entries)`,
                    );
                  }
                  return {
                    ...model,
                    unlisted: isUnlisted,
                  };
                }),
              ];
            }),
          ),
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
  "models.apiTemplates.list": async ({ respond }) => {
    try {
      respond(true, { templates: API_TEMPLATES }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 获取供应商实例列表
  "models.providers.list": async ({ respond }) => {
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

      // 从删除黑名单中移除（如果存在）
      if (storage.deletedProviders?.includes(id)) {
        storage.deletedProviders = storage.deletedProviders.filter((pid) => pid !== id);
        console.log(`[Models] Removed provider from deleted blacklist: ${id}`);
      }

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

      // 添加到已删除黑名单，防止自动添加回来
      if (!storage.deletedProviders) {
        storage.deletedProviders = [];
      }
      if (!storage.deletedProviders.includes(id)) {
        storage.deletedProviders.push(id);
      }

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
      const { authId, provider, modelName, nickname, enabled, config } = params as {
        authId: string;
        provider: string;
        modelName: string;
        nickname?: string;
        enabled?: boolean; // 前端传来的启用状态（勾选框）
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

      // 将前端传来的 enabled 合并进 config，优先级：前端明确勾选 > 默认 true
      const mergedConfig: Partial<ModelConfig> = {
        ...config,
        ...(enabled !== undefined ? { enabled } : {}),
      };

      const modelConfig = await addModelConfig({
        authId,
        provider,
        modelName,
        nickname,
        config: mergedConfig,
      });
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

      // 更新已配置模型的 deprecated 状态
      // 行业通用标准：模型不在刷新列表中不代表已停用（可能是 API 不支持列表、列表不完整或手动添加的模型）
      // 只有模型出现在刷新列表中时，才主动清除其 deprecated 标记（说明模型仍然存活）
      // deprecated 标记只应由明确的 API 级别错误（如 404/410）触发，刷新操作不主动设置 deprecated
      let hasChanges = false;
      for (const model of configuredModels) {
        const isAvailable = availableModelNames.has(model.modelName.toLowerCase());

        // 若模型出现在刷新列表中，清除其 deprecated 标记（模型已恢复可用）
        if (isAvailable && model.deprecated) {
          model.deprecated = false;
          hasChanges = true;
          console.log(
            `[Models] Model ${model.provider}/${model.modelName} is available again, cleared deprecated flag`,
          );
        }
        // 不在列表中：保持现状，不自动标记 deprecated，也不自动禁用
      }

      // 如果有变化，保存配置
      if (hasChanges) {
        await saveModelManagement(storage);
      }

      // 标记供应商目录中的模型
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
          isUnlisted: false, // 在供应商目录里，不是 unlisted
          configId: config?.configId,
        };
      });

      // 追加「已配置但不在供应商目录中」的模型（unlisted）
      // 很多供应商的目录 API 不会列出全部模型（如手动添加的、目录不完整的）
      for (const model of configuredModels) {
        const alreadyIncluded = availableModelNames.has(model.modelName.toLowerCase());
        if (!alreadyIncluded) {
          models.push({
            modelName: model.modelName,
            isConfigured: true,
            isEnabled: model.enabled,
            isDeprecated: model.deprecated || false,
            isUnlisted: true, // 不在供应商目录中，仅作提示
            configId: model.configId,
          });
          console.log(
            `[Models] refreshModels: model ${model.provider}/${model.modelName} is unlisted (not in provider directory), kept as-is`,
          );
        }
      }

      console.log(
        `[Models] refreshModels: provider=${auth.provider} authId=${authId} total=${models.length} (inDirectory=${availableModels.length}, unlisted=${models.filter((m) => m.isUnlisted).length})`,
      );

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

      // 对于OAuth认证，从AuthProfileStore获取token
      let actualApiKey = auth.apiKey;
      console.log("[models.auth.test] Auth info:", {
        authId,
        provider: auth.provider,
        apiKeyPrefix: auth.apiKey?.slice(0, 30),
        baseUrl: auth.baseUrl,
      });

      if (auth.provider === "qwen-portal" && auth.apiKey.startsWith("qwen-oauth:")) {
        try {
          const { ensureAuthProfileStore } = await import("../../agents/auth-profiles.js");
          const store = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
          const profileId = `${auth.provider}:default`;
          const profile = store.profiles[profileId];

          if (profile && profile.type === "oauth" && profile.access) {
            actualApiKey = profile.access;
          }
        } catch (err) {
          console.error("[models.auth.test] Failed to load OAuth token:", err);
        }
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

      // 选择 chat 探针模型：
      // 优先用调用者传入的 modelName；否则用该认证下第一个启用的模型；
      // 始终不使用硬编码的 fallback 名称（如 gpt-4o-mini），避免供应商不支持导致误报
      let chatProbeModel: string | undefined = modelName;
      if (!chatProbeModel) {
        const configuredModels = storage.models[auth.provider] || [];
        const firstEnabled = configuredModels.find(
          (m) => m.authId === auth.authId && m.enabled && !m.deprecated,
        );
        chatProbeModel = firstEnabled?.modelName; // 可能仍为 undefined，此时 /models 失败才真报错
      }

      if (templateId === "anthropic-compatible") {
        // Anthropic 测试：必须有模型名才能发请求
        // 优先用已配置的模型名；没有时才用 Anthropic 官方最通用的免费模型名
        result = await testAnthropicConnection({
          baseUrl,
          apiKey: actualApiKey,
          modelName: chatProbeModel || "claude-3-haiku-20240307", // 官方最小/最通用模型，作为最后兜底
        });
      } else if (templateId === "google-gemini") {
        // Google Gemini：先通过 GET /models 验证（最佳实践），该函数内部已处理
        // 优先用已配置的模型名；没有时用免费额度最大的模型
        result = await testGoogleGeminiConnection({
          baseUrl,
          apiKey: actualApiKey,
          modelName: chatProbeModel || "gemini-2.0-flash", // 当前最通用的免费模型
        });
      } else {
        // OpenAI 兼容：先走 GET /models（无需模型名）；失败时才用已配置模型名做 chat 探针
        // chatProbeModel 为 undefined 时，/models 失败会直接报错（不用 hardcoded fallback）
        result = await testOpenAIConnection({
          baseUrl,
          apiKey: actualApiKey,
          modelName: chatProbeModel, // undefined 时不做 chat fallback，/models 失败直接报错
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
        enabled: true, // 新导入的模型默认启用（与手动添加保持一致）
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

  /**
   * 获取认证健康状态
   * 支持OAuth/API Key/Token类型的认证状态检测
   */
  "models.auth.status": async ({ params, respond }) => {
    try {
      const authIdParam = params?.authId;
      const authId = typeof authIdParam === "string" ? authIdParam.trim() : "";
      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "authId is required"));
        return;
      }

      const storage = await loadModelManagement();

      // 查找认证
      let auth: ProviderAuth | undefined;
      for (const auths of Object.values(storage.auths)) {
        auth = auths.find((a) => a.authId === authId);
        if (auth) {
          break;
        }
      }

      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      // 检查OAuth认证状态
      const { ensureAuthProfileStore } = await import("../../agents/auth-profiles.js");
      const { buildAuthHealthSummary, DEFAULT_OAUTH_WARN_MS } =
        await import("../../agents/auth-health.js");

      const store = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
      const health = buildAuthHealthSummary({
        store,
        warnAfterMs: DEFAULT_OAUTH_WARN_MS,
        providers: [auth.provider],
      });

      // 查找profile健康状态
      const profileHealth = health.profiles.find(
        (p) => p.provider === auth.provider && p.type === "oauth",
      );

      let authType: "oauth" | "api_key" | "token" = "api_key";
      let status: "ok" | "expiring" | "expired" | "unknown" = "unknown";
      let expiresAt: number | undefined;
      let canRefresh = false;

      if (profileHealth) {
        authType = profileHealth.type;
        status =
          profileHealth.status === "ok" || profileHealth.status === "static"
            ? "ok"
            : profileHealth.status === "expiring"
              ? "expiring"
              : profileHealth.status === "expired"
                ? "expired"
                : "unknown";
        expiresAt = profileHealth.expiresAt;

        // OAuth类型且有refresh token可以刷新
        const profile = store.profiles[profileHealth.profileId];
        if (profile?.type === "oauth" && profile.refresh) {
          canRefresh = true;
        }
      }

      respond(
        true,
        {
          authId,
          provider: auth.provider,
          type: authType,
          status,
          expiresAt,
          canRefresh,
          remainingMs: expiresAt ? expiresAt - Date.now() : undefined,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 手动刷新OAuth Token
   * 立即尝试刷新指定认证的Token，不等待守护进程
   */
  "models.auth.refresh": async ({ params, respond }) => {
    try {
      const authIdParam = params?.authId;
      const authId = typeof authIdParam === "string" ? authIdParam.trim() : "";
      const force = Boolean(params?.force);

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "authId is required"));
        return;
      }

      const storage = await loadModelManagement();

      // 查找认证
      let auth: ProviderAuth | undefined;
      for (const auths of Object.values(storage.auths)) {
        auth = auths.find((a) => a.authId === authId);
        if (auth) {
          break;
        }
      }

      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      // 检查是否为OAuth认证
      const { ensureAuthProfileStore, saveAuthProfileStore } =
        await import("../../agents/auth-profiles.js");
      const store = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });

      // 查找OAuth profile
      const profileId = `${auth.provider}:default`; // 假设使用默认profile
      const profile = store.profiles[profileId];

      if (!profile || profile.type !== "oauth") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Not an OAuth authentication"),
        );
        return;
      }

      if (!profile.refresh) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "No refresh token available"),
        );
        return;
      }

      // 检查是否需要刷新
      const now = Date.now();
      if (!force && profile.expires > now) {
        const remainingMs = profile.expires - now;
        respond(
          true,
          {
            refreshed: false,
            message: "Token still valid, use force=true to refresh anyway",
            expiresAt: profile.expires,
            remainingMs,
          },
          undefined,
        );
        return;
      }

      // 执行刷新
      let newCredentials;

      try {
        switch (auth.provider) {
          case "qwen-portal": {
            const { refreshQwenPortalCredentials } =
              await import("../../providers/qwen-portal-oauth.js");
            newCredentials = await refreshQwenPortalCredentials(profile);
            break;
          }
          // TODO: 添加其他provider的刷新逻辑
          default:
            respond(
              false,
              undefined,
              errorShape(ErrorCodes.INVALID_REQUEST, `Unsupported provider: ${auth.provider}`),
            );
            return;
        }
      } catch (refreshErr) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Refresh failed: ${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}`,
          ),
        );
        return;
      }

      // 更新store
      store.profiles[profileId] = {
        ...profile,
        ...newCredentials,
        type: "oauth",
      };
      saveAuthProfileStore(store, undefined);

      respond(
        true,
        {
          refreshed: true,
          expiresAt: newCredentials.expires,
          remainingMs: newCredentials.expires - Date.now(),
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 启动OAuth重认证流程
   * 返回Device Code授权信息，前端轮询检测授权完成
   */
  "models.auth.reauth": async ({ params, respond }) => {
    try {
      const authIdParam = params?.authId;
      const authId = typeof authIdParam === "string" ? authIdParam.trim() : "";

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "authId is required"));
        return;
      }

      const storage = await loadModelManagement();

      // 查找认证
      let auth: ProviderAuth | undefined;
      for (const auths of Object.values(storage.auths)) {
        auth = auths.find((a) => a.authId === authId);
        if (auth) {
          break;
        }
      }

      if (!auth) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      // 检查是否支持OAuth重认证
      if (auth.provider !== "qwen-portal") {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `OAuth reauth not supported for provider: ${auth.provider}`,
          ),
        );
        return;
      }

      // 启动Device Code流程
      try {
        // 导入qwen OAuth模块
        const oauthModule = await import("../../../extensions/qwen-portal-auth/oauth.js");
        void oauthModule; // reserved for future oauth flow

        // 生成PKCE
        const { randomBytes, createHash } = await import("node:crypto");
        const verifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256").update(verifier).digest("base64url");

        // 请求Device Code
        const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
        const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
        const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
        const QWEN_OAUTH_SCOPE = "openid profile email model.completion";
        const { randomUUID } = await import("node:crypto");

        const toFormUrlEncoded = (data: Record<string, string>) => {
          return Object.entries(data)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join("&");
        };

        const deviceResponse = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "x-request-id": randomUUID(),
          },
          body: toFormUrlEncoded({
            client_id: QWEN_OAUTH_CLIENT_ID,
            scope: QWEN_OAUTH_SCOPE,
            code_challenge: challenge,
            code_challenge_method: "S256",
          }),
        });

        if (!deviceResponse.ok) {
          const text = await deviceResponse.text();
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.UNAVAILABLE, `Device code request failed: ${text}`),
          );
          return;
        }

        const deviceData = (await deviceResponse.json()) as {
          device_code: string;
          user_code: string;
          verification_uri: string;
          verification_uri_complete?: string;
          expires_in: number;
          interval?: number;
        };

        // 存储verifier以供后续轮询使用
        // TODO: 将verifier存储到临时存储，供前端轮询时使用

        respond(
          true,
          {
            deviceCode: deviceData.device_code,
            userCode: deviceData.user_code,
            verificationUrl: deviceData.verification_uri_complete || deviceData.verification_uri,
            expiresIn: deviceData.expires_in,
            interval: deviceData.interval || 2,
            provider: auth.provider,
            authId,
            verifier, // 返回verifier用于前端轮询
          },
          undefined,
        );
      } catch (oauthErr) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `OAuth flow init failed: ${oauthErr instanceof Error ? oauthErr.message : String(oauthErr)}`,
          ),
        );
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 轮询检测OAuth授权状态
   */
  "models.auth.poll": async ({ params, respond }) => {
    try {
      const deviceCodeParam = params?.deviceCode;
      const verifierParam = params?.verifier;
      const deviceCode = typeof deviceCodeParam === "string" ? deviceCodeParam.trim() : "";
      const verifier = typeof verifierParam === "string" ? verifierParam.trim() : "";

      if (!deviceCode || !verifier) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "deviceCode and verifier are required"),
        );
        return;
      }

      // 轮询Token
      const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
      const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
      const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
      const QWEN_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
      const { randomUUID } = await import("node:crypto");

      const toFormUrlEncoded = (data: Record<string, string>) => {
        return Object.entries(data)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join("&");
      };

      const tokenResponse = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "x-request-id": randomUUID(),
        },
        body: toFormUrlEncoded({
          grant_type: QWEN_OAUTH_GRANT_TYPE,
          device_code: deviceCode,
          client_id: QWEN_OAUTH_CLIENT_ID,
          code_verifier: verifier,
        }),
      });

      // 尝试解析JSON响应
      let tokenData: unknown;
      try {
        tokenData = await tokenResponse.json();
      } catch {
        const text = await tokenResponse.text();
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Token response parse failed: ${text}`),
        );
        return;
      }

      // 类型守卫:检查tokenData结构
      if (typeof tokenData !== "object" || tokenData === null) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "Invalid token response format"),
        );
        return;
      }

      const tokenObj = tokenData as Record<string, unknown>;

      // 检查响应状态
      if (tokenObj.error) {
        if (tokenObj.error === "authorization_pending") {
          // 用户尚未完成授权
          respond(true, { status: "pending" }, undefined);
          return;
        } else if (tokenObj.error === "slow_down") {
          // 轮询太快，减慢速度
          respond(true, { status: "slow_down" }, undefined);
          return;
        } else {
          // 其他错误（如expired_token、access_denied）
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.UNAVAILABLE,
              `Authorization failed: ${JSON.stringify(tokenObj.error_description ?? tokenObj.error)}`,
            ),
          );
          return;
        }
      }

      // 授权成功！更新认证信息
      const accessToken =
        typeof tokenObj.access_token === "string" ? tokenObj.access_token : undefined;
      const refreshToken =
        typeof tokenObj.refresh_token === "string" ? tokenObj.refresh_token : undefined;
      const expiresIn = typeof tokenObj.expires_in === "number" ? tokenObj.expires_in : undefined;
      const resourceUrl =
        typeof tokenObj.resource_url === "string" ? tokenObj.resource_url : undefined;

      console.log("[models.auth.poll] ========== QWEN TOKEN RESPONSE ==========");
      console.log("[models.auth.poll] Raw tokenData keys:", Object.keys(tokenObj));
      console.log("[models.auth.poll] access_token length:", accessToken?.length);
      console.log("[models.auth.poll] refresh_token length:", refreshToken?.length);
      console.log("[models.auth.poll] expires_in:", expiresIn);
      console.log("[models.auth.poll] resource_url:", resourceUrl);
      console.log("[models.auth.poll] Full tokenData:", JSON.stringify(tokenObj).slice(0, 500));
      console.log("[models.auth.poll] ===============================================");

      if (!accessToken || !refreshToken || !expiresIn) {
        console.error("[models.auth.poll] ❌ Missing required token fields!");
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "Token response missing required fields"),
        );
        return;
      }

      // 从 params 中获取 authId
      const authIdFromParams = params?.authId;
      const authId = typeof authIdFromParams === "string" ? authIdFromParams.trim() : "";
      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "authId is required"));
        return;
      }

      // 更新认证存储
      const storage = await loadModelManagement();
      let auth: ProviderAuth | undefined;
      let providerKey: string | undefined;

      for (const [key, auths] of Object.entries(storage.auths)) {
        auth = auths.find((a) => a.authId === authId);
        if (auth) {
          providerKey = key;
          break;
        }
      }

      if (!auth || !providerKey) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Auth not found"));
        return;
      }

      // 更新OAuth凭据
      // 保存到 AuthProfileStore
      try {
        const { ensureAuthProfileStore, saveAuthProfileStore } =
          await import("../../agents/auth-profiles.js");
        const store = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });

        const profileId = `${auth.provider}:default`;
        const expiresAt = Date.now() + expiresIn * 1000;

        store.profiles[profileId] = {
          type: "oauth",
          provider: auth.provider,
          access: accessToken,
          refresh: refreshToken,
          expires: expiresAt,
        };

        saveAuthProfileStore(store, undefined);
      } catch (err) {
        console.error("[models.auth.poll] Failed to save to AuthProfileStore:", err);
      }

      // 同时更新 models.json 中的 apiKey（用于UI显示）
      auth.apiKey = `qwen-oauth:${accessToken.slice(0, 20)}...`;

      // 更新 baseUrl 为 Qwen 返回的 resource_url
      if (resourceUrl) {
        const normalizedBaseUrl = resourceUrl.startsWith("http")
          ? resourceUrl
          : `https://${resourceUrl}`;
        const finalBaseUrl = normalizedBaseUrl.endsWith("/v1")
          ? normalizedBaseUrl
          : `${normalizedBaseUrl}/v1`;

        auth.baseUrl = finalBaseUrl;
      }

      await saveModelManagement(storage);

      respond(
        true,
        {
          status: "success",
          message: "OAuth authorization completed successfully",
        },
        undefined,
      );
    } catch (err) {
      console.error("[models.auth.poll] Error:", err);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
