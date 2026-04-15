/**
 * Agent 任务唤醒调度器
 *
 * 每 2 分钟扫描一次所有 Agent 的待办任务
 *
 * 核心原则：
 * 1. 每个 Agent 同时只能执行 1 条任务（串行执行）
 * 2. 发现多条 in-progress → 保留优先级最高的 1 条，其余重置回 todo 排队
 * 3. 无 in-progress 且有 todo → 取优先级最高的 1 条唤醒执行
 * 4. 有 in-progress（仅 1 条）且超时（>15min 无活动）→ 自动重置回 todo 并立即重新派发（避免模型超时死循环）
 *    4a. 超时 >60min → 强制重置回 todo，等下轮调度器扫描再分配（通知负责人）
 * 5. todo 任务只是排队，不检测超时
 * 6. Context Overflow 防循环：记录连续失败次数，超过隇値则暂停重试并通知 supervisor
 *    （业界最佳实践：overflow 属于 non-retriable 错误，不应无限重试）
 * 7. 服务重启后首次扫描：立即对所有 in-progress 任务补发 [TASK RESUME] 唤醒指令
 *    （不受 5min 静默窗口限制）——修复服务重启后历史任务无驱动消息的根本问题
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadConfig } from "../../upstream/src/config/config.js";
import { requestHeartbeatNow } from "../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../upstream/src/infra/system-events.js";
import {
  resolveDefaultSessionStorePath,
  resolveSessionTranscriptPath,
  updateSessionStore,
} from "../config/sessions.js";
import { listAgentIds, resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { getTaskTypePerfScore, inferTaskType } from "../gateway/server-methods/evolve-rpc.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { groupManager } from "../sessions/group-manager.js";
import * as taskStorage from "../tasks/storage.js";
import {
  adaptThresholds,
  recordTodoObservation,
  registerMissingThresholdNotifier,
} from "../tasks/task-threshold-config.js";
import {
  readProjectConfig,
  resolveAgentTaskThreshold,
  resolveStrictestThreshold,
} from "../utils/project-context.js";
import { groupWorkspaceManager } from "../workspace/group-workspace.js";

// ============================================================================
// 任务完成判定设计原则
//
// 【金标准】任务完成的唯一可信信号：agent 主动调用 task_report_to_supervisor
// 系统不应通过静默时长猜测任务是否完成——这是误判的根源。
//
// 【两条处理路径】
// 路径A（超时）：lastActivityAt 静默 > INACTIVE_ZOMBIE_MS（15min）
//   → agent 的 heartbeat 已停止活动，任务处于挂起状态
//   → 动作：重唤醒 agent（提醒继续执行）+ 通知主控关注
//   → 不自动标记完成，由 agent 自己上报或主控介入
//
// 路径B（绝对兜底）：startedAt 起超过 FORCE_RESET_MS（60min）
//   → 任务长期占用但无进展，可能存在阻塞性问题
//   → 动作：重置为 todo + 通知主控人工检查
//
// 【注意】原 auto-done（静默 3~15min 自动标记完成）已移除——
//   该机制假设「静默 = 完成」，在 heartbeat 刷新 lastActivityAt 后仍存在
//   误判风险（任务执行时间可能长于 heartbeat 间隔），违反完成信号确定性原则。
// ============================================================================

// 记录已向主控发送过超时告警的任务（24h 内不重复告警）
const timeoutAlertedAt = new Map<string, number>();
const TIMEOUT_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// 记录每个任务上次触发强制上报的时间
// 用于实现：首次 15min 触发，之后每 10min 触发一次，直到 60min 强制重置
const progressReportPromptedAt = new Map<string, number>();
// 首次超时阈值
const FIRST_TIMEOUT_MS = 15 * 60 * 1000; // 15 分钟首次触发
// 后续每次检查间隔
const REPEAT_TIMEOUT_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟重复触发

// ============================================================================
// 配置
// ============================================================================

// 优先级排序权重（数字越大优先级越高）
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// Context Overflow 循环防护
// 记录每个 agent 还没成功唤醒的连续次数（如果任务状态没变化）
const agentStaleWakeCount = new Map<string, { count: number; taskId: string; lastAt: number }>();
// 连续失败 N 次后触发 session reset（业界最佳实践：3-5 次）
const MAX_STALE_WAKE_BEFORE_PAUSE = 3;
// session reset 后的冷却期（8 分钟，等新会话初始化完成）
const OVERFLOW_PAUSE_MS = 8 * 60 * 1000;
// 记录已触发过 session reset 的 agent:taskId，避免每轮都 reset
const overflowSessionResetAt = new Map<string, number>();
// session reset 操作自身的冷却期（每个 agent:task 最多每 15 分钟重置一次）
const OVERFLOW_RESET_COOLDOWN_MS = 15 * 60 * 1000;

// 背压保护：记录每个 agent 每个任务的重激活状态
// 业界参考：Temporal.io 指数退而重试策略
// 首次空闲 ⇒ 10分钟后重激活
// 第2次还是空闲 ⇒ 20分钟后重激活
// 第3次还是空闲 ⇒ 40分钟后重激活，之后饱和于 60 分钟
const REACTIVATE_BASE_MS = 10 * 60 * 1000; // 基础间隔 10 分钟
const REACTIVATE_MAX_MS = 60 * 60 * 1000; // 最大间隔 60 分钟
const agentLastReactivateAt = new Map<string, { lastAt: number; attempts: number }>();

// 低水位告警冷却记录：每个 agent 最近一次低水位告警时间（防止每轮扫描都轰炸 supervisor）
const lowWatermarkAlertAt = new Map<string, number>();

/**
 * 对 Agent 的 session store 执行 overflow reset：
 * 生成新 sessionId 写入 store，使下次 heartbeat run 以干净的空 context 启动。
 * 对标 upstream agent-runner.ts 中的 resetSessionAfterCompactionFailure 逻辑。
 *
 * @returns true 表示重置成功，false 表示跳过（store 不存在或已在冷却期内）
 */
async function resetAgentSessionForOverflow(agentId: string, taskId: string): Promise<boolean> {
  const resetKey = `${agentId}:${taskId}`;
  const now = Date.now();
  const lastReset = overflowSessionResetAt.get(resetKey);
  if (lastReset && now - lastReset < OVERFLOW_RESET_COOLDOWN_MS) {
    return false; // 冷却期内，跳过
  }
  try {
    const storePath = resolveDefaultSessionStorePath(agentId);
    const sessionKey = `agent:${agentId}:main`;
    const nextSessionId = randomUUID();
    const nextSessionFile = resolveSessionTranscriptPath(nextSessionId, agentId);
    await updateSessionStore(storePath, (store) => {
      const prev = store[sessionKey];
      store[sessionKey] = {
        ...(prev ?? {}),
        sessionId: nextSessionId,
        sessionFile: nextSessionFile,
        updatedAt: now,
        systemSent: false,
        abortedLastRun: false,
      } as (typeof store)[string];
    });
    overflowSessionResetAt.set(resetKey, now);
    console.log(
      `[Task Wake] Agent ${agentId} session reset for overflow (task ${taskId}) -> new session ${nextSessionId}`,
    );
    return true;
  } catch (err) {
    console.error(
      `[Task Wake] Failed to reset session for agent ${agentId} (non-fatal): ${String(err)}`,
    );
    return false;
  }
}

/**
 * 计算指数退而间隔
 * 第 n 次重激活的等待时间 = min(base * 2^(n-1), max)
 */
function getReactivateBackoffMs(attempts: number): number {
  const backoff = REACTIVATE_BASE_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(backoff, REACTIVATE_MAX_MS);
}

// ============================================================================
// 任务卡顿根因推断
// 借鉴业界MAST论文（UC Berkeley 2025）对 1642 条 MAS 失败轨迹分析：
// API超时/Context溢出/工具失败 是三大主要卡顿原因
// ============================================================================

/**
 * 推断任务卡顿的根本原因，用于生成差异化唤醒消息
 */
