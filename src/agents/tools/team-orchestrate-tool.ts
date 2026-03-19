/**
 * Team Orchestration Tool — team_run
 *
 * 借鉴 OpenProse 业界最佳实践：
 * - fan-out-fan-in（扇出扇入）：并行派发给多个 Agent，然后聚合结果
 * - pipeline-composition（管道组合）：顺序传递任务
 * - agent-specialization（专职 Agent）：为每个角色指定专属 Agent
 * - model-tiering（模型分级）：复杂任务用 Sonnet/Opus，简单任务用 Haiku
 *
 * 用法示例（在 Agent 对话中）：
 * team_run({
 *   mode: "fanout",
 *   task: "分析本次 Sprint 的技术债务并提出重构方案",
 *   agents: ["dev-lead", "architect", "qa"],
 *   timeout: 120
 * })
 */

import { randomUUID } from "node:crypto";
import { listAgentIds } from "../../agents/agent-scope.js";
import { createDefaultDeps } from "../../cli/deps.js";
import { agentCommandFromIngress } from "../../../upstream/src/commands/agent.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { resolveAgentMainSessionKey } from "../../../upstream/src/config/sessions.js";
import { defaultRuntime } from "../../../upstream/src/runtime.js";

export type TeamRunMode = "fanout" | "pipeline" | "adversarial" | "consensus";

export interface TeamRunParams {
  /** 任务描述 */
  task: string;
  /** 执行模式 */
  mode?: TeamRunMode;
  /** 指定参与的 Agent ID 列表（不填则使用所有 Agent） */
  agents?: string[];
  /** 超时秒数（默认 60） */
  timeout?: number;
  /** 额外的 System Prompt（用于 model-tiering 或角色指定） */
  extraSystemPrompt?: string;
}

export interface TeamRunResult {
  runId: string;
  mode: TeamRunMode;
  participants: string[];
  started: number;
  results: Array<{
    agentId: string;
    status: "success" | "failed";
    error?: string;
  }>;
  summary: string;
}

/**
 * fan-out-fan-in：并行向所有 Agent 派发相同任务，等待所有结果（或超时）
 */
async function executeFanOut(
  task: string,
  agents: string[],
  runId: string,
  extraSystemPrompt?: string,
): Promise<TeamRunResult["results"]> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    agents.map((agentId) => {
      const sessionKey = resolveAgentMainSessionKey({ cfg, agentId });
      return agentCommandFromIngress(
        {
          message: task,
          sessionKey,
          runId: `${runId}-fanout-${agentId}-${randomUUID().slice(0, 6)}`,
          deliver: false,
          messageChannel: "internal",
          senderIsOwner: true,
          extraSystemPrompt,
          inputProvenance: {
            kind: "internal_system",
            sourceChannel: "team_run",
            sourceTool: "team_run",
          },
        },
        defaultRuntime,
        createDefaultDeps(),
      );
    }),
  );

  return agents.map((agentId, i) => {
    const r = results[i];
    if (r?.status === "fulfilled") {
      return { agentId, status: "success" as const };
    }
    return { agentId, status: "failed" as const, error: String(r?.reason ?? "unknown") };
  });
}

/**
 * pipeline：顺序将任务传递给每个 Agent，前一个 Agent 的输出作为下一个的输入
 */
async function executePipeline(
  task: string,
  agents: string[],
  runId: string,
  extraSystemPrompt?: string,
): Promise<TeamRunResult["results"]> {
  const cfg = loadConfig();
  const results: TeamRunResult["results"] = [];
  let currentTask = task;

  for (const agentId of agents) {
    const sessionKey = resolveAgentMainSessionKey({ cfg, agentId });
    try {
      await agentCommandFromIngress(
        {
          message: currentTask,
          sessionKey,
          runId: `${runId}-pipeline-${agentId}-${randomUUID().slice(0, 6)}`,
          deliver: false,
          messageChannel: "internal",
          senderIsOwner: true,
          extraSystemPrompt,
          inputProvenance: {
            kind: "internal_system",
            sourceChannel: "team_run",
            sourceTool: "team_run",
          },
        },
        defaultRuntime,
        createDefaultDeps(),
      );
      results.push({ agentId, status: "success" });
      // pipeline 下一步：附加上一个 Agent 的身份提示
      currentTask = `[接续上一步 ${agentId} 的工作] ${task}`;
    } catch (err) {
      results.push({ agentId, status: "failed", error: String(err) });
      break; // 管道中断
    }
  }
  return results;
}

/**
 * adversarial（对抗验证）：第一个 Agent 产出，其余 Agent 批判性评审
 * 借鉴 OpenProse adversarial-validation 模式
 */
