// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Groups Management RPC Methods
 * 群组管理的 RPC 方法处理器
 */

import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import {
  readConfigFileSnapshot,
  loadConfig,
  writeConfigFile,
} from "../../../upstream/src/config/config.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import type { GroupMemberRole } from "../../sessions/group-manager.js";
import { groupManager } from "../../sessions/group-manager.js";
import { groupMessageStorage } from "../../sessions/group-message-storage.js";

/**
 * 获取当前系统中所有有效的 normalizedAgentId 集合。
 * 配置读取失败时返回空集合（安全退化：不做清理）。
 */
async function getValidAgentIdSet(): Promise<Set<string>> {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid) {
    return new Set<string>();
  }
  return new Set(listAgentEntries(snapshot.config).map((a) => normalizeAgentId(a.id)));
}

/**
 * 验证 agentId 在配置中真实存在（防止僵尸成员入群）
 * @returns 错误信息，无错误则返回 null
 */
async function validateAgentExists(agentId: string): Promise<string | null> {
  const validIds = await getValidAgentIdSet();
  if (validIds.size === 0) {
    // 配置无效时不拒绝，避免配置异常时把所有操作都卡死
    return null;
  }
  const normalized = normalizeAgentId(agentId);
  if (!validIds.has(normalized)) {
    return `Agent "${agentId}" does not exist in the system`;
  }
  return null;
}

/**
 * 懒清理：检测群组中的僵尸成员并立即移除。
 * 在式第返回群组数据之前调用，保证返回内容常远不含僵尸成员。
 * 失败时静默吃错，不阻断主流程。
 */
async function lazyPurgeGhosts(): Promise<void> {
  try {
    const validIds = await getValidAgentIdSet();
    // 配置读取失败时不执行清理，避免把所有成员误删
    if (validIds.size === 0) {
      return;
    }
    groupManager.purgeGhostMembers(validIds);
  } catch (err) {
    console.error("[groups] lazyPurgeGhosts error:", err);
  }
}

/**
 * 群组管理 RPC 方法处理器
 */
