import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveOpenClawAgentDir } from "../../../upstream/src/agents/agent-paths.js";
import { resetModelCatalogCacheForTest } from "../../../upstream/src/agents/model-catalog.js";
import { resolveDefaultModelForAgent } from "../../../upstream/src/agents/model-selection.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { STATE_DIR } from "../../../upstream/src/config/paths.js";
// DEFAULT_PROVIDER and buildAllowedModelSet are reserved for future use
// import { DEFAULT_PROVIDER } from "../../../upstream/src/agents/defaults.js";
// import { buildAllowedModelSet } from "../../../upstream/src/agents/model-selection.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { resolveDefaultAgentId, resolveAgentDir } from "../../agents/agent-scope.js";
import { forceRefreshBenchmarkData } from "../../agents/arena-benchmarks.js";

// 模型管理配置文件路径 - UI 管理系统的主存储
const MODEL_MANAGEMENT_FILE = path.join(STATE_DIR, "model-management.json");

// 官方运行时配置路径（用于同步）
const getAgentModelsPath = () => {
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

// 凭据调度策略
export type AuthDispatchRole =
  | "primary" // 优先使用，永远最先尝试（同 primary 按 priority 排序）
  | "roundrobin" // 与其他 roundrobin 凭据轮流调用（分摊 RPM/TPM）
  | "fallback"; // 备用，仅当所有 primary/roundrobin 均熔断时才使用

export type AuthDispatchPolicy = {
  role: AuthDispatchRole; // 调度角色
  priority: number; // 同角色内的优先级（数字越小越先）
  cooldownMinutes: number; // 遇到配额/鉴权错误后的冷却时间（分钟，0=不自动冷却）
};

/**
 * 周期性套餐配额配置（Subscription-based Quota Cycle）
 * 适用于按周/月/季度计费的 Coding Plan 等固定周期套餐：
 *   - 每个周期有固定用量，耗尽后当前周期内不可调用
 *   - 下一个周期开始时自动重置，无需用户手动操作
 *   - 多账号多套餐 → 多认证轮询，单个耗尽自动切换其他
 */
export type AuthQuotaCycle = {
  /**
   * 周期类型
   * - weekly: 每周重置（如每周一 0:00）
   * - monthly: 每月重置（如每月 1 日 0:00）
   * - quarterly: 每季度重置（1/4/7/10 月的 1 日）
   * - custom: 自定义天数（resetDay = 周期天数，如 30 = 每 30 天）
   */
  type: "weekly" | "monthly" | "quarterly" | "custom";
  /**
   * 重置基准日（含义随 type 变化）：
   * - weekly: 星期几重置（0=周日，1=周一...6=周六，默认 1=周一）
   * - monthly: 每月几号重置（1-28，默认 1=每月 1 日）
   * - quarterly: 季度首月几号重置（1-28，默认 1=每季度 1 日）
   * - custom: 周期天数（如 30=每 30 天，从 cycleStartMs 起算）
   */
  resetDay: number;
  /**
   * 本周期开始时间戳（ms）。
   * custom 模式下用于推算下一次重置时间。
   * 其他模式下可用于 UI 展示「本周期已用 X 天」。
   * 创建认证时自动设为当前时间，每次重置后自动更新。
   */
  cycleStartMs?: number;
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

  /**
   * 系统自动禁用原因（非用户主动禁用时填写）。
   * 用于 UI 区分「用户手动禁用」与「系统因错误自动禁用」，并向用户展示原因提示。
   * - "billing_exhausted": 余额/配额耗尽，需续费
   * - "auth_failure": API Key 失效，需更换
   * - undefined: 用户主动禁用
   */
  autoDisabledReason?: "billing_exhausted" | "auth_failure";

  // 调度策略（多凭据负载均衡 / 故障转移）
  dispatchPolicy?: AuthDispatchPolicy;

  /**
   * 周期性套餐配额配置（可选）。
   * 配置后，当此认证触发 quota exceeded 时，系统自动计算到下一个
   * 周期重置时间，在此期间跳过此认证路由到其他可用认证，周期到后
   * 自动恢复——用户无感，不需要手动重新启用。
   */
  quotaCycle?: AuthQuotaCycle;

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

// ============ 周期配额重置时间计算 ============

/**
 * 计算某认证下一次周期配额重置的时间戳（ms）。
 * 调用时机：quota exceeded 触发熔断时，用于计算 cooldownUntil。
 *
 * 计算规则（业界标准——以服务器本地 UTC 时间为基准）：
 *   - weekly: 找下一个 resetDay 星期几的 00:00 UTC
 *   - monthly: 找下一个 resetDay 号的 00:00 UTC
 *   - quarterly: 找下一个季首月 resetDay 号的 00:00 UTC
 *   - custom: 从 cycleStartMs 起每 resetDay 天一个周期，找下一个周期起始
 *
 * @param cycle - 周期配置
 * @param now   - 当前时间戳（ms），默认 Date.now()
 * @returns 下一次重置时间戳（ms）
 */
export function computeQuotaResetTime(cycle: AuthQuotaCycle, now: number = Date.now()): number {
  const d = new Date(now);

  switch (cycle.type) {
    case "weekly": {
      // 目标星期几（0-6），默认 1（周一）
      const targetDay = Math.max(0, Math.min(6, Math.floor(cycle.resetDay ?? 1)));
      const currentDay = d.getUTCDay();
      let daysUntil = (targetDay - currentDay + 7) % 7;
      if (daysUntil === 0) {
        // 今天就是重置日，但当前周期用完了说明已过今日重置点，等下周
        daysUntil = 7;
      }
      const reset = new Date(d);
      reset.setUTCDate(d.getUTCDate() + daysUntil);
      reset.setUTCHours(0, 0, 0, 0);
      return reset.getTime();
    }

    case "monthly": {
      // 目标月份日（1-28），默认 1
      const targetDate = Math.max(1, Math.min(28, Math.floor(cycle.resetDay ?? 1)));
      const reset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), targetDate, 0, 0, 0, 0));
      if (reset.getTime() <= now) {
        // 本月的重置日已过，取下月同日
        reset.setUTCMonth(reset.getUTCMonth() + 1);
      }
      return reset.getTime();
    }

    case "quarterly": {
      // 季度首月：1/4/7/10，取当前月份对应季度的下一个季首月
      const targetDate = Math.max(1, Math.min(28, Math.floor(cycle.resetDay ?? 1)));
      const currentMonth = d.getUTCMonth(); // 0-11
      // 当前季度首月（0-indexed）
      const currentQStart = Math.floor(currentMonth / 3) * 3;
      // 本季度重置点
      let reset = new Date(Date.UTC(d.getUTCFullYear(), currentQStart, targetDate, 0, 0, 0, 0));
      if (reset.getTime() <= now) {
        // 已过，取下一季度
        reset = new Date(Date.UTC(d.getUTCFullYear(), currentQStart + 3, targetDate, 0, 0, 0, 0));
      }
      return reset.getTime();
    }

    case "custom": {
      // 自定义周期天数（resetDay = 天数）
      const cycleDays = Math.max(1, Math.floor(cycle.resetDay ?? 30));
      const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
      const start = cycle.cycleStartMs ?? now;
      // 从 start 起，找第一个 > now 的周期起始点
      const elapsed = now - start;
      if (elapsed < 0) {
        return start; // 周期还没开始（异常情况），直接返回开始时间
      }
      const cyclesPassed = Math.floor(elapsed / cycleMs);
      return start + (cyclesPassed + 1) * cycleMs;
    }
  }
}

