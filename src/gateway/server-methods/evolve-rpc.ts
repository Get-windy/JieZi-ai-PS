// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Self-Evolution RPC Handlers
 * 自我进化后端存储层
 *
 * 借鉴三大顶级项目：
 *
 * 1. Reflexion（NeurIPS 2023）— 失败反思闭环
 *    evolve.reflect.save / evolve.reflect.list
 *    每次任务结束后保存反思，下次运行时自动注入历史教训。
 *    实测：AlfWorld 任务准确率从 ~30% → ~90%（迭代12轮）
 *
 * 2. Voyager（NVIDIA）— 技能库自增长
 *    evolve.skill.save / evolve.skill.list
 *    成功完成任务后将解决方案压缩为"技能"，后续复用。
 *    技能库越用越丰富，无需重复发明轮子。
 *
 * 3. DSPy/TextGrad 文本梯度方向（轻量实现）
 *    evolve.reflect.list 返回最近失败反思摘要，
 *    可通过 before_prompt_build 钩子注入到 system prompt，
 *    从而实现基于历史表现的动态 prompt 调整。
 *
 * 存储路径：
 *   {stateDir}/self-evolve/{agentId}/reflections.json
 *   {stateDir}/self-evolve/{agentId}/skills.json
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// ============================================================================
// 类型定义
// ============================================================================

type ReflectionOutcome = "success" | "partial" | "failure";
type SkillCategory = "workflow" | "code" | "strategy" | "template";

interface ReflectionEntry {
  id: string;
  agentId?: string;
  taskSummary: string;
  outcome: ReflectionOutcome;
  reflection: string;
  lessons: string[];
  tags: string[];
  createdAt: number;
}

interface SkillEntry {
  id: string;
  agentId?: string;
  name: string;
  description: string;
  content: string;
  category: SkillCategory;
  triggers: string[];
  tags: string[];
  usageCount: number;
  createdAt: number;
  lastUsedAt?: number;
}

interface ReflectionStore {
  version: 1;
  entries: ReflectionEntry[];
}

interface SkillStore {
  version: 1;
  entries: SkillEntry[];
}

// ============================================================================
// 存储层
// ============================================================================

function resolveEvolveDir(agentId?: string): string {
  const stateDir = resolveStateDir(process.env);
  const base = path.join(stateDir, "self-evolve");
  return agentId ? path.join(base, agentId) : path.join(base, "_global");
}

function resolveReflectionsFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "reflections.json");
}

function resolveSkillsFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "skills.json");
}

function loadJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw) as T;
    }
  } catch {
    // 文件损坏时重置
  }
  return defaultValue;
}

function saveJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// 技能相似度匹配（简单关键词匹配，用于技能检索）
// ============================================================================

function skillMatchesQuery(skill: SkillEntry, query: string): boolean {
  if (!query.trim()) {
    return true;
  }
  const q = query.toLowerCase();
  const tokens = q.match(/[\u4e00-\u9fff]|[a-z0-9]+/g) ?? [];
  if (tokens.length === 0) {
    return true;
  }

  const searchText = [skill.name, skill.description, ...skill.triggers, ...skill.tags]
    .join(" ")
    .toLowerCase();

  // 至少有一半的查询词命中
  const matches = tokens.filter((t) => searchText.includes(t));
  return matches.length >= Math.ceil(tokens.length / 2);
}

// ============================================================================
// RPC Handlers
// ============================================================================

