/**
 * 权限管理工具实现
 */

import { Type } from "@sinclair/typebox";
import { jsonResult } from "../../../upstream/src/agents/tools/common.js";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { callGatewayTool } from "../../../upstream/src/agents/tools/gateway.js";

export function createPerm_GrantTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Grant Permission",
    name: "grant_permission",
    description: "Grant a permission to an agent. Requires admin privileges.",
    parameters: Type.Object({
      targetId: Type.String({ description: "The ID of the agent to grant permission to" }),
      permission: Type.String({ description: "The permission to grant" }),
      scope: Type.Optional(Type.String({ description: "Permission scope (default: 'all')" })),
      reason: Type.Optional(Type.String({ description: "Reason for granting" })),
    }),
    execute: async (_toolCallId, args) => {
      const { targetId, permission, scope, reason } = args as {
        targetId: string;
        permission: string;
        scope?: string;
        reason?: string;
      };
      const response = await callGatewayTool("permission_mgmt.grant", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        operatorId: opts?.currentAgentId || "system",
        targetId,
        permission,
        scope: scope || "all",
        reason: reason || "",
      });
      return jsonResult(response);
    },
  };
}

export function createPerm_RevokeTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Revoke Permission",
    name: "revoke_permission",
    description: "Revoke a permission from an agent. Requires admin privileges.",
    parameters: Type.Object({
      targetId: Type.String({ description: "The ID of the agent to revoke permission from" }),
      permission: Type.String({ description: "The permission to revoke" }),
      reason: Type.Optional(Type.String({ description: "Reason for revoking" })),
    }),
    execute: async (_toolCallId, args) => {
      const { targetId, permission, reason } = args as {
        targetId: string;
        permission: string;
        reason?: string;
      };
      const response = await callGatewayTool("permission_mgmt.revoke", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        operatorId: opts?.currentAgentId || "system",
        targetId,
        permission,
        reason: reason || "",
      });
      return jsonResult(response);
    },
  };
}

export function createPerm_DelegateTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Delegate Permission",
    name: "delegate_permission",
    description: "Temporarily delegate a permission to another agent.",
    parameters: Type.Object({
      targetId: Type.String({ description: "The ID of the agent to delegate to" }),
      permission: Type.String({ description: "The permission to delegate" }),
      duration: Type.Optional(Type.Number({ description: "Duration in milliseconds (default: 1 hour)" })),
      reason: Type.Optional(Type.String({ description: "Reason for delegation" })),
    }),
    execute: async (_toolCallId, args) => {
      const { targetId, permission, duration, reason } = args as {
        targetId: string;
        permission: string;
        duration?: number;
        reason?: string;
      };
      const response = await callGatewayTool("permission_mgmt.delegate", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        operatorId: opts?.currentAgentId || "system",
        targetId,
        permission,
        duration: duration || 3600000,
        reason: reason || "",
      });
      return jsonResult(response);
    },
  };
}

export function createPerm_CheckTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Check Permission",
    name: "check_permission",
    description: "Check if an agent has a specific permission.",
    parameters: Type.Object({
      agentId: Type.String({ description: "The ID of the agent to check" }),
      permission: Type.String({ description: "The permission to check" }),
      context: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Additional context" })),
    }),
    execute: async (_toolCallId, args) => {
      const { agentId, permission, context } = args as {
        agentId: string;
        permission: string;
        context?: Record<string, any>;
      };
      const response = await callGatewayTool("permission_mgmt.check", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        agentId,
        permission,
        context: context || {},
      });
      return jsonResult(response);
    },
  };
}

export function createPerm_ListTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Permission List",
    name: "permission_list",
    description: "List all permissions for an agent.",
    parameters: Type.Object({
      agentId: Type.String({ description: "The ID of the agent" }),
    }),
    execute: async (_toolCallId, args) => {
      const { agentId } = args as { agentId: string };
      const response = await callGatewayTool("permission_mgmt.list", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        agentId,
      });
      return jsonResult(response);
    },
  };
}

export function createPerm_AuditTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Audit Permission Changes",
    name: "audit_permission_changes",
    description: "Audit permission changes with optional filters.",
    parameters: Type.Object({
      targetId: Type.Optional(Type.String({ description: "Filter by target agent ID" })),
      operatorId: Type.Optional(Type.String({ description: "Filter by operator ID" })),
      operation: Type.Optional(Type.String({ description: "Filter by operation type" })),
      startTime: Type.Optional(Type.Number({ description: "Start time timestamp" })),
      endTime: Type.Optional(Type.Number({ description: "End time timestamp" })),
    }),
    execute: async (_toolCallId, args) => {
      const { targetId, operatorId, operation, startTime, endTime } = args as {
        targetId?: string;
        operatorId?: string;
        operation?: string;
        startTime?: number;
        endTime?: number;
      };
      const response = await callGatewayTool("permission_mgmt.audit", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        targetId,
        operatorId,
        operation,
        startTime,
        endTime,
      });
      return jsonResult(response);
    },
  };
}
