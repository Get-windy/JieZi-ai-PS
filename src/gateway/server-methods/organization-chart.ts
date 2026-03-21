/**
 * Organization Chart RPC Handlers
 *
 * 提供组织架构相关的RPC方法：
 * - organization.data.get - 获取完整的组织架构数据
 * 
 * P0.2 新增 RPC 方法：
 * - organization.create - 创建新组织
 * - organization.update - 更新组织信息
 * - organization.delete - 删除组织
 * - organization.member.add - 添加成员
 * - organization.member.update - 更新成员角色/职位
 * - organization.member.remove - 移除成员
 * - organization.relation.create - 创建汇报关系
 * - organization.relation.delete - 删除关系
 * - organization.list - 列出所有组织
 * - organization.tree.get - 获取组织树结构
 * 
 * P0.3 新增 RPC 方法：
 * - organization.agent.recruit.request - 发起招聘请求
 * - organization.agent.recruit.approve - 审批招聘
 * - organization.agent.onboard - 智能助手入职
 */

import type { OpenClawConfig } from "../../../upstream/src/config/types.js";
import type {
  Organization,
  Team,
  CollaborationRelation,
  MentorshipRelation,
  OrganizationMember,
  MemberType,
  MemberRole,
  AgentRecruitRequest,
  AgentOnboardingInfo,
} from "../../organization/types.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import type { PermissionSubject } from "../../config/types.permissions.js";
import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import { organizationStorage } from "../../organization/storage.js";
import { permissionMiddleware } from "../../permissions/middleware.js";

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

  /**
   * organization.create - 创建新组织 (P0.2)
   */
  "organization.create": async ({ params, respond, ctx }) => {
    try {
      const name = params?.name ? String(params.name) : "";
      const type = params?.type
        ? String(params.type)
        : ("" as "company" | "department" | "team" | "project");
      const parentId = params?.parentId ? String(params.parentId) : undefined;
      const description = params?.description ? String(params.description) : undefined;
      const industry = params?.industry ? String(params.industry) : undefined;
      const location = params?.location ? String(params.location) : undefined;
      const createdBy = params?.createdBy ? String(params.createdBy) : "system";

      // 验证参数
      if (!name || name.length < 1 || name.length > 100) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "组织名称必须为1-100个字符"),
        );
        return;
      }

      if (!type || !["company", "department", "team", "project"].includes(type)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "无效的组织类型"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.create",
          toolParams: { name, type, parentId },
          metadata: { action: "create" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to create organization",
            ),
          );
          return;
        }
      }

      // 生成组织ID
      const orgId = `org-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      // 创建组织对象
      const newOrg: Organization = {
        id: orgId,
        name,
        level: type === "company" ? "company" : type === "department" ? "department" : "team",
        type: type as "company" | "department" | "team" | "project",
        parentId,
        description,
        industry,
        location,
        memberIds: [],
        members: [],
        childOrgs: [],
        sharedResources: {
          knowledgeBases: [],
          documents: [],
          tools: [],
          workspaces: [],
        },
        createdAt: Date.now(),
        createdBy,
      };

      // 存储到数据库
      const created = await organizationStorage.createOrganization(newOrg);

      respond(true, created, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create organization: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.update - 更新组织信息 (P0.2)
   */
  "organization.update": async ({ params, respond, ctx }) => {
    try {
      const organizationId = params?.organizationId ? String(params.organizationId) : "";
      const name = params?.name ? String(params.name) : undefined;
      const description = params?.description ? String(params.description) : undefined;
      const industry = params?.industry ? String(params.industry) : undefined;
      const location = params?.location ? String(params.location) : undefined;
      const updatedBy = params?.updatedBy ? String(params.updatedBy) : "system";

      if (!organizationId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "组织ID不能为空"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.update",
          toolParams: { organizationId, name, description },
          metadata: { action: "update" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to update organization",
            ),
          );
          return;
        }
      }

      // 从数据库获取组织
      const existing = await organizationStorage.getOrganization(organizationId);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Organization not found: ${organizationId}`),
        );
        return;
      }

      // 更新组织信息
      const updates: Partial<Organization> = {
        name,
        description,
        industry,
        location,
        updatedBy,
      };

      // 移除undefined的字段
      Object.keys(updates).forEach((key) => {
        if (updates[key as keyof typeof updates] === undefined) {
          delete updates[key as keyof typeof updates];
        }
      });

      const updatedOrg = await organizationStorage.updateOrganization(organizationId, updates);

      respond(true, updatedOrg, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to update organization: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.delete - 删除组织 (P0.2)
   */
  "organization.delete": async ({ params, respond, ctx }) => {
    try {
      const organizationId = params?.organizationId ? String(params.organizationId) : "";

      if (!organizationId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "组织ID不能为空"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.delete",
          toolParams: { organizationId },
          metadata: { action: "delete" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to delete organization",
            ),
          );
          return;
        }
      }

      // 检查组织是否存在
      const existing = await organizationStorage.getOrganization(organizationId);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Organization not found: ${organizationId}`),
        );
        return;
      }

      // 级联删除检查 - 检查是否有子组织
      const children = await organizationStorage.getChildOrganizations(organizationId);
      if (children.length > 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Cannot delete organization with ${children.length} child organization(s)`,
          ),
        );
        return;
      }

      // 检查是否有成员
      if (existing.memberIds.length > 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Cannot delete organization with ${existing.memberIds.length} member(s)`,
          ),
        );
        return;
      }

      // 从数据库删除
      const success = await organizationStorage.deleteOrganization(organizationId);

      respond(true, { success, organizationId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to delete organization: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.member.add - 添加成员 (P0.2)
   */
  "organization.member.add": async ({ params, respond, ctx }) => {
    try {
      const organizationId = params?.organizationId ? String(params.organizationId) : "";
      const memberId = params?.memberId ? String(params.memberId) : "";
      const memberType = params?.memberType ? (String(params.memberType) as MemberType) : ("" as MemberType);
      const role = params?.role ? (String(params.role) as MemberRole) : ("" as MemberRole);
      const title = params?.title ? String(params.title) : undefined;
      const reportTo = params?.reportTo ? String(params.reportTo) : undefined;

      if (!organizationId || !memberId || !memberType || !role) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.member.add",
          toolParams: { organizationId, memberId, role },
          metadata: { action: "add_member" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to add member",
            ),
          );
          return;
        }
      }

      // 检查组织是否存在
      const org = await organizationStorage.getOrganization(organizationId);
      if (!org) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Organization not found: ${organizationId}`),
        );
        return;
      }

      const newMember: OrganizationMember = {
        id: memberId,
        type: memberType,
        role,
        title,
        reportTo,
        joinedAt: Date.now(),
      };

      // 添加到组织成员列表
      const updatedOrg = await organizationStorage.addMember(organizationId, newMember);

      respond(true, newMember, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to add member: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.member.update - 更新成员角色/职位 (P0.2)
   */
  "organization.member.update": async ({ params, respond, ctx }) => {
    try {
      const organizationId = params?.organizationId ? String(params.organizationId) : "";
      const memberId = params?.memberId ? String(params.memberId) : "";
      const role = params?.role ? (String(params.role) as MemberRole) : undefined;
      const title = params?.title ? String(params.title) : undefined;
      const reportTo = params?.reportTo ? String(params.reportTo) : undefined;

      if (!organizationId || !memberId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "组织ID和成员ID不能为空"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.member.update",
          toolParams: { organizationId, memberId, role },
          metadata: { action: "update_member" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to update member",
            ),
          );
          return;
        }
      }

      // 更新成员信息
      const updates: Partial<OrganizationMember> = {
        role,
        title,
        reportTo,
      };

      // 移除undefined的字段
      Object.keys(updates).forEach((key) => {
        if (updates[key as keyof typeof updates] === undefined) {
          delete updates[key as keyof typeof updates];
        }
      });

      const updatedOrg = await organizationStorage.updateMember(organizationId, memberId, updates);

      // 查找更新后的成员
      const updatedMember = updatedOrg.members?.find((m) => m.id === memberId);

      respond(true, updatedMember || { id: memberId, ...updates }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to update member: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.member.remove - 移除成员 (P0.2)
   */
  "organization.member.remove": async ({ params, respond, ctx }) => {
    try {
      const organizationId = params?.organizationId ? String(params.organizationId) : "";
      const memberId = params?.memberId ? String(params.memberId) : "";

      if (!organizationId || !memberId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "组织ID和成员ID不能为空"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.member.remove",
          toolParams: { organizationId, memberId },
          metadata: { action: "remove_member" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to remove member",
            ),
          );
          return;
        }
      }

      // 从组织中移除成员
      await organizationStorage.removeMember(organizationId, memberId);

      respond(true, { success: true, organizationId, memberId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to remove member: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.relation.create - 创建汇报关系 (P0.2)
   */
  "organization.relation.create": async ({ params, respond, ctx }) => {
    try {
      const fromMemberId = params?.fromMemberId ? String(params.fromMemberId) : "";
      const toMemberId = params?.toMemberId ? String(params.toMemberId) : "";
      const relationType = params?.relationType
        ? (String(params.relationType) as "supervisor" | "colleague" | "project")
        : ("" as "supervisor" | "colleague" | "project");
      const organizationId = params?.organizationId ? String(params.organizationId) : undefined;
      const createdBy = params?.createdBy ? String(params.createdBy) : "system";

      if (!fromMemberId || !toMemberId || !relationType) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.relation.create",
          toolParams: { fromMemberId, toMemberId, relationType },
          metadata: { action: "create_relation" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to create relation",
            ),
          );
          return;
        }
      }

      const relationId = `relation-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      const newRelation: CollaborationRelation = {
        id: relationId,
        type: relationType,
        fromAgentId: fromMemberId,
        toAgentId: toMemberId,
        organizationId,
        createdAt: Date.now(),
        createdBy,
      };

      // 保存到数据库
      const created = await organizationStorage.createRelation(newRelation);

      respond(true, created, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create relation: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.relation.delete - 删除关系 (P0.2)
   */
  "organization.relation.delete": async ({ payload, respond, ctx }) => {
    try {
      const { relationId } = payload as { relationId: string };

      if (!relationId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.BAD_REQUEST, "关系ID不能为空"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.relation.delete",
          toolParams: { relationId },
          metadata: { action: "delete_relation" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to delete relation",
            ),
          );
          return;
        }
      }

      // 从数据库删除
      const success = await organizationStorage.deleteRelation(relationId);

      respond(true, { success, relationId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to delete relation: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.list - 列出所有组织 (P0.2)
   */
  "organization.list": async ({ payload, respond }) => {
    try {
      const { type, parentId, level } = (payload as { type?: string; parentId?: string; level?: string }) || {};

      // 从数据库获取组织列表
      const organizations = await organizationStorage.listOrganizations({
        type,
        parentId,
        level,
      });

      respond(true, { organizations }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to list organizations: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.tree.get - 获取组织树结构 (P0.2)
   */
  "organization.tree.get": ({ params, respond }) => {
    try {
      const rootOrgId = params?.rootOrgId ? String(params.rootOrgId) : undefined;

      const cfg = loadConfig();
      const data = extractOrganizationData(cfg);
      let tree = buildOrganizationTree(data.organizations);

      // 如果指定了根组织，只返回该子树
      if (rootOrgId) {
        const findSubtree = (nodes: any[]): any | null => {
          for (const node of nodes) {
            if (node.id === rootOrgId) return node;
            if (node.children?.length) {
              const found = findSubtree(node.children);
              if (found) return found;
            }
          }
          return null;
        };
        const subtree = findSubtree(tree);
        tree = subtree ? [subtree] : [];
      }

      respond(true, { tree }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get organization tree: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.agent.recruit.request - 发起招聘请求 (P0.3)
   */
  "organization.agent.recruit.request": async ({ params, respond, ctx }) => {
    try {
      const organizationId = params?.organizationId ? String(params.organizationId) : "";
      const agentTemplate = params?.agentTemplate ? String(params.agentTemplate) : undefined;
      const agentConfig = params?.agentConfig || undefined;
      const position = params?.position ? String(params.position) : "";
      const role = params?.role ? String(params.role) : "member";
      const title = params?.title ? String(params.title) : undefined;
      const requesterId = params?.requesterId ? String(params.requesterId) : "system";
      const requesterType = params?.requesterType ? String(params.requesterType) : "human";

      // 验证参数
      if (!organizationId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "组织ID不能为空"),
        );
        return;
      }

      if (!position || position.length < 1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "职位名称不能为空"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.agent.recruit.request",
          toolParams: { organizationId, position, role },
          metadata: { action: "recruit_request" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to create recruit request",
            ),
          );
          return;
        }
      }

      // 生成招聘请求ID
      const requestId = `recruit-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      // 创建招聘请求对象
      const recruitRequest: AgentRecruitRequest = {
        id: requestId,
        organizationId,
        requesterId,
        requesterType: requesterType as MemberType,
        agentTemplate,
        agentConfig,
        position,
        role: role as MemberRole,
        title,
        status: "pending",
        createdAt: Date.now(),
      };

      // 存储到数据库
      const created = await organizationStorage.createRecruitRequest(recruitRequest);

      respond(true, created, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create recruit request: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.agent.recruit.approve - 审批招聘 (P0.3)
   */
  "organization.agent.recruit.approve": async ({ params, respond, ctx }) => {
    try {
      const requestId = params?.requestId ? String(params.requestId) : "";
      const decision = params?.decision ? String(params.decision) : "";
      const approverId = params?.approverId ? String(params.approverId) : "system";
      const rejectionReason = params?.rejectionReason ? String(params.rejectionReason) : undefined;

      // 验证参数
      if (!requestId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "招聘请求ID不能为空"),
        );
        return;
      }

      if (!decision || !['approved', 'rejected'].includes(decision)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "决策必须是approved或rejected"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.agent.recruit.approve",
          toolParams: { requestId, decision },
          metadata: { action: "recruit_approve" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to approve recruit request",
            ),
          );
          return;
        }
      }

      // 从数据库获取招聘请求
      const request = await organizationStorage.getRecruitRequest(requestId);
      if (!request) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Recruit request not found: ${requestId}`),
        );
        return;
      }

      // 更新招聘请求状态
      const updates: Partial<AgentRecruitRequest> = {
        status: decision === 'approved' ? 'approved' : 'rejected',
        approvedBy: approverId,
        approvedAt: Date.now(),
        rejectionReason: decision === 'rejected' ? rejectionReason : undefined,
      };

      // 如果审批通过，创建智能助手
      if (decision === 'approved') {
        // TODO: 实际创建智能助手
        const agentId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        updates.agentId = agentId;
        
        // TODO: 将助手添加到组织
        // TODO: 发送入职通知
      }

      const updatedRequest = await organizationStorage.updateRecruitRequest(requestId, updates);

      respond(true, updatedRequest, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to approve recruit request: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * organization.agent.onboard - 智能助手入职 (P0.3)
   */
  "organization.agent.onboard": async ({ params, respond, ctx }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : "";
      const organizationId = params?.organizationId ? String(params.organizationId) : "";

      // 验证参数
      if (!agentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "智能助手ID不能为空"),
        );
        return;
      }

      if (!organizationId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "组织ID不能为空"),
        );
        return;
      }

      // 权限检查
      const operator = ctx?.operator as PermissionSubject | undefined;
      if (operator) {
        const verification = await permissionMiddleware.verify({
          subject: operator,
          toolName: "organization.agent.onboard",
          toolParams: { agentId, organizationId },
          metadata: { action: "agent_onboard" },
        });

        if (!verification.allowed) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.PERMISSION_DENIED,
              verification.reason || "Permission denied to onboard agent",
            ),
          );
          return;
        }
      }

      // 创建入职信息对象
      const onboardingInfo: AgentOnboardingInfo = {
        agentId,
        organizationId,
        onboardingTasks: [
          {
            taskId: "task-1",
            description: "学习组织知识库",
            status: "pending",
          },
          {
            taskId: "task-2",
            description: "建立成员联系",
            status: "pending",
          },
          {
            taskId: "task-3",
            description: "熟悉工作流程",
            status: "pending",
          },
        ],
        knowledgeBasesAccessed: [],
        connectionsMade: [],
        startedAt: Date.now(),
      };

      // 存储入职信息到数据库
      const created = await organizationStorage.createOnboardingInfo(onboardingInfo);

      respond(true, created, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to onboard agent: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },
};
