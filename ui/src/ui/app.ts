import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
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
import type { EventLogEntry } from "./app-events.ts";
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
import type { AppViewState } from "./app-view-state.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { DreamingStatus } from "./controllers/dreaming.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import { generateUUID } from "./uuid.ts";
import type { Tab } from "./navigation.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
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
  ChatConversationContext,
  ModelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
  UpdateAvailable,
} from "./types.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";
import type { ModelAccountsConfig, ChannelPoliciesConfig } from "./views/agents.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import type { AgentTeamStatus, TeamSummary, AssignTaskForm } from "./views/team-monitor.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
    /** 启用 UI 调试日志输出 */
    __DEBUG_UI__?: boolean;
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
  clientInstanceId = generateUUID();
  connectGeneration = 0;
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() lastErrorCode: string | null = null;
  @state() serverVersion: string | null = null;
  @state() updateAvailable: UpdateAvailable | null = null;
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
  @state() fallbackStatus: import("./app-tool-stream.ts").FallbackStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatModelOverrides: Record<
    string,
    import("./chat-model-ref.ts").ChatModelOverride | null
  > = {};
  @state() chatModelsLoading = false;
  @state() chatModelCatalog: import("./types.ts").ModelCatalogEntry[] = [];
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
  pendingGatewayToken: string | null = null;

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
  @state() testingAuthId: string | null = null; // 正在测试的认证ID
  @state() oauthReauth: {
    authId: string;
    provider: string;
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    expiresIn: number;
    interval: number;
    isPolling: boolean;
    error?: string;
  } | null = null; // OAuth重认证状态

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
  @state() showPairingModal = false; // 配对请求模态框

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentsPanel:
    | "overview"
    | "files"
    | "tools"
    | "skills"
    | "channels"
    | "cron"
    | "modelAccounts"
    | "channelPolicies"
    | "permissionsConfig"
    | "identity" = "overview"; // 权限配置tab
  // Collaboration 协作管理状态
  @state() collaborationActivePanel:
    | "groups"
    | "friends"
    | "monitor"
    | "scenarios"
    | "team-monitor"
    | "projects" = "groups";
  // 群组管理状态
  @state() groupsLoading = false;
  @state() groupsList: import("./views/groups.ts").GroupsListResult | null = null;
  @state() groupsError: string | null = null;
  @state() groupsSelectedId: string | null = null;
  @state() groupsActivePanel: "list" | "members" | "settings" | "files" = "list";
  // 群组文件管理状态
  @state() groupFilesLoading = false;
  @state() groupFileContentLoading = false;
  @state() groupFilesError: string | null = null;
  @state() groupFilesList: import("./controllers/group-files.ts").GroupFilesListResult | null =
    null;
  @state() groupFileContents: Record<string, string> = {};
  @state() groupFileDrafts: Record<string, string> = {};
  @state() groupFileActive: string | null = null;
  @state() groupFileSaving = false;
  @state() groupWorkspaceMigrating = false;
  @state() creatingGroup = false;
  @state() editingGroup: import("./views/groups.ts").GroupInfo | null = null;
  // 项目管理状态
  @state() projectsLoading = false;
  @state() projectsList: import("./views/projects.ts").ProjectsListResult | null = null;
  @state() projectsError: string | null = null;
  @state() selectedProjectId: string | null = null;
  @state() activeProjectPanel: "list" | "config" | "members" | "progress" | "handoff" = "list";
  @state() creatingProject = false;
  @state() editingProject: import("./views/projects.ts").ProjectInfo | null = null;
  @state() upgradingGroupToProject = false;
  /** 项目代码根目录（用户在项目管理页面顶部设置，持久化到 localStorage） */
  @state() projectCodeRoot = localStorage.getItem("openclaw.projectCodeRoot") ?? "";
  /** 项目列表状态筛选（默认显示进行中） */
  @state() projectStatusFilter: import("./views/projects.ts").ProjectStatusFilter = "active";
  /** 删除项目确认 modal 状态 */
  @state() deleteProjectConfirm: {
    projectId: string;
    projectName: string;
    deleteWorkspace: boolean;
    deleteTasks: boolean;
    deleteGroups: boolean;
  } | null = null;
  // 项目跨团队协作 Handoff 状态
  @state() projectTeamRelations: import("./views/projects.ts").ProjectTeamRelation[] = [];
  @state() projectTeamRelationsLoading = false;
  @state() handoffForm: import("./views/projects.ts").HandoffFormState = {
    toTeamId: "",
    toTeamRole: "ops",
    fromTeamNewStatus: "support-only",
    toTeamNewStatus: "active",
    note: "",
  };
  // Friends 好友关系状态
  @state() friendsLoading = false;
  @state() friendsError: string | null = null;
  @state() friendsList: import("./controllers/friends.ts").Friend[] = [];
  @state() friendsTotal = 0;
  @state() friendRequestsLoading = false;
  @state() friendRequestsList: import("./controllers/friends.ts").FriendRequest[] = [];
  @state() selectedFriendId: string | null = null;
  @state() messagesLoading = false;
  @state() messagesList: import("./controllers/friends.ts").DirectMessage[] = [];
  @state() sendingMessage = false;
  @state() friendsActiveSubPanel: "list" | "requests" = "list";
  @state() draftMessage = "";
  // Monitor 协作监控状态
  @state() monitorActiveSubPanel: "sessions" | "flows" | "forwarding" | "metrics" | "alerts" =
    "sessions";
  @state() monitorSessionsLoading = false;
  @state() monitorSessionsError: string | null = null;
  @state() monitorActiveSessions: import("./controllers/monitor.ts").ActiveSession[] = [];
  @state() monitorMessageFlowsLoading = false;
  @state() monitorMessageFlows: import("./controllers/monitor.ts").MessageFlow[] = [];
  @state() monitorForwardingRulesLoading = false;
  @state() monitorForwardingRules: import("./controllers/monitor.ts").ForwardingRule[] = [];
  @state() monitorEditingRule: import("./controllers/monitor.ts").ForwardingRule | null = null;
  @state() monitorCreatingRule = false;
  @state() monitorMetricsLoading = false;
  @state() monitorMetrics: import("./controllers/monitor.ts").PerformanceMetrics | null = null;
  @state() monitorAlertsLoading = false;
  @state() monitorAlerts: import("./controllers/monitor.ts").Alert[] = [];
  // Scenarios 协作场景状态
  @state() scenariosActiveSubPanel: "list" | "runs" | "recommendations" | "analytics" = "list";
  @state() scenariosLoading = false;
  @state() scenariosError: string | null = null;
  @state() scenariosList: import("./controllers/scenarios.ts").CollaborationScenario[] = [];
  @state() scenariosTotal = 0;
  @state() selectedScenarioId: string | null = null;
  @state() editingScenario: import("./controllers/scenarios.ts").CollaborationScenario | null =
    null;
  @state() creatingScenario = false;
  @state() runningScenarioId: string | null = null;
  @state() scenarioRunsLoading = false;
  @state() scenarioRuns: import("./controllers/scenarios.ts").ScenarioRun[] = [];
  @state() recommendationsLoading = false;
  @state() recommendations: import("./controllers/scenarios.ts").ScenarioRecommendation[] = [];
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
  // 三文件身份体系
  @state() agentSoulFiles: { agentId: string; soul: string; agent: string; user: string } | null =
    null;
  @state() agentSoulFilesLoading = false;
  @state() agentSoulFilesError: string | null = null;
  @state() agentSoulDrafts: { soul: string; agent: string; user: string } = {
    soul: "",
    agent: "",
    user: "",
  };
  @state() agentSoulSaving = false;
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;
  @state() editingAgent: { id: string; name?: string; workspace?: string } | null = null;
  @state() creatingAgent = false;
  @state() deletingAgent = false;
  @state() isNewAgent = false;
  @state() defaultWorkspaceRoot: string | null = null;
  // Phase 5: Agents Management 状态
  @state() agentsManagementActivePanel: "detail" | "modelAccounts" | "channelPolicies" = "detail";
  @state() modelAccountsConfig: ModelAccountsConfig | null = null;
  @state() modelAccountsLoading = false;
  @state() modelAccountsError: string | null = null;
  @state() modelAccountsSaving = false;
  @state() modelAccountsSaveSuccess = false;
  // 模型账号绑定管理
  @state() boundModelAccounts: string[] = [];
  @state() boundModelDetails: Array<{
    modelId: string;
    providerId: string;
    modelName: string;
    displayName: string;
    providerName: string;
    enabled?: boolean;
  }> = [];
  @state() boundModelAccountsLoading = false;
  @state() boundModelAccountsError: string | null = null;
  @state() availableModelAccounts: string[] = [];
  @state() availableModelDetails: Array<{
    modelId: string;
    providerId: string;
    modelName: string;
    displayName: string;
    providerName: string;
  }> = [];
  @state() availableModelAccountsLoading = false;
  @state() availableModelAccountsError: string | null = null;
  @state() availableModelAccountsExpanded = false;
  @state() defaultModelAccountId = "";
  @state() modelAccountOperationError: string | null = null;
  // 模型账号配置管理
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() accountConfigs: Record<string, any> = {};
  @state() accountConfigsLoading = false;
  @state() accountConfigsError: string | null = null;
  // 模型账号配置对话框状态
  @state() configuringModelAccount: {
    agentId: string;
    accountId: string;
    // oxlint-disable-next-line typescript/no-explicit-any
    currentConfig: any;
  } | null = null;
  @state() channelPoliciesConfig: ChannelPoliciesConfig | null = null;
  @state() channelPoliciesLoading = false;
  @state() channelPoliciesError: string | null = null;
  @state() channelPoliciesSaving = false;
  @state() channelPoliciesSaveSuccess = false;
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() editingPolicyBinding: { agentId: string; index: number; binding: any } | null = null; // 正在配置的策略绑定
  @state() addingPolicyBinding: string | null = null; // 正在添加策略绑定的 agentId
  // 策略配置对话框状态
  @state() configuringChannelPolicy: {
    agentId: string;
    channelId: string;
    accountId: string;
    currentPolicy: string;
  } | null = null;
  // 通道账号绑定管理
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() boundChannelAccounts: any[] = [];
  @state() boundChannelAccountsLoading = false;
  @state() boundChannelAccountsError: string | null = null;
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() availableChannelAccounts: any[] = [];
  @state() availableChannelAccountsLoading = false;
  @state() availableChannelAccountsError: string | null = null;
  @state() availableChannelAccountsExpanded = false;
  @state() channelAccountOperationError: string | null = null;
  // 控制器期望的字段名（与 AgentChannelAccountsState 匹配）
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() boundAccounts: any[] = [];
  @state() boundAccountsLoading = false;
  @state() boundAccountsError: string | null = null;
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() availableAccounts: any[] = [];
  @state() availableAccountsLoading = false;
  @state() availableAccountsError: string | null = null;
  @state() availableAccountsExpanded = false;
  @state() addingAccount = false;
  @state() removingAccount = false;
  @state() operationError: string | null = null;
  // Phase 5: Organization Chart 状态
  @state() organizationChartViewMode: "tree" | "list" = "list";
  @state() organizationChartSelectedNode: string | null = null;
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() organizationData: any = null;
  @state() organizationDataLoading = false;
  @state() organizationDataError: string | null = null;
  // 待提交的权限变更（暂存，用户点击保存时批量提交）
  pendingPermissionChanges: Array<{ target: string; permission: string; granted: boolean }> = [];
  // Phase 5: Permissions Management 状态
  @state() permissionsManagementActiveTab: "overview" | "rules" | "audit" = "overview";
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() permissionsConfig: any = null;
  @state() permissionsConfigLoading = false;
  @state() permissionsConfigSaving = false;
  @state() permissionsConfigError: string | null = null;
  // Agent Permissions State (for agent-permissions controller)
  @state() permissionsLoading = false; // 权限加载状态
  @state() permissionsError: string | null = null; // 权限错误信息
  @state() permissionsSaving = false; // 权限保存中
  @state() permissionsSaveSuccess = false; // 权限保存成功标志
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() approvalRequests: any[] = [];
  @state() approvalRequestsLoading = false;
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() approvalStats: any = null; // 审批统计信息
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() permissionChangeHistory: any[] = [];
  @state() permissionsHistoryLoading = false;
  @state() permissionHistoryLoading = false; // 对应 agent-permissions 中的 permissionHistoryLoading
  // Approvals State (for ApprovalsState compatibility)
  @state() approvalsLoading = false; // 对应 agent-permissions 中的 approvalsLoading
  @state() approvalsError: string | null = null;
  @state() approvalsList: import("./controllers/approvals.ts").ApprovalRequest[] = [];
  @state() approvalsTotal = 0;
  @state() approvalsStats: import("./controllers/approvals.ts").ApprovalStats | null = null;
  @state() approvalsStatsLoading = false;
  // Phase 7: Super Admin State
  @state() superAdminActiveTab: "management" | "approvals" | "notifications" = "management";
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() superAdminsList: any[] = [];
  // oxlint-disable-next-line typescript/no-explicit-any
  @state() superAdminNotifications: any[] = [];

  // Message Queue 状态
  @state() messageQueueActivePanel: "monitor" | "statistics" | "configuration" = "monitor";

  // ============ 聊天导航树状态 ============
  @state() chatNavExpandedNodes = new Set<string>(["__all__"]);
  @state() chatNavCurrentContext: ChatConversationContext | null = null;
  @state() chatNavSearchQuery = "";
  @state() chatNavChannelForceJoined = false;
  // Z2 + Z4: 未读消息计数映射（sessionKey → 未读消息数）
  @state() unreadSessionMessages: Record<string, number> = {};
  // 系统工作空间根目录（概览页设置卡片用）
  @state() workspacesDir = "";
  // 注意：channelBindings 现在由后端 agent.list 直接返回，不再需要单独加载

  // 团队监控页面状态
  @state() teamMonitorStatus: AgentTeamStatus[] = [];
  @state() teamMonitorSummary: TeamSummary | null = null;
  @state() teamMonitorLoading = false;
  @state() teamMonitorError: string | null = null;
  @state() teamMonitorFilterAgentId: string | null = null;
  @state() teamMonitorFilterProjectId: string | null = null;
  @state() teamMonitorFilterStatus: string | null = null;
  @state() teamMonitorSearchKeyword = "";
  @state() teamMonitorAssignDialogOpen = false;
  @state() teamMonitorAssignSaving = false;
  @state() teamMonitorAssignError: string | null = null;
  @state() teamMonitorAssignForm: AssignTaskForm = {
    targetAgentId: "",
    title: "",
    task: "",
    priority: "medium",
  };
  @state() teamMonitorResetingTaskId: string | null = null;
  @state() teamMonitorEditDialogTask: import("./views/team-monitor.js").EditTaskForm | null = null;
  @state() teamMonitorEditSaving = false;
  @state() teamMonitorEditError: string | null = null;
  @state() teamMonitorDeletingTaskId: string | null = null;
  @state() teamMonitorCancelingTaskId: string | null = null;

  @state() queueLoading = false;
  @state() queueError: string | null = null;
  @state() queueMessages: import("./controllers/message-queue.ts").QueuedMessage[] = [];
  @state() queueStats: import("./controllers/message-queue.ts").QueueStats | null = null;
  @state() queueStatsLoading = false;
  @state() queueConfig: import("./controllers/message-queue.ts").QueueConfig | null = null;
  @state() queueConfigLoading = false;
  @state() queueConfigSaving = false;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;
  @state() sessionsHideCron = true;
  @state() sessionsSearchQuery = "";
  @state() sessionsSortColumn: "key" | "kind" | "updated" | "tokens" = "key";
  @state() sessionsSortDir: "asc" | "desc" = "asc";
  @state() sessionsPage = 0;
  @state() sessionsPageSize = 25;
  @state() sessionsSelectedKeys = new Set<string>();
  @state() sessionsExpandedCheckpointKey: string | null = null;
  @state() sessionsCheckpointItemsByKey: Record<string, import("./types.js").SessionCompactionCheckpoint[]> = {};
  @state() sessionsCheckpointLoadingKey: string | null = null;
  @state() sessionsCheckpointBusyKey: string | null = null;
  @state() sessionsCheckpointErrorByKey: Record<string, string> = {};

  @state() usageLoading = false;
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
  @state() usageResult: import("./types.js").SessionsUsageResult | null = null;
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
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
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
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
  @state() usageFilterProvider: string | null = null; // 筛选的供应商ID
  @state() usageShowProviderOverview = false; // 是否显示供应商概览视图

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronRunsTotal = 0;
  @state() cronRunsHasMore = false;
  @state() cronRunsLoadingMore = false;
  @state() cronRunsScope: "all" | "job" = "all";
  @state() cronRunsStatuses: string[] = [];
  @state() cronRunsDeliveryStatuses: string[] = [];
  @state() cronRunsStatusFilter = "";
  @state() cronRunsQuery = "";
  @state() cronRunsSortDir: "asc" | "desc" = "desc";
  @state() cronJobsTotal = 0;
  @state() cronJobsHasMore = false;
  @state() cronJobsLoadingMore = false;
  @state() cronJobsQuery = "";
  @state() cronJobsEnabledFilter = "all";
  @state() cronJobsScheduleKindFilter = "all";
  @state() cronJobsLastStatusFilter = "all";
  @state() cronJobsSortBy = "nextRunAtMs";
  @state() cronJobsSortDir: "asc" | "desc" = "asc";
  @state() cronEditingJobId: string | null = null;
  @state() cronFieldErrors: Record<string, string> = {};
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};
  // Skills Advanced Features
  @state() skillsAdvancedMode = false;
  @state() skillsSelectedSkills = new Set<string>();
  @state() skillsFilterStatus: "all" | "eligible" | "blocked" | "disabled" = "all";
  @state() skillsFilterSource: "all" | "workspace" | "built-in" | "installed" | "extra" = "all";

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugMethods: string[] = [];
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
  private monitorPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;

  // Dreaming（梦境/记忆整合）状态
  @state() dreamingStatusLoading = false;
  @state() dreamingStatusError: string | null = null;
  @state() dreamingStatus: DreamingStatus | null = null;
  @state() dreamingModeSaving = false;
  @state() dreamDiaryLoading = false;
  @state() dreamDiaryError: string | null = null;
  @state() dreamDiaryPath: string | null = null;
  @state() dreamDiaryContent: string | null = null;
  // 梦境目标选择
  @state() dreamSelectedTargetId: string | null = null;
  @state() dreamTargetsLoading = false;
  @state() dreamTargetsError: string | null = null;
  @state() dreamTargets: import("./controllers/dreaming.js").DreamTarget[] = [];
  @state() dreamTargetsDefaultId = "";
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
    const { openStorageBrowser } = await import("./controllers/storage.js");
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
    // 保留 managingChannelId，编辑弹窗将叠加在管理列表弹窗上方
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
    const accountConfig = this.extractAccountConfig(channelId, accountId);

    // name 优先取 snapshot，其次取 configForm 里的 name 字段内容
    const resolvedName =
      account?.name || (typeof accountConfig.name === "string" ? accountConfig.name : "") || "";

    console.log(
      `[handleEditAccount] channel=${channelId} accountId=${accountId}`,
      `accountSnapshot=`,
      account,
      `accountConfig=`,
      accountConfig,
      `resolvedName=`,
      resolvedName,
    );

    this.editingChannelAccount = {
      channelId,
      accountId,
      name: resolvedName,
      config: accountConfig,
    };
    // 保留 managingChannelId，编辑弹窗叠加在管理列表弹窗上方
    this.viewingChannelAccount = null;
  }

  async handleDeleteAccount(channelId: string, accountId: string) {
    if (!this.client) {
      return;
    }

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
    if (!this.client || !this.editingChannelAccount) {
      return;
    }

    const { channelId, accountId, name, config } = this.editingChannelAccount;
    const idPattern = /^[a-z0-9][a-z0-9-]*$/;

    if (!accountId || !idPattern.test(accountId)) {
      return;
    }

    // 判断是新建（handleAddAccount 初始化时 accountId 为空）还是编辑已有账号
    const existingAccounts = this.channelsSnapshot?.channelAccounts?.[channelId] ?? [];
    const isNew = !existingAccounts.some((a) => a.accountId === accountId);
    // 保存前整个系统是否已有任何通道账号（用于后续决定是否自动绑定）
    const allChannelAccounts = this.channelsSnapshot?.channelAccounts ?? {};
    const totalAccountsBefore = Object.values(allChannelAccounts).reduce(
      (sum, accounts) => sum + accounts.length,
      0,
    );
    const isFirstAccountEverAdded = totalAccountsBefore === 0;

    console.log(
      `[handleSaveAccount] channel=${channelId} accountId=${accountId}`,
      `name=`,
      name,
      `config=`,
      config,
      `isNew=`,
      isNew,
    );

    this.creatingChannelAccount = true;
    try {
      await this.client.request("channels.account.save", {
        channelId,
        accountId,
        name,
        config,
        isNew,
      });
      console.log(`[handleSaveAccount] request succeeded for ${channelId}/${accountId}`);

      // 先关闭弹窗，再异步刷新状态（避免 channels.status 超时导致"保存中"卡住）
      this.editingChannelAccount = null;
      this.managingChannelId = channelId;

      // 异步刷新配置和通道状态，不阻塞 UI 恢复
      const { loadConfig } = await import("./controllers/config.js");
      loadConfig(this).catch((err) => console.warn("[handleSaveAccount] loadConfig failed:", err));
      this.handleChannelsRefresh(false).catch((err) =>
        console.warn("[handleSaveAccount] channelsRefresh failed:", err),
      );

      // 新账号添加成功后的自动绑定逻辑
      if (isNew) {
        if (isFirstAccountEverAdded) {
          // 系统第一个通道账号 → 自动绑定给默认 agent
          await this._autoBindChannelToDefaultAgent(channelId, accountId);
        } else {
          // 非第一个账号 → 提示用户手动绑定
          alert(
            `✅ 通道账号 ${channelId}:${accountId} 已添加成功！\n\n` +
              `⚠️ 请前往【助手管理】→ 选择助手 → 【通道策略】标签页，将此账号绑定给助手后才可使用。`,
          );
        }
      }
    } catch (err) {
      console.error("Save account failed:", err);
      this.channelsError = String(err);
    } finally {
      this.creatingChannelAccount = false;
    }
  }

  /** 将通道账号自动绑定给默认 agent（首个账号添加时调用） */
  private async _autoBindChannelToDefaultAgent(
    channelId: string,
    accountId: string,
  ): Promise<void> {
    try {
      if (!this.client) {
        return;
      }
      // 找到默认 agent（default: true 或第一个）
      const agents = this.agentsList?.agents ?? [];
      const defaultAgentId =
        this.agentsList?.defaultId ||
        agents.find((a) => (a as { default?: boolean }).default)?.id ||
        agents[0]?.id;

      if (!defaultAgentId) {
        console.warn("[autoBindChannel] No default agent found, skipping auto-bind");
        alert(
          `✅ 通道账号 ${channelId}:${accountId} 已添加成功！\n\n` +
            `⚠️ 未找到默认助手，请前往【助手管理】→ 【通道策略】手动绑定后才可使用。`,
        );
        return;
      }

      // 获取默认 agent 当前的 channelBindings
      const policiesResp = await this.client.request("agent.channelPolicies.list", {
        agentId: defaultAgentId,
      });

      const currentBindings: unknown[] =
        (policiesResp as { config?: { bindings?: unknown[] } })?.config?.bindings ?? [];
      const defaultPolicy = (policiesResp as { config?: { defaultPolicy?: unknown } })?.config
        ?.defaultPolicy ?? { type: "private", config: { allowedUsers: [] } };

      // 追加新绑定
      const newBinding = {
        id: `${channelId}-${accountId}-${Date.now()}`,
        channelId,
        accountId,
        policy: { type: "private", config: { allowedUsers: [] } },
        enabled: true,
        priority: 50,
      };
      const updatedBindings = [...currentBindings, newBinding];

      await this.client.request("agent.channelPolicies.update", {
        agentId: defaultAgentId,
        config: { bindings: updatedBindings, defaultPolicy },
      });

      console.log(
        `[autoBindChannel] Auto-bound ${channelId}:${accountId} to agent ${defaultAgentId}`,
      );
      alert(
        `✅ 通道账号 ${channelId}:${accountId} 已添加成功！\n` +
          `🔗 已自动绑定给助手 "${defaultAgentId}"，可在【助手管理】→【通道策略】中调整。`,
      );
    } catch (err) {
      console.error("[autoBindChannel] Auto-bind failed:", err);
      alert(
        `✅ 通道账号 ${channelId}:${accountId} 已添加成功！\n\n` +
          `⚠️ 自动绑定助手失败，请前往【助手管理】→ 【通道策略】手动绑定后才可使用。`,
      );
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
    if (!this.editingChannelGlobalConfig) {
      return;
    }

    // 保存配置
    const { saveConfig } = await import("./controllers/config.js");
    await saveConfig(this);

    this.editingChannelGlobalConfig = null;
  }

  // ========== 项目管理 Handlers ==========

  async handleProjectsRefresh() {
    const { loadProjects } = await import("./controllers/projects.js");
    await loadProjects(this, this.client);
  }

  async handleCreateProject(projectData: {
    projectId: string;
    name: string;
    description?: string;
    workspaceRoot?: string;
    codeDir?: string;
    createGroup?: boolean;
  }) {
    const { createProject } = await import("./controllers/projects.js");
    await createProject(this, this.client, projectData);
  }

  async handleUpgradeGroupToProject(groupId: string, projectId: string) {
    const { upgradeGroupToProject } = await import("./controllers/projects.js");
    await upgradeGroupToProject(this, this.client, groupId, projectId);
  }

  handleSelectProject(projectId: string) {
    this.selectedProjectId = projectId;
  }

  handleSelectProjectPanel(panel: "list" | "config" | "members" | "progress") {
    this.activeProjectPanel = panel;
  }

  handleEditProject(project: import("./views/projects.ts").ProjectInfo) {
    this.editingProject = project;
  }

  handleCancelProjectEdit() {
    this.editingProject = null;
  }

  handleProjectFormChange(field: string, value: unknown) {
    if (!this.editingProject) {
      return;
    }
    this.editingProject = {
      ...this.editingProject,
      [field]: value,
    };
  }

  async handleSaveProject() {
    if (!this.editingProject) {
      return;
    }

    // TODO: 实现更新项目配置的逻辑，需要调用 projects.update RPC 或直接修改 PROJECT_CONFIG.json
    console.log("[App] Save project:", this.editingProject);

    // 暂时只是关闭编辑模式，后续需要补充实际保存逻辑
    this.editingProject = null;
  }

  handleProjectAddMember(projectId: string, agentId: string, role: string) {
    console.log(`[App] Add member to project: ${projectId}, agent: ${agentId}, role: ${role}`);
    // TODO: 实现添加成员的逻辑
  }

  handleProjectRemoveMember(projectId: string, agentId: string) {
    console.log(`[App] Remove member from project: ${projectId}, agent: ${agentId}`);
    // TODO: 实现移除成员的逻辑
  }

  handleProjectUpdateMemberRole(projectId: string, agentId: string, role: string) {
    console.log(`[App] Update member role: ${projectId}, agent: ${agentId}, role: ${role}`);
    // TODO: 实现更新成员角色的逻辑
  }

  handleProjectUpdateProgress(projectId: string, progress: number, notes: string) {
    console.log(
      `[App] Update project progress: ${projectId}, progress: ${progress}%, notes: ${notes}`,
    );
    // TODO: 实现更新进度的逻辑
  }

  // ========== 群组管理 Handlers ==========

  async handleGroupsRefresh() {
    const { loadGroups } = await import("./controllers/groups.js");
    await loadGroups(this, this.client);
  }

  async handleCreateGroup(groupData: {
    id: string;
    name: string;
    ownerId: string;
    description?: string;
    isPublic?: boolean;
    maxMembers?: number;
    projectId?: string;
    workspacePath?: string;
  }) {
    const { createGroup } = await import("./controllers/groups.js");
    await createGroup(this, this.client, groupData);
  }

  handleSelectGroup(groupId: string) {
    this.groupsSelectedId = groupId;
  }

  handleSelectPanel(panel: "list" | "members" | "settings" | "files") {
    this.groupsActivePanel = panel;
  }

  handleEditGroup(group: import("./views/groups.ts").GroupInfo) {
    this.editingGroup = group;
  }

  handleCancelEdit() {
    this.editingGroup = null;
  }

  async handleDeleteGroup(groupId: string) {
    const { deleteGroup } = await import("./controllers/groups.js");
    await deleteGroup(this, this.client, groupId);
  }

  handleGroupFormChange(field: string, value: unknown) {
    if (!this.editingGroup) {
      return;
    }
    this.editingGroup = {
      ...this.editingGroup,
      [field]: value,
    };
  }

  async handleSaveGroup() {
    if (!this.editingGroup) {
      return;
    }

    const { updateGroup } = await import("./controllers/groups.js");
    await updateGroup(this, this.client, this.editingGroup.id, this.editingGroup);

    this.editingGroup = null;
  }

  handleAccountFormChange(field: string, value: unknown) {
    if (!this.editingChannelAccount) {
      return;
    }

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
    const { loadChannels } = await import("./controllers/channels.js");
    await loadChannels(this, probe);
  }

  private extractAccountConfig(channelId: string, accountId: string): Record<string, unknown> {
    // 从当前配置中提取账号配置
    const cfg = this.configForm;
    if (!cfg) {
      return {};
    }

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
