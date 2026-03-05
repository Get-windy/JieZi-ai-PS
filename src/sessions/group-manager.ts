/* oxlint-disable */
/**
 * Phase 6: Agent-to-Agent 群组管理系统
 *
 * 功能：
 * - 群组创建/删除
 * - 成员管理（添加/移除/权限）
 * - 群组信息查询
 * - 一对一好友关系管理
 */

import { groupWorkspaceManager } from "../workspace/group-workspace.js";
import type { GroupMessage, GroupSessionMetadata } from "./group-message-storage.js";
import { groupMessageStorage } from "./group-message-storage.js";

/**
 * 群组成员角色
 */
export type GroupMemberRole = "owner" | "admin" | "member";

/**
 * 群组成员信息
 */
export interface GroupMember {
  /** 智能助手ID */
  agentId: string;

  /** 成员角色 */
  role: GroupMemberRole;

  /** 加入时间 */
  joinedAt: number;

  /** 是否禁言 */
  muted?: boolean;

  /** 昵称（在群组中的显示名） */
  nickname?: string;
}

/**
 * 群组类型
 */
export type GroupType = "work" | "learning" | "interest" | "custom";

/**
 * 群组信息
 */
export interface GroupInfo {
  /** 群组ID */
  id: string;

  /** 群组名称 */
  name: string;

  /** 群组描述 */
  description?: string;

  /** 创建者ID */
  ownerId: string;

  /** 创建时间 */
  createdAt: number;

  /** 成员列表 */
  members: GroupMember[];

  /** 最大成员数 */
  maxMembers?: number;

  /** 是否公开 */
  isPublic: boolean;

  /** 群组标签 */
  tags?: string[];

  /** 群组类型 */
  type?: GroupType;

  /** 是否需要审批 */
  requireApproval?: boolean;

  /** 群组配置 */
  config?: {
    /** 允许普通成员邀请其他人 */
    allowInvite?: boolean;
    /** 允许所有人发言 */
    allowSpeak?: boolean;
    /** 置顶消息 */
    pinMessages?: string[];
  };

  /** 共享资源 */
  resources?: {
    /** 文档 */
    documents?: string[];
    /** 知识库 */
    knowledgeBase?: string[];
    /** 工作空间 */
    workspace?: string;
  };

  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 好友关系状态
 */
export type FriendStatus = "pending" | "accepted" | "blocked" | "archived";

/**
 * 一对一好友关系（扩展版）
 */
export interface FriendRelation {
  /** 关系ID */
  id: string;

  /** 智能助手A的ID */
  agentA: string;

  /** 智能助手B的ID */
  agentB: string;

  /** 建立时间 */
  createdAt: number;

  /** 接受时间 */
  acceptedAt?: number;

  /** 是否双向确认 */
  confirmed: boolean;

  /** 发起者 */
  initiator: string;

  /** 关系状态 */
  status: FriendStatus;

  /** 备注（A对B的备注） */
  remarkA?: string;

  /** 备注（B对A的备注） */
  remarkB?: string;

  /** A给B的昵称 */
  nicknameA?: string;

  /** B给A的昵称 */
  nicknameB?: string;

  /** A的标签（多个标签用于分类） */
  tagsA?: string[];

  /** B的标签 */
  tagsB?: string[];

  /** A的分组 */
  groupA?: string;

  /** B的分组 */
  groupB?: string;

  /** 消息交互次数 */
  messageCount: number;

  /** 最后消息时间 */
  lastMessageAt?: number;

  /** 协作次数（共同参与的任务/项目） */
  collaborationCount: number;

  /** 元数据（用于存储其他自定义信息） */
  metadata?: Record<string, any>;
}

/**
 * 群组管理器
 */
export class GroupManager {
  private groups: Map<string, GroupInfo> = new Map();
  private friendRelations: Map<string, FriendRelation> = new Map();

