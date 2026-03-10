import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import {
  createMemorySaveTool,
  createMemoryDeleteTool,
  createMemoryListTool,
} from "../../src/agents/tools/memory-write-tool.js";

const memoryCorePlugin = {
  id: "memory-core",
  name: "Memory (Core)",
  description: "File-backed memory search tools and CLI",
  kind: "memory",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerTool(
      (ctx) => {
        const memorySearchTool = api.runtime.tools.createMemorySearchTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        const memoryGetTool = api.runtime.tools.createMemoryGetTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        if (!memorySearchTool || !memoryGetTool) {
          return null;
        }
        return [memorySearchTool, memoryGetTool];
      },
      { names: ["memory_search", "memory_get"] },
    );

    // 主动记忆写入工具（借鉴 Letta core_memory_append + Mem0 语义去重）
    api.registerTool((ctx) => createMemorySaveTool({ agentId: ctx.agentId }), {
      names: ["memory_save"],
    });
    api.registerTool((ctx) => createMemoryDeleteTool({ agentId: ctx.agentId }), {
      names: ["memory_delete"],
    });
    api.registerTool((ctx) => createMemoryListTool({ agentId: ctx.agentId }), {
      names: ["memory_list"],
    });

    api.registerCli(
      ({ program }) => {
        api.runtime.tools.registerMemoryCli(program);
      },
      { commands: ["memory"] },
    );
  },
};

export default memoryCorePlugin;
