/**
 * Project Context Utilities
 *
 * 用于在矩阵式管理模式下，根据任务的项目 ID 动态切换工作上下文
 *
 * 核心功能:
 * 1. 解析项目工作空间路径
 * 2. 加载项目共享记忆
 * 3. 获取项目代码目录
 * 4. 构建项目上下文环境
 *
 * 任务类型说明：
 *   本文件不再定义任务相关类型，全部从 tasks/types.ts 导入使用。
 *   Sprint 任务存储类型使用 Task（所有字段完全兼容）。
 */

import * as fs from "fs";
import * as path from "path";

// 任务类型：唯一数据源 tasks/types.ts
export type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
  WorkItemLevel,
  normalizeTaskStatus,
} from "../tasks/types.js";
// 向后兼容别名：旧代码可能使用 ProjectTask 作为类型名
import type { Task } from "../tasks/types.js";
/** @deprecated 请改用 Task（from tasks/types.ts）。此别名仅为历史向后兼容保留，不展开新用途。 */
export type ProjectTask = Task;

/**
 * 项目上下文信息
 */
export interface ProjectContext {
  /** 项目 ID */
  projectId: string;
  /** 项目群组工作空间路径 (e.g., H:\OpenClaw_Workspace\groups\wo-shi-renlei) */
  workspacePath: string;
  /** 项目共享记忆文件路径 */
  sharedMemoryPath: string;
  /** 项目代码目录路径 (可能在 workspace 内，也可能在其他位置) */
  codeDir: string;
  /** 项目文档目录路径 */
  docsDir: string;
  /** 项目决策记录目录 */
  decisionsDir: string;
  /**
   * 进展笔记目录：{workspacePath}/.notes/
   *
   * 每个有 progressNotes 的任务会在此目录生成一个同名 Markdown 文件。
   * 点开头表示「工具生成」，与 docs/、decisions/ 等人工目录区分。
   * SQLite 是权威数据源，此目录是供人类/AI 直接阅读的只读镜像。
   */
  notesDir: string;
  /** 项目配置对象 (如果存在 PROJECT_CONFIG.json) */
  config?: ProjectConfig;
}

/** 项目生命周期状态 */
export type ProjectStatus =
  | "requirements" // 需求提炼阶段
  | "design" // 架构设计阶段
  | "planning" // 计划/排期阶段
  | "development" // 开发中
  | "testing" // 测试阶段
  | "review" // 评审/验收阶段
  | "active" // 运行中（已上线，持续迭代）
  | "dev_done" // 开发完成（待上线）
  | "operating" // 运营维护
  | "maintenance" // 维护模式
  | "paused" // 暂停中
  | "completed" // 已完成/归档
  | "deprecated" // 已废弃
  | "cancelled"; // 已终止

/**
 * 项目状态元信息：中文标签 + 允许安排的工作类型 + 推荐参与 Agent 角色
 *
 * 主控（coordinator）在心跳补充任务时应参考此表决定安排何种工作。
 */
export interface ProjectStatusMeta {
  /** 中文显示标签 */
  label: string;
  /** 当前阶段允许安排的工作类型描述 */
  allowedWork: string[];
  /** 推荐参与的 Agent 角色（角色名，非 ID） */
  recommendedRoles: string[];
  /** 项目是否处于活跃可执行状态（false=暂停/终止，不应再分配新任务） */
  isActive: boolean;
}

/** 所有项目状态的元信息映射表 */
export const PROJECT_STATUS_META: Record<ProjectStatus, ProjectStatusMeta> = {
  requirements: {
    label: "需求提炼",
    allowedWork: ["需求调研与分析", "用户故事编写", "功能列表整理", "竞品分析", "需求文档撰写"],
    recommendedRoles: ["product-analyst", "doc-writer", "coordinator"],
    isActive: true,
  },
  design: {
    label: "架构设计",
    allowedWork: ["系统架构设计", "数据库设计", "API 接口设计", "UI/UX 原型", "技术方案评审"],
    recommendedRoles: ["team-member", "product-analyst", "doc-writer"],
    isActive: true,
  },
  planning: {
    label: "计划排期",
    allowedWork: ["Sprint 规划", "任务拆解", "工作量估算", "里程碑制定", "风险识别"],
    recommendedRoles: ["coordinator", "product-analyst"],
    isActive: true,
  },
  development: {
    label: "开发中",
    allowedWork: ["功能开发", "代码审查", "单元测试编写", "技术文档更新", "Bug 修复"],
    recommendedRoles: ["team-member", "devops-engineer", "qa-lead"],
    isActive: true,
  },
  testing: {
    label: "测试阶段",
    allowedWork: ["功能测试", "集成测试", "性能测试", "Bug 报告与跟踪", "测试报告编写"],
    recommendedRoles: ["qa-lead", "team-member", "doc-writer"],
    isActive: true,
  },
  review: {
    label: "评审验收",
    allowedWork: ["代码复查", "需求验收", "用户验收测试", "上线准备", "发布文档"],
    recommendedRoles: ["coordinator", "qa-lead", "doc-writer"],
    isActive: true,
  },
  active: {
    label: "运行中",
    allowedWork: ["新功能迭代", "线上问题跟踪", "性能优化", "用户反馈处理"],
    recommendedRoles: ["team-member", "devops-engineer", "qa-lead"],
    isActive: true,
  },
  dev_done: {
    label: "开发完成",
    allowedWork: ["上线准备", "环境配置", "部署脚本", "发布文档", "最终测试"],
    recommendedRoles: ["devops-engineer", "qa-lead", "doc-writer"],
    isActive: true,
  },
  operating: {
    label: "运营维护",
    allowedWork: ["监控告警配置", "运营数据分析", "日常维护", "文档完善"],
    recommendedRoles: ["devops-engineer", "doc-writer"],
    isActive: true,
  },
  maintenance: {
    label: "维护模式",
    allowedWork: ["紧急修复", "安全补丁", "依赖升级", "文档更新"],
    recommendedRoles: ["team-member", "devops-engineer"],
    isActive: true,
  },
  paused: {
    label: "暂停中",
    allowedWork: [],
    recommendedRoles: [],
    isActive: false,
  },
  completed: {
    label: "已完成",
    allowedWork: [],
    recommendedRoles: [],
    isActive: false,
  },
  deprecated: {
    label: "已废弃",
    allowedWork: [],
    recommendedRoles: [],
    isActive: false,
  },
  cancelled: {
    label: "已终止",
    allowedWork: [],
    recommendedRoles: [],
    isActive: false,
  },
};

