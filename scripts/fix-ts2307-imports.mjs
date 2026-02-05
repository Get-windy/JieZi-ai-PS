#!/usr/bin/env node
/**
 * 批量修复 TS2307 错误 - 添加缺失的 .ts 扩展名
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// 需要修复的导入映射
const fixes = [
  // app-render.ts
  { file: "ui/src/ui/app-render.ts", from: "./app-render.helpers", to: "./app-render.helpers.ts" },

  // channels 相关文件
  {
    file: "ui/src/ui/views/channels.account-manager.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.config.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.config.ts",
    from: "./config-form.shared",
    to: "./config-form.shared.ts",
  },
  {
    file: "ui/src/ui/views/channels.discord.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.discord.ts",
    from: "./channels.config",
    to: "./channels.config.ts",
  },
  {
    file: "ui/src/ui/views/channels.googlechat.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.googlechat.ts",
    from: "./channels.config",
    to: "./channels.config.ts",
  },
  {
    file: "ui/src/ui/views/channels.imessage.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.imessage.ts",
    from: "./channels.config",
    to: "./channels.config.ts",
  },
  {
    file: "ui/src/ui/views/channels.signal.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.signal.ts",
    from: "./channels.config",
    to: "./channels.config.ts",
  },
  {
    file: "ui/src/ui/views/channels.slack.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.slack.ts",
    from: "./channels.config",
    to: "./channels.config.ts",
  },
  {
    file: "ui/src/ui/views/channels.telegram.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.telegram.ts",
    from: "./channels.config",
    to: "./channels.config.ts",
  },
  {
    file: "ui/src/ui/views/channels.whatsapp.ts",
    from: "./channels.types",
    to: "./channels.types.ts",
  },
  {
    file: "ui/src/ui/views/channels.whatsapp.ts",
    from: "./channels.config",
    to: "./channels.config.ts",
  },
  {
    file: "ui/src/ui/views/channels.whatsapp.ts",
    from: "./channels.shared",
    to: "./channels.shared.ts",
  },

  // channels.ts
  { file: "ui/src/ui/views/channels.ts", from: "./channels.types", to: "./channels.types.ts" },
  {
    file: "ui/src/ui/views/channels.ts",
    from: "./channels.account-manager",
    to: "./channels.account-manager.ts",
  },
  { file: "ui/src/ui/views/channels.ts", from: "./channels.config", to: "./channels.config.ts" },
  { file: "ui/src/ui/views/channels.ts", from: "./channels.discord", to: "./channels.discord.ts" },
  {
    file: "ui/src/ui/views/channels.ts",
    from: "./channels.googlechat",
    to: "./channels.googlechat.ts",
  },
  {
    file: "ui/src/ui/views/channels.ts",
    from: "./channels.imessage",
    to: "./channels.imessage.ts",
  },
  { file: "ui/src/ui/views/channels.ts", from: "./channels.nostr", to: "./channels.nostr.ts" },
  { file: "ui/src/ui/views/channels.ts", from: "./channels.shared", to: "./channels.shared.ts" },
  { file: "ui/src/ui/views/channels.ts", from: "./channels.signal", to: "./channels.signal.ts" },
  { file: "ui/src/ui/views/channels.ts", from: "./channels.slack", to: "./channels.slack.ts" },
  {
    file: "ui/src/ui/views/channels.ts",
    from: "./channels.telegram",
    to: "./channels.telegram.ts",
  },
  {
    file: "ui/src/ui/views/channels.ts",
    from: "./channels.whatsapp",
    to: "./channels.whatsapp.ts",
  },

  // config-form 相关
  {
    file: "ui/src/ui/views/config-form.node.ts",
    from: "./config-form.shared",
    to: "./config-form.shared.ts",
  },
  {
    file: "ui/src/ui/views/config-form.render.ts",
    from: "./config-form.node",
    to: "./config-form.node.ts",
  },
  {
    file: "ui/src/ui/views/config-form.render.ts",
    from: "./config-form.shared",
    to: "./config-form.shared.ts",
  },
  {
    file: "ui/src/ui/views/config.ts",
    from: "./config-form.shared",
    to: "./config-form.shared.ts",
  },
];

// 按文件分组
const byFile = {};
fixes.forEach((fix) => {
  if (!byFile[fix.file]) byFile[fix.file] = [];
  byFile[fix.file].push(fix);
});

console.log(`📝 准备修复 ${Object.keys(byFile).length} 个文件的 ${fixes.length} 个导入...\\n`);

for (const [filePath, fileFixes] of Object.entries(byFile)) {
  console.log(`🔧 修复 ${filePath} (${fileFixes.length} 个导入)...`);

  try {
    const fullPath = path.join(rootDir, filePath);
    let content = await fs.readFile(fullPath, "utf-8");
    let modified = false;

    for (const fix of fileFixes) {
      const patterns = [
        // import ... from "path"
        new RegExp(`(import\\s+.*?from\\s+["'])${fix.from.replace(/\./g, "\\.")}(["'])`, "g"),
        // import("path")
        new RegExp(`(import\\s*\\(\\s*["'])${fix.from.replace(/\./g, "\\.")}(["']\\s*\\))`, "g"),
      ];

      for (const pattern of patterns) {
        const newContent = content.replace(pattern, `$1${fix.to}$2`);
        if (newContent !== content) {
          content = newContent;
          modified = true;
          console.log(`  ✓ ${fix.from} -> ${fix.to}`);
        }
      }
    }

    if (modified) {
      await fs.writeFile(fullPath, content, "utf-8");
      console.log(`  ✅ 文件已更新`);
    } else {
      console.log(`  ⚠ 没有发现需要修复的导入`);
    }
  } catch (e) {
    console.error(`  ✗ 错误: ${e.message}`);
  }
  console.log("");
}

console.log("✅ 批量修复完成！");
console.log("请运行 pnpm tsc --noEmit 验证结果。");
