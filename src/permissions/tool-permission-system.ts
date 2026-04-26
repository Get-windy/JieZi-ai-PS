/**
 * 工具权限分级系统
 * 
 * 基于OWASP LLM Top 10和业界最佳实践
 * 
 * 风险等级：
 * - read: 只读（无需审批）
 * - write: 写入（需要上级审批）
 * - irreversible: 不可逆（需要Admin + 人类确认）
 */

// ============ 类型定义 ============

/**
 * 工具风险等级
 */
export type ToolRiskLevel = 'read' | 'write' | 'irreversible';

/**
 * 权限检查结果
 */
export type PermissionResult = {
  /** 是否允许执行 */
  allowed: boolean;
  /** 是否需要审批 */
  requiresApproval: boolean;
  /** 审批者 */
  approver?: string;
  /** 是否需要人类确认 */
  requiresHumanConfirmation?: boolean;
  /** 超时时间（秒） */
  timeout?: number;
  /** 原因 */
  reason?: string;
  /** 审计日志 */
  auditLog: string;
};

/**
 * 审计日志条目
 */
export type AuditLogEntry = {
  timestamp: string;
  agentId: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  action: string;
  approval?: {
    required: boolean;
    approvedBy?: string;
    approvedAt?: string;
    approvalReason?: string;
    humanConfirmed?: boolean;
    humanConfirmedAt?: string;
  };
  result: 'success' | 'failure' | 'denied' | 'timeout';
  duration?: number;
};

// ============ 工具风险分级表 ============

/**
 * 所有工具的风险分级
 */
export const TOOL_RISK_LEVELS: Record<string, ToolRiskLevel> = {
  // Read-Only（只读）- 无需审批
  memory_search: 'read',
  memory_get: 'read',
  file_read: 'read',
  task_list: 'read',
  task_read: 'read',
  project_read: 'read',
  code_read: 'read',
  memory_list: 'read',
  skill_list: 'read',
  agent_skill_list: 'read',
  project_memory_get: 'read',
  project_memory_read: 'read',
  
  // Write（写入）- 需要审批
  task_create: 'write',
  task_update: 'write',
  file_write: 'write',
  memory_save: 'write',
  project_memory_save: 'write',
  project_create: 'write',
  project_update: 'write',
  code_write: 'write',
  test_run: 'write',
  bash_execute: 'write',
  review_submit: 'write',
  
  // Irreversible（不可逆）- 需要人类确认
  file_delete: 'irreversible',
  database_drop: 'irreversible',
  payment_execute: 'irreversible',
  deployment_prod: 'irreversible',
  data_migration: 'irreversible',
  user_delete: 'irreversible',
  project_delete: 'irreversible',
};

// ============ 审计日志存储 ============

/**
 * 审计日志存储（内存中，生产环境应使用数据库）
 */
const auditLogs: AuditLogEntry[] = [];

// ============ 权限检查核心逻辑 ============

/**
 * 检查工具权限
 * 
 * @param toolName 工具名称
 * @param agentId Agent ID
 * @param agentRegistry Agent注册表
 * @returns 权限检查结果
 */
