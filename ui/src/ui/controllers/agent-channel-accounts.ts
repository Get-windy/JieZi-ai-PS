/**
 * Agent Channel Accounts Controller
 *
 * 管理助手的通道账号绑定
 */

import type { GatewayBrowserClient } from "../gateway-client.js";

export type ChannelAccountBinding = {
  channelId: string;
  accountIds: string[];
};

export type AvailableChannelAccount = {
  channelId: string;
  accountId: string;
  label: string;
  configured: boolean;
};

export type AgentChannelAccountsState = {
  client: GatewayBrowserClient | null;

  // 已绑定的通道账号
  boundAccounts: ChannelAccountBinding[];
  boundAccountsLoading: boolean;
  boundAccountsError: string | null;

  // 可用但未绑定的通道账号
  availableAccounts: AvailableChannelAccount[];
  availableAccountsLoading: boolean;
  availableAccountsError: string | null;
  availableAccountsExpanded: boolean; // 是否展开显示可用账号

  // 操作状态
  addingAccount: boolean;
  removingAccount: boolean;
  operationError: string | null;
};

/**
 * 加载助手已绑定的通道账号
 */
export async function loadBoundChannelAccounts(
  state: AgentChannelAccountsState,
  agentId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.boundAccountsLoading = true;
  state.boundAccountsError = null;

  try {
    const response = await state.client.call("agent.channelAccounts.list", { agentId });

    if (response.ok && response.data) {
      state.boundAccounts = (response.data as any).bindings || [];
    } else {
      state.boundAccountsError = response.error?.message || "Failed to load bound accounts";
    }
  } catch (err) {
    state.boundAccountsError = String(err);
  } finally {
    state.boundAccountsLoading = false;
  }
}

/**
 * 加载可用但未绑定的通道账号
 */
export async function loadAvailableChannelAccounts(
  state: AgentChannelAccountsState,
  agentId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.availableAccountsLoading = true;
  state.availableAccountsError = null;

  try {
    const response = await state.client.call("agent.channelAccounts.available", { agentId });

    if (response.ok && response.data) {
      state.availableAccounts = (response.data as any).accounts || [];
    } else {
      state.availableAccountsError = response.error?.message || "Failed to load available accounts";
    }
  } catch (err) {
    state.availableAccountsError = String(err);
  } finally {
    state.availableAccountsLoading = false;
  }
}

/**
 * 添加通道账号绑定
 */
export async function addChannelAccountBinding(
  state: AgentChannelAccountsState,
  agentId: string,
  channelId: string,
  accountId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.addingAccount = true;
  state.operationError = null;

  try {
    const response = await state.client.call("agent.channelAccounts.add", {
      agentId,
      channelId,
      accountId,
    });

    if (response.ok) {
      // 重新加载绑定列表和可用列表
      await loadBoundChannelAccounts(state, agentId);
      await loadAvailableChannelAccounts(state, agentId);
    } else {
      state.operationError = response.error?.message || "Failed to add channel account";
    }
  } catch (err) {
    state.operationError = String(err);
  } finally {
    state.addingAccount = false;
  }
}

/**
 * 移除通道账号绑定
 */
export async function removeChannelAccountBinding(
  state: AgentChannelAccountsState,
  agentId: string,
  channelId: string,
  accountId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.removingAccount = true;
  state.operationError = null;

  try {
    const response = await state.client.call("agent.channelAccounts.remove", {
      agentId,
      channelId,
      accountId,
    });

    if (response.ok) {
      // 重新加载绑定列表和可用列表
      await loadBoundChannelAccounts(state, agentId);
      await loadAvailableChannelAccounts(state, agentId);
    } else {
      state.operationError = response.error?.message || "Failed to remove channel account";
    }
  } catch (err) {
    state.operationError = String(err);
  } finally {
    state.removingAccount = false;
  }
}

/**
 * 切换可用账号展开/折叠状态
 */
export function toggleAvailableAccountsExpanded(state: AgentChannelAccountsState): void {
  state.availableAccountsExpanded = !state.availableAccountsExpanded;
}
