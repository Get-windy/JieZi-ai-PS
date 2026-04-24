/**
 * 心跳任务状态压缩与同步机制
 * 
 * 解决心跳任务与主控之间的信息断链问题
 * 采用分层状态压缩 + 渐进式摘要机制
 * 
 * 核心设计：
 * 1. Tier 1: 关键状态层（每次注入到主控上下文）
 * 2. Tier 2: 进度摘要层（按需注入）
 * 3. Tier 3: 完整详情层（主动查询）
 * 
 * 双向同步：
 * - 心跳 → 主控：状态摘要、进度报告、待决策事项
 * - 主控 → 心跳：决策结果、用户反馈、行动指令
 */

import type { Task } from "../tasks/types.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 心跳任务状态摘要（Tier 1 - 关键状态）
 * 这个层级的信息会每次注入到主控上下文
 * 必须精炼、关键、简洁
 */
export interface HeartbeatStateSummary {
  // 基础信息
  taskId: string;
  lastCheckAt: number;
  nextCheckAt: number;
  
  // 关键发现（最多3条）
  criticalFindings: Array<{
    type: "error" | "warning" | "info";
    title: string;
    severity: "critical" | "high" | "medium" | "low";
    requiresAction: boolean;  // 是否需要主控决策
    userResponse?: "accepted" | "rejected" | "pending";  // 用户响应状态
  }>;
  
  // 待主控决策的事项（最多2条）
  pendingDecisions: Array<{
    id: string;
    question: string;
    options: string[];
    userSelected?: string;
    masterDecision?: string;  // 主控的决策
    status: "awaiting-master" | "awaiting-user" | "user-responded" | "master-decided" | "resolved";
  }>;
  
  // 整体健康状态
  healthStatus: {
    score: number;  // 0-100
    trend: "improving" | "stable" | "degrading";
    blockedItems: number;  // 阻塞项数量
  };
  
  // 主控反馈（新增：从主控→心跳的信息）
  masterFeedback?: {
    lastDecisionAt: number;
    decision: string;  // 主控的决策内容
    reasoning?: string;  // 决策原因
    userCommunication?: string;  // 与用户的沟通结果
    actionInstructions: string[];  // 行动指令
    nextCheckpoint?: number;  // 下次检查点
  };
  
  // 进度指标
  progress: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    lastResolvedIssue?: string;  // 最近解决的问题
  };
}

/**
 * 心跳任务进度报告（Tier 2 - 进度摘要）
 * 这个层级的信息可以按需注入（当主控需要更多上下文时）
 */
export interface HeartbeatProgressReport {
  taskId: string;
  period: {
    start: number;
    end: number;
    duration: number;
  };
  
  // 检查统计
  statistics: {
    totalChecks: number;
    checksByType: Record<string, number>;
    checksByStatus: {
      passed: number;
      failed: number;
      warning: number;
      skipped: number;
    };
    averageHealthScore: number;
    healthTrend: "improving" | "stable" | "degrading";
  };
  
  // 问题处理记录
  issuesHandled: Array<{
    id: string;
    type: string;
    description: string;
    detectedAt: number;
    resolution?: {
      method: "auto-fixed" | "user-selected" | "master-decided" | "ignored";
      selectedOption?: string;
      resolvedAt: number;
      outcome: "success" | "partial" | "failed";
    };
  }>;
  
  // 阶段性总结
  phaseSummary: string;  // 一句话总结这个阶段的状态
  
  // 下一步计划
  nextSteps: string[];
}

/**
 * 心跳任务完整日志（Tier 3 - 完整详情）
 * 这个层级的信息只在主动查询时返回
 */
export interface HeartbeatFullLog {
  taskId: string;
  checkHistory: Array<{
    id: string;
    timestamp: number;
    checkType: string;
    status: "passed" | "failed" | "warning" | "skipped";
    findings: string[];
    healthScore: number;
    actions: Array<{
      type: string;
      description: string;
      result: string;
    }>;
  }>;
  
  // 完整的问题-决策-解决链条
  issueResolutionChain: Array<{
    issueId: string;
    timeline: Array<{
      timestamp: number;
      event: "detected" | "reported-to-master" | "user-responded" | "decision-made" | "resolved";
      details: string;
      actor: "heartbeat" | "master" | "user";
    }>;
  }>;
}

/**
 * 分层上下文注入配置
 */
