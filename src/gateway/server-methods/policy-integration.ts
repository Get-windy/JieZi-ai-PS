/**
 * Phase 3 - Policy Integration Gateway Handlers
 * 策略集成的 Gateway 处理器
 */

import type { GatewayRequestHandlers } from "./types.js";
import { policyMiddleware } from "../../channels/policy-middleware.js";
import { policyScheduler } from "../../channels/policies/scheduler.js";
import type {
  InboundMessageContext,
  OutboundMessageContext,
} from "../../channels/policies/types.js";

/**
 * 策略集成 Gateway 处理器
 */
export const policyIntegrationHandlers: GatewayRequestHandlers = {
  /**
   * 执行入站消息策略
   */
  "policy.inbound.execute": async ({ params, respond }) => {
    try {
      const { message, agentId, priority } = params as {
        message: InboundMessageContext;
        agentId: string;
        priority?: number;
      };

      const result = await policyMiddleware.processInboundMessage(message, agentId, priority);

      respond(true, { result });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to execute inbound policy",
      });
    }
  },

  /**
   * 执行出站消息策略
   */
  "policy.outbound.execute": async ({ params, respond }) => {
    try {
      const { message, agentId, priority } = params as {
        message: OutboundMessageContext;
        agentId: string;
        priority?: number;
      };

      const result = await policyMiddleware.processOutboundMessage(message, agentId, priority);

      respond(true, { result });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to execute outbound policy",
      });
    }
  },

  /**
   * 获取策略中间件状态
   */
  "policy.middleware.status": async ({ respond }) => {
    try {
      const config = policyMiddleware.getConfig();

      respond(true, { config });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to get middleware status",
      });
    }
  },

  /**
   * 更新策略中间件配置
   */
  "policy.middleware.updateConfig": async ({ params, respond }) => {
    try {
      const { config } = params as {
        config: {
          enabled?: boolean;
          logExecution?: boolean;
          defaultPriority?: number;
        };
      };

      policyMiddleware.updateConfig(config);

      respond(true, { success: true });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to update middleware config",
      });
    }
  },

  /**
   * 获取策略调度器队列状态
   */
  "policy.scheduler.queueStatus": async ({ respond }) => {
    try {
      const status = policyScheduler.getQueueStatus();

      respond(true, { status });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to get queue status",
      });
    }
  },

  /**
   * 更新策略调度器配置
   */
  "policy.scheduler.updateConfig": async ({ params, respond }) => {
    try {
      const { config } = params as {
        config: {
          maxConcurrency?: number;
          executionTimeout?: number;
          enablePriorityQueue?: boolean;
        };
      };

      policyScheduler.updateConfig(config);

      respond(true, { success: true });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to update scheduler config",
      });
    }
  },

  /**
   * 清空调度器队列
   */
  "policy.scheduler.clearQueue": async ({ respond }) => {
    try {
      policyScheduler.clearQueue();

      respond(true, { success: true });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to clear queue",
      });
    }
  },

  /**
   * 取消运行中的策略任务
   */
  "policy.scheduler.cancelRunningTasks": async ({ respond }) => {
    try {
      policyScheduler.cancelRunningTasks();

      respond(true, { success: true });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to cancel running tasks",
      });
    }
  },
};
