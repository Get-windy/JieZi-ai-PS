/**
 * Shared constants for the Kilo Gateway (kilocode) provider.
 * Mirrors upstream/src/plugins/provider-model-kilocode.ts for use in src/ local layer.
 */

export const KILOCODE_BASE_URL = "https://api.kilo.ai/api/gateway/";
export const KILOCODE_DEFAULT_MODEL_ID = "kilo/auto";
export const KILOCODE_DEFAULT_MODEL_REF = `kilocode/${KILOCODE_DEFAULT_MODEL_ID}`;
export const KILOCODE_DEFAULT_MODEL_NAME = "Kilo Auto";

export const KILOCODE_DEFAULT_CONTEXT_WINDOW = 1000000;
export const KILOCODE_DEFAULT_MAX_TOKENS = 128000;
export const KILOCODE_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;
