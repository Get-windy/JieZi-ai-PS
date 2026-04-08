export { mapThinkingLevel } from "../../../upstream/src/agents/pi-embedded-runner/utils.js";
export type {
  ReasoningLevel,
  ThinkLevel,
} from "../../../upstream/src/agents/pi-embedded-runner/utils.js";

export function describeUnknownError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  if (typeof err === "number" || typeof err === "bigint") {
    return err.toString();
  }
  if (typeof err === "boolean") {
    return err ? "true" : "false";
  }
  if (err && typeof err === "object") {
    if ("message" in err && typeof err.message === "string") {
      return err.message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }
  return "Unknown error";
}
