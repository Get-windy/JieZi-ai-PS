// Deep scan: local overlay files with fewer lines than upstream AND missing exported symbols
import fs from "node:fs";
import path from "node:path";

const root = "i:/JieZI/JieZi-ai-PS";
const srcRoot = `${root}/src`;
const upRoot = `${root}/upstream/src`;

function getExports(code) {
  const found = new Set();
  // export function/class/const/let/var/type/interface/enum/abstract
  const re1 = /export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum|abstract\s+class)\s+(\w+)/g;
  let m;
  while ((m = re1.exec(code)) !== null) found.add(m[1]);
  // export { a, b as c }
  const re2 = /export\s+\{([^}]+)\}/g;
  while ((m = re2.exec(code)) !== null) {
    m[1].split(",").forEach(s => {
      const name = s.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^\w+$/.test(name)) found.add(name);
    });
  }
  return found;
}

function scanDir(relDir) {
  const srcDir = path.join(srcRoot, relDir);
  const upDir = path.join(upRoot, relDir);
  if (!fs.existsSync(srcDir) || !fs.existsSync(upDir)) return [];
  
  const results = [];
  let files;
  try { files = fs.readdirSync(srcDir).filter(n => n.endsWith(".ts") && !n.endsWith(".test.ts") && !n.endsWith(".test-harness.ts")); }
  catch { return []; }

  for (const n of files) {
    const upPath = path.join(upDir, n);
    if (!fs.existsSync(upPath)) continue;
    
    const lc = fs.readFileSync(path.join(srcDir, n), "utf8").replace(/\r\n/g, "\n");
    const uc = fs.readFileSync(upPath, "utf8").replace(/\r\n/g, "\n");
    if (lc === uc) continue;
    
    const ll = lc.split("\n").length;
    const ul = uc.split("\n").length;
    if (ll >= ul) continue; // local has more or equal lines — not the risky case
    
    const lcExp = getExports(lc);
    const ucExp = getExports(uc);
    const missing = [...ucExp].filter(e => !lcExp.has(e));
    
    if (missing.length > 0) {
      results.push({ file: `${relDir}/${n}`, localLines: ll, upLines: ul, missing });
    }
  }
  return results;
}

const dirs = ["agents", "infra", "gateway", "config", "routing", "plugins", "cli", "hooks", "utils", "commands", "auto-reply"];
const allRisks = [];
for (const d of dirs) allRisks.push(...scanDir(d));

// Also scan subdirs of agents
const agentSubdirs = ["agents/pi-embedded-runner", "agents/pi-embedded-runner/run", "agents/sandbox", "agents/tools", "agents/schema"];
for (const d of agentSubdirs) allRisks.push(...scanDir(d));

if (allRisks.length === 0) {
  console.log("✅ No local overlay files with missing exports found.");
} else {
  console.log(`Found ${allRisks.length} risky files:\n`);
  for (const r of allRisks) {
    console.log(`FILE: ${r.file}  (local:${r.localLines} up:${r.upLines})`);
    console.log(`  missing exports: ${r.missing.join(", ")}`);
  }
}
