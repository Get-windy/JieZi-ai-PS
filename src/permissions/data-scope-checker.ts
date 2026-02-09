/**
 * 数据范围权限检查器
 *
 * 功能：
 * - 基于组织层级的数据范围控制
 * - 文件/数据库/API 访问范围限制
 * - 行级数据权限（Row-Level Security）
 * - 字段级权限控制
 */

import type { PermissionSubject } from "../config/types.permissions.js";

/**
 * 数据范围类型
 */
export type DataScopeType = "all" | "organization" | "department" | "team" | "self" | "custom";

/**
 * 数据范围规则
 */
export interface DataScopeRule {
  /** 规则ID */
  id: string;

  /** 规则名称 */
  name: string;

  /** 资源类型（文件、数据库表、API等） */
  resourceType: "file" | "database" | "api" | "tool";

  /** 资源标识符（文件路径模式、表名、API端点等） */
  resourcePattern: string;

  /** 数据范围 */
  scope: DataScopeType;

  /** 自定义范围条件（当 scope = "custom" 时） */
  customCondition?: {
    /** 字段名 */
    field: string;

    /** 操作符 */
    operator: "equals" | "in" | "contains" | "startsWith" | "regex";

    /** 值 */
    value: any;
  };

  /** 允许的操作 */
  allowedOperations: Array<"read" | "write" | "delete" | "execute">;

  /** 字段级权限（可见/可编辑的字段） */
  fieldPermissions?: {
    /** 可见字段 */
    visibleFields?: string[];

    /** 可编辑字段 */
    editableFields?: string[];

    /** 脱敏字段 */
    maskedFields?: string[];
  };

  /** 适用的主体 */
  subjects: Array<{
    type: "user" | "agent" | "role" | "group";
    id: string;
  }>;

  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 数据范围检查上下文
 */
export interface DataScopeCheckContext {
  /** 权限主体 */
  subject: PermissionSubject;

  /** 资源类型 */
  resourceType: "file" | "database" | "api" | "tool";

  /** 资源标识符 */
  resourceId: string;

  /** 操作类型 */
  operation: "read" | "write" | "delete" | "execute";

  /** 资源数据（用于行级权限检查） */
  resourceData?: Record<string, any>;

  /** 组织上下文 */
  organizationContext?: {
    userId: string;
    organizationId?: string;
    departmentId?: string;
    teamId?: string;
    managerId?: string;
  };
}

/**
 * 数据范围检查结果
 */
export interface DataScopeCheckResult {
  /** 是否允许访问 */
  allowed: boolean;

  /** 应用的规则ID */
  ruleId?: string;

  /** 数据范围 */
  scope?: DataScopeType;

  /** 拒绝原因 */
  reason?: string;

  /** 允许访问的字段 */
  allowedFields?: string[];

  /** 需要脱敏的字段 */
  maskedFields?: string[];

  /** 过滤条件（用于数据库查询） */
  filterCondition?: Record<string, any>;
}

/**
 * 数据范围权限检查器
 */
export class DataScopeChecker {
  private static instance: DataScopeChecker;
  private rules: DataScopeRule[] = [];

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): DataScopeChecker {
    if (!DataScopeChecker.instance) {
      DataScopeChecker.instance = new DataScopeChecker();
    }
    return DataScopeChecker.instance;
  }

  /**
   * 初始化规则
   */
  public initialize(rules: DataScopeRule[]): void {
    this.rules = rules;
    console.log(`[DataScopeChecker] Initialized with ${rules.length} rules`);
  }

  /**
   * 添加规则
   */
  public addRule(rule: DataScopeRule): void {
    this.rules.push(rule);
  }

