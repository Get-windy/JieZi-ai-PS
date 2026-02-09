/**
 * 权限系统集成
 * 将权限检查集成到工具执行流程中
 */

import type { AgentPermissionsConfig } from "../config/types.permissions.js";
import type { PermissionCheckContext, PermissionCheckResult } from "../permissions/checker.js";
import { ApprovalWorkflow } from "../permissions/approval.js";
import { PermissionChecker } from "../permissions/checker.js";
import { PermissionHierarchy } from "../permissions/hierarchy.js";

/**
 * 权限集成器
 * 负责在工具执行流程中集成权限检查
 */
export class PermissionIntegrator {
  private checker: PermissionChecker | null = null;
  private hierarchy: PermissionHierarchy | null = null;
  private approval: ApprovalWorkflow | null = null;

  /**
   * 初始化权限系统
   * @param config 权限配置
   */
  initialize(config: AgentPermissionsConfig): void {
    this.checker = new PermissionChecker(config);
    this.hierarchy = new PermissionHierarchy(config);
    this.approval = new ApprovalWorkflow(config);

    console.log("[Permission System] Initialized with config:", {
      rulesCount: config.rules?.length || 0,
      rolesCount: config.roles?.length || 0,
      groupsCount: config.groups?.length || 0,
      delegationsCount: config.delegations?.length || 0,
      approvalEnabled: !!config.approvalConfig,
      auditEnabled: config.enableAuditLog,
    });
  }

  /**
   * 检查工具执行权限
   * @param context 权限检查上下文
   * @returns 权限检查结果
   */
  async checkToolPermission(context: PermissionCheckContext): Promise<PermissionCheckResult> {
    if (!this.checker) {
      console.warn("[Permission System] Not initialized, allowing by default");
      return { allowed: true, action: "allow", requiresApproval: false };
    }

    try {
      const result = await this.checker.check(context);

      // 记录权限检查
      this.logPermissionCheck(context, result);

      return result;
    } catch (error) {
      console.error("[Permission System] Check error:", error);

      // 权限检查失败时的降级策略：拒绝访问
      return {
        allowed: false,
        action: "deny",
        reason: `Permission check failed: ${error instanceof Error ? error.message : String(error)}`,
        requiresApproval: false,
      };
    }
  }

  /**
   * 创建审批请求
   * @param context 权限检查上下文
   * @param approvalId 可选的审批ID
   * @returns 审批请求
   */
  async createApprovalRequest(context: PermissionCheckContext, approvalId?: string): Promise<any> {
    if (!this.approval) {
      throw new Error("Approval workflow not initialized");
    }

    const request = await this.approval.createRequest(context, approvalId);

    console.log("[Permission System] Approval request created:", {
      id: request.id,
      requester: request.requester,
      toolName: request.toolName,
      approversCount: request.approvers.length,
      requiredApprovals: request.requiredApprovals,
    });

    return request;
  }

  /**
   * 获取用户的有效权限
   * @param subject 权限主体
   * @returns 有效权限信息
   */
  getEffectivePermissions(subject: any): any {
    if (!this.hierarchy) {
      console.warn("[Permission System] Hierarchy not initialized");
      return null;
    }

    return this.hierarchy.getEffectivePermissions(subject);
  }

  /**
   * 检测权限冲突
   * @param subject 权限主体
   * @returns 冲突列表
   */
  detectConflicts(subject: any): any[] {
    if (!this.hierarchy) {
      return [];
    }

    return this.hierarchy.detectConflicts(subject);
  }

  /**
   * 检测循环继承
   * @returns 有循环继承的角色ID列表
   */
  detectCircularInheritance(): string[] {
    if (!this.hierarchy) {
      return [];
    }

    return this.hierarchy.detectCircularInheritance();
  }

  /**
   * 获取审批请求
   * @param requestId 请求ID
   * @returns 审批请求
   */
  async getApprovalRequest(requestId: string): Promise<any> {
    if (!this.approval) {
      return null;
    }

    return this.approval.getRequest(requestId);
  }

  /**
   * 批准审批请求
   * @param requestId 请求ID
   * @param approver 审批者
   * @param comment 审批意见
   * @returns 审批结果
   */
  async approveRequest(requestId: string, approver: any, comment?: string): Promise<any> {
    if (!this.approval) {
      throw new Error("Approval workflow not initialized");
    }

    return await this.approval.approve(requestId, approver, comment);
  }

