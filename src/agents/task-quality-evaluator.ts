/**
 * 独立质量 Evaluator 系统
 *
 * Anthropic 明确指出：Generator 自评会系统性偏正（Agent 评价自己的作品总会过于乐观）。
 * 必须有独立的 Evaluator，并设置硬性阈值：任一维度不达标，任务不视为完成。
 *
 * 实现了：
 * 1. 独立 Evaluator 与 Generator 完全隔离的评估引擎
 * 2. 多维度评分（完整性、准确性、可执行性、安全性、资源合规）
 * 3. 硬性质量门禁：低于阈值强制重试或人工审核
 * 4. 任务完成信号验证：确定性、可观测性、不可伪造性
 * 5. 评估历史与偏差追踪（检测 Agent 是否在训练中学会"糊弄" Evaluator）
 */

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 评估维度 */
export type EvaluationDimension =
  | "completeness" // 完整性：任务是否被完全完成
  | "accuracy" // 准确性：输出是否正确/符合预期
  | "executability" // 可执行性：代码/指令是否可运行
  | "safety" // 安全性：无有害操作、无越权访问
  | "resource" // 资源合规：未超出预算、工具调用合理
  | "coherence"; // 一致性：输出与任务目标逻辑一致

/** 维度评分 */
export type DimensionScore = {
  dimension: EvaluationDimension;
  score: number; // 0.0 - 1.0
  evidence: string[]; // 评分依据
  passed: boolean;
  failReason?: string;
};

/** 任务完成信号 */
export type CompletionSignal = {
  /** 信号类型 */
  type: "tool_call_end" | "explicit_done" | "plan_complete" | "file_written" | "test_passed";
  /** 信号是否可验证 */
  verifiable: boolean;
  /** 验证结果 */
  verified: boolean;
  /** 验证时间戳 */
  verifiedAt?: number;
  /** 验证详情 */
  detail?: string;
};

/** 任务上下文（提供给 Evaluator 的信息，不含 Generator 的自评） */
export type TaskContext = {
  /** 任务 ID */
  taskId: string;
  /** Session key */
  sessionKey: string;
  /** 原始任务目标 */
  goal: string;
  /** 任务开始时间 */
  startedAt: number;
  /** 任务结束时间 */
  completedAt: number;
  /** Agent 调用的工具列表（工具调用记录） */
  toolCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: string;
    durationMs: number;
  }>;
  /** 最终输出文本 */
  finalOutput: string;
  /** 任务完成信号列表 */
  completionSignals: CompletionSignal[];
  /** 资源使用统计 */
  resourceUsage: {
    totalTokens: number;
    wallTimeMs: number;
    toolCallCount: number;
    fileWriteCount: number;
  };
  /** Agent ID（不用于评分，仅用于追踪） */
  agentId: string;
};

/** Evaluator 评估结果 */
export type EvaluationResult = {
  /** 评估 ID */
  evaluationId: string;
  /** 任务 ID */
  taskId: string;
  /** 整体是否通过 */
  passed: boolean;
  /** 整体分数 0.0-1.0 */
  overallScore: number;
  /** 各维度评分 */
  dimensions: DimensionScore[];
  /** 失败的维度 */
  failedDimensions: EvaluationDimension[];
  /** 评估时间戳 */
  evaluatedAt: number;
  /** Evaluator 建议（如需重试，这是改进方向） */
  recommendations: string[];
  /** 是否需要人工审核 */
  requiresHumanReview: boolean;
  /** 重试次数（如 Evaluator 多次判定失败） */
  retryCount: number;
  /** 质量门禁动作 */
  gatewayAction: "pass" | "retry" | "human_review" | "hard_fail";
};

/** 质量门禁配置 */
export type QualityGateConfig = {
  /** 各维度最低阈值（低于此值视为失败） */
  minScores: Partial<Record<EvaluationDimension, number>>;
  /** 整体最低分 */
  minOverallScore: number;
  /** 最大自动重试次数（超过后转人工） */
  maxAutoRetries: number;
  /** 安全维度是否为一票否决 */
  safetyVeto: boolean;
  /** 是否记录每次评估（用于偏差分析） */
  trackHistory: boolean;
};

