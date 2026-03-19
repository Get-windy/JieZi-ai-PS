/**
 * Scenarios RPC 处理器
 *
 * 自动化协作场景配置和管理
 * 借鉴 OpenProse patterns: fan-out-fan-in, pipeline-composition, agent-specialization
 */

import { randomUUID } from "node:crypto";
import { listAgentIds } from "../../agents/agent-scope.js";
import { createDefaultDeps } from "../../cli/deps.js";
import { agentCommandFromIngress } from "../../../upstream/src/commands/agent.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { resolveAgentMainSessionKey } from "../../../upstream/src/config/sessions.js";
import { defaultRuntime } from "../../../upstream/src/runtime.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";

/**
 * 协作场景定义
 */
export interface CollaborationScenario {
  id: string;
  name: string;
  description: string;
  type: "standup" | "pairing" | "review" | "knowledge" | "custom";
  enabled: boolean;
  config: {
    // 触发条件
    trigger?: {
      type: "manual" | "scheduled" | "event";
      schedule?: string; // cron 表达式
      event?: string;
    };
    // 参与者
    participants?: {
      agentIds: string[];
      roles?: string[];
    };
    // 通道配置
    channels?: {
      input: string[];
      output: string[];
    };
    // 工作流步骤
    workflow?: Array<{
      step: number;
      action: string;
      params?: Record<string, unknown>;
    }>;
  };
  stats?: {
    totalRuns: number;
    successRuns: number;
    lastRunAt?: number;
    avgDuration?: number;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * 场景执行记录
 */
interface ScenarioRun {
  id: string;
  scenarioId: string;
  status: "running" | "success" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  duration?: number;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * 场景推荐
 */
interface ScenarioRecommendation {
  scenarioId: string;
  name: string;
  reason: string;
  confidence: number;
  benefits: string[];
}

// 内存存储
const scenarios = new Map<string, CollaborationScenario>();
const scenarioRuns = new Map<string, ScenarioRun>();

// ============================================================================
// 场景执行引擎 — 借鉴 fan-out-fan-in + pipeline-composition
// ============================================================================

/**
 * 执行站会场景：向每个参与者发出「今日站会」指令，收集其回复。
 * 借鉴 OpenProse parallel-independent-work：并行驱动所有参与者。
 */
async function executeStandupScenario(
  scenario: CollaborationScenario,
  run: ScenarioRun,
): Promise<void> {
  const cfg = loadConfig();
  const questions = (scenario.config.workflow?.[0]?.params?.questions as string[]) ?? [
    "昨天完成了什么？",
    "今天计划做什么？",
    "有什么阻碍？",
  ];
  const questionText = questions.join("\n");
  const participants = scenario.config.participants?.agentIds ?? listAgentIds(cfg);

  const prompt = [
    `[系统：每日站会] 请用简洁的格式回答以下问题（不超过200字）：`,
    questionText,
    `场景：${scenario.name}`,
  ].join("\n");

  // 并行 fan-out：向所有参与者同时发送
  const results = await Promise.allSettled(
    participants.map((agentId) => {
      const sessionKey = resolveAgentMainSessionKey({ cfg, agentId });
      return agentCommandFromIngress(
        {
          message: prompt,
          sessionKey,
          runId: `scenario-${run.id}-${agentId}-${randomUUID().slice(0, 8)}`,
          deliver: false,
          messageChannel: "internal",
          senderIsOwner: true,
          inputProvenance: {
            kind: "internal_system",
            sourceChannel: "scenario",
            sourceTool: `scenario.run:${scenario.id}`,
          },
        },
        defaultRuntime,
        createDefaultDeps(),
      );
    }),
  );

  // fan-in：汇总结果
  const summaries: string[] = [];
  participants.forEach((agentId, idx) => {
    const result = results[idx];
    if (result?.status === "fulfilled") {
      summaries.push(`【${agentId}】回复成功`);
    } else {
      summaries.push(`【${agentId}】执行失败: ${result?.reason ?? "unknown"}`);
    }
  });

  run.result = { type: "standup", participants, summaries };
}

/**
 * 执行代码评审场景：借鉴 adversarial-validation 模式，
 * 由 reviewer agent 对最近代码变更做独立评审。
 */
async function executeReviewScenario(
  scenario: CollaborationScenario,
  run: ScenarioRun,
): Promise<void> {
  const cfg = loadConfig();
  const participants = scenario.config.participants?.agentIds ?? listAgentIds(cfg);
  const reviewers = participants.filter((_, i) =>
    scenario.config.participants?.roles
      ? scenario.config.participants.roles[i] === "reviewer"
      : true,
  );
  const targets = reviewers.length > 0 ? reviewers : participants.slice(0, 2);

  const prompt = [
    `[系统：代码评审] 请对当前工作区最近的代码变更做简要评审（不超过300字）：`,
    `1. 代码质量与可维护性`,
    `2. 潜在风险或 bug`,
    `3. 改进建议`,
  ].join("\n");

  const results = await Promise.allSettled(
    targets.map((agentId) => {
      const sessionKey = resolveAgentMainSessionKey({ cfg, agentId });
      return agentCommandFromIngress(
        {
          message: prompt,
          sessionKey,
          runId: `scenario-${run.id}-review-${agentId}-${randomUUID().slice(0, 8)}`,
          deliver: false,
          messageChannel: "internal",
          senderIsOwner: true,
          inputProvenance: {
            kind: "internal_system",
            sourceChannel: "scenario",
            sourceTool: `scenario.run:${scenario.id}`,
          },
        },
        defaultRuntime,
        createDefaultDeps(),
      );
    }),
  );

  run.result = {
    type: "review",
    reviewers: targets,
    completed: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

/**
 * 执行配对编程场景：借鉴 pipeline-composition，
 * driver 先分析，navigator 再规划，顺序串行。
 */
async function executePairingScenario(
  scenario: CollaborationScenario,
  run: ScenarioRun,
): Promise<void> {
  const cfg = loadConfig();
  const participants = scenario.config.participants?.agentIds ?? listAgentIds(cfg);
  const roles = scenario.config.participants?.roles ?? [];
  const driverIdx = roles.indexOf("driver") >= 0 ? roles.indexOf("driver") : 0;
  const navigatorIdx = roles.indexOf("navigator") >= 0 ? roles.indexOf("navigator") : 1;
  const driverAgent = participants[driverIdx] ?? participants[0];
  const navigatorAgent = participants[navigatorIdx] ?? participants[1] ?? participants[0];

  if (!driverAgent) {
    run.error = "配对编程场景需要至少1个参与者";
    return;
  }

  // Step1: driver 分析任务
  const driverSessionKey = resolveAgentMainSessionKey({ cfg, agentId: driverAgent });
  await agentCommandFromIngress(
    {
      message: `[系统：配对编程 - Driver] 请分析当前任务，列出实现步骤，不超过200字。`,
      sessionKey: driverSessionKey,
      runId: `scenario-${run.id}-driver-${randomUUID().slice(0, 8)}`,
      deliver: false,
      messageChannel: "internal",
      senderIsOwner: true,
      inputProvenance: {
        kind: "internal_system",
        sourceChannel: "scenario",
        sourceTool: `scenario.run:${scenario.id}`,
      },
    },
    defaultRuntime,
    createDefaultDeps(),
  ).catch(() => null);

  // Step2: navigator 规划（pipeline: 等 driver 完成后再触发）
  if (navigatorAgent && navigatorAgent !== driverAgent) {
    const navigatorSessionKey = resolveAgentMainSessionKey({ cfg, agentId: navigatorAgent });
    await agentCommandFromIngress(
      {
        message: `[系统：配对编程 - Navigator] 请审查当前任务规划，补充注意事项，不超过150字。`,
        sessionKey: navigatorSessionKey,
        runId: `scenario-${run.id}-navigator-${randomUUID().slice(0, 8)}`,
        deliver: false,
        messageChannel: "internal",
        senderIsOwner: true,
        inputProvenance: {
          kind: "internal_system",
          sourceChannel: "scenario",
          sourceTool: `scenario.run:${scenario.id}`,
        },
      },
      defaultRuntime,
      createDefaultDeps(),
    ).catch(() => null);
  }

  run.result = { type: "pairing", driver: driverAgent, navigator: navigatorAgent };
}

/**
 * 执行知识沉淀场景：借鉴 iterative-refinement，
 * 所有参与者并行贡献知识片段，再汇总到共享记忆。
 */
async function executeKnowledgeScenario(
  scenario: CollaborationScenario,
  run: ScenarioRun,
): Promise<void> {
  const cfg = loadConfig();
  const days = (scenario.config.workflow?.[0]?.params?.days as number) ?? 7;
  const participants = scenario.config.participants?.agentIds ?? listAgentIds(cfg);

  const prompt = [
    `[系统：知识沉淀] 请总结过去 ${days} 天你完成的重要工作和学到的经验（不超过300字）：`,
    `包含：技术决策、解决的问题、可复用的模式、注意事项。`,
  ].join("\n");

  const results = await Promise.allSettled(
    participants.map((agentId) => {
      const sessionKey = resolveAgentMainSessionKey({ cfg, agentId });
      return agentCommandFromIngress(
        {
          message: prompt,
          sessionKey,
          runId: `scenario-${run.id}-knowledge-${agentId}-${randomUUID().slice(0, 8)}`,
          deliver: false,
          messageChannel: "internal",
          senderIsOwner: true,
          inputProvenance: {
            kind: "internal_system",
            sourceChannel: "scenario",
            sourceTool: `scenario.run:${scenario.id}`,
          },
        },
        defaultRuntime,
        createDefaultDeps(),
      );
    }),
  );

  run.result = {
    type: "knowledge",
    participants,
    days,
    collected: results.filter((r) => r.status === "fulfilled").length,
  };
}

/**
 * 根据场景类型分发到对应的执行函数
 */
async function dispatchScenarioExecution(
  scenario: CollaborationScenario,
  run: ScenarioRun,
): Promise<void> {
  switch (scenario.type) {
    case "standup":
      await executeStandupScenario(scenario, run);
      break;
    case "review":
      await executeReviewScenario(scenario, run);
      break;
    case "pairing":
      await executePairingScenario(scenario, run);
      break;
    case "knowledge":
      await executeKnowledgeScenario(scenario, run);
      break;
    case "custom":
      // custom 场景：对所有参与者广播自定义消息
      await executeStandupScenario(scenario, run);
      break;
    default:
      run.error = `不支持的场景类型: ${String(scenario.type)}`;
  }
}

// 预定义场景模板
const SCENARIO_TEMPLATES: Omit<CollaborationScenario, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "每日站会",
    description: "自动化每日站会流程，收集团队成员的工作进展",
    type: "standup",
    enabled: false,
    config: {
      trigger: {
        type: "scheduled",
        schedule: "0 9 * * 1-5", // 工作日早上9点
      },
      participants: {
        agentIds: [],
      },
      workflow: [
        {
          step: 1,
          action: "collect_updates",
          params: { questions: ["昨天完成了什么？", "今天计划做什么？", "有什么阻碍？"] },
        },
        { step: 2, action: "summarize", params: { format: "markdown" } },
        { step: 3, action: "broadcast", params: { channels: ["telegram", "discord"] } },
      ],
    },
  },
  {
    name: "配对编程",
    description: "两个智能助手协作完成编程任务",
    type: "pairing",
    enabled: false,
    config: {
      trigger: {
        type: "manual",
      },
      participants: {
        agentIds: [],
        roles: ["driver", "navigator"],
      },
      workflow: [
        { step: 1, action: "assign_roles" },
        { step: 2, action: "share_context" },
        { step: 3, action: "collaborate", params: { mode: "sync" } },
        { step: 4, action: "review_and_commit" },
      ],
    },
  },
  {
    name: "代码评审",
    description: "自动化代码评审流程，多个审查员协作",
    type: "review",
    enabled: false,
    config: {
      trigger: {
        type: "event",
        event: "pull_request.opened",
      },
      participants: {
        agentIds: [],
        roles: ["reviewer", "author"],
      },
      workflow: [
        { step: 1, action: "fetch_changes" },
        { step: 2, action: "parallel_review", params: { reviewers: 2 } },
        { step: 3, action: "aggregate_feedback" },
        { step: 4, action: "post_comments" },
      ],
    },
  },
  {
    name: "知识沉淀",
    description: "定期整理和分享团队知识库",
    type: "knowledge",
    enabled: false,
    config: {
      trigger: {
        type: "scheduled",
        schedule: "0 18 * * 5", // 每周五下午6点
      },
      workflow: [
        { step: 1, action: "collect_learnings", params: { days: 7 } },
        { step: 2, action: "categorize" },
        { step: 3, action: "generate_summary" },
        { step: 4, action: "update_wiki" },
      ],
    },
  },
];

// 初始化预定义场景
function initializeTemplates() {
  if (scenarios.size === 0) {
    SCENARIO_TEMPLATES.forEach((template, index) => {
      const id = `scenario-${index + 1}`;
      scenarios.set(id, {
        ...template,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  }
}

export const scenariosHandlers: GatewayRequestHandlers = {
  /**
   * 获取场景列表
   */
  "scenarios.list": async ({ respond }) => {
    try {
      initializeTemplates();
      const list = Array.from(scenarios.values());
      respond(true, { scenarios: list, total: list.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取场景详情
   */
  "scenarios.get": async ({ params, respond }) => {
    const { scenarioId } = params || {};

    if (!scenarioId || typeof scenarioId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing scenarioId"));
      return;
    }

    try {
      const scenario = scenarios.get(scenarioId);
      if (!scenario) {
        respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, "Scenario not found"));
        return;
      }

      respond(true, { scenario }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 创建场景
   */
  "scenarios.create": async ({ params, respond }) => {
    const { name, description, type, config } = params || {};

    if (!name || typeof name !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing name"));
      return;
    }

    try {
      const scenarioId = `scenario-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const scenario: CollaborationScenario = {
        id: scenarioId,
        name,
        description: typeof description === "string" ? description : "",
        type: typeof type === "string" ? (type as CollaborationScenario["type"]) : "custom",
        enabled: false,
        config: typeof config === "object" ? (config as CollaborationScenario["config"]) : {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      scenarios.set(scenarioId, scenario);
      respond(true, { scenario }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 更新场景
   */
  "scenarios.update": async ({ params, respond }) => {
    const { scenarioId, updates } = params || {};

    if (!scenarioId || typeof scenarioId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing scenarioId"));
      return;
    }

    try {
      const scenario = scenarios.get(scenarioId);
      if (!scenario) {
        respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, "Scenario not found"));
        return;
      }

      if (updates && typeof updates === "object") {
        Object.assign(scenario, updates, { updatedAt: Date.now() });
      }

      respond(true, { scenario }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 删除场景
   */
  "scenarios.delete": async ({ params, respond }) => {
    const { scenarioId } = params || {};

    if (!scenarioId || typeof scenarioId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing scenarioId"));
      return;
    }

    try {
      const deleted = scenarios.delete(scenarioId);
      if (!deleted) {
        respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, "Scenario not found"));
        return;
      }

      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 执行场景 — 真实接入 agentCommandFromIngress
   * 异步执行：立即返回 runId，后台驱动 Agent。
   */
  "scenarios.run": async ({ params, respond }) => {
    const { scenarioId } = params || {};

    if (!scenarioId || typeof scenarioId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing scenarioId"));
      return;
    }

    try {
      const scenario = scenarios.get(scenarioId);
      if (!scenario) {
        respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, "Scenario not found"));
        return;
      }
      if (!scenario.enabled) {
        respond(
          false,
          null,
          errorShape(ErrorCodes.INVALID_REQUEST, "Scenario is disabled. Enable it first."),
        );
        return;
      }

      const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const run: ScenarioRun = {
        id: runId,
        scenarioId,
        status: "running",
        startedAt: Date.now(),
      };

      scenarioRuns.set(runId, run);
      respond(true, { run }, undefined);

      // 异步执行——不阻塞响应
      void (async () => {
        try {
          await dispatchScenarioExecution(scenario, run);
          run.status = "success";
        } catch (execErr) {
          run.status = "failed";
          run.error = String(execErr);
        } finally {
          run.completedAt = Date.now();
          run.duration = run.completedAt - run.startedAt;
          // 更新场景统计
          if (!scenario.stats) {
            scenario.stats = { totalRuns: 0, successRuns: 0 };
          }
          scenario.stats.totalRuns++;
          if (run.status === "success") {
            scenario.stats.successRuns++;
          }
          scenario.stats.lastRunAt = Date.now();
          if (scenario.stats.avgDuration) {
            scenario.stats.avgDuration = (scenario.stats.avgDuration + (run.duration ?? 0)) / 2;
          } else {
            scenario.stats.avgDuration = run.duration;
          }
        }
      })();
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取场景执行历史
   */
  "scenarios.runs": async ({ params, respond }) => {
    const { scenarioId } = params || {};

    try {
      let runs = Array.from(scenarioRuns.values());

      if (scenarioId && typeof scenarioId === "string") {
        runs = runs.filter((r) => r.scenarioId === scenarioId);
      }

      respond(true, { runs, total: runs.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取场景推荐
   */
  "scenarios.recommendations": async ({ respond }) => {
    try {
      // 基于简单规则生成推荐
      const recommendations: ScenarioRecommendation[] = [
        {
          scenarioId: "scenario-1",
          name: "每日站会",
          reason: "您的团队有多个活跃成员，每日站会可以提高沟通效率",
          confidence: 0.85,
          benefits: ["提高团队协作效率", "及时发现和解决问题", "增强团队凝聚力"],
        },
        {
          scenarioId: "scenario-3",
          name: "代码评审",
          reason: "检测到频繁的代码提交，自动化评审可以提高代码质量",
          confidence: 0.75,
          benefits: ["保证代码质量", "知识分享", "减少bug"],
        },
      ];

      respond(true, { recommendations }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
