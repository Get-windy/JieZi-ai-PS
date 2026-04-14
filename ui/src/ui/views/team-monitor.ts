/**
 * 团队监控视图 (Team Monitor)
 *
 * 功能：
 * 1. 实时展示各成员Agent当前任务状态
 * 2. 团队任务汇总统计（进行中/阻塞/完成）
 * 3. 任务列表展示，支持按Agent、项目、状态筛选
 * 4. 提供"下达任务"快捷入口
 */

import { html, nothing, type TemplateResult } from "lit";

// ============================================================================
// 类型定义
// ============================================================================

export type TeamMonitorProps = {
  loading: boolean;
  error: string | null;

  // 团队数据
  teamStatus: AgentTeamStatus[];
  summary: TeamSummary | null;

  // 筛选
  filterAgentId: string | null;
  filterProjectId: string | null;
  filterStatus: string | null;
  searchKeyword: string;

  // 任务分配对话框
  assignDialogOpen: boolean;
  assignForm: AssignTaskForm;
  assignSaving: boolean;
  assignError: string | null;

  // 汇报详情
  selectedReportTaskId: string | null;

  // 可用Agent列表（用于下达任务）
  availableAgents: AgentOption[];

  // 回调
  onRefresh: () => void;
  onFilterAgentChange: (agentId: string | null) => void;
  onFilterProjectChange: (projectId: string | null) => void;
  onFilterStatusChange: (status: string | null) => void;
  onSearchChange: (keyword: string) => void;
  onOpenAssignDialog: (targetAgentId?: string) => void;
  onCloseAssignDialog: () => void;
  onAssignFormChange: (field: string, value: unknown) => void;
  onSubmitAssign: () => void;
  onViewTaskDetail: (taskId: string) => void;
  onResetTask: (taskId: string, targetStatus: "todo" | "in-progress") => void;
  resetingTaskId: string | null;

  // 编辑弹窗
  editDialogTask: EditTaskForm | null;
  editSaving: boolean;
  editError: string | null;
  onOpenEditDialog: (task: ActiveTask) => void;
  onCloseEditDialog: () => void;
  onEditFormChange: (field: string, value: unknown) => void;
  onSubmitEdit: () => void;

  // 删除
  deletingTaskId: string | null;
  onDeleteTask: (taskId: string) => void;

  // 取消（快捷状态变更）
  cancelingTaskId: string | null;
  onCancelTask: (taskId: string) => void;
};

export type EditTaskForm = {
  taskId: string;
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in-progress" | "review" | "blocked" | "done" | "cancelled";
  dueDate: string; // datetime-local 格式，空字符串表示无
};

export type AgentTeamStatus = {
  agentId: string;
  agentName?: string;
  taskCounts: {
    total: number;
    todo: number;
    inProgress: number;
    review: number;
    blocked: number;
    done: number;
    cancelled: number;
  };
  lastActivity: number;
  activeTasks: ActiveTask[];
};

export type ActiveTask = {
  id: string;
  title: string;
  status: "todo" | "in-progress" | "review" | "blocked" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: number;
  createdAt: number;
  supervisorId?: string;
};

export type TeamSummary = {
  totalTasks: number;
  agentCount: number;
  tasksByStatus: {
    todo: number;
    inProgress: number;
    review: number;
    blocked: number;
    done: number;
    cancelled: number;
  };
  queriedAt: number;
};

export type AssignTaskForm = {
  targetAgentId: string;
  title: string;
  task: string;
  priority: "low" | "medium" | "high" | "urgent";
  deadline?: string;
  projectId?: string;
};

export type AgentOption = {
  id: string;
  name: string;
};

// ============================================================================
// 主渲染函数
// ============================================================================

