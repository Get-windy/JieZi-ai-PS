/**
 * Phase 6: 培训会话系统
 *
 * 支持专用培训会话创建和上下文管理
 */

import { callGateway } from "../../gateway/call.js";
import { LifecycleManager } from "../../lifecycle/lifecycle-manager.js";
import { TrainingSystem } from "../../lifecycle/training-system.js";

/**
 * 培训会话配置
 */
export type TrainingSessionConfig = {
  /** 学员智能助手ID */
  studentAgentId: string;
  /** 培训师智能助手ID */
  trainerAgentId: string;
  /** 课程ID */
  courseId: string;
  /** 会话标签 */
  label?: string;
  /** 是否记录会话内容用于评估 */
  recordForAssessment?: boolean;
};

/**
 * 培训会话状态
 */
export type TrainingSessionState = {
  /** 会话KEY */
  sessionKey: string;
  /** 学员智能助手ID */
  studentAgentId: string;
  /** 培训师智能助手ID */
  trainerAgentId: string;
  /** 课程ID */
  courseId: string;
  /** 会话创建时间 */
  createdAt: number;
  /** 是否激活 */
  isActive: boolean;
  /** 会话上下文 */
  context: {
    currentModule?: string;
    completedModules: string[];
    exerciseAttempts: Record<string, number>;
    notes: string[];
  };
};

/**
 * 培训会话管理器
 */
export class TrainingSessionManager {
  private static instance: TrainingSessionManager;
  private sessions: Map<string, TrainingSessionState> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): TrainingSessionManager {
    if (!TrainingSessionManager.instance) {
      TrainingSessionManager.instance = new TrainingSessionManager();
    }
    return TrainingSessionManager.instance;
  }

  /**
   * 创建培训会话
   */
  public async createTrainingSession(config: TrainingSessionConfig): Promise<TrainingSessionState> {
    const { studentAgentId, trainerAgentId, courseId, label } = config;

    const trainingSystem = TrainingSystem.getInstance();
    const lifecycleManager = LifecycleManager.getInstance();

    // 验证课程
    const course = trainingSystem.getCourse(courseId);
    if (!course) {
      throw new Error(`Course not found: ${courseId}`);
    }

    // 验证培训进度
    const progress = trainingSystem.getProgress(studentAgentId, courseId);
    if (!progress) {
      throw new Error(
        `No training progress found for student ${studentAgentId} on course ${courseId}`,
      );
    }

    // 创建会话
    const sessionLabel = label || `training-${studentAgentId}-${courseId}`;

    let sessionKey: string;
    try {
      // 调用 Gateway 创建会话
      const result = await callGateway<{ key: string }>({
        method: "sessions.spawn",
        params: {
          agentId: studentAgentId,
          label: sessionLabel,
          announceTarget: trainerAgentId,
        },
        timeoutMs: 10_000,
      });

      sessionKey = result.key;
    } catch (error) {
      throw new Error(
        `Failed to create training session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 创建会话状态
    const sessionState: TrainingSessionState = {
      sessionKey,
      studentAgentId,
      trainerAgentId,
      courseId,
      createdAt: Date.now(),
      isActive: true,
      context: {
        completedModules: [],
        exerciseAttempts: {},
        notes: [],
      },
    };

    this.sessions.set(sessionKey, sessionState);

    // 记录事件
    lifecycleManager.recordEvent({
      agentId: studentAgentId,
      eventType: "training_started",
      triggeredBy: trainerAgentId,
      metadata: {
        courseId,
        sessionKey,
      },
    });

    return sessionState;
  }

  /**
   * 获取培训会话
   */
  public getTrainingSession(sessionKey: string): TrainingSessionState | null {
    return this.sessions.get(sessionKey) || null;
  }

  /**
   * 更新会话上下文
   */
  public updateSessionContext(
    sessionKey: string,
    updates: Partial<TrainingSessionState["context"]>,
  ): TrainingSessionState {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error(`Training session not found: ${sessionKey}`);
    }

    session.context = {
      ...session.context,
      ...updates,
    };

    return session;
  }

  /**
   * 添加会话笔记
   */
  public addSessionNote(sessionKey: string, note: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error(`Training session not found: ${sessionKey}`);
    }

    session.context.notes.push(`[${new Date().toISOString()}] ${note}`);
  }

  /**
   * 标记模块完成
   */
  public markModuleCompleted(sessionKey: string, moduleId: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error(`Training session not found: ${sessionKey}`);
    }

    if (!session.context.completedModules.includes(moduleId)) {
      session.context.completedModules.push(moduleId);
    }

    // 更新培训系统中的进度
    const trainingSystem = TrainingSystem.getInstance();
    trainingSystem.completeModule({
      agentId: session.studentAgentId,
      courseId: session.courseId,
      moduleId,
      timeSpent: 0, // 简化处理
    });
  }

  /**
   * 记录练习尝试
   */
  public recordExerciseAttempt(sessionKey: string, exerciseId: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error(`Training session not found: ${sessionKey}`);
    }

    const current = session.context.exerciseAttempts[exerciseId] || 0;
    session.context.exerciseAttempts[exerciseId] = current + 1;
  }

  /**
   * 结束培训会话
   */
  public async endTrainingSession(sessionKey: string): Promise<void> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error(`Training session not found: ${sessionKey}`);
    }

    session.isActive = false;

    // 记录事件
    const lifecycleManager = LifecycleManager.getInstance();
    lifecycleManager.recordEvent({
      agentId: session.studentAgentId,
      eventType: "training_completed",
      triggeredBy: session.trainerAgentId,
      metadata: {
        courseId: session.courseId,
        sessionKey,
        completedModules: session.context.completedModules.length,
      },
    });
  }

  /**
   * 获取学员的所有培训会话
   */
  public getStudentSessions(studentAgentId: string): TrainingSessionState[] {
    return Array.from(this.sessions.values()).filter((s) => s.studentAgentId === studentAgentId);
  }

  /**
   * 获取培训师的所有培训会话
   */
  public getTrainerSessions(trainerAgentId: string): TrainingSessionState[] {
    return Array.from(this.sessions.values()).filter((s) => s.trainerAgentId === trainerAgentId);
  }
}

/**
 * 导出单例实例
 */
export const trainingSessionManager = TrainingSessionManager.getInstance();