export interface ContextInjectionConfig {
  // Tier 1: 总是注入
  alwaysInject: {
    maxCriticalFindings: number;      // 最多关键发现数
    maxPendingDecisions: number;      // 最多待决策事项
    includeHealthScore: boolean;      // 是否包含健康分数
    includeProgressSummary: boolean;  // 是否包含进度摘要
  };
  
  // Tier 2: 条件注入
  conditionalInject: {
    triggerConditions: Array<{
      name: string;
      condition: "health-degraded" | "decisions-pending" | "user-responded" | "periodic-summary";
      threshold?: number;
      interval?: number;  // 周期性摘要间隔（分钟）
    }>;
  };
  
  // Tier 3: 按需查询
  onDemandQuery: {
    enabled: boolean;
    maxLogEntries: number;  // 最大日志条目数
  };
}

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认上下文注入配置
 */
export const DEFAULT_CONTEXT_CONFIG: ContextInjectionConfig = {
  alwaysInject: {
    maxCriticalFindings: 3,
    maxPendingDecisions: 2,
    includeHealthScore: true,
    includeProgressSummary: true,
  },
  conditionalInject: {
    triggerConditions: [
      {
        name: "健康度下降",
        condition: "health-degraded",
        threshold: 60,  // 健康分数低于60时触发
      },
      {
        name: "待决策事项",
        condition: "decisions-pending",
      },
      {
        name: "用户已响应",
        condition: "user-responded",
      },
      {
        name: "周期总结",
        condition: "periodic-summary",
        interval: 60,  // 每60分钟生成一次周期总结
      },
    ],
  },
  onDemandQuery: {
    enabled: true,
    maxLogEntries: 50,
  },
};

// ============================================================================
// 核心功能函数
// ============================================================================

/**
 * 生成心跳任务状态摘要（Tier 1）
 * 
 * 这个函数生成精炼的关键状态信息，用于每次注入到主控上下文
 * 严格控制信息量，避免上下文溢出
 */
export function generateHeartbeatSummary(
  task: Task,
  recentChecks: Array<{
    timestamp: number;
    status: "passed" | "failed" | "warning";
    findings: string[];
    healthScore: number;
  }>,
  pendingDecisions: Array<{
    id: string;
    question: string;
    options: string[];
    userSelected?: string;
    status: "awaiting-master" | "awaiting-user" | "user-responded" | "resolved";
  }>,
  config: ContextInjectionConfig = DEFAULT_CONTEXT_CONFIG,
): HeartbeatStateSummary {
  // 提取关键发现（限制数量）
  const criticalFindings = recentChecks
    .filter(check => check.status === "failed" || check.status === "warning")
    .slice(0, config.alwaysInject.maxCriticalFindings)
    .map(check => ({
      type: check.status === "failed" ? "error" as const : "warning" as const,
      title: check.findings[0] || "检查发现问题",
      severity: check.status === "failed" ? "high" as const : "medium" as const,
      requiresAction: check.healthScore < 70,
    }));
  
  // 过滤待决策事项（限制数量）
  const activeDecisions = pendingDecisions
    .filter(d => d.status === "awaiting-master" || d.status === "user-responded")
    .slice(0, config.alwaysInject.maxPendingDecisions);
  
  // 计算健康状态
  const latestHealthScore = recentChecks.length > 0 
    ? recentChecks[recentChecks.length - 1].healthScore 
    : 100;
  
  const healthTrend = calculateHealthTrend(recentChecks);
  
  const blockedItems = pendingDecisions.filter(d => d.status === "awaiting-master").length;
  
  // 计算进度指标
  const passedChecks = recentChecks.filter(c => c.status === "passed").length;
  const failedChecks = recentChecks.filter(c => c.status === "failed").length;
  const warningChecks = recentChecks.filter(c => c.status === "warning").length;
  
  return {
    taskId: task.id,
    lastCheckAt: recentChecks.length > 0 ? recentChecks[recentChecks.length - 1].timestamp : 0,
    nextCheckAt: task.dueDate || 0,
    criticalFindings,
    pendingDecisions: activeDecisions,
    healthStatus: {
      score: latestHealthScore,
      trend: healthTrend,
      blockedItems,
    },
    progress: {
      totalChecks: recentChecks.length,
      passedChecks,
      failedChecks,
      warningChecks,
      lastResolvedIssue: undefined,  // TODO: 从历史记录中提取
    },
  };
}

