/**
 * 权限管理系统 Gateway RPC Handlers
 * 
 * 提供权限授予、撤销、委托等高级权限管理功能
 */

import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 权限变更记录
 */
interface PermissionChange {
  id: string;
  operatorId: string;
  targetId: string;
  operation: "grant" | "revoke" | "delegate";
  permission: string;
  details?: Record<string, any>;
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
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const targetId = normalizeAgentId(String(params.targetId || ""));
      const permission = String(params.permission || "");
      const scope = String(params.scope || "all");
      const reason = String(params.reason || "");
      
      if (!operatorId || !targetId || !permission) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "operatorId, targetId, and permission are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const target = agents.find((a) => normalizeAgentId(a.id) === targetId);
      if (!target) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Target agent ${targetId} not found`));
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
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const targetId = normalizeAgentId(String(params.targetId || ""));
      const permission = String(params.permission || "");
      const reason = String(params.reason || "");
      
      if (!operatorId || !targetId || !permission) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "operatorId, targetId, and permission are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const target = agents.find((a) => normalizeAgentId(a.id) === targetId);
      if (!target) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Target agent ${targetId} not found`));
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
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const targetId = normalizeAgentId(String(params.targetId || ""));
      const permission = String(params.permission || "");
      const duration = typeof params.duration === "number" ? params.duration : 3600000; // 默认1小时
      const reason = String(params.reason || "");
      
      if (!operatorId || !targetId || !permission) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "operatorId, targetId, and permission are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const target = agents.find((a) => normalizeAgentId(a.id) === targetId);
      if (!target) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Target agent ${targetId} not found`));
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
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const permission = String(params.permission || "");
      const context = (params.context as Record<string, any>) || {};
      
      if (!agentId || !permission) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId and permission are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      if (!agent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      // TODO: 实际权限检查逻辑
      const hasPermission = true; // 简化实现
      
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
      const agentId = normalizeAgentId(String(params.agentId || ""));
      
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      if (!agent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      // 查找该智能体相关的所有权限变更
      const changes = Array.from(permissionChanges.values())
        .filter((c) => c.targetId === agentId)
        .sort((a, b) => b.timestamp - a.timestamp);
      
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
      const targetId = params.targetId ? normalizeAgentId(String(params.targetId)) : undefined;
      const operatorId = params.operatorId ? normalizeAgentId(String(params.operatorId)) : undefined;
      const operation = params.operation ? String(params.operation) : undefined;
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
