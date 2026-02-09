/**
 * 师徒关系管理系统
 *
 * 功能：
 * - 建立师徒关系（智能助手之间）
 * - 技能传承和学习
 * - 经验共享
 * - 培训进度跟踪
 */

/**
 * 师徒关系状态
 */
export type MentorshipStatus = "active" | "completed" | "paused" | "cancelled";

/**
 * 技能级别
 */
export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert" | "master";

/**
 * 师徒关系
 */
export interface Mentorship {
  /** 关系ID */
  id: string;

  /** 师傅ID（智能助手ID） */
  mentorId: string;

  /** 徒弟ID（智能助手ID） */
  apprenticeId: string;

  /** 状态 */
  status: MentorshipStatus;

  /** 创建时间 */
  createdAt: number;

  /** 开始时间 */
  startedAt?: number;

  /** 结束时间 */
  completedAt?: number;

  /** 培训目标 */
  goals: Array<{
    id: string;
    skill: string;
    targetLevel: SkillLevel;
    currentLevel: SkillLevel;
    progress: number; // 0-100
    completed: boolean;
  }>;

  /** 学习计划 */
  learningPlan?: {
    /** 总课时 */
    totalSessions: number;

    /** 已完成课时 */
    completedSessions: number;

    /** 下次培训时间 */
    nextSessionTime?: number;

    /** 培训频率（每周课时数） */
    sessionsPerWeek: number;
  };

  /** 培训记录 */
  sessions: Array<{
    id: string;
    date: number;
    duration: number; // 分钟
    topic: string;
    notes?: string;
    skillsPracticed: string[];
    rating?: number; // 1-5
  }>;

  /** 反馈记录 */
  feedback: Array<{
    id: string;
    from: "mentor" | "apprentice";
    date: number;
    content: string;
    rating?: number;
  }>;

  /** 元数据 */
  metadata?: {
    /** 专业领域 */
    domain?: string;

    /** 培训模式 */
    mode?: "one-on-one" | "group" | "hybrid";

    /** 标签 */
    tags?: string[];
  };
}

/**
 * 技能库
 */
export interface SkillCatalog {
  /** 技能ID */
  id: string;

  /** 技能名称 */
  name: string;

  /** 技能类别 */
  category: string;

  /** 描述 */
  description: string;

  /** 前置技能 */
  prerequisites?: string[];

  /** 级别要求 */
  levels: Array<{
    level: SkillLevel;
    requirements: string[];
    estimatedHours: number;
  }>;
}

/**
 * 师徒关系管理器
 */
export class MentorshipManager {
  private static instance: MentorshipManager;

  // 师徒关系存储
  private mentorships = new Map<string, Mentorship>();

