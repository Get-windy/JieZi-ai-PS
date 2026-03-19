/**
 * Permissions Management RPC Handlers
 *
 * 提供权限管理相关的RPC方法：
 * - permission.config.get - 获取智能助手的权限配置
 * - permission.update - 更新智能助手的权限配置
 * - approval.requests.list - 获取待审批请求列表（旧方法，保留兼容）
 * - approval.approve - 批准审批请求（旧方法，保留兼容）
 * - approval.deny - 拒绝审批请求（旧方法，保留兼容）
 * - approvals.list - 获取审批列表（支持过滤）
 * - approvals.stats - 获取审批统计信息
 * - approvals.respond - 响应审批（批准/拒绝）
 * - approvals.batch-approve - 批量批准
 * - approvals.batch-deny - 批量拒绝
 * - approvals.cancel - 取消审批请求
 * - permissions.history - 获取权限变更历史
 */

import { advancedApprovalSystem } from "../../admin/advanced-approval.js";
import { listAgentIds } from "../../agents/agent-scope.js";
import { listAgentEntries, findAgentEntryIndex } from "../../../upstream/src/commands/agents.config.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../../../upstream/src/config/config.js";
import type { OpenClawConfig } from "../../../upstream/src/config/types.js";
import type { AgentPermissionsConfig, PermissionSubject } from "../../config/types.permissions.js";
import type { ApprovalAction } from "../../permissions/approval.js";
import { ApprovalWorkflow } from "../../permissions/approval.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers, RespondFn } from "../../../upstream/src/gateway/server-methods/types.js";

/**
 * 全局审批工作流实例（按智能助手ID索引）
 */
const approvalWorkflows = new Map<string, ApprovalWorkflow>();

/**
 * 获取或创建审批工作流实例
 */
function getApprovalWorkflow(agentId: string, config: AgentPermissionsConfig): ApprovalWorkflow {
  const normalized = normalizeAgentId(agentId);

  if (!approvalWorkflows.has(normalized)) {
    const workflow = new ApprovalWorkflow(config);
    approvalWorkflows.set(normalized, workflow);
  }

  return approvalWorkflows.get(normalized)!;
}

/**
 * 验证智能助手ID是否存在
 */
function validateAgentId(agentId: string, cfg: OpenClawConfig, respond: RespondFn): boolean {
  const normalized = normalizeAgentId(agentId);
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(normalized)) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `Unknown agent ID: ${agentId}`),
    );
    return false;
  }
  return true;
}

/**
 * 验证权限配置（新架构：角色在全局管理，这里只引用roleIds）
 */
function validatePermissionsConfig(config: unknown): void {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config format");
  }

  const cfg = config as {
    rules?: unknown[];
    approvalConfig?: { requiredApprovals?: number; timeout?: number; timeoutAction?: string };
  };

  if (!Array.isArray(cfg.rules)) {
    throw new Error("rules must be an array");
  }

  const validActions = new Set(["allow", "deny", "require_approval"]);

  for (const rule of cfg.rules) {
    const r = rule as { id?: string; toolName?: string; roleIds?: unknown[]; action?: string };
    if (!r.id) {
      throw new Error("Rule must have an ID");
    }
    if (!r.toolName) {
      throw new Error("Rule must have a toolName");
    }
    // 新架构：使用roleIds引用全局角色
    if (!Array.isArray(r.roleIds)) {
      throw new Error("Rule roleIds must be an array");
    }
    if (!validActions.has(r.action ?? "")) {
      throw new Error(`Invalid action: ${r.action}`);
    }
  }

  // 验证审批配置（简化版，不包含approvers）
  if (cfg.approvalConfig) {
    const ac = cfg.approvalConfig;

    if (ac.requiredApprovals !== undefined) {
      if (typeof ac.requiredApprovals !== "number" || ac.requiredApprovals < 1) {
        throw new Error("approvalConfig.requiredApprovals must be a positive number");
      }
    }

    if (ac.timeout !== undefined) {
      if (typeof ac.timeout !== "number" || ac.timeout < 1) {
        throw new Error("approvalConfig.timeout must be a positive number");
      }
    }

    if (ac.timeoutAction !== undefined) {
      if (ac.timeoutAction !== "approve" && ac.timeoutAction !== "reject") {
        throw new Error("approvalConfig.timeoutAction must be 'approve' or 'reject'");
      }
    }
  }
}

/**
 * 获取智能助手的权限配置
 */
