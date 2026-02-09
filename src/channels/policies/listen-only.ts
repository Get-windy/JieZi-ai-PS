/**
 * ListenOnly 策略处理器
 *
 * 功能：只监听和记录消息，不响应，用于数据收集
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ListenOnlyPolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class ListenOnlyPolicyHandler implements PolicyHandler {
  readonly type = "listen-only";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding, channelId, accountId } = context;

    if (binding.policy.type !== "listen-only") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected listen-only`);
    }

    const config = binding.policy.config as ListenOnlyPolicyConfig;

    // 记录日志
    if (config.enableLogging) {
      await this.logMessage(config.logPath, {
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
    }

    // 触发事件（用于数据分析）
    if (config.triggerEvents) {
      // 这里可以触发自定义事件，供其他系统监听
      // 例如：eventBus.emit('message:collected', { ... })
      // 暂时留空，后续可扩展
    }

    // ListenOnly 模式：阻止消息处理
    return {
      allow: false,
      reason: "Listen-only mode - message logged but not processed",
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

    if (typeof config.enableLogging !== "boolean") {
      errors.push("enableLogging must be a boolean");
    }

    if (typeof config.logPath !== "string") {
      errors.push("logPath must be a string");
    } else if (config.logPath.trim() === "") {
      errors.push("logPath cannot be empty");
    }

    if (config.triggerEvents !== undefined && typeof config.triggerEvents !== "boolean") {
      errors.push("triggerEvents must be a boolean");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
