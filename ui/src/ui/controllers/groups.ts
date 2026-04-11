/**
 * Groups Controller
 * 
 * 群组管理相关控制器：
 * - 加载群组列表
 * - 创建群组
 * - 更新群组信息
 * - 添加/移除成员
 */

import type { App } from "../app.js";
import type { GatewayClient } from "../gateway.js";
import type { GroupInfo, GroupsListResult } from "../views/groups.js";

/**
 * 加载群组列表
 */
export async function loadGroups(app: App, client: GatewayClient | null): Promise<void> {
  if (!client) {
    return;
  }
  app.groupsLoading = true;
  app.groupsError = null;

  try {
    // 调用 groups.list RPC
    const response = await client.request("groups.list", {});
    const groups = Array.isArray((response as any)?.groups) ? (response as any).groups : [];
    
    app.groupsList = {
      groups: groups.map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        ownerId: g.ownerId,
        createdAt: g.createdAt,
        members: Array.isArray(g.members) ? g.members : [],
        maxMembers: g.maxMembers,
        isPublic: g.isPublic,
        tags: g.tags,
        projectId: g.projectId,
        workspacePath: g.workspacePath,
      })),
      total: groups.length,
    };
  } catch (error) {
    console.error("[Groups] Failed to load groups:", error);
    app.groupsError = String(error);
  } finally {
    app.groupsLoading = false;
  }
}

/**
 * 创建群组
 */
export async function createGroup(
  app: App,
  client: GatewayClient,
  groupData: {
    id: string;
    name: string;
    ownerId: string;
    description?: string;
    isPublic?: boolean;
    maxMembers?: number;
    projectId?: string;
    workspacePath?: string;
  },
): Promise<void> {
  app.creatingGroup = true;
  app.groupsError = null;

  try {
    // 调用 groups.create RPC
    await client.request("groups.create", {
      id: groupData.id,
      name: groupData.name,
      ownerId: groupData.ownerId,
      description: groupData.description,
      initialMembers: [],
      isPublic: groupData.isPublic || false,
      maxMembers: groupData.maxMembers,
      projectId: groupData.projectId,
      workspacePath: groupData.workspacePath,
    });
    
    console.log("[Groups] Group created:", groupData);
    
    // 刷新群组列表
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Groups] Failed to create group:", error);
    app.groupsError = String(error);
    throw error;
  } finally {
    app.creatingGroup = false;
  }
}

/**
 * 删除群组
 */
export async function deleteGroup(app: App, client: GatewayClient, groupId: string): Promise<void> {
  app.groupsError = null;

  try {
    // 调用 groups.delete RPC
    await client.request("groups.delete", { groupId });
    
    console.log("[Groups] Group deleted:", groupId);
    
    // 刷新群组列表
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Groups] Failed to delete group:", error);
    app.groupsError = String(error);
    throw error;
  }
}

/**
 * 添加群成员
 */
export async function addGroupMember(
  app: App,
  client: GatewayClient,
  groupId: string,
  agentId: string,
  role?: "member" | "admin",
): Promise<void> {
  app.groupsError = null;

  try {
    // 调用 groups.addMember RPC
    await client.request("groups.addMember", {
      groupId,
      agentId,
      role: role || "member",
    });
    
    console.log("[Groups] Member added:", agentId, "to", groupId);
    
    // 刷新群组列表
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Groups] Failed to add member:", error);
    app.groupsError = String(error);
    throw error;
  }
}

/**
 * 移除群成员
 */
export async function removeGroupMember(
  app: App,
  client: GatewayClient,
  groupId: string,
  agentId: string,
): Promise<void> {
  app.groupsError = null;

  try {
    // 调用 groups.removeMember RPC
    await client.request("groups.removeMember", {
      groupId,
      agentId,
    });
    
    console.log("[Groups] Member removed:", agentId, "from", groupId);
    
    // 刷新群组列表
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Groups] Failed to remove member:", error);
    app.groupsError = String(error);
    throw error;
  }
}

/**
 * 更新群成员角色
 */
export async function updateGroupMemberRole(
  app: App,
  client: GatewayClient,
  groupId: string,
  agentId: string,
  role: "member" | "admin",
): Promise<void> {
  app.groupsError = null;

  try {
    // 调用 groups.updateMemberRole RPC
    await client.request("groups.updateMemberRole", {
      groupId,
      agentId,
      role,
    });
    
    console.log("[Groups] Member role updated:", agentId, "to", role, "in", groupId);
    
    // 刷新群组列表
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Groups] Failed to update member role:", error);
    app.groupsError = String(error);
    throw error;
  }
}

/**
 * 更新群组信息
 */
export async function updateGroup(
  app: App,
  client: GatewayClient,
  groupId: string,
  updates: Partial<GroupInfo>,
): Promise<void> {
  app.groupsError = null;

  try {
    // 调用 groups.update RPC
    await client.request("groups.update", {
      groupId,
      ...updates,
    });
    
    console.log("[Groups] Group updated:", groupId, updates);
    
    // 刷新群组列表
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Groups] Failed to update group:", error);
    app.groupsError = String(error);
    throw error;
  }
}