function getAgentPermissionsConfig(
  cfg: OpenClawConfig,
  agentId: string,
): AgentPermissionsConfig | null {
  const normalized = normalizeAgentId(agentId);
  const agents = listAgentEntries(cfg);
  const agent = agents.find((a) => normalizeAgentId(a.id) === normalized);

  if (!agent) {
    return null;
  }

  return (agent as { permissions?: AgentPermissionsConfig }).permissions || null;
}

/**
 * 更新智能助手配置中的权限字段
 */
async function updateAgentPermissions(
  agentId: string,
  config: AgentPermissionsConfig,
  respond: RespondFn,
): Promise<boolean> {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
    );
    return false;
  }

  const cfg = snapshot.config;
  const normalized = normalizeAgentId(agentId);
  const agents = listAgentEntries(cfg);
  const agentIndex = findAgentEntryIndex(agents, normalized);

  if (agentIndex < 0) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${agentId}`),
    );
    return false;
  }

  // 更新agent配置
  const updatedAgent = {
    ...agents[agentIndex],
    permissions: config,
  };

  agents[agentIndex] = updatedAgent;

  // 更新完整配置
  const updatedConfig: OpenClawConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: agents,
    },
  };

  try {
    await writeConfigFile(updatedConfig);

    // 更新审批工作流实例
    if (approvalWorkflows.has(normalized)) {
      const workflow = new ApprovalWorkflow(config);
      approvalWorkflows.set(normalized, workflow);
    }

    return true;
  } catch (err) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
    );
    return false;
  }
}

/**
 * RPC 处理器
 */
export const permissionsManagementHandlers: GatewayRequestHandlers = {
  /**
   * permission.config.get - 获取智能助手的权限配置
   */
  "permission.config.get": ({ params, respond }) => {
    const agentId = ((params.agentId as string | undefined) ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const permissionsConfig = getAgentPermissionsConfig(cfg, agentId);
    if (!permissionsConfig) {
      respond(true, { agentId, config: null }, undefined);
      return;
    }

    respond(true, { agentId, config: permissionsConfig }, undefined);
  },

  /**
   * permission.update - 更新智能助手的权限配置
   */
  "permission.update": async ({ params, respond }) => {
    const agentId = ((params.agentId as string | undefined) ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const config = (params as { config?: unknown }).config;
    if (!config) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 验证配置
    try {
      validatePermissionsConfig(config);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Invalid config: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
      return;
    }

    // 更新配置
    const success = await updateAgentPermissions(
      agentId,
      config as AgentPermissionsConfig,
      respond,
    );
    if (success) {
      respond(true, { success: true, agentId }, undefined);
    }
  },

  /**
   * approval.requests.list - 获取待审批请求列表
   */
  "approval.requests.list": ({ params, respond }) => {
    const agentId = ((params.agentId as string | undefined) ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const permissionsConfig = getAgentPermissionsConfig(cfg, agentId);
    if (!permissionsConfig) {
      respond(true, { agentId, requests: [] }, undefined);
      return;
    }

    const workflow = getApprovalWorkflow(agentId, permissionsConfig);
    const requests = workflow.getPendingRequests({ agentId });

    respond(true, { agentId, requests }, undefined);
  },

  /**
   * approval.approve - 批准审批请求
   */
  "approval.approve": async ({ params, respond }) => {
    const requestId = ((params.requestId as string | undefined) ?? "").trim();
    if (!requestId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
      return;
    }

    const approver = (params as { approver?: PermissionSubject }).approver;
    if (!approver || !approver.type || !approver.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approver is required with type and id"),
      );
      return;
    }

    const comment = ((params as { comment?: string }).comment ?? "").trim() || undefined;

    // 查找包含此请求的工作流
    let targetWorkflow: ApprovalWorkflow | null = null;
    let targetAgentId: string | null = null;

    for (const [agentId, workflow] of approvalWorkflows.entries()) {
      const request = workflow.getRequest(requestId);
      if (request) {
        targetWorkflow = workflow;
        targetAgentId = agentId;
        break;
      }
    }

    if (!targetWorkflow || !targetAgentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Approval request not found: ${requestId}`),
      );
      return;
    }

    const action: ApprovalAction = {
      requestId,
      approver,
      approved: true,
      comment,
      timestamp: Date.now(),
    };

    try {
      const result = await targetWorkflow.processAction(action);
      respond(true, { result }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to process approval: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * approval.deny - 拒绝审批请求
   */
  "approval.deny": async ({ params, respond }) => {
    const requestId = ((params.requestId as string | undefined) ?? "").trim();
    if (!requestId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
      return;
    }

    const approver = (params as { approver?: PermissionSubject }).approver;
    if (!approver || !approver.type || !approver.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approver is required with type and id"),
      );
      return;
    }

    const comment = ((params as { comment?: string }).comment ?? "").trim() || undefined;

    // 查找包含此请求的工作流
    let targetWorkflow: ApprovalWorkflow | null = null;
    let targetAgentId: string | null = null;

    for (const [agentId, workflow] of approvalWorkflows.entries()) {
      const request = workflow.getRequest(requestId);
      if (request) {
        targetWorkflow = workflow;
        targetAgentId = agentId;
        break;
      }
    }

    if (!targetWorkflow || !targetAgentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Approval request not found: ${requestId}`),
      );
      return;
    }

    const action: ApprovalAction = {
      requestId,
      approver,
      approved: false,
      comment,
      timestamp: Date.now(),
    };

    try {
      const result = await targetWorkflow.processAction(action);
      respond(true, { result }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to process denial: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  // ========== 新的审批管理 RPC 方法 ==========

  /**
   * approvals.list - 获取审批列表（支持过滤）
   */
  "approvals.list": ({ params, respond }) => {
    const status = params.status as string | undefined;
    const priority = params.priority as string | undefined;
    const type = params.type as string | undefined;
    const search = ((params.search as string | undefined) ?? "").trim().toLowerCase();

    let requests = advancedApprovalSystem.getPendingRequests();

    // 按状态过滤
    if (status && status !== "all") {
      if (status === "pending") {
        requests = requests.filter((r) => r.status === "pending");
      } else if (status === "approved") {
        // 获取所有请求，然后过滤
        // oxlint-disable-next-line typescript/no-explicit-any
        const allRequests = Array.from((advancedApprovalSystem as any).requests.values());
        requests = allRequests.filter((r) => r.status === "approved");
      } else if (status === "denied") {
        // oxlint-disable-next-line typescript/no-explicit-any
        const allRequests = Array.from((advancedApprovalSystem as any).requests.values());
        requests = allRequests.filter((r) => r.status === "rejected");
      } else if (status === "expired") {
        // oxlint-disable-next-line typescript/no-explicit-any
        const allRequests = Array.from((advancedApprovalSystem as any).requests.values());
        requests = allRequests.filter((r) => r.status === "expired");
      } else if (status === "cancelled") {
        // oxlint-disable-next-line typescript/no-explicit-any
        const allRequests = Array.from((advancedApprovalSystem as any).requests.values());
        requests = allRequests.filter((r) => r.status === "cancelled");
      }
    }

    // 按优先级过滤
    if (priority && priority !== "all") {
      requests = requests.filter((r) => r.priority === priority);
    }

    // 按类型过滤
    if (type && type !== "all") {
      requests = requests.filter((r) => r.requestedAction === type);
    }

    // 搜索过滤
    if (search) {
      requests = requests.filter(
        (r) =>
          r.title.toLowerCase().includes(search) ||
          r.description.toLowerCase().includes(search) ||
          r.reason.toLowerCase().includes(search) ||
          r.requester.name?.toLowerCase().includes(search) ||
          r.requester.id.toLowerCase().includes(search),
      );
    }

    // 转换为前端格式
    const formattedRequests = requests.map((r) => ({
      id: r.id,
      requesterType: r.requester.type === "user" ? "human" : "agent",
      requesterName: r.requester.name || r.requester.id,
      requesterId: r.requester.id,
      targetName: r.title,
      targetId: r.targetId,
      type: r.requestedAction,
      reason: r.reason,
      status: r.status === "rejected" ? "denied" : r.status,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      approver: r.approvals.length > 0 ? r.approvals[r.approvals.length - 1].approver : null,
      comment: r.approvals.length > 0 ? r.approvals[r.approvals.length - 1].comment : undefined,
      priority: r.priority,
    }));

    respond(true, { requests: formattedRequests }, undefined);
  },

  /**
   * approvals.stats - 获取审批统计信息
   */
  "approvals.stats": ({ respond }) => {
    const stats = advancedApprovalSystem.getStatistics();

    // 计算高优先级请求数量
    const highPriorityCount =
      stats.byPriority.high + stats.byPriority.urgent + stats.byPriority.emergency;

    // 计算即将过期的请求
    const now = Date.now();
    const oneHour = 3600000;
    // oxlint-disable-next-line typescript/no-explicit-any
    const allRequests = Array.from((advancedApprovalSystem as any).requests.values());
    const expiringWithin1Hour = (allRequests as { status: string; expiresAt?: number }[]).filter(
      (r) =>
        r.status === "pending" && r.expiresAt && r.expiresAt - now < oneHour && r.expiresAt > now,
    ).length;

    const formattedStats = {
      totalPending: stats.pendingRequests,
      totalApproved: stats.approvedRequests,
      totalDenied: stats.rejectedRequests,
      totalExpired: stats.expiredRequests,
      avgResponseTime: Math.round(stats.averageApprovalTime / 1000), // 转为秒
      highPriorityCount,
      expiringWithin1Hour,
    };

    respond(true, formattedStats, undefined);
  },

  /**
   * approvals.respond - 响应审批（批准/拒绝）
   */
  "approvals.respond": async ({ params, respond }) => {
    const requestId = ((params.requestId as string | undefined) ?? "").trim();
    if (!requestId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
      return;
    }

    const decision = ((params.decision as string | undefined) ?? "").trim();
    if (decision !== "approve" && decision !== "deny") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "decision must be 'approve' or 'deny'"),
      );
      return;
    }

    const approver = (params as { approver?: PermissionSubject }).approver;
    if (!approver || !approver.type || !approver.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approver is required with type and id"),
      );
      return;
    }

    const comment = ((params as { comment?: string }).comment ?? "").trim() || undefined;

    try {
      const result = await advancedApprovalSystem.processDecision({
        requestId,
        approver,
        decision: decision as "approve" | "reject" | "delegate",
        comment,
        timestamp: Date.now(),
      });

      respond(true, { success: true, request: result }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to process decision: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * approvals.batch-approve - 批量批准
   */
  "approvals.batch-approve": async ({ params, respond }) => {
    const requestIds = (params as { requestIds?: string[] }).requestIds;
    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "requestIds array is required"),
      );
      return;
    }

    const approver = (params as { approver?: PermissionSubject }).approver;
    if (!approver || !approver.type || !approver.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approver is required with type and id"),
      );
      return;
    }

    const comment = ((params as { comment?: string }).comment ?? "").trim() || undefined;

    const results: { requestId: string; success: boolean; error?: string }[] = [];

    for (const requestId of requestIds) {
      try {
        await advancedApprovalSystem.processDecision({
          requestId,
          approver,
          decision: "approve",
          comment,
          timestamp: Date.now(),
        });
        results.push({ requestId, success: true });
      } catch (err) {
        results.push({
          requestId,
          success: false,
          error: String(err instanceof Error ? err.message : err),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    respond(true, { results, successCount, totalCount: requestIds.length }, undefined);
  },

  /**
   * approvals.batch-deny - 批量拒绝
   */
  "approvals.batch-deny": async ({ params, respond }) => {
    const requestIds = (params as { requestIds?: string[] }).requestIds;
    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "requestIds array is required"),
      );
      return;
    }

    const approver = (params as { approver?: PermissionSubject }).approver;
    if (!approver || !approver.type || !approver.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approver is required with type and id"),
      );
      return;
    }

    const comment = ((params as { comment?: string }).comment ?? "").trim();
    if (!comment) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "comment is required for batch deny"),
      );
      return;
    }

    const results: { requestId: string; success: boolean; error?: string }[] = [];

    for (const requestId of requestIds) {
      try {
        await advancedApprovalSystem.processDecision({
          requestId,
          approver,
          decision: "reject",
          comment,
          timestamp: Date.now(),
        });
        results.push({ requestId, success: true });
      } catch (err) {
        results.push({
          requestId,
          success: false,
          error: String(err instanceof Error ? err.message : err),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    respond(true, { results, successCount, totalCount: requestIds.length }, undefined);
  },

  /**
   * approvals.cancel - 取消审批请求
   */
  "approvals.cancel": ({ params, respond }) => {
    const requestId = ((params.requestId as string | undefined) ?? "").trim();
    if (!requestId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
      return;
    }

    const operatorId = ((params.operatorId as string | undefined) ?? "").trim();
    if (!operatorId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "operatorId is required"));
      return;
    }

    const reason = ((params as { reason?: string }).reason ?? "").trim() || undefined;

    try {
      const success = advancedApprovalSystem.cancelRequest(requestId, operatorId, reason);
      if (success) {
        respond(true, { success: true }, undefined);
      } else {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Request not found: ${requestId}`),
        );
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to cancel request: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * permissions.history - 获取权限变更历史
   */
  "permissions.history": ({ params, respond }) => {
    const agentId = ((params.agentId as string | undefined) ?? "").trim();
    const limit = Number(params.limit as number | undefined) || 50;

    // 这里需要实现权限变更历史的存储和查询
    // 目前返回空数组，后续可以扩展
    const history: unknown[] = [];

    respond(true, { agentId, history, limit }, undefined);
  },
};
