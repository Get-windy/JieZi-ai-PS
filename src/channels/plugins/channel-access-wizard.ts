import type { GroupPolicy } from "../../../upstream/src/config/types.base.js";
import type { WizardPrompter } from "../../../upstream/src/wizard/prompts.js";
import { splitSetupEntries } from "../../../upstream/src/channels/plugins/setup-wizard-helpers.js";

export type ChannelAccessConfig = {
  policy: GroupPolicy;
  entries: string[];
};

/**
 * Prompt the user to configure group/channel access policy and allow-from entries.
 * Returns null if the user skips or cancels configuration.
 */
export async function promptChannelAccessConfig(params: {
  prompter: Pick<WizardPrompter, "select" | "text" | "confirm">;
  label: string;
  currentPolicy?: GroupPolicy;
  currentEntries?: string[];
  placeholder?: string;
  updatePrompt?: boolean;
}): Promise<ChannelAccessConfig | null> {
  const { prompter, label, currentPolicy, currentEntries, placeholder, updatePrompt } = params;

  if (updatePrompt) {
    const shouldUpdate = await prompter.confirm({
      message: `Update ${label} access settings?`,
      initialValue: false,
    });
    if (!shouldUpdate) {
      return null;
    }
  }

  const policy = (await prompter.select({
    message: `${label} access policy`,
    options: [
      { value: "allowlist", label: "Allowlist (only listed groups/channels)" },
      { value: "open", label: "Open (all groups/channels)" },
    ],
    initialValue: currentPolicy ?? "allowlist",
  })) as GroupPolicy;

  if (policy === "open") {
    return { policy, entries: [] };
  }

  const rawEntries = await prompter.text({
    message: `${label} (comma or newline separated${placeholder ? `, e.g. ${placeholder}` : ""})`,
    initialValue: (currentEntries ?? []).join(", "),
    placeholder: placeholder ?? "",
  });

  const entries = splitSetupEntries(String(rawEntries ?? ""));
  return { policy, entries };
}
