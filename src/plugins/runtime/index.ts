/**
 * Local overlay entry for plugin runtime.
 * Re-exports everything from upstream so dist/plugins/runtime/index.js
 * exists at build time and can be resolved by resolvePluginRuntimeModulePath().
 */
export * from "../../../upstream/src/plugins/runtime/index.js";
