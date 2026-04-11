import { html, nothing } from "lit";
import { listCoreToolSections } from "../../../../src/agents/tool-catalog.js";
import {
  expandToolGroups,
  normalizeToolName,
  resolveToolProfilePolicy,
} from "../../../../src/agents/tool-policy.js";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.js";
import {
  formatCronPayload,
  formatCronSchedule,
  formatCronState,
  formatNextRun,
} from "../presenter.ts";
import type {
  AgentFileEntry,
  AgentsFilesListResult,
  AgentsListResult,
  AgentIdentityResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  ModelCatalogEntry,
  SkillStatusEntry,
  SkillStatusReport,
  ToolsCatalogResult,
  ToolsEffectiveResult,
} from "../types.ts";
import { renderPolicyBindingDialog } from "./agents.channel-policy-dialog.ts";
import { renderPermissionsManagement } from "./permissions-management.ts";

export type AgentsPanel =
  | "overview"
  | "files"
  | "tools"
  | "skills"
  | "channels"
  | "cron"
  | "modelAccounts"
  | "channelPolicies"
  | "identity"
  | "permissionsConfig"; // 改名：权限配置（针对具体助手）

/**
 * Phase 5: 模型账号配置类型（Phase 1 智能路由）
 */
export type ModelAccountsConfig = {
  accounts: string[];
  routingMode: "manual" | "smart" | "roundRobin";
  smartRouting?: {
    enableCostOptimization?: boolean;
    complexityWeight?: number;
    capabilityWeight?: number;
    costWeight?: number;
    speedWeight?: number;
    complexityThresholds?: {
      simple: number;
      medium: number;
      complex: number;
    };
  };
  defaultAccountId?: string;
  enableSessionPinning?: boolean;
};

/**
 * Phase 5: 通道策略配置类型（Phase 2 多通道协作）
 */
export type ChannelPoliciesConfig = {
  bindings: ChannelBinding[];
  defaultPolicy: ChannelPolicy;
};

export type ChannelBinding = {
  channelId: string;
  accountId?: string;
  policy: ChannelPolicy;
  // 策略特定配置
  filterConfig?: {
    allowKeywords?: string[];
    blockKeywords?: string[];
    allowSenders?: string[];
    blockSenders?: string[];
  };
  scheduledConfig?: {
    timezone?: string;
    rules?: Array<{
      dayOfWeek?: number[]; // 0-6
      hourStart?: number; // 0-23
      hourEnd?: number; // 0-23
    }>;
  };
  forwardConfig?: {
    targetChannelId?: string;
    targetAccountId?: string;
    includeSource?: boolean;
  };
  broadcastConfig?: {
    targetChannels?: Array<{ channelId: string; accountId?: string }>;
  };
  queueConfig?: {
    batchSize?: number;
    maxWaitMs?: number;
  };
  moderateConfig?: {
    requireApprovalFrom?: string[]; // user IDs
    autoApproveKeywords?: string[];
  };
};

export type ChannelPolicy =
  | "private"
  | "monitor"
  | "listen-only"
  | "load-balance"
  | "queue"
  | "moderate"
  | "echo"
  | "filter"
  | "scheduled"
  | "forward"
  | "broadcast"
  | "smart-route";

export type ToolsCatalogState = {
  loading: boolean;
  error: string | null;
  result: ToolsCatalogResult | null;
};

export type ToolsEffectiveState = {
  loading: boolean;
  error: string | null;
  result: ToolsEffectiveResult | null;
};

export type AgentsProps = {
  basePath: string;
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;
  toolsCatalog: ToolsCatalogState;
  toolsEffective: ToolsEffectiveState;
  runtimeSessionKey: string;
  runtimeSessionMatchesSelectedAgent: boolean;
  modelCatalog: ModelCatalogEntry[];
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsLastSuccess: number | null;
  // Phase 5: 模型账号和通道策略
  modelAccountsConfig: ModelAccountsConfig | null;
  modelAccountsLoading: boolean;
  modelAccountsError: string | null;
  modelAccountsSaving: boolean;
  modelAccountsSaveSuccess: boolean;
  // 模型账号绑定管理
  boundModelAccounts?: string[];
  boundModelDetails?: Array<{
    modelId: string;
    providerId: string;
    modelName: string;
    displayName: string;
    providerName: string;
    enabled?: boolean;
  }>;
  boundModelAccountsLoading?: boolean;
  boundModelAccountsError?: string | null;
  availableModelAccounts?: string[];
  availableModelDetails?: Array<{
    modelId: string;
    providerId: string;
    modelName: string;
    displayName: string;
    providerName: string;
  }>;
  availableModelAccountsLoading?: boolean;
  availableModelAccountsError?: string | null;
  availableModelAccountsExpanded?: boolean;
  defaultModelAccountId?: string;
  modelAccountOperationError?: string | null;
  onBindModelAccount?: (accountId: string) => void;
  onUnbindModelAccount?: (accountId: string) => void;
  onToggleAvailableModelAccounts?: () => void;
  onSetDefaultModelAccount?: (accountId: string) => void;
  channelPoliciesConfig: ChannelPoliciesConfig | null;
  channelPoliciesLoading: boolean;
  channelPoliciesError: string | null;
  channelPoliciesSaving: boolean;
  channelPoliciesSaveSuccess: boolean;
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronError: string | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  /** 三文件身份体系：加载结果（soul/agent/user 内容） */
  agentSoulFiles: { agentId: string; soul: string; agent: string; user: string } | null;
  agentSoulFilesLoading: boolean;
  agentSoulFilesError: string | null;
  agentSoulDrafts: { soul: string; agent: string; user: string };
  agentSoulSaving: boolean;
  agentSkillsLoading: boolean;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;
  // Phase 3: 权限管理
  permissionsLoading?: boolean;
  permissionsError?: string | null;
  permissionsActiveTab?: "overview" | "rules" | "audit";
  // oxlint-disable-next-line typescript/no-explicit-any
  permissionsConfig?: any;
  permissionsConfigLoading?: boolean;
  permissionsConfigSaving?: boolean;
  // oxlint-disable-next-line typescript/no-explicit-any
  approvalRequests?: any[];
  approvalsLoading?: boolean;
  // oxlint-disable-next-line typescript/no-explicit-any
  approvalStats?: any;
  // oxlint-disable-next-line typescript/no-explicit-any
  approvalsFilter?: any;
  selectedApprovals?: Set<string>;
  // oxlint-disable-next-line typescript/no-explicit-any
  selectedApprovalDetail?: any;
  // oxlint-disable-next-line typescript/no-explicit-any
  permissionChangeHistory?: any[];
  permissionHistoryLoading?: boolean;
  // 增删改查相关状态
  editingAgent: { id: string; name?: string; workspace?: string } | null;
  creatingAgent: boolean;
  deletingAgent: boolean;
  // 回调函数
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentsPanel) => void;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  onChannelsRefresh: () => void;
  // Phase 5: 模型账号和通道策略回调
  onModelAccountsChange?: (agentId: string, config: ModelAccountsConfig) => void;
  onChannelPoliciesChange?: (agentId: string, config: ChannelPoliciesConfig) => void;
  editingPolicyBinding?: { agentId: string; index: number; binding: ChannelBinding } | null;
  addingPolicyBinding?: string | null;
  onEditPolicyBinding?: (agentId: string, index: number, binding: ChannelBinding) => void;
  onAddPolicyBinding?: (agentId: string) => void;
  onCancelPolicyDialog?: () => void;
  onSavePolicyBinding?: (agentId: string, binding: ChannelBinding, index?: number) => void;
  onCronRefresh: () => void;
  onSkillsFilterChange: (next: string) => void;
  onSkillsRefresh: () => void;
  onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear: (agentId: string) => void;
  onAgentSkillsDisableAll: (agentId: string) => void;
  // 通道账号绑定管理
  // oxlint-disable-next-line typescript/no-explicit-any
  boundChannelAccounts?: any[];
  boundChannelAccountsLoading?: boolean;
  boundChannelAccountsError?: string | null;
  // oxlint-disable-next-line typescript/no-explicit-any
  availableChannelAccounts?: any[];
  availableChannelAccountsLoading?: boolean;
  availableChannelAccountsError?: string | null;
  availableChannelAccountsExpanded?: boolean;
  channelAccountOperationError?: string | null;
  onAddChannelAccount?: (channelId: string, accountId: string) => void;
  onRemoveChannelAccount?: (channelId: string, accountId: string) => void;
  onToggleAvailableChannelAccounts?: () => void;
  onConfigurePolicy?: (
    channelId: string,
    accountId: string,
    currentPolicy: string,
  ) => void | Promise<void>;
  // Phase 3: 权限管理回调
  onPermissionsRefresh?: (agentId: string) => void;
  onPermissionsTabChange?: (tab: "overview" | "rules" | "audit") => void;
  onPermissionChange?: (agentId: string, permission: string, granted: boolean) => void;
  onInitPermissions?: (agentId: string) => Promise<void>;
  onPermissionsSaveConfig?: (agentId: string) => void;
  /** 权限规则增删改后保存整个新配置 */
  // oxlint-disable-next-line typescript/no-explicit-any
  onPermissionsConfigChange?: (agentId: string, config: any) => Promise<void>;
  onApprovalAction?: (requestId: string, action: "approve" | "deny", comment?: string) => void;
  onBatchApprove?: (requestIds: string[], comment?: string) => void;
  onBatchDeny?: (requestIds: string[], reason: string) => void;
  // oxlint-disable-next-line typescript/no-explicit-any
  onApprovalsFilterChange?: (filter: any) => void;
  onSelectApproval?: (requestId: string, selected: boolean) => void;
  onSelectAllApprovals?: () => void;
  onDeselectAllApprovals?: () => void;
  // oxlint-disable-next-line typescript/no-explicit-any
  onShowApprovalDetail?: (request: any) => void;
  // 增删改查回调
  onAddAgent: () => void;
  onEditAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onSaveAgent: () => void;
  onCancelEdit: () => void;
  onAgentFormChange: (field: string, value: string) => void;
  onMigrateWorkspace?: (agentId: string) => void | Promise<void>;
  onConfigureDefaultWorkspace?: () => void | Promise<void>;
  onSetDefaultAgent?: (agentId: string) => void | Promise<void>;
  /** 添加新文件到助手工作空间 */
  onAddFile?: (agentId: string, name: string) => void;
  /** 用系统文件管理器打开工作空间文件夹 */
  onOpenFolder?: (folderPath: string) => void;
  /** 三文件身份体系回调 */
  onLoadSoulFiles?: (agentId: string) => void;
  onSoulDraftChange?: (file: "soul" | "agent" | "user", content: string) => void;
  onSoulFilesSave?: (agentId: string) => void;
};

// 从 tool-catalog.ts 动态派生 —— 以后只需在 tool-catalog.ts + i18n.ts 添加工具，此处自动同步
const TOOL_SECTIONS = listCoreToolSections().map((section) => ({
  id: section.id,
  label: () => t(`agents.tools.section.${section.id}`, section.label),
  tools: section.tools.map((tool) => ({
    id: tool.id,
    label: tool.id,
    description: () => t(`agents.tools.tool.${tool.id}`, tool.description),
  })),
}));

const PROFILE_OPTIONS = [
  { id: "minimal", label: () => t("agents.tools.preset_minimal") },
  { id: "coding", label: () => t("agents.tools.preset_coding") },
  { id: "messaging", label: () => t("agents.tools.preset_messaging") },
  { id: "full", label: () => t("agents.tools.preset_full") },
] as const;

type ToolPolicy = {
  allow?: string[];
  deny?: string[];
};

type AgentConfigEntry = {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: unknown;
  skills?: string[];
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

type ConfigSnapshot = {
  agents?: {
    defaults?: { workspace?: string; model?: unknown; models?: Record<string, { alias?: string }> };
    list?: AgentConfigEntry[];
  };
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

function normalizeAgentLabel(agent: { id: string; name?: string; identity?: { name?: string } }) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function isLikelyEmoji(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.length > 16) {
    return false;
  }
  let hasNonAscii = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charCodeAt(i) > 127) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) {
    return false;
  }
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".")) {
    return false;
  }
  return true;
}

function resolveAgentEmoji(
  agent: { identity?: { emoji?: string; avatar?: string } },
  agentIdentity?: AgentIdentityResult | null,
) {
  const identityEmoji = agentIdentity?.emoji?.trim();
  if (identityEmoji && isLikelyEmoji(identityEmoji)) {
    return identityEmoji;
  }
  const agentEmoji = agent.identity?.emoji?.trim();
  if (agentEmoji && isLikelyEmoji(agentEmoji)) {
    return agentEmoji;
  }
  const identityAvatar = agentIdentity?.avatar?.trim();
  if (identityAvatar && isLikelyEmoji(identityAvatar)) {
    return identityAvatar;
  }
  const avatar = agent.identity?.avatar?.trim();
  if (avatar && isLikelyEmoji(avatar)) {
    return avatar;
  }
  return "";
}

function agentBadgeText(agentId: string, defaultId: string | null) {
  return defaultId && agentId === defaultId ? t("agents.default_badge") : null;
}

function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes)) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function resolveAgentConfig(config: Record<string, unknown> | null, agentId: string) {
  const cfg = config as ConfigSnapshot | null;
  const list = cfg?.agents?.list ?? [];
  const entry = list.find((agent) => agent?.id === agentId);
  return {
    entry,
    defaults: cfg?.agents?.defaults,
    globalTools: cfg?.tools,
  };
}