export const groupsHandlers: GatewayRequestHandlers = {
  /**
   * 获取群组列表
   */
  "groups.list": async ({ params, respond }) => {
    try {
      // 懒清理：返回数据前先移除所有群组中的僵尸成员
      await lazyPurgeGhosts();

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

      // 懒清理：返回详情前先移除僵尸成员
      await lazyPurgeGhosts();

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

      // 验证 ownerId 存在
      const ownerError = await validateAgentExists(ownerId);
      if (ownerError) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, ownerError));
        return;
      }

      // 过滤 initialMembers：只保留系统中真实存在的 agentId
      const rawInitialMembers = Array.isArray(params?.initialMembers)
        ? params.initialMembers.map(String)
        : [];
      const snapshot = await readConfigFileSnapshot();
      const validAgentIds = snapshot.valid
        ? new Set(listAgentEntries(snapshot.config).map((a) => normalizeAgentId(a.id)))
        : new Set<string>();
      const filteredInitialMembers = rawInitialMembers.filter((id) =>
        validAgentIds.has(normalizeAgentId(id)),
      );
      if (filteredInitialMembers.length < rawInitialMembers.length) {
        const ghosts = rawInitialMembers.filter((id) => !validAgentIds.has(normalizeAgentId(id)));
        console.warn(
          `[groups.create] Filtered out ${ghosts.length} non-existent initialMember(s): ${ghosts.join(", ")}`,
        );
      }

      const group = await groupManager.createGroup({
        id,
        name,
        ownerId,
        description: params?.description ? String(params.description) : undefined,
        isPublic: typeof params?.isPublic === "boolean" ? params.isPublic : false,
        maxMembers: typeof params?.maxMembers === "number" ? params.maxMembers : 500,
        initialMembers: filteredInitialMembers,
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

      // 验证 agentId 在系统中真实存在，防止僵尸成员写入群组
      const agentError = await validateAgentExists(agentId);
      if (agentError) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, agentError));
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
   * 
   * 完整的空间迁移逻辑：
   * 1. 项目使用群组的workspacePath（而不是群组使用项目的）
   * 2. 将原项目空间的文件迁移到群组空间
   * 3. 空间完整合并（项目文件 + 群组文件）
   * 4. 自动配置记忆空间（在PROJECT_CONFIG.json中写入memorySpace）
   * 5. 删除原项目空间
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

      const fs = await import("fs");
      const path = await import("path");

      // 获取项目工作空间路径（原项目空间）
      const buildProjectContext = await import("../../utils/project-context.js").then(
        (m) => m.buildProjectContext,
      );
      const projectCtx = buildProjectContext(projectId);
      const projectWorkspacePath = projectCtx.workspacePath;

      // 获取群组工作空间路径（目标空间，将作为新的项目空间）
      const groupWorkspaceManager = await import("../../workspace/group-workspace.js").then((m) =>
        m.GroupWorkspaceManager.getInstance(),
      );
      const groupWorkspacePath = groupWorkspaceManager.getGroupWorkspaceDir(groupId);

      console.log(`[Group Upgrade] Starting space migration:`);
      console.log(`  - Group ID: ${groupId}`);
      console.log(`  - Project ID: ${projectId}`);
      console.log(`  - Project Workspace (source): ${projectWorkspacePath}`);
      console.log(`  - Group Workspace (target): ${groupWorkspacePath}`);

      // ========== 步骤 1: 确保群组工作空间存在 ==========
      if (!fs.existsSync(groupWorkspacePath)) {
        console.log(`[Group Upgrade] Creating group workspace: ${groupWorkspacePath}`);
        fs.mkdirSync(groupWorkspacePath, { recursive: true });
      }

      // ========== 步骤 2: 迁移项目空间文件到群组空间 ==========
      let migrationStats = {
        filesCopied: 0,
        dirsCopied: 0,
        totalSize: 0,
      };

      if (fs.existsSync(projectWorkspacePath)) {
        console.log(`[Group Upgrade] Migrating project workspace to group workspace...`);
        
        // 复制目录的递归函数
        const copyDir = async (src: string, dest: string): Promise<{ files: number; dirs: number; size: number }> => {
          let stats = { files: 0, dirs: 0, size: 0 };
          
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }

          const entries = fs.readdirSync(src, { withFileTypes: true });
          
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
              // 跳过 node_modules、.git 等目录
              if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.cache') {
                continue;
              }
              
              const subStats = await copyDir(srcPath, destPath);
              stats.dirs += subStats.dirs + 1;
              stats.files += subStats.files;
              stats.size += subStats.size;
            } else {
              // 复制文件
              fs.copyFileSync(srcPath, destPath);
              const stat = fs.statSync(srcPath);
              stats.files++;
              stats.size += stat.size;
            }
          }
          
          return stats;
        };

        // 执行迁移
        migrationStats = await copyDir(projectWorkspacePath, groupWorkspacePath);
        console.log(`[Group Upgrade] Migration completed: ${migrationStats.files} files, ${migrationStats.dirs} dirs copied`);
      } else {
        console.log(`[Group Upgrade] Project workspace does not exist, skipping file migration`);
      }

      // ========== 步骤 3: 创建记忆空间配置 ==========
      const memorySpacePath = path.join(groupWorkspacePath, "memory");
      if (!fs.existsSync(memorySpacePath)) {
        console.log(`[Group Upgrade] Creating memory space: ${memorySpacePath}`);
        fs.mkdirSync(memorySpacePath, { recursive: true });
      }

      // ========== 步骤 4: 更新 PROJECT_CONFIG.json ==========
      const projectConfigPath = path.join(groupWorkspacePath, "PROJECT_CONFIG.json");
      
      let projectConfig: any = {};
      if (fs.existsSync(projectConfigPath)) {
        // 读取现有配置
        projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
      } else {
        // 创建新配置
        projectConfig = {
          projectId,
          workspacePath: groupWorkspacePath,
        };
      }

      // 更新工作空间路径为群组空间
      projectConfig.workspacePath = groupWorkspacePath;

      // 添加记忆空间配置
      projectConfig.memorySpace = {
        path: memorySpacePath,
        sourceGroupId: groupId,
        migratedAt: Date.now(),
        description: `来自群组 ${groupId} 的协作空间`,
        enabled: true,
      };

      // 保存配置
      fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2), "utf-8");
      console.log(`[Group Upgrade] PROJECT_CONFIG.json updated with memory space configuration`);

      // ========== 步骤 5: 更新群组信息，绑定项目 ==========
      const updatedGroup = await groupManager.updateGroup(groupId, {
        projectId,
        workspacePath: groupWorkspacePath, // 群组使用自己的空间路径
      });

      // 更新群组工作空间目录映射（内存）
      groupWorkspaceManager.updateGroupWorkspaceDir(groupId, groupWorkspacePath);

      // 持久化到 openclaw.json
      try {
        const currentConfig = loadConfig();
        const existingOverrides =
          ((currentConfig as Record<string, unknown> & { groups?: Record<string, unknown> })?.groups
            ?.overrides as Record<string, unknown>) ?? {};
        const updatedConfig = {
          ...currentConfig,
          groups: {
            ...((currentConfig as Record<string, unknown>).groups as Record<string, unknown>),
            overrides: {
              ...existingOverrides,
              [groupId]: {
                ...(existingOverrides[groupId] as Record<string, unknown>),
                workspaceDir: groupWorkspacePath,
              },
            },
          },
        };
        await writeConfigFile(updatedConfig);
      } catch (persistErr) {
        console.warn(
          `[Group Upgrade] Failed to persist workspace override to openclaw.json: ${String(persistErr)}`,
        );
      }

      // ========== 步骤 6: 删除原项目空间 ==========
      if (projectWorkspacePath !== groupWorkspacePath && fs.existsSync(projectWorkspacePath)) {
        try {
          console.log(`[Group Upgrade] Removing old project workspace: ${projectWorkspacePath}`);
          fs.rmSync(projectWorkspacePath, { recursive: true, force: true });
          console.log(`[Group Upgrade] Old project workspace removed`);
        } catch (removeErr) {
          console.warn(
            `[Group Upgrade] Failed to remove old project workspace: ${String(removeErr)}`,
          );
          // 不影响主流程，继续执行
        }
      }

      // ========== 步骤 7: 发送系统消息通知 ==========
      await groupManager.sendSystemMessage(
        groupId,
        `🎉 群组已升级为项目群！

绑定项目：${projectId}
工作空间：${groupWorkspacePath}

📦 空间迁移完成：
- 已迁移 ${migrationStats.files} 个文件、${migrationStats.dirs} 个目录
- 原项目空间已合并到群组空间
- 记忆空间已自动配置：${memorySpacePath}
- 原项目空间已清理

⚠️ 注意：项目群无法降级为普通群。
💡 提示：群组空间现在是项目的协作中心，所有成员可以在此协作。`,
      );

      respond(
        true,
        {
          success: true,
          group: updatedGroup,
          workspacePath: groupWorkspacePath,
          memorySpacePath: memorySpacePath,
          migrationStats: {
            filesCopied: migrationStats.files,
            dirsCopied: migrationStats.dirs,
            totalSize: migrationStats.size,
          },
        },
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

  /**
   * 主动清理所有群组中的僵尸成员（不存在于 agents.list 中的成员）。
   * 可由管理员或主控 AI 主动调用以修复历史存量僵尸数据。
   */
  "groups.purgeGhosts": async ({ respond }) => {
    try {
      const validIds = await getValidAgentIdSet();
      if (validIds.size === 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            "Failed to read agent config; aborting purge to avoid data loss",
          ),
        );
        return;
      }
      const result = groupManager.purgeGhostMembers(validIds);
      respond(
        true,
        {
          success: true,
          groupsAffected: result.groupsAffected,
          membersRemoved: result.membersRemoved,
          details: result.details,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to purge ghost members: ${String(error)}`),
      );
    }
  },

  // ============================================================================
  // 群组空间配置 RPC 接口
  // ============================================================================

  /**
   * 配置群组空间继承行为
   * 
   * 当群组绑定项目后，可以配置：
   * 1. 是否继承项目的业务空间配置
   * 2. 是否使用自定义的群组工作空间
   */
  "groups.spaces.configure": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }

      // 获取群组信息
      const group = groupManager.getGroup(groupId);
      if (!group) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Group not found"));
        return;
      }

      // 解析配置参数
      const inheritProjectSpaces = params?.inheritProjectSpaces !== undefined
        ? params.inheritProjectSpaces === true
        : undefined;
      
      const customWorkspacePath = params?.workspacePath
        ? String(params.workspacePath)
        : undefined;

      // 更新群组配置
      const updates: Partial<import("../../sessions/group-manager.js").GroupInfo> = {};

      if (inheritProjectSpaces !== undefined) {
        // 在 metadata 中存储继承配置
        const metadata = group.metadata || {};
        metadata.inheritProjectSpaces = inheritProjectSpaces;
        updates.metadata = metadata;
      }

      if (customWorkspacePath !== undefined) {
        updates.workspacePath = customWorkspacePath;
      }

      // 如果有更新，保存配置
      if (Object.keys(updates).length > 0) {
        const updatedGroup = groupManager.updateGroup(groupId, updates);
        
        respond(
          true,
          {
            success: true,
            group: updatedGroup,
            inheritProjectSpaces: updatedGroup.metadata?.inheritProjectSpaces,
            workspacePath: updatedGroup.workspacePath,
          },
          undefined,
        );
      } else {
        respond(true, { success: false, message: "No updates provided" }, undefined);
      }
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to configure spaces: ${String(error)}`),
      );
    }
  },

  /**
   * 获取群组空间配置信息
   * 
   * 返回：
   * 1. 群组的当前配置（继承/自定义）
   * 2. 如果绑定项目，返回项目的业务空间列表（供前端展示）
   */
  "groups.spaces.getConfig": async ({ params, respond }) => {
    try {
      const groupId = params?.groupId ? String(params.groupId) : "";
      if (!groupId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "groupId is required"));
        return;
      }

      const group = groupManager.getGroup(groupId);
      if (!group) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Group not found"));
        return;
      }

      // 如果群组绑定了项目，获取项目的业务空间和记忆空间配置
      let projectSpaces: Array<{
        type: string;
        path: string;
        description?: string;
        enabled?: boolean;
      }> = [];
      let memorySpace: {
        path: string;
        description?: string;
        enabled?: boolean;
      } | null = null;

      if (group.projectId) {
        const { resolveBusinessSpaces, resolveMemorySpace } = await import("../../utils/project-context.js");
        projectSpaces = resolveBusinessSpaces(group.projectId);
        memorySpace = resolveMemorySpace(group.projectId);
      }

      respond(
        true,
        {
          group: {
            id: group.id,
            name: group.name,
            projectId: group.projectId,
            workspacePath: group.workspacePath,
            metadata: group.metadata,
          },
          memorySpace, // 记忆空间
          projectSpaces, // 业务空间
          inheritProjectSpaces: group.metadata?.inheritProjectSpaces !== false, // 默认继承
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get spaces config: ${String(error)}`),
      );
    }
  },
};
