/**
 * 策略调度器
 * 
 * 功能：
 * - 调度策略执行的时机和顺序
 * - 支持异步策略执行
 * - 处理策略执行的超时和重试
 * - 支持策略执行的优先级队列
 */

import type {
  InboundMessageContext,
  OutboundMessageContext,
  PolicyResult,
} from "./types.js";
import { policyExecutor } from "./executor.js";

/**
 * 策略调度任务
 */
type PolicyTask = {
  id: string;
  type: "inbound" | "outbound";
  message: InboundMessageContext | OutboundMessageContext;
  agentId: string;
  priority: number;
  timestamp: number;
  resolve: (result: PolicyResult) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
};

/**
 * 策略调度器配置
 */
export type PolicySchedulerConfig = {
  /** 最大并发执行数 */
  maxConcurrency?: number;
  /** 执行超时时间（毫秒） */
  executionTimeout?: number;
  /** 是否启用优先级队列 */
  enablePriorityQueue?: boolean;
};

/**
 * 策略调度器
 */
export class PolicyScheduler {
  private static instance: PolicyScheduler;

  private taskQueue: PolicyTask[] = [];
  private runningTasks = new Map<string, PolicyTask>();
  private config: Required<PolicySchedulerConfig>;
  private taskIdCounter = 0;

  private constructor(config: PolicySchedulerConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 10,
      executionTimeout: config.executionTimeout ?? 30000, // 30秒
      enablePriorityQueue: config.enablePriorityQueue ?? true,
    };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: PolicySchedulerConfig): PolicyScheduler {
    if (!PolicyScheduler.instance) {
      PolicyScheduler.instance = new PolicyScheduler(config);
    }
    return PolicyScheduler.instance;
  }

  /**
   * 调度入站消息策略执行
   * 
   * @param message - 入站消息上下文
   * @param agentId - 智能助手ID
   * @param priority - 优先级（数字越大优先级越高）
   * @returns 策略处理结果
   */
  async scheduleInboundPolicy(
    message: InboundMessageContext,
    agentId: string,
    priority: number = 5,
  ): Promise<PolicyResult> {
    return new Promise((resolve, reject) => {
      const taskId = this.generateTaskId();
      const task: PolicyTask = {
        id: taskId,
        type: "inbound",
        message,
        agentId,
        priority,
        timestamp: Date.now(),
        resolve,
        reject,
      };

      // 添加到队列
      this.enqueueTask(task);

      // 尝试执行任务
      this.processNextTask();
    });
  }

  /**
   * 调度出站消息策略执行
   * 
   * @param message - 出站消息上下文
   * @param agentId - 智能助手ID
   * @param priority - 优先级（数字越大优先级越高）
   * @returns 策略处理结果
   */
  async scheduleOutboundPolicy(
    message: OutboundMessageContext,
    agentId: string,
    priority: number = 5,
  ): Promise<PolicyResult> {
    return new Promise((resolve, reject) => {
      const taskId = this.generateTaskId();
      const task: PolicyTask = {
        id: taskId,
        type: "outbound",
        message,
        agentId,
        priority,
        timestamp: Date.now(),
        resolve,
        reject,
      };

      // 添加到队列
      this.enqueueTask(task);

      // 尝试执行任务
      this.processNextTask();
    });
  }

  /**
   * 将任务加入队列
   */
  private enqueueTask(task: PolicyTask): void {
    this.taskQueue.push(task);

    // 如果启用了优先级队列，按优先级和时间戳排序
    if (this.config.enablePriorityQueue) {
      this.taskQueue.sort((a, b) => {
        // 优先级高的排在前面
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        // 优先级相同时，早到的排在前面
        return a.timestamp - b.timestamp;
      });
    }
  }

  /**
   * 处理下一个任务
   */
  private async processNextTask(): Promise<void> {
    // 如果达到最大并发数，等待
    if (this.runningTasks.size >= this.config.maxConcurrency) {
      return;
    }

    // 如果队列为空，返回
    if (this.taskQueue.length === 0) {
      return;
    }

    // 取出下一个任务
    const task = this.taskQueue.shift();
    if (!task) {
      return;
    }

    // 添加到运行中的任务
    this.runningTasks.set(task.id, task);

    // 设置超时
    task.timeout = setTimeout(() => {
      this.handleTaskTimeout(task);
    }, this.config.executionTimeout);

    // 执行任务
    try {
      let result: PolicyResult;

      if (task.type === "inbound") {
        result = await policyExecutor.executeInboundPolicy(
          task.message as InboundMessageContext,
          task.agentId,
        );
      } else {
        result = await policyExecutor.executeOutboundPolicy(
          task.message as OutboundMessageContext,
          task.agentId,
        );
      }

      // 清除超时
      if (task.timeout) {
        clearTimeout(task.timeout);
      }

      // 移除运行中的任务
      this.runningTasks.delete(task.id);

      // 返回结果
      task.resolve(result);

      // 继续处理下一个任务
      this.processNextTask();
    } catch (error) {
      // 清除超时
      if (task.timeout) {
        clearTimeout(task.timeout);
      }

      // 移除运行中的任务
      this.runningTasks.delete(task.id);

      // 返回错误
      task.reject(error instanceof Error ? error : new Error(String(error)));

      // 继续处理下一个任务
      this.processNextTask();
    }
  }

  /**
   * 处理任务超时
   */
  private handleTaskTimeout(task: PolicyTask): void {
    console.error(
      `[PolicyScheduler] Task ${task.id} timeout after ${this.config.executionTimeout}ms`,
    );

    // 移除运行中的任务
    this.runningTasks.delete(task.id);

    // 返回超时错误
    task.reject(new Error(`Policy execution timeout after ${this.config.executionTimeout}ms`));

    // 继续处理下一个任务
    this.processNextTask();
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `task-${++this.taskIdCounter}-${Date.now()}`;
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): {
    queueLength: number;
    runningTasks: number;
    maxConcurrency: number;
  } {
    return {
      queueLength: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      maxConcurrency: this.config.maxConcurrency,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PolicySchedulerConfig>): void {
    if (config.maxConcurrency !== undefined) {
      this.config.maxConcurrency = config.maxConcurrency;
    }
    if (config.executionTimeout !== undefined) {
      this.config.executionTimeout = config.executionTimeout;
    }
    if (config.enablePriorityQueue !== undefined) {
      this.config.enablePriorityQueue = config.enablePriorityQueue;
    }

    console.log("[PolicyScheduler] Config updated:", this.config);
  }

  /**
   * 清空队列（用于测试或紧急情况）
   */
  clearQueue(): void {
    // 拒绝所有待处理的任务
    for (const task of this.taskQueue) {
      task.reject(new Error("Queue cleared"));
    }

    this.taskQueue = [];
    console.log("[PolicyScheduler] Queue cleared");
  }

  /**
   * 取消运行中的任务
   */
  cancelRunningTasks(): void {
    // 清除所有超时
    for (const task of this.runningTasks.values()) {
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      task.reject(new Error("Task cancelled"));
    }

    this.runningTasks.clear();
    console.log("[PolicyScheduler] Running tasks cancelled");
  }
}

/**
 * 导出单例实例
 */
export const policyScheduler = PolicyScheduler.getInstance();
