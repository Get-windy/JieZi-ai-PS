import { html, nothing } from "lit";
import type { AgentsListResult } from "../types.ts";
import type { GroupInfo, GroupsListResult } from "./groups.ts";

// ===== 跨团队协作类型 =====

export type ProjectTeamRole = "dev" | "ops" | "support" | "qa" | "observer";
export type ProjectTeamStatus = "active" | "handed-off" | "archived" | "support-only";

export interface ProjectTeamRelation {
  id: string;
  projectId: string;
  teamId: string;
  role: ProjectTeamRole;
  status: ProjectTeamStatus;
  joinedAt: number;
  assignedBy: string;
  updatedAt?: number;
  note?: string;
  handoffHistory: Array<{
    id: string;
    fromTeamId: string;
    toTeamId: string;
    note?: string;
    operatorId: string;
    handoffAt: number;
    fromTeamNewStatus: ProjectTeamStatus;
    toTeamNewStatus: ProjectTeamStatus;
  }>;
}

export interface HandoffFormState {
  toTeamId: string;
  toTeamRole: ProjectTeamRole;
  fromTeamNewStatus: ProjectTeamStatus;
  toTeamNewStatus: ProjectTeamStatus;
  note: string;
}

/**
 * 项目生命周期状态（与后端 project-context.ts 保持一致）
 *
 * requirements → 需求提炼阶段
 * design       → 架构设计阶段
 * planning     → 立项规划/计划排期
 * development  → 开发中（后端标准名）
 * active       → 开发/运行中（前端兼容名）
 * testing      → 测试阶段
 * review       → 评审验收阶段
 * dev_done     → 开发完成（待上线）
 * operating    → 运营中（已上线正常运营）
 * maintenance  → 维护模式（只做保活，无新需求）
 * paused       → 暂停（临时暂停，后续继续）
 * completed    → 已完成（正常收尾关闭）
 * deprecated   → 已废弃（不再维护）
 * cancelled    → 已取消（中途放弃）
 */
export type ProjectStatus =
  | "requirements"
  | "design"
  | "planning"
  | "development"
  | "active"
  | "testing"
  | "review"
  | "dev_done"
  | "operating"
  | "maintenance"
  | "paused"
  | "completed"
  | "deprecated"
  | "cancelled";

/** 项目状态元数据（标签/颜色/图标） */
export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; icon: string; color: string; bg: string }
> = {
  requirements: { label: "需求提炼", icon: "📋", color: "#6366f1", bg: "#eef2ff" },
  design: { label: "架构设计", icon: "🎨", color: "#8b5cf6", bg: "#f5f3ff" },
  planning: { label: "计划排期", icon: "📍", color: "#6b7280", bg: "#f3f4f6" },
  development: { label: "开发中", icon: "🟢", color: "#16a34a", bg: "#f0fdf4" },
  active: { label: "进行中", icon: "🔵", color: "#2563eb", bg: "#eff6ff" },
  testing: { label: "测试中", icon: "🧪", color: "#0891b2", bg: "#ecfeff" },
  review: { label: "评审验收", icon: "🔍", color: "#7c3aed", bg: "#f5f3ff" },
  dev_done: { label: "开发完成", icon: "📦", color: "#0891b2", bg: "#ecfeff" },
  operating: { label: "运营中", icon: "🚀", color: "#7c3aed", bg: "#f5f3ff" },
  maintenance: { label: "维护模式", icon: "🔧", color: "#d97706", bg: "#fffbeb" },
  paused: { label: "已暂停", icon: "⏸️", color: "#9ca3af", bg: "#f9fafb" },
  completed: { label: "已完成", icon: "✅", color: "#2563eb", bg: "#eff6ff" },
  deprecated: { label: "已废弃", icon: "🗑️", color: "#dc2626", bg: "#fef2f2" },
  cancelled: { label: "已取消", icon: "❌", color: "#ef4444", bg: "#fef2f2" },
};

/** 筛选选项：包含“全部”和各项目状态 */
export type ProjectStatusFilter = "all" | ProjectStatus;

/** 默认展示各状态（均显示）*/
export const STATUS_FILTER_OPTIONS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "all", label: "📂 全部项目" },
  { value: "requirements", label: "📋 需求提炼" },
  { value: "design", label: "🎨 架构设计" },
  { value: "planning", label: "📍 计划排期" },
  { value: "development", label: "🟢 开发中" },
  { value: "active", label: "🔵 进行中" },
  { value: "testing", label: "🧪 测试中" },
  { value: "review", label: "🔍 评审验收" },
  { value: "dev_done", label: "📦 开发完成" },
  { value: "operating", label: "🚀 运营中" },
  { value: "maintenance", label: "🔧 维护模式" },
  { value: "paused", label: "⏸️ 已暂停" },
  { value: "completed", label: "✅ 已完成" },
  { value: "deprecated", label: "🗑️ 已废弃" },
  { value: "cancelled", label: "❌ 已取消" },
];
/**
 * 任务状态「唯一数据源」
 *
 * 注意：小心将这里定义替换或覆盖。
 * 本文件的任务相关类型必须与后端 tasks/types.ts 保持一致：
 *   - 状态值使用连字符（in-progress、review），不是下划线（in_progress、in_review）
 *   - 创建新 Sprint 任务时状态默认为 "backlog" 或 "todo"
 */
export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "review"
  | "blocked"
  | "done"
  | "cancelled";

/**
 * Sprint / Backlog 任务对象（与后端 tasks/types.ts Task 接口对齐）
 *
 * 注意：小心不要在此处增加后端 Task 没有的字段。
 * 如需新字段，先修改 src/tasks/types.ts 里的 Task 接口。
 */
export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** 主要执行人 ID（对应后端 Task.assignees[0].id） */
  assigneeId?: string;
  /** Story Point 估算（Fibonacci: 1,2,3,5,8,13） */
  storyPoints?: number;
  labels?: string[];
  dueDate?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt?: number;
  blockedBy?: string[];
}

export type SprintStatus = "planning" | "active" | "completed" | "cancelled";

export interface ProjectSprint {
  id: string;
  title: string;
  /** Sprint 状态 */
  status?: SprintStatus;
  goal?: string;
  startDate?: number;
  endDate?: number;
  completedAt?: number;
  order: number;
  tasks: ProjectTask[];
  /** 速度（已完成 SP 数） */
  velocity?: number;
  /** Sprint 回顾备注 */
  retrospective?: string;
}

/** 向后兼容别名 */
export type ProjectMilestone = ProjectSprint;

// ===== 目标管理类型（与后端 project-context.ts 保持一致）=====

export interface KeyResult {
  id: string;
  description: string;
  current?: number;
  target?: number;
  unit?: string;
  achieved: boolean;
  achievedAt?: number;
}

