import fs from "node:fs/promises";
import path from "node:path";
import { resolveContextTokensForModel } from "../../upstream/src/agents/context.js";
import { appendCronStyleCurrentTimeLine } from "../../upstream/src/agents/current-time.js";
import { DEFAULT_CONTEXT_TOKENS } from "../../upstream/src/agents/defaults.js";
import { resolveEffectiveMessagesConfig } from "../../upstream/src/agents/identity.js";
import { CHARS_PER_TOKEN_ESTIMATE } from "../../upstream/src/agents/pi-embedded-runner/tool-result-char-estimator.js";
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
import {
  enqueueSystemEvent,
  peekSystemEventEntries,
} from "../../upstream/src/infra/system-events.js";
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
import { isLikelyContextOverflowError } from "../agents/pi-embedded-helpers/errors.js";

/**
 * 检测错误消息是否为 API 限流（429 / rate limit / quota exceeded）错误。
 * 用于触发全局限流熔断器，暂停 Task Wake 调度器的无效重试。
 */
function isLikelyRateLimitError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("quota exceeded") ||
    lower.includes("too many requests") ||
    lower.includes("rate_limit")
  );
}
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
import { notifyGlobalRateLimit } from "../cron/agent-task-wake-scheduler.js";

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
  const trimmed = raw.trim();
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

  // 任务驱动事件： contextKey 以 cron:task-wake: / cron:task-next: / cron:task-resume: / cron:task-retry: 开头
  const taskDrivenEntries = pendingEventEntries.filter(
    (event) =>
      event.contextKey?.startsWith("cron:task-wake:") ||
      event.contextKey?.startsWith("cron:task-next:") ||
      event.contextKey?.startsWith("cron:task-resume:") ||
      event.contextKey?.startsWith("cron:task-retry:"),
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
      "If you encounter any problem or blocker that prevents you from completing the task, " +
      'immediately call task_report_to_supervisor with status="blocked" and describe the issue in errorMessage, ' +
      "so the supervisor can be notified and coordinate a solution. " +
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

  const delivery = resolveHeartbeatDeliveryTarget({ cfg, entry, heartbeat, agentId });
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
  const {
    prompt: rawPrompt,
    hasExecCompletion,
    hasCronEvents,
  } = resolveHeartbeatRunPrompt({
    cfg,
    heartbeat,
    preflight,
    canRelayToUser,
    workspaceDir,
  });

  // ── DoD 门禁摘要注入（仅对默认 agent / coordinator）────────────────
  // 每次心跳时，将所有活跃项目的验收标准完成状态注入到消息体中，
  // 让 coordinator 明确知道哪些项目已完成（禁止继续分配），哪些存在差距（应补充任务）。
  let prompt = rawPrompt;
  // 任务驱动事件（task-wake/next/resume/retry）跳过 DoD 注入，避免干扰具体任务流程
  const hasTaskDrivenEvents = preflight.pendingEventEntries.some(
    (event) =>
      event.contextKey?.startsWith("cron:task-wake:") ||
      event.contextKey?.startsWith("cron:task-next:") ||
      event.contextKey?.startsWith("cron:task-resume:") ||
      event.contextKey?.startsWith("cron:task-retry:"),
  );
  if (isDefaultAgent && !hasExecCompletion && !hasCronEvents && !hasTaskDrivenEvents) {
    try {
      const { listAvailableProjects, buildProjectContext, checkCompletionGate } =
        await import("../utils/project-context.js");
      const projectIds = listAvailableProjects();
      const activeProjects = projectIds
        .map((id) => {
          try {
            return { id, ctx: buildProjectContext(id) };
          } catch {
            return null;
          }
        })
        .filter(
          (p): p is { id: string; ctx: import("../utils/project-context.js").ProjectContext } =>
            p !== null &&
            p.ctx.config?.status !== "completed" &&
            p.ctx.config?.status !== "cancelled" &&
            p.ctx.config?.status !== "deprecated",
        );

      if (activeProjects.length > 0) {
        const lines: string[] = [
          "",
          "---",
          "## [DoD 门禁] 当前活跃项目完成状态（Project Definition-of-Done Status）",
          "▶ 主控规则（业界最佳实践：Ship → Pause → Feedback → Iterate）：",
          "  - 【DoD 驱动交付】只有 completionGate.criteria 中的验收标准全部满足，才算达到可交付状态（可发布给用户）。",
          "  - 【达标即暂停】DoD 满足后立即停止开发，将项目设为 paused（等待用户反馈），禁止继续创建新功能/优化任务。",
          "  - 【反馈驱动迭代】等待用户实际使用后提出 Bug 或改进需求，收到反馈后再开启下一轮迭代，不可提前假设需求自行开发。",
          "  - 【scopeFrozen=true 时绝对禁止创建任务】范围冻结期间严禁任何新任务，包括看似合理的优化或重构。",
          "  - 【paused 状态不分配新任务】paused 代表等待外部反馈，主控应保持等待，不催促团队工作。",
          "  - 【需求基线是金标准】requirementsBaseline 经用户确认后就是不可篹改的单一事实源，所有开发、审查、DoD 验收均必对照此基线而不是 AI 的自我理解。",
          "  - 【基线未锁定禁止开发】requirementsBaseline.baselineLockedAt 为空时，禁止推进到 planning/development 阶段，必须先完成需求澳清并等待用户确认。",
          "  - 【变更需用户授权】如用户提出新需求，必须展示变更内容和影响并等待用户确认 Change Request，确认后更新 baseline.version 并重新锁定基线，不得单方擅自扩展范围。",
          "",
        ];

        for (const { id, ctx } of activeProjects) {
          const name = ctx.config?.name || id;
          const status = ctx.config?.status ?? "unknown";
          const gate = ctx.config?.completionGate;

          if (!gate || gate.criteria.length === 0) {
            lines.push(
              `⚠️  项目: ${name} (${id})  状态: ${status}`,
              `   [DoD 缺失] 未定义验收标准（completionGate）。`,
              `   建议：调用 projects.create 或 projects.updateProgress 补充 completionGate.criteria。`,
              "",
            );
            continue;
          }

          // ── 需求基线守卫 ──
          const baseline = ctx.config?.requirementsBaseline;
          const baselineLocked = baseline && baseline.baselineLockedAt;
          const baselineScenarioCount = baseline?.scenarios?.length ?? 0;
          const mustScenarios = baseline?.scenarios?.filter((s) => s.priority === "must") ?? [];
          const isPreDev = status === "requirements" || status === "design" || status === "planning";
          const isInDev = status === "development" || status === "active" || status === "testing" || status === "review";

          if (!baseline) {
            // 区分“新项目尚未建基线”和“老项目存量迁移”两种场景
            // isPreDev=true → 项目还在需求/设计/规划阶段，强制阻断，必须先建基线才能开发
            // isInDev=true  → 项目已在开发/测试中，可能是引入此机制前的存量老项目，
            //                  降级为「建议补充」而非「强制阻断」，避免中断已有进度
            // 其他状态     → 轻提示
            if (isPreDev) {
              lines.push(
                `⚠️  项目: ${name} (${id})  状态: ${status}`,
                `   [需求基线缺失——禁止推进开发] 项目处于需求/设计/规划阶段，尚未建立 requirementsBaseline。`,
                `   必须操作：先与用户反复澳清需求，按 Given-When-Then 格式写出验收场景 + Out-of-Scope 列表，等用户确认后再推进。`,
                `   就调用 projects.updateProgress(projectId="${id}") 写入 requirementsBaseline 并设置 baselineLockedAt。`,
                `   📁 原始沟通记录保存到：${ctx.config?.requirementsDir ?? (ctx.workspacePath + "/requirements")}/REQUIREMENTS_BASELINE.md`,
                `   📋 同时将摘要同步到 SHARED_MEMORY.md 的「📌 需求基线摘要」区块。`,
                ``,
              );
            } else if (isInDev) {
              // 存量老项目：已在开发中，需求基线机制是新引入的，补充即可，不阻断当前工作
              lines.push(
                `💡 项目: ${name} (${id})  状态: ${status}`,
                `   [建议补充需求基线] 该项目缺少 requirementsBaseline（此为新引入的需求对齐机制）。`,
                `   当前工作无需中断，但建议在合适时机补充：整理用户原始需求 → 写成 Given-When-Then 场景 → 用户确认后锁定基线。`,
                `   补充路径：${ctx.config?.requirementsDir ?? (ctx.workspacePath + "/requirements")}/REQUIREMENTS_BASELINE.md`,
                ``,
              );
            } else {
              lines.push(
                `💡 项目: ${name} (${id})  状态: ${status}`,
                `   [建议] 尚未定义需求基线（requirementsBaseline），如有机会可补充以提升需求对齐质量。`,
                ``,
              );
            }
          } else if (!baselineLocked && isInDev) {
            lines.push(
              `🚨  项目: ${name} (${id})  状态: ${status}`,
              `   [基线未锁定——违规开发中] requirementsBaseline 存在但用户尚未确认，当前却已进入开发阶段！`,
              `   立即暂停创建新任务，向用户展示当前基线草稿（v${baseline.version}）并等待确认。`,
              `   确认后再将 baselineLockedAt 写入项目配置。`,
              ``,
            );
          } else if (!baselineLocked && isPreDev) {
            lines.push(
              `📋 项目: ${name} (${id})  状态: ${status}`,
              `   [需求澳清中] 基线不完整或用户尚未确认。当前场景: ${baselineScenarioCount} 个 (must: ${mustScenarios.length})`,
              `   下一步：展示当前需求理解，使用 Given-When-Then 格式确认每个场景，尝试识别歧义并向用户澳清。`,
              ``,
            );
          } else if (baselineLocked) {
            const lockedDate = new Date(baseline.baselineLockedAt!).toLocaleDateString("zh-CN");
            lines.push(
              `📌 项目: ${name} (${id})  状态: ${status}`,
              `   [需求基线已锁定 v${baseline.version}] 由「${baseline.baselineLockedBy ?? "用户"}」于 ${lockedDate} 确认。`,
              `   金标准: "${baseline.valueStatement}"`,
              `   必实现场景: ${mustScenarios.length} 个 | Out-of-Scope: ${baseline.outOfScope.length} 项`,
              `   ⛔ 任何超出以上范围的开发均需立即停止并向用户发起 Change Request。`,
              ``,
            );
          }

          const gateResult = checkCompletionGate(gate);
          const statusIcon = gate.scopeFrozen ? "🔒" : gateResult.canClose ? "✅" : "🛠️";

          lines.push(
            `${statusIcon} 项目: ${name} (${id})  状态: ${status}  进度: ${gateResult.progress.satisfied}/${gateResult.progress.total} (${gateResult.progress.percent}%)`,
          );

          if (gate.scopeFrozen) {
            lines.push(
              `   🔒 范围已冻结（原因: ${gate.scopeFrozenReason ?? "unknown"}）— 严禁创建新任务！`,
              `   ⤵️ 如判断为误封冻，请立即调用 projects.reactivate(projectId="${id}") 解除封冻。`,
            );
          } else if (gateResult.canClose) {
            lines.push(
              `   ✅ 本轮迭代 DoD 已全部满足！达到可交付标准。`,
              `   🚦 下一步（按顺序执行，不可跳过）：`,
              `     ① 立即调用 projects.updateProgress(projectId="${id}", status="paused") 将项目设为【暂停等待反馈】`,
              `     ② 停止为该项目创建任何新任务（功能/优化/重构 均禁止）`,
              `     ③ 向负责人通报：本轮迭代已完成，等待用户实际使用后反馈`,
              `     ④ 收到用户反馈后，再调用 projects.updateProgress 将状态改回 development/active，开启下一轮迭代`,
              `   ⛔ 绝对禁止：在未收到用户反馈前，自行假设需求继续开发！`,
            );
          } else if (gateResult.gaps.length > 0) {
            lines.push(`   🔍 待补齐的差距（仅补这些，不要重复开发其他部分）:`);
            for (const gap of gateResult.gaps.slice(0, 5)) {
              lines.push(`     • ${gap}`);
            }
            if (gateResult.gaps.length > 5) {
              lines.push(`     ... 还有 ${gateResult.gaps.length - 5} 项`);
            }
          }

          // ── 当前活跃目标注入 ──
          // 使用 buildActiveObjectivesSummary 生成标准化目标摘要，让团队知道当前项目目标
          try {
            const {
              buildActiveObjectivesSummary,
              formatObjectivesSummaryForPrompt,
              buildSprintWorkSnapshot,
              formatSprintWorkSnapshotForPrompt,
            } = await import("../utils/project-context.js");
            const objSummary = buildActiveObjectivesSummary(id);
            if (objSummary) {
              const formatted = formatObjectivesSummaryForPrompt(objSummary, 40);
              if (formatted.trim()) {
                // 将目标摘要转换为缩进列表格式（每行加缩进）
                const indented = formatted
                  .split("\n")
                  .map((l) => (l ? `   ${l}` : ""))
                  .join("\n");
                lines.push(`   🎯 目标与路线图:`);
                lines.push(indented);
              }
            }
            // ── Sprint 工作日志快照注入（OpenHands 事件溢源思路）──
            // 让 AI 无论是小会话还是心跳啊醒，都能立即知道当前迭代到了哪里、应该做什么。
            const sprintSnapshot = buildSprintWorkSnapshot(id);
            if (sprintSnapshot) {
              const formattedSnapshot = formatSprintWorkSnapshotForPrompt(sprintSnapshot);
              if (formattedSnapshot.trim()) {
                const indentedSnapshot = formattedSnapshot
                  .split("\n")
                  .map((l) => (l ? `   ${l}` : ""))
                  .join("\n");
                lines.push(`   📋 Sprint 工作快照（进度快照，正常心跳可忽略）:`);
                lines.push(indentedSnapshot);
              }
            }
          } catch {
            // 目标摘要生成失败不影响 DoD 主流程
          }

          lines.push("");
        }

        prompt = prompt + "\n" + lines.join("\n");
      }
    } catch (dodErr) {
      // DoD 摘要生成失败不影响心跳主流程
      log.warn(`heartbeat: failed to build DoD summary for coordinator: ${String(dodErr)}`);
    }

    // ── Sprint 到期预警注入（Shape Up Circuit Breaker 警示）──────────────────
    // 在 DoD 摘要之后，告知 coordinator 哪些 Sprint 即将到期或已超期
    // 到期超过 0ms = 立即触发 Circuit Breaker 告警；到期前 24h = 预警
    try {
      const { getExpiringSprints } = await import("../tasks/task-aging.js");
      const { listAvailableProjects: _lsP, buildProjectContext: _bpC } =
        await import("../utils/project-context.js");

      const _sprintCtxList: Array<{ id: string; name: string; sprints: import("../utils/project-context.js").ProjectSprint[] }> = [];
      for (const _pid of _lsP()) {
        try {
          const _ctx = _bpC(_pid);
          _sprintCtxList.push({
            id: _pid,
            name: _ctx.config?.name ?? _pid,
            sprints: _ctx.config?.sprints ?? [],
          });
        } catch { /* 单个项目构建失败忽略 */ }
      }

      const expiring = getExpiringSprints(_sprintCtxList);
      if (expiring.length > 0) {
        const sprintLines: string[] = [
          "",
          "---",
          "## [Sprint 熔断预警] 即将到期或已超期的 Sprint（Shape Up Circuit Breaker）",
          "▶ 主控规则：",
          "  - 【Sprint 硬截止】Sprint 到期后不得自动延期，超时工作必须退回 backlog 重新评估。",
          "  - 【到期立即熔断】Sprint 已超期 → 立即将未完成任务退回 backlog，用户反馈优先。",
          "  - 【不延期原则】如需继续，在下一个 Sprint 中重新排期，而不是延长当前 Sprint。",
          "",
        ];

        for (const s of expiring) {
          const isOverdue = s.overdueMs > 0;
          const overdueHours = Math.round(Math.abs(s.overdueMs) / (1000 * 60 * 60));
          const endDateStr = new Date(s.endDate).toLocaleString("zh-CN");

          if (isOverdue) {
            sprintLines.push(
              `🔴 [已超期] 项目 ${s.projectName} | Sprint: ${s.sprintTitle}`,
              `   超期: ${overdueHours}h | 截止: ${endDateStr} | 未完成任务: ${s.incompleteTaskCount} 条`,
              `   ⚡ 立即执行：将 ${s.incompleteTaskCount} 个未完成任务手动标记为 backlog，Sprint 设为 completed。`,
              `   ✅ 可调用 runSprintCircuitBreaker 或手动操作完成熔断。`,
              "",
            );
          } else {
            const hoursLeft = Math.round((s.endDate - Date.now()) / (1000 * 60 * 60));
            sprintLines.push(
              `🟡 [即将到期] 项目 ${s.projectName} | Sprint: ${s.sprintTitle}`,
              `   剩余: ${hoursLeft}h | 截止: ${endDateStr} | 未完成任务: ${s.incompleteTaskCount} 条`,
              `   ⚠️ 请评估未完成任务是否能在截止前完成，否则主动退回 backlog，不要勉强。`,
              "",
            );
          }
        }
        prompt = prompt + "\n" + sprintLines.join("\n");
      }
    } catch (sprintWarnErr) {
      // Sprint 预警生成失败不影响心跳主流程
      log.warn(`heartbeat: failed to build sprint expiry warning: ${String(sprintWarnErr)}`);
    }

    // ── 团队成员活跃负载摘要注入 ──────────────────────────────────────────
    // 直接告知主控每个成员的活跃任务数量（仅计入 todo + in-progress），
    // 避免 LLM 自行调用 task_list 并误将 done 任务算入负载。
    // ⚠️ 守卫：若所有项目均已暂停/冻结，跳过空闲催促逻辑，改为"等待用户反馈"提示
    try {
      const { listTasks } = await import("../tasks/storage.js");
      const { listAgentIds } = await import("../agents/agent-scope.js");
      const { listAvailableProjects: _lsProj, buildProjectContext: _bpCtx } =
        await import("../utils/project-context.js");

      // ── 项目级守卫：检查是否有开发中的活跃项目 ──
      const _allProjIds = _lsProj();
      const _frozenOrPausedProjects: string[] = [];
      const _developingProjects: string[] = [];
      for (const _pid of _allProjIds) {
        try {
          const _pCtx = _bpCtx(_pid);
          const _pStatus = _pCtx.config?.status;
          const _scopeFrozen = _pCtx.config?.completionGate?.scopeFrozen;
          if (["completed", "cancelled", "deprecated"].includes(_pStatus ?? "")) {continue;}
          if (_pStatus === "paused" || _scopeFrozen) {
            _frozenOrPausedProjects.push(_pid);
          } else {
            _developingProjects.push(_pid);
          }
        } catch { /* 单个项目构建失败忽略 */ }
      }
      const _hasActiveDev = _developingProjects.length > 0;

      const allAgentIds = listAgentIds(cfg).filter(
        (id) => id !== agentId && id !== resolveDefaultAgentId(cfg),
      );
      if (allAgentIds.length > 0) {
        // 批量查询所有团队成员的活跃任务（todo + in-progress）
        const memberLoads: Array<{
          agentId: string;
          todo: number;
          inProgress: number;
          activeTotal: number;
        }> = [];

        for (const memberId of allAgentIds) {
          try {
            const [todoTasks, inProgressTasks] = await Promise.all([
              listTasks({ assigneeId: memberId, status: ["todo"] }),
              listTasks({ assigneeId: memberId, status: ["in-progress"] }),
            ]);
            memberLoads.push({
              agentId: memberId,
              todo: todoTasks.length,
              inProgress: inProgressTasks.length,
              activeTotal: todoTasks.length + inProgressTasks.length,
            });
          } catch {
            /* 单个成员查询失败跳过 */
          }
        }

        if (memberLoads.length > 0) {
          const loadLines: string[] = [
            "",
            "---",
            "## [团队负载] 各成员活跃任务数（仅统计 todo + in-progress，不含 done/cancelled）",
            "▶ 主控规则：",
            "  - 【负载判断依据】仅 todo + in-progress 状态的任务才算入活跃工作量，done/cancelled 不计入。",
          ];

          if (!_hasActiveDev) {
            // 所有项目均已暂停/冻结 → 等待反馈模式，不催促
            loadLines.push(
              "  - 【⏸️ 等待反馈模式】当前所有项目均已暂停或范围冻结，团队处于等待用户反馈阶段。",
              "  - 【禁止分配新任务】在收到用户反馈前，不得为任何成员创建新的开发任务。",
              "  - 【正确响应】若成员询问下一步，告知：本轮迭代已交付，等待用户反馈，收到反馈后再安排。",
              "",
            );
            if (_frozenOrPausedProjects.length > 0) {
              loadLines.push(
                `   ⏸️ 暂停/冻结中的项目：${_frozenOrPausedProjects.join(", ")}`,
                `   📬 等待用户对上述项目提供使用反馈，收到后调用 projects.updateProgress 重新激活，开启下一轮迭代。`,
                "",
              );
            }
          } else {
            // 存在开发中项目 → 正常负载补充逻辑
            loadLines.push(
              "  - 【补充任务阈值】当成员活跃任务 < 3 条时，从开发中项目的 backlog 为其安排新任务。",
              "  - 【空闲识别】activeTotal = 0 表示该成员完全空闲，需立即分配工作。",
              "",
            );

            let hasIdleMembers = false;
            for (const load of memberLoads) {
              const icon = load.activeTotal === 0 ? "⚪" : load.activeTotal < 3 ? "🟡" : "🟢";
              loadLines.push(
                `${icon} ${load.agentId}: 活跃任务 ${load.activeTotal} 条（待开始 ${load.todo} + 进行中 ${load.inProgress}）`,
              );
              if (load.activeTotal === 0) {
                hasIdleMembers = true;
                loadLines.push(`   ⚠️ 该成员完全空闲！请从开发中项目的 backlog 为其安排工作任务。`);
              } else if (load.activeTotal < 3) {
                loadLines.push(`   ℹ️ 活跃任务不足 3 条，如有 backlog 任务可安排给该成员。`);
              }
            }

            if (hasIdleMembers) {
              loadLines.push("");
              loadLines.push(
                "🚨 发现空闲成员！请检查开发中项目的 backlog 并为空闲成员分配新任务。",
              );
            }
          }
          loadLines.push("");
          prompt = prompt + "\n" + loadLines.join("\n");
        }
      }
    } catch (loadErr) {
      // 负载摘要生成失败不影响心跳主流程
      log.warn(`heartbeat: failed to build team load summary: ${String(loadErr)}`);
    }

    // ── 项目规范约定注入（coordinator 心誺）────────────────────────────────────
    // 在分配任务前，让 coordinator 知道每个开发中项目的运行规范。
    // 若 conventions 未定义，明确限制分配实现任务。
    try {
      const { listAvailableProjects: _lsProj2, buildProjectContext: _bpCtx2 } =
        await import("../utils/project-context.js");
      const _allPids2 = _lsProj2();
      const convLines: string[] = [];

      for (const _pid2 of _allPids2) {
        try {
          const _pCtx2 = _bpCtx2(_pid2);
          const _pCfg2 = _pCtx2.config;
          if (!_pCfg2) {continue;}
          const _convActiveStatuses = new Set(["development", "planning", "design", "testing", "review"]);
          if (!_convActiveStatuses.has(_pCfg2.status ?? "")) {continue;}

          const _hasTechStack = _pCfg2.techStack && Object.keys(_pCfg2.techStack).length > 0;
          const _hasConventions = _pCfg2.conventions &&
            Object.values(_pCfg2.conventions).some((v) => v !== undefined && v !== null && v !== "");

          if (!_hasTechStack && !_hasConventions) {
            convLines.push(
              `\u26a0\ufe0f [\u89c4\u8303\u672a\u5b9a\u4e49] \u9879\u76ee "${_pCfg2.name ?? _pid2}" \u5c1a\u672a\u914d\u7f6e techStack + conventions\uff01`,
              `   \u8fd9\u662f\u91cd\u590d\u4ee3\u7801\u7684\u4e3b\u8981\u8fdb\u5165\u70b9\u3002\u5728\u5b9a\u4e49\u89c4\u8303\u524d\uff0c\u7981\u6b62\u5206\u914d\u4e0d\u4f55\u5b9e\u73b0\u4efb\u52a1\u3002`,
              `   \u8bf7\u5148\u5b8c\u5584 PROJECT_CONFIG.json \u7684 techStack + conventions \u5b57\u6bb5\uff0c\u5e76\u66f4\u65b0 SHARED_MEMORY.md\u3002`,
              ``,
            );
          } else {
            const _c = _pCfg2.conventions ?? {};
            const _ts = _pCfg2.techStack ?? {};
            const _cvSummary: string[] = [];
            if (Object.keys(_ts).length > 0) {
              _cvSummary.push(`\u6280\u672f\u6808: ${Object.entries(_ts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
            }
            if (_c.dirStructure) {_cvSummary.push(`\u76ee\u5f55\u7ed3\u6784: ${_c.dirStructure}`);}
            if (_c.packageNaming) {_cvSummary.push(`\u5305\u547d\u540d: ${_c.packageNaming}`);}
            if (_c.moduleNaming) {_cvSummary.push(`\u6a21\u5757\u547d\u540d: ${_c.moduleNaming}`);}
            if (_c.apiPathPrefix) {_cvSummary.push(`API\u524d\u7f00: ${_c.apiPathPrefix}`);}
            if (_c.codeStyle) {_cvSummary.push(`\u4ee3\u7801\u98ce\u683c: ${_c.codeStyle}`);}
            if (_c.custom) {
              for (const [_ck, _cv] of Object.entries(_c.custom)) {
                _cvSummary.push(`${_ck}: ${_cv}`);
              }
            }
            if (_cvSummary.length > 0) {
              convLines.push(
                `\u2705 [\u9879\u76ee\u89c4\u8303] \u9879\u76ee "${_pCfg2.name ?? _pid2}" \u7684\u5f3a\u5236\u8ba4\u8bc6\uff1a`,
                ..._cvSummary.map((l) => `   \u2022 ${l}`),
                `   \u26a0\ufe0f \u5206\u914d\u5b9e\u73b0\u4efb\u52a1\u65f6\u5fc5\u987b\u5c06\u4ee5\u4e0a\u89c4\u8303\u5199\u5165\u4efb\u52a1 description\uff0c\u7981\u6b62 AI \u6210\u5458\u81ea\u884c\u5224\u65ad\u76ee\u5f55\u7ed3\u6784\u548c\u5305\u547d\u540d\u3002`,
                ``,
              );
            }
          }
        } catch { /* \u5355\u9879\u76ee\u5931\u8d25\u5ffd\u7565 */ }
      }

      if (convLines.length > 0) {
        const _convHeader = [
          "",
          "---",
          "## [\u9879\u76ee\u89c4\u8303\u7ea6\u5b9a] \u5206\u914d\u4efb\u52a1\u524d\u5fc5\u8bfb\u2014\u2014\u4e25\u7981\u8fdd\u53cd\uff08\u9632\u6b62\u91cd\u590d\u4ee3\u7801\u7684\u6838\u5fc3\u673a\u5236\uff09",
          "",
        ];
        prompt = prompt + "\n" + _convHeader.join("\n") + convLines.join("\n");
      }
    } catch (convErr) {
      log.warn(`heartbeat: failed to build conventions summary: ${String(convErr)}`);
    }
    // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  }
  // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500


    // ── 紧急制动流程提示（coordinator 心跳）────────────────
    try {
      const _pivotNotice = [
        "",
        "---",
        "## [紧急制动协议] 发现方向错误时的标准处置流程",
        "",
        "当你（coordinator）发现以下情况时，必须立即执行紧急制动：",
        "  - 项目中出现了重复模块（如 erp/erp-purchase/ 和 erp-purchase/ 同时存在）",
        "  - 架构方向已确认错误，需要推倒重来",
        "  - 用户明确指出当前开发路径不对",
        "  - 多个 agent 在错误路径上并行开发，产生了大量需废弃的代码",
        "",
        "紧急制动操作步骤：",
        "  1. 调用 project_emergency_pivot(projectId, reason, newDirection?) 一键制动",
        "     该工具会自动：暂停项目 + 批量取消所有未完成任务 + 写入共享记忆",
        "  2. 如需只取消部分任务，使用 task_batch_cancel(projectId, reason)",
        "  3. 清理重复/错误代码",
        "  4. 重新规划正确的目录结构和任务",
        "  5. 调用 project_update_status(projectId, 'development') 恢复开发",
        "",
        "\u26a0\ufe0f 禁止的做法：发现方向错误后继续让 agent 执行原有任务！",
        "",
      ];
      prompt = prompt + "\n" + _pivotNotice.join("\n");
    } catch (pivotNoticeErr) {
      log.warn(`heartbeat: failed to inject pivot notice: ${String(pivotNoticeErr)}`);
    }

    // ── 反思日志提醒（Reflexion 机制）────────────────────────────────
    try {
      const _reflexionNotice = [
        "",
        "---",
        "## [反思日志] 从失败中学习（Reflexion 机制）",
        "",
        "当项目中有任务被取消或失败时，反思日志会自动写入项目共享记忆的「反思日志（Reflexion）」区块。",
        "作为 coordinator，你应当：",
        "  1. 在分配新任务前，先读取项目的反思日志区块，了解之前失败的原因",
        "  2. 在新任务的 description 中明确写入「避免 XX 错误」的提示",
        "  3. 如果反思日志中频繁出现同类失败，考虑调用 project_emergency_pivot 重新评估方向",
        "",
      ];
      prompt = prompt + "\n" + _reflexionNotice.join("\n");
    } catch (reflexionErr) {
      log.warn(`heartbeat: failed to inject reflexion notice: ${String(reflexionErr)}`);
    }
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

    // ── 事前上下文大小门控（Proactive Transcript Size Gate）────────────
    // 业界最佳实践（Claude Code / OpenHands）：
    // 在发起 embedded run 之前，先检查 transcript 文件大小。
    // 若文件已超出安全阈值，则在本次运行前主动清空，
    // 让 Pi 从空 context 开始，内置的 compaction 机制可以正常工作。
    // 这比事后检测 overflow 更优：直接切断超大 context 进入 LLM 的通路。
    //
    // 阈值设计依据：
    //   - 动态取当前 agent 所用模型的 contextWindow（tokens）
    //   - tokens × CHARS_PER_TOKEN_ESTIMATE（≈4） × 0.75 = 字节安全上限
    //   - 0.75 对齐 tool-result-context-guard 的 CONTEXT_INPUT_HEADROOM_RATIO
    //   - 回退值：DEFAULT_CONTEXT_TOKENS（128k） × 4 × 0.75 ≈ 384 KB
    //   - 超过此值时，Pi 初始化阶段就会溢出，tool-result-context-guard 和
    //     Pi 的 threshold-based compaction 根本来不及触发
    const heartbeatModelForCtx = heartbeat?.model?.trim() || undefined;
    const agentPrimaryModel = resolveAgentExplicitModelPrimary(cfg, agentId);
    const ctxModelId = heartbeatModelForCtx ?? agentPrimaryModel ?? undefined;
    const agentContextTokens =
      resolveContextTokensForModel({
        cfg,
        model: ctxModelId,
        fallbackContextTokens: DEFAULT_CONTEXT_TOKENS,
      }) ?? DEFAULT_CONTEXT_TOKENS;
    // 安全阈值 = contextWindow × chars/token × 0.75，单位字节
    const TRANSCRIPT_PROACTIVE_RESET_BYTES = Math.floor(
      agentContextTokens * CHARS_PER_TOKEN_ESTIMATE * 0.75,
    );
    if (
      transcriptState.transcriptPath &&
      typeof transcriptState.preHeartbeatSize === "number" &&
      transcriptState.preHeartbeatSize > TRANSCRIPT_PROACTIVE_RESET_BYTES
    ) {
      log.warn(
        `heartbeat: transcript size ${transcriptState.preHeartbeatSize} bytes exceeds safe threshold ` +
          `${TRANSCRIPT_PROACTIVE_RESET_BYTES} (model ctx=${agentContextTokens} tokens) — proactively clearing before run to prevent overflow`,
        {
          agentId,
          sessionKey: runSessionKey,
          bytes: transcriptState.preHeartbeatSize,
          thresholdBytes: TRANSCRIPT_PROACTIVE_RESET_BYTES,
          contextTokens: agentContextTokens,
        },
      );
      try {
        await fs.writeFile(transcriptState.transcriptPath, "", "utf-8");
        // 重置 preHeartbeatSize 让事后 pruneHeartbeatTranscript 从 0 开始
        transcriptState.preHeartbeatSize = 0;
        log.info(
          `heartbeat: proactive transcript reset done for agent "${agentId}" — context starts fresh`,
          { agentId },
        );
      } catch (resetErr) {
        log.warn(
          `heartbeat: failed to proactively reset transcript for agent "${agentId}": ${String(resetErr)}`,
          { agentId },
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────

    // ── 主动 Token 用量百分比门控（Proactive Token Percentage Gate）──────
    // 业界最佳实践（VNX Context Rotation / claudefa.st Code Kit）：
    // 不等 overflow 发生，而是在 context 用量达到 65% 时主动轮换 session。
    // 这比事后 overflow 更优：65% 以上推理准确率开始显著下降（Stanford 2024）。
    //
    // 触发条件（同时满足）：
    //   1. session store 中有可信的 totalTokens（totalTokensFresh=true）
    //   2. totalTokens / contextTokens >= 0.65（65% 用量）
    //   3. 该 agent 有 in-progress 任务（有任务才需要 handover，避免打扰空闲 agent）
    //   4. 不是 isolated session（isolated session 每次都是新 session，无需主动轮换）
    //
    // 动作：
    //   - 向该 session 注入 [PROACTIVE CONTEXT ROTATE] handover 消息（含任务摘要+工作日志快照）
    //   - 清空 transcript，让本次 run 以干净 context 开始
    //   - handover 消息将作为新 context 的第一条 system event，指引 agent 从已有工作继续
    if (!useIsolatedSession && transcriptState.transcriptPath) {
      try {
        const sessionStoreForGate = loadSessionStore(runStorePath);
        const sessionEntryForGate = sessionStoreForGate[runSessionKey];
        const totalTokensForGate = sessionEntryForGate?.totalTokens;
        const contextTokensForGate = sessionEntryForGate?.contextTokens ?? agentContextTokens;
        const isFreshGate = sessionEntryForGate?.totalTokensFresh !== false;
        // 65% 阈值（业界参考：VNX 65%、claudefa.st 50%，取中间偏保守值）
        const TOKEN_ROTATE_THRESHOLD = 0.65;
        if (
          isFreshGate &&
          typeof totalTokensForGate === "number" &&
          totalTokensForGate > 0 &&
          contextTokensForGate > 0 &&
          totalTokensForGate / contextTokensForGate >= TOKEN_ROTATE_THRESHOLD
        ) {
          // 检查是否有 in-progress 任务（只对有任务的 agent 做 handover）
          const usagePct = Math.round((totalTokensForGate / contextTokensForGate) * 100);
          let hasActiveTask = false;
          let activeTaskForHandover:
            | {
                id: string;
                title: string;
                priority: string;
                type?: string;
                projectId?: string;
                description?: string;
                workLogs?: Array<{ action: string; details: string; result?: string }>;
              }
            | undefined;
          if (runSessionKey.startsWith("agent:")) {
            const agentIdForGate = runSessionKey.split(":")[1];
            if (agentIdForGate) {
              const { listTasks } = await import("../tasks/storage.js");
              const inProgressTasks = await listTasks({
                assigneeId: normalizeAgentId(agentIdForGate),
                status: ["in-progress"],
              });
              activeTaskForHandover = inProgressTasks[0];
              hasActiveTask = Boolean(activeTaskForHandover);
            }
          }
          if (hasActiveTask && activeTaskForHandover) {
            log.warn(
              `heartbeat: context at ${usagePct}% (${totalTokensForGate}/${contextTokensForGate} tokens) — proactive rotate for agent "${agentId}" (task ${activeTaskForHandover.id})`,
              {
                agentId,
                sessionKey: runSessionKey,
                usagePct,
                totalTokensForGate,
                contextTokensForGate,
              },
            );
            // 构建 handover 消息（对标 VNX handover contract：Completed / Remaining / Next Steps）
            const recentWorkLogs = (activeTaskForHandover.workLogs ?? []).slice(-5);
            const handoverMsg = [
              `[PROACTIVE CONTEXT ROTATE] Your session context is at ${usagePct}% capacity and has been proactively rotated to maintain performance.`,
              `A fresh session has been started with your task state preserved. This is a planned rotation — no work has been lost.`,
              ``,
              `=== TASK TO RESUME ===`,
              `Task ID: ${activeTaskForHandover.id}`,
              `Title: ${activeTaskForHandover.title}`,
              `Status: in-progress`,
              `Priority: ${activeTaskForHandover.priority}`,
              activeTaskForHandover.type ? `Type: ${activeTaskForHandover.type}` : null,
              activeTaskForHandover.projectId
                ? `Project: ${activeTaskForHandover.projectId}`
                : null,
              activeTaskForHandover.description
                ? `Description: ${activeTaskForHandover.description.slice(0, 300)}`
                : null,
              recentWorkLogs.length > 0
                ? `\n=== RECENT WORK LOG (last ${recentWorkLogs.length} entries) ===`
                : null,
              ...recentWorkLogs.map(
                (wl) =>
                  `  [${wl.action}] ${wl.details.slice(0, 200)}${wl.result ? ` → ${wl.result}` : ""}`,
              ),
              ``,
              `=== WORKING CONTEXT ===`,
              `Working Directory: ${workspaceDir}`,
              `Your Personal Memory: ${path.join(workspaceDir, "MEMORY.md")}`,
              ``,
              `=== NEXT STEPS ===`,
              `1. Do NOT start over — your task is already in-progress, continue from where you left off.`,
              `2. Check your working directory and work logs above to understand current progress.`,
              `3. Continue executing the task using your available tools.`,
              `4. Call task_report_to_supervisor with Task ID: ${activeTaskForHandover.id} when complete.`,
            ]
              .filter(Boolean)
              .join("\n");
            enqueueSystemEvent(handoverMsg, {
              sessionKey: runSessionKey,
              contextKey: `cron:proactive-rotate:${activeTaskForHandover.id}`,
            });
            // 清空 transcript，让本次 run 以干净 context 开始（handover 作为第一条 system event）
            try {
              await fs.writeFile(transcriptState.transcriptPath, "", "utf-8");
              transcriptState.preHeartbeatSize = 0;
              log.info(
                `heartbeat: proactive context rotation done for agent "${agentId}" (${usagePct}% → 0%)`,
                { agentId },
              );
            } catch (rotateErr) {
              log.warn(
                `heartbeat: failed to clear transcript for proactive rotation: ${String(rotateErr)}`,
                { agentId },
              );
            }
          }
        }
      } catch (gateErr) {
        // 门控逻辑失败不影响心跳主流程
        log.warn(`heartbeat: proactive token gate error (non-fatal): ${String(gateErr)}`, {
          agentId,
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────

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

    // ── 「只汇报无行动」后置检测：运行前快照阻塞任务 IDs ────────────────
    // 业界最佳实践（OpenHands Orchestrator Pattern）：
    // 主控心跳结束后，若发出了实质性回复（非 HEARTBEAT_OK），
    // 但阻塞任务集合完全没有变化（无任务被 triage/reset/cancel），
    // 则判定为「只汇报无工具操作」，注入强化警告并再次触发心跳。
    let preRunBlockedIds: Set<string> | null = null;
    if (isDefaultAgent && !hasExecCompletion && !hasCronEvents && !hasTaskDrivenEvents) {
      try {
        const { listTasks: listTasksForGate } = await import("../tasks/storage.js");
        const { listAgentIds: listAgentIdsForGate } = await import("../agents/agent-scope.js");
        const allAgentIdsForGate = listAgentIdsForGate(cfg);
        const allBlockedBeforeRaw = await Promise.all(
          allAgentIdsForGate.map((aid) =>
            listTasksForGate({ assigneeId: aid, status: ["blocked"] }).catch(() => []),
          ),
        );
        preRunBlockedIds = new Set(allBlockedBeforeRaw.flat().map((t) => t.id));
      } catch {
        // 快照失败不阻塞心跳
      }
    }
    // ─────────────────────────────────────────────────────────────────

    const replyResult = await getReplyFromConfig(ctx, replyOpts, cfg);

    // ── 心跳结束后压缩 HEARTBEAT.md（滚动摘要，控制文件大小）────────
    // 在 LLM 已读取并处理完 HEARTBEAT.md 内容之后执行压缩，不影响本次回复。
    void compactHeartbeatFileIfNeeded(workspaceDir);
    // ─────────────────────────────────────────────────────────────────

    // ── Context Overflow 自动恢复 ─────────────────────────────────────
    // 业界最佳实践（参考 Anthropic Claude compaction、OpenHands）：
    // overflow 属于 non-retriable 错误，不应无限重试。
    // 检测到 overflow error payload 后，立即清空该 agent 的 session transcript，
    // 让下次唤醒从空 context 开始，彻底打破循环。
    const replyPayloads = Array.isArray(replyResult)
      ? replyResult
      : replyResult
        ? [replyResult]
        : [];
    const overflowPayload = replyPayloads.find(
      (p) => p.isError && isLikelyContextOverflowError(p.text ?? ""),
    );

    // ── 限流感知：reply payload 带有 rate_limit 错误标志时上报全局熔断器 ──
    const rateLimitPayload = replyPayloads.find(
      (p) => p.isError && isLikelyRateLimitError(p.text ?? ""),
    );
    if (rateLimitPayload) {
      notifyGlobalRateLimit(agentId);
      log.warn(`heartbeat: rate-limit error detected for agent "${agentId}" — notified global circuit breaker`, { agentId });
    }
    // ─────────────────────────────────────────────────────────────────

    if (overflowPayload && transcriptState.transcriptPath) {
      log.warn(
        `heartbeat: context overflow detected for agent "${agentId}" session "${runSessionKey}" — auto-clearing transcript to break retry loop`,
        { agentId, sessionKey: runSessionKey },
      );
      try {
        await fs.writeFile(transcriptState.transcriptPath, "", "utf-8");
        log.info(
          `heartbeat: transcript cleared for agent "${agentId}" (${transcriptState.transcriptPath})`,
          { agentId },
        );
      } catch (clearErr) {
        log.warn(
          `heartbeat: failed to clear transcript for agent "${agentId}": ${String(clearErr)}`,
          { agentId },
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────

    const replyPayload = resolveHeartbeatReplyPayload(replyResult);
    const includeReasoning = heartbeat?.includeReasoning === true;
    const reasoningPayloads = includeReasoning
      ? resolveHeartbeatReasoningPayloads(replyResult).filter((payload) => payload !== replyPayload)
      : [];

    // ── 「只汇报无行动」后置检测（OpenHands Orchestrator + Augment Code Validation Gate）──
    // 放在所有提前 return 分支之前，确保任何路径都能检测。
    // 条件：
    //   1. 是默认 agent（主控）且非 task/exec/cron 驱动
    //   2. 有前置快照的阻塞任务（preRunBlockedIds 非空且非零）
    //   3. 主控回复了实质性内容（有 text，而不是空体）
    //   4. 运行后阻塞列表与运行前完全相同（没有任何任务被处理）
    if (
      preRunBlockedIds !== null &&
      preRunBlockedIds.size > 0 &&
      isDefaultAgent &&
      !hasExecCompletion &&
      !hasCronEvents &&
      !hasTaskDrivenEvents &&
      replyPayload?.text?.trim()
    ) {
      void (async () => {
        try {
          const { listTasks: listTasksAfter } = await import("../tasks/storage.js");
          const { listAgentIds: listAgentIdsAfter } = await import("../agents/agent-scope.js");
          const allAgentIdsAfter = listAgentIdsAfter(cfg);
          const allBlockedAfterRaw = await Promise.all(
            allAgentIdsAfter.map((aid) =>
              listTasksAfter({ assigneeId: aid, status: ["blocked"] }).catch(() => []),
            ),
          );
          const postRunBlockedIds = new Set(
            allBlockedAfterRaw.flat().map((t: { id: string }) => t.id),
          );
          const anyResolved = [...preRunBlockedIds].some((id) => !postRunBlockedIds.has(id));
          const anyNewBlocked = [...postRunBlockedIds].some((id) => !preRunBlockedIds.has(id));
          // ── 缺口3补全：部分处理豁免阈值（业界实践 Augment "minimum viable action" threshold）──
          // 主控可能只处理 1/16 个阻塞任务来绕过「anyResolved=true」检测
          // 当阻塞数 >= 5 且解除比例 < 20% 时，仍视为「实质未处理」
          const resolvedCount = [...preRunBlockedIds].filter(
            (id) => !postRunBlockedIds.has(id),
          ).length;
          const resolvedRatio =
            preRunBlockedIds.size > 0 ? resolvedCount / preRunBlockedIds.size : 1;
          const isSubstantiallyActioned =
            anyResolved && (preRunBlockedIds.size < 5 || resolvedRatio >= 0.2);

          // 阻塞列表完全不变（既无解除也无新增）或部分处理比例极低 → 判定为「只汇报无工具操作」
          if ((!anyResolved && !anyNewBlocked) || (!isSubstantiallyActioned && !anyNewBlocked)) {
            const blockedCount = preRunBlockedIds.size;
            // ── 连续无操作计数（Augment 递进惩罚模式）──
            // 使用 session store 中的 noActionCount 持久化计数，
            // 让警告随次数升级，避免 LLM 学会忽略重复内容相同的系统消息
            let noActionCount = 1;
            try {
              const storeForCount = loadSessionStore(storePath);
              const entryForCount = storeForCount[sessionKey];
              const prevCount =
                typeof (entryForCount as Record<string, unknown>)?.noActionCount === "number"
                  ? ((entryForCount as Record<string, unknown>).noActionCount as number)
                  : 0;
              noActionCount = prevCount + 1;
              storeForCount[sessionKey] = {
                ...entryForCount,
                noActionCount,
              };
              await saveSessionStore(storePath, storeForCount);
            } catch {
              // 计数失败不影响主流程
            }
            // ── 具体未处理任务 ID 列表（OpenHands Orchestrator interrupt 带完整列表）──
            const pendingBlockedIds = [...preRunBlockedIds].slice(0, 10);
            const pendingListStr = pendingBlockedIds.map((id) => `    - ${id}`).join("\n");
            // 根据连续次数升级警告强度
            const urgencyPrefix =
              noActionCount >= 3
                ? `🚨🚨 [第 ${noActionCount} 次无操作 — 系统强制升级] 🚨🚨`
                : noActionCount === 2
                  ? `🚨 [第 ${noActionCount} 次无操作 — 再次警告]`
                  : `⚠️ [第 ${noActionCount} 次无操作]`;
            // 部分处理时增加补充说明
            const partialNote =
              anyResolved && !isSubstantiallyActioned
                ? `\n\n⚠️ [部分处理不足] 你处理了 ${resolvedCount}/${preRunBlockedIds.size} 个阻塞任务（${Math.round(resolvedRatio * 100)}%），低于 20% 最低阈值，仍视为实质未处理。请继续处理剩余任务。`
                : "";
            const noActionMsg = [
              `[NO-ACTION DETECTED] ${urgencyPrefix} — 主控心跳检测到「只汇报无工具操作」。`,
              ``,
              `当前有 ${blockedCount} 个阻塞任务，但你在本次心跳中只生成了文字回复，没有调用任何工具。`,
              `这是「汇报替代行动」违规行为，不会让阻塞任务得到处理。${partialNote}`,
              ``,
              `📋 待处理阻塞任务 ID（必须逐一通过工具处理）：`,
              pendingListStr,
              blockedCount > pendingBlockedIds.length
                ? `    ... 还有 ${blockedCount - pendingBlockedIds.length} 个`
                : "",
              ``,
              `⚠️ 必须立即执行以下操作之一（文字回复不算数）：`,
              `  a) agent.task.triage operations=[{taskId:"<上方ID>", action:"reset|cancel|reassign", resolutionType:"...", reason:"..."}]`,
              `  b) agent.task.manage action=reset taskId=<上方ID>`,
              `  c) agent_communicate — 向负责 agent 确认具体阻塞原因`,
              noActionCount >= 3
                ? `  ⛔ 你已连续 ${noActionCount} 次未调用任何工具。系统已记录此行为，请立即处理。`
                : "",
            ]
              .filter((l) => l !== "")
              .join("\n");
            const leaderSession = `agent:${agentId}:main`;
            enqueueSystemEvent(noActionMsg, {
              sessionKey: leaderSession,
              contextKey: `leader:no-action:${Date.now()}`,
            });
            log.warn(
              `heartbeat: [NO-ACTION x${noActionCount}] coordinator text-only reply, ${blockedCount} blocked tasks unchanged — re-injecting enforcement`,
              { agentId, blockedCount, noActionCount },
            );

            // ── 缺口2补全：noActionCount 上限熔断（OpenHands max_iterations + force-terminate 模式）──
            // 连续 ≥5 次完全无工具操作时，自动将积压最久的阻塞任务批量 reset，
            // 避免系统陷入无限「再次心跳→再次只汇报」死循环
            const NO_ACTION_CIRCUIT_BREAKER = 5;
            if (noActionCount >= NO_ACTION_CIRCUIT_BREAKER) {
              void (async () => {
                try {
                  const { forceResetTask } = await import("../tasks/storage.js");
                  const allBlockedTasks = allBlockedAfterRaw.flat() as Array<{
                    id: string;
                    assigneeId: string;
                    title: string;
                    metadata?: Record<string, unknown>;
                    createdAt?: number;
                  }>;
                  // 取积压最久的前 3 个自动 reset
                  const oldestBlocked = allBlockedTasks
                    .toSorted((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
                    .slice(0, 3);
                  for (const t of oldestBlocked) {
                    await forceResetTask(
                      t.id,
                      "todo",
                      "system:heartbeat-circuit-breaker",
                      `[系统熔断] 主控连续 ${noActionCount} 次无工具操作，系统自动重置以打破死循环`,
                    );
                    log.warn(
                      `heartbeat: [CIRCUIT BREAKER] auto-reset blocked task "${t.id}" after ${noActionCount} consecutive no-action cycles`,
                      { agentId, taskId: t.id, noActionCount },
                    );
                  }
                  // 重置计数，给主控一次干净重来的机会
                  const storeForBreaker = loadSessionStore(storePath);
                  const entryForBreaker = storeForBreaker[sessionKey];
                  storeForBreaker[sessionKey] = { ...entryForBreaker, noActionCount: 0 };
                  await saveSessionStore(storePath, storeForBreaker);
                  // 注入熔断通知
                  const breakerMsg = [
                    `[CIRCUIT BREAKER TRIGGERED] 主控已连续 ${noActionCount} 次心跳无工具操作，系统已自动介入。`,
                    ``,
                    `系统已自动将以下最旧阻塞任务重置为 todo 状态：`,
                    ...oldestBlocked.map((t) => `  - [${t.id}] "${t.title.slice(0, 50)}"`),
                    ``,
                    `无操作计数已重置为 0，请从现在起正常处理任务。`,
                    `⚠️ 若继续只汇报不操作，系统将再次触发熔断并上报日志。`,
                  ].join("\n");
                  enqueueSystemEvent(breakerMsg, {
                    sessionKey: leaderSession,
                    contextKey: `leader:circuit-breaker:${Date.now()}`,
                  });
                } catch (breakerErr) {
                  log.warn(`heartbeat: circuit breaker failed (non-fatal): ${String(breakerErr)}`, {
                    agentId,
                  });
                }
              })();
            }

            requestHeartbeatNow({
              reason: `leader:no-action:enforcement`,
              sessionKey: leaderSession,
              agentId,
              coalesceMs: 3_000,
            });
          } else {
            // 有处理行为 → 重置计数
            try {
              const storeForReset = loadSessionStore(storePath);
              const entryForReset = storeForReset[sessionKey];
              if (entryForReset && (entryForReset as Record<string, unknown>).noActionCount) {
                storeForReset[sessionKey] = { ...entryForReset, noActionCount: 0 };
                await saveSessionStore(storePath, storeForReset);
              }
            } catch {
              // 重置失败不影响主流程
            }
          }
        } catch {
          // 后置检测失败不影响心跳主流程
        }
      })();
    }
    // ────────────────────────────────────────────────────────────────────

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

    // ── 活动感知：heartbeat run 结束后刷新 in-progress 任务的 lastActivityAt ──
    // 业务背景：
    //   agent-task-wake-scheduler.ts 通过检测 lastActivityAt 静默时长来判断任务是否已完成
    //   但未主动调用 task_report_to_supervisor（「自动完成」机制）。
    //   原始逻辑的缺陷：lastActivityAt 只在任务进入 in-progress 时设置一次，
    //   agent 执行过程中调用工具（read_file/write_file 等）不会刷新它，
    //   导致 3 分钟静默窗口在 agent 还在跑 heartbeat 时就触发误判。
    // 修复：每次 heartbeat run 成功完成后（agent 确实在工作），立即刷新该 agent
    //   当前 in-progress 任务的 lastActivityAt，让调度器知道 agent 仍在活跃运行中。
    void (async () => {
      try {
        const { listTasks, updateTask } = await import("../tasks/storage.js");
        const inProgressTasks = await listTasks({
          assigneeId: agentId,
          status: ["in-progress"],
        });
        const now = Date.now();
        for (const task of inProgressTasks) {
          await updateTask(task.id, {
            timeTracking: {
              ...task.timeTracking,
              lastActivityAt: now,
            },
          });
        }
      } catch {
        // 刷新失败不影响 heartbeat 主流程
      }
    })();
    // ─────────────────────────────────────────────────────────────────────

    return { status: "ran", durationMs: Date.now() - startedAt };
  } catch (err) {
    const reason = formatErrorMessage(err);
    // DEBUG: print full stack to locate undefined.config
    if (err instanceof Error && err.stack) {
      log.error(`heartbeat failed stack: ${err.stack}`, { error: reason });
    }

    // ── 限流感知：catch 到 rate_limit 错误时上报全局熔断器 ──
    if (isLikelyRateLimitError(reason)) {
      notifyGlobalRateLimit(agentId);
      log.warn(`heartbeat: rate-limit error caught for agent "${agentId}" — notified global circuit breaker`, { agentId });
    }
    // ─────────────────────────────────────────────────────────────────

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
