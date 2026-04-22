// prebuild 阶段：从 upstream/package.json 自动同步版本号到根 package.json
// 确保每次构建前版本号与上游对齐，无需手动维护硬编码版本号

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncVersionFromUpstream } from "./postinstall-local.mjs";

syncVersionFromUpstream();

// pnpm 在 upstream/extensions/*/node_modules 里创建的 HardLink 会导致
// rolldown (Rust IO) 在 Windows 上报 "拒绝访问" (os error 5)。
// 将受影响目录下的 HardLink 文件复制为普通文件以规避此问题。
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM_EXTENSIONS = path.join(ROOT_DIR, "upstream", "extensions");

// 检查目录下是否存在 HardLink 文件（nlink > 1 表示有多个硬链接）
function hasHardLinks(dir) {
  if (!fs.existsSync(dir)) {
    return false;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasHardLinks(full)) {
        return true;
      }
    } else if (entry.isFile()) {
      if (fs.statSync(full).nlink > 1) {
        return true;
      }
    }
  }
  return false;
}

function deHardlinkDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      deHardlinkDir(full);
    } else if (entry.isFile()) {
      if (fs.statSync(full).nlink > 1) {
        const content = fs.readFileSync(full);
        fs.unlinkSync(full);
        fs.writeFileSync(full, content);
      }
    }
  }
}

if (fs.existsSync(UPSTREAM_EXTENSIONS)) {
  for (const ext of fs.readdirSync(UPSTREAM_EXTENSIONS, { withFileTypes: true })) {
    if (!ext.isDirectory()) {
      continue;
    }
    const nmDir = path.join(UPSTREAM_EXTENSIONS, ext.name, "node_modules");
    if (fs.existsSync(nmDir) && hasHardLinks(nmDir)) {
      console.log(`[prebuild] deHardlink: ${nmDir}`);
      deHardlinkDir(nmDir);
    }
  }
}
