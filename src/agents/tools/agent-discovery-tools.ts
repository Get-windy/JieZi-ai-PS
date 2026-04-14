/**
 * 智能体发现与管理工具
 *
 * 提供发现、查询、管理其他智能体的工具
 * 仅限有权限的智能体使用
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";

/**
 * agent_discover 工具参数 schema
 */
const AgentDiscoverToolSchema = Type.Object({
  /** 搜索查询（可选，支持名称、ID、标签） */
  query: Type.Optional(Type.String({ maxLength: 256 })),
  /** 过滤状态（可选） */
  status: Type.Optional(
    Type.Union([
      Type.Literal("online"),
      Type.Literal("offline"),
      Type.Literal("busy"),
      Type.Literal("idle"),
      Type.Literal("all"),
    ]),
  ),
  /** 过滤角色/职能（可选） */
  role: Type.Optional(Type.String({ maxLength: 64 })),
  /** 过滤标签（可选） */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 是否包含私有智能体（可选，需要特殊权限） */
  includePrivate: Type.Optional(Type.Boolean()),
  /** 最大返回数量（可选，默认50） */
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
});

/**
 * agent_inspect 工具参数 schema
 */
const AgentInspectToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 是否包含详细配置（可选，需要管理员权限） */
  includeConfig: Type.Optional(Type.Boolean()),
  /** 是否包含运行时统计（可选） */
  includeStats: Type.Optional(Type.Boolean()),
  /** 是否包含会话列表（可选） */
  includeSessions: Type.Optional(Type.Boolean()),
});

/**
 * agent_status 工具参数 schema
 */
const AgentStatusToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 新状态（可选，用于设置状态） */
  newStatus: Type.Optional(
    Type.Union([
      Type.Literal("online"),
      Type.Literal("offline"),
      Type.Literal("busy"),
      Type.Literal("idle"),
    ]),
  ),
  /** 状态消息（可选） */
  statusMessage: Type.Optional(Type.String({ maxLength: 256 })),
});

/**
 * agent_capabilities 工具参数 schema
 */
const AgentCapabilitiesToolSchema = Type.Object({
  /** 目标智能体ID（必填） */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
});

/**
 * agent_assign_task 工具参数 schema
 */
const AgentAssignTaskToolSchema = Type.Object({
  /** 目标智能体ID（必填）。
   * 注意：如果指定了 projectId，targetAgentId 必须是该项目的成员（即加入了项目群组的成员），
   * 不得将项目任务派发给项目外部的 agent。 */
  targetAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 任务标题（可选，不填则取 task 的前100字符） */
  title: Type.Optional(Type.String({ maxLength: 200 })),
  /** 任务描述（必填） */
  task: Type.String({ minLength: 1, maxLength: 2000 }),
  /** 任务优先级（可选） */
  priority: Type.Optional(
    Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("urgent"),
    ]),
  ),
  /** 截止时间（可选，ISO 8601格式） */
  deadline: Type.Optional(Type.String()),
  /** 任务上下文数据（可选） */
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  /** 所属项目 ID（可选）。设置后任务属于该项目，
   * 并且系统会校验 targetAgentId 必须是项目成员。如果该 agent 不在项目群组中，
   * 将被拒绝，请先将其加入项目群组再分配任务。 */
  projectId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 所属团队 ID（可选） */
  teamId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 所属组织 ID（可选） */
  organizationId: Type.Optional(Type.String({ maxLength: 128 })),
  // ── 结构化任务背景包（MetaGPT 角色交接模式）─────────────────────────────
  /** 关联的战略目标 ID（OKR Objective）。
   * 填写后系统会自动查询该目标详情并附加到任务背景包中，让被分配者清楚任务服务于哪个目标。 */
  objectiveId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 关联的里程碑 ID。填写后系统自动将里程碑信息注入任务背景包。 */
  milestoneId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 关联的 Sprint ID。填写后被分配者可立即了解当前迭代上下文。 */
  sprintId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 验收标准列表（可选，明确定义任务完成的标准）。
   * 每条标准应具体可验证，如 "单元测试覆盖率 >= 80%"、"接口返回 200 状态码" 等。 */
  acceptanceCriteria: Type.Optional(Type.Array(Type.String())),
  /** 输出物格式说明（可选，描述期望的交付物形式，如 "PR链接 + 测试报告"）*/
  deliverableFormat: Type.Optional(Type.String({ maxLength: 500 })),
});

