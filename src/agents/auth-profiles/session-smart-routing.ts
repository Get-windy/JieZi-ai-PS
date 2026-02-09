/**
 * 智能路由集成 - Session 级别的模型账号智能选择
 *
 * 本模块扩展 session-override.ts 的功能，在支持智能路由配置时，
 * 使用智能路由引擎选择最优模型账号，而非简单的轮询策略。
 */

import type { OpenClawConfig } from "../../config/config.js";
import { updateSessionStore, type SessionEntry } from "../../config/sessions.js";
import { resolveAgentModelAccounts } from "../agent-scope.js";
import { ensureAuthProfileStore } from "../auth-profiles.js";
import {
  routeToOptimalModelAccount,
  type SessionContext,
  type ModelInfo,
} from "../model-routing.js";
import { clearSessionAuthProfileOverride } from "./session-override.js";

/**
 * 使用智能路由引擎解析会话的模型账号
 *
 * 此函数检查智能助手是否配置了智能路由，如果配置了则调用路由引擎选择最优账号。
 * 如果未配置或路由失败，则回退到原有的 resolveSessionAuthProfileOverride 逻辑。
 *
 * @param params - 路由参数
 * @returns 选中的 authProfileId（accountId），如果路由失败则返回 undefined
 */
export async function resolveSessionAuthProfileWithSmartRouting(params: {
  cfg: OpenClawConfig;
  agentId: string;
  agentDir: string;
  provider: string;
  message: string;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  isNewSession: boolean;
}): Promise<string | undefined> {
  const {
    cfg,
    agentId,
    agentDir,
    provider,
    message,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    isNewSession,
  } = params;

  // 1. 检查是否配置了智能路由
  const modelAccountsConfig = resolveAgentModelAccounts(cfg, agentId);
  if (!modelAccountsConfig || modelAccountsConfig.routingMode !== "smart") {
    // 未配置智能路由，返回 undefined 让调用方回退到默认逻辑
    return undefined;
  }

  // 2. 如果不是新会话且已有用户手动指定的账号，则保持不变
  if (
    !isNewSession &&
    sessionEntry?.authProfileOverride &&
    sessionEntry?.authProfileOverrideSource === "user"
  ) {
    return sessionEntry.authProfileOverride;
  }

  // 3. 如果启用了会话固定且已有智能路由选择的账号，则检查是否需要重新路由
  if (
    modelAccountsConfig.enableSessionPinning &&
    sessionEntry?.authProfileOverride &&
    sessionEntry?.authProfileOverrideSource === "smart-routing" &&
    !isNewSession
  ) {
    // 检查固定的账号是否仍在可用列表中
    const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
    const pinnedProfile = store.profiles[sessionEntry.authProfileOverride];
    if (pinnedProfile && modelAccountsConfig.accounts.includes(sessionEntry.authProfileOverride)) {
      // 账号仍然有效，继续使用
      return sessionEntry.authProfileOverride;
    }
  }

  // 4. 构建 SessionContext
  const sessionContext: SessionContext = {
    sessionId: sessionEntry?.sessionId ?? sessionKey ?? "unknown",
    historyTurns: sessionEntry?.totalTokens ? Math.floor(sessionEntry.totalTokens / 1000) : 0,
    hasCode: message.includes("```") || message.includes("code"),
    hasImages: false, // TODO: 检测消息中是否包含图片
    needsTools: false, // TODO: 基于消息内容判断是否需要工具
    needsReasoning: message.length > 200, // 简单启发式：长消息可能需要推理
    pinnedAccountId: sessionEntry?.authProfileOverride,
  };

  // 5. 构建 modelInfoGetter 函数
  const modelInfoGetter = async (accountId: string): Promise<ModelInfo | undefined> => {
    const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
    const profile = store.profiles[accountId];
    if (!profile) {
      return undefined;
    }

    // 这里需要从 profile 中获取模型信息
    // 由于 profile 只包含认证信息，不包含模型能力信息，
    // 我们需要从配置或模型目录中获取
    // 暂时返回默认值
    return {
      id: accountId,
      contextWindow: 100000, // 默认值
      supportsTools: true,
      supportsVision: false,
      reasoningLevel: 2,
      inputPrice: 0.01,
      outputPrice: 0.03,
      avgResponseTime: 3,
    };
  };

  try {
    // 6. 调用智能路由引擎
    const routingResult = await routeToOptimalModelAccount(
      message,
      sessionContext,
      modelAccountsConfig,
      modelInfoGetter,
    );

    const selectedAccountId = routingResult.accountId;

    // 7. 验证选中的账号是否存在
    const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
    if (!store.profiles[selectedAccountId]) {
      console.warn(`[SmartRouting] Selected account ${selectedAccountId} not found in auth store`);
      return undefined;
    }

    // 8. 持久化到 session（如果需要）
    if (
      sessionEntry &&
      sessionStore &&
      sessionKey &&
      (sessionEntry.authProfileOverride !== selectedAccountId ||
        sessionEntry.authProfileOverrideSource !== "smart-routing")
    ) {
      sessionEntry.authProfileOverride = selectedAccountId;
      sessionEntry.authProfileOverrideSource = "smart-routing";
      sessionEntry.updatedAt = Date.now();
      sessionStore[sessionKey] = sessionEntry;

      if (storePath) {
        await updateSessionStore(storePath, (store) => {
          store[sessionKey] = sessionEntry;
        });
      }

      console.log(`[SmartRouting] Selected account ${selectedAccountId} for session ${sessionKey}`);
      console.log(`[SmartRouting] Reason: ${routingResult.reason}`);
    }

    return selectedAccountId;
  } catch (err) {
    console.error("[SmartRouting] Failed to route:", err);
    // 路由失败，返回 undefined 让调用方回退到默认逻辑
    return undefined;
  }
}
