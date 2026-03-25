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
 */

import * as fs from "fs";
import * as path from "path";

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
  /** 项目配置对象 (如果存在 PROJECT_CONFIG.json) */
  config?: ProjectConfig;
}

/** 项目生命周期状态 */
export type ProjectStatus =
  | "planning"
  | "active"
  | "dev_done"
  | "operating"
  | "maintenance"
  | "paused"
  | "completed"
  | "deprecated"
  | "cancelled";

/** 任务优先级（借鉴 Linear/Jira 标准） */
export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";

/** 任务看板状态 */
export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";

/**
 * 项目任务/Issue（借鉴 Linear 的 Issue 模型）
 * 每个任务是可追踪的最小工作单元
 */
export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  /** 任务看板状态 */
  status: TaskStatus;
  /** 优先级 */
  priority: TaskPriority;
  /** 负责人 Agent ID */
  assigneeId?: string;
  /** Story Point 估算（Fibonacci: 1,2,3,5,8,13） */
  storyPoints?: number;
  /** 标签 */
  labels?: string[];
  /** 截止时间 */
  dueDate?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt?: number;
  /** 阻塞此任务的任务 ID 列表（依赖关系）*/
  blockedBy?: string[];
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
  /** 包含的任务列表 */
  tasks: ProjectTask[];
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
  /** Backlog 任务列表（未分配到 Sprint 的任务） */
  backlog?: ProjectTask[];
  /** 验收标准（Markdown 格式） */
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
    return JSON.parse(content) as ProjectConfig;
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
