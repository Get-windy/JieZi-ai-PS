/**
 * Context Entropy 主动管理系统
 *
 * 受 Claude Code 泄露源码 promptCacheBreakDetection.ts 启发实现。
 * 核心理念：Prompt 缓存不是顺便优化，而是需要主动管理的成本中心。
 *
 * 实现了：
 * 1. 14个缓存失效向量追踪
 * 2. Sticky Latch 机制（防止模式切换破坏已缓存的 Prompt 前缀）
 * 3. 上下文熵值计算（量化 context 信息密度，决定驱逐优先级）
 * 4. KEEP / BREAK 显式决策引擎
 */

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 14 个缓存失效向量 */
export type CacheInvalidationVector =
  | "mode_switch" // 1. 模式切换（如 full→minimal）
  | "tool_change" // 2. 工具集变化
  | "context_rotate" // 3. 上下文文件轮换
  | "system_prompt_edit" // 4. System prompt 内容修改
  | "model_change" // 5. 模型切换
  | "provider_change" // 6. 供应商切换
  | "session_start" // 7. 新 session 开始
  | "memory_update" // 8. 记忆文件更新
  | "skill_inject" // 9. Skill 注入/替换
  | "owner_change" // 10. 授权用户变更
  | "workspace_change" // 11. 工作空间路径变更
  | "reasoning_toggle" // 12. 推理模式切换
  | "channel_change" // 13. 通道变更
  | "schema_version"; // 14. Schema 版本变更

/** Sticky Latch 状态 */
export type LatchState = "locked" | "unlocked" | "pending_break";

/** 缓存决策结果 */
export type CacheDecision = "KEEP" | "BREAK" | "DEFER";

/** 缓存失效事件 */
export type InvalidationEvent = {
  vector: CacheInvalidationVector;
  detectedAt: number;
  previousValue: string;
  newValue: string;
  severity: "low" | "medium" | "high" | "critical";
};

/** 上下文熵值分析结果 */
export type EntropyAnalysis = {
  /** 整体熵值 0.0-1.0，越高表示信息越密集 */
  entropy: number;
  /** 各区块熵值明细 */
  breakdown: {
    systemPrompt: number;
    toolSchemas: number;
    messageHistory: number;
    memoryContext: number;
    skillContext: number;
  };
  /** 建议驱逐的区块（按优先级排序） */
  evictionCandidates: Array<{
    block: string;
    reason: string;
    estimatedSavedTokens: number;
  }>;
  /** 当前 context 窗口使用率 0.0-1.0 */
  utilizationRate: number;
};

/** Prompt 前缀快照（用于 Sticky Latch 比较） */
type PromptPrefixSnapshot = {
  systemPromptHash: string;
  toolSchemasHash: string;
  modelId: string;
  providerId: string;
  promptMode: string;
  workspaceDir: string;
  ownerHash: string;
  channelId: string;
  snapshotAt: number;
};

/** 失效向量统计 */
type VectorStats = {
  count: number;
  lastTriggeredAt: number;
  costImpact: number; // 估算影响的 token 数
};

// ─────────────────────────────────────────────
// 向量严重性映射
// ─────────────────────────────────────────────

const VECTOR_SEVERITY: Record<CacheInvalidationVector, InvalidationEvent["severity"]> = {
  mode_switch: "critical", // 破坏全部前缀
  model_change: "critical", // 不同模型缓存不兼容
  provider_change: "critical", // 供应商缓存完全独立
  system_prompt_edit: "high", // 直接修改核心缓存块
  tool_change: "high", // 工具集变化影响 schema 缓存
  session_start: "high", // 新 session 无缓存
  workspace_change: "medium", // 部分上下文变化
  memory_update: "medium", // 记忆内容变化
  skill_inject: "medium", // Skill 上下文变化
  reasoning_toggle: "medium", // 推理 token 影响
  schema_version: "low", // Schema 格式小变化
  context_rotate: "low", // 上下文文件轮换
  owner_change: "low", // 授权用户变化
  channel_change: "low", // 通道变化影响有限
};

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function simpleHash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function estimateTokens(text: string): number {
  // 按 4字符/token 估算，中文按 2字符/token
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    tokens += code > 0x7f ? 0.5 : 0.25; // 中文字符更密集
  }
  return Math.ceil(tokens);
}

/** 计算文本信息熵（Shannon entropy） */
function computeShannontEntropy(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  const freq: Record<string, number> = {};
  for (const ch of text) {
    freq[ch] = (freq[ch] ?? 0) + 1;
  }
  let entropy = 0;
  const len = text.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  // 归一化到 0-1（最大理论熵约为 log2(256) ≈ 8）
  return Math.min(entropy / 8, 1);
}

