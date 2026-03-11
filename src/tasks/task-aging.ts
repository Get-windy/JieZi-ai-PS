/**
 * 任务老化与自动升级机制
 *
 * 防止待办池中的任务长期沉淀为"死任务"
 * 基于业界最佳实践（Jira Automation、Scrum Backlog Grooming）
 */

import { chatHandlers } from "../gateway/server-methods/chat.js";
import type { GatewayRequestHandlerOptions } from "../gateway/server-methods/types.js";
import * as storage from "./storage.js";
import type { Task, TaskPriority } from "./types.js";

// ============================================================================
// 配置参数
// ============================================================================

/**
 * 老化阈值配置（毫秒）
 */
export const AGING_THRESHOLDS = {
  /** 未分配任务超过 7 天触发提醒 */
  UNASSIGNED_REMIND: 7 * 24 * 60 * 60 * 1000,

  /** 未分配任务超过 14 天自动升级给主管 */
  UNASSIGNED_ESCALATE: 14 * 24 * 60 * 60 * 1000,

  /** 未分配任务超过 30 天标记为低优先级或归档 */
  UNASSIGNED_ARCHIVE: 30 * 24 * 60 * 60 * 1000,

  /** 进行中的任务超过 3 天无进展提醒 */
  IN_PROGRESS_STALE: 3 * 24 * 60 * 60 * 1000,

  /** 阻塞状态超过 2 天无响应升级 */
  BLOCKED_ESCALATE: 2 * 24 * 60 * 60 * 1000,
} as const;

/**
 * 任务老化级别
 */
export type AgingLevel = "fresh" | "aging" | "stale" | "critical";

// ============================================================================
// 老化检测工具函数
// ============================================================================

/**
 * 计算任务年龄（天数）
 */
export function getTaskAgeInDays(task: Task): number {
  return Math.floor((Date.now() - task.createdAt) / (1000 * 60 * 60 * 24));
}

/**
 * 计算任务无活动天数
 */
export function getDaysSinceLastActivity(task: Task): number {
  const lastActivity = task.timeTracking.lastActivityAt ?? task.updatedAt ?? task.createdAt;
  return Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60 * 24));
}

/**
 * 判断任务老化级别
 */
export function getAgingLevel(task: Task): AgingLevel {
  const ageInDays = getTaskAgeInDays(task);
  const daysInactive = getDaysSinceLastActivity(task);

  // 已完成或取消的任务不参与老化
  if (task.status === "done" || task.status === "cancelled") {
    return "fresh";
  }

  // 未分配的任务
  if (!task.assignees || task.assignees.length === 0) {
    if (ageInDays >= 30) {
      return "critical";
    }
    if (ageInDays >= 14) {
      return "stale";
    }
    if (ageInDays >= 7) {
      return "aging";
    }
    return "fresh";
  }

  // 已分配但长期无活动的任务
  if (daysInactive >= 7) {
    return "critical";
  }
  if (daysInactive >= 3) {
    return "stale";
  }
  if (daysInactive >= 1) {
    return "aging";
  }
  return "fresh";
}

/**
 * 检查任务是否应该触发自动操作
 */
export function shouldTriggerAutoAction(task: Task, actionType: string): boolean {
  const agingLevel = getAgingLevel(task);
  const now = Date.now();

  switch (actionType) {
    case "remind":
      // 提醒：aging 级别以上且超过阈值
      return agingLevel === "aging" && now - task.createdAt >= AGING_THRESHOLDS.UNASSIGNED_REMIND;

    case "escalate":
      // 升级：stale 级别以上且超过阈值
      return (
        (agingLevel === "stale" || agingLevel === "critical") &&
        now - task.createdAt >= AGING_THRESHOLDS.UNASSIGNED_ESCALATE
      );

    case "archive":
      // 归档：critical 级别且超过阈值
      return (
        agingLevel === "critical" && now - task.createdAt >= AGING_THRESHOLDS.UNASSIGNED_ARCHIVE
      );

    case "blocked-escalate":
      // 阻塞升级
      return (
        task.status === "blocked" &&
        now - (task.timeTracking.lastActivityAt ?? task.createdAt) >=
          AGING_THRESHOLDS.BLOCKED_ESCALATE
      );

    default:
      return false;
  }
}

// ============================================================================
// 自动化操作
// ============================================================================

/**
 * 发送老化任务提醒
 */