export interface ProjectMilestoneEntry {
  id: string;
  title: string;
  description?: string;
  type: "release" | "phase" | "checkpoint" | "deliverable" | "other";
  status: "upcoming" | "in-progress" | "completed" | "missed" | "cancelled";
  targetDate?: number;
  completedAt?: number;
  objectiveId?: string;
  sprintIds?: string[];
  ownerId?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ProjectObjective {
  id: string;
  title: string;
  description?: string;
  timeframe: "short" | "medium" | "long";
  status: "not-started" | "in-progress" | "achieved" | "missed" | "deferred";
  targetDate?: number;
  achievedAt?: number;
  keyResults?: KeyResult[];
  parentObjectiveId?: string;
  createdAt: number;
  updatedAt?: number;
  lastUpdateNote?: string;
}

/** 计算 Sprint 进度 */
export function calcSprintProgress(sprint: ProjectSprint): number {
  const tasks = sprint.tasks.filter((t) => t.status !== "cancelled");
  if (tasks.length === 0) {
    return 0;
  }
  const total = tasks.reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const done = tasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** 计算项目整体进度 */
export function calcProjectProgress(sprints: ProjectSprint[]): number {
  if (sprints.length === 0) {
    return 0;
  }
  const all = sprints.flatMap((s) => s.tasks).filter((t) => t.status !== "cancelled");
  if (all.length === 0) {
    return 0;
  }
  const total = all.reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const done = all
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

// ===== DoD 完成门禁类型（与后端 project-context.ts 一致）=====

/** 单条验收标准 */
export interface AcceptanceCriterion {
  id: string;
  description: string;
  verificationType: "manual" | "automated" | "evidence";
  satisfied: boolean;
  satisfiedAt?: number;
  evidence?: string;
  satisfiedBy?: string;
}

/** 完成门禁 */
export interface ProjectCompletionGate {
  criteria: AcceptanceCriterion[];
  /**
   * 是否需要 Agent 签收确认（默认 true）。
   * true  = 所有标准满足后，由项目 ownerId 对应的 Agent（coordinator）签收才关闭
   * false = 所有标准满足后自动关闭
   */
  requireHumanSignOff: boolean;
  /** Agent 签收时间戳 */
  humanSignOffAt?: number;
  /** 签收 Agent ID（通常为 coordinator 或项目 ownerId） */
  humanSignOffBy?: string;
  /** 签收备注（Agent 可填写验收总结） */
  humanSignOffNote?: string;
  scopeFrozen: boolean;
  scopeFrozenAt?: number;
  scopeFrozenReason?: "completed" | "cancelled" | "human_decision";
}

/**
 * 项目信息
 */
export interface ProjectInfo {
  projectId: string;
  name: string;
  description?: string;
  workspacePath: string;
  codeDir: string;
  docsDir?: string;
  requirementsDir?: string;
  qaDir?: string;
  testsDir?: string;
  ownerId?: string;
  createdAt?: number;
  /** 创建项目时是否同时创建项目群 */
  createGroup?: boolean;
  // ===== 进度管理字段 =====
  /** 项目状态 */
  status?: ProjectStatus;
  /** 整体进度 0-100（自动由 sprints 计算） */
  progress?: number;
  /** 截止时间（Unix 毫秒） */
  deadline?: number;
  /** Sprint 列表（主要进度载体） */
  sprints?: ProjectSprint[];
  /** 向后兼容：原 milestones 字段 */
  milestones?: ProjectSprint[];
  /** Backlog：未分配到 Sprint 的任务 */
  backlog?: ProjectTask[];
  /** 旧版验收标准（字符串，向后兼容） */
  acceptanceCriteria?: string;
  /** 结构化 DoD 完成门禁 */
  completionGate?: ProjectCompletionGate;
  /** 进度备注 */
  progressNotes?: string;
  /** 进度最后更新时间 */
  progressUpdatedAt?: number;
  /** 战略目标（OKR）列表 */
  objectives?: ProjectObjective[];
  /** 时间轴里程碑列表 */
  timelineMilestones?: ProjectMilestoneEntry[];
  groups?: Array<{
    groupId: string;
    name: string;
    description?: string;
    ownerId: string;
    createdAt: number;
    memberCount: number;
  }>;
}

/**
 * 项目列表结果
 */
export interface ProjectsListResult {
  projects: ProjectInfo[];
  total: number;
}

export type ProjectsProps = {
  loading: boolean;
  error: string | null;
  projectsList: ProjectsListResult | null;
  selectedProjectId: string | null;
  activePanel: "list" | "config" | "members" | "progress" | "handoff" | "roadmap";
  creatingProject: boolean;
  editingProject: ProjectInfo | null;
  agentsList: AgentsListResult | null;
  /** 群组列表，用于渲染项目成员（项目成员存储在绑定群组里） */
  groupsList: GroupsListResult | null;
  /** 项目代码根目录（全局设置，如 I:\\ 或 D:\\Projects\\） */
  projectCodeRoot: string;
  onCodeRootChange: (root: string) => void;
  /** 当前选中的状态筛选 (默认 'active') */
  projectStatusFilter: ProjectStatusFilter;
  onStatusFilterChange: (filter: ProjectStatusFilter) => void;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectPanel: (panel: "list" | "config" | "members" | "progress" | "handoff" | "roadmap") => void;
  /** 新增/更新战略目标 */
  onUpsertObjective: (projectId: string, objective: Omit<ProjectObjective, "createdAt" | "updatedAt"> & { id?: string }) => void;
  /** 删除战略目标 */
  onDeleteObjective: (projectId: string, objectiveId: string) => void;
  /** 新增/更新时间轴里程碑 */
  onUpsertMilestone: (projectId: string, milestone: Omit<ProjectMilestoneEntry, "createdAt" | "updatedAt"> & { id?: string }) => void;
  /** 删除时间轴里程碑 */
  onDeleteMilestone: (projectId: string, milestoneId: string) => void;
  onCreateProject: () => void;
  onEditProject: (projectId: string) => void;
  onSaveProject: () => void;
  onCancelProjectEdit: () => void;
  // oxlint-disable-next-line typescript/no-explicit-any
  onProjectFormChange: (field: string, value: any) => void;
  onOpenWorkspace: (path: string) => void;
  onAddMember: (projectId: string, agentId: string, role: string) => void;
  onRemoveMember: (projectId: string, agentId: string) => void;
  onUpdateMemberRole: (projectId: string, agentId: string, role: string) => void;
  onUpdateProgress: (
    projectId: string,
    patch: Partial<
      Pick<
        ProjectInfo,
        | "progress"
        | "status"
        | "deadline"
        | "sprints"
        | "backlog"
        | "acceptanceCriteria"
        | "progressNotes"
        | "milestones"
      >
    >,
  ) => void;
  /** 保存进度到服务器 */
  onSaveProgress: (
    projectId: string,
    patch: Partial<
      Pick<
        ProjectInfo,
        | "progress"
        | "status"
        | "deadline"
        | "sprints"
        | "backlog"
        | "acceptanceCriteria"
        | "progressNotes"
        | "milestones"
      >
    >,
  ) => void;
  /** 完成 Sprint */
  onCompleteSprint: (
    projectId: string,
    sprintId: string,
    unfinishedAction: "backlog" | "next_sprint",
    retrospective?: string,
  ) => void;
  /** 开始 Sprint */
  onStartSprint: (projectId: string, sprintId: string) => void;
  /** 标记单条验收标准状态 */
  onMarkCriterionSatisfied: (
    projectId: string,
    criterionId: string,
    satisfied: boolean,
    evidence?: string,
  ) => void;
  /** Agent 签收项目（最终确认，由项目 ownerId 对应的 Agent 完成） */
  onHumanSignOff: (projectId: string, signOffBy: string, note?: string) => void;
  // 跨团队协作 Handoff Props
  projectTeamRelations: ProjectTeamRelation[];
  projectTeamRelationsLoading: boolean;
  handoffForm: HandoffFormState;
  onHandoffFormChange: (field: keyof HandoffFormState, value: string) => void;
  onAssignTeam: (projectId: string, teamId: string, role: ProjectTeamRole) => void;
  onHandoffProject: (projectId: string) => void;
  onRemoveTeam: (projectId: string, teamId: string) => void;
  onUpdateTeamStatus: (projectId: string, teamId: string, status: ProjectTeamStatus) => void;
  onLoadTeamRelations: (projectId: string) => void;
  // 更换项目负责人
  onTransferProjectOwner: (projectId: string, newOwnerId: string) => void;
  /** 删除项目确认 modal 状态（null 表示未显示） */
  deleteProjectConfirm: {
    projectId: string;
    projectName: string;
    deleteWorkspace: boolean;
    deleteTasks: boolean;
    deleteGroups: boolean;
  } | null;
  /** 打开删除确认 modal */
  onShowDeleteProjectConfirm: (projectId: string, projectName: string) => void;
  /** 关闭删除确认 modal */
  onHideDeleteProjectConfirm: () => void;
  /** 更改删除项目选项 */
  onDeleteProjectOptionChange: (key: "deleteWorkspace" | "deleteTasks" | "deleteGroups", value: boolean) => void;
  /** 确认删除项目（带选项） */
  onDeleteProject: (projectId: string, opts: { deleteWorkspace: boolean; deleteTasks: boolean; deleteGroups: boolean }) => void;
};

export function renderProjects(props: ProjectsProps) {
  const allProjects = props.projectsList?.projects ?? [];
  // 按状态筛选
  const filtered =
    props.projectStatusFilter === "all"
      ? allProjects
      : allProjects.filter((p) => (p.status ?? "planning") === props.projectStatusFilter);

  const selectedId = props.selectedProjectId;
  const selectedProject = selectedId
    ? (allProjects.find((p) => p.projectId === selectedId) ?? null)
    : null;

  // 每个状态的项目数量（上方筛选选项用）
  const countByStatus = (v: ProjectStatusFilter) =>
    v === "all"
      ? allProjects.length
      : allProjects.filter((p) => (p.status ?? "planning") === v).length;

  return html`
    <div style="display:flex; flex-direction:column; height:100%; gap:12px;">
      <!-- 代码根目录设置条 -->
      ${renderCodeRootBanner(props)}

      <!-- 项目列表主区域 -->
      <div style="flex:1; display:flex; gap:12px; min-height:0; overflow:hidden;">
        <!-- 左侧：筛选栏 + 卡片网格（选中项目时折叠为竖列） -->
        <div style="
          display:flex; flex-direction:column;
          ${selectedProject ? 'width:200px; flex-shrink:0;' : 'flex:1;'}
          min-width:0; overflow:hidden; transition: width 0.2s ease;
        ">
          <!-- 工具栏（未选中时显示，已选中时隐藏过滤条） -->
          ${!selectedProject ? html`
          <div class="card" style="padding:10px 14px; margin-bottom:10px; flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <!-- 状态筛选下拉 -->
              <select
                class="form-control"
                style="width:auto; min-width:140px; font-size:13px;"
                .value=${props.projectStatusFilter}
                @change=${(e: Event) => {
                  props.onStatusFilterChange(
                    (e.target as HTMLSelectElement).value as ProjectStatusFilter,
                  );
                }}
              >
                ${STATUS_FILTER_OPTIONS.map(
                  (opt) => html`
                  <option value=${opt.value}>
                    ${opt.label}${countByStatus(opt.value) > 0 ? ` (${countByStatus(opt.value)})` : ""}
                  </option>
                `,
                )}
              </select>

              <!-- 状态快捷筛选 chips -->
              <div style="display:flex; gap:4px; flex-wrap:wrap; flex:1;">
                ${(
                  [
                    "all",
                    "requirements",
                    "design",
                    "planning",
                    "development",
                    "active",
                    "testing",
                    "review",
                    "dev_done",
                    "operating",
                    "maintenance",
                    "paused",
                  ] as ProjectStatusFilter[]
                ).map((v) => {
                  const cnt = countByStatus(v);
                  if (v !== "all" && cnt === 0) {
                    return nothing;
                  }
                  const meta = v === "all" ? null : PROJECT_STATUS_META[v];
                  const isActive = props.projectStatusFilter === v;
                  return html`
                    <button
                      style="
                        font-size:11px; padding:2px 8px; border-radius:12px; cursor:pointer;
                        border: 1px solid ${isActive ? (meta?.color ?? "#2563eb") : "var(--border)"};
                        background: ${isActive ? (meta?.bg ?? "#eff6ff") : "transparent"};
                        color: ${isActive ? (meta?.color ?? "#2563eb") : "var(--muted)"};
                        font-weight: ${isActive ? "600" : "400"};
                      "
                      @click=${() => props.onStatusFilterChange(v)}
                    >${v === "all" ? "📂 全部" : meta!.icon + " " + meta!.label} ${cnt > 0 ? `(${cnt})` : ""}</button>
                  `;
                })}
              </div>

              <div style="display:flex; gap:6px; margin-left:auto;">
                <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onCreateProject}>
                  + 新建项目
                </button>
                <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
                  ${props.loading ? "刷新中...🔄" : "刷新"}
                </button>
              </div>
            </div>
          </div>
          ` : html`
          <!-- 选中状态下的紧凑工具栏 -->
          <div style="display:flex; gap:4px; margin-bottom:8px; flex-shrink:0;">
            <button class="btn btn--sm" style="flex:1; font-size:11px;" ?disabled=${props.loading} @click=${props.onCreateProject}>新建</button>
            <button class="btn btn--sm" style="font-size:11px;" ?disabled=${props.loading} @click=${props.onRefresh}>刷新</button>
          </div>
          `}

          <!-- 错误提示 -->
          ${props.error ? html`<div class="callout danger" style="margin-bottom:10px;font-size:12px;">${props.error}</div>` : nothing}

          <!-- 卡片区 -->
          <div style="flex:1; overflow-y:auto; padding-right:2px;">
            ${
              filtered.length === 0
                ? html`<div class="callout" style="text-align:center; padding:${selectedProject ? '12px 8px' : '40px 20px'};">
                  <div style="font-size:${selectedProject ? '20px' : '32px'}; margin-bottom:8px;">📋</div>
                  <div style="font-size:${selectedProject ? '11px' : '14px'}; color:var(--muted);">
                    ${allProjects.length === 0 ? (selectedProject ? "暂无项目" : "暂无项目，点击「新建项目」创建第一个") : "该状态下暂无项目"}
                  </div>
                </div>`
                : selectedProject
                  ? html`<div style="display:flex; flex-direction:column; gap:4px; padding-bottom:16px;">
                    ${filtered.map((project) => renderProjectCardCompact(props, project, selectedId))}
                  </div>`
                  : html`<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; padding-bottom:16px;">
                    ${filtered.map((project) => renderProjectCard(props, project, selectedId))}
                  </div>`
            }
          </div>
        </div>

        <!-- 右侧：项目详情面板（选中时占满剩余空间） -->
        ${
          selectedProject
            ? html`
            <div class="card" style="flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden;">
              <!-- 面板头部 -->
              <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border); flex-shrink:0;">
                <div style="font-weight:600; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${selectedProject.name}
                </div>
                <button
                  style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--muted);padding:2px 6px;line-height:1;"
                  @click=${() => props.onSelectProject("")}
                  title="关闭详情"
                >×</button>
              </div>
              <!-- Tab 内容 -->
              <div style="flex:1; overflow-y:auto; padding:12px 16px;">
                ${renderProjectTabs(props.activePanel, props.onSelectPanel)}
                <div style="margin-top:12px;">
                  ${
                    props.activePanel === "list"
                      ? renderProjectOverview(props, selectedProject)
                      : props.activePanel === "config"
                        ? renderProjectConfig(props, selectedProject)
                        : props.activePanel === "members"
                          ? renderProjectMembers(props, selectedProject)
                          : props.activePanel === "roadmap"
                            ? renderProjectRoadmap(props, selectedProject)
                            : props.activePanel === "handoff"
                              ? renderProjectHandoff(props, selectedProject)
                              : renderProjectProgress(props, selectedProject)
                  }
                </div>
              </div>
            </div>
          `
            : nothing
        }
      </div>
    </div>

    ${props.creatingProject || props.editingProject ? renderProjectEditModal(props) : nothing}
  `;
}

/**
 * 项目代码根目录设置条（页面顶部全局显示）
 */
function renderCodeRootBanner(props: ProjectsProps) {
  const hasRoot = props.projectCodeRoot.trim().length > 0;
  return html`
    <div class="card" style="margin-bottom: 12px; padding: 12px 16px;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <label style="white-space: nowrap; font-weight: 600; font-size: 13px;">
          📂 项目代码根目录
        </label>
        <input
          type="text"
          class="form-control"
          style="flex: 1; min-width: 200px; max-width: 420px;"
          .value=${props.projectCodeRoot}
          placeholder="例如 I:\\ 或 D:\\Projects\\（新项目代码目录将自动创建为 根目录\\<项目名>）"
          @input=${(e: InputEvent) => {
            props.onCodeRootChange((e.target as HTMLInputElement).value);
          }}
        />
        ${
          hasRoot
            ? html`
                <span class="chip" style="color: var(--success, #16a34a); border-color: var(--success, #16a34a)"
                  >✓ 已设置</span
                >
              `
            : html`
                <span class="chip" style="color: var(--warning, #d97706); border-color: var(--warning, #d97706)"
                  >⚠️ 未设置，AI 创建项目时将无法自动分配代码目录</span
                >
              `
        }
        <small style="color: var(--muted); font-size: 11px;">手动创建项目时可在对话框内继续指定代码目录</small>
      </div>
    </div>
  `;
}

/**
 * 项目卡片（顶部带状态+进度条，点击展开详情）
 */
