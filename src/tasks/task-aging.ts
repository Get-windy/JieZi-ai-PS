/**
 * 任务老化与自动升级机制
 *
 * 防止待办池中的任务长期沉淀为"死任务"
 * 基于业界最佳实践（Jira Automation、Scrum Backlog Grooming）
 */

import { requestHeartbeatNow } from "../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../upstream/src/infra/system-events.js";
import { injectLeaderSnapshot } from "../agents/leader-context-snapshot.js";
import { t } from "../i18n/index.js";
import { normalizeAgentId } from "../routing/session-key.js";
import * as storage from "./storage.js";
import type { Task } from "./types.js";

/** 优先级权重映射（老化模块内部用）*/
const AGING_PRIORITY_RANK: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

/**
 * 检查任务的前置依赖是否存在未完成项（老化模块内部版）
 * 使用内存映射避免重复 DB 查询
 */
function checkUnmetDepsForAging(task: Task, taskMap: Map<string, Task>): Promise<Task[]> {
  const unmet: Task[] = [];
  const depIds = new Set<string>([...(task.blockedBy ?? []), ...(task.dependencies ?? [])]);
  for (const depId of depIds) {
    const dep = taskMap.get(depId);
    if (dep && dep.status !== "done" && dep.status !== "cancelled") {
      unmet.push(dep);
    }
  }
  return Promise.resolve(unmet);
}

// ============================================================================
// 配置参数
// ============================================================================

/**
 * 老化阈值配置（毫秒）
 *
 * Agent 系统是全年无休的高频工作模式，不是人类 Sprint 节奏！
 * 阈值必须足够激进，确保任务不会在待办池中沉淀超过几小时
 */
export const AGING_THRESHOLDS = {
  /** 未分配任务超过 2 小时触发提醒 */
  UNASSIGNED_REMIND: 2 * 60 * 60 * 1000,

  /** 未分配任务超过 6 小时自动升级给主管 */
  UNASSIGNED_ESCALATE: 6 * 60 * 60 * 1000,

  /** 未分配任务超过 24 小时标记为低优先级或归档 */
  UNASSIGNED_ARCHIVE: 24 * 60 * 60 * 1000,

  /** 进行中的任务超过 1 小时无进展提醒 */
  IN_PROGRESS_STALE: 1 * 60 * 60 * 1000,

  /** 阻塞状态超过 30 分钟无响应升级 */
  BLOCKED_ESCALATE: 30 * 60 * 1000,
} as const;

/**
 * 按优先级差异化老化阈值（毫秒）
 *
 * 高优先级任务要求更激进的跟进策略，低优先级任务给予更宽松的处理时间
 *
 * 提醒阈值（remind）：
 *   - urgent/high：20 分钟无活动即提醒
 *   - medium：60 分钟（默认）
 *   - low：3 小时
 *
 * 升级阈值（escalate）：
 *   - urgent：30 分钟强制升级
 *   - high：2 小时
 *   - medium：6 小时（默认）
 *   - low：12 小时
 *
 * 归档阈值（archive）：
 *   - urgent/high：不自动归档（人工处理）
 *   - medium：48 小时
 *   - low：24 小时（低优先级任务更积极清理）
 *
 * 阻塞升级（blocked-escalate）：
 *   - urgent：10 分钟即升级
 *   - high：20 分钟
 *   - medium：30 分钟（默认）
 *   - low：60 分钟
 */
export const PRIORITY_AGING_THRESHOLDS: Record<
  string,
  { remind: number; escalate: number; archive: number | null; blockedEscalate: number }
> = {
  urgent: {
    remind: 20 * 60 * 1000,
    escalate: 30 * 60 * 1000,
    archive: null, // urgent 不自动归档
    blockedEscalate: 10 * 60 * 1000,
  },
  high: {
    remind: 20 * 60 * 1000,
    escalate: 2 * 60 * 60 * 1000,
    archive: null, // high 不自动归档
    blockedEscalate: 20 * 60 * 1000,
  },
  medium: {
    remind: 60 * 60 * 1000,
    escalate: 6 * 60 * 60 * 1000,
    archive: 48 * 60 * 60 * 1000,
    blockedEscalate: 30 * 60 * 1000,
  },
  low: {
    remind: 3 * 60 * 60 * 1000,
    escalate: 12 * 60 * 60 * 1000,
    archive: 24 * 60 * 60 * 1000, // 低优先级任务积极清理
    blockedEscalate: 60 * 60 * 1000,
  },
};

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
 * 判断任务老化级别（Agent 高频工作模式）
 */
