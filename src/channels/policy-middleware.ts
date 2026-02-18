/**
 * 策略中间件
 * 
 * 功能：
 * - 拦截入站和出站消息
 * - 应用策略处理
 * - 集成到Gateway消息处理流程
 */

import type {
  InboundMessageContext,
  OutboundMessageContext,
  PolicyResult,
} from "./policies/types.js";
import { policyScheduler } from "./policies/scheduler.js";

/**
 * 策略中间件配置
 */
export type PolicyMiddlewareConfig = {
  /** 是否启用策略中间件 */
  enabled?: boolean;
  /** 是否记录策略执行日志 */
  logExecution?: boolean;
  /** 默认优先级 */
  defaultPriority?: number;
};

/**
 * 策略中间件
 */
export class PolicyMiddleware {
  private static instance: PolicyMiddleware;
  private config: Required<PolicyMiddlewareConfig>;

  private constructor(config: PolicyMiddlewareConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      logExecution: config.logExecution ?? true,
      defaultPriority: config.defaultPriority ?? 5,
    };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: PolicyMiddlewareConfig): PolicyMiddleware {
    if (!PolicyMiddleware.instance) {
      PolicyMiddleware.instance = new PolicyMiddleware(config);
    }
    return PolicyMiddleware.instance;
  }

  /**
   * 处理入站消息
   * 
   * @param message - 入站消息上下文
   * @param agentId - 智能助手ID
   * @param priority - 优先级
   * @returns 策略处理结果
   */
  async processInboundMessage(
    message: InboundMessageContext,
    agentId: string,
    priority?: number,
  ): Promise<PolicyResult> {
    // 如果中间件未启用，直接允许通过
    if (!this.config.enabled) {
      return {
        allow: true,
        reason: "Policy middleware disabled",
      };
    }

    // 记录日志
    if (this.config.logExecution) {
      console.log(
        `[PolicyMiddleware] Processing inbound message: ${message.messageId} ` +
          `from ${message.from} to agent ${agentId}`,
      );
    }

    try {
      // 调度策略执行
      const result = await policyScheduler.scheduleInboundPolicy(
        message,
        agentId,
        priority ?? this.config.defaultPriority,
      );

      // 记录结果
      if (this.config.logExecution) {
        console.log(
          `[PolicyMiddleware] Inbound policy result: ${result.allow ? "ALLOW" : "DENY"}` +
            (result.reason ? `, reason: ${result.reason}` : ""),
        );
      }

      return result;
    } catch (error) {
      console.error("[PolicyMiddleware] Error processing inbound message:", error);
      return {
        allow: false,
        reason: `Policy middleware error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 处理出站消息
   * 
   * @param message - 出站消息上下文
   * @param agentId - 智能助手ID
   * @param priority - 优先级
   * @returns 策略处理结果
   */
  async processOutboundMessage(
    message: OutboundMessageContext,
    agentId: string,
    priority?: number,
  ): Promise<PolicyResult> {
    // 如果中间件未启用，直接允许通过
    if (!this.config.enabled) {
      return {
        allow: true,
        reason: "Policy middleware disabled",
      };
    }

    // 记录日志
    if (this.config.logExecution) {
      console.log(
        `[PolicyMiddleware] Processing outbound message: ${message.messageId} ` +
          `to ${message.to} from agent ${agentId}`,
      );
    }

    try {
      // 调度策略执行
      const result = await policyScheduler.scheduleOutboundPolicy(
        message,
        agentId,
        priority ?? this.config.defaultPriority,
      );

      // 记录结果
      if (this.config.logExecution) {
        console.log(
          `[PolicyMiddleware] Outbound policy result: ${result.allow ? "ALLOW" : "DENY"}` +
            (result.reason ? `, reason: ${result.reason}` : ""),
        );
      }

      return result;
    } catch (error) {
      console.error("[PolicyMiddleware] Error processing outbound message:", error);
      return {
        allow: false,
        reason: `Policy middleware error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 启用中间件
   */
  enable(): void {
    this.config.enabled = true;
    console.log("[PolicyMiddleware] Enabled");
  }

  /**
   * 禁用中间件
   */
  disable(): void {
    this.config.enabled = false;
    console.log("[PolicyMiddleware] Disabled");
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PolicyMiddlewareConfig>): void {
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
    if (config.logExecution !== undefined) {
      this.config.logExecution = config.logExecution;
    }
    if (config.defaultPriority !== undefined) {
      this.config.defaultPriority = config.defaultPriority;
    }

    console.log("[PolicyMiddleware] Config updated:", this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<PolicyMiddlewareConfig> {
    return { ...this.config };
  }
}

/**
 * 导出单例实例
 */
export const policyMiddleware = PolicyMiddleware.getInstance();
