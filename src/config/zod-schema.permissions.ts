/**
 * Phase 3: 权限系统 - Zod Schema 定义
 *
 * 为单个智能助手的工具权限配置提供验证schema
 * 注意：角色在全局"组织与权限"模块定义，这里只引用角色ID
 */

import { z } from "zod";

// 权限动作
const PermissionActionSchema = z.enum(["allow", "deny", "require_approval"]);

// 权限主体（对应 types.permissions.ts 的 PermissionSubject）
const PermissionSubjectSchema = z
  .object({
    type: z.enum(["user", "group", "role"]),
    id: z.string(),
    name: z.string().optional(),
  })
  .strict();

// 工具权限规则（引用全局角色ID，而不是自己定义角色）
const ToolPermissionRuleSchema = z
  .object({
    id: z.string(),
    toolName: z.string(),
    roleIds: z.array(z.string()), // 引用全局角色ID列表
    action: PermissionActionSchema,
    conditions: z
      .object({
        timeRange: z
          .object({
            start: z.string(),
            end: z.string(),
          })
          .strict()
          .optional(),
        parameterConstraints: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
    enabled: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

// 审批配置（对应 types.permissions.ts 的 ApprovalConfig）
const ApprovalConfigSchema = z
  .object({
    // 审批者列表（审批工作流运行时实际使用，见 approval.ts L177）
    approvers: z.array(PermissionSubjectSchema).optional(),
    enabled: z.boolean().optional(),
    requiredApprovals: z.number().int().positive().optional(),
    timeout: z.number().int().positive().optional(),
    timeoutAction: z.enum(["approve", "reject"]).optional(),
    requireReason: z.boolean().optional(),
    notificationMethods: z.array(z.enum(["email", "slack", "telegram", "webhook"])).optional(),
    webhookUrl: z.string().optional(),
  })
  .strict();

// 智能助手工具权限配置（单助手级别）
export const AgentPermissionsConfigSchema = z
  .object({
    defaultAction: PermissionActionSchema.optional(),
    rules: z.array(ToolPermissionRuleSchema),
    approvalConfig: ApprovalConfigSchema.optional(),
    enableAuditLog: z.boolean().optional(),
    auditLogPath: z.string().optional(),
  })
  .strict();
