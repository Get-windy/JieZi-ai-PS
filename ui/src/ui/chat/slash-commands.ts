/**
 * 斜杠命令系统（本地扩展版）
 *
 * 在上游 slash-commands.ts 基础上扩展：
 * - detectSlashToken: 检测输入框中的斜杠命令 token
 * - filterSlashCommands: 过滤匹配的命令列表
 * - getBuiltinSlashCommands: 获取内置命令（带回调绑定）
 * - renderSlashDropdown: 渲染命令选择下拉框
 * - slashUsageTracker: 使用频率追踪器
 * - SlashCommand: 带运行时 action 的命令类型
 */

import { html, nothing } from "lit";
import { buildBuiltinChatCommands } from "../../../../src/auto-reply/commands-registry.shared.js";
import type {
  ChatCommandDefinition,
  CommandArgChoice,
} from "../../../../src/auto-reply/commands-registry.types.js";
import { t } from "../i18n.ts";
import type { IconName } from "../icons.ts";
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.ts";

// ============================================================
// 上游类型内联（避免循环导入）
// ============================================================

export type SlashCommandCategory = "session" | "model" | "agents" | "tools";

export type SlashCommandDef = {
  key: string;
  name: string;
  aliases?: string[];
  description: string;
  args?: string;
  icon?: IconName;
  category?: SlashCommandCategory;
  executeLocal?: boolean;
  argOptions?: string[];
  shortcut?: string;
};

export type ParsedSlashCommand = {
  command: SlashCommandDef;
  args: string;
};

// 上游内置配置
const COMMAND_ICON_OVERRIDES: Partial<Record<string, IconName>> = {
  help: "book",
  status: "barChart",
  usage: "barChart",
  export: "download",
  export_session: "download",
  tools: "terminal",
  skill: "zap",
  commands: "book",
  new: "plus",
  reset: "refresh",
  compact: "loader",
  stop: "stop",
  clear: "trash",
  focus: "eye",
  unfocus: "eye",
  model: "brain",
  models: "brain",
  think: "brain",
  verbose: "terminal",
  fast: "zap",
  agents: "monitor",
  subagents: "folder",
  kill: "x",
  steer: "send",
  tts: "volume2",
};

const LOCAL_COMMANDS = new Set([
  "help",
  "new",
  "reset",
  "stop",
  "compact",
  "focus",
  "model",
  "think",
  "fast",
  "verbose",
  "export-session",
  "usage",
  "agents",
  "kill",
  "steer",
  "redirect",
]);

const UI_ONLY_COMMANDS: SlashCommandDef[] = [
  {
    key: "clear",
    name: "clear",
    description: "Clear chat history",
    icon: "trash",
    category: "session",
    executeLocal: true,
  },
  {
    key: "redirect",
    name: "redirect",
    description: "Abort and restart with a new message",
    args: "[id] <message>",
    icon: "refresh",
    category: "agents",
    executeLocal: true,
  },
];

const CATEGORY_OVERRIDES: Partial<Record<string, SlashCommandCategory>> = {
  help: "tools",
  commands: "tools",
  tools: "tools",
  skill: "tools",
  status: "tools",
  export_session: "tools",
  usage: "tools",
  tts: "tools",
  agents: "agents",
  subagents: "agents",
  kill: "agents",
  steer: "agents",
  redirect: "agents",
  session: "session",
  stop: "session",
  reset: "session",
  new: "session",
  compact: "session",
  focus: "session",
  unfocus: "session",
  model: "model",
  models: "model",
  think: "model",
  verbose: "model",
  fast: "model",
  reasoning: "model",
  elevated: "model",
  queue: "model",
};

const COMMAND_DESCRIPTION_OVERRIDES: Partial<Record<string, string>> = {
  steer: "Inject a message into the active run",
};

const COMMAND_ARGS_OVERRIDES: Partial<Record<string, string>> = {
  steer: "[id] <message>",
};

function normalizeUiKey(command: ChatCommandDefinition): string {
  return command.key.replace(/[:.-]/g, "_");
}

function getSlashAliases(command: ChatCommandDefinition): string[] {
  return command.textAliases
    .map((a) => a.trim())
    .filter((a) => a.startsWith("/"))
    .map((a) => a.slice(1));
}

