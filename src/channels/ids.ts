// 覆盖 upstream/src/channels/ids.ts
// 保持与 src/channels/registry.ts 中 CHAT_CHANNEL_ORDER 一致，
// 并扩展了飞书、钉钉、企业微信等本地化渠道。
export const CHAT_CHANNEL_ORDER = Object.freeze([
  "telegram",
  "whatsapp",
  "discord",
  "irc",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "feishu",
  "dingtalk",
  "wecom",
] as const);

export type ChatChannelId = string;

export const CHANNEL_IDS = CHAT_CHANNEL_ORDER;

const CHAT_CHANNEL_ID_SET = new Set<string>(CHAT_CHANNEL_ORDER);

// 别名映射（可按需扩展）
export const CHAT_CHANNEL_ALIASES: Record<string, ChatChannelId> = Object.freeze({
  "wechat-work": "wecom",
  企业微信: "wecom",
  飞书: "feishu",
  钉钉: "dingtalk",
} as Record<string, ChatChannelId>);

export function listChatChannelAliases(): string[] {
  return Object.keys(CHAT_CHANNEL_ALIASES);
}

export function normalizeChatChannelId(raw?: string | null): ChatChannelId | null {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const resolved = CHAT_CHANNEL_ALIASES[normalized] ?? normalized;
  return CHAT_CHANNEL_ID_SET.has(resolved) ? resolved : null;
}
