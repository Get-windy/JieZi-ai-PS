// 覆盖 upstream/src/channels/chat-meta.ts
// upstream 版本通过 listBundledPluginMetadata 动态扫描 extensions 目录，
// 要求每个 CHAT_CHANNEL_ORDER 中的 ID 都有对应的 bundled plugin metadata。
// 本项目扩展了 dingtalk、wecom 等本地化渠道，没有对应的 upstream extension，
// 因此覆盖此文件，直接从 registry.ts 的静态定义提供数据，绕过动态扫描。
export {
  CHAT_CHANNEL_ALIASES,
  type ChatChannelMeta,
  getChatChannelMeta,
  listChatChannelAliases,
  listChatChannels,
  normalizeChatChannelId,
} from "./registry.js";
