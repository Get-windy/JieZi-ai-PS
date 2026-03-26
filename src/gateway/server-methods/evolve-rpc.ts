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
import { resolveStateDir } from "../../../upstream/src/config/paths.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";

// ============================================================================
// 类型定义
// ============================================================================

type ReflectionOutcome = "success" | "partial" | "failure";
type SkillCategory = "workflow" | "code" | "strategy" | "template";

/** AgentEvolver P2 细粒度步骤归因：每个关键步骤的执行结果 */
interface StepOutcome {
  /** 步骤简述（工具调用名/动作描述） */
  step: string;
  /** 步骤结果 */
  result: "success" | "failure" | "skipped";
  /** 备注（可选，失败原因/关键发现） */
  note?: string;
}

interface ReflectionEntry {
  id: string;
  agentId?: string;
  taskSummary: string;
  outcome: ReflectionOutcome;
  reflection: string;
  lessons: string[];
  tags: string[];
  /** AgentEvolver P2：细粒度步骤归因（可选） */
  steps?: StepOutcome[];
  createdAt: number;
}

// P1 HyperAgent 性能画像类型

/** 单个任务类型的性能桶 */
interface PerfBucket {
  taskType: string;
  total: number;
  success: number;
  partial: number;
  failure: number;
  /** 最近10次结果（newest last），用于趋势判断 */
  recentOutcomes: Array<"success" | "partial" | "failure">;
  lastRecordedAt: number;
}

interface PerformanceProfile {
  version: 1;
  agentId?: string;
  buckets: Record<string, PerfBucket>;
  updatedAt: number;
}

// P3 GEP 跨 Agent 技能共享

interface SharedSkillEntry {
  /** 来源 Agent ID */
  sourceAgentId?: string;
  sharedAt: number;
  importCount: number;
  id: string;
  name: string;
  description: string;
  content: string;
  category: SkillCategory;
  triggers: string[];
  tags: string[];
  usageCount: number;
  createdAt: number;
  /** FGT: 同本地技能的 stale 逻辑 */
  stale?: boolean;
}

interface SharedSkillStore {
  version: 1;
  entries: SharedSkillEntry[];
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
  /** FGT: 超过阈值未使用且低频则标记为 stale，不再注入 prompt */
  stale?: boolean;
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

function resolvePerfProfileFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "perf_profile.json");
}

function resolveSharedSkillsFile(): string {
  return path.join(resolveEvolveDir("_shared"), "skills.json");
}

