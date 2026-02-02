#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const HASH_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/.bundle.hash");
const OUTPUT_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/a2ui.bundle.js");
const A2UI_RENDERER_DIR = path.join(ROOT_DIR, "vendor/a2ui/renderers/lit");
const A2UI_APP_DIR = path.join(ROOT_DIR, "apps/shared/OpenClawKit/Tools/CanvasA2UI");

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(entryPath) {
  const files = [];
  
  async function recurse(p) {
    const st = await fs.stat(p);
    if (st.isDirectory()) {
      const entries = await fs.readdir(p);
      for (const entry of entries) {
        await recurse(path.join(p, entry));
      }
      return;
    }
    files.push(p);
  }
  
  await recurse(entryPath);
  return files;
}

async function computeHash(inputPaths) {
  const files = [];
  
  for (const inputPath of inputPaths) {
    const pathFiles = await walk(inputPath);
    files.push(...pathFiles);
  }
  
  files.sort((a, b) => {
    const normA = a.split(path.sep).join("/");
    const normB = b.split(path.sep).join("/");
    return normA.localeCompare(normB);
  });
  
  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = path.relative(ROOT_DIR, filePath).split(path.sep).join("/");
    hash.update(rel);
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }
  
  return hash.digest("hex");
}

async function main() {
  try {
    // Check if source directories exist (Docker builds may exclude them)
    const rendererExists = await pathExists(A2UI_RENDERER_DIR);
    const appExists = await pathExists(A2UI_APP_DIR);
    
    if (!rendererExists || !appExists) {
      console.log("A2UI sources missing; keeping prebuilt bundle.");
      process.exit(0);
    }
    
    const inputPaths = [
      path.join(ROOT_DIR, "package.json"),
      path.join(ROOT_DIR, "pnpm-lock.yaml"),
      A2UI_RENDERER_DIR,
      A2UI_APP_DIR,
    ];
    
    const currentHash = await computeHash(inputPaths);
    
    // Check if bundle is up to date
    if (await pathExists(HASH_FILE)) {
      const previousHash = await fs.readFile(HASH_FILE, "utf8");
      const outputExists = await pathExists(OUTPUT_FILE);
      
      if (previousHash.trim() === currentHash && outputExists) {
        console.log("A2UI bundle up to date; skipping.");
        process.exit(0);
      }
    }
    
    // Build the bundle
    console.log("Building A2UI bundle...");
    
    // Run TypeScript compilation
    const tsconfigPath = path.join(A2UI_RENDERER_DIR, "tsconfig.json");
    execSync(`pnpm -s exec tsc -p "${tsconfigPath}"`, {
      stdio: "inherit",
      cwd: ROOT_DIR,
    });
    
    // Run rolldown bundling
    const rolldownConfig = path.join(A2UI_APP_DIR, "rolldown.config.mjs");
    execSync(`pnpm -s exec rolldown -c "${rolldownConfig}"`, {
      stdio: "inherit",
      cwd: ROOT_DIR,
    });
    
    // Save the hash
    await fs.writeFile(HASH_FILE, currentHash);
    
    console.log("A2UI bundle complete.");
  } catch (error) {
    console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
    console.error("If this persists, verify pnpm deps and try again.");
    console.error(error.message);
    process.exit(1);
  }
}

main();
