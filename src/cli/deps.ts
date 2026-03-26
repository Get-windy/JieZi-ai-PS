import { createOutboundSendDepsFromCliSource } from "../../upstream/src/cli/outbound-send-mapping.js";
import type { OutboundSendDeps } from "../../upstream/src/infra/outbound/send-deps.js";

/**
 * Lazy-loaded per-channel send functions, keyed by channel ID.
 * Values are proxy functions that dynamically import the real module on first use.
 */
export type CliDeps = { [channelId: string]: unknown };

// Per-channel module caches for lazy loading.
const senderCache = new Map<string, Promise<Record<string, unknown>>>();

/**
 * Create a lazy-loading send function proxy for a channel.
 * The channel's module is loaded on first call and cached for reuse.
 */
function createLazySender(
  channelId: string,
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    let cached = senderCache.get(channelId);
    if (!cached) {
      cached = loader();
      senderCache.set(channelId, cached);
    }
    const mod = await cached;
    const fn = mod[exportName] as (...a: unknown[]) => Promise<unknown>;
    return await fn(...args);
  };
}

export function createDefaultDeps(): CliDeps {
  return {
    whatsapp: createLazySender(
      "whatsapp",
      () => import("../channels/web/index.js") as Promise<Record<string, unknown>>,
      "sendMessageWhatsApp",
    ),
    telegram: createLazySender(
      "telegram",
      () =>
        import("../../upstream/extensions/telegram/src/send.js") as Promise<
          Record<string, unknown>
        >,
      "sendMessageTelegram",
    ),
    discord: createLazySender(
      "discord",
      () =>
        import("../../upstream/extensions/discord/src/send.js") as Promise<Record<string, unknown>>,
      "sendMessageDiscord",
    ),
    slack: createLazySender(
      "slack",
      () =>
        import("../../upstream/extensions/slack/src/send.js") as Promise<Record<string, unknown>>,
      "sendMessageSlack",
    ),
    signal: createLazySender(
      "signal",
      () =>
        import("../../upstream/extensions/signal/src/send.js") as Promise<Record<string, unknown>>,
      "sendMessageSignal",
    ),
    imessage: createLazySender(
      "imessage",
      () =>
        import("../../upstream/extensions/imessage/src/send.js") as Promise<
          Record<string, unknown>
        >,
      "sendMessageIMessage",
    ),
  };
}

export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return createOutboundSendDepsFromCliSource(deps);
}

// Lazy re-export: avoid static top-level import of auth-store which triggers
// WA_WEB_AUTH_DIR = resolveDefaultWebAuthDir() at module init time, causing
// CONFIG_DIR TDZ when deps.ts is pulled in by memory-core or other plugin tools.
export async function logWebSelfId(
  ...args: Parameters<
    (typeof import("../../upstream/extensions/whatsapp/src/auth-store.js"))["logWebSelfId"]
  >
): Promise<void> {
  const { logWebSelfId: impl } =
    await import("../../upstream/extensions/whatsapp/src/auth-store.js");
  impl(...args);
}
