/**
 * 策略执行器
 * 
 * 功能：
 * - 执行策略处理逻辑
 * - 处理策略链（多个策略顺序执行）
 * - 支持策略执行的日志记录和监控
 */

import type {
  InboundMessageContext,
  OutboundMessageContext,
  PolicyResult,
  PolicyProcessContext,
} from "./types.js";
import { channelBindingResolver } from "../bindings/resolver.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import type { AgentChannelBindings } from "../../config/types.channel-bindings.js";

/**
 * 策略执行器
 */
export class PolicyExecutor {
  private static instance: PolicyExecutor;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): PolicyExecutor {
    if (!PolicyExecutor.instance) {
      PolicyExecutor.instance = new PolicyExecutor();
    }
    return PolicyExecutor.instance;
  }

  /**
   * 执行入站消息策略
   * 
   * @param message - 入站消息上下文
   * @param agentId - 智能助手ID
   * @returns 策略处理结果
   */
  async executeInboundPolicy(
    message: InboundMessageContext,
    agentId: string,
  ): Promise<PolicyResult> {
    try {
      // 加载配置
      const config = await loadConfig();
      const agent = config?.agents?.list?.find((a: any) => a.id === agentId);

      if (!agent) {
        console.warn(`[PolicyExecutor] Agent not found: ${agentId}`);
        return {
          allow: true, // 默认允许通过
          reason: "Agent not found, allowing by default",
        };
      }

      // 获取通道绑定配置
      const channelBindings = (agent as any).channelBindings as AgentChannelBindings | undefined;

      // 查找匹配的绑定
      const binding = channelBindingResolver.resolveBinding(
        channelBindings,
        message.channelId,
        message.accountId,
      );

      // 如果没有绑定，使用默认策略或允许通过
      if (!binding) {
        if (channelBindings?.defaultPolicy) {
          return this.executeDefaultPolicy(message, agentId, channelBindings.defaultPolicy);
        }

        console.log(
          `[PolicyExecutor] No binding found for channel ${message.channelId} and account ${message.accountId}, allowing by default`,
        );
        return {
          allow: true,
          reason: "No binding found, allowing by default",
        };
      }

      // 构建策略处理上下文
      const context: PolicyProcessContext = {
        message,
        agentId,
        agentConfig: agent,
        channelId: message.channelId,
        accountId: message.accountId,
        binding,
        gatewayContext: {},
      };

      // 应用策略
      const result = await channelBindingResolver.applyPolicy(context);

      // 记录日志
      this.logPolicyExecution("inbound", agentId, message.channelId, binding.policy.type, result);

      return result;
    } catch (error) {
      console.error("[PolicyExecutor] Error executing inbound policy:", error);
      return {
        allow: false,
        reason: `Policy execution error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 执行出站消息策略
   * 
   * @param message - 出站消息上下文
   * @param agentId - 智能助手ID
   * @returns 策略处理结果
   */
  async executeOutboundPolicy(
    message: OutboundMessageContext,
    agentId: string,
  ): Promise<PolicyResult> {
    try {
      // 加载配置
      const config = await loadConfig();
      const agent = config?.agents?.list?.find((a: any) => a.id === agentId);

      if (!agent) {
        console.warn(`[PolicyExecutor] Agent not found: ${agentId}`);
        return {
          allow: true,
          reason: "Agent not found, allowing by default",
        };
      }

      // 获取通道绑定配置
      const channelBindings = (agent as any).channelBindings as AgentChannelBindings | undefined;

      // 查找匹配的绑定
      const binding = channelBindingResolver.resolveBinding(
        channelBindings,
        message.channelId,
        message.accountId,
      );

      // 如果没有绑定，使用默认策略或允许通过
      if (!binding) {
        if (channelBindings?.defaultPolicy) {
          return this.executeDefaultPolicy(message, agentId, channelBindings.defaultPolicy);
        }

        console.log(
          `[PolicyExecutor] No binding found for channel ${message.channelId} and account ${message.accountId}, allowing by default`,
        );
        return {
          allow: true,
          reason: "No binding found, allowing by default",
        };
      }

      // 构建策略处理上下文
      const context: PolicyProcessContext = {
        message,
        agentId,
        agentConfig: agent,
        channelId: message.channelId,
        accountId: message.accountId,
        binding,
        gatewayContext: {},
      };

      // 应用策略
      const result = await channelBindingResolver.applyPolicy(context);

      // 记录日志
      this.logPolicyExecution("outbound", agentId, message.channelId, binding.policy.type, result);

      return result;
    } catch (error) {
      console.error("[PolicyExecutor] Error executing outbound policy:", error);
      return {
        allow: false,
        reason: `Policy execution error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 执行默认策略
   */
  private async executeDefaultPolicy(
    message: InboundMessageContext | OutboundMessageContext,
    agentId: string,
    defaultPolicy: any,
  ): Promise<PolicyResult> {
    try {
      // 构建临时绑定
      const tempBinding = {
        id: "default",
        channelId: message.channelId,
        accountId: message.accountId,
        policy: defaultPolicy,
        enabled: true,
      };

      const context: PolicyProcessContext = {
        message,
        agentId,
        agentConfig: {},
        channelId: message.channelId,
        accountId: message.accountId,
        binding: tempBinding,
        gatewayContext: {},
      };

      return await channelBindingResolver.applyPolicy(context);
    } catch (error) {
      console.error("[PolicyExecutor] Error executing default policy:", error);
      return {
        allow: false,
        reason: `Default policy execution error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 记录策略执行日志
   */
  private logPolicyExecution(
    direction: "inbound" | "outbound",
    agentId: string,
    channelId: string,
    policyType: string,
    result: PolicyResult,
  ): void {
    console.log(
      `[PolicyExecutor] ${direction} policy executed - ` +
        `agent: ${agentId}, ` +
        `channel: ${channelId}, ` +
        `policy: ${policyType}, ` +
        `result: ${result.allow ? "ALLOW" : "DENY"}` +
        (result.reason ? `, reason: ${result.reason}` : ""),
    );
  }
}

/**
 * 导出单例实例
 */
export const policyExecutor = PolicyExecutor.getInstance();