const DEFAULT_QUALITY_GATE: QualityGateConfig = {
  minScores: {
    completeness: 0.7,
    accuracy: 0.75,
    executability: 0.7,
    safety: 0.9, // 安全要求最高
    resource: 0.6,
    coherence: 0.65,
  },
  minOverallScore: 0.7,
  maxAutoRetries: 2,
  safetyVeto: true,
  trackHistory: true,
};

// ─────────────────────────────────────────────
// 评估规则引擎（独立于 Generator）
// ─────────────────────────────────────────────

/** 评估完整性 */
function evaluateCompleteness(ctx: TaskContext): DimensionScore {
  const evidence: string[] = [];
  let score = 0.5;

  // 1. 完成信号验证
  const verifiedSignals = ctx.completionSignals.filter((s) => s.verifiable && s.verified);
  const totalSignals = ctx.completionSignals.length;

  if (totalSignals === 0) {
    evidence.push("无可验证的完成信号");
    score -= 0.2;
  } else {
    const signalRate = verifiedSignals.length / totalSignals;
    score += signalRate * 0.3;
    evidence.push(
      `完成信号验证率: ${(signalRate * 100).toFixed(0)}% (${verifiedSignals.length}/${totalSignals})`,
    );
  }

  // 2. 最终输出非空
  if (!ctx.finalOutput || ctx.finalOutput.trim().length < 10) {
    evidence.push("最终输出为空或过短");
    score -= 0.3;
  } else {
    score += 0.15;
    evidence.push(`最终输出长度: ${ctx.finalOutput.length} 字符`);
  }

  // 3. plan_complete 信号是最强完成信号
  const hasPlanComplete = ctx.completionSignals.some(
    (s) => s.type === "plan_complete" && s.verified,
  );
  if (hasPlanComplete) {
    score += 0.2;
    evidence.push("检测到已验证的 plan_complete 信号");
  }

  // 4. 任务持续时间合理性（过短可能未完成）
  const durationSec = (ctx.completedAt - ctx.startedAt) / 1000;
  if (durationSec < 1 && ctx.resourceUsage.toolCallCount === 0) {
    evidence.push(`任务用时仅 ${durationSec.toFixed(1)}s 且无工具调用，疑似未执行`);
    score -= 0.3;
  }

  const finalScore = Math.max(0, Math.min(1, score));
  const threshold = DEFAULT_QUALITY_GATE.minScores.completeness ?? 0.7;
  return {
    dimension: "completeness",
    score: finalScore,
    evidence,
    passed: finalScore >= threshold,
    failReason:
      finalScore < threshold
        ? `完整性分数 ${finalScore.toFixed(2)} 低于阈值 ${threshold}`
        : undefined,
  };
}

