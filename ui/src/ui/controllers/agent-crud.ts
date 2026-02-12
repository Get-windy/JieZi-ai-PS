/**
 * Agent CRUD Controllers
 *
 * 提供助手的创建、更新、删除功能
 */

import type { AppViewState } from "../app-view-state.ts";
import { loadAgents } from "./agents.ts";

/**
 * 创建新助手
 */
export async function createAgent(
  state: AppViewState,
  agent: { id: string; name?: string; workspace?: string },
): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  state.creatingAgent = true;

  try {
    const result = await state.client.request("agent.create", {
      id: agent.id,
      name: agent.name || agent.id,
      workspace: agent.workspace || "",
    });

    if (!result || !(result as any).success) {
      throw new Error("Failed to create agent");
    }

    // 刷新列表
    await loadAgents(state);

    // 注意：不自动选中新助手，避免干扰用户当前查看的助手
    // 如果需要自动选中，应该由上层调用者决定
    // state.agentsSelectedId = agent.id;
  } finally {
    state.creatingAgent = false;
  }
}

/**
 * 更新助手信息
 */
export async function updateAgent(
  state: AppViewState,
  agent: { id: string; name?: string; workspace?: string },
): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    const result = await state.client.request("agent.update", {
      id: agent.id,
      name: agent.name,
      workspace: agent.workspace,
    });

    if (!result || !(result as any).success) {
      throw new Error("Failed to update agent");
    }

    // 刷新列表
    await loadAgents(state);
  } catch (err) {
    throw err;
  }
}

/**
 * 删除助手
 */
export async function deleteAgent(
  state: AppViewState,
  agentId: string,
  deleteWorkspace?: boolean,
): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  state.deletingAgent = true;

  try {
    const result = await state.client.request("agent.delete", {
      id: agentId,
      deleteWorkspace: deleteWorkspace || false,
    });

    if (!result || !(result as any).success) {
      throw new Error("Failed to delete agent");
    }

    // 如果删除的是当前选中的助手，清空选择
    if (state.agentsSelectedId === agentId) {
      state.agentsSelectedId = null;
    }

    // 刷新列表
    await loadAgents(state);

    return (result as any).workspaceDeleted;
  } finally {
    state.deletingAgent = false;
  }
}

/**
 * 迁移助手工作区
 */
export async function migrateAgentWorkspace(
  state: AppViewState,
  agentId: string,
  newWorkspace: string,
): Promise<{ migrated: boolean; oldWorkspace: string; newWorkspace: string }> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  const result = await state.client.request("agent.workspace.migrate", {
    id: agentId,
    newWorkspace,
  });

  if (!result || !(result as any).success) {
    throw new Error("Failed to migrate workspace");
  }

  // 刷新列表
  await loadAgents(state);

  return {
    migrated: (result as any).migrated,
    oldWorkspace: (result as any).oldWorkspace,
    newWorkspace: (result as any).newWorkspace,
  };
}

/**
 * 获取默认工作区根目录
 */
export async function getDefaultWorkspace(state: AppViewState): Promise<string> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  const result = await state.client.request("agent.workspace.getDefault", {});

  if (!result) {
    throw new Error("Failed to get default workspace");
  }

  return (result as any).defaultWorkspace;
}

/**
 * 设置默认工作区根目录
 */
export async function setDefaultWorkspace(state: AppViewState, workspace: string): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  const result = await state.client.request("agent.workspace.setDefault", {
    workspace,
  });

  if (!result || !(result as any).success) {
    throw new Error("Failed to set default workspace");
  }
}

/**
 * 设置默认智能助手
 */
export async function setDefaultAgent(state: AppViewState, agentId: string): Promise<void> {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    const result = await state.client.request("agent.setDefault", {
      id: agentId,
    });

    if (!result || !(result as any).success) {
      throw new Error("Failed to set default agent");
    }

    // 刷新列表
    await loadAgents(state);
  } catch (err) {
    throw err;
  }
}
