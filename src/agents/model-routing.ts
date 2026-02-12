/**
 * 智能助手模型账号智能路由引擎
 *
 * 功能概述：
 * - 根据问题复杂度、模型能力、成本、响应速度等因素智能选择最优模型账号
 * - 支持会话级别账号固定（避免频繁切换）
 * - 支持故障转移机制
 *
 * @module agents/model-routing
 */

import type { AgentModelAccountsConfig } from "../config/types.agents.js";

// ==================== 类型定义 ====================

/**
 * 会话上下文信息
 */
export type SessionContext = {
  /** 会话 ID */
  sessionId: string;
  /** 历史消息轮次 */
  historyTurns: number;
  /** 是否包含代码 */
  hasCode?: boolean;
  /** 是否包含图片 */
  hasImages?: boolean;
  /** 是否需要工具调用 */
  needsTools?: boolean;
  /** 是否需要推理 */
  needsReasoning?: boolean;
  /** 已固定的模型账号（会话级别固定） */
  pinnedAccountId?: string;
};

/**
 * 模型信息
 */
export type ModelInfo = {
  /** 模型 ID */
  id: string;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 是否支持工具调用 */
  supportsTools: boolean;
  /** 是否支持视觉输入 */
  supportsVision: boolean;
  /** 推理能力等级 (1-3: 1=基础, 2=中级, 3=高级) */
  reasoningLevel: number;
  /** Input token 价格（每 1K tokens，美元） */
  inputPrice: number;
  /** Output token 价格（每 1K tokens，美元） */
  outputPrice: number;
  /** 平均响应速度（秒） */
  avgResponseTime?: number;
};

/**
 * 账号评分结果
 */
export type AccountScore = {
  /** 账号 ID */
  accountId: string;
  /** 总分 */
  totalScore: number;
  /** 复杂度匹配分 */
  complexityScore: number;
  /** 能力匹配分 */
  capabilityScore: number;
  /** 成本分 */
  costScore: number;
  /** 响应速度分 */
  speedScore: number;
  /** 模型信息 */
  modelInfo?: ModelInfo;
  /** 是否可用 */
  available: boolean;
};

/**
 * 路由选择结果
 */
export type RoutingResult = {
  /** 选中的账号 ID */
  accountId: string;
  /** 选择原因 */
  reason: string;
  /** 评分详情 */
  scores: AccountScore[];
};

// ==================== 复杂度评估 ====================

/**
 * 评估问题复杂度
 *
 * 评估维度：
 * - 消息长度：<50字=1分，50-200字=3分，200-500字=5分，>500字=7分
 * - 历史轮次：1-3轮=1分，4-10轮=3分，>10轮=5分
 * - 工具调用：不需要=0分，需要1-2个=2分，需要多个=4分
 * - 推理深度：直接回答=0分，需要分析=2分，需要多步推理=4分
 * - 代码处理：无代码=0分，有代码=3分
 * - 图片处理：无图片=0分，有图片=2分
 *
 * @param message - 用户消息内容
 * @param context - 会话上下文
 * @returns 复杂度分数 (0-10)
 */
export function assessComplexity(message: string, context: SessionContext): number {
  let score = 0;

  // 1. 消息长度评估
  const messageLength = message.length;
  if (messageLength < 50) {
    score += 1;
  } else if (messageLength < 200) {
    score += 3;
  } else if (messageLength < 500) {
    score += 5;
  } else {
    score += 7;
  }

  // 2. 历史轮次评估
  const historyTurns = context.historyTurns || 0;
  if (historyTurns <= 3) {
    score += 1;
  } else if (historyTurns <= 10) {
    score += 3;
  } else {
    score += 5;
  }

  // 3. 工具调用需求
  if (context.needsTools) {
    score += 4;
  }

  // 4. 推理深度需求
  if (context.needsReasoning) {
    score += 4;
  }

  // 5. 代码处理需求
  if (context.hasCode) {
    score += 3;
  }

  // 6. 图片处理需求
  if (context.hasImages) {
    score += 2;
  }

  // 归一化到 0-10 范围
  const normalizedScore = Math.min(10, Math.round((score / 26) * 10));

  return normalizedScore;
}

// ==================== 能力匹配评估 ====================

