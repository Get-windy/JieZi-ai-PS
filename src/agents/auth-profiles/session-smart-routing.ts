/**
 * 智能路由集成 - Session 级别的模型账号智能选择
 *
 * 本模块扩展 session-override.ts 的功能，在支持智能路由配置时，
 * 使用智能路由引擎选择最优模型账号，而非简单的轮询策略。
 */

import type { OpenClawConfig } from "../../config/config.js";
import { updateSessionStore, type SessionEntry } from "../../config/sessions.js";
import { t } from "../../i18n/index.js";
import { resolveAgentConfig, resolveAgentModelAccounts } from "../agent-scope.js";
import {
  lookupBenchmark,
  normalizeEloScore,
  getCodingBenchmarkScore,
  getReasoningBenchmarkScore,
  getOverallBenchmarkScore,
} from "../arena-benchmarks.js";
import { ensureAuthProfileStore } from "../auth-profiles.js";
import {
  routeToOptimalModelAccount,
  type SessionContext,
  type ModelInfo,
} from "../model-routing.js";
import {
  clearSessionAuthProfileOverride as _clearSessionAuthProfileOverride,
  resolveModelAccountToAuthProfile,
} from "./session-override.js";

/**
 * 从 accountId 解析出 provider 和 model
 * accountId 格式示例：siliconflow/Pro/deepseek-ai/DeepSeek-V3.2
 */
function parseProviderModelFromAccountId(accountId: string):
  | {
      provider: string;
      model: string;
    }
  | undefined {
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
    provider: _provider,
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
  // 业界最佳实践（LiteLLM Router / BentoML）：会话粘性默认开启，避免每次消息都重新路由
  // enableSessionPinning 未配置时视为 true（即默认启用会话粘性）
  const sessionPinningEnabled = modelAccountsConfig.enableSessionPinning !== false;
  if (
    sessionPinningEnabled &&
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
  // accountId 可能是 "provider/model" 格式，需先转换为 profileId 再查 auth store
  const modelInfoGetter = async (accountId: string): Promise<ModelInfo | undefined> => {
    const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
    // 先直接查，再尝试按 provider 匹配转换
    const profile =
      store.profiles[accountId] ??
      (() => {
        const resolved = resolveModelAccountToAuthProfile({ modelId: accountId, store });
        return resolved ? store.profiles[resolved] : undefined;
      })();
    if (!profile) {
      return undefined;
    }

    // 从 accountId 或 profile 中提取真实模型名称用于 Arena 匹配
    // accountId 格式示例："siliconflow/Pro/deepseek-ai/DeepSeek-V3.2"
    // profile.model 格式示例："deepseek-v3" 或 "gpt-4o"
    const modelNameForLookup =
      (profile as { model?: string }).model ?? accountId.split("/").pop() ?? accountId;

    // 尝试从 Arena 数据库查找基准数据
    const benchmarkEntry = lookupBenchmark(modelNameForLookup);

    // 默认 ModelInfo（用于无法获取真实配置的情况）
    const baseInfo: ModelInfo = {
      id: accountId,
      contextWindow: 100000,
      supportsTools: true,
      supportsVision: false,
      reasoningLevel: 2,
      inputPrice: 0.01,
      outputPrice: 0.03,
      avgResponseTime: 3,
    };

    if (benchmarkEntry) {
      const normalizedElo = normalizeEloScore(benchmarkEntry.eloScore);
      baseInfo.benchmarks = {
        eloScore: benchmarkEntry.eloScore,
        arenaRank: benchmarkEntry.arenaRank,
        mmlu: benchmarkEntry.mmlu,
        humanEval: benchmarkEntry.humanEval,
        math: benchmarkEntry.math,
        mtBench: benchmarkEntry.mtBench,
        gpqa: benchmarkEntry.gpqa,
        normalizedElo,
      };
      // 基于 Arena 数据修正能力等级
      if ((benchmarkEntry.math ?? 0) >= 90 || (benchmarkEntry.gpqa ?? 0) >= 70) {
        baseInfo.reasoningLevel = 3;
      } else if ((benchmarkEntry.math ?? 0) >= 60 || normalizedElo >= 70) {
        baseInfo.reasoningLevel = 2;
      } else {
        baseInfo.reasoningLevel = 1;
      }
      // 更新领域评分
      const codingScore = getCodingBenchmarkScore(modelNameForLookup);
      const reasoningScore = getReasoningBenchmarkScore(modelNameForLookup);
      const overallScore = getOverallBenchmarkScore(modelNameForLookup);
      if (codingScore !== undefined || reasoningScore !== undefined || overallScore !== undefined) {
        baseInfo.domainScores = {
          ...(codingScore !== undefined ? { coding: codingScore } : {}),
          ...(reasoningScore !== undefined
            ? { reasoning: reasoningScore, math: reasoningScore }
            : {}),
          ...(overallScore !== undefined ? { general: overallScore, analysis: overallScore } : {}),
        };
      }
    }

    return baseInfo;
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
    // accountId 可能是 "provider/model" 格式，需要先转换为 auth store 的 profileId 格式
    const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
    let resolvedProfileId: string | undefined;
    if (store.profiles[selectedAccountId]) {
      // 已经是有效的 profileId（如 "ali-bailian:----pro--"）
      resolvedProfileId = selectedAccountId;
    } else {
      // 尝试将 "provider/model" 格式转换为 profileId
      resolvedProfileId = resolveModelAccountToAuthProfile({
        modelId: selectedAccountId,
        store,
      });
    }
    if (!resolvedProfileId) {
      console.warn(t("routing.smart.account_not_found", { accountId: selectedAccountId }));
      return undefined;
    }

    // 8. 持久化到 session（如果需要）
    const isAccountChanged =
      sessionEntry?.authProfileOverride !== resolvedProfileId ||
      sessionEntry?.authProfileOverrideSource !== "smart-routing";
    if (sessionEntry && sessionStore && sessionKey && isAccountChanged) {
      sessionEntry.authProfileOverride = resolvedProfileId;
      sessionEntry.authProfileOverrideSource = "smart-routing";
      sessionEntry.updatedAt = Date.now();
      sessionStore[sessionKey] = sessionEntry;

      if (storePath) {
        await updateSessionStore(storePath, (store) => {
          store[sessionKey] = sessionEntry;
        });
      }

      const agentName = resolveAgentConfig(cfg, agentId)?.name ?? agentId;
      console.log(
        t("routing.smart.fallback", {
          accountId: resolvedProfileId,
          agentName,
          sessionKey: sessionKey ?? "",
          reason: routingResult.reason,
        }),
      );
    }

    // 9. 从 accountId（provider/model 格式）解析 provider 和 model
    const parsed = parseProviderModelFromAccountId(selectedAccountId);
    return {
      authProfileId: resolvedProfileId,
      provider: parsed?.provider,
      model: parsed?.model,
      reason: routingResult.reason,
    };
  } catch (err) {
    console.error(t("routing.smart.route_failed"), err);
    // 路由失败，返回 undefined 让调用方回退到默认逻辑
    return undefined;
  }
}
