// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export {
  resolveOwnerDisplaySetting,
  ensureOwnerDisplaySecret,
} from "../../upstream/src/agents/owner-display.js";
export type {
  OwnerDisplaySetting,
  OwnerDisplaySecretResolution,
} from "../../upstream/src/agents/owner-display.js";
