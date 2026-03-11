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
 *
 * 任务关系操作：
 * - task.subtask.create - 创建子任务
 * - task.dependency.add - 添加依赖关系
 * - task.block - 标记任务被阻塞
 */

import type { MemberType } from "../../organization/types.js";
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
  TaskAssignee,
  TaskComment,
  TaskAttachment,
  AgentWorkLog,
  TaskDependency,
} from "../../tasks/types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

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
      const creatorId = params?.creatorId ? String(params.creatorId) : "system";
      const creatorType = params?.creatorType
        ? (String(params.creatorType) as MemberType)
        : "human";
      // 兼容 assigneeIds 数组 和 assignee 单个字符串
      const assigneeIds: string[] = params?.assigneeIds
        ? (params.assigneeIds as string[])
        : params?.assignee
          ? [String(params.assignee)]
          : [];
      const priority = params?.priority ? String(params.priority) : "medium";
      const type = params?.type ? (String(params.type) as TaskType) : undefined;
      const dueDate = params?.dueDate ? Number(params.dueDate) : undefined;
      const organizationId = params?.organizationId ? String(params.organizationId) : undefined;
      const teamId = params?.teamId ? String(params.teamId) : undefined;
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const parentTaskId = params?.parentTaskId ? String(params.parentTaskId) : undefined;
      const tags = params?.tags ? (params.tags as string[]) : [];

      // 验证参数
      if (!title || title.length < 1 || title.length > 200) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "任务标题必须为1-200个字符"),
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
        status: "todo",
        priority: normalizedPriority,
        type,
        organizationId,
        teamId,
        projectId,
        parentTaskId,
        dueDate,
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
        // 这里应该调用通知系统发送任务分配通知
        // 在实际环境中，集成WebSocket推送或邮件通知
        console.log(`[Task Notification] Assigned task ${taskId} to ${assignee.id}`);
      }

      respond(true, newTask, undefined);
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

      // 更新任务信息
      const updatedTask = await storage.updateTask(taskId, {
        title,
        description,
        status: normalizedStatus,
        priority,
        dueDate,
        tags: updatedTags,
        assignees: assignee ? updatedAssignees : undefined,
      });

      respond(true, updatedTask, undefined);
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
      // 兼容 assigneeId 和 assignee 两种参数名
      const assigneeId =
        (params?.assigneeId ? String(params.assigneeId) : null) ||
        (params?.assignee ? String(params.assignee) : undefined);
      const creatorId = params?.creatorId ? String(params.creatorId) : undefined;
      const status = params?.status ? (params.status as TaskStatus | TaskStatus[]) : undefined;
      const priority = params?.priority
        ? (params.priority as TaskPriority | TaskPriority[])
        : undefined;
      const organizationId = params?.organizationId ? String(params.organizationId) : undefined;
      const teamId = params?.teamId ? String(params.teamId) : undefined;
      const projectId = params?.projectId ? String(params.projectId) : undefined;
      const keyword = params?.keyword ? String(params.keyword) : undefined;

      // 构建筛选条件
      const filter: Record<string, unknown> = {
        assigneeId,
        creatorId,
        status,
        priority,
        organizationId,
        teamId,
        projectId,
        keyword,
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
        blocked: ["in-progress", "cancelled"],
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

      // 如果状态变为in-progress，记录开始时间
      if (newStatus === "in-progress" && !task.timeTracking.startedAt) {
        updates.timeTracking = {
          ...task.timeTracking,
          startedAt: Date.now(),
        };
      }

      await storage.updateTask(taskId, updates);

      // 发送状态变更通知
      console.log(
        `[Task Notification] Task ${taskId} status changed: ${task.status} -> ${newStatus}`,
      );
      // 实际环境中应该通知所有相关人员

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

      const isAssignee = (task.assignees ?? []).some((a) => a.id === agentId && a.type === "agent");
      if (!isAssignee) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "智能助手不是此任务的执行者"),
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
      const creatorId = params?.creatorId ? String(params.creatorId) : "system";
      const assigneeIds = params?.assigneeIds ? (params.assigneeIds as string[]) : [];
      const priority = params?.priority ? (String(params.priority) as TaskPriority) : "medium";

      if (!parentTaskId || !title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"));
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
        creatorType: "human",
        assignees,
        status: "todo",
        priority,
        organizationId: parentTask.organizationId,
        teamId: parentTask.teamId,
        projectId: parentTask.projectId,
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

      // 通知相关人员
      console.log(`[Task Notification] Task ${taskId} is blocked: ${reason}`);
      // 实际环境中应该通知所有相关人员

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
};
