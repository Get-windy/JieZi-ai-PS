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
import { isProviderUsableSync } from "../gateway/server-methods/models.js";
import { normalizeEloScore } from "./arena-benchmarks.js";

// ==================== 类型定义 ====================

/**
 * 模型专业领域（Specialization）
 * 基于 lmarena.ai 真实分类体系扩展
 */
export type ModelSpecialization =
  | "general" // 通用模型
  | "coding" // 编程专用（如 DeepSeek-Coder、Qwen-Coder）
  | "math" // 数学推理（高 MATH 基准分）
  | "vision" // 视觉专用（如 GPT-4V）
  | "multimodal" // 多模态（如 Gemini、GPT-4o）
  | "reasoning" // 深度推理（如 o1、o3、DeepSeek-R1）
  | "creative" // 创意写作（如 Claude）
  | "instruction" // 指令跟随（高 MT-Bench）
  | "multilingual" // 多语言（中日韩等非英文能力强）
  | "long-context" // 长上下文（200K+）
  | "function-calling" // 函数调用/工具使用
  | "translation" // 翻译专用
  | "embedding" // 向量嵌入
  | "speech"; // 语音处理

/**
 * 数据模态类型（Modality）
 */
export type DataModality = "text" | "image" | "audio" | "video" | "code";

/**
 * 任务领域分类（对齐 lmarena.ai 评测分类）
 */
export type TaskDomain =
  | "general" // 通用问答
  | "coding" // 编程任务（lmarena: Coding Elo）
  | "math" // 数学计算（lmarena: Math Elo）
  | "creative" // 创意写作（lmarena: Creative Writing Elo）
  | "instruction" // 指令跟随（lmarena: Instruction Following Elo）
  | "analysis" // 数据分析（多轮推理）
  | "translation" // 翻译任务
  | "vision" // 视觉理解（lmarena: Vision Arena Elo）
  | "reasoning" // 深度推理（lmarena: Hard Prompts Elo）
  | "multilingual"; // 多语言（lmarena: Chinese/Japanese/Korean Elo）

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
  /** 任务领域（自动检测或手动指定） */
  taskDomain?: TaskDomain;
  /** 需要的数据模态 */
  requiredModalities?: DataModality[];
};

/**
 * 外部评测基准分数（对齐 lmarena.ai 分类体系）
 */
export type ModelBenchmarkScores = {
  /** LMSYS Chatbot Arena Elo 分（原始値，约 800-1500） */
  eloScore?: number;
  /** Arena 排名（越小越好） */
  arenaRank?: number;
  /** MMLU 分数（0-100%） */
  mmlu?: number;
  /** HumanEval 代码生成分数（0-100%） */
  humanEval?: number;
  /** MATH 数学推理分数（0-100%） */
  math?: number;
  /** MT-Bench 多轮对话分（1-10） */
  mtBench?: number;
  /** GPQA 博士级科学推理分数（0-100%） */
  gpqa?: number;
  /** 归一化 Elo（0-100，用于路由计算） */
  normalizedElo?: number;
  /** 编程专项 Elo（对齐 lmarena Coding 分类，原始分） */
  codingElo?: number;
  /** 数学/推理专项 Elo（对齐 lmarena Math / Hard Prompts，原始分） */
  reasoningElo?: number;
  /** 视觉专项 Elo（对齐 lmarena Vision Arena，原始分） */
  visionElo?: number;
  /** 创意写作专项 Elo（对齐 lmarena Creative Writing，原始分） */
  creativeElo?: number;
  /** 指令跟随专项 Elo（对齐 lmarena Instruction Following，原始分） */
  instructionElo?: number;
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
  /** Input token 价格（每 1K tokens，美元）—— 保留字段，路由不再使用 */
  inputPrice?: number;
  /** Output token 价格（每 1K tokens，美元）—— 保留字段，路由不再使用 */
  outputPrice?: number;
  /** 平均响应速度（秒）—— 保留字段，路由不再使用 */
  avgResponseTime?: number;
  /** 模型专业领域（可多选） */
  specializations?: ModelSpecialization[];
  /** 支持的数据模态 */
  supportedModalities?: DataModality[];
  /** 领域能力评分 (0-100，按领域分类) */
  domainScores?: Partial<Record<TaskDomain, number>>;
  /** 外部评测基准数据（LMSYS Arena Elo 等） */
  benchmarks?: ModelBenchmarkScores;
};

/**
 * 账号评分结果（细粒度能力维度，去除成本/速度）
 */
