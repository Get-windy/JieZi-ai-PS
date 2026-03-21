/**
 * 权限管理系统 Gateway RPC Handlers
 *
 * 提供权限授予、撤销、委托等高级权限管理功能
 */

import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";

/**
 * 权限变更记录
 */
interface PermissionChange {
  id: string;
  operatorId: string;
  targetId: string;
  operation: "grant" | "revoke" | "delegate";
  permission: string;
  details?: Record<string, unknown>;
  timestamp: number;
  reason?: string;
}

// 内存存储（生产环境应持久化）
const permissionChanges = new Map<string, PermissionChange>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const permissionManagementHandlers: GatewayRequestHandlers = {
  /**
   * permission_mgmt.grant - 授予权限
   */
  "permission_mgmt.grant": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(
        typeof params.operatorId === "string" ? params.operatorId : "",
      );
      const targetId = normalizeAgentId(typeof params.targetId === "string" ? params.targetId : "");
      const permission = typeof params.permission === "string" ? params.permission : "";
      const scope = typeof params.scope === "string" ? params.scope : "all";
      const reason = typeof params.reason === "string" ? params.reason : "";

      if (!operatorId || !targetId || !permission) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "operatorId, targetId, and permission are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);

      const target = agents.find((a) => normalizeAgentId(a.id) === targetId);
      if (!target) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Target agent ${targetId} not found`),
        );
        return;
      }

      const changeId = generateId("perm_change");
      const change: PermissionChange = {
        id: changeId,
        operatorId,
        targetId,
        operation: "grant",
        permission,
        details: { scope },
        timestamp: Date.now(),
        reason,
      };

      permissionChanges.set(changeId, change);

      respond(true, {
        success: true,
        changeId,
        message: `Permission "${permission}" granted to ${targetId}`,
        change,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * permission_mgmt.revoke - 撤销权限
   */
  "permission_mgmt.revoke": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(
        typeof params.operatorId === "string" ? params.operatorId : "",
      );
      const targetId = normalizeAgentId(typeof params.targetId === "string" ? params.targetId : "");
      const permission = typeof params.permission === "string" ? params.permission : "";
      const reason = typeof params.reason === "string" ? params.reason : "";

      if (!operatorId || !targetId || !permission) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "operatorId, targetId, and permission are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);

      const target = agents.find((a) => normalizeAgentId(a.id) === targetId);
      if (!target) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Target agent ${targetId} not found`),
        );
        return;
      }

      const changeId = generateId("perm_change");
      const change: PermissionChange = {
        id: changeId,
        operatorId,
        targetId,
        operation: "revoke",
        permission,
        timestamp: Date.now(),
        reason,
      };

      permissionChanges.set(changeId, change);

      respond(true, {
        success: true,
        changeId,
        message: `Permission "${permission}" revoked from ${targetId}`,
        change,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * permission_mgmt.delegate - 委托权限
   */
  "permission_mgmt.delegate": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(
        typeof params.operatorId === "string" ? params.operatorId : "",
      );
      const targetId = normalizeAgentId(typeof params.targetId === "string" ? params.targetId : "");
      const permission = typeof params.permission === "string" ? params.permission : "";
      const duration = typeof params.duration === "number" ? params.duration : 3600000; // 默认1小时
      const reason = typeof params.reason === "string" ? params.reason : "";

      if (!operatorId || !targetId || !permission) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "operatorId, targetId, and permission are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);

      const target = agents.find((a) => normalizeAgentId(a.id) === targetId);
      if (!target) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Target agent ${targetId} not found`),
        );
        return;
      }

      const changeId = generateId("perm_change");
      const expiresAt = Date.now() + duration;
      const change: PermissionChange = {
        id: changeId,
        operatorId,
        targetId,
        operation: "delegate",
        permission,
        details: { duration, expiresAt },
        timestamp: Date.now(),
        reason,
      };

      permissionChanges.set(changeId, change);

      respond(true, {
        success: true,
        changeId,
        message: `Permission "${permission}" delegated to ${targetId} for ${duration}ms`,
        change,
        expiresAt,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * permission_mgmt.check - 检查权限
   */
  "permission_mgmt.check": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(typeof params.agentId === "string" ? params.agentId : "");
      const permission = typeof params.permission === "string" ? params.permission : "";
      const context = (
        typeof params.context === "object" && params.context !== null ? params.context : {}
      ) as Record<string, unknown>;

      if (!agentId || !permission) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and permission are required"),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);

      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      if (!agent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      // 基于权限变更记录计算实际权限状态
      // 按时间升序处理变更，最后一次同类变更生效
      const relatedChanges = Array.from(permissionChanges.values())
        .filter((c) => c.targetId === agentId && c.permission === permission)
        .toSorted((a, b) => a.timestamp - b.timestamp);

      // 从最新变更反推当前状态
      let hasPermission = false;
      const now = Date.now();
      for (const c of relatedChanges) {
        if (c.operation === "grant") {
          hasPermission = true;
        } else if (c.operation === "revoke") {
          hasPermission = false;
        } else if (c.operation === "delegate") {
          // 委托权限：检查是否过期
          const expiresAt = typeof c.details?.expiresAt === "number" ? c.details.expiresAt : 0;
          hasPermission = expiresAt > now;
        }
      }

      respond(true, {
        success: true,
        agentId,
        permission,
        hasPermission,
        context,
        checkedAt: Date.now(),
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * permission_mgmt.list - 列出权限
   */
  "permission_mgmt.list": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(typeof params.agentId === "string" ? params.agentId : "");

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);

      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      if (!agent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      // 查找该智能体相关的所有权限变更
      const changes = Array.from(permissionChanges.values())
        .filter((c) => c.targetId === agentId)
        .toSorted((a, b) => b.timestamp - a.timestamp);

      respond(true, {
        success: true,
        agentId,
        total: changes.length,
        permissions: changes,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * permission_mgmt.audit - 审计权限变更
   */
  "permission_mgmt.audit": async ({ params, respond }) => {
    try {
      const targetId =
        typeof params.targetId === "string" && params.targetId
          ? normalizeAgentId(params.targetId)
          : undefined;
      const operatorId =
        typeof params.operatorId === "string" && params.operatorId
          ? normalizeAgentId(params.operatorId)
          : undefined;
      const operation =
        typeof params.operation === "string" && params.operation ? params.operation : undefined;
      const startTime = typeof params.startTime === "number" ? params.startTime : 0;
      const endTime = typeof params.endTime === "number" ? params.endTime : Date.now();

      let changes = Array.from(permissionChanges.values());

      // 应用过滤器
      if (targetId) {
        changes = changes.filter((c) => c.targetId === targetId);
      }
      if (operatorId) {
        changes = changes.filter((c) => c.operatorId === operatorId);
      }
      if (operation) {
        changes = changes.filter((c) => c.operation === operation);
      }
      changes = changes.filter((c) => c.timestamp >= startTime && c.timestamp <= endTime);

      // 按时间倒序排列
      changes.sort((a, b) => b.timestamp - a.timestamp);

      respond(true, {
        success: true,
        total: changes.length,
        changes,
        filters: { targetId, operatorId, operation, startTime, endTime },
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
