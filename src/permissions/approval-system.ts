/**
 * Phase 3: 审批流程系统（AI 自治组织版）
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  风险分级的人类介入门控（Human-in-the-loop Gating）                     ║
 * ║                                                                          ║
 * ║  设计原则（OWASP LLM06 Excessive Agency / DIF AI Trust WG）：           ║
 * ║                                                                          ║
 * ║  风险等级 → 审批者层次（委托衰减链）：                                   ║
 * ║    low      → Agent 自我批准（无需等待，立即执行）                        ║
 * ║    medium   → 直接上级 Agent（supervisor / org manager）批准             ║
 * ║    high     → 组织 admin Agent 批准（并通知人类）                        ║
 * ║    critical → 必须人类批准（human-owner），不可绕过                      ║
 * ║                                                                          ║
 * ║  默认超时降级策略：                                                      ║
 * ║    medium/high：超时后降级为上级 Agent 自动批准（避免阻塞）              ║
 * ║    critical：超时后保持 pending，不降级，持续通知人类                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * 功能：
 * - 审批请求创建和管理
 * - 按风险等级自动路由审批者
 * - 多级审批流程
 * - 审批通知
 * - 审批历史记录
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

// ============================================================================
// 风险等级定义
// ============================================================================

/**
 * 操作风险等级
 *
 * low      → Agent 自行决策，无需等待审批
 * medium   → 需要直接上级 Agent（supervisor / org manager）确认
 * high     → 需要 org admin Agent 确认，同时通知人类存档
 * critical → 必须人类（human-owner）亲自批准，任何 Agent 无法代替
 */
export type OperationRisk = "low" | "medium" | "high" | "critical";

/**
 * 预定义的高风险操作类型
 *
 * 调用方可以直接使用这些常量，确保风险等级一致性。
 */
export const OPERATION_RISK_MAP: Record<string, OperationRisk> = {
  // ── 任务操作 ──────────────────────────────────────────────────────────────
  "task.create": "low", // 创建任务：Agent 自主决策
  "task.update": "low", // 更新任务内容/状态：Agent 自主决策
  "task.assign": "medium", // 分配任务给其他 Agent：需上级确认
  "task.delete": "medium", // 删除任务：需上级确认
  "task.reassign": "medium", // 重新分配：需上级确认
  "task.batch_delete": "high", // 批量删除：需 admin 确认

  // ── 组织/团队操作 ─────────────────────────────────────────────────────────
  "org.create": "high", // 创建组织：需 admin 确认
  "org.update": "medium", // 更新组织信息：需上级确认
  "org.delete": "critical", // 删除组织：必须人类批准
  "org.member.add": "medium", // 添加成员：需上级确认
  "org.member.remove": "high", // 移除成员：需 admin 确认
  "org.member.promote": "high", // 提升角色：需 admin 确认

  // ── 团队操作 ──────────────────────────────────────────────────────────────
  "team.create": "medium", // 创建团队：需上级确认
  "team.delete": "high", // 删除团队：需 admin 确认
  "team.leader.change": "high", // 更换团队 lead：需 admin 确认

  // ── 权限操作 ──────────────────────────────────────────────────────────────
  "permission.grant": "high", // 授权：需 admin 确认
  "permission.revoke": "high", // 撤权：需 admin 确认
  "permission.config": "critical", // 修改权限配置文件：必须人类批准

  // ── 项目操作 ──────────────────────────────────────────────────────────────
  "project.create": "medium", // 创建项目：需上级确认
  "project.delete": "critical", // 删除项目：必须人类批准
  "project.archive": "high", // 归档项目：需 admin 确认
  "project.budget": "critical", // 预算变更：必须人类批准

  // ── 代理/系统操作 ─────────────────────────────────────────────────────────
  "agent.spawn": "medium", // 创建新 Agent：需上级确认
  "agent.terminate": "high", // 终止 Agent：需 admin 确认
  "agent.config": "critical", // 修改 Agent 配置：必须人类批准
  "system.config": "critical", // 修改系统配置：必须人类批准
};

/**
 * 根据操作类型获取风险等级，未知操作默认 medium（保守策略）
 */
export function getOperationRisk(actionType: string): OperationRisk {
  return OPERATION_RISK_MAP[actionType] ?? "medium";
}

