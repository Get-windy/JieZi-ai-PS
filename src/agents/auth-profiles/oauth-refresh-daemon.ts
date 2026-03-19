/**
 * OAuth Token 自动刷新守护进程
 * 定期检查OAuth认证状态，在Token即将过期时自动刷新
 */

import { createSubsystemLogger } from "../../../upstream/src/logging/subsystem.js";
import { refreshQwenPortalCredentials } from "../../../upstream/src/providers/qwen-portal-oauth.js";
import {
  ensureAuthProfileStore,
  saveAuthProfileStore,
  type AuthProfileStore,
} from "../../../upstream/src/agents/auth-profiles.js";
import type { OAuthCredentials } from "../../../upstream/src/agents/auth-profiles/oauth.js";

const log = createSubsystemLogger("oauth-refresh");

// 配置常量
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 每6小时检查一次
const REFRESH_BEFORE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 提前7天刷新
const MIN_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 最小刷新间隔1小时（防止频繁刷新）

interface RefreshAttempt {
  profileId: string;
  lastAttemptTime: number;
  failureCount: number;
}

class OAuthRefreshDaemon {
  private intervalHandle: NodeJS.Timeout | null = null;
  private refreshAttempts: Map<string, RefreshAttempt> = new Map();
  private isRunning = false;

  /**
   * 启动守护进程
   */
  start(): void {
    if (this.isRunning) {
      log.debug("OAuth refresh daemon already running");
      return;
    }

    this.isRunning = true;
    log.info("Starting OAuth refresh daemon", {
      checkInterval: `${CHECK_INTERVAL_MS / 1000 / 60}min`,
      refreshBefore: `${REFRESH_BEFORE_EXPIRY_MS / 1000 / 60 / 60 / 24}days`,
    });

    // 立即执行一次检查
    this.checkAndRefresh().catch((err) => {
      log.error("OAuth refresh daemon initial check failed", { error: String(err) });
    });

    // 设置定时检查
    this.intervalHandle = setInterval(() => {
      this.checkAndRefresh().catch((err) => {
        log.error("OAuth refresh daemon check failed", { error: String(err) });
      });
    }, CHECK_INTERVAL_MS);
  }

  /**
   * 停止守护进程
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    log.info("OAuth refresh daemon stopped");
  }

  /**
   * 检查并刷新即将过期的OAuth Token
   */
  private async checkAndRefresh(): Promise<void> {
    const store = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
    const now = Date.now();

    const profiles = Object.entries(store.profiles).filter(
      ([_, cred]) => cred.type === "oauth" && this.shouldRefresh(cred, now),
    );
    if (profiles.length === 0) {
      log.debug("No OAuth profiles need refresh");
      return;
    }

    log.info(`Found ${profiles.length} OAuth profiles to refresh`);

    for (const [profileId, credential] of profiles) {
      if (credential.type !== "oauth") {
        continue;
      }

      // 检查是否最近尝试过刷新
      const attempt = this.refreshAttempts.get(profileId);
      if (attempt && now - attempt.lastAttemptTime < MIN_REFRESH_INTERVAL_MS) {
        log.debug(`Skipping ${profileId}: recent refresh attempt`, {
          lastAttempt: new Date(attempt.lastAttemptTime).toISOString(),
        });
        continue;
      }

      try {
        await this.refreshProfile(profileId, credential, store);

        // 刷新成功，清除失败记录
        this.refreshAttempts.delete(profileId);
      } catch (error) {
        this.handleRefreshFailure(profileId, error);
      }
    }
  }

