/**
 * 主动记忆写入工具（Letta/MemGPT 热路径模式）
 *
 * 借鉴 Letta (MemGPT) 的 core_memory_append 设计：
 * Agent 可以在对话中途主动调用 memory_save 将重要知识、决策、偏好写入长期记忆，
 * 而不是被动等待 context 溢出才触发 flush。
 *
 * 支持 Mem0 风格的语义去重：写入前先搜索同类记忆，
 * 通过 memory.save RPC 在服务端做 ADD/UPDATE/DELETE 判断。
 *
 * 支持 memory blocks 分层结构（borrowing from Letta）：
 * - preferences：用户偏好和习惯
 * - decisions：重要决策和选择
 * - context：项目/任务上下文
 * - facts：事实性知识和规则
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";

/**
 * 记忆命名空间（分层结构）
 */
const MemoryNamespace = Type.Union([
  Type.Literal("preferences"), // 用户偏好、习惯、个性化设置
  Type.Literal("decisions"), // 重要决策、选择、方向
  Type.Literal("context"), // 项目/任务上下文、当前状态
  Type.Literal("facts"), // 事实性知识、规则、约束
]);

/**
 * memory_save 工具参数 schema
 */
const MemorySaveToolSchema = Type.Object({
  /** 记忆内容（必填）——简洁的陈述式语言，不超过 500 字 */
  content: Type.String({ minLength: 1, maxLength: 2000 }),
  /** 记忆命名空间（可选，默认 context）——用于结构化分层检索 */
  namespace: Type.Optional(MemoryNamespace),
  /** 标签（可选）——用于快速过滤 */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }), { maxItems: 10 })),
  /** 是否强制覆盖已有同类记忆（可选，默认 false——走语义去重流程） */
  force: Type.Optional(Type.Boolean()),
});

/**
 * memory_delete 工具参数 schema
 */
const MemoryDeleteToolSchema = Type.Object({
  /** 要删除的记忆 ID（必填） */
  memoryId: Type.String({ minLength: 1 }),
});

/**
 * memory_list 工具参数 schema
 */
const MemoryListToolSchema = Type.Object({
  /** 按命名空间过滤（可选） */
  namespace: Type.Optional(MemoryNamespace),
  /** 按标签过滤（可选） */
  tag: Type.Optional(Type.String({ maxLength: 32 })),
  /** 最大返回数量（可选，默认 20） */
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
});

/**
 * 创建主动记忆写入工具
 *
 * 对标 Letta 的 core_memory_append：
 * Agent 在对话中途发现重要信息时主动写入，无需等待 /new 或 context 溢出。
 */
