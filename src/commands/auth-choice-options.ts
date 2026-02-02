import type { AuthProfileStore } from "../agents/auth-profiles.js";
import type { AuthChoice } from "./onboard-types.js";

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
};

export type AuthChoiceGroupId =
  | "openai"
  | "anthropic"
  | "google"
  | "copilot"
  | "openrouter"
  | "ai-gateway"
  | "moonshot"
  | "zai"
  | "xiaomi"
  | "opencode-zen"
  | "minimax"
  | "synthetic"
  | "venice"
  | "qwen"
  // 国内新增提供商
  | "deepseek"
  | "baidu"
  | "tencent"
  | "doubao"
  | "xinghuo"
  // 国际免费模型
  | "siliconflow"
  | "groq"
  | "together-ai";

export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

const AUTH_CHOICE_GROUP_DEFS: {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  choices: AuthChoice[];
}[] = [
  // 国内模型优先
  {
    value: "deepseek",
    label: "DeepSeek（深度求索）",
    hint: "开源高性能，OpenAI 兼容",
    choices: ["deepseek-api-key"],
  },
  {
    value: "qwen",
    label: "Qwen（通义千问）",
    hint: "免费 OAuth 额度",
    choices: ["qwen-portal"],
  },
  {
    value: "baidu",
    label: "百度文心一言（ERNIE）",
    hint: "千帆大模型平台",
    choices: ["baidu-qianfan-api-key"],
  },
  {
    value: "tencent",
    label: "腾讯混元（Hunyuan）",
    hint: "腾讯云大模型",
    choices: ["tencent-hunyuan-api-key"],
  },
  {
    value: "doubao",
    label: "字节豆包（Doubao）",
    hint: "火山引擎大模型",
    choices: ["doubao-api-key"],
  },
  {
    value: "xinghuo",
    label: "讯飞星火（Spark）",
    hint: "科大讯飞认知大模型",
    choices: ["xinghuo-api-key"],
  },
  // 国际免费模型优先
  {
    value: "siliconflow",
    label: "SiliconFlow（硅基流动）",
    hint: "注册送2000万Tokens，多模型免费",
    choices: ["siliconflow-api-key"],
  },
  {
    value: "groq",
    label: "Groq",
    hint: "超快推理速度，免费访问",
    choices: ["groq-api-key"],
  },
  {
    value: "together-ai",
    label: "Together AI",
    hint: "免费模型访问",
    choices: ["together-ai-api-key"],
  },
  {
    value: "minimax",
    label: "MiniMax（海螺AI）",
    hint: "M2.1 推荐",
    choices: ["minimax-portal", "minimax-api", "minimax-api-lightning"],
  },
  {
    value: "moonshot",
    label: "Moonshot AI（月之暗面/Kimi）",
    hint: "Kimi K2 + Kimi Coding",
    choices: ["moonshot-api-key", "kimi-code-api-key"],
  },
  {
    value: "zai",
    label: "Z.AI（智谱GLM）",
    hint: "GLM 4.7 API key",
    choices: ["zai-api-key"],
  },
  {
    value: "xiaomi",
    label: "Xiaomi（小米大模型）",
    hint: "API key",
    choices: ["xiaomi-api-key"],
  },
  // 国际模型
  {
    value: "anthropic",
    label: "Anthropic（Claude）",
    hint: "setup-token + API key",
    choices: ["token", "apiKey"],
  },
  {
    value: "openai",
    label: "OpenAI（ChatGPT）",
    hint: "Codex OAuth + API key",
    choices: ["openai-codex", "openai-api-key"],
  },
  {
    value: "google",
    label: "Google（Gemini）",
    hint: "API key + OAuth",
    choices: ["gemini-api-key", "google-antigravity", "google-gemini-cli"],
  },
  {
    value: "copilot",
    label: "GitHub Copilot",
    hint: "GitHub 登录 + 本地代理",
    choices: ["github-copilot", "copilot-proxy"],
  },
  {
    value: "openrouter",
    label: "OpenRouter（多模型聚合）",
    hint: "API key",
    choices: ["openrouter-api-key"],
  },
  {
    value: "ai-gateway",
    label: "Vercel AI Gateway",
    hint: "API key",
    choices: ["ai-gateway-api-key"],
  },
  {
    value: "opencode-zen",
    label: "OpenCode Zen（多模型代理）",
    hint: "Claude, GPT, Gemini",
    choices: ["opencode-zen"],
  },
  {
    value: "synthetic",
    label: "Synthetic",
    hint: "Anthropic 兼容（多模型）",
    choices: ["synthetic-api-key"],
  },
  {
    value: "venice",
    label: "Venice AI",
    hint: "隐私优先（无审查模型）",
    choices: ["venice-api-key"],
  },
];

