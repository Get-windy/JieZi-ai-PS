/**
 * 权限层级管理
 *
 * 功能：
 * - 管理角色继承关系
 * - 解析用户的有效权限（考虑角色继承）
 * - 检测权限冲突
 */

import type {
  AgentPermissionsConfig,
  RoleDefinition,
  PermissionSubject,
  ToolPermissionRule,
} from "../config/types.permissions.js";

/**
 * 有效权限
 */
export type EffectivePermissions = {
  /** 用户主体 */
  subject: PermissionSubject;

  /** 直接拥有的角色 */
  directRoles: string[];

  /** 通过继承获得的角色 */
  inheritedRoles: string[];

  /** 所属的组 */
  groups: string[];

  /** 有效的权限规则ID列表 */
  effectiveRules: string[];

  /** 权限规则详情 */
  rules: ToolPermissionRule[];
};

/**
 * 权限冲突
 */
export type PermissionConflict = {
  /** 工具名称 */
  toolName: string;

  /** 冲突的规则 */
  conflictingRules: Array<{
    ruleId: string;
    action: string;
    source: string; // 来源（direct/role/group）
  }>;

  /** 冲突描述 */
  description: string;
};

/**
 * 权限层级管理器
 */
export class PermissionHierarchy {
  private config: AgentPermissionsConfig;

  // 角色继承缓存
  private roleInheritanceCache = new Map<string, Set<string>>();

  constructor(config: AgentPermissionsConfig) {
    this.config = config;
    this.buildRoleInheritanceCache();
  }

  /**
   * 构建角色继承缓存
   */
  private buildRoleInheritanceCache(): void {
    if (!this.config.roles) return;

    for (const role of this.config.roles) {
      const inherited = this.resolveRoleInheritance(role.id, new Set());
      this.roleInheritanceCache.set(role.id, inherited);
    }
  }

  /**
   * 递归解析角色继承
   */
  private resolveRoleInheritance(roleId: string, visited: Set<string>): Set<string> {
    // 防止循环继承
    if (visited.has(roleId)) {
      console.warn(`Circular role inheritance detected for role: ${roleId}`);
      return new Set();
    }

    visited.add(roleId);

    const role = this.config.roles?.find((r) => r.id === roleId);
    if (!role) return new Set();

    const inherited = new Set<string>();

    // 添加自身
    inherited.add(roleId);

    // 递归添加继承的角色
    if (role.inheritsFrom) {
      for (const parentRoleId of role.inheritsFrom) {
        const parentInherited = this.resolveRoleInheritance(parentRoleId, new Set(visited));
        for (const id of parentInherited) {
          inherited.add(id);
        }
      }
    }

    return inherited;
  }

  /**
   * 获取用户的有效权限
   *
   * @param subject - 用户主体
   * @returns 有效权限
   */
  getEffectivePermissions(subject: PermissionSubject): EffectivePermissions {
    const directRoles: string[] = [];
    const inheritedRoles: string[] = [];
    const groups: string[] = [];
    const effectiveRuleIds = new Set<string>();

    // 1. 收集直接角色
    if (this.config.roles) {
      for (const role of this.config.roles) {
        const isMember = role.members.some((m) => m.type === subject.type && m.id === subject.id);
        if (isMember) {
          directRoles.push(role.id);
        }
      }
    }

    // 2. 收集继承角色
    const allRoles = new Set<string>();
    for (const roleId of directRoles) {
      const inherited = this.roleInheritanceCache.get(roleId);
      if (inherited) {
        for (const id of inherited) {
          allRoles.add(id);
        }
      }
    }

    // 区分直接角色和继承角色
    for (const roleId of allRoles) {
      if (!directRoles.includes(roleId)) {
        inheritedRoles.push(roleId);
      }
    }

    // 3. 收集组（仅对用户类型）
    if (subject.type === "user" && this.config.groups) {
      for (const group of this.config.groups) {
        if (group.members.includes(subject.id)) {
          groups.push(group.id);
        }
      }
    }

    // 4. 收集有效的权限规则
    for (const rule of this.config.rules) {
      if (rule.enabled === false) continue;

      // 检查规则是否适用于当前主体
      const applies = rule.subjects.some((s) => {
        // 直接匹配
        if (s.type === subject.type && s.id === subject.id) {
          return true;
        }

        // 角色匹配
        if (s.type === "role" && allRoles.has(s.id)) {
          return true;
        }

        // 组匹配
        if (s.type === "group" && groups.includes(s.id)) {
          return true;
        }

        return false;
      });

      if (applies) {
        effectiveRuleIds.add(rule.id);
      }
    }

    // 5. 获取规则详情
    const rules = this.config.rules.filter((r) => effectiveRuleIds.has(r.id));

    return {
      subject,
      directRoles,
      inheritedRoles,
      groups,
      effectiveRules: Array.from(effectiveRuleIds),
      rules,
    };
  }