/**
 * 根据风险等级获取默认超时时间（毫秒）
 *
 * critical 操作不自动超时（null = 永不过期，必须人类响应）
 */
export function getDefaultExpiryMs(risk: OperationRisk): number | null {
  switch (risk) {
    case "low":
      return 0; // 立即执行，不进入审批队列
    case "medium":
      return 30 * 60 * 1000; // 30 分钟
    case "high":
      return 2 * 60 * 60 * 1000; // 2 小时
    case "critical":
      return null; // 永不自动过期，必须人类响应
  }
}

/**
 * 审批状态
 */
export type ApprovalStatus =
  | "pending" // 待审批
  | "approved" // 已批准
  | "rejected" // 已拒绝
  | "cancelled" // 已取消
  | "expired"; // 已过期

/**
 * 审批优先级
 */
export type ApprovalPriority = "low" | "normal" | "high" | "urgent";

/**
 * 审批请求
 */
export interface ApprovalRequest {
  /** 请求ID */
  id: string;

  /** 请求者（Agent ID） */
  requesterId: string;

  /** 审批者列表（Agent ID 或 'human-owner'） */
  approvers: string[];

  /** 已审批者 */
  approvedBy: string[];

  /** 操作类型 */
  actionType: string;

  /** 操作描述 */
  description: string;

  /** 操作参数 */
  // oxlint-disable-next-line typescript/no-explicit-any
  params: any;

  /** 优先级 */
  priority: ApprovalPriority;

  /** 状态 */
  status: ApprovalStatus;

  /** 创建时间 */
  createdAt: number;

  /** 过期时间 */
  expiresAt?: number;

  /** 批准时间 */
  approvedAt?: number;

  /** 拒绝时间 */
  rejectedAt?: number;

  /** 拒绝原因 */
  rejectionReason?: string;

  /** 审批历史 */
  history: ApprovalHistoryEntry[];

  /** 元数据 */
  // oxlint-disable-next-line typescript/no-explicit-any
  metadata?: Record<string, any>;

  /** 操作风险等级（自动路由审批者的依据） */
  risk?: OperationRisk;

  /**
   * 是否需要人类介入
   * true  → critical 级别，审批者列表必须包含 human-owner
   * false → 可由 Agent 自主审批
   */
  requiresHuman?: boolean;
}

/**
 * 审批历史记录
 */
export interface ApprovalHistoryEntry {
  /** 时间戳 */
  timestamp: number;

  /** 操作者 */
  actor: string;

  /** 操作类型 */
  action: "created" | "approved" | "rejected" | "cancelled" | "expired";

  /** 备注 */
  comment?: string;
}

/**
 * 审批配置
 */
export interface ApprovalConfig {
  /** 是否需要所有审批者都同意 */
  requireAll: boolean;

  /** 最小审批人数 */
  minApprovers?: number;

  /** 默认过期时间（毫秒） */
  defaultExpiryMs?: number;

  /** 是否允许自动批准 */
  allowAutoApprove?: boolean;

  /** 自动批准条件 */
  autoApproveConditions?: Array<{
    condition: string;
    // oxlint-disable-next-line typescript/no-explicit-any
    value: any;
  }>;
}

/**
 * 审批统计信息
 */
export interface ApprovalStats {
  /** 待审批数量 */
  pending: number;

  /** 已批准数量 */
  approved: number;

  /** 已拒绝数量 */
  rejected: number;

  /** 已过期数量 */
  expired: number;

  /** 平均审批时间（毫秒） */
  avgApprovalTime: number;
}

// ============================================================================
// 审批路由辅助
// ============================================================================

/**
 * 根据风险等级和上下文，自动推导审批者列表
 *
 * 委托衰减链规则：
 *   low      → [requesterId]（自我批准）
 *   medium   → [supervisorId ?? orgManagerId ?? requesterId]（向上一级）
 *   high     → [orgAdminId ?? "human-owner"]（需通知 org admin 或人类）
 *   critical → ["human-owner"]（必须人类）
 *
 * @param risk         - 操作风险等级
 * @param requesterId  - 发起操作的 Agent ID
 * @param supervisorId - 直接上级 Agent ID（可选）
 * @param orgAdminId   - 组织 admin Agent ID（可选）
 */
