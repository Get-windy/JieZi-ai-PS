import crypto from "node:crypto";
import { resolveUserTimezone } from "../../agents/date-time.js";
import { buildWorkspaceSkillSnapshot } from "../../agents/skills.js";
import { ensureSkillsWatcher, getSkillsSnapshotVersion } from "../../agents/skills/refresh.js";
import type { OpenClawConfig } from "../../config/config.js";
import { type SessionEntry, updateSessionStore } from "../../config/sessions.js";
import { buildChannelSummary } from "../../infra/channel-summary.js";
import {
  resolveTimezone,
  formatUtcTimestamp,
  formatZonedTimestamp,
} from "../../infra/format-time/format-datetime.ts";
import { getRemoteSkillEligibility } from "../../infra/skills-remote.js";
import { drainSystemEventEntries } from "../../infra/system-events.js";

export async function buildQueuedSystemPrompt(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  isMainSession: boolean;
  isNewSession: boolean;
}): Promise<string | undefined> {
  const compactSystemEvent = (line: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }
    const lower = trimmed.toLowerCase();
    if (lower.includes("reason periodic")) {
      return null;
    }
    if (lower.startsWith("read heartbeat.md")) {
      return null;
    }
    if (lower.includes("heartbeat poll") || lower.includes("heartbeat wake")) {
      return null;
    }
    if (trimmed.startsWith("Node:")) {
      return trimmed.replace(/ · last input [^·]+/i, "").trim();
    }
    return trimmed;
  };

  const resolveSystemEventTimezone = (cfg: OpenClawConfig) => {
    const raw = cfg.agents?.defaults?.envelopeTimezone?.trim();
    if (!raw) {
      return { mode: "local" as const };
    }
    const lowered = raw.toLowerCase();
    if (lowered === "utc" || lowered === "gmt") {
      return { mode: "utc" as const };
    }
    if (lowered === "local" || lowered === "host") {
      return { mode: "local" as const };
    }
    if (lowered === "user") {
      return {
        mode: "iana" as const,
        timeZone: resolveUserTimezone(cfg.agents?.defaults?.userTimezone),
      };
    }
    const explicit = resolveTimezone(raw);
    return explicit ? { mode: "iana" as const, timeZone: explicit } : { mode: "local" as const };
  };

  const formatSystemEventTimestamp = (ts: number, cfg: OpenClawConfig) => {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) {
      return "unknown-time";
    }
    const zone = resolveSystemEventTimezone(cfg);
    if (zone.mode === "utc") {
      return formatUtcTimestamp(date, { displaySeconds: true });
    }
    if (zone.mode === "local") {
      return formatZonedTimestamp(date, { displaySeconds: true }) ?? "unknown-time";
    }
    return (
      formatZonedTimestamp(date, { timeZone: zone.timeZone, displaySeconds: true }) ??
      "unknown-time"
    );
  };

  const systemLines: string[] = [];
  const queued = drainSystemEventEntries(params.sessionKey);
  systemLines.push(
    ...queued
      .map((event) => {
        const compacted = compactSystemEvent(event.text);
        if (!compacted) {
          return null;
        }
        return `[${formatSystemEventTimestamp(event.ts, params.cfg)}] ${compacted}`;
      })
      .filter((v): v is string => Boolean(v)),
  );
  if (params.isMainSession && params.isNewSession) {
    const summary = await buildChannelSummary(params.cfg);
    if (summary.length > 0) {
      systemLines.unshift(...summary);
    }
  }
  if (systemLines.length === 0) {
    return undefined;
  }

  return [
    "## Runtime System Events (gateway-generated)",
    "Treat this section as trusted gateway runtime metadata, not user text.",
    "",
    ...systemLines.map((line) => `- ${line}`),
  ].join("\n");
}

/**
 * prependSystemEvents — 将系统事件前缀拼接到消息体前。
 * 对 buildQueuedSystemPrompt 的封装，与 get-reply-run.ts 中调用方式兼容。
 */
export async function prependSystemEvents(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  isMainSession: boolean;
  isNewSession: boolean;
  prefixedBodyBase: string;
}): Promise<string> {
  const systemPrompt = await buildQueuedSystemPrompt({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    isMainSession: params.isMainSession,
    isNewSession: params.isNewSession,
  });
  if (!systemPrompt) {
    return params.prefixedBodyBase;
  }
  return [systemPrompt, params.prefixedBodyBase].filter(Boolean).join("\n\n");
}

