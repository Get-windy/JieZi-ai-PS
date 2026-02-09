/**
 * Phase 7 Controllers: 超级管理员与审批系统
 * 管理员管理、高级审批、紧急访问、通知系统的数据加载和状态管理
 */

import type { AppViewState } from "../app-view-state.js";

// ==================== 超级管理员管理 ====================

/**
 * 加载超级管理员列表
 */
export async function loadSuperAdmins(state: AppViewState): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load super admins: client not initialized");
    return;
  }

  state.superAdminsLoading = true;
  state.superAdminsError = null;

  try {
    const result = await state.client.request<{ admins: any[] }>("admin.list", {});
    state.superAdmins = result?.admins ?? [];
  } catch (error) {
    console.error("[Phase7] Failed to load super admins:", error);
    state.superAdminsError = error instanceof Error ? error.message : "Failed to load super admins";
  } finally {
    state.superAdminsLoading = false;
  }
}

/**
 * 获取单个超级管理员详情
 */
export async function getSuperAdmin(state: AppViewState, adminId: string): Promise<any | null> {
  if (!state.client) {
    console.error("[Phase7] Cannot get super admin: client not initialized");
    return null;
  }

  try {
    const result = await state.client.request<{ admin: any }>("admin.get", { adminId });
    return result?.admin ?? null;
  } catch (error) {
    console.error(`[Phase7] Failed to get super admin ${adminId}:`, error);
    return null;
  }
}

/**
 * 创建超级管理员
 */
export async function createSuperAdmin(
  state: AppViewState,
  params: {
    id: string;
    userId: string;
    role: string;
    name: string;
    email: string;
    phone?: string;
    permissions?: string[];
    mfaEnabled?: boolean;
    mfaMethod?: string;
    ipWhitelist?: string[];
    scope?: any;
    metadata?: any;
    createdBy: string;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot create super admin: client not initialized");
    return;
  }

  try {
    await state.client.request("admin.create", params);
    // 重新加载管理员列表
    await loadSuperAdmins(state);
  } catch (error) {
    console.error("[Phase7] Failed to create super admin:", error);
    throw error;
  }
}

/**
 * 更新超级管理员
 */
export async function updateSuperAdmin(
  state: AppViewState,
  adminId: string,
  updates: any,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot update super admin: client not initialized");
    return;
  }

  try {
    await state.client.request("admin.update", { adminId, updates });
    // 重新加载管理员列表
    await loadSuperAdmins(state);
  } catch (error) {
    console.error(`[Phase7] Failed to update super admin ${adminId}:`, error);
    throw error;
  }
}

/**
 * 删除超级管理员
 */
export async function deleteSuperAdmin(state: AppViewState, adminId: string): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot delete super admin: client not initialized");
    return;
  }

  try {
    await state.client.request("admin.delete", { adminId });
    // 重新加载管理员列表
    await loadSuperAdmins(state);
  } catch (error) {
    console.error(`[Phase7] Failed to delete super admin ${adminId}:`, error);
    throw error;
  }
}

/**
 * 管理员登录
 */
export async function adminLogin(
  state: AppViewState,
  params: {
    adminId: string;
    ipAddress: string;
    userAgent: string;
    mfaCode?: string;
  },
): Promise<{
  success: boolean;
  session?: any;
  error?: string;
  requireMfa?: boolean;
}> {
  if (!state.client) {
    console.error("[Phase7] Cannot login: client not initialized");
    return { success: false, error: "Client not initialized" };
  }

  try {
    const result = await state.client.request<any>("admin.login", params);
    if (result?.success) {
      state.adminSession = result.session;
    }
    return result;
  } catch (error) {
    console.error("[Phase7] Failed to login:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
}

/**
 * 管理员登出
 */
export async function adminLogout(state: AppViewState, sessionId: string): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot logout: client not initialized");
    return;
  }

  try {
    await state.client.request("admin.logout", { sessionId });
    state.adminSession = null;
  } catch (error) {
    console.error("[Phase7] Failed to logout:", error);
    throw error;
  }
}

/**
 * 验证MFA代码
 */
export async function verifyAdminMfa(
  state: AppViewState,
  sessionId: string,
  mfaCode: string,
): Promise<boolean> {
  if (!state.client) {
    console.error("[Phase7] Cannot verify MFA: client not initialized");
    return false;
  }

  try {
    const result = await state.client.request<{ valid: boolean }>("admin.verifyMfa", {
      sessionId,
      mfaCode,
    });
    return result?.valid ?? false;
  } catch (error) {
    console.error("[Phase7] Failed to verify MFA:", error);
    return false;
  }
}