export function resolveApprovers(
  risk: OperationRisk,
  requesterId: string,
  supervisorId?: string,
  orgAdminId?: string,
): string[] {
  switch (risk) {
    case "low":
      // 低风险：Agent 自我批准，直接放行
      return [requesterId];

    case "medium": {
      // 中风险：直接上级 Agent 批准
      const approver = supervisorId ?? orgAdminId;
      if (!approver || approver === requesterId) {
        // 无上级：降级为 org admin 或通知人类
        return [orgAdminId ?? "human-owner"];
      }
      return [approver];
    }

    case "high": {
      // 高风险：org admin Agent 批准（同时通知人类存档）
      return [orgAdminId ?? "human-owner"];
    }

    case "critical":
      // 极高风险：必须人类批准，任何 Agent 均无权审批
      return ["human-owner"];
  }
}

/**
 * 审批系统
 */
export class ApprovalSystem {
  private requests: Map<string, ApprovalRequest> = new Map();
  private agentRequests: Map<string, Set<string>> = new Map(); // agentId -> requestIds
  private approverRequests: Map<string, Set<string>> = new Map(); // approverId -> requestIds
  private storageDir: string;
  private config: ApprovalConfig;

  constructor(config?: Partial<ApprovalConfig>, storageDir?: string) {
    this.storageDir = storageDir || path.join(os.homedir(), ".openclaw", "approvals");
    this.config = {
      requireAll: false,
      minApprovers: 1,
      defaultExpiryMs: 24 * 60 * 60 * 1000, // 24小时
      allowAutoApprove: false,
      ...config,
    };
    void this.ensureStorageDir();
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error("[Approval System] Failed to create storage directory:", error);
    }
  }

  /**
   * 创建审批请求
   *
   * 支持两种使用模式：
   *
   * 模式A（推荐）：传入 risk，由系统自动路由审批者
   *   await approvalSystem.createRequest({
   *     requesterId: "agent-pm",
   *     actionType: "org.member.remove",
   *     risk: "high",
   *     supervisorId: "agent-ceo",
   *     orgAdminId: "agent-admin",
   *     ...
   *   })
   *
   * 模式B（向后兼容）：手动指定 approvers 列表
   *   await approvalSystem.createRequest({
   *     requesterId: "agent-pm",
   *     approvers: ["agent-ceo"],
   *     actionType: "task.delete",
   *     ...
   *   })
   */
  async createRequest(params: {
    requesterId: string;
    /** 模式B：手动指定审批者列表（与 risk 二选一，risk 优先） */
    approvers?: string[];
    actionType: string;
    description: string;
    // oxlint-disable-next-line typescript/no-explicit-any
    actionParams: any;
    priority?: ApprovalPriority;
    expiresIn?: number; // 过期时间（毫秒）
    // oxlint-disable-next-line typescript/no-explicit-any
    metadata?: Record<string, any>;
    // ── 模式A 新增参数 ────────────────────────────────────────────
    /** 操作风险等级（指定后自动路由审批者，忽略 approvers 参数） */
    risk?: OperationRisk;
    /** 直接上级 Agent ID（用于 medium 级别路由） */
    supervisorId?: string;
    /** 组织 admin Agent ID（用于 high 级别路由） */
    orgAdminId?: string;
  }): Promise<ApprovalRequest> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // ── 风险等级路由 ──────────────────────────────────────────────────────────
    const risk: OperationRisk = params.risk ?? getOperationRisk(params.actionType);
    const requiresHuman = risk === "critical";

    // 优先使用 risk 自动路由；无 risk 时退回 approvers；都没有则用保守默认
    const resolvedApprovers: string[] =
      params.risk !== undefined
        ? resolveApprovers(risk, params.requesterId, params.supervisorId, params.orgAdminId)
        : (params.approvers ?? ["human-owner"]);

    // ── 计算过期时间 ──────────────────────────────────────────────────────────
    let expiresAt: number | undefined;
    if (params.expiresIn !== undefined) {
      expiresAt = now + params.expiresIn;
    } else {
      const defaultMs = getDefaultExpiryMs(risk);
      expiresAt = defaultMs !== null ? now + defaultMs : undefined; // critical: 不过期
    }

    // ── 低风险：直接自批准，跳过审批队列 ─────────────────────────────────────
    if (risk === "low") {
      const autoApproved: ApprovalRequest = {
        id: requestId,
        requesterId: params.requesterId,
        approvers: resolvedApprovers,
        approvedBy: [params.requesterId],
        actionType: params.actionType,
        description: params.description,
        params: params.actionParams,
        priority: params.priority ?? "normal",
        status: "approved",
        createdAt: now,
        approvedAt: now,
        history: [
          { timestamp: now, actor: params.requesterId, action: "created" },
          {
            timestamp: now,
            actor: "system",
            action: "approved",
            comment: "Auto-approved (low risk)",
          },
        ],
        metadata: params.metadata,
        risk,
        requiresHuman: false,
      };
      this.requests.set(requestId, autoApproved);
      await this.saveRequest(autoApproved);
      console.log(
        `[Approval System] Low-risk action auto-approved: ${params.actionType} by ${params.requesterId}`,
      );
      return autoApproved;
    }

    const request: ApprovalRequest = {
      id: requestId,
      requesterId: params.requesterId,
      approvers: resolvedApprovers,
      approvedBy: [],
      actionType: params.actionType,
      description: params.description,
      params: params.actionParams,
      priority: params.priority || "normal",
      status: "pending",
      createdAt: now,
      expiresAt,
      history: [
        {
          timestamp: now,
          actor: params.requesterId,
          action: "created",
        },
      ],
      metadata: params.metadata,
      risk,
      requiresHuman,
    };

    if (requiresHuman) {
      console.warn(
        `[Approval System] ⚠️  CRITICAL operation requires HUMAN approval: "${params.actionType}" requested by ${params.requesterId}. ` +
          `This request will NOT auto-expire and MUST be reviewed by human-owner.`,
      );
    }

    // 检查自动批准（向后兼容旧配置，不覆盖 critical 级别）
    if (!requiresHuman && this.config.allowAutoApprove && this.checkAutoApprove(request)) {
      request.status = "approved";
      request.approvedAt = now;
      request.approvedBy = ["auto"];
      request.history.push({
        timestamp: now,
        actor: "system",
        action: "approved",
        comment: "Auto-approved",
      });
    }

    // 保存请求
    this.requests.set(requestId, request);

    // 添加索引
    if (!this.agentRequests.has(params.requesterId)) {
      this.agentRequests.set(params.requesterId, new Set());
    }
    this.agentRequests.get(params.requesterId)!.add(requestId);

    for (const approverId of params.approvers) {
      if (!this.approverRequests.has(approverId)) {
        this.approverRequests.set(approverId, new Set());
      }
      this.approverRequests.get(approverId)!.add(requestId);
    }

    // 持久化
    await this.saveRequest(request);

    console.log(`[Approval System] Created request ${requestId} for ${params.actionType}`);
    return request;
  }

  /**
   * 检查是否满足自动批准条件
   */
  private checkAutoApprove(request: ApprovalRequest): boolean {
    if (!this.config.autoApproveConditions) {
      return false;
    }

    for (const condition of this.config.autoApproveConditions) {
      // 简单的条件检查实现
      // 实际可以扩展为更复杂的规则引擎
      if (condition.condition === "actionType" && request.actionType === condition.value) {
        return true;
      }
      if (condition.condition === "priority" && request.priority === condition.value) {
        return true;
      }
    }

    return false;
  }

  /**
   * 批准请求
   *
   * 对 critical 级别的请求，只有 "human-owner" 身份才能批准。
   * 若 approverId 为普通 Agent ID 且请求的 requiresHuman=true，则拒绝。
   */
  async approve(requestId: string, approverId: string, comment?: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is not pending (status: ${request.status})`);
    }

    // ── Critical 操作：必须人类审批 ──────────────────────────────────────────
    if (request.requiresHuman && approverId !== "human-owner") {
      throw new Error(
        `[ApprovalSystem] ⛔ Cannot approve critical operation "${request.actionType}" with agent identity "${approverId}". ` +
          `This operation requires human-owner approval. Agents CANNOT bypass this restriction.`,
      );
    }

    // 检查是否为有效审批者
    if (!request.approvers.includes(approverId)) {
      throw new Error(`${approverId} is not an approver for request ${requestId}`);
    }

    // 检查是否已批准
    if (request.approvedBy.includes(approverId)) {
      throw new Error(`${approverId} has already approved request ${requestId}`);
    }

    // 添加批准
    request.approvedBy.push(approverId);
    request.history.push({
      timestamp: Date.now(),
      actor: approverId,
      action: "approved",
      comment,
    });

    // 检查是否满足批准条件
    const shouldApprove = this.config.requireAll
      ? request.approvedBy.length === request.approvers.length
      : request.approvedBy.length >= (this.config.minApprovers || 1);

    if (shouldApprove) {
      request.status = "approved";
      request.approvedAt = Date.now();
      console.log(`[Approval System] Request ${requestId} approved`);
    }

    await this.saveRequest(request);
  }

  /**
   * 拒绝请求
   */
  async reject(requestId: string, approverId: string, reason?: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is not pending (status: ${request.status})`);
    }

    // 检查是否为有效审批者
    if (!request.approvers.includes(approverId)) {
      throw new Error(`${approverId} is not an approver for request ${requestId}`);
    }

    // 标记为拒绝
    request.status = "rejected";
    request.rejectedAt = Date.now();
    request.rejectionReason = reason;
    request.history.push({
      timestamp: Date.now(),
      actor: approverId,
      action: "rejected",
      comment: reason,
    });

    await this.saveRequest(request);
    console.log(`[Approval System] Request ${requestId} rejected by ${approverId}`);
  }

  /**
   * 取消请求
   */
  async cancel(requestId: string, cancellerId: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is not pending (status: ${request.status})`);
    }

    // 只有请求者可以取消
    if (request.requesterId !== cancellerId) {
      throw new Error(`Only requester can cancel the request`);
    }

    request.status = "cancelled";
    request.history.push({
      timestamp: Date.now(),
      actor: cancellerId,
      action: "cancelled",
    });

    await this.saveRequest(request);
    console.log(`[Approval System] Request ${requestId} cancelled`);
  }

  /**
   * 获取请求
   */
  getRequest(requestId: string): ApprovalRequest | null {
    return this.requests.get(requestId) || null;
  }

  /**
   * 获取 Agent 的所有请求
   */
  getAgentRequests(agentId: string, status?: ApprovalStatus): ApprovalRequest[] {
    const requestIds = this.agentRequests.get(agentId);
    if (!requestIds) {
      return [];
    }

    const requests: ApprovalRequest[] = [];
    for (const requestId of requestIds) {
      const request = this.requests.get(requestId);
      if (request && (!status || request.status === status)) {
        requests.push(request);
      }
    }

    return requests;
  }

  /**
   * 获取待审批的请求
   */
  getPendingApprovals(approverId: string): ApprovalRequest[] {
    const requestIds = this.approverRequests.get(approverId);
    if (!requestIds) {
      return [];
    }

    const pending: ApprovalRequest[] = [];
    for (const requestId of requestIds) {
      const request = this.requests.get(requestId);
      if (request && request.status === "pending" && !request.approvedBy.includes(approverId)) {
        pending.push(request);
      }
    }

    return pending;
  }

  /**
   * 检查过期请求
   *
   * critical 级别（requiresHuman=true）的请求永不自动过期，
   * 会持续保持 pending 并记录告警，直到人类手动处理。
   */
  async checkExpiredRequests(): Promise<void> {
    const now = Date.now();
    const expiredIds: string[] = [];
    const criticalPending: string[] = [];

    for (const [requestId, request] of this.requests) {
      if (request.status !== "pending") {
        continue;
      }

      // critical 操作：不自动过期，持续告警
      if (request.requiresHuman) {
        const waitMinutes = Math.round((now - request.createdAt) / 60_000);
        if (waitMinutes > 0 && waitMinutes % 30 === 0) {
          // 每 30 分钟重复告警一次
          console.warn(
            `[Approval System] ⚠️  CRITICAL approval still pending: "${request.actionType}" (ID: ${requestId}) ` +
              `has been waiting ${waitMinutes} minutes. human-owner action required.`,
          );
        }
        criticalPending.push(requestId);
        continue;
      }

      if (request.expiresAt && request.expiresAt < now) {
        request.status = "expired";
        request.history.push({
          timestamp: now,
          actor: "system",
          action: "expired",
        });
        expiredIds.push(requestId);
        await this.saveRequest(request);
      }
    }

    if (expiredIds.length > 0) {
      console.log(`[Approval System] Marked ${expiredIds.length} requests as expired`);
    }
    if (criticalPending.length > 0) {
      console.warn(
        `[Approval System] ${criticalPending.length} CRITICAL approval(s) still pending human review: [${criticalPending.join(", ")}]`,
      );
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): ApprovalStats {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let expired = 0;
    let totalApprovalTime = 0;
    let approvalCount = 0;

    for (const request of this.requests.values()) {
      switch (request.status) {
        case "pending":
          pending++;
          break;
        case "approved":
          approved++;
          if (request.approvedAt) {
            totalApprovalTime += request.approvedAt - request.createdAt;
            approvalCount++;
          }
          break;
        case "rejected":
          rejected++;
          break;
        case "expired":
          expired++;
          break;
      }
    }

    return {
      pending,
      approved,
      rejected,
      expired,
      avgApprovalTime: approvalCount > 0 ? totalApprovalTime / approvalCount : 0,
    };
  }

  /**
   * 保存请求到持久化存储
   */
  private async saveRequest(request: ApprovalRequest): Promise<void> {
    const filePath = path.join(this.storageDir, `${request.id}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(request, null, 2), "utf-8");
    } catch (error) {
      console.error(`[Approval System] Failed to save request ${request.id}:`, error);
    }
  }

  /**
   * 清理旧请求
   */
  async cleanupOldRequests(olderThanMs: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [requestId, request] of this.requests) {
      if (request.status !== "pending" && now - request.createdAt > olderThanMs) {
        toDelete.push(requestId);
      }
    }

    for (const requestId of toDelete) {
      this.requests.delete(requestId);

      // 删除文件
      const filePath = path.join(this.storageDir, `${requestId}.json`);
      try {
        await fs.unlink(filePath);
      } catch {
        // 忽略文件不存在的错误
      }
    }

    if (toDelete.length > 0) {
      console.log(`[Approval System] Cleaned up ${toDelete.length} old requests`);
    }
  }
}

