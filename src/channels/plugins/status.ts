import type { OpenClawConfig } from "../../config/config.js";
import { projectSafeChannelAccountSnapshotFields } from "../account-snapshot-fields.js";
import { inspectReadOnlyChannelAccount } from "../read-only-account-inspect.js";
import type { ChannelAccountSnapshot, ChannelPlugin } from "./types.js";

// Channel docking: status snapshots flow through plugin.status hooks here.
export async function buildChannelAccountSnapshot<ResolvedAccount>(params: {
  plugin: ChannelPlugin<ResolvedAccount>;
  cfg: OpenClawConfig;
  accountId: string;
  runtime?: ChannelAccountSnapshot;
  probe?: unknown;
  audit?: unknown;
}): Promise<ChannelAccountSnapshot> {
  const account = params.plugin.config.resolveAccount(params.cfg, params.accountId);

  // 统一从配置中读取 name 字段（UI管理层通用字段）
  const channelConfig = params.cfg.channels?.[params.plugin.id] as
    | Record<string, unknown>
    | undefined;
  const accountsConfig = channelConfig?.accounts as Record<string, unknown> | undefined;
  const accountConfig = accountsConfig?.[params.accountId] as { name?: string } | undefined;
  const configName = accountConfig?.name;

  if (params.plugin.status?.buildAccountSnapshot) {
    const snapshot = await params.plugin.status.buildAccountSnapshot({
      account,
      cfg: params.cfg,
      runtime: params.runtime,
      probe: params.probe,
      audit: params.audit,
    });
    // 如果插件没有返回 name，用配置中的 name
    return {
      ...snapshot,
      name: snapshot.name || configName,
    };
  }
  const enabled = params.plugin.config.isEnabled
    ? params.plugin.config.isEnabled(account, params.cfg)
    : account && typeof account === "object"
      ? (account as { enabled?: boolean }).enabled
      : undefined;
  const configured = params.plugin.config.isConfigured
    ? await params.plugin.config.isConfigured(account, params.cfg)
    : undefined;
  return {
    accountId: params.accountId,
    name: configName, // 使用配置中的 name
    enabled,
    configured,
  };
}

// Re-export upstream addition: build snapshot for read-only source channels
async function buildSnapshotFromAccount<ResolvedAccount>(params: {
  plugin: ChannelPlugin<ResolvedAccount>;
  cfg: OpenClawConfig;
  accountId: string;
  account: ResolvedAccount;
  runtime?: ChannelAccountSnapshot;
  probe?: unknown;
  audit?: unknown;
}): Promise<ChannelAccountSnapshot> {
  if (params.plugin.status?.buildAccountSnapshot) {
    return await params.plugin.status.buildAccountSnapshot({
      account: params.account,
      cfg: params.cfg,
      runtime: params.runtime,
      probe: params.probe,
      audit: params.audit,
    });
  }
  const enabled = params.plugin.config.isEnabled
    ? params.plugin.config.isEnabled(params.account, params.cfg)
    : params.account && typeof params.account === "object"
      ? (params.account as { enabled?: boolean }).enabled
      : undefined;
  const configured =
    params.account && typeof params.account === "object" && "configured" in params.account
      ? (params.account as { configured?: boolean }).configured
      : params.plugin.config.isConfigured
        ? await params.plugin.config.isConfigured(params.account, params.cfg)
        : undefined;
  return {
    accountId: params.accountId,
    enabled,
    configured,
    ...projectSafeChannelAccountSnapshotFields(params.account),
  };
}

export async function buildReadOnlySourceChannelAccountSnapshot<ResolvedAccount>(params: {
  plugin: ChannelPlugin<ResolvedAccount>;
  cfg: OpenClawConfig;
  accountId: string;
  runtime?: ChannelAccountSnapshot;
  probe?: unknown;
  audit?: unknown;
}): Promise<ChannelAccountSnapshot | null> {
  const inspectedAccount =
    params.plugin.config.inspectAccount?.(params.cfg, params.accountId) ??
    inspectReadOnlyChannelAccount({
      channelId: params.plugin.id,
      cfg: params.cfg,
      accountId: params.accountId,
    });
  if (!inspectedAccount) {
    return null;
  }
  return await buildSnapshotFromAccount({
    ...params,
    account: inspectedAccount as ResolvedAccount,
  });
}
