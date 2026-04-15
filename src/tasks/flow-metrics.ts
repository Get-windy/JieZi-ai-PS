/**
 * Flow Metrics — 基于 DORA/Flow Framework 的交付效率度量
 *
 * 参考业界实践：
 * - DORA 2024: Cycle Time / Lead Time / Deployment Frequency
 * - Mik Kersten "Project to Product": Flow Load / Flow Velocity / Flow Efficiency
 * - Linear: 内置 cycle time 和 lead time 图表
 * - TheBotCompany: Cycle Report 自动生成
 *
 * 三大核心指标：
 * 1. CycleTime  — 从"开始开发"到"完成交付"（in_progress → done）
 * 2. LeadTime   — 从"任务创建"到"完成交付"（created → done）
 * 3. Throughput — 单位时间内完成的任务/故事点数量
 */

import type { Task, TaskStatus } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowMetricsWindow {
  /** 统计窗口开始时间（Unix ms），默认过去30天 */
  from: number;
  /** 统计窗口结束时间（Unix ms），默认当前 */
  to: number;
  /** 窗口长度（天） */
  days: number;
}

export interface CycleTimeStats {
  /** 样本数量（期间完成的任务数） */
  sampleCount: number;
  /** 平均周期时间（小时） */
  avgHours: number;
  /** 中位数周期时间（小时） */
  medianHours: number;
  /** p85 分位数（小时）— 代表"大多数任务完成时间" */
  p85Hours: number;
  /** p95 分位数（小时）— 识别离群值 */
  p95Hours: number;
  /** 最短（小时） */
  minHours: number;
  /** 最长（小时） */
  maxHours: number;
}

export interface LeadTimeStats {
  /** 样本数量 */
  sampleCount: number;
  /** 平均前置时间（小时） */
  avgHours: number;
  /** 中位数（小时） */
  medianHours: number;
  /** p85 分位数（小时） */
  p85Hours: number;
}

export interface ThroughputStats {
  /** 窗口内完成的任务总数 */
  tasksCompleted: number;
  /** 窗口内完成的故事点总数 */
  storyPointsCompleted: number;
  /** 每天平均完成任务数 */
  tasksPerDay: number;
  /** 每天平均完成故事点数 */
  pointsPerDay: number;
  /** 每周完成任务数（基于窗口平均） */
  tasksPerWeek: number;
}

export interface FlowEfficiency {
  /**
   * 流动效率 = 主动工作时间 / 总周期时间
   * 理想值 > 40%；低于 15% 说明等待时间过长
   */
  efficiency: number;
  /** 等待时间占比（1 - efficiency） */
  waitRatio: number;
}

export interface WipSnapshot {
  /** 当前 in_progress 任务数 */
  current: number;
  /** in_progress + review + testing 总计 */
  total: number;
  /** 超 WIP 限制的状态列表 */
  overLimitStatuses: string[];
}

