/**
 * 跨 Session 进度持久化系统
 *
 * 解决 AI Agent 最核心的痛点：每次新 session 从零开始，不知道：
 * - 上次做到哪里
 * - 踩过什么坑
 * - 下一步是什么
 *
 * 参考 Anthropic 团队的 claude-progress.txt + 标准化 git commit 设计，
 * 结合我们项目的结构化记忆系统，实现：
 * 1. 标准化的 agent-progress 状态格式
 * 2. 跨 session 任务状态恢复
 * 3. 踩坑记录与防重蹈覆辙机制
 * 4. 里程碑追踪与 sprint 记录
 * 5. 结构化 git commit 消息生成
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 任务步骤状态 */
export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

/** 单个任务步骤 */
export type ProgressStep = {
  /** 步骤ID（唯一） */
  stepId: string;
  /** 步骤描述 */
  description: string;
  /** 当前状态 */
  status: StepStatus;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 步骤输出摘要（完成时填写） */
  outcome?: string;
  /** 失败原因 */
  failReason?: string;
  /** 关联文件（已修改/创建的文件列表） */
  affectedFiles?: string[];
  /** 子步骤 */
  subSteps?: ProgressStep[];
};

/** 踩坑记录 */
export type PitfallRecord = {
  /** 踩坑时间 */
  recordedAt: number;
  /** 发生在哪个步骤 */
  stepId: string;
  /** 问题描述 */
  problem: string;
  /** 根因 */
  rootCause: string;
  /** 解决方案 */
  solution: string;
  /** 预防策略（下次避免） */
  prevention: string;
  /** 标签 */
  tags: string[];
};

/** 里程碑 */
export type Milestone = {
  /** 里程碑ID */
  milestoneId: string;
  /** 里程碑名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 目标完成时间 */
  targetAt?: number;
  /** 实际完成时间 */
  completedAt?: number;
  /** 状态 */
  status: "upcoming" | "active" | "completed" | "missed";
  /** 关联步骤 */
  stepIds: string[];
};

/** 整体进度状态 */
export type OverallStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "paused"
  | "completed"
  | "abandoned";

