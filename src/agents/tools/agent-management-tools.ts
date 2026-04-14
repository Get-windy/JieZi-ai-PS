/**
 * 智能体管理工具
 *
 * 提供创建、更新、删除智能助手的工具
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";

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
  /**
   * 用户明确授权的确认令牌。
   * 调用此工具前，必须先向用户展示将要创建的 agent 信息，
   * 并要求用户回复 "CONFIRM_CREATE_AGENT_<agentId>" 作为确认。
   * 将用户的原始确认文本原样填入此字段。
   */
  userConfirmation: Type.String({ minLength: 1 }),
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
export function createAgentCreateTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Create",
    name: "agent_create",
    description:
      "Create a new agent with unique ID. " +
      "THIS TOOL REQUIRES EXPLICIT USER CONFIRMATION BEFORE EXECUTION. " +
      "BEFORE calling this tool you MUST: " +
      "1) Show the user a clear summary of the agent to be created (agentId, name, workspace). " +
      "2) Ask the user to confirm by explicitly typing \"CONFIRM_CREATE_AGENT_<agentId>\". " +
      "3) Pass the user's exact confirmation text in the userConfirmation field. " +
      "DO NOT create agents silently or based on vague instructions.",
    parameters: AgentCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const name = readStringParam(params, "name");
      const workspace = readStringParam(params, "workspace");
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
            name: name || agentId,
            workspace: workspace || `agents/${agentId}`,
          },
          error:
            `操作被阻止：未收到有效的用户授权确认。` +
            `\n\n请向用户展示以下将要创建的智能体信息，并等待确认：` +
            `\n- 智能体 ID：${agentId}` +
            `\n- 名称：${name || agentId}` +
            `\n- 工作空间：${workspace || `agents/${agentId}`}` +
            `\n\n请用户回复以下确认令牌：\n  ${expectedToken}` +
            `\n\n收到确认后，将用户原始回复文本填入 userConfirmation 字段再次调用。`,
          requiredConfirmationToken: expectedToken,
        });
      }

      // 令牌校验通过，执行实际创建
      try {
        await callGatewayTool("agent.create", gatewayOpts, {
          id: agentId,
          name: name || agentId,
          workspace: workspace || `agents/${agentId}`,
        });

        return jsonResult({
          success: true,
          message: `智能体 "${name || agentId}" (${agentId}) 已创建成功。`,
          agent: {
            id: agentId,
            name: name || agentId,
            workspace: workspace || `agents/${agentId}`,
            createdAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `创建智能体失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能助手更新工具
 */
export function createAgentUpdateTool(_opts?: {
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
        const _response = await callGatewayTool("agent.update", gatewayOpts, {
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
export function createAgentDeleteTool(_opts?: {
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

      // 安全检查：不能删除默认智能体
      if (agentId === "main") {
        return jsonResult({
          success: false,
          error: "Cannot delete the default agent 'main'",
        });
      }

      // 严格拦截：删除智能体必须经用户明确批准，不得自行决定
      return jsonResult({
        success: false,
        blocked: true,
        error:
          `删除智能体需要用户明确批准。请将以下信息告知用户并等待确认：` +
          `\n- 要删除的 agentId：${agentId}` +
          `\n- 删除理由：（请说明）` +
          `\n待用户明确批准后才可执行。严禁未经批准自行删除。`,
      });
    },
  };
}
