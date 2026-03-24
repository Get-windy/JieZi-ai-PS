// Check which local overlay files are re-exported by plugin-sdk and have fewer lines than upstream
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = "i:/JieZI/JieZi-ai-PS";
const sdkDir = `${root}/upstream/src/plugin-sdk`;
const srcRoot = `${root}/src`;
const upRoot = `${root}/upstream/src`;

const sdkFiles = fs.readdirSync(sdkDir).filter(n => n.endsWith(".ts") && !n.endsWith(".test.ts"));

// Collect all relative imports inside plugin-sdk files
const reExports = {};
for (const sdkFile of sdkFiles) {
  const content = fs.readFileSync(path.join(sdkDir, sdkFile), "utf8");
  // match: export { ... } from "..."  OR  import/export ... from "..."
  const re = /from\s+['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const mod = m[1];
    const resolved = path.resolve(sdkDir, mod).replace(/\\/g, "/");
    const rel = resolved.replace(`${root}/upstream/src/`, "");
    if (!reExports[rel]) reExports[rel] = [];
    reExports[rel].push(sdkFile);
  }
}

// Also collect explicit export * / export { } from patterns
const exportedSymbolsByFile = {};
for (const sdkFile of sdkFiles) {
  const content = fs.readFileSync(path.join(sdkDir, sdkFile), "utf8");
  const re = /export\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const symbols = m[1].split(",").map(s => s.trim().replace(/\s+as\s+\S+/, "")).filter(Boolean);
    const mod = m[2];
    const resolved = path.resolve(sdkDir, mod).replace(/\\/g, "/");
    const rel = resolved.replace(`${root}/upstream/src/`, "");
    if (!exportedSymbolsByFile[rel]) exportedSymbolsByFile[rel] = new Set();
    symbols.forEach(s => exportedSymbolsByFile[rel].add(s));
  }
  // export * from
  const re2 = /export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g;
  while ((m = re2.exec(content)) !== null) {
    const mod = m[1];
    const resolved = path.resolve(sdkDir, mod).replace(/\\/g, "/");
    const rel = resolved.replace(`${root}/upstream/src/`, "");
    if (!exportedSymbolsByFile[rel]) exportedSymbolsByFile[rel] = new Set();
    exportedSymbolsByFile[rel].add("*");
  }
}

const risks = [];

for (const rel of Object.keys(reExports)) {
  const localPath = path.join(srcRoot, rel + ".ts");
  if (!fs.existsSync(localPath)) continue;

  const upPath = path.join(upRoot, rel + ".ts");
  if (!fs.existsSync(upPath)) continue;

  const lc = fs.readFileSync(localPath, "utf8").replace(/\r\n/g, "\n");
  const uc = fs.readFileSync(upPath, "utf8").replace(/\r\n/g, "\n");

  const ll = lc.split("\n").length;
  const ul = uc.split("\n").length;

  // Extract exports from upstream
  const upExports = new Set();
  const upExportRe = /export\s+(?:function|class|const|let|var|type|interface|enum|abstract)\s+(\w+)/g;
  let em;
  while ((em = upExportRe.exec(uc)) !== null) upExports.add(em[1]);
  const upExportRe2 = /export\s+\{([^}]+)\}/g;
  while ((em = upExportRe2.exec(uc)) !== null) {
    em[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()).forEach(s => s && upExports.add(s));
  }

  // Extract exports from local
  const lcExports = new Set();
  const lcExportRe = /export\s+(?:function|class|const|let|var|type|interface|enum|abstract)\s+(\w+)/g;
  while ((em = lcExportRe.exec(lc)) !== null) lcExports.add(em[1]);
  const lcExportRe2 = /export\s+\{([^}]+)\}/g;
  while ((em = lcExportRe2.exec(lc)) !== null) {
    em[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()).forEach(s => s && lcExports.add(s));
  }

  // Find missing exports
  const missing = [...upExports].filter(e => !lcExports.has(e));

  // Only flag if plugin-sdk actually exports these symbols
  const sdkExported = exportedSymbolsByFile[rel];
  const criticalMissing = sdkExported
    ? missing.filter(e => sdkExported.has(e) || sdkExported.has("*"))
    : missing;

  if (criticalMissing.length > 0 || (ll < ul && sdkExported)) {
    risks.push({
      rel,
      localLines: ll,
      upstreamLines: ul,
      usedBy: reExports[rel],
      missingExports: missing,
      criticalMissing,
    });
  }
}

if (risks.length === 0) {
  console.log("No risky local overrides found.");
} else {
  for (const r of risks) {
    console.log(`\n=== RISK: ${r.rel} ===`);
    console.log(`  local: ${r.localLines} lines  upstream: ${r.upstreamLines} lines`);
    console.log(`  used by plugin-sdk: ${r.usedBy.join(", ")}`);
    if (r.criticalMissing.length > 0) {
      console.log(`  CRITICAL missing exports: ${r.criticalMissing.join(", ")}`);
    }
    if (r.missingExports.length > 0) {
      console.log(`  All missing exports vs upstream: ${r.missingExports.join(", ")}`);
    }
  }
}
