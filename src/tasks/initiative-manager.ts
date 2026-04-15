/**
 * Initiative 战略主题管理模块
 *
 * 参考业界实践：
 * - Linear 2025 Initiatives — 跨项目战略主题，Initiative > Project > Sprint/Epic > Task
 * - SAFe Portfolio Epic — 跨价值流的大型工作项
 * - Atlassian Advanced Roadmaps — 多项目战略对齐
 *
 * 层次结构：
 *   Initiative（战略主题/Portfolio Epic）
 *     └─ Project（项目，通过 initiativeId 关联）
 *           └─ Sprint / Epic
 *                 └─ Task（工作层次 level=initiative 的条目）
 *
 * Initiative 健康状态（对标 Linear 2025 changelog）：
 *   - on-track:  进展正常，预计按时完成
 *   - at-risk:   存在风险，需要关注
 *   - off-track: 已偏离计划，需要干预
 *   - completed: 已完成
 *   - cancelled: 已取消
 *
 * 存储策略：
 *   全局 JSON 文件（initiatives.json），与具体项目解耦。
 *   项目通过 project config 中的 initiativeId 字段关联到 Initiative。
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** Initiative 健康状态 */
export type InitiativeHealth = "on-track" | "at-risk" | "off-track" | "completed" | "cancelled";

/**
 * Initiative 进展更新
 * 对标 Linear 2025 initiative updates — 跨项目状态汇报
 */
export interface InitiativeUpdate {
  id: string;
  content: string;
  health: InitiativeHealth;
  authorId: string;
  createdAt: number;
  /** 自动追加的重要变更摘要（目标日期变更、项目完成等） */
  autoAppended?: string[];
}

/**
 * Initiative（战略主题）
 *
 * 位于层次顶端，跨越多个项目，代表一个战略目标或产品主题。
 * 例：Q2 性能优化专项、用户增长 Initiative、国际化 Initiative
 */
export interface Initiative {
  id: string;
  /** 战略主题名称 */
  title: string;
  /** 详细描述：解决什么战略问题、预期影响是什么 */
  description?: string;
  /** 当前健康状态 */
  health: InitiativeHealth;
  /** 负责人 ID */
  ownerId?: string;
  /** 关联的项目 ID 列表 */
  projectIds: string[];
  /** 目标完成日期（时间戳） */
  targetDate?: number;
  /** 实际完成日期 */
  completedAt?: number;
  /** 关联的 OKR 目标 ID */
  objectiveId?: string;
  /** 进展更新历史（append-only） */
  updates?: InitiativeUpdate[];
  /** 优先级：1=最高 → 4=最低 */
  priority?: 1 | 2 | 3 | 4;
  /** 自定义标签 */
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/** Initiative 存储结构 */
export interface InitiativeStore {
  initiatives: Initiative[];
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 存储路径（全局，不依赖具体项目）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 获取 initiatives.json 的存储路径
 * @param workspaceRoot 工作空间根目录（通常是 JieZI 目录）
 */
export function getInitiativeFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".initiatives", "initiatives.json");
}

// ─────────────────────────────────────────────────────────────────────────────
// 存储层
// ─────────────────────────────────────────────────────────────────────────────

export function loadInitiativeStore(workspaceRoot: string): InitiativeStore {
  const filePath = getInitiativeFilePath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return { initiatives: [], updatedAt: Date.now() };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as InitiativeStore;
  } catch {
    return { initiatives: [], updatedAt: Date.now() };
  }
}

