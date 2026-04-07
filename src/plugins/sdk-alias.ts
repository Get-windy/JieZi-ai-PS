// Overlay for upstream/src/plugins/sdk-alias.ts
//
// Re-exports everything from the upstream module, but overrides
// shouldPreferNativeJiti so that in source-checkout overlay mode, importing a
// ".js" file whose sibling ".ts" actually exists on disk will NOT trigger
// jiti's native-ESM loader.
//
// Background: jiti uses tryNative=true for .js files, which causes Node to
// attempt a native ESM import.  In a source checkout the actual file is
// ".ts", not ".js", so the native import fails silently and the re-exported
// value comes back as undefined (e.g. buildAnthropicCliBackend).  Returning
// false here forces jiti to fall back to its CJS-transpile path, which
// correctly resolves .js → .ts via jiti's extension list.

import fs from "node:fs";
import path from "node:path";

export {
  buildPluginLoaderAliasMap,
  buildPluginLoaderJitiOptions,
  listPluginSdkAliasCandidates,
  listPluginSdkExportedSubpaths,
  resolveExtensionApiAlias,
  resolveLoaderPackageRoot,
  resolvePluginRuntimeModulePath,
  resolvePluginSdkAliasCandidateOrder,
  resolvePluginSdkAliasFile,
  resolvePluginSdkScopedAliasMap,
  type LoaderModuleResolveParams,
  type PluginSdkResolutionPreference,
} from "../../upstream/src/plugins/sdk-alias.js";

/**
 * Override of shouldPreferNativeJiti from upstream/src/plugins/sdk-alias.ts.
 *
 * When a .js file is requested but a sibling .ts file exists on disk
 * (source-checkout overlay mode), disable native-ESM loading so jiti uses
 * its CJS transpile path and can resolve TypeScript source files.
 */
export function shouldPreferNativeJiti(modulePath: string): boolean {
  const versions = process.versions as { bun?: string };
  if (typeof versions.bun === "string") {
    return false;
  }
  switch (path.extname(modulePath).toLowerCase()) {
    case ".js": {
      // If the corresponding .ts file exists, this is a TypeScript source file
      // that jiti is expected to transpile. Native ESM import() will fail
      // because Node.js cannot load .ts without a custom loader.
      const tsPath = modulePath.slice(0, -3) + ".ts";
      if (fs.existsSync(tsPath)) {
        return false;
      }
      return true;
    }
    case ".mjs": {
      const mtsPath = modulePath.slice(0, -4) + ".mts";
      if (fs.existsSync(mtsPath)) {
        return false;
      }
      return true;
    }
    case ".cjs": {
      const ctsPath = modulePath.slice(0, -4) + ".cts";
      if (fs.existsSync(ctsPath)) {
        return false;
      }
      return true;
    }
    case ".json":
      return true;
    default:
      return false;
  }
}
