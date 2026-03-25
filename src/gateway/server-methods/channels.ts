import { buildChannelUiCatalog } from "../../../upstream/src/channels/plugins/catalog.js";
import { resolveChannelDefaultAccountId } from "../../../upstream/src/channels/plugins/helpers.js";
import {
  type ChannelId,
  getChannelPlugin,
  listChannelPlugins,
  normalizeChannelId,
} from "../../../upstream/src/channels/plugins/index.js";
import { buildChannelAccountSnapshot } from "../../../upstream/src/channels/plugins/status.js";
import type {
  ChannelAccountSnapshot,
  ChannelPlugin,
} from "../../../upstream/src/channels/plugins/types.js";
import type { OpenClawConfig } from "../../../upstream/src/config/config.js";
import {
  loadConfig,
  readConfigFileSnapshot,
  readConfigFileSnapshotForWrite,
  writeConfigFile,
} from "../../../upstream/src/config/config.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChannelsLogoutParams,
  validateChannelsStatusParams,
} from "../../../upstream/src/gateway/protocol/index.js";
import type {
  GatewayRequestContext,
  GatewayRequestHandlers,
} from "../../../upstream/src/gateway/server-methods/types.js";
import { formatForLog } from "../../../upstream/src/gateway/ws-log.js";
import { getChannelActivity } from "../../../upstream/src/infra/channel-activity.js";
import { defaultRuntime } from "../../../upstream/src/runtime.js";
import { channelManager } from "../../channels/channel-manager.js";
import { loadAllChannelPairingRequests } from "../../channels/pairing-requests.js";
import { DEFAULT_ACCOUNT_ID } from "../../routing/session-key.js";

type ChannelLogoutPayload = {
  channel: ChannelId;
  accountId: string;
  cleared: boolean;
  [key: string]: unknown;
};

export async function logoutChannelAccount(params: {
  channelId: ChannelId;
  accountId?: string | null;
  cfg: OpenClawConfig;
  context: GatewayRequestContext;
  plugin: ChannelPlugin;
}): Promise<ChannelLogoutPayload> {
  const resolvedAccountId =
    params.accountId?.trim() ||
    params.plugin.config.defaultAccountId?.(params.cfg) ||
    params.plugin.config.listAccountIds(params.cfg)[0] ||
    DEFAULT_ACCOUNT_ID;
  const account = params.plugin.config.resolveAccount(params.cfg, resolvedAccountId);
  await params.context.stopChannel(params.channelId, resolvedAccountId);
  const result = await params.plugin.gateway?.logoutAccount?.({
    cfg: params.cfg,
    accountId: resolvedAccountId,
    account,
    runtime: defaultRuntime,
  });
  if (!result) {
    throw new Error(`Channel ${params.channelId} does not support logout`);
  }
  const cleared = Boolean(result.cleared);
  const loggedOut = typeof result.loggedOut === "boolean" ? result.loggedOut : cleared;
  if (loggedOut) {
    params.context.markChannelLoggedOut(params.channelId, true, resolvedAccountId);
  }
  return {
    channel: params.channelId,
    accountId: resolvedAccountId,
    ...result,
    cleared,
  };
}

