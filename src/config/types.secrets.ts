export * from "../../upstream/src/config/types.secrets.js";

export function isSecretRef(value: unknown): value is import("../../upstream/src/config/types.secrets.js").SecretRef {
  if (!isRecord(value)) {
    return false;
  }
  if (Object.keys(value).length !== 3) {
    return false;
  }
  return (
    (value.source === "env" || value.source === "file" || value.source === "exec") &&
    typeof value.provider === "string" &&
    value.provider?.trim().length > 0 &&
    typeof value.id === "string" &&
    value.id?.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}