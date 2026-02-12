/**
 * 权限验证中间件
 *
 * 提供统一的权限验证接口，用于：
 * - Gateway RPC 请求验证
 * - 工具执行权限检查
 * - 审批流程管理
 * - 权限变更持久化
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OpenClawConfig } from "../config/types.js";
import type {
  AgentPermissionsConfig,
  PermissionSubject,
  PermissionAuditLog,
} from "../config/types.permissions.js";
import type { ApprovalRequest } from "./approval.js";
import type { PermissionCheckContext, PermissionCheckResult } from "./checker.js";
import { listAgentEntries, findAgentEntryIndex } from "../commands/agents.config.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../config/config.js";
import { getDataDirectory } from "../paths.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { ApprovalWorkflow } from "./approval.js";
import { PermissionChecker } from "./checker.js";

/**
 * 权限历史记录
 */
export interface PermissionHistory {
  id: string;
  timestamp: number;
  operator: PermissionSubject;
  agentId: string;
  action: "create" | "update" | "delete" | "approval" | "rejection";
  target: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * 权限验证上下文（扩展）
 */
export interface VerificationContext extends PermissionCheckContext {
  /** 操作员信息 */
  operator?: PermissionSubject;
  /** 是否跳过验证（超级管理员） */
  skipCheck?: boolean;
  /** 请求来源 */
  source?: "gateway" | "internal" | "cli";
}

/**
 * 权限验证结果（扩展）
 */
export interface VerificationResult extends PermissionCheckResult {
  /** 错误信息 */
  error?: string;
  /** 建议操作 */
  suggestion?: string;
}

/**
 * 权限验证中间件类
 */
export class PermissionMiddleware {
  private checkers = new Map<string, PermissionChecker>();
  private workflows = new Map<string, ApprovalWorkflow>();
  private historyPath: string;
  private auditPath: string;

  constructor() {
    const dataDir = getDataDirectory();
    this.historyPath = join(dataDir, "permissions-history.jsonl");
    this.auditPath = join(dataDir, "permissions-audit.jsonl");
  }

