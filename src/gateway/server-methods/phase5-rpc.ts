/**
 * Phase 5 Gateway RPC Methods
 * 智能助手管理、组织架构和权限管理的 RPC 方法处理器
 */

import type { GatewayRequestHandlers } from "./types.js";
import { listAgentIds } from "../../agents/agent-scope.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { approvalSystem } from "../../permissions/approval-system.js";
import { groupWorkspaceManager } from "../../workspace/group-workspace.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 辅助函数：查找智能助手
 * 支持配置文件中的 agent 和系统中存在的虚拟 agent
 */
function findAgent(config: any, agentId: string): any | undefined {
  const agents = config?.agents?.list || [];

  // 首先在配置文件中查找
  const configuredAgent = agents.find((a: any) => a.id === agentId);
  if (configuredAgent) {
    return configuredAgent;
  }

  // 如果配置文件中没有，检查是否是系统中存在的 agent
  const systemAgentIds = listAgentIds(config);
  if (systemAgentIds.includes(agentId)) {
    // 返回一个虚拟 agent 对象，使用默认配置
    return {
      id: agentId,
      // 虚拟 agent 标记，表示不在配置文件中
      _virtual: true,
    };
  }

  return undefined;
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
        const systemAgentIds = listAgentIds(config);
        const availableIds = systemAgentIds.join(", ");
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Agent "${agentId}" not found. Available agents: ${availableIds}`,
          ),
        );
        return;
      }

      // 返回模型账号配置
      const modelAccountsConfig = (agent).modelAccounts || {
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
        const systemAgentIds = listAgentIds(config);
        const availableIds = systemAgentIds.join(", ");
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Agent "${agentId}" not found. Available agents: ${availableIds}`,
          ),
        );
        return;
      }

      // 返回通道策略配置
      const channelPoliciesConfig = (agent).channelPolicies || {
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
   * 获取群组工作空间目录
   */
  "groups.workspace.getDir": async ({ respond }) => {
    try {
      const currentDir = groupWorkspaceManager.getRootDir();
      respond(true, { dir: currentDir }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get group workspace dir: ${String(error)}`),
      );
    }
  },

  /**
   * 设置群组工作空间目录（同时持久化到 openclaw.json 的 groups.workspace.root）
   */
  "groups.workspace.setDir": async ({ params, respond }) => {
    try {
      const dir = params?.dir ? String(params.dir).trim() : "";
      if (!dir) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "dir is required"));
        return;
      }

      // 应用到内存中的管理器
      groupWorkspaceManager.setRootDir(dir);

      // 持久化到 openclaw.json
      const currentConfig = loadConfig();
      const updatedConfig = {
        ...currentConfig,
        groups: {
          ...(currentConfig as any).groups,
          workspace: {
            ...(currentConfig as any).groups?.workspace,
            root: dir,
          },
        },
      };
      await writeConfigFile(updatedConfig);

      respond(true, { success: true, dir }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to set group workspace dir: ${String(error)}`),
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
        // 如果 agent 不在配置文件中，检查是否是系统中存在的虚拟 agent
        const systemAgentIds = listAgentIds(currentConfig);
        if (!systemAgentIds.includes(agentId)) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
          );
          return;
        }

        // 自动添加虚拟 agent 到配置文件
        (agents as any[]).push({ id: agentId, modelAccounts: config } as any);
      } else {
        // 更新现有 agent 的模型账号配置
        (agents[agentIndex] as any).modelAccounts = config;
      }

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
        // 如果 agent 不在配置文件中，检查是否是系统中存在的虚拟 agent
        const systemAgentIds = listAgentIds(currentConfig);
        if (!systemAgentIds.includes(agentId)) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
          );
          return;
        }

        // 自动添加虚拟 agent 到配置文件
        (agents as any[]).push({ id: agentId, channelPolicies: config } as any);
      } else {
        // 更新现有 agent 的通道策略配置
        (agents[agentIndex] as any).channelPolicies = config;
      }

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

  /**
   * 迁移单个群组工作空间到新目录
   */
  "groups.workspace.migrate": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId).trim() : "";
      const newDir = params?.newDir ? String(params.newDir).trim() : "";

      if (!groupId || !newDir) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId and newDir are required"),
        );
        return;
      }

      const oldDir = groupWorkspaceManager.getGroupWorkspaceDir(groupId);
      if (!oldDir) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Group workspace not found for "${groupId}"`),
        );
        return;
      }

      const newDirResolved = path.resolve(newDir);
      const oldDirResolved = path.resolve(oldDir);

      if (oldDirResolved === newDirResolved) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "New path is the same as the current path"),
        );
        return;
      }

      // 复制目录递归
      const copyDir = async (src: string, dest: string): Promise<number> => {
        await fs.mkdir(dest, { recursive: true });
        let count = 0;
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            count += await copyDir(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
            count++;
          }
        }
        return count;
      };

      let migrated = false;
      let fileCount = 0;
      try {
        await fs.access(oldDirResolved);
        fileCount = await copyDir(oldDirResolved, newDirResolved);
        migrated = true;
      } catch (copyErr) {
        // 源目录不存在则只创建目标目录，否则抛出真实错误
        let isNotExist = false;
        try { await fs.access(oldDirResolved); } catch { isNotExist = true; }
        if (isNotExist) {
          await fs.mkdir(newDirResolved, { recursive: true });
        } else {
          throw copyErr;
        }
      }

      // 更新群组工作空间管理器中的路径（内存）
      groupWorkspaceManager.updateGroupWorkspaceDir(groupId, newDirResolved);

      // 持久化到 openclaw.json： groups.overrides.<groupId>.workspaceDir
      const currentConfig = loadConfig();
      const existingOverrides = (currentConfig as any)?.groups?.overrides ?? {};
      const updatedConfig = {
        ...currentConfig,
        groups: {
          ...(currentConfig as any).groups,
          overrides: {
            ...existingOverrides,
            [groupId]: {
              ...existingOverrides[groupId],
              workspaceDir: newDirResolved,
            },
          },
        },
      };
      await writeConfigFile(updatedConfig);

      respond(true, { success: true, groupId, oldDir: oldDirResolved, newDir: newDirResolved, migrated, fileCount }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to migrate group workspace: ${String(error)}`),
      );
    }
  },
};
