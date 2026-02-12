import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import type { OpenClawApp } from "./app.ts";
import type { UsageState } from "./controllers/usage.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChatAvatar } from "./app-chat.ts";
import { renderChatControls, renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import {
  loadBoundChannelAccounts,
  loadAvailableChannelAccounts,
  addChannelAccountBinding,
  removeChannelAccountBinding,
  toggleAvailableAccountsExpanded,
} from "./controllers/agent-channel-accounts.ts";
import {
  createAgent,
  updateAgent,
  deleteAgent,
  migrateAgentWorkspace,
  getDefaultWorkspace,
  setDefaultWorkspace,
  setDefaultAgent,
} from "./controllers/agent-crud.ts";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import {
  loadBoundModelAccounts,
  loadAvailableModelAccounts,
  bindModelAccount,
  unbindModelAccount,
  setDefaultModelAccount,
  toggleAvailableModelAccountsExpanded,
} from "./controllers/agent-model-accounts.ts";
import {
  loadAgentPermissions,
  saveAgentPermissions,
  loadApprovalRequests,
  loadApprovalStats as loadPermissionApprovalStats,
  respondToApproval as respondToPermissionApproval,
  batchApproveRequests,
  batchDenyRequests,
  cancelApprovalRequest,
  loadPermissionHistory,
} from "./controllers/agent-permissions.ts";
import {
  loadModelAccounts,
  loadChannelPolicies,
  saveModelAccounts,
  saveChannelPolicies,
} from "./controllers/agent-phase5.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import {
  loadApprovals,
  loadApprovalStats,
  respondToApproval,
  cancelApproval,
} from "./controllers/approvals.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import {
  applyConfig,
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
import {
  loadFriends,
  loadFriendRequests,
  addFriend,
  confirmFriend,
  removeFriend,
  loadMessages,
  sendMessage,
} from "./controllers/friends.ts";
import {
  loadGroups,
  createGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  updateGroupMemberRole,
} from "./controllers/groups.ts";
import { loadLogs } from "./controllers/logs.ts";
import {
  loadQueueStatus,
  loadQueueStats,
  loadQueueConfig,
  saveQueueConfig,
  clearQueue,
} from "./controllers/message-queue.ts";
import {
  loadModels,
  saveAuth,
  deleteAuth,
  setDefaultAuth,
  testAuth,
  refreshAuthBalance,
  fetchAvailableModels,
  saveModelConfig,
  deleteModelConfig,
  toggleModelConfig,
  addProvider,
  updateProvider,
  deleteProvider,
} from "./controllers/models.ts";
import {
  loadActiveSessions,
  loadMessageFlows,
  loadForwardingRules,
  addForwardingRule,
  updateForwardingRule,
  deleteForwardingRule,
  loadMetrics,
  loadAlerts,
  acknowledgeAlert,
  clearAllAlerts,
} from "./controllers/monitor.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import {
  loadScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  runScenario,
  loadScenarioRuns,
  loadRecommendations,
} from "./controllers/scenarios.ts";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions.ts";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
  toggleAdvancedMode,
  selectSkill,
  selectAllSkills,
  deselectAllSkills,
  batchEnableSkills,
  batchDisableSkills,
  changeFilterStatus,
  changeFilterSource,
} from "./controllers/skills.ts";
import { loadSuperAdmins, loadNotifications } from "./controllers/super-admin.ts";
import { loadUsage, loadSessionTimeSeries, loadSessionLogs } from "./controllers/usage.ts";
import { t } from "./i18n.js";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation.ts";

