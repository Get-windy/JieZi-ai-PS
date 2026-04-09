import { roleScopesAllow } from "../../../src/shared/operator-scope-compat.js";
import { refreshChat } from "./app-chat.ts";
import {
  startLogsPolling,
  stopLogsPolling,
  startDebugPolling,
  stopDebugPolling,
  stopMonitorPolling,
} from "./app-polling.ts";
import { scheduleChatScroll, scheduleLogsScroll } from "./app-scroll.ts";
import type { OpenClawApp } from "./app.ts";
import { loadAgentFiles } from "./controllers/agent-files.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadApprovals, loadApprovalStats } from "./controllers/approvals.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadConfig, loadConfigSchema } from "./controllers/config.ts";
import { loadCronJobs, loadCronRuns, loadCronStatus } from "./controllers/cron.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadDevices } from "./controllers/devices.ts";
import { loadDreamDiary, loadDreamingStatus } from "./controllers/dreaming.ts";
import { loadExecApprovals } from "./controllers/exec-approvals.ts";
import { loadFriends } from "./controllers/friends.ts";
import { loadGroups } from "./controllers/groups.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadQueueStatus, loadQueueStats } from "./controllers/message-queue.ts";
import { loadModels } from "./controllers/models.js";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import { loadSessions } from "./controllers/sessions.ts";
import { loadSkills } from "./controllers/skills.ts";
import { loadSuperAdmins } from "./controllers/super-admin.ts";
import { loadUsage } from "./controllers/usage.ts";
import {
  inferBasePathFromPathname,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  tabFromPath,
  type Tab,
} from "./navigation.ts";
import { saveSettings, type UiSettings } from "./storage.ts";
import { normalizeOptionalString } from "./string-coerce.ts";
import { startThemeTransition, type ThemeTransitionContext } from "./theme-transition.ts";
import { resolveTheme, type ResolvedTheme, type ThemeMode, type ThemeName } from "./theme.ts";
import type { AgentsListResult, AttentionItem } from "./types.ts";
import { resetChatViewState } from "./views/chat.ts";

type SettingsHost = {
  settings: UiSettings;
  password?: string;
  theme: ThemeName;
  themeMode: ThemeMode;
  themeResolved: ResolvedTheme;
  applySessionKey: string;
  sessionKey: string;
  tab: Tab;
  connected: boolean;
  chatHasAutoScrolled: boolean;
  logsAtBottom: boolean;
  eventLog: unknown[];
  eventLogBuffer: unknown[];
  basePath: string;
  agentsList?: AgentsListResult | null;
  agentsSelectedId?: string | null;
  agentsPanel?: "overview" | "files" | "tools" | "skills" | "channels" | "cron";
  pendingGatewayUrl?: string | null;
  systemThemeCleanup?: (() => void) | null;
  pendingGatewayToken?: string | null;
  dreamingStatusLoading: boolean;
  dreamingStatusError: string | null;
  dreamingStatus: import("./controllers/dreaming.js").DreamingStatus | null;
  dreamingModeSaving: boolean;
  dreamDiaryLoading: boolean;
  dreamDiaryError: string | null;
  dreamDiaryPath: string | null;
  dreamDiaryContent: string | null;
};

export function applySettings(host: SettingsHost, next: UiSettings) {
  const normalized = {
    ...next,
    lastActiveSessionKey:
      normalizeOptionalString(next.lastActiveSessionKey) ??
      normalizeOptionalString(next.sessionKey) ??
      "main",
  };
  host.settings = normalized;
  saveSettings(normalized);
  if (next.theme !== host.theme || next.themeMode !== host.themeMode) {
    host.theme = next.theme;
    host.themeMode = next.themeMode;
    applyResolvedTheme(host, resolveTheme(next.theme, next.themeMode));
  }
  applyBorderRadius(next.borderRadius);
  host.applySessionKey = host.settings.lastActiveSessionKey;
}

