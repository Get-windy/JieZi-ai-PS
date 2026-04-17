/**
 * Context warning module — P2 feature
 *
 * Renders a warning bar when the chat context window usage is high.
 * Includes recovery guidance hints and auto-compact trigger.
 * Designed to be called from the main chat view.
 */
import { html, nothing } from "lit";
import { t } from "../i18n.ts";

export type ContextUsageInfo = {
  /** Current token count used in context */
  usedTokens: number;
  /** Maximum context window size */
  maxTokens: number;
};

/**
 * Compute usage ratio.
 * Returns a value between 0 and 1.
 */
function usageRatio(info: ContextUsageInfo): number {
  if (info.maxTokens <= 0) {
    return 0;
  }
  return Math.min(info.usedTokens / info.maxTokens, 1);
}

/** Export for external access (e.g. /status command) */
export function getUsageRatio(info: ContextUsageInfo | null | undefined): number {
  if (!info || info.maxTokens <= 0) {
    return 0;
  }
  return usageRatio(info);
}

/**
 * Determine warning level based on usage:
 * - "none" — below 85%
 * - "warn" — 85-95%
 * - "danger" — above 95%
 */
function warningLevel(info: ContextUsageInfo): "none" | "warn" | "danger" {
  const ratio = usageRatio(info);
  if (ratio >= 0.95) {
    return "danger";
  }
  if (ratio >= 0.85) {
    return "warn";
  }
  return "none";
}

/* ---------- Auto-compact state ---------- */
const AUTO_COMPACT_THRESHOLD = 0.9;
const AUTO_COMPACT_COOLDOWN_MS = 60_000; // 1 min cooldown
let _autoCompactFiredAt = 0;

/**
 * Render context usage warning bar.
 * Returns `nothing` when usage is below warning threshold.
 *
 * @param onAutoCompact — if provided, will be called (once, with cooldown)
 *   when usage ratio exceeds AUTO_COMPACT_THRESHOLD (90%).
 */
export function renderContextWarning(
  info: ContextUsageInfo | null | undefined,
  onAutoCompact?: () => void,
) {
  if (!info || info.maxTokens <= 0) {
    return nothing;
  }

  const level = warningLevel(info);
  const ratio = usageRatio(info);

  // Auto-compact trigger (side-effect, but deferred via setTimeout)
  if (onAutoCompact && ratio >= AUTO_COMPACT_THRESHOLD) {
    const now = Date.now();
    if (now - _autoCompactFiredAt > AUTO_COMPACT_COOLDOWN_MS) {
      _autoCompactFiredAt = now;
      setTimeout(() => onAutoCompact(), 0);
    }
  }
  // Reset cooldown once usage drops below threshold (after compaction completes)
  if (ratio < AUTO_COMPACT_THRESHOLD) {
    _autoCompactFiredAt = 0;
  }

  if (level === "none") {
    return nothing;
  }

  const pct = Math.round(ratio * 100);
  const usedK = Math.round(info.usedTokens / 1000);
  const maxK = Math.round(info.maxTokens / 1000);

  const hintKey = level === "danger" ? "chat.context.danger_hint" : "chat.context.warn_hint";

  return html`
    <div class="context-warning context-warning--${level}" role="status" aria-live="polite">
      <div class="context-warning__bar">
        <div
          class="context-warning__fill context-warning__fill--${level}"
          style="width: ${pct}%"
        ></div>
      </div>
      <div class="context-warning__body">
        <span class="context-warning__text">
          ${level === "danger"
            ? t("chat.context.danger", { pct, used: usedK, max: maxK })
            : t("chat.context.warn", { pct, used: usedK, max: maxK })}
        </span>
        <span class="context-warning__hint">${t(hintKey)}</span>
      </div>
    </div>
  `;
}

/**
 * PinchChat-style context token progress bar.
 * Always rendered (unlike renderContextWarning which only shows above 85%).
 * Provides a subtle thin bar at the top of the compose area with
 * colour coding: green → yellow (>60%) → orange (>80%) → red (>92%).
 */
export function renderTokenProgressBar(info: ContextUsageInfo | null | undefined) {
  if (!info || info.maxTokens <= 0) {
    return nothing;
  }
  const ratio = Math.min(info.usedTokens / info.maxTokens, 1);
  const pct = Math.round(ratio * 100);
  const usedK = (info.usedTokens / 1000).toFixed(1);
  const maxK = (info.maxTokens / 1000).toFixed(0);

  // Colour logic: matches PinchChat Header.tsx token bar thresholds
  const colorClass =
    ratio >= 0.92
      ? "ctx-bar--danger"
      : ratio >= 0.8
        ? "ctx-bar--warn"
        : ratio >= 0.6
          ? "ctx-bar--mid"
          : "ctx-bar--ok";

  return html`
    <div
      class="chat-ctx-bar"
      title="Context: ${usedK}k / ${maxK}k tokens (${pct}%)"
      aria-label="Context usage ${pct} percent"
      role="progressbar"
      aria-valuenow=${pct}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="chat-ctx-bar__track">
        <div class="chat-ctx-bar__fill ${colorClass}" style="width:${pct}%"></div>
      </div>
      <span class="chat-ctx-bar__label">${pct}% ctx</span>
    </div>
  `;
}
