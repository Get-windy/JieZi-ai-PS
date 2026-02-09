/**
 * Phase 6: Agent-to-Agent 群组管理系统
 *
 * 功能：
 * - 群组创建/删除
 * - 成员管理（添加/移除/权限）
 * - 群组信息查询
 * - 一对一好友关系管理
 */

import type { GroupMessage, GroupSessionMetadata } from "./group-message-storage.js";
import { groupWorkspaceManager } from "../workspace/group-workspace.js";
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

  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 一对一好友关系
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

  /** 是否双向确认 */
  confirmed: boolean;

  /** 发起者 */
  initiator: string;

  /** 备注（A对B的备注） */
  remarkA?: string;

  /** 备注（B对A的备注） */
  remarkB?: string;
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
    if (!group) return false;

    const member = group.members.find((m) => m.agentId === agentId);
    if (!member) return false;

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
    const [sortedA, sortedB] = [agentA, agentB].sort();
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
    const [sortedA, sortedB] = [agentA, agentB].sort();
    const relationId = `friend-${sortedA}-${sortedB}`;

    const relation = this.friendRelations.get(relationId);
    if (!relation) {
      throw new Error(`Friend relation between "${agentA}" and "${agentB}" not found`);
    }

    relation.confirmed = true;
    console.log(`[Group Manager] Confirmed friend relation between ${agentA} and ${agentB}`);
  }

  /**
   * 删除好友关系
   */
  async removeFriend(agentA: string, agentB: string): Promise<void> {
    const [sortedA, sortedB] = [agentA, agentB].sort();
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
    const [sortedA, sortedB] = [agentA, agentB].sort();
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
      if (!relation.confirmed) continue;

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
}

/**
 * 全局群组管理器实例
 */
export const groupManager = new GroupManager();
