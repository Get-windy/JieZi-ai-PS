/**
 * Agent 任务唤醒调度器
 *
 * 每 2 分钟扫描一次所有 Agent 的待办任务
 *
 * 核心原则：
 * 1. 每个 Agent 同时只能执行 1 条任务（串行执行）
 * 2. 发现多条 in-progress → 保留优先级最高的 1 条，其余重置回 todo 排队
 * 3. 无 in-progress 且有 todo → 取优先级最高的 1 条唤醒执行
 * 4. 有 in-progress（仅 1 条）且超时 → 重新唤醒（可能卡住了）
 * 5. todo 任务只是排队，不检测超时
 */

import path from "node:path";
import { loadConfig } from "../../upstream/src/config/config.js";
import { requestHeartbeatNow } from "../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../upstream/src/infra/system-events.js";
import { listAgentIds, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { groupManager } from "../sessions/group-manager.js";
import * as taskStorage from "../tasks/storage.js";

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

function taskSortKey(t: { priority: string; weight?: number; createdAt: number }): number {
  // 得分越高越优先：优先级权重 * 1e13 + 任务权重 * 1e6 - 创建时间（越早越高）
  const priorityScore = (PRIORITY_WEIGHT[t.priority] ?? 2) * 1e13;
  const weightScore = (t.weight ?? 0) * 1e6;
  return priorityScore + weightScore - t.createdAt;
}

const STARTUP_DELAY_MS = 30 * 1000; // 30 秒
let scanInterval: NodeJS.Timeout | null = null;

let startupTimer: NodeJS.Timeout | null = null;

/**
 * 从 Agent workspace 路径提取项目 ID
 */
function extractProjectIdFromWorkspace(workspacePath: string): string | null {
  if (!workspacePath) {
    return null;
  }

  const normalizedPath = path.resolve(workspacePath);
  const parts = normalizedPath.split(path.sep).filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const lastName = parts[parts.length - 1];
  const rootDir = parts.length >= 2 ? parts[parts.length - 2] : "";
  const isWorkspaceMode =
    rootDir.toLowerCase().includes("workspace") || rootDir.toLowerCase().includes("openclaw");

  if (isWorkspaceMode) {
    return null; // 工作组模式，无项目限制
  }

  const skipKeywords = ["workspace", "projects", "openclaw", "tmp"];
  if (skipKeywords.some((kw) => lastName.toLowerCase().includes(kw))) {
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
  }

  return lastName || null;
}

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
      const agentProjectId = extractProjectIdFromWorkspace(agentWorkspaceDir);
      const agentMemoryPath = path.join(agentWorkspaceDir, "MEMORY.md");

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
        const STALE_IN_PROGRESS_MS = 30 * 60 * 1000; // 30 分钟
        const isStale =
          executionStartedAt != null && now - executionStartedAt > STALE_IN_PROGRESS_MS;

        if (isStale) {
          stats.pendingTasks++;
          const sessionKey = `agent:${normalizedId}:main`;
          const stuckMinutes = Math.floor((now - executionStartedAt) / 60000);
          const wakeMessage = [
            `[TASK STUCK] Your current task has been in-progress for ${stuckMinutes} minutes without completion.`,
            ``,
            `Task ID: ${activeTask.id}`,
            `Title: ${activeTask.title}`,
            `Priority: ${activeTask.priority}`,
            activeTask.type ? `Type: ${activeTask.type}` : null,
            activeTask.description ? `Description: ${activeTask.description.slice(0, 200)}` : null,
            ``,
            `Working Context:`,
            `- Working Directory: ${agentWorkspaceDir}`,
            `- Memory File: ${agentMemoryPath}`,
            ``,
            `Please take one of the following actions:`,
            `1. If already completed: call task_report_to_supervisor immediately`,
            `2. If blocked: update status to "blocked" and explain why`,
            `3. If still working: continue and report when done`,
            ``,
            `NOTE: Your supervisor has been notified and may choose to extend your time, reset, or cancel this task.`,
          ]
            .filter(Boolean)
            .join("\n");

          enqueueSystemEvent(wakeMessage, {
            sessionKey,
            contextKey: `cron:task-wake:${normalizedId}`,
          });
          requestHeartbeatNow({
            reason: `task-stuck:${activeTask.id}`,
            sessionKey,
            agentId: normalizedId,
            coalesceMs: 5000,
          });

          // 同时通知负责人，让其可决策延时/重置/取消
          const supervisorRaw = (activeTask.metadata?.supervisorId ?? activeTask.creatorId) as
            | string
            | undefined;
          if (supervisorRaw) {
            const normalizedSupervisor = normalizeAgentId(supervisorRaw);
            const supervisorSession = `agent:${normalizedSupervisor}:main`;
            const supervisorNotice = [
              `[TASK TIMEOUT ALERT] Agent ${normalizedId}'s task has been stuck for ${stuckMinutes} minutes.`,
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
              `You can intervene using agent_task_manage tool:`,
              `- extend: Give the agent more time (if task is complex)`,
              `- reset:  Reset to todo queue (retry later)`,
              `- cancel: Cancel the task (if deemed unresolvable)`,
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
        // 过滤出属于该 agent 项目的任务
        const validTodos = todoTasks.filter((task) => {
          if (task.projectId && agentProjectId && task.projectId !== agentProjectId) {
            stats.skippedTasks++;
            return false;
          }
          return true;
        });

        if (validTodos.length === 0) {
          continue;
        }

        // 按优先级排序，只唤醒最高优先级的 1 条
        const sortedTodos = [...validTodos].toSorted((a, b) => taskSortKey(b) - taskSortKey(a));
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

        const wakeMessage = [
          `[TASK WAKE] You have 1 task to execute now${queueRemaining > 0 ? ` (${queueRemaining} more waiting in queue)` : ""}:`,
          ``,
          taskLines,
          ``,
          `Working Context:`,
          `- Working Directory (code lives here): ${agentWorkspaceDir}`,
          `- Memory File (read/update project knowledge): ${agentMemoryPath}`,
          ``,
          `IMPORTANT: Set this task to "in-progress" and execute it NOW. Complete it fully before starting the next queued task. After completion, call task_report_to_supervisor to report.`,
        ].join("\n");

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
