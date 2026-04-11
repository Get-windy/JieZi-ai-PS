/**
 * 任务结果验证与问责机制
 *
 * 解决 AI Agent "敷衍式汇报" 问题
 * 基于业界最佳实践：Outcome-Based（基于结果）而非 Activity-Based（基于活动）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as storage from "./storage.js";
import type { Task } from "./types.js";

// ============================================================================
// 文件系统产出物验证辅助函数
// ============================================================================

/**
 * 检查项目工作区目录是否有近期文件变更（默认 2 小时内）
 *
 * 这是判断 AI Agent 是否真实产出工作成果的核心依据之一。
 * 如果 workspace 目录内有近期更新的文件，说明 Agent 确实在工作。
 */
export function checkWorkspaceActivity(
  workspacePath: string,
  windowMs: number = 2 * 60 * 60 * 1000, // 默认 2 小时
): { hasActivity: boolean; latestFile?: string; latestMtime?: number; fileCount: number } {
  if (!workspacePath || !fs.existsSync(workspacePath)) {
    return { hasActivity: false, fileCount: 0 };
  }

  const now = Date.now();
  const threshold = now - windowMs;
  let latestFile: string | undefined;
  let latestMtime = 0;
  let fileCount = 0;

  function scanDir(dir: string, depth = 0): void {
    if (depth > 6) {
      return;
    } // 防止过深递归
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // 跳过隐藏目录和 node_modules
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else {
          const stat = fs.statSync(fullPath);
          fileCount++;
          if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs;
            latestFile = fullPath;
          }
        }
      }
    } catch {
      // 无读取权限时跳过
    }
  }

  scanDir(workspacePath);

  return {
    hasActivity: latestMtime >= threshold,
    latestFile,
    latestMtime: latestMtime || undefined,
    fileCount,
  };
}

/**
 * 检查 metadata.deliverableUrl/evidencePaths 指向的文件是否真实存在
 */
function verifyDeliverableFiles(task: Task): { verified: boolean; paths: string[] } {
  const paths: string[] = [];

  // 检查 deliverableUrl（本地路径）
  const deliverableUrl = task.metadata?.deliverableUrl;
  if (typeof deliverableUrl === "string" && deliverableUrl) {
    // 如果是本地绝对路径
    if (path.isAbsolute(deliverableUrl) && fs.existsSync(deliverableUrl)) {
      paths.push(deliverableUrl);
    } else if (deliverableUrl.startsWith("http")) {
      // 远程 URL 被视为已验证
      paths.push(deliverableUrl);
    }
  }

  // 检查 evidencePaths 数组
  const evidencePaths = task.metadata?.evidencePaths;
  if (Array.isArray(evidencePaths)) {
    for (const p of evidencePaths) {
      if (typeof p === "string" && p) {
        if (path.isAbsolute(p) && fs.existsSync(p)) {
          paths.push(p);
        } else if (p.startsWith("http")) {
          paths.push(p);
        }
      }
    }
  }

  return { verified: paths.length > 0, paths };
}

// ============================================================================
// 核心问题诊断
// ============================================================================

/**
 * 🚨 当前问题：管理 Agent 定期汇报但项目不推进
 *
 * 根本原因：
 * 1. 评价标准错误：把"汇报了"当作"完成了"
 * 2. 缺少结果验证：Agent 说"进行中"就算过关
 * 3. 没有问责机制：敷衍不会带来任何后果
 *
 * 业界最佳实践（TechTarget, Electric Mind）:
 * - OKR (Objectives and Key Results)：关注可量化的关键结果
 * - Outcome-Based Evaluation：基于实际成果而非活动报告
 * - Accountability Framework：明确的问责制和升级机制
 */

// ============================================================================
// 结果验证指标
// ============================================================================

/**
 * 任务进展质量评分（0-100 分）
 */
export interface ProgressQualityScore {
  /** 任务 ID */
  taskId: string;
  /** 总体评分 (0-100) */
  overallScore: number;
  /** 是否有可验证的产出物 */
  hasDeliverables: boolean;
  /** 是否完成阶段性目标 */
  milestoneProgress: boolean;
  /** 时间利用效率 */
  timeEfficiency: number; // 0-1
  /** 是否主动解决问题 */
  problemSolving: boolean;
  /** 评估时间戳 */
  evaluatedAt: number;
}