  /**
   * 创建群组
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
    const {
      id,
      name,
      ownerId,
      description,
      isPublic = false,
      maxMembers = 500,
      initialMembers = [],
    } = params;

    // 检查群组是否已存在
    if (this.groups.has(id)) {
      throw new Error(`Group with ID "${id}" already exists`);
    }

    // 创建群组工作空间
    groupWorkspaceManager.ensureGroupWorkspace(id, name, ownerId);

    // 创建群组信息
    const group: GroupInfo = {
      id,
      name,
      description,
      ownerId,
      createdAt: Date.now(),
      members: [
        {
          agentId: ownerId,
          role: "owner",
          joinedAt: Date.now(),
        },
      ],
      maxMembers,
      isPublic,
    };

    // 添加初始成员
    for (const agentId of initialMembers) {
      if (agentId !== ownerId) {
        group.members.push({
          agentId,
          role: "member",
          joinedAt: Date.now(),
        });
      }
    }

    this.groups.set(id, group);

    // 初始化元数据
    await groupMessageStorage.updateMetadata(id, {
      groupId: id,
      groupName: name,
      createdAt: group.createdAt,
      lastActiveAt: Date.now(),
      totalMessages: 0,
      members: group.members.map((m) => m.agentId),
      archived: false,
    });

    // 发送系统消息
    await this.sendSystemMessage(id, `群组 "${name}" 已创建`);

    console.log(`[Group Manager] Created group ${id} with ${group.members.length} members`);
    return group;
  }

  /**
   * 获取群组信息
   */
  getGroup(groupId: string): GroupInfo | null {
    return this.groups.get(groupId) || null;
  }

  /**
   * 更新群组信息
   */
  async updateGroup(
    groupId: string,
    updates: Partial<Pick<GroupInfo, "name" | "description" | "isPublic" | "maxMembers" | "tags">>,
  ): Promise<GroupInfo> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    Object.assign(group, updates);
    this.groups.set(groupId, group);

    // 更新元数据
    if (updates.name) {
      await groupMessageStorage.updateMetadata(groupId, { groupName: updates.name });
    }

    // 发送系统消息
    if (updates.name) {
      await this.sendSystemMessage(groupId, `群组名称已更新为 "${updates.name}"`);
    }

    return group;
  }

  /**
   * 添加成员到群组
   */
  async addMember(
    groupId: string,
    agentId: string,
    role: GroupMemberRole = "member",
  ): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 检查成员是否已存在
    if (group.members.some((m) => m.agentId === agentId)) {
      throw new Error(`Agent "${agentId}" is already a member of group "${groupId}"`);
    }

    // 检查成员数量限制
    if (group.maxMembers && group.members.length >= group.maxMembers) {
      throw new Error(`Group "${groupId}" has reached maximum members (${group.maxMembers})`);
    }

    // 添加成员
    group.members.push({
      agentId,
      role,
      joinedAt: Date.now(),
    });

    // 更新元数据
    await groupMessageStorage.updateMetadata(groupId, {
      members: group.members.map((m) => m.agentId),
    });

    // 发送系统消息
    await this.sendSystemMessage(groupId, `${agentId} 加入了群组`);

