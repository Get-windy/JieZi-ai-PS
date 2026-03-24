/**
 * Build post-step: copy upstream/src/plugin-sdk/root-alias.cjs → dist/plugin-sdk/root-alias.cjs
 *
 * The jiti-based plugin loader (upstream/src/plugins/loader.ts) calls resolvePluginSdkAlias()
 * which looks for `dist/plugin-sdk/root-alias.cjs` to resolve the `openclaw/plugin-sdk` alias.
 * Without this file jiti cannot build the full alias map, causing memory-core and other plugins
 * to fail loading with "Cannot find module 'dist/plugin-sdk/discord.js'" errors.
 *
 * upstream/scripts/copy-plugin-sdk-root-alias.mjs reads from `src/plugin-sdk/root-alias.cjs`
 * (relative to cwd), but in this local-overlay project the file lives in upstream/src/plugin-sdk/.
 * This script handles the copy correctly from the overlay project root.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const source = path.join(projectRoot, "upstream", "src", "plugin-sdk", "root-alias.cjs");
const target = path.join(projectRoot, "dist", "plugin-sdk", "root-alias.cjs");

if (!fs.existsSync(source)) {
  console.error(`[copy-plugin-sdk-root-alias] Source not found: ${source}`);
  process.exit(1);
}

// Only write if content has changed (avoid unnecessary mtime updates)
let shouldWrite = true;
if (fs.existsSync(target)) {
  const srcContent = fs.readFileSync(source, "utf8");
  const dstContent = fs.readFileSync(target, "utf8");
  if (srcContent === dstContent) {
    shouldWrite = false;
  }
}

if (shouldWrite) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`[copy-plugin-sdk-root-alias] Copied root-alias.cjs → dist/plugin-sdk/`);
} else {
  console.log(`[copy-plugin-sdk-root-alias] root-alias.cjs unchanged, skipped.`);
}
