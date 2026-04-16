/**
 * 主控仪表盘快照（Leader Context Snapshot）
 *
 * 设计原则（参考 Claude Code 泄露源码 + Codex CLI 最佳实践）：
 *
 * 1. 主控是「指挥官」而非「秘书」：只看地图（指针索引），不存档全量历史
 * 2. 状态外置：子 agent 状态写入 task storage，主控被唤醒时重新读取快照，
 *    而不是靠堆积的 [TASK REPORT] / [ALERT] 消息来感知状态
 * 3. 快照替换：每次唤醒注入一份当前状态的「仪表盘快照」，替代追加历史消息
 * 4. 上下文预算：快照总长度严格控制在 MAX_SNAPSHOT_CHARS 以内
 *
 * 触发时机：
 * - 任何子 agent 完成任务并通知主控时（agent.task.report）
 * - 调度器检测到 agent 超时/重置/低水位时
 * - compaction 后主控 session 恢复
 */

import { loadConfig } from "../../upstream/src/config/config.js";
import { requestHeartbeatNow } from "../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../upstream/src/infra/system-events.js";
import { normalizeAgentId } from "../routing/session-key.js";
import * as taskStorage from "../tasks/storage.js";
import { listAgentIds } from "./agent-scope.js";

// ─── 快照尺寸预算 ────────────────────────────────────────────────────────────
// 严格控制注入主控上下文的字符数，防止单次注入撑爆上下文窗口
// Claude Code AutoCompact 预留 13K token buffer，我们以 char 估算（1 token ≈ 4 chars）
// 整份快照不超过 4K token = 16,000 chars
const MAX_SNAPSHOT_CHARS = 16_000;
// 每条任务行最多显示的字符（标题截断）
const MAX_TASK_TITLE_CHARS = 50;
// 每个 agent 最多展示 in-progress 任务数
const MAX_IN_PROGRESS_PER_AGENT = 2;
// 最多展示异常 agent 数（blocked / stuck）
const MAX_ALERT_AGENTS = 8;
// 全局 todo 积压预警阈值
const BACKLOG_WARN_THRESHOLD = 5;

// ─── 快照缓存（防止同一批事件多次重建快照）────────────────────────────────────
// 使用 agentId+时间戳 做 debounce，2s 内同一主控只生成一次快照
const snapshotDebounceMs = 2_000;
const lastSnapshotAtMap = new Map<string, number>();

export type LeaderWakeReason =
  | { type: "task_done"; taskId: string; reporterId: string; summary: string }
  | { type: "task_blocked"; taskId: string; reporterId: string; errorMsg: string }
  | {
      type: "dep_blocked";
      taskId: string;
      taskTitle: string;
      agentId: string;
      blockedBy: Array<{ id: string; title: string; priority: string; assigneeId?: string }>;
    }
  | { type: "task_timeout"; agentId: string; taskId: string; stuckMinutes: number }
  | { type: "task_reset"; agentId: string; taskId: string; stuckMinutes: number }
  | { type: "low_watermark"; agentId: string; todoCount: number; minTodo: number }
  | { type: "kpi_reassign"; taskId: string; fromAgent: string; toAgent: string }
  | { type: "overdue"; taskId: string; title: string; overdueMinutes: number }
  | { type: "backlog"; agentId: string; queueSize: number }
  | { type: "compaction_restore" };

/**
 * 构建并注入主控仪表盘快照
 *
 * 替代原来的多行 enqueueSystemEvent 散射，统一走此函数：
 * - 从 task storage 实时读取状态（而非依赖历史消息）
 * - 生成一份结构化但紧凑的快照（预算 ≤ 16K chars）
 * - 通过 contextKey 去重（同一 contextKey 不重复注入）
 * - debounce 2s 防止批量事件引发多次快照重建
 */