export function renderTeamMonitor(props: TeamMonitorProps): TemplateResult {
  return html`
    <div class="team-monitor-container" style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow: hidden;">
      <!-- 顶部操作栏 -->
      ${renderToolbar(props)}

      <!-- 统计卡片行 -->
      ${props.summary ? renderSummaryCards(props.summary) : nothing}

      <!-- 主内容区：左侧Agent列表 + 右侧任务详情 -->
      <div style="display: flex; gap: 16px; flex: 1; overflow: hidden; min-height: 0;">
        ${renderAgentList(props)}
        ${renderTaskPanel(props)}
      </div>

      <!-- 下达任务对话框 -->
      ${props.assignDialogOpen ? renderAssignDialog(props) : nothing}

      <!-- 编辑任务对话框 -->
      ${props.editDialogTask ? renderEditDialog(props) : nothing}
    </div>
  `;
}

// ============================================================================
// 顶部工具栏
// ============================================================================

function renderToolbar(props: TeamMonitorProps): TemplateResult {
  return html`
    <div class="card" style="padding: 12px 16px;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <!-- 标题 -->
        <div style="font-weight: 600; font-size: 1rem; margin-right: 8px;">
          团队监控
        </div>

        <!-- 关键词搜索 -->
        <input
          type="text"
          class="input"
          placeholder="搜索任务..."
          style="width: 180px; height: 32px; padding: 4px 10px; font-size: 0.875rem;"
          .value=${props.searchKeyword}
          @input=${(e: Event) => props.onSearchChange((e.target as HTMLInputElement).value)}
        />

        <!-- 状态筛选 -->
        <select
          class="input"
          style="height: 32px; padding: 0 8px; font-size: 0.875rem;"
          @change=${(e: Event) => props.onFilterStatusChange((e.target as HTMLSelectElement).value || null)}
        >
          <option value="">全部状态</option>
          <option value="in-progress">进行中</option>
          <option value="blocked">已阻塞</option>
          <option value="review">待审核</option>
          <option value="todo">待开始</option>
          <option value="done">已完成</option>
        </select>

        <!-- spacer -->
        <div style="flex: 1;"></div>

        <!-- 刷新按钮 -->
        <button
          class="btn btn--sm"
          style="display: flex; align-items: center; gap: 6px;"
          ?disabled=${props.loading}
          @click=${props.onRefresh}
        >
          ${
            props.loading
              ? html`
                  <span
                    style="
                      display: inline-block;
                      width: 14px;
                      height: 14px;
                      border: 2px solid currentColor;
                      border-top-color: transparent;
                      border-radius: 50%;
                      animation: spin 0.8s linear infinite;
                    "
                  ></span>
                `
              : "↻"
          }
          刷新
        </button>

        <!-- 下达任务按钮 -->
        <button
          class="btn btn--primary btn--sm"
          style="display: flex; align-items: center; gap: 6px;"
          @click=${() => props.onOpenAssignDialog()}
        >
          + 下达任务
        </button>
      </div>

      ${props.error ? html`<div class="muted" style="color: var(--color-danger); margin-top: 8px; font-size: 0.875rem;">错误：${props.error}</div>` : nothing}
    </div>
  `;
}

// ============================================================================
// 统计卡片
// ============================================================================

function renderSummaryCards(summary: TeamSummary): TemplateResult {
  const cards = [
    { label: "总任务", value: summary.totalTasks, color: "var(--color-text)" },
    {
      label: "进行中",
      value: summary.tasksByStatus.inProgress,
      color: "var(--color-primary, #2563eb)",
    },
    { label: "已阻塞", value: summary.tasksByStatus.blocked, color: "#ef4444" },
    { label: "待审核", value: summary.tasksByStatus.review, color: "#f59e0b" },
    { label: "已完成", value: summary.tasksByStatus.done, color: "#10b981" },
    { label: "活跃成员", value: summary.agentCount, color: "var(--color-text)" },
  ];

  return html`
    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
      ${cards.map(
        (card) => html`
          <div class="card" style="padding: 12px 20px; min-width: 110px; text-align: center;">
            <div style="font-size: 1.6rem; font-weight: 700; color: ${card.color}; line-height: 1.2;">${card.value}</div>
            <div class="muted" style="font-size: 0.8rem; margin-top: 4px;">${card.label}</div>
          </div>
        `,
      )}
    </div>
  `;
}

