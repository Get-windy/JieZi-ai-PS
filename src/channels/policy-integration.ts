/**
 * Phase 2: 通道策略系统集成
 *
 * 将通道策略引擎集成到 OpenClaw 配置系统中
 */

import type { OpenClawConfig } from "../config/config.js";
import type { AgentChannelPolicies, ChannelPolicy } from "../config/types.channel-policies.js";
import { ChannelPolicyEngine, createPolicyEngine } from "../channels/policy-engine.js";

/**
 * 策略引擎管理器
 */
export class PolicyEngineManager {
  private engines: Map<string, ChannelPolicyEngine> = new Map();
  private config: OpenClawConfig | null = null;

  /**
   * 初始化策略引擎管理器
   */
  initialize(config: OpenClawConfig): void {
    this.config = config;

    // 清空现有引擎
    this.engines.clear();

    // 为每个智能助手创建策略引擎
    const agents = config.agents?.list || [];
    for (const agent of agents) {
      const agentId = agent.id;

      // 检查是否配置了通道策略
      const channelPolicies = (agent as any).channelPolicies as AgentChannelPolicies | undefined;

      if (channelPolicies) {
        const engine = createPolicyEngine(channelPolicies.policies, channelPolicies.defaultPolicy);
        this.engines.set(agentId, engine);
        console.log(`[Policy Manager] Initialized policy engine for agent: ${agentId}`);
      }
    }
  }

  /**
   * 获取智能助手的策略引擎
   */
  getEngine(agentId: string): ChannelPolicyEngine | null {
    return this.engines.get(agentId) || null;
  }

  /**
   * 获取所有策略引擎
   */
  getAllEngines(): Map<string, ChannelPolicyEngine> {
    return this.engines;
  }

  /**
   * 检查智能助手是否配置了策略
   */
  hasPolicy(agentId: string): boolean {
    return this.engines.has(agentId);
  }

  /**
   * 动态设置智能助手的通道策略
   */
  setPolicy(agentId: string, channelId: string, policy: ChannelPolicy): void {
    let engine = this.engines.get(agentId);

    if (!engine) {
      engine = createPolicyEngine();
      this.engines.set(agentId, engine);
    }

    engine.setPolicy(channelId, policy);
    console.log(`[Policy Manager] Set policy for agent ${agentId}, channel ${channelId}`);
  }

  /**
   * 获取智能助手的通道策略
   */
  getPolicy(agentId: string, channelId: string): ChannelPolicy | null {
    const engine = this.engines.get(agentId);
    if (!engine) {
      return null;
    }
    return engine.getPolicy(channelId);
  }

  /**
   * 清除所有策略引擎
   */
  clear(): void {
    this.engines.clear();
  }
}

/**
 * 全局策略引擎管理器实例
 */
export const policyEngineManager = new PolicyEngineManager();

/**
 * 初始化通道策略系统
 */
export function initializeChannelPolicies(config: OpenClawConfig): {
  success: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // 初始化策略引擎管理器
    policyEngineManager.initialize(config);

    // 验证策略配置
    const agents = config.agents?.list || [];
    for (const agent of agents) {
      const agentId = agent.id;
      const channelPolicies = (agent as any).channelPolicies as AgentChannelPolicies | undefined;

      if (channelPolicies) {
        // 验证策略配置的完整性
        const validation = validateChannelPolicies(channelPolicies);
        if (!validation.valid) {
          errors.push(...validation.errors.map((err) => `Agent ${agentId}: ${err}`));
        }
        if (validation.warnings.length > 0) {
          warnings.push(...validation.warnings.map((warn) => `Agent ${agentId}: ${warn}`));
        }
      }
    }

    if (errors.length > 0) {
      console.error("[Policy Integration] Validation failed:", errors);
      return { success: false, errors, warnings };
    }

    if (warnings.length > 0) {
      console.warn("[Policy Integration] Validation warnings:", warnings);
    }

    console.log("[Policy Integration] Channel policies initialized successfully");
    return { success: true, errors: [], warnings };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to initialize channel policies: ${errorMsg}`);
    console.error("[Policy Integration] Initialization error:", error);
    return { success: false, errors, warnings };
  }
}

/**
 * 验证通道策略配置
 */
function validateChannelPolicies(config: AgentChannelPolicies): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证智能助手ID
  if (!config.agentId || typeof config.agentId !== "string") {
    errors.push("Missing or invalid agentId");
  }

  // 验证策略对象
  if (!config.policies || typeof config.policies !== "object") {
    errors.push("Missing or invalid policies object");
  } else {
    // 验证每个策略
    for (const [channelId, policy] of Object.entries(config.policies)) {
      const validation = validatePolicy(channelId, policy);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }
  }

  // 验证默认策略
  if (config.defaultPolicy) {
    const validation = validatePolicy("default", config.defaultPolicy);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证单个策略配置
 */
function validatePolicy(
  channelId: string,
  policy: ChannelPolicy,
): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证策略类型
  if (!policy.type) {
    errors.push(`Channel ${channelId}: Missing policy type`);
    return { errors, warnings };
  }

  // 根据策略类型进行特定验证
  switch (policy.type) {
    case "forward":
      if (!policy.targetChannels || policy.targetChannels.length === 0) {
        errors.push(`Channel ${channelId}: Forward policy requires targetChannels`);
      }
      break;

    case "filter":
      if (
        !policy.allowKeywords &&
        !policy.denyKeywords &&
        !policy.allowSenders &&
        !policy.denySenders &&
        !policy.timeRange
      ) {
        warnings.push(`Channel ${channelId}: Filter policy has no filtering rules configured`);
      }
      break;

    case "scheduled":
      if (!policy.workingHours && !policy.holidays) {
        warnings.push(`Channel ${channelId}: Scheduled policy has no time constraints configured`);
      }
      break;

    case "smart-route":
      if (!policy.routingRules || policy.routingRules.length === 0) {
        errors.push(`Channel ${channelId}: Smart-route policy requires routing rules`);
      }
      break;

    case "broadcast":
      if (!policy.targetChannels || policy.targetChannels.length === 0) {
        errors.push(`Channel ${channelId}: Broadcast policy requires targetChannels`);
      }
      break;

    case "round-robin":
      if (!policy.channels || policy.channels.length === 0) {
        errors.push(`Channel ${channelId}: Round-robin policy requires channels`);
      }
      break;
  }

  return { errors, warnings };
}

/**
 * 便捷函数：获取智能助手的策略引擎
 */
export function getPolicyEngine(agentId: string): ChannelPolicyEngine | null {
  return policyEngineManager.getEngine(agentId);
}

/**
 * 便捷函数：检查智能助手是否有策略配置
 */
export function hasChannelPolicy(agentId: string, channelId?: string): boolean {
  const engine = policyEngineManager.getEngine(agentId);
  if (!engine) {
    return false;
  }
  if (channelId) {
    return engine.getPolicy(channelId) !== null;
  }
  return true;
}
