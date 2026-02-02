import type { RuntimeApi } from "openclaw/plugin-sdk";

let runtime: RuntimeApi | null = null;

export function setDingtalkRuntime(api: RuntimeApi): void {
  runtime = api;
}

export function getDingtalkRuntime(): RuntimeApi {
  if (!runtime) {
    throw new Error("DingTalk runtime not initialized");
  }
  return runtime;
}
