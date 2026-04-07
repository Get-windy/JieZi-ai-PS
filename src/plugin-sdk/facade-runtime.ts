import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import JSON5 from "json5";
import { getRuntimeConfigSnapshot } from "../config/config.js";
import { resolveConfigPath } from "../config/paths.js";
import { applyPluginAutoEnable } from "../config/plugin-auto-enable.js";
import type { OpenClawConfig } from "../config/types.js";
import { openBoundaryFileSync } from "../infra/boundary-file-read.js";
import { resolveBundledPluginsDir } from "../plugins/bundled-dir.js";
import { resolveBundledPluginPublicSurfacePath } from "../plugins/bundled-plugin-metadata.js";
import {
  createPluginActivationSource,
  normalizePluginsConfig,
  resolveEffectivePluginActivationState,
} from "../plugins/config-state.js";
import {
  loadPluginManifestRegistry,
  type PluginManifestRecord,
} from "../plugins/manifest-registry.js";
import {
  buildPluginLoaderAliasMap,
  buildPluginLoaderJitiOptions,
  resolveLoaderPackageRoot,
  shouldPreferNativeJiti,
} from "../plugins/sdk-alias.js";

// Overlay fix: use lazy getters with var (no TDZ) instead of top-level consts
// to avoid TDZ errors when feishu or other bundled plugins are loaded via jiti
// and a circular import re-enters this module before its top-level bindings
// have been fully initialized. var has no TDZ: accessing it before
// initialization returns undefined rather than throwing.
// eslint-disable-next-line no-var
var __overlayCMP: string | undefined;
function getCurrentModulePath(): string {
  if (typeof __overlayCMP === "undefined") {
    __overlayCMP = fileURLToPath(import.meta.url);
  }
  return __overlayCMP;
}

// eslint-disable-next-line no-var
var __overlayOPR: string | undefined;
function getOpenClawPackageRoot(): string {
  if (typeof __overlayOPR === "undefined") {
    __overlayOPR =
      resolveLoaderPackageRoot({
        modulePath: getCurrentModulePath(),
        moduleUrl: import.meta.url,
      }) ?? fileURLToPath(new URL("../..", import.meta.url));
  }
  return __overlayOPR;
}

// eslint-disable-next-line no-var
var __overlayPSSE: readonly [".ts", ".mts", ".js", ".mjs", ".cts", ".cjs"] | undefined;
function getPublicSurfaceSourceExtensions(): readonly [
  ".ts",
  ".mts",
  ".js",
  ".mjs",
  ".cts",
  ".cjs",
] {
  if (typeof __overlayPSSE === "undefined") {
    __overlayPSSE = [".ts", ".mts", ".js", ".mjs", ".cts", ".cjs"] as const;
  }
  return __overlayPSSE;
}

// eslint-disable-next-line no-var
var __overlayAARDN: Set<string> | undefined;
function getAlwaysAllowedRuntimeDirNames(): Set<string> {
  if (typeof __overlayAARDN === "undefined") {
    __overlayAARDN = new Set(["image-generation-core", "media-understanding-core", "speech-core"]);
  }
  return __overlayAARDN;
}

// eslint-disable-next-line no-var
var __overlayEFBC: OpenClawConfig | undefined;
function getEmptyFacadeBoundaryConfig(): OpenClawConfig {
  if (typeof __overlayEFBC === "undefined") {
    __overlayEFBC = {};
  }
  return __overlayEFBC;
}

// eslint-disable-next-line no-var
var __overlayJL: Map<string, ReturnType<typeof createJiti>> | undefined;
function getJitiLoaders(): Map<string, ReturnType<typeof createJiti>> {
  if (typeof __overlayJL === "undefined") {
    __overlayJL = new Map();
  }
  return __overlayJL;
}

// eslint-disable-next-line no-var
var __overlayLFM: Map<string, unknown> | undefined;
function getLoadedFacadeModules(): Map<string, unknown> {
  if (typeof __overlayLFM === "undefined") {
    __overlayLFM = new Map();
  }
  return __overlayLFM;
}

