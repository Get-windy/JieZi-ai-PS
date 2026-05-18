import fs, { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsdown";
import {
  collectBundledPluginBuildEntries,
  NON_PACKAGED_BUNDLED_PLUGIN_DIRS,
} from "./upstream/scripts/lib/bundled-plugin-build-entries.mjs";
import { buildPluginSdkEntrySources } from "./upstream/scripts/lib/plugin-sdk-entries.mjs";

// ========== 三层架构覆盖层插件 ==========
const ROOT_DIR = path.resolve(import.meta.dirname);
const SRC_DIR = path.join(ROOT_DIR, "src");
const EXT_DIR = path.join(ROOT_DIR, "extensions");
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src");
const UP_EXT_DIR = path.join(ROOT_DIR, "upstream", "extensions");
const SEP = path.sep;
const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".json"];

const JS_TO_TS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

function tryResolveFile(basePath: string): string | null {
  if (existsSync(basePath)) {
    return basePath;
  }
  for (const ext of TS_EXTENSIONS) {
    const p = basePath + ext;
    if (existsSync(p)) {
      return p;
    }
  }
  for (const ext of TS_EXTENSIONS) {
    const p = path.join(basePath, "index" + ext);
    if (existsSync(p)) {
      return p;
    }
  }
  const currentExt = path.extname(basePath);
  const tsExts = JS_TO_TS[currentExt];
  if (tsExts) {
    const base = basePath.slice(0, -currentExt.length);
    for (const tsExt of tsExts) {
      const p = base + tsExt;
      if (existsSync(p)) {
        return p;
      }
    }
  }
  return null;
}

function upstreamOverlayPlugin() {
  return {
    name: "upstream-overlay",
    resolveId(source: string, importer: string | undefined) {
      if (!source || source.startsWith("\0") || source.includes("node_modules")) {
        return null;
      }

      let absTarget: string | null = null;

      if (source.startsWith("src/") || source.startsWith("src\\")) {
        absTarget = path.resolve(ROOT_DIR, source);
      } else if ((source.startsWith("./") || source.startsWith("../")) && importer) {
        absTarget = path.resolve(path.dirname(importer), source);
      } else if (path.isAbsolute(source)) {
        absTarget = source;
      } else {
        return null;
      }

      absTarget = path.normalize(absTarget);

      // Case 1: src/ → 本地优先，不存在回退到 upstream/src/
      if (absTarget.startsWith(SRC_DIR + SEP) || absTarget === SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        }
        const rel = path.relative(SRC_DIR, absTarget);
        if (rel.startsWith("extensions" + SEP) || rel === "extensions") {
          const extRel = rel.slice("extensions".length + SEP.length);
          return tryResolveFile(path.join(UP_EXT_DIR, extRel));
        }
        return tryResolveFile(path.join(UP_SRC_DIR, rel));
      }

      // Case 2: extensions/ → 本地优先，不存在回退到 upstream/extensions/
      if (absTarget.startsWith(EXT_DIR + SEP) || absTarget === EXT_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        }
        const rel = path.relative(EXT_DIR, absTarget);
        return tryResolveFile(path.join(UP_EXT_DIR, rel));
      }

      // Case 3: upstream/src/ → 检查 src/ 是否有本地覆盖
      if (absTarget.startsWith(UP_SRC_DIR + SEP) || absTarget === UP_SRC_DIR) {
        const rel = path.relative(UP_SRC_DIR, absTarget);
        const localPath = path.join(SRC_DIR, rel);
        const localResult = tryResolveFile(localPath);
        if (localResult) {
          const importerNorm = importer ? path.normalize(importer) : null;
          if (importerNorm && path.normalize(localResult) === importerNorm) {
            return null;
          }
          if (importerNorm) {
            const localResultNorm = path.normalize(localResult);
            const localResultDir = path.dirname(localResultNorm);
            const localResultBase = path.basename(localResultNorm, path.extname(localResultNorm));
            const expectedBridgePattern = path.join(
              localResultDir,
              `${localResultBase}-upstream-extras`,
            );
            const importerBase = importerNorm.replace(/\.[cm]?[jt]sx?$/, "");
            if (importerBase === expectedBridgePattern) {
              return null;
            }
          }
          return localResult;
        }
        return tryResolveFile(absTarget);
      }

      // Case 4: upstream/extensions/ → 检查 extensions/ 是否有本地覆盖
      if (absTarget.startsWith(UP_EXT_DIR + SEP) || absTarget === UP_EXT_DIR) {
        const rel = path.relative(UP_EXT_DIR, absTarget);
        const localExtPath = path.join(EXT_DIR, rel);
        const localResult = tryResolveFile(localExtPath);
        if (localResult) {
          return localResult;
        }
        return tryResolveFile(absTarget);
      }

      return null;
    },
  };
}

const overlayPlugin = upstreamOverlayPlugin();

// ========== neverBundle ==========
const shouldBuildPrivateQaEntries = process.env.OPENCLAW_BUILD_PRIVATE_QA === "1";

function shouldNeverBundleDependency(id: string): boolean {
  if (id.startsWith("@reflink/")) {
    return true;
  }
  if (id.endsWith(".node")) {
    return true;
  }
  if (/^@mariozechner\/pi-(?:coding-agent|ai|agent-core|tui)$/.test(id)) {
    return true;
  }
  if (/^jwks-rsa($|\/)/.test(id)) {
    return true;
  }
  if (id === "node:tls" || id === "node:net") {
    return true;
  }
  if (/^undici($|\/)/.test(id)) {
    return true;
  }
  if (/^undici-types($|\/)/.test(id)) {
    return true;
  }
  if (/^@types\/node($|\/)/.test(id)) {
    return true;
  }
  if (id.startsWith("@vitest/")) {
    return true;
  }
  if (/^vitest($|\/)/.test(id)) {
    return true;
  }
  const explicitDeps = [
    "@lancedb/lancedb",
    "@matrix-org/matrix-sdk-crypto-nodejs",
    "matrix-js-sdk",
  ];
  return explicitDeps.some((dep) => id === dep || id.startsWith(`${dep}/`));
}

