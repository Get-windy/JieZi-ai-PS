/**
 * 任务管理工具
 *
 * 提供创建、查询、更新、完成任务的工具
 * 让智能体能够管理待办事项和任务列表
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";

/**
 * 任务优先级枚举
 */
const TaskPriority = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("urgent"),
]);

/**
 * 任务状态枚举
 * 工具层别名（pending/in_progress/completed/cancelled）在 RPC 层会自动映射到存储层（todo/in-progress/done/cancelled）
 * 也可直接传入存储层的原始状态名如 todo/in-progress/done/review/blocked
 */
const TaskStatus = Type.Union([
  Type.Literal("pending"), // 待处理（存储层为 todo）
  Type.Literal("in_progress"), // 进行中（存储层为 in-progress）
  Type.Literal("completed"), // 已完成（存储层为 done）
  Type.Literal("cancelled"), // 已取消
  Type.Literal("todo"), // 存储层原始状态
  Type.Literal("in-progress"), // 存储层原始状态
  Type.Literal("done"), // 存储层原始状态
  Type.Literal("review"), // 审查中
  Type.Literal("blocked"), // 被阻塞
]);

/**
 * task_create 工具参数 schema
 */
const TaskCreateToolSchema = Type.Object({
  /** 任务标题（必填） */
  title: Type.String({ minLength: 1, maxLength: 256 }),
  /**
   * 任务描述（必填）
   * 任务驱动工作模式的前提是任务定义清晰，必须描述：做什么、为什么做、完成标准是什么
   */
  description: Type.String({ minLength: 1, maxLength: 4000 }),
  /**
   * 任务作用域（必填）
   * - personal: 私人任务（个人待办、学习计划、个人事项）— 无需 project，结果写入自身私有记忆
   * - project:  项目任务（团队协作、功能开发、交付物）— 必须传入 project，结果写入项目共享记忆
   */
  scope: Type.Union([Type.Literal("personal"), Type.Literal("project")]),
  /** 任务优先级（可选，默认medium） */
  priority: Type.Optional(TaskPriority),
  /** 截止时间（可选，ISO 8601格式） */
  dueDate: Type.Optional(Type.String()),
  /** 负责人/执行者（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 任务标签（可选） */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /**
   * 所属项目 ID（scope=project 时必填）
   * scope=personal 时可不传，项目任务必须传入正确的项目 ID
   */
  project: Type.Optional(Type.String({ maxLength: 128 })),
  /** 所属团队ID（可选） */
  teamId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 所属组织ID（可选） */
  organizationId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 任务类型（可选） */
  type: Type.Optional(
    Type.Union([
      Type.Literal("feature"),
      Type.Literal("bugfix"),
      Type.Literal("research"),
      Type.Literal("documentation"),
      Type.Literal("meeting"),
      Type.Literal("other"),
    ]),
  ),
  /**
   * 预估工时（可选，单位：小时）
   * 有助于任务调度和工作量评估，建议尽量填写
   */
  estimatedHours: Type.Optional(Type.Number({ minimum: 0.5, maximum: 999 })),
  /**
   * 父任务ID（可选）
   * 将此任务作为某个复杂任务的子任务，实现任务分解
   */
  parentTaskId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 阻塞此任务的任务ID列表（可选）
   * 声明前置依赖，系统会自动将任务状态标记为 blocked
   */
  blockedBy: Type.Optional(Type.Array(Type.String({ maxLength: 128 }))),
  /**
   * 主管 ID（可选，强烈建议填写）
   *
   * 必须是该任务所属项目的成员，不能填写项目外人员。
   * 候选人（根据任务内容自行判断选择）：
   *   - 你自己（currentAgentId）：你分配给他人但自己负责跟进时
   *   - 项目负责人（ownerId）：需要项目负责人最终验收或决策时
   *   - 其他项目成员：任务属于某个专职角色管辖时（如 qa-lead 管测试任务）
   *
   * 不填时系统将默认设为你自己（任务创建者），确保任务始终有人负责。
   * supervisorId 拥有：查看任务详情、写入工作日志、收到任务完成/阻塞通知的权限。
   */
  supervisorId: Type.Optional(Type.String({ maxLength: 128 })),
});

