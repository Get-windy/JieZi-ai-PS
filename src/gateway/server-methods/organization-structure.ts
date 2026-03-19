// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * 组织架构管理 Gateway RPC Handlers
 *
 * 提供部门、团队管理和组织结构维护功能
 * 数据通过 OrganizationStorageService 持久化到 organization-data.json
 */

import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { organizationStorage } from "../../organization/storage.js";
import type { Organization, OrganizationMember } from "../../organization/types.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const organizationStructureHandlers: GatewayRequestHandlers = {
  /**
   * org.department.create - 创建部门（届履为组织 type=department）
   */
  "org.department.create": async ({ params, respond }) => {
    try {
      const creatorId = normalizeAgentId(String(params.creatorId || ""));
      const name = String(params.name || "");
      const description = params.description ? String(params.description) : undefined;
      const managerId = params.managerId ? normalizeAgentId(String(params.managerId)) : undefined;
      const parentDepartmentId = params.parentDepartmentId
        ? String(params.parentDepartmentId)
        : undefined;

      if (!creatorId || !name) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "creatorId and name are required"),
        );
        return;
      }

      const departmentId = generateId("dept");
      const org: Organization = {
        id: departmentId,
        name,
        level: "department",
        type: "department",
        description,
        managerId,
        parentId: parentDepartmentId,
        memberIds: [],
        createdAt: Date.now(),
        createdBy: creatorId,
      };

      await organizationStorage.createOrganization(org);

      respond(true, {
        success: true,
        departmentId,
        message: `Department "${name}" created`,
        department: org,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * org.team.create - 创建团队（届履为组织 type=team）
   */
  "org.team.create": async ({ params, respond }) => {
    try {
      const creatorId = normalizeAgentId(String(params.creatorId || ""));
      const name = String(params.name || "");
      const description = params.description ? String(params.description) : undefined;
      const departmentId = params.departmentId ? String(params.departmentId) : undefined;
      const leaderId = params.leaderId ? normalizeAgentId(String(params.leaderId)) : undefined;

      if (!creatorId || !name) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "creatorId and name are required"),
        );
        return;
      }

      if (departmentId) {
        const parent = await organizationStorage.getOrganization(departmentId);
        if (!parent) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, `Department ${departmentId} not found`),
          );
          return;
        }
      }

      const teamId = generateId("team");
      const org: Organization = {
        id: teamId,
        name,
        level: "team",
        type: "team",
        description,
        managerId: leaderId,
        parentId: departmentId,
        memberIds: [],
        createdAt: Date.now(),
        createdBy: creatorId,
      };

      await organizationStorage.createOrganization(org);

      respond(true, {
        success: true,
        teamId,
        message: `Team "${name}" created`,
        team: org,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * org.assign_to_department - 分配 agent 到部门，将其加入为成员
   */
  "org.assign_to_department": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const departmentId = String(params.departmentId || "");
      const role = (params.role as OrganizationMember["role"]) || "member";

      if (!operatorId || !agentId || !departmentId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "operatorId, agentId, and departmentId are required",
          ),
        );
        return;
      }

      const department = await organizationStorage.getOrganization(departmentId);
      if (!department) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Department ${departmentId} not found`),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      if (!agent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      const member: OrganizationMember = {
        id: agentId,
        type: "agent",
        role,
        joinedAt: Date.now(),
      };
      await organizationStorage.addMember(departmentId, member);

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
   * org.assign_to_team - 分配 agent 到团队
   */
  "org.assign_to_team": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const teamId = String(params.teamId || "");
      const role = (params.role as OrganizationMember["role"]) || "member";

      if (!operatorId || !agentId || !teamId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "operatorId, agentId, and teamId are required"),
        );
        return;
      }

      const team = await organizationStorage.getOrganization(teamId);
      if (!team) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Team ${teamId} not found`),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      if (!agent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`),
        );
        return;
      }

      const member: OrganizationMember = {
        id: agentId,
        type: "agent",
        role,
        joinedAt: Date.now(),
      };
      await organizationStorage.addMember(teamId, member);

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
   * org.member.remove - 从组织移除成员
   */
  "org.member.remove": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const organizationId = String(params.organizationId || "");

      if (!operatorId || !agentId || !organizationId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "operatorId, agentId, and organizationId are required",
          ),
        );
        return;
      }

      await organizationStorage.removeMember(organizationId, agentId);
      respond(true, {
        success: true,
        message: `Agent ${agentId} removed from organization ${organizationId}`,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * org.set_reporting_line - 设置汇报关系（将上下级关系存入协作关系表）
   */
  "org.set_reporting_line": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const subordinateId = normalizeAgentId(String(params.subordinateId || ""));
      const supervisorId = normalizeAgentId(String(params.supervisorId || ""));
      const organizationId = params.organizationId ? String(params.organizationId) : undefined;

      if (!operatorId || !subordinateId || !supervisorId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "operatorId, subordinateId, and supervisorId are required",
          ),
        );
        return;
      }

      if (subordinateId === supervisorId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "An agent cannot report to themselves"),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const subordinate = agents.find((a) => normalizeAgentId(a.id) === subordinateId);
      const supervisor = agents.find((a) => normalizeAgentId(a.id) === supervisorId);

      if (!subordinate || !supervisor) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Subordinate or supervisor not found"),
        );
        return;
      }

      // 将汇报关系存为 "supervisor" 类型的协作关系，从下属指向上级
      const relationId = generateId("reporting");
      await organizationStorage.createRelation({
        id: relationId,
        type: "supervisor",
        fromAgentId: subordinateId, // 下属
        toAgentId: supervisorId, // 上级
        organizationId,
        description: `${subordinateId} reports to ${supervisorId}`,
        createdAt: Date.now(),
        createdBy: operatorId,
      });

      respond(true, {
        success: true,
        relationId,
        message: `Reporting line set: ${subordinateId} → ${supervisorId}`,
        subordinateId,
        supervisorId,
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

      const result: Record<string, unknown> = { success: true };

      const allOrgs = await organizationStorage.listOrganizations();

      if (includeDepartments) {
        result.departments = allOrgs.filter(
          (o) => o.type === "department" || o.level === "department",
        );
      }

      if (includeTeams) {
        result.teams = allOrgs.filter((o) => o.type === "team" || o.level === "team");
      }

      if (includeReporting) {
        const relations = await organizationStorage.listRelations({ type: "supervisor" });
        result.reportingLines = relations.map((r) => ({
          id: r.id,
          subordinateId: r.fromAgentId,
          supervisorId: r.toAgentId,
          organizationId: r.organizationId,
          createdAt: r.createdAt,
          createdBy: r.createdBy,
        }));
      }

      respond(true, result);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