export function saveInitiativeStore(workspaceRoot: string, store: InitiativeStore): void {
  const filePath = getInitiativeFilePath(workspaceRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  store.updatedAt = Date.now();
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD 操作
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建或更新 Initiative
 */
export function upsertInitiative(
  workspaceRoot: string,
  params: {
    id?: string;
    title: string;
    description?: string;
    health?: InitiativeHealth;
    ownerId?: string;
    projectIds?: string[];
    targetDate?: number;
    objectiveId?: string;
    priority?: 1 | 2 | 3 | 4;
    tags?: string[];
    createdBy: string;
  },
): Initiative {
  const store = loadInitiativeStore(workspaceRoot);
  const now = Date.now();

  if (params.id) {
    const idx = store.initiatives.findIndex((i) => i.id === params.id);
    if (idx >= 0) {
      const existing = store.initiatives[idx];
      // 检测目标日期变化，自动追加到最新 update
      const dateChanged =
        params.targetDate !== undefined && params.targetDate !== existing.targetDate;
      const healthChanged =
        params.health !== undefined && params.health !== existing.health;

      store.initiatives[idx] = {
        ...existing,
        title: params.title,
        description: params.description ?? existing.description,
        health: params.health ?? existing.health,
        ownerId: params.ownerId ?? existing.ownerId,
        projectIds: params.projectIds ?? existing.projectIds,
        targetDate: params.targetDate ?? existing.targetDate,
        objectiveId: params.objectiveId ?? existing.objectiveId,
        priority: params.priority ?? existing.priority,
        tags: params.tags ?? existing.tags,
        updatedAt: now,
      };

      // 自动记录重要变更
      if (dateChanged || healthChanged) {
        const autoNotes: string[] = [];
        if (dateChanged) {
          autoNotes.push(
            `目标日期从 ${existing.targetDate ? new Date(existing.targetDate).toISOString().split("T")[0] : "未设置"} 变更为 ${params.targetDate ? new Date(params.targetDate).toISOString().split("T")[0] : "未设置"}`,
          );
        }
        if (healthChanged) {
          autoNotes.push(`健康状态从 ${existing.health} 变更为 ${params.health}`);
        }
        const updates = store.initiatives[idx].updates ?? [];
        updates.push({
          id: generateId("upd"),
          content: "[自动记录] " + autoNotes.join("；"),
          health: store.initiatives[idx].health,
          authorId: params.createdBy,
          createdAt: now,
          autoAppended: autoNotes,
        });
        store.initiatives[idx].updates = updates;
      }

      saveInitiativeStore(workspaceRoot, store);
      return store.initiatives[idx];
    }
  }

  // 创建新 Initiative
  const initiative: Initiative = {
    id: params.id ?? generateId("ini"),
    title: params.title,
    description: params.description,
    health: params.health ?? "on-track",
    ownerId: params.ownerId,
    projectIds: params.projectIds ?? [],
    targetDate: params.targetDate,
    objectiveId: params.objectiveId,
    priority: params.priority,
    tags: params.tags,
    updates: [],
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };
  store.initiatives.push(initiative);
  saveInitiativeStore(workspaceRoot, store);
  return initiative;
}

/**
 * 为 Initiative 添加进展更新
 */
export function addInitiativeUpdate(
  workspaceRoot: string,
  initiativeId: string,
  params: {
    content: string;
    health: InitiativeHealth;
    authorId: string;
  },
): InitiativeUpdate | null {
  const store = loadInitiativeStore(workspaceRoot);
  const idx = store.initiatives.findIndex((i) => i.id === initiativeId);
  if (idx < 0) {return null;}

  const update: InitiativeUpdate = {
    id: generateId("upd"),
    content: params.content,
    health: params.health,
    authorId: params.authorId,
    createdAt: Date.now(),
  };

  store.initiatives[idx].updates = [...(store.initiatives[idx].updates ?? []), update];
  store.initiatives[idx].health = params.health;
  store.initiatives[idx].updatedAt = Date.now();
  saveInitiativeStore(workspaceRoot, store);
  return update;
}

/**
 * 将项目关联到 Initiative
 */
export function linkProjectToInitiative(
  workspaceRoot: string,
  initiativeId: string,
  projectId: string,
): boolean {
  const store = loadInitiativeStore(workspaceRoot);
  const idx = store.initiatives.findIndex((i) => i.id === initiativeId);
  if (idx < 0) {return false;}

  const existing = store.initiatives[idx].projectIds ?? [];
  if (!existing.includes(projectId)) {
    store.initiatives[idx].projectIds = [...existing, projectId];
    store.initiatives[idx].updatedAt = Date.now();
    saveInitiativeStore(workspaceRoot, store);
  }
  return true;
}

/**
 * 从 Initiative 解除项目关联
 */
export function unlinkProjectFromInitiative(
  workspaceRoot: string,
  initiativeId: string,
  projectId: string,
): boolean {
  const store = loadInitiativeStore(workspaceRoot);
  const idx = store.initiatives.findIndex((i) => i.id === initiativeId);
  if (idx < 0) {return false;}

  store.initiatives[idx].projectIds = (store.initiatives[idx].projectIds ?? []).filter(
    (id) => id !== projectId,
  );
  store.initiatives[idx].updatedAt = Date.now();
  saveInitiativeStore(workspaceRoot, store);
  return true;
}

/**
 * 列出 Initiative（支持过滤）
 */
export function listInitiatives(
  workspaceRoot: string,
  filter?: {
    health?: InitiativeHealth;
    ownerId?: string;
    projectId?: string;
    tag?: string;
  },
): Initiative[] {
  const store = loadInitiativeStore(workspaceRoot);
  let list = store.initiatives;

  if (filter?.health) {
    list = list.filter((i) => i.health === filter.health);
  }
  if (filter?.ownerId) {
    list = list.filter((i) => i.ownerId === filter.ownerId);
  }
  if (filter?.projectId) {
    list = list.filter((i) => i.projectIds.includes(filter.projectId!));
  }
  if (filter?.tag) {
    list = list.filter((i) => i.tags?.includes(filter.tag!));
  }

  // 按优先级 + 最新更新排序
  return list.toSorted((a, b) => {
    const pa = a.priority ?? 99;
    const pb = b.priority ?? 99;
    if (pa !== pb) {return pa - pb;}
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * 获取单个 Initiative
 */
export function getInitiative(workspaceRoot: string, initiativeId: string): Initiative | null {
  const store = loadInitiativeStore(workspaceRoot);
  return store.initiatives.find((i) => i.id === initiativeId) ?? null;
}

/**
 * 删除 Initiative
 */
export function deleteInitiative(workspaceRoot: string, initiativeId: string): boolean {
  const store = loadInitiativeStore(workspaceRoot);
  const before = store.initiatives.length;
  store.initiatives = store.initiatives.filter((i) => i.id !== initiativeId);
  if (store.initiatives.length === before) {return false;}
  saveInitiativeStore(workspaceRoot, store);
  return true;
}

/**
 * 计算 Initiative 健康状态汇总（基于关联项目数量和更新频率）
 */
export function calcInitiativeHealthSummary(initiatives: Initiative[]): {
  total: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  completed: number;
  cancelled: number;
} {
  return {
    total: initiatives.length,
    onTrack: initiatives.filter((i) => i.health === "on-track").length,
    atRisk: initiatives.filter((i) => i.health === "at-risk").length,
    offTrack: initiatives.filter((i) => i.health === "off-track").length,
    completed: initiatives.filter((i) => i.health === "completed").length,
    cancelled: initiatives.filter((i) => i.health === "cancelled").length,
  };
}
