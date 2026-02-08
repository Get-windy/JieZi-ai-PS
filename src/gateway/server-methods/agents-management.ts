/**
 * Agents Management RPC Handlers
 *
 * 提供智能助手管理相关的RPC方法：
 * - agent.list - 列出所有智能助手
 * - agent.modelAccounts.list - 获取智能助手的模型账号配置
 * - agent.modelAccounts.update - 更新智能助手的模型账号配置
 * - agent.channelPolicies.list - 获取智能助手的通道策略配置
 * - agent.channelPolicies.update - 更新智能助手的通道策略配置
 */

import type { AgentModelAccountsConfig } from "../../config/types.agents.js";
import type {
  AgentChannelBindings,
  ChannelAccountBinding,
} from "../../config/types.channel-bindings.js";
import type { OpenClawConfig } from "../../config/types.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";
import {
  listAgentIds,
  resolveAgentModelAccounts,
  listAgentModelAccounts,
} from "../../agents/agent-scope.js";
import { listAgentEntries, findAgentEntryIndex } from "../../commands/agents.config.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../../config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 验证智能助手ID是否存在
 */
function validateAgentId(agentId: string, cfg: OpenClawConfig, respond: RespondFn): boolean {
  const normalized = normalizeAgentId(agentId);
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(normalized)) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `Unknown agent ID: ${agentId}`),
    );
    return false;
  }
  return true;
}

/**
 * 验证模型账号配置
 */
function validateModelAccountsConfig(config: any): void {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config format");
  }

  if (!Array.isArray(config.accounts)) {
    throw new Error("accounts must be an array");
  }

  const validRoutingModes = ["manual", "smart"];
  if (!validRoutingModes.includes(config.routingMode)) {
    throw new Error(`Invalid routingMode: ${config.routingMode}`);
  }

  // 验证智能路由配置
  if (config.routingMode === "smart" && config.smartRouting) {
    const sr = config.smartRouting;
    if (
      sr.complexityWeight !== undefined &&
      (sr.complexityWeight < 0 || sr.complexityWeight > 100)
    ) {
      throw new Error("complexityWeight must be between 0 and 100");
    }
    if (
      sr.capabilityWeight !== undefined &&
      (sr.capabilityWeight < 0 || sr.capabilityWeight > 100)
    ) {
      throw new Error("capabilityWeight must be between 0 and 100");
    }
    if (sr.costWeight !== undefined && (sr.costWeight < 0 || sr.costWeight > 100)) {
      throw new Error("costWeight must be between 0 and 100");
    }
    if (sr.speedWeight !== undefined && (sr.speedWeight < 0 || sr.speedWeight > 100)) {
      throw new Error("speedWeight must be between 0 and 100");
    }
  }
}

/**
 * 验证通道策略配置
 */
function validateChannelPoliciesConfig(config: any): void {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config format");
  }

  if (!Array.isArray(config.bindings)) {
    throw new Error("bindings must be an array");
  }

  const validPolicies = [
    "private",
    "monitor",
    "listen-only",
    "load-balance",
    "queue",
    "moderate",
    "echo",
  ];

  // 验证默认策略
  if (config.defaultPolicy && !validPolicies.includes(config.defaultPolicy.type)) {
    throw new Error(`Invalid defaultPolicy type: ${config.defaultPolicy.type}`);
  }

  // 验证每个绑定
  for (const binding of config.bindings) {
    if (!binding.id) {
      throw new Error("Binding must have an ID");
    }
    if (!binding.channelId) {
      throw new Error("Binding must have a channelId");
    }
    if (!binding.accountId) {
      throw new Error("Binding must have an accountId");
    }
    if (!binding.policy || !binding.policy.type) {
      throw new Error("Binding must have a policy with type");
    }
    if (!validPolicies.includes(binding.policy.type)) {
      throw new Error(`Invalid policy type: ${binding.policy.type}`);
    }
  }
}

/**
 * 获取智能助手的通道绑定配置
 */
function getAgentChannelBindings(
  cfg: OpenClawConfig,
  agentId: string,
): AgentChannelBindings | null {
  const normalized = normalizeAgentId(agentId);
  const agents = listAgentEntries(cfg);
  const agent = agents.find((a) => normalizeAgentId(a.id) === normalized);

  if (!agent) {
    return null;
  }

  // 从agent配置中提取channelBindings
  return (agent as any).channelBindings || null;
}

/**
 * 更新智能助手配置中的字段
 */
async function updateAgentField(
  agentId: string,
  fieldName: string,
  fieldValue: any,
  respond: RespondFn,
): Promise<boolean> {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
    );
    return false;
  }

  const cfg = snapshot.config;
  const normalized = normalizeAgentId(agentId);
  const agents = listAgentEntries(cfg);
  const agentIndex = findAgentEntryIndex(agents, normalized);

  if (agentIndex < 0) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${agentId}`),
    );
    return false;
  }

  // 更新agent配置
  const updatedAgent = {
    ...agents[agentIndex],
    [fieldName]: fieldValue,
  };

  agents[agentIndex] = updatedAgent;

  // 更新完整配置
  const updatedConfig: OpenClawConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: agents,
    },
  };

  try {
    await writeConfigFile(updatedConfig);
    return true;
  } catch (err) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
    );
    return false;
  }
}

/**
 * RPC 处理器
 */
export const agentsManagementHandlers: GatewayRequestHandlers = {
  /**
   * agent.list - 列出所有智能助手
   */
  "agent.list": ({ respond }) => {
    const cfg = loadConfig();
    const agents = listAgentEntries(cfg);

    const result = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      default: agent.default || false,
      workspace: agent.workspace,
      model: agent.model,
      modelAccountId: agent.modelAccountId,
      channelAccountIds: agent.channelAccountIds,
    }));

    respond(true, { agents: result }, undefined);
  },

  /**
   * agent.modelAccounts.list - 获取智能助手的模型账号配置
   */
  "agent.modelAccounts.list": ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    if (!modelAccounts) {
      respond(true, { agentId, config: null }, undefined);
      return;
    }

    respond(true, { agentId, config: modelAccounts }, undefined);
  },

  /**
   * agent.modelAccounts.update - 更新智能助手的模型账号配置
   */
  "agent.modelAccounts.update": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const config = (params as any)?.config;
    if (!config) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 验证配置
    try {
      validateModelAccountsConfig(config);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Invalid config: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
      return;
    }

    // 更新配置
    const success = await updateAgentField(agentId, "modelAccounts", config, respond);
    if (success) {
      respond(true, { success: true, agentId }, undefined);
    }
  },

  /**
   * agent.channelPolicies.list - 获取智能助手的通道策略配置
   */
  "agent.channelPolicies.list": ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const channelBindings = getAgentChannelBindings(cfg, agentId);
    if (!channelBindings) {
      respond(true, { agentId, config: null }, undefined);
      return;
    }

    respond(true, { agentId, config: channelBindings }, undefined);
  },

  /**
   * agent.channelPolicies.update - 更新智能助手的通道策略配置
   */
  "agent.channelPolicies.update": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const config = (params as any)?.config;
    if (!config) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 验证配置
    try {
      validateChannelPoliciesConfig(config);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Invalid config: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
      return;
    }

    // 更新配置
    const success = await updateAgentField(agentId, "channelBindings", config, respond);
    if (success) {
      respond(true, { success: true, agentId }, undefined);
    }
  },
};
