/**
 * Phase 7 超级管理员与审批系统 Gateway RPC 方法
 * 提供管理员管理、高级审批、通知系统的完整接口
 */

import type {
  SuperAdminRole,
  AdminOperationType,
  ApprovalPriority,
  PermissionSubject,
  ApprovalDecision,
  AdminConfig,
  NotificationChannelConfig,
  EmergencyAccessSeverity,
} from "../../admin/types.js";
import type { GatewayRequestHandlers } from "./types.js";
import {
  phase7Integration,
  superAdminManager,
  advancedApprovalSystem,
  notificationManager,
} from "../../admin/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const phase7AdminHandlers: GatewayRequestHandlers = {
  /**
   * 初始化 Phase 7
   */
  "phase7.initialize": async ({ params, respond }) => {
    try {
      const adminConfig = params?.adminConfig as AdminConfig | undefined;
      const notificationConfig = params?.notificationConfig as
        | NotificationChannelConfig
        | undefined;
      const approvalPolicies = Array.isArray(params?.approvalPolicies)
        ? params.approvalPolicies
        : undefined;

      phase7Integration.initialize({
        adminConfig: adminConfig || {
          superAdmins: [],
          approvalPolicies: [],
          sessionTimeout: 3600,
          requireMfa: true,
        },
        notificationConfig,
        approvalPolicies,
      });

      respond(true, { success: true, initialized: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to initialize Phase 7: ${String(error)}`),
      );
    }
  },

  /**
   * 获取 Phase 7 状态
   */
  "phase7.status": async ({ params, respond }) => {
    try {
      const health = phase7Integration.healthCheck();

      respond(true, health, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get Phase 7 status: ${String(error)}`),
      );
    }
  },

  /**
   * 健康检查
   */
  "phase7.healthCheck": async ({ params, respond }) => {
    try {
      const health = phase7Integration.healthCheck();
      respond(true, health, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to perform health check: ${String(error)}`),
      );
    }
  },

  // ==================== 超级管理员管理 ====================

  /**
   * 创建超级管理员
   */
  "admin.create": async ({ params, respond }) => {
    try {
      const id = String(params?.id ?? "").trim();
      const userId = String(params?.userId ?? "").trim();
      const role = String(params?.role ?? "").trim() as SuperAdminRole;
      const name = String(params?.name ?? "").trim();
      const email = String(params?.email ?? "").trim();
      const createdBy = String(params?.createdBy ?? "system");

      if (!id || !userId || !role || !name || !email) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const admin = superAdminManager.createSuperAdmin({
        id,
        userId,
        role,
        name,
        email,
        phone: params?.phone ? String(params.phone) : undefined,
        permissions: Array.isArray(params?.permissions) ? params.permissions : [],
        mfaEnabled: Boolean(params?.mfaEnabled),
        mfaMethod: params?.mfaMethod as "totp" | "sms" | "email" | undefined,
        ipWhitelist: Array.isArray(params?.ipWhitelist) ? params.ipWhitelist : undefined,
        scope: params?.scope,
        metadata: params?.metadata,
        createdBy,
      });

      respond(true, { admin }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create admin: ${String(error)}`),
      );
    }
  },

  /**
   * 更新超级管理员
   */
  "admin.update": async ({ params, respond }) => {
    try {
      const adminId = String(params?.adminId ?? "").trim();
      if (!adminId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "adminId is required"));
        return;
      }

      const updates = params?.updates as any;
      const admin = superAdminManager.updateSuperAdmin(adminId, updates);

      respond(true, { admin }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update admin: ${String(error)}`),
      );
    }
  },

  /**
   * 删除超级管理员
   */
  "admin.delete": async ({ params, respond }) => {
    try {
      const adminId = String(params?.adminId ?? "").trim();
      if (!adminId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "adminId is required"));
        return;
      }

      superAdminManager.deleteSuperAdmin(adminId);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete admin: ${String(error)}`),
      );
    }
  },

  /**
   * 获取超级管理员列表
   */
  "admin.list": async ({ params, respond }) => {
    try {
      const admins = superAdminManager.getAllSuperAdmins();
      respond(true, { admins }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list admins: ${String(error)}`),
      );
    }
  },

  /**
   * 获取单个超级管理员
   */
  "admin.get": async ({ params, respond }) => {
    try {
      const adminId = String(params?.adminId ?? "").trim();
      if (!adminId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "adminId is required"));
        return;
      }

      const admin = superAdminManager.getSuperAdmin(adminId);
      if (!admin) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Admin not found"));
        return;
      }

      respond(true, { admin }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get admin: ${String(error)}`),
      );
    }
  },

  /**
   * 获取管理员权限列表
   */
  "admin.permissions.get": async ({ params, respond }) => {
    try {
      const adminId = String(params?.adminId ?? "").trim();
      if (!adminId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "adminId is required"));
        return;
      }

      const admin = superAdminManager.getSuperAdmin(adminId);
      if (!admin) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Admin not found"));
        return;
      }

      respond(true, { permissions: admin.permissions }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get permissions: ${String(error)}`),
      );
    }
  },

  /**
   * 管理员登录工作流
   */
  "admin.login": async ({ params, respond }) => {
    try {
      const adminId = String(params?.adminId ?? "").trim();
      const ipAddress = String(params?.ipAddress ?? "").trim();
      const userAgent = String(params?.userAgent ?? "").trim();
      const mfaCode = params?.mfaCode ? String(params.mfaCode) : undefined;

      if (!adminId || !ipAddress || !userAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const result = await phase7Integration.adminLoginWorkflow({
        adminId,
        ipAddress,
        userAgent,
        mfaCode,
      });

      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to login: ${String(error)}`),
      );
    }
  },

  /**
   * 管理员登出
   */
  "admin.logout": async ({ params, respond }) => {
    try {
      const sessionId = String(params?.sessionId ?? "").trim();
      if (!sessionId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId is required"));
        return;
      }

      superAdminManager.terminateSession(sessionId, "user", "User logout");
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to logout: ${String(error)}`),
      );
    }
  },

  /**
   * 验证MFA代码
   */
  "admin.verifyMfa": async ({ params, respond }) => {
    try {
      const sessionId = String(params?.sessionId ?? "").trim();
      const mfaCode = String(params?.mfaCode ?? "").trim();

      if (!sessionId || !mfaCode) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and mfaCode are required"),
        );
        return;
      }

      const valid = superAdminManager.verifyMfa(sessionId, mfaCode);
      respond(true, { valid }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to verify MFA: ${String(error)}`),
      );
    }
  },

  /**
   * 获取管理员操作历史
   */
  "admin.operations.history": async ({ params, respond }) => {
    try {
      const adminId = params?.adminId ? String(params.adminId).trim() : undefined;
      const startTime = params?.startTime ? Number(params.startTime) : undefined;
      const endTime = params?.endTime ? Number(params.endTime) : undefined;
      const operationType = params?.operationType
        ? (String(params.operationType) as AdminOperationType)
        : undefined;

      const operations = superAdminManager.getOperationHistory({
        adminId,
        startTime,
        endTime,
        operationType,
      });

      respond(true, { operations }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get operation history: ${String(error)}`),
      );
    }
  },

  // ==================== 高级审批系统 ====================

  /**
   * 创建审批请求
   */
  "approval.request.create": async ({ params, respond }) => {
    try {
      const requester = params?.requester as PermissionSubject;
      const requestedAction = String(params?.requestedAction ?? "") as AdminOperationType;
      const targetType = String(params?.targetType ?? "");
      const targetId = String(params?.targetId ?? "");
      const title = String(params?.title ?? "");
      const description = String(params?.description ?? "");
      const reason = String(params?.reason ?? "");

      if (
        !requester ||
        !requestedAction ||
        !targetType ||
        !targetId ||
        !title ||
        !description ||
        !reason
      ) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const request = await advancedApprovalSystem.createRequest({
        requester,
        requestedAction,
        targetType,
        targetId,
        title,
        description,
        reason,
        priority: params?.priority as ApprovalPriority | undefined,
        approvers: Array.isArray(params?.approvers) ? params.approvers : undefined,
        requiredApprovals: params?.requiredApprovals ? Number(params.requiredApprovals) : undefined,
        approvalType: params?.approvalType as "any" | "all" | "majority" | "weighted" | undefined,
        expiresIn: params?.expiresIn ? Number(params.expiresIn) : undefined,
        attachments: Array.isArray(params?.attachments) ? params.attachments : undefined,
        metadata: params?.metadata,
      });

      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create approval request: ${String(error)}`),
      );
    }
  },

  /**
   * 处理审批决策
   */
  "approval.request.process": async ({ params, respond }) => {
    try {
      const decision = params?.decision as ApprovalDecision;

      if (!decision || !decision.requestId || !decision.approver || !decision.decision) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Invalid approval decision"),
        );
        return;
      }

      const request = await advancedApprovalSystem.processDecision(decision);
      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to process approval: ${String(error)}`),
      );
    }
  },

  /**
   * 获取审批请求列表
   */
  "approval.requests.list": async ({ params, respond }) => {
    try {
      const filter = {
        status: params?.status as "pending" | "approved" | "rejected" | "expired" | undefined,
        requesterId: params?.requesterId ? String(params.requesterId) : undefined,
        priority: params?.priority as ApprovalPriority | undefined,
        startTime: params?.startTime ? Number(params.startTime) : undefined,
        endTime: params?.endTime ? Number(params.endTime) : undefined,
      };

      const requests = advancedApprovalSystem.getRequests(filter);
      respond(true, { requests }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list approval requests: ${String(error)}`),
      );
    }
  },

  /**
   * 获取单个审批请求
   */
  "approval.request.get": async ({ params, respond }) => {
    try {
      const requestId = String(params?.requestId ?? "").trim();
      if (!requestId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
        return;
      }

      const request = advancedApprovalSystem.getRequest(requestId);
      if (!request) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Request not found"));
        return;
      }

      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get approval request: ${String(error)}`),
      );
    }
  },

  /**
   * 获取待审批请求（针对特定审批者）
   */
  "approval.pending.list": async ({ params, respond }) => {
    try {
      const approverId = String(params?.approverId ?? "").trim();
      if (!approverId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approverId is required"));
        return;
      }

      const requests = phase7Integration.getPendingApprovals(approverId);
      respond(true, { requests }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get pending approvals: ${String(error)}`),
      );
    }
  },

  /**
   * 取消审批请求
   */
  "approval.request.cancel": async ({ params, respond }) => {
    try {
      const requestId = String(params?.requestId ?? "").trim();
      const reason = params?.reason ? String(params.reason) : undefined;

      if (!requestId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requestId is required"));
        return;
      }

      const request = advancedApprovalSystem.cancelRequest(requestId, reason);
      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to cancel approval request: ${String(error)}`),
      );
    }
  },

  /**
   * 获取审批统计
   */
  "approval.statistics": async ({ params, respond }) => {
    try {
      const startTime = params?.startTime ? Number(params.startTime) : undefined;
      const endTime = params?.endTime ? Number(params.endTime) : undefined;

      const stats = phase7Integration.getApprovalStatistics({ startTime, endTime });
      respond(true, { statistics: stats }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get approval statistics: ${String(error)}`),
      );
    }
  },

  /**
   * 创建审批策略
   */
  "approval.policy.create": async ({ params, respond }) => {
    try {
      const policy = params?.policy;
      if (!policy) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "policy is required"));
        return;
      }

      const created = advancedApprovalSystem.createPolicy(policy);
      respond(true, { policy: created }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create approval policy: ${String(error)}`),
      );
    }
  },

  /**
   * 更新审批策略
   */
  "approval.policy.update": async ({ params, respond }) => {
    try {
      const policyId = String(params?.policyId ?? "").trim();
      const updates = params?.updates;

      if (!policyId || !updates) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "policyId and updates are required"),
        );
        return;
      }

      const policy = advancedApprovalSystem.updatePolicy(policyId, updates);
      respond(true, { policy }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update approval policy: ${String(error)}`),
      );
    }
  },

  /**
   * 获取审批策略列表
   */
  "approval.policy.list": async ({ params, respond }) => {
    try {
      const policies = advancedApprovalSystem.getPolicies();
      respond(true, { policies }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list approval policies: ${String(error)}`),
      );
    }
  },

  // ==================== 紧急访问管理 ====================

  /**
   * 创建紧急访问请求
   */
  "emergency.request.create": async ({ params, respond }) => {
    try {
      const adminId = String(params?.adminId ?? "").trim();
      const emergencyType = String(params?.emergencyType ?? "").trim();
      const description = String(params?.description ?? "").trim();
      const severity = String(params?.severity ?? "critical") as EmergencyAccessSeverity;
      const requestedPermissions = Array.isArray(params?.requestedPermissions)
        ? params.requestedPermissions
        : [];
      const duration = params?.duration ? Number(params.duration) : 3600;

      if (!adminId || !emergencyType || !description) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields"),
        );
        return;
      }

      const admin = superAdminManager.getSuperAdmin(adminId);
      if (!admin) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Admin not found"));
        return;
      }

      const request = phase7Integration.createEmergencyAccessRequest({
        requester: admin,
        emergencyType,
        description,
        severity,
        requestedPermissions,
        duration,
      });

      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create emergency access request: ${String(error)}`,
        ),
      );
    }
  },

  /**
   * 授予紧急访问
   */
  "emergency.request.grant": async ({ params, respond }) => {
    try {
      const requestId = String(params?.requestId ?? "").trim();
      const grantedBy = String(params?.grantedBy ?? "").trim();

      if (!requestId || !grantedBy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "requestId and grantedBy are required"),
        );
        return;
      }

      const request = phase7Integration.grantEmergencyAccess(requestId, grantedBy);
      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to grant emergency access: ${String(error)}`),
      );
    }
  },

  /**
   * 拒绝紧急访问
   */
  "emergency.request.deny": async ({ params, respond }) => {
    try {
      const requestId = String(params?.requestId ?? "").trim();
      const deniedBy = String(params?.deniedBy ?? "").trim();
      const reason = params?.reason ? String(params.reason) : undefined;

      if (!requestId || !deniedBy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "requestId and deniedBy are required"),
        );
        return;
      }

      const request = phase7Integration.denyEmergencyAccess(requestId, deniedBy, reason);
      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to deny emergency access: ${String(error)}`),
      );
    }
  },

  /**
   * 撤销紧急访问
   */
  "emergency.request.revoke": async ({ params, respond }) => {
    try {
      const requestId = String(params?.requestId ?? "").trim();
      const revokedBy = String(params?.revokedBy ?? "").trim();
      const reason = params?.reason ? String(params.reason) : undefined;

      if (!requestId || !revokedBy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "requestId and revokedBy are required"),
        );
        return;
      }

      const request = phase7Integration.revokeEmergencyAccess(requestId, revokedBy, reason);
      respond(true, { request }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to revoke emergency access: ${String(error)}`),
      );
    }
  },

  // ==================== 通知系统 ====================

  /**
   * 获取通知列表
   */
  "notification.list": async ({ params, respond }) => {
    try {
      const recipientId = params?.recipientId ? String(params.recipientId).trim() : undefined;
      const isRead = params?.isRead !== undefined ? Boolean(params.isRead) : undefined;
      const type = params?.type ? String(params.type) : undefined;
      const startTime = params?.startTime ? Number(params.startTime) : undefined;
      const endTime = params?.endTime ? Number(params.endTime) : undefined;

      const notifications = notificationManager.getNotifications({
        recipientId,
        isRead,
        type,
        startTime,
        endTime,
      });

      respond(true, { notifications }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list notifications: ${String(error)}`),
      );
    }
  },

  /**
   * 标记通知为已读
   */
  "notification.markRead": async ({ params, respond }) => {
    try {
      const notificationId = String(params?.notificationId ?? "").trim();

      if (!notificationId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "notificationId is required"),
        );
        return;
      }

      notificationManager.markAsRead(notificationId);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to mark notification as read: ${String(error)}`),
      );
    }
  },

  /**
   * 批量标记通知为已读
   */
  "notification.markAllRead": async ({ params, respond }) => {
    try {
      const recipientId = String(params?.recipientId ?? "").trim();

      if (!recipientId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "recipientId is required"),
        );
        return;
      }

      const count = notificationManager.markAllAsRead(recipientId);
      respond(true, { count }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to mark all notifications as read: ${String(error)}`,
        ),
      );
    }
  },

  /**
   * 获取未读通知数
   */
  "notification.unreadCount": async ({ params, respond }) => {
    try {
      const recipientId = String(params?.recipientId ?? "").trim();

      if (!recipientId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "recipientId is required"),
        );
        return;
      }

      const count = notificationManager.getUnreadCount(recipientId);
      respond(true, { count }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get unread count: ${String(error)}`),
      );
    }
  },

  /**
   * 获取通知统计
   */
  "notification.statistics": async ({ params, respond }) => {
    try {
      const recipientId = params?.recipientId ? String(params.recipientId).trim() : undefined;
      const startTime = params?.startTime ? Number(params.startTime) : undefined;
      const endTime = params?.endTime ? Number(params.endTime) : undefined;

      const stats = notificationManager.getStatistics({ recipientId, startTime, endTime });
      respond(true, { statistics: stats }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get notification statistics: ${String(error)}`,
        ),
      );
    }
  },
};