function resolveSharedExperienceFile(): string {
  return path.join(resolveEvolveDir("_shared"), "experience.json");
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
// 防重复写入：60s 内同 agentId 不重复触发自动反思
// ============================================================================

const autoReflectCooldown = new Map<string, number>(); // key -> lastWriteTs
const AUTO_REFLECT_COOLDOWN_MS = 60_000; // 60 秒冷却

// ============================================================================
// 内部工具函数
// ============================================================================

/** 推断任务类型（用于性能画像桶键），从 taskSummary 简单分类 */
export function inferTaskType(taskSummary: string, tags: string[]): string {
  const text = (taskSummary + " " + tags.join(" ")).toLowerCase();
  const typeMap: Record<string, string> = {
    code: "coding",
    coding: "coding",
    debug: "coding",
    debugging: "coding",
    draft: "writing",
    writing: "writing",
    document: "writing",
    search: "research",
    research: "research",
    analyze: "research",
    analysis: "research",
    data: "data_analysis",
    calculation: "data_analysis",
    plan: "planning",
    planning: "planning",
    schedule: "planning",
    question: "qa",
    qa: "qa",
    answer: "qa",
    translate: "translation",
    translation: "translation",
    summarize: "summarization",
    summary: "summarization",
  };
  for (const [kw, mapped] of Object.entries(typeMap)) {
    if (text.includes(kw)) {
      return mapped;
    }
  }
  return "general";
}

/** 加载性能画像 */
function loadPerfProfile(agentId?: string): PerformanceProfile {
  return loadJson<PerformanceProfile>(resolvePerfProfileFile(agentId), {
    version: 1,
    agentId,
    buckets: {},
    updatedAt: 0,
  });
}

/** 将一次任务结果记录到性能画像 */
function recordPerfOutcome(
  agentId: string | undefined,
  taskType: string,
  outcome: ReflectionOutcome,
): void {
  const profile = loadPerfProfile(agentId);
  const bucket: PerfBucket = profile.buckets[taskType] ?? {
    taskType,
    total: 0,
    success: 0,
    partial: 0,
    failure: 0,
    recentOutcomes: [],
    lastRecordedAt: 0,
  };
  bucket.total += 1;
  bucket[outcome] += 1;
  bucket.recentOutcomes.push(outcome);
  if (bucket.recentOutcomes.length > 10) {
    bucket.recentOutcomes = bucket.recentOutcomes.slice(-10);
  }
  bucket.lastRecordedAt = Date.now();
  profile.buckets[taskType] = bucket;
  profile.updatedAt = Date.now();
  saveJson(resolvePerfProfileFile(agentId), profile);
}

// ============================================================================
// FGT 技能遗忘/衰减（Self-Evolving Agents Survey: Forgetting 指标）
// 策略：超过 SKILL_STALE_DAYS 天未使用 且 usageCount < SKILL_STALE_MIN_USAGE 则标记 stale
// stale 技能不再注入 prompt，但保留存储（可通过 evolve.skill.list?includeStale=true 查看）
// ============================================================================

const SKILL_STALE_DAYS = 60; // 60 天未用
const SKILL_STALE_MIN_USAGE = 3; // usageCount 低于 3 次视为低价值

/**
 * pruneStaleSkills — 标记过期低频技能为 stale（不删除，保留可恢复性）
 * 在 autoSaveReflection 时顺带触发，任务粒度定期清理。
 */
function pruneStaleSkills(agentId: string | undefined): void {
  try {
    const filePath = resolveSkillsFile(agentId);
    const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });
    if (store.entries.length === 0) {
      return;
    }
    const threshold = Date.now() - SKILL_STALE_DAYS * 24 * 60 * 60 * 1000;
    let changed = false;
    for (const skill of store.entries) {
      const lastActive = skill.lastUsedAt ?? skill.createdAt;
      const shouldBeStale = lastActive < threshold && skill.usageCount < SKILL_STALE_MIN_USAGE;
      if (shouldBeStale && !skill.stale) {
        skill.stale = true;
        changed = true;
      } else if (!shouldBeStale && skill.stale) {
        // 若技能最近被重新使用，撤销 stale 标记
        skill.stale = false;
        changed = true;
      }
    }
    if (changed) {
      saveJson(filePath, store);
    }
  } catch {
    /* 清理失败不影响主流程 */
  }
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

      // P2 AgentEvolver: 细粒度步骤归因
      const steps: StepOutcome[] = Array.isArray(params?.steps)
        ? (params.steps as unknown[]).flatMap((s) => {
            if (!s || typeof s !== "object") {
              return [];
            }
            const so = s as Record<string, unknown>;
            const stepStr = so.step ? String(so.step).trim() : "";
            if (!stepStr) {
              return [];
            }
            const validResults = ["success", "failure", "skipped"];
            const result = validResults.includes(String(so.result ?? ""))
              ? (String(so.result) as StepOutcome["result"])
              : "success";
            const note = so.note ? String(so.note).slice(0, 200) : undefined;
            const entry: StepOutcome = { step: stepStr, result };
            if (note) {
              entry.note = note;
            }
            return [entry];
          })
        : [];

      const filePath = resolveReflectionsFile(agentId);
      const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });

      const now = Date.now();
      const id = genId("ref");
      const entry: ReflectionEntry = {
        id,
        agentId,
        taskSummary,
        outcome,
        reflection,
        lessons,
        tags,
        ...(steps.length > 0 ? { steps } : {}),
        createdAt: params?.createdAt ? Number(params.createdAt) : now,
      };

      store.entries.push(entry);

      // 保留最近 200 条反思，按时间倒序截断
      if (store.entries.length > 200) {
        store.entries = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 200);
      }

      saveJson(filePath, store);

      // P1 HyperAgent: 同步记录到性能画像
      try {
        const taskType = inferTaskType(taskSummary, tags);
        recordPerfOutcome(agentId, taskType, outcome);
      } catch {
        /* 性能画像写入失败不影响主流程 */
      }

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
      // FGT: includeStale=true 时返回包含 stale 技能（默认不返回）
      const includeStale = params?.includeStale === true;

      const filePath = resolveSkillsFile(agentId);
      const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });

      let skills = store.entries;

      if (!includeStale) {
        skills = skills.filter((s) => !s.stale);
      }

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
   * evolve.perf.record — 手动记录一次性能数据（HyperAgent P1）
   */
  "evolve.perf.record": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const taskSummary = params?.taskSummary ? String(params.taskSummary).trim() : "";
      const outcome = (
        params?.outcome && ["success", "partial", "failure"].includes(String(params.outcome))
          ? String(params.outcome)
          : "partial"
      ) as ReflectionOutcome;
      const tags = Array.isArray(params?.tags) ? params.tags.map(String) : [];
      const taskType = params?.taskType
        ? String(params.taskType).slice(0, 50)
        : inferTaskType(taskSummary, tags);
      recordPerfOutcome(agentId, taskType, outcome);
      respond(true, { taskType, outcome, recorded: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.perf.record failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.perf.get — 获取完整性能画像（HyperAgent P1）
   */
  "evolve.perf.get": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const profile = loadPerfProfile(agentId);
      const summary = Object.values(profile.buckets)
        .map((b) => {
          const successRate = b.total > 0 ? Math.round((b.success / b.total) * 100) : 0;
          const recent = b.recentOutcomes.slice(-5);
          const older = b.recentOutcomes.slice(0, -5);
          const recentSucc = recent.filter((o) => o === "success").length;
          const olderSucc = older.filter((o) => o === "success").length;
          const recentRate =
            recent.length > 0 ? Math.round((recentSucc / recent.length) * 100) : successRate;
          const olderRate =
            older.length > 0 ? Math.round((olderSucc / older.length) * 100) : successRate;
          return {
            taskType: b.taskType,
            total: b.total,
            successRate,
            recentRate,
            trend: recentRate - olderRate,
            lastRecordedAt: b.lastRecordedAt,
          };
        })
        .toSorted((a, b) => b.total - a.total);
      respond(true, { agentId, profile, summary }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.perf.get failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.skill.share — GEP 技能共享：将本 Agent 技能推送到全局共享库（P3）
   */
  "evolve.skill.share": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const skillId = params?.skillId ? String(params.skillId) : "";
      if (!skillId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skillId is required"));
        return;
      }
      const localStore = loadJson<SkillStore>(resolveSkillsFile(agentId), {
        version: 1,
        entries: [],
      });
      const skill = localStore.entries.find((e) => e.id === skillId);
      if (!skill) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Skill "${skillId}" not found in local library`),
        );
        return;
      }
      const sharedStore = loadJson<SharedSkillStore>(resolveSharedSkillsFile(), {
        version: 1,
        entries: [],
      });
      const existingIdx = sharedStore.entries.findIndex(
        (e) => e.name.toLowerCase() === skill.name.toLowerCase(),
      );
      const now = Date.now();
      if (existingIdx !== -1) {
        const existing = sharedStore.entries[existingIdx];
        if (existing) {
          existing.description = skill.description;
          existing.content = skill.content;
          existing.category = skill.category;
          existing.triggers = Array.from(new Set([...existing.triggers, ...skill.triggers]));
          existing.tags = Array.from(new Set([...existing.tags, ...skill.tags]));
          existing.sharedAt = now;
          sharedStore.entries[existingIdx] = existing;
          saveJson(resolveSharedSkillsFile(), sharedStore);
          respond(true, { skillId, name: skill.name, action: "updated", sharedAt: now }, undefined);
          return;
        }
      }
      const sharedEntry: SharedSkillEntry = {
        ...skill,
        sourceAgentId: agentId,
        sharedAt: now,
        importCount: 0,
      };
      sharedStore.entries.push(sharedEntry);
      if (sharedStore.entries.length > 500) {
        sharedStore.entries = sharedStore.entries
          .toSorted((a, b) => b.usageCount - a.usageCount)
          .slice(0, 500);
      }
      saveJson(resolveSharedSkillsFile(), sharedStore);
      respond(true, { skillId, name: skill.name, action: "shared", sharedAt: now }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.skill.share failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.skill.import — GEP 技能导入：从全局共享库导入到本地（P3）
   */
  "evolve.skill.import": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const skillId = params?.skillId ? String(params.skillId) : "";
      if (!skillId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skillId is required"));
        return;
      }
      const sharedStore = loadJson<SharedSkillStore>(resolveSharedSkillsFile(), {
        version: 1,
        entries: [],
      });
      const shared = sharedStore.entries.find((e) => e.id === skillId);
      if (!shared) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Shared skill "${skillId}" not found`),
        );
        return;
      }
      const localStore = loadJson<SkillStore>(resolveSkillsFile(agentId), {
        version: 1,
        entries: [],
      });
      const existingIdx = localStore.entries.findIndex(
        (e) => e.name.toLowerCase() === shared.name.toLowerCase(),
      );
      if (existingIdx !== -1) {
        respond(true, { skillId, name: shared.name, action: "already_exists" }, undefined);
        return;
      }
      const now = Date.now();
      const localEntry: SkillEntry = {
        id: genId("skill"),
        agentId,
        name: shared.name,
        description: shared.description,
        content: shared.content,
        category: shared.category,
        triggers: shared.triggers,
        tags: [...shared.tags, "imported"],
        usageCount: 0,
        createdAt: now,
      };
      localStore.entries.push(localEntry);
      saveJson(resolveSkillsFile(agentId), localStore);
      // 更新全局库 importCount
      const sharedIdx = sharedStore.entries.findIndex((e) => e.id === skillId);
      if (sharedIdx !== -1) {
        const s = sharedStore.entries[sharedIdx];
        if (s) {
          s.importCount += 1;
          sharedStore.entries[sharedIdx] = s;
        }
        saveJson(resolveSharedSkillsFile(), sharedStore);
      }
      respond(
        true,
        { skillId: localEntry.id, name: shared.name, action: "imported", importedAt: now },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.skill.import failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.skill.list.shared — 列出全局共享技能库（P3）
   */
  "evolve.skill.list.shared": async ({ params, respond }) => {
    try {
      const query = params?.query ? String(params.query) : undefined;
      const filterCategory = params?.category ? String(params.category) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 50) : 10;
      const sharedStore = loadJson<SharedSkillStore>(resolveSharedSkillsFile(), {
        version: 1,
        entries: [],
      });
      let skills = sharedStore.entries;
      if (filterCategory) {
        skills = skills.filter((s) => s.category === filterCategory);
      }
      if (query) {
        skills = skills.filter((s) => skillMatchesQuery(s as unknown as SkillEntry, query));
      }
      const sorted = skills
        .toSorted((a, b) => b.usageCount + b.importCount * 2 - (a.usageCount + a.importCount * 2))
        .slice(0, limit)
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          triggers: s.triggers,
          tags: s.tags,
          sourceAgentId: s.sourceAgentId,
          importCount: s.importCount,
          usageCount: s.usageCount,
          sharedAt: s.sharedAt,
        }));
      respond(true, { skills: sorted, total: skills.length, returned: sorted.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.skill.list.shared failed: ${String(err)}`),
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
          performanceProfile: (() => {
            const profile = loadPerfProfile(agentId);
            const buckets = Object.values(profile.buckets)
              .toSorted((a, b) => b.total - a.total)
              .slice(0, 10)
              .map((b) => ({
                taskType: b.taskType,
                total: b.total,
                successRate: b.total > 0 ? Math.round((b.success / b.total) * 100) : 0,
              }));
            return { buckets, updatedAt: profile.updatedAt };
          })(),
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
 * autoSaveReflection — 由 agent_end 钩子直接调用，无需走 RPC
 *
 * - 60s 冷却：同一 agentId 在冷却期内不重复写入，避免同一次任务多次触发
 * - 自动判断 outcome：通过 event.success 字段
 * - 自动生成简洁摘要：提取首条 user 消息作为 taskSummary
 */
export function autoSaveReflection(params: {
  agentId: string | undefined;
  taskSummary: string;
  outcome: ReflectionOutcome;
  reflection: string;
  lessons?: string[];
  durationMs?: number;
  /** P2 AgentEvolver 细粒度步骤归因（自动从 tool_calls 提取） */
  steps?: StepOutcome[];
}): void {
  try {
    const key = params.agentId ?? "_global";
    const now = Date.now();
    const lastWrite = autoReflectCooldown.get(key) ?? 0;
    if (now - lastWrite < AUTO_REFLECT_COOLDOWN_MS) {
      // 冷却中，跳过
      return;
    }
    autoReflectCooldown.set(key, now);

    const filePath = resolveReflectionsFile(params.agentId);
    const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });

    const id = genId("ref");
    const entry: ReflectionEntry = {
      id,
      agentId: params.agentId,
      taskSummary: params.taskSummary.slice(0, 300),
      outcome: params.outcome,
      reflection: params.reflection.slice(0, 1000),
      lessons: (params.lessons ?? []).slice(0, 3),
      tags: ["auto"],
      ...(params.steps && params.steps.length > 0 ? { steps: params.steps.slice(0, 20) } : {}),
      createdAt: now,
    };

    store.entries.push(entry);

    // 保留最近 200 条，按时间倒序截断
    if (store.entries.length > 200) {
      store.entries = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 200);
    }

    saveJson(filePath, store);

    // P1 HyperAgent: 同步更新性能画像
    try {
      const taskType = inferTaskType(params.taskSummary, []);
      recordPerfOutcome(params.agentId, taskType, params.outcome);
    } catch {
      /* 不影响主流程 */
    }

    // FGT: 顺带标记过期技能（任务粒度定期清理，无需单独定时器）
    try {
      pruneStaleSkills(params.agentId);
    } catch {
      /* 不影响主流程 */
    }
  } catch {
    // 自动反思写失败不应影响主流程
  }
}

/**
 * 获取最近 N 条反思摘要（用于 before_prompt_build 注入）
 * 优先返回 failure/partial（更有学习价值），其次 success
 * 返回简洁的摘要文本，不返回完整 JSON
 */
export function getRecentReflectionsSummary(agentId: string | undefined, limit = 5): string {
  try {
    const filePath = resolveReflectionsFile(agentId);
    const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });
    if (store.entries.length === 0) {
      return "";
    }

    // 优先 failure/partial（最有学习价值），不足时补 success
    const sorted = store.entries.toSorted((a, b) => b.createdAt - a.createdAt);
    const failures = sorted.filter((r) => r.outcome === "failure" || r.outcome === "partial");
    const successes = sorted.filter((r) => r.outcome === "success");
    // 失败优先：最多取 ceil(limit*0.7) 条失败，剩余补成功
    const failLimit = Math.ceil(limit * 0.7);
    const picked = [
      ...failures.slice(0, failLimit),
      ...successes.slice(0, limit - Math.min(failures.length, failLimit)),
    ].slice(0, limit);

    const lines = picked.map((r) => {
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
    // FGT: 不注入 stale 技能
    const active = store.entries.filter((s) => !s.stale);
    const matched = active.filter((s) => skillMatchesQuery(s, query));
    return matched.toSorted((a, b) => b.usageCount - a.usageCount).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * updateSkillUsageCount — 技能被注入时直接更新使用计数（不走 RPC）
 */
export function updateSkillUsageCount(agentId: string | undefined, skillId: string): void {
  try {
    const filePath = resolveSkillsFile(agentId);
    const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });
    const idx = store.entries.findIndex((e) => e.id === skillId);
    if (idx === -1) {
      return;
    }
    const skill = store.entries[idx];
    if (skill) {
      skill.usageCount += 1;
      skill.lastUsedAt = Date.now();
      store.entries[idx] = skill;
      saveJson(filePath, store);
    }
  } catch {
    // 更新失败不影响主流程
  }
}

/**
 * getTaskTypePerfScore — C3 自适应课程用
 * 返回给定任务汇总摘要的对应任务类型成功率 (0~1)。
 * 样本数不足时返回 null（无法判断）。
 */
export function getTaskTypePerfScore(
  agentId: string | undefined,
  taskSummary: string,
): { taskType: string; successRate: number; total: number } | null {
  try {
    const taskType = inferTaskType(taskSummary, []);
    const profile = loadPerfProfile(agentId);
    const bucket = profile.buckets[taskType];
    if (!bucket || bucket.total < 3) {
      return null;
    } // 样本不足，不做调整
    return {
      taskType,
      successRate: bucket.success / bucket.total,
      total: bucket.total,
    };
  } catch {
    return null;
  }
}

export function getPerformanceSelfAwareness(agentId: string | undefined): string {
  try {
    const profile = loadPerfProfile(agentId);
    if (Object.keys(profile.buckets).length === 0) {
      return "";
    }

    const lines: string[] = [];
    const buckets = Object.values(profile.buckets)
      .filter((b) => b.total >= 3) // 样本数不足时不提示
      .toSorted((a, b) => b.total - a.total)
      .slice(0, 6);

    if (buckets.length === 0) {
      return "";
    }

    for (const b of buckets) {
      const rate = b.total > 0 ? Math.round((b.success / b.total) * 100) : 0;
      // 趋势计算
      const recent = b.recentOutcomes.slice(-5);
      const older = b.recentOutcomes.slice(0, -5);
      const recentRate =
        recent.length > 0
          ? Math.round((recent.filter((o) => o === "success").length / recent.length) * 100)
          : rate;
      const olderRate =
        older.length > 0
          ? Math.round((older.filter((o) => o === "success").length / older.length) * 100)
          : rate;
      const trend = recentRate - olderRate;
      const trendStr = trend > 10 ? " (上升趋势↑)" : trend < -10 ? " (下降趋势↓, 请特别注意)" : "";
      const warning = rate < 60 ? " ⚠ 此类任务需要额外谨慎" : "";
      lines.push(`• ${b.taskType}: 成功率 ${rate}%（${b.total} 次任务）${trendStr}${warning}`);
    }

    if (lines.length === 0) {
      return "";
    }
    return `你的历史任务性能画像（基于过往反思）：\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

/**
 * findRelevantSharedSkills — P3 GEP 全局技能库 fallback
 * 当本地技能库为空或匹配不足时，从全局共享库补充
 */
export function findRelevantSharedSkills(
  query: string,
  excludeNames: Set<string>,
  limit = 2,
): SkillEntry[] {
  try {
    const sharedStore = loadJson<SharedSkillStore>(resolveSharedSkillsFile(), {
      version: 1,
      entries: [],
    });
    if (sharedStore.entries.length === 0) {
      return [];
    }
    const matched = sharedStore.entries
      .filter((s) => !s.stale) // FGT: 共享库也过滤 stale
      .filter((s) => !excludeNames.has(s.name.toLowerCase()))
      .filter((s) => skillMatchesQuery(s as unknown as SkillEntry, query));
    return matched
      .toSorted((a, b) => b.usageCount + b.importCount * 2 - (a.usageCount + a.importCount * 2))
      .slice(0, limit)
      .map(
        (s) =>
          ({
            id: s.id,
            agentId: s.sourceAgentId,
            name: s.name,
            description: s.description,
            content: s.content,
            category: s.category,
            triggers: s.triggers,
            tags: s.tags,
            usageCount: s.usageCount,
            createdAt: s.createdAt,
          }) satisfies SkillEntry,
      );
  } catch {
    return [];
  }
}

// ============================================================================
// CER — Contextual Experience Replay (ACL 2025, Liu et al.)
// 实现要点：
//   1. 将完整轨迹（tool_call 序列 + 结果）压缩为可检索的案例存入 experience.json
//   2. 新任务执行前按 prompt 相关性检索历史失败案例注入 context
//   3. 子串匹配（无需向量模型），运行时免测，tokenless overhead
// ============================================================================

/** 单条经验条目（CER 动态记忆缓冲区单元） */
export interface ExperienceEntry {
  id: string;
  agentId?: string;
  /** 任务类型标签（用于检索分丫） */
  taskType: string;
  /** 任务简述 */
  taskSummary: string;
  /** 执行结果 */
  outcome: ReflectionOutcome;
  /** 工具调用轨迹（压缩，最多 10 条） */
  toolTrace: Array<{ tool: string; result: "ok" | "err" | "skip"; note?: string }>;
  /** 关键教训（失败时自动提取） */
  lesson: string;
  /** 匹配关键词（用于无向量引擎地检索） */
  keywords: string[];
  createdAt: number;
  /** 被检索并注入的次数 */
  replayCount: number;
}

interface ExperienceStore {
  version: 1;
  entries: ExperienceEntry[];
}

function resolveExperienceFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "experience.json");
}

