/**
 * Phase 5 Gateway RPC API - Agent Configuration
 * 智能助手配置管理 API
 *
 * 实现：
 * - agent.modelAccounts.get/update - 模型账号配置管理
 * - agent.channelPolicies.get/update - 通道策略配置管理
 */

import type { ConfigAgent } from "../../../upstream/src/config/types.js";
import type { GatewayServer } from "../../../upstream/src/gateway/server.js";
import { loadConfig, saveConfig } from "../../../upstream/src/config/config.js";

/**
 * 注册智能助手配置相关的RPC方法
 */
export function registerAgentConfigRpcMethods(server: GatewayServer): void {
  // 注册模型账号配置API
  server.registerMethod("agent.modelAccounts.get", handleGetModelAccounts);
  server.registerMethod("agent.modelAccounts.update", handleUpdateModelAccounts);

  // 注册通道策略配置API
  server.registerMethod("agent.channelPolicies.get", handleGetChannelPolicies);
  server.registerMethod("agent.channelPolicies.update", handleUpdateChannelPolicies);
}

/**
 * 获取模型账号配置
 */
async function handleGetModelAccounts(params: { agentId: string }, context: any): Promise<any> {
  const { agentId } = params;

  // 权限检查 - 确保操作员有权访问该智能助手的配置
  // 实际应用中应该从 context 中获取操作员信息并验证权限
  // 例如：const operator = context.operator;
  // if (!operator || !hasPermission(operator, "agent.config.read", agentId)) {
  //   throw new Error("403 Forbidden: No permission to access agent configuration");
  // }
  console.log(`[AgentConfig] Getting model accounts for agent: ${agentId}`);

  // 加载配置
  const config = await loadConfig();
  const agent = findAgent(config, agentId);

  if (!agent) {
    throw new Error(`404 Not Found: Agent ${agentId} not found`);
  }

  // 返回模型账号配置
  // 从 agent 配置中提取 modelAccounts 字段
  const modelAccountsConfig = (agent as any).modelAccounts || {
    accounts: [],
    routingMode: "manual",
  };

  console.log(`[AgentConfig] Retrieved model accounts config for agent: ${agentId}`);
  return modelAccountsConfig;
}

/**
 * 更新模型账号配置
 */
async function handleUpdateModelAccounts(
  params: { agentId: string; config: any },
  context: any,
): Promise<{ success: boolean }> {
  const { agentId, config: newConfig } = params;

  // 权限检查 - 确保操作员有权修改该智能助手的配置
  // 实际应用中应该从 context 中获取操作员信息并验证权限
  // 例如：const operator = context.operator;
  // if (!operator || !hasPermission(operator, "agent.config.write", agentId)) {
  //   throw new Error("403 Forbidden: No permission to modify agent configuration");
  // }
  console.log(`[AgentConfig] Updating model accounts for agent: ${agentId}`);

  // 验证配置格式
  validateModelAccountsConfig(newConfig);

  // 加载配置
  const config = await loadConfig();
  const agent = findAgent(config, agentId);

  if (!agent) {
    throw new Error(`404 Not Found: Agent ${agentId} not found`);
  }

  // 更新配置
  (agent as any).modelAccounts = newConfig;

  // 保存配置
  await saveConfig(config);

  // 记录日志：记录配置变更操作
  const operator = context?.operator?.id || "unknown";
  console.log(
    `[AgentConfig] Model accounts config updated for agent ${agentId} by operator ${operator}`,
    {
      agentId,
      operator,
      timestamp: new Date().toISOString(),
      configKeys: Object.keys(newConfig),
    },
  );

  return { success: true };
}

/**
 * 获取通道策略配置
 */
async function handleGetChannelPolicies(params: { agentId: string }, context: any): Promise<any> {
  const { agentId } = params;

  // 权限检查：验证操作员是否有读取权限
  // 实际应用中应该从 context 中获取操作员信息并验证权限
  // 例如：const operator = context.operator;
  // if (!operator || !hasPermission(operator, "agent.config.read", agentId)) {
  //   throw new Error("403 Forbidden");
  // }
  console.log(`[AgentConfig] Getting channel policies for agent: ${agentId}`);

  const config = await loadConfig();
  const agent = findAgent(config, agentId);

  if (!agent) {
    throw new Error(`404 Not Found: Agent ${agentId} not found`);
  }

  // 从 agent 配置中提取 channelPolicies 字段
  const channelPoliciesConfig = (agent as any).channelPolicies || {
    bindings: [],
    defaultPolicy: "private",
  };

  console.log(`[AgentConfig] Retrieved channel policies config for agent: ${agentId}`);
  return channelPoliciesConfig;
}

