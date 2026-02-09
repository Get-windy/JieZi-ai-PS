/**
 * Phase 6: Agent-to-Agent 群组会话协调器
 *
 * 统一协调群组消息、成员管理、工作空间的集成系统
 */

import { groupWorkspaceManager } from "../workspace/group-workspace.js";
import { groupManager, type GroupInfo, type GroupMember } from "./group-manager.js";
import { groupMessageStorage, type GroupMessage } from "./group-message-storage.js";

/**
 * 发送消息选项
 */
export interface SendMessageOptions {
  /** 回复的消息ID */
  replyToId?: string;

  /** 提及的智能助手 */
  mentions?: string[];

  /** 附件 */
  attachments?: Array<{
    type: string;
    url: string;
    name: string;
    size?: number;
  }>;

  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 群组会话协调器
 */
export class GroupSessionCoordinator {
  /**
   * 创建群组并初始化所有相关系统
   */
  async createGroup(params: {
    id: string;
    name: string;
    ownerId: string;
    description?: string;
    isPublic?: boolean;
    maxMembers?: number;
    initialMembers?: string[];
  }): Promise<GroupInfo> {
    const group = await groupManager.createGroup(params);

    // 确保工作空间已创建
    groupWorkspaceManager.ensureGroupWorkspace(params.id, params.name, params.ownerId);

    return group;
  }

