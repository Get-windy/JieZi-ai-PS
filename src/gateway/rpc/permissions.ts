/**
 * Phase 5 Gateway RPC API - Permissions & Approvals
 * 权限和审批管理 API
 *
 * 实现：
 * - permissions.get/update - 权限配置管理
 * - permissions.history - 权限变更历史
 * - approvals.list/respond - 审批请求管理
 */

import type { PermissionSubject } from "../../config/types.permissions.js";
import type { GatewayServer } from "../server.js";
import { permissionMiddleware } from "../../permissions/middleware.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 注册权限和审批相关的RPC方法
 */
export function registerPermissionsRpcMethods(server: GatewayServer): void {
  // 注册权限配置API
  server.registerMethod("permissions.get", handleGetPermissions);
  server.registerMethod("permissions.update", handleUpdatePermission);
  server.registerMethod("permissions.history", handleGetPermissionsHistory);

  // 注册审批请求API
  server.registerMethod("approvals.list", handleListApprovals);
  server.registerMethod("approvals.respond", handleRespondApproval);
}

/**
 * 获取权限配置
 */
async function handleGetPermissions(params: { agentId?: string }, context: any): Promise<any> {
  const { agentId } = params;

  if (!agentId) {
    throw errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required");
  }

  // 验证操作员权限
  const operator = context.operator as PermissionSubject | undefined;
  if (!operator) {
    throw errorShape(ErrorCodes.UNAUTHORIZED, "Operator information required");
  }

  // 验证操作员是否有权查看权限配置
  const verification = await permissionMiddleware.verify({
    subject: operator,
    toolName: "permissions.get",
    toolParams: { agentId },
    agentId,
    metadata: { action: "read" },
  });

  if (!verification.allowed) {
    throw errorShape(ErrorCodes.PERMISSION_DENIED, verification.reason || "Permission denied");
  }

  console.log(`[Phase5] Get permissions for agent: ${agentId}`);

  // 从配置中获取权限设置
  const { loadConfig } = await import("../../config/config.js");
  const { listAgentEntries } = await import("../../commands/agents.config.js");
  const { normalizeAgentId } = await import("../../routing/session-key.js");

  const config = loadConfig();
  const agents = listAgentEntries(config);
  const normalized = normalizeAgentId(agentId);
  const agent = agents.find((a) => normalizeAgentId(a.id) === normalized);

  if (!agent) {
    throw errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${agentId}`);
  }

  const permissions = (agent as any).permissions || null;

  return {
    agentId,
    permissions,
  };
}

/**
 * 更新权限配置
 */
async function handleUpdatePermission(
  params: { agentId: string; config: any; reason?: string },
  context: any,
): Promise<{ success: boolean; requiresApproval?: boolean; requestId?: string }> {
  const { agentId, config: newConfig, reason } = params;

  if (!agentId || !newConfig) {
    throw errorShape(ErrorCodes.INVALID_REQUEST, "agentId and config are required");
  }

  // 验证操作员权限
  const operator = context.operator as PermissionSubject | undefined;
  if (!operator) {
    throw errorShape(ErrorCodes.UNAUTHORIZED, "Operator information required");
  }

  // 验证操作员是否有权修改权限
  const verification = await permissionMiddleware.verify({
    subject: operator,
    toolName: "permissions.update",
    toolParams: { agentId, config: newConfig },
    agentId,
    metadata: { action: "write", reason },
  });

  if (!verification.allowed) {
    if (verification.requiresApproval) {
      // 需要审批
      return {
        success: false,
        requiresApproval: true,
        requestId: verification.approvalId,
      };
    }
    throw errorShape(ErrorCodes.PERMISSION_DENIED, verification.reason || "Permission denied");
  }

  console.log(`[Phase5] Update permission: agent=${agentId}`);

  // 更新权限配置
  const result = await permissionMiddleware.updatePermissions(agentId, newConfig, operator, reason);

  if (!result.success) {
    throw errorShape(ErrorCodes.UNAVAILABLE, result.error || "Failed to update permissions");
  }

  return { success: true };
}

/**
 * 获取权限变更历史
 */
async function handleGetPermissionsHistory(
  params: { agentId?: string; limit?: number; offset?: number },
  context: any,
): Promise<{ history: any[]; total: number }> {
  const { agentId, limit = 100, offset = 0 } = params;

  // 验证操作员权限
  const operator = context.operator as PermissionSubject | undefined;
  if (!operator) {
    throw errorShape(ErrorCodes.UNAUTHORIZED, "Operator information required");
  }

  // 验证操作员是否有权查看历史
  const verification = await permissionMiddleware.verify({
    subject: operator,
    toolName: "permissions.history",
    toolParams: { agentId },
    agentId,
    metadata: { action: "read" },
  });

  if (!verification.allowed) {
    throw errorShape(ErrorCodes.PERMISSION_DENIED, verification.reason || "Permission denied");
  }

  console.log(
    `[Phase5] Get permissions history: agent=${agentId}, limit=${limit}, offset=${offset}`,
  );

  // 获取历史记录
  const result = await permissionMiddleware.getHistory(agentId, limit, offset);

  return result;
}

/**
 * 获取审批请求列表
 */
async function handleListApprovals(
  params: {
    agentId?: string;
    status?: "pending" | "approved" | "denied" | "timeout" | "cancelled";
    limit?: number;
    offset?: number;
  },
  context: any,
): Promise<{ requests: any[]; total: number }> {
  const { agentId, status, limit = 100, offset = 0 } = params;

  // 验证操作员权限
  const operator = context.operator as PermissionSubject | undefined;
  if (!operator) {
    throw errorShape(ErrorCodes.UNAUTHORIZED, "Operator information required");
  }

  // 验证操作员是否有权查看审批请求
  const verification = await permissionMiddleware.verify({
    subject: operator,
    toolName: "approvals.list",
    toolParams: { agentId, status },
    agentId,
    metadata: { action: "read" },
  });

  if (!verification.allowed) {
    throw errorShape(ErrorCodes.PERMISSION_DENIED, verification.reason || "Permission denied");
  }

  console.log(
    `[Phase5] List approvals: agentId=${agentId}, status=${status}, limit=${limit}, offset=${offset}`,
  );

  // 从高级审批系统获取请求
  const { advancedApprovalSystem } = await import("../../admin/advanced-approval.js");
  let requests = advancedApprovalSystem.getPendingRequests();

  // 按状态过滤
  if (status && status !== "pending") {
    const allRequests = Array.from((advancedApprovalSystem as any).requests.values());
    const statusMap: Record<string, string> = {
      approved: "approved",
      denied: "rejected",
      timeout: "expired",
      cancelled: "cancelled",
    };
    const targetStatus = statusMap[status];
    requests = allRequests.filter((r: any) => r.status === targetStatus);
  }

  // 按智能助手ID过滤
  if (agentId) {
    const { normalizeAgentId } = await import("../../routing/session-key.js");
    const normalized = normalizeAgentId(agentId);
    requests = requests.filter((r: any) => r.targetId === normalized);
  }

  const total = requests.length;
  const paginated = requests.slice(offset, offset + limit);

  return {
    requests: paginated,
    total,
  };
}

/**
 * 处理审批请求
 */
async function handleRespondApproval(
  params: { requestId: string; action: "approve" | "deny"; comment?: string },
  context: any,
): Promise<{ success: boolean; request?: any }> {
  const { requestId, action, comment } = params;

  if (!requestId || !action) {
    throw errorShape(ErrorCodes.INVALID_REQUEST, "requestId and action are required");
  }

  // 验证操作员权限
  const operator = context.operator as PermissionSubject | undefined;
  if (!operator) {
    throw errorShape(ErrorCodes.UNAUTHORIZED, "Operator information required");
  }

  // 验证操作员是否有权处理审批（需要是超级管理员或指定审批者）
  const verification = await permissionMiddleware.verify({
    subject: operator,
    toolName: "approvals.respond",
    toolParams: { requestId, action },
    metadata: { action: "write", comment },
  });

  if (!verification.allowed) {
    throw errorShape(ErrorCodes.PERMISSION_DENIED, verification.reason || "Permission denied");
  }

  console.log(`[Phase5] Respond approval: requestId=${requestId}, action=${action}`);

  // 处理审批
  const result = await permissionMiddleware.processApproval(
    requestId,
    operator,
    action === "approve",
    comment,
  );

  if (!result.success) {
    throw errorShape(ErrorCodes.UNAVAILABLE, result.error || "Failed to process approval");
  }

  return {
    success: true,
    request: result.request,
  };
}