type AgentContext = {
  workspace: string;
  model: string;
  identityName: string;
  identityEmoji: string;
  skillsLabel: string;
  isDefault: boolean;
};

function buildAgentContext(
  agent: AgentsListResult["agents"][number],
  configForm: Record<string, unknown> | null,
  agentFilesList: AgentsFilesListResult | null,
  defaultId: string | null,
  agentIdentity?: AgentIdentityResult | null,
): AgentContext {
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace =
    workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const modelLabel = config.entry?.model
    ? resolveModelLabel(config.entry?.model)
    : resolveModelLabel(config.defaults?.model);
  const identityName =
    agentIdentity?.name?.trim() ||
    agent.identity?.name?.trim() ||
    agent.name?.trim() ||
    config.entry?.name ||
    agent.id;
  const identityEmoji = resolveAgentEmoji(agent, agentIdentity) || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  return {
    workspace,
    model: modelLabel,
    identityName,
    identityEmoji,
    skillsLabel: skillFilter
      ? t("agents.overview.selected_skills").replace("{count}", String(skillCount))
      : t("agents.overview.all_skills"),
    isDefault: Boolean(defaultId && agent.id === defaultId),
  };
}

function resolveModelLabel(model?: unknown): string {
  if (!model) {
    return "-";
  }
  if (typeof model === "string") {
    return model.trim() || "-";
  }
  if (typeof model === "object" && model) {
    const record = model as { primary?: string; fallbacks?: string[] };
    const primary = record.primary?.trim();
    if (primary) {
      const fallbackCount = Array.isArray(record.fallbacks) ? record.fallbacks.length : 0;
      return fallbackCount > 0 ? `${primary} (+${fallbackCount} fallback)` : primary;
    }
  }
  return "-";
}

function normalizeModelValue(label: string): string {
  const match = label.match(/^(.+) \(\+\d+ fallback\)$/);
  return match ? match[1] : label;
}

function resolveModelPrimary(model?: unknown): string | null {
  if (!model) {
    return null;
  }
  if (typeof model === "string") {
    const trimmed = model.trim();
    return trimmed || null;
  }
  if (typeof model === "object" && model) {
    const record = model as Record<string, unknown>;
    const candidate =
      typeof record.primary === "string"
        ? record.primary
        : typeof record.model === "string"
          ? record.model
          : typeof record.id === "string"
            ? record.id
            : typeof record.value === "string"
              ? record.value
              : null;
    const primary = candidate?.trim();
    return primary || null;
  }
  return null;
}

function resolveModelFallbacks(model?: unknown): string[] | null {
  if (!model || typeof model === "string") {
    return null;
  }
  if (typeof model === "object" && model) {
    const record = model as Record<string, unknown>;
    const fallbacks = Array.isArray(record.fallbacks)
      ? record.fallbacks
      : Array.isArray(record.fallback)
        ? record.fallback
        : null;
    return fallbacks
      ? fallbacks.filter((entry): entry is string => typeof entry === "string")
      : null;
  }
  return null;
}

function parseFallbackList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

type ConfiguredModelOption = {
  value: string;
  label: string;
};

function resolveConfiguredModels(
  configForm: Record<string, unknown> | null,
): ConfiguredModelOption[] {
  const cfg = configForm as ConfigSnapshot | null;
  const models = cfg?.agents?.defaults?.models;
  if (!models || typeof models !== "object") {
    return [];
  }
  const options: ConfiguredModelOption[] = [];
  for (const [modelId, modelRaw] of Object.entries(models)) {
    const trimmed = modelId.trim();
    if (!trimmed) {
      continue;
    }
    const alias =
      modelRaw && typeof modelRaw === "object" && "alias" in modelRaw
        ? typeof (modelRaw as { alias?: unknown }).alias === "string"
          ? (modelRaw as { alias?: string }).alias?.trim()
          : undefined
        : undefined;
    const label = alias && alias !== trimmed ? `${alias} (${trimmed})` : trimmed;
    options.push({ value: trimmed, label });
  }
  return options;
}

function buildModelOptions(configForm: Record<string, unknown> | null, current?: string | null) {
  const options = resolveConfiguredModels(configForm);
  const hasCurrent = current ? options.some((option) => option.value === current) : false;
  if (current && !hasCurrent) {
    options.unshift({
      value: current,
      label: t("agents.overview.current_model").replace("{model}", current),
    });
  }
  if (options.length === 0) {
    return html`
      <option value="" disabled>${t("agents.overview.no_models")}</option>
    `;
  }
  return options.map((option) => html`<option value=${option.value}>${option.label}</option>`);
}

type CompiledPattern =
  | { kind: "all" }
  | { kind: "exact"; value: string }
  | { kind: "regex"; value: RegExp };

function compilePattern(pattern: string): CompiledPattern {
  const normalized = normalizeToolName(pattern);
  if (!normalized) {
    return { kind: "exact", value: "" };
  }
  if (normalized === "*") {
    return { kind: "all" };
  }
  if (!normalized.includes("*")) {
    return { kind: "exact", value: normalized };
  }
  const escaped = normalized.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  return { kind: "regex", value: new RegExp(`^${escaped.replaceAll("\\*", ".*")}$`) };
}

function compilePatterns(patterns?: string[]): CompiledPattern[] {
  if (!Array.isArray(patterns)) {
    return [];
  }
  return expandToolGroups(patterns)
    .map(compilePattern)
    .filter((pattern) => {
      return pattern.kind !== "exact" || pattern.value.length > 0;
    });
}

function matchesAny(name: string, patterns: CompiledPattern[]) {
  for (const pattern of patterns) {
    if (pattern.kind === "all") {
      return true;
    }
    if (pattern.kind === "exact" && name === pattern.value) {
      return true;
    }
    if (pattern.kind === "regex" && pattern.value.test(name)) {
      return true;
    }
  }
  return false;
}

function isAllowedByPolicy(name: string, policy?: ToolPolicy) {
  if (!policy) {
    return true;
  }
  const normalized = normalizeToolName(name);
  const deny = compilePatterns(policy.deny);
  if (matchesAny(normalized, deny)) {
    return false;
  }
  const allow = compilePatterns(policy.allow);
  if (allow.length === 0) {
    return true;
  }
  if (matchesAny(normalized, allow)) {
    return true;
  }
  if (normalized === "apply_patch" && matchesAny("exec", allow)) {
    return true;
  }
  return false;
}

function matchesList(name: string, list?: string[]) {
  if (!Array.isArray(list) || list.length === 0) {
    return false;
  }
  const normalized = normalizeToolName(name);
  const patterns = compilePatterns(list);
  if (matchesAny(normalized, patterns)) {
    return true;
  }
  if (normalized === "apply_patch" && matchesAny("exec", patterns)) {
    return true;
  }
  return false;
}

/**
 * 计算当前 agent 已启用的工具集合（用于权限规则页过滤）
 */
function computeEnabledToolIds(
  configForm: Record<string, unknown> | null,
  agentId: string,
): Set<string> {
  const config = resolveAgentConfig(configForm, agentId);
  const agentTools = (config.entry?.tools ?? {}) as {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
  const globalTools = (config.globalTools ?? {}) as { profile?: string };
  const profile = agentTools.profile ?? globalTools.profile ?? "full";
  const hasAgentAllow = Array.isArray(agentTools.allow) && agentTools.allow.length > 0;
  const alsoAllow: string[] = hasAgentAllow
    ? []
    : Array.isArray(agentTools.alsoAllow)
      ? agentTools.alsoAllow
      : [];
  const deny: string[] = hasAgentAllow ? [] : Array.isArray(agentTools.deny) ? agentTools.deny : [];
  const basePolicy = hasAgentAllow
    ? { allow: agentTools.allow ?? [], deny: agentTools.deny ?? [] }
    : (resolveToolProfilePolicy(profile) ?? undefined);
  const enabled = new Set<string>();
  for (const section of TOOL_SECTIONS) {
    for (const tool of section.tools) {
      const baseAllowed = isAllowedByPolicy(tool.id, basePolicy);
      const extraAllowed = matchesList(tool.id, alsoAllow);
      const denied = matchesList(tool.id, deny);
      if ((baseAllowed || extraAllowed) && !denied) {
        enabled.add(tool.id);
      }
    }
  }
  return enabled;
}

/**
 * Phase 5: 渲染模型配置面板（模型账号绑定 + 智能路由）
 */
function renderAgentModelAccounts(params: {
  agentId: string;
  config: ModelAccountsConfig | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveSuccess: boolean;
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
  // oxlint-disable-next-line typescript/no-explicit-any
  accountConfigs?: Record<string, any>;
  // 回调
  onChange?: (agentId: string, config: ModelAccountsConfig) => void;
  onBindModelAccount?: (accountId: string) => void;
  onUnbindModelAccount?: (accountId: string) => void;
  onToggleAvailableModelAccounts?: () => void;
  onSetDefaultModelAccount?: (accountId: string) => void;
  onToggleAccountEnabled?: (accountId: string, enabled: boolean) => void;
}) {
  if (params.loading || params.boundModelAccountsLoading) {
    return html`
      <section class="card">
        <div class="card-title">模型配置</div>
        <div class="loading">${t("agents.loading")}</div>
      </section>
    `;
  }

  if (params.error || params.boundModelAccountsError) {
    return html`
      <section class="card">
        <div class="card-title">模型配置</div>
        <div class="error">${params.error || params.boundModelAccountsError}</div>
      </section>
    `;
  }

  const config = params.config;
  const boundCount = params.boundModelAccounts.length;
  const hasMultipleAccounts = boundCount > 1;

  return html`
    <section class="card">
      <div class="card-title">模型配置</div>
      <div class="card-sub">管理此助手可以使用的模型账号和智能路由策略</div>
      
      ${
        params.saveSuccess
          ? html`
        <div class="callout success" style="margin-top: 12px;">
          ✓ ${t("agents.save_success")}
        </div>
      `
          : nothing
      }
      ${
        params.modelAccountOperationError
          ? html`
        <div class="callout danger" style="margin-top: 12px;">
          ${params.modelAccountOperationError}
        </div>
      `
          : nothing
      }

      <!-- Part 1: 模型账号连接管理 -->
      <div style="margin-top: 20px;">
        <div class="label">已绑定的模型账号 (${boundCount})</div>
        ${
          boundCount === 0
            ? html`
                <div class="muted" style="margin-top: 8px">还没有绑定任何模型账号</div>
              `
            : html`
              <div class="list" style="margin-top: 8px;">
                ${params.boundModelAccounts.map((accountId: string) => {
                  const accountConfig = params.accountConfigs?.[accountId];
                  const enabled = accountConfig?.enabled !== false; // 默认启用
                  const priority = accountConfig?.priority ?? 0;
                  const hasSchedule = !!accountConfig?.schedule;
                  const hasUsageLimit = !!accountConfig?.usageLimit;
                  const hasHealthCheck = !!accountConfig?.healthCheck;

                  return html`
                      <div class="list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-radius: 4px; background: var(--bg-1); margin-bottom: 6px; opacity: ${enabled ? "1" : "0.6"};">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                          <!-- 启用/停用开关 -->
                          <label class="switch" style="margin: 0;">
                            <input 
                              type="checkbox" 
                              ?checked=${enabled}
                              @change=${(e: Event) => {
                                const checked = (e.target as HTMLInputElement).checked;
                                params.onToggleAccountEnabled?.(accountId, checked);
                              }}
                            />
                            <span class="slider"></span>
                          </label>
                          
                          <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                              <span class="mono" style="font-weight: 500;">${accountId}</span>
                              ${
                                accountId === params.defaultModelAccountId
                                  ? html`
                                      <span class="agent-pill">默认</span>
                                    `
                                  : nothing
                              }
                              ${
                                !enabled
                                  ? html`
                                      <span class="agent-pill" style="background: var(--color-warning-bg); color: var(--color-warning)"
                                        >已停用</span
                                      >
                                    `
                                  : nothing
                              }
                              ${priority > 0 ? html`<span class="agent-pill" style="background: var(--color-info-bg); color: var(--color-info);">优先级: ${priority}</span>` : nothing}
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 12px; color: var(--text-3);">
                              ${
                                hasSchedule
                                  ? html`
                                      <span title="定时启用/停用">🕒 定时</span>
                                    `
                                  : nothing
                              }
                              ${
                                hasUsageLimit
                                  ? html`
                                      <span title="用量控制">📊 限额</span>
                                    `
                                  : nothing
                              }
                              ${
                                hasHealthCheck
                                  ? html`
                                      <span title="健康检查">❤️ 监控</span>
                                    `
                                  : nothing
                              }
                            </div>
                          </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                          ${
                            accountId !== params.defaultModelAccountId &&
                            params.onSetDefaultModelAccount
                              ? html`
                                <button 
                                  class="btn btn--sm"
                                  @click=${() => params.onSetDefaultModelAccount!(accountId)}
                                >
                                  设为默认
                                </button>
                              `
                              : nothing
                          }
                          <button
                            class="btn btn--sm"
                            @click=${() => {
                              // TODO: 打开配置对话框
                              alert("配置面板开发中...");
                            }}
                          >
                            配置
                          </button>
                          <button
                            class="btn btn--sm"
                            style="color: var(--color-danger);"
                            ?disabled=${boundCount === 1}
                            title=${boundCount === 1 ? "至少需要保留一个模型账号" : ""}
                            @click=${() => {
                              if (
                                boundCount > 1 &&
                                params.onUnbindModelAccount &&
                                confirm(`确定要移除 ${accountId} 吗？`)
                              ) {
                                params.onUnbindModelAccount(accountId);
                              }
                            }}
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    `;
                })}
              </div>
            `
        }
      </div>

      <!-- 可用但未绑定的模型账号（折叠） -->
      <div style="margin-top: 24px;">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div class="label">可用的模型账号</div>
          <button class="btn btn--sm" @click=${() => params.onToggleAvailableModelAccounts?.()}>
            ${params.availableModelAccountsExpanded ? "收起" : "展开"}
          </button>
        </div>

        ${
          params.availableModelAccountsExpanded
            ? html`
              <div style="margin-top: 12px;">
                ${
                  params.availableModelAccountsError
                    ? html`<div class="callout danger">${params.availableModelAccountsError}</div>`
                    : nothing
                }
                ${
                  params.availableModelAccountsLoading
                    ? html`
                        <div class="loading">加载中...</div>
                      `
                    : params.availableModelAccounts.length === 0
                      ? html`
                          <div class="muted">没有可用的模型账号</div>
                        `
                      : html`
                        <div class="list">
                          ${params.availableModelAccounts.map(
                            (accountId: string) => html`
                              <div class="list-item" style="display: flex; justify-content: space-between; align-items: center;">
                                <span class="mono">${accountId}</span>
                                <button
                                  class="btn btn--sm"
                                  @click=${() => params.onBindModelAccount?.(accountId)}
                                >
                                  + 添加
                                </button>
                              </div>
                            `,
                          )}
                        </div>
                      `
                }
              </div>
            `
            : nothing
        }
      </div>

      <!-- Part 2: 智能路由配置（只在有多个模型账号时显示） -->
      ${
        hasMultipleAccounts && config
          ? html`
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border-1);">
              <div class="label">智能路由配置</div>
              <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                当绑定多个模型账号时，可配置智能路由策略自动选择最佳模型
              </div>
              
              <div style="margin-top: 16px;">
                <div style="display: flex; gap: 16px;">
                  <label style="display: flex; align-items: center; gap: 6px;">
                    <input
                      type="radio"
                      name="routingMode-${params.agentId}"
                      value="manual"
                      ?checked=${config.routingMode === "manual"}
                      ?disabled=${!params.onChange}
                      @change=${() => {
                        if (params.onChange) {
                          params.onChange(params.agentId, {
                            ...config,
                            routingMode: "manual",
                          });
                        }
                      }}
                    />
                    <span>手动选择</span>
                  </label>
                  <label style="display: flex; align-items: center; gap: 6px;">
                    <input
                      type="radio"
                      name="routingMode-${params.agentId}"
                      value="smart"
                      ?checked=${config.routingMode === "smart"}
                      ?disabled=${!params.onChange}
                      @change=${() => {
                        if (params.onChange) {
                          params.onChange(params.agentId, {
                            ...config,
                            routingMode: "smart",
                          });
                        }
                      }}
                    />
                    <span>智能路由</span>
                  </label>
                  <label style="display: flex; align-items: center; gap: 6px;">
                    <input
                      type="radio"
                      name="routingMode-${params.agentId}"
                      value="roundRobin"
                      ?checked=${config.routingMode === "roundRobin"}
                      ?disabled=${!params.onChange}
                      @change=${() => {
                        if (params.onChange) {
                          params.onChange(params.agentId, {
                            ...config,
                            routingMode: "roundRobin",
                          });
                        }
                      }}
                    />
                    <span>轮询</span>
                  </label>
                </div>
              </div>

              ${
                config.routingMode === "smart" && config.smartRouting
                  ? html`
                <div style="margin-top: 16px; padding: 16px; border-radius: 6px; background: var(--bg-1);">
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                    <div>
                      <div class="muted" style="font-size: 0.875rem;">复杂度权重</div>
                      <div class="mono" style="margin-top: 4px; font-size: 1.125rem;">${config.smartRouting.complexityWeight || 0}%</div>
                    </div>
                    <div>
                      <div class="muted" style="font-size: 0.875rem;">能力权重</div>
                      <div class="mono" style="margin-top: 4px; font-size: 1.125rem;">${config.smartRouting.capabilityWeight || 0}%</div>
                    </div>
                    <div>
                      <div class="muted" style="font-size: 0.875rem;">成本权重</div>
                      <div class="mono" style="margin-top: 4px; font-size: 1.125rem;">${config.smartRouting.costWeight || 0}%</div>
                    </div>
                    <div>
                      <div class="muted" style="font-size: 0.875rem;">速度权重</div>
                      <div class="mono" style="margin-top: 4px; font-size: 1.125rem;">${config.smartRouting.speedWeight || 0}%</div>
                    </div>
                  </div>
                </div>
              `
                  : nothing
              }
            </div>
          `
          : !hasMultipleAccounts
            ? html`
                <div style="margin-top: 24px; padding: 12px; border-radius: 6px; background: var(--bg-1)">
                  <div class="muted" style="font-size: 0.875rem">
                    💡 提示：绑定多个模型账号后，可以配置手动选择、智能路由或轮询策略。
                  </div>
                </div>
              `
            : nothing
      }
    </section>
  `;
}

