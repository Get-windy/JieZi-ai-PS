/**
 * Phase 7: 人类超级管理员与审批系统 - 核心类型定义
 *
 * 基于 Phase 3 权限体系，扩展超级管理员和高级审批功能
 */

import type {
  PermissionSubject,
  PermissionAction,
  ApprovalConfig,
} from "../config/types.permissions.js";

/**
 * 超级管理员角色类型
 */
export type SuperAdminRole =
  | "system-admin" // 系统管理员（最高权限）
  | "security-admin" // 安全管理员
  | "compliance-admin" // 合规管理员
  | "operations-admin" // 运营管理员
  | "audit-viewer"; // 审计查看员

/**
 * 超级管理员
 */
export interface SuperAdmin {
  id: string;
  userId: string; // 人类用户ID
  role: SuperAdminRole;
  permissions: string[]; // 特殊权限列表

  // 基本信息
  name: string;
  email: string;
  phone?: string;

  // 状态
  isActive: boolean;
  isOnline: boolean;
  lastActiveAt?: number;

  // 权限范围
  scope?: {
    organizations?: string[]; // 可管理的组织
    agentGroups?: string[]; // 可管理的智能助手组
    tools?: string[]; // 可管理的工具
  };

  // 安全设置
  mfaEnabled: boolean; // 多因素认证
  mfaMethod?: "totp" | "sms" | "email";
  ipWhitelist?: string[];

  // 创建信息
  createdAt: number;
  createdBy: string;
  updatedAt?: number;

  // 额外元数据
  metadata?: Record<string, any>;
}

/**
 * 超级管理员操作类型
 */
export type AdminOperationType =
  | "agent_create" // 创建智能助手
  | "agent_delete" // 删除智能助手
  | "agent_suspend" // 暂停智能助手
  | "agent_activate" // 激活智能助手
  | "agent_config_change" // 修改智能助手配置
  | "permission_grant" // 授予权限
  | "permission_revoke" // 撤销权限
  | "approval_override" // 审批覆盖
  | "system_config_change" // 系统配置修改
  | "emergency_stop" // 紧急停止
  | "audit_export" // 审计日志导出
  | "user_management"; // 用户管理

/**
 * 超级管理员操作记录
 */
export interface AdminOperation {
  id: string;
  adminId: string;
  operationType: AdminOperationType;

  // 操作对象
  targetType: "agent" | "user" | "system" | "permission" | "approval";
  targetId: string;

  // 操作详情
  action: string;
  parameters?: Record<string, any>;
  reason?: string;

  // 结果
  success: boolean;
  error?: string;

  // 影响范围
  affectedEntities?: Array<{
    type: string;
    id: string;
  }>;

  // 时间信息
  timestamp: number;
  duration?: number;

  // 审计信息
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

/**
 * 审批优先级
 */
export type ApprovalPriority = "low" | "normal" | "high" | "urgent" | "emergency";

/**
 * 高级审批请求
 */
export interface AdvancedApprovalRequest {
  id: string;

  // 基本信息
  requester: PermissionSubject;
  requestedAction: AdminOperationType;
  targetType: string;
  targetId: string;

  // 请求详情
  title: string;
  description: string;
  reason: string;
  priority: ApprovalPriority;

  // 审批配置
  approvers: PermissionSubject[];
  requiredApprovals: number;
  approvalType: "any" | "all" | "majority" | "weighted";

  // 权重（用于加权审批）
  approverWeights?: Map<string, number>;

  // 审批链（多级审批）
  approvalChain?: Array<{
    level: number;
    approvers: PermissionSubject[];
    requiredApprovals: number;
    status: "pending" | "approved" | "rejected";
  }>;

  // 状态
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  currentLevel: number;

  // 审批记录
  approvals: Array<{
    approver: PermissionSubject;
    approved: boolean;
    weight?: number;
    timestamp: number;
    comment?: string;
    ipAddress?: string;
  }>;

  // 时间信息
  createdAt: number;
  expiresAt?: number;
  approvedAt?: number;
  rejectedAt?: number;

  // 附件
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
    size: number;
  }>;

  // 关联信息
  relatedRequests?: string[];
  parentRequestId?: string;

  // 额外元数据
  metadata?: Record<string, any>;
}

/**
 * 审批决策
 */
export interface ApprovalDecision {
  requestId: string;
  approver: PermissionSubject;
  decision: "approve" | "reject" | "delegate";
  comment?: string;

  // 委托信息（当 decision 为 'delegate' 时）
  delegateTo?: PermissionSubject;

  // 附加条件
  conditions?: string[];

  timestamp: number;
  ipAddress?: string;
}

/**
 * 审批策略
 */
export interface ApprovalPolicy {
  id: string;
  name: string;
  description?: string;

