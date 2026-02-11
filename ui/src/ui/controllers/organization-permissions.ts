/**
 * 组织与权限管理控制器
 * 负责组织架构、权限配置、审批管理和系统管理的数据加载和操作
 */

import type { AppViewState } from "../app-view-state.js";
import type { OrganizationData, Organization, Team } from "../views/organization-permissions.js";

/**
 * 加载组织架构数据
 */
export async function loadOrganizationData(state: AppViewState): Promise<void> {
  if (state.organizationDataLoading) {
    return;
  }

  state.organizationDataLoading = true;
  state.organizationDataError = null;

  try {
    // 调用后端API加载组织架构数据
    if (state.client) {
      const response = await state.client.request<OrganizationData>("organization.list", {});
      state.organizationData = response;
    } else {
      // 开发模式：使用模拟数据
      await loadMockOrganizationData(state);
    }
  } catch (err: unknown) {
    const error = err as Error;
    state.organizationDataError = error.message || "加载组织数据失败";
    console.error("Failed to load organization data:", err);
  } finally {
    state.organizationDataLoading = false;
  }
}

/**
 * 加载模拟组织数据（开发用）
 */
async function loadMockOrganizationData(state: AppViewState): Promise<void> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 临时模拟数据
  const mockData: OrganizationData = {
    organizations: [
      {
        id: "org-1",
        name: "研发部",
        description: "负责产品研发",
        level: 0,
        createdAt: Date.now(),
        agentCount: 5,
      },
      {
        id: "org-2",
        name: "前端组",
        description: "前端开发团队",
        parentId: "org-1",
        level: 1,
        createdAt: Date.now(),
        agentCount: 3,
      },
      {
        id: "org-3",
        name: "后端组",
        description: "后端开发团队",
        parentId: "org-1",
        level: 1,
        createdAt: Date.now(),
        agentCount: 2,
      },
    ],
    teams: [
      {
        id: "team-1",
        name: "React团队",
        organizationId: "org-2",
        description: "React前端开发",
        memberIds: ["agent-1", "agent-2"],
        createdAt: Date.now(),
      },
      {
        id: "team-2",
        name: "Node.js团队",
        organizationId: "org-3",
        description: "Node.js后端开发",
        memberIds: ["agent-3", "agent-4"],
        createdAt: Date.now(),
      },
    ],
    agents: [],
    relationships: [],
    statistics: {
      totalOrganizations: 3,
      totalTeams: 2,
      totalAgents: 5,
      averageTeamSize: 2.5,
      permissionDistribution: {},
    },
  };

  state.organizationData = mockData;
}

/**
 * 创建组织
 */
export async function createOrganization(
  state: AppViewState,
  org: { name: string; description: string; parentId: string },
): Promise<void> {
  if (state.organizationsSaving) {
    return;
  }

  state.organizationsSaving = true;
  state.organizationsError = null;

  try {
    // 调用后端API创建组织
    if (state.client) {
      await state.client.request("organization.create", org);
    } else {
      // 开发模式：模拟延迟
      console.log("Creating organization:", org);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);

    // 关闭对话框
    state.editingOrganization = null;
  } catch (err: unknown) {
    const error = err as Error;
    state.organizationsError = error.message || "创建组织失败";
    console.error("Failed to create organization:", err);
  } finally {
    state.organizationsSaving = false;
  }
}

/**
 * 更新组织
 */
export async function updateOrganization(
  state: AppViewState,
  org: { id: string; name: string; description: string; parentId: string },
): Promise<void> {
  if (state.organizationsSaving) {
    return;
  }

  state.organizationsSaving = true;
  state.organizationsError = null;

  try {
    // 调用后端API更新组织
    if (state.client) {
      await state.client.request("organization.update", org);
    } else {
      // 开发模式：模拟延迟
      console.log("Updating organization:", org);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);

    // 关闭对话框
    state.editingOrganization = null;
  } catch (err: unknown) {
    const error = err as Error;
    state.organizationsError = error.message || "更新组织失败";
    console.error("Failed to update organization:", err);
  } finally {
    state.organizationsSaving = false;
  }
}

/**
 * 删除组织
 */
