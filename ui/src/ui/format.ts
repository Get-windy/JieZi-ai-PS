import { stripReasoningTagsFromText } from "../../../src/shared/text/reasoning-tags.js";

/**
 * 获取用户设置的时区（从 localStorage）
 */
function getUserTimezone(): string {
  try {
    const settings = localStorage.getItem("openclaw.control.settings.v1");
    if (settings) {
      const parsed = JSON.parse(settings);
      if (parsed.timezone && parsed.timezone !== "auto") {
        return parsed.timezone;
      }
    }
  } catch {
    // 忽略错误，使用默认值
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatMs(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return "n/a";
  }
  const timezone = getUserTimezone();
  try {
    return new Date(ms).toLocaleString(undefined, {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    // 如果时区无效，回退到默认
    return new Date(ms).toLocaleString();
  }
}

export function formatAgo(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return "n/a";
  }
  const diff = Date.now() - ms;
  const absDiff = Math.abs(diff);
  const suffix = diff < 0 ? "from now" : "ago";
  const sec = Math.round(absDiff / 1000);
  if (sec < 60) {
    return diff < 0 ? "just now" : `${sec}s ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m ${suffix}`;
  }
  const hr = Math.round(min / 60);
  if (hr < 48) {
    return `${hr}h ${suffix}`;
  }
  const day = Math.round(hr / 24);
  return `${day}d ${suffix}`;
}

export function formatDurationMs(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return "n/a";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.round(min / 60);
  if (hr < 48) {
    return `${hr}h`;
  }
  const day = Math.round(hr / 24);
  return `${day}d`;
}

export function formatList(values?: Array<string | null | undefined>): string {
  if (!values || values.length === 0) {
    return "none";
  }
  return values.filter((v): v is string => Boolean(v && v.trim())).join(", ");
}

export function clampText(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function truncateText(
  value: string,
  max: number,
): {
  text: string;
  truncated: boolean;
  total: number;
} {
  if (value.length <= max) {
    return { text: value, truncated: false, total: value.length };
  }
  return {
    text: value.slice(0, Math.max(0, max)),
    truncated: true,
    total: value.length,
  };
}

export function toNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function stripThinkingTags(value: string): string {
  return stripReasoningTagsFromText(value, { mode: "preserve", trim: "start" });
}
