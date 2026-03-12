import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================
// Overlay 模块解析补丁
// 作用：当 jiti/CJS 加载器在 src/ 下找不到文件时，自动回退到 upstream/src/
// 这与 rolldown overlay-plugin 的逻辑对称，让 jiti 运行时也具备相同能力
// ============================================================

const __thisDir = path.dirname(fileURLToPath(import.meta.url));
// 定位项目根目录（src/plugins/loader.ts → 上两级）
const ROOT_DIR = path.resolve(__thisDir, "../..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src");

const tsExts = [".ts", ".tsx", ".mts", ".cts"];
const jsExts = [".js", ".mjs", ".cjs", ".jsx"];

function tryResolveFile(base: string): string | null {
  // 已有扩展名
  if (fs.existsSync(base)) {
    return base;
  }
  // 尝试 ts 扩展
  for (const ext of tsExts) {
    const p = base + ext;
    if (fs.existsSync(p)) {
      return p;
    }
  }
  // 剥除 .js/.mjs 尾缀，尝试替换为 .ts
  for (const jsExt of jsExts) {
    if (base.endsWith(jsExt)) {
      const stem = base.slice(0, -jsExt.length);
      for (const ext of tsExts) {
        const p = stem + ext;
        if (fs.existsSync(p)) {
          return p;
        }
      }
      break;
    }
  }
  return null;
}

let overlayPatchInstalled = false;

function installOverlayPatch() {
  if (overlayPatchInstalled) {
    return;
  }
  overlayPatchInstalled = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _Module = Module as any;
  const original: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => string = _Module._resolveFilename.bind(_Module);

  _Module._resolveFilename = function (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
    options?: unknown,
  ): string {
    try {
      return original(request, parent, isMain, options);
    } catch (err) {
      // 只处理绝对路径或以 src/ 开头的请求（jiti 解析后通常是绝对路径）
      let absRequest: string | null = null;

      if (path.isAbsolute(request)) {
        absRequest = path.normalize(request);
      } else if (parent?.filename && (request.startsWith("./") || request.startsWith("../"))) {
        absRequest = path.normalize(path.resolve(path.dirname(parent.filename), request));
      }

      if (absRequest) {
        // 如果目标在 src/ 下找不到 → 尝试 upstream/src/ 对应路径
        if (absRequest.startsWith(SRC_DIR + path.sep) || absRequest === SRC_DIR) {
          const rel = path.relative(SRC_DIR, absRequest);
          const upPath = path.join(UP_SRC_DIR, rel);
          const resolved = tryResolveFile(upPath);
          if (resolved) {
            return original(resolved, parent, isMain, options);
          }
        }
      }

      throw err;
    }
  };
}

// 在模块加载时立即安装补丁
installOverlayPatch();

// 重新导出 upstream loader 的所有内容
export * from "../../upstream/src/plugins/loader.js";
