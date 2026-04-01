import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsdown";

// ========== 三层架构覆盖层插件 ==========
// 实现 src/ 覆盖 upstream/src/ 的物理分离机制：
//   - 当 src/ 中的文件被删除（与upstream相同）时，自动回退到 upstream/src/
//   - 当 upstream/src/ 代码导入文件时，优先检查 src/ 是否有本地覆盖版本
const ROOT_DIR = path.resolve(import.meta.dirname);
const SRC_DIR = path.join(ROOT_DIR, "src");
const EXT_DIR = path.join(ROOT_DIR, "extensions");
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src");
const UP_EXT_DIR = path.join(ROOT_DIR, "upstream", "extensions");
const SEP = path.sep;
const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".json"];

// .js → .ts 扩展名映射（TypeScript 允许以 .js 扩展名导入 .ts 文件）
const JS_TO_TS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

function tryResolveFile(basePath: string): string | null {
  // 精确路径
  if (existsSync(basePath)) {
    return basePath;
  }
  // 附加扩展名
  for (const ext of TS_EXTENSIONS) {
    const p = basePath + ext;
    if (existsSync(p)) {
      return p;
    }
  }
  // 索引文件
  for (const ext of TS_EXTENSIONS) {
    const p = path.join(basePath, "index" + ext);
    if (existsSync(p)) {
      return p;
    }
  }
  // JS → TS 扩展名映射（例如 import "./foo.js" 实际指向 ./foo.ts）
  const currentExt = path.extname(basePath);
  const tsExts = JS_TO_TS[currentExt];
  if (tsExts) {
    const base = basePath.slice(0, -currentExt.length);
    for (const tsExt of tsExts) {
      const p = base + tsExt;
      if (existsSync(p)) {
        return p;
      }
    }
  }
  return null;
}

function upstreamOverlayPlugin() {
  return {
    name: "upstream-overlay",
    resolveId(source: string, importer: string | undefined) {
      // 跳过虚拟模块、node_modules、非路径标识符
      if (!source || source.startsWith("\0") || source.includes("node_modules")) {
        return null;
      }

      let absTarget: string | null = null;

      // 入口点："src/index.ts" 形式
      if (source.startsWith("src/") || source.startsWith("src\\")) {
        absTarget = path.resolve(ROOT_DIR, source);
      }
      // 相对导入："./foo" 或 "../bar" 形式
      else if ((source.startsWith("./") || source.startsWith("../")) && importer) {
        absTarget = path.resolve(path.dirname(importer), source);
      }
      // 绝对路径
      else if (path.isAbsolute(source)) {
        absTarget = source;
      }
      // 裸标识符（包名如 "lodash"）—— 交给默认解析
      else {
        return null;
      }

      absTarget = path.normalize(absTarget);

      // Case 1: 目标在 src/ 下 → 本地优先，不存在则回退到 upstream/src/
      // 例外：如果路径落入 src/extensions/，则回退到并列的 upstream/extensions/（而非 upstream/src/extensions/）
      if (absTarget.startsWith(SRC_DIR + SEP) || absTarget === SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null; // 本地存在，让默认解析处理
        }
        const rel = path.relative(SRC_DIR, absTarget);
        // 如果落入 src/extensions/ 子路径，回退到 upstream/extensions/ 而非 upstream/src/extensions/
        if (rel.startsWith("extensions" + SEP) || rel === "extensions") {
          const extRel = rel.slice("extensions".length + SEP.length);
          return tryResolveFile(path.join(UP_EXT_DIR, extRel));
        }
        return tryResolveFile(path.join(UP_SRC_DIR, rel));
      }

      // Case 2: 目标在 extensions/ 下 → 本地优先，不存在则回退到 upstream/extensions/
      if (absTarget.startsWith(EXT_DIR + SEP) || absTarget === EXT_DIR) {
        if (tryResolveFile(absTarget)) {
          return null; // 本地存在，让默认解析处理
        }
        const rel = path.relative(EXT_DIR, absTarget);
        const upExtPath = path.join(UP_EXT_DIR, rel);
        return tryResolveFile(upExtPath);
      }

      // Case 3: 目标在 upstream/src/ 下 → 检查 src/ 是否有本地覆盖
      if (absTarget.startsWith(UP_SRC_DIR + SEP) || absTarget === UP_SRC_DIR) {
        const rel = path.relative(UP_SRC_DIR, absTarget);
        const localPath = path.join(SRC_DIR, rel);
        const localResult = tryResolveFile(localPath);
        if (localResult) {
          // 自循环检测：如果找到的本地覆盖文件就是 importer 自身，跳过，直接用 upstream
          const importerNorm = importer ? path.normalize(importer) : null;
          if (importerNorm && path.normalize(localResult) === importerNorm) {
            return null; // 让默认解析处理 upstream 文件，避免自循环
          }
          return localResult; // 本地有覆盖版本，使用它
        }
        // 无本地覆盖：显式解析 upstream 路径（处理 .js → .ts 映射），避免默认解析失败
        const upstreamResult = tryResolveFile(absTarget);
        if (upstreamResult) {
          return upstreamResult;
        }
      }

      // Case 4: 目标在 upstream/extensions/ 下 → 检查 extensions/ 是否有本地覆盖
      if (absTarget.startsWith(UP_EXT_DIR + SEP) || absTarget === UP_EXT_DIR) {
        const rel = path.relative(UP_EXT_DIR, absTarget);
        const localExtPath = path.join(EXT_DIR, rel);
        const localResult = tryResolveFile(localExtPath);
        if (localResult) {
          return localResult; // 本地有覆盖版本，使用它
        }
        return tryResolveFile(absTarget); // 无本地覆盖，直接返回 upstream/extensions/ 路径
      }

      return null;
    },
  };
}