/**
 * Phase 5: 渲染通道策略配置面板（Phase 2 多通道协作）
 */
function renderAgentChannelPolicies(params: {
  agentId: string;
  config: ChannelPoliciesConfig | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveSuccess: boolean;
  // oxlint-disable-next-line typescript/no-explicit-any
  boundChannelAccounts?: any[];
  // oxlint-disable-next-line typescript/no-explicit-any
  availableChannelAccounts?: any[];
  availableChannelAccountsLoading?: boolean;
  onAddAccount?: (channelId: string, accountId: string) => void;
  onChange?: (agentId: string, config: ChannelPoliciesConfig) => void;
  onEditPolicyBinding?: (agentId: string, index: number, binding: ChannelBinding) => void;
  onAddPolicyBinding?: (agentId: string) => void;
}) {
  if (params.loading) {
    return html`
      <section class="card">
        <div class="card-title">${t("agents.channel_policies.title")}</div>
        <div class="loading">${t("agents.loading")}</div>
      </section>
    `;
  }

  if (params.error) {
    return html`
      <section class="card">
        <div class="card-title">${t("agents.channel_policies.title")}</div>
        <div class="error">${params.error}</div>
      </section>
    `;
  }

  const config = params.config;
  if (!config) {
    return html`
      <section class="card">
        <div class="card-title">${t("agents.channel_policies.title")}</div>
        <div class="empty">${t("agents.channel_policies.no_config")}</div>
      </section>
    `;
  }

  const policyOptions: Array<{ value: string; label: string; description: string }> = [
    {
      value: "private",
      label: t("agents.channel_policies.policy.private"),
      description: "智能助手专属通道，不对外暴露",
    },
    {
      value: "monitor",
      label: t("agents.channel_policies.policy.monitor"),
      description: "长通模式，接收所有消息并带来源标记",
    },
    {
      value: "listen-only",
      label: t("agents.channel_policies.policy.listen-only"),
      description: "只监听：记录消息，不响应，用于数据收集",
    },
    {
      value: "load-balance",
      label: t("agents.channel_policies.policy.load-balance"),
      description: "负载均衡：多个账号轮流处理消息",
    },
    {
      value: "queue",
      label: t("agents.channel_policies.policy.queue"),
      description: "队列模式：消息排队，批量处理",
    },
    {
      value: "moderate",
      label: t("agents.channel_policies.policy.moderate"),
      description: "审核模式：消息需要审核后才发送",
    },
    {
      value: "echo",
      label: t("agents.channel_policies.policy.echo"),
      description: "回声模式：仅记录日志，不处理",
    },
    {
      value: "filter",
      label: t("agents.channel_policies.policy.filter"),
      description: "基于规则过滤消息",
    },
    {
      value: "scheduled",
      label: t("agents.channel_policies.policy.scheduled"),
      description: "根据时间表响应消息",
    },
    {
      value: "forward",
      label: t("agents.channel_policies.policy.forward"),
      description: "转发模式：自动转发消息到其他通道",
    },
    {
      value: "broadcast",
      label: t("agents.channel_policies.policy.broadcast"),
      description: "广播模式：一条消息发送到多个通道",
    },
    {
      value: "smart-route",
      label: t("agents.channel_policies.policy.smart-route"),
      description: "智能路由：根据内容智能选择通道",
    },
  ];

  return html`
    <section class="card">
      <div class="card-title">${t("agents.channel_policies.title")}</div>
      <div class="card-sub">${t("agents.channel_policies.subtitle")}</div>
      
      ${
        params.saveSuccess
          ? html`
        <div class="callout success" style="margin-top: 12px;">
          ✓ ${t("agents.save_success")}
        </div>
      `
          : nothing
      }
      
      <!-- 默认策略选择 -->
      <div style="margin-top: 20px;">
        <div class="label">${t("agents.channel_policies.default_policy")}</div>
        <div style="margin-top: 8px; display: flex; gap: 12px; align-items: flex-start;">
          <select
            style="flex: 0 0 300px;"
            ?disabled=${!params.onChange}
            @change=${(e: Event) => {
              if (params.onChange) {
                const target = e.target as HTMLSelectElement;
                const policyType = target.value;
                // 根据策略类型创建对应的配置对象
                // oxlint-disable-next-line typescript/no-explicit-any
                let policyConfig: any;
                switch (policyType) {
                  case "private":
                    policyConfig = { type: "private", config: { allowedUsers: [] } };
                    break;
                  case "monitor":
                    policyConfig = {
                      type: "monitor",
                      config: { monitorChannels: [], enableLogging: true },
                    };
                    break;
                  case "listen-only":
                    policyConfig = {
                      type: "listen-only",
                      config: { enableLogging: true, logPath: "./logs" },
                    };
                    break;
                  case "load-balance":
                    policyConfig = {
                      type: "load-balance",
                      config: { accountIds: [], algorithm: "round-robin" },
                    };
                    break;
                  case "queue":
                    policyConfig = {
                      type: "queue",
                      config: {
                        maxQueueSize: 100,
                        batchInterval: 60,
                        batchSize: 10,
                        overflowAction: "reject",
                      },
                    };
                    break;
                  case "moderate":
                    policyConfig = { type: "moderate", config: { moderators: [] } };
                    break;
                  case "echo":
                    policyConfig = {
                      type: "echo",
                      config: { logLevel: "info", logPath: "./logs" },
                    };
                    break;
                  case "filter":
                    policyConfig = { type: "filter", config: {} };
                    break;
                  case "scheduled":
                    policyConfig = { type: "scheduled", config: {} };
                    break;
                  case "forward":
                    policyConfig = { type: "forward", config: { targetChannels: [] } };
                    break;
                  case "broadcast":
                    policyConfig = { type: "broadcast", config: { targetChannels: [] } };
                    break;
                  case "smart-route":
                    policyConfig = { type: "smart-route", config: { routingRules: [] } };
                    break;
                  default:
                    policyConfig = { type: policyType, config: {} };
                }
                params.onChange(params.agentId, {
                  ...config,
                  defaultPolicy: policyConfig,
                });
              }
            }}
          >
            ${policyOptions.map((opt) => {
              // 获取当前选中的策略类型
              const currentPolicyType =
                typeof config.defaultPolicy === "object" && config.defaultPolicy !== null
                  ? (config.defaultPolicy as { type?: string }).type
                  : config.defaultPolicy;
              return html`
                  <option value=${opt.value} ?selected=${currentPolicyType === opt.value}>
                    ${opt.label}
                  </option>
                `;
            })}
          </select>
          <div class="muted" style="flex: 1; font-size: 0.875rem; padding-top: 8px;">
            ${(() => {
              const currentPolicyType =
                typeof config.defaultPolicy === "object" && config.defaultPolicy !== null
                  ? (config.defaultPolicy as { type?: string }).type
                  : config.defaultPolicy;
              return policyOptions.find((p) => p.value === currentPolicyType)?.description || "";
            })()}
          </div>
        </div>
      </div>

      <!-- 已绑定通道的策略配置 -->
      <div style="margin-top: 24px;">
        <div class="label" style="margin-bottom: 12px;">已绑定通道的策略配置</div>
        <div style="color: var(--fg-muted); font-size: 0.875rem; margin-bottom: 12px;">
          为每个已绑定的通道账号配置独立的策略。如果未配置，将使用上面的默认策略。
        </div>
        ${
          params.boundChannelAccounts && params.boundChannelAccounts.length > 0
            ? html`
            <div class="list" style="margin-top: 8px;">
              ${params.boundChannelAccounts.map((binding) =>
                binding.accountIds.map((accountId: string) => {
                  // 查找该通道账号的策略配置
                  const existingBinding = Array.isArray(config.bindings)
                    ? config.bindings.find(
                        (b) => b.channelId === binding.channelId && b.accountId === accountId,
                      )
                    : null;
                  const currentPolicy = existingBinding?.policy || null;

                  return html`
                    <div class="list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 4px; background: var(--bg-1); margin-bottom: 8px;">
                      <div style="flex: 1;">
                        <div class="mono" style="font-weight: 500;">${binding.channelId}:${accountId}</div>
                        <div class="muted" style="font-size: 0.875rem; margin-top: 2px;">
                          ${
                            currentPolicy
                              ? `当前策略: ${t(`agents.channel_policies.policy.${typeof currentPolicy === "object" ? (currentPolicy as { type?: string }).type : currentPolicy}`)}`
                              : "使用默认策略"
                          }
                        </div>
                      </div>
                      <div style="display: flex; gap: 8px; align-items: center;">
                        <select
                          style="width: 200px;"
                          ?disabled=${!params.onChange}
                          @change=${(e: Event) => {
                            if (params.onChange) {
                              const target = e.target as HTMLSelectElement;
                              const policyType = target.value;

                              // 创建新的绑定配置
                              // oxlint-disable-next-line typescript/no-explicit-any
                              let policyConfig: any = null;
                              if (policyType) {
                                switch (policyType) {
                                  case "private":
                                    policyConfig = {
                                      type: "private",
                                      config: { allowedUsers: [] },
                                    };
                                    break;
                                  case "monitor":
                                    policyConfig = {
                                      type: "monitor",
                                      config: { monitorChannels: [], enableLogging: true },
                                    };
                                    break;
                                  case "listen-only":
                                    policyConfig = {
                                      type: "listen-only",
                                      config: { enableLogging: true, logPath: "./logs" },
                                    };
                                    break;
                                  case "load-balance":
                                    policyConfig = {
                                      type: "load-balance",
                                      config: { accountIds: [], algorithm: "round-robin" },
                                    };
                                    break;
                                  case "queue":
                                    policyConfig = {
                                      type: "queue",
                                      config: {
                                        maxQueueSize: 100,
                                        batchInterval: 60,
                                        batchSize: 10,
                                        overflowAction: "reject",
                                      },
                                    };
                                    break;
                                  case "moderate":
                                    policyConfig = { type: "moderate", config: { moderators: [] } };
                                    break;
                                  case "echo":
                                    policyConfig = {
                                      type: "echo",
                                      config: { logLevel: "info", logPath: "./logs" },
                                    };
                                    break;
                                  case "filter":
                                    policyConfig = { type: "filter", config: {} };
                                    break;
                                  case "scheduled":
                                    policyConfig = { type: "scheduled", config: {} };
                                    break;
                                  case "forward":
                                    policyConfig = {
                                      type: "forward",
                                      config: { targetChannels: [] },
                                    };
                                    break;
                                  case "broadcast":
                                    policyConfig = {
                                      type: "broadcast",
                                      config: { targetChannels: [] },
                                    };
                                    break;
                                  case "smart-route":
                                    policyConfig = {
                                      type: "smart-route",
                                      config: { routingRules: [] },
                                    };
                                    break;
                                }
                              }

                              // 更新绑定列表
                              const newBindings = Array.isArray(config.bindings)
                                ? [...config.bindings]
                                : [];
                              const existingIndex = newBindings.findIndex(
                                (b) =>
                                  b.channelId === binding.channelId && b.accountId === accountId,
                              );

                              if (policyConfig) {
                                // 添加或更新绑定
                                const newBinding = {
                                  channelId: binding.channelId,
                                  accountId,
                                  policy: policyConfig,
                                };
                                if (existingIndex >= 0) {
                                  newBindings[existingIndex] = newBinding;
                                } else {
                                  newBindings.push(newBinding);
                                }
                              } else {
                                // 移除绑定（使用默认策略）
                                if (existingIndex >= 0) {
                                  newBindings.splice(existingIndex, 1);
                                }
                              }

                              params.onChange(params.agentId, {
                                ...config,
                                bindings: newBindings,
                              });
                            }
                          }}
                        >
                          <option value="" ?selected=${!currentPolicy}>使用默认策略</option>
                          ${policyOptions.map((opt) => {
                            const currentPolicyType =
                              typeof currentPolicy === "object" && currentPolicy !== null
                                ? (currentPolicy as { type?: string }).type
                                : currentPolicy;
                            return html`
                                <option value=${opt.value} ?selected=${currentPolicyType === opt.value}>
                                  ${opt.label}
                                </option>
                              `;
                          })}
                        </select>
                        ${
                          currentPolicy
                            ? html`
                            <button 
                              class="btn btn--sm"
                              @click=${() => {
                                if (params.onEditPolicyBinding) {
                                  const existingIndex = Array.isArray(config.bindings)
                                    ? config.bindings.findIndex(
                                        (b) =>
                                          b.channelId === binding.channelId &&
                                          b.accountId === accountId,
                                      )
                                    : -1;
                                  if (existingIndex >= 0) {
                                    params.onEditPolicyBinding(
                                      params.agentId,
                                      existingIndex,
                                      config.bindings[existingIndex],
                                    );
                                  }
                                }
                              }}
                            >
                              配置
                            </button>
                          `
                            : nothing
                        }
                      </div>
                    </div>
                  `;
                }),
              )}
            </div>
          `
            : html`
                <div class="callout" style="margin-top: 8px">
                  <div style="font-weight: 500; margin-bottom: 4px">⚠️ 尚未绑定任何通道账号</div>
                  <div style="font-size: 0.875rem">
                    请在下方可绑定账号列表中选择账号绑定给此助手，绑定后即可配置策略。
                  </div>
                </div>
              `
        }

      <!-- 可绑定账号列表 -->
      <div style="margin-top: 24px;">
        <div class="label" style="margin-bottom: 12px;">可绑定账号</div>
        <div style="color: var(--fg-muted); font-size: 0.875rem; margin-bottom: 12px;">
          将未被任何助手使用的通道账号绑定给此助手，绑定后可在上方配置其策略。
        </div>
        ${
          params.availableChannelAccountsLoading
            ? html`
                <div class="loading" style="margin-top: 8px">加载中...</div>
              `
            : !params.availableChannelAccounts || params.availableChannelAccounts.length === 0
              ? html`
                  <div class="muted" style="margin-top: 8px">
                    暂无可绑定的通道账号（所有账号已被绑定或尚未配置任何通道）
                  </div>
                `
              : html`
                <div class="list" style="margin-top: 8px;">
                  ${params.availableChannelAccounts.map(
                    (account) => html`
                      <div class="list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 4px; background: var(--bg-1); margin-bottom: 8px;">
                        <div style="flex: 1;">
                          <div class="mono" style="font-weight: 500;">${account.channelId}:${account.accountId}</div>
                          <div class="muted" style="font-size: 0.875rem; margin-top: 2px;">
                            ${account.label}${
                              !account.configured
                                ? html`
                                    &mdash; <span style="color: var(--color-warning)">未完成配置</span>
                                  `
                                : nothing
                            }
                          </div>
                        </div>
                        <button
                          class="btn btn--sm"
                          ?disabled=${!account.configured || !params.onAddAccount}
                          title=${!account.configured ? "该账号尚未完成配置，无法绑定" : ""}
                          @click=${() => {
                            if (params.onAddAccount && account.configured) {
                              params.onAddAccount(account.channelId, account.accountId);
                            }
                          }}
                        >
                          + 绑定
                        </button>
                      </div>
                    `,
                  )}
                </div>
              `
        }
      </div>

      <!-- 策略说明 -->
      <details style="margin-top: 24px; padding: 16px; border: 1px solid var(--border); border-radius: 6px;">
        <summary style="cursor: pointer; font-weight: 500; margin-bottom: 12px;">
          📖 策略说明
        </summary>
        <div style="font-size: 0.875rem; line-height: 1.6; color: var(--fg-muted);">
          ${policyOptions.map(
            (opt) => html`
            <div style="margin-bottom: 8px;">
              <span style="font-weight: 500; color: var(--fg-base);">${opt.label}:</span> ${opt.description}
            </div>
          `,
          )}
        </div>
      </details>
    </section>
  `;
}

