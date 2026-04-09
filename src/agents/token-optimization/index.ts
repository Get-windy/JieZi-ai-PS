/**
 * Token优化系统主入口
 * 整合所有优化策略，提供统一接口
 */

export * from "./config.js";
export * from "./prompt-cache.js";
export * from "./smart-router.js";
export * from "./context-optimizer.js";
export * from "./budget-manager.js";
export * from "./context-entropy.js";

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { BudgetManager, type BudgetStatus } from "./budget-manager.js";
import {
  DEFAULT_TOKEN_OPTIMIZATION,
  AGGRESSIVE_TOKEN_OPTIMIZATION,
  QUALITY_FIRST_TOKEN_OPTIMIZATION,
  type TokenOptimizationConfig,
  type TokenUsageStats,
} from "./config.js";
import {
  ContextEntropyManager,
  buildPrefixSnapshot,
  getContextEntropyManager,
  type CacheDecision,
  type EntropyAnalysis,
} from "./context-entropy.js";
import { ContextOptimizer } from "./context-optimizer.js";
import { PromptCacheManager, getPromptCacheManager } from "./prompt-cache.js";
import { SmartModelRouter, type TaskAnalysis } from "./smart-router.js";

/**
 * Token优化系统主类
 */
export class TokenOptimizationSystem {
  private config: TokenOptimizationConfig;
  private cacheManager: PromptCacheManager;
  private router: SmartModelRouter;
  private optimizer: ContextOptimizer;
  private budgetManager: BudgetManager;
  private entropyManager: ContextEntropyManager;

  constructor(config?: TokenOptimizationConfig) {
    this.config = config ?? DEFAULT_TOKEN_OPTIMIZATION;
    this.cacheManager = getPromptCacheManager(this.config);
    this.router = new SmartModelRouter(this.config);
    this.optimizer = new ContextOptimizer(this.config);
    this.budgetManager = new BudgetManager(this.config);
    this.entropyManager = getContextEntropyManager();
  }

  /**
   * 分析任务并返回优化建议
   */
  analyzeAndOptimize(params: {
    userMessage: string;
    conversationHistory?: AgentMessage[];
    systemPrompt?: string;
    toolSchemas?: Record<string, unknown>;
    workspaceFiles?: Record<string, string>;
  }): {
    taskAnalysis: TaskAnalysis;
    cacheStats: {
      systemPromptCached: boolean;
      toolSchemasCached: boolean;
      savedTokens: number;
    };
    optimizationStats: {
      schemaSavedTokens: number;
      filesSavedTokens: number;
      totalSavedTokens: number;
    };
    budgetStatus: BudgetStatus;
    recommendations: string[];
  } {
    const recommendations: string[] = [];

    // 1. 智能路由分析
    const taskAnalysis = this.router.analyzeTask({
      userMessage: params.userMessage,
      conversationHistory: params.conversationHistory,
    });

    if (taskAnalysis.recommendedModel !== "gpt-4o") {
      recommendations.push(
        `建议使用 ${taskAnalysis.recommendedModel} 模型（${taskAnalysis.reasoning}）`,
      );
    }

    // 2. Prompt缓存
    let systemPromptCached = false;
    let toolSchemasCached = false;
    let cachedSavedTokens = 0;

    if (params.systemPrompt) {
      const result = this.cacheManager.cacheSystemPrompt(params.systemPrompt);
      systemPromptCached = result.cached;
      cachedSavedTokens += result.savedTokens;
    }

    if (params.toolSchemas) {
      const result = this.cacheManager.cacheToolSchemas(params.toolSchemas);
      toolSchemasCached = result.cached;
      cachedSavedTokens += result.savedTokens;
    }

    // 3. 上下文优化
    let schemaSavedTokens = 0;
    let filesSavedTokens = 0;

    if (params.toolSchemas) {
      const result = this.optimizer.compressToolSchemas(params.toolSchemas);
      schemaSavedTokens = result.savedTokens;
      if (result.savedPercentage > 20) {
        recommendations.push(`Schema压缩可节省 ${result.savedPercentage.toFixed(1)}% token`);
      }
    }

    if (params.workspaceFiles) {
      for (const [, content] of Object.entries(params.workspaceFiles)) {
        const result = this.optimizer.compressWorkspaceFile(content);
        filesSavedTokens += result.savedTokens;
      }
    }

    // 4. 预算检查
    const budgetStatus = this.budgetManager.checkBudget();

    if (budgetStatus.warnings.length > 0) {
      recommendations.push(...budgetStatus.warnings);
    }

    if (budgetStatus.recommendedAction) {
      recommendations.push(`💡 ${budgetStatus.recommendedAction}`);
    }

    return {
      taskAnalysis,
      cacheStats: {
        systemPromptCached,
        toolSchemasCached,
        savedTokens: cachedSavedTokens,
      },
      optimizationStats: {
        schemaSavedTokens,
        filesSavedTokens,
        totalSavedTokens: cachedSavedTokens + schemaSavedTokens + filesSavedTokens,
      },
      budgetStatus,
      recommendations,
    };
  }

