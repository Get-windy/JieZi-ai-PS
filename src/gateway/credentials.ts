/**
 * Gateway credentials helpers for local src/ layer.
 * Re-exports upstream gateway credential functions and adds
 * readGatewayTokenEnv / readGatewayPasswordEnv helpers.
 */

export {
  resolveGatewayCredentialsFromValues,
  resolveGatewayCredentialsFromConfig,
  resolveGatewayProbeCredentialsFromConfig,
  resolveGatewayDriftCheckCredentialsFromConfig,
  isGatewaySecretRefUnavailableError,
  GatewaySecretRefUnavailableError,
  type ExplicitGatewayAuth,
  type ResolvedGatewayCredentials,
  type GatewayCredentialMode,
  type GatewayCredentialPrecedence,
  type GatewayRemoteCredentialPrecedence,
  type GatewayRemoteCredentialFallback,
} from "../../upstream/src/gateway/credentials.js";

export {
  hasGatewayTokenEnvCandidate,
  hasGatewayPasswordEnvCandidate,
  trimCredentialToUndefined,
  trimToUndefined,
} from "../../upstream/src/gateway/credential-planner.js";

function normalizeEnvString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readGatewayTokenEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return normalizeEnvString(env.OPENCLAW_GATEWAY_TOKEN);
}

export function readGatewayPasswordEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return normalizeEnvString(env.OPENCLAW_GATEWAY_PASSWORD);
}
