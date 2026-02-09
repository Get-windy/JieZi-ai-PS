/**
 * Phase 3: 审批流程系统
 *
 * 为需要审批的操作提供完整的审批流程：
 * - 审批请求创建和管理
 * - 多级审批流程
 * - 审批通知
 * - 审批历史记录
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

/**
 * 审批状态
 */
export type ApprovalStatus =
  | "pending" // 待审批
  | "approved" // 已批准
  | "rejected" // 已拒绝
  | "cancelled" // 已取消
  | "expired"; // 已过期

/**
 * 审批优先级
 */
export type ApprovalPriority = "low" | "normal" | "high" | "urgent";

/**
 * 审批请求
 */
export interface ApprovalRequest {
  /** 请求ID */
  id: string;

  /** 请求者（Agent ID） */
  requesterId: string;

  /** 审批者列表（Agent ID 或 'human-owner'） */
  approvers: string[];

  /** 已审批者 */
  approvedBy: string[];

  /** 操作类型 */
  actionType: string;

  /** 操作描述 */
  description: string;

  /** 操作参数 */
  params: any;

  /** 优先级 */
  priority: ApprovalPriority;

  /** 状态 */
  status: ApprovalStatus;

  /** 创建时间 */
  createdAt: number;

  /** 过期时间 */
  expiresAt?: number;

  /** 批准时间 */
  approvedAt?: number;

  /** 拒绝时间 */
  rejectedAt?: number;

  /** 拒绝原因 */
  rejectionReason?: string;

  /** 审批历史 */
  history: ApprovalHistoryEntry[];

  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 审批历史记录
 */
export interface ApprovalHistoryEntry {
  /** 时间戳 */
  timestamp: number;

  /** 操作者 */
  actor: string;

  /** 操作类型 */
  action: "created" | "approved" | "rejected" | "cancelled" | "expired";

  /** 备注 */
  comment?: string;
}

/**
 * 审批配置
 */
export interface ApprovalConfig {
  /** 是否需要所有审批者都同意 */
  requireAll: boolean;

  /** 最小审批人数 */
  minApprovers?: number;

  /** 默认过期时间（毫秒） */
  defaultExpiryMs?: number;

  /** 是否允许自动批准 */
  allowAutoApprove?: boolean;

  /** 自动批准条件 */
  autoApproveConditions?: Array<{
    condition: string;
    value: any;
  }>;
}

/**
 * 审批统计信息
 */
export interface ApprovalStats {
  /** 待审批数量 */
  pending: number;

  /** 已批准数量 */
  approved: number;

  /** 已拒绝数量 */
  rejected: number;

  /** 已过期数量 */
  expired: number;

  /** 平均审批时间（毫秒） */
  avgApprovalTime: number;
}

/**
 * 审批系统
 */
export class ApprovalSystem {
  private requests: Map<string, ApprovalRequest> = new Map();
  private agentRequests: Map<string, Set<string>> = new Map(); // agentId -> requestIds
  private approverRequests: Map<string, Set<string>> = new Map(); // approverId -> requestIds
  private storageDir: string;
  private config: ApprovalConfig;

  constructor(config?: Partial<ApprovalConfig>, storageDir?: string) {
    this.storageDir = storageDir || path.join(os.homedir(), ".openclaw", "approvals");
    this.config = {
      requireAll: false,
      minApprovers: 1,
      defaultExpiryMs: 24 * 60 * 60 * 1000, // 24小时
      allowAutoApprove: false,
      ...config,
    };
    this.ensureStorageDir();
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error("[Approval System] Failed to create storage directory:", error);
    }
  }