export function renderAgents(props: AgentsProps) {
  // 调试日志：记录 Agents 渲染关键状态
  if (typeof window !== "undefined" && (window as unknown as { __DEBUG_UI__?: boolean }).__DEBUG_UI__) {
    console.log("[DEBUG:Agents] renderAgents called with:", {
      basePath: props.basePath,
      loading: props.loading,
      error: props.error,
      agentsListExists: !!props.agentsList,
      agentsCount: props.agentsList?.agents?.length ?? 0,
      defaultId: props.agentsList?.defaultId,
      selectedAgentId: props.selectedAgentId,
      activePanel: props.activePanel,
      configLoading: props.configLoading,
      configSaving: props.configSaving,
      configDirty: props.configDirty,
      toolsCatalogLoading: props.toolsCatalog?.loading,
      toolsEffectiveLoading: props.toolsEffective?.loading,
      runtimeSessionKey: props.runtimeSessionKey,
      runtimeSessionMatches: props.runtimeSessionMatchesSelectedAgent,
    });
  }

  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  const selectedId = props.selectedAgentId ?? defaultId ?? agents[0]?.id ?? null;
  const selectedAgent = selectedId
    ? (agents.find((agent) => agent.id === selectedId) ?? null)
    : null;

  return html`
    <div class="agents-layout">
      <section class="card agents-sidebar">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">${t("agents.title")}</div>
            <div class="card-sub">${t("agents.configured_count").replace("{count}", String(agents.length))}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onAddAgent}>
              ${t("agents.add_agent_short")}
            </button>
            <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
              ${props.loading ? t("agents.loading") : t("agents.refresh")}
            </button>
          </div>
        </div>
        ${
          props.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
            : nothing
        }
        <div class="agent-list" style="margin-top: 12px;">
          ${
            agents.length === 0
              ? html`
                  <div class="muted">${t("agents.no_agents_found")}</div>
                `
              : agents.map((agent) => {
                  const badge = agentBadgeText(agent.id, defaultId);
                  const emoji = resolveAgentEmoji(agent, props.agentIdentityById[agent.id] ?? null);
                  return html`
                    <button
                      type="button"
                      class="agent-row ${selectedId === agent.id ? "active" : ""}"
                      @click=${() => props.onSelectAgent(agent.id)}
                    >
                      <div class="agent-avatar">
                        ${emoji || normalizeAgentLabel(agent).slice(0, 1)}
                      </div>
                      <div class="agent-info">
                        <div class="agent-title">${normalizeAgentLabel(agent)}</div>
                        <div class="agent-sub mono">${agent.id}</div>
                      </div>
                      ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
                    </button>
                  `;
                })
          }
        </div>
      </section>
      <section class="agents-main">
        ${
          !selectedAgent && !props.editingAgent
            ? html`
                <div class="card">
                  <div class="card-title">${t("agents.select_title")}</div>
                  <div class="card-sub">${t("agents.select_subtitle")}</div>
                </div>
              `
            : props.editingAgent
              ? renderAgentEditModal(props)
              : selectedAgent
                ? html`
              ${renderAgentHeader(
                selectedAgent,
                defaultId,
                props.agentIdentityById[selectedAgent.id] ?? null,
                props.onDeleteAgent,
                props.onEditAgent,
              )}
              ${renderAgentTabs(props.activePanel, (panel) => props.onSelectPanel(panel))}
              ${
                props.activePanel === "overview"
                  ? renderAgentOverview({
                      agent: selectedAgent,
                      defaultId,
                      configForm: props.configForm,
                      agentFilesList: props.agentFilesList,
                      agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                      agentIdentityError: props.agentIdentityError,
                      agentIdentityLoading: props.agentIdentityLoading,
                      configLoading: props.configLoading,
                      configSaving: props.configSaving,
                      configDirty: props.configDirty,
                      onConfigReload: props.onConfigReload,
                      onConfigSave: props.onConfigSave,
                      onModelChange: props.onModelChange,
                      onModelFallbacksChange: props.onModelFallbacksChange,
                    })
                  : nothing
              }
              ${
                props.activePanel === "files"
                  ? renderAgentFiles({
                      agentId: selectedAgent.id,
                      agentFilesList: props.agentFilesList,
                      agentFilesLoading: props.agentFilesLoading,
                      agentFilesError: props.agentFilesError,
                      agentFileActive: props.agentFileActive,
                      agentFileContents: props.agentFileContents,
                      agentFileDrafts: props.agentFileDrafts,
                      agentFileSaving: props.agentFileSaving,
                      onLoadFiles: props.onLoadFiles,
                      onSelectFile: props.onSelectFile,
                      onFileDraftChange: props.onFileDraftChange,
                      onFileReset: props.onFileReset,
                      onFileSave: props.onFileSave,
                      onAddFile: props.onAddFile,
                      onOpenFolder: props.onOpenFolder,
                      onMigrateWorkspace: props.onMigrateWorkspace,
                    })
                  : nothing
              }
              ${
                props.activePanel === "tools"
                  ? renderAgentTools({
                      agentId: selectedAgent.id,
                      configForm: props.configForm,
                      configLoading: props.configLoading,
                      configSaving: props.configSaving,
                      configDirty: props.configDirty,
                      onProfileChange: props.onToolsProfileChange,
                      onOverridesChange: props.onToolsOverridesChange,
                      onConfigReload: props.onConfigReload,
                      onConfigSave: props.onConfigSave,
                    })
                  : nothing
              }
              ${
                props.activePanel === "skills"
                  ? renderAgentSkills({
                      agentId: selectedAgent.id,
                      report: props.agentSkillsReport,
                      loading: props.agentSkillsLoading,
                      error: props.agentSkillsError,
                      activeAgentId: props.agentSkillsAgentId,
                      configForm: props.configForm,
                      configLoading: props.configLoading,
                      configSaving: props.configSaving,
                      configDirty: props.configDirty,
                      filter: props.skillsFilter,
                      onFilterChange: props.onSkillsFilterChange,
                      onRefresh: props.onSkillsRefresh,
                      onToggle: props.onAgentSkillToggle,
                      onClear: props.onAgentSkillsClear,
                      onDisableAll: props.onAgentSkillsDisableAll,
                      onConfigReload: props.onConfigReload,
                      onConfigSave: props.onConfigSave,
                    })
                  : nothing
              }
              ${
                props.activePanel === "channels"
                  ? renderAgentChannels({
                      agent: selectedAgent,
                      defaultId,
                      configForm: props.configForm,
                      agentFilesList: props.agentFilesList,
                      agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                      boundAccounts: props.boundChannelAccounts || [],
                      boundAccountsLoading: props.boundChannelAccountsLoading || false,
                      boundAccountsError: props.boundChannelAccountsError || null,
                      availableAccounts: props.availableChannelAccounts || [],
                      availableAccountsLoading: props.availableChannelAccountsLoading || false,
                      availableAccountsError: props.availableChannelAccountsError || null,
                      availableAccountsExpanded: props.availableChannelAccountsExpanded || false,
                      operationError: props.channelAccountOperationError || null,
                      onRefresh: props.onChannelsRefresh,
                      onAddAccount: (channelId, accountId) => {
                        if (props.onAddChannelAccount) {
                          props.onAddChannelAccount(channelId, accountId);
                        }
                      },
                      onRemoveAccount: (channelId, accountId) => {
                        if (props.onRemoveChannelAccount) {
                          props.onRemoveChannelAccount(channelId, accountId);
                        }
                      },
                      onToggleAvailableAccounts: () => {
                        if (props.onToggleAvailableChannelAccounts) {
                          props.onToggleAvailableChannelAccounts();
                        }
                      },
                    })
                  : nothing
              }
              ${
                props.activePanel === "cron"
                  ? renderAgentCron({
                      agent: selectedAgent,
                      defaultId,
                      configForm: props.configForm,
                      agentFilesList: props.agentFilesList,
                      agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                      jobs: props.cronJobs,
                      status: props.cronStatus,
                      loading: props.cronLoading,
                      error: props.cronError,
                      onRefresh: props.onCronRefresh,
                    })
                  : nothing
              }
              ${
                props.activePanel === "modelAccounts"
                  ? renderAgentModelAccounts({
                      agentId: selectedAgent.id,
                      config: props.modelAccountsConfig,
                      loading: props.modelAccountsLoading,
                      error: props.modelAccountsError,
                      saving: props.modelAccountsSaving,
                      saveSuccess: props.modelAccountsSaveSuccess,
                      boundModelAccounts: props.boundModelAccounts || [],
                      boundModelAccountsLoading: props.boundModelAccountsLoading || false,
                      boundModelAccountsError: props.boundModelAccountsError || null,
                      availableModelAccounts: props.availableModelAccounts || [],
                      availableModelAccountsLoading: props.availableModelAccountsLoading || false,
                      availableModelAccountsError: props.availableModelAccountsError || null,
                      availableModelAccountsExpanded: props.availableModelAccountsExpanded || false,
                      defaultModelAccountId: props.defaultModelAccountId || "",
                      modelAccountOperationError: props.modelAccountOperationError || null,
                      onChange: props.onModelAccountsChange,
                      onBindModelAccount: (accountId) => {
                        if (props.onBindModelAccount) {
                          props.onBindModelAccount(accountId);
                        }
                      },
                      onUnbindModelAccount: (accountId) => {
                        if (props.onUnbindModelAccount) {
                          props.onUnbindModelAccount(accountId);
                        }
                      },
                      onToggleAvailableModelAccounts: () => {
                        if (props.onToggleAvailableModelAccounts) {
                          props.onToggleAvailableModelAccounts();
                        }
                      },
                      onSetDefaultModelAccount: (accountId) => {
                        if (props.onSetDefaultModelAccount) {
                          props.onSetDefaultModelAccount(accountId);
                        }
                      },
                    })
                  : nothing
              }
              ${
                props.activePanel === "channelPolicies"
                  ? renderAgentChannelPolicies({
                      agentId: selectedAgent.id,
                      config: props.channelPoliciesConfig,
                      loading: props.channelPoliciesLoading,
                      error: props.channelPoliciesError,
                      saving: props.channelPoliciesSaving,
                      saveSuccess: props.channelPoliciesSaveSuccess,
                      boundChannelAccounts: props.boundChannelAccounts || [],
                      availableChannelAccounts: props.availableChannelAccounts || [],
                      availableChannelAccountsLoading:
                        props.availableChannelAccountsLoading || false,
                      onAddAccount: (channelId, accountId) => {
                        if (props.onAddChannelAccount) {
                          props.onAddChannelAccount(channelId, accountId);
                        }
                      },
                      onChange: props.onChannelPoliciesChange,
                      onEditPolicyBinding: props.onEditPolicyBinding,
                      onAddPolicyBinding: props.onAddPolicyBinding,
                    })
                  : nothing
              }
              ${
                props.activePanel === "identity"
                  ? renderAgentIdentityPanel({
                      agentId: selectedAgent.id,
                      files:
                        props.agentSoulFiles?.agentId === selectedAgent.id
                          ? props.agentSoulFiles
                          : null,
                      loading: props.agentSoulFilesLoading,
                      error: props.agentSoulFilesError,
                      drafts: props.agentSoulDrafts,
                      saving: props.agentSoulSaving,
                      onLoad: () => props.onLoadSoulFiles?.(selectedAgent.id),
                      onDraftChange: (file, content) => props.onSoulDraftChange?.(file, content),
                      onSave: () => props.onSoulFilesSave?.(selectedAgent.id),
                    })
                  : nothing
              }
              ${
                props.activePanel === "permissionsConfig"
                  ? renderPermissionsManagement({
                      agentId: selectedAgent.id,
                      agents: props.agentsList?.agents || [],
                      permissionsConfig: props.permissionsConfig || null,
                      loading: props.permissionsLoading || false,
                      error: props.permissionsError || null,
                      saving: props.permissionsConfigSaving || false,
                      saveSuccess: false,
                      availableRoles: [],
                      toolCategories: {},
                      predefinedRoles: {},
                      activeTab: props.permissionsActiveTab || "overview",
                      selectedTargetAgent: null,
                      targetAgentRoles: [],
                      targetAgentRolesLoading: false,
                      // oxlint-disable-next-line typescript/no-explicit-any
                      gateway: null as any,
                      enabledToolIds: Array.from(
                        computeEnabledToolIds(props.configForm, selectedAgent.id),
                      ),
                      onInitPermissions: async (agentId: string) => {
                        if (props.onInitPermissions) {
                          await props.onInitPermissions(agentId);
                          props.onPermissionsRefresh?.(agentId);
                        }
                      },
                      // oxlint-disable-next-line typescript/no-explicit-any
                      onAddRule: async (agentId: string, rule: any) => {
                        const current = props.permissionsConfig;
                        if (!current) {
                          return;
                        }
                        const updated = { ...current, rules: [...current.rules, rule] };
                        await props.onPermissionsConfigChange?.(agentId, updated);
                      },
                      // oxlint-disable-next-line typescript/no-explicit-any
                      onUpdateRule: async (agentId: string, ruleId: string, updates: any) => {
                        const current = props.permissionsConfig;
                        if (!current) {
                          return;
                        }
                        // oxlint-disable-next-line typescript/no-explicit-any
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const updated = {
                          ...current,
                          rules: current.rules.map((r: unknown) =>
                            (r as { id: string }).id === ruleId
                              ? { ...(r as object), ...updates }
                              : r,
                          ),
                        };
                        await props.onPermissionsConfigChange?.(agentId, updated);
                      },
                      onDeleteRule: async (agentId: string, ruleId: string) => {
                        const current = props.permissionsConfig;
                        if (!current) {
                          return;
                        }
                        // oxlint-disable-next-line typescript/no-explicit-any
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const updated = {
                          ...current,
                          rules: current.rules.filter(
                            (r: unknown) => (r as { id: string }).id !== ruleId,
                          ),
                        };
                        await props.onPermissionsConfigChange?.(agentId, updated);
                      },
                      onToggleRule: async (agentId: string, ruleId: string, enabled: boolean) => {
                        const current = props.permissionsConfig;
                        if (!current) {
                          return;
                        }
                        // oxlint-disable-next-line typescript/no-explicit-any
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const updated = {
                          ...current,
                          rules: current.rules.map((r: unknown) =>
                            (r as { id: string }).id === ruleId
                              ? { ...(r as object), enabled: !enabled }
                              : r,
                          ),
                        };
                        await props.onPermissionsConfigChange?.(agentId, updated);
                      },
                      // oxlint-disable-next-line typescript/no-explicit-any
                      onBatchSetRules: async (agentId: string, newRules: any[]) => {
                        const current = props.permissionsConfig;
                        if (!current) {
                          return;
                        }
                        // 单次写入，避免逐条调用产生竞争条件
                        await props.onPermissionsConfigChange?.(agentId, {
                          ...current,
                          rules: newRules,
                        });
                      },
                      onSwitchTab: (tab: "overview" | "rules" | "audit") => {
                        props.onPermissionsTabChange?.(tab);
                      },
                      onRefresh: () => props.onPermissionsRefresh?.(selectedAgent.id),
                      auditLogs: props.permissionChangeHistory || [],
                      auditLoading: props.permissionHistoryLoading || false,
                      onLoadAuditLogs: () => props.onPermissionsRefresh?.(selectedAgent.id),
                    })
                  : nothing
              }
            `
                : nothing
        }
      </section>
    </div>
    
    ${
      props.editingPolicyBinding || props.addingPolicyBinding
        ? renderPolicyBindingDialog({
            agentId: props.editingPolicyBinding?.agentId || props.addingPolicyBinding || "",
            binding: props.editingPolicyBinding?.binding || null,
            index: props.editingPolicyBinding?.index,
            channelsSnapshot: props.channelsSnapshot, // 传递通道快照
            // oxlint-disable-next-line typescript/no-explicit-any
            onChange: (field: string, value: any) => {
              // 修改编辑中的绑定对象
              if (props.editingPolicyBinding) {
                const updated = { ...props.editingPolicyBinding.binding, [field]: value };
                if (props.onEditPolicyBinding) {
                  props.onEditPolicyBinding(
                    props.editingPolicyBinding.agentId,
                    props.editingPolicyBinding.index,
                    updated,
                  );
                }
              } else if (props.addingPolicyBinding) {
                // 添加模式，创建一个临时的编辑状态
                const tempBinding = {
                  channelId: "",
                  // oxlint-disable-next-line typescript/no-explicit-any
                  policy: "private" as any,
                  [field]: value,
                };
                if (props.onEditPolicyBinding) {
                  // 使用 -1 作为添加模式的标记
                  props.onEditPolicyBinding(props.addingPolicyBinding, -1, tempBinding);
                }
              }
            },
            onSave: () => {
              if (props.onSavePolicyBinding) {
                const binding = props.editingPolicyBinding?.binding;
                const agentId = props.editingPolicyBinding?.agentId || props.addingPolicyBinding;
                if (binding && agentId) {
                  props.onSavePolicyBinding(agentId, binding, props.editingPolicyBinding?.index);
                }
              }
            },
            onCancel: () => {
              if (props.onCancelPolicyDialog) {
                props.onCancelPolicyDialog();
              }
            },
          })
        : nothing
    }
  `;
}