// Module-scope debounce for usage date changes (avoids type-unsafe hacks on state object)
let usageDateDebounceTimeout: number | null = null;
const debouncedLoadUsage = (state: UsageState) => {
  if (usageDateDebounceTimeout) {
    clearTimeout(usageDateDebounceTimeout);
  }
  usageDateDebounceTimeout = window.setTimeout(() => void loadUsage(state), 400);
};
import { renderModelAccountConfigDialog } from "./views/agents.model-account-config-dialog.ts";
import { renderAgents } from "./views/agents.ts";
import { renderChannelPolicyDialog } from "./views/channel-policy-dialog.ts";
import { renderChannels } from "./views/channels.ts";
import { renderChat } from "./views/chat.ts";
import { renderCollaboration } from "./views/collaboration.ts";
import { renderConfig } from "./views/config.ts";
import { renderCron } from "./views/cron.ts";
import { renderDebug } from "./views/debug.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderGroups } from "./views/groups.ts";
import { renderInstances } from "./views/instances.ts";
import { renderLogs } from "./views/logs.ts";
import { renderMessageQueue } from "./views/message-queue.ts";
import { renderModels } from "./views/models.ts";
import { renderNodes } from "./views/nodes.ts";
import { renderOrganizationPermissions } from "./views/organization-permissions.ts";
import { renderOverview } from "./views/overview.ts";
import { renderSessions } from "./views/sessions.ts";
import { renderSkills } from "./views/skills.ts";
import { renderUsage } from "./views/usage.ts";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
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
  const chatDisabledReason = state.connected ? null : "Disconnected from gateway.";
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const basePath = normalizeBasePath(state.basePath ?? "");
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;

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
            title="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src=${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"} alt="OpenClaw" />
            </div>
            <div class="brand-text">
              <div class="brand-title">OPENCLAW</div>
              <div class="brand-sub">Gateway Dashboard</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>Health</span>
            <span class="mono">${state.connected ? "OK" : "Offline"}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
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
                ${group.tabs.map((tab) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}
        ${(() => {
          const resourcesLabel = "nav.resources";
          const isResourcesCollapsed = state.settings.navGroupsCollapsed[resourcesLabel] ?? false;
          return html`
            <div class="nav-group nav-group--links ${isResourcesCollapsed ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[resourcesLabel] = !isResourcesCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isResourcesCollapsed}
              >
                <span class="nav-label__text">${t(resourcesLabel)}</span>
                <span class="nav-label__chevron">${isResourcesCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                <a
                  class="nav-item nav-item--external"
                  href="https://docs.openclaw.ai"
                  target="_blank"
                  rel="noreferrer"
                  title="Docs (opens in new tab)"
                >
                  <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
                  <span class="nav-item__text">Docs</span>
                </a>
              </div>
            </div>
          `;
        })()}
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            ${state.tab === "usage" ? nothing : html`<div class="page-title">${titleForTab(state.tab)}</div>`}
            ${state.tab === "usage" ? nothing : html`<div class="page-sub">${subtitleForTab(state.tab)}</div>`}
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
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
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
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                // 账号管理状态
                editingChannelAccount: state.editingChannelAccount,
                viewingChannelAccount: state.viewingChannelAccount,
                creatingChannelAccount: state.creatingChannelAccount,
                deletingChannelAccount: state.deletingChannelAccount,
                managingChannelId: state.managingChannelId,
                showAllChannelsModal: state.showAllChannelsModal,
                debuggingChannel: state.debuggingChannel,
                editingChannelGlobalConfig: state.editingChannelGlobalConfig,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
                // 账号管理回调 - TODO: 实现这些回调
                onManageAccounts: (channelId) => {
                  state.managingChannelId = channelId;
                },
                onAddAccount: (channelId) => {
                  state.creatingChannelAccount = true;
                  state.managingChannelId = channelId;
                },
                onViewAccount: (channelId, accountId) => {
                  state.viewingChannelAccount = { channelId, accountId };
                },
                onEditAccount: (channelId, accountId) => {
                  // TODO: 加载账号配置
                  state.editingChannelAccount = {
                    channelId,
                    accountId,
                    config: {},
                  };
                },
                onDeleteAccount: (channelId, accountId) => {
                  if (confirm(`确定要删除此账号吗？`)) {
                    // TODO: 实现删除逻辑
                    console.log("Delete account:", channelId, accountId);
                  }
                },
                onSaveAccount: () => {
                  // TODO: 保存账号
                  state.editingChannelAccount = null;
                  state.creatingChannelAccount = false;
                },
                onCancelAccountEdit: () => {
                  state.editingChannelAccount = null;
                  state.creatingChannelAccount = false;
                },
                onCancelAccountView: () => {
                  state.viewingChannelAccount = null;
                },
                onAccountFormChange: (field, value) => {
                  if (state.editingChannelAccount) {
                    state.editingChannelAccount = {
                      ...state.editingChannelAccount,
                      config: {
                        ...state.editingChannelAccount.config,
                        [field]: value,
                      },
                    };
                  }
                },
                onToggleAllChannelsModal: () => {
                  state.showAllChannelsModal = !state.showAllChannelsModal;
                },
                onToggleChannelVisibility: (channelId) => {
                  // TODO: 实现显示/隐藏逻辑
                  console.log("Toggle channel visibility:", channelId);
                },
                onDebugChannel: (channelId, accountId) => {
                  state.debuggingChannel = { channelId, accountId };
                },
                onCloseDebug: () => {
                  state.debuggingChannel = null;
                },
                onEditChannelGlobalConfig: (channelId) => {
                  state.editingChannelGlobalConfig = channelId;
                },
                onCancelChannelGlobalConfig: () => {
                  state.editingChannelGlobalConfig = null;
                },
                onSaveChannelGlobalConfig: () => {
                  // TODO: 保存全局配置
                  state.editingChannelGlobalConfig = null;
                },
              })
            : nothing
        }

        ${
          state.tab === "models"
            ? renderModels({
                snapshot: state.modelsSnapshot,
                loading: state.modelsLoading,
                error: state.modelsError,
                managingAuthProvider: state.managingAuthProvider,
                editingAuth: state.editingAuth,
                viewingAuth: state.viewingAuth,
                managingModelsProvider: state.managingModelsProvider,
                editingModelConfig: state.editingModelConfig,
                addingProvider: state.addingProvider,
                viewingProviderId: state.viewingProviderId,
                providerForm: state.providerForm,
                onRefresh: () => loadModels(state, false),
                onManageAuths: (provider) => {
                  state.managingAuthProvider = provider;
                },
                onAddAuth: (provider) => {
                  state.editingAuth = {
                    provider,
                    name: "",
                    apiKey: "",
                    baseUrl: "",
                  };
                },
                onEditAuth: (authId) => {
                  const auth = Object.values(state.modelsSnapshot?.auths ?? {})
                    .flat()
                    .find((a) => a.authId === authId);
                  if (auth) {
                    state.editingAuth = {
                      authId: auth.authId,
                      provider: auth.provider,
                      name: auth.name,
                      apiKey: "",
                      baseUrl: auth.baseUrl,
                    };
                  }
                },
                onDeleteAuth: async (authId) => {
                  if (confirm("确定要删除此认证吗？")) {
                    await deleteAuth(state, authId);
                  }
                },
                onSetDefaultAuth: async (authId) => {
                  await setDefaultAuth(state, authId);
                },
                onSaveAuth: async (params) => {
                  await saveAuth(state, params);
                  state.editingAuth = null;
                  state.managingAuthProvider = null;
                },
                onCancelAuthEdit: () => {
                  state.editingAuth = null;
                  state.viewingAuth = null;
                  state.managingAuthProvider = null;
                },
                onTestAuth: async (authId) => {
                  const result = await testAuth(state, authId);
                  alert(result.success ? "连接成功！" : `连接失败: ${result.message}`);
                },
                onRefreshAuthBalance: async (authId) => {
                  await refreshAuthBalance(state, authId);
                },
                onManageModels: (provider) => {
                  state.managingModelsProvider = provider;
                },
                onCloseModelsList: () => {
                  state.managingModelsProvider = null;
                },
                onAddModelConfig: (authId, modelName) => {
                  const auth = Object.values(state.modelsSnapshot?.auths ?? {})
                    .flat()
                    .find((a) => a.authId === authId);
                  if (auth) {
                    state.editingModelConfig = {
                      authId,
                      provider: auth.provider,
                      modelName,
                      enabled: true,
                    };
                  }
                },
                onEditModelConfig: (configId) => {
                  const config = Object.values(state.modelsSnapshot?.modelConfigs ?? {})
                    .flat()
                    .find((c) => c.configId === configId);
                  if (config) {
                    state.editingModelConfig = {
                      configId: config.configId,
                      authId: config.authId,
                      provider: config.provider,
                      modelName: config.modelName,
                      nickname: config.nickname,
                      enabled: config.enabled,
                      temperature: config.temperature,
                      topP: config.topP,
                      maxTokens: config.maxTokens,
                      frequencyPenalty: config.frequencyPenalty,
                      systemPrompt: config.systemPrompt,
                      conversationRounds: config.conversationRounds,
                      maxIterations: config.maxIterations,
                      usageLimits: config.usageLimits,
                    };
                  }
                },
                onDeleteModelConfig: async (configId) => {
                  if (confirm("确定要删除此模型配置吗？")) {
                    await deleteModelConfig(state, configId);
                  }
                },
                onToggleModelConfig: async (configId, enabled) => {
                  await toggleModelConfig(state, configId, enabled);
                },
                onRefreshAuthModels: async (authId) => {
                  state.importableModels = null;
                  state.importingAuthId = authId;
                  const models = await fetchAvailableModels(state, authId);
                  const existingConfigs =
                    Object.values(state.modelsSnapshot?.modelConfigs ?? {})
                      .flat()
                      .filter((c) => c.authId === authId) ?? [];
                  state.importableModels = models.map((modelName) => {
                    const existing = existingConfigs.find((c) => c.modelName === modelName);
                    return {
                      modelName,
                      isConfigured: !!existing,
                      isEnabled: existing?.enabled ?? false,
                      isDeprecated: false,
                      configId: existing?.configId,
                    };
                  });
                },
                onImportModels: async (authId, modelNames) => {
                  const auth = Object.values(state.modelsSnapshot?.auths ?? {})
                    .flat()
                    .find((a) => a.authId === authId);
                  if (auth) {
                    for (const modelName of modelNames) {
                      await saveModelConfig(state, {
                        authId,
                        provider: auth.provider,
                        modelName,
                        enabled: true,
                      });
                    }
                  }
                  state.selectedImportModels.clear();
                  state.importableModels = null;
                  state.importingAuthId = null;
                },
                onSaveModelConfig: async (params) => {
                  await saveModelConfig(state, params);
                  state.editingModelConfig = null;
                },
                onCancelModelConfigEdit: () => {
                  state.editingModelConfig = null;
                  state.importableModels = null;
                  state.importingAuthId = null;
                  state.selectedImportModels.clear();
                },
                onAddProvider: () => {
                  state.addingProvider = true;
                  state.providerForm = {
                    selectedTemplateId: null,
                    id: "",
                    name: "",
                    icon: "🤖",
                    website: "",
                    defaultBaseUrl: "",
                    apiKeyPlaceholder: "请输入API密钥",
                  };
                },
                onViewProvider: (id) => {
                  state.viewingProviderId = id;
                },
                onEditProvider: (id) => {
                  // 从 providerInstances 中查找供应商
                  const provider = state.modelsSnapshot?.providerInstances?.find(
                    (p: any) => p.id === id,
                  );
                  if (provider) {
                    state.providerForm = {
                      selectedTemplateId: (provider as any).templateId || null,
                      id: (provider as any).id,
                      name: (provider as any).name,
                      icon: (provider as any).icon || "🤖",
                      website: (provider as any).website || "",
                      defaultBaseUrl: (provider as any).defaultBaseUrl || "",
                      apiKeyPlaceholder: (provider as any).apiKeyPlaceholder || "请输入API密钥",
                      isEditing: true,
                      originalId: (provider as any).id,
                    };
                  }
                },
                onTemplateSelect: (templateId) => {
                  if (state.providerForm) {
                    const template = state.modelsSnapshot?.providerTemplates?.find(
                      (t) => t.id === templateId,
                    );
                    if (template) {
                      state.providerForm = {
                        ...state.providerForm,
                        selectedTemplateId: templateId,
                        id: template.id,
                        name: template.name,
                        icon: template.icon || "🤖",
                        website: template.website || "",
                        defaultBaseUrl: template.defaultBaseUrl || "",
                        apiKeyPlaceholder: template.apiKeyPlaceholder || "请输入API密钥",
                      };
                    }
                  }
                },
                onProviderFormChange: (patch) => {
                  if (state.providerForm) {
                    state.providerForm = {
                      ...state.providerForm,
                      ...patch,
                    };
                  }
                },
                onSaveProvider: async (params) => {
                  if (state.providerForm?.isEditing) {
                    await updateProvider(state, params);
                  } else {
                    await addProvider(state, params);
                  }
                  state.addingProvider = false;
                  state.providerForm = null;
                },
                onDeleteProvider: async (id) => {
                  await deleteProvider(state, id);
                },
                onCancelProviderEdit: () => {
                  state.addingProvider = false;
                  state.providerForm = null;
                },
                onCancelProviderView: () => {
                  state.viewingProviderId = null;
                },
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
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "usage"
            ? renderUsage({
                loading: state.usageLoading,
                error: state.usageError,
                startDate: state.usageStartDate,
                endDate: state.usageEndDate,
                sessions: state.usageResult?.sessions ?? [],
                sessionsLimitReached: (state.usageResult?.sessions?.length ?? 0) >= 1000,
                totals: state.usageResult?.totals ?? null,
                aggregates: state.usageResult?.aggregates ?? null,
                costDaily: state.usageCostSummary?.daily ?? [],
                selectedSessions: state.usageSelectedSessions,
                selectedDays: state.usageSelectedDays,
                selectedHours: state.usageSelectedHours,
                chartMode: state.usageChartMode,
                dailyChartMode: state.usageDailyChartMode,
                timeSeriesMode: state.usageTimeSeriesMode,
                timeSeriesBreakdownMode: state.usageTimeSeriesBreakdownMode,
                timeSeries: state.usageTimeSeries,
                timeSeriesLoading: state.usageTimeSeriesLoading,
                sessionLogs: state.usageSessionLogs,
                sessionLogsLoading: state.usageSessionLogsLoading,
                sessionLogsExpanded: state.usageSessionLogsExpanded,
                logFilterRoles: state.usageLogFilterRoles,
                logFilterTools: state.usageLogFilterTools,
                logFilterHasTools: state.usageLogFilterHasTools,
                logFilterQuery: state.usageLogFilterQuery,
                query: state.usageQuery,
                queryDraft: state.usageQueryDraft,
                sessionSort: state.usageSessionSort,
                sessionSortDir: state.usageSessionSortDir,
                recentSessions: state.usageRecentSessions,
                sessionsTab: state.usageSessionsTab,
                visibleColumns:
                  state.usageVisibleColumns as import("./views/usage.ts").UsageColumnId[],
                timeZone: state.usageTimeZone,
                contextExpanded: state.usageContextExpanded,
                headerPinned: state.usageHeaderPinned,
                // 供应商筛选和概览视图
                filterProvider: state.usageFilterProvider,
                showProviderOverview: state.usageShowProviderOverview,
                onStartDateChange: (date) => {
                  state.usageStartDate = date;
                  state.usageSelectedDays = [];
                  state.usageSelectedHours = [];
                  state.usageSelectedSessions = [];
                  debouncedLoadUsage(state);
                },
                onEndDateChange: (date) => {
                  state.usageEndDate = date;
                  state.usageSelectedDays = [];
                  state.usageSelectedHours = [];
                  state.usageSelectedSessions = [];
                  debouncedLoadUsage(state);
                },
                onRefresh: () => loadUsage(state),
                onTimeZoneChange: (zone) => {
                  state.usageTimeZone = zone;
                },
                onToggleContextExpanded: () => {
                  state.usageContextExpanded = !state.usageContextExpanded;
                },
                onToggleSessionLogsExpanded: () => {
                  state.usageSessionLogsExpanded = !state.usageSessionLogsExpanded;
                },
                onLogFilterRolesChange: (next) => {
                  state.usageLogFilterRoles = next;
                },
                onLogFilterToolsChange: (next) => {
                  state.usageLogFilterTools = next;
                },
                onLogFilterHasToolsChange: (next) => {
                  state.usageLogFilterHasTools = next;
                },
                onLogFilterQueryChange: (next) => {
                  state.usageLogFilterQuery = next;
                },
                onLogFilterClear: () => {
                  state.usageLogFilterRoles = [];
                  state.usageLogFilterTools = [];
                  state.usageLogFilterHasTools = false;
                  state.usageLogFilterQuery = "";
                },
                onToggleHeaderPinned: () => {
                  state.usageHeaderPinned = !state.usageHeaderPinned;
                },
                onSelectHour: (hour, shiftKey) => {
                  if (shiftKey && state.usageSelectedHours.length > 0) {
                    const allHours = Array.from({ length: 24 }, (_, i) => i);
                    const lastSelected =
                      state.usageSelectedHours[state.usageSelectedHours.length - 1];
                    const lastIdx = allHours.indexOf(lastSelected);
                    const thisIdx = allHours.indexOf(hour);
                    if (lastIdx !== -1 && thisIdx !== -1) {
                      const [start, end] =
                        lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                      const range = allHours.slice(start, end + 1);
                      state.usageSelectedHours = [
                        ...new Set([...state.usageSelectedHours, ...range]),
                      ];
                    }
                  } else {
                    if (state.usageSelectedHours.includes(hour)) {
                      state.usageSelectedHours = state.usageSelectedHours.filter((h) => h !== hour);
                    } else {
                      state.usageSelectedHours = [...state.usageSelectedHours, hour];
                    }
                  }
                },
                onQueryDraftChange: (query) => {
                  state.usageQueryDraft = query;
                  if (state.usageQueryDebounceTimer) {
                    window.clearTimeout(state.usageQueryDebounceTimer);
                  }
                  state.usageQueryDebounceTimer = window.setTimeout(() => {
                    state.usageQuery = state.usageQueryDraft;
                    state.usageQueryDebounceTimer = null;
                  }, 250);
                },
                onApplyQuery: () => {
                  if (state.usageQueryDebounceTimer) {
                    window.clearTimeout(state.usageQueryDebounceTimer);
                    state.usageQueryDebounceTimer = null;
                  }
                  state.usageQuery = state.usageQueryDraft;
                },
                onClearQuery: () => {
                  if (state.usageQueryDebounceTimer) {
                    window.clearTimeout(state.usageQueryDebounceTimer);
                    state.usageQueryDebounceTimer = null;
                  }
                  state.usageQueryDraft = "";
                  state.usageQuery = "";
                },
                onSessionSortChange: (sort) => {
                  state.usageSessionSort = sort;
                },
                onSessionSortDirChange: (dir) => {
                  state.usageSessionSortDir = dir;
                },
                onSessionsTabChange: (tab) => {
                  state.usageSessionsTab = tab;
                },
                onToggleColumn: (column) => {
                  if (state.usageVisibleColumns.includes(column)) {
                    state.usageVisibleColumns = state.usageVisibleColumns.filter(
                      (entry) => entry !== column,
                    );
                  } else {
                    state.usageVisibleColumns = [...state.usageVisibleColumns, column];
                  }
                },
                onSelectSession: (key, shiftKey) => {
                  state.usageTimeSeries = null;
                  state.usageSessionLogs = null;
                  state.usageRecentSessions = [
                    key,
                    ...state.usageRecentSessions.filter((entry) => entry !== key),
                  ].slice(0, 8);

                  if (shiftKey && state.usageSelectedSessions.length > 0) {
                    // Shift-click: select range from last selected to this session
                    // Sort sessions same way as displayed (by tokens or cost descending)
                    const isTokenMode = state.usageChartMode === "tokens";
                    const sortedSessions = [...(state.usageResult?.sessions ?? [])].toSorted(
                      (a, b) => {
                        const valA = isTokenMode
                          ? (a.usage?.totalTokens ?? 0)
                          : (a.usage?.totalCost ?? 0);
                        const valB = isTokenMode
                          ? (b.usage?.totalTokens ?? 0)
                          : (b.usage?.totalCost ?? 0);
                        return valB - valA;
                      },
                    );
                    const allKeys = sortedSessions.map((s) => s.key);
                    const lastSelected =
                      state.usageSelectedSessions[state.usageSelectedSessions.length - 1];
                    const lastIdx = allKeys.indexOf(lastSelected);
                    const thisIdx = allKeys.indexOf(key);
                    if (lastIdx !== -1 && thisIdx !== -1) {
                      const [start, end] =
                        lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                      const range = allKeys.slice(start, end + 1);
                      const newSelection = [...new Set([...state.usageSelectedSessions, ...range])];
                      state.usageSelectedSessions = newSelection;
                    }
                  } else {
                    // Regular click: focus a single session (so details always open).
                    // Click the focused session again to clear selection.
                    if (
                      state.usageSelectedSessions.length === 1 &&
                      state.usageSelectedSessions[0] === key
                    ) {
                      state.usageSelectedSessions = [];
                    } else {
                      state.usageSelectedSessions = [key];
                    }
                  }

                  // Load timeseries/logs only if exactly one session selected
                  if (state.usageSelectedSessions.length === 1) {
                    void loadSessionTimeSeries(state, state.usageSelectedSessions[0]);
                    void loadSessionLogs(state, state.usageSelectedSessions[0]);
                  }
                },
                onSelectDay: (day, shiftKey) => {
                  if (shiftKey && state.usageSelectedDays.length > 0) {
                    // Shift-click: select range from last selected to this day
                    const allDays = (state.usageCostSummary?.daily ?? []).map((d) => d.date);
                    const lastSelected =
                      state.usageSelectedDays[state.usageSelectedDays.length - 1];
                    const lastIdx = allDays.indexOf(lastSelected);
                    const thisIdx = allDays.indexOf(day);
                    if (lastIdx !== -1 && thisIdx !== -1) {
                      const [start, end] =
                        lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                      const range = allDays.slice(start, end + 1);
                      // Merge with existing selection
                      const newSelection = [...new Set([...state.usageSelectedDays, ...range])];
                      state.usageSelectedDays = newSelection;
                    }
                  } else {
                    // Regular click: toggle single day
                    if (state.usageSelectedDays.includes(day)) {
                      state.usageSelectedDays = state.usageSelectedDays.filter((d) => d !== day);
                    } else {
                      state.usageSelectedDays = [day];
                    }
                  }
                },
                onChartModeChange: (mode) => {
                  state.usageChartMode = mode;
                },
                onDailyChartModeChange: (mode) => {
                  state.usageDailyChartMode = mode;
                },
                onTimeSeriesModeChange: (mode) => {
                  state.usageTimeSeriesMode = mode;
                },
                onTimeSeriesBreakdownChange: (mode) => {
                  state.usageTimeSeriesBreakdownMode = mode;
                },
                onClearDays: () => {
                  state.usageSelectedDays = [];
                },
                onClearHours: () => {
                  state.usageSelectedHours = [];
                },
                onClearSessions: () => {
                  state.usageSelectedSessions = [];
                  state.usageTimeSeries = null;
                  state.usageSessionLogs = null;
                },
                onClearFilters: () => {
                  state.usageSelectedDays = [];
                  state.usageSelectedHours = [];
                  state.usageSelectedSessions = [];
                  state.usageTimeSeries = null;
                  state.usageSessionLogs = null;
                },
                // 供应商选择回调
                onSelectProvider: (providerId) => {
                  // 跳转到该供应商的详细视图
                  const baseP = window.location.pathname.split("/usage")[0] || "";
                  window.location.href = `${baseP}/usage?provider=${providerId}`;
                },
                onClearProviderFilter: () => {
                  // 清除供应商筛选，返回概览视图
                  const baseP = window.location.pathname.split("/usage")[0] || "";
                  window.location.href = `${baseP}/usage`;
                },
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
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => loadCronRuns(state, jobId),
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
                // Phase 5: 模型账号和通道策略
                modelAccountsConfig: state.modelAccountsConfig as any,
                modelAccountsLoading: state.modelAccountsLoading,
                modelAccountsError: state.modelAccountsError,
                modelAccountsSaving: (state as any).modelAccountsSaving || false,
                modelAccountsSaveSuccess: (state as any).modelAccountsSaveSuccess || false,
                // 模型账号绑定管理
                boundModelAccounts: state.boundModelAccounts,
                boundModelAccountsLoading: state.boundModelAccountsLoading,
                boundModelAccountsError: state.boundModelAccountsError,
                availableModelAccounts: state.availableModelAccounts,
                availableModelAccountsLoading: state.availableModelAccountsLoading,
                availableModelAccountsError: state.availableModelAccountsError,
                availableModelAccountsExpanded: state.availableModelAccountsExpanded,
                defaultModelAccountId: state.defaultModelAccountId,
                modelAccountOperationError: state.modelAccountOperationError,
                // 通道策略配置
                channelPoliciesConfig: state.channelPoliciesConfig as any,
                channelPoliciesLoading: state.channelPoliciesLoading,
                channelPoliciesError: state.channelPoliciesError,
                channelPoliciesSaving: (state as any).channelPoliciesSaving || false,
                channelPoliciesSaveSuccess: (state as any).channelPoliciesSaveSuccess || false,
                // 通道账号绑定管理
                boundChannelAccounts: state.boundChannelAccounts,
                boundChannelAccountsLoading: state.boundChannelAccountsLoading,
                boundChannelAccountsError: state.boundChannelAccountsError,
                availableChannelAccounts: state.availableChannelAccounts,
                availableChannelAccountsLoading: state.availableChannelAccountsLoading,
                availableChannelAccountsError: state.availableChannelAccountsError,
                availableChannelAccountsExpanded: state.availableChannelAccountsExpanded,
                channelAccountOperationError: state.channelAccountOperationError,
                editingAgent: (state as any).editingAgent || null,
                creatingAgent: (state as any).creatingAgent || false,
                deletingAgent: (state as any).deletingAgent || false,
                defaultWorkspaceRoot: (state as any).defaultWorkspaceRoot,
                isNewAgent: (state as any).isNewAgent || false,
                onRefresh: async () => {
                  await loadAgents(state);
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                },
                onSelectAgent: (agentId) => {
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
                  // 如果当前在通道策略面板，重新加载通道配置数据
                  if (state.agentsPanel === "channelPolicies") {
                    void loadChannelPolicies(state, agentId);
                    void loadBoundChannelAccounts(state, agentId);
                    void loadAvailableChannelAccounts(state, agentId);
                  }
                  // 如果当前在模型账号面板，重新加载模型账号数据
                  if (state.agentsPanel === "modelAccounts") {
                    void loadModelAccounts(state, agentId);
                    void loadBoundModelAccounts(state, agentId);
                    void loadAvailableModelAccounts(state, agentId);
                  }
                  // 如果当前在权限配置面板，重新加载权限数据
                  if (state.agentsPanel === "permissionsConfig") {
                    void loadAgentPermissions(state, agentId);
                  }
                  // 如果当前在定时任务面板，重新加载 cron 数据
                  if (state.agentsPanel === "cron") {
                    void state.loadCron();
                  }
                },
                onSelectPanel: (panel) => {
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
                    // 加载通道账号绑定管理数据
                    if (resolvedAgentId) {
                      void loadBoundChannelAccounts(state, resolvedAgentId);
                      void loadAvailableChannelAccounts(state, resolvedAgentId);
                    }
                  }
                  if (panel === "cron") {
                    void state.loadCron();
                  }
                  // Phase 5: 加载模型账号和通道策略
                  if (panel === "modelAccounts" && resolvedAgentId) {
                    void loadModelAccounts(state, resolvedAgentId);
                    void loadBoundModelAccounts(state, resolvedAgentId);
                    void loadAvailableModelAccounts(state, resolvedAgentId);
                  }
                  if (panel === "channelPolicies" && resolvedAgentId) {
                    void loadChannelPolicies(state, resolvedAgentId);
                    // 加载通道账号绑定管理数据
                    void loadBoundChannelAccounts(state, resolvedAgentId);
                    void loadAvailableChannelAccounts(state, resolvedAgentId);
                  }
                  // Phase 3: 加载权限配置（针对具体助手）
                  if (panel === "permissionsConfig" && resolvedAgentId) {
                    void loadAgentPermissions(state, resolvedAgentId);
                    void loadApprovalRequests(state);
                    void loadPermissionApprovalStats(state);
                  }
                },
                onLoadFiles: (agentId) => loadAgentFiles(state, agentId),
                onSelectFile: (name) => {
                  state.agentFileActive = name;
                  if (!resolvedAgentId) {
                    return;
                  }
                  void loadAgentFileContent(state, resolvedAgentId, name);
                },
                onFileDraftChange: (name, content) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name) => {
                  const base = state.agentFileContents[name] ?? "";
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: base };
                },
                onFileSave: (name) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  const content =
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "";
                  void saveAgentFile(state, resolvedAgentId, name, content);
                },
                onToolsProfileChange: (agentId, profile, clearAllow) => {
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
                    updateConfigFormValue(state, [...basePath, "profile"], profile);
                  } else {
                    removeConfigFormValue(state, [...basePath, "profile"]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state, [...basePath, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId, alsoAllow, deny) => {
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
                    updateConfigFormValue(state, [...basePath, "alsoAllow"], alsoAllow);
                  } else {
                    removeConfigFormValue(state, [...basePath, "alsoAllow"]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(state, [...basePath, "deny"], deny);
                  } else {
                    removeConfigFormValue(state, [...basePath, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state),
                onConfigSave: () => saveConfig(state),
                onChannelsRefresh: () => loadChannels(state, false),
                onCronRefresh: () => state.loadCron(),
                onSkillsFilterChange: (next) => (state.skillsFilter = next),
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId, skillName, enabled) => {
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
                    state.agentSkillsReport?.skills?.map((skill) => skill.name).filter(Boolean) ??
                    [];
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
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], [...next]);
                },
                onAgentSkillsClear: (agentId) => {
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
                  removeConfigFormValue(state, ["agents", "list", index, "skills"]);
                },
                onAgentSkillsDisableAll: (agentId) => {
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
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], []);
                },
                onModelChange: (agentId, modelId) => {
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
                  const basePath = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state, basePath);
                    return;
                  }
                  const entry = list[index] as { model?: unknown };
                  const existing = entry?.model;
                  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                    const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                    const next = {
                      primary: modelId,
                      ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                    };
                    updateConfigFormValue(state, basePath, next);
                  } else {
                    updateConfigFormValue(state, basePath, modelId);
                  }
                },
                onModelFallbacksChange: (agentId, fallbacks) => {
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
                  const basePath = ["agents", "list", index, "model"];
                  const entry = list[index] as { model?: unknown };
                  const normalized = fallbacks.map((name) => name.trim()).filter(Boolean);
                  const existing = entry.model;
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
                      updateConfigFormValue(state, basePath, primary);
                    } else {
                      removeConfigFormValue(state, basePath);
                    }
                    return;
                  }
                  const next = primary
                    ? { primary, fallbacks: normalized }
                    : { fallbacks: normalized };
                  updateConfigFormValue(state, basePath, next);
                },
                // Phase 5: 回调函数
                onModelAccountsChange: resolvedAgentId
                  ? async (agentId, config) => {
                      try {
                        await saveModelAccounts(state, agentId, config as any);
                        // 保存成功后重新加载
                        await loadModelAccounts(state, agentId);
                      } catch (err) {
                        console.error("Failed to save model accounts:", err);
                      }
                    }
                  : undefined,
                onChannelPoliciesChange: resolvedAgentId
                  ? async (agentId, config) => {
                      try {
                        await saveChannelPolicies(state, agentId, config as any);
                        // 保存成功后重新加载
                        await loadChannelPolicies(state, agentId);
                      } catch (err) {
                        console.error("Failed to save channel policies:", err);
                      }
                    }
                  : undefined,
                editingPolicyBinding: state.editingPolicyBinding,
                addingPolicyBinding: state.addingPolicyBinding,
                onEditPolicyBinding: (agentId, index, binding) => {
                  if (index === -1) {
                    // 添加模式，切换到编辑状态
                    state.editingPolicyBinding = { agentId, index: -1, binding };
                    state.addingPolicyBinding = null;
                  } else {
                    // 编辑模式
                    state.editingPolicyBinding = { agentId, index, binding };
                  }
                },
                onAddPolicyBinding: (agentId) => {
                  state.addingPolicyBinding = agentId;
                },
                onCancelPolicyDialog: () => {
                  state.editingPolicyBinding = null;
                  state.addingPolicyBinding = null;
                },
                onSavePolicyBinding: async (agentId, binding, index) => {
                  try {
                    const config = state.channelPoliciesConfig as any;
                    if (!config) {
                      return;
                    }

                    const bindings = Array.isArray(config.bindings) ? [...config.bindings] : [];
                    if (index !== undefined && index >= 0) {
                      // 编辑模式
                      bindings[index] = binding;
                    } else {
                      // 添加模式
                      bindings.push(binding);
                    }

                    await saveChannelPolicies(state, agentId, {
                      ...config,
                      bindings,
                    } as any);

                    // 关闭对话框
                    state.editingPolicyBinding = null;
                    state.addingPolicyBinding = null;

                    // 重新加载配置
                    await loadChannelPolicies(state, agentId);
                  } catch (err) {
                    console.error("Failed to save policy binding:", err);
                  }
                },
                // Phase 3: 权限配置回调
                onPermissionsRefresh: resolvedAgentId
                  ? (agentId) => {
                      void loadAgentPermissions(state, agentId);
                      void loadApprovalRequests(state);
                      void loadPermissionApprovalStats(state);
                    }
                  : undefined,
                onPermissionsTabChange: (tab) => {
                  state.permissionsManagementActiveTab = tab;
                },
                onPermissionChange: resolvedAgentId
                  ? (agentId, permission, granted) => {
                      // 更新权限配置
                      if (state.permissionsConfig) {
                        const config = state.permissionsConfig as any;
                        // 更新权限状态
                        // TODO: 实现权限更新逻辑
                        console.log("Permission change:", agentId, permission, granted);
                      }
                    }
                  : undefined,
                onPermissionsSaveConfig: resolvedAgentId
                  ? async (agentId) => {
                      if (state.permissionsConfig) {
                        try {
                          await saveAgentPermissions(state, agentId, state.permissionsConfig);
                        } catch (err) {
                          console.error("Failed to save permissions:", err);
                        }
                      }
                    }
                  : undefined,
                onApprovalAction: async (requestId, action, comment) => {
                  try {
                    const approver = { type: "user" as const, id: "admin" };
                    await respondToPermissionApproval(state, requestId, action, approver, comment);
                  } catch (err) {
                    console.error("Failed to respond to approval:", err);
                  }
                },
                onBatchApprove: async (requestIds, comment) => {
                  try {
                    const approver = { type: "user" as const, id: "admin" };
                    await batchApproveRequests(state, requestIds, approver, comment);
                  } catch (err) {
                    console.error("Failed to batch approve:", err);
                  }
                },
                onBatchDeny: async (requestIds, reason) => {
                  try {
                    const approver = { type: "user" as const, id: "admin" };
                    await batchDenyRequests(state, requestIds, approver, reason);
                  } catch (err) {
                    console.error("Failed to batch deny:", err);
                  }
                },
                onApprovalsFilterChange: (filter) => {
                  // TODO: 实现审批过滤
                  console.log("Approvals filter change:", filter);
                },
                onSelectApproval: (requestId, selected) => {
                  // TODO: 实现审批选择
                  console.log("Select approval:", requestId, selected);
                },
                onSelectAllApprovals: () => {
                  // TODO: 实现全选
                  console.log("Select all approvals");
                },
                onDeselectAllApprovals: () => {
                  // TODO: 实现取消全选
                  console.log("Deselect all approvals");
                },
                onShowApprovalDetail: (request) => {
                  // TODO: 实现审批详情显示
                  console.log("Show approval detail:", request);
                },
                // 模型账号绑定管理回调
                onBindModelAccount: async (accountId) => {
                  if (resolvedAgentId) {
                    await bindModelAccount(state, resolvedAgentId, accountId);
                  }
                },
                onUnbindModelAccount: async (accountId) => {
                  if (resolvedAgentId) {
                    await unbindModelAccount(state, resolvedAgentId, accountId);
                  }
                },
                onToggleAvailableModelAccounts: () => {
                  toggleAvailableModelAccountsExpanded(state);
                },
                onSetDefaultModelAccount: async (accountId) => {
                  if (resolvedAgentId) {
                    await setDefaultModelAccount(state, resolvedAgentId, accountId);
                  }
                },
                // 通道账号绑定管理回调
                onAddChannelAccount: async (channelId, accountId) => {
                  if (resolvedAgentId) {
                    await addChannelAccountBinding(state, resolvedAgentId, channelId, accountId);
                  }
                },
                onRemoveChannelAccount: async (channelId, accountId) => {
                  if (resolvedAgentId) {
                    await removeChannelAccountBinding(state, resolvedAgentId, channelId, accountId);
                  }
                },
                onToggleAvailableChannelAccounts: () => {
                  toggleAvailableAccountsExpanded(state);
                },
                onConfigurePolicy: async (channelId, accountId, currentPolicy) => {
                  // 打开策略配置对话框
                  if (resolvedAgentId) {
                    state.configuringChannelPolicy = {
                      agentId: resolvedAgentId,
                      channelId,
                      accountId,
                      currentPolicy,
                    };
                  }
                },
                onAddAgent: async () => {
                  // 加载默认工作区根目录
                  try {
                    const defaultWorkspaceRoot = await getDefaultWorkspace(state);
                    // 打开新增智能助手对话框
                    state.editingAgent = { id: "", name: "", workspace: "" };
                    (state as any).isNewAgent = true; // 标记为新增模式
                    (state as any).defaultWorkspaceRoot = defaultWorkspaceRoot;
                  } catch (err) {
                    console.error("Failed to load default workspace:", err);
                    // 即使失败也允许创建助手
                    state.editingAgent = { id: "", name: "", workspace: "" };
                    (state as any).isNewAgent = true; // 标记为新增模式
                  }
                },
                onEditAgent: (agentId) => {
                  // 打开编辑智能助手对话框
                  const agent = state.agentsList?.agents.find((a) => a.id === agentId);
                  if (agent) {
                    state.editingAgent = {
                      id: agent.id,
                      name: agent.name || "",
                      // 使用后端返回的 workspace 字段
                      workspace: agent.workspace || "",
                    };
                    (state as any).isNewAgent = false; // 编辑模式
                  }
                },
                onDeleteAgent: async (agentId) => {
                  const agent = state.agentsList?.agents.find((a) => a.id === agentId);
                  const workspace = (agent as any)?.workspaceResolved || (agent as any)?.workspace;

                  // 自定义对话框：二次确认并选择工作区操作
                  const dialogHtml = `
                    <div style="font-size: 14px;">
                      <p style="margin: 0 0 16px 0; font-weight: 500;">确定要删除智能助手 "${agentId}" 吗？</p>
                      ${
                        workspace
                          ? `
                        <p style="margin: 0 0 12px 0; color: #666;">工作区：${workspace}</p>
                        <div style="margin-bottom: 16px;">
                          <p style="margin: 0 0 8px 0; font-weight: 500;">请选择工作区操作：</p>
                          <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                            <input type="radio" name="workspace-action" value="keep" checked style="margin-right: 8px;">
                            <span>保留工作区（文件不会被删除）</span>
                          </label>
                          <label style="display: block; cursor: pointer;">
                            <input type="radio" name="workspace-action" value="delete" style="margin-right: 8px;">
                            <span style="color: #ff5c5c;">清空工作区（删除所有文件）</span>
                          </label>
                        </div>
                      `
                          : ""
                      }
                      <p style="margin: 0; color: #999; font-size: 12px;">此操作不可恢复。</p>
                    </div>
                  `;

                  // 创建自定义对话框
                  const dialog = document.createElement("div");
                  dialog.innerHTML = `
                    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                      <div style="background: white; border-radius: 8px; padding: 24px; max-width: 480px; width: 90%;">
                        ${dialogHtml}
                        <div style="display: flex; gap: 12px; margin-top: 20px; justify-content: flex-end;">
                          <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">取消</button>
                          <button id="confirm-btn" style="padding: 8px 16px; border: none; background: #ff5c5c; color: white; border-radius: 4px; cursor: pointer;">确认删除</button>
                        </div>
                      </div>
                    </div>
                  `;

                  document.body.appendChild(dialog);

                  const closeDialog = () => document.body.removeChild(dialog);

                  dialog.querySelector("#cancel-btn")!.addEventListener("click", closeDialog);
                  dialog.querySelector("#confirm-btn")!.addEventListener("click", async () => {
                    const deleteWorkspace =
                      workspace &&
                      (
                        dialog.querySelector(
                          'input[name="workspace-action"]:checked',
                        ) as HTMLInputElement
                      )?.value === "delete";
                    closeDialog();

                    try {
                      const workspaceDeleted = await deleteAgent(state, agentId, deleteWorkspace);

                      if (deleteWorkspace) {
                        if (workspaceDeleted) {
                          alert("删除成功，工作区已清空");
                        } else {
                          alert("助手已删除，但工作区删除失败，请手动删除文件夹：" + workspace);
                        }
                      } else {
                        alert("删除成功，工作区已保留");
                      }
                    } catch (err) {
                      console.error("Failed to delete agent:", err);
                      alert("删除失败: " + (err instanceof Error ? err.message : String(err)));
                    }
                  });
                },
                onSaveAgent: async () => {
                  if (!state.editingAgent) {
                    return;
                  }
                  // 验证输入
                  if (!state.editingAgent.id?.trim()) {
                    alert("请输入智能助手ID");
                    return;
                  }

                  try {
                    if ((state as any).isNewAgent) {
                      // 创建新助手
                      await createAgent(state, {
                        id: state.editingAgent.id,
                        name: state.editingAgent.name || state.editingAgent.id,
                        workspace: state.editingAgent.workspace,
                      });
                      alert("创建成功");
                    } else {
                      // 更新助手
                      await updateAgent(state, {
                        id: state.editingAgent.id,
                        name: state.editingAgent.name,
                        workspace: state.editingAgent.workspace,
                      });
                      alert("保存成功");
                    }
                    // 关闭对话框
                    state.editingAgent = null;
                    (state as any).isNewAgent = false;
                  } catch (err) {
                    console.error("Failed to save agent:", err);
                    alert("保存失败: " + (err instanceof Error ? err.message : String(err)));
                  }
                },
                onCancelEdit: () => {
                  // 关闭编辑对话框
                  state.editingAgent = null;
                  (state as any).isNewAgent = false;
                },
                onAgentFormChange: (field, value) => {
                  // 更新表单字段
                  if (state.editingAgent) {
                    state.editingAgent = {
                      ...state.editingAgent,
                      [field]: value,
                    };
                  }
                },
                onMigrateWorkspace: async (agentId) => {
                  const agent = state.agentsList?.agents.find((a) => a.id === agentId);
                  const currentWorkspace =
                    (agent as any)?.workspaceResolved || (agent as any)?.workspace;

                  // 创建迁移对话框
                  const dialog = document.createElement("div");
                  dialog.innerHTML = `
                    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                      <div style="background: white; border-radius: 8px; padding: 24px; max-width: 560px; width: 90%;">
                        <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">迁移工作区</div>
                        <div style="margin-bottom: 16px;">
                          <div style="margin-bottom: 8px; color: #666;">当前工作区：</div>
                          <div style="padding: 8px 12px; background: #f5f5f5; border-radius: 4px; font-family: monospace; word-break: break-all;">${currentWorkspace}</div>
                        </div>
                        <div style="margin-bottom: 20px;">
                          <label style="display: block; margin-bottom: 8px; font-weight: 500;">新工作区路径：</label>
                          <div style="display: flex; gap: 8px;">
                            <input id="new-workspace-input" type="text" style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;" placeholder="输入新的工作区路径" />
                            <button id="browse-btn" style="padding: 8px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">📁 浏览</button>
                          </div>
                          <div style="margin-top: 8px; font-size: 12px; color: #666;">
                            💡 提示：
                            <ul style="margin: 4px 0 0 0; padding-left: 20px; color: #666;">
                              <li>工作区文件将被复制到新路径</li>
                              <li>如果目标目录已存在文件，将进行增量复制</li>
                              <li>迁移成功后可选择是否删除原工作区</li>
                            </ul>
                          </div>
                        </div>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                          <button id="cancel-migrate-btn" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">取消</button>
                          <button id="confirm-migrate-btn" style="padding: 8px 16px; border: none; background: #0066ff; color: white; border-radius: 4px; cursor: pointer;">开始迁移</button>
                        </div>
                      </div>
                    </div>
                  `;

                  document.body.appendChild(dialog);

                  const closeDialog = () => document.body.removeChild(dialog);
                  const inputEl = dialog.querySelector("#new-workspace-input") as HTMLInputElement;

                  // 浏览按钮
                  dialog.querySelector("#browse-btn")!.addEventListener("click", () => {
                    const fileInput = document.createElement("input");
                    fileInput.type = "file";
                    fileInput.setAttribute("webkitdirectory", "");
                    fileInput.setAttribute("directory", "");
                    fileInput.onchange = (e: Event) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files && files.length > 0) {
                        inputEl.value = files[0].webkitRelativePath.split("/")[0];
                      }
                    };
                    fileInput.click();
                  });

                  dialog
                    .querySelector("#cancel-migrate-btn")!
                    .addEventListener("click", closeDialog);
                  dialog
                    .querySelector("#confirm-migrate-btn")!
                    .addEventListener("click", async () => {
                      const newWorkspace = inputEl.value.trim();
                      if (!newWorkspace) {
                        alert("请输入新的工作区路径");
                        return;
                      }

                      if (newWorkspace === currentWorkspace) {
                        alert("新路径与当前路径相同，无需迁移");
                        return;
                      }

                      closeDialog();

                      // 显示迁移进度提示
                      const progressDialog = document.createElement("div");
                      progressDialog.innerHTML = `
                      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001;">
                        <div style="background: white; border-radius: 8px; padding: 24px; text-align: center;">
                          <div style="font-size: 16px; margin-bottom: 12px;">正在迁移工作区...</div>
                          <div style="color: #666; font-size: 14px;">请稍候，正在复制文件</div>
                        </div>
                      </div>
                    `;
                      document.body.appendChild(progressDialog);

                      try {
                        const result = await migrateAgentWorkspace(state, agentId, newWorkspace);
                        document.body.removeChild(progressDialog);

                        if (result.migrated) {
                          // 迁移成功，询问是否删除原工作区
                          const confirmDialog = document.createElement("div");
                          confirmDialog.innerHTML = `
                          <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                            <div style="background: white; border-radius: 8px; padding: 24px; max-width: 480px; width: 90%;">
                              <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #22c55e;">✅ 迁移成功</div>
                              <div style="margin-bottom: 20px;">
                                <div style="margin-bottom: 12px; padding: 12px; background: #f0fdf4; border-radius: 6px; border-left: 3px solid #22c55e;">
                                  <div style="font-weight: 500; margin-bottom: 4px;">工作区已成功迁移</div>
                                  <div style="font-size: 13px; color: #666; font-family: monospace;">
                                    旧路径：${result.oldWorkspace}<br>
                                    新路径：${result.newWorkspace}
                                  </div>
                                </div>
                                <div style="padding: 12px; background: #fffbeb; border-radius: 6px; border-left: 3px solid #f59e0b;">
                                  <div style="font-weight: 500; margin-bottom: 4px;">⚠️ 原工作区处理</div>
                                  <div style="font-size: 13px; color: #666;">是否删除原工作区目录及其所有文件？</div>
                                </div>
                              </div>
                              <div style="display: flex; gap: 12px; justify-content: flex-end;">
                                <button id="keep-old-btn" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">保留原工作区</button>
                                <button id="delete-old-btn" style="padding: 8px 16px; border: none; background: #ef4444; color: white; border-radius: 4px; cursor: pointer;">删除原工作区</button>
                              </div>
                            </div>
                          </div>
                        `;

                          document.body.appendChild(confirmDialog);

                          const closeConfirmDialog = () => document.body.removeChild(confirmDialog);

                          confirmDialog
                            .querySelector("#keep-old-btn")!
                            .addEventListener("click", () => {
                              closeConfirmDialog();
                              // 刷新编辑状态
                              if (state.editingAgent && state.editingAgent.id === agentId) {
                                state.editingAgent.workspace = newWorkspace;
                              }
                            });

                          confirmDialog
                            .querySelector("#delete-old-btn")!
                            .addEventListener("click", async () => {
                              closeConfirmDialog();

                              // 显示删除进度
                              const deleteProgressDialog = document.createElement("div");
                              deleteProgressDialog.innerHTML = `
                            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001;">
                              <div style="background: white; border-radius: 8px; padding: 24px; text-align: center;">
                                <div style="font-size: 16px; margin-bottom: 12px;">正在删除原工作区...</div>
                                <div style="color: #666; font-size: 14px;">请稍候</div>
                              </div>
                            </div>
                          `;
                              document.body.appendChild(deleteProgressDialog);

                              try {
                                // 调用后端API删除原工作区
                                const deleteResult = await state.client!.request(
                                  "agent.workspace.delete",
                                  {
                                    workspace: result.oldWorkspace,
                                  },
                                );

                                document.body.removeChild(deleteProgressDialog);

                                if (deleteResult && (deleteResult as any).success) {
                                  alert("✅ 原工作区已成功删除");
                                } else {
                                  alert(
                                    "⚠️ 原工作区删除失败，请手动删除：\n" + result.oldWorkspace,
                                  );
                                }
                              } catch (err) {
                                document.body.removeChild(deleteProgressDialog);
                                console.error("Failed to delete old workspace:", err);
                                alert(
                                  "⚠️ 删除失败，请手动删除原工作区：\n" +
                                    result.oldWorkspace +
                                    "\n\n错误信息：" +
                                    (err instanceof Error ? err.message : String(err)),
                                );
                              }

                              // 刷新编辑状态
                              if (state.editingAgent && state.editingAgent.id === agentId) {
                                state.editingAgent.workspace = newWorkspace;
                              }
                            });
                        } else {
                          alert(
                            `✅ 已更新工作区配置为：\n${result.newWorkspace}\n\n（原工作区不存在，未进行文件复制）`,
                          );
                          // 刷新编辑状态
                          if (state.editingAgent && state.editingAgent.id === agentId) {
                            state.editingAgent.workspace = newWorkspace;
                          }
                        }
                      } catch (err) {
                        document.body.removeChild(progressDialog);
                        console.error("Failed to migrate workspace:", err);
                        alert(
                          "❌ 迁移失败：\n" + (err instanceof Error ? err.message : String(err)),
                        );
                      }
                    });
                },
                onConfigureDefaultWorkspace: async () => {
                  try {
                    // 获取当前默认工作区
                    const currentDefault = await getDefaultWorkspace(state);

                    // 创建配置对话框
                    const dialog = document.createElement("div");
                    dialog.innerHTML = `
                      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                        <div style="background: white; border-radius: 8px; padding: 24px; max-width: 560px; width: 90%;">
                          <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">配置默认工作区根目录</div>
                          <div style="margin-bottom: 20px;">
                            <div style="margin-bottom: 8px; color: #666;">当前默认根目录：</div>
                            <div style="padding: 8px 12px; background: #f5f5f5; border-radius: 4px; font-family: monospace; word-break: break-all; margin-bottom: 16px;">${currentDefault}</div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 500;">新的默认根目录：</label>
                            <div style="display: flex; gap: 8px;">
                              <input id="default-workspace-input" type="text" value="${currentDefault}" style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;" placeholder="输入默认工作区根目录" />
                              <button id="browse-default-btn" style="padding: 8px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">📁 浏览</button>
                            </div>
                            <div style="margin-top: 8px; font-size: 12px; color: #999;">💡 所有未指定工作区的助手将在此目录下自动生成工作区文件夹</div>
                          </div>
                          <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="cancel-config-btn" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">取消</button>
                            <button id="confirm-config-btn" style="padding: 8px 16px; border: none; background: #0066ff; color: white; border-radius: 4px; cursor: pointer;">保存</button>
                          </div>
                        </div>
                      </div>
                    `;

                    document.body.appendChild(dialog);

                    const closeDialog = () => document.body.removeChild(dialog);
                    const inputEl = dialog.querySelector(
                      "#default-workspace-input",
                    ) as HTMLInputElement;

                    // 浏览按钮
                    dialog.querySelector("#browse-default-btn")!.addEventListener("click", () => {
                      const fileInput = document.createElement("input");
                      fileInput.type = "file";
                      fileInput.setAttribute("webkitdirectory", "");
                      fileInput.setAttribute("directory", "");
                      fileInput.onchange = (e: Event) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files && files.length > 0) {
                          inputEl.value = files[0].webkitRelativePath.split("/")[0];
                        }
                      };
                      fileInput.click();
                    });

                    dialog
                      .querySelector("#cancel-config-btn")!
                      .addEventListener("click", closeDialog);
                    dialog
                      .querySelector("#confirm-config-btn")!
                      .addEventListener("click", async () => {
                        const newDefault = inputEl.value.trim();
                        if (!newDefault) {
                          alert("请输入默认工作区根目录");
                          return;
                        }

                        closeDialog();

                        try {
                          await setDefaultWorkspace(state, newDefault);
                          alert(`默认工作区根目录已更新为：\n${newDefault}`);
                        } catch (err) {
                          console.error("Failed to set default workspace:", err);
                          alert("设置失败: " + (err instanceof Error ? err.message : String(err)));
                        }
                      });
                  } catch (err) {
                    console.error("Failed to load default workspace:", err);
                    alert(
                      "加载默认工作区失败: " + (err instanceof Error ? err.message : String(err)),
                    );
                  }
                },
                onSetDefaultAgent: async (agentId) => {
                  // 二次确认
                  if (!confirm(`确定将助手 "${agentId}" 设为默认助手吗？`)) {
                    return;
                  }

                  try {
                    await setDefaultAgent(state, agentId);
                    alert(`已将 "${agentId}" 设为默认助手`);
                  } catch (err) {
                    console.error("Failed to set default agent:", err);
                    alert("设置失败: " + (err instanceof Error ? err.message : String(err)));
                  }
                },
              })
            : nothing
        }

        ${
          state.tab === "collaboration"
            ? renderCollaboration({
                activePanel: state.collaborationActivePanel,
                onSelectPanel: (panel) => {
                  state.collaborationActivePanel = panel;
                  // 切换到群组面板时加载数据
                  if (panel === "groups" && !state.groupsList) {
                    void loadGroups(state);
                  }
                  // 切换到好友面板时加载数据
                  if (panel === "friends" && state.friendsList.length === 0) {
                    // TODO: 加载好友列表，需要当前智能助手 ID
                    // void loadFriends(state, "current-agent-id");
                  }
                },
                groupsProps: {
                  loading: state.groupsLoading,
                  error: state.groupsError,
                  groupsList: state.groupsList,
                  selectedGroupId: state.groupsSelectedId,
                  activePanel: state.groupsActivePanel,
                  creatingGroup: state.creatingGroup,
                  editingGroup: state.editingGroup,
                  onRefresh: () => loadGroups(state),
                  onSelectGroup: (groupId) => {
                    state.groupsSelectedId = groupId;
                  },
                  onSelectPanel: (panel) => {
                    state.groupsActivePanel = panel;
                  },
                  onCreateGroup: () => {
                    state.creatingGroup = true;
                    state.editingGroup = null;
                  },
                  onEditGroup: (groupId) => {
                    const group = state.groupsList?.groups.find((g) => g.id === groupId);
                    if (group) {
                      state.editingGroup = group;
                      state.creatingGroup = false;
                    }
                  },
                  onDeleteGroup: async (groupId) => {
                    if (confirm(`确定要删除群组 ${groupId} 吗？`)) {
                      try {
                        await deleteGroup(state, groupId);
                      } catch (err) {
                        alert(`删除失败：${err instanceof Error ? err.message : String(err)}`);
                      }
                    }
                  },
                  onSaveGroup: async () => {
                    try {
                      const group = state.editingGroup || {
                        id: "",
                        name: "",
                        description: "",
                        isPublic: false,
                      };
                      await createGroup(state, group as any);
                      state.creatingGroup = false;
                      state.editingGroup = null;
                    } catch (err) {
                      alert(`保存失败：${err instanceof Error ? err.message : String(err)}`);
                    }
                  },
                  onCancelEdit: () => {
                    state.creatingGroup = false;
                    state.editingGroup = null;
                  },
                  onGroupFormChange: (field, value) => {
                    if (state.editingGroup) {
                      state.editingGroup = { ...state.editingGroup, [field]: value };
                    } else if (state.creatingGroup) {
                      state.editingGroup = {
                        id: "",
                        name: "",
                        ownerId: "",
                        createdAt: Date.now(),
                        members: [],
                        isPublic: false,
                        [field]: value,
                      } as any;
                    }
                  },
                  onAddMember: async (groupId, agentId, role) => {
                    try {
                      await addGroupMember(state, groupId, agentId, role);
                    } catch (err) {
                      alert(`添加成员失败：${err instanceof Error ? err.message : String(err)}`);
                    }
                  },
                  onRemoveMember: async (groupId, agentId) => {
                    try {
                      await removeGroupMember(state, groupId, agentId);
                    } catch (err) {
                      alert(`移除成员失败：${err instanceof Error ? err.message : String(err)}`);
                    }
                  },
                  onUpdateMemberRole: async (groupId, agentId, role) => {
                    try {
                      await updateGroupMemberRole(state, groupId, agentId, role);
                    } catch (err) {
                      alert(`更新角色失败：${err instanceof Error ? err.message : String(err)}`);
                    }
                  },
                },
                friendsProps: {
                  loading: state.friendsLoading,
                  error: state.friendsError,
                  friendsList: state.friendsList,
                  friendsTotal: state.friendsTotal,
                  friendRequestsLoading: state.friendRequestsLoading,
                  friendRequestsList: state.friendRequestsList,
                  selectedFriendId: state.selectedFriendId,
                  messagesLoading: state.messagesLoading,
                  messagesList: state.messagesList,
                  sendingMessage: state.sendingMessage,
                  activeSubPanel: state.friendsActiveSubPanel,
                  draftMessage: state.draftMessage,
                  onRefresh: () => {
                    // TODO: 需要当前智能助手 ID
                    // void loadFriends(state, "current-agent-id");
                  },
                  onSelectSubPanel: (panel) => {
                    state.friendsActiveSubPanel = panel;
                  },
                  onSelectFriend: (friendId) => {
                    state.selectedFriendId = friendId;
                    // 加载消息历史
                    // TODO: 需要当前智能助手 ID
                    // void loadMessages(state, "current-agent-id", friendId);
                  },
                  onAddFriend: async (toAgentId, message) => {
                    // TODO: 需要当前智能助手 ID
                    // await addFriend(state, "current-agent-id", toAgentId, message);
                  },
                  onRemoveFriend: async (friendId) => {
                    // TODO: 需要当前智能助手 ID
                    // await removeFriend(state, "current-agent-id", friendId);
                  },
                  onConfirmFriend: async (friendId, accept) => {
                    // TODO: 需要当前智能助手 ID
                    // await confirmFriend(state, "current-agent-id", friendId, accept);
                  },
                  onSendMessage: async (content) => {
                    if (state.selectedFriendId) {
                      // TODO: 需要当前智能助手 ID
                      // await sendMessage(state, "current-agent-id", state.selectedFriendId, content);
                      state.draftMessage = "";
                    }
                  },
                  onDraftMessageChange: (content) => {
                    state.draftMessage = content;
                  },
                },
                monitorProps: {
                  loading: false,
                  error: null,
                  activeSubPanel: state.monitorActiveSubPanel,
                  sessionsLoading: state.monitorSessionsLoading,
                  sessionsError: state.monitorSessionsError,
                  activeSessions: state.monitorActiveSessions,
                  messageFlowsLoading: state.monitorMessageFlowsLoading,
                  messageFlows: state.monitorMessageFlows,
                  forwardingRulesLoading: state.monitorForwardingRulesLoading,
                  forwardingRules: state.monitorForwardingRules,
                  editingRule: state.monitorEditingRule,
                  creatingRule: state.monitorCreatingRule,
                  metricsLoading: state.monitorMetricsLoading,
                  metrics: state.monitorMetrics,
                  alertsLoading: state.monitorAlertsLoading,
                  alerts: state.monitorAlerts,
                  onRefresh: () => {
                    void loadActiveSessions(state as unknown as OpenClawApp);
                    void loadMessageFlows(state as unknown as OpenClawApp);
                    void loadForwardingRules(state as unknown as OpenClawApp);
                    void loadMetrics(state as unknown as OpenClawApp);
                    void loadAlerts(state as unknown as OpenClawApp);
                  },
                  onSelectSubPanel: (panel) => {
                    state.monitorActiveSubPanel = panel;
                  },
                  onAddForwardingRule: () => {
                    state.monitorCreatingRule = true;
                    state.monitorEditingRule = null;
                  },
                  onEditForwardingRule: (rule) => {
                    state.monitorEditingRule = rule;
                    state.monitorCreatingRule = false;
                  },
                  onDeleteForwardingRule: async (ruleId) => {
                    await deleteForwardingRule(state as unknown as OpenClawApp, ruleId);
                  },
                  onSaveForwardingRule: async (rule) => {
                    if (state.monitorEditingRule) {
                      await updateForwardingRule(
                        state as unknown as OpenClawApp,
                        state.monitorEditingRule.id,
                        rule,
                      );
                    } else {
                      await addForwardingRule(state as unknown as OpenClawApp, rule as any);
                    }
                    state.monitorCreatingRule = false;
                    state.monitorEditingRule = null;
                  },
                  onCancelEditRule: () => {
                    state.monitorCreatingRule = false;
                    state.monitorEditingRule = null;
                  },
                  onRuleFormChange: (field, value) => {
                    if (state.monitorEditingRule) {
                      state.monitorEditingRule = { ...state.monitorEditingRule, [field]: value };
                    } else if (state.monitorCreatingRule) {
                      state.monitorEditingRule = {
                        id: "",
                        name: "",
                        sourceChannelId: "",
                        targetChannelId: "",
                        enabled: true,
                        createdAt: Date.now(),
                        [field]: value,
                      } as any;
                    }
                  },
                  onToggleRule: async (ruleId, enabled) => {
                    await updateForwardingRule(state as unknown as OpenClawApp, ruleId, {
                      enabled,
                    });
                  },
                  onAcknowledgeAlert: async (alertId) => {
                    await acknowledgeAlert(state as unknown as OpenClawApp, alertId);
                  },
                  onClearAllAlerts: async () => {
                    await clearAllAlerts(state as unknown as OpenClawApp);
                  },
                },
                scenariosProps: {
                  loading: state.scenariosLoading,
                  error: state.scenariosError,
                  activeSubPanel: state.scenariosActiveSubPanel,
                  scenariosList: state.scenariosList,
                  scenariosTotal: state.scenariosTotal,
                  selectedScenarioId: state.selectedScenarioId,
                  editingScenario: state.editingScenario,
                  creatingScenario: state.creatingScenario,
                  runningScenarioId: state.runningScenarioId,
                  scenarioRunsLoading: state.scenarioRunsLoading,
                  scenarioRuns: state.scenarioRuns,
                  recommendationsLoading: state.recommendationsLoading,
                  recommendations: state.recommendations,
                  onRefresh: () => {
                    void loadScenarios(state as unknown as OpenClawApp);
                  },
                  onSelectSubPanel: (panel) => {
                    state.scenariosActiveSubPanel = panel;
                    if (panel === "runs" && state.scenarioRuns.length === 0) {
                      void loadScenarioRuns(state as unknown as OpenClawApp);
                    }
                    if (panel === "recommendations" && state.recommendations.length === 0) {
                      void loadRecommendations(state as unknown as OpenClawApp);
                    }
                  },
                  onSelectScenario: (scenarioId) => {
                    state.selectedScenarioId = scenarioId;
                  },
                  onCreateScenario: () => {
                    state.creatingScenario = true;
                    state.editingScenario = null;
                  },
                  onEditScenario: (scenarioId) => {
                    const scenario = state.scenariosList.find((s) => s.id === scenarioId);
                    if (scenario) {
                      state.editingScenario = scenario;
                      state.creatingScenario = false;
                    }
                  },
                  onDeleteScenario: async (scenarioId) => {
                    if (confirm("确定要删除此场景吗？")) {
                      try {
                        await deleteScenario(state as unknown as OpenClawApp, scenarioId);
                      } catch (err) {
                        alert(`删除失败：${err instanceof Error ? err.message : String(err)}`);
                      }
                    }
                  },
                  onSaveScenario: async () => {
                    try {
                      if (state.editingScenario && state.editingScenario.id) {
                        await updateScenario(
                          state as unknown as OpenClawApp,
                          state.editingScenario.id,
                          state.editingScenario,
                        );
                      } else {
                        await createScenario(
                          state as unknown as OpenClawApp,
                          state.editingScenario as any,
                        );
                      }
                      state.creatingScenario = false;
                      state.editingScenario = null;
                    } catch (err) {
                      alert(`保存失败：${err instanceof Error ? err.message : String(err)}`);
                    }
                  },
                  onCancelEdit: () => {
                    state.creatingScenario = false;
                    state.editingScenario = null;
                  },
                  onScenarioFormChange: (field, value) => {
                    if (state.editingScenario) {
                      state.editingScenario = { ...state.editingScenario, [field]: value };
                    } else if (state.creatingScenario) {
                      state.editingScenario = {
                        id: "",
                        name: "",
                        description: "",
                        type: "custom",
                        enabled: false,
                        config: {},
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        [field]: value,
                      } as any;
                    }
                  },
                  onToggleScenario: async (scenarioId, enabled) => {
                    await updateScenario(state as unknown as OpenClawApp, scenarioId, { enabled });
                  },
                  onRunScenario: async (scenarioId) => {
                    try {
                      await runScenario(state as unknown as OpenClawApp, scenarioId);
                    } catch (err) {
                      alert(`执行失败：${err instanceof Error ? err.message : String(err)}`);
                    }
                  },
                  onApplyRecommendation: async (scenarioId) => {
                    const scenario = state.scenariosList.find((s) => s.id === scenarioId);
                    if (scenario) {
                      await updateScenario(state as unknown as OpenClawApp, scenarioId, {
                        enabled: true,
                      });
                    }
                  },
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
                onFilterChange: (next) => (state.skillsFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
                // Advanced features
                advancedMode: state.skillsAdvancedMode,
                selectedSkills: state.skillsSelectedSkills,
                filterStatus: state.skillsFilterStatus,
                filterSource: state.skillsFilterSource,
                onToggleAdvancedMode: () => toggleAdvancedMode(state),
                onSelectSkill: (skillKey, selected) => selectSkill(state, skillKey, selected),
                onSelectAll: () => selectAllSkills(state),
                onDeselectAll: () => deselectAllSkills(state),
                onBatchEnable: () => batchEnableSkills(state),
                onBatchDisable: () => batchDisableSkills(state),
                onFilterStatusChange: (status) => changeFilterStatus(state, status),
                onFilterSourceChange: (source) => changeFilterSource(state, source),
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
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
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
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatStreamStartedAt = null;
                  state.chatRunId = null;
                  state.chatQueue = [];
                  state.resetToolStream();
                  state.resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state);
                  void refreshChatAvatar(state);
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                loading: state.chatLoading,
                sending: state.chatSending,
                compactionStatus: state.compactionStatus,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: state.chatStreamStartedAt,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                onRefresh: () => {
                  state.resetToolStream();
                  return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
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
                onChatScroll: (event) => state.handleChatScroll(event),
                onDraftChange: (next) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => state.handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void state.handleAbortChat(),
                onQueueRemove: (id) => state.removeQueuedMessage(id),
                onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
                showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
                onScrollToBottom: () => state.scrollToBottom(),
                // Sidebar props for tool output viewing
                sidebarOpen: state.sidebarOpen,
                sidebarContent: state.sidebarContent,
                sidebarError: state.sidebarError,
                splitRatio: state.splitRatio,
                onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                onCloseSidebar: () => state.handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })
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
                uiHints: state.configUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: state.configSearchQuery,
                activeSection: state.configActiveSection,
                activeSubsection: state.configActiveSubsection,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                onSearchChange: (query) => (state.configSearchQuery = query),
                onSectionChange: (section) => {
                  state.configActiveSection = section;
                  state.configActiveSubsection = null;
                },
                onSubsectionChange: (section) => (state.configActiveSubsection = section),
                onReload: () => loadConfig(state),
                onSave: () => saveConfig(state),
                onApply: () => applyConfig(state),
                onUpdate: () => runUpdate(state),
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
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
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
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onScroll: (event) => state.handleLogsScroll(event),
              })
            : nothing
        }

        ${
          state.tab === "message-queue"
            ? renderMessageQueue({
                activePanel: state.messageQueueActivePanel,
                queueLoading: state.queueLoading,
                queueError: state.queueError,
                queueMessages: state.queueMessages,
                queueStats: state.queueStats,
                queueStatsLoading: state.queueStatsLoading,
                queueConfig: state.queueConfig,
                queueConfigLoading: state.queueConfigLoading,
                queueConfigSaving: state.queueConfigSaving,
                onSelectPanel: (panel) => {
                  state.messageQueueActivePanel = panel;
                  // 切换到相应 panel 时加载数据
                  if (panel === "monitor") {
                    void loadQueueStatus(state);
                    void loadQueueStats(state);
                  } else if (panel === "statistics") {
                    void loadQueueStats(state);
                  } else if (panel === "configuration") {
                    void loadQueueConfig(state);
                  }
                },
                onRefresh: () => {
                  void loadQueueStatus(state);
                  void loadQueueStats(state);
                },
                onClearQueue: () => void clearQueue(state),
                onSaveConfig: (config) => void saveQueueConfig(state, config),
              })
            : nothing
        }

        ${
          state.tab === "organization-permissions"
            ? renderOrganizationPermissions({
                loading: state.organizationDataLoading || state.permissionsConfigLoading,
                error: state.organizationDataError || state.permissionsConfigError,
                activeTab: state.orgPermActiveTab || "organization",
                // 组织架构数据
                organizationData: state.organizationData,
                selectedNodeId: state.organizationChartSelectedNode,
                viewMode: state.organizationChartViewMode,
                organizationsLoading: state.organizationDataLoading,
                organizationsError: state.organizationDataError,
                // 权限配置数据
                permissionsConfig: null, // TODO: 添加权限配置数据
                permissionsLoading: state.permissionsConfigLoading,
                permissionsSaving: state.permissionsConfigSaving,
                selectedOrgForPermission: null,
                selectedRole: null,
                // 审批管理数据
                approvalRequests: state.approvalRequests,
                approvalsLoading: state.approvalRequestsLoading,
                approvalStats: state.approvalStats,
                approvalsFilter: {
                  status: "all",
                  priority: "all",
                  type: "all",
                  requester: "all",
                  search: "",
                },
                selectedApprovals: new Set<string>(),
                selectedApprovalDetail: null,
                // 系统管理数据
                superAdmins: state.superAdminsList || [],
                superAdminsLoading: state.superAdminsLoading,
                superAdminsError: state.superAdminsError,
                systemRoles: [],
                auditLogs: [],
                // 回调函数
                onRefresh: () => {
                  const activeTab = state.orgPermActiveTab || "organization";
                  if (activeTab === "organization") {
                    console.log("Load organization data");
                  } else if (activeTab === "permissions") {
                    console.log("Load permissions config");
                  } else if (activeTab === "approvals") {
                    void loadApprovals(state);
                    void loadApprovalStats(state);
                  } else if (activeTab === "system") {
                    void loadSuperAdmins(state);
                  }
                },
                onTabChange: (tab) => {
                  state.orgPermActiveTab = tab;
                  if (tab === "organization") {
                    console.log("Load organization data");
                  } else if (tab === "permissions") {
                    console.log("Load permissions config");
                  } else if (tab === "approvals") {
                    void loadApprovals(state);
                    void loadApprovalStats(state);
                  } else if (tab === "system") {
                    void loadSuperAdmins(state);
                  }
                },
                // 组织架构回调
                onSelectNode: (nodeId) => {
                  state.organizationChartSelectedNode = nodeId;
                },
                onViewModeChange: (mode) => {
                  state.organizationChartViewMode = mode;
                },
                onCreateOrganization: () => console.log("Create organization"),
                onEditOrganization: (orgId) => console.log("Edit organization:", orgId),
                onDeleteOrganization: (orgId) => console.log("Delete organization:", orgId),
                onCreateTeam: () => console.log("Create team"),
                onEditTeam: (teamId) => console.log("Edit team:", teamId),
                onDeleteTeam: (teamId) => console.log("Delete team:", teamId),
                onAssignMember: (teamId, memberId) =>
                  console.log("Assign member:", teamId, memberId),
                // 权限配置回调
                onSelectOrgForPermission: (orgId) =>
                  console.log("Select org for permission:", orgId),
                onSelectRole: (roleId) => console.log("Select role:", roleId),
                onPermissionChange: (target, permission, granted) =>
                  console.log("Permission change:", target, permission, granted),
                onSavePermissions: () => console.log("Save permissions"),
                onCreateRole: () => console.log("Create role"),
                onEditRole: (roleId) => console.log("Edit role:", roleId),
                onDeleteRole: (roleId) => console.log("Delete role:", roleId),
                onCreateTemplate: () => console.log("Create template"),
                onApplyTemplate: (templateId, target) =>
                  console.log("Apply template:", templateId, target),
                // 审批管理回调
                onApprovalAction: async (requestId, action, comment) => {
                  try {
                    const approvalAction: "approve" | "reject" =
                      action === "deny" ? "reject" : "approve";
                    await respondToApproval(state, requestId, "admin", approvalAction, comment);
                  } catch (err) {
                    console.error("Failed to respond to approval:", err);
                  }
                },
                onBatchApprove: (requestIds, comment) =>
                  console.log("Batch approve:", requestIds, comment),
                onBatchDeny: (requestIds, reason) => console.log("Batch deny:", requestIds, reason),
                onFilterChange: (filter) => console.log("Filter change:", filter),
                onSelectApproval: (requestId, selected) =>
                  console.log("Select approval:", requestId, selected),
                onSelectAllApprovals: () => console.log("Select all approvals"),
                onDeselectAllApprovals: () => console.log("Deselect all approvals"),
                onShowApprovalDetail: (request) => console.log("Show approval detail:", request),
                // 系统管理回调
                onCreateAdmin: () => console.log("Create admin"),
                onEditAdmin: (adminId) => console.log("Edit admin:", adminId),
                onActivateAdmin: (adminId) => console.log("Activate admin:", adminId),
                onDeactivateAdmin: (adminId) => console.log("Deactivate admin:", adminId),
                onCreateSystemRole: () => console.log("Create system role"),
                onEditSystemRole: (roleId) => console.log("Edit system role:", roleId),
                onDeleteSystemRole: (roleId) => console.log("Delete system role:", roleId),
              })
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
      ${renderChannelPolicyDialog(state)}
    </div>
  `;
}