  /**
   * 创建审批请求
   */
  async createRequest(params: {
    requesterId: string;
    approvers: string[];
    actionType: string;
    description: string;
    actionParams: any;
    priority?: ApprovalPriority;
    expiresIn?: number; // 过期时间（毫秒）
    metadata?: Record<string, any>;
  }): Promise<ApprovalRequest> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const request: ApprovalRequest = {
      id: requestId,
      requesterId: params.requesterId,
      approvers: params.approvers,
      approvedBy: [],
      actionType: params.actionType,
      description: params.description,
      params: params.actionParams,
      priority: params.priority || "normal",
      status: "pending",
      createdAt: now,
      expiresAt: params.expiresIn ? now + params.expiresIn : now + this.config.defaultExpiryMs!,
      history: [
        {
          timestamp: now,
          actor: params.requesterId,
          action: "created",
        },
      ],
      metadata: params.metadata,
    };

    // 检查自动批准
    if (this.config.allowAutoApprove && this.checkAutoApprove(request)) {
      request.status = "approved";
      request.approvedAt = now;
      request.approvedBy = ["auto"];
      request.history.push({
        timestamp: now,
        actor: "system",
        action: "approved",
        comment: "Auto-approved",
      });
    }

    // 保存请求
    this.requests.set(requestId, request);

    // 添加索引
    if (!this.agentRequests.has(params.requesterId)) {
      this.agentRequests.set(params.requesterId, new Set());
    }
    this.agentRequests.get(params.requesterId)!.add(requestId);

    for (const approverId of params.approvers) {
      if (!this.approverRequests.has(approverId)) {
        this.approverRequests.set(approverId, new Set());
      }
      this.approverRequests.get(approverId)!.add(requestId);
    }

    // 持久化
    await this.saveRequest(request);

