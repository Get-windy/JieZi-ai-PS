/**
 * 组织架构管理工具
 */

import { Type } from "@sinclair/typebox";
import { jsonResult } from "./common.js";
import type { AnyAgentTool } from "./common.js";
import { callGatewayTool } from "./gateway.js";

export function createOrgDepartmentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Create Department",
    name: "create_department",
    description: "Create a new department in the organization.",
    parameters: Type.Object({
      name: Type.String({ description: "Department name" }),
      description: Type.Optional(Type.String({ description: "Department description" })),
      managerId: Type.Optional(Type.String({ description: "Department manager ID" })),
      parentDepartmentId: Type.Optional(Type.String({ description: "Parent department ID" })),
    }),
    execute: async (_toolCallId, args) => {
      const { name, description, managerId, parentDepartmentId } = args as {
        name: string;
        description?: string;
        managerId?: string;
        parentDepartmentId?: string;
      };
      const response = await callGatewayTool("org.department.create", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        creatorId: opts?.currentAgentId || "system",
        name,
        description: description || "",
        managerId,
        parentDepartmentId,
      });
      return jsonResult(response);
    },
  };
}

export function createOrgTeamTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Create Team",
    name: "create_team",
    description: "Create a new team in the organization.",
    parameters: Type.Object({
      name: Type.String({ description: "Team name" }),
      description: Type.Optional(Type.String({ description: "Team description" })),
      departmentId: Type.Optional(Type.String({ description: "Department ID" })),
      leaderId: Type.Optional(Type.String({ description: "Team leader ID" })),
    }),
    execute: async (_toolCallId, args) => {
      const { name, description, departmentId, leaderId } = args as {
        name: string;
        description?: string;
        departmentId?: string;
        leaderId?: string;
      };
      const response = await callGatewayTool("org.team.create", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        creatorId: opts?.currentAgentId || "system",
        name,
        description: description || "",
        departmentId,
        leaderId,
      });
      return jsonResult(response);
    },
  };
}

export function createOrgAssignToDepartmentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Assign to Department",
    name: "assign_to_department",
    description: "Assign an agent to a department.",
    parameters: Type.Object({
      agentId: Type.String({ description: "The ID of the agent to assign" }),
      departmentId: Type.String({ description: "The ID of the department" }),
    }),
    execute: async (_toolCallId, args) => {
      const { agentId, departmentId } = args as { agentId: string; departmentId: string };
      const response = await callGatewayTool("org.assign_to_department", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        operatorId: opts?.currentAgentId || "system",
        agentId,
        departmentId,
      });
      return jsonResult(response);
    },
  };
}

export function createOrgAssignToTeamTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Assign to Team",
    name: "assign_to_team",
    description: "Assign an agent to a team.",
    parameters: Type.Object({
      agentId: Type.String({ description: "The ID of the agent to assign" }),
      teamId: Type.String({ description: "The ID of the team" }),
    }),
    execute: async (_toolCallId, args) => {
      const { agentId, teamId } = args as { agentId: string; teamId: string };
      const response = await callGatewayTool("org.assign_to_team", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        operatorId: opts?.currentAgentId || "system",
        agentId,
        teamId,
      });
      return jsonResult(response);
    },
  };
}

export function createOrgSetReportingLineTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Set Reporting Line",
    name: "set_reporting_line",
    description: "Set the reporting line (subordinate -> supervisor relationship).",
    parameters: Type.Object({
      subordinateId: Type.String({ description: "The ID of the subordinate agent" }),
      supervisorId: Type.String({ description: "The ID of the supervisor agent" }),
      effectiveFrom: Type.Optional(Type.Number({ description: "Effective from timestamp" })),
    }),
    execute: async (_toolCallId, args) => {
      const { subordinateId, supervisorId, effectiveFrom } = args as {
        subordinateId: string;
        supervisorId: string;
        effectiveFrom?: number;
      };
      const response = await callGatewayTool("org.set_reporting_line", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        operatorId: opts?.currentAgentId || "system",
        subordinateId,
        supervisorId,
        effectiveFrom,
      });
      return jsonResult(response);
    },
  };
}

export function createOrgStructureListTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Organization List",
    name: "organization_list",
    description: "List organization structure (departments, teams, reporting lines).",
    parameters: Type.Object({
      includeDepartments: Type.Optional(Type.Boolean({ description: "Include departments (default: true)" })),
      includeTeams: Type.Optional(Type.Boolean({ description: "Include teams (default: true)" })),
      includeReporting: Type.Optional(Type.Boolean({ description: "Include reporting lines (default: true)" })),
    }),
    execute: async (_toolCallId, args) => {
      const { includeDepartments, includeTeams, includeReporting } = args as {
        includeDepartments?: boolean;
        includeTeams?: boolean;
        includeReporting?: boolean;
      };
      const response = await callGatewayTool("org.list", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        includeDepartments,
        includeTeams,
        includeReporting,
      });
      return jsonResult(response);
    },
  };
}
