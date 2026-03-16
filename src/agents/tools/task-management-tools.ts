/**
 * 任务管理工具
 *
 * 提供创建、查询、更新、完成任务的工具
 * 让智能体能够管理待办事项和任务列表
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

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
 */
const TaskStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
]);

/**
 * task_create 工具参数 schema
 */
const TaskCreateToolSchema = Type.Object({
  /** 任务标题（必填） */
  title: Type.String({ minLength: 1, maxLength: 256 }),
  /** 任务描述（可选） */
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  /** 任务优先级（可选，默认medium） */
  priority: Type.Optional(TaskPriority),
  /** 截止时间（可选，ISO 8601格式） */
  dueDate: Type.Optional(Type.String()),
  /** 负责人/执行者（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 任务标签（可选） */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 所属项目ID（可选，用于多项目隔离，如 "wo-shi-renlei"） */
  project: Type.Optional(Type.String({ maxLength: 128 })),
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
  /** 过滤标签（可选） */
  tag: Type.Optional(Type.String({ maxLength: 32 })),
  /** 只显示今日到期的任务（可选） */
  dueToday: Type.Optional(Type.Boolean()),
  /** 最大返回数量（可选，默认20） */
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  /** 过滤所属项目（可选，如 "wo-shi-renlei"） */
  project: Type.Optional(Type.String({ maxLength: 128 })),
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
 * 创建任务创建工具
 */
export function createTaskCreateTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Create",
    name: "task_create",
    description:
      "Create a new task with title, description, priority, due date, assignee, tags and optional project ID for multi-project isolation. Returns the created task with a unique ID.",
    parameters: TaskCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const title = readStringParam(params, "title", { required: true });
      const description = readStringParam(params, "description");
      const priority = readStringParam(params, "priority") || "medium";
      const dueDate = readStringParam(params, "dueDate");
      const assignee = readStringParam(params, "assignee") || opts?.currentAgentId;
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const project = readStringParam(params, "project");
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
          status: "pending",
          createdAt: Date.now(),
          // 工具层以 pending 表示待处理，后端映射为存储层的 todo
          projectId: project || undefined,
        });

        return jsonResult({
          success: true,
          message: `Task created: "${title}"`,
          task: {
            id: taskId,
            title,
            description,
            status: "pending",
            priority,
            dueDate,
            assignee,
            tags,
            project: project || undefined,
            createdAt: Date.now(),
          },
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
export function createTaskListTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task List",
    name: "task_list",
    description:
      "List tasks with optional filters: status (pending/in_progress/completed/cancelled), priority, assignee, tag, dueToday, project (project ID for multi-project isolation). Returns a list of tasks matching the criteria.",
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
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 task.list RPC
        // 注意：不将 currentAgentId 作为默认 assignee 过滤条件
        // 否则 coordinator 调用时只能看到分配给自己的任务，无法查看团队整体任务
        const response = await callGatewayTool("task.list", gatewayOpts, {
          status,
          priority,
          assignee: assignee || undefined,
          tag,
          dueToday,
          limit,
          projectId: project || undefined,
        });

        // 服务端返回 { tasks, total } 对象
        const resp = response as { tasks?: unknown[]; total?: number } | unknown[] | null;
        const tasks = Array.isArray(resp)
          ? resp
          : resp && typeof resp === "object" && "tasks" in resp && Array.isArray(resp.tasks)
            ? resp.tasks
            : [];

        return jsonResult({
          success: true,
          count: tasks.length,
          tasks,
          filters: {
            status,
            priority,
            assignee,
            tag,
            dueToday,
            project: project || undefined,
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
      "Update an existing task's title, description, status, priority, due date, assignee or tags. At least one field must be provided.",
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
        !removeTags
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
  /** 当前操作者的智能助手ID */
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