  /**
   * 发送消息到群组
   */
  async sendMessage(
    groupId: string,
    senderId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<GroupMessage> {
    // 检查群组是否存在
    const group = groupManager.getGroup(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 检查发送者是否有权限发言
    if (!groupManager.canSpeak(groupId, senderId)) {
      throw new Error(`Agent "${senderId}" is muted in group "${groupId}"`);
    }

    // 获取发送者信息
    const members = groupManager.getMembers(groupId);
    const sender = members.find((m) => m.agentId === senderId);

    if (!sender) {
      throw new Error(`Agent "${senderId}" is not a member of group "${groupId}"`);
    }

    // 创建消息
    const message: GroupMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      groupId,
      senderId,
      senderName: sender.nickname || senderId,
      content,
      type: "text",
      timestamp: Date.now(),
      replyToId: options?.replyToId,
      attachments: options?.attachments,
      mentions: options?.mentions,
      metadata: options?.metadata,
    };

    // 保存消息
    await groupMessageStorage.saveMessage(message);

    console.log(`[Group Session] Agent ${senderId} sent message to group ${groupId}`);
    return message;
  }

  /**
   * 获取群组消息历史
   */
  async getMessages(
    groupId: string,
    options?: {
      limit?: number;
      before?: number;
      after?: number;
    },
  ): Promise<GroupMessage[]> {
    return await groupMessageStorage.loadMessages(groupId, options);
  }

  /**
   * 搜索群组消息
   */
  async searchMessages(
    groupId: string,
    query: string,
    options?: {
      limit?: number;
      caseSensitive?: boolean;
    },
  ): Promise<GroupMessage[]> {
    return await groupMessageStorage.searchMessages(groupId, query, options);
  }

  /**
   * 添加成员到群组
   */
  async addMember(groupId: string, agentId: string, addedBy: string): Promise<void> {
    // 检查操作者权限（只有owner和admin可以添加成员）
    const group = groupManager.getGroup(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const operator = group.members.find((m) => m.agentId === addedBy);
    if (!operator || (operator.role !== "owner" && operator.role !== "admin")) {
      throw new Error(`Agent "${addedBy}" does not have permission to add members`);
    }

    await groupManager.addMember(groupId, agentId);
  }

  /**
   * 移除群组成员
   */
  async removeMember(groupId: string, agentId: string, removedBy: string): Promise<void> {
    // 检查操作者权限
    const group = groupManager.getGroup(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const operator = group.members.find((m) => m.agentId === removedBy);
    if (!operator || (operator.role !== "owner" && operator.role !== "admin")) {
      throw new Error(`Agent "${removedBy}" does not have permission to remove members`);
    }

    await groupManager.removeMember(groupId, agentId);
  }

  /**
   * 获取群组信息（包含消息统计）
   */
  async getGroupInfo(groupId: string): Promise<{
    group: GroupInfo;
    metadata: {
      totalMessages: number;
      lastActiveAt: number;
      members: GroupMember[];
    };
  } | null> {
    const group = groupManager.getGroup(groupId);
    if (!group) {
      return null;
    }

    const metadata = await groupMessageStorage.getMetadata(groupId);

    return {
      group,
      metadata: {
        totalMessages: metadata?.totalMessages || 0,
        lastActiveAt: metadata?.lastActiveAt || group.createdAt,
        members: group.members,
      },
    };
  }

  /**
   * 获取智能助手的所有群组
   */
  getAgentGroups(agentId: string): GroupInfo[] {
    return groupManager.getAgentGroups(agentId);
  }

  /**
   * 获取智能助手在群组的统计信息
   */
  async getAgentStats(
    groupId: string,
    agentId: string,
  ): Promise<{
    totalMessages: number;
    firstMessageAt?: number;
    lastMessageAt?: number;
    role?: string;
    joinedAt?: number;
  }> {
    const stats = await groupMessageStorage.getAgentStats(groupId, agentId);
    const group = groupManager.getGroup(groupId);
    const member = group?.members.find((m) => m.agentId === agentId);

    return {
      ...stats,
      role: member?.role,
      joinedAt: member?.joinedAt,
    };
  }

  /**
   * 禁言/解除禁言成员
   */
  async muteMember(
    groupId: string,
    agentId: string,
    muted: boolean,
    operatorId: string,
  ): Promise<void> {
    // 检查操作者权限
    const group = groupManager.getGroup(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const operator = group.members.find((m) => m.agentId === operatorId);
    if (!operator || (operator.role !== "owner" && operator.role !== "admin")) {
      throw new Error(`Agent "${operatorId}" does not have permission to mute members`);
    }

    await groupManager.muteMember(groupId, agentId, muted);
  }

  /**
   * 更新群组信息
   */
  async updateGroup(
    groupId: string,
    updates: Partial<Pick<GroupInfo, "name" | "description" | "isPublic" | "maxMembers" | "tags">>,
    operatorId: string,
  ): Promise<GroupInfo> {
    // 检查操作者权限
    const group = groupManager.getGroup(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const operator = group.members.find((m) => m.agentId === operatorId);
    if (!operator || (operator.role !== "owner" && operator.role !== "admin")) {
      throw new Error(`Agent "${operatorId}" does not have permission to update group`);
    }

    return await groupManager.updateGroup(groupId, updates);
  }

  /**
   * 删除群组
   */
  async deleteGroup(groupId: string, operatorId: string): Promise<void> {
    // 检查操作者权限（只有owner可以删除）
    const group = groupManager.getGroup(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    if (operatorId !== group.ownerId) {
      throw new Error(`Only owner can delete group "${groupId}"`);
    }

    // 删除工作空间
    groupWorkspaceManager.deleteGroupWorkspace(groupId, operatorId);

    // 删除群组
    await groupManager.deleteGroup(groupId);
  }

  /**
   * 添加好友
   */
  async addFriend(agentA: string, agentB: string, initiator: string): Promise<void> {
    await groupManager.addFriend(agentA, agentB, initiator);
  }

  /**
   * 确认好友
   */
  async confirmFriend(agentA: string, agentB: string): Promise<void> {
    await groupManager.confirmFriend(agentA, agentB);
  }

  /**
   * 删除好友
   */
  async removeFriend(agentA: string, agentB: string): Promise<void> {
    await groupManager.removeFriend(agentA, agentB);
  }

  /**
   * 检查是否为好友
   */
  isFriend(agentA: string, agentB: string): boolean {
    return groupManager.isFriend(agentA, agentB);
  }

  /**
   * 获取好友列表
   */
  getFriends(agentId: string): string[] {
    return groupManager.getFriends(agentId);
  }

  /**
   * 一对一私聊（基于好友关系的特殊群组）
   */
  async sendDirectMessage(
    fromAgent: string,
    toAgent: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<GroupMessage> {
    // 检查是否为好友
    if (!this.isFriend(fromAgent, toAgent)) {
      throw new Error(`Agent "${fromAgent}" and "${toAgent}" are not friends`);
    }

    // 生成私聊群组ID（保证A-B和B-A是同一个群组）
    const [sortedA, sortedB] = [fromAgent, toAgent].sort();
    const dmGroupId = `dm-${sortedA}-${sortedB}`;

    // 确保私聊群组存在
    let group = groupManager.getGroup(dmGroupId);
    if (!group) {
      group = await this.createGroup({
        id: dmGroupId,
        name: `${fromAgent} ↔ ${toAgent}`,
        ownerId: fromAgent,
        isPublic: false,
        maxMembers: 2,
        initialMembers: [toAgent],
      });
    }

    // 发送消息
    return await this.sendMessage(dmGroupId, fromAgent, content, options);
  }

  /**
   * 获取私聊历史
   */
  async getDirectMessages(
    agentA: string,
    agentB: string,
    options?: {
      limit?: number;
      before?: number;
      after?: number;
    },
  ): Promise<GroupMessage[]> {
    const [sortedA, sortedB] = [agentA, agentB].sort();
    const dmGroupId = `dm-${sortedA}-${sortedB}`;

    return await this.getMessages(dmGroupId, options);
  }
}

/**
 * 全局群组会话协调器实例
 */
export const groupSessionCoordinator = new GroupSessionCoordinator();
