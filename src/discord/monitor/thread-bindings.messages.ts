// 本地覆盖：在上游 thread-bindings.messages.ts 基础上补充 formatThreadBindingTtlLabel
// 上游尚未添加此函数，本地 provider.ts 需要用到

import { prefixSystemMessage } from "../../infra/system-message.js";

function normalizeThreadBindingDurationMs(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 0;
  }
  const durationMs = Math.floor(raw);
  if (durationMs < 0) {
    return 0;
  }
  return durationMs;
}

export function formatThreadBindingDurationLabel(durationMs: number): string {
  if (durationMs <= 0) {
    return "disabled";
  }
  if (durationMs < 60_000) {
    return "<1m";
  }
  const totalMinutes = Math.floor(durationMs / 60_000);
  if (totalMinutes % 60 === 0) {
    return `${Math.floor(totalMinutes / 60)}h`;
  }
  return `${totalMinutes}m`;
}

export function resolveThreadBindingThreadName(params: {
  agentId?: string;
  label?: string;
}): string {
  const label = params.label?.trim();
  const base = label || params.agentId?.trim() || "agent";
  const raw = `🤖 ${base}`.replace(/\s+/g, " ").trim();
  return raw.slice(0, 100);
}

export function resolveThreadBindingIntroText(params: {
  agentId?: string;
  label?: string;
  idleTimeoutMs?: number;
  maxAgeMs?: number;
  sessionCwd?: string;
  sessionDetails?: string[];
}): string {
  const label = params.label?.trim();
  const base = label || params.agentId?.trim() || "agent";
  const normalized = base.replace(/\s+/g, " ").trim().slice(0, 100) || "agent";
  const idleTimeoutMs = normalizeThreadBindingDurationMs(params.idleTimeoutMs);
  const maxAgeMs = normalizeThreadBindingDurationMs(params.maxAgeMs);
  const cwd = params.sessionCwd?.trim();
  const details = (params.sessionDetails ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (cwd) {
    details.unshift(`cwd: ${cwd}`);
  }

  const lifecycle: string[] = [];
  if (idleTimeoutMs > 0) {
    lifecycle.push(
      `idle auto-unfocus after ${formatThreadBindingDurationLabel(idleTimeoutMs)} inactivity`,
    );
  }
  if (maxAgeMs > 0) {
    lifecycle.push(`max age ${formatThreadBindingDurationLabel(maxAgeMs)}`);
  }

  const intro =
    lifecycle.length > 0
      ? `${normalized} session active (${lifecycle.join("; ")}). Messages here go directly to this session.`
      : `${normalized} session active. Messages here go directly to this session.`;

  if (details.length === 0) {
    return prefixSystemMessage(intro);
  }
  return prefixSystemMessage(`${intro}\n${details.join("\n")}`);
}

export function resolveThreadBindingFarewellText(params: {
  reason?: string;
  farewellText?: string;
  idleTimeoutMs: number;
  maxAgeMs: number;
}): string {
  const custom = params.farewellText?.trim();
  if (custom) {
    return prefixSystemMessage(custom);
  }

  if (params.reason === "idle-expired") {
    const label = formatThreadBindingDurationLabel(
      normalizeThreadBindingDurationMs(params.idleTimeoutMs),
    );
    return prefixSystemMessage(
      `Session ended automatically after ${label} of inactivity. Messages here will no longer be routed.`,
    );
  }

  if (params.reason === "max-age-expired") {
    const label = formatThreadBindingDurationLabel(
      normalizeThreadBindingDurationMs(params.maxAgeMs),
    );
    return prefixSystemMessage(
      `Session ended automatically at max age of ${label}. Messages here will no longer be routed.`,
    );
  }

  return prefixSystemMessage("Session ended. Messages here will no longer be routed.");
}

/**
 * Format a TTL (time-to-live) duration in milliseconds as a human-readable label.
 * Returns "disabled" if ttlMs is zero or negative.
 */
export function formatThreadBindingTtlLabel(ttlMs: number): string {
  if (!ttlMs || ttlMs <= 0) {
    return "disabled";
  }
  return formatThreadBindingDurationLabel(ttlMs);
}
