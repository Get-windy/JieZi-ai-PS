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
      void loadModels(state, false);
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
  // 调试日志
  if (typeof window !== "undefined" && (window as unknown as { __DEBUG_UI__?: boolean }).__DEBUG_UI__) {
    console.log("[DEBUG:Models:loadModels] called:", {
      hasClient: !!state.client,
      connected: state.connected,
      alreadyLoading: state.modelsLoading,
      probe,
    });
  }

  if (!state.client || !state.connected) {
    console.warn("[DEBUG:Models:loadModels] skipped: no client or not connected");
    return;
  }
  if (state.modelsLoading) {
    console.warn("[DEBUG:Models:loadModels] skipped: already loading");
    return;
  }
  state.modelsLoading = true;
  state.modelsError = null;
  try {
    console.log("[DEBUG:Models:loadModels] requesting models.list...");
    // 注意：models.list 的 schema 不允许额外参数，只传递 probe
    const res = await state.client.request<ModelsStatusSnapshot | null>("models.list", {
      probe,
    });
    console.log("[DEBUG:Models:loadModels] received response:", {
      providersCount: Object.keys(res?.providers ?? {}).length,
      authsCount: Object.keys(res?.auths ?? {}).length,
      modelConfigsCount: Object.keys(res?.modelConfigs ?? {}).length,
      providerInstancesCount: res?.providerInstances?.length ?? 0,
    });
    state.modelsSnapshot = res;
    state.modelsLastSuccess = Date.now();
  } catch (err) {
    console.error("[DEBUG:Models:loadModels] error:", err);
    state.modelsError = String(err);
  } finally {
    state.modelsLoading = false;
    console.log("[DEBUG:Models:loadModels] loading finished");
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
    dispatchPolicy?: {
      role: "primary" | "roundrobin" | "fallback";
      priority: number;
      cooldownMinutes: number;
    } | null;
    quotaCycle?: {
      type: "weekly" | "monthly" | "quarterly" | "custom";
      resetDay: number;
      cycleStartMs?: number | null;
    } | null;
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
        dispatchPolicy: params.dispatchPolicy,
        quotaCycle: params.quotaCycle,
      });
    } else {
      // 添加新认证
      await state.client.request("models.auth.add", {
        provider: params.provider,
        name: params.name,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        dispatchPolicy: params.dispatchPolicy,
        quotaCycle: params.quotaCycle,
      });
    }
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 快速切换认证的启用/禁用状态
 * 注意：配额耗尽时后端会拒绝 enabled=true，调用方需处理异常
 */
export async function toggleAuthEnabled(state: ModelsState, authId: string, enabled: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.auth.update", { authId, enabled });
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
    throw err;
  }
}

/**
 * 重置凭据熔断状态（手动解除冷却）
 */
export async function resetAuthCircuit(state: ModelsState, authId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("models.auth.resetCircuit", { authId });
    await loadModels(state, false);
  } catch (err) {
    state.modelsError = String(err);
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
export async function testAuth(
  state: ModelsState,
  authId: string,
): Promise<{
  ok: boolean;
  message?: string;
  responseTime?: number;
  status?: number;
  error?: string;
}> {
  if (!state.client || !state.connected) {
    return { ok: false, message: "Not connected" };
  }
  try {
    const res = await state.client.request<{
      ok: boolean;
      message?: string;
      responseTime?: number;
      status?: number;
      error?: string;
    }>("models.auth.test", { authId });
    // 刷新数据以更新认证状态
    await loadModels(state, false);
    return res || { ok: false, message: "未知错误" };
  } catch (err) {
    return { ok: false, message: String(err) };
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
  } catch {
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
    isUnlisted?: boolean; // 不在供应商目录中（仅提示）
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
        isUnlisted?: boolean;
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
  } catch (err: unknown) {
    // 当后端返回 error 时，尝试从错误中提取数据
    // 错误格式：{ message: string, data?: unknown }
    if (err && typeof err === "object" && "data" in err) {
      const data = (
        err as { data: { requiresCascade?: boolean; authCount?: number; modelCount?: number } }
      ).data;
      if (data.requiresCascade) {
        return {
          success: false,
          requiresCascade: data.requiresCascade,
          authCount: data.authCount,
          modelCount: data.modelCount,
        };
      }
    }

    // 其他错误
    state.modelsError = String(err);
    return { success: false };
  }
}

// ============ OAuth重认证函数 ============

/**
 * 获取认证健康状态
 */
export async function getAuthStatus(
  state: ModelsState,
  authId: string,
): Promise<{
  authId: string;
  provider: string;
  type: "oauth" | "api_key" | "token";
  status: "ok" | "expiring" | "expired" | "unknown";
  expiresAt?: number;
  canRefresh: boolean;
  remainingMs?: number;
} | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  try {
    const res = await state.client.request<{
      authId: string;
      provider: string;
      type: "oauth" | "api_key" | "token";
      status: "ok" | "expiring" | "expired" | "unknown";
      expiresAt?: number;
      canRefresh: boolean;
      remainingMs?: number;
    }>("models.auth.status", { authId });
    return res;
  } catch {
    return null;
  }
}

/**
 * 手动刷新OAuth Token
 */
export async function refreshAuthToken(
  state: ModelsState,
  authId: string,
  force: boolean = false,
): Promise<{
  refreshed: boolean;
  expiresAt?: number;
  remainingMs?: number;
  message?: string;
}> {
  if (!state.client || !state.connected) {
    return { refreshed: false, message: "Not connected" };
  }
  try {
    const res = await state.client.request<{
      refreshed: boolean;
      expiresAt?: number;
      remainingMs?: number;
      message?: string;
    }>("models.auth.refresh", { authId, force });

    // 刷新成功后重新加载数据
    if (res?.refreshed) {
      await loadModels(state, false);
    }

    return res || { refreshed: false };
  } catch (err) {
    console.error("Failed to refresh auth token:", err);
    return { refreshed: false, message: String(err) };
  }
}

/**
 * 启动OAuth重认证流程
 */
export async function startOAuthReauth(
  state: ModelsState,
  authId: string,
): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
  provider: string;
  authId: string;
} | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  try {
    const res = await state.client.request<{
      deviceCode: string;
      userCode: string;
      verificationUrl: string;
      expiresIn: number;
      interval: number;
      provider: string;
      authId: string;
    }>("models.auth.reauth", { authId });
    return res;
  } catch (err) {
    console.error("Failed to start OAuth reauth:", err);
    state.modelsError = String(err);
    return null;
  }
}
