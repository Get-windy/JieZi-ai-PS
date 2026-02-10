/**
 * Agent Model Accounts Controller
 *
 * 管理助手的模型账号绑定和配置
 */

import type { GatewayBrowserClient } from "../gateway-client.js";

/**
 * 模型账号配置
 */
export type ModelAccountConfig = {
  enabled: boolean; // 启用/停用
  priority: number; // 优先级（数字越大优先级越高）
  schedule?: {
    enabledHours: Array<[number, number]>; // 启用时间段 [[8, 18], [20, 22]]
    timezone?: string; // 时区
  } | null;
  usageLimit?: {
    maxTokens: number; // 最大token数
    period: "hour" | "day" | "month"; // 周期
    autoDisable: boolean; // 达到限制时自动停用
    currentUsage?: number; // 当前用量
  } | null;
  healthCheck?: {
    errorThreshold: number; // 错误阈值（连续错误次数）
    cooldownMinutes: number; // 冷却期（分钟）
    lastErrorTime?: number; // 最后错误时间戳
    errorCount?: number; // 当前错误计数
  } | null;
};

export type AgentModelAccountsState = {
  client: GatewayBrowserClient | null;

  // 已绑定的模型账号
  boundModelAccounts: string[];
  boundModelAccountsLoading: boolean;
  boundModelAccountsError: string | null;
  defaultModelAccountId: string;

  // 可用但未绑定的模型账号
  availableModelAccounts: string[];
  availableModelAccountsLoading: boolean;
  availableModelAccountsError: string | null;
  availableModelAccountsExpanded: boolean; // 是否展开显示可用账号

  // 账号配置管理
  accountConfigs: Record<string, ModelAccountConfig>; // accountId -> config
  accountConfigsLoading: boolean;
  accountConfigsError: string | null;

  // 操作状态
  modelAccountOperationError: string | null;
};

/**
 * 加载助手已绑定的模型账号
 */
export async function loadBoundModelAccounts(
  state: AgentModelAccountsState,
  agentId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.boundModelAccountsLoading = true;
  state.boundModelAccountsError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.bound", { agentId });

    if (response.ok && response.data) {
      state.boundModelAccounts = (response.data as any).accounts || [];
      state.defaultModelAccountId = (response.data as any).defaultAccountId || "";
    } else {
      state.boundModelAccountsError =
        response.error?.message || "Failed to load bound model accounts";
    }
  } catch (err) {
    state.boundModelAccountsError = String(err);
  } finally {
    state.boundModelAccountsLoading = false;
  }
}

/**
 * 加载可用但未绑定的模型账号
 */
export async function loadAvailableModelAccounts(
  state: AgentModelAccountsState,
  agentId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.availableModelAccountsLoading = true;
  state.availableModelAccountsError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.available", { agentId });

    if (response.ok && response.data) {
      state.availableModelAccounts = (response.data as any).accounts || [];
    } else {
      state.availableModelAccountsError =
        response.error?.message || "Failed to load available model accounts";
    }
  } catch (err) {
    state.availableModelAccountsError = String(err);
  } finally {
    state.availableModelAccountsLoading = false;
  }
}

/**
 * 绑定模型账号
 */
