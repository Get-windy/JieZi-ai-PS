/**
 * Phase 3: 技能管理和动态加载系统
 *
 * 为智能助手提供技能管理能力：
 * - 技能注册和发现
 * - 动态加载/卸载
 * - 权限控制
 * - 依赖管理
 */

/**
 * 技能类型
 */
export type SkillType =
  | "tool" // 工具技能（如文件操作、网络请求）
  | "command" // 命令技能（如执行shell命令）
  | "integration" // 集成技能（如API调用）
  | "cognitive" // 认知技能（如推理、分析）
  | "custom"; // 自定义技能

/**
 * 技能状态
 */
export type SkillStatus =
  | "available" // 可用
  | "loading" // 加载中
  | "loaded" // 已加载
  | "disabled" // 已禁用
  | "error"; // 错误

/**
 * 技能元数据
 */
export interface SkillMetadata {
  /** 技能ID */
  id: string;

  /** 技能名称 */
  name: string;

  /** 技能描述 */
  description: string;

  /** 技能类型 */
  type: SkillType;

  /** 版本号 */
  version: string;

  /** 作者 */
  author?: string;

  /** 标签 */
  tags?: string[];

  /** 依赖的其他技能 */
  dependencies?: string[];

  /** 所需权限 */
  requiredPermissions?: string[];

  /** 配置模式 */
  configSchema?: Record<string, any>;
}

/**
 * 技能实例
 */
export interface Skill {
  /** 元数据 */
  metadata: SkillMetadata;

  /** 初始化函数 */
  initialize?: (config?: any) => Promise<void>;

  /** 执行函数 */
  execute: (params: any) => Promise<any>;

  /** 清理函数 */
  cleanup?: () => Promise<void>;

  /** 健康检查 */
  healthCheck?: () => Promise<boolean>;
}

/**
 * 技能注册项
 */
export interface SkillRegistration {
  /** 技能实例 */
  skill: Skill;

  /** 状态 */
  status: SkillStatus;

  /** 加载时间 */
  loadedAt?: number;

  /** 最后使用时间 */
  lastUsedAt?: number;

  /** 使用次数 */
  usageCount: number;

  /** 错误信息 */
  error?: string;

  /** 配置 */
  config?: any;
}

/**
 * 技能执行结果
 */
export interface SkillExecutionResult {
  /** 是否成功 */
  success: boolean;

  /** 结果数据 */
  data?: any;

  /** 错误信息 */
  error?: string;

  /** 执行时间（毫秒） */
  executionTime: number;

  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 技能管理器
 */
export class SkillManager {
  private skills: Map<string, SkillRegistration> = new Map();
  private agentSkills: Map<string, Set<string>> = new Map(); // agentId -> skillIds

  /**
   * 注册技能
   */
  registerSkill(skill: Skill, config?: any): void {
    const skillId = skill.metadata.id;

    if (this.skills.has(skillId)) {
      console.warn(`[Skill Manager] Skill ${skillId} already registered, updating...`);
    }

    const registration: SkillRegistration = {
      skill,
      status: "available",
      usageCount: 0,
      config,
    };

    this.skills.set(skillId, registration);
    console.log(`[Skill Manager] Registered skill: ${skillId}`);
  }

  /**
   * 批量注册技能
   */
  registerSkills(skills: Skill[], configs?: Record<string, any>): void {
    for (const skill of skills) {
      const config = configs?.[skill.metadata.id];
      this.registerSkill(skill, config);
    }
  }

