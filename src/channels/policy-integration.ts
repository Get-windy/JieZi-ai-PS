/**
 * 通道策略系统集成
 * 将策略系统集成到消息处理流程中
 */

import type {
  ChannelAccountBinding,
  PolicyProcessContext,
  PolicyResult,
} from "./policies/types.js";
import { channelBindingResolver } from "./bindings/resolver.js";
import { PolicyRegistry } from "./policies/registry.js";

/**
 * 策略集成器
 * 负责在消息处理流程中集成策略检查
 */
export class PolicyIntegrator {
  /**
   * 在消息处理前检查策略
   * @param binding 通道绑定配置
   * @param message 入站消息
   * @param context 上下文信息
   * @returns 策略处理结果
   */
  async checkInboundPolicy(
    binding: ChannelAccountBinding,
    message: any,
    context: any,
  ): Promise<PolicyResult> {
    // 如果没有配置策略，允许通过
    if (!binding.policy) {
      return { allow: true };
    }

    // 构建策略处理上下文
    const policyContext: PolicyProcessContext = {
      binding,
      message,
      channelId: binding.channelId,
      accountId: binding.accountId,
      direction: "inbound",
      metadata: {
        timestamp: Date.now(),
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
      },
    };

    // 应用策略
    try {
      const result = await channelBindingResolver.applyPolicy(policyContext);

      // 记录策略执行日志
      this.logPolicyExecution(binding, "inbound", result);

      return result;
    } catch (error) {
      console.error(`Policy execution error for binding ${binding.id}:`, error);

      // 策略执行失败时的降级策略
      return {
        allow: false,
        reason: `Policy execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 在消息发送前检查策略
   * @param binding 通道绑定配置
   * @param message 出站消息
   * @param context 上下文信息
   * @returns 策略处理结果
   */
  async checkOutboundPolicy(
    binding: ChannelAccountBinding,
    message: any,
    context: any,
  ): Promise<PolicyResult> {
    if (!binding.policy) {
      return { allow: true };
    }

    const policyContext: PolicyProcessContext = {
      binding,
      message,
      channelId: binding.channelId,
      accountId: binding.accountId,
      direction: "outbound",
      metadata: {
        timestamp: Date.now(),
      },
    };

    try {
      const result = await channelBindingResolver.applyPolicy(policyContext);
      this.logPolicyExecution(binding, "outbound", result);
      return result;
    } catch (error) {
      console.error(`Outbound policy execution error for binding ${binding.id}:`, error);
      return {
        allow: false,
        reason: `Policy execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 处理策略路由结果
   * 当策略要求将消息路由到其他账号时调用
   * @param routeTargets 路由目标列表
   * @param message 消息内容
   * @returns 是否成功路由
   */
  async handlePolicyRoute(
    routeTargets: Array<{ channelId: string; accountId: string }>,
    message: any,
  ): Promise<boolean> {
    console.log(`Routing message to ${routeTargets.length} targets`);

    let successCount = 0;

    for (const target of routeTargets) {
      try {
        // 查找目标绑定
        const targetBinding = channelBindingResolver.resolveBinding(
          // 注意：这里需要从配置中获取完整的 channelBindings
          // 实际集成时需要传入完整配置
          { bindings: [] },
          target.channelId,
          target.accountId,
        );

        if (targetBinding) {
          // 重新检查目标绑定的策略
          const targetResult = await this.checkOutboundPolicy(targetBinding, message, {});

          if (targetResult.allow) {
            // TODO: 实际发送消息到目标账号
            // await sendMessageToAccount(target.channelId, target.accountId, message);
            successCount++;
          } else {
            console.warn(
              `Target binding ${targetBinding.id} policy rejected the message: ${targetResult.reason}`,
            );
          }
        } else {
          console.warn(`Target binding not found: ${target.channelId}/${target.accountId}`);
        }
      } catch (error) {
        console.error(`Failed to route to ${target.channelId}/${target.accountId}:`, error);
      }
    }

    return successCount > 0;
  }

  /**
   * 发送策略的自动回复
   * @param channelId 通道ID
   * @param accountId 账号ID
   * @param recipientId 接收者ID
   * @param replyText 回复文本
   */
  async sendAutoReply(
    channelId: string,
    accountId: string,
    recipientId: string,
    replyText: string,
  ): Promise<void> {
    console.log(`Sending auto-reply to ${recipientId} on ${channelId}/${accountId}`);

    // TODO: 实际发送自动回复
    // await sendMessage(channelId, accountId, recipientId, replyText);
  }

  /**
   * 记录策略执行日志
   * @param binding 绑定配置
   * @param direction 消息方向
   * @param result 策略结果
   */
  private logPolicyExecution(
    binding: ChannelAccountBinding,
    direction: "inbound" | "outbound",
    result: PolicyResult,
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      bindingId: binding.id,
      policyType: binding.policy?.type,
      direction,
      allowed: result.allow,
      reason: result.reason,
      routedTo: result.routeTo?.length,
    };

    // TODO: 集成到实际的日志系统
    console.log("[Policy Execution]", JSON.stringify(logEntry));
  }
}

/**
 * 全局策略集成器实例
 */
export const policyIntegrator = new PolicyIntegrator();

/**
 * 便捷函数：检查消息是否允许通过
 * @param binding 通道绑定配置
 * @param message 消息
 * @param direction 消息方向
 * @param context 上下文
 * @returns 是否允许通过
 */
export async function checkMessagePolicy(
  binding: ChannelAccountBinding,
  message: any,
  direction: "inbound" | "outbound",
  context: any = {},
): Promise<PolicyResult> {
  if (direction === "inbound") {
    return await policyIntegrator.checkInboundPolicy(binding, message, context);
  } else {
    return await policyIntegrator.checkOutboundPolicy(binding, message, context);
  }
}

/**
 * 策略集成中间件
 * 可以集成到消息处理管道中
 */
export function createPolicyMiddleware() {
  return async (context: any, next: () => Promise<void>) => {
    const { binding, message, direction } = context;

    // 执行策略检查
    const result = await checkMessagePolicy(binding, message, direction, context);

    // 保存策略结果到上下文
    context.policyResult = result;

    if (!result.allow) {
      // 策略拒绝，处理自动回复
      if (result.autoReply && direction === "inbound") {
        const recipientId = "from" in message ? message.from : undefined;
        if (recipientId) {
          await policyIntegrator.sendAutoReply(
            binding.channelId,
            binding.accountId,
            recipientId,
            result.autoReply,
          );
        }
      }

      // 策略要求路由
      if (result.routeTo) {
        await policyIntegrator.handlePolicyRoute(result.routeTo, message);
      }

      // 阻止后续处理
      return;
    }

    // 策略允许，继续处理
    await next();
  };
}
