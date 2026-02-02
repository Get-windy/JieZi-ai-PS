import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { loginQwenPortalOAuth } from "./oauth.js";
import { t } from "../../src/i18n/index.js";

const PROVIDER_ID = "qwen-portal";
const PROVIDER_LABEL = "Qwen";
const DEFAULT_MODEL = "qwen-portal/coder-model";
const DEFAULT_BASE_URL = "https://portal.qwen.ai/v1";
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;
const OAUTH_PLACEHOLDER = "qwen-oauth";

function normalizeBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_BASE_URL;
  const withProtocol = raw.startsWith("http") ? raw : `https://${raw}`;
  return withProtocol.endsWith("/v1") ? withProtocol : `${withProtocol.replace(/\/+$/, "")}/v1`;
}

function buildModelDefinition(params: {
  id: string;
  name: string;
  input: Array<"text" | "image">;
}) {
  return {
    id: params.id,
    name: params.name,
    reasoning: false,
    input: params.input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

const qwenPortalPlugin = {
  id: "qwen-portal-auth",
  name: "Qwen OAuth",
  description: "OAuth flow for Qwen (free-tier) models",
  configSchema: emptyPluginConfigSchema(),
  register(api) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      docsPath: "/providers/qwen",
      aliases: ["qwen"],
      auth: [
        {
          id: "device",
          label: "Qwen OAuth",
          hint: "Device code login",
          kind: "device_code",
          run: async (ctx) => {
            const progress = ctx.prompter.progress(t('wizard.oauth.qwen.starting'));
            try {
              const result = await loginQwenPortalOAuth({
                openUrl: ctx.openUrl,
                note: ctx.prompter.note,
                progress,
              });

              progress.stop(t('wizard.oauth.qwen.complete'));

              const profileId = `${PROVIDER_ID}:default`;
              const baseUrl = normalizeBaseUrl(result.resourceUrl);

              return {
                profiles: [
                  {
                    profileId,
                    credential: {
                      type: "oauth",
                      provider: PROVIDER_ID,
                      access: result.access,
                      refresh: result.refresh,
                      expires: result.expires,
                    },
                  },
                ],
                configPatch: {
                  models: {
                    providers: {
                      [PROVIDER_ID]: {
                        baseUrl,
                        apiKey: OAUTH_PLACEHOLDER,
                        api: "openai-completions",
                        models: [
                          buildModelDefinition({
                            id: "coder-model",
                            name: "Qwen Coder",
                            input: ["text"],
                          }),
                          buildModelDefinition({
                            id: "vision-model",
                            name: "Qwen Vision",
                            input: ["text", "image"],
                          }),
                        ],
                      },
                    },
                  },
                  agents: {
                    defaults: {
                      models: {
                        "qwen-portal/coder-model": { alias: "qwen" },
                        "qwen-portal/vision-model": {},
                      },
                    },
                  },
                },
                defaultModel: DEFAULT_MODEL,
                notes: [
                  t('wizard.oauth.qwen.tokens_refresh'),
                  t('wizard.oauth.qwen.base_url_override')
                    .replace('{url}', DEFAULT_BASE_URL)
                    .replace('{provider}', PROVIDER_ID),
                ],
              };
            } catch (err) {
              progress.stop(t('wizard.oauth.qwen.failed'));
              await ctx.prompter.note(
                "If OAuth fails, verify your Qwen account has portal access and try again.",
                t('wizard.oauth.qwen.title'),
              );
              throw err;
            }
          },
        },
      ],
    });
  },
};

export default qwenPortalPlugin;