  /**
   * 验证权限
   *
   * @param context - 验证上下文
   * @returns 验证结果
   */
  async verify(context: VerificationContext): Promise<VerificationResult> {
    try {
      // 跳过验证（超级管理员）
      if (context.skipCheck) {
        return {
          allowed: true,
          action: "allow",
          requiresApproval: false,
          metadata: { skipped: true },
        };
      }

      // 获取智能助手配置
      const config = loadConfig();
      const agentId = context.agentId || "default";
      const permissionsConfig = this.getAgentPermissionsConfig(config, agentId);

      if (!permissionsConfig) {
        return {
          allowed: false,
          action: "deny",
          requiresApproval: false,
          reason: `No permissions configuration found for agent: ${agentId}`,
          error: "MISSING_CONFIG",
        };
      }

      // 获取或创建权限检查器
      const checker = this.getOrCreateChecker(agentId, permissionsConfig);

      // 执行权限检查
      const result = await checker.check(context);

      // 如果需要审批，创建审批请求
      if (result.requiresApproval) {
        const workflow = this.getOrCreateWorkflow(agentId, permissionsConfig);
        const approvalRequest = await workflow.createRequest(context, result.approvalId);

        return {
          ...result,
          metadata: {
            ...result.metadata,
            approvalRequest,
          },
          suggestion: `Please wait for approval from: ${approvalRequest.approvers.map((a) => `${a.type}:${a.id}`).join(", ")}`,
        };
      }

      return result;
    } catch (error) {
      console.error("[PermissionMiddleware] Verification failed:", error);
      return {
        allowed: false,
        action: "deny",
        requiresApproval: false,
        reason: "Permission verification failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量验证权限
   *
   * @param contexts - 验证上下文数组
   * @returns 验证结果数组
   */
  async verifyBatch(contexts: VerificationContext[]): Promise<VerificationResult[]> {
    return Promise.all(contexts.map((ctx) => this.verify(ctx)));
  }

  /**
   * 更新权限配置
   *
   * @param agentId - 智能助手ID
   * @param config - 权限配置
   * @param operator - 操作员
   * @param reason - 变更原因
   * @returns 是否成功
   */
  async updatePermissions(
    agentId: string,
    config: AgentPermissionsConfig,
    operator: PermissionSubject,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 读取当前配置
      const snapshot = await readConfigFileSnapshot();
      if (!snapshot.valid) {
        return { success: false, error: "Invalid config; fix before updating" };
      }

      const cfg = snapshot.config;
      const normalized = normalizeAgentId(agentId);
      const agents = listAgentEntries(cfg);
      const agentIndex = findAgentEntryIndex(agents, normalized);

      if (agentIndex < 0) {
        return { success: false, error: `Agent not found: ${agentId}` };
      }

      // 保存旧配置用于历史记录
      const oldConfig = (agents[agentIndex] as any).permissions;

      // 更新agent配置
      const updatedAgent = {
        ...agents[agentIndex],
        permissions: config,
      };

      agents[agentIndex] = updatedAgent;

      // 更新完整配置
      const updatedConfig: OpenClawConfig = {
        ...cfg,
        agents: {
          ...cfg.agents,
          list: agents,
        },
      };

      // 写入配置文件
      await writeConfigFile(updatedConfig);

      // 更新检查器和工作流
      const checker = new PermissionChecker(config);
      this.checkers.set(normalized, checker);

      const workflow = new ApprovalWorkflow(config);
      this.workflows.set(normalized, workflow);

      // 记录历史
      await this.recordHistory({
        id: this.generateId("history"),
        timestamp: Date.now(),
        operator,
        agentId: normalized,
        action: oldConfig ? "update" : "create",
        target: "permissions",
        oldValue: oldConfig,
        newValue: config,
        reason,
      });

      return { success: true };
    } catch (error) {
      console.error("[PermissionMiddleware] Update failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取审批请求
   *
   * @param agentId - 智能助手ID
   * @param requestId - 请求ID（可选）
   * @returns 审批请求或请求列表
   */
  getApprovalRequest(
    agentId: string,
    requestId?: string,
  ): ApprovalRequest | ApprovalRequest[] | null {
    const workflow = this.workflows.get(normalizeAgentId(agentId));
    if (!workflow) {
      return null;
    }

    if (requestId) {
      return workflow.getRequest(requestId);
    }

    return workflow.getPendingRequests({ agentId });
  }

  /**
   * 处理审批决策
   *
   * @param requestId - 请求ID
   * @param approver - 审批者
   * @param approved - 是否批准
   * @param comment - 评论
   * @returns 审批结果
   */
  async processApproval(
    requestId: string,
    approver: PermissionSubject,
    approved: boolean,
    comment?: string,
  ): Promise<{ success: boolean; error?: string; request?: ApprovalRequest }> {
    try {
      // 查找包含此请求的工作流
      let targetWorkflow: ApprovalWorkflow | null = null;
      let targetAgentId: string | null = null;

      for (const [agentId, workflow] of this.workflows.entries()) {
        const request = workflow.getRequest(requestId);
        if (request) {
          targetWorkflow = workflow;
          targetAgentId = agentId;
          break;
        }
      }

      if (!targetWorkflow || !targetAgentId) {
        return { success: false, error: `Approval request not found: ${requestId}` };
      }

      // 处理审批动作
      const result = await targetWorkflow.processAction({
        requestId,
        approver,
        approved,
        comment,
        timestamp: Date.now(),
      });

      // 记录历史
      await this.recordHistory({
        id: this.generateId("history"),
        timestamp: Date.now(),
        operator: approver,
        agentId: targetAgentId,
        action: approved ? "approval" : "rejection",
        target: "approval-request",
        newValue: { requestId, approved, comment },
        reason: comment,
      });

      return {
        success: result.success,
        error: result.success ? undefined : result.message,
        request: result.request,
      };
    } catch (error) {
      console.error("[PermissionMiddleware] Approval processing failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取权限变更历史
   *
   * @param agentId - 智能助手ID（可选）
   * @param limit - 限制数量
   * @param offset - 偏移量
   * @returns 历史记录
   */
  async getHistory(
    agentId?: string,
    limit = 100,
    offset = 0,
  ): Promise<{ history: PermissionHistory[]; total: number }> {
    try {
      if (!existsSync(this.historyPath)) {
        return { history: [], total: 0 };
      }

      const content = await readFile(this.historyPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      let history = lines
        .map((line) => {
          try {
            return JSON.parse(line) as PermissionHistory;
          } catch {
            return null;
          }
        })
        .filter((h): h is PermissionHistory => h !== null);

      // 按智能助手ID过滤
      if (agentId) {
        const normalized = normalizeAgentId(agentId);
        history = history.filter((h) => normalizeAgentId(h.agentId) === normalized);
      }

      // 按时间倒序排序
      history.sort((a, b) => b.timestamp - a.timestamp);

      const total = history.length;
      const paginated = history.slice(offset, offset + limit);

      return { history: paginated, total };
    } catch (error) {
      console.error("[PermissionMiddleware] Failed to read history:", error);
      return { history: [], total: 0 };
    }
  }

  /**
   * 获取审计日志
   *
   * @param agentId - 智能助手ID（可选）
   * @param limit - 限制数量
   * @param offset - 偏移量
   * @returns 审计日志
   */
  async getAuditLogs(
    agentId?: string,
    limit = 100,
    offset = 0,
  ): Promise<{ logs: PermissionAuditLog[]; total: number }> {
    try {
      if (!existsSync(this.auditPath)) {
        return { logs: [], total: 0 };
      }

      const content = await readFile(this.auditPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      let logs = lines
        .map((line) => {
          try {
            return JSON.parse(line) as PermissionAuditLog;
          } catch {
            return null;
          }
        })
        .filter((l): l is PermissionAuditLog => l !== null);

      // 按智能助手ID过滤
      if (agentId) {
        const normalized = normalizeAgentId(agentId);
        logs = logs.filter((l) => l.agentId && normalizeAgentId(l.agentId) === normalized);
      }

      // 按时间倒序排序
      logs.sort((a, b) => b.timestamp - a.timestamp);

      const total = logs.length;
      const paginated = logs.slice(offset, offset + limit);

      return { logs: paginated, total };
    } catch (error) {
      console.error("[PermissionMiddleware] Failed to read audit logs:", error);
      return { logs: [], total: 0 };
    }
  }

  /**
   * 清除所有缓存
   */
  clearAllCaches(): void {
    for (const checker of this.checkers.values()) {
      checker.clearCache();
    }
  }

  /**
   * 重新加载配置
   */
  async reload(): Promise<void> {
    const config = loadConfig();
    const agents = listAgentEntries(config);

    this.checkers.clear();
    this.workflows.clear();

    for (const agent of agents) {
      const permissions = (agent as any).permissions as AgentPermissionsConfig | undefined;
      if (permissions) {
        const agentId = normalizeAgentId(agent.id);
        this.checkers.set(agentId, new PermissionChecker(permissions));
        this.workflows.set(agentId, new ApprovalWorkflow(permissions));
      }
    }
  }

  // ========== 私有方法 ==========

  private getAgentPermissionsConfig(
    cfg: OpenClawConfig,
    agentId: string,
  ): AgentPermissionsConfig | null {
    const normalized = normalizeAgentId(agentId);
    const agents = listAgentEntries(cfg);
    const agent = agents.find((a) => normalizeAgentId(a.id) === normalized);

    if (!agent) {
      return null;
    }
    return (agent as any).permissions || null;
  }

  private getOrCreateChecker(agentId: string, config: AgentPermissionsConfig): PermissionChecker {
    const normalized = normalizeAgentId(agentId);

    if (!this.checkers.has(normalized)) {
      this.checkers.set(normalized, new PermissionChecker(config));
    }

    return this.checkers.get(normalized)!;
  }

  private getOrCreateWorkflow(agentId: string, config: AgentPermissionsConfig): ApprovalWorkflow {
    const normalized = normalizeAgentId(agentId);

    if (!this.workflows.has(normalized)) {
      this.workflows.set(normalized, new ApprovalWorkflow(config));
    }

    return this.workflows.get(normalized)!;
  }

  private async recordHistory(history: PermissionHistory): Promise<void> {
    try {
      const dir = dirname(this.historyPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const entry = JSON.stringify(history) + "\n";
      await appendFile(this.historyPath, entry, "utf-8");
    } catch (error) {
      console.error("[PermissionMiddleware] Failed to record history:", error);
    }
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${timestamp}_${random}`;
  }
}

/**
 * 全局权限中间件实例
 */
export const permissionMiddleware = new PermissionMiddleware();
