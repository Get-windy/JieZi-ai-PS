/**
 * Phase 6: 生命周期与培训系统 - 核心类型定义
 *
 * 定义智能助手生命周期管理、培训体系、技能评估等核心数据结构
 */

/**
 * 智能助手生命周期阶段
 */
export type LifecycleStage =
  | "initialization" // 初始化阶段
  | "onboarding" // 入职/上岗阶段
  | "training" // 培训阶段
  | "active" // 活跃工作阶段
  | "maintenance" // 维护阶段
  | "retirement" // 退役阶段
  | "archived"; // 归档阶段

/**
 * 生命周期事件类型
 */
export type LifecycleEventType =
  | "created" // 创建
  | "activated" // 激活
  | "onboarded" // 完成入职
  | "training_started" // 开始培训
  | "training_completed" // 完成培训
  | "skill_acquired" // 获得技能
  | "role_changed" // 角色变更
  | "promoted" // 晋升
  | "demoted" // 降级
  | "suspended" // 暂停
  | "reactivated" // 重新激活
  | "retired" // 退役
  | "archived"; // 归档

/**
 * 生命周期事件
 */
export interface LifecycleEvent {
  id: string;
  agentId: string;
  eventType: LifecycleEventType;
  timestamp: number;
  metadata?: Record<string, any>;
  triggeredBy?: string; // 触发者ID
  reason?: string; // 原因
}

/**
 * 智能助手生命周期状态
 */
export interface AgentLifecycleState {
  agentId: string;
  currentStage: LifecycleStage;

  // 阶段历史
  stageHistory: Array<{
    stage: LifecycleStage;
    enteredAt: number;
    exitedAt?: number;
  }>;

  // 事件历史
  events: LifecycleEvent[];

  // 创建信息
  createdAt: number;
  createdBy: string;

  // 当前状态
  isActive: boolean;
  isSuspended: boolean;

  // 最后更新
  lastUpdatedAt: number;
  lastUpdatedBy?: string;
}

/**
 * 培训课程类型
 */
export type TrainingCourseType =
  | "onboarding" // 入职培训
  | "skill" // 技能培训
  | "certification" // 认证培训
  | "compliance" // 合规培训
  | "advanced"; // 高级培训

/**
 * 培训课程难度
 */
export type TrainingDifficulty = "beginner" | "intermediate" | "advanced" | "expert";

/**
 * 培训课程
 */
export interface TrainingCourse {
  id: string;
  name: string;
  description: string;
  type: TrainingCourseType;
  difficulty: TrainingDifficulty;

  // 课程内容
  modules: TrainingModule[];

  // 要求
  prerequisites?: string[]; // 前置课程ID
  requiredSkills?: string[]; // 需要的技能

  // 时长
  estimatedDuration: number; // 预计时长（分钟）

  // 评估
  hasAssessment: boolean; // 是否有评估
  passingScore?: number; // 及格分数（0-100）

  // 元数据
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  tags?: string[];
}

/**
 * 培训模块
 */
export interface TrainingModule {
  id: string;
  courseId: string;
  name: string;
  description: string;
  order: number; // 顺序

  // 内容
  content: {
    type: "text" | "video" | "interactive" | "document";
    url?: string;
    text?: string;
    metadata?: Record<string, any>;
  };

  // 时长
  estimatedDuration: number; // 预计时长（分钟）

  // 练习
  exercises?: TrainingExercise[];

  // 是否必修
  isRequired: boolean;
}

/**
 * 培训练习
 */
export interface TrainingExercise {
  id: string;
  moduleId: string;
  name: string;
  description: string;

  // 练习类型
  type: "quiz" | "practical" | "scenario" | "project";

  // 题目
  questions?: Array<{
    id: string;
    question: string;
    type: "single-choice" | "multiple-choice" | "text" | "code";
    options?: string[];
    correctAnswer?: string | string[];
    points: number;
  }>;

  // 评分
  totalPoints: number;
  passingPoints: number;
}

/**
 * 培训进度
 */
export interface TrainingProgress {
  id: string;
  agentId: string;
  courseId: string;

  // 状态
  status: "not-started" | "in-progress" | "completed" | "failed";

  // 进度
  moduleProgress: Map<
    string,
    {
      moduleId: string;
      started: boolean;
      completed: boolean;
      startedAt?: number;
      completedAt?: number;
      timeSpent: number; // 花费时间（分钟）
    }
  >;

  // 练习完成情况
  exerciseResults: Map<
    string,
    {
      exerciseId: string;
      score: number;
      totalPoints: number;
      passed: boolean;
      attemptCount: number;
      lastAttemptAt: number;
    }
  >;

  // 总体进度
  overallProgress: number; // 0-100

  // 时间
  startedAt?: number;
  completedAt?: number;
  totalTimeSpent: number; // 总花费时间（分钟）

  // 评估结果
  assessmentScore?: number; // 0-100
  passed?: boolean;

  // 证书
  certificateId?: string;
}

