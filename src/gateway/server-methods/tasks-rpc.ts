// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Tasks RPC Handlers
 *
 * 提供任务协作系统相关的RPC方法（P2.2）：
 *
 * 任务基础操作：
 * - task.create - 创建任务
 * - task.update - 更新任务
 * - task.delete - 删除任务
 * - task.get - 获取任务详情
 * - task.list - 列出任务
 *
 * 任务协作操作：
 * - task.assign - 分配任务
 * - task.status.update - 更新任务状态
 * - task.comment.add - 添加评论
 * - task.attachment.add - 添加附件
 * - task.worklog.add - 添加工作记录（智能助手专用）
 * - task.progress_note.append - 追加进展笔记（双轨写入：SQLite + .notes 文件镜像）
 *
 * 任务关系操作：
 * - task.subtask.create - 创建子任务
 * - task.dependency.add - 添加依赖关系
 * - task.block - 标记任务被阻塞
 */

import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import {
  getTaskTimeline,
} from "../../tasks/audit-log.js";
import {
  getToolChainTrace,
  listAuditFiles,
} from "../../agents/tool-chain-audit.js";
import { requestHeartbeatNow } from "../../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../../upstream/src/infra/system-events.js";
import type { MemberType } from "../../organization/types.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { groupManager } from "../../sessions/group-manager.js";
import { validateRealProgress } from "../../tasks/accountability.js";
import {
  checkTaskAccess,
  checkTaskModifyAccess,
  checkTaskDeleteAccess,
} from "../../tasks/permissions.js";
import * as storage from "../../tasks/storage.js";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskScope,
  TaskAssignee,
  TaskComment,
  TaskAttachment,
  AgentWorkLog,
  TaskDependency,
} from "../../tasks/types.js";
import { buildProjectContext } from "../../utils/project-context.js";
import { getGroupsWorkspaceRoot } from "../../utils/project-context.js";
import { scheduleNextTaskForAgent } from "./agents-management.js";
import { inferTaskType, recordPerfOutcome } from "./evolve-rpc.js";

/**
 * 向 supervisor 发送任务系统事件通知（公共工具函数）
 * @param supervisorRaw - supervisor agentId（未规范化）
 * @param message - 通知消息
 * @param contextKey - 用于合并相同类型通知的容字符串（造成一条透过的通知）
 */
function notifySupervisor(supervisorRaw: string, message: string, contextKey: string): void {
  const supervisorId = normalizeAgentId(supervisorRaw);
  const sessionKey = `agent:${supervisorId}:main`;
  enqueueSystemEvent(message, { sessionKey, contextKey });
  requestHeartbeatNow({
    reason: contextKey,
    sessionKey,
    agentId: supervisorId,
    coalesceMs: 8000,
  });
}

/**
 * 向执行 agent 发送任务系统事件通知
 * @param agentRaw - 执行者 agentId（未规范化）
 * @param message - 通知消息
 * @param contextKey - 合并键
 */
function notifyAssignee(agentRaw: string, message: string, contextKey: string): void {
  const agentId = normalizeAgentId(agentRaw);
  const sessionKey = `agent:${agentId}:main`;
  enqueueSystemEvent(message, { sessionKey, contextKey });
  requestHeartbeatNow({
    reason: contextKey,
    sessionKey,
    agentId,
    coalesceMs: 8000,
  });
}

/**
 * 任务 RPC 方法注册
 */
