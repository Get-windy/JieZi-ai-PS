/**
 * 智能体生命周期管理工具
 *
 * 提供创建、启动、停止、销毁智能体的完整生命周期管理
 * 仅限有管理员权限的智能体使用
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";

/**
 * 智能体角色/职能枚举
 */
const AgentRole = Type.Union([
  Type.Literal("coordinator"), // 项目协调员
  Type.Literal("developer"), // 开发工程师
  Type.Literal("backend-dev"), // 后端开发
  Type.Literal("frontend-dev"), // 前端开发
  Type.Literal("qa-engineer"), // 质量工程师
  Type.Literal("devops"), // 运维工程师
  Type.Literal("product-manager"), // 产品经理
  Type.Literal("analyst"), // 分析师
  Type.Literal("designer"), // 设计师
  Type.Literal("writer"), // 文档撰写
  Type.Literal("assistant"), // 通用助手
  Type.Literal("custom"), // 自定义角色
]);

/**
 * agent_spawn 工具参数 schema
 */
const AgentSpawnToolSchema = Type.Object({
  /** 智能体ID（必填，唯一标识） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 智能体名称（必填） */
  name: Type.String({ minLength: 1, maxLength: 128 }),
  /** 角色/职能（必填） */
  role: AgentRole,
  /** 描述（可选） */
  description: Type.Optional(Type.String({ maxLength: 500 })),
  /** 工作空间路径（可选） */
  workspace: Type.Optional(Type.String({ maxLength: 256 })),
  /** 使用的模型（可选，默认使用系统配置） */
  model: Type.Optional(Type.String({ maxLength: 64 })),
  /** 系统提示词（可选） */
  systemPrompt: Type.Optional(Type.String({ maxLength: 4000 })),
  /** 技能列表（可选） */
  skills: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  /** 初始配置（可选） */
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  /** 标签（可选） */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 是否立即启动（可选，默认true） */
  autoStart: Type.Optional(Type.Boolean()),
  /** 父智能体ID（可选，用于建立层级关系） */
  parentAgentId: Type.Optional(Type.String({ maxLength: 64 })),
  /**
   * 用户明确授权的确认令牌。
   * 调用此工具前，必须先向用户展示将要创建的 agent 信息，
   * 并要求用户回复 "CONFIRM_CREATE_AGENT_<agentId>" 作为确认。
   * 将用户的原始确认文本原样填入此字段。
   */
  userConfirmation: Type.String({ minLength: 1 }),
});

/**
 * agent_start 工具参数 schema
 */
const AgentStartToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 启动参数（可选） */
  startupParams: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

/**
 * agent_stop 工具参数 schema
 */
const AgentStopToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 是否强制停止（可选） */
  force: Type.Optional(Type.Boolean()),
  /** 停止原因（可选） */
  reason: Type.Optional(Type.String({ maxLength: 256 })),
});

/**
 * agent_restart 工具参数 schema
 */
const AgentRestartToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 重启延迟（毫秒，可选） */
  delay: Type.Optional(Type.Number({ minimum: 0, maximum: 60000 })),
  /** 重启原因（可选） */
  reason: Type.Optional(Type.String({ maxLength: 256 })),
});

/**
 * agent_configure 工具参数 schema
 */
const AgentConfigureToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新名称（可选） */
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  /** 新描述（可选） */
  description: Type.Optional(Type.String({ maxLength: 500 })),
  /** 新模型（可选） */
  model: Type.Optional(Type.String({ maxLength: 64 })),
  /** 新系统提示词（可选） */
  systemPrompt: Type.Optional(Type.String({ maxLength: 4000 })),
  /** 添加技能（可选） */
  addSkills: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  /** 移除技能（可选） */
  removeSkills: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  /** 配置更新（可选） */
  configUpdates: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  /** 添加标签（可选） */
  addTags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 移除标签（可选） */
  removeTags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
});

/**
 * agent_destroy 工具参数 schema
 */
const AgentDestroyToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 是否删除工作空间（可选） */
  deleteWorkspace: Type.Optional(Type.Boolean()),
  /** 是否删除会话数据（可选） */
  deleteSessions: Type.Optional(Type.Boolean()),
  /** 确认标识（必填，防止误删除） */
  confirmDestroy: Type.Boolean(),
});

/**
 * agent_clone 工具参数 schema
 */
const AgentCloneToolSchema = Type.Object({
  /** 源智能体ID（必填） */
  sourceAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新智能体ID（必填） */
  newAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新名称（可选，默认使用源名称+副本） */
  newName: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  /** 是否克隆工作空间（可选） */
  cloneWorkspace: Type.Optional(Type.Boolean()),
  /** 是否克隆技能配置（可选，默认true） */
  cloneSkills: Type.Optional(Type.Boolean()),
  /** 是否克隆系统提示词（可选，默认true） */
  cloneSystemPrompt: Type.Optional(Type.Boolean()),
});

/**
 * 创建智能体生成工具
 */
export function createAgentSpawnTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Spawn",
    name: "agent_spawn",
    description:
      "Create and spawn a new agent with full configuration. " +
      "THIS TOOL REQUIRES EXPLICIT USER CONFIRMATION BEFORE EXECUTION. " +
      "BEFORE calling this tool you MUST: " +
      "1) Show the user a clear summary of the agent to be created (agentId, name, role, workspace). " +
      "2) Ask the user to confirm by explicitly typing \"CONFIRM_CREATE_AGENT_<agentId>\". " +
      "3) Pass the user's exact confirmation text in the userConfirmation field. " +
      "DO NOT create agents silently or based on vague instructions.",
    parameters: AgentSpawnToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const name = readStringParam(params, "name", { required: true });
      const role = readStringParam(params, "role", { required: true });
      const description = readStringParam(params, "description");
      const workspace = readStringParam(params, "workspace");
      const model = readStringParam(params, "model");
      const _systemPrompt = readStringParam(params, "systemPrompt");
      const skills = Array.isArray(params.skills) ? params.skills.map(String) : [];
      const _config = typeof params.config === "object" ? params.config : {};
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const autoStart = typeof params.autoStart === "boolean" ? params.autoStart : true;
      const parentAgentId = readStringParam(params, "parentAgentId");
      const userConfirmation = readStringParam(params, "userConfirmation", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      // 强制校验用户确认令牌
      const expectedToken = `CONFIRM_CREATE_AGENT_${agentId}`;
      if (!userConfirmation.includes(expectedToken)) {
        return jsonResult({
          success: false,
          blocked: true,
          pendingConfirmation: true,
          agentPreview: {
            agentId,
            name,
            role,
            description,
            workspace: workspace || `agents/${agentId}`,
            model: model || "default",
          },
          error:
            `操作被阻止：未收到有效的用户授权确认。` +
            `\n\n请向用户展示以下将要创建的智能体信息，并等待确认：` +
            `\n- 智能体 ID：${agentId}` +
            `\n- 名称：${name}` +
            `\n- 角色：${role}` +
            `\n- 描述：${description || '无'}` +
            `\n- 工作空间：${workspace || `agents/${agentId}`}` +
            `\n- 模型：${model || '默认'}` +
            `\n\n请用户回复以下确认令牌：\n  ${expectedToken}` +
            `\n\n收到确认后，将用户原始回复文本填入 userConfirmation 字段再次调用。`,
          requiredConfirmationToken: expectedToken,
        });
      }

      try {
        // 调用 agent.create RPC（gateway 只注册了 agent.create，无 agent.spawn）
        await callGatewayTool("agent.create", gatewayOpts, {
          id: agentId,
          name,
          workspace: workspace || `agents/${agentId}`,
        });

        return jsonResult({
          success: true,
          message: `Agent "${name}" (${agentId}) spawned successfully`,
          agent: {
            id: agentId,
            name,
            role,
            description,
            workspace: workspace || `agents/${agentId}`,
            model: model || "default",
            skills,
            tags,
            status: autoStart ? "starting" : "created",
            createdBy: opts?.currentAgentId,
            createdAt: Date.now(),
            ...(parentAgentId ? { parentAgentId } : {}),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to spawn agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体启动工具
 */
export function createAgentStartTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Start",
    name: "agent_start",
    description:
      "Start a stopped agent. The agent will initialize its runtime, load configuration and become available for tasks. Requires admin permission.",
    parameters: AgentStartToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const startupParams = typeof params.startupParams === "object" ? params.startupParams : {};
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.start RPC
        await callGatewayTool("agent.start", gatewayOpts, {
          targetAgentId,
          startupParams,
          startedBy: opts?.currentAgentId,
          startedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Agent "${targetAgentId}" started successfully`,
          agent: {
            id: targetAgentId,
            status: "running",
            startedAt: Date.now(),
            startedBy: opts?.currentAgentId,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体停止工具
 */
export function createAgentStopTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Stop",
    name: "agent_stop",
    description:
      "Stop a running agent. The agent will gracefully shut down, save state and stop accepting new tasks. Use force=true for immediate shutdown. Requires admin permission.",
    parameters: AgentStopToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const force = typeof params.force === "boolean" ? params.force : false;
      const reason = readStringParam(params, "reason");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.stop RPC
        await callGatewayTool("agent.stop", gatewayOpts, {
          targetAgentId,
          force,
          reason,
          stoppedBy: opts?.currentAgentId,
          stoppedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Agent "${targetAgentId}" stopped ${force ? "forcefully" : "gracefully"}`,
          agent: {
            id: targetAgentId,
            status: "stopped",
            stoppedAt: Date.now(),
            stoppedBy: opts?.currentAgentId,
            reason,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to stop agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体重启工具
 */
export function createAgentRestartTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Restart",
    name: "agent_restart",
    description:
      "Restart an agent. This will stop and then start the agent, reloading all configuration. Useful for applying config changes. Requires admin permission.",
    parameters: AgentRestartToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const delay = typeof params.delay === "number" ? params.delay : 0;
      const reason = readStringParam(params, "reason");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.restart RPC
        await callGatewayTool("agent.restart", gatewayOpts, {
          targetAgentId,
          delay,
          reason,
          restartedBy: opts?.currentAgentId,
          restartedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Agent "${targetAgentId}" restart initiated${delay > 0 ? ` (${delay}ms delay)` : ""}`,
          agent: {
            id: targetAgentId,
            status: "restarting",
            restartedAt: Date.now(),
            restartedBy: opts?.currentAgentId,
            reason,
            delay,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to restart agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体配置工具
 */
export function createAgentConfigureTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Configure",
    name: "agent_configure",
    description:
      "Update agent configuration including name, description, model, system prompt, skills and tags. Changes may require restart to take effect. Requires admin permission.",
    parameters: AgentConfigureToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const name = readStringParam(params, "name");
      const description = readStringParam(params, "description");
      const model = readStringParam(params, "model");
      const systemPrompt = readStringParam(params, "systemPrompt");
      const addSkills = Array.isArray(params.addSkills) ? params.addSkills.map(String) : undefined;
      const removeSkills = Array.isArray(params.removeSkills)
        ? params.removeSkills.map(String)
        : undefined;
      const configUpdates =
        typeof params.configUpdates === "object" ? params.configUpdates : undefined;
      const addTags = Array.isArray(params.addTags) ? params.addTags.map(String) : undefined;
      const removeTags = Array.isArray(params.removeTags)
        ? params.removeTags.map(String)
        : undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      // 检查是否至少提供了一个更新字段
      if (
        !name &&
        !description &&
        !model &&
        !systemPrompt &&
        !addSkills &&
        !removeSkills &&
        !configUpdates &&
        !addTags &&
        !removeTags
      ) {
        return jsonResult({
          success: false,
          error: "At least one configuration field must be provided",
        });
      }

      try {
        // 调用 agent.configure RPC
        const response = await callGatewayTool("agent.configure", gatewayOpts, {
          targetAgentId,
          name,
          description,
          model,
          systemPrompt,
          addSkills,
          removeSkills,
          configUpdates,
          addTags,
          removeTags,
          configuredBy: opts?.currentAgentId,
          configuredAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Agent "${targetAgentId}" configuration updated`,
          agent: {
            id: targetAgentId,
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
            ...(model ? { model } : {}),
            configuredAt: Date.now(),
            configuredBy: opts?.currentAgentId,
            requiresRestart: response.requiresRestart || false,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to configure agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体销毁工具
 */
export function createAgentDestroyTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Destroy",
    name: "agent_destroy",
    description:
      "DESTRUCTIVE: Permanently destroy an agent. This will stop the agent, delete configuration, and optionally remove workspace and sessions. Cannot be undone. Requires admin permission and confirmation.",
    parameters: AgentDestroyToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const deleteWorkspace =
        typeof params.deleteWorkspace === "boolean" ? params.deleteWorkspace : false;
      const deleteSessions =
        typeof params.deleteSessions === "boolean" ? params.deleteSessions : false;
      const confirmDestroy =
        typeof params.confirmDestroy === "boolean" ? params.confirmDestroy : false;
      const gatewayOpts = readGatewayCallOptions(params);

      // 安全检查：必须确认
      if (!confirmDestroy) {
        return jsonResult({
          success: false,
          error: "Destruction must be confirmed by setting confirmDestroy=true",
        });
      }

      // 安全检查：不能销毁默认智能体
      if (targetAgentId === "main") {
        return jsonResult({
          success: false,
          error: "Cannot destroy the default agent 'main'",
        });
      }

      // 安全检查：不能销毁自己
      if (targetAgentId === opts?.currentAgentId) {
        return jsonResult({
          success: false,
          error: "Cannot destroy yourself",
        });
      }

      try {
        // 调用 agent.destroy RPC
        await callGatewayTool("agent.destroy", gatewayOpts, {
          targetAgentId,
          deleteWorkspace,
          deleteSessions,
          destroyedBy: opts?.currentAgentId,
          destroyedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Agent "${targetAgentId}" destroyed permanently`,
          destroyed: {
            agentId: targetAgentId,
            workspaceDeleted: deleteWorkspace,
            sessionsDeleted: deleteSessions,
            destroyedBy: opts?.currentAgentId,
            destroyedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to destroy agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体克隆工具
 */
export function createAgentCloneTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Clone",
    name: "agent_clone",
    description:
      "Clone an existing agent with all its configuration. Creates a new agent with copied settings, skills, and optionally workspace. Useful for creating similar agents. Requires admin permission.",
    parameters: AgentCloneToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sourceAgentId = readStringParam(params, "sourceAgentId", { required: true });
      const newAgentId = readStringParam(params, "newAgentId", { required: true });
      const newName = readStringParam(params, "newName");
      const cloneWorkspace =
        typeof params.cloneWorkspace === "boolean" ? params.cloneWorkspace : false;
      const cloneSkills = typeof params.cloneSkills === "boolean" ? params.cloneSkills : true;
      const cloneSystemPrompt =
        typeof params.cloneSystemPrompt === "boolean" ? params.cloneSystemPrompt : true;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.clone RPC
        await callGatewayTool("agent.clone", gatewayOpts, {
          sourceAgentId,
          newAgentId,
          newName: newName || `${sourceAgentId} (Clone)`,
          cloneWorkspace,
          cloneSkills,
          cloneSystemPrompt,
          clonedBy: opts?.currentAgentId,
          clonedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Agent "${sourceAgentId}" cloned to "${newAgentId}"`,
          clone: {
            sourceId: sourceAgentId,
            newId: newAgentId,
            newName: newName || `${sourceAgentId} (Clone)`,
            workspaceCloned: cloneWorkspace,
            skillsCloned: cloneSkills,
            systemPromptCloned: cloneSystemPrompt,
            clonedBy: opts?.currentAgentId,
            clonedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to clone agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