export function getAgingLevel(task: Task): AgingLevel {
  const ageInHours = (Date.now() - task.createdAt) / (1000 * 60 * 60);
  const hoursInactive =
    (Date.now() - (task.timeTracking.lastActivityAt ?? task.updatedAt ?? task.createdAt)) /
    (1000 * 60 * 60);

  // 已完成或取消的任务不参与老化
  if (task.status === "done" || task.status === "cancelled") {
    return "fresh";
  }

  // 未分配的任务（Agent 系统必须快速响应！）
  if (!task.assignees || task.assignees.length === 0) {
    if (ageInHours >= 24) {
      return "critical";
    } // 超过 24 小时无人认领
    if (ageInHours >= 6) {
      return "stale";
    } // 超过 6 小时
    if (ageInHours >= 2) {
      return "aging";
    } // 超过 2 小时
    return "fresh";
  }

  // 已分配但长期无活动的任务（Agent 应该持续工作！）
  if (hoursInactive >= 6) {
    return "critical";
  } // 超过 6 小时无进展
  if (hoursInactive >= 1) {
    return "stale";
  } // 超过 1 小时
  if (hoursInactive >= 0.5) {
    return "aging";
  } // 超过 30 分钟
  return "fresh";
}

/**
 * 检查任务是否应该触发自动操作（按优先级差异化阈值）
 *
 * urgent/high 使用更激进的触发时间，low 使用更宽松的时间
 */
