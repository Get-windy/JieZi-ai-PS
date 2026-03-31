import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import pluginSdkEntryList from "./upstream/scripts/lib/plugin-sdk-entrypoints.json" with { type: "json" };

// ========== Overlay resolve plugin (mirrors tsdown.config.ts logic) ==========
// Vitest resolves modules directly from the filesystem and does not go through
// the rolldown build pipeline, so the upstream-overlay rolldown plugin has no
// effect during test runs.  We register an equivalent Vite/Vitest plugin here
// so that any `src/` import that is missing from the overlay layer automatically
// falls back to `upstream/src/`, matching the build-time behaviour.
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(ROOT_DIR, "src");
const EXT_DIR = path.join(ROOT_DIR, "extensions");
const UP_SRC_DIR = path.join(ROOT_DIR, "upstream", "src");
const UP_EXT_DIR = path.join(ROOT_DIR, "upstream", "extensions");
const SEP = path.sep;
const JS_TO_TS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

function tryResolveFile(basePath: string): string | null {
  if (existsSync(basePath)) {
    return basePath;
  }
  const TS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".json"];
  for (const ext of TS_EXTS) {
    const p = basePath + ext;
    if (existsSync(p)) {
      return p;
    }
  }
  for (const ext of TS_EXTS) {
    const p = path.join(basePath, "index" + ext);
    if (existsSync(p)) {
      return p;
    }
  }
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

function vitestOverlayPlugin() {
  return {
    name: "vitest-upstream-overlay",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      if (!source || source.startsWith("\0") || source.includes("node_modules")) {
        return null;
      }
      let absTarget: string | null = null;
      if (source.startsWith("src/") || source.startsWith("src\\")) {
        absTarget = path.resolve(ROOT_DIR, source);
      } else if ((source.startsWith("./") || source.startsWith("../")) && importer) {
        absTarget = path.resolve(path.dirname(importer), source);
      } else if (path.isAbsolute(source)) {
        absTarget = source;
      } else {
        return null;
      }
      absTarget = path.normalize(absTarget);
      // Case 1: target under src/ → local first, fallback to upstream/src/
      if (absTarget.startsWith(SRC_DIR + SEP) || absTarget === SRC_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        }
        const rel = path.relative(SRC_DIR, absTarget);
        if (rel.startsWith("extensions" + SEP) || rel === "extensions") {
          return tryResolveFile(path.join(UP_EXT_DIR, rel.slice("extensions".length + SEP.length)));
        }
        return tryResolveFile(path.join(UP_SRC_DIR, rel));
      }
      // Case 2: target under extensions/ → local first, fallback to upstream/extensions/
      if (absTarget.startsWith(EXT_DIR + SEP) || absTarget === EXT_DIR) {
        if (tryResolveFile(absTarget)) {
          return null;
        }
        return tryResolveFile(path.join(UP_EXT_DIR, path.relative(EXT_DIR, absTarget)));
      }
      // Case 3: target under upstream/src/ → prefer local src/ override
      if (absTarget.startsWith(UP_SRC_DIR + SEP) || absTarget === UP_SRC_DIR) {
        const rel = path.relative(UP_SRC_DIR, absTarget);
        const localResult = tryResolveFile(path.join(SRC_DIR, rel));
        if (localResult && importer && path.normalize(localResult) !== path.normalize(importer)) {
          return localResult;
        }
        // No local override: explicitly resolve upstream path (handles .js → .ts mapping)
        const upstreamResult = tryResolveFile(absTarget);
        if (upstreamResult) {
          return upstreamResult;
        }
      }
      // Case 4: target under upstream/extensions/ → prefer local extensions/ override
      if (absTarget.startsWith(UP_EXT_DIR + SEP) || absTarget === UP_EXT_DIR) {
        const localResult = tryResolveFile(
          path.join(EXT_DIR, path.relative(UP_EXT_DIR, absTarget)),
        );
        if (localResult) {
          return localResult;
        }
        return tryResolveFile(absTarget);
      }
      return null;
    },
  };
}

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = Math.max(4, Math.min(16, os.cpus().length));
const ciWorkers = isWindows ? 2 : 3;

