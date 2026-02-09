/**
 * Phase 6: 生命周期与培训系统 - 集成器
 *
 * 职责：
 * 1. 初始化所有 Phase 6 模块
 * 2. 协调各模块之间的交互
 * 3. 提供统一的对外接口
 * 4. 管理配置和生命周期
 */

import type {
  LifecycleConfig,
  AgentLifecycleState,
  TrainingCourse,
  TrainingProgress,
  SkillDefinition,
  AgentSkill,
  TrainingStatistics,
} from "./types.js";
import { lifecycleManager } from "./lifecycle-manager.js";
import { skillManagement } from "./skill-management.js";
import { trainingSystem } from "./training-system.js";

/**
 * Phase 6 集成配置
 */
export interface Phase6IntegrationConfig {
  /**
   * 生命周期配置
   */
  lifecycle?: LifecycleConfig;

  /**
   * 是否启用自动晋升
   */
  enableAutoPromotion?: boolean;

  /**
   * 是否启用强制培训
   */
  enableMandatoryTraining?: boolean;
}

/**
 * Phase 6 集成器（单例）
 */
export class Phase6Integration {
  private static instance: Phase6Integration;
  private initialized: boolean = false;
  private config?: Phase6IntegrationConfig;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): Phase6Integration {
    if (!Phase6Integration.instance) {
      Phase6Integration.instance = new Phase6Integration();
    }
    return Phase6Integration.instance;
  }

  /**
   * 初始化 Phase 6
   */
  public async initialize(config?: Phase6IntegrationConfig): Promise<void> {
    if (this.initialized) {
      console.warn("Phase 6 已经初始化");
      return;
    }

    console.log("开始初始化 Phase 6: 生命周期与培训系统...");

    this.config = config;

    // 1. 配置生命周期管理器
    if (config?.lifecycle) {
      lifecycleManager.setConfig(config.lifecycle);
    }

    this.initialized = true;
    console.log("Phase 6 初始化完成");
  }

  /**
   * 检查是否已初始化
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取配置
   */
  public getConfig(): Phase6IntegrationConfig | undefined {
    return this.config;
  }

  // ========== 生命周期管理 ==========

  /**
   * 创建智能助手
   */
  public createAgent(params: { agentId: string; createdBy: string }): AgentLifecycleState {
    this.ensureInitialized();
    return lifecycleManager.initializeAgent(params);
  }

  /**
   * 入职智能助手
   */
  public onboardAgent(params: { agentId: string; triggeredBy?: string }): AgentLifecycleState {
    this.ensureInitialized();
    return lifecycleManager.transitionStage({
      agentId: params.agentId,
      toStage: "onboarding",
      triggeredBy: params.triggeredBy,
    });
  }

  /**
   * 开始培训
   */
  public startTraining(params: { agentId: string; triggeredBy?: string }): AgentLifecycleState {
    this.ensureInitialized();
    return lifecycleManager.transitionStage({
      agentId: params.agentId,
      toStage: "training",
      triggeredBy: params.triggeredBy,
    });
  }

  /**
   * 激活智能助手
   */
  public activateAgent(params: { agentId: string; triggeredBy?: string }): AgentLifecycleState {
    this.ensureInitialized();
    return lifecycleManager.activate(params);
  }

  /**
   * 获取智能助手状态
   */
  public getAgentState(agentId: string): AgentLifecycleState | null {
    this.ensureInitialized();
    return lifecycleManager.getLifecycleState(agentId);
  }

  // ========== 培训管理 ==========

  /**
   * 创建培训课程
   */
  public createCourse(params: Omit<TrainingCourse, "createdAt" | "updatedAt">): TrainingCourse {
    this.ensureInitialized();
    return trainingSystem.createCourse(params);
  }

  /**
   * 为智能助手分配课程
   */
  public assignCourse(params: { agentId: string; courseId: string }): TrainingProgress {
    this.ensureInitialized();
    return trainingSystem.startCourse(params);
  }

  /**
   * 获取培训进度
   */
  public getTrainingProgress(agentId: string, courseId: string): TrainingProgress | null {
    this.ensureInitialized();
    return trainingSystem.getProgress(agentId, courseId);
  }

  /**
   * 完成课程
   */
  public completeCourse(params: {
    agentId: string;
    courseId: string;
    assessmentScore?: number;
  }): TrainingProgress {
    this.ensureInitialized();
    return trainingSystem.completeCourse(params);
  }

  /**
   * 获取培训统计
   */
  public getTrainingStats(agentId: string): TrainingStatistics {
    this.ensureInitialized();
    return trainingSystem.getTrainingStatistics(agentId);
  }

  // ========== 技能管理 ==========

  /**
   * 定义技能
   */
  public defineSkill(params: Omit<SkillDefinition, "createdAt">): SkillDefinition {
    this.ensureInitialized();
    return skillManagement.defineSkill(params);
  }

  /**
   * 为智能助手添加技能
   */
  public addSkillToAgent(params: {
    agentId: string;
    skillId: string;
    initialLevel?: AgentSkill["currentLevel"];
    acquiredFrom?: string;
  }): AgentSkill {
    this.ensureInitialized();
    return skillManagement.addSkillToAgent(params);
  }

  /**
   * 升级技能
   */
  public upgradeSkill(params: {
    agentId: string;
    skillId: string;
    newLevel: AgentSkill["currentLevel"];
  }): AgentSkill {
    this.ensureInitialized();
    return skillManagement.upgradeSkillLevel(params);
  }

  /**
   * 认证技能
   */
  public certifySkill(params: {
    agentId: string;
    skillId: string;
    expiryDuration?: number;
  }): AgentSkill {
    this.ensureInitialized();
    return skillManagement.certifySkill(params);
  }

  /**
   * 获取智能助手技能
   */
  public getAgentSkills(agentId: string): AgentSkill[] {
    this.ensureInitialized();
    return skillManagement.getAgentSkills(agentId);
  }

  /**
   * 技能差距分析
   */
  public analyzeSkillGap(params: { agentId: string; targetSkills: string[] }) {
    this.ensureInitialized();
    return skillManagement.analyzeSkillGap(params);
  }

  // ========== 综合功能 ==========

  /**
   * 完整的入职流程
   */
  public async onboardingWorkflow(params: {
    agentId: string;
    mandatoryCourses: string[];
    initialSkills?: Array<{
      skillId: string;
      level: AgentSkill["currentLevel"];
    }>;
    triggeredBy: string;
  }): Promise<{
    lifecycleState: AgentLifecycleState;
    trainingProgresses: TrainingProgress[];
    skills: AgentSkill[];
  }> {
    this.ensureInitialized();

    const { agentId, mandatoryCourses, initialSkills = [], triggeredBy } = params;

    // 1. 转换到入职阶段
    const lifecycleState = this.onboardAgent({ agentId, triggeredBy });

    // 2. 分配必修课程
    const trainingProgresses: TrainingProgress[] = [];
    for (const courseId of mandatoryCourses) {
      const progress = trainingSystem.startCourse({ agentId, courseId });
      trainingProgresses.push(progress);
    }

    // 3. 添加初始技能
    const skills: AgentSkill[] = [];
    for (const { skillId, level } of initialSkills) {
      const skill = skillManagement.addSkillToAgent({
        agentId,
        skillId,
        initialLevel: level,
        acquiredFrom: "onboarding",
      });
      skills.push(skill);
    }

    return {
      lifecycleState,
      trainingProgresses,
      skills,
    };
  }

  /**
   * 完整的晋升流程
   */
  public async promotionWorkflow(params: {
    agentId: string;
    newRole: string;
    requiredSkills: string[];
    triggeredBy: string;
  }): Promise<{
    promoted: boolean;
    missingRequirements: string[];
    lifecycleState?: AgentLifecycleState;
  }> {
    this.ensureInitialized();

    const { agentId, requiredSkills, triggeredBy } = params;

    // 检查技能要求
    const currentSkills = skillManagement.getAgentSkills(agentId);
    const currentSkillIds = new Set(currentSkills.map((s: AgentSkill) => s.skillId));

    const missingSkills = requiredSkills.filter((skillId) => !currentSkillIds.has(skillId));

    if (missingSkills.length > 0) {
      return {
        promoted: false,
        missingRequirements: missingSkills,
      };
    }

    // 记录晋升事件
    const lifecycleState = lifecycleManager.recordEvent({
      agentId,
      eventType: "promoted",
      triggeredBy,
      metadata: {
        role: params.newRole,
      },
    });

    return {
      promoted: true,
      missingRequirements: [],
      lifecycleState: lifecycleManager.getLifecycleState(agentId)!,
    };
  }

  /**
   * 健康检查
   */
  public healthCheck(): {
    healthy: boolean;
    components: {
      lifecycleManager: boolean;
      trainingSystem: boolean;
      skillManagement: boolean;
    };
  } {
    return {
      healthy: this.initialized,
      components: {
        lifecycleManager: true,
        trainingSystem: true,
        skillManagement: true,
      },
    };
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("Phase 6 未初始化，请先调用 initialize()");
    }
  }

  /**
   * 关闭并清理资源
   */
  public shutdown(): void {
    if (!this.initialized) {
      return;
    }

    console.log("关闭 Phase 6...");

    // 清理数据（如果需要持久化，应该在这里保存）
    lifecycleManager.clearAll();
    trainingSystem.clearAll();
    skillManagement.clearAll();

    this.initialized = false;
    console.log("Phase 6 已关闭");
  }
}

/**
 * 导出单例实例
 */
export const phase6Integration = Phase6Integration.getInstance();

/**
 * 便捷初始化函数
 */
export async function initializePhase6(config?: Phase6IntegrationConfig): Promise<void> {
  return phase6Integration.initialize(config);
}

/**
 * 便捷健康检查函数
 */
export function phase6HealthCheck() {
  return phase6Integration.healthCheck();
}
