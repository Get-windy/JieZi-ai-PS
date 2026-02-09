/**
 * 策略执行器
 *
 * 功能：协调策略处理的完整流程
 */

import type { AgentChannelBindings } from "../../config/types.channel-bindings.js";
import type { PolicyProcessContext, PolicyResult } from "./types.js";
import { channelBindingResolver } from "../bindings/resolver.js";
import { messageDispatcher, type DispatchResult } from "./dispatcher.js";

/**
 * 策略执行上下文
 */
export type PolicyExecutionContext = {
  /** 智能助手ID */
  agentId: string;

  /** 智能助手通道绑定配置 */
  channelBindings?: AgentChannelBindings;

  /** 消息信息 */
  message: any;

  /** 通道ID */
  channelId: string;

  /** 账号ID */
  accountId: string;

  /** 消息方向 */
  direction: "inbound" | "outbound";

  /** 额外上下文 */
  metadata?: Record<string, unknown>;
};

/**
 * 策略执行结果
 */
export type PolicyExecutionResult = {
  /** 是否允许消息继续处理 */
  allow: boolean;

  /** 拒绝原因 */
  reason?: string;

  /** 策略结果 */
  policyResult?: PolicyResult;

  /** 派发结果 */
  dispatchResult?: DispatchResult;

  /** 使用的绑定配置 */
  binding?: {
    id: string;
    policyType: string;
  };
};

/**
 * 策略执行器类
 */
export class PolicyExecutor {
  /**
   * 执行策略处理
   *
   * @param context - 执行上下文
   * @param sendMessage - 发送消息的函数（用于自动回复和路由）
   * @returns 执行结果
   */
  async execute(
    context: PolicyExecutionContext,
    sendMessage?: (target: any, content: any) => Promise<void>,
  ): Promise<PolicyExecutionResult> {
    // 1. 查找匹配的绑定
    const binding = channelBindingResolver.resolveBinding(
      context.channelBindings,
      context.channelId,
      context.accountId,
    );

    // 如果没有找到绑定，允许正常处理
    if (!binding) {
      return {
        allow: true,
        reason: "No matching channel binding found",
      };
    }

    // 2. 构建策略处理上下文
    const policyContext: PolicyProcessContext = {
      agentId: context.agentId,
      agentConfig: {}, // TODO: 从配置中获取完整的 agent config
      message: context.message,
      channelId: context.channelId,
      accountId: context.accountId,
      binding: {
        id: binding.id,
        policy: binding.policy,
        enabled: binding.enabled,
        priority: binding.priority,
      },
      gatewayContext: context.metadata || {},
    };

    // 3. 应用策略
    let policyResult: PolicyResult;
    try {
      policyResult = await channelBindingResolver.applyPolicy(policyContext);
    } catch (error) {
      return {
        allow: false,
        reason: `Policy execution failed: ${error instanceof Error ? error.message : String(error)}`,
        binding: {
          id: binding.id,
          policyType: binding.policy.type,
        },
      };
    }

    // 4. 处理策略结果
    const executionResult: PolicyExecutionResult = {
      allow: policyResult.allow,
      reason: policyResult.reason,
      policyResult,
      binding: {
        id: binding.id,
        policyType: binding.policy.type,
      },
    };

    // 5. 如果策略不允许，但需要派发消息（自动回复或路由）
    if (!policyResult.allow && sendMessage) {
      if (policyResult.autoReply || (policyResult.routeTo && policyResult.routeTo.length > 0)) {
        const dispatchResult = await messageDispatcher.dispatch(
          policyResult,
          context.message,
          sendMessage,
        );

        executionResult.dispatchResult = dispatchResult;
      }
    }

    return executionResult;
  }

  /**
   * 验证智能助手的所有通道绑定配置
   *
   * @param channelBindings - 通道绑定配置
   * @returns 验证结果
   */
  async validateChannelBindings(channelBindings: AgentChannelBindings): Promise<{
    valid: boolean;
    errors?: Array<{
      bindingId: string;
      errors: string[];
    }>;
  }> {
    if (!channelBindings.bindings || channelBindings.bindings.length === 0) {
      return { valid: true };
    }

    const validationErrors: Array<{ bindingId: string; errors: string[] }> = [];

    for (const binding of channelBindings.bindings) {
      const result = await channelBindingResolver.validateBinding(binding);

      if (!result.valid && result.errors) {
        validationErrors.push({
          bindingId: binding.id,
          errors: result.errors,
        });
      }
    }

    return {
      valid: validationErrors.length === 0,
      errors: validationErrors.length > 0 ? validationErrors : undefined,
    };
  }

  /**
   * 列出所有可用的策略类型
   */
  listAvailablePolicies(): string[] {
    return channelBindingResolver.listPolicyTypes();
  }

  /**
   * 检查策略类型是否可用
   */
  isPolicyAvailable(type: string): boolean {
    return channelBindingResolver.hasPolicyType(type);
  }
}

/**
 * 导出单例实例
 */
export const policyExecutor = new PolicyExecutor();
