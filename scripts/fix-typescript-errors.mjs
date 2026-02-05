#!/usr/bin/env node
/**
 * 批量修复 TypeScript 错误
 * 1. TS2835: 添加 .ts/.js 扩展名
 * 2. TS7006: 添加类型注解
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// 读取错误报告
const errorsFile = path.join(rootDir, "typescript-errors.txt");
const errorsText = await fs.readFile(errorsFile, "utf-8");
const rawLines = errorsText.split(/\r?\n/);

// 合并被截断的行
const lines = [];
let currentLine = "";
for (const line of rawLines) {
  if (line.match(/^[a-zA-Z].*\.ts\(\d+,\d+\):/)) {
    // 新错误行开始
    if (currentLine) lines.push(currentLine);
    currentLine = line;
  } else if (currentLine) {
    // 续行
    currentLine += " " + line.trim();
  }
}
if (currentLine) lines.push(currentLine);

// 解析错误
const errors = [];
for (const line of lines) {
  // 匹配错误行格式: file.ts(line,col): error TS####: message
  const match = line.match(/^(.+\.ts)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  if (match) {
    const [, filePath, lineNum, col, errorCode, message] = match;
    errors.push({
      file: filePath,
      line: parseInt(lineNum),
      col: parseInt(col),
      code: errorCode,
      message: message.trim(),
      fullLine: line,
    });
  }
}

console.log(`📊 找到 ${errors.length} 个错误`);

// 按错误类型分组
const byType = {};
errors.forEach((err) => {
  if (!byType[err.code]) byType[err.code] = [];
  byType[err.code].push(err);
});

console.log("\n错误分布:");
Object.entries(byType).forEach(([code, errs]) => {
  console.log(`  ${code}: ${errs.length} 个`);
});

// 修复 TS2835: 缺少扩展名
if (byType["TS2835"]) {
  console.log(`\n🔧 开始修复 TS2835 (${byType["TS2835"].length} 个)...`);

  const fileGroups = {};
  byType["TS2835"].forEach((err) => {
    if (!fileGroups[err.file]) fileGroups[err.file] = [];
    fileGroups[err.file].push(err);
  });

  for (const [filePath, fileErrors] of Object.entries(fileGroups)) {
    try {
      const fullPath = path.join(rootDir, filePath);
      let content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");

      let modified = false;

      for (const err of fileErrors) {
        const lineIndex = err.line - 1;
        const originalLine = lines[lineIndex];

        // 提取建议的扩展名
        const suggestMatch = err.message.match(/Did you mean ['"](.+)['"]\?/);
        if (suggestMatch) {
          const suggested = suggestMatch[1];

          // 找到导入语句中的路径
          const importMatch = originalLine.match(/from\s+["']([^"']+)["']/);
          if (importMatch) {
            const oldPath = importMatch[1];
            const newLine = originalLine
              .replace(`from "${oldPath}"`, `from "${suggested}"`)
              .replace(`from '${oldPath}'`, `from '${suggested}'`);

            if (newLine !== originalLine) {
              lines[lineIndex] = newLine;
              modified = true;
              console.log(`  ✓ ${filePath}:${err.line}`);
            }
          }
        }
      }

      if (modified) {
        await fs.writeFile(fullPath, lines.join("\n"), "utf-8");
      }
    } catch (e) {
      console.error(`  ✗ ${filePath}: ${e.message}`);
    }
  }
}

// 修复 TS7006: 隐式 any 类型
if (byType["TS7006"]) {
  console.log(`\n🔧 开始修复 TS7006 (${byType["TS7006"].length} 个)...`);
  console.log("  (需要手动处理，脚本生成建议)");

  // 按文件分组
  const fileGroups = {};
  byType["TS7006"].forEach((err) => {
    if (!fileGroups[err.file]) fileGroups[err.file] = [];
    fileGroups[err.file].push(err);
  });

  console.log(`\n  涉及 ${Object.keys(fileGroups).length} 个文件:`);
  Object.entries(fileGroups).forEach(([file, errs]) => {
    console.log(`    ${file}: ${errs.length} 个隐式 any`);
  });
}

console.log("\n✅ 修复完成！");
console.log("请运行 pnpm tsc --noEmit 验证修复效果。");
