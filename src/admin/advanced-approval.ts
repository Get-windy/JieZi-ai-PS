/**
 * Phase 7: 高级审批系统
 *
 * 职责：
 * 1. 管理高级审批请求
 * 2. 支持多级审批链
 * 3. 支持加权审批
 * 4. 自动升级和自动审批
 * 5. 审批策略管理
 */

import type { PermissionSubject } from "../config/types.permissions.js";
import type {
  AdvancedApprovalRequest,
  ApprovalDecision,
  ApprovalPolicy,
  ApprovalPriority,
  ApprovalStatistics,
  AdminOperationType,
  EmergencyAccessRequest,
  SuperAdmin,
} from "./types.js";
import { superAdminManager } from "./super-admin-manager.js";

/**
 * 高级审批系统（单例）
 */
export class AdvancedApprovalSystem {
  private static instance: AdvancedApprovalSystem;
  private requests: Map<string, AdvancedApprovalRequest> = new Map();
  private policies: Map<string, ApprovalPolicy> = new Map();
  private emergencyAccess: Map<string, EmergencyAccessRequest> = new Map();

  // 通知回调
  private notifyCallback?: (
    recipient: PermissionSubject,
    request: AdvancedApprovalRequest,
  ) => Promise<void>;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): AdvancedApprovalSystem {
    if (!AdvancedApprovalSystem.instance) {
      AdvancedApprovalSystem.instance = new AdvancedApprovalSystem();
    }
    return AdvancedApprovalSystem.instance;
  }

  /**
   * 设置通知回调
   */
  public setNotifyCallback(
    callback: (recipient: PermissionSubject, request: AdvancedApprovalRequest) => Promise<void>,
  ): void {
    this.notifyCallback = callback;
  }

  // ========== 审批策略管理 ==========

  /**
   * 创建审批策略
   */
  public createPolicy(policy: ApprovalPolicy): ApprovalPolicy {
    if (this.policies.has(policy.id)) {
      throw new Error(`Policy already exists: ${policy.id}`);
    }

    this.policies.set(policy.id, policy);
    return policy;
  }

  /**
   * 获取审批策略
   */
  public getPolicy(policyId: string): ApprovalPolicy | null {
    return this.policies.get(policyId) || null;
  }

  /**
   * 查找匹配的审批策略
   */
  public findMatchingPolicies(params: {
    operation: AdminOperationType;
    agentGroup?: string;
    organization?: string;
  }): ApprovalPolicy[] {
    return Array.from(this.policies.values())
      .filter((policy) => {
        if (!policy.enabled) return false;

        // 检查操作类型
        if (
          policy.appliesTo.operations &&
          !policy.appliesTo.operations.includes(params.operation)
        ) {
          return false;
        }

        // 检查智能助手组
        if (
          params.agentGroup &&
          policy.appliesTo.agentGroups &&
          !policy.appliesTo.agentGroups.includes(params.agentGroup)
        ) {
          return false;
        }

        // 检查组织
        if (
          params.organization &&
          policy.appliesTo.organizations &&
          !policy.appliesTo.organizations.includes(params.organization)
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.priority - a.priority); // 按优先级排序
  }

  // ========== 审批请求管理 ==========

  /**
   * 创建审批请求
   */
  public async createRequest(params: {
    requester: PermissionSubject;
    requestedAction: AdminOperationType;
    targetType: string;
    targetId: string;
    title: string;
    description: string;
    reason: string;
    priority?: ApprovalPriority;
    approvers?: PermissionSubject[];
    requiredApprovals?: number;
    approvalType?: AdvancedApprovalRequest["approvalType"];
    expiryDuration?: number; // 过期时间（秒）
    attachments?: AdvancedApprovalRequest["attachments"];
  }): Promise<AdvancedApprovalRequest> {
    const {
      requester,
      requestedAction,
      targetType,
      targetId,
      title,
      description,
      reason,
      priority = "normal",
      approvers,
      requiredApprovals,
      approvalType = "any",
      expiryDuration,
      attachments,
    } = params;

    const now = Date.now();
    const requestId = `approval-${now}-${Math.random().toString(36).substr(2, 9)}`;

    // 查找匹配的策略
    const matchingPolicies = this.findMatchingPolicies({
      operation: requestedAction,
    });

    let finalApprovers = approvers;
    let finalRequiredApprovals = requiredApprovals;

    // 如果没有指定审批者，使用策略配置
    if (!finalApprovers && matchingPolicies.length > 0) {
      const policy = matchingPolicies[0];
      finalApprovers = policy.approvalConfig.approvers;
      finalRequiredApprovals = policy.approvalConfig.requiredApprovals || 1;
    }

    if (!finalApprovers || finalApprovers.length === 0) {
      throw new Error("No approvers specified");
    }

    const request: AdvancedApprovalRequest = {
      id: requestId,
      requester,
      requestedAction,
      targetType,
      targetId,
      title,
      description,
      reason,
      priority,
      approvers: finalApprovers,
      requiredApprovals: finalRequiredApprovals || 1,
      approvalType,
      status: "pending",
      currentLevel: 1,
      approvals: [],
      createdAt: now,
      expiresAt: expiryDuration ? now + expiryDuration * 1000 : undefined,
      attachments,
    };

    this.requests.set(requestId, request);

    // 发送通知
    if (this.notifyCallback) {
      for (const approver of finalApprovers) {
        await this.notifyCallback(approver, request);
      }
    }

    // 检查自动审批规则
    if (matchingPolicies.length > 0) {
      const policy = matchingPolicies[0];
      if (policy.approvalConfig.autoApprovalRules) {
        for (const rule of policy.approvalConfig.autoApprovalRules) {
          if (this.evaluateCondition(rule.condition, request)) {
            if (rule.action === "approve") {
              return this.autoApprove(requestId, "Auto-approved by policy");
            } else {
              return this.autoReject(requestId, "Auto-rejected by policy");
            }
          }
        }
      }
    }

    return request;
  }

  /**
   * 评估条件（简化实现）
   */
  private evaluateCondition(condition: string, request: AdvancedApprovalRequest): boolean {
    // 这里应该实现更复杂的条件评估逻辑
    // 简化实现：假设条件总是不满足
    return false;
  }

  /**
   * 自动批准
   */
  private autoApprove(requestId: string, comment: string): AdvancedApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    request.status = "approved";
    request.approvedAt = Date.now();

    request.approvals.push({
      approver: { type: "user", id: "system", name: "Auto-Approval" },
      approved: true,
      timestamp: Date.now(),
      comment,
    });

    return request;
  }

  /**
   * 自动拒绝
   */
  private autoReject(requestId: string, comment: string): AdvancedApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    request.status = "rejected";
    request.rejectedAt = Date.now();

    request.approvals.push({
      approver: { type: "user", id: "system", name: "Auto-Rejection" },
      approved: false,
      timestamp: Date.now(),
      comment,
    });

    return request;
  }

  /**
   * 处理审批决策
   */
  public async processDecision(decision: ApprovalDecision): Promise<AdvancedApprovalRequest> {
    const request = this.requests.get(decision.requestId);
    if (!request) {
      throw new Error(`Request not found: ${decision.requestId}`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request is not pending: ${request.status}`);
    }

    // 检查审批者是否有权限
    if (!this.isApprover(request, decision.approver)) {
      throw new Error("User is not an approver for this request");
    }

    // 检查是否已经审批过
    if (request.approvals.some((a) => a.approver.id === decision.approver.id)) {
      throw new Error("User has already approved this request");
    }

    // 处理委托
    if (decision.decision === "delegate") {
      if (!decision.delegateTo) {
        throw new Error("Delegate target not specified");
      }

      request.approvers.push(decision.delegateTo);

      // 发送通知给被委托人
      if (this.notifyCallback) {
        await this.notifyCallback(decision.delegateTo, request);
      }

      return request;
    }

    // 记录审批
    const approval = {
      approver: decision.approver,
      approved: decision.decision === "approve",
      timestamp: decision.timestamp || Date.now(),
      comment: decision.comment,
      ipAddress: decision.ipAddress,
      weight: request.approverWeights?.get(decision.approver.id),
    };

    request.approvals.push(approval);

    // 检查是否满足审批条件
    const result = this.checkApprovalStatus(request);

    if (result.approved) {
      request.status = "approved";
      request.approvedAt = Date.now();
    } else if (result.rejected) {
      request.status = "rejected";
      request.rejectedAt = Date.now();
    }

    return request;
  }

  /**
   * 检查是否为审批者
   */
  private isApprover(request: AdvancedApprovalRequest, subject: PermissionSubject): boolean {
    return request.approvers.some((a) => a.type === subject.type && a.id === subject.id);
  }

  /**
   * 检查审批状态
   */
  private checkApprovalStatus(request: AdvancedApprovalRequest): {
    approved: boolean;
    rejected: boolean;
  } {
    const approvedCount = request.approvals.filter((a) => a.approved).length;
    const rejectedCount = request.approvals.filter((a) => !a.approved).length;

    switch (request.approvalType) {
      case "any":
        // 任意一个批准即可
        return {
          approved: approvedCount >= 1,
          rejected: rejectedCount === request.approvers.length,
        };

      case "all":
        // 所有人都要批准
        return {
          approved: approvedCount === request.approvers.length,
          rejected: rejectedCount >= 1,
        };

      case "majority":
        // 多数批准
        const majority = Math.ceil(request.approvers.length / 2);
        return {
          approved: approvedCount >= majority,
          rejected: rejectedCount >= majority,
        };

      case "weighted":
        // 加权审批
        let totalWeight = 0;
        let approvedWeight = 0;

        for (const approval of request.approvals) {
          const weight = approval.weight || 1;
          totalWeight += weight;
          if (approval.approved) {
            approvedWeight += weight;
          }
        }

        const maxWeight = Array.from(request.approverWeights?.values() || [1]).reduce(
          (sum, w) => sum + w,
          0,
        );

        return {
          approved: approvedWeight >= maxWeight / 2,
          rejected: totalWeight - approvedWeight >= maxWeight / 2,
        };

      default:
        return { approved: false, rejected: false };
    }
  }

  /**
   * 获取审批请求
   */
  public getRequest(requestId: string): AdvancedApprovalRequest | null {
    return this.requests.get(requestId) || null;
  }

  /**
   * 获取待审批请求
   */
  public getPendingRequests(params?: {
    approverId?: string;
    priority?: ApprovalPriority;
    requestedAction?: AdminOperationType;
  }): AdvancedApprovalRequest[] {
    let requests = Array.from(this.requests.values()).filter((r) => r.status === "pending");

    if (params?.approverId) {
      requests = requests.filter((r) => r.approvers.some((a) => a.id === params.approverId));
    }

    if (params?.priority) {
      requests = requests.filter((r) => r.priority === params.priority);
    }

    if (params?.requestedAction) {
      requests = requests.filter((r) => r.requestedAction === params.requestedAction);
    }

    // 按优先级和创建时间排序
    requests.sort((a, b) => {
      const priorityOrder: Record<ApprovalPriority, number> = {
        emergency: 5,
        urgent: 4,
        high: 3,
        normal: 2,
        low: 1,
      };

      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return a.createdAt - b.createdAt; // 早的在前
    });

    return requests;
  }

  /**
   * 取消审批请求
   */
  public cancelRequest(requestId: string, operatorId: string, reason?: string): boolean {
    const request = this.requests.get(requestId);
    if (!request) {
      return false;
    }

    if (request.status !== "pending") {
      throw new Error(`Cannot cancel request with status: ${request.status}`);
    }

    request.status = "cancelled";
    request.metadata = {
      ...request.metadata,
      cancelledBy: operatorId,
      cancellationReason: reason,
      cancelledAt: Date.now(),
    };

    return true;
  }

  // ========== 紧急访问管理 ==========

  /**
   * 创建紧急访问请求
   */
  public createEmergencyAccess(params: {
    requester: SuperAdmin;
    emergencyType: EmergencyAccessRequest["emergencyType"];
    description: string;
    severity: EmergencyAccessRequest["severity"];
    requestedPermissions: string[];
    duration: number; // 秒
  }): EmergencyAccessRequest {
    const { requester, emergencyType, description, severity, requestedPermissions, duration } =
      params;

    const now = Date.now();
    const requestId = `emergency-${now}-${Math.random().toString(36).substr(2, 9)}`;

    const request: EmergencyAccessRequest = {
      id: requestId,
      requester,
      emergencyType,
      description,
      severity,
      requestedPermissions,
      duration,
      status: "pending",
      createdAt: now,
      usageLog: [],
    };

    this.emergencyAccess.set(requestId, request);

    return request;
  }

  /**
   * 授予紧急访问
   */
  public grantEmergencyAccess(requestId: string, approverId: string): EmergencyAccessRequest {
    const request = this.emergencyAccess.get(requestId);
    if (!request) {
      throw new Error(`Emergency access request not found: ${requestId}`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request is not pending: ${request.status}`);
    }

    const now = Date.now();

    request.status = "granted";
    request.approvedBy = approverId;
    request.approvedAt = now;
    request.expiresAt = now + request.duration * 1000;

    return request;
  }

  /**
   * 记录紧急访问使用
   */
  public logEmergencyAccessUsage(
    requestId: string,
    action: string,
    details?: Record<string, any>,
  ): void {
    const request = this.emergencyAccess.get(requestId);
    if (!request) {
      throw new Error(`Emergency access request not found: ${requestId}`);
    }

    request.usageLog.push({
      action,
      timestamp: Date.now(),
      details,
    });
  }

  /**
   * 撤销紧急访问
   */
  public revokeEmergencyAccess(
    requestId: string,
    revokedBy: string,
    reason?: string,
  ): EmergencyAccessRequest {
    const request = this.emergencyAccess.get(requestId);
    if (!request) {
      throw new Error(`Emergency access request not found: ${requestId}`);
    }

    request.status = "revoked";
    request.revokedAt = Date.now();
    request.revokedBy = revokedBy;
    request.revokedReason = reason;

    return request;
  }

  // ========== 统计信息 ==========

  /**
   * 获取审批统计
   */
  public getStatistics(params?: {
    startTime?: number;
    endTime?: number;
    approverId?: string;
  }): ApprovalStatistics {
    let requests = Array.from(this.requests.values());

    // 过滤时间范围
    if (params?.startTime) {
      requests = requests.filter((r) => r.createdAt >= params.startTime!);
    }

    if (params?.endTime) {
      requests = requests.filter((r) => r.createdAt <= params.endTime!);
    }

    const totalRequests = requests.length;
    const pendingRequests = requests.filter((r) => r.status === "pending").length;
    const approvedRequests = requests.filter((r) => r.status === "approved").length;
    const rejectedRequests = requests.filter((r) => r.status === "rejected").length;
    const expiredRequests = requests.filter((r) => r.status === "expired").length;

    // 计算平均审批时间
    const completedRequests = requests.filter(
      (r) => r.status === "approved" || r.status === "rejected",
    );

    const totalApprovalTime = completedRequests.reduce((sum, r) => {
      const completionTime = r.approvedAt || r.rejectedAt || r.createdAt;
      return sum + (completionTime - r.createdAt);
    }, 0);

    const averageApprovalTime =
      completedRequests.length > 0 ? totalApprovalTime / completedRequests.length : 0;

    // 按优先级分组
    const byPriority: Record<ApprovalPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
      emergency: 0,
    };

    for (const request of requests) {
      byPriority[request.priority]++;
    }

    // 按操作类型分组
    const byOperationType: Partial<Record<AdminOperationType, number>> = {};
    for (const request of requests) {
      byOperationType[request.requestedAction] =
        (byOperationType[request.requestedAction] || 0) + 1;
    }

    // 按审批者分组
    const byApprover = new Map<
      string,
      {
        total: number;
        approved: number;
        rejected: number;
        averageTime: number;
      }
    >();

    if (params?.approverId) {
      const approverRequests = requests.filter((r) =>
        r.approvals.some((a) => a.approver.id === params.approverId),
      );

      const approved = approverRequests.filter((r) =>
        r.approvals.some((a) => a.approver.id === params.approverId && a.approved),
      ).length;

      const rejected = approverRequests.filter((r) =>
        r.approvals.some((a) => a.approver.id === params.approverId && !a.approved),
      ).length;

      const totalTime = approverRequests.reduce((sum, r) => {
        const approval = r.approvals.find((a) => a.approver.id === params.approverId);
        return approval ? sum + (approval.timestamp - r.createdAt) : sum;
      }, 0);

      byApprover.set(params.approverId, {
        total: approverRequests.length,
        approved,
        rejected,
        averageTime: approverRequests.length > 0 ? totalTime / approverRequests.length : 0,
      });
    }

    return {
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      expiredRequests,
      averageApprovalTime,
      byPriority,
      byOperationType: byOperationType as Record<AdminOperationType, number>,
      byApprover,
      periodStart: params?.startTime || 0,
      periodEnd: params?.endTime || Date.now(),
    };
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    this.requests.clear();
    this.policies.clear();
    this.emergencyAccess.clear();
  }
}

/**
 * 导出单例实例
 */
export const advancedApprovalSystem = AdvancedApprovalSystem.getInstance();
