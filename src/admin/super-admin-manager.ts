/**
 * Phase 7: 超级管理员管理器
 *
 * 职责：
 * 1. 管理超级管理员账户
 * 2. 验证管理员权限
 * 3. 管理管理员会话
 * 4. 记录管理员操作
 */

import type { PermissionSubject } from "../config/types.permissions.js";
import type {
  SuperAdmin,
  SuperAdminRole,
  AdminOperation,
  AdminOperationType,
  AdminSession,
  AdminConfig,
} from "./types.js";

/**
 * 超级管理员管理器（单例）
 */
export class SuperAdminManager {
  private static instance: SuperAdminManager;
  private admins: Map<string, SuperAdmin> = new Map();
  private sessions: Map<string, AdminSession> = new Map();
  private operations: AdminOperation[] = [];
  private config: AdminConfig | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): SuperAdminManager {
    if (!SuperAdminManager.instance) {
      SuperAdminManager.instance = new SuperAdminManager();
    }
    return SuperAdminManager.instance;
  }

  /**
   * 设置配置
   */
  public setConfig(config: AdminConfig): void {
    this.config = config;

    // 初始化超级管理员
    for (const admin of config.superAdmins) {
      this.admins.set(admin.id, admin);
    }
  }

  /**
   * 获取配置
   */
  public getConfig(): AdminConfig | null {
    return this.config;
  }

  // ========== 管理员管理 ==========

  /**
   * 创建超级管理员
   */
  public createSuperAdmin(params: {
    id: string;
    userId: string;
    role: SuperAdminRole;
    name: string;
    email: string;
    phone?: string;
    permissions?: string[];
    scope?: SuperAdmin["scope"];
    ipWhitelist?: string[];
    createdBy: string;
  }): SuperAdmin {
    const { id, createdBy, permissions = [], ...rest } = params;

    if (this.admins.has(id)) {
      throw new Error(`Super admin already exists: ${id}`);
    }

    const admin: SuperAdmin = {
      id,
      ...rest,
      permissions: this.getDefaultPermissions(params.role).concat(permissions),
      isActive: true,
      isOnline: false,
      mfaEnabled: this.config?.requireMfa || false,
      createdAt: Date.now(),
      createdBy,
    };

    this.admins.set(id, admin);

    // 记录操作
    this.recordOperation({
      adminId: createdBy,
      operationType: "user_management",
      targetType: "user",
      targetId: id,
      action: "create_super_admin",
      parameters: { role: params.role },
      success: true,
    });

    return admin;
  }

  /**
   * 获取角色默认权限
   */
  private getDefaultPermissions(role: SuperAdminRole): string[] {
    const permissions: Record<SuperAdminRole, string[]> = {
      "system-admin": ["*"], // 所有权限
      "security-admin": ["permission.manage", "approval.manage", "audit.view", "emergency.access"],
      "compliance-admin": ["approval.manage", "audit.view", "audit.export"],
      "operations-admin": ["agent.manage", "system.config", "approval.view"],
      "audit-viewer": ["audit.view", "approval.view"],
    };

    return permissions[role] || [];
  }

  /**
   * 获取超级管理员
   */
  public getSuperAdmin(adminId: string): SuperAdmin | null {
    return this.admins.get(adminId) || null;
  }

  /**
   * 获取所有超级管理员
   */
  public getAllSuperAdmins(): SuperAdmin[] {
    return Array.from(this.admins.values());
  }

  /**
   * 更新超级管理员
   */
  public updateSuperAdmin(
    adminId: string,
    updates: Partial<Omit<SuperAdmin, "id" | "createdAt" | "createdBy">>,
    operatorId: string,
  ): SuperAdmin {
    const admin = this.admins.get(adminId);
    if (!admin) {
      throw new Error(`Super admin not found: ${adminId}`);
    }

    const updated: SuperAdmin = {
      ...admin,
      ...updates,
      updatedAt: Date.now(),
    };

    this.admins.set(adminId, updated);

    // 记录操作
    this.recordOperation({
      adminId: operatorId,
      operationType: "user_management",
      targetType: "user",
      targetId: adminId,
      action: "update_super_admin",
      parameters: updates,
      success: true,
    });

    return updated;
  }

  /**
   * 删除超级管理员
   */
  public deleteSuperAdmin(adminId: string, operatorId: string): boolean {
    const admin = this.admins.get(adminId);
    if (!admin) {
      return false;
    }

    // 终止所有会话
    this.terminateAllSessions(adminId, operatorId, "Admin deleted");

    this.admins.delete(adminId);

    // 记录操作
    this.recordOperation({
      adminId: operatorId,
      operationType: "user_management",
      targetType: "user",
      targetId: adminId,
      action: "delete_super_admin",
      success: true,
    });

    return true;
  }

  /**
   * 激活/停用管理员
   */
  public setAdminActive(adminId: string, isActive: boolean, operatorId: string): SuperAdmin {
    const admin = this.admins.get(adminId);
    if (!admin) {
      throw new Error(`Super admin not found: ${adminId}`);
    }

    admin.isActive = isActive;
    admin.updatedAt = Date.now();

    // 如果停用，终止所有会话
    if (!isActive) {
      this.terminateAllSessions(adminId, operatorId, "Admin deactivated");
    }

    // 记录操作
    this.recordOperation({
      adminId: operatorId,
      operationType: "user_management",
      targetType: "user",
      targetId: adminId,
      action: isActive ? "activate_admin" : "deactivate_admin",
      success: true,
    });

    return admin;
  }

  // ========== 权限验证 ==========

  /**
   * 检查管理员是否有特定权限
   */
  public hasPermission(adminId: string, permission: string): boolean {
    const admin = this.admins.get(adminId);
    if (!admin || !admin.isActive) {
      return false;
    }

    // 系统管理员有所有权限
    if (admin.permissions.includes("*")) {
      return true;
    }

    // 精确匹配
    if (admin.permissions.includes(permission)) {
      return true;
    }

    // 通配符匹配
    return admin.permissions.some((p) => {
      if (p.endsWith(".*")) {
        const prefix = p.slice(0, -2);
        return permission.startsWith(prefix);
      }
      return false;
    });
  }

  /**
   * 检查管理员是否可以操作特定目标
   */
  public canOperateOn(adminId: string, targetType: string, targetId: string): boolean {
    const admin = this.admins.get(adminId);
    if (!admin || !admin.isActive) {
      return false;
    }

    // 系统管理员可以操作所有目标
    if (admin.role === "system-admin") {
      return true;
    }

    // 检查作用域限制
    if (admin.scope) {
      switch (targetType) {
        case "organization":
          return !admin.scope.organizations || admin.scope.organizations.includes(targetId);
        case "agentGroup":
          return !admin.scope.agentGroups || admin.scope.agentGroups.includes(targetId);
        case "tool":
          return !admin.scope.tools || admin.scope.tools.includes(targetId);
        default:
          return true;
      }
    }

    return true;
  }

  // ========== 会话管理 ==========

  /**
   * 创建管理员会话
   */
  public createSession(params: {
    adminId: string;
    ipAddress: string;
    userAgent: string;
    location?: AdminSession["location"];
  }): AdminSession {
    const { adminId, ipAddress, userAgent, location } = params;

    const admin = this.admins.get(adminId);
    if (!admin) {
      throw new Error(`Super admin not found: ${adminId}`);
    }

    if (!admin.isActive) {
      throw new Error(`Super admin is not active: ${adminId}`);
    }

    // 检查 IP 白名单
    if (this.config?.ipWhitelistEnabled) {
      const allowedIps = admin.ipWhitelist || this.config.globalIpWhitelist || [];
      if (allowedIps.length > 0 && !this.isIpAllowed(ipAddress, allowedIps)) {
        throw new Error(`IP address not in whitelist: ${ipAddress}`);
      }
    }

    // 检查并发会话限制
    if (this.config?.maxConcurrentSessions) {
      const activeSessions = this.getActiveSessions(adminId);
      if (activeSessions.length >= this.config.maxConcurrentSessions) {
        throw new Error(
          `Maximum concurrent sessions exceeded: ${this.config.maxConcurrentSessions}`,
        );
      }
    }

    const now = Date.now();
    const sessionTimeout = this.config?.sessionTimeout || 3600; // 默认1小时

    const session: AdminSession = {
      id: `session-${adminId}-${now}`,
      adminId,
      startedAt: now,
      lastActivityAt: now,
      expiresAt: now + sessionTimeout * 1000,
      ipAddress,
      userAgent,
      location,
      mfaVerified: !admin.mfaEnabled, // 如果不需要 MFA，直接标记为已验证
      isActive: true,
    };

    this.sessions.set(session.id, session);

    // 更新管理员在线状态
    admin.isOnline = true;
    admin.lastActiveAt = now;

    return session;
  }

  /**
   * 检查 IP 是否在白名单中
   */
  private isIpAllowed(ip: string, whitelist: string[]): boolean {
    return whitelist.some((pattern) => {
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        return regex.test(ip);
      }
      return pattern === ip;
    });
  }

  /**
   * 验证会话
   */
  public validateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    const now = Date.now();

    // 检查是否过期
    if (session.expiresAt < now) {
      this.terminateSession(sessionId, "system", "Session expired");
      return false;
    }

    // 更新最后活动时间
    session.lastActivityAt = now;

    // 更新管理员最后活动时间
    const admin = this.admins.get(session.adminId);
    if (admin) {
      admin.lastActiveAt = now;
    }

    return true;
  }

  /**
   * 验证 MFA
   */
  public verifyMfa(sessionId: string, code: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 这里应该调用 MFA 验证服务
    // 简化实现：假设验证成功
    const verified = true; // TODO: 实际 MFA 验证

    if (verified) {
      session.mfaVerified = true;
      session.mfaVerifiedAt = Date.now();
    }

    return verified;
  }

  /**
   * 获取活跃会话
   */
  public getActiveSessions(adminId: string): AdminSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.adminId === adminId && s.isActive);
  }

  /**
   * 终止会话
   */
  public terminateSession(sessionId: string, operatorId: string, reason?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.isActive = false;
    session.terminatedAt = Date.now();
    session.terminatedBy = operatorId;
    session.terminationReason = reason;

    // 如果管理员没有其他活跃会话，更新在线状态
    const activeSessions = this.getActiveSessions(session.adminId);
    if (activeSessions.length === 0) {
      const admin = this.admins.get(session.adminId);
      if (admin) {
        admin.isOnline = false;
      }
    }
  }

  /**
   * 终止管理员的所有会话
   */
  public terminateAllSessions(adminId: string, operatorId: string, reason?: string): void {
    const sessions = this.getActiveSessions(adminId);
    for (const session of sessions) {
      this.terminateSession(session.id, operatorId, reason);
    }
  }

  // ========== 操作记录 ==========

  /**
   * 记录管理员操作
   */
  public recordOperation(params: {
    adminId: string;
    operationType: AdminOperationType;
    targetType: AdminOperation["targetType"];
    targetId: string;
    action: string;
    parameters?: Record<string, any>;
    success: boolean;
    error?: string;
    affectedEntities?: Array<{ type: string; id: string }>;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): AdminOperation {
    const startTime = Date.now();

    const operation: AdminOperation = {
      id: `op-${params.adminId}-${startTime}`,
      timestamp: startTime,
      duration: 0,
      ...params,
    };

    this.operations.push(operation);

    // 限制操作记录数量
    if (this.operations.length > 10000) {
      this.operations = this.operations.slice(-5000);
    }

    return operation;
  }

  /**
   * 获取管理员操作历史
   */
  public getOperationHistory(params: {
    adminId?: string;
    operationType?: AdminOperationType;
    targetType?: AdminOperation["targetType"];
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AdminOperation[] {
    let operations = [...this.operations];

    // 应用过滤器
    if (params.adminId) {
      operations = operations.filter((op) => op.adminId === params.adminId);
    }

    if (params.operationType) {
      operations = operations.filter((op) => op.operationType === params.operationType);
    }

    if (params.targetType) {
      operations = operations.filter((op) => op.targetType === params.targetType);
    }

    if (params.startTime) {
      operations = operations.filter((op) => op.timestamp >= params.startTime!);
    }

    if (params.endTime) {
      operations = operations.filter((op) => op.timestamp <= params.endTime!);
    }

    // 排序（最新的在前）
    operations.sort((a, b) => b.timestamp - a.timestamp);

    // 限制数量
    if (params.limit) {
      operations = operations.slice(0, params.limit);
    }

    return operations;
  }

  /**
   * 获取管理员统计信息
   */
  public getAdminStatistics(adminId: string): {
    totalOperations: number;
    operationsByType: Map<AdminOperationType, number>;
    lastOperation?: AdminOperation;
    activeSessions: number;
  } {
    const operations = this.getOperationHistory({ adminId });
    const operationsByType = new Map<AdminOperationType, number>();

    for (const op of operations) {
      operationsByType.set(op.operationType, (operationsByType.get(op.operationType) || 0) + 1);
    }

    return {
      totalOperations: operations.length,
      operationsByType,
      lastOperation: operations[0],
      activeSessions: this.getActiveSessions(adminId).length,
    };
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    this.admins.clear();
    this.sessions.clear();
    this.operations = [];
    this.config = null;
  }
}

/**
 * 导出单例实例
 */
export const superAdminManager = SuperAdminManager.getInstance();
