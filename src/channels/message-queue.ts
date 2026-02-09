/**
 * Phase 2: 消息队列和批处理系统
 *
 * 支持通道策略中的队列模式，提供：
 * - 消息队列管理
 * - 批量处理
 * - 优先级队列
 * - 重试机制
 * - 持久化存储
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

/**
 * 消息优先级
 */
export type MessagePriority = "low" | "normal" | "high" | "urgent";

/**
 * 队列消息
 */
export interface QueuedMessage {
  /** 消息ID */
  id: string;

  /** 通道ID */
  channelId: string;

  /** 账号ID */
  accountId: string;

  /** 智能助手ID */
  agentId: string;

  /** 消息内容 */
  content: any;

  /** 优先级 */
  priority: MessagePriority;

  /** 创建时间 */
  createdAt: number;

  /** 过期时间 */
  expiresAt?: number;

  /** 重试次数 */
  retryCount: number;

  /** 最大重试次数 */
  maxRetries: number;

  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 批处理配置
 */
export interface BatchConfig {
  /** 批处理大小 */
  batchSize: number;

  /** 批处理间隔（毫秒） */
  intervalMs: number;

  /** 最大等待时间（毫秒） */
  maxWaitMs: number;
}

/**
 * 队列统计信息
 */
export interface QueueStats {
  /** 队列中的消息数 */
  pending: number;

  /** 处理中的消息数 */
  processing: number;

  /** 已完成的消息数 */
  completed: number;

  /** 失败的消息数 */
  failed: number;

