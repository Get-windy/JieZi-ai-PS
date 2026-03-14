import fsPromises from "node:fs/promises";
import nodePath from "node:path";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { readConfigFileSnapshot, resolveGatewayPort, writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { note } from "../terminal/note.js";
import { resolveUserPath } from "../utils.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { resolveOnboardingSecretInputString } from "../wizard/onboarding.secret-input.js";
import { WizardCancelledError } from "../wizard/prompts.js";
import { removeChannelConfigWizard } from "./configure.channels.js";
import { maybeInstallDaemon } from "./configure.daemon.js";
import { promptAuthConfig } from "./configure.gateway-auth.js";
import { promptGatewayConfig } from "./configure.gateway.js";
import type {
  ChannelsWizardMode,
  ConfigureWizardParams,
  WizardSection,
} from "./configure.shared.js";
import {
  CONFIGURE_SECTION_OPTIONS,
  confirm,
  intro,
  outro,
  select,
  text,
} from "./configure.shared.js";
import { formatHealthCheckFailure } from "./health-format.js";
import { healthCommand } from "./health.js";
import { noteChannelStatus, setupChannels } from "./onboard-channels.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  guardCancel,
  printWizardHeader,
  probeGatewayReachable,
  resolveControlUiLinks,
  summarizeExistingConfig,
  waitForGatewayReachable,
} from "./onboard-helpers.js";
import { promptRemoteGatewayConfig } from "./onboard-remote.js";
import { setupSkills } from "./onboard-skills.js";

type ConfigureSectionChoice = WizardSection | "__continue";

async function resolveGatewaySecretInputForWizard(params: {
  cfg: OpenClawConfig;
  value: unknown;
  path: string;
}): Promise<string | undefined> {
  try {
    return await resolveOnboardingSecretInputString({
      config: params.cfg,
      value: params.value,
      path: params.path,
      env: process.env,
    });
  } catch {
    return undefined;
  }
}

async function runGatewayHealthCheck(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  port: number;
}): Promise<void> {
  const localLinks = resolveControlUiLinks({
    bind: params.cfg.gateway?.bind ?? "loopback",
    port: params.port,
    customBindHost: params.cfg.gateway?.customBindHost,
    basePath: undefined,
  });
  const remoteUrl = params.cfg.gateway?.remote?.url?.trim();
  const wsUrl = params.cfg.gateway?.mode === "remote" && remoteUrl ? remoteUrl : localLinks.wsUrl;
  const configuredToken = await resolveGatewaySecretInputForWizard({
    cfg: params.cfg,
    value: params.cfg.gateway?.auth?.token,
    path: "gateway.auth.token",
  });
  const configuredPassword = await resolveGatewaySecretInputForWizard({
    cfg: params.cfg,
    value: params.cfg.gateway?.auth?.password,
    path: "gateway.auth.password",
  });
  const token =
    process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.CLAWDBOT_GATEWAY_TOKEN ?? configuredToken;
  const password =
    process.env.OPENCLAW_GATEWAY_PASSWORD ??
    process.env.CLAWDBOT_GATEWAY_PASSWORD ??
    configuredPassword;

  await waitForGatewayReachable({
    url: wsUrl,
    token,
    password,
    deadlineMs: 15_000,
  });

  try {
    await healthCommand({ json: false, timeoutMs: 10_000 }, params.runtime);
  } catch (err) {
    params.runtime.error(formatHealthCheckFailure(err));
    note(
      [
        "Docs:",
        "https://docs.openclaw.ai/gateway/health",
        "https://docs.openclaw.ai/gateway/troubleshooting",
      ].join("\n"),
      "Health check help",
    );
  }
}

async function promptConfigureSection(
  runtime: RuntimeEnv,
  hasSelection: boolean,
): Promise<ConfigureSectionChoice> {
  return guardCancel(
    await select<ConfigureSectionChoice>({
      message: "选择要配置的部分",
      options: [
        ...CONFIGURE_SECTION_OPTIONS,
        {
          value: "__continue",
          label: "继续",
          hint: hasSelection ? "完成" : "暂时跳过",
        },
      ],
      initialValue: CONFIGURE_SECTION_OPTIONS[0]?.value,
    }),
    runtime,
  );
}