export async function deleteOrganization(state: AppViewState, orgId: string): Promise<void> {
  if (state.organizationsSaving) {
    return;
  }

  state.organizationsSaving = true;
  state.organizationsError = null;

  try {
    // 调用后端API删除组织
    if (state.client) {
      await state.client.request("organization.delete", { id: orgId });
    } else {
      // 开发模式：模拟延迟
      console.log("Deleting organization:", orgId);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);
  } catch (err: unknown) {
    const error = err as Error;
    state.organizationsError = error.message || "删除组织失败";
    console.error("Failed to delete organization:", err);
  } finally {
    state.organizationsSaving = false;
  }
}

/**
 * 创建团队
 */
export async function createTeam(
  state: AppViewState,
  team: { name: string; description: string; organizationId: string; leaderId: string },
): Promise<void> {
  if (state.teamsSaving) {
    return;
  }

  state.teamsSaving = true;
  state.teamsError = null;

  try {
    // 调用后端API创建团队
    if (state.client) {
      await state.client.request("team.create", team);
    } else {
      // 开发模式：模拟延迟
      console.log("Creating team:", team);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);

    // 关闭对话框
    state.editingTeam = null;
  } catch (err: unknown) {
    const error = err as Error;
    state.teamsError = error.message || "创建团队失败";
    console.error("Failed to create team:", err);
  } finally {
    state.teamsSaving = false;
  }
}

/**
 * 更新团队
 */
export async function updateTeam(
  state: AppViewState,
  team: { id: string; name: string; description: string; organizationId: string; leaderId: string },
): Promise<void> {
  if (state.teamsSaving) {
    return;
  }

  state.teamsSaving = true;
  state.teamsError = null;

  try {
    // 调用后端API更新团队
    if (state.client) {
      await state.client.request("team.update", team);
    } else {
      // 开发模式：模拟延迟
      console.log("Updating team:", team);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);

    // 关闭对话框
    state.editingTeam = null;
  } catch (err: unknown) {
    const error = err as Error;
    state.teamsError = error.message || "更新团队失败";
    console.error("Failed to update team:", err);
  } finally {
    state.teamsSaving = false;
  }
}

/**
 * 删除团队
 */
export async function deleteTeam(state: AppViewState, teamId: string): Promise<void> {
  if (state.teamsSaving) {
    return;
  }

  state.teamsSaving = true;
  state.teamsError = null;

  try {
    // 调用后端API删除团队
    if (state.client) {
      await state.client.request("team.delete", { id: teamId });
    } else {
      // 开发模式：模拟延迟
      console.log("Deleting team:", teamId);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);
  } catch (err: unknown) {
    const error = err as Error;
    state.teamsError = error.message || "删除团队失败";
    console.error("Failed to delete team:", err);
  } finally {
    state.teamsSaving = false;
  }
}

/**
 * 分配成员到团队
 */
