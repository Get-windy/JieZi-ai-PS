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
 */

import { loadConfig } from "../config/config.js";
import { listAgentIds, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import * as taskStorage from "../tasks/storage.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { normalizeAgentId } from "../routing/session-key.js";
import path from "node:path";
import { getQueueSize } from "../process/command-queue.js";
import { CommandLane } from "../process/lanes.js";

// ============================================================================
// 配置
// ============================================================================

const SCAN_INTERVAL_MS = 2 * 60 * 1000; // 每 2 分钟检查一次
let scanInterval: NodeJS.Timeout | null = null;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从 Agent workspace 路径提取项目 ID
 * 
 * 示例:
 * - `/workspace/project-A` → `project-A`
 * - `/workspace/projects/ops` → `ops`
 * - `/tmp/test-main` → `main`
 */
function extractProjectIdFromWorkspace(workspacePath: string): string | null {
  if (!workspacePath) {
    return null;
  }
  
  const normalizedPath = path.resolve(workspacePath);
  const parts = normalizedPath.split(path.sep).filter(Boolean);
  
  // 尝试从路径中提取有意义的项目名称
  // 规则：取最后一级或倒数第二级目录名作为项目 ID
  if (parts.length === 0) {
    return null;
  }
  
  const lastName = parts[parts.length - 1];
  
  // 检查是否是工作组模式 (根目录包含 "workspace" 或 "openclaw")
  // 例如:H:\OpenClaw_Workspace\workspace-product-analyst
  // 这种情况下，整个 OpenClaw_Workspace 是一个工作组，Agent 可以处理所有项目
  const rootDir = parts.length >= 2 ? parts[parts.length - 2] : '';
  const isWorkspaceMode = rootDir.toLowerCase().includes('workspace') || 
                          rootDir.toLowerCase().includes('openclaw');
  
  if (isWorkspaceMode) {
    // 工作组模式:Agent 没有项目限制，可以处理任何项目的任务
    console.log(`[Task Wake] 📋 Agent in workspace mode (root: ${rootDir}) - can handle all projects`);
    return null;
  }
  
  // 单项目模式：使用原来的逻辑
  const skipKeywords = ['workspace', 'projects', 'openclaw', 'tmp'];
  if (skipKeywords.some(kw => lastName.toLowerCase().includes(kw))) {
    // 向上级目录
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
  }
  
  // 否则使用最后一级
  return lastName || null;
}

// ============================================================================
// 核心逻辑
// ============================================================================

/**
 * 扫描所有 Agent 的待办任务并唤醒有任务的 Agent
 * 
 * 核心原则:
 * 1. 工作任务必须与项目挂钩 (projectId/teamId/organizationId)
 * 2. 个人任务不需要项目上下文 (仅 assigneeId)
 * 3. 严禁跨项目执行任务 (A 项目的任务不能在 B 项目执行)
 */
export async function scanAndWakeAgentsWithPendingTasks(): Promise<{
  scannedAgents: number;
  wokenAgents: number;
  pendingTasks: number;
  skippedTasks: number; // 跳过的项目不匹配任务数
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
      console.log("[Task Wake] No agents configured");
      return stats;
    }

    console.log(`[Task Wake] Scanning ${agentIds.length} agents for pending tasks...`);
    stats.scannedAgents = agentIds.length;

    for (const agentId of agentIds) {
      const normalizedId = normalizeAgentId(agentId);
      
      // 查询此 Agent 的所有未完成任务
      const allPendingTasks = await taskStorage.listTasks({
        assigneeId: normalizedId,
        status: ["todo", "in-progress", "blocked"],
      });

      if (allPendingTasks.length === 0) {
        continue; // 没有待办任务，跳过
      }

      // === 关键：区分工作任务和个人任务 ===
      // 工作任务：必须有 projectId/teamId/organizationId 之一
      // 个人任务：没有任何项目上下文，仅分配给个人
      const workTasks = allPendingTasks.filter(
        (task) => task.projectId || task.teamId || task.organizationId,
      );
      const personalTasks = allPendingTasks.filter(
        (task) => !task.projectId && !task.teamId && !task.organizationId,
      );

      // === 项目上下文隔离检查 ===
      // 获取 Agent 当前工作空间对应的项目 ID
      const agentWorkspaceDir = resolveAgentWorkspaceDir(cfg, normalizedId);
      const agentProjectId = extractProjectIdFromWorkspace(agentWorkspaceDir);

      // 过滤出 Agent 有权限处理的任务
      const validTasks = workTasks.filter((task) => {
        // 如果任务有 projectId，需要检查项目匹配
        if (task.projectId) {
          // 如果 Agent 没有项目绑定 (workspace 模式),可以处理任何项目
          if (!agentProjectId) {
            console.log(
              `[Task Wake] ✓ Task ${task.id}: Agent ${normalizedId} in workspace mode - can handle project ${task.projectId}`,
            );
            return true; // 工作组模式，允许处理
          }
          if (task.projectId !== agentProjectId) {
            // 项目不匹配，跳过
            console.log(
              `[Task Wake] ⚠️ Skip task ${task.id}: Project mismatch (${task.projectId} vs ${agentProjectId})`,
            );
            stats.skippedTasks++;
            return false;
          }
        }
        // 如果没有 projectId，但有 teamId/organizationId，也认为是有效的工作任务
        return true;
      });

      // 合并有效的工作任务和个人任务
      const tasksToProcess = [...validTasks, ...personalTasks];

      if (tasksToProcess.length === 0) {
        console.log(
          `[Task Wake] Agent ${normalizedId} has ${allPendingTasks.length} pending tasks but all are from other projects`,
        );
        continue;
      }

      stats.pendingTasks += tasksToProcess.length;

      // 有未完成任务，唤醒 Agent
      const sessionKey = `agent:${normalizedId}:main`;
      
      // === 关键改进：检测是否处于"假工作、真空闲"状态 ===
      // 如果 Agent 有 pending 任务但 main lane 队列为空（无实际活动），说明它在假装工作或真空闲
      const mainLaneQueueSize = getQueueSize(CommandLane.Main);
      const hasActiveWork = mainLaneQueueSize > 0;
      const isIdleWithPendingTasks = !hasActiveWork && tasksToProcess.length > 0;
      
      if (isIdleWithPendingTasks) {
        console.log(
          `[Task Wake] ⚠️ Agent ${normalizedId} detected IDLE with ${tasksToProcess.length} pending tasks but NO active work in queue!`,
        );
      }
      
      // === 关键：为每个任务构建项目上下文 ===
      // 工作组模式下，Agent 根据任务的 projectId 动态切换工作目录
      const hasProjectContext = tasksToProcess.some(t => t.projectId);
      const projectContextNote = hasProjectContext 
        ? `

📁 PROJECT CONTEXT: You will work in different project directories based on each task's projectId. For each task, you should:
  1. Navigate to the project workspace (e.g., H:\\OpenClaw_Workspace\\groups\\{projectId})
  2. Load project shared memory (SHARED_MEMORY.md)
  3. Read project-specific documentation
  4. Work within project code directory` 
        : '';
      
      // 构建唤醒消息 (增强版：包含项目上下文信息)
      const wakeMessage = [
        `[TASK WAKE UP - AUTO TRIGGERED]`,
        `⚠️ URGENT: You have ${tasksToProcess.length} pending task(s) that MUST be addressed IMMEDIATELY.`,
        ``,
        `YOUR PENDING TASKS:`,
        ...tasksToProcess.map((task, index) => {
          const statusEmoji = task.status === "in-progress" ? "🔄" : task.status === "blocked" ? "⚠️" : "⏳";
          const projectContext = task.projectId 
            ? `[Project: ${task.projectId}] ` 
            : task.teamId 
              ? `[Team: ${task.teamId}] ` 
              : task.organizationId 
                ? `[Org: ${task.organizationId}] ` 
                : `[Personal] `;
          return `${index + 1}. ${statusEmoji} ${projectContext}[${task.status.toUpperCase()}] ${task.title}`;
        }),
        ``,
        `⚡ MANDATORY INSTRUCTIONS:`,
        `1. STOP any current idle or low-priority activities RIGHT NOW`,
        `2. Review these tasks IMMEDIATELY - do NOT defer or ignore them`,
        `3. If you're currently idle, START the highest priority task THIS INSTANT`,
        `4. If you're busy with something else, FINISH IT QUICKLY then move to these tasks`,
        `5. For project tasks: Navigate to the correct project workspace FIRST`,
        `6. Load project shared memory (SHARED_MEMORY.md) for context`,
        `7. Work within the project's directory structure (groups/{projectId}/)`,
        `8. Use task_report_to_supervisor to report progress when completed`,
        ``,
        `⛔ CRITICAL: These tasks are ASSIGNED TO YOU and CANNOT be ignored!`,
        `⛔ DO NOT go back to sleep or remain idle - TAKE ACTION NOW!`,
        projectContextNote,
      ].join("\n");

      // 将任务事件放入系统队列
      enqueueSystemEvent(wakeMessage, { 
        sessionKey, 
        contextKey: `task-wake:${Date.now()}` 
      });

      // === 强化唤醒机制：连续触发多次心跳，确保 Agent 真正执行 ===
      // 第一次：立即触发心跳唤醒（强制执行）
      requestHeartbeatNow({
        reason: `pending-tasks:${tasksToProcess.length}`,
        sessionKey,
        agentId: normalizedId,
      });
      
      // 第二次：1 秒后再次触发，防止 Agent 忽略或休眠
      setTimeout(() => {
        const followupMessage = `[URGENT REMINDER] ⚠️ You still have ${tasksToProcess.length} pending task(s). This is a CRITICAL reminder - you MUST start working on them NOW. Do NOT remain idle or go back to sleep!`;
        enqueueSystemEvent(followupMessage, {
          sessionKey,
          contextKey: `task-reminder:${Date.now()}`
        });
        requestHeartbeatNow({
          reason: `task-reminder:urgent`,
          sessionKey,
          agentId: normalizedId,
        });
        console.log(
          `[Task Wake] 🔔 Follow-up reminder sent to Agent ${normalizedId}`,
        );
        
        // === 新增：第三次检查（2 秒后）===
        // 如果仍然没有活动，强制清理可能的卡住任务
        setTimeout(() => {
          const currentQueueSize = getQueueSize(CommandLane.Main);
          if (currentQueueSize === 0 && tasksToProcess.length > 0) {
            console.warn(
              `[Task Wake] 🚨 Agent ${normalizedId} still IDLE after wake + reminders! Forcing stuck task cleanup...`,
            );
            // 尝试强制清理 main lane 的卡住任务
            try {
              // 通过发送特殊指令让 Agent 重置状态
              const forceStartMessage = `[SYSTEM OVERRIDE] ⛔ DETECTED: You have been IDLE for too long despite having ${tasksToProcess.length} pending tasks. FORCING STATE RESET. Clear all queues and START WORKING NOW.`;
              enqueueSystemEvent(forceStartMessage, {
                sessionKey,
                contextKey: `force-start:${Date.now()}`
              });
              requestHeartbeatNow({
                reason: `force-start:idle-timeout`,
                sessionKey,
                agentId: normalizedId,
              });
              console.log(
                `[Task Wake] ✅ Force-start command sent to Agent ${normalizedId}`,
              );
            } catch (error) {
              console.error(
                `[Task Wake] ❌ Failed to force-start Agent ${normalizedId}:`,
                error instanceof Error ? error.message : error,
              );
            }
          }
        }, 2000); // 2 秒后检查并可能强制执行
        
      }, 1000); // 1 秒后发送跟进提醒

      stats.wokenAgents++;
      
      console.log(
        `[Task Wake] ✓ Agent ${normalizedId} woken up (${validTasks.length} work tasks + ${personalTasks.length} personal tasks)`,
      );
    }

    if (stats.wokenAgents > 0) {
      console.log(
        `[Task Wake] Scan complete: ${stats.wokenAgents}/${stats.scannedAgents} agents woken up, ${stats.pendingTasks} total pending tasks, ${stats.skippedTasks} skipped (project mismatch)`,
      );
    } else {
      console.log(`[Task Wake] Scan complete: All agents are caught up (no pending tasks)`);
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
 * 在项目启动时自动运行，定期扫描并唤醒有任务的 Agent
 * 
 * 示例：
 * ```typescript
 * import { startAgentTaskWakeScheduler } from './cron/agent-task-wake-scheduler.js';
 * 
 * // 在系统启动时调用
 * startAgentTaskWakeScheduler();
 * ```
 */
export function startAgentTaskWakeScheduler(options?: {
  intervalMinutes?: number;
}): void {
  const intervalMinutes = options?.intervalMinutes ?? 2; // 默认每 2 分钟一次！

  if (scanInterval) {
    clearInterval(scanInterval);
  }

  console.log(`[Task Wake] Starting scheduler (interval: ${intervalMinutes} minutes)...`);

  // 立即运行一次
  void scanAndWakeAgentsWithPendingTasks();

  // 定时运行（Agent 全年无休！）
  scanInterval = setInterval(
    () => {
      void scanAndWakeAgentsWithPendingTasks();
    },
    intervalMinutes * 60 * 1000,
  );

  console.log(`[Task Wake] ✓ Scheduler started (will scan every ${intervalMinutes} minutes)`);
}

/**
 * 停止调度器
 */
export function stopAgentTaskWakeScheduler(): void {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log("[Task Wake] Scheduler stopped");
  }
}
