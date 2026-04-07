/**
 * Sync plugin-sdk subpath exports in package.json from plugin-sdk-entrypoints.json.
 * Run automatically as part of the build pipeline to avoid manual maintenance.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = resolve(root, "package.json");
const entriesPath = resolve(root, "upstream/scripts/lib/plugin-sdk-entrypoints.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const entries = JSON.parse(readFileSync(entriesPath, "utf-8"));

let added = 0;
for (const name of entries) {
  const key = `./plugin-sdk/${name}`;
  if (!pkg.exports[key]) {
    pkg.exports[key] = {
      types: `./dist/plugin-sdk/${name}.d.ts`,
      default: `./dist/plugin-sdk/${name}.js`,
    };
    added++;
  }
}

if (added > 0) {
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(
    `[sync-plugin-sdk-exports] Added ${added} missing plugin-sdk exports to package.json`,
  );
} else {
  console.log(
    `[sync-plugin-sdk-exports] All ${entries.length} plugin-sdk exports already present, no changes needed`,
  );
}
