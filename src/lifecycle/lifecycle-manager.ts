/**
 * Phase 6: 生命周期管理器
 *
 * 职责：
 * 1. 管理智能助手的完整生命周期
 * 2. 记录和跟踪生命周期事件
 * 3. 处理阶段转换
 * 4. 提供生命周期查询接口
 */

import type {
  LifecycleStage,
  LifecycleEventType,
  LifecycleEvent,
  AgentLifecycleState,
  LifecycleConfig,
} from "./types.js";

/**
 * 生命周期管理器（单例）
 */
export class LifecycleManager {
  private static instance: LifecycleManager;
  private lifecycleStates: Map<string, AgentLifecycleState> = new Map();
  private config: LifecycleConfig = {};

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): LifecycleManager {
    if (!LifecycleManager.instance) {
      LifecycleManager.instance = new LifecycleManager();
    }
    return LifecycleManager.instance;
  }

  /**
   * 设置配置
   */
  public setConfig(config: Partial<LifecycleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  public getConfig(): LifecycleConfig {
    return { ...this.config };
  }

  /**
   * 初始化智能助手生命周期
   */
  public initializeAgent(params: { agentId: string; createdBy: string }): AgentLifecycleState {
    const { agentId, createdBy } = params;

    if (this.lifecycleStates.has(agentId)) {
      throw new Error(`Agent lifecycle already initialized: ${agentId}`);
    }

    const now = Date.now();
    const initialEvent: LifecycleEvent = {
      id: `event-${agentId}-${now}`,
      agentId,
      eventType: "created",
      timestamp: now,
      triggeredBy: createdBy,
    };

    const state: AgentLifecycleState = {
      agentId,
      currentStage: "initialization",
      stageHistory: [
        {
          stage: "initialization",
          enteredAt: now,
        },
      ],
      events: [initialEvent],
      createdAt: now,
      createdBy,
      isActive: false,
      isSuspended: false,
      lastUpdatedAt: now,
    };

    this.lifecycleStates.set(agentId, state);
    return state;
  }

  /**
   * 获取智能助手生命周期状态
   */
  public getLifecycleState(agentId: string): AgentLifecycleState | null {
    return this.lifecycleStates.get(agentId) || null;
  }

  /**
   * 转换生命周期阶段
   */
  public transitionStage(params: {
    agentId: string;
    toStage: LifecycleStage;
    triggeredBy?: string;
    reason?: string;
  }): AgentLifecycleState {
    const { agentId, toStage, triggeredBy, reason } = params;

    const state = this.lifecycleStates.get(agentId);
    if (!state) {
      throw new Error(`Agent lifecycle not found: ${agentId}`);
    }

    const now = Date.now();

    // 验证阶段转换是否合法
    this.validateStageTransition(state.currentStage, toStage);

    // 结束当前阶段
    const currentStageHistory = state.stageHistory[state.stageHistory.length - 1];
    currentStageHistory.exitedAt = now;

    // 进入新阶段
    state.stageHistory.push({
      stage: toStage,
      enteredAt: now,
    });

    state.currentStage = toStage;
    state.lastUpdatedAt = now;
    if (triggeredBy) {
      state.lastUpdatedBy = triggeredBy;
    }

    // 记录事件
    const eventType = this.getEventTypeForStage(toStage);
    if (eventType) {
      this.recordEvent({
        agentId,
        eventType,
        triggeredBy,
        reason,
      });
    }

    // 更新激活状态
    state.isActive = this.isStageActive(toStage);

    return state;
  }

  /**
   * 验证阶段转换是否合法
   */
  private validateStageTransition(from: LifecycleStage, to: LifecycleStage): void {
    const validTransitions: Record<LifecycleStage, LifecycleStage[]> = {
      initialization: ["onboarding", "archived"],
      onboarding: ["training", "active", "archived"],
      training: ["active", "onboarding", "archived"],
      active: ["training", "maintenance", "retirement", "archived"],
      maintenance: ["active", "retirement", "archived"],
      retirement: ["archived"],
      archived: [],
    };

    const allowedTransitions = validTransitions[from] || [];
    if (!allowedTransitions.includes(to)) {
      throw new Error(`Invalid stage transition from ${from} to ${to}`);
    }
  }

  /**
   * 获取阶段对应的事件类型
   */
  private getEventTypeForStage(stage: LifecycleStage): LifecycleEventType | null {
    const mapping: Partial<Record<LifecycleStage, LifecycleEventType>> = {
      onboarding: "onboarded",
      training: "training_started",
      active: "activated",
      retirement: "retired",
      archived: "archived",
    };

    return mapping[stage] || null;
  }

  /**
   * 判断阶段是否为激活状态
   */
  private isStageActive(stage: LifecycleStage): boolean {
    return ["active", "training", "maintenance"].includes(stage);
  }

  /**
   * 记录生命周期事件
   */
  public recordEvent(params: {
    agentId: string;
    eventType: LifecycleEventType;
    triggeredBy?: string;
    reason?: string;
    metadata?: Record<string, any>;
  }): LifecycleEvent {
    const { agentId, eventType, triggeredBy, reason, metadata } = params;

    const state = this.lifecycleStates.get(agentId);
    if (!state) {
      throw new Error(`Agent lifecycle not found: ${agentId}`);
    }

    const now = Date.now();
    const event: LifecycleEvent = {
      id: `event-${agentId}-${now}-${eventType}`,
      agentId,
      eventType,
      timestamp: now,
      triggeredBy,
      reason,
      metadata,
    };

    state.events.push(event);
    state.lastUpdatedAt = now;

    return event;
  }

  /**
   * 激活智能助手
   */
  public activate(params: { agentId: string; triggeredBy?: string }): AgentLifecycleState {
    const { agentId, triggeredBy } = params;

    const state = this.lifecycleStates.get(agentId);
    if (!state) {
      throw new Error(`Agent lifecycle not found: ${agentId}`);
    }

    // 转换到 active 阶段
    return this.transitionStage({
      agentId,
      toStage: "active",
      triggeredBy,
      reason: "Agent activated",
    });
  }

  /**
   * 暂停智能助手
   */
  public suspend(params: {
    agentId: string;
    triggeredBy?: string;
    reason?: string;
  }): AgentLifecycleState {
    const { agentId, triggeredBy, reason } = params;

    const state = this.lifecycleStates.get(agentId);
    if (!state) {
      throw new Error(`Agent lifecycle not found: ${agentId}`);
    }

    state.isSuspended = true;
    state.lastUpdatedAt = Date.now();

    this.recordEvent({
      agentId,
      eventType: "suspended",
      triggeredBy,
      reason,
    });

    return state;
  }

  /**
   * 重新激活智能助手
   */
  public reactivate(params: { agentId: string; triggeredBy?: string }): AgentLifecycleState {
    const { agentId, triggeredBy } = params;

    const state = this.lifecycleStates.get(agentId);
    if (!state) {
      throw new Error(`Agent lifecycle not found: ${agentId}`);
    }

    state.isSuspended = false;
    state.lastUpdatedAt = Date.now();

    this.recordEvent({
      agentId,
      eventType: "reactivated",
      triggeredBy,
    });

    return state;
  }

  /**
   * 退役智能助手
   */
  public retire(params: {
    agentId: string;
    triggeredBy?: string;
    reason?: string;
  }): AgentLifecycleState {
    const { agentId, triggeredBy, reason } = params;

    return this.transitionStage({
      agentId,
      toStage: "retirement",
      triggeredBy,
      reason,
    });
  }

  /**
   * 归档智能助手
   */
  public archive(params: {
    agentId: string;
    triggeredBy?: string;
    reason?: string;
  }): AgentLifecycleState {
    const { agentId, triggeredBy, reason } = params;

    return this.transitionStage({
      agentId,
      toStage: "archived",
      triggeredBy,
      reason,
    });
  }

  /**
   * 获取智能助手的事件历史
   */
  public getEventHistory(
    agentId: string,
    filter?: {
      eventType?: LifecycleEventType;
      startTime?: number;
      endTime?: number;
      limit?: number;
    },
  ): LifecycleEvent[] {
    const state = this.lifecycleStates.get(agentId);
    if (!state) {
      return [];
    }

    let events = [...state.events];

    // 应用过滤器
    if (filter?.eventType) {
      events = events.filter((e) => e.eventType === filter.eventType);
    }

    if (filter?.startTime) {
      events = events.filter((e) => e.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      events = events.filter((e) => e.timestamp <= filter.endTime!);
    }

    // 排序（最新的在前）
    events.sort((a, b) => b.timestamp - a.timestamp);

    // 限制数量
    if (filter?.limit) {
      events = events.slice(0, filter.limit);
    }

    return events;
  }

  /**
   * 获取在特定阶段的智能助手列表
   */
  public getAgentsByStage(stage: LifecycleStage): AgentLifecycleState[] {
    return Array.from(this.lifecycleStates.values()).filter(
      (state) => state.currentStage === stage,
    );
  }

  /**
   * 获取所有活跃的智能助手
   */
  public getActiveAgents(): AgentLifecycleState[] {
    return Array.from(this.lifecycleStates.values()).filter(
      (state) => state.isActive && !state.isSuspended,
    );
  }

  /**
   * 获取所有暂停的智能助手
   */
  public getSuspendedAgents(): AgentLifecycleState[] {
    return Array.from(this.lifecycleStates.values()).filter((state) => state.isSuspended);
  }

  /**
   * 获取智能助手在特定阶段停留的时长
   */
  public getStageTime(agentId: string, stage: LifecycleStage): number {
    const state = this.lifecycleStates.get(agentId);
    if (!state) {
      return 0;
    }

    let totalTime = 0;
    for (const history of state.stageHistory) {
      if (history.stage === stage) {
        const endTime = history.exitedAt || Date.now();
        totalTime += endTime - history.enteredAt;
      }
    }

    return totalTime;
  }

  /**
   * 获取智能助手的总活跃时间
   */
  public getTotalActiveTime(agentId: string): number {
    const activeStages: LifecycleStage[] = ["active", "training", "maintenance"];
    let totalTime = 0;

    for (const stage of activeStages) {
      totalTime += this.getStageTime(agentId, stage);
    }

    return totalTime;
  }

  /**
   * 获取所有智能助手
   */
  public getAllAgents(): AgentLifecycleState[] {
    return Array.from(this.lifecycleStates.values());
  }

  /**
   * 删除智能助手生命周期数据
   */
  public deleteAgent(agentId: string): boolean {
    return this.lifecycleStates.delete(agentId);
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    this.lifecycleStates.clear();
  }

  /**
   * 复制工作空间模板（从导师到学员）
   */
  public async copyWorkspaceTemplate(params: {
    mentorAgentId: string;
    studentAgentId: string;
    workspaceRoot?: string;
    excludePatterns?: string[];
  }): Promise<{
    success: boolean;
    copiedFiles: number;
    totalSize: number;
    skippedFiles: number;
    error?: string;
  }> {
    const { mentorAgentId, studentAgentId, workspaceRoot, excludePatterns = [] } = params;

    try {
      // 验证智能助手存在
      const mentorState = this.lifecycleStates.get(mentorAgentId);
      const studentState = this.lifecycleStates.get(studentAgentId);

      if (!mentorState) {
        return {
          success: false,
          copiedFiles: 0,
          totalSize: 0,
          skippedFiles: 0,
          error: `Mentor agent not found: ${mentorAgentId}`,
        };
      }

      if (!studentState) {
        return {
          success: false,
          copiedFiles: 0,
          totalSize: 0,
          skippedFiles: 0,
          error: `Student agent not found: ${studentAgentId}`,
        };
      }

      // 动态导入 fs 和path 模块
      const fs = await import("fs/promises");
      const path = await import("path");

      // 确定工作空间路径
      const baseWorkspaceRoot = workspaceRoot || this.config.workspaceRoot || "./workspaces";
      const mentorWorkspace = path.join(baseWorkspaceRoot, mentorAgentId);
      const studentWorkspace = path.join(baseWorkspaceRoot, studentAgentId);

      // 检查导师工作空间是否存在
      try {
        await fs.access(mentorWorkspace);
      } catch {
        return {
          success: false,
          copiedFiles: 0,
          totalSize: 0,
          skippedFiles: 0,
          error: `Mentor workspace not found: ${mentorWorkspace}`,
        };
      }

      // 创建学员工作空间（如果不存在）
      await fs.mkdir(studentWorkspace, { recursive: true });

      // 默认排除模式
      const defaultExcludePatterns = [
        "node_modules",
        ".git",
        ".env",
        ".env.local",
        "*.log",
        "dist",
        "build",
        ".cache",
        "tmp",
        "temp",
      ];

      const allExcludePatterns = [...defaultExcludePatterns, ...excludePatterns];

      // 递归复制文件
      let copiedFiles = 0;
      let totalSize = 0;
      let skippedFiles = 0;

      const copyRecursive = async (sourcePath: string, destPath: string): Promise<void> => {
        const entries = await fs.readdir(sourcePath, { withFileTypes: true });

        for (const entry of entries) {
          const sourceEntry = path.join(sourcePath, entry.name);
          const destEntry = path.join(destPath, entry.name);

          // 检查是否应该排除
          const shouldExclude = allExcludePatterns.some((pattern) => {
            if (pattern.includes("*")) {
              // 简单的通配符匹配
              const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
              return regex.test(entry.name);
            }
            return entry.name === pattern;
          });

          if (shouldExclude) {
            skippedFiles++;
            continue;
          }

          if (entry.isDirectory()) {
            // 创建目录并递归复制
            await fs.mkdir(destEntry, { recursive: true });
            await copyRecursive(sourceEntry, destEntry);
          } else if (entry.isFile()) {
            // 复制文件
            await fs.copyFile(sourceEntry, destEntry);
            const stats = await fs.stat(sourceEntry);
            copiedFiles++;
            totalSize += stats.size;
          }
        }
      };

      // 开始复制
      await copyRecursive(mentorWorkspace, studentWorkspace);

      // 记录工作空间复制事件
      this.recordEvent({
        agentId: studentAgentId,
        eventType: "workspace_setup",
        triggeredBy: mentorAgentId,
        metadata: {
          source: "template_copy",
          mentorAgentId,
          copiedFiles,
          totalSize,
          skippedFiles,
        },
      });

      return {
        success: true,
        copiedFiles,
        totalSize,
        skippedFiles,
      };
    } catch (error) {
      return {
        success: false,
        copiedFiles: 0,
        totalSize: 0,
        skippedFiles: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * 导出单例实例
 */
export const lifecycleManager = LifecycleManager.getInstance();