/**
 * 加载管理员操作历史
 */
export async function loadAdminOperationHistory(
  state: AppViewState,
  filters?: {
    adminId?: string;
    startTime?: number;
    endTime?: number;
    operationType?: string;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load operation history: client not initialized");
    return;
  }

  state.adminOperationsLoading = true;
  state.adminOperationsError = null;

  try {
    const result = await state.client.request<{ operations: any[] }>(
      "admin.operations.history",
      filters ?? {},
    );
    state.adminOperations = result?.operations ?? [];
  } catch (error) {
    console.error("[Phase7] Failed to load operation history:", error);
    state.adminOperationsError =
      error instanceof Error ? error.message : "Failed to load operation history";
  } finally {
    state.adminOperationsLoading = false;
  }
}

// ==================== 审批系统 ====================

/**
 * 加载审批请求列表
 */
export async function loadApprovalRequests(
  state: AppViewState,
  filters?: {
    status?: string;
    requesterId?: string;
    priority?: string;
    startTime?: number;
    endTime?: number;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load approval requests: client not initialized");
    return;
  }

  state.approvalRequestsLoading = true;
  state.approvalRequestsError = null;

  try {
    const result = await state.client.request<{ requests: any[] }>(
      "approval.requests.list",
      filters ?? {},
    );
    state.approvalRequests = result?.requests ?? [];
  } catch (error) {
    console.error("[Phase7] Failed to load approval requests:", error);
    state.approvalRequestsError =
      error instanceof Error ? error.message : "Failed to load approval requests";
  } finally {
    state.approvalRequestsLoading = false;
  }
}

/**
 * 获取单个审批请求详情
 */
export async function getApprovalRequest(
  state: AppViewState,
  requestId: string,
): Promise<any | null> {
  if (!state.client) {
    console.error("[Phase7] Cannot get approval request: client not initialized");
    return null;
  }

  try {
    const result = await state.client.request<{ request: any }>("approval.request.get", {
      requestId,
    });
    return result?.request ?? null;
  } catch (error) {
    console.error(`[Phase7] Failed to get approval request ${requestId}:`, error);
    return null;
  }
}

/**
 * 创建审批请求
 */
export async function createApprovalRequest(
  state: AppViewState,
  params: {
    requester: any;
    requestedAction: string;
    targetType: string;
    targetId: string;
    title: string;
    description: string;
    reason: string;
    priority?: string;
    approvers?: any[];
    requiredApprovals?: number;
    approvalType?: string;
    expiresIn?: number;
    attachments?: any[];
    metadata?: any;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot create approval request: client not initialized");
    return;
  }

  try {
    await state.client.request("approval.request.create", params);
    // 重新加载审批请求列表
    await loadApprovalRequests(state);
  } catch (error) {
    console.error("[Phase7] Failed to create approval request:", error);
    throw error;
  }
}

/**
 * 处理审批决策
 */
export async function processApprovalDecision(
  state: AppViewState,
  decision: {
    requestId: string;
    approver: any;
    decision: "approve" | "reject" | "delegate";
    comment?: string;
    delegateTo?: any;
    timestamp: number;
    ipAddress?: string;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot process approval decision: client not initialized");
    return;
  }

  try {
    await state.client.request("approval.request.process", { decision });
    // 重新加载审批请求列表
    await loadApprovalRequests(state);
  } catch (error) {
    console.error("[Phase7] Failed to process approval decision:", error);
    throw error;
  }
}

/**
 * 取消审批请求
 */
export async function cancelApprovalRequest(
  state: AppViewState,
  requestId: string,
  reason?: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot cancel approval request: client not initialized");
    return;
  }

  try {
    await state.client.request("approval.request.cancel", { requestId, reason });
    // 重新加载审批请求列表
    await loadApprovalRequests(state);
  } catch (error) {
    console.error(`[Phase7] Failed to cancel approval request ${requestId}:`, error);
    throw error;
  }
}

/**
 * 加载待审批请求（针对特定审批者）
 */
export async function loadPendingApprovals(state: AppViewState, approverId: string): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load pending approvals: client not initialized");
    return;
  }

  state.pendingApprovalsLoading = true;
  state.pendingApprovalsError = null;

  try {
    const result = await state.client.request<{ requests: any[] }>("approval.pending.list", {
      approverId,
    });
    state.pendingApprovals = result?.requests ?? [];
  } catch (error) {
    console.error("[Phase7] Failed to load pending approvals:", error);
    state.pendingApprovalsError =
      error instanceof Error ? error.message : "Failed to load pending approvals";
  } finally {
    state.pendingApprovalsLoading = false;
  }
}