  /**
   * 为 Agent 启用技能
   */
  async enableSkillForAgent(agentId: string, skillId: string): Promise<void> {
    const registration = this.skills.get(skillId);
    if (!registration) {
      throw new Error(`Skill ${skillId} not found`);
    }

    // 检查依赖
    if (registration.skill.metadata.dependencies) {
      for (const depId of registration.skill.metadata.dependencies) {
        if (!this.skills.has(depId)) {
          throw new Error(`Skill ${skillId} depends on ${depId} which is not registered`);
        }
      }
    }

    // 初始化技能（如果需要）
    if (registration.status === "available") {
      try {
        registration.status = "loading";

        if (registration.skill.initialize) {
          await registration.skill.initialize(registration.config);
        }

        registration.status = "loaded";
        registration.loadedAt = Date.now();
      } catch (error) {
        registration.status = "error";
        registration.error = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }

    // 添加到 Agent 的技能列表
    if (!this.agentSkills.has(agentId)) {
      this.agentSkills.set(agentId, new Set());
    }
    this.agentSkills.get(agentId)!.add(skillId);

    console.log(`[Skill Manager] Enabled skill ${skillId} for agent ${agentId}`);
  }

  /**
   * 为 Agent 禁用技能
   */
  async disableSkillForAgent(agentId: string, skillId: string): Promise<void> {
    const agentSkillSet = this.agentSkills.get(agentId);
    if (!agentSkillSet) {
      return;
    }

    agentSkillSet.delete(skillId);
    console.log(`[Skill Manager] Disabled skill ${skillId} for agent ${agentId}`);
  }

  /**
   * 执行技能
   */
  async executeSkill(agentId: string, skillId: string, params: any): Promise<SkillExecutionResult> {
    // 检查 Agent 是否有该技能
    const agentSkillSet = this.agentSkills.get(agentId);
    if (!agentSkillSet || !agentSkillSet.has(skillId)) {
      return {
        success: false,
        error: `Agent ${agentId} does not have skill ${skillId} enabled`,
        executionTime: 0,
      };
    }

    // 获取技能
    const registration = this.skills.get(skillId);
    if (!registration) {
      return {
        success: false,
        error: `Skill ${skillId} not found`,
        executionTime: 0,
      };
    }

    if (registration.status === "disabled") {
      return {
        success: false,
        error: `Skill ${skillId} is disabled`,
        executionTime: 0,
      };
    }

    if (registration.status === "error") {
      return {
        success: false,
        error: `Skill ${skillId} has error: ${registration.error}`,
        executionTime: 0,
      };
    }

    // 执行技能
    const startTime = Date.now();
    try {
      const data = await registration.skill.execute(params);
      const executionTime = Date.now() - startTime;

      // 更新统计
      registration.usageCount++;
      registration.lastUsedAt = Date.now();

      return {
        success: true,
        data,
        executionTime,
        metadata: {
          skillId,
          skillName: registration.skill.metadata.name,
          skillType: registration.skill.metadata.type,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      };
    }
  }

  /**
   * 获取 Agent 的所有技能
   */
  getAgentSkills(agentId: string): SkillMetadata[] {
    const skillIds = this.agentSkills.get(agentId);
    if (!skillIds) {
      return [];
    }

    const skills: SkillMetadata[] = [];
    for (const skillId of skillIds) {
      const registration = this.skills.get(skillId);
      if (registration) {
        skills.push(registration.skill.metadata);
      }
    }

    return skills;
  }

  /**
   * 获取所有已注册的技能
   */
  getAllSkills(): SkillMetadata[] {
    return Array.from(this.skills.values()).map((reg) => reg.skill.metadata);
  }

  /**
   * 获取技能详情
   */
  getSkillDetails(skillId: string): {
    metadata: SkillMetadata;
    status: SkillStatus;
    stats: {
      loadedAt?: number;
      lastUsedAt?: number;
      usageCount: number;
    };
    error?: string;
  } | null {
    const registration = this.skills.get(skillId);
    if (!registration) {
      return null;
    }

    return {
      metadata: registration.skill.metadata,
      status: registration.status,
      stats: {
        loadedAt: registration.loadedAt,
        lastUsedAt: registration.lastUsedAt,
        usageCount: registration.usageCount,
      },
      error: registration.error,
    };
  }

  /**
   * 检查技能健康状态
   */
  async checkSkillHealth(skillId: string): Promise<boolean> {
    const registration = this.skills.get(skillId);
    if (!registration || registration.status !== "loaded") {
      return false;
    }

    if (registration.skill.healthCheck) {
      try {
        return await registration.skill.healthCheck();
      } catch (error) {
        console.error(`[Skill Manager] Health check failed for skill ${skillId}:`, error);
        return false;
      }
    }

    return true;
  }

  /**
   * 卸载技能
   */
  async unloadSkill(skillId: string): Promise<void> {
    const registration = this.skills.get(skillId);
    if (!registration) {
      return;
    }

    // 从所有 Agent 中移除
    for (const [agentId, skillSet] of this.agentSkills) {
      skillSet.delete(skillId);
    }

    // 清理技能
    if (registration.skill.cleanup) {
      try {
        await registration.skill.cleanup();
      } catch (error) {
        console.error(`[Skill Manager] Cleanup failed for skill ${skillId}:`, error);
      }
    }

    // 移除注册
    this.skills.delete(skillId);
    console.log(`[Skill Manager] Unloaded skill ${skillId}`);
  }

  /**
   * 搜索技能
   */
  searchSkills(query: string, type?: SkillType): SkillMetadata[] {
    const results: SkillMetadata[] = [];
    const lowerQuery = query.toLowerCase();

    for (const registration of this.skills.values()) {
      const metadata = registration.skill.metadata;

      // 类型过滤
      if (type && metadata.type !== type) {
        continue;
      }

      // 搜索匹配
      const matchesName = metadata.name.toLowerCase().includes(lowerQuery);
      const matchesDescription = metadata.description.toLowerCase().includes(lowerQuery);
      const matchesTags = metadata.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));

      if (matchesName || matchesDescription || matchesTags) {
        results.push(metadata);
      }
    }

    return results;
  }

  /**
   * 清理未使用的技能
   */
  async cleanupUnusedSkills(unusedThresholdMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const skillsToUnload: string[] = [];

    for (const [skillId, registration] of this.skills) {
      if (
        registration.status === "loaded" &&
        registration.lastUsedAt &&
        now - registration.lastUsedAt > unusedThresholdMs
      ) {
        skillsToUnload.push(skillId);
      }
    }

    for (const skillId of skillsToUnload) {
      await this.unloadSkill(skillId);
    }

    if (skillsToUnload.length > 0) {
      console.log(`[Skill Manager] Cleaned up ${skillsToUnload.length} unused skills`);
    }
  }
}

/**
 * 全局技能管理器实例
 */
export const skillManager = new SkillManager();