export async function injectLeaderSnapshot(params: {
  leaderId: string;
  wakeReason: LeaderWakeReason;
  coalesceMs?: number;
}): Promise<boolean> {
  const { leaderId, wakeReason, coalesceMs = 5_000 } = params;
  const normalizedLeader = normalizeAgentId(leaderId);

  // 校验 leader 存在
  const cfg = loadConfig();
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(normalizedLeader)) {
    return false;
  }

  // debounce：2s 内同一主控不重复构建快照（除非是 compaction_restore）
  if (wakeReason.type !== "compaction_restore") {
    const lastAt = lastSnapshotAtMap.get(normalizedLeader) ?? 0;
    if (Date.now() - lastAt < snapshotDebounceMs) {
      // 仍然触发心跳唤醒，只是不重建快照
      requestHeartbeatNow({
        reason: buildContextKey(wakeReason),
        sessionKey: `agent:${normalizedLeader}:main`,
        agentId: normalizedLeader,
        coalesceMs,
      });
      return true;
    }
  }
  lastSnapshotAtMap.set(normalizedLeader, Date.now());

  try {
    const snapshot = await buildLeaderSnapshot(normalizedLeader, wakeReason);
    if (!snapshot) {
      return false;
    }

    const leaderSession = `agent:${normalizedLeader}:main`;
    const contextKey = buildContextKey(wakeReason);

    enqueueSystemEvent(snapshot, {
      sessionKey: leaderSession,
      contextKey,
    });
    requestHeartbeatNow({
      reason: contextKey,
      sessionKey: leaderSession,
      agentId: normalizedLeader,
      coalesceMs,
    });

    return true;
  } catch (err) {
    console.warn(
      `[leader-snapshot] Failed to build snapshot for ${normalizedLeader}: ${String(err)}`,
    );
    return false;
  }
}

// ─── 快照构建核心 ─────────────────────────────────────────────────────────────

async function buildLeaderSnapshot(
  leaderId: string,
  wakeReason: LeaderWakeReason,
): Promise<string | null> {
  // === 1. 读取触发事件的单行摘要（置顶，让主控第一眼看到触发原因）===
  const triggerLine = buildTriggerLine(wakeReason);

  // === 2. 读取所有 agent 的任务状态（仅读指标，不展开详情）===
  const cfg = loadConfig();
  const agentIds = listAgentIds(cfg).map(normalizeAgentId);

  const agentRows: string[] = [];
  const alertRows: string[] = [];
  let totalInProgress = 0;
  let totalTodo = 0;
  let totalBlocked = 0;

  for (const agentId of agentIds) {
    try {
      const [inProgress, todo, blocked] = await Promise.all([
        taskStorage.listTasks({ assigneeId: agentId, status: ["in-progress"] }),
        taskStorage.listTasks({ assigneeId: agentId, status: ["todo"] }),
        taskStorage.listTasks({ assigneeId: agentId, status: ["blocked"] }),
      ]);

      totalInProgress += inProgress.length;
      totalTodo += todo.length;
      totalBlocked += blocked.length;

      // 只显示有活跃任务的 agent
      if (inProgress.length === 0 && todo.length === 0 && blocked.length === 0) {
        continue;
      }

      // 每个 agent 一行摘要
      const statusParts: string[] = [];
      if (inProgress.length > 0) {
        const titles = inProgress
          .slice(0, MAX_IN_PROGRESS_PER_AGENT)
          .map((t) => `"${t.title.slice(0, MAX_TASK_TITLE_CHARS)}"`)
          .join(", ");
        statusParts.push(
          `🔵 ${inProgress.length}进行中: ${titles}${inProgress.length > MAX_IN_PROGRESS_PER_AGENT ? "…" : ""}`,
        );
      }
      if (blocked.length > 0) {
        statusParts.push(`🔴 ${blocked.length}阻塞`);
        // 阻塞任务加入告警区
        if (alertRows.length < MAX_ALERT_AGENTS) {
          const bt = blocked[0];
          alertRows.push(
            `  ⚠️ ${agentId} blocked [${bt.id}] "${bt.title.slice(0, MAX_TASK_TITLE_CHARS)}" — use agent.task.triage to batch-resolve`,
          );
        }
      }
      if (todo.length > 0) {
        statusParts.push(`⚪ ${todo.length}待办`);
      }

      agentRows.push(`  ${agentId}: ${statusParts.join(" | ")}`);

      // 积压预警
      if (todo.length >= BACKLOG_WARN_THRESHOLD && alertRows.length < MAX_ALERT_AGENTS) {
        alertRows.push(`  📥 ${agentId} backlog=${todo.length} — consider reassigning`);
      }
    } catch {
      // 单个 agent 查询失败不影响其他
    }
  }

  // === 3. 组装快照 ===
  const lines: string[] = [];

  // 触发原因（单行，必须置顶）
  lines.push(`[LEADER DASHBOARD] ${new Date().toLocaleTimeString()} — ${triggerLine}`);
  lines.push("");

  // dep_blocked 专属：前置任务明细 + 行动指引（紧跟触发行，让主控第一眼看到该做什么）
  if (wakeReason.type === "dep_blocked") {
    lines.push(
      `📋 阻塞详情 — 任务 [${wakeReason.taskId}] "${wakeReason.taskTitle.slice(0, 50)}" (执行者: ${wakeReason.agentId}) 因前置未完成已退回等待:`,
    );
    for (const dep of wakeReason.blockedBy) {
      const assigneePart = dep.assigneeId ? ` | 负责人: ${dep.assigneeId}` : " | ⚠️ 未分配";
      lines.push(
        `  🔒 [${dep.id}] "${dep.title.slice(0, 50)}" (优先级: ${dep.priority}${assigneePart})`,
      );
    }
    lines.push("");
    lines.push("💡 建议行动:");
    lines.push("  1. 检查上方前置任务是否已分配给合适成员");
    lines.push("  2. 若未分配 → 用 agent.assign_task 立即分配并设为 urgent");
    lines.push("  3. 若已分配但卡住 → 用 agent.task.triage 分诊处理");
    lines.push("  4. 前置任务完成后，系统会自动解除阻塞并重新调度");
    lines.push("");
  }

  // 全局指标行（极度紧凑，1 行）
  lines.push(
    `📊 全局: ${totalInProgress}进行中 / ${totalBlocked}阻塞 / ${totalTodo}待办 (${agentIds.length} agents)`,
  );
  lines.push("");

  // Agent 状态矩阵（只显示有任务的 agent）
  if (agentRows.length > 0) {
    lines.push("👥 Agent 状态:");
    lines.push(...agentRows);
    lines.push("");
  }

  // 告警区（需要主控关注的事项）
  if (alertRows.length > 0) {
    lines.push("🚨 需关注:");
    lines.push(...alertRows);
    lines.push("");
  }

  // 操作提示（极度精简，仅关键命令）
  lines.push(
    "📌 常用操作: agent.task.triage(批量分诊) | agent.task.manage(cancel/reset/extend/split) | agent.task.list | agent_communicate",
  );

  const snapshot = lines.join("\n");

  // 预算保护：超出则截断并提示
  if (snapshot.length > MAX_SNAPSHOT_CHARS) {
    return (
      snapshot.slice(0, MAX_SNAPSHOT_CHARS) +
      "\n…[snapshot truncated — use agent.task.list for full view]"
    );
  }

  return snapshot;
}

