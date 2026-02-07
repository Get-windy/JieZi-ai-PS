import type { GatewayBrowserClient } from "../gateway.js";
import type { ModelsStatusSnapshot } from "../types.js";

export type ModelsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  modelsLoading: boolean;
  modelsSnapshot: ModelsStatusSnapshot | null;
  modelsError: string | null;
  modelsLastSuccess: number | null;
};