  /**
   * 记录token使用
   */
  async recordTokenUsage(usage: TokenUsageStats, modelId: string): Promise<void> {
    await this.budgetManager.recordUsage(usage, modelId);
  }

  /**
   * 使用 Context Entropy 管理器进行缓存决策
   * 在每次请求前调用，判断是否需要 BREAK 缓存前缀
   */
  checkCacheDecision(params: {
    systemPrompt: string;
    toolSchemas: Record<string, unknown>;
    modelId: string;
    providerId: string;
    promptMode: string;
    workspaceDir: string;
    ownerNumbers?: string[];
    channelId?: string;
  }): { decision: CacheDecision; report: string } {
    const snapshot = buildPrefixSnapshot(params);
    const vectors = this.entropyManager.detectChanges({
      systemPromptHash: snapshot.systemPromptHash,
      toolSchemasHash: snapshot.toolSchemasHash,
      modelId: snapshot.modelId,
      providerId: snapshot.providerId,
      promptMode: snapshot.promptMode,
      workspaceDir: snapshot.workspaceDir,
      ownerHash: snapshot.ownerHash,
      channelId: snapshot.channelId,
    });

    if (vectors.length === 0) {
      // 无变化，锁定（如果还没锁定）
      if (this.entropyManager.getLatchState() === "unlocked") {
        this.entropyManager.lockPrefix(snapshot);
      }
      return { decision: "KEEP", report: "缓存前缀无变化，维持 KEEP" };
    }

    const decision = this.entropyManager.processInvalidation(vectors, {
      previousValues: {},
      newValues: {},
      estimatedCacheTokens: Math.ceil(params.systemPrompt.length / 4),
    });

    if (decision === "BREAK") {
      // 重新锁定新快照
      this.entropyManager.lockPrefix(snapshot);
    }

    return {
      decision,
      report: `触发 ${vectors.length} 个失效向量: ${vectors.join(", ")} → 决策: ${decision}`,
    };
  }

  /**
   * 分析当前 context 的熵值，返回驱逐建议
   */
  analyzeContextEntropy(blocks: {
    systemPrompt?: string;
    toolSchemas?: string;
    messageHistory?: string;
    memoryContext?: string;
    skillContext?: string;
  }): EntropyAnalysis {
    return this.entropyManager.analyzeEntropy(blocks);
  }

  /**
   * 获取 Context Entropy 报告
   */
  getEntropyReport(): string {
    return this.entropyManager.generateReport();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * 获取预算报告
   */
  getBudgetReport(): string {
    return this.budgetManager.generateReport();
  }

  /**
   * 重置对话token计数
   */
  resetConversation(): void {
    this.budgetManager.resetConversationTokens();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TokenOptimizationConfig>): void {
    this.config = { ...this.config, ...config };
    this.router = new SmartModelRouter(this.config);
    this.optimizer = new ContextOptimizer(this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): TokenOptimizationConfig {
    return this.config;
  }
}

/**
 * 预设配置
 */
export const TOKEN_OPTIMIZATION_PRESETS = {
  default: DEFAULT_TOKEN_OPTIMIZATION,
  aggressive: AGGRESSIVE_TOKEN_OPTIMIZATION,
  qualityFirst: QUALITY_FIRST_TOKEN_OPTIMIZATION,
};

/**
 * 创建优化系统（单例）
 */
let globalOptimizationSystem: TokenOptimizationSystem | null = null;

export function getTokenOptimizationSystem(
  config?: TokenOptimizationConfig,
): TokenOptimizationSystem {
  if (!globalOptimizationSystem) {
    globalOptimizationSystem = new TokenOptimizationSystem(config);
  }
  return globalOptimizationSystem;
}

/**
 * 快速启用优化（便捷方法）
 */
export function enableTokenOptimization(
  preset: "default" | "aggressive" | "qualityFirst" = "default",
): TokenOptimizationSystem {
  const config = TOKEN_OPTIMIZATION_PRESETS[preset];
  return getTokenOptimizationSystem(config);
}