// ============================================================================
// 左侧：Agent列表
// ============================================================================

function renderAgentList(props: TeamMonitorProps): TemplateResult {
  const filtered = props.teamStatus.filter((a) => {
    if (props.filterAgentId && a.agentId !== props.filterAgentId) {
      return false;
    }
    return true;
  });

  if (props.loading && filtered.length === 0) {
    return html`
      <div
        class="card"
        style="
          width: 280px;
          min-width: 240px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
        "
      >
        <div class="muted">加载中...</div>
      </div>
    `;
  }

  if (!props.loading && filtered.length === 0) {
    return html`
      <div class="card" style="width: 280px; min-width: 240px; padding: 24px; text-align: center">
        <div class="muted" style="font-size: 0.875rem">暂无团队成员数据</div>
        <div class="muted" style="font-size: 0.8rem; margin-top: 8px">
          当 Agent 执行由 agent.assign_task 下达的任务后，将在此显示
        </div>
      </div>
    `;
  }

  return html`
    <div class="card" style="width: 280px; min-width: 240px; display: flex; flex-direction: column; overflow: hidden;">
      <div style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); font-weight: 600; font-size: 0.875rem; display: flex; align-items: center; justify-content: space-between;">
        <span>成员 (${filtered.length})</span>
        ${
          props.filterAgentId
            ? html`<button class="btn btn--sm" style="padding: 2px 8px; font-size: 0.75rem;" @click=${() => props.onFilterAgentChange(null)}>清除筛选</button>`
            : nothing
        }
      </div>
      <div style="overflow-y: auto; flex: 1;">
        ${filtered.map((agent) => renderAgentCard(agent, props))}
      </div>
    </div>
  `;
}

function renderAgentCard(agent: AgentTeamStatus, props: TeamMonitorProps): TemplateResult {
  const isSelected = props.filterAgentId === agent.agentId;
  const blockedCount = agent.taskCounts.blocked;
  const inProgressCount = agent.taskCounts.inProgress;
  const displayName = agent.agentName || agent.agentId;

  // 上次活动时间
  const lastActivityText =
    agent.lastActivity > 0 ? formatRelativeTime(agent.lastActivity) : "无活动";

  return html`
    <div
      style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--color-border);
             background: ${isSelected ? "var(--color-surface-hover, rgba(0,0,0,0.05))" : "transparent"};
             transition: background 0.15s;"
      @click=${() => props.onFilterAgentChange(isSelected ? null : agent.agentId)}
    >
      <!-- Agent名称行 -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <div style="font-weight: 500; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;" title=${agent.agentId}>
          ${displayName}
        </div>
        <!-- 阻塞指示器 -->
        ${
          blockedCount > 0
            ? html`<span style="background: #ef4444; color: #fff; border-radius: 10px; padding: 1px 7px; font-size: 0.7rem; font-weight: 600;">${blockedCount} 阻塞</span>`
            : nothing
        }
      </div>

      <!-- 任务数量小图 -->
      <div style="display: flex; gap: 6px; font-size: 0.75rem; flex-wrap: wrap;">
        ${
          inProgressCount > 0
            ? html`<span style="color: var(--color-primary, #2563eb);">${inProgressCount} 进行中</span>`
            : nothing
        }
        ${
          agent.taskCounts.review > 0
            ? html`<span style="color: #f59e0b;">${agent.taskCounts.review} 待审</span>`
            : nothing
        }
        ${
          agent.taskCounts.todo > 0
            ? html`<span class="muted">${agent.taskCounts.todo} 待开始</span>`
            : nothing
        }
      </div>

      <!-- 上次活动 -->
      <div class="muted" style="font-size: 0.73rem; margin-top: 4px;">
        最近活动：${lastActivityText}
      </div>

      <!-- 下达任务快捷按钮 -->
      <button
        class="btn btn--sm"
        style="margin-top: 8px; width: 100%; font-size: 0.75rem; padding: 3px 0;"
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onOpenAssignDialog(agent.agentId);
        }}
      >
        + 下达任务
      </button>
    </div>
  `;
}

