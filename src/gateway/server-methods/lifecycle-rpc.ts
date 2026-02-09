/**
 * 生命周期管理 Gateway RPC 方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { LifecycleManager } from "../../lifecycle/lifecycle-manager.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

const lifecycleManager = LifecycleManager.getInstance();

export const lifecycleHandlers: GatewayRequestHandlers = {
  /**
   * 初始化智能助手生命周期
   */
  "lifecycle.initialize": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const createdBy = String(params?.createdBy ?? "").trim();

      if (!agentId || !createdBy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and createdBy are required"),
        );
        return;
      }

      const state = lifecycleManager.initializeAgent({ agentId, createdBy });

      respond(true, { state }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to initialize lifecycle: ${String(error)}`),
      );
    }
  },

  /**
   * 获取生命周期状态
   */
  "lifecycle.getState": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const state = lifecycleManager.getLifecycleState(agentId);

      if (!state) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Lifecycle not found for agent: ${agentId}`),
        );
        return;
      }

      respond(true, { state }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get lifecycle state: ${String(error)}`),
      );
    }
  },

  /**
   * 转换生命周期阶段
   */
  "lifecycle.transitionStage": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const toStage = String(params?.toStage ?? "").trim();
      const triggeredBy = params?.triggeredBy ? String(params.triggeredBy) : undefined;
      const reason = params?.reason ? String(params.reason) : undefined;

      if (!agentId || !toStage) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and toStage are required"),
        );
        return;
      }

      const state = lifecycleManager.transitionStage({
        agentId,
        toStage: toStage as any,
        triggeredBy,
        reason,
      });

      respond(true, { state }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to transition stage: ${String(error)}`),
      );
    }
  },

  /**
   * 记录生命周期事件
   */
  "lifecycle.recordEvent": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const eventType = String(params?.eventType ?? "").trim();
      const triggeredBy = params?.triggeredBy ? String(params.triggeredBy) : undefined;
      const reason = params?.reason ? String(params.reason) : undefined;
      const metadata = params?.metadata;

      if (!agentId || !eventType) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and eventType are required"),
        );
        return;
      }

      lifecycleManager.recordEvent({
        agentId,
        eventType: eventType as any,
        triggeredBy,
        reason,
        metadata: metadata as Record<string, any> | undefined,
      });

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to record event: ${String(error)}`),
      );
    }
  },

  /**
   * 暂停智能助手
   */
  "lifecycle.suspend": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const triggeredBy = params?.triggeredBy ? String(params.triggeredBy) : undefined;
      const reason = params?.reason ? String(params.reason) : undefined;

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      lifecycleManager.suspendAgent({ agentId, triggeredBy, reason });

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to suspend agent: ${String(error)}`),
      );
    }
  },

  /**
   * 重新激活智能助手
   */
  "lifecycle.reactivate": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const triggeredBy = params?.triggeredBy ? String(params.triggeredBy) : undefined;
      const reason = params?.reason ? String(params.reason) : undefined;

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      lifecycleManager.reactivateAgent({ agentId, triggeredBy });

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to reactivate agent: ${String(error)}`),
      );
    }
  },

  /**
   * 查询生命周期历史
   */
  "lifecycle.getHistory": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const state = lifecycleManager.getLifecycleState(agentId);

      if (!state) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Lifecycle not found for agent: ${agentId}`),
        );
        return;
      }

      respond(
        true,
        {
          stageHistory: state.stageHistory,
          events: state.events,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get lifecycle history: ${String(error)}`),
      );
    }
  },

  /**
   * 获取统计信息
   */
  "lifecycle.getStatistics": async ({ params, respond }) => {
    try {
      const stats = lifecycleManager.getStatistics();

      respond(true, { statistics: stats }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get statistics: ${String(error)}`),
      );
    }
  },

  /**
   * 批量查询生命周期状态
   */
  "lifecycle.batchGetStates": async ({ params, respond }) => {
    try {
      const agentIds = params?.agentIds;

      if (!Array.isArray(agentIds) || agentIds.length === 0) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentIds array is required"),
        );
        return;
      }

      const states = agentIds
        .map((id: any) => lifecycleManager.getLifecycleState(String(id)))
        .filter(Boolean);

      respond(true, { states, total: states.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to batch get states: ${String(error)}`),
      );
    }
  },

  /**
   * 设置配置
   */
  "lifecycle.setConfig": async ({ params, respond }) => {
    try {
      const config = params?.config;

      if (!config || typeof config !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config is required"));
        return;
      }

      lifecycleManager.setConfig(config);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to set config: ${String(error)}`),
      );
    }
  },

  /**
   * 获取配置
   */
  "lifecycle.getConfig": async ({ params, respond }) => {
    try {
      const config = lifecycleManager.getConfig();

      respond(true, { config }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get config: ${String(error)}`),
      );
    }
  },
};
