/**
 * Phase 7: 人类超级管理员与审批系统 - 集成器
 *
 * 职责：
 * 1. 统一初始化所有 Phase 7 组件
 * 2. 提供便捷的集成接口
 * 3. 协调各个管理器之间的交互
 * 4. 提供完整的工作流实现
 */

import type { PermissionSubject } from "../config/types.permissions.js";
import type {
  SuperAdmin,
  AdminConfig,
  AdvancedApprovalRequest,
  ApprovalDecision,
  AdminOperation,
  EmergencyAccessRequest,
  ApprovalPolicy,
  AdminOperationType,
} from "./types.js";
import { advancedApprovalSystem } from "./advanced-approval.js";
import { notificationManager, type NotificationChannelConfig } from "./notification-manager.js";
import { superAdminManager } from "./super-admin-manager.js";

/**
 * Phase 7 集成器（单例）
 */
export class Phase7Integration {
  private static instance: Phase7Integration;
  private initialized: boolean = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): Phase7Integration {
    if (!Phase7Integration.instance) {
      Phase7Integration.instance = new Phase7Integration();
    }
    return Phase7Integration.instance;
  }

  /**
   * 初始化 Phase 7
   */
  public initialize(config: {
    adminConfig: AdminConfig;
    notificationConfig?: NotificationChannelConfig;
    approvalPolicies?: ApprovalPolicy[];
  }): void {
    if (this.initialized) {
      console.warn("Phase 7 already initialized");
      return;
    }

    // 初始化超级管理员管理器
    superAdminManager.setConfig(config.adminConfig);

    // 初始化通知管理器
    if (config.notificationConfig) {
      notificationManager.setChannelConfig(config.notificationConfig);
    }

    // 初始化审批策略
    if (config.approvalPolicies) {
      for (const policy of config.approvalPolicies) {
        advancedApprovalSystem.createPolicy(policy);
      }
    }

    // 设置审批系统的通知回调
    advancedApprovalSystem.setNotifyCallback(async (recipient, request) => {
      notificationManager.notifyApprovalRequest(recipient, request);
    });

    this.initialized = true;
    console.log("[Phase 7] Initialized successfully");
  }

  /**
   * 检查是否已初始化
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  // ========== 便捷接口 - 超级管理员管理 ==========

  /**
   * 创建超级管理员
   */
  public createSuperAdmin(params: {
    id: string;
    userId: string;
    role: SuperAdmin["role"];
    name: string;
    email: string;
    phone?: string;
    permissions?: string[];
    scope?: SuperAdmin["scope"];
    ipWhitelist?: string[];
    createdBy: string;
  }): SuperAdmin {
    return superAdminManager.createSuperAdmin(params);
  }

  /**
   * 获取超级管理员
   */
  public getSuperAdmin(adminId: string): SuperAdmin | null {
    return superAdminManager.getSuperAdmin(adminId);
  }

  /**
   * 验证管理员权限
   */
  public hasAdminPermission(adminId: string, permission: string): boolean {
    return superAdminManager.hasPermission(adminId, permission);
  }

  /**
   * 创建管理员会话
   */
  public createAdminSession(params: { adminId: string; ipAddress: string; userAgent: string }) {
    return superAdminManager.createSession(params);
  }

  /**
   * 验证管理员会话
   */
  public validateAdminSession(sessionId: string): boolean {
    return superAdminManager.validateSession(sessionId);
  }

  // ========== 便捷接口 - 审批管理 ==========

  /**
   * 创建审批请求
   */
  public async createApprovalRequest(params: {
    requester: PermissionSubject;
    requestedAction: AdminOperationType;
    targetType: string;
    targetId: string;
    title: string;
    description: string;
    reason: string;
    priority?: AdvancedApprovalRequest["priority"];
  }): Promise<AdvancedApprovalRequest> {
    return advancedApprovalSystem.createRequest(params);
  }

  /**
   * 处理审批决策
   */
  public async processApprovalDecision(
    decision: ApprovalDecision,
  ): Promise<AdvancedApprovalRequest> {
    const result = await advancedApprovalSystem.processDecision(decision);

    // 发送通知给请求者
    if (result.status === "approved" || result.status === "rejected") {
      notificationManager.notifyApprovalResult(
        result.requester,
        result,
        result.status === "approved",
      );
    }

    return result;
  }

  /**
   * 获取待审批请求
   */
  public getPendingApprovals(approverId: string): AdvancedApprovalRequest[] {
    return advancedApprovalSystem.getPendingRequests({ approverId });
  }

  /**
   * 获取审批统计
   */
  public getApprovalStatistics(params?: {
    startTime?: number;
    endTime?: number;
    approverId?: string;
  }) {
    return advancedApprovalSystem.getStatistics(params);
  }

  // ========== 便捷接口 - 紧急访问 ==========

  /**
   * 创建紧急访问请求
   */
  public createEmergencyAccessRequest(params: {
    requester: SuperAdmin;
    emergencyType: EmergencyAccessRequest["emergencyType"];
    description: string;
    severity: EmergencyAccessRequest["severity"];
    requestedPermissions: string[];
    duration: number;
  }): EmergencyAccessRequest {
    const request = advancedApprovalSystem.createEmergencyAccess(params);

    // 通知所有系统管理员
    const systemAdmins = superAdminManager
      .getAllSuperAdmins()
      .filter((admin) => admin.role === "system-admin" && admin.isActive);

    for (const admin of systemAdmins) {
      notificationManager.notifyEmergencyAccess(admin, request);
    }

    return request;
  }

  /**
   * 授予紧急访问
   */
  public grantEmergencyAccess(requestId: string, approverId: string): EmergencyAccessRequest {
    return advancedApprovalSystem.grantEmergencyAccess(requestId, approverId);
  }

  /**
   * 撤销紧急访问
   */
  public revokeEmergencyAccess(
    requestId: string,
    revokedBy: string,
    reason?: string,
  ): EmergencyAccessRequest {
    return advancedApprovalSystem.revokeEmergencyAccess(requestId, revokedBy, reason);
  }

  // ========== 便捷接口 - 通知管理 ==========

  /**
   * 获取管理员通知
   */
  public getAdminNotifications(params: {
    recipientId: string;
    unreadOnly?: boolean;
    limit?: number;
  }) {
    return notificationManager.getUserNotifications(params);
  }

  /**
   * 标记通知为已读
   */
  public markNotificationAsRead(notificationId: string): boolean {
    return notificationManager.markAsRead(notificationId);
  }

  /**
   * 获取未读通知数量
   */
  public getUnreadNotificationCount(recipientId: string): number {
    return notificationManager.getUnreadCount(recipientId);
  }

  /**
   * 发送系统警报
   */
  public sendSystemAlert(params: {
    title: string;
    message: string;
    severity: "low" | "medium" | "high" | "critical";
    targetRoles?: SuperAdmin["role"][];
  }) {
    let recipients = superAdminManager.getAllSuperAdmins().filter((admin) => admin.isActive);

    // 过滤目标角色
    if (params.targetRoles && params.targetRoles.length > 0) {
      recipients = recipients.filter((admin) => params.targetRoles!.includes(admin.role));
    }

    return notificationManager.notifySystemAlert({
      recipientIds: recipients.map((r) => r.id),
      title: params.title,
      message: params.message,
      severity: params.severity,
    });
  }

  // ========== 完整工作流 ==========

  /**
   * 管理员登录工作流
   */
  public async adminLoginWorkflow(params: {
    adminId: string;
    ipAddress: string;
    userAgent: string;
    mfaCode?: string;
  }): Promise<{
    success: boolean;
    session?: ReturnType<typeof superAdminManager.createSession>;
    error?: string;
    requireMfa?: boolean;
  }> {
    try {
      const admin = superAdminManager.getSuperAdmin(params.adminId);
      if (!admin) {
        return { success: false, error: "Admin not found" };
      }

      if (!admin.isActive) {
        return { success: false, error: "Admin account is not active" };
      }

      // 创建会话
      const session = superAdminManager.createSession({
        adminId: params.adminId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      // 检查是否需要 MFA
      if (admin.mfaEnabled) {
        if (!params.mfaCode) {
          return {
            success: false,
            requireMfa: true,
            error: "MFA code required",
          };
        }

        const mfaValid = superAdminManager.verifyMfa(session.id, params.mfaCode);
        if (!mfaValid) {
          superAdminManager.terminateSession(session.id, "system", "Invalid MFA code");
          return { success: false, error: "Invalid MFA code" };
        }
      }

      // 记录登录操作
      superAdminManager.recordOperation({
        adminId: params.adminId,
        operationType: "user_management",
        targetType: "user",
        targetId: params.adminId,
        action: "admin_login",
        success: true,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        sessionId: session.id,
      });

      return { success: true, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 智能助手管理操作工作流（带审批）
   */
  public async agentManagementWorkflow(params: {
    adminId: string;
    operation: AdminOperationType;
    agentId: string;
    reason: string;
    autoApprove?: boolean; // 系统管理员可以自动批准
  }): Promise<{
    success: boolean;
    requiresApproval: boolean;
    approvalRequest?: AdvancedApprovalRequest;
    error?: string;
  }> {
    try {
      const admin = superAdminManager.getSuperAdmin(params.adminId);
      if (!admin) {
        return { success: false, requiresApproval: false, error: "Admin not found" };
      }

      // 检查权限
      const hasPermission = superAdminManager.hasPermission(params.adminId, "agent.manage");
      if (!hasPermission) {
        return { success: false, requiresApproval: false, error: "Permission denied" };
      }

      // 系统管理员可以自动批准
      if (params.autoApprove && admin.role === "system-admin") {
        // 直接执行操作
        superAdminManager.recordOperation({
          adminId: params.adminId,
          operationType: params.operation,
          targetType: "agent",
          targetId: params.agentId,
          action: "auto_approved_operation",
          success: true,
        });

        return { success: true, requiresApproval: false };
      }

      // 创建审批请求
      const approvalRequest = await advancedApprovalSystem.createRequest({
        requester: { type: "user", id: params.adminId, name: admin.name },
        requestedAction: params.operation,
        targetType: "agent",
        targetId: params.agentId,
        title: `Agent ${params.operation}: ${params.agentId}`,
        description: `Administrator ${admin.name} requests to ${params.operation} agent ${params.agentId}`,
        reason: params.reason,
        priority: this.getOperationPriority(params.operation),
      });

      return {
        success: true,
        requiresApproval: true,
        approvalRequest,
      };
    } catch (error) {
      return {
        success: false,
        requiresApproval: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 获取操作优先级
   */
  private getOperationPriority(operation: AdminOperationType): AdvancedApprovalRequest["priority"] {
    const priorityMap: Partial<Record<AdminOperationType, AdvancedApprovalRequest["priority"]>> = {
      emergency_stop: "emergency",
      agent_delete: "urgent",
      system_config_change: "high",
      agent_suspend: "high",
      permission_revoke: "normal",
      permission_grant: "normal",
      agent_create: "normal",
    };

    return priorityMap[operation] || "normal";
  }

  /**
   * 审批完整工作流（从请求到执行）
   */
  public async completeApprovalWorkflow(params: {
    requestId: string;
    approverId: string;
    decision: "approve" | "reject";
    comment?: string;
  }): Promise<{
    success: boolean;
    executed: boolean;
    result?: AdvancedApprovalRequest;
    error?: string;
  }> {
    try {
      // 处理审批决策
      const result = await this.processApprovalDecision({
        requestId: params.requestId,
        approver: { type: "user", id: params.approverId },
        decision: params.decision,
        comment: params.comment,
        timestamp: Date.now(),
      });

      // 如果批准，执行操作
      if (result.status === "approved") {
        // 记录操作执行
        superAdminManager.recordOperation({
          adminId: params.approverId,
          operationType: result.requestedAction,
          targetType: result.targetType as AdminOperation["targetType"],
          targetId: result.targetId,
          action: "execute_approved_operation",
          success: true,
        });

        return { success: true, executed: true, result };
      }

      return { success: true, executed: false, result };
    } catch (error) {
      return {
        success: false,
        executed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 健康检查
   */
  public healthCheck(): {
    initialized: boolean;
    components: {
      superAdminManager: boolean;
      advancedApprovalSystem: boolean;
      notificationManager: boolean;
    };
    statistics: {
      totalAdmins: number;
      activeAdmins: number;
      onlineAdmins: number;
      pendingApprovals: number;
      emergencyAccessRequests: number;
    };
  } {
    const admins = superAdminManager.getAllSuperAdmins();
    const pendingApprovals = advancedApprovalSystem.getPendingRequests();

    return {
      initialized: this.initialized,
      components: {
        superAdminManager: true,
        advancedApprovalSystem: true,
        notificationManager: true,
      },
      statistics: {
        totalAdmins: admins.length,
        activeAdmins: admins.filter((a) => a.isActive).length,
        onlineAdmins: admins.filter((a) => a.isOnline).length,
        pendingApprovals: pendingApprovals.length,
        emergencyAccessRequests: 0, // TODO: 实现统计
      },
    };
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    superAdminManager.clearAll();
    advancedApprovalSystem.clearAll();
    notificationManager.clearAll();
    this.initialized = false;
  }
}

/**
 * 导出单例实例
 */
export const phase7Integration = Phase7Integration.getInstance();

/**
 * 初始化 Phase 7
 */
export function initializePhase7(config: Parameters<typeof phase7Integration.initialize>[0]): void {
  phase7Integration.initialize(config);
}

/**
 * Phase 7 健康检查
 */
export function phase7HealthCheck() {
  return phase7Integration.healthCheck();
}
