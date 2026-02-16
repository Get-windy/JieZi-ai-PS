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

/**
 * 模型详情类型
 */
export type ModelDetail = {
  modelId: string; // providerId/modelName
  providerId: string;
  modelName: string;
  displayName: string; // 友好显示名称
  providerName: string;
  enabled?: boolean; // 只在绑定列表中有
};

export type AgentModelAccountsState = {
  client: GatewayBrowserClient | null;

  // 已绑定的模型
  boundModelAccounts: string[];
  boundModelDetails: ModelDetail[]; // 新增：模型详情
  boundModelAccountsLoading: boolean;
  boundModelAccountsError: string | null;
  defaultModelAccountId: string;

  // 可用但未绑定的模型
  availableModelAccounts: string[];
  availableModelDetails: ModelDetail[]; // 新增：模型详情
  availableModelAccountsLoading: boolean;
  availableModelAccountsError: string | null;
  availableModelAccountsExpanded: boolean; // 是否展开显示可用模型

  // 模型配置管理
  accountConfigs: Record<string, ModelAccountConfig>; // modelId -> config
  accountConfigsLoading: boolean;
  accountConfigsError: string | null;

  // 操作状态
  modelAccountOperationError: string | null;
};

/**
 * 加载助手已绑定的模型
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
      state.boundModelDetails = (response.data as any).modelDetails || [];
      state.defaultModelAccountId = (response.data as any).defaultAccountId || "";
    } else {
      state.boundModelAccountsError = response.error?.message || "Failed to load bound models";
    }
  } catch (err) {
    state.boundModelAccountsError = String(err);
  } finally {
    state.boundModelAccountsLoading = false;
  }
}

/**
 * 加载可用但未绑定的模型
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
      state.availableModelDetails = (response.data as any).modelDetails || [];
    } else {
      state.availableModelAccountsError =
        response.error?.message || "Failed to load available models";
    }
  } catch (err) {
    state.availableModelAccountsError = String(err);
  } finally {
    state.availableModelAccountsLoading = false;
  }
}

/**
 * 绑定模型
 */
export async function bindModelAccount(
  state: AgentModelAccountsState,
  agentId: string,
  modelId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.bind", {
      agentId,
      accountId: modelId, // 后端兼容旧参数名
    });

    if (response.ok) {
      // 重新加载绑定列表和可用列表
      await loadBoundModelAccounts(state, agentId);
      await loadAvailableModelAccounts(state, agentId);
    } else {
      state.modelAccountOperationError = response.error?.message || "Failed to bind model";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 解绑模型
 */
export async function unbindModelAccount(
  state: AgentModelAccountsState,
  agentId: string,
  modelId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.unbind", {
      agentId,
      accountId: modelId, // 后端兼容旧参数名
    });

    if (response.ok) {
      // 重新加载绑定列表和可用列表
      await loadBoundModelAccounts(state, agentId);
      await loadAvailableModelAccounts(state, agentId);
    } else {
      state.modelAccountOperationError = response.error?.message || "Failed to unbind model";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 设置默认模型
 */
export async function setDefaultModelAccount(
  state: AgentModelAccountsState,
  agentId: string,
  modelId: string,
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

    // 更新默认模型
    const updatedConfig = {
      ...currentConfig,
      defaultAccountId: modelId,
    };

    const updateResponse = await state.client.call("agent.modelAccounts.update", {
      agentId,
      config: updatedConfig,
    });

    if (updateResponse.ok) {
      state.defaultModelAccountId = modelId;
    } else {
      state.modelAccountOperationError =
        updateResponse.error?.message || "Failed to set default account";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 切换可用模型展开/折叠状态
 */
export function toggleAvailableModelAccountsExpanded(state: AgentModelAccountsState): void {
  state.availableModelAccountsExpanded = !state.availableModelAccountsExpanded;
}

/**
 * 加载模型配置
 */
export async function loadAccountConfig(
  state: AgentModelAccountsState,
  agentId: string,
  modelId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.accountConfigsLoading = true;
  state.accountConfigsError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.config.get", {
      agentId,
      accountId: modelId,
    });

    if (response.ok && response.data) {
      const config = (response.data as any).config;
      state.accountConfigs = {
        ...state.accountConfigs,
        [modelId]: config,
      };
    } else {
      state.accountConfigsError = response.error?.message || "Failed to load model config";
    }
  } catch (err) {
    state.accountConfigsError = String(err);
  } finally {
    state.accountConfigsLoading = false;
  }
}

/**
 * 批量加载所有绑定模型的配置
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
    const promises = state.boundModelAccounts.map(async (modelId) => {
      const response = await state.client!.call("agent.modelAccounts.config.get", {
        agentId,
        accountId: modelId,
      });

      if (response.ok && response.data) {
        return { modelId, config: (response.data as any).config };
      }
      return null;
    });

    const results = await Promise.all(promises);
    const configs: Record<string, ModelAccountConfig> = {};

    for (const result of results) {
      if (result) {
        configs[result.modelId] = result.config;
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
 * 更新模型配置
 */
export async function updateAccountConfig(
  state: AgentModelAccountsState,
  agentId: string,
  modelId: string,
  config: ModelAccountConfig,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.config.update", {
      agentId,
      accountId: modelId,
      config,
    });

    if (response.ok) {
      // 更新本地状态
      state.accountConfigs = {
        ...state.accountConfigs,
        [modelId]: config,
      };
    } else {
      state.modelAccountOperationError = response.error?.message || "Failed to update model config";
    }
  } catch (err) {
    state.modelAccountOperationError = String(err);
  }
}

/**
 * 快速切换模型启用/停用状态
 */
export async function toggleAccountEnabled(
  state: AgentModelAccountsState,
  agentId: string,
  modelId: string,
  enabled: boolean,
): Promise<void> {
  if (!state.client) {
    return;
  }

  state.modelAccountOperationError = null;

  try {
    const response = await state.client.call("agent.modelAccounts.config.toggle", {
      agentId,
      accountId: modelId,
      enabled,
    });

    if (response.ok) {
      // 更新本地状态
      const currentConfig = state.accountConfigs[modelId] || {
        enabled: true,
        priority: 0,
        schedule: null,
        usageLimit: null,
        healthCheck: null,
      };

      state.accountConfigs = {
        ...state.accountConfigs,
        [modelId]: {
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
