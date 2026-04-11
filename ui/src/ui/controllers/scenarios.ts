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
    const result = (await host.client?.request("scenarios.list", {})) as {
      scenarios?: CollaborationScenario[];
      total?: number;
    } | null;
    host.scenariosList = result?.scenarios || [];
    host.scenariosTotal = result?.total || 0;
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
  await host.client?.request("scenarios.create", scenario);
  await loadScenarios(host);
  host.creatingScenario = false;
  host.editingScenario = null;
}

/**
 * 更新场景
 */
export async function updateScenario(
  host: OpenClawApp,
  scenarioId: string,
  updates: Partial<CollaborationScenario>,
): Promise<void> {
  await host.client?.request("scenarios.update", { scenarioId, updates });
  await loadScenarios(host);
  host.editingScenario = null;
}

/**
 * 删除场景
 */
export async function deleteScenario(host: OpenClawApp, scenarioId: string): Promise<void> {
  await host.client?.request("scenarios.delete", { scenarioId });
  await loadScenarios(host);
}

/**
 * 执行场景
 */
export async function runScenario(host: OpenClawApp, scenarioId: string): Promise<void> {
  try {
    host.runningScenarioId = scenarioId;
    await host.client?.request("scenarios.run", { scenarioId });
    await loadScenarios(host);
    await loadScenarioRuns(host, scenarioId);
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
    const result = (await host.client?.request("scenarios.runs", { scenarioId })) as {
      runs?: ScenarioRun[];
    } | null;
    host.scenarioRuns = result?.runs || [];
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
    const result = (await host.client?.request("scenarios.recommendations", {})) as {
      recommendations?: ScenarioRecommendation[];
    } | null;
    host.recommendations = result?.recommendations || [];
  } catch (err) {
    console.error("Failed to load recommendations:", err);
  } finally {
    host.recommendationsLoading = false;
  }
}