export function setLastActiveSessionKey(host: SettingsHost, next: string) {
  const trimmed = next.trim();
  if (!trimmed) {
    return;
  }
  if (host.settings.lastActiveSessionKey === trimmed) {
    return;
  }
  applySettings(host, { ...host.settings, lastActiveSessionKey: trimmed });
}

/** Set to true when the token is read from a query string (?token=) instead of a URL fragment. */
export let warnQueryToken = false;

export function applySettingsFromUrl(host: SettingsHost) {
  if (!window.location.search && !window.location.hash) {
    return;
  }
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

  const gatewayUrlRaw = params.get("gatewayUrl") ?? hashParams.get("gatewayUrl");
  const nextGatewayUrl = normalizeOptionalString(gatewayUrlRaw) ?? "";
  const gatewayUrlChanged = Boolean(nextGatewayUrl && nextGatewayUrl !== host.settings.gatewayUrl);
  // Prefer fragment tokens over query tokens. Fragments avoid server-side request
  // logs and referrer leakage; query-param tokens remain a one-time legacy fallback
  // for compatibility with older deep links.
  const queryToken = params.get("token");
  const hashToken = hashParams.get("token");
  const tokenRaw = hashToken ?? queryToken;
  const passwordRaw = params.get("password") ?? hashParams.get("password");
  const sessionRaw = params.get("session") ?? hashParams.get("session");
  const token = normalizeOptionalString(tokenRaw);
  const session = normalizeOptionalString(sessionRaw);
  const shouldResetSessionForToken = Boolean(token && !session && !gatewayUrlChanged);
  let shouldCleanUrl = false;

  if (params.has("token")) {
    params.delete("token");
    shouldCleanUrl = true;
  }

  if (tokenRaw != null) {
    if (queryToken != null) {
      warnQueryToken = true;
      console.warn(
        "[openclaw] Auth token passed as query parameter (?token=). Use URL fragment instead: #token=<token>. Query parameters may appear in server logs.",
      );
    }
    if (token && gatewayUrlChanged) {
      host.pendingGatewayToken = token;
    } else if (token && token !== host.settings.token) {
      applySettings(host, { ...host.settings, token });
    }
    hashParams.delete("token");
    shouldCleanUrl = true;
  }

  if (shouldResetSessionForToken) {
    host.sessionKey = "main";
    applySettings(host, {
      ...host.settings,
      sessionKey: "main",
      lastActiveSessionKey: "main",
    });
  }

  if (passwordRaw != null) {
    // Never hydrate password from URL params; strip only.
    params.delete("password");
    hashParams.delete("password");
    shouldCleanUrl = true;
  }

  if (sessionRaw != null) {
    if (session) {
      host.sessionKey = session;
      applySettings(host, {
        ...host.settings,
        sessionKey: session,
        lastActiveSessionKey: session,
      });
    }
  }

  if (gatewayUrlRaw != null) {
    if (gatewayUrlChanged) {
      host.pendingGatewayUrl = nextGatewayUrl;
      if (!token) {
        host.pendingGatewayToken = null;
      }
    } else {
      host.pendingGatewayUrl = null;
      host.pendingGatewayToken = null;
    }
    params.delete("gatewayUrl");
    hashParams.delete("gatewayUrl");
    shouldCleanUrl = true;
  }

  if (!shouldCleanUrl) {
    return;
  }
  url.search = params.toString();
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  window.history.replaceState({}, "", url.toString());
}

export function setTab(host: SettingsHost, next: Tab) {
  applyTabSelection(host, next, { refreshPolicy: "always", syncUrl: true });
}

export function setTheme(host: SettingsHost, next: ThemeName, context?: ThemeTransitionContext) {
  const resolved = resolveTheme(next, host.themeMode);
  const applyTheme = () => {
    applySettings(host, { ...host.settings, theme: next });
  };
  startThemeTransition({
    nextTheme: resolved,
    applyTheme,
    context,
    currentTheme: host.themeResolved,
  });
  syncSystemThemeListener(host);
}

