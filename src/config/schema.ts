import { CHANNEL_IDS } from "../channels/registry.js";
import { VERSION } from "../version.js";
import { OpenClawSchema } from "./zod-schema.js";
import { t } from "../i18n/index.js";

export type ConfigUiHint = {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

export type ConfigSchema = ReturnType<typeof OpenClawSchema.toJSONSchema>;

type JsonSchemaNode = Record<string, unknown>;

export type ConfigSchemaResponse = {
  schema: ConfigSchema;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type PluginUiMetadata = {
  id: string;
  name?: string;
  description?: string;
  configUiHints?: Record<
    string,
    Pick<ConfigUiHint, "label" | "help" | "advanced" | "sensitive" | "placeholder">
  >;
  configSchema?: JsonSchemaNode;
};

export type ChannelUiMetadata = {
  id: string;
  label?: string;
  description?: string;
  configSchema?: JsonSchemaNode;
  configUiHints?: Record<string, ConfigUiHint>;
};

const GROUP_LABELS: Record<string, string> = {
  wizard: t('config.group.wizard') || "Wizard",
  update: t('config.group.update') || "Update",
  diagnostics: t('config.group.diagnostics') || "Diagnostics",
  logging: t('config.group.logging') || "Logging",
  gateway: t('config.group.gateway') || "Gateway",
  nodeHost: t('config.group.nodeHost') || "Node Host",
  agents: t('config.group.agents') || "Agents",
  tools: t('config.group.tools') || "Tools",
  bindings: t('config.group.bindings') || "Bindings",
  audio: t('config.group.audio') || "Audio",
  models: t('config.group.models') || "Models",
  messages: t('config.group.messages') || "Messages",
  commands: t('config.group.commands') || "Commands",
  session: t('config.group.session') || "Session",
  cron: t('config.group.cron') || "Cron",
  hooks: t('config.group.hooks') || "Hooks",
  ui: t('config.group.ui') || "UI",
  browser: t('config.group.browser') || "Browser",
  talk: t('config.group.talk') || "Talk",
  channels: t('config.group.channels') || "Messaging Channels",
  skills: t('config.group.skills') || "Skills",
  plugins: t('config.group.plugins') || "Plugins",
  discovery: t('config.group.discovery') || "Discovery",
  presence: t('config.group.presence') || "Presence",
  voicewake: t('config.group.voicewake') || "Voice Wake",
};

const GROUP_ORDER: Record<string, number> = {
  wizard: 20,
  update: 25,
  diagnostics: 27,
  gateway: 30,
  nodeHost: 35,
  agents: 40,
  tools: 50,
  bindings: 55,
  audio: 60,
  models: 70,
  messages: 80,
  commands: 85,
  session: 90,
  cron: 100,
  hooks: 110,
  ui: 120,
  browser: 130,
  talk: 140,
  channels: 150,
  skills: 200,
  plugins: 205,
  discovery: 210,
  presence: 220,
  voicewake: 230,
  logging: 900,
};

const FIELD_LABELS: Record<string, string> = {
  "meta.lastTouchedVersion": t('config.label.meta.lastTouchedVersion') || "Config Last Touched Version",
  "meta.lastTouchedAt": t('config.label.meta.lastTouchedAt') || "Config Last Touched At",
  "update.channel": t('config.label.update.channel') || "Update Channel",
  "update.checkOnStart": t('config.label.update.checkOnStart') || "Update Check on Start",
  "diagnostics.enabled": t('config.label.diagnostics.enabled') || "Diagnostics Enabled",
  "diagnostics.flags": t('config.label.diagnostics.flags') || "Diagnostics Flags",
  "diagnostics.otel.enabled": t('config.label.diagnostics.otel.enabled') || "OpenTelemetry Enabled",
  "diagnostics.otel.endpoint": t('config.label.diagnostics.otel.endpoint') || "OpenTelemetry Endpoint",
  "diagnostics.otel.protocol": t('config.label.diagnostics.otel.protocol') || "OpenTelemetry Protocol",
  "diagnostics.otel.headers": t('config.label.diagnostics.otel.headers') || "OpenTelemetry Headers",
  "diagnostics.otel.serviceName": t('config.label.diagnostics.otel.serviceName') || "OpenTelemetry Service Name",
  "diagnostics.otel.traces": t('config.label.diagnostics.otel.traces') || "OpenTelemetry Traces Enabled",
  "diagnostics.otel.metrics": t('config.label.diagnostics.otel.metrics') || "OpenTelemetry Metrics Enabled",
  "diagnostics.otel.logs": t('config.label.diagnostics.otel.logs') || "OpenTelemetry Logs Enabled",
  "diagnostics.otel.sampleRate": t('config.label.diagnostics.otel.sampleRate') || "OpenTelemetry Trace Sample Rate",
  "diagnostics.otel.flushIntervalMs": t('config.label.diagnostics.otel.flushIntervalMs') || "OpenTelemetry Flush Interval (ms)",
  "diagnostics.cacheTrace.enabled": t('config.label.diagnostics.cacheTrace.enabled') || "Cache Trace Enabled",
  "diagnostics.cacheTrace.filePath": t('config.label.diagnostics.cacheTrace.filePath') || "Cache Trace File Path",
  "diagnostics.cacheTrace.includeMessages": t('config.label.diagnostics.cacheTrace.includeMessages') || "Cache Trace Include Messages",
  "diagnostics.cacheTrace.includePrompt": t('config.label.diagnostics.cacheTrace.includePrompt') || "Cache Trace Include Prompt",
  "diagnostics.cacheTrace.includeSystem": t('config.label.diagnostics.cacheTrace.includeSystem') || "Cache Trace Include System",
  "agents.list.*.identity.avatar": t('config.label.agents.list.identity.avatar') || "Identity Avatar",
  "agents.list.*.skills": t('config.label.agents.list.skills') || "Agent Skill Filter",
  "gateway.remote.url": t('config.label.gateway.remote.url') || "Remote Gateway URL",
  "gateway.remote.sshTarget": t('config.label.gateway.remote.sshTarget') || "Remote Gateway SSH Target",
  "gateway.remote.sshIdentity": t('config.label.gateway.remote.sshIdentity') || "Remote Gateway SSH Identity",
  "gateway.remote.token": t('config.label.gateway.remote.token') || "Remote Gateway Token",
  "gateway.remote.password": t('config.label.gateway.remote.password') || "Remote Gateway Password",
  "gateway.remote.tlsFingerprint": t('config.label.gateway.remote.tlsFingerprint') || "Remote Gateway TLS Fingerprint",
  "gateway.auth.token": t('config.label.gateway.auth.token') || "Gateway Token",
  "gateway.auth.password": t('config.label.gateway.auth.password') || "Gateway Password",
  "tools.media.image.enabled": t('config.label.tools.media.image.enabled') || "Enable Image Understanding",
  "tools.media.image.maxBytes": t('config.label.tools.media.image.maxBytes') || "Image Understanding Max Bytes",
  "tools.media.image.maxChars": t('config.label.tools.media.image.maxChars') || "Image Understanding Max Chars",
  "tools.media.image.prompt": t('config.label.tools.media.image.prompt') || "Image Understanding Prompt",
  "tools.media.image.timeoutSeconds": t('config.label.tools.media.image.timeoutSeconds') || "Image Understanding Timeout (sec)",
  "tools.media.image.attachments": t('config.label.tools.media.image.attachments') || "Image Understanding Attachment Policy",
  "tools.media.image.models": t('config.label.tools.media.image.models') || "Image Understanding Models",
  "tools.media.image.scope": t('config.label.tools.media.image.scope') || "Image Understanding Scope",
  "tools.media.models": t('config.label.tools.media.models') || "Media Understanding Shared Models",
  "tools.media.concurrency": t('config.label.tools.media.concurrency') || "Media Understanding Concurrency",
  "tools.media.audio.enabled": t('config.label.tools.media.audio.enabled') || "Enable Audio Understanding",
  "tools.media.audio.maxBytes": t('config.label.tools.media.audio.maxBytes') || "Audio Understanding Max Bytes",
  "tools.media.audio.maxChars": t('config.label.tools.media.audio.maxChars') || "Audio Understanding Max Chars",
  "tools.media.audio.prompt": t('config.label.tools.media.audio.prompt') || "Audio Understanding Prompt",
  "tools.media.audio.timeoutSeconds": t('config.label.tools.media.audio.timeoutSeconds') || "Audio Understanding Timeout (sec)",
  "tools.media.audio.language": t('config.label.tools.media.audio.language') || "Audio Understanding Language",
  "tools.media.audio.attachments": t('config.label.tools.media.audio.attachments') || "Audio Understanding Attachment Policy",
  "tools.media.audio.models": t('config.label.tools.media.audio.models') || "Audio Understanding Models",
  "tools.media.audio.scope": t('config.label.tools.media.audio.scope') || "Audio Understanding Scope",
  "tools.media.video.enabled": t('config.label.tools.media.video.enabled') || "Enable Video Understanding",
  "tools.media.video.maxBytes": t('config.label.tools.media.video.maxBytes') || "Video Understanding Max Bytes",
  "tools.media.video.maxChars": t('config.label.tools.media.video.maxChars') || "Video Understanding Max Chars",
  "tools.media.video.prompt": t('config.label.tools.media.video.prompt') || "Video Understanding Prompt",
  "tools.media.video.timeoutSeconds": t('config.label.tools.media.video.timeoutSeconds') || "Video Understanding Timeout (sec)",
  "tools.media.video.attachments": t('config.label.tools.media.video.attachments') || "Video Understanding Attachment Policy",
  "tools.media.video.models": t('config.label.tools.media.video.models') || "Video Understanding Models",
  "tools.media.video.scope": t('config.label.tools.media.video.scope') || "Video Understanding Scope",
  "tools.links.enabled": t('config.label.tools.links.enabled') || "Enable Link Understanding",
  "tools.links.maxLinks": t('config.label.tools.links.maxLinks') || "Link Understanding Max Links",
  "tools.links.timeoutSeconds": t('config.label.tools.links.timeoutSeconds') || "Link Understanding Timeout (sec)",
  "tools.links.models": t('config.label.tools.links.models') || "Link Understanding Models",
  "tools.links.scope": t('config.label.tools.links.scope') || "Link Understanding Scope",
  "tools.profile": t('config.label.tools.profile') || "Tool Profile",
  "tools.alsoAllow": t('config.label.tools.alsoAllow') || "Tool Allowlist Additions",
  "agents.list[].tools.profile": t('config.label.agents.list.tools.profile') || "Agent Tool Profile",
  "agents.list[].tools.alsoAllow": t('config.label.agents.list.tools.alsoAllow') || "Agent Tool Allowlist Additions",
  "tools.byProvider": t('config.label.tools.byProvider') || "Tool Policy by Provider",
  "agents.list[].tools.byProvider": t('config.label.agents.list.tools.byProvider') || "Agent Tool Policy by Provider",
  "tools.exec.applyPatch.enabled": t('config.label.tools.exec.applyPatch.enabled') || "Enable apply_patch",
  "tools.exec.applyPatch.allowModels": t('config.label.tools.exec.applyPatch.allowModels') || "apply_patch Model Allowlist",
  "tools.exec.notifyOnExit": t('config.label.tools.exec.notifyOnExit') || "Exec Notify On Exit",
  "tools.exec.approvalRunningNoticeMs": t('config.label.tools.exec.approvalRunningNoticeMs') || "Exec Approval Running Notice (ms)",
  "tools.exec.host": t('config.label.tools.exec.host') || "Exec Host",
  "tools.exec.security": t('config.label.tools.exec.security') || "Exec Security",
  "tools.exec.ask": t('config.label.tools.exec.ask') || "Exec Ask",
  "tools.exec.node": t('config.label.tools.exec.node') || "Exec Node Binding",
  "tools.exec.pathPrepend": t('config.label.tools.exec.pathPrepend') || "Exec PATH Prepend",
  "tools.exec.safeBins": t('config.label.tools.exec.safeBins') || "Exec Safe Bins",
  "tools.message.allowCrossContextSend": t('config.label.tools.message.allowCrossContextSend') || "Allow Cross-Context Messaging",
  "tools.message.crossContext.allowWithinProvider": t('config.label.tools.message.crossContext.allowWithinProvider') || "Allow Cross-Context (Same Provider)",
  "tools.message.crossContext.allowAcrossProviders": t('config.label.tools.message.crossContext.allowAcrossProviders') || "Allow Cross-Context (Across Providers)",
  "tools.message.crossContext.marker.enabled": t('config.label.tools.message.crossContext.marker.enabled') || "Cross-Context Marker",
  "tools.message.crossContext.marker.prefix": t('config.label.tools.message.crossContext.marker.prefix') || "Cross-Context Marker Prefix",
  "tools.message.crossContext.marker.suffix": t('config.label.tools.message.crossContext.marker.suffix') || "Cross-Context Marker Suffix",
  "tools.message.broadcast.enabled": t('config.label.tools.message.broadcast.enabled') || "Enable Message Broadcast",
  "tools.web.search.enabled": t('config.label.tools.web.search.enabled') || "Enable Web Search Tool",
  "tools.web.search.provider": t('config.label.tools.web.search.provider') || "Web Search Provider",
  "tools.web.search.apiKey": t('config.label.tools.web.search.apiKey') || "Brave Search API Key",
  "tools.web.search.maxResults": t('config.label.tools.web.search.maxResults') || "Web Search Max Results",
  "tools.web.search.timeoutSeconds": t('config.label.tools.web.search.timeoutSeconds') || "Web Search Timeout (sec)",
  "tools.web.search.cacheTtlMinutes": t('config.label.tools.web.search.cacheTtlMinutes') || "Web Search Cache TTL (min)",
  "tools.web.fetch.enabled": t('config.label.tools.web.fetch.enabled') || "Enable Web Fetch Tool",
  "tools.web.fetch.maxChars": t('config.label.tools.web.fetch.maxChars') || "Web Fetch Max Chars",
  "tools.web.fetch.timeoutSeconds": t('config.label.tools.web.fetch.timeoutSeconds') || "Web Fetch Timeout (sec)",
  "tools.web.fetch.cacheTtlMinutes": t('config.label.tools.web.fetch.cacheTtlMinutes') || "Web Fetch Cache TTL (min)",
  "tools.web.fetch.maxRedirects": t('config.label.tools.web.fetch.maxRedirects') || "Web Fetch Max Redirects",
  "tools.web.fetch.userAgent": t('config.label.tools.web.fetch.userAgent') || "Web Fetch User-Agent",
  "gateway.controlUi.basePath": t('config.label.gateway.controlUi.basePath') || "Control UI Base Path",
  "gateway.controlUi.allowInsecureAuth": t('config.label.gateway.controlUi.allowInsecureAuth') || "Allow Insecure Control UI Auth",
  "gateway.controlUi.dangerouslyDisableDeviceAuth": t('config.label.gateway.controlUi.dangerouslyDisableDeviceAuth') || "Dangerously Disable Control UI Device Auth",
  "gateway.http.endpoints.chatCompletions.enabled": t('config.label.gateway.http.endpoints.chatCompletions.enabled') || "OpenAI Chat Completions Endpoint",
  "gateway.reload.mode": t('config.label.gateway.reload.mode') || "Config Reload Mode",
  "gateway.reload.debounceMs": t('config.label.gateway.reload.debounceMs') || "Config Reload Debounce (ms)",
  "gateway.nodes.browser.mode": t('config.label.gateway.nodes.browser.mode') || "Gateway Node Browser Mode",
  "gateway.nodes.browser.node": t('config.label.gateway.nodes.browser.node') || "Gateway Node Browser Pin",
  "gateway.nodes.allowCommands": t('config.label.gateway.nodes.allowCommands') || "Gateway Node Allowlist (Extra Commands)",
  "gateway.nodes.denyCommands": t('config.label.gateway.nodes.denyCommands') || "Gateway Node Denylist",
  "nodeHost.browserProxy.enabled": t('config.label.nodeHost.browserProxy.enabled') || "Node Browser Proxy Enabled",
  "nodeHost.browserProxy.allowProfiles": t('config.label.nodeHost.browserProxy.allowProfiles') || "Node Browser Proxy Allowed Profiles",
  "skills.load.watch": t('config.label.skills.load.watch') || "Watch Skills",
  "skills.load.watchDebounceMs": t('config.label.skills.load.watchDebounceMs') || "Skills Watch Debounce (ms)",
  "agents.defaults.workspace": t('config.label.agents.defaults.workspace') || "Workspace",
  "agents.defaults.repoRoot": t('config.label.agents.defaults.repoRoot') || "Repo Root",
  "agents.defaults.bootstrapMaxChars": t('config.label.agents.defaults.bootstrapMaxChars') || "Bootstrap Max Chars",
  "agents.defaults.envelopeTimezone": t('config.label.agents.defaults.envelopeTimezone') || "Envelope Timezone",
  "agents.defaults.envelopeTimestamp": t('config.label.agents.defaults.envelopeTimestamp') || "Envelope Timestamp",
  "agents.defaults.envelopeElapsed": t('config.label.agents.defaults.envelopeElapsed') || "Envelope Elapsed",
  "agents.defaults.memorySearch": t('config.label.agents.defaults.memorySearch') || "Memory Search",
  "agents.defaults.memorySearch.enabled": t('config.label.agents.defaults.memorySearch.enabled') || "Enable Memory Search",
  "agents.defaults.memorySearch.sources": t('config.label.agents.defaults.memorySearch.sources') || "Memory Search Sources",
  "agents.defaults.memorySearch.extraPaths": t('config.label.agents.defaults.memorySearch.extraPaths') || "Extra Memory Paths",
  "agents.defaults.memorySearch.experimental.sessionMemory":
    t('config.label.agents.defaults.memorySearch.experimental.sessionMemory') || "Memory Search Session Index (Experimental)",
  "agents.defaults.memorySearch.provider": t('config.label.agents.defaults.memorySearch.provider') || "Memory Search Provider",
  "agents.defaults.memorySearch.remote.baseUrl": t('config.label.agents.defaults.memorySearch.remote.baseUrl') || "Remote Embedding Base URL",
  "agents.defaults.memorySearch.remote.apiKey": t('config.label.agents.defaults.memorySearch.remote.apiKey') || "Remote Embedding API Key",
  "agents.defaults.memorySearch.remote.headers": t('config.label.agents.defaults.memorySearch.remote.headers') || "Remote Embedding Headers",
  "agents.defaults.memorySearch.remote.batch.concurrency": t('config.label.agents.defaults.memorySearch.remote.batch.concurrency') || "Remote Batch Concurrency",
  "agents.defaults.memorySearch.model": t('config.label.agents.defaults.memorySearch.model') || "Memory Search Model",
  "agents.defaults.memorySearch.fallback": t('config.label.agents.defaults.memorySearch.fallback') || "Memory Search Fallback",
  "agents.defaults.memorySearch.local.modelPath": t('config.label.agents.defaults.memorySearch.local.modelPath') || "Local Embedding Model Path",
  "agents.defaults.memorySearch.store.path": t('config.label.agents.defaults.memorySearch.store.path') || "Memory Search Index Path",
  "agents.defaults.memorySearch.store.vector.enabled": t('config.label.agents.defaults.memorySearch.store.vector.enabled') || "Memory Search Vector Index",
  "agents.defaults.memorySearch.store.vector.extensionPath": t('config.label.agents.defaults.memorySearch.store.vector.extensionPath') || "Memory Search Vector Extension Path",
  "agents.defaults.memorySearch.chunking.tokens": t('config.label.agents.defaults.memorySearch.chunking.tokens') || "Memory Chunk Tokens",
  "agents.defaults.memorySearch.chunking.overlap": t('config.label.agents.defaults.memorySearch.chunking.overlap') || "Memory Chunk Overlap Tokens",
  "agents.defaults.memorySearch.sync.onSessionStart": t('config.label.agents.defaults.memorySearch.sync.onSessionStart') || "Index on Session Start",
  "agents.defaults.memorySearch.sync.onSearch": t('config.label.agents.defaults.memorySearch.sync.onSearch') || "Index on Search (Lazy)",
  "agents.defaults.memorySearch.sync.watch": t('config.label.agents.defaults.memorySearch.sync.watch') || "Watch Memory Files",
  "agents.defaults.memorySearch.sync.watchDebounceMs": t('config.label.agents.defaults.memorySearch.sync.watchDebounceMs') || "Memory Watch Debounce (ms)",
  "agents.defaults.memorySearch.sync.sessions.deltaBytes": t('config.label.agents.defaults.memorySearch.sync.sessions.deltaBytes') || "Session Delta Bytes",
  "agents.defaults.memorySearch.sync.sessions.deltaMessages": t('config.label.agents.defaults.memorySearch.sync.sessions.deltaMessages') || "Session Delta Messages",
  "agents.defaults.memorySearch.query.maxResults": t('config.label.agents.defaults.memorySearch.query.maxResults') || "Memory Search Max Results",
  "agents.defaults.memorySearch.query.minScore": t('config.label.agents.defaults.memorySearch.query.minScore') || "Memory Search Min Score",
  "agents.defaults.memorySearch.query.hybrid.enabled": t('config.label.agents.defaults.memorySearch.query.hybrid.enabled') || "Memory Search Hybrid",
  "agents.defaults.memorySearch.query.hybrid.vectorWeight": t('config.label.agents.defaults.memorySearch.query.hybrid.vectorWeight') || "Memory Search Vector Weight",
  "agents.defaults.memorySearch.query.hybrid.textWeight": t('config.label.agents.defaults.memorySearch.query.hybrid.textWeight') || "Memory Search Text Weight",
  "agents.defaults.memorySearch.query.hybrid.candidateMultiplier":
    t('config.label.agents.defaults.memorySearch.query.hybrid.candidateMultiplier') || "Memory Search Hybrid Candidate Multiplier",
  "agents.defaults.memorySearch.cache.enabled": t('config.label.agents.defaults.memorySearch.cache.enabled') || "Memory Search Embedding Cache",
  "agents.defaults.memorySearch.cache.maxEntries": t('config.label.agents.defaults.memorySearch.cache.maxEntries') || "Memory Search Embedding Cache Max Entries",
  "auth.profiles": t('config.label.auth.profiles') || "Auth Profiles",
  "auth.order": t('config.label.auth.order') || "Auth Profile Order",
  "auth.cooldowns.billingBackoffHours": t('config.label.auth.cooldowns.billingBackoffHours') || "Billing Backoff (hours)",
  "auth.cooldowns.billingBackoffHoursByProvider": t('config.label.auth.cooldowns.billingBackoffHoursByProvider') || "Billing Backoff Overrides",
  "auth.cooldowns.billingMaxHours": t('config.label.auth.cooldowns.billingMaxHours') || "Billing Backoff Cap (hours)",
  "auth.cooldowns.failureWindowHours": t('config.label.auth.cooldowns.failureWindowHours') || "Failover Window (hours)",
  "agents.defaults.models": t('config.label.agents.defaults.models') || "Models",
  "agents.defaults.model.primary": t('config.label.agents.defaults.model.primary') || "Primary Model",
  "agents.defaults.model.fallbacks": t('config.label.agents.defaults.model.fallbacks') || "Model Fallbacks",
  "agents.defaults.imageModel.primary": t('config.label.agents.defaults.imageModel.primary') || "Image Model",
  "agents.defaults.imageModel.fallbacks": t('config.label.agents.defaults.imageModel.fallbacks') || "Image Model Fallbacks",
  "agents.defaults.humanDelay.mode": t('config.label.agents.defaults.humanDelay.mode') || "Human Delay Mode",
  "agents.defaults.humanDelay.minMs": t('config.label.agents.defaults.humanDelay.minMs') || "Human Delay Min (ms)",
  "agents.defaults.humanDelay.maxMs": t('config.label.agents.defaults.humanDelay.maxMs') || "Human Delay Max (ms)",
  "agents.defaults.cliBackends": t('config.label.agents.defaults.cliBackends') || "CLI Backends",
  "commands.native": t('config.label.commands.native') || "Native Commands",
  "commands.nativeSkills": t('config.label.commands.nativeSkills') || "Native Skill Commands",
  "commands.text": t('config.label.commands.text') || "Text Commands",
  "commands.bash": t('config.label.commands.bash') || "Allow Bash Chat Command",
  "commands.bashForegroundMs": t('config.label.commands.bashForegroundMs') || "Bash Foreground Window (ms)",
  "commands.config": t('config.label.commands.config') || "Allow /config",
  "commands.debug": t('config.label.commands.debug') || "Allow /debug",
  "commands.restart": t('config.label.commands.restart') || "Allow Restart",
  "commands.useAccessGroups": t('config.label.commands.useAccessGroups') || "Use Access Groups",
  "ui.seamColor": t('config.label.ui.seamColor') || "Accent Color",
  "ui.assistant.name": t('config.label.ui.assistant.name') || "Assistant Name",
  "ui.assistant.avatar": t('config.label.ui.assistant.avatar') || "Assistant Avatar",
  "browser.evaluateEnabled": t('config.label.browser.evaluateEnabled') || "Browser Evaluate Enabled",
  "browser.snapshotDefaults": t('config.label.browser.snapshotDefaults') || "Browser Snapshot Defaults",
  "browser.snapshotDefaults.mode": t('config.label.browser.snapshotDefaults.mode') || "Browser Snapshot Mode",
  "browser.remoteCdpTimeoutMs": t('config.label.browser.remoteCdpTimeoutMs') || "Remote CDP Timeout (ms)",
  "browser.remoteCdpHandshakeTimeoutMs": t('config.label.browser.remoteCdpHandshakeTimeoutMs') || "Remote CDP Handshake Timeout (ms)",
  "session.dmScope": t('config.label.session.dmScope') || "DM Session Scope",
  "session.agentToAgent.maxPingPongTurns": t('config.label.session.agentToAgent.maxPingPongTurns') || "Agent-to-Agent Ping-Pong Turns",
  "messages.ackReaction": t('config.label.messages.ackReaction') || "Ack Reaction Emoji",
  "messages.ackReactionScope": t('config.label.messages.ackReactionScope') || "Ack Reaction Scope",
  "messages.inbound.debounceMs": t('config.label.messages.inbound.debounceMs') || "Inbound Message Debounce (ms)",
  "talk.apiKey": t('config.label.talk.apiKey') || "Talk API Key",
  "channels.whatsapp": t('config.label.channels.whatsapp') || "WhatsApp",
  "channels.telegram": t('config.label.channels.telegram') || "Telegram",
  "channels.telegram.customCommands": t('config.label.channels.telegram.customCommands') || "Telegram Custom Commands",
  "channels.discord": t('config.label.channels.discord') || "Discord",
  "channels.slack": t('config.label.channels.slack') || "Slack",
  "channels.mattermost": t('config.label.channels.mattermost') || "Mattermost",
  "channels.signal": t('config.label.channels.signal') || "Signal",
  "channels.imessage": t('config.label.channels.imessage') || "iMessage",
  "channels.bluebubbles": t('config.label.channels.bluebubbles') || "BlueBubbles",
  "channels.msteams": t('config.label.channels.msteams') || "MS Teams",
  "channels.telegram.botToken": t('config.label.channels.telegram.botToken') || "Telegram Bot Token",
  "channels.telegram.dmPolicy": t('config.label.channels.telegram.dmPolicy') || "Telegram DM Policy",
  "channels.telegram.streamMode": t('config.label.channels.telegram.streamMode') || "Telegram Draft Stream Mode",
  "channels.telegram.draftChunk.minChars": t('config.label.channels.telegram.draftChunk.minChars') || "Telegram Draft Chunk Min Chars",
  "channels.telegram.draftChunk.maxChars": t('config.label.channels.telegram.draftChunk.maxChars') || "Telegram Draft Chunk Max Chars",
  "channels.telegram.draftChunk.breakPreference": t('config.label.channels.telegram.draftChunk.breakPreference') || "Telegram Draft Chunk Break Preference",
  "channels.telegram.retry.attempts": t('config.label.channels.telegram.retry.attempts') || "Telegram Retry Attempts",
  "channels.telegram.retry.minDelayMs": t('config.label.channels.telegram.retry.minDelayMs') || "Telegram Retry Min Delay (ms)",
  "channels.telegram.retry.maxDelayMs": t('config.label.channels.telegram.retry.maxDelayMs') || "Telegram Retry Max Delay (ms)",
  "channels.telegram.retry.jitter": t('config.label.channels.telegram.retry.jitter') || "Telegram Retry Jitter",
  "channels.telegram.network.autoSelectFamily": t('config.label.channels.telegram.network.autoSelectFamily') || "Telegram autoSelectFamily",
  "channels.telegram.timeoutSeconds": t('config.label.channels.telegram.timeoutSeconds') || "Telegram API Timeout (seconds)",
  "channels.telegram.capabilities.inlineButtons": t('config.label.channels.telegram.capabilities.inlineButtons') || "Telegram Inline Buttons",
  "channels.whatsapp.dmPolicy": t('config.label.channels.whatsapp.dmPolicy') || "WhatsApp DM Policy",
  "channels.whatsapp.selfChatMode": t('config.label.channels.whatsapp.selfChatMode') || "WhatsApp Self-Phone Mode",
  "channels.whatsapp.debounceMs": t('config.label.channels.whatsapp.debounceMs') || "WhatsApp Message Debounce (ms)",
  "channels.signal.dmPolicy": t('config.label.channels.signal.dmPolicy') || "Signal DM Policy",
  "channels.imessage.dmPolicy": t('config.label.channels.imessage.dmPolicy') || "iMessage DM Policy",
  "channels.bluebubbles.dmPolicy": t('config.label.channels.bluebubbles.dmPolicy') || "BlueBubbles DM Policy",
  "channels.discord.dm.policy": t('config.label.channels.discord.dm.policy') || "Discord DM Policy",
  "channels.discord.retry.attempts": t('config.label.channels.discord.retry.attempts') || "Discord Retry Attempts",
  "channels.discord.retry.minDelayMs": t('config.label.channels.discord.retry.minDelayMs') || "Discord Retry Min Delay (ms)",
  "channels.discord.retry.maxDelayMs": t('config.label.channels.discord.retry.maxDelayMs') || "Discord Retry Max Delay (ms)",
  "channels.discord.retry.jitter": t('config.label.channels.discord.retry.jitter') || "Discord Retry Jitter",
  "channels.discord.maxLinesPerMessage": t('config.label.channels.discord.maxLinesPerMessage') || "Discord Max Lines Per Message",
  "channels.discord.intents.presence": t('config.label.channels.discord.intents.presence') || "Discord Presence Intent",
  "channels.discord.intents.guildMembers": t('config.label.channels.discord.intents.guildMembers') || "Discord Guild Members Intent",
  "channels.discord.pluralkit.enabled": t('config.label.channels.discord.pluralkit.enabled') || "Discord PluralKit Enabled",
  "channels.discord.pluralkit.token": t('config.label.channels.discord.pluralkit.token') || "Discord PluralKit Token",
  "channels.slack.dm.policy": t('config.label.channels.slack.dm.policy') || "Slack DM Policy",
  "channels.slack.allowBots": t('config.label.channels.slack.allowBots') || "Slack Allow Bot Messages",
  "channels.discord.token": t('config.label.channels.discord.token') || "Discord Bot Token",
  "channels.slack.botToken": t('config.label.channels.slack.botToken') || "Slack Bot Token",
  "channels.slack.appToken": t('config.label.channels.slack.appToken') || "Slack App Token",
  "channels.slack.userToken": t('config.label.channels.slack.userToken') || "Slack User Token",
  "channels.slack.userTokenReadOnly": t('config.label.channels.slack.userTokenReadOnly') || "Slack User Token Read Only",
  "channels.slack.thread.historyScope": t('config.label.channels.slack.thread.historyScope') || "Slack Thread History Scope",
  "channels.slack.thread.inheritParent": t('config.label.channels.slack.thread.inheritParent') || "Slack Thread Parent Inheritance",
  "channels.mattermost.botToken": t('config.label.channels.mattermost.botToken') || "Mattermost Bot Token",
  "channels.mattermost.baseUrl": t('config.label.channels.mattermost.baseUrl') || "Mattermost Base URL",
  "channels.mattermost.chatmode": t('config.label.channels.mattermost.chatmode') || "Mattermost Chat Mode",
  "channels.mattermost.oncharPrefixes": t('config.label.channels.mattermost.oncharPrefixes') || "Mattermost Onchar Prefixes",
  "channels.mattermost.requireMention": t('config.label.channels.mattermost.requireMention') || "Mattermost Require Mention",
  "channels.signal.account": t('config.label.channels.signal.account') || "Signal Account",
  "channels.imessage.cliPath": t('config.label.channels.imessage.cliPath') || "iMessage CLI Path",
  "agents.list[].skills": t('config.label.agents.list.skills') || "Agent Skill Filter",
  "agents.list[].identity.avatar": t('config.label.agents.list.identity.avatar') || "Agent Avatar",
  "discovery.mdns.mode": t('config.label.discovery.mdns.mode') || "mDNS Discovery Mode",
  "discovery.wideArea.enabled": t('config.label.discovery.wideArea.enabled') || "Wide-Area Discovery Enabled",
  "discovery.wideArea.domain": t('config.label.discovery.wideArea.domain') || "Wide-Area Discovery Domain",
  "logging.level": t('config.label.logging.level') || "Log Level",
  "logging.file": t('config.label.logging.file') || "Log File",
  "logging.consoleLevel": t('config.label.logging.consoleLevel') || "Console Level",
  "logging.consoleStyle": t('config.label.logging.consoleStyle') || "Console Style",
  "logging.redactSensitive": t('config.label.logging.redactSensitive') || "Redact Sensitive",
  "logging.redactPatterns": t('config.label.logging.redactPatterns') || "Redact Patterns",
  "plugins.enabled": t('config.label.plugins.enabled') || "Enable Plugins",
  "plugins.allow": t('config.label.plugins.allow') || "Plugin Allowlist",
  "plugins.deny": t('config.label.plugins.deny') || "Plugin Denylist",
  "plugins.load.paths": t('config.label.plugins.load.paths') || "Plugin Load Paths",
  "plugins.slots": t('config.label.plugins.slots') || "Plugin Slots",
  "plugins.slots.memory": t('config.label.plugins.slots.memory') || "Memory Plugin",
  "plugins.entries": t('config.label.plugins.entries') || "Plugin Entries",
  "plugins.entries.*.enabled": t('config.label.plugins.entries.enabled') || "Plugin Enabled",
  "plugins.entries.*.config": t('config.label.plugins.entries.config') || "Plugin Config",
  "plugins.installs": t('config.label.plugins.installs') || "Plugin Install Records",
  "plugins.installs.*.source": t('config.label.plugins.installs.source') || "Plugin Install Source",
  "plugins.installs.*.spec": t('config.label.plugins.installs.spec') || "Plugin Install Spec",
  "plugins.installs.*.sourcePath": t('config.label.plugins.installs.sourcePath') || "Plugin Install Source Path",
  "plugins.installs.*.installPath": t('config.label.plugins.installs.installPath') || "Plugin Install Path",
  "plugins.installs.*.version": t('config.label.plugins.installs.version') || "Plugin Install Version",
  "plugins.installs.*.installedAt": t('config.label.plugins.installs.installedAt') || "Plugin Install Time",
};

const FIELD_HELP: Record<string, string> = {
  "meta.lastTouchedVersion": t('config.help.meta.lastTouchedVersion') || "Auto-set when OpenClaw writes the config.",
  "meta.lastTouchedAt": t('config.help.meta.lastTouchedAt') || "ISO timestamp of the last config write (auto-set).",
  "update.channel": t('config.help.update.channel') || 'Update channel for git + npm installs ("stable", "beta", or "dev").',
  "update.checkOnStart": t('config.help.update.checkOnStart') || "Check for npm updates when the gateway starts (default: true).",
  "gateway.remote.url": t('config.help.gateway.remote.url') || "Remote Gateway WebSocket URL (ws:// or wss://).",
  "gateway.remote.tlsFingerprint":
    t('config.help.gateway.remote.tlsFingerprint') || "Expected sha256 TLS fingerprint for the remote gateway (pin to avoid MITM).",
  "gateway.remote.sshTarget":
    t('config.help.gateway.remote.sshTarget') || "Remote gateway over SSH (tunnels the gateway port to localhost). Format: user@host or user@host:port.",
  "gateway.remote.sshIdentity": t('config.help.gateway.remote.sshIdentity') || "Optional SSH identity file path (passed to ssh -i).",
  "agents.list.*.skills":
    t('config.help.agents.list.skills') || "Optional allowlist of skills for this agent (omit = all skills; empty = no skills).",
  "agents.list[].skills":
    t('config.help.agents.list.skills') || "Optional allowlist of skills for this agent (omit = all skills; empty = no skills).",
  "agents.list[].identity.avatar":
    t('config.help.agents.list.identity.avatar') || "Avatar image path (relative to the agent workspace only) or a remote URL/data URL.",
  "discovery.mdns.mode":
    t('config.help.discovery.mdns.mode') || 'mDNS broadcast mode ("minimal" default, "full" includes cliPath/sshPort, "off" disables mDNS).',
  "discovery.wideArea.enabled": t('config.help.discovery.wideArea.enabled') || "Enable wide-area service discovery (unicast DNS-SD).",
  "discovery.wideArea.domain": t('config.help.discovery.wideArea.domain') || 'Optional unicast DNS-SD domain (e.g. "openclaw.internal").',
  "talk.apiKey": t('config.help.talk.apiKey') || "ElevenLabs API key (optional; falls back to ELEVENLABS_API_KEY env var).",
  "talk.voiceId": t('config.help.talk.voiceId') || "Default ElevenLabs voice ID for Talk mode.",
  "talk.voiceAliases": t('config.help.talk.voiceAliases') || "Optional voice name to ElevenLabs voice ID mapping.",
  "talk.modelId": t('config.help.talk.modelId') || "Default ElevenLabs model ID for Talk mode.",
  "talk.outputFormat": t('config.help.talk.outputFormat') || "Default ElevenLabs output format (e.g. mp3_44100_128).",
  "talk.interruptOnSpeech": t('config.help.talk.interruptOnSpeech') || "Stop speaking when user starts talking (default: true).",
  "gateway.auth.token":
    t('config.help.gateway.auth.token') || "Required by default for gateway access (unless using Tailscale Serve identity); required for non-loopback binds.",
  "gateway.auth.password": t('config.help.gateway.auth.password') || "Required for Tailscale funnel.",
  "gateway.controlUi.basePath":
    t('config.help.gateway.controlUi.basePath') || "Optional URL prefix where the Control UI is served (e.g. /openclaw).",
  "gateway.controlUi.allowInsecureAuth":
    t('config.help.gateway.controlUi.allowInsecureAuth') || "Allow Control UI auth over insecure HTTP (token-only; not recommended).",
  "gateway.controlUi.dangerouslyDisableDeviceAuth":
    t('config.help.gateway.controlUi.dangerouslyDisableDeviceAuth') || "DANGEROUS. Disable Control UI device identity checks (token/password only).",
  "gateway.http.endpoints.chatCompletions.enabled":
    t('config.help.gateway.http.endpoints.chatCompletions.enabled') || "Enable the OpenAI-compatible `POST /v1/chat/completions` endpoint (default: false).",
  "gateway.reload.mode": t('config.help.gateway.reload.mode') || 'Hot reload strategy for config changes ("hybrid" recommended).',
  "gateway.reload.debounceMs": t('config.help.gateway.reload.debounceMs') || "Debounce window (ms) before applying config changes.",
  "gateway.nodes.browser.mode":
    t('config.help.gateway.nodes.browser.mode') || 'Node browser routing ("auto" = pick single connected browser node, "manual" = require node param, "off" = disable).',
  "gateway.nodes.browser.node": t('config.help.gateway.nodes.browser.node') || "Pin browser routing to a specific node id or name (optional).",
  "gateway.nodes.allowCommands":
    t('config.help.gateway.nodes.allowCommands') || "Extra node.invoke commands to allow beyond the gateway defaults (array of command strings).",
  "gateway.nodes.denyCommands":
    t('config.help.gateway.nodes.denyCommands') || "Commands to block even if present in node claims or default allowlist.",
  "nodeHost.browserProxy.enabled": t('config.help.nodeHost.browserProxy.enabled') || "Expose the local browser control server via node proxy.",
  "nodeHost.browserProxy.allowProfiles":
    t('config.help.nodeHost.browserProxy.allowProfiles') || "Optional allowlist of browser profile names exposed via the node proxy.",
  "browser.evaluateEnabled": t('config.help.browser.evaluateEnabled') || "If false, disable browser act:evaluate (arbitrary JS). Default: true",
  "browser.remoteCdpTimeoutMs": t('config.help.browser.remoteCdpTimeoutMs') || "Remote CDP HTTP timeout (ms). Default: 1500.",
  "browser.remoteCdpHandshakeTimeoutMs": t('config.help.browser.remoteCdpHandshakeTimeoutMs') || "Remote CDP WebSocket handshake timeout (ms). Default: max(remoteCdpTimeoutMs * 2, 2000).",
  "browser.executablePath": t('config.help.browser.executablePath') || "Override the browser executable path (all platforms).",
  "browser.headless": t('config.help.browser.headless') || "Start Chrome headless (best-effort). Default: false",
  "browser.noSandbox": t('config.help.browser.noSandbox') || "Pass --no-sandbox to Chrome (Linux containers). Default: false",
  "browser.attachOnly": t('config.help.browser.attachOnly') || "If true: never launch; only attach to an existing browser. Default: false",
  "browser.defaultProfile": t('config.help.browser.defaultProfile') || 'Default profile to use when profile param is omitted. Default: "chrome"',
  "browser.snapshotDefaults.mode": t('config.help.browser.snapshotDefaults.mode') || 'Default snapshot mode (applies when mode is not provided). Options: "efficient"',
  "diagnostics.flags":
    t('config.help.diagnostics.flags') || 'Enable targeted diagnostics logs by flag (e.g. ["telegram.http"]). Supports wildcards like "telegram.*" or "*".',
  "diagnostics.cacheTrace.enabled":
    t('config.help.diagnostics.cacheTrace.enabled') || "Log cache trace snapshots for embedded agent runs (default: false).",
  "diagnostics.cacheTrace.filePath":
    t('config.help.diagnostics.cacheTrace.filePath') || "JSONL output path for cache trace logs (default: $OPENCLAW_STATE_DIR/logs/cache-trace.jsonl).",
  "diagnostics.cacheTrace.includeMessages":
    t('config.help.diagnostics.cacheTrace.includeMessages') || "Include full message payloads in trace output (default: true).",
  "diagnostics.cacheTrace.includePrompt": t('config.help.diagnostics.cacheTrace.includePrompt') || "Include prompt text in trace output (default: true).",
  "diagnostics.cacheTrace.includeSystem": t('config.help.diagnostics.cacheTrace.includeSystem') || "Include system prompt in trace output (default: true).",
  "tools.exec.applyPatch.enabled":
    t('config.help.tools.exec.applyPatch.enabled') || "Experimental. Enables apply_patch for OpenAI models when allowed by tool policy.",
  "tools.exec.applyPatch.allowModels":
    t('config.help.tools.exec.applyPatch.allowModels') || 'Optional allowlist of model ids (e.g. "gpt-5.2" or "openai/gpt-5.2").',
  "tools.exec.notifyOnExit":
    t('config.help.tools.exec.notifyOnExit') || "When true (default), backgrounded exec sessions enqueue a system event and request a heartbeat on exit.",
  "tools.exec.pathPrepend": t('config.help.tools.exec.pathPrepend') || "Directories to prepend to PATH for exec runs (gateway/sandbox).",
  "tools.exec.safeBins":
    t('config.help.tools.exec.safeBins') || "Allow stdin-only safe binaries to run without explicit allowlist entries.",
  "tools.message.allowCrossContextSend":
    t('config.help.tools.message.allowCrossContextSend') || "Legacy override: allow cross-context sends across all providers.",
  "tools.message.crossContext.allowWithinProvider":
    t('config.help.tools.message.crossContext.allowWithinProvider') || "Allow sends to other channels within the same provider (default: true).",
  "tools.message.crossContext.allowAcrossProviders":
    t('config.help.tools.message.crossContext.allowAcrossProviders') || "Allow sends across different providers (default: false).",
  "tools.message.crossContext.marker.enabled":
    t('config.help.tools.message.crossContext.marker.enabled') || "Add a visible origin marker when sending cross-context (default: true).",
  "tools.message.crossContext.marker.prefix":
    t('config.help.tools.message.crossContext.marker.prefix') || 'Text prefix for cross-context markers (supports "{channel}").',
  "tools.message.crossContext.marker.suffix":
    t('config.help.tools.message.crossContext.marker.suffix') || 'Text suffix for cross-context markers (supports "{channel}").',
  "tools.message.broadcast.enabled": t('config.help.tools.message.broadcast.enabled') || "Enable broadcast action (default: true).",
  "tools.web.search.enabled": t('config.help.tools.web.search.enabled') || "Enable the web_search tool (requires a provider API key).",
  "tools.web.search.provider": t('config.help.tools.web.search.provider') || 'Search provider ("brave" or "perplexity").',
  "tools.web.search.apiKey": t('config.help.tools.web.search.apiKey') || "Brave Search API key (fallback: BRAVE_API_KEY env var).",
  "tools.web.search.maxResults": t('config.help.tools.web.search.maxResults') || "Default number of results to return (1-10).",
  "tools.web.search.timeoutSeconds": t('config.help.tools.web.search.timeoutSeconds') || "Timeout in seconds for web_search requests.",
  "tools.web.search.cacheTtlMinutes": t('config.help.tools.web.search.cacheTtlMinutes') || "Cache TTL in minutes for web_search results.",
  "tools.web.search.perplexity.apiKey":
    t('config.help.tools.web.search.perplexity.apiKey') || "Perplexity or OpenRouter API key (fallback: PERPLEXITY_API_KEY or OPENROUTER_API_KEY env var).",
  "tools.web.search.perplexity.baseUrl":
    t('config.help.tools.web.search.perplexity.baseUrl') || "Perplexity base URL override (default: https://openrouter.ai/api/v1 or https://api.perplexity.ai).",
  "tools.web.search.perplexity.model":
    t('config.help.tools.web.search.perplexity.model') || 'Perplexity model override (default: "perplexity/sonar-pro").',
  "tools.web.fetch.enabled": t('config.help.tools.web.fetch.enabled') || "Enable the web_fetch tool (lightweight HTTP fetch).",
  "tools.web.fetch.maxChars": t('config.help.tools.web.fetch.maxChars') || "Max characters returned by web_fetch (truncated).",
  "tools.web.fetch.timeoutSeconds": t('config.help.tools.web.fetch.timeoutSeconds') || "Timeout in seconds for web_fetch requests.",
  "tools.web.fetch.cacheTtlMinutes": t('config.help.tools.web.fetch.cacheTtlMinutes') || "Cache TTL in minutes for web_fetch results.",
  "tools.web.fetch.maxRedirects": t('config.help.tools.web.fetch.maxRedirects') || "Maximum redirects allowed for web_fetch (default: 3).",
  "tools.web.fetch.userAgent": t('config.help.tools.web.fetch.userAgent') || "Override User-Agent header for web_fetch requests.",
  "tools.web.fetch.readability":
    t('config.help.tools.web.fetch.readability') || "Use Readability to extract main content from HTML (fallbacks to basic HTML cleanup).",
  "tools.web.fetch.firecrawl.enabled": t('config.help.tools.web.fetch.firecrawl.enabled') || "Enable Firecrawl fallback for web_fetch (if configured).",
  "tools.web.fetch.firecrawl.apiKey": t('config.help.tools.web.fetch.firecrawl.apiKey') || "Firecrawl API key (fallback: FIRECRAWL_API_KEY env var).",
  "tools.web.fetch.firecrawl.baseUrl":
    t('config.help.tools.web.fetch.firecrawl.baseUrl') || "Firecrawl base URL (e.g. https://api.firecrawl.dev or custom endpoint).",
  "tools.web.fetch.firecrawl.onlyMainContent":
    t('config.help.tools.web.fetch.firecrawl.onlyMainContent') || "When true, Firecrawl returns only the main content (default: true).",
  "tools.web.fetch.firecrawl.maxAgeMs":
    t('config.help.tools.web.fetch.firecrawl.maxAgeMs') || "Firecrawl maxAge (ms) for cached results when supported by the API.",
  "tools.web.fetch.firecrawl.timeoutSeconds": t('config.help.tools.web.fetch.firecrawl.timeoutSeconds') || "Timeout in seconds for Firecrawl requests.",
  "channels.slack.allowBots":
    t('config.help.channels.slack.allowBots') || "Allow bot-authored messages to trigger Slack replies (default: false).",
  "channels.slack.thread.historyScope":
    t('config.help.channels.slack.thread.historyScope') || 'Scope for Slack thread history context ("thread" isolates per thread; "channel" reuses channel history).',
  "channels.slack.thread.inheritParent":
    t('config.help.channels.slack.thread.inheritParent') || "If true, Slack thread sessions inherit the parent channel transcript (default: false).",
  "channels.mattermost.botToken":
    t('config.help.channels.mattermost.botToken') || "Bot token from Mattermost System Console -> Integrations -> Bot Accounts.",
  "channels.mattermost.baseUrl":
    t('config.help.channels.mattermost.baseUrl') || "Base URL for your Mattermost server (e.g., https://chat.example.com).",
  "channels.mattermost.chatmode":
    t('config.help.channels.mattermost.chatmode') || 'Reply to channel messages on mention ("oncall"), on trigger chars (">" or "!") ("onchar"), or on every message ("onmessage").',
  "channels.mattermost.oncharPrefixes": t('config.help.channels.mattermost.oncharPrefixes') || 'Trigger prefixes for onchar mode (default: [">", "!"]).',
  "channels.mattermost.requireMention":
    t('config.help.channels.mattermost.requireMention') || "Require @mention in channels before responding (default: true).",
  "auth.profiles": t('config.help.auth.profiles') || "Named auth profiles (provider + mode + optional email).",
  "auth.order": t('config.help.auth.order') || "Ordered auth profile IDs per provider (used for automatic failover).",
  "messages.ackReaction": t('config.help.messages.ackReaction') || "Emoji reaction used to acknowledge inbound messages (empty disables).",
  "messages.ackReactionScope": t('config.help.messages.ackReactionScope') || 'When to send ack reactions ("group-mentions" = only group mentions, "group-all" = all group messages, "direct" = only DMs, "all" = all messages). Default: "group-mentions".',
  "messages.inbound.debounceMs": t('config.help.messages.inbound.debounceMs') || "Debounce window (ms) for batching rapid consecutive messages from the same sender (0 to disable).",
  "auth.cooldowns.billingBackoffHours":
    t('config.help.auth.cooldowns.billingBackoffHours') || "Base backoff (hours) when a profile fails due to billing/insufficient credits (default: 5).",
  "auth.cooldowns.billingBackoffHoursByProvider":
    t('config.help.auth.cooldowns.billingBackoffHoursByProvider') || "Optional per-provider overrides for billing backoff (hours).",
  "auth.cooldowns.billingMaxHours": t('config.help.auth.cooldowns.billingMaxHours') || "Cap (hours) for billing backoff (default: 24).",
  "auth.cooldowns.failureWindowHours": t('config.help.auth.cooldowns.failureWindowHours') || "Failure window (hours) for backoff counters (default: 24).",
  "agents.defaults.bootstrapMaxChars":
    t('config.help.agents.defaults.bootstrapMaxChars') || "Max characters of each workspace bootstrap file injected into the system prompt before truncation (default: 20000).",
  "agents.defaults.repoRoot":
    t('config.help.agents.defaults.repoRoot') || "Optional repository root shown in the system prompt runtime line (overrides auto-detect).",
  "agents.defaults.envelopeTimezone":
    t('config.help.agents.defaults.envelopeTimezone') || 'Timezone for message envelopes ("utc", "local", "user", or an IANA timezone string).',
  "agents.defaults.envelopeTimestamp":
    t('config.help.agents.defaults.envelopeTimestamp') || 'Include absolute timestamps in message envelopes ("on" or "off").',
  "agents.defaults.envelopeElapsed": t('config.help.agents.defaults.envelopeElapsed') || 'Include elapsed time in message envelopes ("on" or "off").',
  "agents.defaults.models": t('config.help.agents.defaults.models') || "Configured model catalog (keys are full provider/model IDs).",
  "agents.defaults.memorySearch":
    t('config.help.agents.defaults.memorySearch') || "Vector search over MEMORY.md and memory/*.md (per-agent overrides supported).",
  "agents.defaults.memorySearch.sources":
    t('config.help.agents.defaults.memorySearch.sources') || 'Sources to index for memory search (default: ["memory"]; add "sessions" to include session transcripts).',
  "agents.defaults.memorySearch.extraPaths":
    t('config.help.agents.defaults.memorySearch.extraPaths') || "Extra paths to include in memory search (directories or .md files; relative paths resolved from workspace).",
  "agents.defaults.memorySearch.experimental.sessionMemory":
    t('config.help.agents.defaults.memorySearch.experimental.sessionMemory') || "Enable experimental session transcript indexing for memory search (default: false).",
  "agents.defaults.memorySearch.provider": t('config.help.agents.defaults.memorySearch.provider') || 'Embedding provider ("openai", "gemini", or "local").',
  "agents.defaults.memorySearch.remote.baseUrl":
    t('config.help.agents.defaults.memorySearch.remote.baseUrl') || "Custom base URL for remote embeddings (OpenAI-compatible proxies or Gemini overrides).",
  "agents.defaults.memorySearch.remote.apiKey": t('config.help.agents.defaults.memorySearch.remote.apiKey') || "Custom API key for the remote embedding provider.",
  "agents.defaults.memorySearch.remote.headers":
    t('config.help.agents.defaults.memorySearch.remote.headers') || "Extra headers for remote embeddings (merged; remote overrides OpenAI headers).",
  "agents.defaults.memorySearch.remote.batch.enabled":
    t('config.help.agents.defaults.memorySearch.remote.batch.enabled') || "Enable batch API for memory embeddings (OpenAI/Gemini; default: true).",
  "agents.defaults.memorySearch.remote.batch.wait":
    t('config.help.agents.defaults.memorySearch.remote.batch.wait') || "Wait for batch completion when indexing (default: true).",
  "agents.defaults.memorySearch.remote.batch.concurrency":
    t('config.help.agents.defaults.memorySearch.remote.batch.concurrency') || "Max concurrent embedding batch jobs for memory indexing (default: 2).",
  "agents.defaults.memorySearch.remote.batch.pollIntervalMs":
    t('config.help.agents.defaults.memorySearch.remote.batch.pollIntervalMs') || "Polling interval in ms for batch status (default: 2000).",
  "agents.defaults.memorySearch.remote.batch.timeoutMinutes":
    t('config.help.agents.defaults.memorySearch.remote.batch.timeoutMinutes') || "Timeout in minutes for batch indexing (default: 60).",
  "agents.defaults.memorySearch.local.modelPath":
    t('config.help.agents.defaults.memorySearch.local.modelPath') || "Local GGUF model path or hf: URI (node-llama-cpp).",
  "agents.defaults.memorySearch.fallback":
    t('config.help.agents.defaults.memorySearch.fallback') || 'Fallback provider when embeddings fail ("openai", "gemini", "local", or "none").',
  "agents.defaults.memorySearch.store.path":
    t('config.help.agents.defaults.memorySearch.store.path') || "SQLite index path (default: ~/.openclaw/memory/{agentId}.sqlite).",
  "agents.defaults.memorySearch.store.vector.enabled":
    t('config.help.agents.defaults.memorySearch.store.vector.enabled') || "Enable sqlite-vec extension for vector search (default: true).",
  "agents.defaults.memorySearch.store.vector.extensionPath":
    t('config.help.agents.defaults.memorySearch.store.vector.extensionPath') || "Optional override path to sqlite-vec extension library (.dylib/.so/.dll).",
  "agents.defaults.memorySearch.query.hybrid.enabled":
    t('config.help.agents.defaults.memorySearch.query.hybrid.enabled') || "Enable hybrid BM25 + vector search for memory (default: true).",
  "agents.defaults.memorySearch.query.hybrid.vectorWeight":
    t('config.help.agents.defaults.memorySearch.query.hybrid.vectorWeight') || "Weight for vector similarity when merging results (0-1).",
  "agents.defaults.memorySearch.query.hybrid.textWeight":
    t('config.help.agents.defaults.memorySearch.query.hybrid.textWeight') || "Weight for BM25 text relevance when merging results (0-1).",
  "agents.defaults.memorySearch.query.hybrid.candidateMultiplier":
    t('config.help.agents.defaults.memorySearch.query.hybrid.candidateMultiplier') || "Multiplier for candidate pool size (default: 4).",
  "agents.defaults.memorySearch.cache.enabled":
    t('config.help.agents.defaults.memorySearch.cache.enabled') || "Cache chunk embeddings in SQLite to speed up reindexing and frequent updates (default: true).",
  "agents.defaults.memorySearch.cache.maxEntries":
    t('config.help.agents.defaults.memorySearch.cache.maxEntries') || "Optional cap on cached embeddings (best-effort).",
  "agents.defaults.memorySearch.sync.onSearch":
    t('config.help.agents.defaults.memorySearch.sync.onSearch') || "Lazy sync: schedule a reindex on search after changes.",
  "agents.defaults.memorySearch.sync.watch": t('config.help.agents.defaults.memorySearch.sync.watch') || "Watch memory files for changes (chokidar).",
  "agents.defaults.memorySearch.sync.sessions.deltaBytes":
    t('config.help.agents.defaults.memorySearch.sync.sessions.deltaBytes') || "Minimum appended bytes before session transcripts trigger reindex (default: 100000).",
  "agents.defaults.memorySearch.sync.sessions.deltaMessages":
    t('config.help.agents.defaults.memorySearch.sync.sessions.deltaMessages') || "Minimum appended JSONL lines before session transcripts trigger reindex (default: 50).",
  "plugins.enabled": t('config.help.plugins.enabled') || "Enable plugin/extension loading (default: true).",
  "plugins.allow": t('config.help.plugins.allow') || "Optional allowlist of plugin ids; when set, only listed plugins load.",
  "plugins.deny": t('config.help.plugins.deny') || "Optional denylist of plugin ids; deny wins over allowlist.",
  "plugins.load.paths": t('config.help.plugins.load.paths') || "Additional plugin files or directories to load.",
  "plugins.slots": t('config.help.plugins.slots') || "Select which plugins own exclusive slots (memory, etc.).",
  "plugins.slots.memory":
    t('config.help.plugins.slots.memory') || 'Select the active memory plugin by id, or "none" to disable memory plugins.',
  "plugins.entries": t('config.help.plugins.entries') || "Per-plugin settings keyed by plugin id (enable/disable + config payloads).",
  "plugins.entries.*.enabled": "Overrides plugin enable/disable for this entry (restart required).",
  "plugins.entries.*.config": "Plugin-defined config payload (schema is provided by the plugin).",
  "plugins.installs":
    t('config.help.plugins.installs') || "CLI-managed install metadata (used by `openclaw plugins update` to locate install sources).",
  "plugins.installs.*.source": 'Install source ("npm", "archive", or "path").',
  "plugins.installs.*.spec": "Original npm spec used for install (if source is npm).",
  "plugins.installs.*.sourcePath": "Original archive/path used for install (if any).",
  "plugins.installs.*.installPath":
    "Resolved install directory (usually ~/.openclaw/extensions/<id>).",
  "plugins.installs.*.version": "Version recorded at install time (if available).",
  "plugins.installs.*.installedAt": "ISO timestamp of last install/update.",
  "agents.list.*.identity.avatar":
    "Agent avatar (workspace-relative path, http(s) URL, or data URI).",
  "agents.defaults.model.primary": t('config.help.agents.defaults.model.primary') || "Primary model (provider/model).",
  "agents.defaults.model.fallbacks":
    t('config.help.agents.defaults.model.fallbacks') || "Ordered fallback models (provider/model). Used when the primary model fails.",
  "agents.defaults.imageModel.primary":
    t('config.help.agents.defaults.imageModel.primary') || "Optional image model (provider/model) used when the primary model lacks image input.",
  "agents.defaults.imageModel.fallbacks": t('config.help.agents.defaults.imageModel.fallbacks') || "Ordered fallback image models (provider/model).",
  "agents.defaults.cliBackends": t('config.help.agents.defaults.cliBackends') || "Optional CLI backends for text-only fallback (claude-cli, etc).",
  "agents.defaults.humanDelay.mode": t('config.help.agents.defaults.humanDelay.mode') || 'Delay style for block replies ("off", "natural", "custom").',
  "agents.defaults.humanDelay.minMs": t('config.help.agents.defaults.humanDelay.minMs') || "Minimum delay in ms for custom humanDelay (default: 800).",
  "agents.defaults.humanDelay.maxMs": t('config.help.agents.defaults.humanDelay.maxMs') || "Maximum delay in ms for custom humanDelay (default: 2500).",
  "commands.native":
    t('config.help.commands.native') || "Register native commands with channels that support it (Discord/Slack/Telegram).",
  "commands.nativeSkills":
    t('config.help.commands.nativeSkills') || "Register native skill commands (user-invocable skills) with channels that support it.",
  "commands.text": t('config.help.commands.text') || "Allow text command parsing (slash commands only).",
  "commands.bash":
    t('config.help.commands.bash') || "Allow bash chat command (`!`; `/bash` alias) to run host shell commands (default: false; requires tools.elevated).",
  "commands.bashForegroundMs":
    t('config.help.commands.bashForegroundMs') || "How long bash waits before backgrounding (default: 2000; 0 backgrounds immediately).",
  "commands.config": t('config.help.commands.config') || "Allow /config chat command to read/write config on disk (default: false).",
  "commands.debug": t('config.help.commands.debug') || "Allow /debug chat command for runtime-only overrides (default: false).",
  "commands.restart": t('config.help.commands.restart') || "Allow /restart and gateway restart tool actions (default: false).",
  "commands.useAccessGroups": t('config.help.commands.useAccessGroups') || "Enforce access-group allowlists/policies for commands.",
  "ui.seamColor": t('config.help.ui.seamColor') || "Control UI accent color (hex color code, e.g., #FF4500).",
  "ui.assistant.name": t('config.help.ui.assistant.name') || "Assistant display name (shown in the UI).",
  "ui.assistant.avatar": t('config.help.ui.assistant.avatar') || "Assistant avatar image (supports local path, HTTP(S) URL, or data URI).",
  "models.mode": t('config.help.models.mode') || 'Model configuration mode ("merge" merges with default models, "replace" replaces all models).',
  "models.providers": t('config.help.models.providers') || "Custom model provider configurations (keyed by provider ID, containing API endpoints and model definitions).",
  "models.bedrockDiscovery.enabled": t('config.help.models.bedrockDiscovery.enabled') || "Enable AWS Bedrock model auto-discovery (default: false).",
  "models.bedrockDiscovery.region": t('config.help.models.bedrockDiscovery.region') || "AWS Bedrock region (e.g., us-east-1).",
  "models.bedrockDiscovery.providerFilter": t('config.help.models.bedrockDiscovery.providerFilter') || 'Provider filter list (only include specified providers, e.g., ["anthropic", "meta"]).',
  "models.bedrockDiscovery.refreshInterval": t('config.help.models.bedrockDiscovery.refreshInterval') || "Model list refresh interval in seconds (default: periodic update).",
  "models.bedrockDiscovery.defaultContextWindow": t('config.help.models.bedrockDiscovery.defaultContextWindow') || "Default context window size in tokens when not specified.",
  "models.bedrockDiscovery.defaultMaxTokens": t('config.help.models.bedrockDiscovery.defaultMaxTokens') || "Default maximum output tokens when not specified.",
  "broadcast.strategy": t('config.help.broadcast.strategy') || 'Default processing strategy for broadcast peers ("parallel" for concurrent processing, "sequential" for ordered processing).',
  "audio.transcription.command": t('config.help.audio.transcription.command') || "(Deprecated; use tools.media.audio.models) CLI command template to convert inbound audio to text; must output transcript to stdout.",
  "approval.exec.enabled": t('config.help.approval.exec.enabled') || "Enable forwarding exec approvals to chat channels (default: false).",
  "approval.exec.mode": t('config.help.approval.exec.mode') || 'Delivery mode ("session" sends to origin chat, "targets" sends to configured targets, "both" sends to both) (default: session).',
  "approval.exec.agentFilter": t('config.help.approval.exec.agentFilter') || "Only forward approvals for these agent IDs (omit for all agents).",
  "approval.exec.sessionFilter": t('config.help.approval.exec.sessionFilter') || "Only forward approvals matching these session key patterns (substring or regex).",
  "approval.exec.targets": t('config.help.approval.exec.targets') || 'Explicit delivery targets (used when mode includes "targets").',
  "cron.enabled": t('config.help.cron.enabled') || "Enable cron job scheduling system (default: false).",
  "cron.maxConcurrentRuns": t('config.help.cron.maxConcurrentRuns') || "Maximum number of concurrent cron jobs (default: 1).",
  "cron.store": t('config.help.cron.store') || "Cron job state storage file path (JSONL format).",
  "web.enabled": t('config.help.web.enabled') || "Whether to start the WhatsApp web provider (default: true).",
  "web.heartbeatSeconds": t('config.help.web.heartbeatSeconds') || "WhatsApp Web heartbeat interval (seconds).",
  "web.reconnect.initialMs": t('config.help.web.reconnect.initialMs') || "Initial reconnect delay (ms).",
  "web.reconnect.maxMs": t('config.help.web.reconnect.maxMs') || "Maximum reconnect delay (ms).",
  "web.reconnect.factor": t('config.help.web.reconnect.factor') || "Reconnect delay growth factor.",
  "web.reconnect.jitter": t('config.help.web.reconnect.jitter') || "Reconnect delay jitter factor (0-1).",
  "web.reconnect.maxAttempts": t('config.help.web.reconnect.maxAttempts') || "Maximum reconnect attempts (0 = unlimited).",
  "session.dmScope":
    t('config.help.session.dmScope') || 'DM session scoping: "main" keeps continuity; "per-peer", "per-channel-peer", or "per-account-channel-peer" isolates DM history (recommended for shared inboxes/multi-account).',
  "session.identityLinks":
    t('config.help.session.identityLinks') || "Map canonical identities to provider-prefixed peer IDs for DM session linking (example: telegram:123456).",
  "channels.telegram.configWrites":
    t('config.help.channels.telegram.configWrites') || "Allow Telegram to write config in response to channel events/commands (default: true).",
  "channels.slack.configWrites":
    t('config.help.channels.slack.configWrites') || "Allow Slack to write config in response to channel events/commands (default: true).",
  "channels.mattermost.configWrites":
    t('config.help.channels.mattermost.configWrites') || "Allow Mattermost to write config in response to channel events/commands (default: true).",
  "channels.discord.configWrites":
    t('config.help.channels.discord.configWrites') || "Allow Discord to write config in response to channel events/commands (default: true).",
  "channels.whatsapp.configWrites":
    t('config.help.channels.whatsapp.configWrites') || "Allow WhatsApp to write config in response to channel events/commands (default: true).",
  "channels.signal.configWrites":
    t('config.help.channels.signal.configWrites') || "Allow Signal to write config in response to channel events/commands (default: true).",
  "channels.imessage.configWrites":
    t('config.help.channels.imessage.configWrites') || "Allow iMessage to write config in response to channel events/commands (default: true).",
  "channels.msteams.configWrites":
    t('config.help.channels.msteams.configWrites') || "Allow Microsoft Teams to write config in response to channel events/commands (default: true).",
  "channels.discord.commands.native": t('config.help.channels.discord.commands.native') || 'Override native commands for Discord (bool or "auto").',
  "channels.discord.commands.nativeSkills":
    t('config.help.channels.discord.commands.nativeSkills') || 'Override native skill commands for Discord (bool or "auto").',
  "channels.telegram.commands.native": t('config.help.channels.telegram.commands.native') || 'Override native commands for Telegram (bool or "auto").',
  "channels.telegram.commands.nativeSkills":
    t('config.help.channels.telegram.commands.nativeSkills') || 'Override native skill commands for Telegram (bool or "auto").',
  "channels.slack.commands.native": t('config.help.channels.slack.commands.native') || 'Override native commands for Slack (bool or "auto").',
  "channels.slack.commands.nativeSkills":
    t('config.help.channels.slack.commands.nativeSkills') || 'Override native skill commands for Slack (bool or "auto").',
  "session.agentToAgent.maxPingPongTurns":
    t('config.help.session.agentToAgent.maxPingPongTurns') || "Max reply-back turns between requester and target (0–5).",
  "channels.telegram.customCommands":
    t('config.help.channels.telegram.customCommands') || "Additional Telegram bot menu commands (merged with native; conflicts ignored).",
  "channels.telegram.dmPolicy":
    t('config.help.channels.telegram.dmPolicy') || 'Direct message access control ("pairing" recommended). "open" requires channels.telegram.allowFrom=["*"].',
  "channels.telegram.streamMode":
    t('config.help.channels.telegram.streamMode') || "Draft streaming mode for Telegram replies (off | partial | block). Separate from block streaming; requires private topics + sendMessageDraft.",
  "channels.telegram.draftChunk.minChars":
    t('config.help.channels.telegram.draftChunk.minChars') || 'Minimum chars before emitting a Telegram draft update when channels.telegram.streamMode="block" (default: 200).',
  "channels.telegram.draftChunk.maxChars":
    t('config.help.channels.telegram.draftChunk.maxChars') || 'Target max size for a Telegram draft update chunk when channels.telegram.streamMode="block" (default: 800; clamped to channels.telegram.textChunkLimit).',
  "channels.telegram.draftChunk.breakPreference":
    t('config.help.channels.telegram.draftChunk.breakPreference') || "Preferred breakpoints for Telegram draft chunks (paragraph | newline | sentence). Default: paragraph.",
  "channels.telegram.retry.attempts":
    t('config.help.channels.telegram.retry.attempts') || "Max retry attempts for outbound Telegram API calls (default: 3).",
  "channels.telegram.retry.minDelayMs": t('config.help.channels.telegram.retry.minDelayMs') || "Minimum retry delay in ms for Telegram outbound calls.",
  "channels.telegram.retry.maxDelayMs":
    t('config.help.channels.telegram.retry.maxDelayMs') || "Maximum retry delay cap in ms for Telegram outbound calls.",
  "channels.telegram.retry.jitter": t('config.help.channels.telegram.retry.jitter') || "Jitter factor (0-1) applied to Telegram retry delays.",
  "channels.telegram.network.autoSelectFamily":
    t('config.help.channels.telegram.network.autoSelectFamily') || "Override Node autoSelectFamily for Telegram (true=enable, false=disable).",
  "channels.telegram.timeoutSeconds":
    t('config.help.channels.telegram.timeoutSeconds') || "Max seconds before Telegram API requests are aborted (default: 500 per grammY).",
  "channels.whatsapp.dmPolicy":
    t('config.help.channels.whatsapp.dmPolicy') || 'Direct message access control ("pairing" recommended). "open" requires channels.whatsapp.allowFrom=["*"].',
  "channels.whatsapp.selfChatMode": t('config.help.channels.whatsapp.selfChatMode') || "Same-phone setup (bot uses your personal WhatsApp number).",
  "channels.whatsapp.debounceMs":
    t('config.help.channels.whatsapp.debounceMs') || "Debounce window (ms) for batching rapid consecutive messages from the same sender (0 to disable).",
  "channels.signal.dmPolicy":
    t('config.help.channels.signal.dmPolicy') || 'Direct message access control ("pairing" recommended). "open" requires channels.signal.allowFrom=["*"].',
  "channels.imessage.dmPolicy":
    t('config.help.channels.imessage.dmPolicy') || 'Direct message access control ("pairing" recommended). "open" requires channels.imessage.allowFrom=["*"].',
  "channels.bluebubbles.dmPolicy":
    t('config.help.channels.bluebubbles.dmPolicy') || 'Direct message access control ("pairing" recommended). "open" requires channels.bluebubbles.allowFrom=["*"].',
  "channels.discord.dm.policy":
    t('config.help.channels.discord.dm.policy') || 'Direct message access control ("pairing" recommended). "open" requires channels.discord.dm.allowFrom=["*"].',
  "channels.discord.retry.attempts":
    t('config.help.channels.discord.retry.attempts') || "Max retry attempts for outbound Discord API calls (default: 3).",
  "channels.discord.retry.minDelayMs": t('config.help.channels.discord.retry.minDelayMs') || "Minimum retry delay in ms for Discord outbound calls.",
  "channels.discord.retry.maxDelayMs": t('config.help.channels.discord.retry.maxDelayMs') || "Maximum retry delay cap in ms for Discord outbound calls.",
  "channels.discord.retry.jitter": t('config.help.channels.discord.retry.jitter') || "Jitter factor (0-1) applied to Discord retry delays.",
  "channels.discord.maxLinesPerMessage": t('config.help.channels.discord.maxLinesPerMessage') || "Soft max line count per Discord message (default: 17).",
  "channels.discord.intents.presence":
    t('config.help.channels.discord.intents.presence') || "Enable the Guild Presences privileged intent. Must also be enabled in the Discord Developer Portal. Allows tracking user activities (e.g. Spotify). Default: false.",
  "channels.discord.intents.guildMembers":
    t('config.help.channels.discord.intents.guildMembers') || "Enable the Guild Members privileged intent. Must also be enabled in the Discord Developer Portal. Default: false.",
  "channels.discord.pluralkit.enabled":
    t('config.help.channels.discord.pluralkit.enabled') || "Resolve PluralKit proxied messages and treat system members as distinct senders.",
  "channels.discord.pluralkit.token":
    t('config.help.channels.discord.pluralkit.token') || "Optional PluralKit token for resolving private systems or members.",
  "channels.slack.dm.policy":
    t('config.help.channels.slack.dm.policy') || 'Direct message access control ("pairing" recommended). "open" requires channels.slack.dm.allowFrom=["*"].',
  "channels.feishu.domain":
    t('config.help.channels.feishu.domain') || 'Feishu domain ("feishu" for China, "lark" for International).',
  "channels.feishu.connectionMode":
    t('config.help.channels.feishu.connectionMode') || 'Connection mode ("websocket" for real-time connection, "webhook" for callback mode).',
  "channels.feishu.allowFrom":
    t('config.help.channels.feishu.allowFrom') || 'Direct message allowlist, only listed user IDs or usernames can initiate DMs (use with dmPolicy).',
  "channels.feishu.groupAllowFrom":
    t('config.help.channels.feishu.groupAllowFrom') || 'Group allowlist, only listed user IDs or usernames can trigger the bot in groups (use with groupPolicy).',
  "channels.feishu.groupPolicy":
    t('config.help.channels.feishu.groupPolicy') || 'Group access control policy ("open" allows all members, "allowlist" whitelist mode, "disabled" disables group functionality).',
  "channels.feishu.historyLimit":
    t('config.help.channels.feishu.historyLimit') || 'Group conversation history message count limit (inherits global setting by default).',
  "channels.feishu.dmHistoryLimit":
    t('config.help.channels.feishu.dmHistoryLimit') || "Direct message history limit (inherits global setting by default).",
  "channels.feishu.chunkMode":
    t('config.help.channels.feishu.chunkMode') || 'Chunk mode ("length" by character length, "newline" by line breaks).',
  "channels.feishu.dmPolicy":
    t('config.help.channels.feishu.dmPolicy') || 'Direct message access control ("open" for all users, "pairing" requires pairing authorization, "allowlist" whitelist mode).',
  "channels.feishu.mediaMaxMb":
    t('config.help.channels.feishu.mediaMaxMb') || 'Maximum media file size limit (MB).',
  "channels.feishu.renderMode":
    t('config.help.channels.feishu.renderMode') || 'Message render mode ("auto" detect Markdown, "raw" plain text, "card" always use card).',
  "channels.feishu.requireMention":
    t('config.help.channels.feishu.requireMention') || 'Whether group messages require @ mentioning the bot to respond (default: true).',
  "channels.feishu.textChunkLimit":
    t('config.help.channels.feishu.textChunkLimit') || 'Text character limit per message (automatically chunk and send when exceeded).',
  "channels.feishu.verificationToken":
    t('config.help.channels.feishu.verificationToken') || 'Feishu event subscription verification token (used to verify webhook requests from Feishu).',
  "channels.feishu.webhookPath":
    t('config.help.channels.feishu.webhookPath') || 'Webhook callback path (default: /feishu/events, only used in webhook mode).',
  "channels.feishu.webhookPort":
    t('config.help.channels.feishu.webhookPort') || 'Webhook service listening port (only used in webhook mode).',
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  "gateway.remote.url": "ws://host:18789",
  "gateway.remote.tlsFingerprint": "sha256:ab12cd34…",
  "gateway.remote.sshTarget": "user@host",
  "gateway.controlUi.basePath": "/openclaw",
  "channels.mattermost.baseUrl": "https://chat.example.com",
  "agents.list[].identity.avatar": "avatars/openclaw.png",
};

const SENSITIVE_PATTERNS = [/token/i, /password/i, /secret/i, /api.?key/i];

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(path));
}

