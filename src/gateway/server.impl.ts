import path from "node:path";
import { getActiveEmbeddedRunCount } from "../../upstream/src/agents/pi-embedded-runner/runs.js";
import { registerSkillsChangeListener } from "../../upstream/src/agents/skills/refresh.js";
import { getTotalPendingReplies } from "../../upstream/src/auto-reply/reply/dispatcher-registry.js";
import type { CanvasHostServer } from "../../upstream/src/canvas-host/server.js";
import { type ChannelId, listChannelPlugins } from "../../upstream/src/channels/plugins/index.js";
import { formatCliCommand } from "../../upstream/src/cli/command-format.js";
import { migrateLegacyConfig } from "../../upstream/src/commands/doctor/shared/legacy-config-migrate.js";
import {
  CONFIG_PATH,
  isNixMode,
  loadConfig,
  readConfigFileSnapshot,
  writeConfigFile,
} from "../../upstream/src/config/config.js";
import { applyPluginAutoEnable } from "../../upstream/src/config/plugin-auto-enable.js";
import {
  createAuthRateLimiter,
  type AuthRateLimiter,
} from "../../upstream/src/gateway/auth-rate-limit.js";
import { startChannelHealthMonitor } from "../../upstream/src/gateway/channel-health-monitor.js";
import {
  GATEWAY_EVENT_UPDATE_AVAILABLE,
  type GatewayUpdateAvailableEventPayload,
} from "../../upstream/src/gateway/events.js";
import { NodeRegistry } from "../../upstream/src/gateway/node-registry.js";
import { createChannelManager } from "../../upstream/src/gateway/server-channels.js";
import {
  createAgentEventHandler,
  createSessionEventSubscriberRegistry,
  createSessionMessageSubscriberRegistry,
} from "../../upstream/src/gateway/server-chat.js";
import { createGatewayCloseHandler } from "../../upstream/src/gateway/server-close.js";
import { startGatewayDiscovery } from "../../upstream/src/gateway/server-discovery-runtime.js";
import { applyGatewayLaneConcurrency } from "../../upstream/src/gateway/server-lanes.js";
import { startGatewayMaintenanceTimers } from "../../upstream/src/gateway/server-maintenance.js";
import { safeParseJson } from "../../upstream/src/gateway/server-methods/nodes.helpers.js";
import { createPluginApprovalHandlers } from "../../upstream/src/gateway/server-methods/plugin-approval.js";
import { hasConnectedMobileNode } from "../../upstream/src/gateway/server-mobile-nodes.js";
import { loadGatewayModelCatalog } from "../../upstream/src/gateway/server-model-catalog.js";
import { createNodeSubscriptionManager } from "../../upstream/src/gateway/server-node-subscriptions.js";
import { loadGatewayPlugins } from "../../upstream/src/gateway/server-plugins.js";
import { pinActivePluginChannelRegistry } from "../../upstream/src/plugins/runtime.js";
import { createGatewayReloadHandlers } from "../../upstream/src/gateway/server-reload-handlers.js";
import { createGatewayRuntimeState } from "../../upstream/src/gateway/server-runtime-state.js";
import { resolveSessionKeyForRun } from "../../upstream/src/gateway/server-session-key.js";
import { startGatewaySidecars } from "../../upstream/src/gateway/server-startup.js";
import { startGatewayTailscaleExposure } from "../../upstream/src/gateway/server-tailscale.js";
import { createWizardSessionTracker } from "../../upstream/src/gateway/server-wizard-sessions.js";
import { attachGatewayWsHandlers } from "../../upstream/src/gateway/server-ws-runtime.js";
import {
  getHealthCache,
  getHealthVersion,
  getPresenceVersion,
  incrementPresenceVersion,
  refreshGatewayHealthSnapshot,
} from "../../upstream/src/gateway/server/health-state.js";
import { resolveHookClientIpConfig } from "../../upstream/src/gateway/server/hooks.js"; // upstream-only, no local override needed
import { loadGatewayTlsRuntime } from "../../upstream/src/gateway/server/tls.js";
import { ensureGatewayStartupAuth } from "../../upstream/src/gateway/startup-auth.js";
import { clearAgentRunContext, onAgentEvent } from "../../upstream/src/infra/agent-events.js";
import {
  ensureControlUiAssetsBuilt,
  resolveControlUiRootOverrideSync,
  resolveControlUiRootSync,
} from "../../upstream/src/infra/control-ui-assets.js";
import { isDiagnosticsEnabled } from "../../upstream/src/infra/diagnostic-events.js";
import { logAcceptedEnvOption } from "../../upstream/src/infra/env.js";
import { onHeartbeatEvent } from "../../upstream/src/infra/heartbeat-events.js";
import { getMachineDisplayName } from "../../upstream/src/infra/machine-name.js";
import { ensureOpenClawCliOnPath } from "../../upstream/src/infra/path-env.js";
import {
  primeRemoteSkillsCache,
  refreshRemoteBinsForConnectedNodes,
  setSkillsRemoteRegistry,
} from "../../upstream/src/infra/skills-remote.js";
import {
  isTransientNetworkError,
  registerUnhandledRejectionHandler,
} from "../../upstream/src/infra/unhandled-rejections.js";
import { scheduleGatewayUpdateCheck } from "../../upstream/src/infra/update-startup.js";
import {
  startDiagnosticHeartbeat,
  stopDiagnosticHeartbeat,
} from "../../upstream/src/logging/diagnostic.js";
import { createSubsystemLogger, runtimeForLogger } from "../../upstream/src/logging/subsystem.js";
import {
  getGlobalHookRunner,
  runGlobalGatewayStopSafely,
} from "../../upstream/src/plugins/hook-runner-global.js";
import { createEmptyPluginRegistry } from "../../upstream/src/plugins/registry.js";
import type { PluginServicesHandle } from "../../upstream/src/plugins/services.js";
import { getTotalQueueSize } from "../../upstream/src/process/command-queue.js";
import type { RuntimeEnv } from "../../upstream/src/runtime.js";
import { runSetupWizard } from "../../upstream/src/wizard/setup.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { initBenchmarkDB } from "../agents/arena-benchmarks.js";
import { initSubagentRegistry } from "../agents/subagent-registry.js";
import { createDefaultDeps } from "../cli/deps.js";
import { isRestartEnabled } from "../config/commands.js";
import {
  startAgentTaskWakeScheduler,
  stopAgentTaskWakeScheduler,
} from "../cron/agent-task-wake-scheduler.js";
import {
  initMemoryHygieneScheduler,
  stopMemoryHygieneScheduler,
} from "../cron/memory-hygiene-scheduler.js";
import { initTaskAgingScheduler } from "../cron/task-aging-scheduler.js";
import { createExecApprovalForwarder } from "../infra/exec-approval-forwarder.js";
import { startHeartbeatRunner, type HeartbeatRunner } from "../infra/heartbeat-runner.js";
import { setGatewaySigusr1RestartPolicy, setPreRestartDeferralCheck } from "../infra/restart.js";
import { stopAgingTaskScheduler } from "../tasks/task-aging.js";
import { startGatewayConfigReloader } from "./config-reload.js";
import type { ControlUiRootState } from "./control-ui.js";
import { ExecApprovalManager } from "./exec-approval-manager.js";
import type { startBrowserControlServerIfEnabled } from "./server-browser.js";
import { buildGatewayCronService } from "./server-cron.js";
import { GATEWAY_EVENTS, listGatewayMethods } from "./server-methods-list.js";
import { coreGatewayHandlers } from "./server-methods.js";
import { setActivePluginApprovalManager } from "./server-methods/approval.js";
import { createExecApprovalHandlers } from "./server-methods/exec-approval.js";
import { resolveGatewayRuntimeConfig } from "./server-runtime-config.js";
import { logGatewayStartup } from "./server-startup-log.js";

