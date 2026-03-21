/**
 * Friends RPC 处理器
 *
 * 智能助手之间的好友关系管理
 */

import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { groupManager } from "../../sessions/group-manager.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";

export const friendsHandlers: GatewayRequestHandlers = {
  /**
   * 获取好友列表
   */
  "friends.list": async ({ params, respond }) => {
    const agentId = params?.agentId;
    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const friends = groupManager.getFriends(agentId);
      respond(true, { friends, total: friends.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 添加好友请求
   */
  "friends.add": async ({ params, respond }) => {
    const { fromAgentId, toAgentId, message } = params || {};

    if (!fromAgentId || typeof fromAgentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing fromAgentId"));
      return;
    }
    if (!toAgentId || typeof toAgentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing toAgentId"));
      return;
    }

    try {
      const msg = typeof message === "string" ? message : undefined;
      const requestId = groupManager.addFriendRequest(fromAgentId, toAgentId, msg);
      respond(true, { requestId, status: "pending" }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 确认好友请求
   */
  "friends.confirm": async ({ params, respond }) => {
    const { agentId, friendId, accept } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }
    if (!friendId || typeof friendId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing friendId"));
      return;
    }

    try {
      const success = groupManager.respondToFriendRequest(agentId, friendId, accept !== false);
      respond(true, { success, status: accept !== false ? "accepted" : "rejected" }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 删除好友
   */
  "friends.remove": async ({ params, respond }) => {
    const { agentId, friendId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }
    if (!friendId || typeof friendId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing friendId"));
      return;
    }

    try {
      groupManager.deleteFriend(agentId, friendId);
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取好友请求列表
   */
  "friends.requests": async ({ params, respond }) => {
    const agentId = params?.agentId;
    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const requests = groupManager.getFriendRequests(agentId);
      respond(true, { requests, total: requests.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 发送一对一消息
   */
  "friends.sendMessage": async ({ params, respond }) => {
    const { fromAgentId, toAgentId, content, attachments } = params || {};

    if (!fromAgentId || typeof fromAgentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing fromAgentId"));
      return;
    }
    if (!toAgentId || typeof toAgentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing toAgentId"));
      return;
    }
    if (!content || typeof content !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing content"));
      return;
    }

    try {
      const atts = Array.isArray(attachments) ? attachments : undefined;
      const messageId = groupManager.sendDirectMessage(fromAgentId, toAgentId, content, atts);
      respond(true, { messageId, timestamp: Date.now() }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取一对一消息历史
   */
  "friends.messages": async ({ params, respond }) => {
    const { agentId, friendId, limit, offset } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }
    if (!friendId || typeof friendId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing friendId"));
      return;
    }

    try {
      const limitNum = typeof limit === "number" ? limit : 50;
      const offsetNum = typeof offset === "number" ? offset : 0;
      const messages = groupManager.getDirectMessages(agentId, friendId, limitNum, offsetNum);
      respond(true, { messages, total: messages.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 更新好友信息（昵称、标签、分组）
   */
  "friends.update": async ({ params, respond }) => {
    const { agentId, friendId, nickname, tags, group, remark } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }
    if (!friendId || typeof friendId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing friendId"));
      return;
    }

    try {
      const updates: any = {};
      if (nickname !== undefined) updates.nickname = String(nickname);
      if (tags !== undefined && Array.isArray(tags)) {
        updates.tags = tags.map((t: any) => String(t));
      }
      if (group !== undefined) updates.group = String(group);
      if (remark !== undefined) updates.remark = String(remark);

      const relation = groupManager.updateFriendInfo(agentId, friendId, updates);
      respond(true, { success: true, relation }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 智能推荐好友
   */
  "friends.recommend": async ({ params, respond }) => {
    const { agentId, limit } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const limitNum = typeof limit === "number" ? Math.min(limit, 50) : 10;
      const recommendations = groupManager.recommendFriends(agentId, limitNum);
      respond(true, { recommendations, total: recommendations.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取好友详细信息
   */
  "friends.detail": async ({ params, respond }) => {
    const { agentId, friendId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }
    if (!friendId || typeof friendId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing friendId"));
      return;
    }

    try {
      const detail = groupManager.getFriendDetail(agentId, friendId);
      if (!detail) {
        respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, "Friend relation not found"));
        return;
      }
      respond(true, detail, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
