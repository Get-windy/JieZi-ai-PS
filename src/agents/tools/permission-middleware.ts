/**
 * 工具执行权限检查中间件
 *
 * 在所有工具执行前进行权限检查和审批流程处理
 */

import type { OpenClawConfig } from "../../config/types.js";
import type { AgentPermissionsConfig, PermissionSubject } from "../../config/types.permissions.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { loadConfig } from "../../config/config.js";
import { ApprovalWorkflow } from "../../permissions/approval.js";
import { PermissionChecker, type PermissionCheckContext } from "../../permissions/checker.js";
import { normalizeAgentId } from "../../routing/session-key.js";

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  /** 智能助手ID */
  agentId: string;

  /** 工具名称 */
  toolName: string;

  /** 工具参数 */
  toolParams?: Record<string, any>;

  /** 会话ID */
  sessionId?: string;

  /** 用户ID（如果有） */
  userId?: string;

  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 是否允许执行 */
  allowed: boolean;

  /** 拒绝原因 */
  reason?: string;

  /** 是否需要审批 */
  requiresApproval: boolean;

  /** 审批请求ID（如果需要审批） */
  approvalId?: string;
}

/**
 * 全局审批工作流实例（按智能助手ID索引）
 */
const approvalWorkflows = new Map<string, ApprovalWorkflow>();

/**
 * 全局权限检查器实例（按智能助手ID索引）
 */
const permissionCheckers = new Map<string, PermissionChecker>();

/**
 * 获取智能助手的权限配置
 */
function getAgentPermissionsConfig(agentId: string): AgentPermissionsConfig | null {
  try {
    const config = loadConfig();
    const normalized = normalizeAgentId(agentId);
    const agents = listAgentEntries(config);
    const agent = agents.find((a) => normalizeAgentId(a.id) === normalized);

    if (!agent) {
      return null;
    }

    return (agent as any).permissions || null;
  } catch (error) {
    console.error(`[Permission Middleware] Failed to load config for agent ${agentId}:`, error);
    return null;
  }
}

/**
 * 获取或创建权限检查器
 */
function getPermissionChecker(agentId: string): PermissionChecker | null {
  const normalized = normalizeAgentId(agentId);

  if (permissionCheckers.has(normalized)) {
    return permissionCheckers.get(normalized)!;
  }

  const config = getAgentPermissionsConfig(agentId);
  if (!config) {
    return null;
  }

  const checker = new PermissionChecker(config);
  permissionCheckers.set(normalized, checker);
  return checker;
}

/**
 * 获取或创建审批工作流
 */
function getApprovalWorkflow(agentId: string): ApprovalWorkflow | null {
  const normalized = normalizeAgentId(agentId);

  if (approvalWorkflows.has(normalized)) {
    return approvalWorkflows.get(normalized)!;
  }

  const config = getAgentPermissionsConfig(agentId);
  if (!config) {
    return null;
  }

  const workflow = new ApprovalWorkflow(config);
  approvalWorkflows.set(normalized, workflow);
  return workflow;
}

/**
 * 检查工具执行权限
 *
 * @param context - 工具执行上下文
 * @returns 权限检查结果
 */
export async function checkToolPermission(
  context: ToolExecutionContext,
): Promise<PermissionCheckResult> {
  const { agentId, toolName, toolParams, sessionId, userId, metadata } = context;

  // 获取权限检查器
  const checker = getPermissionChecker(agentId);

  // 如果没有配置权限，默认允许
  if (!checker) {
    return {
      allowed: true,
      requiresApproval: false,
    };
  }

  // 构建权限检查上下文
  const subject: PermissionSubject = {
    type: "user",
    id: userId || agentId,
    name: agentId,
  };

  const checkContext: PermissionCheckContext = {
    subject,
    toolName,
    toolParams,
    sessionId,
    agentId,
    timestamp: Date.now(),
    metadata,
  };

  try {
    // 执行权限检查
    const result = await checker.check(checkContext);

    return {
      allowed: result.allowed,
      reason: result.reason,
      requiresApproval: result.requiresApproval,
      approvalId: result.approvalId,
    };
  } catch (error) {
    console.error(`[Permission Middleware] Check error for tool ${toolName}:`, error);

    // 检查失败时默认拒绝
    return {
      allowed: false,
      reason: `Permission check failed: ${error instanceof Error ? error.message : String(error)}`,
      requiresApproval: false,
    };
  }
}

