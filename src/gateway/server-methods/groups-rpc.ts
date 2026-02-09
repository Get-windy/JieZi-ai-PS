/**
 * Groups Management RPC Methods
 * 群组管理的 RPC 方法处理器
 */

import type { GroupMemberRole } from "../../sessions/group-manager.js";
import type { GatewayRequestHandlers } from "./types.js";
import { groupManager } from "../../sessions/group-manager.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 群组管理 RPC 方法处理器
 */
export const groupsHandlers: GatewayRequestHandlers = {
  /**
   * 获取群组列表
   */
  "groups.list": async ({ params, respond }) => {
    try {
      // 获取所有群组
      const allGroups = Array.from((groupManager as any).groups.values());

      // 如果指定了 agentId，只返回该智能助手所在的群组
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const groups = agentId ? groupManager.getAgentGroups(agentId) : allGroups;

      respond(
        true,
        {
          groups,
          total: groups.length,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list groups: ${String(error)}`),
      );
    }
  },

  /**
   * 获取群组详情
   */
  "groups.get": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }

      const group = groupManager.getGroup(groupId);
      if (!group) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Group "${groupId}" not found`),
        );
        return;
      }

      respond(true, group, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get group: ${String(error)}`),
      );
    }
  },

  /**
   * 创建群组
   */
  "groups.create": async ({ params, respond }) => {
    try {
      const id = params?.id ? String(params.id) : "";
      const name = params?.name ? String(params.name) : "";
      const ownerId = params?.ownerId ? String(params.ownerId) : "";

      if (!id || !name || !ownerId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "id, name, and ownerId are required"),
        );
        return;
      }

      const group = await groupManager.createGroup({
        id,
        name,
        ownerId,
        description: params?.description ? String(params.description) : undefined,
        isPublic: typeof params?.isPublic === "boolean" ? params.isPublic : false,
        maxMembers: typeof params?.maxMembers === "number" ? params.maxMembers : 500,
        initialMembers: Array.isArray(params?.initialMembers)
          ? params.initialMembers.map(String)
          : [],
      });

      respond(true, group, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create group: ${String(error)}`),
      );
    }
  },

  /**
   * 更新群组信息
   */
  "groups.update": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }

      const updates: any = {};
      if (params?.name) updates.name = String(params.name);
      if (params?.description !== undefined) updates.description = String(params.description);
      if (typeof params?.isPublic === "boolean") updates.isPublic = params.isPublic;
      if (typeof params?.maxMembers === "number") updates.maxMembers = params.maxMembers;
      if (Array.isArray(params?.tags)) updates.tags = params.tags.map(String);

      const group = await groupManager.updateGroup(groupId, updates);
      respond(true, group, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update group: ${String(error)}`),
      );
    }
  },

  /**
   * 删除群组
   */
  "groups.delete": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }

      await groupManager.deleteGroup(groupId);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete group: ${String(error)}`),
      );
    }
  },

  /**
   * 添加成员
   */
  "groups.addMember": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const agentId = params?.agentId ? String(params.agentId) : "";

      if (!groupId || !agentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId and agentId are required"),
        );
        return;
      }

      const role = (params?.role as GroupMemberRole) || "member";
      await groupManager.addMember(groupId, agentId, role);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to add member: ${String(error)}`),
      );
    }
  },

  /**
   * 移除成员
   */
  "groups.removeMember": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const agentId = params?.agentId ? String(params.agentId) : "";

      if (!groupId || !agentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId and agentId are required"),
        );
        return;
      }

      await groupManager.removeMember(groupId, agentId);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to remove member: ${String(error)}`),
      );
    }
  },

  /**
   * 更新成员角色
   */
  "groups.updateMemberRole": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const agentId = params?.agentId ? String(params.agentId) : "";
      const role = params?.role as GroupMemberRole;

      if (!groupId || !agentId || !role) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId, agentId, and role are required"),
        );
        return;
      }

      await groupManager.updateMemberRole(groupId, agentId, role);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update member role: ${String(error)}`),
      );
    }
  },

  /**
   * 禁言/解除禁言成员
   */
  "groups.muteMember": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const agentId = params?.agentId ? String(params.agentId) : "";
      const muted = typeof params?.muted === "boolean" ? params.muted : true;

      if (!groupId || !agentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId and agentId are required"),
        );
        return;
      }

      await groupManager.muteMember(groupId, agentId, muted);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to mute member: ${String(error)}`),
      );
    }
  },

  /**
   * 获取群组成员列表
   */
  "groups.members": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }

      const members = groupManager.getMembers(groupId);
      respond(true, { members }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get members: ${String(error)}`),
      );
    }
  },

  /**
   * 获取智能助手的好友列表
   */
  "groups.friends": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : "";
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const friends = groupManager.getFriends(agentId);
      respond(true, { friends }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get friends: ${String(error)}`),
      );
    }
  },

  /**
   * 添加好友
   */
  "groups.addFriend": async ({ params, respond }) => {
    try {
      const agentA = params?.agentA ? String(params.agentA) : "";
      const agentB = params?.agentB ? String(params.agentB) : "";
      const initiator = params?.initiator ? String(params.initiator) : agentA;

      if (!agentA || !agentB) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentA and agentB are required"),
        );
        return;
      }

      const relation = await groupManager.addFriend(agentA, agentB, initiator);
      respond(true, relation, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to add friend: ${String(error)}`),
      );
    }
  },

  /**
   * 确认好友关系
   */
  "groups.confirmFriend": async ({ params, respond }) => {
    try {
      const agentA = params?.agentA ? String(params.agentA) : "";
      const agentB = params?.agentB ? String(params.agentB) : "";

      if (!agentA || !agentB) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentA and agentB are required"),
        );
        return;
      }

      await groupManager.confirmFriend(agentA, agentB);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to confirm friend: ${String(error)}`),
      );
    }
  },

  /**
   * 删除好友
   */
  "groups.removeFriend": async ({ params, respond }) => {
    try {
      const agentA = params?.agentA ? String(params.agentA) : "";
      const agentB = params?.agentB ? String(params.agentB) : "";

      if (!agentA || !agentB) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentA and agentB are required"),
        );
        return;
      }

      await groupManager.removeFriend(agentA, agentB);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to remove friend: ${String(error)}`),
      );
    }
  },
};
