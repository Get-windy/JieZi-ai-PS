/**
 * Agents Schema - 本地覆盖层
 *
 * 使用本地扩展的 AgentEntrySchema（包含权限系统）
 */

import { z } from "zod";
import { AgentDefaultsSchema } from "../../upstream/src/config/zod-schema.agent-defaults.js";
// 导入上游的 AgentEntrySchema 并扩展
import { AgentEntrySchema as UpstreamAgentEntry } from "../../upstream/src/config/zod-schema.agent-runtime.js";
import { TranscribeAudioSchema } from "../../upstream/src/config/zod-schema.core.js";
import { AgentPermissionsConfigSchema } from "./zod-schema.permissions.js";

// AgentModelAccountsConfig 对应的 Zod Schema
const AgentModelAccountsSchema = z
  .object({
    accounts: z.array(z.string()),
    accountConfigs: z
      .array(
        z
          .object({
            accountId: z.string(),
            enabled: z.boolean().optional(),
          })
          .strict(),
      )
      .optional(),
    routingMode: z.enum(["manual", "smart"]),
    smartRouting: z
      .object({
        enableCostOptimization: z.boolean().optional(),
        complexityWeight: z.number().optional(),
        capabilityWeight: z.number().optional(),
        costWeight: z.number().optional(),
        speedWeight: z.number().optional(),
        complexityThresholds: z
          .object({
            simple: z.number(),
            medium: z.number(),
            complex: z.number(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    defaultAccountId: z.string().optional(),
    enableSessionPinning: z.boolean().optional(),
  })
  .strict();

// AgentChannelPolicies 使用宽松 schema（内部策略类型很多，不做逐字段校验）
const AgentChannelPoliciesSchema = z
  .object({
    agentId: z.string(),
    policies: z.record(z.string(), z.unknown()),
    defaultPolicy: z.unknown().optional(),
  })
  .passthrough();

// 扩展 AgentEntrySchema，添加所有本地扩展字段
// 注意：上游 AgentEntrySchema 含有 .superRefine()，Zod v4 要求用 .safeExtend() 而非 .extend()
const AgentEntrySchema = UpstreamAgentEntry.safeExtend({
  permissions: AgentPermissionsConfigSchema.optional(),
  /** 智能助手模型账号智能路由配置 */
  modelAccounts: AgentModelAccountsSchema.optional(),
  /** 快捷绑定的单个模型账号 ID（格式：provider/accountId） */
  modelAccountId: z.string().optional(),
  /** 绑定的通道账号 ID 列表（格式：channel/accountId） */
  channelAccountIds: z.array(z.string()).optional(),
  /** 通道账号策略配置 */
  channelPolicies: AgentChannelPoliciesSchema.optional(),
  /** 每个 agent 的额外流参数（如 temperature、cacheRetention 等） */
  params: z.record(z.string(), z.unknown()).optional(),
});

export const AgentsSchema = z
  .object({
    defaults: z.lazy(() => AgentDefaultsSchema).optional(),
    list: z.array(AgentEntrySchema).optional(),
  })
  .strict()
  .optional();

export const BindingsSchema = z
  .array(
    z
      .object({
        agentId: z.string(),
        comment: z.string().optional(),
        match: z
          .object({
            channel: z.string(),
            accountId: z.string().optional(),
            peer: z
              .object({
                kind: z.union([
                  z.literal("direct"),
                  z.literal("group"),
                  z.literal("channel"),
                  z.literal("dm"),
                ]),
                id: z.string(),
              })
              .strict()
              .optional(),
            guildId: z.string().optional(),
            teamId: z.string().optional(),
            roles: z.array(z.string()).optional(),
          })
          .strict(),
      })
      .strict(),
  )
  .optional();

export const BroadcastStrategySchema = z.enum(["parallel", "sequential"]);

export const BroadcastSchema = z
  .object({
    strategy: BroadcastStrategySchema.optional(),
  })
  .catchall(z.array(z.string()))
  .optional();

export const AudioSchema = z
  .object({
    transcription: TranscribeAudioSchema,
  })
  .strict()
  .optional();
