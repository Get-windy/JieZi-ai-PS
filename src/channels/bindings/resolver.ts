/**
 * 通道绑定解析器
 *
 * 功能：
 * - 解析智能助手的通道绑定配置
 * - 根据通道和账号匹配合适的绑定
 * - 应用策略处理器
 */

import type {
  AgentChannelBindings,
  ChannelAccountBinding,
} from "../../config/types.channel-bindings.js";
import type { PolicyProcessContext, PolicyResult } from "../policies/types.js";
import {
  PrivatePolicyHandler,
  MonitorPolicyHandler,
  ListenOnlyPolicyHandler,
  LoadBalancePolicyHandler,
  QueuePolicyHandler,
  ModeratePolicyHandler,
  EchoPolicyHandler,
  FilterPolicyHandler,
  ScheduledPolicyHandler,
  ForwardPolicyHandler,
  BroadcastPolicyHandler,
  SmartRoutePolicyHandler,
} from "../policies/index.js";
import { PolicyRegistry } from "../policies/types.js";

/**
 * 通道绑定解析器
 */
export class ChannelBindingResolver {
  private static instance: ChannelBindingResolver;

  private constructor() {
    // 注册所有策略处理器
    this.registerDefaultPolicies();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ChannelBindingResolver {
    if (!ChannelBindingResolver.instance) {
      ChannelBindingResolver.instance = new ChannelBindingResolver();
    }
    return ChannelBindingResolver.instance;
  }

  /**
   * 注册默认策略处理器
   */
  private registerDefaultPolicies(): void {
    // 核心策略 (Phase 2.1)
    PolicyRegistry.register(new PrivatePolicyHandler());
    PolicyRegistry.register(new MonitorPolicyHandler());
    PolicyRegistry.register(new ListenOnlyPolicyHandler());

    // 中级策略 (Phase 2.2)
    PolicyRegistry.register(new LoadBalancePolicyHandler());
    PolicyRegistry.register(new QueuePolicyHandler());
    PolicyRegistry.register(new ModeratePolicyHandler());

    // 基础策略
    PolicyRegistry.register(new EchoPolicyHandler());

    // 增强策略 (Phase 2.2)
    PolicyRegistry.register(new FilterPolicyHandler());
    PolicyRegistry.register(new ScheduledPolicyHandler());
    PolicyRegistry.register(new ForwardPolicyHandler());

    // 高级策略 (Phase 2.3)
    PolicyRegistry.register(new BroadcastPolicyHandler());
    PolicyRegistry.register(new SmartRoutePolicyHandler());
  }

  /**
   * 解析通道绑定
   *
   * @param channelBindings - 智能助手的通道绑定配置
   * @param channelId - 当前通道ID
   * @param accountId - 当前账号ID
   * @returns 匹配的绑定配置，如果没有匹配则返回 null
   */
  resolveBinding(
    channelBindings: AgentChannelBindings | undefined,
    channelId: string,
    accountId: string,
  ): ChannelAccountBinding | null {
    if (!channelBindings || !channelBindings.bindings || channelBindings.bindings.length === 0) {
      return null;
    }

    // 查找匹配的绑定（通道ID和账号ID都匹配，且已启用）
    const matchedBindings = channelBindings.bindings.filter(
      (binding) =>
        binding.enabled !== false &&
        binding.channelId === channelId &&
        binding.accountId === accountId,
    );

    if (matchedBindings.length === 0) {
      return null;
    }

    // 如果有多个匹配，选择优先级最高的
    if (matchedBindings.length > 1) {
      matchedBindings.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    return matchedBindings[0];
  }

  /**
   * 应用策略处理
   *
   * @param context - 策略处理上下文
   * @returns 策略处理结果
   */
  async applyPolicy(context: PolicyProcessContext): Promise<PolicyResult> {
    const { binding } = context;

    // 获取策略处理器
    const handler = PolicyRegistry.get(binding.policy.type);

    if (!handler) {
      throw new Error(`Policy handler not found for type: ${binding.policy.type}`);
    }

    // 执行策略处理
    try {
      const result = await handler.process(context);
      return result;
    } catch (error) {
      console.error(`Policy processing error for ${binding.policy.type}:`, error);

      // 返回拒绝结果
      return {
        allow: false,
        reason: `Policy processing failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 验证绑定配置
   *
   * @param binding - 绑定配置
   * @returns 验证结果
   */
  async validateBinding(binding: ChannelAccountBinding): Promise<{
    valid: boolean;
    errors?: string[];
  }> {
    const errors: string[] = [];

    // 验证基本字段
    if (!binding.id || typeof binding.id !== "string") {
      errors.push("Binding ID is required and must be a string");
    }

    if (!binding.channelId || typeof binding.channelId !== "string") {
      errors.push("Channel ID is required and must be a string");
    }

    if (!binding.accountId || typeof binding.accountId !== "string") {
      errors.push("Account ID is required and must be a string");
    }

    if (!binding.policy || typeof binding.policy !== "object") {
      errors.push("Policy is required and must be an object");
      return { valid: false, errors };
    }

    // 验证策略配置
    const handler = PolicyRegistry.get(binding.policy.type);
    if (!handler) {
      errors.push(`Unknown policy type: ${binding.policy.type}`);
      return { valid: false, errors };
    }

    const policyValidation = await handler.validate(binding.policy.config);
    if (!policyValidation.valid && policyValidation.errors) {
      errors.push(...policyValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 列出所有已注册的策略类型
   */
  listPolicyTypes(): string[] {
    return PolicyRegistry.list();
  }

  /**
   * 检查策略类型是否已注册
   */
  hasPolicyType(type: string): boolean {
    return PolicyRegistry.has(type);
  }

  /**
   * 获取策略处理器实例（用于高级操作）
   */
  getPolicyHandler(type: string) {
    return PolicyRegistry.get(type);
  }
}

/**
 * 导出单例实例
 */
export const channelBindingResolver = ChannelBindingResolver.getInstance();