function renderProjectCard(
  props: ProjectsProps,
  project: ProjectInfo,
  selectedId: string | null | undefined,
) {
  const status = project.status ?? "planning";
  const meta = PROJECT_STATUS_META[status];
  const sprints = project.sprints ?? project.milestones ?? [];
  const progress = sprints.length > 0 ? calcProjectProgress(sprints) : (project.progress ?? 0);
  const progressColor =
    progress >= 100
      ? "#2563eb"
      : progress >= 60
        ? "#16a34a"
        : progress >= 30
          ? "#d97706"
          : "#9ca3af";
  const isSelected = selectedId === project.projectId;

  const totalTasks = sprints.flatMap((s) => s.tasks).filter((t) => t.status !== "cancelled").length;
  const doneTasks = sprints.flatMap((s) => s.tasks).filter((t) => t.status === "done").length;
  const isOverdue = project.deadline && project.deadline < Date.now() && status !== "completed";

  return html`
    <div
      style="
        border: 2px solid ${isSelected ? "var(--primary, #2563eb)" : "var(--border)"};
        border-radius: 10px;
        overflow: hidden;
        cursor: pointer;
        background: var(--card-bg, #fff);
        ${isSelected ? "box-shadow: 0 0 0 3px rgba(37,99,235,0.15);" : ""}
      "
      @click=${() => props.onSelectProject(project.projectId)}
    >
      <!-- 卡片顶部进度条 -->
      <div style="height:4px; background:var(--border);">
        <div style="height:100%; width:${progress}%; background:${progressColor};"></div>
      </div>

      <!-- 卡片主体 -->
      <div style="padding:12px 14px;">
        <!-- 第一行：状态 chip + 进度数字 -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:${meta.bg}; color:${meta.color};">
            ${meta.icon} ${meta.label}
          </span>
          <span style="font-size:13px; font-weight:700; color:${progressColor};">${progress}%</span>
        </div>

        <!-- 项目名称 -->
        <div style="font-size:14px; font-weight:600; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${project.name}
        </div>

        <!-- 描述 -->
        ${
          project.description
            ? html`<div style="font-size:12px; color:var(--muted); margin-bottom:8px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${project.description}</div>`
            : nothing
        }

        <!-- 底部 meta -->
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:11px; color:var(--muted);">
          ${totalTasks > 0 ? html`<span>📋 ${doneTasks}/${totalTasks} 任务</span>` : nothing}
          ${project.groups?.length ? html`<span>👥 ${project.groups.length} 个群组</span>` : nothing}
          ${
            project.deadline
              ? html`<span style="color:${isOverdue ? "#dc2626" : "inherit"}">${isOverdue ? "⚠️ 已超期" : "🗓️"} ${new Date(project.deadline).toLocaleDateString("zh-CN")}</span>`
              : nothing
          }
          ${project.ownerId ? html`<span style="margin-left:auto;">👤 ${project.ownerId}</span>` : nothing}
        </div>
      </div>
    </div>
  `;
}

/**
 * 紧凑卡片（选中项目时左侧竖向列使用）
 */
function renderProjectCardCompact(
  props: ProjectsProps,
  project: ProjectInfo,
  selectedId: string | null | undefined,
) {
  const status = project.status ?? "planning";
  const meta = PROJECT_STATUS_META[status];
  const sprints = project.sprints ?? project.milestones ?? [];
  const progress = sprints.length > 0 ? calcProjectProgress(sprints) : (project.progress ?? 0);
  const progressColor =
    progress >= 100 ? "#2563eb" : progress >= 60 ? "#16a34a" : progress >= 30 ? "#d97706" : "#9ca3af";
  const isSelected = selectedId === project.projectId;

  return html`
    <div
      style="
        border: 2px solid ${isSelected ? "var(--primary, #2563eb)" : "var(--border)"};
        border-radius: 8px;
        overflow: hidden;
        cursor: pointer;
        background: ${isSelected ? "var(--primary-bg, #eff6ff)" : "var(--card-bg, #fff)"};
        ${isSelected ? "box-shadow: 0 0 0 2px rgba(37,99,235,0.15);" : ""}
      "
      @click=${() => props.onSelectProject(project.projectId)}
    >
      <!-- 顶部进度条 -->
      <div style="height:3px; background:var(--border);">
        <div style="height:100%; width:${progress}%; background:${progressColor};"></div>
      </div>
      <!-- 内容区 -->
      <div style="padding:8px 10px;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
          <span style="font-size:10px; font-weight:600; padding:1px 6px; border-radius:8px; background:${meta.bg}; color:${meta.color}; flex-shrink:0;">
            ${meta.icon}
          </span>
          <span style="font-size:12px; font-weight:${isSelected ? '700' : '500'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${isSelected ? "var(--primary, #2563eb)" : "inherit"};">
            ${project.name}
          </span>
        </div>
        <div style="font-size:11px; color:${progressColor}; font-weight:600;">${progress}%</div>
      </div>
    </div>
  `;
}

function renderProjectTabs(
  active: ProjectsProps["activePanel"],
  onSelect: (panel: ProjectsProps["activePanel"]) => void,
) {
  const tabs = [
    { id: "list" as const, label: "项目概况", icon: "📊" },
    { id: "config" as const, label: "项目配置", icon: "⚙️" },
    { id: "members" as const, label: "成员管理", icon: "👥" },
    { id: "progress" as const, label: "项目进度", icon: "📈" },
    { id: "roadmap" as const, label: "目标路线图", icon: "🗺️" },
    { id: "handoff" as const, label: "跨团队协作", icon: "🤝" },
  ];

  return html`
    <div class="agent-tabs" style="margin-top: 16px;">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            <span style="margin-right: 6px;">${tab.icon}</span>
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderProjectOverview(props: ProjectsProps, project: ProjectInfo) {
  return html`
    <div class="project-overview">
      <h3>项目概况</h3>
      
      <div class="info-grid">
        <div class="info-item">
          <label>项目 ID</label>
          <div>${project.projectId}</div>
        </div>
        <div class="info-item">
          <label>项目名称</label>
          <div>${project.name}</div>
        </div>
        <div class="info-item">
          <label>描述</label>
          <div>${project.description || "暂无描述"}</div>
        </div>
        <div class="info-item">
          <label>工作空间</label>
          <div>${project.workspacePath || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>代码目录</label>
          <div>${project.codeDir || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>文档目录</label>
          <div>${project.docsDir || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>测试目录</label>
          <div>${project.testsDir || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>关联群组</label>
          <div>${project.groups?.length || 0} 个</div>
        </div>
      </div>

      ${
        project.groups && project.groups.length > 0
          ? html`
            <div style="margin-top: 24px;">
              <h4>关联的群组</h4>
              <div class="group-list">
                ${project.groups.map(
                  (group) => html`
                    <div class="list-item">
                      <div style="flex: 1;">
                        <div class="list-title">${group.name}</div>
                        <div class="list-sub">${group.description || "暂无描述"}</div>
                        <div class="chip-row" style="margin-top: 6px;">
                          <span class="chip">${group.memberCount} 名成员</span>
                          <span class="chip">ID: ${group.groupId}</span>
                        </div>
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : html`
              <div class="callout info" style="margin-top: 24px">暂无关联群组</div>
            `
      }

      <div style="margin-top: 24px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button class="btn" @click=${() => props.onEditProject(project.projectId)}>
          编辑项目
        </button>
        <button class="btn btn--primary" 
          ?disabled=${!project.workspacePath}
          @click=${() => project.workspacePath && props.onOpenWorkspace(project.workspacePath)}
        >
          打开工作空间
        </button>
        <button
          class="btn btn--danger"
          style="margin-left: auto; background: #fef2f2; color: #dc2626; border-color: #fca5a5;"
          @click=${() => props.onShowDeleteProjectConfirm(project.projectId, project.name)}
        >
          🗑️ 删除项目
        </button>
      </div>

      <!-- 删除确认 Modal -->
      ${props.deleteProjectConfirm?.projectId === project.projectId
        ? renderDeleteProjectConfirmModal(props, project)
        : nothing}
  `;
}

/**
 * 删除项目确认 modal：含三个选项复选框（默认全部保留）
 */
function renderDeleteProjectConfirmModal(props: ProjectsProps, project: ProjectInfo) {
  const confirm = props.deleteProjectConfirm!;
  return html`
    <div style="
      position:fixed; inset:0; z-index:1000;
      background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center;
    " @click=${(e: Event) => { if (e.target === e.currentTarget) props.onHideDeleteProjectConfirm(); }}>
      <div style="
        background:var(--surface, #fff); border-radius:12px; padding:28px 32px;
        min-width:380px; max-width:480px; box-shadow:0 8px 32px rgba(0,0,0,0.18);
      ">
        <!-- 标题 -->
        <div style="font-size:18px; font-weight:700; margin-bottom:6px; color:#dc2626;">
          🗑️ 删除项目「${project.name}」
        </div>
        <div style="font-size:13px; color:var(--muted); margin-bottom:20px;">
          选择需要删除的内容，未勾选项目将被保留。
        </div>

        <!-- 删除选项 -->
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:24px;">
          <!-- 工作空间 -->
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;
            padding:12px 14px; border-radius:8px;
            border:1px solid ${confirm.deleteWorkspace ? '#fca5a5' : 'var(--border)'};
            background:${confirm.deleteWorkspace ? '#fef2f2' : 'var(--surface-hover, #f9f9f9)'};
          ">
            <input type="checkbox"
              style="margin-top:2px; accent-color:#dc2626;"
              .checked=${confirm.deleteWorkspace}
              @change=${(e: Event) => props.onDeleteProjectOptionChange("deleteWorkspace", (e.target as HTMLInputElement).checked)}
            />
            <div>
              <div style="font-weight:600; font-size:13px;">删除工作空间目录</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">
                ${project.workspacePath
                  ? html`<code style="font-size:11px; background:#f3f4f6; padding:1px 5px; border-radius:3px;">${project.workspacePath}</code>`
                  : '未设置工作空间路径'}
              </div>
            </div>
          </label>

          <!-- Task 任务 -->
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;
            padding:12px 14px; border-radius:8px;
            border:1px solid ${confirm.deleteTasks ? '#fca5a5' : 'var(--border)'};
            background:${confirm.deleteTasks ? '#fef2f2' : 'var(--surface-hover, #f9f9f9)'};
          ">
            <input type="checkbox"
              style="margin-top:2px; accent-color:#dc2626;"
              .checked=${confirm.deleteTasks}
              @change=${(e: Event) => props.onDeleteProjectOptionChange("deleteTasks", (e.target as HTMLInputElement).checked)}
            />
            <div>
              <div style="font-weight:600; font-size:13px;">删除 Task 系统任务</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">将物理删除该项目下所有任务记录</div>
            </div>
          </label>

          <!-- 群组 -->
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;
            padding:12px 14px; border-radius:8px;
            border:1px solid ${confirm.deleteGroups ? '#fca5a5' : 'var(--border)'};
            background:${confirm.deleteGroups ? '#fef2f2' : 'var(--surface-hover, #f9f9f9)'};
          ">
            <input type="checkbox"
              style="margin-top:2px; accent-color:#dc2626;"
              .checked=${confirm.deleteGroups}
              @change=${(e: Event) => props.onDeleteProjectOptionChange("deleteGroups", (e.target as HTMLInputElement).checked)}
            />
            <div>
              <div style="font-weight:600; font-size:13px;">删除绑定群组</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">删除该项目关联的所有群组</div>
            </div>
          </label>
        </div>

        <!-- 提示文字 -->
        ${(!confirm.deleteWorkspace && !confirm.deleteTasks && !confirm.deleteGroups) ? html`
          <div style="font-size:12px; color:#6b7280; background:#f9fafb; padding:8px 12px; border-radius:6px; margin-bottom:16px;">
            ℹ️ 未选择任何内容，删除后项目将仅从列表移除，工作空间/任务/群组均保留。
          </div>
        ` : nothing}

        <!-- 操作按鈕 -->
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button class="btn" @click=${() => props.onHideDeleteProjectConfirm()}>
            取消
          </button>
          <button
            class="btn btn--danger"
            style="background:#dc2626; color:#fff; border-color:#dc2626;"
            @click=${() => {
              props.onDeleteProject(project.projectId, {
                deleteWorkspace: confirm.deleteWorkspace,
                deleteTasks: confirm.deleteTasks,
                deleteGroups: confirm.deleteGroups,
              });
              props.onHideDeleteProjectConfirm();
            }}
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  `;
}
function renderProjectConfig(props: ProjectsProps, project: ProjectInfo) {
  return html`
    <div class="project-config">
      <h3>项目配置</h3>
      
      <div class="form-group">
        <label>项目 ID</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.projectId}"
          disabled
        />
        <small>项目唯一标识符，创建后不可修改</small>
      </div>

      <div class="form-group">
        <label>项目名称</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.name}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("name", target.value);
          }}
        />
      </div>

      <div class="form-group">
        <label>描述</label>
        <textarea 
          class="form-control"
          rows="3"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLTextAreaElement;
            props.onProjectFormChange("description", target.value);
          }}
        >${project.description || ""}</textarea>
      </div>

      <div class="form-group">
        <label>工作空间路径</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.workspacePath || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("workspacePath", target.value);
          }}
        />
        <small>项目工作空间根目录，将同步到所有项目群</small>
      </div>

      <div class="form-group">
        <label>工作目录</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.codeDir || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("codeDir", target.value);
          }}
        />
        <small>项目工作目录，可为代码仓库、设计文件夹或任意工作文件夹，可留空</small>
      </div>

      <div class="form-group">
        <label>文档目录</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.docsDir || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("docsDir", target.value);
          }}
        />
      </div>

      <div class="form-group">
        <label>测试目录</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.testsDir || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("testsDir", target.value);
          }}
        />
      </div>

      <div style="margin-top: 24px; display: flex; gap: 8px;">
        <button 
          class="btn btn--primary" 
          @click=${props.onSaveProject}
        >
          保存配置
        </button>
        <button class="btn" @click=${props.onCancelProjectEdit}>
          取消
        </button>
      </div>
    </div>
  `;
}

function renderProjectMembers(props: ProjectsProps, project: ProjectInfo) {
  const agents = props.agentsList?.agents ?? [];

  // 找到绑定该项目的所有群组，汇总成员（去重）
  const boundGroups = (props.groupsList?.groups ?? []).filter(
    (g) => g.projectId === project.projectId,
  );
  const memberMap = new Map<string, { agentId: string; role: string; groupId: string }>();
  for (const g of boundGroups) {
    for (const m of g.members) {
      if (!memberMap.has(m.agentId)) {
        memberMap.set(m.agentId, { agentId: m.agentId, role: m.role, groupId: g.id });
      }
    }
    // owner 也算成员
    if (g.ownerId && !memberMap.has(g.ownerId)) {
      memberMap.set(g.ownerId, { agentId: g.ownerId, role: "owner", groupId: g.id });
    }
  }
  const currentMembers = Array.from(memberMap.values());
  const currentMemberIds = new Set(currentMembers.map((m) => m.agentId));

  // 可选 agents：过滤掉已是成员的
  const availableAgents = agents.filter((a) => !currentMemberIds.has(a.id));

  // agentId -> name 查找
  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));
  const getAgentLabel = (agentId: string) => {
    const name = agentNameMap.get(agentId);
    return name ? name : agentId;
  };

  // 主群组（第一个绑定群组）用于 addMember
  const primaryGroup: GroupInfo | undefined = boundGroups[0];

  const roleBadge = (role: string) => {
    const map: Record<string, { text: string; color: string }> = {
      owner: { text: "负责人", color: "var(--color-primary)" },
      admin: { text: "管理员", color: "var(--color-info)" },
      member: { text: "成员", color: "var(--color-muted)" },
    };
    const b = map[role] ?? map.member;
    return html`<span class="chip" style="background: ${b.color};">${b.text}</span>`;
  };

  return html`
    <div class="project-members">
      <h3>成员管理</h3>

      <div class="callout info" style="margin-bottom: 16px;">
        管理项目组成员和权限。项目管理员可以管理项目配置、分配任务和审批变更。
      </div>

      <!-- 当前成员列表 -->
      <div class="member-section">
        <h4>当前成员 (${currentMembers.length})</h4>
        ${
          currentMembers.length === 0
            ? html`
                <div class="muted" style="padding: 12px 0">暂无成员，请通过下方绑定项目群后添加</div>
              `
            : html`
              <div class="list" style="margin-top: 8px;">
                ${currentMembers.map(
                  (m) => html`
                    <div class="list-item">
                      <div style="flex: 1;">
                        <div class="list-title">${getAgentLabel(m.agentId)}</div>
                        <div class="list-sub mono" style="font-size: 11px;">${m.agentId}</div>
                        <div class="chip-row" style="margin-top: 4px;">
                          ${roleBadge(m.role)}
                        </div>
                      </div>
                      ${
                        m.role !== "owner"
                          ? html`
                            <button
                              class="btn btn--sm btn--danger"
                              @click=${() => {
                                if (confirm(`确定要移除成员 ${getAgentLabel(m.agentId)} 吗？`)) {
                                  props.onRemoveMember(m.groupId, m.agentId);
                                }
                              }}
                            >
                              移除
                            </button>
                          `
                          : nothing
                      }
                    </div>
                  `,
                )}
              </div>
            `
        }
      </div>

      <!-- 添加成员 -->
      ${
        primaryGroup
          ? html`
          <div class="member-section" style="margin-top: 24px;">
            <h4>添加成员</h4>
            <div class="form-group">
              <div style="display: flex; gap: 8px; align-items: center;">
                <select
                  id="add-project-member-select-${project.projectId}"
                  class="form-control"
                  ?disabled=${availableAgents.length === 0}
                >
                  <option value="">
                    ${availableAgents.length === 0 ? "无可添加的成员" : "选择要添加的成员..."}
                  </option>
                  ${availableAgents.map(
                    (agent) => html`
                      <option value="${agent.id}">
                        ${agent.name ? `${agent.name} (${agent.id})` : agent.id}
                      </option>
                    `,
                  )}
                </select>
                <button
                  class="btn btn--sm btn--primary"
                  ?disabled=${availableAgents.length === 0}
                  @click=${() => {
                    const sel = document.getElementById(
                      `add-project-member-select-${project.projectId}`,
                    ) as HTMLSelectElement | null;
                    const agentId = sel?.value;
                    if (agentId && primaryGroup) {
                      props.onAddMember(primaryGroup.id, agentId, "member");
                      if (sel) {
                        sel.value = "";
                      }
                    }
                  }}
                >
                  添加成员
                </button>
              </div>
            </div>
          </div>
        `
          : html`
              <div class="callout warn" style="margin-top: 16px">
                该项目尚未绑定群组，请先在群组管理页将群组升级为项目群，或创建群组时指定项目 ID。
              </div>
            `
      }

      <!-- 更换负责人 -->
      <div style="margin-top: 24px;">
        <h4>项目负责人</h4>
        <div class="form-group">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="flex: 1; padding: 8px; background: var(--color-bg-secondary, #f5f5f5); border-radius: 4px;">
              ${project.ownerId ? getAgentLabel(project.ownerId) : "未设置"}
              ${project.ownerId ? html`<span class="mono" style="font-size: 11px; color: var(--color-muted); margin-left: 4px;">(${project.ownerId})</span>` : nothing}
            </span>
            <button
              class="btn btn--sm btn--primary"
              ?disabled=${agents.length === 0}
              @click=${() => {
                const sel = document.getElementById(
                  `transfer-owner-select-${project.projectId}`,
                ) as HTMLSelectElement | null;
                const newOwner = sel?.value;
                if (newOwner && newOwner !== project.ownerId) {
                  props.onTransferProjectOwner(project.projectId, newOwner);
                  if (sel) {
                    sel.value = "";
                  }
                }
              }}
            >
              🔄 更换负责人
            </button>
          </div>
          <div style="margin-top: 8px;">
            <select
              id="transfer-owner-select-${project.projectId}"
              class="form-control"
              ?disabled=${agents.length === 0}
            >
              <option value="">选择新负责人...</option>
              ${agents
                .filter((a) => a.id !== project.ownerId)
                .map(
                  (agent) => html`
                    <option value="${agent.id}">
                      ${agent.name ? `${agent.name} (${agent.id})` : agent.id}
                    </option>
                  `,
                )}
            </select>
          </div>
          <small>项目负责人持有所有项目群的群主权限，更换将自动在所有项目群中生效</small>
        </div>
      </div>
    </div>
  `;
}

// ===== 进度管理 常量/帮助函数 =====

const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  backlog: { label: "Backlog", color: "#9ca3af", bg: "#f9fafb" },
  todo: { label: "待处理", color: "#6b7280", bg: "#f3f4f6" },
  "in-progress": { label: "进行中", color: "#2563eb", bg: "#eff6ff" },
  review: { label: "审阅中", color: "#7c3aed", bg: "#f5f3ff" },
  blocked: { label: "被阻塞", color: "#f59e0b", bg: "#fffbeb" },
  done: { label: "已完成", color: "#16a34a", bg: "#f0fdf4" },
  cancelled: { label: "已取消", color: "#dc2626", bg: "#fef2f2" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; icon: string; color: string }> = {
  urgent: { label: "紧急", icon: "🔴", color: "#dc2626" },
  high: { label: "高", icon: "🟠", color: "#d97706" },
  medium: { label: "中", icon: "🟡", color: "#ca8a04" },
  low: { label: "低", icon: "🔵", color: "#2563eb" },
  none: { label: "无", icon: "⚪", color: "#9ca3af" },
};

const PROJECT_STATUS_CONFIG: { value: ProjectStatus; label: string; color: string }[] = [
  { value: "requirements", label: "📋 需求提炼", color: "#6366f1" },
  { value: "design", label: "🎨 架构设计", color: "#8b5cf6" },
  { value: "planning", label: "📍 计划排期", color: "#6b7280" },
  { value: "development", label: "🟢 开发中", color: "#16a34a" },
  { value: "active", label: "🔵 进行中", color: "#2563eb" },
  { value: "testing", label: "🧪 测试中", color: "#0891b2" },
  { value: "review", label: "🔍 评审验收", color: "#7c3aed" },
  { value: "dev_done", label: "📦 开发完成", color: "#0891b2" },
  { value: "operating", label: "🚀 运营中", color: "#7c3aed" },
  { value: "maintenance", label: "🔧 维护模式", color: "#d97706" },
  { value: "paused", label: "⏸️ 已暂停", color: "#9ca3af" },
  { value: "completed", label: "✅ 已完成", color: "#2563eb" },
  { value: "deprecated", label: "🗑️ 已废弃", color: "#dc2626" },
  { value: "cancelled", label: "❌ 已取消", color: "#ef4444" },
];

/** Sprint 状态元数据 */
const SPRINT_STATUS_META: Record<
  SprintStatus,
  { label: string; icon: string; color: string; bg: string }
> = {
  planning: { label: "待规划", icon: "📋", color: "#6b7280", bg: "#f3f4f6" },
  active: { label: "进行中", icon: "🔵", color: "#2563eb", bg: "#eff6ff" },
  completed: { label: "已完成", icon: "✅", color: "#16a34a", bg: "#f0fdf4" },
  cancelled: { label: "已取消", icon: "❌", color: "#dc2626", bg: "#fef2f2" },
};

/** 列看板列项：Todo / In Progress / In Review / Done */
const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "待处理" },
  { status: "in-progress", label: "进行中" },
  { status: "review", label: "审阅中" },
  { status: "done", label: "已完成" },
];

