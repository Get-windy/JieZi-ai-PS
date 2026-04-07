import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "anthropic",
  name: "Anthropic Provider",
  description: "Bundled Anthropic provider plugin",
  async register(api) {
    // Use require() instead of dynamic import() to avoid jiti's async-ESM mode
    // which generates .mjs caches that fail to resolve sibling .ts files in
    // source-checkout / overlay mode. Require is synchronous and stays on the
    // jiti CJS-transpile path where alias maps and .ts extensions work correctly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerAnthropicPlugin } =
      require("./register.runtime.js") as typeof import("./register.runtime.js");
    await registerAnthropicPlugin(api);
  },
});
