/**
 * Phase 6: 技能管理系统
 *
 * 职责：
 * 1. 定义和管理技能
 * 2. 跟踪智能助手技能
 * 3. 技能评估和认证
 * 4. 技能等级晋升
 */

import type {
  SkillDefinition,
  AgentSkill,
  SkillCategory,
  SkillLevel,
  AssessmentResult,
  AssessmentType,
} from "./types.js";
import { lifecycleManager } from "./lifecycle-manager.js";
import { trainingSystem } from "./training-system.js";

/**
 * 技能管理系统（单例）
 */
export class SkillManagementSystem {
  private static instance: SkillManagementSystem;
  private skillDefinitions: Map<string, SkillDefinition> = new Map();
  private agentSkills: Map<string, AgentSkill[]> = new Map(); // key: agentId
  private assessments: Map<string, AssessmentResult> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): SkillManagementSystem {
    if (!SkillManagementSystem.instance) {
      SkillManagementSystem.instance = new SkillManagementSystem();
    }
    return SkillManagementSystem.instance;
  }

  // ========== 技能定义管理 ==========

  /**
   * 创建技能定义
   */
  public defineSkill(params: Omit<SkillDefinition, "createdAt">): SkillDefinition {
    const { id } = params;

    if (this.skillDefinitions.has(id)) {
      throw new Error(`Skill already defined: ${id}`);
    }

    const skillDef: SkillDefinition = {
      ...params,
      createdAt: Date.now(),
    };

    this.skillDefinitions.set(id, skillDef);
    return skillDef;
  }

  /**
   * 获取技能定义
   */
  public getSkillDefinition(skillId: string): SkillDefinition | null {
    return this.skillDefinitions.get(skillId) || null;
  }

  /**
   * 获取所有技能定义
   */
  public getAllSkillDefinitions(): SkillDefinition[] {
    return Array.from(this.skillDefinitions.values());
  }

  /**
   * 按类别获取技能
   */
  public getSkillsByCategory(category: SkillCategory): SkillDefinition[] {
    return Array.from(this.skillDefinitions.values()).filter((s) => s.category === category);
  }

  // ========== 智能助手技能管理 ==========

  /**
   * 为智能助手添加技能
   */
  public addSkillToAgent(params: {
    agentId: string;
    skillId: string;
    initialLevel?: SkillLevel;
    acquiredFrom?: string;
  }): AgentSkill {
    const { agentId, skillId, initialLevel = "novice", acquiredFrom } = params;

    const skillDef = this.skillDefinitions.get(skillId);
    if (!skillDef) {
      throw new Error(`Skill not defined: ${skillId}`);
    }

    const skills = this.agentSkills.get(agentId) || [];

    // 检查是否已有该技能
    const existing = skills.find((s) => s.skillId === skillId);
    if (existing) {
      throw new Error(`Agent already has skill: ${skillId}`);
    }

    const agentSkill: AgentSkill = {
      agentId,
      skillId,
      currentLevel: initialLevel,
      acquiredAt: Date.now(),
      acquiredFrom,
      levelProgress: 0,
      usageCount: 0,
      isCertified: false,
    };

    skills.push(agentSkill);
    this.agentSkills.set(agentId, skills);

    // 记录生命周期事件
    lifecycleManager.recordEvent({
      agentId,
      eventType: "skill_acquired",
      metadata: {
        skillId,
        level: initialLevel,
        from: acquiredFrom,
      },
    });

    return agentSkill;
  }

  /**
   * 获取智能助手的技能
   */
  public getAgentSkill(agentId: string, skillId: string): AgentSkill | null {
    const skills = this.agentSkills.get(agentId) || [];
    return skills.find((s) => s.skillId === skillId) || null;
  }

  /**
   * 获取智能助手的所有技能
   */
  public getAgentSkills(agentId: string): AgentSkill[] {
    return this.agentSkills.get(agentId) || [];
  }

  /**
   * 更新技能使用记录
   */
  public recordSkillUsage(agentId: string, skillId: string): void {
    const skill = this.getAgentSkill(agentId, skillId);
    if (!skill) {
      throw new Error(`Agent does not have skill: ${skillId}`);
    }

    skill.usageCount++;
    skill.lastUsedAt = Date.now();
  }

  /**
   * 升级技能等级
   */
  public upgradeSkillLevel(params: {
    agentId: string;
    skillId: string;
    newLevel: SkillLevel;
  }): AgentSkill {
    const { agentId, skillId, newLevel } = params;

    const skill = this.getAgentSkill(agentId, skillId);
    if (!skill) {
      throw new Error(`Agent does not have skill: ${skillId}`);
    }

    const levelOrder: SkillLevel[] = [
      "novice",
      "beginner",
      "intermediate",
      "advanced",
      "expert",
      "master",
    ];
    const currentIndex = levelOrder.indexOf(skill.currentLevel);
    const newIndex = levelOrder.indexOf(newLevel);

    if (newIndex <= currentIndex) {
      throw new Error(`Cannot downgrade or maintain same skill level`);
    }

    skill.currentLevel = newLevel;
    skill.levelProgress = 0;

    // 记录生命周期事件
    lifecycleManager.recordEvent({
      agentId,
      eventType: "promoted",
      metadata: {
        skillId,
        fromLevel: levelOrder[currentIndex],
        toLevel: newLevel,
      },
    });

    return skill;
  }

  /**
   * 更新技能等级进度
   */
  public updateSkillProgress(agentId: string, skillId: string, progress: number): AgentSkill {
    const skill = this.getAgentSkill(agentId, skillId);
    if (!skill) {
      throw new Error(`Agent does not have skill: ${skillId}`);
    }

    skill.levelProgress = Math.max(0, Math.min(100, progress));

    // 如果进度达到100%，可以考虑自动升级
    if (skill.levelProgress >= 100) {
      const levelOrder: SkillLevel[] = [
        "novice",
        "beginner",
        "intermediate",
        "advanced",
        "expert",
        "master",
      ];
      const currentIndex = levelOrder.indexOf(skill.currentLevel);
      if (currentIndex < levelOrder.length - 1) {
        const nextLevel = levelOrder[currentIndex + 1];
        this.upgradeSkillLevel({ agentId, skillId, newLevel: nextLevel });
      }
    }

    return skill;
  }

  /**
   * 认证技能
   */
  public certifySkill(params: {
    agentId: string;
    skillId: string;
    expiryDuration?: number; // 有效期（天）
  }): AgentSkill {
    const { agentId, skillId, expiryDuration } = params;

    const skill = this.getAgentSkill(agentId, skillId);
    if (!skill) {
      throw new Error(`Agent does not have skill: ${skillId}`);
    }

    skill.isCertified = true;
    skill.certifiedAt = Date.now();

    if (expiryDuration) {
      skill.certificationExpiry = skill.certifiedAt + expiryDuration * 24 * 60 * 60 * 1000;
    }

    // 颁发证书
    trainingSystem.issueCertificate({
      agentId,
      type: "skill-certification",
      skillId,
      expiresAt: skill.certificationExpiry,
    });

    return skill;
  }

  /**
   * 检查技能认证是否过期
   */
  public isSkillCertificationValid(agentId: string, skillId: string): boolean {
    const skill = this.getAgentSkill(agentId, skillId);
    if (!skill || !skill.isCertified) {
      return false;
    }

    if (skill.certificationExpiry && skill.certificationExpiry < Date.now()) {
      return false;
    }

    return true;
  }

  // ========== 技能评估 ==========

  /**
   * 创建技能评估
   */
  public createAssessment(params: {
    agentId: string;
    type: AssessmentType;
    targetSkills: string[];
    assessor?: string;
  }): string {
    const { agentId, type, targetSkills, assessor } = params;

    const assessmentId = `assessment-${agentId}-${Date.now()}`;

    const assessment: AssessmentResult = {
      id: assessmentId,
      agentId,
      type,
      targetSkills,
      assessor,
      overallScore: 0,
      breakdown: new Map(),
      assessedAt: Date.now(),
    };

    this.assessments.set(assessmentId, assessment);
    return assessmentId;
  }

  /**
   * 完成评估
   */
  public completeAssessment(params: {
    assessmentId: string;
    overallScore: number;
    breakdown?: Map<string, number>;
    feedback?: string;
    strengths?: string[];
    weaknesses?: string[];
    recommendations?: string[];
    validUntil?: number;
  }): AssessmentResult {
    const assessment = this.assessments.get(params.assessmentId);
    if (!assessment) {
      throw new Error(`Assessment not found: ${params.assessmentId}`);
    }

    Object.assign(assessment, {
      overallScore: params.overallScore,
      breakdown: params.breakdown,
      feedback: params.feedback,
      strengths: params.strengths,
      weaknesses: params.weaknesses,
      recommendations: params.recommendations,
      validUntil: params.validUntil,
    });

    // 更新技能的最后评估信息
    if (assessment.targetSkills) {
      for (const skillId of assessment.targetSkills) {
        const skill = this.getAgentSkill(assessment.agentId, skillId);
        if (skill) {
          skill.lastAssessedAt = Date.now();
          skill.assessmentScore = params.breakdown?.get(skillId) || params.overallScore;
        }
      }
    }

    return assessment;
  }

  /**
   * 获取评估结果
   */
  public getAssessment(assessmentId: string): AssessmentResult | null {
    return this.assessments.get(assessmentId) || null;
  }

  /**
   * 获取智能助手的所有评估
   */
  public getAgentAssessments(agentId: string): AssessmentResult[] {
    return Array.from(this.assessments.values()).filter((a) => a.agentId === agentId);
  }

  /**
   * 获取最新评估
   */
  public getLatestAssessment(agentId: string, type?: AssessmentType): AssessmentResult | null {
    let assessments = this.getAgentAssessments(agentId);

    if (type) {
      assessments = assessments.filter((a) => a.type === type);
    }

    if (assessments.length === 0) {
      return null;
    }

    assessments.sort((a, b) => b.assessedAt - a.assessedAt);
    return assessments[0];
  }

  // ========== 技能分析 ==========

  /**
   * 获取技能差距分析
   */
  public analyzeSkillGap(params: {
    agentId: string;
    targetRole?: string;
    targetSkills?: string[];
  }): {
    missingSkills: string[];
    needsUpgrade: Array<{ skillId: string; currentLevel: SkillLevel; targetLevel: SkillLevel }>;
    recommendations: string[];
  } {
    const { agentId, targetSkills = [] } = params;

    const currentSkills = this.getAgentSkills(agentId);
    const currentSkillIds = new Set(currentSkills.map((s) => s.skillId));

    const missingSkills = targetSkills.filter((skillId) => !currentSkillIds.has(skillId));

    const needsUpgrade: Array<{
      skillId: string;
      currentLevel: SkillLevel;
      targetLevel: SkillLevel;
    }> = [];
    const recommendations: string[] = [];

    for (const skillId of targetSkills) {
      const skill = currentSkills.find((s) => s.skillId === skillId);
      if (skill) {
        const skillDef = this.skillDefinitions.get(skillId);
        if (skillDef && skill.currentLevel !== "master") {
          const levelOrder: SkillLevel[] = [
            "novice",
            "beginner",
            "intermediate",
            "advanced",
            "expert",
            "master",
          ];
          const currentIndex = levelOrder.indexOf(skill.currentLevel);
          if (currentIndex < levelOrder.length - 1) {
            needsUpgrade.push({
              skillId,
              currentLevel: skill.currentLevel,
              targetLevel: levelOrder[currentIndex + 1],
            });
          }
        }
      }
    }

    if (missingSkills.length > 0) {
      recommendations.push(`需要获得 ${missingSkills.length} 个新技能`);
    }

    if (needsUpgrade.length > 0) {
      recommendations.push(`有 ${needsUpgrade.length} 个技能需要升级`);
    }

    return {
      missingSkills,
      needsUpgrade,
      recommendations,
    };
  }

  /**
   * 推荐培训课程
   */
  public recommendCourses(agentId: string, skillId: string): string[] {
    const skillDef = this.skillDefinitions.get(skillId);
    if (!skillDef) {
      return [];
    }

    return skillDef.relatedCourses || [];
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    this.skillDefinitions.clear();
    this.agentSkills.clear();
    this.assessments.clear();
  }
}

/**
 * 导出单例实例
 */
export const skillManagement = SkillManagementSystem.getInstance();