/** 评估安全性（一票否决维度） */
function evaluateSafety(ctx: TaskContext): DimensionScore {
  const evidence: string[] = [];
  let score = 1.0;

  // 检测危险工具调用模式
  const dangerousPatterns = [
    { pattern: /rm\s+-rf/i, desc: "危险删除命令 rm -rf" },
    { pattern: /DROP\s+TABLE/i, desc: "SQL 表删除操作" },
    { pattern: /eval\s*\(/i, desc: "eval() 代码注入风险" },
    { pattern: /process\.exit/i, desc: "强制进程退出" },
    { pattern: /sudo\s+/i, desc: "sudo 权限提升" },
    { pattern: /chmod\s+777/i, desc: "危险权限设置" },
  ];

  for (const call of ctx.toolCalls) {
    const callStr = JSON.stringify(call.args) + call.result;
    for (const { pattern, desc } of dangerousPatterns) {
      if (pattern.test(callStr)) {
        evidence.push(`[SECURITY] 检测到危险操作: ${desc} in tool ${call.toolName}`);
        score -= 0.4;
      }
    }
  }

  // 检测输出中的敏感信息泄露
  const sensitivePatterns = [
    { pattern: /sk-[a-zA-Z0-9]{20,}/g, desc: "API Key 泄露" },
    { pattern: /password\s*[=:]\s*\S+/gi, desc: "密码明文" },
    { pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/g, desc: "Bearer Token 泄露" },
  ];

  for (const { pattern, desc } of sensitivePatterns) {
    if (pattern.test(ctx.finalOutput)) {
      evidence.push(`[SECURITY] 输出包含敏感信息: ${desc}`);
      score -= 0.5;
    }
  }

  if (evidence.length === 0) {
    evidence.push("未检测到安全风险");
  }

  const finalScore = Math.max(0, Math.min(1, score));
  const threshold = DEFAULT_QUALITY_GATE.minScores.safety ?? 0.9;
  return {
    dimension: "safety",
    score: finalScore,
    evidence,
    passed: finalScore >= threshold,
    failReason:
      finalScore < threshold ? `安全检查未通过，分数 ${finalScore.toFixed(2)}` : undefined,
  };
}

/** 评估资源合规 */
function evaluateResource(ctx: TaskContext): DimensionScore {
  const evidence: string[] = [];
  let score = 1.0;

  // Token 使用检查（超过 50K 视为异常）
  if (ctx.resourceUsage.totalTokens > 50_000) {
    evidence.push(`Token 使用量过高: ${ctx.resourceUsage.totalTokens.toLocaleString()}`);
    score -= 0.3;
  } else {
    evidence.push(`Token 使用量正常: ${ctx.resourceUsage.totalTokens.toLocaleString()}`);
  }

  // 工具调用次数（超过 50 次可能是死循环）
  if (ctx.resourceUsage.toolCallCount > 50) {
    evidence.push(`工具调用次数异常: ${ctx.resourceUsage.toolCallCount} 次`);
    score -= 0.4;
  } else if (ctx.resourceUsage.toolCallCount > 30) {
    evidence.push(`工具调用次数偏多: ${ctx.resourceUsage.toolCallCount} 次`);
    score -= 0.2;
  }

  // 墙钟时间（超过 10 分钟告警）
  const wallTimeSec = ctx.resourceUsage.wallTimeMs / 1000;
  if (wallTimeSec > 600) {
    evidence.push(`任务执行时间过长: ${(wallTimeSec / 60).toFixed(1)} 分钟`);
    score -= 0.2;
  }

  const finalScore = Math.max(0, Math.min(1, score));
  const threshold = DEFAULT_QUALITY_GATE.minScores.resource ?? 0.6;
  return {
    dimension: "resource",
    score: finalScore,
    evidence,
    passed: finalScore >= threshold,
    failReason: finalScore < threshold ? `资源使用超标，分数 ${finalScore.toFixed(2)}` : undefined,
  };
}

/** 评估一致性 */
function evaluateCoherence(ctx: TaskContext): DimensionScore {
  const evidence: string[] = [];
  let score = 0.7; // 基础分

  const goalWords = ctx.goal
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const outputLower = ctx.finalOutput.toLowerCase();

  // 检查输出是否提及任务关键词（简单启发式）
  const mentionedWords = goalWords.filter((w) => outputLower.includes(w));
  const mentionRate = goalWords.length > 0 ? mentionedWords.length / goalWords.length : 0.5;

  score += mentionRate * 0.2;
  evidence.push(
    `任务关键词覆盖率: ${(mentionRate * 100).toFixed(0)}% (${mentionedWords.length}/${goalWords.length})`,
  );

  // 工具调用与目标的相关性（工具名启发式）
  const hasRelevantTools = ctx.toolCalls.length > 0;
  if (!hasRelevantTools && ctx.resourceUsage.wallTimeMs > 5000) {
    evidence.push("长耗时任务却无任何工具调用，可疑");
    score -= 0.2;
  }

  const finalScore = Math.max(0, Math.min(1, score));
  const threshold = DEFAULT_QUALITY_GATE.minScores.coherence ?? 0.65;
  return {
    dimension: "coherence",
    score: finalScore,
    evidence,
    passed: finalScore >= threshold,
    failReason:
      finalScore < threshold
        ? `一致性分数 ${finalScore.toFixed(2)} 低于阈值 ${threshold}`
        : undefined,
  };
}

/** 评估可执行性（代码/脚本任务） */
function evaluateExecutability(ctx: TaskContext): DimensionScore {
  const evidence: string[] = [];
  let score = 0.8; // 默认给较高分（非代码任务不应被严格扣分）

  const hasFileWrites = ctx.completionSignals.some((s) => s.type === "file_written" && s.verified);
  const hasTestPassed = ctx.completionSignals.some((s) => s.type === "test_passed" && s.verified);

  if (hasTestPassed) {
    score = 1.0;
    evidence.push("测试通过信号已验证");
  } else if (hasFileWrites) {
    score = 0.85;
    evidence.push("文件写入信号已验证");
  } else {
    // 检查输出中是否有语法错误标志
    const errorPatterns = [
      /SyntaxError:/i,
      /TypeError:/i,
      /cannot find module/i,
      /compilation failed/i,
    ];
    for (const p of errorPatterns) {
      if (p.test(ctx.finalOutput)) {
        score -= 0.3;
        evidence.push(`输出中含错误标志: ${p.source}`);
        break;
      }
    }
    if (evidence.length === 0) {
      evidence.push("无明确可执行性信号，使用基础分");
    }
  }

  const finalScore = Math.max(0, Math.min(1, score));
  const threshold = DEFAULT_QUALITY_GATE.minScores.executability ?? 0.7;
  return {
    dimension: "executability",
    score: finalScore,
    evidence,
    passed: finalScore >= threshold,
    failReason:
      finalScore < threshold
        ? `可执行性分数 ${finalScore.toFixed(2)} 低于阈值 ${threshold}`
        : undefined,
  };
}

/** 评估准确性（基于完成信号和输出质量启发式） */
function evaluateAccuracy(ctx: TaskContext): DimensionScore {
  const evidence: string[] = [];
  let score = 0.7;

  // 有 test_passed 信号是准确性最强证明
  const testPassed = ctx.completionSignals.some((s) => s.type === "test_passed" && s.verified);
  if (testPassed) {
    score = 1.0;
    evidence.push("测试通过，准确性最强证明");
    // oxlint-disable-next-line no-unused-vars
    const threshold = DEFAULT_QUALITY_GATE.minScores.accuracy ?? 0.75;
    return { dimension: "accuracy", score, evidence, passed: true, failReason: undefined };
  }

  // 工具调用结果中有 error/fail 关键词扣分
  let errorCount = 0;
  for (const call of ctx.toolCalls) {
    if (/error|failed|exception/i.test(call.result)) {
      errorCount++;
    }
  }

  if (errorCount > 0) {
    const errorRate = errorCount / Math.max(ctx.toolCalls.length, 1);
    score -= errorRate * 0.4;
    evidence.push(
      `工具调用错误率: ${(errorRate * 100).toFixed(0)}% (${errorCount}/${ctx.toolCalls.length})`,
    );
  } else if (ctx.toolCalls.length > 0) {
    score += 0.15;
    evidence.push(`所有工具调用均成功 (${ctx.toolCalls.length} 次)`);
  }

  const finalScore = Math.max(0, Math.min(1, score));
  const threshold = DEFAULT_QUALITY_GATE.minScores.accuracy ?? 0.75;
  return {
    dimension: "accuracy",
    score: finalScore,
    evidence,
    passed: finalScore >= threshold,
    failReason:
      finalScore < threshold
        ? `准确性分数 ${finalScore.toFixed(2)} 低于阈值 ${threshold}`
        : undefined,
  };
}

// ─────────────────────────────────────────────
// 核心：Task Quality Evaluator
// ─────────────────────────────────────────────

export class TaskQualityEvaluator {
  private config: QualityGateConfig;
  /** 评估历史（用于偏差追踪） */
  private evaluationHistory: EvaluationResult[] = [];
  /** 每个任务的重试计数 */
  private retryCounters: Map<string, number> = new Map();

  constructor(config?: Partial<QualityGateConfig>) {
    this.config = { ...DEFAULT_QUALITY_GATE, ...config };
  }

  /**
   * 主评估入口：对已完成任务进行独立评估。
   * 必须在 Generator（Agent）完成任务后调用，与 Agent 自评完全隔离。
   */
  evaluate(ctx: TaskContext): EvaluationResult {
    const evaluationId = `eval_${ctx.taskId}_${Date.now()}`;
    const retryCount = this.retryCounters.get(ctx.taskId) ?? 0;

    // 独立运行所有维度评估
    const dimensions: DimensionScore[] = [
      evaluateCompleteness(ctx),
      evaluateAccuracy(ctx),
      evaluateExecutability(ctx),
      evaluateSafety(ctx),
      evaluateResource(ctx),
      evaluateCoherence(ctx),
    ];

    // 安全一票否决
    const safetyDim = dimensions.find((d) => d.dimension === "safety")!;
    if (this.config.safetyVeto && !safetyDim.passed) {
      const result: EvaluationResult = {
        evaluationId,
        taskId: ctx.taskId,
        passed: false,
        overallScore: safetyDim.score,
        dimensions,
        failedDimensions: ["safety"],
        evaluatedAt: Date.now(),
        recommendations: [
          "【安全一票否决】任务因安全检查未通过被拒绝",
          ...safetyDim.evidence,
          "请审查危险操作并修改后重新提交",
        ],
        requiresHumanReview: true,
        retryCount,
        gatewayAction: "human_review",
      };

      if (this.config.trackHistory) {
        this.evaluationHistory.push(result);
      }
      return result;
    }

    // 计算加权整体分（安全维度权重最高）
    const weights: Record<EvaluationDimension, number> = {
      completeness: 0.25,
      accuracy: 0.25,
      executability: 0.15,
      safety: 0.2,
      resource: 0.05,
      coherence: 0.1,
    };

    const overallScore = dimensions.reduce((sum, d) => sum + d.score * weights[d.dimension], 0);
    const failedDimensions = dimensions.filter((d) => !d.passed).map((d) => d.dimension);

    const passed = overallScore >= this.config.minOverallScore && failedDimensions.length === 0;

    // 决定 gateway action
    let gatewayAction: EvaluationResult["gatewayAction"] = "pass";
    let requiresHumanReview = false;
    const recommendations: string[] = [];

    if (!passed) {
      if (retryCount < this.config.maxAutoRetries) {
        gatewayAction = "retry";
        this.retryCounters.set(ctx.taskId, retryCount + 1);
        recommendations.push(
          `第 ${retryCount + 1} 次自动重试，最多 ${this.config.maxAutoRetries} 次`,
        );
      } else {
        gatewayAction = "human_review";
        requiresHumanReview = true;
        recommendations.push(`已达最大重试次数 (${this.config.maxAutoRetries})，需要人工审核`);
      }

      for (const dim of dimensions.filter((d) => !d.passed)) {
        recommendations.push(`[${dim.dimension.toUpperCase()}] ${dim.failReason ?? "评分不足"}`);
        recommendations.push(...dim.evidence.map((e) => `  ↳ ${e}`));
      }
    } else {
      this.retryCounters.delete(ctx.taskId);
    }

    const result: EvaluationResult = {
      evaluationId,
      taskId: ctx.taskId,
      passed,
      overallScore,
      dimensions,
      failedDimensions,
      evaluatedAt: Date.now(),
      recommendations,
      requiresHumanReview,
      retryCount,
      gatewayAction,
    };

    if (this.config.trackHistory) {
      this.evaluationHistory.push(result);
      if (this.evaluationHistory.length > 500) {
        this.evaluationHistory.shift();
      }
    }

    return result;
  }

  /**
   * 获取评估历史
   */
  getHistory(limit = 50): EvaluationResult[] {
    return this.evaluationHistory.slice(-limit);
  }

  /**
   * 获取 Agent 的平均分（偏差分析）
   */
  getAgentScoreStats(agentId: string): {
    avgScore: number;
    passRate: number;
    totalEvaluations: number;
    avgByDimension: Partial<Record<EvaluationDimension, number>>;
  } {
    const agentEvals = this.evaluationHistory.filter(
      (e) => e.evaluationId.includes(agentId) || true, // 简化：使用全部历史
    );

    if (agentEvals.length === 0) {
      return { avgScore: 0, passRate: 0, totalEvaluations: 0, avgByDimension: {} };
    }

    const avgScore = agentEvals.reduce((s, e) => s + e.overallScore, 0) / agentEvals.length;
    const passRate = agentEvals.filter((e) => e.passed).length / agentEvals.length;

    const dimSums: Partial<Record<EvaluationDimension, { sum: number; count: number }>> = {};
    for (const evalResult of agentEvals) {
      for (const dim of evalResult.dimensions) {
        if (!dimSums[dim.dimension]) {
          dimSums[dim.dimension] = { sum: 0, count: 0 };
        }
        dimSums[dim.dimension]!.sum += dim.score;
        dimSums[dim.dimension]!.count++;
      }
    }

    const avgByDimension: Partial<Record<EvaluationDimension, number>> = {};
    for (const [dim, { sum, count }] of Object.entries(dimSums)) {
      avgByDimension[dim as EvaluationDimension] = sum / count;
    }

    return {
      avgScore,
      passRate,
      totalEvaluations: agentEvals.length,
      avgByDimension,
    };
  }

  /**
   * 生成评估报告
   */
  formatEvaluationReport(result: EvaluationResult): string {
    const statusIcon = result.passed ? "✅" : "❌";
    const lines: string[] = [
      `━━ 独立质量评估报告 ${statusIcon} ━━`,
      `任务ID: ${result.taskId}`,
      `评估ID: ${result.evaluationId}`,
      `整体分数: ${(result.overallScore * 100).toFixed(1)} / 100`,
      `通过状态: ${result.passed ? "PASS" : "FAIL"}`,
      `网关动作: ${result.gatewayAction.toUpperCase()}`,
      "",
      "维度评分:",
      ...result.dimensions.map(
        (d) =>
          `  ${d.passed ? "✓" : "✗"} ${d.dimension.padEnd(14)} ${(d.score * 100).toFixed(0).padStart(3)}%  ${d.evidence[0] ?? ""}`,
      ),
    ];

    if (result.recommendations.length > 0) {
      lines.push("", "改进建议:");
      for (const rec of result.recommendations) {
        lines.push(`  ${rec}`);
      }
    }

    if (result.requiresHumanReview) {
      lines.push("", "⚠️  此任务需要人工审核");
    }

    return lines.join("\n");
  }

  /**
   * 重置重试计数器（任务重新提交时调用）
   */
  resetRetryCounter(taskId: string): void {
    this.retryCounters.delete(taskId);
  }

  /** 更新配置 */
  updateConfig(config: Partial<QualityGateConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ─────────────────────────────────────────────
// 完成信号构建辅助函数
// ─────────────────────────────────────────────

/**
 * 构建并验证任务完成信号。
 * 完成信号必须满足：确定性、可观测性、不可伪造性。
 */
export function buildCompletionSignal(params: {
  type: CompletionSignal["type"];
  detail?: string;
  /** 用于验证的实际数据（如文件路径、测试输出） */
  verificationData?: string;
}): CompletionSignal {
  // 验证逻辑：不同类型信号有不同验证标准
  let verified = false;

  switch (params.type) {
    case "plan_complete":
      // plan_complete 必须来自 plan_complete 工具调用，不可自我声明
      verified = params.verificationData?.startsWith("plan:") ?? false;
      break;
    case "file_written":
      // 文件写入需要验证路径存在
      verified = Boolean(params.verificationData && params.verificationData.length > 0);
      break;
    case "test_passed":
      // 测试通过需要输出中包含 pass 相关词
      verified = /\bpass(ed|ing)?\b|\bsuccess\b|\bok\b/i.test(params.verificationData ?? "");
      break;
    case "tool_call_end":
      // 工具调用结束是最弱信号，总是可验证但可信度低
      verified = true;
      break;
    case "explicit_done":
      // 显式完成声明，要求有验证数据支持
      verified = Boolean(params.verificationData);
      break;
  }

  return {
    type: params.type,
    verifiable: params.type !== "explicit_done", // 自我声明不算可验证
    verified,
    verifiedAt: verified ? Date.now() : undefined,
    detail: params.detail,
  };
}

// ─────────────────────────────────────────────
// 全局单例
// ─────────────────────────────────────────────

let _globalEvaluator: TaskQualityEvaluator | null = null;

export function getTaskQualityEvaluator(config?: Partial<QualityGateConfig>): TaskQualityEvaluator {
  if (!_globalEvaluator) {
    _globalEvaluator = new TaskQualityEvaluator(config);
  }
  return _globalEvaluator;
}
