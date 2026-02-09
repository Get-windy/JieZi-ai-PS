/**
 * SmartRoute 策略处理器
 *
 * 功能：根据内容智能选择通道
 */

import type { SmartRoutePolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class SmartRoutePolicyHandler implements PolicyHandler {
  readonly type = "smart-route";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "smart-route") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected smart-route`);
    }

    const config = binding.policy.config as SmartRoutePolicyConfig;
    const content = message.content || "";

    // 按顺序匹配路由规则
    for (const rule of config.routingRules) {
      if (this.matchesRule(message, content, rule.condition)) {
        // 匹配成功，路由到目标通道
        return {
          allow: false,
          reason: `Routed by rule: ${rule.name}`,
          routeTo: [
            {
              channelId: rule.targetChannel.channelId,
              accountId: rule.targetChannel.accountId,
            },
          ],
          metadata: {
            routingRule: rule.name,
            matchedCondition: rule.condition,
          },
        };
      }
    }

    // 没有匹配的规则，使用默认目标
    if (config.defaultTarget) {
      return {
        allow: false,
        reason: "Routed to default target (no rules matched)",
        routeTo: [
          {
            channelId: config.defaultTarget.channelId,
            accountId: config.defaultTarget.accountId,
          },
        ],
        metadata: {
          routingRule: "default",
        },
      };
    }

    // 没有默认目标，允许正常处理
    return {
      allow: true,
      metadata: {
        routingRule: "none",
      },
    };
  }

  private matchesRule(
    message: any,
    content: string,
    condition: SmartRoutePolicyConfig["routingRules"][0]["condition"],
  ): boolean {
    const lowerContent = content.toLowerCase();

    // 检查关键词匹配
    if (condition.keywords && condition.keywords.length > 0) {
      const hasKeyword = condition.keywords.some((keyword) =>
        lowerContent.includes(keyword.toLowerCase()),
      );

      if (!hasKeyword) {
        return false;
      }
    }

    // 检查情感分析
    if (condition.sentiment) {
      const sentiment = this.analyzeSentiment(content);
      if (sentiment !== condition.sentiment) {
        return false;
      }
    }

    // 检查消息长度范围
    if (condition.lengthRange) {
      const length = content.length;

      if (condition.lengthRange.min !== undefined && length < condition.lengthRange.min) {
        return false;
      }

      if (condition.lengthRange.max !== undefined && length > condition.lengthRange.max) {
        return false;
      }
    }

    // 检查发送者类型
    if (condition.senderType) {
      const senderType = this.detectSenderType(message);
      if (senderType !== condition.senderType) {
        return false;
      }
    }

    // 所有条件都匹配
    return true;
  }

  private analyzeSentiment(content: string): "positive" | "negative" | "neutral" {
    // 简单的情感分析实现
    // 实际应用中应该使用更复杂的 NLP 库
    const positiveWords = ["好", "棒", "赞", "优秀", "喜欢", "满意", "感谢", "谢谢"];
    const negativeWords = ["差", "烂", "糟", "失望", "讨厌", "不满", "抱怨", "投诉"];

    const lowerContent = content.toLowerCase();

    const positiveCount = positiveWords.filter((word) => lowerContent.includes(word)).length;
    const negativeCount = negativeWords.filter((word) => lowerContent.includes(word)).length;

    if (positiveCount > negativeCount) {
      return "positive";
    } else if (negativeCount > positiveCount) {
      return "negative";
    } else {
      return "neutral";
    }
  }

  private detectSenderType(message: any): "human" | "bot" | "system" {
    // 简单的发送者类型检测
    // 实际应用中应该根据实际的消息元数据判断

    if (message.metadata?.senderType) {
      return message.metadata.senderType;
    }

    // 默认假设是人类
    return "human";
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (!Array.isArray(config.routingRules)) {
      errors.push("routingRules must be an array");
    } else if (config.routingRules.length === 0) {
      errors.push("routingRules cannot be empty");
    } else {
      // 验证每个路由规则
      config.routingRules.forEach((rule: any, index: number) => {
        if (!rule.name) {
          errors.push(`routingRules[${index}].name is required`);
        }

        if (!rule.condition) {
          errors.push(`routingRules[${index}].condition is required`);
        }

        if (!rule.targetChannel) {
          errors.push(`routingRules[${index}].targetChannel is required`);
        } else {
          if (!rule.targetChannel.channelId) {
            errors.push(`routingRules[${index}].targetChannel.channelId is required`);
          }
          if (!rule.targetChannel.accountId) {
            errors.push(`routingRules[${index}].targetChannel.accountId is required`);
          }
        }

        // 验证条件
        if (rule.condition) {
          if (
            rule.condition.sentiment &&
            !["positive", "negative", "neutral"].includes(rule.condition.sentiment)
          ) {
            errors.push(
              `routingRules[${index}].condition.sentiment must be one of: positive, negative, neutral`,
            );
          }

          if (
            rule.condition.senderType &&
            !["human", "bot", "system"].includes(rule.condition.senderType)
          ) {
            errors.push(
              `routingRules[${index}].condition.senderType must be one of: human, bot, system`,
            );
          }
        }
      });
    }

    if (config.defaultTarget) {
      if (!config.defaultTarget.channelId) {
        errors.push("defaultTarget.channelId is required");
      }
      if (!config.defaultTarget.accountId) {
        errors.push("defaultTarget.accountId is required");
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
