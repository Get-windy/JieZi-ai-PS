/**
 * 审批工作流
 *
 * 功能：
 * - 管理权限审批请求
 * - 处理审批动作（批准/拒绝）
 * - 支持多审批者和超时机制
 * - 发送通知
 */

import type {
  ApprovalConfig,
  PermissionSubject,
  AgentPermissionsConfig,
} from "../config/types.permissions.js";
import type { PermissionCheckContext } from "./checker.js";

/**
 * 审批请求状态
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "timeout" | "cancelled";

/**
 * 审批请求
 */
export type ApprovalRequest = {
  /** 审批ID */
  id: string;

  /** 请求者 */
  requester: PermissionSubject;

  /** 工具名称 */
  toolName: string;

  /** 工具参数 */
  toolParams?: Record<string, any>;

  /** 请求理由 */
  reason?: string;

  /** 状态 */
  status: ApprovalStatus;

  /** 创建时间 */
  createdAt: number;

  /** 审批者列表 */
  approvers: PermissionSubject[];

  /** 所需审批数量 */
  requiredApprovals: number;

  /** 已审批列表 */
  approvals: Array<{
    approver: PermissionSubject;
    approved: boolean;
    timestamp: number;
    comment?: string;
  }>;

  /** 超时时间戳 */
  expiresAt?: number;

  /** 会话ID */
  sessionId?: string;

  /** 智能助手ID */
  agentId?: string;

  /** 额外的元数据 */
  metadata?: Record<string, any>;
};

/**
 * 审批动作
 */
export type ApprovalAction = {
  /** 审批请求ID */
  requestId: string;

  /** 审批者 */
  approver: PermissionSubject;

  /** 是否批准 */
  approved: boolean;

  /** 评论 */
  comment?: string;

  /** 时间戳 */
  timestamp?: number;
};

/**
 * 审批结果
 */
export type ApprovalResult = {
  /** 是否成功 */
  success: boolean;

  /** 最终状态 */
  status: ApprovalStatus;

  /** 消息 */
  message: string;

  /** 审批请求 */
  request?: ApprovalRequest;
};

/**
 * 审批工作流管理器
 */
export class ApprovalWorkflow {
  private config: AgentPermissionsConfig;

  // 待审批请求（按审批ID索引）
  private pendingRequests = new Map<string, ApprovalRequest>();

  // 超时定时器
  private timeoutTimers = new Map<string, NodeJS.Timeout>();

  // 通知回调
  private notifyCallback?: (request: ApprovalRequest) => Promise<void>;

  // 完成回调
  private completionCallback?: (request: ApprovalRequest, approved: boolean) => Promise<void>;

  constructor(config: AgentPermissionsConfig) {
    this.config = config;
  }

  /**
   * 设置通知回调
   */
  setNotifyCallback(callback: (request: ApprovalRequest) => Promise<void>): void {
    this.notifyCallback = callback;
  }

  /**
   * 设置完成回调
   */
  setCompletionCallback(
    callback: (request: ApprovalRequest, approved: boolean) => Promise<void>,
  ): void {
    this.completionCallback = callback;
  }

  /**
   * 创建审批请求
   *
   * @param context - 权限检查上下文
   * @param approvalId - 审批ID（可选，如果不提供则自动生成）
   * @returns 审批请求
   */
  async createRequest(
    context: PermissionCheckContext,
    approvalId?: string,
  ): Promise<ApprovalRequest> {
    const approvalConfig = this.config.approvalConfig;
    if (!approvalConfig) {
      throw new Error("Approval configuration not found");
    }

    const id = approvalId || this.generateApprovalId();
    const now = Date.now();

    const request: ApprovalRequest = {
      id,
      requester: context.subject,
      toolName: context.toolName,
      toolParams: context.toolParams,
      reason: context.metadata?.reason as string | undefined,
      status: "pending",
      createdAt: now,
      approvers: approvalConfig.approvers,
      requiredApprovals: approvalConfig.requiredApprovals || 1,
      approvals: [],
      sessionId: context.sessionId,
      agentId: context.agentId,
      metadata: context.metadata,
    };

    // 设置超时
    if (approvalConfig.timeout) {
      request.expiresAt = now + approvalConfig.timeout * 1000;
      this.scheduleTimeout(id, approvalConfig.timeout);
    }

    // 保存请求
    this.pendingRequests.set(id, request);

    // 发送通知
    if (this.notifyCallback) {
      await this.notifyCallback(request);
    }

    return request;
  }

