import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { MemoryCitationsMode } from "../../config/types.memory.js";
import type { ResolvedTimeFormat } from "../date-time.js";
import type { EmbeddedContextFile } from "../pi-embedded-helpers.js";
import type { ProviderSystemPromptContribution } from "../system-prompt-contribution.js";
import { buildAgentSystemPrompt } from "../system-prompt.js";
import type { PromptMode } from "../system-prompt.types.js";
import type { EmbeddedSandboxInfo } from "./types.js";
import type { ReasoningLevel, ThinkLevel } from "./utils.js";

/**
 * 兖底项目路径自动推断（防循环导入，延迟加载）
 * 根据 agentId 查找其所在的唯一项目，自动填充 projectWorkspacePath / codeDir
 */
function tryAutoResolveProjectPaths(agentId: string | undefined): {
  projectWorkspacePath?: string;
  codeDir?: string;
} {
  if (!agentId) return {};
  try {
    // 延迟导入，避免模块初始化时循环依赖
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { groupManager } = require("../../../../src/sessions/group-manager.js") as {
      groupManager: { getAllGroups(): Array<{ id: string; projectId?: string; members: Array<{ agentId: string }> }> };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildProjectContext } = require("../../../../src/utils/project-context.js") as {
      buildProjectContext(projectId: string): { workspacePath: string; codeDir: string };
    };
    const allGroups = groupManager.getAllGroups();
    const normalizedAgentId = agentId.toLowerCase();
    const memberGroups = allGroups.filter(
      (g) =>
        g.projectId &&
        g.members.some((m) => m.agentId.toLowerCase() === normalizedAgentId),
    );
    // 只属于一个项目时才自动填充（多项目情况不自动推断，避免路径混淆）
    if (memberGroups.length !== 1 || !memberGroups[0].projectId) return {};
    const ctx = buildProjectContext(memberGroups[0].projectId);
    return {
      projectWorkspacePath: ctx.workspacePath,
      codeDir: ctx.codeDir,
    };
  } catch {
    // 推断失败不影响主要流程
    return {};
  }
}

export function buildEmbeddedSystemPrompt(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
  reasoningTagHint: boolean;
  heartbeatPrompt?: string;
  skillsPrompt?: string;
  docsPath?: string;
  ttsHint?: string;
  reactionGuidance?: {
    level: "minimal" | "extensive";
    channel: string;
  };
  workspaceNotes?: string[];
  /** Controls which hardcoded sections to include. Defaults to "full". */
  promptMode?: PromptMode;
  /** Whether ACP-specific routing guidance should be included. Defaults to true. */
  acpEnabled?: boolean;
  runtimeInfo: {
    agentId?: string;
    host: string;
    os: string;
    arch: string;
    node: string;
    model: string;
    provider?: string;
    capabilities?: string[];
    channel?: string;
    /** Supported message actions for the current channel (e.g., react, edit, unsend) */
    channelActions?: string[];
    canvasRootDir?: string;
  };
  messageToolHints?: string[];
  sandboxInfo?: EmbeddedSandboxInfo;
  tools: AgentTool[];
  modelAliasLines: string[];
  userTimezone: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  includeMemorySection?: boolean;
  memoryCitationsMode?: MemoryCitationsMode;
  promptContribution?: ProviderSystemPromptContribution;
}): string {
  return buildAgentSystemPrompt({
    workspaceDir: params.workspaceDir,
    defaultThinkLevel: params.defaultThinkLevel,
    reasoningLevel: params.reasoningLevel,
    extraSystemPrompt: params.extraSystemPrompt,
    ownerNumbers: params.ownerNumbers,
    ownerDisplay: params.ownerDisplay,
    ownerDisplaySecret: params.ownerDisplaySecret,
    reasoningTagHint: params.reasoningTagHint,
    heartbeatPrompt: params.heartbeatPrompt,
    skillsPrompt: params.skillsPrompt,
    docsPath: params.docsPath,
    ttsHint: params.ttsHint,
    workspaceNotes: params.workspaceNotes,
    reactionGuidance: params.reactionGuidance,
    promptMode: params.promptMode,
    acpEnabled: params.acpEnabled,
    runtimeInfo: params.runtimeInfo,
    messageToolHints: params.messageToolHints,
    sandboxInfo: params.sandboxInfo,
    toolNames: params.tools.map((tool) => tool.name),
    modelAliasLines: params.modelAliasLines,
    userTimezone: params.userTimezone,
    userTime: params.userTime,
    userTimeFormat: params.userTimeFormat,
    contextFiles: params.contextFiles,
    includeMemorySection: params.includeMemorySection,
    memoryCitationsMode: params.memoryCitationsMode,
    promptContribution: params.promptContribution,
    // 兖底项目路径自动推断：当调用方未显式传入 projectWorkspacePath/codeDir 时，
    // 根据 agentId 查找其所在的唯一项目并自动填充实际路径
    resolveProjectPaths: () => tryAutoResolveProjectPaths(params.runtimeInfo.agentId),
  });
}

export function createSystemPromptOverride(
  systemPrompt: string,
): (defaultPrompt?: string) => string {
  const override = systemPrompt.trim();
  return (_defaultPrompt?: string) => override;
}

export function applySystemPromptOverrideToSession(
  session: AgentSession,
  override: string | ((defaultPrompt?: string) => string),
) {
  const prompt = typeof override === "function" ? override() : override.trim();
  session.agent.state.systemPrompt = prompt;
  const mutableSession = session as unknown as {
    _baseSystemPrompt?: string;
    _rebuildSystemPrompt?: (toolNames: string[]) => string;
  };
  mutableSession._baseSystemPrompt = prompt;
  mutableSession._rebuildSystemPrompt = () => prompt;
}
