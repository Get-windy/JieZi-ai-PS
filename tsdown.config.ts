import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsdown";

// ========== 三层架构覆盖层插件 ==========
// 实现 src/ 覆盖 upstream/src/ 的物理分离机制：
//   - 当 src/ 中的文件被删除（与upstream相同）时，自动回退到 upstream/src/
//   - 当 upstream/src/ 代码导入文件时，优先检查 src/ 是否有本地覆盖版本
const ROOT_DIR = path.resolve(import.meta.dirname);
const SRC_DIR = path.join(ROOT_DIR, "src");
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src");
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
      if (absTarget.startsWith(SRC_DIR + SEP) || absTarget === SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        } // 本地存在，让默认解析处理
        const rel = path.relative(SRC_DIR, absTarget);
        const upPath = path.join(UP_SRC_DIR, rel);
        return tryResolveFile(upPath);
      }

      // Case 2: 目标在 upstream/src/ 下 → 检查 src/ 是否有本地覆盖
      if (absTarget.startsWith(UP_SRC_DIR + SEP) || absTarget === UP_SRC_DIR) {
        const rel = path.relative(UP_SRC_DIR, absTarget);
        const localPath = path.join(SRC_DIR, rel);
        const localResult = tryResolveFile(localPath);
        if (localResult) {
          return localResult;
        } // 本地有覆盖版本，使用它
        // 无本地覆盖，返回 upstream 文件路径
        return tryResolveFile(absTarget);
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

// 禁用 chunkOptimization 解决 __exportAll is not a function 错误
// 参考: https://github.com/rolldown/rolldown/issues/8184
// 该选项会尝试将公共模块直接插入现有 chunk，可能导致循环依赖
const inputOptions = {
  experimental: {
    chunkOptimization: false,
  },
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: "src/entry.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
    env,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: "src/plugin-sdk/account-id.ts",
    outDir: "dist/plugin-sdk",
    env,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
]);