function renderProjectProgress(props: ProjectsProps, project: ProjectInfo) {
  const sprints = project.sprints ?? project.milestones ?? [];
  const backlog = project.backlog ?? [];
  const status = project.status ?? "planning";
  const currentStatus =
    PROJECT_STATUS_CONFIG.find((s) => s.value === status) ?? PROJECT_STATUS_CONFIG[0];
  const computedProgress =
    sprints.length > 0 ? calcProjectProgress(sprints) : (project.progress ?? 0);
  const progressColor =
    computedProgress >= 100
      ? "#2563eb"
      : computedProgress >= 60
        ? "#16a34a"
        : computedProgress >= 30
          ? "#d97706"
          : "#6b7280";
  const isOverdue = project.deadline && project.deadline < Date.now() && status !== "completed";

  // 辅助：更新 sprints
  function patchSprints(newSprints: ProjectSprint[]) {
    const recalc = calcProjectProgress(newSprints);
    props.onUpdateProgress(project.projectId, { sprints: newSprints, progress: recalc });
  }
  function patchBacklog(newBacklog: ProjectTask[]) {
    props.onUpdateProgress(project.projectId, { backlog: newBacklog });
  }

  // Sprint 时间线数据
  const activeSprint = sprints.find((s) => (s.status ?? "planning") === "active");
  const completedSprints = sprints.filter((s) => s.status === "completed");
  const totalVelocity = completedSprints.reduce((sum, s) => sum + (s.velocity ?? 0), 0);
  const avgVelocity =
    completedSprints.length > 0 ? Math.round(totalVelocity / completedSprints.length) : 0;

  return html`
    <div class="project-progress">

      <!-- 项目概览头部 -->
      <div class="card" style="padding: 14px 16px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <h3 style="margin: 0; font-size: 15px;">📈 项目进度</h3>

          <!-- 状态切换 -->
          <select
            class="form-control"
            style="font-size: 12px; width: auto; padding: 2px 8px;"
            .value=${status}
            @change=${(e: Event) => {
              props.onUpdateProgress(project.projectId, {
                status: (e.target as HTMLSelectElement).value as ProjectStatus,
              });
            }}
          >
            ${PROJECT_STATUS_CONFIG.map((s) => html`<option value=${s.value}>${s.label}</option>`)}
          </select>
          <span class="chip" style="color:${currentStatus.color};border-color:${currentStatus.color};font-size:12px;">
            ${currentStatus.label}
          </span>

          <!-- 截止日期 -->
          <input
            type="date"
            class="form-control"
            style="font-size: 12px; width: 140px; ${isOverdue ? "border-color:#dc2626;" : ""}"
            .value=${project.deadline ? new Date(project.deadline).toISOString().slice(0, 10) : ""}
            @change=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onUpdateProgress(project.projectId, {
                deadline: v ? new Date(v).getTime() : undefined,
              });
            }}
          />
          ${
            isOverdue
              ? html`
                  <span class="chip" style="color: #dc2626; border-color: #dc2626; font-size: 11px">⚠️ 已超期</span>
                `
              : nothing
          }

          <!-- 进度数字（由 Sprint 任务完成情况自动计算，不可手动修改） -->
          <span style="margin-left:auto; font-size:20px; font-weight:700; color:${progressColor};" title="进度由 Sprint 任务自动计算">${computedProgress}%</span>
          <button
            class="btn btn--primary btn--sm"
            @click=${() =>
              props.onSaveProgress(project.projectId, {
                sprints,
                backlog,
                status,
                deadline: project.deadline,
                progress: computedProgress,
                acceptanceCriteria: project.acceptanceCriteria,
                progressNotes: project.progressNotes,
              })}
          >保存</button>
        </div>

        <!-- 进度条 -->
        <div style="margin-top:10px;">
          <div style="height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
            <div style="height:100%; width:${computedProgress}%; background:${progressColor}; border-radius:4px; transition:width 0.4s;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:3px;">
            <span>${sprints.length} 个 Sprint · ${sprints.flatMap((s) => s.tasks).length} 个任务 · ${completedSprints.length} 已完成 · <em>进度自动计算</em></span>
            ${
              project.progressUpdatedAt
                ? html`<span>最后更新: ${new Date(project.progressUpdatedAt).toLocaleString("zh-CN")}</span>`
                : nothing
            }
          </div>
        </div>

        <!-- 速度统计（有完成 Sprint 时显示） -->
        ${
          completedSprints.length > 0
            ? html`
          <div style="display:flex; gap:16px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); flex-wrap:wrap;">
            <div style="text-align:center;">
              <div style="font-size:18px; font-weight:700; color:#2563eb;">${completedSprints.length}</div>
              <div style="font-size:11px; color:var(--muted);">已完成 Sprint</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:18px; font-weight:700; color:#16a34a;">${totalVelocity}</div>
              <div style="font-size:11px; color:var(--muted);">累计速度 (SP)</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:18px; font-weight:700; color:#d97706;">${avgVelocity}</div>
              <div style="font-size:11px; color:var(--muted);">平均速度/Sprint</div>
            </div>
            ${
              activeSprint
                ? html`
              <div style="text-align:center;">
                <div style="font-size:18px; font-weight:700; color:#2563eb;">${calcSprintProgress(activeSprint)}%</div>
                <div style="font-size:11px; color:var(--muted);">当前 Sprint</div>
              </div>
            `
                : nothing
            }
          </div>
        `
            : nothing
        }
      </div>

      <!-- Sprint 时间线概览 -->
      ${
        sprints.length > 0
          ? html`
        <div class="card" style="padding:12px 16px; margin-bottom:14px;">
          <div style="font-size:12px; font-weight:600; margin-bottom:8px;">🗓️ Sprint 时间线</div>
          <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
            ${sprints.map((sprint) => {
              const spStatus = sprint.status ?? "planning";
              const meta = SPRINT_STATUS_META[spStatus];
              const sp = calcSprintProgress(sprint);
              return html`
                <div style="
                  display:flex; flex-direction:column; align-items:center;
                  background:${meta.bg}; border:1px solid ${meta.color}30;
                  border-radius:6px; padding:5px 8px; min-width:60px; max-width:90px;
                  font-size:11px;
                ">
                  <span style="font-size:14px;">${meta.icon}</span>
                  <span style="font-weight:600; color:${meta.color}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; text-align:center;" title=${sprint.title}>${sprint.title}</span>
                  <span style="color:var(--muted);">${sp}%</span>
                  ${sprint.velocity !== undefined ? html`<span style="color:#16a34a; font-weight:600;">${sprint.velocity}SP</span>` : nothing}
                </div>
                ${
                  sprints.indexOf(sprint) < sprints.length - 1
                    ? html`
                        <span style="color: var(--muted); font-size: 16px">→</span>
                      `
                    : nothing
                }
              `;
            })}
          </div>
        </div>
      `
          : nothing
      }

      <!-- Sprint 列表 -->
      <div style="margin-bottom: 14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <strong style="font-size:13px;">🏎️ Sprints / 阶段（${sprints.length}）</strong>
          <button class="btn btn--sm" @click=${() => {
            const next = sprints.length + 1;
            patchSprints([
              ...sprints,
              {
                id: `sprint-${Date.now()}`,
                title: `Sprint ${next}`,
                order: next,
                tasks: [],
                status: "planning" as SprintStatus,
              },
            ]);
          }}>+ 新建 Sprint</button>
        </div>

        ${
          sprints.length === 0
            ? html`
                <div class="callout">暂无 Sprint，点击新建以为项目挂载迭代阶段</div>
              `
            : sprints.map((sprint, si) => {
                const spStatus = sprint.status ?? "planning";
                const spMeta = SPRINT_STATUS_META[spStatus];
                const sp = calcSprintProgress(sprint);
                const spColor =
                  sp >= 100 ? "#2563eb" : sp >= 60 ? "#16a34a" : sp >= 30 ? "#d97706" : "#6b7280";
                const doneCnt = sprint.tasks.filter((t) => t.status === "done").length;
                const totalSP = sprint.tasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
                const doneSP = sprint.tasks
                  .filter((t) => t.status === "done")
                  .reduce((s, t) => s + (t.storyPoints ?? 0), 0);
                const isCompleted = spStatus === "completed";
                const isActive = spStatus === "active";
                const isPlanning = spStatus === "planning" || !sprint.status;
                return html`
                <div class="card" style="padding:12px; margin-bottom:10px; border-left:3px solid ${spMeta.color}; opacity:${isCompleted ? "0.85" : "1"};">
                  <!-- Sprint 头部 -->
                  <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                    <!-- 状态标签 -->
                    <span style="
                      font-size:11px; font-weight:600; padding:2px 7px; border-radius:10px;
                      background:${spMeta.bg}; color:${spMeta.color}; border:1px solid ${spMeta.color}40;
                      flex-shrink:0;
                    ">${spMeta.icon} ${spMeta.label}</span>

                    <span style="font-size:11px; color:var(--muted); flex-shrink:0;">S${sprint.order}</span>
                    <input
                      type="text"
                      class="form-control"
                      style="flex:1; font-size:13px; font-weight:600; min-width:80px;"
                      .value=${sprint.title}
                      ?disabled=${isCompleted}
                      @input=${(e: InputEvent) => {
                        patchSprints(
                          sprints.map((s, i) =>
                            i === si ? { ...s, title: (e.target as HTMLInputElement).value } : s,
                          ),
                        );
                      }}
                    />
                    <!-- 操作按钮 -->
                    ${
                      isPlanning
                        ? html`
                      <button
                        class="btn btn--sm"
                        style="background:#eff6ff;color:#2563eb;border-color:#2563eb40;font-size:11px;padding:2px 8px;flex-shrink:0;"
                        @click=${() => props.onStartSprint(project.projectId, sprint.id)}
                      >▶ 开始</button>
                    `
                        : nothing
                    }
                    ${
                      isActive
                        ? html`
                      <button
                        class="btn btn--sm"
                        style="background:#f0fdf4;color:#16a34a;border-color:#16a34a40;font-size:11px;padding:2px 8px;flex-shrink:0;"
                        @click=${() => {
                          const unfinished = sprint.tasks.filter(
                            (t) => t.status !== "done" && t.status !== "cancelled",
                          );
                          const action =
                            unfinished.length > 0
                              ? confirm(
                                  `有 ${unfinished.length} 个未完成任务，移入下一 Sprint？\n\n确认=移入下一Sprint，取消=移入Backlog`,
                                )
                                ? "next_sprint"
                                : "backlog"
                              : "backlog";
                          props.onCompleteSprint(project.projectId, sprint.id, action);
                        }}
                      >✅ 完成 Sprint</button>
                    `
                        : nothing
                    }
                    <span style="font-size:12px;font-weight:700;color:${spColor};min-width:36px;text-align:right;">${sp}%</span>
                    ${
                      !isCompleted
                        ? html`
                      <button class="btn btn--sm" style="color:#dc2626;padding:2px 6px;font-size:11px;flex-shrink:0;"
                        @click=${() => {
                          if (confirm(`删除 Sprint「${sprint.title}」及其所有任务？`)) {
                            patchSprints(sprints.filter((_, i) => i !== si));
                          }
                        }}
                      >删</button>
                    `
                        : nothing
                    }
                  </div>

                  <!-- 日期行 -->
                  <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
                    <span style="font-size:11px;color:var(--muted);">周期:</span>
                    <input type="date" class="form-control" style="width:130px; font-size:11px;"
                      .value=${sprint.startDate ? new Date(sprint.startDate).toISOString().slice(0, 10) : ""}
                      ?disabled=${isCompleted}
                      @change=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        patchSprints(
                          sprints.map((s, i) =>
                            i === si
                              ? { ...s, startDate: v ? new Date(v).getTime() : undefined }
                              : s,
                          ),
                        );
                      }}
                    />
                    <span style="font-size:11px;color:var(--muted)">→</span>
                    <input type="date" class="form-control" style="width:130px; font-size:11px;"
                      .value=${sprint.endDate ? new Date(sprint.endDate).toISOString().slice(0, 10) : ""}
                      ?disabled=${isCompleted}
                      @change=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        patchSprints(
                          sprints.map((s, i) =>
                            i === si ? { ...s, endDate: v ? new Date(v).getTime() : undefined } : s,
                          ),
                        );
                      }}
                    />
                    ${
                      isCompleted && sprint.completedAt
                        ? html`
                      <span style="font-size:11px;color:#16a34a;">完成于 ${new Date(sprint.completedAt).toLocaleDateString("zh-CN")}</span>
                    `
                        : nothing
                    }
                  </div>

                  <!-- Sprint 目标 -->
                  <input type="text" class="form-control"
                    style="font-size:12px; margin-bottom:8px; color:var(--muted);"
                    .value=${sprint.goal ?? ""}
                    placeholder="Sprint 目标（可选）"
                    ?disabled=${isCompleted}
                    @input=${(e: InputEvent) => {
                      patchSprints(
                        sprints.map((s, i) =>
                          i === si ? { ...s, goal: (e.target as HTMLInputElement).value } : s,
                        ),
                      );
                    }}
                  />

                  <!-- Sprint 进度条 -->
                  <div style="height:5px; background:var(--border); border-radius:3px; overflow:hidden; margin-bottom:6px;">
                    <div style="height:100%; width:${sp}%; background:${spColor}; border-radius:3px; transition:width 0.3s;"></div>
                  </div>
                  <div style="display:flex; justify-content:space-between; font-size:11px;color:var(--muted);margin-bottom:10px;">
                    <span>${doneCnt}/${sprint.tasks.filter((t) => t.status !== "cancelled").length} 任务完成
                    ${totalSP > 0 ? html` · ${doneSP}/${totalSP} SP` : nothing}</span>
                    ${
                      isCompleted && sprint.velocity !== undefined
                        ? html`<span style="color:#16a34a;font-weight:600;">速度: ${sprint.velocity} SP ⚡</span>`
                        : nothing
                    }
                  </div>

                  <!-- 已完成 Sprint：回顾备注 -->
                  ${
                    isCompleted
                      ? html`
                    <div style="background:var(--card-bg-alt, #f9fafb); border-radius:6px; padding:8px; margin-bottom:8px; font-size:12px;">
                      <div style="font-weight:600; margin-bottom:4px;">📝 Sprint 回顾</div>
                      <textarea class="form-control" rows="2"
                        placeholder="记录本次 Sprint 的经验教训、改进点…"
                        style="font-size:12px;"
                        .value=${sprint.retrospective ?? ""}
                        @input=${(e: InputEvent) => {
                          patchSprints(
                            sprints.map((s, i) =>
                              i === si
                                ? { ...s, retrospective: (e.target as HTMLTextAreaElement).value }
                                : s,
                            ),
                          );
                        }}
                      ></textarea>
                    </div>
                  `
                      : nothing
                  }

                  <!-- 看板（已完成 Sprint 折叠显示） -->
                  ${
                    !isCompleted
                      ? html`
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">
                      ${KANBAN_COLUMNS.map((col) => {
                        const colTasks = sprint.tasks.filter((t) => t.status === col.status);
                        const cfg = TASK_STATUS_CONFIG[col.status];
                        return html`
                          <div style="background:${cfg.bg}; border:1px solid var(--border); border-radius:8px; padding:8px; min-height:80px;">
                            <div style="font-size:11px; font-weight:600; color:${cfg.color}; margin-bottom:6px;">
                              ${col.label} <span style="opacity:0.6;">(${colTasks.length})</span>
                            </div>
                            ${colTasks.map(
                              (task) => html`
                              <div style="background:var(--card-bg,#fff); border:1px solid var(--border); border-radius:6px; padding:6px 8px; margin-bottom:4px; font-size:12px;">
                                <div style="display:flex; align-items:flex-start; gap:4px;">
                                  <span style="color:${PRIORITY_CONFIG[task.priority].color}; flex-shrink:0;">${PRIORITY_CONFIG[task.priority].icon}</span>
                                  <span style="flex:1; word-break:break-word;">${task.title}</span>
                                </div>
                                ${task.storyPoints ? html`<div style="font-size:10px;color:var(--muted);margin-top:2px;">SP: ${task.storyPoints}</div>` : nothing}
                                <!-- 状态快捷切换 -->
                                <select
                                  style="font-size:10px; width:100%; margin-top:4px; border:1px solid var(--border); border-radius:4px; padding:1px 3px; background:transparent;"
                                  .value=${task.status}
                                  @change=${(e: Event) => {
                                    const newStatus = (e.target as HTMLSelectElement)
                                      .value as TaskStatus;
                                    const updatedTask = {
                                      ...task,
                                      status: newStatus,
                                      updatedAt: Date.now(),
                                      completedAt: newStatus === "done" ? Date.now() : undefined,
                                    };
                                    patchSprints(
                                      sprints.map((s, i) =>
                                        i === si
                                          ? {
                                              ...s,
                                              tasks: s.tasks.map((t) =>
                                                t.id === task.id ? updatedTask : t,
                                              ),
                                            }
                                          : s,
                                      ),
                                    );
                                  }}
                                >
                                  ${Object.entries(TASK_STATUS_CONFIG).map(([v, c]) => html`<option value=${v}>${c.label}</option>`)}
                                </select>
                              </div>
                            `,
                            )}
                            <!-- 内联添加任务 -->
                            <div style="margin-top:4px;">
                              <input
                                type="text"
                                placeholder="+ 添加任务…"
                                style="width:100%; font-size:11px; border:1px dashed ${cfg.color}; border-radius:5px; padding:3px 6px; background:transparent; color:var(--text); outline:none; box-sizing:border-box;"
                                @keydown=${(e: KeyboardEvent) => {
                                  if (e.key !== "Enter") {
                                    return;
                                  }
                                  const input = e.target as HTMLInputElement;
                                  const title = input.value.trim();
                                  if (!title) {
                                    return;
                                  }
                                  const newTask: ProjectTask = {
                                    id: `task-${Date.now()}`,
                                    title,
                                    status: col.status,
                                    priority: "medium",
                                    createdAt: Date.now(),
                                  };
                                  patchSprints(
                                    sprints.map((s, i) =>
                                      i === si ? { ...s, tasks: [...s.tasks, newTask] } : s,
                                    ),
                                  );
                                  input.value = "";
                                }}
                              />
                            </div>
                          </div>
                        `;
                      })}
                    </div>
                  `
                      : html`
                    <!-- 已完成 Sprint：任务汇总 -->
                    <details style="font-size:12px;">
                      <summary style="cursor:pointer; color:var(--muted); user-select:none;">查看 ${sprint.tasks.length} 个任务记录 ▼</summary>
                      <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">
                        ${sprint.tasks.map(
                          (task) => html`
                          <span style="
                            font-size:11px; padding:2px 7px; border-radius:10px;
                            background:${TASK_STATUS_CONFIG[task.status]?.bg ?? "#f3f4f6"};
                            color:${TASK_STATUS_CONFIG[task.status]?.color ?? "#6b7280"};
                          ">${task.title}${task.storyPoints ? ` (${task.storyPoints}SP)` : ""}</span>
                        `,
                        )}
                      </div>
                    </details>
                  `
                  }
                </div>
              `;
              })
        }
      </div>

      <!-- Backlog -->
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <strong style="font-size:13px;">📥 Backlog（${backlog.length}）</strong>
          <button class="btn btn--sm" @click=${() => {
            const title = prompt("新建 Backlog 任务标题");
            if (!title?.trim()) {
              return;
            }
            const t: ProjectTask = {
              id: `task-${Date.now()}`,
              title: title.trim(),
              status: "backlog",
              priority: "none",
              createdAt: Date.now(),
            };
            patchBacklog([...backlog, t]);
          }}>+ 添加</button>
        </div>
        ${
          backlog.length === 0
            ? html`
                <div style="font-size: 12px; color: var(--muted)">暫无 Backlog 任务，点击添加待规划任务</div>
              `
            : backlog.map(
                (task, bi) => html`
            <div style="display:flex; align-items:center; gap:6px; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px;">
              <span style="color:${PRIORITY_CONFIG[task.priority].color};">${PRIORITY_CONFIG[task.priority].icon}</span>
              <span style="flex:1;">${task.title}</span>
              <select
                style="font-size:11px;border:1px solid var(--border);border-radius:3px;padding:1px 3px;"
                .value=${task.priority}
                @change=${(e: Event) => {
                  patchBacklog(
                    backlog.map((t, i) =>
                      i === bi
                        ? { ...t, priority: (e.target as HTMLSelectElement).value as TaskPriority }
                        : t,
                    ),
                  );
                }}
              >
                ${Object.entries(PRIORITY_CONFIG).map(([v, c]) => html`<option value=${v}>${c.icon} ${c.label}</option>`)}
              </select>
              <select
                style="font-size:11px;border:1px solid var(--border);border-radius:3px;padding:1px 3px;"
                @change=${(e: Event) => {
                  const targetSprint = (e.target as HTMLSelectElement).value;
                  if (!targetSprint) {
                    return;
                  }
                  const moved = backlog[bi];
                  patchBacklog(backlog.filter((_, i) => i !== bi));
                  patchSprints(
                    sprints.map((s) =>
                      s.id === targetSprint
                        ? { ...s, tasks: [...s.tasks, { ...moved, status: "todo" as TaskStatus }] }
                        : s,
                    ),
                  );
                }}
              >
                <option value="">分配到 Sprint...</option>
                ${sprints.map((s) => html`<option value=${s.id}>${s.title}</option>`)}
              </select>
              <button style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;"
                @click=${() => patchBacklog(backlog.filter((_, i) => i !== bi))}
              >删</button>
            </div>
          `,
              )
        }
      </div>

      <!-- 验收标准 & 备注 -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <strong style="font-size:12px; display:block; margin-bottom:6px;">✅ 旧版验收标准（备注）</strong>
          <textarea class="form-control" rows="4"
            placeholder="描述验收标准，Markdown 格式…（新项目建议改用下方结构化 DoD 门禁）"
            .value=${project.acceptanceCriteria ?? ""}
            @input=${(e: InputEvent) => {
              props.onUpdateProgress(project.projectId, {
                acceptanceCriteria: (e.target as HTMLTextAreaElement).value,
              });
            }}
          ></textarea>
        </div>
        <div class="card" style="padding:12px;">
          <strong style="font-size:12px; display:block; margin-bottom:6px;">📝 进度备注</strong>
          <textarea class="form-control" rows="4"
            placeholder="记录奕点、风险、下一步计划…"
            .value=${project.progressNotes ?? ""}
            @input=${(e: InputEvent) => {
              props.onUpdateProgress(project.projectId, {
                progressNotes: (e.target as HTMLTextAreaElement).value,
              });
            }}
          ></textarea>
        </div>
      </div>

      <!-- DoD 完成门禁可视化 -->
      ${renderCompletionGate(props, project)}

    </div>
  `;
}