  /**
   * 拒绝审批请求
   * @param requestId 请求ID
   * @param approver 审批者
   * @param comment 拒绝理由
   * @returns 审批结果
   */
  async rejectRequest(requestId: string, approver: any, comment?: string): Promise<any> {
    if (!this.approval) {
      throw new Error("Approval workflow not initialized");
    }

    return await this.approval.reject(requestId, approver, comment);
  }

  /**
   * 记录权限检查日志
   * @param context 检查上下文
   * @param result 检查结果
   */
  private logPermissionCheck(context: PermissionCheckContext, result: PermissionCheckResult): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      subject: context.subject,
      toolName: context.toolName,
      toolParams: context.toolParams ? Object.keys(context.toolParams) : [],
      allowed: result.allowed,
      action: result.action,
      reason: result.reason,
      requiresApproval: result.requiresApproval,
    };

    console.log("[Permission Check]", JSON.stringify(logEntry));
  }
}

/**
 * 全局权限集成器实例
 */
export const permissionIntegrator = new PermissionIntegrator();

/**
 * 工具执行权限检查中间件
 * 可以集成到工具执行管道中
 */
export function createPermissionMiddleware() {
  return async (context: any, next: () => Promise<void>) => {
    const { agentId, toolName, toolParams, sessionKey } = context;

    // 构建权限检查上下文
    const permissionContext: PermissionCheckContext = {
      subject: {
        type: "user",
        id: agentId,
        name: agentId,
      },
      toolName,
      toolParams,
      sessionId: sessionKey,
      timestamp: Date.now(),
      ipAddress: context.ipAddress,
      metadata: {
        userAgent: context.userAgent,
      },
    };

    // 执行权限检查
    const result = await permissionIntegrator.checkToolPermission(permissionContext);

    // 保存权限结果到上下文
    context.permissionResult = result;

    if (!result.allowed) {
      // 权限被拒绝
      if (result.requiresApproval) {
        // 需要审批
        const approvalRequest = await permissionIntegrator.createApprovalRequest(
          permissionContext,
          result.approvalId,
        );

        context.error = {
          code: "PERMISSION_REQUIRES_APPROVAL",
          message: `Tool execution requires approval. Request ID: ${approvalRequest.id}`,
          approvalRequest,
        };
      } else {
        // 直接拒绝
        context.error = {
          code: "PERMISSION_DENIED",
          message: result.reason || "Permission denied",
        };
      }

      // 阻止工具执行
      return;
    }

    // 权限允许，继续执行
    await next();
  };
}

/**
 * 便捷函数：检查工具权限
 * @param agentId 智能助手ID
 * @param toolName 工具名称
 * @param parameters 工具参数
 * @param context 额外上下文
 * @returns 权限检查结果
 */
export async function checkToolPermission(
  agentId: string,
  toolName: string,
  parameters?: Record<string, any>,
  context?: any,
): Promise<PermissionCheckResult> {
  const permissionContext: PermissionCheckContext = {
    subject: {
      type: "user",
      id: agentId,
      name: agentId,
    },
    toolName,
    toolParams: parameters,
    timestamp: Date.now(),
    metadata: context,
  };

  return await permissionIntegrator.checkToolPermission(permissionContext);
}

/**
 * 工具装饰器：自动添加权限检查
 * 可以用于装饰工具函数
 */
export function requirePermission(toolName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // 假设第一个参数包含上下文信息
      const context = args[0];
      const { agentId, parameters } = context;

      // 执行权限检查
      const result = await checkToolPermission(agentId, toolName, parameters);

      if (!result.allowed) {
        if (result.requiresApproval) {
          throw new Error(
            `Tool execution requires approval. Reason: ${result.reason || "Approval required"}`,
          );
        } else {
          throw new Error(`Permission denied. Reason: ${result.reason || "Access denied"}`);
        }
      }

      // 权限通过，执行原方法
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 初始化权限系统
 * 在应用启动时调用
 * @param config 权限配置
 */
export function initializePermissionSystem(config: AgentPermissionsConfig): void {
  permissionIntegrator.initialize(config);

  // 检测配置问题
  const circularRoles = permissionIntegrator.detectCircularInheritance();
  if (circularRoles.length > 0) {
    console.warn("[Permission System] Circular role inheritance detected:", circularRoles);
  }

  console.log("[Permission System] Initialization complete");
}
