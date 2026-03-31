/**
 * Input history module — P2 feature
 *
 * Stores sent messages in a ring buffer (max 50 entries) backed by localStorage.
 * Supports ArrowUp/ArrowDown navigation through history.
 *
 * 对抗-P2 修复：原实现使用全局单例，导致跨 sessionKey 历史混用。
 * 现在通过 getInputHistory(sessionKey) 工厂函数获取按会话隔离的实例。
 * localStorage key 格式："chat-input-history:{sessionKey}"
 */

const STORAGE_KEY_PREFIX = "chat-input-history:";
const MAX_ENTRIES = 50;

export class InputHistory {
  private entries: string[] = [];
  private cursor = -1;
  private pendingDraft = "";
  private readonly storageKey: string;

  constructor(sessionKey: string) {
    this.storageKey = `${STORAGE_KEY_PREFIX}${sessionKey}`;
    this.load();
  }

  /** Load history from localStorage */
  private load(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.entries = parsed.slice(-MAX_ENTRIES);
        }
      }
    } catch {
      this.entries = [];
    }
  }

  /** Persist history to localStorage */
  private save(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }

  /** Add a new entry to history (deduplicates last entry) */
  add(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    // Don't add if identical to most recent entry
    if (this.entries.length > 0 && this.entries[this.entries.length - 1] === trimmed) {
      this.reset();
      return;
    }
    this.entries.push(trimmed);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.save();
    this.reset();
  }

  /** Reset cursor (called after send or on new input) */
  reset(): void {
    this.cursor = -1;
    this.pendingDraft = "";
  }

  /** Navigate to older entry (ArrowUp). Returns the text to show, or null if at boundary. */
  older(currentDraft: string): string | null {
    if (this.entries.length === 0) {
      return null;
    }
    // If not yet navigating, save current draft
    if (this.cursor === -1) {
      this.pendingDraft = currentDraft;
      this.cursor = this.entries.length;
    }
    if (this.cursor <= 0) {
      return null;
    }
    this.cursor--;
    return this.entries[this.cursor];
  }

  /** Navigate to newer entry (ArrowDown). Returns the text to show, or null if at boundary. */
  newer(): string | null {
    if (this.cursor === -1) {
      return null;
    }
    this.cursor++;
    if (this.cursor >= this.entries.length) {
      // Back to current draft
      const draft = this.pendingDraft;
      this.reset();
      return draft;
    }
    return this.entries[this.cursor];
  }

  /** Whether the cursor is actively navigating */
  get isNavigating(): boolean {
    return this.cursor !== -1;
  }

  /** Number of entries currently stored */
  get size(): number {
    return this.entries.length;
  }
}

/**
 * 对抗-P2：按 sessionKey 隔离的历史实例缓存。
 * 同一 sessionKey 在同一页面内复用同一实例（避免重复读取 localStorage）。
 */
const _historyCache = new Map<string, InputHistory>();

export function getInputHistory(sessionKey: string): InputHistory {
  let instance = _historyCache.get(sessionKey);
  if (!instance) {
    instance = new InputHistory(sessionKey);
    _historyCache.set(sessionKey, instance);
  }
  return instance;
}

/**
 * 向后兼容的全局单例（供未传入 sessionKey 的展示）。
 * 新代码应优先使用 getInputHistory(sessionKey)。
 * @deprecated 请使用 getInputHistory(sessionKey)
 */
export const chatInputHistory = getInputHistory("__legacy__");
