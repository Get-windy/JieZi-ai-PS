import path from "node:path";

// Dynamic import to avoid bundler issues with re-exports
const piCodingAgent = await import("@mariozechner/pi-coding-agent");

export const AuthStorage = piCodingAgent.AuthStorage;
export const ModelRegistry = piCodingAgent.ModelRegistry;

// Compatibility helpers for pi-coding-agent 0.50+ (discover* helpers removed).
export function discoverAuthStorage(agentDir: string): InstanceType<typeof AuthStorage> {
  return new AuthStorage(path.join(agentDir, "auth.json"));
}

export function discoverModels(
  authStorage: InstanceType<typeof AuthStorage>,
  agentDir: string,
): InstanceType<typeof ModelRegistry> {
  return new ModelRegistry(authStorage, path.join(agentDir, "models.json"));
}