export type AccountScore = {
  /** 账号 ID */
  accountId: string;
  /** 总分 */
  totalScore: number;
  /** 复杂度匹配分 */
  complexityScore: number;
  /** 基础能力匹配分（上下文、工具、视觉、推理等级） */
  capabilityScore: number;
  /** 专业领域匹配分 */
  specializationScore: number;
  /** 模态匹配分 */
  modalityScore: number;
  /** 综合 Arena Elo 归一化分（0-100） */
  eloScore: number;
  /** 编程专项 Elo 分（0-100，基于 lmarena Coding Elo） */
  codingEloScore: number;
  /** 数学/推理专项 Elo 分（0-100，基于 lmarena Math + GPQA） */
  reasoningEloScore: number;
  /** 视觉专项 Elo 分（0-100，基于 lmarena Vision Arena） */
  visionEloScore: number;
  /** 创意写作专项 Elo 分（0-100，基于 lmarena Creative Writing） */
  creativeEloScore: number;
  /** 指令跟随专项 Elo 分（0-100，基于 lmarena Instruction Following） */
  instructionEloScore: number;
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

// ==================== 任务领域检测 ====================

/**
 * 自动检测任务领域
 *
 * 基于消息内容和上下文特征判断任务类型
 *
 * @param message - 用户消息内容
 * @param context - 会话上下文
 * @returns 任务领域
 */
export function detectTaskDomain(message: string, context: SessionContext): TaskDomain {
  // 如果上下文已经指定了任务领域，直接使用
  if (context.taskDomain) {
    return context.taskDomain;
  }

  const lowerMessage = message.toLowerCase();

  // 编程任务检测（收紧条件，避免普通业务任务被误判为 coding）
  if (
    context.hasCode ||
    lowerMessage.includes("代码") ||
    lowerMessage.includes("编程") ||
    lowerMessage.includes("编写代码") ||
    lowerMessage.includes("写代码") ||
    lowerMessage.includes("debug") ||
    lowerMessage.includes("debugging") ||
    lowerMessage.includes("implement") ||
    // 仅在代码相关语境下才判定：code 单词出现 + 其他代码信号
    (lowerMessage.includes("code") &&
      (lowerMessage.includes("write") ||
        lowerMessage.includes("fix") ||
        lowerMessage.includes("review") ||
        lowerMessage.includes("error"))) ||
    /\b(python|javascript|typescript|c\+\+|rust|golang)\b/i.test(message) ||
    // 代码块关键词（不误判含 function/class 的普通中文业务消息）
    /```[a-z]/.test(message)
  ) {
    return "coding";
  }

  // 视觉任务检测
  if (
    context.hasImages ||
    lowerMessage.includes("图片") ||
    lowerMessage.includes("图像") ||
    lowerMessage.includes("image") ||
    lowerMessage.includes("看图") ||
    lowerMessage.includes("识别") ||
    lowerMessage.includes("这是什么")
  ) {
    return "vision";
  }

  // 数学任务检测
  if (
    lowerMessage.includes("计算") ||
    lowerMessage.includes("数学") ||
    lowerMessage.includes("方程") ||
    lowerMessage.includes("solve") ||
    lowerMessage.includes("math") ||
    /[\d+\-*/()=]+/.test(message) || // 包含数学表达式
    lowerMessage.includes("微积分") ||
    lowerMessage.includes("矩阵")
  ) {
    return "math";
  }

  // 翻译任务检测
  if (
    lowerMessage.includes("翻译") ||
    lowerMessage.includes("translate") ||
    lowerMessage.includes("英译中") ||
    lowerMessage.includes("中译英")
  ) {
    return "translation";
  }

  // 创意写作检测
  if (
    lowerMessage.includes("写一篇") ||
    lowerMessage.includes("创作") ||
    lowerMessage.includes("诗") ||
    lowerMessage.includes("故事") ||
    lowerMessage.includes("文章") ||
    lowerMessage.includes("小说")
  ) {
    return "creative";
  }

  // 深度推理检测
  if (
    context.needsReasoning ||
    lowerMessage.includes("推理") ||
    lowerMessage.includes("分析") ||
    lowerMessage.includes("为什么") ||
    lowerMessage.includes("如何解决") ||
    lowerMessage.length > 300 // 长问题通常需要深度推理
  ) {
    return "reasoning";
  }

  // 数据分析检测
  if (
    lowerMessage.includes("数据") ||
    lowerMessage.includes("统计") ||
    lowerMessage.includes("分析")
  ) {
    return "analysis";
  }

  // 默认为通用任务
  return "general";
}

// ==================== 模态匹配评估 ====================

/**
 * 评估模型对所需模态的支持程度
 *
 * @param context - 会话上下文
 * @param modelInfo - 模型信息
 * @returns 模态匹配分数 (0-100)
 */
export function assessModalityMatch(context: SessionContext, modelInfo: ModelInfo): number {
  // 确定需要的模态
  const requiredModalities: DataModality[] = context.requiredModalities || [];

  // 自动检测模态需求
  if (context.hasImages && !requiredModalities.includes("image")) {
    requiredModalities.push("image");
  }
  if (context.hasCode && !requiredModalities.includes("code")) {
    requiredModalities.push("code");
  }
  if (!context.hasImages && !context.hasCode && !requiredModalities.includes("text")) {
    requiredModalities.push("text");
  }

  // 如果没有指定支持的模态，假设支持 text 和 code（绝大多数 LLM 都支持）
  const supportedModalities = modelInfo.supportedModalities || ["text", "code"];

  // 计算匹配度
  if (requiredModalities.length === 0) {
    // 没有特殊模态要求，给默认分
    return 80;
  }

  let matchedCount = 0;
  for (const required of requiredModalities) {
    if (supportedModalities.includes(required)) {
      matchedCount++;
    }
  }

  // 计算匹配率
  const matchRate = matchedCount / requiredModalities.length;

  // 如果有必需模态不支持，严重扣分
  if (matchRate < 1.0) {
    // 图像模态是硬性要求
    if (requiredModalities.includes("image") && !supportedModalities.includes("image")) {
      return 0;
    }
    // 音频/视频模态也是硬性要求
    if (requiredModalities.includes("audio") && !supportedModalities.includes("audio")) {
      return 0;
    }
    if (requiredModalities.includes("video") && !supportedModalities.includes("video")) {
      return 0;
    }
  }

  return Math.round(matchRate * 100);
}

// ==================== 专业领域匹配评估 ====================

/**
 * 评估模型专业领域与任务的匹配度
 *
 * 对齐 lmarena.ai 分类：Coding / Math / Creative Writing /
 * Instruction Following / Vision / Reasoning(Hard Prompts) / Multilingual
 *
 * @param taskDomain - 任务领域
 * @param modelInfo - 模型信息
 * @returns 专业领域匹配分数 (0-100)
 */
export function assessSpecializationMatch(taskDomain: TaskDomain, modelInfo: ModelInfo): number {
  // 如果模型提供了领域评分，直接使用
  if (modelInfo.domainScores && modelInfo.domainScores[taskDomain] !== undefined) {
    return modelInfo.domainScores[taskDomain];
  }

  // 如果没有专业领域标记，假设是通用模型
  const specializations = modelInfo.specializations || ["general"];

  // 任务领域到专业领域的映射（优先级从高到低）
  const domainToSpecialization: Record<TaskDomain, ModelSpecialization[]> = {
    general: ["general", "multimodal", "instruction", "coding", "reasoning", "creative"],
    coding: ["coding", "function-calling", "reasoning", "general"],
    math: ["math", "reasoning", "general"],
    creative: ["creative", "multilingual", "general"],
    instruction: ["instruction", "general", "multilingual"],
    analysis: ["reasoning", "coding", "general"],
    translation: ["translation", "multilingual", "general"],
    vision: ["vision", "multimodal"],
    reasoning: ["reasoning", "math", "general", "coding"],
    multilingual: ["multilingual", "translation", "general"],
  };

  // 获取任务对应的专业领域
  const preferredSpecs = domainToSpecialization[taskDomain] || ["general"];

  // 计算匹配度（第一优先级100分，依次递减20分）
  for (let i = 0; i < preferredSpecs.length; i++) {
    const spec = preferredSpecs[i];
    if (specializations.includes(spec)) {
      if (i === 0) return 100;
      if (i === 1) return 80;
      if (i === 2) return 65;
      return 50;
    }
  }

  // 通用模型给及格分
  if (specializations.includes("general")) {
    return 55;
  }

  // 专业领域完全不匹配
  return 25;
}

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
// ==================== 成本评估（已废弃，保留备用）====================

/**
 * @deprecated 路由引擎已不使用成本评分，此函数保留备外部使用
 */
export function assessCost(message: string, context: SessionContext, modelInfo: ModelInfo): number {
  void message;
  void context;
  void modelInfo;
  return 50;
}

/**
 * @deprecated 路由引擎已不使用速度评分，此函数保留备外部使用
 */
export function assessSpeed(modelInfo: ModelInfo): number {
  void modelInfo;
  return 50;
}

// ==================== 综合打分与选择 ====================

/**
 * 为所有模型账号打分并选择最优账号
 *
 * 综合评分维度（参考 lmarena.ai 分类）：
 * - 基础能力（上下文、工具、视觉、推理等级）
 * - 专业领域匹配（Coding/Math/Vision/Creative/Instruction/Multilingual）
 * - 模态匹配（文本/图片/代码等）
 * - 综合 Arena Elo（整体实力）
 * - 编程专项 Elo（lmarena Coding 分类）
 * - 数学/推理专项 Elo（lmarena Math/Hard Prompts 分类）
 * - 视觉专项 Elo（lmarena Vision Arena）
 * - 创意写作专项 Elo（lmarena Creative Writing）
 * - 指令跟随专项 Elo（lmarena Instruction Following）
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

  // 2. 检测任务领域
  const taskDomain = detectTaskDomain(message, context);

  // 3. 获取权重配置（应用用户自定义权重，否则使用默认值）
  // 默认权重分配设计（总和 = 100）：
  //   基础能力: 20   — 硬性能力检查（视觉、工具、上下文）
  //   专业领域: 12   — 匹配任务类型
  //   模态匹配: 8    — 图片/音频/代码等
  //   综合 Elo:   15   — 整体实力基线
  //   编程 Elo:   11   — 专项能力（按任务加权）
  //   推理 Elo:   11   — 专项能力
  //   视觉 Elo:   8    — 专项能力
  //   创意 Elo:   8    — 专项能力
  //   指令 Elo:   7    — 专项能力
  const capabilityWeight = config.smartRouting?.capabilityWeight ?? 20;
  const specializationWeight = config.smartRouting?.specializationWeight ?? 12;
  const modalityWeight = config.smartRouting?.modalityWeight ?? 8;
  const eloWeight = config.smartRouting?.eloWeight ?? 15;
  const codingEloWeight = config.smartRouting?.codingEloWeight ?? 11;
  const reasoningEloWeight = config.smartRouting?.reasoningEloWeight ?? 11;
  const visionEloWeight = config.smartRouting?.visionEloWeight ?? 8;
  const creativeEloWeight = config.smartRouting?.creativeEloWeight ?? 8;
  const instructionEloWeight = config.smartRouting?.instructionEloWeight ?? 7;

  // 4. 为每个账号打分
  const scores: AccountScore[] = await Promise.all(
    config.accounts.map(async (accountId: string) => {
      // 获取模型信息
      const modelInfo = await modelInfoGetter(accountId);

      const zeroScore = (mi?: ModelInfo): AccountScore => ({
        accountId,
        totalScore: 0,
        complexityScore: 0,
        capabilityScore: 0,
        specializationScore: 0,
        modalityScore: 0,
        eloScore: 0,
        codingEloScore: 0,
        reasoningEloScore: 0,
        visionEloScore: 0,
        creativeEloScore: 0,
        instructionEloScore: 0,
        modelInfo: mi,
        available: false,
      });

      if (!modelInfo) return zeroScore();

      // 基础能力匹配分数（硬性检查）
      const capabilityScore = matchCapabilities(complexity, modelInfo, context);
      // 模态匹配分数（硬性检查）
      const modalityScore = assessModalityMatch(context, modelInfo);

      // 能力或模态不匹配：直接标记不可用
      if (capabilityScore === 0 || modalityScore === 0) {
        return zeroScore(modelInfo);
      }

      // 专业领域匹配分数
      const specializationScore = assessSpecializationMatch(taskDomain, modelInfo);

      // 复杂度匹配分数（序列调中简单任务不计入总分）
      const complexityScore = 100 - complexity * 10;

      // ==================== 专项 Elo 分，对齐 lmarena.ai 分类 ====================
      const benchmarks = modelInfo.benchmarks;

      // 综合 Arena Elo
      const eloScore =
        benchmarks?.normalizedElo ??
        (benchmarks?.eloScore !== undefined ? normalizeEloScore(benchmarks.eloScore) : 50);

      // 编程专项 Elo：优先使用 codingElo 字段，回退到 HumanEval*0.7 + Elo*0.3
      const codingEloScore =
        benchmarks?.codingElo !== undefined
          ? normalizeEloScore(benchmarks.codingElo)
          : benchmarks?.humanEval !== undefined
            ? Math.round(benchmarks.humanEval * 0.7 + eloScore * 0.3)
            : eloScore;

      // 数学/推理专项 Elo：优先使用 reasoningElo，回退到 MATH*0.5 + GPQA*0.3 + Elo*0.2
      const reasoningEloScore =
        benchmarks?.reasoningElo !== undefined
          ? normalizeEloScore(benchmarks.reasoningElo)
          : (() => {
              if (benchmarks?.math !== undefined || benchmarks?.gpqa !== undefined) {
                let s = eloScore * 0.2;
                let w = 0.2;
                if (benchmarks.math !== undefined) { s += benchmarks.math * 0.5; w += 0.5; }
                if (benchmarks.gpqa !== undefined) { s += benchmarks.gpqa * 0.3; w += 0.3; }
                return Math.round(s / w);
              }
              return eloScore;
            })();

      // 视觉专项 Elo：优先使用 visionElo 字段，回退到 supportsVision 判断
      const visionEloScore =
        benchmarks?.visionElo !== undefined
          ? normalizeEloScore(benchmarks.visionElo)
          : modelInfo.supportsVision
            ? eloScore // 支持视觉但无专项数据，用综合 Elo 估算
            : 0; // 不支持视觉

      // 创意写作专项 Elo：优先使用 creativeElo 字段
      const creativeEloScore =
        benchmarks?.creativeElo !== undefined
          ? normalizeEloScore(benchmarks.creativeElo)
          : eloScore; // 回退到综合 Elo

      // 指令跟随专项 Elo：优先使用 instructionElo 字段，回退到 MMLU + Elo
      const instructionEloScore =
        benchmarks?.instructionElo !== undefined
          ? normalizeEloScore(benchmarks.instructionElo)
          : benchmarks?.mmlu !== undefined
            ? Math.round(benchmarks.mmlu * 0.4 + eloScore * 0.6)
            : eloScore;

      // ==================== 加权综合打分 ====================
      // 专项 Elo 权重根据任务领域动态加成：
      // 当任务为 coding 时，编程 Elo 权重 ×2；当任务为 reasoning/math 时，推理 Elo 权重 ×2，等
      const domainEloBoost = (domain: TaskDomain) => {
        if (domain === "coding") return { coding: 2.0, reasoning: 1.2, vision: 0.5, creative: 0.5, instruction: 0.8 };
        if (domain === "math") return { coding: 0.8, reasoning: 2.0, vision: 0.5, creative: 0.5, instruction: 0.8 };
        if (domain === "reasoning") return { coding: 1.0, reasoning: 2.0, vision: 0.5, creative: 0.5, instruction: 1.0 };
        if (domain === "vision") return { coding: 0.5, reasoning: 0.8, vision: 2.5, creative: 0.5, instruction: 0.7 };
        if (domain === "creative") return { coding: 0.5, reasoning: 0.8, vision: 0.5, creative: 2.0, instruction: 1.0 };
        if (domain === "instruction") return { coding: 0.8, reasoning: 1.0, vision: 0.5, creative: 1.0, instruction: 2.0 };
        if (domain === "multilingual") return { coding: 0.5, reasoning: 0.8, vision: 0.5, creative: 1.2, instruction: 1.5 };
        if (domain === "translation") return { coding: 0.5, reasoning: 0.8, vision: 0.5, creative: 1.2, instruction: 1.5 };
        // general / analysis
        return { coding: 1.0, reasoning: 1.0, vision: 1.0, creative: 1.0, instruction: 1.0 };
      };
      const boost = domainEloBoost(taskDomain);

      const totalScore =
        capabilityScore * (capabilityWeight / 100) +
        specializationScore * (specializationWeight / 100) +
        modalityScore * (modalityWeight / 100) +
        eloScore * (eloWeight / 100) +
        codingEloScore * (codingEloWeight / 100) * boost.coding +
        reasoningEloScore * (reasoningEloWeight / 100) * boost.reasoning +
        visionEloScore * (visionEloWeight / 100) * boost.vision +
        creativeEloScore * (creativeEloWeight / 100) * boost.creative +
        instructionEloScore * (instructionEloWeight / 100) * boost.instruction;

      return {
        accountId,
        totalScore: Math.round(totalScore),
        complexityScore,
        capabilityScore,
        specializationScore,
        modalityScore,
        eloScore,
        codingEloScore,
        reasoningEloScore,
        visionEloScore,
        creativeEloScore,
        instructionEloScore,
        modelInfo,
        available: true,
      };
    }),
  );

  // 5. 按总分排序（从高到低）
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
  const skippedDueToAuth: string[] = []; // 记录因 provider 认证全停用被跳过的账号
  const boundAndEnabledAccounts = config.accounts.filter((accountId: string) => {
    // 查找账号配置
    // oxlint-disable-next-line typescript/no-explicit-any
    const accountConfig = config.accountConfigs?.find((cfg: any) => cfg.accountId === accountId);

    // 【修复】如果没有找到 accountConfig，说明这个账号没有被单独配置过
    // 但只要它在 accounts 列表里，就说明它是绑定的，默认应该是启用的
    if (!accountConfig) {
      // 已绑定但未配置的账号，默认启用
      // 但仍然需要检查 provider 认证健康状态
    } else {
      // 检查是否启用（enabled 字段，默认为 true）
      const enabled = accountConfig.enabled !== false;
      if (!enabled) {
        return false;
      }
    }

    // Provider-level health gate：检查该模型账号对应的 provider 下是否有可用认证
    // 业界做法（LiteLLM/OpenRouter/Portkey）：provider 认证全停用 → 不可路由，静默跳过
    const slashIdx = accountId.indexOf("/");
    if (slashIdx > 0) {
      const providerId = accountId.substring(0, slashIdx);
      const providerUsable = isProviderUsableSync(providerId);
      if (providerUsable === false) {
        // provider 认证确定全部停用，静默跳过（不报错，让路由层选择其他账号）
        skippedDueToAuth.push(accountId);
        return false;
      }
      // providerUsable === undefined 表示缓存未就绪或未在新系统管理，不拦截
    }

    return true;
  });

  // 如果有因 provider 认证停用而被跳过的账号，记录日志（不报错，用户无感）
  if (skippedDueToAuth.length > 0) {
    console.log(
      `[ModelRouting] Silently skipped ${skippedDueToAuth.length} account(s) due to provider auth disabled: ${skippedDueToAuth.join(", ")}. Routing to remaining available accounts.`,
    );
  }

  // 如果没有任何可用账号，抛出错误
  if (boundAndEnabledAccounts.length === 0) {
    if (skippedDueToAuth.length > 0 && skippedDueToAuth.length === config.accounts.length) {
      // 所有绑定账号均因 provider 认证停用而被跳过
      // 业界做法：这种情况不该报错中断流程，而应该提示用户配置认证
      throw new Error(
        `All model accounts for this agent have their provider credentials disabled. ` +
          `Please enable at least one authentication credential for the provider(s): ${[...new Set(skippedDueToAuth.map((id) => id.substring(0, id.indexOf("/"))))].join(", ")}.`,
      );
    }
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
    reason += ` (总分: ${selectedScore.totalScore}`;
    reason += `, 能力: ${selectedScore.capabilityScore}`;
    reason += `, 专业: ${selectedScore.specializationScore}`;
    // 展示专项 Elo分
    const taskDomainLocal = detectTaskDomain(message, context);
    if (taskDomainLocal === "coding" && selectedScore.codingEloScore > 0) {
      reason += `, 编程Elo: ${selectedScore.codingEloScore}`;
    } else if ((taskDomainLocal === "reasoning" || taskDomainLocal === "math") && selectedScore.reasoningEloScore > 0) {
      reason += `, 推理Elo: ${selectedScore.reasoningEloScore}`;
    } else if (taskDomainLocal === "vision" && selectedScore.visionEloScore > 0) {
      reason += `, 视觉Elo: ${selectedScore.visionEloScore}`;
    } else if (taskDomainLocal === "creative" && selectedScore.creativeEloScore > 0) {
      reason += `, 创意Elo: ${selectedScore.creativeEloScore}`;
    } else if (taskDomainLocal === "instruction" && selectedScore.instructionEloScore > 0) {
      reason += `, 指令Elo: ${selectedScore.instructionEloScore}`;
    }
    if (selectedScore.eloScore > 0 && selectedScore.eloScore !== 50) {
      reason += `, 综合Elo: ${selectedScore.eloScore}`;
      if (selectedScore.modelInfo?.benchmarks?.eloScore) {
        reason += `[${selectedScore.modelInfo.benchmarks.eloScore}]`;
      }
    }
    // 显示模型的专业领域
    if (selectedScore.modelInfo?.specializations?.length) {
      reason += `, 领域: ${selectedScore.modelInfo.specializations.join(",")}`;
    }
    reason += ")";
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
  // oxlint-disable-next-line no-unused-vars
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
