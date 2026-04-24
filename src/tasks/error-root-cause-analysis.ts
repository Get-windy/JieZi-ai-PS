/**
 * 代码错误根源追溯和影响分析机制
 * 
 * 基于业界最佳实践：
 * 1. SZZ 算法（Bug-Inducing Commit Detection）
 * 2. Git Blame 代码归属追踪
 * 3. 根源追溯（Root Cause Analysis）
 * 4. 影响分析（Impact Analysis）
 * 5. 五问法（Five Whys）
 * 
 * 工作流程：
 * 当发现代码错误时：
 * 1. 自动追踪错误代码的引入时间、作者、关联任务
 * 2. 分析该代码变更的历史背景和上下文
 * 3. 识别所有受影响的相关任务和代码
 * 4. 生成完整的根源追溯报告
 * 5. 提供修复建议和预防措施
 */

import type { Task } from "../tasks/types.js";
import * as storage from "../tasks/storage.js";
import { matchErrorPattern, recordErrorCase } from "./error-pattern-database.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 错误根源追溯报告
 */
export interface ErrorRootCauseReport {
  errorId: string;
  errorDescription: string;
  discoveredAt: number;          // 错误发现时间
  discoveredBy: string;          // 错误发现者
  discoveredInTask: string;      // 在哪个任务中发现
  
  // 根源代码信息
  rootCause: {
    file: string;                // 错误代码所在文件
    lineStart?: number;          // 起始行号
    lineEnd?: number;            // 结束行号
    code: string;                // 错误代码片段
    introducedAt: number;        // 代码引入时间
    introducedBy: string;        // 代码引入者
    introducedInCommit?: string; // 关联的 Git Commit
    introducedInTask?: string;   // 关联的任务 ID
    commitMessage?: string;      // Commit 消息
    codeAge: number;             // 代码存活时间（天）
  };
  
  // 任务关联分析
  taskAnalysis: {
    originalTask: {
      id: string;
      title: string;
      status: string;
      type?: string;
      sprintNumber?: number;
    };
    relatedTasks: Array<{
      id: string;
      title: string;
      relationship: "dependency" | "same-sprint" | "same-module" | "same-author";
      risk: "high" | "medium" | "low";
    }>;
    taskQualityMetrics: {
      reopenCount: number;
      bugCount: number;
      reworkCount: number;
      completionRate: number;
    };
  };
  
  // 影响分析
  impactAnalysis: {
    affectedFiles: string[];     // 受影响的文件
    affectedTasks: string[];     // 受影响的任务
    affectedUsers?: number;      // 影响的用户数量
    severity: "critical" | "high" | "medium" | "low";
    estimatedFixEffort: "minutes" | "hours" | "days" | "weeks";
  };
  
  // 五问法分析
  fiveWhysAnalysis?: {
    why1: string;                // 表面原因
    why2?: string;               // 直接原因
    why3?: string;               // 间接原因
    why4?: string;               // 根本原因
    why5?: string;               // 系统性原因
    rootCauseSummary: string;    // 根源总结
  };
  
  // 修复建议
  recommendations: {
    immediate: string[];         // 立即修复措施
    preventive: string[];        // 预防措施
    process: string[];           // 流程改进建议
  };
  
  // 预防措施
  preventionMeasures: {
    codeReview: boolean;         // 是否需要加强代码审查
    testing: boolean;            // 是否需要增加测试
    monitoring: boolean;         // 是否需要增加监控
    training: boolean;           // 是否需要培训
  };
}

/**
 * Git Blame 信息
 */