export async function assignMemberToTeam(
  state: AppViewState,
  teamId: string,
  memberId: string,
): Promise<void> {
  try {
    // 调用后端API分配成员
    if (state.client) {
      await state.client.request("team.addMember", { teamId, memberId });
    } else {
      // 开发模式：模拟延迟
      console.log("Assigning member to team:", teamId, memberId);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Failed to assign member:", err);
    throw error;
  }
}

/**
 * 从团队移除成员
 */
export async function removeMemberFromTeam(
  state: AppViewState,
  teamId: string,
  memberId: string,
): Promise<void> {
  try {
    // 调用后端API移除成员
    if (state.client) {
      await state.client.request("team.removeMember", { teamId, memberId });
    } else {
      // 开发模式：模拟延迟
      console.log("Removing member from team:", teamId, memberId);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // 重新加载组织数据
    await loadOrganizationData(state);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Failed to remove member:", err);
    throw error;
  }
}

// ============================================================================
// 权限配置相关函数
// ============================================================================

/**
 * 加载权限配置数据
 */
export async function loadPermissionsConfig(state: AppViewState): Promise<void> {
  if (state.permissionsConfigLoading) {
    return;
  }

  state.permissionsConfigLoading = true;
  state.permissionsConfigError = null;

  try {
    // 调用后端API加载权限配置
    if (state.client) {
      const response = await state.client.request<any>("permissions.config.get", {});
      state.permissionsConfig = response;
    } else {
      // 开发模式：模拟数据
      console.log("Loading permissions config...");
      await new Promise((resolve) => setTimeout(resolve, 300));

      state.permissionsConfig = {
        organizationPermissions: [],
        rolePermissions: [],
        agentPermissions: [],
        templates: [],
      };
    }
  } catch (err: unknown) {
    const error = err as Error;
    state.permissionsConfigError = error.message || "加载权限配置失败";
    console.error("Failed to load permissions config:", err);
  } finally {
    state.permissionsConfigLoading = false;
  }
}

/**
 * 保存权限配置
 */
export async function savePermissionsConfig(state: AppViewState, config: any): Promise<void> {
  if (state.permissionsConfigSaving) {
    return;
  }

  state.permissionsConfigSaving = true;
  state.permissionsConfigError = null;

  try {
    // 调用后端API保存权限配置
    if (state.client) {
      await state.client.request("permissions.config.save", config);
    } else {
      // 开发模式：模拟延迟
      console.log("Saving permissions config:", config);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 重新加载权限配置
    await loadPermissionsConfig(state);
  } catch (err: unknown) {
    const error = err as Error;
    state.permissionsConfigError = error.message || "保存权限配置失败";
    console.error("Failed to save permissions config:", err);
  } finally {
    state.permissionsConfigSaving = false;
  }
}

/**
 * 创建权限角色
 */
export async function createPermissionRole(
  state: AppViewState,
  role: { name: string; description: string; permissions: string[] },
): Promise<void> {
  try {
    // 调用后端API创建角色
    if (state.client) {
      await state.client.request("permissions.role.create", role);
    } else {
      // 开发模式：模拟延迟
      console.log("Creating permission role:", role);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await loadPermissionsConfig(state);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Failed to create permission role:", err);
    throw error;
  }
}

/**
 * 删除权限角色
 */
export async function deletePermissionRole(state: AppViewState, roleId: string): Promise<void> {
  try {
    // 调用后端API删除角色
    if (state.client) {
      await state.client.request("permissions.role.delete", { id: roleId });
    } else {
      // 开发模式：模拟延迟
      console.log("Deleting permission role:", roleId);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await loadPermissionsConfig(state);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Failed to delete permission role:", err);
    throw error;
  }
}

// ============================================================================
// 审批管理相关函数
// ============================================================================

/**
 * 加载审批请求列表
 */
export async function loadApprovalRequests(state: AppViewState): Promise<void> {
  if (state.approvalsLoading) {
    return;
  }

  state.approvalsLoading = true;
  state.approvalsError = null;

  try {
    // 调用后端API加载审批请求
    if (state.client) {
      const response = await state.client.request<any[]>("approvals.requests.list", {});
      state.approvalRequests = response;
    } else {
      // 开发模式：模拟数据
      console.log("Loading approval requests...");
      await new Promise((resolve) => setTimeout(resolve, 300));

      state.approvalRequests = [];
    }
  } catch (err: unknown) {
    const error = err as Error;
    state.approvalsError = error.message || "加载审批请求失败";
    console.error("Failed to load approval requests:", err);
  } finally {
    state.approvalsLoading = false;
  }
}

/**
 * 审批请求
 */
export async function approveRequest(
  state: AppViewState,
  requestId: string,
  comment?: string,
): Promise<void> {
  try {
    // 调用后端API审批
    if (state.client) {
      await state.client.request("approvals.request.approve", { requestId, comment });
    } else {
      // 开发模式：模拟延迟
      console.log("Approving request:", requestId, comment);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await loadApprovalRequests(state);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Failed to approve request:", err);
    throw error;
  }
}

/**
 * 拒绝请求
 */
export async function rejectRequest(
  state: AppViewState,
  requestId: string,
  reason: string,
): Promise<void> {
  try {
    // 调用后端API拒绝
    if (state.client) {
      await state.client.request("approvals.request.reject", { requestId, reason });
    } else {
      // 开发模式：模拟延迟
      console.log("Rejecting request:", requestId, reason);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await loadApprovalRequests(state);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Failed to reject request:", err);
    throw error;
  }
}
