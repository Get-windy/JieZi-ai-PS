/**
 * directive-handling.ts - 本地覆盖层
 *
 * 覆盖上游的 directive-handling，使 resolveDefaultModel 能够感知
 * agents.list[].modelAccounts.defaultAccountId 配置，从而让绑定模型账号
 * 真正影响 agent 实际调用的模型，而不是被 agents.defaults.model.primary 全局覆盖。
 */

export { applyInlineDirectivesFastLane } from "../../../upstream/src/auto-reply/reply/directive-handling.fast-lane.js";
export * from "../../../upstream/src/auto-reply/reply/directive-handling.impl.js";
export type { InlineDirectives } from "../../../upstream/src/auto-reply/reply/directive-handling.parse.js";
export { isDirectiveOnly } from "../../../upstream/src/auto-reply/reply/directive-handling.directive-only.js";
export { parseInlineDirectives } from "../../../upstream/src/auto-reply/reply/directive-handling.parse.js";
export { persistInlineDirectives } from "../../../upstream/src/auto-reply/reply/directive-handling.persist.js";
export { formatDirectiveAck } from "../../../upstream/src/auto-reply/reply/directive-handling.shared.js";

import { DEFAULT_PROVIDER } from "../../../upstream/src/agents/defaults.js";
// ============ 本地覆盖：使用本地增强的 resolveAgentEffectiveModelPrimary ============
// 上游的 resolveDefaultModelForAgent 内部依赖上游 agent-scope.ts 的
// resolveAgentEffectiveModelPrimary，不感知 modelAccounts.defaultAccountId。
// 本地版本直接用本地增强的 resolveAgentEffectiveModelPrimary 拿到有效模型串，
// 再通过 resolveModelRefFromString 解析为 {provider, model}。
import {
  buildModelAliasIndex,
  resolveDefaultModelForAgent,
  resolveModelRefFromString,
  type ModelAliasIndex,
} from "../../../upstream/src/agents/model-selection.js";
import type { OpenClawConfig } from "../../../upstream/src/config/config.js";
import {
  resolveAgentEffectiveModelPrimary,
  resolveAgentExplicitModelPrimary,
  resolveAgentModelAccounts,
} from "../../agents/agent-scope.js";

export function resolveDefaultModel(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  isSystemTask?: boolean;
}): {
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: ModelAliasIndex;
  noModelConfigured?: boolean;
} {
  // Step 1: 用本地增强版取出有效模型字符串
  // isSystemTask=true 时允许跨 agent fallback（心跳任务驱动）
  // isSystemTask=false/undefined 时只用自身配置
  const agentModelOverride = params.agentId
    ? resolveAgentEffectiveModelPrimary(params.cfg, params.agentId, {
        allowFallbackToDefault: params.isSystemTask === true,
      })
    : undefined;

  if (agentModelOverride) {
    // Step 2: 先构建 aliasIndex
    const aliasIndex = buildModelAliasIndex({
      cfg: params.cfg,
      defaultProvider: DEFAULT_PROVIDER,
    });
    // Step 3: 解析为 {provider, model}
    const resolved = resolveModelRefFromString({
      raw: agentModelOverride,
      defaultProvider: DEFAULT_PROVIDER,
      aliasIndex,
    });
    if (resolved) {
      return {
        defaultProvider: resolved.ref.provider,
        defaultModel: resolved.ref.model,
        aliasIndex,
      };
    }
    // resolveModelRefFromString 无法解析时，尝试从 modelId 格式直接拆分
    // 新系统的模型 ID 格式是 providerId/modelName，不在 models.providers 里
    // 所以 resolveModelRefFromString 不能解析，但我们可以直接用
    const slashIdx = agentModelOverride.indexOf("/");
    if (slashIdx > 0) {
      const directProvider = agentModelOverride.substring(0, slashIdx);
      const directModel = agentModelOverride.substring(slashIdx + 1);
      return {
        defaultProvider: directProvider,
        defaultModel: directModel,
        aliasIndex,
      };
    }
  }

  // 非系统任务且 agent 未配置模型：返回 noModelConfigured=true，让上层提示用户
  // 注意区分「未配置模型」和「已配置但全部不可用」：
  //   未配置 → agentModelOverride=undefined 且 agent 本身也没有任何模型字符串 → 提示用户配置
  //   已配置但不可用 → agentModelOverride=undefined 但 agent 有配置 → 降级走全局 fallback（让智能路由处理）
  const hasAnyModelConfig =
    params.agentId !== undefined &&
    (resolveAgentExplicitModelPrimary(params.cfg, params.agentId) !== undefined ||
      resolveAgentModelAccounts(params.cfg, params.agentId) !== undefined);
  const agentHasNoModel =
    params.agentId !== undefined &&
    agentModelOverride === undefined &&
    !params.isSystemTask &&
    !hasAnyModelConfig;

  if (agentHasNoModel) {
    // 返回一个占位结构（防止类型错误），同时带上 noModelConfigured 标志
    const aliasIndex = buildModelAliasIndex({ cfg: params.cfg, defaultProvider: DEFAULT_PROVIDER });
    return {
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: "(none)",
      aliasIndex,
      noModelConfigured: true,
    };
  }

  // Fallback：无 agent 覆盖时使用上游全局默认（不传 agentId 避免上游走错误路径）
  const mainModel = resolveDefaultModelForAgent({
    cfg: params.cfg,
  });
  const defaultProvider = mainModel.provider;
  const defaultModel = mainModel.model;
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider,
  });
  return { defaultProvider, defaultModel, aliasIndex };
}