/**
 * 生成心跳任务进度报告（Tier 2）
 * 
 * 这个函数生成阶段性的进度摘要，可以按需注入
 */
export function generateProgressReport(
  task: Task,
  checkHistory: Array<{
    id: string;
    timestamp: number;
    checkType: string;
    status: "passed" | "failed" | "warning" | "skipped";
    findings: string[];
    healthScore: number;
  }>,
  issuesHandled: Array<{
    id: string;
    type: string;
    description: string;
    detectedAt: number;
    resolution?: {
      method: "auto-fixed" | "user-selected" | "master-decided" | "ignored";
      selectedOption?: string;
      resolvedAt: number;
      outcome: "success" | "partial" | "failed";
    };
  }>,
  periodMinutes: number = 60,
): HeartbeatProgressReport {
  const now = Date.now();
  const periodStart = now - periodMinutes * 60 * 1000;
  
  // 过滤当前周期的检查记录
  const periodChecks = checkHistory.filter(c => c.timestamp >= periodStart);
  
  // 统计信息
  const checksByType: Record<string, number> = {};
  const checksByStatus = { passed: 0, failed: 0, warning: 0, skipped: 0 };
  
  for (const check of periodChecks) {
    checksByType[check.checkType] = (checksByType[check.checkType] || 0) + 1;
    checksByStatus[check.status]++;
  }
  
  const healthScores = periodChecks.map(c => c.healthScore);
  const averageHealthScore = healthScores.length > 0 
    ? healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length 
    : 100;
  
  const healthTrend = calculateHealthTrend(periodChecks.map(c => ({
    timestamp: c.timestamp,
    status: c.status,
    findings: c.findings,
    healthScore: c.healthScore,
  })));
  
  // 生成阶段性总结
  const phaseSummary = generatePhaseSummary(checksByStatus, averageHealthScore, healthTrend);
  
  // 生成下一步计划
  const nextSteps = generateNextSteps(checksByStatus, issuesHandled);
  
  return {
    taskId: task.id,
    period: {
      start: periodStart,
      end: now,
      duration: periodMinutes,
    },
    statistics: {
      totalChecks: periodChecks.length,
      checksByType,
      checksByStatus,
      averageHealthScore,
      healthTrend,
    },
    issuesHandled,
    phaseSummary,
    nextSteps,
  };
}

/**
 * 生成完整日志（Tier 3）
 * 
 * 这个函数返回完整的检查历史和决策链条
 * 只在主动查询时调用
 */