// ============================================================================
// 右侧：任务详情面板
// ============================================================================

function renderTaskPanel(props: TeamMonitorProps): TemplateResult {
  // 根据筛选条件汇总任务
  let allTasks: (ActiveTask & { agentId: string })[] = [];
  const agents = props.filterAgentId
    ? props.teamStatus.filter((a) => a.agentId === props.filterAgentId)
    : props.teamStatus;

  for (const agent of agents) {
    for (const t of agent.activeTasks) {
      // 状态筛选
      if (props.filterStatus && t.status !== props.filterStatus) {
        continue;
      }
      // 关键词筛选
      if (
        props.searchKeyword &&
        !t.title.toLowerCase().includes(props.searchKeyword.toLowerCase())
      ) {
        continue;
      }
      allTasks.push({ ...t, agentId: agent.agentId });
    }
  }

  // 排序：blocked > in-progress > review > todo > done
  const ORDER: Record<string, number> = {
    blocked: 0,
    "in-progress": 1,
    review: 2,
    todo: 3,
    done: 4,
    cancelled: 5,
  };
  allTasks.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  return html`
    <div class="card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
      <div style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); font-weight: 600; font-size: 0.875rem;">
        活跃任务 (${allTasks.length})
        ${props.filterAgentId ? html` — ${props.teamStatus.find((a) => a.agentId === props.filterAgentId)?.agentName ?? props.filterAgentId}` : nothing}
      </div>

      <div style="overflow-y: auto; flex: 1; padding: 8px;">
        ${
          allTasks.length === 0
            ? html`
            <div style="text-align: center; padding: 40px 16px;">
              <div class="muted" style="font-size: 0.875rem;">
                ${props.filterAgentId ? "该成员暂无活跃任务" : "暂无活跃任务"}
              </div>
              ${
                !props.filterStatus && !props.filterAgentId
                  ? html`
                      <div class="muted" style="font-size: 0.8rem; margin-top: 8px">
                        使用"下达任务"按钮分配任务给 Agent
                      </div>
                    `
                  : nothing
              }
            </div>
          `
            : allTasks.map((task) => renderTaskRow(task, props))
        }
      </div>
    </div>
  `;
}