/**
 * 定义什么是"真正的进展"
 *
 * ❌ 敷衍式汇报：
 * - "我正在做..."
 * - "已经完成了 50%..."
 * - "预计很快完成..."
 *
 * ✅ 真实进展（必须满足至少一项）：
 * - ✅ 产出了具体交付物（代码、文档、设计等）
 * - ✅ 完成了明确的里程碑节点
 * - ✅ 解决了具体的技术难题或阻塞
 * - ✅ 获得了外部反馈或确认（用户测试、代码审查通过等）
 */
export function validateRealProgress(task: Task): {
  hasRealProgress: boolean;
  evidence: string[];
  quality: "high" | "medium" | "low" | "fake";
} {
  const evidence: string[] = [];

  // ✔ 优先检查：验收标准（Ralph acceptanceCriteria 实践 —— 最可靠的客观依据）
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    const total = task.acceptanceCriteria.length;
    const passed = task.acceptanceCriteria.filter((c) => c.passes).length;
    if (passed > 0) {
      evidence.push(`验收标准通过 ${passed}/${total} 项`);
    }
    // 全部通过 → 直接返回高质量，无需再检测其他证据
    if (passed === total) {
      return { hasRealProgress: true, evidence, quality: "high" };
    }
    // 部分通过
    if (passed > 0) {
      return {
        hasRealProgress: true,
        evidence,
        quality: passed / total >= 0.5 ? "medium" : "low",
      };
    }
  }

  // 检查 1: 是否有附件（文档、代码文件等）
  if (task.attachments && task.attachments.length > 0) {
    evidence.push(`有 ${task.attachments.length} 个附件`);
  }

  // 检查 2: 是否有评论（讨论、反馈等）
  if (task.comments && task.comments.length > 0) {
    evidence.push(`有 ${task.comments.length} 条评论/更新`);
  }

  // 检查 3: 是否有工作日志（Agent 实际工作的证据）
  if (task.workLogs && task.workLogs.length > 0) {
    const completedLogs = task.workLogs.filter((log) => log.result === "success");
    if (completedLogs.length > 0) {
      evidence.push(`完成 ${completedLogs.length} 个工作项`);
    }
  }

  // 检查 4: 元数据中的验证信息
  if (
    task.metadata?.verifiedBy ||
    task.metadata?.codeReviewPassed ||
    task.metadata?.testPassed ||
    task.metadata?.deliverableUrl
  ) {
    evidence.push("已通过外部验证或有交付物");
  }

  // 检查 5: 文件系统产出物验证（真实文件存在性）
  const deliverableCheck = verifyDeliverableFiles(task);
  if (deliverableCheck.verified) {
    evidence.push(`文件系统有 ${deliverableCheck.paths.length} 个可验证交付物`);
  }

  // 检查 6: 项目工作区近期文件活动（傅3小时内）
  const workspacePath =
    typeof task.metadata?.workspacePath === "string" ? task.metadata.workspacePath : undefined;
  if (workspacePath) {
    const wsActivity = checkWorkspaceActivity(workspacePath, 3 * 60 * 60 * 1000);
    if (wsActivity.hasActivity) {
      const minsAgo = wsActivity.latestMtime
        ? Math.round((Date.now() - wsActivity.latestMtime) / 60_000)
        : 0;
      evidence.push(`工作区有近期变更（最近: ${minsAgo}分钟前）`);
    }
  }

  // 检查 5: 时间线分析（长时间无活动 = 可疑）
  const _hoursInactive =
    (Date.now() - (task.timeTracking.lastActivityAt ?? task.updatedAt ?? task.createdAt)) /
    (1000 * 60 * 60);
  const statusDuration =
    task.status === "in-progress"
      ? (Date.now() - (task.timeTracking.startedAt ?? task.createdAt)) / (1000 * 60 * 60)
      : 0;

  // 如果状态是"进行中"但超过 6 小时没有任何产出 → 可疑
  if (task.status === "in-progress" && statusDuration > 6 && evidence.length === 0) {
    return {
      hasRealProgress: false,
      evidence: ["长时间无产出"],
      quality: "fake", // 疑似敷衍
    };
  }

  // 判断质量等级
  let quality: "high" | "medium" | "low" | "fake" = "fake";

  if (evidence.length >= 3) {
    quality = "high"; // 多个证据，高质量
  } else if (evidence.length >= 2) {
    quality = "medium"; // 中等证据
  } else if (evidence.length >= 1) {
    quality = "low"; // 少量证据
  }

  return {
    hasRealProgress: evidence.length > 0,
    evidence,
    quality,
  };
}

