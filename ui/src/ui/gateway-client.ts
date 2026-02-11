/**
 * Gateway Client with call() method wrapper
 * Provides a consistent API response format: { ok, data, error }
 */

import { GatewayBrowserClient as BaseGatewayBrowserClient } from "./gateway.js";

export type CallResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
};

export class GatewayBrowserClient extends BaseGatewayBrowserClient {
  constructor(options: any) {
    super(options);
    // 调试：确认 call 方法已定义
    console.log("[GatewayClient] Initialized with call() method:", typeof this.call === "function");
  }

  /**
   * Call a gateway method and return a standardized response
   * @param method - The RPC method name (e.g. "agent.modelAccounts.bound")
   * @param params - The parameters to pass to the method
   * @returns A promise that resolves to { ok, data, error }
   */
  async call<T = unknown>(method: string, params?: unknown): Promise<CallResponse<T>> {
    console.log("[GatewayClient.call] Calling method:", method, "with params:", params);
    try {
      const data = await this.request<T>(method, params);
      console.log("[GatewayClient.call] Success:", method, "data:", data);
      return {
        ok: true,
        data,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[GatewayClient.call] Error:", method, "error:", errorMessage);
      return {
        ok: false,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}