type JsonSchemaObject = JsonSchemaNode & {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  additionalProperties?: JsonSchemaObject | boolean;
};

function cloneSchema<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSchemaObject(value: unknown): JsonSchemaObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonSchemaObject;
}

function isObjectSchema(schema: JsonSchemaObject): boolean {
  const type = schema.type;
  if (type === "object") {
    return true;
  }
  if (Array.isArray(type) && type.includes("object")) {
    return true;
  }
  return Boolean(schema.properties || schema.additionalProperties);
}

function mergeObjectSchema(base: JsonSchemaObject, extension: JsonSchemaObject): JsonSchemaObject {
  const mergedRequired = new Set<string>([...(base.required ?? []), ...(extension.required ?? [])]);
  const merged: JsonSchemaObject = {
    ...base,
    ...extension,
    properties: {
      ...base.properties,
      ...extension.properties,
    },
  };
  if (mergedRequired.size > 0) {
    merged.required = Array.from(mergedRequired);
  }
  const additional = extension.additionalProperties ?? base.additionalProperties;
  if (additional !== undefined) {
    merged.additionalProperties = additional;
  }
  return merged;
}

function buildBaseHints(): ConfigUiHints {
  const hints: ConfigUiHints = {};
  for (const [group, label] of Object.entries(GROUP_LABELS)) {
    hints[group] = {
      label,
      group: label,
      order: GROUP_ORDER[group],
    };
  }
  for (const [path, label] of Object.entries(FIELD_LABELS)) {
    const current = hints[path];
    hints[path] = current ? { ...current, label } : { label };
  }
  for (const [path, help] of Object.entries(FIELD_HELP)) {
    const current = hints[path];
    hints[path] = current ? { ...current, help } : { help };
  }
  for (const [path, placeholder] of Object.entries(FIELD_PLACEHOLDERS)) {
    const current = hints[path];
    hints[path] = current ? { ...current, placeholder } : { placeholder };
  }
  return hints;
}