function inferStuckReason(
  stuckMinutes: number,
  task: { metadata?: Record<string, unknown> },
): {
  type: "api_timeout" | "context_overflow" | "tool_failure" | "unknown";
  hint: string;
} {
  const meta = task.metadata ?? {};

  // 从任务元数据中检测 context overflow 记录
  if (meta.lastFailReason === "context_overflow" || meta.contextOverflowCount) {
    return {
      type: "context_overflow",
      hint:
        `Context 话术已过长导致工作中断。请先执行 /compress 压缩上下文，再继续任务。` +
        `如果性能承诺内容过多，可将任务拆分为更小的子任务处理。`,
    };
  }

  // 从元数据中检测工具调用失败记录
  if (meta.lastFailReason === "tool_failure" || meta.lastToolError) {
    const toolName =
      meta.lastToolName && typeof meta.lastToolName === "string" ? `(${meta.lastToolName}) ` : "";
    const toolError =
      meta.lastToolError && typeof meta.lastToolError === "string"
        ? `: "${meta.lastToolError.slice(0, 80)}"`
        : "";
    return {
      type: "tool_failure",
      hint:
        `工具调用 ${toolName}失败${toolError}。请确认所需资源/路径存在再执行，` +
        `或考虑用其他方式完成任务。`,
    };
  }

  // 根据卡顿时间推断：>小题 15 分钟多为 API 超时（模型单次 run 最多 10 分钟）
  if (stuckMinutes <= 30) {
    return {
      type: "api_timeout",
      hint:
        `上次任务可能因 API 响应超时或网络报错中断。` +
        `如果遇到相同错误，请尝试 /model 切换备用模型，或等待几分钟后重试。`,
    };
  }

  // > 30 分钟卡顿：可能 context overflow 或任务本身过小题
  if (stuckMinutes > 30) {
    return {
      type: "context_overflow",
      hint:
        `任务持续卡顿较长（${stuckMinutes}分钟），可能是 Context 话术过长导致执行循环。` +
        `建议：1) 先尝试执行部分成果并检查点，2) 将任务拆分为更小的子任务，3) 确实无法完成则用 task_report_to_supervisor 请求帮助。`,
    };
  }

  return {
    type: "unknown",
    hint: "请检查任务描述和工作目录，确保资源可用后继续执行。",
  };
}

function taskSortKey(t: { priority: string; weight?: number; createdAt: number }): number {
  // 得分越高越优先：优先级权重 * 1e13 + 任务权重 * 1e6 - 创建时间（越早越高）
  const priorityScore = (PRIORITY_WEIGHT[t.priority] ?? 2) * 1e13;
  const weightScore = (t.weight ?? 0) * 1e6;
  return priorityScore + weightScore - t.createdAt;
}

// ============================================================================
// 低水位检测辅助函数
// 被以下场景复用：
//   1. 每轮定时扫描结束后（主循环）
//   2. 系统自动完成任务（auto-done）之后
// ============================================================================

/**
 * 检查指定 agent 的待办任务数量是否低于阶段阈值，如果是则立即通知 supervisor。
 *
 * @param normalizedId  agent ID（已 normalized）
 * @param now           当前时间戳（ms），用于冷却期计算
 * @param completedProjectId 刚完成的任务所属项目 ID（优先用于阶段查询，可选）
 */
async function checkAndNotifyLowWatermark(
  normalizedId: string,
  now: number,
  completedProjectId?: string,
): Promise<void> {
  // 冷却期：同一 agent 1 小时内最多告警一次
  const lwmCooldownMs = 60 * 60 * 1000;
  const lwmLastAlertKey = `lwm:${normalizedId}`;
  const lwmLastAlert = lowWatermarkAlertAt.get(lwmLastAlertKey);
  if (lwmLastAlert && now - lwmLastAlert < lwmCooldownMs) {return;}

  // 获取当前 todo 数量（仅 todo 状态，不含已完成/进行中）
  const currentTodoTasks = await taskStorage.listTasks({
    assigneeId: normalizedId,
    status: ["todo"],
  });
  const todoCount = currentTodoTasks.length;

  // 收集该 agent 所在项目（todo 任务 + 可选刚完成任务的项目 + in-progress 任务）
  const agentProjectIds = new Set<string>();
  if (completedProjectId) {agentProjectIds.add(completedProjectId);}
  for (const t of currentTodoTasks) {
    if (t.projectId) {agentProjectIds.add(t.projectId);}
  }
  if (agentProjectIds.size === 0) {
    const inProg = await taskStorage.listTasks({
      assigneeId: normalizedId,
      status: ["in-progress"],
    });
    for (const t of inProg) {
      if (t.projectId) {agentProjectIds.add(t.projectId);}
    }
  }

  // 计算最严格阈值
  const thresholds: import("../utils/project-context.js").AgentPhaseThreshold[] = [];
  const phaseLabels: string[] = [];
  const allGroupsForLwm = groupManager.getAllGroups();
  for (const projectId of agentProjectIds) {
    const group = allGroupsForLwm.find((g) => g.projectId === projectId);
    if (!group) {continue;}
    const groupWsDir = groupWorkspaceManager.getGroupWorkspaceDir(group.id);
    if (!groupWsDir) {continue;}
    const projCfg = readProjectConfig(groupWsDir);
    const phase = projCfg?.status ?? undefined;
    if (!phase) {continue;}
    phaseLabels.push(`${projectId}(阶段:${phase})`);
    thresholds.push(resolveAgentTaskThreshold(phase, normalizedId));
    recordTodoObservation(phase, normalizedId, todoCount);
  }

  const threshold = resolveStrictestThreshold(thresholds);
  if (threshold.allowIdle) {return;}
  if (todoCount >= threshold.minTodo) {return;}

  // 找 supervisor
  let supervisorIdForLwm: string | undefined;
  if (currentTodoTasks.length > 0) {
    supervisorIdForLwm = (currentTodoTasks[0].supervisorId ?? currentTodoTasks[0].creatorId) as
      | string
      | undefined;
  }
  if (!supervisorIdForLwm) {
    const inProgForSup = await taskStorage.listTasks({
      assigneeId: normalizedId,
      status: ["in-progress"],
    });
    if (inProgForSup.length > 0) {
      supervisorIdForLwm = (inProgForSup[0].supervisorId ?? inProgForSup[0].creatorId) as
        | string
        | undefined;
    }
  }
  if (!supervisorIdForLwm || supervisorIdForLwm === "system") {return;}

  const cfgForLwm = loadConfig();
  const allowedAgents = new Set(listAgentIds(cfgForLwm).map(normalizeAgentId));
  const normalizedSup = normalizeAgentId(supervisorIdForLwm);
  if (!allowedAgents.has(normalizedSup)) {return;}

  // 记录本次告警时间（冷却）
  lowWatermarkAlertAt.set(lwmLastAlertKey, now);

  const urgencyLabel = threshold.required
    ? "❗ [紧急 - 当前阶段要求必须有待办任务]"
    : "⚠️ [建议补充]";
  const phaseInfo =
    phaseLabels.length > 0 ? `项目阶段：${phaseLabels.join(", ")}` : "项目阶段未知";

  const lwmMsg = [
    `[TASK LOW WATERMARK] ${urgencyLabel} Agent ${normalizedId} 的待办任务不足，需要補充`,
    ``,
    `Agent: ${normalizedId}`,
    `当前待办任务数：${todoCount} 条（最小要求：${threshold.minTodo} 条）`,
    phaseInfo,
    ``,
    threshold.required
      ? `当前阶段要求 ${normalizedId} 必须始终有待办任务。请立即使用 agent_assign_task 分配新任务。`
      : `建议马上给 ${normalizedId} 分配新任务，保持工作流水线不停歇。`,
    ``,
    `请使用 agent_assign_task 分配新任务到 ${normalizedId}。`,
  ]
    .filter(Boolean)
    .join("\n");

  const lwmSupSession = `agent:${normalizedSup}:main`;
  enqueueSystemEvent(lwmMsg, {
    sessionKey: lwmSupSession,
    contextKey: `cron:task-lwm:${normalizedId}`,
  });
  requestHeartbeatNow({
    reason: `cron:task-lwm:${normalizedId}`,
    sessionKey: lwmSupSession,
    agentId: normalizedSup,
    coalesceMs: 15000,
  });
  console.log(
    `[Task Wake] ↓ Low watermark: ${normalizedId} todo=${todoCount}/${threshold.minTodo} (phase=${phaseLabels.join(",") || "unknown"}) — notify supervisor ${normalizedSup}`,
  );
}

const STARTUP_DELAY_MS = 5 * 1000; // 5 秒（等待基础模块初始化，避免冷启动冲突）
let scanInterval: NodeJS.Timeout | null = null;

