/**
 * Message Queue Controller
 * 消息队列监控数据加载
 */

import type { GatewayBrowserClient } from "../gateway.ts";

export type QueuedMessage = {
  id: string;
  content: any;
  priority: "urgent" | "high" | "normal" | "low";
  createdAt: number;
  expiresAt?: number;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, any>;
};

export type QueueStats = {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
};

export type QueueConfig = {
  batchSize: number;
  intervalMs: number;
  maxRetries: number;
  persistenceEnabled: boolean;
};

export type MessageQueueState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  queueLoading: boolean;
  queueError: string | null;
  queueMessages: QueuedMessage[];
  queueStats: QueueStats | null;
  queueStatsLoading: boolean;
  queueConfig: QueueConfig | null;
  queueConfigLoading: boolean;
  queueConfigSaving: boolean;
};

/**
 * 加载队列状态
 */
export async function loadQueueStatus(state: MessageQueueState) {
  if (!state.client || !state.connected) {
    return;
  }

  if (state.queueLoading) {
    return;
  }

  state.queueLoading = true;
  state.queueError = null;

  try {
    const result = await state.client.request<{
      messages: QueuedMessage[];
      stats: QueueStats;
      queueLength: number;
    }>("messageQueue.status", {});

    if (result) {
      state.queueMessages = result.messages;
      state.queueStats = result.stats;
    }
  } catch (err) {
    state.queueError = String(err);
  } finally {
    state.queueLoading = false;
  }
}

/**
 * 加载队列统计信息
 */
export async function loadQueueStats(state: MessageQueueState) {
  if (!state.client || !state.connected) {
    return;
  }

  state.queueStatsLoading = true;

  try {
    const stats = await state.client.request<QueueStats>("messageQueue.stats", {});
    if (stats) {
      state.queueStats = stats;
    }
  } catch (err) {
    console.error("Failed to load queue stats:", err);
  } finally {
    state.queueStatsLoading = false;
  }
}

/**
 * 加载队列配置
 */
export async function loadQueueConfig(state: MessageQueueState) {
  if (!state.client || !state.connected) {
    return;
  }

  state.queueConfigLoading = true;

  try {
    const config = await state.client.request<QueueConfig>("messageQueue.config.get", {});
    if (config) {
      state.queueConfig = config;
    }
  } catch (err) {
    console.error("Failed to load queue config:", err);
  } finally {
    state.queueConfigLoading = false;
  }
}

/**
 * 更新队列配置
 */
export async function saveQueueConfig(state: MessageQueueState, config: Partial<QueueConfig>) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  state.queueConfigSaving = true;

  try {
    await state.client.request("messageQueue.config.update", config);

    // 重新加载配置
    await loadQueueConfig(state);
  } catch (err) {
    throw err;
  } finally {
    state.queueConfigSaving = false;
  }
}

/**
 * 清空队列
 */
export async function clearQueue(state: MessageQueueState, queueId: string = "default") {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  try {
    await state.client.request("messageQueue.clear", { queueId });

    // 重新加载状态
    await loadQueueStatus(state);
  } catch (err) {
    throw err;
  }
}