/** Agent Progress 文件的完整结构 */
export type AgentProgress = {
  /** 格式版本 */
  version: "1.0";

  /** 进度文件元信息 */
  meta: {
    /** Agent ID */
    agentId: string;
    /** 项目/任务名称 */
    projectName: string;
    /** 进度文件创建时间 */
    createdAt: number;
    /** 最后更新时间 */
    updatedAt: number;
    /** 最后活跃的 session key */
    lastSessionKey?: string;
    /** 当前 session 数量 */
    sessionCount: number;
  };

  /** 顶层目标 */
  goal: {
    /** 目标描述 */
    description: string;
    /** 验收标准 */
    acceptanceCriteria: string[];
    /** 预计完成时间 */
    targetCompletionAt?: number;
    /** 优先级 */
    priority: "low" | "medium" | "high" | "critical";
  };

  /** 整体状态 */
  status: OverallStatus;

  /** 阻塞原因（status=blocked 时填写） */
  blockedReason?: string;

  /** 完成进度 0-100 */
  progressPercent: number;

  /** 任务步骤列表 */
  steps: ProgressStep[];

  /** 里程碑 */
  milestones: Milestone[];

  /** 踩坑记录 */
  pitfalls: PitfallRecord[];

  /** 当前聚焦的步骤 ID（下个 session 优先处理） */
  currentFocusStepId?: string;

  /** 下个 session 的行动计划（给 AI 自己看的便条） */
  nextSessionPlan: string[];

  /** 上下文摘要（精简的背景信息，控制在 500 字以内） */
  contextSummary: string;

  /** 技术债记录 */
  technicalDebt: Array<{
    description: string;
    severity: "low" | "medium" | "high";
    recordedAt: number;
  }>;

  /** 关键决策记录 */
  decisions: Array<{
    description: string;
    rationale: string;
    recordedAt: number;
    decidedBy: string;
  }>;

  /** 关联资源 */
  resources: {
    /** 关键文件路径 */
    keyFiles: string[];
    /** 外部链接/文档 */
    externalLinks: string[];
    /** 相关 PR/Issue 编号 */
    relatedIssues: string[];
  };
};

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function generateStepId(): string {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function generateMilestoneId(): string {
  return `ms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function computeProgressPercent(steps: ProgressStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  const completed = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  return Math.round((completed / steps.length) * 100);
}

// ─────────────────────────────────────────────
// 核心：Agent Progress Manager
// ─────────────────────────────────────────────

export class AgentProgressManager {
  private storageDir: string;
  private cache: Map<string, AgentProgress> = new Map();

  constructor(opts?: { storageDir?: string }) {
    this.storageDir = opts?.storageDir ?? path.join(os.homedir(), ".openclaw", "agent-progress");
  }

  private getProgressFilePath(agentId: string, projectName: string): string {
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    return path.join(this.storageDir, agentId, `${safeName}.progress.json`);
  }

  private ensureDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 加载进度文件（session 开始时调用）
   */
  load(agentId: string, projectName: string): AgentProgress | null {
    const cacheKey = `${agentId}::${projectName}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const filePath = this.getProgressFilePath(agentId, projectName);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const progress = JSON.parse(raw) as AgentProgress;
      this.cache.set(cacheKey, progress);
      return progress;
    } catch {
      return null;
    }
  }

  /**
   * 保存进度文件
   */
  save(progress: AgentProgress): void {
    progress.meta.updatedAt = Date.now();
    progress.progressPercent = computeProgressPercent(progress.steps);

    const filePath = this.getProgressFilePath(progress.meta.agentId, progress.meta.projectName);
    this.ensureDir(filePath);

    fs.writeFileSync(filePath, JSON.stringify(progress, null, 2), "utf-8");
    this.cache.set(`${progress.meta.agentId}::${progress.meta.projectName}`, progress);
  }

  /**
   * 创建新的进度文件
   */
  create(params: {
    agentId: string;
    projectName: string;
    goal: string;
    acceptanceCriteria?: string[];
    priority?: AgentProgress["goal"]["priority"];
    sessionKey?: string;
  }): AgentProgress {
    const progress: AgentProgress = {
      version: "1.0",
      meta: {
        agentId: params.agentId,
        projectName: params.projectName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastSessionKey: params.sessionKey,
        sessionCount: 1,
      },
      goal: {
        description: params.goal,
        acceptanceCriteria: params.acceptanceCriteria ?? [],
        priority: params.priority ?? "medium",
      },
      status: "not_started",
      progressPercent: 0,
      steps: [],
      milestones: [],
      pitfalls: [],
      nextSessionPlan: [],
      contextSummary: "",
      technicalDebt: [],
      decisions: [],
      resources: {
        keyFiles: [],
        externalLinks: [],
        relatedIssues: [],
      },
    };

    this.save(progress);
    return progress;
  }

  /**
   * Session 开始时的恢复动作
   * 返回适合注入到 system prompt 的文本摘要
   */
  resumeSession(agentId: string, projectName: string, sessionKey: string): string | null {
    const progress = this.load(agentId, projectName);
    if (!progress) {
      return null;
    }

    // 更新 session 信息
    progress.meta.lastSessionKey = sessionKey;
    progress.meta.sessionCount++;
    this.save(progress);

    return this.formatForPromptInjection(progress);
  }

  /**
   * 格式化进度文件，用于注入 system prompt
   * 控制在 800 字以内（约 200 tokens），避免过多占用 context
   */
  formatForPromptInjection(progress: AgentProgress): string {
    const lines: string[] = [
      `## 当前任务进度 [session #${progress.meta.sessionCount}]`,
      `**目标**: ${progress.goal.description}`,
      `**状态**: ${progress.status} (${progress.progressPercent}%)`,
    ];

    if (progress.blockedReason) {
      lines.push(`**阻塞原因**: ${progress.blockedReason}`);
    }

    // 当前聚焦步骤
    if (progress.currentFocusStepId) {
      const step = progress.steps.find((s) => s.stepId === progress.currentFocusStepId);
      if (step) {
        lines.push(`**当前聚焦**: ${step.description}`);
      }
    }

    // 进行中的步骤
    const inProgress = progress.steps.filter((s) => s.status === "in_progress");
    if (inProgress.length > 0) {
      lines.push("**进行中**:");
      for (const s of inProgress.slice(0, 3)) {
        lines.push(`  - ${s.description}`);
      }
    }

    // 待处理步骤（最多显示3个）
    const pending = progress.steps.filter((s) => s.status === "pending");
    if (pending.length > 0) {
      lines.push(`**待处理** (${pending.length}个):`);
      for (const s of pending.slice(0, 3)) {
        lines.push(`  - ${s.description}`);
      }
      if (pending.length > 3) {
        lines.push(`  ... 还有 ${pending.length - 3} 个`);
      }
    }

    // 下个 session 计划
    if (progress.nextSessionPlan.length > 0) {
      lines.push("**本次 Session 计划**:");
      for (const plan of progress.nextSessionPlan.slice(0, 3)) {
        lines.push(`  • ${plan}`);
      }
    }

    // 最近踩坑（最多显示2个）
    const recentPitfalls = progress.pitfalls.slice(-2);
    if (recentPitfalls.length > 0) {
      lines.push("**注意避免**:");
      for (const p of recentPitfalls) {
        lines.push(`  ⚠️ ${p.problem} → ${p.prevention}`);
      }
    }

    return lines.join("\n");
  }

  // ─────────────────────────────────────────────
  // 步骤管理
  // ─────────────────────────────────────────────

  addStep(
    progress: AgentProgress,
    params: {
      description: string;
      afterStepId?: string;
      subStepOf?: string;
    },
  ): ProgressStep {
    const step: ProgressStep = {
      stepId: generateStepId(),
      description: params.description,
      status: "pending",
    };

    if (params.subStepOf) {
      const parent = progress.steps.find((s) => s.stepId === params.subStepOf);
      if (parent) {
        parent.subSteps = parent.subSteps ?? [];
        parent.subSteps.push(step);
      } else {
        progress.steps.push(step);
      }
    } else if (params.afterStepId) {
      const idx = progress.steps.findIndex((s) => s.stepId === params.afterStepId);
      if (idx >= 0) {
        progress.steps.splice(idx + 1, 0, step);
      } else {
        progress.steps.push(step);
      }
    } else {
      progress.steps.push(step);
    }

    this.save(progress);
    return step;
  }

  startStep(progress: AgentProgress, stepId: string): void {
    const step = this.findStep(progress, stepId);
    if (step) {
      step.status = "in_progress";
      step.startedAt = Date.now();
      progress.status = "in_progress";
      progress.currentFocusStepId = stepId;
      this.save(progress);
    }
  }

  completeStep(
    progress: AgentProgress,
    stepId: string,
    params?: { outcome?: string; affectedFiles?: string[] },
  ): void {
    const step = this.findStep(progress, stepId);
    if (step) {
      step.status = "completed";
      step.completedAt = Date.now();
      step.outcome = params?.outcome;
      step.affectedFiles = params?.affectedFiles;

      if (progress.currentFocusStepId === stepId) {
        // 自动推进到下一个 pending 步骤
        const nextPending = progress.steps.find((s) => s.status === "pending");
        progress.currentFocusStepId = nextPending?.stepId;
      }

      this.save(progress);
    }
  }

  failStep(progress: AgentProgress, stepId: string, failReason: string): void {
    const step = this.findStep(progress, stepId);
    if (step) {
      step.status = "failed";
      step.completedAt = Date.now();
      step.failReason = failReason;
      progress.status = "blocked";
      progress.blockedReason = `步骤 "${step.description}" 失败: ${failReason}`;
      this.save(progress);
    }
  }

  private findStep(progress: AgentProgress, stepId: string): ProgressStep | undefined {
    for (const step of progress.steps) {
      if (step.stepId === stepId) {
        return step;
      }
      if (step.subSteps) {
        const sub = step.subSteps.find((s) => s.stepId === stepId);
        if (sub) {
          return sub;
        }
      }
    }
    return undefined;
  }

  // ─────────────────────────────────────────────
  // 踩坑记录
  // ─────────────────────────────────────────────

  recordPitfall(
    progress: AgentProgress,
    params: {
      stepId: string;
      problem: string;
      rootCause: string;
      solution: string;
      prevention: string;
      tags?: string[];
    },
  ): void {
    progress.pitfalls.push({
      recordedAt: Date.now(),
      stepId: params.stepId,
      problem: params.problem,
      rootCause: params.rootCause,
      solution: params.solution,
      prevention: params.prevention,
      tags: params.tags ?? [],
    });
    this.save(progress);
  }

  // ─────────────────────────────────────────────
  // 里程碑
  // ─────────────────────────────────────────────

  addMilestone(
    progress: AgentProgress,
    params: { name: string; description: string; stepIds: string[]; targetAt?: number },
  ): Milestone {
    const milestone: Milestone = {
      milestoneId: generateMilestoneId(),
      name: params.name,
      description: params.description,
      stepIds: params.stepIds,
      targetAt: params.targetAt,
      status: "upcoming",
    };
    progress.milestones.push(milestone);
    this.save(progress);
    return milestone;
  }

  completeMilestone(progress: AgentProgress, milestoneId: string): void {
    const ms = progress.milestones.find((m) => m.milestoneId === milestoneId);
    if (ms) {
      ms.status = "completed";
      ms.completedAt = Date.now();
      this.save(progress);
    }
  }

  // ─────────────────────────────────────────────
  // Session 结束时的收尾动作
  // ─────────────────────────────────────────────

  /**
   * Session 结束时调用，更新下个 session 的计划
   */
  closeSession(
    progress: AgentProgress,
    params: {
      nextSessionPlan: string[];
      contextSummary?: string;
      newDecisions?: Array<{ description: string; rationale: string; decidedBy: string }>;
      newTechDebt?: Array<{ description: string; severity: "low" | "medium" | "high" }>;
      newKeyFiles?: string[];
    },
  ): void {
    progress.nextSessionPlan = params.nextSessionPlan;

    if (params.contextSummary) {
      progress.contextSummary = params.contextSummary.slice(0, 800); // 严格限制长度
    }

    if (params.newDecisions) {
      for (const d of params.newDecisions) {
        progress.decisions.push({ ...d, recordedAt: Date.now() });
      }
    }

    if (params.newTechDebt) {
      for (const td of params.newTechDebt) {
        progress.technicalDebt.push({ ...td, recordedAt: Date.now() });
      }
    }

    if (params.newKeyFiles) {
      progress.resources.keyFiles = [
        ...new Set([...progress.resources.keyFiles, ...params.newKeyFiles]),
      ];
    }

    // 如果所有步骤完成，自动标记整体完成
    const allDone = progress.steps.every((s) => s.status === "completed" || s.status === "skipped");
    if (allDone && progress.steps.length > 0) {
      progress.status = "completed";
      progress.progressPercent = 100;
    }

    this.save(progress);
  }

  /**
   * 生成标准化 git commit 消息
   * 格式与 Conventional Commits 兼容，且包含进度信息
   */
  generateCommitMessage(
    progress: AgentProgress,
    params: {
      type: "feat" | "fix" | "chore" | "docs" | "refactor" | "test";
      scope?: string;
      subject: string;
      completedStepIds?: string[];
    },
  ): string {
    const completedSteps = (params.completedStepIds ?? [])
      .map((id) => this.findStep(progress, id))
      .filter(Boolean) as ProgressStep[];

    const header = `${params.type}${params.scope ? `(${params.scope})` : ""}: ${params.subject}`;

    const bodyLines: string[] = [
      `Progress: ${progress.progressPercent}% [${progress.status}]`,
      `Project: ${progress.meta.projectName}`,
      `Session: #${progress.meta.sessionCount}`,
    ];

    if (completedSteps.length > 0) {
      bodyLines.push("", "Completed steps:");
      for (const step of completedSteps) {
        bodyLines.push(`  - ${step.description}`);
        if (step.affectedFiles && step.affectedFiles.length > 0) {
          bodyLines.push(`    files: ${step.affectedFiles.join(", ")}`);
        }
      }
    }

    if (progress.currentFocusStepId) {
      const nextStep = this.findStep(progress, progress.currentFocusStepId);
      if (nextStep) {
        bodyLines.push("", `Next: ${nextStep.description}`);
      }
    }

    return [header, "", ...bodyLines].join("\n");
  }

  /**
   * 列出所有进度文件（用于 Agent 自发现）
   */
  listAll(agentId: string): Array<{
    projectName: string;
    status: OverallStatus;
    progressPercent: number;
    updatedAt: number;
  }> {
    const agentDir = path.join(this.storageDir, agentId);
    if (!fs.existsSync(agentDir)) {
      return [];
    }

    const results: Array<{
      projectName: string;
      status: OverallStatus;
      progressPercent: number;
      updatedAt: number;
    }> = [];

    try {
      const files = fs.readdirSync(agentDir).filter((f) => f.endsWith(".progress.json"));
      for (const file of files) {
        const fullPath = path.join(agentDir, file);
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const p = JSON.parse(raw) as AgentProgress;
          results.push({
            projectName: p.meta.projectName,
            status: p.status,
            progressPercent: p.progressPercent,
            updatedAt: p.meta.updatedAt,
          });
        } catch {
          // 跳过损坏的文件
        }
      }
    } catch {
      // 目录不存在或无法读取
    }

    return results.toSorted((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 删除进度文件（任务彻底完成后清理）
   */
  delete(agentId: string, projectName: string): void {
    const filePath = this.getProgressFilePath(agentId, projectName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.cache.delete(`${agentId}::${projectName}`);
  }
}

// ─────────────────────────────────────────────
// 全局单例
// ─────────────────────────────────────────────

let _globalProgressManager: AgentProgressManager | null = null;

export function getAgentProgressManager(opts?: { storageDir?: string }): AgentProgressManager {
  if (!_globalProgressManager) {
    _globalProgressManager = new AgentProgressManager(opts);
  }
  return _globalProgressManager;
}

export function resetAgentProgressManager(): void {
  _globalProgressManager = null;
}

// ─────────────────────────────────────────────
// TaskProgressNote → AgentProgress 桥接
// ─────────────────────────────────────────────

/**
 * 将 Task.progressNotes 桥接同步到 AgentProgress 进化系统
 *
 * TaskProgressNote 是任务级的 append-only 学习记录（对应 Ralph 的 progress.txt）。
 * AgentProgress 是 Agent 跨 session 的进化载体。
 *
 * 桥接规则（基于关键词识别）：
 * - 含「坑/问题/错误/失败/注意/警告/gotcha/bug/avoid」→ 写入 pitfalls
 * - 含「下一步/next/todo/接下来/计划/建议」         → 写入 nextSessionPlan
 * - 含「决策/决定/选择/方案/why/因为/原因」          → 写入 decisions
 * - 含「债/临时/todo:tech/hack/workaround」          → 写入 technicalDebt
 * - 其余内容                                          → 更新 contextSummary
 *
 * 调用时机：appendProgressNote() 后，或任务状态变为 done 时。
 *
 * @param notes   Task.progressNotes（全量或增量均可，函数内去重）
 * @param agentId 执行此任务的 agent ID（取 task.assignees[0].id 即可）
 * @param projectName 关联的项目名（取 task.projectId 或 task.title 兜底）
 * @param manager 可选，默认使用全局单例
 */
export function syncProgressNotesToAgentProgress(
  notes: Array<{ id: string; content: string; authorId: string; createdAt: number }>,
  agentId: string,
  projectName: string,
  manager?: AgentProgressManager,
): void {
  if (!notes || notes.length === 0) {
    return;
  }
  const mgr = manager ?? getAgentProgressManager();
  let progress = mgr.load(agentId, projectName);
  if (!progress) {
    // AgentProgress 不存在时不自动创建，避免副作用
    return;
  }

  // 已同步的 note ID 集合（存在 contextSummary 前缀标记中，避免重复写入）
  const syncedKey = `__synced_note_ids__`;
  const syncedRaw = (progress as Record<string, unknown>)[syncedKey];
  const synced = new Set<string>(Array.isArray(syncedRaw) ? (syncedRaw as string[]) : []);

  const pitfallKeywords = /坑|问题|错误|失败|注意|警告|gotcha|bug|avoid|陷阱|踩坑/i;
  const planKeywords = /下一步|next|todo|接下来|计划|建议|需要|should|will/i;
  const decisionKeywords = /决策|决定|选择|方案|why|因为|原因|理由|架构/i;
  const debtKeywords = /债|临时|hack|workaround|tech.?debt|TODO.*tech|待优化/i;

  let hasNewContent = false;

  for (const note of notes) {
    if (synced.has(note.id)) {
      continue; // 已同步，跳过
    }
    synced.add(note.id);
    hasNewContent = true;
    const text = note.content.trim();

    if (pitfallKeywords.test(text)) {
      // → pitfalls
      progress.pitfalls.push({
        recordedAt: note.createdAt,
        stepId: "task-progress-note",
        problem: text.slice(0, 200),
        rootCause: "",
        solution: "",
        prevention: text.slice(0, 200),
        tags: ["auto-synced-from-task"],
      });
    } else if (planKeywords.test(text)) {
      // → nextSessionPlan
      const entry = text.slice(0, 200);
      if (!progress.nextSessionPlan.includes(entry)) {
        progress.nextSessionPlan.push(entry);
      }
    } else if (decisionKeywords.test(text)) {
      // → decisions
      progress.decisions.push({
        description: text.slice(0, 200),
        rationale: "",
        recordedAt: note.createdAt,
        decidedBy: note.authorId,
      });
    } else if (debtKeywords.test(text)) {
      // → technicalDebt
      progress.technicalDebt.push({
        description: text.slice(0, 200),
        severity: "medium",
        recordedAt: note.createdAt,
      });
    } else {
      // → contextSummary（追加，控制总长度在 800 字以内）
      const appended = progress.contextSummary ? `${progress.contextSummary}\n${text}` : text;
      progress.contextSummary = appended.slice(-800);
    }
  }

  if (hasNewContent) {
    // 记录已同步的 note ID，防止重复
    (progress as Record<string, unknown>)[syncedKey] = [...synced];
    mgr.save(progress);
  }
}
