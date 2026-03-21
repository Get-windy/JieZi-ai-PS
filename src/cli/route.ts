import { isTruthyEnvValue } from "../../upstream/src/infra/env.js";
import { defaultRuntime } from "../../upstream/src/runtime.js";
import { VERSION } from "../../upstream/src/version.js";
import { getCommandPathWithRootOptions, hasFlag, hasHelpOrVersion } from "../../upstream/src/cli/argv.js";
import { emitCliBanner } from "../../upstream/src/cli/banner.js";
import { ensurePluginRegistryLoaded } from "./plugin-registry.js";
import { ensureConfigReady } from "../../upstream/src/cli/program/config-guard.js";
import { findRoutedCommand } from "../../upstream/src/cli/program/routes.js";

async function prepareRoutedCommand(params: {
  argv: string[];
  commandPath: string[];
  loadPlugins?: boolean | ((argv: string[]) => boolean);
}) {
  const suppressDoctorStdout = hasFlag(params.argv, "--json");
  emitCliBanner(VERSION, { argv: params.argv });
  await ensureConfigReady({
    runtime: defaultRuntime,
    commandPath: params.commandPath,
    ...(suppressDoctorStdout ? { suppressDoctorStdout: true } : {}),
  });
  const shouldLoadPlugins =
    typeof params.loadPlugins === "function" ? params.loadPlugins(params.argv) : params.loadPlugins;
  if (shouldLoadPlugins) {
    ensurePluginRegistryLoaded();
  }
}

export async function tryRouteCli(argv: string[]): Promise<boolean> {
  if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_ROUTE_FIRST)) {
    return false;
  }
  if (hasHelpOrVersion(argv)) {
    return false;
  }

  const path = getCommandPathWithRootOptions(argv, 2);
  if (!path[0]) {
    return false;
  }
  const route = findRoutedCommand(path);
  if (!route) {
    return false;
  }
  await prepareRoutedCommand({ argv, commandPath: path, loadPlugins: route.loadPlugins });
  return route.run(argv);
}
