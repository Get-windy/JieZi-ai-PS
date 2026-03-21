/**
 * 本地覆盖层：channels/dock
 *
 * 覆盖原因：本地 CHAT_CHANNEL_ORDER 扩展了 feishu/dingtalk/wecom 三个渠道，
 * 但上游 DOCKS 对象只含内置渠道，导致 listChannelDocks() 返回含 undefined 的数组，
 * 进而引发 `Cannot read properties of undefined (reading 'capabilities'/'config')` 崩溃。
 *
 * 修复策略：重新导出 upstream 所有内容，仅覆盖 listChannelDocks，在返回前过滤 undefined。
 */

export type { ChannelDock } from "../../upstream/src/channels/dock.js";
export {
  getChannelDock,
} from "../../upstream/src/channels/dock.js";

import {
  listChannelDocks as _listChannelDocks,
  type ChannelDock,
} from "../../upstream/src/channels/dock.js";

/**
 * 覆盖 listChannelDocks：过滤掉因本地扩展渠道（feishu/dingtalk/wecom）在
 * upstream DOCKS 中无对应条目而产生的 undefined 元素。
 */
export function listChannelDocks(): ChannelDock[] {
  return _listChannelDocks().filter((dock): dock is ChannelDock => dock != null);
}
