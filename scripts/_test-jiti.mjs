import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const jitiModule = require("../node_modules/.pnpm/jiti@2.6.1/node_modules/jiti/dist/jiti.cjs");
const createJiti =
  typeof jitiModule === "function" ? jitiModule : (jitiModule.createJiti ?? jitiModule.default);

const alias = {
  "openclaw/plugin-sdk/cli-backend": "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/cli-backend.ts",
  "openclaw/plugin-sdk/cli-runtime": "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/cli-runtime.ts",
  "openclaw/plugin-sdk/provider-auth-api-key":
    "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/provider-auth-api-key.ts",
  "openclaw/plugin-sdk/provider-model-shared":
    "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/provider-model-shared.ts",
  "openclaw/plugin-sdk/provider-usage":
    "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/provider-usage.ts",
  "openclaw/plugin-sdk/provider-stream":
    "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/provider-stream.ts",
  "openclaw/plugin-sdk/plugin-entry":
    "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/plugin-entry.ts",
  "openclaw/plugin-sdk/provider-auth":
    "I:/JieZI/JieZi-ai-PS/upstream/src/plugin-sdk/provider-auth.ts",
};

const j = createJiti(import.meta.url, {
  interopDefault: true,
  tryNative: false,
  extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
  alias,
});

try {
  const cb = j("I:/JieZI/JieZi-ai-PS/upstream/extensions/anthropic/cli-backend.ts");
  console.log("buildAnthropicCliBackend:", typeof cb.buildAnthropicCliBackend);
} catch (e) {
  console.error("FAIL loading cli-backend.ts:", e.message.slice(0, 400));
}

try {
  const rr = j("I:/JieZI/JieZi-ai-PS/upstream/extensions/anthropic/register.runtime.ts");
  console.log("register.runtime exports:", Object.keys(rr).join(", "));
  console.log("registerAnthropicPlugin:", typeof rr.registerAnthropicPlugin);
} catch (e) {
  console.error("FAIL loading register.runtime.ts:", e.message.slice(0, 400));
}