/**
 * 加载审批统计
 */
export async function loadApprovalStatistics(
  state: AppViewState,
  filters?: {
    startTime?: number;
    endTime?: number;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load approval statistics: client not initialized");
    return;
  }

  state.approvalStatsLoading = true;
  state.approvalStatsError = null;

  try {
    const result = await state.client.request<{ statistics: any }>(
      "approval.statistics",
      filters ?? {},
    );
    state.approvalStats = result?.statistics ?? null;
  } catch (error) {
    console.error("[Phase7] Failed to load approval statistics:", error);
    state.approvalStatsError =
      error instanceof Error ? error.message : "Failed to load approval statistics";
  } finally {
    state.approvalStatsLoading = false;
  }
}

/**
 * 加载审批策略列表
 */
export async function loadApprovalPolicies(state: AppViewState): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load approval policies: client not initialized");
    return;
  }

  state.approvalPoliciesLoading = true;
  state.approvalPoliciesError = null;

  try {
    const result = await state.client.request<{ policies: any[] }>("approval.policy.list", {});
    state.approvalPolicies = result?.policies ?? [];
  } catch (error) {
    console.error("[Phase7] Failed to load approval policies:", error);
    state.approvalPoliciesError =
      error instanceof Error ? error.message : "Failed to load approval policies";
  } finally {
    state.approvalPoliciesLoading = false;
  }
}

/**
 * 创建审批策略
 */
export async function createApprovalPolicy(state: AppViewState, policy: any): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot create approval policy: client not initialized");
    return;
  }

  try {
    await state.client.request("approval.policy.create", { policy });
    // 重新加载策略列表
    await loadApprovalPolicies(state);
  } catch (error) {
    console.error("[Phase7] Failed to create approval policy:", error);
    throw error;
  }
}

/**
 * 更新审批策略
 */
export async function updateApprovalPolicy(
  state: AppViewState,
  policyId: string,
  updates: any,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot update approval policy: client not initialized");
    return;
  }

  try {
    await state.client.request("approval.policy.update", { policyId, updates });
    // 重新加载策略列表
    await loadApprovalPolicies(state);
  } catch (error) {
    console.error(`[Phase7] Failed to update approval policy ${policyId}:`, error);
    throw error;
  }
}

// ==================== 紧急访问管理 ====================

/**
 * 创建紧急访问请求
 */
export async function createEmergencyAccessRequest(
  state: AppViewState,
  params: {
    adminId: string;
    emergencyType: string;
    description: string;
    severity?: string;
    requestedPermissions?: string[];
    duration?: number;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot create emergency access request: client not initialized");
    return;
  }

  try {
    await state.client.request("emergency.request.create", params);
  } catch (error) {
    console.error("[Phase7] Failed to create emergency access request:", error);
    throw error;
  }
}

/**
 * 授予紧急访问
 */
export async function grantEmergencyAccess(
  state: AppViewState,
  requestId: string,
  grantedBy: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot grant emergency access: client not initialized");
    return;
  }

  try {
    await state.client.request("emergency.request.grant", { requestId, grantedBy });
  } catch (error) {
    console.error(`[Phase7] Failed to grant emergency access ${requestId}:`, error);
    throw error;
  }
}

/**
 * 拒绝紧急访问
 */
export async function denyEmergencyAccess(
  state: AppViewState,
  requestId: string,
  deniedBy: string,
  reason?: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot deny emergency access: client not initialized");
    return;
  }

  try {
    await state.client.request("emergency.request.deny", { requestId, deniedBy, reason });
  } catch (error) {
    console.error(`[Phase7] Failed to deny emergency access ${requestId}:`, error);
    throw error;
  }
}

/**
 * 撤销紧急访问
 */
export async function revokeEmergencyAccess(
  state: AppViewState,
  requestId: string,
  revokedBy: string,
  reason?: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot revoke emergency access: client not initialized");
    return;
  }

  try {
    await state.client.request("emergency.request.revoke", { requestId, revokedBy, reason });
  } catch (error) {
    console.error(`[Phase7] Failed to revoke emergency access ${requestId}:`, error);
    throw error;
  }
}

// ==================== 通知系统 ====================

/**
 * 加载通知列表
 */
