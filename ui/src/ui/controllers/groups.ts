import type { GatewayBrowserClient } from "../gateway.ts";
import type { GroupInfo, GroupMemberRole, GroupsListResult } from "../views/groups.ts";

export type GroupsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  groupsLoading: boolean;
  groupsList: GroupsListResult | null;
  groupsError: string | null;
};

/**
 * 加载群组列表
 */
export async function loadGroups(state: GroupsState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }

  state.groupsLoading = true;
  state.groupsError = null;

  try {
    const result = await state.client.request<GroupsListResult>("groups.list", {});
    if (result) {
      state.groupsList = result;
    }
  } catch (err) {
    state.groupsError = String(err instanceof Error ? err.message : err);
  } finally {
    state.groupsLoading = false;
  }
}

/**
 * 创建群组
 */
export async function createGroup(
  state: GroupsState,
  group: {
    id: string;
    name: string;
    description?: string;
    maxMembers?: number;
    isPublic: boolean;
    initialMembers?: string[];
  },
): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  await state.client.request("groups.create", group);

  // 重新加载群组列表
  await loadGroups(state);
}

/**
 * 删除群组
 */
export async function deleteGroup(state: GroupsState, groupId: string): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  await state.client.request("groups.delete", { groupId });

  // 重新加载群组列表
  await loadGroups(state);
}

/**
 * 添加成员
 */
export async function addGroupMember(
  state: GroupsState,
  groupId: string,
  agentId: string,
  role: GroupMemberRole = "member",
): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  await state.client.request("groups.addMember", {
    groupId,
    agentId,
    role,
  });

  // 重新加载群组列表
  await loadGroups(state);
}

/**
 * 移除成员
 */
export async function removeGroupMember(
  state: GroupsState,
  groupId: string,
  agentId: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  await state.client.request("groups.removeMember", {
    groupId,
    agentId,
  });

  // 重新加载群组列表
  await loadGroups(state);
}

/**
 * 更新成员角色
 */
export async function updateGroupMemberRole(
  state: GroupsState,
  groupId: string,
  agentId: string,
  role: GroupMemberRole,
): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  await state.client.request("groups.updateMemberRole", {
    groupId,
    agentId,
    role,
  });

  // 重新加载群组列表
  await loadGroups(state);
}
