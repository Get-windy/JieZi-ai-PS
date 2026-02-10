/**
 * Agents Management RPC Handlers
 *
 * 提供智能助手管理相关的RPC方法：
 * - agent.list - 列出所有智能助手
 * - agent.modelAccounts.list - 获取智能助手的模型账号配置
 * - agent.modelAccounts.update - 更新智能助手的模型账号配置
 * - agent.modelAccounts.bound - 获取智能助手绑定的模型账号
 * - agent.modelAccounts.available - 获取可用但未绑定的模型账号
 * - agent.modelAccounts.bind - 绑定模型账号到智能助手
 * - agent.modelAccounts.unbind - 解绑智能助手的模型账号
 * - agent.channelPolicies.list - 获取智能助手的通道策略配置
 * - agent.channelPolicies.update - 更新智能助手的通道策略配置
 * - agent.channelAccounts.list - 获取智能助手绑定的通道账号
 * - agent.channelAccounts.add - 为智能助手添加通道账号绑定
 * - agent.channelAccounts.remove - 移除智能助手的通道账号绑定
 * - agent.channelAccounts.available - 获取可用但未绑定的通道账号
 */

import type { AgentModelAccountsConfig, AgentBinding } from "../../config/types.agents.js";
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
import { getChannelPlugin, listChannelPlugins } from "../../channels/plugins/index.js";
import { listAgentEntries, findAgentEntryIndex } from "../../commands/agents.config.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../../config/config.js";
import { listBindings } from "../../routing/bindings.js";
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

  const validPolicies = new Set([
    "private",
    "monitor",
    "listen-only",
    "load-balance",
    "queue",
    "moderate",
    "echo",
  ]);

  // 验证默认策略
  if (config.defaultPolicy && !validPolicies.has(config.defaultPolicy.type)) {
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
    if (!validPolicies.has(binding.policy.type)) {
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

  /**
   * agent.channelAccounts.list - 获取智能助手绑定的通道账号
   */
  "agent.channelAccounts.list": ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const normalized = normalizeAgentId(agentId);
    const bindings = listBindings(cfg);

    // 筛选出该助手的绑定
    const agentBindings = bindings.filter((b) => normalizeAgentId(b.agentId) === normalized);

    // 按通道分组
    const bindingsByChannel = new Map<string, Set<string>>();
    for (const binding of agentBindings) {
      if (!binding.match?.channel) {
        continue;
      }
      const channelId = binding.match.channel;
      const accountId = binding.match.accountId || "default";
      if (!bindingsByChannel.has(channelId)) {
        bindingsByChannel.set(channelId, new Set());
      }
      bindingsByChannel.get(channelId)!.add(accountId);
    }

    const result = Array.from(bindingsByChannel.entries()).map(([channelId, accountIds]) => ({
      channelId,
      accountIds: Array.from(accountIds),
    }));

    respond(true, { agentId, bindings: result }, undefined);
  },

  /**
   * agent.channelAccounts.add - 为智能助手添加通道账号绑定
   */
  "agent.channelAccounts.add": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    const channelId = String((params as any)?.channelId ?? "").trim();
    const accountId = String((params as any)?.accountId ?? "").trim();

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!channelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "channelId is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
      );
      return;
    }

    const cfg = snapshot.config;
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 验证通道是否存在
    const plugin = getChannelPlugin(channelId as any);
    if (!plugin) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Unknown channel: ${channelId}`),
      );
      return;
    }

    const normalized = normalizeAgentId(agentId);
    const bindings = listBindings(cfg);

    // 检查是否已经绑定
    const existingBinding = bindings.find(
      (b) =>
        normalizeAgentId(b.agentId) === normalized &&
        b.match?.channel === channelId &&
        (b.match?.accountId || "default") === (accountId || "default"),
    );

    if (existingBinding) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Binding already exists for ${channelId}:${accountId || "default"}`,
        ),
      );
      return;
    }

    // 添加新绑定
    const newBinding: AgentBinding = {
      agentId,
      match: {
        channel: channelId,
      },
    };

    if (accountId) {
      newBinding.match.accountId = accountId;
    }

    const updatedConfig: OpenClawConfig = {
      ...cfg,
      bindings: [...bindings, newBinding],
    };

    try {
      await writeConfigFile(updatedConfig);
      respond(true, { success: true, agentId, channelId, accountId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
      );
    }
  },

  /**
   * agent.channelAccounts.remove - 移除智能助手的通道账号绑定
   */
  "agent.channelAccounts.remove": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    const channelId = String((params as any)?.channelId ?? "").trim();
    const accountId = String((params as any)?.accountId ?? "").trim();

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!channelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "channelId is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
      );
      return;
    }

    const cfg = snapshot.config;
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const normalized = normalizeAgentId(agentId);
    const bindings = listBindings(cfg);

    // 找到并移除绑定
    const filteredBindings = bindings.filter(
      (b) =>
        !(
          normalizeAgentId(b.agentId) === normalized &&
          b.match?.channel === channelId &&
          (b.match?.accountId || "default") === (accountId || "default")
        ),
    );

    if (filteredBindings.length === bindings.length) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Binding not found for ${channelId}:${accountId || "default"}`,
        ),
      );
      return;
    }

    const updatedConfig: OpenClawConfig = {
      ...cfg,
      bindings: filteredBindings,
    };

    try {
      await writeConfigFile(updatedConfig);
      respond(true, { success: true, agentId, channelId, accountId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
      );
    }
  },

  /**
   * agent.channelAccounts.available - 获取可用但未绑定的通道账号
   */
  "agent.channelAccounts.available": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const normalized = normalizeAgentId(agentId);
    const bindings = listBindings(cfg);

    // 获取已绑定的通道账号
    const boundAccounts = new Set<string>();
    for (const binding of bindings) {
      if (normalizeAgentId(binding.agentId) !== normalized) {
        continue;
      }
      if (!binding.match?.channel) {
        continue;
      }
      const key = `${binding.match.channel}:${binding.match.accountId || "default"}`;
      boundAccounts.add(key);
    }

    // 获取所有可用的通道账号
    const availableAccounts: Array<{
      channelId: string;
      accountId: string;
      label: string;
      configured: boolean;
    }> = [];

    const promises: Array<Promise<void>> = [];

    for (const plugin of listChannelPlugins()) {
      const channelId = plugin.id;
      const accountIds = plugin.config.listAccountIds(cfg);

      for (const accountId of accountIds) {
        const key = `${channelId}:${accountId}`;
        if (!boundAccounts.has(key)) {
          const checkPromise = (async () => {
            const account = plugin.config.resolveAccount(cfg, accountId);
            let configured = true;
            if (plugin.config.isConfigured) {
              try {
                configured = await plugin.config.isConfigured(account, cfg);
              } catch {
                configured = false;
              }
            }

            const channelLabel = (plugin.meta as any).label || plugin.id;
            availableAccounts.push({
              channelId,
              accountId,
              label: `${channelLabel} - ${accountId}`,
              configured,
            });
          })();
          promises.push(checkPromise);
        }
      }
    }

    await Promise.all(promises);
    respond(true, { agentId, accounts: availableAccounts }, undefined);
  },

  /**
   * agent.modelAccounts.bound - 获取智能助手绑定的模型账号
   */
  "agent.modelAccounts.bound": ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 获取助手的modelAccounts配置
    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    const boundAccounts = modelAccounts?.accounts || [];
    const defaultAccountId = modelAccounts?.defaultAccountId || "";

    respond(true, { agentId, accounts: boundAccounts, defaultAccountId }, undefined);
  },

  /**
   * agent.modelAccounts.available - 获取可用但未绑定的模型账号
   */
  "agent.modelAccounts.available": ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 获取所有可用的模型账号（从 models.providers 中获取）
    const allModelAccounts = Object.keys(cfg.models?.providers ?? {});

    // 获取已绑定的模型账号
    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    const boundSet = new Set(modelAccounts?.accounts || []);

    // 过滤出未绑定的
    const availableAccounts = allModelAccounts.filter((accountId) => !boundSet.has(accountId));

    respond(true, { agentId, accounts: availableAccounts }, undefined);
  },

  /**
   * agent.modelAccounts.bind - 绑定模型账号到智能助手
   */
  "agent.modelAccounts.bind": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    const accountId = String((params as any)?.accountId ?? "").trim();

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!accountId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "accountId is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
      );
      return;
    }

    const cfg = snapshot.config;
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 验证模型账号是否存在（从 models.providers 中检查）
    const allModelAccounts = Object.keys(cfg.models?.providers ?? {});
    if (!allModelAccounts.includes(accountId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Unknown model account: ${accountId}`),
      );
      return;
    }

    // 获取当前配置
    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    const currentAccounts = modelAccounts?.accounts || [];

    // 检查是否已绑定
    if (currentAccounts.includes(accountId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Model account already bound: ${accountId}`),
      );
      return;
    }

    // 添加到accounts列表
    const updatedAccounts = [...currentAccounts, accountId];
    const updatedConfig = {
      ...modelAccounts,
      accounts: updatedAccounts,
      // 如果是第一个账号，设为默认
      defaultAccountId: modelAccounts?.defaultAccountId || accountId,
    };

    const success = await updateAgentField(agentId, "modelAccounts", updatedConfig, respond);
    if (success) {
      respond(true, { success: true, agentId, accountId }, undefined);
    }
  },

  /**
   * agent.modelAccounts.unbind - 解绑智能助手的模型账号
   */
  "agent.modelAccounts.unbind": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    const accountId = String((params as any)?.accountId ?? "").trim();

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!accountId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "accountId is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
      );
      return;
    }

    const cfg = snapshot.config;
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 获取当前配置
    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    const currentAccounts = modelAccounts?.accounts || [];

    // 检查是否已绑定
    if (!currentAccounts.includes(accountId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Model account not bound: ${accountId}`),
      );
      return;
    }

    // 从 accounts 列表中移除
    const updatedAccounts = currentAccounts.filter((id) => id !== accountId);

    // 如果移除的是默认账号，选择新的默认账号
    let defaultAccountId = modelAccounts?.defaultAccountId;
    if (defaultAccountId === accountId) {
      defaultAccountId = updatedAccounts[0] || "";
    }

    const updatedConfig = {
      ...modelAccounts,
      accounts: updatedAccounts,
      defaultAccountId,
    };

    const success = await updateAgentField(agentId, "modelAccounts", updatedConfig, respond);
    if (success) {
      respond(true, { success: true, agentId, accountId }, undefined);
    }
  },

  /**
   * agent.modelAccounts.config.get - 获取模型账号的配置（启用/停用、用量控制等）
   */
  "agent.modelAccounts.config.get": ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    const accountId = String((params as any)?.accountId ?? "").trim();

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!accountId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "accountId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 获取助手的modelAccounts配置
    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    const accountConfigs = (modelAccounts as any)?.accountConfigs || {};
    const accountConfig = accountConfigs[accountId] || {
      enabled: true, // 默认启用
      priority: 0,
      schedule: null,
      usageLimit: null,
      healthCheck: null,
    };

    respond(true, { agentId, accountId, config: accountConfig }, undefined);
  },

  /**
   * agent.modelAccounts.config.update - 更新模型账号配置
   *
   * 配置项包括：
   * - enabled: boolean - 启用/停用
   * - priority: number - 优先级（数字越大优先级越高）
   * - schedule: { enabledHours: [start, end][], timezone?: string } - 定时启用/停用
   * - usageLimit: { maxTokens: number, period: 'hour'|'day'|'month', autoDisable: boolean } - 用量控制
   * - healthCheck: { errorThreshold: number, cooldownMinutes: number } - 健康检查
   */
  "agent.modelAccounts.config.update": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    const accountId = String((params as any)?.accountId ?? "").trim();
    const config = (params as any)?.config;

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!accountId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "accountId is required"));
      return;
    }
    if (!config || typeof config !== "object") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
      );
      return;
    }

    const cfg = snapshot.config;
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 验证账号已绑定
    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    const boundAccounts = modelAccounts?.accounts || [];
    if (!boundAccounts.includes(accountId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Model account not bound: ${accountId}`),
      );
      return;
    }

    // 更新配置
    const accountConfigs = (modelAccounts as any)?.accountConfigs || {};
    const updatedConfig = {
      ...modelAccounts,
      accountConfigs: {
        ...accountConfigs,
        [accountId]: config,
      },
    };

    const success = await updateAgentField(agentId, "modelAccounts", updatedConfig, respond);
    if (success) {
      respond(true, { success: true, agentId, accountId, config }, undefined);
    }
  },

  /**
   * agent.modelAccounts.config.toggle - 快速切换账号启用/停用状态
   */
  "agent.modelAccounts.config.toggle": async ({ params, respond }) => {
    const agentId = String(params?.agentId ?? "").trim();
    const accountId = String((params as any)?.accountId ?? "").trim();
    const enabled = Boolean((params as any)?.enabled);

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!accountId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "accountId is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before updating"),
      );
      return;
    }

    const cfg = snapshot.config;
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    // 验证账号已绑定
    const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
    const boundAccounts = modelAccounts?.accounts || [];
    if (!boundAccounts.includes(accountId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Model account not bound: ${accountId}`),
      );
      return;
    }

    // 更新启用状态
    const accountConfigs = (modelAccounts as any)?.accountConfigs || {};
    const currentConfig = accountConfigs[accountId] || { enabled: true };
    const updatedConfig = {
      ...modelAccounts,
      accountConfigs: {
        ...accountConfigs,
        [accountId]: {
          ...currentConfig,
          enabled,
        },
      },
    };

    const success = await updateAgentField(agentId, "modelAccounts", updatedConfig, respond);
    if (success) {
      respond(true, { success: true, agentId, accountId, enabled }, undefined);
    }
  },
};