// ─────────────────────────────────────────────
// 核心：Context Entropy Manager
// ─────────────────────────────────────────────

export class ContextEntropyManager {
  /** 当前 Sticky Latch 状态 */
  private latchState: LatchState = "unlocked";

  /** 当前锁定的前缀快照 */
  private lockedSnapshot: PromptPrefixSnapshot | null = null;

  /** 各向量的统计数据 */
  private vectorStats: Map<CacheInvalidationVector, VectorStats> = new Map();

  /** 最近触发的失效事件（最多保留 100 条） */
  private recentEvents: InvalidationEvent[] = [];

  /** 待决策的 break 向量（Sticky Latch pending 状态） */
  private pendingBreakVectors: Set<CacheInvalidationVector> = new Set();

  /** context 最大 token 容量（默认 128K） */
  private maxContextTokens: number;

  /** 强制 break 的最小时间间隔（ms），防止频繁切换 */
  private readonly LATCH_HOLD_MIN_MS = 2000;
  private lastBreakAt = 0;

  constructor(opts?: { maxContextTokens?: number }) {
    this.maxContextTokens = opts?.maxContextTokens ?? 128_000;
  }

  // ─────────────────────────────────────────────
  // Sticky Latch 核心逻辑
  // ─────────────────────────────────────────────

  /**
   * 尝试锁定 Prompt 前缀快照。
   * 锁定后，任何变化都会先进入 pending 状态，经决策后才真正 BREAK。
   */
  lockPrefix(snapshot: PromptPrefixSnapshot): void {
    this.lockedSnapshot = snapshot;
    this.latchState = "locked";
    this.pendingBreakVectors.clear();
  }

  /**
   * 检测当前快照与锁定快照的差异，返回触发的失效向量列表。
   */
  detectChanges(current: Partial<PromptPrefixSnapshot>): CacheInvalidationVector[] {
    if (!this.lockedSnapshot || this.latchState === "unlocked") {
      return [];
    }

    const triggered: CacheInvalidationVector[] = [];
    const s = this.lockedSnapshot;

    if (current.modelId !== undefined && current.modelId !== s.modelId) {
      triggered.push("model_change");
    }
    if (current.providerId !== undefined && current.providerId !== s.providerId) {
      triggered.push("provider_change");
    }
    if (current.promptMode !== undefined && current.promptMode !== s.promptMode) {
      triggered.push("mode_switch");
    }
    if (current.systemPromptHash !== undefined && current.systemPromptHash !== s.systemPromptHash) {
      triggered.push("system_prompt_edit");
    }
    if (current.toolSchemasHash !== undefined && current.toolSchemasHash !== s.toolSchemasHash) {
      triggered.push("tool_change");
    }
    if (current.workspaceDir !== undefined && current.workspaceDir !== s.workspaceDir) {
      triggered.push("workspace_change");
    }
    if (current.ownerHash !== undefined && current.ownerHash !== s.ownerHash) {
      triggered.push("owner_change");
    }
    if (current.channelId !== undefined && current.channelId !== s.channelId) {
      triggered.push("channel_change");
    }

    return triggered;
  }

  /**
   * 处理失效向量，更新 Sticky Latch 状态并记录事件。
   * 返回最终的缓存决策。
   */
  processInvalidation(
    vectors: CacheInvalidationVector[],
    context: {
      previousValues: Partial<Record<CacheInvalidationVector, string>>;
      newValues: Partial<Record<CacheInvalidationVector, string>>;
      estimatedCacheTokens?: number;
    },
  ): CacheDecision {
    if (vectors.length === 0) {
      return "KEEP";
    }

    // 记录事件
    for (const vector of vectors) {
      const event: InvalidationEvent = {
        vector,
        detectedAt: Date.now(),
        previousValue: context.previousValues[vector] ?? "",
        newValue: context.newValues[vector] ?? "",
        severity: VECTOR_SEVERITY[vector],
      };
      this.recentEvents.push(event);
      if (this.recentEvents.length > 100) {
        this.recentEvents.shift();
      }

      // 更新统计
      const existing = this.vectorStats.get(vector);
      this.vectorStats.set(vector, {
        count: (existing?.count ?? 0) + 1,
        lastTriggeredAt: Date.now(),
        costImpact: (existing?.costImpact ?? 0) + (context.estimatedCacheTokens ?? 0),
      });
    }

    // 决策逻辑：有 critical/high 向量时直接 BREAK
    const hasCritical = vectors.some((v) => VECTOR_SEVERITY[v] === "critical");
    const hasHigh = vectors.some((v) => VECTOR_SEVERITY[v] === "high");

    if (hasCritical) {
      return this._executeBreak(vectors);
    }

    if (hasHigh) {
      // Sticky Latch：高严重性进入 pending，等待最小保持时间过去
      const now = Date.now();
      const timeSinceLastBreak = now - this.lastBreakAt;
      if (timeSinceLastBreak < this.LATCH_HOLD_MIN_MS) {
        // 还在保持期内，先 defer
        for (const v of vectors) {
          this.pendingBreakVectors.add(v);
        }
        this.latchState = "pending_break";
        return "DEFER";
      }
      return this._executeBreak(vectors);
    }

    // low/medium：添加到 pending，不立即 break
    for (const v of vectors) {
      this.pendingBreakVectors.add(v);
    }
    if (this.pendingBreakVectors.size >= 3) {
      // 累积了足够多的低严重性变化，触发 break
      return this._executeBreak([...this.pendingBreakVectors]);
    }

    this.latchState = this.pendingBreakVectors.size > 0 ? "pending_break" : "locked";
    return "KEEP";
  }