function renderAgentHeader(
  agent: AgentsListResult["agents"][number],
  defaultId: string | null,
  agentIdentity: AgentIdentityResult | null,
  onDelete?: (agentId: string) => void,
  onEdit?: (agentId: string) => void,
) {
  const badge = agentBadgeText(agent.id, defaultId);
  const displayName = normalizeAgentLabel(agent);
  const subtitle = agent.identity?.theme?.trim() || t("agents.subtitle_default");
  const emoji = resolveAgentEmoji(agent, agentIdentity);
  return html`
    <section class="card agent-header">
      <div class="agent-header-main">
        <div class="agent-avatar agent-avatar--lg">
          ${emoji || displayName.slice(0, 1)}
        </div>
        <div>
          <div class="card-title">${displayName}</div>
          <div class="card-sub">${subtitle}</div>
        </div>
      </div>
      <div class="agent-header-meta">
        <div class="mono">${agent.id}</div>
        ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
        ${
          onEdit
            ? html`
          <button 
            class="btn btn--sm" 
            @click=${() => onEdit(agent.id)}
          >
            ${t("agents.edit_agent_short")}
          </button>
        `
            : nothing
        }
        ${
          onDelete
            ? html`
          <button 
            class="btn btn--sm btn--danger" 
            @click=${() => {
              if (confirm(t("agents.delete_confirm").replace("{id}", agent.id))) {
                onDelete(agent.id);
              }
            }}
          >
            ${t("agents.delete_agent")}
          </button>
        `
            : nothing
        }
      </div>
    </section>
  `;
}

/**
 * 三文件身份面板：展示和编辑 SOUL.md / AGENT.md / USER.md
 */