function getPrimarySlashName(command: ChatCommandDefinition): string | null {
  const aliases = getSlashAliases(command);
  return aliases.length === 0 ? null : (aliases[0] ?? null);
}

function formatArgs(command: ChatCommandDefinition): string | undefined {
  if (!command.args?.length) {
    return undefined;
  }
  return command.args
    .map((arg) => {
      const token = `<${arg.name}>`;
      return arg.required ? token : `[${arg.name}]`;
    })
    .join(" ");
}

function choiceToValue(choice: CommandArgChoice): string {
  return typeof choice === "string" ? choice : choice.value;
}

function getArgOptions(command: ChatCommandDefinition): string[] | undefined {
  const firstArg = command.args?.[0];
  if (!firstArg || typeof firstArg.choices === "function") {
    return undefined;
  }
  const options = firstArg.choices?.map(choiceToValue).filter(Boolean);
  return options?.length ? options : undefined;
}

function toSlashCommandDef(command: ChatCommandDefinition): SlashCommandDef | null {
  const name = getPrimarySlashName(command);
  if (!name) {
    return null;
  }
  return {
    key: command.key,
    name,
    aliases: getSlashAliases(command).filter((a) => a !== name),
    description: COMMAND_DESCRIPTION_OVERRIDES[command.key] ?? command.description,
    args: COMMAND_ARGS_OVERRIDES[command.key] ?? formatArgs(command),
    icon: COMMAND_ICON_OVERRIDES[normalizeUiKey(command)] ?? "terminal",
    category: CATEGORY_OVERRIDES[normalizeUiKey(command)] ?? "tools",
    executeLocal: LOCAL_COMMANDS.has(command.key),
    argOptions: getArgOptions(command),
  };
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  ...buildBuiltinChatCommands()
    .map(toSlashCommandDef)
    .filter((c): c is SlashCommandDef => c !== null),
  ...UI_ONLY_COMMANDS,
];

const CATEGORY_ORDER: SlashCommandCategory[] = ["session", "model", "tools", "agents"];

export const CATEGORY_LABELS: Record<SlashCommandCategory, string> = {
  session: "Session",
  model: "Model",
  agents: "Agents",
  tools: "Tools",
};

export function getSlashCommandCompletions(filter: string): SlashCommandDef[] {
  const lower = normalizeLowercaseStringOrEmpty(filter);
  const commands = lower
    ? SLASH_COMMANDS.filter(
        (cmd) =>
          cmd.name.startsWith(lower) ||
          cmd.aliases?.some((a) => normalizeLowercaseStringOrEmpty(a).startsWith(lower)) ||
          normalizeLowercaseStringOrEmpty(cmd.description).includes(lower),
      )
    : SLASH_COMMANDS;
  return commands.toSorted((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category ?? "session");
    const bi = CATEGORY_ORDER.indexOf(b.category ?? "session");
    if (ai !== bi) {
      return ai - bi;
    }
    if (lower) {
      const aExact = a.name.startsWith(lower) ? 0 : 1;
      const bExact = b.name.startsWith(lower) ? 0 : 1;
      if (aExact !== bExact) {
        return aExact - bExact;
      }
    }
    return 0;
  });
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const body = trimmed.slice(1);
  const firstSeparator = body.search(/[\s:]/u);
  const name = firstSeparator === -1 ? body : body.slice(0, firstSeparator);
  let remainder = firstSeparator === -1 ? "" : body.slice(firstSeparator).trimStart();
  if (remainder.startsWith(":")) {
    remainder = remainder.slice(1).trimStart();
  }
  const args = remainder.trim();
  if (!name) {
    return null;
  }
  const normalizedName = normalizeLowercaseStringOrEmpty(name);
  const command = SLASH_COMMANDS.find(
    (cmd) =>
      cmd.name === normalizedName ||
      cmd.aliases?.some((a) => normalizeLowercaseStringOrEmpty(a) === normalizedName),
  );
  return command ? { command, args } : null;
}

