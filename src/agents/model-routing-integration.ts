/**
 * 模型路由集成器 - Phase 1 智能模型账号路由系统集成
 *
 * 本模块提供统一的集成入口，将智能模型路由功能集成到实际应用中。
 * 支持多种集成方式：函数调用、中间件、实例化。
 *
 * 主要功能：
 * - 便捷的模型账号选择接口
 * - 会话级别账号固定
 * - 故障转移自动处理
 * - 详细的路由日志
 * - 路由决策诊断
 *
 * @module agents/model-routing-integration
 */

import type { AgentModelAccountsConfig } from "../config/types.agents.js";
import type { OpenClawConfig } from "../config/types.js";
import { resolveAgentModelAccounts } from "./agent-scope.js";
import {
  routeToOptimalModelAccount,
  handleFailover,
  type SessionContext,
  type ModelInfo,
  type RoutingResult,
} from "./model-routing.js";

/**
 * 模型路由集成器
 *
 * 提供统一的模型路由接口，简化集成复杂度。
 */
export class ModelRoutingIntegrator {
  private config: OpenClawConfig;
  private sessionPinning: Map<string, string> = new Map(); // sessionId -> accountId
  private failedAccounts: Map<string, number> = new Map(); // accountId -> failCount

  constructor(config: OpenClawConfig) {
    this.config = config;
  }

  /**
   * 为会话选择最优模型账号
   *
   * @param params - 选择参数
   * @returns 路由结果，包含选中的账号ID、模型引用、选择原因
   */
  async selectModelAccount(params: {
    agentId: string;
    sessionId: string;
    message: string;
    context: SessionContext;
    modelInfoGetter: (accountId: string) => Promise<ModelInfo | undefined>;
  }): Promise<RoutingResult | null> {
    const { agentId, sessionId, message, context, modelInfoGetter } = params;

    // 1. 获取智能助手的模型账号配置
    const modelAccountsConfig = resolveAgentModelAccounts(this.config, agentId);
    if (!modelAccountsConfig) {
      console.log(
        `[ModelRoutingIntegrator] Agent ${agentId} has no modelAccounts config, skipping routing`,
      );
      return null;
    }

    // 2. 检查会话固定（Session Pinning）
    const pinnedAccountId = this.sessionPinning.get(sessionId);
    if (pinnedAccountId && modelAccountsConfig.accounts.includes(pinnedAccountId)) {
      console.log(
        `[ModelRoutingIntegrator] Session ${sessionId} pinned to account ${pinnedAccountId}`,
      );
      const modelInfo = await modelInfoGetter(pinnedAccountId);
      if (modelInfo) {
        return {
          accountId: pinnedAccountId,
          reason: "会话固定到此账号",
          scores: [],
        };
      }
    }

    // 3. 调用智能路由引擎
    console.log(`[ModelRoutingIntegrator] Routing for agent ${agentId}, session ${sessionId}`);
    const result = await routeToOptimalModelAccount(
      message,
      context,
      modelAccountsConfig,
      modelInfoGetter,
    );

    // 4. 记录路由决策
    this.logRoutingDecision(agentId, sessionId, result);

    // 5. 会话固定（仅在智能模式且首次选择时）
    if (modelAccountsConfig.routingMode === "smart" && !pinnedAccountId) {
      this.sessionPinning.set(sessionId, result.accountId);
      console.log(
        `[ModelRoutingIntegrator] Session ${sessionId} now pinned to ${result.accountId}`,
      );
    }

    return result;
  }