let startupTimer: NodeJS.Timeout | null = null;

// 是否为服务重启后的首次扫描
// 首次扫描时对所有 in-progress 任务立即补发 [TASK RESUME]，
// 跳过 5min 静默窗口——这是服务重启后历史任务无法继续执行的根本修复
let isFirstScan = true;

// ============================================================================
// 核心逻辑
// ============================================================================

/**
 * 扫描所有 Agent 的待办任务并唤醒有任务的 Agent
 */
export async function scanAndWakeAgentsWithPendingTasks(options?: {
  forceFirstScan?: boolean;
}): Promise<{
  scannedAgents: number;
  wokenAgents: number;
  pendingTasks: number;
  skippedTasks: number;
}> {
  const stats = {
    scannedAgents: 0,
    wokenAgents: 0,
    pendingTasks: 0,
    skippedTasks: 0,
  };

  // 判断是否为重启后首次扫描（含外部强制标记）
  const isRestartScan = isFirstScan || (options?.forceFirstScan ?? false);
  if (isFirstScan) {
    isFirstScan = false;
  }

  try {
    const cfg = loadConfig();
    const agentIds = listAgentIds(cfg);

    if (agentIds.length === 0) {
      return stats;
    }

    stats.scannedAgents = agentIds.length;

    const now = Date.now();

    for (const agentId of agentIds) {
      const normalizedId = normalizeAgentId(agentId);

      // 获取该 agent 所有 in-progress 和 todo 任务
      const [inProgressTasks, todoTasks] = await Promise.all([
        taskStorage.listTasks({ assigneeId: normalizedId, status: ["in-progress"] }),
        taskStorage.listTasks({ assigneeId: normalizedId, status: ["todo"] }),
      ]);

      // === Context Overflow 防循环检测 ===
      // 业界最佳实践（对标 Claude Code、Cursor 等主流 Agent 框架）：
      //   overflow 是 non-retriable 错误，不能用同一个撑爆的 session 重试。
      //   正确做法：重置 session（生成新 sessionId），在新的空 context 中注入
      //   任务摘要（Summarize & Continue），让 agent 从干净状态恢复执行。
      const activeInProgress = inProgressTasks[0];
      if (activeInProgress) {
        const staleKey = `${normalizedId}:${activeInProgress.id}`;
        const staleInfo = agentStaleWakeCount.get(staleKey);
        const taskUpdatedAt = activeInProgress.updatedAt ?? 0;
        // 如果任务在上次扫描后有更新（说明 agent 在执行），重置计数器
        if (staleInfo && taskUpdatedAt > staleInfo.lastAt) {
          agentStaleWakeCount.delete(staleKey);
          // 任务有进展，同步重置退避计数器，让下次空闲从基础间隔重新计算
          const reactivateKeyForReset = `reactivate:${normalizedId}:${activeInProgress.id}`;
          agentLastReactivateAt.delete(reactivateKeyForReset);
          // 同时清除 overflow reset 记录（任务有进展说明 overflow 已经恢复）
          overflowSessionResetAt.delete(staleKey);
        } else if (staleInfo && staleInfo.count >= MAX_STALE_WAKE_BEFORE_PAUSE) {
          const pauseRemaining = staleInfo.lastAt + OVERFLOW_PAUSE_MS - now;
          if (pauseRemaining > 0) {
            // ── 在暂停期内：首次进入暂停时立刻触发 session reset ──
            // 业界做法（参考 upstream agent-runner.ts resetSessionAfterCompactionFailure）：
            // 生成新 sessionId 写入 store，使下次 heartbeat run 以干净空 context 启动，
            // 同时向新 session 发送携带完整任务信息的 [CONTEXT RESET] 唤醒消息。
            const didReset = await resetAgentSessionForOverflow(normalizedId, activeInProgress.id);
            if (didReset) {
              // 新 session 已就绪，注入任务 handover 作为新会话的第一条消息
              // 对标业界 VNX handover contract: Completed Work / Remaining Tasks / Next Steps
              const sessionKey = `agent:${normalizedId}:main`;
              const agentWorkspaceDirForReset = resolveAgentWorkspaceDir(cfg, normalizedId);
              const agentMemoryPathForReset = path.join(agentWorkspaceDirForReset, "MEMORY.md");
              // 取最近 5 条工作日志作为 handover 快照（让 Agent 知道已做了什么、从哪里继续）
              const recentWorkLogs = (activeInProgress.workLogs ?? []).slice(-5);
              const contextResetMsg = [
                `[CONTEXT RESET] Your previous session ran out of context window and was automatically reset.`,
                `A fresh session has been started. Your in-progress task has been preserved and is ready to continue.`,
                ``,
                `=== TASK TO RESUME ===`,
                `Task ID: ${activeInProgress.id}`,
                `Title: ${activeInProgress.title}`,
                `Status: in-progress`,
                `Priority: ${activeInProgress.priority}`,
                activeInProgress.type ? `Type: ${activeInProgress.type}` : null,
                activeInProgress.projectId ? `Project: ${activeInProgress.projectId}` : null,
                activeInProgress.description
                  ? `Description: ${activeInProgress.description.slice(0, 300)}`
                  : null,
                recentWorkLogs.length > 0
                  ? `\n=== COMPLETED WORK (last ${recentWorkLogs.length} log entries) ===`
                  : null,
                ...recentWorkLogs.map(
                  (wl) =>
                    `  [${wl.action}] ${wl.details.slice(0, 200)}${
                      wl.result ? ` → ${wl.result}` : ""
                    }`,
                ),
                ``,
                `=== WORKING CONTEXT ===`,
                `Working Directory: ${agentWorkspaceDirForReset}`,
                `Your Personal Memory: ${agentMemoryPathForReset}`,
                ``,
                `=== NEXT STEPS ===`,
                `1. Do NOT start over. Check the work logs above to understand what was already done.`,
                `2. Check your working directory for partial work already completed.`,
                `3. Continue executing the task from where you left off.`,
                `4. Call task_report_to_supervisor with Task ID: ${activeInProgress.id} when complete.`,
                `5. If the remaining scope is too large, break it into smaller subtasks.`,
                ``,
                `IMPORTANT: Call task_report_to_supervisor with Task ID: ${activeInProgress.id} when done.`,
              ]
                .filter(Boolean)
                .join("\n");
              enqueueSystemEvent(contextResetMsg, {
                sessionKey,
                contextKey: `cron:overflow-reset:${activeInProgress.id}`,
              });
              requestHeartbeatNow({
                reason: `cron:overflow-reset:${activeInProgress.id}`,
                sessionKey,
                agentId: normalizedId,
                coalesceMs: 3000,
              });
              console.log(
                `[Task Wake] Agent ${normalizedId} overflow recovery: new session + context reset message sent (task ${activeInProgress.id})`,
              );
            }
            // 无论是否成功 reset，暂停期内都跳过本轮正常唤醒（避免双重消息）
            stats.skippedTasks++;
            continue;
          }
          // 暂停期已过，清除计数器重新尝试
          agentStaleWakeCount.delete(staleKey);
        }
      }

      // === 核心约束：每个 agent 同时只执行 1 条任务 ===
      // 宽限期：任务刚被系统分配（startedAt 在 5 分钟内），不参与违规检测
      // 避免 scheduleNextTaskForAgent 刚推了一条任务，调度器就把它重置回去
      const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 分钟宽限期
      const matureInProgress = inProgressTasks.filter((t) => {
        const startedAt = t.timeTracking?.startedAt;
        return !startedAt || now - startedAt >= GRACE_PERIOD_MS;
      });

      // 如果有多条「成熟」的 in-progress，说明之前被一次性唤醒导致并发执行，需要修复
      if (matureInProgress.length > 1) {
        // 按优先级排序，保留优先级最高的那条继续执行
        const sorted = [...matureInProgress].toSorted((a, b) => taskSortKey(b) - taskSortKey(a));
        const keepTask = sorted[0];
        const resetTasks = sorted.slice(1);

        console.log(
          `[Task Wake] Agent ${normalizedId} has ${inProgressTasks.length} in-progress tasks (violation of 1-task rule). Resetting ${resetTasks.length} back to todo. Keeping: ${keepTask.id} (${keepTask.priority})`,
        );

        // 将多余任务重置回 todo（必须经由 blocked 中转，因为状态机不允许 in-progress → todo 直接跳转）
        for (const t of resetTasks) {
          await taskStorage.updateTask(t.id, { status: "blocked" });
          await taskStorage.updateTask(t.id, {
            status: "todo",
            timeTracking: {
              ...t.timeTracking,
              startedAt: undefined,
            },
          });
        }

        // 重置后，当前循环不再唤醒（让 agent 就着手头的那条跨完成）
        stats.skippedTasks += resetTasks.length;
        continue;
      }

      const agentWorkspaceDir = resolveAgentWorkspaceDir(cfg, normalizedId);
      const agentMemoryPath = path.join(agentWorkspaceDir, "MEMORY.md");

      /**
       * 根据任务的 projectId 解析项目上下文（群组 sessionKey + 共享记忆路径）
       * 与 scheduleNextTaskForAgent 保持一致
       */
      function resolveProjectCtx(task: { projectId?: string; scope?: string }): {
        sharedMemoryPath: string | null;
        projectGroupSessionKey: string | null;
      } {
        // 私人任务（scope=personal）不注入项目共享记忆
        if (task.scope === "personal" || !task.projectId) {
          return { sharedMemoryPath: null, projectGroupSessionKey: null };
        }
        const allGroups = groupManager.getAllGroups();
        const projectGroup = allGroups.find((g) => g.projectId === task.projectId);
        if (!projectGroup) {
          return { sharedMemoryPath: null, projectGroupSessionKey: null };
        }
        const groupWorkspaceDir = groupWorkspaceManager.getGroupWorkspaceDir(projectGroup.id);
        return {
          projectGroupSessionKey: `group:${projectGroup.id}`,
          sharedMemoryPath: groupWorkspaceDir
            ? path.join(groupWorkspaceDir, "SHARED_MEMORY.md")
            : null,
        };
      }

      // 预先构建项目 -> 工作群 sessionKey 的映射
      const projectGroupCache = new Map<string, string>();
      const allGroups = groupManager.getAllGroups();
      for (const g of allGroups) {
        if (g.projectId && !projectGroupCache.has(g.projectId)) {
          projectGroupCache.set(g.projectId, `group:${g.id}`);
        }
      }

      // === 情况 A：有 in-progress 任务 ===
      // 如果所有 in-progress 都在宽限期内（刚分配），不打扰，等 agent 开始执行
      if (inProgressTasks.length > 0) {
        if (matureInProgress.length === 0) {
          // 所有任务都在宽限期内，说明刚刪分配，等 agent 响应中
          continue;
        }

        // 有成熟的 in-progress 且只有 1 条，检测执行超时
        const activeTask = matureInProgress[0];
        // 活跃度判断优先级：lastActivityAt > startedAt
        // 注意：不使用 updatedAt，因为 updatedAt 会被状态以外的操作（如注释、工作日志）刷新
        // 导致真正空闲的僵尸任务被误判为活跃
        const lastActivityAt = activeTask.timeTracking?.lastActivityAt;
        const startedAt = activeTask.timeTracking?.startedAt;
        // 用于判断任务是否超时的时间戳：优先 lastActivityAt（最近执行活动），其次 startedAt
        const executionStartedAt = lastActivityAt ?? startedAt;
        // 活跃度超时：lastActivityAt 超过 15 分钟没更新 → 判定为僵尸任务（agent 未在执行）
        // 模型单次 run 最多 10 分钟，15 分钟没有任何活跃记录说明 agent 已停止工作
        // 兜底：从 startedAt 起超过 60 分钟也强制重置（防止长期卡住）
        const FORCE_RESET_MS = 60 * 60 * 1000; // 60 分钟绝对超时
        // 向下兼容：若没有 lastActivityAt，退化为原来的 12 分钟 startedAt 超时
        const STALE_IN_PROGRESS_MS = lastActivityAt ? FIRST_TIMEOUT_MS : 12 * 60 * 1000;

        // 检查主控是否通过 agent.task.manage action=extend 延长了超时
        const timeoutExtendedUntil =
          typeof activeTask.metadata?.timeoutExtendedUntil === "number"
            ? activeTask.metadata.timeoutExtendedUntil
            : null;
        // 如果在延期截止时间之内，跳过本次 stale 检测，让 agent 继续执行
        if (timeoutExtendedUntil !== null && now < timeoutExtendedUntil) {
          const remainingMin = Math.ceil((timeoutExtendedUntil - now) / 60000);
          console.log(
            `[Task Wake] Agent ${normalizedId} task ${activeTask.id} is extended — skipping stale check (${remainingMin}min remaining)`,
          );
          continue;
        }

        // isStale 判定：
        //   - 首次触发：lastActivityAt 静默 >= 15min
        //   - 后续触发：距上次强制上报 >= 10min（每 10min 再催一次）
        //   - 直到 startedAt 累计 >= 60min 触发强制重置
        const lastReportPrompt = progressReportPromptedAt.get(activeTask.id);
        const silentMs = executionStartedAt != null ? now - executionStartedAt : null;
        const isFirstTimeout = silentMs !== null && silentMs >= STALE_IN_PROGRESS_MS && !lastReportPrompt;
        const isRepeatTimeout =
          lastReportPrompt !== undefined &&
          now - lastReportPrompt >= REPEAT_TIMEOUT_INTERVAL_MS;
        const isStale = isFirstTimeout || isRepeatTimeout;
        // shouldForceReset 基于 startedAt 计算（表示任务持续占用时间超过 60 分钟）
        // 与 isStale 的基准不同：isStale 用最近活动时间，shouldForceReset 用任务开始时间
        const shouldForceReset = startedAt != null && now - startedAt > FORCE_RESET_MS;

        // ── 任务超时处理（isStale 分支）─────────────────────────────────
        // 进入此处的条件：lastActivityAt（或 startedAt）静默 > INACTIVE_ZOMBIE_MS（15min）
        // 说明 agent 的 heartbeat 已停止活动，任务处于挂起状态
        //
        // 处理原则（对齐金标准）：
        //   1. 不自动标记任务为 done（完成的唯一可信信号是 task_report_to_supervisor）
        //   2. 重唤醒 agent（提醒继续执行或上报），同时通知主控关注
        //   3. 绝对兜底：startedAt > 60min 时，重置为 todo，由主控人工判断
        // ────────────────────────────────────────────────────────────────────
        if (isStale) {
          stats.pendingTasks++;
          const sessionKey = `agent:${normalizedId}:main`;
          const stuckMinutes = Math.floor((now - executionStartedAt) / 60000);

          if (shouldForceReset) {
            // 任务卡住超过 60 分钟：强制重置回 todo，让调度器重新派发
            // 这样可以避免因模型 API 超时导致任务永久卡住
            // 注意：状态机不允许 in-progress → todo 直接跳转，必须经由 blocked 中转
            console.log(
              `[Task Wake] Agent ${normalizedId} task ${activeTask.id} stuck for ${stuckMinutes}min — force resetting to todo`,
            );
            await taskStorage.updateTask(activeTask.id, { status: "blocked" });
            await taskStorage.updateTask(activeTask.id, {
              status: "todo",
              timeTracking: {
                ...activeTask.timeTracking,
                startedAt: undefined,
              },
            });
            // 通知负责人（重置通知，24h 冷却防重复）
            const supervisorRaw = (activeTask.metadata?.supervisorId ?? activeTask.creatorId) as
              | string
              | undefined;
            if (supervisorRaw) {
              const normalizedSupervisor = normalizeAgentId(supervisorRaw);
              const alertKey = `reset:${activeTask.id}`;
              const lastAlert = timeoutAlertedAt.get(alertKey);
              const shouldAlert = !lastAlert || now - lastAlert > TIMEOUT_ALERT_COOLDOWN_MS;
              if (shouldAlert) {
                timeoutAlertedAt.set(alertKey, now);
                const supervisorSession = `agent:${normalizedSupervisor}:main`;
                const supervisorNotice = [
                  `[TASK AUTO-RESET] 🚨 Agent ${normalizedId} 的任务卡顿超过 ${stuckMinutes} 分钟，已被自动重置回待办队列。需要你人工检查。`,
                  ``,
                  `Agent: ${normalizedId}`,
                  `Task ID: ${activeTask.id}`,
                  `Title: ${activeTask.title}`,
                  `Priority: ${activeTask.priority}`,
                  activeTask.type ? `Type: ${activeTask.type}` : null,
                  ``,
                  `「重置原因」任务开始执行已超过 ${stuckMinutes} 分钟，agent 始终未调用 task_report_to_supervisor 上报完成。`,
                  `已自动重置为 todo 状态，等待下轮调度重新分配。`,
                  ``,
                  `【建议】请调用以下工具处理（任务已重置回 todo，可直接重新分配）：`,
                  `- agent_assign_task 将任务重新分配给合适的 agent`,
                  `- task_update taskId=${activeTask.id} status=cancelled  （如任务本身无法完成）`,
                  `- agent_communicate targetAgentId=${normalizedId}        （与 agent 沟通原因）`,
                ]
                  .filter(Boolean)
                  .join("\n");
                enqueueSystemEvent(supervisorNotice, {
                  sessionKey: supervisorSession,
                  contextKey: `cron:task-autoreset:${activeTask.id}`,
                });
                requestHeartbeatNow({
                  reason: `cron:task-autoreset:${activeTask.id}`,
                  sessionKey: supervisorSession,
                  agentId: normalizedSupervisor,
                  coalesceMs: 10000,
                });
              }
            }
            stats.wokenAgents++;
            // 重置后清理上报记录，防止内存泄漏
            progressReportPromptedAt.delete(activeTask.id);
            // 重置后不再走 todo 派发，等下轮扫描再分配
            continue;
          }

          // 任务卡住 15-60 分钟：记录本次强制上报时间，每 10min 触发一次
          progressReportPromptedAt.set(activeTask.id, now);
          const reportRound = lastReportPrompt
            ? Math.floor((now - (startedAt ?? now)) / REPEAT_TIMEOUT_INTERVAL_MS)
            : 1;
          console.log(
            `[Task Wake] Agent ${normalizedId} task ${activeTask.id} stuck for ${stuckMinutes}min (round ${reportRound}) — forcing progress report`,
          );
          // 不重置 startedAt/lastActivityAt，避免干扰后续 shouldForceReset 计算
          // lastActivityAt 会在 heartbeat run 完成后自动刷新（如果 agent 响应了唤醒）

          const projectGroupKey = activeTask.projectId
            ? projectGroupCache.get(activeTask.projectId)
            : undefined;
          const taskLines = [
            `1. [IN-PROGRESS] ${activeTask.title}`,
            `   Task ID: ${activeTask.id}`,
            `   Priority: ${activeTask.priority}`,
            activeTask.projectId ? `   Project: ${activeTask.projectId}` : null,
            activeTask.type ? `   Type: ${activeTask.type}` : null,
            projectGroupKey ? `   Project Group Channel: sessionKey=${projectGroupKey}` : null,
            activeTask.description
              ? `   Description: ${activeTask.description.slice(0, 200)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n");

          const wakeMessage = (() => {
            const { sharedMemoryPath, projectGroupSessionKey } = resolveProjectCtx(activeTask);
            // 推断卡顿根因，生成差异化唤醒消息（借鉴业界 MAST 论文分析）
            const stuckReason = inferStuckReason(stuckMinutes, activeTask);
            const reasonTag = {
              api_timeout: "[API超时]",
              context_overflow: "[Context溢出]",
              tool_failure: "[工具失败]",
              unknown: "",
            }[stuckReason.type];
            const isRepeat = lastReportPrompt !== undefined;
            const reportRound2 = isRepeat
              ? Math.floor((now - (startedAt ?? now)) / REPEAT_TIMEOUT_INTERVAL_MS) + 1
              : 1;
            return [
              isRepeat
                ? `[TASK RETRY — FOLLOW-UP #${reportRound2}] ${reasonTag} Your task has been inactive for ${stuckMinutes} minutes. This is follow-up check #${reportRound2}. You MUST report progress now:`
                : `[TASK RETRY] ${reasonTag} Your task timed out after ${stuckMinutes} minutes. You MUST report progress now:`,
              `  (Follow-up checks will repeat every 5 minutes until 60 minutes total, then the task will be force-reset.)`,
              ``,
              taskLines,
              ``,
              `⚠️ Failure Analysis: ${stuckReason.hint}`,
              ``,
              `Working Context:`,
              `- Working Directory: ${agentWorkspaceDir}`,
              `- Your Personal Memory (only YOU may write this): ${agentMemoryPath}`,
              sharedMemoryPath
                ? `- Project Shared Memory (all team members read/write): ${sharedMemoryPath}`
                : null,
              projectGroupSessionKey
                ? `- Project Group: sessionKey=${projectGroupSessionKey}`
                : null,
              ``,
              `Memory rules: Write personal insights/decisions to Your Personal Memory only. Write project-wide knowledge to Project Shared Memory. NEVER write to another agent's personal memory file.`,
              ``,
              `‼️ MANDATORY PROGRESS REPORT — You MUST call task_report_to_supervisor NOW with Task ID: ${activeTask.id}`,
              ``,
              `  Option A (Done):     status="done",         result=summary of what you accomplished`,
              `  Option B (Working):  status="in-progress",  result=current progress + what remains + ETA`,
              `  Option C (Blocked):  status="blocked",      result=specific blocker and what you need to unblock`,
              ``,
              `DO NOT remain silent. Failing to call task_report_to_supervisor will trigger further escalation to your supervisor.`,
            ]
              .filter(Boolean)
              .join("\n");
          })();

          enqueueSystemEvent(wakeMessage, {
            sessionKey,
            contextKey: `cron:task-wake:${normalizedId}`,
          });
          requestHeartbeatNow({
            reason: `cron:task-retry:${activeTask.id}`,
            sessionKey,
            agentId: normalizedId,
            coalesceMs: 5000,
          });

          // 连续失败计数：每次尝试重唤醒同一任务次数 +1
          // 达到阈値后 Task Wake 将暂停唤醒，等待 heartbeat-runner 的 overflow 清空生效
          const staleKey = `${normalizedId}:${activeTask.id}`;
          const existing = agentStaleWakeCount.get(staleKey);
          agentStaleWakeCount.set(staleKey, {
            count: (existing?.count ?? 0) + 1,
            taskId: activeTask.id,
            lastAt: now,
          });
          if ((existing?.count ?? 0) + 1 >= MAX_STALE_WAKE_BEFORE_PAUSE) {
            console.log(
              `[Task Wake] Agent ${normalizedId} task ${activeTask.id} has been retried ${(existing?.count ?? 0) + 1} times without progress — possible context overflow. Will pause wakes for ${OVERFLOW_PAUSE_MS / 60000}min.`,
            );
          }

          // 同时通知负责人（超时告警，24h 冷却防重复）
          const supervisorRaw = (activeTask.metadata?.supervisorId ?? activeTask.creatorId) as
            | string
            | undefined;
          if (supervisorRaw) {
            const normalizedSupervisor = normalizeAgentId(supervisorRaw);
            const alertKey = `timeout:${activeTask.id}`;
            const lastAlert = timeoutAlertedAt.get(alertKey);
            const shouldAlert = !lastAlert || now - lastAlert > TIMEOUT_ALERT_COOLDOWN_MS;
            if (shouldAlert) {
              timeoutAlertedAt.set(alertKey, now);
              const supervisorSession = `agent:${normalizedSupervisor}:main`;
              const supervisorNotice = [
                `[TASK TIMEOUT ALERT] ⚠️ Agent ${normalizedId} 的任务已超时 ${stuckMinutes} 分钟，系统已自动重唤醒 agent，但任务可能需要你介入。`,
                ``,
                `Agent: ${normalizedId}`,
                `Task ID: ${activeTask.id}`,
                `Title: ${activeTask.title}`,
                `Priority: ${activeTask.priority}`,
                activeTask.type ? `Type: ${activeTask.type}` : null,
                activeTask.description
                  ? `Description: ${activeTask.description.slice(0, 150)}`
                  : null,
                ``,
                `⚠️ 根因分析: ${inferStuckReason(stuckMinutes, activeTask).hint}`,
                ``,
                `【注意】系统已向 agent 发送 TASK RETRY 消息，要求强制上报进度。`,
                `任务状态仍为 in-progress，等待 agent 自主上报（task_report_to_supervisor）。`,
                `如果 agent 持续无法完成此任务，你可以直接调用以下工具：`,
                `- task_reset taskId=${activeTask.id} targetStatus=todo   （重置回待办，重新排队）`,
                `- task_update taskId=${activeTask.id} status=cancelled    （取消任务）`,
                `- task_update taskId=${activeTask.id} assigneeId=<其他agent>  （重新分配给其他 agent）`,
                `- agent_communicate targetAgentId=${normalizedId}          （直接与 agent 沟通原因）`,
              ]
                .filter(Boolean)
                .join("\n");
              enqueueSystemEvent(supervisorNotice, {
                sessionKey: supervisorSession,
                contextKey: `cron:task-timeout-alert:${activeTask.id}`,
              });
              requestHeartbeatNow({
                reason: `cron:task-timeout:${activeTask.id}`,
                sessionKey: supervisorSession,
                agentId: normalizedSupervisor,
                coalesceMs: 10000,
              });
            }
          }
          stats.wokenAgents++;
        } else {
          // === 任务未超时，但需确保 agent 处于活跃状态 ===
          // Bug 修复：服务重启后，历史 in-progress 任务没有 system event 驱动 agent 执行
          // 调度器必须主动唤醒，不能直接 continue 让 agent 永久空闲
          //
          // 背压保护：提高重激活阈值到 10 分钟，避免每 2 分钟打扰正常执行的 Agent
          // Agent 模型单次 run 最多 10 分钟，10 分钟无活动才真正需要干预
          const timeSinceActivity = executionStartedAt != null ? now - executionStartedAt : null;

          // 重启立即唤醒：服务重启后首次扫描时，无论活动时间多久，
          // 都补发 [TASK RESUME] 驱动 agent 恢复执行（跳过静默窗口）
          const needsRestartResume = isRestartScan;

          // 指数退避背压保护：同一任务的重激活消息，两次之间至少间隔 cooldownMs
          // 第1次空闲 → 等10分钟，第2次 → 20分钟，第3次 → 40分钟，上限60分钟
          const lastReactivateKey = `reactivate:${normalizedId}:${activeTask.id}`;
          const reactivateRecord = agentLastReactivateAt.get(lastReactivateKey);
          const reactivateAttempts = reactivateRecord?.attempts ?? 0;
          const cooldownMs = getReactivateBackoffMs(reactivateAttempts);
          const reactivateCooldownOk = now - (reactivateRecord?.lastAt ?? 0) > cooldownMs;

          if (
            needsRestartResume ||
            (timeSinceActivity !== null && timeSinceActivity > cooldownMs && reactivateCooldownOk)
          ) {
            // 记录本次重激活时间 + 累计次数，用于指数退避限速
            if (!needsRestartResume) {
              agentLastReactivateAt.set(lastReactivateKey, {
                lastAt: now,
                attempts: reactivateAttempts + 1,
              });
            }
            const sessionKey = `agent:${normalizedId}:main`;
            const idleMinutes =
              timeSinceActivity != null ? Math.floor(timeSinceActivity / 60000) : 0;
            if (needsRestartResume) {
              console.log(
                `[Task Wake] Agent ${normalizedId} task ${activeTask.id} in-progress — service restart detected, sending TASK RESUME immediately`,
              );
            } else {
              console.log(
                `[Task Wake] Agent ${normalizedId} task ${activeTask.id} in-progress but idle ${idleMinutes}min — re-activating`,
              );
            }
            const { sharedMemoryPath, projectGroupSessionKey } = resolveProjectCtx(activeTask);
            const projectGroupKey = activeTask.projectId
              ? projectGroupCache.get(activeTask.projectId)
              : undefined;
            const reactivateMsg = [
              needsRestartResume
                ? `[TASK RESUME] Service was restarted. You have an in-progress task — continue executing it now:`
                : `[TASK RESUME] You have an in-progress task that needs your attention:`,
              ``,
              `Task ID: ${activeTask.id}`,
              `Title: ${activeTask.title}`,
              `Priority: ${activeTask.priority}`,
              activeTask.projectId ? `Project: ${activeTask.projectId}` : null,
              activeTask.type ? `Type: ${activeTask.type}` : null,
              projectGroupKey ? `Project Group Channel: sessionKey=${projectGroupKey}` : null,
              activeTask.description
                ? `Description: ${activeTask.description.slice(0, 200)}`
                : null,
              ``,
              `Working Context:`,
              `- Working Directory: ${agentWorkspaceDir}`,
              `- Your Personal Memory (only YOU may write this): ${agentMemoryPath}`,
              sharedMemoryPath
                ? `- Project Shared Memory (all team members read/write): ${sharedMemoryPath}`
                : null,
              projectGroupSessionKey
                ? `- Project Group: sessionKey=${projectGroupSessionKey}`
                : null,
              ``,
              `IMPORTANT: This task is already in-progress. Continue executing it NOW. When done, call task_report_to_supervisor with Task ID: ${activeTask.id}`,
            ]
              .filter(Boolean)
              .join("\n");
            enqueueSystemEvent(reactivateMsg, {
              sessionKey,
              contextKey: `cron:task-resume:${activeTask.id}`,
            });
            requestHeartbeatNow({
              reason: `cron:task-resume:${activeTask.id}`,
              sessionKey,
              agentId: normalizedId,
              coalesceMs: 5000,
            });
            stats.wokenAgents++;
          }
          // else: 最近10分钟内有活动记录或重激活冷却未结束，agent 正在正常执行，不打扰
        }
        continue;
      }

      // === 情况 B：无 in-progress，有 todo → 取优先级最高的 1 条唤醒 ===
      if (inProgressTasks.length === 0 && todoTasks.length > 0) {
        // 逐期检测：todo 任务中如果有截止日已过且优先级不是 urgent，自动升级并通知 supervisor
        // 如同自然人一早起来发现昨天的任务还没完成，上级会主动提醒
        for (const t of todoTasks) {
          if (t.dueDate && t.dueDate < now && t.priority !== "urgent") {
            const overdueMinutes = Math.floor((now - t.dueDate) / 60000);
            console.log(
              `[Task Wake] Task ${t.id} (${t.title}) is overdue by ${overdueMinutes}min — auto-escalating priority to urgent`,
            );
            await taskStorage.updateTask(t.id, { priority: "urgent" });
            // 通知 supervisor
            const overdueSupRaw = t.supervisorId ?? t.creatorId;
            if (overdueSupRaw && overdueSupRaw !== "system") {
              const overdueSupId = normalizeAgentId(overdueSupRaw);
              const overdueSupSession = `agent:${overdueSupId}:main`;
              const overdueMsg = [
                `[TASK OVERDUE] A task assigned to ${(t.assignees ?? []).map((a) => a.id).join(", ") || "unknown"} is overdue and has been auto-escalated to urgent priority.`,
                ``,
                `Task ID: ${t.id}`,
                `Title: ${t.title}`,
                `Due date: ${new Date(t.dueDate).toISOString()}`,
                `Overdue by: ${overdueMinutes} minutes`,
                t.projectId ? `Project: ${t.projectId}` : null,
                ``,
                `The task priority has been automatically upgraded to urgent.`,
                `Please review and decide: extend the deadline, reassign, or cancel.`,
              ]
                .filter(Boolean)
                .join("\n");
              enqueueSystemEvent(overdueMsg, {
                sessionKey: overdueSupSession,
                contextKey: `cron:task-overdue:${t.id}`,
              });
              requestHeartbeatNow({
                reason: `cron:task-overdue:${t.id}`,
                sessionKey: overdueSupSession,
                agentId: overdueSupId,
                coalesceMs: 10000,
              });
            }
          }
        }
        // 不做 projectId 过滤：任务只要分配给该 agent 就直接执行，无论属于哪个项目
        // 按优先级排序，只唤醒最高优先级的 1 条
        // C3 自适应课程：当 Agent 在某类任务的历史成功率 <60% 时，降低该类任务的调度优先级

        // === KPI 择优重分配（Hermes v0.8.0 cron KPI 借鉴）===
        // 扩展现有 C3 自适应课程：当当前 Agent 对某类任务成功率 < 40%（低于阀值），
        // 且有其他空闲 Agent 对该类型成功率高出至少 25%，则将任务自动重分配给最优 Agent。
        const KPI_REASSIGN_THRESHOLD = 0.4;
        const KPI_REASSIGN_MIN_GAIN = 0.25;
        const idleAgentIds = agentIds
          .map((id) => normalizeAgentId(id))
          .filter((id) => id !== normalizedId);

        if (idleAgentIds.length > 0) {
          for (const todoTask of todoTasks) {
            if (todoTask.priority === "urgent") {
              continue; // urgent 任务不重分配
            }
            const taskSummary = todoTask.title + " " + (todoTask.description ?? "").slice(0, 100);
            const currentAgentPerf = getTaskTypePerfScore(normalizedId, taskSummary);
            if (!currentAgentPerf || currentAgentPerf.total < 3) {
              continue; // 样本不足
            }
            if (currentAgentPerf.successRate >= KPI_REASSIGN_THRESHOLD) {
              continue; // 表现还不错
            }

            let bestAgentId: string | null = null;
            let bestSuccessRate = currentAgentPerf.successRate + KPI_REASSIGN_MIN_GAIN;

            for (const candidateId of idleAgentIds) {
              const candidatePerf = getTaskTypePerfScore(candidateId, taskSummary);
              if (
                candidatePerf &&
                candidatePerf.total >= 3 &&
                candidatePerf.successRate > bestSuccessRate
              ) {
                try {
                  const candidateInProgress = await taskStorage.listTasks({
                    assigneeId: candidateId,
                    status: ["in-progress"],
                  });
                  if (candidateInProgress.length === 0) {
                    bestSuccessRate = candidatePerf.successRate;
                    bestAgentId = candidateId;
                  }
                } catch {
                  /* 查询失败不影响主流程 */
                }
              }
            }

            if (bestAgentId) {
              const taskType = inferTaskType(taskSummary, todoTask.tags ?? []);
              console.log(
                `[Task Wake] KPI Reassign: Task ${todoTask.id} (“${todoTask.title}”) reassigned from ${normalizedId} (${Math.round(currentAgentPerf.successRate * 100)}% on ${taskType}) to ${bestAgentId} (${Math.round(bestSuccessRate * 100)}%)`,
              );
              await taskStorage.updateTask(todoTask.id, {
                assignees: [
                  ...(todoTask.assignees ?? []).filter((a) => a.id !== normalizedId),
                  {
                    id: bestAgentId,
                    type: "agent" as const,
                    role: "assignee" as const,
                    assignedAt: now,
                    assignedBy: "cron:kpi-reassign",
                  },
                ],
              });
              // 通知 supervisor
              const kpiSupRaw = todoTask.supervisorId ?? todoTask.creatorId;
              if (kpiSupRaw && kpiSupRaw !== "system") {
                const kpiSupId = normalizeAgentId(kpiSupRaw);
                const kpiSupSession = `agent:${kpiSupId}:main`;
                enqueueSystemEvent(
                  [
                    `[KPI REASSIGN] Task automatically reassigned to a better-performing agent.`,
                    ``,
                    `Task ID: ${todoTask.id}`,
                    `Title: ${todoTask.title}`,
                    `Original agent: ${normalizedId} (${Math.round(currentAgentPerf.successRate * 100)}% on ${taskType} tasks)`,
                    `New agent: ${bestAgentId} (${Math.round(bestSuccessRate * 100)}% success rate)`,
                    ``,
                    `This reassignment was made automatically by the KPI scheduler.`,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  {
                    sessionKey: kpiSupSession,
                    contextKey: `cron:kpi-reassign:${todoTask.id}`,
                  },
                );
                requestHeartbeatNow({
                  reason: `cron:kpi-reassign:${todoTask.id}`,
                  sessionKey: kpiSupSession,
                  agentId: kpiSupId,
                  coalesceMs: 15000,
                });
              }
            }
          }
        }

        // KPI 重分配后重新读取最新 todo（部分任务可能已被分出）
        const latestTodoTasks =
          idleAgentIds.length > 0
            ? await taskStorage.listTasks({ assigneeId: normalizedId, status: ["todo"] })
            : todoTasks;
        if (latestTodoTasks.length === 0) {
          continue;
        }

        const sortedTodos = [...latestTodoTasks].toSorted((a, b) => {
          let scoreA = taskSortKey(a);
          let scoreB = taskSortKey(b);
          // C3: 读取性能画像，当成功率 <60% 时懒化该类任务（不低于 urgent 级别）
          if (a.priority !== "urgent" && a.description) {
            const perfA = getTaskTypePerfScore(
              normalizedId,
              a.title + " " + a.description.slice(0, 100),
            );
            if (perfA && perfA.successRate < 0.6) {
              // 成功率越低，惩罚越大：最多降 1e12（相当于把 medium 降到 low 之下）
              const penalty = Math.round((0.6 - perfA.successRate) * 2e12);
              scoreA -= penalty;
            }
          }
          if (b.priority !== "urgent" && b.description) {
            const perfB = getTaskTypePerfScore(
              normalizedId,
              b.title + " " + b.description.slice(0, 100),
            );
            if (perfB && perfB.successRate < 0.6) {
              const penalty = Math.round((0.6 - perfB.successRate) * 2e12);
              scoreB -= penalty;
            }
          }
          return scoreB - scoreA;
        });
        // 决策：top1 与 top2 优先级相同时取 2 条，否则取 1 条（防止 medium 任务堆积）
        const top1 = sortedTodos[0];
        const top2 = sortedTodos[1];
        const tasksToActivate = top2 && top2.priority === top1.priority ? [top1, top2] : [top1];

        // 批量将选中任务程序直接更新为 in-progress，不依赖 agent 自己改状态
        const activatedTasks: typeof tasksToActivate = [];
        for (const t of tasksToActivate) {
          const updated = await taskStorage.updateTask(t.id, {
            status: "in-progress",
            timeTracking: { ...t.timeTracking, startedAt: now, lastActivityAt: now },
          });
          if (updated) {
            activatedTasks.push(updated);
          }
        }
        if (activatedTasks.length === 0) {
          continue;
        }

        const nextTask = activatedTasks[0];
        const queueRemaining = sortedTodos.length - tasksToActivate.length;

        stats.pendingTasks++;
        const sessionKey = `agent:${normalizedId}:main`;
        const projectGroupKey = nextTask.projectId
          ? projectGroupCache.get(nextTask.projectId)
          : undefined;

        const taskLines = activatedTasks
          .map((t, i) =>
            [
              `${i + 1}. [IN-PROGRESS] ${t.title}`,
              `   Task ID: ${t.id}`,
              `   Priority: ${t.priority}`,
              t.projectId ? `   Project: ${t.projectId}` : null,
              t.teamId ? `   Team: ${t.teamId}` : null,
              t.organizationId ? `   Organization: ${t.organizationId}` : null,
              t.type ? `   Type: ${t.type}` : null,
              t.dueDate ? `   Due: ${new Date(t.dueDate).toISOString()}` : null,
              projectGroupKey ? `   Project Group Channel: sessionKey=${projectGroupKey}` : null,
              t.description ? `   Description: ${t.description.slice(0, 200)}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n");

        const wakeMessage = (() => {
          const { sharedMemoryPath, projectGroupSessionKey } = resolveProjectCtx(nextTask);
          // C3 自适应课程：若此类任务成功率偏低，加入提示警告
          let perfWarning: string | null = null;
          try {
            const perfScore = getTaskTypePerfScore(
              normalizedId,
              nextTask.title + " " + (nextTask.description ?? "").slice(0, 100),
            );
            if (perfScore && perfScore.successRate < 0.6) {
              perfWarning = `[C3 ADAPTIVE] Your historical success rate for "${perfScore.taskType}" tasks is ${Math.round(perfScore.successRate * 100)}% (based on ${perfScore.total} tasks). Take extra care, double-check your approach before executing.`;
            }
          } catch {
            /* 不影响主流程 */
          }

          // === P2 Harness Tool Focus（Inferential Feedforward）===
          // 根据任务类型注入工具聚焦指令，防止 Agent 在重型管理工具上浪费 token。
          // 参考 Harness Engineering：避免 "Too Many Tools" 导致 dumb zone。
          let toolFocusHint: string | null = null;
          try {
            const taskSummary = nextTask.title + " " + (nextTask.description ?? "").slice(0, 100);
            const taskType = inferTaskType(taskSummary, nextTask.tags ?? []);
            const TOOL_FOCUS_MAP: Record<string, string> = {
              coding:
                "web_fetch, web_search, task_worklog_add, task_complete. Avoid agent_spawn, team_orchestrate, agent_lifecycle tools unless explicitly required.",
              writing:
                "web_search, web_fetch, task_worklog_add, task_complete. Avoid agent_spawn, team_orchestrate tools.",
              research:
                "web_search, web_fetch, task_worklog_add, task_complete. Avoid agent_spawn, agent_lifecycle tools.",
              data_analysis:
                "web_fetch, task_worklog_add, task_complete. Avoid agent_spawn, team_orchestrate tools.",
              planning:
                "task_create, task_subtask_create, task_worklog_add, task_complete. Agent coordination tools are acceptable.",
              qa: "web_search, web_fetch, task_worklog_add, task_complete.",
              translation: "task_worklog_add, task_complete.",
              summarization: "task_worklog_add, task_complete.",
              general: "Use the minimum set of tools necessary to complete the task.",
            };
            const focusTools = TOOL_FOCUS_MAP[taskType] ?? TOOL_FOCUS_MAP["general"];
            toolFocusHint = `[TOOL FOCUS — ${taskType.toUpperCase()}] This is a "${taskType}" task. Prioritize: ${focusTools}`;
          } catch {
            /* 不影响主流程 */
          }

          return [
            `[TASK WAKE] You have ${activatedTasks.length} task(s) activated now${queueRemaining > 0 ? ` (${queueRemaining} more waiting in queue)` : ""}. Tasks are already set to in-progress:`,
            ``,
            taskLines,
            ``,
            `Working Context:`,
            `- Working Directory: ${agentWorkspaceDir}`,
            `- Your Personal Memory (only YOU may write this): ${agentMemoryPath}`,
            sharedMemoryPath
              ? `- Project Shared Memory (all team members read/write): ${sharedMemoryPath}`
              : null,
            projectGroupSessionKey ? `- Project Group: sessionKey=${projectGroupSessionKey}` : null,
            perfWarning ? `\n${perfWarning}` : null,
            toolFocusHint ? `\n${toolFocusHint}` : null,
            ``,
            `Memory rules: Write personal insights/decisions to Your Personal Memory only. Write project-wide knowledge to Project Shared Memory. NEVER write to another agent's personal memory file.`,
            ``,
            `IMPORTANT: These tasks are already set to in-progress by the system. Execute them NOW. Do NOT change their status to in-progress again — just work on them and call task_report_to_supervisor when each one is done.`,
          ]
            .filter(Boolean)
            .join("\n");
        })();

        enqueueSystemEvent(wakeMessage, {
          sessionKey,
          contextKey: `cron:task-wake:${normalizedId}`,
        });
        requestHeartbeatNow({
          reason: `cron:task-wake:${nextTask.id}`,
          sessionKey,
          agentId: normalizedId,
          coalesceMs: 5000,
        });
        stats.wokenAgents++;

        // 積压告警：todo 队列超过 5 条时，通知 supervisor 任务过多
        // 这是纯程序侧检测，不依赖 agent 自觉报告
        const BACKLOG_ALERT_THRESHOLD = 5;
        if (queueRemaining >= BACKLOG_ALERT_THRESHOLD) {
          // 找到任务的 supervisor
          const firstTask = activatedTasks[0];
          const backlogSupRaw = firstTask.supervisorId ?? firstTask.creatorId;
          if (backlogSupRaw && backlogSupRaw !== "system") {
            const backlogSupId = normalizeAgentId(backlogSupRaw);
            const backlogSupSession = `agent:${backlogSupId}:main`;
            const backlogMsg = [
              `[TASK BACKLOG ALERT] Agent ${normalizedId} has ${queueRemaining + tasksToActivate.length} pending tasks (${queueRemaining} waiting in queue). This may indicate task assignment is outpacing execution.`,
              ``,
              `Agent: ${normalizedId}`,
              `Total active tasks: ${queueRemaining + tasksToActivate.length}`,
              `Currently activated: ${tasksToActivate.length}`,
              `Waiting in queue: ${queueRemaining}`,
              ``,
              `Recommendation: Review if some tasks can be cancelled, reassigned to other agents, or if the assignment rate needs to slow down.`,
              `Use agent_task_manage to manage tasks if needed.`,
            ]
              .filter(Boolean)
              .join("\n");
            enqueueSystemEvent(backlogMsg, {
              sessionKey: backlogSupSession,
              contextKey: `cron:task-backlog:${normalizedId}`,
            });
            requestHeartbeatNow({
              reason: `cron:task-backlog:${normalizedId}`,
              sessionKey: backlogSupSession,
              agentId: backlogSupId,
              coalesceMs: 30000, // 合并尽量减少打扰
            });
          }
        }
      }
    }

    // ============================================================================
    // 任务驱动系统：低水位监测（Low Watermark Refill）
    //
    // 直接复用 checkAndNotifyLowWatermark 辅助函数（与 auto-done 共享同一套逻辑）
    // ============================================================================
    for (const agentId of agentIds) {
      const normalizedId = normalizeAgentId(agentId);
      try {
        await checkAndNotifyLowWatermark(normalizedId, now);
      } catch (lwmErr) {
        console.warn(
          `[Task Wake] Low watermark check error for ${normalizedId}: ${String(lwmErr)}`,
        );
      }
    }

    if (stats.wokenAgents > 0) {
      console.log(
        `[Task Wake] Scan: ${stats.wokenAgents}/${stats.scannedAgents} agents woken, ${stats.pendingTasks} tasks, ${stats.skippedTasks} skipped`,
      );
    }

    // 每日自适应调整：调用阈值自适应引擎（内部有间隔限制，24h 才执行一次）
    adaptThresholds().then((result) => {
      if (result.adjusted > 0) {
        console.log(
          `[Task Wake] 自适应阈值调整完成：${result.adjusted} 条配置更新，${result.skipped} 条跳过`,
        );
      }
    }).catch((adaptErr) => {
      console.warn(`[Task Wake] 阈值自适应调整失败: ${String(adaptErr)}`);
    });

    return stats;
  } catch (error) {
    console.error("[Task Wake] Error during scan:", error);
    return stats;
  }
}

