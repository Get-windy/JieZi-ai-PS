/**
 * 绑定相关工具函数
 * 
 * 从 upstream 重新导出 bindings 相关函数
 */

import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { normalizeChatChannelId } from "../channels/registry.js";
import type { OpenClawConfig } from "../../upstream/src/config/types.js";
import type { AgentBinding, AgentRouteBinding } from "../config/types.agents.js";
import { normalizeAccountId, normalizeAgentId } from "./session-key.js";

// 重新导出 upstream 的 bindings 函数
export { listBindings, listBoundAccountIds, resolveDefaultAgentBoundAccountId, findAgentByChannelBinding, buildChannelAccountBindings, resolvePreferredAccountId } from "../../upstream/src/routing/bindings.js";

// 本地兼容函数（已废弃，保留用于向后兼容）
/**
 * @deprecated 请使用 upstream 的 listConfiguredBindings
 */
export function _listConfiguredBindingsLegacy(cfg: OpenClawConfig): AgentBinding[] {
  return Array.isArray(cfg.bindings) ? cfg.bindings : [];
}