async function promptChannelMode(runtime: RuntimeEnv): Promise<ChannelsWizardMode> {
  return guardCancel(
    await select({
      message: "通道",
      options: [
        {
          value: "configure",
          label: "配置/链接",
          hint: "添加/更新通道；禁用未选择的账号",
        },
        {
          value: "remove",
          label: "删除通道配置",
          hint: "从 openclaw.json 中删除通道令牌/设置",
        },
      ],
      initialValue: "configure",
    }),
    runtime,
  ) as ChannelsWizardMode;
}

async function promptWebToolsConfig(
  nextConfig: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  const existingSearch = nextConfig.tools?.web?.search;
  const existingFetch = nextConfig.tools?.web?.fetch;
  const hasSearchKey = Boolean(existingSearch?.apiKey);

  note(
    [
      "Web 搜索让你的代理使用 `web_search` 工具在线查找东西。",
      "它需要 Brave Search API 密钥（你可以将它存储在配置中或在 Gateway 环境中设置 BRAVE_API_KEY）。",
      "Docs: https://docs.openclaw.ai/tools/web",
    ].join("\n"),
    "Web 搜索",
  );

  const enableSearch = guardCancel(
    await confirm({
      message: "启用 web_search (Brave Search)？",
      initialValue: existingSearch?.enabled ?? hasSearchKey,
    }),
    runtime,
  );

  let nextSearch = {
    ...existingSearch,
    enabled: enableSearch,
  };

  if (enableSearch) {
    const keyInput = guardCancel(
      await text({
        message: hasSearchKey
          ? "Brave Search API 密钥（留空保持当前或使用 BRAVE_API_KEY）"
          : "Brave Search API 密钥（将它粘贴在这里；留空使用 BRAVE_API_KEY）",
        placeholder: hasSearchKey ? "留空保持当前" : "BSA...",
      }),
      runtime,
    );
    const key = String(keyInput ?? "").trim();
    if (key) {
      nextSearch = { ...nextSearch, apiKey: key };
    } else if (!hasSearchKey) {
      note(
        [
          "尚未存储密钥，因此 web_search 将保持不可用。",
          "在此处存储密钥或在 Gateway 环境中设置 BRAVE_API_KEY。",
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        "Web 搜索",
      );
    }
  }

  const enableFetch = guardCancel(
    await confirm({
      message: "启用 web_fetch（无需密钥的 HTTP 获取）？",
      initialValue: existingFetch?.enabled ?? true,
    }),
    runtime,
  );

  const nextFetch = {
    ...existingFetch,
    enabled: enableFetch,
  };

  return {
    ...nextConfig,
    tools: {
      ...nextConfig.tools,
      web: {
        ...nextConfig.tools?.web,
        search: nextSearch,
        fetch: nextFetch,
      },
    },
  };
}

export async function runConfigureWizard(
  opts: ConfigureWizardParams,
  runtime: RuntimeEnv = defaultRuntime,
) {
  try {
    printWizardHeader(runtime);
    intro(opts.command === "update" ? "OpenClaw 更新向导" : "OpenClaw 配置");
    const prompter = createClackPrompter();

    const snapshot = await readConfigFileSnapshot();
    const baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

    if (snapshot.exists) {
      const title = snapshot.valid ? "检测到现有配置" : "无效的配置";
      note(summarizeExistingConfig(baseConfig), title);
      if (!snapshot.valid && snapshot.issues.length > 0) {
        note(
          [
            ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
            "",
            "Docs: https://docs.openclaw.ai/gateway/configuration",
          ].join("\n"),
          "配置问题",
        );
      }
      if (!snapshot.valid) {
        outro(
          `配置无效。运行 \`${formatCliCommand("openclaw doctor")}\` 修复它，然后重新运行配置。`,
        );
        runtime.exit(1);
        return;
      }
    }

    const localUrl = "ws://127.0.0.1:18789";
    const baseLocalProbeToken = await resolveGatewaySecretInputForWizard({
      cfg: baseConfig,
      value: baseConfig.gateway?.auth?.token,
      path: "gateway.auth.token",
    });
    const baseLocalProbePassword = await resolveGatewaySecretInputForWizard({
      cfg: baseConfig,
      value: baseConfig.gateway?.auth?.password,
      path: "gateway.auth.password",
    });
    const localProbe = await probeGatewayReachable({
      url: localUrl,
      token:
        process.env.OPENCLAW_GATEWAY_TOKEN ??
        process.env.CLAWDBOT_GATEWAY_TOKEN ??
        baseLocalProbeToken,
      password:
        process.env.OPENCLAW_GATEWAY_PASSWORD ??
        process.env.CLAWDBOT_GATEWAY_PASSWORD ??
        baseLocalProbePassword,
    });
    const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
    const baseRemoteProbeToken = await resolveGatewaySecretInputForWizard({
      cfg: baseConfig,
      value: baseConfig.gateway?.remote?.token,
      path: "gateway.remote.token",
    });
    const remoteProbe = remoteUrl
      ? await probeGatewayReachable({
          url: remoteUrl,
          token: baseRemoteProbeToken,
        })
      : null;

    const mode = guardCancel(
      await select({
        message: "Gateway 将在哪里运行？",
        options: [
          {
            value: "local",
            label: "本地（此计算机）",
            hint: localProbe.ok ? `Gateway 可访问 (${localUrl})` : `未检测到 Gateway (${localUrl})`,
          },
          {
            value: "remote",
            label: "远程（仅信息）",
            hint: !remoteUrl
              ? "尚未配置远程 URL"
              : remoteProbe?.ok
                ? `Gateway 可访问 (${remoteUrl})`
                : `已配置但无法访问 (${remoteUrl})`,
          },
        ],
      }),
      runtime,
    );

    if (mode === "remote") {
      let remoteConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
      remoteConfig = applyWizardMetadata(remoteConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(remoteConfig);
      logConfigUpdated(runtime);
      outro("远程 Gateway 已配置。");
      return;
    }

    let nextConfig = { ...baseConfig };
    let didSetGatewayMode = false;
    if (nextConfig.gateway?.mode !== "local") {
      nextConfig = {
        ...nextConfig,
        gateway: {
          ...nextConfig.gateway,
          mode: "local",
        },
      };
      didSetGatewayMode = true;
    }
    let workspaceDir =
      nextConfig.agents?.defaults?.workspace ??
      baseConfig.agents?.defaults?.workspace ??
      DEFAULT_WORKSPACE;
    let gatewayPort = resolveGatewayPort(baseConfig);

    const persistConfig = async () => {
      nextConfig = applyWizardMetadata(nextConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(nextConfig);
      logConfigUpdated(runtime);
    };

    const _configureWorkspace = async () => {
      const workspaceInput = guardCancel(
        await text({
          message: "Workspace directory",
          initialValue: workspaceDir,
        }),
        runtime,
      );
      workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || DEFAULT_WORKSPACE);
      if (!snapshot.exists) {
        const indicators = ["MEMORY.md", "memory", ".git"].map((name) =>
          nodePath.join(workspaceDir, name),
        );
        const hasExistingContent = (
          await Promise.all(
            indicators.map(async (candidate) => {
              try {
                await fsPromises.access(candidate);
                return true;
              } catch {
                return false;
              }
            }),
          )
        ).some(Boolean);
        if (hasExistingContent) {
          note(
            [
              `检测到现有工作区 ${workspaceDir}`,
              "现有文件将被保留。缺失的模板可能会被创建，但不会被覆盖。",
            ].join("\n"),
            "现有工作区",
          );
        }
      }
      nextConfig = {
        ...nextConfig,
        agents: {
          ...nextConfig.agents,
          defaults: {
            ...nextConfig.agents?.defaults,
            workspace: workspaceDir,
          },
        },
      };
      await ensureWorkspaceAndSessions(workspaceDir, runtime);
    };

    const configureChannelsSection = async () => {
      await noteChannelStatus({ cfg: nextConfig, prompter });
      const channelMode = await promptChannelMode(runtime);
      if (channelMode === "configure") {
        nextConfig = await setupChannels(nextConfig, runtime, prompter, {
          allowDisable: true,
          allowSignalInstall: true,
          skipConfirm: true,
          skipStatusNote: true,
        });
      } else {
        nextConfig = await removeChannelConfigWizard(nextConfig, runtime);
      }
    };

    const _promptDaemonPort = async () => {
      const portInput = guardCancel(
        await text({
          message: "Gateway port for service install",
          initialValue: String(gatewayPort),
          validate: (value) => (Number.isFinite(Number(value)) ? undefined : "Invalid port"),
        }),
        runtime,
      );
      gatewayPort = Number.parseInt(String(portInput), 10);
    };

    if (opts.sections) {
      const selected = opts.sections;
      if (!selected || selected.length === 0) {
        outro("未选择任何更改。");
        return;
      }

      if (selected.includes("workspace")) {
        const workspaceInput = guardCancel(
          await text({
            message: "工作区目录",
            initialValue: workspaceDir,
          }),
          runtime,
        );
        workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || DEFAULT_WORKSPACE);
        nextConfig = {
          ...nextConfig,
          agents: {
            ...nextConfig.agents,
            defaults: {
              ...nextConfig.agents?.defaults,
              workspace: workspaceDir,
            },
          },
        };
        await ensureWorkspaceAndSessions(workspaceDir, runtime);
      }

      if (selected.includes("model")) {
        nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
      }

      if (selected.includes("web")) {
        nextConfig = await promptWebToolsConfig(nextConfig, runtime);
      }

      if (selected.includes("gateway")) {
        const gateway = await promptGatewayConfig(nextConfig, runtime);
        nextConfig = gateway.config;
        gatewayPort = gateway.port;
      }

      if (selected.includes("channels")) {
        await configureChannelsSection();
      }

      if (selected.includes("skills")) {
        const wsDir = resolveUserPath(workspaceDir);
        nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
      }

      await persistConfig();

      if (selected.includes("daemon")) {
        if (!selected.includes("gateway")) {
          const portInput = guardCancel(
            await text({
              message: "服务安装的 Gateway 端口",
              initialValue: String(gatewayPort),
              validate: (value) => (Number.isFinite(Number(value)) ? undefined : "无效的端口"),
            }),
            runtime,
          );
          gatewayPort = Number.parseInt(String(portInput), 10);
        }

        await maybeInstallDaemon({ runtime, port: gatewayPort });
      }

      if (selected.includes("health")) {
        const localLinks = resolveControlUiLinks({
          bind: nextConfig.gateway?.bind ?? "loopback",
          port: gatewayPort,
          customBindHost: nextConfig.gateway?.customBindHost,
          basePath: undefined,
        });
        const remoteUrl = nextConfig.gateway?.remote?.url?.trim();
        const wsUrl =
          nextConfig.gateway?.mode === "remote" && remoteUrl ? remoteUrl : localLinks.wsUrl;
        const rawToken = nextConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;
        const rawPassword =
          nextConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
        await waitForGatewayReachable({
          url: wsUrl,
          token: typeof rawToken === "string" ? rawToken : undefined,
          password: typeof rawPassword === "string" ? rawPassword : undefined,
          deadlineMs: 15_000,
        });
        try {
          await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
        } catch (err) {
          runtime.error(formatHealthCheckFailure(err));
          note(
            [
              "Docs:",
              "https://docs.openclaw.ai/gateway/health",
              "https://docs.openclaw.ai/gateway/troubleshooting",
            ].join("\n"),
            "健康检查帮助",
          );
        }
      }
    } else {
      let ranSection = false;
      let didConfigureGateway = false;

      while (true) {
        const choice = await promptConfigureSection(runtime, ranSection);
        if (choice === "__continue") {
          break;
        }
        ranSection = true;

        if (choice === "workspace") {
          const workspaceInput = guardCancel(
            await text({
              message: "工作区目录",
              initialValue: workspaceDir,
            }),
            runtime,
          );
          workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || DEFAULT_WORKSPACE);
          nextConfig = {
            ...nextConfig,
            agents: {
              ...nextConfig.agents,
              defaults: {
                ...nextConfig.agents?.defaults,
                workspace: workspaceDir,
              },
            },
          };
          await ensureWorkspaceAndSessions(workspaceDir, runtime);
          await persistConfig();
        }

        if (choice === "model") {
          nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
          await persistConfig();
        }

        if (choice === "web") {
          nextConfig = await promptWebToolsConfig(nextConfig, runtime);
          await persistConfig();
        }

        if (choice === "gateway") {
          const gateway = await promptGatewayConfig(nextConfig, runtime);
          nextConfig = gateway.config;
          gatewayPort = gateway.port;
          didConfigureGateway = true;
          await persistConfig();
        }

        if (choice === "channels") {
          await configureChannelsSection();
          await persistConfig();
        }

        if (choice === "skills") {
          const wsDir = resolveUserPath(workspaceDir);
          nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
          await persistConfig();
        }

        if (choice === "daemon") {
          if (!didConfigureGateway) {
            const portInput = guardCancel(
              await text({
                message: "服务安装的 Gateway 端口",
                initialValue: String(gatewayPort),
                validate: (value) => (Number.isFinite(Number(value)) ? undefined : "无效的端口"),
              }),
              runtime,
            );
            gatewayPort = Number.parseInt(String(portInput), 10);
          }
          await maybeInstallDaemon({
            runtime,
            port: gatewayPort,
          });
        }

        if (choice === "health") {
          const localLinks = resolveControlUiLinks({
            bind: nextConfig.gateway?.bind ?? "loopback",
            port: gatewayPort,
            customBindHost: nextConfig.gateway?.customBindHost,
            basePath: undefined,
          });
          const remoteUrl = nextConfig.gateway?.remote?.url?.trim();
          const wsUrl =
            nextConfig.gateway?.mode === "remote" && remoteUrl ? remoteUrl : localLinks.wsUrl;
          const rawToken2 = nextConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;
          const rawPassword2 =
            nextConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
          await waitForGatewayReachable({
            url: wsUrl,
            token: typeof rawToken2 === "string" ? rawToken2 : undefined,
            password: typeof rawPassword2 === "string" ? rawPassword2 : undefined,
            deadlineMs: 15_000,
          });
          try {
            await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
          } catch (err) {
            runtime.error(formatHealthCheckFailure(err));
            note(
              [
                "Docs:",
                "https://docs.openclaw.ai/gateway/health",
                "https://docs.openclaw.ai/gateway/troubleshooting",
              ].join("\n"),
              "健康检查帮助",
            );
          }
        }
      }

      if (!ranSection) {
        if (didSetGatewayMode) {
          await persistConfig();
          outro("Gateway 模式已设置为本地。");
          return;
        }
        outro("未选择任何更改。");
        return;
      }
    }

    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }

    const bind = nextConfig.gateway?.bind ?? "loopback";
    const links = resolveControlUiLinks({
      bind,
      port: gatewayPort,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: nextConfig.gateway?.controlUi?.basePath,
    });
    // Try both new and old passwords since gateway may still have old config.
    const newPassword = nextConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
    const oldPassword = baseConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
    const rawFinalToken = nextConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;
    const token = typeof rawFinalToken === "string" ? rawFinalToken : undefined;
    const newPasswordStr = typeof newPassword === "string" ? newPassword : undefined;
    const oldPasswordStr = typeof oldPassword === "string" ? oldPassword : undefined;

    let gatewayProbe = await probeGatewayReachable({
      url: links.wsUrl,
      token,
      password: newPasswordStr,
    });
    // If new password failed and it's different from old password, try old too.
    if (!gatewayProbe.ok && newPasswordStr !== oldPasswordStr && oldPasswordStr) {
      gatewayProbe = await probeGatewayReachable({
        url: links.wsUrl,
        token,
        password: oldPasswordStr,
      });
    }
    const gatewayStatusLine = gatewayProbe.ok
      ? "Gateway: 可访问"
      : `Gateway: 未检测到${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;

    note(
      [
        `Web UI: ${links.httpUrl}`,
        `Gateway WS: ${links.wsUrl}`,
        gatewayStatusLine,
        "Docs: https://docs.openclaw.ai/web/control-ui",
      ].join("\n"),
      "控制面板 UI",
    );

    outro("配置完成。");
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