  /**
   * 处理模型账号调用失败
   *
   * @param params - 故障转移参数
   * @returns 下一个可用账号ID，如果没有则返回 undefined
   */
  async handleAccountFailure(params: {
    agentId: string;
    sessionId: string;
    failedAccountId: string;
    reason: string;
    lastRoutingResult: RoutingResult;
  }): Promise<string | undefined> {
    const { agentId, sessionId, failedAccountId, reason, lastRoutingResult } = params;

    console.warn(`[ModelRoutingIntegrator] Account ${failedAccountId} failed: ${reason}`);

    // 1. 记录失败次数
    const failCount = (this.failedAccounts.get(failedAccountId) || 0) + 1;
    this.failedAccounts.set(failedAccountId, failCount);

    // 2. 清除会话固定
    if (this.sessionPinning.get(sessionId) === failedAccountId) {
      this.sessionPinning.delete(sessionId);
      console.log(`[ModelRoutingIntegrator] Session ${sessionId} unpinned from ${failedAccountId}`);
    }

    // 3. 调用故障转移
    const nextAccountId = handleFailover(failedAccountId, lastRoutingResult.scores, reason);

    if (nextAccountId) {
      console.log(`[ModelRoutingIntegrator] Failover to account ${nextAccountId}`);
      // 更新会话固定到新账号
      this.sessionPinning.set(sessionId, nextAccountId);
    } else {
      console.error(`[ModelRoutingIntegrator] No available account for failover`);
    }

    return nextAccountId;
  }

  /**
   * 重置会话固定（用于强制重新路由）
   *
   * @param sessionId - 会话ID
   */
  resetSessionPinning(sessionId: string): void {
    this.sessionPinning.delete(sessionId);
    console.log(`[ModelRoutingIntegrator] Session ${sessionId} pinning reset`);
  }

  /**
   * 获取会话固定的账号
   *
   * @param sessionId - 会话ID
   * @returns 固定的账号ID，如果没有则返回 undefined
   */
  getSessionPinnedAccount(sessionId: string): string | undefined {
    return this.sessionPinning.get(sessionId);
  }

  /**
   * 获取账号失败次数
   *
   * @param accountId - 账号ID
   * @returns 失败次数
   */
  getAccountFailureCount(accountId: string): number {
    return this.failedAccounts.get(accountId) || 0;
  }

  /**
   * 重置账号失败计数
   *
   * @param accountId - 账号ID
   */
  resetAccountFailureCount(accountId: string): void {
    this.failedAccounts.delete(accountId);
    console.log(`[ModelRoutingIntegrator] Account ${accountId} failure count reset`);
  }

  /**
   * 记录路由决策日志
   */
  private logRoutingDecision(agentId: string, sessionId: string, result: RoutingResult): void {
    console.log(
      `[ModelRoutingIntegrator] Routing Decision:
  Agent: ${agentId}
  Session: ${sessionId}
  Selected: ${result.accountId}
  Reason: ${result.reason}
  Top 3 Scores: ${result.scores
    .slice(0, 3)
    .map((s) => `${s.accountId}(${s.totalScore})`)
    .join(", ")}`,
    );
  }

  /**
   * 诊断路由决策（用于调试）
   *
   * @param params - 诊断参数
   * @returns 诊断报告
   */
  async diagnoseRouting(params: {
    agentId: string;
    message: string;
    context: SessionContext;
    modelInfoGetter: (accountId: string) => Promise<ModelInfo | undefined>;
  }): Promise<{
    config: AgentModelAccountsConfig | undefined;
    availableAccounts: string[];
    routingResult: RoutingResult | null;
    detailedScores: any[];
  }> {
    const { agentId, message, context, modelInfoGetter } = params;

    const modelAccountsConfig = resolveAgentModelAccounts(this.config, agentId);
    if (!modelAccountsConfig) {
      return {
        config: undefined,
        availableAccounts: [],
        routingResult: null,
        detailedScores: [],
      };
    }

    const routingResult = await routeToOptimalModelAccount(
      message,
      context,
      modelAccountsConfig,
      modelInfoGetter,
    );

    return {
      config: modelAccountsConfig,
      availableAccounts: modelAccountsConfig.accounts,
      routingResult,
      detailedScores: routingResult.scores,
    };
  }
}

// ============================================================================
// 便捷函数 - 无需实例化即可使用
// ============================================================================

