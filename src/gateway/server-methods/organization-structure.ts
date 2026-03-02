/**
 * 组织架构管理 Gateway RPC Handlers
 * 
 * 提供部门、团队管理和组织结构维护功能
 */

import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 部门信息
 */
interface Department {
  id: string;
  name: string;
  description?: string;
  managerId?: string;
  parentDepartmentId?: string;
  createdAt: number;
  createdBy: string;
}

/**
 * 团队信息
 */
interface Team {
  id: string;
  name: string;
  description?: string;
  departmentId?: string;
  leaderId?: string;
  memberIds: string[];
  createdAt: number;
  createdBy: string;
}

/**
 * 汇报关系
 */
interface ReportingLine {
  id: string;
  subordinateId: string;
  supervisorId: string;
  effectiveFrom: number;
  effectiveUntil?: number;
  createdBy: string;
}

// 内存存储（生产环境应持久化）
const departments = new Map<string, Department>();
const teams = new Map<string, Team>();
const reportingLines = new Map<string, ReportingLine>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const organizationStructureHandlers: GatewayRequestHandlers = {
  /**
   * org.department.create - 创建部门
   */
  "org.department.create": async ({ params, respond }) => {
    try {
      const creatorId = normalizeAgentId(String(params.creatorId || ""));
      const name = String(params.name || "");
      const description = String(params.description || "");
      const managerId = params.managerId ? normalizeAgentId(String(params.managerId)) : undefined;
      const parentDepartmentId = params.parentDepartmentId ? String(params.parentDepartmentId) : undefined;
      
      if (!creatorId || !name) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "creatorId and name are required"));
        return;
      }
      
      if (parentDepartmentId && !departments.has(parentDepartmentId)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Parent department ${parentDepartmentId} not found`));
        return;
      }
      
      const departmentId = generateId("dept");
      const department: Department = {
        id: departmentId,
        name,
        description,
        managerId,
        parentDepartmentId,
        createdAt: Date.now(),
        createdBy: creatorId,
      };
      
      departments.set(departmentId, department);
      
      respond(true, {
        success: true,
        departmentId,
        message: `Department "${name}" created`,
        department,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * org.team.create - 创建团队
   */
  "org.team.create": async ({ params, respond }) => {
    try {
      const creatorId = normalizeAgentId(String(params.creatorId || ""));
      const name = String(params.name || "");
      const description = String(params.description || "");
      const departmentId = params.departmentId ? String(params.departmentId) : undefined;
      const leaderId = params.leaderId ? normalizeAgentId(String(params.leaderId)) : undefined;
      
      if (!creatorId || !name) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "creatorId and name are required"));
        return;
      }
      
      if (departmentId && !departments.has(departmentId)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Department ${departmentId} not found`));
        return;
      }
      
      const teamId = generateId("team");
      const team: Team = {
        id: teamId,
        name,
        description,
        departmentId,
        leaderId,
        memberIds: [],
        createdAt: Date.now(),
        createdBy: creatorId,
      };
      
      teams.set(teamId, team);
      
      respond(true, {
        success: true,
        teamId,
        message: `Team "${name}" created`,
        team,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * org.assign_to_department - 分配到部门
   */
  "org.assign_to_department": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const departmentId = String(params.departmentId || "");
      
      if (!operatorId || !agentId || !departmentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "operatorId, agentId, and departmentId are required"));
        return;
      }
      
      const department = departments.get(departmentId);
      if (!department) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Department ${departmentId} not found`));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      
      if (!agent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Agent ${agentId} assigned to department "${department.name}"`,
        agentId,
        departmentId,
        departmentName: department.name,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * org.assign_to_team - 分配到团队
   */
  "org.assign_to_team": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const teamId = String(params.teamId || "");
      
      if (!operatorId || !agentId || !teamId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "operatorId, agentId, and teamId are required"));
        return;
      }
      
      const team = teams.get(teamId);
      if (!team) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Team ${teamId} not found`));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      
      if (!agent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      // 添加成员到团队
      if (!team.memberIds.includes(agentId)) {
        team.memberIds.push(agentId);
        teams.set(teamId, team);
      }
      
      respond(true, {
        success: true,
        message: `Agent ${agentId} assigned to team "${team.name}"`,
        agentId,
        teamId,
        teamName: team.name,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * org.set_reporting_line - 设置汇报关系
   */
  "org.set_reporting_line": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const subordinateId = normalizeAgentId(String(params.subordinateId || ""));
      const supervisorId = normalizeAgentId(String(params.supervisorId || ""));
      const effectiveFrom = typeof params.effectiveFrom === "number" ? params.effectiveFrom : Date.now();
      
      if (!operatorId || !subordinateId || !supervisorId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "operatorId, subordinateId, and supervisorId are required"));
        return;
      }
      
      if (subordinateId === supervisorId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "An agent cannot report to themselves"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const subordinate = agents.find((a) => normalizeAgentId(a.id) === subordinateId);
      const supervisor = agents.find((a) => normalizeAgentId(a.id) === supervisorId);
      
      if (!subordinate || !supervisor) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Subordinate or supervisor not found"));
        return;
      }
      
      const reportingLineId = generateId("reporting");
      const reportingLine: ReportingLine = {
        id: reportingLineId,
        subordinateId,
        supervisorId,
        effectiveFrom,
        createdBy: operatorId,
      };
      
      reportingLines.set(reportingLineId, reportingLine);
      
      respond(true, {
        success: true,
        reportingLineId,
        message: `Reporting line set: ${subordinateId} → ${supervisorId}`,
        reportingLine,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * org.list - 列出组织结构
   */
  "org.list": async ({ params, respond }) => {
    try {
      const includeTeams = params.includeTeams !== false;
      const includeDepartments = params.includeDepartments !== false;
      const includeReporting = params.includeReporting !== false;
      
      const result: Record<string, any> = {
        success: true,
      };
      
      if (includeDepartments) {
        result.departments = Array.from(departments.values());
      }
      
      if (includeTeams) {
        result.teams = Array.from(teams.values());
      }
      
      if (includeReporting) {
        result.reportingLines = Array.from(reportingLines.values());
      }
      
      respond(true, result);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
