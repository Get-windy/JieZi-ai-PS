/**
 * Filter 策略处理器
 *
 * 功能：基于规则过滤消息
 */

import type { FilterPolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class FilterPolicyHandler implements PolicyHandler {
  readonly type = "filter";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "filter") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected filter`);
    }

    const config = binding.policy.config as FilterPolicyConfig;
    const senderId = "from" in message ? message.from : undefined;
    const content = message.content || "";

    // 检查发送者过滤
    if (senderId) {
      if (config.denySenders && config.denySenders.includes(senderId)) {
        return this.handleFiltered(config, "Sender is in deny list");
      }

      if (config.allowSenders && !config.allowSenders.includes(senderId)) {
        return this.handleFiltered(config, "Sender is not in allow list");
      }
    }

    // 检查关键词过滤
    const keywordMatch = this.checkKeywords(content, config);
    if (!keywordMatch.allowed) {
      return this.handleFiltered(config, keywordMatch.reason || "Keyword filter failed");
    }

    // 检查时间范围
    if (config.timeRange) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      if (currentTime < config.timeRange.start || currentTime > config.timeRange.end) {
        return this.handleFiltered(config, "Outside of allowed time range");
      }
    }

    // 通过所有过滤规则
    return { allow: true };
  }

  private checkKeywords(
    content: string,
    config: FilterPolicyConfig,
  ): { allowed: boolean; reason?: string } {
    const lowerContent = content.toLowerCase();

    // 检查拒绝关键词
    if (config.denyKeywords && config.denyKeywords.length > 0) {
      const hasDenyKeyword = config.denyKeywords.some((keyword) =>
        lowerContent.includes(keyword.toLowerCase()),
      );

      if (hasDenyKeyword) {
        return { allowed: false, reason: "Contains denied keyword" };
      }
    }

    // 检查允许关键词
    if (config.allowKeywords && config.allowKeywords.length > 0) {
      const matchMode = config.matchMode || "any";

      if (matchMode === "all") {
        // 必须匹配所有关键词
        const matchesAll = config.allowKeywords.every((keyword) =>
          lowerContent.includes(keyword.toLowerCase()),
        );

        if (!matchesAll) {
          return { allowed: false, reason: "Does not match all required keywords" };
        }
      } else {
        // 匹配任意一个关键词即可
        const matchesAny = config.allowKeywords.some((keyword) =>
          lowerContent.includes(keyword.toLowerCase()),
        );

        if (!matchesAny) {
          return { allowed: false, reason: "Does not match any allowed keyword" };
        }
      }
    }

    return { allowed: true };
  }

  private handleFiltered(config: FilterPolicyConfig, reason: string): PolicyResult {
    const action = config.onFilteredAction || "drop";

    switch (action) {
      case "drop":
        return {
          allow: false,
          reason: `Message filtered: ${reason}`,
        };

      case "forward":
        if (config.forwardTo) {
          return {
            allow: false,
            reason: `Message filtered: ${reason}`,
            routeTo: [
              {
                channelId: config.forwardTo.channelId,
                accountId: config.forwardTo.accountId,
              },
            ],
          };
        }
        return {
          allow: false,
          reason: `Message filtered: ${reason} (no forward target configured)`,
        };

      case "archive":
        // TODO: 实现归档功能
        return {
          allow: false,
          reason: `Message filtered and archived: ${reason}`,
        };

      case "notify":
        // TODO: 实现通知功能
        return {
          allow: false,
          reason: `Message filtered: ${reason}`,
          metadata: { notifyRequired: true },
        };

      default:
        return {
          allow: false,
          reason: `Message filtered: ${reason}`,
        };
    }
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (config.allowKeywords !== undefined && !Array.isArray(config.allowKeywords)) {
      errors.push("allowKeywords must be an array");
    }

    if (config.denyKeywords !== undefined && !Array.isArray(config.denyKeywords)) {
      errors.push("denyKeywords must be an array");
    }

    if (config.allowSenders !== undefined && !Array.isArray(config.allowSenders)) {
      errors.push("allowSenders must be an array");
    }

    if (config.denySenders !== undefined && !Array.isArray(config.denySenders)) {
      errors.push("denySenders must be an array");
    }

    if (config.matchMode && !["all", "any"].includes(config.matchMode)) {
      errors.push("matchMode must be 'all' or 'any'");
    }

    if (
      config.onFilteredAction &&
      !["drop", "forward", "archive", "notify"].includes(config.onFilteredAction)
    ) {
      errors.push("onFilteredAction must be one of: drop, forward, archive, notify");
    }

    if (config.onFilteredAction === "forward" && !config.forwardTo) {
      errors.push("forwardTo is required when onFilteredAction is 'forward'");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
