/**
 * Phase 6: 生命周期与培训系统
 *
 * 统一导出所有生命周期管理、培训、技能相关模块
 */

// === 类型定义 ===
export * from "./types.js";

// === 核心系统实例 ===
export { lifecycleManager } from "./lifecycle-manager.js";
export { trainingSystem } from "./training-system.js";
export { skillManagement } from "./skill-management.js";
export { assessmentSystem } from "./assessment-system.js";

// === Phase 6 集成器 ===
export { phase6Integration, initializePhase6, phase6HealthCheck } from "./phase6-integration.js";

export type { Phase6IntegrationConfig } from "./phase6-integration.js";
