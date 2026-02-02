import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  ClawdbotConfig,
  DmPolicy,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import { addWildcardAllowFrom, DEFAULT_ACCOUNT_ID, formatDocsLink } from "openclaw/plugin-sdk";

import { resolveFeishuCredentials } from "./accounts.js";
import { probeFeishu } from "./probe.js";
import type { FeishuConfig } from "./types.js";

const channel = "feishu" as const;

function setFeishuDmPolicy(cfg: ClawdbotConfig, dmPolicy: DmPolicy): ClawdbotConfig {
  const allowFrom =
    dmPolicy === "open"
      ? addWildcardAllowFrom(cfg.channels?.feishu?.allowFrom)?.map((entry) => String(entry))
      : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...cfg.channels?.feishu,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

function setFeishuAllowFrom(cfg: ClawdbotConfig, allowFrom: string[]): ClawdbotConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...cfg.channels?.feishu,
        allowFrom,
      },
    },
  };
}

function parseAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function promptFeishuAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
}): Promise<ClawdbotConfig> {
  const existing = params.cfg.channels?.feishu?.allowFrom ?? [];
  await params.prompter.note(
    [
      "Allowlist Feishu DMs by open_id or user_id.",
      "You can find user open_id in Feishu admin console or via API.",
      "Examples:",
      "- ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "- on_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ].join("\n"),
    "Feishu allowlist",
  );

  while (true) {
    const entry = await params.prompter.text({
      message: "Feishu allowFrom (user open_ids)",
      placeholder: "ou_xxxxx, ou_yyyyy",
      initialValue: existing[0] ? String(existing[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
    });
    const parts = parseAllowFromInput(String(entry));
    if (parts.length === 0) {
      await params.prompter.note("Enter at least one user.", "Feishu allowlist");
      continue;
    }

    const unique = [
      ...new Set([...existing.map((v) => String(v).trim()).filter(Boolean), ...parts]),
    ];
    return setFeishuAllowFrom(params.cfg, unique);
  }
}

async function noteFeishuCredentialHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) 前往飞书开放平台 (open.feishu.cn)",
      "2) 创建一个企业自建应用",
      "3) 从凭证页面获取 App ID 和 App Secret",
      "4) 启用所需权限：im:message, im:chat, contact:user.base:readonly",
      "5) 发布应用或将其添加到测试群组",
      "提示：你也可以设置 FEISHU_APP_ID / FEISHU_APP_SECRET 环境变量。",
      `Docs: ${formatDocsLink("/channels/feishu", "feishu")}`,
    ].join("\n"),
    "飞书凭证",
  );
}

function setFeishuGroupPolicy(
  cfg: ClawdbotConfig,
  groupPolicy: "open" | "allowlist" | "disabled",
): ClawdbotConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...cfg.channels?.feishu,
        enabled: true,
        groupPolicy,
      },
    },
  };
}

function setFeishuGroupAllowFrom(cfg: ClawdbotConfig, groupAllowFrom: string[]): ClawdbotConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...cfg.channels?.feishu,
        groupAllowFrom,
      },
    },
  };
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Feishu",
  channel,
  policyKey: "channels.feishu.dmPolicy",
  allowFromKey: "channels.feishu.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.feishu as FeishuConfig | undefined)?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setFeishuDmPolicy(cfg, policy),
  promptAllowFrom: promptFeishuAllowFrom,
};

