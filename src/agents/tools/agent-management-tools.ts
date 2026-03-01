/**
 * 智能体管理工具
 * 
 * 提供创建、更新、删除智能助手的工具
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

/**
 * agent_create 工具参数 schema
 */
const AgentCreateToolSchema = Type.Object({
  /** 智能助手ID（必填，唯一标识） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 智能助手名称（可选，默认使用agentId） */
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  /** 工作空间路径（可选） */
  workspace: Type.Optional(Type.String()),
});

/**
 * agent_update 工具参数 schema
 */
const AgentUpdateToolSchema = Type.Object({
  /** 智能助手ID（必填） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新名称（可选） */
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  /** 新工作空间路径（可选） */
  workspace: Type.Optional(Type.String()),
});

/**
 * agent_delete 工具参数 schema
 */
const AgentDeleteToolSchema = Type.Object({
  /** 智能助手ID（必填） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 是否删除工作空间（可选，默认false） */
  deleteWorkspace: Type.Optional(Type.Boolean()),
});

/**
 * 创建智能助手创建工具
 */
export function createAgentCreateTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Create",
    name: "agent_create",
    description:
      "Create a new agent with unique ID. Optionally specify name and workspace path. The agent will have its own workspace directory and can be configured independently.",
    parameters: AgentCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const name = readStringParam(params, "name");
      const workspace = readStringParam(params, "workspace");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.create RPC
        const response = await callGatewayTool("agent.create", gatewayOpts, {
          id: agentId,
          name: name || agentId,
          workspace,
        });

        return jsonResult({
          success: true,
          message: `Agent "${agentId}" created successfully`,
          agent: {
            id: agentId,
            name: name || agentId,
            workspace: workspace || `default workspace for ${agentId}`,
            createdAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能助手更新工具
 */
export function createAgentUpdateTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Update",
    name: "agent_update",
    description:
      "Update an existing agent's name or workspace. At least one field (name or workspace) must be provided.",
    parameters: AgentUpdateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const name = readStringParam(params, "name");
      const workspace = readStringParam(params, "workspace");
      const gatewayOpts = readGatewayCallOptions(params);

      if (!name && !workspace) {
        return jsonResult({
          success: false,
          error: "At least one field (name or workspace) must be provided",
        });
      }

      try {
        // 调用 agent.update RPC
        const response = await callGatewayTool("agent.update", gatewayOpts, {
          id: agentId,
          name,
          workspace,
        });

        return jsonResult({
          success: true,
          message: `Agent "${agentId}" updated successfully`,
          agent: {
            id: agentId,
            name,
            workspace,
            updatedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能助手删除工具
 */
export function createAgentDeleteTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Delete",
    name: "agent_delete",
    description:
      "Delete an agent. CAUTION: This is a destructive operation. The default agent 'main' cannot be deleted. Optionally delete the agent's workspace directory.",
    parameters: AgentDeleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const deleteWorkspace = typeof params.deleteWorkspace === "boolean" ? params.deleteWorkspace : false;
      const gatewayOpts = readGatewayCallOptions(params);

      // 安全检查：不能删除默认智能体
      if (agentId === "main") {
        return jsonResult({
          success: false,
          error: "Cannot delete the default agent 'main'",
        });
      }

      try {
        // 调用 agent.delete RPC
        const response = await callGatewayTool("agent.delete", gatewayOpts, {
          id: agentId,
          deleteWorkspace,
        });

        return jsonResult({
          success: true,
          message: `Agent "${agentId}" deleted successfully`,
          deleted: {
            agentId,
            workspaceDeleted: deleteWorkspace,
            deletedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to delete agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

