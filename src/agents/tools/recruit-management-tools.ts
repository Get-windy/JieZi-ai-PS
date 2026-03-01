/**
 * 招聘管理工具
 * 
 * 提供智能体招聘和审批的工具
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readStringArrayParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

/**
 * recruit_agent 工具参数 schema
 */
const RecruitAgentToolSchema = Type.Object({
  /** 组织ID（必填） */
  organizationId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 招聘职位/角色（必填） */
  position: Type.String({ minLength: 1, maxLength: 128 }),
  /** 职位描述（可选） */
  description: Type.Optional(Type.String()),
  /** 需要的技能列表（可选） */
  requiredSkills: Type.Optional(Type.Array(Type.String())),
  /** 招聘理由（可选） */
  reason: Type.Optional(Type.String()),
  /** 预期角色（可选：member, admin） */
  expectedRole: Type.Optional(Type.Union([Type.Literal("member"), Type.Literal("admin")])),
});

/**
 * approve_recruit 工具参数 schema
 */
const ApproveRecruitToolSchema = Type.Object({
  /** 招聘请求ID（必填） */
  requestId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 审批决定（必填：approved 或 rejected） */
  decision: Type.Union([Type.Literal("approved"), Type.Literal("rejected")]),
  /** 审批备注（可选） */
  comment: Type.Optional(Type.String()),
  /** 拒绝理由（decision为rejected时建议填写） */
  rejectionReason: Type.Optional(Type.String()),
});

/**
 * recruit_list 工具参数 schema
 */
const RecruitListToolSchema = Type.Object({
  /** 组织ID（可选，过滤特定组织的招聘） */
  organizationId: Type.Optional(Type.String()),
  /** 状态过滤（可选：pending, approved, rejected） */
  status: Type.Optional(
    Type.Union([Type.Literal("pending"), Type.Literal("approved"), Type.Literal("rejected")]),
  ),
});

/**
 * 创建招聘智能体工具
 */
export function createRecruitAgentTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Recruit Agent",
    name: "recruit_agent",
    description:
      "Submit a recruitment request to hire a new agent for an organization. Specify position, required skills, and reason. The request will be pending approval by organization owners/admins.",
    parameters: RecruitAgentToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const organizationId = readStringParam(params, "organizationId", { required: true });
      const position = readStringParam(params, "position", { required: true });
      const description = readStringParam(params, "description");
      const requiredSkills = readStringArrayParam(params, "requiredSkills") || [];
      const reason = readStringParam(params, "reason");
      const expectedRole = readStringParam(params, "expectedRole") as "member" | "admin" | undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 organization.agent.recruit RPC
        const response = await callGatewayTool("organization.agent.recruit", gatewayOpts, {
          organizationId,
          position,
          description,
          requiredSkills,
          reason,
          expectedRole: expectedRole || "member",
          requestedBy: opts?.currentAgentId,
        });

        const request = response as any;

        return jsonResult({
          success: true,
          message: `Recruitment request for "${position}" submitted successfully`,
          request: {
            requestId: request.requestId || request.id,
            organizationId,
            position,
            description,
            requiredSkills,
            status: "pending",
            requestedBy: opts?.currentAgentId,
            requestedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to submit recruitment request: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建审批招聘工具
 */
export function createApproveRecruitTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Approve Recruit",
    name: "approve_recruit",
    description:
      "Approve or reject a recruitment request. If approved, a new agent will be created and added to the organization. Requires owner or admin permissions.",
    parameters: ApproveRecruitToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestId = readStringParam(params, "requestId", { required: true });
      const decision = readStringParam(params, "decision", { required: true }) as "approved" | "rejected";
      const comment = readStringParam(params, "comment");
      const rejectionReason = readStringParam(params, "rejectionReason");
      const gatewayOpts = readGatewayCallOptions(params);

      if (decision !== "approved" && decision !== "rejected") {
        return jsonResult({
          success: false,
          error: "Decision must be either 'approved' or 'rejected'",
        });
      }

      if (decision === "rejected" && !rejectionReason && !comment) {
        return jsonResult({
          success: false,
          error: "Rejection reason or comment is required when rejecting a request",
        });
      }

      try {
        // 调用 organization.agent.recruit.approve RPC
        const response = await callGatewayTool("organization.agent.recruit.approve", gatewayOpts, {
          requestId,
          decision,
          comment,
          rejectionReason: decision === "rejected" ? rejectionReason || comment : undefined,
          approvedBy: opts?.currentAgentId,
        });

        const result = response as any;

        if (decision === "approved") {
          return jsonResult({
            success: true,
            message: `Recruitment request approved. Agent "${result.agentId || 'new-agent'}" has been created and onboarded.`,
            result: {
              requestId,
              decision,
              agentId: result.agentId,
              approvedBy: opts?.currentAgentId,
              approvedAt: Date.now(),
            },
          });
        } else {
          return jsonResult({
            success: true,
            message: `Recruitment request rejected`,
            result: {
              requestId,
              decision,
              rejectionReason: rejectionReason || comment,
              rejectedBy: opts?.currentAgentId,
              rejectedAt: Date.now(),
            },
          });
        }
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to approve recruitment: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建列出招聘请求工具
 */
export function createRecruitListTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Recruit List",
    name: "recruit_list",
    description:
      "List all recruitment requests, optionally filtered by organization or status (pending/approved/rejected). Returns request details including position, skills, and status.",
    parameters: RecruitListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const organizationId = readStringParam(params, "organizationId");
      const status = readStringParam(params, "status") as "pending" | "approved" | "rejected" | undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 organization.agent.recruit.list RPC
        const response = await callGatewayTool("organization.agent.recruit.list", gatewayOpts, {
          organizationId,
          status,
        });

        const requests = (response as any)?.requests || [];

        return jsonResult({
          success: true,
          message: `Found ${requests.length} recruitment request(s)`,
          requests: requests.map((req: any) => ({
            requestId: req.requestId || req.id,
            organizationId: req.organizationId,
            position: req.position,
            description: req.description,
            requiredSkills: req.requiredSkills,
            status: req.status,
            requestedBy: req.requestedBy,
            requestedAt: req.requestedAt,
            agentId: req.agentId,
            approvedBy: req.approvedBy,
            approvedAt: req.approvedAt,
            rejectionReason: req.rejectionReason,
          })),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list recruitment requests: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