/**
 * 评估模型能力是否满足问题需求
 *
 * 评估维度：
 * - 上下文窗口：足够处理对话历史 = 30分
 * - 工具调用：需要且支持 = 25分，需要但不支持 = 0分
 * - 视觉能力：需要且支持 = 20分，需要但不支持 = 0分
 * - 推理能力：根据复杂度和模型等级匹配 = 25分
 *
 * @param complexity - 问题复杂度 (0-10)
 * @param modelInfo - 模型信息
 * @param context - 会话上下文
 * @returns 能力匹配分数 (0-100)
 */
export function matchCapabilities(
  complexity: number,
  modelInfo: ModelInfo,
  context: SessionContext,
): number {
  let score = 0;

  // 1. 上下文窗口评估（30分）
  // 估算需要的上下文大小：历史轮次 * 500 tokens/轮 + 当前消息
  const estimatedTokens = context.historyTurns * 500 + 1000;
  if (modelInfo.contextWindow >= estimatedTokens * 2) {
    // 上下文窗口是需求的2倍以上，完全满足
    score += 30;
  } else if (modelInfo.contextWindow >= estimatedTokens) {
    // 刚好满足
    score += 20;
  } else {
    // 不满足
    score += 0;
  }

  // 2. 工具调用能力评估（25分）
  if (context.needsTools) {
    if (modelInfo.supportsTools) {
      score += 25;
    } else {
      // 需要工具但不支持，严重扣分
      return 0;
    }
  } else {
    // 不需要工具调用，默认给分
    score += 25;
  }

  // 3. 视觉能力评估（20分）
  if (context.hasImages) {
    if (modelInfo.supportsVision) {
      score += 20;
    } else {
      // 需要视觉但不支持，严重扣分
      return 0;
    }
  } else {
    // 不需要视觉能力，默认给分
    score += 20;
  }

  // 4. 推理能力评估（25分）
  // 根据复杂度和模型推理等级的匹配度打分
  const requiredReasoningLevel = Math.ceil(complexity / 3.5); // 0-10 -> 1-3
  const reasoningGap = Math.abs(modelInfo.reasoningLevel - requiredReasoningLevel);
  if (reasoningGap === 0) {
    // 完全匹配
    score += 25;
  } else if (reasoningGap === 1) {
    // 差一级
    score += 15;
  } else {
    // 差距较大
    score += 5;
  }

  return Math.min(100, score);
}

// ==================== 成本评估 ====================

/**
 * 评估模型调用成本
 *
 * 估算方式：
 * - 估算 input tokens: 历史轮次 * 500 + 当前消息长度 * 1.5
 * - 估算 output tokens: 500 (默认)
 * - 计算总成本
 * - 归一化到 0-100 分（成本越低分数越高）
 *
 * @param message - 用户消息内容
 * @param context - 会话上下文
 * @param modelInfo - 模型信息
 * @returns 成本分数 (0-100)
 */
export function assessCost(message: string, context: SessionContext, modelInfo: ModelInfo): number {
  // 估算 input tokens
  const estimatedInputTokens = context.historyTurns * 500 + message.length * 1.5;

  // 估算 output tokens（默认 500）
  const estimatedOutputTokens = 500;

  // 计算总成本（美元）
  const totalCost =
    (estimatedInputTokens / 1000) * modelInfo.inputPrice +
    (estimatedOutputTokens / 1000) * modelInfo.outputPrice;

  // 归一化到 0-100 分
  // 假设：成本 < $0.01 = 100分，成本 > $0.10 = 0分
  const maxCost = 0.1;
  const minCost = 0.01;

  if (totalCost <= minCost) {
    return 100;
  } else if (totalCost >= maxCost) {
    return 0;
  } else {
    // 线性映射
    const score = 100 - ((totalCost - minCost) / (maxCost - minCost)) * 100;
    return Math.round(score);
  }
}

// ==================== 响应速度评估 ====================

/**
 * 评估响应速度分数
 *
 * @param modelInfo - 模型信息
 * @returns 响应速度分数 (0-100)
 */
