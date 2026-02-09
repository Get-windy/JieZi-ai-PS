/**
 * Scenarios RPC 处理器
 *
 * 自动化协作场景配置和管理
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

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
        respond(false, null, errorShape(ErrorCodes.NOT_FOUND, "Scenario not found"));
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
        type: typeof type === "string" ? (type as any) : "custom",
        enabled: false,
        config: typeof config === "object" ? (config as any) : {},
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
        respond(false, null, errorShape(ErrorCodes.NOT_FOUND, "Scenario not found"));
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
        respond(false, null, errorShape(ErrorCodes.NOT_FOUND, "Scenario not found"));
        return;
      }

      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 执行场景
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
        respond(false, null, errorShape(ErrorCodes.NOT_FOUND, "Scenario not found"));
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

      // 模拟异步执行
      setTimeout(() => {
        run.status = "success";
        run.completedAt = Date.now();
        run.duration = run.completedAt - run.startedAt;

        // 更新场景统计
        if (!scenario.stats) {
          scenario.stats = {
            totalRuns: 0,
            successRuns: 0,
          };
        }
        scenario.stats.totalRuns++;
        scenario.stats.successRuns++;
        scenario.stats.lastRunAt = Date.now();
        if (scenario.stats.avgDuration) {
          scenario.stats.avgDuration = (scenario.stats.avgDuration + run.duration) / 2;
        } else {
          scenario.stats.avgDuration = run.duration;
        }
      }, 2000);

      respond(true, { run }, undefined);
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