export const evolveRpc: GatewayRequestHandlers = {
  /**
   * evolve.reflect.save — 保存一条运行反思（Reflexion）
   */
  "evolve.reflect.save": async ({ params, respond }) => {
    try {
      const taskSummary = params?.taskSummary ? String(params.taskSummary).trim() : "";
      const reflection = params?.reflection ? String(params.reflection).trim() : "";
      if (!taskSummary || !reflection) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "taskSummary and reflection are required"),
        );
        return;
      }

      const outcome = (
        params?.outcome && ["success", "partial", "failure"].includes(String(params.outcome))
          ? String(params.outcome)
          : "partial"
      ) as ReflectionOutcome;

      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const lessons = Array.isArray(params?.lessons) ? params.lessons.map(String) : [];
      const tags = Array.isArray(params?.tags) ? params.tags.map(String) : [];

      const filePath = resolveReflectionsFile(agentId);
      const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });

      const id = genId("ref");
      const entry: ReflectionEntry = {
        id,
        agentId,
        taskSummary,
        outcome,
        reflection,
        lessons,
        tags,
        createdAt: params?.createdAt ? Number(params.createdAt) : Date.now(),
      };

      store.entries.push(entry);

      // 保留最近 200 条反思，按时间倒序截断
      if (store.entries.length > 200) {
        store.entries = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 200);
      }

      saveJson(filePath, store);
      respond(true, { id, action: "added", outcome }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.reflect.save failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.reflect.list — 列出历史反思
   * 支持按 outcome 过滤，按 limit 截断，按时间倒序
   */
  "evolve.reflect.list": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const filterOutcome = params?.outcome ? String(params.outcome) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 50) : 10;

      const filePath = resolveReflectionsFile(agentId);
      const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });

      let entries = store.entries;
      if (filterOutcome) {
        entries = entries.filter((e) => e.outcome === filterOutcome);
      }

      const sorted = entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, limit);

      respond(
        true,
        {
          entries: sorted,
          total: entries.length,
          returned: sorted.length,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.reflect.list failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.skill.save — 保存一个可复用技能（Voyager）
   * 按技能名去重：同名技能更新内容而非重复插入
   */
  "evolve.skill.save": async ({ params, respond }) => {
    try {
      const name = params?.name ? String(params.name).trim() : "";
      const description = params?.description ? String(params.description).trim() : "";
      const content = params?.content ? String(params.content).trim() : "";

      if (!name || !description || !content) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "name, description, and content are required"),
        );
        return;
      }

      const category = (
        params?.category &&
        ["workflow", "code", "strategy", "template"].includes(String(params.category))
          ? String(params.category)
          : "workflow"
      ) as SkillCategory;

      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const triggers = Array.isArray(params?.triggers) ? params.triggers.map(String) : [];
      const tags = Array.isArray(params?.tags) ? params.tags.map(String) : [];

      const filePath = resolveSkillsFile(agentId);
      const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });

      // 按名称去重：同名技能直接更新
      const existingIdx = store.entries.findIndex(
        (e) => e.name.toLowerCase() === name.toLowerCase(),
      );

      if (existingIdx !== -1) {
        const existing = store.entries[existingIdx];
        if (existing) {
          existing.description = description;
          existing.content = content;
          existing.category = category;
          existing.triggers = Array.from(new Set([...existing.triggers, ...triggers]));
          existing.tags = Array.from(new Set([...existing.tags, ...tags]));
          store.entries[existingIdx] = existing;
          saveJson(filePath, store);
          respond(true, { id: existing.id, action: "updated" }, undefined);
          return;
        }
      }

      // 新增
      const id = genId("skill");
      const entry: SkillEntry = {
        id,
        agentId,
        name,
        description,
        content,
        category,
        triggers,
        tags,
        usageCount: 0,
        createdAt: params?.createdAt ? Number(params.createdAt) : Date.now(),
      };

      store.entries.push(entry);
      saveJson(filePath, store);
      respond(true, { id, action: "added" }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.skill.save failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.skill.list — 检索技能库（Voyager 技能召回）
   * 支持按 category 过滤、query 关键词匹配
   */
  "evolve.skill.list": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const filterCategory = params?.category ? String(params.category) : undefined;
      const query = params?.query ? String(params.query) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 50) : 10;

      const filePath = resolveSkillsFile(agentId);
      const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });

      let skills = store.entries;

      if (filterCategory) {
        skills = skills.filter((s) => s.category === filterCategory);
      }

      if (query) {
        skills = skills.filter((s) => skillMatchesQuery(s, query));
      }

      // 按使用次数 + 最近使用时间排序（最有价值的技能优先）
      const sorted = skills
        .toSorted((a, b) => {
          const scoreA = a.usageCount * 10 + (a.lastUsedAt ?? a.createdAt) / 1e10;
          const scoreB = b.usageCount * 10 + (b.lastUsedAt ?? b.createdAt) / 1e10;
          return scoreB - scoreA;
        })
        .slice(0, limit);

      respond(
        true,
        {
          skills: sorted,
          total: skills.length,
          returned: sorted.length,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.skill.list failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.skill.use — 记录技能被使用（更新 usageCount + lastUsedAt）
   * 技能召回时由钩子自动调用，无需 Agent 手动触发
   */
  "evolve.skill.use": async ({ params, respond }) => {
    try {
      const skillId = params?.skillId ? String(params.skillId) : "";
      if (!skillId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skillId is required"));
        return;
      }

      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const filePath = resolveSkillsFile(agentId);
      const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });

      const idx = store.entries.findIndex((e) => e.id === skillId);
      if (idx === -1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Skill "${skillId}" not found`),
        );
        return;
      }

      const skill = store.entries[idx];
      if (skill) {
        skill.usageCount += 1;
        skill.lastUsedAt = Date.now();
        store.entries[idx] = skill;
        saveJson(filePath, store);
      }

      respond(true, { skillId, usageCount: store.entries[idx]?.usageCount }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.skill.use failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.stats — 自我进化统计概览
   */
  "evolve.stats": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;

      const reflFile = resolveReflectionsFile(agentId);
      const skillFile = resolveSkillsFile(agentId);

      const reflStore = loadJson<ReflectionStore>(reflFile, { version: 1, entries: [] });
      const skillStore = loadJson<SkillStore>(skillFile, { version: 1, entries: [] });

      const reflByOutcome = { success: 0, partial: 0, failure: 0 };
      for (const r of reflStore.entries) {
        reflByOutcome[r.outcome] = (reflByOutcome[r.outcome] ?? 0) + 1;
      }

      const skillByCategory = { workflow: 0, code: 0, strategy: 0, template: 0 };
      for (const s of skillStore.entries) {
        skillByCategory[s.category] = (skillByCategory[s.category] ?? 0) + 1;
      }

      respond(
        true,
        {
          agentId,
          reflections: {
            total: reflStore.entries.length,
            byOutcome: reflByOutcome,
          },
          skills: {
            total: skillStore.entries.length,
            byCategory: skillByCategory,
            topUsed: skillStore.entries
              .toSorted((a, b) => b.usageCount - a.usageCount)
              .slice(0, 5)
              .map((s) => ({ id: s.id, name: s.name, usageCount: s.usageCount })),
          },
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.stats failed: ${String(err)}`),
      );
    }
  },
};

