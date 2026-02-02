import type {
  ChannelOnboardingAdapter,
  OpenClawConfig,
} from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";

const channel = "dingtalk" as const;

function listDingtalkAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.dingtalk?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [DEFAULT_ACCOUNT_ID];
  }
  return Object.keys(accounts).filter(Boolean);
}

function resolveDingtalkAccount(cfg: OpenClawConfig, accountId: string = DEFAULT_ACCOUNT_ID) {
  const accounts = cfg.channels?.dingtalk?.accounts as Record<string, any> | undefined;
  const account = accounts?.[accountId];
  
  return {
    appKey: account?.appKey,
    appSecret: account?.appSecret,
    configured: Boolean(account?.appKey?.trim() && account?.appSecret?.trim()),
  };
}

export const dingtalkOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listDingtalkAccountIds(cfg).some((accountId) =>
      resolveDingtalkAccount(cfg, accountId).configured
    );
    return {
      channel,
      configured,
      statusLines: [`DingTalk (钉钉): ${configured ? "已配置" : "需要配置 AppKey 和 AppSecret"}`],
      selectionHint: configured ? "已配置" : "推荐 · 中国企业用户",
      quickstartScore: configured ? 2 : 10,
    };
  },
  configure: async ({ cfg, prompter }) => {
    const appKey = await prompter.text({
      message: "输入钉钉 AppKey（应用Key）",
      validate: (value: unknown) => {
        const str = String(value).trim();
        return str.length > 0 ? undefined : "AppKey 不能为空";
      },
    });

    const appSecret = await prompter.text({
      message: "输入钉钉 AppSecret（应用密钥）",
      validate: (value: unknown) => {
        const str = String(value).trim();
        return str.length > 0 ? undefined : "AppSecret 不能为空";
      },
    });

    const dingtalkConfig = cfg.channels?.dingtalk as Record<string, unknown> | undefined;
    const nextConfig: OpenClawConfig = {
      ...cfg,
      channels: {
        ...cfg.channels,
        dingtalk: {
          ...(dingtalkConfig || {}),
          accounts: {
            ...((dingtalkConfig?.accounts as Record<string, unknown> | undefined) || {}),
            default: {
              enabled: true,
              name: "钉钉机器人",
              appKey: String(appKey).trim(),
              appSecret: String(appSecret).trim(),
              dmPolicy: "pairing",
              allowFrom: [],
            },
          },
        },
      },
    };

    return {
      cfg: nextConfig,
      accountId: DEFAULT_ACCOUNT_ID,
    };
  },
};