export const tasksRpc: GatewayRequestHandlers = {
  /**
   * task.create - 创建任务
   */
  "task.create": async ({ params, respond }) => {
    try {
      const title = params?.title ? String(params.title) : "";
      const description = params?.description ? String(params.description) : "";
      // creatorId 由工具层传入（当前 agent），不再 fallback 到不存在的 "system"
      // 使用空串作为 unknown/anonymous 创建者，避免类型错误
      const creatorId = params?.creatorId ? String(params.creatorId) : "";
      const creatorType = params?.creatorType
        ? (String(params.creatorType) as MemberType)
        : "agent";
      // 兼容 assigneeIds 数组 和 assignee 单个字符串
      const assigneeIds: string[] = params?.assigneeIds
        ? (params.assigneeIds as string[])
        : params?.assignee
          ? [String(params.assignee)]
          : [];
      const priority = params?.priority ? String(params.priority) : "medium";
      const type = params?.type ? (String(params.type) as TaskType) : undefined;
      // scope: personal（私人任务）或 project（项目任务，默认），决定记忆写入位置
      const scope: TaskScope = params?.scope === "personal" ? "personal" : "project";
      const dueDate = params?.dueDate ? Number(params.dueDate) : undefined;
      const organizationId = params?.organizationId ? String(params.organizationId) : undefined;
      const teamId = params?.teamId ? String(params.teamId) : undefined;
      // 兼容工具端传入 project 或 projectId
      const projectId =
        (params?.projectId ? String(params.projectId) : null) ||
        (params?.project ? String(params.project) : null) ||
        undefined;
      const parentTaskId = params?.parentTaskId ? String(params.parentTaskId) : undefined;
      const tags = params?.tags ? (params.tags as string[]) : [];
      // supervisorId 处理：
      //   - 未传 → 默认用 creatorId（创建者自己）
      //   - 已传 → 校验必须是该项目成员；无群组数据时无法验证，强制回退到 creatorId
      const rawSupervisorId = params?.supervisorId ? String(params.supervisorId) : undefined;
      let supervisorId: string = rawSupervisorId ?? creatorId;

      if (rawSupervisorId && scope === "project") {
        const projectMemberIds = new Set<string>();
        const allGroups = groupManager.getAllGroups();

        // 1. 按 projectId 匹配的群组
        if (projectId) {
          for (const g of allGroups.filter((g) => g.projectId === projectId)) {
            if (g.ownerId) {
              projectMemberIds.add(normalizeAgentId(g.ownerId));
            }
            for (const m of g.members) {
              projectMemberIds.add(normalizeAgentId(m.agentId));
            }
          }
        }

        // 2. 若 projectId 无群组，再按 teamId 找
        if (projectMemberIds.size === 0 && teamId) {
          for (const g of allGroups.filter((g) => g.id === teamId || g.projectId === teamId)) {
            if (g.ownerId) {
              projectMemberIds.add(normalizeAgentId(g.ownerId));
            }
            for (const m of g.members) {
              projectMemberIds.add(normalizeAgentId(m.agentId));
            }
          }
        }

        if (projectMemberIds.size > 0) {
          // 有成员数据：校验，不通过则报错让 agent 重新指定
          if (!projectMemberIds.has(normalizeAgentId(rawSupervisorId))) {
            const memberList = [...projectMemberIds].join(", ");
            const scopeLabel = projectId || teamId || "该项目";
            respond(
              false,
              undefined,
              errorShape(
                ErrorCodes.INVALID_REQUEST,
                `supervisorId "${rawSupervisorId}" 不是 "${scopeLabel}" 的成员。` +
                  `项目成员包括：${memberList}。请从中选择一位作为主管，或不填（默认为创建者自己）。`,
              ),
            );
            return;
          }
          supervisorId = rawSupervisorId;
        } else {
          // 无群组数据，无法验证，强制使用 creatorId 确保主管真实有效
          supervisorId = creatorId;
        }
      }

      // 验证参数
      if (!title || title.length < 1 || title.length > 200) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `"title" is required (1-200 characters). Please provide a clear, concise task title that describes what needs to be done. Example: task.create({ title: "实现用户登录功能", ... })`,
          ),
        );
        return;
      }

      // 项目任务必须关联 projectId，私人任务不要求
      if (scope === "project" && !projectId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            '项目任务（scope=project）必须关联 projectId。若为个人待办请传 scope="personal"',
          ),
        );
        return;
      }

      // description 可为空（工具端不一定传）

      // 验证优先级（支持 pending 作为 medium 的别名）
      const normalizedPriority: TaskPriority = (
        priority === "pending" ? "medium" : priority
      ) as TaskPriority;
      if (!["low", "medium", "high", "urgent"].includes(normalizedPriority)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无效的任务优先级"));
        return;
      }

      // 兼容工具端传入的 id 字段（优先使用工具端指定的ID）
      const taskId =
        (params?.id ? String(params.id) : null) ||
        `task-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      // 创建执行者列表
      const assignees: TaskAssignee[] = assigneeIds.map((assigneeId, index) => ({
        id: assigneeId,
        type: "agent" as MemberType,
        role: index === 0 ? "owner" : "assignee",
        assignedAt: Date.now(),
        assignedBy: creatorId,
      }));

      // 创建任务对象
      const newTask: Task = {
        id: taskId,
        title,
        description,
        creatorId,
        creatorType,
        assignees,
        // 兼容工具层传入的状态别名（pending→todo、in_progress→in-progress 等）
        // 注意：没有传 status 时默认为 todo
        status: (() => {
          const rawStatus = params?.status ? String(params.status) : "todo";
          const STATUS_ALIASES: Record<string, string> = {
            pending: "todo",
            in_progress: "in-progress",
            inprogress: "in-progress",
            completed: "done",
            complete: "done",
            open: "todo",
            new: "todo",
            todo: "todo",
          };
          return (STATUS_ALIASES[rawStatus.toLowerCase()] ??
            rawStatus) as import("../../tasks/types.js").TaskStatus;
        })(),
        priority: normalizedPriority,
        type,
        scope,
        organizationId,
        teamId,
        projectId,
        parentTaskId,
        dueDate,
        supervisorId,
        timeTracking: {
          timeSpent: 0,
          lastActivityAt: Date.now(),
        },
        tags,
        createdAt: Date.now(),
      };

      // 存储到数据库
      await storage.createTask(newTask);

      // 通知所有被分配者
      for (const assignee of assignees) {
        console.log(`[Task Notification] Assigned task ${taskId} to ${assignee.id}`);
      }

      // Triage Intelligence — 对标 Linear 2026 Triage 功能
      // 基于标题/描述关键词+类型自动评估建议优先级、标签，warn 不 block
      let triageSuggestion: Record<string, unknown> | undefined;
      try {
        triageSuggestion = calcTriageSuggestion(title, description, type, normalizedPriority, tags);
      } catch {
        // triage 失败不阻塞创建
      }

      respond(true, { ...newTask, ...(triageSuggestion ? { triageSuggestion } : {}) }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.update - 更新任务
   */
  "task.update": async ({ params, respond }) => {
    try {
      // 兼容工具端传 id 或 taskId
      const taskId =
        (params?.taskId ? String(params.taskId) : "") || (params?.id ? String(params.id) : "");
      const title = params?.title ? String(params.title) : undefined;
      const description = params?.description ? String(params.description) : undefined;
      const status = params?.status ? (String(params.status) as TaskStatus) : undefined;
      const priority = params?.priority ? (String(params.priority) as TaskPriority) : undefined;
      const dueDate = params?.dueDate ? Number(params.dueDate) : undefined;
      const tags = params?.tags ? (params.tags as string[]) : undefined;
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const teamId = params?.teamId ? String(params.teamId) : undefined;
      const organizationId = params?.organizationId ? String(params.organizationId) : undefined;

      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务ID不能为空"));
        return;
      }

      // 验证状态（兼容常见别名）
      const STATUS_ALIASES: Record<string, TaskStatus> = {
        in_progress: "in-progress",
        inprogress: "in-progress",
        "in progress": "in-progress",
        completed: "done",
        complete: "done",
        finish: "done",
        finished: "done",
        closed: "done",
        open: "todo",
        new: "todo",
        pending: "todo",
        cancel: "cancelled",
        wip: "in-progress",
      };
      const normalizedStatus = status
        ? (STATUS_ALIASES[status.toLowerCase()] ?? status)
        : undefined;
      if (
        normalizedStatus &&
        !["todo", "in-progress", "review", "blocked", "done", "cancelled"].includes(
          normalizedStatus,
        )
      ) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无效的任务状态"));
        return;
      }

      // 验证优先级
      if (priority && !["low", "medium", "high", "urgent"].includes(priority)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无效的任务优先级"));
        return;
      }

      // 从数据库获取任务
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 需要创建者、执行者或管理员权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const ownerIds = (task.assignees ?? []).filter((a) => a.role === "owner").map((a) => a.id);
        const permCheck = checkTaskModifyAccess(
          task.creatorId,
          ownerIds,
          task.organizationId,
          task.teamId,
          requesterId,
          undefined,
          undefined,
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限修改此任务"),
          );
          return;
        }
      }

      // 处理 assignee 字段（单人负责人更新）
      const assignee = params?.assignee ? String(params.assignee) : undefined;
      let updatedAssignees = task.assignees ?? [];
      if (assignee) {
        // 如果已经有该 assignee，不重复添加；否则替换第一个 owner 或直接添加
        const alreadyAssigned = (task.assignees ?? []).some((a) => a.id === assignee);
        if (!alreadyAssigned) {
          updatedAssignees = [
            ...(task.assignees ?? []),
            {
              id: assignee,
              type: "agent" as MemberType,
              role: "assignee" as const,
              assignedAt: Date.now(),
              assignedBy: "system",
            },
          ];
        }
      }

      // 处理 addTags/removeTags
      const addTags = params?.addTags ? (params.addTags as string[]) : undefined;
      const removeTags = params?.removeTags ? (params.removeTags as string[]) : undefined;
      let updatedTags = tags;
      if (addTags || removeTags) {
        const base = task.tags ?? [];
        const afterAdd = addTags ? [...new Set([...base, ...addTags])] : base;
        updatedTags = removeTags ? afterAdd.filter((t) => !removeTags.includes(t)) : afterAdd;
      }

      // 处理 blockedBy 动态更新（增加前置依赖 / 解除阻塞）
      const addBlockedBy = Array.isArray(params?.addBlockedBy) ? (params.addBlockedBy as string[]) : [];
      const removeBlockedBy = Array.isArray(params?.removeBlockedBy) ? (params.removeBlockedBy as string[]) : [];
      const setBlockedBy = Array.isArray(params?.blockedBy) ? (params.blockedBy as string[]) : undefined;

      // 更新任务信息
      const updatedTask = await storage.updateTask(taskId, {
        title,
        description,
        status: normalizedStatus,
        priority,
        dueDate,
        tags: updatedTags,
        assignees: assignee ? updatedAssignees : undefined,
        projectId,
        teamId,
        organizationId,
        // P1: blockedBy 动态更新（增加前置依赖 / 解除阻塞）
        ...(addBlockedBy.length > 0 || removeBlockedBy.length > 0 ? {
          blockedBy: removeBlockedBy.length > 0
            ? [...new Set([...(task.blockedBy ?? []), ...addBlockedBy])].filter((id) => !removeBlockedBy.includes(id))
            : [...new Set([...(task.blockedBy ?? []), ...addBlockedBy])],
        } : {}),
        ...(setBlockedBy !== undefined ? { blockedBy: setBlockedBy } : {}),
      });

      // blockedBy 变化自动同步 status
      const finalBlockedBy = (updatedTask as Record<string, unknown>).blockedBy as string[] | undefined;
      if (finalBlockedBy !== undefined && finalBlockedBy.length === 0 && task.status === "blocked" && !normalizedStatus) {
        await storage.updateTask(taskId, { status: "in-progress" });
      } else if (finalBlockedBy && finalBlockedBy.length > 0 && task.status !== "blocked" && !normalizedStatus) {
        await storage.updateTask(taskId, { status: "blocked" });
      }

      respond(true, updatedTask, undefined);

      // WIP Limit 警告（warn 不 block）—— 当状态设为 in-progress 时检查项目看板 WIP 限制
      // 对标 Kanban Best Practices：WIP limit 是减少流动效率损失的核心手段
      if (normalizedStatus === "in-progress") {
        const wpId = projectId ?? task.projectId;
        if (wpId) {
          try {
            const { buildProjectContext } = await import("../../utils/project-context.js");
            const ctx = buildProjectContext(wpId);
            const wipLimit = ctx.config?.wipLimit as number | undefined;
            if (wipLimit && wipLimit > 0) {
              const inProgressCount = (await storage.listTasks({ projectId: wpId, status: "in-progress", limit: 500 })).length;
              if (inProgressCount > wipLimit) {
                // 通知主控： WIP 超限
                const supervisorRaw = task.supervisorId ?? task.creatorId;
                if (supervisorRaw && supervisorRaw !== "system") {
                  notifySupervisor(supervisorRaw,
                    `[WIP LIMIT WARNING] \u9879\u76ee "${wpId}" \u770b\u677f\u8d85\u8fc7 WIP \u9650\u5236 (\u5f53\u524d: ${inProgressCount}, \u9650\u5236: ${wipLimit})\u3002\u5efa\u8bae\u5148\u5b8c\u6210\u8fdb\u884c\u4e2d\u7684\u4efb\u52a1\u518d\u5f00\u59cb\u65b0\u4efb\u52a1\uff0c\u907f\u514d\u4efb\u52a1\u5207\u6362\u5bfc\u81f4\u7684\u6548\u7387\u635f\u5931\u3002`,
                    `wip-limit:${wpId}`);
                }
              }
            }
          } catch { /* WIP \u68c0\u67e5\u5931\u8d25\u4e0d\u963b\u585e\u4e3b\u6d41\u7a0b */ }
        }
      }
      // B1: 子任务变为 blocked 时，向父任务主控发出 at-risk 警告
      if (normalizedStatus === "blocked" && task.parentTaskId) {
        try {
          const parentTask = await storage.getTask(task.parentTaskId);
          if (parentTask && parentTask.supervisorId && parentTask.supervisorId !== "system") {
            notifySupervisor(parentTask.supervisorId,
              `[PARENT AT-RISK] Subtask "${task.title}" (${taskId}) is now BLOCKED. Parent task "${parentTask.title}" may be at risk. Please resolve the blocker.`,
              `parent-at-risk:${task.parentTaskId}`);
          }
        } catch {
          // 父任务警告失败不阻塞主流程
        }
      }
      // 业界最佳实践：任何状态变化都通知项目负责人，使其能及时感知进展
      if (normalizedStatus && normalizedStatus !== task.status) {
        const statusEmoji: Record<string, string> = {
          done: "✅",
          cancelled: "❌",
          blocked: "⛔",
          "in-progress": "▶️",
          todo: "⏸️",
          review: "🔍",
        };
        const emoji = statusEmoji[normalizedStatus] ?? "🟡";
        const operatorId = (params?.requesterId ? String(params.requesterId) : null) ?? "system";

        // 通知主控
        const supervisorRaw = task.supervisorId ?? task.creatorId;
        if (supervisorRaw && supervisorRaw !== "system") {
          const stateChangeMsg = [
            `[TASK STATE CHANGE] ${emoji} 任务状态变更`,
            ``,
            `Task ID: ${taskId}`,
            task.title ? `标题: ${task.title}` : null,
            `状态变更: ${task.status} → ${normalizedStatus}`,
            task.projectId ? `项目: ${task.projectId}` : null,
            `操作者: ${operatorId}`,
            normalizedStatus === "blocked"
              ? `\n⚠️ 任务已阻塞，请尽快介入除阻。`
              : null,
            normalizedStatus === "done"
              ? `\n任务已完成，请检查是否需要迟程工作或关闭关联 Sprint。`
              : null,
          ]
            .filter(Boolean)
            .join("\n");
          notifySupervisor(supervisorRaw, stateChangeMsg, `task:state-change:${taskId}`);
        }

        // 通知执行人（assignees）
        const assigneeList = task.assignees ?? [];
        for (const assignee of assigneeList) {
          if (!assignee.id || assignee.id === "system" || assignee.id === supervisorRaw) {continue;}
          const assigneeMsg = [
            `[TASK STATE CHANGE] ${emoji} 你的任务状态已更新`,
            ``,
            `Task ID: ${taskId}`,
            task.title ? `标题: ${task.title}` : null,
            `状态变更: ${task.status} → ${normalizedStatus}`,
            task.projectId ? `项目: ${task.projectId}` : null,
            `操作者: ${operatorId}`,
            normalizedStatus === "todo"
              ? `\n任务已被重置为待开始，请确认当前工作计划。`
              : null,
            normalizedStatus === "cancelled"
              ? `\n任务已被取消，无需继续执行。`
              : null,
            normalizedStatus === "in-progress"
              ? `\n任务已被标记为进行中，请继续推进。`
              : null,
          ]
            .filter(Boolean)
            .join("\n");
          notifyAssignee(assignee.id, assigneeMsg, `task:state-change:${taskId}`);
        }
      }

      // 状态变为 done/cancelled 时触发即时归档
      if (normalizedStatus === "done" || normalizedStatus === "cancelled") {
        storage.archiveOldTasks().catch((archErr) => {
          console.warn(`[task.update] archiveOldTasks failed: ${String(archErr)}`);
        });

        // === KPI 写回闭环（Hermes v0.8.0 cron KPI 借鉴）===
        // 任务完成/取消时，自动将结果记录到执行 Agent 的性能画像，
        // 供调度器下次做 KPI 择优分配时使用。
        const kpiAssigneeId = (updatedTask?.assignees ?? [])[0]?.id || task.creatorId || undefined;
        if (kpiAssigneeId) {
          const kpiTitle = updatedTask?.title ?? task.title ?? "";
          const kpiDesc = updatedTask?.description ?? task.description ?? "";
          const kpiTaskType = inferTaskType(
            kpiTitle + " " + kpiDesc.slice(0, 100),
            updatedTask?.tags ?? task.tags ?? [],
          );
          const kpiOutcome = normalizedStatus === "done" ? "success" : "failure";
          recordPerfOutcome(kpiAssigneeId, kpiTaskType, kpiOutcome);
        }
      }

      // 非状态字段变更通知（标题/优先级/截止时间被编辑）
      const fieldChanges: string[] = [];
      if (title && title !== task.title) {fieldChanges.push(`标题: ${task.title} → ${title}`);}
      if (priority && priority !== task.priority) {fieldChanges.push(`优先级: ${task.priority} → ${priority}`);}
      if (dueDate !== undefined && dueDate !== task.dueDate) {
        const dueDateStr = dueDate ? new Date(dueDate).toLocaleString("zh-CN") : "无";
        fieldChanges.push(`截止时间: → ${dueDateStr}`);
      }
      if (!normalizedStatus && fieldChanges.length > 0) {
        const operatorId2 = (params?.requesterId ? String(params.requesterId) : null) ?? "system";
        const supervisorRaw2 = task.supervisorId ?? task.creatorId;
        const fieldEditMsg = [
          `[TASK UPDATED] ✏️ 任务内容已编辑`,
          ``,
          `Task ID: ${taskId}`,
          task.title ? `标题: ${updatedTask?.title ?? task.title}` : null,
          ...fieldChanges,
          task.projectId ? `项目: ${task.projectId}` : null,
          `操作者: ${operatorId2}`,
        ]
          .filter(Boolean)
          .join("\n");
        // 通知主控
        if (supervisorRaw2 && supervisorRaw2 !== "system") {
          notifySupervisor(supervisorRaw2, fieldEditMsg, `task:field-edit:${taskId}`);
        }
        // 通知执行人
        for (const assignee of task.assignees ?? []) {
          if (!assignee.id || assignee.id === "system" || assignee.id === supervisorRaw2) {continue;}
          notifyAssignee(assignee.id, fieldEditMsg, `task:field-edit:${taskId}`);
        }
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to update task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.delete - 删除任务
   */
  "task.delete": async ({ params, respond }) => {
    try {
      // 兼容工具端传 id 或 taskId
      const taskId =
        (params?.taskId ? String(params.taskId) : "") || (params?.id ? String(params.id) : "");

      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务ID不能为空"));
        return;
      }

      // 从数据库获取任务
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 需要创建者或管理员权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const permCheck = checkTaskDeleteAccess(
          task.creatorId,
          task.organizationId,
          task.teamId,
          requesterId,
          undefined,
          undefined,
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限删除此任务"),
          );
          return;
        }
      }

      // 检查是否有子任务或依赖关系
      if (task.subtasks && task.subtasks.length > 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `任务存在${task.subtasks.length}个子任务，请先删除子任务`,
          ),
        );
        return;
      }

      const dependencies = await storage.getTaskDependencies(taskId);
      if (dependencies.length > 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `任务存在${dependencies.length}个依赖关系，请先解除依赖`,
          ),
        );
        return;
      }

      // 从数据库删除
      const deleted = await storage.deleteTask(taskId);

      respond(true, { success: deleted, taskId }, undefined);

      // 删除成功：通知主控和执行人
      if (deleted) {
        const operatorId = requesterId ?? "system";
        const deleteMsg = [
          `[TASK DELETED] 🗑️ 任务已被删除`,
          ``,
          `Task ID: ${taskId}`,
          task.title ? `标题: ${task.title}` : null,
          task.projectId ? `项目: ${task.projectId}` : null,
          `操作者: ${operatorId}`,
          ``,
          `该任务已被永久删除，请停止一切相关执行。`,
        ]
          .filter(Boolean)
          .join("\n");
        // 通知主控
        const supervisorRaw = task.supervisorId ?? task.creatorId;
        if (supervisorRaw && supervisorRaw !== "system") {
          notifySupervisor(supervisorRaw, deleteMsg, `task:deleted:${taskId}`);
        }
        // 通知执行人
        for (const assignee of task.assignees ?? []) {
          if (!assignee.id || assignee.id === "system" || assignee.id === supervisorRaw) {continue;}
          notifyAssignee(assignee.id, deleteMsg, `task:deleted:${taskId}`);
        }
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to delete task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.get - 获取任务详情
   */
  "task.get": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";

      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务ID不能为空"));
        return;
      }

      // 从数据库获取任务
      const task = await storage.getTask(taskId);

      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 验证请求者有权限查看此任务
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const assigneeIds = (task.assignees ?? []).map((a) => a.id);
        const permCheck = checkTaskAccess(
          task.creatorId,
          assigneeIds,
          task.organizationId,
          task.teamId,
          requesterId,
          undefined,
          undefined,
          task.supervisorId,
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限查看此任务"),
          );
          return;
        }
      }

      // 加载关联数据
      const comments = await storage.getTaskComments(taskId);
      const attachments = await storage.getTaskAttachments(taskId);
      const worklogs = await storage.getTaskWorklogs(taskId);
      const dependencies = await storage.getTaskDependencies(taskId);

      const fullTask = {
        ...task,
        comments,
        attachments,
        workLogs: worklogs,
        dependencies: dependencies.map((d) => d.dependsOnTaskId),
      };

      respond(true, fullTask, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.list - 列出任务
   */
  "task.list": async ({ params, respond }) => {
    try {
      // 兑容 assigneeId 和 assignee 两种参数名
      const assigneeId =
        (params?.assigneeId ? String(params.assigneeId) : null) ||
        (params?.assignee ? String(params.assignee) : undefined);
      const creatorId = params?.creatorId ? String(params.creatorId) : undefined;
      const supervisorId = params?.supervisorId ? String(params.supervisorId) : undefined;
      // 兼容工具层状态别名（pending→todo, in_progress→in-progress, completed→done）
      const STATUS_ALIASES: Record<string, string> = {
        pending: "todo",
        in_progress: "in-progress",
        inprogress: "in-progress",
        "in progress": "in-progress",
        completed: "done",
        complete: "done",
        done: "done",
        finish: "done",
        finished: "done",
        closed: "done",
        open: "todo",
        new: "todo",
        todo: "todo",
        cancel: "cancelled",
        wip: "in-progress",
      };
      const rawStatus = params?.status ? (params.status as TaskStatus | TaskStatus[]) : undefined;
      const status = rawStatus
        ? Array.isArray(rawStatus)
          ? rawStatus.map(
              (s) => (STATUS_ALIASES[String(s).toLowerCase()] ?? String(s)) as TaskStatus,
            )
          : ((STATUS_ALIASES[String(rawStatus).toLowerCase()] ?? String(rawStatus)) as TaskStatus)
        : undefined;
      const priority = params?.priority
        ? (params.priority as TaskPriority | TaskPriority[])
        : undefined;
      const organizationId = params?.organizationId ? String(params.organizationId) : undefined;
      const teamId = params?.teamId ? String(params.teamId) : undefined;
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const keyword = params?.keyword ? String(params.keyword) : undefined;
      const limit =
        params?.limit && Number(params.limit) > 0 ? Math.min(Number(params.limit), 500) : undefined;
      // dueToday: 转换为 dueDateBefore/dueDateAfter 筛选
      const dueToday = params?.dueToday === true || params?.dueToday === "true";
      const overdueOnly = params?.overdueOnly === true || params?.overdueOnly === "true";
      const blockedOnly = params?.blockedOnly === true || params?.blockedOnly === "true";
      const now = Date.now();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      // 构建筛选条件
      const filter: Record<string, unknown> = {
        assigneeId,
        creatorId,
        supervisorId,
        status,
        priority,
        organizationId,
        teamId,
        projectId,
        keyword,
        limit,
        ...(dueToday
          ? { dueDateAfter: todayStart.getTime(), dueDateBefore: todayEnd.getTime() }
          : {}),
        // overdueOnly: 截止日期已过且不是 done/cancelled
        ...(overdueOnly ? { dueDateBefore: now, excludeStatus: ["done", "cancelled"] } : {}),
        // blockedOnly: 只返回 blocked 状态
        ...(blockedOnly ? { status: "blocked" } : {}),
      };

      // 从数据库查询任务列表
      const tasks = await storage.listTasks(filter);

      // 权限检查 - 只返回用户有权限查看的任务
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      let filteredTasks = tasks;

      if (requesterId) {
        filteredTasks = tasks.filter((task) => {
          const assigneeIds = (task.assignees ?? []).map((a) => a.id);
          const permCheck = checkTaskAccess(
            task.creatorId,
            assigneeIds,
            task.organizationId,
            task.teamId,
            requesterId,
            undefined,
            undefined,
            task.supervisorId,
          );
          return permCheck.allowed;
        });
      }

      respond(true, { tasks: filteredTasks, total: filteredTasks.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to list tasks: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.assign - 分配任务
   */
  "task.assign": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      const assigneeId = params?.assigneeId ? String(params.assigneeId) : "";
      const assigneeType = params?.assigneeType
        ? (String(params.assigneeType) as MemberType)
        : "agent";
      const role = params?.role ? String(params.role) : "assignee";
      const assignedBy = params?.assignedBy ? String(params.assignedBy) : "system";

      if (!taskId || !assigneeId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"));
        return;
      }

      // 获取任务
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 需要任务owner或管理员权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const ownerIds = (task.assignees ?? []).filter((a) => a.role === "owner").map((a) => a.id);
        const permCheck = checkTaskModifyAccess(
          task.creatorId,
          ownerIds,
          task.organizationId,
          task.teamId,
          requesterId,
          undefined,
          undefined,
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限分配此任务"),
          );
          return;
        }
      }

      // 验证被分配者不重复
      const existingAssignee = (task.assignees ?? []).find((a) => a.id === assigneeId);
      if (existingAssignee) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "该用户已经是任务执行者"));
        return;
      }

      // 添加执行者到任务
      const newAssignee: TaskAssignee = {
        id: assigneeId,
        type: assigneeType,
        role: role as "owner" | "assignee" | "reviewer" | "observer",
        assignedAt: Date.now(),
        assignedBy,
      };

      (task.assignees ?? (task.assignees = [])).push(newAssignee);
      await storage.updateTask(taskId, { assignees: task.assignees });

      // 通知被分配者
      console.log(`[Task Notification] New assignee ${assigneeId} added to task ${taskId}`);
      // 实际环境中应该调用通知系统发送任务分配通知

      respond(true, newAssignee, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to assign task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.status.update - 更新任务状态
   */
  "task.status.update": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      const newStatus = params?.newStatus
        ? (String(params.newStatus) as TaskStatus)
        : ("" as TaskStatus);
      const reason = params?.reason ? String(params.reason) : undefined;
      const updatedBy = params?.updatedBy ? String(params.updatedBy) : "system";

      if (!taskId || !newStatus) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"));
        return;
      }

      // 验证状态
      if (!["todo", "in-progress", "review", "blocked", "done", "cancelled"].includes(newStatus)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无效的任务状态"));
        return;
      }

      // 获取任务
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 需要执行者或管理员权限
      const requesterId = params?.requesterId ? String(params.requesterId) : updatedBy;
      if (requesterId) {
        const ownerIds = (task.assignees ?? []).filter((a) => a.role === "owner").map((a) => a.id);
        const permCheck = checkTaskModifyAccess(
          task.creatorId,
          ownerIds,
          task.organizationId,
          task.teamId,
          requesterId,
          undefined,
          undefined,
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限更新任务状态"),
          );
          return;
        }
      }

      // 验证状态流转合法性
      const validTransitions: Record<TaskStatus, TaskStatus[]> = {
        todo: ["in-progress", "cancelled"],
        "in-progress": ["review", "blocked", "done", "cancelled"],
        review: ["in-progress", "done", "cancelled"],
        blocked: ["in-progress", "done", "cancelled"], // 修复：blocked 允许直接完成（解除阻塞即完成）
        done: ["in-progress"], // 允许重新打开
        cancelled: ["todo"], // 允许恢复
      };

      if (!validTransitions[task.status].includes(newStatus)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `无效的状态流转: ${task.status} -> ${newStatus}`),
        );
        return;
      }

      // 更新状态并记录变更历史
      const updates: Partial<Task> = { status: newStatus };

      // 如果状态变为done，记录完成时间
      if (newStatus === "done") {
        updates.completedAt = Date.now();
      }

      // 如果状态变为in-progress，记录开始时间并刷新活跃度时间戳
      if (newStatus === "in-progress") {
        // 修复：task.timeTracking 可能为 undefined（旧任务迁移场景），需防御性解构
        const existingTracking = task.timeTracking ?? { timeSpent: 0, lastActivityAt: Date.now() };
        updates.timeTracking = {
          ...existingTracking,
          startedAt: existingTracking.startedAt ?? Date.now(),
          lastActivityAt: Date.now(), // 每次进入 in-progress 都刷新活跃度，防止被误判为僵尸
        };
      }

      await storage.updateTask(taskId, updates);

      // 状态变更通知主控（Task State Change Event）
      // 业界最佳实践：任何状态变化都通知项目负责人，使其能及时感知进展
      const statusEmoji: Record<string, string> = {
        done: "✅",
        cancelled: "❌",
        blocked: "⛔",
        "in-progress": "▶️",
        todo: "⏸️",
        review: "🔍",
      };
      const sceEmoji = statusEmoji[newStatus] ?? "🟡";
      const sceSupRaw = task.supervisorId ?? task.creatorId;
      if (sceSupRaw && sceSupRaw !== "system") {
        const stateChangeMsg = [
          `[TASK STATE CHANGE] ${sceEmoji} 任务状态变更`,
          ``,
          `Task ID: ${taskId}`,
          task.title ? `标题: ${task.title}` : null,
          `状态变更: ${task.status} → ${newStatus}`,
          task.projectId ? `项目: ${task.projectId}` : null,
          reason ? `备注: ${reason}` : null,
          `操作者: ${updatedBy}`,
          newStatus === "blocked"
            ? `\n⚠️ 任务已阈读，请尽快介入除阈。可尝试：1) 进行 agent_task_manage 延长期限 2) 重分配其他 agent 3) 取消任务`
            : null,
          newStatus === "done"
            ? `\n任务已完成，请检查是否需要更新 Sprint 状态或进行后续工作。`
            : null,
        ]
          .filter(Boolean)
          .join("\n");
        notifySupervisor(sceSupRaw, stateChangeMsg, `task:state-change:${taskId}`);
      }

      // 实际环境中应该通知所有相关人员
      console.log(
        `[Task Notification] Task ${taskId} status changed: ${task.status} -> ${newStatus}`,
      );

      const result = {
        taskId,
        newStatus,
        reason,
        updatedBy,
        updatedAt: Date.now(),
      };

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to update task status: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.comment.add - 添加评论
   */
  "task.comment.add": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      const content = params?.content ? String(params.content) : "";
      const authorId = params?.authorId ? String(params.authorId) : "system";
      const authorType = params?.authorType ? (String(params.authorType) as MemberType) : "human";
      const attachments = params?.attachments ? (params.attachments as string[]) : undefined;
      const replyToCommentId = params?.replyToCommentId
        ? String(params.replyToCommentId)
        : undefined;

      if (!taskId || !content || content.length < 1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "任务ID和评论内容不能为空"),
        );
        return;
      }

      // 权限检查 - 验证用户有权限访问此任务
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      const assigneeIds = (task.assignees ?? []).map((a) => a.id);
      const permCheck = checkTaskAccess(
        task.creatorId,
        assigneeIds,
        task.organizationId,
        task.teamId,
        authorId,
        undefined,
        undefined,
        task.supervisorId,
      );
      if (!permCheck.allowed) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限评论此任务"),
        );
        return;
      }

      // 添加评论
      const commentId = `comment-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const newComment: TaskComment = {
        id: commentId,
        taskId,
        authorId,
        authorType,
        content,
        attachments,
        replyToCommentId,
        createdAt: Date.now(),
      };

      await storage.addTaskComment(newComment);

      // 通知相关人员
      console.log(`[Task Notification] New comment on task ${taskId} by ${authorId}`);
      // 实际环境中应该通知任务创建者和所有执行者

      respond(true, newComment, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to add comment: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.attachment.add - 添加附件
   */
  "task.attachment.add": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      const fileName = params?.fileName ? String(params.fileName) : "";
      const fileSize = params?.fileSize ? Number(params.fileSize) : 0;
      const fileType = params?.fileType ? String(params.fileType) : "";
      const fileUrl = params?.fileUrl ? String(params.fileUrl) : "";
      const uploadedBy = params?.uploadedBy ? String(params.uploadedBy) : "system";

      if (!taskId || !fileName || !fileUrl) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"));
        return;
      }

      // 权限检查 - 验证用户有权限访问此任务
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      const assigneeIds = (task.assignees ?? []).map((a) => a.id);
      const permCheck = checkTaskAccess(
        task.creatorId,
        assigneeIds,
        task.organizationId,
        task.teamId,
        uploadedBy,
        undefined,
        undefined,
        task.supervisorId,
      );
      if (!permCheck.allowed) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限添加附件"),
        );
        return;
      }

      // 验证文件大小限制（默认50MB）
      const maxFileSize = 50 * 1024 * 1024;
      if (fileSize > maxFileSize) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `文件大小超过限制（最大${maxFileSize / 1024 / 1024}MB）`,
          ),
        );
        return;
      }

      const attachmentId = `attach-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const newAttachment: TaskAttachment = {
        id: attachmentId,
        taskId,
        fileName,
        fileSize,
        fileType,
        fileUrl,
        uploadedBy,
        uploadedAt: Date.now(),
      };

      await storage.addTaskAttachment(newAttachment);

      respond(true, newAttachment, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to add attachment: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.worklog.add - 添加工作记录（智能助手专用）
   */
  "task.worklog.add": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      const agentId = params?.agentId ? String(params.agentId) : "";
      const action = params?.action ? String(params.action) : "";
      const details = params?.details ? String(params.details) : "";
      const duration = params?.duration ? Number(params.duration) : undefined;
      const result = params?.result
        ? (String(params.result) as "success" | "failure" | "partial")
        : undefined;
      const errorMessage = params?.errorMessage ? String(params.errorMessage) : undefined;

      if (!taskId || !agentId || !action) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"));
        return;
      }

      // 权限检查 - 验证智能助手是此任务的执行者
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 以下角色均可写工作日志：
      // 1. 执行者（assignees）
      // 2. 上级管理者（supervisorId）
      // 3. 任务创建者（creatorId）
      // 4. 子任务的父任务执行者（协作场景：子任务汇报进度）
      // 5. system 账号（内部自动化操作）
      const isAssignee = (task.assignees ?? []).some((a) => a.id === agentId);
      const isSupervisor = task.supervisorId === agentId;
      const isCreator = task.creatorId === agentId;
      const isSystem = agentId === "system";

      // 兼容：如果是子任务，父任务的执行者也有权写日志（跨级汇报）
      let isParentTaskAssignee = false;
      if (!isAssignee && !isSupervisor && !isCreator && !isSystem && task.parentTaskId) {
        const parentTask = await storage.getTask(task.parentTaskId);
        if (parentTask) {
          isParentTaskAssignee = (parentTask.assignees ?? []).some((a) => a.id === agentId);
        }
      }

      if (!isAssignee && !isSupervisor && !isCreator && !isSystem && !isParentTaskAssignee) {
        // 记录详细信息便于排查，避免 Agent 反复重试导致系统卡顿
        console.warn(
          `[task.worklog.add] 权限拒绝: agentId=${agentId} taskId=${taskId} assignees=${(task.assignees ?? []).map((a) => a.id).join(",")} supervisorId=${task.supervisorId ?? "none"} creatorId=${task.creatorId ?? "none"}`,
        );
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `智能助手(${agentId})不是此任务的执行者或管理者，无法写入工作日志`,
          ),
        );
        return;
      }

      const worklogId = `worklog-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const newWorklog: AgentWorkLog = {
        id: worklogId,
        taskId,
        agentId,
        action,
        details,
        duration,
        result,
        errorMessage,
        createdAt: Date.now(),
      };

      await storage.addWorklog(newWorklog);

      // 写入 worklog 同步刷新 lastActivityAt，防止调度器将正在工作的 Agent 误判为僵尸
      // 等同于隐式 task_ping_activity：只要 Agent 在记录进展，就不会被误判超时
      if (task.status === "in-progress") {
        await storage.updateTask(taskId, {
          timeTracking: {
            ...(task.timeTracking ?? { timeSpent: 0 }),
            lastActivityAt: Date.now(),
          },
        });
      }

      respond(true, newWorklog, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to add worklog: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.subtask.create - 创建子任务
   */
  "task.subtask.create": async ({ params, respond }) => {
    try {
      const parentTaskId = params?.parentTaskId ? String(params.parentTaskId) : "";
      const title = params?.title ? String(params.title) : "";
      const description = params?.description ? String(params.description) : "";
      // creatorId 由工具层传入，不再 fallback 到不存在的 "system"
      const creatorId = params?.creatorId ? String(params.creatorId) : "";
      const assigneeIds = params?.assigneeIds ? (params.assigneeIds as string[]) : [];
      const priority = params?.priority ? (String(params.priority) as TaskPriority) : "medium";

      if (!parentTaskId || !title) {
        const missing = [];
        if (!parentTaskId) {
          missing.push('"parentTaskId" (parent task ID)');
        }
        if (!title) {
          missing.push('"title" (subtask title, required, 1-200 characters)');
        }
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Missing required parameters: ${missing.join(", ")}. Example: task.subtask.create({ parentTaskId: "task_xxx", title: "子任务标题", assigneeIds: ["agent-id"] })`,
          ),
        );
        return;
      }

      // 获取父任务
      const parentTask = await storage.getTask(parentTaskId);

      if (!parentTask) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "父任务不存在"));
        return;
      }

      // 权限检查 - 验证用户有权限访问父任务
      const requesterId = params?.requesterId ? String(params.requesterId) : creatorId;
      const parentTaskAssigneeIds = parentTask.assignees.map((a) => a.id);
      const permCheck = checkTaskAccess(
        parentTask.creatorId,
        parentTaskAssigneeIds,
        parentTask.organizationId,
        parentTask.teamId,
        requesterId,
        undefined,
        undefined,
        parentTask.supervisorId,
      );
      if (!permCheck.allowed) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限创建子任务"),
        );
        return;
      }

      // 创建子任务（继承父任务的组织/团队/项目）
      const subtaskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const assignees: TaskAssignee[] = assigneeIds.map((assigneeId, index) => ({
        id: assigneeId,
        type: "agent" as MemberType,
        role: index === 0 ? "owner" : "assignee",
        assignedAt: Date.now(),
        assignedBy: creatorId,
      }));

      const subtask: Task = {
        id: subtaskId,
        title,
        description,
        parentTaskId,
        creatorId,
        creatorType: "agent",
        assignees,
        status: "todo",
        priority,
        organizationId: parentTask.organizationId,
        teamId: parentTask.teamId,
        projectId: parentTask.projectId,
        // 继承父任务的 supervisorId（主控 agent 分配时会自动传入）
        supervisorId: parentTask.supervisorId,
        timeTracking: {
          timeSpent: 0,
          lastActivityAt: Date.now(),
        },
        createdAt: Date.now(),
      };

      // 存储子任务
      await storage.createTask(subtask);

      // 更新父任务的子任务列表
      const parentSubtasks = parentTask.subtasks || [];
      parentSubtasks.push(subtaskId);
      await storage.updateTask(parentTaskId, { subtasks: parentSubtasks });

      respond(true, subtask, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create subtask: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.dependency.add - 添加依赖关系
   */
  "task.dependency.add": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      const dependsOnTaskId = params?.dependsOnTaskId ? String(params.dependsOnTaskId) : "";
      const dependencyType = params?.dependencyType ? String(params.dependencyType) : "blocks";
      const description = params?.description ? String(params.description) : undefined;
      const createdBy = params?.createdBy ? String(params.createdBy) : "system";

      if (!taskId || !dependsOnTaskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"));
        return;
      }

      // 验证依赖类型
      if (!["blocks", "is-blocked-by", "relates-to", "duplicates"].includes(dependencyType)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无效的依赖类型"));
        return;
      }

      // 验证两个任务都存在
      const task = await storage.getTask(taskId);
      const dependsOnTask = await storage.getTask(dependsOnTaskId);

      if (!task || !dependsOnTask) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 验证用户有权限访问两个任务
      const requesterId = params?.requesterId ? String(params.requesterId) : createdBy;

      // 检查主任务访问权限
      const taskAssigneeIds = (task.assignees ?? []).map((a) => a.id);
      const taskPermCheck = checkTaskAccess(
        task.creatorId,
        taskAssigneeIds,
        task.organizationId,
        task.teamId,
        requesterId,
        undefined,
        undefined,
        task.supervisorId,
      );
      if (!taskPermCheck.allowed) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无权限访问主任务"));
        return;
      }

      // 检查依赖任务访问权限
      const depTaskAssigneeIds = (dependsOnTask.assignees ?? []).map((a) => a.id);
      const depTaskPermCheck = checkTaskAccess(
        dependsOnTask.creatorId,
        depTaskAssigneeIds,
        dependsOnTask.organizationId,
        dependsOnTask.teamId,
        requesterId,
        undefined,
        undefined,
        dependsOnTask.supervisorId,
      );
      if (!depTaskPermCheck.allowed) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无权限访问依赖任务"));
        return;
      }

      // 检查是否会造成循环依赖
      const hasCircular = await storage.checkCircularDependency(taskId, dependsOnTaskId);
      if (hasCircular) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "检测到循环依赖，无法添加"),
        );
        return;
      }

      // 创建依赖关系
      const dependencyId = `dep-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const dependency: TaskDependency = {
        id: dependencyId,
        taskId,
        dependsOnTaskId,
        dependencyType: dependencyType as "blocks" | "is-blocked-by" | "relates-to" | "duplicates",
        description,
        createdAt: Date.now(),
        createdBy,
      };

      await storage.addTaskDependency(dependency);

      respond(true, dependency, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to add dependency: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.block - 标记任务被阻塞
   */
  /**
   * task.complete - 标记任务为已完成（快捷方式）
   */
  "task.complete": async ({ params, respond }) => {
    try {
      // 兼容工具端传 id 或 taskId
      const taskId =
        (params?.taskId ? String(params.taskId) : "") || (params?.id ? String(params.id) : "");

      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务ID不能为空"));
        return;
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      const completedAt = typeof params?.completedAt === "number" ? params.completedAt : Date.now();
      const completedBy = params?.completedBy ? String(params.completedBy) : undefined;
      const note = params?.note ? String(params.note) : undefined;
      // force=true 允许管理员/人类绕过质量门禁（用于手动覆盖）
      const force = params?.force === true || params?.force === "true";

      // === Harness Feedback Sensor（P1）: 计算型产出物验证 ===
      // 在写入 done 之前，验证任务是否有真实可验证产出。
      // 参考 Harness Engineering：Computational Feedback Sensor，在任务生命周期左侧拦截低质量交付。
      if (!force) {
        // 补充关联数据（workLogs/attachments/comments）以供验证器使用
        const worklogs = await storage.getTaskWorklogs(taskId);
        const attachments = await storage.getTaskAttachments(taskId);
        const comments = await storage.getTaskComments(taskId);
        const taskWithData = {
          ...task,
          workLogs: worklogs,
          attachments,
          comments,
        };
        const progressCheck = validateRealProgress(taskWithData);
        if (progressCheck.quality === "fake") {
          const issueLines = [
            `[TASK COMPLETION BLOCKED — Harness Quality Gate]`,
            ``,
            `Task "${task.title}" cannot be marked as done because no verifiable output was detected.`,
            ``,
            `Quality: ${progressCheck.quality}`,
            `Evidence found: ${progressCheck.evidence.length === 0 ? "none" : progressCheck.evidence.join(", ")}`,
            ``,
            `To complete this task, you MUST first provide at least one of:`,
            `  1. A worklog entry (task.worklog.add) with result=success and specific details`,
            `  2. An attachment (task.attachment.add) proving deliverable exists`,
            `  3. A comment (task.comment.add) with concrete outcome description`,
            ``,
            `After adding evidence, call task.complete again.`,
            `If you believe this is a false positive (e.g. task was exploratory/recon), pass force=true to override.`,
          ].join("\n");
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, issueLines));
          return;
        }
      }

      const updatedTask = await storage.updateTask(taskId, {
        status: "done" as TaskStatus,
        completedAt,
        ...(note ? { completionNote: note } : {}),
      });

      respond(
        true,
        {
          ...updatedTask,
          completedBy,
          completedAt,
          note,
        },
        undefined,
      );

      // === 任务完成后自动驱动该 agent 的下一条 todo 任务 ===
      // 从 assignees 中取第一个 assignee，触发任务驱动流水线
      const primaryAssignee = (updatedTask?.assignees ?? [])[0]?.id;
      if (primaryAssignee) {
        const { normalizeAgentId: normId } = await import("../../routing/session-key.js");
        // 异步触发，不阻塞 respond
        scheduleNextTaskForAgent(normId(primaryAssignee), taskId, updatedTask?.projectId).catch(
          (schedErr) => {
            console.warn(`[task.complete] scheduleNextTask failed: ${String(schedErr)}`);
          },
        );
      }

      // === KPI 写回闭环（Hermes v0.8.0 cron KPI 借鉴）===
      // 任务完成时，自动将 success 结果写入执行 Agent 的性能画像。
      // 这是 KPI 闭环的入口，供调度器下次择优时使用。
      {
        const kpiAssigneeId = primaryAssignee ?? task.creatorId ?? undefined;
        if (kpiAssigneeId) {
          const kpiTitle = updatedTask?.title ?? task.title ?? "";
          const kpiDesc = updatedTask?.description ?? task.description ?? "";
          const kpiTaskType = inferTaskType(
            kpiTitle + " " + kpiDesc.slice(0, 100),
            updatedTask?.tags ?? task.tags ?? [],
          );
          recordPerfOutcome(kpiAssigneeId, kpiTaskType, "success");
        }
      }

      // === 任务完成后通知 supervisor ===
      // 如同自然人完成工作后主动向上级汇报成果
      const completedSupervisorId = updatedTask?.supervisorId ?? updatedTask?.creatorId;
      if (
        completedSupervisorId &&
        completedSupervisorId !== "system" &&
        completedSupervisorId !== primaryAssignee
      ) {
        const assigneeName = primaryAssignee ?? "unknown";
        const completionNote = note ? `\n\nCompletion note: ${note}` : "";
        const supervisorMsg = [
          `[TASK COMPLETED] Agent ${assigneeName} has completed a task assigned to them.`,
          ``,
          `Task ID: ${taskId}`,
          `Title: ${updatedTask?.title ?? taskId}`,
          `Priority: ${updatedTask?.priority ?? "medium"}`,
          updatedTask?.type ? `Type: ${updatedTask.type}` : null,
          updatedTask?.projectId ? `Project: ${updatedTask.projectId}` : null,
          `Completed at: ${new Date(completedAt).toISOString()}`,
          completionNote,
          ``,
          `You may review this task's worklogs or assign a follow-up task if needed.`,
        ]
          .filter((l) => l !== null)
          .join("\n");
        notifySupervisor(completedSupervisorId, supervisorMsg, `task-completed:${taskId}`);
      }

      // === 任务完成后即时归档：将 done 任务移入冷存储，保持热存储精简 ===
      storage.archiveOldTasks().catch((archErr) => {
        console.warn(`[task.complete] archiveOldTasks failed: ${String(archErr)}`);
      });

      // === 自动同步 PROJECT_CONFIG.json Sprint 快照 ===
      // 根本问题：task.complete 只写 SQLite，PROJECT_CONFIG.json 是独立数据源，
      // 前端进度页面读的是 PROJECT_CONFIG.json，两者不同步导致进度永远不更新。
      // 修复：任务完成时，如果任务属于某个项目，自动将 PROJECT_CONFIG.json
      // 中对应 sprint task 的 status 更新为 done，并重算整体 progress。
      const completedProjectId = updatedTask?.projectId ?? task.projectId;
      if (completedProjectId) {
        try {
          const pathMod = await import("path");
          const fsMod = await import("fs");
          const { buildProjectContext, readProjectConfig, calcProjectProgress } =
            await import("../../utils/project-context.js");
          const ctx = buildProjectContext(completedProjectId);
          const configPath = pathMod.join(ctx.workspacePath, "PROJECT_CONFIG.json");
          const cfg = readProjectConfig(ctx.workspacePath);
          if (cfg) {
            const sprints = cfg.sprints ?? cfg.milestones ?? [];
            let patched = false;
            const now = Date.now();
            for (const sprint of sprints) {
              const idx = sprint.tasks.findIndex((t) => t.id === taskId);
              if (idx >= 0) {
                sprint.tasks[idx] = {
                  ...sprint.tasks[idx],
                  status: "done",
                  completedAt: completedAt,
                  updatedAt: now,
                };
                patched = true;
                break;
              }
            }
            if (patched) {
              if (cfg.sprints) cfg.sprints = sprints;
              else cfg.milestones = sprints;
              cfg.progress = calcProjectProgress(sprints);
              cfg.progressUpdatedAt = now;
              fsMod.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
              console.log(
                `[task.complete] Sprint snapshot synced: task ${taskId} → done in project ${completedProjectId} (progress=${cfg.progress}%)`,
              );
            }
          }
        } catch (syncErr) {
          // 同步失败不阻塞主流程，仅记录警告
          console.warn(`[task.complete] sprint snapshot sync failed: ${String(syncErr)}`);
        }
      }

      // === B1: 子任务状态汇聚 — 对标 Linear 2026 子问题进度卷积 ===
      // 当所有子任务完成时，自动推进父任务进入 review 状态
      const parentTaskIdForAgg = task.parentTaskId;
      if (parentTaskIdForAgg) {
        try {
          const parentTask = await storage.getTask(parentTaskIdForAgg);
          if (parentTask && parentTask.status !== "done" && parentTask.status !== "cancelled") {
            const siblings = await storage.listTasks({ parentTaskId: parentTaskIdForAgg, limit: 200 });
            const allDone = siblings.length > 0 && siblings.every((s) => s.id === taskId ? true : s.status === "done" || s.status === "cancelled");
            if (allDone && parentTask.status !== "review") {
              await storage.updateTask(parentTaskIdForAgg, { status: "review" as TaskStatus });
              const parentSupervisor = parentTask.supervisorId ?? parentTask.creatorId;
              if (parentSupervisor && parentSupervisor !== "system") {
                notifySupervisor(parentSupervisor,
                  `[PARENT TASK READY] All subtasks of "${parentTask.title}" are complete. Parent task moved to 'review'. Please verify and close if ready.`,
                  `parent-review:${parentTaskIdForAgg}`);
              }
            }
          }
        } catch {
          // 子任务汇聚失败不阻塞主流程
        }
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to complete task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.stats - 获取任务统计数据
   * 供前端仪表盘展示和 AI agent 健康检查使用
   */
  "task.stats": async ({ params, respond }) => {
    try {
      const organizationId = params?.organizationId ? String(params.organizationId) : undefined;
      const teamId = params?.teamId ? String(params.teamId) : undefined;
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const assigneeId = params?.assigneeId ? String(params.assigneeId) : undefined;

      const stats = await storage.getTaskStats({
        organizationId,
        teamId,
        projectId,
        assigneeId,
      });

      respond(true, stats, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get task stats: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  "task.block": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      const blockedByTaskId = params?.blockedByTaskId ? String(params.blockedByTaskId) : undefined;
      const reason = params?.reason ? String(params.reason) : "";
      const blockedBy = params?.blockedBy ? String(params.blockedBy) : "system";

      if (!taskId || !reason) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"));
        return;
      }

      // 获取任务
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查 - 验证用户有权限访问任务
      const requesterId = params?.requesterId ? String(params.requesterId) : blockedBy;
      const permCheck = checkTaskModifyAccess(
        task.creatorId,
        (task.assignees ?? []).filter((a) => a.role === "owner").map((a) => a.id),
        task.organizationId,
        task.teamId,
        requesterId,
        undefined,
        undefined,
      );
      if (!permCheck.allowed) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, permCheck.reason || "无权限阻塞此任务"),
        );
        return;
      }

      // 更新任务状态为 blocked
      await storage.updateTask(taskId, { status: "blocked" });

      // 如果指定了 blockedByTaskId，创建依赖关系
      if (blockedByTaskId) {
        const dependencyId = `dep-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        await storage.addTaskDependency({
          id: dependencyId,
          taskId,
          dependsOnTaskId: blockedByTaskId,
          dependencyType: "is-blocked-by",
          description: reason,
          createdAt: Date.now(),
          createdBy: blockedBy,
        });
      }

      // 记录阻塞原因（通过添加系统评论）
      const blockComment: TaskComment = {
        id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        taskId,
        authorId: "system",
        authorType: "agent",
        content: `任务被阻塞: ${reason}${blockedByTaskId ? ` (被任务 ${blockedByTaskId} 阻塞)` : ""}`,
        createdAt: Date.now(),
      };
      await storage.addTaskComment(blockComment);

      // === 任务被阻塞时主动通知 supervisor ===
      // 如同自然人被卡住了不会沉默，会立刻找上级说明情况
      const blockSupervisorId = task.supervisorId ?? task.creatorId;
      if (blockSupervisorId && blockSupervisorId !== "system") {
        const assigneeIds = (task.assignees ?? []).map((a) => a.id).join(", ") || "unknown";
        const blockNotice = [
          `[TASK BLOCKED] A task assigned to ${assigneeIds} is now blocked and needs your attention.`,
          ``,
          `Task ID: ${taskId}`,
          `Title: ${task.title}`,
          `Priority: ${task.priority}`,
          task.type ? `Type: ${task.type}` : null,
          task.projectId ? `Project: ${task.projectId}` : null,
          ``,
          `Blocked by: ${blockedBy}`,
          `Reason: ${reason}`,
          blockedByTaskId ? `Blocking task: ${blockedByTaskId}` : null,
          ``,
          `Please review and take action: resolve the blocker, reassign, or cancel the task.`,
        ]
          .filter((l) => l !== null)
          .join("\n");
        notifySupervisor(blockSupervisorId, blockNotice, `task-blocked:${taskId}`);
      } else {
        console.log(`[Task Notification] Task ${taskId} is blocked: ${reason}`);
      }

      const result = {
        taskId,
        status: "blocked" as TaskStatus,
        blockedByTaskId,
        reason,
        blockedBy,
        updatedAt: Date.now(),
      };

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to block task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.ping — 刷新任务活跃度时间戳（Hermes v0.8.0 活动感知超时借鉴）
   *
   * Agent 在执行长时间任务时，应定期调用此接口刷新 lastActivityAt，
   * 避免被调度器误判为僵尸任务而重新活化。
   *
   * 如实现 Hermes 的设计语义：只要有工具调用活动就不超时。
   */
  /**
   * task.progress_note.append - 追加任务进展笔记
   *
   * 双轨写入：
   *   1. SQLite json_blob（权威数据源，含冗余压缩控制）
   *   2. {workspacePath}/.notes/{taskId}.md 文件镜像（可选，按任务归档，超限自动按月归档）
   *
   * 权限：任务执行者、主管、创建者均可写入（同 worklog 策略）
   */
  "task.progress_note.append": async ({ params, respond }) => {
    try {
      const taskId =
        (params?.taskId ? String(params.taskId) : "") || (params?.id ? String(params.id) : "");
      const agentId = params?.agentId ? String(params.agentId) : "";
      const content = params?.content ? String(params.content) : "";
      const authorType = params?.authorType
        ? (String(params.authorType) as "agent" | "human")
        : "agent";

      if (!taskId || !agentId || !content) {
        const missing = [];
        if (!taskId) {
          missing.push('"taskId"');
        }
        if (!agentId) {
          missing.push('"agentId"');
        }
        if (!content) {
          missing.push('"content"');
        }
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `缺少必需参数：${missing.join(", ")}`),
        );
        return;
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查：执行者 / 主管 / 创建者 / system 均可写入进展笔记
      const isAssignee = (task.assignees ?? []).some((a) => a.id === agentId);
      const isSupervisor = task.supervisorId === agentId;
      const isCreator = task.creatorId === agentId;
      const isSystem = agentId === "system";
      if (!isAssignee && !isSupervisor && !isCreator && !isSystem) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Agent(${agentId}) 不是任务 ${taskId} 的执行者或管理者，无法写入进展笔记`,
          ),
        );
        return;
      }

      // 自动解析 workspaceDir（若任务关联项目则同步写入文件镜像）
      let workspaceDir: string | undefined;
      if (task.projectId) {
        try {
          const ctx = buildProjectContext(task.projectId);
          workspaceDir = ctx.workspacePath;
        } catch {
          // 无法解析项目上下文时，静默降级，仅写 SQLite
        }
      }

      const updatedTask = await storage.appendProgressNote({
        taskId,
        content,
        authorId: agentId,
        authorType,
        workspaceDir,
        taskTitle: task.title,
      });

      respond(
        true,
        {
          taskId,
          noteCount: updatedTask?.progressNotes?.length ?? 0,
          fileWritten: Boolean(workspaceDir),
          message: `进展笔记已写入任务 ${taskId}${workspaceDir ? "（含 .notes 文件镜像）" : ""}`,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to append progress note: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  "task.ping": async ({ params, respond }) => {
    try {
      const taskId =
        (params?.taskId ? String(params.taskId) : "") || (params?.id ? String(params.id) : "");
      const agentId = params?.agentId ? String(params.agentId) : "";

      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 不能为空"));
        return;
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      // 权限检查：仅执行者、主管或创建者可刺激活跃度
      if (agentId) {
        const isAssignee = (task.assignees ?? []).some((a) => a.id === agentId);
        const isSupervisor = task.supervisorId === agentId;
        const isCreator = task.creatorId === agentId;
        const isSystem = agentId === "system";
        if (!isAssignee && !isSupervisor && !isCreator && !isSystem) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `Agent(${agentId}) 没有权限刺激任务 ${taskId} 的活跃度`,
            ),
          );
          return;
        }
      }

      const now = Date.now();
      await storage.updateTask(taskId, {
        timeTracking: {
          ...(task.timeTracking ?? { timeSpent: 0 }), // 防御 undefined
          lastActivityAt: now,
        },
      });

      respond(
        true,
        {
          taskId,
          lastActivityAt: now,
          message: "Task activity refreshed — inactivity timeout reset.",
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to ping task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.reset - 强制重置任务到非终态状态（绕过状态机）
   *
   * 适用场景：
   * - 任务被误标为 done/cancelled，需重新打开
   * - 任务陷入 blocked 死锁无法自行解除
   * - 系统异常导致任务进入错误状态
   *
   * 目标状态 targetStatus 可选：todo（默认）/ in-progress / blocked
   * 权限：任务创建者、主管、系统均可调用
   */
  "task.reset": async ({ params, respond }) => {
    try {
      const taskId =
        (params?.taskId ? String(params.taskId) : "") || (params?.id ? String(params.id) : "");
      const targetStatus = (params?.targetStatus
        ? String(params.targetStatus)
        : "todo") as "todo" | "in-progress" | "blocked";
      const reason = params?.reason ? String(params.reason) : undefined;
      const actor = params?.actor ? String(params.actor) : "system";

      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 不能为空"));
        return;
      }

      if (!["todo", "in-progress", "blocked"].includes(targetStatus)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `无效的目标状态 "${targetStatus}"，允许值：todo / in-progress / blocked`,
          ),
        );
        return;
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "任务不存在"));
        return;
      }

      const previousStatus = task.status;
      const updatedTask = await storage.forceResetTask(taskId, targetStatus, actor, reason);

      respond(
        true,
        {
          taskId,
          previousStatus,
          newStatus: targetStatus,
          reason: reason ?? "手动重置",
          resetBy: actor,
          resetAt: Date.now(),
          task: updatedTask,
        },
        undefined,
      );

      // 通知主控任务被重置（Task Reset Event）
      const resetSupRaw = task.supervisorId ?? task.creatorId;
      if (resetSupRaw && resetSupRaw !== "system") {
        const resetMsg = [
          `[TASK RESET] 🔄 任务已被强制重置`,
          ``,
          `Task ID: ${taskId}`,
          task.title ? `标题: ${task.title}` : null,
          `重置: ${previousStatus} → ${targetStatus}`,
          task.projectId ? `项目: ${task.projectId}` : null,
          reason ? `原因: ${reason}` : null,
          `操作者: ${actor}`,
          ``,
          `任务已回到 ${targetStatus} 状态，如有需要请重新分配或处理。`,
        ]
          .filter(Boolean)
          .join("\n");
        notifySupervisor(resetSupRaw, resetMsg, `task:reset:${taskId}`);
      }

      // 通知执行人任务被重置
      for (const assignee of task.assignees ?? []) {
        if (!assignee.id || assignee.id === "system" || assignee.id === resetSupRaw) {continue;}
        const assigneeResetMsg = [
          `[TASK RESET] 🔄 你的任务已被重置`,
          ``,
          `Task ID: ${taskId}`,
          task.title ? `标题: ${task.title}` : null,
          `重置: ${previousStatus} → ${targetStatus}`,
          reason ? `原因: ${reason}` : null,
          `操作者: ${actor}`,
          ``,
          targetStatus === "todo"
            ? `任务已重置为待开始，请停止当前进行中的执行并等待重新分配。`
            : `任务已重置为 ${targetStatus}，请確认下一步操作。`,
        ]
          .filter(Boolean)
          .join("\n");
        notifyAssignee(assignee.id, assigneeResetMsg, `task:reset:${taskId}`);
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to reset task: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.trace - 获取任务追踪数据（可观测性链路回放）
   *
   * 返回指定任务的完整聊天记录：
   *   - taskAuditEvents: 任务字段变更/状态转换/分配变更武勇时间线（task-events.jsonl）
   *   - toolChainRecords: 该任务关联 runId 的完整 prompt→toolcall→output→validation 审计链（tool-chain-YYYYMMDD.jsonl）
   *
   * 参数：
   *   taskId   - 必填，任务 ID
   *   runIds   - 可选，指定要回放的 runId 列表（不传则尝试匹配全部日期）
   *   days     - 可选，检索最近 N 天的审计日志（默认 7 天）
   */
  "task.trace": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      if (!taskId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, '"taskId" is required'),
        );
        return;
      }

      const runIdsRaw = Array.isArray(params?.runIds) ? (params.runIds as string[]) : [];
      const runIds = runIdsRaw.map((r) => String(r)).filter(Boolean);
      const days = typeof params?.days === "number" && params.days > 0 ? Math.min(params.days, 30) : 7;

      // 1. 任务字段变更/状态转换时间线
      const taskAuditEvents = await getTaskTimeline(taskId);

      // 2. 工具链审计记录
      //    策略：
      //    a) 若调用方传入了 runIds，直接按 runId 查询
      //    b) 否则扫描最近 days 天的所有审计文件，过滤属于该任务的记录
      //    (通过 meta.taskId 或工作日志关联)
      let toolChainRecords: unknown[] = [];

      if (runIds.length > 0) {
        // 直接按 runIds 查询
        const allRecords = await Promise.all(runIds.map((runId) => getToolChainTrace(runId)));
        toolChainRecords = allRecords.flat().toSorted(
          (a, b) => (a as { timestamp: number }).timestamp - (b as { timestamp: number }).timestamp
        );
      } else {
        // 扫描最近 N 天的所有审计文件
        const allFiles = await listAuditFiles();
        // 只取最近 days 天的文件
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const recentFiles = allFiles.filter((f) => {
          // 文件名格式: tool-chain-YYYYMMDD.jsonl
          const m = /tool-chain-(\d{8})\.jsonl$/.exec(f);
          if (!m) {return false;}
          const dateStr = m[1];
          const year = parseInt(dateStr.slice(0, 4), 10);
          const month = parseInt(dateStr.slice(4, 6), 10) - 1;
          const day = parseInt(dateStr.slice(6, 8), 10);
          return new Date(year, month, day).getTime() >= cutoff;
        });

        // 读取这些文件中 meta.taskId 匹配的记录
        const { readFile } = await import("fs/promises");
        for (const filePath of recentFiles) {
          try {
            const content = await readFile(filePath, { encoding: "utf-8" });
            for (const line of content.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed) {continue;}
              try {
                const rec = JSON.parse(trimmed) as Record<string, unknown>;
                if ((rec.meta as Record<string, unknown>)?.taskId === taskId) {
                  toolChainRecords.push(rec);
                }
              } catch {
                // 跳过损坏行
              }
            }
          } catch {
            // 文件不存在或无法读取
          }
        }
        toolChainRecords.sort(
          (a, b) => (a as { timestamp: number }).timestamp - (b as { timestamp: number }).timestamp
        );
      }

      respond(true, {
        taskId,
        taskAuditEvents,
        toolChainRecords,
        summary: {
          auditEventCount: taskAuditEvents.length,
          toolCallCount: toolChainRecords.filter(
            (r) => (r as { phase: string }).phase === "tool_start"
          ).length,
          toolErrorCount: toolChainRecords.filter(
            (r) => (r as { phase: string }).phase === "tool_error"
          ).length,
          validationFailCount: toolChainRecords.filter(
            (r) => (r as { phase: string }).phase === "validation_fail"
          ).length,
          retryCount: toolChainRecords.filter(
            (r) => (r as { phase: string }).phase === "retry_scheduled"
          ).length,
        },
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get task trace: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * tasks.flowMetrics — Flow 度量指标
   *
   * 计算 CycleTime / LeadTime / Throughput / FlowEfficiency / WIP
   * 基于一批任务的完成时间数据聚合，对齐 DORA 2025 下一代交付指标。
   *
   * 参数:
   * - projectId: 项目 ID（可选，用于过滤任务）
   * - windowDays: 统计窗口天数（默认 30）
   * - wipLimits: 各状态的 WIP 限制对象（可选）
   */
  "tasks.flowMetrics": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const windowDays = params?.windowDays ? Math.max(1, Number(params.windowDays)) : 30;
      const wipLimits = params?.wipLimits as Record<string, number> | undefined;

      const tasks = await storage.listTasks({
        projectId,
        limit: 5000,
      });

      const { calcFlowMetrics, formatFlowMetricsSummary } = await import("../../tasks/flow-metrics.js");

      const now = Date.now();
      const result = calcFlowMetrics(
        tasks,
        {
          windowMs: {
            from: now - windowDays * 86_400_000,
            to: now,
          },
          wipLimits: wipLimits as Partial<Record<import("../../tasks/types.js").TaskStatus, number>> | undefined,
        },
      );

      respond(true, {
        ...result,
        // Map 不可 JSON 序列化，转成 plain object
        allNodes: undefined,
        summary: formatFlowMetricsSummary(result),
      }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to calc flow metrics: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * tasks.criticalPath — 关键路径分析
   *
   * 基于任务依赖关系图（dependencies 字段）做拓扑排序 + 最长路径计算（CPM）
   * 识别浦动=0 的关键任务，辅助 coordinator 优先护马。
   *
   * 参数:
   * - projectId: 项目 ID
   * - includeCompleted: 是否包含已完成任务（默认 false）
   * - hoursPerSP: 每个故事点对应小时数（默认 4）
   */
  "tasks.criticalPath": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const includeCompleted = params?.includeCompleted === true;
      const hoursPerSP = params?.hoursPerSP ? Number(params.hoursPerSP) : 4;
      const nearCriticalThresholdHours = params?.nearCriticalThresholdHours
        ? Number(params.nearCriticalThresholdHours)
        : 8;

      const tasks = await storage.listTasks({
        projectId,
        limit: 2000,
      });

      const { calcCriticalPath, formatCriticalPathReport } = await import("../../tasks/critical-path.js");

      const result = calcCriticalPath(tasks, {
        includeCompleted,
        hoursPerSP,
        nearCriticalThresholdHours,
      });

      respond(true, {
        hasCycle: result.hasCycle,
        cycleTaskIds: result.cycleTaskIds,
        projectDurationHours: result.projectDurationHours,
        criticalTaskIds: result.criticalTaskIds,
        nearCriticalTaskIds: result.nearCriticalTaskIds,
        criticalPath: result.criticalPath,
        summary: result.summary,
        report: formatCriticalPathReport(result),
      }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to calc critical path: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * tasks.health — 任务健康度评分
   *
   * 使用 calcBatchTaskHealth 计算一批任务的健康度，返回 green/yellow/red 三级与分数。
   *
   * 参数:
   * - projectId: 项目 ID
   * - taskIds: 指定任务 IDs（可选）
   */
  "tasks.health": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const taskIds = Array.isArray(params?.taskIds)
        ? (params.taskIds as string[])
        : undefined;

      let tasks: import("../../tasks/types.js").Task[];
      if (taskIds && taskIds.length > 0) {
        const results = await Promise.all(
          taskIds.map((id) => storage.getTask(id).catch(() => null)),
        );
        tasks = results.filter((t): t is import("../../tasks/types.js").Task => t !== null);
      } else {
        tasks = await storage.listTasks({
          projectId,
          limit: 1000,
        });
      }

      const { calcBatchTaskHealth, summarizeHealthScores } = await import("../../tasks/task-health.js");
      const scores = calcBatchTaskHealth(tasks);
      const summary = summarizeHealthScores(scores);

      // Map 转 plain object
      const scoresObj: Record<string, unknown> = {};
      for (const [id, score] of scores.entries()) {
        scoresObj[id] = score;
      }

      respond(true, { summary, scores: scoresObj }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to calc task health: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * tasks.okr.upsert — 创建或更新 OKR Objective
   *
   * 完全实现 Objective + KeyResult 的 CRUD，补全 objectiveId/keyResultId 孤儿字段关联。
   */
  "tasks.okr.upsert": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext } = await import("../../utils/project-context.js");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);

      const { upsertObjective, upsertKeyResult } = await import("../../tasks/okr-manager.js");

      const objectiveId = params?.id ? String(params.id) : undefined;
      const title = params?.title ? String(params.title) : "";
      const timeframe = (params?.timeframe as "short" | "medium" | "long") ?? "medium";

      if (!title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title is required"));
        return;
      }

      const objective = upsertObjective(ctx.workspacePath, projectId, {
        id: objectiveId,
        title,
        description: params?.description ? String(params.description) : undefined,
        timeframe,
        targetDate: params?.targetDate ? Number(params.targetDate) : undefined,
        parentObjectiveId: params?.parentObjectiveId ? String(params.parentObjectiveId) : undefined,
      });

      // 如果提供了 keyResult 一并创建
      const krParams = params?.keyResult as Record<string, unknown> | undefined;
      let keyResult: import("../../tasks/okr-manager.js").KeyResult | null = null;
      if (krParams && typeof krParams.description === "string") {
        keyResult = upsertKeyResult(ctx.workspacePath, projectId, objective.id, {
          id: krParams.id ? String(krParams.id) : undefined,
          description: krParams.description,
          current: krParams.current != null ? Number(krParams.current) : undefined,
          target: krParams.target != null ? Number(krParams.target) : undefined,
          unit: krParams.unit ? String(krParams.unit) : undefined,
          achieved: krParams.achieved === true,
        });
      }

      respond(true, { success: true, objective, keyResult }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to upsert OKR objective: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * task.ac.verify — 逐条更新验收标准通过状态
   *
   * 业界实践（Linear/Notion）：每条 AC 独立可打勾，不需要全量重写整个数组。
   * 支持两种模式：
   *   1. 单条更新：传入 criterionId + passes
   *   2. 批量更新：传入 updates 数组 [{criterionId, passes, note}]
   */
  "task.ac.verify": async ({ params, respond }) => {
    try {
      const taskId =
        (params?.taskId ? String(params.taskId) : "") ||
        (params?.id ? String(params.id) : "");
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId is required"));
        return;
      }
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Task not found"));
        return;
      }
      const verifiedBy = params?.verifiedBy ? String(params.verifiedBy) : "system";
      const now = Date.now();
      type CriterionUpdate = { criterionId: string; passes: boolean; note?: string };
      const updateMap = new Map<string, { passes: boolean; note?: string }>();
      if (params?.criterionId) {
        const criterionId = String(params.criterionId);
        const passes = params?.passes === true || params?.passes === "true";
        const note = params?.note ? String(params.note) : undefined;
        updateMap.set(criterionId, { passes, note });
      }
      if (Array.isArray(params?.updates)) {
        for (const u of params.updates as CriterionUpdate[]) {
          if (u?.criterionId) {
            updateMap.set(String(u.criterionId), {
              passes:  u.passes || (u.passes as unknown) === "true",
              note: u.note ? String(u.note) : undefined,
            });
          }
        }
      }
      if (updateMap.size === 0) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Provide either criterionId+passes (single) or updates[] (batch)"));
        return;
      }
      type ACEntry = { id: string; description: string; passes: boolean; verifiedAt?: number; verifiedBy?: string; note?: string; createdAt?: number };
      const existingCriteria = (task.acceptanceCriteria ?? []) as ACEntry[];
      let updatedCount = 0;
      const notFoundIds: string[] = [];
      const newCriteria = existingCriteria.map((c) => {
        const update = updateMap.get(c.id);
        if (!update) {return c;}
        updatedCount++;
        return { ...c, passes: update.passes, verifiedAt: now, verifiedBy, ...(update.note ? { note: update.note } : {}) };
      });
      for (const cid of updateMap.keys()) {
        if (!existingCriteria.some((c) => c.id === cid)) {notFoundIds.push(cid);}
      }
      await storage.updateTask(taskId, { acceptanceCriteria: newCriteria as Task["acceptanceCriteria"] });
      const allPassed = newCriteria.length > 0 && newCriteria.every((c) => c.passes);
      const passedCount = newCriteria.filter((c) => c.passes).length;
      respond(true, {
        taskId,
        updatedCount,
        notFoundIds,
        acceptanceCriteria: newCriteria,
        summary: passedCount + "/" + newCriteria.length + " 项验收标准已通过",
        allPassed,
        readyToComplete: allPassed,
        ...(notFoundIds.length > 0 ? { warning: "以下 criterionId 不存在，已忽略：" + notFoundIds.join(", ") } : {}),
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to verify AC: " + String(err instanceof Error ? err.message : err)));
    }
  },

  /**
   * task.search — 任务全文/关键词搜索
   *
   * 补全 TaskFilter.keyword 能力，支持标题/描述全文检索 + 多条件组合。
   * 结果按相关度（标题匹配>tag匹配>描述匹配）降序排列。
   */
  "task.search": async ({ params, respond }) => {
    try {
      const keyword = params?.keyword ? String(params.keyword) : undefined;
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const status = params?.status ? (String(params.status) as TaskStatus) : undefined;
      const assigneeId =
        (params?.assigneeId ? String(params.assigneeId) : null) ||
        (params?.assignee ? String(params.assignee) : undefined);
      const tag = params?.tag ? String(params.tag) : undefined;
      const level = params?.level ? String(params.level) : undefined;
      const limit = params?.limit ? Math.min(Number(params.limit), 100) : 20;
      if (!keyword && !projectId && !status && !assigneeId && !tag) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "At least one search condition is required"));
        return;
      }
      const filter: Record<string, unknown> = { keyword, projectId, status, assigneeId, limit: Math.min(limit * 3, 500) };
      if (tag) {filter.tags = [tag];}
      if (level) {filter.level = level;}
      const tasks = await storage.listTasks(filter);
      let scoredTasks = tasks;
      if (keyword) {
        const kw = keyword.toLowerCase();
        scoredTasks = tasks
          .map((t) => ({
            task: t,
            score:
              (t.title?.toLowerCase().includes(kw) ? 10 : 0) +
              (t.description?.toLowerCase().includes(kw) ? 3 : 0) +
              ((t.tags ?? []).some((tg) => tg.toLowerCase().includes(kw)) ? 5 : 0),
          }))
          .filter((s) => s.score > 0)
          .toSorted((a, b) => b.score - a.score)
          .map((s) => s.task);
      }
      const resultTasks = scoredTasks.slice(0, limit);
      respond(true, {
        tasks: resultTasks,
        total: scoredTasks.length,
        keyword,
        tip: scoredTasks.length > limit ? ("共找到 " + scoredTasks.length + " 条结果，当前显示前 " + limit + " 条") : undefined,
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to search tasks: " + String(err instanceof Error ? err.message : err)));
    }
  },

  /**
   * task.timeline — 任务生命周期时间线
   *
   * 对标 Linear 的 Cycle Time Breakdown，返回任务各状态阶段驻留时长。
   * 用于识别哪个阶段耗时最长，指导流程改进。
   */
  "task.timeline": async ({ params, respond }) => {
    try {
      const taskId =
        (params?.taskId ? String(params.taskId) : "") ||
        (params?.id ? String(params.id) : "");
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId is required"));
        return;
      }
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Task not found"));
        return;
      }
      const timeline = await getTaskTimeline(taskId);
      const statusEvents = (timeline as Array<Record<string, unknown>>).filter(
        (e) => e.eventType === "status_changed" || e.eventType === "task_created" || e.eventType === "task_completed",
      );
      type StageEntry = { status: string; enteredAt: number; exitedAt?: number; durationMs?: number; durationHours?: number };
      const stages: StageEntry[] = [];
      for (let i = 0; i < statusEvents.length; i++) {
        const ev = statusEvents[i];
        const nextEv = statusEvents[i + 1];
        const enteredAt = Number(ev.timestamp ?? ev.createdAt ?? 0);
        const exitedAt = nextEv ? Number(nextEv.timestamp ?? nextEv.createdAt ?? 0) : undefined;
        const durationMs = exitedAt ? exitedAt - enteredAt : undefined;
        stages.push({
          status: String(ev.newStatus ?? ev.status ?? "unknown"),
          enteredAt,
          exitedAt,
          durationMs,
          durationHours: durationMs ? Math.round((durationMs / 3_600_000) * 10) / 10 : undefined,
        });
      }
      const createdAt = task.createdAt;
      const startedAt = task.timeTracking?.startedAt;
      const completedAt = task.completedAt;
      const leadTimeMs = completedAt ? completedAt - createdAt : undefined;
      const cycleTimeMs = completedAt && startedAt ? completedAt - startedAt : undefined;
      respond(true, {
        taskId,
        title: task.title,
        status: task.status,
        createdAt,
        startedAt,
        completedAt,
        leadTimeHours: leadTimeMs ? Math.round((leadTimeMs / 3_600_000) * 10) / 10 : undefined,
        cycleTimeHours: cycleTimeMs ? Math.round((cycleTimeMs / 3_600_000) * 10) / 10 : undefined,
        stages,
        rawEvents: timeline,
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to get task timeline: " + String(err instanceof Error ? err.message : err)));
    }
  },

  /**
   * task.quality_gate_update — CI/CD 质量门禁结果批量回写
   *
   * 允许 CI 脚本/Agent 将构建/测试结果自动回写到任务的 AC passes 字段。
   * 这是"产出好代码"配套管理的核心：让代码质量验证与任务状态双向同步。
   *
   * gates 数组每项：{ gateName, passed, detail?, matchCriterionKeywords? }
   * 内置关键词映射：tsc→类型检查AC、tests→测试AC、lint→代码规范AC
   * autoAppend=true（默认）：无匹配AC时自动追加
   * autoTransitionToReview=true：全部通过时自动流转 review
   */
  "task.quality_gate_update": async ({ params, respond }) => {
    try {
      const taskId =
        (params?.taskId ? String(params.taskId) : "") ||
        (params?.id ? String(params.id) : "");
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId is required"));
        return;
      }
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Task not found"));
        return;
      }
      type GateResult = { gateName: string; passed: boolean; detail?: string; matchCriterionKeywords?: string[] };
      const gates: GateResult[] = Array.isArray(params?.gates)
        ? (params.gates as GateResult[])
        : params?.gateName
          ? [{ gateName: String(params.gateName), passed: params.passed === true || params.passed === "true", detail: params.detail ? String(params.detail) : undefined }]
          : [];
      if (gates.length === 0) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Provide gates[] array or single gateName+passed"));
        return;
      }
      const ciActor = params?.actor ? String(params.actor) : "ci";
      const now = Date.now();
      type ACEntry = { id: string; description: string; passes: boolean; verifiedAt?: number; verifiedBy?: string; note?: string };
      const criteria = (task.acceptanceCriteria ?? []) as ACEntry[];
      const gateKeywords: Record<string, string[]> = {
        tsc: ["tsc", "typescript", "类型检查", "typecheck", "编译"],
        tests: ["测试", "test", "单元测试", "vitest", "jest", "spec"],
        lint: ["lint", "eslint", "代码规范", "oxlint", "style"],
        build: ["构建", "build", "bundle"],
        coverage: ["覆盖率", "coverage"],
        e2e: ["e2e", "端到端", "integration"],
      };
      let matchedCount = 0;
      const matchLog: string[] = [];
      const updatedCriteria = criteria.map((c) => {
        const descLower = c.description.toLowerCase();
        for (const gate of gates) {
          const keywords = [...(gateKeywords[gate.gateName.toLowerCase()] ?? [gate.gateName.toLowerCase()]), ...(gate.matchCriterionKeywords ?? [])];
          if (keywords.some((kw) => descLower.includes(kw.toLowerCase()))) {
            matchedCount++;
            matchLog.push((gate.passed ? "[PASS]" : "[FAIL]") + " \"" + c.description + "\" <- " + gate.gateName + (gate.detail ? " (" + gate.detail + ")" : ""));
            return { ...c, passes: gate.passed, verifiedAt: now, verifiedBy: ciActor, note: gate.detail ?? (gate.gateName + (gate.passed ? " 通过" : " 未通过")) };
          }
        }
        return c;
      });
      const appendedAC: ACEntry[] = [];
      if (params?.autoAppend !== false) {
        for (const gate of gates) {
          const keywords = gateKeywords[gate.gateName.toLowerCase()] ?? [gate.gateName.toLowerCase()];
          const alreadyMatched = criteria.some((c) => keywords.some((kw) => c.description.toLowerCase().includes(kw)));
          if (!alreadyMatched) {
            appendedAC.push({
              id: "ac_ci_" + gate.gateName + "_" + now,
              description: "[CI] " + gate.gateName + " 检查" + (gate.passed ? "通过" : "未通过"),
              passes: gate.passed,
              verifiedAt: now,
              verifiedBy: ciActor,
              note: gate.detail,
            });
            matchLog.push((gate.passed ? "[PASS]" : "[FAIL]") + " 新增 AC \"[CI] " + gate.gateName + "\"（无匹配项，自动追加）");
          }
        }
      }
      const finalCriteria = [...updatedCriteria, ...appendedAC];
      await storage.updateTask(taskId, { acceptanceCriteria: finalCriteria as Task["acceptanceCriteria"] });
      const passedCount = finalCriteria.filter((c) => c.passes).length;
      const allPassed = finalCriteria.length > 0 && passedCount === finalCriteria.length;
      if (allPassed && task.status === "in-progress" && params?.autoTransitionToReview === true) {
        await storage.updateTask(taskId, { status: "review" });
        const supervisorRaw = task.supervisorId ?? task.creatorId;
        if (supervisorRaw && supervisorRaw !== "system") {
          notifySupervisor(supervisorRaw, "[QUALITY GATE] 任务 \"" + task.title + "\" 所有 CI 门禁通过，已自动流转至 review。", "task:quality-gate:" + taskId);
        }
      }
      respond(true, { taskId, gatesProcessed: gates.length, matchedCount, appendedCount: appendedAC.length, acceptanceCriteria: finalCriteria, passedCount, totalCount: finalCriteria.length, allPassed, readyToReview: allPassed, matchLog }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to update quality gate: " + String(err instanceof Error ? err.message : err)));
    }
  },

  /**
   * tasks.okr.list — 列出 OKR 目标及进度
   */
  "tasks.okr.list": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext } = await import("../../utils/project-context.js");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);

      const { loadOkrStore, calcOkrProgress, formatOkrSummary } = await import("../../tasks/okr-manager.js");

      const store = loadOkrStore(ctx.workspacePath);
      const objectives = store?.objectives ?? [];

      // 计算关联任务统计
      const allTasks = await storage.listTasks({ projectId, limit: 5000 });

      const taskStats = new Map<string, { total: number; completed: number }>();
      for (const t of allTasks) {
        const oid = (t as Record<string, unknown>).objectiveId as string | undefined;
        if (!oid) {continue;}
        const stat = taskStats.get(oid) ?? { total: 0, completed: 0 };
        stat.total++;
        if (t.status === "done") {stat.completed++;}
        taskStats.set(oid, stat);
      }

      const progress = calcOkrProgress(objectives, taskStats);
      respond(true, {
        objectives,
        progress,
        summary: formatOkrSummary(progress),
      }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to list OKR: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  // =========================================================================
  // B0: Triage Intelligence — 对标 Linear 2026 Triage Intelligence 功能
  // 基于任务标题/描述/类型自动评估建议优先级、标签、负责人
  // =========================================================================
  "task.triage": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      let title = params?.title ? String(params.title) : "";
      let description = params?.description ? String(params.description) : "";
      let taskType = params?.type ? String(params.type) : undefined;
      let priority = params?.priority ? String(params.priority) : "medium";
      let tags: string[] = Array.isArray(params?.tags) ? (params.tags as string[]) : [];

      // 如果传入 taskId，从存储加载实际数据
      if (taskId) {
        const existing = await storage.getTask(taskId);
        if (existing) {
          title = title || existing.title;
          description = description || existing.description || "";
          taskType = taskType || existing.type;
          priority = priority || existing.priority;
          tags = tags.length > 0 ? tags : (existing.tags ?? []);
        }
      }

      if (!title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title or taskId is required"));
        return;
      }

      const suggestion = calcTriageSuggestion(title, description, taskType as import("../../tasks/types.js").TaskType | undefined, priority as import("../../tasks/types.js").TaskPriority, tags);
      respond(true, {
        taskId: taskId || undefined,
        input: { title, type: taskType, priority, tags },
        suggestion,
        tip: suggestion.priorityUpgraded
          ? `[TRIAGE] Priority upgraded from ${priority} to ${suggestion.suggestedPriority} based on keywords: ${suggestion.matchedKeywords.join(", ")}`
          : "No priority change suggested.",
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to triage: ${String(err instanceof Error ? err.message : err)}`));
    }
  },

  // =========================================================================
  // B2: SLA 检查 — 对标 Linear 2026 Issue SLA + 服务级别协议
  // urgent=4h / high=24h / medium=72h SLA 标准
  // =========================================================================
  "task.sla.check": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const assigneeId = params?.assigneeId ? String(params.assigneeId) : undefined;
      const now = Date.now();

      // 按 priority 定义 SLA 时限（毫秒）
      const SLA_HOURS: Record<string, number> = {
        urgent: 4,
        high: 24,
        medium: 72,
        low: 168, // 7天
      };

      const tasks = await storage.listTasks({
        projectId,
        assigneeId,
        status: "in-progress",
        limit: 500,
      });

      const breached: Array<{ taskId: string; title: string; priority: string; startedAt: number; slaDeadline: number; overdueMs: number; overdueHours: number }> = [];
      const atRisk: Array<{ taskId: string; title: string; priority: string; startedAt: number; slaDeadline: number; remainingHours: number }> = [];

      for (const t of tasks) {
        const slaHours = SLA_HOURS[t.priority ?? "medium"] ?? 72;
        const slaMs = slaHours * 60 * 60 * 1000;
        const startedAt = (t as Record<string, unknown>).startedAt as number | undefined
          ?? (t as Record<string, unknown>).updatedAt as number | undefined
          ?? t.createdAt;
        if (!startedAt) {continue;}
        const slaDeadline = startedAt + slaMs;
        if (now > slaDeadline) {
          breached.push({ taskId: t.id, title: t.title, priority: t.priority, startedAt, slaDeadline, overdueMs: now - slaDeadline, overdueHours: Math.round((now - slaDeadline) / 3600000 * 10) / 10 });
        } else if (now > slaDeadline - 0.25 * slaMs) {
          // 副予预警：剩余时间 < 25%
          atRisk.push({ taskId: t.id, title: t.title, priority: t.priority, startedAt, slaDeadline, remainingHours: Math.round((slaDeadline - now) / 3600000 * 10) / 10 });
        }
      }

      respond(true, {
        projectId,
        assigneeId,
        slaLimits: SLA_HOURS,
        breached,
        atRisk,
        summary: `SLA check: ${breached.length} breached, ${atRisk.length} at-risk out of ${tasks.length} in-progress tasks.`,
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to check SLA: ${String(err instanceof Error ? err.message : err)}`));
    }
  },

  // =========================================================================
  // B4: Task Template RPC — 对标 Linear 2026 Issue Templates
  // 保存常用任务结构，快速创建标准化任务
  // =========================================================================
  "task.template.upsert": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      if (!name) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
        return;
      }
      const { upsertTaskTemplate } = await import("../../tasks/task-template-manager.js");
      const template = upsertTaskTemplate(root, {
        id: params?.id ? String(params.id) : undefined,
        name,
        description: params?.description ? String(params.description) : undefined,
        useCases: params?.useCases ? String(params.useCases) : undefined,
        fields: (params?.fields as import("../../tasks/task-template-manager.js").TaskTemplate["fields"]) ?? {},
        createdBy: params?.createdBy ? String(params.createdBy) : "system",
      });
      respond(true, { success: true, template }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to upsert template: ${String(err instanceof Error ? err.message : err)}`));
    }
  },

  "task.template.list": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const keyword = params?.keyword ? String(params.keyword) : undefined;
      const { listTaskTemplates } = await import("../../tasks/task-template-manager.js");
      const templates = listTaskTemplates(root, { keyword });
      respond(true, { templates, count: templates.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to list templates: ${String(err instanceof Error ? err.message : err)}`));
    }
  },

  "task.template.apply": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const templateId = params?.templateId ? String(params.templateId) : "";
      if (!templateId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "templateId is required"));
        return;
      }
      const { applyTaskTemplate } = await import("../../tasks/task-template-manager.js");
      const overrides = (params?.overrides as Record<string, unknown>) ?? {};
      const result = applyTaskTemplate(root, templateId, overrides as Parameters<typeof applyTaskTemplate>[2]);
      if (!result) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Template not found: ${templateId}`));
        return;
      }
      respond(true, {
        templateId,
        templateName: result.template.name,
        mergedFields: result.merged,
        tip: "Use the mergedFields as parameters when calling task.create to quickly create a task from this template.",
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to apply template: ${String(err instanceof Error ? err.message : err)}`));
    }
  },

  "task.template.delete": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const templateId = params?.templateId ? String(params.templateId) : "";
      if (!templateId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "templateId is required"));
        return;
      }
      const { deleteTaskTemplate } = await import("../../tasks/task-template-manager.js");
      const deleted = deleteTaskTemplate(root, templateId);
      respond(true, { success: deleted, templateId }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete template: ${String(err instanceof Error ? err.message : err)}`));
    }
  },
};

// =========================================================================
// Triage Intelligence 辅助函数 — 纲层内部使用
// =========================================================================

function calcTriageSuggestion(
  title: string,
  description: string,
  taskType: import("../../tasks/types.js").TaskType | undefined,
  currentPriority: string,
  tags: string[],
): {
  suggestedPriority: string;
  suggestedLabels: string[];
  priorityUpgraded: boolean;
  matchedKeywords: string[];
  rationale: string;
} {
  const text = `${title} ${description}`.toLowerCase();
  const matchedKeywords: string[] = [];
  let urgencyScore = 0;

  // 紧急关键词集合
  const URGENT_KEYWORDS = ["crash", "down", "outage", "p0", "critical", "紧急", "故障", "崩溃", "生产事故", "production", "security", "安全漏洞", "data loss", "cve"];
  const HIGH_KEYWORDS = ["bug", "fix", "broken", "error", "fail", "regression", "故障", "错误", "hotfix", "blocker", "p1", "deadline", "截止日", "payment", "支付"];
  const LABELS_MAP: Record<string, string> = {
    "test": "testing", "spec": "testing", "unit test": "testing",
    "doc": "documentation", "readme": "documentation", "文档": "documentation",
    "refactor": "refactoring", "重构": "refactoring",
    "perf": "performance", "slow": "performance", "性能": "performance",
    "security": "security", "auth": "security", "xss": "security", "sql injection": "security",
    "ui": "frontend", "ux": "frontend", "css": "frontend", "design": "frontend",
    "api": "backend", "endpoint": "backend", "service": "backend",
    "ci": "devops", "cd": "devops", "deploy": "devops", "docker": "devops", "k8s": "devops",
    "migration": "database", "schema": "database", "sql": "database",
  };

  for (const kw of URGENT_KEYWORDS) {
    if (text.includes(kw)) { urgencyScore += 3; matchedKeywords.push(kw); }
  }
  for (const kw of HIGH_KEYWORDS) {
    if (text.includes(kw)) { urgencyScore += 1; matchedKeywords.push(kw); }
  }

  // bugfix 类型加分
  if (taskType === "bugfix") {urgencyScore += 2;}

  // 类型强制覆盖
  const PRIORITY_LEVELS = ["low", "medium", "high", "urgent"];
  const currentIdx = PRIORITY_LEVELS.indexOf(currentPriority);
  let suggestedIdx = currentIdx < 0 ? 1 : currentIdx;

  if (urgencyScore >= 5) {suggestedIdx = Math.max(suggestedIdx, 3);} // urgent
  else if (urgencyScore >= 2) {suggestedIdx = Math.max(suggestedIdx, 2);} // high
  else if (urgencyScore >= 1) {suggestedIdx = Math.max(suggestedIdx, 1);} // medium

  const suggestedPriority = PRIORITY_LEVELS[Math.min(suggestedIdx, 3)];

  // 自动标签推断
  const suggestedLabels: string[] = [...tags];
  for (const [kw, label] of Object.entries(LABELS_MAP)) {
    if (text.includes(kw) && !suggestedLabels.includes(label)) {suggestedLabels.push(label);}
  }

  return {
    suggestedPriority,
    suggestedLabels,
    priorityUpgraded: suggestedPriority !== currentPriority && suggestedIdx > currentIdx,
    matchedKeywords: [...new Set(matchedKeywords)],
    rationale: urgencyScore > 0
      ? `Urgency score ${urgencyScore}: matched keywords [${[...new Set(matchedKeywords)].join(", ")}]${taskType === "bugfix" ? " + bugfix type" : ""}.`
      : "No urgency signals detected.",
  };
}
