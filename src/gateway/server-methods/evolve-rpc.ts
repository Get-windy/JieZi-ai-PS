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
import { groupManager } from "../../sessions/group-manager.js";
import { getGroupsWorkspaceRoot } from "../../utils/project-context.js";

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
// Gap A: 功能需求日志（self-improving-agent FEATURE_REQUESTS 模式）
// ============================================================================

type FeatureRequestStatus = "pending" | "in_progress" | "done" | "wont_fix";
type FeatureRequestPriority = "low" | "medium" | "high" | "critical";

interface FeatureRequestEntry {
  id: string;
  agentId?: string;
  /** 用户希望的能力描述 */
  capability: string;
  /** 用户背景/需求原因 */
  context: string;
  /** 复杂度估计 */
  complexity: "simple" | "medium" | "complex";
  priority: FeatureRequestPriority;
  status: FeatureRequestStatus;
  /** 功能出现次数（相同需求重复提出时累加） */
  recurrenceCount: number;
  /** 关联的 Agent 工具/能力领域 */
  area?: string;
  /** 建议实现方式 */
  suggestedImpl?: string;
  createdAt: number;
  updatedAt: number;
  /** Pattern-Key: 用于跨 session 识别相同模式 e.g. feat.multi-agent-parallel */
  patternKey?: string;
}

interface FeatureRequestStore {
  version: 1;
  entries: FeatureRequestEntry[];
}

// ============================================================================
// Gap C: 进化事件溯源（Evolver events.jsonl 模式）
// ============================================================================

type EvolveEventType =
  | "reflect.save" // 反思保存
  | "skill.save" // 技能保存
  | "skill.update" // 技能更新
  | "feat.save" // 功能需求记录
  | "lesson.promoted" // Gap B：学习晋升到工作区文件
  | "gc.run" // GC 清理运行
  | "strategy.change"; // Gap D：进化策略切换

interface EvolveEvent {
  /** 事件 ID */
  id: string;
  /** 父事件 ID（形成树形溯源链） */
  parentId?: string;
  agentId?: string;
  type: EvolveEventType;
  /** 关联的资产 ID（reflectionId / skillId / featId） */
  assetId?: string;
  /** 事件摘要 */
  summary: string;
  /** 额外元数据 */
  meta?: Record<string, unknown>;
  createdAt: number;
}

// ============================================================================
// Gap D: 进化策略（Evolver EVOLVE_STRATEGY 模式）
// ============================================================================

type EvolveStrategy = "balanced" | "innovate" | "harden" | "repair-only" | "early-stabilize";

interface EvolveStrategyState {
  version: 1;
  agentId?: string;
  current: EvolveStrategy;
  reason: string;
  detectedAt: number;
  /** 最近一次切换前的策略 */
  previous?: EvolveStrategy;
}

// ============================================================================
// Gap E: Ontology 类型化知识图谱
// ============================================================================

interface OntologyEntity {
  id: string;
  type: string;
  agentId?: string;
  properties: Record<string, unknown>;
  /** 关联的其他实体 ID（快速索引） */
  relatedIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface OntologyRelation {
  id: string;
  fromId: string;
  relationType: string;
  toId: string;
  properties?: Record<string, unknown>;
  createdAt: number;
}

/** graph.jsonl 中每行的操作记录（追加式，保留历史） */
type OntologyOp =
  | { op: "create"; entity: OntologyEntity }
  | { op: "update"; id: string; patch: Partial<OntologyEntity>; updatedAt: number }
  | { op: "delete"; id: string; deletedAt: number }
  | { op: "relate"; relation: OntologyRelation }
  | { op: "unrelate"; relationId: string; deletedAt: number };

interface OntologyStore {
  /** 内存中当前实体快照（从 graph.jsonl 重建） */
  entities: Map<string, OntologyEntity>;
  /** 内存中当前关系快照 */
  relations: Map<string, OntologyRelation>;
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

// Gap A
function resolveFeatureRequestsFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "feature_requests.json");
}

// Gap C: 追加式事件日志（jsonl 格式）
function resolveEventsFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "events.jsonl");
}

// Gap D
function resolveStrategyFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "strategy.json");
}

// Gap E: Ontology 图谱文件
function resolveOntologyGraphFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "graph.jsonl");
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
// Gap C: 追加式事件写入（Evolver events.jsonl 模式）
// ============================================================================

function appendEvolveEvent(
  agentId: string | undefined,
  event: Omit<EvolveEvent, "id" | "createdAt">,
): string {
  const id = genId("evt");
  const fullEvent: EvolveEvent = { ...event, id, agentId, createdAt: Date.now() };
  const filePath = resolveEventsFile(agentId);
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(fullEvent) + "\n", "utf8");
  } catch {
    /* 事件写入失败不影响主流程 */
  }
  return id;
}

/** 读取最近 N 条事件（倒序） */
function loadRecentEvolveEvents(agentId: string | undefined, limit = 20): EvolveEvent[] {
  try {
    const filePath = resolveEventsFile(agentId);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
    return lines
      .slice(-Math.max(limit, 1))
      .map((l) => {
        try {
          return JSON.parse(l) as EvolveEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is EvolveEvent => e !== null)
      .toReversed();
  } catch {
    return [];
  }
}

// ============================================================================
// Gap D: 进化策略自动切换（Evolver EVOLVE_STRATEGY 模式）
// ============================================================================

function loadEvolveStrategy(agentId?: string): EvolveStrategyState {
  return loadJson<EvolveStrategyState>(resolveStrategyFile(agentId), {
    version: 1,
    agentId,
    current: "balanced",
    reason: "default",
    detectedAt: 0,
  });
}

/**
 * detectAndUpdateStrategy — 根据近期成功率自动切换策略
 *
 * 策略定义：
 *   balanced      默认平衡，成功率 40%~70%
 *   harden        高成功率（>70%）时切换，专注完善和可高度化
 *   repair-only   低成功率（<35%）时切换，专注修复错误
 *   innovate      成功率近期持续上升 + 历史成功>80%，可进行创新尝试
 *   early-stabilize 历史样本不足（<5次）时，采用保守策略
 */
export function detectAndUpdateStrategy(agentId: string | undefined): EvolveStrategyState {
  try {
    const profile = loadPerfProfile(agentId);
    const allBuckets = Object.values(profile.buckets);
    if (allBuckets.length === 0) {
      return loadEvolveStrategy(agentId);
    }

    // 汇总所有 bucket 的近期 10 次结果
    const recentAll = allBuckets.flatMap((b) => b.recentOutcomes);
    const totalSamples = recentAll.length;
    const state = loadEvolveStrategy(agentId);

    // 样本不足 5 次：保守策略
    if (totalSamples < 5) {
      if (state.current !== "early-stabilize") {
        const next: EvolveStrategyState = {
          version: 1,
          agentId,
          current: "early-stabilize",
          previous: state.current,
          reason: `样本不足 5 次（${totalSamples} 次），采用保守策略`,
          detectedAt: Date.now(),
        };
        saveJson(resolveStrategyFile(agentId), next);
        appendEvolveEvent(agentId, {
          type: "strategy.change",
          summary: `进化策略: ${state.current} → early-stabilize`,
          meta: { from: state.current, to: "early-stabilize", reason: next.reason },
        });
        return next;
      }
      return state;
    }

    const successCount = recentAll.filter((o) => o === "success").length;
    const recentRate = successCount / totalSamples;

    let newStrategy: EvolveStrategy = "balanced";
    let reason = "";

    if (recentRate < 0.35) {
      newStrategy = "repair-only";
      reason = `近期成功率低（${Math.round(recentRate * 100)}%），切换至修复优先模式`;
    } else if (recentRate > 0.8 && totalSamples >= 10) {
      // 历史成功率也要高（所有 bucket 平均成功率）
      const globalRate =
        allBuckets.reduce((s, b) => s + b.success, 0) /
        Math.max(
          1,
          allBuckets.reduce((s, b) => s + b.total, 0),
        );
      if (globalRate > 0.75) {
        newStrategy = "innovate";
        reason = `近期 ${Math.round(recentRate * 100)}% + 历史 ${Math.round(globalRate * 100)}%，可尝试创新优化`;
      } else {
        newStrategy = "harden";
        reason = `近期成功率高（${Math.round(recentRate * 100)}%），切换至巩固模式`;
      }
    } else if (recentRate >= 0.7) {
      newStrategy = "harden";
      reason = `近期成功率较高（${Math.round(recentRate * 100)}%），巩固已有技能`;
    } else {
      newStrategy = "balanced";
      reason = `成功率中等（${Math.round(recentRate * 100)}%），保持平衡策略`;
    }

    if (newStrategy !== state.current) {
      const next: EvolveStrategyState = {
        version: 1,
        agentId,
        current: newStrategy,
        previous: state.current,
        reason,
        detectedAt: Date.now(),
      };
      saveJson(resolveStrategyFile(agentId), next);
      appendEvolveEvent(agentId, {
        type: "strategy.change",
        summary: `进化策略: ${state.current} → ${newStrategy}`,
        meta: { from: state.current, to: newStrategy, reason },
      });
      return next;
    }
    return state;
  } catch {
    return loadEvolveStrategy(agentId);
  }
}

// ============================================================================
// Gap E: Ontology 操作层
// ============================================================================

/** 从 graph.jsonl 重建内存快照 */
function loadOntologyStore(agentId?: string): OntologyStore {
  const store: OntologyStore = { entities: new Map(), relations: new Map() };
  const filePath = resolveOntologyGraphFile(agentId);
  if (!fs.existsSync(filePath)) {
    return store;
  }
  try {
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const op = JSON.parse(line) as OntologyOp;
      if (op.op === "create") {
        store.entities.set(op.entity.id, op.entity);
      } else if (op.op === "update") {
        const existing = store.entities.get(op.id);
        if (existing) {
          const updated = {
            ...existing,
            properties: { ...existing.properties, ...(op.patch.properties ?? {}) },
            updatedAt: op.updatedAt,
          };
          store.entities.set(op.id, updated);
        }
      } else if (op.op === "delete") {
        store.entities.delete(op.id);
      } else if (op.op === "relate") {
        store.relations.set(op.relation.id, op.relation);
        // 更新 relatedIds 快速索引
        const from = store.entities.get(op.relation.fromId);
        const to = store.entities.get(op.relation.toId);
        if (from && !from.relatedIds.includes(op.relation.toId)) {
          from.relatedIds.push(op.relation.toId);
        }
        if (to && !to.relatedIds.includes(op.relation.fromId)) {
          to.relatedIds.push(op.relation.fromId);
        }
      } else if (op.op === "unrelate") {
        store.relations.delete(op.relationId);
      }
    }
  } catch {
    /* 文件损坏时返回空快照 */
  }
  return store;
}

function appendOntologyOp(agentId: string | undefined, op: OntologyOp): void {
  const filePath = resolveOntologyGraphFile(agentId);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(op) + "\n", "utf8");
}

