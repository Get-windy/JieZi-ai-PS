const MAX_ASSISTANT_NAME = 50;
const MAX_ASSISTANT_AVATAR = 200;

export const DEFAULT_ASSISTANT_NAME = "Assistant";
export const DEFAULT_ASSISTANT_AVATAR = "A";

export type AssistantIdentity = {
  agentId?: string | null;
  name: string;
  avatar: string | null;
};

function coerceIdentityValue(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength);
}

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
 * Resolve assistant identity from injected environment variables or defaults
 */
export function resolveInjectedAssistantIdentity(): AssistantIdentity {
  // Try to read from environment variables or window object
  const envName = (window as any).__OPENCLAW_ASSISTANT_NAME__;
  const envAvatar = (window as any).__OPENCLAW_ASSISTANT_AVATAR__;
  const envAgentId = (window as any).__OPENCLAW_ASSISTANT_AGENT_ID__;

  return normalizeAssistantIdentity({
    name: envName,
    avatar: envAvatar,
    agentId: envAgentId,
  });
}