// ============================================================================
// 问责机制
// ============================================================================

/**
 * 问责级别
 */
export type AccountabilityLevel =
  | "normal" // 正常推进
  | "warning" // 警告（进展缓慢）
  | "investigation" // 需要调查（疑似敷衍）
  | "escalation"; // 升级处理（确认敷衍）

/**
 * 生成问责评估报告
 */
export async function generateAccountabilityReport(projectId: string): Promise<{
  level: AccountabilityLevel;
  tasks: Array<{
    task: Task;
    progressValidation: ReturnType<typeof validateRealProgress>;
    recommendation: string;
  }>;
  summary: string;
}> {
  const allTasks = await storage.listTasks({
    projectId,
    status: ["in-progress", "blocked"],
  });

  const suspiciousTasks: Array<{
    task: Task;
    progressValidation: ReturnType<typeof validateRealProgress>;
    recommendation: string;
  }> = [];

  for (const task of allTasks) {
    const validation = validateRealProgress(task);

    // 检测可疑任务
    if (validation.quality === "fake" || validation.quality === "low") {
      suspiciousTasks.push({
        task,
        progressValidation: validation,
        recommendation: generateRecommendation(task, validation),
      });
    }
  }

  // 确定问责级别
  let level: AccountabilityLevel = "normal";
  const suspiciousRate = suspiciousTasks.length / Math.max(allTasks.length, 1);

  if (suspiciousRate > 0.5) {
    level = "escalation"; // 超过 50% 任务可疑 → 升级
  } else if (suspiciousRate > 0.3) {
    level = "investigation"; // 30-50% → 调查
  } else if (suspiciousRate > 0.1) {
    level = "warning"; // 10-30% → 警告
  }

  const summary = generateSummary(allTasks.length, suspiciousTasks.length, level);

  return {
    level,
    tasks: suspiciousTasks,
    summary,
  };
}

/**
 * 生成改进建议
 */
function generateRecommendation(
  task: Task,
  validation: ReturnType<typeof validateRealProgress>,
): string {
  if (validation.quality === "fake") {
    return `⚠️ 立即要求执行者提供具体产出物证明，否则重新分配任务`;
  }

  if (validation.quality === "low") {
    return `📋 要求执行者在下次汇报时展示具体进展（代码/文档/测试结果）`;
  }

  return "";
}

/**
 * 生成摘要报告
 */
function generateSummary(
  totalTasks: number,
  suspiciousCount: number,
  level: AccountabilityLevel,
): string {
  const rate = ((suspiciousCount / Math.max(totalTasks, 1)) * 100).toFixed(1);

  const levelText = {
    normal: "✅ 项目正常推进",
    warning: "⚠️ 部分任务进展缓慢",
    investigation: "🔍 存在敷衍嫌疑，需要调查",
    escalation: "🚨 严重问题！大量任务未真正推进",
  }[level];

  return `${levelText}（${suspiciousCount}/${totalTasks} 任务可疑，占比 ${rate}%）`;
}

// ============================================================================
// 防敷衍汇报机制
// ============================================================================

/**
 * 验证进度汇报的质量
 *
 * @param reportText Agent 提交的进度汇报
 * @param task 关联任务
 */
