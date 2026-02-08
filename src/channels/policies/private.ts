/**
 * Private 策略处理器
 *
 * 功能：只允许指定用户访问，其他用户自动拒绝
 */

import type { PrivatePolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class PrivatePolicyHandler implements PolicyHandler {
  readonly type = "private";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "private") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected private`);
    }

    const config = binding.policy.config as PrivatePolicyConfig;
    const senderId = "from" in message ? message.from : undefined;

    // 检查是否为出站消息
    if (!senderId) {
      // 出站消息不需要检查权限
      return { allow: true };
    }

    // 检查发送者是否在允许列表中
    const isAllowed = config.allowedUsers.includes(senderId);

    if (isAllowed) {
      return { allow: true };
    }

    // 未授权用户
    return {
      allow: false,
      reason: "User not authorized for this private channel",
      autoReply: config.unauthorizedReply || "This is a private channel. Access denied.",
    };
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (!Array.isArray(config.allowedUsers)) {
      errors.push("allowedUsers must be an array");
    } else if (config.allowedUsers.length === 0) {
      errors.push("allowedUsers cannot be empty");
    } else if (!config.allowedUsers.every((id: any) => typeof id === "string")) {
      errors.push("All allowedUsers must be strings");
    }

    if (config.unauthorizedReply && typeof config.unauthorizedReply !== "string") {
      errors.push("unauthorizedReply must be a string");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
