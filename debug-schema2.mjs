// 直接测试 Zod v4 的 toJSONSchema 输出结构
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// 使用 feishu 的 zod (v4)
const require = createRequire(fileURLToPath(import.meta.url));
const feishuDir = path.resolve("upstream/extensions/feishu");

// 动态加载 feishu 的 zod v4
const feishuZod = require(path.join(feishuDir, "node_modules/zod"));
const { z } = feishuZod;

// 简化版 FeishuAccountConfigSchema
const FeishuAccountConfigSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
}).strict();

const FeishuConfigSchema = z.object({
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  defaultAccount: z.string().optional(),
  accounts: z.record(z.string(), FeishuAccountConfigSchema.optional()).optional(),
}).strict().superRefine(() => {});

const schema = FeishuConfigSchema.toJSONSchema({ target: "draft-07", unrepresentable: "any" });
console.log(JSON.stringify(schema, null, 2).slice(0, 2000));