/**
 * DoD 完成门禁可视化区域
 *
 * 展示结构化验收标准列表，支持逐条标记满足和 Agent 签收。
 * 在 AI 自主开发系统中，签收由 coordinator（项目 ownerId Agent）完成，而非人工输入。
 * 这是解决“无尽开发”问题的核心 UI 入口。
 */
function renderCompletionGate(props: ProjectsProps, project: ProjectInfo) {
  const gate = project.completionGate;
  const isScopeFrozen = gate?.scopeFrozen ?? false;

  // 计算 DoD 进度
  const total = gate?.criteria.length ?? 0;
  const satisfied = gate?.criteria.filter((c) => c.satisfied).length ?? 0;
  const dodPercent = total === 0 ? 0 : Math.round((satisfied / total) * 100);
  const allSatisfied = total > 0 && satisfied === total;
  const canSignOff = allSatisfied && (gate?.requireHumanSignOff ?? true) && !gate?.humanSignOffAt;
  const isCompleted = Boolean(gate?.humanSignOffAt) || (allSatisfied && !gate?.requireHumanSignOff);

  const gateBorderColor = isScopeFrozen
    ? "#2563eb"
    : isCompleted
      ? "#16a34a"
      : allSatisfied
        ? "#d97706"
        : "#e5e7eb";

  // 项目 ownerId 对应的 Agent（优先作为签收人）
  const ownerAgent = project.ownerId
    ? (props.agentsList?.agents ?? []).find((a) => a.id === project.ownerId)
    : undefined;
  const agentsList = props.agentsList?.agents ?? [];

  const VERIF_LABEL: Record<string, string> = {
    manual: "🤖 Agent 确认",
    automated: "⚙️ 自动化",
    evidence: "📄 证据",
  };

  return html`
    <div class="card" style="padding:14px 16px; margin-bottom:14px; border-left:3px solid ${gateBorderColor};">
      <!-- 标题行 -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="font-size:13px;">
            ${isScopeFrozen ? "🔒" : isCompleted ? "✅" : allSatisfied ? "⏳" : "🛡️"}
            DoD 完成门禁（Definition of Done）
          </strong>
          ${
            isScopeFrozen
              ? html`
                  <span class="chip" style="color: #2563eb; border-color: #2563eb; font-size: 11px"
                    >🔒 范围已冻结</span
                  >
                `
              : isCompleted
                ? html`
                    <span class="chip" style="color: #16a34a; border-color: #16a34a; font-size: 11px"
                      >✅ 已签收完成</span
                    >
                  `
                : allSatisfied
                  ? html`
                      <span class="chip" style="color: #d97706; border-color: #d97706; font-size: 11px"
                        >⏳ 待 Agent 签收</span
                      >
                    `
                  : nothing
          }
        </div>
        <span style="font-size:16px; font-weight:700; color:${gateBorderColor};">${dodPercent}%</span>
      </div>

      <!-- DoD 进度条 -->
      <div style="height:6px; background:var(--border); border-radius:3px; overflow:hidden; margin-bottom:10px;">
        <div style="height:100%; width:${dodPercent}%; background:${gateBorderColor}; border-radius:3px; transition:width 0.4s;"></div>
      </div>
      <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">
        ${satisfied}/${total} 验收标准已满足
        ${
          gate?.requireHumanSignOff
            ? html`
                · 需要 Agent 签收
              `
            : html`
                · 全自动可关闭
              `
        }
        ${
          gate?.humanSignOffAt
            ? html` · 签收 Agent: ${gate.humanSignOffBy ?? "coordinator"} · ${new Date(gate.humanSignOffAt).toLocaleString("zh-CN")}`
            : nothing
        }
      </div>

      ${
        !gate || gate.criteria.length === 0
          ? html`
              <div class="callout" style="font-size: 12px; margin-bottom: 12px">
                ⚠️ 未定义验收标准。请让 AI 调用 <code>projects.updateProgress</code> 传入
                <code>completionGate</code> 参数， 或者向 coordinator 发消息要求它为该项目定义验收标准。
              </div>
            `
          : html`
            <!-- 验收标准列表 -->
            <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
              ${gate.criteria.map(
                (c) => html`
                <div style="
                  display:flex; align-items:flex-start; gap:8px;
                  padding:8px 10px; border-radius:6px;
                  background:${c.satisfied ? "#f0fdf4" : "#f9fafb"};
                  border:1px solid ${c.satisfied ? "#86efac" : "var(--border)"};
                ">
                  <!-- 满足开关 -->
                  <button
                    title=${c.satisfied ? "点击取消满足" : "点击标记为已满足"}
                    style="
                      width:20px; height:20px; border-radius:4px; flex-shrink:0;
                      border:2px solid ${c.satisfied ? "#16a34a" : "#d1d5db"};
                      background:${c.satisfied ? "#16a34a" : "transparent"};
                      cursor:${isScopeFrozen ? "not-allowed" : "pointer"};
                      display:flex; align-items:center; justify-content:center;
                      font-size:12px; color:white; padding:0;
                    "
                    ?disabled=${isScopeFrozen}
                    @click=${() => {
                      if (isScopeFrozen) {
                        return;
                      }
                      props.onMarkCriterionSatisfied(project.projectId, c.id, !c.satisfied);
                    }}
                  >${c.satisfied ? "✓" : ""}</button>

                  <div style="flex:1; min-width:0;">
                    <div style="font-size:12px; font-weight:${c.satisfied ? "400" : "500"}; color:${c.satisfied ? "var(--muted)" : "var(--text)"}; text-decoration:${c.satisfied ? "line-through" : "none"}; word-break:break-word;">
                      ${c.description}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:3px; flex-wrap:wrap;">
                      <span style="font-size:10px; color:var(--muted);">${VERIF_LABEL[c.verificationType] ?? c.verificationType}</span>
                      ${
                        c.satisfied && c.satisfiedAt
                          ? html`<span style="font-size:10px; color:#16a34a;">✓ ${c.satisfiedBy ?? ""} ${new Date(c.satisfiedAt).toLocaleDateString("zh-CN")}</span>`
                          : nothing
                      }
                      ${
                        c.evidence
                          ? html`<span style="font-size:10px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px;" title=${c.evidence}>📄 ${c.evidence}</span>`
                          : nothing
                      }
                    </div>
                  </div>
                </div>
              `,
              )}
            </div>
          `
      }

      <!-- Agent 签收区域 -->
      ${
        canSignOff
          ? html`
            <div style="border-top:1px solid var(--border); padding-top:10px; margin-top:4px;">
              <div style="font-size:12px; font-weight:600; margin-bottom:6px; color:#d97706;">⏳ 所有验收标准已满足，请 Agent 确认签收</div>
              <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">
                在 AI 自主开发系统中，签收由项目负责 Agent（coordinator）完成。
                ${
                  ownerAgent
                    ? html`当前项目负责 Agent：<strong>${ownerAgent.name ?? ownerAgent.id}</strong>`
                    : project.ownerId
                      ? html`当前项目 Agent ID：<code>${project.ownerId}</code>`
                      : html`
                          未设置项目负责 Agent
                        `
                }
              </div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <select
                  id="sign-off-agent-${project.projectId}"
                  class="form-control"
                  style="flex:1; min-width:120px; font-size:12px;"
                >
                  ${
                    ownerAgent
                      ? html`<option value=${ownerAgent.id} selected>${ownerAgent.name ?? ownerAgent.id}（项目负责人）</option>`
                      : project.ownerId
                        ? html`<option value=${project.ownerId} selected>${project.ownerId}（项目负责人）</option>`
                        : html`
                            <option value="coordinator" selected>coordinator（默认）</option>
                          `
                  }
                  ${agentsList
                    .filter((a) => a.id !== project.ownerId)
                    .map((a) => html`<option value=${a.id}>${a.name ?? a.id}</option>`)}
                </select>
                <button
                  class="btn btn--primary btn--sm"
                  @click=${() => {
                    const sel = document.getElementById(
                      `sign-off-agent-${project.projectId}`,
                    ) as HTMLSelectElement | null;
                    const agentId = sel?.value?.trim() || project.ownerId || "coordinator";
                    if (
                      confirm(
                        `确认由 Agent「${agentId}」签收项目「${project.name}」？\n\n签收后项目状态将自动设为“已完成”，AI 不再被允许为该项目创建新任务。`,
                      )
                    ) {
                      props.onHumanSignOff(project.projectId, agentId);
                    }
                  }}
                >🤖 Agent 签收</button>
              </div>
            </div>
          `
          : isScopeFrozen
            ? html`
              <div style="border-top:1px solid var(--border); padding-top:10px; margin-top:4px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                  <div style="font-size:12px; color:var(--muted);">
                    🔒 项目已${gate?.scopeFrozenReason === "cancelled" ? "取消" : "完成"}并冻结，不再接受新任务。
                    ${gate?.scopeFrozenAt ? html`<span style="margin-left:4px;">冻结于 ${new Date(gate.scopeFrozenAt).toLocaleString("zh-CN")}</span>` : nothing}
                  </div>
                  <button
                    class="btn btn--sm"
                    style="font-size:11px; background:#fffbeb; color:#d97706; border-color:#d97706; flex-shrink:0;"
                    title="将项目状态回退为开发中，解除范围冻结，允许继续创建新任务"
                    @click=${() => {
                      if (confirm(`确认重新激活项目「${project.name}」？\n\n项目状态将回退为"开发中"，范围冻结解除，AI 可继续创建新任务。`)) {
                        props.onSaveProgress(project.projectId, { status: "development" });
                      }
                    }}
                  >↩ 重新激活（解冻）</button>
                </div>
              </div>`
            : nothing
      }
    </div>
  `;
}

