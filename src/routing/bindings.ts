/**
 * 绑定相关工具函数
 * 
 * 从 upstream 重新导出 bindings 相关函数
 */

import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { normalizeChatChannelId } from "../channels/registry.js";
import type { OpenClawConfig } from "../../upstream/src/config/types.js";
import type { AgentBinding } from "../config/types.agents.js";
import { normalizeAccountId, normalizeAgentId } from "./session-key.js";

function normalizeBindingChannelId(raw?: string | null): string | null {
  const normalized = normalizeChatChannelId(raw);
  if (normalized) {
    return normalized;
  }
  const fallback = (raw ?? "").trim().toLowerCase();
  return fallback || null;
}

/**
 * 获取配置中的所有绑定
 */
export function listBindings(cfg: OpenClawConfig): AgentBinding[] {
  return Array.isArray(cfg.bindings) ? cfg.bindings : [];
}

function resolveNormalizedBindingMatch(binding: AgentBinding): {
  agentId: string;
  accountId: string;
  channelId: string;
} | null {
  if (!binding || typeof binding !== "object") {
    return null;
  }
  const match = binding.match;
  if (!match || typeof match !== "object") {
    return null;
  }
  const channelId = normalizeBindingChannelId(match.channel);
  if (!channelId) {
    return null;
  }
  const accountId = typeof match.accountId === "string" ? match.accountId.trim() : "";
  if (!accountId || accountId === "*") {
    return null;
  }
  return {
    agentId: normalizeAgentId(binding.agentId),
    accountId: normalizeAccountId(accountId),
    channelId,
  };
}

/**
 * 列出指定通道的所有绑定账号ID
 */
export function listBoundAccountIds(cfg: OpenClawConfig, channelId: string): string[] {
  const normalizedChannel = normalizeBindingChannelId(channelId);
  if (!normalizedChannel) {
    return [];
  }
  const ids = new Set<string>();
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedBindingMatch(binding);
    if (!resolved || resolved.channelId !== normalizedChannel) {
      continue;
    }
    ids.add(resolved.accountId);
  }
  return Array.from(ids).toSorted((a, b) => a.localeCompare(b));
}

/**
 * 解析默认智能体绑定的账号ID
 */
export function resolveDefaultAgentBoundAccountId(
  cfg: OpenClawConfig,
  channelId: string,
): string | null {
  const normalizedChannel = normalizeBindingChannelId(channelId);
  if (!normalizedChannel) {
    return null;
  }
  const defaultAgentId = normalizeAgentId(resolveDefaultAgentId(cfg));
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedBindingMatch(binding);
    if (
      !resolved ||
      resolved.channelId !== normalizedChannel ||
      resolved.agentId !== defaultAgentId
    ) {
      continue;
    }
    return resolved.accountId;
  }
  return null;
}

/**
 * 查找指定通道账号绑定的智能体
 */
export function findAgentByChannelBinding(
  cfg: OpenClawConfig,
  channelId: string,
  accountId: string,
): string | null {
  const bindings = listBindings(cfg);
  for (const binding of bindings) {
    if (
      binding.match?.channel === channelId &&
      (binding.match?.accountId || "default") === (accountId || "default")
    ) {
      return binding.agentId;
    }
  }
  return null;
}

/**
 * 构建通道账号绑定映射
 */
export function buildChannelAccountBindings(cfg: OpenClawConfig) {
  const map = new Map<string, Map<string, string[]>>();
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedBindingMatch(binding);
    if (!resolved) {
      continue;
    }
    const byAgent = map.get(resolved.channelId) ?? new Map<string, string[]>();
    const list = byAgent.get(resolved.agentId) ?? [];
    if (!list.includes(resolved.accountId)) {
      list.push(resolved.accountId);
    }
    byAgent.set(resolved.agentId, list);
    map.set(resolved.channelId, byAgent);
  }
  return map;
}

/**
 * 解析首选账号ID
 */
export function resolvePreferredAccountId(params: {
  accountIds: string[];
  defaultAccountId: string;
  boundAccounts: string[];
}): string {
  if (params.boundAccounts.length > 0) {
    return params.boundAccounts[0];
  }
  return params.defaultAccountId;
}
