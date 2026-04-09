/**
 * 输入历史管理
 *
 * 两套 API 同时支持：
 *  1. chatInputHistory - 旧全局单例（兼容保留）
 *  2. getInputHistory(sessionKey) - 新的按会话隔离实例
 */

const MAX = 50;

export class InputHistory {
  private items: string[] = [];
  private cursor = -1;

  // 新 API：无参数 push（与上游一致）
  push(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (this.items[this.items.length - 1] === trimmed) {
      return;
    }
    this.items.push(trimmed);
    if (this.items.length > MAX) {
      this.items.shift();
    }
    this.cursor = -1;
  }

  // 旧 API 兼容别名
  add(text: string): void {
    this.push(text);
  }

  up(): string | null {
    if (this.items.length === 0) {
      return null;
    }
    if (this.cursor < 0) {
      this.cursor = this.items.length - 1;
    } else if (this.cursor > 0) {
      this.cursor--;
    }
    return this.items[this.cursor] ?? null;
  }

  down(): string | null {
    if (this.cursor < 0) {
      return null;
    }
    this.cursor++;
    if (this.cursor >= this.items.length) {
      this.cursor = -1;
      return null;
    }
    return this.items[this.cursor] ?? null;
  }

  // 旧 API：older/newer（带当前值参数，首次调用时保存当前输入）
  older(current?: string): string | null {
    if (this.items.length === 0) {
      return null;
    }
    if (this.cursor < 0) {
      // 首次向上，记录当前未提交的输入（不加入历史）
      this._current = current ?? "";
      this.cursor = this.items.length - 1;
    } else if (this.cursor > 0) {
      this.cursor--;
    }
    return this.items[this.cursor] ?? null;
  }

  newer(): string | null {
    if (this.cursor < 0) {
      return null;
    }
    this.cursor++;
    if (this.cursor >= this.items.length) {
      this.cursor = -1;
      const cur = this._current;
      this._current = "";
      return cur ?? null;
    }
    return this.items[this.cursor] ?? null;
  }

  get isNavigating(): boolean {
    return this.cursor >= 0;
  }

  reset(): void {
    this.cursor = -1;
    this._current = "";
  }

  private _current = "";
}

// 旧全局单例（兼容 views/chat.ts 中对 chatInputHistory 的直接引用）
export const chatInputHistory = new InputHistory();

// 新 API：按 sessionKey 隔离的输入历史
const sessionHistories = new Map<string, InputHistory>();

export function getInputHistory(sessionKey: string): InputHistory {
  let h = sessionHistories.get(sessionKey);
  if (!h) {
    h = new InputHistory();
    sessionHistories.set(sessionKey, h);
  }
  return h;
}