/**
 * agent_communicate 工具参数 schema
 */
const AgentCommunicateToolSchema = Type.Object({
  /** 目标智能体ID（必填，与 groupSessionKey 二选一） */
  targetAgentId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  /** 项目群 sessionKey（可选，直接发群消息，格式 group:{groupId}） */
  groupSessionKey: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  /** 消息内容（必填） */
  message: Type.String({ minLength: 1, maxLength: 4000 }),
  /** 消息类型（可选） */
  messageType: Type.Optional(
    Type.Union([
      Type.Literal("request"),
      Type.Literal("notification"),
      Type.Literal("query"),
      Type.Literal("command"),
    ]),
  ),
  /** 是否等待回复（可选，默认false） */
  waitForReply: Type.Optional(Type.Boolean()),
  /** 超时时间（毫秒，可选） */
  timeout: Type.Optional(Type.Number({ minimum: 1000, maximum: 300000 })),
});

/**
 * 创建智能体发现工具
 */
export function createAgentDiscoverTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Discover",
    name: "agent_discover",
    description:
      "Discover and search for other agents in the system. Filter by status, role, tags. Returns agent ID, name, status, capabilities and availability. Requires discovery permission. IMPORTANT: Channel bindings are for inbound message routing only (user sends message via Feishu/WeChat -> route to which agent). Subagents work via internal agent() tool calls and do NOT need channel bindings. An agent without channel bindings can still work as a subagent.",
    parameters: AgentDiscoverToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query");
      const status = readStringParam(params, "status") || "all";
      const role = readStringParam(params, "role");
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : undefined;
      const includePrivate =
        typeof params.includePrivate === "boolean" ? params.includePrivate : false;
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.discover RPC
        const response = await callGatewayTool("agent.discover", gatewayOpts, {
          requesterId: opts?.currentAgentId,
          query,
          status,
          role,
          tags,
          includePrivate,
          limit,
        });

        const agents = Array.isArray(response) ? response : [];

        return jsonResult({
          success: true,
          count: agents.length,
          agents: agents.map((agent: Record<string, unknown>) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            role: agent.role,
            capabilities: agent.capabilities || [],
            tags: agent.tags || [],
            online: agent.online || false,
            lastSeen: agent.lastSeen,
            availability: agent.availability,
          })),
          query: { query, status, role, tags },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to discover agents: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体详细检查工具
 */
