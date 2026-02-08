/**
 * 权限检查引擎
 *
 * 核心功能：
 * - 检查用户是否有权限执行特定工具
 * - 应用权限规则和条件约束
 * - 支持权限继承和委托
 * - 记录审计日志
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AgentPermissionsConfig,
  ToolPermissionRule,
  PermissionSubject,
  PermissionAction,
  PermissionAuditLog,
} from "../config/types.permissions.js";

/**
 * 权限检查上下文
 */
export type PermissionCheckContext = {
  /** 用户主体 */
  subject: PermissionSubject;

  /** 工具名称 */
  toolName: string;

  /** 工具参数（可选） */
  toolParams?: Record<string, any>;

  /** 会话ID */
  sessionId?: string;

  /** 智能助手ID */
  agentId?: string;

  /** 时间戳 */
  timestamp?: number;

  /** IP 地址（可选） */
  ipAddress?: string;

  /** 额外的上下文信息 */
  metadata?: Record<string, any>;
};

/**
 * 权限检查结果
 */
export type PermissionCheckResult = {
  /** 是否允许 */
  allowed: boolean;

  /** 权限动作 */
  action: PermissionAction;

  /** 应用的规则ID */
  ruleId?: string;

  /** 拒绝原因（当不允许时） */
  reason?: string;

  /** 是否需要审批 */
  requiresApproval: boolean;

  /** 审批ID（如果需要审批） */
  approvalId?: string;

  /** 额外的元数据 */
  metadata?: Record<string, any>;
};

/**
 * 权限检查引擎
 */
export class PermissionChecker {
  private config: AgentPermissionsConfig;
  private cache = new Map<string, { result: PermissionCheckResult; expiresAt: number }>();

  constructor(config: AgentPermissionsConfig) {
    this.config = config;
  }

  /**
   * 检查权限
   *
   * @param context - 权限检查上下文
   * @returns 权限检查结果
   */
  async check(context: PermissionCheckContext): Promise<PermissionCheckResult> {
    const { subject, toolName, toolParams, timestamp = Date.now() } = context;

    // 检查缓存
    if (this.config.enableCache) {
      const cached = this.getCachedResult(subject, toolName);
      if (cached) {
        return cached;
      }
    }

    // 查找匹配的规则
    const matchedRule = this.findMatchingRule(subject, toolName, context);

    let result: PermissionCheckResult;

    if (matchedRule) {
      // 检查条件约束
      const conditionsMet = await this.checkConditions(matchedRule, context);

      if (!conditionsMet) {
        result = {
          allowed: false,
          action: "deny",
          ruleId: matchedRule.id,
          reason: "Conditions not met",
          requiresApproval: false,
        };
      } else {
        // 应用规则动作
        switch (matchedRule.action) {
          case "allow":
            result = {
              allowed: true,
              action: "allow",
              ruleId: matchedRule.id,
              requiresApproval: false,
            };
            break;

          case "deny":
            result = {
              allowed: false,
              action: "deny",
              ruleId: matchedRule.id,
              reason: `Tool '${toolName}' is denied by permission rule`,
              requiresApproval: false,
            };
            break;

          case "require_approval":
            result = {
              allowed: false,
              action: "require_approval",
              ruleId: matchedRule.id,
              reason: `Tool '${toolName}' requires approval`,
              requiresApproval: true,
              approvalId: this.generateApprovalId(context),
            };
            break;

          default:
            result = this.getDefaultResult(toolName);
        }
      }
    } else {
      // 没有匹配的规则，使用默认动作
      result = this.getDefaultResult(toolName);
    }

    // 缓存结果
    if (this.config.enableCache && result.allowed) {
      this.cacheResult(subject, toolName, result);
    }

    // 记录审计日志
    if (this.config.enableAuditLog) {
      await this.logAudit(context, result);
    }

    return result;
  }

  /**
   * 查找匹配的规则
   */
  private findMatchingRule(
    subject: PermissionSubject,
    toolName: string,
    context: PermissionCheckContext,
  ): ToolPermissionRule | null {
    const { rules } = this.config;

    // 过滤出匹配的规则
    const matchedRules = rules.filter((rule) => {
      // 检查规则是否启用
      if (rule.enabled === false) return false;

      // 检查工具名称是否匹配（支持通配符）
      if (!this.matchToolName(rule.toolName, toolName)) return false;

      // 检查主体是否匹配
      if (!this.matchSubject(rule.subjects, subject, context)) return false;

      return true;
    });

    if (matchedRules.length === 0) return null;

    // 按优先级排序，选择优先级最高的规则
    matchedRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return matchedRules[0];
  }

  /**
   * 匹配工具名称（支持通配符）
   */
  private matchToolName(pattern: string, toolName: string): boolean {
    // 转换通配符为正则表达式
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(toolName);
  }

  /**
   * 匹配主体（用户/组/角色）
   */
  private matchSubject(
    ruleSubjects: PermissionSubject[],
    currentSubject: PermissionSubject,
    context: PermissionCheckContext,
  ): boolean {
    // 检查是否直接匹配
    const directMatch = ruleSubjects.some(
      (s) => s.type === currentSubject.type && s.id === currentSubject.id,
    );
    if (directMatch) return true;

    // 检查用户是否属于指定的组
    if (currentSubject.type === "user") {
      const groupMatch = ruleSubjects.some((s) => {
        if (s.type !== "group") return false;
        return this.isUserInGroup(currentSubject.id, s.id);
      });
      if (groupMatch) return true;

      // 检查用户是否拥有指定的角色
      const roleMatch = ruleSubjects.some((s) => {
        if (s.type !== "role") return false;
        return this.hasUserRole(currentSubject.id, s.id);
      });
      if (roleMatch) return true;
    }

    // 检查权限委托
    const delegationMatch = this.checkDelegation(currentSubject, context.toolName!);
    if (delegationMatch) return true;

    return false;
  }

