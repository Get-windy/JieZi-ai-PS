#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertWebChannel,
  toWhatsappJid,
} from "../upstream/extensions/whatsapp/src/targets-runtime.js";
import { getReplyFromConfig } from "../upstream/src/auto-reply/reply.js";
import { monitorWebChannel } from "../upstream/src/channel-web.js";
import { promptYesNo } from "../upstream/src/cli/prompt.js";
import { waitForever } from "../upstream/src/cli/wait.js";
import { loadConfig } from "../upstream/src/config/config.js";
import {
  deriveSessionKey,
  loadSessionStore,
  resolveSessionKey,
  resolveStorePath,
  saveSessionStore,
} from "../upstream/src/config/sessions.js";
import { ensureBinary } from "../upstream/src/infra/binaries.js";
import { loadDotEnv } from "../upstream/src/infra/dotenv.js";
import { normalizeEnv } from "../upstream/src/infra/env.js";
import { formatUncaughtError } from "../upstream/src/infra/errors.js";
import { isMainModule } from "../upstream/src/infra/is-main.js";
import { ensureOpenClawCliOnPath } from "../upstream/src/infra/path-env.js";
import {
  describePortOwner,
  ensurePortAvailable,
  handlePortError,
  PortInUseError,
} from "../upstream/src/infra/ports.js";
import { assertSupportedRuntime } from "../upstream/src/infra/runtime-guard.js";
import { installUnhandledRejectionHandler } from "../upstream/src/infra/unhandled-rejections.js";
import { enableConsoleCapture } from "../upstream/src/logging.js";
import { runCommandWithTimeout, runExec } from "../upstream/src/process/exec.js";
import { normalizeE164 } from "../upstream/src/utils.js";
import { applyTemplate } from "./auto-reply/templating.js";
import { createDefaultDeps } from "./cli/deps.js";

loadDotEnv({ quiet: true });
normalizeEnv();
ensureOpenClawCliOnPath();

// Capture all console output into structured logs while keeping stdout/stderr behavior.
enableConsoleCapture();

// Enforce the minimum supported runtime before doing any work.
assertSupportedRuntime();

import { buildProgram } from "../upstream/src/cli/program.js";

const program = buildProgram();

export {
  assertWebChannel,
  applyTemplate,
  createDefaultDeps,
  deriveSessionKey,
  describePortOwner,
  ensureBinary,
  ensurePortAvailable,
  getReplyFromConfig,
  handlePortError,
  loadConfig,
  loadSessionStore,
  monitorWebChannel,
  normalizeE164,
  PortInUseError,
  promptYesNo,
  resolveSessionKey,
  resolveStorePath,
  runCommandWithTimeout,
  runExec,
  saveSessionStore,
  toWhatsappJid,
  waitForever,
};

const isMain = isMainModule({
  currentFile: fileURLToPath(import.meta.url),
});

if (isMain) {
  // Global error handlers to prevent silent crashes from unhandled rejections/exceptions.
  // These log the error and exit gracefully instead of crashing without trace.
  installUnhandledRejectionHandler();

  process.on("uncaughtException", (error) => {
    console.error("[openclaw] Uncaught exception:", formatUncaughtError(error));
    process.exit(1);
  });

  void program.parseAsync(process.argv).catch((err) => {
    console.error("[openclaw] CLI failed:", formatUncaughtError(err));
    process.exit(1);
  });
}