export function validateProgressReportQuality(
  reportText: string,
  _task: Task,
): { score: number; issues: string[]; passed: boolean } {
  const issues: string[] = [];
  let score = 100;

  // 检查 1: 是否包含模糊词汇（敷衍特征）
  const vaguePatterns = [/正在.*中/, /预计.*完成/, /大概.*左右/, /应该.*可以/, /差不多/, /基本上/];

  for (const pattern of vaguePatterns) {
    if (pattern.test(reportText)) {
      issues.push("使用了模糊表述，缺乏具体信息");
      score -= 20;
    }
  }

  // 检查 2: 是否缺少具体数据
  const hasNumbers = /\d+%|\d+\/\d+|完成.*个/.test(reportText);
  if (!hasNumbers) {
    issues.push("没有量化进展，无法验证完成度");
    score -= 30;
  }

  // 检查 3: 是否提到具体产出物
  const deliverableKeywords = [
    "代码",
    "文档",
    "测试",
    "提交",
    "PR",
    "commit",
    "文件",
    "功能",
    "模块",
  ];
  const hasDeliverables = deliverableKeywords.some((kw) => reportText.includes(kw));
  if (!hasDeliverables) {
    issues.push("未提及具体交付物");
    score -= 30;
  }

  // 检查 4: 是否有关键结果（Key Results）
  const outcomeKeywords = ["完成", "实现", "解决", "通过", "验证"];
  const hasOutcomes = outcomeKeywords.some((kw) => reportText.includes(kw));
  if (!hasOutcomes) {
    issues.push("只描述活动，未说明实际成果");
    score -= 20;
  }

  return {
    score: Math.max(0, score),
    issues,
    passed: score >= 60,
  };
}

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 在管理 Agent 汇报前调用，确保汇报质量
 *
 * 使用方法：
 * 1. Agent 准备汇报内容
 * 2. 调用 validateProgressReportQuality() 自检
 * 3. 如果分数 < 60，要求 Agent 重新生成更具体的汇报
 * 4. 通过后才能发送给人类主管
 */
export async function enforceQualityReporting(
  projectId: string,
  agentId: string,
  reportText: string,
): Promise<{ passed: boolean; feedback?: string }> {
  // 获取该 Agent 负责任务列表
  const tasks = await storage.listTasks({
    projectId,
    assigneeId: agentId,
    status: ["in-progress"],
  });

  // 验证每个任务的汇报质量
  const validations = tasks.map((task) => ({
    task,
    validation: validateProgressReportQuality(reportText, task),
  }));

  const failedValidations = validations.filter((v) => !v.validation.passed);

  if (failedValidations.length > 0) {
    // 生成改进建议
    const feedback = [
      `❌ 汇报质量不达标，请补充具体信息：`,
      ``,
      ...failedValidations.flatMap((v) => [
        `**任务**: ${v.task.title}`,
        `**问题**:`,
        ...v.validation.issues.map((i) => `  - ${i}`),
        `**建议**: 请提供具体的数字、交付物和完成证明`,
        ``,
      ]),
    ].join("\n");

    return {
      passed: false,
      feedback,
    };
  }

  return { passed: true };
}

// ============================================================================
// 验收标准汇报（Ralph 实践）
// ============================================================================

/**
 * 生成任务的验收标准完成情况汇报
 *
 * 对应 Ralph 的 `cat prd.json | jq '.userStories[] | {id, title, passes}'` 命令输出。
 * 用于密集汇报和 Agent 自检时快速判断还有哪些验收项未完成。
 */
export function validateAcceptanceCriteria(task: Task): {
  /** 是否所有验收标准已通过 */
  allPassed: boolean;
  /** 尚未通过的标准列表 */
  failing: Array<{ id: string; description: string; note?: string }>;
  /** 已通过的标准数 */
  passedCount: number;
  /** 总标准数 */
  totalCount: number;
  /** 完成百分比 (0-100) */
  completionPct: number;
  /** 可展示的简要文本 */
  summary: string;
} {
  const criteria = task.acceptanceCriteria ?? [];
  const totalCount = criteria.length;

  if (totalCount === 0) {
    return {
      allPassed: true, // 无验收标准，不阻塞
      failing: [],
      passedCount: 0,
      totalCount: 0,
      completionPct: 100,
      summary: "无验收标准（可直接完成）",
    };
  }

  const failing = criteria
    .filter((c) => !c.passes)
    .map((c) => ({ id: c.id, description: c.description, note: c.note }));
  const passedCount = totalCount - failing.length;
  const completionPct = Math.round((passedCount / totalCount) * 100);
  const allPassed = failing.length === 0;

  const summary = allPassed
    ? `✅ 所有 ${totalCount} 项验收标准已通过`
    : `❌ ${failing.length}/${totalCount} 项验收标准未通过（完成度 ${completionPct}%）`;

  return { allPassed, failing, passedCount, totalCount, completionPct, summary };
}