  /**
   * 处理审批动作
   *
   * @param action - 审批动作
   * @returns 审批结果
   */
  async processAction(action: ApprovalAction): Promise<ApprovalResult> {
    const request = this.pendingRequests.get(action.requestId);

    if (!request) {
      return {
        success: false,
        status: "cancelled",
        message: `Approval request ${action.requestId} not found`,
      };
    }

    if (request.status !== "pending") {
      return {
        success: false,
        status: request.status,
        message: `Approval request is already ${request.status}`,
        request,
      };
    }

    // 检查审批者是否有权限
    const isValidApprover = request.approvers.some(
      (approver) => approver.type === action.approver.type && approver.id === action.approver.id,
    );

    if (!isValidApprover) {
      return {
        success: false,
        status: "pending",
        message: "Approver is not authorized to approve this request",
        request,
      };
    }

    // 检查是否已经审批过
    const alreadyApproved = request.approvals.some(
      (approval) =>
        approval.approver.type === action.approver.type &&
        approval.approver.id === action.approver.id,
    );

    if (alreadyApproved) {
      return {
        success: false,
        status: "pending",
        message: "Approver has already reviewed this request",
        request,
      };
    }

    // 添加审批记录
    request.approvals.push({
      approver: action.approver,
      approved: action.approved,
      timestamp: action.timestamp || Date.now(),
      comment: action.comment,
    });

    // 检查是否达到所需审批数量
    const approvalCount = request.approvals.filter((a) => a.approved).length;
    const rejectionCount = request.approvals.filter((a) => !a.approved).length;

    let finalStatus: ApprovalStatus = "pending";

    if (rejectionCount > 0) {
      // 任何一个拒绝都会导致整个请求被拒绝
      finalStatus = "rejected";
    } else if (approvalCount >= request.requiredApprovals) {
      // 达到所需审批数量
      finalStatus = "approved";
    }

    // 更新请求状态
    if (finalStatus !== "pending") {
      request.status = finalStatus;

      // 清除超时定时器
      this.clearTimeout(request.id);

      // 调用完成回调
      if (this.completionCallback) {
        await this.completionCallback(request, finalStatus === "approved");
      }

      // 从待审批列表移除
      this.pendingRequests.delete(request.id);
    }

    return {
      success: true,
      status: finalStatus,
      message:
        finalStatus === "pending"
          ? `Approval recorded, waiting for ${request.requiredApprovals - approvalCount} more approval(s)`
          : `Request ${finalStatus}`,
      request,
    };
  }

  /**
   * 批准审批请求
   */
  async approve(
    requestId: string,
    approver: PermissionSubject,
    comment?: string,
  ): Promise<ApprovalResult> {
    return this.processAction({
      requestId,
      approver,
      approved: true,
      comment,
    });
  }

  /**
   * 拒绝审批请求
   */
  async reject(
    requestId: string,
    approver: PermissionSubject,
    comment?: string,
  ): Promise<ApprovalResult> {
    return this.processAction({
      requestId,
      approver,
      approved: false,
      comment,
    });
  }

  /**
   * 取消审批请求
   */
  async cancel(requestId: string, reason?: string): Promise<ApprovalResult> {
    const request = this.pendingRequests.get(requestId);

    if (!request) {
      return {
        success: false,
        status: "cancelled",
        message: `Approval request ${requestId} not found`,
      };
    }

    if (request.status !== "pending") {
      return {
        success: false,
        status: request.status,
        message: `Approval request is already ${request.status}`,
        request,
      };
    }

    // 更新状态
    request.status = "cancelled";
    if (reason) {
      request.metadata = { ...request.metadata, cancellationReason: reason };
    }

    // 清除超时定时器
    this.clearTimeout(requestId);

    // 从待审批列表移除
    this.pendingRequests.delete(requestId);

    return {
      success: true,
      status: "cancelled",
      message: "Approval request cancelled",
      request,
    };
  }

