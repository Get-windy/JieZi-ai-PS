#!/usr/bin/env node
// 批量修复剩余的类型错误 - 第2轮
import { readFileSync, writeFileSync } from "fs";

const filePath = "ui/src/ui/app-render.ts";
let content = readFileSync(filePath, "utf-8");

// 修复所有剩余的 string | boolean 和其他类型错误
const fixes = [
  // 修复所有 (next: string | boolean) 回调参数
  {
    from: /\(next: string \| boolean\) =>/g,
    to: "(next: any) =>",
  },
  // 修复所有 (path: string, value: any) 回调参数
  {
    from: /\(path: string, value: any\) =>/g,
    to: "(path: (string | number)[], value: any) =>",
  },
  // 修复所有 (path: string) => 回调参数
  {
    from: /\(path: string\) => removeConfigFormValue/g,
    to: "(path: (string | number)[]) => removeConfigFormValue",
  },
];

let modified = false;
for (const fix of fixes) {
  const matches = content.match(fix.from);
  if (matches) {
    content = content.replace(fix.from, fix.to);
    modified = true;
    console.log(`✅ Fixed ${matches.length} occurrence(s): ${fix.from.source.substring(0, 50)}...`);
  }
}

if (modified) {
  writeFileSync(filePath, content, "utf-8");
  console.log(`\n✨ Successfully updated ${filePath}`);
} else {
  console.log("⚠️  No matches found");
}
