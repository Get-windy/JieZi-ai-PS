/**
 * 通道管理器
 * 
 * 功能：
 * - 管理智能助手与通道的绑定关系
 * - 提供通道绑定的 CRUD 操作
 * - 支持绑定的启用/禁用
 * - 支持通道切换和策略更新
 * 
 * 重要：本地 agent.channelBindings 只作扩展元数据存储，
 * 消息路由实际读取的是 cfg.bindings（上游标准格式）。
 * 所有增删改操作需同时维护 cfg.bindings。
 */

import type {
  AgentChannelBindings,
  ChannelAccountBinding,
  ChannelPolicyConfig,
} from "../config/types.channel-bindings.js";
import type { AgentConfig } from "../config/types.agents.js";
import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { loadConfig, writeConfigFile } from "../../upstream/src/config/config.js";
import { getChannelPlugin, listChannelPlugins } from "../../upstream/src/channels/plugins/index.js";
import { channelBindingResolver } from "./bindings/resolver.js";

/** AgentConfig 扩展：携带本地 channelBindings 字段 */
type AgentConfigWithBindings = AgentConfig & {
  channelBindings?: AgentChannelBindings;
};

/** 从 OpenClawConfig 取出 agents.list（类型安全） */
function getAgentsList(config: OpenClawConfig): AgentConfigWithBindings[] {
  return (config.agents?.list ?? []) as AgentConfigWithBindings[];
}

/**
 * 通道管理器
 */
export class ChannelManager {
  private static instance: ChannelManager;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ChannelManager {
    if (!ChannelManager.instance) {
      ChannelManager.instance = new ChannelManager();
    }
    return ChannelManager.instance;
  }

  /**
   * 同步本地 channelBindings 到 cfg.bindings（上游路由实际读取的地方）
   * 
   * cfg.bindings 格式: { agentId, match: { channel, accountId } }
   * 只同步已启用的绑定。
   */
  private syncToCfgBindings(config: OpenClawConfig, agentId: string, channelBindings: AgentChannelBindings): void {
    if (!Array.isArray(config.bindings)) {
      config.bindings = [];
    }
    // 移除该 agent 由本工具管理的旧条目（comment 以 "[cm:" 开头）
    config.bindings = config.bindings.filter(
      (b) => !(b.agentId === agentId && typeof b.comment === "string" && b.comment.startsWith("[cm:")),
    );
    // 写入已启用的绑定（标准 AgentRouteBinding，用 comment 存 bindingId）
    for (const binding of channelBindings.bindings) {
      if (binding.enabled === false) { continue; }
      config.bindings.push({
        agentId,
        match: {
          channel: binding.channelId,
          accountId: binding.accountId || "default",
        },
        comment: `[cm:${binding.id}]`,
      });
    }
  }

