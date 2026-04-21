import fs, { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type UserConfig } from "tsdown";
import {
  collectBundledPluginBuildEntries,
  listBundledPluginRuntimeDependencies,
  NON_PACKAGED_BUNDLED_PLUGIN_DIRS,
} from "./upstream/scripts/lib/bundled-plugin-build-entries.mjs";
import { buildPluginSdkEntrySources } from "./upstream/scripts/lib/plugin-sdk-entries.mjs";

// ========== 三层架构覆盖层插件 ==========
// 实现 src/ 覆盖 upstream/src/ 的物理分离机制：
//   - 当 src/ 中的文件被删除（与upstream相同）时，自动回退到 upstream/src/
//   - 当 upstream/src/ 代码导入文件时，优先检查 src/ 是否有本地覆盖版本
const ROOT_DIR = path.resolve(import.meta.dirname);
const SRC_DIR = path.join(ROOT_DIR, "src");
const EXT_DIR = path.join(ROOT_DIR, "extensions");
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src");
const UP_EXT_DIR = path.join(ROOT_DIR, "upstream", "extensions");
const SEP = path.sep;
const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".json"];

// .js → .ts 扩展名映射（TypeScript 允许以 .js 扩展名导入 .ts 文件）
const JS_TO_TS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

function tryResolveFile(basePath: string): string | null {
  // 精确路径
  if (existsSync(basePath)) {
    return basePath;
  }
  // 附加扩展名
  for (const ext of TS_EXTENSIONS) {
    const p = basePath + ext;
    if (existsSync(p)) {
      return p;
    }
  }
  // 索引文件
  for (const ext of TS_EXTENSIONS) {
    const p = path.join(basePath, "index" + ext);
    if (existsSync(p)) {
      return p;
    }
  }
  // JS → TS 扩展名映射（例如 import "./foo.js" 实际指向 ./foo.ts）
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
      // 跳过虚拟模块、node_modules、非路径标识符
      if (!source || source.startsWith("\0") || source.includes("node_modules")) {
        return null;
      }

      let absTarget: string | null = null;

      // 入口点："src/index.ts" 形式
      if (source.startsWith("src/") || source.startsWith("src\\")) {
        absTarget = path.resolve(ROOT_DIR, source);
      }
      // 相对导入："./foo" 或 "../bar" 形式
      else if ((source.startsWith("./") || source.startsWith("../")) && importer) {
        absTarget = path.resolve(path.dirname(importer), source);
      }
      // 绝对路径
      else if (path.isAbsolute(source)) {
        absTarget = source;
      }
      // 裸标识符（包名如 "lodash"）—— 交给默认解析
      else {
        return null;
      }

      absTarget = path.normalize(absTarget);

      // Case 1: 目标在 src/ 下 → 本地优先，不存在则回退到 upstream/src/
      // 例外：如果路径落入 src/extensions/，则回退到并列的 upstream/extensions/（而非 upstream/src/extensions/）
      if (absTarget.startsWith(SRC_DIR + SEP) || absTarget === SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null; // 本地存在，让默认解析处理
        }
        const rel = path.relative(SRC_DIR, absTarget);
        // 如果落入 src/extensions/ 子路径，回退到 upstream/extensions/ 而非 upstream/src/extensions/
        if (rel.startsWith("extensions" + SEP) || rel === "extensions") {
          const extRel = rel.slice("extensions".length + SEP.length);
          return tryResolveFile(path.join(UP_EXT_DIR, extRel));
        }
        return tryResolveFile(path.join(UP_SRC_DIR, rel));
      }

      // Case 2: 目标在 extensions/ 下 → 本地优先，不存在则回退到 upstream/extensions/
      if (absTarget.startsWith(EXT_DIR + SEP) || absTarget === EXT_DIR) {
        if (tryResolveFile(absTarget)) {
          return null; // 本地存在，让默认解析处理
        }
        const rel = path.relative(EXT_DIR, absTarget);
        const upExtPath = path.join(UP_EXT_DIR, rel);
        return tryResolveFile(upExtPath);
      }

      // Case 3: 目标在 upstream/src/ 下 → 检查 src/ 是否有本地覆盖
      if (absTarget.startsWith(UP_SRC_DIR + SEP) || absTarget === UP_SRC_DIR) {
        const rel = path.relative(UP_SRC_DIR, absTarget);
        const localPath = path.join(SRC_DIR, rel);
        const localResult = tryResolveFile(localPath);
        if (localResult) {
          // 自循环检测：如果找到的本地覆盖文件就是 importer 自身，跳过，直接用 upstream
          const importerNorm = importer ? path.normalize(importer) : null;
          if (importerNorm && path.normalize(localResult) === importerNorm) {
            return null; // 让默认解析处理 upstream 文件，避免自循环
          }
          // 桥接文件检测：如果 importer 是 localResult 对应的桥接文件（*-upstream-extras.ts），
          // 也跳过 overlay，避免「桥接文件 → upstream → 本地覆盖文件 → 桥接文件」循环
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
              return null; // 桥接文件不需要 overlay 重定向，直接访问 upstream 原始文件
            }
          }
          return localResult; // 本地有覆盖版本，使用它
        }
        // 无本地覆盖：显式解析 upstream 路径（处理 .js → .ts 映射），避免默认解析失败
        const upstreamResult = tryResolveFile(absTarget);
        if (upstreamResult) {
          return upstreamResult;
        }
      }

      // Case 4: 目标在 upstream/extensions/ 下 → 检查 extensions/ 是否有本地覆盖
      if (absTarget.startsWith(UP_EXT_DIR + SEP) || absTarget === UP_EXT_DIR) {
        const rel = path.relative(UP_EXT_DIR, absTarget);
        const localExtPath = path.join(EXT_DIR, rel);
        const localResult = tryResolveFile(localExtPath);
        if (localResult) {
          return localResult; // 本地有覆盖版本，使用它
        }
        return tryResolveFile(absTarget); // 无本地覆盖，直接返回 upstream/extensions/ 路径
      }

      return null;
    },
  };
}

