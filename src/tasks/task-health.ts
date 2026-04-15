/**
 * 任务健康度评分系统（Task Health Score）
 *
 * 对标业界实践：Linear Task Health、Jira Issue Health、Shortcut Health Indicators
 *
 * 设计理念：
 * - 前瞻性评分（Predictive），而非只记录结果
 * - 综合多维度信号：老化、验收标准、截止日期、阻塞状态、依赖延误
 * - 输出 green / yellow / red 三级，供看板展示和 Agent 决策参考
 * - 可脱离 DB 使用（纯函数），也可批量评分全项目任务
 */

import { getAgingLevel, getDaysSinceLastActivity } from "./task-aging.js";
import type { Task } from "./types.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 健康等级 */
export type HealthLevel = "green" | "yellow" | "red";

/** 单一维度扣分信号 */
export interface HealthSignal {
  /** 信号维度 */
  dimension:
    | "aging"
    | "acceptance_criteria"
    | "due_date"
    | "blocked"
    | "no_assignee"
    | "no_progress_notes"
    | "stale_in_progress"
    | "dependency_risk";
  /** 扣分值（0-100，累加后 clamp 到 100） */
  deduction: number;
  /** 人类可读的警告说明 */
  message: string;
}

/** 任务健康评分结果 */
export interface TaskHealthScore {
  taskId: string;
  /** 综合得分（0–100，100=完全健康） */
  score: number;
  /** 健康等级 */
  level: HealthLevel;
  /** 触发的扣分信号列表（按扣分从大到小排序） */
  signals: HealthSignal[];
  /** 最关键的单条说明（首个最大扣分 signal 的 message） */
  primaryConcern: string | null;
  /** 评分时间戳 */
  evaluatedAt: number;
}

// ============================================================================
// 阈值配置
// ============================================================================

/** 按 score 换算到 HealthLevel 的阈值 */
const LEVEL_THRESHOLDS = {
  GREEN_MIN: 70,  // score >= 70 → green
  YELLOW_MIN: 40, // score >= 40 → yellow；< 40 → red
} as const;

// ============================================================================
// 核心评分函数（纯函数，无 IO）
// ============================================================================

/**
 * 计算任务健康度
 *
 * 算法：从满分 100 开始逐一减去触发的扣分信号，clamp 到 [0, 100]
 * 终态任务（done/cancelled）永远返回 green（避免污染健康看板）
 */
