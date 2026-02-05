import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.js";
import type { GatewayBrowserClient } from "./gateway.js";
import type { UiSettings } from "./storage.js";
import type { ConfigUiHints, NostrProfile } from "./types.js";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChatAvatar } from "./app-chat.js";
import { renderChatControls, renderTab, renderThemeToggle } from "./app-render.helpers.js";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files.js";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.js";
import { loadAgentSkills } from "./controllers/agent-skills.js";
import { loadAgents } from "./controllers/agents.js";
import { loadChannels } from "./controllers/channels.js";
import { loadChatHistory } from "./controllers/chat.js";
import {
  applyConfig,
  ConfigState,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config.ts";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
} from "./controllers/cron.ts";
import { loadDebug, callDebugMethod } from "./controllers/debug.ts";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices.ts";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals.ts";
import { loadLogs, LogsState } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions.ts";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.js";
import { t } from "./i18n.js";
import { icons } from "./icons.js";
import { TAB_GROUPS, subtitleForTab, titleForTab, normalizeBasePath } from "./navigation.js";
import { renderAgents } from "./views/agents.js";
import { BindingsController } from "./views/bindings-controller.js";
import { renderBindings } from "./views/bindings.js";
import { renderChannels } from "./views/channels.js";
import { renderChat } from "./views/chat.js";
import { renderConfig } from "./views/config.js";
import { renderCron } from "./views/cron.js";
import { renderDebug } from "./views/debug.js";
import { renderExecApprovalPrompt } from "./views/exec-approval.js";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.js";
import { renderInstances } from "./views/instances.js";
import { renderLogs } from "./views/logs.js";
import { renderNodes } from "./views/nodes.js";
import { renderOverview } from "./views/overview.js";
import { renderSessions } from "./views/sessions.js";
import { renderSkills } from "./views/skills.js";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

// Global bindings controller instance
let bindingsControllerInstance: BindingsController | null = null;
let bindingsControllerInitPromise: Promise<void> | null = null;

