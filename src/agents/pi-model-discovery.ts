import path from "node:path";

// 延迟导入以避免顶级 await 导致的问题
let piCodingAgentModule: typeof import("@mariozechner/pi-coding-agent") | null = null;

function getPiCodingAgent(): typeof import("@mariozechner/pi-coding-agent") {
  if (!piCodingAgentModule) {
    try {
      // 尝试使用 require 加载
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      piCodingAgentModule = require("@mariozechner/pi-coding-agent");
    } catch (requireError) {
      // 如果 require 失败，尝试从不同的路径加载
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require("@mariozechner/pi-coding-agent/dist/index.js");
        piCodingAgentModule = pkg;
      } catch (distError) {
        // 尝试加载默认导出
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const pkg = require("@mariozechner/pi-coding-agent");
          piCodingAgentModule = pkg.default || pkg;
        } catch (finalError) {
          throw new Error(
            `Failed to load @mariozechner/pi-coding-agent: ${finalError instanceof Error ? finalError.message : String(finalError)}`,
            { cause: requireError },
            { cause: distError },
            { cause: finalError },
          );
        }
      }
    }
  }
  return piCodingAgentModule!;
}

// 使用 getter 延迟加载
export function getAuthStorage() {
  return getPiCodingAgent().AuthStorage;
}

export function getModelRegistry() {
  return getPiCodingAgent().ModelRegistry;
}

// 为了向后兼容，保持旧的导出名称但使用 getter
export const AuthStorage = new Proxy({} as any, {
  get(_target, prop) {
    const AS = getPiCodingAgent().AuthStorage;
    return AS[prop as keyof typeof AS];
  },
  construct(_target, args) {
    const AS = getPiCodingAgent().AuthStorage;
    return new AS(...(args as [string]));
  },
});

export const ModelRegistry = new Proxy({} as any, {
  get(_target, prop) {
    const MR = getPiCodingAgent().ModelRegistry;
    return MR[prop as keyof typeof MR];
  },
  construct(_target, args) {
    const MR = getPiCodingAgent().ModelRegistry;
    return new MR(...(args as [any, string]));
  },
});

// Compatibility helpers for pi-coding-agent 0.50+ (discover* helpers removed).
export function discoverAuthStorage(agentDir: string): any {
  const AS = getPiCodingAgent().AuthStorage;
  return new AS(path.join(agentDir, "auth.json"));
}

export function discoverModels(authStorage: any, agentDir: string): any {
  const MR = getPiCodingAgent().ModelRegistry;
  return new MR(authStorage, path.join(agentDir, "models.json"));
}
