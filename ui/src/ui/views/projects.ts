import { html, nothing } from "lit";
import { t } from "../i18n.ts";
import type { AgentsListResult } from "../types.ts";

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
 * 项目生命周期状态（参考业界标准）
 *
 * planning    → 立项规划中
 * active      → 开发进行中
 * dev_done    → 开发完成（测试/验收阶段）
 * operating   → 运营中（已上线正常运营）
 * maintenance → 维护模式（只做保活，无新需求）
 * paused      → 暂停（临时暂停，后续继续）
 * completed   → 已完成（正常收尾关闭）
 * deprecated  → 已废弃（不再维护）
 * cancelled   → 已取消（中途放弃）
 */
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

/** 项目状态元数据（标签/颜色/图标） */
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; icon: string; color: string; bg: string }> = {
  planning:    { label: "立项规划", icon: "📍", color: "#6b7280", bg: "#f3f4f6" },
  active:      { label: "开发中",   icon: "🟢", color: "#16a34a", bg: "#f0fdf4" },
  dev_done:    { label: "开发完成", icon: "📦", color: "#0891b2", bg: "#ecfeff" },
  operating:   { label: "运营中",   icon: "🚀", color: "#7c3aed", bg: "#f5f3ff" },
  maintenance: { label: "维护模式", icon: "🔧", color: "#d97706", bg: "#fffbeb" },
  paused:      { label: "已暂停",   icon: "⏸️", color: "#9ca3af", bg: "#f9fafb" },
  completed:   { label: "已完成",   icon: "✅", color: "#2563eb", bg: "#eff6ff" },
  deprecated:  { label: "已废弃",   icon: "🗑️", color: "#dc2626", bg: "#fef2f2" },
  cancelled:   { label: "已取消",   icon: "❌", color: "#ef4444", bg: "#fef2f2" },
};

/** 筛选选项：包含“全部”和各项目状态 */
export type ProjectStatusFilter = "all" | ProjectStatus;

/** 默认展示各状态（均显示）*/
export const STATUS_FILTER_OPTIONS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "all",         label: "📂 全部项目" },
  { value: "active",      label: "🟢 开发中" },
  { value: "planning",    label: "📍 立项规划" },
  { value: "dev_done",    label: "📦 开发完成" },
  { value: "operating",   label: "🚀 运营中" },
  { value: "maintenance", label: "🔧 维护模式" },
  { value: "paused",      label: "⏸️ 已暂停" },
  { value: "completed",   label: "✅ 已完成" },
  { value: "deprecated",  label: "🗑️ 已废弃" },
  { value: "cancelled",   label: "❌ 已取消" },
];
export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  storyPoints?: number;
  labels?: string[];
  dueDate?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt?: number;
  blockedBy?: string[];
}

export interface ProjectSprint {
  id: string;
  title: string;
  goal?: string;
  startDate?: number;
  endDate?: number;
  completedAt?: number;
  order: number;
  tasks: ProjectTask[];
}

/** 向后兼容别名 */
export type ProjectMilestone = ProjectSprint;

