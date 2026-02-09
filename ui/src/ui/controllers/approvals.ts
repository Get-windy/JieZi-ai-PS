/**
 * Approvals Controller
 * 审批管理数据加载
 */

import type { GatewayBrowserClient } from "../gateway.ts";

export type ApprovalRequest = {
  id: string;
  requesterId: string;
  approvers: string[];
  approvedBy: string[];
  actionType: string;
  description: string;
  params: any;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  createdAt: number;
  expiresAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
  history: Array<{
    timestamp: number;
    actor: string;
    action: string;
    comment?: string;
  }>;
  metadata?: Record<string, any>;
};

export type ApprovalStats = {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  avgApprovalTime: number;
};

export type ApprovalsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  approvalsLoading: boolean;
  approvalsError: string | null;
  approvalsList: ApprovalRequest[];
  approvalsTotal: number;
  approvalsStats: ApprovalStats | null;
  approvalsStatsLoading: boolean;
};

/**
 * 加载审批请求列表
 */
export async function loadApprovals(
  state: ApprovalsState,
  filters?: {
    status?: "pending" | "approved" | "rejected" | "expired" | "cancelled";
    approverId?: string;
    limit?: number;
    offset?: number;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }

  if (state.approvalsLoading) {
    return;
  }

  state.approvalsLoading = true;
  state.approvalsError = null;

  try {
    const result = await state.client.request<{
      requests: ApprovalRequest[];
      total: number;
    }>("approvals.list", filters || {});

    if (result) {
      state.approvalsList = result.requests;
      state.approvalsTotal = result.total;
    }
  } catch (err) {
    state.approvalsError = String(err);
  } finally {
    state.approvalsLoading = false;
  }
}

/**
 * 加载审批统计信息
 */
export async function loadApprovalStats(state: ApprovalsState) {
  if (!state.client || !state.connected) {
    return;
  }

  state.approvalsStatsLoading = true;

  try {
    const stats = await state.client.request<ApprovalStats>("approvals.stats", {});
    if (stats) {
      state.approvalsStats = stats;
    }
  } catch (err) {
    console.error("Failed to load approval stats:", err);
  } finally {
    state.approvalsStatsLoading = false;
  }
}

/**
 * 响应审批请求（批准或拒绝）
 */
export async function respondToApproval(
  state: ApprovalsState,
  requestId: string,
  approverId: string,
  action: "approve" | "reject",
  comment?: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    await state.client.request("approvals.respond", {
      requestId,
      approverId,
      action,
      comment,
    });

    // 重新加载列表
    await loadApprovals(state);
    await loadApprovalStats(state);
  } catch (err) {
    throw err;
  }
}

/**
 * 取消审批请求
 */
export async function cancelApproval(
  state: ApprovalsState,
  requestId: string,
  cancellerId: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    await state.client.request("approvals.cancel", {
      requestId,
      cancellerId,
    });

    // 重新加载列表
    await loadApprovals(state);
    await loadApprovalStats(state);
  } catch (err) {
    throw err;
  }
}
