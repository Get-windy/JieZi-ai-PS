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
 * 从 accountId 解析出 provider 和 model
 * accountId 格式示例：siliconflow/Pro/deepseek-ai/DeepSeek-V3.2
 */
function parseProviderModelFromAccountId(accountId: string): {
  provider: string;
  model: string;
} | undefined {
  // accountId 格式：providerId/tier/namespace/modelName
  // 或 providerId/modelName
  const parts = accountId.split("/");
  if (parts.length < 2) {
    return undefined;
  }
  
  const provider = parts[0];
  // 如果有多个部分，取最后一个作为 model，其余作为 provider 的一部分
  // 例如：siliconflow/Pro/deepseek-ai/DeepSeek-V3.2
  // provider = siliconflow
  // model = Pro/deepseek-ai/DeepSeek-V3.2
  const model = parts.slice(1).join("/");
  
  return { provider, model };
}

/**
 * 检测消息中是否包含图片
 * 支持多种格式：
 * - Markdown 图片：![alt](url)
 * - HTML 图片：<img src="url">
 * - 图片 URL ：.png, .jpg, .jpeg, .gif, .webp, .svg
 * - Base64 图片：data:image/
 */
function detectImages(message: string): boolean {
  // Markdown 图片格式
  if (/!\[.*?\]\(.*?\)/g.test(message)) {
    return true;
  }
  // HTML img 标签
  if (/<img\s+[^>]*src=["'].*?["'][^>]*>/gi.test(message)) {
    return true;
  }
  // 图片文件格式 URL
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$|#)/gi.test(message)) {
    return true;
  }
  // Base64 图片
  if (/data:image\//i.test(message)) {
    return true;
  }
  return false;
}

/**
 * 基于消息内容判断是否需要工具调用
 * 检测常见的需要工具调用的关键词：
 * - 搜索相关：search, find, lookup, query
 * - 计算相关：calculate, compute, math
 * - 文件操作：file, read, write, save
 * - API 调用：api, fetch, get data, retrieve
 * - 代码执行：execute, run code
 */
function detectToolsNeeded(message: string): boolean {
  const toolKeywords = [
    // 搜索
    "search",
    "find",
    "lookup",
    "query",
    "搜索",
    "查找",
    "查询",
    // 计算
    "calculate",
    "compute",
    "math",
    "计算",
    // 文件
    "file",
    "read",
    "write",
    "save",
    "文件",
    "读取",
    "写入",
    "保存",
    // API
    "api",
    "fetch",
    "get data",
    "retrieve",
    "获取数据",
    // 代码执行
    "execute",
    "run code",
    "run script",
    "执行",
    "运行代码",
  ];

  const lowerMessage = message.toLowerCase();
  return toolKeywords.some((keyword) => lowerMessage.includes(keyword.toLowerCase()));
}

/**
 * 智能路由结果
 */
export type SmartRoutingResult = {
  /** 选中的认证账号ID */
  authProfileId: string;
  /** 解析出的 provider */
  provider?: string;
  /** 解析出的 model */
  model?: string;
  /** 选择原因 */
  reason: string;
};

/**
 * 使用智能路由引擎解析会话的模型账号
 *
 * 此函数检查智能助手是否配置了智能路由，如果配置了则调用路由引擎选择最优账号。
 * 如果未配置或路由失败，则回退到原有的 resolveSessionAuthProfileOverride 逻辑。
 *
 * @param params - 路由参数
 * @returns 智能路由结果（包含 authProfileId、provider、model），如果路由失败则返回 undefined
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
}): Promise<SmartRoutingResult | undefined> {
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
    const parsed = parseProviderModelFromAccountId(sessionEntry.authProfileOverride);
    return {
      authProfileId: sessionEntry.authProfileOverride,
      provider: parsed?.provider,
      model: parsed?.model,
      reason: "User manually selected",
    };
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
    const parsed = parseProviderModelFromAccountId(sessionEntry.authProfileOverride);
    return {
      authProfileId: sessionEntry.authProfileOverride,
      provider: parsed?.provider,
      model: parsed?.model,
      reason: "Session pinned (still valid)",
    };
  }
}

  // 4. 构建 SessionContext
  const sessionContext: SessionContext = {
    sessionId: sessionEntry?.sessionId ?? sessionKey ?? "unknown",
    historyTurns: sessionEntry?.totalTokens ? Math.floor(sessionEntry.totalTokens / 1000) : 0,
    hasCode: message.includes("```") || message.includes("code"),
    hasImages: detectImages(message), // 检测消息中是否包含图片
    needsTools: detectToolsNeeded(message), // 基于消息内容判断是否需要工具
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

  // 9. 从 accountId 解析 provider 和 model
  const parsed = parseProviderModelFromAccountId(selectedAccountId);
  return {
    authProfileId: selectedAccountId,
    provider: parsed?.provider,
    model: parsed?.model,
    reason: routingResult.reason,
  };
  } catch (err) {
    console.error("[SmartRouting] Failed to route:", err);
    // 路由失败，返回 undefined 让调用方回退到默认逻辑
    return undefined;
  }
}
