// 覆盖 upstream/src/channels/ids.ts
// 保持与 src/channels/registry.ts 中 CHAT_CHANNEL_ORDER 一致，
// 并扩展了飞书、钉钉、企业微信等本地化渠道。
export const CHAT_CHANNEL_ORDER = [
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
] as const;

export type ChatChannelId = (typeof CHAT_CHANNEL_ORDER)[number];

export const CHANNEL_IDS = [...CHAT_CHANNEL_ORDER] as const;
