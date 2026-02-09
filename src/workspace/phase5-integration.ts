/**
 * Phase 5: 工作空间与文档系统 - 集成器
 *
 * 职责:
 * 1. 初始化所有 Phase 5 模块
 * 2. 协调各模块之间的交互
 * 3. 提供统一的对外接口
 * 4. 管理配置和生命周期
 */

import type {
  SessionType,
  BootstrapFile,
  KnowledgeSedimentationResult,
  Message,
  GroupWorkspace,
  WorkspaceResolution,
} from "./types.js";
import { GroupsConfig, validateGroupsConfig, mergeGroupsConfig } from "../config/types.groups.js";
import { bootstrapLoader } from "./bootstrap-loader.js";
import { fileToolsSecure } from "./file-tools-secure.js";
import { groupWorkspaceManager } from "./group-workspace.js";
import { knowledgeSedimentation } from "./knowledge-sedimentation.js";
import { workspaceAccessControl } from "./workspace-access-control.js";

/**
 * Phase 5 集成配置
 */
export interface Phase5IntegrationConfig {
  /**
   * 群组配置
   */
  groups?: GroupsConfig;

  /**
   * 智能助手工作空间根目录
   */
  agentWorkspaceRoot?: string;

  /**
   * 是否启用文件访问日志
   */
  enableFileAccessLog?: boolean;

  /**
   * 最大日志数量
   */
  maxLogEntries?: number;
}

/**
 * Phase 5 集成器（单例）
 */
