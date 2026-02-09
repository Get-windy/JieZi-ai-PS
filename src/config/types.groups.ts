/**
 * Phase 5: 工作空间与文档系统 - 群组工作空间配置类型
 *
 * 扩展配置系统以支持群组工作空间配置
 */

import { GroupWorkspaceConfig } from "../workspace/types";

/**
 * 群组配置（扩展配置系统）
 */
export interface GroupsConfig {
  /**
   * 群组工作空间配置
   */
  workspace?: GroupWorkspaceConfig;

  /**
   * 默认群组设置
   */
  defaults?: {
    /**
     * 默认成员权限
     */
    memberPermissions?: {
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    };

    /**
     * 是否自动启用知识沉淀
     */
    enableKnowledgeSedimentation?: boolean;

    /**
     * 是否自动归档
     */
    enableAutoArchival?: boolean;

    /**
     * 归档间隔（天）
     */
    archivalIntervalDays?: number;
  };

  /**
   * 群组列表（预定义群组）
   */
  groups?: GroupDefinition[];
}

/**
 * 群组定义
 */
export interface GroupDefinition {
  /**
   * 群组ID
   */
  id: string;

  /**
   * 群组名称
   */
  name: string;

  /**
   * 群组描述
   */
  description?: string;

  /**
   * 管理员列表
   */
  admins?: string[];

  /**
   * 成员列表
   */
  members?: string[];

  /**
   * 群组特定配置
   */
  config?: {
    /**
     * 知识沉淀配置
     */
    knowledgeSedimentation?: {
      enabled: boolean;
      triggers?: {
        keywords?: string[];
        minMessages?: number;
        minParticipants?: number;
      };
    };

    /**
     * 权限配置
     */
    permissions?: {
      memberCanRead: boolean;
      memberCanWrite: boolean;
      memberCanDelete: boolean;
      memberCanInvite: boolean;
    };

    /**
     * Bootstrap 文件配置
     */
    bootstrap?: {
      /**
       * 是否加载成员的专业知识文件
       */
      loadMemberKnowledge: boolean;

      /**
       * 自定义 Bootstrap 文件路径
       */
      customFiles?: string[];
    };
  };
}

/**
 * 扩展主配置接口
 *
 * 使用方式：在主配置文件（OpenClawConfig）中添加 groups 字段
 *
 * 示例:
 * ```typescript
 * interface OpenClawConfig {
 *   // ... 其他配置
 *   groups?: GroupsConfig;
 * }
 * ```
 */
export interface OpenClawConfigExtension {
  /**
   * 群组配置
   */
  groups?: GroupsConfig;
}

/**
 * 配置验证函数
 */
export function validateGroupsConfig(config: GroupsConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 验证工作空间配置
  if (config.workspace) {
    if (config.workspace.root && typeof config.workspace.root !== "string") {
      errors.push("groups.workspace.root 必须是字符串");
    }

    if (config.workspace.enabled !== undefined && typeof config.workspace.enabled !== "boolean") {
      errors.push("groups.workspace.enabled 必须是布尔值");
    }

    if (config.workspace.archival) {
      if (typeof config.workspace.archival.enabled !== "boolean") {
        errors.push("groups.workspace.archival.enabled 必须是布尔值");
      }

      if (typeof config.workspace.archival.intervalDays !== "number") {
        errors.push("groups.workspace.archival.intervalDays 必须是数字");
      }
    }
  }

  // 验证默认设置
  if (config.defaults) {
    if (config.defaults.memberPermissions) {
      const perms = config.defaults.memberPermissions;
      if (
        typeof perms.canRead !== "boolean" ||
        typeof perms.canWrite !== "boolean" ||
        typeof perms.canDelete !== "boolean"
      ) {
        errors.push("groups.defaults.memberPermissions 的所有字段必须是布尔值");
      }
    }
  }

  // 验证群组列表
  if (config.groups) {
    if (!Array.isArray(config.groups)) {
      errors.push("groups.groups 必须是数组");
    } else {
      config.groups.forEach((group, index) => {
        if (!group.id) {
          errors.push(`groups.groups[${index}].id 是必需的`);
        }

        if (!group.name) {
          errors.push(`groups.groups[${index}].name 是必需的`);
        }

        if (group.admins && !Array.isArray(group.admins)) {
          errors.push(`groups.groups[${index}].admins 必须是数组`);
        }

        if (group.members && !Array.isArray(group.members)) {
          errors.push(`groups.groups[${index}].members 必须是数组`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 默认群组配置
 */
export const defaultGroupsConfig: GroupsConfig = {
  workspace: {
    enabled: true,
    archival: {
      enabled: false,
      intervalDays: 90,
    },
    permissions: {
      defaultMemberPermissions: {
        canRead: true,
        canWrite: true,
        canDelete: false,
      },
    },
    knowledgeSedimentation: {
      enabled: true,
      triggers: {
        keywords: [
          "决定",
          "决策",
          "方案",
          "架构",
          "设计",
          "计划",
          "规范",
          "decision",
          "architecture",
          "design",
          "plan",
          "spec",
        ],
        minMessages: 10,
        minParticipants: 2,
      },
      autoClassification: {
        decisionKeywords: ["决定", "决策", "方案", "decision"],
        meetingKeywords: ["会议", "讨论", "总结", "meeting", "discussion"],
        adrKeywords: ["架构", "设计", "技术选型", "architecture", "design", "technical"],
      },
    },
  },
  defaults: {
    memberPermissions: {
      canRead: true,
      canWrite: true,
      canDelete: false,
    },
    enableKnowledgeSedimentation: true,
    enableAutoArchival: false,
    archivalIntervalDays: 90,
  },
  groups: [],
};

/**
 * 合并群组配置
 */
export function mergeGroupsConfig(
  userConfig: Partial<GroupsConfig> | undefined,
  defaultConfig: GroupsConfig = defaultGroupsConfig,
): GroupsConfig {
  if (!userConfig) {
    return { ...defaultConfig };
  }

  return {
    workspace: userConfig.workspace
      ? { ...defaultConfig.workspace, ...userConfig.workspace }
      : defaultConfig.workspace,
    defaults: userConfig.defaults
      ? { ...defaultConfig.defaults, ...userConfig.defaults }
      : defaultConfig.defaults,
    groups: userConfig.groups || defaultConfig.groups,
  };
}

/**
 * 获取群组配置
 */
export function getGroupConfig(
  groupsConfig: GroupsConfig,
  groupId: string,
): GroupDefinition | undefined {
  return groupsConfig.groups?.find((g) => g.id === groupId);
}

/**
 * 创建群组配置
 */
export function createGroupConfig(
  groupId: string,
  groupName: string,
  options?: {
    description?: string;
    admins?: string[];
    members?: string[];
    enableKnowledgeSedimentation?: boolean;
    memberPermissions?: {
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    };
  },
): GroupDefinition {
  return {
    id: groupId,
    name: groupName,
    description: options?.description,
    admins: options?.admins || [],
    members: options?.members || [],
    config: {
      knowledgeSedimentation: {
        enabled: options?.enableKnowledgeSedimentation ?? true,
      },
      permissions: {
        memberCanRead: options?.memberPermissions?.canRead ?? true,
        memberCanWrite: options?.memberPermissions?.canWrite ?? true,
        memberCanDelete: options?.memberPermissions?.canDelete ?? false,
        memberCanInvite: false,
      },
      bootstrap: {
        loadMemberKnowledge: true,
      },
    },
  };
}
