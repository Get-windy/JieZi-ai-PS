/**
 * 组织管理工具
 * 
 * 提供创建、管理组织和成员的工具
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam, readStringArrayParam } from "../../../upstream/src/agents/tools/common.js";
import { callGatewayTool, readGatewayCallOptions } from "../../../upstream/src/agents/tools/gateway.js";

/**
 * organization_create 工具参数 schema
 */
const OrganizationCreateToolSchema = Type.Object({
  /** 组织ID（必填，唯一标识） */
  organizationId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 组织名称（必填） */
  name: Type.String({ minLength: 1, maxLength: 128 }),
  /** 组织描述（可选） */
  description: Type.Optional(Type.String()),
  /** 创建者ID（必填） */
  creatorId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 组织类型（可选） */
  type: Type.Optional(
    Type.Union([
      Type.Literal("company"),
      Type.Literal("team"),
      Type.Literal("project"),
      Type.Literal("community"),
    ]),
  ),
});

/**
 * organization_update 工具参数 schema
 */
const OrganizationUpdateToolSchema = Type.Object({
  /** 组织ID（必填） */
  organizationId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新名称（可选） */
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  /** 新描述（可选） */
  description: Type.Optional(Type.String()),
});

/**
 * organization_member_add 工具参数 schema
 */
const OrganizationMemberAddToolSchema = Type.Object({
  /** 组织ID（必填） */
  organizationId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 成员ID（必填） */
  memberId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 成员类型（必填：agent 或 human） */
  memberType: Type.Union([Type.Literal("agent"), Type.Literal("human")]),
  /** 成员角色（可选：owner, admin, member） */
  role: Type.Optional(
    Type.Union([Type.Literal("owner"), Type.Literal("admin"), Type.Literal("member")]),
  ),
  /** 职位/头衔（可选） */
  title: Type.Optional(Type.String()),
});

/**
 * organization_member_update 工具参数 schema
 */
const OrganizationMemberUpdateToolSchema = Type.Object({
  /** 组织ID（必填） */
  organizationId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 成员ID（必填） */
  memberId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新角色（可选） */
  role: Type.Optional(
    Type.Union([Type.Literal("owner"), Type.Literal("admin"), Type.Literal("member")]),
  ),
  /** 新职位/头衔（可选） */
  title: Type.Optional(Type.String()),
});

/**
 * organization_member_remove 工具参数 schema
 */
const OrganizationMemberRemoveToolSchema = Type.Object({
  /** 组织ID（必填） */
  organizationId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 成员ID（必填） */
  memberId: Type.String({ minLength: 1, maxLength: 64 }),
});

/**
 * organization_list 工具参数 schema
 */
const OrganizationListToolSchema = Type.Object({
  /** 过滤成员ID（可选，返回该成员所属的组织） */
  memberId: Type.Optional(Type.String()),
});

/**
 * 创建组织创建工具
 */
