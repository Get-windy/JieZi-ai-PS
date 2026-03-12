// Talk 协议配置模块 - 本地扩展 + 上游完整重构
export {
  DEFAULT_TALK_PROVIDER,
  normalizeTalkConfig,
  normalizeTalkSection,
  resolveActiveTalkProviderConfig,
  buildTalkConfigResponse,
  readTalkApiKeyFromProfile,
  resolveTalkApiKey,
} from "@upstream/config/talk.js";
