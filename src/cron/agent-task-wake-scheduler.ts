/**
 * Agent 任务唤醒调度器
 * 
 * 每 2 分钟扫描一次所有 Agent 的待办任务
 * 检测到 Agent 有未完成任务时，自动唤醒 Agent 开始工作
 * 
 * 核心原则：
 * 1. 有任务的 Agent 不应该睡着
 * 2. 任务分配后应该立即唤醒 Agent
 * 3. 直到所有任务完成，Agent 才可以休息
 * 
 * 性能原则：
 * 1. 启动时延迟 30 秒再进行首次扫描，等待系统完全初始化
 * 2. 每个 Agent 只发送一次唤醒事件，不做多轮轰炸
 * 3. 减少密集日志输出
 */

import { loadConfig } from "../../upstream/src/config/config.js";
import { listAgentIds, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import * as taskStorage from "../tasks/storage.js";
import { enqueueSystemEvent } from "../../upstream/src/infra/system-events.js";
import { requestHeartbeatNow } from "../../upstream/src/infra/heartbeat-wake.js";
import { normalizeAgentId } from "../routing/session-key.js";
import path from "node:path";

// ============================================================================
// 配置
// ============================================================================

const STARTUP_DELAY_MS = 30 * 1000; // 30 秒
let scanInterval: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;

// ============================================================================
// 辅助函数
// ============================================================================

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
  const rootDir = parts.length >= 2 ? parts[parts.length - 2] : '';
  const isWorkspaceMode = rootDir.toLowerCase().includes('workspace') || 
                          rootDir.toLowerCase().includes('openclaw');
  
  if (isWorkspaceMode) {
    return null; // 工作组模式，无项目限制
  }
  
  const skipKeywords = ['workspace', 'projects', 'openclaw', 'tmp'];
  if (skipKeywords.some(kw => lastName.toLowerCase().includes(kw))) {
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

    for (const agentId of agentIds) {
      const normalizedId = normalizeAgentId(agentId);
      
      const allPendingTasks = await taskStorage.listTasks({
        assigneeId: normalizedId,
        status: ["todo", "in-progress", "blocked"],
      });

      if (allPendingTasks.length === 0) {
        continue;
      }

      const workTasks = allPendingTasks.filter(
        (task) => task.projectId || task.teamId || task.organizationId,
      );
      const personalTasks = allPendingTasks.filter(
        (task) => !task.projectId && !task.teamId && !task.organizationId,
      );

      const agentWorkspaceDir = resolveAgentWorkspaceDir(cfg, normalizedId);
      const agentProjectId = extractProjectIdFromWorkspace(agentWorkspaceDir);

      const validTasks = workTasks.filter((task) => {
        if (task.projectId) {
          if (!agentProjectId) {
            return true; // 工作组模式，允许处理所有项目
          }
          if (task.projectId !== agentProjectId) {
            stats.skippedTasks++;
            return false;
          }
        }
        return true;
      });

      const tasksToProcess = [...validTasks, ...personalTasks];

      if (tasksToProcess.length === 0) {
        continue;
      }

      stats.pendingTasks += tasksToProcess.length;

      const sessionKey = `agent:${normalizedId}:main`;

      // 构建唤醒消息（只发送一次，不轰炸）
      const taskSummary = tasksToProcess
        .slice(0, 5) // 最多展示 5 条，避免消息过长
        .map((task, i) => {
          const statusEmoji = task.status === "in-progress" ? "🔄" : task.status === "blocked" ? "⚠️" : "⏳";
          const ctx = task.projectId ? `[${task.projectId}] ` : task.teamId ? `[${task.teamId}] ` : "";
          return `${i + 1}. ${statusEmoji} ${ctx}${task.title}`;
        })
        .join("\n");
      const moreCount = tasksToProcess.length > 5 ? `\n...and ${tasksToProcess.length - 5} more` : "";

      const wakeMessage = [
        `[TASK WAKE] You have ${tasksToProcess.length} pending task(s). Please start working on them:`,
        taskSummary + moreCount,
      ].join("\n");

      enqueueSystemEvent(wakeMessage, {
        sessionKey,
        contextKey: `task-wake:${normalizedId}`,
      });

      requestHeartbeatNow({
        reason: `pending-tasks:${tasksToProcess.length}`,
        sessionKey,
        agentId: normalizedId,
        coalesceMs: 5000, // 5 秒合并，避免多 agent 同时触发
      });

      stats.wokenAgents++;
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
export function startAgentTaskWakeScheduler(options?: {
  intervalMinutes?: number;
}): void {
  const intervalMinutes = options?.intervalMinutes ?? 2;

  if (scanInterval) {
    clearInterval(scanInterval);
  }
  if (startupTimer) {
    clearTimeout(startupTimer);
  }

  console.log(`[Task Wake] Scheduler starting (first scan in ${STARTUP_DELAY_MS / 1000}s, then every ${intervalMinutes}min)`);

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

