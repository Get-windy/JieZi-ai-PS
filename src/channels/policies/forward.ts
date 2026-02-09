/**
 * Forward 策略处理器
 *
 * 功能：自动转发消息到其他通道
 */

import type { ForwardPolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class ForwardPolicyHandler implements PolicyHandler {
  readonly type = "forward";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "forward") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected forward`);
    }

    const config = binding.policy.config as ForwardPolicyConfig;
    const content = message.content || "";

    // 检查过滤关键词
    if (config.filterKeywords && config.filterKeywords.length > 0) {
      const hasKeyword = config.filterKeywords.some((keyword) =>
        content.toLowerCase().includes(keyword.toLowerCase()),
      );

      if (!hasKeyword) {
        // 不包含过滤关键词，不转发，允许正常处理
        return { allow: true };
      }
    }

    // 构建转发消息
    let forwardContent = content;

    // 添加消息前缀
    if (config.messagePrefix) {
      forwardContent = `${config.messagePrefix}${forwardContent}`;
    }

    // 构建转发结果
    const result: PolicyResult = {
      allow: false, // 转发后不再正常处理
      reason: "Message forwarded to other channels",
      routeTo: config.targetChannels.map((target) => ({
        channelId: target.channelId,
        accountId: target.accountId,
        to: target.to,
      })),
    };

    // 如果需要格式转换，添加转换后的消息
    if (config.formatConversion || config.messagePrefix) {
      result.transformedMessage = {
        content: forwardContent,
        type: message.type,
        attachments: message.attachments,
        metadata: {
          ...message.metadata,
          forwarded: true,
          originalChannel: context.channelId,
          originalAccount: context.accountId,
        },
      };
    }

    // 如果配置了延迟，添加到元数据
    if (config.delayMs) {
      result.metadata = {
        ...result.metadata,
        delayMs: config.delayMs,
      };
    }

    return result;
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (!Array.isArray(config.targetChannels)) {
      errors.push("targetChannels must be an array");
    } else if (config.targetChannels.length === 0) {
      errors.push("targetChannels cannot be empty");
    } else {
      // 验证每个目标通道
      config.targetChannels.forEach((target: any, index: number) => {
        if (!target.channelId) {
          errors.push(`targetChannels[${index}].channelId is required`);
        }
        if (!target.accountId) {
          errors.push(`targetChannels[${index}].accountId is required`);
        }
      });
    }

    if (config.filterKeywords !== undefined && !Array.isArray(config.filterKeywords)) {
      errors.push("filterKeywords must be an array");
    }

    if (config.messagePrefix !== undefined && typeof config.messagePrefix !== "string") {
      errors.push("messagePrefix must be a string");
    }

    if (config.formatConversion !== undefined && typeof config.formatConversion !== "boolean") {
      errors.push("formatConversion must be a boolean");
    }

    if (config.delayMs !== undefined) {
      if (typeof config.delayMs !== "number") {
        errors.push("delayMs must be a number");
      } else if (config.delayMs < 0) {
        errors.push("delayMs must be non-negative");
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