  // 适用范围
  appliesTo: {
    operations?: AdminOperationType[];
    agentGroups?: string[];
    organizations?: string[];
  };

  // 审批配置
  approvalConfig: ApprovalConfig & {
    escalationRules?: Array<{
      condition: string;
      escalateTo: PermissionSubject[];
      delay: number; // 延迟时间（秒）
    }>;

    // 自动审批规则
    autoApprovalRules?: Array<{
      condition: string;
      action: "approve" | "reject";
    }>;
  };

  // 是否启用
  enabled: boolean;

  // 优先级
  priority: number;

  // 创建信息
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
}

/**
 * 紧急访问请求
 */
export interface EmergencyAccessRequest {
  id: string;

  // 请求者
  requester: SuperAdmin;

  // 紧急原因
  emergencyType: "system-outage" | "security-incident" | "data-loss" | "critical-bug" | "other";
  description: string;
  severity: "critical" | "high" | "medium";

  // 请求的权限
  requestedPermissions: string[];
  duration: number; // 持续时间（秒）

  // 状态
  status: "pending" | "granted" | "denied" | "expired" | "revoked";

  // 审批信息
  approvedBy?: string;
  approvedAt?: number;
  expiresAt?: number;

  // 使用记录
  usageLog: Array<{
    action: string;
    timestamp: number;
    details?: Record<string, any>;
  }>;

  // 时间信息
  createdAt: number;
  revokedAt?: number;
  revokedBy?: string;
  revokedReason?: string;
}

/**
 * 审批统计
 */
export interface ApprovalStatistics {
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  expiredRequests: number;

  // 平均审批时间（毫秒）
  averageApprovalTime: number;

  // 按优先级分组
  byPriority: Record<ApprovalPriority, number>;

  // 按操作类型分组
  byOperationType: Record<AdminOperationType, number>;

  // 按审批者分组
  byApprover: Map<
    string,
    {
      total: number;
      approved: number;
      rejected: number;
      averageTime: number;
    }
  >;

  // 时间范围
  periodStart: number;
  periodEnd: number;
}

/**
 * 管理员通知类型
 */
export type AdminNotificationType =
  | "approval_request" // 新审批请求
  | "approval_approved" // 审批通过
  | "approval_rejected" // 审批拒绝
  | "approval_expired" // 审批过期
  | "emergency_access" // 紧急访问请求
  | "system_alert" // 系统警报
  | "security_incident" // 安全事件
  | "audit_alert"; // 审计警报

/**
 * 管理员通知
 */
export interface AdminNotification {
  id: string;
  type: AdminNotificationType;

  // 接收者
  recipientId: string;
  recipientRole: SuperAdminRole;

  // 通知内容
  title: string;
  message: string;
  priority: ApprovalPriority;

  // 关联对象
  relatedEntityType?: string;
  relatedEntityId?: string;

  // 操作按钮
  actions?: Array<{
    label: string;
    action: string;
    url?: string;
  }>;

  // 状态
  isRead: boolean;
  readAt?: number;

  // 时间信息
  createdAt: number;
  expiresAt?: number;
}

/**
 * 管理员会话
 */
export interface AdminSession {
  id: string;
  adminId: string;

  // 会话信息
  startedAt: number;
  lastActivityAt: number;
  expiresAt: number;

  // 安全信息
  ipAddress: string;
  userAgent: string;
  location?: {
    country: string;
    city: string;
    coordinates?: [number, number];
  };

  // MFA 状态
  mfaVerified: boolean;
  mfaVerifiedAt?: number;

  // 会话状态
  isActive: boolean;
  terminatedAt?: number;
  terminatedBy?: string;
  terminationReason?: string;
}

/**
 * 管理配置
 */
export interface AdminConfig {
  // 超级管理员设置
  superAdmins: SuperAdmin[];

  // 审批策略
  approvalPolicies: ApprovalPolicy[];

  // 默认审批配置
  defaultApprovalConfig: ApprovalConfig;

  // 会话设置
  sessionTimeout: number; // 会话超时（秒）
  sessionExtensionAllowed: boolean;
  maxConcurrentSessions: number;

  // 安全设置
  requireMfa: boolean;
  ipWhitelistEnabled: boolean;
  globalIpWhitelist?: string[];

  // 审计设置
  auditRetentionDays: number;
  detailedAuditLogging: boolean;

  // 通知设置
  notificationChannels: Array<"email" | "slack" | "webhook">;
  webhookUrl?: string;

  // 紧急访问设置
  emergencyAccessEnabled: boolean;
  emergencyAccessMaxDuration: number; // 最大持续时间（秒）

  // 限流设置
  rateLimits?: {
    operationsPerMinute: number;
    approvalsPerHour: number;
  };
}
