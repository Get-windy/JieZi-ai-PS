/**
 * Phase 5: Agent 上下文隔离系统
 *
 * 为每个智能助手提供独立的运行上下文，包括：
 * - 独立的工作空间
 * - 隔离的运行时状态
 * - 独立的会话管理
 * - 资源访问控制
 */

import * as os from "os";
import * as path from "path";
import type { AgentConfig } from "../config/types.agents.js";

/**
 * Agent 上下文状态
 */
export interface AgentContext {
  /** 智能助手ID */
  agentId: string;

  /** 智能助手名称 */
  agentName: string;

  /** 工作空间路径 */
  workspaceDir: string;

  /** 临时文件目录 */
  tempDir: string;

  /** 日志目录 */
  logDir: string;

  /** 数据目录 */
  dataDir: string;

  /** 缓存目录 */
  cacheDir: string;

  /** 运行时状态 */
  state: {
    /** 是否已初始化 */
    initialized: boolean;

    /** 启动时间 */
    startedAt?: number;

    /** 当前活跃会话数 */
    activeSessions: number;

    /** 总处理消息数 */
    totalMessages: number;

    /** 最后活跃时间 */
    lastActiveAt?: number;
  };

  /** 环境变量（Agent 特定） */
  env: Record<string, string>;

  /** 配置引用 */
  config: AgentConfig;
}

/**
 * Agent 沙箱配置
 */
export interface SandboxConfig {
  /** 是否启用文件系统隔离 */
  enableFsIsolation: boolean;

  /** 允许访问的目录白名单 */
  allowedPaths?: string[];

  /** 禁止访问的目录黑名单 */
  deniedPaths?: string[];

  /** 是否启用网络隔离 */
  enableNetworkIsolation: boolean;

  /** 允许的域名/IP白名单 */
  allowedHosts?: string[];

  /** 最大内存限制（MB） */
  maxMemoryMB?: number;

  /** 最大CPU时间（秒） */
  maxCpuSeconds?: number;
}

/**
 * Agent 上下文管理器
 */
export class AgentContextManager {
  private contexts: Map<string, AgentContext> = new Map();
  private sandboxConfigs: Map<string, SandboxConfig> = new Map();
  private baseWorkspaceDir: string;

  constructor(baseWorkspaceDir?: string) {
    this.baseWorkspaceDir = baseWorkspaceDir || path.join(os.homedir(), ".openclaw", "agents");
  }

  /**
   * 创建 Agent 上下文
   */
  async createContext(config: AgentConfig, sandboxConfig?: SandboxConfig): Promise<AgentContext> {
    const agentId = config.id;

    // 检查是否已存在
    if (this.contexts.has(agentId)) {
      return this.contexts.get(agentId)!;
    }

    // 创建目录结构
    const workspaceDir = path.join(this.baseWorkspaceDir, agentId);
    const tempDir = path.join(workspaceDir, "temp");
    const logDir = path.join(workspaceDir, "logs");
    const dataDir = path.join(workspaceDir, "data");
    const cacheDir = path.join(workspaceDir, "cache");

    // 创建上下文
    const context: AgentContext = {
      agentId,
      agentName: config.name || agentId,
      workspaceDir,
      tempDir,
      logDir,
      dataDir,
      cacheDir,
      state: {
        initialized: false,
        activeSessions: 0,
        totalMessages: 0,
      },
      env: {
        AGENT_ID: agentId,
        AGENT_NAME: config.name || agentId,
        AGENT_WORKSPACE: workspaceDir,
        AGENT_TEMP: tempDir,
        AGENT_LOG: logDir,
        AGENT_DATA: dataDir,
        AGENT_CACHE: cacheDir,
      },
      config,
    };

    // 保存上下文
    this.contexts.set(agentId, context);

    // 保存沙箱配置
    if (sandboxConfig) {
      this.sandboxConfigs.set(agentId, sandboxConfig);
    }

    console.log(`[Agent Context] Created context for agent ${agentId}`);
    return context;
  }

  /**
   * 初始化 Agent 上下文
   */
  async initializeContext(agentId: string): Promise<void> {
    const context = this.contexts.get(agentId);
    if (!context) {
      throw new Error(`Context for agent ${agentId} not found`);
    }

    if (context.state.initialized) {
      console.log(`[Agent Context] Agent ${agentId} already initialized`);
      return;
    }

    // 创建目录结构（实际实现需要使用 fs）
    console.log(`[Agent Context] Initializing directories for agent ${agentId}`);
    // await fs.mkdir(context.workspaceDir, { recursive: true });
    // await fs.mkdir(context.tempDir, { recursive: true });
    // await fs.mkdir(context.logDir, { recursive: true });
    // await fs.mkdir(context.dataDir, { recursive: true });
    // await fs.mkdir(context.cacheDir, { recursive: true });

    // 更新状态
    context.state.initialized = true;
    context.state.startedAt = Date.now();
    context.state.lastActiveAt = Date.now();

    console.log(`[Agent Context] Agent ${agentId} initialized successfully`);
  }

