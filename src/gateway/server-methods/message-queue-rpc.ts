/**
 * Message Queue RPC Methods
 * 消息队列监控和配置的 RPC 方法处理器
 */

import type { GatewayRequestHandlers } from "./types.js";
import { messageQueue } from "../../channels/message-queue.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 消息队列 RPC 方法处理器
 */
export const messageQueueHandlers: GatewayRequestHandlers = {
  /**
   * 获取队列状态
   */
  "messageQueue.status": async ({ params, respond }) => {
    try {
      const messages = messageQueue.getMessages();
      const stats = messageQueue.getStats();

      respond(
        true,
        {
          messages,
          stats,
          queueLength: messages.length,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get queue status: ${String(error)}`),
      );
    }
  },

  /**
   * 获取队列统计信息
   */
  "messageQueue.stats": async ({ params, respond }) => {
    try {
      const stats = messageQueue.getStats();
      respond(true, stats, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get queue stats: ${String(error)}`),
      );
    }
  },

  /**
   * 获取批处理配置
   */
  "messageQueue.config.get": async ({ params, respond }) => {
    try {
      // TODO: 实现配置存储和读取
      // 临时返回默认配置
      respond(
        true,
        {
          batchSize: 10,
          intervalMs: 5000,
          maxRetries: 3,
          persistenceEnabled: true,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get queue config: ${String(error)}`),
      );
    }
  },

  /**
   * 更新批处理配置
   */
  "messageQueue.config.update": async ({ params, respond }) => {
    try {
      const persistenceEnabled = params?.persistenceEnabled;

      if (typeof persistenceEnabled === "boolean") {
        messageQueue.setPersistence(persistenceEnabled);
      }

      // TODO: 实现完整的配置更新
      // 需要存储配置并重新初始化队列

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update queue config: ${String(error)}`),
      );
    }
  },

  /**
   * 清空队列
   */
  "messageQueue.clear": async ({ params, respond }) => {
    try {
      const queueId = params?.queueId ? String(params.queueId) : "default";
      await messageQueue.clear(queueId);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to clear queue: ${String(error)}`),
      );
    }
  },
};