export function assessSpeed(modelInfo: ModelInfo): number {
  if (!modelInfo.avgResponseTime) {
    // 没有历史数据，默认给 50 分
    return 50;
  }

  // 假设：响应时间 < 2秒 = 100分，响应时间 > 10秒 = 0分
  const maxTime = 10;
  const minTime = 2;

  if (modelInfo.avgResponseTime <= minTime) {
    return 100;
  } else if (modelInfo.avgResponseTime >= maxTime) {
    return 0;
  } else {
    // 线性映射
    const score = 100 - ((modelInfo.avgResponseTime - minTime) / (maxTime - minTime)) * 100;
    return Math.round(score);
  }
}

// ==================== 综合打分与选择 ====================

/**
 * 为所有模型账号打分并选择最优账号
 *
 * @param message - 用户消息内容
 * @param context - 会话上下文
 * @param config - 智能路由配置
 * @param modelInfoGetter - 获取模型信息的函数
 * @returns 账号评分列表（已按总分排序）
 */
export async function scoreAllAccounts(
  message: string,
  context: SessionContext,
  config: AgentModelAccountsConfig,
  modelInfoGetter: (accountId: string) => Promise<ModelInfo | undefined>,
): Promise<AccountScore[]> {
  // 1. 评估问题复杂度
  const complexity = assessComplexity(message, context);

  // 2. 获取权重配置（使用默认值）
  const complexityWeight = config.smartRouting?.complexityWeight ?? 40;
  const capabilityWeight = config.smartRouting?.capabilityWeight ?? 30;
  const costWeight = config.smartRouting?.costWeight ?? 20;
  const speedWeight = config.smartRouting?.speedWeight ?? 10;

  // 3. 为每个账号打分
  const scores: AccountScore[] = await Promise.all(
    config.accounts.map(async (accountId) => {
      // 获取模型信息
      const modelInfo = await modelInfoGetter(accountId);

      if (!modelInfo) {
        return {
          accountId,
          totalScore: 0,
          complexityScore: 0,
          capabilityScore: 0,
          costScore: 0,
          speedScore: 0,
          available: false,
        };
      }

      // 能力匹配分数
      const capabilityScore = matchCapabilities(complexity, modelInfo, context);

      // 如果能力匹配分数为 0（不支持必需功能），直接标记为不可用
      if (capabilityScore === 0) {
        return {
          accountId,
          totalScore: 0,
          complexityScore: 0,
          capabilityScore: 0,
          costScore: 0,
          speedScore: 0,
          modelInfo,
          available: false,
        };
      }

      // 成本分数
      const costScore = config.smartRouting?.enableCostOptimization
        ? assessCost(message, context, modelInfo)
        : 50; // 不启用成本优化时给默认分

      // 响应速度分数
      const speedScore = assessSpeed(modelInfo);

      // 复杂度匹配分数（复杂度越低越好）
      const complexityScore = 100 - complexity * 10;

      // 综合打分
      const totalScore =
        capabilityScore * (capabilityWeight / 100) +
        costScore * (costWeight / 100) +
        speedScore * (speedWeight / 100) +
        complexityScore * (complexityWeight / 100);

      return {
        accountId,
        totalScore: Math.round(totalScore),
        complexityScore,
        capabilityScore,
        costScore,
        speedScore,
        modelInfo,
        available: true,
      };
    }),
  );

  // 4. 按总分排序（从高到低）
  scores.sort((a, b) => b.totalScore - a.totalScore);

  return scores;
}

/**
 * 选择最优模型账号
 *
 * @param scores - 账号评分列表
 * @param context - 会话上下文
 * @param enableSessionPinning - 是否启用会话级别固定
 * @returns 选中的账号 ID，如果都不可用则返回 undefined
 */
export function selectOptimalAccount(
  scores: AccountScore[],
  context: SessionContext,
  enableSessionPinning: boolean = true,
): string | undefined {
  // 1. 如果启用会话固定且已有固定账号，优先复用
  if (enableSessionPinning && context.pinnedAccountId) {
    const pinnedScore = scores.find((s) => s.accountId === context.pinnedAccountId);
    if (pinnedScore && pinnedScore.available && pinnedScore.totalScore > 0) {
      return context.pinnedAccountId;
    }
  }

  // 2. 选择分数最高的可用账号
  for (const score of scores) {
    if (score.available && score.totalScore > 0) {
      return score.accountId;
    }
  }

  // 3. 都不可用
  return undefined;
}

