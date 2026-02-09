/**
 * 师徒系统
 *
 * 功能：
 * - 师徒关系管理（创建、更新、终止）
 * - 培训计划管理
 * - 进度跟踪与评估
 * - 技能传承记录
 * - 师徒匹配建议
 */

import type { MentorshipRelation } from "./types.js";
import { collaborationSystem } from "./collaboration-system.js";
import { organizationSystem } from "./organization-system.js";

/**
 * 师徒关系统计信息
 */
export interface MentorshipStats {
  mentorId: string;
  totalMentees: number;
  activeMentees: number;
  completedMentees: number;
  averageProgressRate: number;
  totalGoalsSet: number;
  totalGoalsCompleted: number;
  totalSkillsTaught: number;
}

/**
 * 徒弟统计信息
 */
export interface MenteeStats {
  menteeId: string;
  totalMentors: number;
  activeMentors: number;
  completedMentorships: number;
  totalGoalsCompleted: number;
  totalSkillsAcquired: number;
  averageProgressRate: number;
}

/**
 * 培训进度报告
 */
export interface TrainingProgressReport {
  relationId: string;
  mentorId: string;
  menteeId: string;
  status: "active" | "completed" | "cancelled";
  progress: {
    goalsProgress: {
      total: number;
      completed: number;
      rate: number;
    };
    skillsProgress: {
      total: number;
      acquired: number;
      rate: number;
    };
    overallProgress: number;
  };
  duration?: {
    planned?: number;
    actual: number;
  };
  lastUpdated: number;
}

/**
 * 师徒系统类
 */
export class MentorSystem {
  private mentorships: Map<string, MentorshipRelation> = new Map();

  // 索引：按师父和徒弟快速查询
  private mentorshipsByMentor: Map<string, Set<string>> = new Map();
  private mentorshipsByMentee: Map<string, Set<string>> = new Map();

  /**
   * 创建师徒关系
   */
  async createMentorship(params: {
    id: string;
    mentorId: string;
    menteeId: string;
    trainingPlan?: {
      goals: string[];
      skills: string[];
      duration?: number;
    };
    createdBy: string;
  }): Promise<MentorshipRelation> {
    const { id, mentorId, menteeId, trainingPlan, createdBy } = params;

    // 检查ID是否已存在
    if (this.mentorships.has(id)) {
      throw new Error(`Mentorship relation with ID "${id}" already exists`);
    }

    // 不能与自己建立师徒关系
    if (mentorId === menteeId) {
      throw new Error("Cannot create mentorship relation with self");
    }

    // 检查是否已存在活跃的师徒关系
    const existingRelation = await this.getActiveMentorshipBetween(mentorId, menteeId);
    if (existingRelation) {
      throw new Error(
        `Active mentorship relation already exists between "${mentorId}" and "${menteeId}"`,
      );
    }

    const mentorship: MentorshipRelation = {
      id,
      mentorId,
      menteeId,
      trainingPlan,
      progress: trainingPlan
        ? {
            completedGoals: [],
            acquiredSkills: [],
            progressRate: 0,
            lastUpdated: Date.now(),
          }
        : undefined,
      status: "active",
      startDate: Date.now(),
      createdAt: Date.now(),
      createdBy,
    };

    this.mentorships.set(id, mentorship);
    this.addToMentorIndex(mentorId, id);
    this.addToMenteeIndex(menteeId, id);

    // 同步创建协作关系
    await collaborationSystem.createRelation({
      id: `collab_${id}`,
      fromAgentId: mentorId,
      toAgentId: menteeId,
      type: "mentor",
      metadata: { mentorshipId: id },
      createdBy,
    });

    return mentorship;
  }

  /**
   * 获取师徒关系
   */
  async getMentorship(mentorshipId: string): Promise<MentorshipRelation | null> {
    return this.mentorships.get(mentorshipId) || null;
  }

  /**
   * 获取两个助手之间的活跃师徒关系
   */
  async getActiveMentorshipBetween(
    mentorId: string,
    menteeId: string,
  ): Promise<MentorshipRelation | null> {
    const mentorships = await this.getMentorshipsByMentor(mentorId);

    for (const mentorship of mentorships) {
      if (mentorship.menteeId === menteeId && mentorship.status === "active") {
        return mentorship;
      }
    }

    return null;
  }

