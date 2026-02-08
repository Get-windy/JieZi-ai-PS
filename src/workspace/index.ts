/**
 * Phase 5: 工作空间与文档系统
 *
 * 统一导出所有工作空间、群组、文档、知识沉淀相关模块
 */

// === 类型定义 ===
export type {
  SessionType,
  BootstrapFile,
  WorkspaceBootstrapFile,
  GroupBootstrapFile,
  FileAccessPermissions,
  WorkspaceAccessControl,
  GroupWorkspace,
  GroupMemberPermissions,
  KnowledgeCategory,
  KnowledgeSedimentationConfig,
  KnowledgeSedimentationResult,
  Message,
  GroupWorkspaceConfig,
  WorkspaceType,
  WorkspaceResolution,
  FileAccessCheckResult,
  WorkspaceStats,
} from "./types.js";

// === 群组工作空间管理 ===
export { groupWorkspaceManager } from "./group-workspace.js";
export type { GroupWorkspaceManager } from "./group-workspace.js";

// === 工作空间访问控制 ===
export { workspaceAccessControl } from "./workspace-access-control.js";
export type { WorkspaceAccessControlManager } from "./workspace-access-control.js";

// === Bootstrap 加载器 ===
export { bootstrapLoader } from "./bootstrap-loader.js";
export type { BootstrapLoader } from "./bootstrap-loader.js";

// === 知识沉淀系统 ===
export { knowledgeSedimentation } from "./knowledge-sedimentation.js";
export type { KnowledgeSedimentationSystem } from "./knowledge-sedimentation.js";

// === 安全文件工具 ===
export { fileToolsSecure } from "./file-tools-secure.js";
export type {
  FileToolsSecureInterceptor,
  FileOperationResult,
  FileAccessLog,
} from "./file-tools-secure.js";

// === Phase 5 集成器 ===
export { phase5Integration, initializePhase5, phase5HealthCheck } from "./phase5-integration.js";

export type { Phase5Integration, Phase5IntegrationConfig } from "./phase5-integration.js";
