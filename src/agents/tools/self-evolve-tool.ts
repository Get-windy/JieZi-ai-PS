/**
 * 自我进化工具层（Self-Evolution Tools）
 *
 * 借鉴三大顶级项目：
 *
 * 1. Reflexion（NeurIPS 2023）— 失败反思闭环
 *    agent_reflect：每次运行结束后生成自然语言反思，存储失败原因和改进建议。
 *    下次遇到类似任务时，历史反思自动注入 context，防止重蹈覆辙。
 *    策略：NONE → LAST_ATTEMPT → REFLEXION → LAST_ATTEMPT_AND_REFLEXION
 *
 * 2. Voyager（NVIDIA）— 技能库自增长
 *    agent_skill_save：成功完成任务后，将解决方案压缩为可复用"技能"保存到技能库。
 *    后续遇到类似场景时从技能库检索，越用越强。
 *    技能分类：workflow（流程）/ code（代码片段）/ strategy（策略）/ template（模板）
 *
 * 存储路径：{stateDir}/self-evolve/{agentId}/reflections.json
 *           {stateDir}/self-evolve/{agentId}/skills.json
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";

// ============================================================================
// Schemas
// ============================================================================

const ReflectionOutcome = Type.Union([
  Type.Literal("success"), // 任务成功完成
  Type.Literal("partial"), // 部分成功
  Type.Literal("failure"), // 任务失败
]);

const SkillCategory = Type.Union([
  Type.Literal("workflow"), // 多步骤工作流程
  Type.Literal("code"), // 代码片段/解决方案
  Type.Literal("strategy"), // 决策/处理策略
  Type.Literal("template"), // 可复用模板
]);

// P2 AgentEvolver 细粒度步骤归因
const StepOutcomeSchema = Type.Object({
  /** 步骤简述（工具调用名/动作描述） */
  step: Type.String({ minLength: 1, maxLength: 100 }),
  /** 步骤结果 */
  result: Type.Union([Type.Literal("success"), Type.Literal("failure"), Type.Literal("skipped")]),
  /** 备注（可选） */
  note: Type.Optional(Type.String({ maxLength: 200 })),
});

const AgentReflectSchema = Type.Object({
  /** 本次任务/对话的简要描述 */
  taskSummary: Type.String({ minLength: 1, maxLength: 500 }),
  /** 任务结果 */
  outcome: ReflectionOutcome,
  /** 反思内容：做了什么、哪里对/错、为什么、下次如何改进 */
  reflection: Type.String({ minLength: 1, maxLength: 2000 }),
  /** 关键教训（可选，1-3条简洁的要点） */
  lessons: Type.Optional(Type.Array(Type.String({ maxLength: 200 }), { maxItems: 5 })),
  /** 相关标签（可选） */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }), { maxItems: 10 })),
  /** P2 AgentEvolver：细粒度步骤归因（可选）— 列出每个关键步骤的执行结果 */
  steps: Type.Optional(Type.Array(StepOutcomeSchema, { maxItems: 20 })),
});

const AgentSkillSaveSchema = Type.Object({
  /** 技能名称（简洁描述性，如“Python数据清洗流程”） */
  name: Type.String({ minLength: 1, maxLength: 100 }),
  /** 技能描述：适用场景、前提条件、预期效果 */
  description: Type.String({ minLength: 1, maxLength: 500 }),
  /** 技能内容：具体步骤、代码、策略 */
  content: Type.String({ minLength: 1, maxLength: 5000 }),
  /** 分类 */
  category: Type.Optional(SkillCategory),
  /** 适用场景关键词（用于检索匹配） */
  triggers: Type.Optional(Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })),
  /** 技能标签 */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }), { maxItems: 10 })),
  /** P3 GEP: 是否将技能共享到全局库（为 true 时存入后自动 share） */
  shareToGlobal: Type.Optional(Type.Boolean()),
});

/** P3 GEP 工具 Schema */
const AgentSkillShareSchema = Type.Object({
  skillId: Type.String({
    minLength: 1,
    description: "要共享的技能 ID（由 agent_skill_save 返回）",
  }),
});

const AgentSkillImportSchema = Type.Object({
  skillId: Type.String({
    minLength: 1,
    description: "全局库中的技能 ID（由 agent_skill_list_shared 列出）",
  }),
});

