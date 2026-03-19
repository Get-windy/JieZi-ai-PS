/**
 * Local overlay for upstream/src/config/validation.ts
 *
 * Re-exports everything from upstream but overrides validateConfigObjectRaw,
 * validateConfigObject, validateConfigObjectWithPlugins, and
 * validateConfigObjectRawWithPlugins to use the local OpenClawSchema that
 * includes local extension fields (modelAccounts, permissions, groups).
 */

import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../upstream/src/agents/agent-scope.js";
import { CHANNEL_IDS, normalizeChatChannelId } from "../../upstream/src/channels/registry.js";
import {
  normalizePluginsConfig,
  resolveEffectiveEnableState,
  resolveMemorySlotDecision,
} from "../../upstream/src/plugins/config-state.js";
import { loadPluginManifestRegistry } from "../../upstream/src/plugins/manifest-registry.js";
import { validateJsonSchemaValue } from "../../upstream/src/plugins/schema-validator.js";
import { isRecord } from "../../upstream/src/utils.js";
import { findDuplicateAgentDirs, formatDuplicateAgentDirError } from "../../upstream/src/config/agent-dirs.js";
import { applyAgentDefaults, applyModelDefaults, applySessionDefaults } from "../../upstream/src/config/defaults.js";
import { findLegacyConfigIssues } from "../../upstream/src/config/legacy.js";
import type { OpenClawConfig, ConfigValidationIssue } from "../../upstream/src/config/types.js";
import { OpenClawSchema } from "./zod-schema.js";

const LEGACY_REMOVED_PLUGIN_IDS = new Set(["google-antigravity-auth", "google-gemini-cli-auth"]);

type ValidateConfigWithPluginsResult =
  | { ok: true; config: OpenClawConfig; warnings: ConfigValidationIssue[] }
  | { ok: false; issues: ConfigValidationIssue[]; warnings: ConfigValidationIssue[] };

function mapZodIssue(issue: { path: (string | number)[]; message: string }): ConfigValidationIssue {
  const path = issue.path
    .filter((s): s is string | number => typeof s === "string" || typeof s === "number")
    .join(".");
  return { path, message: issue.message };
}

/**
 * Validates config without applying runtime defaults.
 * Uses the local OpenClawSchema which includes extension fields
 * (modelAccounts, permissions, groups, etc.)
 */
export function validateConfigObjectRaw(
  raw: unknown,
): { ok: true; config: OpenClawConfig } | { ok: false; issues: ConfigValidationIssue[] } {
  const legacyIssues = findLegacyConfigIssues(raw);
  if (legacyIssues.length > 0) {
    return {
      ok: false,
      issues: legacyIssues.map((iss) => ({
        path: iss.path,
        message: iss.message,
      })),
    };
  }
  const validated = OpenClawSchema.safeParse(raw);
  if (!validated.success) {
    return {
      ok: false,
      issues: validated.error.issues.map((issue) => mapZodIssue(issue as any)),
    };
  }
  const duplicates = findDuplicateAgentDirs(validated.data as OpenClawConfig);
  if (duplicates.length > 0) {
    return {
      ok: false,
      issues: [
        {
          path: "agents.list",
          message: formatDuplicateAgentDirError(duplicates),
        },
      ],
    };
  }
  return {
    ok: true,
    config: validated.data as OpenClawConfig,
  };
}

export function validateConfigObject(
  raw: unknown,
): { ok: true; config: OpenClawConfig } | { ok: false; issues: ConfigValidationIssue[] } {
  const result = validateConfigObjectRaw(raw);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    config: applyModelDefaults(applyAgentDefaults(applySessionDefaults(result.config))),
  };
}

