/**
 * Scenarios Controller
 * 协作场景控制器
 */

import type { OpenClawApp } from "../app.ts";

export interface CollaborationScenario {
  id: string;
  name: string;
  description: string;
  type: "standup" | "pairing" | "review" | "knowledge" | "custom";
  enabled: boolean;
  config: {
    trigger?: {
      type: "manual" | "scheduled" | "event";
      schedule?: string;
      event?: string;
    };
    participants?: {
      agentIds: string[];
      roles?: string[];
    };
    channels?: {
      input: string[];
      output: string[];
    };
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

export interface ScenarioRun {
  id: string;
  scenarioId: string;
  status: "running" | "success" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  duration?: number;
  result?: Record<string, unknown>;
  error?: string;
}

export interface ScenarioRecommendation {
  scenarioId: string;
  name: string;
  reason: string;
  confidence: number;
  benefits: string[];
}

export interface ScenariosState {
  scenariosLoading: boolean;
  scenariosError: string | null;
  scenariosList: CollaborationScenario[];
  scenariosTotal: number;
  selectedScenarioId: string | null;
  editingScenario: CollaborationScenario | null;
  creatingScenario: boolean;
  runningScenarioId: string | null;
  scenarioRunsLoading: boolean;
  scenarioRuns: ScenarioRun[];
  recommendationsLoading: boolean;
  recommendations: ScenarioRecommendation[];
}

/**
 * 加载场景列表
 */
export async function loadScenarios(host: OpenClawApp): Promise<void> {
  host.scenariosLoading = true;
  host.scenariosError = null;

  try {
    const response = await host.client?.request("scenarios.list", {});

    if (response?.ok && response.result) {
      host.scenariosList = response.result.scenarios || [];
      host.scenariosTotal = response.result.total || 0;
    } else {
      host.scenariosError = response?.error?.message || "加载场景列表失败";
    }
  } catch (err) {
    host.scenariosError = err instanceof Error ? err.message : String(err);
  } finally {
    host.scenariosLoading = false;
  }
}

/**
 * 创建场景
 */
export async function createScenario(
  host: OpenClawApp,
  scenario: Omit<CollaborationScenario, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  try {
    const response = await host.client?.request("scenarios.create", scenario);

    if (response?.ok && response.result) {
      await loadScenarios(host);
      host.creatingScenario = false;
      host.editingScenario = null;
    } else {
      throw new Error(response?.error?.message || "创建场景失败");
    }
  } catch (err) {
    throw err;
  }
}

/**
 * 更新场景
 */
export async function updateScenario(
  host: OpenClawApp,
  scenarioId: string,
  updates: Partial<CollaborationScenario>,
): Promise<void> {
  try {
    const response = await host.client?.request("scenarios.update", {
      scenarioId,
      updates,
    });

    if (response?.ok) {
      await loadScenarios(host);
      host.editingScenario = null;
    } else {
      throw new Error(response?.error?.message || "更新场景失败");
    }
  } catch (err) {
    throw err;
  }
}

/**
 * 删除场景
 */
export async function deleteScenario(host: OpenClawApp, scenarioId: string): Promise<void> {
  try {
    const response = await host.client?.request("scenarios.delete", {
      scenarioId,
    });

    if (response?.ok) {
      await loadScenarios(host);
    } else {
      throw new Error(response?.error?.message || "删除场景失败");
    }
  } catch (err) {
    throw err;
  }
}

/**
 * 执行场景
 */
export async function runScenario(host: OpenClawApp, scenarioId: string): Promise<void> {
  try {
    host.runningScenarioId = scenarioId;

    const response = await host.client?.request("scenarios.run", {
      scenarioId,
    });

    if (response?.ok) {
      // 刷新场景列表以更新统计信息
      await loadScenarios(host);
      await loadScenarioRuns(host, scenarioId);
    } else {
      throw new Error(response?.error?.message || "执行场景失败");
    }
  } catch (err) {
    throw err;
  } finally {
    host.runningScenarioId = null;
  }
}

/**
 * 加载场景执行历史
 */
export async function loadScenarioRuns(host: OpenClawApp, scenarioId?: string): Promise<void> {
  host.scenarioRunsLoading = true;

  try {
    const response = await host.client?.request("scenarios.runs", {
      scenarioId,
    });

    if (response?.ok && response.result) {
      host.scenarioRuns = response.result.runs || [];
    }
  } catch (err) {
    console.error("Failed to load scenario runs:", err);
  } finally {
    host.scenarioRunsLoading = false;
  }
}

/**
 * 加载场景推荐
 */
export async function loadRecommendations(host: OpenClawApp): Promise<void> {
  host.recommendationsLoading = true;

  try {
    const response = await host.client?.request("scenarios.recommendations", {});

    if (response?.ok && response.result) {
      host.recommendations = response.result.recommendations || [];
    }
  } catch (err) {
    console.error("Failed to load recommendations:", err);
  } finally {
    host.recommendationsLoading = false;
  }
}
