import { t } from "./i18n.js";
import type { IconName } from "./icons.js";
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.ts";

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
    tabs: [
      "overview",
      "message-queue",
      "channels",
      "models",
      "instances",
      "sessions",
      "usage",
      "cron",
    ],
  },
  {
    label: "nav.agent",
    tabs: ["agents", "organization-permissions", "collaboration", "skills", "nodes", "dreams"],
  },
  {
    label: "nav.settings",
    tabs: [
      "config",
      "communications",
      "appearance",
      "automation",
      "infrastructure",
      "aiAgents",
      "debug",
      "logs",
    ],
  },
] as const;

export type Tab =
  | "agents"
  | "collaboration"
  | "organization-permissions"
  | "overview"
  | "message-queue"
  | "channels"
  | "models"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "skills"
  | "nodes"
  | "chat"
  | "config"
  | "communications"
  | "appearance"
  | "automation"
  | "infrastructure"
  | "aiAgents"
  | "debug"
  | "logs"
  | "dreams";

const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  collaboration: "/collaboration",
  "organization-permissions": "/organization-permissions",
  overview: "/overview",
  "message-queue": "/message-queue",
  channels: "/channels",
  models: "/models",
  instances: "/instances",
  sessions: "/sessions",
  usage: "/usage",
  cron: "/cron",
  skills: "/skills",
  nodes: "/nodes",
  chat: "/chat",
  config: "/config",
  communications: "/communications",
  appearance: "/appearance",
  automation: "/automation",
  infrastructure: "/infrastructure",
  aiAgents: "/ai-agents",
  debug: "/debug",
  logs: "/logs",
  dreams: "/dreaming",
};

const PATH_ALIASES: Record<string, Tab> = {
  "/dreams": "dreams",
};

const PATH_TO_TAB = new Map<string, Tab>([
  ...Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab] as const),
  ...Object.entries(PATH_ALIASES),
]);

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
  let normalized = normalizeLowercaseStringOrEmpty(normalizePath(path));
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
    const candidate = normalizeLowercaseStringOrEmpty(`/${segments.slice(i).join("/")}`);
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
    case "collaboration":
      return "users";
    case "organization-permissions":
      return "wrench";
    case "chat":
      return "messageSquare";
    case "overview":
      return "barChart";
    case "channels":
      return "link";
    case "models":
      return "brain";
    case "instances":
      return "radio";
    case "sessions":
      return "fileText";
    case "usage":
      return "barChart";
    case "cron":
      return "loader";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "config":
      return "settings";
    case "communications":
      return "send";
    case "appearance":
      return "spark";
    case "automation":
      return "terminal";
    case "infrastructure":
      return "globe";
    case "aiAgents":
      return "brain";
    case "debug":
      return "bug";
    case "logs":
      return "scrollText";
    case "message-queue":
      return "barChart";
    case "dreams":
      return "moon";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return t("tab.agents");
    case "collaboration":
      return t("tab.collaboration");
    case "organization-permissions":
      return t("tabs.organization-permissions");
    case "overview":
      return t("tab.overview");
    case "channels":
      return t("tab.channels");
    case "models":
      return t("tabs.models");
    case "instances":
      return t("tab.instances");
    case "sessions":
      return t("tab.sessions");
    case "usage":
      return t("tab.usage");
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
    case "communications":
      return t("tabs.communications");
    case "appearance":
      return t("tabs.appearance");
    case "automation":
      return t("tabs.automation");
    case "infrastructure":
      return t("tabs.infrastructure");
    case "aiAgents":
      return t("tabs.aiAgents");
    case "debug":
      return t("tab.debug");
    case "logs":
      return t("tab.logs");
    case "message-queue":
      return t("tab.message-queue");
    case "dreams":
      return t("tabs.dreams");
    default:
      return t("nav.control");
  }
}

export function subtitleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return t("tab.agents.subtitle");
    case "collaboration":
      return t("tabs.collaboration.subtitle");
    case "organization-permissions":
      return t("tabs.organization-permissions.subtitle");
    case "overview":
      return t("tab.overview.subtitle");
    case "channels":
      return t("tab.channels.subtitle");
    case "models":
      return t("tabs.models.subtitle");
    case "instances":
      return t("tab.instances.subtitle");
    case "sessions":
      return t("tab.sessions.subtitle");
    case "usage":
      return t("tab.usage.subtitle");
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
    case "communications":
      return t("tabs.communications.subtitle");
    case "appearance":
      return t("tabs.appearance.subtitle");
    case "automation":
      return t("tabs.automation.subtitle");
    case "infrastructure":
      return t("tabs.infrastructure.subtitle");
    case "aiAgents":
      return t("tabs.aiAgents.subtitle");
    case "debug":
      return t("tab.debug.subtitle");
    case "logs":
      return t("tab.logs.subtitle");
    case "message-queue":
      return t("tab.message-queue.subtitle");
    case "dreams":
      return t("tabs.dreams.subtitle");
    default:
      return "";
  }
}