/**
 * 更新通道策略配置
 */
async function handleUpdateChannelPolicies(
  params: { agentId: string; config: any },
  context: any,
): Promise<{ success: boolean }> {
  const { agentId, config: newConfig } = params;

  // 权限检查：验证操作员是否有修改权限
  // 实际应用中应该从 context 中获取操作员信息并验证权限
  // 例如：const operator = context.operator;
  // if (!operator || !hasPermission(operator, "agent.config.write", agentId)) {
  //   throw new Error("403 Forbidden");
  // }
  console.log(`[AgentConfig] Updating channel policies for agent: ${agentId}`);

  // 验证配置格式
  validateChannelPoliciesConfig(newConfig);

  const config = await loadConfig();
  const agent = findAgent(config, agentId);

  if (!agent) {
    throw new Error(`404 Not Found: Agent ${agentId} not found`);
  }

  // 更新配置
  (agent as any).channelPolicies = newConfig;

  // 保存配置
  await saveConfig(config);

  // 记录日志：记录配置变更操作
  const operator = context?.operator?.id || "unknown";
  console.log(
    `[AgentConfig] Channel policies config updated for agent ${agentId} by operator ${operator}`,
    {
      agentId,
      operator,
      timestamp: new Date().toISOString(),
      bindingsCount: newConfig.bindings?.length || 0,
      defaultPolicy: newConfig.defaultPolicy,
    },
  );

  return { success: true };
}

/**
 * 辅助函数：查找智能助手
 */
function findAgent(config: any, agentId: string): ConfigAgent | undefined {
  const agents = config?.agents?.list || [];
  return agents.find((a: ConfigAgent) => a.id === agentId);
}

/**
 * 验证模型账号配置格式
 */
function validateModelAccountsConfig(config: any): void {
  if (!config || typeof config !== "object") {
    throw new Error("400 Bad Request: Invalid config format");
  }

  if (!Array.isArray(config.accounts)) {
    throw new Error("400 Bad Request: accounts must be an array");
  }

  if (!["manual", "smart", "roundRobin"].includes(config.routingMode)) {
    throw new Error("400 Bad Request: routingMode must be 'manual', 'smart' or 'roundRobin'");
  }

  // 更详细的验证逻辑：验证账号配置格式
  for (const account of config.accounts) {
    if (!account.accountId || typeof account.accountId !== "string") {
      throw new Error("400 Bad Request: account must have valid accountId");
    }
    if (typeof account.enabled !== "boolean") {
      throw new Error("400 Bad Request: account.enabled must be boolean");
    }
  }

  // 验证智能路由配置
  if (config.routingMode === "smart" && config.smartRouting) {
    // 新增的细粒度能力权重字段（0-100）
    const weightFields = [
      "capabilityWeight",
      "specializationWeight",
      "modalityWeight",
      "eloWeight",
      "codingEloWeight",
      "reasoningEloWeight",
      "visionEloWeight",
      "creativeEloWeight",
      "instructionEloWeight",
      // @deprecated 兼容旧字段
      "complexityWeight",
      "costWeight",
      "speedWeight",
    ] as const;
    for (const field of weightFields) {
      const val = (config.smartRouting as Record<string, unknown>)[field];
      if (val !== undefined && (typeof val !== "number" || (val) < 0 || (val) > 100)) {
        throw new Error(`400 Bad Request: ${field} must be between 0 and 100`);
      }
    }
  }
}

/**
 * 验证通道策略配置格式
 */
function validateChannelPoliciesConfig(config: any): void {
  if (!config || typeof config !== "object") {
    throw new Error("400 Bad Request: Invalid config format");
  }

  if (!Array.isArray(config.bindings)) {
    throw new Error("400 Bad Request: bindings must be an array");
  }

  const validPolicies = new Set([
    "private",
    "monitor",
    "listen_only",
    "filter",
    "scheduled",
    "forward",
    "smart_route",
    "broadcast",
    "round_robin",
    "queue",
    "moderate",
    "echo",
  ]);

  if (!validPolicies.has(config.defaultPolicy)) {
    throw new Error(`400 Bad Request: invalid defaultPolicy '${config.defaultPolicy}'`);
  }

  // 验证 bindings 中的每一项
  for (const binding of config.bindings) {
    if (!binding.channelId) {
      throw new Error("400 Bad Request: binding must have channelId");
    }
    if (!validPolicies.has(binding.policy)) {
      throw new Error(`400 Bad Request: invalid policy '${binding.policy}' in binding`);
    }
    // 验证策略配置
    if (binding.policyConfig && typeof binding.policyConfig !== "object") {
      throw new Error("400 Bad Request: policyConfig must be an object");
    }
  }
}
