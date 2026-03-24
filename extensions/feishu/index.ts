// 飞书通道插件入口 — 代理到 upstream/extensions/feishu
// src/ 为空时，tsdown overlay 及运行时 jiti 会从 upstream/extensions/feishu/src/ 解析
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { feishuPlugin } from "./src/channel.js";
import { setFeishuRuntime } from "./src/runtime.js";
import { registerFeishuSubagentHooks } from "./src/subagent-hooks.js";
import { registerFeishuDocTools } from "./src/docx.js";
import { registerFeishuChatTools } from "./src/chat.js";
import { registerFeishuWikiTools } from "./src/wiki.js";
import { registerFeishuDriveTools } from "./src/drive.js";
import { registerFeishuPermTools } from "./src/perm.js";
import { registerFeishuBitableTools } from "./src/bitable.js";

export { feishuPlugin } from "./src/channel.js";
export { setFeishuRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "feishu",
  name: "Feishu",
  description: "Feishu/Lark channel plugin",
  plugin: feishuPlugin,
  setRuntime: setFeishuRuntime,
  registerFull(api) {
    registerFeishuSubagentHooks(api);
    registerFeishuDocTools(api);
    registerFeishuChatTools(api);
    registerFeishuWikiTools(api);
    registerFeishuDriveTools(api);
    registerFeishuPermTools(api);
    registerFeishuBitableTools(api);
  },
});