/**
 * 便捷函数：选择模型账号
 *
 * 推荐用于简单场景，无需管理 ModelRoutingIntegrator 实例。
 *
 * @example
 * ```typescript
 * const result = await selectModelAccount({
 *   config,
 *   agentId: "code-assistant",
 *   sessionId: "session-123",
 *   message: "帮我写一个排序算法",
 *   context: { history: [...], tools: [...] },
 *   modelInfoGetter: async (accountId) => { ... }
 * });
 *
 * if (result) {
 *   console.log(`Selected account: ${result.accountId}`);
 * }
 * ```
 */
export async function selectModelAccount(params: {
  config: OpenClawConfig;
  agentId: string;
  sessionId: string;
  message: string;
  context: SessionContext;
  modelInfoGetter: (accountId: string) => Promise<ModelInfo | undefined>;
}): Promise<RoutingResult | null> {
  const integrator = new ModelRoutingIntegrator(params.config);
  return integrator.selectModelAccount({
    agentId: params.agentId,
    sessionId: params.sessionId,
    message: params.message,
    context: params.context,
    modelInfoGetter: params.modelInfoGetter,
  });
}

// ============================================================================
// 中间件工厂 - 用于集成到消息处理中间件链
// ============================================================================

/**
 * 创建模型路由中间件
 *
 * 中间件会在消息处理前自动选择最优模型账号，并将结果存储在 ctx.state 中。
 *
 * @param config - OpenClaw 配置
 * @param modelInfoGetter - 模型信息获取函数
 * @returns 中间件函数
 *
 * @example
 * ```typescript
 * import { createModelRoutingMiddleware } from "./agents/model-routing-integration.js";
 *
 * const app = new Koa();
 * app.use(createModelRoutingMiddleware(config, modelInfoGetter));
 *
 * app.use(async (ctx, next) => {
 *   const routingResult = ctx.state.routingResult;
 *   if (routingResult) {
 *     console.log(`Using account: ${routingResult.accountId}`);
 *   }
 *   await next();
 * });
 * ```
 */
export function createModelRoutingMiddleware(
  config: OpenClawConfig,
  modelInfoGetter: (accountId: string) => Promise<ModelInfo | undefined>,
): (ctx: any, next: () => Promise<void>) => Promise<void> {
  const integrator = new ModelRoutingIntegrator(config);

  return async (ctx: any, next: () => Promise<void>) => {
    const { agentId, sessionId, message, context } = ctx.state;

    if (!agentId || !sessionId || !message) {
      // 缺少必要参数，跳过路由
      await next();
      return;
    }

    try {
      const result = await integrator.selectModelAccount({
        agentId,
        sessionId,
        message,
        context: context || {},
        modelInfoGetter,
      });

      // 将路由结果存储在 ctx.state 中
      ctx.state.routingResult = result;
      ctx.state.modelRoutingIntegrator = integrator;
    } catch (err) {
      console.error("[ModelRoutingMiddleware] Error:", err);
      // 路由失败不阻止请求继续
    }

    await next();
  };
}

// ============================================================================
// 全局实例 - 用于简单的单例模式集成
// ============================================================================

/**
 * 全局模型路由集成器实例
 *
 * 推荐在应用启动时初始化一次，然后在整个应用中复用。
 *
 * @example
 * ```typescript
 * import { modelRoutingIntegrator } from "./agents/model-routing-integration.js";
 *
 * // 应用启动时
 * modelRoutingIntegrator.initialize(config);
 *
 * // 在业务代码中使用
 * const result = await modelRoutingIntegrator.selectModelAccount({...});
 * ```
 */
let globalIntegrator: ModelRoutingIntegrator | null = null;

export const modelRoutingIntegrator = {
  /**
   * 初始化全局集成器
   */
  initialize(config: OpenClawConfig): void {
    globalIntegrator = new ModelRoutingIntegrator(config);
    console.log("[ModelRoutingIntegrator] Global instance initialized");
  },

  /**
   * 获取全局集成器实例
   */
  getInstance(): ModelRoutingIntegrator {
    if (!globalIntegrator) {
      throw new Error("ModelRoutingIntegrator not initialized. Call initialize() first.");
    }
    return globalIntegrator;
  },

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return globalIntegrator !== null;
  },
};
