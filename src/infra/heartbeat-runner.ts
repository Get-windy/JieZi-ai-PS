import fs from "node:fs/promises";
import path from "node:path";
import { appendCronStyleCurrentTimeLine } from "../../upstream/src/agents/current-time.js";
import { resolveEffectiveMessagesConfig } from "../../upstream/src/agents/identity.js";
import { resolveEmbeddedSessionLane } from "../../upstream/src/agents/pi-embedded.js";
import { DEFAULT_HEARTBEAT_FILENAME } from "../../upstream/src/agents/workspace.js";
import { resolveHeartbeatReplyPayload } from "../../upstream/src/auto-reply/heartbeat-reply-payload.js";
import {
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  DEFAULT_HEARTBEAT_EVERY,
  isHeartbeatContentEffectivelyEmpty,
  resolveHeartbeatPrompt as resolveHeartbeatPromptText,
  stripHeartbeatToken,
} from "../../upstream/src/auto-reply/heartbeat.js";
import { HEARTBEAT_TOKEN } from "../../upstream/src/auto-reply/tokens.js";
import type { ReplyPayload } from "../../upstream/src/auto-reply/types.js";
import { getChannelPlugin } from "../../upstream/src/channels/plugins/index.js";
import type { ChannelHeartbeatDeps } from "../../upstream/src/channels/plugins/types.js";
import { parseDurationMs } from "../../upstream/src/cli/parse-duration.js";
import type { OpenClawConfig } from "../../upstream/src/config/config.js";
import { loadConfig } from "../../upstream/src/config/config.js";
import {
  canonicalizeMainSessionAlias,
  loadSessionStore,
  resolveAgentIdFromSessionKey,
  resolveAgentMainSessionKey,
  resolveSessionFilePath,
  resolveStorePath,
  saveSessionStore,
  updateSessionStore,
} from "../../upstream/src/config/sessions.js";
import type { AgentDefaultsConfig } from "../../upstream/src/config/types.agent-defaults.js";
import { resolveCronSession } from "../../upstream/src/cron/isolated-agent/session.js";
import { formatErrorMessage, hasErrnoCode } from "../../upstream/src/infra/errors.js";
import { isWithinActiveHours } from "../../upstream/src/infra/heartbeat-active-hours.js";
import {
  buildExecEventPrompt,
  buildCronEventPrompt,
  isCronSystemEvent,
  isExecCompletionEvent,
} from "../../upstream/src/infra/heartbeat-events-filter.js";
import {
  emitHeartbeatEvent,
  resolveIndicatorType,
} from "../../upstream/src/infra/heartbeat-events.js";
import { resolveHeartbeatReasonKind } from "../../upstream/src/infra/heartbeat-reason.js";
import { resolveHeartbeatVisibility } from "../../upstream/src/infra/heartbeat-visibility.js";
import {
  areHeartbeatsEnabled,
  type HeartbeatRunResult,
  type HeartbeatWakeHandler,
  requestHeartbeatNow,
  setHeartbeatsEnabled,
  setHeartbeatWakeHandler,
} from "../../upstream/src/infra/heartbeat-wake.js";
import { buildOutboundSessionContext } from "../../upstream/src/infra/outbound/session-context.js";
import { peekSystemEventEntries } from "../../upstream/src/infra/system-events.js";
import { createSubsystemLogger } from "../../upstream/src/logging/subsystem.js";
import { getQueueSize, resetAllLanes } from "../../upstream/src/process/command-queue.js";
import { defaultRuntime, type RuntimeEnv } from "../../upstream/src/runtime.js";
import { escapeRegExp } from "../../upstream/src/utils.js";
import {
  listAgentIds,
  resolveAgentConfig,
  resolveAgentExplicitModelPrimary,
  resolveAgentModelAccounts,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import { getReplyFromConfig } from "../auto-reply/reply/get-reply.js";
import {
  normalizeAgentId,
  parseAgentSessionKey,
  toAgentStoreSessionKey,
} from "../routing/session-key.js";
import { compactHeartbeatFileIfNeeded } from "./heartbeat-bootstrap-compact.js";
import type { OutboundSendDeps } from "./outbound/deliver.js";
import { deliverOutboundPayloads } from "./outbound/deliver.js";
import {
  resolveHeartbeatDeliveryTarget,
  resolveHeartbeatSenderContext,
} from "./outbound/targets.js";

export type HeartbeatDeps = OutboundSendDeps &
  ChannelHeartbeatDeps & {
    runtime?: RuntimeEnv;
    getQueueSize?: (lane?: string) => number;
    nowMs?: () => number;
  };

const log = createSubsystemLogger("gateway/heartbeat");

export { areHeartbeatsEnabled, setHeartbeatsEnabled };

// Track when each session lane first entered in-flight state.
// Used to auto-reset stale lanes that have been in-flight too long.
const laneInFlightSince = new Map<string, number>();
// Auto-reset stale in-flight lanes after 5 minutes of continuous blocking.
const STALE_LANE_RESET_THRESHOLD_MS = 5 * 60 * 1000;

type HeartbeatConfig = AgentDefaultsConfig["heartbeat"];
type HeartbeatAgent = {
  agentId: string;
  heartbeat?: HeartbeatConfig;
};

export type HeartbeatSummary = {
  enabled: boolean;
  every: string;
  everyMs: number | null;
  prompt: string;
  target: string;
  model?: string;
  ackMaxChars: number;
};

const DEFAULT_HEARTBEAT_TARGET = "none";
export { isCronSystemEvent };

type HeartbeatAgentState = {
  agentId: string;
  heartbeat?: HeartbeatConfig;
  intervalMs: number;
  lastRunMs?: number;
  nextDueMs: number;
};

export type HeartbeatRunner = {
  stop: () => void;
  updateConfig: (cfg: OpenClawConfig) => void;
};

function hasExplicitHeartbeatAgents(cfg: OpenClawConfig) {
  const list = cfg.agents?.list ?? [];
  return list.some((entry) => Boolean(entry?.heartbeat));
}

export function isHeartbeatEnabledForAgent(cfg: OpenClawConfig, agentId?: string): boolean {
  const resolvedAgentId = normalizeAgentId(agentId ?? resolveDefaultAgentId(cfg));
  const list = cfg.agents?.list ?? [];
  const hasExplicit = hasExplicitHeartbeatAgents(cfg);
  if (hasExplicit) {
    return list.some(
      (entry) => Boolean(entry?.heartbeat) && normalizeAgentId(entry?.id) === resolvedAgentId,
    );
  }
  // fallback 模式：所有已注册的 agent 都视为 enabled（继承 defaults.heartbeat）
  const allAgentIds = listAgentIds(cfg);
  return allAgentIds.includes(resolvedAgentId);
}

function resolveHeartbeatConfig(
  cfg: OpenClawConfig,
  agentId?: string,
): HeartbeatConfig | undefined {
  const defaults = cfg.agents?.defaults?.heartbeat;
  if (!agentId) {
    return defaults;
  }
  const overrides = resolveAgentConfig(cfg, agentId)?.heartbeat;
  if (!defaults && !overrides) {
    return overrides;
  }
  return { ...defaults, ...overrides };
}

export function resolveHeartbeatSummaryForAgent(
  cfg: OpenClawConfig,
  agentId?: string,
): HeartbeatSummary {
  const defaults = cfg.agents?.defaults?.heartbeat;
  const overrides = agentId ? resolveAgentConfig(cfg, agentId)?.heartbeat : undefined;
  const enabled = isHeartbeatEnabledForAgent(cfg, agentId);

  if (!enabled) {
    return {
      enabled: false,
      every: "disabled",
      everyMs: null,
      prompt: resolveHeartbeatPromptText(defaults?.prompt),
      target: defaults?.target ?? DEFAULT_HEARTBEAT_TARGET,
      model: defaults?.model,
      ackMaxChars: Math.max(0, defaults?.ackMaxChars ?? DEFAULT_HEARTBEAT_ACK_MAX_CHARS),
    };
  }

  const merged = defaults || overrides ? { ...defaults, ...overrides } : undefined;
  const every = merged?.every ?? defaults?.every ?? overrides?.every ?? DEFAULT_HEARTBEAT_EVERY;
  const everyMs = resolveHeartbeatIntervalMs(cfg, undefined, merged);
  const prompt = resolveHeartbeatPromptText(
    merged?.prompt ?? defaults?.prompt ?? overrides?.prompt,
  );
  const target =
    merged?.target ?? defaults?.target ?? overrides?.target ?? DEFAULT_HEARTBEAT_TARGET;
  const model = merged?.model ?? defaults?.model ?? overrides?.model;
  const ackMaxChars = Math.max(
    0,
    merged?.ackMaxChars ??
      defaults?.ackMaxChars ??
      overrides?.ackMaxChars ??
      DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  );

  return {
    enabled: true,
    every,
    everyMs,
    prompt,
    target,
    model,
    ackMaxChars,
  };
}

function resolveHeartbeatAgents(cfg: OpenClawConfig): HeartbeatAgent[] {
  const list = cfg.agents?.list ?? [];
  if (hasExplicitHeartbeatAgents(cfg)) {
    return list
      .filter((entry) => entry?.heartbeat)
      .map((entry) => {
        const id = normalizeAgentId(entry.id);
        return { agentId: id, heartbeat: resolveHeartbeatConfig(cfg, id) };
      })
      .filter((entry) => entry.agentId);
  }
  // fallback 模式：将所有 agent 加入调度，继承 defaults.heartbeat 配置
  const allIds = listAgentIds(cfg);
  return allIds.map((id) => ({ agentId: id, heartbeat: resolveHeartbeatConfig(cfg, id) }));
}

export function resolveHeartbeatIntervalMs(
  cfg: OpenClawConfig,
  overrideEvery?: string,
  heartbeat?: HeartbeatConfig,
) {
  const raw =
    overrideEvery ??
    heartbeat?.every ??
    cfg.agents?.defaults?.heartbeat?.every ??
    DEFAULT_HEARTBEAT_EVERY;
  if (!raw) {
    return null;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return null;
  }
  let ms: number;
  try {
    ms = parseDurationMs(trimmed, { defaultUnit: "m" });
  } catch {
    return null;
  }
  if (ms <= 0) {
    return null;
  }
  return ms;
}

export function resolveHeartbeatPrompt(cfg: OpenClawConfig, heartbeat?: HeartbeatConfig) {
  return resolveHeartbeatPromptText(heartbeat?.prompt ?? cfg.agents?.defaults?.heartbeat?.prompt);
}

function resolveHeartbeatAckMaxChars(cfg: OpenClawConfig, heartbeat?: HeartbeatConfig) {
  return Math.max(
    0,
    heartbeat?.ackMaxChars ??
      cfg.agents?.defaults?.heartbeat?.ackMaxChars ??
      DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  );
}

function resolveHeartbeatSession(
  cfg: OpenClawConfig,
  agentId?: string,
  heartbeat?: HeartbeatConfig,
  forcedSessionKey?: string,
) {
  const sessionCfg = cfg.session;
  const scope = sessionCfg?.scope ?? "per-sender";
  const resolvedAgentId = normalizeAgentId(agentId ?? resolveDefaultAgentId(cfg));
  const mainSessionKey =
    scope === "global" ? "global" : resolveAgentMainSessionKey({ cfg, agentId: resolvedAgentId });
  const storeAgentId = scope === "global" ? resolveDefaultAgentId(cfg) : resolvedAgentId;
  const storePath = resolveStorePath(sessionCfg?.store, {
    agentId: storeAgentId,
  });
  const store = loadSessionStore(storePath);
  const mainEntry = store[mainSessionKey];

  if (scope === "global") {
    return { sessionKey: mainSessionKey, storePath, store, entry: mainEntry };
  }

  const forced = forcedSessionKey?.trim();
  if (forced) {
    const forcedCandidate = toAgentStoreSessionKey({
      agentId: resolvedAgentId,
      requestKey: forced,
      mainKey: cfg.session?.mainKey,
    });
    const forcedCanonical = canonicalizeMainSessionAlias({
      cfg,
      agentId: resolvedAgentId,
      sessionKey: forcedCandidate,
    });
    if (forcedCanonical !== "global") {
      const sessionAgentId = resolveAgentIdFromSessionKey(forcedCanonical);
      if (sessionAgentId === normalizeAgentId(resolvedAgentId)) {
        return {
          sessionKey: forcedCanonical,
          storePath,
          store,
          entry: store[forcedCanonical],
        };
      }
    }
  }

  const trimmed = heartbeat?.session?.trim() ?? "";
  if (!trimmed) {
    return { sessionKey: mainSessionKey, storePath, store, entry: mainEntry };
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === "main" || normalized === "global") {
    return { sessionKey: mainSessionKey, storePath, store, entry: mainEntry };
  }

  const candidate = toAgentStoreSessionKey({
    agentId: resolvedAgentId,
    requestKey: trimmed,
    mainKey: cfg.session?.mainKey,
  });
  const canonical = canonicalizeMainSessionAlias({
    cfg,
    agentId: resolvedAgentId,
    sessionKey: candidate,
  });
  if (canonical !== "global") {
    const sessionAgentId = resolveAgentIdFromSessionKey(canonical);
    if (sessionAgentId === normalizeAgentId(resolvedAgentId)) {
      return {
        sessionKey: canonical,
        storePath,
        store,
        entry: store[canonical],
      };
    }
  }

  return { sessionKey: mainSessionKey, storePath, store, entry: mainEntry };
}

function resolveHeartbeatReasoningPayloads(
  replyResult: ReplyPayload | ReplyPayload[] | undefined,
): ReplyPayload[] {
  const payloads = Array.isArray(replyResult) ? replyResult : replyResult ? [replyResult] : [];
  return payloads.filter((payload) => {
    const text = typeof payload.text === "string" ? payload.text : "";
    return text.trimStart().startsWith("Reasoning:");
  });
}

async function restoreHeartbeatUpdatedAt(params: {
  storePath: string;
  sessionKey: string;
  updatedAt?: number;
}) {
  const { storePath, sessionKey, updatedAt } = params;
  if (typeof updatedAt !== "number") {
    return;
  }
  const store = loadSessionStore(storePath);
  const entry = store[sessionKey];
  if (!entry) {
    return;
  }
  const nextUpdatedAt = Math.max(entry.updatedAt ?? 0, updatedAt);
  if (entry.updatedAt === nextUpdatedAt) {
    return;
  }
  await updateSessionStore(storePath, (nextStore) => {
    const nextEntry = nextStore[sessionKey] ?? entry;
    if (!nextEntry) {
      return;
    }
    const resolvedUpdatedAt = Math.max(nextEntry.updatedAt ?? 0, updatedAt);
    if (nextEntry.updatedAt === resolvedUpdatedAt) {
      return;
    }
    nextStore[sessionKey] = { ...nextEntry, updatedAt: resolvedUpdatedAt };
  });
}

/**
 * Prune heartbeat transcript entries by truncating the file back to a previous size.
 * This removes the user+assistant turns that were written during a HEARTBEAT_OK run,
 * preventing context pollution from zero-information exchanges.
 */
async function pruneHeartbeatTranscript(params: {
  transcriptPath?: string;
  preHeartbeatSize?: number;
}) {
  const { transcriptPath, preHeartbeatSize } = params;
  if (!transcriptPath || typeof preHeartbeatSize !== "number" || preHeartbeatSize < 0) {
    return;
  }
  try {
    const stat = await fs.stat(transcriptPath);
    // Only truncate if the file has grown during the heartbeat run
    if (stat.size > preHeartbeatSize) {
      await fs.truncate(transcriptPath, preHeartbeatSize);
    }
  } catch {
    // File may not exist or may have been removed - ignore errors
  }
}

/**
 * Get the transcript file path and its current size before a heartbeat run.
 * Returns undefined values if the session or transcript doesn't exist yet.
 */
async function captureTranscriptState(params: {
  storePath: string;
  sessionKey: string;
  agentId?: string;
}): Promise<{ transcriptPath?: string; preHeartbeatSize?: number }> {
  const { storePath, sessionKey, agentId } = params;
  try {
    const store = loadSessionStore(storePath);
    const entry = store[sessionKey];
    if (!entry?.sessionId) {
      return {};
    }
    const transcriptPath = resolveSessionFilePath(entry.sessionId, entry, {
      agentId,
      sessionsDir: path.dirname(storePath),
    });
    const stat = await fs.stat(transcriptPath);
    return { transcriptPath, preHeartbeatSize: stat.size };
  } catch {
    // Session or transcript doesn't exist yet - nothing to prune
    return {};
  }
}

function stripLeadingHeartbeatResponsePrefix(
  text: string,
  responsePrefix: string | undefined,
): string {
  const normalizedPrefix = responsePrefix?.trim();
  if (!normalizedPrefix) {
    return text;
  }

  // Require a boundary after the configured prefix so short prefixes like "Hi"
  // do not strip the beginning of normal words like "History".
  const prefixPattern = new RegExp(
    `^${escapeRegExp(normalizedPrefix)}(?=$|\\s|[\\p{P}\\p{S}])\\s*`,
    "iu",
  );
  return text.replace(prefixPattern, "");
}

function normalizeHeartbeatReply(
  payload: ReplyPayload,
  responsePrefix: string | undefined,
  ackMaxChars: number,
) {
  const rawText = typeof payload.text === "string" ? payload.text : "";
  const textForStrip = stripLeadingHeartbeatResponsePrefix(rawText, responsePrefix);
  const stripped = stripHeartbeatToken(textForStrip, {
    mode: "heartbeat",
    maxAckChars: ackMaxChars,
  });
  const hasMedia = Boolean(payload.mediaUrl || (payload.mediaUrls?.length ?? 0) > 0);
  if (stripped.shouldSkip && !hasMedia) {
    return {
      shouldSkip: true,
      text: "",
      hasMedia,
    };
  }
  let finalText = stripped.text;
  if (responsePrefix && finalText && !finalText.startsWith(responsePrefix)) {
    finalText = `${responsePrefix} ${finalText}`;
  }
  return { shouldSkip: false, text: finalText, hasMedia };
}

type HeartbeatReasonFlags = {
  isExecEventReason: boolean;
  isCronEventReason: boolean;
  isWakeReason: boolean;
};

type HeartbeatSkipReason = "empty-heartbeat-file";

type HeartbeatPreflight = HeartbeatReasonFlags & {
  session: ReturnType<typeof resolveHeartbeatSession>;
  pendingEventEntries: ReturnType<typeof peekSystemEventEntries>;
  hasTaggedCronEvents: boolean;
  shouldInspectPendingEvents: boolean;
  skipReason?: HeartbeatSkipReason;
};

function resolveHeartbeatReasonFlags(reason?: string): HeartbeatReasonFlags {
  const reasonKind = resolveHeartbeatReasonKind(reason);
  return {
    isExecEventReason: reasonKind === "exec-event",
    isCronEventReason: reasonKind === "cron",
    isWakeReason: reasonKind === "wake" || reasonKind === "hook",
  };
}

async function resolveHeartbeatPreflight(params: {
  cfg: OpenClawConfig;
  agentId: string;
  heartbeat?: HeartbeatConfig;
  forcedSessionKey?: string;
  reason?: string;
}): Promise<HeartbeatPreflight> {
  const reasonFlags = resolveHeartbeatReasonFlags(params.reason);
  const session = resolveHeartbeatSession(
    params.cfg,
    params.agentId,
    params.heartbeat,
    params.forcedSessionKey,
  );
  const pendingEventEntries = peekSystemEventEntries(session.sessionKey);
  const hasTaggedCronEvents = pendingEventEntries.some((event) =>
    event.contextKey?.startsWith("cron:"),
  );
  const shouldInspectPendingEvents =
    reasonFlags.isExecEventReason || reasonFlags.isCronEventReason || hasTaggedCronEvents;
  const shouldBypassFileGates =
    reasonFlags.isExecEventReason ||
    reasonFlags.isCronEventReason ||
    reasonFlags.isWakeReason ||
    hasTaggedCronEvents;
  const basePreflight = {
    ...reasonFlags,
    session,
    pendingEventEntries,
    hasTaggedCronEvents,
    shouldInspectPendingEvents,
  } satisfies Omit<HeartbeatPreflight, "skipReason">;

  if (shouldBypassFileGates) {
    return basePreflight;
  }

  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
  const heartbeatFilePath = path.join(workspaceDir, DEFAULT_HEARTBEAT_FILENAME);
  try {
    const heartbeatFileContent = await fs.readFile(heartbeatFilePath, "utf-8");
    if (isHeartbeatContentEffectivelyEmpty(heartbeatFileContent)) {
      return {
        ...basePreflight,
        skipReason: "empty-heartbeat-file",
      };
    }
  } catch (err: unknown) {
    if (hasErrnoCode(err, "ENOENT")) {
      // Missing HEARTBEAT.md is intentional in some setups (for example, when
      // heartbeat instructions live outside the file), so keep the run active.
      // The heartbeat prompt already says "if it exists".
      return basePreflight;
    }
    // For other read errors, proceed with heartbeat as before.
  }

  return basePreflight;
}

type HeartbeatPromptResolution = {
  prompt: string;
  hasExecCompletion: boolean;
  hasCronEvents: boolean;
};

function appendHeartbeatWorkspacePathHint(prompt: string, workspaceDir: string): string {
  if (!/heartbeat\.md/i.test(prompt)) {
    return prompt;
  }
  const heartbeatFilePath = path.join(workspaceDir, DEFAULT_HEARTBEAT_FILENAME).replace(/\\/g, "/");
  const hint = `When reading HEARTBEAT.md, use workspace file ${heartbeatFilePath} (exact case). Do not read docs/heartbeat.md.`;
  if (prompt.includes(hint)) {
    return prompt;
  }
  return `${prompt}\n${hint}`;
}

function resolveHeartbeatRunPrompt(params: {
  cfg: OpenClawConfig;
  heartbeat?: HeartbeatConfig;
  preflight: HeartbeatPreflight;
  canRelayToUser: boolean;
  workspaceDir: string;
}): HeartbeatPromptResolution {
  const pendingEventEntries = params.preflight.pendingEventEntries;
  const pendingEvents = params.preflight.shouldInspectPendingEvents
    ? pendingEventEntries.map((event) => event.text)
    : [];

  // 任务驱动事件： contextKey 以 cron:task-wake: 或 cron:task-next: 开头
  const taskDrivenEntries = pendingEventEntries.filter(
    (event) =>
      event.contextKey?.startsWith("cron:task-wake:") ||
      event.contextKey?.startsWith("cron:task-next:"),
  );
  const hasTaskDrivenEvents = taskDrivenEntries.length > 0;

  // 一般 cron 事件（排除任务驱动）
  const cronEvents = pendingEventEntries
    .filter(
      (event) =>
        !event.contextKey?.startsWith("cron:task-wake:") &&
        !event.contextKey?.startsWith("cron:task-next:") &&
        (params.preflight.isCronEventReason || event.contextKey?.startsWith("cron:")) &&
        isCronSystemEvent(event.text),
    )
    .map((event) => event.text);
  const hasExecCompletion = pendingEvents.some(isExecCompletionEvent);
  const hasCronEvents = cronEvents.length > 0;

  let basePrompt: string;

  if (hasTaskDrivenEvents) {
    // 任务驱动路径：使用专用的执行导向 prompt，而不是通用 reminder 框架
    const taskEventText = taskDrivenEntries
      .map((e) => e.text)
      .join("\n\n")
      .trim();
    basePrompt =
      "You have been woken up to execute tasks. The task details are:\n\n" +
      taskEventText +
      "\n\nPlease execute these tasks now using your available tools. " +
      "Call the relevant tools to complete the work described above. " +
      "When all tasks are done, call task_report_to_supervisor to report completion. " +
      "Do NOT just acknowledge the tasks — actually execute them.";
  } else if (hasExecCompletion) {
    basePrompt = buildExecEventPrompt({ deliverToUser: params.canRelayToUser });
  } else if (hasCronEvents) {
    basePrompt = buildCronEventPrompt(cronEvents, { deliverToUser: params.canRelayToUser });
  } else {
    basePrompt = resolveHeartbeatPrompt(params.cfg, params.heartbeat);
  }

  // 当没有投递目标（canRelayToUser=false）且走默认 prompt 路径（非 exec/cron/task event）时，
  // 明确告知 LLM 不需要生成面向用户的汇报文字，避免无效 token 消耗。
  if (!params.canRelayToUser && !hasExecCompletion && !hasCronEvents && !hasTaskDrivenEvents) {
    basePrompt =
      basePrompt +
      "\n\nIMPORTANT: There is no active user channel to deliver a response to right now. " +
      "Execute any necessary tool calls to complete your tasks, but do NOT generate a status report or summary message. " +
      "When your tool work is done (or if nothing needs to be done), reply only with HEARTBEAT_OK.";
  }

  const prompt = appendHeartbeatWorkspacePathHint(basePrompt, params.workspaceDir);

  return { prompt, hasExecCompletion, hasCronEvents };
}

export async function runHeartbeatOnce(opts: {
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  heartbeat?: HeartbeatConfig;
  reason?: string;
  deps?: HeartbeatDeps;
}): Promise<HeartbeatRunResult> {
  const cfg = opts.cfg ?? loadConfig();
  const explicitAgentId = typeof opts.agentId === "string" ? opts.agentId.trim() : "";
  const forcedSessionAgentId =
    explicitAgentId.length > 0 ? undefined : parseAgentSessionKey(opts.sessionKey)?.agentId;
  const agentId = normalizeAgentId(
    explicitAgentId || forcedSessionAgentId || resolveDefaultAgentId(cfg),
  );
  const heartbeat = opts.heartbeat ?? resolveHeartbeatConfig(cfg, agentId);
  if (!areHeartbeatsEnabled()) {
    return { status: "skipped", reason: "disabled" };
  }
  if (!isHeartbeatEnabledForAgent(cfg, agentId)) {
    return { status: "skipped", reason: "disabled" };
  }
  if (!resolveHeartbeatIntervalMs(cfg, undefined, heartbeat)) {
    return { status: "skipped", reason: "disabled" };
  }

  // ============ 本地增强：模型账号检查 ============
  // 每个 agent 的心跳使用自己配置的模型账号。
  // 如果该 agent 没有配置 modelAccounts，则：
  //   - 系统任务驱动（pending-tasks / cron-event）：回退到主控 agent 的模型配置，继续运行
  //   - 普通定时心跳：直接跳过，不触发模型调用
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const isDefaultAgent = agentId === defaultAgentId;
  if (!isDefaultAgent) {
    const agentModelAccounts = resolveAgentModelAccounts(cfg, agentId);
    // 兼容两种配置方式：新的 modelAccounts.accounts 或旧的 model.primary
    const hasModelConfig =
      (agentModelAccounts?.accounts && agentModelAccounts.accounts.length > 0) ||
      !!resolveAgentExplicitModelPrimary(cfg, agentId);
    if (!hasModelConfig) {
      const reason = opts.reason ?? "";
      const isTaskDriven =
        reason.startsWith("pending-tasks") ||
        reason === "cron-event" ||
        reason === "exec-event" ||
        reason.startsWith("cron:"); // cron: 前缀包括任务分配唤醒（cron:task-assign:xxx）
      if (!isTaskDriven) {
        // 普通心跳：该 agent 未配置模型，跳过
        log.info(`heartbeat: skipped for agent "${agentId}" — no model accounts configured`, {
          agentId,
          reason: "no-model-config",
        });
        return { status: "skipped", reason: "disabled" };
      }
      // 系统任务驱动：回退到主控 agent 的模型配置（修改 cfg 上下文，让后续路由使用主控模型）
      log.info(
        `heartbeat: agent "${agentId}" has no model config, using default agent "${defaultAgentId}" model for task-driven run`,
        { agentId, defaultAgentId, reason },
      );
    }
  }
  // ============ 本地增强结束 ============

  const startedAt = opts.deps?.nowMs?.() ?? Date.now();
  if (!isWithinActiveHours(cfg, heartbeat, startedAt)) {
    return { status: "skipped", reason: "quiet-hours" };
  }

  // 检查该 agent 自身 session lane 是否有请求在跑（而不是全局 main lane）
  // main lane 只用于用户直接发来的消息，不代表该 agent 是否空闲
  const agentMainSessionKey = resolveAgentMainSessionKey({ cfg, agentId: agentId });
  const agentSessionLane = resolveEmbeddedSessionLane(agentMainSessionKey);
  const queueSize = (opts.deps?.getQueueSize ?? getQueueSize)(agentSessionLane);
  if (queueSize > 0) {
    const now = opts.deps?.nowMs?.() ?? Date.now();
    const since = laneInFlightSince.get(agentSessionLane);
    if (since === undefined) {
      laneInFlightSince.set(agentSessionLane, now);
    } else if (now - since >= STALE_LANE_RESET_THRESHOLD_MS) {
      // Lane has been in-flight for too long — likely a stale taskId after a failed run.
      // Reset all lanes so queued work can drain.
      log.warn(
        `heartbeat: agent "${agentId}" session lane stale (${Math.round((now - since) / 1000)}s) — resetting`,
        { agentId },
      );
      laneInFlightSince.delete(agentSessionLane);
      resetAllLanes();
      // After reset the lane is now idle — fall through to run heartbeat.
    } else {
      return { status: "skipped", reason: "requests-in-flight" };
    }
  } else {
    // Lane is idle — clear any stale tracking entry.
    laneInFlightSince.delete(agentSessionLane);
  }

  // Preflight centralizes trigger classification, event inspection, and HEARTBEAT.md gating.
  const preflight = await resolveHeartbeatPreflight({
    cfg,
    agentId,
    heartbeat,
    forcedSessionKey: opts.sessionKey,
    reason: opts.reason,
  });
  if (preflight.skipReason) {
    emitHeartbeatEvent({
      status: "skipped",
      reason: preflight.skipReason,
      durationMs: Date.now() - startedAt,
    });
    return { status: "skipped", reason: preflight.skipReason };
  }
  const { entry, sessionKey, storePath } = preflight.session;
  const previousUpdatedAt = entry?.updatedAt;

  // When isolatedSession is enabled, create a fresh session via the same
  // pattern as cron sessionTarget: "isolated". This gives the heartbeat
  // a new session ID (empty transcript) each run, avoiding the cost of
  // sending the full conversation history (~100K tokens) to the LLM.
  // Delivery routing still uses the main session entry (lastChannel, lastTo).
  const useIsolatedSession = heartbeat?.isolatedSession === true;
  let runSessionKey = sessionKey;
  let runStorePath = storePath;
  if (useIsolatedSession) {
    const isolatedKey = `${sessionKey}:heartbeat`;
    const cronSession = resolveCronSession({
      cfg,
      sessionKey: isolatedKey,
      agentId,
      nowMs: startedAt,
      forceNew: true,
    });
    cronSession.store[isolatedKey] = cronSession.sessionEntry;
    await saveSessionStore(cronSession.storePath, cronSession.store);
    runSessionKey = isolatedKey;
    runStorePath = cronSession.storePath;
  }

  const delivery = resolveHeartbeatDeliveryTarget({ cfg, entry, heartbeat });
  const heartbeatAccountId = heartbeat?.accountId?.trim();
  if (delivery.reason === "unknown-account") {
    log.warn("heartbeat: unknown accountId", {
      accountId: delivery.accountId ?? heartbeatAccountId ?? null,
      target: heartbeat?.target ?? "none",
    });
  } else if (heartbeatAccountId) {
    log.info("heartbeat: using explicit accountId", {
      accountId: delivery.accountId ?? heartbeatAccountId,
      target: heartbeat?.target ?? "none",
      channel: delivery.channel,
    });
  }
  const visibility =
    delivery.channel !== "none"
      ? resolveHeartbeatVisibility({
          cfg,
          channel: delivery.channel,
          accountId: delivery.accountId,
        })
      : { showOk: false, showAlerts: true, useIndicator: true };
  const { sender } = resolveHeartbeatSenderContext({ cfg, entry, delivery });
  const responsePrefix = resolveEffectiveMessagesConfig(cfg, agentId, {
    channel: delivery.channel !== "none" ? delivery.channel : undefined,
    accountId: delivery.accountId,
  }).responsePrefix;

  const canRelayToUser = Boolean(
    delivery.channel !== "none" && delivery.to && visibility.showAlerts,
  );
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const { prompt, hasExecCompletion, hasCronEvents } = resolveHeartbeatRunPrompt({
    cfg,
    heartbeat,
    preflight,
    canRelayToUser,
    workspaceDir,
  });
  const ctx = {
    Body: appendCronStyleCurrentTimeLine(prompt, cfg, startedAt),
    From: sender,
    To: sender,
    OriginatingChannel: delivery.channel !== "none" ? delivery.channel : undefined,
    OriginatingTo: delivery.to,
    AccountId: delivery.accountId,
    MessageThreadId: delivery.threadId,
    Provider: hasExecCompletion ? "exec-event" : hasCronEvents ? "cron-event" : "heartbeat",
    SessionKey: runSessionKey,
  };
  if (!visibility.showAlerts && !visibility.showOk && !visibility.useIndicator) {
    emitHeartbeatEvent({
      status: "skipped",
      reason: "alerts-disabled",
      durationMs: Date.now() - startedAt,
      channel: delivery.channel !== "none" ? delivery.channel : undefined,
      accountId: delivery.accountId,
    });
    return { status: "skipped", reason: "alerts-disabled" };
  }

  const heartbeatOkText = responsePrefix ? `${responsePrefix} ${HEARTBEAT_TOKEN}` : HEARTBEAT_TOKEN;
  const outboundSession = buildOutboundSessionContext({
    cfg,
    agentId,
    sessionKey,
  });
  const canAttemptHeartbeatOk = Boolean(
    visibility.showOk && delivery.channel !== "none" && delivery.to,
  );
  const maybeSendHeartbeatOk = async () => {
    if (!canAttemptHeartbeatOk || delivery.channel === "none" || !delivery.to) {
      return false;
    }
    const heartbeatPlugin = getChannelPlugin(delivery.channel);
    if (heartbeatPlugin?.heartbeat?.checkReady) {
      const readiness = await heartbeatPlugin.heartbeat.checkReady({
        cfg,
        accountId: delivery.accountId,
        deps: opts.deps,
      });
      if (!readiness.ok) {
        return false;
      }
    }
    await deliverOutboundPayloads({
      cfg,
      channel: delivery.channel,
      to: delivery.to,
      accountId: delivery.accountId,
      threadId: delivery.threadId,
      payloads: [{ text: heartbeatOkText }],
      session: outboundSession,
      deps: opts.deps,
    });
    return true;
  };

  try {
    // Capture transcript state before the heartbeat run so we can prune if HEARTBEAT_OK.
    // For isolated sessions, capture the isolated transcript (not the main session's).
    const transcriptState = await captureTranscriptState({
      storePath: runStorePath,
      sessionKey: runSessionKey,
      agentId,
    });

    const heartbeatModelOverride = heartbeat?.model?.trim() || undefined;
    const suppressToolErrorWarnings = heartbeat?.suppressToolErrorWarnings === true;
    const bootstrapContextMode: "lightweight" | undefined =
      heartbeat?.lightContext === true ? "lightweight" : undefined;
    const replyOpts = heartbeatModelOverride
      ? {
          isHeartbeat: true,
          heartbeatModelOverride,
          suppressToolErrorWarnings,
          bootstrapContextMode,
        }
      : { isHeartbeat: true, suppressToolErrorWarnings, bootstrapContextMode };
    const replyResult = await getReplyFromConfig(ctx, replyOpts, cfg);

    // ── 心跳结束后压缩 HEARTBEAT.md（滚动摘要，控制文件大小）────────
    // 在 LLM 已读取并处理完 HEARTBEAT.md 内容之后执行压缩，不影响本次回复。
    void compactHeartbeatFileIfNeeded(workspaceDir);
    // ─────────────────────────────────────────────────────────────────

    const replyPayload = resolveHeartbeatReplyPayload(replyResult);
    const includeReasoning = heartbeat?.includeReasoning === true;
    const reasoningPayloads = includeReasoning
      ? resolveHeartbeatReasoningPayloads(replyResult).filter((payload) => payload !== replyPayload)
      : [];
    if (
      !replyPayload ||
      (!replyPayload.text && !replyPayload.mediaUrl && !replyPayload.mediaUrls?.length)
    ) {
      await restoreHeartbeatUpdatedAt({
        storePath,
        sessionKey,
        updatedAt: previousUpdatedAt,
      });
      // Prune the transcript to remove HEARTBEAT_OK turns
      await pruneHeartbeatTranscript(transcriptState);
      const okSent = await maybeSendHeartbeatOk();
      emitHeartbeatEvent({
        status: "ok-empty",
        reason: opts.reason,
        durationMs: Date.now() - startedAt,
        channel: delivery.channel !== "none" ? delivery.channel : undefined,
        accountId: delivery.accountId,
        silent: !okSent,
        indicatorType: visibility.useIndicator ? resolveIndicatorType("ok-empty") : undefined,
      });
      return { status: "ran", durationMs: Date.now() - startedAt };
    }

    const ackMaxChars = resolveHeartbeatAckMaxChars(cfg, heartbeat);
    const normalized = normalizeHeartbeatReply(replyPayload, responsePrefix, ackMaxChars);
    // For exec completion events, don't skip even if the response looks like HEARTBEAT_OK.
    // The model should be responding with exec results, not ack tokens.
    // Also, if normalized.text is empty due to token stripping but we have exec completion,
    // fall back to the original reply text.
    const execFallbackText =
      hasExecCompletion && !normalized.text.trim() && replyPayload.text?.trim()
        ? replyPayload.text.trim()
        : null;
    if (execFallbackText) {
      normalized.text = execFallbackText;
      normalized.shouldSkip = false;
    }
    const shouldSkipMain = normalized.shouldSkip && !normalized.hasMedia && !hasExecCompletion;
    if (shouldSkipMain && reasoningPayloads.length === 0) {
      await restoreHeartbeatUpdatedAt({
        storePath,
        sessionKey,
        updatedAt: previousUpdatedAt,
      });
      // Prune the transcript to remove HEARTBEAT_OK turns
      await pruneHeartbeatTranscript(transcriptState);
      const okSent = await maybeSendHeartbeatOk();
      emitHeartbeatEvent({
        status: "ok-token",
        reason: opts.reason,
        durationMs: Date.now() - startedAt,
        channel: delivery.channel !== "none" ? delivery.channel : undefined,
        accountId: delivery.accountId,
        silent: !okSent,
        indicatorType: visibility.useIndicator ? resolveIndicatorType("ok-token") : undefined,
      });
      return { status: "ran", durationMs: Date.now() - startedAt };
    }

    const mediaUrls =
      replyPayload.mediaUrls ?? (replyPayload.mediaUrl ? [replyPayload.mediaUrl] : []);

    // Suppress duplicate heartbeats (same payload) within a short window.
    // This prevents "nagging" when nothing changed but the model repeats the same items.
    const prevHeartbeatText =
      typeof entry?.lastHeartbeatText === "string" ? entry.lastHeartbeatText : "";
    const prevHeartbeatAt =
      typeof entry?.lastHeartbeatSentAt === "number" ? entry.lastHeartbeatSentAt : undefined;
    const isDuplicateMain =
      !shouldSkipMain &&
      !mediaUrls.length &&
      Boolean(prevHeartbeatText.trim()) &&
      normalized.text.trim() === prevHeartbeatText.trim() &&
      typeof prevHeartbeatAt === "number" &&
      startedAt - prevHeartbeatAt < 24 * 60 * 60 * 1000;

    if (isDuplicateMain) {
      await restoreHeartbeatUpdatedAt({
        storePath,
        sessionKey,
        updatedAt: previousUpdatedAt,
      });
      // Prune the transcript to remove duplicate heartbeat turns
      await pruneHeartbeatTranscript(transcriptState);
      emitHeartbeatEvent({
        status: "skipped",
        reason: "duplicate",
        preview: normalized.text.slice(0, 200),
        durationMs: Date.now() - startedAt,
        hasMedia: false,
        channel: delivery.channel !== "none" ? delivery.channel : undefined,
        accountId: delivery.accountId,
      });
      return { status: "ran", durationMs: Date.now() - startedAt };
    }

    // Reasoning payloads are text-only; any attachments stay on the main reply.
    const previewText = shouldSkipMain
      ? reasoningPayloads
          .map((payload) => payload.text)
          .filter((text): text is string => Boolean(text?.trim()))
          .join("\n")
      : normalized.text;

    if (delivery.channel === "none" || !delivery.to) {
      emitHeartbeatEvent({
        status: "skipped",
        reason: delivery.reason ?? "no-target",
        preview: previewText?.slice(0, 200),
        durationMs: Date.now() - startedAt,
        hasMedia: mediaUrls.length > 0,
        accountId: delivery.accountId,
      });
      return { status: "ran", durationMs: Date.now() - startedAt };
    }

    if (!visibility.showAlerts) {
      await restoreHeartbeatUpdatedAt({
        storePath,
        sessionKey,
        updatedAt: previousUpdatedAt,
      });
      emitHeartbeatEvent({
        status: "skipped",
        reason: "alerts-disabled",
        preview: previewText?.slice(0, 200),
        durationMs: Date.now() - startedAt,
        channel: delivery.channel,
        hasMedia: mediaUrls.length > 0,
        accountId: delivery.accountId,
        indicatorType: visibility.useIndicator ? resolveIndicatorType("sent") : undefined,
      });
      return { status: "ran", durationMs: Date.now() - startedAt };
    }

    const deliveryAccountId = delivery.accountId;
    const heartbeatPlugin = getChannelPlugin(delivery.channel);
    if (heartbeatPlugin?.heartbeat?.checkReady) {
      const readiness = await heartbeatPlugin.heartbeat.checkReady({
        cfg,
        accountId: deliveryAccountId,
        deps: opts.deps,
      });
      if (!readiness.ok) {
        emitHeartbeatEvent({
          status: "skipped",
          reason: readiness.reason,
          preview: previewText?.slice(0, 200),
          durationMs: Date.now() - startedAt,
          hasMedia: mediaUrls.length > 0,
          channel: delivery.channel,
          accountId: delivery.accountId,
        });
        log.info("heartbeat: channel not ready", {
          channel: delivery.channel,
          reason: readiness.reason,
        });
        return { status: "skipped", reason: readiness.reason };
      }
    }

    await deliverOutboundPayloads({
      cfg,
      channel: delivery.channel,
      to: delivery.to,
      accountId: deliveryAccountId,
      session: outboundSession,
      threadId: delivery.threadId,
      payloads: [
        ...reasoningPayloads,
        ...(shouldSkipMain
          ? []
          : [
              {
                text: normalized.text,
                mediaUrls,
              },
            ]),
      ],
      deps: opts.deps,
    });

    // Record last delivered heartbeat payload for dedupe.
    if (!shouldSkipMain && normalized.text.trim()) {
      const store = loadSessionStore(storePath);
      const current = store[sessionKey];
      if (current) {
        store[sessionKey] = {
          ...current,
          lastHeartbeatText: normalized.text,
          lastHeartbeatSentAt: startedAt,
        };
        await saveSessionStore(storePath, store);
      }
    }

    emitHeartbeatEvent({
      status: "sent",
      to: delivery.to,
      preview: previewText?.slice(0, 200),
      durationMs: Date.now() - startedAt,
      hasMedia: mediaUrls.length > 0,
      channel: delivery.channel,
      accountId: delivery.accountId,
      indicatorType: visibility.useIndicator ? resolveIndicatorType("sent") : undefined,
    });
    return { status: "ran", durationMs: Date.now() - startedAt };
  } catch (err) {
    const reason = formatErrorMessage(err);
    // DEBUG: print full stack to locate undefined.config
    if (err instanceof Error && err.stack) {
      log.error(`heartbeat failed stack: ${err.stack}`, { error: reason });
    }
    emitHeartbeatEvent({
      status: "failed",
      reason,
      durationMs: Date.now() - startedAt,
      channel: delivery.channel !== "none" ? delivery.channel : undefined,
      accountId: delivery.accountId,
      indicatorType: visibility.useIndicator ? resolveIndicatorType("failed") : undefined,
    });
    log.error(`heartbeat failed: ${reason}`, { error: reason });
    return { status: "failed", reason };
  }
}

export function startHeartbeatRunner(opts: {
  cfg?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  runOnce?: typeof runHeartbeatOnce;
}): HeartbeatRunner {
  const runtime = opts.runtime ?? defaultRuntime;
  const runOnce = opts.runOnce ?? runHeartbeatOnce;
  const state = {
    cfg: opts.cfg ?? loadConfig(),
    runtime,
    agents: new Map<string, HeartbeatAgentState>(),
    timer: null as NodeJS.Timeout | null,
    stopped: false,
  };
  let initialized = false;

  const resolveNextDue = (now: number, intervalMs: number, prevState?: HeartbeatAgentState) => {
    if (typeof prevState?.lastRunMs === "number") {
      return prevState.lastRunMs + intervalMs;
    }
    if (prevState && prevState.intervalMs === intervalMs && prevState.nextDueMs > now) {
      return prevState.nextDueMs;
    }
    return now + intervalMs;
  };

  const advanceAgentSchedule = (agent: HeartbeatAgentState, now: number) => {
    agent.lastRunMs = now;
    agent.nextDueMs = now + agent.intervalMs;
  };

  const scheduleNext = () => {
    if (state.stopped) {
      return;
    }
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.agents.size === 0) {
      return;
    }
    const now = Date.now();
    let nextDue = Number.POSITIVE_INFINITY;
    for (const agent of state.agents.values()) {
      if (agent.nextDueMs < nextDue) {
        nextDue = agent.nextDueMs;
      }
    }
    if (!Number.isFinite(nextDue)) {
      return;
    }
    const delay = Math.max(0, nextDue - now);
    state.timer = setTimeout(() => {
      state.timer = null;
      requestHeartbeatNow({ reason: "interval", coalesceMs: 0 });
    }, delay);
    state.timer.unref?.();
  };

  const updateConfig = (cfg: OpenClawConfig) => {
    if (state.stopped) {
      return;
    }
    const now = Date.now();
    const prevAgents = state.agents;
    const prevEnabled = prevAgents.size > 0;
    const nextAgents = new Map<string, HeartbeatAgentState>();
    const intervals: number[] = [];
    for (const agent of resolveHeartbeatAgents(cfg)) {
      const intervalMs = resolveHeartbeatIntervalMs(cfg, undefined, agent.heartbeat);
      if (!intervalMs) {
        continue;
      }
      intervals.push(intervalMs);
      const prevState = prevAgents.get(agent.agentId);
      const nextDueMs = resolveNextDue(now, intervalMs, prevState);
      nextAgents.set(agent.agentId, {
        agentId: agent.agentId,
        heartbeat: agent.heartbeat,
        intervalMs,
        lastRunMs: prevState?.lastRunMs,
        nextDueMs,
      });
    }

    state.cfg = cfg;
    state.agents = nextAgents;
    const nextEnabled = nextAgents.size > 0;
    if (!initialized) {
      if (!nextEnabled) {
        log.info("heartbeat: disabled", { enabled: false });
      } else {
        log.info("heartbeat: started", { intervalMs: Math.min(...intervals) });
      }
      initialized = true;
    } else if (prevEnabled !== nextEnabled) {
      if (!nextEnabled) {
        log.info("heartbeat: disabled", { enabled: false });
      } else {
        log.info("heartbeat: started", { intervalMs: Math.min(...intervals) });
      }
    }

    scheduleNext();
  };

  const run: HeartbeatWakeHandler = async (params) => {
    if (state.stopped) {
      return {
        status: "skipped",
        reason: "disabled",
      } satisfies HeartbeatRunResult;
    }
    if (!areHeartbeatsEnabled()) {
      return {
        status: "skipped",
        reason: "disabled",
      } satisfies HeartbeatRunResult;
    }
    if (state.agents.size === 0) {
      return {
        status: "skipped",
        reason: "disabled",
      } satisfies HeartbeatRunResult;
    }

    const reason = params?.reason;
    const requestedAgentId = params?.agentId ? normalizeAgentId(params.agentId) : undefined;
    const requestedSessionKey = params?.sessionKey?.trim() || undefined;
    const isInterval = reason === "interval";
    const startedAt = Date.now();
    const now = startedAt;
    let ran = false;

    if (requestedSessionKey || requestedAgentId) {
      const targetAgentId = requestedAgentId ?? resolveAgentIdFromSessionKey(requestedSessionKey);
      let targetAgent = state.agents.get(targetAgentId);
      if (!targetAgent) {
        // agent 未在 state.agents 中（可能是 fallback 模式下首次唤醒），
        // 动态构建 fallback 配置来运行，不直接 skip
        const fallbackHeartbeat = resolveHeartbeatConfig(state.cfg, targetAgentId);
        const intervalMs = resolveHeartbeatIntervalMs(state.cfg, undefined, fallbackHeartbeat);
        if (!intervalMs) {
          log.warn(
            `[Heartbeat] agent "${targetAgentId}" has no heartbeat interval, skipping wake`,
            { agentId: targetAgentId },
          );
          scheduleNext();
          return { status: "skipped", reason: "disabled" };
        }
        // 动态注册该 agent 到 state.agents
        targetAgent = {
          agentId: targetAgentId,
          heartbeat: fallbackHeartbeat,
          intervalMs,
          nextDueMs: now + intervalMs,
        };
        state.agents.set(targetAgentId, targetAgent);
        log.info(`[Heartbeat] dynamically registered agent "${targetAgentId}" for wake`, {
          agentId: targetAgentId,
          intervalMs,
        });
      }
      try {
        const res = await runOnce({
          cfg: state.cfg,
          agentId: targetAgent.agentId,
          heartbeat: targetAgent.heartbeat,
          reason,
          sessionKey: requestedSessionKey,
          deps: { runtime: state.runtime },
        });
        if (res.status !== "skipped" || res.reason !== "disabled") {
          advanceAgentSchedule(targetAgent, now);
        }
        scheduleNext();
        return res.status === "ran" ? { status: "ran", durationMs: Date.now() - startedAt } : res;
      } catch (err) {
        const errMsg = formatErrorMessage(err);
        log.error(`heartbeat runner: targeted runOnce threw unexpectedly: ${errMsg}`, {
          error: errMsg,
        });
        advanceAgentSchedule(targetAgent, now);
        scheduleNext();
        return { status: "failed", reason: errMsg };
      }
    }

    // ============ 本地增强：并发执行多 agent 心跳 ============
    // 1. 收集本轮需要运行的 agents（过滤未到时间的）
    const agentsToRun: HeartbeatAgentState[] = [];
    for (const agent of state.agents.values()) {
      if (isInterval && now < agent.nextDueMs) {
        continue;
      }
      agentsToRun.push(agent);
    }

    // 2. 并发执行所有 agent 的心跳，互不阻塞
    //    使用 Promise.allSettled 保证所有 agent 都有机会执行，
    //    即使某个 agent 的 runOnce 抛出或返回 requests-in-flight，其他 agent 不受影响。
    let anyInFlight = false;
    const results = await Promise.allSettled(
      agentsToRun.map(async (agent) => {
        let res: HeartbeatRunResult;
        try {
          res = await runOnce({
            cfg: state.cfg,
            agentId: agent.agentId,
            heartbeat: agent.heartbeat,
            reason,
            deps: { runtime: state.runtime },
          });
        } catch (err) {
          const errMsg = formatErrorMessage(err);
          log.error(`heartbeat runner: runOnce threw unexpectedly: ${errMsg}`, { error: errMsg });
          advanceAgentSchedule(agent, now);
          return { agentId: agent.agentId, res: { status: "failed" as const, reason: errMsg } };
        }
        if (res.status === "skipped" && res.reason === "requests-in-flight") {
          // 该 agent 正忙，不推进调度时间（让唤醒层在 1s 后重试），
          // 但不阻止其他 agent 的心跳执行。
          anyInFlight = true;
        } else {
          if (res.status !== "skipped" || res.reason !== "disabled") {
            advanceAgentSchedule(agent, now);
          }
          if (res.status === "ran") {
            ran = true;
          }
        }
        return { agentId: agent.agentId, res };
      }),
    );

    // 3. 若有 agent 仍 in-flight，唤醒层会在 1s 后重试，此处只需 scheduleNext
    //    不需要像之前一样 early return，避免影响整体调度节奏。
    if (anyInFlight && !ran) {
      // 还有 agent 在跑，1s 后唤醒层会重新触发；仅对已完成的 agent 安排下次定时
      scheduleNext();
      // 上报 requests-in-flight，让唤醒层维持 1s 重试节奏
      return { status: "skipped", reason: "requests-in-flight" };
    }
    // ============ 本地增强结束 ============

    // 抑制 results 未使用的 lint 警告
    void results;

    scheduleNext();
    if (ran) {
      return { status: "ran", durationMs: Date.now() - startedAt };
    }
    return { status: "skipped", reason: isInterval ? "not-due" : "disabled" };
  };

  const wakeHandler: HeartbeatWakeHandler = async (params) =>
    run({
      reason: params.reason,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    });
  const disposeWakeHandler = setHeartbeatWakeHandler(wakeHandler);
  updateConfig(state.cfg);

  const cleanup = () => {
    if (state.stopped) {
      return;
    }
    state.stopped = true;
    disposeWakeHandler();
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = null;
  };

  opts.abortSignal?.addEventListener("abort", cleanup, { once: true });

  return { stop: cleanup, updateConfig };
}