export function createMemorySaveTool(opts?: {
  /** 当前操作者的智能助手 ID */
  agentId?: string;
}): AnyAgentTool {
  return {
    label: "Memory Save",
    name: "memory_save",
    description:
      "Proactively save an important piece of knowledge, decision, preference, or context to long-term memory. " +
      "Use this IMMEDIATELY when you learn something important that should persist across sessions: " +
      "user preferences, key decisions, project context, facts, or constraints. " +
      "Namespaces: 'preferences' (user habits/settings), 'decisions' (choices made), " +
      "'context' (project/task state, default), 'facts' (rules/knowledge). " +
      "The backend automatically deduplicates semantically similar memories (Mem0-style ADD/UPDATE/DELETE). " +
      "Do NOT wait for /new or session reset—save proactively when the information matters.",
    parameters: MemorySaveToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const content = readStringParam(params, "content", { required: true });
      const namespace = (readStringParam(params, "namespace") || "context") as
        | "preferences"
        | "decisions"
        | "context"
        | "facts";
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const force = typeof params.force === "boolean" ? params.force : false;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("memory.save", gatewayOpts, {
          content,
          namespace,
          tags,
          force,
          agentId: opts?.agentId,
          callerAgentId: opts?.agentId, // 调用者身份，服务端用于越权检查（不可被 AI 篡改）
          savedAt: Date.now(),
        });

        const result = response as {
          id?: string;
          action?: string;
          merged?: boolean;
          mergedWith?: string;
        } | null;

        const action = result?.action ?? "added";
        const actionLabel =
          action === "updated"
            ? "updated existing memory"
            : action === "skipped"
              ? "skipped (semantically identical memory already exists)"
              : "saved to memory";

        return jsonResult({
          success: true,
          message: `Memory ${actionLabel}.`,
          memoryId: result?.id,
          namespace,
          action,
          merged: result?.merged ?? false,
          mergedWith: result?.mergedWith,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to save memory: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建记忆删除工具
 *
 * 对标 Mem0 的 DELETE 操作：
 * 当某条记忆已过期、错误或被新信息取代时，Agent 可主动删除。
 */
export function createMemoryDeleteTool(opts?: {
  /** 当前操作者的智能助手 ID */
  agentId?: string;
}): AnyAgentTool {
  return {
    label: "Memory Delete",
    name: "memory_delete",
    description:
      "Delete an outdated or incorrect memory entry by its ID. " +
      "Use this when a stored memory is no longer accurate, has been superseded, or was saved by mistake. " +
      "Use memory_search first to find the memoryId of the entry to delete.",
    parameters: MemoryDeleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const memoryId = readStringParam(params, "memoryId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        await callGatewayTool("memory.delete", gatewayOpts, {
          memoryId,
          agentId: opts?.agentId,
          callerAgentId: opts?.agentId, // 调用者身份，服务端用于越权检查
          deletedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Memory entry "${memoryId}" deleted successfully.`,
          memoryId,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_memory_save 工具参数 schema
 */
const ProjectMemorySaveToolSchema = Type.Object({
  /** 内容（必填） */
  content: Type.String({ minLength: 1, maxLength: 5000 }),
  /** 章节标题（可选，默认 General），用于分类存储 */
  section: Type.Optional(Type.String({ maxLength: 100 })),
  /** 标签（可选） */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }), { maxItems: 10 })),
  /** 项目 ID（可选），省略时自动从 agent 所属群组推断 */
  projectId: Type.Optional(Type.String()),
});

/**
 * project_memory_get 工具参数 schema
 */
const ProjectMemoryGetToolSchema = Type.Object({
  /** 按章节过滤（可选） */
  section: Type.Optional(Type.String({ maxLength: 100 })),
  /** 项目 ID（可选） */
  projectId: Type.Optional(Type.String()),
  /** 最大返回字符数（可选，默认 8000） */
  maxChars: Type.Optional(Type.Number({ minimum: 100, maximum: 20000 })),
});

/**
 * 创建项目共享记忆写入工具
 *
 * 将知识写入项目群组工作空间的 SHARED_MEMORY.md。
 * 所有项目成员均可读写。
 */
export function createProjectMemorySaveTool(opts?: { agentId?: string }): AnyAgentTool {
  return {
    label: "Project Memory Save",
    name: "project_memory_save",
    description:
      "Save an important piece of knowledge, decision, or context to the PROJECT SHARED MEMORY (SHARED_MEMORY.md). " +
      "All team members (agents) can read and write this shared memory. " +
      "Use this for project-wide facts: architecture decisions, API specs, design patterns, conventions, lessons learned. " +
      "Use 'section' to categorize content (e.g., 'Architecture', 'Decisions', 'APIs', 'Conventions'). " +
      "Do NOT use this for personal notes—use memory_save instead.",
    parameters: ProjectMemorySaveToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const content = readStringParam(params, "content", { required: true });
      const section = readStringParam(params, "section") || "General";
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const projectId = readStringParam(params, "projectId");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("memory.project.save", gatewayOpts, {
          content,
          section,
          tags,
          projectId: projectId || undefined,
          agentId: opts?.agentId,
        });

        const result = response as { id?: string; sharedMemoryPath?: string } | null;
        return jsonResult({
          success: true,
          message: `Saved to project shared memory (section: ${section}).`,
          id: result?.id,
          section,
          sharedMemoryPath: result?.sharedMemoryPath,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to save project memory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

/**
 * 创建项目共享记忆读取工具
 *
 * 读取项目群组工作空间的 SHARED_MEMORY.md，可按章节过滤。
 */
export function createProjectMemoryGetTool(opts?: { agentId?: string }): AnyAgentTool {
  return {
    label: "Project Memory Get",
    name: "project_memory_get",
    description:
      "Read the project shared memory (SHARED_MEMORY.md) that all team members share. " +
      "Use this to get project-wide context: architecture, decisions, conventions, API specs. " +
      "Use 'section' to read only a specific section and keep context small. " +
      "This is READ-ONLY retrieval—to write, use project_memory_save.",
    parameters: ProjectMemoryGetToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const section = readStringParam(params, "section");
      const projectId = readStringParam(params, "projectId");
      const maxChars = typeof params.maxChars === "number" ? params.maxChars : 8000;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("memory.project.list", gatewayOpts, {
          section: section || undefined,
          projectId: projectId || undefined,
          agentId: opts?.agentId,
          maxChars,
        });

        const result = response as {
          content?: string;
          sections?: string[];
          sharedMemoryPath?: string;
          empty?: boolean;
          truncated?: boolean;
        } | null;

        if (result?.empty) {
          return jsonResult({
            success: true,
            content: "",
            sections: [],
            message: "Project shared memory is empty or not found.",
          });
        }

        return jsonResult({
          success: true,
          content: result?.content ?? "",
          sections: result?.sections ?? [],
          sharedMemoryPath: result?.sharedMemoryPath,
          truncated: result?.truncated ?? false,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to read project memory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

/**
 * 创建结构化记忆列表工具
 *
 * 对标 Letta 的 memory blocks 分区查询：
 * 可按 namespace 过滤，快速检视指定分区的所有记忆条目。
 */
export function createMemoryListTool(opts?: {
  /** 当前操作者的智能助手 ID */
  agentId?: string;
}): AnyAgentTool {
  return {
    label: "Memory List",
    name: "memory_list",
    description:
      "List stored memory entries, optionally filtered by namespace or tag. " +
      "Use this to audit what is currently remembered, or to find memoryId values before updating/deleting. " +
      "For semantic search across memory content, use memory_search instead.",
    parameters: MemoryListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const namespace = readStringParam(params, "namespace");
      const tag = readStringParam(params, "tag");
      const limit = typeof params.limit === "number" ? params.limit : 20;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("memory.list", gatewayOpts, {
          agentId: opts?.agentId,
          namespace: namespace || undefined,
          tag: tag || undefined,
          limit,
        });

        const resp = response as { entries?: unknown[]; total?: number } | unknown[] | null;
        const entries = Array.isArray(resp)
          ? resp
          : resp && typeof resp === "object" && "entries" in resp && Array.isArray(resp.entries)
            ? resp.entries
            : [];

        return jsonResult({
          success: true,
          count: entries.length,
          entries,
          filters: { namespace, tag },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list memories: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
