/**
 * 桥接文件：将上游 errors.ts 中本地覆盖版本未包含的新增符号中转导出。
 *
 * 背景：src/agents/pi-embedded-helpers/errors.ts 是本地 overlay 文件，覆盖了
 * upstream/src/agents/pi-embedded-helpers/errors.ts。当上游新增导出符号时，
 * 由于 overlay 自循环检测机制，本地文件无法直接 re-export 上游同名文件中的内容。
 * 此桥接文件不是任何上游文件的覆盖版本，故可安全地从上游导入，再由本地 errors.ts 转发。
 */
export { classifyProviderRuntimeFailureKind } from "../../../upstream/src/agents/pi-embedded-helpers/errors.js";
export type { ProviderRuntimeFailureKind } from "../../../upstream/src/agents/pi-embedded-helpers/errors.js";
