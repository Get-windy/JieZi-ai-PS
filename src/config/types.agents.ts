import type { ChatType } from "../channels/chat-type.js";
import type { AgentDefaultsConfig } from "./types.agent-defaults.js";
import type { HumanDelayConfig, IdentityConfig } from "./types.base.js";
import type { AgentChannelPolicies } from "./types.channel-policies.js";
import type { GroupChatConfig } from "./types.messages.js";
import type {
  SandboxBrowserSettings,
  SandboxDockerSettings,
  SandboxPruneSettings,
} from "./types.sandbox.js";
import type { AgentToolsConfig, MemorySearchConfig } from "./types.tools.js";

export type AgentModelConfig =
  | string
  | {
      /** Primary model (provider/model). */
      primary?: string;
      /** Per-agent model fallbacks (provider/model). */
      fallbacks?: string[];
    };

/**
 * 智能助手模型账号路由配置
 * 支持一个智能助手绑定多个模型账号，并根据问题复杂度、模型能力、成本等因素智能选择最优账号
 */
export type AgentModelAccountsConfig = {
  /** 可用模型账号列表（引用 auth.profiles 中的 ID） */
  accounts: string[];

  /** 路由模式：manual(手动) 或 smart(智能路由) */
  routingMode: "manual" | "smart";

  /** 智能路由配置（仅 routingMode=smart 时有效） */
  smartRouting?: {
    /** 是否启用成本优化 */
    enableCostOptimization?: boolean;

    /** 任务复杂度评估权重（0-100，默认40） */
    complexityWeight?: number;

    /** 模型能力匹配权重（默认30） */
    capabilityWeight?: number;

    /** 成本优化权重（默认20） */
    costWeight?: number;

    /** 响应速度权重（默认10） */
    speedWeight?: number;

    /** 复杂度阈值定义 */
    complexityThresholds?: {
      /** 简单任务阈值（默认 0-3） */
      simple: number;
      /** 中等任务阈值（默认 4-7） */
      medium: number;
      /** 复杂任务阈值（默认 8-10） */
      complex: number;
    };
  };

  /** 手动指定时的默认账号 */
  defaultAccountId?: string;

  /** 是否启用会话级别模型账号固定（避免频繁切换） */
  enableSessionPinning?: boolean;
};

export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentModelConfig;
  /** 绑定的模型账号ID（格式：provider/accountId） */
  modelAccountId?: string;
  /** 绑定的通道账号ID列表（格式：channel/accountId） */
  channelAccountIds?: string[];
  /** 【Phase 1】智能助手模型账号智能路由配置 */
  modelAccounts?: AgentModelAccountsConfig;
  /** 【Phase 2】通道账号策略配置 */
  channelPolicies?: AgentChannelPolicies;
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
    model?: string | { primary?: string; fallbacks?: string[] };
  };
  sandbox?: {
    mode?: "off" | "non-main" | "all";
    /** Agent workspace access inside the sandbox. */
    workspaceAccess?: "none" | "ro" | "rw";
    /**
     * Session tools visibility for sandboxed sessions.
     * - "spawned": only allow session tools to target sessions spawned from this session (default)
     * - "all": allow session tools to target any session
     */
    sessionToolsVisibility?: "spawned" | "all";
    /** Container/workspace scope for sandbox isolation. */
    scope?: "session" | "agent" | "shared";
    /** Legacy alias for scope ("session" when true, "shared" when false). */
    perSession?: boolean;
    workspaceRoot?: string;
    /** Docker-specific sandbox overrides for this agent. */
    docker?: SandboxDockerSettings;
    /** Optional sandboxed browser overrides for this agent. */
    browser?: SandboxBrowserSettings;
    /** Auto-prune overrides for this agent. */
    prune?: SandboxPruneSettings;
  };
  tools?: AgentToolsConfig;
};

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
};

export type AgentBinding = {
  agentId: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: { kind: ChatType; id: string };
    guildId?: string;
    teamId?: string;
  };
};
