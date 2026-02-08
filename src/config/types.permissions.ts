/**
 * 权限配置类型定义
 *
 * 核心理念：细粒度的工具权限管理
 * - 支持用户/组/角色的权限控制
 * - 支持工具级别的权限控制
 * - 支持审批工作流
 * - 支持权限继承和委托
 */

/**
 * 权限主体类型
 */
export type PermissionSubjectType = "user" | "group" | "role";

/**
 * 权限主体
 */
export type PermissionSubject = {
  /** 主体类型 */
  type: PermissionSubjectType;

  /** 主体ID */
  id: string;

  /** 主体名称（可选） */
  name?: string;
};

/**
 * 权限动作
 */
export type PermissionAction =
  | "allow" // 允许
  | "deny" // 拒绝
  | "require_approval"; // 需要审批

/**
 * 工具权限规则
 */
export type ToolPermissionRule = {
  /** 规则ID */
  id: string;

  /** 工具名称（支持通配符，如 "file.*" 表示所有文件工具） */
  toolName: string;

  /** 权限主体 */
  subjects: PermissionSubject[];

  /** 权限动作 */
  action: PermissionAction;

  /** 条件约束（可选） */
  conditions?: {
    /** 时间范围约束 */
    timeRange?: {
      start: string; // ISO 8601 格式
      end: string;
    };

    /** IP 地址约束 */
    ipWhitelist?: string[];

    /** 参数约束（工具参数必须满足的条件） */
    parameterConstraints?: Record<string, any>;

    /** 自定义条件脚本（JavaScript 表达式） */
    customCondition?: string;
  };

  /** 优先级（数字越大优先级越高） */
  priority?: number;

  /** 是否启用 */
  enabled?: boolean;

  /** 描述 */
  description?: string;
};

/**
 * 审批配置
 */
export type ApprovalConfig = {
  /** 审批者列表 */
  approvers: PermissionSubject[];

  /** 所需审批者数量（默认为1，即任意一个审批者批准即可） */
  requiredApprovals?: number;

  /** 审批超时时间（秒） */
  timeout?: number;

  /** 超时默认动作 */
  timeoutAction?: "approve" | "reject";

  /** 是否需要理由 */
  requireReason?: boolean;

  /** 通知方式 */
  notificationMethods?: Array<"email" | "slack" | "telegram" | "webhook">;

  /** Webhook URL（用于自定义通知） */
  webhookUrl?: string;
};

/**
 * 角色定义
 */
export type RoleDefinition = {
  /** 角色ID */
  id: string;

  /** 角色名称 */
  name: string;

  /** 角色描述 */
  description?: string;

  /** 角色继承（从其他角色继承权限） */
  inheritsFrom?: string[];

  /** 成员列表 */
  members: PermissionSubject[];

  /** 角色权限规则 */
  permissions: string[]; // 引用 ToolPermissionRule 的 ID
};

/**
 * 用户组定义
 */
export type GroupDefinition = {
  /** 组ID */
  id: string;

  /** 组名称 */
  name: string;

  /** 组描述 */
  description?: string;

  /** 成员列表 */
  members: string[]; // 用户ID列表

  /** 管理员列表 */
  admins?: string[];
};

/**
 * 权限委托
 */
export type PermissionDelegation = {
  /** 委托ID */
  id: string;

  /** 委托人 */
  delegator: PermissionSubject;

  /** 受托人 */
  delegate: PermissionSubject;

  /** 委托的权限（工具名称列表） */
  tools: string[];

  /** 委托期限 */
  expiresAt?: number; // Unix 时间戳

  /** 是否启用 */
  enabled?: boolean;

  /** 备注 */
  note?: string;
};

/**
 * 权限审计日志
 */
export type PermissionAuditLog = {
  /** 日志ID */
  id: string;

  /** 时间戳 */
  timestamp: number;

  /** 用户 */
  user: PermissionSubject;

  /** 工具名称 */
  toolName: string;

  /** 工具参数 */
  toolParams?: Record<string, any>;

  /** 权限检查结果 */
  result: "allowed" | "denied" | "requires_approval";

  /** 应用的规则ID */
  appliedRuleId?: string;

  /** 拒绝原因 */
  denialReason?: string;

  /** 审批ID（如果需要审批） */
  approvalId?: string;

  /** 会话ID */
  sessionId?: string;

  /** 智能助手ID */
  agentId?: string;
};

/**
 * 智能助手权限配置
 */
export type AgentPermissionsConfig = {
  /** 默认权限动作（当没有匹配规则时） */
  defaultAction?: PermissionAction;

  /** 工具权限规则列表 */
  rules: ToolPermissionRule[];

  /** 角色定义 */
  roles?: RoleDefinition[];

  /** 用户组定义 */
  groups?: GroupDefinition[];

  /** 权限委托 */
  delegations?: PermissionDelegation[];

  /** 审批配置 */
  approvalConfig?: ApprovalConfig;

  /** 是否启用审计日志 */
  enableAuditLog?: boolean;

  /** 审计日志路径 */
  auditLogPath?: string;

  /** 是否启用权限缓存 */
  enableCache?: boolean;

  /** 缓存过期时间（秒） */
  cacheTtl?: number;
};

/**
 * 扩展 AgentConfig，添加权限配置
 */
export type AgentConfigWithPermissions = {
  /** 现有字段 */
  id: string;
  name?: string;
  // ... 其他现有字段 ...

  /** 【新增】权限配置 */
  permissions?: AgentPermissionsConfig;
};
