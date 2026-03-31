/**
 * Phase 4: 组织与协作体系 - 类型定义
 *
 * 定义组织结构、团队、协作关系等核心类型
 */

/**
 * 组织层级类型
 */
export type OrganizationLevel = "company" | "department" | "team" | "project" | "individual";

/**
 * 成员类型（人类或智能助手）
 */
export type MemberType = "human" | "agent";

/**
 * 成员角色
 */
export type MemberRole = "owner" | "admin" | "manager" | "lead" | "member" | "observer";

/**
 * 组织成员
 */
export interface OrganizationMember {
  id: string; // 成员ID（人类或助手ID）
  type: MemberType; // 成员类型
  role: MemberRole; // 角色
  title?: string; // 职位名称
  reportTo?: string; // 汇报对象ID
  manages?: string[]; // 管理的成员ID列表
  permissions?: string[]; // 特定权限列表
  responsibilities?: string[]; // 职责列表
  joinedAt: number; // 加入时间
}

/**
 * 组织结构（扩展版本 - P0.1）
 */
export interface Organization {
  id: string;
  name: string;
  level: OrganizationLevel;
  parentId?: string; // 上级组织
  childOrgs?: string[]; // 子组织ID列表
  managerId?: string; // 负责人助手ID
  memberIds: string[]; // 成员助手ID列表（兼容旧版）

  // P0.1 新增：详细成员列表
  members?: OrganizationMember[]; // 详细成员信息（人类+智能助手）

  // 组织属性
  description?: string;
  industry?: string; // 行业/业务领域
  location?: string; // 地域
  type?: "company" | "department" | "team" | "project"; // 组织类型

  // P0.1 新增：共享资源
  sharedResources?: {
    knowledgeBases?: string[]; // 共享知识库
    documents?: string[]; // 共享文档
    tools?: string[]; // 共享工具
    workspaces?: string[]; // 共享工作空间
  };

  // 资源配额（组织级）
  quota?: {
    maxMembers?: number;
    budgetPerMonth?: number;
    maxTokensPerDay?: number;
  };

  /**
   * 部门沙箱隔离配置（仅 type=department 时生效）
   *
   * 设计原则（对抗机制）：
   * - containerPrefix 由系统强制派生，包含 departmentId hash，用户不得完全覆盖
   * - network 不允许 Agent 级配置覆盖（防进攻4）
   * - crossDeptBindMounts 强制只读（防进攻3）
   * - 部门删除后 mode 自动为 off（防进攻5）
   * - scope 不允许 shared（防进攻6）
   */
  sandboxConfig?: {
    /** 是否启用部门沙箱隔离 */
    enabled?: boolean;
    /**
     * 容器前缀（用户可设置前缀段，系统会附加 departmentId hash 确保唯一性）
     * 例："finance-" → 实际前缀 "openclaw-dept-finance-<hash8>-"
     */
    containerPrefixHint?: string;
    /**
     * 沙箱工作区根目录（绝对路径）
     * 例："~/.openclaw/sandboxes/dept-finance"
     */
    workspaceRoot?: string;
    /**
     * Docker 网络名（部门专属网络，Agent 级配置不得覆盖）
     * 例："openclaw-net-finance"
     */
    network?: string;
    /**
     * Docker 镜像（允许部门自定义，Agent 可进一步覆盖）
     */
    image?: string;
    /**
     * 工具访问策略
     */
    toolPolicy?: {
      /** 额外允许的工具（合并到全局 allow 之上） */
      allow?: string[];
      /** 额外禁止的工具（合并到全局 deny 之上） */
      deny?: string[];
    };
    /**
     * 资源配额
     */
    resourceQuota?: {
      /** 内存限制，如 "512m"、"2g" */
      memory?: string;
      /** CPU 核数限制，如 0.5、1.0 */
      cpus?: number;
      /** 进程数限制 */
      pidsLimit?: number;
    };
    /**
     * 跨部门只读挂载（用于董事会类跨部门协调）
     * 注意：强制只读（access 字段即使设为 rw 也会被降级为 ro）
     */
    crossDeptBindMounts?: Array<{
      /** 源部门 ID */
      sourceDeptId: string;
      /** 在容器内的挂载路径 */
      mountPath: string;
      /** 访问类型（强制降级为 ro，rw 仅留作未来扩展标记） */
      access: "ro" | "rw";
    }>;
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
  // oxlint-disable-next-line typescript/no-explicit-any
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

  // P1.1 新增：好友关系
  colleagues?: string[]; // 同事ID列表
  projectPartners?: string[]; // 项目协作伙伴
}

/**
 * 智能助手招聘请求（P0.3）
 */
export interface AgentRecruitRequest {
  id: string;
  organizationId: string; // 目标组织ID
  requesterId: string; // 发起人ID
  requesterType: MemberType; // 发起人类型

