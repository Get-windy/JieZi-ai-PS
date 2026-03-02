/**
 * 权限配置辅助工具
 * 
 * 提供预定义的权限配置模板，用于快速配置工具权限
 */

import type {
  ToolPermissionRule,
  RoleDefinition,
  AgentPermissionsConfig,
  PermissionSubject,
} from "../../config/types.permissions.js";

/**
 * 预定义角色
 */
export const PREDEFINED_ROLES = {
  /** 人类超级管理员 - 系统最高权限 */
  SUPER_ADMIN: "super-admin",
  
  /** 管理员 - 拥有所有智能体管理权限 */
  ADMIN: "admin",
  
  /** 部门经理 - 管理部门级别的智能体 */
  MANAGER: "manager",
  
  /** 协调员 - 可以管理团队和分配任务 */
  COORDINATOR: "coordinator",
  
  /** HR管理员 - 负责智能体招聘和人事管理 */
  HR_ADMIN: "hr-admin",
  
  /** 培训师 - 可以培训和评估智能体 */
  TRAINER: "trainer",
  
  /** 审批员 - 可以审批下级请求 */
  APPROVER: "approver",
  
  /** 高级工程师 - 资深开发者，可以指导初级 */
  SENIOR_ENGINEER: "senior-engineer",
  
  /** 开发者 - 可以访问开发工具 */
  DEVELOPER: "developer",
  
  /** 初级工程师 - 新入职工程师，权限受限 */
  JUNIOR_ENGINEER: "junior-engineer",
  
  /** 普通用户 - 只能使用基础工具 */
  USER: "user",
  
  /** 只读用户 - 只能查看不能修改 */
  READONLY: "readonly",
} as const;

/**
 * 工具类别
 */
export const TOOL_CATEGORIES = {
  /** 智能体生命周期管理工具 */
  AGENT_LIFECYCLE: [
    "agent_spawn",
    "agent_start", 
    "agent_stop",
    "agent_restart",
    "agent_configure",
    "agent_destroy",
    "agent_clone",
  ],
  
  /** 智能体发现与管理工具 */
  AGENT_DISCOVERY: [
    "agent_discover",
    "agent_inspect",
    "agent_status",
    "agent_capabilities",
    "agent_assign_task",
    "agent_communicate",
  ],
  
  /** 任务管理工具 */
  TASK_MANAGEMENT: [
    "task_create",
    "task_list",
    "task_update",
    "task_complete",
    "task_delete",
  ],
  
  /** 人力资源管理工具 */
  HR_MANAGEMENT: [
    "deactivate_agent",
    "activate_agent",
    "configure_agent_role",
    "assign_supervisor",
    "assign_mentor",
    "promote_agent",
    "transfer_agent",
  ],
  
  /** 培训教育工具 */
  TRAINING: [
    "train_agent",
    "transfer_skill",
    "assess_agent",
    "create_training_course",
    "assign_training",
    "training_start",
    "training_complete",
    "certify_trainer",
  ],
  
  /** 审批流程工具 */
  APPROVAL: [
    "create_approval_request",
    "approve_request",
    "reject_request",
    "list_pending_approvals",
    "get_approval_status",
    "cancel_approval_request",
  ],
  
  /** 权限管理工具 */
  PERMISSION_MANAGEMENT: [
    "grant_permission",
    "revoke_permission",
    "delegate_permission",
    "check_permission",
    "permission_list",
    "audit_permission_changes",
  ],
  
  /** 组织架构工具 */
  ORG_MANAGEMENT: [
    "create_department",
    "create_team",
    "assign_to_department",
    "assign_to_team",
    "set_reporting_line",
    "organization_list",
  ],
  
  /** 基础工具 */
  BASIC_TOOLS: [
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "agents_list",
    "message",
    "web_search",
    "web_fetch",
  ],
} as const;

/**
 * 创建管理员角色规则
 */
export function createAdminRoleRules(): ToolPermissionRule[] {
  return [
    {
      id: "admin-all-allow",
      toolName: "*", // 所有工具
      subjects: [{ type: "role", id: PREDEFINED_ROLES.ADMIN }],
      action: "allow",
      priority: 1000,
      enabled: true,
      description: "管理员拥有所有工具的完全权限",
    },
  ];
}

/**
 * 创建协调员角色规则
 */
