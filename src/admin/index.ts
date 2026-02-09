/**
 * Phase 7: 人类超级管理员与审批系统
 *
 * 模块导出
 */

// ========== 类型定义 ==========
export * from "./types.js";

// ========== 核心系统实例 ==========
export { superAdminManager } from "./super-admin-manager.js";
export { advancedApprovalSystem } from "./advanced-approval.js";
export { notificationManager } from "./notification-manager.js";

// ========== Phase 7 集成器 ==========
export { phase7Integration, initializePhase7, phase7HealthCheck } from "./phase7-integration.js";
