/**
 * Organization Chart RPC Handlers
 *
 * 提供组织架构相关的RPC方法：
 * - organization.data.get - 获取完整的组织架构数据
 */

import type { OpenClawConfig } from "../../config/types.js";
import type {
  Organization,
  Team,
  CollaborationRelation,
  MentorshipRelation,
} from "../../organization/types.js";
import type { GatewayRequestHandlers } from "./types.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { loadConfig } from "../../config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 从配置中提取组织数据
 */
function extractOrganizationData(cfg: OpenClawConfig): {
  organizations: Organization[];
  teams: Team[];
  relations: CollaborationRelation[];
  mentorships: MentorshipRelation[];
} {
  const agents = listAgentEntries(cfg);

  // 存储所有组织结构信息
  const organizationsMap = new Map<string, Organization>();
  const teamsMap = new Map<string, Team>();
  const relationsMap = new Map<string, CollaborationRelation>();
  const mentorshipsMap = new Map<string, MentorshipRelation>();

  // 遍历所有智能助手，提取组织信息
  for (const agent of agents) {
    const agentConfig = agent as any;

    // 提取组织配置
    if (agentConfig.organization) {
      const org = agentConfig.organization;

      // 提取公司信息
      if (org.companyId && !organizationsMap.has(org.companyId)) {
        organizationsMap.set(org.companyId, {
          id: org.companyId,
          name: org.companyName || org.companyId,
          level: "company",
          memberIds: [],
          createdAt: Date.now(),
          createdBy: "system",
        });
      }

      // 提取部门信息
      if (org.departmentId && !organizationsMap.has(org.departmentId)) {
        organizationsMap.set(org.departmentId, {
          id: org.departmentId,
          name: org.departmentName || org.departmentId,
          level: "department",
          parentId: org.companyId,
          memberIds: [],
          createdAt: Date.now(),
          createdBy: "system",
        });
      }

      // 提取团队信息
      if (org.teamId && !teamsMap.has(org.teamId)) {
        teamsMap.set(org.teamId, {
          id: org.teamId,
          name: org.teamName || org.teamId,
          organizationId: org.departmentId || org.companyId || "",
          leaderId: org.supervisorId || "",
          memberIds: [],
          type: "permanent",
          objectives: [],
          sharedResources: {
            workspaces: [],
            knowledgeBases: [],
            tools: [],
          },
          createdAt: Date.now(),
          createdBy: "system",
        });
      }

      // 添加成员到组织和团队
      const agentId = normalizeAgentId(agent.id);

      if (org.companyId && organizationsMap.has(org.companyId)) {
        const company = organizationsMap.get(org.companyId)!;
        if (!company.memberIds.includes(agentId)) {
          company.memberIds.push(agentId);
        }
      }

      if (org.departmentId && organizationsMap.has(org.departmentId)) {
        const dept = organizationsMap.get(org.departmentId)!;
        if (!dept.memberIds.includes(agentId)) {
          dept.memberIds.push(agentId);
        }
      }

      if (org.teamId && teamsMap.has(org.teamId)) {
        const team = teamsMap.get(org.teamId)!;
        if (!team.memberIds.includes(agentId)) {
          team.memberIds.push(agentId);
        }
      }

      // 提取主管关系
      if (org.supervisorId) {
        const relationId = `supervisor_${agentId}_${org.supervisorId}`;
        if (!relationsMap.has(relationId)) {
          relationsMap.set(relationId, {
            id: relationId,
            type: "supervisor",
            fromAgentId: org.supervisorId,
            toAgentId: agentId,
            createdAt: Date.now(),
            createdBy: "system",
          });
        }
      }

      // 提取下属关系
      if (org.subordinateIds && Array.isArray(org.subordinateIds)) {
        for (const subordinateId of org.subordinateIds) {
          const relationId = `supervisor_${agentId}_${subordinateId}`;
          if (!relationsMap.has(relationId)) {
            relationsMap.set(relationId, {
              id: relationId,
              type: "supervisor",
              fromAgentId: agentId,
              toAgentId: subordinateId,
              createdAt: Date.now(),
              createdBy: "system",
            });
          }
        }
      }
    }

    // 提取协作配置
    if (agentConfig.collaboration) {
      const collab = agentConfig.collaboration;
      const agentId = normalizeAgentId(agent.id);

      // 提取同事关系
      if (collab.colleagues && Array.isArray(collab.colleagues)) {
        for (const colleagueId of collab.colleagues) {
          const relationId = `colleague_${agentId}_${colleagueId}`;
          if (!relationsMap.has(relationId)) {
            relationsMap.set(relationId, {
              id: relationId,
              type: "colleague",
              fromAgentId: agentId,
              toAgentId: colleagueId,
              createdAt: Date.now(),
              createdBy: "system",
            });
          }
        }
      }

      // 提取项目协作关系
      if (collab.projectPartners && Array.isArray(collab.projectPartners)) {
        for (const partnerId of collab.projectPartners) {
          const relationId = `project_${agentId}_${partnerId}`;
          if (!relationsMap.has(relationId)) {
            relationsMap.set(relationId, {
              id: relationId,
              type: "project",
              fromAgentId: agentId,
              toAgentId: partnerId,
              createdAt: Date.now(),
              createdBy: "system",
            });
          }
        }
      }

      // 提取师徒关系
      if (collab.mentorId) {
        const mentorshipId = `mentorship_${collab.mentorId}_${agentId}`;
        if (!mentorshipsMap.has(mentorshipId)) {
          mentorshipsMap.set(mentorshipId, {
            id: mentorshipId,
            mentorId: collab.mentorId,
            menteeId: agentId,
            status: "active",
            startDate: Date.now(),
            createdAt: Date.now(),
            createdBy: "system",
          });
        }
      }

      if (collab.menteeIds && Array.isArray(collab.menteeIds)) {
        for (const menteeId of collab.menteeIds) {
          const mentorshipId = `mentorship_${agentId}_${menteeId}`;
          if (!mentorshipsMap.has(mentorshipId)) {
            mentorshipsMap.set(mentorshipId, {
              id: mentorshipId,
              mentorId: agentId,
              menteeId: menteeId,
              status: "active",
              startDate: Date.now(),
              createdAt: Date.now(),
              createdBy: "system",
            });
          }
        }
      }
    }
  }

  return {
    organizations: Array.from(organizationsMap.values()),
    teams: Array.from(teamsMap.values()),
    relations: Array.from(relationsMap.values()),
    mentorships: Array.from(mentorshipsMap.values()),
  };
}

/**
 * 构建组织架构树形结构
 */
function buildOrganizationTree(organizations: Organization[]): any[] {
  // 创建索引
  const orgMap = new Map<string, any>();
  organizations.forEach((org) => {
    orgMap.set(org.id, {
      ...org,
      children: [],
    });
  });

  // 构建树形结构
  const roots: any[] = [];
  orgMap.forEach((org) => {
    if (org.parentId && orgMap.has(org.parentId)) {
      orgMap.get(org.parentId).children.push(org);
    } else {
      roots.push(org);
    }
  });

  return roots;
}

/**
 * RPC 处理器
 */
export const organizationChartHandlers: GatewayRequestHandlers = {
  /**
   * organization.data.get - 获取完整的组织架构数据
   */
  "organization.data.get": ({ respond }) => {
    try {
      const cfg = loadConfig();
      const data = extractOrganizationData(cfg);
      const tree = buildOrganizationTree(data.organizations);

      respond(
        true,
        {
          organizations: data.organizations,
          organizationTree: tree,
          teams: data.teams,
          relations: data.relations,
          mentorships: data.mentorships,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get organization data: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },
};
