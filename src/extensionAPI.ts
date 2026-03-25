// openclaw/extension-api has been removed. There is no compatibility bridge.
// Migrate to focused openclaw/plugin-sdk/<subpath> imports.
// Migration guide: https://docs.openclaw.ai/plugins/sdk-migration

throw new Error(
  "openclaw/extension-api has been removed. " +
    "Migrate to openclaw/plugin-sdk/* subpath imports. " +
    "See https://docs.openclaw.ai/plugins/sdk-migration",
);
