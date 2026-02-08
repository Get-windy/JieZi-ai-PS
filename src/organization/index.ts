/**
 * Phase 4: 组织架构与协作体系
 *
 * 统一导出所有组织、团队、协作相关模块
 */

// === 类型定义 ===
export type {
  Organization,
  OrganizationLevel,
  Team,
  TeamType,
  CollaborationRelation,
  CollaborationRelationType,
  MentorshipRelation,
  TaskAssignment,
  OrganizationConfig,
  CollaborationConfig,
} from "./types.js";

// === 核心系统 ===
export { organizationSystem, OrganizationSystem } from "./organization-system.js";

export { organizationHierarchy, OrganizationHierarchy } from "./organization-hierarchy.js";

export type { OrganizationTreeNode, OrganizationStatistics } from "./organization-hierarchy.js";

// === 团队管理 ===
export { teamManagement, TeamManagement } from "./team-management.js";

export type { TeamStatistics } from "./team-management.js";

// === 协作系统 ===
export { collaborationSystem, CollaborationSystem } from "./collaboration-system.js";

export type { CollaborationNetworkStats, CollaborationPath } from "./collaboration-system.js";

// === 师徒系统 ===
export { mentorSystem, MentorSystem } from "./mentor-system.js";

export type { MentorshipStats, MenteeStats, TrainingProgressReport } from "./mentor-system.js";

// === 集成接口 ===
export {
  initializeFromConfig,
  OrganizationRpcMethods,
  OrganizationAPI,
  OrganizationCLI,
} from "./organization-integration.js";

export type { OrganizationConfig as OrganizationIntegrationConfig } from "./organization-integration.js";
