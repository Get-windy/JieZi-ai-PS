/**
 * Phase 5 Controllers: Agents Management, Organization Chart, Permissions Management
 * 智能助手增强功能数据加载和状态管理
 */

import type { AppViewState } from "../app-view-state.js";
import type { ModelAccountsConfig, ChannelPoliciesConfig } from "../views/agents-management.js";

/**
 * 加载智能助手的模型账号配置
 */
export async function loadModelAccountsConfig(state: AppViewState, agentId: string): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot load model accounts config: client not initialized");
    return;
  }

  state.modelAccountsLoading = true;
  state.modelAccountsError = null;

  try {
    const config = await state.client.request<ModelAccountsConfig>("agent.modelAccounts.get", {
      agentId,
    });
    state.modelAccountsConfig = config ?? null;
  } catch (error) {
    console.error(`[Phase5] Failed to load model accounts config for agent ${agentId}:`, error);
    state.modelAccountsError =
      error instanceof Error ? error.message : "Failed to load model accounts configuration";
  } finally {
    state.modelAccountsLoading = false;
  }
}

/**
 * 更新智能助手的模型账号配置
 */
export async function updateModelAccountsConfig(
  state: AppViewState,
  agentId: string,
  config: Record<string, any>,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot update model accounts config: client not initialized");
    return;
  }

  try {
    await state.client.request("agent.modelAccounts.update", { agentId, config });
    // 更新本地状态
    state.modelAccountsConfig = config;
  } catch (error) {
    console.error(`[Phase5] Failed to update model accounts config for agent ${agentId}:`, error);
    // 重新加载配置以确保数据一致
    await loadModelAccountsConfig(state, agentId);
    throw error;
  }
}

/**
 * 加载智能助手的通道策略配置
 */
export async function loadChannelPoliciesConfig(
  state: AppViewState,
  agentId: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot load channel policies config: client not initialized");
    return;
  }

  state.channelPoliciesLoading = true;
  state.channelPoliciesError = null;

  try {
    const config = await state.client.request<ChannelPoliciesConfig>("agent.channelPolicies.get", {
      agentId,
    });
    state.channelPoliciesConfig = config ?? null;
  } catch (error) {
    console.error(`[Phase5] Failed to load channel policies config for agent ${agentId}:`, error);
    state.channelPoliciesError =
      error instanceof Error ? error.message : "Failed to load channel policies configuration";
  } finally {
    state.channelPoliciesLoading = false;
  }
}

/**
 * 更新智能助手的通道策略配置
 */
export async function updateChannelPoliciesConfig(
  state: AppViewState,
  agentId: string,
  config: Record<string, any>,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot update channel policies config: client not initialized");
    return;
  }

  try {
    await state.client.request("agent.channelPolicies.update", { agentId, config });
    // 更新本地状态
    state.channelPoliciesConfig = config;
  } catch (error) {
    console.error(`[Phase5] Failed to update channel policies config for agent ${agentId}:`, error);
    // 重新加载配置以确保数据一致
    await loadChannelPoliciesConfig(state, agentId);
    throw error;
  }
}

/**
 * 加载组织架构数据
 */
export async function loadOrganizationData(state: AppViewState): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot load organization data: client not initialized");
    return;
  }

  state.organizationDataLoading = true;
  state.organizationDataError = null;

  try {
    const data = await state.client.request("organization.getAll", {});
    state.organizationData = data;
  } catch (error) {
    console.error("[Phase5] Failed to load organization data:", error);
    state.organizationDataError =
      error instanceof Error ? error.message : "Failed to load organization data";
  } finally {
    state.organizationDataLoading = false;
  }
}

/**
 * 加载权限配置
 */
export async function loadPermissionsConfig(state: AppViewState, agentId?: string): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot load permissions config: client not initialized");
    return;
  }

  state.permissionsConfigLoading = true;
  state.permissionsConfigError = null;

  try {
    const config = await state.client.request("permissions.get", agentId ? { agentId } : {});
    state.permissionsConfig = config;
  } catch (error) {
    console.error("[Phase5] Failed to load permissions config:", error);
    state.permissionsConfigError =
      error instanceof Error ? error.message : "Failed to load permissions configuration";
  } finally {
    state.permissionsConfigLoading = false;
  }
}

/**
 * 更新权限配置
 */
export async function updatePermissionConfig(
  state: AppViewState,
  agentId: string,
  permission: string,
  granted: boolean,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot update permission: client not initialized");
    return;
  }

  state.permissionsConfigSaving = true;

  try {
    await state.client.request("permissions.update", { agentId, permission, granted });
    // 重新加载配置
    await loadPermissionsConfig(state);
  } catch (error) {
    console.error("[Phase5] Failed to update permission:", error);
    state.permissionsConfigError =
      error instanceof Error ? error.message : "Failed to update permission";
    throw error;
  } finally {
    state.permissionsConfigSaving = false;
  }
}

/**
 * 加载审批请求列表
 */
export async function loadApprovalRequests(state: AppViewState): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot load approval requests: client not initialized");
    return;
  }

  state.approvalRequestsLoading = true;

  try {
    const requests = await state.client.request("approvals.list", {});
    state.approvalRequests = Array.isArray(requests) ? requests : [];
  } catch (error) {
    console.error("[Phase5] Failed to load approval requests:", error);
    state.approvalRequests = [];
  } finally {
    state.approvalRequestsLoading = false;
  }
}

/**
 * 处理审批请求（批准或拒绝）
 */
export async function handleApprovalRequest(
  state: AppViewState,
  requestId: string,
  action: "approve" | "deny",
  comment?: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot handle approval request: client not initialized");
    return;
  }

  try {
    await state.client.request("approvals.respond", {
      requestId,
      action,
      comment,
    });
    // 重新加载审批请求列表
    await loadApprovalRequests(state);
  } catch (error) {
    console.error(`[Phase5] Failed to ${action} approval request ${requestId}:`, error);
    throw error;
  }
}

/**
 * 加载权限变更历史
 */
export async function loadPermissionsHistory(state: AppViewState): Promise<void> {
  if (!state.client) {
    console.error("[Phase5] Cannot load permissions history: client not initialized");
    return;
  }

  state.permissionsHistoryLoading = true;

  try {
    const history = await state.client.request("permissions.history", {});
    state.permissionsChangeHistory = Array.isArray(history) ? history : [];
  } catch (error) {
    console.error("[Phase5] Failed to load permissions history:", error);
    state.permissionsChangeHistory = [];
  } finally {
    state.permissionsHistoryLoading = false;
  }
}

/**
 * 清除Phase 5相关缓存
 */
export function clearPhase5Cache(state: AppViewState): void {
  state.modelAccountsConfig = null;
  state.modelAccountsError = null;
  state.channelPoliciesConfig = null;
  state.channelPoliciesError = null;
  state.organizationData = null;
  state.organizationDataError = null;
  state.permissionsConfig = null;
  state.permissionsConfigError = null;
  state.approvalRequests = [];
  state.permissionsChangeHistory = [];
}