export interface GitBlameInfo {
  commit: string;
  author: string;
  authorEmail: string;
  date: number;
  line: number;
  code: string;
  message?: string;
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 执行错误根源追溯分析
 * 
 * @param params 分析参数
 * @returns 根源追溯报告
 */
export async function analyzeErrorRootCause(params: {
  errorId: string;
  errorDescription: string;
  discoveredBy: string;
  discoveredInTask: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
}): Promise<ErrorRootCauseReport> {
  const {
    errorId,
    errorDescription,
    discoveredBy,
    discoveredInTask,
    filePath,
    lineStart,
    lineEnd,
  } = params;
  
  const discoveredAt = Date.now();
  
  // 1. 获取发现错误的任务信息
  const discoveryTask = await storage.getTask(discoveredInTask);
  if (!discoveryTask) {
    throw new Error(`任务 ${discoveredInTask} 不存在`);
  }
  
  // 2. 分析错误代码的根源（如果有文件信息）
  let rootCause: ErrorRootCauseReport["rootCause"] | undefined;
  if (filePath) {
    rootCause = await analyzeCodeRootCause(filePath, lineStart, lineEnd);
  }
  
  // 3. 任务关联分析
  const taskAnalysis = await analyzeTaskRelations(discoveryTask, rootCause?.introducedBy);
  
  // 4. 影响分析
  const impactAnalysis = await performImpactAnalysis(discoveryTask, rootCause);
  
  // 5. 五问法分析
  const fiveWhys = performFiveWhysAnalysis(errorDescription, rootCause, taskAnalysis);
  
  // 6. 错误模式匹配（新增）
  const matchedPattern = matchErrorPattern(errorDescription, rootCause?.code);
  if (matchedPattern) {
    console.log(`[Root Cause Analysis] Matched error pattern: ${matchedPattern.name}`);
  }
  
  // 7. 生成修复建议（集成模式库）
  const recommendations = generateRecommendations(impactAnalysis, fiveWhys, matchedPattern);
  
  // 8. 确定预防措施（集成模式库）
  const preventionMeasures = determinePreventionMeasures(fiveWhys, impactAnalysis, matchedPattern);
  
  // 9. 记录错误案例（如果匹配到模式）
  if (matchedPattern) {
    recordErrorCase({
      id: `case-${errorId}-${Date.now()}`,
      patternId: matchedPattern.id,
      report: {
        errorId,
        errorDescription,
        discoveredAt,
        discoveredBy,
        discoveredInTask,
        rootCause: rootCause!,
        taskAnalysis,
        impactAnalysis,
        fiveWhysAnalysis: fiveWhys,
        recommendations,
        preventionMeasures,
      },
      resolution: "待解决",
      lessonLearned: fiveWhys?.rootCauseSummary || "",
    });
  }
  
  return {
    errorId,
    errorDescription,
    discoveredAt,
    discoveredBy,
    discoveredInTask,
    rootCause: rootCause!,
    taskAnalysis,
    impactAnalysis,
    fiveWhysAnalysis: fiveWhys,
    recommendations,
    preventionMeasures,
  };
}

/**
 * 分析代码根源（模拟 Git Blame）
 */
async function analyzeCodeRootCause(
  filePath: string,
  lineStart?: number,
  lineEnd?: number,
): Promise<ErrorRootCauseReport["rootCause"]> {
  // TODO: 实际实现时调用 Git Blame API
  // 这里提供模拟数据
  const now = Date.now();
  const codeIntroducedAt = now - 30 * 24 * 60 * 60 * 1000; // 30 天前
  
  return {
    file: filePath,
    lineStart,
    lineEnd,
    code: `// 错误代码示例（从 Git Blame 获取）`,
    introducedAt: codeIntroducedAt,
    introducedBy: "developer@example.com",
    introducedInCommit: "abc123def456",
    introducedInTask: "task-related-123",
    commitMessage: "feat: 实现用户认证功能",
    codeAge: Math.floor((now - codeIntroducedAt) / (24 * 60 * 60 * 1000)),
  };
}

/**
 * 任务关联分析
 */
async function analyzeTaskRelations(
  discoveryTask: Task,
  codeAuthor?: string,
): Promise<ErrorRootCauseReport["taskAnalysis"]> {
  // 获取项目所有任务
  const allTasks = discoveryTask.projectId
    ? await storage.listTasks({ projectId: discoveryTask.projectId, limit: 1000 })
    : [];
  
  // 找出相关任务
  const relatedTasks: Array<{
    id: string;
    title: string;
    relationship: "dependency" | "same-sprint" | "same-module" | "same-author";
    risk: "high" | "medium" | "low";
  }> = [];
  
  // 1. 依赖关系
  if (discoveryTask.dependencies) {
    for (const depId of discoveryTask.dependencies) {
      const depTask = allTasks.find(t => t.id === depId);
      if (depTask) {
        relatedTasks.push({
          id: depTask.id,
          title: depTask.title,
          relationship: "dependency",
          risk: "high", // 依赖任务风险高
        });
      }
    }
  }
  
  // 2. 同一 Sprint 的任务
  const sprintNumber = (discoveryTask.metadata as Record<string, unknown>)?.sprintNumber as number | undefined;
  if (sprintNumber) {
    const sameSprintTasks = allTasks.filter(t => {
      const tSprint = (t.metadata as Record<string, unknown>)?.sprintNumber as number | undefined;
      return tSprint === sprintNumber && t.id !== discoveryTask.id;
    });
    
    for (const t of sameSprintTasks.slice(0, 5)) { // 最多取 5 个
      relatedTasks.push({
        id: t.id,
        title: t.title,
        relationship: "same-sprint",
        risk: "medium",
      });
    }
  }
  
  // 3. 同一作者的任务
  if (codeAuthor) {
    const authorTasks = allTasks.filter(t => 
      t.creatorId === codeAuthor && t.id !== discoveryTask.id
    ).slice(0, 3);
    
    for (const t of authorTasks) {
      relatedTasks.push({
        id: t.id,
        title: t.title,
        relationship: "same-author",
        risk: "medium",
      });
    }
  }
  
  // 计算任务质量指标
  const reopenCount = discoveryTask.reopenCount ?? 0;
  const bugCount = (discoveryTask.tags ?? []).filter(tag => 
    tag.includes("bug") || tag.includes("缺陷")
  ).length;
  const reworkCount = (discoveryTask.labels ?? []).filter(label => 
    label.includes("rework") || label.includes("返工")
  ).length;
  
  return {
    originalTask: {
      id: discoveryTask.id,
      title: discoveryTask.title,
      status: discoveryTask.status,
      type: discoveryTask.type,
      sprintNumber,
    },
    relatedTasks,
    taskQualityMetrics: {
      reopenCount,
      bugCount,
      reworkCount,
      completionRate: calculateCompletionRate(discoveryTask),
    },
  };
}

/**
 * 影响分析
 */
async function performImpactAnalysis(
  discoveryTask: Task,
  rootCause?: ErrorRootCauseReport["rootCause"],
): Promise<ErrorRootCauseReport["impactAnalysis"]> {
  const affectedFiles: string[] = [];
  const affectedTasks: string[] = [];
  
  // 分析受影响的文件
  if (rootCause?.file) {
    affectedFiles.push(rootCause.file);
    // TODO: 分析文件依赖关系，找出其他受影响文件
  }
  
  // 分析受影响的任务
  if (discoveryTask.projectId) {
    const allTasks = await storage.listTasks({ 
      projectId: discoveryTask.projectId, 
      limit: 1000 
    });
    
    // 找出依赖此任务的任务
    const dependentTasks = allTasks.filter(t => 
      t.dependencies?.includes(discoveryTask.id)
    );
    
    for (const t of dependentTasks) {
      affectedTasks.push(t.id);
    }
  }
  
  // 评估严重程度
  const severity = assessSeverity(discoveryTask, affectedTasks.length);
  
  // 估算修复工作量
  const estimatedFixEffort = estimateFixEffort(severity, affectedFiles.length);
  
  return {
    affectedFiles,
    affectedTasks,
    severity,
    estimatedFixEffort,
  };
}

/**
 * 五问法分析（Five Whys）
 */
function performFiveWhysAnalysis(
  errorDescription: string,
  rootCause?: ErrorRootCauseReport["rootCause"],
  taskAnalysis?: ErrorRootCauseReport["taskAnalysis"],
): ErrorRootCauseReport["fiveWhysAnalysis"] {
  // 这是一个简化的实现，实际应该使用 AI 进行智能分析
  const why1 = errorDescription; // 表面原因：错误本身
  
  let why2: string | undefined;
  let why3: string | undefined;
  let why4: string | undefined;
  let why5: string | undefined;
  
  if (rootCause && rootCause.codeAge > 90) {
    why2 = "错误代码已存在很长时间（>90天），可能是历史遗留问题";
    why3 = "代码审查可能不够充分，未能发现潜在问题";
    why4 = "缺乏完善的代码审查流程和自动化测试";
    why5 = "团队对质量保障的重视程度不足";
  } else if (rootCause && rootCause.codeAge < 7) {
    why2 = "错误代码是最近引入的（<7天）";
    why3 = "最近的代码变更可能没有充分测试";
    why4 = "开发流程中测试环节缺失或不足";
    why5 = "项目进度压力导致质量控制被忽视";
  }
  
  if (taskAnalysis && taskAnalysis.taskQualityMetrics.reopenCount > 0) {
    why4 = "任务多次重新打开，说明需求理解或实现存在问题";
  }
  
  return {
    why1,
    why2,
    why3,
    why4,
    why5,
    rootCauseSummary: generateRootCauseSummary(why1, why5),
  };
}

/**
 * 生成修复建议（集成模式库）
 */
function generateRecommendations(
  impact: ErrorRootCauseReport["impactAnalysis"],
  fiveWhys?: ErrorRootCauseReport["fiveWhysAnalysis"],
  matchedPattern?: { id: string; fixSuggestions: string[]; preventionMeasures: string[] },
): ErrorRootCauseReport["recommendations"] {
  const immediate: string[] = [];
  const preventive: string[] = [];
  const process: string[] = [];
  
  // 立即修复措施
  if (impact.severity === "critical" || impact.severity === "high") {
    immediate.push("立即修复此错误，避免影响更多用户");
    immediate.push("通知相关团队成员");
  } else {
    immediate.push("在下一个 Sprint 中安排修复");
  }
  
  if (impact.affectedTasks.length > 0) {
    immediate.push(`检查并修复受影响的 ${impact.affectedTasks.length} 个相关任务`);
  }
  
  // 如果匹配到错误模式，添加模式的修复建议
  if (matchedPattern && matchedPattern.fixSuggestions.length > 0) {
    immediate.push(...matchedPattern.fixSuggestions.slice(0, 2)); // 添加前 2 条建议
  }
  
  // 预防措施
  preventive.push("增加单元测试覆盖，确保类似错误能被捕获");
  preventive.push("添加集成测试，验证相关功能");
  
  if (fiveWhys?.why5?.includes("测试")) {
    preventive.push("建立完善的测试流程和自动化测试框架");
  }
  
  // 如果匹配到错误模式，添加模式的预防建议
  if (matchedPattern && matchedPattern.preventionMeasures.length > 0) {
    preventive.push(...matchedPattern.preventionMeasures.slice(0, 2));
  }
  
  // 流程改进
  process.push("加强代码审查流程，确保每次变更都经过充分审查");
  process.push("建立代码质量指标，定期监控和评估");
  
  if (fiveWhys?.why5?.includes("压力")) {
    process.push("优化项目排期，避免因进度压力牺牲质量");
  }
  
  return { immediate, preventive, process };
}

/**
 * 确定预防措施（集成模式库）
 */
function determinePreventionMeasures(
  fiveWhys?: ErrorRootCauseReport["fiveWhysAnalysis"],
  impact?: ErrorRootCauseReport["impactAnalysis"],
  matchedPattern?: { id: string },
): ErrorRootCauseReport["preventionMeasures"] {
  return {
    codeReview: true, // 始终建议加强代码审查
    testing: true,    // 始终建议增加测试
    monitoring: impact?.severity === "critical" || impact?.severity === "high",
    training: fiveWhys?.why5?.includes("重视程度") || !!matchedPattern,
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

function calculateCompletionRate(task: Task): number {
  // 简化实现：基于子任务完成情况
  if (task.subtaskCount && task.subtaskDoneCount) {
    return task.subtaskDoneCount / task.subtaskCount;
  }
  return task.status === "done" ? 1 : 0;
}

function assessSeverity(task: Task, affectedTaskCount: number): ErrorRootCauseReport["impactAnalysis"]["severity"] {
  // 基于任务优先级和影响范围评估严重程度
  const priority = task.priority;
  
  if (priority === "urgent" || affectedTaskCount > 5) {
    return "critical";
  } else if (priority === "high" || affectedTaskCount > 2) {
    return "high";
  } else if (priority === "medium" || affectedTaskCount > 0) {
    return "medium";
  } else {
    return "low";
  }
}

function estimateFixEffort(
  severity: ErrorRootCauseReport["impactAnalysis"]["severity"],
  affectedFileCount: number,
): ErrorRootCauseReport["impactAnalysis"]["estimatedFixEffort"] {
  if (severity === "critical" || affectedFileCount > 10) {
    return "days";
  } else if (severity === "high" || affectedFileCount > 5) {
    return "hours";
  } else if (severity === "medium" || affectedFileCount > 1) {
    return "hours";
  } else {
    return "minutes";
  }
}

function generateRootCauseSummary(why1: string, why5?: string): string {
  if (why5) {
    return `根本原因：${why5}。直接原因：${why1}`;
  }
  return `错误原因：${why1}`;
}