export function setThemeMode(
  host: SettingsHost,
  next: ThemeMode,
  context?: ThemeTransitionContext,
) {
  const resolved = resolveTheme(host.theme, next);
  const applyMode = () => {
    applySettings(host, { ...host.settings, themeMode: next });
  };
  startThemeTransition({
    nextTheme: resolved,
    applyTheme: applyMode,
    context,
    currentTheme: host.themeResolved,
  });
  syncSystemThemeListener(host);
}

export async function refreshActiveTab(host: SettingsHost) {
  if (host.tab === "overview") {
    await loadOverview(host);
  }
  if (host.tab === "channels") {
    await loadChannelsTab(host);
  }
  if (host.tab === "models") {
    await loadModelsTab(host);
  }
  if (host.tab === "instances") {
    await loadPresence(host as unknown as OpenClawApp);
  }
  if (host.tab === "usage") {
    await loadUsage(host as unknown as OpenClawApp);
  }
  if (host.tab === "sessions") {
    await loadSessions(host as unknown as OpenClawApp);
  }
  if (host.tab === "cron") {
    await loadCron(host);
  }
  if (host.tab === "skills") {
    await loadSkills(host as unknown as OpenClawApp);
  }
  if (host.tab === "agents") {
    await loadAgents(host as unknown as OpenClawApp);
    await loadConfig(host as unknown as OpenClawApp);
    const agentIds = host.agentsList?.agents?.map((entry) => entry.id) ?? [];
    if (agentIds.length > 0) {
      void loadAgentIdentities(host as unknown as OpenClawApp, agentIds);
    }
    const agentId =
      host.agentsSelectedId ?? host.agentsList?.defaultId ?? host.agentsList?.agents?.[0]?.id;
    if (agentId) {
      void loadAgentIdentity(host as unknown as OpenClawApp, agentId);
      if (host.agentsPanel === "files") {
        void loadAgentFiles(host as unknown as OpenClawApp, agentId);
      }
      if (host.agentsPanel === "skills") {
        void loadAgentSkills(host as unknown as OpenClawApp, agentId);
      }
      if (host.agentsPanel === "channels") {
        void loadChannels(host as unknown as OpenClawApp, false);
      }
      if (host.agentsPanel === "cron") {
        void loadCron(host);
      }
    }
  }
  if (host.tab === "nodes") {
    await loadNodes(host as unknown as OpenClawApp);
    await loadDevices(host as unknown as OpenClawApp);
    await loadConfig(host as unknown as OpenClawApp);
    await loadExecApprovals(host as unknown as OpenClawApp);
  }
  if (host.tab === "dreams") {
    await loadConfig(host as unknown as OpenClawApp);
    await Promise.all([
      loadDreamingStatus(host as unknown as OpenClawApp),
      loadDreamDiary(host as unknown as OpenClawApp),
    ]);
  }
  if (host.tab === "chat") {
    // 第一步：并发加载所有辅助数据（通道、群组、好友、会话列表）
    // 必须先加载完成，确保导航树有完整数据
    const app = host as unknown as OpenClawApp;
    const agentId = app.agentsList?.defaultId ?? "main";
    await Promise.all([
      !app.channelsSnapshot ? loadChannels(app, false) : Promise.resolve(),
      !app.groupsList ? loadGroups(app, app.client) : Promise.resolve(),
      app.friendsList?.length === 0 ? loadFriends(app, agentId) : Promise.resolve(),
      loadSessions(app as unknown as import("./controllers/sessions.ts").SessionsState),
    ]);
    // 第二步：辅助数据加载完成后再刷新聊天
    await refreshChat(host as unknown as Parameters<typeof refreshChat>[0]);
    scheduleChatScroll(
      host as unknown as Parameters<typeof scheduleChatScroll>[0],
      !host.chatHasAutoScrolled,
    );
  }
  if (
    host.tab === "config" ||
    host.tab === "communications" ||
    host.tab === "appearance" ||
    host.tab === "automation" ||
    host.tab === "infrastructure" ||
    host.tab === "aiAgents"
  ) {
    await loadConfigSchema(host as unknown as OpenClawApp);
    await loadConfig(host as unknown as OpenClawApp);
  }
  if (host.tab === "debug") {
    await loadDebug(host as unknown as OpenClawApp);
    host.eventLog = host.eventLogBuffer;
  }
  if (host.tab === "logs") {
    host.logsAtBottom = true;
    await loadLogs(host as unknown as OpenClawApp, { reset: true });
    scheduleLogsScroll(host as unknown as Parameters<typeof scheduleLogsScroll>[0], true);
  }
  if (host.tab === "message-queue") {
    await loadQueueStatus(host as unknown as OpenClawApp);
    await loadQueueStats(host as unknown as OpenClawApp);
  }
  if (host.tab === "organization-permissions") {
    // 切换到组织与权限页面时，自动加载组织数据
    void import("./app-render.js")
      .then(async (_m) => {
        const app = host as unknown as OpenClawApp;
        if (app.client && !app.organizationDataLoading) {
          app.organizationDataLoading = true;
          app.organizationDataError = null;
          try {
            const result = await app.client.request("org.list", {
              includeDepartments: true,
              includeTeams: true,
              includeReporting: true,
            });
            const agentNodes = (app.agentsList?.agents || []).map((a) => ({
              id: a.id,
              name: (a as { name?: string }).name || a.id,
              permissionLevel: 1,
            }));
            app.organizationData = {
              organizations: (result?.departments || []).map((d, i) => ({
                id: d.id,
                name: d.name,
                description: d.description,
                parentId: d.parentId,
                level: i,
                createdAt: d.createdAt || Date.now(),
                agentCount: (d.memberIds || []).length,
              })),
              teams: (result?.teams || []).map((t) => ({
                id: t.id,
                name: t.name,
                organizationId: t.parentId || "",
                leaderId: t.managerId,
                memberIds: t.memberIds || [],
                createdAt: t.createdAt || Date.now(),
              })),
              agents: agentNodes,
              relationships: (result?.reportingLines || []).map((r) => ({
                sourceId: r.subordinateId,
                targetId: r.supervisorId,
                type: "reports_to" as const,
              })),
              statistics: {
                totalOrganizations: (result?.departments || []).length,
                totalTeams: (result?.teams || []).length,
                totalAgents: agentNodes.length,
                averageTeamSize: 0,
                permissionDistribution: {},
              },
            };
          } catch (err) {
            app.organizationDataError = String(err);
          } finally {
            app.organizationDataLoading = false;
          }
        }
      })
      .catch((err) => console.warn("Failed to load org data:", err));
    await loadApprovals(host as unknown as OpenClawApp);
    await loadApprovalStats(host as unknown as OpenClawApp);
    await loadSuperAdmins(host as unknown as OpenClawApp);
  }
  if (host.tab === "collaboration") {
    await loadGroups(host as unknown as OpenClawApp, (host as unknown as OpenClawApp).client);
  }
}

