/**
 * 审批流程工具
 *
 * 提供审批请求的创建、审批、查询功能
 */

import { Type } from "@sinclair/typebox";
import { jsonResult } from "../../../upstream/src/agents/tools/common.js";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { callGatewayTool } from "../../../upstream/src/agents/tools/gateway.js";

/**
 * 创建审批请求工具
 */
export function createApprovalRequestTool(opts?: {
  currentAgentId?: string;
  currentAgentName?: string;
}): AnyAgentTool {
  return {
    label: "Create Approval Request",
    name: "create_approval_request",
    description:
      "Create an approval request for an operation that requires approval from a supervisor or admin.",
    parameters: Type.Object({
      toolName: Type.String({
        description: "The name of the tool that requires approval",
      }),
      toolArgs: Type.Object(
        {},
        {
          description: "The arguments for the tool call",
          additionalProperties: true,
        },
      ),
      reason: Type.String({
        description: "Reason for requesting this operation",
      }),
      approverId: Type.Optional(
        Type.String({
          description: "Optional: specific approver ID (supervisor or admin)",
        }),
      ),
      approvalLevel: Type.Optional(
        Type.Number({
          description: "Approval level required (1-10, higher = more authority needed)",
          minimum: 1,
          maximum: 10,
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { toolName, toolArgs, reason, approverId, approvalLevel } = args as {
        toolName: string;
        toolArgs: Record<string, unknown>;
        reason: string;
        approverId?: string;
        approvalLevel?: number;
      };

      const gatewayOpts = opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined;

      const response = await callGatewayTool("approval.create", gatewayOpts, {
        requesterId: opts?.currentAgentId || "system",
        requesterName: opts?.currentAgentName || opts?.currentAgentId || "system",
        toolName,
        toolArgs,
        reason,
        approverId,
        approvalLevel,
      });

      return jsonResult(response);
    },
  };
}

/**
 * 批准审批请求工具
 */
export function createApproveRequestTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Approve Request",
    name: "approve_request",
    description: "Approve a pending approval request. Requires appropriate authority level.",
    parameters: Type.Object({
      approvalId: Type.String({
        description: "The ID of the approval request to approve",
      }),
      comment: Type.Optional(
        Type.String({
          description: "Optional comment for the approval",
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { approvalId, comment } = args as {
        approvalId: string;
        comment?: string;
      };

      const gatewayOpts = opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined;

      const response = await callGatewayTool("approval.approve", gatewayOpts, {
        approvalId,
        approverId: opts?.currentAgentId || "system",
        comment: comment || "",
      });

      return jsonResult(response);
    },
  };
}

/**
 * 拒绝审批请求工具
 */
export function createRejectRequestTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Reject Request",
    name: "reject_request",
    description: "Reject a pending approval request. Requires appropriate authority level.",
    parameters: Type.Object({
      approvalId: Type.String({
        description: "The ID of the approval request to reject",
      }),
      comment: Type.String({
        description: "Reason for rejection",
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { approvalId, comment } = args as {
        approvalId: string;
        comment: string;
      };

      const gatewayOpts = opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined;

      const response = await callGatewayTool("approval.reject", gatewayOpts, {
        approvalId,
        approverId: opts?.currentAgentId || "system",
        comment,
      });

      return jsonResult(response);
    },
  };
}

/**
 * 列出待审批请求工具
 */
export function createListPendingApprovalsTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "List Pending Approvals",
    name: "list_pending_approvals",
    description: "List all pending approval requests. Optionally filter by approver.",
    parameters: Type.Object({
      approverId: Type.Optional(
        Type.String({
          description: "Optional: filter by specific approver ID",
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { approverId } = args as {
        approverId?: string;
      };

      const gatewayOpts = opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined;

      const response = await callGatewayTool("approval.list_pending", gatewayOpts, {
        approverId,
      });

      return jsonResult(response);
    },
  };
}

/**
 * 获取审批状态工具
 */
export function createGetApprovalStatusTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Get Approval Status",
    name: "get_approval_status",
    description: "Get the status of a specific approval request.",
    parameters: Type.Object({
      approvalId: Type.String({
        description: "The ID of the approval request",
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { approvalId } = args as {
        approvalId: string;
      };

      const gatewayOpts = opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined;

      const response = await callGatewayTool("approval.get_status", gatewayOpts, {
        approvalId,
      });

      return jsonResult(response);
    },
  };
}

/**
 * 取消审批请求工具
 */
export function createCancelApprovalRequestTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Cancel Approval Request",
    name: "cancel_approval_request",
    description:
      "Cancel a pending approval request. Only the requester can cancel their own requests.",
    parameters: Type.Object({
      approvalId: Type.String({
        description: "The ID of the approval request to cancel",
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { approvalId } = args as {
        approvalId: string;
      };

      const gatewayOpts = opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined;

      const response = await callGatewayTool("approval.cancel", gatewayOpts, {
        approvalId,
        requesterId: opts?.currentAgentId || "system",
      });

      return jsonResult(response);
    },
  };
}
