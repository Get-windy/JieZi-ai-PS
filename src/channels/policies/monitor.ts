/**
 * Monitor 策略处理器
 *
 * 功能：只读监控，记录消息但不回复
 */

import { existsSync } from "node:fs";
import { writeFile, appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { MonitorPolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class MonitorPolicyHandler implements PolicyHandler {
  readonly type = "monitor";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding, channelId, accountId } = context;

    if (binding.policy.type !== "monitor") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected monitor`);
    }

    const config = binding.policy.config as MonitorPolicyConfig;

    // 检查是否监控当前通道
    const isMonitored = config.monitorChannels.includes(channelId);

    if (!isMonitored) {
      // 不监控此通道，允许正常处理
      return { allow: true };
    }

    // 记录日志
    if (config.enableLogging && config.logPath) {
      await this.logMessage(config.logPath, {
        timestamp: message.timestamp,
        channelId,
        accountId,
        messageId: message.messageId,
        from: "from" in message ? message.from : undefined,
        to: message.to,
        content: message.content,
        type: message.type,
      });
    }

    // 监控模式：阻止消息处理，不回复
    return {
      allow: false,
      reason: "Monitor mode - message logged but not processed",
    };
  }

  private async logMessage(logPath: string, data: any): Promise<void> {
    try {
      const logDir = dirname(logPath);
      if (!existsSync(logDir)) {
        await mkdir(logDir, { recursive: true });
      }

      const logEntry =
        JSON.stringify({
          ...data,
          timestamp: new Date(data.timestamp).toISOString(),
        }) + "\n";

      await appendFile(logPath, logEntry, "utf-8");
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

    if (!Array.isArray(config.monitorChannels)) {
      errors.push("monitorChannels must be an array");
    } else if (config.monitorChannels.length === 0) {
      errors.push("monitorChannels cannot be empty");
    } else if (!config.monitorChannels.every((id: any) => typeof id === "string")) {
      errors.push("All monitorChannels must be strings");
    }

    if (config.enableLogging !== undefined && typeof config.enableLogging !== "boolean") {
      errors.push("enableLogging must be a boolean");
    }

    if (config.logPath !== undefined && typeof config.logPath !== "string") {
      errors.push("logPath must be a string");
    }

    if (config.enableLogging && !config.logPath) {
      errors.push("logPath is required when enableLogging is true");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
