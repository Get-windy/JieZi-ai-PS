import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptName = path.basename(fileURLToPath(import.meta.url));
const upstreamScript = path.resolve(__dirname, "..", "upstream", "scripts", scriptName);
const projectRoot = path.resolve(__dirname, "..");

const proc = spawn(process.execPath, [upstreamScript, ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

proc.on("exit", (code) => process.exit(code ?? 1));