export function createOrganizationCreateTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Organization Create",
    name: "organization_create",
    description:
      "Create a new organization with unique ID. The creator becomes the owner. Organizations can be companies, teams, projects, or communities.",
    parameters: OrganizationCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const organizationId = readStringParam(params, "organizationId", { required: true });
      const name = readStringParam(params, "name", { required: true });
      const description = readStringParam(params, "description");
      const creatorId = readStringParam(params, "creatorId", { required: true });
      const type = readStringParam(params, "type") as "company" | "team" | "project" | "community" | undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 organization.create RPC
        const response = await callGatewayTool("organization.create", gatewayOpts, {
          organizationId,
          name,
          description,
          creatorId,
          type: type || "team",
        });

        return jsonResult({
          success: true,
          message: `Organization "${name}" created successfully`,
          organization: {
            id: organizationId,
            name,
            description,
            type: type || "team",
            creatorId,
            createdAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create organization: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建组织更新工具
 */
export function createOrganizationUpdateTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Organization Update",
    name: "organization_update",
    description:
      "Update an organization's name or description. Requires owner or admin permissions. At least one field must be provided.",
    parameters: OrganizationUpdateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const organizationId = readStringParam(params, "organizationId", { required: true });
      const name = readStringParam(params, "name");
      const description = readStringParam(params, "description");
      const gatewayOpts = readGatewayCallOptions(params);

      if (!name && !description) {
        return jsonResult({
          success: false,
          error: "At least one field (name or description) must be provided",
        });
      }

      try {
        // 调用 organization.update RPC
        const response = await callGatewayTool("organization.update", gatewayOpts, {
          organizationId,
          name,
          description,
        });

        return jsonResult({
          success: true,
          message: `Organization "${organizationId}" updated successfully`,
          organization: {
            id: organizationId,
            name,
            description,
            updatedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update organization: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建添加组织成员工具
 */
export function createOrganizationMemberAddTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Organization Member Add",
    name: "organization_member_add",
    description:
      "Add a member to an organization. Specify member type (agent or human), role (owner/admin/member), and optional title. Requires owner or admin permissions.",
    parameters: OrganizationMemberAddToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const organizationId = readStringParam(params, "organizationId", { required: true });
      const memberId = readStringParam(params, "memberId", { required: true });
      const memberType = readStringParam(params, "memberType", { required: true }) as "agent" | "human";
      const role = readStringParam(params, "role") as "owner" | "admin" | "member" | undefined;
      const title = readStringParam(params, "title");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 organization.member.add RPC
        const response = await callGatewayTool("organization.member.add", gatewayOpts, {
          organizationId,
          memberId,
          memberType,
          role: role || "member",
          title,
        });

        return jsonResult({
          success: true,
          message: `Successfully added ${memberType} "${memberId}" to organization`,
          member: {
            organizationId,
            memberId,
            memberType,
            role: role || "member",
            title,
            addedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to add member: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建更新组织成员工具
 */
export function createOrganizationMemberUpdateTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Organization Member Update",
    name: "organization_member_update",
    description:
      "Update a member's role or title in an organization. Requires owner or admin permissions. At least one field must be provided.",
    parameters: OrganizationMemberUpdateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const organizationId = readStringParam(params, "organizationId", { required: true });
      const memberId = readStringParam(params, "memberId", { required: true });
      const role = readStringParam(params, "role") as "owner" | "admin" | "member" | undefined;
      const title = readStringParam(params, "title");
      const gatewayOpts = readGatewayCallOptions(params);

      if (!role && !title) {
        return jsonResult({
          success: false,
          error: "At least one field (role or title) must be provided",
        });
      }

      try {
        // 调用 organization.member.update RPC
        const response = await callGatewayTool("organization.member.update", gatewayOpts, {
          organizationId,
          memberId,
          role,
          title,
        });

        return jsonResult({
          success: true,
          message: `Successfully updated member "${memberId}" in organization`,
          member: {
            organizationId,
            memberId,
            role,
            title,
            updatedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update member: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建移除组织成员工具
 */
export function createOrganizationMemberRemoveTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Organization Member Remove",
    name: "organization_member_remove",
    description:
      "Remove a member from an organization. Requires owner or admin permissions. CAUTION: Cannot remove the last owner.",
    parameters: OrganizationMemberRemoveToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const organizationId = readStringParam(params, "organizationId", { required: true });
      const memberId = readStringParam(params, "memberId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 organization.member.remove RPC
        const response = await callGatewayTool("organization.member.remove", gatewayOpts, {
          organizationId,
          memberId,
        });

        return jsonResult({
          success: true,
          message: `Successfully removed member "${memberId}" from organization`,
          removed: {
            organizationId,
            memberId,
            removedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to remove member: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建列出组织工具
 */
export function createOrganizationListTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Organization List",
    name: "organization_list",
    description:
      "List all organizations, optionally filtered by member ID. Returns organization details including members and structure.",
    parameters: OrganizationListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const memberId = readStringParam(params, "memberId");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 organization.list RPC
        const response = await callGatewayTool("organization.list", gatewayOpts, {
          memberId,
        });

        const organizations = (response as any)?.organizations || [];

        return jsonResult({
          success: true,
          message: `Found ${organizations.length} organization(s)`,
          organizations: organizations.map((org: any) => ({
            id: org.id,
            name: org.name,
            description: org.description,
            type: org.type,
            memberCount: org.members?.length || 0,
            createdAt: org.createdAt,
          })),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list organizations: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
