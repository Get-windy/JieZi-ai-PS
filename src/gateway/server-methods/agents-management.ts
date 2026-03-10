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

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentModelAccounts,
  resolveAgentWorkspaceDir,
} from "../../agents/agent-scope.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import { groupWorkspaceManager } from "../../workspace/group-workspace.js";
import { getChannelPlugin, listChannelPlugins } from "../../channels/plugins/index.js";
import { listAgentEntries, findAgentEntryIndex } from "../../commands/agents.config.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../../config/config.js";
import type { AgentBinding, AgentConfig } from "../../config/types.agents.js";
import type { AgentChannelBindings } from "../../config/types.channel-bindings.js";
import type { OpenClawConfig } from "../../config/types.js";
import { listBindings } from "../../routing/bindings.js";
import { normalizeAgentId, DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { chatHandlers } from "./chat.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

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
function validateModelAccountsConfig(config: unknown): void {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config format");
  }

  const cfg = config as Record<string, unknown>;
  if (!Array.isArray(cfg.accounts)) {
    throw new Error("accounts must be an array");
  }

  const validRoutingModes = ["manual", "smart"];
  if (!validRoutingModes.includes(cfg.routingMode as string)) {
    throw new Error(`Invalid routingMode: ${String(cfg.routingMode)}`);
  }

  // 验证智能路由配置
  if (cfg.routingMode === "smart" && cfg.smartRouting) {
    const sr = cfg.smartRouting as Record<string, unknown>;
    if (
      sr.complexityWeight !== undefined &&
      (typeof sr.complexityWeight !== "number" ||
        sr.complexityWeight < 0 ||
        sr.complexityWeight > 100)
    ) {
      throw new Error("complexityWeight must be between 0 and 100");
    }
    if (
      sr.capabilityWeight !== undefined &&
      (typeof sr.capabilityWeight !== "number" ||
        sr.capabilityWeight < 0 ||
        sr.capabilityWeight > 100)
    ) {
      throw new Error("capabilityWeight must be between 0 and 100");
    }
    if (
      sr.costWeight !== undefined &&
      (typeof sr.costWeight !== "number" || sr.costWeight < 0 || sr.costWeight > 100)
    ) {
      throw new Error("costWeight must be between 0 and 100");
    }
    if (
      sr.speedWeight !== undefined &&
      (typeof sr.speedWeight !== "number" || sr.speedWeight < 0 || sr.speedWeight > 100)
    ) {
      throw new Error("speedWeight must be between 0 and 100");
    }
  }
}

/**
 * 验证通道策略配置
 */
function validateChannelPoliciesConfig(config: unknown): void {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config format");
  }

  const cfg = config as Record<string, unknown>;
  if (!Array.isArray(cfg.bindings)) {
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
  const defaultPolicy = cfg.defaultPolicy as { type?: string } | undefined;
  if (defaultPolicy && !validPolicies.has(defaultPolicy.type as string)) {
    throw new Error(`Invalid defaultPolicy type: ${defaultPolicy.type}`);
  }

  // 验证每个绑定
  for (const binding of cfg.bindings as Array<Record<string, unknown>>) {
    if (!binding.id) {
      throw new Error("Binding must have an ID");
    }
    if (!binding.channelId) {
      throw new Error("Binding must have a channelId");
    }
    if (!binding.accountId) {
      throw new Error("Binding must have an accountId");
    }
    const policy = binding.policy as { type?: string } | undefined;
    if (!policy || !policy.type) {
      throw new Error("Binding must have a policy with type");
    }
    if (!validPolicies.has(policy.type)) {
      throw new Error(`Invalid policy type: ${policy.type}`);
    }
  }
}

/**
 * 获取智能助手的通道绑定配置
 *
 * 优先从 agent.channelBindings 读取，如果没有则从全局 config.bindings[] 读取并转换格式
 * 这样可以兼容旧的通道绑定机制（通过助手管理页面的通道标签页绑定的数据）
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

  // 优先从agent配置中提取channelBindings（新机制）
  const channelBindings = (agent as { channelBindings?: AgentChannelBindings }).channelBindings;

  if (channelBindings && channelBindings.bindings && channelBindings.bindings.length > 0) {
    return channelBindings;
  }

  // 如果没有，从config.bindings[]读取并转换（旧机制兼容）
  const globalBindings = listBindings(cfg);
  const agentGlobalBindings = globalBindings.filter(
    (b) => normalizeAgentId(b.agentId) === normalized && b.match?.channel,
  );

  if (agentGlobalBindings.length > 0) {
    // 转换为新格式
    const convertedBindings = agentGlobalBindings.map((b, index) => ({
      id: `${b.match.channel}-${b.match.accountId || "default"}-${index}`,
      channelId: b.match.channel,
      accountId: b.match.accountId || "default",
      policy: {
        type: "private" as const,
        config: {
          allowedUsers: [],
        },
      },
      enabled: true,
      priority: 50,
    }));

    return {
      bindings: convertedBindings,
      defaultPolicy: {
        type: "private",
        config: {
          allowedUsers: [],
        },
      },
    };
  }

  // 如果都没有，返回默认空配置
  return {
    defaultPolicy: {
      type: "private",
      config: {
        allowedUsers: [],
      },
    },
    bindings: [],
  };
}

/**
 * 更新智能助手配置中的字段
 */