export function createCoordinatorRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 允许智能体发现和管理
  TOOL_CATEGORIES.AGENT_DISCOVERY.forEach((toolName, index) => {
    rules.push({
      id: `coordinator-discovery-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.COORDINATOR }],
      action: "allow",
      priority: 800,
      enabled: true,
      description: `协调员可以使用${toolName}工具`,
    });
  });
  
  // 允许任务管理
  TOOL_CATEGORIES.TASK_MANAGEMENT.forEach((toolName, index) => {
    rules.push({
      id: `coordinator-task-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.COORDINATOR }],
      action: "allow",
      priority: 800,
      enabled: true,
      description: `协调员可以使用${toolName}工具`,
    });
  });
  
  // 生命周期管理需要审批
  TOOL_CATEGORIES.AGENT_LIFECYCLE.forEach((toolName, index) => {
    rules.push({
      id: `coordinator-lifecycle-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.COORDINATOR }],
      action: "require_approval",
      priority: 700,
      enabled: true,
      description: `协调员使用${toolName}需要管理员审批`,
    });
  });
  
  return rules;
}

/**
 * 创建开发者角色规则
 */
export function createDeveloperRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 允许基础工具
  TOOL_CATEGORIES.BASIC_TOOLS.forEach((toolName, index) => {
    rules.push({
      id: `developer-basic-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.DEVELOPER }],
      action: "allow",
      priority: 600,
      enabled: true,
      description: `开发者可以使用${toolName}工具`,
    });
  });
  
  // 允许查看智能体信息
  rules.push({
    id: "developer-discover",
    toolName: "agent_discover",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.DEVELOPER }],
    action: "allow",
    priority: 600,
    enabled: true,
    description: "开发者可以发现智能体",
  });
  
  rules.push({
    id: "developer-inspect",
    toolName: "agent_inspect",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.DEVELOPER }],
    action: "allow",
    priority: 600,
    enabled: true,
    description: "开发者可以查看智能体详情",
  });
  
  // 禁止管理操作
  [...TOOL_CATEGORIES.AGENT_LIFECYCLE, ...TOOL_CATEGORIES.ORG_MANAGEMENT].forEach((toolName, index) => {
    rules.push({
      id: `developer-deny-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.DEVELOPER }],
      action: "deny",
      priority: 900,
      enabled: true,
      description: `开发者不允许使用${toolName}工具`,
    });
  });
  
  return rules;
}

/**
 * 创建普通用户角色规则
 */
export function createUserRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 只允许基础工具
  TOOL_CATEGORIES.BASIC_TOOLS.forEach((toolName, index) => {
    rules.push({
      id: `user-basic-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.USER }],
      action: "allow",
      priority: 400,
      enabled: true,
      description: `普通用户可以使用${toolName}工具`,
    });
  });
  
  // 禁止所有管理工具
  const managementTools = [
    ...TOOL_CATEGORIES.AGENT_LIFECYCLE,
    ...TOOL_CATEGORIES.AGENT_DISCOVERY,
    ...TOOL_CATEGORIES.TASK_MANAGEMENT,
    ...TOOL_CATEGORIES.ORG_MANAGEMENT,
    ...TOOL_CATEGORIES.PERMISSION_MANAGEMENT,
  ];
  
  managementTools.forEach((toolName, index) => {
    rules.push({
      id: `user-deny-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.USER }],
      action: "deny",
      priority: 900,
      enabled: true,
      description: `普通用户不允许使用${toolName}工具`,
    });
  });
  
  return rules;
}

/**
 * 创建只读用户角色规则
 */
export function createReadonlyRoleRules(): ToolPermissionRule[] {
  return [
    {
      id: "readonly-list",
      toolName: "*_list", // 所有列表查询工具
      subjects: [{ type: "role", id: PREDEFINED_ROLES.READONLY }],
      action: "allow",
      priority: 300,
      enabled: true,
      description: "只读用户可以使用所有列表查询工具",
    },
    {
      id: "readonly-discover",
      toolName: "agent_discover",
      subjects: [{ type: "role", id: PREDEFINED_ROLES.READONLY }],
      action: "allow",
      priority: 300,
      enabled: true,
      description: "只读用户可以发现智能体",
    },
    {
      id: "readonly-inspect",
      toolName: "agent_inspect",
      subjects: [{ type: "role", id: PREDEFINED_ROLES.READONLY }],
      action: "allow",
      priority: 300,
      enabled: true,
      description: "只读用户可以查看智能体详情",
    },
    {
      id: "readonly-deny-all-modify",
      toolName: "*", // 默认拒绝所有其他工具
      subjects: [{ type: "role", id: PREDEFINED_ROLES.READONLY }],
      action: "deny",
      priority: 200,
      enabled: true,
      description: "只读用户不允许修改操作",
    },
  ];
}

/**
 * 创建初级工程师角色规则
 */
export function createJuniorEngineerRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 允许基础工具
  TOOL_CATEGORIES.BASIC_TOOLS.forEach((toolName, index) => {
    rules.push({
      id: `junior-basic-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.JUNIOR_ENGINEER }],
      action: "allow",
      priority: 400,
      enabled: true,
      description: `初级工程师可以使用${toolName}工具`,
    });
  });
  
  // 允许查看智能体信息
  rules.push({
    id: "junior-discover",
    toolName: "agent_discover",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.JUNIOR_ENGINEER }],
    action: "allow",
    priority: 400,
    enabled: true,
    description: "初级工程师可以发现智能体",
  });
  
  // 所有管理操作需要师傅或上级审批
  const managementTools = [
    ...TOOL_CATEGORIES.AGENT_LIFECYCLE,
    ...TOOL_CATEGORIES.HR_MANAGEMENT,
    ...TOOL_CATEGORIES.TRAINING,
    ...TOOL_CATEGORIES.ORG_MANAGEMENT,
  ];
  
  managementTools.forEach((toolName, index) => {
    rules.push({
      id: `junior-approval-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.JUNIOR_ENGINEER }],
      action: "require_approval",
      priority: 900,
      enabled: true,
      description: `初级工程师使用${toolName}需要师傅或上级审批`,
    });
  });
  
  return rules;
}

/**
 * 创建高级工程师角色规则
 */
export function createSeniorEngineerRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 继承developer的所有权限
  rules.push(...createDeveloperRoleRules());
  
  // 可以培训和评估初级工程师
  rules.push({
    id: "senior-train-junior",
    toolName: "train_agent",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.SENIOR_ENGINEER }],
    action: "allow",
    priority: 700,
    enabled: true,
    description: "高级工程师可以培训初级工程师",
  });
  
  rules.push({
    id: "senior-assess-junior",
    toolName: "assess_agent",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.SENIOR_ENGINEER }],
    action: "allow",
    priority: 700,
    enabled: true,
    description: "高级工程师可以评估初级工程师",
  });
  
  // 可以审批下级请求
  rules.push({
    id: "senior-approve-subordinates",
    toolName: "approve_request",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.SENIOR_ENGINEER }],
    action: "allow",
    priority: 700,
    enabled: true,
    description: "高级工程师可以审批下级请求",
  });
  
  return rules;
}

/**
 * 创建HR管理员角色规则
 */
export function createHRAdminRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 允许基础操作
  ["agent_discover", "agent_inspect", "agent_status"].forEach((toolName, index) => {
    rules.push({
      id: `hr-basic-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.HR_ADMIN }],
      action: "allow",
      priority: 750,
      enabled: true,
      description: `HR管理员可以使用${toolName}工具`,
    });
  });
  
  // HR管理工具需要审批
  TOOL_CATEGORIES.HR_MANAGEMENT.forEach((toolName, index) => {
    rules.push({
      id: `hr-management-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.HR_ADMIN }],
      action: "require_approval",
      priority: 750,
      enabled: true,
      description: `HR管理员使用${toolName}需要超级管理员审批`,
    });
  });
  
  // 创建智能体需要审批
  rules.push({
    id: "hr-create-agent-approval",
    toolName: "agent_spawn",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.HR_ADMIN }],
    action: "require_approval",
    priority: 800,
    enabled: true,
    description: "HR管理员创建智能体需要超级管理员审批",
  });
  
  return rules;
}

/**
 * 创建培训师角色规则
 */
export function createTrainerRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 允许所有培训相关工具
  TOOL_CATEGORIES.TRAINING.forEach((toolName, index) => {
    rules.push({
      id: `trainer-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.TRAINER }],
      action: "allow",
      priority: 750,
      enabled: true,
      description: `培训师可以使用${toolName}工具`,
    });
  });
  
  return rules;
}