  private _executeBreak(_vectors: CacheInvalidationVector[]): CacheDecision {
    this.latchState = "unlocked";
    this.lockedSnapshot = null;
    this.pendingBreakVectors.clear();
    this.lastBreakAt = Date.now();
    return "BREAK";
  }

  /** 强制释放 latch（如 session 结束时） */
  releaseLatch(): void {
    this.latchState = "unlocked";
    this.lockedSnapshot = null;
    this.pendingBreakVectors.clear();
  }

  // ─────────────────────────────────────────────
  // Context Entropy 分析
  // ─────────────────────────────────────────────

  /**
   * 分析当前 context 的熵值，返回详细分析和驱逐建议。
   */
  analyzeEntropy(blocks: {
    systemPrompt?: string;
    toolSchemas?: string;
    messageHistory?: string;
    memoryContext?: string;
    skillContext?: string;
  }): EntropyAnalysis {
    const blockEntropies = {
      systemPrompt: computeShannontEntropy(blocks.systemPrompt ?? ""),
      toolSchemas: computeShannontEntropy(blocks.toolSchemas ?? ""),
      messageHistory: computeShannontEntropy(blocks.messageHistory ?? ""),
      memoryContext: computeShannontEntropy(blocks.memoryContext ?? ""),
      skillContext: computeShannontEntropy(blocks.skillContext ?? ""),
    };

    const blockTokens = {
      systemPrompt: estimateTokens(blocks.systemPrompt ?? ""),
      toolSchemas: estimateTokens(blocks.toolSchemas ?? ""),
      messageHistory: estimateTokens(blocks.messageHistory ?? ""),
      memoryContext: estimateTokens(blocks.memoryContext ?? ""),
      skillContext: estimateTokens(blocks.skillContext ?? ""),
    };

    const totalTokens = Object.values(blockTokens).reduce((a, b) => a + b, 0);
    const utilizationRate = Math.min(totalTokens / this.maxContextTokens, 1);

    // 加权整体熵（大块权重更高）
    let weightedEntropy = 0;
    let totalWeight = 0;
    for (const [key, tokens] of Object.entries(blockTokens)) {
      const entropy = blockEntropies[key as keyof typeof blockEntropies];
      weightedEntropy += entropy * tokens;
      totalWeight += tokens;
    }
    const overallEntropy = totalWeight > 0 ? weightedEntropy / totalWeight : 0;

    // 生成驱逐候选（优先驱逐低熵大块 = 信息冗余大）
    const evictionCandidates: EntropyAnalysis["evictionCandidates"] = [];

    // messageHistory 是最常见的膨胀源
    if (blockTokens.messageHistory > 8000) {
      evictionCandidates.push({
        block: "messageHistory",
        reason: `消息历史过长（${blockTokens.messageHistory} tokens），建议截断早期轮次`,
        estimatedSavedTokens: Math.floor(blockTokens.messageHistory * 0.4),
      });
    }

    // toolSchemas 低熵说明大量重复/冗余字段
    if (blockEntropies.toolSchemas < 0.3 && blockTokens.toolSchemas > 2000) {
      evictionCandidates.push({
        block: "toolSchemas",
        reason: `工具 Schema 信息密度低（熵值 ${blockEntropies.toolSchemas.toFixed(2)}），建议压缩`,
        estimatedSavedTokens: Math.floor(blockTokens.toolSchemas * 0.5),
      });
    }

    // memoryContext 过大时建议使用渐进披露
    if (blockTokens.memoryContext > 3000) {
      evictionCandidates.push({
        block: "memoryContext",
        reason: `记忆上下文过大（${blockTokens.memoryContext} tokens），建议启用渐进披露`,
        estimatedSavedTokens: Math.floor(blockTokens.memoryContext * 0.6),
      });
    }

    // 整体使用率过高时告警
    if (utilizationRate > 0.85) {
      evictionCandidates.push({
        block: "all",
        reason: `Context 使用率达 ${(utilizationRate * 100).toFixed(1)}%，接近上限，建议立即压缩`,
        estimatedSavedTokens: Math.floor(totalTokens * 0.3),
      });
    }

    // 按节省 token 数排序
    evictionCandidates.sort((a, b) => b.estimatedSavedTokens - a.estimatedSavedTokens);

    return {
      entropy: overallEntropy,
      breakdown: blockEntropies,
      evictionCandidates,
      utilizationRate,
    };
  }