// ============================================================================
// 启动/停止控制
// ============================================================================

/**
 * 启动 Agent 任务唤醒调度器
 *
 * 首次扫描延迟 30 秒（等待系统初始化完毕），之后每 2 分钟一次
 */
export function startAgentTaskWakeScheduler(options?: { intervalMinutes?: number }): void {
  const intervalMinutes = options?.intervalMinutes ?? 2;

  if (scanInterval) {
    clearInterval(scanInterval);
  }
  if (startupTimer) {
    clearTimeout(startupTimer);
  }

  // 每次调度器启动（服务重启）都重置首次扫描标志
  // 确保重启后第一次扫描能立即唤醒所有历史 in-progress 任务
  isFirstScan = true;

  // 注册閘失阈值配置通知回调（将缺失告警定向发送给系统默认主控 agent）
  try {
    const cfgForNotify = loadConfig();
    const defaultAgentId = resolveDefaultAgentId(cfgForNotify);
    const normalizedDefault = normalizeAgentId(defaultAgentId);
    registerMissingThresholdNotifier((message, contextKey) => {
      const defaultSession = `agent:${normalizedDefault}:main`;
      enqueueSystemEvent(message, { sessionKey: defaultSession, contextKey });
      requestHeartbeatNow({
        reason: contextKey,
        sessionKey: defaultSession,
        agentId: normalizedDefault,
        coalesceMs: 30000,
      });
    });
  } catch {
    // 如果获取主控 agent 失败，跳过注册（lookupThreshold 仍正常运行，只是不发通知）
  }

  console.log(
    `[Task Wake] Scheduler starting (first scan in ${STARTUP_DELAY_MS / 1000}s, then every ${intervalMinutes}min)`,
  );

  // 延迟首次扫描，等待系统完全初始化，避免阻塞启动
  startupTimer = setTimeout(() => {
    void scanAndWakeAgentsWithPendingTasks();

    // 首次扫描完成后启动定时器
    scanInterval = setInterval(
      () => {
        void scanAndWakeAgentsWithPendingTasks();
      },
      intervalMinutes * 60 * 1000,
    );

    console.log(`[Task Wake] ✓ Scheduler active (interval: ${intervalMinutes}min)`);
  }, STARTUP_DELAY_MS);
}

/**
 * 停止调度器
 */
export function stopAgentTaskWakeScheduler(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log("[Task Wake] Scheduler stopped");
  }
}
