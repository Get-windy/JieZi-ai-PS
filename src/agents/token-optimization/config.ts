/**
 * Token优化配置
 * 基于业界最佳实践（Cursor、Aider、Claude等）
 */

/** 任务复杂度枚举 */
export type TaskComplexity = "simple" | "medium" | "complex";

export type TokenOptimizationConfig = {
  /** 启用智能缓存（减少60-90%重复token消耗） */
  enablePromptCaching?: boolean;

  /** 启用智能模型路由（根据任务复杂度自动选择模型） */
  enableSmartRouting?: boolean;

  /** 启用上下文压缩优化 */
  enableContextOptimization?: boolean;

  /** 启用Token预算管理 */
  enableBudgetManagement?: boolean;

  /** Prompt缓存配置 */
  promptCaching?: {
    /** 启用系统提示词缓存 */
    cacheSystemPrompt?: boolean;
    /** 启用工具schema缓存 */
    cacheToolSchemas?: boolean;
    /** 启用workspace文件缓存 */
    cacheWorkspaceFiles?: boolean;
    /** 缓存最小token数（小于此数不缓存） */
    minCacheTokens?: number;
    /** 缓存过期时间（分钟） */
    cacheTTLMinutes?: number;
  };

  /** 智能路由配置 */
  smartRouting?: {
    /** 简单任务使用的小模型（如gpt-4o-mini） */
    simpleTaskModel?: string;
    /** 中等任务使用的模型（如gpt-4o） */
    mediumTaskModel?: string;
    /** 复杂任务使用的大模型（如o1） */
    complexTaskModel?: string;
    /** 任务复杂度阈值（token数） */
    complexityThresholds?: {
      simple?: number; // < 2000 tokens
      medium?: number; // < 8000 tokens
      complex?: number; // >= 8000 tokens
    };
    /** 基于关键词的路由规则 */
    keywordRules?: Array<{
      keywords: string[];
      preferredModel: string;
      description?: string;
    }>;
  };

  /** 上下文优化配置 */
  contextOptimization?: {
    /** 工具schema压缩：只包含必要字段 */
    compressToolSchemas?: boolean;
    /** 移除工具schema中的示例 */
    removeSchemaExamples?: boolean;
    /** 压缩workspace文件注入 */
    compressWorkspaceFiles?: boolean;
    /** 使用Markdown格式（比JSON节省70% token） */
    preferMarkdown?: boolean;
    /** 激进压缩模式（牺牲少量细节换取更多空间） */
    aggressiveMode?: boolean;
  };

  /** Token预算管理 */
  budgetManagement?: {
    /** 每日token预算 */
    dailyBudget?: number;
    /** 每次对话token预算 */
    perConversationBudget?: number;
    /** 预算警告阈值（百分比） */
    warningThreshold?: number; // 0.8 = 80%
    /** 超预算后的行为 */
    onBudgetExceeded?: "warn" | "block" | "fallback-to-smaller-model";
    /** 成本限制（美元） */
    costLimits?: {
      daily?: number;
      monthly?: number;
    };
  };
};

/**
 * 默认Token优化配置
 * 保守策略：优先保证质量，适度优化成本
 */
export const DEFAULT_TOKEN_OPTIMIZATION: TokenOptimizationConfig = {
  enablePromptCaching: true,
  enableSmartRouting: true,
  enableContextOptimization: true,
  enableBudgetManagement: false, // 默认不启用预算限制

  promptCaching: {
    cacheSystemPrompt: true,
    cacheToolSchemas: true,
    cacheWorkspaceFiles: true,
    minCacheTokens: 1024, // Anthropic推荐最小值
    cacheTTLMinutes: 5, // Anthropic默认5分钟
  },

  smartRouting: {
    simpleTaskModel: "gpt-4o-mini",
    mediumTaskModel: "gpt-4o",
    complexTaskModel: "o1-mini",
    complexityThresholds: {
      simple: 2000,
      medium: 8000,
      complex: 8000,
    },
    keywordRules: [
      {
        keywords: ["reasoning", "think", "analyze", "complex", "solve"],
        preferredModel: "o1-mini",
        description: "需要深度推理的任务",
      },
      {
        keywords: ["quick", "simple", "check", "status", "list"],
        preferredModel: "gpt-4o-mini",
        description: "简单查询任务",
      },
      {
        keywords: ["refactor", "architecture", "design", "optimize"],
        preferredModel: "gpt-4o",
        description: "架构和优化任务",
      },
    ],
  },

  contextOptimization: {
    compressToolSchemas: true,
    removeSchemaExamples: true,
    compressWorkspaceFiles: false, // 保守：保留完整文件
    preferMarkdown: true,
    aggressiveMode: false,
  },

  budgetManagement: {
    dailyBudget: 100000, // 100K tokens/day
    perConversationBudget: 50000, // 50K tokens/conversation
    warningThreshold: 0.8,
    onBudgetExceeded: "warn",
    costLimits: {
      daily: 5.0, // $5/day
      monthly: 150.0, // $150/month
    },
  },
};

/**
 * 激进优化配置
 * 最大化节省成本，适合高频使用场景
 */
export const AGGRESSIVE_TOKEN_OPTIMIZATION: TokenOptimizationConfig = {
  ...DEFAULT_TOKEN_OPTIMIZATION,
  enableBudgetManagement: true,

  smartRouting: {
    ...DEFAULT_TOKEN_OPTIMIZATION.smartRouting,
    // 更激进地使用小模型
    simpleTaskModel: "gpt-4o-mini",
    mediumTaskModel: "gpt-4o-mini",
    complexTaskModel: "gpt-4o",
  },

  contextOptimization: {
    compressToolSchemas: true,
    removeSchemaExamples: true,
    compressWorkspaceFiles: true, // 激进：压缩文件
    preferMarkdown: true,
    aggressiveMode: true,
  },

  budgetManagement: {
    ...DEFAULT_TOKEN_OPTIMIZATION.budgetManagement,
    onBudgetExceeded: "fallback-to-smaller-model",
  },
};

/**
 * 质量优先配置
 * 优先保证质量，成本次要
 */
export const QUALITY_FIRST_TOKEN_OPTIMIZATION: TokenOptimizationConfig = {
  enablePromptCaching: true,
  enableSmartRouting: false, // 不启用自动路由
  enableContextOptimization: false, // 不压缩上下文
  enableBudgetManagement: false,

  promptCaching: {
    cacheSystemPrompt: true,
    cacheToolSchemas: true,
    cacheWorkspaceFiles: true,
    minCacheTokens: 1024,
    cacheTTLMinutes: 5,
  },
};

/**
 * Token使用统计
 */
export type TokenUsageStats = {
  input: number;
  output: number;
  total: number;
  cached?: number; // 缓存节省的token数
  cost?: number;
  timestamp: number;
};

/**
 * 模型成本数据库（美元/1M tokens）
 */
export const MODEL_COSTS = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0, cached: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075 },
  o1: { input: 15.0, output: 60.0 },
  "o1-mini": { input: 3.0, output: 12.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5, cached: 0.25 },

  // Anthropic
  "claude-opus-4": { input: 15.0, output: 75.0, cached: 1.5 },
  "claude-sonnet-4": { input: 3.0, output: 15.0, cached: 0.3 },
  "claude-haiku-4": { input: 0.25, output: 1.25, cached: 0.025 },

  // Google
  "gemini-2.0-flash-exp": { input: 0, output: 0 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },

  // DeepSeek
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
} as const;