export async function bindModelAccount(
  state: AgentModelAccountsState,
  agentId: string,
  accountId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.bind", {
      agentId,
      accountId,
    });

    if (response.ok) {
      // 重新加载绑定列表和可用列表
      await loadBoundModelAccounts(state, agentId);
      await loadAvailableModelAccounts(state, agentId);
    } else {
      state.modelAccountOperationError = response.error?.message || "Failed to bind model account";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 解绑模型账号
 */
export async function unbindModelAccount(
  state: AgentModelAccountsState,
  agentId: string,
  accountId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.unbind", {
      agentId,
      accountId,
    });

    if (response.ok) {
      // 重新加载绑定列表和可用列表
      await loadBoundModelAccounts(state, agentId);
      await loadAvailableModelAccounts(state, agentId);
    } else {
      state.modelAccountOperationError =
        response.error?.message || "Failed to unbind model account";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 设置默认模型账号
 */
export async function setDefaultModelAccount(
  state: AgentModelAccountsState,
  agentId: string,
  accountId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    // 获取当前配置
    const getResponse = await state.client.call("agent.modelAccounts.list", { agentId });
    if (!getResponse.ok || !getResponse.data) {
      state.modelAccountOperationError = "Failed to get current config";
      return;
    }

    const currentConfig = (getResponse.data as any).config || {};

    // 更新默认账号
    const updatedConfig = {
      ...currentConfig,
      defaultAccountId: accountId,
    };

    const updateResponse = await state.client.call("agent.modelAccounts.update", {
      agentId,
      config: updatedConfig,
    });

    if (updateResponse.ok) {
      state.defaultModelAccountId = accountId;
    } else {
      state.modelAccountOperationError =
        updateResponse.error?.message || "Failed to set default account";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 切换可用账号展开/折叠状态
 */
export function toggleAvailableModelAccountsExpanded(state: AgentModelAccountsState): void {
  state.availableModelAccountsExpanded = !state.availableModelAccountsExpanded;
}

/**
 * 加载账号配置
 */
export async function loadAccountConfig(
  state: AgentModelAccountsState,
  agentId: string,
  accountId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.accountConfigsLoading = true;
  state.accountConfigsError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.config.get", {
      agentId,
      accountId,
    });

    if (response.ok && response.data) {
      const config = (response.data as any).config;
      state.accountConfigs = {
        ...state.accountConfigs,
        [accountId]: config,
      };
    } else {
      state.accountConfigsError = response.error?.message || "Failed to load account config";
    }
  } catch (err) {
    state.accountConfigsError = String(err);
  } finally {
    state.accountConfigsLoading = false;
  }
}

/**
 * 批量加载所有绑定账号的配置
 */
export async function loadAllAccountConfigs(
  state: AgentModelAccountsState,
  agentId: string,
): Promise<void> {
  if (!state.client || state.boundModelAccounts.length === 0) {
    return;
  }

  state.accountConfigsLoading = true;
  state.accountConfigsError = null;

  try {
    const promises = state.boundModelAccounts.map(async (accountId) => {
      const response = await state.client!.call("agent.modelAccounts.config.get", {
        agentId,
        accountId,
      });

      if (response.ok && response.data) {
        return { accountId, config: (response.data as any).config };
      }
      return null;
    });

    const results = await Promise.all(promises);
    const configs: Record<string, ModelAccountConfig> = {};

    for (const result of results) {
      if (result) {
        configs[result.accountId] = result.config;
      }
    }

    state.accountConfigs = configs;
  } catch (err) {
    state.accountConfigsError = String(err);
  } finally {
    state.accountConfigsLoading = false;
  }
}

/**
 * 更新账号配置
 */
export async function updateAccountConfig(
  state: AgentModelAccountsState,
  agentId: string,
  accountId: string,
  config: ModelAccountConfig,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.config.update", {
      agentId,
      accountId,
      config,
    });

    if (response.ok) {
      // 更新本地状态
      state.accountConfigs = {
        ...state.accountConfigs,
        [accountId]: config,
      };
    } else {
      state.modelAccountOperationError =
        response.error?.message || "Failed to update account config";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 快速切换账号启用/停用状态
 */
export async function toggleAccountEnabled(
  state: AgentModelAccountsState,
  agentId: string,
  accountId: string,
  enabled: boolean,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.config.toggle", {
      agentId,
      accountId,
      enabled,
    });

    if (response.ok) {
      // 更新本地状态
      const currentConfig = state.accountConfigs[accountId] || {
        enabled: true,
        priority: 0,
        schedule: null,
        usageLimit: null,
        healthCheck: null,
      };

      state.accountConfigs = {
        ...state.accountConfigs,
        [accountId]: {
          ...currentConfig,
          enabled,
        },
      };
    } else {
      state.modelAccountOperationError = response.error?.message || "Failed to toggle account";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}