export function inferBasePath() {
  if (typeof window === "undefined") {
    return "";
  }
  const configured = window.__OPENCLAW_CONTROL_UI_BASE_PATH__;
  const normalizedConfigured = normalizeOptionalString(configured);
  if (normalizedConfigured) {
    return normalizeBasePath(normalizedConfigured);
  }
  return inferBasePathFromPathname(window.location.pathname);
}

export function syncThemeWithSettings(host: SettingsHost) {
  host.theme = host.settings.theme ?? "claw";
  host.themeMode = host.settings.themeMode ?? "system";
  applyResolvedTheme(host, resolveTheme(host.theme, host.themeMode));
  applyBorderRadius(host.settings.borderRadius ?? 50);
  syncSystemThemeListener(host);
}

export function applyResolvedTheme(host: SettingsHost, resolved: ResolvedTheme) {
  host.themeResolved = resolved;
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const themeMode = resolved.endsWith("light") ? "light" : "dark";
  root.dataset.theme = resolved;
  root.dataset.themeMode = themeMode;
  root.style.colorScheme = themeMode;
}

export function attachThemeListener(host: SettingsHost) {
  syncSystemThemeListener(host);
}

export function detachThemeListener(host: SettingsHost) {
  host.systemThemeCleanup?.();
  host.systemThemeCleanup = null;
}