function applySensitiveHints(hints: ConfigUiHints): ConfigUiHints {
  const next = { ...hints };
  for (const key of Object.keys(next)) {
    if (isSensitivePath(key)) {
      next[key] = { ...next[key], sensitive: true };
    }
  }
  return next;
}

function applyPluginHints(hints: ConfigUiHints, plugins: PluginUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const plugin of plugins) {
    const id = plugin.id.trim();
    if (!id) {
      continue;
    }
    const name = (plugin.name ?? id).trim() || id;
    const basePath = `plugins.entries.${id}`;

    next[basePath] = {
      ...next[basePath],
      label: name,
      help: plugin.description
        ? `${plugin.description} (plugin: ${id})`
        : `Plugin entry for ${id}.`,
    };
    next[`${basePath}.enabled`] = {
      ...next[`${basePath}.enabled`],
      label: `Enable ${name}`,
    };
    next[`${basePath}.config`] = {
      ...next[`${basePath}.config`],
      label: `${name} Config`,
      help: `Plugin-defined config payload for ${id}.`,
    };

    const uiHints = plugin.configUiHints ?? {};
    for (const [relPathRaw, hint] of Object.entries(uiHints)) {
      const relPath = relPathRaw.trim().replace(/^\./, "");
      if (!relPath) {
        continue;
      }
      const key = `${basePath}.config.${relPath}`;
      next[key] = {
        ...next[key],
        ...hint,
      };
    }
  }
  return next;
}