// ============ 周期配额持久化（进程重启后恢复耗尽状态）============

type QuotaExhaustedRecord = {
  authId: string;
  exhaustedUntil: number; // 耗尽截止时间戳（ms），即下一个周期重置时间
  exhaustedAt: number; // 首次耗尽时间戳（ms）
};

type QuotaExhaustedStore = {
  records: QuotaExhaustedRecord[];
};

// 内存态（热路径快速查询，无需每次读文件）
const quotaExhaustedMap = new Map<string, QuotaExhaustedRecord>();
let quotaStoreLoaded = false;

function getQuotaExhaustedFile(): string {
  // 与 model-management.json 同目录
  return MODEL_MANAGEMENT_FILE.replace(/model-management\.json$/, "quota-exhausted.json");
}

async function loadQuotaExhaustedStore(): Promise<void> {
  if (quotaStoreLoaded) {
    return;
  }
  quotaStoreLoaded = true;
  try {
    const filePath = getQuotaExhaustedFile();
    const fs = await import("fs/promises");
    const content = await fs.readFile(filePath, "utf-8").catch(() => null);
    if (!content) {
      return;
    }
    const store: QuotaExhaustedStore = JSON.parse(content);
    const now = Date.now();
    for (const record of store.records ?? []) {
      if (record.exhaustedUntil > now) {
        // 还在耗尽期内，恢复到内存 + 熔断器
        quotaExhaustedMap.set(record.authId, record);
        const existing = circuitBreakers.get(record.authId);
        if (!existing || existing.cooldownUntil < record.exhaustedUntil) {
          circuitBreakers.set(record.authId, {
            authId: record.authId,
            cooldownUntil: record.exhaustedUntil,
            errorCount: 1,
            lastError: "quota_cycle_exhausted (restored from disk)",
          });
        }
      }
      // 已过期的记录直接丢弃（不写回，下次 save 时自动清理）
    }
  } catch {
    // 读取失败不影响运行
  }
}

async function saveQuotaExhaustedStore(): Promise<void> {
  try {
    const filePath = getQuotaExhaustedFile();
    const now = Date.now();
    // 只保存还未过期的记录
    const records: QuotaExhaustedRecord[] = [];
    for (const record of quotaExhaustedMap.values()) {
      if (record.exhaustedUntil > now) {
        records.push(record);
      }
    }
    const store: QuotaExhaustedStore = { records };
    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // 写入失败不影响运行
  }
}

/**
 * 标记某认证因套餐周期配额耗尽，持久化到文件，恢复时间为下一个周期重置点。
 * 由 reportAuthFailure 在检测到 isQuotaOrAuthError + 该认证有 quotaCycle 配置时调用。
 */
async function markQuotaCycleExhausted(auth: ProviderAuth, resetTime: number): Promise<void> {
  const record: QuotaExhaustedRecord = {
    authId: auth.authId,
    exhaustedUntil: resetTime,
    exhaustedAt: Date.now(),
  };
  quotaExhaustedMap.set(auth.authId, record);
  console.log(
    `[QuotaCycle] Auth "${auth.name}" (${auth.authId}) quota exhausted for current cycle. ` +
      `Will auto-recover at ${new Date(resetTime).toISOString()} (${Math.ceil((resetTime - Date.now()) / 3600000)}h).`,
  );
  await saveQuotaExhaustedStore();
}

/**
 * 清除某认证的周期配额耗尽记录（用于手动重置或周期到期后自动清理）
 */
export async function clearQuotaCycleExhausted(authId: string): Promise<void> {
  quotaExhaustedMap.delete(authId);
  await saveQuotaExhaustedStore();
}

/**
 * 判断某认证是否当前处于周期配额耗尽状态
 */