// ==================== 主路由函数 ====================

/**
 * 智能路由到最优模型账号
 *
 * @param message - 用户消息内容
 * @param context - 会话上下文
 * @param config - 智能助手模型账号配置
 * @param modelInfoGetter - 获取模型信息的函数
 * @returns 路由选择结果
 */
export async function routeToOptimalModelAccount(
  message: string,
  context: SessionContext,
  config: AgentModelAccountsConfig,
  modelInfoGetter: (accountId: string) => Promise<ModelInfo | undefined>,
): Promise<RoutingResult> {
  // 0. 先过滤仅保留已绑定且已启用的模型账号（核心检查）
  const boundAndEnabledAccounts = config.accounts.filter((accountId) => {
    // 查找账号配置
    const accountConfig = config.accountConfigs?.find((cfg: any) => cfg.accountId === accountId);

    if (!accountConfig) {
      // 未找到配置，说明未绑定
      return false;
    }

    // 检查是否启用（enabled 字段，默认为 true）
    const enabled = accountConfig.enabled !== false;
    if (!enabled) {
      return false;
    }

    return true;
  });

  // 如果没有任何可用账号，抛出错误
  if (boundAndEnabledAccounts.length === 0) {
    throw new Error(
      "No bound and enabled model accounts available for this agent. Please bind and enable at least one model account.",
    );
  }

  // 创建过滤后的配置
  const filteredConfig = {
    ...config,
    accounts: boundAndEnabledAccounts,
  };

  // 1. 如果是手动模式，直接返回指定账号
  if (filteredConfig.routingMode === "manual") {
    const accountId = filteredConfig.defaultAccountId || filteredConfig.accounts[0] || "default";
    return {
      accountId,
      reason: "手动模式：使用配置指定的默认账号",
      scores: [],
    };
  }

  // 2. 智能路由模式：为所有账号打分
  const scores = await scoreAllAccounts(message, context, filteredConfig, modelInfoGetter);

  // 3. 选择最优账号
  const selectedAccountId = selectOptimalAccount(
    scores,
    context,
    filteredConfig.enableSessionPinning,
  );

  if (!selectedAccountId) {
    // 如果都不可用，使用第一个作为兜底
    const fallbackAccountId = filteredConfig.accounts[0] || "default";
    return {
      accountId: fallbackAccountId,
      reason: "故障兜底：所有账号不可用，使用第一个账号作为兜底",
      scores,
    };
  }

  // 4. 生成选择原因
  const selectedScore = scores.find((s) => s.accountId === selectedAccountId);
  let reason = `智能路由：选择账号 ${selectedAccountId}`;
  if (selectedScore) {
    reason += ` (总分: ${selectedScore.totalScore}, 能力: ${selectedScore.capabilityScore}, 成本: ${selectedScore.costScore})`;
  }

  return {
    accountId: selectedAccountId,
    reason,
    scores,
  };
}

// ==================== 故障转移 ====================

/**
 * 处理模型账号调用失败，切换到下一个可用账号
 *
 * @param failedAccountId - 失败的账号 ID
 * @param scores - 账号评分列表
 * @param reason - 失败原因
 * @returns 下一个可用账号 ID，如果都不可用则返回 undefined
 */
export function handleFailover(
  failedAccountId: string,
  scores: AccountScore[],
  reason: string,
): string | undefined {
  // 找到失败账号的索引
  const failedIndex = scores.findIndex((s) => s.accountId === failedAccountId);

  if (failedIndex === -1) {
    // 失败账号不在列表中，从第一个可用账号开始
    for (const score of scores) {
      if (score.available && score.totalScore > 0) {
        return score.accountId;
      }
    }
    return undefined;
  }

  // 从失败账号的下一个开始查找可用账号
  for (let i = failedIndex + 1; i < scores.length; i++) {
    const score = scores[i];
    if (score.available && score.totalScore > 0) {
      return score.accountId;
    }
  }

  // 如果后面没有可用账号，从头开始查找（跳过已失败的）
  for (let i = 0; i < failedIndex; i++) {
    const score = scores[i];
    if (score.available && score.totalScore > 0) {
      return score.accountId;
    }
  }

  // 都不可用
  return undefined;
}
