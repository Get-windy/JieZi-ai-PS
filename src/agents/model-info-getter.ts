/**
 * 模型信息获取器 - 从新的模型管理系统获取模型信息
 *
 * 该模块提供从 model-management.json 获取模型信息的功能，
 * 用于模型路由和选择逻辑。
 */
// oxlint-disable typescript/no-explicit-any

import type {
  ModelManagementStorage,
  ProviderAuth,
  // oxlint-disable-next-line no-unused-vars
  ProviderInstance,
} from "../gateway/server-methods/models.js";
import {
  lookupBenchmark,
  normalizeEloScore,
  getOverallBenchmarkScore,
  getCodingBenchmarkScore,
  getReasoningBenchmarkScore,
} from "./arena-benchmarks.js";
import type { ModelCatalogEntry } from "../../upstream/src/agents/model-catalog.js";
import type { ModelInfo, ModelSpecialization, DataModality } from "./model-routing.js";

/**
 * 根据模型名称和供应商检测模型的专业领域
 *
 * 优先级：
 * 1. 从模型目录的 tags 或 specializations 字段读取
 * 2. 基于模型名称的基础推断（兜底逻辑）
 */
function detectSpecializations(
  providerId: string,
  modelName: string,
  catalogEntry: ModelCatalogEntry,
): ModelSpecialization[] {
  const specializations: ModelSpecialization[] = [];

  // 1. 优先从模型目录的元数据读取（如果有的话）
  if ((catalogEntry as any).specializations) {
    return (catalogEntry as any).specializations as ModelSpecialization[];
  }

  // 2. 从 tags 标签推断
  const tags = (catalogEntry as any).tags as string[] | undefined;
  if (tags && tags.length > 0) {
    const tagMapping: Record<string, ModelSpecialization> = {
      coding: "coding",
      code: "coding",
      programming: "coding",
      math: "math",
      mathematics: "math",
      vision: "vision",
      image: "vision",
      multimodal: "multimodal",
      reasoning: "reasoning",
      creative: "creative",
      writing: "creative",
      translation: "translation",
      embedding: "embedding",
      speech: "speech",
      audio: "speech",
    };

    for (const tag of tags) {
      const lowerTag = tag.toLowerCase();
      if (tagMapping[lowerTag]) {
        specializations.push(tagMapping[lowerTag]);
      }
    }
  }

  // 3. 基于模型名称的基础推断（兜底逻辑，仅用于没有元数据的情况）
  if (specializations.length === 0) {
    const lowerModelName = modelName.toLowerCase();
    const lowerProviderId = providerId.toLowerCase();

    // 编程专用模型
    if (
      lowerModelName.includes("code") ||
      lowerModelName.includes("-coder") ||
      lowerProviderId.includes("deepseek") ||
      lowerModelName.includes("codellama") ||
      lowerModelName.includes("starcoder")
    ) {
      specializations.push("coding");
    }

    // 多模态模型
    if (
      catalogEntry.input?.includes("image") ||
      lowerModelName.includes("gemini") ||
      lowerModelName.includes("gpt-4o") ||
      lowerModelName.includes("claude-3")
    ) {
      specializations.push("multimodal");
    }

    // 深度推理模型
    if (catalogEntry.reasoning || lowerModelName.includes("o1") || lowerModelName.includes("o3")) {
      specializations.push("reasoning");
    }
  }

  // 4. 如果仍然没有检测到任何专业领域，标记为通用
  if (specializations.length === 0) {
    specializations.push("general");
  }

  return specializations;
}

/**
 * 根据模型目录信息检测支持的数据模态
 *
 * 优先级：
 * 1. 从模型目录的 supportedModalities 字段直接读取
 * 2. 从 input 字段推断
 * 3. 基于模型名称的基础推断（兜底逻辑）
 */
function detectSupportedModalities(
  catalogEntry: ModelCatalogEntry,
  providerId: string,
  modelName: string,
): DataModality[] {
  // 1. 优先从模型目录的元数据直接读取
  if ((catalogEntry as any).supportedModalities) {
    return (catalogEntry as any).supportedModalities as DataModality[];
  }

  const modalities: DataModality[] = [];

  // 2. 从 input 字段推断
  // 所有模型都支持文本
  modalities.push("text");

  // 检测图像支持
  if (catalogEntry.input?.includes("image")) {
    modalities.push("image");
  }

  // 检测音频支持
  if (catalogEntry.input?.includes("audio")) {
    modalities.push("audio");
  }

  // 检测视频支持
  if (catalogEntry.input?.includes("video")) {
    modalities.push("video");
  }

  // 3. 编程模型对代码有更好的支持（兜底逻辑）
  const lowerModelName = modelName.toLowerCase();
  if (
    lowerModelName.includes("code") ||
    lowerModelName.includes("-coder") ||
    providerId.toLowerCase().includes("deepseek")
  ) {
    modalities.push("code");
  }

  return modalities;
}