  /**
   * 更新培训计划
   */
  async updateTrainingPlan(params: {
    mentorshipId: string;
    goals?: string[];
    skills?: string[];
    duration?: number;
    updatedBy: string;
  }): Promise<MentorshipRelation> {
    const { mentorshipId, goals, skills, duration, updatedBy } = params;

    const mentorship = this.mentorships.get(mentorshipId);
    if (!mentorship) {
      throw new Error(`Mentorship relation "${mentorshipId}" not found`);
    }

    if (mentorship.status !== "active") {
      throw new Error(`Cannot update training plan for ${mentorship.status} mentorship`);
    }

    const updatedPlan: { goals: string[]; skills: string[]; duration?: number } = {
      goals: goals !== undefined ? goals : mentorship.trainingPlan?.goals || [],
      skills: skills !== undefined ? skills : mentorship.trainingPlan?.skills || [],
      ...(duration !== undefined && { duration }),
    };

    const updated: MentorshipRelation = {
      ...mentorship,
      trainingPlan: updatedPlan,
    };

    this.mentorships.set(mentorshipId, updated);
    return updated;
  }

  /**
   * 更新培训进度
   */
  async updateProgress(params: {
    mentorshipId: string;
    completedGoals?: string[];
    acquiredSkills?: string[];
    updatedBy: string;
  }): Promise<MentorshipRelation> {
    const { mentorshipId, completedGoals, acquiredSkills, updatedBy } = params;

    const mentorship = this.mentorships.get(mentorshipId);
    if (!mentorship) {
      throw new Error(`Mentorship relation "${mentorshipId}" not found`);
    }

    if (mentorship.status !== "active") {
      throw new Error(`Cannot update progress for ${mentorship.status} mentorship`);
    }

    const currentProgress = mentorship.progress || {
      completedGoals: [],
      acquiredSkills: [],
      progressRate: 0,
      lastUpdated: Date.now(),
    };

    // 合并已完成目标和技能
    const newCompletedGoals = completedGoals
      ? Array.from(new Set([...currentProgress.completedGoals, ...completedGoals]))
      : currentProgress.completedGoals;

    const newAcquiredSkills = acquiredSkills
      ? Array.from(new Set([...currentProgress.acquiredSkills, ...acquiredSkills]))
      : currentProgress.acquiredSkills;

    // 计算进度率
    const progressRate = this.calculateProgressRate(
      mentorship,
      newCompletedGoals,
      newAcquiredSkills,
    );

    const updatedProgress = {
      completedGoals: newCompletedGoals,
      acquiredSkills: newAcquiredSkills,
      progressRate,
      lastUpdated: Date.now(),
    };

    const updated: MentorshipRelation = {
      ...mentorship,
      progress: updatedProgress,
    };

    // 如果进度达到100%，自动完成
    if (progressRate >= 100) {
      updated.status = "completed";
    }

    this.mentorships.set(mentorshipId, updated);
    return updated;
  }

  /**
   * 计算进度率
   */
  private calculateProgressRate(
    mentorship: MentorshipRelation,
    completedGoals: string[],
    acquiredSkills: string[],
  ): number {
    const plan = mentorship.trainingPlan;
    if (!plan) return 0;

    const totalGoals = plan.goals?.length || 0;
    const totalSkills = plan.skills?.length || 0;
    const totalItems = totalGoals + totalSkills;

    if (totalItems === 0) return 0;

    const completedItems = completedGoals.length + acquiredSkills.length;
    return Math.min(100, Math.round((completedItems / totalItems) * 100));
  }

  /**
   * 完成师徒关系
   */
  async completeMentorship(params: {
    mentorshipId: string;
    updatedBy: string;
  }): Promise<MentorshipRelation> {
    const { mentorshipId, updatedBy } = params;

    const mentorship = this.mentorships.get(mentorshipId);
    if (!mentorship) {
      throw new Error(`Mentorship relation "${mentorshipId}" not found`);
    }

    if (mentorship.status !== "active") {
      throw new Error(`Mentorship is already ${mentorship.status}`);
    }

    const updated: MentorshipRelation = {
      ...mentorship,
      status: "completed",
      endDate: Date.now(),
    };

    this.mentorships.set(mentorshipId, updated);
    return updated;
  }

