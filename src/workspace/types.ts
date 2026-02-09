/**
 * Phase 5: 工作空间与文档系统 - 核心类型定义
 *
 * 定义智能助手工作空间、群组工作空间、访问控制等核心数据结构
 */

/**
 * 会话类型（用于判断工作空间上下文）
 */
export type SessionType = "dm" | "main" | "group" | "channel";

/**
 * Bootstrap 文件类型
 */
export interface BootstrapFile {
  path: string; // 文件路径
  content: string; // 文件内容
  readonly?: boolean; // 是否只读（群组中的个人知识文件）
  priority?: number; // 加载优先级（数字越小越先加载）
}

/**
 * 工作空间 Bootstrap 文件（智能助手工作空间）
 */
export interface WorkspaceBootstrapFile extends BootstrapFile {
  type: "agents" | "soul" | "tools" | "identity" | "user" | "memory" | "skill" | "custom";
}

/**
 * 群组 Bootstrap 文件（群组工作空间）
 */
export interface GroupBootstrapFile extends BootstrapFile {
  type: "group-info" | "members" | "shared-memory" | "rules" | "custom";
}

/**
 * 文件访问权限
 */
export interface FileAccessPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

/**
 * 工作空间访问控制配置
 */
export interface WorkspaceAccessControl {
  // 允许访问的路径（白名单）
  allowedPaths: string[];

  // 禁止访问的路径（黑名单）
  blockedPaths: string[];

  // 默认权限
  defaultPermissions: FileAccessPermissions;
}

/**
 * 群组工作空间结构
 */
export interface GroupWorkspace {
  // 群组基本信息
  groupId: string;
  groupName: string;

  // 目录路径
  dir: string; // 根目录
  groupInfoPath: string; // GROUP_INFO.md
  membersPath: string; // MEMBERS.md
  sharedMemoryPath: string; // SHARED_MEMORY.md
  rulesPath: string; // RULES.md
  sharedDir: string; // shared/
  historyDir: string; // history/
  meetingNotesDir: string; // meeting-notes/
  decisionsDir: string; // decisions/

  // 成员列表
  members: string[]; // agentId 列表

  // 管理员列表
  admins?: string[]; // agentId 列表

  // 创建信息
  createdAt: number;
  createdBy: string; // agentId

  // 更新信息
  updatedAt?: number;
  updatedBy?: string;
}

/**
 * 群组成员权限
 */
export interface GroupMemberPermissions extends FileAccessPermissions {
  // 是否为管理员
  isAdmin: boolean;

  // 是否可以邀请成员
  canInvite?: boolean;

  // 是否可以踢出成员
  canKick?: boolean;
}

/**
 * 知识沉淀类别
 */
export type KnowledgeCategory = "decision" | "meeting-notes" | "shared-doc" | "adr";

/**
 * 知识沉淀配置
 */
export interface KnowledgeSedimentationConfig {
  // 是否启用自动知识沉淀
  enabled: boolean;

  // 沉淀触发条件
  triggers: {
    // 重要关键词（包含这些词的讨论自动保存）
    keywords?: string[];

    // 最小消息数（讨论达到多少条消息后考虑沉淀）
    minMessages?: number;

    // 参与人数阈值（至少多少人参与讨论）
    minParticipants?: number;
  };

  // 自动分类规则
  autoClassification?: {
    // 决策关键词
    decisionKeywords?: string[];

    // 会议纪要关键词
    meetingKeywords?: string[];

    // ADR（架构决策记录）关键词
    adrKeywords?: string[];
  };
}

/**
 * 知识沉淀结果
 */
export interface KnowledgeSedimentationResult {
  // 文档路径
  documentPath: string;

  // 类别
  category: KnowledgeCategory;

  // 标题
  title: string;

  // 参与者
  participants: string[]; // agentId 列表

  // 消息数量
  messageCount: number;

  // 创建时间
  createdAt: number;
}

/**
 * 消息结构（用于知识沉淀）
 */
export interface Message {
  id: string;
  senderId: string; // agentId
  content: string;
  timestamp: number;
  metadata?: {
    importance?: "low" | "medium" | "high";
    keywords?: string[];
  };
}

/**
 * 群组工作空间配置
 */
export interface GroupWorkspaceConfig {
  // 群组工作空间根目录
  root?: string; // 默认：~/.openclaw/groups/

  // 是否启用群组持久化工作空间
  enabled?: boolean; // 默认：true

  // 自动归档配置
  archival?: {
    // 是否启用自动归档
    enabled: boolean;

    // 归档间隔（天）
    intervalDays: number; // 默认：30

    // 归档路径
    archivePath?: string; // 默认：{root}/archive/
  };

  // 权限配置
  permissions?: {
    // 默认成员权限
    defaultMemberPermissions: FileAccessPermissions;

    // 管理员成员列表（agentId）
    admins?: string[];
  };

  // 知识沉淀配置
  knowledgeSedimentation?: KnowledgeSedimentationConfig;
}

/**
 * 工作空间类型（用于区分不同的工作空间）
 */
export type WorkspaceType = "agent" | "group";

/**
 * 工作空间解析结果
 */
export interface WorkspaceResolution {
  // 工作空间类型
  type: WorkspaceType;

  // 根目录
  rootDir: string;

  // 会话键
  sessionKey: string;

  // 会话类型
  sessionType: SessionType;

  // 智能助手 ID
  agentId: string;

  // 群组 ID（如果是群组工作空间）
  groupId?: string;

  // 访问控制配置
  accessControl: WorkspaceAccessControl;
}

/**
 * 文件访问检查结果
 */
export interface FileAccessCheckResult {
  // 是否允许访问
  allowed: boolean;

  // 原因（如果被拒绝）
  reason?: string;

  // 建议的替代路径（如果有）
  suggestedPath?: string;
}

/**
 * 工作空间统计信息
 */
export interface WorkspaceStats {
  // 文件总数
  totalFiles: number;

  // 总大小（字节）
  totalSize: number;

  // 最后修改时间
  lastModified: number;

  // 成员数（仅群组）
  memberCount?: number;

  // 消息数（仅群组）
  messageCount?: number;
}
