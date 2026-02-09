import type { GatewayBrowserClient } from "../gateway.ts";
import type { SkillStatusReport } from "../types.ts";

export type SkillsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsBusyKey: string | null;
  skillEdits: Record<string, string>;
  skillMessages: SkillMessageMap;
  // Advanced features
  skillsAdvancedMode: boolean;
  skillsSelectedSkills: Set<string>;
  skillsFilterStatus: "all" | "eligible" | "blocked" | "disabled";
  skillsFilterSource: "all" | "workspace" | "built-in" | "installed" | "extra";
};

export type SkillMessage = {
  kind: "success" | "error";
  message: string;
};

export type SkillMessageMap = Record<string, SkillMessage>;

type LoadSkillsOptions = {
  clearMessages?: boolean;
};

function setSkillMessage(state: SkillsState, key: string, message?: SkillMessage) {
  if (!key.trim()) {
    return;
  }
  const next = { ...state.skillMessages };
  if (message) {
    next[key] = message;
  } else {
    delete next[key];
  }
  state.skillMessages = next;
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function loadSkills(state: SkillsState, options?: LoadSkillsOptions) {
  if (options?.clearMessages && Object.keys(state.skillMessages).length > 0) {
    state.skillMessages = {};
  }
  if (!state.client || !state.connected) {
    return;
  }
  if (state.skillsLoading) {
    return;
  }
  state.skillsLoading = true;
  state.skillsError = null;
  try {
    const res = await state.client.request<SkillStatusReport | undefined>("skills.status", {});
    if (res) {
      state.skillsReport = res;
    }
  } catch (err) {
    state.skillsError = getErrorMessage(err);
  } finally {
    state.skillsLoading = false;
  }
}

export function updateSkillEdit(state: SkillsState, skillKey: string, value: string) {
  state.skillEdits = { ...state.skillEdits, [skillKey]: value };
}

export async function updateSkillEnabled(state: SkillsState, skillKey: string, enabled: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    await state.client.request("skills.update", { skillKey, enabled });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: enabled ? "Skill enabled" : "Skill disabled",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function saveSkillApiKey(state: SkillsState, skillKey: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const apiKey = state.skillEdits[skillKey] ?? "";
    await state.client.request("skills.update", { skillKey, apiKey });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: "API key saved",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function installSkill(
  state: SkillsState,
  skillKey: string,
  name: string,
  installId: string,
) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const result = await state.client.request<{ message?: string }>("skills.install", {
      name,
      installId,
      timeoutMs: 120000,
    });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: result?.message ?? "Installed",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

/**
 * Toggle advanced mode
 */
export function toggleAdvancedMode(state: SkillsState) {
  state.skillsAdvancedMode = !state.skillsAdvancedMode;
  if (!state.skillsAdvancedMode) {
    // Clear selection when exiting advanced mode
    state.skillsSelectedSkills = new Set();
  }
}

/**
 * Select/deselect a skill
 */
export function selectSkill(state: SkillsState, skillKey: string, selected: boolean) {
  const next = new Set(state.skillsSelectedSkills);
  if (selected) {
    next.add(skillKey);
  } else {
    next.delete(skillKey);
  }
  state.skillsSelectedSkills = next;
}

/**
 * Select all visible skills
 */
export function selectAllSkills(state: SkillsState) {
  const skills = state.skillsReport?.skills ?? [];
  state.skillsSelectedSkills = new Set(skills.map((s) => s.skillKey));
}

/**
 * Deselect all skills
 */
export function deselectAllSkills(state: SkillsState) {
  state.skillsSelectedSkills = new Set();
}

/**
 * Batch enable selected skills
 */
export async function batchEnableSkills(state: SkillsState) {
  if (!state.client || !state.connected || state.skillsSelectedSkills.size === 0) {
    return;
  }
  state.skillsLoading = true;
  state.skillsError = null;
  try {
    const promises = Array.from(state.skillsSelectedSkills).map((skillKey) =>
      state.client!.request("skills.update", { skillKey, enabled: true }),
    );
    await Promise.all(promises);
    await loadSkills(state);
    state.skillsSelectedSkills = new Set();
  } catch (err) {
    state.skillsError = getErrorMessage(err);
  } finally {
    state.skillsLoading = false;
  }
}

/**
 * Batch disable selected skills
 */
export async function batchDisableSkills(state: SkillsState) {
  if (!state.client || !state.connected || state.skillsSelectedSkills.size === 0) {
    return;
  }
  state.skillsLoading = true;
  state.skillsError = null;
  try {
    const promises = Array.from(state.skillsSelectedSkills).map((skillKey) =>
      state.client!.request("skills.update", { skillKey, enabled: false }),
    );
    await Promise.all(promises);
    await loadSkills(state);
    state.skillsSelectedSkills = new Set();
  } catch (err) {
    state.skillsError = getErrorMessage(err);
  } finally {
    state.skillsLoading = false;
  }
}

/**
 * Change status filter
 */
export function changeFilterStatus(
  state: SkillsState,
  status: "all" | "eligible" | "blocked" | "disabled",
) {
  state.skillsFilterStatus = status;
}

/**
 * Change source filter
 */
export function changeFilterSource(
  state: SkillsState,
  source: "all" | "workspace" | "built-in" | "installed" | "extra",
) {
  state.skillsFilterSource = source;
}