const overlayPlugin = upstreamOverlayPlugin();

const env = {
  NODE_ENV: "production",
};

// 外部化原生模块和问题依赖，避免 rolldown 尝试打包它们
const external = [
  /^@reflink\//,
  /\.node$/,
  // 外部化 @mariozechner/pi-coding-agent，避免 __exportAll 错误
  // 该包是纯 ESM 模块，必须在运行时动态加载
  /^@mariozechner\/pi-coding-agent$/,
  /^@mariozechner\/pi-ai$/,
  /^@mariozechner\/pi-agent-core$/,
  /^@mariozechner\/pi-tui$/,
];

// 禁用 chunkOptimization 解决 __exportAll is not a function 错误
// 参考: https://github.com/rolldown/rolldown/issues/8184
// 该选项会尝试将公共模块直接插入现有 chunk，可能导致循环依赖
const inputOptions = {
  experimental: {
    chunkOptimization: false,
  },
};

// manualChunks：将插件加载器及其缓存依赖强制提取为单一共享 chunk。
// 背景：rolldown 在 chunkOptimization:false 模式下会将 plugins/loader.ts、
// plugins/discovery.ts、plugins/manifest-registry.ts 内联进多个 chunk，
// 每份内联各自持有独立的 Map/Set 实例导致缓存永远 MISS，每次调用都触发
// 一次完整的 jiti 插件加载（每秒数十次循环）。
// 将这三个文件固定到命名 chunk 后，所有调用方共享同一个缓存实例。
const pluginLoaderManualChunks = (id: string): string | undefined => {
  const norm = id.replace(/\\/g, "/");
  if (norm.includes("upstream/src/plugins/loader") || norm.includes("src/plugins/loader")) {
    return "plugin-loader";
  }
  if (norm.includes("upstream/src/plugins/discovery") || norm.includes("src/plugins/discovery")) {
    return "plugin-loader";
  }
  if (
    norm.includes("upstream/src/plugins/manifest-registry") ||
    norm.includes("src/plugins/manifest-registry")
  ) {
    return "plugin-loader";
  }
  return undefined;
};

const outputOptionsWithManualChunks = {
  manualChunks: pluginLoaderManualChunks,
};