  /**
   * 获取智能助手的所有通道绑定
   * 
   * @param agentId - 智能助手ID
   * @returns 通道绑定配置
   */
  async getAgentChannelBindings(agentId: string): Promise<AgentChannelBindings | null> {
    const config = loadConfig();
    const agent = this.findAgent(config, agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return agent.channelBindings ?? null;
  }

  /**
   * 添加通道绑定
   * 
   * @param agentId - 智能助手ID
   * @param binding - 绑定配置
   * @returns 成功标识
   */
  async addChannelBinding(
    agentId: string,
    binding: ChannelAccountBinding,
  ): Promise<{ success: boolean; bindingId: string }> {
    // 验证绑定配置
    const validation = await channelBindingResolver.validateBinding(binding);
    if (!validation.valid) {
      throw new Error(`Invalid binding configuration: ${validation.errors?.join(", ")}`);
    }

    const config = loadConfig();
    const agent = this.findAgent(config, agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // 获取或初始化通道绑定配置
    if (!agent.channelBindings) {
      agent.channelBindings = { bindings: [] };
    }
    const channelBindings = agent.channelBindings;

    // 检查是否已存在相同的绑定
    const existingBinding = channelBindings.bindings.find(
      (b) => b.channelId === binding.channelId && b.accountId === binding.accountId,
    );

    if (existingBinding) {
      throw new Error(
        `Binding already exists for channel ${binding.channelId} and account ${binding.accountId}`,
      );
    }

    // 添加绑定
    channelBindings.bindings.push({
      ...binding,
      metadata: {
        ...binding.metadata,
        createdAt: Date.now(),
      },
    });

    // 同步到 cfg.bindings（上游路由实际读取）
    this.syncToCfgBindings(config, agentId, channelBindings);

    // 保存配置
    await writeConfigFile(config);

    console.log(`[ChannelManager] Added binding ${binding.id} to agent ${agentId}`);

    return { success: true, bindingId: binding.id };
  }

  /**
   * 更新通道绑定
   * 
   * @param agentId - 智能助手ID
   * @param bindingId - 绑定ID
   * @param updates - 更新内容
   * @returns 成功标识
   */
  async updateChannelBinding(
    agentId: string,
    bindingId: string,
    updates: Partial<ChannelAccountBinding>,
  ): Promise<{ success: boolean }> {
    const config = loadConfig();
    const agent = this.findAgent(config, agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const channelBindings = agent.channelBindings;
    if (!channelBindings || !channelBindings.bindings) {
      throw new Error(`No channel bindings found for agent ${agentId}`);
    }

    // 查找绑定
    const binding = channelBindings.bindings.find((b) => b.id === bindingId);
    if (!binding) {
      throw new Error(`Binding not found: ${bindingId}`);
    }

    // 更新绑定
    Object.assign(binding, updates, {
      metadata: {
        ...binding.metadata,
        lastModifiedAt: Date.now(),
      },
    });

    // 验证更新后的绑定
    const validation = await channelBindingResolver.validateBinding(binding);
    if (!validation.valid) {
      throw new Error(`Invalid binding configuration: ${validation.errors?.join(", ")}`);
    }

    // 同步到 cfg.bindings
    this.syncToCfgBindings(config, agentId, channelBindings);

    // 保存配置
    await writeConfigFile(config);

    console.log(`[ChannelManager] Updated binding ${bindingId} for agent ${agentId}`);

    return { success: true };
  }

  /**
   * 删除通道绑定
   * 
   * @param agentId - 智能助手ID
   * @param bindingId - 绑定ID
   * @returns 成功标识
   */
  async removeChannelBinding(agentId: string, bindingId: string): Promise<{ success: boolean }> {
    const config = loadConfig();
    const agent = this.findAgent(config, agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const channelBindings = agent.channelBindings;
    if (!channelBindings || !channelBindings.bindings) {
      throw new Error(`No channel bindings found for agent ${agentId}`);
    }

    // 查找绑定索引
    const index = channelBindings.bindings.findIndex((b) => b.id === bindingId);
    if (index === -1) {
      throw new Error(`Binding not found: ${bindingId}`);
    }

    // 删除绑定
    channelBindings.bindings.splice(index, 1);

    // 同步到 cfg.bindings
    this.syncToCfgBindings(config, agentId, channelBindings);

    // 保存配置
    await writeConfigFile(config);

    console.log(`[ChannelManager] Removed binding ${bindingId} from agent ${agentId}`);

    return { success: true };
  }

  /**
   * 启用通道绑定
   * 
   * @param agentId - 智能助手ID
   * @param bindingId - 绑定ID
   * @returns 成功标识
   */
  async enableChannelBinding(agentId: string, bindingId: string): Promise<{ success: boolean }> {
    return this.updateChannelBinding(agentId, bindingId, { enabled: true });
  }

  /**
   * 禁用通道绑定
   * 
   * @param agentId - 智能助手ID
   * @param bindingId - 绑定ID
   * @returns 成功标识
   */
  async disableChannelBinding(agentId: string, bindingId: string): Promise<{ success: boolean }> {
    return this.updateChannelBinding(agentId, bindingId, { enabled: false });
  }

  /**
   * 更新绑定策略
   * 
   * @param agentId - 智能助手ID
   * @param bindingId - 绑定ID
   * @param policy - 新策略配置
   * @returns 成功标识
   */
  async updateBindingPolicy(
    agentId: string,
    bindingId: string,
    policy: ChannelPolicyConfig,
  ): Promise<{ success: boolean }> {
    return this.updateChannelBinding(agentId, bindingId, { policy });
  }

  /**
   * 获取指定绑定
   * 
   * @param agentId - 智能助手ID
   * @param bindingId - 绑定ID
   * @returns 绑定配置
   */
  async getBinding(agentId: string, bindingId: string): Promise<ChannelAccountBinding | null> {
    const channelBindings = await this.getAgentChannelBindings(agentId);

    if (!channelBindings) {
      return null;
    }

    return channelBindings.bindings.find((b) => b.id === bindingId) || null;
  }

  /**
   * 根据通道和账号查找绑定
   * 
   * @param agentId - 智能助手ID
   * @param channelId - 通道ID
   * @param accountId - 账号ID
   * @returns 绑定配置
   */
  async findBindingByChannel(
    agentId: string,
    channelId: string,
    accountId: string,
  ): Promise<ChannelAccountBinding | null> {
    const channelBindings = await this.getAgentChannelBindings(agentId);

    if (!channelBindings) {
      return null;
    }

    // 使用解析器查找匹配的绑定
    return channelBindingResolver.resolveBinding(channelBindings, channelId, accountId);
  }

  /**
   * 列出智能助手的所有绑定
   * 
   * @param agentId - 智能助手ID
   * @param options - 查询选项
   * @returns 绑定列表
   */
  async listBindings(
    agentId: string,
    options?: {
      channelId?: string;
      enabled?: boolean;
    },
  ): Promise<ChannelAccountBinding[]> {
    const channelBindings = await this.getAgentChannelBindings(agentId);

    if (!channelBindings || !channelBindings.bindings) {
      return [];
    }

    let bindings = channelBindings.bindings;

    // 应用过滤
    if (options?.channelId) {
      bindings = bindings.filter((b) => b.channelId === options.channelId);
    }

    if (options?.enabled !== undefined) {
      bindings = bindings.filter((b) => (b.enabled !== false) === options.enabled);
    }

    return bindings;
  }

  /**
   * 批量更新绑定优先级
   * 
   * @param agentId - 智能助手ID
   * @param priorities - 优先级映射 { bindingId: priority }
   * @returns 成功标识
   */
  async updateBindingPriorities(
    agentId: string,
    priorities: Record<string, number>,
  ): Promise<{ success: boolean }> {
    const config = loadConfig();
    const agent = this.findAgent(config, agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const channelBindings = agent.channelBindings;
    if (!channelBindings || !channelBindings.bindings) {
      throw new Error(`No channel bindings found for agent ${agentId}`);
    }

    // 更新优先级
    for (const binding of channelBindings.bindings) {
      if (priorities[binding.id] !== undefined) {
        binding.priority = priorities[binding.id];
      }
    }

    // 同步到 cfg.bindings
    this.syncToCfgBindings(config, agentId, channelBindings);

    // 保存配置
    await writeConfigFile(config);

    console.log(`[ChannelManager] Updated binding priorities for agent ${agentId}`);

    return { success: true };
  }

  /**
   * 获取默认策略
   * 
   * @param agentId - 智能助手ID
   * @returns 默认策略配置
   */
  async getDefaultPolicy(agentId: string): Promise<ChannelPolicyConfig | null> {
    const channelBindings = await this.getAgentChannelBindings(agentId);

    if (!channelBindings) {
      return null;
    }

    return channelBindings.defaultPolicy || null;
  }

  /**
   * 设置默认策略
   * 
   * @param agentId - 智能助手ID
   * @param policy - 默认策略配置
   * @returns 成功标识
   */
  async setDefaultPolicy(
    agentId: string,
    policy: ChannelPolicyConfig,
  ): Promise<{ success: boolean }> {
    const config = loadConfig();
    const agent = this.findAgent(config, agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // 获取或初始化通道绑定配置
    if (!agent.channelBindings) {
      agent.channelBindings = { bindings: [] };
    }
    const channelBindings = agent.channelBindings;

    // 设置默认策略
    channelBindings.defaultPolicy = policy;

    // 同步到 cfg.bindings（策略不影响路由条目，无需重新同步）

    // 保存配置
    await writeConfigFile(config);

    console.log(`[ChannelManager] Set default policy for agent ${agentId}`);

    return { success: true };
  }

  /**
   * 清理所有 agent 中引用了不存在账号的孤立绑定
   *
   * 当通道账号被删除后调用此方法，自动从所有 agent 的 channelBindings
   * 中移除已无效的绑定记录（channelId + accountId 在配置中已不存在）。
   *
   * @param cfg - 已更新的配置（账号删除后的）
   * @returns 被清理的绑定数量
   */
  async purgeOrphanBindings(cfg: OpenClawConfig): Promise<number> {
    // 构建当前有效账号集合：Set<"channelId:accountId">
    const validKeys = new Set<string>();
    for (const plugin of listChannelPlugins()) {
      const accountIds: string[] = plugin.config.listAccountIds(cfg);
      for (const accountId of accountIds) {
        validKeys.add(`${plugin.id}:${accountId}`);
      }
    }

    const agents = getAgentsList(cfg);
    let totalRemoved = 0;
    let configDirty = false;

    for (const agent of agents) {
      const channelBindings = agent.channelBindings;
      if (!channelBindings?.bindings?.length) { continue; }

      const before = channelBindings.bindings.length;
      channelBindings.bindings = channelBindings.bindings.filter((b) => {
        // accountId 为空或 "default" 时只校验 channelId 是否还有任意账号
        if (!b.accountId || b.accountId === "default") {
          // channelId 来自 ChannelAccountBinding，类型为 string，需转为 ChannelId
          const plugin = getChannelPlugin(b.channelId as Parameters<typeof getChannelPlugin>[0]);
          if (!plugin) { return false; }
          const ids: string[] = plugin.config.listAccountIds(cfg);
          return ids.length > 0;
        }
        return validKeys.has(`${b.channelId}:${b.accountId}`);
      });

      const removed = before - channelBindings.bindings.length;
      if (removed > 0) {
        totalRemoved += removed;
        configDirty = true;
        // 同步到 cfg.bindings
        this.syncToCfgBindings(cfg, agent.id, channelBindings);
        console.log(
          `[ChannelManager] purgeOrphanBindings: removed ${removed} orphan binding(s) from agent ${agent.id}`,
        );
      }
    }

    if (configDirty) {
      await writeConfigFile(cfg);
      console.log(`[ChannelManager] purgeOrphanBindings: saved config, total removed=${totalRemoved}`);
    }

    return totalRemoved;
  }

  /**
   * 辅助方法：查找智能助手
   */
  private findAgent(config: OpenClawConfig, agentId: string): AgentConfigWithBindings | undefined {
    return getAgentsList(config).find((a) => a.id === agentId);
  }

  /**
   * 启动时迁移：将所有 agent 的 channelBindings 同步到 cfg.bindings
   *
   * 对于升级前已经通过 channels.bindings.add 保存的绑定数据，
   * 本方法确保它们被同步到上游路由读取的 cfg.bindings。
   */
  async migrateAllAgentBindingsToCfg(): Promise<void> {
    const config = loadConfig();
    const agents = getAgentsList(config);
    let migrated = 0;
    for (const agent of agents) {
      const channelBindings = agent.channelBindings;
      if (!channelBindings?.bindings?.length) { continue; }
      this.syncToCfgBindings(config, agent.id, channelBindings);
      migrated++;
    }
    if (migrated > 0) {
      await writeConfigFile(config);
      console.log(`[ChannelManager] Migrated channel bindings for ${migrated} agent(s) to cfg.bindings`);
    }
  }
}

/**
 * 导出单例实例
 */
export const channelManager = ChannelManager.getInstance();