// ============================================================================
// Gap B: 学习晋升机制（self-improving-agent SOUL.md/AGENTS.md/TOOLS.md 模式）
//
// 当 autoSaveReflection 保存了高质量 lesson（outcome=success 且有长 lesson）时，
// 将 lesson 晋升追加到 Agent 的工作空间文件中，形成长期记忆沉淀。
// ============================================================================

type LessonPromoteTarget = "SOUL.md" | "AGENTS.md" | "TOOLS.md";

/**
 * resolveAgentWorkspaceDirFallback — 在不依赖 cfg 的情况下推算 Agent 工作空间路径
 * 复用 resolveAgentWorkspaceDir 的逻辑：stateDir/workspace-{agentId}
 */
function resolveAgentWorkspaceDirFallback(agentId: string): string {
  const stateDir = resolveStateDir(process.env);
  return path.join(stateDir, `workspace-${agentId}`);
}

/**
 * promoteLesson — 将高质量 lesson 晋升追加到工作区文件
 *
 * @param agentId   目标 Agent
 * @param lessons   本次任务的 lessons（已去重过）
 * @param outcome   任务结果（只有 success 时晋升到 AGENTS.md，failure 晋升到 TOOLS.md）
 * @param taskSummary 任务摘要（用于注释）
 */
function promoteLesson(
  agentId: string | undefined,
  lessons: string[],
  outcome: ReflectionOutcome,
  taskSummary: string,
): void {
  if (!agentId) {
    return;
  }
  // 只选择长度 >= 20 字符的高价值 lesson
  const valuable = lessons.filter((l) => l.trim().length >= 20);
  if (valuable.length === 0) {
    return;
  }

  try {
    const workspaceDir = resolveAgentWorkspaceDirFallback(agentId);
    if (!fs.existsSync(workspaceDir)) {
      return;
    } // 工作区不存在则跳过

    // 确定晋升目标文件
    let target: LessonPromoteTarget;
    if (outcome === "success") {
      target = "AGENTS.md"; // 成功经验 → AGENTS.md（Agent 行为指南）
    } else if (outcome === "failure") {
      target = "TOOLS.md"; // 失败教训 → TOOLS.md（工具使用注意）
    } else {
      target = "SOUL.md"; // partial → SOUL.md（核心价值观修正）
    }

    const targetPath = path.join(workspaceDir, target);
    if (!fs.existsSync(targetPath)) {
      return;
    } // 目标文件不存在则跳过（避免创建垃圾文件）

    // 构建追加内容（轻量 Markdown 格式，带日期戳）
    const date = new Date().toISOString().split("T")[0];
    const lines = [
      "",
      `## 🧠 自动晋升学习（${date}）`,
      `> 任务：${taskSummary.slice(0, 100)}`,
      ...valuable.map((l) => `- ${l.trim()}`),
      "",
    ];
    const appendContent = lines.join("\n");

    // 追加到目标文件（文件大小检查：不超过 3000 字符才追加，防止无限膨胀）
    const existing = fs.readFileSync(targetPath, "utf8");
    if (existing.length > 8000) {
      return; // 文件已过大，跳过（文件大小由 file-tools-secure.ts 管理）
    }
    fs.appendFileSync(targetPath, appendContent, "utf8");

    // Gap C: 记录晋升事件
    appendEvolveEvent(agentId, {
      type: "lesson.promoted",
      summary: `${valuable.length} 条 lesson 晋升到 ${target}`,
      meta: {
        target,
        lessonsCount: valuable.length,
        outcome,
        taskSummary: taskSummary.slice(0, 80),
      },
    });
  } catch {
    /* 晋升失败不影响主流程 */
  }
}

// ============================================================================
// Gap A: 功能需求日志操作层（self-improving-agent FEATURE_REQUESTS 模式）
// ============================================================================

function loadFeatureRequestStore(agentId?: string): FeatureRequestStore {
  return loadJson<FeatureRequestStore>(resolveFeatureRequestsFile(agentId), {
    version: 1,
    entries: [],
  });
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
// FGT 反思有效性评估 + GC（Reflection Quality Scoring & Garbage Collection）
// 业界依据：Reflexion / OpenManus / MemOS — 低质量记忆不仅无益反而增加 context 干扰
//
// 评分维度（满分 10 分，低于 REFLECTION_GC_MIN_SCORE 则标记为待清理）：
//   +3  有 lessons 且至少一条长度 >= 20 字符（核心学习价值）
//   +2  outcome 为 failure / partial（失败记录更有学习价值）
//   +2  reflection 长度 >= 100 字符（内容充实）
//   +2  taskSummary 长度 >= 15 字符（任务描述有意义）
//   +1  有 steps 归因（细粒度步骤信息）
//
// 时效衰减：30天以上的 success 条目额外扣 2 分（成功经验时效较短）
// 强制删除：低于阈值 且 超过 REFLECTION_GC_EXPIRE_DAYS 天的条目直接删除
// ============================================================================

const REFLECTION_GC_MIN_SCORE = 3; // 低于此分值标记为待清理
const REFLECTION_GC_EXPIRE_DAYS = 90; // 超过此天数且低分则直接删除
const REFLECTION_SUCCESS_DECAY_DAYS = 30; // success 条目的时效衰减天数

/**
 * scoreReflectionValue — 对单条反思进行有效性评分（0~10）
 */
export function scoreReflectionValue(entry: ReflectionEntry): number {
  let score = 0;
  const now = Date.now();

  // +3 有 lessons 且至少一条 >= 20 字符
  if (entry.lessons.length > 0 && entry.lessons.some((l) => l.length >= 20)) {
    score += 3;
  } else if (entry.lessons.length > 0) {
    score += 1; // 有 lessons 但太短，只给 1 分
  }

  // +2 outcome 为 failure / partial（失败经验更珍贵）
  if (entry.outcome === "failure" || entry.outcome === "partial") {
    score += 2;
  }

  // +2 reflection 内容充实（>= 100 字符）
  if (entry.reflection.length >= 100) {
    score += 2;
  } else if (entry.reflection.length >= 40) {
    score += 1;
  }

  // +2 taskSummary 有意义（>= 15 字符，且不是纯英文缩写）
  if (entry.taskSummary.length >= 15) {
    score += 2;
  } else if (entry.taskSummary.length >= 8) {
    score += 1;
  }

  // +1 有 steps 细粒度归因
  if (entry.steps && entry.steps.length > 0) {
    score += 1;
  }

  // 时效衰减：success 条目超过 30 天扣 2 分
  if (entry.outcome === "success") {
    const ageMs = now - entry.createdAt;
    if (ageMs > REFLECTION_SUCCESS_DECAY_DAYS * 24 * 60 * 60 * 1000) {
      score = Math.max(0, score - 2);
    }
  }

  return score;
}

/**
 * pruneStaleReflections — 清理低价值反思
 *
 * 策略（两步走）：
 * 1. 低分（< REFLECTION_GC_MIN_SCORE）且超过 REFLECTION_GC_EXPIRE_DAYS 天的条目直接删除
 * 2. 若剩余条数仍超过 highWaterMark，则对 success 类按评分从低到高再裁剪
 *
 * 返回 GC 报告
 */
export function pruneStaleReflections(
  agentId: string | undefined,
  highWaterMark = 200, // 超过此数量时触发额外裁剪
): { before: number; after: number; removed: number; reason: string } {
  const filePath = resolveReflectionsFile(agentId);
  const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });
  const before = store.entries.length;

  if (before === 0) {
    return { before: 0, after: 0, removed: 0, reason: "empty" };
  }

  const expireThreshold = Date.now() - REFLECTION_GC_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

  // Step 1: 删除「低分 + 超龄」条目
  store.entries = store.entries.filter((entry) => {
    if (entry.createdAt < expireThreshold) {
      const score = scoreReflectionValue(entry);
      if (score < REFLECTION_GC_MIN_SCORE) {
        return false; // 删除
      }
    }
    return true;
  });

  // Step 2: 若还超 highWaterMark，对低价值 success 条目额外裁剪
  if (store.entries.length > highWaterMark) {
    // 按评分升序，优先删除低分的 success 条目
    const scored = store.entries.map((e) => ({ entry: e, score: scoreReflectionValue(e) }));
    scored.sort((a, b) => {
      // failure/partial 优先保留（排在后面）
      if (a.entry.outcome !== "success" && b.entry.outcome === "success") {
        return 1;
      }
      if (a.entry.outcome === "success" && b.entry.outcome !== "success") {
        return -1;
      }
      return a.score - b.score; // 同类中低分的排前面（优先删除）
    });
    const toKeep = store.entries.length - highWaterMark;
    const keepSet = new Set(scored.slice(toKeep).map((s) => s.entry.id));
    store.entries = store.entries.filter((e) => keepSet.has(e.id));
  }

  const after = store.entries.length;
  const removed = before - after;

  if (removed > 0) {
    saveJson(filePath, store);
  }

  return {
    before,
    after,
    removed,
    reason: removed > 0 ? `GC: 删除 ${removed} 条低价值/超龄反思` : "no-op",
  };
}

