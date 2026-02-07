import type { ModelsStatusSnapshot } from "../types.js";
import type { ModelsState } from "./models.types.js";

export type { ModelsState };

// 自动刷新间隔（30秒）
const AUTO_REFRESH_INTERVAL = 30000;
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动自动刷新
 */
export function startModelsAutoRefresh(state: ModelsState) {
  stopModelsAutoRefresh();

  autoRefreshTimer = setInterval(() => {
    if (state.connected && !state.modelsLoading) {
      loadModels(state, false);
    }
  }, AUTO_REFRESH_INTERVAL);
}

/**
 * 停止自动刷新
 */
export function stopModelsAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// ============ 基础数据加载 ============

export async function loadModels(state: ModelsState, probe: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.modelsLoading) {
    return;
  }
  state.modelsLoading = true;
  state.modelsError = null;
  try {
    const res = await state.client.request<ModelsStatusSnapshot | null>("models.list", {
      probe,
      timeoutMs: 8000,
    });
    state.modelsSnapshot = res;
    state.modelsLastSuccess = Date.now();
  } catch (err) {
    state.modelsError = String(err);
  } finally {
    state.modelsLoading = false;
  }
}

export async function loadModelsStatus(state: ModelsState, client: unknown, probe: boolean) {
  await loadModels(state, probe);
}

// ============ 认证管理函数 ============

/**
 * 添加或更新认证
 */
export async function saveAuth(
  state: ModelsState,
  params: {
    authId?: string;
    provider: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    if (params.authId) {
      // 更新现有认证
      await state.client.request("models.auth.update", {
        authId: params.authId,
        name: params.name,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      });
    } else {
      // 添加新认证
      await state.client.request("models.auth.add", {
        provider: params.provider,
        name: params.name,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      });
    }
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 删除认证
 */
export async function deleteAuth(state: ModelsState, authId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.auth.delete", { authId });
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 设置默认认证
 */
export async function setDefaultAuth(state: ModelsState, authId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.auth.setDefault", { authId });
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 测试认证连接
 */
export async function testAuth(state: ModelsState, authId: string) {
  if (!state.client || !state.connected) {
    return { success: false, message: "Not connected" };
  }
  try {
    const res = await state.client.request<{ success: boolean; message?: string }>(
      "models.auth.test",
      { authId },
    );
    return res;
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

/**
 * 刷新认证余额
 */
export async function refreshAuthBalance(state: ModelsState, authId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.auth.getBalance", { authId });
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
  }
}

/**
 * 查询认证可用的模型列表
 */
export async function fetchAvailableModels(state: ModelsState, authId: string): Promise<string[]> {
  if (!state.client || !state.connected) {
    return [];
  }
  try {
    const res = await state.client.request<{ models: string[] }>("models.auth.listModels", {
      authId,
    });
    return res?.models || [];
  } catch (err) {
    state.modelsError = String(err);
    return [];
  }
}

// ============ 模型配置管理函数 ============

/**
 * 添加或更新模型配置
 */
export async function saveModelConfig(
  state: ModelsState,
  params: {
    configId?: string;
    authId: string;
    provider: string;
    modelName: string;
    nickname?: string;
    enabled: boolean;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    systemPrompt?: string;
    conversationRounds?: number;
    maxIterations?: number;
    usageLimits?: {
      maxRequestsPerDay?: number;
      maxTokensPerRequest?: number;
    };
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    if (params.configId) {
      // 更新现有配置
      await state.client.request("models.config.update", params);
    } else {
      // 添加新配置
      await state.client.request("models.config.add", params);
    }
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 删除模型配置
 */
export async function deleteModelConfig(state: ModelsState, configId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.config.delete", { configId });
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 切换模型启用/禁用状态
 */
export async function toggleModelConfig(state: ModelsState, configId: string, enabled: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.config.update", {
      configId,
      enabled,
    });
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 获取模型单价
 */
export async function getModelPricing(
  state: ModelsState,
  modelName: string,
): Promise<{ inputPer1k: number; outputPer1k: number; currency: string } | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  try {
    const res = await state.client.request<{
      pricing: { inputPer1k: number; outputPer1k: number; currency: string } | null;
    }>("models.config.getPricing", { modelName });
    return res?.pricing || null;
  } catch (err) {
    return null;
  }
}

/**
 * 刷新认证可用的模型列表
 */
export async function refreshAuthModels(
  state: ModelsState,
  authId: string,
): Promise<
  Array<{
    modelName: string;
    isConfigured: boolean;
    isEnabled: boolean;
    isDeprecated: boolean;
    configId?: string;
  }>
> {
  if (!state.client || !state.connected) {
    return [];
  }
  try {
    const res = await state.client.request<{
      models: Array<{
        modelName: string;
        isConfigured: boolean;
        isEnabled: boolean;
        isDeprecated: boolean;
        configId?: string;
      }>;
      total: number;
    }>("models.auth.refreshModels", { authId });
    return res?.models || [];
  } catch (err) {
    state.modelsError = String(err);
    return [];
  }
}

/**
 * 批量导入模型
 */
export async function batchAddModels(
  state: ModelsState,
  authId: string,
  provider: string,
  modelNames: string[],
): Promise<{ added: number; skipped: number; message?: string }> {
  if (!state.client || !state.connected) {
    return { added: 0, skipped: 0, message: "未连接" };
  }
  try {
    const res = await state.client.request<{
      added: number;
      skipped: number;
      message?: string;
    }>("models.config.batchAdd", { authId, provider, modelNames });
    await loadModels(state, false);
    return res || { added: 0, skipped: 0 };
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

// ============ 供应商管理函数 ============

/**
 * 添加供应商
 */
export async function addProvider(
  state: ModelsState,
  params: {
    id: string;
    name: string;
    icon?: string;
    website?: string;
    templateId?: string;
    defaultBaseUrl: string;
    apiKeyPlaceholder?: string;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.providers.add", params);
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 更新供应商
 */
export async function updateProvider(
  state: ModelsState,
  params: {
    id: string;
    name?: string;
    icon?: string;
    website?: string;
    templateId?: string;
    defaultBaseUrl?: string;
    apiKeyPlaceholder?: string;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.providers.update", params);
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 删除供应商
 */
export async function deleteProvider(state: ModelsState, id: string, cascade: boolean = false) {
  if (!state.client || !state.connected) {
    return { success: false };
  }
  try {
    const res = await state.client.request<{
      success: boolean;
      cascadeDeleted?: boolean;
      requiresCascade?: boolean;
      authCount?: number;
      modelCount?: number;
    }>("models.providers.delete", { id, cascade });

    if (res?.success) {
      await loadModels(state, false);
      return { success: true, cascadeDeleted: res.cascadeDeleted };
    }

    // 检查是否需要级联删除
    return {
      success: false,
      requiresCascade: res?.requiresCascade,
      authCount: res?.authCount,
      modelCount: res?.modelCount,
    };
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}
