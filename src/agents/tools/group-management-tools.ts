/**
 * 群组管理工具
 *
 * 提供创建、管理群组的工具
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readStringArrayParam, readNumberParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

/**
 * group_list 工具参数 schema
 */
const GroupListToolSchema = Type.Object({
  /** 可选：按 agentId 过滤，只返回指定 agent 所在群组 */
  agentId: Type.Optional(Type.String()),
});

/**
 * group_create 工具参数 schema
 */

/**
 * 创建群组列表工具
 */
export function createGroupListTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Group List",
    name: "group_list",
    description:
      "List all groups or groups that a specific agent belongs to. Use this BEFORE creating a new group to check if it already exists. Returns group IDs, names, member counts, and owner IDs.",
    parameters: GroupListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      // 如果未传 agentId，默认用当前 agent 自己查询
      const agentId = readStringParam(params, "agentId") || opts?.currentAgentId;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool(
          "groups.list",
          gatewayOpts,
          agentId ? { agentId } : {},
        );

        const result = response as { groups?: unknown[]; total?: number };
        const groups = Array.isArray(result?.groups) ? result.groups : [];

        return jsonResult({
          success: true,
          total: groups.length,
          groups: groups.map((g: unknown) => {
            const grp = g as Record<string, unknown>;
            return {
              id: grp.id,
              name: grp.name,
              ownerId: grp.ownerId,
              description: grp.description,
              memberCount: Array.isArray(grp.members) ? grp.members.length : 0,
              isPublic: grp.isPublic,
              createdAt: grp.createdAt,
            };
          }),
          tip:
            groups.length === 0
              ? "No groups found. You can create one with group_create."
              : `Found ${groups.length} group(s). Check before creating a new one to avoid duplicates.`,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list groups: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * group_create 工具参数 schema
 */
const GroupCreateToolSchema = Type.Object({
  /** 群组名称（必填） */
  name: Type.String({ minLength: 1, maxLength: 128 }),
  /** 群主 ID（必填） */
  ownerId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 群组描述（可选） */
  description: Type.Optional(Type.String()),
  /** 初始成员 ID 列表（可选） */
  memberIds: Type.Optional(Type.Array(Type.String())),
  /** 是否公开（可选，默认 false） */
  isPublic: Type.Optional(Type.Boolean()),
  /** 最大成员数（可选） */
  maxMembers: Type.Optional(Type.Number({ minimum: 2, maximum: 1000 })),
  /** 项目 ID（可选）- 如果是项目群组，指定所属项目 */
  projectId: Type.Optional(Type.String()),
  /** 工作空间路径（可选）- 指定项目工作空间路径，默认在 H:\\OpenClaw_Workspace\\groups\\{groupId} */
  workspacePath: Type.Optional(Type.String()),
});

/**
 * group_add_member 工具参数 schema
 */
const GroupAddMemberToolSchema = Type.Object({
  /** 群组ID（必填） */
  groupId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 要添加的成员ID列表（必填） */
  memberIds: Type.Array(Type.String(), { minItems: 1 }),
  /** 角色（可选，默认member） */
  role: Type.Optional(Type.Union([Type.Literal("member"), Type.Literal("admin")])),
});

/**
 * group_remove_member 工具参数 schema
 */
const GroupRemoveMemberToolSchema = Type.Object({
  /** 群组ID（必填） */
  groupId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 要移除的成员ID列表（必填） */
  memberIds: Type.Array(Type.String(), { minItems: 1 }),
});

/**
 * group_update_member_role 工具参数 schema
 */
const GroupUpdateMemberRoleToolSchema = Type.Object({
  /** 群组ID（必填） */
  groupId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 成员ID（必填） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新角色（必填） */
  role: Type.Union([Type.Literal("member"), Type.Literal("admin")]),
});

/**
 * group_delete 工具参数 schema
 */
const GroupDeleteToolSchema = Type.Object({
  /** 群组 ID（必填） */
  groupId: Type.String({ minLength: 1, maxLength: 128 }),
});

/**
 * group_upgrade_to_project 工具参数 schema
 */
const GroupUpgradeToProjectToolSchema = Type.Object({
  /** 群组 ID（必填） */
  groupId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 项目 ID（必填） */
  projectId: Type.String({ minLength: 1, maxLength: 128 }),
});

/**
 * 创建群组创建工具
 */
export function createGroupCreateTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Group Create",
    name: "group_create",
    description:
      "Create a new group for collaboration. Specify group name, owner ID, and optional initial members. Returns the created group ID. The owner automatically becomes an admin. For project groups, specify projectId and workspacePath.",
    parameters: GroupCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const name = readStringParam(params, "name", { required: true });
      const ownerId = readStringParam(params, "ownerId", { required: true });
      const description = readStringParam(params, "description");
      const memberIds = readStringArrayParam(params, "memberIds") || [];
      const isPublic = typeof params.isPublic === "boolean" ? params.isPublic : false;
      const maxMembers = readNumberParam(params, "maxMembers", { integer: true });
      const gatewayOpts = readGatewayCallOptions(params);
      const projectId = readStringParam(params, "projectId"); // 新增：项目 ID
      const workspacePath = readStringParam(params, "workspacePath"); // 新增：工作空间路径

      try {
        // 构建成员列表（群主自动成为owner角色）
        const members = memberIds.map((id) => ({
          agentId: id,
          role: id === ownerId ? "owner" : "member",
          joinedAt: Date.now(),
        }));

        // 确保群主在成员列表中
        if (!memberIds.includes(ownerId)) {
          members.unshift({
            agentId: ownerId,
            role: "owner",
            joinedAt: Date.now(),
          });
        }

        // 调用 groups.create RPC
        // 注意：服务端读取的是 initialMembers（字符串数组），而非 members对象数组
        const initialMemberIds = memberIds.filter((id) => id !== ownerId);
        const response = await callGatewayTool("groups.create", gatewayOpts, {
          name,
          ownerId,
          description,
          initialMembers: initialMemberIds, // 使用服务端期望的字段名
          isPublic,
          maxMembers,
          projectId: projectId || undefined,
          workspacePath: workspacePath || undefined,
        });

        const group = response;

        return jsonResult({
          success: true,
          message: `Group "${name}" created successfully`,
          group: {
            id: group.id,
            name: group.name,
            ownerId: group.ownerId,
            memberCount: Array.isArray(group.members) ? group.members.length : members.length,
            isPublic: group.isPublic,
            createdAt: group.createdAt || Date.now(),
            projectId: group.projectId, // 返回项目 ID
            workspacePath: group.workspacePath, // 返回工作空间路径
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create group: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建添加群成员工具
 */
export function createGroupAddMemberTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Group Add Member",
    name: "group_add_member",
    description:
      "Add members to an existing group. Requires owner or admin permissions. Can optionally specify member role (member or admin).",
    parameters: GroupAddMemberToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const groupId = readStringParam(params, "groupId", { required: true });
      const memberIds = readStringArrayParam(params, "memberIds", { required: true });
      const role = readStringParam(params, "role") as "member" | "admin" | undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 groups.addMember RPC（逐个添加）
        const addedMembers = [];
        for (const agentId of memberIds) {
          try {
            await callGatewayTool("groups.addMember", gatewayOpts, {
              groupId,
              agentId,  // 后端读取字段名为 agentId
              role: role || "member",
            });
            addedMembers.push(agentId);
          } catch {
            // 忽略单个成员添加失败
          }
        }

        if (addedMembers.length === 0) {
          return jsonResult({
            success: false,
            error: "Failed to add any members to the group",
          });
        }

        return jsonResult({
          success: true,
          message: `Successfully added ${addedMembers.length} member(s) to group`,
          added: {
            groupId,
            memberIds: addedMembers,
            role: role || "member",
            addedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to add members: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建移除群成员工具
 */
export function createGroupRemoveMemberTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Group Remove Member",
    name: "group_remove_member",
    description:
      "Remove members from a group. Requires owner or admin permissions. CAUTION: Cannot remove the group owner.",
    parameters: GroupRemoveMemberToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const groupId = readStringParam(params, "groupId", { required: true });
      const memberIds = readStringArrayParam(params, "memberIds", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 groups.removeMember RPC（可能需要逐个移除）
        const removedMembers = [];
        const failedRemovals: Array<{ agentId: string; reason: string }> = [];

        for (const agentId of memberIds) {
          try {
            await callGatewayTool("groups.removeMember", gatewayOpts, {
              groupId,
              agentId,  // 后端读取字段名为 agentId
            });
            removedMembers.push(agentId);
          } catch (error) {
            failedRemovals.push({
              agentId,
              reason: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        if (removedMembers.length === 0) {
          return jsonResult({
            success: false,
            error: "Failed to remove any members",
            failedRemovals,
          });
        }

        return jsonResult({
          success: true,
          message: `Successfully removed ${removedMembers.length} member(s) from group`,
          removed: {
            groupId,
            memberIds: removedMembers,
            removedAt: Date.now(),
          },
          failedRemovals: failedRemovals.length > 0 ? failedRemovals : undefined,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to remove members: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建更新成员角色工具
 */
export function createGroupUpdateMemberRoleTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Group Update Member Role",
    name: "group_update_member_role",
    description:
      "Update a group member's role. Requires owner or admin permissions. Roles: 'member' (regular member) or 'admin' (can manage members). The group owner's role cannot be changed.",
    parameters: GroupUpdateMemberRoleToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const groupId = readStringParam(params, "groupId", { required: true });
      const agentId = readStringParam(params, "agentId", { required: true });
      const role = readStringParam(params, "role", { required: true }) as "member" | "admin";
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        await callGatewayTool("groups.updateMemberRole", gatewayOpts, {
          groupId,
          agentId,
          role,
        });

        return jsonResult({
          success: true,
          message: `Successfully updated member "${agentId}" role to "${role}" in group "${groupId}"`,
          updated: { groupId, agentId, role, updatedAt: Date.now() },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update member role: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建删除群组工具
 */
export function createGroupDeleteTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Group Delete",
    name: "group_delete",
    description:
      "Delete a group. CAUTION: This is a destructive operation. Only the group owner can delete the group.",
    parameters: GroupDeleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const groupId = readStringParam(params, "groupId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 groups.delete RPC
        await callGatewayTool("groups.delete", gatewayOpts, {
          groupId,
        });

        return jsonResult({
          success: true,
          message: `Group "${groupId}" deleted successfully`,
          deleted: {
            groupId,
            deletedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to delete group: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * group_send 工具参数 schema
 */
const GroupSendToolSchema = Type.Object({
  /** 群组ID（必填） */
  groupId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 消息内容（必填） */
  content: Type.String({ minLength: 1, maxLength: 10000 }),
  /** 发送者昵称（可选，默认为当前 agent ID） */
  senderName: Type.Optional(Type.String()),
});

/**
 * 创建群聊发送工具
 *
 * agent 在群组中工作时，使用此工具将消息写入群聊存储，
 * 让人类用户在群聊窗口里看到 agent 的发言。
 */
export function createGroupSendTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Group Send",
    name: "group_send",
    description:
      "Send a message to an OpenClaw internal group chat (NOT Feishu/DingTalk/Slack/Discord). The groupId must be an OpenClaw group ID obtained from group_list (format: group_XXXXXXX). This writes the message to the OpenClaw platform group chat window so human operators can see it. Do NOT use Feishu/DingTalk chatIds here - use the message tool for external channels.",
    parameters: GroupSendToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const groupId = readStringParam(params, "groupId", { required: true });
      const content = readStringParam(params, "content", { required: true });
      const senderName = readStringParam(params, "senderName") || opts?.currentAgentId || "agent";
      const senderId = opts?.currentAgentId || "agent";
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("groups.chat.send", gatewayOpts, {
          groupId,
          content,
          senderId,
          senderName,
        });

        const result = response as { messageId?: string; success?: boolean };
        return jsonResult({
          success: true,
          messageId: result?.messageId,
          groupId,
          message: "Message sent to group chat successfully",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to send group message: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建群组升级到项目群工具
 */
export function createGroupUpgradeToProjectTool(): AnyAgentTool {
  return {
    label: "Group Upgrade To Project",
    name: "group_upgrade_to_project",
    description:
      "Upgrade a normal group to a project group by binding it to a project. This will migrate the group workspace to the project workspace and enable project management features. CAUTION: This operation is irreversible!",
    parameters: GroupUpgradeToProjectToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const groupId = readStringParam(params, "groupId", { required: true });
      const projectId = readStringParam(params, "projectId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用后端升级 RPC
        const response = await callGatewayTool("groups.upgradeToProject", gatewayOpts, {
          groupId,
          projectId,
        });

        const result = response as { success: boolean; group?: unknown; workspacePath?: string };
        
        return jsonResult({
          success: true,
          message: `Group "${groupId}" has been upgraded to project group for project "${projectId}"`,
          group: result.group,
          workspacePath: result.workspacePath,
          warning: "⚠️ This operation is irreversible! The group cannot be downgraded back to a normal group.",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to upgrade group to project: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