export class Phase5Integration {
  private static instance: Phase5Integration;
  private initialized: boolean = false;
  private config?: Phase5IntegrationConfig;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): Phase5Integration {
    if (!Phase5Integration.instance) {
      Phase5Integration.instance = new Phase5Integration();
    }
    return Phase5Integration.instance;
  }

  /**
   * 初始化 Phase 5
   * @param config 配置
   */
  public async initialize(config?: Phase5IntegrationConfig): Promise<void> {
    if (this.initialized) {
      console.warn("Phase 5 已经初始化");
      return;
    }

    console.log("开始初始化 Phase 5: 工作空间与文档系统...");

    this.config = config;

    // 1. 验证群组配置
    if (config?.groups) {
      const validation = validateGroupsConfig(config.groups);
      if (!validation.valid) {
        throw new Error(`群组配置验证失败: ${validation.errors.join(", ")}`);
      }

      // 合并配置
      const mergedConfig = mergeGroupsConfig(config.groups);

      // 初始化群组工作空间管理器
      if (mergedConfig.workspace?.root) {
        groupWorkspaceManager.setRootDir(mergedConfig.workspace.root);
      }

      // 初始化知识沉淀系统
      if (mergedConfig.workspace?.knowledgeSedimentation) {
        knowledgeSedimentation.setConfig(mergedConfig.workspace.knowledgeSedimentation);
      }

      // 初始化预定义群组
      if (mergedConfig.groups) {
        for (const groupDef of mergedConfig.groups) {
          const firstAdmin = groupDef.admins?.[0] || groupDef.members?.[0] || "system";
          groupWorkspaceManager.ensureGroupWorkspace(groupDef.id, groupDef.name, firstAdmin);

          // 添加其他成员
          if (groupDef.members) {
            for (const memberId of groupDef.members) {
              if (memberId !== firstAdmin) {
                groupWorkspaceManager.addGroupMember(groupDef.id, memberId, firstAdmin);
              }
            }
          }

          // 添加其他管理员
          if (groupDef.admins) {
            for (const adminId of groupDef.admins) {
              if (adminId !== firstAdmin) {
                groupWorkspaceManager.addGroupMember(groupDef.id, adminId, firstAdmin);
              }
            }
          }
        }
      }
    }

    // 2. 设置智能助手工作空间根目录
    if (config?.agentWorkspaceRoot) {
      workspaceAccessControl.setAgentWorkspaceRoot(config.agentWorkspaceRoot);
      bootstrapLoader.setAgentWorkspaceRoot(config.agentWorkspaceRoot);
    }

    // 3. 配置文件访问日志
    if (config?.enableFileAccessLog !== undefined) {
      fileToolsSecure.setLoggingConfig(config.enableFileAccessLog, config.maxLogEntries);
    }

    this.initialized = true;
    console.log("Phase 5 初始化完成");
  }

  /**
   * 检查是否已初始化
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取配置
   */
  public getConfig(): Phase5IntegrationConfig | undefined {
    return this.config;
  }

  /**
   * 为会话加载 Bootstrap 文件
   * @param sessionKey 会话唯一标识
   * @param sessionType 会话类型
   * @param agentId 智能助手ID
   * @param groupId 群组ID（如果是群组会话）
   * @returns Bootstrap 文件列表
   */
  public loadBootstrapForSession(
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
  ): BootstrapFile[] {
    this.ensureInitialized();
    return bootstrapLoader.loadBootstrapFiles(sessionKey, sessionType, agentId, groupId);
  }

  /**
   * 解析工作空间
   * @param sessionKey 会话唯一标识
   * @param sessionType 会话类型
   * @param agentId 智能助手ID
   * @param groupId 群组ID（如果是群组会话）
   * @returns 工作空间解析结果
   */
  public resolveWorkspace(
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
  ): WorkspaceResolution {
    this.ensureInitialized();
    return workspaceAccessControl.resolveWorkspace(sessionKey, sessionType, agentId, groupId);
  }

  /**
   * 处理消息（用于知识沉淀）
   * @param sessionId 会话ID
   * @param groupId 群组ID
   * @param message 消息
   * @returns 知识沉淀结果（如果触发）
   */
  public processMessage(
    sessionId: string,
    groupId: string,
    message: Message,
  ): KnowledgeSedimentationResult | null {
    this.ensureInitialized();
    return knowledgeSedimentation.addMessage(sessionId, groupId, message);
  }

  /**
   * 手动沉淀知识
   * @param groupId 群组ID
   * @param messages 消息列表
   * @param category 类别（可选）
   * @param title 标题（可选）
   * @returns 沉淀结果
   */
  public manualSedimentKnowledge(
    groupId: string,
    messages: Message[],
    category?: any,
    title?: string,
  ): KnowledgeSedimentationResult {
    this.ensureInitialized();
    return knowledgeSedimentation.manualSediment(groupId, messages, category, title);
  }

  /**
   * 创建群组
   * @param groupId 群组ID
   * @param groupName 群组名称
   * @param creatorId 创建者ID
   * @returns 群组工作空间
   */
  public createGroup(groupId: string, groupName: string, creatorId: string): GroupWorkspace {
    this.ensureInitialized();
    return groupWorkspaceManager.ensureGroupWorkspace(groupId, groupName, creatorId);
  }

  /**
   * 添加群组成员
   * @param groupId 群组ID
   * @param agentId 智能助手ID
   * @param operatorId 操作者ID
   * @returns 是否成功
   */
  public addGroupMember(groupId: string, agentId: string, operatorId: string): boolean {
    this.ensureInitialized();
    return groupWorkspaceManager.addGroupMember(groupId, agentId, operatorId);
  }

  /**
   * 移除群组成员
   * @param groupId 群组ID
   * @param agentId 智能助手ID
   * @param operatorId 操作者ID
   * @returns 是否成功
   */
  public removeGroupMember(groupId: string, agentId: string, operatorId: string): boolean {
    this.ensureInitialized();
    return groupWorkspaceManager.removeGroupMember(groupId, agentId, operatorId);
  }

  /**
   * 获取群组成员列表
   * @param groupId 群组ID
   * @returns 成员ID列表
   */
  public getGroupMembers(groupId: string): string[] {
    this.ensureInitialized();
    return groupWorkspaceManager.getGroupMembers(groupId);
  }

  /**
   * 安全读取文件
   * @param filePath 文件路径
   * @param sessionKey 会话唯一标识
   * @param sessionType 会话类型
   * @param agentId 智能助手ID
   * @param groupId 群组ID（如果是群组会话）
   * @returns 文件内容或错误
   */
  public readFileSecure(
    filePath: string,
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
  ) {
    this.ensureInitialized();
    const workspace = this.resolveWorkspace(sessionKey, sessionType, agentId, groupId);
    return fileToolsSecure.secureReadFile(filePath, workspace);
  }

  /**
   * 安全写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param sessionKey 会话唯一标识
   * @param sessionType 会话类型
   * @param agentId 智能助手ID
   * @param groupId 群组ID（如果是群组会话）
   * @returns 操作结果
   */
  public writeFileSecure(
    filePath: string,
    content: string,
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
  ) {
    this.ensureInitialized();
    const workspace = this.resolveWorkspace(sessionKey, sessionType, agentId, groupId);
    return fileToolsSecure.secureWriteFile(filePath, content, workspace);
  }

  /**
   * 获取文件访问统计
   * @param agentId 智能助手ID（可选）
   * @returns 统计信息
   */
  public getFileAccessStats(agentId?: string) {
    this.ensureInitialized();
    return fileToolsSecure.getAccessStats(agentId);
  }

  /**
   * 获取所有群组
   * @returns 群组列表
   */
  public getAllGroups(): GroupWorkspace[] {
    this.ensureInitialized();
    return groupWorkspaceManager.getAllWorkspaces();
  }

  /**
   * 搜索知识文档
   * @param groupId 群组ID
   * @param query 搜索关键词
   * @returns 匹配的文档路径列表
   */
  public searchKnowledge(groupId: string, query: string): string[] {
    this.ensureInitialized();
    return knowledgeSedimentation.searchKnowledgeDocuments(groupId, query);
  }

  /**
   * 获取知识文档列表
   * @param groupId 群组ID
   * @param category 类别（可选）
   * @returns 文档路径列表
   */
  public getKnowledgeDocuments(groupId: string, category?: any): string[] {
    this.ensureInitialized();
    return knowledgeSedimentation.getKnowledgeDocuments(groupId, category);
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    bootstrapLoader.clearCache();
  }

  /**
   * 重新加载配置
   * @param config 新配置
   */
  public async reloadConfig(config: Phase5IntegrationConfig): Promise<void> {
    this.initialized = false;
    await this.initialize(config);
  }

  /**
   * 验证系统健康状态
   */
  public healthCheck(): {
    healthy: boolean;
    components: {
      groupWorkspaceManager: boolean;
      workspaceAccessControl: boolean;
      bootstrapLoader: boolean;
      knowledgeSedimentation: boolean;
      fileToolsSecure: boolean;
    };
  } {
    return {
      healthy: this.initialized,
      components: {
        groupWorkspaceManager: true,
        workspaceAccessControl: true,
        bootstrapLoader: true,
        knowledgeSedimentation: true,
        fileToolsSecure: true,
      },
    };
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("Phase 5 未初始化，请先调用 initialize()");
    }
  }

  /**
   * 关闭并清理资源
   */
  public shutdown(): void {
    if (!this.initialized) {
      return;
    }

    console.log("关闭 Phase 5...");

    // 清除缓存
    this.clearCache();

    // 清除日志
    fileToolsSecure.clearAccessLogs();

    // 清除知识沉淀会话
    knowledgeSedimentation.clearAllSessions();

    this.initialized = false;
    console.log("Phase 5 已关闭");
  }
}

/**
 * 导出单例实例
 */
export const phase5Integration = Phase5Integration.getInstance();

/**
 * 便捷初始化函数
 */
export async function initializePhase5(config?: Phase5IntegrationConfig): Promise<void> {
  return phase5Integration.initialize(config);
}

/**
 * 便捷健康检查函数
 */
export function phase5HealthCheck() {
  return phase5Integration.healthCheck();
}
