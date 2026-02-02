import type { OAuthCredentials } from "@mariozechner/pi-ai";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { upsertAuthProfile } from "../agents/auth-profiles.js";

const resolveAuthAgentDir = (agentDir?: string) => agentDir ?? resolveOpenClawAgentDir();

export async function writeOAuthCredentials(
  provider: string,
  creds: OAuthCredentials,
  agentDir?: string,
): Promise<void> {
  const email =
    typeof creds.email === "string" && creds.email.trim() ? creds.email.trim() : "default";
  upsertAuthProfile({
    profileId: `${provider}:${email}`,
    credential: {
      type: "oauth",
      provider,
      ...creds,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setAnthropicApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "anthropic:default",
    credential: {
      type: "api_key",
      provider: "anthropic",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setGeminiApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "google:default",
    credential: {
      type: "api_key",
      provider: "google",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setMinimaxApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "minimax:default",
    credential: {
      type: "api_key",
      provider: "minimax",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setMoonshotApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "moonshot:default",
    credential: {
      type: "api_key",
      provider: "moonshot",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setKimiCodingApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "kimi-coding:default",
    credential: {
      type: "api_key",
      provider: "kimi-coding",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setSyntheticApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "synthetic:default",
    credential: {
      type: "api_key",
      provider: "synthetic",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setVeniceApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "venice:default",
    credential: {
      type: "api_key",
      provider: "venice",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export const ZAI_DEFAULT_MODEL_REF = "zai/glm-4.7";
export const XIAOMI_DEFAULT_MODEL_REF = "xiaomi/mimo-v2-flash";
export const OPENROUTER_DEFAULT_MODEL_REF = "openrouter/auto";
export const VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF = "vercel-ai-gateway/anthropic/claude-opus-4.5";
// 国内模型默认引用
export const DEEPSEEK_DEFAULT_MODEL_REF = "deepseek/deepseek-chat";
export const BAIDU_QIANFAN_DEFAULT_MODEL_REF = "baidu/ernie-4.0-turbo-8k";
export const DOUBAO_DEFAULT_MODEL_REF = "doubao/doubao-pro-32k";
export const TENCENT_HUNYUAN_DEFAULT_MODEL_REF = "tencent/hunyuan-turbo";
export const XINGHUO_DEFAULT_MODEL_REF = "xinghuo/spark-pro";
// 国际免费模型默认引用
export const SILICONFLOW_DEFAULT_MODEL_REF = "siliconflow/qwen-2.5-7b-instruct";
export const GROQ_DEFAULT_MODEL_REF = "groq/llama-3.3-70b-versatile";
export const TOGETHER_AI_DEFAULT_MODEL_REF = "together-ai/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";

export async function setZaiApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "zai:default",
    credential: {
      type: "api_key",
      provider: "zai",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setXiaomiApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "xiaomi:default",
    credential: {
      type: "api_key",
      provider: "xiaomi",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setOpenrouterApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "openrouter:default",
    credential: {
      type: "api_key",
      provider: "openrouter",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setVercelAiGatewayApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "vercel-ai-gateway:default",
    credential: {
      type: "api_key",
      provider: "vercel-ai-gateway",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setOpencodeZenApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "opencode:default",
    credential: {
      type: "api_key",
      provider: "opencode",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setDeepseekApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "deepseek:default",
    credential: {
      type: "api_key",
      provider: "deepseek",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setBaiduQianfanApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "baidu:default",
    credential: {
      type: "api_key",
      provider: "baidu",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setDoubaoApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "doubao:default",
    credential: {
      type: "api_key",
      provider: "doubao",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setTencentHunyuanApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "tencent:default",
    credential: {
      type: "api_key",
      provider: "tencent",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setXinghuoApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "xinghuo:default",
    credential: {
      type: "api_key",
      provider: "xinghuo",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setSiliconflowApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "siliconflow:default",
    credential: {
      type: "api_key",
      provider: "siliconflow",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setGroqApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "groq:default",
    credential: {
      type: "api_key",
      provider: "groq",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setTogetherAiApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "together-ai:default",
    credential: {
      type: "api_key",
      provider: "together-ai",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}