/**
 * 创建从新模型管理系统获取模型信息的函数
 *
 * @param storage - 模型管理存储对象
 * @param catalog - 模型目录（用于获取模型详细信息）
 * @returns modelInfoGetter 函数
 */
export function createModelInfoGetter(
  storage: ModelManagementStorage,
  catalog: ModelCatalogEntry[],
): (accountId: string) => Promise<ModelInfo | undefined> {
  return async (accountId: string): Promise<ModelInfo | undefined> => {
    try {
      let providerId: string;
      let modelName: string;
      let auth: ProviderAuth | undefined;

      // 支持两种格式：providerId/modelName (新) 或 providerId.authId (旧)
      if (accountId.includes("/")) {
        // 新格式：providerId/modelName
        [providerId, modelName] = accountId.split("/");
        if (!providerId || !modelName) {
          console.warn(`[ModelInfoGetter] Invalid account ID format: ${accountId}`);
          return undefined;
        }

        // 查找该模型的配置
        const modelConfigs = storage.models[providerId] || [];
        const modelConfig = modelConfigs.find(
          (m) => m.modelName === modelName && m.enabled && !m.deprecated,
        );

        if (!modelConfig) {
          console.warn(`[ModelInfoGetter] Model config not found: ${accountId}`);
          return undefined;
        }

        // 获取对应的认证信息
        const authList = storage.auths[providerId] || [];
        auth = authList.find((a) => a.authId === modelConfig.authId);
      } else {
        // 旧格式：providerId.authId
        const [provId, authId] = accountId.split(".");
        if (!provId || !authId) {
          console.warn(`[ModelInfoGetter] Invalid account ID format: ${accountId}`);
          return undefined;
        }
        providerId = provId;

        // 获取认证信息
        const authList = storage.auths[providerId];
        auth = authList?.find((a) => a.authId === authId);

        if (!auth) {
          console.warn(`[ModelInfoGetter] Auth not found: ${accountId}`);
          return undefined;
        }

        // 获取该认证下已启用的模型配置
        const modelConfigs = storage.models[providerId] || [];
        const enabledModels = modelConfigs.filter(
          (m) => m.authId === authId && m.enabled && !m.deprecated,
        );

        if (enabledModels.length === 0) {
          console.warn(`[ModelInfoGetter] No enabled models for account: ${accountId}`);
          return undefined;
        }

        // 使用第一个启用的模型
        modelName = enabledModels[0].modelName;
      }

      // 检查认证是否启用
      if (!auth || !auth.enabled) {
        console.warn(`[ModelInfoGetter] Auth not found or disabled: ${accountId}`);
        return undefined;
      }

      // 从目录中查找模型信息
      const catalogEntry = catalog.find(
        (entry) => entry.provider === providerId && entry.id === modelName,
      );

      if (!catalogEntry) {
        // 如果目录中没有，尝试从外部评测数据库获取基准信息
        console.warn(
          `[ModelInfoGetter] Model not found in catalog: ${providerId}/${modelName}, using defaults`,
        );
        const fallbackInfo: ModelInfo = {
          id: modelName,
          contextWindow: 128000,
          supportsTools: true,
          supportsVision: false,
          reasoningLevel: 2,
          inputPrice: 0.003,
          outputPrice: 0.015,
          supportedModalities: ["text", "code"],
          specializations: ["general"],
        };
        // 尝试从 Arena 数据库获取数据
        const fallbackBenchmark = lookupBenchmark(modelName);
        if (fallbackBenchmark) {
          const normalizedElo = normalizeEloScore(fallbackBenchmark.eloScore);
          fallbackInfo.benchmarks = {
            eloScore: fallbackBenchmark.eloScore,
            arenaRank: fallbackBenchmark.arenaRank,
            mmlu: fallbackBenchmark.mmlu,
            humanEval: fallbackBenchmark.humanEval,
            math: fallbackBenchmark.math,
            normalizedElo,
          };
          if ((fallbackBenchmark.math ?? 0) >= 90 || normalizedElo >= 80) {
            fallbackInfo.reasoningLevel = 3;
          }
        }
        return fallbackInfo;
      }

      // 构建 ModelInfo
      const baseInfo: ModelInfo = {
        id: modelName,
        contextWindow: catalogEntry.contextWindow ?? 128000,
        supportsTools: true, // 假设所有模型都支持工具调用
        supportsVision: catalogEntry.input?.includes("image") ?? false,
        reasoningLevel: catalogEntry.reasoning ? 3 : 2,
        // 使用目录中的价格信息，如果没有则使用默认值
        inputPrice: catalogEntry.pricing?.input ?? 0.003,
        outputPrice: catalogEntry.pricing?.output ?? 0.015,
        // 添加模态和专业领域信息
        supportedModalities: detectSupportedModalities(catalogEntry, providerId, modelName),
        specializations: detectSpecializations(providerId, modelName, catalogEntry),
      };

      // 注入外部评测基准数据
      const benchmarkEntry = lookupBenchmark(modelName);
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
          // 专项 Elo（对齐 lmarena 分类榜单，有数据则注入，无数据让路由引擎走回退逻辑）
          codingElo: benchmarkEntry.codingElo,
          reasoningElo: benchmarkEntry.reasoningElo,
          visionElo: benchmarkEntry.visionElo,
          creativeElo: benchmarkEntry.creativeElo,
          instructionElo: benchmarkEntry.instructionElo,
        };
        // 基于基准数据修正 reasoningLevel：如果 MATH 很高则提升推理等级
        if ((benchmarkEntry.math ?? 0) >= 90 || (benchmarkEntry.gpqa ?? 0) >= 70) {
          baseInfo.reasoningLevel = 3;
        } else if ((benchmarkEntry.math ?? 0) >= 60 || normalizedElo >= 70) {
          baseInfo.reasoningLevel = Math.max(baseInfo.reasoningLevel, 2);
        }
        // 基于 HumanEval 更新领域评分
        const codingScore = getCodingBenchmarkScore(modelName);
        const reasoningScore = getReasoningBenchmarkScore(modelName);
        const overallScore = getOverallBenchmarkScore(modelName);
        if (
          codingScore !== undefined ||
          reasoningScore !== undefined ||
          overallScore !== undefined
        ) {
          baseInfo.domainScores = {
            ...baseInfo.domainScores,
            ...(codingScore !== undefined ? { coding: codingScore } : {}),
            ...(reasoningScore !== undefined
              ? { reasoning: reasoningScore, math: reasoningScore }
              : {}),
            ...(overallScore !== undefined
              ? { general: overallScore, analysis: overallScore }
              : {}),
          };
        }
      }

      return baseInfo;
    } catch (err) {
      console.error(`[ModelInfoGetter] Error getting model info for ${accountId}:`, err);
      return undefined;
    }
  };
}

