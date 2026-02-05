#!/usr/bin/env node
// 批量修复剩余的类型错误
import { readFileSync, writeFileSync } from "fs";

const filePath = "ui/src/ui/app-render.ts";
let content = readFileSync(filePath, "utf-8");

// 1. 修复 string | boolean 错误 - 将回调参数改为 string
const fixes = [
  // onSkillsFilterChange
  {
    from: /onSkillsFilterChange: \(next: string \| boolean\) => \(state\.skillsFilter = next\)/g,
    to: "onSkillsFilterChange: (next: string) => (state.skillsFilter = next)",
  },
  // onFilterChange
  {
    from: /onFilterChange: \(next: string \| boolean\) => \(state\.skillsFilter = next\)/g,
    to: "onFilterChange: (next: string) => (state.skillsFilter = next)",
  },
  // onBindDefault - 添加 | null
  {
    from: /onBindDefault: \(nodeId: string\) =>/g,
    to: "onBindDefault: (nodeId: string | null) =>",
  },
  // onBindAgent - 添加 | null
  {
    from: /onBindAgent: \(agentIndex: number, nodeId: string\) =>/g,
    to: "onBindAgent: (agentIndex: number, nodeId: string | null) =>",
  },
  // onExecApprovalsTargetChange - 修复类型
  {
    from: /onExecApprovalsTargetChange: \(kind: string, nodeId: string\) =>/g,
    to: 'onExecApprovalsTargetChange: (kind: "gateway" | "node", nodeId: string | null) =>',
  },
  // state.execApprovalsTarget 赋值
  {
    from: /state\.execApprovalsTarget = kind;/g,
    to: 'state.execApprovalsTarget = kind as "gateway" | "node";',
  },
  // onExecApprovalsPatch - 修复 path 类型
  {
    from: /onExecApprovalsPatch: \(path: string, value: any\) =>/g,
    to: "onExecApprovalsPatch: (path: (string | number)[], value: any) =>",
  },
  // config.agents 类型断言
  {
    from: /const config = configValue;/g,
    to: "const config = configValue as { agents?: { list?: any[] } } | null;",
  },
];

let modified = false;
for (const fix of fixes) {
  if (content.match(fix.from)) {
    content = content.replace(fix.from, fix.to);
    modified = true;
    console.log(`✅ Fixed: ${fix.from.source.substring(0, 50)}...`);
  }
}

if (modified) {
  writeFileSync(filePath, content, "utf-8");
  console.log(`\n✨ Successfully updated ${filePath}`);
} else {
  console.log("⚠️  No matches found");
}
