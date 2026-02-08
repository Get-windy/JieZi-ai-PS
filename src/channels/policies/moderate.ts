/**
 * Moderate 策略处理器
 *
 * 功能：消息需要审核后才发送
 */

import type { ModeratePolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";
import type { OutboundMessageContext } from "./types.js";

/**
 * 待审核消息
 */
type PendingMessage = {
  id: string;
  message: OutboundMessageContext;
  context: PolicyProcessContext;
  submittedAt: number;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: number;
  reviewComment?: string;
};

export class ModeratePolicyHandler implements PolicyHandler {
  readonly type = "moderate";

  // 待审核消息队列（按绑定ID分组）
  private pendingMessages = new Map<string, Map<string, PendingMessage>>();

  // 超时定时器（按消息ID分组）
  private timeoutTimers = new Map<string, NodeJS.Timeout>();

  // 审核通知回调（由外部设置）
  private notifyCallback?: (message: PendingMessage, moderators: string[]) => Promise<void>;

  // 批准/拒绝回调（由外部设置）
  private actionCallback?: (message: PendingMessage, approved: boolean) => Promise<void>;

  /**
   * 设置审核通知回调
   */
  setNotifyCallback(
    callback: (message: PendingMessage, moderators: string[]) => Promise<void>,
  ): void {
    this.notifyCallback = callback;
  }

  /**
   * 设置审核动作回调
   */
  setActionCallback(callback: (message: PendingMessage, approved: boolean) => Promise<void>): void {
    this.actionCallback = callback;
  }

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "moderate") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected moderate`);
    }

    const config = binding.policy.config as ModeratePolicyConfig;

    // 只处理出站消息
    if ("from" in message) {
      return { allow: true };
    }

    const outboundMessage = message as OutboundMessageContext;

    // 检查是否自动批准
    if (this.shouldAutoApprove(outboundMessage, config)) {
      return { allow: true };
    }

    // 创建待审核消息
    const messageId = outboundMessage.messageId;
    const pendingMessage: PendingMessage = {
      id: messageId,
      message: outboundMessage,
      context,
      submittedAt: Date.now(),
      status: "pending",
    };

    // 加入待审核队列
    if (!this.pendingMessages.has(binding.id)) {
      this.pendingMessages.set(binding.id, new Map());
    }
    this.pendingMessages.get(binding.id)!.set(messageId, pendingMessage);

    // 通知审核者
    if (this.notifyCallback) {
      await this.notifyCallback(pendingMessage, config.moderators);
    }

    // 设置超时
    if (config.timeout) {
      this.scheduleTimeout(messageId, binding.id, config);
    }

    return {
      allow: false,
      reason: "Message pending moderation",
      metadata: {
        messageId,
        status: "pending",
        moderators: config.moderators,
      },
    };
  }

  /**
   * 检查是否应该自动批准
   */
  private shouldAutoApprove(
    message: OutboundMessageContext,
    config: ModeratePolicyConfig,
  ): boolean {
    const rules = config.autoApproveRules;
    if (!rules) return false;

    // 检查发送者
    if (rules.allowedSenders && !rules.allowedSenders.includes(message.to)) {
      return false;
    }

    // 检查消息长度
    if (rules.maxLength && message.content.length > rules.maxLength) {
      return false;
    }

    // 检查消息模式
    if (rules.allowedPatterns) {
      const matchesPattern = rules.allowedPatterns.some((pattern) => {
        const regex = new RegExp(pattern);
        return regex.test(message.content);
      });
      if (!matchesPattern) return false;
    }

    // 检查敏感词
    if (config.sensitiveWords && config.sensitiveWords.length > 0) {
      const hasSensitiveWord = config.sensitiveWords.some((word) =>
        message.content.toLowerCase().includes(word.toLowerCase()),
      );
      if (hasSensitiveWord) return false;
    }

    return true;
  }

  /**
   * 设置超时定时器
   */
  private scheduleTimeout(
    messageId: string,
    bindingId: string,
    config: ModeratePolicyConfig,
  ): void {
    const timer = setTimeout(async () => {
      await this.handleTimeout(messageId, bindingId, config);
    }, config.timeout! * 1000);

    this.timeoutTimers.set(messageId, timer);
  }

  /**
   * 处理超时
   */
  private async handleTimeout(
    messageId: string,
    bindingId: string,
    config: ModeratePolicyConfig,
  ): Promise<void> {
    const messages = this.pendingMessages.get(bindingId);
    if (!messages) return;

    const pendingMessage = messages.get(messageId);
    if (!pendingMessage || pendingMessage.status !== "pending") {
      return;
    }

    const defaultAction = config.defaultAction || "reject";

    if (defaultAction === "approve") {
      await this.approve(bindingId, messageId, "system", "Auto-approved due to timeout");
    } else {
      await this.reject(bindingId, messageId, "system", "Auto-rejected due to timeout");
    }
  }

  /**
   * 批准消息
   */
  async approve(
    bindingId: string,
    messageId: string,
    reviewedBy: string,
    comment?: string,
  ): Promise<void> {
    const messages = this.pendingMessages.get(bindingId);
    if (!messages) return;

    const pendingMessage = messages.get(messageId);
    if (!pendingMessage || pendingMessage.status !== "pending") {
      return;
    }

    pendingMessage.status = "approved";
    pendingMessage.reviewedBy = reviewedBy;
    pendingMessage.reviewedAt = Date.now();
    pendingMessage.reviewComment = comment;

    // 清除超时定时器
    const timer = this.timeoutTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(messageId);
    }

    // 调用批准回调
    if (this.actionCallback) {
      await this.actionCallback(pendingMessage, true);
    }

    // 从待审核队列移除
    messages.delete(messageId);
  }

  /**
   * 拒绝消息
   */
  async reject(
    bindingId: string,
    messageId: string,
    reviewedBy: string,
    comment?: string,
  ): Promise<void> {
    const messages = this.pendingMessages.get(bindingId);
    if (!messages) return;

    const pendingMessage = messages.get(messageId);
    if (!pendingMessage || pendingMessage.status !== "pending") {
      return;
    }

    pendingMessage.status = "rejected";
    pendingMessage.reviewedBy = reviewedBy;
    pendingMessage.reviewedAt = Date.now();
    pendingMessage.reviewComment = comment;

    // 清除超时定时器
    const timer = this.timeoutTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(messageId);
    }

    // 调用拒绝回调
    if (this.actionCallback) {
      await this.actionCallback(pendingMessage, false);
    }

    // 从待审核队列移除
    messages.delete(messageId);
  }

  /**
   * 获取待审核消息列表
   */
  getPendingMessages(bindingId: string): PendingMessage[] {
    const messages = this.pendingMessages.get(bindingId);
    if (!messages) return [];
    return Array.from(messages.values()).filter((m) => m.status === "pending");
  }

  /**
   * 清理资源
   */
  dispose(): void {
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.timeoutTimers.clear();
    this.pendingMessages.clear();
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (!Array.isArray(config.moderators)) {
      errors.push("moderators must be an array");
    } else if (config.moderators.length === 0) {
      errors.push("moderators cannot be empty");
    } else if (!config.moderators.every((id: any) => typeof id === "string")) {
      errors.push("All moderators must be strings");
    }

    if (config.autoApproveRules !== undefined) {
      if (typeof config.autoApproveRules !== "object") {
        errors.push("autoApproveRules must be an object");
      } else {
        const rules = config.autoApproveRules;

        if (rules.allowedSenders !== undefined && !Array.isArray(rules.allowedSenders)) {
          errors.push("autoApproveRules.allowedSenders must be an array");
        }

        if (rules.allowedPatterns !== undefined && !Array.isArray(rules.allowedPatterns)) {
          errors.push("autoApproveRules.allowedPatterns must be an array");
        }

        if (
          rules.maxLength !== undefined &&
          (typeof rules.maxLength !== "number" || rules.maxLength <= 0)
        ) {
          errors.push("autoApproveRules.maxLength must be a positive number");
        }
      }
    }

    if (config.sensitiveWords !== undefined && !Array.isArray(config.sensitiveWords)) {
      errors.push("sensitiveWords must be an array");
    }

    if (
      config.timeout !== undefined &&
      (typeof config.timeout !== "number" || config.timeout <= 0)
    ) {
      errors.push("timeout must be a positive number");
    }

    const validDefaultActions = ["approve", "reject"];
    if (config.defaultAction !== undefined && !validDefaultActions.includes(config.defaultAction)) {
      errors.push(`defaultAction must be one of: ${validDefaultActions.join(", ")}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
