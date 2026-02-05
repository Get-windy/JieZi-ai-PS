#!/usr/bin/env node
/**
 * 批量修复 app-render.ts 中的 TS7006 错误
 * 添加常见的回调参数类型
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// 读取错误文件
const errorsFile = path.join(rootDir, "typescript-errors.txt");
const errorsText = await fs.readFile(errorsFile, "utf-8");
const rawLines = errorsText.split(/\r?\n/);

// 合并被截断的行
const lines = [];
let currentLine = "";
for (const line of rawLines) {
  if (line.match(/^[a-zA-Z].*\.ts\(\d+,\d+\):/)) {
    if (currentLine) lines.push(currentLine);
    currentLine = line;
  } else if (currentLine) {
    currentLine += " " + line.trim();
  }
}
if (currentLine) lines.push(currentLine);

// 解析 TS7006 错误
const ts7006Errors = [];
for (const line of lines) {
  const match = line.match(
    /^(.+\.ts)\((\d+),(\d+)\):\s+error\s+TS7006:\s+Parameter '(.+?)' implicitly has an 'any' type\.$/,
  );
  if (match) {
    const [, filePath, lineNum, col, paramName] = match;
    ts7006Errors.push({
      file: filePath,
      line: parseInt(lineNum),
      col: parseInt(col),
      paramName,
    });
  }
}

console.log(`📊 找到 ${ts7006Errors.length} 个 TS7006 错误`);

// 按文件分组
const byFile = {};
ts7006Errors.forEach((err) => {
  if (!byFile[err.file]) byFile[err.file] = [];
  byFile[err.file].push(err);
});

// 常见参数类型映射
const commonTypes = {
  entry: "any",
  group: "any",
  tab: "any",
  next: "string | boolean",
  path: "string",
  value: "any",
  moveFiles: "boolean",
  probe: "any",
  force: "boolean",
  accountId: "string",
  profile: "any",
  field: "string",
  key: "string",
  patch: "any",
  job: "any",
  enabled: "boolean",
  nodeId: "string",
  agentIndex: "number",
  kind: "string",
  agentId: "string",
  row: "any",
  s: "any",
  e: "any",
  skill: "any",
  b: "string",
  c: "string",
  o: "string",
  role: "string",
};

// 修复每个文件
for (const [filePath, errors] of Object.entries(byFile)) {
  console.log(`\n🔧 修复 ${filePath} (${errors.length} 个错误)...`);

  try {
    const fullPath = path.join(rootDir, filePath);
    let content = await fs.readFile(fullPath, "utf-8");
    const fileLines = content.split("\n");

    let modified = false;

    // 按行号倒序处理（避免行号偏移）
    errors.sort((a, b) => b.line - a.line);

    for (const err of errors) {
      const lineIndex = err.line - 1;
      const originalLine = fileLines[lineIndex];

      // 获取参数类型
      const paramType = commonTypes[err.paramName] || "any";

      // 尝试添加类型注解
      // 模式1: (paramName) =>
      let newLine = originalLine.replace(
        new RegExp(`\\(${err.paramName}\\)\\s*=>`),
        `(${err.paramName}: ${paramType}) =>`,
      );

      // 模式2: (param1, paramName) =>
      if (newLine === originalLine) {
        newLine = originalLine.replace(
          new RegExp(`(\\w+),\\s*${err.paramName}\\s*\\)`),
          `$1, ${err.paramName}: ${paramType})`,
        );
      }

      // 模式3: (paramName, param2) =>
      if (newLine === originalLine) {
        newLine = originalLine.replace(
          new RegExp(`\\(${err.paramName}\\s*,\\s*(\\w+)`),
          `(${err.paramName}: ${paramType}, $1`,
        );
      }

      if (newLine !== originalLine) {
        fileLines[lineIndex] = newLine;
        modified = true;
        console.log(`  ✓ 第 ${err.line} 行: ${err.paramName} -> ${paramType}`);
      } else {
        console.log(`  ⚠ 第 ${err.line} 行: 无法自动修复 ${err.paramName}`);
      }
    }

    if (modified) {
      await fs.writeFile(fullPath, fileLines.join("\n"), "utf-8");
      console.log(`  ✅ 文件已更新`);
    }
  } catch (e) {
    console.error(`  ✗ 错误: ${e.message}`);
  }
}

console.log("\n✅ 批量修复完成！");
console.log("请运行 pnpm tsc --noEmit 验证结果。");
