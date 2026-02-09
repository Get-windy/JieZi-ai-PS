/**
 * Phase 4: 组织与协作体系 - 类型定义
 *
 * 定义组织结构、团队、协作关系等核心类型
 */

/**
 * 组织层级类型
 */
export type OrganizationLevel = "company" | "department" | "team" | "individual";

/**
 * 组织结构
 */
export interface Organization {
  id: string;
  name: string;
  level: OrganizationLevel;
  parentId?: string; // 上级组织
  managerId?: string; // 负责人助手ID
  memberIds: string[]; // 成员助手ID列表

  // 组织属性
  description?: string;
  industry?: string; // 行业/业务领域
  location?: string; // 地域

  // 资源配额（组织级）
  quota?: {
    maxMembers?: number;
    budgetPerMonth?: number;
    maxTokensPerDay?: number;
  };

  // 元数据
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
}

/**
 * 团队类型
 */
export type TeamType = "permanent" | "project" | "temporary";

/**
 * 团队结构
 */
export interface Team {
  id: string;
  name: string;
  organizationId: string; // 所属组织
  leaderId: string; // 组长助手ID
  memberIds: string[]; // 成员列表

  // 团队类型
  type: TeamType;

  // 团队目标
  objectives: string[];

  // 团队资源
  sharedResources: {
    workspaces: string[]; // 共享工作区
    knowledgeBases: string[]; // 共享知识库
    tools: string[]; // 共享工具
  };

  // 有效期（项目制团队）
  validFrom?: number;
  validUntil?: number;

  // 元数据
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
}

/**
 * 协作关系类型
 */
export type CollaborationRelationType =
  | "supervisor" // 上下级
  | "colleague" // 同事
  | "project" // 项目协作
  | "business" // 业务关联
  | "mentor" // 师徒
  | "monitor"; // 监督

/**
 * 协作关系
 */
export interface CollaborationRelation {
  id: string;
  type: CollaborationRelationType;
  fromAgentId: string; // 关系发起者
  toAgentId: string; // 关系接收者

  // 关系属性
  organizationId?: string; // 所属组织
  description?: string;
  permissions?: string[]; // 此关系下的特殊权限
  metadata?: Record<string, any>; // 元数据

  // 有效期
  validFrom?: number;
  validUntil?: number;

  // 元数据
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
}

/**
 * 师徒关系
 */
export interface MentorshipRelation {
  id: string;
  mentorId: string; // 师傅ID
  menteeId: string; // 徒弟ID

  // 指导计划
  trainingPlan?: {
    goals: string[]; // 学习目标
    skills: string[]; // 需要掌握的技能
    duration?: number; // 预计时长（天）
  };

  // 进度跟踪
  progress?: {
    completedGoals: string[]; // 已完成目标
    acquiredSkills: string[]; // 已掌握技能
    progressRate: number; // 进度百分比（0-100）
    lastUpdated: number;
  };

  // 状态
  status: "active" | "completed" | "cancelled";

  // 有效期
  startDate: number;
  endDate?: number;

  // 元数据
  createdAt: number;
  createdBy: string;
}

/**
 * 任务分配
 */
export interface TaskAssignment {
  id: string;
  title: string;
  description: string;

  // 分配信息
  assignerId: string; // 分配者ID
  assigneeId: string; // 执行者ID
  teamId?: string; // 所属团队ID

  // 任务属性
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in-progress" | "completed" | "cancelled";

  // 时间
  dueDate?: number;
  startedAt?: number;
  completedAt?: number;

  // 元数据
  createdAt: number;
  updatedAt?: number;
}

/**
 * 组织配置（用于 AgentConfig）
 */
export interface OrganizationConfig {
  // 所属组织
  companyId?: string; // 公司ID
  departmentId?: string; // 部门ID
  teamId?: string; // 小组ID

  // 角色与岗位
  roleId: string; // 角色ID
  positionId?: string; // 岗位ID

  // 汇报关系
  supervisorId?: string; // 直接主管ID
  subordinateIds?: string[]; // 下属列表

  // 工作属性
  employmentType: "full-time" | "part-time" | "contractor" | "intern";
  startDate: number; // 入职时间
  endDate?: number; // 离职时间（可选）
}

/**
 * 协作配置（用于 AgentConfig）
 */
export interface CollaborationConfig {
  // 团队成员
  teams?: Array<{
    teamId: string;
    role: "leader" | "member" | "observer";
    joinedAt: number;
  }>;

  // 项目协作
  projects?: Array<{
    projectId: string;
    role: string;
    startDate: number;
    endDate?: number;
  }>;

  // 师徒关系
  mentorship?: {
    mentorId?: string; // 师傅ID
    menteeIds?: string[]; // 徒弟ID列表
  };

  // 业务协作伙伴
  partners?: string[]; // 常协作的助手ID
}