export const channelsHandlers: GatewayRequestHandlers = {
  "channels.status": async ({ params, respond, context }) => {
    if (!validateChannelsStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid channels.status params: ${formatValidationErrors(validateChannelsStatusParams.errors)}`,
        ),
      );
      return;
    }
    const probe = (params as { probe?: boolean }).probe === true;
    const timeoutMsRaw = (params as { timeoutMs?: unknown }).timeoutMs;
    const timeoutMs = typeof timeoutMsRaw === "number" ? Math.max(1000, timeoutMsRaw) : 10_000;
    const cfg = loadConfig();
    const runtime = context.getRuntimeSnapshot();
    const plugins = listChannelPlugins();
    const pluginMap = new Map<ChannelId, ChannelPlugin>(
      plugins.map((plugin) => [plugin.id, plugin]),
    );

    const resolveRuntimeSnapshot = (
      channelId: ChannelId,
      accountId: string,
      defaultAccountId: string,
    ): ChannelAccountSnapshot | undefined => {
      const accounts = runtime.channelAccounts[channelId];
      const defaultRuntime = runtime.channels[channelId];
      const raw =
        accounts?.[accountId] ?? (accountId === defaultAccountId ? defaultRuntime : undefined);
      if (!raw) {
        return undefined;
      }
      return raw;
    };

    const isAccountEnabled = (plugin: ChannelPlugin, account: unknown) =>
      plugin.config.isEnabled
        ? plugin.config.isEnabled(account, cfg)
        : !account ||
          typeof account !== "object" ||
          (account as { enabled?: boolean }).enabled !== false;

    const buildChannelAccounts = async (channelId: ChannelId) => {
      const plugin = pluginMap.get(channelId);
      if (!plugin) {
        return {
          accounts: [] as ChannelAccountSnapshot[],
          defaultAccountId: DEFAULT_ACCOUNT_ID,
          defaultAccount: undefined as ChannelAccountSnapshot | undefined,
          resolvedAccounts: {} as Record<string, unknown>,
        };
      }
      const accountIds = plugin.config.listAccountIds(cfg);
      const defaultAccountId = resolveChannelDefaultAccountId({
        plugin,
        cfg,
        accountIds,
      });
      const accounts: ChannelAccountSnapshot[] = [];
      const resolvedAccounts: Record<string, unknown> = {};
      for (const accountId of accountIds) {
        const account = plugin.config.resolveAccount(cfg, accountId);
        const enabled = isAccountEnabled(plugin, account);
        resolvedAccounts[accountId] = account;
        let probeResult: unknown;
        let lastProbeAt: number | null = null;
        if (probe && enabled && plugin.status?.probeAccount) {
          let configured = true;
          if (plugin.config.isConfigured) {
            configured = await plugin.config.isConfigured(account, cfg);
          }
          if (configured) {
            probeResult = await plugin.status.probeAccount({
              account,
              timeoutMs,
              cfg,
            });
            lastProbeAt = Date.now();
          }
        }
        let auditResult: unknown;
        if (probe && enabled && plugin.status?.auditAccount) {
          let configured = true;
          if (plugin.config.isConfigured) {
            configured = await plugin.config.isConfigured(account, cfg);
          }
          if (configured) {
            auditResult = await plugin.status.auditAccount({
              account,
              timeoutMs,
              cfg,
              probe: probeResult,
            });
          }
        }
        const runtimeSnapshot = resolveRuntimeSnapshot(channelId, accountId, defaultAccountId);
        const snapshot = await buildChannelAccountSnapshot({
          plugin,
          cfg,
          accountId,
          runtime: runtimeSnapshot,
          probe: probeResult,
          audit: auditResult,
        });
        if (lastProbeAt) {
          snapshot.lastProbeAt = lastProbeAt;
        }
        const activity = getChannelActivity({
          channel: channelId as never,
          accountId,
        });
        if (snapshot.lastInboundAt == null) {
          snapshot.lastInboundAt = activity.inboundAt;
        }
        if (snapshot.lastOutboundAt == null) {
          snapshot.lastOutboundAt = activity.outboundAt;
        }
        accounts.push(snapshot);
      }
      const defaultAccount =
        accounts.find((entry) => entry.accountId === defaultAccountId) ?? accounts[0];
      return { accounts, defaultAccountId, defaultAccount, resolvedAccounts };
    };

    const uiCatalog = buildChannelUiCatalog(plugins);

    // 静态 fallback schema：为没有 configSchema 的已知通道提供账号级字段定义
    // 当插件没有通过 configSchema 暴露账号字段时（如 emptyPluginConfigSchema），使用此处的静态定义
    const STATIC_ACCOUNT_SCHEMAS: Record<string, Record<string, unknown>> = {
      // 企业微信（wecom-openclaw-plugin 使用 emptyPluginConfigSchema）
      wecom: {
        type: "object",
        properties: {
          name: { type: "string", description: "账号显示名称" },
          enabled: { type: "boolean", description: "启用此账号" },
          botId: { type: "string", description: "企业微信 Bot ID" },
          secret: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "企业微信 Bot Secret",
          },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
        },
      },
      // Telegram（上游 bundled，无 configSchema）
      telegram: {
        type: "object",
        properties: {
          name: { type: "string", description: "账号显示名称" },
          enabled: { type: "boolean", description: "启用此账号" },
          token: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "Telegram Bot Token",
          },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
          webhookMode: { type: "boolean", description: "使用 Webhook 模式（默认轮询）" },
          webhookUrl: { type: "string", description: "Webhook URL（webhook 模式时使用）" },
        },
      },
      // Discord
      discord: {
        type: "object",
        properties: {
          name: { type: "string" },
          enabled: { type: "boolean" },
          token: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "Discord Bot Token",
          },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
        },
      },
      // Slack
      slack: {
        type: "object",
        properties: {
          name: { type: "string" },
          enabled: { type: "boolean" },
          botToken: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "Slack Bot Token (xoxb-...)",
          },
          appToken: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "Slack App-Level Token (xapp-...)",
          },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
        },
      },
      // 飞书（feishu）
      feishu: {
        type: "object",
        properties: {
          name: { type: "string" },
          enabled: { type: "boolean" },
          appId: { type: "string", description: "飞书 App ID" },
          appSecret: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "飞书 App Secret",
          },
          encryptKey: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "飞书 Encrypt Key（Webhook 模式）",
          },
          verificationToken: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "飞书 Verification Token（Webhook 模式）",
          },
          domain: {
            type: "string",
            enum: ["feishu", "lark"],
            description: "feishu.cn 或 larksuite.com",
          },
          connectionMode: {
            type: "string",
            enum: ["websocket", "webhook"],
            description: "连接模式",
          },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
        },
      },
      // Signal
      signal: {
        type: "object",
        properties: {
          name: { type: "string" },
          enabled: { type: "boolean" },
          phoneNumber: { type: "string", description: "Signal 注册手机号" },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
        },
      },
      // WhatsApp
      whatsapp: {
        type: "object",
        properties: {
          name: { type: "string" },
          enabled: { type: "boolean" },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
        },
      },
      // LINE
      line: {
        type: "object",
        properties: {
          name: { type: "string" },
          enabled: { type: "boolean" },
          channelAccessToken: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "LINE Channel Access Token",
          },
          channelSecret: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["source", "provider", "id"],
                properties: {
                  source: { type: "string", enum: ["env", "file", "exec"] },
                  provider: { type: "string", minLength: 1 },
                  id: { type: "string", minLength: 1 },
                },
              },
            ],
            description: "LINE Channel Secret",
          },
          dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
          allowFrom: { type: "array", items: { type: "string" } },
          groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
          requireMention: { type: "boolean" },
        },
      },
    };

    // 构建每个通道的账号级配置 Schema（用于 UI 编辑弹窗动态渲染表单字段）
    // 优先取 configSchema.schema.properties.accounts.additionalProperties（账号层独立 schema）
    // 否则降级使用整个 configSchema.schema（删除 accounts 字段）
    // 最终 fallback 到上面的 STATIC_ACCOUNT_SCHEMAS
    const channelConfigSchemas: Record<string, Record<string, unknown>> = {};
    console.log(
      `[channels.status] plugins count=${plugins.length}, ids=${plugins.map((p) => p.id).join(",")}`,
    );
    for (const plugin of plugins) {
      const rawSchema = plugin.configSchema?.schema;

      if (rawSchema) {
        const properties = rawSchema.properties as Record<string, unknown> | undefined;
        const accountsField = properties?.accounts as Record<string, unknown> | undefined;
        const accountAdditional = accountsField?.additionalProperties as
          | Record<string, unknown>
          | undefined;

        if (accountAdditional?.properties) {
          // 有明确的账号级 schema（properties 齐全），直接用
          channelConfigSchemas[plugin.id] = accountAdditional;
        } else if (properties) {
          // 降级：用顶层 schema properties，去掉 accounts/defaultAccount 这两个容器字段
          const { accounts: _a, defaultAccount: _d, ...restProperties } = properties;
          void _a;
          void _d;
          if (Object.keys(restProperties).length > 0) {
            channelConfigSchemas[plugin.id] = {
              type: "object",
              properties: restProperties,
            };
          }
        }
      }

      // 如果插件自身没有提供任何账号字段，使用静态 fallback
      if (!channelConfigSchemas[plugin.id] && STATIC_ACCOUNT_SCHEMAS[plugin.id]) {
        channelConfigSchemas[plugin.id] = STATIC_ACCOUNT_SCHEMAS[plugin.id];
      }
    }

    // 静态 fallback 兜底：对于内置通道（feishu/telegram 等可能未在外部 plugin 列表中），
    // 直接补全 STATIC_ACCOUNT_SCHEMAS 里所有未被覆盖的通道 schema
    for (const [channelId, staticSchema] of Object.entries(STATIC_ACCOUNT_SCHEMAS)) {
      if (!channelConfigSchemas[channelId]) {
        channelConfigSchemas[channelId] = staticSchema;
      }
    }

    const payload: Record<string, unknown> = {
      ts: Date.now(),
      channelOrder: uiCatalog.order,
      channelLabels: uiCatalog.labels,
      channelDetailLabels: uiCatalog.detailLabels,
      channelSystemImages: uiCatalog.systemImages,
      channelMeta: uiCatalog.entries,
      channels: {} as Record<string, unknown>,
      channelAccounts: {} as Record<string, unknown>,
      channelDefaultAccountId: {} as Record<string, unknown>,
      channelConfigSchemas,
    };
    const channelsMap = payload.channels as Record<string, unknown>;
    const accountsMap = payload.channelAccounts as Record<string, unknown>;
    const defaultAccountIdMap = payload.channelDefaultAccountId as Record<string, unknown>;
    for (const plugin of plugins) {
      const { accounts, defaultAccountId, defaultAccount, resolvedAccounts } =
        await buildChannelAccounts(plugin.id);
      const fallbackAccount =
        resolvedAccounts[defaultAccountId] ?? plugin.config.resolveAccount(cfg, defaultAccountId);
      const summary = plugin.status?.buildChannelSummary
        ? await plugin.status.buildChannelSummary({
            account: fallbackAccount,
            cfg,
            defaultAccountId,
            snapshot:
              defaultAccount ??
              ({
                accountId: defaultAccountId,
              } as ChannelAccountSnapshot),
          })
        : {
            configured: defaultAccount?.configured ?? false,
          };
      channelsMap[plugin.id] = summary;
      accountsMap[plugin.id] = accounts;
      defaultAccountIdMap[plugin.id] = defaultAccountId;
    }

    // 🎯 关键修改：加载所有通道的配对请求
    try {
      const pairingRequests = loadAllChannelPairingRequests();
      if (Object.keys(pairingRequests).length > 0) {
        payload.channelPairingRequests = pairingRequests;
      }
    } catch (err) {
      console.error("Failed to load pairing requests:", err);
      // 加载失败不影响主流程，继续返回其他数据
    }

    respond(true, payload, undefined);
  },
  "channels.logout": async ({ params, respond, context }) => {
    if (!validateChannelsLogoutParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid channels.logout params: ${formatValidationErrors(validateChannelsLogoutParams.errors)}`,
        ),
      );
      return;
    }
    const rawChannel = (params as { channel?: unknown }).channel;
    const channelId = typeof rawChannel === "string" ? normalizeChannelId(rawChannel) : null;
    if (!channelId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid channels.logout channel"),
      );
      return;
    }
    const plugin = getChannelPlugin(channelId);
    if (!plugin?.gateway?.logoutAccount) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `channel ${channelId} does not support logout`),
      );
      return;
    }
    const accountIdRaw = (params as { accountId?: unknown }).accountId;
    const accountId = typeof accountIdRaw === "string" ? accountIdRaw.trim() : undefined;
    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "config invalid; fix it before logging out"),
      );
      return;
    }
    try {
      const payload = await logoutChannelAccount({
        channelId,
        accountId,
        cfg: snapshot.config ?? {},
        context,
        plugin,
      });
      respond(true, payload, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /**
   * 保存通道账号配置
   *
   * 参数：channelId, accountId, name, config
   * 逻辑：先用 setup.applyAccountName 写入显示名称，
   *       再用 setup.applyAccountConfig 写入其他 config 字段（仅新建时）
   */
  "channels.account.save": async ({ params, respond }) => {
    const {
      channelId: rawChannelId,
      accountId: rawAccountId,
      name,
      config: accountConfig,
      isNew: isNewRaw,
    } = (params ?? {}) as {
      channelId?: unknown;
      accountId?: unknown;
      name?: unknown;
      config?: unknown;
      isNew?: unknown;
    };

    // normalizeChannelId 仅在 plugin 已注册到 registry 时才有返回值。
    // 对于内置通道（feishu 等）在运行时尚未加载进 registry 时，直接用原始 channelId 字符串作为 fallback。
    const channelId = (
      typeof rawChannelId === "string"
        ? (normalizeChannelId(rawChannelId) ?? rawChannelId.trim().toLowerCase()) || null
        : null
    ) as ChannelId | null;
    if (!channelId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "channels.account.save: missing channelId"),
      );
      return;
    }

    const accountId = typeof rawAccountId === "string" ? rawAccountId.trim() : "";
    if (!accountId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "channels.account.save: missing accountId"),
      );
      return;
    }

    // plugin 可能为 null（内置通道未加载进 registry），此时走直接 merge config 路径
    const plugin = getChannelPlugin(channelId);

    try {
      // 使用 ForWrite 变体以正确保留 env var 引用（如 ${TELEGRAM_BOT_TOKEN}）
      const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
      let cfg: OpenClawConfig = snapshot.config ?? loadConfig();

      const nameStr = typeof name === "string" ? name.trim() : "";

      // plugin 为 null 时（内置通道未加载进 registry），直接走 config merge 路径
      if (!plugin) {
        console.log(
          `[channels.account.save] plugin not in registry for ${channelId}, using direct config merge` +
            ` accountId=${accountId} name=${JSON.stringify(nameStr)} config=${JSON.stringify(accountConfig)}`,
        );
        const sectionKey = channelId as string;
        const channelsNode = (cfg.channels ?? {}) as Record<string, unknown>;
        const section = (channelsNode[sectionKey] ?? {}) as Record<string, unknown>;
        const accountsNode = section.accounts as Record<string, unknown> | undefined;
        const incomingConfig = {
          ...(accountConfig && typeof accountConfig === "object"
            ? (accountConfig as Record<string, unknown>)
            : {}),
          ...(nameStr ? { name: nameStr } : {}),
        };
        // 判断是否已有 accounts 子节点（多账号结构）
        if (accountsNode !== undefined) {
          // 多账号结构：写入 channels[ch].accounts[accountId]
          const accounts = accountsNode as Record<string, Record<string, unknown>>;
          const existing = accounts[accountId] ?? {};
          cfg = {
            ...cfg,
            channels: {
              ...channelsNode,
              [sectionKey]: {
                ...section,
                accounts: {
                  ...accounts,
                  [accountId]: { ...existing, ...incomingConfig },
                },
              },
            },
          } as OpenClawConfig;
        } else {
          // 单账号/顶层结构：直接 merge 到 channels[ch]
          cfg = {
            ...cfg,
            channels: {
              ...channelsNode,
              [sectionKey]: { ...section, ...incomingConfig },
            },
          } as OpenClawConfig;
        }
        await writeConfigFile(cfg, writeOptions);
        console.log(
          `[channels.account.save] writeConfigFile OK (no-plugin path) for ${channelId}/${accountId}`,
        );
        respond(true, { ok: true }, undefined);
        return;
      }

      const existingIds = plugin.config.listAccountIds(cfg);
      const isNew = isNewRaw === true || !existingIds.includes(accountId);

      console.log(
        `[channels.account.save] channel=${channelId} accountId=${accountId}` +
          ` name=${JSON.stringify(nameStr)} isNew=${isNew} isNewRaw=${String(isNewRaw)}` +
          ` existingIds=${JSON.stringify(existingIds)}` +
          ` config=${JSON.stringify(accountConfig)}` +
          ` snapshot.valid=${snapshot.valid}`,
      );

      if (isNew && plugin.setup?.applyAccountConfig) {
        // 新建账号：调用完整的 applyAccountConfig（写入 enabled + 所有 config 字段）
        cfg = plugin.setup.applyAccountConfig({
          cfg,
          accountId,
          input: {
            name: nameStr || undefined,
            ...(accountConfig && typeof accountConfig === "object" ? accountConfig : {}),
          },
        });
        // 如果 applyAccountConfig 没有写入名称，再单独写一次
        if (nameStr && plugin.setup.applyAccountName) {
          cfg = plugin.setup.applyAccountName({ cfg, accountId, name: nameStr });
        }
        console.log(
          `[channels.account.save] NEW account written via applyAccountConfig` +
            ` → channels.${channelId}=${JSON.stringify((cfg.channels as Record<string, unknown>)?.[channelId])}`,
        );
      } else {
        // 编辑已有账号：只更新名称（applyAccountName）+ 各 config 字段（逐字段 merge）
        if (nameStr && plugin.setup?.applyAccountName) {
          cfg = plugin.setup.applyAccountName({ cfg, accountId, name: nameStr });
          console.log(
            `[channels.account.save] applyAccountName done` +
              ` → channels.${channelId}.accounts.${accountId}.name=` +
              JSON.stringify(
                (
                  (
                    (cfg.channels as Record<string, unknown>)?.[channelId] as Record<
                      string,
                      unknown
                    >
                  )?.accounts as Record<string, Record<string, unknown>>
                )?.[accountId]?.name,
              ),
          );
        } else if (!nameStr) {
          console.log(`[channels.account.save] name is empty, skipping applyAccountName`);
        } else {
          console.log(
            `[channels.account.save] plugin has no applyAccountName, skipping name update`,
          );
        }
        // 将 accountConfig 中的字段 merge 到对应账号的配置节点
        // 注意：如果 accountConfig 中含有旧的 name 字段，用顶层 nameStr 覆盖，避免旧值污染
        if (accountConfig && typeof accountConfig === "object" && !Array.isArray(accountConfig)) {
          const sectionKey = channelId as string;
          const channels = (cfg.channels ?? {}) as Record<string, unknown>;
          const section = (channels[sectionKey] ?? {}) as Record<string, unknown>;
          const accountsNode = section.accounts as Record<string, unknown> | undefined;
          // nameStr 优先：若有新名称则覆盖 accountConfig.name
          const incomingConfig = {
            ...(accountConfig as Record<string, unknown>),
            ...(nameStr ? { name: nameStr } : {}),
          };

          // 判断是子账号（channels[ch].accounts[accountId] 有 key）还是顶层账号
          const isSubAccount = accountsNode !== undefined && accountId in accountsNode;

          console.log(
            `[channels.account.save] merging config fields,` +
              ` isSubAccount=${isSubAccount} accountId=${accountId}:`,
            `existing=${
              isSubAccount
                ? JSON.stringify(accountsNode[accountId])
                : JSON.stringify({ ...section, accounts: undefined })
            }`,
            `incoming=${JSON.stringify(incomingConfig)}`,
          );

          if (isSubAccount) {
            // 子账号：merge 到 channels[ch].accounts[accountId]
            const accounts = accountsNode as Record<string, Record<string, unknown>>;
            const existing = accounts[accountId] ?? {};
            cfg = {
              ...cfg,
              channels: {
                ...channels,
                [sectionKey]: {
                  ...section,
                  accounts: {
                    ...accounts,
                    [accountId]: { ...existing, ...incomingConfig },
                  },
                },
              },
            } as OpenClawConfig;
          } else {
            // 顶层账号：merge 到 channels[ch]（保留 accounts 子节点）
            const { accounts: existingAccounts, ...sectionWithoutAccounts } = section;
            const merged: Record<string, unknown> = {
              ...sectionWithoutAccounts,
              ...incomingConfig,
            };
            // 保留原有的 accounts 子节点（如果有）
            if (existingAccounts !== undefined) {
              merged.accounts = existingAccounts;
            }
            // 顶层账号不写 name 到 channel 顶层（一般顶层无 name 字段）
            if (!nameStr) {
              delete merged.name;
            }
            cfg = {
              ...cfg,
              channels: {
                ...channels,
                [sectionKey]: merged,
              },
            } as OpenClawConfig;
          }
        }
      }

      await writeConfigFile(cfg, writeOptions);
      console.log(`[channels.account.save] writeConfigFile OK for ${channelId}/${accountId}`);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      console.error(`[channels.account.save] ERROR:`, err);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /**
   * 删除通道账号配置
   *
   * 参数：channelId, accountId
   * 通过插件的 config.deleteAccount 从配置文件中删除账号
   */
  "channels.account.delete": async ({ params, respond }) => {
    const { channelId: rawChannelId, accountId: rawAccountId } = (params ?? {}) as {
      channelId?: unknown;
      accountId?: unknown;
    };

    const channelId = (
      typeof rawChannelId === "string"
        ? (normalizeChannelId(rawChannelId) ?? rawChannelId.trim().toLowerCase()) || null
        : null
    ) as ChannelId | null;
    if (!channelId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "channels.account.delete: missing channelId"),
      );
      return;
    }

    const accountId = typeof rawAccountId === "string" ? rawAccountId.trim() : "";
    if (!accountId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "channels.account.delete: missing accountId"),
      );
      return;
    }

    // plugin 可能为 null（内置通道未加载进 registry）
    const plugin = getChannelPlugin(channelId);
    if (!plugin) {
      // 没有 plugin：直接从 config 中删除该 channelId 节点
      try {
        const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
        const cfgBefore = snapshot.config ?? loadConfig();
        const { [channelId as string]: _removed, ...restChannels } = (cfgBefore.channels ??
          {}) as Record<string, unknown>;
        void _removed;
        const cfg = { ...cfgBefore, channels: restChannels } as OpenClawConfig;
        await writeConfigFile(cfg, writeOptions);
        console.log(`[channels.account.delete] no-plugin path: removed channel node ${channelId}`);
        // 同步清理孤立绑定
        await channelManager
          .purgeOrphanBindings(cfg)
          .catch((e) =>
            console.error(`[channels.account.delete] purgeOrphanBindings (no-plugin) error:`, e),
          );
        respond(true, { ok: true }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
      }
      return;
    }

    if (!plugin.config.deleteAccount) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `channel ${channelId} does not support account deletion`,
        ),
      );
      return;
    }

    try {
      const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
      const cfgBefore = snapshot.config ?? loadConfig();
      let cfg = plugin.config.deleteAccount({
        cfg: cfgBefore,
        accountId,
      });

      // 删除后检查：如果该 channel 节点已没有实质账号（无 accounts 子键，
      // 且顶层也无凭证字段），则把整个 channels[channelId] 节点一并清除，
      // 避免残留的空节点导致前端出现幽灵账号。
      const channelSection = (cfg.channels as Record<string, unknown> | undefined)?.[channelId];
      if (channelSection && typeof channelSection === "object") {
        const sec = channelSection as Record<string, unknown>;
        const accounts = sec.accounts as Record<string, unknown> | undefined;
        const hasSubAccounts = accounts && Object.keys(accounts).length > 0;
        // 顶层凭证字段：各通道常见的 key 名（token、botToken、appId、appSecret、webhookUrl 等）
        const CREDENTIAL_KEYS = [
          "token",
          "botToken",
          "appId",
          "appSecret",
          "secret",
          "corpId",
          "webhookUrl",
          "apiToken",
          "accessToken",
          "clientId",
          "clientSecret",
          "robotCode",
          "agentId",
          "encodingAESKey",
        ];
        const hasTopLevelCreds = CREDENTIAL_KEYS.some(
          (k) => k in sec && sec[k] != null && sec[k] !== "",
        );
        if (!hasSubAccounts && !hasTopLevelCreds) {
          // 整个 channel 节点已无实质内容，清除它
          const { [channelId]: _removed, ...restChannels } = (cfg.channels ?? {}) as Record<
            string,
            unknown
          >;
          void _removed;
          cfg = { ...cfg, channels: restChannels } as typeof cfg;
          console.log(
            `[channels.account.delete] channel=${channelId} section is now empty → removed entire channel node`,
          );
        }
      }

      console.log(
        `[channels.account.delete] channel=${channelId} accountId=${accountId}` +
          ` snapshot.valid=${snapshot.valid}` +
          ` accountsAfter=${JSON.stringify(plugin.config.listAccountIds(cfg))}`,
      );
      await writeConfigFile(cfg, writeOptions);
      console.log(`[channels.account.delete] writeConfigFile OK for ${channelId}/${accountId}`);
      // 删除账号后自动清理所有 agent 的孤立绑定
      await channelManager
        .purgeOrphanBindings(cfg)
        .catch((e) => console.error(`[channels.account.delete] purgeOrphanBindings error:`, e));
      respond(true, { ok: true }, undefined);
    } catch (err) {
      console.error(`[channels.account.delete] ERROR:`, err);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