  // 招聘信息
  agentTemplate?: string; // 使用的助手模板
  // oxlint-disable-next-line typescript/no-explicit-any
  agentConfig?: any; // 自定义助手配置
  position: string; // 职位名称
  role: MemberRole; // 角色
  title?: string; // 职位描述

  // 审批状态
  status: "pending" | "approved" | "rejected" | "cancelled";
  approvedBy?: string; // 审批人ID
  approvedAt?: number; // 审批时间
  rejectionReason?: string; // 拒绝原因

  // 招聘结果
  agentId?: string; // 创建的助手ID（审批通过后）

  // 元数据
  createdAt: number;
  updatedAt?: number;
}

// ============================================================================
// 项目跨团队协作与交付（Handoff）
// ============================================================================

/**
 * 团队在项目中的角色
 * - dev: 开发团队（负责功能实现/技术交付）
 * - ops: 运营实施团队（负责上线/落地运营）
 * - support: 技术支撑（问题反馈处理，不作为主力开发）
 * - qa: 质量保障
 * - observer: 只读观察者
 */
export type ProjectTeamRole = "dev" | "ops" | "support" | "qa" | "observer";

/**
 * 团队在项目中的参与状态
 * - active: 正在积极参与（主力负责阶段）
 * - handed-off: 已完成交付，不再作为主力维护；但保留 support 通道
 * - archived: 彻底归档，不再有任何职责
 * - support-only: 仅提供技术支撑（接受反馈、修复问题）
 */
export type ProjectTeamStatus = "active" | "handed-off" | "archived" | "support-only";

/**
 * 交付记录（Handoff Record）
 * 记录一次团队责任转移事件
 */
export interface HandoffRecord {
  /** 交付记录ID */
  id: string;
  /** 转出团队ID（完成本阶段、将责任移交出去的团队） */
  fromTeamId: string;
  /** 接收团队ID（接手下一阶段责任的团队） */
  toTeamId: string;
  /** 交付时的阶段说明（如"开发完成，进入运营实施"） */
  note?: string;
  /** 交付操作者 agentId */
  operatorId: string;
  /** 交付时间 */
  handoffAt: number;
  /** 转出团队交付后的新状态 */
  fromTeamNewStatus: ProjectTeamStatus;
  /** 接收团队接手后的新状态 */
  toTeamNewStatus: ProjectTeamStatus;
}

/**
 * 项目-团队关系（ProjectTeamRelation）
 *
 * 同一个项目对每个参与团队有独立的「关系状态」：
 * - 团队 B 开发项目 A → status=active, role=dev
 * - 交付给团队 C 后 → B: status=support-only, role=support；C: status=active, role=ops
 * - 团队 B 的视图中项目 A 显示为「已交付」
 * - 团队 C 发现问题反馈给 B → B 保留 support-only 通道处理技术问题
 */
export interface ProjectTeamRelation {
  /** 关系唯一ID */
  id: string;
  /** 项目ID（对应 GroupInfo.projectId 或独立项目 ID） */
  projectId: string;
  /** 团队ID（对应 Organization.id where type=team） */
  teamId: string;
  /** 该团队在项目中的职能角色 */
  role: ProjectTeamRole;
  /** 该团队当前对该项目的参与状态 */
  status: ProjectTeamStatus;
  /** 该团队加入项目时间 */
  joinedAt: number;
  /** 该团队被分配此项目的操作者 */
  assignedBy: string;
  /** 最近一次状态变更时间 */
  updatedAt?: number;
  /** 最近一次状态变更操作者 */
  updatedBy?: string;
  /** 交付历史记录（按时间正序） */
  handoffHistory: HandoffRecord[];
  /** 备注：当前阶段描述 */
  note?: string;
}

/**
 * 智能助手入职信息（P0.3）
 */
export interface AgentOnboardingInfo {
  agentId: string;
  organizationId: string;
  onboardingTasks: Array<{
    taskId: string;
    description: string;
    status: "pending" | "in-progress" | "completed";
    completedAt?: number;
  }>;
  knowledgeBasesAccessed: string[]; // 已访问的知识库
  connectionsMade: string[]; // 已建立联系的成员
  startedAt: number;
  completedAt?: number;
}
