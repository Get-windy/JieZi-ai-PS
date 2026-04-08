// 本地覆盖层 postinstall：
// 1. 安装 upstream 子模块依赖（防递归）
// 2. 从 upstream/package.json 同步版本号到根 package.json

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const upstreamPkgPath = resolve(rootDir, "upstream/package.json");
const rootPkgPath = resolve(rootDir, "package.json");

// 1. 安装 upstream 子模块依赖
if (existsSync(upstreamPkgPath) && !process.env.UPSTREAM_INSTALL) {
  try {
    execSync("pnpm install", {
      cwd: resolve(rootDir, "upstream"),
      stdio: "inherit",
      env: { ...process.env, UPSTREAM_INSTALL: "1" },
    });
  } catch {
    // 子模块安装失败不阻断主流程
  }
}

// 2. 从 upstream/package.json 同步版本号
if (existsSync(upstreamPkgPath)) {
  try {
    const upstreamPkg = JSON.parse(readFileSync(upstreamPkgPath, "utf8"));
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
    const upstreamVersion = upstreamPkg.version;

    if (upstreamVersion && rootPkg.version !== upstreamVersion) {
      rootPkg.version = upstreamVersion;
      writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n", "utf8");
      console.log(`[postinstall] 版本号已同步: ${rootPkg.version} → ${upstreamVersion}`);
    }
  } catch (e) {
    console.warn("[postinstall] 版本号同步失败:", e.message);
  }
}
