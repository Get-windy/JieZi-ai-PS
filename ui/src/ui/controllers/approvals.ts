/**
 * Approvals Controller
 * 审批管理数据加载
 *
 * 后端接口映射：
 *   approval.list         - 全量查询（支持 status 过滤）
 *   approval.stats        - 审批统计
 *   approval.approve      - 批准
 *   approval.reject       - 拒绝
 *   approval.cancel       - 取消
 *   approval.get_status   - 查询单条
 */

import type { GatewayBrowserClient } from "../gateway.ts";

/** 审批请求（与后端 ApprovalRequest 对齐） */
export type ApprovalRequest = {
  id: string;
  requesterId: string;
  requesterName?: string;
  approverId?: string;
  approverName?: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approvalLevel: number;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  approverComment?: string;
  // UI 兼容字段（展示用）
  approvers?: string[];
  approvedBy?: string[];
  actionType?: string;
  description?: string;
  params?: unknown;
  priority?: "low" | "normal" | "high" | "urgent";
  expiresAt?: number;
  rejectionReason?: string;
  history?: Array<{ timestamp: number; actor: string; action: string; comment?: string }>;
  metadata?: Record<string, unknown>;
};

export type ApprovalStats = {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  cancelled: number;
  avgApprovalTime: number;
};

export type ApprovalsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  /** 主列表字段（展示页使用） */
  approvalRequests: ApprovalRequest[];
  approvalRequestsLoading: boolean;
  approvalRequestsError?: string | null;
  approvalStats: ApprovalStats | null;
  /** 兼容旧字段（approvalsLoading 等，对应 ApprovalsState 老接口） */
  approvalsLoading: boolean;
  approvalsError: string | null;
  approvalsList: ApprovalRequest[];
  approvalsTotal: number;
  approvalsStats: ApprovalStats | null;
  approvalsStatsLoading: boolean;
};

/**
 * 加载审批请求列表
 * 使用 approval.list 全量接口（支持 status 过滤）
 */
export async function loadApprovals(
  state: ApprovalsState,
  filters?: {
    status?: "pending" | "approved" | "rejected" | "cancelled" | "all";
    limit?: number;
    offset?: number;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }

  if (state.approvalRequestsLoading) {
    return;
  }

  state.approvalRequestsLoading = true;
  state.approvalsLoading = true;
  state.approvalRequestsError = null;
  state.approvalsError = null;

  try {
    const result = await state.client.request<{
      success: boolean;
      total: number;
      requests: ApprovalRequest[];
    }>("approval.list", filters ?? {});

    if (result?.requests) {
      state.approvalRequests = result.requests;
      state.approvalsList = result.requests;
      state.approvalsTotal = result.total ?? result.requests.length;
    }
  } catch (err) {
    state.approvalRequestsError = String(err);
    state.approvalsError = String(err);
    console.error("[Approvals] Failed to load approvals:", err);
  } finally {
    state.approvalRequestsLoading = false;
    state.approvalsLoading = false;
  }
}

/**
 * 加载审批统计
 */
export async function loadApprovalStats(state: ApprovalsState) {
  if (!state.client || !state.connected) {
    return;
  }

  state.approvalsStatsLoading = true;

  try {
    const stats = await state.client.request<ApprovalStats>("approval.stats", {});
    if (stats) {
      state.approvalStats = stats;
      state.approvalsStats = stats;
    }
  } catch (err) {
    console.error("[Approvals] Failed to load approval stats:", err);
  } finally {
    state.approvalsStatsLoading = false;
  }
}

/**
 * 响应审批请求（批准或拒绝）
 */
export async function respondToApproval(
  state: ApprovalsState,
  approvalId: string,
  approverId: string,
  action: "approve" | "reject",
  comment?: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  const method = action === "approve" ? "approval.approve" : "approval.reject";
  await state.client.request(method, { approvalId, approverId, comment: comment ?? "" });

  // 刷新列表
  await loadApprovals(state);
  await loadApprovalStats(state);
}

/**
 * 取消审批请求
 */
export async function cancelApproval(
  state: ApprovalsState,
  approvalId: string,
  requesterId: string,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  await state.client.request("approval.cancel", { approvalId, requesterId });

  await loadApprovals(state);
  await loadApprovalStats(state);
}