  /**
   * 获取 Agent 上下文
   */
  getContext(agentId: string): AgentContext | null {
    return this.contexts.get(agentId) || null;
  }

  /**
   * 获取所有上下文
   */
  getAllContexts(): AgentContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * 更新 Agent 活跃时间
   */
  updateActivity(agentId: string): void {
    const context = this.contexts.get(agentId);
    if (context) {
      context.state.lastActiveAt = Date.now();
    }
  }

  /**
   * 增加消息计数
   */
  incrementMessageCount(agentId: string): void {
    const context = this.contexts.get(agentId);
    if (context) {
      context.state.totalMessages++;
      this.updateActivity(agentId);
    }
  }

  /**
   * 更新活跃会话数
   */
  updateSessionCount(agentId: string, delta: number): void {
    const context = this.contexts.get(agentId);
    if (context) {
      context.state.activeSessions += delta;
      this.updateActivity(agentId);
    }
  }

  /**
   * 检查文件路径是否允许访问
   */
  checkPathAccess(
    agentId: string,
    filePath: string,
  ): {
    allowed: boolean;
    reason?: string;
  } {
    const sandboxConfig = this.sandboxConfigs.get(agentId);
    if (!sandboxConfig || !sandboxConfig.enableFsIsolation) {
      return { allowed: true };
    }

    const normalizedPath = path.resolve(filePath);

    // 检查黑名单
    if (sandboxConfig.deniedPaths) {
      for (const deniedPath of sandboxConfig.deniedPaths) {
        if (normalizedPath.startsWith(path.resolve(deniedPath))) {
          return {
            allowed: false,
            reason: `Path "${filePath}" is in denied list`,
          };
        }
      }
    }

    // 检查白名单
    if (sandboxConfig.allowedPaths && sandboxConfig.allowedPaths.length > 0) {
      let inWhitelist = false;
      for (const allowedPath of sandboxConfig.allowedPaths) {
        if (normalizedPath.startsWith(path.resolve(allowedPath))) {
          inWhitelist = true;
          break;
        }
      }

      if (!inWhitelist) {
        return {
          allowed: false,
          reason: `Path "${filePath}" is not in allowed list`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 检查网络访问是否允许
   */
  checkNetworkAccess(
    agentId: string,
    host: string,
  ): {
    allowed: boolean;
    reason?: string;
  } {
    const sandboxConfig = this.sandboxConfigs.get(agentId);
    if (!sandboxConfig || !sandboxConfig.enableNetworkIsolation) {
      return { allowed: true };
    }

    // 检查白名单
    if (sandboxConfig.allowedHosts && sandboxConfig.allowedHosts.length > 0) {
      const isAllowed = sandboxConfig.allowedHosts.some((allowedHost) => {
        // 支持通配符匹配
        if (allowedHost.startsWith("*.")) {
          const domain = allowedHost.slice(2);
          return host.endsWith(domain) || host === domain;
        }
        return host === allowedHost;
      });

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Host "${host}" is not in allowed list`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 获取 Agent 环境变量
   */
  getEnvironment(agentId: string): Record<string, string> {
    const context = this.contexts.get(agentId);
    return context ? { ...context.env } : {};
  }

  /**
   * 设置 Agent 环境变量
   */
  setEnvironmentVariable(agentId: string, key: string, value: string): void {
    const context = this.contexts.get(agentId);
    if (context) {
      context.env[key] = value;
    }
  }

  /**
   * 获取 Agent 统计信息
   */
  getStats(agentId: string): {
    uptime?: number;
    activeSessions: number;
    totalMessages: number;
    lastActiveAt?: number;
  } | null {
    const context = this.contexts.get(agentId);
    if (!context) return null;

    return {
      uptime: context.state.startedAt ? Date.now() - context.state.startedAt : undefined,
      activeSessions: context.state.activeSessions,
      totalMessages: context.state.totalMessages,
      lastActiveAt: context.state.lastActiveAt,
    };
  }

  /**
   * 销毁 Agent 上下文
   */
  async destroyContext(agentId: string): Promise<void> {
    const context = this.contexts.get(agentId);
    if (!context) {
      console.warn(`[Agent Context] Context for agent ${agentId} not found`);
      return;
    }

    // 清理资源
    console.log(`[Agent Context] Destroying context for agent ${agentId}`);

    // 删除上下文
    this.contexts.delete(agentId);
    this.sandboxConfigs.delete(agentId);

    console.log(`[Agent Context] Context for agent ${agentId} destroyed`);
  }

  /**
   * 清理所有上下文
   */
  async cleanup(): Promise<void> {
    console.log("[Agent Context] Cleaning up all contexts...");

    for (const agentId of this.contexts.keys()) {
      await this.destroyContext(agentId);
    }

    console.log("[Agent Context] All contexts cleaned up");
  }
}

/**
 * 全局 Agent 上下文管理器实例
 */
export const agentContextManager = new AgentContextManager();
