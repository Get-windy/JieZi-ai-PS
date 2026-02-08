/**
 * Phase 5 Gateway RPC API - Agent Configuration
 * 智能助手配置管理 API
 *
 * 实现：
 * - agent.modelAccounts.get/update - 模型账号配置管理
 * - agent.channelPolicies.get/update - 通道策略配置管理
 */

import type { ConfigAgent } from "../../config/types.js";
import type { GatewayServer } from "../server.js";
import { loadConfig, saveConfig } from "../../config/config.js";

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

  // TODO: 权限检查 - 确保操作员有权访问该智能助手的配置
  // const hasPermission = await checkPermission(context.operator, "agent.config.read", agentId);
  // if (!hasPermission) {
  //   throw new Error("403 Forbidden: No permission to access agent configuration");
  // }

  // 加载配置
  const config = await loadConfig();
  const agent = findAgent(config, agentId);

  if (!agent) {
    throw new Error(`404 Not Found: Agent ${agentId} not found`);
  }

  // 返回模型账号配置
  // TODO: 从agent配置中提取modelAccounts字段
  const modelAccountsConfig = (agent as any).modelAccounts || {
    accounts: [],
    routingMode: "manual",
  };

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

  // TODO: 权限检查 - 确保操作员有权修改该智能助手的配置
  // const hasPermission = await checkPermission(context.operator, "agent.config.write", agentId);
  // if (!hasPermission) {
  //   throw new Error("403 Forbidden: No permission to modify agent configuration");
  // }

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

  // TODO: 记录日志
  console.log(`[Phase5] Model accounts config updated for agent ${agentId}`);

  return { success: true };
}

/**
 * 获取通道策略配置
 */
async function handleGetChannelPolicies(params: { agentId: string }, context: any): Promise<any> {
  const { agentId } = params;

  // TODO: 权限检查
  // const hasPermission = await checkPermission(context.operator, "agent.config.read", agentId);
  // if (!hasPermission) {
  //   throw new Error("403 Forbidden");
  // }

  const config = await loadConfig();
  const agent = findAgent(config, agentId);

  if (!agent) {
    throw new Error(`404 Not Found: Agent ${agentId} not found`);
  }

  // TODO: 从agent配置中提取channelPolicies字段
  const channelPoliciesConfig = (agent as any).channelPolicies || {
    bindings: [],
    defaultPolicy: "private",
  };

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

  // TODO: 权限检查
  // const hasPermission = await checkPermission(context.operator, "agent.config.write", agentId);
  // if (!hasPermission) {
  //   throw new Error("403 Forbidden");
  // }

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

  // TODO: 记录日志
  console.log(`[Phase5] Channel policies config updated for agent ${agentId}`);

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

  if (!["manual", "smart"].includes(config.routingMode)) {
    throw new Error("400 Bad Request: routingMode must be 'manual' or 'smart'");
  }

  // TODO: 更详细的验证逻辑
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

  const validPolicies = [
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
  ];

  if (!validPolicies.includes(config.defaultPolicy)) {
    throw new Error(`400 Bad Request: invalid defaultPolicy '${config.defaultPolicy}'`);
  }

  // TODO: 验证bindings中的每个项
  for (const binding of config.bindings) {
    if (!binding.channelId) {
      throw new Error("400 Bad Request: binding must have channelId");
    }
    if (!validPolicies.includes(binding.policy)) {
      throw new Error(`400 Bad Request: invalid policy '${binding.policy}' in binding`);
    }
  }
}