// eslint-disable-next-line no-var
var __overlayLFPI: Set<string> | undefined;
function getLoadedFacadePluginIds(): Set<string> {
  if (typeof __overlayLFPI === "undefined") {
    __overlayLFPI = new Set();
  }
  return __overlayLFPI;
}

// eslint-disable-next-line no-var
var __overlayCBRC: OpenClawConfig | undefined;
// eslint-disable-next-line no-var
var __overlayCBRRC:
  | {
      rawConfig: OpenClawConfig;
      config: OpenClawConfig;
      normalizedPluginsConfig: ReturnType<typeof normalizePluginsConfig>;
      activationSource: ReturnType<typeof createPluginActivationSource>;
      autoEnabledReasons: Record<string, string[]>;
    }
  | undefined;

function resolveSourceFirstPublicSurfacePath(params: {
  bundledPluginsDir?: string;
  dirName: string;
  artifactBasename: string;
}): string | null {
  const sourceBaseName = params.artifactBasename.replace(/\.js$/u, "");
  const sourceRoot =
    params.bundledPluginsDir ?? path.resolve(getOpenClawPackageRoot(), "extensions");
  for (const ext of getPublicSurfaceSourceExtensions()) {
    const candidate = path.resolve(sourceRoot, params.dirName, `${sourceBaseName}${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveFacadeModuleLocation(params: {
  dirName: string;
  artifactBasename: string;
}): { modulePath: string; boundaryRoot: string } | null {
  const bundledPluginsDir = resolveBundledPluginsDir();
  const preferSource = !getCurrentModulePath().includes(`${path.sep}dist${path.sep}`);
  if (preferSource) {
    const modulePath =
      resolveSourceFirstPublicSurfacePath({
        ...params,
        ...(bundledPluginsDir ? { bundledPluginsDir } : {}),
      }) ??
      resolveSourceFirstPublicSurfacePath(params) ??
      resolveBundledPluginPublicSurfacePath({
        rootDir: getOpenClawPackageRoot(),
        ...(bundledPluginsDir ? { bundledPluginsDir } : {}),
        dirName: params.dirName,
        artifactBasename: params.artifactBasename,
      });
    if (!modulePath) {
      return null;
    }
    return {
      modulePath,
      boundaryRoot:
        bundledPluginsDir && modulePath.startsWith(path.resolve(bundledPluginsDir) + path.sep)
          ? path.resolve(bundledPluginsDir)
          : getOpenClawPackageRoot(),
    };
  }
  const modulePath = resolveBundledPluginPublicSurfacePath({
    rootDir: getOpenClawPackageRoot(),
    ...(bundledPluginsDir ? { bundledPluginsDir } : {}),
    dirName: params.dirName,
    artifactBasename: params.artifactBasename,
  });
  if (!modulePath) {
    return null;
  }
  return {
    modulePath,
    boundaryRoot:
      bundledPluginsDir && modulePath.startsWith(path.resolve(bundledPluginsDir) + path.sep)
        ? path.resolve(bundledPluginsDir)
        : getOpenClawPackageRoot(),
  };
}

function getJiti(modulePath: string) {
  const tryNative =
    shouldPreferNativeJiti(modulePath) || modulePath.includes(`${path.sep}dist${path.sep}`);
  const aliasMap = buildPluginLoaderAliasMap(modulePath, process.argv[1], import.meta.url);
  const cacheKey = JSON.stringify({
    tryNative,
    aliasMap: Object.entries(aliasMap).toSorted(([left], [right]) => left.localeCompare(right)),
  });
  const cached = getJitiLoaders().get(cacheKey);
  if (cached) {
    return cached;
  }
  const loader = createJiti(import.meta.url, {
    ...buildPluginLoaderJitiOptions(aliasMap),
    tryNative,
  });
  getJitiLoaders().set(cacheKey, loader);
  return loader;
}

function readFacadeBoundaryConfigSafely(): OpenClawConfig {
  try {
    const runtimeSnapshot = getRuntimeConfigSnapshot();
    if (runtimeSnapshot) {
      return runtimeSnapshot;
    }
    const configPath = resolveConfigPath();
    if (!fs.existsSync(configPath)) {
      return getEmptyFacadeBoundaryConfig();
    }
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON5.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as OpenClawConfig)
      : getEmptyFacadeBoundaryConfig();
  } catch {
    return getEmptyFacadeBoundaryConfig();
  }
}

function getFacadeBoundaryResolvedConfig() {
  const rawConfig = readFacadeBoundaryConfigSafely();
  if (__overlayCBRRC && __overlayCBRC === rawConfig) {
    return __overlayCBRRC;
  }

  const autoEnabled = applyPluginAutoEnable({
    config: rawConfig,
    env: process.env,
  });
  const config = autoEnabled.config;
  const resolved = {
    rawConfig,
    config,
    normalizedPluginsConfig: normalizePluginsConfig(config?.plugins),
    activationSource: createPluginActivationSource({ config: rawConfig }),
    autoEnabledReasons: autoEnabled.autoEnabledReasons,
  };
  __overlayCBRC = rawConfig;
  __overlayCBRRC = resolved;
  return resolved;
}

function resolveBundledPluginManifestRecordByDirName(dirName: string): PluginManifestRecord | null {
  const { config } = getFacadeBoundaryResolvedConfig();
  return (
    loadPluginManifestRegistry({
      config,
      cache: true,
    }).plugins.find(
      (plugin) => plugin.origin === "bundled" && path.basename(plugin.rootDir) === dirName,
    ) ?? null
  );
}

function resolveTrackedFacadePluginId(dirName: string): string {
  return resolveBundledPluginManifestRecordByDirName(dirName)?.id ?? dirName;
}

function resolveBundledPluginPublicSurfaceAccess(params: {
  dirName: string;
  artifactBasename: string;
}): { allowed: boolean; pluginId?: string; reason?: string } {
  if (
    params.artifactBasename === "runtime-api.js" &&
    getAlwaysAllowedRuntimeDirNames().has(params.dirName)
  ) {
    return {
      allowed: true,
      pluginId: params.dirName,
    };
  }

  const manifestRecord = resolveBundledPluginManifestRecordByDirName(params.dirName);
  if (!manifestRecord) {
    return {
      allowed: false,
      reason: `no bundled plugin manifest found for ${params.dirName}`,
    };
  }
  const { config, normalizedPluginsConfig, activationSource, autoEnabledReasons } =
    getFacadeBoundaryResolvedConfig();
  const activationState = resolveEffectivePluginActivationState({
    id: manifestRecord.id,
    origin: manifestRecord.origin,
    config: normalizedPluginsConfig,
    rootConfig: config,
    enabledByDefault: manifestRecord.enabledByDefault,
    activationSource,
    autoEnabledReason: autoEnabledReasons[manifestRecord.id]?.[0],
  });
  if (activationState.enabled) {
    return {
      allowed: true,
      pluginId: manifestRecord.id,
    };
  }

  return {
    allowed: false,
    pluginId: manifestRecord.id,
    reason: activationState.reason ?? "plugin runtime is not activated",
  };
}

function createLazyFacadeValueLoader<T>(load: () => T): () => T {
  let loaded = false;
  let value: T;
  return () => {
    if (!loaded) {
      value = load();
      loaded = true;
    }
    return value;
  };
}

function createLazyFacadeProxyValue<T extends object>(params: {
  load: () => T;
  target: object;
}): T {
  const resolve = createLazyFacadeValueLoader(params.load);
  return new Proxy(params.target, {
    defineProperty(_target, property, descriptor) {
      return Reflect.defineProperty(resolve(), property, descriptor);
    },
    deleteProperty(_target, property) {
      return Reflect.deleteProperty(resolve(), property);
    },
    get(_target, property, receiver) {
      return Reflect.get(resolve(), property, receiver);
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(resolve(), property);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolve());
    },
    has(_target, property) {
      return Reflect.has(resolve(), property);
    },
    isExtensible() {
      return Reflect.isExtensible(resolve());
    },
    ownKeys() {
      return Reflect.ownKeys(resolve());
    },
    preventExtensions() {
      return Reflect.preventExtensions(resolve());
    },
    set(_target, property, value, receiver) {
      return Reflect.set(resolve(), property, value, receiver);
    },
    setPrototypeOf(_target, prototype) {
      return Reflect.setPrototypeOf(resolve(), prototype);
    },
  }) as T;
}

export function createLazyFacadeObjectValue<T extends object>(load: () => T): T {
  return createLazyFacadeProxyValue({ load, target: {} });
}

export function createLazyFacadeArrayValue<T extends readonly unknown[]>(load: () => T): T {
  return createLazyFacadeProxyValue({ load, target: [] });
}

export function loadBundledPluginPublicSurfaceModuleSync<T extends object>(params: {
  dirName: string;
  artifactBasename: string;
}): T {
  const location = resolveFacadeModuleLocation(params);
  if (!location) {
    throw new Error(
      `Unable to resolve bundled plugin public surface ${params.dirName}/${params.artifactBasename}`,
    );
  }
  const cached = getLoadedFacadeModules().get(location.modulePath);
  if (cached) {
    return cached as T;
  }

  const opened = openBoundaryFileSync({
    absolutePath: location.modulePath,
    rootPath: location.boundaryRoot,
    boundaryLabel:
      location.boundaryRoot === getOpenClawPackageRoot()
        ? "OpenClaw package root"
        : "bundled plugin directory",
    rejectHardlinks: false,
  });
  if (!opened.ok) {
    throw new Error(
      `Unable to open bundled plugin public surface ${params.dirName}/${params.artifactBasename}`,
      { cause: opened.error },
    );
  }
  fs.closeSync(opened.fd);

  // Place a sentinel object in the cache *before* the Jiti load begins.
  // If a transitive dependency of the loaded module re-enters this function
  // for the same modulePath (circular facade reference), it will receive the
  // sentinel instead of recursing infinitely.  Once the real module finishes
  // loading, Object.assign() back-fills the sentinel so any references
  // captured during the circular load phase see the final exports.
  const sentinel = {} as T;
  getLoadedFacadeModules().set(location.modulePath, sentinel);

  let loaded: T;
  try {
    // Track the owning plugin once module evaluation begins. Facade top-level
    // code may have already executed even if the module later throws.
    getLoadedFacadePluginIds().add(resolveTrackedFacadePluginId(params.dirName));
    loaded = getJiti(location.modulePath)(location.modulePath) as T;
    Object.assign(sentinel, loaded);
  } catch (err) {
    getLoadedFacadeModules().delete(location.modulePath);
    throw err;
  }

  return sentinel;
}

export function canLoadActivatedBundledPluginPublicSurface(params: {
  dirName: string;
  artifactBasename: string;
}): boolean {
  return resolveBundledPluginPublicSurfaceAccess(params).allowed;
}

export function loadActivatedBundledPluginPublicSurfaceModuleSync<T extends object>(params: {
  dirName: string;
  artifactBasename: string;
}): T {
  const access = resolveBundledPluginPublicSurfaceAccess(params);
  if (!access.allowed) {
    const pluginLabel = access.pluginId ?? params.dirName;
    throw new Error(
      `Bundled plugin public surface access blocked for "${pluginLabel}" via ${params.dirName}/${params.artifactBasename}: ${access.reason ?? "plugin runtime is not activated"}`,
    );
  }
  return loadBundledPluginPublicSurfaceModuleSync<T>(params);
}

export function tryLoadActivatedBundledPluginPublicSurfaceModuleSync<T extends object>(params: {
  dirName: string;
  artifactBasename: string;
}): T | null {
  const access = resolveBundledPluginPublicSurfaceAccess(params);
  if (!access.allowed) {
    return null;
  }
  return loadBundledPluginPublicSurfaceModuleSync<T>(params);
}

export function listImportedBundledPluginFacadeIds(): string[] {
  return [...getLoadedFacadePluginIds()].toSorted((left, right) => left.localeCompare(right));
}

export function resetFacadeRuntimeStateForTest(): void {
  getLoadedFacadeModules().clear();
  getLoadedFacadePluginIds().clear();
  getJitiLoaders().clear();
  __overlayCBRC = undefined;
  __overlayCBRRC = undefined;
}
