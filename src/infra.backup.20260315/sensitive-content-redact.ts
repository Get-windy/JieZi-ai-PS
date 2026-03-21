/**
 * Redacts sensitive values (API keys, tokens, passwords, financial data) from
 * text before it is returned to the agent model. The agent can still see that
 * a key exists (the variable name / label is kept), but cannot read its value.
 *
 * Replacement marker: [REDACTED]
 *
 * Design notes:
 * - Only replaces the VALUE portion, not the key name, so the agent retains
 *   context about what kind of credential is present.
 * - Patterns are intentionally conservative to avoid false positives on normal
 *   source code (e.g. placeholder strings like "your-api-key-here").
 * - Minimum value length of 8 characters filters trivial/demo values.
 */

const REDACTED = "[REDACTED]";
const MIN_SECRET_LENGTH = 8;

type RedactPattern = {
  id: string;
  /** Regex with a single capture group `(value)` for the secret portion. */
  regex: RegExp;
};

// ---------------------------------------------------------------------------
// Key=Value assignment patterns  (e.g. in .env files, config files)
// ---------------------------------------------------------------------------
const KV_PATTERNS: RedactPattern[] = [
  // KEY=value  or  KEY = value  (bare or quoted)
  // e.g. API_KEY=sk-abc123, SECRET="my-secret", PASSWORD='pass'
  {
    id: "env-assignment",
    regex:
      /(?:^|[\r\n])[ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_PASS|_PWD|_AUTH|_CREDENTIAL|_CRED|_APIKEY|_API_KEY|_ACCESS_KEY|_PRIVATE_KEY|_SIGNING_KEY)[ \t]*=[ \t]*['"]?([A-Za-z0-9+/_.~:@!$&*,;=%^#-]{8,})['"]?/gim,
  },
  // Generic  KEY=value  where the key name alone screams secret
  // (catches patterns like  TOKEN=xxx  even without the above suffixes)
  {
    id: "env-token-assignment",
    regex:
      /(?:^|[\r\n])[ \t]*(?:export[ \t]+)?(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|AUTH_KEY|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|BOT_TOKEN|WEBHOOK_TOKEN|SIGNING_SECRET)[ \t]*=[ \t]*['"]?([A-Za-z0-9+/_.~:@!$&*,;=%^#-]{8,})['"]?/gim,
  },
];

// ---------------------------------------------------------------------------
// JSON / YAML property value patterns
// ---------------------------------------------------------------------------
const JSON_PATTERNS: RedactPattern[] = [
  // "key": "value"  or  "key": 'value'
  {
    id: "json-property",
    regex:
      /"(?:token|secret|password|passwd|apiKey|api_key|accessKey|access_key|privateKey|private_key|clientSecret|client_secret|authKey|auth_key|signingKey|signing_key|botToken|bot_token|webhookSecret|webhook_secret|refreshToken|refresh_token|bearerToken|bearer_token)"[ \t]*:[ \t]*['"]([A-Za-z0-9+/_.~:@!$&*,;=%^#-]{8,})['"]/gi,
  },
  // yaml: key: value  (unquoted)
  {
    id: "yaml-property",
    regex:
      /^[ \t]*(?:token|secret|password|passwd|apiKey|api_key|accessKey|access_key|privateKey|private_key|clientSecret|client_secret|authKey|auth_key|signingKey|signing_key|botToken|bot_token|webhookSecret|webhook_secret|refreshToken|refresh_token|bearerToken|bearer_token)[ \t]*:[ \t]+([A-Za-z0-9+/_.~:@!$&*,;=%^#-]{8,})[ \t]*$/gim,
  },
];

// ---------------------------------------------------------------------------
// Inline token patterns  (token appears directly in text, URL, header, etc.)
// ---------------------------------------------------------------------------
const INLINE_PATTERNS: RedactPattern[] = [
  // Authorization: Bearer <token>
  {
    id: "bearer-token",
    regex: /\bBearer[ \t]+([A-Za-z0-9\-._~+/]{20,}={0,2})\b/g,
  },
  // Authorization: Token <token>
  {
    id: "auth-token-header",
    regex: /\bToken[ \t]+([A-Za-z0-9\-._~+/]{20,}={0,2})\b/g,
  },
  // AWS-style access keys: AKIA... / ASIA...
  {
    id: "aws-access-key",
    regex: /\b((?:AKIA|ASIA|AROA|AIPA|ANPA|ANVA|APKA)[A-Z0-9]{16})\b/g,
  },
  // GitHub tokens: ghp_... / gho_... / ghu_... / ghs_... / github_pat_...
  {
    id: "github-token",
    regex: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82,})\b/g,
  },
  // OpenAI/Anthropic-style keys: sk-... (at least 32 chars after sk-)
  {
    id: "sk-key",
    regex: /\b(sk-[A-Za-z0-9\-_]{32,})\b/g,
  },
  // Generic high-entropy hex secrets (40+ hex chars — SHA1 length or longer)
  {
    id: "hex-secret",
    regex: /\b([0-9a-f]{40,})\b/gi,
  },
  // Generic high-entropy base64 secrets (60+ base64 chars)
  {
    id: "base64-secret",
    regex: /\b([A-Za-z0-9+/]{60,}={0,2})\b/g,
  },
];

// ---------------------------------------------------------------------------
// Financial information patterns
// ---------------------------------------------------------------------------
const FINANCIAL_PATTERNS: RedactPattern[] = [
  // Credit card numbers: 13–19 digits, may be space/dash separated
  {
    id: "credit-card",
    regex: /\b([3-6]\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7})\b/g,
  },
  // IBAN: 2 letters + 2 digits + 8-30 alphanumeric
  {
    id: "iban",
    regex: /\b([A-Z]{2}\d{2}[A-Z0-9]{8,30})\b/g,
  },
  // Chinese bank card: 16-19 digits starting with 3-6
  {
    id: "cn-bank-card",
    regex: /\b([3-6]\d{15,18})\b/g,
  },
];

const ALL_PATTERNS: RedactPattern[] = [
  ...KV_PATTERNS,
  ...JSON_PATTERNS,
  ...INLINE_PATTERNS,
  ...FINANCIAL_PATTERNS,
];

/**
 * Returns true if the captured value looks like a real secret
 * (not a placeholder like "your-api-key-here" or "xxxxx").
 */
function looksLikeRealSecret(value: string): boolean {
  if (value.length < MIN_SECRET_LENGTH) {
    return false;
  }
  // Common placeholder patterns — skip
  if (
    /^(x{4,}|0{4,}|your[-_]|<[^>]+>|\*{4,}|placeholder|example|test|demo|changeme|insert)/i.test(
      value,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Redact sensitive values from a text string.
 * Returns the redacted text and the count of replacements made.
 */
export function redactSensitiveContent(text: string): { text: string; redactedCount: number } {
  if (!text) {
    return { text, redactedCount: 0 };
  }

  let result = text;
  let redactedCount = 0;

  for (const pattern of ALL_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.regex.lastIndex = 0;
    result = result.replace(pattern.regex, (match, captured) => {
      if (typeof captured === "string" && looksLikeRealSecret(captured)) {
        redactedCount += 1;
        return match.replace(captured, REDACTED);
      }
      return match;
    });
    pattern.regex.lastIndex = 0;
  }

  return { text: result, redactedCount };
}
