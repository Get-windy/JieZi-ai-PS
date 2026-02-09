/**
 * Broadcast 策略处理器
 *
 * 功能：一条消息发送到多个通道（广播模式）
 */

import type { BroadcastPolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class BroadcastPolicyHandler implements PolicyHandler {
  readonly type = "broadcast";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "broadcast") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected broadcast`);
    }

    const config = binding.policy.config as BroadcastPolicyConfig;

    // 构建广播结果
    const result: PolicyResult = {
      allow: false, // 广播后不再正常处理
      reason: "Message broadcasted to multiple channels",
      routeTo: config.targetChannels.map((target) => ({
        channelId: target.channelId,
        accountId: target.accountId,
      })),
    };

    // 添加广播元数据
    result.metadata = {
      broadcast: true,
      concurrent: config.concurrent !== false, // 默认并发
      intervalMs: config.intervalMs || 0,
      retryCount: config.retryCount || 0,
      totalTargets: config.targetChannels.length,
    };

    // 如果需要格式转换
    if (config.formatConversion) {
      result.transformedMessage = {
        content: message.content,
        type: message.type,
        attachments: message.attachments,
        metadata: {
          ...message.metadata,
          broadcasted: true,
          originalChannel: context.channelId,
          originalAccount: context.accountId,
          broadcastTime: Date.now(),
        },
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

    if (config.concurrent !== undefined && typeof config.concurrent !== "boolean") {
      errors.push("concurrent must be a boolean");
    }

    if (config.intervalMs !== undefined) {
      if (typeof config.intervalMs !== "number") {
        errors.push("intervalMs must be a number");
      } else if (config.intervalMs < 0) {
        errors.push("intervalMs must be non-negative");
      }
    }

    if (config.retryCount !== undefined) {
      if (typeof config.retryCount !== "number") {
        errors.push("retryCount must be a number");
      } else if (config.retryCount < 0) {
        errors.push("retryCount must be non-negative");
      }
    }

    if (config.formatConversion !== undefined && typeof config.formatConversion !== "boolean") {
      errors.push("formatConversion must be a boolean");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
