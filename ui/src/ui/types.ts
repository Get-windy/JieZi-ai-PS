export type ChannelsStatusSnapshot = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  channelConfigSchemas?: Record<string, unknown>; // 新增：JSON Schema 映射
  channels: Record<string, unknown>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
};

export type ChannelUiMetaEntry = {
  id: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
};

export const CRON_CHANNEL_LAST = "last";

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  dmPolicy?: string | null;
  allowFrom?: string[] | null;
  tokenSource?: string | null;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  allowUnmentionedGroups?: boolean | null;
  cliPath?: string | null;
  dbPath?: string | null;
  port?: number | null;
  probe?: unknown;
  audit?: unknown;
  application?: unknown;
};

export type WhatsAppSelf = {
  e164?: string | null;
  jid?: string | null;
};

export type WhatsAppDisconnect = {
  at: number;
  status?: number | null;
  error?: string | null;
  loggedOut?: boolean | null;
};

export type WhatsAppStatus = {
  configured: boolean;
  linked: boolean;
  authAgeMs?: number | null;
  self?: WhatsAppSelf | null;
  running: boolean;
  connected: boolean;
  lastConnectedAt?: number | null;
  lastDisconnect?: WhatsAppDisconnect | null;
  reconnectAttempts: number;
  lastMessageAt?: number | null;
  lastEventAt?: number | null;
  lastError?: string | null;
};

export type TelegramBot = {
  id?: number | null;
  username?: string | null;
};

export type TelegramWebhook = {
  url?: string | null;
  hasCustomCert?: boolean | null;
};

export type TelegramProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: TelegramBot | null;
  webhook?: TelegramWebhook | null;
};

export type TelegramStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  mode?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: TelegramProbe | null;
  lastProbeAt?: number | null;
};

export type DiscordBot = {
  id?: string | null;
  username?: string | null;
};

export type DiscordProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: DiscordBot | null;
};

export type DiscordStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: DiscordProbe | null;
  lastProbeAt?: number | null;
};

export type GoogleChatProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
};

export type GoogleChatStatus = {
  configured: boolean;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: GoogleChatProbe | null;
  lastProbeAt?: number | null;
};

export type SlackBot = {
  id?: string | null;
  name?: string | null;
};

export type SlackTeam = {
  id?: string | null;
  name?: string | null;
};

export type SlackProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: SlackBot | null;
  team?: SlackTeam | null;
};

export type SlackStatus = {
  configured: boolean;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SlackProbe | null;
  lastProbeAt?: number | null;
};

export type SignalProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  version?: string | null;
};

export type SignalStatus = {
  configured: boolean;
  baseUrl: string;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SignalProbe | null;
  lastProbeAt?: number | null;
};

export type IMessageProbe = {
  ok: boolean;
  error?: string | null;
};

export type IMessageStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  cliPath?: string | null;
  dbPath?: string | null;
  probe?: IMessageProbe | null;
  lastProbeAt?: number | null;
};

export type NostrProfile = {
  name?: string | null;
  displayName?: string | null;
  about?: string | null;
  picture?: string | null;
  banner?: string | null;
  website?: string | null;
  nip05?: string | null;
  lud16?: string | null;
};

export type NostrStatus = {
  configured: boolean;
  publicKey?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  profile?: NostrProfile | null;
};

export type MSTeamsProbe = {
  ok: boolean;
  error?: string | null;
  appId?: string | null;
};

export type MSTeamsStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  port?: number | null;
  probe?: MSTeamsProbe | null;
  lastProbeAt?: number | null;
};

export type ConfigSnapshotIssue = {
  path: string;
  message: string;
};

export type ConfigSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  raw?: string | null;
  hash?: string | null;
  parsed?: unknown;
  valid?: boolean | null;
  config?: Record<string, unknown> | null;
  issues?: ConfigSnapshotIssue[] | null;
};

export type ConfigUiHint = {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

export type ConfigSchemaResponse = {
  schema: unknown;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type PresenceEntry = {
  deviceFamily?: string | null;
  host?: string | null;
  instanceId?: string | null;
  ip?: string | null;
  lastInputSeconds?: number | null;
  mode?: string | null;
  modelIdentifier?: string | null;
  platform?: string | null;
  reason?: string | null;
  roles?: Array<string | null> | null;
  scopes?: Array<string | null> | null;
  text?: string | null;
  ts?: number | null;
  version?: string | null;
};

export type GatewaySessionsDefaults = {
  model: string | null;
  contextTokens: number | null;
};

export type GatewayAgentRow = {
  id: string;
  name?: string;
  workspace?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
};

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: GatewayAgentRow[];
};

export type AgentIdentityResult = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

export type AgentsFilesGetResult = {
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type AgentsFilesSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type GatewaySessionRow = {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  surface?: string;
  subject?: string;
  room?: string;
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
};

export type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  defaults: GatewaySessionsDefaults;
  sessions: GatewaySessionRow[];
};

export type SessionsPatchResult = {
  ok: true;
  path: string;
  key: string;
  entry: {
    sessionId: string;
    updatedAt?: number;
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    elevatedLevel?: string;
  };
};

export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type CronSessionTarget = "main" | "isolated";
export type CronWakeMode = "next-heartbeat" | "now";

export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      thinking?: string;
      timeoutSeconds?: number;
    };

export type CronDelivery = {
  mode: "none" | "announce";
  channel?: string;
  to?: string;
  bestEffort?: boolean;
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
};