  // ─────────────────────────────────────────────
  // 统计与诊断
  // ─────────────────────────────────────────────

  getLatchState(): LatchState {
    return this.latchState;
  }

  getPendingBreakVectors(): CacheInvalidationVector[] {
    return [...this.pendingBreakVectors];
  }

  getVectorStats(): Map<CacheInvalidationVector, VectorStats> {
    return new Map(this.vectorStats);
  }

  getRecentEvents(limit = 20): InvalidationEvent[] {
    return this.recentEvents.slice(-limit);
  }

  /** 获取高成本失效向量排行（用于诊断） */
  getTopCostVectors(
    topN = 5,
  ): Array<{ vector: CacheInvalidationVector; totalCost: number; count: number }> {
    const result: Array<{ vector: CacheInvalidationVector; totalCost: number; count: number }> = [];
    for (const [vector, stats] of this.vectorStats.entries()) {
      result.push({ vector, totalCost: stats.costImpact, count: stats.count });
    }
    return result.toSorted((a, b) => b.totalCost - a.totalCost).slice(0, topN);
  }

  generateReport(): string {
    const topVectors = this.getTopCostVectors(5);
    const recentEvents = this.getRecentEvents(5);

    const lines: string[] = [
      "━━ Context Entropy 报告 ━━",
      `Latch 状态: ${this.latchState}`,
      `待决 break 向量: ${this.pendingBreakVectors.size}`,
      "",
      "高成本失效向量 (TOP 5):",
      ...topVectors.map(
        (v) =>
          `  • ${v.vector}: 触发 ${v.count} 次 / 累计影响 ${v.totalCost.toLocaleString()} tokens`,
      ),
      "",
      "最近失效事件:",
      ...recentEvents.map(
        (e) =>
          `  [${e.severity.toUpperCase()}] ${e.vector} @ ${new Date(e.detectedAt).toISOString()}`,
      ),
    ];

    return lines.join("\n");
  }

  /** 重置所有统计（如每日重置） */
  resetStats(): void {
    this.vectorStats.clear();
    this.recentEvents = [];
  }
}

// ─────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────

/**
 * 从当前 system prompt 参数构建前缀快照
 */
export function buildPrefixSnapshot(params: {
  systemPrompt: string;
  toolSchemas: Record<string, unknown>;
  modelId: string;
  providerId: string;
  promptMode: string;
  workspaceDir: string;
  ownerNumbers?: string[];
  channelId?: string;
}): PromptPrefixSnapshot {
  return {
    systemPromptHash: simpleHash(params.systemPrompt),
    toolSchemasHash: simpleHash(JSON.stringify(params.toolSchemas)),
    modelId: params.modelId,
    providerId: params.providerId,
    promptMode: params.promptMode,
    workspaceDir: params.workspaceDir,
    ownerHash: simpleHash((params.ownerNumbers ?? []).join(",")),
    channelId: params.channelId ?? "",
    snapshotAt: Date.now(),
  };
}

// ─────────────────────────────────────────────
// 全局单例
// ─────────────────────────────────────────────

let _globalEntropyManager: ContextEntropyManager | null = null;

export function getContextEntropyManager(opts?: {
  maxContextTokens?: number;
}): ContextEntropyManager {
  if (!_globalEntropyManager) {
    _globalEntropyManager = new ContextEntropyManager(opts);
  }
  return _globalEntropyManager;
}

export function resetContextEntropyManager(): void {
  _globalEntropyManager = null;
}