function validateConfigObjectWithPluginsBase(
  raw: unknown,
  opts: { applyDefaults: boolean; env?: NodeJS.ProcessEnv },
): ValidateConfigWithPluginsResult {
  const base = opts.applyDefaults ? validateConfigObject(raw) : validateConfigObjectRaw(raw);
  if (!base.ok) {
    return { ok: false, issues: base.issues, warnings: [] };
  }

  const config = base.config;
  const issues: ConfigValidationIssue[] = [];
  const warnings: ConfigValidationIssue[] = [];
  const hasExplicitPluginsConfig =
    isRecord(raw) && Object.prototype.hasOwnProperty.call(raw, "plugins");

  const resolvePluginConfigIssuePath = (pluginId: string, errorPath: string): string => {
    const base = `plugins.entries.${pluginId}.config`;
    if (!errorPath || errorPath === "<root>") {
      return base;
    }
    return `${base}.${errorPath}`;
  };

  type RegistryInfo = {
    registry: ReturnType<typeof loadPluginManifestRegistry>;
    knownIds?: Set<string>;
    normalizedPlugins?: ReturnType<typeof normalizePluginsConfig>;
  };

  let registryInfo: RegistryInfo | null = null;

  const ensureRegistry = (): RegistryInfo => {
    if (registryInfo) {
      return registryInfo;
    }
    const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
    const registry = loadPluginManifestRegistry({
      config,
      workspaceDir: workspaceDir ?? undefined,
      env: opts.env,
    });
    for (const diag of registry.diagnostics) {
      let path = diag.pluginId ? `plugins.entries.${diag.pluginId}` : "plugins";
      if (!diag.pluginId && diag.message.includes("plugin path not found")) {
        path = "plugins.load.paths";
      }
      const pluginLabel = diag.pluginId ? `plugin ${diag.pluginId}` : "plugin";
      const message = `${pluginLabel}: ${diag.message}`;
      if (diag.level === "error") {
        issues.push({ path, message });
      } else {
        warnings.push({ path, message });
      }
    }
    registryInfo = { registry };
    return registryInfo;
  };

  const ensureKnownIds = (): Set<string> => {
    const info = ensureRegistry();
    if (!info.knownIds) {
      info.knownIds = new Set(info.registry.plugins.map((record) => record.id));
    }
    return info.knownIds;
  };

  const ensureNormalizedPlugins = (): ReturnType<typeof normalizePluginsConfig> => {
    const info = ensureRegistry();
    if (!info.normalizedPlugins) {
      info.normalizedPlugins = normalizePluginsConfig(config.plugins);
    }
    return info.normalizedPlugins;
  };

  const allowedChannels = new Set<string>(["defaults", "modelByChannel", ...CHANNEL_IDS]);

  if (config.channels && isRecord(config.channels)) {
    for (const key of Object.keys(config.channels)) {
      const trimmed = key.trim();
      if (!trimmed) continue;
      if (!allowedChannels.has(trimmed)) {
        const { registry } = ensureRegistry();
        for (const record of registry.plugins) {
          for (const channelId of record.channels) {
            allowedChannels.add(channelId);
          }
        }
      }
      if (!allowedChannels.has(trimmed)) {
        issues.push({ path: `channels.${trimmed}`, message: `unknown channel id: ${trimmed}` });
      }
    }
  }

  const heartbeatChannelIds = new Set<string>();
  for (const channelId of CHANNEL_IDS) {
    heartbeatChannelIds.add(channelId.toLowerCase());
  }

  const validateHeartbeatTarget = (target: string | undefined, path: string) => {
    if (typeof target !== "string") return;
    const trimmed = target.trim();
    if (!trimmed) {
      issues.push({ path, message: "heartbeat target must not be empty" });
      return;
    }
    const normalized = trimmed.toLowerCase();
    if (normalized === "last" || normalized === "none") return;
    if (normalizeChatChannelId(trimmed)) return;
    if (!heartbeatChannelIds.has(normalized)) {
      const { registry } = ensureRegistry();
      for (const record of registry.plugins) {
        for (const channelId of record.channels) {
          const pluginChannel = channelId.trim();
          if (pluginChannel) heartbeatChannelIds.add(pluginChannel.toLowerCase());
        }
      }
    }
    if (heartbeatChannelIds.has(normalized)) return;
    issues.push({ path, message: `unknown heartbeat target: ${target}` });
  };

  validateHeartbeatTarget(
    config.agents?.defaults?.heartbeat?.target,
    "agents.defaults.heartbeat.target",
  );
  if (Array.isArray(config.agents?.list)) {
    for (const [index, entry] of config.agents.list.entries()) {
      validateHeartbeatTarget(entry?.heartbeat?.target, `agents.list.${index}.heartbeat.target`);
    }
  }

  if (!hasExplicitPluginsConfig) {
    if (issues.length > 0) return { ok: false, issues, warnings };
    return { ok: true, config, warnings };
  }

  const { registry } = ensureRegistry();
  const knownIds = ensureKnownIds();
  const normalizedPlugins = ensureNormalizedPlugins();

  const pushMissingPluginIssue = (path: string, pluginId: string, opts?: { warnOnly?: boolean }) => {
    if (LEGACY_REMOVED_PLUGIN_IDS.has(pluginId)) {
      warnings.push({ path, message: `plugin removed: ${pluginId} (stale config entry ignored; remove it from plugins config)` });
      return;
    }
    if (opts?.warnOnly) {
      warnings.push({ path, message: `plugin not found: ${pluginId} (stale config entry ignored; remove it from plugins config)` });
      return;
    }
    issues.push({ path, message: `plugin not found: ${pluginId}` });
  };

  const pluginsConfig = config.plugins;
  const entries = pluginsConfig?.entries;
  if (entries && isRecord(entries)) {
    for (const pluginId of Object.keys(entries)) {
      if (!knownIds.has(pluginId)) {
        pushMissingPluginIssue(`plugins.entries.${pluginId}`, pluginId, { warnOnly: true });
      }
    }
  }

  const allow = pluginsConfig?.allow ?? [];
  for (const pluginId of allow) {
    if (typeof pluginId !== "string" || !pluginId.trim()) continue;
    if (!knownIds.has(pluginId)) pushMissingPluginIssue("plugins.allow", pluginId);
  }

  const deny = pluginsConfig?.deny ?? [];
  for (const pluginId of deny) {
    if (typeof pluginId !== "string" || !pluginId.trim()) continue;
    if (!knownIds.has(pluginId)) pushMissingPluginIssue("plugins.deny", pluginId);
  }

  const pluginSlots = pluginsConfig?.slots;
  const hasExplicitMemorySlot =
    pluginSlots !== undefined && Object.prototype.hasOwnProperty.call(pluginSlots, "memory");
  const memorySlot = normalizedPlugins.slots.memory;
  if (hasExplicitMemorySlot && typeof memorySlot === "string" && memorySlot.trim() && !knownIds.has(memorySlot)) {
    pushMissingPluginIssue("plugins.slots.memory", memorySlot);
  }

  let selectedMemoryPluginId: string | null = null;
  const seenPlugins = new Set<string>();
  for (const record of registry.plugins) {
    const pluginId = record.id;
    if (seenPlugins.has(pluginId)) continue;
    seenPlugins.add(pluginId);
    const entry = normalizedPlugins.entries[pluginId];
    const entryHasConfig = Boolean(entry?.config);

    const enableState = resolveEffectiveEnableState({
      id: pluginId,
      origin: record.origin,
      config: normalizedPlugins,
      rootConfig: config,
    });
    let enabled = enableState.enabled;
    let reason = enableState.reason;

    if (enabled) {
      const memoryDecision = resolveMemorySlotDecision({
        id: pluginId,
        kind: record.kind,
        slot: memorySlot,
        selectedId: selectedMemoryPluginId,
      });
      if (!memoryDecision.enabled) {
        enabled = false;
        reason = memoryDecision.reason;
      }
      if (memoryDecision.selected && record.kind === "memory") {
        selectedMemoryPluginId = pluginId;
      }
    }

    const shouldValidate = enabled || entryHasConfig;
    if (shouldValidate) {
      if (record.configSchema) {
        const res = validateJsonSchemaValue({
          schema: record.configSchema,
          cacheKey: record.schemaCacheKey ?? record.manifestPath ?? pluginId,
          value: entry?.config ?? {},
        });
        if (!res.ok) {
          for (const error of res.errors) {
            issues.push({
              path: resolvePluginConfigIssuePath(pluginId, error.path),
              message: `invalid config: ${error.message}`,
              allowedValues: error.allowedValues,
              allowedValuesHiddenCount: error.allowedValuesHiddenCount,
            });
          }
        }
      } else if (record.format === "bundle") {
        // Compatible bundles — treat as schema-less.
      } else {
        issues.push({ path: `plugins.entries.${pluginId}`, message: `plugin schema missing for ${pluginId}` });
      }
    }

    if (!enabled && entryHasConfig) {
      warnings.push({
        path: `plugins.entries.${pluginId}`,
        message: `plugin disabled (${reason ?? "disabled"}) but config is present`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues, warnings };
  return { ok: true, config, warnings };
}

export function validateConfigObjectWithPlugins(
  raw: unknown,
  params?: { env?: NodeJS.ProcessEnv },
): ValidateConfigWithPluginsResult {
  return validateConfigObjectWithPluginsBase(raw, { applyDefaults: true, env: params?.env });
}

export function validateConfigObjectRawWithPlugins(
  raw: unknown,
  params?: { env?: NodeJS.ProcessEnv },
): ValidateConfigWithPluginsResult {
  return validateConfigObjectWithPluginsBase(raw, { applyDefaults: false, env: params?.env });
}