// plugin-sdk 多入口构建：禁用 chunkOptimization，同时通过 rollupOptions 强制
// 每个入口独立打包（不共享 chunk），规避 rolldown rc.3 多入口共享 chunk 时
// 产生的 TDZ（Temporal Dead Zone）初始化顺序错误。
const pluginSdkInputOptions = {
  experimental: {
    chunkOptimization: false,
  },
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
    outputOptions: outputOptionsWithManualChunks,
  },
  {
    entry: "src/entry.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
    outputOptions: outputOptionsWithManualChunks,
  },
  {
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
    env,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    outputOptions: outputOptionsWithManualChunks,
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
    outputOptions: outputOptionsWithManualChunks,
  },
  // plugin-sdk 各入口独立构建，避免共享 chunk 导致的 TDZ 初始化顺序错误
  // Helper: resolve plugin-sdk entry with upstream overlay fallback
  // If src/plugin-sdk/<name>.ts does not exist, fall back to upstream/src/plugin-sdk/<name>.ts
  // so tsdown can find the entry file and build dist/plugin-sdk/<name>.js
  ...[
    "src/plugin-sdk/index.ts",
    "src/plugin-sdk/core.ts",
    "src/plugin-sdk/compat.ts",
    "src/plugin-sdk/telegram.ts",
    "src/plugin-sdk/discord.ts",
    "src/plugin-sdk/slack.ts",
    "src/plugin-sdk/signal.ts",
    "src/plugin-sdk/imessage.ts",
    "src/plugin-sdk/whatsapp.ts",
    "src/plugin-sdk/line.ts",
    "src/plugin-sdk/msteams.ts",
    "src/plugin-sdk/acpx.ts",
    "src/plugin-sdk/bluebubbles.ts",
    "src/plugin-sdk/copilot-proxy.ts",
    "src/plugin-sdk/diagnostics-otel.ts",
    "src/plugin-sdk/diffs.ts",
    "src/plugin-sdk/feishu.ts",
    "src/plugin-sdk/googlechat.ts",
    "src/plugin-sdk/irc.ts",
    "src/plugin-sdk/llm-task.ts",
    "src/plugin-sdk/lobster.ts",
    "src/plugin-sdk/matrix.ts",
    "src/plugin-sdk/mattermost.ts",
    "src/plugin-sdk/memory-core.ts",
    "src/plugin-sdk/memory-lancedb.ts",
    "src/plugin-sdk/nextcloud-talk.ts",
    "src/plugin-sdk/nostr.ts",
    "src/plugin-sdk/open-prose.ts",
    "src/plugin-sdk/phone-control.ts",
    "src/plugin-sdk/talk-voice.ts",
    "src/plugin-sdk/test-utils.ts",
    "src/plugin-sdk/thread-ownership.ts",
    "src/plugin-sdk/tlon.ts",
    "src/plugin-sdk/twitch.ts",
    "src/plugin-sdk/voice-call.ts",
    "src/plugin-sdk/zalo.ts",
    "src/plugin-sdk/zalouser.ts",
    "src/plugin-sdk/account-id.ts",
    "src/plugin-sdk/keyed-async-queue.ts",
    // Additional plugin-sdk entries (synced from upstream plugin-sdk-entrypoints.json)
    "src/plugin-sdk/ollama-setup.ts",
    "src/plugin-sdk/provider-setup.ts",
    "src/plugin-sdk/sandbox.ts",
    "src/plugin-sdk/self-hosted-provider-setup.ts",
    "src/plugin-sdk/routing.ts",
    "src/plugin-sdk/runtime.ts",
    "src/plugin-sdk/runtime-env.ts",
    "src/plugin-sdk/setup.ts",
    "src/plugin-sdk/setup-adapter-runtime.ts",
    "src/plugin-sdk/setup-runtime.ts",
    "src/plugin-sdk/channel-setup.ts",
    "src/plugin-sdk/setup-tools.ts",
    "src/plugin-sdk/config-runtime.ts",
    "src/plugin-sdk/reply-runtime.ts",
    "src/plugin-sdk/reply-payload.ts",
    "src/plugin-sdk/channel-reply-pipeline.ts",
    "src/plugin-sdk/channel-runtime.ts",
    "src/plugin-sdk/interactive-runtime.ts",
    "src/plugin-sdk/infra-runtime.ts",
    "src/plugin-sdk/ssrf-runtime.ts",
    "src/plugin-sdk/media-runtime.ts",
    "src/plugin-sdk/media-understanding-runtime.ts",
    "src/plugin-sdk/conversation-runtime.ts",
    "src/plugin-sdk/matrix-runtime-heavy.ts",
    "src/plugin-sdk/matrix-runtime-shared.ts",
    "src/plugin-sdk/thread-bindings-runtime.ts",
    "src/plugin-sdk/text-runtime.ts",
    "src/plugin-sdk/agent-runtime.ts",
    "src/plugin-sdk/speech-runtime.ts",
    "src/plugin-sdk/plugin-runtime.ts",
    "src/plugin-sdk/security-runtime.ts",
    "src/plugin-sdk/gateway-runtime.ts",
    "src/plugin-sdk/cli-runtime.ts",
    "src/plugin-sdk/hook-runtime.ts",
    "src/plugin-sdk/process-runtime.ts",
    "src/plugin-sdk/windows-spawn.ts",
    "src/plugin-sdk/acp-runtime.ts",
    "src/plugin-sdk/lazy-runtime.ts",
    "src/plugin-sdk/testing.ts",
    "src/plugin-sdk/account-helpers.ts",
    "src/plugin-sdk/account-resolution.ts",
    "src/plugin-sdk/allow-from.ts",
    "src/plugin-sdk/allowlist-config-edit.ts",
    "src/plugin-sdk/boolean-param.ts",
    "src/plugin-sdk/command-auth.ts",
    "src/plugin-sdk/device-bootstrap.ts",
    "src/plugin-sdk/extension-shared.ts",
    "src/plugin-sdk/channel-config-helpers.ts",
    "src/plugin-sdk/channel-config-schema.ts",
    "src/plugin-sdk/channel-actions.ts",
    "src/plugin-sdk/channel-contract.ts",
    "src/plugin-sdk/channel-feedback.ts",
    "src/plugin-sdk/channel-inbound.ts",
    "src/plugin-sdk/channel-lifecycle.ts",
    "src/plugin-sdk/channel-pairing.ts",
    "src/plugin-sdk/channel-policy.ts",
    "src/plugin-sdk/channel-send-result.ts",
    "src/plugin-sdk/channel-targets.ts",
    "src/plugin-sdk/group-access.ts",
    "src/plugin-sdk/directory-runtime.ts",
    "src/plugin-sdk/json-store.ts",
    "src/plugin-sdk/provider-auth.ts",
    "src/plugin-sdk/provider-auth-api-key.ts",
    "src/plugin-sdk/provider-auth-login.ts",
    "src/plugin-sdk/plugin-entry.ts",
    "src/plugin-sdk/provider-catalog.ts",
    "src/plugin-sdk/provider-env-vars.ts",
    "src/plugin-sdk/provider-google.ts",
    "src/plugin-sdk/provider-models.ts",
    "src/plugin-sdk/provider-onboard.ts",
    "src/plugin-sdk/provider-stream.ts",
    "src/plugin-sdk/provider-usage.ts",
    "src/plugin-sdk/provider-web-search.ts",
    "src/plugin-sdk/provider-zai-endpoint.ts",
    "src/plugin-sdk/image-generation.ts",
    "src/plugin-sdk/reply-history.ts",
    "src/plugin-sdk/media-understanding.ts",
    "src/plugin-sdk/request-url.ts",
    "src/plugin-sdk/webhook-ingress.ts",
    "src/plugin-sdk/webhook-path.ts",
    "src/plugin-sdk/runtime-store.ts",
    "src/plugin-sdk/status-helpers.ts",
    "src/plugin-sdk/secret-input.ts",
    "src/plugin-sdk/web-media.ts",
    "src/plugin-sdk/speech.ts",
    "src/plugin-sdk/state-paths.ts",
    "src/plugin-sdk/tool-send.ts",
    "src/plugin-sdk/minimax-portal-auth.ts",
    "src/plugin-sdk/qwen-portal-auth.ts",
    "src/plugin-sdk/synology-chat.ts",
    "src/plugin-sdk/device-pair.ts",
  ]
    .map((entry) => {
      // Apply overlay: if the local src/ entry doesn't exist, use upstream/src/ path
      const absEntry = path.resolve(ROOT_DIR, entry);
      const resolvedEntry = existsSync(absEntry)
        ? entry
        : (() => {
            const rel = path.relative(SRC_DIR, absEntry);
            const upPath = path.join(UP_SRC_DIR, rel);
            return existsSync(upPath) ? upPath : null;
          })();
      if (!resolvedEntry) {
        return null;
      } // skip entries where neither local nor upstream file exists
      return {
        entry: resolvedEntry,
        outDir: "dist/plugin-sdk",
        env,
        external,
        plugins: [overlayPlugin],
        fixedExtension: false,
        platform: "node" as const,
        inputOptions: pluginSdkInputOptions,
      };
    })
    .filter((config): config is NonNullable<typeof config> => config !== null),
  {
    entry: "src/extensionAPI.ts",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    // Plugin runtime entry: required for loading memory-core and other plugins at runtime.
    // resolvePluginRuntimeModulePath() in upstream/src/plugins/loader.ts looks for
    // dist/plugins/runtime/index.js relative to the package root.
    entry: "src/plugins/runtime/index.ts",
    outDir: "dist/plugins/runtime",
    env,
    external,
    plugins: [overlayPlugin],
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
]);