export function isQuotaCycleExhausted(authId: string): boolean {
  const record = quotaExhaustedMap.get(authId);
  if (!record) {
    return false;
  }
  if (record.exhaustedUntil <= Date.now()) {
    // 已过期，自动清理内存（异步写文件）
    quotaExhaustedMap.delete(authId);
    saveQuotaExhaustedStore().catch(() => {});
    return false;
  }
  return true;
}

/**
 * 获取某认证的周期配额耗尽截止时间（ms），0=未耗尽
 */
export function getQuotaExhaustedUntil(authId: string): number {
  const record = quotaExhaustedMap.get(authId);
  if (!record) {
    return 0;
  }
  if (record.exhaustedUntil <= Date.now()) {
    quotaExhaustedMap.delete(authId);
    return 0;
  }
  return record.exhaustedUntil;
}

// ============ 凭据熔断器（内存态，进程重启后重置）============

/**
 * 单个凭据的熔断状态
 */
type CircuitState = {
  authId: string;
  cooldownUntil: number; // 冷却截止时间戳（ms），0=未冷却
  errorCount: number; // 连续错误次数
  lastError?: string; // 最后一次错误信息
};

// authId → CircuitState
const circuitBreakers = new Map<string, CircuitState>();

/**
 * 判断某个凭据当前是否处于熔断（冷却中）
 */
export function isAuthCircuitOpen(authId: string): boolean {
  const state = circuitBreakers.get(authId);
  if (!state) {
    return false;
  }
  if (state.cooldownUntil === 0) {
    return false;
  }
  if (Date.now() < state.cooldownUntil) {
    return true;
  }
  // 冷却期已过，自动重置
  state.cooldownUntil = 0;
  state.errorCount = 0;
  return false;
}

/**
 * 获取某凭据的熔断剩余秒数（0=未熔断）
 */
export function getAuthCircuitRemainingSeconds(authId: string): number {
  const state = circuitBreakers.get(authId);
  if (!state || state.cooldownUntil === 0) {
    return 0;
  }
  const remaining = Math.max(0, state.cooldownUntil - Date.now());
  return Math.ceil(remaining / 1000);
}

/**
 * 上报某凭据调用失败。
 * @param authId  - 凭据 ID
 * @param error   - 错误信息
 * @param isQuotaOrAuth - 是否为配额/鉴权错误（触发熔断冷却）
 * @param cooldownMinutes - 冷却时间（来自 dispatchPolicy.cooldownMinutes）
 * @param auth - 完整的 ProviderAuth 对象（如果有 quotaCycle 配置，用于自动计算周期重置时间）
 */
export function reportAuthFailure(
  authId: string,
  error: string,
  isQuotaOrAuth: boolean,
  cooldownMinutes: number,
  auth?: ProviderAuth,
): void {
  let state = circuitBreakers.get(authId);
  if (!state) {
    state = { authId, cooldownUntil: 0, errorCount: 0 };
    circuitBreakers.set(authId, state);
  }
  state.errorCount += 1;
  state.lastError = error;

  if (isQuotaOrAuth) {
    // 如果该认证配置了 quotaCycle，优先用周期重置时间作为导火截止时间
    const quotaAuth =
      auth ??
      (cachedStorage
        ? Object.values(cachedStorage.auths)
            .flat()
            .find((a) => a.authId === authId)
        : undefined);

    if (quotaAuth?.quotaCycle) {
      const resetTime = computeQuotaResetTime(quotaAuth.quotaCycle);
      state.cooldownUntil = resetTime;
      console.log(
        `[QuotaCycle] Auth "${quotaAuth.name}" quota exhausted. ` +
          `Auto-routing to other credentials until cycle reset at ${new Date(resetTime).toISOString()}.`,
      );
      // 异步持乇化周期耗尽状态（进程重启后仍有效）
      markQuotaCycleExhausted(quotaAuth, resetTime).catch(() => {});
    } else if (cooldownMinutes > 0) {
      // 普通熔断冷却
      state.cooldownUntil = Date.now() + cooldownMinutes * 60 * 1000;
      console.log(
        `[CredentialCircuitBreaker] Auth ${authId} tripped. Cooling down for ${cooldownMinutes}min (error: ${error})`,
      );
    }
  }
}

/**
 * 上报某凭据调用成功，清零错误计数
 * 注意：成功不会自动清除周期配额耗尽状态（周期收益已屌岞，需周期到期自动恢复）
 */
export function reportAuthSuccess(authId: string): void {
  const state = circuitBreakers.get(authId);
  if (state) {
    state.errorCount = 0;
    // 只清普通熔断（非周期耗尽类），周期耗尽必须等周期到期
    if (!isQuotaCycleExhausted(authId)) {
      state.cooldownUntil = 0;
      state.lastError = undefined;
    }
  }
}

/**
 * 手动重置某凭据的熔断状态（UI "立即重试" 按鈕使用）
 * 如果是周期配额耗尽类型，同时清除持乇化记录（允许用户强制解除）
 */
export function resetAuthCircuit(authId: string): void {
  circuitBreakers.delete(authId);
  // 同时清除周期耗尽持乇化记录
  if (quotaExhaustedMap.has(authId)) {
    clearQuotaCycleExhausted(authId).catch(() => {});
  }
}

/**
 * 获取所有凭据的熔断快照（供 UI 展示）
 * 包括普通熔断和周期配额耗尽两种状态
 */
export function getCircuitBreakerSnapshot(): Record<
  string,
  {
    cooldownUntil: number;
    errorCount: number;
    lastError?: string;
    quotaExhaustedUntil?: number;
    isQuotaCycle?: boolean;
  }
