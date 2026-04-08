/**
 * Detects command obfuscation patterns that could be used to bypass
 * security controls. Unlike exfil detection (hard deny), obfuscation
 * detection triggers an approval flow rather than an immediate block.
 *
 * Patterns detected:
 *   - Piping directly to shell interpreters (pipe-to-shell)
 *   - Encoded/compressed payloads decoded at runtime (base64-decode, eval-decode)
 *   - Environment variable–based command construction (env-var-exec)
 *   - Hex/octal escape sequences used to hide command intent (hex-escape)
 */

export type ObfuscationDetection = {
  detected: boolean;
  reasons: string[];
  matchedPatterns: string[];
};

type ObfuscationRule = {
  pattern: string;
  regex: RegExp;
  reason: string;
};

const OBFUSCATION_RULES: ObfuscationRule[] = [
  {
    pattern: "pipe-to-shell",
    regex: /\|\s*(?:bash|sh|zsh|ksh|csh|tcsh|fish|dash|pwsh|powershell)\b/i,
    reason: "Content piped directly to shell interpreter",
  },
  {
    pattern: "base64-decode",
    regex:
      /(?:base64\s+(?:--?decode|-d)|openssl\s+(?:base64|enc)\s+(?:-d|-A|-a))|(?:\|\s*base64\s+(?:-d|--decode))/i,
    reason: "Base64-encoded payload decoded at runtime",
  },
  {
    pattern: "eval-decode",
    regex:
      /\beval\s*(?:\(|`|\$\()|(?:\$\((?:base64|openssl|python|perl|ruby)\s)|(?:\bexec\s*\(\s*(?:base64|decode))/i,
    reason: "Encoded or compressed payload executed via eval",
  },
  {
    pattern: "env-var-exec",
    regex: /\$\{[^}]*:-.*(?:bash|sh|curl|wget|nc|python|perl|ruby)[^}]*\}|\$\(\$[A-Z_]+\)/i,
    reason: "Shell variable expansion used to construct or hide executed command",
  },
  {
    pattern: "hex-escape",
    regex: /(?:\\x[0-9a-fA-F]{2}){4,}|(?:\\[0-7]{3}){4,}|\$'\\.+'/,
    reason: "Hex or octal escape sequences used to obscure command content",
  },
  {
    pattern: "backtick-subshell",
    regex: /`[^`]{3,}`.*(?:bash|sh|exec|eval)/i,
    reason: "Backtick subshell used to hide executed command",
  },
];

/**
 * Analyzes a shell command string for obfuscation patterns.
 * Returns detected=true with reasons/matchedPatterns if any are found.
 */
export function detectCommandObfuscation(command: string): ObfuscationDetection {
  const reasons: string[] = [];
  const matchedPatterns: string[] = [];

  for (const rule of OBFUSCATION_RULES) {
    if (rule.regex.test(command)) {
      reasons.push(rule.reason);
      matchedPatterns.push(rule.pattern);
    }
  }

  return {
    detected: reasons.length > 0,
    reasons,
    matchedPatterns,
  };
}
