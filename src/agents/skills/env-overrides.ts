import { applySkillEnvOverridesFromSnapshot as _applySkillEnvOverridesFromSnapshot } from "../../../upstream/src/agents/skills/env-overrides.js";
import type { SkillSnapshot } from "../../../upstream/src/agents/skills/types.js";
import type { OpenClawConfig } from "../../../upstream/src/config/types.openclaw.js";

export {
  getActiveSkillEnvKeys,
  applySkillEnvOverrides,
} from "../../../upstream/src/agents/skills/env-overrides.js";

// 防御性修复：旧版本持久化数据中 snapshot.skills 可能为 undefined 或非数组
// 导致 "TypeError: snapshot.skills is not iterable"，加兼容性保护
export function applySkillEnvOverridesFromSnapshot(params: {
  snapshot?: SkillSnapshot;
  config?: OpenClawConfig;
}) {
  const { snapshot } = params;
  if (!snapshot) {
    return () => {};
  }
  // 确保 skills 是数组，兼容旧版本持久化数据
  const skills = Array.isArray(snapshot.skills) ? snapshot.skills : [];
  return _applySkillEnvOverridesFromSnapshot({
    snapshot: { ...snapshot, skills },
    config: params.config,
  });
}