  /**
   * 检查数据范围权限
   */
  public check(context: DataScopeCheckContext): DataScopeCheckResult {
    const { subject, resourceType, resourceId, operation, resourceData, organizationContext } =
      context;

    // 查找匹配的规则
    const matchedRule = this.findMatchingRule(context);

    if (!matchedRule) {
      // 没有匹配的规则，默认拒绝
      return {
        allowed: false,
        reason: "No matching data scope rule found",
      };
    }

    // 检查操作是否允许
    if (!matchedRule.allowedOperations.includes(operation)) {
      return {
        allowed: false,
        ruleId: matchedRule.id,
        reason: `Operation '${operation}' is not allowed by data scope rule`,
      };
    }

    // 检查数据范围
    const scopeCheck = this.checkDataScope(matchedRule.scope, resourceData, organizationContext);

    if (!scopeCheck.allowed) {
      return {
        allowed: false,
        ruleId: matchedRule.id,
        scope: matchedRule.scope,
        reason: scopeCheck.reason,
      };
    }

    // 检查自定义条件
    if (matchedRule.scope === "custom" && matchedRule.customCondition) {
      const customCheck = this.checkCustomCondition(matchedRule.customCondition, resourceData);
      if (!customCheck) {
        return {
          allowed: false,
          ruleId: matchedRule.id,
          scope: "custom",
          reason: "Custom condition not met",
        };
      }
    }

    // 应用字段级权限
    let allowedFields: string[] | undefined;
    let maskedFields: string[] | undefined;

    if (matchedRule.fieldPermissions) {
      if (operation === "read") {
        allowedFields = matchedRule.fieldPermissions.visibleFields;
        maskedFields = matchedRule.fieldPermissions.maskedFields;
      } else if (operation === "write") {
        allowedFields = matchedRule.fieldPermissions.editableFields;
      }
    }

    return {
      allowed: true,
      ruleId: matchedRule.id,
      scope: matchedRule.scope,
      allowedFields,
      maskedFields,
      filterCondition: scopeCheck.filterCondition,
    };
  }

  /**
   * 查找匹配的规则
   */
  private findMatchingRule(context: DataScopeCheckContext): DataScopeRule | undefined {
    return this.rules.find((rule) => {
      // 检查是否启用
      if (rule.enabled === false) return false;

      // 检查资源类型
      if (rule.resourceType !== context.resourceType) return false;

      // 检查资源模式匹配
      if (!this.matchResourcePattern(rule.resourcePattern, context.resourceId)) return false;

      // 检查主体匹配
      if (!this.matchSubject(rule.subjects, context.subject)) return false;

      return true;
    });
  }

  /**
   * 匹配资源模式
   */
  private matchResourcePattern(pattern: string, resourceId: string): boolean {
    // 支持通配符 *
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(resourceId);
  }

  /**
   * 匹配主体
   */
  private matchSubject(
    subjects: Array<{ type: string; id: string }>,
    subject: PermissionSubject,
  ): boolean {
    return subjects.some((s) => s.type === subject.type && s.id === subject.id);
  }

  /**
   * 检查数据范围
   */
  private checkDataScope(
    scope: DataScopeType,
    resourceData?: Record<string, any>,
    organizationContext?: DataScopeCheckContext["organizationContext"],
  ): { allowed: boolean; reason?: string; filterCondition?: Record<string, any> } {
    switch (scope) {
      case "all":
        return { allowed: true };

      case "self":
        // 只能访问自己的数据
        if (!resourceData || !organizationContext) {
          return { allowed: false, reason: "Missing resource data or organization context" };
        }

        const isSelfData =
          resourceData.userId === organizationContext.userId ||
          resourceData.ownerId === organizationContext.userId ||
          resourceData.createdBy === organizationContext.userId;

        if (!isSelfData) {
          return { allowed: false, reason: "Can only access own data" };
        }

        return {
          allowed: true,
          filterCondition: { userId: organizationContext.userId },
        };

      case "team":
        // 只能访问团队数据
        if (!organizationContext?.teamId) {
          return { allowed: false, reason: "No team context" };
        }

        return {
          allowed: true,
          filterCondition: { teamId: organizationContext.teamId },
        };

      case "department":
        // 只能访问部门数据
        if (!organizationContext?.departmentId) {
          return { allowed: false, reason: "No department context" };
        }

        return {
          allowed: true,
          filterCondition: { departmentId: organizationContext.departmentId },
        };

      case "organization":
        // 只能访问组织数据
        if (!organizationContext?.organizationId) {
          return { allowed: false, reason: "No organization context" };
        }

        return {
          allowed: true,
          filterCondition: { organizationId: organizationContext.organizationId },
        };

      case "custom":
        // 自定义范围由 checkCustomCondition 处理
        return { allowed: true };

      default:
        return { allowed: false, reason: `Unknown scope: ${scope}` };
    }
  }