  /**
   * 判断是否需要刷新Token
   */
  private shouldRefresh(credential: OAuthCredentials, now: number): boolean {
    const hasRefreshToken = typeof credential.refresh === "string" && credential.refresh.length > 0;
    if (!hasRefreshToken) {
      return false;
    }

    const expiresAt = credential.expires;
    if (!expiresAt || !Number.isFinite(expiresAt)) {
      return false;
    }

    const timeUntilExpiry = expiresAt - now;
    // 已过期 或 在提前刷新窗口内，均需刷新
    const shouldRefresh = timeUntilExpiry <= REFRESH_BEFORE_EXPIRY_MS;

    if (shouldRefresh) {
      const status =
        timeUntilExpiry <= 0
          ? `已过期 ${Math.abs(Math.floor(timeUntilExpiry / 1000 / 60))}分钟`
          : `还有 ${Math.floor(timeUntilExpiry / 1000 / 60 / 60 / 24)} 天过期`;
      log.debug(`Profile needs refresh`, {
        provider: credential.provider,
        status,
      });
    }

    return shouldRefresh;
  }

  /**
   * 刷新指定profile的Token
   */
  private async refreshProfile(
    profileId: string,
    credential: OAuthCredentials,
    store: AuthProfileStore,
  ): Promise<void> {
    log.info(`Refreshing OAuth token for ${profileId}`, {
      provider: credential.provider,
      expiresAt: new Date(credential.expires).toISOString(),
    });

    // 记录刷新尝试
    this.refreshAttempts.set(profileId, {
      profileId,
      lastAttemptTime: Date.now(),
      failureCount: (this.refreshAttempts.get(profileId)?.failureCount || 0) + 1,
    });

    // 守护进程只负责 qwen-portal 的提前预刷新。
    // 其他 OAuth provider（minimax-portal、openai-codex、google-gemini-cli 等）
    // 由调用时的 resolveApiKeyForProfile 通用机制（含文件锁）负责自动刷新，
    // 守护进程无需重复处理，避免并发写入冲突。
    if (credential.provider !== "qwen-portal") {
      log.debug(
        `Provider ${credential.provider}: call-time auto-refresh will handle expiry, skipping daemon pre-refresh`,
      );
      return;
    }

    const newCredentials = await refreshQwenPortalCredentials(credential);

    // 更新 store 并持久化
    store.profiles[profileId] = {
      ...credential,
      ...newCredentials,
      type: "oauth",
    };
    saveAuthProfileStore(store, undefined);

    log.info(`✅ Successfully refreshed OAuth token for ${profileId}`, {
      provider: credential.provider,
      newExpiresAt: new Date(newCredentials.expires).toISOString(),
    });
  }

  /**
   * 处理刷新失败
   * 记录失败次数，但不永久停止——下次检查周期仍会重试，
   * 确保守护进程不会因为一段时间的网络故障而永久失效。
   */
  private handleRefreshFailure(profileId: string, error: unknown): void {
    const attempt = this.refreshAttempts.get(profileId);
    const failureCount = (attempt?.failureCount ?? 0) + 1;

    log.error(`Failed to refresh OAuth token for ${profileId}`, {
      error: error instanceof Error ? error.message : String(error),
      failureCount,
    });

    if (failureCount >= 3) {
      // 连续失败多次后清除记录，让下次检查周期重新计数并重试
      log.warn(
        `OAuth refresh for ${profileId} failed ${failureCount} times, resetting for next cycle retry`,
      );
      this.refreshAttempts.delete(profileId);
    } else {
      this.refreshAttempts.set(profileId, {
        profileId,
        lastAttemptTime: attempt?.lastAttemptTime ?? Date.now(),
        failureCount,
      });
    }
  }

  /**
   * 获取守护进程状态
   */
  getStatus(): {
    isRunning: boolean;
    checkInterval: number;
    refreshBefore: number;
    attempts: Array<{ profileId: string; lastAttempt: number; failures: number }>;
  } {
    return {
      isRunning: this.isRunning,
      checkInterval: CHECK_INTERVAL_MS,
      refreshBefore: REFRESH_BEFORE_EXPIRY_MS,
      attempts: Array.from(this.refreshAttempts.values()).map((a) => ({
        profileId: a.profileId,
        lastAttempt: a.lastAttemptTime,
        failures: a.failureCount,
      })),
    };
  }
}

// 单例实例
export const oauthRefreshDaemon = new OAuthRefreshDaemon();
