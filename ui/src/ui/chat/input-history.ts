/**
 * Input history module — P2 feature
 *
 * Stores sent messages in a ring buffer (max 50 entries) backed by localStorage.
 * Supports ArrowUp/ArrowDown navigation through history.
 */

const STORAGE_KEY = "chat-input-history";
const MAX_ENTRIES = 50;

export class InputHistory {
  private entries: string[] = [];
  private cursor = -1;
  private pendingDraft = "";

  constructor() {
    this.load();
  }

  /** Load history from localStorage */
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
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

/** Singleton instance for the chat input history */
export const chatInputHistory = new InputHistory();
