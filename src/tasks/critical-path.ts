/**
 * Critical Path Analysis — 关键路径计算
 *
 * 基于任务依赖关系图做拓扑排序 + 最长路径（Critical Path Method, CPM）
 *
 * 参考业界实践：
 * - CPM（Critical Path Method）— 项目管理经典算法
 * - PERT（Program Evaluation and Review Technique）
 * - Linear: Dependencies & blocking tasks
 * - Jira: Advanced Roadmaps 关键路径
 *
 * 算法：
 * 1. 构建有向无环图（DAG）：边 A→B 表示"A 必须在 B 之前完成"
 * 2. 拓扑排序（Kahn's Algorithm）
 * 3. 前向传播（Forward Pass）计算 ES/EF（最早开始/完成）
 * 4. 后向传播（Backward Pass）计算 LS/LF（最晚开始/完成）
 * 5. 浮动时间（Float）= LS - ES，浮动 = 0 的路径即为关键路径
 */

import type { Task } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 节点时间分析结果 */
export interface CriticalNode {
  taskId: string;
  title: string;
  /** 估算工期（小时）*/
  durationHours: number;
  /** 最早开始时间偏移（相对于项目开始的小时数） */
  earlyStart: number;
  /** 最早完成时间偏移（小时数） */
  earlyFinish: number;
  /** 最晚开始时间偏移（小时数） */
  lateStart: number;
  /** 最晚完成时间偏移（小时数） */
  lateFinish: number;
  /** 浮动时间（小时）— 0 表示关键路径节点 */
  totalFloat: number;
  /** 是否在关键路径上 */
  isCritical: boolean;
  /** 直接前置任务 IDs */
  predecessors: string[];
  /** 直接后继任务 IDs */
  successors: string[];
}