/**
 * 创建审批请求
 *
 * @param context - 工具执行上下文
 * @param approvalId - 审批ID（可选）
 * @returns 审批请求
 */
export async function createApprovalRequest(
  context: ToolExecutionContext,
  approvalId?: string,
): Promise<any> {
  const { agentId, toolName, toolParams, sessionId, userId, metadata } = context;

  const workflow = getApprovalWorkflow(agentId);
  if (!workflow) {
    throw new Error(`No approval workflow configured for agent ${agentId}`);
  }

  const subject: PermissionSubject = {
    type: "user",
    id: userId || agentId,
    name: agentId,
  };

  const checkContext: PermissionCheckContext = {
    subject,
    toolName,
    toolParams,
    sessionId,
    agentId,
    timestamp: Date.now(),
    metadata: {
      ...metadata,
      reason: `Request to execute tool: ${toolName}`,
    },
  };

  const request = await workflow.createRequest(checkContext, approvalId);

  console.log(`[Permission Middleware] Approval request created for ${toolName}:`, request.id);

  return request;
}

/**
 * 等待审批结果
 *
 * @param agentId - 智能助手ID
 * @param approvalId - 审批ID
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 是否批准
 */
export async function waitForApproval(
  agentId: string,
  approvalId: string,
  timeoutMs: number = 300000, // 默认5分钟
): Promise<boolean> {
  const workflow = getApprovalWorkflow(agentId);
  if (!workflow) {
    throw new Error(`No approval workflow configured for agent ${agentId}`);
  }

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const request = workflow.getRequest(approvalId);

      if (!request) {
        clearInterval(checkInterval);
        reject(new Error(`Approval request ${approvalId} not found`));
        return;
      }

      if (request.status === "approved") {
        clearInterval(checkInterval);
        resolve(true);
        return;
      }

      if (
        request.status === "rejected" ||
        request.status === "timeout" ||
        request.status === "cancelled"
      ) {
        clearInterval(checkInterval);
        resolve(false);
        return;
      }

      // 检查超时
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        reject(new Error(`Approval timeout for request ${approvalId}`));
      }
    }, 1000); // 每秒检查一次
  });
}

/**
 * 工具执行权限中间件
 *
 * 在工具执行前调用此函数进行权限检查
 *
 * @param context - 工具执行上下文
 * @returns 是否允许执行
 * @throws 如果权限被拒绝或需要审批但未批准
 */
export async function enforceToolPermission(context: ToolExecutionContext): Promise<void> {
  const { toolName } = context;

  // 执行权限检查
  const result = await checkToolPermission(context);

  if (result.allowed) {
    // 权限允许，继续执行
    return;
  }

  if (result.requiresApproval) {
    // 需要审批
    console.log(`[Permission Middleware] Tool ${toolName} requires approval`);

    // 创建审批请求
    const approvalRequest = await createApprovalRequest(context, result.approvalId);

    // 通知用户等待审批
    console.log(`[Permission Middleware] Waiting for approval: ${approvalRequest.id}`);

    // 等待审批结果
    try {
      const approved = await waitForApproval(context.agentId, approvalRequest.id);

      if (!approved) {
        throw new Error(`Tool execution denied by approver: ${toolName}`);
      }

      console.log(`[Permission Middleware] Tool ${toolName} approved, continuing execution`);
      return;
    } catch (error) {
      throw new Error(`Approval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 权限被拒绝
  throw new Error(
    `Permission denied: ${result.reason || `Not allowed to execute tool ${toolName}`}`,
  );
}

/**
 * 清除缓存的权限检查器和审批工作流
 *
 * 当配置更新时调用
 */
export function clearPermissionCache(agentId?: string): void {
  if (agentId) {
    const normalized = normalizeAgentId(agentId);
    permissionCheckers.delete(normalized);
    approvalWorkflows.delete(normalized);
  } else {
    permissionCheckers.clear();
    approvalWorkflows.clear();
  }
}