  /**
   * 检查自定义条件
   */
  private checkCustomCondition(
    condition: NonNullable<DataScopeRule["customCondition"]>,
    resourceData?: Record<string, any>,
  ): boolean {
    if (!resourceData) return false;

    const fieldValue = resourceData[condition.field];

    switch (condition.operator) {
      case "equals":
        return fieldValue === condition.value;

      case "in":
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);

      case "contains":
        return String(fieldValue).includes(String(condition.value));

      case "startsWith":
        return String(fieldValue).startsWith(String(condition.value));

      case "regex":
        const regex = new RegExp(condition.value);
        return regex.test(String(fieldValue));

      default:
        return false;
    }
  }

  /**
   * 应用字段过滤
   */
  public applyFieldFilter<T extends Record<string, any>>(
    data: T,
    result: DataScopeCheckResult,
  ): Partial<T> {
    if (!result.allowed) {
      return {};
    }

    const filtered: Partial<T> = {};

    // 如果没有字段限制，返回所有字段
    if (!result.allowedFields && !result.maskedFields) {
      return data;
    }

    // 应用可见字段过滤
    if (result.allowedFields) {
      for (const field of result.allowedFields) {
        if (field in data) {
          filtered[field as keyof T] = data[field];
        }
      }
    } else {
      // 没有指定可见字段时，复制所有字段
      Object.assign(filtered, data);
    }

    // 应用脱敏
    if (result.maskedFields) {
      for (const field of result.maskedFields) {
        if (field in filtered) {
          filtered[field as keyof T] = this.maskValue(filtered[field as keyof T]) as T[keyof T];
        }
      }
    }

    return filtered;
  }

  /**
   * 脱敏值
   */
  private maskValue(value: any): any {
    if (typeof value === "string") {
      if (value.length <= 4) {
        return "****";
      }
      // 保留前后各2个字符
      return value.substring(0, 2) + "****" + value.substring(value.length - 2);
    }

    if (typeof value === "number") {
      return "****";
    }

    return value;
  }

  /**
   * 获取统计信息
   */
  public getStatistics(): {
    totalRules: number;
    enabledRules: number;
    rulesByScope: Record<DataScopeType, number>;
    rulesByResourceType: Record<string, number>;
  } {
    const enabledRules = this.rules.filter((r) => r.enabled !== false);

    const rulesByScope: Record<DataScopeType, number> = {
      all: 0,
      organization: 0,
      department: 0,
      team: 0,
      self: 0,
      custom: 0,
    };

    const rulesByResourceType: Record<string, number> = {};

    for (const rule of this.rules) {
      rulesByScope[rule.scope]++;

      rulesByResourceType[rule.resourceType] = (rulesByResourceType[rule.resourceType] || 0) + 1;
    }

    return {
      totalRules: this.rules.length,
      enabledRules: enabledRules.length,
      rulesByScope,
      rulesByResourceType,
    };
  }
}

/**
 * 全局实例
 */
export const dataScopeChecker = DataScopeChecker.getInstance();

/**
 * 便捷函数：检查文件访问范围
 */
export function checkFileDataScope(params: {
  subject: PermissionSubject;
  filePath: string;
  operation: "read" | "write" | "delete";
  organizationContext?: DataScopeCheckContext["organizationContext"];
}): DataScopeCheckResult {
  return dataScopeChecker.check({
    subject: params.subject,
    resourceType: "file",
    resourceId: params.filePath,
    operation: params.operation,
    organizationContext: params.organizationContext,
  });
}

/**
 * 便捷函数：检查数据库访问范围
 */
export function checkDatabaseDataScope(params: {
  subject: PermissionSubject;
  tableName: string;
  operation: "read" | "write" | "delete";
  rowData?: Record<string, any>;
  organizationContext?: DataScopeCheckContext["organizationContext"];
}): DataScopeCheckResult {
  return dataScopeChecker.check({
    subject: params.subject,
    resourceType: "database",
    resourceId: params.tableName,
    operation: params.operation,
    resourceData: params.rowData,
    organizationContext: params.organizationContext,
  });
}