/** 关键路径分析结果 */
export interface CriticalPathResult {
  /** 是否存在循环依赖 */
  hasCycle: boolean;
  /** 循环依赖中涉及的任务 IDs（如有） */
  cycleTaskIds?: string[];
  /** 项目最短完成时间（小时，沿关键路径） */
  projectDurationHours: number;
  /** 关键路径上的任务列表（按顺序） */
  criticalPath: CriticalNode[];
  /** 所有任务的节点分析（包含非关键任务） */
  allNodes: Map<string, CriticalNode>;
  /** 关键路径任务 IDs（快速查询） */
  criticalTaskIds: string[];
  /** 路径摘要描述 */
  summary: string;
  /** 高风险节点（浮动 < 8h 且非关键路径） */
  nearCriticalTaskIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从 storyPoints 估算工期（小时）
 * 默认换算：1 SP = 4h，可通过配置覆盖
 */
function estimateDurationHours(task: Task, hoursPerSP = 4): number {
  if (task.storyPoints != null && task.storyPoints > 0) {
    return task.storyPoints * hoursPerSP;
  }
  // 无估算时，默认用 priority 推测
  switch (task.priority) {
    case "critical":
      return 16;
    case "high":
      return 8;
    case "medium":
      return 4;
    case "low":
      return 2;
    default:
      return 4;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 计算任务列表的关键路径。
 *
 * @param tasks       - 待分析的任务列表（应过滤掉 done/cancelled 任务，或保留全量）
 * @param opts.includeCompleted - 是否将已完成任务纳入分析（默认 false，只算未完成任务）
 * @param opts.hoursPerSP       - 每个故事点对应小时数（默认 4）
 * @param opts.nearCriticalThresholdHours - 近关键路径浮动阈值（默认 8h）
 */
export function calcCriticalPath(
  tasks: Task[],
  opts?: {
    includeCompleted?: boolean;
    hoursPerSP?: number;
    nearCriticalThresholdHours?: number;
  },
): CriticalPathResult {
  const hoursPerSP = opts?.hoursPerSP ?? 4;
  const nearCriticalThreshold = opts?.nearCriticalThresholdHours ?? 8;

  // 过滤任务
  const activeTasks = opts?.includeCompleted
    ? tasks
    : tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  if (activeTasks.length === 0) {
    return {
      hasCycle: false,
      projectDurationHours: 0,
      criticalPath: [],
      allNodes: new Map(),
      criticalTaskIds: [],
      nearCriticalTaskIds: [],
      summary: "无活跃任务，无法计算关键路径。",
    };
  }

  // ── 1. 构建 ID 索引 ──
  const taskMap = new Map<string, Task>();
  for (const t of activeTasks) {
    taskMap.set(t.id, t);
  }

  // ── 2. 解析依赖关系（仅考虑 "blocks" 类型依赖：A blocks B → B 依赖 A） ──
  // predecessors[B] = [A, ...]  意为 A 完成后 B 才能开始
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();

  for (const t of activeTasks) {
    predecessors.set(t.id, []);
    successors.set(t.id, []);
  }

  for (const t of activeTasks) {
    if (!t.dependencies) continue;
    for (const dep of t.dependencies) {
      // dep.taskId 是前置任务（blocks current task），当前任务 t 依赖 dep.taskId
      if (taskMap.has(dep.taskId)) {
        predecessors.get(t.id)?.push(dep.taskId);
        successors.get(dep.taskId)?.push(t.id);
      }
    }
  }

  // ── 3. Kahn's Algorithm 拓扑排序（同时检测循环） ──
  const inDegree = new Map<string, number>();
  for (const t of activeTasks) {
    inDegree.set(t.id, predecessors.get(t.id)?.length ?? 0);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);
    visited.add(current);

    for (const succ of successors.get(current) ?? []) {
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  // 检测循环
  if (topoOrder.length < activeTasks.length) {
    const cycleTaskIds = activeTasks
      .filter((t) => !visited.has(t.id))
      .map((t) => t.id);
    return {
      hasCycle: true,
      cycleTaskIds,
      projectDurationHours: 0,
      criticalPath: [],
      allNodes: new Map(),
      criticalTaskIds: [],
      nearCriticalTaskIds: [],
      summary: `检测到循环依赖！涉及任务: ${cycleTaskIds.slice(0, 5).join(", ")}${cycleTaskIds.length > 5 ? "..." : ""}`,
    };
  }

  // ── 4. 前向传播（Forward Pass）计算 ES/EF ──
  const durationMap = new Map<string, number>();
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const t of activeTasks) {
    durationMap.set(t.id, estimateDurationHours(t, hoursPerSP));
  }

  for (const id of topoOrder) {
    const duration = durationMap.get(id) ?? 0;
    const maxPredEF = Math.max(
      0,
      ...(predecessors.get(id) ?? []).map((predId) => earlyFinish.get(predId) ?? 0),
    );
    earlyStart.set(id, maxPredEF);
    earlyFinish.set(id, maxPredEF + duration);
  }

  // 项目总工期 = 所有叶节点的最大 EF
  const projectDuration = Math.max(0, ...Array.from(earlyFinish.values()));

  // ── 5. 后向传播（Backward Pass）计算 LS/LF ──
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  // 初始化：所有叶节点 LF = projectDuration
  for (const id of activeTasks.map((t) => t.id)) {
    lateFinish.set(id, projectDuration);
  }

  for (const id of [...topoOrder].reverse()) {
    const duration = durationMap.get(id) ?? 0;
    const minSuccLS = Math.min(
      projectDuration,
      ...(successors.get(id) ?? []).map((succId) => lateStart.get(succId) ?? projectDuration),
    );
    lateFinish.set(id, minSuccLS);
    lateStart.set(id, minSuccLS - duration);
  }

  // ── 6. 计算浮动时间，构建节点 ──
  const allNodes = new Map<string, CriticalNode>();

  for (const t of activeTasks) {
    const es = earlyStart.get(t.id) ?? 0;
    const ef = earlyFinish.get(t.id) ?? 0;
    const ls = lateStart.get(t.id) ?? 0;
    const lf = lateFinish.get(t.id) ?? 0;
    const totalFloat = Math.max(0, ls - es);
    const isCritical = totalFloat === 0;

    allNodes.set(t.id, {
      taskId: t.id,
      title: t.title,
      durationHours: durationMap.get(t.id) ?? 0,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      isCritical,
      predecessors: predecessors.get(t.id) ?? [],
      successors: successors.get(t.id) ?? [],
    });
  }

  // ── 7. 提取关键路径（按 earlyStart 排序） ──
  const criticalNodes = Array.from(allNodes.values())
    .filter((n) => n.isCritical)
    .sort((a, b) => a.earlyStart - b.earlyStart);

  const criticalTaskIds = criticalNodes.map((n) => n.taskId);

  // ── 8. 近关键路径 ──
  const nearCriticalTaskIds = Array.from(allNodes.values())
    .filter((n) => !n.isCritical && n.totalFloat <= nearCriticalThreshold)
    .map((n) => n.taskId);

  // ── 9. 生成摘要 ──
  const totalDays = Math.round(projectDuration / 8); // 假设8h工作日
  const criticalTitles = criticalNodes
    .slice(0, 5)
    .map((n) => `"${n.title}"`)
    .join(" → ");
  const summary = [
    `关键路径长度: ${projectDuration}h（约${totalDays}工作日）`,
    `关键任务(${criticalTaskIds.length}个): ${criticalTitles}${criticalNodes.length > 5 ? "..." : ""}`,
    nearCriticalTaskIds.length > 0
      ? `近关键路径风险任务: ${nearCriticalTaskIds.length}个（浮动≤${nearCriticalThreshold}h）`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    hasCycle: false,
    projectDurationHours: projectDuration,
    criticalPath: criticalNodes,
    allNodes,
    criticalTaskIds,
    nearCriticalTaskIds,
    summary,
  };
}

/**
 * 生成关键路径报告文本（适合打印/注入 prompt）
 */
export function formatCriticalPathReport(result: CriticalPathResult): string {
  if (result.hasCycle) {
    return `❌ 关键路径分析失败：${result.summary}`;
  }
  if (result.criticalPath.length === 0) {
    return "ℹ️ 无活跃任务依赖链，关键路径为空。";
  }

  const lines = [
    `## 关键路径分析`,
    result.summary,
    "",
    "**关键路径节点** (浮动=0，任何延迟都将推迟整体完成):",
  ];

  for (const node of result.criticalPath) {
    lines.push(
      `  🔴 [ES:${node.earlyStart}h] ${node.title} (${node.durationHours}h) → EF:${node.earlyFinish}h`,
    );
  }

  if (result.nearCriticalTaskIds.length > 0) {
    lines.push("", `**近关键路径风险** (${result.nearCriticalTaskIds.length}个，需重点关注):`);
    const allNodes = result.allNodes;
    for (const id of result.nearCriticalTaskIds.slice(0, 5)) {
      const node = allNodes.get(id);
      if (node) {
        lines.push(`  🟡 ${node.title} (浮动: ${node.totalFloat}h)`);
      }
    }
    if (result.nearCriticalTaskIds.length > 5) {
      lines.push(`  ... 还有 ${result.nearCriticalTaskIds.length - 5} 个`);
    }
  }

  return lines.join("\n");
}