function renderTaskRow(
  task: ActiveTask & { agentId: string },
  props: TeamMonitorProps,
): TemplateResult {
  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    "in-progress": { label: "进行中", color: "#2563eb", bg: "#eff6ff" },
    blocked: { label: "已阻塞", color: "#dc2626", bg: "#fef2f2" },
    review: { label: "待审核", color: "#d97706", bg: "#fffbeb" },
    todo: { label: "待开始", color: "#6b7280", bg: "#f9fafb" },
    done: { label: "已完成", color: "#059669", bg: "#ecfdf5" },
    cancelled: { label: "已取消", color: "#9ca3af", bg: "#f9fafb" },
  };
  const priorityConfig: Record<string, { label: string; color: string }> = {
    urgent: { label: "紧急", color: "#dc2626" },
    high: { label: "高", color: "#ea580c" },
    medium: { label: "中", color: "#d97706" },
    low: { label: "低", color: "#6b7280" },
  };

  const sc = statusConfig[task.status] ?? { label: task.status, color: "#6b7280", bg: "#f9fafb" };
  const pc = priorityConfig[task.priority] ?? { label: task.priority, color: "#6b7280" };
  const agentDisplay =
    props.teamStatus.find((a) => a.agentId === task.agentId)?.agentName ?? task.agentId;

  const isOverdue =
    task.dueDate &&
    task.dueDate < Date.now() &&
    task.status !== "done" &&
    task.status !== "cancelled";

  const isReseting = props.resetingTaskId === task.id;
  const isDeleting = props.deletingTaskId === task.id;
  const isCanceling = props.cancelingTaskId === task.id;
  // 可重置的状态：in-progress / blocked / review / done（不包括 todo 和 cancelled）
  const canReset = task.status !== "todo" && task.status !== "cancelled";
  // 可取消的状态：未完成的任务
  const canCancel = task.status !== "cancelled" && task.status !== "done";

  return html`
    <div
      class="card"
      style="margin-bottom: 8px; padding: 12px 14px; cursor: pointer; border-left: 3px solid ${sc.color}; transition: box-shadow 0.15s;"
      @click=${() => props.onViewTaskDetail(task.id)}
    >
      <div style="display: flex; align-items: flex-start; gap: 8px;">
        <!-- 状态标签 -->
        <span style="background: ${sc.bg}; color: ${sc.color}; border-radius: 4px; padding: 2px 7px; font-size: 0.73rem; font-weight: 600; white-space: nowrap; flex-shrink: 0;">
          ${sc.label}
        </span>

        <!-- 任务标题 -->
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
               title=${task.title}>
            ${task.title}
          </div>
          <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 0.75rem; flex-wrap: wrap; align-items: center;">
            <span class="muted">执行：${agentDisplay}</span>
            <span style="color: ${pc.color};">优先级：${pc.label}</span>
            ${
              task.dueDate
                ? html`<span style="color: ${isOverdue ? "#dc2626" : "var(--color-muted)"};">截止：${formatDate(task.dueDate)} ${isOverdue ? "⚠️ 已逾期" : ""}</span>`
                : nothing
            }
            ${
              task.supervisorId
                ? html`<span class="muted">主管：${task.supervisorId}</span>`
                : nothing
            }
          </div>
        </div>

        <!-- 操作区 -->
        <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;" @click=${(e: Event) => e.stopPropagation()}>
          <!-- 任务ID (小字) -->
          <div class="muted" style="font-size: 0.7rem; text-align: right; margin-right: 4px;">
            ${task.id.length > 12 ? task.id.slice(0, 12) + "…" : task.id}
          </div>

          <!-- 编辑按钮 -->
          <button
            class="btn btn--sm"
            style="padding: 2px 7px; font-size: 0.73rem;"
            title="编辑任务"
            @click=${() => props.onOpenEditDialog(task)}
          >✏️</button>

          <!-- 重置按钮（仅非 todo/cancelled 状态） -->
          ${
            canReset
              ? html`
                  <button
                    class="btn btn--sm"
                    style="padding: 2px 7px; font-size: 0.73rem; color: #d97706; border-color: #d97706; opacity: ${isReseting ? 0.6 : 1};"
                    ?disabled=${isReseting}
                    title="重置为待开始"
                    @click=${() => { if (!isReseting) props.onResetTask(task.id, "todo"); }}
                  >${isReseting ? "…" : "↺"}</button>
                `
              : nothing
          }

          <!-- 取消按钮（仅未完成任务） -->
          ${
            canCancel
              ? html`
                  <button
                    class="btn btn--sm"
                    style="padding: 2px 7px; font-size: 0.73rem; color: #6b7280; border-color: #6b7280; opacity: ${isCanceling ? 0.6 : 1};"
                    ?disabled=${isCanceling}
                    title="取消任务"
                    @click=${() => { if (!isCanceling && confirm(`确定要取消任务「${task.title}」？`)) props.onCancelTask(task.id); }}
                  >${isCanceling ? "…" : "✖"}</button>
                `
              : nothing
          }

          <!-- 删除按钮 -->
          <button
            class="btn btn--sm"
            style="padding: 2px 7px; font-size: 0.73rem; color: #dc2626; border-color: #dc2626; opacity: ${isDeleting ? 0.6 : 1};"
            ?disabled=${isDeleting}
            title="删除任务"
            @click=${() => { if (!isDeleting && confirm(`确定要永久删除任务「${task.title}」？此操作不可恢复。`)) props.onDeleteTask(task.id); }}
          >${isDeleting ? "…" : "🗑️"}</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 下达任务对话框
