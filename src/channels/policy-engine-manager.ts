/**
 * Phase 2: 通道策略引擎管理器
 *
 * 负责：
 * - 加载和管理智能助手的通道策略配置
 * - 为每个智能助手创建独立的策略引擎实例
 * - 提供统一的策略执行接口
 */

import type { OpenClawConfig } from "../config/config.js";
import type { AgentChannelPolicies } from "../config/types.channel-policies.js";
import { ChannelPolicyEngine, type PolicyContext } from "./policy-engine.js";

/**
 * 策略引擎管理器
 */
export class PolicyEngineManager {
  /** 每个智能助手的策略引擎实例 */
  private engines: Map<string, ChannelPolicyEngine> = new Map();

  /**
   * 从配置加载策略引擎
   */
  loadFromConfig(cfg: OpenClawConfig): void {
    this.engines.clear();

    // 遍历所有智能助手配置
    const agentsList = cfg.agents?.list ?? [];

    for (const agentConfig of agentsList) {
      if (!agentConfig?.id) {
        continue;
      }

      const agentId = agentConfig.id;
      const channelPolicies = (agentConfig as any).channelPolicies as
        | AgentChannelPolicies
        | undefined;

      if (!channelPolicies) {
        continue;
      }

      // 构建策略映射表
      const policyMap: Record<string, any> = {};

      if (channelPolicies.bindings && Array.isArray(channelPolicies.bindings)) {
        for (const binding of channelPolicies.bindings) {
          const key = binding.accountId
            ? `${binding.channelId}:${binding.accountId}`
            : binding.channelId;

          // 根据策略类型构建完整的策略对象
          const policy: any = {
            type: binding.policy,
            enabled: true,
          };

          // 合并策略特定配置
          switch (binding.policy) {
            case "filter":
              if (binding.filterConfig) {
                Object.assign(policy, {
                  allowKeywords: binding.filterConfig.allowKeywords,
                  denyKeywords: binding.filterConfig.blockKeywords,
                  allowSenders: binding.filterConfig.allowSenders,
                  denySenders: binding.filterConfig.blockSenders,
                });
              }
              break;
            case "scheduled":
              if (binding.scheduledConfig) {
                Object.assign(policy, {
                  workingHours: {
                    timezone: binding.scheduledConfig.timezone,
                    weekdays: [1, 2, 3, 4, 5], // 默认周一到周五
                    dailyHours: { start: "09:00", end: "18:00" },
                  },
                });
              }
              break;
            case "forward":
              if (binding.forwardConfig) {
                Object.assign(policy, {
                  targetChannels: binding.forwardConfig.targetChannelId
                    ? [binding.forwardConfig.targetChannelId]
                    : [],
                  includeSource: binding.forwardConfig.includeSource,
                });
              }
              break;
            case "broadcast":
              if (binding.broadcastConfig) {
                Object.assign(policy, {
                  targetChannels: binding.broadcastConfig.targetChannels?.map((t) => t.channelId),
                });
              }
              break;
            case "queue":
              if (binding.queueConfig) {
                Object.assign(policy, {
                  batchSize: binding.queueConfig.batchSize,
                  maxWaitMs: binding.queueConfig.maxWaitMs,
                });
              }
              break;
            case "moderate":
              if (binding.moderateConfig) {
                Object.assign(policy, {
                  requireApprovalFrom: binding.moderateConfig.requireApprovalFrom,
                  autoApproveKeywords: binding.moderateConfig.autoApproveKeywords,
                });
              }
              break;
          }

          policyMap[key] = policy;
        }
      }

      // 默认策略
      const defaultPolicy = channelPolicies.defaultPolicy
        ? {
            type: channelPolicies.defaultPolicy,
            enabled: true,
          }
        : undefined;

      // 创建策略引擎实例
      const engine = new ChannelPolicyEngine(policyMap, defaultPolicy);
      this.engines.set(agentId, engine);
    }
  }

  /**
   * 获取指定智能助手的策略引擎
   */
  getEngine(agentId: string): ChannelPolicyEngine | null {
    return this.engines.get(agentId) || null;
  }

  /**
   * 检查消息是否被策略允许
   */
  async checkMessage(params: {
    agentId: string;
    channelId: string;
    accountId: string;
    message: any;
    senderId?: string;
    senderType?: "user" | "bot" | "system";
    isGroup?: boolean;
    timestamp?: number;
    metadata?: Record<string, any>;
  }): Promise<{
    allow: boolean;
    reason?: string;
    autoReply?: string;
    forwardTargets?: string[];
    transformedMessage?: any;
  }> {
    const engine = this.getEngine(params.agentId);

    // 没有配置策略引擎，默认允许
    if (!engine) {
      return { allow: true };
    }

    // 构建策略上下文
    const context: PolicyContext = {
      agentId: params.agentId,
      channelId: params.channelId,
      accountId: params.accountId,
      message: params.message,
      senderId: params.senderId,
      senderType: params.senderType,
      isGroup: params.isGroup,
      timestamp: params.timestamp || Date.now(),
      metadata: params.metadata,
    };

    // 执行策略检查
    const result = await engine.execute(context);

    return {
      allow: result.allow,
      reason: result.reason,
      autoReply: result.autoReply,
      forwardTargets: result.forwardTargets,
      transformedMessage: result.transformedMessage,
    };
  }

  /**
   * 清空所有策略引擎
   */
  clear(): void {
    this.engines.clear();
  }
}

/**
 * 全局策略引擎管理器实例
 */
export const globalPolicyEngineManager = new PolicyEngineManager();
