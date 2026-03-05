/**
 * 好友关系管理工具
 *
 * 提供添加、删除、列出好友的工具
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

/**
 * friend_add 工具参数 schema
 */
const FriendAddToolSchema = Type.Object({
  /** 当前智能助手ID（必填） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 好友智能助手ID（必填） */
  friendAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 备注名（可选） */
  nickname: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  /** 好友请求消息（可选） */
  message: Type.Optional(Type.String()),
});

/**
 * friend_remove 工具参数 schema
 */
const FriendRemoveToolSchema = Type.Object({
  /** 当前智能助手ID（必填） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 要删除的好友ID（必填） */
  friendAgentId: Type.String({ minLength: 1, maxLength: 64 }),
});

/**
 * friend_list 工具参数 schema
 */
const FriendListToolSchema = Type.Object({
  /** 智能助手ID（必填） */
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
});

/**
 * 创建添加好友工具
 */
export function createFriendAddTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Friend Add",
    name: "friend_add",
    description:
      "Add another agent as a friend. This creates a bidirectional friend relationship. Optionally provide a nickname and message.",
    parameters: FriendAddToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const friendAgentId = readStringParam(params, "friendAgentId", { required: true });
      const nickname = readStringParam(params, "nickname");
      const message = readStringParam(params, "message");
      const gatewayOpts = readGatewayCallOptions(params);

      // 安全检查：不能添加自己为好友
      if (agentId === friendAgentId) {
        return jsonResult({
          success: false,
          error: "Cannot add yourself as a friend",
        });
      }

      try {
        // 调用 friends.add RPC
        await callGatewayTool("friends.add", gatewayOpts, {
          fromAgentId: agentId,
          toAgentId: friendAgentId,
          message,
        });

        return jsonResult({
          success: true,
          message: `Successfully added "${friendAgentId}" as friend`,
          friendship: {
            agentId,
            friendAgentId,
            nickname: nickname || friendAgentId,
            addedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to add friend: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建删除好友工具
 */
export function createFriendRemoveTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Friend Remove",
    name: "friend_remove",
    description:
      "Remove a friend relationship. This will delete the bidirectional friendship between the two agents.",
    parameters: FriendRemoveToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const friendAgentId = readStringParam(params, "friendAgentId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 friends.remove RPC
        await callGatewayTool("friends.remove", gatewayOpts, {
          agentId,
          friendId: friendAgentId,
        });

        return jsonResult({
          success: true,
          message: `Successfully removed "${friendAgentId}" from friends`,
          removed: {
            agentId,
            friendAgentId,
            removedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to remove friend: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建列出好友工具
 */
export function createFriendListTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Friend List",
    name: "friend_list",
    description:
      "List all friends of an agent. Returns friend IDs, names, nicknames, and last message times.",
    parameters: FriendListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 friends.list RPC
        const response = await callGatewayTool("friends.list", gatewayOpts, {
          agentId,
        });

        const resp = response as { friends?: unknown[] } | null;
        const friends =
          resp && typeof resp === "object" && "friends" in resp && Array.isArray(resp.friends)
            ? resp.friends
            : [];

        return jsonResult({
          success: true,
          message: `Found ${friends.length} friend(s)`,
          friends: friends.map((friend) => {
            const f = friend as Record<string, unknown>;
            return {
              agentId: f.agentId,
              agentName: f.agentName,
              nickname: f.nickname,
              addedAt: f.addedAt,
              lastMessageAt: f.lastMessageAt,
            };
          }),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list friends: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