// ============================================================================

function renderAssignDialog(props: TeamMonitorProps): TemplateResult {
  return html`
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center;"
         @click=${(e: Event) => {
           if (e.target === e.currentTarget) {
             props.onCloseAssignDialog();
           }
         }}>
      <div class="card" style="width: 520px; max-width: 95vw; padding: 24px; display: flex; flex-direction: column; gap: 16px; max-height: 90vh; overflow-y: auto;">
        <!-- 标题 -->
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: 600; font-size: 1rem;">下达任务</div>
          <button class="btn btn--sm" style="padding: 4px 8px;" @click=${props.onCloseAssignDialog}>✕</button>
        </div>

        <!-- 目标Agent -->
        <div>
          <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">目标成员 <span style="color: #dc2626;">*</span></label>
          <select
            class="input"
            style="width: 100%; height: 36px;"
            .value=${props.assignForm.targetAgentId}
            @change=${(e: Event) => props.onAssignFormChange("targetAgentId", (e.target as HTMLSelectElement).value)}
          >
            <option value="">请选择 Agent</option>
            ${props.availableAgents.map(
              (a) =>
                html`<option value=${a.id} ?selected=${props.assignForm.targetAgentId === a.id}>${a.name}</option>`,
            )}
          </select>
        </div>

        <!-- 任务标题 -->
        <div>
          <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">任务标题</label>
          <input
            type="text"
            class="input"
            style="width: 100%; height: 36px;"
            placeholder="简短标题（可选，不填将自动从描述生成）"
            .value=${props.assignForm.title}
            @input=${(e: Event) => props.onAssignFormChange("title", (e.target as HTMLInputElement).value)}
          />
        </div>

        <!-- 任务描述 -->
        <div>
          <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">任务描述 <span style="color: #dc2626;">*</span></label>
          <textarea
            class="input"
            style="width: 100%; height: 100px; resize: vertical; padding: 8px;"
            placeholder="详细描述任务要求、预期输出..."
            .value=${props.assignForm.task}
            @input=${(e: Event) => props.onAssignFormChange("task", (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </div>

        <!-- 优先级 + 截止时间 -->
        <div style="display: flex; gap: 12px;">
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">优先级</label>
            <select
              class="input"
              style="width: 100%; height: 36px;"
              .value=${props.assignForm.priority}
              @change=${(e: Event) => props.onAssignFormChange("priority", (e.target as HTMLSelectElement).value)}
            >
              <option value="low">低</option>
              <option value="medium" selected>中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">截止时间（可选）</label>
            <input
              type="datetime-local"
              class="input"
              style="width: 100%; height: 36px;"
              .value=${props.assignForm.deadline ?? ""}
              @change=${(e: Event) => props.onAssignFormChange("deadline", (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        <!-- 项目ID（可选） -->
        <div>
          <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">项目ID（可选）</label>
          <input
            type="text"
            class="input"
            style="width: 100%; height: 36px;"
            placeholder="关联到某个项目（如：my-project）"
            .value=${props.assignForm.projectId ?? ""}
            @input=${(e: Event) => props.onAssignFormChange("projectId", (e.target as HTMLInputElement).value)}
          />
        </div>

        <!-- 错误提示 -->
        ${
          props.assignError
            ? html`<div style="color: #dc2626; font-size: 0.875rem; padding: 8px 12px; background: #fef2f2; border-radius: 6px;">${props.assignError}</div>`
            : nothing
        }

        <!-- 按钮 -->
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button class="btn" @click=${props.onCloseAssignDialog} ?disabled=${props.assignSaving}>取消</button>
          <button
            class="btn btn--primary"
            ?disabled=${props.assignSaving || !props.assignForm.targetAgentId || !props.assignForm.task.trim()}
            @click=${props.onSubmitAssign}
          >
            ${
              props.assignSaving
                ? html`
                    <span
                      style="
                        display: inline-block;
                        width: 14px;
                        height: 14px;
                        border: 2px solid #fff;
                        border-top-color: transparent;
                        border-radius: 50%;
                        animation: spin 0.8s linear infinite;
                        vertical-align: middle;
                        margin-right: 6px;
                      "
                    ></span
                    >下达中...
                  `
                : "下达任务"
            }
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 编辑任务对话框
// ============================================================================

function renderEditDialog(props: TeamMonitorProps): TemplateResult {
  const form = props.editDialogTask!;
  return html`
    <div
      style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center;"
      @click=${(e: Event) => { if (e.target === e.currentTarget) props.onCloseEditDialog(); }}
    >
      <div class="card" style="width: 480px; max-width: 95vw; padding: 24px; display: flex; flex-direction: column; gap: 16px; max-height: 90vh; overflow-y: auto;">
        <!-- 标题 -->
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: 600; font-size: 1rem;">编辑任务</div>
          <button class="btn btn--sm" style="padding: 4px 8px;" @click=${props.onCloseEditDialog}>✕</button>
        </div>

        <!-- 任务ID (只读提示) -->
        <div style="font-size: 0.78rem; color: var(--color-muted); word-break: break-all;">ID: ${form.taskId}</div>

        <!-- 标题 -->
        <div>
          <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">标题 <span style="color: #dc2626;">*</span></label>
          <input
            type="text"
            class="input"
            style="width: 100%; height: 36px;"
            .value=${form.title}
            @input=${(e: Event) => props.onEditFormChange("title", (e.target as HTMLInputElement).value)}
          />
        </div>

        <!-- 状态 + 优先级 -->
        <div style="display: flex; gap: 12px;">
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">状态</label>
            <select
              class="input"
              style="width: 100%; height: 36px;"
              .value=${form.status}
              @change=${(e: Event) => props.onEditFormChange("status", (e.target as HTMLSelectElement).value)}
            >
              <option value="todo">待开始</option>
              <option value="in-progress">进行中</option>
              <option value="review">待审核</option>
              <option value="blocked">已阻塞</option>
              <option value="done">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">优先级</label>
            <select
              class="input"
              style="width: 100%; height: 36px;"
              .value=${form.priority}
              @change=${(e: Event) => props.onEditFormChange("priority", (e.target as HTMLSelectElement).value)}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
        </div>

        <!-- 截止时间 -->
        <div>
          <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px;">截止时间（可选）</label>
          <input
            type="datetime-local"
            class="input"
            style="width: 100%; height: 36px;"
            .value=${form.dueDate}
            @change=${(e: Event) => props.onEditFormChange("dueDate", (e.target as HTMLInputElement).value)}
          />
        </div>

        <!-- 错误提示 -->
        ${props.editError
          ? html`<div style="color: #dc2626; font-size: 0.875rem; padding: 8px 12px; background: #fef2f2; border-radius: 6px;">${props.editError}</div>`
          : nothing}

        <!-- 按鈕 -->
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button class="btn" @click=${props.onCloseEditDialog} ?disabled=${props.editSaving}>取消</button>
          <button
            class="btn btn--primary"
            ?disabled=${props.editSaving || !form.title.trim()}
            @click=${props.onSubmitEdit}
          >${props.editSaving ? "保存中…" : "保存"}</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 工具函数
// ============================================================================

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) {
    return "刚刚";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} 分钟前`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} 小时前`;
  }
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
