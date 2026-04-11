import {
  GATEWAY_EVENT_UPDATE_AVAILABLE,
  type GatewayUpdateAvailableEventPayload,
} from "../../../src/gateway/events.js";
import {
  CHAT_SESSIONS_ACTIVE_MINUTES,
  clearPendingQueueItemsForRun,
  flushChatQueueForEvent,
} from "./app-chat.ts";

// 防抖定时器：防止 final 事件连续触发导致 loadChatHistory 请求风暴
let _loadChatHistoryDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoadChatHistory(host: GatewayHost, delayMs = 300) {
  if (_loadChatHistoryDebounceTimer !== null) {
    clearTimeout(_loadChatHistoryDebounceTimer);
  }
  _loadChatHistoryDebounceTimer = setTimeout(() => {
    _loadChatHistoryDebounceTimer = null;
    void loadChatHistory(host as unknown as OpenClawApp);
  }, delayMs);
}
import type { EventLogEntry } from "./app-events.ts";
import {
  applySettings,
  loadCron,
  refreshActiveTab,
  setLastActiveSessionKey,
} from "./app-settings.ts";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream.ts";
import type { OpenClawApp } from "./app.ts";
import { shouldReloadHistoryForFinalEvent } from "./chat-event-reload.ts";
import { formatConnectError } from "./connect-error.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadAssistantIdentity } from "./controllers/assistant-identity.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import {
  handleChatEvent,
  shouldAcceptEventForContext,
  type ChatEventPayload,
} from "./controllers/chat.ts";
import { loadDevices } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  parsePluginApprovalRequested,
  pruneExecApprovalQueue,
  removeExecApproval,
} from "./controllers/exec-approval.ts";
import { loadHealthState } from "./controllers/health.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadSessions, subscribeSessions } from "./controllers/sessions.ts";
import { GatewayBrowserClient } from "./gateway-client.js";
import {
  resolveGatewayErrorDetailCode,
  type GatewayEventFrame,
  type GatewayHelloOk,
} from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import { normalizeOptionalString } from "./string-coerce.ts";
import type {
  AgentsListResult,
  PresenceEntry,
  HealthSummary,
  StatusSummary,
  UpdateAvailable,
} from "./types.ts";

function isGenericBrowserFetchFailure(message: string): boolean {
  return /^(?:typeerror:\s*)?(?:fetch failed|failed to fetch)$/i.test(message.trim());
}

type GatewayHost = {
  settings: UiSettings;
  password: string;
  clientInstanceId: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  lastErrorCode: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  healthLoading: boolean;
  healthResult: HealthSummary | null;
  healthError: string | null;
  debugHealth: HealthSummary | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  serverVersion: string | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
  updateAvailable: UpdateAvailable | null;
};

type GatewayHostWithShutdownMessage = GatewayHost & {
  pendingShutdownMessage?: string | null;
  resumeChatQueueAfterReconnect?: boolean;
};

type ConnectGatewayOptions = {
  reason?: "initial" | "seq-gap";
};

export function resolveControlUiClientVersion(params: {
  gatewayUrl: string;
  serverVersion: string | null;
  pageUrl?: string;
}): string | undefined {
  const serverVersion = normalizeOptionalString(params.serverVersion);
  if (!serverVersion) {
    return undefined;
  }
  const pageUrl =
    params.pageUrl ?? (typeof window === "undefined" ? undefined : window.location.href);
  if (!pageUrl) {
    return undefined;
  }
  try {
    const page = new URL(pageUrl);
    const gateway = new URL(params.gatewayUrl, page);
    const allowedProtocols = new Set(["ws:", "wss:", "http:", "https:"]);
    if (!allowedProtocols.has(gateway.protocol) || gateway.host !== page.host) {
      return undefined;
    }
    return serverVersion;
  } catch {
    return undefined;
  }
}

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) {
    return raw;
  }
  if (!raw) {
    return mainSessionKey;
  }
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) {
    return;
  }
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