/**
 * 获取项目状态元信息（含中文标签和工作建议）
 * 未知状态回退到 planning 的 meta
 */
export function getProjectStatusMeta(status: string | undefined): ProjectStatusMeta {
  if (!status) {
    return PROJECT_STATUS_META["planning"];
  }
  return PROJECT_STATUS_META[status as ProjectStatus] ?? PROJECT_STATUS_META["planning"];
}

/**
 * Sprint 状态
 * planning  = 待规划（尚未开始，可以往里加任务）
 * active    = 进行中（当前正在执行的 Sprint）
 * completed = 已完成（Sprint 结束，数据归档）
 * cancelled = 已取消
 */
export type SprintStatus = "planning" | "active" | "completed" | "cancelled";

/**
 * 项目 Sprint / 阶段（借鉴 Scrum Sprint 概念）
 * 一个有时间边界的迭代周期，包含一批任务
 */
export interface ProjectSprint {
  id: string;
  title: string;
  /** Sprint 状态（planning/active/completed/cancelled） */
  status?: SprintStatus;
  /** Sprint 目标（类似 Scrum Sprint Goal） */
  goal?: string;
  /** Sprint 开始时间 */
  startDate?: number;
  /** Sprint 截止时间 */
  endDate?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 排序序号（从1开始）*/
  order: number;
  /** 包含的任务列表（使用统一的 Task 接口） */
  tasks: Task[];
  /** Sprint 速度记录（已完成的 Story Points 总量） */
  velocity?: number;
  /** Sprint 回顾备注 */
  retrospective?: string;
}

/** 计算 Sprint 的完成进度（基于 done 任务的 storyPoints 或任务数量）*/
export function calcSprintProgress(sprint: ProjectSprint): number {
  const tasks = sprint.tasks.filter((t) => t.status !== "cancelled");
  if (tasks.length === 0) {
    return 0;
  }
  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const donePoints = tasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  return totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 100);
}