function renderProjectRoadmap(props: ProjectsProps, project: ProjectInfo) {
  const objectives = project.objectives ?? [];
  const milestones = project.timelineMilestones ?? [];

  const timeframeLabel: Record<ProjectObjective["timeframe"], string> = {
    short: "\uD83D\uDFE1 \u77ED\u671F",
    medium: "\uD83D\uDD35 \u4E2D\u671F",
    long: "\uD83D\uDFDF \u957F\u671F",
  };
  const objStatusLabel: Record<ProjectObjective["status"], string> = {
    "not-started": "\u2B1C \u672A\u5F00\u59CB",
    "in-progress": "\uD83D\uDFE2 \u8FDB\u884C\u4E2D",
    "achieved": "\u2705 \u5DF2\u8FBE\u6210",
    "missed": "\u274C \u672A\u8FBE\u6210",
    "deferred": "\u23F8\uFE0F \u5DF2\u5EF6\u8FDF",
  };
  const msTypeLabel: Record<ProjectMilestoneEntry["type"], string> = {
    release: "\uD83D\uDE80 \u53D1\u5E03",
    phase: "\uD83D\uDCE6 \u9636\u6BB5",
    checkpoint: "\uD83D\uDD0D \u68C0\u67E5\u70B9",
    deliverable: "\uD83D\uDCDD \u4EA4\u4ED8\u7269",
    other: "\uD83D\uDCCC \u5176\u4ED6",
  };
  const msStatusLabel: Record<ProjectMilestoneEntry["status"], string> = {
    upcoming: "\u23F3 \u5373\u5C06\u5230\u6765",
    "in-progress": "\uD83D\uDFE2 \u8FDB\u884C\u4E2D",
    completed: "\u2705 \u5DF2\u5B8C\u6210",
    missed: "\u274C \u5DF2\u9519\u8FC7",
    cancelled: "\u26D4 \u5DF2\u53D6\u6D88",
  };

  let newObjTitle = "";
  let newObjTimeframe: ProjectObjective["timeframe"] = "short";
  let newObjDesc = "";
  let newMsTitle = "";
  let newMsType: ProjectMilestoneEntry["type"] = "phase";
  let newMsDateStr = "";

  return html`
    <div style="padding-bottom: 24px;">
      <h3 style="margin: 0 0 4px 0;">\uD83D\uDDFA\uFE0F \u76EE\u6807\u4E0E\u8DEF\u7EBF\u56FE</h3>
      <p style="font-size: 12px; color: var(--muted); margin: 0 0 20px 0;">
        \u7BA1\u7406\u9879\u76EE\u77ED\u671F\u3001\u4E2D\u671F\u3001\u957F\u671F\u6218\u7565\u76EE\u6807\uFF08OKR\uFF09\u4E0E\u65F6\u95F4\u8F74\u91CC\u7A0B\u7891\uFF0C\u5E2E\u52A9\u56E2\u961F\u660E\u786E\u76EE\u6807\u3001\u5F62\u6210\u5408\u529B\u3002
      </p>

      <div style="margin-bottom: 28px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <h4 style="margin: 0; font-size: 14px;">\uD83C\uDFAF \u6218\u7565\u76EE\u6807\uFF08Objectives\uFF09</h4>
          <span style="font-size: 12px; color: var(--muted);">\u5171 ${objectives.length} \u4E2A\u76EE\u6807</span>
        </div>
        ${
          objectives.length === 0
            ? html`<div class="callout" style="font-size: 13px;">\u6682\u65E0\u6218\u7565\u76EE\u6807\uFF0C\u5728\u4E0B\u65B9\u6DFB\u52A0\u7B2C\u4E00\u4E2A\u76EE\u6807</div>`
            : objectives.map((obj) => {
                const krTotal = obj.keyResults?.length ?? 0;
                const krDone = obj.keyResults?.filter((kr) => kr.achieved).length ?? 0;
                const krPct = krTotal > 0 ? Math.round((krDone / krTotal) * 100) : 0;
                return html`
                  <div style="border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px;">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                      <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
                          <span style="font-weight: 600; font-size: 13px;">${obj.title}</span>
                          <span class="chip" style="font-size: 11px;">${timeframeLabel[obj.timeframe]}</span>
                          <span class="chip" style="font-size: 11px;">${objStatusLabel[obj.status]}</span>
                        </div>
                        ${obj.description ? html`<div style="font-size: 12px; color: var(--muted); margin-bottom: 6px;">${obj.description}</div>` : nothing}
                        ${
                          krTotal > 0
                            ? html`
                              <div style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                  <span style="font-size: 11px; color: var(--muted);">KR \u8FDB\u5EA6: ${krDone}/${krTotal}</span>
                                  <div style="flex: 1; height: 4px; background: var(--border); border-radius: 2px; max-width: 120px;">
                                    <div style="height: 4px; background: #16a34a; border-radius: 2px; width: ${krPct}%;"></div>
                                  </div>
                                  <span style="font-size: 11px; color: var(--muted);">${krPct}%</span>
                                </div>
                                ${(obj.keyResults ?? []).map((kr) => html`
                                  <div style="font-size: 11px; color: ${kr.achieved ? "#16a34a" : "var(--muted)"}; display: flex; align-items: center; gap: 4px;">
                                    ${kr.achieved ? "\u2705" : "\u25CB"} <span>${kr.description}${
                                      kr.target != null
                                        ? html` <em style="color:var(--muted);font-size:10px;">(${kr.current ?? 0}/${kr.target} ${kr.unit ?? ""})</em>`
                                        : nothing
                                    }</span>
                                  </div>
                                `)}
                              </div>
                            `
                            : nothing
                        }
                        ${obj.targetDate ? html`<div style="font-size: 11px; color: var(--muted); margin-top: 4px;">\uD83D\uDCC5 \u76EE\u6807\u65E5\u671F: ${new Date(obj.targetDate).toLocaleDateString()}</div>` : nothing}
                      </div>
                      <button class="btn btn--sm" style="flex-shrink:0;font-size:11px;padding:2px 6px;background:var(--danger-bg,#fee2e2);color:var(--danger,#dc2626);"
                        @click=${() => { if (confirm(`\u786E\u8BA4\u5220\u9664\u76EE\u6807\u300C${obj.title}\u300D\uFF1F`)) { props.onDeleteObjective(project.projectId, obj.id); } }}
                      >\u5220\u9664</button>
                    </div>
                  </div>
                `;
              })
        }
        <div style="border: 1px dashed var(--border); border-radius: 8px; padding: 14px; margin-top: 12px;">
          <div style="font-size: 12px; font-weight: 600; margin-bottom: 10px; color: var(--muted);">\u2795 \u65B0\u589E\u76EE\u6807</div>
          <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: end;">
            <div class="form-group" style="margin: 0;">
              <label style="font-size: 11px;">\u76EE\u6807\u540D\u79F0 *</label>
              <input type="text" class="form-control" placeholder="\u4F8B\u5982\uFF1A\u5B8C\u6210\u7B2C\u4E00\u671F\u6838\u5FC3\u529F\u80FD\u4E0A\u7EBF"
                @input=${(e: InputEvent) => { newObjTitle = (e.target as HTMLInputElement).value; }} />
            </div>
            <div class="form-group" style="margin: 0;">
              <label style="font-size: 11px;">\u65F6\u95F4\u8303\u56F4</label>
              <select class="form-control" @change=${(e: Event) => { newObjTimeframe = (e.target as HTMLSelectElement).value as ProjectObjective["timeframe"]; }}>
                <option value="short">\uD83D\uDFE1 \u77ED\u671F</option>
                <option value="medium">\uD83D\uDD35 \u4E2D\u671F</option>
                <option value="long">\uD83D\uDFDF \u957F\u671F</option>
              </select>
            </div>
            <button class="btn btn--primary btn--sm" @click=${() => {
              if (!newObjTitle.trim()) { alert("\u8BF7\u8F93\u5165\u76EE\u6807\u540D\u79F0"); return; }
              props.onUpsertObjective(project.projectId, { id: `obj-${Date.now()}`, title: newObjTitle.trim(), description: newObjDesc.trim() || undefined, timeframe: newObjTimeframe, status: "not-started" });
              newObjTitle = ""; newObjDesc = "";
            }}>\u6DFB\u52A0</button>
          </div>
          <div class="form-group" style="margin: 8px 0 0 0;">
            <label style="font-size: 11px;">\u76EE\u6807\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09</label>
            <input type="text" class="form-control" placeholder="\u7B80\u8FF0\u8BE5\u76EE\u6807\u8981\u8FBE\u6210\u7684\u4E1A\u52A1\u6210\u679C"
              @input=${(e: InputEvent) => { newObjDesc = (e.target as HTMLInputElement).value; }} />
          </div>
        </div>
      </div>

      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <h4 style="margin: 0; font-size: 14px;">\uD83D\uDEA9 \u65F6\u95F4\u8F74\u91CC\u7A0B\u7891</h4>
          <span style="font-size: 12px; color: var(--muted);">${milestones.filter((m) => m.status === "upcoming" || m.status === "in-progress").length} \u4E2A\u8FDB\u884C\u4E2D/\u5373\u5C06\u5230\u6765</span>
        </div>
        ${
          milestones.length === 0
            ? html`<div class="callout" style="font-size: 13px;">\u6682\u65E0\u91CC\u7A0B\u7891\uFF0C\u5728\u4E0B\u65B9\u6DFB\u52A0\u7B2C\u4E00\u4E2A\u91CC\u7A0B\u7891</div>`
            : [...milestones].sort((a, b) => (a.targetDate ?? Infinity) - (b.targetDate ?? Infinity)).map((ms) => {
                const isPast = ms.status === "completed" || ms.status === "missed" || ms.status === "cancelled";
                const isOverdue = ms.targetDate != null && ms.targetDate < Date.now() && (ms.status === "upcoming" || ms.status === "in-progress");
                return html`
                  <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;margin-bottom:8px;border:1px solid ${isOverdue ? "#fca5a5" : "var(--border)"};border-radius:8px;background:${isOverdue ? "#fff5f5" : isPast ? "var(--bg-subtle,#f9fafb)" : "var(--card-bg,#fff)"};opacity:${ms.status === "cancelled" ? "0.6" : "1"};">
                    <div style="flex-shrink:0;font-size:20px;margin-top:2px;">${ms.status === "completed" ? "\u2705" : ms.status === "missed" ? "\uD83D\uDD34" : ms.status === "cancelled" ? "\u26D4" : ms.status === "in-progress" ? "\uD83D\uDFE2" : "\u23F3"}</div>
                    <div style="flex:1;">
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
                        <span style="font-weight:600;font-size:13px;">${ms.title}</span>
                        <span class="chip" style="font-size:11px;">${msTypeLabel[ms.type]}</span>
                        <span class="chip" style="font-size:11px;">${msStatusLabel[ms.status]}</span>
                        ${isOverdue ? html`<span class="chip" style="font-size:11px;color:#dc2626;border-color:#fca5a5;background:#fee2e2;">\u26A0\uFE0F \u5DF2\u8FDB\u5EA6\u6EDE\u540E</span>` : nothing}
                      </div>
                      ${ms.description ? html`<div style="font-size:12px;color:var(--muted);margin-bottom:4px;">${ms.description}</div>` : nothing}
                      ${ms.targetDate ? html`<div style="font-size:11px;color:${isOverdue ? "#dc2626" : "var(--muted)"};">📅 \u76EE\u6807\u65E5\u671F: ${new Date(ms.targetDate).toLocaleDateString()}${ms.completedAt ? html` &middot; \u5B8C\u6210\u4E8E: ${new Date(ms.completedAt).toLocaleDateString()}` : nothing}</div>` : nothing}
                    </div>
                    <button class="btn btn--sm" style="flex-shrink:0;font-size:11px;padding:2px 6px;background:var(--danger-bg,#fee2e2);color:var(--danger,#dc2626);"
                      @click=${() => { if (confirm(`\u786E\u8BA4\u5220\u9664\u91CC\u7A0B\u7891\u300C${ms.title}\u300D\uFF1F`)) { props.onDeleteMilestone(project.projectId, ms.id); } }}
                    >\u5220\u9664</button>
                  </div>
                `;
              })
        }
        <div style="border: 1px dashed var(--border); border-radius: 8px; padding: 14px; margin-top: 12px;">
          <div style="font-size: 12px; font-weight: 600; margin-bottom: 10px; color: var(--muted);">\u2795 \u65B0\u589E\u91CC\u7A0B\u7891</div>
          <div style="display: grid; grid-template-columns: 1fr auto auto auto; gap: 8px; align-items: end;">
            <div class="form-group" style="margin: 0;">
              <label style="font-size: 11px;">\u91CC\u7A0B\u7891\u540D\u79F0 *</label>
              <input type="text" class="form-control" placeholder="\u4F8B\u5982\uFF1A MVP v1.0 \u53D1\u5E03"
                @input=${(e: InputEvent) => { newMsTitle = (e.target as HTMLInputElement).value; }} />
            </div>
            <div class="form-group" style="margin: 0;">
              <label style="font-size: 11px;">\u7C7B\u578B</label>
              <select class="form-control" @change=${(e: Event) => { newMsType = (e.target as HTMLSelectElement).value as ProjectMilestoneEntry["type"]; }}>
                <option value="phase">\uD83D\uDCE6 \u9636\u6BB5</option>
                <option value="release">\uD83D\uDE80 \u53D1\u5E03</option>
                <option value="checkpoint">\uD83D\uDD0D \u68C0\u67E5\u70B9</option>
                <option value="deliverable">\uD83D\uDCDD \u4EA4\u4ED8\u7269</option>
                <option value="other">\uD83D\uDCCC \u5176\u4ED6</option>
              </select>
            </div>
            <div class="form-group" style="margin: 0;">
              <label style="font-size: 11px;">\u76EE\u6807\u65E5\u671F</label>
              <input type="date" class="form-control"
                @input=${(e: InputEvent) => { newMsDateStr = (e.target as HTMLInputElement).value; }} />
            </div>
            <button class="btn btn--primary btn--sm" style="margin-bottom:0;" @click=${() => {
              if (!newMsTitle.trim()) { alert("\u8BF7\u8F93\u5165\u91CC\u7A0B\u7891\u540D\u79F0"); return; }
              const targetDate = newMsDateStr ? new Date(newMsDateStr).getTime() : undefined;
              props.onUpsertMilestone(project.projectId, { id: `ms-${Date.now()}`, title: newMsTitle.trim(), type: newMsType, status: "upcoming", targetDate });
              newMsTitle = ""; newMsDateStr = "";
            }}>\u6DFB\u52A0</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderProjectHandoff(props: ProjectsProps, project: ProjectInfo) {
  const relations = props.projectTeamRelations;
  const loading = props.projectTeamRelationsLoading;
  const form = props.handoffForm;
  const selectedId = props.selectedProjectId ?? project.projectId;

  // 状态带颜色映射
  const statusLabel: Record<ProjectTeamStatus, string> = {
    active: "🟢 进行中",
    "handed-off": "🟡 已交付",
    "support-only": "🔵 技术支撑",
    archived: "⏹️ 已归档",
  };
  const roleLabel: Record<ProjectTeamRole, string> = {
    dev: "🛠️ 开发团队",
    ops: "🔧 运营实施",
    support: "🎟️ 技术支撑",
    qa: "🔍 测试验收",
    observer: "👁️ 观察者",
  };

  return html`
    <div class="project-handoff">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <h3 style="margin: 0;">🤝 跨团队协作与交付</h3>
        <button
          class="btn btn--sm"
          ?disabled=${loading}
          @click=${() => props.onLoadTeamRelations(selectedId)}
        >
          ${loading ? "加载中...🔄" : "刷新"}
        </button>
      </div>

      <div class="callout info" style="margin-bottom: 20px; font-size: 13px;">
        同一项目对不同团队呈现独立的「参与状态」视图。团队完成阶段性工作后可将项目交付给下一帮负责团队，交出团队转为 技术支撑 状态保留技术通道。
      </div>

      <!-- 团队关系列表 -->
      <div style="margin-bottom: 24px;">
        <h4 style="margin-bottom: 12px;">参与团队（${relations.length}）</h4>
        ${
          relations.length === 0
            ? html`
                <div class="callout">暂无团队关联，可在下方添加团队</div>
              `
            : relations.map(
                (rel) => html`
                  <div class="list-item" style="margin-bottom: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 8px;">
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <strong>${rel.teamId}</strong>
                        <span class="chip" style="font-size: 11px;">${roleLabel[rel.role] ?? rel.role}</span>
                        <span class="chip" style="font-size: 11px;">${statusLabel[rel.status] ?? rel.status}</span>
                      </div>
                      ${
                        rel.note
                          ? html`<div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">${rel.note}</div>`
                          : nothing
                      }
                      <div style="font-size: 11px; color: var(--muted);">
                        加入于: ${new Date(rel.joinedAt).toLocaleDateString()}
                        ${
                          rel.handoffHistory.length > 0
                            ? html`&nbsp;&middot;&nbsp;交付记录: ${rel.handoffHistory.length} 条`
                            : nothing
                        }
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                      <select
                        class="form-control"
                        style="font-size: 12px; padding: 2px 6px; height: auto; min-width: 100px;"
                        .value=${rel.status}
                        @change=${(e: Event) => {
                          const v = (e.target as HTMLSelectElement).value as ProjectTeamStatus;
                          props.onUpdateTeamStatus(selectedId, rel.teamId, v);
                        }}
                      >
                        <option value="active">进行中</option>
                        <option value="handed-off">已交付</option>
                        <option value="support-only">技术支撑</option>
                        <option value="archived">已归档</option>
                      </select>
                      <button
                        class="btn btn--sm"
                        style="font-size: 12px; padding: 2px 8px; background: var(--danger-bg, #fee2e2); color: var(--danger, #dc2626);"
                        @click=${() => props.onRemoveTeam(selectedId, rel.teamId)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                `,
              )
        }
      </div>

      <!-- 关联新团队 -->
      <div style="border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 12px 0;">将团队关联到项目</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end;">
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 12px;">团队 ID</label>
            <input
              type="text"
              class="form-control"
              placeholder="输入团队 ID"
              .value=${form.toTeamId}
              @input=${(e: InputEvent) => {
                props.onHandoffFormChange("toTeamId", (e.target as HTMLInputElement).value);
              }}
            />
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 12px;">角色</label>
            <select
              class="form-control"
              .value=${form.toTeamRole}
              @change=${(e: Event) => {
                props.onHandoffFormChange("toTeamRole", (e.target as HTMLSelectElement).value);
              }}
            >
              <option value="dev">🛠️ 开发团队</option>
              <option value="ops">🔧 运营实施</option>
              <option value="support">🎟️ 技术支撑</option>
              <option value="qa">🔍 测试验收</option>
              <option value="observer">👁️ 观察者</option>
            </select>
          </div>
          <button
            class="btn btn--primary"
            ?disabled=${!form.toTeamId.trim()}
            @click=${() => props.onAssignTeam(selectedId, form.toTeamId.trim(), form.toTeamRole)}
          >
            关联团队
          </button>
        </div>
      </div>

      <!-- 负责交付 -->
      <div style="border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: var(--card-bg-alt, rgba(251,191,36,0.05));">
        <h4 style="margin: 0 0 4px 0;">📦 负责交付（Handoff）</h4>
        <p style="font-size: 12px; color: var(--muted); margin: 0 0 12px 0;">
          将项目责任从当前团队转交给另一团队。执行后交出团队自动变为「技术支撑」，接收团队变为「进行中」。
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 12px;">接收方团队 ID <span style="color: red">*</span></label>
            <input
              type="text"
              class="form-control"
              placeholder="交付目标团队 ID"
              .value=${form.toTeamId}
              @input=${(e: InputEvent) => {
                props.onHandoffFormChange("toTeamId", (e.target as HTMLInputElement).value);
              }}
            />
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 12px;">接收方角色</label>
            <select
              class="form-control"
              .value=${form.toTeamRole}
              @change=${(e: Event) => {
                props.onHandoffFormChange("toTeamRole", (e.target as HTMLSelectElement).value);
              }}
            >
              <option value="ops">🔧 运营实施</option>
              <option value="dev">🛠️ 开发团队</option>
              <option value="support">🎟️ 技术支撑</option>
              <option value="qa">🔍 测试验收</option>
              <option value="observer">👁️ 观察者</option>
            </select>
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 12px;">交出方新状态</label>
            <select
              class="form-control"
              .value=${form.fromTeamNewStatus}
              @change=${(e: Event) => {
                props.onHandoffFormChange(
                  "fromTeamNewStatus",
                  (e.target as HTMLSelectElement).value,
                );
              }}
            >
              <option value="support-only">🔵 技术支撑</option>
              <option value="handed-off">🟡 已交付</option>
              <option value="archived">⏹️ 归档</option>
            </select>
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 12px;">接收方新状态</label>
            <select
              class="form-control"
              .value=${form.toTeamNewStatus}
              @change=${(e: Event) => {
                props.onHandoffFormChange("toTeamNewStatus", (e.target as HTMLSelectElement).value);
              }}
            >
              <option value="active">🟢 进行中</option>
              <option value="support-only">🔵 技术支撑</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin: 0 0 12px 0;">
          <label style="font-size: 12px;">交付说明（可选）</label>
          <input
            type="text"
            class="form-control"
            placeholder="例如：一期开发完成，移交运营小组接手"
            .value=${form.note}
            @input=${(e: InputEvent) => {
              props.onHandoffFormChange("note", (e.target as HTMLInputElement).value);
            }}
          />
        </div>
        <button
          class="btn btn--primary"
          style="width: 100%;"
          ?disabled=${!form.toTeamId.trim()}
          @click=${() => props.onHandoffProject(selectedId)}
        >
          📦 执行交付
        </button>
      </div>
    </div>
  `;
}

function renderProjectEditModal(props: ProjectsProps) {
  const isCreating = !props.editingProject;
  const project = props.editingProject || {
    projectId: "",
    name: "",
    description: "",
    workspacePath: "",
    codeDir: "",
    docsDir: "",
    testsDir: "",
  };

  // 创建时自动推算预期 codeDir
  const previewCodeDir =
    isCreating && props.projectCodeRoot && project.name
      ? `${props.projectCodeRoot.replace(/[\\/]+$/, "")}\\${project.name}`
      : "";
  const codeDirPlaceholder = isCreating
    ? props.projectCodeRoot
      ? `自动设为：${previewCodeDir || props.projectCodeRoot.replace(/[\\/]+$/, "") + "\\<项目名>"}（可覆盖）`
      : "请先在页面顶部设置「项目代码根目录」，或在此手动填写完整路径"
    : "可为代码仓库、设计文件夹或任意工作文件夹，也可留空";

  return html`
    <div class="modal-overlay" @click=${props.onCancelProjectEdit}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>${props.editingProject ? "编辑项目" : "创建项目"}</h3>
          <button class="modal-close" @click=${props.onCancelProjectEdit}>×</button>
        </div>
        
        <div class="modal-body">
          ${
            isCreating && !props.projectCodeRoot
              ? html`
                  <div
                    class="callout"
                    style="
                      margin-bottom: 16px;
                      border-left: 3px solid var(--warning, #d97706);
                      background: var(--warning-bg, #fffbeb);
                    "
                  >
                    <strong>⚠️ 未设置项目代码根目录</strong>
                    <div style="margin-top: 4px; font-size: 13px">
                      请先关闭此对话框，在页面顶部设置「项目代码根目录」（如 <code>I:\\</code>）。 设置后 AI
                      和手动创建的项目都会自动将代码目录定位到 <code>根目录\\<项目名></code>。
                      如果你希望立刻创建，可在下方“工作目录”手动填写完整路径。
                    </div>
                  </div>
                `
              : nothing
          }

          <div class="form-group">
            <label>项目 ID</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.projectId}"
              ?disabled=${!!props.editingProject}
              placeholder="例如：project-alpha"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("projectId", target.value);
              }}
            />
            <small>项目唯一标识符，创建后不可修改</small>
          </div>

          <div class="form-group">
            <label>项目名称</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.name}"
              placeholder="例如：Alpha 项目"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("name", target.value);
              }}
            />
          </div>

          <div class="form-group">
            <label>描述</label>
            <textarea 
              class="form-control"
              rows="3"
              placeholder="项目描述..."
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLTextAreaElement;
                props.onProjectFormChange("description", target.value);
              }}
            >${project.description || ""}</textarea>
          </div>

          <div class="form-group">
            <label>工作空间根目录</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.workspacePath || ""}"
              placeholder="例如：H:\\OpenClaw_Workspace\\groups\\project-alpha"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("workspacePath", target.value);
              }}
            />
          </div>

          <div class="form-group">
            <label>工作目录（代码目录）</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.codeDir || ""}"
              placeholder="${codeDirPlaceholder}"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("codeDir", target.value);
              }}
            />
            ${
              isCreating && previewCodeDir && !project.codeDir
                ? html`<small style="color: var(--success, #16a34a);">预期路径：${previewCodeDir}（可修改）</small>`
                : html`
                    <small>可为代码仓库、设计文件夹或任意工作文件夹，也可留空</small>
                  `
            }
          </div>

          ${
            isCreating
              ? html`
            <!-- DoD 完成门禁引导（仅新建项目时显示） -->
            <div
              class="callout"
              style="
                margin-top: 16px;
                border-left: 3px solid #2563eb;
                background: #eff6ff;
                padding: 12px 14px;
              "
            >
              <strong style="font-size: 13px;">🛡️ 建议：在创建后立即定义完成门禁（DoD）</strong>
              <div style="font-size: 12px; margin-top: 8px; color: #1d4ed8; line-height: 1.6;">
                项目创建后，请到「项目进度 → DoD 完成门禁」区域定义验收标准。
                每条标准应包含:
                <ul style="margin: 6px 0 0 16px; padding: 0;">
                  <li>具体可验证的完成条件（禁止模糊表述如“功能完善”）</li>
                  <li>验证方式（人工 / 自动化测试 / 可检查产出物）</li>
                  <li>是否需要人工最终签收（强烈建议保持开启）</li>
                </ul>
                <div style="margin-top: 8px; color: #374151; font-size: 11px;">
                  也可以让 AI coordinator 帮助：发送「请为项目 ${project.name || project.projectId || "XXX"}
                  定义验收标准，调用 projects.updateProgress 设置 completionGate」
                </div>
              </div>
            </div>
          `
              : nothing
          }
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${props.onCancelProjectEdit}>
            取消
          </button>
          <button 
            class="btn btn--primary" 
            @click=${props.onSaveProject}
            ?disabled=${!project.projectId || !project.name}
          >
            ${props.editingProject ? "保存修改" : "创建项目"}
          </button>
        </div>
      </div>
    </div>
  `;
}
