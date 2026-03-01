/**
 * 权限管理工具
 * 
 * 提供授予和撤销权限的工具
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readStringArrayParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

/**
 * permission_grant 工具参数 schema
 */
const PermissionGrantToolSchema = Type.Object({
  /** 目标成员ID（必填，接收权限的智能体或用户） */
  targetId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 权限类型（必填） */
  permissionType: Type.Union([
    Type.Literal("organization.manage"),    // 管理组织
    Type.Literal("member.manage"),          // 管理成员
    Type.Literal("agent.create"),           // 创建智能体
    Type.Literal("agent.manage"),           // 管理智能体
    Type.Literal("recruit.approve"),        // 审批招聘
    Type.Literal("channel.manage"),         // 管理通道
    Type.Literal("permission.manage"),      // 管理权限
  ]),
  /** 权限范围（可选） */
  scope: Type.Optional(
    Type.Object({
      /** 组织ID（限定权限在特定组织内有效） */
      organizationId: Type.Optional(Type.String()),
      /** 资源ID（限定权限针对特定资源） */
      resourceId: Type.Optional(Type.String()),
    }),
  ),
  /** 授权理由（可选） */
  reason: Type.Optional(Type.String()),
  /** 权限过期时间（可选，Unix时间戳，ms） */
  expiresAt: Type.Optional(Type.Number()),
});

/**
 * permission_revoke 工具参数 schema
 */
const PermissionRevokeToolSchema = Type.Object({
  /** 目标成员ID（必填，要撤销权限的智能体或用户） */
  targetId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 权限类型（必填） */
  permissionType: Type.Union([
    Type.Literal("organization.manage"),
    Type.Literal("member.manage"),
    Type.Literal("agent.create"),
    Type.Literal("agent.manage"),
    Type.Literal("recruit.approve"),
    Type.Literal("channel.manage"),
    Type.Literal("permission.manage"),
  ]),
  /** 权限范围（可选，必须与授权时的scope匹配） */
  scope: Type.Optional(
    Type.Object({
      organizationId: Type.Optional(Type.String()),
      resourceId: Type.Optional(Type.String()),
    }),
  ),
  /** 撤销理由（可选） */
  reason: Type.Optional(Type.String()),
});

/**
 * permission_list 工具参数 schema
 */
const PermissionListToolSchema = Type.Object({
  /** 目标成员ID（可选，查询特定成员的权限） */
  targetId: Type.Optional(Type.String()),
  /** 组织ID（可选，查询特定组织范围的权限） */
  organizationId: Type.Optional(Type.String()),
});

/**
 * 创建授予权限工具
 */
export function createPermissionGrantTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Permission Grant",
    name: "permission_grant",
    description:
      "Grant a permission to a target member (agent or human). Specify permission type (organization.manage, member.manage, agent.create, etc.), optional scope, and reason. Requires permission.manage privilege.",
    parameters: PermissionGrantToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetId = readStringParam(params, "targetId", { required: true });
      const permissionType = readStringParam(params, "permissionType", { required: true });
      const reason = readStringParam(params, "reason");
      const expiresAt = typeof params.expiresAt === "number" ? params.expiresAt : undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      // 解析scope
      const scope = typeof params.scope === "object" && params.scope !== null
        ? {
            organizationId: (params.scope as any).organizationId,
            resourceId: (params.scope as any).resourceId,
          }
        : undefined;

      try {
        // 调用 permission.grant RPC
        const response = await callGatewayTool("permission.grant", gatewayOpts, {
          targetId,
          permissionType,
          scope,
          reason,
          expiresAt,
          grantedBy: opts?.currentAgentId,
        });

        return jsonResult({
          success: true,
          message: `Permission "${permissionType}" granted to "${targetId}" successfully`,
          permission: {
            targetId,
            permissionType,
            scope,
            reason,
            expiresAt,
            grantedBy: opts?.currentAgentId,
            grantedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to grant permission: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建撤销权限工具
 */
export function createPermissionRevokeTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Permission Revoke",
    name: "permission_revoke",
    description:
      "Revoke a permission from a target member. Specify permission type and optional scope (must match the original grant). Requires permission.manage privilege.",
    parameters: PermissionRevokeToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetId = readStringParam(params, "targetId", { required: true });
      const permissionType = readStringParam(params, "permissionType", { required: true });
      const reason = readStringParam(params, "reason");
      const gatewayOpts = readGatewayCallOptions(params);

      // 解析scope
      const scope = typeof params.scope === "object" && params.scope !== null
        ? {
            organizationId: (params.scope as any).organizationId,
            resourceId: (params.scope as any).resourceId,
          }
        : undefined;

      try {
        // 调用 permission.revoke RPC
        const response = await callGatewayTool("permission.revoke", gatewayOpts, {
          targetId,
          permissionType,
          scope,
          reason,
          revokedBy: opts?.currentAgentId,
        });

        return jsonResult({
          success: true,
          message: `Permission "${permissionType}" revoked from "${targetId}" successfully`,
          revoked: {
            targetId,
            permissionType,
            scope,
            reason,
            revokedBy: opts?.currentAgentId,
            revokedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to revoke permission: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建列出权限工具
 */
export function createPermissionListTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Permission List",
    name: "permission_list",
    description:
      "List permissions, optionally filtered by target member or organization. Returns permission details including type, scope, grant time, and expiration.",
    parameters: PermissionListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetId = readStringParam(params, "targetId");
      const organizationId = readStringParam(params, "organizationId");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 permission.list RPC
        const response = await callGatewayTool("permission.list", gatewayOpts, {
          targetId,
          organizationId,
        });

        const permissions = (response as any)?.permissions || [];

        return jsonResult({
          success: true,
          message: `Found ${permissions.length} permission(s)`,
          permissions: permissions.map((perm: any) => ({
            id: perm.id,
            targetId: perm.targetId,
            permissionType: perm.permissionType,
            scope: perm.scope,
            grantedBy: perm.grantedBy,
            grantedAt: perm.grantedAt,
            expiresAt: perm.expiresAt,
            reason: perm.reason,
            isExpired: perm.expiresAt ? Date.now() > perm.expiresAt : false,
          })),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list permissions: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