/** 从任务摘要中自动提取匹配关键词 */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  // 提取中文词组（双字 bi-gram）+ 英文单词
  const cjk = lower.match(/[\u4e00-\u9fff]{2,6}/g) ?? [];
  const eng = lower.match(/[a-z]{3,}/g) ?? [];
  const stopwords = new Set(["the", "and", "for", "this", "that", "with", "from", "have", "will"]);
  return [...new Set([...cjk, ...eng.filter((w) => !stopwords.has(w))])].slice(0, 20);
}

/** 计算两个关键词集合的 Jaccard 相似度 */
function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const k of setA) {
    if (setB.has(k)) {
      intersection++;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** 将一条经验写入经验库（直接调用，不走 RPC）
 * fgt3: 失败经验自动同步写入全局共享经验库（_shared/experience.json）
 */
export function saveExperienceEntry(params: {
  agentId: string | undefined;
  taskSummary: string;
  outcome: ReflectionOutcome;
  toolTrace: ExperienceEntry["toolTrace"];
  lesson: string;
  taskType?: string;
}): void {
  try {
    if (!params.taskSummary.trim() || params.taskSummary.length < 5) {
      return;
    }
    const keywords = extractKeywords(params.taskSummary);
    if (keywords.length === 0) {
      return;
    }
    const now = Date.now();
    const taskType = params.taskType ?? inferTaskType(params.taskSummary, []);
    const entry: ExperienceEntry = {
      id: genId("exp"),
      agentId: params.agentId,
      taskType,
      taskSummary: params.taskSummary.slice(0, 200),
      outcome: params.outcome,
      toolTrace: params.toolTrace.slice(0, 10),
      lesson: params.lesson.slice(0, 300),
      keywords,
      createdAt: now,
      replayCount: 0,
    };
    // 写入本地经验库
    const filePath = resolveExperienceFile(params.agentId);
    const store = loadJson<ExperienceStore>(filePath, { version: 1, entries: [] });
    store.entries.push(entry);
    // 保留最近 500 条，失败优先
    if (store.entries.length > 500) {
      const failures = store.entries.filter((e) => e.outcome !== "success");
      const successes = store.entries.filter((e) => e.outcome === "success");
      store.entries = [
        ...failures.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 350),
        ...successes.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 150),
      ];
    }
    saveJson(filePath, store);

    // fgt3: 失败/partial 经验自动同步写入全局共享经验库
    // 让其他 Agent 在遇到相似问题时可以参考
    if (params.outcome !== "success") {
      try {
        const sharedExpFile = resolveSharedExperienceFile();
        const sharedStore = loadJson<ExperienceStore>(sharedExpFile, { version: 1, entries: [] });
        sharedStore.entries.push(entry);
        // 全局经验库保留最近 1000 条（全局类型多）
        if (sharedStore.entries.length > 1000) {
          sharedStore.entries = sharedStore.entries
            .toSorted((a, b) => b.createdAt - a.createdAt)
            .slice(0, 1000);
        }
        saveJson(sharedExpFile, sharedStore);
      } catch {
        /* 全局库写入失败不影响本地 */
      }
    }
  } catch {
    /* 写入失败不影响主流程 */
  }
}