export { __resetModelCatalogCacheForTest } from "../../upstream/src/gateway/server-model-catalog.js";

ensureOpenClawCliOnPath();

// 修复：当 unhandled rejection 是数组形式（如 [AxiosError]）时，
// 上游的 isTransientNetworkError 无法遍历数组元素导致进程崩溃。
// 此处注册一个前置 handler，展开数组后逐个检查是否为瞬态网络错误。
registerUnhandledRejectionHandler((reason) => {
  if (!Array.isArray(reason) || reason.length === 0) {
    return false;
  }
  const allTransient = reason.every(
    (item) =>
      isTransientNetworkError(item) ||
      (item instanceof Error &&
        ((item as NodeJS.ErrnoException).code === "ECONNABORTED" ||
          (item as NodeJS.ErrnoException).code === "ECONNRESET" ||
          (item as NodeJS.ErrnoException).code === "ETIMEDOUT")),
  );
  if (allTransient) {
    console.warn(
      `[openclaw] 非致命网络错误（数组形式，共 ${reason.length} 个），已忽略，服务继续运行：`,
      reason.map((e) => (e instanceof Error ? e.message : String(e))).join(" | "),
    );
    return true;
  }
  return false;
});

// 初始化 LMSYS Arena 基准数据库（首次实时获取，之后每周刷新）
void initBenchmarkDB().catch((err) => {
  log.warn(`Failed to initialize benchmark database: ${String(err)}`);
});

const log = createSubsystemLogger("gateway");
const logCanvas = log.child("canvas");
const logDiscovery = log.child("discovery");
const logTailscale = log.child("tailscale");
const logChannels = log.child("channels");
const logBrowser = log.child("browser");
const logHealth = log.child("health");
const logCron = log.child("cron");
const logReload = log.child("reload");
const logHooks = log.child("hooks");
const logPlugins = log.child("plugins");
const logWsControl = log.child("ws");
const gatewayRuntime = runtimeForLogger(log);
const canvasRuntime = runtimeForLogger(logCanvas);

export type GatewayServer = {
  close: (opts?: { reason?: string; restartExpectedMs?: number | null }) => Promise<void>;
};