const BASE_RADII = { sm: 6, md: 10, lg: 14, xl: 20, full: 9999, default: 10 };

export function applyBorderRadius(value: number) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const scale = value / 50;
  root.style.setProperty("--radius-sm", `${Math.round(BASE_RADII.sm * scale)}px`);
  root.style.setProperty("--radius-md", `${Math.round(BASE_RADII.md * scale)}px`);
  root.style.setProperty("--radius-lg", `${Math.round(BASE_RADII.lg * scale)}px`);
  root.style.setProperty("--radius-xl", `${Math.round(BASE_RADII.xl * scale)}px`);
  root.style.setProperty("--radius-full", `${Math.round(BASE_RADII.full * scale)}px`);
  root.style.setProperty("--radius", `${Math.round(BASE_RADII.default * scale)}px`);
}

function syncSystemThemeListener(host: SettingsHost) {
  // Clean up existing listener if mode is not "system"
  if (host.themeMode !== "system") {
    host.systemThemeCleanup?.();
    host.systemThemeCleanup = null;
    return;
  }

  // Skip if listener already attached for this host
  if (host.systemThemeCleanup) {
    return;
  }

  if (typeof globalThis.matchMedia !== "function") {
    return;
  }

  const mql = globalThis.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (host.themeMode !== "system") {
      return;
    }
    applyResolvedTheme(host, resolveTheme(host.theme, "system"));
  };
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    host.systemThemeCleanup = () => mql.removeEventListener("change", onChange);
    return;
  }
  if (typeof mql.addListener === "function") {
    mql.addListener(onChange);
    host.systemThemeCleanup = () => mql.removeListener(onChange);
  }
}

export function syncTabWithLocation(host: SettingsHost, replace: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const resolved = tabFromPath(window.location.pathname, host.basePath) ?? "chat";
  setTabFromRoute(host, resolved);
  syncUrlWithTab(host, resolved, replace);
}

export function onPopState(host: SettingsHost) {
  if (typeof window === "undefined") {
    return;
  }
  const resolved = tabFromPath(window.location.pathname, host.basePath);
  if (!resolved) {
    return;
  }

  const url = new URL(window.location.href);
  const session = normalizeOptionalString(url.searchParams.get("session"));
  if (session) {
    host.sessionKey = session;
    applySettings(host, {
      ...host.settings,
      sessionKey: session,
      lastActiveSessionKey: session,
    });
  }

  setTabFromRoute(host, resolved);
}

export function setTabFromRoute(host: SettingsHost, next: Tab) {
  applyTabSelection(host, next, { refreshPolicy: "connected" });
}