function applyChannelHints(hints: ConfigUiHints, channels: ChannelUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const channel of channels) {
    const id = channel.id.trim();
    if (!id) {
      continue;
    }
    const basePath = `channels.${id}`;
    const current = next[basePath] ?? {};
    const label = channel.label?.trim();
    const help = channel.description?.trim();
    next[basePath] = {
      ...current,
      ...(label ? { label } : {}),
      ...(help ? { help } : {}),
    };

    const uiHints = channel.configUiHints ?? {};
    for (const [relPathRaw, hint] of Object.entries(uiHints)) {
      const relPath = relPathRaw.trim().replace(/^\./, "");
      if (!relPath) {
        continue;
      }
      const key = `${basePath}.${relPath}`;
      next[key] = {
        ...next[key],
        ...hint,
      };
    }
  }
  return next;
}

function listHeartbeatTargetChannels(channels: ChannelUiMetadata[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of CHANNEL_IDS) {
    const normalized = id.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }
  for (const channel of channels) {
    const normalized = channel.id.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function applyHeartbeatTargetHints(
  hints: ConfigUiHints,
  channels: ChannelUiMetadata[],
): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  const channelList = listHeartbeatTargetChannels(channels);
  const channelHelp = channelList.length ? ` Known channels: ${channelList.join(", ")}.` : "";
  const help = `Delivery target ("last", "none", or a channel id).${channelHelp}`;
  const paths = ["agents.defaults.heartbeat.target", "agents.list.*.heartbeat.target"];
  for (const path of paths) {
    const current = next[path] ?? {};
    next[path] = {
      ...current,
      help: current.help ?? help,
      placeholder: current.placeholder ?? "last",
    };
  }
  return next;
}

function applyPluginSchemas(schema: ConfigSchema, plugins: PluginUiMetadata[]): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asSchemaObject(next);
  const pluginsNode = asSchemaObject(root?.properties?.plugins);
  const entriesNode = asSchemaObject(pluginsNode?.properties?.entries);
  if (!entriesNode) {
    return next;
  }

  const entryBase = asSchemaObject(entriesNode.additionalProperties);
  const entryProperties = entriesNode.properties ?? {};
  entriesNode.properties = entryProperties;

  for (const plugin of plugins) {
    if (!plugin.configSchema) {
      continue;
    }
    const entrySchema = entryBase
      ? cloneSchema(entryBase)
      : ({ type: "object" } as JsonSchemaObject);
    const entryObject = asSchemaObject(entrySchema) ?? ({ type: "object" } as JsonSchemaObject);
    const baseConfigSchema = asSchemaObject(entryObject.properties?.config);
    const pluginSchema = asSchemaObject(plugin.configSchema);
    const nextConfigSchema =
      baseConfigSchema &&
      pluginSchema &&
      isObjectSchema(baseConfigSchema) &&
      isObjectSchema(pluginSchema)
        ? mergeObjectSchema(baseConfigSchema, pluginSchema)
        : cloneSchema(plugin.configSchema);

    entryObject.properties = {
      ...entryObject.properties,
      config: nextConfigSchema,
    };
    entryProperties[plugin.id] = entryObject;
  }

  return next;
}