export default defineConfig({
  plugins: [vitestOverlayPlugin()],
  resolve: {
    // Keep this ordered: the base `openclaw/plugin-sdk` alias is a prefix match.
    alias: [
      // Subpath aliases: openclaw/plugin-sdk/<name> → src/plugin-sdk/<name>.ts
      // (overlay plugin falls back to upstream/src/plugin-sdk/<name>.ts if not in src/)
      ...pluginSdkEntryList
        .filter((e) => e !== "index" && e !== "account-id")
        .map((subpath) => ({
          find: `openclaw/plugin-sdk/${subpath}`,
          replacement: existsSync(path.join(repoRoot, "src", "plugin-sdk", `${subpath}.ts`))
            ? path.join(repoRoot, "src", "plugin-sdk", `${subpath}.ts`)
            : path.join(repoRoot, "upstream", "src", "plugin-sdk", `${subpath}.ts`),
        })),
      {
        find: "openclaw/plugin-sdk/account-id",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "account-id.ts"),
      },
      {
        find: "openclaw/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
    ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: isWindows ? 180_000 : 120_000,
    // Many suites rely on `vi.stubEnv(...)` and expect it to be scoped to the test.
    // This is especially important under `pool=vmForks` where env leaks cross-file.
    unstubEnvs: true,
    // Same rationale as unstubEnvs: avoid cross-test pollution under vmForks.
    unstubGlobals: true,
    pool: "forks",
    maxWorkers: isCI ? ciWorkers : localWorkers,
    include: [
      "src/**/*.test.ts",
      "extensions/**/*.test.ts",
      "test/**/*.test.ts",
      "ui/src/ui/views/usage-render-details.test.ts",
      "ui/src/ui/controllers/agents.test.ts",
    ],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "apps/macos/**",
      "apps/macos/.build/**",
      "**/node_modules/**",
      "**/vendor/**",
      "dist/OpenClaw.app/**",
      "**/*.live.test.ts",
      "**/*.e2e.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Keep coverage stable without an ever-growing exclude list:
      // only count files actually exercised by the test suite.
      all: false,
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 55,
        statements: 70,
      },
      // Anchor to repo-root `src/` only. Without this, coverage globs can
      // unintentionally match nested `*/src/**` folders (extensions, apps, etc).
      include: ["./src/**/*.ts"],
      exclude: [
        // Never count workspace packages/apps toward core coverage thresholds.
        "extensions/**",
        "apps/**",
        "ui/**",
        "test/**",
        "src/**/*.test.ts",
        // Entrypoints and wiring (covered by CI smoke + manual/e2e flows).
        "src/entry.ts",
        "src/index.ts",
        "src/runtime.ts",
        "src/channel-web.ts",
        "src/extensionAPI.ts",
        "src/logging.ts",
        "src/cli/**",
        "src/commands/**",
        "src/daemon/**",
        "src/hooks/**",
        "src/macos/**",

        // Large integration surfaces; validated via e2e/manual/contract tests.
        "src/acp/**",
        "src/agents/**",
        "src/channels/**",
        "src/gateway/**",
        "src/line/**",
        "src/media-understanding/**",
        "src/node-host/**",
        "src/plugins/**",
        "src/providers/**",

        // Some agent integrations are intentionally validated via manual/e2e runs.
        "src/agents/model-scan.ts",
        "src/agents/pi-embedded-runner.ts",
        "src/agents/sandbox-paths.ts",
        "src/agents/sandbox.ts",
        "src/agents/skills-install.ts",
        "src/agents/pi-tool-definition-adapter.ts",
        "src/agents/tools/discord-actions*.ts",
        "src/agents/tools/slack-actions.ts",

        // Hard-to-unit-test modules; exercised indirectly by integration tests.
        "src/infra/state-migrations.ts",
        "src/infra/skills-remote.ts",
        "src/infra/update-check.ts",
        "src/infra/ports-inspect.ts",
        "src/infra/outbound/outbound-session.ts",
        "src/memory/batch-gemini.ts",

        // Gateway server integration surfaces are intentionally validated via manual/e2e runs.
        "src/gateway/control-ui.ts",
        "src/gateway/server-bridge.ts",
        "src/gateway/server-channels.ts",
        "src/gateway/server-methods/config.ts",
        "src/gateway/server-methods/send.ts",
        "src/gateway/server-methods/skills.ts",
        "src/gateway/server-methods/talk.ts",
        "src/gateway/server-methods/web.ts",
        "src/gateway/server-methods/wizard.ts",

        // Process bridges are hard to unit-test in isolation.
        "src/gateway/call.ts",
        "src/process/tau-rpc.ts",
        "src/process/exec.ts",
        // Interactive UIs/flows are intentionally validated via manual/e2e runs.
        "src/tui/**",
        "src/wizard/**",
        // Channel surfaces are largely integration-tested (or manually validated).
        "src/discord/**",
        "src/imessage/**",
        "src/signal/**",
        "src/slack/**",
        "src/browser/**",
        "src/channels/web/**",
        "src/telegram/index.ts",
        "src/telegram/proxy.ts",
        "src/telegram/webhook-set.ts",
        "src/telegram/**",
        "src/webchat/**",
        "src/gateway/server.ts",
        "src/gateway/client.ts",
        "src/gateway/protocol/**",
        "src/infra/tailscale.ts",
      ],
    },
  },
});