  /**
   * 取消师徒关系
   */
  async cancelMentorship(params: {
    mentorshipId: string;
    reason?: string;
    updatedBy: string;
  }): Promise<MentorshipRelation> {
    const { mentorshipId, reason, updatedBy } = params;

    const mentorship = this.mentorships.get(mentorshipId);
    if (!mentorship) {
      throw new Error(`Mentorship relation "${mentorshipId}" not found`);
    }

    if (mentorship.status !== "active") {
      throw new Error(`Mentorship is already ${mentorship.status}`);
    }

    const updated: MentorshipRelation = {
      ...mentorship,
      status: "cancelled",
      endDate: Date.now(),
    };

    this.mentorships.set(mentorshipId, updated);
    return updated;
  }

  /**
   * 获取师父的所有徒弟关系
   */
  async getMentorshipsByMentor(mentorId: string): Promise<MentorshipRelation[]> {
    const mentorshipIds = this.mentorshipsByMentor.get(mentorId);
    if (!mentorshipIds) return [];

    return Array.from(mentorshipIds)
      .map((id) => this.mentorships.get(id))
      .filter((m): m is MentorshipRelation => m !== undefined);
  }

  /**
   * 获取徒弟的所有师父关系
   */
  async getMentorshipsByMentee(menteeId: string): Promise<MentorshipRelation[]> {
    const mentorshipIds = this.mentorshipsByMentee.get(menteeId);
    if (!mentorshipIds) return [];

    return Array.from(mentorshipIds)
      .map((id) => this.mentorships.get(id))
      .filter((m): m is MentorshipRelation => m !== undefined);
  }

  /**
   * 获取活跃的师徒关系
   */
  async getActiveMentorships(agentId: string): Promise<MentorshipRelation[]> {
    const asMentor = await this.getMentorshipsByMentor(agentId);
    const asMentee = await this.getMentorshipsByMentee(agentId);

    const allMentorships = [...asMentor, ...asMentee];
    return allMentorships.filter((m) => m.status === "active");
  }

  /**
   * 获取师父的统计信息
   */
  async getMentorStats(mentorId: string): Promise<MentorshipStats> {
    const mentorships = await this.getMentorshipsByMentor(mentorId);

    const activeMentees = mentorships.filter((m) => m.status === "active").length;
    const completedMentees = mentorships.filter((m) => m.status === "completed").length;

    let totalProgressRate = 0;
    let totalGoalsSet = 0;
    let totalGoalsCompleted = 0;
    let totalSkillsTaught = 0;

    for (const mentorship of mentorships) {
      if (mentorship.progress) {
        totalProgressRate += mentorship.progress.progressRate;
        totalGoalsCompleted += mentorship.progress.completedGoals.length;
        totalSkillsTaught += mentorship.progress.acquiredSkills.length;
      }
      if (mentorship.trainingPlan) {
        totalGoalsSet += mentorship.trainingPlan.goals?.length || 0;
      }
    }

    const averageProgressRate =
      mentorships.length > 0 ? Math.round(totalProgressRate / mentorships.length) : 0;

    return {
      mentorId,
      totalMentees: mentorships.length,
      activeMentees,
      completedMentees,
      averageProgressRate,
      totalGoalsSet,
      totalGoalsCompleted,
      totalSkillsTaught,
    };
  }

  /**
   * 获取徒弟的统计信息
   */
  async getMenteeStats(menteeId: string): Promise<MenteeStats> {
    const mentorships = await this.getMentorshipsByMentee(menteeId);

    const activeMentors = mentorships.filter((m) => m.status === "active").length;
    const completedMentorships = mentorships.filter((m) => m.status === "completed").length;

    let totalProgressRate = 0;
    let totalGoalsCompleted = 0;
    let totalSkillsAcquired = 0;

    for (const mentorship of mentorships) {
      if (mentorship.progress) {
        totalProgressRate += mentorship.progress.progressRate;
        totalGoalsCompleted += mentorship.progress.completedGoals.length;
        totalSkillsAcquired += mentorship.progress.acquiredSkills.length;
      }
    }

    const averageProgressRate =
      mentorships.length > 0 ? Math.round(totalProgressRate / mentorships.length) : 0;

    return {
      menteeId,
      totalMentors: mentorships.length,
      activeMentors,
      completedMentorships,
      totalGoalsCompleted,
      totalSkillsAcquired,
      averageProgressRate,
    };
  }

