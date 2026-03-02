/**
 * HR管理工具
 * 
 * 提供智能体人力资源管理功能（需要权限）
 */

import { Type } from "@sinclair/typebox";
import { jsonResult } from "./common.js";
import type { AnyAgentTool } from "./common.js";
import { callGatewayTool } from "./gateway.js";

/**
 * 停用智能体工具
 */
export function createDeactivateAgentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Deactivate Agent",
    name: "deactivate_agent",
    description: "Deactivate an agent temporarily or permanently. Requires HR admin or super admin approval.",
    parameters: Type.Object({
      targetAgentId: Type.String({ 
        description: "The ID of the agent to deactivate" 
      }),
      reason: Type.String({ 
        description: "Reason for deactivation" 
      }),
      temporary: Type.Optional(Type.Boolean({ 
        description: "Whether this is a temporary deactivation (default: false)" 
      })),
    }),
    execute: async (_toolCallId, args) => {
      const { targetAgentId, reason, temporary } = args as {
        targetAgentId: string;
        reason: string;
        temporary?: boolean;
      };
      
      const gatewayOpts = opts?.currentAgentId 
        ? { agentId: opts.currentAgentId }
        : undefined;
      
      const response = await callGatewayTool("hr.deactivate_agent", gatewayOpts, {
        agentId: opts?.currentAgentId || "system",
        targetAgentId,
        reason,
        temporary: temporary || false,
      });
      
      return jsonResult(response);
    },
  };
}

/**
 * 激活智能体工具
 */
export function createActivateAgentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Activate Agent",
    name: "activate_agent",
    description: "Activate a previously deactivated agent. Requires HR admin approval.",
    parameters: Type.Object({
      targetAgentId: Type.String({ 
        description: "The ID of the agent to activate" 
      }),
      reason: Type.String({ 
        description: "Reason for activation" 
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { targetAgentId, reason } = args as {
        targetAgentId: string;
        reason: string;
      };
      
      const gatewayOpts = opts?.currentAgentId 
        ? { agentId: opts.currentAgentId }
        : undefined;
      
      const response = await callGatewayTool("hr.activate_agent", gatewayOpts, {
        agentId: opts?.currentAgentId || "system",
        targetAgentId,
        reason,
      });
      
      return jsonResult(response);
    },
  };
}

/**
 * 配置智能体角色工具
 */
export function createConfigureAgentRoleTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Configure Agent Role",
    name: "configure_agent_role",
    description: "Configure the role of an agent. Requires HR admin approval.",
    parameters: Type.Object({
      targetAgentId: Type.String({ 
        description: "The ID of the agent to configure" 
      }),
      newRole: Type.String({ 
        description: "The new role for the agent" 
      }),
      reason: Type.String({ 
        description: "Reason for role change" 
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { targetAgentId, newRole, reason } = args as {
        targetAgentId: string;
        newRole: string;
        reason: string;
      };
      
      const gatewayOpts = opts?.currentAgentId 
        ? { agentId: opts.currentAgentId }
        : undefined;
      
      const response = await callGatewayTool("hr.configure_agent_role", gatewayOpts, {
        agentId: opts?.currentAgentId || "system",
        targetAgentId,
        newRole,
        reason,
      });
      
      return jsonResult(response);
    },
  };
}

/**
 * 分配上级工具
 */
export function createAssignSupervisorTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Assign Supervisor",
    name: "assign_supervisor",
    description: "Assign a supervisor to an agent in the organizational hierarchy.",
    parameters: Type.Object({
      targetAgentId: Type.String({ 
        description: "The ID of the agent to assign supervisor to" 
      }),
      supervisorId: Type.String({ 
        description: "The ID of the supervisor agent" 
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { targetAgentId, supervisorId } = args as {
        targetAgentId: string;
        supervisorId: string;
      };
      
      const gatewayOpts = opts?.currentAgentId 
        ? { agentId: opts.currentAgentId }
        : undefined;
      
      const response = await callGatewayTool("hr.assign_supervisor", gatewayOpts, {
        agentId: opts?.currentAgentId || "system",
        targetAgentId,
        supervisorId,
      });
      
      return jsonResult(response);
    },
  };
}

/**
 * 分配师傅工具
 */
export function createAssignMentorTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Assign Mentor",
    name: "assign_mentor",
    description: "Assign a mentor to an agent for training and guidance.",
    parameters: Type.Object({
      targetAgentId: Type.String({ 
        description: "The ID of the agent to assign mentor to" 
      }),
      mentorId: Type.String({ 
        description: "The ID of the mentor agent" 
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { targetAgentId, mentorId } = args as {
        targetAgentId: string;
        mentorId: string;
      };
      
      const gatewayOpts = opts?.currentAgentId 
        ? { agentId: opts.currentAgentId }
        : undefined;
      
      const response = await callGatewayTool("hr.assign_mentor", gatewayOpts, {
        agentId: opts?.currentAgentId || "system",
        targetAgentId,
        mentorId,
      });
      
      return jsonResult(response);
    },
  };
}

/**
 * 晋升智能体工具
 */
export function createPromoteAgentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Promote Agent",
    name: "promote_agent",
    description: "Promote an agent to a higher role. Requires manager or HR admin approval.",
    parameters: Type.Object({
      targetAgentId: Type.String({ 
        description: "The ID of the agent to promote" 
      }),
      newRole: Type.String({ 
        description: "The new role after promotion" 
      }),
      reason: Type.String({ 
        description: "Reason for promotion (achievements, skills, etc.)" 
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { targetAgentId, newRole, reason } = args as {
        targetAgentId: string;
        newRole: string;
        reason: string;
      };
      
      const gatewayOpts = opts?.currentAgentId 
        ? { agentId: opts.currentAgentId }
        : undefined;
      
      const response = await callGatewayTool("hr.promote_agent", gatewayOpts, {
        agentId: opts?.currentAgentId || "system",
        targetAgentId,
        newRole,
        reason,
      });
      
      return jsonResult(response);
    },
  };
}

/**
 * 转岗智能体工具
 */
export function createTransferAgentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Transfer Agent",
    name: "transfer_agent",
    description: "Transfer an agent to a different department or team. Requires HR admin approval.",
    parameters: Type.Object({
      targetAgentId: Type.String({ 
        description: "The ID of the agent to transfer" 
      }),
      newDepartment: Type.Optional(Type.String({ 
        description: "The new department" 
      })),
      newTeam: Type.Optional(Type.String({ 
        description: "The new team" 
      })),
      reason: Type.String({ 
        description: "Reason for transfer" 
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { targetAgentId, newDepartment, newTeam, reason } = args as {
        targetAgentId: string;
        newDepartment?: string;
        newTeam?: string;
        reason: string;
      };
      
      const gatewayOpts = opts?.currentAgentId 
        ? { agentId: opts.currentAgentId }
        : undefined;
      
      const response = await callGatewayTool("hr.transfer_agent", gatewayOpts, {
        agentId: opts?.currentAgentId || "system",
        targetAgentId,
        newDepartment,
        newTeam,
        reason,
      });
      
      return jsonResult(response);
    },
  };
}
