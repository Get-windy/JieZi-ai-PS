import { type OpenClawConfig } from "openclaw/plugin-sdk/provider-onboard";

export {
  VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
  applyVercelAiGatewayConfig,
} from "../../../upstream/extensions/vercel-ai-gateway/onboard.js";

export function applyVercelAiGatewayProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF] = {
    ...models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF],
    alias: models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF]?.alias ?? "Vercel AI Gateway",
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
  };
}