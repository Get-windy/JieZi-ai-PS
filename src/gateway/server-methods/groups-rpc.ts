// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Groups Management RPC Methods
 * 群组管理的 RPC 方法处理器
 */

import type { GroupMemberRole } from "../../sessions/group-manager.js";
import { groupManager } from "../../sessions/group-manager.js";
import { groupMessageStorage } from "../../sessions/group-message-storage.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

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
          "name" | "description" | "isPublic" | "maxMembers" | "tags"
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
      const messages = await groupMessageStorage.loadMessages(groupId, { limit });

      // 将 GroupMessage 转换为前端 chat.history 兼容的格式
      const formatted = messages.map((msg) => ({
        role: msg.senderId === "user" ? "user" : "assistant",
        content: [{ type: "text", text: msg.content }],
        timestamp: msg.timestamp,
        // 附加群聊专属字段，供前端区分发言者
        __group_sender_id: msg.senderId,
        __group_sender_name: msg.senderName ?? msg.senderId,
        __group_msg_type: msg.type,
        __group_msg_id: msg.id,
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
   * 人类用户在群聊窗口发送消息（写入 GroupMessageStorage，并通知所有成员 agent）
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

      // 保存消息到群组存储
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const message = {
        id: messageId,
        groupId,
        senderId,
        senderName,
        content,
        type: "text" as const,
        timestamp: Date.now(),
      };
      await groupMessageStorage.saveMessage(message);

      // 向每个 Agent 成员的群聊 session 推送 chat 事件，使 Agent 感知到新消息
      // sessionKey 格式: agent:{agentId}:group:{groupId}
      const chatNotifyPayload = {
        runId: `group-msg-${messageId}`,
        sessionKey: "", // 每个成员单独设置
        seq: 1,
        state: "final" as const,
        message: {
          role: senderId === "user" ? "user" : "assistant",
          content: [{ type: "text", text: content }],
          timestamp: message.timestamp,
          __group_sender_id: senderId,
          __group_sender_name: senderName,
          __group_msg_id: messageId,
          __group_msg_type: "text",
        },
      };
      for (const member of group.members) {
        const memberSessionKey = `agent:${member.agentId}:group:${groupId}`;
        context.nodeSendToSession(memberSessionKey, "chat", {
          ...chatNotifyPayload,
          sessionKey: memberSessionKey,
        });
      }
      console.log(
        `[Group Chat] Message ${messageId} delivered to ${group.members.length} member sessions in group ${groupId}`,
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
            type: "text",
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
   * 升级群组为项目群
   */
  "groups.upgradeToProject": async ({ params, respond, context }) => {
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
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Group "${groupId}" not found`));
        return;
      }

      // 检查是否已经是项目群
      if (group.projectId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.FAILED_PRECONDITION,
            `Group "${groupId}" is already a project group (bound to project "${group.projectId}")`,
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
          errorShape(ErrorCodes.NOT_FOUND, `Project "${projectId}" not found`),
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
      const groupWorkspaceManager = await import("../../workspace/group-workspace.js").then(
        (m) => m.GroupWorkspaceManager.getInstance(),
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

      respond(true, { success: true, group: updatedGroup, workspacePath: projectWorkspacePath }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to upgrade group to project: ${String(error)}`),
      );
    }
  },
};
