import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(here, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src");
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

function upstreamOverlayPlugin(): Plugin {
  return {
    name: "upstream-overlay",
    enforce: "pre",
    resolveId(source: string, importer: string | undefined) {
      if (!source || source.startsWith("\0") || source.includes("node_modules")) {
        return null;
      }
      let absTarget: string | null = null;
      if ((source.startsWith("./") || source.startsWith("../")) && importer) {
        absTarget = path.resolve(path.dirname(importer), source);
      } else if (path.isAbsolute(source)) {
        absTarget = source;
      } else {
        return null;
      }
      absTarget = path.normalize(absTarget);
      if (absTarget.startsWith(SRC_DIR + SEP) || absTarget === SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        }
        const rel = path.relative(SRC_DIR, absTarget);
        const upPath = path.join(UP_SRC_DIR, rel);
        const resolved = tryResolveFile(upPath);
        return resolved || null;
      }
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

export default defineConfig({
  plugins: [upstreamOverlayPlugin()],
  test: {
    include: [
      // 本地测试文件
      "src/**/*.test.ts",
      // 上游测试文件（本地未覆盖的部分）
      "../upstream/ui/src/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // 排除上游 __screenshots__ 测试
      "../upstream/ui/src/ui/__screenshots__/**",
      // 排陖本地已覆盖的测试（避免与 src/** 重复）
      "../upstream/ui/src/ui/text-direction.test.ts",
      "../upstream/ui/src/ui/chat/tool-helpers.test.ts",
      "../upstream/ui/src/i18n/test/translate.test.ts",
      // 排除上游 views/agents.test.ts（本地 AgentsProps 不兼容）
      "../upstream/ui/src/ui/views/agents.test.ts",
      // 排除 node 环境测试（需要 jsdom，不支持 browser 模式）
      "../upstream/ui/src/ui/gateway.node.test.ts",
      "../upstream/ui/src/ui/app-gateway.sessions.node.test.ts",
      "../upstream/ui/src/ui/storage.node.test.ts",
      // 排除包含 i18n 期望英文的测试（本地已翻译为中文）
      "../upstream/ui/src/ui/views/cron.test.ts",
      "../upstream/ui/src/ui/navigation.test.ts",
      // 排除有环境兼容性问题的测试
      "../upstream/ui/src/ui/app-chat.test.ts",
      "../upstream/ui/src/ui/app-settings.test.ts",
      "../upstream/ui/src/ui/views/agents-panels-tools-skills.browser.test.ts",
    ],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium", name: "chromium" }],
      headless: true,
      ui: false,
    },
  },
});