export interface FlowMetricsResult {
  window: FlowMetricsWindow;
  cycleTime: CycleTimeStats | null;
  leadTime: LeadTimeStats | null;
  throughput: ThroughputStats;
  flowEfficiency: FlowEfficiency | null;
  wip: WipSnapshot;
  /** 按优先级分层的周期时间（可空） */
  cycleTimeByPriority?: Record<string, Pick<CycleTimeStats, "sampleCount" | "medianHours">>;
  /** 按任务类型分层的周期时间（可空） */
  cycleTimeByType?: Record<string, Pick<CycleTimeStats, "sampleCount" | "medianHours">>;
  /** 健康诊断建议 */
  insights: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function msToHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 10) / 10; // 保留1位小数
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) {return 0;}
  if (sortedArr.length === 1) {return sortedArr[0];}
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {return sortedArr[lo];}
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function buildStats(durationsMsArr: number[]): CycleTimeStats | null {
  if (durationsMsArr.length === 0) {return null;}
  const hours = durationsMsArr.map(msToHours).toSorted((a, b) => a - b);
  const avg = hours.reduce((s, v) => s + v, 0) / hours.length;
  return {
    sampleCount: hours.length,
    avgHours: Math.round(avg * 10) / 10,
    medianHours: percentile(hours, 50),
    p85Hours: percentile(hours, 85),
    p95Hours: percentile(hours, 95),
    minHours: hours[0],
    maxHours: hours[hours.length - 1],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 主函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 计算一批任务的 Flow Metrics。
 *
 * @param tasks    - 所有相关任务（不必预筛选，函数内部按窗口过滤）
 * @param windowMs - 统计窗口 { from, to }，默认过去30天
 * @param wipLimits - 各状态列的 WIP 限制（如 { in_progress: 3 }）
 */
export function calcFlowMetrics(
  tasks: Task[],
  opts?: {
    windowMs?: { from: number; to: number };
    wipLimits?: Partial<Record<TaskStatus, number>>;
  },
): FlowMetricsResult {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 3_600_000;
  const from = opts?.windowMs?.from ?? now - thirtyDays;
  const to = opts?.windowMs?.to ?? now;
  const window: FlowMetricsWindow = {
    from,
    to,
    days: Math.round((to - from) / 86_400_000),
  };

  // ── 1. 筛选窗口内完成的任务 ──
  const completedInWindow = tasks.filter(
    (t) =>
      t.status === "done" &&
      t.completedAt != null &&
      t.completedAt >= from &&
      t.completedAt <= to,
  );

  // ── 2. Cycle Time（startedAt → completedAt） ──
  const cycleDurations: number[] = [];
  const cycleByPriority: Record<string, number[]> = {};
  const cycleByType: Record<string, number[]> = {};

  for (const t of completedInWindow) {
    // startedAt 来自 timeTracking.startedAt 或 createdAt 降级
    const startedAt =
      (t.timeTracking as { startedAt?: number } | undefined)?.startedAt ?? undefined;
    if (startedAt != null && t.completedAt != null && t.completedAt > startedAt) {
      const dur = t.completedAt - startedAt;
      cycleDurations.push(dur);

      // 按优先级
      const prio = t.priority ?? "medium";
      cycleByPriority[prio] ??= [];
      cycleByPriority[prio].push(dur);

      // 按类型
      const typ = t.type ?? "task";
      cycleByType[typ] ??= [];
      cycleByType[typ].push(dur);
    }
  }

  const cycleTime = buildStats(cycleDurations);

  // ── 3. Lead Time（createdAt → completedAt） ──
  const leadDurations: number[] = [];
  for (const t of completedInWindow) {
    if (t.createdAt != null && t.completedAt != null && t.completedAt > t.createdAt) {
      leadDurations.push(t.completedAt - t.createdAt);
    }
  }
  const leadRaw = buildStats(leadDurations);
  const leadTime: LeadTimeStats | null = leadRaw
    ? {
        sampleCount: leadRaw.sampleCount,
        avgHours: leadRaw.avgHours,
        medianHours: leadRaw.medianHours,
        p85Hours: leadRaw.p85Hours,
      }
    : null;

  // ── 4. Throughput ──
  const storyPointsCompleted = completedInWindow.reduce(
    (sum, t) => sum + (t.storyPoints ?? 1),
    0,
  );
  const daysInWindow = Math.max(1, window.days);
  const throughput: ThroughputStats = {
    tasksCompleted: completedInWindow.length,
    storyPointsCompleted,
    tasksPerDay: Math.round((completedInWindow.length / daysInWindow) * 10) / 10,
    pointsPerDay: Math.round((storyPointsCompleted / daysInWindow) * 10) / 10,
    tasksPerWeek: Math.round((completedInWindow.length / daysInWindow) * 7 * 10) / 10,
  };

  // ── 5. Flow Efficiency（近似值：cycle / lead） ──
  let flowEfficiency: FlowEfficiency | null = null;
  if (cycleTime && leadTime && leadTime.medianHours > 0) {
    const eff = Math.min(1, cycleTime.medianHours / leadTime.medianHours);
    flowEfficiency = {
      efficiency: Math.round(eff * 1000) / 10, // 百分比，1位小数
      waitRatio: Math.round((1 - eff) * 1000) / 10,
    };
  }

  // ── 6. WIP 快照 ──
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const totalActiveCount = tasks.filter((t) =>
    ["in_progress", "review", "testing"].includes(t.status),
  ).length;
  const overLimitStatuses: string[] = [];
  if (opts?.wipLimits) {
    for (const [status, limit] of Object.entries(opts.wipLimits)) {
      const count = tasks.filter((t) => t.status === status).length;
      if (limit != null && count > limit) {
        overLimitStatuses.push(`${status}(${count}/${limit})`);
      }
    }
  }
  const wip: WipSnapshot = {
    current: inProgressCount,
    total: totalActiveCount,
    overLimitStatuses,
  };

  // ── 7. 分层统计 ──
  const cycleTimeByPriority: Record<string, Pick<CycleTimeStats, "sampleCount" | "medianHours">> =
    {};
  for (const [prio, durations] of Object.entries(cycleByPriority)) {
    const s = buildStats(durations);
    if (s) {cycleTimeByPriority[prio] = { sampleCount: s.sampleCount, medianHours: s.medianHours };}
  }

  const cycleTimeByType: Record<string, Pick<CycleTimeStats, "sampleCount" | "medianHours">> = {};
  for (const [typ, durations] of Object.entries(cycleByType)) {
    const s = buildStats(durations);
    if (s) {cycleTimeByType[typ] = { sampleCount: s.sampleCount, medianHours: s.medianHours };}
  }

  // ── 8. 健康诊断 ──
  const insights: string[] = [];

  if (completedInWindow.length === 0) {
    insights.push("⚠️ 统计窗口内无已完成任务，无法计算有效指标。");
  }

  if (cycleTime) {
    if (cycleTime.p85Hours > 168) {
      // > 7天
      insights.push(
        `🐌 P85 周期时间 ${cycleTime.p85Hours}h（>7天），建议拆分任务颗粒度或减少阻塞。`,
      );
    } else if (cycleTime.medianHours < 2) {
      insights.push(`⚡ 中位周期时间仅 ${cycleTime.medianHours}h，任务颗粒度可能过细。`);
    }
    if (cycleTime.p95Hours / cycleTime.medianHours > 5) {
      insights.push(
        `📊 周期时间分布高度不均（p95/median=${(cycleTime.p95Hours / cycleTime.medianHours).toFixed(1)}x），存在长尾任务拖慢交付。`,
      );
    }
  }

  if (flowEfficiency) {
    if (flowEfficiency.efficiency < 15) {
      insights.push(
        `⏳ 流动效率仅 ${flowEfficiency.efficiency}%（建议>40%），大量时间花在等待而非主动工作。`,
      );
    } else if (flowEfficiency.efficiency > 80) {
      insights.push(`✅ 流动效率 ${flowEfficiency.efficiency}%，团队持续流动状态良好。`);
    }
  }

  if (wip.total > 10) {
    insights.push(
      `🔴 WIP 过高（${wip.total} 个进行中任务），高 WIP 是交付延迟的首要原因，建议限制在 5-7 个。`,
    );
  }

  if (overLimitStatuses.length > 0) {
    insights.push(`⚠️ 以下状态超出 WIP 限制：${overLimitStatuses.join(", ")}`);
  }

  if (throughput.tasksPerWeek < 1 && tasks.length > 10) {
    insights.push(`📉 周交付量仅 ${throughput.tasksPerWeek} 个，团队产出速率偏低。`);
  }

  return {
    window,
    cycleTime,
    leadTime,
    throughput,
    flowEfficiency,
    wip,
    cycleTimeByPriority: Object.keys(cycleTimeByPriority).length > 0 ? cycleTimeByPriority : undefined,
    cycleTimeByType: Object.keys(cycleTimeByType).length > 0 ? cycleTimeByType : undefined,
    insights,
  };
}

/**
 * 生成 Flow Metrics 的人类可读摘要（适合注入 prompt 或打印到控制台）
 */
export function formatFlowMetricsSummary(result: FlowMetricsResult): string {
  const lines: string[] = [
    `## Flow Metrics 报告（${result.window.days}天窗口）`,
    "",
  ];

  // Throughput
  lines.push(
    `**产出**: 完成 ${result.throughput.tasksCompleted} 个任务 / ${result.throughput.storyPointsCompleted} SP`,
    `  → 日均 ${result.throughput.tasksPerDay} 任务 / 周均 ${result.throughput.tasksPerWeek} 任务`,
  );

  // Cycle Time
  if (result.cycleTime) {
    lines.push(
      "",
      `**周期时间** (n=${result.cycleTime.sampleCount}):`,
      `  中位数: ${result.cycleTime.medianHours}h | 平均: ${result.cycleTime.avgHours}h | P85: ${result.cycleTime.p85Hours}h`,
    );
  } else {
    lines.push("", "**周期时间**: 数据不足");
  }

  // Lead Time
  if (result.leadTime) {
    lines.push(
      `**前置时间** (n=${result.leadTime.sampleCount}):`,
      `  中位数: ${result.leadTime.medianHours}h | P85: ${result.leadTime.p85Hours}h`,
    );
  }

  // Flow Efficiency
  if (result.flowEfficiency) {
    lines.push(
      `**流动效率**: ${result.flowEfficiency.efficiency}% (等待占比 ${result.flowEfficiency.waitRatio}%)`,
    );
  }

  // WIP
  lines.push(`**WIP**: 进行中 ${result.wip.current} / 活跃 ${result.wip.total}`);

  // Insights
  if (result.insights.length > 0) {
    lines.push("", "**诊断建议**:");
    for (const ins of result.insights) {
      lines.push(`  ${ins}`);
    }
  }

  return lines.join("\n");
}