export async function sendAgingReminder(task: Task, supervisorId: string): Promise<void> {
  try {
    const ageInDays = getTaskAgeInDays(task);
    const daysInactive = getDaysSinceLastActivity(task);

    const reminderMessage = [
      `⚠️ 任务老化提醒`,
      ``,
      `**任务**: ${task.title}`,
      `**ID**: ${task.id}`,
      `**年龄**: ${ageInDays} 天`,
      `**最后活动**: ${daysInactive} 天前`,
      `**当前状态**: ${task.status}`,
      `**执行者**: ${task.assignees?.length ? task.assignees.map((a) => a.id).join(", ") : "未分配"}`,
      ``,
      `该任务已经长时间没有进展，请及时处理：`,
      `- 如果是重要任务，请立即分配给合适的执行者`,
      `- 如果不再需要，请标记为 cancelled`,
      `- 如果需要更多信息，请先更新任务描述`,
    ]
      .filter(Boolean)
      .join("\n");

    // 通过 chat.send 发送提醒
    const sessionKey = `agent:${supervisorId}:main`;
    await new Promise<void>((resolve) => {
      (chatHandlers["chat.send"] as unknown as (opts: GatewayRequestHandlerOptions) => void)({
        params: {
          sessionKey,
          message: reminderMessage,
          idempotencyKey: `aging-reminder-${task.id}-${Date.now()}`,
        },
        respond: () => resolve(),
      } as unknown as GatewayRequestHandlerOptions);
    });

    console.log(`[Task Aging] Sent reminder for task ${task.id} to ${supervisorId}`);
  } catch (error) {
    console.error(`[Task Aging] Failed to send reminder for task ${task.id}:`, error);
  }
}

/**
 * 自动升级任务给主管
 */
export async function escalateTask(task: Task, supervisorId: string): Promise<void> {
  try {
    const ageInDays = getTaskAgeInDays(task);
    const daysInactive = getDaysSinceLastActivity(task);

    const escalationMessage = [
      `🔴 任务升级通知`,
      ``,
      `**紧急**: 有任务长期未得到处理，需要立即关注！`,
      ``,
      `**任务**: ${task.title}`,
      `**ID**: ${task.id}`,
      `**年龄**: ${ageInDays} 天（已超过 14 天）`,
      `**最后活动**: ${daysInactive} 天前`,
      `**创建者**: ${task.creatorId}`,
      `**当前执行者**: ${task.assignees?.length ? task.assignees.map((a) => a.id).join(", ") : "无人认领"}`,
      ``,
      `**建议行动**:`,
      `1. 立即审查该任务的必要性`,
      `2. 分配给合适的团队成员`,
      `3. 或者标记为不再需要`,
      ``,
      `请在 24 小时内处理此任务，否则将自动降低优先级或归档。`,
    ]
      .filter(Boolean)
      .join("\n");

    const sessionKey = `agent:${supervisorId}:main`;
    await new Promise<void>((resolve) => {
      (chatHandlers["chat.send"] as unknown as (opts: GatewayRequestHandlerOptions) => void)({
        params: {
          sessionKey,
          message: escalationMessage,
          idempotencyKey: `aging-escalation-${task.id}-${Date.now()}`,
        },
        respond: () => resolve(),
      } as unknown as GatewayRequestHandlerOptions);
    });

    console.log(`[Task Aging] Escalated task ${task.id} to ${supervisorId}`);
  } catch (error) {
    console.error(`[Task Aging] Failed to escalate task ${task.id}:`, error);
  }
}

/**
 * 自动归档过期任务
 */
export async function archiveStaleTask(task: Task): Promise<void> {
  try {
    // 降低优先级并标记为待归档
    const newPriority: TaskPriority = "low";

    await storage.updateTask(task.id, {
      priority: newPriority,
      metadata: {
        ...task.metadata,
        autoArchived: true,
        archivedReason: `长期未处理（${getTaskAgeInDays(task)} 天）`,
        archivedAt: Date.now(),
      },
    });

    console.log(`[Task Aging] Auto-archived task ${task.id} with low priority`);
  } catch (error) {
    console.error(`[Task Aging] Failed to archive task ${task.id}:`, error);
  }
}

/**
 * 自动重新分配阻塞任务
 */
export async function reassignBlockedTask(task: Task, _projectId?: string): Promise<void> {
  try {
    if (!task.assignees || task.assignees.length === 0) {
      return; // 未分配的任务不处理
    }

    // 尝试找到其他可用的执行者
    // 这里可以集成能力发现系统
    console.log(`[Task Aging] Task ${task.id} is blocked for too long, consider reassignment`);

    // TODO: 调用 agent_discover 查找有相关能力的 Agent
    // TODO: 自动重新分配或添加协作者
  } catch (error) {
    console.error(`[Task Aging] Failed to reassign blocked task ${task.id}:`, error);
  }
}

