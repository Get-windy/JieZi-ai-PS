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
import { resolveDefaultAgentWorkspaceDir } from "../../../upstream/src/agents/workspace.js";
import {
  getChannelPlugin,
  listChannelPlugins,
} from "../../../upstream/src/channels/plugins/index.js";
import {
  listAgentEntries,
  findAgentEntryIndex,
} from "../../../upstream/src/commands/agents.config.js";
import {
  loadConfig,
  readConfigFileSnapshot,
  writeConfigFile,
} from "../../../upstream/src/config/config.js";
import type { OpenClawConfig } from "../../../upstream/src/config/types.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import { chatHandlers } from "../../../upstream/src/gateway/server-methods/chat.js";
import type {
  GatewayRequestHandlers,
  RespondFn,
} from "../../../upstream/src/gateway/server-methods/types.js";
import { requestHeartbeatNow } from "../../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../../upstream/src/infra/system-events.js";
import { addAgentToAllowList } from "../../agents/agent-config-manager.js";
import {
  listAgentIds,
  resolveAgentModelAccounts,
  resolveAgentWorkspaceDir,
} from "../../agents/agent-scope.js";
import type { AgentBinding, AgentConfig } from "../../config/types.agents.js";
import type { AgentChannelBindings } from "../../config/types.channel-bindings.js";
import { organizationStorage } from "../../organization/storage.js";
import { teamManagement } from "../../organization/team-management.js";
import { listBindings } from "../../routing/bindings.js";
import { normalizeAgentId, DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { groupManager } from "../../sessions/group-manager.js";
import * as taskStorage from "../../tasks/storage.js";
import type { Task } from "../../tasks/types.js";
import { groupWorkspaceManager } from "../../workspace/group-workspace.js";

/**
 * 获取某 agent 可管理/调度的下属 agent ID 集合（normalized）。
 *
 * 合并两个来源：
 * 1. 静态配置：agent config 中的 subagents.allowAgents
 * 2. 动态关系：organizationStorage 中 type=supervisor 的协作关系（即 set_reporting_line 建立的）
 *
 * 规则：
 * - main agent 或未提供 requesterId → null（无限制）
 * - allowAgents = ["*"] → null（无限制）
 * - allowAgents 没有配置→ 仅限动态关系中的下属
 * - 有 allowAgents 配置 → 静态 + 动态合并
 * - 返回 null 表示无限制，返回 Set 表示允许范围
 */
async function getAgentManagedScopeAsync(
  requesterId: string | undefined,
  cfg: OpenClawConfig,
): Promise<Set<string> | null> {
  if (!requesterId) {
    return null;
  }

  const normalizedRequesterId = normalizeAgentId(requesterId);

  // main agent 不受限
  if (normalizedRequesterId === normalizeAgentId(DEFAULT_AGENT_ID)) {
    return null;
  }

  const agents = listAgentEntries(cfg);
  const requesterEntry = agents.find((a) => normalizeAgentId(a.id) === normalizedRequesterId);

  // 找不到 requester，不限制
  if (!requesterEntry) {
    return null;
  }

  const allowAgents = requesterEntry.subagents?.allowAgents;

  // "*" 通配：无限制
  if (Array.isArray(allowAgents) && allowAgents.includes("*")) {
    return null;
  }

  // 构建初始集合，包含自身
  const managed = new Set<string>([normalizedRequesterId]);

  // 加入静态 allowAgents
  if (Array.isArray(allowAgents)) {
    for (const id of allowAgents) {
      managed.add(normalizeAgentId(id));
    }
  }

  // 加入动态汇报关系：查找所有过 set_reporting_line 建立的下属
  try {
    const supervisorRelations = await organizationStorage.listRelations({
      type: "supervisor",
      toAgentId: normalizedRequesterId, // 上级是我
    });
    for (const rel of supervisorRelations) {
      managed.add(normalizeAgentId(rel.fromAgentId)); // 下属
    }
  } catch {
    // 如果存储不可用，仅依赖静态配置
  }

  // 如果最终集合只有自身且尚未配置 allowAgents，则该 agent 没有任何下属
  // 返回只包含自身的集合（不能给别人分配任务）
  return managed;
}

/**
 * 同步版本（保留兼容，内部不再使用）
 * @deprecated 请使用 getAgentManagedScopeAsync
 * @internal
 */
function _getAgentManagedScope(
  requesterId: string | undefined,
  cfg: OpenClawConfig,
): Set<string> | null {
  if (!requesterId) {
    return null;
  }
  const normalizedRequesterId = normalizeAgentId(requesterId);
  if (normalizedRequesterId === normalizeAgentId(DEFAULT_AGENT_ID)) {
    return null;
  }
  const agents = listAgentEntries(cfg);
  const requesterEntry = agents.find((a) => normalizeAgentId(a.id) === normalizedRequesterId);
  if (!requesterEntry) {
    return null;
  }
  const allowAgents = requesterEntry.subagents?.allowAgents;
  if (!allowAgents || allowAgents.length === 0) {
    return new Set<string>([normalizedRequesterId]);
  }
  if (allowAgents.includes("*")) {
    return null;
  }
  return new Set<string>([normalizedRequesterId, ...allowAgents.map((id) => normalizeAgentId(id))]);
}

/**
 * 解析任务执行上下文：工作区路径、记忆文件路径、项目工作群 sessionKey
 *
 * @param agentId       执行任务的 agent ID（normalized）
 * @param projectId     任务所属项目 ID（可选）
 * @param cfg           当前配置
 * @returns             { workspaceDir, memoryPath, projectGroupSessionKey }
 */
function resolveTaskContext(
  agentId: string,
  projectId: string | undefined,
  cfg: OpenClawConfig,
): {
  workspaceDir: string;
  memoryPath: string;
  projectGroupSessionKey: string | null;
} {
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const memoryPath = path.join(workspaceDir, "MEMORY.md");

  // 查找项目工作群：遍历所有群组，找第一个 projectId 匹配的
  let projectGroupSessionKey: string | null = null;
  if (projectId) {
    const allGroups = groupManager.getAllGroups();
    const projectGroup = allGroups.find((g) => g.projectId === projectId);
    if (projectGroup) {
      projectGroupSessionKey = `group:${projectGroup.id}`;
    }
  }

  return { workspaceDir, memoryPath, projectGroupSessionKey };
}

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
 * 自动驱动 agent 的下一条 todo 任务（任务完成/取消/重置后复用）
 * 找出优先级最高且无依赖阻塞的第一条，自动设为 in-progress 并唤醒 agent
 */
async function scheduleNextTaskForAgent(
  agentId: string,
  completedTaskId: string,
  projectId?: string,
): Promise<void> {
  try {
    // 先检查是否已有 in-progress 任务（防止并发触发导致双 in-progress 违规）
    // 调度器扫描 和 task.report 可能同时触发，需保证串行性
    const inProgressTasks = await taskStorage.listTasks({
      assigneeId: agentId,
      status: ["in-progress"],
    });
    if (inProgressTasks.length > 0) {
      console.log(
        `[scheduleNextTask] Agent ${agentId} already has ${inProgressTasks.length} in-progress task(s), skipping auto-start`,
      );
      return;
    }

    const todoTasks = await taskStorage.listTasks({
      assigneeId: agentId,
      status: ["todo"],
      ...(projectId ? { projectId } : {}),
    });
    // listTasks 已按优先级+权重+创建时间排序
    let nextTask: Task | undefined;
    for (const candidate of todoTasks) {
      if (!candidate.blockedBy || candidate.blockedBy.length === 0) {
        nextTask = candidate;
        break;
      }
      let allBlockersCleared = true;
      for (const blockerId of candidate.blockedBy) {
        try {
          const blocker = await taskStorage.getTask(blockerId);
          if (blocker && blocker.status !== "done" && blocker.status !== "cancelled") {
            allBlockersCleared = false;
            break;
          }
        } catch {
          /* 获取失败视为已解除 */
        }
      }
      if (allBlockersCleared) {
        nextTask = candidate;
        break;
      }
    }

    if (!nextTask) {
      return;
    }

    const startedAt = Date.now();
    await taskStorage.updateTask(nextTask.id, {
      status: "in-progress",
      timeTracking: {
        ...nextTask.timeTracking,
        startedAt,
        lastActivityAt: startedAt,
      },
    });
    await taskStorage.addWorklog({
      id: `wl_${startedAt}_${Math.random().toString(36).slice(2, 9)}`,
      taskId: nextTask.id,
      agentId,
      action: "started",
      details: `Auto-started by task-driven system after task ${completedTaskId}`,
      result: "success",
      createdAt: startedAt,
    });

    const sessionKey = `agent:${agentId}:main`;
    const contextKey = `cron:task-next:${nextTask.id}`;
    const cfg = loadConfig();
    const ctx = resolveTaskContext(agentId, nextTask.projectId, cfg);
    const queueRemaining = todoTasks.length - 1;

    const prompt = [
      `[TASK STARTED - EXECUTE NOW]`,
      `Task ID: ${nextTask.id}`,
      `Priority: ${nextTask.priority}`,
      nextTask.weight != null ? `Weight: ${nextTask.weight}` : null,
      `Title: ${nextTask.title}`,
      nextTask.projectId ? `Project: ${nextTask.projectId}` : null,
      nextTask.teamId ? `Team: ${nextTask.teamId}` : null,
      nextTask.type ? `Type: ${nextTask.type}` : null,
      nextTask.dueDate ? `Due: ${new Date(nextTask.dueDate).toISOString()}` : null,
      nextTask.description ? `Description: ${nextTask.description}` : null,
      ``,
      `Working Context:`,
      `- Working Directory: ${ctx.workspaceDir}`,
      `- Memory File: ${ctx.memoryPath}`,
      ctx.projectGroupSessionKey
        ? `- Project Group: sessionKey=${ctx.projectGroupSessionKey}`
        : null,
      ``,
      `Status has been set to in-progress automatically. Previous task ${completedTaskId} is now done.`,
      queueRemaining > 0
        ? `(${queueRemaining} more task(s) waiting in queue after this one)`
        : null,
      `Execute this task immediately. When done, call task_report_to_supervisor with Task ID: ${nextTask.id}`,
    ]
      .filter(Boolean)
      .join("\n");

    enqueueSystemEvent(prompt, { sessionKey, contextKey });
    requestHeartbeatNow({ reason: contextKey, sessionKey, agentId });
    console.log(
      `[scheduleNextTask] ✓ Auto-started ${nextTask.id} (priority=${nextTask.priority}, weight=${nextTask.weight ?? 0}) for agent ${agentId}`,
    );
  } catch (err) {
    console.warn(`[scheduleNextTask] Failed: ${String(err)}`);
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

    const groupsRoot = path.join(workspace, "groups");
    // groups 是本地特有配置项，不在 OpenClawConfig 类型中；先构建标准配置，再通过 Object.assign 混入 groups
    const baseConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          workspace,
        },
      },
    };
    const updatedConfig = Object.assign(baseConfig, {
      groups: {
        ...((cfg as unknown as Record<string, unknown>)["groups"] as object | undefined),
        workspace: {
          ...((cfg as unknown as Record<string, Record<string, unknown>>)["groups"]?.[
            "workspace"
          ] as object | undefined),
          root: groupsRoot,
        },
      },
    }) as OpenClawConfig;

    try {
      await writeConfigFile(updatedConfig);
      // 同步更新内存中群组工作空间管理器
      groupWorkspaceManager.setRootDir(groupsRoot);
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

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
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
        const agentWorkspace = agent.workspace;
        if (agentWorkspace && path.resolve(agentWorkspace).startsWith(path.resolve(oldRoot))) {
          const rel = path.relative(path.resolve(oldRoot), path.resolve(agentWorkspace));
          return { ...agent, workspace: path.join(newRootResolved, rel) };
        }
        return agent;
      });

      // 更新配置（groups 是本地特有配置项，不在 OpenClawConfig 类型中）
      const baseConfig: OpenClawConfig = {
        ...cfg,
        agents: {
          ...cfg.agents,
          defaults: { ...cfg.agents?.defaults, workspace: newRoot },
          list: updatedAgents,
        },
      };
      const updatedConfig = Object.assign(baseConfig, {
        groups: {
          ...((cfg as unknown as Record<string, unknown>)["groups"] as object | undefined),
          workspace: {
            ...((cfg as unknown as Record<string, Record<string, unknown>>)["groups"]?.[
              "workspace"
            ] as object | undefined),
            root: path.join(newRootResolved, "groups"),
          },
        },
      }) as OpenClawConfig;

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
  "agent.discover": async ({ params, respond }) => {
    const cfg = loadConfig();
    const agents = listAgentEntries(cfg);
    const p = params as {
      query?: string;
      status?: string;
      role?: string;
      tags?: string[];
      includePrivate?: boolean;
      limit?: number;
      requesterId?: string;
    };
    const query = (p.query || "").toLowerCase().trim();
    const statusFilter = p.status || "all";
    const roleFilter = (p.role || "").toLowerCase().trim();
    const tagsFilter = Array.isArray(p.tags) ? p.tags.map((t) => t.toLowerCase()) : [];
    const limit = typeof p.limit === "number" && p.limit > 0 ? Math.min(p.limit, 200) : 50;
    const requesterId = p.requesterId ? String(p.requesterId).trim() : undefined;

    // === 权限隔离：结合静态 subagents.allowAgents + 持久化汇报关系 ===
    const managedScope = await getAgentManagedScopeAsync(requesterId, cfg);

    const result = agents
      .filter((agent) => {
        // 权限范围过滤：managedScope 为 null 表示无限制，否则只能发现 scope 内的 agent
        if (managedScope !== null) {
          const normalizedId = normalizeAgentId(agent.id);
          if (!managedScope.has(normalizedId)) {
            return false;
          }
        }
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
        // 通道绑定说明：帮助主控agent正确理解通道绑定的作用
        // 通道绑定用于入站消息路由（用户通过飞书/微信发消息 → 路由到哪个agent）
        // subagent通过agent()工具内部调用，不需要通道绑定
        _note:
          "Channel bindings are for inbound message routing only. Subagents work via internal agent() tool calls and do NOT need channel bindings. An agent without channel bindings can still work as a subagent.",
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
      // 通道绑定说明：帮助主控agent正确理解通道绑定的作用
      // 通道绑定用于入站消息路由（用户通过飞书/微信发消息 → 路由到哪个agent）
      // subagent通过agent()工具内部调用，不需要通道绑定
      _note:
        "Channel bindings are for inbound message routing only. Subagents work via internal agent() tool calls and do NOT need channel bindings. An agent without channel bindings can still work as a subagent.",
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
   * agent.communicate.group - 向项目工作群发送消息
   *
   * 将消息投递到指定群组的 sessionKey（格式 group:{groupId}）
   */
  "agent.communicate.group": async (callCtx) => {
    const { params, respond } = callCtx;
    const p = params as {
      groupSessionKey?: string;
      message?: string;
      messageType?: string;
      senderId?: string;
      messageId?: string;
    };

    const groupSessionKey = String(p?.groupSessionKey ?? "").trim();
    const message = String(p?.message ?? "").trim();

    if (!groupSessionKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "groupSessionKey is required"),
      );
      return;
    }
    if (!message) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "message is required"));
      return;
    }

    const messageId =
      p?.messageId ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const senderId = p?.senderId ?? "system";
    const messageType = p?.messageType ?? "notification";

    const formattedMessage =
      messageType === "command"
        ? `[COMMAND from ${senderId}] ${message}`
        : messageType === "request"
          ? `[REQUEST from ${senderId}] ${message}`
          : messageType === "query"
            ? `[QUERY from ${senderId}] ${message}`
            : `[NOTIFICATION from ${senderId}] ${message}`;

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
            groupSessionKey,
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
          sessionKey: groupSessionKey,
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
            `Failed to deliver message to group: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
  },

  /**
   * agent.assign_task - 向目标智能助手分配任务
   *
   * 实现方式：
   * 1. 将任务写入任务系统（task storage），建立可追踪的任务记录
   * 2. 将任务格式化为结构化消息，内部调用 chat.send 投递到目标 agent 的 main session
   * 3. 附加 senderIsOwner: true 标志，使目标 Agent 把任务当作来自主人的指令
   * 4. 携带 projectId/teamId 上下文，确保任务在项目空间内执行
   */
  "agent.assign_task": async (callCtx) => {
    const { params, respond } = callCtx;
    const p = params as {
      targetAgentId?: string;
      task?: string;
      title?: string;
      priority?: string;
      deadline?: string;
      context?: unknown;
      taskId?: string;
      requesterId?: string;
      projectId?: string;
      teamId?: string;
      organizationId?: string;
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

    // === 权限校验：确认请求者是否有权限对目标 agent 分配任务（合并静态+持久化关系）===
    const assignRequesterId = p?.requesterId ? String(p.requesterId).trim() : undefined;
    if (assignRequesterId) {
      const managedScope = await getAgentManagedScopeAsync(assignRequesterId, cfg);
      if (managedScope !== null) {
        const normalizedTarget = normalizeAgentId(targetAgentId);
        if (!managedScope.has(normalizedTarget)) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.UNAVAILABLE,
              `Agent "${assignRequesterId}" does not have permission to assign tasks to "${targetAgentId}". ` +
                `Configure subagents.allowAgents in the agent config to grant task assignment permissions.`,
            ),
          );
          return;
        }
      }
    }

    const sessionKey = `agent:${normalizeAgentId(targetAgentId)}:main`;
    const taskId = p?.taskId ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const requesterId = p?.requesterId ?? "system";
    const priority = (p?.priority ?? "medium") as Task["priority"];
    const title = (p?.title ?? task.slice(0, 100)).trim();

    // === 步骤1：写入任务系统，建立可追踪任务记录 ===
    try {
      const newTask: Task = {
        id: taskId,
        title,
        description: task,
        creatorId: requesterId,
        creatorType: requesterId === "system" ? "human" : "agent",
        assignees: [
          {
            id: targetAgentId,
            type: "agent",
            role: "assignee",
            assignedAt: Date.now(),
            assignedBy: requesterId,
          },
        ],
        status: "in-progress",
        priority,
        organizationId: p?.organizationId ? String(p.organizationId) : undefined,
        teamId: p?.teamId ? String(p.teamId) : undefined,
        projectId: p?.projectId ? String(p.projectId) : undefined,
        dueDate: p?.deadline ? new Date(p.deadline).getTime() || undefined : undefined,
        timeTracking: {
          timeSpent: 0,
          startedAt: Date.now(),
          lastActivityAt: Date.now(),
        },
        metadata: {
          assignedVia: "agent.assign_task",
          supervisorId: requesterId,
          context: p?.context,
        },
        createdAt: Date.now(),
      };
      await taskStorage.createTask(newTask);
      console.log(
        `[agent.assign_task] Task ${taskId} written to task system for agent ${targetAgentId}`,
      );
    } catch (taskErr) {
      // 写入任务系统失败不阻止消息投递，但记录警告
      console.warn(`[agent.assign_task] Failed to write task to storage: ${String(taskErr)}`);
    }

    // === 步骤 2：格式化任务消息并投递到目标 Agent ===
    // 解析任务上下文：工作区路径、记忆文件路径、项目工作群
    const taskCtx = resolveTaskContext(
      normalizeAgentId(targetAgentId),
      p?.projectId ? String(p.projectId) : undefined,
      cfg,
    );
    const taskLines = [
      `[TASK ASSIGNMENT - EXECUTE NOW]`,
      `Task ID: ${taskId}`,
      `From: ${requesterId}`,
      `Priority: ${priority}`,
      p?.projectId ? `Project: ${p.projectId}` : null,
      p?.teamId ? `Team: ${p.teamId}` : null,
      p?.organizationId ? `Organization: ${p.organizationId}` : null,
      p?.deadline ? `Deadline: ${p.deadline}` : null,
      ``,
      `Task:`,
      task,
      p?.context ? `\nContext: ${JSON.stringify(p.context, null, 2)}` : null,
      ``,
      `Working Context:`,
      `- Working Directory (code lives here): ${taskCtx.workspaceDir}`,
      `- Memory File (read/update project knowledge): ${taskCtx.memoryPath}`,
      taskCtx.projectGroupSessionKey
        ? `- Project Group Channel (for team communication): sessionKey=${taskCtx.projectGroupSessionKey}`
        : null,
      ``,
      `Instructions:`,
      `- This task has been set to "in-progress". Execute it immediately.`,
      `- DO NOT just acknowledge or describe what you plan to do. Execute the actual work right now.`,
      `- Execute tasks in order: urgent > high > medium > low, then by creation time (oldest first).`,
      `- When you complete this task, use the task_report_to_supervisor tool to report results back. Task ID: ${taskId}`,
      `- If you encounter any issues, report them immediately using agent_communicate or task_report_to_supervisor with status "blocked".`,
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
            trackedInTaskSystem: true,
            chatResponse: payload,
          },
          undefined,
        );
      } else {
        respond(false, undefined, error as Parameters<RespondFn>[2]);
      }
    };

    try {
      // 携带项目/团队上下文信息，确保任务在正确的项目空间内执行
      const chatSendParams: Record<string, unknown> = {
        sessionKey,
        message: taskLines,
        idempotencyKey: taskId,
      };

      // 如果有 projectId/teamId，添加到消息上下文中（供 prompt 使用）
      if (p?.projectId) {
        chatSendParams.projectContext = p.projectId;
      }
      if (p?.teamId) {
        chatSendParams.teamContext = p.teamId;
      }

      await chatSendHandler({
        ...callCtx,
        params: chatSendParams,
        respond: innerRespond as RespondFn,
      });

      // === 步骤 3：动态添加 Agent 到 allowlist（如果需要）===
      // 如果目标 Agent 不是 main，需要确保它在 allowAgents 列表中
      if (normalizeAgentId(targetAgentId) !== "main") {
        try {
          await addAgentToAllowList(targetAgentId);
        } catch (allowListErr) {
          console.warn(
            `[agent.assign_task] Failed to add ${targetAgentId} to allowAgents:`,
            allowListErr instanceof Error ? allowListErr.message : String(allowListErr),
          );
          // 添加到 allowlist 失败不影响任务分配，继续执行
        }
      }

      // === 步骤 4：自动唤醒 Agent，确保任务被立即处理 ===
      // 将任务指令作为系统事件放入队列，并立即触发心跳唤醒 Agent
      // 这样 Agent 就会像被"闹钟"叫醒一样，立即开始处理任务
      // 使用 cron: 前缀，使 resolveHeartbeatReasonKind 返回 "cron"，从而：
      // 1. isCronEventReason=true → shouldBypassFileGates=true（绕过 HEARTBEAT.md 文件检查）
      // 2. shouldInspectPendingEvents=true → 系统事件队列中的任务指令会被读取
      // 3. isTaskDriven=true → 成员 Agent 即使无独立模型配置也能激活（回退到主控模型）
      const wakeReason = `cron:task-assign:${taskId}`;
      enqueueSystemEvent(taskLines, { sessionKey, contextKey: `cron:task-assign:${taskId}` });
      requestHeartbeatNow({
        reason: wakeReason,
        sessionKey,
        agentId: targetAgentId,
      });
      console.log(
        `[agent.assign_task] ✓ Agent ${targetAgentId} automatically woken up for task ${taskId} (reason=${wakeReason})`,
      );
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
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to open folder: ${String(err)}`),
      );
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
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list group files: ${String(err)}`),
      );
    }
  },

  /**
   * groups.files.get - 读取群组工作空间中的文件内容
   */
  "groups.files.get": async ({ params, respond }) => {
    const groupId = String((params as { groupId?: string; name?: string })?.groupId ?? "").trim();
    const name = String((params as { groupId?: string; name?: string })?.name ?? "").trim();
    if (!groupId || !name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "groupId and name are required"),
      );
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
      respond(
        true,
        { file: { name, path: filePath, content, size, updatedAtMs, missing } },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get group file: ${String(err)}`),
      );
    }
  },

  /**
   * groups.files.set - 写入群组工作空间中的文件
   */
  "groups.files.set": async ({ params, respond }) => {
    const groupId = String(
      (params as { groupId?: string; name?: string; content?: string })?.groupId ?? "",
    ).trim();
    const name = String(
      (params as { groupId?: string; name?: string; content?: string })?.name ?? "",
    ).trim();
    const content = String(
      (params as { groupId?: string; name?: string; content?: string })?.content ?? "",
    );
    if (!groupId || !name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "groupId and name are required"),
      );
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
      respond(
        true,
        {
          file: {
            name,
            path: filePath,
            content,
            size: stat.size,
            updatedAtMs: stat.mtimeMs,
            missing: false,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to set group file: ${String(err)}`),
      );
    }
  },

  /**
   * groups.files.delete - 删除群组工作空间中的文件
   */
  "groups.files.delete": async ({ params, respond }) => {
    const groupId = String((params as { groupId?: string; name?: string })?.groupId ?? "").trim();
    const name = String((params as { groupId?: string; name?: string })?.name ?? "").trim();
    if (!groupId || !name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "groupId and name are required"),
      );
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
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete group file: ${String(err)}`),
      );
    }
  },

  /**
   * agent.task.report - 成员Agent向主管汇报任务完成情况
   *
   * 功能：
   * 1. 更新任务系统中该任务的状态和结果
   * 2. 向监管者（supervisorId）的 main session 发送结构化汇报消息
   */
  "agent.task.report": async (callCtx) => {
    const { params, respond } = callCtx;
    const p = params as {
      taskId?: string;
      reporterId?: string; // 汇报者（完成任务的Agent ID）
      status?: string; // 任务最终状态: done | blocked | cancelled
      result?: string; // 工作成果文字描述
      errorMessage?: string; // 如果失败，错误信息
      supervisorId?: string; // 明确指定主管ID（可选）
    };

    const taskId = String(p?.taskId ?? "").trim();
    const reporterId = String(p?.reporterId ?? "").trim();
    const rawStatus = String(p?.status ?? "done").trim();
    const result = String(p?.result ?? "").trim();

    if (!taskId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId is required"));
      return;
    }
    if (!reporterId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "reporterId is required"));
      return;
    }

    // 映射常见别名
    const STATUS_MAP: Record<string, string> = {
      completed: "done",
      complete: "done",
      finish: "done",
      finished: "done",
      failed: "cancelled",
      error: "cancelled",
      stuck: "blocked",
    };
    const finalStatus = (STATUS_MAP[rawStatus.toLowerCase()] ??
      rawStatus) as import("../../tasks/types.js").TaskStatus;

    // === 步骤1：更新任务系统中的任务状态 ===
    let task: Task | undefined;
    let supervisorId = p?.supervisorId ? String(p.supervisorId).trim() : undefined;
    try {
      task = await taskStorage.getTask(taskId);
      if (task) {
        // 如果未明确指定 supervisorId，从任务元数据中提取
        if (!supervisorId && task.metadata) {
          const meta = task.metadata;
          const rawSupervisorId = meta.supervisorId;
          supervisorId =
            typeof rawSupervisorId === "string" && rawSupervisorId ? rawSupervisorId : undefined;
        }
        const updates: Partial<Task> = {
          status: finalStatus,
          updatedAt: Date.now(),
        };
        if (finalStatus === "done") {
          updates.completedAt = Date.now();
          updates.timeTracking = {
            ...task.timeTracking,
            completedAt: Date.now(),
            lastActivityAt: Date.now(),
            timeSpent: task.timeTracking.startedAt
              ? Date.now() - task.timeTracking.startedAt
              : task.timeTracking.timeSpent,
          };
        }
        if (finalStatus === "cancelled") {
          updates.cancelledAt = Date.now();
          if (p?.errorMessage) {
            updates.cancelReason = p.errorMessage;
          }
        }
        await taskStorage.updateTask(taskId, updates);

        // 添加工作日志
        const workLog: import("../../tasks/types.js").AgentWorkLog = {
          id: `wl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          taskId,
          agentId: reporterId,
          action:
            finalStatus === "done" ? "completed" : finalStatus === "blocked" ? "blocked" : "failed",
          details: result || `Task ${finalStatus} by agent ${reporterId}`,
          result:
            finalStatus === "done" ? "success" : finalStatus === "blocked" ? "partial" : "failure",
          errorMessage: p?.errorMessage,
          createdAt: Date.now(),
        };
        await taskStorage.addWorklog(workLog);
        console.log(
          `[agent.task.report] Task ${taskId} updated to ${finalStatus} by ${reporterId}`,
        );
      } else {
        console.warn(
          `[agent.task.report] Task ${taskId} not found in storage, proceeding with notification only`,
        );
      }
    } catch (storageErr) {
      console.warn(`[agent.task.report] Storage update failed: ${String(storageErr)}`);
    }

    // === 步骤2：向项目负责人主动发送汇报并唤醒 ===
    // 负责人解析优先级：
    //   1. task.metadata.supervisorId（分配任务时显式指定）
    //   2. task.teamId → team.leaderId（团队组长）
    //   3. task.creatorId（任务创建者）
    let notifiedSupervisor = false;
    let resolvedLeaderId = supervisorId;

    if (!resolvedLeaderId && task) {
      // 从团队组长解析
      if (task.teamId) {
        try {
          const team = await teamManagement.getTeam(task.teamId);
          if (team?.leaderId) {
            resolvedLeaderId = team.leaderId;
          }
        } catch {
          // 查询失败，继续尝试下一个来源
        }
      }
      // 最终兜底：任务创建者
      if (!resolvedLeaderId && task.creatorId) {
        resolvedLeaderId = task.creatorId;
      }
    }

    if (resolvedLeaderId) {
      const cfg = loadConfig();
      const normalizedLeader = normalizeAgentId(resolvedLeaderId);
      const allowed = new Set(listAgentIds(cfg));
      if (allowed.has(normalizedLeader)) {
        // 查询 reporter 当前任务状态摘要（用 normalized ID 确保匹配存储格式）
        const normalizedReporter = normalizeAgentId(reporterId);
        let inProgressCount = 0;
        let todoCount = 0;
        let inProgressTitles: string[] = [];
        let todoTitles: string[] = [];
        try {
          const [inProgressTasks, todoTasksForReport] = await Promise.all([
            taskStorage.listTasks({ assigneeId: normalizedReporter, status: ["in-progress"] }),
            taskStorage.listTasks({ assigneeId: normalizedReporter, status: ["todo"] }),
          ]);
          inProgressCount = inProgressTasks.length;
          todoCount = todoTasksForReport.length;
          inProgressTitles = inProgressTasks.slice(0, 3).map((t) => `  - [${t.id}] ${t.title}`);
          todoTitles = todoTasksForReport.slice(0, 3).map((t) => `  - [${t.id}] ${t.title}`);
        } catch {
          // 查询失败，跳过摘要
        }

        const statusLabel =
          finalStatus === "done"
            ? "✅ 已完成"
            : finalStatus === "blocked"
              ? "⚠️ 已阻塞"
              : finalStatus === "cancelled"
                ? "❌ 已取消"
                : `状态: ${finalStatus}`;

        const reportLines = [
          `[TASK REPORT] ${reporterId} 任务汇报`,
          `汇报时间: ${new Date().toISOString()} (刚刚完成)`,
          ``,
          `完成任务: ${statusLabel}`,
          `  Task ID: ${taskId}`,
          task?.title ? `  标题: ${task.title}` : null,
          result
            ? `  成果:\n${result
                .split("\n")
                .map((l) => `    ${l}`)
                .join("\n")}`
            : null,
          p?.errorMessage ? `  错误: ${p.errorMessage}` : null,
          ``,
          inProgressCount > 0
            ? [
                `进行中任务 (${inProgressCount} 个):`,
                ...inProgressTitles,
                inProgressCount > 3 ? `  ... 还有 ${inProgressCount - 3} 个` : null,
              ]
                .filter(Boolean)
                .join("\n")
            : `进行中任务: 无`,
          ``,
          todoCount > 0
            ? [
                `待执行任务 (${todoCount} 个):`,
                ...todoTitles,
                todoCount > 3 ? `  ... 还有 ${todoCount - 3} 个` : null,
              ]
                .filter(Boolean)
                .join("\n")
            : `待执行任务: 无`,
        ]
          .filter((l) => l !== null)
          .join("\n");

        const leaderSession = `agent:${normalizedLeader}:main`;
        const wakeReason = `task-report:${taskId}:${reporterId}`;
        try {
          enqueueSystemEvent(reportLines, {
            sessionKey: leaderSession,
            contextKey: wakeReason,
          });
          requestHeartbeatNow({
            reason: wakeReason,
            sessionKey: leaderSession,
            agentId: normalizedLeader,
          });
          notifiedSupervisor = true;
          console.log(
            `[agent.task.report] Notified leader ${normalizedLeader} (session: ${leaderSession}) about task ${taskId} completion by ${reporterId}`,
          );
        } catch (notifyErr) {
          console.warn(`[agent.task.report] Failed to notify leader: ${String(notifyErr)}`);
        }
      }
    }

    respond(
      true,
      {
        success: true,
        taskId,
        finalStatus,
        taskFound: !!task,
        notifiedSupervisor,
        supervisorId: resolvedLeaderId ?? null,
        reportedAt: Date.now(),
      },
      undefined,
    );

    // === 步骤 3：任务完成/取消/阻塞后自动驱动下一条 todo 任务 ===
    // blocked：当前任务阻塞无法继续，agent 应立即切换到队列中下一条任务
    if (finalStatus === "done" || finalStatus === "cancelled" || finalStatus === "blocked") {
      await scheduleNextTaskForAgent(normalizeAgentId(reporterId), taskId, task?.projectId);
    }
  },

  /**
   * agent.task.manage - 主控对任务进行干预：取消、重置或延时
   *
   * 适用场景：
   * - cancel: 任务长时间阻塞无输出，判断无法完成，直接取消
   * - reset:  任务卡住但值得重试，重置回 todo 重新排队
   * - extend: 任务因难度较高超时，延长超时阈值（记录在 metadata）
   *
   * 取消/重置后自动驱动该 agent 的下一条 todo 任务
   */
  "agent.task.manage": async ({ params, respond }) => {
    const p = params as {
      taskId: string;
      action: "cancel" | "reset" | "extend";
      reason?: string; // 操作原因（会写入 worklog 和通知 agent）
      extendMinutes?: number; // action=extend 时延长的分钟数，默认 30
      operatorId?: string; // 操作者（主控 agent ID）
    };

    const taskId = String(p?.taskId ?? "").trim();
    const action = String(p?.action ?? "").trim() as "cancel" | "reset" | "extend";
    const reason = String(p?.reason ?? "").trim();
    const operatorId = String(p?.operatorId ?? "system").trim();
    const extendMinutes = typeof p?.extendMinutes === "number" ? p.extendMinutes : 30;

    if (!taskId || !["cancel", "reset", "extend"].includes(action)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "taskId and action (cancel|reset|extend) are required",
        ),
      );
      return;
    }

    try {
      const task = await taskStorage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Task ${taskId} not found`));
        return;
      }

      const now = Date.now();
      const assigneeId = task.assignees?.[0]?.id ?? "";
      const normalizedAssignee = assigneeId ? normalizeAgentId(assigneeId) : "";

      if (action === "cancel") {
        // === 取消任务 ===
        await taskStorage.updateTask(taskId, {
          status: "cancelled",
          cancelledAt: now,
          cancelReason: reason || "Cancelled by supervisor due to task blockage",
        });
        await taskStorage.addWorklog({
          id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
          taskId,
          agentId: operatorId,
          action: "cancelled",
          details: `Task cancelled by ${operatorId}. Reason: ${reason || "blockage/timeout"}`,
          result: "failure",
          createdAt: now,
        });

        // 通知 agent 任务已被取消
        if (normalizedAssignee) {
          const agentSession = `agent:${normalizedAssignee}:main`;
          enqueueSystemEvent(
            [
              `[TASK CANCELLED] Task ${taskId} has been cancelled by supervisor.`,
              `Title: ${task.title}`,
              `Reason: ${reason || "Task was blocked/timed out"}`,
              ``,
              `Your next queued task (if any) will be started automatically.`,
            ].join("\n"),
            { sessionKey: agentSession, contextKey: `task-manage:cancel:${taskId}` },
          );
        }

        // 取消后自动驱动下一条任务
        if (normalizedAssignee) {
          await scheduleNextTaskForAgent(normalizedAssignee, taskId, task.projectId);
        }

        respond(
          true,
          { success: true, taskId, action: "cancel", assigneeId: normalizedAssignee },
          undefined,
        );
      } else if (action === "reset") {
        // === 重置任务回 todo 重新排队 ===
        await taskStorage.updateTask(taskId, {
          status: "todo",
          timeTracking: {
            ...task.timeTracking,
            startedAt: undefined,
            lastActivityAt: undefined,
          },
        });
        await taskStorage.addWorklog({
          id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
          taskId,
          agentId: operatorId,
          action: "reset",
          details: `Task reset to todo by ${operatorId}. Reason: ${reason || "timeout/blockage"}`,
          result: "partial",
          createdAt: now,
        });

        // 通知 agent 任务已被重置
        if (normalizedAssignee) {
          const agentSession = `agent:${normalizedAssignee}:main`;
          enqueueSystemEvent(
            [
              `[TASK RESET] Task ${taskId} has been reset to queue by supervisor.`,
              `Title: ${task.title}`,
              `Reason: ${reason || "Task was blocked/timed out, will be retried"}`,
              ``,
              `This task has been moved back to the todo queue. Your next queued task will start now.`,
            ].join("\n"),
            { sessionKey: agentSession, contextKey: `task-manage:reset:${taskId}` },
          );
          // 重置后驱动队列中的下一条（重置的任务会按优先级重新排入）
          await scheduleNextTaskForAgent(normalizedAssignee, taskId, task.projectId);
        }

        respond(
          true,
          { success: true, taskId, action: "reset", assigneeId: normalizedAssignee },
          undefined,
        );
      } else if (action === "extend") {
        // === 延时：在 metadata 中记录延长的超时截止时间 ===
        const extendUntil = now + extendMinutes * 60 * 1000;
        await taskStorage.updateTask(taskId, {
          metadata: {
            ...task.metadata,
            timeoutExtendedUntil: extendUntil,
            timeoutExtendedBy: operatorId,
            timeoutExtendedAt: now,
            timeoutExtendReason: reason || "Task complexity requires more time",
          },
        });
        await taskStorage.addWorklog({
          id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
          taskId,
          agentId: operatorId,
          action: "extended",
          details: `Timeout extended by ${extendMinutes}min by ${operatorId}. Reason: ${reason || "complexity"}. Extended until: ${new Date(extendUntil).toISOString()}`,
          result: "success",
          createdAt: now,
        });

        // 通知 agent 已获得更多时间
        if (normalizedAssignee) {
          const agentSession = `agent:${normalizedAssignee}:main`;
          enqueueSystemEvent(
            [
              `[TASK EXTENDED] Task ${taskId} has been given ${extendMinutes} more minutes by supervisor.`,
              `Title: ${task.title}`,
              `New deadline: ${new Date(extendUntil).toISOString()}`,
              `Reason: ${reason || "Task complexity requires more time"}`,
              ``,
              `Continue executing this task. Report when complete.`,
            ].join("\n"),
            { sessionKey: agentSession, contextKey: `task-manage:extend:${taskId}` },
          );
          requestHeartbeatNow({
            reason: `task-extended:${taskId}`,
            sessionKey: agentSession,
            agentId: normalizedAssignee,
          });
        }

        respond(
          true,
          { success: true, taskId, action: "extend", extendUntil, extendMinutes },
          undefined,
        );
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to manage task: ${String(err)}`),
      );
    }
  },

  /**
   * agent.team.status - 主管Agent查询团队当前任务状态
   *
   * 一次查询多个下属的所有任务，返回团队监控数据
   * 可按 supervisorId 、projectId、agentIds 等条件查询
   */
  "agent.team.status": async ({ params, respond }) => {
    const p = params as {
      supervisorId?: string; // 主管ID，查询其下达的任务
      agentIds?: string[]; // 明确指定多个Agent ID
      projectId?: string; // 按项目过滤
      includeCompleted?: boolean; // 是否包含已完成任务
      limit?: number;
    };

    try {
      const supervisorId = p?.supervisorId ? String(p.supervisorId).trim() : undefined;
      const agentIds = Array.isArray(p?.agentIds) ? p.agentIds.map(String) : [];
      const projectId = p?.projectId ? String(p.projectId).trim() : undefined;
      const includeCompleted =
        typeof p?.includeCompleted === "boolean" ? p.includeCompleted : false;
      const limit = typeof p?.limit === "number" ? Math.min(p.limit, 500) : 200;

      // 获取相关任务
      const allTasks = await taskStorage.listTasks({
        projectId,
        ...(includeCompleted
          ? {}
          : {
              status: [
                "todo",
                "in-progress",
                "review",
                "blocked",
              ] as import("../../tasks/types.js").TaskStatus[],
            }),
      });

      // 过滤出目标 Agent 的任务
      const filteredTasks = allTasks
        .filter((t) => {
          const assigneeIds = new Set(t.assignees?.map((a) => a.id) ?? []);
          // 如果指定了 agentIds，过滤
          if (agentIds.length > 0) {
            return agentIds.some((id) => assigneeIds.has(id));
          }
          // 如果指定了 supervisorId，查找为该主管下达的任务
          if (supervisorId) {
            const meta = t.metadata ?? {};
            return meta.supervisorId === supervisorId || t.creatorId === supervisorId;
          }
          return true;
        })
        .slice(0, limit);

      // 按 Agent 分组统计
      const agentTaskMap = new Map<
        string,
        {
          agentId: string;
          tasks: typeof filteredTasks;
          counts: {
            total: number;
            todo: number;
            inProgress: number;
            review: number;
            blocked: number;
            done: number;
            cancelled: number;
          };
          lastActivity: number;
        }
      >();

      for (const t of filteredTasks) {
        // 防御性检查：确保 assignees 存在
        const assignees = t.assignees ?? [];
        for (const assignee of assignees) {
          const agentId = assignee.id;
          if (!agentTaskMap.has(agentId)) {
            agentTaskMap.set(agentId, {
              agentId,
              tasks: [],
              counts: {
                total: 0,
                todo: 0,
                inProgress: 0,
                review: 0,
                blocked: 0,
                done: 0,
                cancelled: 0,
              },
              lastActivity: 0,
            });
          }
          const entry = agentTaskMap.get(agentId)!;
          entry.tasks.push(t);
          entry.counts.total++;
          const statusKey =
            t.status === "in-progress" ? "inProgress" : (t.status as keyof typeof entry.counts);
          if (statusKey in entry.counts) {
            (entry.counts as Record<string, number>)[statusKey]++;
          }
          const activityTs = t.timeTracking?.lastActivityAt ?? t.updatedAt ?? t.createdAt;
          if (activityTs > entry.lastActivity) {
            entry.lastActivity = activityTs;
          }
        }
      }

      const teamStatus = Array.from(agentTaskMap.values()).map((entry) => ({
        agentId: entry.agentId,
        taskCounts: entry.counts,
        lastActivity: entry.lastActivity,
        activeTasks: entry.tasks
          .filter((t) => ["in-progress", "review", "blocked"].includes(t.status))
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            createdAt: t.createdAt,
            supervisorId: (t.metadata ?? {}).supervisorId ?? t.creatorId,
          })),
      }));

      // 全局小结
      const summary = {
        totalTasks: filteredTasks.length,
        agentCount: teamStatus.length,
        tasksByStatus: {
          todo: filteredTasks.filter((t) => t.status === "todo").length,
          inProgress: filteredTasks.filter((t) => t.status === "in-progress").length,
          review: filteredTasks.filter((t) => t.status === "review").length,
          blocked: filteredTasks.filter((t) => t.status === "blocked").length,
          done: filteredTasks.filter((t) => t.status === "done").length,
          cancelled: filteredTasks.filter((t) => t.status === "cancelled").length,
        },
        queriedAt: Date.now(),
      };

      respond(true, { summary, teamStatus, supervisorId, projectId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get team status: ${String(err)}`),
      );
    }
  },
};
