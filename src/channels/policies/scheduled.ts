/**
 * Scheduled 策略处理器
 *
 * 功能：根据时间表响应消息
 */

import type { ScheduledPolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

export class ScheduledPolicyHandler implements PolicyHandler {
  readonly type = "scheduled";

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding } = context;

    if (binding.policy.type !== "scheduled") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected scheduled`);
    }

    const config = binding.policy.config as ScheduledPolicyConfig;

    // 检查是否在工作时间内
    const isWorkingTime = this.isWithinWorkingHours(config);

    if (isWorkingTime) {
      // 工作时间，允许正常处理
      return { allow: true };
    }

    // 非工作时间
    const result: PolicyResult = {
      allow: false,
      reason: "Outside of working hours",
    };

    // 添加自动回复
    if (config.autoReply) {
      result.autoReply = config.autoReply;
    }

    // 转发到其他通道
    if (config.forwardTo) {
      result.routeTo = [
        {
          channelId: config.forwardTo.channelId,
          accountId: config.forwardTo.accountId,
        },
      ];
    }

    return result;
  }

  private isWithinWorkingHours(config: ScheduledPolicyConfig): boolean {
    const now = new Date();

    // 处理时区（如果配置了）
    // 注意：这里简化处理，实际应使用时区库如 date-fns-tz
    const timezone = config.timezone || "UTC";

    // 检查是否为节假日
    if (config.holidays) {
      const today = this.formatDate(now);
      if (config.holidays.includes(today)) {
        return false; // 节假日不工作
      }
    }

    // 检查是否为周末
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 获取当前时间（HH:mm格式）
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    // 检查工作时间配置
    if (!config.workingHours) {
      // 没有配置工作时间，默认全天工作
      return true;
    }

    if (isWeekend) {
      // 周末
      if (config.workingHours.weekends) {
        return this.isTimeInRange(
          currentTime,
          config.workingHours.weekends.start,
          config.workingHours.weekends.end,
        );
      }
      // 没有配置周末工作时间，默认不工作
      return false;
    } else {
      // 工作日
      if (config.workingHours.weekdays) {
        return this.isTimeInRange(
          currentTime,
          config.workingHours.weekdays.start,
          config.workingHours.weekdays.end,
        );
      }
      // 没有配置工作日时间，默认全天工作
      return true;
    }
  }

  private isTimeInRange(current: string, start: string, end: string): boolean {
    return current >= start && current <= end;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (config.timezone !== undefined && typeof config.timezone !== "string") {
      errors.push("timezone must be a string");
    }

    if (config.workingHours) {
      if (config.workingHours.weekdays) {
        if (!this.isValidTimeFormat(config.workingHours.weekdays.start)) {
          errors.push("workingHours.weekdays.start must be in HH:mm format");
        }
        if (!this.isValidTimeFormat(config.workingHours.weekdays.end)) {
          errors.push("workingHours.weekdays.end must be in HH:mm format");
        }
      }

      if (config.workingHours.weekends) {
        if (!this.isValidTimeFormat(config.workingHours.weekends.start)) {
          errors.push("workingHours.weekends.start must be in HH:mm format");
        }
        if (!this.isValidTimeFormat(config.workingHours.weekends.end)) {
          errors.push("workingHours.weekends.end must be in HH:mm format");
        }
      }
    }

    if (config.holidays !== undefined && !Array.isArray(config.holidays)) {
      errors.push("holidays must be an array");
    }

    if (config.autoReply !== undefined && typeof config.autoReply !== "string") {
      errors.push("autoReply must be a string");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(time);
  }
}
