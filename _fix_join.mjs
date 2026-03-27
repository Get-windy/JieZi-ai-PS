import fs from "node:fs";

const file = "extensions/memory-core/index.ts";
let src = fs.readFileSync(file, "utf8");

// 修复 lines.join 里含真实换行的字符串
// 在 TypeScript 模板字面量中，join 的参数必须是 "\n" 转义序列，不能是字面换行
const bad = `\`<memory-index>
Your personal memory index (use memory_get by ID or memory_list to read details):
\${lines.join("
")}
</memory-index>\``;

const good =
  '`<memory-index>\\nYour personal memory index (use memory_get by ID or memory_list to read details):\\n${lines.join("\\n")}\\n</memory-index>`';

if (!src.includes(bad)) {
  console.error("anchor not found, dumping nearby chars...");
  const idx = src.indexOf("<memory-index>");
  console.log(JSON.stringify(src.slice(idx - 20, idx + 200)));
  process.exit(1);
}

src = src.replace(bad, good);
fs.writeFileSync(file, src, "utf8");
console.log("OK: join fix applied");
