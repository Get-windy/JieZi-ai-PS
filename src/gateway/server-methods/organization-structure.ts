// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * 组织架构管理 Gateway RPC Handlers
 *
 * 提供部门、团队管理和组织结构维护功能
 * 数据通过 OrganizationStorageService 持久化到 organization-data.json
 */

import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { organizationStorage } from "../../organization/storage.js";
import type { Organization, OrganizationMember } from "../../organization/types.js";
import { normalizeAgentId } from "../../routing/session-key.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 从 params 安全解析部门沙箱配置（sandboxConfig）
 * 支持 Agent 通过 RPC 创建/更新部门时携带 sandboxConfig。
 */
function parseSandboxConfig(raw: unknown): Organization["sandboxConfig"] | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const r = raw as Record<string, unknown>;

  const toolPolicy =
    r.toolPolicy && typeof r.toolPolicy === "object"
      ? (() => {
          const tp = r.toolPolicy as Record<string, unknown>;
          return {
            allow: Array.isArray(tp.allow) ? (tp.allow as string[]) : undefined,
            deny: Array.isArray(tp.deny) ? (tp.deny as string[]) : undefined,
          };
        })()
      : undefined;

  const resourceQuota =
    r.resourceQuota && typeof r.resourceQuota === "object"
      ? (() => {
          const rq = r.resourceQuota as Record<string, unknown>;
          return {
            memory: rq.memory ? String(rq.memory) : undefined,
            cpus: typeof rq.cpus === "number" ? rq.cpus : undefined,
            pidsLimit: typeof rq.pidsLimit === "number" ? rq.pidsLimit : undefined,
          };
        })()
      : undefined;

  const crossDeptBindMounts = Array.isArray(r.crossDeptBindMounts)
    ? (r.crossDeptBindMounts as unknown[]).reduce<
        NonNullable<NonNullable<Organization["sandboxConfig"]>["crossDeptBindMounts"]>
      >((acc, item) => {
        if (item && typeof item === "object") {
          const m = item as Record<string, unknown>;
          if (m.sourceDeptId && m.mountPath) {
            acc.push({
              sourceDeptId: String(m.sourceDeptId),
              mountPath: String(m.mountPath),
              // 对抗3：即使传 rw 也记录，实际执行时强制降级为 ro
              access: m.access === "rw" ? "rw" : "ro",
            });
          }
        }
        return acc;
      }, [])
    : undefined;

  return {
    enabled: r.enabled !== false, // 默认 true
    containerPrefixHint: r.containerPrefixHint ? String(r.containerPrefixHint) : undefined,
    workspaceRoot: r.workspaceRoot ? String(r.workspaceRoot) : undefined,
    network: r.network ? String(r.network) : undefined,
    image: r.image ? String(r.image) : undefined,
    toolPolicy,
    resourceQuota,
    crossDeptBindMounts,
  };
}

export const organizationStructureHandlers: GatewayRequestHandlers = {
  /**
   * org.department.create - 创建部门（届履为组织 type=department）
   * 支持携带 sandboxConfig 创建隔离部门。
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
      const sandboxConfig = parseSandboxConfig(params.sandboxConfig);

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
        sandboxConfig,
        createdAt: Date.now(),
        createdBy: creatorId,
      };

      await organizationStorage.createOrganization(org);

      respond(true, {
        success: true,
        departmentId,
        message: `Department "${name}" created${
          sandboxConfig?.enabled ? " with sandbox isolation" : ""
        }`,
        department: org,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * org.department.update_sandbox - 更新部门沙箱配置
   */
  "org.department.update_sandbox": async ({ params, respond }) => {
    try {
      const operatorId = normalizeAgentId(String(params.operatorId || ""));
      const departmentId = String(params.departmentId || "");

      if (!operatorId || !departmentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "operatorId and departmentId are required"),
        );
        return;
      }

      const dept = await organizationStorage.getOrganization(departmentId);
      if (!dept) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Department ${departmentId} not found`),
        );
        return;
      }
      if (dept.type !== "department") {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Organization ${departmentId} is not a department (type=${dept.type})`,
          ),
        );
        return;
      }

      const sandboxConfig = parseSandboxConfig(params.sandboxConfig);
      await organizationStorage.updateOrganization(departmentId, {
        sandboxConfig,
        updatedBy: operatorId,
      });

      respond(true, {
        success: true,
        departmentId,
        message: `Sandbox config updated for department "${dept.name}"`,
        sandboxEnabled: sandboxConfig?.enabled ?? false,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * org.department.sandbox_info - 查询部门沙箱配置摘要
   */
  "org.department.sandbox_info": async ({ params, respond }) => {
    try {
      const departmentId = String(params.departmentId || "");
      if (!departmentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "departmentId is required"),
        );
        return;
      }

      const { getDeptSandboxSummary } =
        await import("../../agents/sandbox/dept-sandbox-resolver.js");
      const summary = await getDeptSandboxSummary(departmentId);
      if (!summary) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Department ${departmentId} not found`),
        );
        return;
      }

      respond(true, { success: true, ...summary });
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