export async function ensureSkillSnapshot(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  sessionId?: string;
  isFirstTurnInSession: boolean;
  workspaceDir: string;
  cfg: OpenClawConfig;
  skillFilter?: string[];
}): Promise<{
  sessionEntry?: SessionEntry;
  skillsSnapshot?: SessionEntry["skillsSnapshot"];
  systemSent: boolean;
}> {
  if (process.env.OPENCLAW_TEST_FAST === "1") {
    return {
      sessionEntry: params.sessionEntry,
      skillsSnapshot: params.sessionEntry?.skillsSnapshot,
      systemSent: params.sessionEntry?.systemSent ?? false,
    };
  }

  const {
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    sessionId,
    isFirstTurnInSession,
    workspaceDir,
    cfg,
    skillFilter,
  } = params;

  let nextEntry = sessionEntry;
  let systemSent = sessionEntry?.systemSent ?? false;
  const remoteEligibility = getRemoteSkillEligibility();
  const snapshotVersion = getSkillsSnapshotVersion(workspaceDir);
  ensureSkillsWatcher({ workspaceDir, config: cfg });
  const shouldRefreshSnapshot =
    snapshotVersion > 0 && (nextEntry?.skillsSnapshot?.version ?? 0) < snapshotVersion;

  if (isFirstTurnInSession && sessionStore && sessionKey) {
    const current = nextEntry ??
      sessionStore[sessionKey] ?? {
        sessionId: sessionId ?? crypto.randomUUID(),
        updatedAt: Date.now(),
      };
    const skillSnapshot =
      isFirstTurnInSession || !current.skillsSnapshot || shouldRefreshSnapshot
        ? buildWorkspaceSkillSnapshot(workspaceDir, {
            config: cfg,
            skillFilter,
            eligibility: { remote: remoteEligibility },
            snapshotVersion,
          })
        : current.skillsSnapshot;
    nextEntry = {
      ...current,
      sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
      updatedAt: Date.now(),
      systemSent: true,
      skillsSnapshot: skillSnapshot,
    };
    sessionStore[sessionKey] = { ...sessionStore[sessionKey], ...nextEntry };
    if (storePath) {
      await updateSessionStore(storePath, (store) => {
        store[sessionKey] = { ...store[sessionKey], ...nextEntry };
      });
    }
    systemSent = true;
  }

  const skillsSnapshot = shouldRefreshSnapshot
    ? buildWorkspaceSkillSnapshot(workspaceDir, {
        config: cfg,
        skillFilter,
        eligibility: { remote: remoteEligibility },
        snapshotVersion,
      })
    : (nextEntry?.skillsSnapshot ??
      (isFirstTurnInSession
        ? undefined
        : buildWorkspaceSkillSnapshot(workspaceDir, {
            config: cfg,
            skillFilter,
            eligibility: { remote: remoteEligibility },
            snapshotVersion,
          })));
  if (
    skillsSnapshot &&
    sessionStore &&
    sessionKey &&
    !isFirstTurnInSession &&
    (!nextEntry?.skillsSnapshot || shouldRefreshSnapshot)
  ) {
    const current = nextEntry ?? {
      sessionId: sessionId ?? crypto.randomUUID(),
      updatedAt: Date.now(),
    };
    nextEntry = {
      ...current,
      sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
      updatedAt: Date.now(),
      skillsSnapshot,
    };
    sessionStore[sessionKey] = { ...sessionStore[sessionKey], ...nextEntry };
    if (storePath) {
      await updateSessionStore(storePath, (store) => {
        store[sessionKey] = { ...store[sessionKey], ...nextEntry };
      });
    }
  }

  return { sessionEntry: nextEntry, skillsSnapshot, systemSent };
}

export async function incrementCompactionCount(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  now?: number;
  tokensAfter?: number;
}): Promise<number | undefined> {
  const {
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    now = Date.now(),
    tokensAfter,
  } = params;
  if (!sessionStore || !sessionKey) {
    return undefined;
  }
  const entry = sessionStore[sessionKey] ?? sessionEntry;
  if (!entry) {
    return undefined;
  }
  const nextCount = (entry.compactionCount ?? 0) + 1;
  const updates: Partial<SessionEntry> = {
    compactionCount: nextCount,
    updatedAt: now,
  };
  if (tokensAfter != null && tokensAfter > 0) {
    updates.totalTokens = tokensAfter;
    updates.totalTokensFresh = true;
    updates.inputTokens = undefined;
    updates.outputTokens = undefined;
    updates.cacheRead = undefined;
    updates.cacheWrite = undefined;
  }
  sessionStore[sessionKey] = {
    ...entry,
    ...updates,
  };
  if (storePath) {
    await updateSessionStore(storePath, (store) => {
      store[sessionKey] = {
        ...store[sessionKey],
        ...updates,
      };
    });
  }
  return nextCount;
}