> {
  const result: Record<
    string,
    {
      cooldownUntil: number;
      errorCount: number;
      lastError?: string;
      quotaExhaustedUntil?: number;
      isQuotaCycle?: boolean;
    }
  > = {};
  // 普通熔断器状态
  for (const [id, state] of circuitBreakers.entries()) {
    result[id] = {
      cooldownUntil: state.cooldownUntil,
      errorCount: state.errorCount,
      lastError: state.lastError,
    };
  }
  // 周期配额耗尽状态（可能在熔断器之外持久化状态中存在）
  for (const [id, record] of quotaExhaustedMap.entries()) {
    if (record.exhaustedUntil > Date.now()) {
      if (!result[id]) {
        result[id] = {
          cooldownUntil: record.exhaustedUntil,
          errorCount: 1,
          lastError: "quota_cycle_exhausted",
        };
      }
      result[id].quotaExhaustedUntil = record.exhaustedUntil;
      result[id].isQuotaCycle = true;
    }
  }
  return result;
}

/**
 * 通过供应商 ID + 明文 API Key 反查对应的 ProviderAuth。
 *
 * 用于将 run.ts 实际调用路径（使用明文 apiKey）与我们的认证管理层（authId）桥接：
 * - 当 API 调用返回 billing/quota 错误时，通过此函数找到对应的 ProviderAuth
 * - 然后调用 reportAuthFailure 触发配额耗尽状态（包括 quotaCycle 周期耗尽持久化）
 *
 * 匹配策略（按优先级）：
 *   1. 完整精确匹配（apiKey === stored.apiKey）
 *   2. 前缀匹配（apiKey 前缀与存储的 key 前 8 位相同）——防御运行时截断
 *
 * @param provider - 供应商 ID（如 "openai"、"anthropic"）
 * @param apiKey   - 实际使用的 API Key 明文
 * @returns 匹配到的 ProviderAuth，未找到时返回 undefined
 */
export function findAuthByApiKey(provider: string, apiKey: string): ProviderAuth | undefined {
  if (!cachedStorage || !apiKey) {
    return undefined;
  }
  const auths = cachedStorage.auths[provider] ?? [];
  // 1. 精确匹配（最优先）
  const exact = auths.find((a) => a.apiKey === apiKey);
  if (exact) {
    return exact;
  }
  // 2. 前缀匹配（防御 runtime 截断）：只有两个 key 都足够长时才尝试
  // 取前 16 位匹配，减小前缀相同但实质不同 key 的误匹配风险
  const PREFIX_LEN = 16;
  if (apiKey.length >= PREFIX_LEN) {
    const prefix = apiKey.slice(0, PREFIX_LEN);
    const candidates = auths.filter(
      (a) => a.apiKey.length >= PREFIX_LEN && a.apiKey.slice(0, PREFIX_LEN) === prefix,
    );
    // 前缀匹配到唯一一个才返回，多个前缀相同的则放弃（不冒險误匹）
    if (candidates.length === 1) {
      return candidates[0];
    }
  }
  return undefined;
}

/**
 * 判断一个错误是否应触发熔断（配额耗尽 / 鉴权失效 / 账户停用）
 * 业界标准：只对这些确定性错误熔断，网络超时等瞬时错误不熔断
 */
export function isQuotaOrAuthError(errorMsg: string, httpStatus?: number): boolean {
  if (httpStatus === 401 || httpStatus === 403) {
    return true;
  }
  if (httpStatus === 429) {
    return true;
  }
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("insufficient_quota") ||
    lower.includes("billing") ||
    lower.includes("exceeded") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized") ||
    lower.includes("account disabled") ||
    lower.includes("access denied")
  );
}

// ============ 凭据调度器 ============

/**
 * 从同一供应商的多个认证中选出本次应使用的那一个。
 *
 * 调度顺序（参考 LiteLLM 的 Deployment Ordering + 熔断机制）：
 *   1. role=primary 且未熔断且周期配额未耗尽，按 priority 升序取第一个
 *   2. 若 primary 全熔断/耗尽，从 role=roundrobin 未熔断且未耗尽的中轮询
 *   3. 若 primary+roundrobin 全熔断/耗尽，从 role=fallback 未熔断且未耗尽中按 priority 取第一个
 *   4. 全部熔断时返回熔断时间最短的那个（保底降级）
 *
 * 周期配额逐耗尽的认证会被排除在前 3 组之外，它们在周期内等同于“不存在”，
 * 只有当所有其他认证都熔断后才会被“保底”选中。
 *
 * @param auths - 同一供应商下所有已启用的认证
 * @returns 选中的认证，以及该认证的 dispatchPolicy（供调用方上报结果）
 */