  /** 平均处理时间（毫秒） */
  avgProcessingTime: number;
}

/**
 * 消息处理器
 */
export type MessageHandler = (messages: QueuedMessage[]) => Promise<void>;

/**
 * 消息队列管理器
 */
export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing: Set<string> = new Set();
  private completed: Map<string, number> = new Map(); // messageId -> completedAt
  private failed: Map<string, Error> = new Map(); // messageId -> error
  private handlers: Map<string, MessageHandler> = new Map(); // queueId -> handler
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private storageDir: string;
  private persistenceEnabled: boolean = true;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || path.join(os.homedir(), ".openclaw", "message-queue");
    this.ensureStorageDir();
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error("[Message Queue] Failed to create storage directory:", error);
    }
  }

  /**
   * 获取队列存储路径
   */
  private getQueuePath(queueId: string): string {
    return path.join(this.storageDir, `${queueId}.json`);
  }

  /**
   * 加载持久化队列
   */
  private async loadQueue(queueId: string): Promise<QueuedMessage[]> {
    if (!this.persistenceEnabled) return [];

    const queuePath = this.getQueuePath(queueId);
    try {
      const content = await fs.readFile(queuePath, "utf-8");
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      console.error(`[Message Queue] Failed to load queue ${queueId}:`, error);
      return [];
    }
  }

  /**
   * 保存队列到持久化存储
   */
  private async saveQueue(queueId: string, messages: QueuedMessage[]): Promise<void> {
    if (!this.persistenceEnabled) return;

    const queuePath = this.getQueuePath(queueId);
    try {
      await fs.writeFile(queuePath, JSON.stringify(messages, null, 2), "utf-8");
    } catch (error) {
      console.error(`[Message Queue] Failed to save queue ${queueId}:`, error);
    }
  }

  /**
   * 入队消息
   */
  async enqueue(message: QueuedMessage, queueId: string = "default"): Promise<void> {
    // 检查消息是否已过期
    if (message.expiresAt && message.expiresAt < Date.now()) {
      console.warn(`[Message Queue] Message ${message.id} expired, not enqueuing`);
      return;
    }

    // 添加到队列
    this.queue.push(message);

    // 按优先级排序（urgent > high > normal > low）
    this.sortQueue();

    // 持久化
    await this.saveQueue(queueId, this.queue);

    console.log(`[Message Queue] Enqueued message ${message.id} with priority ${message.priority}`);

    // 触发批处理检查
    this.checkBatch(queueId);
  }

  /**
   * 批量入队
   */
  async enqueueBatch(messages: QueuedMessage[], queueId: string = "default"): Promise<void> {
    const validMessages = messages.filter((msg) => !msg.expiresAt || msg.expiresAt >= Date.now());

    this.queue.push(...validMessages);
    this.sortQueue();
    await this.saveQueue(queueId, this.queue);

    console.log(`[Message Queue] Enqueued ${validMessages.length} messages in batch`);
    this.checkBatch(queueId);
  }

  /**
   * 排序队列（按优先级）
   */
  private sortQueue(): void {
    const priorityOrder: Record<MessagePriority, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    this.queue.sort((a, b) => {
      // 先按优先级
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // 相同优先级按时间
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * 注册批处理器
   */
  registerHandler(queueId: string, handler: MessageHandler, config: BatchConfig): void {
    this.handlers.set(queueId, handler);

    // 设置批处理定时器
    if (this.batchTimers.has(queueId)) {
      clearInterval(this.batchTimers.get(queueId)!);
    }

    const timer = setInterval(() => {
      this.processBatch(queueId, config);
    }, config.intervalMs);

    this.batchTimers.set(queueId, timer);
    console.log(`[Message Queue] Registered handler for queue ${queueId}`);
  }

  /**
   * 检查是否需要触发批处理
   */
  private checkBatch(queueId: string): void {
    const handler = this.handlers.get(queueId);
    if (!handler) return;

    // 简单实现：如果队列中有消息，触发一次处理检查
    // 实际的批处理由定时器控制
  }

  /**
   * 处理一批消息
   */
  private async processBatch(queueId: string, config: BatchConfig): Promise<void> {
    const handler = this.handlers.get(queueId);
    if (!handler) return;

    // 获取待处理消息
    const batch = this.dequeueBatch(config.batchSize);
    if (batch.length === 0) return;

    // 标记为处理中
    batch.forEach((msg) => this.processing.add(msg.id));

    console.log(`[Message Queue] Processing batch of ${batch.length} messages`);

    try {
      const startTime = Date.now();
      await handler(batch);
      const processingTime = Date.now() - startTime;

      // 标记完成
      batch.forEach((msg) => {
        this.processing.delete(msg.id);
        this.completed.set(msg.id, Date.now());
      });

      console.log(`[Message Queue] Batch processed successfully in ${processingTime}ms`);
    } catch (error) {
      console.error("[Message Queue] Batch processing failed:", error);

      // 重试逻辑
      for (const msg of batch) {
        this.processing.delete(msg.id);

        if (msg.retryCount < msg.maxRetries) {
          msg.retryCount++;
          this.queue.unshift(msg); // 重新放回队列头部
          console.log(
            `[Message Queue] Retrying message ${msg.id} (${msg.retryCount}/${msg.maxRetries})`,
          );
        } else {
          this.failed.set(msg.id, error as Error);
          console.error(`[Message Queue] Message ${msg.id} failed after ${msg.maxRetries} retries`);
        }
      }

      await this.saveQueue(queueId, this.queue);
    }
  }

  /**
   * 出队一批消息
   */
  private dequeueBatch(batchSize: number): QueuedMessage[] {
    const now = Date.now();
    const batch: QueuedMessage[] = [];

    // 过滤并取出消息
    const remaining: QueuedMessage[] = [];

    for (const msg of this.queue) {
      // 跳过已过期的消息
      if (msg.expiresAt && msg.expiresAt < now) {
        console.warn(`[Message Queue] Message ${msg.id} expired, skipping`);
        continue;
      }

      // 跳过正在处理的消息
      if (this.processing.has(msg.id)) {
        remaining.push(msg);
        continue;
      }

      if (batch.length < batchSize) {
        batch.push(msg);
      } else {
        remaining.push(msg);
      }
    }

    this.queue = remaining;
    return batch;
  }

  /**
   * 获取队列统计信息
   */
  getStats(): QueueStats {
    const completedTimes = Array.from(this.completed.values());
    const avgTime =
      completedTimes.length > 0
        ? completedTimes.reduce((sum, time) => sum + time, 0) / completedTimes.length
        : 0;

    return {
      pending: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.size,
      failed: this.failed.size,
      avgProcessingTime: avgTime,
    };
  }

  /**
   * 获取队列中的所有消息
   */
  getMessages(): QueuedMessage[] {
    return [...this.queue];
  }

  /**
   * 清空队列
   */
  async clear(queueId: string = "default"): Promise<void> {
    this.queue = [];
    this.processing.clear();
    await this.saveQueue(queueId, []);
    console.log(`[Message Queue] Queue ${queueId} cleared`);
  }

  /**
   * 停止所有批处理器
   */
  shutdown(): void {
    for (const timer of this.batchTimers.values()) {
      clearInterval(timer);
    }
    this.batchTimers.clear();
    console.log("[Message Queue] All batch processors stopped");
  }

  /**
   * 启用/禁用持久化
   */
  setPersistence(enabled: boolean): void {
    this.persistenceEnabled = enabled;
  }
}

/**
 * 全局消息队列实例
 */
export const messageQueue = new MessageQueue();