/**
 * 技能类型
 */
export type SkillCategory =
  | "technical" // 技术技能
  | "communication" // 沟通技能
  | "leadership" // 领导力
  | "domain-knowledge" // 领域知识
  | "tool-proficiency" // 工具熟练度
  | "soft-skill"; // 软技能

/**
 * 技能等级
 */
export type SkillLevel = "novice" | "beginner" | "intermediate" | "advanced" | "expert" | "master";

/**
 * 技能定义
 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;

  // 等级要求
  levels: Array<{
    level: SkillLevel;
    description: string;
    requirements: string[];
  }>;

  // 相关课程
  relatedCourses?: string[]; // 课程ID列表

  // 元数据
  createdAt: number;
  tags?: string[];
}

/**
 * 智能助手技能
 */
export interface AgentSkill {
  agentId: string;
  skillId: string;

  // 等级
  currentLevel: SkillLevel;
  targetLevel?: SkillLevel;

  // 获得信息
  acquiredAt: number;
  acquiredFrom?: string; // 课程ID或其他来源

  // 进度
  levelProgress: number; // 当前等级进度（0-100）

  // 最后使用
  lastUsedAt?: number;
  usageCount: number;

  // 认证
  isCertified: boolean;
  certifiedAt?: number;
  certificationExpiry?: number;

  // 评估
  lastAssessedAt?: number;
  assessmentScore?: number; // 0-100
}

/**
 * 培训计划
 */
export interface TrainingPlan {
  id: string;
  agentId: string;
  name: string;
  description?: string;

  // 课程列表
  courses: Array<{
    courseId: string;
    order: number;
    isRequired: boolean;
    deadline?: number;
  }>;

  // 目标
  targetSkills?: string[]; // 目标技能ID
  targetRole?: string; // 目标角色

  // 时间
  startDate: number;
  endDate?: number;

  // 状态
  status: "draft" | "active" | "completed" | "cancelled";

  // 进度
  overallProgress: number; // 0-100
  completedCourses: string[]; // 已完成课程ID

  // 创建信息
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
}

/**
 * 评估类型
 */
export type AssessmentType =
  | "skill" // 技能评估
  | "performance" // 绩效评估
  | "knowledge" // 知识评估
  | "360-feedback" // 360度反馈
  | "self-assessment"; // 自我评估

/**
 * 评估结果
 */
export interface AssessmentResult {
  id: string;
  agentId: string;
  type: AssessmentType;

  // 评估内容
  targetSkills?: string[]; // 评估的技能ID
  assessor?: string; // 评估者ID

  // 结果
  overallScore: number; // 总分（0-100）
  breakdown?: Map<string, number>; // 分项得分

  // 反馈
  feedback?: string;
  strengths?: string[]; // 优势
  weaknesses?: string[]; // 待改进
  recommendations?: string[]; // 建议

  // 时间
  assessedAt: number;
  validUntil?: number;

  // 元数据
  metadata?: Record<string, any>;
}

/**
 * 证书
 */
export interface Certificate {
  id: string;
  agentId: string;

  // 证书类型
  type: "course-completion" | "skill-certification" | "role-qualification";

  // 关联
  courseId?: string;
  skillId?: string;
  roleId?: string;

  // 证书信息
  title: string;
  description?: string;

  // 颁发
  issuedAt: number;
  issuedBy: string;

  // 有效期
  expiresAt?: number;

  // 验证
  verificationCode: string;
  isValid: boolean;

  // 元数据
  metadata?: Record<string, any>;
}

/**
 * 生命周期配置
 */
export interface LifecycleConfig {
  // 自动晋升配置
  autoPromotion?: {
    enabled: boolean;
    criteria: {
      minActiveTime: number; // 最小活跃时间（天）
      minSkillCount: number; // 最少技能数
      minSkillLevel: SkillLevel; // 最低技能等级
      minAssessmentScore: number; // 最低评估分数
    };
  };

  // 强制培训配置
  mandatoryTraining?: {
    enabled: boolean;
    courses: string[]; // 必修课程ID
    deadline?: number; // 截止时间
  };

  // 证书有效期配置
  certificateExpiry?: {
    enabled: boolean;
    defaultDuration: number; // 默认有效期（天）
  };

  // 评估周期配置
  assessmentCycle?: {
    enabled: boolean;
    interval: number; // 评估间隔（天）
  };
}

/**
 * 培训统计信息
 */
export interface TrainingStatistics {
  agentId: string;

  // 课程统计
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;

  // 技能统计
  totalSkills: number;
  certifiedSkills: number;
  skillsByCategory: Map<SkillCategory, number>;

  // 时间统计
  totalTrainingTime: number; // 总培训时间（分钟）
  averageCompletionTime: number; // 平均完成时间

  // 评估统计
  totalAssessments: number;
  averageAssessmentScore: number;

  // 证书统计
  totalCertificates: number;
  activeCertificates: number;
  expiredCertificates: number;

  // 最后更新
  lastUpdatedAt: number;
}
