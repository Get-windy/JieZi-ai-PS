/**
 * Copies openclaw.plugin.json from upstream/extensions/<plugin>/
 * into dist/extensions/<plugin>/ for plugins that exist only in upstream
 * (not overridden locally in extensions/).
 *
 * This is needed because copyBundledPluginMetadata() only scans the local
 * extensions/ directory; plugins bundled exclusively in upstream/extensions/
 * would otherwise load from the TypeScript source tree at runtime.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const upstreamExtensionsRoot = path.join(projectRoot, "upstream", "extensions");
const localExtensionsRoot = path.join(projectRoot, "extensions");
const distExtensionsRoot = path.join(projectRoot, "dist", "extensions");

if (!fs.existsSync(upstreamExtensionsRoot)) {
  console.log("[copy-upstream-plugin-metadata] upstream/extensions not found, skipping.");
  process.exit(0);
}

let copied = 0;
let skipped = 0;

for (const dirent of fs.readdirSync(upstreamExtensionsRoot, { withFileTypes: true })) {
  if (!dirent.isDirectory()) {
    continue;
  }

  const pluginName = dirent.name;

  // Skip plugins that are overridden locally — those are handled by copyBundledPluginMetadata
  if (fs.existsSync(path.join(localExtensionsRoot, pluginName))) {
    skipped++;
    continue;
  }

  const upstreamManifest = path.join(upstreamExtensionsRoot, pluginName, "openclaw.plugin.json");
  if (!fs.existsSync(upstreamManifest)) {
    continue;
  }

  const distPluginDir = path.join(distExtensionsRoot, pluginName);
  const distManifest = path.join(distPluginDir, "openclaw.plugin.json");

  fs.mkdirSync(distPluginDir, { recursive: true });
  fs.copyFileSync(upstreamManifest, distManifest);
  copied++;
}

console.log(
  `[copy-upstream-plugin-metadata] done: ${copied} upstream-only plugin manifest(s) copied, ${skipped} local override(s) skipped.`,
);
