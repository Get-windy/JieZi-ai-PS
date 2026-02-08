import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  ModelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { ModelAccountsConfig, ChannelPoliciesConfig } from "./views/agents-management.js";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  @state() chatManualRefreshInFlight = false;
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;
  // 通道账号管理状态
  @state() editingChannelAccount: {
    channelId: string;
    accountId: string;
    name?: string;
    config: Record<string, unknown>;
  } | null = null;

  // 模型管理状态
  @state() modelsLoading = false;
  @state() modelsSnapshot: ModelsStatusSnapshot | null = null;
  @state() modelsError: string | null = null;
  @state() modelsLastSuccess: number | null = null;

  // 认证管理状态（新架构）
  @state() managingAuthProvider: string | null = null;
  @state() editingAuth: {
    authId?: string;
    provider: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
  } | null = null;
  @state() viewingAuth: {
    authId: string;
    provider: string;
  } | null = null;

  // 模型列表状态
  @state() managingModelsProvider: string | null = null;

  // 模型配置状态
  @state() editingModelConfig: {
    configId?: string;
    authId: string;
    provider: string;
    modelName: string;
    nickname?: string;
    enabled: boolean;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    systemPrompt?: string;
    conversationRounds?: number;
    maxIterations?: number;
    usageLimits?: {
      maxRequestsPerDay?: number;
      maxTokensPerRequest?: number;
    };
  } | null = null;

  // 可导入模型列表状态
  @state() importableModels: Array<{
    modelName: string;
    isConfigured: boolean;
    isEnabled: boolean;
    isDeprecated: boolean;
    configId?: string;
  }> | null = null;
  @state() importingAuthId: string | null = null;
  @state() importingProvider: string | null = null;
  @state() selectedImportModels: Set<string> = new Set();

  // 供应商管理状态
  @state() addingProvider = false; // 是否正在添加供应商
  @state() viewingProviderId: string | null = null; // 查看供应商 ID（只读）
  @state() providerForm: {
    selectedTemplateId: string | null; // 选中的模板 ID
    id: string;
    name: string;
    icon: string;
    website: string;
    defaultBaseUrl: string;
    apiKeyPlaceholder: string;
    isEditing?: boolean; // 是否为编辑模式
    originalId?: string; // 编辑时的原始 ID
  } | null = null;

  @state() viewingChannelAccount: {
    channelId: string;
    accountId: string;
  } | null = null; // 查看模式，只读

  // 会话存储管理状态
  @state() storageCurrentPath: string | null = null;
  @state() storageNewPath = "";
  @state() storageLoading = false;
  @state() storageMigrating = false;
  @state() storageError: string | null = null;
  @state() storageSuccess: string | null = null;
  @state() storageShowBrowser = false;
  @state() storageBrowserPath = "";
  @state() storageBrowserParent: string | null = null;
  @state() storageBrowserDirectories: { name: string; path: string }[] = [];
  @state() storageBrowserDrives: { path: string; label: string; type: string }[] = [];
  @state() storageBrowserLoading = false;
  @state() storageBrowserError: string | null = null;
  @state() creatingChannelAccount = false;
  @state() deletingChannelAccount = false;
  @state() managingChannelId: string | null = null;
  @state() showAllChannelsModal = false; // 显示所有通道弹窗
  @state() debuggingChannel: { channelId: string; accountId?: string } | null = null; // 调试状态
  @state() editingChannelGlobalConfig: string | null = null; // 正在编辑全局配置的通道ID

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: AgentsFilesListResult | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileActive: string | null = null;
  @state() agentFileSaving = false;
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  @state() agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;
  @state() editingAgent: { id: string; name?: string; workspace?: string } | null = null;
  @state() creatingAgent = false;
  @state() deletingAgent = false;
  // Phase 5: Agents Management 状态
  @state() agentsManagementActivePanel: "detail" | "modelAccounts" | "channelPolicies" = "detail";
  @state() modelAccountsConfig: ModelAccountsConfig | null = null;
  @state() modelAccountsLoading = false;
  @state() modelAccountsError: string | null = null;
  @state() channelPoliciesConfig: ChannelPoliciesConfig | null = null;
  @state() channelPoliciesLoading = false;
  @state() channelPoliciesError: string | null = null;
  // Phase 5: Organization Chart 状态
  @state() organizationChartViewMode: "tree" | "list" = "list";
  @state() organizationChartSelectedNode: string | null = null;
  @state() organizationData: any | null = null;
  @state() organizationDataLoading = false;
  @state() organizationDataError: string | null = null;
  // Phase 5: Permissions Management 状态
  @state() permissionsManagementActiveTab: "config" | "approvals" | "history" = "config";
  @state() permissionsConfig: any | null = null;
  @state() permissionsConfigLoading = false;
  @state() permissionsConfigSaving = false;
  @state() permissionsConfigError: string | null = null;
  @state() approvalRequests: any[] = [];
  @state() approvalRequestsLoading = false;
  @state() permissionsChangeHistory: any[] = [];
  @state() permissionsHistoryLoading = false;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() usageLoading = false;
  @state() usageResult: import("./types.js").SessionsUsageResult | null = null;
  @state() usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  @state() usageError: string | null = null;
  @state() usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageSelectedSessions: string[] = [];
  @state() usageSelectedDays: string[] = [];
  @state() usageSelectedHours: number[] = [];
  @state() usageChartMode: "tokens" | "cost" = "tokens";
  @state() usageDailyChartMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  @state() usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  @state() usageTimeSeriesLoading = false;
  @state() usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  @state() usageSessionLogsLoading = false;
  @state() usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  @state() usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  @state() usageQueryDraft = "";
  @state() usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  @state() usageSessionSortDir: "desc" | "asc" = "desc";
  @state() usageRecentSessions: string[] = [];
  @state() usageTimeZone: "local" | "utc" = "local";
  @state() usageContextExpanded = false;
  @state() usageHeaderPinned = false;
  @state() usageSessionsTab: "all" | "recent" = "all";
  @state() usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  @state() usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  @state() usageLogFilterTools: string[] = [];
  @state() usageLogFilterHasTools = false;
  @state() usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  @state() chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom(opts?: { smooth?: boolean }) {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
      Boolean(opts?.smooth),
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  // 会话存储管理方法
  async loadStorageCurrentPath() {
    const { loadCurrentStoragePath } = await import("./controllers/storage.js");
    await loadCurrentStoragePath(this, this.client);
  }

  async handleStorageBrowse() {
    const { openStorageBrowser, loadStorageDirectories } = await import("./controllers/storage.js");
    await openStorageBrowser(this, this.client);
  }

  handleStorageBrowserNavigate(path: string) {
    void (async () => {
      const { loadStorageDirectories } = await import("./controllers/storage.js");
      await loadStorageDirectories(this, this.client, path);
    })();
  }

  handleStorageBrowserSelect(path: string) {
    void (async () => {
      const { selectStorageFolder } = await import("./controllers/storage.js");
      selectStorageFolder(this, path);
    })();
  }

  handleStorageBrowserCancel() {
    void (async () => {
      const { closeStorageBrowser } = await import("./controllers/storage.js");
      closeStorageBrowser(this);
    })();
  }

  async handleStorageValidate() {
    const { validateStoragePath } = await import("./controllers/storage.js");
    await validateStoragePath(this, this.client, this.storageNewPath);
  }

  async handleStorageMigrate(moveFiles: boolean) {
    const { migrateStorageData } = await import("./controllers/storage.js");
    await migrateStorageData(this, this.client, this.storageNewPath, moveFiles);
  }

  // 通道账号管理方法
  handleManageAccounts(channelId: string) {
    this.managingChannelId = channelId || null;
  }

  handleAddAccount(channelId: string) {
    this.editingChannelAccount = {
      channelId,
      accountId: "",
      name: "",
      config: {},
    };
    this.managingChannelId = null;
    this.viewingChannelAccount = null;
  }

  handleViewAccount(channelId: string, accountId: string) {
    this.viewingChannelAccount = {
      channelId,
      accountId,
    };
    this.managingChannelId = null;
    this.editingChannelAccount = null;
  }

  handleEditAccount(channelId: string, accountId: string) {
    const accounts = this.channelsSnapshot?.channelAccounts?.[channelId] ?? [];
    const account = accounts.find((a) => a.accountId === accountId);

    this.editingChannelAccount = {
      channelId,
      accountId,
      name: account?.name || "",
      config: this.extractAccountConfig(channelId, accountId),
    };
    this.managingChannelId = null;
    this.viewingChannelAccount = null;
  }

  async handleDeleteAccount(channelId: string, accountId: string) {
    if (!this.client) return;

    this.deletingChannelAccount = true;
    try {
      await this.client.request("channels.account.delete", {
        channelId,
        accountId,
      });

      // 刷新配置和通道状态
      const { loadConfig } = await import("./controllers/config.js");
      await loadConfig(this);
      await this.handleChannelsRefresh(false);
      this.managingChannelId = channelId;
    } catch (err) {
      console.error("Delete account failed:", err);
      this.channelsError = String(err);
    } finally {
      this.deletingChannelAccount = false;
    }
  }

  async handleSaveAccount() {
    if (!this.client || !this.editingChannelAccount) return;

    const { channelId, accountId, name, config } = this.editingChannelAccount;
    const idPattern = /^[a-z0-9][a-z0-9-]*$/;

    if (!accountId || !idPattern.test(accountId)) {
      return;
    }

    this.creatingChannelAccount = true;
    try {
      await this.client.request("channels.account.save", {
        channelId,
        accountId,
        name,
        config,
      });

      // 刷新配置和通道状态
      const { loadConfig } = await import("./controllers/config.js");
      await loadConfig(this);
      await this.handleChannelsRefresh(false);
      this.editingChannelAccount = null;
      this.managingChannelId = channelId;
    } catch (err) {
      console.error("Save account failed:", err);
      this.channelsError = String(err);
    } finally {
      this.creatingChannelAccount = false;
    }
  }

  handleCancelAccountEdit() {
    const channelId = this.editingChannelAccount?.channelId;
    this.editingChannelAccount = null;
    if (channelId) {
      this.managingChannelId = channelId;
    }
  }

  handleCancelAccountView() {
    const channelId = this.viewingChannelAccount?.channelId;
    this.viewingChannelAccount = null;
    if (channelId) {
      this.managingChannelId = channelId;
    }
  }

  handleToggleAllChannelsModal() {
    this.showAllChannelsModal = !this.showAllChannelsModal;
  }

  handleToggleChannelVisibility(channelId: string) {
    const hiddenChannels = this.getHiddenChannels();
    if (hiddenChannels.includes(channelId)) {
      // 显示通道
      this.setHiddenChannels(hiddenChannels.filter((id) => id !== channelId));
    } else {
      // 隐藏通道
      this.setHiddenChannels([...hiddenChannels, channelId]);
    }
    this.requestUpdate();
  }

  private getHiddenChannels(): string[] {
    try {
      const stored = localStorage.getItem("openclaw.hiddenChannels");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private setHiddenChannels(channels: string[]) {
    try {
      localStorage.setItem("openclaw.hiddenChannels", JSON.stringify(channels));
    } catch (err) {
      console.error("Failed to save hidden channels:", err);
    }
  }

  handleDebugChannel(channelId: string, accountId?: string) {
    this.debuggingChannel = { channelId, accountId };
    // 触发 probe
    void this.handleChannelsRefresh(true);
  }

  handleCloseDebug() {
    this.debuggingChannel = null;
  }

  handleEditChannelGlobalConfig(channelId: string) {
    this.editingChannelGlobalConfig = channelId;
  }

  handleCancelChannelGlobalConfig() {
    this.editingChannelGlobalConfig = null;
  }

  async handleSaveChannelGlobalConfig() {
    if (!this.editingChannelGlobalConfig) return;

    // 保存配置
    const { saveConfig } = await import("./controllers/config.js");
    await saveConfig(this);

    this.editingChannelGlobalConfig = null;
  }

  handleAccountFormChange(field: string, value: unknown) {
    if (!this.editingChannelAccount) return;

    if (field.startsWith("config.")) {
      const configField = field.substring(7);
      this.editingChannelAccount = {
        ...this.editingChannelAccount,
        config: {
          ...this.editingChannelAccount.config,
          [configField]: value,
        },
      };
    } else {
      this.editingChannelAccount = {
        ...this.editingChannelAccount,
        [field]: value,
      };
    }
  }

  async handleChannelsRefresh(probe: boolean) {
    const { loadChannelsStatus } = await import("./controllers/channels.js");
    await loadChannelsStatus(this, this.client, probe);
  }

  private extractAccountConfig(channelId: string, accountId: string): Record<string, unknown> {
    // 从当前配置中提取账号配置
    const cfg = this.configForm;
    if (!cfg) return {};

    const channelsConfig = cfg.channels as Record<string, unknown> | undefined;
    const channelConfig = channelsConfig?.[channelId] as Record<string, unknown> | undefined;
    const accountsConfig = channelConfig?.accounts as Record<string, unknown> | undefined;
    const accountConfig = accountsConfig?.[accountId] as Record<string, unknown> | undefined;

    return accountConfig || {};
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