export type GatewayServerOptions = {
  /**
   * Bind address policy for the Gateway WebSocket/HTTP server.
   * - loopback: 127.0.0.1
   * - lan: 0.0.0.0
   * - tailnet: bind only to the Tailscale IPv4 address (100.64.0.0/10)
   * - auto: prefer loopback, else LAN
   */
  bind?: import("../../upstream/src/config/config.js").GatewayBindMode;
  /**
   * Advanced override for the bind host, bypassing bind resolution.
   * Prefer `bind` unless you really need a specific address.
   */
  host?: string;
  /**
   * If false, do not serve the browser Control UI.
   * Default: config `gateway.controlUi.enabled` (or true when absent).
   */
  controlUiEnabled?: boolean;
  /**
   * If false, do not serve `POST /v1/chat/completions`.
   * Default: config `gateway.http.endpoints.chatCompletions.enabled` (or false when absent).
   */
  openAiChatCompletionsEnabled?: boolean;
  /**
   * If false, do not serve `POST /v1/responses` (OpenResponses API).
   * Default: config `gateway.http.endpoints.responses.enabled` (or false when absent).
   */
  openResponsesEnabled?: boolean;
  /**
   * Override gateway auth configuration (merges with config).
   */
  auth?: import("../../upstream/src/config/config.js").GatewayAuthConfig;
  /**
   * Override gateway Tailscale exposure configuration (merges with config).
   */
  tailscale?: import("../../upstream/src/config/config.js").GatewayTailscaleConfig;
  /**
   * Test-only: allow canvas host startup even when NODE_ENV/VITEST would disable it.
   */
  allowCanvasHostInTests?: boolean;
  /**
   * Test-only: override the onboarding wizard runner.
   */
  wizardRunner?: (
    opts: import("../commands/onboard-types.js").OnboardOptions,
    runtime: import("../../upstream/src/runtime.js").RuntimeEnv,
    prompter: import("../wizard/prompts.js").WizardPrompter,
  ) => Promise<void>;
};