export function createAgentInspectTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Inspect",
    name: "agent_inspect",
    description:
      "Inspect detailed information about a specific agent. Returns configuration, statistics, active sessions, skills, and runtime status. Requires inspect permission. IMPORTANT: Channel bindings are for inbound message routing only (user sends message via Feishu/WeChat -> route to which agent). Subagents work via internal agent() tool calls and do NOT need channel bindings. An agent without channel bindings can still work as a subagent.",
    parameters: AgentInspectToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const includeConfig =
        typeof params.includeConfig === "boolean" ? params.includeConfig : false;
      const includeStats = typeof params.includeStats === "boolean" ? params.includeStats : true;
      const includeSessions =
        typeof params.includeSessions === "boolean" ? params.includeSessions : false;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.inspect RPC
        const response = await callGatewayTool("agent.inspect", gatewayOpts, {
          requesterId: opts?.currentAgentId,
          targetAgentId,
          includeConfig,
          includeStats,
          includeSessions,
        });

        return jsonResult({
          success: true,
          agent: {
            id: response.id,
            name: response.name,
            status: response.status,
            role: response.role,
            description: response.description,
            capabilities: response.capabilities || [],
            skills: response.skills || [],
            tags: response.tags || [],
            created: response.createdAt,
            lastActive: response.lastActiveAt,
            ...(includeStats && response.stats ? { stats: response.stats } : {}),
            ...(includeConfig && response.config ? { config: response.config } : {}),
            ...(includeSessions && response.sessions ? { sessions: response.sessions } : {}),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to inspect agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体状态管理工具
 */
export function createAgentStatusTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Status",
    name: "agent_status",
    description:
      "Get or set agent status. Can query current status or update status to online/offline/busy/idle with optional status message. Requires status management permission.",
    parameters: AgentStatusToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const newStatus = readStringParam(params, "newStatus");
      const statusMessage = readStringParam(params, "statusMessage");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.status RPC
        const response = await callGatewayTool("agent.status", gatewayOpts, {
          requesterId: opts?.currentAgentId,
          targetAgentId,
          newStatus,
          statusMessage,
          updatedAt: newStatus ? Date.now() : undefined,
        });

        return jsonResult({
          success: true,
          message: newStatus ? `Status updated to "${newStatus}"` : "Status retrieved",
          agent: {
            id: targetAgentId,
            status: response.status,
            statusMessage: response.statusMessage,
            online: response.online,
            lastStatusChange: response.lastStatusChange,
            uptime: response.uptime,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to manage agent status: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体能力查询工具
 */
export function createAgentCapabilitiesTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Capabilities",
    name: "agent_capabilities",
    description:
      "Query agent capabilities including available skills, tools, supported languages, and special abilities. Useful for task delegation and collaboration.",
    parameters: AgentCapabilitiesToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 agent.capabilities RPC
        const response = await callGatewayTool("agent.capabilities", gatewayOpts, {
          requesterId: opts?.currentAgentId,
          targetAgentId,
        });

        return jsonResult({
          success: true,
          agent: {
            id: targetAgentId,
            name: response.name,
            capabilities: {
              skills: response.skills || [],
              tools: response.tools || [],
              languages: response.languages || [],
              specialAbilities: response.specialAbilities || [],
              limitations: response.limitations || [],
              maxConcurrentTasks: response.maxConcurrentTasks,
              supportedChannels: response.supportedChannels || [],
            },
          },
          // NOTE: skills:[] 表示该 agent 不限制技能（接受所有类型任务），而非“没有任何能力”。
          // 请勿因此拒绝分配任务。只有 limitations 字段不为空时才表示真正的能力限制。
          skillsNote: (response.skills || []).length === 0
            ? "skills:[] means no skill restriction — this agent accepts ALL task types. Do NOT refuse task assignment based on empty skills."
            : undefined,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to query agent capabilities: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体任务分配工具
 */
export function createAgentAssignTaskTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Assign Task",
    name: "agent_assign_task",
    description:
      "Assign a task to another agent. The task will be queued and executed by the target agent. Returns task ID for tracking. Requires task assignment permission." +
      " IMPORTANT: If projectId is provided, targetAgentId MUST be a member of that project's group. " +
      "You cannot assign a project task to an agent who is not in the project. " +
      "If rejected, first add the agent to the project group, then assign the task." +
      " SKILL NOTE: skills:[] in agent capabilities means NO skill restriction (accepts ALL task types). Do NOT block assignment due to empty skills list." +
      "\n\n\u3010\u7ed3\u6784\u5316\u4efb\u52a1\u80cc\u666f\u5305\u3011\u5f3a\u70c8\u5efa\u8bae\u586b\u5199\u4ee5\u4e0b\u5b57\u6bb5\uff0c\u8ba9\u88ab\u5206\u914d\u8005\u65e0\u9700\u989d\u5916\u67e5\u8be2\u5c31\u80fd\u7acb\u5373\u5f00\u5de5\uff1a" +
      "\n  - objectiveId: \u5173\u8054\u7684\u6218\u7565\u76ee\u6807 ID\uff0c\u7cfb\u7edf\u81ea\u52a8\u67e5\u8be2\u76ee\u6807\u8be6\u60c5\u5e76\u9644\u52a0\u5230\u80cc\u666f\u5305" +
      "\n  - sprintId: \u5f53\u524d Sprint ID\uff0c\u88ab\u5206\u914d\u8005\u7acb\u5373\u4e86\u89e3\u8fed\u4ee3\u4e0a\u4e0b\u6587" +
      "\n  - milestoneId: \u5173\u8054\u91cc\u7a0b\u7891 ID" +
      "\n  - acceptanceCriteria: \u9a8c\u6536\u6807\u51c6\u5217\u8868\uff08\u5177\u4f53\u53ef\u9a8c\u8bc1\uff0c\u5982 [\"\u5355\u5143\u6d4b\u8bd5\u8986\u76d6\u7387>=80%\", \"\u63a5\u53e3\u8fd4\u56de200\"]\uff09" +
      "\n  - deliverableFormat: \u671f\u671b\u7684\u4ea4\u4ed8\u7269\u5f62\u5f0f\uff08\u5982 \"PR\u94fe\u63a5+\u6d4b\u8bd5\u62a5\u544a\")\uff09",
    parameters: AgentAssignTaskToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId", { required: true });
      const title = readStringParam(params, "title");
      const task = readStringParam(params, "task", { required: true });
      const priority = readStringParam(params, "priority") || "medium";
      const deadline = readStringParam(params, "deadline");
      const context = typeof params.context === "object" ? params.context : undefined;
      const projectId = readStringParam(params, "projectId");
      const teamId = readStringParam(params, "teamId");
      const organizationId = readStringParam(params, "organizationId");
      // 结构化任务背景包字段
      const objectiveId = readStringParam(params, "objectiveId");
      const milestoneId = readStringParam(params, "milestoneId");
      const sprintId = readStringParam(params, "sprintId");
      const acceptanceCriteria = Array.isArray(params.acceptanceCriteria)
        ? (params.acceptanceCriteria as unknown[]).map(String)
        : undefined;
      const deliverableFormat = readStringParam(params, "deliverableFormat");
      const gatewayOpts = readGatewayCallOptions(params);

      // ── 自动构建任务背景包（Task Context Packet）──────────────────────────
      // 参考 MetaGPT 角色交接模式：结构化传递目标/Sprint/里程碑上下文，
      // 让被分配者无需额外查询就能理解任务的战略位置。
      let taskContextPacket: Record<string, unknown> | undefined;
      if (projectId && (objectiveId || sprintId || milestoneId)) {
        try {
          const { buildActiveObjectivesSummary } = await import(
            "../../utils/project-context.js"
          );
          const objSummary = buildActiveObjectivesSummary(projectId);
          const contextParts: string[] = [];

          // 注入目标信息
          if (objectiveId && objSummary) {
            const allObjs = [
              ...objSummary.shortTermObjectives,
              ...objSummary.mediumTermObjectives,
              ...objSummary.longTermObjectives,
            ];
            const obj = allObjs.find((o) => o.id === objectiveId);
            if (obj) {
              contextParts.push(
                `【战略目标】${obj.title}${
                  obj.description ? `：${obj.description}` : ""
                }（状态：${obj.status}）`,
              );
            }
          }

          // 注入 Sprint 信息
          if (sprintId && objSummary?.activeSprint?.id === sprintId) {
            const s = objSummary.activeSprint;
            const endStr = s.endDate
              ? ` | 截止 ${new Date(s.endDate).toLocaleDateString("zh-CN")}`
              : "";
            contextParts.push(
              `【当前 Sprint】${s.title}${endStr}${s.goal ? ` — 目标：${s.goal}` : ""}（进度：${s.progress}%，${s.doneCount}/${s.taskCount} 任务完成）`,
            );
          }

          // 注入里程碑信息
          if (milestoneId && objSummary?.nextMilestone?.id === milestoneId) {
            const m = objSummary.nextMilestone;
            const dateStr = m.targetDate
              ? ` — 预计 ${new Date(m.targetDate).toLocaleDateString("zh-CN")}`
              : "";
            contextParts.push(`【关联里程碑】${m.title}${dateStr}`);
          }

          // 注入当前阶段允许的工作类型
          if (objSummary) {
            contextParts.push(
              `【项目阶段】${objSummary.currentPhaseLabel}｜本阶段工作方向：${
                objSummary.allowedWorkTypes.length > 0
                  ? objSummary.allowedWorkTypes.join("、")
                  : "（暂停状态，请确认分配合理性）"
              }`,
            );
          }

          if (contextParts.length > 0) {
            taskContextPacket = {
              objectiveId: objectiveId || undefined,
              sprintId: sprintId || undefined,
              milestoneId: milestoneId || undefined,
              acceptanceCriteria: acceptanceCriteria || undefined,
              deliverableFormat: deliverableFormat || undefined,
              contextSummary: contextParts.join("\n"),
            };
          }
        } catch {
          // 背景包构建失败不阻止任务分配
        }
      } else if (acceptanceCriteria || deliverableFormat) {
        // 即使没有项目ID，也保存验收标准和输出物格式
        taskContextPacket = {
          objectiveId: objectiveId || undefined,
          sprintId: sprintId || undefined,
          milestoneId: milestoneId || undefined,
          acceptanceCriteria: acceptanceCriteria || undefined,
          deliverableFormat: deliverableFormat || undefined,
        };
      }

      try {
        // 生成任务ID
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 调用 agent.assign_task RPC
        const response = await callGatewayTool("agent.assign_task", gatewayOpts, {
          taskId,
          requesterId: opts?.currentAgentId,
          targetAgentId,
          title,
          task,
          priority,
          deadline,
          context: taskContextPacket
            ? { ...(context ?? {}), taskContextPacket }
            : context,
          projectId,
          teamId: teamId || undefined,
          organizationId: organizationId || undefined,
          assignedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Task assigned to agent "${targetAgentId}"`,
          task: {
            id: taskId,
            targetAgent: targetAgentId,
            description: task,
            priority,
            deadline,
            projectId,
            teamId: teamId || undefined,
            organizationId: organizationId || undefined,
            status: "in-progress",
            trackedInTaskSystem: response?.trackedInTaskSystem ?? false,
            assignedBy: opts?.currentAgentId,
            assignedAt: Date.now(),
          },
          // 结构化任务背景包：被分配者可立即了解任务的战略位置
          ...(taskContextPacket ? { taskContextPacket } : {}),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to assign task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建智能体通信工具
 */
export function createAgentCommunicateTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Communicate",
    name: "agent_communicate",
    description:
      "Send a message to another agent or a project group channel. Use targetAgentId to message an agent directly, or groupSessionKey (format: group:{groupId}) to post to a project group channel. Supports request, notification, query, and command types.",
    parameters: AgentCommunicateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const targetAgentId = readStringParam(params, "targetAgentId");
      const groupSessionKey = readStringParam(params, "groupSessionKey");
      const message = readStringParam(params, "message", { required: true });
      const messageType = readStringParam(params, "messageType") || "notification";
      const waitForReply = typeof params.waitForReply === "boolean" ? params.waitForReply : false;
      const timeout = typeof params.timeout === "number" ? params.timeout : 30000;
      const gatewayOpts = readGatewayCallOptions(params);

      // 必须提供 targetAgentId 或 groupSessionKey 之一
      if (!targetAgentId && !groupSessionKey) {
        return jsonResult({
          success: false,
          error: "Either targetAgentId or groupSessionKey must be provided",
        });
      }

      try {
        // 生成消息ID
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        let response: unknown;
        if (groupSessionKey) {
          // 向项目群发送消息
          response = await callGatewayTool("agent.communicate.group", gatewayOpts, {
            messageId,
            senderId: opts?.currentAgentId,
            groupSessionKey,
            message,
            messageType,
            sentAt: Date.now(),
          });
        } else {
          // 向特定 agent 发送消息
          response = await callGatewayTool("agent.communicate", gatewayOpts, {
            messageId,
            senderId: opts?.currentAgentId,
            targetAgentId,
            message,
            messageType,
            waitForReply,
            timeout,
            sentAt: Date.now(),
          });
        }

        const resp = response as Record<string, unknown>;
        return jsonResult({
          success: true,
          message: waitForReply ? "Message sent and reply received" : "Message sent successfully",
          communication: {
            id: messageId,
            from: opts?.currentAgentId,
            to: groupSessionKey ?? targetAgentId,
            type: messageType,
            content: message,
            sentAt: Date.now(),
            ...(waitForReply && resp.reply ? { reply: resp.reply } : {}),
            ...(resp.delivered !== undefined ? { delivered: resp.delivered } : {}),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to communicate with agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * task_report_to_supervisor 工具参数 schema
 */
const TaskReportToSupervisorToolSchema = Type.Object({
  /** 任务ID（必填，由 agent.assign_task 返回） */
  taskId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 最终状态 */
  status: Type.Union([Type.Literal("done"), Type.Literal("blocked"), Type.Literal("cancelled")]),
  /** 工作成果文字描述（可选） */
  result: Type.Optional(Type.String({ maxLength: 4000 })),
  /** 错误信息（如果失败） */
  errorMessage: Type.Optional(Type.String({ maxLength: 1000 })),
  /** 主管ID（可选，有则直接向其发送汇报） */
  supervisorId: Type.Optional(Type.String({ maxLength: 64 })),
});

/**
 * agent_team_status 工具参数 schema
 */
const AgentTeamStatusToolSchema = Type.Object({
  /** 主管ID（可选，过滤其下达任务） */
  supervisorId: Type.Optional(Type.String({ maxLength: 64 })),
  /** 指定多个Agent ID（可选） */
  agentIds: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  /** 按项目过滤（可选） */
  projectId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 是否包含已完成任务（默认false） */
  includeCompleted: Type.Optional(Type.Boolean()),
});

/**
 * 创建任务汇报工具（成员Agent完成任务后调用）
 */
export function createTaskReportToSupervisorTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Report to Supervisor",
    name: "task_report_to_supervisor",
    description:
      "[MANDATORY] Report task status back to the supervisor agent. " +
      "THIS TOOL MUST BE CALLED when you finish ANY assigned task. Failing to call it is a critical error — the system cannot detect completion and your supervisor will never know you are done. " +
      "MUST be called in ALL of the following situations: " +
      '(1) Task completed successfully — use status="done" with a result summary. ' +
      "    BEFORE reporting done, you MUST complete all four steps in order: " +
      "    Step A — Run quality checks (typecheck / lint / test); do NOT report done if checks fail. " +
      "    Step B — Commit ALL changes with message format: 'feat: [Task ID] - [Task Title]'. " +
      "    Step C — Append a session progress note via task_progress_note_append (## Accomplished / ## Findings / ## Decisions / ## Next Steps). " +
      "    Step D — If this task involved 5+ tool calls and produced a reusable workflow, call skill_manage with action=create (or action=promote from the progress note) to save a SKILL.md document. Skip if the task was purely one-off with no generalizable value. " +
      '(2) Task is blocked and cannot proceed — use status="blocked" and describe the blocker in errorMessage so the supervisor can coordinate a solution. ' +
      '(3) Task must be abandoned — use status="cancelled" with a reason. ' +
      "DO NOT silently stop working on a task. NEVER finish your work without calling this tool. " +
      "If you skip this call, your supervisor will not receive your results, will not be able to assign the next task, and the pipeline will stall. Always report back.",
    parameters: TaskReportToSupervisorToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const status = readStringParam(params, "status") || "done";
      const result = readStringParam(params, "result");
      const errorMessage = readStringParam(params, "errorMessage");
      const supervisorId = readStringParam(params, "supervisorId");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("agent.task.report", gatewayOpts, {
          taskId,
          reporterId: opts?.currentAgentId,
          status,
          result,
          errorMessage,
          supervisorId,
        });

        return jsonResult({
          success: true,
          message: `Task ${taskId} reported as ${status}`,
          report: {
            taskId,
            finalStatus: response?.finalStatus ?? status,
            notifiedSupervisor: response?.notifiedSupervisor ?? false,
            supervisorId: response?.supervisorId ?? supervisorId ?? null,
            reportedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to report task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建团队状态查询工具（主管Agent调用）
 */
export function createAgentTeamStatusTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Agent Team Status",
    name: "agent_team_status",
    description:
      "Query the current task status of your team members. Returns who is doing what, task progress, blocked tasks, and team-wide summary. Use this to supervise and monitor your team's work. IMPORTANT: Channel bindings are for inbound message routing only (user sends message via Feishu/WeChat -> route to which agent). Subagents work via internal agent() tool calls and do NOT need channel bindings. An agent without channel bindings can still work as a subagent.",
    parameters: AgentTeamStatusToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const supervisorId = readStringParam(params, "supervisorId") ?? opts?.currentAgentId;
      const agentIds = Array.isArray(params.agentIds) ? params.agentIds.map(String) : undefined;
      const projectId = readStringParam(params, "projectId");
      const includeCompleted =
        typeof params.includeCompleted === "boolean" ? params.includeCompleted : false;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("agent.team.status", gatewayOpts, {
          supervisorId,
          agentIds,
          projectId,
          includeCompleted,
        });

        return jsonResult({
          success: true,
          summary: response.summary ?? null,
          teamStatus: response.teamStatus ?? [],
          supervisorId: response.supervisorId ?? supervisorId ?? null,
          projectId: response.projectId ?? projectId ?? null,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to get team status: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