export function pickAuth(
  auths: ProviderAuth[],
): { auth: ProviderAuth; isCircuitOpen: boolean } | null {
  const enabled = auths.filter((a) => a.enabled);
  if (enabled.length === 0) {
    return null;
  }
  if (enabled.length === 1) {
    return { auth: enabled[0], isCircuitOpen: isAuthCircuitOpen(enabled[0].authId) };
  }

  const roleOf = (a: ProviderAuth): AuthDispatchRole =>
    a.dispatchPolicy?.role ?? (a.isDefault ? "primary" : "roundrobin");
  const priorityOf = (a: ProviderAuth): number => a.dispatchPolicy?.priority ?? 0;

  // 可用判断：未熔断且周期配额未耗尽
  const available = (a: ProviderAuth) =>
    !isAuthCircuitOpen(a.authId) && !isQuotaCycleExhausted(a.authId);

  // --- 1. primary 组 ---
  const primaries = enabled
    .filter((a) => roleOf(a) === "primary")
    .toSorted((a, b) => priorityOf(a) - priorityOf(b));
  const availablePrimary = primaries.filter(available);
  if (availablePrimary.length > 0) {
    return { auth: availablePrimary[0], isCircuitOpen: false };
  }

  // --- 2. roundrobin 组（轮询）---
  const roundrobins = enabled.filter((a) => roleOf(a) === "roundrobin");
  const availableRR = roundrobins.filter(available);
  if (availableRR.length > 0) {
    // 简单轮询：取上次使用时间最早的（无持久化，用随机打散代替）
    const idx = Math.floor(Math.random() * availableRR.length);
    return { auth: availableRR[idx], isCircuitOpen: false };
  }

  // --- 3. fallback 组 ---
  const fallbacks = enabled
    .filter((a) => roleOf(a) === "fallback")
    .toSorted((a, b) => priorityOf(a) - priorityOf(b));
  const availableFallback = fallbacks.filter(available);
  if (availableFallback.length > 0) {
    return { auth: availableFallback[0], isCircuitOpen: false };
  }

  // --- 4. 全部熔断/耗尽：选冷却时间最短的保底 ---
  // 周期配额耗尽的认证需要周期到期才能恢复，保底时首选普通熔断的
  const allSorted = enabled.toSorted((a, b) => {
    const aIsQuota = isQuotaCycleExhausted(a.authId);
    const bIsQuota = isQuotaCycleExhausted(b.authId);
    // 周期耗尽的排后面
    if (aIsQuota !== bIsQuota) {
      return aIsQuota ? 1 : -1;
    }
    const ra = getAuthCircuitRemainingSeconds(a.authId);
    const rb = getAuthCircuitRemainingSeconds(b.authId);
    return ra - rb;
  });
  const hasNonQuota = allSorted.some((a) => !isQuotaCycleExhausted(a.authId));
  if (hasNonQuota) {
    console.warn(
      `[CredentialDispatcher] All non-quota credentials for provider are circuit-open. Falling back to least-cooldown.`,
    );
    // 尚有普通熔断的，选冷却时间最短的保底
    return { auth: allSorted[0], isCircuitOpen: true };
  } else {
    // 所有认证均周期耗尽：不应再发请求（发了也会报错，浪费 quota 且会再次触发熔断）
    // 返回 null 让调用方知道该供应商当前完全不可用
    console.warn(
      `[CredentialDispatcher] All ${enabled.length} credentials for provider have quota cycle exhausted. Returning null to prevent wasted requests.`,
    );
    return null;
  }
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

/**
 * 同步获取当前缓存的 ModelManagementStorage（可为 null）。
 * 不触发文件读取，只返回内存缓存，用于同步上下文中检测模型可用性。
 */
export function getModelManagementCacheSync(): ModelManagementStorage | null {
  return cachedStorage;
}

/**
 * 同步检测指定 provider 下是否有至少一个启用的认证（Provider-level health gate）。
 * 业界标准：provider 认证全停用 = provider unhealthy，其下所有模型均不可路由。
 * 若缓存未就绪则返回 undefined（调用方应 fallback 到宽松策略）。
 */
export function isProviderUsableSync(providerId: string): boolean | undefined {
  const storage = cachedStorage;
  if (!storage) {
    return undefined; // 缓存未就绪
  }
  const authList = storage.auths[providerId];
  if (!authList || authList.length === 0) {
    // 该 provider 在新系统里没有任何认证配置
    // → 可能是旧数据/未纳管，不拦截（返回 undefined 让上层用旧逻辑）
    return undefined;
  }
  // 有至少一个「启用 + 未熔断 + 未周期耗尽」的认证，provider 才算 healthy
  return authList.some(
    (a) => a.enabled && !isAuthCircuitOpen(a.authId) && !isQuotaCycleExhausted(a.authId),
  );
}

/**
 * 同步检测 modelId（格式：providerId/modelName）在新数据链中是否可用：
 *   1. ModelConfig.enabled === true && !deprecated
 *   2. provider 下至少有一个启用的认证（provider-level health gate）
 *      - 注意：不要求直接绑定的 authId 启用，只要 provider 下有可用认证
 *        即可，因为 pickAuth() 会自动选到可用的那个
 * 若缓存未就绪则返回 undefined（调用方应 fallback 到旧逻辑）。
 */
export function isModelIdUsableSync(modelId: string): boolean | undefined {
  const storage = cachedStorage;
  if (!storage) {
    return undefined; // 缓存未就绪，调用方自行决策
  }
  const slashIdx = modelId.indexOf("/");
  if (slashIdx < 0) {
    return undefined; // 格式不对，交旧逻辑处理
  }
  const providerId = modelId.substring(0, slashIdx);
  const modelName = modelId.substring(slashIdx + 1);
  const modelList = storage.models[providerId];
  if (!modelList) {
    return undefined; // 该 provider 在新系统里没有注册
  }
  const modelConfig = modelList.find((m) => m.modelName === modelName);
  if (!modelConfig) {
    return undefined; // 模型不在新系统里
  }
  if (!modelConfig.enabled || modelConfig.deprecated) {
    return false; // 模型已禁用或已废弃
  }
  // Provider-level health gate：该供应商下是否有任意启用的认证
  // 业界做法（LiteLLM/OpenRouter）：provider 无可用凭据 → 整个 provider 不可路由
  const authList = storage.auths[providerId];
  if (!authList || authList.length === 0) {
    return false; // provider 没有任何认证，不可用
  }
  // 需要「启用 + 未熔断 + 未周期耗尽」三个条件同时满足
  const hasUsableAuth = authList.some(
    (a) => a.enabled && !isAuthCircuitOpen(a.authId) && !isQuotaCycleExhausted(a.authId),
  );
  if (!hasUsableAuth) {
    return false; // provider 下所有认证均已停用/冷却/配额耗尽，不可路由
  }
  return true;
}

// 加载模型管理配置（导出供其他模块使用）
export async function loadModelManagement(): Promise<ModelManagementStorage> {
  // 首次加载时，同时初始化周期配额耗尽持久化数据（进程重启后恢复）
  loadQuotaExhaustedStore().catch(() => {});

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
  const agentModelsData = syncToAgentModelsJson(storage);
  const agentModelsJson = JSON.stringify(agentModelsData, null, 2);

  // 1. 同步 models.json 到所有 agents/*/agent/ 目录
  const agentsBaseDir = path.join(STATE_DIR, "agents");
  const modelsPaths: string[] = [];

  try {
    const agentDirs = await fs.readdir(agentsBaseDir);
    for (const agentId of agentDirs) {
      const agentModelsPath = path.join(agentsBaseDir, agentId, "agent", "models.json");
      modelsPaths.push(agentModelsPath);
    }
  } catch {
    // agents 目录不存在，退回到 main
  }

  // 确保 main agent 路径始终包含
  const mainModelsPath = getAgentModelsPath();
  if (!modelsPaths.includes(mainModelsPath)) {
    modelsPaths.push(mainModelsPath);
  }

  for (const modelsPath of modelsPaths) {
    await fs.mkdir(path.dirname(modelsPath), { recursive: true });
    await fs.writeFile(modelsPath, agentModelsJson, "utf-8");
    console.log("[Models] Synced models.json:", modelsPath);
  }

  // 2. 同步到 auth-profiles.json
  await syncAuthProfiles(storage);
}

// 同步认证信息到 auth-profiles.json
async function syncAuthProfiles(storage: ModelManagementStorage): Promise<void> {
  // 收集所有已存在的 agent auth-profiles.json 路径
  const mainAgentDir = resolveOpenClawAgentDir();

  // ── Step 1: 从默认智能助手读取真实 auth-profiles 和默认模型信息 ──
  // 默认助手变更时自动随之变更（每次同步时动态读）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let defaultAgentRealProfiles: Record<string, any> = {};
  let defaultAgentDefaultProvider: string | undefined;
  try {
    const cfg = loadConfig();
    const defaultAgentId = resolveDefaultAgentId(cfg);
    const defaultAgentDir = resolveAgentDir(cfg, defaultAgentId);

    // 读取默认助手的默认模型，获取其 provider
    const defaultModel = resolveDefaultModelForAgent({ cfg, agentId: defaultAgentId });
    defaultAgentDefaultProvider = defaultModel.provider;
    console.log(
      `[Models] Default agent (${defaultAgentId}) uses provider: ${defaultAgentDefaultProvider}`,
    );

    // 读取默认助手的真实 auth-profiles
    const defaultAuthPath = path.join(defaultAgentDir, "auth-profiles.json");
    const raw = await fs.readFile(defaultAuthPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.profiles) {
      defaultAgentRealProfiles = parsed.profiles;
    }
    console.log(
      `[Models] Loaded real auth-profiles from default agent (${defaultAgentId}): ${Object.keys(defaultAgentRealProfiles).length} profiles`,
    );
  } catch {
    // 默认助手信息读取失败，继续
  }

  // ── Step 2: 构建本次 model-management.json 中管理的认证条目 ──
  // 占位符回退策略（优先级依次降低）：
  //   1. 默认助手在用的同 provider 有真实凭据 → 使用它
  //   2. 默认助手的默认模型所属 provider 有真实凭据 → 用默认模型 provider 的凭据替代
  //   3. 两者均无 → 跳过，不写入任何假数据
  const managedProfiles: Record<
    string,
    { type: string; provider: string; key: string; baseUrl?: string }
  > = {};

  // 辅助函数：在默认助手真实 profiles 中找指定 provider 的第一个真实凭据
  const findRealProfileForProvider = (targetProvider: string) => {
    return Object.entries(defaultAgentRealProfiles).find(([, p]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = p;
      if (profile.provider !== targetProvider) {
        return false;
      }
      if (profile.type === "oauth" || profile.type === "token") {
        return true;
      }
      if (profile.type === "api_key") {
        const k = profile.key?.trim() ?? "";
        return k && !/^[a-z0-9-]+-oauth$/i.test(k) && k !== "placeholder" && k !== "PLACEHOLDER";
      }
      return false;
    });
  };

  for (const [providerId, auths] of Object.entries(storage.auths)) {
    if (!auths || auths.length === 0) {
      continue;
    }
    for (const auth of auths) {
      if (!auth.enabled) {
        continue;
      }
      const apiKey = auth.apiKey?.trim() ?? "";
      const isPlaceholder =
        !apiKey ||
        /^[a-z0-9-]+-oauth$/i.test(apiKey) ||
        apiKey === "placeholder" ||
        apiKey === "PLACEHOLDER";

      if (!isPlaceholder) {
        // 真实 apiKey，直接使用
        const profileId = `${providerId}:${auth.name.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
        managedProfiles[profileId] = {
          type: "api_key",
          provider: providerId,
          key: apiKey,
          ...(auth.baseUrl && { baseUrl: normalizeProviderBaseUrl(auth.baseUrl) }),
        };
      } else {
        // 占位符回退策略：优先找同 provider，再找默认模型 provider
        let realEntry = findRealProfileForProvider(providerId);

        if (
          !realEntry &&
          defaultAgentDefaultProvider &&
          defaultAgentDefaultProvider !== providerId
        ) {
          // 该 provider 在默认助手中没有真实凭据
          // 回退到默认助手的默认模型所属 provider 的凭据
          realEntry = findRealProfileForProvider(defaultAgentDefaultProvider);
          if (realEntry) {
            console.log(
              `[Models] Provider ${providerId} has no real credential; falling back to default agent's default model provider (${defaultAgentDefaultProvider})`,
            );
          }
        }

        if (realEntry) {
          const [realProfileId, realProfile] = realEntry;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rp = realProfile;
          if (rp.type === "oauth" || rp.type === "token") {
            managedProfiles[realProfileId] = rp;
          } else {
            managedProfiles[realProfileId] = {
              type: "api_key",
              provider: rp.provider,
              key: rp.key,
              ...(rp.baseUrl && { baseUrl: rp.baseUrl }),
            };
          }
          console.log(
            `[Models] Resolved placeholder for ${providerId} → using profile: ${realProfileId} (provider: ${rp.provider})`,
          );
        } else {
          console.log(
            `[Models] Skipping placeholder for provider: ${providerId} (auth: ${auth.name}) - no fallback credential available`,
          );
        }
      }
    }
  }

  // ── Step 3: 扫描所有 agents/<agentId>/agent/ 目录 ──
  const agentsBaseDir = path.join(STATE_DIR, "agents");
  const authProfilePaths: string[] = [];
  try {
    const agentDirs = await fs.readdir(agentsBaseDir);
    for (const agentId of agentDirs) {
      const agentAuthPath = path.join(agentsBaseDir, agentId, "agent", "auth-profiles.json");
      try {
        await fs.access(agentAuthPath);
        authProfilePaths.push(agentAuthPath);
      } catch {
        // 该 agent 没有 auth-profiles.json，跳过
      }
    }
  } catch {
    // agents 目录不存在，退回到 main agent
  }

  // 确保 main agent 路径始终包含（即使目录刚创建还没有文件）
  const mainAuthPath = path.join(mainAgentDir, "auth-profiles.json");
  if (!authProfilePaths.includes(mainAuthPath)) {
    authProfilePaths.push(mainAuthPath);
  }

  // ── Step 4: 对每个 agent 目录执行合并写入 ──
  for (const authProfilesPath of authProfilePaths) {
    // 读取现有文件（保留真实凭据）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existing: any = { version: 1, profiles: {} };
    try {
      const raw = await fs.readFile(authProfilesPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.profiles) {
        existing = parsed;
      }
    } catch {
      // 文件不存在或解析失败，从空开始
    }

    // 合并策略：
    // 1. 保留现有文件中所有 type: "oauth" / type: "token" 的 profile（上游 OAuth 凭据）
    // 2. 保留现有文件中 type: "api_key" 且 key 不是占位符的 profile
    // 3. 用 managedProfiles 覆盖/新增对应条目（包含从默认助手补充的真实凭据）
    const mergedProfiles: Record<string, unknown> = {};

    // 先把现有的真实凭据放进去
    for (const [pid, profile] of Object.entries(existing.profiles ?? {})) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = profile as any;
      if (p.type === "oauth" || p.type === "token") {
        mergedProfiles[pid] = p;
      } else if (p.type === "api_key") {
        const existingKey = p.key?.trim() ?? "";
        const isExistingPlaceholder =
          !existingKey || /^[a-z0-9-]+-oauth$/i.test(existingKey) || existingKey === "placeholder";
        if (!isExistingPlaceholder) {
          mergedProfiles[pid] = p;
        }
        // 占位符丢弃
      }
    }

    // 用 managedProfiles 覆盖/新增（包含从默认助手真实凭据补充的条目）
    for (const [pid, profile] of Object.entries(managedProfiles)) {
      mergedProfiles[pid] = profile;
    }

    const result = {
      version: existing.version ?? 1,
      profiles: mergedProfiles,
      ...(existing.order && { order: existing.order }),
      ...(existing.lastGood && { lastGood: existing.lastGood }),
      ...(existing.usageStats && { usageStats: existing.usageStats }),
    };

    await fs.mkdir(path.dirname(authProfilesPath), { recursive: true });
    await fs.writeFile(authProfilesPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(
      `[Models] Merged auth-profiles.json: ${authProfilesPath} (${Object.keys(mergedProfiles).length} profiles)`,
    );
  }
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
  dispatchPolicy?: AuthDispatchPolicy;
  quotaCycle?: AuthQuotaCycle | null;
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
    dispatchPolicy: params.dispatchPolicy,
    // 周期配置：自动设置 cycleStartMs 为当前时间
    quotaCycle: params.quotaCycle ? { ...params.quotaCycle, cycleStartMs: Date.now() } : undefined,
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
  dispatchPolicy?: AuthDispatchPolicy | null;
  quotaCycle?: AuthQuotaCycle | null;
  autoDisabledReason?: "billing_exhausted" | "auth_failure" | null;
}): Promise<void> {
  const storage = await loadModelManagement();

  for (const provider in storage.auths) {
    const auth = storage.auths[provider]?.find((a) => a.authId === params.authId);
    if (auth) {
      // 周期配额耗尽时禁止手动启用
      // 逐辑：如果用户要求启用（enabled=true）且该认证当前周期配额耗尽，拒绝操作
      // 除非同时传了新的 quotaCycle（用户更改了套餐配置，重新计算周期）
      const quotaCycleChanged = params.quotaCycle !== undefined;
      if (params.enabled === true && isQuotaCycleExhausted(params.authId) && !quotaCycleChanged) {
        throw new Error(
          `该认证当前周期套餐配额已耗尽，无法手动启用。` +
            `请等周期自动恢复，或修改套餐配置重新计算周期。`,
        );
      }

      if (params.name !== undefined) {
        auth.name = params.name;
      }
      if (params.apiKey !== undefined && params.apiKey !== "") {
        auth.apiKey = params.apiKey;
        // 用户更换了新的 API Key，自动清除自动禁用原因（新 key 应被视为有效）
        if (auth.autoDisabledReason) {
          delete auth.autoDisabledReason;
        }
      }
      if (params.baseUrl !== undefined) {
        auth.baseUrl = params.baseUrl;
      }
      if (params.enabled !== undefined) {
        auth.enabled = params.enabled;
        // 用户手动启用时，同时清除自动禁用原因（表示用户已知晓并解决了问题）
        if (params.enabled && auth.autoDisabledReason && params.autoDisabledReason === undefined) {
          delete auth.autoDisabledReason;
        }
      }
      if (params.autoDisabledReason !== undefined) {
        if (params.autoDisabledReason === null) {
          delete auth.autoDisabledReason;
        } else {
          auth.autoDisabledReason = params.autoDisabledReason;
        }
      }
      if (params.dispatchPolicy !== undefined) {
        auth.dispatchPolicy = params.dispatchPolicy ?? undefined;
      }

      // 周期配额配置更新：将新配置保存，并清除当前耗尽状态重新计算周期
      if (quotaCycleChanged) {
        if (params.quotaCycle === null) {
          // 用户关闭周期配置，清除耗尽状态
          delete auth.quotaCycle;
          if (isQuotaCycleExhausted(params.authId)) {
            await clearQuotaCycleExhausted(params.authId);
            // 同时重置熔断器（如果周期耗尽导致熔断）
            resetAuthCircuit(params.authId);
            console.log(
              `[QuotaCycle] Auth "${auth.name}" quota cycle config removed. Clearing exhausted state.`,
            );
          }
        } else {
          // 用户更改了周期配置，重置 cycleStartMs 为当前时间（新周期开始）
          const newCycle: AuthQuotaCycle = {
            ...params.quotaCycle,
            cycleStartMs: Date.now(), // 重置周期起始点
          };
          auth.quotaCycle = newCycle;

          if (isQuotaCycleExhausted(params.authId)) {
            await clearQuotaCycleExhausted(params.authId);
            resetAuthCircuit(params.authId);
            console.log(
              `[QuotaCycle] Auth "${auth.name}" quota cycle config changed. ` +
                `Clearing exhausted state. New cycle: ${newCycle.type}, resetDay=${newCycle.resetDay}.`,
            );
          }

          // 如果该认证当前处于耗尽状态，更改周期配置后允许并启用
          if (params.enabled === undefined && !auth.enabled) {
            // 不自动启用，但解除耗尽锁定
          }
        }
      }

      await saveModelManagement(storage);
      return;
    }
  }
}

