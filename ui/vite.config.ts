import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// UI 代码分层规范 (Overlay Architecture)
// ============================================================
//
// 本项目采用「上游回退」机制，代码分为三层：
//
// 【第一层：上游基础层】upstream/ui/src/ui/
//   - 来自上游开源项目的原始代码
//   - 不直接修改！更新上游时整体替换
//   - 包含：基础工具、通用控制器、标准视图
//
// 【第二层：本地覆盖层】ui/src/ui/
//   - 覆盖上游同名文件时，本地版本优先
//   - 文件分两类：
//     A. 上游文件的本地扩展版（含本地业务逻辑）
//        示例：agents.ts、app-render.ts、navigation.ts
//        维护要求：上游更新后需 cherry-pick 合入改进
//     B. 本地独有文件（上游无对应）
//        示例：views/projects.ts、views/organization-management.ts
//        维护要求：自由维护，无需跟踪上游
//
// 【第三层：本地后端层】src/
//   - 本地独有后端业务逻辑（组织/项目/任务/权限等）
//   - 与上游 src/ 完全独立的业务领域，不存在合入关系
//
// 覆盖层判断规则（由 upstreamOverlayPlugin 执行）：
//   导入路径 → 先查 ui/src/ui/ → 找不到 → 回退到 upstream/ui/src/ui/
//
// 定期同步：运行 scripts/ui-overlay-sync.ps1 检查上游与本地差异
// ============================================================

// ========== 三层架构覆盖层插件 ==========
// 实现 upstream/src/ 路径解析机制，用于 UI 构建
const ROOT_DIR = path.resolve(here, "..");
const SRC_DIR = path.join(ROOT_DIR, "src"); // 网关后端 src
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src"); // 上游后端 src
const UI_SRC_DIR = path.join(here, "src"); // 本地 UI src (ui/src)
const UP_UI_SRC_DIR = path.join(ROOT_DIR, "upstream", "ui", "src"); // 上游 UI src
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
  // JS → TS 扩展名映射
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

function upstreamOverlayPlugin(): Plugin {
  return {
    name: "upstream-overlay",
    enforce: "pre", // 在 Vite 默认解析之前运行
    resolveId(source: string, importer: string | undefined) {
      // 跳过虚拟模块、node_modules、非路径标识符
      if (!source || source.startsWith("\0") || source.includes("node_modules")) {
        return null;
      }

      let absTarget: string | null = null;

      // 相对导入："./foo" 或 "../bar" 形式
      if ((source.startsWith("./") || source.startsWith("../")) && importer) {
        absTarget = path.resolve(path.dirname(importer), source);
      }
      // 绝对路径
      else if (path.isAbsolute(source)) {
        absTarget = source;
      }
      // 裸标识符（包名）—— 交给默认解析
      else {
        return null;
      }

      absTarget = path.normalize(absTarget);

      // Case 1: 目标在 ui/src/ 下 → 本地 UI 优先，不存在则回退到 upstream/ui/src/
      if (absTarget.startsWith(UI_SRC_DIR + SEP) || absTarget === UI_SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        } // 本地存在，让默认解析处理
        const rel = path.relative(UI_SRC_DIR, absTarget);
        const upPath = path.join(UP_UI_SRC_DIR, rel);
        const resolved = tryResolveFile(upPath);
        return resolved || null;
      }

      // Case 2: 目标在 upstream/ui/src/ 下 → 检查 ui/src/ 是否有本地覆盖
      if (absTarget.startsWith(UP_UI_SRC_DIR + SEP) || absTarget === UP_UI_SRC_DIR) {
        const rel = path.relative(UP_UI_SRC_DIR, absTarget);
        const localPath = path.join(UI_SRC_DIR, rel);
        const localResult = tryResolveFile(localPath);
        if (localResult) {
          return localResult;
        } // 本地有覆盖版本，使用它
        const upstreamResult = tryResolveFile(absTarget);
        if (upstreamResult) {
          return upstreamResult;
        }
      }

      // Case 3: 目标在 src/（网关后端）下 → 本地优先，回退到 upstream/src/
      if (absTarget.startsWith(SRC_DIR + SEP) || absTarget === SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        }
        const rel = path.relative(SRC_DIR, absTarget);
        const upPath = path.join(UP_SRC_DIR, rel);
        const resolved = tryResolveFile(upPath);
        return resolved || null;
      }

      // Case 4: 目标在 upstream/src/（网关后端）下 → 检查 src/ 是否有本地覆盖
      if (absTarget.startsWith(UP_SRC_DIR + SEP) || absTarget === UP_SRC_DIR) {
        const rel = path.relative(UP_SRC_DIR, absTarget);
        const localPath = path.join(SRC_DIR, rel);
        const localResult = tryResolveFile(localPath);
        if (localResult) {
          return localResult;
        }
        const upstreamResult = tryResolveFile(absTarget);
        if (upstreamResult) {
          return upstreamResult;
        }
      }

      return null;
    },
  };
}

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

export default defineConfig(() => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  return {
    base,
    publicDir: path.resolve(here, "public"),
    plugins: [upstreamOverlayPlugin()],
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
  };
});
