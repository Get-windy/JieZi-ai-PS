import type { RuntimeApi } from "openclaw/plugin-sdk";

let _runtime: RuntimeApi | undefined;

export function setSimpleWecomRuntime(runtime: RuntimeApi) {
  _runtime = runtime;
}

export function getSimpleWecomRuntime() {
  if (!_runtime) throw new Error("SimpleWeCom runtime not initialized");
  return _runtime;
}

export function setWecomRuntime(runtime: RuntimeApi) {
  setSimpleWecomRuntime(runtime);
}

export function getWecomRuntime() {
  return getSimpleWecomRuntime();
}
