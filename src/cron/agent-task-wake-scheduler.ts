/**
 * Agent 任务唤醒调度器
 *
 * 每 2 分钟扫描一次所有 Agent 的待办任务
 *
 * 核心原则：
 * 1. 每个 Agent 同时只能执行 1 条任务（串行执行）
 * 2. 发现多条 in-progress → 保留优先级最高的 1 条，其余重置回 todo 排队
 * 3. 无 in-progress 且有 todo → 取优先级最高的 1 条唤醒执行
 * 4. 有 in-progress（仅 1 条）且超时（>12min）→ 自动重置回 todo 并立即重新派发（避免模型超时死循环）
 *    4a. 超时 >60min → 强制重置回 todo，等下轮调度器扫描再分配（通知负责人）
 * 5. todo 任务只是排队，不检测超时
 * 6. Context Overflow 防循环：记录连续失败次数，超过阈値则暂停重试并通知 supervisor
 *    （业界最佳实践：overflow 属于 non-retriable 错误，不应无限重试）
 */

import path from "node:path";
import { loadConfig } from "../../upstream/src/config/config.js";
import { requestHeartbeatNow } from "../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../upstream/src/infra/system-events.js";
import { listAgentIds, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { getTaskTypePerfScore } from "../gateway/server-methods/evolve-rpc.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { groupManager } from "../sessions/group-manager.js";
import * as taskStorage from "../tasks/storage.js";
import { groupWorkspaceManager } from "../workspace/group-workspace.js";

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
// 连续失败 N 次后暂停重试（业界最佳实践：3-5 次）
const MAX_STALE_WAKE_BEFORE_PAUSE = 3;
// 暂停期间（10 分钟，等 heartbeat-runner 的 overflow 清空生效）
const OVERFLOW_PAUSE_MS = 10 * 60 * 1000;

function taskSortKey(t: { priority: string; weight?: number; createdAt: number }): number {
  // 得分越高越优先：优先级权重 * 1e13 + 任务权重 * 1e6 - 创建时间（越早越高）
  const priorityScore = (PRIORITY_WEIGHT[t.priority] ?? 2) * 1e13;
  const weightScore = (t.weight ?? 0) * 1e6;
  return priorityScore + weightScore - t.createdAt;
}

const STARTUP_DELAY_MS = 5 * 1000; // 5 秒（等待基础模块初始化，避免冷启动冲突）
let scanInterval: NodeJS.Timeout | null = null;

let startupTimer: NodeJS.Timeout | null = null;

// ============================================================================
// 核心逻辑
// ============================================================================

/**
 * 扫描所有 Agent 的待办任务并唤醒有任务的 Agent
 */
export async function scanAndWakeAgentsWithPendingTasks(): Promise<{
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
      // 业界最佳实践：overflow 属于 non-retriable 错误。
      // 如果 agent 对同一个任务连续尝试多次却任务状态始终没变，
      // 说明它占着任务却没在执行（最常见原因：context overflow 導致 embedded run 静默失败）。
      // 连续超过阈値后暂停唤醒，等待 heartbeat-runner 的自动清空生效。
      const activeInProgress = inProgressTasks[0];
      if (activeInProgress) {
        const staleKey = `${normalizedId}:${activeInProgress.id}`;
        const staleInfo = agentStaleWakeCount.get(staleKey);
        const taskUpdatedAt = activeInProgress.updatedAt ?? 0;
        // 如果任务在上次扫描后有更新（说明 agent 在执行），重置计数器
        if (staleInfo && taskUpdatedAt > staleInfo.lastAt) {
          agentStaleWakeCount.delete(staleKey);
        } else if (staleInfo && staleInfo.count >= MAX_STALE_WAKE_BEFORE_PAUSE) {
          const pauseRemaining = staleInfo.lastAt + OVERFLOW_PAUSE_MS - now;
          if (pauseRemaining > 0) {
            console.log(
              `[Task Wake] Agent ${normalizedId} paused due to repeated stale wakes (${staleInfo.count}/${MAX_STALE_WAKE_BEFORE_PAUSE}) — possible context overflow loop. Resuming in ${Math.ceil(pauseRemaining / 60000)}min.`,
            );
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

        // 将多余任务重置回 todo
        for (const t of resetTasks) {
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
        // 只用 startedAt 或 updatedAt（都是进入执行后才会设置）
        const executionStartedAt = activeTask.timeTracking?.startedAt ?? activeTask.updatedAt;
        // 模型超时是 10 分钟（600s），超时后 surface_error，任务卡在 in-progress
        // 设置为 12 分钟，略大于模型超时，确保能及时检测到卡住的任务
        const STALE_IN_PROGRESS_MS = 12 * 60 * 1000; // 12 分钟
        // 超长任务（>60分钟）认为需要强制重置而非重唤醒
        const FORCE_RESET_MS = 60 * 60 * 1000; // 60 分钟

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

        const isStale =
          executionStartedAt != null && now - executionStartedAt > STALE_IN_PROGRESS_MS;
        const shouldForceReset =
          executionStartedAt != null && now - executionStartedAt > FORCE_RESET_MS;

        if (isStale) {
          stats.pendingTasks++;
          const sessionKey = `agent:${normalizedId}:main`;
          const stuckMinutes = Math.floor((now - executionStartedAt) / 60000);

          if (shouldForceReset) {
            // 任务卡住超过 60 分钟：强制重置回 todo，让调度器重新派发
            // 这样可以避免因模型 API 超时导致任务永久卡住
            console.log(
              `[Task Wake] Agent ${normalizedId} task ${activeTask.id} stuck for ${stuckMinutes}min — force resetting to todo`,
            );
            await taskStorage.updateTask(activeTask.id, {
              status: "todo",
              timeTracking: {
                ...activeTask.timeTracking,
                startedAt: undefined,
              },
            });
            // 通知负责人
            const supervisorRaw = (activeTask.metadata?.supervisorId ?? activeTask.creatorId) as
              | string
              | undefined;
            if (supervisorRaw) {
              const normalizedSupervisor = normalizeAgentId(supervisorRaw);
              const supervisorSession = `agent:${normalizedSupervisor}:main`;
              const supervisorNotice = [
                `[TASK AUTO-RESET] Agent ${normalizedId}'s task was stuck for ${stuckMinutes} minutes and has been automatically reset to todo queue.`,
                ``,
                `Agent: ${normalizedId}`,
                `Task ID: ${activeTask.id}`,
                `Title: ${activeTask.title}`,
                `Priority: ${activeTask.priority}`,
                activeTask.type ? `Type: ${activeTask.type}` : null,
                ``,
                `The task will be automatically retried in the next task scheduling cycle.`,
                `If this task keeps failing, you may want to cancel it or investigate the cause.`,
              ]
                .filter(Boolean)
                .join("\n");
              enqueueSystemEvent(supervisorNotice, {
                sessionKey: supervisorSession,
                contextKey: `cron:task-autoreset:${activeTask.id}`,
              });
              requestHeartbeatNow({
                reason: `task-autoreset:${activeTask.id}`,
                sessionKey: supervisorSession,
                agentId: normalizedSupervisor,
                coalesceMs: 10000,
              });
            }
            stats.wokenAgents++;
            // 重置后不再走 todo 派发，等下轮扫描再分配
            continue;
          }

          // 任务卡住 12-60 分钟：先尝试重置回 todo 再立即重新派发
          // 这样避免重唤醒时模型再次超时导致死循环
          console.log(
            `[Task Wake] Agent ${normalizedId} task ${activeTask.id} stuck for ${stuckMinutes}min — resetting to todo and re-dispatching`,
          );
          await taskStorage.updateTask(activeTask.id, {
            status: "todo",
            timeTracking: {
              ...activeTask.timeTracking,
              startedAt: undefined,
            },
          });

          // 重置后立即重新派发（走情况 B 逻辑：立即唤醒 todo 任务）
          const projectGroupKey = activeTask.projectId
            ? projectGroupCache.get(activeTask.projectId)
            : undefined;
          const taskLines = [
            `1. [TODO] ${activeTask.title}`,
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
            return [
              `[TASK RETRY] Your previous task attempt timed out after ${stuckMinutes} minutes. Retrying now:`,
              ``,
              taskLines,
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
              `IMPORTANT: Execute this task now. If you cannot complete it, update its status to "blocked" and explain why. Do NOT let it time out again.`,
            ]
              .filter(Boolean)
              .join("\n");
          })();

          enqueueSystemEvent(wakeMessage, {
            sessionKey,
            contextKey: `cron:task-wake:${normalizedId}`,
          });
          requestHeartbeatNow({
            reason: `task-retry:${activeTask.id}`,
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

          // 同时通知负责人
          const supervisorRaw = (activeTask.metadata?.supervisorId ?? activeTask.creatorId) as
            | string
            | undefined;
          if (supervisorRaw) {
            const normalizedSupervisor = normalizeAgentId(supervisorRaw);
            const supervisorSession = `agent:${normalizedSupervisor}:main`;
            const supervisorNotice = [
              `[TASK TIMEOUT ALERT] Agent ${normalizedId}'s task timed out after ${stuckMinutes} minutes and has been auto-retried.`,
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
              `The task has been reset to todo and the agent has been re-woken. If this keeps happening, you can use agent_task_manage to:`,
              `- cancel: Cancel the task (if deemed unresolvable)`,
              `- reset:  Reset to todo queue again (already done automatically)`,
            ]
              .filter(Boolean)
              .join("\n");
            enqueueSystemEvent(supervisorNotice, {
              sessionKey: supervisorSession,
              contextKey: `cron:task-timeout-alert:${activeTask.id}`,
            });
            requestHeartbeatNow({
              reason: `task-timeout:${activeTask.id}`,
              sessionKey: supervisorSession,
              agentId: normalizedSupervisor,
              coalesceMs: 10000,
            });
          }
          stats.wokenAgents++;
        }
        // 正常执行中，不打扰
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
                reason: `task-overdue:${t.id}`,
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
        const sortedTodos = [...todoTasks].toSorted((a, b) => {
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
        const nextTask = sortedTodos[0];
        const queueRemaining = sortedTodos.length - 1;

        stats.pendingTasks++;
        const sessionKey = `agent:${normalizedId}:main`;
        const projectGroupKey = nextTask.projectId
          ? projectGroupCache.get(nextTask.projectId)
          : undefined;

        const taskLines = [
          `1. [TODO] ${nextTask.title}`,
          `   Task ID: ${nextTask.id}`,
          `   Priority: ${nextTask.priority}`,
          nextTask.projectId ? `   Project: ${nextTask.projectId}` : null,
          nextTask.teamId ? `   Team: ${nextTask.teamId}` : null,
          nextTask.organizationId ? `   Organization: ${nextTask.organizationId}` : null,
          nextTask.type ? `   Type: ${nextTask.type}` : null,
          nextTask.dueDate ? `   Due: ${new Date(nextTask.dueDate).toISOString()}` : null,
          projectGroupKey ? `   Project Group Channel: sessionKey=${projectGroupKey}` : null,
          nextTask.description ? `   Description: ${nextTask.description.slice(0, 200)}` : null,
        ]
          .filter(Boolean)
          .join("\n");

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
          return [
            `[TASK WAKE] You have 1 task to execute now${queueRemaining > 0 ? ` (${queueRemaining} more waiting in queue)` : ""}:`,
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
            ``,
            `Memory rules: Write personal insights/decisions to Your Personal Memory only. Write project-wide knowledge to Project Shared Memory. NEVER write to another agent's personal memory file.`,
            ``,
            `IMPORTANT: Set this task to "in-progress" and execute it NOW. Complete it fully before starting the next queued task. After completion, call task_report_to_supervisor to report.`,
          ]
            .filter(Boolean)
            .join("\n");
        })();

        enqueueSystemEvent(wakeMessage, {
          sessionKey,
          contextKey: `cron:task-wake:${normalizedId}`,
        });
        requestHeartbeatNow({
          reason: `next-task:${nextTask.id}`,
          sessionKey,
          agentId: normalizedId,
          coalesceMs: 5000,
        });
        stats.wokenAgents++;
      }
    }

    if (stats.wokenAgents > 0) {
      console.log(
        `[Task Wake] Scan: ${stats.wokenAgents}/${stats.scannedAgents} agents woken, ${stats.pendingTasks} tasks, ${stats.skippedTasks} skipped`,
      );
    }

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
