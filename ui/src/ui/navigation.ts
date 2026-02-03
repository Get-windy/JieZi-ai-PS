import type { IconName } from "./icons.js";
import { t } from "./i18n.js";

// Navigation group labels (use with t() function)
export const NAV_GROUP_LABELS = {
  chat: "nav.chat",
  control: "nav.control",
  agent: "nav.agent",
  settings: "nav.settings",
} as const;

export const TAB_GROUPS = [
  { label: "nav.chat", tabs: ["chat"] },
  {
    label: "nav.control",
    tabs: ["overview", "channels", "instances", "sessions", "cron"],
  },
  { label: "nav.agent", tabs: ["agents", "skills", "nodes"] },
  { label: "nav.settings", tabs: ["config", "debug", "logs"] },
] as const;

export type Tab =
  | "agents"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "cron"
  | "skills"
  | "nodes"
  | "chat"
  | "config"
  | "debug"
  | "logs";

const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  overview: "/overview",
  channels: "/channels",
  instances: "/instances",
  sessions: "/sessions",
  cron: "/cron",
  skills: "/skills",
  nodes: "/nodes",
  chat: "/chat",
  config: "/config",
  debug: "/debug",
  logs: "/logs",
};

const PATH_TO_TAB = new Map(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab]));

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) {
    normalized = "/";
  }
  if (normalized === "/") {
    return "chat";
  }
  return PATH_TO_TAB.get(normalized) ?? null;
}

export function inferBasePathFromPathname(pathname: string): string {
  let normalized = normalizePath(pathname);
  if (normalized.endsWith("/index.html")) {
    normalized = normalizePath(normalized.slice(0, -"/index.html".length));
  }
  if (normalized === "/") {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join("/")}`.toLowerCase();
    if (PATH_TO_TAB.has(candidate)) {
      const prefix = segments.slice(0, i);
      return prefix.length ? `/${prefix.join("/")}` : "";
    }
  }
  return `/${segments.join("/")}`;
}

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    case "agents":
      return "folder";
    case "chat":
      return "messageSquare";
    case "overview":
      return "barChart";
    case "channels":
      return "link";
    case "instances":
      return "radio";
    case "sessions":
      return "fileText";
    case "cron":
      return "loader";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "config":
      return "settings";
    case "debug":
      return "bug";
    case "logs":
      return "scrollText";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return t("tab.agents");
    case "overview":
      return t("tab.overview");
    case "channels":
      return t("tab.channels");
    case "instances":
      return t("tab.instances");
    case "sessions":
      return t("tab.sessions");
    case "cron":
      return t("tab.cron");
    case "skills":
      return t("tab.skills");
    case "nodes":
      return t("tab.nodes");
    case "chat":
      return t("tab.chat");
    case "config":
      return t("tab.config");
    case "debug":
      return t("tab.debug");
    case "logs":
      return t("tab.logs");
    default:
      return t("nav.control");
  }
}

export function subtitleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return t("tab.agents.subtitle");
    case "overview":
      return t("tab.overview.subtitle");
    case "channels":
      return t("tab.channels.subtitle");
    case "instances":
      return t("tab.instances.subtitle");
    case "sessions":
      return t("tab.sessions.subtitle");
    case "cron":
      return t("tab.cron.subtitle");
    case "skills":
      return t("tab.skills.subtitle");
    case "nodes":
      return t("tab.nodes.subtitle");
    case "chat":
      return t("tab.chat.subtitle");
    case "config":
      return t("tab.config.subtitle");
    case "debug":
      return t("tab.debug.subtitle");
    case "logs":
      return t("tab.logs.subtitle");
    default:
      return "";
  }
}
