import { z } from "zod";
// 从 upstream 导入基础 OpenClawSchema，在此基础上扩展本地字段
import { OpenClawSchema as UpstreamOpenClawSchema } from "../../upstream/src/config/zod-schema.js";
// AgentsSchema 使用我们的扩展版本（包含企业级权限系统）
import { AgentsSchema } from "./zod-schema.agents.js";

// 在 upstream OpenClawSchema 基础上扩展：
// 1. 用本地扩展的 AgentsSchema（包含 modelAccounts、permissions 等字段）
// 2. 添加本地新增的 groups 字段
export const OpenClawSchema = UpstreamOpenClawSchema.safeExtend({
  agents: AgentsSchema,
  groups: z
    .object({
      workspace: z
        .object({
          root: z.string().optional(),
          enabled: z.boolean().optional(),
        })
        .passthrough()
        .optional(),
      overrides: z
        .record(
          z.string(),
          z
            .object({
              workspaceDir: z.string().optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough()
    .optional(),
});
