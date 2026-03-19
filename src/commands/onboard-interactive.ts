import type { RuntimeEnv } from "../../upstream/src/runtime.js";
import { defaultRuntime } from "../../upstream/src/runtime.js";
import { restoreTerminalState } from "../../upstream/src/terminal/restore.js";
import { createClackPrompter } from "../../upstream/src/wizard/clack-prompter.js";
import { WizardCancelledError } from "../../upstream/src/wizard/prompts.js";
import { runSetupWizard } from "../../upstream/src/wizard/setup.js";
import type { OnboardOptions } from "../../upstream/src/commands/onboard-types.js";

export async function runInteractiveOnboarding(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const prompter = createClackPrompter();
  let exitCode: number | null = null;
  try {
    await runSetupWizard(opts, runtime, prompter);
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      // Best practice: cancellation is not a successful completion.
      exitCode = 1;
      return;
    }
    throw err;
  } finally {
    // Keep stdin paused so non-daemon runs can exit cleanly (e.g. Docker setup).
    restoreTerminalState("onboarding finish", { resumeStdinIfPaused: false });
    if (exitCode !== null) {
      runtime.exit(exitCode);
    }
  }
}
