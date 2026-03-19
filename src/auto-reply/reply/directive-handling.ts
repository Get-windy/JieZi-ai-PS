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
export { isDirectiveOnly, parseInlineDirectives } from "../../../upstream/src/auto-reply/reply/directive-handling.parse.js";
export { persistInlineDirectives } from "../../../upstream/src/auto-reply/reply/directive-handling.persist.js";
export { formatDirectiveAck } from "../../../upstream/src/auto-reply/reply/directive-handling.shared.js";

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
import { DEFAULT_PROVIDER } from "../../../upstream/src/agents/defaults.js";
import { resolveAgentEffectiveModelPrimary } from "../../agents/agent-scope.js";
import { resolveAgentModelAccounts } from "../../agents/agent-scope.js";
import type { OpenClawConfig } from "../../../upstream/src/config/config.js";
import { createSubsystemLogger } from "../../../upstream/src/logging/subsystem.js";

const _dbgLog = createSubsystemLogger("model-resolve");

export function resolveDefaultModel(params: { cfg: OpenClawConfig; agentId?: string }): {
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: ModelAliasIndex;
} {
  // Step 1: 用本地增强版取出有效模型字符串（含 modelAccounts.defaultAccountId 逻辑）
  const agentModelOverride = params.agentId
    ? resolveAgentEffectiveModelPrimary(params.cfg, params.agentId)
    : undefined;

  // ── 调试：打印模型解析链路 ──────────────────────────────────────
  const _dbgAccounts = params.agentId ? resolveAgentModelAccounts(params.cfg, params.agentId) : undefined;
  _dbgLog.info(
    `[DEBUG-MODEL] resolveDefaultModel agentId=${params.agentId ?? "(none)"} ` +
    `effectivePrimary=${agentModelOverride ?? "(none)"} ` +
    `modelAccounts.defaultAccountId=${_dbgAccounts?.defaultAccountId ?? "(none)"} ` +
    `modelAccounts.accounts=${JSON.stringify(_dbgAccounts?.accounts ?? [])} ` +
    `agents.defaults.model.primary=${(params.cfg.agents?.defaults?.model as { primary?: string } | undefined)?.primary ?? "(none)"}`
  );
  // ─────────────────────────────────────────────────────────────────

  if (agentModelOverride) {
    // Step 2: 先构建 aliasIndex（以全局默认 provider 为基准）
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
      _dbgLog.info(
        `[DEBUG-MODEL] resolved agentId=${params.agentId} → ${resolved.ref.provider}/${resolved.ref.model}`
      );
      return {
        defaultProvider: resolved.ref.provider,
        defaultModel: resolved.ref.model,
        aliasIndex,
      };
    }
    _dbgLog.info(
      `[DEBUG-MODEL] resolveModelRefFromString FAILED for raw="${agentModelOverride}", falling back to global default`
    );
  }

  // Fallback：无 agent 覆盖时使用上游全局默认（不传 agentId 避免上游走错误路径）
  const mainModel = resolveDefaultModelForAgent({
    cfg: params.cfg,
  });
  const defaultProvider = mainModel.provider;
  const defaultModel = mainModel.model;
  _dbgLog.info(
    `[DEBUG-MODEL] fallback agentId=${params.agentId ?? "(none)"} → ${defaultProvider}/${defaultModel}`
  );
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider,
  });
  return { defaultProvider, defaultModel, aliasIndex };
}
