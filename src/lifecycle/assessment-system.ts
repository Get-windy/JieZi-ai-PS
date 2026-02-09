/**
 * Phase 6: 评估系统
 *
 * 职责：
 * 1. 技能评估
 * 2. 绩效评估
 * 3. 360度反馈
 * 4. 自我评估
 * 5. 知识评估
 */

import type { AssessmentResult, AssessmentType, SkillLevel } from "./types.js";
import { lifecycleManager } from "./lifecycle-manager.js";
import { skillManagement } from "./skill-management.js";
import { trainingSystem } from "./training-system.js";

/**
 * 评估系统（单例）
 */
export class AssessmentSystem {
  private static instance: AssessmentSystem;
  private assessments: Map<string, AssessmentResult> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): AssessmentSystem {
    if (!AssessmentSystem.instance) {
      AssessmentSystem.instance = new AssessmentSystem();
    }
    return AssessmentSystem.instance;
  }

  // ========== 评估创建 ==========

  /**
   * 创建技能评估
   */
  public createSkillAssessment(params: {
    agentId: string;
    skillIds: string[];
    assessor?: string;
    scores?: Map<string, number>;
    feedback?: string;
    validDays?: number;
  }): AssessmentResult {
    const { agentId, skillIds, assessor, scores, feedback, validDays } = params;

    const id = `assessment-skill-${agentId}-${Date.now()}`;

    // 计算总分
    let overallScore = 0;
    const breakdown = new Map<string, number>();

    if (scores && scores.size > 0) {
      scores.forEach((score, skillId) => {
        breakdown.set(skillId, score);
      });
      const totalScore = Array.from(scores.values()).reduce((sum, score) => sum + score, 0);
      overallScore = totalScore / scores.size;
    } else {
      // 如果没有提供分数，基于现有技能等级计算
      for (const skillId of skillIds) {
        const agentSkills = skillManagement.getAgentSkills(agentId);
        const agentSkill = agentSkills.find((s) => s.skillId === skillId);

        if (agentSkill) {
          const score = this.levelToScore(agentSkill.currentLevel);
          breakdown.set(skillId, score);
          overallScore += score;
        }
      }
      if (skillIds.length > 0) {
        overallScore /= skillIds.length;
      }
    }

    const assessment: AssessmentResult = {
      id,
      agentId,
      type: "skill",
      targetSkills: skillIds,
      assessor,
      overallScore,
      breakdown,
      feedback,
      assessedAt: Date.now(),
      validUntil: validDays ? Date.now() + validDays * 24 * 60 * 60 * 1000 : undefined,
    };

    this.assessments.set(id, assessment);

    // 记录评估事件
    lifecycleManager.recordEvent({
      agentId,
      eventType: "skill_acquired",
      metadata: {
        assessmentId: id,
        score: overallScore,
        skillCount: skillIds.length,
      },
    });

    return assessment;
  }

  /**
   * 创建绩效评估
   */
  public createPerformanceAssessment(params: {
    agentId: string;
    assessor: string;
    score: number;
    strengths?: string[];
    weaknesses?: string[];
    recommendations?: string[];
    feedback?: string;
    metadata?: Record<string, any>;
    validDays?: number;
  }): AssessmentResult {
    const {
      agentId,
      assessor,
      score,
      strengths,
      weaknesses,
      recommendations,
      feedback,
      metadata,
      validDays,
    } = params;

    const id = `assessment-performance-${agentId}-${Date.now()}`;

    const assessment: AssessmentResult = {
      id,
      agentId,
      type: "performance",
      assessor,
      overallScore: score,
      strengths,
      weaknesses,
      recommendations,
      feedback,
      assessedAt: Date.now(),
      validUntil: validDays ? Date.now() + validDays * 24 * 60 * 60 * 1000 : undefined,
      metadata,
    };

    this.assessments.set(id, assessment);

    return assessment;
  }

  /**
   * 创建360度反馈评估
   */
  public create360FeedbackAssessment(params: {
    agentId: string;
    feedbackData: Array<{
      assessor: string;
      role: "peer" | "supervisor" | "subordinate" | "self";
      scores: Map<string, number>;
      feedback?: string;
    }>;
    validDays?: number;
  }): AssessmentResult {
    const { agentId, feedbackData, validDays } = params;

    const id = `assessment-360-${agentId}-${Date.now()}`;

    // 聚合所有反馈
    const breakdown = new Map<string, number>();
    let overallScore = 0;

    // 按角色类型分组
    const byRole = new Map<string, number[]>();

    for (const feedback of feedbackData) {
      const scores = Array.from(feedback.scores.values());
      const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

      if (!byRole.has(feedback.role)) {
        byRole.set(feedback.role, []);
      }
      byRole.get(feedback.role)!.push(avgScore);

      overallScore += avgScore;
    }

    overallScore /= feedbackData.length;

    // 计算每个角色的平均分
    byRole.forEach((scores, role) => {
      const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      breakdown.set(role, avg);
    });

    const assessment: AssessmentResult = {
      id,
      agentId,
      type: "360-feedback",
      overallScore,
      breakdown,
      assessedAt: Date.now(),
      validUntil: validDays ? Date.now() + validDays * 24 * 60 * 60 * 1000 : undefined,
      metadata: {
        feedbackCount: feedbackData.length,
        byRole: Object.fromEntries(byRole),
      },
    };

    this.assessments.set(id, assessment);

    return assessment;
  }

  /**
   * 创建自我评估
   */
  public createSelfAssessment(params: {
    agentId: string;
    skillIds?: string[];
    selfRatings: Map<string, number>;
    strengths?: string[];
    weaknesses?: string[];
    goals?: string[];
    validDays?: number;
  }): AssessmentResult {
    const { agentId, skillIds, selfRatings, strengths, weaknesses, goals, validDays } = params;

    const id = `assessment-self-${agentId}-${Date.now()}`;

    const scores = Array.from(selfRatings.values());
    const overallScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    const assessment: AssessmentResult = {
      id,
      agentId,
      type: "self-assessment",
      targetSkills: skillIds,
      assessor: agentId,
      overallScore,
      breakdown: selfRatings,
      strengths,
      weaknesses,
      recommendations: goals,
      assessedAt: Date.now(),
      validUntil: validDays ? Date.now() + validDays * 24 * 60 * 60 * 1000 : undefined,
    };

    this.assessments.set(id, assessment);

    return assessment;
  }

  /**
   * 创建知识评估
   */
  public createKnowledgeAssessment(params: {
    agentId: string;
    courseId?: string;
    assessor?: string;
    score: number;
    breakdown?: Map<string, number>;
    feedback?: string;
    validDays?: number;
  }): AssessmentResult {
    const { agentId, courseId, assessor, score, breakdown, feedback, validDays } = params;

    const id = `assessment-knowledge-${agentId}-${Date.now()}`;

    const assessment: AssessmentResult = {
      id,
      agentId,
      type: "knowledge",
      assessor,
      overallScore: score,
      breakdown,
      feedback,
      assessedAt: Date.now(),
      validUntil: validDays ? Date.now() + validDays * 24 * 60 * 60 * 1000 : undefined,
      metadata: courseId ? { courseId } : undefined,
    };

    this.assessments.set(id, assessment);

    return assessment;
  }

  // ========== 评估查询 ==========

  /**
   * 获取评估
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
   * 按类型获取评估
   */
  public getAssessmentsByType(agentId: string, type: AssessmentType): AssessmentResult[] {
    return this.getAgentAssessments(agentId).filter((a) => a.type === type);
  }

  /**
   * 获取有效评估
   */
  public getValidAssessments(agentId: string): AssessmentResult[] {
    const now = Date.now();
    return this.getAgentAssessments(agentId).filter((a) => !a.validUntil || a.validUntil > now);
  }

  /**
   * 获取最近评估
   */
  public getLatestAssessment(agentId: string, type?: AssessmentType): AssessmentResult | null {
    let assessments = this.getAgentAssessments(agentId);

    if (type) {
      assessments = assessments.filter((a) => a.type === type);
    }

    if (assessments.length === 0) return null;

    assessments.sort((a, b) => b.assessedAt - a.assessedAt);
    return assessments[0];
  }

  // ========== 评估分析 ==========

  /**
   * 获取评估趋势
   */
  public getAssessmentTrend(
    agentId: string,
    type?: AssessmentType,
  ): {
    trend: "improving" | "stable" | "declining" | "insufficient-data";
    data: Array<{ date: number; score: number }>;
    averageScore: number;
    latestScore: number;
  } {
    let assessments = this.getAgentAssessments(agentId);

    if (type) {
      assessments = assessments.filter((a) => a.type === type);
    }

    if (assessments.length < 2) {
      return {
        trend: "insufficient-data",
        data: [],
        averageScore: 0,
        latestScore: 0,
      };
    }

    assessments.sort((a, b) => a.assessedAt - b.assessedAt);

    const data = assessments.map((a) => ({
      date: a.assessedAt,
      score: a.overallScore,
    }));

    const totalScore = assessments.reduce((sum, a) => sum + a.overallScore, 0);
    const averageScore = totalScore / assessments.length;
    const latestScore = assessments[assessments.length - 1].overallScore;
    const previousScore = assessments[assessments.length - 2].overallScore;

    let trend: "improving" | "stable" | "declining";
    const scoreDiff = latestScore - previousScore;

    if (scoreDiff > 5) {
      trend = "improving";
    } else if (scoreDiff < -5) {
      trend = "declining";
    } else {
      trend = "stable";
    }

    return {
      trend,
      data,
      averageScore,
      latestScore,
    };
  }

  /**
   * 比较智能助手评估
   */
  public compareAgentAssessments(agentIds: string[]): Array<{
    agentId: string;
    averageScore: number;
    latestScore: number;
    assessmentCount: number;
    rank: number;
  }> {
    const results = agentIds.map((agentId) => {
      const assessments = this.getAgentAssessments(agentId);
      const totalScore = assessments.reduce((sum, a) => sum + a.overallScore, 0);
      const averageScore = assessments.length > 0 ? totalScore / assessments.length : 0;
      const latest = this.getLatestAssessment(agentId);

      return {
        agentId,
        averageScore,
        latestScore: latest?.overallScore || 0,
        assessmentCount: assessments.length,
        rank: 0,
      };
    });

    // 按平均分排名
    results.sort((a, b) => b.averageScore - a.averageScore);
    results.forEach((r, index) => {
      r.rank = index + 1;
    });

    return results;
  }

  /**
   * 获取评估统计
   */
  public getAssessmentStatistics(agentId: string): {
    totalAssessments: number;
    byType: Record<AssessmentType, number>;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    latestAssessment?: AssessmentResult;
    needsReassessment: boolean;
  } {
    const assessments = this.getAgentAssessments(agentId);

    const byType: Record<AssessmentType, number> = {
      skill: 0,
      performance: 0,
      knowledge: 0,
      "360-feedback": 0,
      "self-assessment": 0,
    };

    assessments.forEach((a) => {
      byType[a.type]++;
    });

    const scores = assessments.map((a) => a.overallScore);
    const averageScore =
      scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;

    const latestAssessment = this.getLatestAssessment(agentId);

    // 检查是否需要重新评估（超过90天）
    const needsReassessment =
      !latestAssessment || Date.now() - latestAssessment.assessedAt > 90 * 24 * 60 * 60 * 1000;

    return {
      totalAssessments: assessments.length,
      byType,
      averageScore,
      highestScore,
      lowestScore,
      latestAssessment: latestAssessment || undefined,
      needsReassessment,
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 技能等级转换为分数
   */
  private levelToScore(level: SkillLevel): number {
    const levelScores: Record<SkillLevel, number> = {
      novice: 20,
      beginner: 40,
      intermediate: 60,
      advanced: 80,
      expert: 90,
      master: 100,
    };
    return levelScores[level];
  }

  /**
   * 获取所有评估
   */
  public getAllAssessments(): AssessmentResult[] {
    return Array.from(this.assessments.values());
  }

  /**
   * 删除评估
   */
  public deleteAssessment(assessmentId: string): boolean {
    return this.assessments.delete(assessmentId);
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    this.assessments.clear();
  }
}

/**
 * 导出单例实例
 */
export const assessmentSystem = AssessmentSystem.getInstance();
