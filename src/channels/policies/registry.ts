/**
 * 策略注册表
 * 用于注册和查找策略处理器
 */

import type { PolicyHandler } from "./types.js";

/**
 * 策略注册表
 * 单例模式，管理所有策略处理器
 */
export class PolicyRegistry {
  private static handlers = new Map<string, PolicyHandler>();

  /**
   * 注册策略处理器
   * @param handler 策略处理器
   */
  static register(handler: PolicyHandler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(
        `[PolicyRegistry] Handler for policy type '${handler.type}' already registered, overwriting`,
      );
    }

    this.handlers.set(handler.type, handler);
    console.log(`[PolicyRegistry] Registered policy handler: ${handler.type}`);
  }

  /**
   * 获取策略处理器
   * @param type 策略类型
   * @returns 策略处理器，如果未注册则返回 null
   */
  static get(type: string): PolicyHandler | null {
    return this.handlers.get(type) || null;
  }

  /**
   * 检查策略类型是否已注册
   * @param type 策略类型
   * @returns 是否已注册
   */
  static has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * 获取所有已注册的策略类型
   * @returns 策略类型列表
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 取消注册策略处理器
   * @param type 策略类型
   * @returns 是否成功取消注册
   */
  static unregister(type: string): boolean {
    if (this.handlers.has(type)) {
      this.handlers.delete(type);
      console.log(`[PolicyRegistry] Unregistered policy handler: ${type}`);
      return true;
    }
    return false;
  }

  /**
   * 清空所有已注册的策略处理器
   */
  static clear(): void {
    this.handlers.clear();
    console.log("[PolicyRegistry] Cleared all policy handlers");
  }

  /**
   * 获取所有已注册的处理器
   * @returns 处理器Map
   */
  static getAllHandlers(): ReadonlyMap<string, PolicyHandler> {
    return this.handlers;
  }
}