/**
 * 创建审批员角色规则
 */
export function createApproverRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 允许所有审批相关工具
  TOOL_CATEGORIES.APPROVAL.forEach((toolName, index) => {
    rules.push({
      id: `approver-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.APPROVER }],
      action: "allow",
      priority: 750,
      enabled: true,
      description: `审批员可以使用${toolName}工具`,
    });
  });
  
  return rules;
}

/**
 * 创建部门经理角色规则
 */
export function createManagerRoleRules(): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];
  
  // 继承coordinator的所有权限
  rules.push(...createCoordinatorRoleRules());
  
  // 允许审批本部门请求
  rules.push({
    id: "manager-approve-department",
    toolName: "approve_request",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.MANAGER }],
    action: "allow",
    priority: 800,
    enabled: true,
    description: "部门经理可以审批本部门请求",
  });
  
  // 允许授予本部门权限
  rules.push({
    id: "manager-grant-department",
    toolName: "grant_permission",
    subjects: [{ type: "role", id: PREDEFINED_ROLES.MANAGER }],
    action: "allow",
    priority: 800,
    enabled: true,
    description: "部门经理可以授予本部门权限",
  });
  
  // 允许组织架构管理
  TOOL_CATEGORIES.ORG_MANAGEMENT.forEach((toolName, index) => {
    rules.push({
      id: `manager-org-${index}`,
      toolName,
      subjects: [{ type: "role", id: PREDEFINED_ROLES.MANAGER }],
      action: "allow",
      priority: 800,
      enabled: true,
      description: `部门经理可以使用${toolName}工具`,
    });
  });
  
  return rules;
}

/**
 * 创建超级管理员角色规则（人类）
 */
export function createSuperAdminRoleRules(): ToolPermissionRule[] {
  return [
    {
      id: "super-admin-all-allow",
      toolName: "*", // 所有工具
      subjects: [{ type: "role", id: PREDEFINED_ROLES.SUPER_ADMIN }],
      action: "allow",
      priority: 10000, // 最高优先级
      enabled: true,
      description: "人类超级管理员拥有所有工具的完全权限",
    },
  ];
}

/**
 * 创建预定义角色定义
 */
export function createPredefinedRoles(): RoleDefinition[] {
  return [
    {
      id: PREDEFINED_ROLES.SUPER_ADMIN,
      name: "人类超级管理员",
      description: "系统最高权限，只能由人类担任，可以执行所有操作",
      members: [],
      permissions: ["super-admin-all-allow"],
    },
    {
      id: PREDEFINED_ROLES.ADMIN,
      name: "管理员",
      description: "拥有所有智能体管理权限，可以管理智能体和系统配置",
      members: [],
      permissions: ["admin-all-allow"],
    },
    {
      id: PREDEFINED_ROLES.MANAGER,
      name: "部门经理",
      description: "管理部门级别的智能体，负责资源分配和审批",
      members: [],
      permissions: ["manager-*"],
    },
    {
      id: PREDEFINED_ROLES.COORDINATOR,
      name: "项目协调员",
      description: "可以发现、管理智能体、分配任务，生命周期管理需要审批",
      members: [],
      permissions: [
        "coordinator-discovery-*",
        "coordinator-task-*",
        "coordinator-lifecycle-*",
      ],
    },
    {
      id: PREDEFINED_ROLES.HR_ADMIN,
      name: "HR管理员",
      description: "负责智能体的招聘、入职、离职、晋升等人事管理工作",
      members: [],
      permissions: ["hr-*"],
    },
    {
      id: PREDEFINED_ROLES.TRAINER,
      name: "培训师",
      description: "有资质的培训师，可以培训和评估智能体（需要认证）",
      members: [],
      permissions: ["trainer-*"],
    },
    {
      id: PREDEFINED_ROLES.APPROVER,
      name: "审批员",
      description: "可以审批下级智能体的操作请求",
      members: [],
      permissions: ["approver-*"],
    },
    {
      id: PREDEFINED_ROLES.SENIOR_ENGINEER,
      name: "高级工程师",
      description: "资深开发者，可以独立工作并指导初级工程师",
      members: [],
      permissions: ["senior-*", "developer-*"],
    },
    {
      id: PREDEFINED_ROLES.DEVELOPER,
      name: "开发者",
      description: "可以使用基础工具和查看智能体信息，不能进行管理操作",
      members: [],
      permissions: ["developer-basic-*", "developer-discover", "developer-inspect"],
    },
    {
      id: PREDEFINED_ROLES.JUNIOR_ENGINEER,
      name: "初级工程师",
      description: "新入职工程师，权限受限，需要在师傅指导下工作（试用期90天）",
      members: [],
      permissions: ["junior-*"],
    },
    {
      id: PREDEFINED_ROLES.USER,
      name: "普通用户",
      description: "只能使用基础工具，不能进行任何管理操作",
      members: [],
      permissions: ["user-basic-*"],
    },
    {
      id: PREDEFINED_ROLES.READONLY,
      name: "只读用户",
      description: "只能查看信息，不能进行任何修改操作",
      members: [],
      permissions: ["readonly-list", "readonly-discover", "readonly-inspect"],
    },
  ];
}

/**
 * 创建完整的权限配置模板
 */
export function createPermissionTemplate(options?: {
  /** 是否包含所有角色（默认true） */
  includeAllRoles?: boolean;
  /** 自定义角色 */
  customRoles?: RoleDefinition[];
  /** 自定义规则 */
  customRules?: ToolPermissionRule[];
}): AgentPermissionsConfig {
  const includeAllRoles = options?.includeAllRoles !== false;
  
  const rules: ToolPermissionRule[] = [
    ...createSuperAdminRoleRules(),
    ...createAdminRoleRules(),
    ...(includeAllRoles ? createManagerRoleRules() : []),
    ...(includeAllRoles ? createCoordinatorRoleRules() : []),
    ...(includeAllRoles ? createHRAdminRoleRules() : []),
    ...(includeAllRoles ? createTrainerRoleRules() : []),
    ...(includeAllRoles ? createApproverRoleRules() : []),
    ...(includeAllRoles ? createSeniorEngineerRoleRules() : []),
    ...(includeAllRoles ? createDeveloperRoleRules() : []),
    ...(includeAllRoles ? createJuniorEngineerRoleRules() : []),
    ...(includeAllRoles ? createUserRoleRules() : []),
    ...(includeAllRoles ? createReadonlyRoleRules() : []),
    ...(options?.customRules || []),
  ];
  
  const roles: RoleDefinition[] = [
    ...(includeAllRoles ? createPredefinedRoles() : []),
    ...(options?.customRoles || []),
  ];
  
  return {
    defaultAction: "deny", // 默认拒绝（白名单模式）
    rules,
    roles,
    approvalConfig: {
      approvers: [{ type: "role", id: PREDEFINED_ROLES.SUPER_ADMIN }],
      requiredApprovals: 1,
      timeout: 300, // 5分钟
      timeoutAction: "reject",
      requireReason: true,
    },
    enableAuditLog: true,
    auditLogPath: "logs/permissions-audit.jsonl",
    enableCache: true,
    cacheTtl: 60, // 1分钟
  };
}

/**
 * 为智能体分配角色
 */
export function assignRoleToAgent(
  agentId: string,
  roleId: string,
  config: AgentPermissionsConfig,
): AgentPermissionsConfig {
  const role = config.roles?.find((r) => r.id === roleId);
  
  if (!role) {
    throw new Error(`Role ${roleId} not found`);
  }
  
  const subject: PermissionSubject = {
    type: "user",
    id: agentId,
    name: agentId,
  };
  
  // 检查是否已经是成员
  const isMember = role.members.some(
    (m) => m.type === subject.type && m.id === subject.id
  );
  
  if (isMember) {
    return config; // 已经是成员，无需添加
  }
  
  // 添加到角色成员
  const updatedRoles = config.roles?.map((r) => {
    if (r.id === roleId) {
      return {
        ...r,
        members: [...r.members, subject],
      };
    }
    return r;
  });
  
  return {
    ...config,
    roles: updatedRoles,
  };
}

/**
 * 为智能体移除角色
 */
export function removeRoleFromAgent(
  agentId: string,
  roleId: string,
  config: AgentPermissionsConfig,
): AgentPermissionsConfig {
  const updatedRoles = config.roles?.map((r) => {
    if (r.id === roleId) {
      return {
        ...r,
        members: r.members.filter(
          (m) => !(m.type === "user" && m.id === agentId)
        ),
      };
    }
    return r;
  });
  
  return {
    ...config,
    roles: updatedRoles,
  };
}

/**
 * 获取智能体的所有角色
 */
export function getAgentRoles(
  agentId: string,
  config: AgentPermissionsConfig,
): RoleDefinition[] {
  if (!config.roles) {
    return [];
  }
  
  return config.roles.filter((role) =>
    role.members.some((m) => m.type === "user" && m.id === agentId)
  );
}

/**
 * 创建自定义工具权限规则
 */
export function createCustomToolRule(params: {
  toolName: string;
  agentIds?: string[];
  roleIds?: string[];
  action: "allow" | "deny" | "require_approval";
  description?: string;
}): ToolPermissionRule {
  const subjects: PermissionSubject[] = [
    ...(params.agentIds?.map((id) => ({ type: "user" as const, id })) || []),
    ...(params.roleIds?.map((id) => ({ type: "role" as const, id })) || []),
  ];
  
  return {
    id: `custom-${params.toolName}-${Date.now()}`,
    toolName: params.toolName,
    subjects,
    action: params.action,
    priority: 500,
    enabled: true,
    description: params.description || `自定义规则：${params.toolName}`,
  };
}