/**
 * task_list 工具参数 schema
 */
const TaskListToolSchema = Type.Object({
  /** 过滤状态（可选） */
  status: Type.Optional(TaskStatus),
  /** 过滤优先级（可选） */
  priority: Type.Optional(TaskPriority),
  /** 过滤负责人（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 只显示今日到期的任务（可选） */
  dueToday: Type.Optional(Type.Boolean()),
  /** 最大返回数量（可选，默认20） */
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  /** 过滤所属项目（可选，如 "wo-shi-renlei"） */
  project: Type.Optional(Type.String({ maxLength: 128 })),
  /** 过滤标签（可选） */
  tag: Type.Optional(Type.String({ maxLength: 32 })),
  /**
   * 只显示分配给自己的任务（可选，默认 false）
   * 设为 true 时等效于 assignee=currentAgentId，适合 worker agent 查询自己的待办
   * 设为 false 时不过滤 assignee，适合 coordinator 查看全局任务
   */
  selfOnly: Type.Optional(Type.Boolean()),
  /**
   * 返回最优先应要处理的下一个任务（可选）
   * 设为 true 时，在返回任务列表的同时，额外返回 nextTask 字段
   * nextTask 是根据优先级/截止日期/依赖关系综合评分之后的最高优先任务
   * 适合 agent 开始工作前查询“我该做什么”的场景
   */
  includeNextTask: Type.Optional(Type.Boolean()),
  /** 只返回逆期任务（可选） */
  overdueOnly: Type.Optional(Type.Boolean()),
  /** 只返回被阻塞的任务（可选） */
  blockedOnly: Type.Optional(Type.Boolean()),
});

/**
 * task_update 工具参数 schema
 */
const TaskUpdateToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /** 新标题（可选） */
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  /** 新描述（可选） */
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  /** 新状态（可选） */
  status: Type.Optional(TaskStatus),
  /** 新优先级（可选） */
  priority: Type.Optional(TaskPriority),
  /** 新截止时间（可选） */
  dueDate: Type.Optional(Type.String()),
  /** 新负责人（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 添加标签（可选） */
  addTags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 移除标签（可选） */
  removeTags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 更新所属项目ID（可选） */
  projectId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新所属团队ID（可选） */
  teamId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新所属组织ID（可选） */
  organizationId: Type.Optional(Type.String({ maxLength: 128 })),
});

/**
 * task_complete 工具参数 schema
 */
const TaskCompleteToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /** 完成备注（可选） */
  note: Type.Optional(Type.String({ maxLength: 500 })),
});

/**
 * task_delete 工具参数 schema
 */
const TaskDeleteToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
});

/**
 * task_get 工具参数 schema
 */
const TaskGetToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /**
   * 是否包含评论内容（可选，默认 true）
   * 评论和工作日志是任务上下文的重要来源，建议保持默认开启
   */
  includeComments: Type.Optional(Type.Boolean()),
  /** 是否包含工作日志（可选，默认 true） */
  includeWorkLogs: Type.Optional(Type.Boolean()),
});

/**
 * task_subtask_create 工具参数 schema
 */
const TaskSubtaskCreateToolSchema = Type.Object({
  /** 父任务ID（必填） */
  parentTaskId: Type.String({ minLength: 1 }),
  /**
   * 子任务标题（必填）
   * 建议命名格式：动词 + 对象，如“调研 OpenAI API 鉴权方式”
   */
  title: Type.String({ minLength: 1, maxLength: 256 }),
  /**
   * 子任务描述（必填）
   * 说明这个子任务具体要做什么、如何判断完成
   */
  description: Type.String({ minLength: 1, maxLength: 4000 }),
  /** 子任务优先级（可选，默认继承父任务） */
  priority: Type.Optional(TaskPriority),
  /** 子任务负责人（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 子任务预估工时（可选，单位：小时） */
  estimatedHours: Type.Optional(Type.Number({ minimum: 0.5, maximum: 99 })),
});