  /**
   * 检查用户是否在组中
   */
  private isUserInGroup(userId: string, groupId: string): boolean {
    const group = this.config.groups?.find((g) => g.id === groupId);
    return group?.members.includes(userId) || false;
  }

  /**
   * 检查用户是否拥有角色
   */
  private hasUserRole(userId: string, roleId: string): boolean {
    const role = this.config.roles?.find((r) => r.id === roleId);
    if (!role) return false;

    return role.members.some((m) => m.type === "user" && m.id === userId);
  }

  /**
   * 检查权限委托
   */
  private checkDelegation(subject: PermissionSubject, toolName: string): boolean {
    if (!this.config.delegations) return false;

    const now = Date.now();

    return this.config.delegations.some((d) => {
      // 检查委托是否启用
      if (d.enabled === false) return false;

      // 检查委托是否过期
      if (d.expiresAt && d.expiresAt < now) return false;

      // 检查受托人是否匹配
      if (d.delegate.type !== subject.type || d.delegate.id !== subject.id) {
        return false;
      }

      // 检查工具是否在委托范围内
      return d.tools.some((tool) => this.matchToolName(tool, toolName));
    });
  }

  /**
   * 检查条件约束
   */
  private async checkConditions(
    rule: ToolPermissionRule,
    context: PermissionCheckContext,
  ): Promise<boolean> {
    const { conditions } = rule;
    if (!conditions) return true;

    // 检查时间范围
    if (conditions.timeRange) {
      const now = context.timestamp || Date.now();
      const start = new Date(conditions.timeRange.start).getTime();
      const end = new Date(conditions.timeRange.end).getTime();

      if (now < start || now > end) return false;
    }

    // 检查 IP 白名单
    if (conditions.ipWhitelist && context.ipAddress) {
      if (!conditions.ipWhitelist.includes(context.ipAddress)) return false;
    }

    // 检查参数约束
    if (conditions.parameterConstraints && context.toolParams) {
      for (const [key, expectedValue] of Object.entries(conditions.parameterConstraints)) {
        const actualValue = context.toolParams[key];
        if (actualValue !== expectedValue) return false;
      }
    }

    // 检查自定义条件
    if (conditions.customCondition) {
      try {
        // 创建安全的执行环境
        const conditionFunc = new Function("context", `return ${conditions.customCondition}`);
        const result = conditionFunc(context);
        if (!result) return false;
      } catch (error) {
        console.error("Custom condition evaluation failed:", error);
        return false;
      }
    }

    return true;
  }

  /**
   * 获取默认结果
   */
  private getDefaultResult(toolName: string): PermissionCheckResult {
    const defaultAction = this.config.defaultAction || "deny";

    switch (defaultAction) {
      case "allow":
        return {
          allowed: true,
          action: "allow",
          requiresApproval: false,
        };

      case "deny":
        return {
          allowed: false,
          action: "deny",
          reason: `No permission rule found for tool '${toolName}'`,
          requiresApproval: false,
        };

      case "require_approval":
        return {
          allowed: false,
          action: "require_approval",
          reason: `Tool '${toolName}' requires approval (default policy)`,
          requiresApproval: true,
        };

      default:
        return {
          allowed: false,
          action: "deny",
          reason: "Unknown default action",
          requiresApproval: false,
        };
    }
  }

  /**
   * 生成审批ID
   */
  private generateApprovalId(context: PermissionCheckContext): string {
    const timestamp = context.timestamp || Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `approval_${timestamp}_${random}`;
  }

  /**
   * 缓存结果
   */
  private cacheResult(
    subject: PermissionSubject,
    toolName: string,
    result: PermissionCheckResult,
  ): void {
    const cacheKey = `${subject.type}:${subject.id}:${toolName}`;
    const ttl = this.config.cacheTtl || 300; // 默认5分钟
    const expiresAt = Date.now() + ttl * 1000;

    this.cache.set(cacheKey, { result, expiresAt });
  }

  /**
   * 获取缓存的结果
   */
  private getCachedResult(
    subject: PermissionSubject,
    toolName: string,
  ): PermissionCheckResult | null {
    const cacheKey = `${subject.type}:${subject.id}:${toolName}`;
    const cached = this.cache.get(cacheKey);

    if (!cached) return null;

    // 检查是否过期
    if (cached.expiresAt < Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 记录审计日志
   */
  private async logAudit(
    context: PermissionCheckContext,
    result: PermissionCheckResult,
  ): Promise<void> {
    if (!this.config.auditLogPath) return;

    const log: PermissionAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      timestamp: context.timestamp || Date.now(),
      user: context.subject,
      toolName: context.toolName,
      toolParams: context.toolParams,
      result: result.allowed ? "allowed" : result.requiresApproval ? "requires_approval" : "denied",
      appliedRuleId: result.ruleId,
      denialReason: result.reason,
      approvalId: result.approvalId,
      sessionId: context.sessionId,
      agentId: context.agentId,
    };

    try {
      const logDir = dirname(this.config.auditLogPath);
      if (!existsSync(logDir)) {
        await mkdir(logDir, { recursive: true });
      }

      const logEntry = JSON.stringify(log) + "\n";
      await appendFile(this.config.auditLogPath, logEntry, "utf-8");
    } catch (error) {
      console.error("Failed to write audit log:", error);
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: AgentPermissionsConfig): void {
    this.config = config;
    this.clearCache();
  }
}
