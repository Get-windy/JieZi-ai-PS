/**
 * Task Template Manager — 任务模板管理器
 *
 * 对标 Linear 2026 Issue Templates 功能
 * 允许保存常用任务结构（字段预填/AC预填），快速创建标准化任务
 *
 * 存储：<workspaceRoot>/.task-templates/templates.json（全局共享）
 */

import * as fs from "fs";
import * as path from "path";

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  /** 适用场景描述 */
  useCases?: string;
  /** 模板内容：预填充的任务字段 */
  fields: {
    title?: string;
    description?: string;
    type?: string;
    priority?: string;
    level?: string;
    tags?: string[];
    estimatedHours?: number;
    storyPoints?: number;
    acceptanceCriteria?: string[];
  };
  /** 创建者 */
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** 使用计数 */
  useCount: number;
}

interface TemplateStore {
  templates: TaskTemplate[];
  updatedAt: number;
}

function resolveStoreDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".task-templates");
}

function resolveStorePath(workspaceRoot: string): string {
  return path.join(resolveStoreDir(workspaceRoot), "templates.json");
}

function loadTemplateStore(workspaceRoot: string): TemplateStore {
  const storePath = resolveStorePath(workspaceRoot);
  if (!fs.existsSync(storePath)) {
    return { templates: [], updatedAt: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf-8")) as TemplateStore;
  } catch {
    return { templates: [], updatedAt: 0 };
  }
}

function saveTemplateStore(workspaceRoot: string, store: TemplateStore): void {
  const storeDir = resolveStoreDir(workspaceRoot);
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
  fs.writeFileSync(resolveStorePath(workspaceRoot), JSON.stringify(store, null, 2), "utf-8");
}

/**
 * 创建或更新任务模板
 */
export function upsertTaskTemplate(
  workspaceRoot: string,
  input: {
    id?: string;
    name: string;
    description?: string;
    useCases?: string;
    fields: TaskTemplate["fields"];
    createdBy: string;
  },
): TaskTemplate {
  const store = loadTemplateStore(workspaceRoot);
  const now = Date.now();
  const templateId = input.id || `template-${input.name.toLowerCase().replace(/\s+/g, "-")}-${now}`;

  const existingIdx = store.templates.findIndex((t) => t.id === templateId);
  const template: TaskTemplate = {
    id: templateId,
    name: input.name,
    description: input.description,
    useCases: input.useCases,
    fields: input.fields,
    createdBy: input.createdBy,
    createdAt: existingIdx >= 0 ? store.templates[existingIdx].createdAt : now,
    updatedAt: now,
    useCount: existingIdx >= 0 ? store.templates[existingIdx].useCount : 0,
  };

  if (existingIdx >= 0) {
    store.templates[existingIdx] = template;
  } else {
    store.templates.push(template);
  }
  store.updatedAt = now;
  saveTemplateStore(workspaceRoot, store);
  return template;
}

/**
 * 列出所有任务模板（按使用次数降序）
 */
export function listTaskTemplates(
  workspaceRoot: string,
  filter?: { keyword?: string },
): TaskTemplate[] {
  const store = loadTemplateStore(workspaceRoot);
  let templates = store.templates;

  if (filter?.keyword) {
    const kw = filter.keyword.toLowerCase();
    templates = templates.filter(
      (t) =>
        t.name.toLowerCase().includes(kw) ||
        t.description?.toLowerCase().includes(kw) ||
        t.useCases?.toLowerCase().includes(kw),
    );
  }

  return templates.sort((a, b) => b.useCount - a.useCount);
}

/**
 * 获取单个模板
 */
export function getTaskTemplate(workspaceRoot: string, templateId: string): TaskTemplate | undefined {
  const store = loadTemplateStore(workspaceRoot);
  return store.templates.find((t) => t.id === templateId);
}

/**
 * 删除模板
 */
export function deleteTaskTemplate(workspaceRoot: string, templateId: string): boolean {
  const store = loadTemplateStore(workspaceRoot);
  const idx = store.templates.findIndex((t) => t.id === templateId);
  if (idx === -1) return false;
  store.templates.splice(idx, 1);
  store.updatedAt = Date.now();
  saveTemplateStore(workspaceRoot, store);
  return true;
}

/**
 * 应用模板：返回合并后的任务字段（模板字段 + 覆盖字段）
 * 同时增加模板使用计数
 */
export function applyTaskTemplate(
  workspaceRoot: string,
  templateId: string,
  overrides?: Partial<TaskTemplate["fields"]> & { title?: string },
): { merged: TaskTemplate["fields"] & { title?: string }; template: TaskTemplate } | null {
  const store = loadTemplateStore(workspaceRoot);
  const idx = store.templates.findIndex((t) => t.id === templateId);
  if (idx === -1) return null;

  // 增加使用计数
  store.templates[idx].useCount++;
  store.updatedAt = Date.now();
  saveTemplateStore(workspaceRoot, store);

  const template = store.templates[idx];
  const merged: TaskTemplate["fields"] & { title?: string } = {
    ...template.fields,
    ...(overrides ?? {}),
    // AC 列表合并（模板 AC + 覆盖 AC）
    acceptanceCriteria: [
      ...(template.fields.acceptanceCriteria ?? []),
      ...(overrides?.acceptanceCriteria ?? []),
    ],
    // tags 合并去重
    tags: [...new Set([...(template.fields.tags ?? []), ...(overrides?.tags ?? [])])],
  };

  return { merged, template };
}
