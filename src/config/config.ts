export {
  clearConfigCache,
  createConfigIO,
  loadConfig,
  parseConfigJson5,
  readConfigFileSnapshot,
  readConfigFileSnapshotForWrite,
  resolveConfigSnapshotHash,
  writeConfigFile,
} from "./io.js";
// Re-export upstream additions from io
export {
  clearRuntimeConfigSnapshot,
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
  setRuntimeConfigSnapshot,
} from "@upstream/config/io.js";
export { migrateLegacyConfig } from "./legacy-migrate.js";
export * from "./paths.js";
export * from "./runtime-overrides.js";
export * from "./types.js";
export {
  validateConfigObject,
  validateConfigObjectRaw,
  validateConfigObjectRawWithPlugins,
  validateConfigObjectWithPlugins,
} from "./validation.js";
export { OpenClawSchema } from "./zod-schema.js";
export { initializePhaseIntegration, initializeAfterConfigLoad } from "./phase-integration.js";

// Convenience alias for local code that expects a saveConfig(cfg) signature
export { writeConfigFile as saveConfig } from "./io.js";