/**
 * 从账号ID获取provider和model信息（辅助函数）
 *
 * @param accountId - 账号ID，支持两种格式：
 *   - providerId/modelName (新格式，如 "zhipu/glm-4-plus")
 *   - providerId.authId (旧格式)
 * @param storage - 模型管理存储对象
 * @returns provider和model信息，如果未找到则返回null
 */
export function getProviderAndModelFromAccountId(
  accountId: string,
  storage: ModelManagementStorage,
): { provider: string; model: string; auth: ProviderAuth } | null {
  // 尝试新格式：providerId/modelName
  if (accountId.includes("/")) {
    const [providerId, modelName] = accountId.split("/");
    if (!providerId || !modelName) {
      return null;
    }

    // 查找该模型的配置
    const modelConfigs = storage.models[providerId] || [];
    const modelConfig = modelConfigs.find(
      (m) => m.modelName === modelName && m.enabled && !m.deprecated,
    );

    if (!modelConfig) {
      console.warn(`[ModelInfoGetter] Model config not found: ${accountId}`);
      return null;
    }

    // 获取对应的认证信息
    const authList = storage.auths[providerId] || [];
    const auth = authList.find((a) => a.authId === modelConfig.authId);

    if (!auth || !auth.enabled) {
      console.warn(`[ModelInfoGetter] Auth not found or disabled for model: ${accountId}`);
      return null;
    }

    return {
      provider: providerId,
      model: modelName,
      auth,
    };
  }

  // 尝试旧格式：providerId.authId
  const [providerId, authId] = accountId.split(".");
  if (!providerId || !authId) {
    return null;
  }

  const authList = storage.auths[providerId];
  const auth = authList?.find((a) => a.authId === authId);

  if (!auth || !auth.enabled) {
    return null;
  }

  // 获取该认证下已启用的模型
  const modelConfigs = storage.models[providerId] || [];
  const enabledModel = modelConfigs.find((m) => m.authId === authId && m.enabled && !m.deprecated);

  if (!enabledModel) {
    return null;
  }

  return {
    provider: providerId,
    model: enabledModel.modelName,
    auth,
  };
}
