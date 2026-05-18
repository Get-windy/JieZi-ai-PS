import path from "node:path";
export { detectBinary } from "../../upstream/src/infra/detect-binary.js";
import { runCommandWithTimeout } from "../../upstream/src/process/exec.js";

export type BinaryDetectionResult = {
  found: boolean;
  version?: string;
  path?: string;
};

export async function detectBinaryDetail(name: string): Promise<BinaryDetectionResult> {
  if (!name?.trim()) {
    return { found: false };
  }

  const found = await detectBinary(name);
  if (!found) {
    return { found: false };
  }

  try {
    const versionCmd =
      process.platform === "win32"
        ? ["cmd", "/c", `${name} --version 2>&1 || ${name} version 2>&1`]
        : ["/bin/sh", "-c", `${name} --version 2>&1 || ${name} version 2>&1`];

    const versionResult = await runCommandWithTimeout(versionCmd, { timeoutMs: 5000 });
    const version = versionResult.stdout?.trim() || undefined;

    const whichCmd =
      process.platform === "win32" ? ["where", name] : ["/usr/bin/env", "which", name];

    const whichResult = await runCommandWithTimeout(whichCmd, { timeoutMs: 2000 });
    const resolvedPath = whichResult.stdout?.trim() || undefined;

    return {
      found: true,
      ...(version ? { version } : {}),
      ...(resolvedPath ? { path: resolvedPath } : {}),
    };
  } catch {
    return { found: true };
  }
}

export async function detectBinariesBatch(
  toolNames: string[],
): Promise<Map<string, BinaryDetectionResult>> {
  const results = new Map<string, BinaryDetectionResult>();

  const chunks: string[][] = [];
  const concurrency = 8;
  for (let i = 0; i < toolNames.length; i += concurrency) {
    chunks.push(toolNames.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (name) => {
        const result = await detectBinaryDetail(name);
        results.set(name, result);
      }),
    );
  }

  return results;
}