// ============================================================================
// Gap3 技能相似度匹配（TF-IDF 风格加权 + 宽松阈值）
//
// 改进策略（业界依据：Voyager 技能召回需要对自然语言 prompt 有较高召回率）：
//   1. 分字段权重：triggers(×3) > name(×2) > description(×2) > tags(×1)
//   2. 罕见词加权：长度 >= 4 的词视为高信息量词，命中时额外 +0.5 权重
//   3. 阈值降至 0.3（原来等效 0.5）：让长 prompt 中只命中少数关键词也能召回
//   4. 中文 bi-gram 拆解：将 2+ 字中文词拆成 bi-gram 对，增加中文召回率
// ============================================================================

function tokenizeForSkill(text: string): string[] {
  const lower = text.toLowerCase();
  // 中文字符以单字 + bi-gram 双模式匹配
  const cjkChars = lower.match(/[\u4e00-\u9fff]/g) ?? [];
  const cjkBigrams: string[] = [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    cjkBigrams.push(cjkChars[i] + cjkChars[i + 1]);
  }
  const eng = lower.match(/[a-z0-9]{2,}/g) ?? [];
  return [...new Set([...cjkChars, ...cjkBigrams, ...eng])];
}

function skillMatchesQuery(skill: SkillEntry | SharedSkillEntry, query: string): boolean {
  if (!query.trim()) {
    return true;
  }
  const queryTokens = tokenizeForSkill(query);
  if (queryTokens.length === 0) {
    return true;
  }

  // 分字段加权文本池
  const weightedPool: Array<{ text: string; weight: number }> = [
    { text: skill.name, weight: 2 },
    { text: skill.description, weight: 2 },
    ...skill.triggers.map((t) => ({ text: t, weight: 3 })),
    ...skill.tags.map((t) => ({ text: t, weight: 1 })),
  ];

  let hitScore = 0;
  let maxScore = 0;

  for (const token of queryTokens) {
    // 罕见词（长度 >= 4）视为高信息量
    const tokenWeight = token.length >= 4 ? 1.5 : 1.0;
    maxScore += tokenWeight;
    for (const { text, weight } of weightedPool) {
      if (text.toLowerCase().includes(token)) {
        hitScore += tokenWeight * (weight / 3); // 归一化权重到 0~1.5 区间
        break; // 同一 token 只算一次最高权重字段
      }
    }
  }

  // 阈值 0.3（比原来的 0.5 更宽松，提升召回率）
  return maxScore > 0 && hitScore / maxScore >= 0.3;
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

      // Gap C: 记录反思保存事件
      appendEvolveEvent(agentId, {
        type: "reflect.save",
        assetId: id,
        summary: `反思保存: [${outcome}] ${taskSummary.slice(0, 60)}`,
        meta: { outcome, lessonsCount: lessons.length },
      });

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
          // Gap C: 记录技能更新事件
          appendEvolveEvent(agentId, {
            type: "skill.update",
            assetId: existing.id,
            summary: `技能更新: ${name}`,
            meta: { category },
          });
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

      // Gap C: 记录技能保存事件
      appendEvolveEvent(agentId, {
        type: "skill.save",
        assetId: id,
        summary: `技能新增: ${name}`,
        meta: { category, triggersCount: triggers.length },
      });

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
        skills = skills.filter((s) => skillMatchesQuery(s, query));
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

  /**
   * evolve.reflect.gc — 手动触发反思库 GC，返回清理报告
   * 支持单 Agent 或全量 Agent（agentIds 为数组，不传则仅处理当前 agentId）
   */
  "evolve.reflect.gc": async ({ params, respond }) => {
    try {
      // 支持传入 agentIds 数组批量处理，或单个 agentId
      const agentIds: Array<string | undefined> = Array.isArray(params?.agentIds)
        ? params.agentIds.map((id) => (id ? String(id) : undefined))
        : [params?.agentId ? String(params.agentId) : undefined];

      const highWaterMark =
        typeof params?.highWaterMark === "number" ? Math.max(50, params.highWaterMark) : 200;

      const reports: Array<{
        agentId: string | undefined;
        before: number;
        after: number;
        removed: number;
        reason: string;
      }> = [];

      for (const agentId of agentIds) {
        try {
          const report = pruneStaleReflections(agentId, highWaterMark);
          reports.push({ agentId, ...report });
        } catch {
          reports.push({ agentId, before: 0, after: 0, removed: 0, reason: "error" });
        }
      }

      const totalRemoved = reports.reduce((s, r) => s + r.removed, 0);
      respond(
        true,
        {
          reports,
          totalRemoved,
          agentsProcessed: reports.length,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.reflect.gc failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.sharp.evaluate — 评估一次任务输出的 SHARP 质量分数
   * 如果总分 < SHARP_THRESHOLD，应由调用方通知 supervisor
   */
  "evolve.sharp.evaluate": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const taskSummary = params?.taskSummary ? String(params.taskSummary).trim() : "";
      const output = params?.output ? String(params.output).trim() : "";
      if (!taskSummary || !output) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "taskSummary and output are required"),
        );
        return;
      }
      const validOutcomes = ["success", "partial", "failure"];
      const outcome = (
        validOutcomes.includes(String(params?.outcome ?? "")) ? String(params.outcome) : "partial"
      ) as "success" | "partial" | "failure";
      const hasError = params?.hasError === true;
      const note = params?.note ? String(params.note).slice(0, 200) : undefined;
      // 支持 supervisor 覆盖分数
      const overrides: Parameters<typeof evaluateSharp>[0]["overrides"] = {};
      for (const dim of [
        "specificity",
        "helpfulness",
        "accuracy",
        "relevance",
        "professionalism",
      ] as const) {
        const v = params?.[dim];
        if (typeof v === "number" && v >= 1 && v <= 5) {
          overrides[dim] = Math.round(v) as 1 | 2 | 3 | 4 | 5;
        }
      }
      const score = evaluateSharp({
        agentId,
        taskSummary,
        output,
        outcome,
        hasError,
        source: "self",
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        note,
      });
      respond(
        true,
        {
          score,
          belowThreshold: score.total < SHARP_THRESHOLD,
          threshold: SHARP_THRESHOLD,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.sharp.evaluate failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.sharp.history — 获取 SHARP 历史分数和均分摘要
   */
  "evolve.sharp.history": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 50) : 20;
      const store = loadSharpStore(agentId);
      const recent = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, limit);
      const summaryText = getSharpSummaryText(agentId, limit);
      respond(
        true,
        {
          entries: recent,
          total: store.entries.length,
          returned: recent.length,
          summaryText,
          threshold: SHARP_THRESHOLD,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.sharp.history failed: ${String(err)}`),
      );
    }
  },

  // ============================================================================
  // Gap A: 功能需求日志 RPC （self-improving-agent FEATURE_REQUESTS 模式）
  // ============================================================================

  /**
   * evolve.feat.save — 记录一条功能需求
   * 支持相同 patternKey 的需求自动累加 recurrenceCount
   */
  "evolve.feat.save": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const capability = params?.capability ? String(params.capability).trim() : "";
      const context = params?.context ? String(params.context).trim() : "";
      if (!capability) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "capability is required"));
        return;
      }

      const validPriorities: FeatureRequestPriority[] = ["low", "medium", "high", "critical"];
      const priority = (
        params?.priority &&
        validPriorities.includes(String(params.priority) as FeatureRequestPriority)
          ? String(params.priority)
          : "medium"
      ) as FeatureRequestPriority;

      const validComplexities = ["simple", "medium", "complex"];
      const complexity = (
        params?.complexity && validComplexities.includes(String(params.complexity))
          ? String(params.complexity)
          : "medium"
      ) as FeatureRequestEntry["complexity"];

      const area = params?.area ? String(params.area).slice(0, 100) : undefined;
      const suggestedImpl = params?.suggestedImpl
        ? String(params.suggestedImpl).slice(0, 500)
        : undefined;
      const patternKey = params?.patternKey ? String(params.patternKey).slice(0, 100) : undefined;

      const store = loadFeatureRequestStore(agentId);
      const now = Date.now();

      // 相同 patternKey 的需求自动累加次数
      if (patternKey) {
        const existingIdx = store.entries.findIndex(
          (e) => e.patternKey === patternKey && e.status === "pending",
        );
        if (existingIdx !== -1) {
          const existing = store.entries[existingIdx];
          if (existing) {
            existing.recurrenceCount += 1;
            existing.updatedAt = now;
            store.entries[existingIdx] = existing;
            saveJson(resolveFeatureRequestsFile(agentId), store);
            // Gap C: 记录功能需求增加事件
            appendEvolveEvent(agentId, {
              type: "feat.save",
              assetId: existing.id,
              summary: `功能需求重复(${existing.recurrenceCount}次): ${capability.slice(0, 50)}`,
              meta: { patternKey, recurrenceCount: existing.recurrenceCount },
            });
            respond(
              true,
              { id: existing.id, action: "recurrence", recurrenceCount: existing.recurrenceCount },
              undefined,
            );
            return;
          }
        }
      }

      const id = genId("feat");
      const entry: FeatureRequestEntry = {
        id,
        agentId,
        capability: capability.slice(0, 500),
        context: context.slice(0, 1000),
        complexity,
        priority,
        status: "pending",
        recurrenceCount: 1,
        area,
        suggestedImpl,
        patternKey,
        createdAt: now,
        updatedAt: now,
      };
      store.entries.push(entry);

      // 保留最近 200 条
      if (store.entries.length > 200) {
        // 第一优先级：高优先级的 pending 需求
        store.entries = store.entries
          .toSorted((a, b) => {
            const priorityScore = { critical: 4, high: 3, medium: 2, low: 1 };
            return (
              priorityScore[b.priority] - priorityScore[a.priority] ||
              b.recurrenceCount - a.recurrenceCount ||
              b.createdAt - a.createdAt
            );
          })
          .slice(0, 200);
      }

      saveJson(resolveFeatureRequestsFile(agentId), store);

      // Gap C: 记录功能需求保存事件
      appendEvolveEvent(agentId, {
        type: "feat.save",
        assetId: id,
        summary: `功能需求记录: ${capability.slice(0, 60)}`,
        meta: { priority, complexity, patternKey },
      });

      respond(true, { id, action: "added" }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.feat.save failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.feat.list — 列出功能需求（支持按状态/优先级过滤）
   */
  "evolve.feat.list": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const filterStatus = params?.status ? String(params.status) : undefined;
      const filterPriority = params?.priority ? String(params.priority) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 100) : 20;

      const store = loadFeatureRequestStore(agentId);
      let entries = store.entries;

      if (filterStatus) {
        entries = entries.filter((e) => e.status === filterStatus);
      }
      if (filterPriority) {
        entries = entries.filter((e) => e.priority === filterPriority);
      }

      const priorityScore = { critical: 4, high: 3, medium: 2, low: 1 };
      const sorted = entries
        .toSorted(
          (a, b) =>
            priorityScore[b.priority] - priorityScore[a.priority] ||
            b.recurrenceCount - a.recurrenceCount ||
            b.createdAt - a.createdAt,
        )
        .slice(0, limit);

      respond(true, { entries: sorted, total: entries.length, returned: sorted.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.feat.list failed: ${String(err)}`),
      );
    }
  },

  /**
   * evolve.feat.update — 更新功能需求状态
   */
  "evolve.feat.update": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const featId = params?.id ? String(params.id) : "";
      if (!featId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }

      const store = loadFeatureRequestStore(agentId);
      const idx = store.entries.findIndex((e) => e.id === featId);
      if (idx === -1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Feature request "${featId}" not found`),
        );
        return;
      }

      const entry = store.entries[idx];
      const validStatuses: FeatureRequestStatus[] = ["pending", "in_progress", "done", "wont_fix"];
      if (params?.status && validStatuses.includes(String(params.status) as FeatureRequestStatus)) {
        entry.status = String(params.status) as FeatureRequestStatus;
      }
      const validPriorities: FeatureRequestPriority[] = ["low", "medium", "high", "critical"];
      if (
        params?.priority &&
        validPriorities.includes(String(params.priority) as FeatureRequestPriority)
      ) {
        entry.priority = String(params.priority) as FeatureRequestPriority;
      }
      if (params?.suggestedImpl) {
        entry.suggestedImpl = String(params.suggestedImpl).slice(0, 500);
      }
      entry.updatedAt = Date.now();
      store.entries[idx] = entry;
      saveJson(resolveFeatureRequestsFile(agentId), store);

      respond(true, { id: featId, action: "updated", status: entry.status }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.feat.update failed: ${String(err)}`),
      );
    }
  },

  // ============================================================================
  // Gap C: 进化事件溃源 RPC
  // ============================================================================

  /**
   * evolve.events.list — 列出近期进化事件（倒序）
   */
  "evolve.events.list": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 100) : 20;
      const filterType = params?.type ? String(params.type) : undefined;

      const events = loadRecentEvolveEvents(agentId, limit * 2);
      const filtered = filterType ? events.filter((e) => e.type === filterType) : events;
      const result = filtered.slice(0, limit);

      respond(true, { events: result, total: filtered.length, returned: result.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.events.list failed: ${String(err)}`),
      );
    }
  },

  // ============================================================================
  // Gap D: 进化策略 RPC
  // ============================================================================

  /**
   * evolve.strategy.get — 获取当前进化策略状态
   */
  "evolve.strategy.get": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      // 如果传入 refresh=true 则重新检测（否则迼入缓存）
      const refresh = params?.refresh === true;
      const state = refresh ? detectAndUpdateStrategy(agentId) : loadEvolveStrategy(agentId);
      respond(true, { strategy: state }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `evolve.strategy.get failed: ${String(err)}`),
      );
    }
  },

  // ============================================================================
  // Gap E: Ontology 知识图谱 RPC
  // ============================================================================

  /**
   * ontology.entity.create — 创建一个 Ontology 实体
   */
  "ontology.entity.create": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const type = params?.type ? String(params.type).trim() : "";
      if (!type) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "type is required"));
        return;
      }
      const properties =
        params?.properties && typeof params.properties === "object"
          ? (params.properties as Record<string, unknown>)
          : {};
      const relatedIds = Array.isArray(params?.relatedIds)
        ? (params.relatedIds as unknown[]).map(String)
        : [];

      const now = Date.now();
      const id = genId("ent");
      const entity: OntologyEntity = {
        id,
        type,
        agentId,
        properties,
        relatedIds,
        createdAt: now,
        updatedAt: now,
      };

      appendOntologyOp(agentId, { op: "create", entity });
      respond(true, { id, action: "created", entity }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.entity.create failed: ${String(err)}`),
      );
    }
  },

  /**
   * ontology.entity.get — 获取一个实体（重建内存快照后返回）
   */
  "ontology.entity.get": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const id = params?.id ? String(params.id) : "";
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const store = loadOntologyStore(agentId);
      const entity = store.entities.get(id);
      if (!entity) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Entity "${id}" not found`));
        return;
      }
      // 一并返回该实体的直接关系
      const relations = Array.from(store.relations.values()).filter(
        (r) => r.fromId === id || r.toId === id,
      );
      respond(true, { entity, relations }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.entity.get failed: ${String(err)}`),
      );
    }
  },

  /**
   * ontology.entity.update — 更新实体属性
   */
  "ontology.entity.update": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const id = params?.id ? String(params.id) : "";
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      // 验证实体存在
      const store = loadOntologyStore(agentId);
      if (!store.entities.has(id)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Entity "${id}" not found`));
        return;
      }
      const patch: Partial<OntologyEntity> = {};
      if (params?.properties && typeof params.properties === "object") {
        patch.properties = params.properties as Record<string, unknown>;
      }
      if (Array.isArray(params?.relatedIds)) {
        patch.relatedIds = (params.relatedIds as unknown[]).map(String);
      }
      const now = Date.now();
      appendOntologyOp(agentId, { op: "update", id, patch, updatedAt: now });
      respond(true, { id, action: "updated", updatedAt: now }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.entity.update failed: ${String(err)}`),
      );
    }
  },

  /**
   * ontology.entity.delete — 删除一个实体
   */
  "ontology.entity.delete": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const id = params?.id ? String(params.id) : "";
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const store = loadOntologyStore(agentId);
      if (!store.entities.has(id)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Entity "${id}" not found`));
        return;
      }
      appendOntologyOp(agentId, { op: "delete", id, deletedAt: Date.now() });
      respond(true, { id, action: "deleted" }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.entity.delete failed: ${String(err)}`),
      );
    }
  },

  /**
   * ontology.entity.list — 列出所有实体（支持按 type 过滤）
   */
  "ontology.entity.list": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const filterType = params?.type ? String(params.type) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 200) : 50;
      const query = params?.query ? String(params.query).toLowerCase() : undefined;

      const store = loadOntologyStore(agentId);
      let entities = Array.from(store.entities.values());

      if (filterType) {
        entities = entities.filter((e) => e.type === filterType);
      }
      if (query) {
        entities = entities.filter((e) => {
          const text = JSON.stringify(e.properties).toLowerCase() + " " + e.type.toLowerCase();
          return text.includes(query);
        });
      }

      const sorted = entities.toSorted((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);

      respond(
        true,
        { entities: sorted, total: entities.length, returned: sorted.length },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.entity.list failed: ${String(err)}`),
      );
    }
  },

  /**
   * ontology.relate — 在两个实体之间建立关系
   */
  "ontology.relate": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const fromId = params?.fromId ? String(params.fromId) : "";
      const toId = params?.toId ? String(params.toId) : "";
      const relationType = params?.relationType ? String(params.relationType).trim() : "";
      if (!fromId || !toId || !relationType) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "fromId, toId, and relationType are required"),
        );
        return;
      }
      // 验证实体存在
      const store = loadOntologyStore(agentId);
      if (!store.entities.has(fromId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Entity fromId "${fromId}" not found`),
        );
        return;
      }
      if (!store.entities.has(toId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Entity toId "${toId}" not found`),
        );
        return;
      }
      const properties =
        params?.properties && typeof params.properties === "object"
          ? (params.properties as Record<string, unknown>)
          : undefined;

      const now = Date.now();
      const relation: OntologyRelation = {
        id: genId("rel"),
        fromId,
        relationType,
        toId,
        properties,
        createdAt: now,
      };
      appendOntologyOp(agentId, { op: "relate", relation });
      respond(true, { id: relation.id, action: "related", relation }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.relate failed: ${String(err)}`),
      );
    }
  },

  /**
   * ontology.unrelate — 删除一个关系
   */
  "ontology.unrelate": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const relationId = params?.relationId ? String(params.relationId) : "";
      if (!relationId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "relationId is required"));
        return;
      }
      const store = loadOntologyStore(agentId);
      if (!store.relations.has(relationId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Relation "${relationId}" not found`),
        );
        return;
      }
      appendOntologyOp(agentId, { op: "unrelate", relationId, deletedAt: Date.now() });
      respond(true, { relationId, action: "unrelated" }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.unrelate failed: ${String(err)}`),
      );
    }
  },

  /**
   * ontology.query — 按关系类型或节点查询实体子图
   */
  "ontology.query": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const entityId = params?.entityId ? String(params.entityId) : undefined;
      const relationType = params?.relationType ? String(params.relationType) : undefined;
      const depth = typeof params?.depth === "number" ? Math.min(Math.max(1, params.depth), 3) : 1;

      const store = loadOntologyStore(agentId);

      if (entityId) {
        // 从指定实体出发进行 BFS 子图查询
        const visited = new Set<string>();
        const queue: Array<{ id: string; d: number }> = [{ id: entityId, d: 0 }];
        const resultEntities: OntologyEntity[] = [];
        const resultRelations: OntologyRelation[] = [];

        while (queue.length > 0) {
          const item = queue.shift();
          if (!item || visited.has(item.id)) {
            continue;
          }
          visited.add(item.id);
          const entity = store.entities.get(item.id);
          if (entity) {
            resultEntities.push(entity);
          }

          if (item.d < depth) {
            const rels = Array.from(store.relations.values()).filter((r) => {
              if (r.fromId !== item.id && r.toId !== item.id) {
                return false;
              }
              if (relationType && r.relationType !== relationType) {
                return false;
              }
              return true;
            });
            for (const rel of rels) {
              resultRelations.push(rel);
              const nextId = rel.fromId === item.id ? rel.toId : rel.fromId;
              if (!visited.has(nextId)) {
                queue.push({ id: nextId, d: item.d + 1 });
              }
            }
          }
        }

        respond(
          true,
          {
            entities: resultEntities,
            relations: resultRelations,
            depth,
            centerEntityId: entityId,
          },
          undefined,
        );
      } else {
        // 返回全局概览（实体数/关系数，类型分布）
        const typeCount = new Map<string, number>();
        for (const e of store.entities.values()) {
          typeCount.set(e.type, (typeCount.get(e.type) ?? 0) + 1);
        }
        const relTypeCount = new Map<string, number>();
        for (const r of store.relations.values()) {
          relTypeCount.set(r.relationType, (relTypeCount.get(r.relationType) ?? 0) + 1);
        }
        respond(
          true,
          {
            totalEntities: store.entities.size,
            totalRelations: store.relations.size,
            entityTypes: Object.fromEntries(typeCount),
            relationTypes: Object.fromEntries(relTypeCount),
          },
          undefined,
        );
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `ontology.query failed: ${String(err)}`),
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
  /** 当前会话的 sessionKey，传入后可精确匹配当前群组的项目 SHARP 开关 */
  sessionKey?: string;
}): void {
  try {
    // 双重防护：过滤噪声 taskSummary（session bootstrap / group-shared-memory 等）
    const NOISE_PATTERNS_RPC = [
      /^\(session bootstrap\)$/i,
      /^<group-shared-memory>/i,
      /^You are a member of the following team groups/i,
      /^\[system\]/i,
      /^bootstrap/i,
      /^<self-evolution-reflections>/i,
      /^<skills-summary>/i,
      /^<tools-catalog>/i,
      /^Past task reflections/i,
      /^##\s*Runtime System Events/i,
      /^Treat this sect/i,
      /^\[cron:/i,
    ];
    if (NOISE_PATTERNS_RPC.some((p) => p.test(params.taskSummary.trim()))) {
      return;
    }

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

    // ----------------------------------------------------------------
    // Gap5 反思内容最低质量过滤（Reflexion 已知缺陷：无内容反思不如不存）
    // 规则：
    //   1. reflection 内容字数 < 10 则丢弃（无实质内容）
    //   2. reflection 全是纯英文缩写且字数 < 20 则丢弃（ok / done / N/A 等）
    //   3. 每条 lesson 过短（< 8 字）则丢弃
    // ----------------------------------------------------------------
    const reflTrimmed = entry.reflection.trim();
    if (reflTrimmed.length < 10) {
      return; // 反思内容无实质，丢弃
    }
    // 纯 ASCII 且字数少： 比如 "ok" "done" "N/A" "yes" 等
    if (/^[\u0020-\u007E\u0009\u000A\u000D]+$/.test(reflTrimmed) && reflTrimmed.length < 20) {
      return;
    }
    // 过滤无意义 lesson
    entry.lessons = entry.lessons.filter((l) => l.trim().length >= 8);

    // ----------------------------------------------------------------
    // Gap4 Lesson 去重合并（Memory Survey 2025：御冒冠误误误误误不如不存）
    // 策略：与现有最近 50 条反思的每条 lesson 做 Jaccard 相似度，超过 0.65 则认为重复在现有条目上自动合并
    // （不再重复存储，而是在高相似到的旧条目上增加计数字段）
    // ----------------------------------------------------------------
    const recentEntries = store.entries.slice(-50); // 只比较最近 50 条，控制开销
    const deduped = entry.lessons.filter((newLesson) => {
      const newKws = extractKeywords(newLesson);
      if (newKws.length === 0) {
        return true;
      }
      for (const prev of recentEntries) {
        for (const oldLesson of prev.lessons) {
          const oldKws = extractKeywords(oldLesson);
          if (keywordSimilarity(newKws, oldKws) >= 0.65) {
            // 见过相似 lesson，增加其重复次数而不重复存入
            const prevIdx = store.entries.indexOf(prev);
            if (prevIdx !== -1) {
              const storedEntry = store.entries[prevIdx];
              if (storedEntry && !storedEntry.tags.includes("merged-lesson")) {
                storedEntry.tags = [...storedEntry.tags, "merged-lesson"];
                store.entries[prevIdx] = storedEntry;
              }
            }
            return false; // 滤掉该 lesson
          }
        }
      }
      return true;
    });
    entry.lessons = deduped;

    store.entries.push(entry);

    // 保留最近 500 条，按时间倒序截断
    if (store.entries.length > 500) {
      store.entries = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 500);
    }

    saveJson(filePath, store);

    // P1 HyperAgent: 同步更新性能画像
    try {
      const taskType = inferTaskType(params.taskSummary, []);
      recordPerfOutcome(params.agentId, taskType, params.outcome);
    } catch {
      /* 不影响主流程 */
    }

    // f5 SHARP 质量门控：自动评估本次任务输出（仅在当前会话所在项目已启用 SHARP 时执行）
    // 判断递推：项目是否启用 SHARP → 项目是否有项目群
    try {
      const sharpStatus = checkSharpStatus(params.agentId, params.sessionKey);
      if (sharpStatus.status === "error") {
        // 项目启用了 SHARP 但未配置项目群，打印警告
        console.warn(`[evolve-rpc] autoSaveReflection SHARP 配置错误: ${sharpStatus.message}`);
      } else if (sharpStatus.status === "enabled") {
        const sharpScore = evaluateSharp({
          agentId: params.agentId,
          taskSummary: params.taskSummary,
          output: params.reflection,
          outcome: params.outcome,
          hasError: params.outcome === "failure",
          source: "self",
        });
        // 低分时在反思条目中标注（后续可由 supervisor 复评）
        if (sharpScore.total < SHARP_THRESHOLD) {
          const logMsg =
            `[SHARP] 质量评分 ${sharpScore.total}/25（低于门控阈值 ${SHARP_THRESHOLD}）` +
            ` S=${sharpScore.specificity} H=${sharpScore.helpfulness} A=${sharpScore.accuracy}` +
            ` R=${sharpScore.relevance} P=${sharpScore.professionalism}`;
          // eslint-disable-next-line no-console
          console.warn(`[evolve-rpc] autoSaveReflection ${params.agentId ?? "?"}: ${logMsg}`);
        }
      }
      // status === "disabled" 时静默跳过
    } catch {
      /* SHARP 评估失败不影响主流程 */
    }

    // FGT: 顺带标记过期技能 + 清理低价値反思（任务粒度定期清理，无需单独定时器）
    try {
      pruneStaleSkills(params.agentId);
    } catch {
      /* 不影响主流程 */
    }
    try {
      pruneStaleReflections(params.agentId);
    } catch {
      /* 不影响主流程 */
    }

    // Gap1 ErrorTaxonomy 增量更新：当本次任务是 failure/partial 时触发
    // 采用懒触发：只有 outcome 不是 success 才扩展分类法（控制开销）
    if (params.outcome !== "success") {
      try {
        buildErrorTaxonomy(params.agentId);
      } catch {
        /* 错误分类失败不影响主流程 */
      }
    }

    // Gap B: 学习晋升——将高质量 lesson 追加到工作区文件
    // 业界依据: self-improving-agent FEATURE_REQUESTS 模式，高频出现的 lesson 沉淀为长期记忆
    try {
      if (entry.lessons.length > 0) {
        promoteLesson(params.agentId, entry.lessons, params.outcome, params.taskSummary);
      }
    } catch {
      /* 晋升失败不影响主流程 */
    }

    // Gap C: 记录自动反思保存事件
    try {
      appendEvolveEvent(params.agentId, {
        type: "reflect.save",
        assetId: id,
        summary: `自动反思: [${params.outcome}] ${params.taskSummary.slice(0, 60)}`,
        meta: { outcome: params.outcome, lessonsCount: entry.lessons.length, auto: true },
      });
    } catch {
      /* 事件记录失败不影响主流程 */
    }

    // Gap D: 进化策略切换——根据近期成功率自动判断并持久化当前策略
    try {
      detectAndUpdateStrategy(params.agentId);
    } catch {
      /* 策略检测失败不影响主流程 */
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
      .filter((s) => skillMatchesQuery(s, query));
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

/**
 * Gap2 成功轨迹 In-Context Example（NeurIPS 2025 Self-Generated ICE）
 *
 * 按关键词相似度检索相关成功案例，格式化为可注入文本。
 * 成功案例给 Agent 提供“以前这类任务是怎么做到的”的 few-shot 示范，显著提升成功率。
 */
export function getSuccessExamplesText(
  agentId: string | undefined,
  prompt: string,
  limit = 2,
): string {
  try {
    const experiences = queryRelevantExperiences(agentId, prompt, {
      limit: limit * 2,
      failureOnly: false,
    });
    const successes = experiences.filter((e) => e.outcome === "success").slice(0, limit);
    if (successes.length === 0) {
      return "";
    }
    const lines = successes.map((e, idx) => {
      const traceStr =
        e.toolTrace.length > 0
          ? e.toolTrace.map((t) => `${t.tool}(${t.result})`).join(" → ")
          : "(no tool trace)";
      return `${idx + 1}. [成功案例] ${e.taskSummary}\n   解决方式: ${traceStr}\n   关键教训: ${e.lesson}`;
    });
    return `相似任务的历史成功案例（可以借鉴这些方式）：\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// ============================================================================
// SHARP 质量门控（awesome-openclaw-agents Critic ≥ 18 设计，5 维度各 1-5 分，总分 5-25）
// S = Specificity（具体性）
// H = Helpfulness（有效性）
// A = Accuracy（准确性）
// R = Relevance（相关性）
// P = Professionalism（专业性）
// ============================================================================

export interface SharpScore {
  id: string;
  agentId?: string;
  /** 被评估的任务摘要 */
  taskSummary: string;
  /** 被评估的输出摘要（前 500 字符） */
  outputSummary: string;
  /** S: 具体性（1-5）—— 输出是否具体、有细节、可执行 */
  specificity: number;
  /** H: 有效性（1-5）—— 输出是否真正解决了问题 */
  helpfulness: number;
  /** A: 准确性（1-5）—— 输出内容是否正确 */
  accuracy: number;
  /** R: 相关性（1-5）—— 输出是否紧扣任务要求 */
  relevance: number;
  /** P: 专业性（1-5）—— 输出是否规范、结构清晰、用语准确 */
  professionalism: number;
  /** 总分 = S+H+A+R+P，范围 5-25 */
  total: number;
  /** 评分来源：agent 自评 或 supervisor 评审 */
  source: "self" | "supervisor";
  /** 低于阈值时的补救说明（可选） */
  note?: string;
  createdAt: number;
}

interface SharpStore {
  version: 1;
  entries: SharpScore[];
}

/** SHARP 门控阈值（总分低于此值触发通知） */
const SHARP_THRESHOLD = 15;

function resolveSharpScoresFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "sharp-scores.json");
}

function loadSharpStore(agentId?: string): SharpStore {
  return loadJson<SharpStore>(resolveSharpScoresFile(agentId), { version: 1, entries: [] });
}

// ── SHARP 项目级开关 ─────────────────────────────────────────────────────────
// SHARP 质量门控为项目级控制，由 PROJECT_CONFIG.json 中的 sharpEnabled 字段决定。
// 单个 Agent 无 Agent 级开关——质量门控是对抗机制，需要项目整体启用才有意义。

/**
 * isProjectSharpEnabled — 根据 projectId 读取项目级 SHARP 开关状态
 */
export function isProjectSharpEnabled(projectId: string): boolean {
  try {
    const workspaceRoot = getGroupsWorkspaceRoot();
    const configPath = path.join(workspaceRoot, projectId, "PROJECT_CONFIG.json");
    if (!fs.existsSync(configPath)) {
      return false;
    }
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as { sharpEnabled?: boolean };
    return cfg.sharpEnabled === true;
  } catch {
    return false;
  }
}

/**
 * SharpCheckResult — SHARP 状态检查结果
 *
 * - `disabled`  项目未启用 SHARP 或没有项目归属，直接跳过
 * - `enabled`   项目已启用且存在项目群，正常执行评分
 * - `error`     项目启用了 SHARP 但未配置项目群，配置错误
 */
export type SharpCheckResult =
  | { status: "disabled" }
  | { status: "enabled"; projectId: string; groupId: string }
  | { status: "error"; reason: "no-group"; projectId: string; message: string };

/**
 * checkSharpStatus — 检查当前任务的 SHARP 门控状态（三态返回）
 *
 * 判断递推顺序：
 *   1. 从 sessionKey 解析 groupId
 *   2. 查 group.projectId 确定当前任务属于哪个项目
 *   3. 读该项目的 PROJECT_CONFIG.json 中的 sharpEnabled
 *   4. 项目已启用时，检查项目是否配置了项目群
 *
 * 各种情况：
 *   - 项目未启用 SHARP → { status: "disabled" }
 *   - 项目已启用 + 有项目群 → { status: "enabled", projectId, groupId }
 *   - 项目已启用 + 无项目群 → { status: "error", reason: "no-group", message: "提示文本" }
 */
export function checkSharpStatus(
  agentId: string | undefined,
  sessionKey?: string,
): SharpCheckResult {
  try {
    if (!agentId) {
      return { status: "disabled" };
    }

    // 从 sessionKey 解析 groupId
    let resolvedGroupId: string | null = null;
    let resolvedProjectId: string | null = null;

    if (sessionKey) {
      const parts = sessionKey.split(":");
      const groupId = parts.length >= 2 ? parts[parts.length - 1] : null;
      if (groupId && groupId !== "main") {
        const group = groupManager.getGroup(groupId);
        if (group?.projectId) {
          resolvedGroupId = groupId;
          resolvedProjectId = group.projectId;
        }
      }
    }

    // 没有项目归属 → disabled
    if (!resolvedProjectId) {
      return { status: "disabled" };
    }

    // 检查项目是否启用 SHARP
    if (!isProjectSharpEnabled(resolvedProjectId)) {
      return { status: "disabled" };
    }

    // 项目已启用 SHARP，检查项目是否配置了项目群
    // 这里的 resolvedGroupId 就是已解析到的项目群
    // 额外检查：该项目是否存在至少一个项目群
    const projectGroups = Array.from(
      // groupManager.groups 是 private，通过 getAgentGroups 取得所有群组并过滤
      // 改用 getGroup 已知 groupId 直接使用即可
      [groupManager.getGroup(resolvedGroupId!)].filter(Boolean),
    );

    if (projectGroups.length === 0 || !resolvedGroupId) {
      // 项目已启用 SHARP 但该项目无群组配置
      return {
        status: "error",
        reason: "no-group",
        projectId: resolvedProjectId,
        message: `项目「${resolvedProjectId}」已开启 SHARP 质量门控，但尚未配置项目群。请先在群组管理中创建群组并关联到该项目。`,
      };
    }

    return { status: "enabled", projectId: resolvedProjectId, groupId: resolvedGroupId };
  } catch {
    return { status: "disabled" };
  }
}

/**
 * isSharpEnabled — 对外兼容接口，封装 checkSharpStatus 的布尔短路径
 * 仅返回是否应该执行 SHARP（enabled 且无配置错误时返回 true）
 */
export function isSharpEnabled(agentId: string | undefined, sessionKey?: string): boolean {
  return checkSharpStatus(agentId, sessionKey).status === "enabled";
}

/**
 * evaluateSharp — 基于规则自动评估输出质量（无需 LLM，轻量实现）
 *
 * 规则打分策略（可被 supervisor 复评覆盖）：
 * - Specificity：输出字数/细节指标
 * - Helpfulness：outcome 映射（success=5, partial=3, failure=1）
 * - Accuracy：无 error 且有实质内容 = 4+
 * - Relevance：taskSummary 关键词覆盖率
 * - Professionalism：结构化程度（含列表/代码/分段）
 */
export function evaluateSharp(params: {
  agentId?: string;
  taskSummary: string;
  output: string;
  outcome: "success" | "partial" | "failure";
  hasError?: boolean;
  source?: "self" | "supervisor";
  /** 允许手动覆盖各维度分数（supervisor 复评用） */
  overrides?: Partial<
    Pick<SharpScore, "specificity" | "helpfulness" | "accuracy" | "relevance" | "professionalism">
  >;
  note?: string;
}): SharpScore {
  const {
    taskSummary,
    output,
    outcome,
    hasError = false,
    source = "self",
    overrides,
    note,
  } = params;

  // --- Specificity：输出字数越长越具体 ---
  const rawSpecificity = (() => {
    const len = output.trim().length;
    if (len >= 800) {
      return 5;
    }
    if (len >= 400) {
      return 4;
    }
    if (len >= 150) {
      return 3;
    }
    if (len >= 50) {
      return 2;
    }
    return 1;
  })();

  // --- Helpfulness：基于 outcome ---
  const rawHelpfulness = outcome === "success" ? 5 : outcome === "partial" ? 3 : 1;

  // --- Accuracy：无 error 且有实质内容 ---
  const rawAccuracy = (() => {
    if (hasError) {
      return 1;
    }
    if (output.trim().length < 20) {
      return 2;
    }
    // 检测常见错误词（极简启发式）
    const errPhrases = ["sorry", "unable to", "cannot", "错误", "失败", "无法"];
    const lc = output.toLowerCase();
    const errCount = errPhrases.filter((p) => lc.includes(p)).length;
    if (errCount >= 2) {
      return 2;
    }
    if (errCount === 1) {
      return 3;
    }
    return outcome === "success" ? 5 : 4;
  })();

  // --- Relevance：taskSummary 关键词在 output 中的覆盖率 ---
  const rawRelevance = (() => {
    const kws = extractKeywords(taskSummary);
    if (kws.length === 0) {
      return 3;
    }
    const lc = output.toLowerCase();
    const hits = kws.filter((k) => lc.includes(k)).length;
    const rate = hits / kws.length;
    if (rate >= 0.7) {
      return 5;
    }
    if (rate >= 0.5) {
      return 4;
    }
    if (rate >= 0.3) {
      return 3;
    }
    if (rate >= 0.1) {
      return 2;
    }
    return 1;
  })();

  // --- Professionalism：结构化程度 ---
  const rawProfessionalism = (() => {
    const hasList = /^[-*•\d]\./m.test(output) || /^\d+\./m.test(output);
    const hasCode = /```|`[^`]+`/.test(output);
    const hasSections = /^#{1,3}\s|^\*\*[^*]+\*\*/m.test(output);
    let score = 3;
    if (hasList) {
      score += 0.5;
    }
    if (hasCode) {
      score += 0.5;
    }
    if (hasSections) {
      score += 0.5;
    }
    if (output.length > 500 && (hasList || hasSections)) {
      score += 0.5;
    }
    return Math.min(5, Math.round(score));
  })();

  const specificity = overrides?.specificity ?? rawSpecificity;
  const helpfulness = overrides?.helpfulness ?? rawHelpfulness;
  const accuracy = overrides?.accuracy ?? rawAccuracy;
  const relevance = overrides?.relevance ?? rawRelevance;
  const professionalism = overrides?.professionalism ?? rawProfessionalism;
  const total = specificity + helpfulness + accuracy + relevance + professionalism;

  const entry: SharpScore = {
    id: genId("sharp"),
    agentId: params.agentId,
    taskSummary: taskSummary.slice(0, 200),
    outputSummary: output.slice(0, 500),
    specificity,
    helpfulness,
    accuracy,
    relevance,
    professionalism,
    total,
    source,
    createdAt: Date.now(),
  };
  if (note) {
    entry.note = note;
  }

  // 持久化
  try {
    const store = loadSharpStore(params.agentId);
    store.entries.push(entry);
    if (store.entries.length > 300) {
      store.entries = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 300);
    }
    saveJson(resolveSharpScoresFile(params.agentId), store);
  } catch {
    /* 持久化失败不影响返回结果 */
  }

  return entry;
}

/**
 * getSharpSummaryText — 获取 SHARP 历史均分摘要文本（用于 before_prompt_build 注入）
 */
export function getSharpSummaryText(
  agentId: string | undefined,
  recentN = 10,
  sessionKey?: string,
): string {
  // 仅在项目启用且配置正确时注入历史均分（error/disabled 均跳过）
  if (checkSharpStatus(agentId, sessionKey).status !== "enabled") {
    return "";
  }
  try {
    const store = loadSharpStore(agentId);
    if (store.entries.length === 0) {
      return "";
    }
    const recent = store.entries.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, recentN);
    const avg = (
      field: keyof Pick<
        SharpScore,
        "specificity" | "helpfulness" | "accuracy" | "relevance" | "professionalism" | "total"
      >,
    ) => Math.round((recent.reduce((s, e) => s + e[field], 0) / recent.length) * 10) / 10;

    const avgTotal = avg("total");
    const dims = [
      { name: "S(具体性)", val: avg("specificity") },
      { name: "H(有效性)", val: avg("helpfulness") },
      { name: "A(准确性)", val: avg("accuracy") },
      { name: "R(相关性)", val: avg("relevance") },
      { name: "P(专业性)", val: avg("professionalism") },
    ];
    const minDim = dims.reduce((a, b) => (a.val < b.val ? a : b));
    const lines = [
      `最近 ${recent.length} 次任务 SHARP 均分: ${avgTotal}/25`,
      dims.map((d) => `  ${d.name}: ${d.val}`).join(", "),
    ];
    if (minDim.val <= 2.5) {
      lines.push(`  ⚠ 最低维度「${minDim.name}」(${minDim.val}) — 本次任务请特别注意提升此维度`);
    }
    if (avgTotal < SHARP_THRESHOLD) {
      lines.push(`  ⚠ 整体质量低于门控阈值 ${SHARP_THRESHOLD}，请仔细审核输出`);
    }
    return lines.join("\n");
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

// ============================================================================
// Gap1 跨任务错误聚合（ErrorTaxonomy，业界依据: SaMuLe EMNLP 2025）
//
// 设计思路：
//   1. 扫描全部反思中 outcome=failure/partial 的条目
//   2. 把其 lessons 和 reflection 拆分为关键词
//   3. 对关键词进行频率统计，识别出高频出现的错误模式
//   4. 生成文字摘要并缓存到 error_taxonomy.json
//   5. bootstrap 注入时直接读缓存，不重复扫描
// ============================================================================

interface ErrorTaxonomyEntry {
  /** 错误模式标签（主属关键词） */
  pattern: string;
  /** 出现次数 */
  count: number;
  /** 代表性 lesson（计数最多的那条） */
  representativeLesson: string;
  /** 第一次出现时间 */
  firstSeen: number;
  /** 最近一次出现时间 */
  lastSeen: number;
}

interface ErrorTaxonomyStore {
  version: 1;
  agentId?: string;
  entries: ErrorTaxonomyEntry[];
  builtAt: number;
}

function resolveErrorTaxonomyFile(agentId?: string): string {
  return path.join(resolveEvolveDir(agentId), "error_taxonomy.json");
}

/**
 * buildErrorTaxonomy — 扩展/重建该 Agent 的跨任务错误分类法
 *
 * - 增量模式：只扫描 lastBuiltAt 之后的新反思，已有职业词表尢数据缓存
 * - 每次 autoSaveReflection 后如果新 failure 数量超过 5 条则触发增量更新
 */
export function buildErrorTaxonomy(agentId: string | undefined): ErrorTaxonomyStore {
  const filePath = resolveReflectionsFile(agentId);
  const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });
  const taxFile = resolveErrorTaxonomyFile(agentId);
  const existing = loadJson<ErrorTaxonomyStore>(taxFile, {
    version: 1,
    agentId,
    entries: [],
    builtAt: 0,
  });

  // 只处理 builtAt 之后的失败/partial 反思（增量）
  const failures = store.entries.filter(
    (e) => (e.outcome === "failure" || e.outcome === "partial") && e.createdAt > existing.builtAt,
  );

  if (failures.length === 0 && existing.entries.length > 0) {
    return existing; // 无新数据，返回缓存
  }

  // 关键词频率统计
  const kwCounter = new Map<
    string,
    { count: number; lessons: string[]; firstSeen: number; lastSeen: number }
  >();

  // 并入现有分类的计数
  for (const e of existing.entries) {
    kwCounter.set(e.pattern, {
      count: e.count,
      lessons: [e.representativeLesson],
      firstSeen: e.firstSeen,
      lastSeen: e.lastSeen,
    });
  }

  for (const entry of failures) {
    const allText = [entry.reflection, ...entry.lessons, entry.taskSummary].join(" ");
    const kws = extractKeywords(allText);
    // 只统计长度 >= 3 且不是止词的关键词
    const stopKws = new Set([
      "the",
      "and",
      "for",
      "with",
      "has",
      "not",
      "are",
      "was",
      "can",
      "may",
    ]);
    for (const kw of kws) {
      if (kw.length < 3 || stopKws.has(kw)) {
        continue;
      }
      const existing2 = kwCounter.get(kw);
      if (existing2) {
        existing2.count += 1;
        if (entry.lessons[0]) {
          existing2.lessons.push(entry.lessons[0]);
        }
        if (entry.createdAt < existing2.firstSeen) {
          existing2.firstSeen = entry.createdAt;
        }
        if (entry.createdAt > existing2.lastSeen) {
          existing2.lastSeen = entry.createdAt;
        }
      } else {
        kwCounter.set(kw, {
          count: 1,
          lessons: entry.lessons.length > 0 ? [entry.lessons[0]] : [""],
          firstSeen: entry.createdAt,
          lastSeen: entry.createdAt,
        });
      }
    }
  }

  // 只保留出现 >= 2 次的模式，按频率降序取前 20 条
  const taxEntries: ErrorTaxonomyEntry[] = Array.from(kwCounter.entries())
    .filter(([, v]) => v.count >= 2)
    .toSorted(([, a], [, b]) => b.count - a.count)
    .slice(0, 20)
    .map(([kw, v]) => ({
      pattern: kw,
      count: v.count,
      representativeLesson:
        v.lessons.filter((l) => l.length >= 8).toSorted((a, b) => b.length - a.length)[0] ||
        v.lessons[0] ||
        "",
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
    }));

  const result: ErrorTaxonomyStore = {
    version: 1,
    agentId,
    entries: taxEntries,
    builtAt: Date.now(),
  };

  try {
    saveJson(taxFile, result);
  } catch {
    /* 写入失败不影响返回结果 */
  }

  return result;
}

/**
 * getErrorTaxonomyText — 将错误分类法格式化为可注入文本
 *
 * 轻量读缓存，不重复扩展分类法。
 * 仅列出最高频 topN 模式并附上代表性 lesson。
 */
export function getErrorTaxonomyText(agentId: string | undefined, topN = 5): string {
  try {
    const taxFile = resolveErrorTaxonomyFile(agentId);
    const store = loadJson<ErrorTaxonomyStore>(taxFile, {
      version: 1,
      agentId,
      entries: [],
      builtAt: 0,
    });
    if (store.entries.length === 0) {
      return "";
    }
    const top = store.entries.slice(0, topN);
    const lines = top.map(
      (e, i) =>
        `${i + 1}. 「${e.pattern}」出现 ${e.count} 次` +
        (e.representativeLesson ? ` — ${e.representativeLesson.slice(0, 80)}` : ""),
    );
    return `你的高频错误模式（跨任务自动分析，按出现频率排序）：\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// ============================================================================
// Bootstrap 注入工具（供 bootstrap-loader.ts 调用）
// ============================================================================

/**
 * P0 技能目录摘要（用于 bootstrap 注入）
 *
 * 返回该 Agent 所有未标记 stale 的技能的摘要列表。
 * 内容极小：只有名称+分类+触发词+一行描述，不包含具体内容（避免占用 context）。
 *
 * @param agentId - 目标 Agent ID（undefined = _global）
 * @param maxEntries - 最多返回多少条技能（默认 20）
 */
export function getSkillsSummaryForBootstrap(
  agentId: string | undefined,
  maxEntries = 20,
): Array<{ id: string; name: string; category: string; description: string; triggers: string[] }> {
  try {
    const filePath = resolveSkillsFile(agentId);
    const store = loadJson<SkillStore>(filePath, { version: 1, entries: [] });
    return store.entries
      .filter((s) => !s.stale)
      .toSorted((a, b) => b.usageCount - a.usageCount || b.createdAt - a.createdAt)
      .slice(0, maxEntries)
      .map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        triggers: s.triggers,
      }));
  } catch {
    return [];
  }
}

/**
 * P1 相关反思检索（用于 bootstrap 注入）
 *
 * 基于当前任务描述和标签，用 Jaccard 相似度从历史反思中检索最相关的几条。
 * 用于任务开始时注入历史教训，防止重躈覆辙。
 *
 * @param agentId - 目标 Agent ID
 * @param contextHint - 当前任务/对话描述（用于计算相似度）
 * @param opts.limit - 最多返回条数（默认 5）
 * @param opts.minSimilarity - 最低相似度阈值（默认 0.05，较宽松）
 * @param opts.onlyFailures - 是否只返回失败类反思
 */
export function getRelevantReflectionsForBootstrap(
  agentId: string | undefined,
  contextHint: string,
  opts: { limit?: number; minSimilarity?: number; onlyFailures?: boolean } = {},
): Array<{
  id: string;
  taskSummary: string;
  outcome: string;
  reflection: string;
  lessons: string[];
  createdAt: number;
}> {
  try {
    const { limit = 5, minSimilarity = 0.05, onlyFailures = false } = opts;
    const filePath = resolveReflectionsFile(agentId);
    const store = loadJson<ReflectionStore>(filePath, { version: 1, entries: [] });
    if (store.entries.length === 0) {
      return [];
    }

    let entries = store.entries;
    if (onlyFailures) {
      entries = entries.filter((e) => e.outcome === "failure" || e.outcome === "partial");
    }

    // 计算每条反思与当前 context 的相似度
    const hintKws = extractKeywords(contextHint);
    const scored = entries
      .map((e) => ({
        entry: e,
        score:
          hintKws.length > 0
            ? keywordSimilarity(
                hintKws,
                extractKeywords([e.taskSummary, e.reflection, ...e.lessons, ...e.tags].join(" ")),
              )
            : 1, // 无 hint 时按时间倒序返回最近的
      }))
      .filter((x) => x.score >= minSimilarity)
      .toSorted((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt)
      .slice(0, limit);

    return scored.map(({ entry: e }) => ({
      id: e.id,
      taskSummary: e.taskSummary,
      outcome: e.outcome,
      reflection: e.reflection,
      lessons: e.lessons,
      createdAt: e.createdAt,
    }));
  } catch {
    return [];
  }
}

/**
 * 工具目录索引（用于 bootstrap 注入）
 *
 * 接受当前会话工具列表，按分组归类，返回极简摘要（只含 name + description 首句）。
 * 用于让 Agent 知道系统有哪些工具可用，减少「工具不知道」的幻觉，同时不占用大量 context。
 *
 * @param tools - 已构建的工具列表
 */
export function getToolsCatalogForBootstrap(
  tools: Array<{ name: string; description?: string }>,
): Array<{ group: string; tools: Array<{ name: string; desc: string }> }> {
  const groupRules: Array<{ test: (name: string) => boolean; group: string }> = [
    { test: (n) => n.startsWith("task_"), group: "任务管理" },
    { test: (n) => n.startsWith("project_"), group: "项目管理" },
    {
      test: (n) => n.startsWith("agent_") || n === "agents_list" || n.startsWith("agents_"),
      group: "Agent 管理",
    },
    { test: (n) => n.startsWith("session"), group: "会话管理" },
    {
      test: (n) =>
        n === "message" ||
        n.startsWith("group_") ||
        n.startsWith("friend_") ||
        n === "sessions_send",
      group: "消息通信",
    },
    {
      test: (n) =>
        n.startsWith("org_") ||
        n.startsWith("organization_") ||
        n.startsWith("recruit_") ||
        n === "approve_recruit" ||
        n.startsWith("training_") ||
        n.startsWith("train_") ||
        n.startsWith("assess_") ||
        n === "certify_trainer" ||
        n === "assign_training" ||
        n === "deactivate_agent" ||
        n === "activate_agent" ||
        n === "configure_agent_role" ||
        n === "assign_supervisor" ||
        n === "assign_mentor" ||
        n === "promote_agent" ||
        n === "transfer_agent" ||
        n === "transfer_skill",
      group: "组织 HR",
    },
    { test: (n) => ["read", "write", "edit", "apply_patch"].includes(n), group: "文件系统" },
    { test: (n) => ["exec", "bash", "process"].includes(n), group: "执行运行" },
    {
      test: (n) =>
        n === "agent_reflect" ||
        n.startsWith("agent_skill") ||
        n.startsWith("agent_evolve") ||
        n === "memory_save" ||
        n === "memory_search" ||
        n === "memory_get",
      group: "进化记忆",
    },
    { test: (n) => ["cron", "gateway", "nodes"].includes(n), group: "自动化" },
    {
      test: (n) => n === "web_search" || n === "web_fetch" || n === "browser",
      group: "互联网",
    },
    {
      test: (n) => n.startsWith("image") || n === "tts" || n === "canvas",
      group: "媒体创作",
    },
    {
      test: (n) =>
        n.startsWith("perm_") ||
        n === "list_pending_approvals" ||
        n === "get_approval_status" ||
        n === "cancel_approval_request" ||
        n === "approve_request" ||
        n === "reject_request",
      group: "权限审批",
    },
  ];

  const groupMap = new Map<string, Array<{ name: string; desc: string }>>();

  for (const tool of tools) {
    const matched = groupRules.find((r) => r.test(tool.name));
    const group = matched?.group ?? "其他";
    if (!groupMap.has(group)) {
      groupMap.set(group, []);
    }
    // 只取 description 的第一句（节省 token）
    const rawDesc = tool.description ?? "";
    const firstSentence = rawDesc.split(/[。.\n]/)[0]?.trim() ?? "";
    const desc = firstSentence.length > 80 ? firstSentence.slice(0, 80) + "…" : firstSentence;
    groupMap.get(group)!.push({ name: tool.name, desc });
  }

  const orderedGroups = [
    "任务管理",
    "项目管理",
    "Agent 管理",
    "会话管理",
    "消息通信",
    "组织 HR",
    "文件系统",
    "执行运行",
    "进化记忆",
    "自动化",
    "互联网",
    "媒体创作",
    "权限审批",
    "其他",
  ];

  const result: Array<{ group: string; tools: Array<{ name: string; desc: string }> }> = [];
  for (const group of orderedGroups) {
    const entries = groupMap.get(group);
    if (entries && entries.length > 0) {
      result.push({ group, tools: entries });
    }
  }
  return result;
}