  /**
   * 获取审批请求
   */
  getRequest(requestId: string): ApprovalRequest | null {
    return this.pendingRequests.get(requestId) || null;
  }

  /**
   * 获取待审批请求列表
   */
  getPendingRequests(filter?: {
    agentId?: string;
    approver?: PermissionSubject;
    requester?: PermissionSubject;
  }): ApprovalRequest[] {
    let requests = Array.from(this.pendingRequests.values());

    if (filter) {
      if (filter.agentId) {
        requests = requests.filter((r) => r.agentId === filter.agentId);
      }

      if (filter.approver) {
        requests = requests.filter((r) =>
          r.approvers.some((a) => a.type === filter.approver!.type && a.id === filter.approver!.id),
        );
      }

      if (filter.requester) {
        requests = requests.filter(
          (r) =>
            r.requester.type === filter.requester!.type && r.requester.id === filter.requester!.id,
        );
      }
    }

    return requests;
  }

  /**
   * 设置超时定时器
   */
  private scheduleTimeout(requestId: string, timeoutSeconds: number): void {
    const timer = setTimeout(async () => {
      await this.handleTimeout(requestId);
    }, timeoutSeconds * 1000);

    this.timeoutTimers.set(requestId, timer);
  }

  /**
   * 处理超时
   */
  private async handleTimeout(requestId: string): Promise<void> {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== "pending") {
      return;
    }

    const approvalConfig = this.config.approvalConfig;
    const defaultAction = approvalConfig?.timeoutAction || "reject";

    // 更新状态
    request.status = "timeout";

    // 根据默认动作处理
    const approved = defaultAction === "approve";

    // 调用完成回调
    if (this.completionCallback) {
      await this.completionCallback(request, approved);
    }

    // 从待审批列表移除
    this.pendingRequests.delete(requestId);
  }

  /**
   * 清除超时定时器
   */
  private clearTimeout(requestId: string): void {
    const timer = this.timeoutTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(requestId);
    }
  }

  /**
   * 生成审批ID
   */
  private generateApprovalId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `approval_${timestamp}_${random}`;
  }

  /**
   * 获取审批统计
   */
  getStatistics(): {
    totalPending: number;
    byAgent: Record<string, number>;
    byRequester: Record<string, number>;
    oldestRequest?: {
      id: string;
      age: number;
    };
  } {
    const pending = Array.from(this.pendingRequests.values());
    const byAgent: Record<string, number> = {};
    const byRequester: Record<string, number> = {};

    for (const request of pending) {
      // 按智能助手统计
      if (request.agentId) {
        byAgent[request.agentId] = (byAgent[request.agentId] || 0) + 1;
      }

      // 按请求者统计
      const requesterKey = `${request.requester.type}:${request.requester.id}`;
      byRequester[requesterKey] = (byRequester[requesterKey] || 0) + 1;
    }

    // 找到最旧的请求
    let oldestRequest: { id: string; age: number } | undefined;
    if (pending.length > 0) {
      const oldest = pending.reduce((min, current) =>
        current.createdAt < min.createdAt ? current : min,
      );
      oldestRequest = {
        id: oldest.id,
        age: Date.now() - oldest.createdAt,
      };
    }

    return {
      totalPending: pending.length,
      byAgent,
      byRequester,
      oldestRequest,
    };
  }

  /**
   * 清理过期的请求
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, request] of this.pendingRequests.entries()) {
      if (request.expiresAt && request.expiresAt < now && request.status === "pending") {
        this.handleTimeout(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 清理所有资源
   */
  dispose(): void {
    // 清除所有定时器
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.timeoutTimers.clear();
    this.pendingRequests.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(config: AgentPermissionsConfig): void {
    this.config = config;
  }
}