function renderAgentIdentityPanel(params: {
  agentId: string;
  files: { soul: string; agent: string; user: string } | null;
  loading: boolean;
  error: string | null;
  drafts: { soul: string; agent: string; user: string };
  saving: boolean;
  onLoad: () => void;
  onDraftChange: (file: "soul" | "agent" | "user", content: string) => void;
  onSave: () => void;
}) {
  const { agentId, files, loading, error, drafts, saving, onLoad, onDraftChange, onSave } = params;
  if (loading) {
    return html`
      <section class="card"><div class="muted">正在加载身份文件...</div></section>
    `;
  }
  if (error) {
    return html`<section class="card"><div class="error">加载失败: ${error}</div>
      <button class="btn" @click=${onLoad}>重试</button></section>`;
  }
  if (!files) {
    return html`<section class="card">
      <div class="card-title">身份文件</div>
      <div class="card-sub">第一次使用，点击加载</div>
      <button class="btn" style="margin-top:12px" @click=${onLoad}>加载身份文件</button>
    </section>`;
  }
  const isDirty = (f: "soul" | "agent" | "user") => drafts[f] !== (files[f] ?? "");
  const anyDirty = isDirty("soul") || isDirty("agent") || isDirty("user");
  const renderEditor = (label: string, file: "soul" | "agent" | "user", desc: string) => html`
    <div style="margin-bottom:20px">
      <div class="label" style="font-weight:600;margin-bottom:4px">${label}${isDirty(file) ? " *" : ""}</div>
      <div class="muted" style="font-size:12px;margin-bottom:6px">${desc}</div>
      <textarea
        class="mono"
        style="width:100%;min-height:140px;box-sizing:border-box;resize:vertical;"
        .value=${drafts[file]}
        ?disabled=${saving}
        @input=${(e: Event) => onDraftChange(file, (e.target as HTMLTextAreaElement).value)}
      ></textarea>
    </div>
  `;
  return html`
    <section class="card">
      <div class="card-title">身份文件管理</div>
      <div class="card-sub">配置 Agent 的性格、行为和用户上下文（路径: ${agentId} 工作目录）</div>
      <div style="margin-top:16px">
        ${renderEditor(
          "SOUL.md — 性格/价值观/决策原则",
          "soul",
          "定义 Agent 的核心价值观和行为准则，会自动注入到 system prompt。不存在时跟暂无身份文件。",
        )}
        ${renderEditor(
          "AGENT.md — 配置元数据",
          "agent",
          "记录模型/工具/沙箋配置等元数据，不注入 prompt（会展示在此面板供参考）。",
        )}
        ${renderEditor(
          "USER.md — 用户上下文/偏好",
          "user",
          "记录当前用户的偏好、研究领域、背景信息，会自动注入到 system prompt。",
        )}
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button
          class="btn btn--primary"
          ?disabled=${saving || !anyDirty}
          @click=${onSave}
        >${saving ? "保存中..." : "保存所有修改"}</button>
        <button
          class="btn"
          ?disabled=${saving || !anyDirty}
          @click=${() => {
            onDraftChange("soul", files.soul ?? "");
            onDraftChange("agent", files.agent ?? "");
            onDraftChange("user", files.user ?? "");
          }}
        >恢复</button>
      </div>
    </section>
  `;
}

function renderAgentTabs(active: AgentsPanel, onSelect: (panel: AgentsPanel) => void) {
  const tabs: Array<{ id: AgentsPanel; label: () => string }> = [
    { id: "overview", label: () => t("agents.tab.overview") },
    { id: "files", label: () => t("agents.tab.files") },
    { id: "tools", label: () => t("agents.tab.tools") },
    { id: "skills", label: () => t("agents.tab.skills") },
    { id: "channels", label: () => t("agents.tab.channels") },
    { id: "cron", label: () => t("agents.tab.cron") },
    { id: "modelAccounts", label: () => t("agents.tab.model_accounts") },
    { id: "channelPolicies", label: () => t("agents.tab.channel_policies") },
    { id: "identity", label: () => "身份" },
    { id: "permissionsConfig", label: () => t("agents.tab.permissions") },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label()}
          </button>
        `,
      )}
    </div>
  `;
}

function renderAgentOverview(params: {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  configForm: Record<string, unknown> | null;
  agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
}) {
  const {
    agent,
    configForm,
    agentFilesList,
    agentIdentity,
    agentIdentityLoading,
    agentIdentityError,
    configLoading,
    configSaving,
    configDirty,
    onConfigReload,
    onConfigSave,
    onModelChange,
    onModelFallbacksChange,
  } = params;
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace =
    workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const model = config.entry?.model
    ? resolveModelLabel(config.entry?.model)
    : resolveModelLabel(config.defaults?.model);
  const defaultModel = resolveModelLabel(config.defaults?.model);
  const modelPrimary =
    resolveModelPrimary(config.entry?.model) || (model !== "-" ? normalizeModelValue(model) : null);
  const defaultPrimary =
    resolveModelPrimary(config.defaults?.model) ||
    (defaultModel !== "-" ? normalizeModelValue(defaultModel) : null);
  const effectivePrimary = modelPrimary ?? defaultPrimary ?? null;
  const modelFallbacks = resolveModelFallbacks(config.entry?.model);
  const fallbackText = modelFallbacks ? modelFallbacks.join(", ") : "";
  const identityName =
    agentIdentity?.name?.trim() ||
    agent.identity?.name?.trim() ||
    agent.name?.trim() ||
    config.entry?.name ||
    "-";
  const resolvedEmoji = resolveAgentEmoji(agent, agentIdentity);
  const identityEmoji = resolvedEmoji || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  const identityStatus = agentIdentityLoading
    ? t("agents.loading")
    : agentIdentityError
      ? t("agents.overview.unavailable")
      : "";
  const isDefault = Boolean(params.defaultId && agent.id === params.defaultId);

  return html`
    <section class="card">
      <div class="card-title">${t("agents.overview.title")}</div>
      <div class="card-sub">${t("agents.overview.subtitle")}</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">${t("agents.overview.workspace")}</div>
          <div class="mono">${workspace}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.primary_model")}</div>
          <div class="mono">${model}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.identity_name")}</div>
          <div>${identityName}</div>
          ${identityStatus ? html`<div class="agent-kv-sub muted">${identityStatus}</div>` : nothing}
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.default")}</div>
          <div>${isDefault ? t("agents.overview.yes") : t("agents.overview.no")}</div>
        </div>
            <span>Primary model${isDefault ? " (default)" : ""}</span>
>>>>>>> upstream/main
            <select
              .value=${effectivePrimary ?? ""}
              ?disabled=${!configForm || configLoading || configSaving}
              @change=${(e: Event) =>
                onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}
            >
              ${
                isDefault
                  ? nothing
                  : html`
                      <option value="">
                        ${
                          defaultPrimary ? `Inherit default (${defaultPrimary})` : "Inherit default"
                        }
                      </option>
                    `
              }
>>>>>>> upstream/main
              <option value="">
                ${defaultPrimary ? t("agents.overview.inherit_default_with").replace("{model}", defaultPrimary) : t("agents.overview.inherit_default")}
              </option>
              ${
                isDefault
                  ? nothing
                  : html`
                      <option value="">
                        ${
                          defaultPrimary ? `Inherit default (${defaultPrimary})` : "Inherit default"
                        }
                      </option>
                    `
              }
>>>>>>> upstream/main
              ${buildModelOptions(configForm, effectivePrimary ?? undefined)}
            </select>
          </label>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.identity_emoji")}</div>
          <div>${identityEmoji}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.skills_filter")}</div>
          <div>${skillFilter ? t("agents.overview.selected_skills").replace("{count}", String(skillCount)) : t("agents.overview.all_skills")}</div>
        </div>
      </div>

      <div class="agent-model-select" style="margin-top: 20px;">
        <div class="label">${t("agents.overview.model_selection")}</div>
        <div class="row" style="gap: 12px; flex-wrap: wrap;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>${t("agents.overview.primary_model_label")}</span>
            <select
              .value=${effectivePrimary ?? ""}
              ?disabled=${!configForm || configLoading || configSaving}
              @change=${(e: Event) =>
                onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}
            >
              <option value="">
                ${defaultPrimary ? t("agents.overview.inherit_default_with").replace("{model}", defaultPrimary) : t("agents.overview.inherit_default")}
              </option>
              ${buildModelOptions(configForm, effectivePrimary ?? undefined)}
            </select>
          </label>
=======
            <span>Primary model${isDefault ? " (default)" : ""}</span>
>>>>>>> upstream/main
            <select
              .value=${effectivePrimary ?? ""}
              ?disabled=${!configForm || configLoading || configSaving}
              @change=${(e: Event) =>
                onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}
            >
              ${
                isDefault
                  ? nothing
                  : html`
                      <option value="">
                        ${
                          defaultPrimary ? `Inherit default (${defaultPrimary})` : "Inherit default"
                        }
                      </option>
                    `
              }
>>>>>>> upstream/main
              <option value="">
                ${defaultPrimary ? t("agents.overview.inherit_default_with").replace("{model}", defaultPrimary) : t("agents.overview.inherit_default")}
              </option>
=======
              ${
                isDefault
                  ? nothing
                  : html`
                      <option value="">
                        ${
                          defaultPrimary ? `Inherit default (${defaultPrimary})` : "Inherit default"
                        }
                      </option>
                    `
              }
>>>>>>> upstream/main
              ${buildModelOptions(configForm, effectivePrimary ?? undefined)}
            </select>
          </label>
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>${t("agents.overview.fallbacks_label")}</span>
            <input
              .value=${fallbackText}
              ?disabled=${!configForm || configLoading || configSaving}
              placeholder=${t("agents.overview.fallbacks_placeholder")}
              @input=${(e: Event) =>
                onModelFallbacksChange(
                  agent.id,
                  parseFallbackList((e.target as HTMLInputElement).value),
                )}
            />
          </label>
        </div>
        <div class="row" style="justify-content: flex-end; gap: 8px;">
          <button
            class="btn btn--sm"
            ?disabled=${configLoading}
            @click=${onConfigReload}
          >
            ${t("agents.overview.reload_config")}
          </button>
          <button
            class="btn btn--sm primary"
            ?disabled=${configSaving || !configDirty}
            @click=${onConfigSave}
          >
            ${configSaving ? t("agents.overview.saving") : t("agents.overview.save")}
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderAgentContextCard(context: AgentContext, subtitle: string) {
  return html`
    <section class="card">
      <div class="card-title">${t("agents.context.title")}</div>
      <div class="card-sub">${subtitle}</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">${t("agents.overview.workspace")}</div>
          <div class="mono">${context.workspace}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.primary_model")}</div>
          <div class="mono">${context.model}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.identity_name")}</div>
          <div>${context.identityName}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.identity_emoji")}</div>
          <div>${context.identityEmoji}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.skills_filter")}</div>
          <div>${context.skillsLabel}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.overview.default")}</div>
          <div>${context.isDefault ? t("agents.overview.yes") : t("agents.overview.no")}</div>
        </div>
      </div>
    </section>
  `;
}

function renderAgentChannels(params: {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  configForm: Record<string, unknown> | null;
  agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null;
  // 已绑定的通道账号
  // oxlint-disable-next-line typescript/no-explicit-any
  boundAccounts: any[];
  boundAccountsLoading: boolean;
  boundAccountsError: string | null;
  // 可用但未绑定的通道账号
  // oxlint-disable-next-line typescript/no-explicit-any
  availableAccounts: any[];
  availableAccountsLoading: boolean;
  availableAccountsError: string | null;
  availableAccountsExpanded: boolean;
  operationError: string | null;
  // 回调函数
  onRefresh: () => void;
  onAddAccount: (channelId: string, accountId: string) => void;
  onRemoveAccount: (channelId: string, accountId: string) => void;
  onToggleAvailableAccounts: () => void;
}) {
  const context = buildAgentContext(
    params.agent,
    params.configForm,
    params.agentFilesList,
    params.defaultId,
    params.agentIdentity,
  );

  return html`
    <section class="grid grid-cols-2">
      ${renderAgentContextCard(context, t("agents.context.subtitle_channels"))}
      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">通道账号绑定</div>
            <div class="card-sub">管理此助手可以使用的通道账号</div>
          </div>
          <button class="btn btn--sm" ?disabled=${params.boundAccountsLoading} @click=${params.onRefresh}>
            ${params.boundAccountsLoading ? "刷新中..." : "刷新"}
          </button>
        </div>

        ${
          params.operationError
            ? html`<div class="callout danger" style="margin-top: 12px;">${params.operationError}</div>`
            : nothing
        }
        ${
          params.boundAccountsError
            ? html`<div class="callout danger" style="margin-top: 12px;">${params.boundAccountsError}</div>`
            : nothing
        }

        <!-- 已绑定的通道账号 -->
        <div style="margin-top: 20px;">
          <div class="label">已绑定的通道账号 (${params.boundAccounts.length})</div>
          ${
            params.boundAccountsLoading
              ? html`
                  <div class="loading" style="margin-top: 8px">加载中...</div>
                `
              : params.boundAccounts.length === 0
                ? html`
                    <div class="muted" style="margin-top: 8px">还没有绑定任何通道账号</div>
                  `
                : html`
                  <div class="list" style="margin-top: 8px;">
                    ${params.boundAccounts.map(
                      (binding) => html`
                        <div class="card" style="margin-bottom: 8px; padding: 12px;">
                          <div class="row" style="justify-content: space-between; align-items: center;">
                            <div>
                              <div class="list-title">${binding.channelId}</div>
                              <div class="list-sub">
                                ${binding.accountIds.length} 个账号: ${binding.accountIds.join(", ")}
                              </div>
                            </div>
                          </div>
                          <!-- 账号列表 -->
                          <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
                            ${binding.accountIds.map(
                              (accountId: string) => html`
                                <div class="row" style="align-items: center; gap: 8px; padding: 4px 8px; background: var(--bg-1); border-radius: 4px;">
                                  <span class="mono" style="font-size: 0.875rem;">${accountId}</span>
                                  <button
                                    class="btn btn--sm"
                                    style="color: var(--color-danger); padding: 2px 6px; font-size: 0.75rem;"
                                    @click=${() => {
                                      if (
                                        confirm(
                                          `确定要移除 ${binding.channelId}:${accountId} 的绑定吗？`,
                                        )
                                      ) {
                                        params.onRemoveAccount(binding.channelId, accountId);
                                      }
                                    }}
                                  >
                                    移除
                                  </button>
                                </div>
                              `,
                            )}
                          </div>
                        </div>
                      `,
                    )}
                  </div>
                `
          }
        </div>

        <!-- 可用但未绑定的通道账号（折叠） -->
        <div style="margin-top: 24px;">
          <div class="row" style="justify-content: space-between; align-items: center;">
            <div class="label">可用的通道账号</div>
            <button class="btn btn--sm" @click=${params.onToggleAvailableAccounts}>
              ${params.availableAccountsExpanded ? "收起" : "展开"}
            </button>
          </div>

          ${
            params.availableAccountsExpanded
              ? html`
                <div style="margin-top: 12px;">
                  ${
                    params.availableAccountsError
                      ? html`<div class="callout danger">${params.availableAccountsError}</div>`
                      : nothing
                  }
                  ${
                    params.availableAccountsLoading
                      ? html`
                          <div class="loading">加载中...</div>
                        `
                      : params.availableAccounts.length === 0
                        ? html`
                            <div class="muted">没有可用的通道账号</div>
                          `
                        : html`
                          <div class="list">
                            ${params.availableAccounts.map(
                              (account) => html`
                                <div class="list-item" style="display: flex; justify-content: space-between; align-items: center;">
                                  <div>
                                    <div class="list-title">${account.label}</div>
                                    <div class="list-sub mono">
                                      ${account.channelId}:${account.accountId}
                                      ${account.configured ? "" : " - 未配置"}
                                    </div>
                                  </div>
                                  <button
                                    class="btn btn--sm"
                                    ?disabled=${!account.configured}
                                    @click=${() => params.onAddAccount(account.channelId, account.accountId)}
                                  >
                                    + 添加
                                  </button>
                                </div>
                              `,
                            )}
                          </div>
                        `
                  }
                </div>
              `
              : nothing
          }
        </div>
      </section>
    </section>
  `;
}

function renderAgentCron(params: {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  configForm: Record<string, unknown> | null;
  agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null;
  jobs: CronJob[];
  status: CronStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const context = buildAgentContext(
    params.agent,
    params.configForm,
    params.agentFilesList,
    params.defaultId,
    params.agentIdentity,
  );
  const jobs = params.jobs.filter((job) => job.agentId === params.agent.id);
  return html`
    <section class="grid grid-cols-2">
      ${renderAgentContextCard(context, t("agents.context.subtitle_cron"))}
      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">${t("agents.cron.title")}</div>
            <div class="card-sub">${t("agents.cron.subtitle")}</div>
          </div>
          <button class="btn btn--sm" ?disabled=${params.loading} @click=${params.onRefresh}>
            ${params.loading ? t("agents.channels.refreshing") : t("agents.channels.refresh")}
          </button>
        </div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("agents.cron.enabled")}</div>
            <div class="stat-value">
              ${params.status ? (params.status.enabled ? t("agents.cron.yes") : t("agents.cron.no")) : "n/a"}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("agents.cron.jobs")}</div>
            <div class="stat-value">${params.status?.jobs ?? "n/a"}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("agents.cron.next_wake")}</div>
            <div class="stat-value">${formatNextRun(params.status?.nextWakeAtMs ?? null)}</div>
          </div>
        </div>
        ${
          params.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${params.error}</div>`
            : nothing
        }
      </section>
    </section>
    <section class="card">
      <div class="card-title">${t("agents.cron.jobs_title")}</div>
      <div class="card-sub">${t("agents.cron.jobs_subtitle")}</div>
      ${
        jobs.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">${t("agents.cron.no_jobs")}</div>
            `
          : html`
              <div class="list" style="margin-top: 16px;">
                ${jobs.map(
                  (job) => html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">${job.name}</div>
                      ${job.description ? html`<div class="list-sub">${job.description}</div>` : nothing}
                      <div class="chip-row" style="margin-top: 6px;">
                        <span class="chip">${formatCronSchedule(job)}</span>
                        <span class="chip ${job.enabled ? "chip-ok" : "chip-warn"}">
                          ${job.enabled ? t("agents.cron.enabled_status") : t("agents.cron.disabled_status")}
                        </span>
                        <span class="chip">${job.sessionTarget}</span>
                      </div>
                    </div>
                    <div class="list-meta">
                      <div class="mono">${formatCronState(job)}</div>
                      <div class="muted">${formatCronPayload(job)}</div>
                    </div>
                  </div>
                `,
                )}
              </div>
            `
      }
    </section>
  `;
}

