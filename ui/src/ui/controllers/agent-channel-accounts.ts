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
  boundChannelAccounts: ChannelAccountBinding[];
  boundChannelAccountsLoading: boolean;
  boundChannelAccountsError: string | null;

  // 可用但未绑定的通道账号
  availableChannelAccounts: AvailableChannelAccount[];
  availableChannelAccountsLoading: boolean;
  availableChannelAccountsError: string | null;
  availableChannelAccountsExpanded: boolean; // 是否展开显示可用账号

  // 操作状态
  addingAccount: boolean;
  removingAccount: boolean;
  channelAccountOperationError: string | null;
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

  state.boundChannelAccountsLoading = true;
  state.boundChannelAccountsError = null;

  try {
    const response = await state.client.call("agent.channelAccounts.list", { agentId });

    if (response.ok && response.data) {
      const bindings = (response.data as any).bindings || [];

      // 将后端返回的平铺列表转换为按通道分组的格式
      // 后端返回：[{ channelId: "telegram", accountId: "acc1" }, { channelId: "telegram", accountId: "acc2" }]
      // 前端需要：[{ channelId: "telegram", accountIds: ["acc1", "acc2"] }]
      const groupedByChannel = new Map<string, string[]>();

      for (const binding of bindings) {
        const channelId = binding.channelId;
        const accountId = binding.accountId || "default";

        if (!groupedByChannel.has(channelId)) {
          groupedByChannel.set(channelId, []);
        }

        groupedByChannel.get(channelId)!.push(accountId);
      }

      // 转换为数组格式
      state.boundChannelAccounts = Array.from(groupedByChannel.entries()).map(
        ([channelId, accountIds]) => ({ channelId, accountIds }),
      );
    } else {
      state.boundChannelAccountsError = response.error?.message || "Failed to load bound accounts";
    }
  } catch (err) {
    state.boundChannelAccountsError = String(err);
  } finally {
    state.boundChannelAccountsLoading = false;
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

  state.availableChannelAccountsLoading = true;
  state.availableChannelAccountsError = null;

  try {
    const response = await state.client.call("agent.channelAccounts.available", { agentId });

    if (response.ok && response.data) {
      state.availableChannelAccounts = (response.data as any).accounts || [];
    } else {
      state.availableChannelAccountsError =
        response.error?.message || "Failed to load available accounts";
    }
  } catch (err) {
    state.availableChannelAccountsError = String(err);
  } finally {
    state.availableChannelAccountsLoading = false;
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
  state.channelAccountOperationError = null;

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
      state.channelAccountOperationError =
        response.error?.message || "Failed to add channel account";
    }
  } catch (err) {
    state.channelAccountOperationError = String(err);
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
  state.channelAccountOperationError = null;

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
      state.channelAccountOperationError =
        response.error?.message || "Failed to remove channel account";
    }
  } catch (err) {
    state.channelAccountOperationError = String(err);
  } finally {
    state.removingAccount = false;
  }
}

/**
 * 切换可用账号展开/折叠状态
 */
export function toggleAvailableAccountsExpanded(state: AgentChannelAccountsState): void {
  state.availableChannelAccountsExpanded = !state.availableChannelAccountsExpanded;
}