    console.log(`[Group Manager] Added member ${agentId} to group ${groupId}`);
  }

  /**
   * 从群组移除成员
   */
  async removeMember(groupId: string, agentId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 不能移除群主
    if (agentId === group.ownerId) {
      throw new Error("Cannot remove group owner");
    }

    // 移除成员
    const originalLength = group.members.length;
    group.members = group.members.filter((m) => m.agentId !== agentId);

    if (group.members.length === originalLength) {
      throw new Error(`Agent "${agentId}" is not a member of group "${groupId}"`);
    }

    // 更新元数据
    await groupMessageStorage.updateMetadata(groupId, {
      members: group.members.map((m) => m.agentId),
    });

    // 发送系统消息
    await this.sendSystemMessage(groupId, `${agentId} 离开了群组`);

    console.log(`[Group Manager] Removed member ${agentId} from group ${groupId}`);
  }

  /**
   * 更新成员角色
   */
  async updateMemberRole(
    groupId: string,
    agentId: string,
    newRole: GroupMemberRole,
  ): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const member = group.members.find((m) => m.agentId === agentId);
    if (!member) {
      throw new Error(`Agent "${agentId}" is not a member of group "${groupId}"`);
    }

    // 不能修改群主角色
    if (agentId === group.ownerId && newRole !== "owner") {
      throw new Error("Cannot change owner role");
    }

    const oldRole = member.role;
    member.role = newRole;

    // 发送系统消息
    await this.sendSystemMessage(groupId, `${agentId} 的角色从 ${oldRole} 变更为 ${newRole}`);
  }

  /**
   * 禁言/解除禁言成员
   */
  async muteMember(groupId: string, agentId: string, muted: boolean): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const member = group.members.find((m) => m.agentId === agentId);
    if (!member) {
      throw new Error(`Agent "${agentId}" is not a member of group "${groupId}"`);
    }

    member.muted = muted;

    // 发送系统消息
    await this.sendSystemMessage(groupId, `${agentId} 已${muted ? "禁言" : "解除禁言"}`);
  }

  /**
   * 检查成员是否有权限发言
   */
  canSpeak(groupId: string, agentId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    const member = group.members.find((m) => m.agentId === agentId);
    if (!member) {
      return false;
    }

    return !member.muted;
  }

  /**
   * 获取群组成员列表
   */
  getMembers(groupId: string): GroupMember[] {
    const group = this.groups.get(groupId);
    return group ? [...group.members] : [];
  }

  /**
   * 删除群组
   */
  async deleteGroup(groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 归档消息
    await groupMessageStorage.archiveGroup(groupId);

    // 删除群组
    this.groups.delete(groupId);

    console.log(`[Group Manager] Deleted group ${groupId}`);
  }

  /**
   * 发送系统消息
   */
  private async sendSystemMessage(groupId: string, content: string): Promise<void> {
    const message: GroupMessage = {
      id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      groupId,
      senderId: "system",
      senderName: "System",
      content,
      type: "system",
      timestamp: Date.now(),
    };

    await groupMessageStorage.saveMessage(message);
  }

  /**
   * 添加好友关系
   */
  async addFriend(agentA: string, agentB: string, initiator: string): Promise<FriendRelation> {
    // 生成关系ID（保证A-B和B-A是同一个关系）
    const [sortedA, sortedB] = [agentA, agentB].toSorted();
    const relationId = `friend-${sortedA}-${sortedB}`;

    // 检查是否已存在
    if (this.friendRelations.has(relationId)) {
      throw new Error(`Friend relation between "${agentA}" and "${agentB}" already exists`);
    }

    const relation: FriendRelation = {
      id: relationId,
      agentA: sortedA,
      agentB: sortedB,
      createdAt: Date.now(),
      confirmed: false,
      initiator,
      status: "pending",
      messageCount: 0,
      collaborationCount: 0,
    };

    this.friendRelations.set(relationId, relation);
    console.log(
      `[Group Manager] Created friend request from ${initiator} between ${agentA} and ${agentB}`,
    );
    return relation;
  }

  /**
   * 确认好友关系
   */
  async confirmFriend(agentA: string, agentB: string): Promise<void> {
    const [sortedA, sortedB] = [agentA, agentB].toSorted();
    const relationId = `friend-${sortedA}-${sortedB}`;

    const relation = this.friendRelations.get(relationId);
    if (!relation) {
      throw new Error(`Friend relation between "${agentA}" and "${agentB}" not found`);
    }

    relation.confirmed = true;
    relation.status = "accepted";
    relation.acceptedAt = Date.now();
    console.log(`[Group Manager] Confirmed friend relation between ${agentA} and ${agentB}`);
  }

  /**
   * 删除好友关系
   */
  async removeFriend(agentA: string, agentB: string): Promise<void> {
    const [sortedA, sortedB] = [agentA, agentB].toSorted();
    const relationId = `friend-${sortedA}-${sortedB}`;

    if (!this.friendRelations.delete(relationId)) {
      throw new Error(`Friend relation between "${agentA}" and "${agentB}" not found`);
    }

    console.log(`[Group Manager] Removed friend relation between ${agentA} and ${agentB}`);
  }

  /**
   * 检查是否为好友
   */
  isFriend(agentA: string, agentB: string): boolean {
    const [sortedA, sortedB] = [agentA, agentB].toSorted();
    const relationId = `friend-${sortedA}-${sortedB}`;
    const relation = this.friendRelations.get(relationId);
    return relation?.confirmed ?? false;
  }

  /**
   * 获取智能助手的好友列表
   */
  getFriends(agentId: string): string[] {
    const friends: string[] = [];

    for (const relation of this.friendRelations.values()) {
      if (!relation.confirmed) {
        continue;
      }

      if (relation.agentA === agentId) {
        friends.push(relation.agentB);
      } else if (relation.agentB === agentId) {
        friends.push(relation.agentA);
      }
    }

    return friends;
  }

  /**
   * 获取智能助手所在的所有群组
   */
  getAgentGroups(agentId: string): GroupInfo[] {
    const groups: GroupInfo[] = [];

    for (const group of this.groups.values()) {
      if (group.members.some((m) => m.agentId === agentId)) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * 获取所有群组（管理用）
   */
  getAllGroups(): GroupInfo[] {
    return Array.from(this.groups.values());
  }

  /**
   * 添加好友请求（RPC 用）
   */
  addFriendRequest(fromAgentId: string, toAgentId: string, message?: string): string {
    const requestId = `friend-request-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // 实际上直接创建关系，等待确认
    void this.addFriend(fromAgentId, toAgentId, fromAgentId);
    return requestId;
  }

  /**
   * 响应好友请求（RPC 用）
   */
  respondToFriendRequest(agentId: string, friendId: string, accept: boolean): boolean {
    if (accept) {
      void this.confirmFriend(agentId, friendId);
      return true;
    } else {
      void this.removeFriend(agentId, friendId);
      return false;
    }
  }

  /**
   * 删除好友关系（RPC 用）
   */
  deleteFriend(agentId: string, friendId: string): void {
    void this.removeFriend(agentId, friendId);
  }

  /**
   * 获取好友请求列表
   */
  getFriendRequests(agentId: string): Array<{
    id: string;
    fromAgentId: string;
    toAgentId: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: number;
  }> {
    const requests: Array<{
      id: string;
      fromAgentId: string;
      toAgentId: string;
      status: "pending" | "accepted" | "rejected";
      createdAt: number;
    }> = [];

    for (const relation of this.friendRelations.values()) {
      if (relation.agentA === agentId || relation.agentB === agentId) {
        const otherAgent = relation.agentA === agentId ? relation.agentB : relation.agentA;
        requests.push({
          id: relation.id,
          fromAgentId: relation.initiator,
          toAgentId: otherAgent,
          status: relation.confirmed ? "accepted" : "pending",
          createdAt: relation.createdAt,
        });
      }
    }

    return requests;
  }

  /**
   * 发送一对一消息
   */
  sendDirectMessage(
    fromAgentId: string,
    toAgentId: string,
    content: string,
    attachments?: any[],
  ): string {
    const messageId = `dm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // TODO: 存储一对一消息
    console.log(`[Group Manager] Direct message from ${fromAgentId} to ${toAgentId}: ${content}`);
    return messageId;
  }

  /**
   * 获取一对一消息历史
   */
  getDirectMessages(
    agentId: string,
    friendId: string,
    limit: number,
    offset: number,
  ): Array<{
    id: string;
    fromAgentId: string;
    toAgentId: string;
    content: string;
    timestamp: number;
  }> {
    // TODO: 从存储中获取
    console.log(`[Group Manager] Get direct messages between ${agentId} and ${friendId}`);
    return [];
  }

  /**
   * 更新好友信息（昵称、标签、分组）
   * @param agentId - 操作者ID
   * @param friendId - 好友ID
   * @param updates - 更新的字段
   */
  updateFriendInfo(
    agentId: string,
    friendId: string,
    updates: {
      nickname?: string;
      tags?: string[];
      group?: string;
      remark?: string;
    },
  ): FriendRelation {
    const [sortedA, sortedB] = [agentId, friendId].toSorted();
    const relationId = `friend-${sortedA}-${sortedB}`;

    const relation = this.friendRelations.get(relationId);
    if (!relation) {
      throw new Error(`Friend relation between "${agentId}" and "${friendId}" not found`);
    }

    // 根据操作者更新相应字段
    const isAgentA = relation.agentA === agentId;

    if (updates.nickname !== undefined) {
      if (isAgentA) {
        relation.nicknameA = updates.nickname;
      } else {
        relation.nicknameB = updates.nickname;
      }
    }

    if (updates.tags !== undefined) {
      if (isAgentA) {
        relation.tagsA = updates.tags;
      } else {
        relation.tagsB = updates.tags;
      }
    }

    if (updates.group !== undefined) {
      if (isAgentA) {
        relation.groupA = updates.group;
      } else {
        relation.groupB = updates.group;
      }
    }

    if (updates.remark !== undefined) {
      if (isAgentA) {
        relation.remarkA = updates.remark;
      } else {
        relation.remarkB = updates.remark;
      }
    }

    console.log(`[Group Manager] Updated friend info: ${agentId} -> ${friendId}`);
    return relation;
  }

  /**
   * 更新好友互动统计
   * @param agentA - 智能助手A
   * @param agentB - 智能助手B
   * @param type - 互动类型：message | collaboration
   */
  updateFriendInteraction(agentA: string, agentB: string, type: "message" | "collaboration"): void {
    const [sortedA, sortedB] = [agentA, agentB].toSorted();
    const relationId = `friend-${sortedA}-${sortedB}`;

    const relation = this.friendRelations.get(relationId);
    if (!relation || !relation.confirmed) {
      return; // 非好友关系，不记录
    }

    if (type === "message") {
      relation.messageCount++;
      relation.lastMessageAt = Date.now();
    } else if (type === "collaboration") {
      relation.collaborationCount++;
    }
  }

  /**
   * 获取好友详细信息
   * @param agentId - 查询者ID
   * @param friendId - 好友ID
   */
  getFriendDetail(
    agentId: string,
    friendId: string,
  ): {
    friendId: string;
    nickname?: string;
    tags?: string[];
    group?: string;
    remark?: string;
    messageCount: number;
    lastMessageAt?: number;
    collaborationCount: number;
    createdAt: number;
    acceptedAt?: number;
  } | null {
    const [sortedA, sortedB] = [agentId, friendId].toSorted();
    const relationId = `friend-${sortedA}-${sortedB}`;

    const relation = this.friendRelations.get(relationId);
    if (!relation || !relation.confirmed) {
      return null;
    }

    const isAgentA = relation.agentA === agentId;

    return {
      friendId,
      nickname: isAgentA ? relation.nicknameA : relation.nicknameB,
      tags: isAgentA ? relation.tagsA : relation.tagsB,
      group: isAgentA ? relation.groupA : relation.groupB,
      remark: isAgentA ? relation.remarkA : relation.remarkB,
      messageCount: relation.messageCount,
      lastMessageAt: relation.lastMessageAt,
      collaborationCount: relation.collaborationCount,
      createdAt: relation.createdAt,
      acceptedAt: relation.acceptedAt,
    };
  }

  /**
   * 智能推荐好友
   * 基于以下策略：
   * 1. 共同群组：在同一个群组但还不是好友的智能助手
   * 2. 共同好友：好友的好友（二度连接）
   * 3. 技能互补：基于技能标签的互补性
   * @param agentId - 智能助手ID
   * @param limit - 推荐数量限制
   */
  recommendFriends(
    agentId: string,
    limit: number = 10,
  ): Array<{
    agentId: string;
    reason: string;
    score: number;
  }> {
    const recommendations = new Map<string, { reason: string; score: number }>();
    const currentFriends = new Set(this.getFriends(agentId));
    currentFriends.add(agentId); // 排除自己

    // 策略 1: 共同群组成员
    const agentGroups = this.getAgentGroups(agentId);
    for (const group of agentGroups) {
      for (const member of group.members) {
        if (!currentFriends.has(member.agentId)) {
          const existing = recommendations.get(member.agentId);
          const newScore = (existing?.score || 0) + 3;
          recommendations.set(member.agentId, {
            reason: existing ? `${existing.reason}, 共同群组` : `在群组 "${group.name}" 中`,
            score: newScore,
          });
        }
      }
    }

    // 策略 2: 好友的好友（二度连接）
    for (const friendId of currentFriends) {
      if (friendId === agentId) {
        continue;
      }
      const friendsOfFriend = this.getFriends(friendId);
      for (const potentialFriend of friendsOfFriend) {
        if (!currentFriends.has(potentialFriend)) {
          const existing = recommendations.get(potentialFriend);
          const newScore = (existing?.score || 0) + 2;
          recommendations.set(potentialFriend, {
            reason: existing ? `${existing.reason}, 共同好友` : `与 ${friendId} 的共同好友`,
            score: newScore,
          });
        }
      }
    }

    // 策略 3: 高协作活跃度（未来可以基于任务协作记录）
    // TODO: 基于任务协作记录进行推荐

    // 按分数排序并限制数量
    const sortedRecommendations = Array.from(recommendations.entries())
      .map(([agentId, { reason, score }]) => ({ agentId, reason, score }))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log(
      `[Group Manager] Recommended ${sortedRecommendations.length} friends for ${agentId}`,
    );
    return sortedRecommendations;
  }

  /**
   * 邀请成员加入群组
   * @param groupId - 群组ID
   * @param agentId - 被邀请者ID
   * @param inviterId - 邀请者ID
   * @param message - 邀请消息
   */
  async inviteMember(
    groupId: string,
    agentId: string,
    inviterId: string,
    message?: string,
  ): Promise<{
    inviteId: string;
    status: "pending" | "approved" | "rejected";
  }> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 检查邀请者权限
    const inviter = group.members.find((m) => m.agentId === inviterId);
    if (!inviter) {
      throw new Error(`Inviter "${inviterId}" is not a member of group "${groupId}"`);
    }

    // 检查配置：是否允许普通成员邀请
    if (inviter.role === "member" && !group.config?.allowInvite) {
      throw new Error("Only admins and owner can invite members");
    }

    // 检查是否已经是成员
    if (group.members.some((m) => m.agentId === agentId)) {
      throw new Error(`Agent "${agentId}" is already a member of group "${groupId}"`);
    }

    const inviteId = `invite-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // 如果群组需要审批，返回 pending 状态
    if (group.requireApproval) {
      // TODO: 存储邀请记录到持久化系统
      console.log(
        `[Group Manager] Invite sent to ${agentId} for group ${groupId} (pending approval)`,
      );
      return { inviteId, status: "pending" };
    }

    // 否则直接添加成员
    await this.addMember(groupId, agentId, "member");
    console.log(`[Group Manager] ${agentId} invited to group ${groupId} by ${inviterId}`);
    return { inviteId, status: "approved" };
  }

  /**
   * 申请加入群组
   * @param groupId - 群组ID
   * @param agentId - 申请者ID
   * @param reason - 申请理由
   */
  async joinRequest(
    groupId: string,
    agentId: string,
    reason?: string,
  ): Promise<{
    requestId: string;
    status: "pending" | "approved" | "rejected";
  }> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 检查是否已经是成员
    if (group.members.some((m) => m.agentId === agentId)) {
      throw new Error(`Agent "${agentId}" is already a member of group "${groupId}"`);
    }

    // 检查群组是否公开
    if (!group.isPublic) {
      throw new Error(`Group "${groupId}" is not public. Please wait for invitation.`);
    }

    const requestId = `join-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // 如果群组需要审批，返回 pending 状态
    if (group.requireApproval) {
      // TODO: 存储申请记录到持久化系统
      console.log(`[Group Manager] Join request from ${agentId} for group ${groupId} (pending)`);
      return { requestId, status: "pending" };
    }

    // 否则直接添加成员
    await this.addMember(groupId, agentId, "member");
    console.log(`[Group Manager] ${agentId} joined group ${groupId}`);
    return { requestId, status: "approved" };
  }

  /**
   * 审批加入申请/邀请
   * @param requestId - 申请/邀请ID
   * @param decision - 决定：approve 或 reject
   * @param approverId - 审批者ID
   */
  async approveRequest(
    requestId: string,
    decision: "approve" | "reject",
    approverId: string,
  ): Promise<{ success: boolean; status: string }> {
    // TODO: 从持久化系统检索申请记录
    // 这里仅为示例实现
    console.log(`[Group Manager] Request ${requestId} ${decision}d by ${approverId}`);

    if (decision === "approve") {
      // TODO: 根据 requestId 获取 groupId 和 agentId，然后添加成员
      // await this.addMember(groupId, agentId, "member");
      return { success: true, status: "approved" };
    } else {
      return { success: true, status: "rejected" };
    }
  }

  /**
   * 共享资源到群组
   * @param groupId - 群组ID
   * @param resourceType - 资源类型
   * @param resourceId - 资源ID
   */
  async shareResource(
    groupId: string,
    resourceType: "document" | "knowledge" | "workspace",
    resourceId: string,
  ): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 初始化 resources 对象
    if (!group.resources) {
      group.resources = {};
    }

    // 添加资源
    switch (resourceType) {
      case "document":
        if (!group.resources.documents) {
          group.resources.documents = [];
        }
        if (!group.resources.documents.includes(resourceId)) {
          group.resources.documents.push(resourceId);
        }
        break;
      case "knowledge":
        if (!group.resources.knowledgeBase) {
          group.resources.knowledgeBase = [];
        }
        if (!group.resources.knowledgeBase.includes(resourceId)) {
          group.resources.knowledgeBase.push(resourceId);
        }
        break;
      case "workspace":
        group.resources.workspace = resourceId;
        break;
    }

    console.log(`[Group Manager] Shared ${resourceType} ${resourceId} to group ${groupId}`);
  }

  /**
   * 更新群组设置
   * @param groupId - 群组ID
   * @param settings - 设置对象
   */
  async updateGroupSettings(
    groupId: string,
    settings: {
      type?: GroupType;
      requireApproval?: boolean;
      allowInvite?: boolean;
      allowSpeak?: boolean;
      pinMessages?: string[];
    },
  ): Promise<GroupInfo> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    // 更新群组类型
    if (settings.type !== undefined) {
      group.type = settings.type;
    }

    // 更新审批设置
    if (settings.requireApproval !== undefined) {
      group.requireApproval = settings.requireApproval;
    }

    // 初始化 config 对象
    if (!group.config) {
      group.config = {};
    }

    // 更新配置
    if (settings.allowInvite !== undefined) {
      group.config.allowInvite = settings.allowInvite;
    }
    if (settings.allowSpeak !== undefined) {
      group.config.allowSpeak = settings.allowSpeak;
    }
    if (settings.pinMessages !== undefined) {
      group.config.pinMessages = settings.pinMessages;
    }

    console.log(`[Group Manager] Updated settings for group ${groupId}`);
    return group;
  }
}

/**
 * 全局群组管理器实例
 */
export const groupManager = new GroupManager();
