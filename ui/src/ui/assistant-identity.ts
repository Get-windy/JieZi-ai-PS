import { coerceIdentityValue } from "../../../src/shared/assistant-identity-values.js";

const MAX_ASSISTANT_NAME = 50;
const MAX_ASSISTANT_AVATAR = 200;

export const DEFAULT_ASSISTANT_NAME = "Assistant";
export const DEFAULT_ASSISTANT_AVATAR = "A";

export type AssistantIdentity = {
  agentId?: string | null;
  name: string;
  avatar: string | null;
};

export function normalizeAssistantIdentity(
  input?: Partial<AssistantIdentity> | null,
): AssistantIdentity {
  const name = coerceIdentityValue(input?.name, MAX_ASSISTANT_NAME) ?? DEFAULT_ASSISTANT_NAME;
  const avatar = coerceIdentityValue(input?.avatar ?? undefined, MAX_ASSISTANT_AVATAR) ?? null;
  const agentId =
    typeof input?.agentId === "string" && input.agentId.trim() ? input.agentId.trim() : null;
  return { agentId, name, avatar };
}

/**
 * 解析页面内嵌的助手身份信息（通过 window.__OPENCLAW_ASSISTANT_* 注入）
 */
export function resolveInjectedAssistantIdentity(): AssistantIdentity {
  const w = window as Record<string, unknown>;
  const name =
    typeof w.__OPENCLAW_ASSISTANT_NAME === "string" && w.__OPENCLAW_ASSISTANT_NAME.trim()
      ? w.__OPENCLAW_ASSISTANT_NAME.trim()
      : DEFAULT_ASSISTANT_NAME;
  const avatar =
    typeof w.__OPENCLAW_ASSISTANT_AVATAR === "string" && w.__OPENCLAW_ASSISTANT_AVATAR.trim()
      ? w.__OPENCLAW_ASSISTANT_AVATAR.trim()
      : null;
  const agentId =
    typeof w.__OPENCLAW_ASSISTANT_AGENT_ID === "string" && w.__OPENCLAW_ASSISTANT_AGENT_ID.trim()
      ? w.__OPENCLAW_ASSISTANT_AGENT_ID.trim()
      : null;
  return { name, avatar, agentId };
}