export const feishuOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
    const configured = Boolean(resolveFeishuCredentials(feishuCfg));

    // Try to probe if configured
    let probeResult = null;
    if (configured && feishuCfg) {
      try {
        probeResult = await probeFeishu(feishuCfg);
      } catch {
        // Ignore probe errors
      }
    }

    const statusLines: string[] = [];
    if (!configured) {
      statusLines.push("飞书：需要应用凭证");
    } else if (probeResult?.ok) {
      statusLines.push(`飞书：已连接为 ${probeResult.botName ?? probeResult.botOpenId ?? "bot"}`);
    } else {
      statusLines.push("飞书：已配置（未验证连接）");;
    }

    return {
      channel,
      configured,
      statusLines,
      selectionHint: configured ? "已配置" : "需要应用凭证",
      quickstartScore: configured ? 2 : 0,
    };
  },

  configure: async ({ cfg, prompter }) => {
    const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
    const resolved = resolveFeishuCredentials(feishuCfg);
    const hasConfigCreds = Boolean(feishuCfg?.appId?.trim() && feishuCfg?.appSecret?.trim());
    const canUseEnv = Boolean(
      !hasConfigCreds &&
        process.env.FEISHU_APP_ID?.trim() &&
        process.env.FEISHU_APP_SECRET?.trim(),
    );

    let next = cfg;
    let appId: string | null = null;
    let appSecret: string | null = null;

    if (!resolved) {
      await noteFeishuCredentialHelp(prompter);
    }

    if (canUseEnv) {
      const keepEnv = await prompter.confirm({
        message: "检测到 FEISHU_APP_ID + FEISHU_APP_SECRET。使用环境变量？",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: { ...next.channels?.feishu, enabled: true },
          },
        };
      } else {
        appId = String(
          await prompter.text({
            message: "输入飞书 App ID",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "输入飞书 App Secret",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else if (hasConfigCreds) {
      const keep = await prompter.confirm({
        message: "飞书凭证已配置。保留它们？",
        initialValue: true,
      });
      if (!keep) {
        appId = String(
          await prompter.text({
            message: "输入飞书 App ID",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "输入飞书 App Secret",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else {
      appId = String(
        await prompter.text({
          message: "Enter Feishu App ID",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
      appSecret = String(
        await prompter.text({
          message: "Enter Feishu App Secret",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (appId && appSecret) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            enabled: true,
            appId,
            appSecret,
          },
        },
      };

      // Test connection
      const testCfg = next.channels?.feishu as FeishuConfig;
      try {
        const probe = await probeFeishu(testCfg);
        if (probe.ok) {
          await prompter.note(
            `已连接为 ${probe.botName ?? probe.botOpenId ?? "bot"}`,
            "飞书连接测试",
          );
        } else {
          await prompter.note(
            `连接失败：${probe.error ?? "未知错误"}`,
            "飞书连接测试",
          );
        }
      } catch (err) {
        await prompter.note(`连接测试失败：${String(err)}`, "飞书连接测试");
      }
    }

    // Domain selection
    const currentDomain = (next.channels?.feishu as FeishuConfig | undefined)?.domain ?? "feishu";
    const domain = await prompter.select({
      message: "选择飞书域名？",
      options: [
        { value: "feishu", label: "飞书 (feishu.cn) - 中国" },
        { value: "lark", label: "Lark (larksuite.com) - 国际" },
      ],
      initialValue: currentDomain,
    });
    if (domain) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            domain: domain as "feishu" | "lark",
          },
        },
      };
    }

    // Group policy
    const groupPolicy = await prompter.select({
      message: "群聊策略",
      options: [
        { value: "allowlist", label: "白名单 - 仅在特定群组中响应" },
        { value: "open", label: "开放 - 在所有群组中响应（需要 @提及）" },
        { value: "disabled", label: "禁用 - 不在群组中响应" },
      ],
      initialValue:
        (next.channels?.feishu as FeishuConfig | undefined)?.groupPolicy ?? "allowlist",
    });
    if (groupPolicy) {
      next = setFeishuGroupPolicy(next, groupPolicy as "open" | "allowlist" | "disabled");
    }

    // Group allowlist if needed
    if (groupPolicy === "allowlist") {
      const existing = (next.channels?.feishu as FeishuConfig | undefined)?.groupAllowFrom ?? [];
      const entry = await prompter.text({
        message: "Group chat allowlist (chat_ids)",
        placeholder: "oc_xxxxx, oc_yyyyy",
        initialValue: existing.length > 0 ? existing.map(String).join(", ") : undefined,
      });
      if (entry) {
        const parts = parseAllowFromInput(String(entry));
        if (parts.length > 0) {
          next = setFeishuGroupAllowFrom(next, parts);
        }
      }
    }

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },

  dmPolicy,

  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: { ...cfg.channels?.feishu, enabled: false },
    },
  }),
};
