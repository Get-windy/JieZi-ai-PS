export * from "../../upstream/src/plugins/provider-auth-choice-helpers.js";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const BLOCKED_MERGE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function sanitizeConfigPatchValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeConfigPatchValue(entry));
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (BLOCKED_MERGE_KEYS.has(key)) {
      continue;
    }
    next[key] = sanitizeConfigPatchValue(nestedValue);
  }
  return next;
}

export function mergeConfigPatch<T>(base: T, patch: unknown): T {
  if (!isPlainRecord(base) || !isPlainRecord(patch)) {
    return sanitizeConfigPatchValue(patch) as T;
  }

  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (BLOCKED_MERGE_KEYS.has(key)) {
      continue;
    }
    const existing = next[key];
    if (isPlainRecord(existing) && isPlainRecord(value)) {
      next[key] = mergeConfigPatch(existing, value);
    } else {
      next[key] = sanitizeConfigPatchValue(value);
    }
  }
  return next as T;
}