/** 带运行时回调的斜杠命令（UI 层使用） */
export type SlashCommand = {
  name: string;
  description: string;
  /** 执行命令，返回要替换到 draft 的文本，null 表示仅执行副作用 */
  action: () => string | null;
};

/** 内置斜杠命令的回调选项 */
export type BuiltinSlashCommandOptions = {
  onNewSession?: () => void;
  onStop?: () => void;
  onClear?: () => void;
  onCompact?: () => void;
  onCopy?: () => void;
  onFocus?: () => void;
  onStatus?: () => void;
};

/** 获取绑定了回调的内置斜杠命令列表 */
export function getBuiltinSlashCommands(opts: BuiltinSlashCommandOptions): SlashCommand[] {
  return [
    {
      name: "new",
      description: t("slash.new.desc"),
      action: () => {
        opts.onNewSession?.();
        return null;
      },
    },
    {
      name: "stop",
      description: t("slash.stop.desc"),
      action: () => {
        opts.onStop?.();
        return null;
      },
    },
    {
      name: "clear",
      description: t("slash.clear.desc"),
      action: () => {
        opts.onClear?.();
        return null;
      },
    },
    {
      name: "compact",
      description: t("slash.compact.desc"),
      action: () => {
        opts.onCompact?.();
        return null;
      },
    },
    {
      name: "copy",
      description: t("slash.copy.desc"),
      action: () => {
        opts.onCopy?.();
        return null;
      },
    },
    {
      name: "focus",
      description: t("slash.focus.desc"),
      action: () => {
        opts.onFocus?.();
        return null;
      },
    },
    {
      name: "status",
      description: t("slash.status.desc"),
      action: () => {
        opts.onStatus?.();
        return null;
      },
    },
  ];
}

/**
 * 从 draft 文本中检测斜杠 token
 * 仅在文本以 "/" 开头时触发
 * 返回斜杠后的内容（不含斜杠），或 null
 */
export function detectSlashToken(draft: string): string | null {
  const trimmed = draft.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  // 如果已经是完整命令（含空格），停止补全
  const body = trimmed.slice(1);
  if (body.includes(" ")) {
    return null;
  }
  return body;
}

/**
 * 过滤出与 token 匹配的命令
 */
export function filterSlashCommands(commands: SlashCommand[], token: string): SlashCommand[] {
  if (!token) {
    return commands;
  }
  const lower = token.toLowerCase();
  return commands.filter((cmd) => cmd.name.toLowerCase().startsWith(lower));
}

// ============================================================
// 使用频率追踪
// ============================================================

const TRACKER_KEY = "slash_cmd_usage";

class SlashUsageTracker {
  private counts: Record<string, number> = this._load();

  recordUsage(name: string): void {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    this._save();
  }

  getCount(name: string): number {
    return this.counts[name] ?? 0;
  }

  sortByUsage(commands: SlashCommand[]): SlashCommand[] {
    return [...commands].toSorted((a, b) => this.getCount(b.name) - this.getCount(a.name));
  }

  private _load(): Record<string, number> {
    try {
      const raw = localStorage.getItem(TRACKER_KEY);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  private _save(): void {
    try {
      localStorage.setItem(TRACKER_KEY, JSON.stringify(this.counts));
    } catch {
      // ignore storage errors
    }
  }
}

export const slashUsageTracker = new SlashUsageTracker();

// ============================================================
// 下拉框渲染
// ============================================================

/**
 * 渲染斜杠命令补全下拉框
 */
export function renderSlashDropdown(
  commands: SlashCommand[],
  onSelect: (cmd: SlashCommand) => void,
) {
  if (commands.length === 0) {
    return nothing;
  }
  return html`
    <div class="slash-dropdown" role="listbox" aria-label="Slash commands">
      ${commands.map(
        (cmd) => html`
          <button
            class="slash-dropdown__item"
            role="option"
            type="button"
            @mousedown=${(e: Event) => {
              e.preventDefault(); // 防止 textarea 失焦
              onSelect(cmd);
            }}
          >
            <span class="slash-dropdown__name">/${cmd.name}</span>
            <span class="slash-dropdown__desc">${cmd.description}</span>
          </button>
        `,
      )}
    </div>
  `;
}