export type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  status: "ok" | "error" | "skipped";
  durationMs?: number;
  error?: string;
  summary?: string;
};

export type SkillsStatusConfigCheck = {
  path: string;
  value: unknown;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  bundled?: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type StatusSummary = Record<string, unknown>;

export type HealthSnapshot = Record<string, unknown>;

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogEntry = {
  raw: string;
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};

// === 模型管理相关类型 ===

/** 模型供应商状态快照（新架构）*/
export type ModelsStatusSnapshot = {
  ts: number;
  providerOrder: string[]; // 模型供应商顺序，如 ["openai", "anthropic", "google"]
  providerLabels: Record<string, string>; // 供应商显示名称
  providerMeta?: ModelProviderMetaEntry[];
  providers: Record<string, unknown>; // 供应商配置

  // 新的数据结构
  auths: Record<string, ProviderAuthSnapshot[]>; // 供应商的认证列表（按供应商分组）
  modelConfigs: Record<string, ModelConfigSnapshot[]>; // 模型配置列表（按供应商分组）
  defaultAuthId: Record<string, string>; // 每个供应商的默认认证ID

  // API模板库（预置）
  apiTemplates?: Array<{
    id: string;
    name: string;
    description?: string;
    defaultBaseUrl: string;
    apiKeyPlaceholder?: string;
    authType?: "bearer" | "api-key" | "custom";
  }>;

  // 供应商实例列表（用户添加的）
  providerInstances?: Array<{
    id: string;
    name: string;
    icon?: string;
    website?: string;
    templateId?: string;
    defaultBaseUrl: string;
    apiKeyPlaceholder?: string;
    custom: boolean;
    createdAt: number;
  }>;
};

/** 模型供应商元信息 */
export type ModelProviderMetaEntry = {
  id: string; // 供应商ID，如 "openai"
  label: string; // 显示名称，如 "OpenAI"
  detailLabel: string; // 详细说明
  icon?: string; // 图标
};

/** 供应商认证快照 */
export type ProviderAuthSnapshot = {
  authId: string; // 认证ID
  name: string; // 认证昵称（如"公司主账号"、"个人测试账号"）
  provider: string; // 所属供应商
  apiKey: string; // API Key
  baseUrl?: string | null; // Base URL
  enabled: boolean; // 是否启用
  isDefault: boolean; // 是否为默认认证
  createdAt: number; // 创建时间

  // 认证状态检测
  status?: {
    valid: boolean; // 是否有效
    lastChecked: number; // 最后检测时间
    error?: string | null; // 错误信息
  } | null;

  // 成本控制
  budgetControl?: {
    dailyLimit?: number | null; // 每日预算上限（美元）
    monthlyLimit?: number | null; // 每月预算上限（美元）
    alertThreshold?: number | null; // 预警阈值（百分比）
  } | null;

  // 实时查询的数据（不持久化）
  availableModels?: string[] | null; // 该认证可用的模型列表
  balance?: {
    amount: number; // 账户余额
    currency: string; // 货币单位
    lastUpdated: number; // 最后更新时间
  } | null;
};

/** 模型配置快照 */
export type ModelConfigSnapshot = {
  configId: string; // 配置ID
  authId: string; // 关联的认证ID
  provider: string; // 所属供应商
  modelName: string; // 模型名称（如 "gpt-4"）
  nickname?: string | null; // 模型昵称（如"生产环境GPT4"）
  enabled: boolean; // 是否启用

  // 内容控制参数
  temperature?: number | null; // 随机性 (0-2)
  topP?: number | null; // 核采样 (0-1)
  maxTokens?: number | null; // 单次回复长度
  frequencyPenalty?: number | null; // 频率惩罚 (-2 to 2)

  // 资源与功能
  systemPrompt?: string | null; // System Prompt
  conversationRounds?: number | null; // 对话轮数保留
  maxIterations?: number | null; // 最大思考步骤

  // 使用限制
  usageLimits?: {
    maxRequestsPerDay?: number | null; // 每日最大请求数
    maxTokensPerRequest?: number | null; // 单次最大 tokens
  } | null;

  // 实时查询的数据（不持久化）
  pricing?: {
    inputPer1k: number; // 输入token单价（每1K tokens，美元）
    outputPer1k: number; // 输出token单价（每1K tokens，美元）
    currency: string; // 货币单位
  } | null;
};

// ============ 旧的类型定义（向后兼容，标记为废弃）============

/** @deprecated 使用 ModelConfigSnapshot 代替 */
export type ModelAccountSnapshot = {
  accountId: string; // 账号ID
  name: string; // 账号名称（必填）
  provider: string; // 所属供应商
  model: string; // 模型名称，如 "gpt-4"
  enabled: boolean; // 是否启用
  connected: boolean; // 是否已连接

  // 连接信息
  lastConnectedAt?: number | null;
  lastDisconnectedAt?: number | null;
  lastError?: string | null;

  // Token 使用统计
  tokenUsage?: {
    input: number; // 输入token数
    output: number; // 输出token数
    total: number; // 总token数
    cost?: number; // 成本（可选）
  } | null;

  // 限制配置
  maxTokensPerRequest?: number | null; // 单次请求最大token数
  maxTokensDaily?: number | null; // 每日token限制
  autoDisconnectAfterMinutes?: number | null; // 自动断连时间（分钟）

  // API配置
  apiKey?: string | null;
  baseUrl?: string | null;
  apiVersion?: string | null;

  // 其他配置
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
};
