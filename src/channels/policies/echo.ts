/**
 * Echo 策略处理器
 *
 * 功能：仅记录日志，不处理消息
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { EchoPolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class EchoPolicyHandler implements PolicyHandler {
  readonly type = "echo";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding, channelId, accountId } = context;

    if (binding.policy.type !== "echo") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected echo`);
    }

    const config = binding.policy.config as EchoPolicyConfig;

    // 记录日志
    await this.logMessage(config, {
      timestamp: message.timestamp,
      channelId,
      accountId,
      messageId: message.messageId,
      from: "from" in message ? message.from : undefined,
      to: message.to,
      content: message.content,
      type: message.type,
      attachments: message.attachments,
      metadata: message.metadata,
    });

    // Echo 模式：阻止消息处理
    return {
      allow: false,
      reason: "Echo mode - message logged but not processed",
    };
  }

  private async logMessage(config: EchoPolicyConfig, data: any): Promise<void> {
    try {
      const logDir = dirname(config.logPath);
      if (!existsSync(logDir)) {
        await mkdir(logDir, { recursive: true });
      }

      const logLevel = config.logLevel.toUpperCase();
      const logEntry = `[${logLevel}] ${new Date(data.timestamp).toISOString()} ${JSON.stringify(data)}\n`;

      await appendFile(config.logPath, logEntry, "utf-8");
    } catch (error) {
      console.error("Failed to log message:", error);
    }
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (!["debug", "info", "warn", "error"].includes(config.logLevel)) {
      errors.push("logLevel must be one of: debug, info, warn, error");
    }

    if (typeof config.logPath !== "string") {
      errors.push("logPath must be a string");
    } else if (config.logPath.trim() === "") {
      errors.push("logPath cannot be empty");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