/**
 * queryRelevantExperiences — CER 核心：按关键词相似度检索相关历史经验
 * fgt3: 优先本地经验库，本地不足 limit 时自动 fallback 全局共享经验库
 */
export function queryRelevantExperiences(
  agentId: string | undefined,
  prompt: string,
  opts?: { limit?: number; failureOnly?: boolean },
): ExperienceEntry[] {
  try {
    const limit = opts?.limit ?? 3;
    const failureOnly = opts?.failureOnly ?? false;
    const queryKws = extractKeywords(prompt);
    if (queryKws.length === 0) {
      return [];
    }

    const scoreEntries = (
      entries: ExperienceEntry[],
    ): Array<{ entry: ExperienceEntry; score: number }> => {
      let candidates = failureOnly ? entries.filter((e) => e.outcome !== "success") : entries;
      return candidates
        .map((e) => ({ entry: e, score: keywordSimilarity(queryKws, e.keywords) }))
        .filter((x) => x.score > 0.1)
        .map((x) => ({ ...x, score: x.score + (x.entry.outcome !== "success" ? 0.05 : 0) }));
    };

    // 先查本地经验库
    const localFile = resolveExperienceFile(agentId);
    const localStore = loadJson<ExperienceStore>(localFile, { version: 1, entries: [] });
    const localScored = scoreEntries(localStore.entries)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, limit);

    if (localScored.length >= limit) {
      return localScored.map((x) => x.entry);
    }

    // fgt3: 本地不足时 fallback 全局共享经验库
    const remaining = limit - localScored.length;
    const localIds = new Set(localScored.map((x) => x.entry.id));
    try {
      const sharedFile = resolveSharedExperienceFile();
      const sharedStore = loadJson<ExperienceStore>(sharedFile, { version: 1, entries: [] });
      const sharedScored = scoreEntries(sharedStore.entries)
        .filter((x) => !localIds.has(x.entry.id)) // 去重
        .toSorted((a, b) => b.score - a.score)
        .slice(0, remaining);
      return [...localScored.map((x) => x.entry), ...sharedScored.map((x) => x.entry)];
    } catch {
      return localScored.map((x) => x.entry);
    }
  } catch {
    return [];
  }
}

