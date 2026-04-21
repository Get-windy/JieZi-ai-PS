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

// HTTP body helpers（extensions/voice-call 通过 openclaw/plugin-sdk 引用）
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "../../upstream/src/infra/http-body.js";

// Diagnostics helpers（extensions/diagnostics-otel 通过 openclaw/plugin-sdk 引用）
export { redactSensitiveText } from "../../upstream/src/logging/redact.js";
export { registerLogTransport } from "../../upstream/src/logging/logger.js";

// Device pairing helpers（extensions/device-pair 通过 openclaw/plugin-sdk 引用）
export { approveDevicePairing, listDevicePairing } from "../../upstream/src/infra/device-pairing.js";

// OAuth provider auth result（extensions/google-gemini-cli-auth 通过 openclaw/plugin-sdk 引用）
export { buildOauthProviderAuthResult } from "../../upstream/src/plugin-sdk/provider-auth-result.js";

// WSL2 detection（extensions/google-gemini-cli-auth 通过 openclaw/plugin-sdk 引用）
export { isWSL2Sync } from "../../upstream/src/infra/wsl.js";

// sleep utility（extensions/voice-call 通过 openclaw/plugin-sdk 引用）
export { sleep } from "../../upstream/src/utils.js";
