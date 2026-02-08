/**
 * LoadBalance 策略处理器
 *
 * 功能：多个账号轮流处理消息，支持多种负载均衡算法
 */

import type { LoadBalancePolicyConfig } from "../../config/types.channel-bindings.js";
import type { PolicyHandler, PolicyProcessContext, PolicyResult } from "./types.js";

/**
 * 账号状态跟踪
 */
type AccountState = {
  accountId: string;
  loadCount: number; // 当前负载数量
  lastUsed: number; // 最后使用时间戳
  healthy: boolean; // 健康状态
};

export class LoadBalancePolicyHandler implements PolicyHandler {
  readonly type = "load-balance";

  // 账号状态缓存（按绑定ID分组）
  private accountStates = new Map<string, Map<string, AccountState>>();

  // Round-robin 索引（按绑定ID分组）
  private roundRobinIndexes = new Map<string, number>();

  async process(context: PolicyProcessContext): Promise<PolicyResult> {
    const { message, binding, accountId } = context;

    if (binding.policy.type !== "load-balance") {
      throw new Error(`Invalid policy type: ${binding.policy.type}, expected load-balance`);
    }

    const config = binding.policy.config as LoadBalancePolicyConfig;

    // 初始化账号状态
    this.ensureAccountStates(binding.id, config.accountIds);

    // 选择目标账号
    const targetAccountId = this.selectAccount(binding.id, config);

    if (!targetAccountId) {
      return {
        allow: false,
        reason: "No healthy account available for load balancing",
      };
    }

    // 如果消息已经在目标账号上，直接允许
    if (accountId === targetAccountId) {
      return { allow: true };
    }

    // 路由到目标账号
    return {
      allow: false,
      reason: `Load balancing - routing to account ${targetAccountId}`,
      routeTo: [
        {
          channelId: context.channelId,
          accountId: targetAccountId,
          to: message.to,
        },
      ],
    };
  }

  /**
   * 确保账号状态已初始化
   */
  private ensureAccountStates(bindingId: string, accountIds: string[]): void {
    if (!this.accountStates.has(bindingId)) {
      const states = new Map<string, AccountState>();
      for (const accountId of accountIds) {
        states.set(accountId, {
          accountId,
          loadCount: 0,
          lastUsed: 0,
          healthy: true,
        });
      }
      this.accountStates.set(bindingId, states);
    }
  }

  /**
   * 选择目标账号
   */
  private selectAccount(bindingId: string, config: LoadBalancePolicyConfig): string | null {
    const states = this.accountStates.get(bindingId);
    if (!states) return null;

    const healthyAccounts = Array.from(states.values()).filter((s) => s.healthy);
    if (healthyAccounts.length === 0) return null;

    let selectedAccount: AccountState | null = null;

    switch (config.algorithm) {
      case "round-robin":
        selectedAccount = this.selectRoundRobin(bindingId, healthyAccounts);
        break;

      case "random":
        selectedAccount = this.selectRandom(healthyAccounts);
        break;

      case "least-load":
        selectedAccount = this.selectLeastLoad(healthyAccounts);
        break;

      default:
        selectedAccount = this.selectRoundRobin(bindingId, healthyAccounts);
    }

    if (selectedAccount) {
      selectedAccount.loadCount++;
      selectedAccount.lastUsed = Date.now();
      return selectedAccount.accountId;
    }

    return null;
  }

  /**
   * Round-robin 算法
   */
  private selectRoundRobin(bindingId: string, accounts: AccountState[]): AccountState {
    let index = this.roundRobinIndexes.get(bindingId) || 0;
    const selected = accounts[index % accounts.length];
    this.roundRobinIndexes.set(bindingId, (index + 1) % accounts.length);
    return selected;
  }

  /**
   * Random 算法
   */
  private selectRandom(accounts: AccountState[]): AccountState {
    const index = Math.floor(Math.random() * accounts.length);
    return accounts[index];
  }

  /**
   * Least-load 算法
   */
  private selectLeastLoad(accounts: AccountState[]): AccountState {
    return accounts.reduce((min, current) => (current.loadCount < min.loadCount ? current : min));
  }

  /**
   * 更新账号健康状态（可由外部调用）
   */
  updateAccountHealth(bindingId: string, accountId: string, healthy: boolean): void {
    const states = this.accountStates.get(bindingId);
    if (states) {
      const state = states.get(accountId);
      if (state) {
        state.healthy = healthy;
      }
    }
  }

  /**
   * 重置账号负载计数（可定期调用）
   */
  resetLoadCounts(bindingId: string): void {
    const states = this.accountStates.get(bindingId);
    if (states) {
      for (const state of states.values()) {
        state.loadCount = 0;
      }
    }
  }

  async validate(config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!config) {
      errors.push("Config is required");
      return { valid: false, errors };
    }

    if (!Array.isArray(config.accountIds)) {
      errors.push("accountIds must be an array");
    } else if (config.accountIds.length < 2) {
      errors.push("accountIds must contain at least 2 accounts");
    } else if (!config.accountIds.every((id: any) => typeof id === "string")) {
      errors.push("All accountIds must be strings");
    }

    const validAlgorithms = ["round-robin", "random", "least-load"];
    if (!validAlgorithms.includes(config.algorithm)) {
      errors.push(`algorithm must be one of: ${validAlgorithms.join(", ")}`);
    }

    if (config.healthCheck !== undefined) {
      if (typeof config.healthCheck !== "object") {
        errors.push("healthCheck must be an object");
      } else {
        if (typeof config.healthCheck.enabled !== "boolean") {
          errors.push("healthCheck.enabled must be a boolean");
        }
        if (config.healthCheck.enabled) {
          if (typeof config.healthCheck.interval !== "number" || config.healthCheck.interval <= 0) {
            errors.push("healthCheck.interval must be a positive number");
          }
          if (typeof config.healthCheck.timeout !== "number" || config.healthCheck.timeout <= 0) {
            errors.push("healthCheck.timeout must be a positive number");
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