/**
 * getFailurePatternsText — 将检索到的失败经验格式化为可注入文本
 */
export function getFailurePatternsText(
  agentId: string | undefined,
  prompt: string,
  limit = 3,
): string {
  try {
    const experiences = queryRelevantExperiences(agentId, prompt, { limit, failureOnly: false });
    const failures = experiences.filter((e) => e.outcome !== "success");
    if (failures.length === 0) {
      return "";
    }
    const lines = failures.map((e, idx) => {
      const traceStr =
        e.toolTrace.length > 0
          ? e.toolTrace.map((t) => `${t.tool}(${t.result})`).join(" → ")
          : "(no tool trace)";
      return `${idx + 1}. [失败案例] ${e.taskSummary}\n   工具轨迹: ${traceStr}\n   教训: ${e.lesson}`;
    });
    return `相似任务的历史失败模式（避免重蹈覆辙）：\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// CER RPC handlers 平时已内嵌到 evolveRpc 中，这里添加两个预留接口以备使用
export const experienceRpcHandlers: {
  "evolve.exp.save": (typeof evolveRpc)["evolve.reflect.save"];
  "evolve.exp.query": (typeof evolveRpc)["evolve.reflect.list"];
} = {
  "evolve.exp.save": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const taskSummary = params?.taskSummary ? String(params.taskSummary).trim() : "";
      if (!taskSummary) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "taskSummary is required"),
        );
        return;
      }
      const outcome = (
        ["success", "partial", "failure"].includes(String(params?.outcome ?? ""))
          ? String(params.outcome)
          : "partial"
      ) as ReflectionOutcome;
      const lesson = params?.lesson ? String(params.lesson).trim() : "";
      const rawTrace = Array.isArray(params?.toolTrace) ? params.toolTrace : [];
      const toolTrace = (rawTrace as unknown[]).flatMap((t) => {
        if (!t || typeof t !== "object") {
          return [];
        }
        const to = t as Record<string, unknown>;
        const tool = to.tool ? String(to.tool) : "";
        if (!tool) {
          return [];
        }
        const result = ["ok", "err", "skip"].includes(String(to.result ?? ""))
          ? (String(to.result) as "ok" | "err" | "skip")
          : "ok";
        const note = to.note ? String(to.note).slice(0, 100) : undefined;
        const item: ExperienceEntry["toolTrace"][number] = { tool, result };
        if (note) {
          item.note = note;
        }
        return [item];
      });
      saveExperienceEntry({ agentId, taskSummary, outcome, toolTrace, lesson });
      respond(true, { saved: true, taskSummary }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.exp.save failed: ${String(err)}`),
      );
    }
  },
  "evolve.exp.query": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const prompt = params?.prompt ? String(params.prompt) : "";
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 10) : 3;
      const failureOnly = params?.failureOnly === true;
      const entries = queryRelevantExperiences(agentId, prompt, { limit, failureOnly });
      // 更新 replayCount
      if (entries.length > 0) {
        try {
          const filePath = resolveExperienceFile(agentId);
          const store = loadJson<ExperienceStore>(filePath, { version: 1, entries: [] });
          for (const e of entries) {
            const idx = store.entries.findIndex((x) => x.id === e.id);
            if (idx !== -1) {
              const s = store.entries[idx];
              if (s) {
                s.replayCount += 1;
                store.entries[idx] = s;
              }
            }
          }
          saveJson(filePath, store);
        } catch {
          /* 不影响返回结果 */
        }
      }
      respond(true, { entries, total: entries.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.exp.query failed: ${String(err)}`),
      );
    }
  },
};