export function buildAuthChoiceOptions(params: {
  store: AuthProfileStore;
  includeSkip: boolean;
}): AuthChoiceOption[] {
  void params.store;
  const options: AuthChoiceOption[] = [];

  // 国内模型优先
  options.push({
    value: "deepseek-api-key",
    label: "DeepSeek API key（深度求索）",
    hint: "开源高性能，OpenAI 兼容接口",
  });
  options.push({ value: "qwen-portal", label: "Qwen OAuth（通义千问）" });
  options.push({
    value: "baidu-qianfan-api-key",
    label: "百度文心一言 API key（ERNIE）",
    hint: "千帆大模型平台",
  });
  options.push({
    value: "tencent-hunyuan-api-key",
    label: "腾讯混元 API key（Hunyuan）",
    hint: "腾讯云大模型",
  });
  options.push({
    value: "doubao-api-key",
    label: "字节豆包 API key（Doubao）",
    hint: "火山引擎大模型服务",
  });
  options.push({
    value: "xinghuo-api-key",
    label: "讯飞星火 API key（Spark）",
    hint: "科大讯飞认知大模型",
  });
  // 国际免费模型
  options.push({
    value: "siliconflow-api-key",
    label: "SiliconFlow API key（硅基流动）",
    hint: "注册送2000万Tokens，多模型免费",
  });
  options.push({
    value: "groq-api-key",
    label: "Groq API key",
    hint: "超快推理速度，免费访问 DeepSeek/LLaMA",
  });
  options.push({
    value: "together-ai-api-key",
    label: "Together AI API key",
    hint: "免费模型访问",
  });
  options.push({
    value: "minimax-portal",
    label: "MiniMax OAuth（海螺AI）",
    hint: "Oauth plugin for MiniMax",
  });
  options.push({ value: "minimax-api", label: "MiniMax M2.1" });
  options.push({
    value: "minimax-api-lightning",
    label: "MiniMax M2.1 Lightning",
    hint: "Faster, higher output cost",
  });
  options.push({ value: "moonshot-api-key", label: "Moonshot AI API key（Kimi）" });
  options.push({ value: "kimi-code-api-key", label: "Kimi Coding API key" });
  options.push({ value: "zai-api-key", label: "Z.AI (GLM 4.7) API key" });
  options.push({
    value: "xiaomi-api-key",
    label: "Xiaomi API key（小米）",
  });

  // 国际模型
  options.push({
    value: "token",
    label: "Anthropic token (paste setup-token)",
    hint: "run `claude setup-token` elsewhere, then paste the token here",
  });
  options.push({ value: "apiKey", label: "Anthropic API key" });
  options.push({
    value: "openai-codex",
    label: "OpenAI Codex (ChatGPT OAuth)",
  });
  options.push({ value: "chutes", label: "Chutes (OAuth)" });
  options.push({ value: "openai-api-key", label: "OpenAI API key" });
  options.push({ value: "openrouter-api-key", label: "OpenRouter API key" });
  options.push({
    value: "ai-gateway-api-key",
    label: "Vercel AI Gateway API key",
  });
  options.push({ value: "synthetic-api-key", label: "Synthetic API key" });
  options.push({
    value: "venice-api-key",
    label: "Venice AI API key",
    hint: "Privacy-focused inference (uncensored models)",
  });
  options.push({
    value: "github-copilot",
    label: "GitHub Copilot (GitHub device login)",
    hint: "Uses GitHub device flow",
  });
  options.push({ value: "gemini-api-key", label: "Google Gemini API key" });
  options.push({
    value: "google-antigravity",
    label: "Google Antigravity OAuth",
    hint: "Uses the bundled Antigravity auth plugin",
  });
  options.push({
    value: "google-gemini-cli",
    label: "Google Gemini CLI OAuth",
    hint: "Uses the bundled Gemini CLI auth plugin",
  });
  options.push({
    value: "copilot-proxy",
    label: "Copilot Proxy (local)",
    hint: "Local proxy for VS Code Copilot models",
  });
  options.push({
    value: "opencode-zen",
    label: "OpenCode Zen (multi-model proxy)",
    hint: "Claude, GPT, Gemini via opencode.ai/zen",
  });
  if (params.includeSkip) {
    options.push({ value: "skip", label: "Skip for now" });
  }

  return options;
}

export function buildAuthChoiceGroups(params: { store: AuthProfileStore; includeSkip: boolean }): {
  groups: AuthChoiceGroup[];
  skipOption?: AuthChoiceOption;
} {
  const options = buildAuthChoiceOptions({
    ...params,
    includeSkip: false,
  });
  const optionByValue = new Map<AuthChoice, AuthChoiceOption>(
    options.map((opt) => [opt.value, opt]),
  );

  const groups = AUTH_CHOICE_GROUP_DEFS.map((group) => ({
    ...group,
    options: group.choices
      .map((choice) => optionByValue.get(choice))
      .filter((opt): opt is AuthChoiceOption => Boolean(opt)),
  }));

  const skipOption = params.includeSkip
    ? ({ value: "skip", label: "Skip for now" } satisfies AuthChoiceOption)
    : undefined;

  return { groups, skipOption };
}