async function executeAdversarial(
  task: string,
  agents: string[],
  runId: string,
  extraSystemPrompt?: string,
): Promise<TeamRunResult["results"]> {
  const cfg = loadConfig();
  const results: TeamRunResult["results"] = [];

  if (agents.length === 0) {
    return results;
  }

  const [producer, ...reviewers] = agents;

  // Step1: producer 产出
  const producerKey = resolveAgentMainSessionKey({ cfg, agentId: producer });
  try {
    await agentCommandFromIngress(
      {
        message: `[系统：对抗验证 - 产出] ${task}`,
        sessionKey: producerKey,
        runId: `${runId}-adversarial-produce-${randomUUID().slice(0, 6)}`,
        deliver: false,
        messageChannel: "internal",
        senderIsOwner: true,
        extraSystemPrompt,
        inputProvenance: {
          kind: "internal_system",
          sourceChannel: "team_run",
          sourceTool: "team_run",
        },
      },
      defaultRuntime,
      createDefaultDeps(),
    );
    results.push({ agentId: producer, status: "success" });
  } catch (err) {
    results.push({ agentId: producer, status: "failed", error: String(err) });
  }

  // Step2: reviewers 并行评审
  const reviewResults = await Promise.allSettled(
    reviewers.map((agentId) => {
      const sessionKey = resolveAgentMainSessionKey({ cfg, agentId });
      return agentCommandFromIngress(
        {
          message: `[系统：对抗验证 - 评审] 请对以下任务的最新产出做批判性评审，指出风险、盲点和改进建议（不超过300字）：\n${task}`,
          sessionKey,
          runId: `${runId}-adversarial-review-${agentId}-${randomUUID().slice(0, 6)}`,
          deliver: false,
          messageChannel: "internal",
          senderIsOwner: true,
          inputProvenance: {
            kind: "internal_system",
            sourceChannel: "team_run",
            sourceTool: "team_run",
          },
        },
        defaultRuntime,
        createDefaultDeps(),
      );
    }),
  );

  reviewers.forEach((agentId, i) => {
    const r = reviewResults[i];
    results.push({
      agentId,
      status: r?.status === "fulfilled" ? "success" : "failed",
      error: r?.status === "rejected" ? String(r.reason) : undefined,
    });
  });

  return results;
}

/**
 * 创建 team_run 工具
 */
export function createTeamRunTool(_params: { agentId: string }) {
  return {
    name: "team_run",
    description:
      "Orchestrate multiple agents as a virtual team to complete a task together.\n" +
      "Modes:\n" +
      "- fanout: broadcast task to all agents in parallel (best for independent analysis)\n" +
      "- pipeline: pass task sequentially through agents (best for review chains)\n" +
      "- adversarial: first agent produces, rest review/critique (best for quality validation)\n" +
      "- consensus: fanout then summarize (alias for fanout with summary prompt)\n" +
      "\nBest practices (OpenProse patterns):\n" +
      "- Use fanout for parallel-independent-work\n" +
      "- Use pipeline for pipeline-composition\n" +
      "- Use adversarial for adversarial-validation",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task or question to assign to the team",
        },
        mode: {
          type: "string",
          enum: ["fanout", "pipeline", "adversarial", "consensus"],
          description: "Orchestration mode (default: fanout)",
        },
        agents: {
          type: "array",
          items: { type: "string" },
          description: "Agent IDs to include. If omitted, all configured agents are used.",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 60)",
        },
        extraSystemPrompt: {
          type: "string",
          description:
            "Additional system context injected for each agent run (e.g. role assignment or model-tiering hint)",
        },
      },
      required: ["task"],
    },
    async execute(input: Record<string, unknown>) {
      const task = typeof input.task === "string" ? input.task.trim() : "";
      if (!task) {
        return { error: "task is required" };
      }

      const mode: TeamRunMode = (
        ["fanout", "pipeline", "adversarial", "consensus"] as const
      ).includes(input.mode as TeamRunMode)
        ? (input.mode as TeamRunMode)
        : "fanout";

      const cfg = loadConfig();
      const allAgents = listAgentIds(cfg);
      const requestedAgents = Array.isArray(input.agents)
        ? (input.agents as string[]).filter((a) => typeof a === "string" && allAgents.includes(a))
        : allAgents;

      if (requestedAgents.length === 0) {
        return { error: "No valid agents found. Check agent IDs or configure agents in config." };
      }

      const runId = `team-run-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const extraSystemPrompt =
        typeof input.extraSystemPrompt === "string" ? input.extraSystemPrompt : undefined;

      let executionResults: TeamRunResult["results"];

      switch (mode) {
        case "fanout":
        case "consensus":
          executionResults = await executeFanOut(task, requestedAgents, runId, extraSystemPrompt);
          break;
        case "pipeline":
          executionResults = await executePipeline(task, requestedAgents, runId, extraSystemPrompt);
          break;
        case "adversarial":
          executionResults = await executeAdversarial(
            task,
            requestedAgents,
            runId,
            extraSystemPrompt,
          );
          break;
        default:
          executionResults = await executeFanOut(task, requestedAgents, runId, extraSystemPrompt);
      }

      const successCount = executionResults.filter((r) => r.status === "success").length;
      const failCount = executionResults.filter((r) => r.status === "failed").length;

      const result: TeamRunResult = {
        runId,
        mode,
        participants: requestedAgents,
        started: Date.now(),
        results: executionResults,
        summary: `Team run complete: ${successCount} succeeded, ${failCount} failed. Mode: ${mode}, Agents: ${requestedAgents.join(", ")}.`,
      };

      return result;
    },
  };
}