  /**
   * 获取培训进度报告
   */
  async getProgressReport(mentorshipId: string): Promise<TrainingProgressReport> {
    const mentorship = this.mentorships.get(mentorshipId);
    if (!mentorship) {
      throw new Error(`Mentorship relation "${mentorshipId}" not found`);
    }

    const plan = mentorship.trainingPlan;
    const progress = mentorship.progress;

    const totalGoals = plan?.goals?.length || 0;
    const completedGoals = progress?.completedGoals.length || 0;
    const goalsRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

    const totalSkills = plan?.skills?.length || 0;
    const acquiredSkills = progress?.acquiredSkills.length || 0;
    const skillsRate = totalSkills > 0 ? Math.round((acquiredSkills / totalSkills) * 100) : 0;

    const overallProgress = progress?.progressRate || 0;

    const actualDuration = mentorship.endDate
      ? mentorship.endDate - mentorship.startDate
      : Date.now() - mentorship.startDate;

    return {
      relationId: mentorshipId,
      mentorId: mentorship.mentorId,
      menteeId: mentorship.menteeId,
      status: mentorship.status,
      progress: {
        goalsProgress: {
          total: totalGoals,
          completed: completedGoals,
          rate: goalsRate,
        },
        skillsProgress: {
          total: totalSkills,
          acquired: acquiredSkills,
          rate: skillsRate,
        },
        overallProgress,
      },
      duration: {
        planned: plan?.duration,
        actual: actualDuration,
      },
      lastUpdated: progress?.lastUpdated || mentorship.createdAt,
    };
  }

  /**
   * 获取所有师徒关系
   */
  async getAllMentorships(): Promise<MentorshipRelation[]> {
    return Array.from(this.mentorships.values());
  }

  /**
   * 推荐师父（基于技能匹配）
   */
  async suggestMentors(params: {
    menteeId: string;
    requiredSkills: string[];
    organizationId?: string;
  }): Promise<Array<{ mentorId: string; matchScore: number; matchedSkills: string[] }>> {
    const { menteeId, requiredSkills, organizationId } = params;

    // 获取组织内的所有成员
    let potentialMentors: string[] = [];
    if (organizationId) {
      const org = await organizationSystem.getOrganization(organizationId);
      if (org) {
        potentialMentors = org.memberIds.filter((id: string) => id !== menteeId);
      }
    }

    const suggestions: Array<{ mentorId: string; matchScore: number; matchedSkills: string[] }> =
      [];

    // 遍历潜在师父，计算匹配度
    for (const mentorId of potentialMentors) {
      const mentorships = await this.getMentorshipsByMentor(mentorId);

      // 收集该师父教过的所有技能
      const taughtSkills = new Set<string>();
      for (const mentorship of mentorships) {
        if (mentorship.progress) {
          mentorship.progress.acquiredSkills.forEach((skill: string) => taughtSkills.add(skill));
        }
      }

      // 计算匹配的技能
      const matchedSkills = requiredSkills.filter((skill) => taughtSkills.has(skill));

      if (matchedSkills.length > 0) {
        const matchScore = Math.round((matchedSkills.length / requiredSkills.length) * 100);
        suggestions.push({ mentorId, matchScore, matchedSkills });
      }
    }

    // 按匹配度排序
    return suggestions.sort((a, b) => b.matchScore - a.matchScore);
  }

  // === 私有方法：索引管理 ===

  private addToMentorIndex(mentorId: string, mentorshipId: string): void {
    if (!this.mentorshipsByMentor.has(mentorId)) {
      this.mentorshipsByMentor.set(mentorId, new Set());
    }
    this.mentorshipsByMentor.get(mentorId)!.add(mentorshipId);
  }

  private addToMenteeIndex(menteeId: string, mentorshipId: string): void {
    if (!this.mentorshipsByMentee.has(menteeId)) {
      this.mentorshipsByMentee.set(menteeId, new Set());
    }
    this.mentorshipsByMentee.get(menteeId)!.add(mentorshipId);
  }
}

// 导出单例实例
export const mentorSystem = new MentorSystem();