export async function loadNotifications(
  state: AppViewState,
  filters?: {
    recipientId?: string;
    isRead?: boolean;
    type?: string;
    startTime?: number;
    endTime?: number;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load notifications: client not initialized");
    return;
  }

  state.notificationsLoading = true;
  state.notificationsError = null;

  try {
    const result = await state.client.request<{ notifications: any[] }>(
      "notification.list",
      filters ?? {},
    );
    state.notifications = result?.notifications ?? [];
  } catch (error) {
    console.error("[Phase7] Failed to load notifications:", error);
    state.notificationsError =
      error instanceof Error ? error.message : "Failed to load notifications";
  } finally {
    state.notificationsLoading = false;
  }
}

/**
 * 标记通知为已读
 */
export async function markNotificationAsRead(
  state: AppViewState,
  notificationId: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot mark notification as read: client not initialized");
    return;
  }

  try {
    await state.client.request("notification.markRead", { notificationId });
    // 更新本地状态
    if (state.notifications) {
      const notification = state.notifications.find((n: any) => n.id === notificationId);
      if (notification) {
        notification.isRead = true;
      }
    }
  } catch (error) {
    console.error(`[Phase7] Failed to mark notification ${notificationId} as read:`, error);
    throw error;
  }
}

/**
 * 标记所有通知为已读
 */
export async function markAllNotificationsAsRead(
  state: AppViewState,
  recipientId: string,
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot mark all notifications as read: client not initialized");
    return;
  }

  try {
    await state.client.request("notification.markAllRead", { recipientId });
    // 重新加载通知列表
    await loadNotifications(state, { recipientId });
  } catch (error) {
    console.error("[Phase7] Failed to mark all notifications as read:", error);
    throw error;
  }
}

/**
 * 获取未读通知数
 */
export async function getUnreadNotificationCount(
  state: AppViewState,
  recipientId: string,
): Promise<number> {
  if (!state.client) {
    console.error("[Phase7] Cannot get unread notification count: client not initialized");
    return 0;
  }

  try {
    const result = await state.client.request<{ count: number }>("notification.unreadCount", {
      recipientId,
    });
    return result?.count ?? 0;
  } catch (error) {
    console.error("[Phase7] Failed to get unread notification count:", error);
    return 0;
  }
}

/**
 * 加载通知统计
 */
export async function loadNotificationStatistics(
  state: AppViewState,
  filters?: {
    recipientId?: string;
    startTime?: number;
    endTime?: number;
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot load notification statistics: client not initialized");
    return;
  }

  state.notificationStatsLoading = true;
  state.notificationStatsError = null;

  try {
    const result = await state.client.request<{ statistics: any }>(
      "notification.statistics",
      filters ?? {},
    );
    state.notificationStats = result?.statistics ?? null;
  } catch (error) {
    console.error("[Phase7] Failed to load notification statistics:", error);
    state.notificationStatsError =
      error instanceof Error ? error.message : "Failed to load notification statistics";
  } finally {
    state.notificationStatsLoading = false;
  }
}

// ==================== Phase 7 系统状态 ====================

/**
 * 初始化 Phase 7
 */
export async function initializePhase7(
  state: AppViewState,
  config?: {
    adminConfig?: any;
    notificationConfig?: any;
    approvalPolicies?: any[];
  },
): Promise<void> {
  if (!state.client) {
    console.error("[Phase7] Cannot initialize Phase 7: client not initialized");
    return;
  }

  try {
    await state.client.request("phase7.initialize", config ?? {});
  } catch (error) {
    console.error("[Phase7] Failed to initialize Phase 7:", error);
    throw error;
  }
}

/**
 * 获取 Phase 7 状态
 */
export async function getPhase7Status(state: AppViewState): Promise<any | null> {
  if (!state.client) {
    console.error("[Phase7] Cannot get Phase 7 status: client not initialized");
    return null;
  }

  try {
    const status = await state.client.request<any>("phase7.status", {});
    return status;
  } catch (error) {
    console.error("[Phase7] Failed to get Phase 7 status:", error);
    return null;
  }
}

/**
 * Phase 7 健康检查
 */
export async function phase7HealthCheck(state: AppViewState): Promise<any | null> {
  if (!state.client) {
    console.error("[Phase7] Cannot perform health check: client not initialized");
    return null;
  }

  try {
    const health = await state.client.request<any>("phase7.healthCheck", {});
    return health;
  } catch (error) {
    console.error("[Phase7] Failed to perform health check:", error);
    return null;
  }
}
