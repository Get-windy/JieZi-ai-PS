/**
 * directive-handling.ts - 本地覆盖层
 *
 * 覆盖上游的 directive-handling，使 resolveDefaultModel 能够感知
 * agents.list[].modelAccounts.defaultAccountId 配置，从而让绑定模型账号
 * 真正影响 agent 实际调用的模型，而不是被 agents.defaults.model.primary 全局覆盖。
 */

export { applyInlineDirectivesFastLane } from "./directive-handling.fast-lane.js";
export * from "./directive-handling.impl.js";
export type { InlineDirectives } from "./directive-handling.parse.js";
export { isDirectiveOnly, parseInlineDirectives } from "./directive-handling.parse.js";
export { persistInlineDirectives } from "./directive-handling.persist.js";
export { formatDirectiveAck } from "./directive-handling.shared.js";

// ============ 本地覆盖：使用本地增强的 resolveDefaultModelForAgent ============
// 上游版本只看 agents.defaults.model.primary 和 agents.list[].model，
// 不知道 modelAccounts.defaultAccountId。本地版本优先使用 defaultAccountId。
import {
  buildModelAliasIndex,
  resolveDefaultModelForAgent,
  type ModelAliasIndex,
} from "../../agents/model-selection.js";
import type { OpenClawConfig } from "../../config/config.js";

export function resolveDefaultModel(params: { cfg: OpenClawConfig; agentId?: string }): {
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: ModelAliasIndex;
} {
  // 使用本地增强版，优先检查 modelAccounts.defaultAccountId
  const mainModel = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
  const defaultProvider = mainModel.provider;
  const defaultModel = mainModel.model;
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider,
  });
  return { defaultProvider, defaultModel, aliasIndex };
}