const overlayPlugin = upstreamOverlayPlugin();

const env = {
  NODE_ENV: "production",
};

// 外部化原生模块和问题依赖，避免 rolldown 尝试打包它们
const explicitExternalDeps = [
  "@lancedb/lancedb",
  "@matrix-org/matrix-sdk-crypto-nodejs",
  "matrix-js-sdk",
];

const external = [
  /^@reflink\//,
  /\.node$/,
  // 外部化 @mariozechner/pi-coding-agent，避免 __exportAll 错误
  // 该包是纯 ESM 模块，必须在运行时动态加载
  /^@mariozechner\/pi-coding-agent$/,
  /^@mariozechner\/pi-ai$/,
  /^@mariozechner\/pi-agent-core$/,
  /^@mariozechner\/pi-tui$/,
];

const bundledPluginBuildEntries = collectBundledPluginBuildEntries();
const bundledPluginRuntimeDependencies = listBundledPluginRuntimeDependencies();
const shouldBuildPrivateQaEntries = process.env.OPENCLAW_BUILD_PRIVATE_QA === "1";

const allNeverBundleDependencies = [
  ...explicitExternalDeps,
  ...bundledPluginRuntimeDependencies,
].toSorted((a, b) => a.localeCompare(b));

function shouldNeverBundleDependency(id: string): boolean {
  return allNeverBundleDependencies.some(
    (dep) => id === dep || id.startsWith(`${dep}/`),
  );
}

function isPluginSdkSelfReference(id: string): boolean {
  return (
    id === "openclaw/plugin-sdk" ||
    id.startsWith("openclaw/plugin-sdk/") ||
    id === "@openclaw/plugin-sdk" ||
    id.startsWith("@openclaw/plugin-sdk/")
  );
}

function shouldStageBundledPluginRuntimeDependencies(packageJson: unknown): boolean {
  return (
    typeof packageJson === "object" &&
    packageJson !== null &&
    (packageJson as { openclaw?: { bundle?: { stageRuntimeDependencies?: boolean } } }).openclaw
      ?.bundle?.stageRuntimeDependencies === true
  );
}

function buildBundledPluginNeverBundlePredicate(packageJson: {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}) {
  const runtimeDependencies = shouldStageBundledPluginRuntimeDependencies(packageJson)
    ? [
        ...Object.keys(packageJson.dependencies ?? {}),
        ...Object.keys(packageJson.optionalDependencies ?? {}),
      ].toSorted((a, b) => a.localeCompare(b))
    : [];

  return (id: string): boolean => {
    if (isPluginSdkSelfReference(id)) {
      return true;
    }
    return runtimeDependencies.some(
      (dependency) => id === dependency || id.startsWith(`${dependency}/`),
    );
  };
}

