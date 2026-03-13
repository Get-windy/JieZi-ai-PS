/**
 * Slash commands — `/` command menu for the chat compose area.
 *
 * When the user types "/" at the start of a line, a dropdown appears
 * with available commands. Selecting a command replaces the input.
 *
 * Features:
 * - i18n aliases: Chinese users can type `/新会话` instead of `/new`
 * - Usage tracking: commands are sorted by frequency & recency (localStorage)
 * - Smart recommendations: frequently used commands marked with ⭐
 */
import { html, nothing } from "lit";
import { t } from "../i18n.ts";

export interface SlashCommand {
  /** Command name without the leading "/" */
  name: string;
  /** Brief description shown in the menu */
  description: string;
  /** Optional icon (emoji) */
  icon?: string;
  /** i18n aliases — alternative names users can type (e.g. ["新会话"] for /new) */
  aliases?: string[];
  /** Action to perform when selected. Returns replacement text for the draft, or null to keep current. */
  action: () => string | null;
}

// ============ 使用频率跟踪（localStorage 持久化） ============

const USAGE_STORAGE_KEY = "openclaw_slash_usage";
type UsageRecord = { count: number; lastUsedAt: number };
type UsageData = Record<string, UsageRecord>;

class SlashCommandUsageTracker {
  private data: UsageData;

  constructor() {
    this.data = this.load();
  }

  private load(): UsageData {
    try {
      const raw = localStorage.getItem(USAGE_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UsageData) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* localStorage unavailable — ignore */
    }
  }

  /** Record a command execution */
  recordUsage(name: string): void {
    const existing = this.data[name] ?? { count: 0, lastUsedAt: 0 };
    existing.count++;
    existing.lastUsedAt = Date.now();
    this.data[name] = existing;
    this.save();
  }

  /** Whether a command has been used at least once */
  hasUsage(name: string): boolean {
    return (this.data[name]?.count ?? 0) > 0;
  }

  /** Sort commands: frequently used first, then by recency, then original order */
  sortByUsage<T extends { name: string }>(commands: T[]): T[] {
    return [...commands].toSorted((a, b) => {
      const ua = this.data[a.name];
      const ub = this.data[b.name];
      // Commands with usage data come first
      if (ua && !ub) {
        return -1;
      }
      if (!ua && ub) {
        return 1;
      }
      if (!ua && !ub) {
        return 0;
      }
      // Higher count first
      if (ua.count !== ub.count) {
        return ub.count - ua.count;
      }
      // More recent first
      return ub.lastUsedAt - ua.lastUsedAt;
    });
  }
}

export const slashUsageTracker = new SlashCommandUsageTracker();

// ============ 内置命令 ============

/** Built-in commands available to all users. */
export function getBuiltinSlashCommands(callbacks: {
  onNewSession?: () => void;
  onStop?: () => void;
  onClear?: () => void;
  onCompact?: () => void;
  onCopy?: () => void;
  onFocus?: () => void;
  onHelp?: () => void;
  onStatus?: () => void;
}): SlashCommand[] {
  return [
    {
      name: "new",
      description: t("chat.slash.new"),
      icon: "✨",
      aliases: [t("chat.slash.new.alias")],
      action: () => {
        callbacks.onNewSession?.();
        return "";
      },
    },
    {
      name: "stop",
      description: t("chat.slash.stop"),
      icon: "⏹️",
      aliases: [t("chat.slash.stop.alias")],
      action: () => {
        callbacks.onStop?.();
        return "";
      },
    },
    {
      name: "clear",
      description: t("chat.slash.clear"),
      icon: "🧹",
      aliases: [t("chat.slash.clear.alias")],
      action: () => {
        callbacks.onClear?.();
        return "";
      },
    },
    {
      name: "compact",
      description: t("chat.slash.compact"),
      icon: "📦",
      aliases: [t("chat.slash.compact.alias")],
      action: () => {
        callbacks.onCompact?.();
        return "";
      },
    },
    {
      name: "copy",
      description: t("chat.slash.copy"),
      icon: "📋",
      aliases: [t("chat.slash.copy.alias")],
      action: () => {
        callbacks.onCopy?.();
        return "";
      },
    },
    {
      name: "focus",
      description: t("chat.slash.focus"),
      icon: "🎯",
      aliases: [t("chat.slash.focus.alias")],
      action: () => {
        callbacks.onFocus?.();
        return "";
      },
    },
    {
      name: "help",
      description: t("chat.slash.help"),
      icon: "❓",
      aliases: [t("chat.slash.help.alias")],
      action: () => {
        callbacks.onHelp?.();
        return "";
      },
    },
    {
      name: "status",
      description: t("chat.slash.status"),
      icon: "📊",
      aliases: [t("chat.slash.status.alias")],
      action: () => {
        callbacks.onStatus?.();
        return "";
      },
    },
  ];
}

