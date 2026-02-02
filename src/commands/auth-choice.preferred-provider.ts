import type { AuthChoice } from "./onboard-types.js";

const PREFERRED_PROVIDER_BY_AUTH_CHOICE: Partial<Record<AuthChoice, string>> = {
  oauth: "anthropic",
  "setup-token": "anthropic",
  "claude-cli": "anthropic",
  token: "anthropic",
  apiKey: "anthropic",
  "openai-codex": "openai-codex",
  "codex-cli": "openai-codex",
  chutes: "chutes",
  "openai-api-key": "openai",
  "openrouter-api-key": "openrouter",
  "ai-gateway-api-key": "vercel-ai-gateway",
  "moonshot-api-key": "moonshot",
  "kimi-code-api-key": "kimi-coding",
  "gemini-api-key": "google",
  "google-antigravity": "google-antigravity",
  "google-gemini-cli": "google-gemini-cli",
  "zai-api-key": "zai",
  "xiaomi-api-key": "xiaomi",
  "synthetic-api-key": "synthetic",
  "venice-api-key": "venice",
  "github-copilot": "github-copilot",
  "copilot-proxy": "copilot-proxy",
  "minimax-cloud": "minimax",
  "minimax-api": "minimax",
  "minimax-api-lightning": "minimax",
  minimax: "lmstudio",
  "opencode-zen": "opencode",
  "qwen-portal": "qwen-portal",
  "minimax-portal": "minimax-portal",
  // 国内模型提供商
  "deepseek-api-key": "deepseek",
  "baidu-qianfan-api-key": "baidu",
  "doubao-api-key": "doubao",
  "tencent-hunyuan-api-key": "tencent",
  "xinghuo-api-key": "xinghuo",
  // 国际免费模型
  "siliconflow-api-key": "siliconflow",
  "groq-api-key": "groq",
  "together-ai-api-key": "together-ai",
};

export function resolvePreferredProviderForAuthChoice(choice: AuthChoice): string | undefined {
  return PREFERRED_PROVIDER_BY_AUTH_CHOICE[choice];
}
