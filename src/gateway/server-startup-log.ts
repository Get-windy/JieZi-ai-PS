import chalk from "chalk";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../upstream/src/agents/defaults.js";
import { resolveConfiguredModelRef } from "../../upstream/src/agents/model-selection.js";
import type { loadConfig } from "../../upstream/src/config/config.js";
import { getResolvedLoggerSettings } from "../../upstream/src/logging.js";
import { collectEnabledInsecureOrDangerousFlags } from "../security/dangerous-config-flags.js";
import {
  resolveDefaultAgentId,
  resolveAgentEffectiveModelPrimary,
} from "../agents/agent-scope.js";

export async function logGatewayStartup(params: {
  cfg: ReturnType<typeof loadConfig>;
  bindHost: string;
  bindHosts?: string[];
  port: number;
  tlsEnabled?: boolean;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string) => void };
  isNixMode: boolean;
}) {
  // Resolve fallback defaults dynamically from the default agent's effective model
  // to avoid falling back to stale hardcoded provider/model (e.g. anthropic/claude-opus-4-6).
  const defaultAgentId = resolveDefaultAgentId(params.cfg);
  const effectiveModelRef = resolveAgentEffectiveModelPrimary(params.cfg, defaultAgentId);
  let fallbackProvider = DEFAULT_PROVIDER;
  let fallbackModel = DEFAULT_MODEL;
  if (effectiveModelRef) {
    const slashIdx = effectiveModelRef.indexOf("/");
    if (slashIdx !== -1) {
      fallbackProvider = effectiveModelRef.slice(0, slashIdx);
      fallbackModel = effectiveModelRef.slice(slashIdx + 1);
    }
  }
  const { provider: agentProvider, model: agentModel } = resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: fallbackProvider,
    defaultModel: fallbackModel,
  });
  const modelRef = `${agentProvider}/${agentModel}`;
  params.log.info(`agent model: ${modelRef}`, {
    consoleMessage: `agent model: ${chalk.whiteBright(modelRef)}`,
  });
  const scheme = params.tlsEnabled ? "wss" : "ws";
  const formatHost = (host: string) => (host.includes(":") ? `[${host}]` : host);
  const hosts =
    params.bindHosts && params.bindHosts.length > 0 ? params.bindHosts : [params.bindHost];
  const listenEndpoints = hosts.map((host) => `${scheme}://${formatHost(host)}:${params.port}`);
  params.log.info(`listening on ${listenEndpoints.join(", ")} (PID ${process.pid})`);
  params.log.info(`log file: ${getResolvedLoggerSettings().file}`);
  if (params.isNixMode) {
    params.log.info("gateway: running in Nix mode (config managed externally)");
  }

  const enabledDangerousFlags = collectEnabledInsecureOrDangerousFlags(params.cfg);
  if (enabledDangerousFlags.length > 0) {
    const warning =
      `security warning: dangerous config flags enabled: ${enabledDangerousFlags.join(", ")}. ` +
      "Run `openclaw security audit`.";
    params.log.warn(warning);
  }

  // Auto-open Control UI in browser if enabled (默认值改为 true)
  const autoOpen = params.cfg.gateway?.controlUi?.autoOpen ?? true; // 修改：默认为 true
  const controlUiEnabled = params.cfg.gateway?.controlUi?.enabled ?? true;
  if (autoOpen && controlUiEnabled) {
    const { resolveGatewayPort } = await import("../../upstream/src/config/config.js");
    const { resolveControlUiLinks } = await import("../commands/onboard-helpers.js");
    const { detectBrowserOpenSupport, openUrl } = await import("../commands/onboard-helpers.js");

    const bind = params.cfg.gateway?.bind ?? "loopback";
    const basePath = params.cfg.gateway?.controlUi?.basePath;
    const customBindHost = params.cfg.gateway?.customBindHost;
    const token = params.cfg.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";

    const links = resolveControlUiLinks({
      port: resolveGatewayPort(params.cfg),
      bind: bind === "lan" ? "loopback" : bind,
      customBindHost,
      basePath,
    });

    const dashboardUrl = token
      ? `${links.httpUrl}#token=${encodeURIComponent(token)}`
      : links.httpUrl;

    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      const opened = await openUrl(dashboardUrl);
      if (opened) {
        params.log.info("control UI opened in browser automatically");
      } else {
        params.log.warn("failed to auto-open control UI in browser");
      }
    } else {
      params.log.warn("browser auto-open not supported on this platform");
    }
  }
}