// ─── 触发行构建 ──────────────────────────────────────────────────────────────

function buildTriggerLine(reason: LeaderWakeReason): string {
  switch (reason.type) {
    case "task_done":
      return `✅ ${reason.reporterId} 完成 [${reason.taskId}]${reason.summary ? ` — ${reason.summary.slice(0, 80)}` : ""}`;
    case "task_blocked":
      return `⚠️ ${reason.reporterId} 阻塞 [${reason.taskId}]${reason.errorMsg ? ` — ${reason.errorMsg.slice(0, 80)}` : ""}`;
    case "dep_blocked":
      return `🔒 ${reason.agentId} 任务 [${reason.taskId}] 因前置未完成已退回 — 前置: ${reason.blockedBy.map((d) => d.id).join(", ")}，请立即安排`;
    case "task_timeout":
      return `⏱️ ${reason.agentId} 超时 [${reason.taskId}] ${reason.stuckMinutes}min — 已重唤醒`;
    case "task_reset":
      return `🔄 ${reason.agentId} [${reason.taskId}] 卡顿 ${reason.stuckMinutes}min → 已重置为 todo`;
    case "low_watermark":
      return `📉 ${reason.agentId} 待办不足 ${reason.todoCount}/${reason.minTodo} — 需补充任务`;
    case "kpi_reassign":
      return `♻️ [${reason.taskId}] 从 ${reason.fromAgent} 重分配至 ${reason.toAgent}`;
    case "overdue":
      return `⏰ [${reason.taskId}] "${reason.title.slice(0, 40)}" 逾期 ${reason.overdueMinutes}min → 已升级为 urgent`;
    case "backlog":
      return `📥 ${reason.agentId} 积压 ${reason.queueSize} 条任务 — 建议重分配或取消`;
    case "compaction_restore":
      return "🔄 compaction 后恢复 — 当前任务状态如下";
    default:
      return "状态更新";
  }
}

function buildContextKey(reason: LeaderWakeReason): string {
  switch (reason.type) {
    case "task_done":
    case "task_blocked":
    case "dep_blocked":
      return `leader:snapshot:task:${reason.taskId}`;
    case "task_timeout":
    case "task_reset":
      return `leader:snapshot:agent:${reason.agentId}:${reason.taskId}`;
    case "low_watermark":
      return `leader:snapshot:lwm:${reason.agentId}`;
    case "kpi_reassign":
      return `leader:snapshot:kpi:${reason.taskId}`;
    case "overdue":
      return `leader:snapshot:overdue:${reason.taskId}`;
    case "backlog":
      return `leader:snapshot:backlog:${reason.agentId}`;
    case "compaction_restore":
      return `leader:snapshot:compaction:${Date.now()}`;
    default:
      return `leader:snapshot:${Date.now()}`;
  }
}