function renderAgentFiles(params: {
  agentId: string;
  agentFilesList: AgentsFilesListResult | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onAddFile?: (agentId: string, name: string) => void;
  onOpenFolder?: (folderPath: string) => void;
  onMigrateWorkspace?: (agentId: string) => void | Promise<void>;
}) {
  const list = params.agentFilesList?.agentId === params.agentId ? params.agentFilesList : null;
  const files = list?.files ?? [];
  const active = params.agentFileActive ?? null;
  const activeEntry = active ? (files.find((file) => file.name === active) ?? null) : null;
  const baseContent = active ? (params.agentFileContents[active] ?? "") : "";
  const draft = active ? (params.agentFileDrafts[active] ?? baseContent) : "";
  const isDirty = active ? draft !== baseContent : false;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("agents.files.title")}</div>
          <div class="card-sub">${t("agents.files.subtitle")}</div>
        </div>
        <div class="row" style="gap: 8px;">
          ${
            params.onMigrateWorkspace
              ? html`
            <button
              class="btn btn--sm"
              @click=${() => params.onMigrateWorkspace!(params.agentId)}
              title="${t("agents.migrate_workspace")}"
            >
              \u{1F4BB} ${t("agents.migrate_workspace")}
            </button>
          `
              : nothing
          }
          ${
            list && params.onOpenFolder
              ? html`
            <button
              class="btn btn--sm"
              @click=${() => params.onOpenFolder!(list.workspace)}
              title="\u5728\u6587\u4ef6\u5939\u4e2d\u6253\u5f00"
            >
              \u{1F4C2} \u5728\u6587\u4ef6\u5939\u4e2d\u6253\u5f00
            </button>
          `
              : nothing
          }
          ${
            params.onAddFile
              ? html`
            <button
              class="btn btn--sm"
              ?disabled=${params.agentFilesLoading}
              @click=${() => {
                const name = prompt("\u8bf7\u8f93\u5165\u65b0\u6587\u4ef6\u540d\uff1a");
                if (name?.trim()) {
                  params.onAddFile!(params.agentId, name.trim());
                }
              }}
            >
              + \u6dfb\u52a0\u6587\u4ef6
            </button>
          `
              : nothing
          }
          <button
            class="btn btn--sm"
            ?disabled=${params.agentFilesLoading}
            @click=${() => params.onLoadFiles(params.agentId)}
          >
            ${params.agentFilesLoading ? t("agents.loading") : t("agents.refresh")}
          </button>
        </div>
      </div>
      ${list ? html`<div class="muted mono" style="margin-top: 8px;">${t("agents.files.workspace").replace("{workspace}", list.workspace)}</div>` : nothing}
      ${
        params.agentFilesError
          ? html`<div class="callout danger" style="margin-top: 12px;">${
              params.agentFilesError
            }</div>`
          : nothing
      }
      ${
        !list
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.files.load_prompt")}
              </div>
            `
          : html`
              <div class="agent-files-grid" style="margin-top: 16px;">
                <div class="agent-files-list">
                  ${
                    files.length === 0
                      ? html`
                          <div class="muted">${t("agents.files.no_files")}</div>
                        `
                      : files.map((file) =>
                          renderAgentFileRow(file, active, () => params.onSelectFile(file.name)),
                        )
                  }
                </div>
                <div class="agent-files-editor">
                  ${
                    !activeEntry
                      ? html`
                          <div class="muted">${t("agents.files.select_prompt")}</div>
                        `
                      : html`
                          <div class="agent-file-header">
                            <div>
                              <div class="agent-file-title mono">${activeEntry.name}</div>
                              <div class="agent-file-sub mono">${activeEntry.path}</div>
                            </div>
                            <div class="agent-file-actions">
                              <button
                                class="btn btn--sm"
                                ?disabled=${!isDirty}
                                @click=${() => params.onFileReset(activeEntry.name)}
                              >
                                ${t("agents.files.reset")}
                              </button>
                              <button
                                class="btn btn--sm primary"
                                ?disabled=${params.agentFileSaving || !isDirty}
                                @click=${() => params.onFileSave(activeEntry.name)}
                              >
                                ${params.agentFileSaving ? t("agents.files.saving") : t("agents.files.save")}
                              </button>
                            </div>
                          </div>
                          ${
                            activeEntry.missing
                              ? html`
                                  <div class="callout info" style="margin-top: 10px">
                                    ${t("agents.files.missing_hint")}
                                  </div>
                                `
                              : nothing
                          }
                          <label class="field" style="margin-top: 12px;">
                            <span>${t("agents.files.content")}</span>
                            <textarea
                              rows="20"
                              .value=${draft}
                              @input=${(e: Event) =>
                                params.onFileDraftChange(
                                  activeEntry.name,
                                  (e.target as HTMLTextAreaElement).value,
                                )}
                            ></textarea>
                          </label>
                        `
                  }
                </div>
              </div>
            `
      }
    </section>
  `;
}

function renderAgentFileRow(file: AgentFileEntry, active: string | null, onSelect: () => void) {
  const status = file.missing
    ? t("agents.files.status_missing")
    : `${formatBytes(file.size)} · ${formatAgo(file.updatedAtMs ?? null)}`;
  return html`
    <button
      type="button"
      class="agent-file-row ${active === file.name ? "active" : ""}"
      @click=${onSelect}
    >
      <div>
        <div class="agent-file-name mono">${file.name}</div>
        <div class="agent-file-meta">${status}</div>
      </div>
      ${
        file.missing
          ? html`
              <span class="agent-pill warn">${t("agents.files.badge_missing")}</span>
            `
          : nothing
      }
    </button>
  `;
}

