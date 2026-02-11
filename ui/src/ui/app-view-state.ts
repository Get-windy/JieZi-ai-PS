import type { EventLogEntry } from "./app-events.ts";
import type { CompactionStatus } from "./app-tool-stream.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { QueuedMessage, QueueStats, QueueConfig } from "./controllers/message-queue.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import type { ThemeTransitionContext } from "./theme-transition.ts";
import type { ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ChannelsStatusSnapshot,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  NostrProfile,
  PresenceEntry,
  SessionsUsageResult,
  CostUsageSummary,
  SessionUsageTimeSeries,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
} from "./types.ts";
import type { ChatAttachment, ChatQueueItem, CronFormState } from "./ui-types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import type { SessionLogEntry } from "./views/usage.ts";

export type AppViewState = {
  settings: UiSettings;
  password: string;
  tab: Tab;
  onboarding: boolean;
  basePath: string;
  connected: boolean;
  theme: ThemeMode;
  themeResolved: "light" | "dark";
  hello: GatewayHelloOk | null;
  lastError: string | null;
  eventLog: EventLogEntry[];
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatLoading: boolean;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  chatRunId: string | null;
  compactionStatus: CompactionStatus | null;
  chatAvatarUrl: string | null;
  chatThinkingLevel: string | null;
  chatQueue: ChatQueueItem[];
  chatManualRefreshInFlight: boolean;
  nodesLoading: boolean;
  nodes: Array<Record<string, unknown>>;
  chatNewMessagesBelow: boolean;
  sidebarOpen: boolean;
  sidebarContent: string | null;
  sidebarError: string | null;
  splitRatio: number;
  scrollToBottom: (opts?: { smooth?: boolean }) => void;
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null;
  execApprovalsForm: ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalBusy: boolean;
  execApprovalError: string | null;
  pendingGatewayUrl: string | null;
  configLoading: boolean;
  configRaw: string;
  configRawOriginal: string;
  configValid: boolean | null;
  configIssues: unknown[];
  configSaving: boolean;
  configApplying: boolean;
  updateRunning: boolean;
  applySessionKey: string;
  configSnapshot: ConfigSnapshot | null;
  configSchema: unknown;
  configSchemaVersion: string | null;
  configSchemaLoading: boolean;
  configUiHints: ConfigUiHints;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormMode: "form" | "raw";
  configSearchQuery: string;
  configActiveSection: string | null;
  configActiveSubsection: string | null;
  channelsLoading: boolean;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  configFormDirty: boolean;
  // 通道账号管理状态
  editingChannelAccount: {
    channelId: string;
    accountId: string;
    name?: string;
    config: Record<string, unknown>;
  } | null;
  viewingChannelAccount: {
    channelId: string;
    accountId: string;
  } | null;
  creatingChannelAccount: boolean;
  deletingChannelAccount: boolean;
  managingChannelId: string | null;
  showAllChannelsModal: boolean;
  debuggingChannel: { channelId: string; accountId?: string } | null;
  editingChannelGlobalConfig: string | null;
  presenceLoading: boolean;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: string | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  agentsSelectedId: string | null;
  agentsPanel:
    | "overview"
    | "files"
    | "tools"
    | "skills"
    | "channels"
    | "cron"
    | "modelAccounts"
    | "channelPolicies";
  // Collaboration 协作管理状态
  collaborationActivePanel: "groups" | "friends" | "monitor" | "scenarios";
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileActive: string | null;
  agentFileSaving: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsError: string | null;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsAgentId: string | null;
  // 群组管理状态
  groupsLoading: boolean;
  groupsList: import("./views/groups.ts").GroupsListResult | null;
  groupsError: string | null;
  groupsSelectedId: string | null;
  groupsActivePanel: "list" | "members" | "settings";
  creatingGroup: boolean;
  editingGroup: import("./views/groups.ts").GroupInfo | null;
  // Friends 好友关系状态
  friendsLoading: boolean;
  friendsError: string | null;
  friendsList: import("./controllers/friends.ts").Friend[];
  friendsTotal: number;
  friendRequestsLoading: boolean;
  friendRequestsList: import("./controllers/friends.ts").FriendRequest[];
  selectedFriendId: string | null;
  messagesLoading: boolean;
  messagesList: import("./controllers/friends.ts").DirectMessage[];
  sendingMessage: boolean;
  friendsActiveSubPanel: "list" | "requests" | "chat";
  draftMessage: string;
  // Monitor 协作监控状态
  monitorActiveSubPanel: "sessions" | "flows" | "forwarding" | "metrics" | "alerts";
  monitorSessionsLoading: boolean;
  monitorSessionsError: string | null;
  monitorActiveSessions: import("./controllers/monitor.ts").ActiveSession[];
  monitorMessageFlowsLoading: boolean;
  monitorMessageFlows: import("./controllers/monitor.ts").MessageFlow[];
  monitorForwardingRulesLoading: boolean;
  monitorForwardingRules: import("./controllers/monitor.ts").ForwardingRule[];
  monitorEditingRule: import("./controllers/monitor.ts").ForwardingRule | null;
  monitorCreatingRule: boolean;
  monitorMetricsLoading: boolean;
  monitorMetrics: import("./controllers/monitor.ts").PerformanceMetrics | null;
  monitorAlertsLoading: boolean;
  monitorAlerts: import("./controllers/monitor.ts").Alert[];
  // Scenarios 协作场景状态
  scenariosActiveSubPanel: "list" | "runs" | "recommendations" | "analytics";
  scenariosLoading: boolean;
  scenariosError: string | null;
  scenariosList: import("./controllers/scenarios.ts").CollaborationScenario[];
  scenariosTotal: number;
  selectedScenarioId: string | null;
  editingScenario: import("./controllers/scenarios.ts").CollaborationScenario | null;
  creatingScenario: boolean;
  runningScenarioId: string | null;
  scenarioRunsLoading: boolean;
  scenarioRuns: import("./controllers/scenarios.ts").ScenarioRun[];
  recommendationsLoading: boolean;
  recommendations: import("./controllers/scenarios.ts").ScenarioRecommendation[];
  // Phase 5: 模型账号和通道策略
  modelAccountsConfig: Record<string, unknown> | null;
  modelAccountsLoading: boolean;
  modelAccountsError: string | null;
  modelAccountsSaving: boolean;
  modelAccountsSaveSuccess: boolean;
  // 模型账号绑定管理
  boundModelAccounts: string[];
  boundModelAccountsLoading: boolean;
  boundModelAccountsError: string | null;
  availableModelAccounts: string[];
  availableModelAccountsLoading: boolean;
  availableModelAccountsError: string | null;
  availableModelAccountsExpanded: boolean;
  defaultModelAccountId: string;
  modelAccountOperationError: string | null;
  // 模型账号配置管理
  accountConfigs: Record<string, any>; // accountId -> ModelAccountConfig
  accountConfigsLoading: boolean;
  accountConfigsError: string | null;
  // 模型账号配置对话框状态
  configuringModelAccount: {
    agentId: string;
    accountId: string;
    currentConfig: any;
  } | null;
  channelPoliciesConfig: Record<string, unknown> | null;
  channelPoliciesLoading: boolean;
  channelPoliciesError: string | null;
  channelPoliciesSaving: boolean;
  channelPoliciesSaveSuccess: boolean;
  editingPolicyBinding: { agentId: string; index: number; binding: any } | null;
  addingPolicyBinding: string | null;
  // 策略配置对话框状态
  configuringChannelPolicy: {
    agentId: string;
    channelId: string;
    accountId: string;
    currentPolicy: string;
  } | null;
  // 通道账号绑定管理
  boundChannelAccounts: any[];
  boundChannelAccountsLoading: boolean;
  boundChannelAccountsError: string | null;
  availableChannelAccounts: any[];
  availableChannelAccountsLoading: boolean;
  availableChannelAccountsError: string | null;
  availableChannelAccountsExpanded: boolean;
  channelAccountOperationError: string | null;
  // 控制器期望的字段名（与 AgentChannelAccountsState 匹配）
  boundAccounts: any[];
  boundAccountsLoading: boolean;
  boundAccountsError: string | null;
  availableAccounts: any[];
  availableAccountsLoading: boolean;
  availableAccountsError: string | null;
  availableAccountsExpanded: boolean;
  addingAccount: boolean;
  removingAccount: boolean;
  operationError: string | null;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
  usageLoading: boolean;
  usageResult: SessionsUsageResult | null;
  usageCostSummary: CostUsageSummary | null;
  usageError: string | null;
  usageStartDate: string;
  usageEndDate: string;
  usageSelectedSessions: string[];
  usageSelectedDays: string[];
  usageSelectedHours: number[];
  usageChartMode: "tokens" | "cost";
  usageDailyChartMode: "total" | "by-type";
  usageTimeSeriesMode: "cumulative" | "per-turn";
  usageTimeSeriesBreakdownMode: "total" | "by-type";
  usageTimeSeries: SessionUsageTimeSeries | null;
  usageTimeSeriesLoading: boolean;
  usageSessionLogs: SessionLogEntry[] | null;
  usageSessionLogsLoading: boolean;
  usageSessionLogsExpanded: boolean;
  usageQuery: string;
  usageQueryDraft: string;
  usageQueryDebounceTimer: number | null;
  usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors";
  usageSessionSortDir: "asc" | "desc";
  usageRecentSessions: string[];
  usageTimeZone: "local" | "utc";
  usageContextExpanded: boolean;
  usageHeaderPinned: boolean;
  usageSessionsTab: "all" | "recent";
  usageVisibleColumns: string[];
  usageLogFilterRoles: import("./views/usage.js").SessionLogRole[];
  usageLogFilterTools: string[];
  usageLogFilterHasTools: boolean;
  usageLogFilterQuery: string;
  cronLoading: boolean;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  cronError: string | null;
  cronForm: CronFormState;
  cronRunsJobId: string | null;
  cronRuns: CronRunLogEntry[];
  cronBusy: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsFilter: string;
  skillEdits: Record<string, string>;
  skillMessages: Record<string, SkillMessage>;
  skillsBusyKey: string | null;
  // Skills Advanced Features
  skillsAdvancedMode: boolean;
  skillsSelectedSkills: Set<string>;
  skillsFilterStatus: "all" | "eligible" | "blocked" | "disabled";
  skillsFilterSource: "all" | "workspace" | "built-in" | "installed" | "extra";
  debugLoading: boolean;
  debugStatus: StatusSummary | null;
  debugHealth: HealthSnapshot | null;
  debugModels: unknown[];
  debugHeartbeat: unknown;
  debugCallMethod: string;
  debugCallParams: string;
  debugCallResult: string | null;
  debugCallError: string | null;
  logsLoading: boolean;
  logsError: string | null;
  logsFile: string | null;
  logsEntries: LogEntry[];
  logsFilterText: string;
  logsLevelFilters: Record<LogLevel, boolean>;
  logsAutoFollow: boolean;
  logsTruncated: boolean;
  logsCursor: number | null;
  logsLastFetchAt: number | null;
  logsLimit: number;
  logsMaxBytes: number;
  logsAtBottom: boolean;
  // Message Queue 状态
  messageQueueActivePanel: "monitor" | "statistics" | "configuration";
  queueLoading: boolean;
  queueError: string | null;
  queueMessages: QueuedMessage[];
  queueStats: QueueStats | null;
  queueStatsLoading: boolean;
  queueConfig: QueueConfig | null;
  queueConfigLoading: boolean;
  queueConfigSaving: boolean;
  // Permissions Management 状态
  permissionsManagementActiveTab: "config" | "approvals" | "history";
  permissionsConfig: any | null;
  permissionsConfigLoading: boolean;
  permissionsConfigSaving: boolean;
  permissionsConfigError: string | null;
  // Agent Permissions State (for agent-permissions controller)
  permissionsLoading: boolean; // 权限加载状态
  permissionsError: string | null; // 权限错误信息
  permissionsSaving: boolean; // 权限保存中
  permissionsSaveSuccess: boolean; // 权限保存成功标志
  approvalRequests: any[];
  approvalRequestsLoading: boolean;
  approvalStats: any | null; // 审批统计信息
  permissionChangeHistory: any[];
  permissionsHistoryLoading: boolean;
  permissionHistoryLoading: boolean; // 对应 agent-permissions 中的 permissionHistoryLoading
  // Approvals State (for ApprovalsState compatibility)
  approvalsLoading: boolean; // 对应 agent-permissions 中的 approvalsLoading
  approvalsError: string | null;
  approvalsList: import("./controllers/approvals.ts").ApprovalRequest[];
  approvalsTotal: number;
  approvalsStats: import("./controllers/approvals.ts").ApprovalStats | null;
  approvalsStatsLoading: boolean;
  // Organization Chart 状态
  organizationChartViewMode: "tree" | "list";
  organizationChartSelectedNode: string | null;
  organizationData: any | null;
  organizationDataLoading: boolean;
  organizationDataError: string | null;
  // 组织与权限管理统一状态
  orgPermActiveTab: "organization" | "permissions" | "approvals" | "system";
  // 组织管理状态
  organizationsLoading: boolean;
  organizationsSaving: boolean;
  organizationsError: string | null;
  editingOrganization: {
    mode: "create" | "edit";
    organization: {
      id?: string;
      name: string;
      description: string;
      parentId: string;
    };
  } | null;
  // 团队管理状态
  teamsLoading: boolean;
  teamsSaving: boolean;
  teamsError: string | null;
  editingTeam: {
    mode: "create" | "edit";
    team: {
      id?: string;
      name: string;
      description: string;
      organizationId: string;
      leaderId: string;
    };
  } | null;
  // 成员分配状态
  assigningMember: {
    teamId: string;
    availableMembers: Array<{ id: string; name: string }>;
  } | null;
  // 权限配置状态
  selectedOrgForPermission: string | null;
  selectedRole: string | null;
  rolesLoading: boolean;
  rolesSaving: boolean;
  rolesError: string | null;
  editingRole: {
    mode: "create" | "edit";
    role: {
      id?: string;
      name: string;
      description: string;
      permissions: string[];
      level: number;
    };
  } | null;
  // 权限模板状态
  templatesLoading: boolean;
  templatesSaving: boolean;
  templatesError: string | null;
  editingTemplate: {
    mode: "create" | "edit";
    template: {
      id?: string;
      name: string;
      description: string;
      permissions: string[];
      targetType: "organization" | "role" | "agent";
    };
  } | null;
  // 审批管理状态（增强）
  approvalsFilterStatus: "all" | "pending" | "approved" | "denied" | "expired" | "cancelled";
  approvalsFilterPriority: "all" | "low" | "normal" | "high" | "urgent";
  approvalsFilterType: string;
  approvalsFilterRequester: string;
  approvalsFilterSearch: string;
  selectedApprovals: Set<string>;
  selectedApprovalDetail: any | null;
  // 系统管理状态（增强）
  systemRolesLoading: boolean;
  systemRolesSaving: boolean;
  systemRolesError: string | null;
  systemRoles: any[];
  editingSystemRole: any | null;
  securityPoliciesLoading: boolean;
  securityPoliciesSaving: boolean;
  securityPolicies: any | null;
  auditLogsLoading: boolean;
  auditLogsError: string | null;
  auditLogs: any[];
  auditLogsFilter: {
    startDate: string;
    endDate: string;
    userId: string;
    action: string;
  };
  // Phase 7: 超级管理员与审批系统状态
  superAdminActiveTab: "management" | "approvals" | "notifications";
  superAdminsList: any[];
  superAdminsLoading?: boolean;
  superAdminsError?: string | null;
  superAdmins?: any[];
  adminSession?: any | null;
  adminOperationsLoading?: boolean;
  adminOperationsError?: string | null;
  adminOperations?: any[];
  // approvalRequests 和 approvalRequestsLoading 已在上面定义（第334-335行）
  approvalRequestsError?: string | null;
  pendingApprovalsLoading?: boolean;
  pendingApprovalsError?: string | null;
  pendingApprovals?: any[];
  approvalStatsLoading?: boolean;
  approvalStatsError?: string | null;
  // approvalStats 已在上面定义（第341行）
  approvalPoliciesLoading?: boolean;
  approvalPoliciesError?: string | null;
  approvalPolicies?: any[];
  superAdminNotifications: any[];
  notificationsLoading?: boolean;
  notificationsError?: string | null;
  notifications?: any[];
  notificationStatsLoading?: boolean;
  notificationStatsError?: string | null;
  notificationStats?: any | null;
  client: GatewayBrowserClient | null;
  refreshSessionsAfterChat: Set<string>;
  connect: () => void;
  setTab: (tab: Tab) => void;
  setTheme: (theme: ThemeMode, context?: ThemeTransitionContext) => void;
  applySettings: (next: UiSettings) => void;
  loadOverview: () => Promise<void>;
  loadAssistantIdentity: () => Promise<void>;
  loadCron: () => Promise<void>;
  handleWhatsAppStart: (force: boolean) => Promise<void>;
  handleWhatsAppWait: () => Promise<void>;
  handleWhatsAppLogout: () => Promise<void>;
  handleChannelConfigSave: () => Promise<void>;
  handleChannelConfigReload: () => Promise<void>;
  handleNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  handleNostrProfileCancel: () => void;
  handleNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  handleNostrProfileSave: () => Promise<void>;
  handleNostrProfileImport: () => Promise<void>;
  handleNostrProfileToggleAdvanced: () => void;
  handleExecApprovalDecision: (decision: "allow-once" | "allow-always" | "deny") => Promise<void>;
  handleGatewayUrlConfirm: () => void;
  handleGatewayUrlCancel: () => void;
  handleConfigLoad: () => Promise<void>;
  handleConfigSave: () => Promise<void>;
  handleConfigApply: () => Promise<void>;
  handleConfigFormUpdate: (path: string, value: unknown) => void;
  handleConfigFormModeChange: (mode: "form" | "raw") => void;
  handleConfigRawChange: (raw: string) => void;
  handleInstallSkill: (key: string) => Promise<void>;
  handleUpdateSkill: (key: string) => Promise<void>;
  handleToggleSkillEnabled: (key: string, enabled: boolean) => Promise<void>;
  handleUpdateSkillEdit: (key: string, value: string) => void;
  handleSaveSkillApiKey: (key: string, apiKey: string) => Promise<void>;
  handleCronToggle: (jobId: string, enabled: boolean) => Promise<void>;
  handleCronRun: (jobId: string) => Promise<void>;
  handleCronRemove: (jobId: string) => Promise<void>;
  handleCronAdd: () => Promise<void>;
  handleCronRunsLoad: (jobId: string) => Promise<void>;
  handleCronFormUpdate: (path: string, value: unknown) => void;
  handleSessionsLoad: () => Promise<void>;
  handleSessionsPatch: (key: string, patch: unknown) => Promise<void>;
  handleLoadNodes: () => Promise<void>;
  handleLoadPresence: () => Promise<void>;
  handleLoadSkills: () => Promise<void>;
  handleLoadDebug: () => Promise<void>;
  handleLoadLogs: () => Promise<void>;
  handleDebugCall: () => Promise<void>;
  handleRunUpdate: () => Promise<void>;
  setPassword: (next: string) => void;
  setSessionKey: (next: string) => void;
  setChatMessage: (next: string) => void;
  handleSendChat: (messageOverride?: string, opts?: { restoreDraft?: boolean }) => Promise<void>;
  handleAbortChat: () => Promise<void>;
  removeQueuedMessage: (id: string) => void;
  handleChatScroll: (event: Event) => void;
  resetToolStream: () => void;
  resetChatScroll: () => void;
  exportLogs: (lines: string[], label: string) => void;
  handleLogsScroll: (event: Event) => void;
  handleOpenSidebar: (content: string) => void;
  handleCloseSidebar: () => void;
  handleSplitRatioChange: (ratio: number) => void;
};
