/**
 * Phase 5 Gateway RPC Methods
 * 智能助手管理、组织架构和权限管理的 RPC 方法处理器
 */

import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { approvalSystem } from "../../permissions/approval-system.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 辅助函数：查找智能助手
 */
function findAgent(config: any, agentId: string): any | undefined {
  const agents = config?.agents?.list || [];
  return agents.find((a: any) => a.id === agentId);
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
        | "rejected"
        | "expired"
        | "cancelled"
        | undefined;
      const limit = typeof params?.limit === "number" ? params.limit : 100;
      const offset = typeof params?.offset === "number" ? params.offset : 0;
      const approverId = params?.approverId ? String(params.approverId) : undefined;

      console.log(`[Phase5] List approvals: status=${status}, limit=${limit}, offset=${offset}`);

      // 获取所有请求
      let requests = Array.from(approvalSystem["requests"].values());

      // 如果指定了 approverId，只返回该审批者的请求
      if (approverId) {
        requests = requests.filter(
          (req) => req.approvers.includes(approverId) || req.requesterId === approverId,
        );
      }

      // 按状态过滤
      if (status) {
        requests = requests.filter((req) => req.status === status);
      }

      // 按时间倒序排序
      requests.sort((a, b) => b.createdAt - a.createdAt);

      // 分页
      const total = requests.length;
      const paginatedRequests = requests.slice(offset, offset + limit);

      respond(
        true,
        {
          requests: paginatedRequests,
          total,
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

  /**
   * 响应审批请求（批准或拒绝）
   */
  "approvals.respond": async ({ params, respond }) => {
    try {
      const requestId = String(params?.requestId ?? "").trim();
      const approverId = String(params?.approverId ?? "").trim();
      const action = params?.action as "approve" | "reject";
      const comment = params?.comment ? String(params.comment) : undefined;

      if (!requestId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
        return;
      }

      if (!approverId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approverId is required"));
        return;
      }

      if (action !== "approve" && action !== "reject") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "action must be 'approve' or 'reject'"),
        );
        return;
      }

      // 执行审批操作
      if (action === "approve") {
        await approvalSystem.approve(requestId, approverId, comment);
      } else {
        await approvalSystem.reject(requestId, approverId, comment);
      }

      // 获取更新后的请求
      const request = approvalSystem.getRequest(requestId);

      respond(true, { success: true, request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to respond to approval: ${String(error)}`),
      );
    }
  },

  /**
   * 取消审批请求
   */
  "approvals.cancel": async ({ params, respond }) => {
    try {
      const requestId = String(params?.requestId ?? "").trim();
      const cancellerId = String(params?.cancellerId ?? "").trim();

      if (!requestId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
        return;
      }

      if (!cancellerId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "cancellerId is required"),
        );
        return;
      }

      await approvalSystem.cancel(requestId, cancellerId);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to cancel approval: ${String(error)}`),
      );
    }
  },

  /**
   * 获取审批统计信息
   */
  "approvals.stats": async ({ params, respond }) => {
    try {
      const stats = approvalSystem.getStats();
      respond(true, stats, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get approval stats: ${String(error)}`),
      );
    }
  },

  /**
   * 更新模型账号配置
   */
  "agent.modelAccounts.update": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const config = params?.config;
      if (!config || typeof config !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config is required"));
        return;
      }

      // 加载当前配置
      const currentConfig = loadConfig();
      const agents = currentConfig?.agents?.list || [];
      const agentIndex = agents.findIndex((a: any) => a.id === agentId);

      if (agentIndex === -1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      // 更新模型账号配置
      (agents[agentIndex] as any).modelAccounts = config;

      // 保存配置
      const updatedConfig = {
        ...currentConfig,
        agents: {
          ...currentConfig.agents,
          list: agents,
        },
      };

      await writeConfigFile(updatedConfig);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to update model accounts config: ${String(error)}`,
        ),
      );
    }
  },

  /**
   * 更新通道策略配置
   */
  "agent.channelPolicies.update": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const config = params?.config;
      if (!config || typeof config !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config is required"));
        return;
      }

      // 加载当前配置
      const currentConfig = loadConfig();
      const agents = currentConfig?.agents?.list || [];
      const agentIndex = agents.findIndex((a: any) => a.id === agentId);

      if (agentIndex === -1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      // 更新通道策略配置
      (agents[agentIndex] as any).channelPolicies = config;

      // 保存配置
      const updatedConfig = {
        ...currentConfig,
        agents: {
          ...currentConfig.agents,
          list: agents,
        },
      };

      await writeConfigFile(updatedConfig);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to update channel policies config: ${String(error)}`,
        ),
      );
    }
  },
};
