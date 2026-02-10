import { createRequire } from "node:module";
import path from "node:path";

// 使用 createRequire 创建 require 函数以兼容 ESM 模块
const require = createRequire(import.meta.url);

// 延迟导入以避免顶层 await 导致的问题
let piCodingAgentModule: any = null;

/**
 * 动态加载 @mariozechner/pi-coding-agent 模块
 * 该包是纯 ESM 模块，使用动态 import() 加载
 * tsdown 配置了 external，不会被打包，运行时从 node_modules 加载
 */
async function loadPiCodingAgent() {
  if (!piCodingAgentModule) {
    try {
      // 使用动态 import，符合 ESM 规范
      piCodingAgentModule = await import("@mariozechner/pi-coding-agent");
    } catch (error) {
      throw new Error(
        `Failed to load @mariozechner/pi-coding-agent: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  return piCodingAgentModule;
}

// 同步版本，供不支持 async 的调用方使用
// 注意：如果模块还未加载，这将抛出错误
function getPiCodingAgentSync() {
  if (!piCodingAgentModule) {
    throw new Error(
      "@mariozechner/pi-coding-agent has not been loaded yet. Please call loadPiCodingAgent() first.",
    );
  }
  return piCodingAgentModule;
}

// 异步版本 - 推荐使用
export async function getAuthStorage() {
  const mod = await loadPiCodingAgent();
  return mod.AuthStorage;
}

export async function getModelRegistry() {
  const mod = await loadPiCodingAgent();
  return mod.ModelRegistry;
}

// 同步版本 - 仅当模块已加载时使用
export function getAuthStorageSync() {
  const mod = getPiCodingAgentSync();
  return mod.AuthStorage;
}

export function getModelRegistrySync() {
  const mod = getPiCodingAgentSync();
  return mod.ModelRegistry;
}

// 为了向后兼容，保持旧的导出名称但使用 getter
// 注意：这些 Proxy 导出需要模块已经被加载
export const AuthStorage = new Proxy({} as any, {
  get(_target, prop) {
    const AS = getPiCodingAgentSync().AuthStorage;
    return AS[prop as keyof typeof AS];
  },
  construct(_target, args) {
    const AS = getPiCodingAgentSync().AuthStorage;
    return new AS(...(args as [string]));
  },
});

export const ModelRegistry = new Proxy({} as any, {
  get(_target, prop) {
    const MR = getPiCodingAgentSync().ModelRegistry;
    return MR[prop as keyof typeof MR];
  },
  construct(_target, args) {
    const MR = getPiCodingAgentSync().ModelRegistry;
    return new MR(...(args as [any, string]));
  },
});

// Compatibility helpers for pi-coding-agent 0.50+ (discover* helpers removed).
export function discoverAuthStorage(agentDir: string): any {
  const AS = getPiCodingAgentSync().AuthStorage;
  return new AS(path.join(agentDir, "auth.json"));
}

export function discoverModels(authStorage: any, agentDir: string): any {
  const MR = getPiCodingAgentSync().ModelRegistry;
  return new MR(authStorage, path.join(agentDir, "models.json"));
}

// 预加载函数 - 在使用同步 API 之前调用
export async function preloadPiCodingAgent() {
  await loadPiCodingAgent();
}