function applyTabSelection(
  host: SettingsHost,
  next: Tab,
  options: { refreshPolicy: "always" | "connected"; syncUrl?: boolean },
) {
  const prev = host.tab;
  if (host.tab !== next) {
    host.tab = next;
  }

  // Cleanup chat module state when navigating away from chat
  if (prev === "chat" && next !== "chat") {
    resetChatViewState();
  }

  if (next === "chat") {
    host.chatHasAutoScrolled = false;
  }
  if (next === "logs") {
    startLogsPolling(host as unknown as Parameters<typeof startLogsPolling>[0]);
  } else {
    stopLogsPolling(host as unknown as Parameters<typeof stopLogsPolling>[0]);
  }
  if (next === "debug") {
    startDebugPolling(host as unknown as Parameters<typeof startDebugPolling>[0]);
  } else {
    stopDebugPolling(host as unknown as Parameters<typeof stopDebugPolling>[0]);
  }
  // 离开 chat 页面时停止监控轮询
  if (next !== "chat") {
    stopMonitorPolling(host as unknown as Parameters<typeof stopMonitorPolling>[0]);
  }
  if (next === "models") {
    // 切换到模型管理页面时，启动自动刷新
    void import("./controllers/models.js").then(({ startModelsAutoRefresh }) => {
      startModelsAutoRefresh(host as unknown as Parameters<typeof startModelsAutoRefresh>[0]);
    });
  } else {
    void import("./controllers/models.js").then(({ stopModelsAutoRefresh }) => {
      stopModelsAutoRefresh();
    });
  }
  // 解析 usage 页面的 URL 参数
  if (next === "usage" && typeof window !== "undefined") {
    const url = new URL(window.location.href);
    const provider = url.searchParams.get("provider")?.trim() || null;
    (host as unknown as { usageFilterProvider: string | null }).usageFilterProvider = provider;
    (host as unknown as { usageShowProviderOverview: boolean }).usageShowProviderOverview =
      !provider;
  }

  if (options.refreshPolicy === "always" || host.connected) {
    void refreshActiveTab(host);
  }

  if (options.syncUrl) {
    syncUrlWithTab(host, next, false);
  }
}