// ============================================================================
// 供插件钩子直接调用的辅助函数（不走 RPC，直接读写文件）
// ============================================================================

/**
 * 获取最近 N 条反思摘要（用于 before_prompt_build 注入）
 * 返回简洁的摘要文本，不返回完整 JSON
 */
export function getRecentReflectionsSummary(agentId: string | undefined, limit = 5): string {
  try {
    const filePath = resolveReflectionsFile(agentId);
    const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });
    if (store.entries.length === 0) {
      return "";
    }

    const recent = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, limit);

    const lines = recent.map((r) => {
      const outcomeEmoji = r.outcome === "success" ? "✓" : r.outcome === "failure" ? "✗" : "~";
      const lessonsText =
        r.lessons.length > 0 ? ` Lessons: ${r.lessons.slice(0, 2).join("; ")}` : "";
      return `${outcomeEmoji} [${r.outcome}] ${r.taskSummary}: ${r.reflection.slice(0, 150)}${lessonsText}`;
    });

    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * 按查询词检索相关技能（用于 before_prompt_build 注入）
 */
export function findRelevantSkills(
  agentId: string | undefined,
  query: string,
  limit = 3,
): SkillEntry[] {
  try {
    const filePath = resolveSkillsFile(agentId);
    const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });
    if (store.entries.length === 0) {
      return [];
    }

    const matched = store.entries.filter((s) => skillMatchesQuery(s, query));
    return matched.toSorted((a, b) => b.usageCount - a.usageCount).slice(0, limit);
  } catch {
    return [];
  }
}
