import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { FeishuConfig, FeishuDomain, ResolvedFeishuAccount } from "./types.js";

export function resolveFeishuCredentials(
  cfg?: FeishuConfig,
  accountId?: string,
): {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  domain: FeishuDomain;
} | null {
  // 如果有多账号配置，优先使用账号级别的配置
  const accountsConfig = cfg?.accounts as Record<string, FeishuConfig> | undefined;
  const accountConfig = accountId ? accountsConfig?.[accountId] : undefined;

  // 账号级别配置优先，否则使用顶层配置
  const effectiveConfig = accountConfig ?? cfg;

  const appId = effectiveConfig?.appId?.trim();
  const appSecret = effectiveConfig?.appSecret?.trim();
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    encryptKey: effectiveConfig?.encryptKey?.trim() || undefined,
    verificationToken: effectiveConfig?.verificationToken?.trim() || undefined,
    domain: effectiveConfig?.domain ?? "feishu",
  };
}

export function resolveFeishuAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedFeishuAccount {
  const feishuCfg = params.cfg.channels?.feishu as FeishuConfig | undefined;
  const resolvedAccountId = params.accountId?.trim() || DEFAULT_ACCOUNT_ID;

  // 获取账号配置
  const accountsConfig = feishuCfg?.accounts as Record<string, FeishuConfig> | undefined;
  const accountConfig = accountsConfig?.[resolvedAccountId];

  // 账号级别的 enabled 状态，优先使用账号配置，否则使用顶层配置
  const accountEnabled = accountConfig?.enabled !== false;
  const topLevelEnabled = feishuCfg?.enabled !== false;
  const enabled = accountEnabled && topLevelEnabled;

  const creds = resolveFeishuCredentials(feishuCfg, resolvedAccountId);

  return {
    accountId: resolvedAccountId,
    enabled,
    configured: Boolean(creds),
    appId: creds?.appId,
    domain: creds?.domain ?? "feishu",
  };
}

export function listFeishuAccountIds(cfg: OpenClawConfig): string[] {
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  const accountsConfig = feishuCfg?.accounts as Record<string, unknown> | undefined;

  // 如果配置了多账号，返回账号ID列表
  if (accountsConfig && Object.keys(accountsConfig).length > 0) {
    return Object.keys(accountsConfig).filter(Boolean);
  }

  // 否则返回默认账号
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultFeishuAccountId(_cfg: OpenClawConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function listEnabledFeishuAccounts(cfg: OpenClawConfig): ResolvedFeishuAccount[] {
  return listFeishuAccountIds(cfg)
    .map((accountId) => resolveFeishuAccount({ cfg, accountId }))
    .filter((account) => account.enabled && account.configured);
}
