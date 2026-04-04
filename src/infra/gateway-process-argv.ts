function normalizeProcArg(arg: string): string {
  return arg.replaceAll("\\", "/").toLowerCase();
}

export function parseProcCmdline(raw: string): string[] {
  return raw
    .split("\0")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseWindowsCmdline(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) {
    args.push(current);
  }
  return args;
}

export function isGatewayArgv(args: string[], opts?: { allowGatewayBinary?: boolean }): boolean {
  const normalized = args.map(normalizeProcArg);
  if (!normalized.includes("gateway")) {
    return false;
  }

  const entryCandidates = [
    "dist/index.js",
    "dist/entry.js",
    "openclaw.mjs",
    "scripts/run-node.mjs",
    "src/index.ts",
  ];
  if (normalized.some((arg) => entryCandidates.some((entry) => arg.endsWith(entry)))) {
    return true;
  }

  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  return (
    exe.endsWith("/openclaw") ||
    exe === "openclaw" ||
    (opts?.allowGatewayBinary === true && exe.endsWith("/openclaw-gateway"))
  );
}