async function updateAgentField(
  agentId: string,
  fieldName: string,
  fieldValue: unknown,
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
      workspace: agent.workspace, // 配置的工作区（可能为空）
      workspaceResolved: resolveAgentWorkspaceDir(cfg, agent.id), // 实际解析后的工作区路径
      model: agent.model,
      // 注意：modelAccountId 和 channelAccountIds 是旧字段，已废弃
      modelAccountId: (agent as unknown as { modelAccountId?: string }).modelAccountId,
      channelAccountIds: (agent as unknown as { channelAccountIds?: string[] }).channelAccountIds,
      // 新增：返回通道绑定信息（用于前端导航树过滤）
      channelBindings: getAgentChannelBindings(cfg, agent.id),
    }));

    respond(true, { agents: result }, undefined);
  },

  /**
   * agent.modelAccounts.list - 获取智能助手的模型账号配置
   */
  "agent.modelAccounts.list": ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
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
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const config = (params as { config?: unknown })?.config;
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
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "errors.agentIdRequired"));
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
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "errors.agentIdRequired"));
      return;
    }

    const config = (params as { config?: unknown })?.config;
    if (!config) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "errors.configRequired"));
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
          `errors.invalidConfig: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
      return;
    }

    // 更新配置（使用channelBindings字段）
    const success = await updateAgentField(agentId, "channelBindings", config, respond);
    if (success) {
      respond(true, { success: true, agentId }, undefined);
    }
  },

  /**
   * agent.channelAccounts.list - 获取智能助手绑定的通道账号
   */
  "agent.channelAccounts.list": ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
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

    // 扩展为平铺列表，每个 channelId:accountId 组合为一个条目
    const result = agentBindings
      .filter((b) => b.match?.channel)
      .map((b) => ({
        channelId: b.match.channel,
        accountId: b.match.accountId || "default",
      }));

    respond(true, { agentId, bindings: result }, undefined);
  },

  /**
   * agent.channelAccounts.add - 为智能助手添加通道账号绑定
   */
  "agent.channelAccounts.add": async ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    const channelId = String((params as { channelId?: string | number })?.channelId ?? "").trim();
    const accountId = String((params as { accountId?: string | number })?.accountId ?? "").trim();

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
    const plugin = getChannelPlugin(channelId);
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

    // 检查该通道账号是否已被其他助手绑定（排他性绑定）
    const otherAgentBinding = bindings.find(
      (b) =>
        normalizeAgentId(b.agentId) !== normalized &&
        b.match?.channel === channelId &&
        (b.match?.accountId || "default") === (accountId || "default"),
    );

    if (otherAgentBinding) {
      const otherAgentId = otherAgentBinding.agentId;
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Channel account ${channelId}:${accountId || "default"} is already bound to agent "${otherAgentId}". A channel account can only be bound to one agent.`,
        ),
      );
      return;
    }

    // 检查当前助手是否已经绑定该通道账号
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
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    const channelId = String((params as { channelId?: string | number })?.channelId ?? "").trim();
    const accountId = String((params as { accountId?: string | number })?.accountId ?? "").trim();

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
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    const bindings = listBindings(cfg);

    // 获取所有已被绑定的通道账号（包括其他助手绑定的）
    const allBoundAccounts = new Set<string>();
    for (const binding of bindings) {
      if (!binding.match?.channel) {
        continue;
      }
      const key = `${binding.match.channel}:${binding.match.accountId || "default"}`;
      allBoundAccounts.add(key);
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
        // 排除所有已被任何助手绑定的通道账号（排他性绑定）
        if (!allBoundAccounts.has(key)) {
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

            const channelLabel = (plugin.meta as { label?: string }).label || plugin.id;
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
   * agent.modelAccounts.bound - 获取智能助手绑定的模型（带详细信息）
   * 返回模型列表，而不是认证账号
   */
  "agent.modelAccounts.bound": async ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
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
    const boundAccounts = modelAccounts?.accounts || []; // 现在存储的是 providerId/modelName
    const defaultAccountId = modelAccounts?.defaultAccountId || "";

    try {
      // 从新的模型管理系统获取模型详情
      const { loadModelManagement } = await import("./models.js");
      const storage = await loadModelManagement();

      // 构建模型详情列表
      const modelDetails = boundAccounts.map((modelId) => {
        // 解析模型id：providerId/modelName
        const [providerId, modelName] = modelId.split("/");
        if (!providerId || !modelName) {
          return {
            modelId,
            providerId: "",
            modelName: modelId,
            displayName: modelId,
            providerName: "",
            enabled: false,
          };
        }

        // 查找模型配置
        const modelList = storage.models[providerId] || [];
        const model = modelList.find(
          (m) => m.modelName === modelName && m.enabled && !m.deprecated,
        );
        const provider = storage.providers.find((p: { id: string }) => p.id === providerId);

        // 检查认证是否启用
        let authEnabled = false;
        if (model) {
          const authList = storage.auths[providerId] || [];
          const auth = authList.find((a: { authId: string }) => a.authId === model.authId);
          authEnabled = auth?.enabled ?? false;
        }

        return {
          modelId, // providerId/modelName
          providerId,
          modelName,
          displayName: model?.nickname || modelName, // 优先显示昵称
          providerName: provider?.name || providerId,
          enabled: !!model && authEnabled, // 模型存在且认证启用
        };
      });

      respond(
        true,
        {
          agentId,
          accounts: boundAccounts, // modelId 列表
          modelDetails, // 模型详情
          defaultAccountId,
        },
        undefined,
      );
    } catch {
      // 如果无法获取详情，返回基本信息
      respond(true, { agentId, accounts: boundAccounts, defaultAccountId }, undefined);
    }
  },

  /**
   * agent.modelAccounts.available - 获取可用但未绑定的模型
   * 返回模型列表（providerId/modelName），而不是认证账号
   */
  "agent.modelAccounts.available": async ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(agentId, cfg, respond)) {
      return;
    }

    try {
      // 从新的模型管理系统获取所有启用的模型
      const { loadModelManagement } = await import("./models.js");
      const storage = await loadModelManagement();

      // 收集所有启用且可用的模型（带详情）
      const allModelsWithDetails: Array<{
        modelId: string; // providerId/modelName
        providerId: string;
        modelName: string;
        displayName: string;
        providerName: string;
      }> = [];

      for (const [providerId, modelList] of Object.entries(storage.models)) {
        const provider = storage.providers.find((p: { id: string }) => p.id === providerId);
        const authList = storage.auths[providerId] || [];

        for (const model of modelList) {
          // 1. 模型必须启用且未废弃
          if (!model.enabled || model.deprecated) {
            continue;
          }

          // 2. 该模型对应的认证必须启用
          const auth = authList.find((a: { authId: string }) => a.authId === model.authId);
          if (!auth || !auth.enabled) {
            continue;
          }

          const modelId = `${providerId}/${model.modelName}`;
          const displayName = `${provider?.name || providerId} - ${model.nickname || model.modelName}`;

          allModelsWithDetails.push({
            modelId,
            providerId,
            modelName: model.modelName,
            displayName,
            providerName: provider?.name || providerId,
          });
        }
      }

      // 获取已绑定的模型
      const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
      const boundSet = new Set(modelAccounts?.accounts || []);

      // 过滤出未绑定的
      const availableModelsWithDetails = allModelsWithDetails.filter(
        (model) => !boundSet.has(model.modelId),
      );

      respond(
        true,
        {
          agentId,
          accounts: availableModelsWithDetails.map((m) => m.modelId),
          modelDetails: availableModelsWithDetails, // 模型详情（含友好名称）
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * agent.modelAccounts.bind - 绑定模型到智能助手
   * 绑定的是模型（providerId/modelName），而不是认证账号
   */
  "agent.modelAccounts.bind": async ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    const modelId = String((params as { accountId?: string | number })?.accountId ?? "").trim(); // 兼容旧参数名

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId is required"));
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

    try {
      // 验证模型是否存在（从新的模型管理系统检查）
      const { loadModelManagement } = await import("./models.js");
      const storage = await loadModelManagement();

      // 解析 modelId 格式：providerId/modelName
      // 注意：modelName 可能包含斜杠（如 Pro/deepseek-ai/DeepSeek-V3.2）
      const slashIndex = modelId.indexOf("/");
      if (slashIndex === -1) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid model ID format: ${modelId}, expected: providerId/modelName`,
          ),
        );
        return;
      }
      const providerId = modelId.substring(0, slashIndex);
      const modelName = modelId.substring(slashIndex + 1);
      if (!providerId || !modelName) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid model ID format: ${modelId}, expected: providerId/modelName`,
          ),
        );
        return;
      }

      // 检查模型是否存在且启用
      const modelList = storage.models[providerId] || [];
      const model = modelList.find((m) => m.modelName === modelName);
      if (!model) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Unknown model: ${modelId}`),
        );
        return;
      }

      if (!model.enabled) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Model is disabled: ${modelId}`),
        );
        return;
      }

      if (model.deprecated) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Model is deprecated: ${modelId}`),
        );
        return;
      }

      // 检查该模型对应的认证是否启用
      const authList = storage.auths[providerId] || [];
      const auth = authList.find(
        (a: unknown) => (a as { authId?: string })?.authId === model.authId,
      );
      if (!auth || !auth.enabled) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Model's authentication is not available: ${modelId}`,
          ),
        );
        return;
      }

      // 获取当前配置
      const modelAccounts = resolveAgentModelAccounts(cfg, agentId);
      const currentAccounts = modelAccounts?.accounts || [];

      // 检查是否已绑定
      if (currentAccounts.includes(modelId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Model already bound: ${modelId}`),
        );
        return;
      }

      // 添加到accounts列表
      const updatedAccounts = [...currentAccounts, modelId];
      const updatedConfig = {
        routingMode: "manual" as const, // 首次绑定默认手动模式；已有配置则被 spread 覆盖
        ...modelAccounts,
        accounts: updatedAccounts,
        // 如果是第一个模型，设为默认
        defaultAccountId: modelAccounts?.defaultAccountId || modelId,
      };

      const success = await updateAgentField(agentId, "modelAccounts", updatedConfig, respond);
      if (success) {
        respond(true, { success: true, agentId, modelId }, undefined);
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * agent.modelAccounts.unbind - 解绑智能助手的模型
   * 解绑的是模型（providerId/modelName）
   */
  "agent.modelAccounts.unbind": async ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    const modelId = String((params as { accountId?: string | number })?.accountId ?? "").trim(); // 兼容旧参数名

    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (!modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId is required"));
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
    if (!currentAccounts.includes(modelId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Model not bound: ${modelId}`),
      );
      return;
    }

    // 从 accounts 列表中移除
    const updatedAccounts = currentAccounts.filter((id) => id !== modelId);

    // 如果移除的是默认模型，选择新的默认模型
    let defaultAccountId = modelAccounts?.defaultAccountId;
    if (defaultAccountId === modelId) {
      defaultAccountId = updatedAccounts[0] || "";
    }

    const updatedConfig = {
      ...modelAccounts,
      accounts: updatedAccounts,
      defaultAccountId,
    };

    const success = await updateAgentField(agentId, "modelAccounts", updatedConfig, respond);
    if (success) {
      respond(true, { success: true, agentId, modelId }, undefined);
    }
  },

  /**
   * agent.modelAccounts.config.get - 获取模型账号的配置（启用/停用、用量控制等）
   */
  "agent.modelAccounts.config.get": ({ params, respond }) => {
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    const accountId = String((params as { accountId?: string | number })?.accountId ?? "").trim();

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
    const accountConfigs =
      (modelAccounts as { accountConfigs?: Record<string, unknown> })?.accountConfigs || {};
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
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    const accountId = String((params as { accountId?: string | number })?.accountId ?? "").trim();
    const config = (params as { config?: unknown })?.config;

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
    const accountConfigs =
      (modelAccounts as { accountConfigs?: Record<string, unknown> })?.accountConfigs || {};
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
    const agentId = String((params as { agentId?: string | number })?.agentId ?? "").trim();
    const accountId = String((params as { accountId?: string | number })?.accountId ?? "").trim();
    const enabled = Boolean((params as { enabled?: unknown })?.enabled);

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
    const accountConfigs =
      (modelAccounts as { accountConfigs?: Record<string, unknown> })?.accountConfigs || {};
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

  /**
   * agent.create - 创建新的智能助手
   */
  "agent.create": async ({ params, respond }) => {
    const id = String((params as { id?: string | number })?.id ?? "").trim();
    const name = String((params as { name?: string | number })?.name ?? "").trim();
    const workspace = String((params as { workspace?: string | number })?.workspace ?? "").trim();

    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before creating agent"),
      );
      return;
    }

    const cfg = snapshot.config;
    const normalized = normalizeAgentId(id);
    const agents = listAgentEntries(cfg);

    // 检查ID是否已存在
    const existing = agents.find((a) => normalizeAgentId(a.id) === normalized);
    if (existing) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Agent ID already exists: ${id}`),
      );
      return;
    }

    // 创建新助手
    const newAgent: Record<string, unknown> = {
      id,
      name: name || id,
    };

    if (workspace) {
      newAgent.workspace = workspace;
    }

    // 添加到agents.list
    const updatedConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: [...agents, newAgent as AgentConfig],
      },
    };

    // 创建工作区目录（在保存配置之前）
    try {
      const workspaceDir = resolveAgentWorkspaceDir(updatedConfig, id);
      await fs.mkdir(workspaceDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create workspace directory for agent ${id}:`, err);
      // 工作区创建失败不影响配置保存，继续执行
    }

    try {
      await writeConfigFile(updatedConfig);
      respond(true, { success: true, agent: newAgent }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
      );
    }
  },

  /**
   * agent.update - 更新智能助手信息
   */
  "agent.update": async ({ params, respond }) => {
    type UpdateParams = {
      id?: string | number;
      name?: string | number;
      workspace?: string | number;
    };
    const id = String((params as UpdateParams)?.id ?? "").trim();
    const name =
      (params as UpdateParams)?.name !== undefined
        ? String((params as UpdateParams).name).trim()
        : undefined;
    const workspace =
      (params as UpdateParams)?.workspace !== undefined
        ? String((params as UpdateParams).workspace).trim()
        : undefined;

    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
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
    const normalized = normalizeAgentId(id);
    const agents = listAgentEntries(cfg);
    const agentIndex = findAgentEntryIndex(agents, normalized);

    if (agentIndex < 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${id}`));
      return;
    }

    // 更新助手信息
    const updatedAgent = { ...agents[agentIndex] };
    if (name !== undefined) {
      updatedAgent.name = name;
    }
    if (workspace !== undefined) {
      if (workspace) {
        updatedAgent.workspace = workspace;
      } else {
        delete (updatedAgent as Record<string, unknown>).workspace;
      }
    }

    agents[agentIndex] = updatedAgent;

    const updatedConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: agents,
      },
    };

    try {
      await writeConfigFile(updatedConfig);
      respond(true, { success: true, agent: updatedAgent }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
      );
    }
  },

  /**
   * agent.setDefault - 设置默认智能助手
   */
  "agent.setDefault": async ({ params, respond }) => {
    const id = String((params as { id?: string | number })?.id ?? "").trim();

    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
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
    const normalized = normalizeAgentId(id);
    const agents = listAgentEntries(cfg);
    let agentIndex = findAgentEntryIndex(agents, normalized);

    // 如果助手不在 agents.list 中，添加进去（可能是默认助手 main）
    if (agentIndex < 0) {
      // 验证助手ID是否在系统中存在（包括 main 和从磁盘扫描的助手）
      const allAgentIds = listAgentIds(cfg);
      const isValidMainAgent = normalized === normalizeAgentId(DEFAULT_AGENT_ID);

      // 允许：1) 在 agents.list 中的助手  2) 系统默认助手 main  3) 已存在的助手
      if (!allAgentIds.includes(normalized) && !isValidMainAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${id}`));
        return;
      }

      // 添加到 agents.list
      agents.push({ id: normalized, name: id });
      agentIndex = agents.length - 1;
    }

    // 移除所有其他助手的 default 标记（保证互斥）
    const updatedAgents = agents.map((agent, idx) => {
      if (idx === agentIndex) {
        // 设置当前助手为默认
        return { ...agent, default: true };
      } else {
        // 移除其他助手的默认标记
        const updated = { ...agent };
        delete (updated as Record<string, unknown>).default;
        return updated;
      }
    });

    const updatedConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: updatedAgents,
      },
    };

    try {
      await writeConfigFile(updatedConfig);
      respond(true, { success: true, id }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
      );
    }
  },

  /**
   * agent.workspace.getDefaultRoot - 获取默认工作区根目录及路径建议
   */
  "agent.workspace.getDefaultRoot": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const defaultRoot = cfg.agents?.defaults?.workspace || resolveDefaultAgentWorkspaceDir();

      respond(
        true,
        {
          defaultRoot,
          homeDir: os.homedir(),
          suggestions: [
            path.join(os.homedir(), "OpenClaw_Workspaces"),
            path.join(os.homedir(), "Documents", "OpenClaw"),
            defaultRoot,
          ],
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get default workspace root: ${String(err)}`),
      );
    }
  },

  /**
   * agent.workspace.validate - 验证工作区路径
   */
  "agent.workspace.validate": async ({ params, respond }) => {
    const workspacePath = String((params as { path?: string | number })?.path ?? "").trim();

    if (!workspacePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }

    try {
      const resolvedPath = path.resolve(workspacePath.replace(/^~/, os.homedir()));

      // 检查路径是否存在
      try {
        const stat = await fs.stat(resolvedPath);
        respond(
          true,
          {
            valid: true,
            exists: true,
            isDirectory: stat.isDirectory(),
            resolvedPath,
            canCreate: false,
          },
          undefined,
        );
      } catch (err: unknown) {
        // 路径不存在，检查是否可以创建
        if ((err as { code?: string })?.code === "ENOENT") {
          const parentDir = path.dirname(resolvedPath);
          try {
            await fs.access(parentDir, fs.constants.W_OK);
            respond(
              true,
              {
                valid: true,
                exists: false,
                isDirectory: false,
                resolvedPath,
                canCreate: true,
              },
              undefined,
            );
          } catch {
            respond(
              true,
              {
                valid: false,
                exists: false,
                isDirectory: false,
                resolvedPath,
                canCreate: false,
                error: "Parent directory does not exist or is not writable",
              },
              undefined,
            );
          }
        } else {
          throw err;
        }
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to validate workspace path: ${String(err)}`),
      );
    }
  },

  /**
   * agent.delete - 删除智能助手
   */
  "agent.delete": async ({ params, respond }) => {
    const id = String((params as { id?: string | number })?.id ?? "").trim();
    const deleteWorkspace = Boolean((params as { deleteWorkspace?: unknown })?.deleteWorkspace);

    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before deleting"),
      );
      return;
    }

    const cfg = snapshot.config;
    const normalized = normalizeAgentId(id);
    const agents = listAgentEntries(cfg);
    const agentIndex = findAgentEntryIndex(agents, normalized);

    if (agentIndex < 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${id}`));
      return;
    }

    // 检查是否是默认助手
    if (agents[agentIndex].default) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Cannot delete default agent"),
      );
      return;
    }

    // 获取工作区路径（如果需要删除）
    let workspaceDeleted = false;
    if (deleteWorkspace) {
      try {
        const workspaceDir = resolveAgentWorkspaceDir(cfg, id);
        await fs.rm(workspaceDir, { recursive: true, force: true });
        workspaceDeleted = true;
      } catch (err) {
        console.error(`Failed to delete workspace for agent ${id}:`, err);
        // 工作区删除失败不影响助手配置删除，继续执行
      }
    }

    // 从列表中移除
    const filteredAgents = agents.filter((_, idx) => idx !== agentIndex);

    // 同时移除该助手的所有绑定
    const bindings = listBindings(cfg);
    const filteredBindings = bindings.filter((b) => normalizeAgentId(b.agentId) !== normalized);

    const updatedConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: filteredAgents,
      },
      bindings: filteredBindings,
    };

    try {
      await writeConfigFile(updatedConfig);
      respond(true, { success: true, id, workspaceDeleted }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
      );
    }
  },

  /**
   * agent.workspace.migrate - 迁移智能助手工作区
   */
  "agent.workspace.migrate": async ({ params, respond }) => {
    const id = String((params as { id?: string | number })?.id ?? "").trim();
    const newWorkspace = String(
      (params as { newWorkspace?: string | number })?.newWorkspace ?? "",
    ).trim();

    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    if (!newWorkspace) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "newWorkspace is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before migrating"),
      );
      return;
    }

    const cfg = snapshot.config;
    const normalized = normalizeAgentId(id);
    const agents = listAgentEntries(cfg);
    const agentIndex = findAgentEntryIndex(agents, normalized);

    if (agentIndex < 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${id}`));
      return;
    }

    // 获取当前工作区路径
    const oldWorkspace = resolveAgentWorkspaceDir(cfg, id);
    const newWorkspacePath = path.resolve(newWorkspace);

    // 检查新路径是否已存在
    try {
      const stat = await fs.stat(newWorkspacePath);
      if (stat.isDirectory()) {
        // 目标目录已存在，检查是否为空
        const files = await fs.readdir(newWorkspacePath);
        if (files.length > 0) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "Target workspace directory is not empty"),
          );
          return;
        }
      }
    } catch {
      // 目录不存在，需要创建
      await fs.mkdir(newWorkspacePath, { recursive: true });
    }

    // 复制文件
    try {
      // 检查源目录是否存在
      try {
        await fs.access(oldWorkspace);
      } catch {
        // 源目录不存在，只更新配置
        const updatedAgent = {
          ...agents[agentIndex],
          workspace: newWorkspace,
        };
        agents[agentIndex] = updatedAgent;

        const updatedConfig: OpenClawConfig = {
          ...cfg,
          agents: {
            ...cfg.agents,
            list: agents,
          },
        };

        await writeConfigFile(updatedConfig);
        respond(
          true,
          { success: true, id, oldWorkspace, newWorkspace, migrated: false },
          undefined,
        );
        return;
      }

      // 复制所有文件
      const copyDir = async (src: string, dest: string) => {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });

        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);

          if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
          }
        }
      };

      await copyDir(oldWorkspace, newWorkspacePath);

      // 更新配置
      const updatedAgent = {
        ...agents[agentIndex],
        workspace: newWorkspace,
      };
      agents[agentIndex] = updatedAgent;

      const updatedConfig: OpenClawConfig = {
        ...cfg,
        agents: {
          ...cfg.agents,
          list: agents,
        },
      };

      await writeConfigFile(updatedConfig);
      respond(true, { success: true, id, oldWorkspace, newWorkspace, migrated: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to migrate workspace: ${String(err)}`),
      );
    }
  },

  /**
   * agent.workspace.getDefault - 获取默认工作区根目录
   */
  "agent.workspace.getDefault": ({ respond }) => {
    const cfg = loadConfig();
    const defaultWorkspace = cfg.agents?.defaults?.workspace || resolveDefaultAgentWorkspaceDir();
    respond(true, { defaultWorkspace }, undefined);
  },

  /**
   * agent.workspace.setDefault - 设置默认工作区根目录
   */
  "agent.workspace.setDefault": async ({ params, respond }) => {
    const workspace = String((params as { workspace?: string | number })?.workspace ?? "").trim();

    if (!workspace) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workspace is required"));
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

    // 验证路径是否有效
    try {
      const resolvedPath = path.resolve(workspace);
      await fs.mkdir(resolvedPath, { recursive: true });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Invalid workspace path: ${String(err)}`),
      );
      return;
    }

    const updatedConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          workspace,
        },
      },
      // 同步写入 groups.workspace.root：群组工作空间放在系统根目录的 groups/ 子目录下
      groups: {
        ...(cfg as any).groups,
        workspace: {
          ...((cfg as any).groups?.workspace ?? {}),
          root: path.join(workspace, "groups"),
        },
      },
    };

    try {
      await writeConfigFile(updatedConfig);
      // 同步更新内存中群组工作空间管理器
      groupWorkspaceManager.setRootDir(path.join(workspace, "groups"));
      respond(true, { success: true, workspace }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save config: ${String(err)}`),
      );
    }
  },

  /**
   * workspace.backup - 备份整个工作空间根目录
   * 将 workspacesDir 整个复制到 backupDir（可指定，默认为 workspacesDir + "_backup_" + 时间戳）
   */
  "workspace.backup": async ({ params, respond }) => {
    const cfg = loadConfig();
    const currentRoot = cfg.agents?.defaults?.workspace || resolveDefaultAgentWorkspaceDir();
    const customBackupDir = String(
      (params as { backupDir?: string | number })?.backupDir ?? "",
    ).trim();

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const backupDir = customBackupDir || `${currentRoot}_backup_${timestamp}`;

    try {
      await fs.access(currentRoot);
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Workspace root does not exist: ${currentRoot}`),
      );
      return;
    }

    const copyDir = async (src: string, dest: string): Promise<number> => {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });
      let count = 0;
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          count += await copyDir(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
          count++;
        }
      }
      return count;
    };

    try {
      const fileCount = await copyDir(currentRoot, backupDir);
      respond(true, { success: true, sourceDir: currentRoot, backupDir, fileCount }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Backup failed: ${String(err)}`),
      );
    }
  },

  /**
   * workspace.migrate.all - 批量迁移整个工作空间根目录到新路径
   * 1. 复制 currentRoot/* 到 newRoot/*
   * 2. 更新 agents.defaults.workspace + groups.workspace.root
   * 3. 更新每个 agent 的 workspace 字段为新路径下对应子目录
   */
  "workspace.migrate.all": async ({ params, respond }) => {
    const newRoot = String((params as { newRoot?: string | number })?.newRoot ?? "").trim();
    if (!newRoot) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "newRoot is required"));
      return;
    }

    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid config; fix before migrating"),
      );
      return;
    }
    const cfg = snapshot.config;
    const oldRoot = cfg.agents?.defaults?.workspace || resolveDefaultAgentWorkspaceDir();
    const newRootResolved = path.resolve(newRoot);

    if (path.resolve(oldRoot) === newRootResolved) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "New root is the same as the current root"),
      );
      return;
    }

    // 确保新根目录存在
    try {
      await fs.mkdir(newRootResolved, { recursive: true });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Cannot create new root directory: ${String(err)}`),
      );
      return;
    }

    // 复制目录递归
    const copyDir = async (src: string, dest: string): Promise<number> => {
      await fs.mkdir(dest, { recursive: true });
      let count = 0;
      try {
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            count += await copyDir(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
            count++;
          }
        }
      } catch {
        // 源不存在则跳过
      }
      return count;
    };

    try {
      // 复制整个 oldRoot 到 newRoot
      let totalFiles = 0;
      try {
        await fs.access(oldRoot);
        totalFiles = await copyDir(oldRoot, newRootResolved);
      } catch {
        // oldRoot 不存在，跳过复制，只更新配置
      }

      // 更新每个 agent 的 workspace 字段：把 oldRoot 前缀替换为 newRootResolved
      const agents = listAgentEntries(cfg);
      const updatedAgents = agents.map((agent) => {
        const agentWorkspace = agent.workspace as string | undefined;
        if (agentWorkspace && path.resolve(agentWorkspace).startsWith(path.resolve(oldRoot))) {
          const rel = path.relative(path.resolve(oldRoot), path.resolve(agentWorkspace));
          return { ...agent, workspace: path.join(newRootResolved, rel) };
        }
        return agent;
      });

      // 更新配置
      const updatedConfig: OpenClawConfig = {
        ...cfg,
        agents: {
          ...cfg.agents,
          defaults: { ...cfg.agents?.defaults, workspace: newRoot },
          list: updatedAgents,
        },
        groups: {
          ...(cfg as any).groups,
          workspace: {
            ...((cfg as any).groups?.workspace ?? {}),
            root: path.join(newRootResolved, "groups"),
          },
        },
      };

      await writeConfigFile(updatedConfig);
      // 同步内存中群组工作空间路径
      groupWorkspaceManager.setRootDir(path.join(newRootResolved, "groups"));

      respond(
        true,
        {
          success: true,
          oldRoot,
          newRoot: newRootResolved,
          filesCopied: totalFiles,
          agentsMigrated: updatedAgents.length,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Migration failed: ${String(err)}`),
      );
    }
  },

  /**
   * agent.discover - 发现/搜索系统中所有智能助手
   * 支持按名称/ID/角色/标签过滤，返回助手基本信息和状态
   */
  "agent.discover": ({ params, respond }) => {
    const cfg = loadConfig();
    const agents = listAgentEntries(cfg);
    const p = params as {
      query?: string;
      status?: string;
      role?: string;
      tags?: string[];
      includePrivate?: boolean;
      limit?: number;
    };
    const query = (p.query || "").toLowerCase().trim();
    const statusFilter = p.status || "all";
    const roleFilter = (p.role || "").toLowerCase().trim();
    const tagsFilter = Array.isArray(p.tags) ? p.tags.map((t) => t.toLowerCase()) : [];
    const limit = typeof p.limit === "number" && p.limit > 0 ? Math.min(p.limit, 200) : 50;

    const result = agents
      .filter((agent) => {
        // 按查询词过滤（匹配 id 或 name）
        if (query) {
          const id = agent.id.toLowerCase();
          const name = (agent.name || "").toLowerCase();
          if (!id.includes(query) && !name.includes(query)) {
            return false;
          }
        }
        // 按角色过滤
        if (roleFilter) {
          const agentRole = (
            ((agent as Record<string, unknown>).role as string) || ""
          ).toLowerCase();
          if (!agentRole.includes(roleFilter)) {
            return false;
          }
        }
        // 按标签过滤
        if (tagsFilter.length > 0) {
          const agentTags = new Set(
            (((agent as Record<string, unknown>).tags as string[]) || []).map((t) =>
              t.toLowerCase(),
            ),
          );
          if (!tagsFilter.every((tag) => agentTags.has(tag))) {
            return false;
          }
        }
        // status 过滤（当前只有配置状态，不是运行时状态）
        // 保留 all 或任意值（运行时状态需要进一步扩展）
        return statusFilter === "all" || true;
      })
      .slice(0, limit)
      .map((agent) => ({
        id: agent.id,
        name: agent.name || agent.id,
        status: "online",
        role: (agent as Record<string, unknown>).role || null,
        description: (agent as Record<string, unknown>).description || null,
        capabilities: (agent as Record<string, unknown>).capabilities || [],
        tags: (agent as Record<string, unknown>).tags || [],
        online: true,
        lastSeen: null,
        availability: "available",
        default: agent.default || false,
        workspace: resolveAgentWorkspaceDir(cfg, agent.id),
      }));

    respond(true, result, undefined);
  },

  /**
   * agent.inspect - 获取指定智能助手的详细信息
   */
  "agent.inspect": ({ params, respond }) => {
    const targetAgentId = String(
      (params as { targetAgentId?: string | number })?.targetAgentId ?? "",
    ).trim();
    if (!targetAgentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "targetAgentId is required"),
      );
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(targetAgentId, cfg, respond)) {
      return;
    }

    const includeConfig =
      typeof (params as { includeConfig?: boolean }).includeConfig === "boolean"
        ? (params as { includeConfig?: boolean }).includeConfig
        : false;
    const includeStats =
      typeof (params as { includeStats?: boolean }).includeStats === "boolean"
        ? (params as { includeStats?: boolean }).includeStats
        : true;
    const includeSessions =
      typeof (params as { includeSessions?: boolean }).includeSessions === "boolean"
        ? (params as { includeSessions?: boolean }).includeSessions
        : false;

    const agents = listAgentEntries(cfg);
    const normalized = normalizeAgentId(targetAgentId);
    const agent = agents.find((a) => normalizeAgentId(a.id) === normalized);

    if (!agent) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Agent not found: ${targetAgentId}`),
      );
      return;
    }

    const agentExtra = agent as Record<string, unknown>;
    const response: Record<string, unknown> = {
      id: agent.id,
      name: agent.name || agent.id,
      status: "online",
      role: agentExtra.role || null,
      description: agentExtra.description || null,
      capabilities: agentExtra.capabilities || [],
      skills: agentExtra.skills || [],
      tags: agentExtra.tags || [],
      createdAt: agentExtra.createdAt || null,
      lastActiveAt: agentExtra.lastActiveAt || null,
      default: agent.default || false,
      workspace: resolveAgentWorkspaceDir(cfg, agent.id),
      model: agent.model || null,
    };

    if (includeStats) {
      response.stats = {
        totalSessions: 0,
        activeSessions: 0,
        totalMessages: 0,
      };
    }

    if (includeConfig) {
      response.config = {
        id: agent.id,
        name: agent.name,
        model: agent.model,
        workspace: agent.workspace,
        default: agent.default,
      };
    }

    if (includeSessions) {
      response.sessions = [];
    }

    respond(true, response, undefined);
  },

  /**
   * agent.status - 获取或设置智能助手状态
   */
  "agent.status": ({ params, respond }) => {
    const targetAgentId = String(
      (params as { targetAgentId?: string | number })?.targetAgentId ?? "",
    ).trim();
    if (!targetAgentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "targetAgentId is required"),
      );
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(targetAgentId, cfg, respond)) {
      return;
    }

    // 目前状态为只读（运行时状态需要进一步扩展，此处返回基础在线状态）
    respond(
      true,
      {
        status: "online",
        statusMessage: null,
        online: true,
        lastStatusChange: null,
        uptime: null,
      },
      undefined,
    );
  },

  /**
   * agent.capabilities - 查询智能助手的能力列表
   */
  "agent.capabilities": ({ params, respond }) => {
    const targetAgentId = String(
      (params as { targetAgentId?: string | number })?.targetAgentId ?? "",
    ).trim();
    if (!targetAgentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "targetAgentId is required"),
      );
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(targetAgentId, cfg, respond)) {
      return;
    }

    const agents = listAgentEntries(cfg);
    const normalized = normalizeAgentId(targetAgentId);
    const agent = agents.find((a) => normalizeAgentId(a.id) === normalized);
    const agentExtra = (agent || {}) as Record<string, unknown>;

    respond(
      true,
      {
        name: agent?.name || targetAgentId,
        skills: agentExtra.skills || [],
        tools: agentExtra.tools || [],
        languages: agentExtra.languages || ["zh", "en"],
        specialAbilities: agentExtra.specialAbilities || [],
        limitations: agentExtra.limitations || [],
        maxConcurrentTasks: agentExtra.maxConcurrentTasks || 1,
        supportedChannels: agentExtra.supportedChannels || [],
      },
      undefined,
    );
  },

  /**
   * agent.communicate - 向目标智能助手发送消息
   *
   * 实现方式：将消息投递到目标 agent 的 main session（agent:{targetAgentId}:main）
   * 根本上是内部调用 chat.send
   */
  "agent.communicate": async (callCtx) => {
    const { params, respond } = callCtx;
    const p = params as {
      targetAgentId?: string;
      message?: string;
      messageType?: string;
      waitForReply?: boolean;
      senderId?: string;
      messageId?: string;
    };

    const targetAgentId = String(p?.targetAgentId ?? "").trim();
    const message = String(p?.message ?? "").trim();

    if (!targetAgentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "targetAgentId is required"),
      );
      return;
    }
    if (!message) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "message is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(targetAgentId, cfg, respond)) {
      return;
    }

    // 构造目标 agent 的 main sessionKey
    const sessionKey = `agent:${normalizeAgentId(targetAgentId)}:main`;
    const messageId =
      p?.messageId ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const senderId = p?.senderId ?? "system";
    const messageType = p?.messageType ?? "notification";

    // 格式化消息，添加发送者和类型信息
    const formattedMessage =
      messageType === "command"
        ? `[COMMAND from ${senderId}] ${message}`
        : messageType === "request"
          ? `[REQUEST from ${senderId}] ${message}`
          : messageType === "query"
            ? `[QUERY from ${senderId}] ${message}`
            : `[NOTIFICATION from ${senderId}] ${message}`;

    // 内部调用 chat.send handler，同时附加 __interagent 元数据供 UI 精确识别
    // __interagent 字段会随消息持久化，让 UI 无需解析文本即可识别 agent 间通信消息
    const chatSendHandler = chatHandlers["chat.send"];
    if (!chatSendHandler) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "chat.send handler not available"),
      );
      return;
    }

    let responded = false;
    const innerRespond = (ok: boolean, payload: unknown, error: unknown) => {
      if (responded) {
        return;
      }
      responded = true;
      if (ok) {
        respond(
          true,
          {
            delivered: true,
            messageId,
            targetAgent: targetAgentId,
            sessionKey,
            type: messageType,
            chatResponse: payload,
          },
          undefined,
        );
      } else {
        respond(false, undefined, error as Parameters<RespondFn>[2]);
      }
    };

    try {
      await chatSendHandler({
        ...callCtx,
        params: {
          sessionKey,
          message: formattedMessage,
          idempotencyKey: messageId,
        },
        respond: innerRespond as RespondFn,
      });
    } catch (err) {
      if (!responded) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Failed to deliver message to agent: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
  },

  /**
   * agent.assign_task - 向目标智能助手分配任务
   *
   * 实现方式：将任务格式化为结构化消息，内部调用 chat.send 投递到目标 agent 的 main session
   */
  "agent.assign_task": async (callCtx) => {
    const { params, respond } = callCtx;
    const p = params as {
      targetAgentId?: string;
      task?: string;
      priority?: string;
      deadline?: string;
      context?: unknown;
      taskId?: string;
      requesterId?: string;
    };

    const targetAgentId = String(p?.targetAgentId ?? "").trim();
    const task = String(p?.task ?? "").trim();

    if (!targetAgentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "targetAgentId is required"),
      );
      return;
    }
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task is required"));
      return;
    }

    const cfg = loadConfig();
    if (!validateAgentId(targetAgentId, cfg, respond)) {
      return;
    }

    const sessionKey = `agent:${normalizeAgentId(targetAgentId)}:main`;
    const taskId = p?.taskId ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const requesterId = p?.requesterId ?? "system";
    const priority = p?.priority ?? "medium";

    // 构建结构化任务消息
    const taskLines = [
      `[TASK ASSIGNMENT]`,
      `Task ID: ${taskId}`,
      `From: ${requesterId}`,
      `Priority: ${priority}`,
      p?.deadline ? `Deadline: ${p.deadline}` : null,
      ``,
      `Task:`,
      task,
      p?.context ? `\nContext: ${JSON.stringify(p.context, null, 2)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const chatSendHandler = chatHandlers["chat.send"];
    if (!chatSendHandler) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "chat.send handler not available"),
      );
      return;
    }

    let responded = false;
    const innerRespond = (ok: boolean, payload: unknown, error: unknown) => {
      if (responded) {
        return;
      }
      responded = true;
      if (ok) {
        respond(
          true,
          {
            queued: true,
            taskId,
            targetAgent: targetAgentId,
            sessionKey,
            priority,
            assignedAt: Date.now(),
            chatResponse: payload,
          },
          undefined,
        );
      } else {
        respond(false, undefined, error as Parameters<RespondFn>[2]);
      }
    };

    try {
      await chatSendHandler({
        ...callCtx,
        params: {
          sessionKey,
          message: taskLines,
          idempotencyKey: taskId,
        },
        respond: innerRespond as RespondFn,
      });
    } catch (err) {
      if (!responded) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Failed to assign task to agent: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
  },

  /**
   * agent.workspace.delete - 删除工作区目录
   */
  "agent.workspace.delete": async ({ params, respond }) => {
    const workspace = String((params as { workspace?: string | number })?.workspace ?? "").trim();

    if (!workspace) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workspace is required"));
      return;
    }

    try {
      const resolvedPath = path.resolve(workspace);

      // 安全检查：防止删除重要系统目录
      const dangerousPaths = [
        path.resolve("/"),
        path.resolve(process.env.HOME || "~"),
        path.resolve(process.env.USERPROFILE || "~"),
        path.resolve("/usr"),
        path.resolve("/bin"),
        path.resolve("/etc"),
        path.resolve("/var"),
        path.resolve("/System"),
        path.resolve("/Applications"),
        path.resolve("C:\\\\Windows"),
        path.resolve("C:\\\\Program Files"),
      ];

      if (
        dangerousPaths.some(
          (dangerous) =>
            resolvedPath === dangerous || resolvedPath.startsWith(dangerous + path.sep),
        )
      ) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Cannot delete system directory"),
        );
        return;
      }

      // 删除目录
      await fs.rm(resolvedPath, { recursive: true, force: true });
      respond(true, { success: true, workspace: resolvedPath }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete workspace: ${String(err)}`),
      );
    }
  },

  /**
   * workspace.openFolder - 用系统文件管理器打开指定文件夹
   */
  "workspace.openFolder": async ({ params, respond }) => {
    const folderPath = String((params as { path?: string | number })?.path ?? "").trim();
    if (!folderPath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }
    try {
      const resolved = path.resolve(folderPath);
      // 确保目录存在
      await fs.mkdir(resolved, { recursive: true });
      const platform = process.platform;
      if (platform === "win32") {
        execFile("explorer", [resolved]);
      } else if (platform === "darwin") {
        execFile("open", [resolved]);
      } else {
        execFile("xdg-open", [resolved]);
      }
      respond(true, { success: true, path: resolved }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to open folder: ${String(err)}`));
    }
  },

  /**
   * groups.files.list - 列出群组工作空间的文件
   */
  "groups.files.list": async ({ params, respond }) => {
    const groupId = String((params as { groupId?: string | number })?.groupId ?? "").trim();
    if (!groupId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
      return;
    }
    try {
      const groupDir = groupWorkspaceManager.getGroupWorkspaceDir(groupId);
      // 确保目录存在
      await fs.mkdir(groupDir, { recursive: true });
      const entries = await fs.readdir(groupDir, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((e) => e.isFile())
          .map(async (e) => {
            const filePath = path.join(groupDir, e.name);
            try {
              const stat = await fs.stat(filePath);
              return {
                name: e.name,
                path: filePath,
                size: stat.size,
                updatedAtMs: stat.mtimeMs,
                missing: false,
              };
            } catch {
              return { name: e.name, path: filePath, size: 0, updatedAtMs: null, missing: true };
            }
          }),
      );
      respond(true, { groupId, workspace: groupDir, files }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to list group files: ${String(err)}`));
    }
  },

  /**
   * groups.files.get - 读取群组工作空间中的文件内容
   */
  "groups.files.get": async ({ params, respond }) => {
    const groupId = String((params as { groupId?: string; name?: string })?.groupId ?? "").trim();
    const name = String((params as { groupId?: string; name?: string })?.name ?? "").trim();
    if (!groupId || !name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId and name are required"));
      return;
    }
    try {
      const groupDir = groupWorkspaceManager.getGroupWorkspaceDir(groupId);
      const filePath = path.resolve(path.join(groupDir, name));
      // 安全检查：不允许路径穿越
      if (!filePath.startsWith(path.resolve(groupDir))) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Invalid file path"));
        return;
      }
      let content = "";
      let missing = false;
      let size = 0;
      let updatedAtMs: number | null = null;
      try {
        const stat = await fs.stat(filePath);
        content = await fs.readFile(filePath, "utf-8");
        size = stat.size;
        updatedAtMs = stat.mtimeMs;
      } catch {
        missing = true;
      }
      respond(true, { file: { name, path: filePath, content, size, updatedAtMs, missing } }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to get group file: ${String(err)}`));
    }
  },

  /**
   * groups.files.set - 写入群组工作空间中的文件
   */
  "groups.files.set": async ({ params, respond }) => {
    const groupId = String((params as { groupId?: string; name?: string; content?: string })?.groupId ?? "").trim();
    const name = String((params as { groupId?: string; name?: string; content?: string })?.name ?? "").trim();
    const content = String((params as { groupId?: string; name?: string; content?: string })?.content ?? "");
    if (!groupId || !name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId and name are required"));
      return;
    }
    try {
      const groupDir = groupWorkspaceManager.getGroupWorkspaceDir(groupId);
      const filePath = path.resolve(path.join(groupDir, name));
      // 安全检查
      if (!filePath.startsWith(path.resolve(groupDir))) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Invalid file path"));
        return;
      }
      await fs.mkdir(groupDir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      const stat = await fs.stat(filePath);
      respond(true, { file: { name, path: filePath, content, size: stat.size, updatedAtMs: stat.mtimeMs, missing: false } }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to set group file: ${String(err)}`));
    }
  },

  /**
   * groups.files.delete - 删除群组工作空间中的文件
   */
  "groups.files.delete": async ({ params, respond }) => {
    const groupId = String((params as { groupId?: string; name?: string })?.groupId ?? "").trim();
    const name = String((params as { groupId?: string; name?: string })?.name ?? "").trim();
    if (!groupId || !name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId and name are required"));
      return;
    }
    try {
      const groupDir = groupWorkspaceManager.getGroupWorkspaceDir(groupId);
      const filePath = path.resolve(path.join(groupDir, name));
      if (!filePath.startsWith(path.resolve(groupDir))) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Invalid file path"));
        return;
      }
      await fs.unlink(filePath);
      respond(true, { success: true, groupId, name }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete group file: ${String(err)}`));
    }
  },
};