function getBindingsController(client: GatewayBrowserClient): BindingsController | null {
  if (!bindingsControllerInstance && client) {
    bindingsControllerInstance = new BindingsController(client, () => {
      // Trigger re-render through Lit's update mechanism
      const app = document.querySelector("openclaw-app") as any;
      if (app) {
        app.requestUpdate();
      }
    });
    // Initialize asynchronously
    if (!bindingsControllerInitPromise) {
      bindingsControllerInitPromise = bindingsControllerInstance.init();
    }
  }
  return bindingsControllerInstance;
}

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry: any) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : t("app.disconnected");
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const logoBase = normalizeBasePath(state.basePath);
  const logoHref = logoBase ? `${logoBase}/favicon.svg` : "/favicon.svg";
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;
  const ensureAgentListEntry = (agentId: string) => {
    const snapshot = (state.configForm ??
      (state.configSnapshot?.config as Record<string, unknown> | null)) as {
      agents?: { list?: unknown[] };
    } | null;
    const listRaw = snapshot?.agents?.list;
    const list = Array.isArray(listRaw) ? listRaw : [];
    let index = list.findIndex(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        "id" in entry &&
        (entry as { id?: string }).id === agentId,
    );
    if (index < 0) {
      const nextList = [...list, { id: agentId }];
      updateConfigFormValue(state as any, ["agents", "list"], nextList);
      index = nextList.length - 1;
    }
    return index;
  };

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? t("app.sidebar.expand") : t("app.sidebar.collapse")}"
            aria-label="${state.settings.navCollapsed ? t("app.sidebar.expand") : t("app.sidebar.collapse")}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src="${logoHref}" alt="OpenClaw" />
            </div>
            <div class="brand-text">
              <div class="brand-title">${t("app.brand.title")}</div>
              <div class="brand-sub">${t("app.brand.subtitle")}</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"</span>
            <span>${t("app.health")}</span>
            <span class="mono">${state.connected ? t("app.status.ok") : t("app.status.offline")}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group: any) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab: any) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${t(group.label)}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab: any) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}
        <div class="nav-group nav-group--links">
          <div class="nav-label nav-label--static">
            <span class="nav-label__text">${t("nav.resources")}</span>
          </div>
          <div class="nav-group__items">
            <a
              class="nav-item nav-item--external"
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noreferrer"
              title="${t("app.docs.title")}"
            >
              <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
              <span class="nav-item__text">${t("app.docs")}</span>
            </a>
          </div>
        </div>
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            <div class="page-title">${titleForTab(state.tab)}</div>
            <div class="page-sub">${subtitleForTab(state.tab)}</div>
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
            ${isChat ? renderChatControls(state) : nothing}
          </div>
        </section>

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                onSettingsChange: (next: UiSettings) => state.applySettings(next),
                onPasswordChange: (next: string) => (state.password = next),
                onSessionKeyChange: (next: string) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  (state as any).resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
                sessionStorage: {
                  connected: state.connected,
                  currentPath: state.storageCurrentPath,
                  newPath: state.storageNewPath,
                  loading: state.storageLoading,
                  migrating: state.storageMigrating,
                  error: state.storageError,
                  success: state.storageSuccess,
                  showBrowser: state.storageShowBrowser,
                  browserProps: state.storageShowBrowser
                    ? {
                        currentPath: state.storageBrowserPath,
                        parentPath: state.storageBrowserParent,
                        directories: state.storageBrowserDirectories.map((dir: string) => ({
                          name: dir,
                          path: dir,
                        })),
                        drives: state.storageBrowserDrives.map((drive: string) => ({
                          path: drive,
                          label: drive,
                          type: "drive",
                        })),
                        loading: state.storageBrowserLoading,
                        error: state.storageBrowserError,
                        onNavigate: (path: string) =>
                          (state as any).handleStorageBrowserNavigate(path),
                        onSelect: (path: string) => (state as any).handleStorageBrowserSelect(path),
                        onCancel: () => (state as any).handleStorageBrowserCancel(),
                      }
                    : null,
                  onNewPathChange: (path: string) => (state.storageNewPath = path),
                  onBrowse: () => (state as any).handleStorageBrowse(),
                  onValidate: () => (state as any).handleStorageValidate(),
                  onMigrate: (moveFiles: boolean) => (state as any).handleStorageMigrate(moveFiles),
                  onRefreshCurrentPath: () => (state as any).loadStorageCurrentPath(),
                },
              })
            : nothing
        }

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints as ConfigUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                onRefresh: (probe: any) => loadChannels(state, probe),
                onWhatsAppStart: (force: boolean) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path: (string | number)[], value: any) =>
                  updateConfigFormValue(state as any, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId: string, profile: any) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field: keyof NostrProfile, value: any) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                editingChannelAccount: state.editingChannelAccount,
                viewingChannelAccount: state.viewingChannelAccount,
                creatingChannelAccount: state.creatingChannelAccount,
                deletingChannelAccount: state.deletingChannelAccount,
                managingChannelId: state.managingChannelId,
                showAllChannelsModal: state.showAllChannelsModal,
                debuggingChannel: state.debuggingChannel,
                editingChannelGlobalConfig: state.editingChannelGlobalConfig,
                onManageAccounts: (channelId: string) =>
                  (state as any).handleManageAccounts(channelId),
                onAddAccount: (channelId: string) => (state as any).handleAddAccount(channelId),
                onViewAccount: (channelId: string, accountId: string) =>
                  (state as any).handleViewAccount(channelId, accountId),
                onEditAccount: (channelId: string, accountId: string) =>
                  (state as any).handleEditAccount(channelId, accountId),
                onDeleteAccount: (channelId: string, accountId: string) =>
                  (state as any).handleDeleteAccount(channelId, accountId),
                onSaveAccount: () => (state as any).handleSaveAccount(),
                onCancelAccountEdit: () => (state as any).handleCancelAccountEdit(),
                onCancelAccountView: () => (state as any).handleCancelAccountView(),
                onAccountFormChange: (field: string, value: unknown) =>
                  (state as any).handleAccountFormChange(field, value),
                onToggleAllChannelsModal: () => (state as any).handleToggleAllChannelsModal(),
                onToggleChannelVisibility: (channelId: string) =>
                  (state as any).handleToggleChannelVisibility(channelId),
                onDebugChannel: (channelId: string, accountId?: string) =>
                  (state as any).handleDebugChannel(channelId, accountId),
                onCloseDebug: () => (state as any).handleCloseDebug(),
                onEditChannelGlobalConfig: (channelId: string) =>
                  (state as any).handleEditChannelGlobalConfig(channelId),
                onCancelChannelGlobalConfig: () => (state as any).handleCancelChannelGlobalConfig(),
                onSaveChannelGlobalConfig: () => (state as any).handleSaveChannelGlobalConfig(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                onFiltersChange: (next: {
                  activeMinutes: string;
                  limit: string;
                  includeGlobal: boolean;
                  includeUnknown: boolean;
                }) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key: string, patch: any) => patchSession(state, key, patch),
                onDelete: (key: string) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry: any) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch: any) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job: any, enabled: boolean) => toggleCronJob(state, job, enabled),
                onRun: (job: any) => runCronJob(state, job),
                onRemove: (job: any) => removeCronJob(state, job),
                onLoadRuns: (jobId: any) => loadCronRuns(state, jobId),
              })
            : nothing
        }

        ${
          state.tab === "agents"
            ? renderAgents({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                selectedAgentId: resolvedAgentId,
                activePanel: state.agentsPanel,
                configForm: configValue,
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                channelsLoading: state.channelsLoading,
                channelsError: state.channelsError,
                channelsSnapshot: state.channelsSnapshot,
                channelsLastSuccess: state.channelsLastSuccess,
                cronLoading: state.cronLoading,
                cronStatus: state.cronStatus,
                cronJobs: state.cronJobs,
                cronError: state.cronError,
                agentFilesLoading: state.agentFilesLoading,
                agentFilesError: state.agentFilesError,
                agentFilesList: state.agentFilesList,
                agentFileActive: state.agentFileActive,
                agentFileContents: state.agentFileContents,
                agentFileDrafts: state.agentFileDrafts,
                agentFileSaving: state.agentFileSaving,
                agentIdentityLoading: state.agentIdentityLoading,
                agentIdentityError: state.agentIdentityError,
                agentIdentityById: state.agentIdentityById,
                agentSkillsLoading: state.agentSkillsLoading,
                agentSkillsReport: state.agentSkillsReport,
                agentSkillsError: state.agentSkillsError,
                agentSkillsAgentId: state.agentSkillsAgentId,
                skillsFilter: state.skillsFilter,
                editingAgent: state.editingAgent,
                creatingAgent: state.creatingAgent,
                deletingAgent: state.deletingAgent,
                onRefresh: async () => {
                  await loadAgents(state);
                  const agentIds = state.agentsList?.agents?.map((entry: any) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                },
                onSelectAgent: (agentId: string) => {
                  if (state.agentsSelectedId === agentId) {
                    return;
                  }
                  state.agentsSelectedId = agentId;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  void loadAgentIdentity(state, agentId);
                  if (state.agentsPanel === "files") {
                    void loadAgentFiles(state, agentId);
                  }
                  if (state.agentsPanel === "skills") {
                    void loadAgentSkills(state, agentId);
                  }
                },
                onSelectPanel: (panel: any) => {
                  state.agentsPanel = panel;
                  if (panel === "files" && resolvedAgentId) {
                    if (state.agentFilesList?.agentId !== resolvedAgentId) {
                      state.agentFilesList = null;
                      state.agentFilesError = null;
                      state.agentFileActive = null;
                      state.agentFileContents = {};
                      state.agentFileDrafts = {};
                      void loadAgentFiles(state, resolvedAgentId);
                    }
                  }
                  if (panel === "skills") {
                    if (resolvedAgentId) {
                      void loadAgentSkills(state, resolvedAgentId);
                    }
                  }
                  if (panel === "channels") {
                    void loadChannels(state, false);
                  }
                  if (panel === "cron") {
                    void state.loadCron();
                  }
                },
                onLoadFiles: (agentId: string) => {
                  void (async () => {
                    await loadAgentFiles(state, agentId);
                    if (state.agentFileActive) {
                      await loadAgentFileContent(state, agentId, state.agentFileActive, {
                        force: true,
                        preserveDraft: true,
                      });
                    }
                  })();
                },
                onSelectFile: (name: any) => {
                  state.agentFileActive = name;
                  if (!resolvedAgentId) {
                    return;
                  }
                  void loadAgentFileContent(state, resolvedAgentId, name);
                },
                onFileDraftChange: (name: any, content: any) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name: any) => {
                  const base = state.agentFileContents[name] ?? "";
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: base };
                },
                onFileSave: (name: any) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  const content =
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "";
                  void saveAgentFile(state, resolvedAgentId, name, content);
                },
                onToolsProfileChange: (agentId: string, profile, clearAllow: any) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (profile) {
                    updateConfigFormValue(state as any, [...basePath, "profile"], profile);
                  } else {
                    removeConfigFormValue(state as any, [...basePath, "profile"]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state as any, [...basePath, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId: string, alsoAllow, deny: any) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (alsoAllow.length > 0) {
                    updateConfigFormValue(state as any, [...basePath, "alsoAllow"], alsoAllow);
                  } else {
                    removeConfigFormValue(state as any, [...basePath, "alsoAllow"]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(state as any, [...basePath, "deny"], deny);
                  } else {
                    removeConfigFormValue(state as any, [...basePath, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state as any),
                onConfigSave: () => saveConfig(state as any),
                onChannelsRefresh: () => loadChannels(state, false),
                onCronRefresh: () => state.loadCron(),
                onSkillsFilterChange: (next: string) => (state.skillsFilter = next),
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId: string, skillName, enabled: boolean) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const entry = list[index] as { skills?: unknown };
                  const normalizedSkill = skillName.trim();
                  if (!normalizedSkill) {
                    return;
                  }
                  const allSkills =
                    state.agentSkillsReport?.skills
                      ?.map((skill: any) => skill.name)
                      .filter(Boolean) ?? [];
                  const existing = Array.isArray(entry.skills)
                    ? entry.skills.map((name) => String(name).trim()).filter(Boolean)
                    : undefined;
                  const base = existing ?? allSkills;
                  const next = new Set(base);
                  if (enabled) {
                    next.add(normalizedSkill);
                  } else {
                    next.delete(normalizedSkill);
                  }
                  updateConfigFormValue(
                    state as any,
                    ["agents", "list", index, "skills"],
                    [...next],
                  );
                },
                onAgentSkillsClear: (agentId: string) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  removeConfigFormValue(state as any, ["agents", "list", index, "skills"]);
                },
                onAgentSkillsDisableAll: (agentId: string) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  updateConfigFormValue(state as any, ["agents", "list", index, "skills"], []);
                },
                onModelChange: (agentId: string, modelId: any) => {
                  if (!configValue) {
                    return;
                  }
                  const defaultId = state.agentsList?.defaultId ?? null;
                  if (defaultId && agentId === defaultId) {
                    const basePath = ["agents", "defaults", "model"];
                    const defaults =
                      (configValue as { agents?: { defaults?: { model?: unknown } } }).agents
                        ?.defaults ?? {};
                    const existing = defaults.model;
                    if (!modelId) {
                      removeConfigFormValue(state as any, basePath);
                      return;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                      const next = {
                        primary: modelId,
                        ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                      };
                      updateConfigFormValue(state as any, basePath, next);
                    } else {
                      updateConfigFormValue(state as any, basePath, {
                        primary: modelId,
                      });
                    }
                    return;
                  }

                  const index = ensureAgentListEntry(agentId);
                  const basePath = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state as any, basePath);
                    return;
                  }
                  const list = (
                    (state.configForm ??
                      (state.configSnapshot?.config as Record<string, unknown> | null)) as {
                      agents?: { list?: unknown[] };
                    }
                  )?.agents?.list;
                  const entry =
                    Array.isArray(list) && list[index]
                      ? (list[index] as { model?: unknown })
                      : null;
                  const existing = entry?.model;
                  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                    const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                    const next = {
                      primary: modelId,
                      ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                    };
                    updateConfigFormValue(state as any, basePath, next);
                  } else {
                    updateConfigFormValue(state as any, basePath, modelId);
                  }
                },
                onModelFallbacksChange: (agentId: string, fallbacks: any) => {
                  if (!configValue) {
                    return;
                  }
                  const normalized = fallbacks.map((name: any) => name.trim()).filter(Boolean);
                  const defaultId = state.agentsList?.defaultId ?? null;
                  if (defaultId && agentId === defaultId) {
                    const basePath = ["agents", "defaults", "model"];
                    const defaults =
                      (configValue as { agents?: { defaults?: { model?: unknown } } }).agents
                        ?.defaults ?? {};
                    const existing = defaults.model;
                    const resolvePrimary = () => {
                      if (typeof existing === "string") {
                        return existing.trim() || null;
                      }
                      if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                        const primary = (existing as { primary?: unknown }).primary;
                        if (typeof primary === "string") {
                          const trimmed = primary.trim();
                          return trimmed || null;
                        }
                      }
                      return null;
                    };
                    const primary = resolvePrimary();
                    if (normalized.length === 0) {
                      if (primary) {
                        updateConfigFormValue(state as any, basePath, {
                          primary,
                        });
                      } else {
                        removeConfigFormValue(state as any, basePath);
                      }
                      return;
                    }
                    const next = primary
                      ? { primary, fallbacks: normalized }
                      : { fallbacks: normalized };
                    updateConfigFormValue(state as any, basePath, next);
                    return;
                  }

                  const index = ensureAgentListEntry(agentId);
                  const basePath = ["agents", "list", index, "model"];
                  const list = (
                    (state.configForm ??
                      (state.configSnapshot?.config as Record<string, unknown> | null)) as {
                      agents?: { list?: unknown[] };
                    }
                  )?.agents?.list;
                  const entry =
                    Array.isArray(list) && list[index]
                      ? (list[index] as { model?: unknown })
                      : null;
                  const existing = entry?.model;
                  if (!existing) {
                    return;
                  }
                  const resolvePrimary = () => {
                    if (typeof existing === "string") {
                      return existing.trim() || null;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const primary = (existing as { primary?: unknown }).primary;
                      if (typeof primary === "string") {
                        const trimmed = primary.trim();
                        return trimmed || null;
                      }
                    }
                    return null;
                  };
                  const primary = resolvePrimary();
                  if (normalized.length === 0) {
                    if (primary) {
                      updateConfigFormValue(state as any, basePath, primary);
                    } else {
                      removeConfigFormValue(state as any, basePath);
                    }
                    return;
                  }
                  const next = primary
                    ? { primary, fallbacks: normalized }
                    : { fallbacks: normalized };
                  updateConfigFormValue(state as any, basePath, next);
                },
                onAddAgent: () => {
                  state.editingAgent = { id: "", name: "", workspace: "" };
                },
                onEditAgent: (agentId: string) => {
                  const agent = state.agentsList?.agents?.find((a: any) => a.id === agentId);
                  if (agent) {
                    state.editingAgent = {
                      id: agent.id,
                      name: agent.identity?.name ?? "",
                      workspace: agent.workspace ?? "",
                    };
                  }
                },
                onDeleteAgent: async (agentId: string) => {
                  if (!state.client || state.deletingAgent) {
                    return;
                  }
                  state.deletingAgent = true;
                  try {
                    // 获取当前配置
                    const config = (await state.client.request("config.get", {})) as {
                      agents?: { list?: any[] };
                    } | null;
                    if (!config?.agents?.list) {
                      throw new Error("No agents configuration found");
                    }
                    // 过滤掉要删除的 agent
                    const list = config.agents.list.filter((a: { id: string }) => a.id !== agentId);
                    // 更新配置
                    await state.client.request("config.patch", {
                      path: ["agents", "list"],
                      value: list,
                    });
                    // 刷新列表
                    await loadAgents(state);
                    const agentIds = state.agentsList?.agents?.map((entry: any) => entry.id) ?? [];
                    if (agentIds.length > 0) {
                      void loadAgentIdentities(state, agentIds);
                    }
                  } catch (err) {
                    state.agentsError = String(err);
                  } finally {
                    state.deletingAgent = false;
                  }
                },
                onSaveAgent: async () => {
                  if (!state.client || !state.editingAgent || state.creatingAgent) {
                    return;
                  }
                  const idPattern = /^[a-z0-9][a-z0-9-]*$/;
                  if (!idPattern.test(state.editingAgent.id)) {
                    return;
                  }
                  state.creatingAgent = true;
                  try {
                    // 获取当前配置
                    const config = (await state.client.request("config.get", {})) as {
                      agents?: { list?: any[] };
                    } | null;
                    const list = config?.agents?.list ?? [];
                    // 检查是否是新建还是编辑
                    const existingIndex = list.findIndex(
                      (a: { id: string }) => a.id === state.editingAgent?.id,
                    );
                    const newAgent = {
                      id: state.editingAgent.id,
                      ...(state.editingAgent.name
                        ? { identity: { name: state.editingAgent.name } }
                        : {}),
                      ...(state.editingAgent.workspace
                        ? { workspace: state.editingAgent.workspace }
                        : {}),
                    };
                    let newList;
                    if (existingIndex >= 0) {
                      // 更新现有 agent
                      newList = [...list];
                      newList[existingIndex] = { ...newList[existingIndex], ...newAgent };
                    } else {
                      // 添加新 agent
                      newList = [...list, newAgent];
                    }
                    // 更新配置
                    await state.client.request("config.patch", {
                      path: ["agents", "list"],
                      value: newList,
                    });
                    // 刷新列表
                    await loadAgents(state);
                    const agentIds = state.agentsList?.agents?.map((entry: any) => entry.id) ?? [];
                    if (agentIds.length > 0) {
                      void loadAgentIdentities(state, agentIds);
                    }
                    // 关闭弹窗
                    state.editingAgent = null;
                  } catch (err) {
                    state.agentsError = String(err);
                  } finally {
                    state.creatingAgent = false;
                  }
                },
                onCancelEdit: () => {
                  state.editingAgent = null;
                },
                onAgentFormChange: (field: string, value: any) => {
                  if (!state.editingAgent) {
                    return;
                  }
                  state.editingAgent = { ...state.editingAgent, [field]: value };
                },
              })
            : nothing
        }

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                onFilterChange: (next: string) => (state.skillsFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key: string, enabled: boolean) =>
                  updateSkillEnabled(state, key, enabled),
                onEdit: (key: string, value: any) => updateSkillEdit(state, key, value),
                onSaveKey: (key: string) => saveSkillApiKey(state, key),
                onInstall: (skillKey: any, name, installId: any) =>
                  installSkill(state, skillKey, name, installId),
              })
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId: any) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId: any) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId: any, role, scopes: any) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId: any, role: string) =>
                  revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state as any),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId: string | null) => {
                  if (nodeId) {
                    updateConfigFormValue(state as any, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state as any, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex: number, nodeId: string | null) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state as any, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state as any, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state as any),
                onExecApprovalsTargetChange: (kind: "gateway" | "node", nodeId: string | null) => {
                  state.execApprovalsTarget = kind as "gateway" | "node";
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId: string) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path: (string | number)[], value: any) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path: (string | number)[]) =>
                  removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "chat"
            ? renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next: any) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatRunId = null;
                  (state as any).chatStreamStartedAt = null;
                  state.chatQueue = [];
                  (state as any).resetToolStream();
                  (state as any).resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state as any);
                  void refreshChatAvatar(state as any);
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                loading: state.chatLoading,
                sending: state.chatSending,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: null,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                onRefresh: () => {
                  return Promise.all([
                    loadChatHistory(state as any),
                    refreshChatAvatar(state as any),
                  ]);
                },
                onToggleFocusMode: () => {
                  if (state.onboarding) {
                    return;
                  }
                  state.applySettings({
                    ...state.settings,
                    chatFocusMode: !state.settings.chatFocusMode,
                  });
                },
                onChatScroll: (event: any) => (state as any).handleChatScroll(event),
                onDraftChange: (next: any) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next: any) => (state.chatAttachments = next),
                onSend: () => (state as any).handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void (state as any).handleAbortChat(),
                onQueueRemove: (id: any) => (state as any).removeQueuedMessage(id),
                onNewSession: () => (state as any).handleSendChat("/new", { restoreDraft: true }),
                showNewMessages: state.chatNewMessagesBelow,
                onScrollToBottom: () => state.scrollToBottom(),
                // Sidebar props for tool output viewing
                sidebarOpen: (state as any).sidebarOpen,
                sidebarContent: (state as any).sidebarContent,
                sidebarError: (state as any).sidebarError,
                splitRatio: (state as any).splitRatio,
                onOpenSidebar: (content: string) => (state as any).handleOpenSidebar(content),
                onCloseSidebar: () => (state as any).handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => (state as any).handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })
            : nothing
        }

        ${
          state.tab === "bindings"
            ? (() => {
                const controller = state.client ? getBindingsController(state.client) : null;
                if (!controller) {
                  return html`
                    <div class="loading">连接中...</div>
                  `;
                }
                return renderBindings(controller.getProps());
              })()
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints as ConfigUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: (state as any).configSearchQuery,
                activeSection: (state as any).configActiveSection,
                activeSubsection: (state as any).configActiveSubsection,
                onRawChange: (next: any) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode: any) => (state.configFormMode = mode),
                onFormPatch: (path: (string | number)[], value: any) =>
                  updateConfigFormValue(state as any, path, value),
                onSearchChange: (query: any) => ((state as any).configSearchQuery = query),
                onSectionChange: (section: any) => {
                  (state as any).configActiveSection = section;
                  (state as any).configActiveSubsection = null;
                },
                onSubsectionChange: (section: any) =>
                  ((state as any).configActiveSubsection = section),
                onReload: () => loadConfig(state as any),
                onSave: () => saveConfig(state as any),
                onApply: () => applyConfig(state as any),
                onUpdate: () => runUpdate(state as any),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next: any) => (state.debugCallMethod = next),
                onCallParamsChange: (next: any) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next: any) => (state.logsFilterText = next),
                onLevelToggle: (level: any, enabled: boolean) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next: any) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state as unknown as LogsState, { reset: true }),
                onExport: (lines: any, label: any) => (state as any).exportLogs(lines, label),
                onScroll: (event: any) => (state as any).handleLogsScroll(event),
              })
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