export function shouldTriggerAutoAction(task: Task, actionType: string): boolean {
  const agingLevel = getAgingLevel(task);
  const now = Date.now();
  // 获取优先级对应的差异化阈值，无匹配则退化到全局阈值
  const pThresholds = PRIORITY_AGING_THRESHOLDS[task.priority];
  // 任务无活动时间（相对于最后活动或创建时间）
  const lastActivity = task.timeTracking.lastActivityAt ?? task.updatedAt ?? task.createdAt;
  const inactiveDuration = now - lastActivity;

  switch (actionType) {
    case "remind":
      // 按优先级差异化提醒阈值
      if (pThresholds) {
        return agingLevel !== "fresh" && inactiveDuration >= pThresholds.remind;
      }
      // 兜底：aging 级别以上且超过默认阈值
      return agingLevel === "aging" && now - task.createdAt >= AGING_THRESHOLDS.UNASSIGNED_REMIND;

    case "escalate":
      // 按优先级差异化升级阈值
      if (pThresholds) {
        return (
          (agingLevel === "stale" || agingLevel === "critical") &&
          inactiveDuration >= pThresholds.escalate
        );
      }
      return (
        (agingLevel === "stale" || agingLevel === "critical") &&
        now - task.createdAt >= AGING_THRESHOLDS.UNASSIGNED_ESCALATE
      );

    case "archive":
      // urgent/high 不自动归档（需人工介入）
      if (pThresholds) {
        if (pThresholds.archive === null) {
          return false;
        }
        return agingLevel === "critical" && inactiveDuration >= pThresholds.archive;
      }
      return (
        agingLevel === "critical" && now - task.createdAt >= AGING_THRESHOLDS.UNASSIGNED_ARCHIVE
      );

    case "blocked-escalate":
      // 阻塞升级按优先级差异化
      if (pThresholds) {
        return (
          task.status === "blocked" &&
          now - (task.timeTracking.lastActivityAt ?? task.createdAt) >= pThresholds.blockedEscalate
        );
      }
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
 * 发送老化任务提醒（程序直接注入系统事件，不依赖 agent 执行聊天）
 */
export function sendAgingReminder(task: Task, supervisorId: string): void {
  try {
    const ageInDays = getTaskAgeInDays(task);
    const daysInactive = getDaysSinceLastActivity(task);
    const assigneeList = task.assignees?.length
      ? task.assignees.map((a) => a.id).join(", ")
      : "unassigned";

    const reminderMessage = [
      `[TASK AGING REMINDER] A task has had no activity for ${daysInactive} day(s) and requires attention:`,
      ``,
      `Task ID: ${task.id}`,
      `Title: ${task.title}`,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      `Age: ${ageInDays} day(s)`,
      `Inactive: ${daysInactive} day(s)`,
      `Assigned to: ${assigneeList}`,
      task.projectId ? `Project: ${task.projectId}` : null,
      ``,
      `Recommended actions:`,
      `- If this task is important, assign it to an available agent immediately`,
      `- If it is no longer needed, cancel it`,
      `- If it is blocked, update the blockedBy field and escalate`,
    ]
      .filter(Boolean)
      .join("\n");

    const sessionKey = `agent:${supervisorId}:main`;
    enqueueSystemEvent(reminderMessage, {
      sessionKey,
      contextKey: `cron:task-aging-reminder:${task.id}`,
    });
    requestHeartbeatNow({
      reason: `cron:task-aging-reminder:${task.id}`,
      sessionKey,
      agentId: supervisorId,
      coalesceMs: 15000,
    });

    console.log(t("task.aging.reminder_sent", { taskId: task.id }));
  } catch (error) {
    console.error(t("task.aging.reminder_failed", { taskId: task.id }), error);
  }
}

/**
 * 自动升级任务给主管（程序直接注入系统事件，不依赖 agent 执行聊天）
 */
export function escalateTask(task: Task, supervisorId: string): void {
  try {
    const ageInDays = getTaskAgeInDays(task);
    const daysInactive = getDaysSinceLastActivity(task);
    const assigneeList = task.assignees?.length
      ? task.assignees.map((a) => a.id).join(", ")
      : "none";
    const isHighPriority = task.priority === "urgent" || task.priority === "high";

    const escalationMessage = [
      isHighPriority
        ? `[TASK ESCALATION 🔴] High-priority task has been inactive for ${daysInactive} day(s) — immediate action required:`
        : `[TASK ESCALATION] Task has been inactive for ${daysInactive} day(s) — action required:`,
      ``,
      `Task ID: ${task.id}`,
      `Title: ${task.title}`,
      `Priority: ${task.priority}`,
      `Status: ${task.status}`,
      `Age: ${ageInDays} day(s)`,
      `Last activity: ${daysInactive} day(s) ago`,
      `Creator: ${task.creatorId}`,
      `Assigned to: ${assigneeList}`,
      task.projectId ? `Project: ${task.projectId}` : null,
      ``,
      `Required actions:`,
      `1. Review whether this task is still necessary`,
      `2. Reassign to an available agent if needed`,
      `3. Cancel it if no longer required`,
      ``,
      `Note: If no action is taken within the escalation window, the task will be automatically cancelled.`,
    ]
      .filter(Boolean)
      .join("\n");

    const sessionKey = `agent:${supervisorId}:main`;
    enqueueSystemEvent(escalationMessage, {
      sessionKey,
      contextKey: `cron:task-escalation:${task.id}`,
    });
    requestHeartbeatNow({
      reason: `cron:task-escalation:${task.id}`,
      sessionKey,
      agentId: supervisorId,
      coalesceMs: 10000,
    });

    console.log(t("task.aging.escalated", { taskId: task.id }));
  } catch (error) {
    console.error(t("task.aging.escalate_failed", { taskId: task.id }), error);
  }
}

/**
 * 自动取消长期无人处理的过期任务
 *
 * 直接由程序修改任务状态为 cancelled，无需 agent 介入。
 * urgent/high 任务不自动取消（已在 PRIORITY_AGING_THRESHOLDS 中 archive=null）。
 */
export async function archiveStaleTask(task: Task): Promise<void> {
  try {
    const ageInDays = getTaskAgeInDays(task);
    await storage.updateTask(task.id, {
      status: "cancelled",
      cancelReason: `Auto-cancelled: no activity for ${ageInDays} day(s)`,
      cancelledAt: Date.now(),
      metadata: {
        ...task.metadata,
        autoArchived: true,
        archivedReason: `Auto-cancelled after ${ageInDays} days of inactivity`,
        archivedAt: Date.now(),
      },
    });

    // 通知 supervisor（纯系统事件，不依赖 agent 执行）
    const supervisorRaw =
      (task.metadata?.supervisorId as string | undefined) ?? task.supervisorId ?? task.creatorId;
    if (supervisorRaw && supervisorRaw !== "system") {
      const supervisorId = normalizeAgentId(supervisorRaw);
      const sessionKey = `agent:${supervisorId}:main`;
      const msg = [
        `[TASK AUTO-CANCELLED] A stale task has been automatically cancelled due to prolonged inactivity:`,
        ``,
        `Task ID: ${task.id}`,
        `Title: ${task.title}`,
        `Priority: ${task.priority}`,
        `Age: ${ageInDays} day(s)`,
        task.assignees?.length
          ? `Was assigned to: ${task.assignees.map((a) => a.id).join(", ")}`
          : null,
        task.projectId ? `Project: ${task.projectId}` : null,
        ``,
        `If this task should NOT have been cancelled, use task_reset taskId=${task.id} targetStatus=todo to restore it.`,
      ]
        .filter(Boolean)
        .join("\n");
      enqueueSystemEvent(msg, {
        sessionKey,
        contextKey: `cron:task-auto-cancelled:${task.id}`,
      });
      requestHeartbeatNow({
        reason: `cron:task-auto-cancelled:${task.id}`,
        sessionKey,
        agentId: supervisorId,
        coalesceMs: 15000,
      });
    }

    console.log(t("task.aging.archived", { taskId: task.id }));
  } catch (error) {
    console.error(t("task.aging.archive_failed", { taskId: task.id }), error);
  }
}

/**
 * 自动重新分配阻塞任务
 *
 * 查找空闲 Agent，将阻塞任务通知给 supervisor 并请求协助。
 * 由于 agent_discover 是 RPC 工具（需通过 agent 调用），此处改为：
 * 1. 将任务状态标记为 blocked（已有）并更新 metadata 中的阻塞次数
 * 2. 向 supervisor 发送告警，附带诊断信息和建议行动
 * 3. 若任务优先级为 urgent/high 且阻塞超过阈值，同时向所有 assignee 重发提醒
 */
export async function reassignBlockedTask(task: Task, _projectId?: string): Promise<void> {
  try {
    if (!task.assignees || task.assignees.length === 0) {
      return; // 未分配的任务不处理
    }

    const now = Date.now();
    const blockedSinceMs = now - (task.timeTracking.lastActivityAt ?? task.createdAt);
    const blockedMinutes = Math.floor(blockedSinceMs / 60000);

    console.log(
      `[Task Aging] Reassigning blocked task ${task.id} (${task.priority}) — blocked for ${blockedMinutes}min`,
    );

    // 更新 metadata：记录阻塞次数与最近阻塞时间，方便后续决策
    const blockCount = ((task.metadata?.blockCount as number | undefined) ?? 0) + 1;
    await storage.updateTask(task.id, {
      metadata: {
        ...task.metadata,
        blockCount,
        lastBlockedAt: now,
      },
    });

    // ── 阻塞原因分类 ──────────────────────────────────────────────────────────
    // 依据 task.metadata.blockType 或关键词推断阻塞类型，给主控提供精准建议
    type BlockType = "dependency" | "needs-info" | "technical-block" | "unknown";
    const rawBlockType = (
      typeof task.metadata?.blockType === "string" ? task.metadata.blockType : ""
    ).toLowerCase();
    const rawBlockReason = (
      typeof task.metadata?.blockReason === "string"
        ? task.metadata.blockReason
        : typeof task.description === "string"
          ? task.description
          : ""
    ).toLowerCase();

    let blockType: BlockType;
    if (
      rawBlockType === "dependency" ||
      /\bwait(ing)?\s+(for|on)\b|\bdepend(s|ency)?\b|\bblockedby\b/.test(rawBlockReason)
    ) {
      blockType = "dependency";
    } else if (
      /\bconfirm|clarif|detail|unclear|需求|接口|spec\b/.test(rawBlockReason) ||
      rawBlockType === "needs-info"
    ) {
      blockType = "needs-info";
    } else if (
      /\btechni|arch|design|方案|implementation|integrate\b/.test(rawBlockReason) ||
      rawBlockType === "technical-block"
    ) {
      blockType = "technical-block";
    } else {
      blockType = "unknown";
    }

    // 根据分类生成差异化建议（减少主控思考量）
    const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
      dependency: "⏳ 依赖阻塞 (DEPENDENCY)",
      "needs-info": "❓ 需求/接口待确认 (NEEDS-INFO)",
      "technical-block": "🔧 技术方案待确认 (TECHNICAL-BLOCK)",
      unknown: "⚠️  原因未知 (UNKNOWN)",
    };
    const BLOCK_TYPE_SUGGEST: Record<BlockType, string[]> = {
      dependency: [
        `→ 推荐: agent.task.triage action=mark-dependency blockedByTaskIds=["<dependency_task_id>"]`,
        `  当依赖任务完成后，系统将自动解除此阻塞`,
        `→ 若依赖任务已完成: agent.task.triage action=reset taskId=${task.id}`,
      ],
      "needs-info": [
        `→ 推荐: 先通过 agent_communicate 与 assignee 或相关 agent 确认细节`,
        `→ 确认后: agent.task.triage action=reset taskId=${task.id}`,
        `→ 若需求已取消: agent.task.triage action=cancel taskId=${task.id}`,
      ],
      "technical-block": [
        `→ 推荐: 用 agent.task.triage action=reassign 指派给更有技术能力的 agent`,
        `→ 或者: agent.task.triage action=add-note 记录方案决策，再 action=reset 重启`,
        `→ 若任务可拆分: agent.task.manage action=split taskId=${task.id}`,
      ],
      unknown: [
        `→ 推荐: agent_communicate 向 assignee 询问阻塞原因`,
        `→ 根据回复再选: agent.task.triage action=reset|cancel|mark-dependency|reassign`,
        `→ 批量处理多个同类阻塞: agent.task.triage operations=[...]`,
      ],
    };

    // 向 supervisor 发送告警
    const supervisorRaw =
      (task.metadata?.supervisorId as string | undefined) ?? task.supervisorId ?? task.creatorId;
    if (supervisorRaw && supervisorRaw !== "system") {
      const supervisorId = normalizeAgentId(supervisorRaw);
      const supervisorSession = `agent:${supervisorId}:main`;
      const assigneeList = task.assignees.map((a) => a.id).join(", ");
      const isHighPriority = task.priority === "urgent" || task.priority === "high";

      const alertLines = [
        isHighPriority
          ? `[BLOCKED TASK ALERT 🔴] High-priority task is blocked and requires immediate action:`
          : `[BLOCKED TASK ALERT] A task is blocked and needs your attention:`,
        ``,
        `Task ID: ${task.id}`,
        `Title: ${task.title}`,
        `Priority: ${task.priority} | Blocked for: ${blockedMinutes}min | Block count: ${blockCount}`,
        `Assigned to: ${assigneeList}`,
        task.projectId ? `Project: ${task.projectId}` : null,
        task.description ? `Description: ${task.description.slice(0, 150)}` : null,
        ``,
        `Block type: ${BLOCK_TYPE_LABEL[blockType]}`,
        ...BLOCK_TYPE_SUGGEST[blockType],
        ``,
        `[批量处理提示] 如有多个同类阻塞任务，请使用 agent.task.triage 一次传入 operations 数组批量决策，避免逐条处理消耗上下文。`,
      ]
        .filter(Boolean)
        .join("\n");

      enqueueSystemEvent(alertLines, {
        sessionKey: supervisorSession,
        contextKey: `cron:task-blocked-alert:${task.id}`,
      });
      requestHeartbeatNow({
        reason: `cron:task-blocked:${task.id}`,
        sessionKey: supervisorSession,
        agentId: supervisorId,
        coalesceMs: 10000,
      });
    }

    // urgent/high 且多次阻塞：同时重发提醒给所有 assignee，要求主动汇报阻塞原因
    const blockCount2 = (task.metadata?.blockCount as number | undefined) ?? blockCount;
    if ((task.priority === "urgent" || task.priority === "high") && blockCount2 >= 2) {
      for (const assignee of task.assignees) {
        const assigneeId = normalizeAgentId(assignee.id);
        const assigneeSession = `agent:${assigneeId}:main`;
        const unblockMsg = [
          `[TASK UNBLOCK REQUEST] Your task has been blocked for ${blockedMinutes} minutes. Please report the blocker reason immediately:`,
          ``,
          `Task ID: ${task.id}`,
          `Title: ${task.title}`,
          `Priority: ${task.priority}`,
          ``,
          `If you cannot continue, use task_report_to_supervisor to explain the blocker.`,
          `If the blocker is resolved, update the task status back to in-progress.`,
        ]
          .filter(Boolean)
          .join("\n");
        enqueueSystemEvent(unblockMsg, {
          sessionKey: assigneeSession,
          contextKey: `cron:task-unblock-request:${task.id}`,
        });
        requestHeartbeatNow({
          reason: `cron:task-unblock:${task.id}`,
          sessionKey: assigneeSession,
          agentId: assigneeId,
          coalesceMs: 10000,
        });
      }
    }
  } catch (error) {
    console.error(t("task.aging.reassign_failed", { taskId: task.id }), error);
  }
}

// ============================================================================
// 定时扫描任务
// ============================================================================

/**
 * 扫描所有项目中的老化任务并执行自动操作
 *
 * 所有可自动化的操作均由程序直接执行，不依赖 agent ：
 * - 优先级升级、状态变更、归档取消均由程序写 storage
 * - 通知/提醒将通过 enqueueSystemEvent 直接推送，不过 chatHandlers
 * - 阻塞任务的依赖检测（blockedBy）由程序自动识别并解除
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
  autoUnblocked: number;
}> {
  const {
    projectId,
    enableReminders = true,
    enableEscalation = true,
    enableArchive = true, // 程序直接执行，默认开启
  } = options ?? {};

  const stats = {
    reminded: 0,
    escalated: 0,
    archived: 0,
    autoUnblocked: 0,
  };

  try {
    // 获取所有未完成的任务
    const allTasks = await storage.listTasks({
      projectId,
      status: ["todo", "in-progress", "blocked"],
    });

    if (allTasks.length === 0) {
      return stats;
    }

    console.log(t("task.aging.scanning", { count: String(allTasks.length) }));

    // 构建已完成任务的快速查找表，用于自动解除 blockedBy 依赖
    const doneTasks = await storage.listTasks({ projectId, status: ["done"] });
    const doneTaskIds = new Set(doneTasks.map((t) => t.id));

    // 构建全量任务映射（用于依赖查找）
    const allTaskMap = new Map(allTasks.map((task) => [task.id, task]));
    for (const dt of doneTasks) {
      allTaskMap.set(dt.id, dt);
    }

    for (const task of allTasks) {
      try {
        // === 运行时依赖检查：in-progress 任务如果前置未完成，自动退回 todo ===
        // 业界实践（Temporal.io / Jira）：任务在执行中发现前置未完成，应将其退回队列而非继续占用客截资源
        if (task.status === "in-progress") {
          const unmetInProgress = await checkUnmetDepsForAging(task, allTaskMap);
          if (unmetInProgress.length > 0) {
            // 退回 todo，并设置 blockedBy
            await storage.updateTask(task.id, {
              status: "blocked",
              blockedBy: unmetInProgress.map((d) => d.id),
              timeTracking: { ...task.timeTracking, startedAt: undefined },
              metadata: {
                ...task.metadata,
                blockedReason: `运行时发现前置未完成: ${unmetInProgress.map((d) => d.id).join(", ")}`,
                blockedAt: Date.now(),
              },
            });
            console.log(
              `[Task Aging] Runtime Dep Check: in-progress task ${task.id} reverted to blocked (unmet: [${unmetInProgress.map((d) => d.id).join(", ")}])`,
            );
            stats.autoUnblocked--; // 占位，用负分抵消后面的++

            // Priority Inheritance：提升前置任务优先级
            for (const dep of unmetInProgress) {
              const depRank = AGING_PRIORITY_RANK[dep.priority] ?? 0;
              const taskRank = AGING_PRIORITY_RANK[task.priority] ?? 0;
              if (depRank < taskRank) {
                await storage.updateTask(dep.id, {
                  priority: task.priority,
                  metadata: {
                    ...dep.metadata,
                    priorityBoostedAt: Date.now(),
                    priorityBoostedBy: `runtime-dep-check from ${task.id}`,
                    priorityBoostedFrom: dep.priority,
                  },
                });
                console.log(
                  `[Task Aging] Priority Inheritance: ${dep.id} boosted ${dep.priority} → ${task.priority} (runtime blocker of in-progress ${task.id})`,
                );
              }
            }

            // 通知主控：即时报告 + 付带前置任务明细和行动建议
            const notifyRaw =
              (task.metadata?.supervisorId as string | undefined) ??
              task.supervisorId ??
              task.creatorId;
            if (notifyRaw && notifyRaw !== "system") {
              injectLeaderSnapshot({
                leaderId: notifyRaw,
                wakeReason: {
                  type: "dep_blocked",
                  taskId: task.id,
                  taskTitle: task.title,
                  agentId: task.assignees?.[0]?.id ?? "unknown",
                  blockedBy: unmetInProgress.map((d) => ({
                    id: d.id,
                    title: d.title,
                    priority: d.priority,
                    assigneeId: d.assignees?.[0]?.id,
                  })),
                },
                coalesceMs: 10_000,
              }).catch(() => {
                /* best-effort */
              });
            }
            stats.autoUnblocked++;
            continue; // 已处理，跳过后续老化扫描
          }
        }

        // === 幻觉防抜 — Worklog 密度检查（P1）===
        // 业界最佳实践 (arXiv 2603.10060 Tool Receipts / Anthropic RLAIF)：
        // in-progress 任务超过 SUSPICION_IDLE_MINS 分钟未写入任何 worklog — 疑似工具执行幻觉
        // (假报进展但未实际操作)，商主控介入核查
        if (task.status === "in-progress") {
          const SUSPICION_IDLE_MINS = 30;
          const SUSPICION_IDLE_MS = SUSPICION_IDLE_MINS * 60 * 1000;
          // 冷却：同一任务 60 分钟内不重复告警
          const SUSPICION_COOLDOWN_MS = 60 * 60 * 1000;
          const lastHallucinationAlertAt =
            (task.metadata?.lastHallucinationAlertAt as number | undefined) ?? 0;
          if (Date.now() - lastHallucinationAlertAt < SUSPICION_COOLDOWN_MS) {
            // 冷却期内跳过
          } else {
            // 尝试读取 worklog，查看最近是否有实质操作
            try {
              const worklogs = await storage.getTaskWorklogs(task.id);
              const substantiveLogs = worklogs.filter(
                (w) => w.action !== "started" && w.action !== "auto_started",
              );
              const startedAt = task.timeTracking?.startedAt ?? task.createdAt;
              const lastLogTs =
                substantiveLogs.length > 0
                  ? Math.max(...substantiveLogs.map((w) => w.createdAt))
                  : null;
              // 参照基准：最后一条 worklog 时间，如未记录则用 startedAt
              const referenceTs = lastLogTs ?? startedAt;
              const idleMs = Date.now() - referenceTs;

              if (idleMs >= SUSPICION_IDLE_MS) {
                const idleMinutes = Math.round(idleMs / 60_000);
                const supervisorRaw =
                  (task.metadata?.supervisorId as string | undefined) ??
                  task.supervisorId ??
                  task.creatorId;

                console.warn(
                  `[Task Aging] 幻觉预警: Task ${task.id} in-progress ${idleMinutes}min 无 worklog (agent=${task.assignees?.[0]?.id ?? "unknown"})`,
                );

                // 更新元数据记录告警时间，防止冷却期内重复告警
                await storage.updateTask(task.id, {
                  metadata: {
                    ...task.metadata,
                    lastHallucinationAlertAt: Date.now(),
                  },
                });

                if (supervisorRaw && supervisorRaw !== "system") {
                  injectLeaderSnapshot({
                    leaderId: supervisorRaw,
                    wakeReason: {
                      type: "suspicion_idle",
                      agentId: task.assignees?.[0]?.id ?? "unknown",
                      taskId: task.id,
                      taskTitle: task.title,
                      idleMinutes,
                      lastWorklogAt: lastLogTs,
                    },
                    coalesceMs: 10_000,
                  }).catch(() => {
                    /* best-effort */
                  });
                }
              }
            } catch {
              // worklog 查询失败不影响老化主流程
            }
          }
        }

        // === 自动解除阻塞：程序检测依赖任务是否已全部完成 ===
        // 这一部分完全由程序自动完成，不依赖 agent
        if (task.status === "blocked" && task.blockedBy && task.blockedBy.length > 0) {
          const allBlockersResolved = task.blockedBy.every((blockerId) =>
            doneTaskIds.has(blockerId),
          );
          if (allBlockersResolved) {
            await storage.updateTask(task.id, {
              status: "todo",
              blockedBy: [],
              timeTracking: {
                ...task.timeTracking,
                lastActivityAt: Date.now(),
              },
              metadata: {
                ...task.metadata,
                autoUnblockedAt: Date.now(),
              },
            });
            console.log(
              `[Task Aging] Auto-unblocked task ${task.id} (all ${task.blockedBy.length} blocker(s) resolved)`,
            );
            stats.autoUnblocked++;
            // 通知相关人员
            const notifyRaw =
              (task.metadata?.supervisorId as string | undefined) ??
              task.supervisorId ??
              task.creatorId;
            if (notifyRaw && notifyRaw !== "system") {
              const notifyId = normalizeAgentId(notifyRaw);
              const sessionKey = `agent:${notifyId}:main`;
              enqueueSystemEvent(
                [
                  `[TASK AUTO-UNBLOCKED] A blocked task has been automatically unblocked as all its dependencies are now done:`,
                  ``,
                  `Task ID: ${task.id}`,
                  `Title: ${task.title}`,
                  `Priority: ${task.priority}`,
                  task.projectId ? `Project: ${task.projectId}` : null,
                  `Resolved blockers: ${task.blockedBy.join(", ")}`,
                  ``,
                  `The task has been reset to todo and will be picked up by the next scheduling cycle.`,
                ]
                  .filter(Boolean)
                  .join("\n"),
                { sessionKey, contextKey: `cron:task-auto-unblocked:${task.id}` },
              );
              requestHeartbeatNow({
                reason: `cron:task-auto-unblocked:${task.id}`,
                sessionKey,
                agentId: notifyId,
                coalesceMs: 10000,
              });
            }
            continue; // 解除提醒后不再老化扫描
          }
        }

        // 记录上次提醒/升级时间，避免同一轮内重复操作
        const lastRemindedAt = (task.metadata?.lastRemindedAt as number | undefined) ?? 0;
        const lastEscalatedAt = (task.metadata?.lastEscalatedAt as number | undefined) ?? 0;
        const now = Date.now();
        // 提醒冷却 30 分钟（避免当局内重复提醒）
        const REMIND_COOLDOWN = 30 * 60 * 1000;
        // 升级冷却 60 分钟
        const ESCALATE_COOLDOWN = 60 * 60 * 1000;

        // 检查是否需要提醒
        if (
          enableReminders &&
          now - lastRemindedAt > REMIND_COOLDOWN &&
          shouldTriggerAutoAction(task, "remind")
        ) {
          const supervisorId =
            (task.metadata?.supervisorId as string) ?? task.supervisorId ?? task.creatorId;
          if (supervisorId && supervisorId !== "system") {
            sendAgingReminder(task, normalizeAgentId(supervisorId));
            stats.reminded++;
            // 程序直接更新元数据，不依赖 agent
            await storage.updateTask(task.id, {
              metadata: { ...task.metadata, lastRemindedAt: now },
            });
          }
        }

        // 检查是否需要升级
        if (
          enableEscalation &&
          now - lastEscalatedAt > ESCALATE_COOLDOWN &&
          shouldTriggerAutoAction(task, "escalate")
        ) {
          const supervisorId =
            (task.metadata?.supervisorId as string) ?? task.supervisorId ?? task.creatorId;
          if (supervisorId && supervisorId !== "system") {
            escalateTask(task, normalizeAgentId(supervisorId));
            stats.escalated++;
            await storage.updateTask(task.id, {
              metadata: { ...task.metadata, lastEscalatedAt: now },
            });
          }
        }

        // 检查是否需要自动取消（程序直接执行）
        if (enableArchive && shouldTriggerAutoAction(task, "archive")) {
          await archiveStaleTask(task);
          stats.archived++;
          continue; // 已取消，跳过后续检测
        }

        // 检查阻塞任务（输出系统提醒 + 更新阻塞记录）
        if (shouldTriggerAutoAction(task, "blocked-escalate")) {
          await reassignBlockedTask(task, projectId);
        }
      } catch (taskError) {
        console.error(t("task.aging.task_process_error", { taskId: task.id }), taskError);
      }
    }

    if (
      stats.reminded > 0 ||
      stats.escalated > 0 ||
      stats.archived > 0 ||
      stats.autoUnblocked > 0
    ) {
      console.log(
        t("task.aging.scan_complete", {
          reminded: String(stats.reminded),
          escalated: String(stats.escalated),
          archived: String(stats.archived),
        }) + ` (auto-unblocked: ${stats.autoUnblocked})`,
      );
    }
  } catch (error) {
    console.error(t("task.aging.scan_failed"), error);
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
  intervalMinutes?: number; // 改为按分钟计算，更灵活
  projectId?: string;
  enableReminders?: boolean;
  enableEscalation?: boolean;
  enableArchive?: boolean;
}): void {
  const intervalMinutes = options?.intervalMinutes ?? 10; // 默认每 10 分钟一次！

  if (agingTaskSchedulerInterval) {
    clearInterval(agingTaskSchedulerInterval);
  }

  console.log(t("task.aging.scheduler_starting", { interval: String(intervalMinutes) }));

  // 立即运行一次
  void scanAndProcessAgingTasks(options);

  // 定时运行（Agent 全年无休！）
  agingTaskSchedulerInterval = setInterval(
    () => {
      void scanAndProcessAgingTasks(options);
    },
    intervalMinutes * 60 * 1000,
  );
}

/**
 * 停止定时任务
 */
export function stopAgingTaskScheduler(): void {
  if (agingTaskSchedulerInterval) {
    clearInterval(agingTaskSchedulerInterval);
    agingTaskSchedulerInterval = null;
    console.log(t("task.aging.scheduler_stopped"));
  }
}
