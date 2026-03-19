/**
 * 工具自动注册表（Tool Auto-Registry）
 *
 * 使用方式：
 *   工具文件在模块顶层调用 registerToolFactory，即可自动被 openclaw-tools.ts 收录：
 *
 *   ```ts
 *   import { registerToolFactory } from "./registry.js";
 *
 *   registerToolFactory({
 *     name: "my_tool",
 *     // 需要 agentId 的工具：
 *     factory: (opts) => createMyTool({ agentId: opts?.agentId }),
 *     // 不需要 agentId 的工具：
 *     // factory: () => createMyTool(),
 *   });
 *   ```
 *
 * openclaw-tools.ts 在工具数组末尾调用 buildRegisteredTools(opts) 即可补全所有注册工具。
 * 已经在手动数组里的工具会被自动去重（按 name 判断），不会重复添加。
 */

import type { AnyAgentTool } from "./common.js";

export interface ToolFactoryOpts {
  /** 当前 agent 的 ID */
  agentId?: string;
  /** 工作空间目录 */
  workspaceDir?: string;
  /** 当前 agent 的 session key */
  agentSessionKey?: string;
}

export interface ToolFactoryEntry {
  /** 工具名（与 AnyAgentTool.name 对应，用于去重） */
  name: string;
  /** 工具工厂函数 */
  factory: (opts?: ToolFactoryOpts) => AnyAgentTool;
}

/** 全局注册表 */
const _registry: Map<string, ToolFactoryEntry> = new Map();

/**
 * 注册一个工具工厂到自动注册表。
 * 在工具文件的模块顶层调用即可，加载模块时自动完成注册。
 */
export function registerToolFactory(entry: ToolFactoryEntry): void {
  if (_registry.has(entry.name)) {
    // 避免重复注册（HMR / 多次 import 时）
    return;
  }
  _registry.set(entry.name, entry);
}

/**
 * 从注册表构建工具实例列表，自动跳过已存在的工具名（去重）。
 *
 * @param opts          工具工厂参数（agentId 等）
 * @param existingNames 已经手动注册的工具名集合，用于去重
 */
export function buildRegisteredTools(
  opts?: ToolFactoryOpts,
  existingNames?: Set<string>,
): AnyAgentTool[] {
  const result: AnyAgentTool[] = [];
  for (const entry of _registry.values()) {
    if (existingNames?.has(entry.name)) {
      // 已在手动列表中，跳过
      continue;
    }
    try {
      result.push(entry.factory(opts));
    } catch (err) {
      console.error(`[Tool Registry] Failed to instantiate tool "${entry.name}":`, err);
    }
  }
  return result;
}

/**
 * 获取当前注册表中所有工具名（调试用）
 */
export function getRegisteredToolNames(): string[] {
  return Array.from(_registry.keys());
}