function applyChannelSchemas(schema: ConfigSchema, channels: ChannelUiMetadata[]): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asSchemaObject(next);
  const channelsNode = asSchemaObject(root?.properties?.channels);
  if (!channelsNode) {
    return next;
  }
  const channelProps = channelsNode.properties ?? {};
  channelsNode.properties = channelProps;

  for (const channel of channels) {
    if (!channel.configSchema) {
      continue;
    }
    const existing = asSchemaObject(channelProps[channel.id]);
    const incoming = asSchemaObject(channel.configSchema);
    if (existing && incoming && isObjectSchema(existing) && isObjectSchema(incoming)) {
      channelProps[channel.id] = mergeObjectSchema(existing, incoming);
    } else {
      channelProps[channel.id] = cloneSchema(channel.configSchema);
    }
  }

  return next;
}

let cachedBase: ConfigSchemaResponse | null = null;

function stripChannelSchema(schema: ConfigSchema): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asSchemaObject(next);
  if (!root || !root.properties) {
    return next;
  }
  const channelsNode = asSchemaObject(root.properties.channels);
  if (channelsNode) {
    channelsNode.properties = {};
    channelsNode.required = [];
    channelsNode.additionalProperties = true;
  }
  return next;
}

function buildBaseConfigSchema(): ConfigSchemaResponse {
  if (cachedBase) {
    return cachedBase;
  }
  const schema = OpenClawSchema.toJSONSchema({
    target: "draft-07",
    unrepresentable: "any",
  });
  schema.title = "OpenClawConfig";
  const hints = applySensitiveHints(buildBaseHints());
  const next = {
    schema: stripChannelSchema(schema),
    uiHints: hints,
    version: VERSION,
    generatedAt: new Date().toISOString(),
  };
  cachedBase = next;
  return next;
}

export function buildConfigSchema(params?: {
  plugins?: PluginUiMetadata[];
  channels?: ChannelUiMetadata[];
}): ConfigSchemaResponse {
  const base = buildBaseConfigSchema();
  const plugins = params?.plugins ?? [];
  const channels = params?.channels ?? [];
  if (plugins.length === 0 && channels.length === 0) {
    return base;
  }
  const mergedHints = applySensitiveHints(
    applyHeartbeatTargetHints(
      applyChannelHints(applyPluginHints(base.uiHints, plugins), channels),
      channels,
    ),
  );
  const mergedSchema = applyChannelSchemas(applyPluginSchemas(base.schema, plugins), channels);
  return {
    ...base,
    schema: mergedSchema,
    uiHints: mergedHints,
  };
}
