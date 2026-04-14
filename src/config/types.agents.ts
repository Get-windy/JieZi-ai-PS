import type { ChatType } from "../../upstream/src/channels/chat-type.js";
import type { AgentDefaultsConfig } from "../../upstream/src/config/types.agent-defaults.js";
import type {
  AgentModelConfig,
  AgentSandboxConfig,
} from "../../upstream/src/config/types.agents-shared.js";
import type { HumanDelayConfig, IdentityConfig } from "../../upstream/src/config/types.base.js";
import type { GroupChatConfig } from "../../upstream/src/config/types.messages.js";
import type {
  AgentToolsConfig,
  MemorySearchConfig,
} from "../../upstream/src/config/types.tools.js";

export type AgentRuntimeAcpConfig = {
  /** ACP harness adapter id (for example codex, claude). */
  agent?: string;
  /** Optional ACP backend override for this agent runtime. */
  backend?: string;
  /** Optional ACP session mode override. */
  mode?: "persistent" | "oneshot";
  /** Optional runtime working directory override. */
  cwd?: string;
};

export type AgentRuntimeConfig =
  | {
      type: "embedded";
    }
  | {
      type: "acp";
      acp?: AgentRuntimeAcpConfig;
    };

export type AgentBindingMatch = {
  channel: string;
  accountId?: string;
  peer?: { kind: ChatType; id: string };
  guildId?: string;
  teamId?: string;
  /** Discord role IDs used for role-based routing. */
  roles?: string[];
};

export type AgentRouteBinding = {
  /** Missing type is interpreted as route for backward compatibility. */
  type?: "route";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
};

export type AgentAcpBinding = {
  type: "acp";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
  acp?: {
    mode?: "persistent" | "oneshot";
    label?: string;
    cwd?: string;
    backend?: string;
  };
};

export type AgentBinding = AgentRouteBinding | AgentAcpBinding;

export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentModelConfig;
  /** Local extension: model accounts for smart routing */
  modelAccounts?: AgentModelAccountsConfig;
  /** Local extension: permissions system */
  permissions?: {
    rules?: Array<{
      id: string;
      toolName: string;
      action: "allow" | "deny" | "ask";
      roleIds?: string[];
      enabled?: boolean;
      [key: string]: unknown;
    }>;
    roles?: unknown[];
    groups?: unknown[];
  };
  /** Optional allowlist of skills for this agent (omit = all skills; empty = none). */
  skills?: string[];
  memorySearch?: MemorySearchConfig;
  /** Human-like delay between block replies for this agent. */
  humanDelay?: HumanDelayConfig;
  /** Optional per-agent heartbeat overrides. */
  heartbeat?: AgentDefaultsConfig["heartbeat"];
  identity?: IdentityConfig;
  groupChat?: GroupChatConfig;
  subagents?: {
    /** Allow spawning sub-agents under other agent ids. Use "*" to allow any. */
    allowAgents?: string[];
    /** Per-agent default model for spawned sub-agents (string or {primary,fallbacks}). */
    model?: AgentModelConfig;
  };
  /** Optional per-agent sandbox overrides. */
  sandbox?: AgentSandboxConfig;
  /** Optional per-agent stream params (e.g. cacheRetention, temperature). */
  params?: Record<string, unknown>;
  tools?: AgentToolsConfig;
  /** Optional runtime descriptor for this agent. */
  runtime?: AgentRuntimeConfig;
};

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
};

/** Smart routing weight config for modelAccounts. */
export type AgentModelSmartRoutingConfig = {
  /** 基础能力匹配权重（上下文窗口、工具、视觉、推理等级）默认 20 */
  capabilityWeight?: number;
  /** 专业领域匹配权重（Coding/Math/Vision/Creative…）默认 12 */
  specializationWeight?: number;
  /** 模态匹配权重（文本/图片/代码）默认 8 */
  modalityWeight?: number;
  /** 综合 Arena Elo 权重（整体实力基线）默认 15 */
  eloWeight?: number;
  /** 编程专项 Elo 权重（lmarena Coding 分类）默认 11 */
  codingEloWeight?: number;
  /** 数学/推理专项 Elo 权重（lmarena Math / Hard Prompts）默认 11 */
  reasoningEloWeight?: number;
  /** 视觉专项 Elo 权重（lmarena Vision Arena）默认 8 */
  visionEloWeight?: number;
  /** 创意写作专项 Elo 权重（lmarena Creative Writing）默认 8 */
  creativeEloWeight?: number;
  /** 指令跟随专项 Elo 权重（lmarena Instruction Following）默认 7 */
  instructionEloWeight?: number;
  /**
   * @deprecated 路由引擎已不再使用成本评分，保留字段不封包破坏已有配置
   */
  costWeight?: number;
  /**
   * @deprecated 路由引擎已不再使用速度评分，保留字段不封包破坏已有配置
   */
  speedWeight?: number;
  /**
   * @deprecated 保留字段兼容
   */
  complexityWeight?: number;
  /** @deprecated 保留字段兼容 */
  enableCostOptimization?: boolean;
};

/** Per-agent model accounts routing config (local overlay feature). */
export type AgentModelAccountsConfig = {
  /** List of account IDs available for routing. */
  accounts: string[];
  /** Routing strategy: 'manual' (fixed default), 'smart' (auto-scored), or 'roundRobin' (rotate through accounts). */
  routingMode?: "manual" | "smart" | "roundRobin";
  /** Default account ID used in 'manual' mode. */
  defaultAccountId?: string;
  /** Weight tuning for 'smart' routing mode. */
  smartRouting?: AgentModelSmartRoutingConfig;
  /** Per-account configuration (e.g., enabled flag). */
  accountConfigs?: Array<{ accountId: string; enabled?: boolean; [key: string]: unknown }>;
  /** Enable session pinning: once an account is selected for a session, prefer it on subsequent turns (default: true). */
  enableSessionPinning?: boolean;
};
