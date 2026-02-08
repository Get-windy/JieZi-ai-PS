/**
 * Permissions Management RPC Handlers
 *
 * 提供权限管理相关的RPC方法：
 * - permission.config.get - 获取智能助手的权限配置
 * - permission.update - 更新智能助手的权限配置
 * - approval.requests.list - 获取待审批请求列表
 * - approval.approve - 批准审批请求
 * - approval.deny - 拒绝审批请求
 */

import type { OpenClawConfig } from "../../config/types.js";
import type { AgentPermissionsConfig, PermissionSubject } from "../../config/types.permissions.js";
import type { ApprovalRequest, ApprovalAction } from "../../permissions/approval.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";
import { listAgentIds } from "../../agents/agent-scope.js";
import { listAgentEntries, findAgentEntryIndex } from "../../commands/agents.config.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../../config/config.js";
import { ApprovalWorkflow } from "../../permissions/approval.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

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
 * 验证权限配置
 */
function validatePermissionsConfig(config: any): void {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config format");
  }

  if (!Array.isArray(config.rules)) {
    throw new Error("rules must be an array");
  }

  const validActions = ["allow", "deny", "require_approval"];

  for (const rule of config.rules) {
    if (!rule.id) {
      throw new Error("Rule must have an ID");
    }
    if (!rule.toolName) {
      throw new Error("Rule must have a toolName");
    }
    if (!Array.isArray(rule.subjects)) {
      throw new Error("Rule subjects must be an array");
    }
    if (!validActions.includes(rule.action)) {
      throw new Error(`Invalid action: ${rule.action}`);
    }

    // 验证主体
    for (const subject of rule.subjects) {
      if (!subject.type || !subject.id) {
        throw new Error("Subject must have type and id");
      }
      const validTypes = ["user", "group", "role"];
      if (!validTypes.includes(subject.type)) {
        throw new Error(`Invalid subject type: ${subject.type}`);
      }
    }
  }

  // 验证角色定义
  if (config.roles) {
    if (!Array.isArray(config.roles)) {
      throw new Error("roles must be an array");
    }
    for (const role of config.roles) {
      if (!role.id || !role.name) {
        throw new Error("Role must have id and name");
      }
      if (!Array.isArray(role.members)) {
        throw new Error("Role members must be an array");
      }
      if (!Array.isArray(role.permissions)) {
        throw new Error("Role permissions must be an array");
      }
    }
  }

  // 验证用户组定义
  if (config.groups) {
    if (!Array.isArray(config.groups)) {
      throw new Error("groups must be an array");
    }
    for (const group of config.groups) {
      if (!group.id || !group.name) {
        throw new Error("Group must have id and name");
      }
      if (!Array.isArray(group.members)) {
        throw new Error("Group members must be an array");
      }
    }
  }

  // 验证审批配置
  if (config.approvalConfig) {
    const ac = config.approvalConfig;
    if (!Array.isArray(ac.approvers)) {
      throw new Error("approvalConfig.approvers must be an array");
    }
    for (const approver of ac.approvers) {
      if (!approver.type || !approver.id) {
        throw new Error("Approver must have type and id");
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

  return (agent as any).permissions || null;
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
    const agentId = String(params?.agentId ?? "").trim();
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
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const config = (params as any)?.config;
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
    const success = await updateAgentPermissions(agentId, config, respond);
    if (success) {
      respond(true, { success: true, agentId }, undefined);
    }
  },

  /**
   * approval.requests.list - 获取待审批请求列表
   */
  "approval.requests.list": ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
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
    const requestId = String(params?.requestId ?? "").trim();
    if (!requestId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
      return;
    }

    const approver = (params as any)?.approver as PermissionSubject | undefined;
    if (!approver || !approver.type || !approver.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approver is required with type and id"),
      );
      return;
    }

    const comment = String((params as any)?.comment ?? "").trim() || undefined;

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
    const requestId = String(params?.requestId ?? "").trim();
    if (!requestId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
      return;
    }

    const approver = (params as any)?.approver as PermissionSubject | undefined;
    if (!approver || !approver.type || !approver.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approver is required with type and id"),
      );
      return;
    }

    const comment = String((params as any)?.comment ?? "").trim() || undefined;

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
};
