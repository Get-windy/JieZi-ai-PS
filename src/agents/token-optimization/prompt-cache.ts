/**
 * 智能Prompt缓存系统
 * 参考Anthropic、OpenAI的Prompt Caching最佳实践
 * 可节省60-90%的重复token消耗
 */

import crypto from "node:crypto";
import type { TokenOptimizationConfig } from "./config.js";

/**
 * 缓存条目
 */
type CacheEntry = {
  content: string;
  hash: string;
  tokenCount: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
};

/**
 * Prompt缓存管理器
 */
export class PromptCacheManager {
  private systemPromptCache: Map<string, CacheEntry> = new Map();
  private toolSchemaCache: Map<string, CacheEntry> = new Map();
  private workspaceFileCache: Map<string, CacheEntry> = new Map();
  private config: TokenOptimizationConfig;

  constructor(config: TokenOptimizationConfig) {
    this.config = config;
    this.startCleanupTask();
  }

  /**
   * 计算内容哈希
   */
  private computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * 估算token数量
   */
  private estimateTokens(content: string): number {
    // 简单估算：4字符 ≈ 1 token
    return Math.ceil(content.length / 4);
  }

  /**
   * 缓存系统提示词
   */
  cacheSystemPrompt(content: string): { cached: boolean; hash: string; savedTokens: number } {
    if (!this.config.promptCaching?.cacheSystemPrompt) {
      return { cached: false, hash: "", savedTokens: 0 };
    }

    const hash = this.computeHash(content);
    const tokenCount = this.estimateTokens(content);
    const minTokens = this.config.promptCaching?.minCacheTokens ?? 1024;

    if (tokenCount < minTokens) {
      return { cached: false, hash, savedTokens: 0 };
    }

    const existing = this.systemPromptCache.get(hash);
    if (existing) {
      // 缓存命中
      existing.lastAccessed = Date.now();
      existing.accessCount++;
      return { cached: true, hash, savedTokens: tokenCount };
    }

    // 新建缓存
    this.systemPromptCache.set(hash, {
      content,
      hash,
      tokenCount,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
    });

    return { cached: false, hash, savedTokens: 0 };
  }

  /**
   * 缓存工具Schema
   */
  cacheToolSchemas(schemas: Record<string, unknown>): {
    cached: boolean;
    hash: string;
    savedTokens: number;
  } {
    if (!this.config.promptCaching?.cacheToolSchemas) {
      return { cached: false, hash: "", savedTokens: 0 };
    }

    const content = JSON.stringify(schemas);
    const hash = this.computeHash(content);
    const tokenCount = this.estimateTokens(content);

    const existing = this.toolSchemaCache.get(hash);
    if (existing) {
      existing.lastAccessed = Date.now();
      existing.accessCount++;
      return { cached: true, hash, savedTokens: tokenCount };
    }

    this.toolSchemaCache.set(hash, {
      content,
      hash,
      tokenCount,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
    });

    return { cached: false, hash, savedTokens: 0 };
  }

  /**
   * 缓存workspace文件
   */
  cacheWorkspaceFile(
    filePath: string,
    content: string,
  ): {
    cached: boolean;
    hash: string;
    savedTokens: number;
  } {
    if (!this.config.promptCaching?.cacheWorkspaceFiles) {
      return { cached: false, hash: "", savedTokens: 0 };
    }

    const hash = this.computeHash(`${filePath}:${content}`);
    const tokenCount = this.estimateTokens(content);

    const existing = this.workspaceFileCache.get(hash);
    if (existing) {
      existing.lastAccessed = Date.now();
      existing.accessCount++;
      return { cached: true, hash, savedTokens: tokenCount };
    }

    this.workspaceFileCache.set(hash, {
      content,
      hash,
      tokenCount,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
    });

    return { cached: false, hash, savedTokens: 0 };
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    systemPrompts: number;
    toolSchemas: number;
    workspaceFiles: number;
    totalCached: number;
    totalSavedTokens: number;
    hitRate: number;
  } {
    const systemPrompts = this.systemPromptCache.size;
    const toolSchemas = this.toolSchemaCache.size;
    const workspaceFiles = this.workspaceFileCache.size;
    const totalCached = systemPrompts + toolSchemas + workspaceFiles;

    let totalSavedTokens = 0;
    let totalAccess = 0;
    let totalHits = 0;

    const countStats = (cache: Map<string, CacheEntry>) => {
      for (const entry of cache.values()) {
        totalAccess += entry.accessCount;
        if (entry.accessCount > 1) {
          totalHits += entry.accessCount - 1;
          totalSavedTokens += entry.tokenCount * (entry.accessCount - 1);
        }
      }
    };

    countStats(this.systemPromptCache);
    countStats(this.toolSchemaCache);
    countStats(this.workspaceFileCache);

    const hitRate = totalAccess > 0 ? totalHits / totalAccess : 0;

    return {
      systemPrompts,
      toolSchemas,
      workspaceFiles,
      totalCached,
      totalSavedTokens,
      hitRate,
    };
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const ttlMs = (this.config.promptCaching?.cacheTTLMinutes ?? 5) * 60 * 1000;
    const now = Date.now();

    const cleanupCache = (cache: Map<string, CacheEntry>) => {
      for (const [hash, entry] of cache.entries()) {
        if (now - entry.lastAccessed > ttlMs) {
          cache.delete(hash);
        }
      }
    };

    cleanupCache(this.systemPromptCache);
    cleanupCache(this.toolSchemaCache);
    cleanupCache(this.workspaceFileCache);
  }

  /**
   * 启动定时清理任务
   */
  private startCleanupTask(): void {
    const intervalMs = 60 * 1000; // 每分钟清理一次
    setInterval(() => this.cleanup(), intervalMs);
  }

  /**
   * 清空所有缓存
   */
  clearAll(): void {
    this.systemPromptCache.clear();
    this.toolSchemaCache.clear();
    this.workspaceFileCache.clear();
  }
}

/**
 * 全局缓存管理器实例
 */
let globalCacheManager: PromptCacheManager | null = null;

/**
 * 获取或创建全局缓存管理器
 */
export function getPromptCacheManager(config: TokenOptimizationConfig): PromptCacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new PromptCacheManager(config);
  }
  return globalCacheManager;
}

/**
 * 为Anthropic格式化缓存控制标记
 * 参考：https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export function formatAnthropicCacheControl(
  content: string,
  type: "ephemeral",
): Array<{ type: string; text: string; cache_control?: { type: string } }> {
  return [
    {
      type: "text",
      text: content,
      cache_control: { type },
    },
  ];
}

/**
 * 检查是否支持缓存的供应商
 */
export function supportsPromptCaching(provider: string, modelId: string): boolean {
  const supportedProviders: Record<string, string[]> = {
    anthropic: ["claude-opus", "claude-sonnet", "claude-haiku"],
    openai: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    // 更多供应商可以在这里添加
  };

  const models = supportedProviders[provider.toLowerCase()];
  if (!models) {
    return false;
  }

  const modelLower = modelId.toLowerCase();
  return models.some((pattern) => modelLower.includes(pattern));
}
