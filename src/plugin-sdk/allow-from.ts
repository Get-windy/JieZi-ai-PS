// Re-export everything from upstream allow-from to ensure all extensions
// (discord, slack, telegram, etc.) can resolve their imports correctly.
// The overlay pattern requires local overrides to include all upstream exports.
export * from "../../upstream/src/plugin-sdk/allow-from.js";