/**
 * task_worklog_add 工具参数 schema
 */
const TaskWorklogAddToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /**
   * 操作类型（必填）
   * 建议使用语义清晰的动词，如：
   * started, researching, coding, testing, reviewing, debugging,
   * waiting, blocked, resumed, completed, failed
   */
  action: Type.String({ minLength: 1, maxLength: 64 }),
  /**
   * 工作详情（必填）
   * 描述具体做了什么、遇到什么、取得了什么进展
   * 工作日志是任务可追源性的核心，建议尽量详尽
   */
  details: Type.String({ minLength: 1, maxLength: 4000 }),
  /** 本次工作持续时长（可选，单位：毫秒） */
  duration: Type.Optional(Type.Number({ minimum: 0 })),
  /**
   * 操作结果（可选）
   * success: 完全成功
   * failure: 失败，需要说明失败原因
   * partial: 部分完成，需要说明完成了哪些、还剥何未完成
   */
  result: Type.Optional(
    Type.Union([Type.Literal("success"), Type.Literal("failure"), Type.Literal("partial")]),
  ),
  /** 失败时的错误信息（当 result=failure 时建议填写） */
  errorMessage: Type.Optional(Type.String({ maxLength: 1000 })),
});

/**
 * 创建任务创建工具
 */
export function createTaskCreateTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Create",
    name: "task_create",
    description:
      'Create a new task. REQUIRED: title, description, scope ("personal" for private todos | "project" for team work). scope=project REQUIRES project (project ID). Results of personal tasks go to agent private memory; project tasks go to project shared memory.',
    parameters: TaskCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const title = readStringParam(params, "title", { required: true });
      const description = readStringParam(params, "description", { required: true });
      const priority = readStringParam(params, "priority") || "medium";
      const dueDate = readStringParam(params, "dueDate");
      const assignee = readStringParam(params, "assignee") || opts?.currentAgentId;
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const project = readStringParam(params, "project");
      const scope = params?.scope === "personal" ? "personal" : "project";
      const teamId = readStringParam(params, "teamId");
      const organizationId = readStringParam(params, "organizationId");
      const type = readStringParam(params, "type");
      const estimatedHours =
        typeof params.estimatedHours === "number" ? params.estimatedHours : undefined;
      const parentTaskId = readStringParam(params, "parentTaskId");
      const blockedBy = Array.isArray(params.blockedBy) ? params.blockedBy.map(String) : undefined;
      // supervisorId：若 AI 未显式传入，自动用当前 agent 自身作为主管（主控分配子任务场景）
      // supervisorId：AI 应根据任务内容从项目成员中选择；未指定时默认为创建者自己
      const supervisorId = readStringParam(params, "supervisorId") || opts?.currentAgentId;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 生成唯一任务ID
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 调用 task.create RPC
        await callGatewayTool("task.create", gatewayOpts, {
          id: taskId,
          title,
          description,
          priority,
          dueDate,
          assignee,
          tags,
          type: type || undefined,
          status: "pending",
          createdAt: Date.now(),
          projectId: project || undefined,
          scope,
          teamId: teamId || undefined,
          organizationId: organizationId || undefined,
          parentTaskId: parentTaskId || undefined,
          estimatedHours,
          blockedBy: blockedBy || undefined,
          supervisorId: supervisorId || undefined,
          // creatorId：自动填入当前 agent，确保 creatorId 不会变成不存在的 "system"
          creatorId: opts?.currentAgentId || undefined,
          creatorType: "agent",
        });

        // 如果有子任务关系，更新父任务的 subtasks 列表
        if (parentTaskId) {
          try {
            await callGatewayTool("task.update", gatewayOpts, {
              id: parentTaskId,
              addSubtask: taskId,
            });
          } catch {
            // 更新父任务失败不影响主任务创建
          }
        }

        return jsonResult({
          success: true,
          message: `Task created: "${title}"`,
          task: {
            id: taskId,
            title,
            description,
            status: blockedBy && blockedBy.length > 0 ? "blocked" : "pending",
            priority,
            dueDate,
            assignee,
            tags,
            type: type || undefined,
            project: project || undefined,
            teamId: teamId || undefined,
            organizationId: organizationId || undefined,
            parentTaskId: parentTaskId || undefined,
            estimatedHours,
            blockedBy: blockedBy || [],
            createdAt: Date.now(),
          },
          tips: [
            parentTaskId ? `已将此任务添加为任务 ${parentTaskId} 的子任务` : null,
            blockedBy && blockedBy.length > 0
              ? `此任务正在等待 ${blockedBy.length} 个前置任务完成`
              : null,
          ].filter(Boolean),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务列表查询工具
 */
export function createTaskListTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task List",
    name: "task_list",
    description:
      "List tasks with optional filters: status, priority, assignee, tag, dueToday, project, selfOnly (true = only my tasks), includeNextTask (true = also return the single highest-priority task you should work on next), overdueOnly, blockedOnly. Returns tasks sorted by priority+weight+creation time.",
    parameters: TaskListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const status = readStringParam(params, "status");
      const priority = readStringParam(params, "priority");
      const assignee = readStringParam(params, "assignee");
      const tag = readStringParam(params, "tag");
      const dueToday = typeof params.dueToday === "boolean" ? params.dueToday : undefined;
      const limit = typeof params.limit === "number" ? params.limit : 20;
      const project = readStringParam(params, "project");
      const selfOnly = typeof params.selfOnly === "boolean" ? params.selfOnly : false;
      const includeNextTask =
        typeof params.includeNextTask === "boolean" ? params.includeNextTask : false;
      const overdueOnly = typeof params.overdueOnly === "boolean" ? params.overdueOnly : false;
      const blockedOnly = typeof params.blockedOnly === "boolean" ? params.blockedOnly : false;
      const gatewayOpts = readGatewayCallOptions(params);

      const resolvedAssignee =
        assignee || (selfOnly && opts?.currentAgentId ? opts.currentAgentId : undefined);

      try {
        const response = await callGatewayTool("task.list", gatewayOpts, {
          status,
          priority,
          assignee: resolvedAssignee,
          tag,
          dueToday,
          limit,
          projectId: project || undefined,
          overdueOnly: overdueOnly || undefined,
          blockedOnly: blockedOnly || undefined,
        });

        const resp = response as { tasks?: unknown[]; total?: number } | unknown[] | null;
        const tasks = Array.isArray(resp)
          ? resp
          : resp && typeof resp === "object" && "tasks" in resp && Array.isArray(resp.tasks)
            ? resp.tasks
            : [];

        // 计算 nextTask：取未完成且未被阻塞的第一个（已经按优先级排序）
        let nextTask: unknown = null;
        if (includeNextTask) {
          const activeTasks = (tasks as Record<string, unknown>[]).filter(
            (t) => t.status !== "done" && t.status !== "cancelled" && t.status !== "blocked",
          );
          nextTask = activeTasks[0] || null;
        }

        return jsonResult({
          success: true,
          count: tasks.length,
          tasks,
          ...(includeNextTask
            ? {
                nextTask,
                nextTaskTip: nextTask
                  ? `建议优先处理: "${String((nextTask as Record<string, unknown>).title)}" (优先级: ${String((nextTask as Record<string, unknown>).priority)})`
                  : "暂无待处理任务",
              }
            : {}),
          filters: {
            status,
            priority,
            assignee: resolvedAssignee,
            tag,
            dueToday,
            project: project || undefined,
            selfOnly,
            overdueOnly,
            blockedOnly,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务更新工具
 */
export function createTaskUpdateTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Update",
    name: "task_update",
    description:
      "Update an existing task's title, description, status (todo/in-progress/done/review/blocked/cancelled), priority, due date, assignee, tags or project/team/organization assignment. At least one field must be provided.",
    parameters: TaskUpdateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const title = readStringParam(params, "title");
      const description = readStringParam(params, "description");
      const status = readStringParam(params, "status");
      const priority = readStringParam(params, "priority");
      const dueDate = readStringParam(params, "dueDate");
      const assignee = readStringParam(params, "assignee");
      const addTags = Array.isArray(params.addTags) ? params.addTags.map(String) : undefined;
      const removeTags = Array.isArray(params.removeTags)
        ? params.removeTags.map(String)
        : undefined;
      const projectId = readStringParam(params, "projectId");
      const teamId = readStringParam(params, "teamId");
      const organizationId = readStringParam(params, "organizationId");
      const gatewayOpts = readGatewayCallOptions(params);

      // 检查是否至少提供了一个更新字段
      if (
        !title &&
        !description &&
        !status &&
        !priority &&
        !dueDate &&
        !assignee &&
        !addTags &&
        !removeTags &&
        !projectId &&
        !teamId &&
        !organizationId
      ) {
        return jsonResult({
          success: false,
          error: "At least one field must be provided for update",
        });
      }

      try {
        // 调用 task.update RPC
        const response = await callGatewayTool("task.update", gatewayOpts, {
          id: taskId,
          title,
          description,
          status,
          priority,
          dueDate,
          assignee,
          addTags,
          removeTags,
          projectId: projectId || undefined,
          teamId: teamId || undefined,
          organizationId: organizationId || undefined,
          updatedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Task "${taskId}" updated successfully`,
          task: response,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务完成工具
 */
export function createTaskCompleteTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Complete",
    name: "task_complete",
    description:
      "Mark a task as completed. Optionally add a completion note. This is a convenience method that sets status to 'completed' and records completion time.",
    parameters: TaskCompleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const note = readStringParam(params, "note");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 task.complete RPC
        const response = await callGatewayTool("task.complete", gatewayOpts, {
          id: taskId,
          completedBy: opts?.currentAgentId,
          completedAt: Date.now(),
          note,
        });

        return jsonResult({
          success: true,
          message: `Task "${taskId}" marked as completed`,
          task: response,
          completedBy: opts?.currentAgentId,
          completedAt: Date.now(),
          note,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务删除工具
 */
export function createTaskDeleteTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Delete",
    name: "task_delete",
    description:
      "Delete a task permanently. CAUTION: This is a destructive operation and cannot be undone.",
    parameters: TaskDeleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 task.delete RPC
        await callGatewayTool("task.delete", gatewayOpts, {
          id: taskId,
          deletedBy: opts?.currentAgentId,
          deletedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Task "${taskId}" deleted successfully`,
          deleted: {
            taskId,
            deletedBy: opts?.currentAgentId,
            deletedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务详情查询工具
 * AI agent 在执行任务前，应先调用此工具获取任务完整上下文（描述/评论/工作日志）
 */
export function createTaskGetTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Get",
    name: "task_get",
    description:
      "Get full details of a task including description, assignees, time tracking, comments and work logs. RECOMMENDED: call this before starting work on a task to understand full context, history, and any blockers noted in comments.",
    parameters: TaskGetToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("task.get", gatewayOpts, {
          taskId,
          requesterId: opts?.currentAgentId,
        });

        if (!response) {
          return jsonResult({
            success: false,
            error: `Task not found: ${taskId}`,
          });
        }

        const task = response;
        const comments = (task.comments as unknown[]) || [];
        const workLogs = (task.workLogs as unknown[]) || [];

        return jsonResult({
          success: true,
          task,
          summary: {
            commentCount: comments.length,
            workLogCount: workLogs.length,
            status: task.status,
            priority: task.priority,
            estimatedHours: task.timeTracking
              ? (task.timeTracking as Record<string, unknown>).estimatedHours
              : undefined,
            timeSpentMs: task.timeTracking
              ? (task.timeTracking as Record<string, unknown>).timeSpent
              : 0,
          },
          // 建议 agent 在开始工作之前先阅读最近的评论，了解任务最新进展
          latestComment: comments.length > 0 ? comments[comments.length - 1] : null,
          latestWorkLog: workLogs.length > 0 ? workLogs[workLogs.length - 1] : null,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建子任务创建工具
 * 实现任务驱动工作模式的核心：复杂任务分解为可执行的子任务
 */
export function createTaskSubtaskCreateTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Subtask Create",
    name: "task_subtask_create",
    description:
      "Create a subtask under a parent task. Use this to decompose complex tasks into smaller, actionable pieces. Each subtask MUST have a clear description of what to do and how to verify completion. The subtask inherits project/team/org from the parent.",
    parameters: TaskSubtaskCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const parentTaskId = readStringParam(params, "parentTaskId", { required: true });
      const title = readStringParam(params, "title", { required: true });
      const description = readStringParam(params, "description", { required: true });
      const priority = readStringParam(params, "priority");
      const assignee = readStringParam(params, "assignee") || opts?.currentAgentId;
      const estimatedHours =
        typeof params.estimatedHours === "number" ? params.estimatedHours : undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("task.subtask.create", gatewayOpts, {
          parentTaskId,
          title,
          description,
          priority: priority || undefined,
          assigneeIds: assignee ? [assignee] : [],
          creatorId: opts?.currentAgentId || "system",
          estimatedHours,
        });

        return jsonResult({
          success: true,
          message: `Subtask created under parent task ${parentTaskId}: "${title}"`,
          subtask: response,
          tip: "子任务创建后，请第一时间将状态更新为 in-progress 并开始执行",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create subtask: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

/**
 * 创建工作日志添加工具
 * 主要供 AI agent 在执行任务过程中持续记录工作进展，实现任务可追源性
 * 最佳实践：开始工作时记录 "started"，完成时记录 "completed"，遇到隐贾时记录 "blocked"
 */
export function createTaskWorklogAddTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Worklog Add",
    name: "task_worklog_add",
    description:
      "Record a work log entry for a task. Can be called by the task's assignee (worker agent) OR its supervisor (coordinator/parent agent who created the task). BEST PRACTICES: (1) log 'started' when you begin working, (2) log progress periodically for long-running tasks, (3) log 'completed' or 'failed' when done, (4) always log 'blocked' with details when you cannot proceed. This creates an audit trail essential for task-driven work.",
    parameters: TaskWorklogAddToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const action = readStringParam(params, "action", { required: true });
      const details = readStringParam(params, "details", { required: true });
      const duration = typeof params.duration === "number" ? params.duration : undefined;
      const result = readStringParam(params, "result");
      const errorMessage = readStringParam(params, "errorMessage");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const worklogId = `worklog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const response = await callGatewayTool("task.worklog.add", gatewayOpts, {
          taskId,
          agentId: opts?.currentAgentId || "system",
          action,
          details,
          duration,
          result: result || undefined,
          errorMessage: errorMessage || undefined,
          id: worklogId,
          createdAt: Date.now(),
        });

        // 如果 action 是 blocked，提醒同时更新任务状态
        const blockingActions = ["blocked", "stuck", "waiting", "cannot-proceed"];
        const isBlocking = blockingActions.some((a) => action.toLowerCase().includes(a));

        return jsonResult({
          success: true,
          message: `Work log recorded for task ${taskId}: [${action}]`,
          worklog: response || {
            id: worklogId,
            taskId,
            agentId: opts?.currentAgentId,
            action,
            details,
            duration,
            result,
          },
          reminder: isBlocking
            ? "任务被阻塞时，建议同时调用 task_update 将任务状态更新为 blocked，并添加阻塞原因注释"
            : undefined,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to add work log: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}
