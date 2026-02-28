import type { GatewayBrowserClient } from "../gateway.js";
import type { ModelsStatusSnapshot } from "../types.js";

export type ModelsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  modelsLoading: boolean;
  modelsSnapshot: ModelsStatusSnapshot | null;
  modelsError: string | null;
  modelsLastSuccess: number | null;
  testingAuthId: string | null; // 正在测试的认证ID
  oauthReauth: {
    authId: string;
    provider: string;
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    expiresIn: number;
    interval: number;
    isPolling: boolean;
    error?: string;
  } | null; // OAuth重认证状态
};
