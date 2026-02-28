import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function getA2uiPaths(env = process.env) {
  // 支持三层架构：优先 src/，回退到 upstream/src/
  const localSrcDir = path.join(repoRoot, "src", "canvas-host", "a2ui");
  const upstreamSrcDir = path.join(repoRoot, "upstream", "src", "canvas-host", "a2ui");
  const srcDir = env.OPENCLAW_A2UI_SRC_DIR ?? localSrcDir;
  const outDir = env.OPENCLAW_A2UI_OUT_DIR ?? path.join(repoRoot, "dist", "canvas-host", "a2ui");
  return { srcDir, outDir, upstreamSrcDir };
}

export async function copyA2uiAssets({ srcDir, outDir, upstreamSrcDir }: { srcDir: string; outDir: string; upstreamSrcDir?: string }) {
  const skipMissing = process.env.OPENCLAW_A2UI_SKIP_MISSING === "1";
  let effectiveSrcDir = srcDir;
  
  // 检查 srcDir，如果不存在且提供了 upstreamSrcDir，则回退到 upstream
  try {
    await fs.stat(path.join(srcDir, "index.html"));
    await fs.stat(path.join(srcDir, "a2ui.bundle.js"));
  } catch (err) {
    // 如果 srcDir 失败，尝试 upstreamSrcDir
    if (upstreamSrcDir) {
      try {
        await fs.stat(path.join(upstreamSrcDir, "index.html"));
        await fs.stat(path.join(upstreamSrcDir, "a2ui.bundle.js"));
        effectiveSrcDir = upstreamSrcDir;
        console.log(`A2UI assets not found in ${srcDir}, using upstream: ${upstreamSrcDir}`);
      } catch (upstreamErr) {
        const message = 'Missing A2UI bundle assets. Run "pnpm canvas:a2ui:bundle" and retry.';
        if (skipMissing) {
          console.warn(`${message} Skipping copy (OPENCLAW_A2UI_SKIP_MISSING=1).`);
          return;
        }
        throw new Error(message, { cause: upstreamErr });
      }
    } else {
      const message = 'Missing A2UI bundle assets. Run "pnpm canvas:a2ui:bundle" and retry.';
      if (skipMissing) {
        console.warn(`${message} Skipping copy (OPENCLAW_A2UI_SKIP_MISSING=1).`);
        return;
      }
      throw new Error(message, { cause: err });
    }
  }
  
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  await fs.cp(effectiveSrcDir, outDir, { recursive: true });
}

async function main() {
  const { srcDir, outDir, upstreamSrcDir } = getA2uiPaths();
  await copyA2uiAssets({ srcDir, outDir, upstreamSrcDir });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
