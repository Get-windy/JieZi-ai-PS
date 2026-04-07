// 覆盖 upstream/src/plugin-sdk/index.ts
// 先 re-export 上游所有导出，再追加本地新增导出

export * from "../../upstream/src/plugin-sdk/index.js";

// TTS Schema（本地定义，上游 plugin-sdk 未导出，extensions/voice-call 需要通过 openclaw/plugin-sdk 访问）
export {
  TtsAutoSchema,
  TtsConfigSchema,
  TtsModeSchema,
  TtsProviderSchema,
} from "../config/zod-schema.core.js";