export async function startGatewayServer(
  port = 18789,
  opts: GatewayServerOptions = {},
): Promise<GatewayServer> {
  const minimalTestGateway =
    process.env.VITEST === "1" && process.env.OPENCLAW_TEST_MINIMAL_GATEWAY === "1";

  // Ensure all default port derivations (browser/canvas) see the actual runtime port.
  process.env.OPENCLAW_GATEWAY_PORT = String(port);
  logAcceptedEnvOption({
    key: "OPENCLAW_RAW_STREAM",
    description: "raw stream logging enabled",
  });
  logAcceptedEnvOption({
    key: "OPENCLAW_RAW_STREAM_PATH",
    description: "raw stream log path override",
  });

  let configSnapshot = await readConfigFileSnapshot();
  if (configSnapshot.legacyIssues.length > 0) {
    if (isNixMode) {
      throw new Error(
        "Legacy config entries detected while running in Nix mode. Update your Nix config to the latest schema and restart.",
      );
    }
    const { config: migrated, changes } = migrateLegacyConfig(configSnapshot.parsed);
    if (!migrated) {
      throw new Error(
        `Legacy config entries detected but auto-migration failed. Run "${formatCliCommand("openclaw doctor")}" to migrate.`,
      );
    }
    await writeConfigFile(migrated);
    if (changes.length > 0) {
      log.info(
        `gateway: migrated legacy config entries:\n${changes
          .map((entry) => `- ${entry}`)
          .join("\n")}`,
      );
    }
  }

  configSnapshot = await readConfigFileSnapshot();
  if (configSnapshot.exists && !configSnapshot.valid) {
    const issues =
      configSnapshot.issues.length > 0
        ? configSnapshot.issues
            .map((issue) => `${issue.path || "<root>"}: ${issue.message}`)
            .join("\n")
        : "Unknown validation issue.";
    throw new Error(
      `Invalid config at ${configSnapshot.path}.\n${issues}\nRun "${formatCliCommand("openclaw doctor")}" to repair, then retry.`,
    );
  }

  const autoEnable = applyPluginAutoEnable({ config: configSnapshot.config, env: process.env });
  if (autoEnable.changes.length > 0) {
    try {
      await writeConfigFile(autoEnable.config);
      log.info(
        `gateway: auto-enabled plugins:\n${autoEnable.changes
          .map((entry) => `- ${entry}`)
          .join("\n")}`,
      );
    } catch (err) {
      log.warn(`gateway: failed to persist plugin auto-enable changes: ${String(err)}`);
    }
  }

  let cfgAtStart = loadConfig();
  const authBootstrap = await ensureGatewayStartupAuth({
    cfg: cfgAtStart,
    env: process.env,
    authOverride: opts.auth,
    tailscaleOverride: opts.tailscale,
    persist: true,
  });
  cfgAtStart = authBootstrap.cfg;
  if (authBootstrap.generatedToken) {
    if (authBootstrap.persistedGeneratedToken) {
      log.info(
        "Gateway auth token was missing. Generated a new token and saved it to config (gateway.auth.token).",
      );
    } else {
      log.warn(
        "Gateway auth token was missing. Generated a runtime token for this startup without changing config; restart will generate a different token. Persist one with `openclaw config set gateway.auth.mode token` and `openclaw config set gateway.auth.token <token>`.",
      );
    }
  }
  const diagnosticsEnabled = isDiagnosticsEnabled(cfgAtStart);
  if (diagnosticsEnabled) {
    startDiagnosticHeartbeat();
  }
  setGatewaySigusr1RestartPolicy({ allowExternal: isRestartEnabled(cfgAtStart) });
  setPreRestartDeferralCheck(
    () => getTotalQueueSize() + getTotalPendingReplies() + getActiveEmbeddedRunCount(),
  );
  initSubagentRegistry();
  const defaultAgentId = resolveDefaultAgentId(cfgAtStart);
  const defaultWorkspaceDir = resolveAgentWorkspaceDir(cfgAtStart, defaultAgentId);
  const baseMethods = listGatewayMethods();
  const emptyPluginRegistry = createEmptyPluginRegistry();
  const { pluginRegistry, gatewayMethods: baseGatewayMethods } = minimalTestGateway
    ? { pluginRegistry: emptyPluginRegistry, gatewayMethods: baseMethods }
    : (() => {
        const result = loadGatewayPlugins({
          cfg: cfgAtStart,
          workspaceDir: defaultWorkspaceDir,
          log,
          coreGatewayHandlers,
          baseMethods,
        });
        // 固定 channel registry，确保后续 setActivePluginRegistry（如配置重载）
        // 不会替换启动时加载的通道插件（如 feishu），与上游 loadGatewayStartupPlugins 保持一致
        pinActivePluginChannelRegistry(result.pluginRegistry);
        return result;
      })();
  const channelLogs = Object.fromEntries(
    listChannelPlugins().map((plugin) => [plugin.id, logChannels.child(plugin.id)]),
  ) as Record<ChannelId, ReturnType<typeof createSubsystemLogger>>;
  const channelRuntimeEnvs = Object.fromEntries(
    Object.entries(channelLogs).map(([id, logger]) => [id, runtimeForLogger(logger)]),
  ) as unknown as Record<ChannelId, RuntimeEnv>;
  const channelMethods = listChannelPlugins().flatMap((plugin) => plugin.gatewayMethods ?? []);
  const gatewayMethods = Array.from(new Set([...baseGatewayMethods, ...channelMethods]));
  let pluginServices: PluginServicesHandle | null = null;
  const runtimeConfig = await resolveGatewayRuntimeConfig({
    cfg: cfgAtStart,
    port,
    bind: opts.bind,
    host: opts.host,
    controlUiEnabled: opts.controlUiEnabled,
    openAiChatCompletionsEnabled: opts.openAiChatCompletionsEnabled,
    openResponsesEnabled: opts.openResponsesEnabled,
    auth: opts.auth,
    tailscale: opts.tailscale,
  });
  const {
    bindHost,
    controlUiEnabled,
    openAiChatCompletionsEnabled,
    openResponsesEnabled,
    openResponsesConfig,
    strictTransportSecurityHeader,
    controlUiBasePath,
    controlUiRoot: controlUiRootOverride,
    resolvedAuth,
    tailscaleConfig,
    tailscaleMode,
  } = runtimeConfig;
  let hooksConfig = runtimeConfig.hooksConfig;
  let hookClientIpConfig = resolveHookClientIpConfig(cfgAtStart);
  const canvasHostEnabled = runtimeConfig.canvasHostEnabled;

  // Create auth rate limiter only when explicitly configured.
  const rateLimitConfig = cfgAtStart.gateway?.auth?.rateLimit;
  const authRateLimiter: AuthRateLimiter | undefined = rateLimitConfig
    ? createAuthRateLimiter(rateLimitConfig)
    : undefined;

  let controlUiRootState: ControlUiRootState | undefined;
  if (controlUiRootOverride) {
    const resolvedOverride = resolveControlUiRootOverrideSync(controlUiRootOverride);
    const resolvedOverridePath = path.resolve(controlUiRootOverride);
    controlUiRootState = resolvedOverride
      ? { kind: "resolved", path: resolvedOverride }
      : { kind: "invalid", path: resolvedOverridePath };
    if (!resolvedOverride) {
      log.warn(`gateway: controlUi.root not found at ${resolvedOverridePath}`);
    }
  } else if (controlUiEnabled) {
    let resolvedRoot = resolveControlUiRootSync({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
      cwd: process.cwd(),
    });
    if (!resolvedRoot) {
      const ensureResult = await ensureControlUiAssetsBuilt(gatewayRuntime);
      if (!ensureResult.ok && ensureResult.message) {
        log.warn(`gateway: ${ensureResult.message}`);
      }
      resolvedRoot = resolveControlUiRootSync({
        moduleUrl: import.meta.url,
        argv1: process.argv[1],
        cwd: process.cwd(),
      });
    }
    controlUiRootState = resolvedRoot
      ? { kind: "resolved", path: resolvedRoot }
      : { kind: "missing" };
  }

  const wizardRunner = opts.wizardRunner ?? runSetupWizard;
  const { wizardSessions, findRunningWizard, purgeWizardSession } = createWizardSessionTracker();

  const deps = createDefaultDeps();
  let canvasHostServer: CanvasHostServer | null = null;
  const gatewayTls = await loadGatewayTlsRuntime(cfgAtStart.gateway?.tls, log.child("tls"));
  if (cfgAtStart.gateway?.tls?.enabled && !gatewayTls.enabled) {
    throw new Error(gatewayTls.error ?? "gateway tls: failed to enable");
  }
  const {
    canvasHost,
    httpServer,
    httpServers,
    httpBindHosts,
    wss,
    clients,
    preauthConnectionBudget,
    broadcast,
    broadcastToConnIds,
    agentRunSeq,
    dedupe,
    chatRunState,
    chatRunBuffers,
    chatDeltaSentAt,
    chatDeltaLastBroadcastLen,
    addChatRun,
    removeChatRun,
    chatAbortControllers,
    toolEventRecipients,
  } = await createGatewayRuntimeState({
    cfg: cfgAtStart,
    bindHost,
    port,
    controlUiEnabled,
    controlUiBasePath,
    controlUiRoot: controlUiRootState,
    openAiChatCompletionsEnabled,
    openResponsesEnabled,
    openResponsesConfig,
    strictTransportSecurityHeader,
    resolvedAuth,
    rateLimiter: authRateLimiter,
    gatewayTls,
    hooksConfig: () => hooksConfig,
    getHookClientIpConfig: () => hookClientIpConfig,
    pluginRegistry,
    deps,
    canvasRuntime,
    canvasHostEnabled,
    allowCanvasHostInTests: opts.allowCanvasHostInTests,
    logCanvas,
    log,
    logHooks,
    logPlugins,
  });
  let transcriptUnsub: (() => void) | null = null;
  let lifecycleUnsub: (() => void) | null = null;
  let channelHealthMonitor: ReturnType<typeof startChannelHealthMonitor> | null = null;
  let bonjourStop: (() => Promise<void>) | null = null;
  const nodeRegistry = new NodeRegistry();
  const nodePresenceTimers = new Map<string, ReturnType<typeof setInterval>>();
  const nodeSubscriptions = createNodeSubscriptionManager();
  const sessionEventSubscribers = createSessionEventSubscriberRegistry();
  const sessionMessageSubscribers = createSessionMessageSubscriberRegistry();
  const nodeSendEvent = (opts: { nodeId: string; event: string; payloadJSON?: string | null }) => {
    const payload = safeParseJson(opts.payloadJSON ?? null);
    nodeRegistry.sendEvent(opts.nodeId, opts.event, payload);
  };
  const nodeSendToSession = (sessionKey: string, event: string, payload: unknown) =>
    nodeSubscriptions.sendToSession(sessionKey, event, payload, nodeSendEvent);
  const nodeSendToAllSubscribed = (event: string, payload: unknown) =>
    nodeSubscriptions.sendToAllSubscribed(event, payload, nodeSendEvent);
  const nodeSubscribe = nodeSubscriptions.subscribe;
  const nodeUnsubscribe = nodeSubscriptions.unsubscribe;
  const nodeUnsubscribeAll = nodeSubscriptions.unsubscribeAll;
  const broadcastVoiceWakeChanged = (triggers: string[]) => {
    broadcast("voicewake.changed", { triggers }, { dropIfSlow: true });
  };
  const hasMobileNodeConnected = () => hasConnectedMobileNode(nodeRegistry);
  applyGatewayLaneConcurrency(cfgAtStart);

  let cronState = buildGatewayCronService({
    cfg: cfgAtStart,
    deps,
    broadcast,
  });
  let { cron, storePath: cronStorePath } = cronState;

  const channelManager = createChannelManager({
    loadConfig,
    channelLogs,
    channelRuntimeEnvs,
  });
  const { getRuntimeSnapshot, startChannels, startChannel, stopChannel, markChannelLoggedOut } =
    channelManager;

  if (!minimalTestGateway) {
    const machineDisplayName = await getMachineDisplayName();
    const discovery = await startGatewayDiscovery({
      machineDisplayName,
      port,
      gatewayTls: gatewayTls.enabled
        ? { enabled: true, fingerprintSha256: gatewayTls.fingerprintSha256 }
        : undefined,
      wideAreaDiscoveryEnabled: cfgAtStart.discovery?.wideArea?.enabled === true,
      wideAreaDiscoveryDomain: cfgAtStart.discovery?.wideArea?.domain,
      tailscaleMode,
      mdnsMode: cfgAtStart.discovery?.mdns?.mode,
      logDiscovery,
    });
    bonjourStop = discovery.bonjourStop;
  }

  if (!minimalTestGateway) {
    setSkillsRemoteRegistry(nodeRegistry);
    void primeRemoteSkillsCache();
  }
  // Debounce skills-triggered node probes to avoid feedback loops and rapid-fire invokes.
  // Skills changes can happen in bursts (e.g., file watcher events), and each probe
  // takes time to complete. A 30-second delay ensures we batch changes together.
  let skillsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const skillsRefreshDelayMs = 30_000;
  const skillsChangeUnsub = minimalTestGateway
    ? () => {}
    : registerSkillsChangeListener((event) => {
        if (event.reason === "remote-node") {
          return;
        }
        if (skillsRefreshTimer) {
          clearTimeout(skillsRefreshTimer);
        }
        skillsRefreshTimer = setTimeout(() => {
          skillsRefreshTimer = null;
          const latest = loadConfig();
          void refreshRemoteBinsForConnectedNodes(latest);
        }, skillsRefreshDelayMs);
      });

  const noopInterval = () => setInterval(() => {}, 1 << 30);
  let tickInterval = noopInterval();
  let healthInterval = noopInterval();
  let dedupeCleanup = noopInterval();
  if (!minimalTestGateway) {
    ({ tickInterval, healthInterval, dedupeCleanup } = startGatewayMaintenanceTimers({
      broadcast,
      nodeSendToAllSubscribed,
      getPresenceVersion,
      getHealthVersion,
      refreshGatewayHealthSnapshot,
      logHealth,
      dedupe,
      chatAbortControllers,
      chatRunState,
      chatRunBuffers,
      chatDeltaSentAt,
      chatDeltaLastBroadcastLen,
      removeChatRun,
      agentRunSeq,
      nodeSendToSession,
    }));
  }

  const agentUnsub = minimalTestGateway
    ? null
    : onAgentEvent(
        createAgentEventHandler({
          broadcast,
          broadcastToConnIds,
          nodeSendToSession,
          agentRunSeq,
          chatRunState,
          resolveSessionKeyForRun,
          clearAgentRunContext,
          toolEventRecipients,
          sessionEventSubscribers,
        }),
      );

  const heartbeatUnsub = minimalTestGateway
    ? null
    : onHeartbeatEvent((evt) => {
        broadcast("heartbeat", evt, { dropIfSlow: true });
      });

  let heartbeatRunner: HeartbeatRunner = minimalTestGateway
    ? {
        stop: () => {},
        updateConfig: () => {},
      }
    : startHeartbeatRunner({ cfg: cfgAtStart });

  const healthCheckMinutes = cfgAtStart.gateway?.channelHealthCheckMinutes;
  const healthCheckDisabled = healthCheckMinutes === 0;
  channelHealthMonitor = healthCheckDisabled
    ? null
    : startChannelHealthMonitor({
        channelManager,
        checkIntervalMs: (healthCheckMinutes ?? 5) * 60_000,
      });

  if (!minimalTestGateway) {
    void cron.start().catch((err) => logCron.error(`failed to start: ${String(err)}`));
  }

  // Recover pending outbound deliveries from previous crash/restart.
  if (!minimalTestGateway) {
    void (async () => {
      const { recoverPendingDeliveries } = await import("../infra/outbound/delivery-queue.js");
      const { deliverOutboundPayloads } = await import("../infra/outbound/deliver.js");
      const logRecovery = log.child("delivery-recovery");
      await recoverPendingDeliveries({
        deliver: deliverOutboundPayloads,
        log: logRecovery,
        cfg: cfgAtStart,
      });
    })().catch((err) => log.error(`Delivery recovery failed: ${String(err)}`));
  }

  const execApprovalManager = new ExecApprovalManager();
  const execApprovalForwarder = createExecApprovalForwarder();
  const execApprovalHandlers = createExecApprovalHandlers(execApprovalManager, {
    forwarder: execApprovalForwarder,
  });
  const pluginApprovalManager = new ExecApprovalManager<
    import("../../upstream/src/infra/plugin-approvals.js").PluginApprovalRequestPayload
  >();
  const pluginApprovalHandlers = createPluginApprovalHandlers(pluginApprovalManager, {
    forwarder: execApprovalForwarder,
  });
  // 暴露给 approval.ts 桥接层（模块级单例，server 启动后立即注入）
  setActivePluginApprovalManager(pluginApprovalManager);

  const canvasHostServerPort = (canvasHostServer as CanvasHostServer | null)?.port;

  attachGatewayWsHandlers({
    wss,
    clients,
    preauthConnectionBudget,
    port,
    gatewayHost: bindHost ?? undefined,
    canvasHostEnabled: Boolean(canvasHost),
    canvasHostServerPort,
    resolvedAuth,
    rateLimiter: authRateLimiter,
    gatewayMethods,
    events: GATEWAY_EVENTS,
    logGateway: log,
    logHealth,
    logWsControl,
    extraHandlers: {
      ...pluginRegistry.gatewayHandlers,
      ...execApprovalHandlers,
      ...pluginApprovalHandlers,
    },
    broadcast,
    context: {
      deps,
      cron,
      cronStorePath,
      execApprovalManager,
      loadGatewayModelCatalog,
      getHealthCache,
      refreshHealthSnapshot: refreshGatewayHealthSnapshot,
      logHealth,
      logGateway: log,
      incrementPresenceVersion,
      getHealthVersion,
      broadcast,
      broadcastToConnIds,
      nodeSendToSession,
      nodeSendToAllSubscribed,
      nodeSubscribe,
      nodeUnsubscribe,
      nodeUnsubscribeAll,
      hasConnectedMobileNode: hasMobileNodeConnected,
      hasExecApprovalClients: () => {
        for (const gatewayClient of clients) {
          const scopes = Array.isArray(gatewayClient.connect.scopes)
            ? gatewayClient.connect.scopes
            : [];
          if (scopes.includes("operator.admin") || scopes.includes("operator.approvals")) {
            return true;
          }
        }
        return false;
      },
      nodeRegistry,
      agentRunSeq,
      chatAbortControllers,
      chatAbortedRuns: chatRunState.abortedRuns,
      chatRunBuffers: chatRunState.buffers,
      chatDeltaSentAt: chatRunState.deltaSentAt,
      chatDeltaLastBroadcastLen: chatRunState.deltaLastBroadcastLen,
      addChatRun,
      removeChatRun,
      subscribeSessionEvents: sessionEventSubscribers.subscribe,
      unsubscribeSessionEvents: sessionEventSubscribers.unsubscribe,
      subscribeSessionMessageEvents: sessionMessageSubscribers.subscribe,
      unsubscribeSessionMessageEvents: sessionMessageSubscribers.unsubscribe,
      unsubscribeAllSessionEvents: (connId: string) => {
        sessionEventSubscribers.unsubscribe(connId);
        sessionMessageSubscribers.unsubscribeAll(connId);
      },
      getSessionEventSubscriberConnIds: sessionEventSubscribers.getAll,
      registerToolEventRecipient: toolEventRecipients.add,
      dedupe,
      wizardSessions,
      findRunningWizard,
      purgeWizardSession,
      getRuntimeSnapshot,
      startChannel,
      stopChannel,
      markChannelLoggedOut,
      wizardRunner,
      broadcastVoiceWakeChanged,
    },
  });
  await logGatewayStartup({
    cfg: cfgAtStart,
    bindHost,
    bindHosts: httpBindHosts,
    port,
    tlsEnabled: gatewayTls.enabled,
    log,
    isNixMode,
  });
  const stopGatewayUpdateCheck = minimalTestGateway
    ? () => {}
    : scheduleGatewayUpdateCheck({
        cfg: cfgAtStart,
        log,
        isNixMode,
        onUpdateAvailableChange: (updateAvailable) => {
          const payload: GatewayUpdateAvailableEventPayload = { updateAvailable };
          broadcast(GATEWAY_EVENT_UPDATE_AVAILABLE, payload, { dropIfSlow: true });
        },
      });
  const tailscaleCleanup = minimalTestGateway
    ? null
    : await startGatewayTailscaleExposure({
        tailscaleMode,
        resetOnExit: tailscaleConfig.resetOnExit,
        port,
        controlUiBasePath,
        logTailscale,
      });

  let browserControl: Awaited<ReturnType<typeof startBrowserControlServerIfEnabled>> = null;
  if (!minimalTestGateway) {
    ({ browserControl, pluginServices } = await startGatewaySidecars({
      cfg: cfgAtStart,
      pluginRegistry,
      defaultWorkspaceDir,
      deps,
      startChannels,
      log,
      logHooks,
      logChannels,
      logBrowser,
    }));
  }

  // Run gateway_start plugin hook (fire-and-forget)
  if (!minimalTestGateway) {
    const hookRunner = getGlobalHookRunner();
    if (hookRunner?.hasHooks("gateway_start")) {
      void hookRunner.runGatewayStart({ port }, { port }).catch((err) => {
        log.warn(`gateway_start hook failed: ${String(err)}`);
      });
    }
  }

  // 启动OAuth Token自动刷新守护进程
  if (!minimalTestGateway) {
    try {
      const { oauthRefreshDaemon } =
        await import("../agents/auth-profiles/oauth-refresh-daemon.js");
      oauthRefreshDaemon.start();
      log.info("OAuth refresh daemon started");
    } catch (err) {
      log.warn(`OAuth refresh daemon failed to start: ${String(err)}`);
    }
  }

  // 启动时迁移：将已有的 agent.channelBindings 同步到 cfg.bindings
  // 确保历史数据不丢失，版本升级后第一次启动即生效
  if (!minimalTestGateway) {
    try {
      const { channelManager } = await import("../channels/channel-manager.js");
      await channelManager.migrateAllAgentBindingsToCfg();
      log.info("Channel bindings migrated to cfg.bindings");
    } catch (err) {
      log.warn(`Channel bindings migration failed: ${String(err)}`);
    }
  }

  // 启动时自动归档过期已完成的任务（冷/热存储分离，保持调度性能）
  if (!minimalTestGateway) {
    try {
      const { archiveOldTasks } = await import("../tasks/storage.js");
      const { archived } = await archiveOldTasks();
      if (archived > 0) {
        log.info(`Task archive: moved ${archived} completed task(s) to cold storage`);
      }
    } catch (err) {
      log.warn(`Task archive on startup failed: ${String(err)}`);
    }
  }

  // 启动 Agent 任务唤醒调度器（定期扫描并唤醒有待办任务的 Agent）
  if (!minimalTestGateway) {
    try {
      startAgentTaskWakeScheduler();
      log.info("Agent task wake scheduler started");
    } catch (err) {
      log.warn(`Agent task wake scheduler failed to start: ${String(err)}`);
    }
  }

  // 启动任务老化检测调度器（每 10 分钟扫描待办池，防止任务沉淀）
  if (!minimalTestGateway) {
    try {
      initTaskAgingScheduler();
      log.info("Task aging scheduler started");
    } catch (err) {
      log.warn(`Task aging scheduler failed to start: ${String(err)}`);
    }
  }

  // 启动工作空间卫生自检调度器（每 24h 检查 MEMORY 大小/幺灵目录/当前文件等）
  if (!minimalTestGateway) {
    try {
      initMemoryHygieneScheduler();
      log.info("Memory hygiene scheduler started");
    } catch (err) {
      log.warn(`Memory hygiene scheduler failed to start: ${String(err)}`);
    }
  }

  // 初始化权限中间件：从各 agent 配置加载权限规则和审批流（fire-and-forget）
  if (!minimalTestGateway) {
    try {
      const { permissionMiddleware } = await import("../permissions/middleware.js");
      await permissionMiddleware.reload();
      log.info("Permission middleware initialized");
    } catch (err) {
      log.warn(`Permission middleware initialization failed: ${String(err)}`);
    }
  }

  // 启动插件热插拔监听（支持新增/移除插件无需重启）
  if (!minimalTestGateway) {
    try {
      const { startPluginHotReload } = await import("../plugins/plugin-hot-reload.js");
      startPluginHotReload({
        cfg: cfgAtStart,
        workspaceDir: defaultWorkspaceDir,
        log: {
          info: (msg) => log.info(msg),
          warn: (msg) => log.warn(msg),
          error: (msg) => log.error(msg),
        },
      });
      log.info("Plugin hot-reload watcher started");
    } catch (err) {
      log.warn(`Plugin hot-reload failed to start: ${String(err)}`);
    }
  }

  const configReloader = minimalTestGateway
    ? { stop: async () => {} }
    : (() => {
        const { applyHotReload, requestGatewayRestart } = createGatewayReloadHandlers({
          deps,
          broadcast,
          getState: () => ({
            hooksConfig,
            hookClientIpConfig,
            heartbeatRunner,
            cronState,
            browserControl,
            channelHealthMonitor,
          }),
          setState: (nextState) => {
            hooksConfig = nextState.hooksConfig;
            hookClientIpConfig = nextState.hookClientIpConfig;
            heartbeatRunner = nextState.heartbeatRunner;
            cronState = nextState.cronState;
            cron = cronState.cron;
            cronStorePath = cronState.storePath;
            browserControl = nextState.browserControl;
            channelHealthMonitor = nextState.channelHealthMonitor;
          },
          startChannel,
          stopChannel,
          logHooks,
          logBrowser,
          logChannels,
          logCron,
          logReload,
          createHealthMonitor: ({ checkIntervalMs, staleEventThresholdMs, maxRestartsPerHour }) =>
            startChannelHealthMonitor({
              channelManager,
              checkIntervalMs,
              staleEventThresholdMs,
              maxRestartsPerHour,
            }),
        });

        return startGatewayConfigReloader({
          initialConfig: cfgAtStart,
          readSnapshot: readConfigFileSnapshot,
          onHotReload: applyHotReload,
          onRestart: requestGatewayRestart,
          log: {
            info: (msg) => logReload.info(msg),
            warn: (msg) => logReload.warn(msg),
            error: (msg) => logReload.error(msg),
          },
          watchPath: CONFIG_PATH,
        });
      })();

  const close = createGatewayCloseHandler({
    bonjourStop,
    tailscaleCleanup,
    canvasHost,
    canvasHostServer,
    stopChannel,
    pluginServices,
    cron,
    heartbeatRunner,
    updateCheckStop: stopGatewayUpdateCheck,
    nodePresenceTimers,
    broadcast,
    tickInterval,
    healthInterval,
    dedupeCleanup,
    mediaCleanup: null,
    agentUnsub,
    heartbeatUnsub,
    transcriptUnsub: transcriptUnsub ?? null,
    lifecycleUnsub: lifecycleUnsub ?? null,
    chatRunState,
    clients,
    configReloader,
    browserControl,
    wss,
    httpServer,
    httpServers,
  });

  return {
    close: async (opts) => {
      // 停止插件热插拔监听
      try {
        const { stopPluginHotReload } = await import("../plugins/plugin-hot-reload.js");
        stopPluginHotReload();
        log.info("Plugin hot-reload watcher stopped");
      } catch (err) {
        log.warn(`Plugin hot-reload failed to stop: ${String(err)}`);
      }

      // 停止工作空间卫生调度器
      try {
        stopMemoryHygieneScheduler();
        log.info("Memory hygiene scheduler stopped");
      } catch (err) {
        log.warn(`Memory hygiene scheduler failed to stop: ${String(err)}`);
      }

      // 停止任务老化检测调度器
      try {
        stopAgingTaskScheduler();
        stopAgentTaskWakeScheduler();
        log.info("Task schedulers stopped");
      } catch (err) {
        log.warn(`Task schedulers failed to stop: ${String(err)}`);
      }

      // 停止OAuth刷新守护进程
      try {
        const { oauthRefreshDaemon } =
          await import("../agents/auth-profiles/oauth-refresh-daemon.js");
        oauthRefreshDaemon.stop();
        log.info("OAuth refresh daemon stopped");
      } catch (err) {
        log.warn(`OAuth refresh daemon failed to stop: ${String(err)}`);
      }

      // Run gateway_stop plugin hook before shutdown
      await runGlobalGatewayStopSafely({
        event: { reason: opts?.reason ?? "gateway stopping" },
        ctx: { port },
        onError: (err) => log.warn(`gateway_stop hook failed: ${String(err)}`),
      });
      if (diagnosticsEnabled) {
        stopDiagnosticHeartbeat();
      }
      if (skillsRefreshTimer) {
        clearTimeout(skillsRefreshTimer);
        skillsRefreshTimer = null;
      }
      skillsChangeUnsub();
      authRateLimiter?.dispose();
      channelHealthMonitor?.stop();
      await close(opts);
    },
  };
}
