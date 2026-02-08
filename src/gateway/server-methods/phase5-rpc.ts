/**
 * Phase 5 Gateway RPC Methods
 * 智能助手管理、组织架构和权限管理的 RPC 方法处理器
 */

import type { ConfigAgent } from "../../config/types.js";
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 辅助函数：查找智能助手
 */
function findAgent(config: any, agentId: string): ConfigAgent | undefined {
  const agents = config?.agents?.list || [];
  return agents.find((a: ConfigAgent) => a.id === agentId);
}

/**
 * Phase 5 RPC 方法处理器
 */
export const phase5RpcHandlers: GatewayRequestHandlers = {
  /**
   * 获取模型账号配置
   */
  "agent.modelAccounts.get": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const config = loadConfig();
      const agent = findAgent(config, agentId);

      if (!agent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      // 返回模型账号配置
      const modelAccountsConfig = (agent as any).modelAccounts || {
        accounts: [],
        routingMode: "manual",
      };

      respond(true, modelAccountsConfig, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get model accounts config: ${String(error)}`),
      );
    }
  },

  /**
   * 获取通道策略配置
   */
  "agent.channelPolicies.get": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const config = loadConfig();
      const agent = findAgent(config, agentId);

      if (!agent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      // 返回通道策略配置
      const channelPoliciesConfig = (agent as any).channelPolicies || {
        bindings: [],
        defaultPolicy: "private",
      };

      respond(true, channelPoliciesConfig, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get channel policies config: ${String(error)}`,
        ),
      );
    }
  },

  /**
   * 获取权限配置
   */
  "permissions.get": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId).trim() : undefined;

      console.log(`[Phase5] Get permissions for agent: ${agentId || "all"}`);

      // 临时返回空数据 - TODO: 集成 Phase 3 权限系统
      respond(
        true,
        {
          agentId,
          permissions: [],
          scope: [],
          constraints: [],
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get permissions: ${String(error)}`),
      );
    }
  },

  /**
   * 获取审批请求列表
   */
  "approvals.list": async ({ params, respond }) => {
    try {
      const status = params?.status as
        | "pending"
        | "approved"
        | "denied"
        | "timeout"
        | "cancelled"
        | undefined;
      const limit = typeof params?.limit === "number" ? params.limit : 100;
      const offset = typeof params?.offset === "number" ? params.offset : 0;

      console.log(`[Phase5] List approvals: status=${status}, limit=${limit}, offset=${offset}`);

      // 临时返回空数据 - TODO: 集成 Phase 3 审批系统
      respond(
        true,
        {
          requests: [],
          total: 0,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list approvals: ${String(error)}`),
      );
    }
  },

  /**
   * 获取权限变更历史
   */
  "permissions.history": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId).trim() : undefined;
      const limit = typeof params?.limit === "number" ? params.limit : 100;
      const offset = typeof params?.offset === "number" ? params.offset : 0;

      console.log(
        `[Phase5] Get permissions history: agent=${agentId}, limit=${limit}, offset=${offset}`,
      );

      // 临时返回空数据 - TODO: 实现权限历史记录
      respond(
        true,
        {
          history: [],
          total: 0,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get permissions history: ${String(error)}`),
      );
    }
  },
};