export function calcTaskHealthScore(
  task: Task,
  opts?: {
    /** 传入上游任务列表，用于检测依赖链延误风险 */
    upstreamTasks?: Task[];
  },
): TaskHealthScore {
  const now = Date.now();

  // 终态任务直接返回满分（不参与健康评估）
  if (task.status === "done" || task.status === "cancelled") {
    return {
      taskId: task.id,
      score: 100,
      level: "green",
      signals: [],
      primaryConcern: null,
      evaluatedAt: now,
    };
  }

  const signals: HealthSignal[] = [];

  // ── 维度1：老化（Aging） ────────────────────────────────────────────────
  const agingLevel = getAgingLevel(task);
  if (agingLevel === "critical") {
    signals.push({
      dimension: "aging",
      deduction: 40,
      message: `任务已长期无活动（${getDaysSinceLastActivity(task)}天），处于危机状态`,
    });
  } else if (agingLevel === "stale") {
    signals.push({
      dimension: "aging",
      deduction: 25,
      message: `任务无活动超过阈值（${getDaysSinceLastActivity(task)}天），进度停滞`,
    });
  } else if (agingLevel === "aging") {
    signals.push({
      dimension: "aging",
      deduction: 10,
      message: `任务开始老化（${getDaysSinceLastActivity(task)}天无更新）`,
    });
  }

  // ── 维度2：验收标准（Acceptance Criteria） ──────────────────────────────
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    const total = task.acceptanceCriteria.length;
    const passed = task.acceptanceCriteria.filter((c) => c.passes).length;
    const ratio = passed / total;
    // 任务在 review/done 邻近阶段但验收未通过 → 扣大分
    if (task.status === "review" && ratio < 1) {
      const failed = total - passed;
      signals.push({
        dimension: "acceptance_criteria",
        deduction: 30,
        message: `处于 review 状态但仍有 ${failed}/${total} 项验收标准未通过`,
      });
    } else if (task.status === "in-progress" && ratio === 0 && total > 0) {
      signals.push({
        dimension: "acceptance_criteria",
        deduction: 10,
        message: `${total} 项验收标准全部未开始验证`,
      });
    }
  }

  // ── 维度3：截止日期（Due Date） ─────────────────────────────────────────
  if (task.dueDate) {
    const msToDue = task.dueDate - now;
    const hoursToDue = msToDue / (1000 * 60 * 60);

    if (msToDue < 0) {
      // 已逾期
      const overdueHours = Math.abs(hoursToDue);
      const deduction = Math.min(50, 20 + Math.floor(overdueHours / 24) * 5);
      signals.push({
        dimension: "due_date",
        deduction,
        message: `已逾期 ${Math.floor(overdueHours / 24)} 天 ${Math.floor(overdueHours % 24)} 小时`,
      });
    } else if (hoursToDue < 24) {
      signals.push({
        dimension: "due_date",
        deduction: 25,
        message: `截止时间不足 24 小时（${Math.ceil(hoursToDue)}h 后到期）`,
      });
    } else if (hoursToDue < 72) {
      signals.push({
        dimension: "due_date",
        deduction: 15,
        message: `截止时间不足 3 天（${Math.ceil(hoursToDue / 24)}天后到期）`,
      });
    } else if (hoursToDue < 7 * 24) {
      signals.push({
        dimension: "due_date",
        deduction: 5,
        message: `截止时间不足 1 周（${Math.ceil(hoursToDue / 24)}天后到期）`,
      });
    }
  }

  // ── 维度4：阻塞状态（Blocked） ──────────────────────────────────────────
  if (task.status === "blocked") {
    const blockedHours =
      (now - (task.timeTracking.lastActivityAt ?? task.updatedAt ?? task.createdAt)) /
      (1000 * 60 * 60);
    const deduction = Math.min(45, 20 + Math.floor(blockedHours / 2) * 3);
    signals.push({
      dimension: "blocked",
      deduction,
      message: `任务已阻塞 ${Math.ceil(blockedHours)} 小时未解除`,
    });
  }

  // ── 维度5：无执行者（No Assignee） ─────────────────────────────────────
  if (!task.assignees || task.assignees.length === 0) {
    const ageHours = (now - task.createdAt) / (1000 * 60 * 60);
    if (ageHours >= 2) {
      signals.push({
        dimension: "no_assignee",
        deduction: 20,
        message: `任务创建 ${Math.ceil(ageHours)} 小时后仍无执行者`,
      });
    }
  }

  // ── 维度6：无进展笔记（No Progress Notes） ─────────────────────────────
  if (task.status === "in-progress") {
    const hasRecentNote =
      task.progressNotes &&
      task.progressNotes.length > 0 &&
      task.progressNotes[task.progressNotes.length - 1].createdAt > now - 4 * 60 * 60 * 1000;

    if (!hasRecentNote) {
      const inProgressHours =
        (now - (task.timeTracking.startedAt ?? task.timeTracking.lastActivityAt ?? task.createdAt)) /
        (1000 * 60 * 60);
      if (inProgressHours >= 2) {
        signals.push({
          dimension: "no_progress_notes",
          deduction: 15,
          message: `进行中 ${Math.ceil(inProgressHours)} 小时但无进展笔记（可能是幽灵进展）`,
        });
      }
    }
  }

  // ── 维度7：依赖链风险（Dependency Risk） ───────────────────────────────
  if (opts?.upstreamTasks && opts.upstreamTasks.length > 0) {
    const blockedDeps = opts.upstreamTasks.filter(
      (t) => t.status === "blocked" || t.status === "cancelled",
    );
    const overdueDeps = opts.upstreamTasks.filter(
      (t) => t.dueDate && t.dueDate < now && t.status !== "done" && t.status !== "cancelled",
    );
    if (blockedDeps.length > 0) {
      signals.push({
        dimension: "dependency_risk",
        deduction: 20,
        message: `${blockedDeps.length} 个上游依赖任务被阻塞或已取消`,
      });
    } else if (overdueDeps.length > 0) {
      signals.push({
        dimension: "dependency_risk",
        deduction: 15,
        message: `${overdueDeps.length} 个上游依赖任务已逾期`,
      });
    }
  }

  // ── 计算最终分数 ─────────────────────────────────────────────────────────
  // 按扣分从大到小排序，方便 UI 展示最关键问题
  signals.sort((a, b) => b.deduction - a.deduction);
  const totalDeduction = signals.reduce((acc, s) => acc + s.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));

  const level: HealthLevel =
    score >= LEVEL_THRESHOLDS.GREEN_MIN
      ? "green"
      : score >= LEVEL_THRESHOLDS.YELLOW_MIN
        ? "yellow"
        : "red";

  return {
    taskId: task.id,
    score,
    level,
    signals,
    primaryConcern: signals[0]?.message ?? null,
    evaluatedAt: now,
  };
}

/**
 * 批量评分一组任务
 *
 * 会自动建立 taskId→Task 的查找表，用于依赖链风险检测
 */
export function calcBatchTaskHealth(tasks: Task[]): Map<string, TaskHealthScore> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const results = new Map<string, TaskHealthScore>();

  for (const task of tasks) {
    // 收集上游依赖任务
    const upstreamTasks: Task[] = [];
    if (task.dependencies && task.dependencies.length > 0) {
      for (const depId of task.dependencies) {
        const dep = taskMap.get(depId);
        if (dep) {
          upstreamTasks.push(dep);
        }
      }
    }
    if (task.blockedBy && task.blockedBy.length > 0) {
      for (const depId of task.blockedBy) {
        const dep = taskMap.get(depId);
        if (dep && !upstreamTasks.find((t) => t.id === dep.id)) {
          upstreamTasks.push(dep);
        }
      }
    }
    results.set(task.id, calcTaskHealthScore(task, { upstreamTasks }));
  }
  return results;
}

/**
 * 获取项目/团队的健康度摘要
 *
 * 返回各健康等级的任务数量分布，用于 Dashboard 概览
 */
export function summarizeHealthScores(scores: Map<string, TaskHealthScore>): {
  green: number;
  yellow: number;
  red: number;
  averageScore: number;
  criticalTaskIds: string[];
} {
  let green = 0, yellow = 0, red = 0, totalScore = 0;
  const criticalTaskIds: string[] = [];

  for (const score of scores.values()) {
    totalScore += score.score;
    if (score.level === "green") {green++;}
    else if (score.level === "yellow") {yellow++;}
    else {
      red++;
      criticalTaskIds.push(score.taskId);
    }
  }

  const count = scores.size;
  return {
    green,
    yellow,
    red,
    averageScore: count > 0 ? Math.round(totalScore / count) : 100,
    criticalTaskIds,
  };
}