// ============ Token 检测 ============

/**
 * Detect whether the current draft qualifies for slash command suggestions.
 * Returns the partial command token (excluding the "/") or null.
 *
 * Supports both ASCII and CJK characters (e.g. `/新会话`, `/new`).
 */
export function detectSlashToken(draft: string): string | null {
  // Only match if the entire draft starts with "/"
  if (!draft.startsWith("/")) {
    return null;
  }
  // Extract the token after "/" — support ASCII + CJK Unified Ideographs
  const match = draft.match(/^\/([a-zA-Z0-9_\u4e00-\u9fff\u3400-\u4dbf-]*)/);
  return match ? match[1].toLowerCase() : null;
}

// ============ 过滤与排序 ============

/**
 * Filter commands that match the partial token, then sort by usage frequency.
 *
 * Matching logic:
 * 1. Command name starts with the token (e.g. "ne" → /new)
 * 2. Any alias starts with the token (e.g. "新" → /new via alias "新会话")
 * 3. Description contains the token
 *
 * When token is empty (user just typed "/"), returns all commands sorted by usage.
 */
export function filterSlashCommands(commands: SlashCommand[], token: string): SlashCommand[] {
  let filtered: SlashCommand[];
  if (!token) {
    // Show all commands, sorted by usage (most used first)
    filtered = commands;
  } else {
    const lowerToken = token.toLowerCase();
    filtered = commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().startsWith(lowerToken) ||
        cmd.aliases?.some((a) => a.toLowerCase().startsWith(lowerToken)) ||
        cmd.description.toLowerCase().includes(lowerToken),
    );
  }
  return slashUsageTracker.sortByUsage(filtered);
}

// ============ 下拉渲染 ============

/**
 * Render the slash command dropdown.
 * Returns `nothing` if there are no matching commands.
 *
 * Each item shows:
 * - Icon + command name (e.g. ✨ /new)
 * - Chinese alias if present (e.g. 新会话)
 * - Description
 * - ⭐ indicator for frequently used commands
 */
export function renderSlashDropdown(
  commands: SlashCommand[],
  onSelect: (cmd: SlashCommand) => void,
) {
  if (commands.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-slash-dropdown" role="listbox" aria-label="Slash commands">
      ${commands.map((cmd) => {
        // Show the first alias that differs from the command name
        const displayAlias = cmd.aliases?.find(
          (a) => a && a.toLowerCase() !== cmd.name.toLowerCase(),
        );
        const isFrequent = slashUsageTracker.hasUsage(cmd.name);
        return html`
            <div
              class="chat-slash-item"
              role="option"
              @click=${(e: Event) => {
                e.stopPropagation();
                onSelect(cmd);
              }}
            >
              <span class="chat-slash-item__icon">${cmd.icon ?? "/"}</span>
              <span class="chat-slash-item__name">/${cmd.name}</span>
              ${
                displayAlias
                  ? html`<span class="chat-slash-item__alias">${displayAlias}</span>`
                  : nothing
              }
              <span class="chat-slash-item__desc">${cmd.description}</span>
              ${
                isFrequent
                  ? html`<span class="chat-slash-item__freq" title="${t("chat.slash.frequent")}">⭐</span>`
                  : nothing
              }
            </div>
          `;
      })}
    </div>
  `;
}
