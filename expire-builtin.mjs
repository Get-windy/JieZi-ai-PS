import fs from "fs";
const file = "src/agents/arena-benchmarks.ts";
let c = fs.readFileSync(file, "utf-8");
const start = c.indexOf("const BUILTIN_BENCHMARKS: ArenaBenchmarkDB = {");
const end = c.indexOf("\n};", start) + 2;
const block = c.slice(start, end);
const newBlock = block.replace(/updatedAt: "[^"]+"/g, 'updatedAt: "2020-01-01"');
fs.writeFileSync(file, c.slice(0, start) + newBlock + c.slice(end), "utf-8");
console.log("done, replaced updatedAt in BUILTIN_BENCHMARKS block");