/** 计算项目整体进度（基于所有 Sprint 的加权平均）*/
export function calcProjectProgress(sprints: ProjectSprint[]): number {
  if (sprints.length === 0) {
    return 0;
  }
  const allTasks = sprints.flatMap((s) => s.tasks).filter((t) => t.status !== "cancelled");
  if (allTasks.length === 0) {
    return 0;
  }
  const total = allTasks.reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const done = allTasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** 向后兼容：保留 ProjectMilestone 类型别名 */
export type ProjectMilestone = ProjectSprint;

// ============================================================================
// DoD（Definition of Done）完成门禁系统
// ============================================================================

/**
 * 单条验收标准条目
 *
 * 业界实践（Scrum/SAFe）：每条 AC 必须可验证、有明确证据。
 * Agent 必须逐条证明满足，不可跳过。
 */
export interface AcceptanceCriterion {
  /** 标准 ID（自动生成） */
  id: string;
  /** 标准描述（必须具体可验证，禁止模糊表述如"功能完善"、"基本完成"） */
  description: string;
  /**
   * 验证方式：
   * - manual: 需要人工确认
   * - automated: 自动化测试/脚本可验证
   * - evidence: 提供可检查产出物（文件路径/测试输出/截图链接等）
   */
  verificationType: "manual" | "automated" | "evidence";
  /** 是否已满足 */
  satisfied: boolean;
  /** 满足时间戳（Unix ms） */
  satisfiedAt?: number;
  /** 满足该条标准的证据（文件路径/测试输出等，必须可追源） */
  evidence?: string;
  /** 由谁确认满足（Agent ID 或 "human"） */
  satisfiedBy?: string;
}

/**
 * 完成门禁（Completion Gate / DoD Gate）
 *
 * 这是解决"无尽开发、循环开发"问题的核心机制。
 *
 * 设计原则（来自业界最佳实践）：
 * 1. [Scrum DoD] 所有标准全部满足才算完成，缺一不可
 * 2. [SAFe Feature AC] 每条标准必须有可追源的证据
 * 3. [DUN Ladder for AI] 最高级验收节点需人工最终确认，防止 Agent 自欺欺人
 * 4. [Scope Freeze] 项目完成后自动冻结范围，主控禁止再创建新任务
 */
export interface ProjectCompletionGate {
  /**
   * 验收标准列表（结构化 DoD，取代原 acceptanceCriteria 字符串）。
   * 创建项目时必须至少提供1条，否则项目无法被判定为完成。
   */
  criteria: AcceptanceCriterion[];
  /**
   * 是否需要人工最终确认（默认 true，强烈建议保持 true）。
   * true  = 所有标准满足后，仍需人类点击"确认完成"才关闭
   * false = 所有标准满足后自动关闭（仅适用于全自动化可验证的纯技术项目）
   */
  requireHumanSignOff: boolean;
  /** 人工确认时间戳（requireHumanSignOff=true 时，有此字段才可设 completed） */
  humanSignOffAt?: number;
  /** 确认人（人类用户 ID 或姓名） */
  humanSignOffBy?: string;
  /** 确认备注（可记录最终验收意见） */
  humanSignOffNote?: string;
  /**
   * 范围冻结（Scope Freeze）开关。
   * true  = 主控无法再为该项目创建任何新任务（从根本上阻止"无尽开发"）
   * false = 正常开发状态
   * 自动触发：项目进入 completed 或 cancelled 时自动设为 true
   * 解冻：需人工将项目状态改回 development/active 并明确说明原因
   */
  scopeFrozen: boolean;
  /** 范围冻结时间戳 */
  scopeFrozenAt?: number;
  /** 冻结原因 */
  scopeFrozenReason?: "completed" | "cancelled" | "human_decision";
}

/**
 * 检查项目完成门禁是否全部满足，返回当前进度与差距。
 *
 * coordinator 必须在每次心跳补充任务前调用此函数：
 * - canClose=true  → 更新项目状态为 completed，停止分配新任务
 * - canClose=false → 检查 gaps，优先分配能补齐差距的任务
 */
export function checkCompletionGate(gate: ProjectCompletionGate): {
  allSatisfied: boolean;
  unsatisfied: AcceptanceCriterion[];
  progress: { satisfied: number; total: number; percent: number };
  canClose: boolean;
  gaps: string[];
} {
  const unsatisfied = gate.criteria.filter((c) => !c.satisfied);
  const allSatisfied = unsatisfied.length === 0 && gate.criteria.length > 0;
  const humanOk = !gate.requireHumanSignOff || Boolean(gate.humanSignOffAt);
  const canClose = allSatisfied && humanOk;
  const total = gate.criteria.length;
  const satisfiedCount = total - unsatisfied.length;

  const gaps: string[] = [];
  if (total === 0) {
    gaps.push(
      "⚠️ [缺少DoD] 该项目未定义任何验收标准，无法判定完成！请立即补充 completionGate.criteria",
    );
  } else {
    for (const c of unsatisfied) {
      gaps.push(`\u274c [未满足] ${c.description}（验证方式: ${c.verificationType}）`);
    }
  }
  if (allSatisfied && gate.requireHumanSignOff && !gate.humanSignOffAt) {
    gaps.push("⏳ [待人工签收] 所有验收标准已满足，等待负责人最终确认");
  }

  return {
    allSatisfied,
    unsatisfied,
    progress: {
      satisfied: satisfiedCount,
      total,
      percent: total === 0 ? 0 : Math.round((satisfiedCount / total) * 100),
    },
    canClose,
    gaps,
  };
}

/**
 * 项目配置文件结构
 */
export interface ProjectConfig {
  /** 项目 ID */
  projectId: string;
  /** 项目名称（可选，显示用） */
  name?: string;
  /** 项目描述（可选） */
  description?: string;
  /** 工作空间路径 */
  workspacePath: string;
  /** 代码目录路径 (可选，默认在 workspace/src) */
  codeDir?: string;
  /** 文档目录路径 (可选，默认在 workspace/docs) */
  docsDir?: string;
  /** 需求目录路径 (可选，默认在 workspace/requirements) */
  requirementsDir?: string;
  // ===== 进度管理字段 =====
  /** 项目状态 */
  status?: ProjectStatus;
  /**
   * 整体进度 0-100。
   * 若有 sprints 则由 calcProjectProgress(sprints) 自动计算，手动字段仅作兜底缓存。
   */
  progress?: number;
  /** 截止时间（Unix 毫秒时间戳） */
  deadline?: number;
  /**
   * Sprint 列表（主要进度载体，替代原里程碑）
   * 每个 Sprint 内含 tasks，整体进度由此自动计算
   */
  sprints?: ProjectSprint[];
  /** 向后兼容：原 milestones 字段，优先使用 sprints */
  milestones?: ProjectSprint[];
  /** Backlog 任务列表（未分配到 Sprint 的任务，使用统一的 Task 接口） */
  backlog?: Task[];
  /**
   * ✅ 完成门禁（DoD - Definition of Done）【强烈建议在创建项目时填写】
   *
   * 这是解决"无尽开发、循环开发"问题的核心。
   * 项目必须在此明确定义"什么时候算完成"，coordinator 每次补充任务前会检查此项。
   * 若所有标准已满足（+ 人工确认），项目进入 completed，主控停止分配新任务。
   */
  completionGate?: ProjectCompletionGate;
  /**
   * @deprecated 请使用 completionGate.criteria 代替。
   * 旧版验收标准字符串字段，保留向后兼容，新项目请改用 completionGate。
   */
  acceptanceCriteria?: string;
  /** 最后一次进度更新的备注 */
  progressNotes?: string;
  /** 进度最后更新时间 */
  progressUpdatedAt?: number;
  /** 创建时间 */
  createdAt?: number;
  /**
   * 项目级工具策略（可选）。
   * 在 Agent 级策略之后生效，可用于按项目类型限制工具访问。
   * 例如纯写作项目可禁用 exec/write/edit 等代码构建工具。
   *
   * 语义与 .openclaw.json 中的 tools.allow/deny 一致：
   *   deny 优先于 allow；deny 命中即拒绝，无论 allow 怎么配。
   */
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  /**
   * 是否启用 SHARP 质量门控（项目级开关，默认关闭）。
   * 适合代码/工程类项目开启，对话/创意类项目建议关闭。
   * 启用后，本项目内所有 Agent 的任务输出都会被 SHARP 自动评分。
   */
  sharpEnabled?: boolean;
  /**
   * OKR 对齐：项目关联的目标 ID（可属于组织或团队的 OKR）
   */
  objectiveId?: string;
  /**
   * OKR 对齐：项目关联的关键结果 ID
   */
  keyResultId?: string;
  /**
   * Initiative ID（如果该项目属于更大战略计划）
   */
  initiativeId?: string;
}

/**
 * 默认的工作组根目录
 *
 * 优先级:
 * 1. 环境变量 OPENCLAW_GROUPS_ROOT
 * 2. 配置文件中的 groups.workspace.root
 * 3. 默认值 H:\\OpenClaw_Workspace\\groups
 */
const DEFAULT_WORKSPACE_ROOT = process.env.OPENCLAW_GROUPS_ROOT || "H:\\OpenClaw_Workspace\\groups";

/**
 * 获取工作组根目录
 *
 * @param configRoot - 配置文件中指定的根目录 (可选)
 * @returns 工作组根目录路径
 */
export function getGroupsWorkspaceRoot(configRoot?: string): string {
  // 1. 优先使用配置文件中指定的根目录
  if (configRoot && typeof configRoot === "string") {
    return path.resolve(configRoot);
  }

  // 2. 使用环境变量
  if (process.env.OPENCLAW_GROUPS_ROOT) {
    return path.resolve(process.env.OPENCLAW_GROUPS_ROOT);
  }

  // 3. 返回默认值
  return DEFAULT_WORKSPACE_ROOT;
}

/**
 * 根据项目 ID 解析项目工作空间路径
 *
 * @param projectId - 项目 ID (e.g., "wo-shi-renlei", "PolyVault")
 * @param workspaceRoot - 工作组根目录，默认为 H:\OpenClaw_Workspace\groups
 * @returns 项目工作空间完整路径
 *
 * @example
 * ```typescript
 * // 返回："H:\\OpenClaw_Workspace\\groups\\wo-shi-renlei"
 * resolveProjectWorkspace("wo-shi-renlei");
 *
 * // 返回："I:\\Projects\\PolyVault"
 * resolveProjectWorkspace("PolyVault", "I:\\Projects");
 * ```
 */
export function resolveProjectWorkspace(projectId: string, workspaceRoot?: string): string {
  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const root = getGroupsWorkspaceRoot(workspaceRoot);
  return path.join(root, projectId);
}

/**
 * 构建项目上下文对象
 *
 * @param projectId - 项目 ID
 * @param workspaceRoot - 工作组根目录
 * @returns 项目上下文信息
 *
 * @example
 * ```typescript
 * const ctx = buildProjectContext("wo-shi-renlei");
 * console.log(ctx.workspacePath);      // H:\OpenClaw_Workspace\groups\wo-shi-renlei
 * console.log(ctx.sharedMemoryPath);   // H:\OpenClaw_Workspace\groups\wo-shi-renlei\SHARED_MEMORY.md
 * console.log(ctx.codeDir);            // I:\Projects\wo-shi-renlei\src (如果配置了)
 *                                      // 或 H:\OpenClaw_Workspace\groups\wo-shi-renlei\src (默认)
 * ```
 */
export function buildProjectContext(projectId: string, workspaceRoot?: string): ProjectContext {
  const root = getGroupsWorkspaceRoot(workspaceRoot);
  const workspacePath = resolveProjectWorkspace(projectId, root);

  // 尝试读取项目配置
  const config = readProjectConfig(workspacePath);

  // 使用配置中的路径，或使用默认值
  const codeDir = config?.codeDir || path.join(workspacePath, "src");
  const docsDir = config?.docsDir || path.join(workspacePath, "docs");

  return {
    projectId,
    workspacePath,
    sharedMemoryPath: path.join(workspacePath, "SHARED_MEMORY.md"),
    codeDir,
    docsDir,
    decisionsDir: path.join(workspacePath, "decisions"),
    notesDir: path.join(workspacePath, ".notes"),
    config: config ?? undefined,
  };
}

/**
 * 读取项目配置文件
 *
 * @param workspacePath - 项目工作空间路径
 * @returns 项目配置对象，如果不存在返回 null
 */
export function readProjectConfig(workspacePath: string): ProjectConfig | null {
  try {
    const configPath = path.join(workspacePath, "PROJECT_CONFIG.json");

    if (!fs.existsSync(configPath)) {
      return null;
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as ProjectConfig;

    // 向后兼容：将旧版 ProjectTask 状态标识符转换为统一格式
    // 旧格式: in_progress / in_review （下划线）
    // 新格式: in-progress / review   （连字符）
    const normalize = (s: string): string => {
      const map: Record<string, string> = { in_progress: "in-progress", in_review: "review" };
      return map[s] ?? s;
    };
    const normalizeTasks = (tasks: unknown[]): unknown[] =>
      tasks.map((t) => {
        const task = t as Record<string, unknown>;
        if (typeof task.status === "string") {
          return { ...task, status: normalize(task.status) };
        }
        return task;
      });

    if (config.sprints) {
      config.sprints = config.sprints.map((s) => ({
        ...s,
        tasks: normalizeTasks(s.tasks ?? []) as never,
      }));
    }
    if (config.milestones) {
      config.milestones = config.milestones.map((s) => ({
        ...s,
        tasks: normalizeTasks(s.tasks ?? []) as never,
      }));
    }
    if (config.backlog) {
      config.backlog = normalizeTasks(config.backlog) as never;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * 检查项目工作空间是否存在
 *
 * @param projectId - 项目 ID
 * @param workspaceRoot - 工作组根目录
 * @returns 如果项目目录存在返回 true
 */
export function projectWorkspaceExists(projectId: string, workspaceRoot?: string): boolean {
  try {
    const root = getGroupsWorkspaceRoot(workspaceRoot);
    const workspacePath = resolveProjectWorkspace(projectId, root);
    return fs.existsSync(workspacePath);
  } catch {
    return false;
  }
}

/**
 * 读取项目共享记忆
 *
 * @param projectId - 项目 ID
 * @param workspaceRoot - 工作组根目录
 * @returns 项目共享记忆内容，如果不存在返回 null
 */
export function readProjectSharedMemory(projectId: string, workspaceRoot?: string): string | null {
  try {
    const root = getGroupsWorkspaceRoot(workspaceRoot);
    const context = buildProjectContext(projectId, root);

    if (!fs.existsSync(context.sharedMemoryPath)) {
      return null;
    }

    return fs.readFileSync(context.sharedMemoryPath, "utf-8");
  } catch (error) {
    console.error(`[ProjectContext] Failed to read shared memory for ${projectId}:`, error);
    return null;
  }
}

/**
 * 列出所有可用的项目
 *
 * @param workspaceRoot - 工作组根目录
 * @returns 项目 ID 列表
 */
export function listAvailableProjects(workspaceRoot?: string): string[] {
  try {
    const root = getGroupsWorkspaceRoot(workspaceRoot);

    if (!fs.existsSync(root)) {
      return [];
    }

    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * 为 Agent 生成项目切换指令
 *
 * @param projectId - 目标项目 ID
 * @param currentDir - 当前工作目录 (可选)
 * @returns 给 Agent 的操作指令
 *
 * @example
 * ```typescript
 * const instructions = generateProjectSwitchInstructions("wo-shi-renlei");
 * console.log(instructions);
 * // 输出:
 * // 📁 Switching to project: wo-shi-renlei
 * // 1. cd H:\OpenClaw_Workspace\groups\wo-shi-renlei
 * // 2. Read SHARED_MEMORY.md for project context
 * // 3. Check docs/ for documentation
 * // 4. Work in src/ directory
 * ```
 */
export function generateProjectSwitchInstructions(projectId: string, currentDir?: string): string {
  const context = buildProjectContext(projectId);

  const lines = [
    `📁 Switching to project: ${projectId}`,
    `1. cd "${context.workspacePath}"`,
    `2. Read SHARED_MEMORY.md for project context`,
    `3. Check docs/ for documentation`,
    `4. Work in src/ directory`,
  ];

  if (currentDir) {
    lines.unshift(`Current directory: ${currentDir}`);
  }

  return lines.join("\n");
}

// ============================================================================
// .notes 目录：任务进展笔记的工作空间文件镜像
// ============================================================================

/** .notes 子目录名称常量 */
export const NOTES_DIR_NAME = ".notes";

/** .notes 目录内的索引文件名 */
export const NOTES_INDEX_FILENAME = "_index.md";

/** .notes/archive 子目录名称 */
export const NOTES_ARCHIVE_SUBDIR = "archive";

/**
 * 主笔记文件行数超过此值时触发归档（对应 MEMORY.md maxChars 机制）
 *
 * 300 行约等于 15~20 条中等长度笔记，对大多数长期任务足够。
 */
const NOTES_MAX_LINES = 300;

/**
 * 归档后主文件保留的最新行数（对应 tailRatio 机制）
 *
 * 保留最新 120 行，确保最近笔记始终可读。
 */
const NOTES_KEEP_LINES = 120;

/** 归档索引区起止标记（与 MEMORY.md 的 ARCHIVE_INDEX_START 同风格） */
const NOTES_ARCHIVE_INDEX_START = "<!-- [NOTES ARCHIVE INDEX START] -->";
const NOTES_ARCHIVE_INDEX_END = "<!-- [NOTES ARCHIVE INDEX END] -->";

/**
 * 任务层次定位信息
 *
 * 用于将进展笔记文件按任务树结构存放：
 *   .notes/{epicId}/{featureId}/{storyId}/{taskId}.md
 *
 * 各字段均为可选，未提供时回退到扁平结构（向后兼容）。
 * 字段语义与 Task 接口一一对应：
 *   - epicId:    task.epicId（feature/story 级别时填写）
 *   - featureId: task.featureId（story 级别时填写）
 *   - parentTaskId: task.parentTaskId（任意嵌套子任务时填写）
 *   - level:     task.level（epic/feature/story/task）
 */
export interface TaskHierarchy {
  /** 所属 Epic 的任务 ID */
  epicId?: string;
  /** 所属 Feature 的任务 ID */
  featureId?: string;
  /** 直接父任务 ID（对于嵌套子任务） */
  parentTaskId?: string;
  /** 工作层次（epic/feature/story/task） */
  level?: string;
}

/**
 * 根据任务层次信息计算 .notes 内的子目录路径段
 *
 * 对齐 WorkItemLevel 层次体系（epic → feature → story → task）：
 *   - epic:    .notes/{epicId}/
 *   - feature: .notes/{epicId}/{featureId}/
 *   - story:   .notes/{epicId}/{featureId}/{storyId}/  （storyId = parentTaskId 或 taskId）
 *   - task:    按 epicId/featureId/parentTaskId 逐层嵌套
 *   - 无层次信息：.notes/（扁平，向后兼容）
 *
 * @returns 相对于 .notes 根目录的子目录路径（不含文件名，可能为空字符串）
 */
export function resolveTaskHierarchySubdir(taskId: string, hierarchy?: TaskHierarchy): string {
  if (!hierarchy) {
    return "";
  }

  const { epicId, featureId, parentTaskId, level } = hierarchy;

  // epic 自身：直接挂在 .notes/ 根，子目录以 epicId 命名
  if (level === "epic") {
    return epicId ?? taskId;
  }

  // feature：挂在 epic 子目录下
  if (level === "feature") {
    if (epicId) {
      return path.join(epicId, featureId ?? taskId);
    }
    return featureId ?? taskId;
  }

  // story：挂在 feature 子目录下（story 自身笔记文件放在 feature 目录内，
  // 而 story 目录（用来存放其叶子 task）以 taskId 命名）
  // 目录结构：.notes/{epicId}/{featureId}/{taskId}.md（story 自身笔记）
  //             .notes/{epicId}/{featureId}/{storyId}/（story 子任务 task 目录）
  if (level === "story") {
    const parts: string[] = [];
    if (epicId) {
      parts.push(epicId);
    }
    // story 的 parentTaskId 是其所属 feature，与 featureId 相同，不重复推入
    // 只推入 featureId（story 的父 feature 目录），story 自身 .md 文件在此目录下
    if (featureId) {
      parts.push(featureId);
    }
    // 注意：story 级别的文件放在 featureId 目录下，而非再建一层 story 子目录
    // story 子目录（存放 task 子项）由 task 级别的 level 逻辑推入 storyId
    return parts.join(path.sep);
  }

  // task（叶子）：按 epic/feature/parent 逐层嵌套
  const parts: string[] = [];
  if (epicId) {
    parts.push(epicId);
  }
  if (featureId) {
    parts.push(featureId);
  }
  if (parentTaskId) {
    parts.push(parentTaskId);
  }
  return parts.join(path.sep);
}

/**
 * 解析任务进展笔记的完整文件路径（层次化结构）
 *
 * 生成规则：
 *   .notes/{subdir}/{taskId}.md
 *
 * 示例（Epic → Feature → Story → Task）：
 *   epic-001      → .notes/epic-001/epic-001.md  （Epic 自身笔记在其目录内）
 *   feature-A     → .notes/epic-001/feature-A/feature-A.md
 *   story-A1      → .notes/epic-001/feature-A/story-A1/story-A1.md
 *   task-A1-1     → .notes/epic-001/feature-A/story-A1/task-A1-1.md
 *
 * @param workspaceDir - 项目工作空间目录
 * @param taskId       - 任务 ID
 * @param hierarchy    - 任务层次信息（可选，缺失则回退到扁平路径）
 */
export function resolveTaskNotesFile(
  workspaceDir: string,
  taskId: string,
  hierarchy?: TaskHierarchy,
): string {
  const subdir = resolveTaskHierarchySubdir(taskId, hierarchy);
  if (subdir) {
    return path.join(workspaceDir, NOTES_DIR_NAME, subdir, `${taskId}.md`);
  }
  return path.join(workspaceDir, NOTES_DIR_NAME, `${taskId}.md`);
}

/**
 * 解析 .notes 根目录路径
 */
export function resolveNotesDir(workspaceDir: string): string {
  return path.join(workspaceDir, NOTES_DIR_NAME);
}

/**
 * 解析 .notes/_index.md（项目顶层索引）路径
 */
export function resolveNotesIndexFile(workspaceDir: string): string {
  return path.join(workspaceDir, NOTES_DIR_NAME, NOTES_INDEX_FILENAME);
}

/**
 * 将单条进展笔记追加写入对应任务的层次化 .notes 文件
 *
 * 文件位置由 hierarchy 决定（对齐任务树结构）：
 *   .notes/{epicId}/{featureId}/{parentId}/{taskId}.md
 *
 * - 文件不存在时自动创建（含文件头）
 * - 写入后自动检查是否需要归档（超过 NOTES_MAX_LINES 触发）
 * - 写入失败时静默降级（不抛异常），SQLite 仍是权威数据源
 * - 同时更新当前层目录的 _index.md 和项目根 _index.md（均幂等）
 *
 * @param params.workspaceDir - 项目工作空间目录
 * @param params.taskId       - 任务 ID
 * @param params.taskTitle    - 任务标题（仅用于文件头，可选）
 * @param params.hierarchy    - 任务层次信息（epic/feature/story/task），决定文件存放目录
 * @param params.noteId       - 笔记唯一 ID
 * @param params.content      - 笔记内容（Markdown）
 * @param params.authorId     - 记录者 ID
 * @param params.createdAt    - 创建时间戳（ms）
 * @param params.compacted    - 是否为压缩摘要
 */
export function appendNoteToWorkspaceFile(params: {
  workspaceDir: string;
  taskId: string;
  taskTitle?: string;
  hierarchy?: TaskHierarchy;
  noteId: string;
  content: string;
  authorId: string;
  createdAt: number;
  compacted?: boolean;
}): void {
  try {
    const notesDir = resolveNotesDir(params.workspaceDir);
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }

    const filePath = resolveTaskNotesFile(params.workspaceDir, params.taskId, params.hierarchy);
    // 确保层次化子目录存在
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    const isNew = !fs.existsSync(filePath);
    const date = new Date(params.createdAt).toISOString().replace("T", " ").slice(0, 19);
    const compactedBadge = params.compacted ? " _(压缩摘要)_" : "";

    let block: string;
    if (isNew) {
      // 新文件：写入标题头 + 层次面包屑 + 第一条笔记
      const breadcrumb = _buildBreadcrumb(params.taskId, params.hierarchy);
      const titleLine = params.taskTitle
        ? `# ${params.taskTitle}\n\n> Task ID: \`${params.taskId}\`${breadcrumb}\n`
        : `# Task: \`${params.taskId}\`${breadcrumb}\n`;
      block =
        titleLine +
        `\n## 进展笔记\n\n` +
        `### ${date} · ${params.authorId}${compactedBadge}\n\n` +
        `${params.content}\n`;
    } else {
      // 已有文件：追加一节
      block =
        `\n---\n\n` +
        `### ${date} · ${params.authorId}${compactedBadge}\n\n` +
        `${params.content}\n`;
    }

    fs.appendFileSync(filePath, block, "utf-8");

    // 写入后检查是否需要归档（对应 MEMORY.md 的 archiveMemoryOverflow 机制）
    archiveTaskNotesOverflow(filePath, params.taskId, params.workspaceDir);

    // 更新当前层目录的 _index.md（幂等）
    _upsertNotesIndex(fileDir, params.taskId, params.taskTitle);
    // 若文件不在根 .notes/，同时更新项目级根索引（幂等）
    if (fileDir !== notesDir) {
      _upsertNotesIndex(
        notesDir,
        params.taskId,
        params.taskTitle,
        filePath.replace(params.workspaceDir + path.sep, ""),
      );
    }
  } catch {
    // 静默降级：文件写入失败不影响 SQLite 主存储
  }
}

/**
 * 构建面包屑导航字符串（写入笔记文件头部，方便人类理解层次）
 *
 * 示例：
 *   ` | Epic: \`epic-001\` > Feature: \`feature-A\` > Story: \`story-A1\``
 */
function _buildBreadcrumb(taskId: string, hierarchy?: TaskHierarchy): string {
  if (!hierarchy) {
    return "";
  }
  const { epicId, featureId, parentTaskId, level } = hierarchy;
  const parts: string[] = [];
  if (epicId && level !== "epic") {
    parts.push(`Epic: \`${epicId}\``);
  }
  if (featureId && level !== "feature") {
    parts.push(`Feature: \`${featureId}\``);
  }
  if (parentTaskId && level !== "story" && parentTaskId !== featureId && parentTaskId !== epicId) {
    parts.push(`Parent: \`${parentTaskId}\``);
  }
  return parts.length > 0 ? ` | ${parts.join(" > ")}` : "";
}

/**
 * 对 .notes/{taskId}.md 应用归档转移（零信息丢失）
 *
 * 触发条件：主文件行数超过 NOTES_MAX_LINES
 *
 * 归档流程（对齐 archiveMemoryOverflow 风格）：
 * 1. 提取现有归档索引区（文件头部 HTML 注释块）
 * 2. 将溢出的旧节（去除索引区和标题头后的头部行）移入
 *    `.notes/archive/{taskId}/YYYY-MM.md`（按月追加）
 * 3. 在主文件头部更新归档索引区（记录归档条目）
 * 4. 主文件保留：[文件标题头] + [归档索引区] + [最新 NOTES_KEEP_LINES 行]
 *
 * 静默执行：失败时不抛异常，主文件内容不变。
 */
export function archiveTaskNotesOverflow(
  filePath: string,
  taskId: string,
  workspaceDir: string,
): void {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const allLines = raw.split("\n");

    // 未超限，直接返回
    if (allLines.length <= NOTES_MAX_LINES) {
      return;
    }

    // ── 1. 分离文件标题头（第一行 # 标题 + 紧跟的 > blockquote）──
    // 归档后主文件必须保留标题头，保证文件可读性
    let headerEndIdx = 0;
    if (allLines[0]?.startsWith("# ")) {
      headerEndIdx = 1;
      // 跳过紧跟标题的空行和 > blockquote 行
      while (
        headerEndIdx < allLines.length &&
        (allLines[headerEndIdx] === "" || allLines[headerEndIdx]?.startsWith("> "))
      ) {
        headerEndIdx++;
      }
    }
    const titleLines = allLines.slice(0, headerEndIdx);
    const bodyLines = allLines.slice(headerEndIdx);

    // ── 2. 分离现有归档索引区（若存在）──
    let existingIndexLines: string[] = [];
    let bodyWithoutIndex = bodyLines;
    const idxStart = bodyLines.findIndex((l) => l === NOTES_ARCHIVE_INDEX_START);
    const idxEnd = bodyLines.findIndex((l) => l === NOTES_ARCHIVE_INDEX_END);
    if (idxStart !== -1 && idxEnd !== -1 && idxEnd > idxStart) {
      existingIndexLines = bodyLines.slice(idxStart, idxEnd + 1);
      bodyWithoutIndex = [...bodyLines.slice(0, idxStart), ...bodyLines.slice(idxEnd + 1)].filter(
        (l, i, arr) => !(l === "" && arr[i - 1] === ""),
      );
    }

    // ── 3. 计算溢出（待归档）行和保留（最新）行 ──
    const overflowLines = bodyWithoutIndex.slice(0, bodyWithoutIndex.length - NOTES_KEEP_LINES);
    const keepLines = bodyWithoutIndex.slice(bodyWithoutIndex.length - NOTES_KEEP_LINES);

    if (overflowLines.length === 0) {
      return;
    }

    // ── 4. 确定归档文件路径：.notes/archive/{taskId}/YYYY-MM.md ──
    const archiveDir = path.join(workspaceDir, NOTES_DIR_NAME, NOTES_ARCHIVE_SUBDIR, taskId);
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    const monthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
    const archiveFilePath = path.join(archiveDir, `${monthStr}.md`);
    const archiveTimestamp = new Date().toISOString();

    // ── 5. 写入归档文件（追加，当月多次归档追加分隔符）──
    const archiveBlock = [
      `\n---\n`,
      `## 归档时间: ${archiveTimestamp}`,
      `## 来源: ${filePath}`,
      `## 行数: ${overflowLines.length}`,
      ``,
      overflowLines.join("\n").trimStart(),
    ].join("\n");
    fs.appendFileSync(archiveFilePath, archiveBlock, "utf-8");

    // ── 6. 构建新的归档索引区（对应 MEMORY.md 的 newIndexBlock）──
    const relArchivePath = path.join(NOTES_ARCHIVE_SUBDIR, taskId, `${monthStr}.md`);
    const newEntry = `- [${archiveTimestamp}] → ${relArchivePath} (${overflowLines.length} 行)`;
    const existingEntries = existingIndexLines
      .filter((l) => l !== NOTES_ARCHIVE_INDEX_START && l !== NOTES_ARCHIVE_INDEX_END)
      .join("\n")
      .trim();
    const allEntries = existingEntries ? `${existingEntries}\n${newEntry}` : newEntry;

    const newIndexBlock = [
      NOTES_ARCHIVE_INDEX_START,
      `## 📚 归档索引 — ${taskId}`,
      `## 历史笔记已归档到 ${NOTES_ARCHIVE_SUBDIR}/${taskId}/ 目录，按月存储，零信息丢失`,
      allEntries,
      NOTES_ARCHIVE_INDEX_END,
    ].join("\n");

    // ── 7. 重写主文件：[标题头] + [归档索引区] + [最新行] ──
    const newContent = [...titleLines, "", ...newIndexBlock.split("\n"), "", ...keepLines].join(
      "\n",
    );

    fs.writeFileSync(filePath, newContent, "utf-8");
  } catch {
    // 静默降级：归档失败不影响主文件
  }
}

/**
 * 幂等更新指定目录的 _index.md 任务条目
 *
 * - 每个层次目录都有独立的 _index.md，只索引当层的文件/子目录
 * - 若 taskFilePath 已提供（根索引场景），链接指向实际路径；否则指向当层 ./{taskId}.md
 * - 若文件中已有该 taskId 的条目则跳过（幂等）
 *
 * @param indexDir     - _index.md 所在目录
 * @param taskId       - 任务 ID
 * @param taskTitle    - 任务标题（可选，用于链接文本）
 * @param taskFilePath - 相对于工作空间的完整文件路径（根索引场景）
 */
function _upsertNotesIndex(
  indexDir: string,
  taskId: string,
  taskTitle?: string,
  taskFilePath?: string,
): void {
  const indexPath = path.join(indexDir, NOTES_INDEX_FILENAME);
  const linkTarget = taskFilePath ? `./${taskFilePath.replace(/\\/g, "/")}` : `./${taskId}.md`;
  const link = `[${taskTitle ?? taskId}](${linkTarget})`;
  const entryLine = `- ${link}  \`${taskId}\``;

  if (!fs.existsSync(indexPath)) {
    // 根 .notes/ 的索引标题为项目级，子目录的索引标题为层级名
    const dirName = path.basename(indexDir);
    const isRoot = dirName === NOTES_DIR_NAME;
    const header = isRoot
      ? `# 进展笔记索引\n\n> 由系统自动维护，层次结构对齐任务树（Epic → Feature → Story → Task）\n`
      : `# ${dirName} 进展笔记\n\n> 由系统自动维护\n`;
    fs.writeFileSync(indexPath, `${header}\n${entryLine}\n`, "utf-8");
    return;
  }

  const existing = fs.readFileSync(indexPath, "utf-8");
  if (existing.includes(`\`${taskId}\``)) {
    return; // 已存在，幂等跳过
  }
  fs.appendFileSync(indexPath, `${entryLine}\n`, "utf-8");
}
