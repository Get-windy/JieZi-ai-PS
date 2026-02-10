/**
 * Agent Permissions Controller
 * 智能助手权限管理数据加载
 */

import type { GatewayBrowserClient } from "../gateway.ts";

export type PermissionSubject = {
  type: "user" | "group" | "role";
  id: string;
};

export type PermissionRule = {
  id: string;
  toolName: string;
  subjects: PermissionSubject[];
  action: "allow" | "deny" | "require_approval";
};

export type PermissionRole = {
  id: string;
  name: string;
  members: string[];
  permissions: string[];
};

export type PermissionGroup = {
  id: string;
  name: string;
  members: string[];
};

export type ApprovalConfig = {
  approvers: PermissionSubject[];
};

export type AgentPermissionsConfig = {
  rules?: PermissionRule[];
  roles?: PermissionRole[];
  groups?: PermissionGroup[];
  approvalConfig?: ApprovalConfig;
};

export type AgentPermissionsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;

  // 权限配置
  permissionsConfig: AgentPermissionsConfig | null;
  permissionsLoading: boolean;
  permissionsError: string | null;
  permissionsSaving: boolean;
  permissionsSaveSuccess: boolean;

  // 审批请求
  approvalRequests: any[];
  approvalsLoading: boolean;
  approvalStats: any | null;

  // 变更历史
  permissionChangeHistory: any[];
  permissionHistoryLoading: boolean;
};

/**
 * 加载智能助手的权限配置
 */
export async function loadAgentPermissions(state: AgentPermissionsState, agentId: string) {
  if (!state.client || !state.connected) {
    return;
  }

  state.permissionsLoading = true;
  state.permissionsError = null;

  try {
    const result = await state.client.request<{
      agentId: string;
      config: AgentPermissionsConfig | null;
    }>("permission.config.get", { agentId });

    if (result) {
      state.permissionsConfig = result.config || {
        rules: [],
        roles: [],
        groups: [],
      };
    }
  } catch (err) {
    state.permissionsError = String(err);
    console.error("Failed to load agent permissions:", err);
  } finally {
    state.permissionsLoading = false;
  }
}

/**
 * 保存智能助手的权限配置
 */
export async function saveAgentPermissions(
  state: AgentPermissionsState,
  agentId: string,
  config: AgentPermissionsConfig,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  state.permissionsSaving = true;
  state.permissionsError = null;
  state.permissionsSaveSuccess = false;

  try {
    await state.client.request("permission.update", {
      agentId,
      config,
    });

    state.permissionsConfig = config;
    state.permissionsSaveSuccess = true;

    // 3秒后清除成功提示
    setTimeout(() => {
      state.permissionsSaveSuccess = false;
    }, 3000);
  } catch (err) {
    state.permissionsError = String(err);
    throw err;
  } finally {
    state.permissionsSaving = false;
  }
}

/**
 * 加载审批请求列表
 */
export async function loadApprovalRequests(
  state: AgentPermissionsState,
  filters?: {
    status?: string;
    priority?: string;
    type?: string;
    search?: string;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }

  state.approvalsLoading = true;

  try {
    const result = await state.client.request<{
      requests: any[];
    }>("approvals.list", filters || {});

    if (result) {
      state.approvalRequests = result.requests;
    }
  } catch (err) {
    console.error("Failed to load approval requests:", err);
    state.approvalRequests = [];
  } finally {
    state.approvalsLoading = false;
  }
}

/**
 * 加载审批统计信息
 */
export async function loadApprovalStats(state: AgentPermissionsState) {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    const stats = await state.client.request("approvals.stats", {});
    if (stats) {
      state.approvalStats = stats;
    }
  } catch (err) {
    console.error("Failed to load approval stats:", err);
    state.approvalStats = null;
  }
}

/**
 * 响应审批请求
 */
export async function respondToApproval(
  state: AgentPermissionsState,
  requestId: string,
  decision: "approve" | "deny",
  approver: PermissionSubject,
  comment?: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    await state.client.request("approvals.respond", {
      requestId,
      decision,
      approver,
      comment,
    });

    // 重新加载数据
    await loadApprovalRequests(state);
    await loadApprovalStats(state);
  } catch (err) {
    throw err;
  }
}

/**
 * 批量批准审批请求
 */
export async function batchApproveRequests(
  state: AgentPermissionsState,
  requestIds: string[],
  approver: PermissionSubject,
  comment?: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    await state.client.request("approvals.batch-approve", {
      requestIds,
      approver,
      comment,
    });

    // 重新加载数据
    await loadApprovalRequests(state);
    await loadApprovalStats(state);
  } catch (err) {
    throw err;
  }
}

/**
 * 批量拒绝审批请求
 */
export async function batchDenyRequests(
  state: AgentPermissionsState,
  requestIds: string[],
  approver: PermissionSubject,
  reason: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    await state.client.request("approvals.batch-deny", {
      requestIds,
      approver,
      comment: reason,
    });

    // 重新加载数据
    await loadApprovalRequests(state);
    await loadApprovalStats(state);
  } catch (err) {
    throw err;
  }
}

/**
 * 取消审批请求
 */
export async function cancelApprovalRequest(
  state: AgentPermissionsState,
  requestId: string,
  operatorId: string,
  reason?: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    await state.client.request("approvals.cancel", {
      requestId,
      operatorId,
      reason,
    });

    // 重新加载数据
    await loadApprovalRequests(state);
    await loadApprovalStats(state);
  } catch (err) {
    throw err;
  }
}

/**
 * 加载权限变更历史
 */
export async function loadPermissionHistory(
  state: AgentPermissionsState,
  agentId: string,
  limit: number = 50,
) {
  if (!state.client || !state.connected) {
    return;
  }

  state.permissionHistoryLoading = true;

  try {
    const result = await state.client.request<{
      agentId: string;
      history: any[];
      limit: number;
    }>("permissions.history", { agentId, limit });

    if (result) {
      state.permissionChangeHistory = result.history;
    }
  } catch (err) {
    console.error("Failed to load permission history:", err);
    state.permissionChangeHistory = [];
  } finally {
    state.permissionHistoryLoading = false;
  }
}
