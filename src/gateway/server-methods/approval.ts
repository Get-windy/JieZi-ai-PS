/**
 * 审批流程 Gateway RPC Handlers
 * 
 * 提供审批请求的创建、审批、查询功能
 */

import type { GatewayRequestHandlers } from "./types.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 审批请求状态
 */
type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

/**
 * 审批请求
 */
interface ApprovalRequest {
  id: string;
  requesterId: string;
  requesterName?: string;
  approverId?: string;
  approverName?: string;
  toolName: string;
  toolArgs: Record<string, any>;
  reason: string;
  status: ApprovalStatus;
  approvalLevel: number; // 1-10，数字越大需要的权限越高
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  approverComment?: string;
}

/**
 * 审批请求存储（内存存储，实际应该持久化到数据库）
 */
const approvalRequests = new Map<string, ApprovalRequest>();

/**
 * 生成审批请求ID
 */
function generateApprovalId(): string {
  return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const approvalHandlers: GatewayRequestHandlers = {
  /**
   * approval.create - 创建审批请求
   */
  "approval.create": async ({ params, respond }) => {
    try {
      const requesterId = normalizeAgentId(String(params.requesterId || ""));
      const requesterName = String(params.requesterName || "");
      const approverId = params.approverId ? normalizeAgentId(String(params.approverId)) : undefined;
      const approverName = params.approverName ? String(params.approverName) : undefined;
      const toolName = String(params.toolName || "");
      const toolArgs = (params.toolArgs as Record<string, any>) || {};
      const reason = String(params.reason || "");
      const approvalLevel = typeof params.approvalLevel === "number" ? params.approvalLevel : 5;
      
      if (!requesterId || !toolName) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "requesterId and toolName are required"));
        return;
      }
      
      const approvalId = generateApprovalId();
      const now = Date.now();
      
      const request: ApprovalRequest = {
        id: approvalId,
        requesterId,
        requesterName,
        approverId,
        approverName,
        toolName,
        toolArgs,
        reason,
        status: "pending",
        approvalLevel,
        createdAt: now,
        updatedAt: now,
      };
      
      approvalRequests.set(approvalId, request);
      
      // TODO: 发送通知给审批者
      console.log(`[Approval] Created request ${approvalId} from ${requesterName || requesterId} for ${toolName}`);
      
      respond(true, {
        success: true,
        approvalId,
        message: `Approval request created: ${approvalId}`,
        request,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * approval.approve - 批准审批请求
   */
  "approval.approve": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");
      const approverId = normalizeAgentId(String(params.approverId || ""));
      const comment = String(params.comment || "");
      
      if (!approvalId || !approverId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId and approverId are required"));
        return;
      }
      
      const request = approvalRequests.get(approvalId);
      if (!request) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`));
        return;
      }
      
      if (request.status !== "pending") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} is already ${request.status}`));
        return;
      }
      
      // TODO: 检查审批者权限
      
      const now = Date.now();
      request.status = "approved";
      request.updatedAt = now;
      request.approvedAt = now;
      request.approverId = approverId;
      request.approverComment = comment;
      
      approvalRequests.set(approvalId, request);
      
      // TODO: 执行原始工具调用
      // TODO: 发送通知给请求者
      console.log(`[Approval] Approved ${approvalId} by ${approverId}`);
      
      respond(true, {
        success: true,
        message: `Approval request ${approvalId} approved`,
        request,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * approval.reject - 拒绝审批请求
   */
  "approval.reject": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");
      const approverId = normalizeAgentId(String(params.approverId || ""));
      const comment = String(params.comment || "");
      
      if (!approvalId || !approverId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId and approverId are required"));
        return;
      }
      
      const request = approvalRequests.get(approvalId);
      if (!request) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`));
        return;
      }
      
      if (request.status !== "pending") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} is already ${request.status}`));
        return;
      }
      
      const now = Date.now();
      request.status = "rejected";
      request.updatedAt = now;
      request.rejectedAt = now;
      request.approverId = approverId;
      request.approverComment = comment;
      
      approvalRequests.set(approvalId, request);
      
      // TODO: 发送通知给请求者
      console.log(`[Approval] Rejected ${approvalId} by ${approverId}`);
      
      respond(true, {
        success: true,
        message: `Approval request ${approvalId} rejected`,
        request,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * approval.list_pending - 列出待审批请求
   */
  "approval.list_pending": async ({ params, respond }) => {
    try {
      const approverId = params.approverId ? normalizeAgentId(String(params.approverId)) : undefined;
      
      const pending = Array.from(approvalRequests.values())
        .filter((req) => {
          if (req.status !== "pending") return false;
          if (approverId && req.approverId && req.approverId !== approverId) return false;
          return true;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      
      respond(true, {
        success: true,
        total: pending.length,
        requests: pending,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * approval.get_status - 获取审批状态
   */
  "approval.get_status": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");
      
      if (!approvalId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId is required"));
        return;
      }
      
      const request = approvalRequests.get(approvalId);
      if (!request) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        request,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * approval.cancel - 取消审批请求
   */
  "approval.cancel": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");
      const requesterId = normalizeAgentId(String(params.requesterId || ""));
      
      if (!approvalId || !requesterId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId and requesterId are required"));
        return;
      }
      
      const request = approvalRequests.get(approvalId);
      if (!request) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`));
        return;
      }
      
      if (request.requesterId !== requesterId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Only the requester can cancel the request"));
        return;
      }
      
      if (request.status !== "pending") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} is already ${request.status}`));
        return;
      }
      
      const now = Date.now();
      request.status = "cancelled";
      request.updatedAt = now;
      
      approvalRequests.set(approvalId, request);
      
      console.log(`[Approval] Cancelled ${approvalId} by ${requesterId}`);
      
      respond(true, {
        success: true,
        message: `Approval request ${approvalId} cancelled`,
        request,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
