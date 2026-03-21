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
  complexityWeight?: number;
  capabilityWeight?: number;
  costWeight?: number;
  speedWeight?: number;
  eloWeight?: number;
  /** Whether to enable cost-based optimization scoring. */
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