  /**
   * 检测权限冲突
   *
   * @param subject - 用户主体
   * @returns 冲突列表
   */
  detectConflicts(subject: PermissionSubject): PermissionConflict[] {
    const effectivePerms = this.getEffectivePermissions(subject);
    const conflicts: PermissionConflict[] = [];

    // 按工具名称分组规则
    const rulesByTool = new Map<string, ToolPermissionRule[]>();

    for (const rule of effectivePerms.rules) {
      if (!rulesByTool.has(rule.toolName)) {
        rulesByTool.set(rule.toolName, []);
      }
      rulesByTool.get(rule.toolName)!.push(rule);
    }

    // 检测每个工具的冲突
    for (const [toolName, rules] of rulesByTool.entries()) {
      if (rules.length <= 1) continue;

      // 检查是否有冲突的动作
      const actions = new Set(rules.map((r) => r.action));

      if (actions.size > 1) {
        // 存在不同的动作，可能有冲突
        const conflictingRules = rules.map((r) => ({
          ruleId: r.id,
          action: r.action,
          source: this.getRuleSource(r, effectivePerms),
        }));

        conflicts.push({
          toolName,
          conflictingRules,
          description: `Tool '${toolName}' has conflicting permission rules with actions: ${Array.from(actions).join(", ")}`,
        });
      }
    }

    return conflicts;
  }

  /**
   * 获取规则来源
   */
  private getRuleSource(rule: ToolPermissionRule, effectivePerms: EffectivePermissions): string {
    // 检查是否来自直接主体
    const directMatch = rule.subjects.some(
      (s) => s.type === effectivePerms.subject.type && s.id === effectivePerms.subject.id,
    );
    if (directMatch) return "direct";

    // 检查是否来自角色
    const roleMatch = rule.subjects.some(
      (s) =>
        s.type === "role" &&
        (effectivePerms.directRoles.includes(s.id) || effectivePerms.inheritedRoles.includes(s.id)),
    );
    if (roleMatch) return "role";

    // 检查是否来自组
    const groupMatch = rule.subjects.some(
      (s) => s.type === "group" && effectivePerms.groups.includes(s.id),
    );
    if (groupMatch) return "group";

    return "unknown";
  }

  /**
   * 解析角色的所有权限规则
   *
   * @param roleId - 角色ID
   * @returns 权限规则列表
   */
  getRolePermissions(roleId: string): ToolPermissionRule[] {
    const role = this.config.roles?.find((r) => r.id === roleId);
    if (!role) return [];

    // 获取所有继承的角色
    const allRoles = this.roleInheritanceCache.get(roleId) || new Set([roleId]);

    // 收集所有相关角色的权限规则
    const ruleIds = new Set<string>();

    for (const id of allRoles) {
      const r = this.config.roles?.find((role) => role.id === id);
      if (r && r.permissions) {
        for (const ruleId of r.permissions) {
          ruleIds.add(ruleId);
        }
      }
    }

    // 返回规则详情
    return this.config.rules.filter((rule) => ruleIds.has(rule.id));
  }

  /**
   * 检查角色继承是否有循环
   *
   * @returns 循环继承的角色ID列表
   */
  detectCircularInheritance(): string[] {
    if (!this.config.roles) return [];

    const circular: string[] = [];

    for (const role of this.config.roles) {
      const visited = new Set<string>();
      if (this.hasCircularInheritance(role.id, visited)) {
        circular.push(role.id);
      }
    }

    return circular;
  }

  /**
   * 检查单个角色是否有循环继承
   */
  private hasCircularInheritance(roleId: string, visited: Set<string>): boolean {
    if (visited.has(roleId)) return true;

    visited.add(roleId);

    const role = this.config.roles?.find((r) => r.id === roleId);
    if (!role || !role.inheritsFrom) return false;

    for (const parentRoleId of role.inheritsFrom) {
      if (this.hasCircularInheritance(parentRoleId, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取角色层级结构
   *
   * @param roleId - 角色ID
   * @returns 层级结构（包含所有父角色和子角色）
   */
  getRoleHierarchy(roleId: string): {
    role: RoleDefinition;
    parents: RoleDefinition[];
    children: RoleDefinition[];
  } | null {
    const role = this.config.roles?.find((r) => r.id === roleId);
    if (!role) return null;

    // 获取父角色
    const parents: RoleDefinition[] = [];
    if (role.inheritsFrom) {
      for (const parentId of role.inheritsFrom) {
        const parent = this.config.roles?.find((r) => r.id === parentId);
        if (parent) parents.push(parent);
      }
    }

    // 获取子角色
    const children: RoleDefinition[] = [];
    if (this.config.roles) {
      for (const r of this.config.roles) {
        if (r.inheritsFrom && r.inheritsFrom.includes(roleId)) {
          children.push(r);
        }
      }
    }

    return { role, parents, children };
  }

  /**
   * 更新配置
   */
  updateConfig(config: AgentPermissionsConfig): void {
    this.config = config;
    this.roleInheritanceCache.clear();
    this.buildRoleInheritanceCache();
  }
}