  // 技能库
  private skillCatalog = new Map<string, SkillCatalog>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): MentorshipManager {
    if (!MentorshipManager.instance) {
      MentorshipManager.instance = new MentorshipManager();
    }
    return MentorshipManager.instance;
  }

  /**
   * 创建师徒关系
   */
  public async createMentorship(params: {
    mentorId: string;
    apprenticeId: string;
    goals: Array<{
      skill: string;
      targetLevel: SkillLevel;
    }>;
    learningPlan?: {
      totalSessions: number;
      sessionsPerWeek: number;
    };
    domain?: string;
    mode?: "one-on-one" | "group" | "hybrid";
  }): Promise<Mentorship> {
    const id = this.generateId();

    const mentorship: Mentorship = {
      id,
      mentorId: params.mentorId,
      apprenticeId: params.apprenticeId,
      status: "active",
      createdAt: Date.now(),
      startedAt: Date.now(),
      goals: params.goals.map((g, idx) => ({
        id: `goal_${idx + 1}`,
        skill: g.skill,
        targetLevel: g.targetLevel,
        currentLevel: "beginner",
        progress: 0,
        completed: false,
      })),
      learningPlan: params.learningPlan
        ? {
            ...params.learningPlan,
            completedSessions: 0,
          }
        : undefined,
      sessions: [],
      feedback: [],
      metadata: {
        domain: params.domain,
        mode: params.mode || "one-on-one",
        tags: [],
      },
    };

    this.mentorships.set(id, mentorship);

    console.log(
      `[MentorshipManager] Created mentorship ${id}: ${params.mentorId} → ${params.apprenticeId}`,
    );

    return mentorship;
  }

  /**
   * 获取师徒关系
   */
  public getMentorship(id: string): Mentorship | undefined {
    return this.mentorships.get(id);
  }

  /**
   * 获取智能助手的所有师徒关系
   */
  public getMentorships(agentId: string, role?: "mentor" | "apprentice"): Mentorship[] {
    const result: Mentorship[] = [];

    for (const mentorship of this.mentorships.values()) {
      if (!role) {
        if (mentorship.mentorId === agentId || mentorship.apprenticeId === agentId) {
          result.push(mentorship);
        }
      } else if (role === "mentor" && mentorship.mentorId === agentId) {
        result.push(mentorship);
      } else if (role === "apprentice" && mentorship.apprenticeId === agentId) {
        result.push(mentorship);
      }
    }

    return result;
  }

  /**
   * 添加培训记录
   */
  public async addSession(
    mentorshipId: string,
    session: {
      topic: string;
      duration: number;
      notes?: string;
      skillsPracticed: string[];
      rating?: number;
    },
  ): Promise<void> {
    const mentorship = this.mentorships.get(mentorshipId);

    if (!mentorship) {
      throw new Error(`Mentorship ${mentorshipId} not found`);
    }

    const sessionRecord = {
      id: `session_${mentorship.sessions.length + 1}`,
      date: Date.now(),
      ...session,
    };

    mentorship.sessions.push(sessionRecord);

    // 更新学习计划
    if (mentorship.learningPlan) {
      mentorship.learningPlan.completedSessions++;
    }

    // 更新技能进度
    for (const skill of session.skillsPracticed) {
      this.updateSkillProgress(mentorship, skill, 10); // 每次培训增加10%进度
    }

    console.log(
      `[MentorshipManager] Added session to mentorship ${mentorshipId}: ${session.topic}`,
    );
  }

  /**
   * 更新技能进度
   */
  private updateSkillProgress(mentorship: Mentorship, skillName: string, increment: number): void {
    const goal = mentorship.goals.find((g) => g.skill === skillName);

    if (goal && !goal.completed) {
      goal.progress = Math.min(100, goal.progress + increment);

      if (goal.progress >= 100) {
        goal.completed = true;

        // 升级技能等级
        const levelOrder: SkillLevel[] = [
          "beginner",
          "intermediate",
          "advanced",
          "expert",
          "master",
        ];
        const currentIndex = levelOrder.indexOf(goal.currentLevel);
        const targetIndex = levelOrder.indexOf(goal.targetLevel);

        if (currentIndex < targetIndex) {
          goal.currentLevel = levelOrder[currentIndex + 1];
          goal.progress = 0; // 重置进度，继续下一级别
          goal.completed = goal.currentLevel === goal.targetLevel;
        }
      }
    }
  }

  /**
   * 添加反馈
   */
  public async addFeedback(
    mentorshipId: string,
    from: "mentor" | "apprentice",
    content: string,
    rating?: number,
  ): Promise<void> {
    const mentorship = this.mentorships.get(mentorshipId);

    if (!mentorship) {
      throw new Error(`Mentorship ${mentorshipId} not found`);
    }

    mentorship.feedback.push({
      id: `feedback_${mentorship.feedback.length + 1}`,
      from,
      date: Date.now(),
      content,
      rating,
    });

    console.log(`[MentorshipManager] Added feedback to mentorship ${mentorshipId} from ${from}`);
  }

  /**
   * 更新师徒关系状态
   */
  public async updateStatus(mentorshipId: string, status: MentorshipStatus): Promise<void> {
    const mentorship = this.mentorships.get(mentorshipId);

    if (!mentorship) {
      throw new Error(`Mentorship ${mentorshipId} not found`);
    }

    mentorship.status = status;

    if (status === "completed") {
      mentorship.completedAt = Date.now();
    }

    console.log(`[MentorshipManager] Updated mentorship ${mentorshipId} status to ${status}`);
  }

  /**
   * 完成师徒关系
   */
  public async completeMentorship(mentorshipId: string): Promise<void> {
    await this.updateStatus(mentorshipId, "completed");
  }

  /**
   * 添加技能到技能库
   */
  public addSkill(skill: SkillCatalog): void {
    this.skillCatalog.set(skill.id, skill);
    console.log(`[MentorshipManager] Added skill to catalog: ${skill.name}`);
  }

  /**
   * 获取技能
   */
  public getSkill(skillId: string): SkillCatalog | undefined {
    return this.skillCatalog.get(skillId);
  }

  /**
   * 搜索技能
   */
  public searchSkills(query: string, category?: string): SkillCatalog[] {
    const results: SkillCatalog[] = [];

    for (const skill of this.skillCatalog.values()) {
      if (category && skill.category !== category) {
        continue;
      }

      if (
        skill.name.toLowerCase().includes(query.toLowerCase()) ||
        skill.description.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push(skill);
      }
    }

    return results;
  }

  /**
   * 获取师傅的所有徒弟
   */
  public getApprentices(mentorId: string): string[] {
    const apprentices = new Set<string>();

    for (const mentorship of this.mentorships.values()) {
      if (mentorship.mentorId === mentorId && mentorship.status === "active") {
        apprentices.add(mentorship.apprenticeId);
      }
    }

    return Array.from(apprentices);
  }

  /**
   * 获取徒弟的所有师傅
   */
  public getMentors(apprenticeId: string): string[] {
    const mentors = new Set<string>();

    for (const mentorship of this.mentorships.values()) {
      if (mentorship.apprenticeId === apprenticeId && mentorship.status === "active") {
        mentors.add(mentorship.mentorId);
      }
    }

    return Array.from(mentors);
  }

  /**
   * 获取师徒关系统计
   */
  public getStatistics(mentorshipId: string): {
    totalSessions: number;
    totalDuration: number;
    averageRating: number;
    completedGoals: number;
    totalGoals: number;
    overallProgress: number;
  } {
    const mentorship = this.mentorships.get(mentorshipId);

    if (!mentorship) {
      throw new Error(`Mentorship ${mentorshipId} not found`);
    }

    const totalSessions = mentorship.sessions.length;
    const totalDuration = mentorship.sessions.reduce((sum, s) => sum + s.duration, 0);

    const ratings = mentorship.sessions.filter((s) => s.rating).map((s) => s.rating!);
    const averageRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const completedGoals = mentorship.goals.filter((g) => g.completed).length;
    const totalGoals = mentorship.goals.length;

    const overallProgress =
      totalGoals > 0 ? mentorship.goals.reduce((sum, g) => sum + g.progress, 0) / totalGoals : 0;

    return {
      totalSessions,
      totalDuration,
      averageRating,
      completedGoals,
      totalGoals,
      overallProgress,
    };
  }

  /**
   * 生成ID
   */
  private generateId(): string {
    return `mentorship_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取全局统计
   */
  public getGlobalStatistics(): {
    totalMentorships: number;
    activeMentorships: number;
    completedMentorships: number;
    totalSkills: number;
    totalMentors: number;
    totalApprentices: number;
  } {
    const mentorships = Array.from(this.mentorships.values());

    const mentors = new Set(mentorships.map((m) => m.mentorId));
    const apprentices = new Set(mentorships.map((m) => m.apprenticeId));

    return {
      totalMentorships: mentorships.length,
      activeMentorships: mentorships.filter((m) => m.status === "active").length,
      completedMentorships: mentorships.filter((m) => m.status === "completed").length,
      totalSkills: this.skillCatalog.size,
      totalMentors: mentors.size,
      totalApprentices: apprentices.size,
    };
  }
}

/**
 * 全局实例
 */
export const mentorshipManager = MentorshipManager.getInstance();

/**
 * 便捷函数：创建师徒关系
 */
export async function createMentorship(params: {
  mentorId: string;
  apprenticeId: string;
  skills: Array<{ name: string; targetLevel: SkillLevel }>;
  totalSessions?: number;
  sessionsPerWeek?: number;
}): Promise<Mentorship> {
  return await mentorshipManager.createMentorship({
    mentorId: params.mentorId,
    apprenticeId: params.apprenticeId,
    goals: params.skills.map((s) => ({
      skill: s.name,
      targetLevel: s.targetLevel,
    })),
    learningPlan: params.totalSessions
      ? {
          totalSessions: params.totalSessions,
          sessionsPerWeek: params.sessionsPerWeek || 2,
        }
      : undefined,
  });
}