// ========== bundled plugin entries (本地优先，upstream 补充) ==========
const localBundledPluginBuildEntries = collectBundledPluginBuildEntries();
const localBundledPluginIds = new Set(localBundledPluginBuildEntries.map((e) => e.id));
const upstreamOnlyBundledPluginBuildEntries = collectBundledPluginBuildEntries({
  cwd: path.join(ROOT_DIR, "upstream"),
}).filter(({ id }) => !localBundledPluginIds.has(id));
const bundledPluginBuildEntries = [
  ...localBundledPluginBuildEntries.map((e) => ({ ...e, sourcePrefix: "extensions" })),
  ...upstreamOnlyBundledPluginBuildEntries.map((e) => ({
    ...e,
    sourcePrefix: "upstream/extensions",
  })),
];

function listBundledPluginEntrySources(
  entries: Array<{ id: string; sourceEntries: string[]; sourcePrefix?: string }>,
): Record<string, string> {
  return Object.fromEntries(
    entries.flatMap(({ id, sourceEntries, sourcePrefix = "extensions" }) =>
      sourceEntries.map((entry) => {
        const normalizedEntry = entry.replace(/^\.\//u, "");
        const entryKey = `extensions/${id}/${normalizedEntry.replace(/\.[^.]+$/u, "")}`;
        return [
          entryKey,
          normalizedEntry ? `${sourcePrefix}/${id}/${normalizedEntry}` : `${sourcePrefix}/${id}`,
        ];
      }),
    ),
  );
}

function buildBundledHookEntries(): Record<string, string> {
  const hooksRoot = path.join(ROOT_DIR, "src", "hooks", "bundled");
  const entries: Record<string, string> = {};
  if (!fs.existsSync(hooksRoot)) {
    return entries;
  }
  for (const dirent of fs.readdirSync(hooksRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const handlerPath = path.join(hooksRoot, dirent.name, "handler.ts");
    if (!fs.existsSync(handlerPath)) {
      continue;
    }
    entries[`bundled/${dirent.name}/handler`] = handlerPath;
  }
  return entries;
}

function buildCoreDistEntries(): Record<string, string> {
  const upstreamEntries: Record<string, string> = {
    index: "src/index.ts",
    entry: "src/entry.ts",
    "cli/daemon-cli": "src/cli/daemon-cli.ts",
    "agents/auth-profiles.runtime": "src/agents/auth-profiles.runtime.ts",
    "agents/model-catalog.runtime": "src/agents/model-catalog.runtime.ts",
    "agents/models-config.runtime": "src/agents/models-config.runtime.ts",
    "subagent-registry.runtime": "src/agents/subagent-registry.runtime.ts",
    "commands/status.summary.runtime": "src/commands/status.summary.runtime.ts",
    "infra/warning-filter": "src/infra/warning-filter.ts",
    "plugins/provider-discovery.runtime": "src/plugins/provider-discovery.runtime.ts",
    "plugins/provider-runtime.runtime": "src/plugins/provider-runtime.runtime.ts",
    "plugins/public-surface-runtime": "src/plugins/public-surface-runtime.ts",
    "plugins/sdk-alias": "src/plugins/sdk-alias.ts",
    "facade-activation-check.runtime": "src/plugin-sdk/facade-activation-check.runtime.ts",
    extensionAPI: "src/extensionAPI.ts",
    "plugins/runtime/index": "src/plugins/runtime/index.ts",
    "llm-slug-generator": "src/hooks/llm-slug-generator.ts",
  };
  return Object.fromEntries(
    Object.entries(upstreamEntries).filter(([, srcPath]) => {
      return (
        existsSync(path.resolve(ROOT_DIR, srcPath)) ||
        existsSync(path.resolve(ROOT_DIR, "upstream", srcPath))
      );
    }),
  );
}

function buildUnifiedDistEntries(): Record<string, string> {
  const coreEntries = buildCoreDistEntries();
  const pluginSdkEntries = Object.fromEntries(
    Object.entries(buildPluginSdkEntrySources()).map(([entry, source]) => [
      `plugin-sdk/${entry}`,
      source,
    ]),
  );
  const qaEntries = shouldBuildPrivateQaEntries
    ? {
        "plugin-sdk/qa-lab": "src/plugin-sdk/qa-lab.ts",
        "plugin-sdk/qa-runtime": "src/plugin-sdk/qa-runtime.ts",
      }
    : {};
  const rootBundledPluginBuildEntries = bundledPluginBuildEntries.filter(
    ({ id }) => shouldBuildPrivateQaEntries || !NON_PACKAGED_BUNDLED_PLUGIN_DIRS.has(id),
  );

  return {
    ...coreEntries,
    "plugin-sdk/compat": "src/plugin-sdk/compat.ts",
    ...pluginSdkEntries,
    ...qaEntries,
    ...listBundledPluginEntrySources(rootBundledPluginBuildEntries),
    ...buildBundledHookEntries(),
  };
}

export default defineConfig([
  {
    clean: true,
    entry: buildUnifiedDistEntries(),
    env: { NODE_ENV: "production" },
    fixedExtension: false,
    platform: "node",
    plugins: [overlayPlugin],
    treeshake: false,
    deps: { neverBundle: shouldNeverBundleDependency },
  },
]);