/**
 * 因 billing/auth 错误将无周期配额的认证标记为不可用（enabled=false）并持久化。
 *
 * 适用场景：该认证没有配置 quotaCycle（非周期性管理），但实际 API 调用返回了
 * billing 耗尽或鉴权失效错误，说明该 key 当前无法使用。
 * 系统将其持久化为 enabled=false，使其从路由中完全退出，直到用户手动重新启用。
 *
 * 注意：这是异步操作（写磁盘），使用 .catch() 防止影响主调用路径。
 */
export function disableAuthOnBillingOrAuthError(
  authId: string,
  reason: "billing_exhausted" | "auth_failure",
): void {
  if (!cachedStorage) {
    return;
  }
  // 找到该认证
  let foundAuth: ProviderAuth | undefined;
  for (const auths of Object.values(cachedStorage.auths)) {
    foundAuth = auths.find((a) => a.authId === authId);
    if (foundAuth) {
      break;
    }
  }
  if (!foundAuth || !foundAuth.enabled) {
    return;
  } // 已经禁用则跳过

  console.log(
    `[AuthDisable] Auth "${foundAuth.name}" (${authId}) disabled due to ${reason}. ` +
      `User must manually re-enable after resolving the issue.`,
  );

  // 立即更新内存缓存（确保本进程后续请求不再路由到此 key）
  foundAuth.enabled = false;
  foundAuth.autoDisabledReason = reason;

  // 异步持久化到磁盘（不阻塞调用方）
  updateAuth({ authId, enabled: false, autoDisabledReason: reason }).catch((err) => {
    console.error(`[AuthDisable] Failed to persist disabled state for auth ${authId}:`, err);
  });
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
          // 凭据熔断器快照（用于 UI 展示冷却状态）
          circuitBreakers: getCircuitBreakerSnapshot(),
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
      const { provider, name, apiKey, baseUrl, dispatchPolicy } = params as {
        provider: string;
        name: string;
        apiKey: string;
        baseUrl?: string;
        dispatchPolicy?: AuthDispatchPolicy;
      };

      if (!provider || !name || !apiKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const auth = await addAuth({ provider, name, apiKey, baseUrl, dispatchPolicy });
      respond(true, { auth }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 更新认证
  "models.auth.update": async ({ params, respond }) => {
    try {
      const { authId, name, apiKey, baseUrl, enabled, dispatchPolicy, quotaCycle } = params as {
        authId: string;
        name?: string;
        apiKey?: string;
        baseUrl?: string;
        enabled?: boolean;
        dispatchPolicy?: AuthDispatchPolicy | null;
        quotaCycle?: AuthQuotaCycle | null;
      };

      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }

      await updateAuth({ authId, name, apiKey, baseUrl, enabled, dispatchPolicy, quotaCycle });
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // 重置凭据熔断状态（手动解除冷却）
  "models.auth.resetCircuit": async ({ params, respond }) => {
    try {
      const { authId } = params as { authId: string };
      if (!authId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing authId"));
        return;
      }
      resetAuthCircuit(authId);
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
      // 新模型加入后强制刷新 Arena 基准数据
      void forceRefreshBenchmarkData().catch(() => {});
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