export function generateFullLog(
  task: Task,
  checkHistory: Array<{
    id: string;
    timestamp: number;
    checkType: string;
    status: "passed" | "failed" | "warning" | "skipped";
    findings: string[];
    healthScore: number;
    actions?: Array<{
      type: string;
      description: string;
      result: string;
    }>;
  }>,
  issueResolutionChain: Array<{
    issueId: string;
    timeline: Array<{
      timestamp: number;
      event: "detected" | "reported-to-master" | "user-responded" | "decision-made" | "resolved";
      details: string;
      actor: "heartbeat" | "master" | "user";
    }>;
  }>,
  maxEntries: number = 50,
): HeartbeatFullLog {
  return {
    taskId: task.id,
    checkHistory: checkHistory.slice(-maxEntries),  // 只返回最新的 N 条
    issueResolutionChain,
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 计算健康度趋势
 */
function calculateHealthTrend(
  checks: Array<{ timestamp: number; healthScore: number }>,
): "improving" | "stable" | "degrading" {
  if (checks.length < 2) {return "stable";}
  
  const recent = checks.slice(-3);
  if (recent.length < 2) {return "stable";}
  
  const first = recent[0].healthScore;
  const last = recent[recent.length - 1].healthScore;
  const diff = last - first;
  
  if (diff > 5) {return "improving";}
  if (diff < -5) {return "degrading";}
  return "stable";
}

/**
 * 生成阶段性总结
 */
function generatePhaseSummary(
  checksByStatus: { passed: number; failed: number; warning: number; skipped: number },
  averageHealthScore: number,
  healthTrend: "improving" | "stable" | "degrading",
): string {
  const total = checksByStatus.passed + checksByStatus.failed + checksByStatus.warning;
  const passRate = total > 0 ? (checksByStatus.passed / total * 100).toFixed(1) : "100";
  
  const trendText = healthTrend === "improving" ? "持续改善" 
    : healthTrend === "degrading" ? "需要关注" 
    : "保持稳定";
  
  return `本周期内共执行 ${total} 次检查，通过率 ${passRate}%，健康度 ${trendText}（${averageHealthScore.toFixed(1)}分）`;
}

/**
 * 生成下一步计划
 */
function generateNextSteps(
  checksByStatus: { passed: number; failed: number; warning: number; skipped: number },
  issuesHandled: Array<{
    resolution?: { outcome: "success" | "partial" | "failed" };
  }>,
): string[] {
  const nextSteps: string[] = [];
  
  if (checksByStatus.failed > 0) {
    nextSteps.push(`优先解决 ${checksByStatus.failed} 个失败的检查项`);
  }
  
  if (checksByStatus.warning > 0) {
    nextSteps.push(`监控 ${checksByStatus.warning} 个警告项的发展趋势`);
  }
  
  const failedResolutions = issuesHandled.filter(i => i.resolution?.outcome === "failed").length;
  if (failedResolutions > 0) {
    nextSteps.push(`重新评估 ${failedResolutions} 个未成功解决的问题`);
  }
  
  if (nextSteps.length === 0) {
    nextSteps.push("继续保持当前健康状态");
  }
  
  return nextSteps;
}

// ============================================================================
// 注入决策引擎
// ============================================================================

/**
 * 判断是否应该注入 Tier 2 进度报告
 */
export function shouldInjectProgressReport(
  summary: HeartbeatStateSummary,
  config: ContextInjectionConfig = DEFAULT_CONTEXT_CONFIG,
): boolean {
  for (const trigger of config.conditionalInject.triggerConditions) {
    switch (trigger.condition) {
      case "health-degraded":
        if (summary.healthStatus.score < (trigger.threshold || 60)) {
          return true;
        }
        break;
        
      case "decisions-pending":
        if (summary.pendingDecisions.some(d => d.status === "awaiting-master")) {
          return true;
        }
        break;
        
      case "user-responded":
        if (summary.pendingDecisions.some(d => d.status === "user-responded")) {
          return true;
        }
        break;
        
      case "periodic-summary":
        // 这个由调用方根据时间判断
        break;
    }
  }
  
  return false;
}

/**
 * 构建注入到主控的完整上下文
 * 
 * 根据配置和当前状态，动态构建注入到主控的上下文
 */
export function buildMasterContext(
  summary: HeartbeatStateSummary,
  progressReport?: HeartbeatProgressReport,
  _config: ContextInjectionConfig = DEFAULT_CONTEXT_CONFIG,
): string {
  const lines: string[] = [];
  
  // Tier 1: 关键状态（总是注入）
  lines.push("## 🔴 关键状态");
  lines.push(`**健康度**: ${summary.healthStatus.score}/100 (${summary.healthStatus.trend === "improving" ? "↑" : summary.healthStatus.trend === "degrading" ? "↓" : "→"})`);
  lines.push(`**阻塞项**: ${summary.healthStatus.blockedItems} 个`);
  lines.push(`**进度**: ${summary.progress.passedChecks}/${summary.progress.totalChecks} 通过`);
  
  if (summary.criticalFindings.length > 0) {
    lines.push("\n**关键发现**:");
    for (const finding of summary.criticalFindings) {
      const icon = finding.type === "error" ? "❌" : finding.type === "warning" ? "⚠️" : "ℹ️";
      const actionRequired = finding.requiresAction ? " [需要决策]" : "";
      lines.push(`- ${icon} ${finding.title}${actionRequired}`);
    }
  }
  
  if (summary.pendingDecisions.length > 0) {
    lines.push("\n**待决策事项**:");
    for (const decision of summary.pendingDecisions) {
      const statusIcon = decision.status === "awaiting-master" ? "⏳" 
        : decision.status === "user-responded" ? "✅" 
        : "❓";
      lines.push(`- ${statusIcon} ${decision.question}`);
      if (decision.userSelected) {
        lines.push(`  用户选择: ${decision.userSelected}`);
      }
    }
  }
  
  // Tier 2: 进度报告（条件注入）
  if (progressReport) {
    lines.push("\n## 📊 进度报告");
    lines.push(progressReport.phaseSummary);
    
    if (progressReport.nextSteps.length > 0) {
      lines.push("\n**下一步**:");
      for (const step of progressReport.nextSteps) {
        lines.push(`- ${step}`);
      }
    }
  }
  
  return lines.join("\n");
}
