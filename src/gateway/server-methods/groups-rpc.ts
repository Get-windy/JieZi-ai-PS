// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Groups Management RPC Methods
 * 群组管理的 RPC 方法处理器
 */

import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import type { GroupMemberRole } from "../../sessions/group-manager.js";
import { groupManager } from "../../sessions/group-manager.js";
import { groupMessageStorage } from "../../sessions/group-message-storage.js";

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
      const allGroups = groupManager.getAllGroups();

      // 如果指定了 agentId，只返回该智能助手所在的群组
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      // 如果指定了 projectId，只返回该项目下的群组
      const projectId = params?.projectId ? String(params.projectId) : undefined;

      let groups = agentId ? groupManager.getAgentGroups(agentId) : allGroups;
      if (projectId) {
        groups = groups.filter((g) => g.projectId === projectId);
      }

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
      // id 可选，不传则自动生成
      const id = params?.id
        ? String(params.id)
        : `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const name = params?.name ? String(params.name) : "";
      const ownerId = params?.ownerId ? String(params.ownerId) : "";

      if (!name || !ownerId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "name and ownerId are required"),
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
        projectId: params?.projectId ? String(params.projectId) : undefined,
        workspacePath: params?.workspacePath ? String(params.workspacePath) : undefined,
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

      const updates: Partial<
        Pick<
          import("../../sessions/group-manager.js").GroupInfo,
          "name" | "description" | "isPublic" | "maxMembers" | "tags" | "metadata"
        >
      > = {};
      if (params?.name) {
        updates.name = String(params.name);
      }
      if (params?.description !== undefined) {
        updates.description = String(params.description);
      }
      if (typeof params?.isPublic === "boolean") {
        updates.isPublic = params.isPublic;
      }
      if (typeof params?.maxMembers === "number") {
        updates.maxMembers = params.maxMembers;
      }
      if (Array.isArray(params?.tags)) {
        updates.tags = params.tags.map(String);
      }
      if (params?.metadata !== null && typeof params?.metadata === "object") {
        updates.metadata = params.metadata as Record<string, unknown>;
      }

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

  /**
   * 邀请成员加入群组
   */
  "group.member.invite": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const agentId = params?.agentId ? String(params.agentId) : "";
      const inviterId = params?.inviterId ? String(params.inviterId) : "";

      if (!groupId || !agentId || !inviterId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId, agentId, and inviterId are required"),
        );
        return;
      }

      const message = params?.message ? String(params.message) : undefined;
      const result = await groupManager.inviteMember(groupId, agentId, inviterId, message);
      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to invite member: ${String(error)}`),
      );
    }
  },

  /**
   * 申请加入群组
   */
  "group.member.join": async ({ params, respond }) => {
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

      const reason = params?.reason ? String(params.reason) : undefined;
      const result = await groupManager.joinRequest(groupId, agentId, reason);
      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to join group: ${String(error)}`),
      );
    }
  },

  /**
   * 审批加入申请
   */
  "group.member.approve": async ({ params, respond }) => {
    try {
      const requestId = params?.requestId ? String(params.requestId) : "";
      const decision = params?.decision ? String(params.decision) : "";
      const approverId = params?.approverId ? String(params.approverId) : "";

      if (!requestId || !decision || !approverId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "requestId, decision, and approverId are required",
          ),
        );
        return;
      }

      if (decision !== "approve" && decision !== "reject") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, 'decision must be "approve" or "reject"'),
        );
        return;
      }

      const result = await groupManager.approveRequest(requestId, decision, approverId);
      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to approve request: ${String(error)}`),
      );
    }
  },

  /**
   * 更新成员角色（新方法名）
   */
  "group.member.role.update": async ({ params, respond }) => {
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
   * 共享资源到群组
   */
  "group.resources.share": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const resourceType = params?.resourceType ? String(params.resourceType) : "";
      const resourceId = params?.resourceId ? String(params.resourceId) : "";

      if (!groupId || !resourceType || !resourceId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "groupId, resourceType, and resourceId are required",
          ),
        );
        return;
      }

      if (
        resourceType !== "document" &&
        resourceType !== "knowledge" &&
        resourceType !== "workspace"
      ) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            'resourceType must be "document", "knowledge", or "workspace"',
          ),
        );
        return;
      }

      await groupManager.shareResource(groupId, resourceType, resourceId);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to share resource: ${String(error)}`),
      );
    }
  },

  /**
   * 更新群组设置
   */
  "group.settings.update": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }

      const settings: Parameters<typeof groupManager.updateGroupSettings>[1] = {};
      if (params?.type) {
        settings.type = String(params.type) as import("../../sessions/group-manager.js").GroupType;
      }
      if (typeof params?.requireApproval === "boolean") {
        settings.requireApproval = params.requireApproval;
      }
      if (typeof params?.allowInvite === "boolean") {
        settings.allowInvite = params.allowInvite;
      }
      if (typeof params?.allowSpeak === "boolean") {
        settings.allowSpeak = params.allowSpeak;
      }
      if (Array.isArray(params?.pinMessages)) {
        settings.pinMessages = params.pinMessages.map(String);
      }

      const group = await groupManager.updateGroupSettings(groupId, settings);
      respond(true, group, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update group settings: ${String(error)}`),
      );
    }
  },

  /**
   * 读取群聊消息历史（供前端群聊窗口使用）
   */
  "groups.chat.history": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }
      const limit = typeof params?.limit === "number" ? params.limit : 200;
      // 可选按 category 过滤：only_chat | only_work | all
      const categoryFilter = params?.category ? String(params.category) : "all";
      const messages = await groupMessageStorage.loadMessages(groupId, { limit });

      // 按分类过滤
      const filtered =
        categoryFilter === "all"
          ? messages
          : messages.filter((msg) => {
              const cat =
                msg.category ??
                ((["work", "task_report", "task_assign"] as string[]).includes(msg.type)
                  ? "work"
                  : "chat");
              return cat === categoryFilter;
            });

      // 将 GroupMessage 转换为前端 chat.history 兼容的格式
      const formatted = filtered.map((msg) => ({
        role: msg.senderId === "user" ? "user" : "assistant",
        content: [{ type: "text", text: msg.content }],
        timestamp: msg.timestamp,
        // 附加群聊专属字段，供前端区分发言者
        __group_sender_id: msg.senderId,
        __group_sender_name: msg.senderName ?? msg.senderId,
        __group_msg_type: msg.type,
        __group_msg_category: msg.category ?? "chat",
        __group_msg_id: msg.id,
        __group_mentions: msg.mentions,
      }));

      respond(true, { messages: formatted, groupId }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to load group chat history: ${String(error)}`),
      );
    }
  },

  /**
   * 人类用户或 agent 在群聊窗口发送消息（写入 GroupMessageStorage，并根据消息分类路由到相应 session）
   *
   * 业界最佳实践路由逐辑（参考 Slack/Discord 不同频道功能 + AI agent 群聊研究）：
   *
   * 1. 聊天消息 (category=chat)——工前闲聊、社交、闲谈
   *    路由到： agent:id:group:groupId 群聊 session
   *    agent 感知到了群聊消息，但不一定会响应（由 agent 自己根据 system prompt 决定是否介入）
   *    这对应了“思考 vs 说话”模式——AI 看到聊天不强制响应
   *
   * 2. 工作消息 (category=work)——任务指令、工作请求、进度汇报
   *    路由到： agent:id:main 主 session（触发 agent 正式工作响应）
   *    另外也将消息投递到 agent:id:group:groupId 供历史记录可见
   *
   * 3. @点名触发——消息内含 @agentId 时，无论 category，被点名的 agent 都路由到主 session
   */
  "groups.chat.send": async ({ params, respond, context }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const content = params?.content ? String(params.content) : "";
      const senderId = params?.senderId ? String(params.senderId) : "user";
      const senderName = params?.senderName ? String(params.senderName) : "用户";

      if (!groupId || !content) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId and content are required"),
        );
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

      // 检查发送者发言权限（跳过系统/外部用户消息）
      if (senderId !== "system" && senderId !== "user") {
        if (!groupManager.canSpeak(groupId, senderId)) {
          const memberInfo = group.members.find((m) => m.agentId === senderId);
          const isMuted = memberInfo?.muted;
          const reason = isMuted ? `您已被禁言` : `当前群组已开启「仅管理员可发言」模式`;
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `无权发言：${reason}`));
          return;
        }
      }

      // 解析消息分类：调用方可显式传入 messageCategory，也可从消息类型推断
      const rawCategory = params?.messageCategory ? String(params.messageCategory) : undefined;
      // work 类型的消息类型在工作分类下
      const workMessageTypes = new Set(["work", "task_report", "task_assign", "command"]);
      const msgTypeStr = params?.messageType ? String(params.messageType) : "text";
      const category: "chat" | "work" =
        rawCategory === "work" || rawCategory === "chat"
          ? rawCategory
          : workMessageTypes.has(msgTypeStr)
            ? "work"
            : "chat";

      // 解析 @提及：从 content 中识别 @agentId（格式：@agentId 或 @{agentId}）
      const mentionRegex = /@\{?([a-zA-Z0-9_-]+)\}?/g;
      const parsedMentions: string[] = [];
      let mentionMatch: RegExpExecArray | null;
      while ((mentionMatch = mentionRegex.exec(content)) !== null) {
        const mentionedId = mentionMatch[1];
        // 只记录确实是群组成员的
        if (group.members.some((m) => m.agentId === mentionedId)) {
          parsedMentions.push(mentionedId);
        }
      }
      const mentions = Array.isArray(params?.mentions)
        ? params.mentions.map(String)
        : parsedMentions;

      // 任何被 @点名的消息按 work 路由
      const effectiveCategory: "chat" | "work" = mentions.length > 0 ? "work" : category;

      // 保存消息到群组存储
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const message = {
        id: messageId,
        groupId,
        senderId,
        senderName,
        content,
        type: (msgTypeStr ??
          "text") as import("../../sessions/group-message-storage.js").GroupMessageType,
        category: effectiveCategory,
        mentions: mentions.length > 0 ? mentions : undefined,
        timestamp: Date.now(),
      };
      await groupMessageStorage.saveMessage(message);

      // ============================================================
      // 消息路由逻辑（业界最佳实践）
      // ============================================================
      //
      // chat 消息：全员投递到 agent:id:group:groupId session（群聊历史展示）
      //   → agent 看到群聊但不一定响应（由 agent system prompt 决定）
      //
      // work 消息 / @点名：
      //   → 被点名的 agent: 投递到 agent:id:main（触发正式工作响应）
      //   → 未被点名的其它成员: 投递到 agent:id:group:groupId（可见历史）

      const chatNotifyBase = {
        runId: `group-msg-${messageId}`,
        seq: 1,
        state: "final" as const,
        message: {
          role: senderId === "user" ? "user" : "assistant",
          content: [{ type: "text", text: content }],
          timestamp: message.timestamp,
          __group_sender_id: senderId,
          __group_sender_name: senderName,
          __group_msg_id: messageId,
          __group_msg_type: msgTypeStr,
          __group_msg_category: effectiveCategory,
          __group_mentions: mentions.length > 0 ? mentions : undefined,
        },
      };

      let deliveredToMain = 0;
      let deliveredToGroup = 0;

      for (const member of group.members) {
        const isMentioned = mentions.includes(member.agentId);
        const _isWorkTarget = effectiveCategory === "work" && !isMentioned && mentions.length === 0;
        // 聊天消息或未被 @的工作消息: 投递到群聊 session
        const groupSessionKey = `agent:${member.agentId}:group:${groupId}`;
        // 被 @点名 / 所有人工作消息: 投递到主 session
        const mainSessionKey = `agent:${member.agentId}:main`;

        if (isMentioned) {
          // 被 @点名：投递到主 session（触发工作）
          context.nodeSendToSession(mainSessionKey, "chat", {
            ...chatNotifyBase,
            sessionKey: mainSessionKey,
          });
          // 同时投递到群聊 session（展示历史）
          context.nodeSendToSession(groupSessionKey, "chat", {
            ...chatNotifyBase,
            sessionKey: groupSessionKey,
          });
          deliveredToMain++;
        } else if (effectiveCategory === "work" && mentions.length === 0) {
          // work 消息但无 @：所有成员主 session都接收
          context.nodeSendToSession(mainSessionKey, "chat", {
            ...chatNotifyBase,
            sessionKey: mainSessionKey,
          });
          context.nodeSendToSession(groupSessionKey, "chat", {
            ...chatNotifyBase,
            sessionKey: groupSessionKey,
          });
          deliveredToMain++;
        } else {
          // chat 消息或已有具体 @对象时未被点名的成员: 仅投递到群聊 session
          context.nodeSendToSession(groupSessionKey, "chat", {
            ...chatNotifyBase,
            sessionKey: groupSessionKey,
          });
          deliveredToGroup++;
        }
      }

      console.log(
        `[Group Chat] Message ${messageId} (category=${effectiveCategory}, mentions=${mentions.length}) → main:${deliveredToMain} group:${deliveredToGroup} in group ${groupId}`,
      );

      // 向前端广播群聊新消息事件，使会话窗口实时更新
      context.broadcast(
        "group.chat.message",
        {
          groupId,
          message: {
            id: messageId,
            groupId,
            senderId,
            senderName,
            content,
            type: msgTypeStr as import("../../sessions/group-message-storage.js").GroupMessageType,
            timestamp: message.timestamp,
          },
          members: group.members.map((m) => m.agentId),
        },
        { dropIfSlow: false },
      );

      respond(true, { success: true, messageId, groupId }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to send group chat message: ${String(error)}`),
      );
    }
  },

  /**
   * 更换群主（转让群主权限）
   */
  "group.owner.transfer": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const newOwnerId = params?.newOwnerId ? String(params.newOwnerId) : "";

      if (!groupId || !newOwnerId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId and newOwnerId are required"),
        );
        return;
      }

      const group = await groupManager.transferOwner(groupId, newOwnerId);
      respond(true, { success: true, group }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to transfer group owner: ${String(error)}`),
      );
    }
  },

  /**
   * 升级群组为项目群
   */
  "groups.upgradeToProject": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      const projectId = params?.projectId ? String(params.projectId) : "";

      if (!groupId || !projectId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "groupId and projectId are required"),
        );
        return;
      }

      // 获取群组信息
      const group = groupManager.getGroup(groupId);
      if (!group) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Group "${groupId}" not found`),
        );
        return;
      }

      // 检查是否已经是项目群
      if (group.projectId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Group "${groupId}" is already a project group (bound to project "${group.projectId}")`,
          ),
        );
        return;
      }

      // 检查该 projectId 是否已被其他群绑定（防止重复绑定）
      const existingProjectGroup = groupManager
        .getAllGroups()
        .find((g) => g.id !== groupId && g.projectId === projectId);
      if (existingProjectGroup) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Project "${projectId}" is already bound to group "${existingProjectGroup.id}" ("${existingProjectGroup.name}"). A project can be bound to multiple groups, but please confirm this is intentional.`,
          ),
        );
        return;
      }

      // 验证项目是否存在 (通过检查项目工作空间)
      const projectWorkspaceExists = await import("../../utils/project-context.js").then(
        (m) => m.projectWorkspaceExists,
      );

      if (!projectWorkspaceExists(projectId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project "${projectId}" not found`),
        );
        return;
      }

      // 获取项目工作空间路径
      const buildProjectContext = await import("../../utils/project-context.js").then(
        (m) => m.buildProjectContext,
      );
      const projectCtx = buildProjectContext(projectId);
      const projectWorkspacePath = projectCtx.workspacePath;

      // 更新群组信息，绑定项目
      const updatedGroup = await groupManager.updateGroup(groupId, {
        projectId,
        workspacePath: projectWorkspacePath,
      });

      // 迁移群组工作空间到项目工作空间
      const groupWorkspaceManager = await import("../../workspace/group-workspace.js").then((m) =>
        m.GroupWorkspaceManager.getInstance(),
      );

      // 更新群组工作空间目录映射
      groupWorkspaceManager.updateGroupWorkspaceDir(groupId, projectWorkspacePath);

      // 同步 PROJECT_CONFIG.json 配置（如果存在）
      const fs = await import("fs");
      const path = await import("path");
      const projectConfigPath = path.join(projectWorkspacePath, "PROJECT_CONFIG.json");

      if (fs.existsSync(projectConfigPath)) {
        // 项目配置已存在，无需额外操作
        console.log(
          `[Group Upgrade] Group ${groupId} upgraded to project group for project ${projectId}`,
        );
      } else {
        // 项目配置不存在，记录警告
        console.warn(
          `[Group Upgrade] PROJECT_CONFIG.json not found in project workspace: ${projectWorkspacePath}`,
        );
      }

      // 发送系统消息通知所有成员
      await groupManager.sendSystemMessage(
        groupId,
        `🎉 群组已升级为项目群！

绑定项目：${projectId}
工作空间：${projectWorkspacePath}

⚠️ 注意：项目群无法降级为普通群。
💡 提示：项目工作空间和项目群工作空间已完全绑定，任意一方更新都会同步到另一方。`,
      );

      respond(
        true,
        { success: true, group: updatedGroup, workspacePath: projectWorkspacePath },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to upgrade group to project: ${String(error)}`),
      );
    }
  },
};