function listBundledPluginEntrySources(
  entries: Array<{ id: string; packageJson: unknown; sourceEntries: string[] }>,
): Record<string, string> {
  return Object.fromEntries(
    entries.flatMap(({ id, sourceEntries }) =>
      sourceEntries.map((entry) => {
        const normalizedEntry = entry.replace(/^\.\//u, "");
        const entryKey = `extensions/${id}/${normalizedEntry.replace(/\.[^.]+$/u, "")}`;
        return [entryKey, normalizedEntry ? `extensions/${id}/${normalizedEntry}` : `extensions/${id}`];
      }),
    ),
  );
}

function normalizeBundledPluginOutEntry(entry: string): string {
  return entry.replace(/^\.\//u, "").replace(/\.[^.]+$/u, "");
}

function buildBundledHookEntries(): Record<string, string> {
  const hooksRoot = path.join(ROOT_DIR, "src", "hooks", "bundled");
  const entries: Record<string, string> = {};
  if (!fs.existsSync(hooksRoot)) {
    return entries;
  }
  for (const dirent of fs.readdirSync(hooksRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {continue;}
    const handlerPath = path.join(hooksRoot, dirent.name, "handler.ts");
    if (!fs.existsSync(handlerPath)) {continue;}
    entries[`bundled/${dirent.name}/handler`] = handlerPath;
  }
  return entries;
}

const bundledHookEntries = buildBundledHookEntries();

// 禁用 chunkOptimization 解决 __exportAll is not a function 错误
// 参考: https://github.com/rolldown/rolldown/issues/8184
const baseInputOptions = {
  experimental: { chunkOptimization: false },
};

// manualChunks：将插件加载器及其缓存依赖强制提取为单一共享 chunk。
// 背景：rolldown 在 chunkOptimization:false 模式下会将多个模块内联进多个 chunk，
// 每份内联各自持有独立的 Map/Set 实例导致缓存永远 MISS。
const pluginLoaderManualChunks = (id: string): string | undefined => {
  const norm = id.replace(/\\/g, "/");
  if (norm.includes("upstream/src/plugins/loader") || norm.includes("src/plugins/loader"))
    {return "plugin-loader";}
  if (norm.includes("upstream/src/plugins/discovery") || norm.includes("src/plugins/discovery"))
    {return "plugin-loader";}
  if (norm.includes("upstream/src/plugins/manifest-registry") || norm.includes("src/plugins/manifest-registry"))
    {return "plugin-loader";}
  if (norm.includes("upstream/src/plugins/sdk-alias") || norm.includes("src/plugins/sdk-alias"))
    {return "plugin-loader";}
  if (norm.includes("upstream/src/plugins/public-surface-loader") || norm.includes("src/plugins/public-surface-loader"))
    {return "plugin-loader";}
  return undefined;
};

const outputOptionsWithManualChunks = { manualChunks: pluginLoaderManualChunks };

function nodeBuildConfig(config: UserConfig): UserConfig {
  return {
    ...config,
    env,
    fixedExtension: false,
    platform: "node",
    plugins: [overlayPlugin, ...(config.plugins ?? [])],
    inputOptions: baseInputOptions,
    outputOptions: outputOptionsWithManualChunks,
  };
}

/** 与上游 buildCoreDistEntries() 对齐，包含本项目需要的额外入口。
 * write-cli-compat.ts 会扫描 daemon-cli 和 runner chunk，自动拼合完整导出。 */
function buildCoreDistEntries(): Record<string, string> {
  const upstreamEntries: Record<string, string> = {
    index: "src/index.ts",
    entry: "src/entry.ts",
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    "cli/daemon-cli": "src/cli/daemon-cli.ts",
    // Keep long-lived lazy runtime boundaries on stable filenames so rebuilt
    // dist/ trees do not strand already-running gateways on stale hashed chunks.
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

  // 过滤掉本地和 upstream 都不存在的入口
  return Object.fromEntries(
    Object.entries(upstreamEntries).filter(([, srcPath]) => {
      const local = path.resolve(ROOT_DIR, srcPath);
      const up = path.resolve(ROOT_DIR, "upstream", srcPath);
      return existsSync(local) || existsSync(up);
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
    ({ id, packageJson }) =>
      !shouldStageBundledPluginRuntimeDependencies(packageJson) &&
      (shouldBuildPrivateQaEntries || !NON_PACKAGED_BUNDLED_PLUGIN_DIRS.has(id)),
  );

  return {
    ...coreEntries,
    // Internal compat artifact for the root-alias.cjs lazy loader.
    "plugin-sdk/compat": "src/plugin-sdk/compat.ts",
    ...pluginSdkEntries,
    ...qaEntries,
    ...listBundledPluginEntrySources(rootBundledPluginBuildEntries),
    ...bundledHookEntries,
  };
}

function buildBundledPluginConfigs(): UserConfig[] {
  const stagedBundledPluginBuildEntries = bundledPluginBuildEntries.filter(
    ({ packageJson }) => shouldStageBundledPluginRuntimeDependencies(packageJson),
  );
  return stagedBundledPluginBuildEntries.map(({ id, packageJson, sourceEntries }) =>
    nodeBuildConfig({
      clean: false,
      entry: Object.fromEntries(
        sourceEntries.map((entry) => [
          normalizeBundledPluginOutEntry(entry),
          `extensions/${id}/${entry.replace(/^\.\//u, "")}`,
        ]),
      ),
      outDir: `dist/extensions/${id}`,
      deps: {
        neverBundle: buildBundledPluginNeverBundlePredicate(
          (packageJson ?? {}) as {
            dependencies?: Record<string, string>;
            optionalDependencies?: Record<string, string>;
          },
        ),
      },
    }),
  );
}

export default defineConfig([
  nodeBuildConfig({
    // Build core entrypoints, plugin-sdk subpaths, bundled plugin entrypoints,
    // and bundled hooks in one graph so runtime singletons are emitted once.
    clean: true,
    entry: buildUnifiedDistEntries(),
    deps: {
      neverBundle: shouldNeverBundleDependency,
    },
  }),
  ...buildBundledPluginConfigs(),
]);
