/**
 * Re-exports auth credential storage helpers from the commands layer.
 * Provides a stable plugin-facing API for setting provider credentials.
 */

export {
  setCloudflareAiGatewayConfig,
  setLitellmApiKey,
} from "../commands/onboard-auth.credentials.js";
