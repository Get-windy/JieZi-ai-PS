/**
 * Detects commands that would terminate processes indiscriminately (without
 * specifying any target — no process name, no PID). This protects the gateway
 * from being accidentally killed by an agent-executed shell command.
 *
 * Policy:
 *   - ALLOWED: targeting by name  (e.g. `Stop-Process -Name node`,
 *     `taskkill /IM node.exe`, `killall node`, `pkill node`)
 *   - ALLOWED: targeting by PID   (e.g. `Stop-Process -Id 1234`,
 *     `taskkill /PID 1234`, `kill 1234`)
 *   - DENIED:  no target at all   (e.g. bare `Stop-Process`,
 *     `taskkill` without /IM or /PID, `kill -9 -1`)
 *
 * Unlike obfuscation detection (which triggers approval), a self-protect
 * violation results in an immediate hard deny — no approval dialog.
 */

export type SelfProtectDetection = {
  detected: boolean;
  reasons: string[];
  matchedPatterns: string[];
};

type SelfProtectPattern = {
  id: string;
  description: string;
  /** Returns true when the command is dangerous (indiscriminate). */
  test: (cmd: string) => boolean;
};

/**
 * PowerShell Stop-Process with no -Name / -Id / -InputObject argument.
 * DENIED:  `Stop-Process`, `Stop-Process -Force`
 * ALLOWED: `Stop-Process -Name node`, `Stop-Process -Id 123`
 */
function isIndiscriminateStopProcess(cmd: string): boolean {
  if (!/Stop-Process\b/i.test(cmd)) {
    return false;
  }
  // Has a specific target → safe
  if (/(?:-Name|-ProcessName|-Id|-InputObject)\b/i.test(cmd)) {
    return false;
  }
  // Piped from Get-Process (carries its own target) → safe
  if (/Get-Process\b/i.test(cmd)) {
    return false;
  }
  return true;
}

/**
 * taskkill with no /IM (image name) and no /PID argument.
 * DENIED:  `taskkill`, `taskkill /F`
 * ALLOWED: `taskkill /IM node.exe`, `taskkill /PID 1234`
 */
function isIndiscriminateTaskkill(cmd: string): boolean {
  if (!/\btaskkill\b/i.test(cmd)) {
    return false;
  }
  if (/\/IM\b/i.test(cmd)) {
    return false;
  }
  if (/\/PID\b/i.test(cmd)) {
    return false;
  }
  return true;
}

/**
 * Unix `kill` with PID -1 (signals every process the user can reach).
 * DENIED:  `kill -9 -1`, `kill -TERM -1`
 * ALLOWED: `kill 1234`, `kill -9 1234`
 */
function isKillMinusOne(cmd: string): boolean {
  return /\bkill\b.*\s-1\b/.test(cmd);
}

const PATTERNS: SelfProtectPattern[] = [
  {
    id: "indiscriminate-stop-process",
    description: "Stop-Process called without any target (-Name / -Id)",
    test: isIndiscriminateStopProcess,
  },
  {
    id: "indiscriminate-taskkill",
    description: "taskkill called without /IM or /PID filter",
    test: isIndiscriminateTaskkill,
  },
  {
    id: "kill-all-processes",
    description: "kill -1 (signals all accessible processes)",
    test: isKillMinusOne,
  },
];

export function detectSelfProtectViolation(command: string): SelfProtectDetection {
  if (!command || !command.trim()) {
    return { detected: false, reasons: [], matchedPatterns: [] };
  }

  const reasons: string[] = [];
  const matchedPatterns: string[] = [];

  for (const pattern of PATTERNS) {
    if (pattern.test(command)) {
      reasons.push(pattern.description);
      matchedPatterns.push(pattern.id);
    }
  }

  return {
    detected: matchedPatterns.length > 0,
    reasons,
    matchedPatterns,
  };
}