function renderAgentTools(params: {
  agentId: string;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
}) {
  const config = resolveAgentConfig(params.configForm, params.agentId);
  const agentTools = config.entry?.tools ?? {};
  const globalTools = config.globalTools ?? {};
  const profile = agentTools.profile ?? globalTools.profile ?? "full";
  const profileSource = agentTools.profile
    ? t("agents.tools.source_agent")
    : globalTools.profile
      ? t("agents.tools.source_global")
      : t("agents.tools.source_default");
  const hasAgentAllow = Array.isArray(agentTools.allow) && agentTools.allow.length > 0;
  const hasGlobalAllow = Array.isArray(globalTools.allow) && globalTools.allow.length > 0;
  const editable =
    Boolean(params.configForm) && !params.configLoading && !params.configSaving && !hasAgentAllow;
  const alsoAllow = hasAgentAllow
    ? []
    : Array.isArray(agentTools.alsoAllow)
      ? agentTools.alsoAllow
      : [];
  const deny = hasAgentAllow ? [] : Array.isArray(agentTools.deny) ? agentTools.deny : [];
  const basePolicy = hasAgentAllow
    ? { allow: agentTools.allow ?? [], deny: agentTools.deny ?? [] }
    : (resolveToolProfilePolicy(profile) ?? undefined);
  const toolIds = TOOL_SECTIONS.flatMap((section) => section.tools.map((tool) => tool.id));

  const resolveAllowed = (toolId: string) => {
    const baseAllowed = isAllowedByPolicy(toolId, basePolicy);
    const extraAllowed = matchesList(toolId, alsoAllow);
    const denied = matchesList(toolId, deny);
    const allowed = (baseAllowed || extraAllowed) && !denied;
    return {
      allowed,
      baseAllowed,
      denied,
    };
  };
  const enabledCount = toolIds.filter((toolId) => resolveAllowed(toolId).allowed).length;

  const updateTool = (toolId: string, nextEnabled: boolean) => {
    const nextAllow = new Set(
      alsoAllow.map((entry) => normalizeToolName(entry)).filter((entry) => entry.length > 0),
    );
    const nextDeny = new Set(
      deny.map((entry) => normalizeToolName(entry)).filter((entry) => entry.length > 0),
    );
    const baseAllowed = resolveAllowed(toolId).baseAllowed;
    const normalized = normalizeToolName(toolId);
    if (nextEnabled) {
      nextDeny.delete(normalized);
      if (!baseAllowed) {
        nextAllow.add(normalized);
      }
    } else {
      nextAllow.delete(normalized);
      nextDeny.add(normalized);
    }
    params.onOverridesChange(params.agentId, [...nextAllow], [...nextDeny]);
  };

  const updateAll = (nextEnabled: boolean) => {
    const nextAllow = new Set(
      alsoAllow.map((entry) => normalizeToolName(entry)).filter((entry) => entry.length > 0),
    );
    const nextDeny = new Set(
      deny.map((entry) => normalizeToolName(entry)).filter((entry) => entry.length > 0),
    );
    for (const toolId of toolIds) {
      const baseAllowed = resolveAllowed(toolId).baseAllowed;
      const normalized = normalizeToolName(toolId);
      if (nextEnabled) {
        nextDeny.delete(normalized);
        if (!baseAllowed) {
          nextAllow.add(normalized);
        }
      } else {
        nextAllow.delete(normalized);
        nextDeny.add(normalized);
      }
    }
    params.onOverridesChange(params.agentId, [...nextAllow], [...nextDeny]);
  };

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("agents.tools.title")}</div>
          <div class="card-sub">
            ${t("agents.tools.subtitle")}
            <span class="mono">${t("agents.tools.enabled_count").replace("{enabled}", String(enabledCount)).replace("{total}", String(toolIds.length))}</span>
          </div>
        </div>
        <div class="row" style="gap: 8px;">
          <button
            class="btn btn--sm"
            ?disabled=${!editable}
            @click=${() => updateAll(true)}
          >
            ${t("agents.tools.enable_all")}
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${!editable}
            @click=${() => updateAll(false)}
          >
            ${t("agents.tools.disable_all")}
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${params.configLoading}
            @click=${params.onConfigReload}
          >
            ${t("agents.tools.reload_config")}
          </button>
          <button
            class="btn btn--sm primary"
            ?disabled=${params.configSaving || !params.configDirty}
            @click=${params.onConfigSave}
          >
            ${params.configSaving ? t("agents.tools.saving") : t("agents.tools.save")}
          </button>
        </div>
      </div>

      ${
        !params.configForm
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.tools.load_prompt")}
              </div>
            `
          : nothing
      }
      ${
        hasAgentAllow
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.tools.allowlist_hint")}
              </div>
            `
          : nothing
      }
      ${
        hasGlobalAllow
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.tools.global_allow_hint")}
              </div>
            `
          : nothing
      }

      <div class="agent-tools-meta" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">${t("agents.tools.profile")}</div>
          <div class="mono">${profile}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.tools.source")}</div>
          <div>${profileSource}</div>
        </div>
        ${
          params.configDirty
            ? html`
                <div class="agent-kv">
                  <div class="label">${t("agents.tools.status")}</div>
                  <div class="mono">${t("agents.tools.status_unsaved")}</div>
                </div>
              `
            : nothing
        }
      </div>

      <div class="agent-tools-presets" style="margin-top: 16px;">
        <div class="label">${t("agents.tools.presets")}</div>
        <div class="agent-tools-buttons">
          ${PROFILE_OPTIONS.map(
            (option) => html`
              <button
                class="btn btn--sm ${profile === option.id ? "active" : ""}"
                ?disabled=${!editable}
                @click=${() => params.onProfileChange(params.agentId, option.id, true)}
              >
                ${option.label()}
              </button>
            `,
          )}
          <button
            class="btn btn--sm"
            ?disabled=${!editable}
            @click=${() => params.onProfileChange(params.agentId, null, false)}
          >
            ${t("agents.tools.inherit")}
          </button>
        </div>
      </div>

      <div class="agent-tools-grid" style="margin-top: 20px;">
        ${TOOL_SECTIONS.map(
          (section) =>
            html`
            <div class="agent-tools-section">
              <div class="agent-tools-header">${section.label()}</div>
              <div class="agent-tools-list">
                ${section.tools.map((tool) => {
                  const { allowed } = resolveAllowed(tool.id);
                  return html`
                    <div class="agent-tool-row">
                      <div>
                        <div class="agent-tool-title">${tool.description()}</div>
                        <div class="agent-tool-sub mono">${tool.id}</div>
                      </div>
                      <label class="cfg-toggle">
                        <input
                          type="checkbox"
                          .checked=${allowed}
                          ?disabled=${!editable}
                          @change=${(e: Event) =>
                            updateTool(tool.id, (e.target as HTMLInputElement).checked)}
                        />
                        <span class="cfg-toggle__track"></span>
                      </label>
                    </div>
                  `;
                })}
              </div>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

const SKILL_SOURCE_GROUPS: Array<{ id: string; label: () => string; sources: string[] }> = [
  {
    id: "workspace",
    label: () => t("agents.skills.group.workspace"),
    sources: ["openclaw-workspace"],
  },
  { id: "built-in", label: () => t("agents.skills.group.builtin"), sources: ["openclaw-bundled"] },
  {
    id: "installed",
    label: () => t("agents.skills.group.installed"),
    sources: ["openclaw-managed"],
  },
  { id: "extra", label: () => t("agents.skills.group.extra"), sources: ["openclaw-extra"] },
];

const builtInGroup = SKILL_SOURCE_GROUPS[1]; // built-in group

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) {
    groups.set(def.id, { id: def.id, label: def.label(), skills: [] });
  }
  const other: SkillGroup = { id: "other", label: t("agents.skills.group.other"), skills: [] };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : SKILL_SOURCE_GROUPS.find((group) => group.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = SKILL_SOURCE_GROUPS.map((group) => groups.get(group.id)).filter(
    (group): group is SkillGroup => Boolean(group && group.skills.length > 0),
  );
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
}

function renderAgentSkills(params: {
  agentId: string;
  report: SkillStatusReport | null;
  loading: boolean;
  error: string | null;
  activeAgentId: string | null;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  filter: string;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onClear: (agentId: string) => void;
  onDisableAll: (agentId: string) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
}) {
  const editable = Boolean(params.configForm) && !params.configLoading && !params.configSaving;
  const config = resolveAgentConfig(params.configForm, params.agentId);
  const allowlist = Array.isArray(config.entry?.skills) ? config.entry?.skills : undefined;
  const allowSet = new Set((allowlist ?? []).map((name) => name.trim()).filter(Boolean));
  const usingAllowlist = allowlist !== undefined;
  const reportReady = Boolean(params.report && params.activeAgentId === params.agentId);
  const rawSkills = reportReady ? (params.report?.skills ?? []) : [];
  const filter = params.filter.trim().toLowerCase();
  const filtered = filter
    ? rawSkills.filter((skill) =>
        [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter),
      )
    : rawSkills;
  const groups = groupSkills(filtered);
  const enabledCount = usingAllowlist
    ? rawSkills.filter((skill) => allowSet.has(skill.name)).length
    : rawSkills.length;
  const totalCount = rawSkills.length;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("agents.skills.title")}</div>
          <div class="card-sub">
            ${t("agents.skills.subtitle")}
            ${totalCount > 0 ? html`<span class="mono">${t("agents.skills.enabled_count").replace("{enabled}", String(enabledCount)).replace("{total}", String(totalCount))}</span>` : nothing}
          </div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm" ?disabled=${!editable} @click=${() => params.onClear(params.agentId)}>
            ${t("agents.skills.use_all")}
          </button>
          <button class="btn btn--sm" ?disabled=${!editable} @click=${() => params.onDisableAll(params.agentId)}>
            ${t("agents.skills.disable_all")}
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${params.configLoading}
            @click=${params.onConfigReload}
          >
            ${t("agents.skills.reload_config")}
          </button>
          <button class="btn btn--sm" ?disabled=${params.loading} @click=${params.onRefresh}>
            ${params.loading ? t("agents.skills.refreshing") : t("agents.skills.refresh")}
          </button>
          <button
            class="btn btn--sm primary"
            ?disabled=${params.configSaving || !params.configDirty}
            @click=${params.onConfigSave}
          >
            ${params.configSaving ? t("agents.skills.saving") : t("agents.skills.save")}
          </button>
        </div>
      </div>

      ${
        !params.configForm
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.skills.load_config_prompt")}
              </div>
            `
          : nothing
      }
      ${
        usingAllowlist
          ? html`
              <div class="callout info" style="margin-top: 12px">${t("agents.skills.allowlist_hint")}</div>
            `
          : html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.skills.all_enabled_hint")}
              </div>
            `
      }
      ${
        !reportReady && !params.loading
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.skills.load_skills_prompt")}
              </div>
            `
          : nothing
      }
      ${
        params.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${params.error}</div>`
          : nothing
      }

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="flex: 1;">
          <span>${t("agents.skills.filter")}</span>
          <input
            .value=${params.filter}
            @input=${(e: Event) => params.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder=${t("agents.skills.filter_placeholder")}
          />
        </label>
        <div class="muted">${t("agents.skills.shown_count").replace("{count}", String(filtered.length))}</div>
      </div>

      ${
        filtered.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">${t("agents.skills.no_skills")}</div>
            `
          : html`
              <div class="agent-skills-groups" style="margin-top: 16px;">
                ${groups.map((group) =>
                  renderAgentSkillGroup(group, {
                    agentId: params.agentId,
                    allowSet,
                    usingAllowlist,
                    editable,
                    onToggle: params.onToggle,
                  }),
                )}
              </div>
            `
      }
    </section>
  `;
}

function renderAgentSkillGroup(
  group: SkillGroup,
  params: {
    agentId: string;
    allowSet: Set<string>;
    usingAllowlist: boolean;
    editable: boolean;
    onToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  },
) {
  const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
  return html`
    <details class="agent-skills-group" ?open=${!collapsedByDefault}>
      <summary class="agent-skills-header">
        <span>${group.label}</span>
        <span class="muted">${group.skills.length}</span>
      </summary>
      <div class="list skills-grid">
        ${group.skills.map((skill) =>
          renderAgentSkillRow(skill, {
            agentId: params.agentId,
            allowSet: params.allowSet,
            usingAllowlist: params.usingAllowlist,
            editable: params.editable,
            onToggle: params.onToggle,
          }),
        )}
      </div>
    </details>
  `;
}

function renderAgentSkillRow(
  skill: SkillStatusEntry,
  params: {
    agentId: string;
    allowSet: Set<string>;
    usingAllowlist: boolean;
    editable: boolean;
    onToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  },
) {
  const enabled = params.usingAllowlist ? params.allowSet.has(skill.name) : true;
  const missing = [
    ...skill.missing.bins.map((b) => `bin:${b}`),
    ...skill.missing.env.map((e) => `env:${e}`),
    ...skill.missing.config.map((c) => `config:${c}`),
    ...skill.missing.os.map((o) => `os:${o}`),
  ];
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push(t("agents.skills.status.disabled"));
  }
  if (skill.blockedByAllowlist) {
    reasons.push(t("agents.skills.status.blocked_by_allowlist"));
  }
  return html`
    <div class="list-item agent-skill-row">
      <div class="list-main">
        <div class="list-title">
          ${skill.emoji ? `${skill.emoji} ` : ""}${skill.name}
        </div>
        <div class="list-sub">${skill.description}</div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${skill.source}</span>
          <span class="chip ${skill.eligible ? "chip-ok" : "chip-warn"}">
            ${skill.eligible ? t("agents.skills.status.eligible") : t("agents.skills.status.blocked")}
          </span>
          ${
            skill.disabled
              ? html`
                  <span class="chip chip-warn">${t("agents.skills.status.disabled")}</span>
                `
              : nothing
          }
        </div>
        ${
          missing.length > 0
            ? html`<div class="muted" style="margin-top: 6px;">${t("agents.skills.missing_prefix").replace("{items}", missing.join(", "))}</div>`
            : nothing
        }
        ${
          reasons.length > 0
            ? html`<div class="muted" style="margin-top: 6px;">${t("agents.skills.reason_prefix").replace("{reasons}", reasons.join(", "))}</div>`
            : nothing
        }
      </div>
      <div class="list-meta">
        <label class="cfg-toggle">
          <input
            type="checkbox"
            .checked=${enabled}
            ?disabled=${!params.editable}
            @change=${(e: Event) =>
              params.onToggle(params.agentId, skill.name, (e.target as HTMLInputElement).checked)}
          />
          <span class="cfg-toggle__track"></span>
        </label>
      </div>
    </div>
  `;
}

function renderAgentEditModal(props: AgentsProps) {
  const isNew = props.editingAgent?.id === "";
  const idPattern = /^[a-z0-9][a-z0-9-]*$/;
  const isValidId = props.editingAgent?.id && idPattern.test(props.editingAgent.id);

  return html`
    <section class="card" style="margin-bottom: 16px;">
      <div class="card-title">${isNew ? t("agents.add_agent") : t("agents.edit_agent")}</div>
      <div class="card-sub">${isNew ? t("agents.add_agent_subtitle") : t("agents.edit_agent_subtitle")}</div>
      
      <div style="margin-top: 16px;">
        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">${t("agents.agent_id")}</label>
          <input
            type="text"
            class="form-control"
            .value=${props.editingAgent?.id || ""}
            ?disabled=${!isNew}
            placeholder=${t("agents.agent_id_placeholder")}
            @input=${(e: Event) => props.onAgentFormChange("id", (e.target as HTMLInputElement).value)}
          />
          <small class="form-text muted">${t("agents.agent_id_help")}</small>
          ${
            !isValidId && props.editingAgent?.id
              ? html`
            <small class="form-text" style="color: var(--color-danger);">${t("agents.invalid_id")}</small>
          `
              : nothing
          }
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">${t("agents.agent_name")}</label>
          <input
            type="text"
            class="form-control"
            .value=${props.editingAgent?.name || ""}
            placeholder=${t("agents.agent_name_placeholder")}
            @input=${(e: Event) => props.onAgentFormChange("name", (e.target as HTMLInputElement).value)}
          />
        </div>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">${t("agents.workspace_path")}</label>
          <input
            type="text"
            class="form-control"
            .value=${props.editingAgent?.workspace || ""}
            placeholder=${t("agents.workspace_placeholder")}
            @input=${(e: Event) => props.onAgentFormChange("workspace", (e.target as HTMLInputElement).value)}
          />
        </div>
        
        <div class="row" style="gap: 8px;">
          <button class="btn" @click=${props.onCancelEdit}>
            ${t("agents.cancel")}
          </button>
          <button 
            class="btn btn--primary" 
            ?disabled=${!isValidId || props.creatingAgent}
            @click=${props.onSaveAgent}
          >
            ${props.creatingAgent ? t("agents.creating") : t("agents.save")}
          </button>
        </div>
      </div>
    </section>
  `;
}
