/**
 * Phase 6: 培训系统
 *
 * 职责：
 * 1. 管理培训课程
 * 2. 跟踪培训进度
 * 3. 评估学习成果
 * 4. 颁发证书
 */

import type {
  TrainingCourse,
  TrainingModule,
  TrainingProgress,
  TrainingPlan,
  Certificate,
  TrainingStatistics,
} from "./types.js";
import { lifecycleManager } from "./lifecycle-manager.js";

/**
 * 培训系统（单例）
 */
export class TrainingSystem {
  private static instance: TrainingSystem;
  private courses: Map<string, TrainingCourse> = new Map();
  private progresses: Map<string, TrainingProgress> = new Map(); // key: `${agentId}-${courseId}`
  private plans: Map<string, TrainingPlan> = new Map();
  private certificates: Map<string, Certificate> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): TrainingSystem {
    if (!TrainingSystem.instance) {
      TrainingSystem.instance = new TrainingSystem();
    }
    return TrainingSystem.instance;
  }

  // ========== 课程管理 ==========

  /**
   * 创建培训课程
   */
  public createCourse(params: Omit<TrainingCourse, "createdAt" | "updatedAt">): TrainingCourse {
    const { id } = params;

    if (this.courses.has(id)) {
      throw new Error(`Course already exists: ${id}`);
    }

    const course: TrainingCourse = {
      ...params,
      createdAt: Date.now(),
    };

    this.courses.set(id, course);
    return course;
  }

  /**
   * 获取课程
   */
  public getCourse(courseId: string): TrainingCourse | null {
    return this.courses.get(courseId) || null;
  }

  /**
   * 更新课程
   */
  public updateCourse(
    courseId: string,
    updates: Partial<Omit<TrainingCourse, "id" | "createdAt" | "createdBy">>,
  ): TrainingCourse {
    const course = this.courses.get(courseId);
    if (!course) {
      throw new Error(`Course not found: ${courseId}`);
    }

    const updated: TrainingCourse = {
      ...course,
      ...updates,
      updatedAt: Date.now(),
    };

    this.courses.set(courseId, updated);
    return updated;
  }

  /**
   * 删除课程
   */
  public deleteCourse(courseId: string): boolean {
    return this.courses.delete(courseId);
  }

  /**
   * 获取所有课程
   */
  public getAllCourses(): TrainingCourse[] {
    return Array.from(this.courses.values());
  }

  /**
   * 按类型筛选课程
   */
  public getCoursesByType(type: TrainingCourse["type"]): TrainingCourse[] {
    return Array.from(this.courses.values()).filter((c) => c.type === type);
  }

  // ========== 培训进度管理 ==========

  /**
   * 开始课程学习
   */
  public startCourse(params: { agentId: string; courseId: string }): TrainingProgress {
    const { agentId, courseId } = params;

    const course = this.courses.get(courseId);
    if (!course) {
      throw new Error(`Course not found: ${courseId}`);
    }

    const progressKey = `${agentId}-${courseId}`;
    if (this.progresses.has(progressKey)) {
      throw new Error(`Training already started: ${progressKey}`);
    }

    const progress: TrainingProgress = {
      id: progressKey,
      agentId,
      courseId,
      status: "in-progress",
      moduleProgress: new Map(),
      exerciseResults: new Map(),
      overallProgress: 0,
      startedAt: Date.now(),
      totalTimeSpent: 0,
    };

    this.progresses.set(progressKey, progress);

    // 记录生命周期事件
    lifecycleManager.recordEvent({
      agentId,
      eventType: "training_started",
      metadata: { courseId },
    });

    return progress;
  }

  /**
   * 获取培训进度
   */
  public getProgress(agentId: string, courseId: string): TrainingProgress | null {
    const progressKey = `${agentId}-${courseId}`;
    return this.progresses.get(progressKey) || null;
  }

  /**
   * 开始模块学习
   */
  public startModule(params: {
    agentId: string;
    courseId: string;
    moduleId: string;
  }): TrainingProgress {
    const { agentId, courseId, moduleId } = params;

    const progressKey = `${agentId}-${courseId}`;
    const progress = this.progresses.get(progressKey);
    if (!progress) {
      throw new Error(`Training not started: ${progressKey}`);
    }

    progress.moduleProgress.set(moduleId, {
      moduleId,
      started: true,
      completed: false,
      startedAt: Date.now(),
      timeSpent: 0,
    });

    return progress;
  }

  /**
   * 完成模块学习
   */
  public completeModule(params: {
    agentId: string;
    courseId: string;
    moduleId: string;
    timeSpent: number;
  }): TrainingProgress {
    const { agentId, courseId, moduleId, timeSpent } = params;

    const progressKey = `${agentId}-${courseId}`;
    const progress = this.progresses.get(progressKey);
    if (!progress) {
      throw new Error(`Training not started: ${progressKey}`);
    }

    const moduleProgress = progress.moduleProgress.get(moduleId);
    if (!moduleProgress) {
      throw new Error(`Module not started: ${moduleId}`);
    }

    moduleProgress.completed = true;
    moduleProgress.completedAt = Date.now();
    moduleProgress.timeSpent = timeSpent;

    progress.totalTimeSpent += timeSpent;

    // 更新总体进度
    this.updateOverallProgress(progress);

    return progress;
  }

  /**
   * 提交练习答案
   */
  public submitExercise(params: {
    agentId: string;
    courseId: string;
    exerciseId: string;
    answers: any;
  }): {
    score: number;
    totalPoints: number;
    passed: boolean;
  } {
    const { agentId, courseId, exerciseId, answers } = params;

    const progressKey = `${agentId}-${courseId}`;
    const progress = this.progresses.get(progressKey);
    if (!progress) {
      throw new Error(`Training not started: ${progressKey}`);
    }

    // 评分（这里简化处理，实际应根据练习类型评分）
    const score = this.gradeExercise(exerciseId, answers);
    const totalPoints = 100; // 简化处理
    const passed = score >= totalPoints * 0.6; // 60分及格

    const existingResult = progress.exerciseResults.get(exerciseId);
    const attemptCount = (existingResult?.attemptCount || 0) + 1;

    progress.exerciseResults.set(exerciseId, {
      exerciseId,
      score,
      totalPoints,
      passed,
      attemptCount,
      lastAttemptAt: Date.now(),
    });

    return { score, totalPoints, passed };
  }

  /**
   * 评分练习（简化实现）
   */
  private gradeExercise(exerciseId: string, answers: any): number {
    // 这里应该根据练习的正确答案评分
    // 简化实现：随机生成分数
    return Math.floor(Math.random() * 40) + 60; // 60-100分
  }

  /**
   * 完成课程
   */
  public completeCourse(params: {
    agentId: string;
    courseId: string;
    assessmentScore?: number;
  }): TrainingProgress {
    const { agentId, courseId, assessmentScore } = params;

    const progressKey = `${agentId}-${courseId}`;
    const progress = this.progresses.get(progressKey);
    if (!progress) {
      throw new Error(`Training not started: ${progressKey}`);
    }

    const course = this.courses.get(courseId);
    if (!course) {
      throw new Error(`Course not found: ${courseId}`);
    }

    // 检查是否所有必修模块都已完成
    const requiredModules = course.modules.filter((m: TrainingModule) => m.isRequired);
    const allCompleted = requiredModules.every((m: TrainingModule) => {
      const moduleProgress = progress.moduleProgress.get(m.id);
      return moduleProgress?.completed;
    });

    if (!allCompleted) {
      throw new Error("Not all required modules completed");
    }

    // 检查评估分数
    if (course.hasAssessment && course.passingScore) {
      if (!assessmentScore || assessmentScore < course.passingScore) {
        progress.status = "failed";
        progress.passed = false;
        progress.assessmentScore = assessmentScore;
        progress.completedAt = Date.now();
        return progress;
      }
    }

    progress.status = "completed";
    progress.passed = true;
    progress.assessmentScore = assessmentScore;
    progress.completedAt = Date.now();
    progress.overallProgress = 100;

    // 记录生命周期事件
    lifecycleManager.recordEvent({
      agentId,
      eventType: "training_completed",
      metadata: {
        courseId,
        score: assessmentScore,
      },
    });

    // 颁发证书
    if (progress.passed) {
      this.issueCertificate({
        agentId,
        courseId,
        type: "course-completion",
      });
    }

    return progress;
  }

  /**
   * 更新总体进度
   */
  private updateOverallProgress(progress: TrainingProgress): void {
    const course = this.courses.get(progress.courseId);
    if (!course) return;

    const totalModules = course.modules.length;
    const completedModules = Array.from(progress.moduleProgress.values()).filter(
      (m) => m.completed,
    ).length;

    progress.overallProgress = Math.floor((completedModules / totalModules) * 100);
  }

  /**
   * 获取智能助手的所有培训进度
   */
  public getAgentProgresses(agentId: string): TrainingProgress[] {
    return Array.from(this.progresses.values()).filter((p) => p.agentId === agentId);
  }

  // ========== 培训计划管理 ==========

  /**
   * 创建培训计划
   */
  public createTrainingPlan(
    params: Omit<
      TrainingPlan,
      "createdAt" | "updatedAt" | "status" | "overallProgress" | "completedCourses"
    >,
  ): TrainingPlan {
    const { id } = params;

    if (this.plans.has(id)) {
      throw new Error(`Training plan already exists: ${id}`);
    }

    const plan: TrainingPlan = {
      ...params,
      status: "draft",
      overallProgress: 0,
      completedCourses: [],
      createdAt: Date.now(),
    };

    this.plans.set(id, plan);
    return plan;
  }

  /**
   * 获取培训计划
   */
  public getTrainingPlan(planId: string): TrainingPlan | null {
    return this.plans.get(planId) || null;
  }

  /**
   * 激活培训计划
   */
  public activateTrainingPlan(planId: string): TrainingPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Training plan not found: ${planId}`);
    }

    plan.status = "active";
    plan.updatedAt = Date.now();

    return plan;
  }

  /**
   * 更新培训计划进度
   */
  public updatePlanProgress(planId: string): TrainingPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Training plan not found: ${planId}`);
    }

    const completedCourses: string[] = [];
    for (const course of plan.courses) {
      const progress = this.getProgress(plan.agentId, course.courseId);
      if (progress?.status === "completed") {
        completedCourses.push(course.courseId);
      }
    }

    plan.completedCourses = completedCourses;
    plan.overallProgress = Math.floor((completedCourses.length / plan.courses.length) * 100);

    if (plan.overallProgress === 100) {
      plan.status = "completed";
    }

    plan.updatedAt = Date.now();

    return plan;
  }

  // ========== 证书管理 ==========

  /**
   * 颁发证书
   */
  public issueCertificate(params: {
    agentId: string;
    type: Certificate["type"];
    courseId?: string;
    skillId?: string;
    roleId?: string;
    title?: string;
    expiresAt?: number;
  }): Certificate {
    const { agentId, type, courseId, skillId, roleId, title, expiresAt } = params;

    const id = `cert-${agentId}-${Date.now()}`;
    const verificationCode = this.generateVerificationCode();

    const certificate: Certificate = {
      id,
      agentId,
      type,
      courseId,
      skillId,
      roleId,
      title: title || this.generateCertificateTitle(type, courseId, skillId, roleId),
      issuedAt: Date.now(),
      issuedBy: "system",
      expiresAt,
      verificationCode,
      isValid: true,
    };

    this.certificates.set(id, certificate);

    return certificate;
  }

  /**
   * 生成证书标题
   */
  private generateCertificateTitle(
    type: Certificate["type"],
    courseId?: string,
    skillId?: string,
    roleId?: string,
  ): string {
    switch (type) {
      case "course-completion":
        return `课程完成证书 - ${courseId}`;
      case "skill-certification":
        return `技能认证证书 - ${skillId}`;
      case "role-qualification":
        return `角色资格证书 - ${roleId}`;
      default:
        return "证书";
    }
  }

  /**
   * 生成验证码
   */
  private generateVerificationCode(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * 获取证书
   */
  public getCertificate(certificateId: string): Certificate | null {
    return this.certificates.get(certificateId) || null;
  }

  /**
   * 验证证书
   */
  public verifyCertificate(verificationCode: string): Certificate | null {
    for (const cert of this.certificates.values()) {
      if (cert.verificationCode === verificationCode) {
        return cert;
      }
    }
    return null;
  }

  /**
   * 撤销证书
   */
  public revokeCertificate(certificateId: string): void {
    const cert = this.certificates.get(certificateId);
    if (cert) {
      cert.isValid = false;
    }
  }

  /**
   * 获取智能助手的所有证书
   */
  public getAgentCertificates(agentId: string): Certificate[] {
    return Array.from(this.certificates.values()).filter((c) => c.agentId === agentId);
  }

  /**
   * 获取有效证书
   */
  public getValidCertificates(agentId: string): Certificate[] {
    const now = Date.now();
    return this.getAgentCertificates(agentId).filter((cert) => {
      if (!cert.isValid) return false;
      if (cert.expiresAt && cert.expiresAt < now) return false;
      return true;
    });
  }

  // ========== 统计信息 ==========

  /**
   * 获取培训统计信息
   */
  public getTrainingStatistics(agentId: string): TrainingStatistics {
    const progresses = this.getAgentProgresses(agentId);
    const certificates = this.getAgentCertificates(agentId);
    const validCertificates = this.getValidCertificates(agentId);

    const completed = progresses.filter((p) => p.status === "completed");
    const inProgress = progresses.filter((p) => p.status === "in-progress");

    const totalTime = progresses.reduce((sum, p) => sum + p.totalTimeSpent, 0);
    const avgTime = completed.length > 0 ? totalTime / completed.length : 0;

    return {
      agentId,
      totalCourses: progresses.length,
      completedCourses: completed.length,
      inProgressCourses: inProgress.length,
      totalSkills: 0, // 需要从技能系统获取
      certifiedSkills: 0,
      skillsByCategory: new Map(),
      totalTrainingTime: totalTime,
      averageCompletionTime: avgTime,
      totalAssessments: progresses.filter((p) => p.assessmentScore !== undefined).length,
      averageAssessmentScore: this.calculateAverageAssessmentScore(progresses),
      totalCertificates: certificates.length,
      activeCertificates: validCertificates.length,
      expiredCertificates: certificates.length - validCertificates.length,
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * 计算平均评估分数
   */
  private calculateAverageAssessmentScore(progresses: TrainingProgress[]): number {
    const scores = progresses
      .map((p) => p.assessmentScore)
      .filter((score): score is number => score !== undefined);

    if (scores.length === 0) return 0;

    const sum = scores.reduce((a, b) => a + b, 0);
    return sum / scores.length;
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    this.courses.clear();
    this.progresses.clear();
    this.plans.clear();
    this.certificates.clear();
  }
}

/**
 * 导出单例实例
 */
export const trainingSystem = TrainingSystem.getInstance();
