/**
 * OKR 目标管理模块
 *
 * 参考业界实践：
 * - John Doerr "Measure What Matters" — OKR 标准方法论
 * - Linear Roadmap Goals — 代码层 OKR 绑定
 * - Google/Intel OKR 4季度滚动更新
 * - SAFe Program Increment Goals
 *
 * 层次结构：
 *   Objective（战略目标）
 *     └─ KeyResult（可量化关键结果）
 *           └─ Task（执行任务，通过 objectiveId/keyResultId 关联）
 *
 * 存储策略：
 *   - 与项目 OKR 存储在 PROJECT_CONFIG.json 的 objectives[] 数组中
 *   - 支持单独文件存储（okr-{projectId}.json）用于大型项目
 *   - 完成率自动从 Task → KeyResult → Objective 向上汇聚
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ProjectObjective, KeyResult } from "../utils/project-context.js";

// ─────────────────────────────────────────────────────────────────────────────
// 扩展类型
// ─────────────────────────────────────────────────────────────────────────────

export type { ProjectObjective, KeyResult };

/** OKR 存储结构 */
export interface OkrStore {
  projectId: string;
  objectives: ProjectObjective[];
  updatedAt: number;
}

/** OKR 进度汇总 */
export interface OkrProgress {
  objectiveId: string;
  objectiveTitle: string;
  objectiveStatus: ProjectObjective["status"];
  /** 总体完成率 0-100 */
  completionPercent: number;
  keyResults: Array<{
    id: string;
    description: string;
    achieved: boolean;
    /** 进度百分比（如果 current/target 都有值） */
    progressPercent?: number;
    current?: number;
    target?: number;
    unit?: string;
  }>;
  /** 关联任务数量（通过 objectiveId 关联） */
  linkedTaskCount: number;
  /** 已完成关联任务数量 */
  completedTaskCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function getOkrFilePath(workspacePath: string): string {
  return path.join(workspacePath, "okr.json");
}

// ─────────────────────────────────────────────────────────────────────────────
// 存储层
// ─────────────────────────────────────────────────────────────────────────────

export function loadOkrStore(workspacePath: string): OkrStore | null {
  const filePath = getOkrFilePath(workspacePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as OkrStore;
  } catch {
    return null;
  }
}

export function saveOkrStore(workspacePath: string, store: OkrStore): void {
  const filePath = getOkrFilePath(workspacePath);
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  store.updatedAt = Date.now();
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

function initStore(projectId: string): OkrStore {
  return { projectId, objectives: [], updatedAt: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD 操作
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建或更新 Objective
 */
export function upsertObjective(
  workspacePath: string,
  projectId: string,
  params: {
    id?: string;
    title: string;
    description?: string;
    timeframe: ProjectObjective["timeframe"];
    targetDate?: number;
    parentObjectiveId?: string;
  },
): ProjectObjective {
  const store = loadOkrStore(workspacePath) ?? initStore(projectId);
  const now = Date.now();

  if (params.id) {
    // 更新
    const idx = store.objectives.findIndex((o) => o.id === params.id);
    if (idx >= 0) {
      store.objectives[idx] = {
        ...store.objectives[idx],
        title: params.title,
        description: params.description ?? store.objectives[idx].description,
        timeframe: params.timeframe,
        targetDate: params.targetDate ?? store.objectives[idx].targetDate,
        parentObjectiveId:
          params.parentObjectiveId ?? store.objectives[idx].parentObjectiveId,
        updatedAt: now,
      };
      saveOkrStore(workspacePath, store);
      return store.objectives[idx];
    }
  }

  // 创建
  const objective: ProjectObjective = {
    id: params.id ?? generateId("obj"),
    title: params.title,
    description: params.description,
    timeframe: params.timeframe,
    status: "not-started",
    targetDate: params.targetDate,
    parentObjectiveId: params.parentObjectiveId,
    keyResults: [],
    createdAt: now,
    updatedAt: now,
  };
  store.objectives.push(objective);
  saveOkrStore(workspacePath, store);
  return objective;
}

/**
 * 删除 Objective（同时删除其下所有 KeyResult）
 */
export function deleteObjective(workspacePath: string, objectiveId: string): boolean {
  const store = loadOkrStore(workspacePath);
  if (!store) return false;

  const before = store.objectives.length;
  store.objectives = store.objectives.filter((o) => o.id !== objectiveId);
  if (store.objectives.length === before) return false;

  saveOkrStore(workspacePath, store);
  return true;
}

/**
 * 添加或更新 KeyResult
 */
export function upsertKeyResult(
  workspacePath: string,
  projectId: string,
  objectiveId: string,
  params: {
    id?: string;
    description: string;
    current?: number;
    target?: number;
    unit?: string;
    achieved?: boolean;
  },
): KeyResult | null {
  const store = loadOkrStore(workspacePath) ?? initStore(projectId);
  const objIdx = store.objectives.findIndex((o) => o.id === objectiveId);
  if (objIdx < 0) return null;

  const obj = store.objectives[objIdx];
  const krs = obj.keyResults ?? [];
  const now = Date.now();

  if (params.id) {
    const krIdx = krs.findIndex((kr) => kr.id === params.id);
    if (krIdx >= 0) {
      krs[krIdx] = {
        ...krs[krIdx],
        description: params.description,
        current: params.current ?? krs[krIdx].current,
        target: params.target ?? krs[krIdx].target,
        unit: params.unit ?? krs[krIdx].unit,
        achieved: params.achieved ?? krs[krIdx].achieved,
        achievedAt:
          params.achieved && !krs[krIdx].achieved ? now : krs[krIdx].achievedAt,
      };
      store.objectives[objIdx] = { ...obj, keyResults: krs, updatedAt: now };
      saveOkrStore(workspacePath, store);
      return krs[krIdx];
    }
  }

  // 新增
  const kr: KeyResult = {
    id: params.id ?? generateId("kr"),
    description: params.description,
    current: params.current,
    target: params.target,
    unit: params.unit,
    achieved: params.achieved ?? false,
    achievedAt: params.achieved ? now : undefined,
  };
  krs.push(kr);
  store.objectives[objIdx] = { ...obj, keyResults: krs, updatedAt: now };
  saveOkrStore(workspacePath, store);
  return kr;
}

/**
 * 更新 Objective 状态（支持自动推导）
 */
export function updateObjectiveStatus(
  workspacePath: string,
  objectiveId: string,
  status: ProjectObjective["status"],
  note?: string,
): boolean {
  const store = loadOkrStore(workspacePath);
  if (!store) return false;

  const idx = store.objectives.findIndex((o) => o.id === objectiveId);
  if (idx < 0) return false;

  const now = Date.now();
  store.objectives[idx] = {
    ...store.objectives[idx],
    status,
    achievedAt: status === "achieved" ? now : store.objectives[idx].achievedAt,
    lastUpdateNote: note,
    updatedAt: now,
  };
  saveOkrStore(workspacePath, store);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 进度汇聚
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 计算 OKR 进度（结合 KeyResult 完成情况 + 关联 Task 完成率）
 *
 * 算法：
 * 1. KR 进度 = (current / target * 100)，无数值时用 achieved(100) 或 0
 * 2. Objective 进度 = 所有 KR 进度的平均值
 * 3. 若有关联任务，将任务完成率（50%权重）与 KR 完成率（50%权重）混合
 */
export function calcOkrProgress(
  objectives: ProjectObjective[],
  taskStats?: Map<string, { total: number; completed: number }>,
): OkrProgress[] {
  return objectives.map((obj) => {
    const krs = obj.keyResults ?? [];

    // KeyResult 进度
    const krProgressList = krs.map((kr) => {
      if (kr.achieved) return 100;
      if (kr.current != null && kr.target != null && kr.target > 0) {
        return Math.min(100, Math.round((kr.current / kr.target) * 100));
      }
      return 0;
    });

    const krAvg =
      krProgressList.length > 0
        ? Math.round(krProgressList.reduce((s, v) => s + v, 0) / krProgressList.length)
        : 0;

    // 关联任务进度
    const taskStat = taskStats?.get(obj.id);
    const linkedTaskCount = taskStat?.total ?? 0;
    const completedTaskCount = taskStat?.completed ?? 0;
    const taskProgress =
      linkedTaskCount > 0 ? Math.round((completedTaskCount / linkedTaskCount) * 100) : null;

    // 混合完成率
    let completionPercent: number;
    if (krs.length === 0 && taskProgress != null) {
      completionPercent = taskProgress;
    } else if (krs.length > 0 && taskProgress != null) {
      completionPercent = Math.round(krAvg * 0.5 + taskProgress * 0.5);
    } else {
      completionPercent = krAvg;
    }

    return {
      objectiveId: obj.id,
      objectiveTitle: obj.title,
      objectiveStatus: obj.status,
      completionPercent,
      keyResults: krs.map((kr) => {
        const progressPercent =
          kr.current != null && kr.target != null && kr.target > 0
            ? Math.min(100, Math.round((kr.current / kr.target) * 100))
            : kr.achieved
              ? 100
              : undefined;
        return {
          id: kr.id,
          description: kr.description,
          achieved: kr.achieved,
          progressPercent,
          current: kr.current,
          target: kr.target,
          unit: kr.unit,
        };
      }),
      linkedTaskCount,
      completedTaskCount,
    };
  });
}

/**
 * 生成 OKR 摘要文本（适合注入 prompt）
 */
export function formatOkrSummary(progress: OkrProgress[]): string {
  if (progress.length === 0) {
    return "（尚未定义 OKR 目标）";
  }

  const lines: string[] = ["## OKR 目标进度", ""];

  for (const obj of progress) {
    const statusIcon =
      obj.objectiveStatus === "achieved"
        ? "✅"
        : obj.objectiveStatus === "in-progress"
          ? "🔄"
          : obj.objectiveStatus === "missed"
            ? "❌"
            : "📋";
    lines.push(
      `${statusIcon} **${obj.objectiveTitle}** — ${obj.completionPercent}%`,
    );
    for (const kr of obj.keyResults) {
      const krIcon = kr.achieved ? "✅" : "○";
      const progress =
        kr.current != null && kr.target != null
          ? ` (${kr.current}/${kr.target}${kr.unit ? " " + kr.unit : ""})`
          : "";
      lines.push(`  ${krIcon} ${kr.description}${progress}`);
    }
    if (obj.linkedTaskCount > 0) {
      lines.push(
        `  📌 关联任务: ${obj.completedTaskCount}/${obj.linkedTaskCount} 已完成`,
      );
    }
  }

  return lines.join("\n");
}
