import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import { monitorDingtalkProvider, sendMessageDingtalk } from "./gateway.js";
import { dingtalkOnboardingAdapter } from "./onboarding.js";

// 钉钉通道元数据
const dingtalkMeta = {
  id: "dingtalk" as const,
  label: "DingTalk",
  selectionLabel: "DingTalk (钉钉)",
  detailLabel: "DingTalk Bot",
  docsPath: "/channels/dingtalk",
  docsLabel: "dingtalk",
  blurb:
    "钉钉企业协作平台，支持Stream模式和机器人API。DingTalk enterprise collaboration platform with Stream Mode and Bot API.",
  systemImage: "message",
  quickstartAllowFrom: true,
  order: 102,
};

// 解析钉钉配置
type ResolvedDingtalkAccount = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  appKey?: string;
  appSecret?: string;
  config: {
    dmPolicy?: string;
    allowFrom?: string[];
    groupPolicy?: string;
    groups?: Record<string, unknown>;
  };
};

function resolveDingtalkAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): ResolvedDingtalkAccount {
  const { cfg, accountId } = params;
  const resolvedAccountId = normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID;

  const channelConfig = cfg.channels?.dingtalk as Record<string, unknown> | undefined;
  const accountsConfig = channelConfig?.accounts as Record<string, unknown> | undefined;
  const accountConfig = accountsConfig?.[resolvedAccountId] as Record<string, unknown> | undefined;

  // 基础配置（支持顶层配置）
  const baseAppKey = channelConfig?.appKey as string | undefined;
  const baseAppSecret = channelConfig?.appSecret as string | undefined;

  // 账户配置优先
  const appKey = (accountConfig?.appKey as string | undefined) ?? baseAppKey;
  const appSecret = (accountConfig?.appSecret as string | undefined) ?? baseAppSecret;

  const name =
    (accountConfig?.name as string | undefined) ?? (channelConfig?.name as string | undefined);
  const enabled = accountConfig?.enabled !== false && channelConfig?.enabled !== false;

  return {
    accountId: resolvedAccountId,
    name,
    enabled,
    appKey,
    appSecret,
    config: {
      dmPolicy:
        (accountConfig?.dmPolicy as string | undefined) ??
        (channelConfig?.dmPolicy as string | undefined),
      allowFrom:
        (accountConfig?.allowFrom as string[] | undefined) ??
        (channelConfig?.allowFrom as string[] | undefined) ??
        [],
      groupPolicy:
        (accountConfig?.groupPolicy as string | undefined) ??
        (channelConfig?.groupPolicy as string | undefined),
      groups:
        (accountConfig?.groups as Record<string, unknown> | undefined) ??
        (channelConfig?.groups as Record<string, unknown> | undefined),
    },
  };
}

// 钉钉插件定义
export const dingtalkPlugin: ChannelPlugin<ResolvedDingtalkAccount> = {
  id: "dingtalk",
  meta: dingtalkMeta,
  onboarding: dingtalkOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.dingtalk"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        appKey: { type: "string" },
        appSecret: { type: "string" },
        dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
        allowFrom: { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } },
        groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
        groupAllowFrom: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }] },
        },
        requireMention: { type: "boolean" },
        historyLimit: { type: "integer", minimum: 0 },
        dmHistoryLimit: { type: "integer", minimum: 0 },
        textChunkLimit: { type: "integer", minimum: 1 },
        chunkMode: { type: "string", enum: ["length", "newline"] },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => {
      const channelConfig = cfg.channels?.dingtalk as Record<string, unknown> | undefined;
      const accountsConfig = channelConfig?.accounts as Record<string, unknown> | undefined;

      if (!accountsConfig) {
        return [DEFAULT_ACCOUNT_ID];
      }

      return Object.keys(accountsConfig).filter(Boolean);
    },
    resolveAccount: (cfg, accountId) =>
      resolveDingtalkAccount({ cfg, accountId: accountId ?? undefined }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => Boolean(account.appKey?.trim() && account.appSecret?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appKey?.trim() && account.appSecret?.trim()),
    }),
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId }) => {
      const result = await sendMessageDingtalk(to, text, {
        accountId: accountId ?? undefined,
      });
      return { channel: "dingtalk", messageId: result.messageId ?? "", ...result };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info(`[${account.accountId}] starting DingTalk provider`);
      return monitorDingtalkProvider({
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
      });
    },
  },
};