    console.log(`[Approval System] Created request ${requestId} for ${params.actionType}`);
    return request;
  }

  /**
   * 检查是否满足自动批准条件
   */
  private checkAutoApprove(request: ApprovalRequest): boolean {
    if (!this.config.autoApproveConditions) {
      return false;
    }

    for (const condition of this.config.autoApproveConditions) {
      // 简单的条件检查实现
      // 实际可以扩展为更复杂的规则引擎
      if (condition.condition === "actionType" && request.actionType === condition.value) {
        return true;
      }
      if (condition.condition === "priority" && request.priority === condition.value) {
        return true;
      }
    }

    return false;
  }

  /**
   * 批准请求
   */
  async approve(requestId: string, approverId: string, comment?: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is not pending (status: ${request.status})`);
    }

    // 检查是否为有效审批者
    if (!request.approvers.includes(approverId)) {
      throw new Error(`${approverId} is not an approver for request ${requestId}`);
    }

    // 检查是否已批准
    if (request.approvedBy.includes(approverId)) {
      throw new Error(`${approverId} has already approved request ${requestId}`);
    }

    // 添加批准
    request.approvedBy.push(approverId);
    request.history.push({
      timestamp: Date.now(),
      actor: approverId,
      action: "approved",
      comment,
    });

    // 检查是否满足批准条件
    const shouldApprove = this.config.requireAll
      ? request.approvedBy.length === request.approvers.length
      : request.approvedBy.length >= (this.config.minApprovers || 1);

    if (shouldApprove) {
      request.status = "approved";
      request.approvedAt = Date.now();
      console.log(`[Approval System] Request ${requestId} approved`);
    }

    await this.saveRequest(request);
  }

  /**
   * 拒绝请求
   */
  async reject(requestId: string, approverId: string, reason?: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is not pending (status: ${request.status})`);
    }

    // 检查是否为有效审批者
    if (!request.approvers.includes(approverId)) {
      throw new Error(`${approverId} is not an approver for request ${requestId}`);
    }

    // 标记为拒绝
    request.status = "rejected";
    request.rejectedAt = Date.now();
    request.rejectionReason = reason;
    request.history.push({
      timestamp: Date.now(),
      actor: approverId,
      action: "rejected",
      comment: reason,
    });

    await this.saveRequest(request);
    console.log(`[Approval System] Request ${requestId} rejected by ${approverId}`);
  }

  /**
   * 取消请求
   */
  async cancel(requestId: string, cancellerId: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is not pending (status: ${request.status})`);
    }

    // 只有请求者可以取消
    if (request.requesterId !== cancellerId) {
      throw new Error(`Only requester can cancel the request`);
    }

    request.status = "cancelled";
    request.history.push({
      timestamp: Date.now(),
      actor: cancellerId,
      action: "cancelled",
    });

    await this.saveRequest(request);
    console.log(`[Approval System] Request ${requestId} cancelled`);
  }

  /**
   * 获取请求
   */
  getRequest(requestId: string): ApprovalRequest | null {
    return this.requests.get(requestId) || null;
  }

  /**
   * 获取 Agent 的所有请求
   */
  getAgentRequests(agentId: string, status?: ApprovalStatus): ApprovalRequest[] {
    const requestIds = this.agentRequests.get(agentId);
    if (!requestIds) {
      return [];
    }

    const requests: ApprovalRequest[] = [];
    for (const requestId of requestIds) {
      const request = this.requests.get(requestId);
      if (request && (!status || request.status === status)) {
        requests.push(request);
      }
    }

    return requests;
  }

  /**
   * 获取待审批的请求
   */
  getPendingApprovals(approverId: string): ApprovalRequest[] {
    const requestIds = this.approverRequests.get(approverId);
    if (!requestIds) {
      return [];
    }

    const pending: ApprovalRequest[] = [];
    for (const requestId of requestIds) {
      const request = this.requests.get(requestId);
      if (request && request.status === "pending" && !request.approvedBy.includes(approverId)) {
        pending.push(request);
      }
    }

    return pending;
  }

  /**
   * 检查过期请求
   */
  async checkExpiredRequests(): Promise<void> {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [requestId, request] of this.requests) {
      if (request.status === "pending" && request.expiresAt && request.expiresAt < now) {
        request.status = "expired";
        request.history.push({
          timestamp: now,
          actor: "system",
          action: "expired",
        });
        expiredIds.push(requestId);
        await this.saveRequest(request);
      }
    }

    if (expiredIds.length > 0) {
      console.log(`[Approval System] Marked ${expiredIds.length} requests as expired`);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): ApprovalStats {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let expired = 0;
    let totalApprovalTime = 0;
    let approvalCount = 0;

    for (const request of this.requests.values()) {
      switch (request.status) {
        case "pending":
          pending++;
          break;
        case "approved":
          approved++;
          if (request.approvedAt) {
            totalApprovalTime += request.approvedAt - request.createdAt;
            approvalCount++;
          }
          break;
        case "rejected":
          rejected++;
          break;
        case "expired":
          expired++;
          break;
      }
    }

    return {
      pending,
      approved,
      rejected,
      expired,
      avgApprovalTime: approvalCount > 0 ? totalApprovalTime / approvalCount : 0,
    };
  }

  /**
   * 保存请求到持久化存储
   */
  private async saveRequest(request: ApprovalRequest): Promise<void> {
    const filePath = path.join(this.storageDir, `${request.id}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(request, null, 2), "utf-8");
    } catch (error) {
      console.error(`[Approval System] Failed to save request ${request.id}:`, error);
    }
  }

  /**
   * 清理旧请求
   */
  async cleanupOldRequests(olderThanMs: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [requestId, request] of this.requests) {
      if (request.status !== "pending" && now - request.createdAt > olderThanMs) {
        toDelete.push(requestId);
      }
    }

    for (const requestId of toDelete) {
      this.requests.delete(requestId);

      // 删除文件
      const filePath = path.join(this.storageDir, `${requestId}.json`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // 忽略文件不存在的错误
      }
    }

    if (toDelete.length > 0) {
      console.log(`[Approval System] Cleaned up ${toDelete.length} old requests`);
    }
  }
}

/**
 * 全局审批系统实例
 */
export const approvalSystem = new ApprovalSystem();
