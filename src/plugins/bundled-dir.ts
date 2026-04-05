import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenClawPackageRootSync } from "../../upstream/src/infra/openclaw-root.js";
import { resolveUserPath } from "../../upstream/src/utils.js";

function isSourceCheckoutRoot(packageRoot: string): boolean {
  return (
    fs.existsSync(path.join(packageRoot, ".git")) &&
    fs.existsSync(path.join(packageRoot, "src")) &&
    fs.existsSync(path.join(packageRoot, "extensions"))
  );
}

/**
 * Overlay override for resolveBundledPluginsDir.
 *
 * Returns `upstream/extensions/` as the stock bundled plugins dir so all upstream
 * plugins (feishu, telegram, discord, slack, etc.) are discovered correctly.
 * Local user-installed plugins (dingtalk-connector, wecom-openclaw-plugin) live in
 * `~/.openclaw/extensions/` and are discovered as global plugins automatically.
 */
export function resolveBundledPluginsDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const override = env.OPENCLAW_BUNDLED_PLUGINS_DIR?.trim();
  if (override) {
    return resolveUserPath(override, env);
  }

  const preferSourceCheckout = Boolean(env.VITEST);

  try {
    const packageRoots = [
      resolveOpenClawPackageRootSync({ cwd: process.cwd() }),
      resolveOpenClawPackageRootSync({ moduleUrl: import.meta.url }),
    ].filter(
      (entry, index, all): entry is string => Boolean(entry) && all.indexOf(entry) === index,
    );
    for (const packageRoot of packageRoots) {
      // In overlay mode: prefer upstream/extensions over the top-level extensions/
      // because upstream/extensions/ has the full upstream plugin implementations.
      // Local extensions/ (dingtalk, wecom) are loaded via resolveExtraPluginDirs.
      const upstreamExtensionsDir = path.join(packageRoot, "upstream", "extensions");
      const sourceExtensionsDir = path.join(packageRoot, "extensions");
      const builtExtensionsDir = path.join(packageRoot, "dist", "extensions");

      // Always prefer upstream/extensions over local extensions/ in overlay mode.
      // Local extensions/ only contains stub index.ts files without the actual src/
      // subdirectory, so loading from upstream/extensions ensures relative imports
      // like "./src/channel.js" resolve correctly.
      if (fs.existsSync(upstreamExtensionsDir)) {
        return upstreamExtensionsDir;
      }
      if (
        (preferSourceCheckout || isSourceCheckoutRoot(packageRoot)) &&
        fs.existsSync(sourceExtensionsDir)
      ) {
        return sourceExtensionsDir;
      }
      // Local source checkouts stage a runtime-complete bundled plugin tree under
      // dist-runtime/. Prefer that over source extensions only when the paired
      // dist/ tree exists; otherwise wrappers can drift ahead of the last build.
      const runtimeExtensionsDir = path.join(packageRoot, "dist-runtime", "extensions");
      if (fs.existsSync(runtimeExtensionsDir) && fs.existsSync(builtExtensionsDir)) {
        return runtimeExtensionsDir;
      }
      if (fs.existsSync(builtExtensionsDir)) {
        return builtExtensionsDir;
      }
    }
  } catch {
    // ignore
  }

  // bun --compile: ship a sibling `extensions/` next to the executable.
  try {
    const execDir = path.dirname(process.execPath);
    const siblingBuilt = path.join(execDir, "dist", "extensions");
    if (fs.existsSync(siblingBuilt)) {
      return siblingBuilt;
    }
    const sibling = path.join(execDir, "extensions");
    if (fs.existsSync(sibling)) {
      return sibling;
    }
  } catch {
    // ignore
  }

  // npm/dev: walk up from this module to find `upstream/extensions/` at the package root.
  try {
    let cursor = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i += 1) {
      const candidate = path.join(cursor, "upstream", "extensions");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  } catch {
    // ignore
  }

  return undefined;
}
