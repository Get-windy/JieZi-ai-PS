type LegacyOutboundSendDeps = {
  sendWhatsApp?: unknown;
  sendTelegram?: unknown;
  sendDiscord?: unknown;
  sendSlack?: unknown;
  sendSignal?: unknown;
  sendIMessage?: unknown;
  sendMatrix?: unknown;
  sendMSTeams?: unknown;
};

/**
 * Dynamic bag of per-channel send functions, keyed by channel ID.
 * Each outbound adapter resolves its own function from this record and
 * falls back to a direct import when the key is absent.
 */
export type OutboundSendDeps = LegacyOutboundSendDeps & { [channelId: string]: unknown };

const LEGACY_SEND_DEP_KEYS = {
  whatsapp: "sendWhatsApp",
  telegram: "sendTelegram",
  discord: "sendDiscord",
  slack: "sendSlack",
  signal: "sendSignal",
  imessage: "sendIMessage",
  matrix: "sendMatrix",
  msteams: "sendMSTeams",
} as const satisfies Record<string, keyof LegacyOutboundSendDeps>;

export function resolveOutboundSendDep<T>(
  deps: OutboundSendDeps | null | undefined,
  channelId: keyof typeof LEGACY_SEND_DEP_KEYS,
): T | undefined {
  const dynamic = deps?.[channelId];
  if (dynamic !== undefined) {
    return dynamic as T;
  }
  const legacyKey = LEGACY_SEND_DEP_KEYS[channelId];
  const legacy = deps?.[legacyKey];
  return legacy as T | undefined;
}

export function resolveLegacyOutboundSendDepKeys(channelId: string): string[] {
  const compact = channelId.replace(/[^a-z0-9]+/gi, "");
  if (!compact) {
    return [];
  }
  const pascal = compact.charAt(0).toUpperCase() + compact.slice(1);
  const keys = new Set<string>();
  keys.add(`send${pascal}`);
  if (pascal.startsWith("I") && pascal.length > 1) {
    keys.add(`sendI${pascal.slice(1)}`);
  }
  if (pascal.startsWith("Ms") && pascal.length > 2) {
    keys.add(`sendMS${pascal.slice(2)}`);
  }
  return [...keys];
}
