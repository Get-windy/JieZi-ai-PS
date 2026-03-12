// 本地覆盖：在上游 bot-access.ts 基础上补充 normalizeAllowFromWithStore 别名
// 上游已将该函数改名为 normalizeDmAllowFromWithStore，本地代码仍使用旧名称

export {
  firstDefined,
  isSenderAllowed,
  normalizeAllowFrom,
  normalizeDmAllowFromWithStore,
  resolveSenderAllowMatch,
  type AllowFromMatch,
  type NormalizedAllowFrom,
} from "../../upstream/src/telegram/bot-access.js";

import { normalizeDmAllowFromWithStore } from "../../upstream/src/telegram/bot-access.js";

/** @deprecated 已改名为 normalizeDmAllowFromWithStore，保留此别名兼容本地代码 */
export const normalizeAllowFromWithStore = normalizeDmAllowFromWithStore;
