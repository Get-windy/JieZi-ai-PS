/**
 * Detects attempts to exfiltrate sensitive data (tokens, keys, credentials,
 * financial info) outside of openclaw via:
 *   1. exec commands (curl/wget/Invoke-WebRequest/nc/scp/…)
 *   2. message tool send actions (Slack/Telegram/Discord/Email/WhatsApp/…)
 *
 * Policy:
 *   - ALLOWED: network requests to internal/localhost targets
 *   - ALLOWED: network requests that do not carry credential-like data
 *   - DENIED:  curl/wget/Invoke-WebRequest/nc targeting an external host
 *              AND passing data that looks like env vars, secrets, or tokens
 *   - DENIED:  message tool send/broadcast/reply containing raw secret values
 *
 * Unlike obfuscation detection (which triggers approval), an exfil violation
 * results in an immediate hard deny — no approval dialog.
 */

export type ExfilDetection = {
  detected: boolean;
  reasons: string[];
  matchedPatterns: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the string looks like it references an internal/localhost target. */
function isInternalHost(url: string): boolean {
  return /(?:localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|host\.docker\.internal)/i.test(
    url,
  );
}

/** True when the command contains any network-sending tool. */
function hasNetworkTool(cmd: string): boolean {
  return /\b(?:curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|nc\b|ncat\b|netcat\b|socat\b|ssh\b|scp\b|rsync\b|ftp\b|sftp\b)\b/i.test(
    cmd,
  );
}

/**
 * True when the command appears to send data to an EXTERNAL host.
 * A command that only talks to localhost/private ranges is considered safe.
 */
function targetIsExternal(cmd: string): boolean {
  if (!hasNetworkTool(cmd)) {
    return false;
  }

  // Extract URLs / hostnames from the command.
  // We look for http(s):// URLs and also bare host:port patterns after -H/-d flags.
  const urlMatches = [...(cmd.matchAll(/https?:\/\/([A-Za-z0-9.\-_]+)/gi) ?? [])].map(
    (m) => m[1] ?? "",
  );

  if (urlMatches.length === 0) {
    // No explicit URL — could be piped or variable-expanded; treat as potentially external
    // only if there are clearly credential-like args present.
    return true;
  }

  // If ALL extracted hosts are internal, this is safe.
  const allInternal = urlMatches.every((host) => isInternalHost(host));
  return !allInternal;
}

// ---------------------------------------------------------------------------
// Credential-carrier patterns
// Checks whether the command itself embeds credential-like data as arguments.
// ---------------------------------------------------------------------------

/** True when the command carries what looks like a raw API key / token / password. */
function commandCarriesCredential(cmd: string): boolean {
  // $ENV_VAR or %ENV_VAR% patterns referencing secret-sounding names
  if (
    /\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIAL|APIKEY)/i.test(
      cmd,
    )
  ) {
    return true;
  }
  if (
    /%[A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIAL|APIKEY)%/i.test(cmd)
  ) {
    return true;
  }

  // Inline high-entropy values: sk-..., ghp_..., AKIA..., Bearer <long token>
  if (/\bsk-[A-Za-z0-9\-_]{20,}\b/.test(cmd)) {
    return true;
  }
  if (/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/.test(cmd)) {
    return true;
  }
  if (/\b(?:AKIA|ASIA|AROA)[A-Z0-9]{16}\b/.test(cmd)) {
    return true;
  }
  if (/\bBearer[ \t]+[A-Za-z0-9\-._~+/]{20,}\b/.test(cmd)) {
    return true;
  }

  // -d / --data / --body flags with long token-looking values
  if (/(?:-d|--data(?:-raw|-binary)?|--body)[ \t]+['"]?[^'"]{40,}['"]?/.test(cmd)) {
    return true;
  }

  // Reading from sensitive files and piping to network: cat .env | curl ...
  if (
    /(?:cat|type|Get-Content)\s+.*?(?:\.env|\.netrc|credentials|\.ssh|openclaw\.json|secrets?|api[-_]?key)/i.test(
      cmd,
    )
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Message tool exfil detection
// ---------------------------------------------------------------------------

/**
 * The set of message tool actions that send content to an external channel.
 * "read", "delete", "pin", "react" etc. do not exfiltrate data.
 */
const OUTBOUND_ACTIONS = new Set([
  "send",
  "sendWithEffect",
  "sendAttachment",
  "reply",
  "thread-reply",
  "broadcast",
  "edit",
]);

/** High-confidence inline secret patterns (no capture group needed — detect presence). */
const SENSITIVE_INLINE_PATTERNS: RegExp[] = [
  // Bearer / Token header values
  /\bBearer[ \t]+[A-Za-z0-9\-._~+/]{20,}/,
  /\bToken[ \t]+[A-Za-z0-9\-._~+/]{20,}/,
  // AWS access keys
  /\b(?:AKIA|ASIA|AROA|AIPA|ANPA|ANVA|APKA)[A-Z0-9]{16}\b/,
  // GitHub tokens
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{82,}\b/,
  // OpenAI / Anthropic style keys
  /\bsk-[A-Za-z0-9\-_]{32,}\b/,
  // ENV var patterns referencing secret names
  /\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIAL|APIKEY)/i,
  /%[A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIAL|APIKEY)%/i,
  // High-entropy hex (40+ chars)
  /\b[0-9a-f]{40,}\b/i,
  // High-entropy base64 (60+ chars)
  /\b[A-Za-z0-9+/]{60,}={0,2}\b/,
  // Credit card numbers (13-19 digits)
  /\b[3-6]\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/,
  // IBAN
  /\b[A-Z]{2}\d{2}[A-Z0-9]{8,30}\b/,
  // KV-style assignments: KEY=value
  /[A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_PASS|_AUTH)[ \t]*=[ \t]*[A-Za-z0-9+/_.~:@!$&*,;=%^#-]{8,}/i,
];

/** Common placeholder values to ignore — avoid false positives. */
const PLACEHOLDER_PATTERN =
  /^(?:x{4,}|0{4,}|your[-_]|<[^>]+>|\*{4,}|placeholder|example|test|demo|changeme|insert)/i;

function looksLikeRealSecretInline(text: string): boolean {
  if (!text || text.length < 8) {
    return false;
  }
  if (PLACEHOLDER_PATTERN.test(text.trim())) {
    return false;
  }
  return SENSITIVE_INLINE_PATTERNS.some((re) => re.test(text));
}

export type MessageExfilDetection = {
  detected: boolean;
  reasons: string[];
};

/**
 * Detects whether a message tool call (args object from the agent) is
 * attempting to send sensitive/credential data via an outbound channel.
 *
 * @param args  The raw tool-call arguments object (action, message, caption, …)
 */
export function detectMessageToolExfil(args: Record<string, unknown>): MessageExfilDetection {
  const action = typeof args.action === "string" ? args.action : "";
  if (!action || !OUTBOUND_ACTIONS.has(action)) {
    return { detected: false, reasons: [] };
  }

  const textFields = ["message", "text", "content", "caption"];
  const reasons: string[] = [];

  for (const field of textFields) {
    const value = args[field];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    if (looksLikeRealSecretInline(value)) {
      reasons.push(
        `message tool "${action}" action contains sensitive data in the "${field}" field`,
      );
      break; // one reason is enough
    }
  }

  return { detected: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Exec command exfil detection
// ---------------------------------------------------------------------------

export function detectExfilAttempt(command: string): ExfilDetection {
  if (!command || !command.trim()) {
    return { detected: false, reasons: [], matchedPatterns: [] };
  }

  const reasons: string[] = [];
  const matchedPatterns: string[] = [];

  if (!hasNetworkTool(command)) {
    return { detected: false, reasons, matchedPatterns };
  }

  if (targetIsExternal(command) && commandCarriesCredential(command)) {
    reasons.push("Network command sends credential-like data to an external host");
    matchedPatterns.push("exfil-credential-to-external");
  }

  // Unconditionally block reading sensitive local files and sending them outbound
  if (
    /(?:cat|type|Get-Content)\s+.*?(?:\.env|\.netrc|credentials|\.ssh\/|openclaw\.json|secrets?\.(?:json|yaml|yml|env|txt))/i.test(
      command,
    ) &&
    targetIsExternal(command)
  ) {
    if (!matchedPatterns.includes("exfil-credential-to-external")) {
      reasons.push("Command reads a sensitive local file and sends output to an external host");
      matchedPatterns.push("exfil-sensitive-file-to-external");
    }
  }

  return {
    detected: matchedPatterns.length > 0,
    reasons,
    matchedPatterns,
  };
}