/**
 * 全局审批系统实例
 */
export const approvalSystem = new ApprovalSystem();

// ============================================================================
// 便捷函数：一行代码发起风险感知的审批请求
// ============================================================================

/**
 * 发起一个风险感知的审批请求（推荐 API）
 *
 * 系统自动根据 actionType 判断风险等级并路由审批者。
 * 低风险操作立即返回已批准的请求，无需等待。
 *
 * 使用示例：
 * ```typescript
 * const req = await requestApproval({
 *   requesterId: "agent-pm-01",
 *   actionType: "org.member.remove",
 *   description: "移除过期合同工 agent-contractor-07",
 *   actionParams: { orgId: "dept-eng", memberId: "agent-contractor-07" },
 *   supervisorId: "agent-ceo-01",
 *   orgAdminId:   "agent-admin-01",
 * });
 *
 * if (req.status === "approved") {
 *   // 执行操作
 * } else {
 *   // 等待审批，操作已进入审批队列
 * }
 * ```
 */
export async function requestApproval(params: {
  requesterId: string;
  actionType: string;
  description: string;
  actionParams: unknown;
  priority?: ApprovalPriority;
  supervisorId?: string;
  orgAdminId?: string;
  metadata?: Record<string, unknown>;
}): Promise<ApprovalRequest> {
  return approvalSystem.createRequest({
    requesterId: params.requesterId,
    actionType: params.actionType,
    description: params.description,
    actionParams: params.actionParams,
    priority: params.priority,
    supervisorId: params.supervisorId,
    orgAdminId: params.orgAdminId,
    metadata: params.metadata,
    // risk 由 getOperationRisk(actionType) 自动推导
  });
}

/**
 * 检查操作是否需要审批（不实际创建请求）
 *
 * 用于在执行前快速判断是否需要走审批流程。
 * 返回 false 表示低风险操作，可直接执行，无需审批等待。
 */
export function requiresApproval(actionType: string): boolean {
  return getOperationRisk(actionType) !== "low";
}

/**
 * 检查操作是否必须由人类批准（critical 级别）
 */
export function requiresHumanApproval(actionType: string): boolean {
  return getOperationRisk(actionType) === "critical";
}
