/**
 * Queue 策略处理器
 *
 * 功能：消息排队，批量处理
 */

import type { QueuePolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";
import type { InboundMessageContext } from "./types.js";

/**
 * 队列消息项
 */
type QueuedMessage = {
  message: InboundMessageContext;
  context: PolicyProcessContext;
  enqueuedAt: number;
};

export class QueuePolicyHandler implements PolicyHandler {
  readonly type = "queue";

  // 消息队列（按绑定ID分组）
  private queues = new Map<string, QueuedMessage[]>();

  // 批处理定时器（按绑定ID分组）
  private batchTimers = new Map<string, NodeJS.Timeout>();

  // 处理回调（由外部设置）
  private processCallback?: (messages: QueuedMessage[]) => Promise<void>;

  /**
   * 设置批处理回调
   */
  setProcessCallback(callback: (messages: QueuedMessage[]) => Promise<void>): void {
    this.processCallback = callback;
  }

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "queue") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected queue`);
    }

    const config = binding.policy.config as QueuePolicyConfig;

    // 只处理入站消息
    if (!("from" in message)) {
      return { allow: true };
    }

    // 初始化队列
    if (!this.queues.has(binding.id)) {
      this.queues.set(binding.id, []);
    }

    const queue = this.queues.get(binding.id)!;

    // 检查队列是否已满
    if (queue.length >= config.maxQueueSize) {
      switch (config.overflowAction) {
        case "reject":
          return {
            allow: false,
            reason: "Queue is full - message rejected",
            autoReply: "Sorry, the system is busy. Please try again later.",
          };

        case "drop-oldest":
          queue.shift(); // 移除最旧的消息
          break;

        case "drop-newest":
          return {
            allow: false,
            reason: "Queue is full - newest message dropped",
            autoReply: "Sorry, the system is busy. Please try again later.",
          };
      }
    }

    // 将消息加入队列
    queue.push({
      message: message as InboundMessageContext,
      context,
      enqueuedAt: Date.now(),
    });

    // 启动批处理定时器
    this.scheduleBatchProcessing(binding.id, config);

    return {
      allow: false,
      reason: "Message queued for batch processing",
      autoReply: "Your message has been received and will be processed shortly.",
    };
  }

  /**
   * 调度批处理
   */
  private scheduleBatchProcessing(bindingId: string, config: QueuePolicyConfig): void {
    // 如果已有定时器，不重复创建
    if (this.batchTimers.has(bindingId)) {
      return;
    }

    const timer = setInterval(async () => {
      await this.processBatch(bindingId, config);
    }, config.batchInterval * 1000);

    this.batchTimers.set(bindingId, timer);
  }

  /**
   * 处理批次
   */
  private async processBatch(bindingId: string, config: QueuePolicyConfig): Promise<void> {
    const queue = this.queues.get(bindingId);
    if (!queue || queue.length === 0) {
      return;
    }

    // 取出批次大小的消息
    const batch = queue.splice(0, config.batchSize);

    // 调用处理回调
    if (this.processCallback) {
      try {
        await this.processCallback(batch);
      } catch (error) {
        console.error("Failed to process batch:", error);
        // 将失败的消息重新放回队列头部
        queue.unshift(...batch);
      }
    }
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(bindingId: string): {
    size: number;
    oldestMessageAge: number | null;
  } {
    const queue = this.queues.get(bindingId);
    if (!queue || queue.length === 0) {
      return { size: 0, oldestMessageAge: null };
    }

    const now = Date.now();
    const oldestMessage = queue[0];
    const age = now - oldestMessage.enqueuedAt;

    return {
      size: queue.length,
      oldestMessageAge: age,
    };
  }

  /**
   * 清空队列
   */
  clearQueue(bindingId: string): void {
    const queue = this.queues.get(bindingId);
    if (queue) {
      queue.length = 0;
    }
  }

  /**
   * 停止批处理
   */
  stopBatchProcessing(bindingId: string): void {
    const timer = this.batchTimers.get(bindingId);
    if (timer) {
      clearInterval(timer);
      this.batchTimers.delete(bindingId);
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    for (const timer of this.batchTimers.values()) {
      clearInterval(timer);
    }
    this.batchTimers.clear();
    this.queues.clear();
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (typeof config.maxQueueSize !== "number" || config.maxQueueSize <= 0) {
      errors.push("maxQueueSize must be a positive number");
    }

    if (typeof config.batchInterval !== "number" || config.batchInterval <= 0) {
      errors.push("batchInterval must be a positive number");
    }

    if (typeof config.batchSize !== "number" || config.batchSize <= 0) {
      errors.push("batchSize must be a positive number");
    }

    const validOverflowActions = ["reject", "drop-oldest", "drop-newest"];
    if (!validOverflowActions.includes(config.overflowAction)) {
      errors.push(`overflowAction must be one of: ${validOverflowActions.join(", ")}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