export function syncUrlWithTab(host: SettingsHost, tab: Tab, replace: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const targetPath = normalizePath(pathForTab(tab, host.basePath));
  const currentPath = normalizePath(window.location.pathname);
  const url = new URL(window.location.href);

  if (tab === "chat" && host.sessionKey) {
    url.searchParams.set("session", host.sessionKey);
  } else {
    url.searchParams.delete("session");
  }

  if (currentPath !== targetPath) {
    url.pathname = targetPath;
  }

  if (replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

export function syncUrlWithSessionKey(host: SettingsHost, sessionKey: string, replace: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionKey);
  if (replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

export async function loadOverview(host: SettingsHost) {
  const app = host as unknown as OpenClawApp;
  await Promise.allSettled([
    loadChannels(app, false),
    loadPresence(app),
    loadSessions(app),
    loadCronStatus(app),
    loadCronJobs(app),
    loadDebug(app),
    loadSkills(app),
    loadUsage(app),
    loadOverviewLogs(app),
    // 加载系统工作空间根目录
    (async () => {
      try {
        if (!app.client) {
          return;
        }
        const result = await app.client.request("agent.workspace.getDefault", {});
        if (result) {
          (app as unknown as { workspacesDir: string }).workspacesDir =
            (result as { defaultWorkspace?: string }).defaultWorkspace ?? "";
        }
      } catch {
        /* 未连接时忽略 */
      }
    })(),
  ]);
  buildAttentionItems(app);
}

export function hasOperatorReadAccess(
  auth: { role?: string; scopes?: readonly string[] } | null,
): boolean {
  if (!auth?.scopes) {
    return false;
  }
  return roleScopesAllow({
    role: auth.role ?? "operator",
    requestedScopes: ["operator.read"],
    allowedScopes: auth.scopes,
  });
}

export function hasMissingSkillDependencies(
  missing: Record<string, unknown> | null | undefined,
): boolean {
  if (!missing) {
    return false;
  }
  return Object.values(missing).some((value) => Array.isArray(value) && value.length > 0);
}

async function loadOverviewLogs(host: OpenClawApp) {
  if (!host.client || !host.connected) {
    return;
  }
  try {
    const res = await host.client.request("logs.tail", {
      cursor: host.overviewLogCursor || undefined,
      limit: 100,
      maxBytes: 50_000,
    });
    const payload = res as {
      cursor?: number;
      lines?: unknown;
    };
    const lines = Array.isArray(payload.lines)
      ? payload.lines.filter((line): line is string => typeof line === "string")
      : [];
    host.overviewLogLines = [...host.overviewLogLines, ...lines].slice(-500);
    if (typeof payload.cursor === "number") {
      host.overviewLogCursor = payload.cursor;
    }
  } catch {
    /* non-critical */
  }
}

function buildAttentionItems(host: OpenClawApp) {
  const items: AttentionItem[] = [];

  if (host.lastError) {
    items.push({
      severity: "error",
      icon: "x",
      title: "Gateway Error",
      description: host.lastError,
    });
  }

  const hello = host.hello;
  const auth = (hello as { auth?: { role?: string; scopes?: string[] } } | null)?.auth ?? null;
  if (auth?.scopes && !hasOperatorReadAccess(auth)) {
    items.push({
      severity: "warning",
      icon: "key",
      title: "Missing operator.read scope",
      description:
        "This connection does not have the operator.read scope. Some features may be unavailable.",
      href: "https://docs.openclaw.ai/web/dashboard",
      external: true,
    });
  }

  const skills = host.skillsReport?.skills ?? [];
  const missingDeps = skills.filter((s) => !s.disabled && hasMissingSkillDependencies(s.missing));
  if (missingDeps.length > 0) {
    const names = missingDeps.slice(0, 3).map((s) => s.name);
    const more = missingDeps.length > 3 ? ` +${missingDeps.length - 3} more` : "";
    items.push({
      severity: "warning",
      icon: "zap",
      title: "Skills with missing dependencies",
      description: `${names.join(", ")}${more}`,
    });
  }

  const blocked = skills.filter((s) => s.blockedByAllowlist);
  if (blocked.length > 0) {
    items.push({
      severity: "warning",
      icon: "shield",
      title: `${blocked.length} skill${blocked.length > 1 ? "s" : ""} blocked`,
      description: blocked.map((s) => s.name).join(", "),
    });
  }

  const cronJobs = host.cronJobs ?? [];
  const failedCron = cronJobs.filter((j) => j.state?.lastStatus === "error");
  if (failedCron.length > 0) {
    items.push({
      severity: "error",
      icon: "clock",
      title: `${failedCron.length} cron job${failedCron.length > 1 ? "s" : ""} failed`,
      description: failedCron.map((j) => j.name).join(", "),
    });
  }

  const now = Date.now();
  const overdue = cronJobs.filter(
    (j) => j.enabled && j.state?.nextRunAtMs != null && now - j.state.nextRunAtMs > 300_000,
  );
  if (overdue.length > 0) {
    items.push({
      severity: "warning",
      icon: "clock",
      title: `${overdue.length} overdue job${overdue.length > 1 ? "s" : ""}`,
      description: overdue.map((j) => j.name).join(", "),
    });
  }

  host.attentionItems = items;
}

export async function loadChannelsTab(host: SettingsHost) {
  await Promise.all([
    loadChannels(host as unknown as OpenClawApp, true),
    loadConfigSchema(host as unknown as OpenClawApp),
    loadConfig(host as unknown as OpenClawApp),
  ]);
}

export async function loadModelsTab(host: SettingsHost) {
  await loadModels(host as unknown as OpenClawApp, true);
  setTimeout(() => {
    void loadModels(host as unknown as OpenClawApp, false);
  }, 200);
}

export async function loadCron(host: SettingsHost) {
  const app = host as unknown as OpenClawApp;
  const activeCronJobId = app.cronRunsScope === "job" ? app.cronRunsJobId : null;
  await Promise.all([
    loadChannels(app, false),
    loadCronStatus(app),
    loadCronJobs(app),
    loadCronRuns(app, activeCronJobId),
  ]);
}