const AgentSkillListSharedSchema = Type.Object({
  category: Type.Optional(SkillCategory),
  query: Type.Optional(Type.String({ maxLength: 200 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
});

const AgentSkillListSchema = Type.Object({
  /** 按分类过滤 */
  category: Type.Optional(SkillCategory),
  /** 按触发词搜索（简单关键词匹配） */
  query: Type.Optional(Type.String({ maxLength: 200 })),
  /** 最大返回数量 */
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
});

// ============================================================================
// Tools
// ============================================================================

/**
 * agent_reflect — Reflexion 反思工具（P2 AgentEvolver: 支持 steps 步骤归因）
 *
 * 每次任务结束后调用，生成自然语言反思，存储失败原因和改进建议。
 * 同时自动将结果记录到性能画像（P1 HyperAgent）。
 */
export function createAgentReflectTool(opts?: { agentId?: string }): AnyAgentTool {
  return {
    label: "Agent Reflect",
    name: "agent_reflect",
    description:
      "Record a reflection on the current task outcome — what worked, what failed, and what to improve next time. " +
      "Call this AFTER completing (or failing) a significant task to capture lessons learned. " +
      "These reflections will be automatically injected into future sessions for similar tasks. " +
      "outcome: 'success' | 'partial' | 'failure'. " +
      "steps (optional): list each key action taken with its result — enables fine-grained attribution (AgentEvolver P2). " +
      "Be honest and specific — vague reflections provide no learning value.",
    parameters: AgentReflectSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskSummary = readStringParam(params, "taskSummary", { required: true });
      const outcome = (readStringParam(params, "outcome") || "partial") as
        | "success"
        | "partial"
        | "failure";
      const reflection = readStringParam(params, "reflection", { required: true });
      const lessons = Array.isArray(params.lessons) ? params.lessons.map(String) : [];
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const steps = Array.isArray(params.steps) ? params.steps : undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("evolve.reflect.save", gatewayOpts, {
          agentId: opts?.agentId,
          taskSummary,
          outcome,
          reflection,
          lessons,
          tags,
          ...(steps ? { steps } : {}),
          createdAt: Date.now(),
        });

        const result = response as { id?: string; action?: string } | null;
        return jsonResult({
          success: true,
          message: `Reflection saved (outcome: ${outcome}).`,
          reflectionId: result?.id,
          outcome,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to save reflection: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * agent_skill_save — Voyager 技能库工具（P3 GEP: 支持 shareToGlobal）
 *
 * 成功完成一个有价値的任务后，将解决方案压缩为“技能”存入技能库。
 * 技能库会随使用不断扩充，后续类似任务可直接复用。
 * shareToGlobal=true 时将技能同时推送到全局局共享库供其他 Agent 导入。
 */
export function createAgentSkillSaveTool(opts?: { agentId?: string }): AnyAgentTool {
  return {
    label: "Agent Skill Save",
    name: "agent_skill_save",
    description:
      "Save a reusable skill or solution to the skill library after successfully completing a task. " +
      "Use this when you've developed a generalizable approach worth preserving for future use. " +
      "Good candidates: multi-step workflows, effective code patterns, decision strategies, reusable templates. " +
      "categories: 'workflow' | 'code' | 'strategy' | 'template'. " +
      "Include clear triggers (keywords) so the skill can be recalled when similar tasks arise. " +
      "Set shareToGlobal=true to share this skill with all agents in the global skill library (GEP P3).",
    parameters: AgentSkillSaveSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const name = readStringParam(params, "name", { required: true });
      const description = readStringParam(params, "description", { required: true });
      const content = readStringParam(params, "content", { required: true });
      const category = (readStringParam(params, "category") || "workflow") as
        | "workflow"
        | "code"
        | "strategy"
        | "template";
      const triggers = Array.isArray(params.triggers) ? params.triggers.map(String) : [];
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const shareToGlobal = params.shareToGlobal === true;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("evolve.skill.save", gatewayOpts, {
          agentId: opts?.agentId,
          name,
          description,
          content,
          category,
          triggers,
          tags,
          createdAt: Date.now(),
        });

        const result = response as { id?: string; action?: string } | null;

        // P3 GEP: shareToGlobal 时自动推送到全局库
        if (shareToGlobal && result?.id) {
          try {
            await callGatewayTool("evolve.skill.share", gatewayOpts, {
              agentId: opts?.agentId,
              skillId: result.id,
            });
          } catch {
            /* 共享失败不影响本地保存 */
          }
        }

        return jsonResult({
          success: true,
          message: `Skill "${name}" saved to skill library${shareToGlobal ? " (shared globally)" : ""}.`,
          skillId: result?.id,
          action: result?.action ?? "added",
          category,
          sharedGlobally: shareToGlobal,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to save skill: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * agent_skill_list — 技能库检索工具
 *
 * 查询技能库中已有的技能，可按分类过滤或关键词搜索。
 * 任务开始前可主动查阅，是否有可复用的历史技能。
 */
export function createAgentSkillListTool(opts?: { agentId?: string }): AnyAgentTool {
  return {
    label: "Agent Skill List",
    name: "agent_skill_list",
    description:
      "Search the skill library for reusable solutions. " +
      "Use this at the start of a complex task to check if a similar problem has been solved before. " +
      "Filter by category or search by keywords. Returns skill names, descriptions, and content.",
    parameters: AgentSkillListSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const category = readStringParam(params, "category");
      const query = readStringParam(params, "query");
      const limit = typeof params.limit === "number" ? params.limit : 10;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("evolve.skill.list", gatewayOpts, {
          agentId: opts?.agentId,
          category: category || undefined,
          query: query || undefined,
          limit,
        });

        const resp = response as { skills?: unknown[]; total?: number } | null;
        const skills =
          resp && typeof resp === "object" && Array.isArray(resp.skills) ? resp.skills : [];

        return jsonResult({
          success: true,
          count: skills.length,
          skills,
          filters: { category, query },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list skills: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * agent_skill_share — P3 GEP 技能共享工具
 * 将本地技能推送到全局共享库，其他 Agent 可按需导入。
 */
export function createAgentSkillShareTool(opts?: { agentId?: string }): AnyAgentTool {
  return {
    label: "Agent Skill Share",
    name: "agent_skill_share",
    description:
      "Share a skill from your local library to the global shared skill library (GEP Protocol). " +
      "Other agents can then discover and import it. Use this after saving a broadly applicable skill.",
    parameters: AgentSkillShareSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const skillId = readStringParam(params, "skillId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const response = await callGatewayTool("evolve.skill.share", gatewayOpts, {
          agentId: opts?.agentId,
          skillId,
        });
        const result = response as { name?: string; action?: string; sharedAt?: number } | null;
        return jsonResult({
          success: true,
          message: `Skill shared globally (action: ${result?.action ?? "shared"}).`,
          skillId,
          name: result?.name,
          action: result?.action,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to share skill: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * agent_skill_import — P3 GEP 技能导入工具
 * 从全局库导入技能到本地技能库。
 */
export function createAgentSkillImportTool(opts?: { agentId?: string }): AnyAgentTool {
  return {
    label: "Agent Skill Import",
    name: "agent_skill_import",
    description:
      "Import a skill from the global shared library into your local skill library. " +
      "Use agent_skill_list_shared first to find available skills, then import by skillId.",
    parameters: AgentSkillImportSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const skillId = readStringParam(params, "skillId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const response = await callGatewayTool("evolve.skill.import", gatewayOpts, {
          agentId: opts?.agentId,
          skillId,
        });
        const result = response as { skillId?: string; name?: string; action?: string } | null;
        return jsonResult({
          success: true,
          message: `Skill "${result?.name}" imported to local library (action: ${result?.action}).`,
          localSkillId: result?.skillId,
          name: result?.name,
          action: result?.action,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to import skill: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * agent_skill_list_shared — P3 GEP 全局局共享库检索工具
 * 列出全局共享技能库中的技能，可按类型或关键词搜索。
 */
export function createAgentSkillListSharedTool(): AnyAgentTool {
  return {
    label: "Agent Skill List Shared",
    name: "agent_skill_list_shared",
    description:
      "Search the global shared skill library contributed by all agents (GEP Protocol). " +
      "Find skills shared by other agents. Use agent_skill_import to bring one into your local library.",
    parameters: AgentSkillListSharedSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const category = readStringParam(params, "category");
      const query = readStringParam(params, "query");
      const limit = typeof params.limit === "number" ? params.limit : 10;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const response = await callGatewayTool("evolve.skill.list.shared", gatewayOpts, {
          category: category || undefined,
          query: query || undefined,
          limit,
        });
        const resp = response as { skills?: unknown[]; total?: number } | null;
        const skills = resp && Array.isArray(resp.skills) ? resp.skills : [];
        return jsonResult({
          success: true,
          count: skills.length,
          skills,
          filters: { category, query },
          tip: "Use agent_skill_import with skillId to import a skill to your local library.",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list shared skills: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
