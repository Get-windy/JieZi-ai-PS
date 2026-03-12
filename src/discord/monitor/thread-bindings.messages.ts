// 本地覆盖：在上游 thread-bindings.messages.ts 基础上补充 formatThreadBindingTtlLabel
// 上游尚未添加此函数，本地 provider.ts 需要用到

export {
  formatThreadBindingDurationLabel,
  resolveThreadBindingFarewellText,
  resolveThreadBindingIntroText,
  resolveThreadBindingThreadName,
} from "../../../upstream/src/discord/monitor/thread-bindings.messages.js";

import { formatThreadBindingDurationLabel } from "../../../upstream/src/discord/monitor/thread-bindings.messages.js";

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