export function connectGateway(host: GatewayHost, options?: ConnectGatewayOptions) {
  const shutdownHost = host as GatewayHostWithShutdownMessage;
  const reconnectReason = options?.reason ?? "initial";
  shutdownHost.pendingShutdownMessage = null;
  shutdownHost.resumeChatQueueAfterReconnect = false;
  host.lastError = null;
  host.lastErrorCode = null;
  host.hello = null;
  host.connected = false;
  if (reconnectReason === "seq-gap") {
    host.execApprovalQueue = pruneExecApprovalQueue(host.execApprovalQueue);
    clearPendingQueueItemsForRun(
      host as unknown as Parameters<typeof clearPendingQueueItemsForRun>[0],
      host.chatRunId ?? undefined,
    );
    shutdownHost.resumeChatQueueAfterReconnect = true;
  } else {
    host.execApprovalQueue = pruneExecApprovalQueue(host.execApprovalQueue);
  }
  host.execApprovalError = null;

  const previousClient = host.client;
  const clientVersion = resolveControlUiClientVersion({
    gatewayUrl: host.settings.gatewayUrl,
    serverVersion: host.serverVersion,
  });
  const client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: normalizeOptionalString(host.settings.token) ? host.settings.token : undefined,
    password: normalizeOptionalString(host.password) ? host.password : undefined,
    clientName: "openclaw-control-ui",
    clientVersion,
    mode: "webchat",
    instanceId: host.clientInstanceId,
    onHello: (hello) => {
      if (host.client !== client) {
        return;
      }
      console.log("[DEBUG:Gateway] onHello received:", { serverVersion: hello.serverVersion, snapshotExists: !!hello.snapshot });
      shutdownHost.pendingShutdownMessage = null;
      host.connected = true;
      host.lastError = null;
      host.lastErrorCode = null;
      host.hello = hello;
      applySnapshot(host, hello);
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      if (shutdownHost.resumeChatQueueAfterReconnect) {
        shutdownHost.resumeChatQueueAfterReconnect = false;
        void flushChatQueueForEvent(
          host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
        );
      }
      console.log("[DEBUG:Gateway] triggering data loading...");
      void subscribeSessions(host as unknown as OpenClawApp);
      void loadAssistantIdentity(host as unknown as OpenClawApp);
      void loadAgents(host as unknown as OpenClawApp);
      void loadHealthState(host as unknown as OpenClawApp);
      void loadNodes(host as unknown as OpenClawApp, { quiet: true });
      void loadDevices(host as unknown as OpenClawApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]);
      // 加载当前会话存储路径
      void (host as unknown as OpenClawApp).loadStorageCurrentPath?.();
    },
    onClose: ({ code, reason, error }) => {
      if (host.client !== client) {
        return;
      }
      host.connected = false;
      host.lastErrorCode =
        resolveGatewayErrorDetailCode(error) ??
        (typeof error?.code === "string" ? error.code : null);
      if (code !== 1012) {
        if (error?.message) {
          host.lastError =
            host.lastErrorCode && isGenericBrowserFetchFailure(error.message)
              ? formatConnectError({
                  message: error.message,
                  details: error.details,
                  code: error.code,
                } as Parameters<typeof formatConnectError>[0])
              : error.message;
          return;
        }
        host.lastError =
          shutdownHost.pendingShutdownMessage ?? `disconnected (${code}): ${reason || "no reason"}`;
      } else {
        host.lastError = shutdownHost.pendingShutdownMessage ?? null;
        host.lastErrorCode = null;
      }
    },
    onEvent: (evt) => {
      if (host.client !== client) {
        return;
      }
      handleGatewayEvent(host, evt);
    },
    onGap: ({ expected, received }) => {
      if (host.client !== client) {
        return;
      }
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); reconnecting`;
      host.lastErrorCode = null;
      connectGateway(host, { reason: "seq-gap" });
    },
  });
  host.client = client;
  previousClient?.stop();
  client.start();
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleTerminalChatEvent(
  host: GatewayHost,
  payload: ChatEventPayload | undefined,
  state: ReturnType<typeof handleChatEvent>,
): boolean {
  if (state !== "final" && state !== "error" && state !== "aborted") {
    return false;
  }
  const toolHost = host as unknown as Parameters<typeof resetToolStream>[0];
  const hadToolEvents = toolHost.toolStreamOrder.length > 0;
  resetToolStream(toolHost);
  clearPendingQueueItemsForRun(
    host as unknown as Parameters<typeof clearPendingQueueItemsForRun>[0],
    payload?.runId,
  );
  void flushChatQueueForEvent(host as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
  const runId = payload?.runId;
  if (runId && host.refreshSessionsAfterChat.has(runId)) {
    host.refreshSessionsAfterChat.delete(runId);
    if (state === "final") {
      void loadSessions(host as unknown as OpenClawApp, {
        activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
      });
    }
  }
  if (hadToolEvents && state === "final") {
    void loadChatHistory(host as unknown as OpenClawApp);
    return true;
  }
  return false;
}

function handleChatGatewayEvent(host: GatewayHost, payload: ChatEventPayload | undefined) {
  if (payload?.sessionKey) {
    setLastActiveSessionKey(
      host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
      payload.sessionKey,
    );
  }

  // Z2: 上下文感知的事件路由
  const appHost = host as unknown as OpenClawApp;
  const currentContext = appHost.chatNavCurrentContext ?? null;

  // Z2 + Z4: 无论是否匹配当前上下文，都更新未读计数
  if (
    payload?.sessionKey &&
    payload.state === "final" &&
    !shouldAcceptEventForContext(payload.sessionKey, host.sessionKey, currentContext)
  ) {
    const prev =
      (appHost as unknown as { unreadSessionMessages: Record<string, number> })
        .unreadSessionMessages ?? {};
    const next = { ...prev };
    next[payload.sessionKey] = (next[payload.sessionKey] ?? 0) + 1;
    (
      appHost as unknown as { unreadSessionMessages: Record<string, number> }
    ).unreadSessionMessages = next;
  }

  const state = handleChatEvent(host as unknown as OpenClawApp, payload, currentContext);
  const historyReloaded = handleTerminalChatEvent(host, payload, state);
  if (state === "final" && !historyReloaded && shouldReloadHistoryForFinalEvent(payload)) {
    debouncedLoadChatHistory(host);
  }
  // Z4: 外部通道产生了新消息（未读），刷新 sessions 列表
  if (
    state === "final" &&
    payload?.sessionKey &&
    !shouldAcceptEventForContext(payload.sessionKey, host.sessionKey, currentContext)
  ) {
    void loadSessions(host as unknown as OpenClawApp);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "debug" || host.tab === "overview") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) {
      return;
    }
    handleAgentEvent(
      host as unknown as Parameters<typeof handleAgentEvent>[0],
      evt.payload as AgentEventPayload | undefined,
    );
    return;
  }

  if (evt.event === "chat") {
    handleChatGatewayEvent(host, evt.payload as ChatEventPayload | undefined);
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "shutdown") {
    const payload = evt.payload as { reason?: unknown; restartExpectedMs?: unknown } | undefined;
    const reason = normalizeOptionalString(payload?.reason) ?? "gateway stopping";
    const shutdownMessage =
      typeof payload?.restartExpectedMs === "number"
        ? `Restarting: ${reason}`
        : `Disconnected: ${reason}`;
    (host as GatewayHostWithShutdownMessage).pendingShutdownMessage = shutdownMessage;
    host.lastError = shutdownMessage;
    host.lastErrorCode = null;
    return;
  }

  if (evt.event === "sessions.changed") {
    void loadSessions(host as unknown as OpenClawApp);
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as OpenClawApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
    return;
  }

  if (evt.event === "plugin.approval.requested") {
    const entry = parsePluginApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "plugin.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
    return;
  }

  if (evt.event === GATEWAY_EVENT_UPDATE_AVAILABLE) {
    const payload = evt.payload as GatewayUpdateAvailableEventPayload | undefined;
    host.updateAvailable = payload?.updateAvailable ?? null;
  }

  if (evt.event === "group.chat.message") {
    const payload = evt.payload as { groupId?: string } | undefined;
    const groupId = payload?.groupId ? String(payload.groupId) : null;
    if (groupId) {
      const isGroupSession = host.sessionKey.includes(`:group:${groupId}`);
      if (isGroupSession) {
        void loadChatHistory(host as unknown as OpenClawApp);
      }
    }
    return;
  }
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSummary;
        sessionDefaults?: SessionDefaultsSnapshot;
        updateAvailable?: UpdateAvailable;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
    host.healthResult = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
  host.updateAvailable = snapshot?.updateAvailable ?? null;
}