export async function checkToolPermission(
  toolName: string,
  agentId: string,
  agentRegistry: any
): Promise<PermissionResult> {
  // 1. 获取工具风险等级
  const riskLevel = TOOL_RISK_LEVELS[toolName];
  if (!riskLevel) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Unknown tool: ${toolName}`,
      auditLog: `Unknown tool ${toolName} requested by ${agentId}`,
    };
  }
  
  // 2. 查询Agent注册表
  const agent = agentRegistry.agents?.find((a: any) => a.id === agentId);
  if (!agent) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Agent not found: ${agentId}`,
      auditLog: `Agent ${agentId} not found in registry`,
    };
  }
  
  // 3. 检查权限并记录日志
  const timestamp = new Date().toISOString();
  
  switch (riskLevel) {
    case 'read':
      // 只读：直接允许
      return {
        allowed: true,
        requiresApproval: false,
        auditLog: `[${timestamp}] READ: Agent ${agentId} executed ${toolName}`,
      };
      
    case 'write':
      // 写入：需要上级审批
      const supervisor = findSupervisor(agentId, agentRegistry);
      return {
        allowed: true,
        requiresApproval: true,
        approver: supervisor,
        timeout: 300, // 5分钟
        auditLog: `[${timestamp}] WRITE: Agent ${agentId} requests ${toolName}, pending approval from ${supervisor}`,
      };
      
    case 'irreversible':
      // 不可逆：需要Admin + 人类确认
      return {
        allowed: true,
        requiresApproval: true,
        approver: 'admin',
        requiresHumanConfirmation: true,
        timeout: 1800, // 30分钟
        auditLog: `[${timestamp}] IRREVERSIBLE: Agent ${agentId} requests ${toolName}, requires admin + human confirmation`,
      };
      
    default:
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Unknown risk level for ${toolName}`,
        auditLog: `[${timestamp}] ERROR: Unknown risk level for ${toolName}`,
      };
  }
}

/**
 * 查找上级Agent
 */
function findSupervisor(agentId: string, agentRegistry: any): string {
  // 简单实现：返回coordinator
  // 实际应根据组织架构查找
  return 'coordinator';
}

// ============ 审批流程 ============

/**
 * 审批请求
 */
export type ApprovalRequest = {
  id: string;
  agentId: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  requestedAt: string;
  status: 'pending' | 'approved' | 'denied' | 'timeout';
  approver?: string;
  approvedAt?: string;
  approvalReason?: string;
  humanConfirmed?: boolean;
};

/**
 * 待审批请求队列
 */
const approvalRequests: Map<string, ApprovalRequest> = new Map();

/**
 * 创建审批请求
 */
export function createApprovalRequest(
  agentId: string,
  toolName: string,
  riskLevel: ToolRiskLevel
): ApprovalRequest {
  const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  const request: ApprovalRequest = {
    id,
    agentId,
    toolName,
    riskLevel,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };
  
  approvalRequests.set(id, request);
  
  // 设置超时
  const timeout = riskLevel === 'irreversible' ? 1800 : 300;
  setTimeout(() => {
    if (request.status === 'pending') {
      if (riskLevel === 'irreversible') {
        // 不可逆操作不自动降级
        request.status = 'timeout';
        console.warn(`⏰ Approval request ${id} timed out (irreversible, waiting for human)`);
      } else {
        // 写入操作超时后自动批准
        request.status = 'approved';
        request.approvedAt = new Date().toISOString();
        request.approvalReason = 'Auto-approved after timeout';
        console.warn(`⚠️  Approval request ${id} auto-approved after timeout`);
      }
    }
  }, timeout * 1000);
  
  return request;
}

/**
 * 审批请求
 */
export function approveRequest(
  requestId: string,
  approverId: string,
  reason: string,
  humanConfirmed: boolean = false
): boolean {
  const request = approvalRequests.get(requestId);
  if (!request) {
    return false;
  }
  
  if (request.status !== 'pending') {
    return false;
  }
  
  request.status = 'approved';
  request.approver = approverId;
  request.approvedAt = new Date().toISOString();
  request.approvalReason = reason;
  request.humanConfirmed = humanConfirmed;
  
  return true;
}

/**
 * 拒绝请求
 */
export function denyRequest(requestId: string, approverId: string, reason: string): boolean {
  const request = approvalRequests.get(requestId);
  if (!request) {
    return false;
  }
  
  request.status = 'denied';
  request.approver = approverId;
  request.approvedAt = new Date().toISOString();
  request.approvalReason = reason;
  
  return true;
}

// ============ 审计日志 ============

/**
 * 记录审计日志
 */
export function recordAuditLog(entry: AuditLogEntry): void {
  auditLogs.push(entry);
  
  // 生产环境应写入数据库或日志系统
  console.log(`📝 Audit: ${entry.auditLog}`);
}

/**
 * 获取审计日志
 */
export function getAuditLogs(options?: {
  agentId?: string;
  toolName?: string;
  riskLevel?: ToolRiskLevel;
  limit?: number;
}): AuditLogEntry[] {
  let logs = auditLogs;
  
  if (options?.agentId) {
    logs = logs.filter(l => l.agentId === options.agentId);
  }
  if (options?.toolName) {
    logs = logs.filter(l => l.toolName === options.toolName);
  }
  if (options?.riskLevel) {
    logs = logs.filter(l => l.riskLevel === options.riskLevel);
  }
  if (options?.limit) {
    logs = logs.slice(-options.limit);
  }
  
  return logs;
}

// ============ 工具函数 ============

/**
 * 获取工具的风险等级
 */
export function getToolRiskLevel(toolName: string): ToolRiskLevel {
  return TOOL_RISK_LEVELS[toolName] || 'write'; // 默认write
}

/**
 * 获取风险等级的中文描述
 */
export function getRiskLevelDescription(level: ToolRiskLevel): string {
  const descriptions: Record<ToolRiskLevel, string> = {
    read: '只读操作，无需审批',
    write: '写入操作，需要上级审批',
    irreversible: '不可逆操作，需要Admin + 人类确认',
  };
  return descriptions[level];
}

/**
 * 导出审计日志到JSON文件
 */
export function exportAuditLogs(filePath: string): void {
  const fs = require('fs');
  const content = JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalLogs: auditLogs.length,
    logs: auditLogs,
  }, null, 2);
  
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`📝 Audit logs exported to ${filePath}`);
}