/** 计算 Sprint 进度 */
export function calcSprintProgress(sprint: ProjectSprint): number {
  const tasks = sprint.tasks.filter((t) => t.status !== "cancelled");
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const done = tasks.filter((t) => t.status === "done").reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** 计算项目整体进度 */
export function calcProjectProgress(sprints: ProjectSprint[]): number {
  if (sprints.length === 0) return 0;
  const all = sprints.flatMap((s) => s.tasks).filter((t) => t.status !== "cancelled");
  if (all.length === 0) return 0;
  const total = all.reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const done = all.filter((t) => t.status === "done").reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  return total === 0 ? 0 : Math.round((done / total) * 100);
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
  /** 验收标准 */
  acceptanceCriteria?: string;
  /** 进度备注 */
  progressNotes?: string;
  /** 进度最后更新时间 */
  progressUpdatedAt?: number;
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
  activePanel: "list" | "config" | "members" | "progress" | "handoff";
  creatingProject: boolean;
  editingProject: ProjectInfo | null;
  agentsList: AgentsListResult | null;
  /** 项目代码根目录（全局设置，如 I:\\ 或 D:\\Projects\\） */
  projectCodeRoot: string;
  onCodeRootChange: (root: string) => void;
  /** 当前选中的状态筛选 (默认 'active') */
  projectStatusFilter: ProjectStatusFilter;
  onStatusFilterChange: (filter: ProjectStatusFilter) => void;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectPanel: (panel: "list" | "config" | "members" | "progress" | "handoff") => void;
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
    patch: Partial<Pick<ProjectInfo, "progress" | "status" | "deadline" | "sprints" | "backlog" | "acceptanceCriteria" | "progressNotes" | "milestones">>,
  ) => void;
  /** 保存进度到服务器 */
  onSaveProgress: (
    projectId: string,
    patch: Partial<Pick<ProjectInfo, "progress" | "status" | "deadline" | "sprints" | "backlog" | "acceptanceCriteria" | "progressNotes" | "milestones">>,
  ) => void;
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
    v === "all" ? allProjects.length : allProjects.filter((p) => (p.status ?? "planning") === v).length;

  return html`
    <div style="display:flex; flex-direction:column; height:100%; gap:12px;">
      <!-- 代码根目录设置条 -->
      ${renderCodeRootBanner(props)}

      <!-- 项目列表主区域 -->
      <div style="flex:1; display:flex; gap:12px; min-height:0; overflow:hidden;">
        <!-- 左侧：筛选栏 + 卡片网格 -->
        <div style="display:flex; flex-direction:column; flex:1; min-width:0; overflow:hidden;">
          <!-- 工具栏 -->
          <div class="card" style="padding:10px 14px; margin-bottom:10px; flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <!-- 状态筛选下拉 -->
              <select
                class="form-control"
                style="width:auto; min-width:140px; font-size:13px;"
                .value=${props.projectStatusFilter}
                @change=${(e:Event) => {
                  props.onStatusFilterChange((e.target as HTMLSelectElement).value as ProjectStatusFilter);
                }}
              >
                ${STATUS_FILTER_OPTIONS.map(opt => html`
                  <option value=${opt.value}>
                    ${opt.label}${countByStatus(opt.value) > 0 ? ` (${countByStatus(opt.value)})` : ""}
                  </option>
                `)}
              </select>

              <!-- 状态快捷筛选 chips -->
              <div style="display:flex; gap:4px; flex-wrap:wrap; flex:1;">
                ${(["all", "active", "dev_done", "operating", "maintenance", "paused"] as ProjectStatusFilter[]).map(v => {
                  const cnt = countByStatus(v);
                  if (v !== "all" && cnt === 0) return nothing;
                  const meta = v === "all" ? null : PROJECT_STATUS_META[v as ProjectStatus];
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
                    >${v === "all" ? "📂 全部" : (meta!.icon + " " + meta!.label)} ${cnt > 0 ? `(${cnt})` : ""}</button>
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

          <!-- 错误提示 -->
          ${props.error ? html`<div class="callout danger" style="margin-bottom:10px;">${props.error}</div>` : nothing}

          <!-- 卡片网格 -->
          <div style="flex:1; overflow-y:auto; padding-right:2px;">
            ${filtered.length === 0
              ? html`<div class="callout" style="text-align:center; padding:40px 20px;">
                  <div style="font-size:32px; margin-bottom:8px;">📋</div>
                  <div style="font-size:14px; color:var(--muted);">
                    ${allProjects.length === 0 ? "暂无项目，点击「新建项目」创建第一个" : "该状态下暂无项目"}
                  </div>
                </div>`
              : html`<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; padding-bottom:16px;">
                  ${filtered.map(project => renderProjectCard(props, project, selectedId))}
                </div>`
            }
          </div>
        </div>

        <!-- 右侧：项目详情面板（选中时显示） -->
        ${selectedProject
          ? html`
            <div class="card" style="width:480px; flex-shrink:0; display:flex; flex-direction:column; overflow:hidden;">
              <!-- 面板头部 -->
              <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border); flex-shrink:0;">
                <div style="font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${selectedProject.name}
                </div>
                <button
                  style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted);padding:2px 6px;"
                  @click=${() => props.onSelectProject("")}
                >×</button>
              </div>
              <!-- Tab 内容 -->
              <div style="flex:1; overflow-y:auto; padding:12px 16px;">
                ${renderProjectTabs(props.activePanel, props.onSelectPanel)}
                <div style="margin-top:12px;">
                  ${
                    props.activePanel === "list"     ? renderProjectOverview(props, selectedProject) :
                    props.activePanel === "config"   ? renderProjectConfig(props, selectedProject) :
                    props.activePanel === "members"  ? renderProjectMembers(props, selectedProject) :
                    props.activePanel === "handoff"  ? renderProjectHandoff(props, selectedProject) :
                    renderProjectProgress(props, selectedProject)
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
        ${hasRoot
          ? html`<span class="chip" style="color: var(--success, #16a34a); border-color: var(--success, #16a34a);">✓ 已设置</span>`
          : html`<span class="chip" style="color: var(--warning, #d97706); border-color: var(--warning, #d97706);">⚠️ 未设置，AI 创建项目时将无法自动分配代码目录</span>`
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
    progress >= 100 ? "#2563eb" :
    progress >= 60  ? "#16a34a" :
    progress >= 30  ? "#d97706" : "#9ca3af";
  const isSelected = selectedId === project.projectId;

  const totalTasks = sprints.flatMap(s => s.tasks).filter(t => t.status !== "cancelled").length;
  const doneTasks  = sprints.flatMap(s => s.tasks).filter(t => t.status === "done").length;
  const isOverdue  = project.deadline && project.deadline < Date.now() && status !== "completed";

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
        ${project.description
          ? html`<div style="font-size:12px; color:var(--muted); margin-bottom:8px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${project.description}</div>`
          : nothing
        }

        <!-- 底部 meta -->
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:11px; color:var(--muted);">
          ${totalTasks > 0 ? html`<span>📋 ${doneTasks}/${totalTasks} 任务</span>` : nothing}
          ${project.groups?.length ? html`<span>👥 ${project.groups.length} 个群组</span>` : nothing}
          ${project.deadline
            ? html`<span style="color:${isOverdue ? "#dc2626" : "inherit"}">${isOverdue ? "⚠️ 已超期" : "🗓️"} ${new Date(project.deadline).toLocaleDateString("zh-CN")}</span>`
            : nothing
          }
          ${project.ownerId ? html`<span style="margin-left:auto;">👤 ${project.ownerId}</span>` : nothing}
        </div>
      </div>
    </div>
  `;
}

function renderProjectContent(props: ProjectsProps, project: ProjectInfo) {
  return html`
    <section class="card project-content">
      ${renderProjectTabs(props.activePanel, props.onSelectPanel)}
      
      <div style="margin-top: 16px;">
        ${
          props.activePanel === "list"
            ? renderProjectOverview(props, project)
            : props.activePanel === "config"
              ? renderProjectConfig(props, project)
              : props.activePanel === "members"
                ? renderProjectMembers(props, project)
                : props.activePanel === "handoff"
                  ? renderProjectHandoff(props, project)
                  : renderProjectProgress(props, project)
        }
      </div>
    </section>
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

      <div style="margin-top: 24px; display: flex; gap: 8px;">
        <button class="btn" @click=${() => props.onEditProject(project.projectId)}>
          编辑项目
        </button>
        <button class="btn btn--primary" 
          ?disabled=${!project.workspacePath}
          @click=${() => project.workspacePath && props.onOpenWorkspace(project.workspacePath)}
        >
          打开工作空间
        </button>
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

  return html`
    <div class="project-members">
      <h3>成员管理</h3>
      
      <div class="callout info" style="margin-bottom: 16px;">
        管理项目组成员和权限。项目管理员可以管理项目配置、分配任务和审批变更。
      </div>

      <div class="member-section">
        <h4>添加成员</h4>
        <div class="form-group">
          <label>选择智能助手</label>
          <select 
            class="form-control"
            @change=${(e: Event) => {
              const target = e.target as HTMLSelectElement;
              if (target.value) {
                props.onAddMember(project.projectId, target.value, "member");
              }
            }}
          >
            <option value="">请选择智能助手</option>
            ${agents.map(
              (agent) => html`
                <option value="${agent.id}">${agent.name || agent.id}</option>
              `,
            )}
          </select>
        </div>
      </div>

      <div style="margin-top: 24px;">
        <h4>项目管理员设置</h4>
        <div class="form-group">
          <label>项目负责人 (Owner)</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="mono" style="flex: 1; padding: 8px; background: var(--color-bg-secondary, #f5f5f5); border-radius: 4px;">
              ${project.ownerId || "未设置"}
            </span>
            <button
              class="btn btn--sm btn--primary"
              @click=${() => {
                const newOwner =
                  agents.length > 0
                    ? prompt(
                        `请输入新负责人 ID（当前：${project.ownerId || "未设置"}\n可选内容：${agents.map((a) => a.id).join(", ")})`,
                      )
                    : prompt(`请输入新负责人 ID（当前：${project.ownerId || "未设置"})`);
                if (newOwner && newOwner.trim() && newOwner.trim() !== project.ownerId) {
                  props.onTransferProjectOwner(project.projectId, newOwner.trim());
                }
              }}
            >
              🔄 更换负责人
            </button>
          </div>
          <small>项目负责人持有所有项目群的群主权限，更换将自动在所有项目群中生效</small>
        </div>
        
        <div class="form-group" style="margin-top: 16px;">
          <label>授予 Agent 管理员权限</label>
          <div style="margin-top: 8px;">
            ${agents
              .filter((a) => a.id !== project.ownerId)
              .map(
                (agent) => html`
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                  <input 
                    type="checkbox" 
                    id="admin-${agent.id}"
                    ?checked=${false}
                    @change=${(e: Event) => {
                      const target = e.target as HTMLInputElement;
                      if (target.checked) {
                        props.onUpdateMemberRole(project.projectId, agent.id, "admin");
                      } else {
                        props.onUpdateMemberRole(project.projectId, agent.id, "member");
                      }
                    }}
                  />
                  <label for="admin-${agent.id}" style="cursor: pointer;">
                    ${agent.name || agent.id} - 授予管理员权限
                  </label>
                </div>
              `,
              )}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== 进度管理 常量/帮助函数 =====

const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  backlog:     { label: "Backlog",   color: "#9ca3af", bg: "#f9fafb" },
  todo:        { label: "待处理",     color: "#6b7280", bg: "#f3f4f6" },
  in_progress: { label: "进行中",     color: "#2563eb", bg: "#eff6ff" },
  in_review:   { label: "审阅中",     color: "#7c3aed", bg: "#f5f3ff" },
  done:        { label: "已完成",     color: "#16a34a", bg: "#f0fdf4" },
  cancelled:   { label: "已取消",     color: "#dc2626", bg: "#fef2f2" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; icon: string; color: string }> = {
  urgent: { label: "紧急",  icon: "🔴", color: "#dc2626" },
  high:   { label: "高",    icon: "🟠", color: "#d97706" },
  medium: { label: "中",    icon: "🟡", color: "#ca8a04" },
  low:    { label: "低",    icon: "🔵", color: "#2563eb" },
  none:   { label: "无",    icon: "⚪", color: "#9ca3af" },
};

const PROJECT_STATUS_CONFIG: { value: ProjectStatus; label: string; color: string }[] = [
  { value: "planning",  label: "📍 计划中", color: "#6b7280" },
  { value: "active",    label: "🟢 进行中", color: "#16a34a" },
  { value: "paused",    label: "🟡 已暂停", color: "#d97706" },
  { value: "completed", label: "✅ 已完成", color: "#2563eb" },
  { value: "cancelled", label: "❌ 已取消", color: "#dc2626" },
];

/** 列看板列项：Todo / In Progress / In Review / Done */
const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo",        label: "待处理" },
  { status: "in_progress", label: "进行中" },
  { status: "in_review",   label: "审阅中" },
  { status: "done",        label: "已完成" },
];

function renderProjectProgress(props: ProjectsProps, project: ProjectInfo) {
  const sprints = project.sprints ?? project.milestones ?? [];
  const backlog = project.backlog ?? [];
  const status = project.status ?? "planning";
  const currentStatus = PROJECT_STATUS_CONFIG.find((s) => s.value === status) ?? PROJECT_STATUS_CONFIG[0];
  // 进度优先由 sprints 自动计算
  const computedProgress = sprints.length > 0 ? calcProjectProgress(sprints) : (project.progress ?? 0);
  const progressColor =
    computedProgress >= 100 ? "#2563eb" :
    computedProgress >= 60  ? "#16a34a" :
    computedProgress >= 30  ? "#d97706" : "#6b7280";
  const isOverdue = project.deadline && project.deadline < Date.now() && status !== "completed";

  // 辅助：更新 sprints
  function patchSprints(newSprints: ProjectSprint[]) {
    const recalc = calcProjectProgress(newSprints);
    props.onUpdateProgress(project.projectId, { sprints: newSprints, progress: recalc });
  }
  function patchBacklog(newBacklog: ProjectTask[]) {
    props.onUpdateProgress(project.projectId, { backlog: newBacklog });
  }

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
              props.onUpdateProgress(project.projectId, { status: (e.target as HTMLSelectElement).value as ProjectStatus });
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
            .value=${project.deadline ? new Date(project.deadline).toISOString().slice(0,10) : ""}
            @change=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onUpdateProgress(project.projectId, { deadline: v ? new Date(v).getTime() : undefined });
            }}
          />
          ${isOverdue ? html`<span class="chip" style="color:#dc2626;border-color:#dc2626;font-size:11px;">⚠️ 已超期</span>` : nothing}

          <!-- 进度数字 -->
          <span style="margin-left:auto; font-size:20px; font-weight:700; color:${progressColor};">${computedProgress}%</span>
          <button
            class="btn btn--primary btn--sm"
            @click=${() => props.onSaveProgress(project.projectId, {
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
            <span>${sprints.length} 个 Sprint·${sprints.flatMap(s=>s.tasks).length} 个任务</span>
            ${project.progressUpdatedAt
              ? html`<span>最后更新: ${new Date(project.progressUpdatedAt).toLocaleString("zh-CN")}</span>`
              : nothing}
          </div>
        </div>
      </div>

      <!-- Sprint 列表 -->
      <div style="margin-bottom: 14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <strong style="font-size:13px;">🏎️ Sprints / 阶段（${sprints.length}）</strong>
          <button class="btn btn--sm" @click=${() => {
            const next = sprints.length + 1;
            patchSprints([
              ...sprints,
              { id: `sprint-${Date.now()}`, title: `Sprint ${next}`, order: next, tasks: [] },
            ]);
          }}>+ 新建 Sprint</button>
        </div>

        ${sprints.length === 0
          ? html`<div class="callout">暂无 Sprint，点击新建以为项目挂载迭代阶段</div>`
          : sprints.map((sprint, si) => {
              const sp = calcSprintProgress(sprint);
              const spColor = sp >= 100 ? "#2563eb" : sp >= 60 ? "#16a34a" : sp >= 30 ? "#d97706" : "#6b7280";
              const doneCnt = sprint.tasks.filter(t => t.status === "done").length;
              return html`
                <div class="card" style="padding:12px; margin-bottom:10px;">
                  <!-- Sprint 头部 -->
                  <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="font-size:11px; color:var(--muted); flex-shrink:0;">S${sprint.order}</span>
                    <input
                      type="text"
                      class="form-control"
                      style="flex:1; font-size:13px; font-weight:600;"
                      .value=${sprint.title}
                      @input=${(e: InputEvent) => {
                        patchSprints(sprints.map((s, i) => i === si ? { ...s, title: (e.target as HTMLInputElement).value } : s));
                      }}
                    />
                    <input type="date" class="form-control" style="width:130px; font-size:11px;"
                      .value=${sprint.startDate ? new Date(sprint.startDate).toISOString().slice(0,10) : ""}
                      @change=${(e:Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        patchSprints(sprints.map((s,i) => i===si ? {...s, startDate: v ? new Date(v).getTime() : undefined} : s));
                      }}
                    />
                    <span style="font-size:11px;color:var(--muted)">→</span>
                    <input type="date" class="form-control" style="width:130px; font-size:11px;"
                      .value=${sprint.endDate ? new Date(sprint.endDate).toISOString().slice(0,10) : ""}
                      @change=${(e:Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        patchSprints(sprints.map((s,i) => i===si ? {...s, endDate: v ? new Date(v).getTime() : undefined} : s));
                      }}
                    />
                    <span style="font-size:12px;font-weight:700;color:${spColor};min-width:36px;text-align:right;">${sp}%</span>
                    <button class="btn btn--sm" style="color:#dc2626;padding:2px 6px;font-size:11px;"
                      @click=${() => { if(confirm(`删除 Sprint「${sprint.title}」及其所有任务？`)) patchSprints(sprints.filter((_,i)=>i!==si)); }}
                    >删除</button>
                  </div>

                  <!-- Sprint 目标 -->
                  <input type="text" class="form-control"
                    style="font-size:12px; margin-bottom:8px; color:var(--muted);"
                    .value=${sprint.goal ?? ""}
                    placeholder="Sprint 目标（可选）"
                    @input=${(e:InputEvent) => {
                      patchSprints(sprints.map((s,i) => i===si ? {...s, goal:(e.target as HTMLInputElement).value} : s));
                    }}
                  />

                  <!-- Sprint 进度条 -->
                  <div style="height:5px; background:var(--border); border-radius:3px; overflow:hidden; margin-bottom:8px;">
                    <div style="height:100%; width:${sp}%; background:${spColor}; border-radius:3px; transition:width 0.3s;"></div>
                  </div>
                  <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">
                    ${doneCnt}/${sprint.tasks.filter(t=>t.status!=="cancelled").length} 任务完成
                    ${sprint.tasks.reduce((s,t)=>s+(t.storyPoints??0),0) > 0
                      ? html`· ${sprint.tasks.filter(t=>t.status==="done").reduce((s,t)=>s+(t.storyPoints??0),0)}/${sprint.tasks.reduce((s,t)=>s+(t.storyPoints??0),0)} SP`
                      : nothing}
                  </div>

                  <!-- 看板 -->
                  <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">
                    ${KANBAN_COLUMNS.map(col => {
                      const colTasks = sprint.tasks.filter(t => t.status === col.status);
                      const cfg = TASK_STATUS_CONFIG[col.status];
                      return html`
                        <div style="background:${cfg.bg}; border:1px solid var(--border); border-radius:8px; padding:8px; min-height:80px;">
                          <div style="font-size:11px; font-weight:600; color:${cfg.color}; margin-bottom:6px;">
                            ${col.label} <span style="opacity:0.6;">(${colTasks.length})</span>
                          </div>
                          ${colTasks.map(task => html`
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
                                @change=${(e:Event) => {
                                  const newStatus = (e.target as HTMLSelectElement).value as TaskStatus;
                                  const updatedTask = { ...task, status: newStatus, updatedAt: Date.now(),
                                    completedAt: newStatus === "done" ? Date.now() : undefined };
                                  patchSprints(sprints.map((s,i) => i===si ? { ...s, tasks: s.tasks.map(t => t.id===task.id ? updatedTask : t) } : s));
                                }}
                              >
                                ${Object.entries(TASK_STATUS_CONFIG).map(([v,c]) => html`<option value=${v}>${c.label}</option>`)}
                              </select>
                            </div>
                          `)}
                          <!-- 添加任务到这列 -->
                          <button
                            style="width:100%;font-size:11px;color:${cfg.color};background:transparent;border:1px dashed ${cfg.color};border-radius:5px;padding:3px;cursor:pointer;margin-top:2px;"
                            @click=${() => {
                              const title = prompt(`添加任务到「${col.label}」`);
                              if (!title?.trim()) return;
                              const newTask: ProjectTask = {
                                id: `task-${Date.now()}`,
                                title: title.trim(),
                                status: col.status,
                                priority: "medium",
                                createdAt: Date.now(),
                              };
                              patchSprints(sprints.map((s,i) => i===si ? { ...s, tasks: [...s.tasks, newTask] } : s));
                            }}
                          >+ 添加</button>
                        </div>
                      `;
                    })}
                  </div>
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
            if (!title?.trim()) return;
            const t: ProjectTask = { id: `task-${Date.now()}`, title: title.trim(), status: "backlog", priority: "none", createdAt: Date.now() };
            patchBacklog([...backlog, t]);
          }}>+ 添加</button>
        </div>
        ${backlog.length === 0
          ? html`<div style="font-size:12px;color:var(--muted);">暫无 Backlog 任务，点击添加待规划任务</div>`
          : backlog.map((task, bi) => html`
            <div style="display:flex; align-items:center; gap:6px; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px;">
              <span style="color:${PRIORITY_CONFIG[task.priority].color};">${PRIORITY_CONFIG[task.priority].icon}</span>
              <span style="flex:1;">${task.title}</span>
              <select
                style="font-size:11px;border:1px solid var(--border);border-radius:3px;padding:1px 3px;"
                .value=${task.priority}
                @change=${(e:Event) => {
                  patchBacklog(backlog.map((t,i) => i===bi ? {...t, priority:(e.target as HTMLSelectElement).value as TaskPriority} : t));
                }}
              >
                ${Object.entries(PRIORITY_CONFIG).map(([v,c]) => html`<option value=${v}>${c.icon} ${c.label}</option>`)}
              </select>
              <select
                style="font-size:11px;border:1px solid var(--border);border-radius:3px;padding:1px 3px;"
                @change=${(e:Event) => {
                  const targetSprint = (e.target as HTMLSelectElement).value;
                  if (!targetSprint) return;
                  const moved = backlog[bi];
                  patchBacklog(backlog.filter((_,i)=>i!==bi));
                  patchSprints(sprints.map(s => s.id===targetSprint ? { ...s, tasks: [...s.tasks, {...moved, status:"todo" as TaskStatus}] } : s));
                }}
              >
                <option value="">分配到 Sprint...</option>
                ${sprints.map(s => html`<option value=${s.id}>${s.title}</option>`)}
              </select>
              <button style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;"
                @click=${() => patchBacklog(backlog.filter((_,i)=>i!==bi))}
              >删</button>
            </div>
          `)
        }
      </div>

      <!-- 验收标准 & 备注 -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <strong style="font-size:12px; display:block; margin-bottom:6px;">✅ 验收标准</strong>
          <textarea class="form-control" rows="4"
            placeholder="描述验收标准，Markdown 格式…"
            .value=${project.acceptanceCriteria ?? ""}
            @input=${(e:InputEvent) => {
              props.onUpdateProgress(project.projectId, { acceptanceCriteria: (e.target as HTMLTextAreaElement).value });
            }}
          ></textarea>
        </div>
        <div class="card" style="padding:12px;">
          <strong style="font-size:12px; display:block; margin-bottom:6px;">📝 进度备注</strong>
          <textarea class="form-control" rows="4"
            placeholder="记录餴点、风险、下一步计划…"
            .value=${project.progressNotes ?? ""}
            @input=${(e:InputEvent) => {
              props.onUpdateProgress(project.projectId, { progressNotes: (e.target as HTMLTextAreaElement).value });
            }}
          ></textarea>
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

function renderEmptyState(props: ProjectsProps) {
  return html`
    <section class="card">
      <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
        <h3>暂无项目</h3>
        <p>创建第一个项目来开始协作管理</p>
        <button 
          class="btn btn--primary" 
          style="margin-top: 16px;"
          @click=${props.onCreateProject}
        >
          创建第一个项目
        </button>
      </div>
    </section>
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
          ${isCreating && !props.projectCodeRoot
            ? html`
                <div class="callout" style="margin-bottom: 16px; border-left: 3px solid var(--warning, #d97706); background: var(--warning-bg, #fffbeb);">
                  <strong>⚠️ 未设置项目代码根目录</strong>
                  <div style="margin-top: 4px; font-size: 13px;">
                    请先关闭此对话框，在页面顶部设置「项目代码根目录」（如 <code>I:\\</code>）。
                    设置后 AI 和手动创建的项目都会自动将代码目录定位到 <code>根目录\\<项目名></code>。
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
            ${isCreating && previewCodeDir && !project.codeDir
              ? html`<small style="color: var(--success, #16a34a);">预期路径：${previewCodeDir}（可修改）</small>`
              : html`<small>可为代码仓库、设计文件夹或任意工作文件夹，也可留空</small>`
            }
          </div>
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