// ============================================================================
// 定时扫描任务
// ============================================================================

/**
 * 扫描所有项目中的老化任务并执行自动操作
 *
 * 建议配置为每小时运行一次，或每天运行一次
 */
export async function scanAndProcessAgingTasks(options?: {
  projectId?: string;
  enableReminders?: boolean;
  enableEscalation?: boolean;
  enableArchive?: boolean;
}): Promise<{
  reminded: number;
  escalated: number;
  archived: number;
}> {
  const {
    projectId,
    enableReminders = true,
    enableEscalation = true,
    enableArchive = false, // 默认不启用自动归档，需手动确认
  } = options ?? {};

  const stats = {
    reminded: 0,
    escalated: 0,
    archived: 0,
  };

  try {
    // 获取所有未完成的任务
    const allTasks = await storage.listTasks({
      projectId,
      status: ["todo", "in-progress", "blocked"],
    });

    console.log(`[Task Aging] Scanning ${allTasks.length} tasks for aging detection...`);

    for (const task of allTasks) {
      try {
        // 检查是否需要提醒
        if (enableReminders && shouldTriggerAutoAction(task, "remind")) {
          const supervisorId = (task.metadata?.supervisorId as string) ?? task.creatorId;
          if (supervisorId) {
            await sendAgingReminder(task, supervisorId);
            stats.reminded++;

            // 记录已提醒，避免重复
            await storage.updateTask(task.id, {
              metadata: {
                ...task.metadata,
                lastRemindedAt: Date.now(),
              },
            });
          }
        }

        // 检查是否需要升级
        if (enableEscalation && shouldTriggerAutoAction(task, "escalate")) {
          const supervisorId = (task.metadata?.supervisorId as string) ?? task.creatorId;
          if (supervisorId) {
            await escalateTask(task, supervisorId);
            stats.escalated++;

            // 记录已升级
            await storage.updateTask(task.id, {
              metadata: {
                ...task.metadata,
                lastEscalatedAt: Date.now(),
              },
            });
          }
        }

        // 检查是否需要归档
        if (enableArchive && shouldTriggerAutoAction(task, "archive")) {
          await archiveStaleTask(task);
          stats.archived++;
        }

        // 检查阻塞任务
        if (shouldTriggerAutoAction(task, "blocked-escalate")) {
          await reassignBlockedTask(task, projectId);
        }
      } catch (taskError) {
        console.error(`[Task Aging] Error processing task ${task.id}:`, taskError);
      }
    }

    console.log(
      `[Task Aging] Scan completed. Reminded: ${stats.reminded}, Escalated: ${stats.escalated}, Archived: ${stats.archived}`,
    );
  } catch (error) {
    console.error("[Task Aging] Failed to scan tasks:", error);
  }

  return stats;
}

// ============================================================================
// Cron Job 调度器（可选）
// ============================================================================

/**
 * 启动定时任务扫描
 *
 * 使用示例：
 * startAgingTaskScheduler({ intervalHours: 24 }); // 每天运行一次
 */
let agingTaskSchedulerInterval: NodeJS.Timeout | null = null;

export function startAgingTaskScheduler(options?: {
  intervalHours?: number;
  projectId?: string;
  enableReminders?: boolean;
  enableEscalation?: boolean;
  enableArchive?: boolean;
}): void {
  const intervalHours = options?.intervalHours ?? 24; // 默认每天一次

  if (agingTaskSchedulerInterval) {
    clearInterval(agingTaskSchedulerInterval);
  }

  console.log(`[Task Aging] Starting scheduler: running every ${intervalHours} hours`);

  // 立即运行一次
  void scanAndProcessAgingTasks(options);

  // 定时运行
  agingTaskSchedulerInterval = setInterval(
    () => {
      void scanAndProcessAgingTasks(options);
    },
    intervalHours * 60 * 60 * 1000,
  );
}

/**
 * 停止定时任务
 */
export function stopAgingTaskScheduler(): void {
  if (agingTaskSchedulerInterval) {
    clearInterval(agingTaskSchedulerInterval);
    agingTaskSchedulerInterval = null;
    console.log("[Task Aging] Scheduler stopped");
  }
}
