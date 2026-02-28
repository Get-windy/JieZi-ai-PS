/**
 * P2.3: 任务看板完整UI组件
 * 
 * 功能模块：
 * 1. 任务看板视图 - 支持拖拽、列管理
 * 2. 任务卡片 - 优先级、执行者、标签展示
 * 3. 任务详情面板 - 完整信息、评论、附件、工作日志
 * 4. 任务筛选器 - 多维度筛选和搜索
 * 5. 任务创建向导 - 快速创建和分配任务
 */

import { html, nothing, type TemplateResult } from "lit";

// ============================================================================
// 类型定义
// ============================================================================

export type TaskKanbanProps = {
  loading: boolean;
  error: string | null;
  
  // 看板配置
  kanbanId: string | null;
  kanbanName: string;
  columns: KanbanColumn[];
  
  // 任务数据
  tasks: TaskCard[];
  selectedTaskId: string | null;
  
  // 筛选器
  filterVisible: boolean;
  filters: TaskFilters;
  
  // 任务详情面板
  detailPanelOpen: boolean;
  selectedTask: TaskDetail | null;
  taskComments: TaskComment[];
  taskAttachments: TaskAttachment[];
  taskWorkLogs: TaskWorkLog[];
  
  // 任务创建
  createDialogOpen: boolean;
  createForm: TaskCreateForm;
  createSaving: boolean;
  createError: string | null;
  
  // 拖拽状态
  draggingTaskId: string | null;
  dragOverColumnId: string | null;
  
  // 组织上下文
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  
  // 回调函数
  onRefresh: () => void;
  onToggleFilter: () => void;
  onFilterChange: (field: string, value: any) => void;
  onClearFilters: () => void;
  
  // 任务操作
  onTaskClick: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onTaskDragStart: (taskId: string) => void;
  onTaskDragEnd: () => void;
  onTaskDrop: (taskId: string, columnId: string) => void;
  
  // 任务创建
  onOpenCreateDialog: () => void;
  onCloseCreateDialog: () => void;
  onCreateFormChange: (field: string, value: any) => void;
  onCreateTask: () => void;
  
  // 任务详情
  onCloseDetailPanel: () => void;
  onUpdateTask: (taskId: string, updates: Partial<TaskDetail>) => void;
  onAddComment: (taskId: string, content: string) => void;
  onAddAttachment: (taskId: string, file: File) => void;
  onDeleteTask: (taskId: string) => void;
  
  // 列管理
  onAddColumn: () => void;
  onEditColumn: (columnId: string) => void;
  onDeleteColumn: (columnId: string) => void;
};

export type TaskStatus = "todo" | "in-progress" | "review" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type KanbanColumn = {
  id: string;
  title: string;
  status: TaskStatus;
  color: string;
  order: number;
  limit?: number; // WIP限制
  taskIds: string[];
};

export type TaskCard = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assignees: TaskAssignee[];
  dueDate?: number;
  progress?: number; // 0-100
  subtaskCount?: number;
  subtaskDoneCount?: number;
  commentCount?: number;
  attachmentCount?: number;
  createdAt: number;
};

export type TaskAssignee = {
  id: string;
  name: string;
  type: "human" | "agent";
  avatar?: string;
};

export type TaskDetail = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  type?: string;
  tags: string[];
  assignees: TaskAssignee[];
  creator: TaskAssignee;
  dueDate?: number;
  estimatedHours?: number;
  actualHours?: number;
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  parentTaskId?: string;
  dependencies?: string[];
  subtasks?: string[];
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
};

export type TaskComment = {
  id: string;
  authorId: string;
  authorName: string;
  authorType: "human" | "agent";
  authorAvatar?: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
};

export type TaskAttachment = {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: number;
};

export type TaskWorkLog = {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  details: string;
  duration?: number;
  result?: "success" | "failure" | "partial";
  createdAt: number;
};

export type TaskFilters = {
  keyword?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assigneeId?: string;
  creatorId?: string;
  tags?: string[];
  dueDateBefore?: number;
  dueDateAfter?: number;
};

export type TaskCreateForm = {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeIds: string[];
  dueDate?: number;
  tags: string[];
  parentTaskId?: string;
};

// ============================================================================
// 主渲染函数
// ============================================================================

export function renderTaskKanban(props: TaskKanbanProps) {
  return html`
    <div class="task-kanban-container" style="display: flex; flex-direction: column; gap: 16px; height: 100%;">
      <!-- 顶部工具栏 -->
      ${renderToolbar(props)}
      
      <!-- 筛选器（可折叠） -->
      ${props.filterVisible ? renderFilterPanel(props) : nothing}
      
      <!-- 看板主区域 -->
      <div style="flex: 1; overflow: hidden;">
        ${renderKanbanBoard(props)}
      </div>
      
      <!-- 任务详情面板（侧边滑出） -->
      ${props.detailPanelOpen ? renderTaskDetailPanel(props) : nothing}
      
      <!-- 任务创建对话框 -->
      ${props.createDialogOpen ? renderCreateTaskDialog(props) : nothing}
    </div>
  `;
}

// ============================================================================
// 顶部工具栏
// ============================================================================

function renderToolbar(props: TaskKanbanProps) {
  return html`
    <div class="card" style="padding: 12px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <!-- 左侧：看板标题 -->
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.1rem; font-weight: 600;">📋 ${props.kanbanName}</span>
          <button
            class="btn btn--sm"
            style="padding: 4px 8px;"
            title="刷新"
            @click=${props.onRefresh}
          >
            🔄
          </button>
        </div>
        
        <!-- 右侧：操作按钮 -->
        <div class="row" style="gap: 8px; justify-content: flex-end;">
          <button
            class="btn btn--sm ${props.filterVisible ? 'btn--primary' : ''}"
            style="padding: 6px 12px;"
            @click=${props.onToggleFilter}
          >
            🔍 筛选
          </button>
          <button
            class="btn btn--sm btn--primary"
            style="padding: 6px 12px;"
            @click=${props.onOpenCreateDialog}
          >
            ➕ 创建任务
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 筛选器面板
// ============================================================================

function renderFilterPanel(props: TaskKanbanProps) {
  return html`
    <div class="card" style="padding: 16px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <!-- 关键词搜索 -->
        <div>
          <label style="display: block; margin-bottom: 4px; font-size: 0.85rem; color: var(--text-muted);">
            关键词搜索
          </label>
          <input
            type="text"
            class="input"
            placeholder="搜索任务标题或描述..."
            .value=${props.filters.keyword || ""}
            @input=${(e: Event) => props.onFilterChange("keyword", (e.target as HTMLInputElement).value)}
          />
        </div>
        
        <!-- 优先级筛选 -->
        <div>
          <label style="display: block; margin-bottom: 4px; font-size: 0.85rem; color: var(--text-muted);">
            优先级
          </label>
          <select
            class="input"
            @change=${(e: Event) => props.onFilterChange("priority", (e.target as HTMLSelectElement).value)}
          >
            <option value="">全部</option>
            <option value="urgent">🔴 紧急</option>
            <option value="high">🟠 高</option>
            <option value="medium">🟡 中</option>
            <option value="low">🟢 低</option>
          </select>
        </div>
        
        <!-- 截止日期 -->
        <div>
          <label style="display: block; margin-bottom: 4px; font-size: 0.85rem; color: var(--text-muted);">
            截止日期
          </label>
          <select
            class="input"
            @change=${(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              if (value === "overdue") {
                props.onFilterChange("dueDateBefore", Date.now());
              } else if (value === "today") {
                props.onFilterChange("dueDateBefore", Date.now() + 86400000);
              } else if (value === "week") {
                props.onFilterChange("dueDateBefore", Date.now() + 7 * 86400000);
              } else {
                props.onFilterChange("dueDateBefore", null);
              }
            }}
          >
            <option value="">全部</option>
            <option value="overdue">已逾期</option>
            <option value="today">今天到期</option>
            <option value="week">本周到期</option>
          </select>
        </div>
        
        <!-- 清除按钮 -->
        <div style="display: flex; align-items: flex-end;">
          <button
            class="btn btn--sm"
            style="width: 100%;"
            @click=${props.onClearFilters}
          >
            清除筛选
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 看板主区域
// ============================================================================

function renderKanbanBoard(props: TaskKanbanProps) {
  if (props.loading) {
    return html`
      <div class="card" style="padding: 48px; text-align: center;">
        <div class="spinner"></div>
        <div style="margin-top: 12px; color: var(--text-muted);">加载任务中...</div>
      </div>
    `;
  }

  if (props.error) {
    return html`
      <div class="card" style="padding: 48px; text-align: center;">
        <div style="color: var(--error); margin-bottom: 12px;">❌ ${props.error}</div>
        <button class="btn btn--sm" @click=${props.onRefresh}>重试</button>
      </div>
    `;
  }

  return html`
    <div class="kanban-board" style="display: flex; gap: 16px; height: 100%; overflow-x: auto; padding-bottom: 16px;">
      ${props.columns.map((column) => renderKanbanColumn(column, props))}
    </div>
  `;
}

function renderKanbanColumn(column: KanbanColumn, props: TaskKanbanProps) {
  const columnTasks = props.tasks.filter((task) => task.status === column.status);
  const isOverLimit = column.limit && columnTasks.length > column.limit;
  
  return html`
    <div
      class="kanban-column"
      style="
        min-width: 320px;
        width: 320px;
        display: flex;
        flex-direction: column;
        border-radius: 8px;
        background: var(--bg-secondary);
        ${props.dragOverColumnId === column.id ? 'box-shadow: 0 0 0 2px var(--primary);' : ''}
      "
      @dragover=${(e: DragEvent) => {
        e.preventDefault();
        props.dragOverColumnId = column.id;
      }}
      @dragleave=${() => {
        props.dragOverColumnId = null;
      }}
      @drop=${(e: DragEvent) => {
        e.preventDefault();
        if (props.draggingTaskId) {
          props.onTaskDrop(props.draggingTaskId, column.id);
        }
        props.dragOverColumnId = null;
      }}
    >
      <!-- 列头部 -->
      <div style="padding: 12px; border-bottom: 2px solid ${column.color};">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600;">${column.title}</span>
            <span
              class="badge"
              style="background: ${column.color}20; color: ${column.color};"
            >
              ${columnTasks.length}${column.limit ? ` / ${column.limit}` : ''}
            </span>
            ${isOverLimit ? html`<span title="超出WIP限制">⚠️</span>` : nothing}
          </div>
          <button
            class="btn btn--sm"
            style="padding: 2px 6px;"
            title="列设置"
            @click=${() => props.onEditColumn(column.id)}
          >
            ⚙️
          </button>
        </div>
      </div>
      
      <!-- 任务列表 -->
      <div style="flex: 1; overflow-y: auto; padding: 8px;">
        ${columnTasks.length === 0
          ? html`
              <div style="padding: 24px; text-align: center; color: var(--text-muted);">
                暂无任务
              </div>
            `
          : columnTasks.map((task) => renderTaskCard(task, props))}
      </div>
    </div>
  `;
}

// ============================================================================
// 任务卡片
// ============================================================================

function renderTaskCard(task: TaskCard, props: TaskKanbanProps): TemplateResult {
  const isSelected = props.selectedTaskId === task.id;
  const isDragging = props.draggingTaskId === task.id;
  const isOverdue = task.dueDate && task.dueDate < Date.now() && task.status !== "done";
  
  return html`
    <div
      class="task-card ${isSelected ? 'selected' : ''}"
      style="
        margin-bottom: 8px;
        padding: 12px;
        border-radius: 6px;
        background: var(--bg);
        border: 1px solid var(--border);
        cursor: pointer;
        transition: all 0.2s;
        ${isDragging ? 'opacity: 0.5;' : ''}
        ${isOverdue ? 'border-left: 3px solid var(--error);' : ''}
      "
      draggable="true"
      @dragstart=${() => props.onTaskDragStart(task.id)}
      @dragend=${props.onTaskDragEnd}
      @click=${() => props.onTaskClick(task.id)}
    >
      <!-- 优先级标识 -->
      <div class="row" style="justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <div>${getPriorityBadge(task.priority)}</div>
        ${task.tags.length > 0
          ? html`
              <div class="row" style="gap: 4px; flex-wrap: wrap;">
                ${task.tags.slice(0, 2).map((tag) => html`
                  <span class="badge" style="font-size: 0.7rem; padding: 2px 6px;">
                    ${tag}
                  </span>
                `)}
                ${task.tags.length > 2 ? html`<span class="badge">+${task.tags.length - 2}</span>` : nothing}
              </div>
            `
          : nothing}
      </div>
      
      <!-- 任务标题 -->
      <div style="font-weight: 500; margin-bottom: 8px; line-height: 1.4;">
        ${task.title}
      </div>
      
      <!-- 任务描述（截断） -->
      ${task.description
        ? html`
            <div
              style="
                font-size: 0.85rem;
                color: var(--text-muted);
                margin-bottom: 8px;
                line-height: 1.4;
                max-height: 2.8em;
                overflow: hidden;
                text-overflow: ellipsis;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
              "
            >
              ${task.description}
            </div>
          `
        : nothing}
      
      <!-- 进度条（如果有子任务） -->
      ${task.subtaskCount
        ? html`
            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">
                <span>子任务进度</span>
                <span>${task.subtaskDoneCount} / ${task.subtaskCount}</span>
              </div>
              <div style="height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden;">
                <div
                  style="
                    height: 100%;
                    background: var(--primary);
                    width: ${task.subtaskCount > 0 ? ((task.subtaskDoneCount || 0) / task.subtaskCount) * 100 : 0}%;
                    transition: width 0.3s;
                  "
                ></div>
              </div>
            </div>
          `
        : nothing}
      
      <!-- 底部信息栏 -->
      <div class="row" style="justify-content: space-between; align-items: center; font-size: 0.8rem;">
        <!-- 执行者头像 -->
        <div class="row" style="gap: 4px;">
          ${task.assignees.slice(0, 3).map((assignee) => html`
            <div
              class="avatar avatar--xs"
              title="${assignee.name} (${assignee.type === "human" ? "👤" : "🤖"})"
              style="
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: ${assignee.type === "human" ? "#4CAF50" : "#2196F3"};
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.7rem;
              "
            >
              ${assignee.type === "human" ? "👤" : "🤖"}
            </div>
          `)}
          ${task.assignees.length > 3 ? html`<span>+${task.assignees.length - 3}</span>` : nothing}
        </div>
        
        <!-- 附加信息 -->
        <div class="row" style="gap: 8px; color: var(--text-muted);">
          ${task.commentCount ? html`<span>💬 ${task.commentCount}</span>` : nothing}
          ${task.attachmentCount ? html`<span>📎 ${task.attachmentCount}</span>` : nothing}
          ${task.dueDate ? html`<span>${formatDueDate(task.dueDate)}</span>` : nothing}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 任务详情面板
// ============================================================================

function renderTaskDetailPanel(props: TaskKanbanProps) {
  if (!props.selectedTask) return nothing;

  const task = props.selectedTask;

  return html`
    <div
      class="task-detail-panel"
      style="
        position: fixed;
        top: 0;
        right: 0;
        width: 600px;
        height: 100vh;
        background: var(--bg);
        box-shadow: -4px 0 16px rgba(0,0,0,0.1);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        animation: slideInRight 0.3s;
      "
    >
      <!-- 头部 -->
      <div style="padding: 16px; border-bottom: 1px solid var(--border);">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; font-size: 1.1rem;">任务详情</span>
          <button
            class="btn btn--sm"
            style="padding: 4px 8px;"
            @click=${props.onCloseDetailPanel}
          >
            ✕
          </button>
        </div>
      </div>
      
      <!-- 内容区（可滚动） -->
      <div style="flex: 1; overflow-y: auto; padding: 16px;">
        <!-- 基本信息 -->
        ${renderTaskBasicInfo(task, props)}
        
        <!-- 执行者 -->
        ${renderTaskAssignees(task, props)}
        
        <!-- 描述 -->
        ${renderTaskDescription(task, props)}
        
        <!-- 评论区 -->
        ${renderTaskComments(props)}
        
        <!-- 附件 -->
        ${renderTaskAttachments(props)}
        
        <!-- 工作日志（智能助手专用） -->
        ${renderTaskWorkLogs(props)}
      </div>
      
      <!-- 底部操作栏 -->
      <div style="padding: 16px; border-top: 1px solid var(--border); background: var(--bg-secondary);">
        <div class="row" style="gap: 8px; justify-content: flex-end;">
          <button
            class="btn btn--sm"
            @click=${() => props.onDeleteTask(task.id)}
          >
            删除任务
          </button>
          <button
            class="btn btn--sm btn--primary"
            @click=${props.onCloseDetailPanel}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
    
    <!-- 背景遮罩 -->
    <div
      style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.3);
        z-index: 999;
      "
      @click=${props.onCloseDetailPanel}
    ></div>
  `;
}

function renderTaskBasicInfo(task: TaskDetail, props: TaskKanbanProps) {
  return html`
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 12px;">
        ${task.title}
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
        <!-- 状态 -->
        <div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">状态</div>
          <select
            class="input"
            .value=${task.status}
            @change=${(e: Event) =>
              props.onUpdateTask(task.id, { status: (e.target as HTMLSelectElement).value as TaskStatus })}
          >
            <option value="todo">📝 待办</option>
            <option value="in-progress">⚙️ 进行中</option>
            <option value="review">👀 审查中</option>
            <option value="blocked">🚫 已阻塞</option>
            <option value="done">✅ 已完成</option>
          </select>
        </div>
        
        <!-- 优先级 -->
        <div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">优先级</div>
          <select
            class="input"
            .value=${task.priority}
            @change=${(e: Event) =>
              props.onUpdateTask(task.id, { priority: (e.target as HTMLSelectElement).value as TaskPriority })}
          >
            <option value="low">🟢 低</option>
            <option value="medium">🟡 中</option>
            <option value="high">🟠 高</option>
            <option value="urgent">🔴 紧急</option>
          </select>
        </div>
        
        <!-- 截止日期 -->
        ${task.dueDate
          ? html`
              <div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">截止日期</div>
                <div>${new Date(task.dueDate).toLocaleString("zh-CN")}</div>
              </div>
            `
          : nothing}
        
        <!-- 创建时间 -->
        <div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">创建时间</div>
          <div>${new Date(task.createdAt).toLocaleString("zh-CN")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderTaskAssignees(task: TaskDetail, props: TaskKanbanProps) {
  return html`
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <div style="font-weight: 600; margin-bottom: 12px;">👥 执行者</div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${task.assignees.map((assignee) => html`
          <div class="row" style="align-items: center; gap: 8px; padding: 6px 12px; border-radius: 16px; background: var(--bg-secondary);">
            <span>${assignee.type === "human" ? "👤" : "🤖"}</span>
            <span>${assignee.name}</span>
          </div>
        `)}
        <button class="btn btn--sm" style="border-radius: 16px;">➕ 添加</button>
      </div>
    </div>
  `;
}

function renderTaskDescription(task: TaskDetail, props: TaskKanbanProps) {
  return html`
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <div style="font-weight: 600; margin-bottom: 12px;">📄 任务描述</div>
      <div style="line-height: 1.6; white-space: pre-wrap;">
        ${task.description || "暂无描述"}
      </div>
    </div>
  `;
}

function renderTaskComments(props: TaskKanbanProps) {
  return html`
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <div style="font-weight: 600; margin-bottom: 12px;">💬 评论 (${props.taskComments.length})</div>
      
      <!-- 评论列表 -->
      <div style="max-height: 300px; overflow-y: auto; margin-bottom: 12px;">
        ${props.taskComments.map((comment) => html`
          <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
            <div class="row" style="justify-content: space-between; margin-bottom: 4px;">
              <div class="row" style="gap: 8px; align-items: center;">
                <span>${comment.authorType === "human" ? "👤" : "🤖"}</span>
                <span style="font-weight: 500;">${comment.authorName}</span>
              </div>
              <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${new Date(comment.createdAt).toLocaleString("zh-CN")}
              </span>
            </div>
            <div style="line-height: 1.5; white-space: pre-wrap;">
              ${comment.content}
            </div>
          </div>
        `)}
      </div>
      
      <!-- 添加评论 -->
      <textarea
        class="input"
        placeholder="添加评论..."
        rows="3"
        style="width: 100%; resize: vertical;"
      ></textarea>
      <button class="btn btn--sm btn--primary" style="margin-top: 8px;">发送</button>
    </div>
  `;
}

function renderTaskAttachments(props: TaskKanbanProps) {
  return html`
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <div style="font-weight: 600; margin-bottom: 12px;">📎 附件 (${props.taskAttachments.length})</div>
      ${props.taskAttachments.length === 0
        ? html`<div style="color: var(--text-muted);">暂无附件</div>`
        : html`
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${props.taskAttachments.map((attachment) => html`
                <div class="row" style="justify-content: space-between; padding: 8px; border-radius: 4px; background: var(--bg-secondary);">
                  <div class="row" style="gap: 8px; align-items: center;">
                    <span>📄</span>
                    <span>${attachment.fileName}</span>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">
                      (${formatFileSize(attachment.fileSize)})
                    </span>
                  </div>
                  <button class="btn btn--sm">下载</button>
                </div>
              `)}
            </div>
          `}
      <button class="btn btn--sm" style="margin-top: 8px;">➕ 添加附件</button>
    </div>
  `;
}

function renderTaskWorkLogs(props: TaskKanbanProps) {
  if (props.taskWorkLogs.length === 0) return nothing;

  return html`
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <div style="font-weight: 600; margin-bottom: 12px;">🤖 智能助手工作日志</div>
      <div style="max-height: 300px; overflow-y: auto;">
        ${props.taskWorkLogs.map((log) => html`
          <div style="margin-bottom: 8px; padding: 8px; border-radius: 4px; background: var(--bg-secondary);">
            <div class="row" style="justify-content: space-between; margin-bottom: 4px;">
              <span style="font-weight: 500;">🤖 ${log.agentName}</span>
              <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${new Date(log.createdAt).toLocaleString("zh-CN")}
              </span>
            </div>
            <div style="font-size: 0.9rem; margin-bottom: 4px;">
              <strong>${log.action}</strong>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">
              ${log.details}
            </div>
            ${log.result
              ? html`
                  <div style="margin-top: 4px;">
                    ${log.result === "success" ? "✅ 成功" : log.result === "failure" ? "❌ 失败" : "⚠️ 部分完成"}
                  </div>
                `
              : nothing}
          </div>
        `)}
      </div>
    </div>
  `;
}

// ============================================================================
// 任务创建对话框
// ============================================================================

function renderCreateTaskDialog(props: TaskKanbanProps) {
  return html`
    <div
      class="dialog-overlay"
      style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      "
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) props.onCloseCreateDialog();
      }}
    >
      <div
        class="card"
        style="
          width: 600px;
          max-height: 80vh;
          overflow-y: auto;
          padding: 24px;
          animation: fadeIn 0.3s;
        "
      >
        <!-- 对话框头部 -->
        <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0;">➕ 创建任务</h3>
          <button
            class="btn btn--sm"
            style="padding: 4px 8px;"
            @click=${props.onCloseCreateDialog}
          >
            ✕
          </button>
        </div>
        
        ${props.createError
          ? html`
              <div class="alert alert--error" style="margin-bottom: 16px;">
                ${props.createError}
              </div>
            `
          : nothing}
        
        <!-- 表单 -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- 任务标题 -->
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">
              任务标题 <span style="color: var(--error);">*</span>
            </label>
            <input
              type="text"
              class="input"
              placeholder="请输入任务标题"
              .value=${props.createForm.title}
              @input=${(e: Event) =>
                props.onCreateFormChange("title", (e.target as HTMLInputElement).value)}
            />
          </div>
          
          <!-- 任务描述 -->
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">
              任务描述 <span style="color: var(--error);">*</span>
            </label>
            <textarea
              class="input"
              placeholder="请输入任务描述"
              rows="4"
              style="resize: vertical;"
              .value=${props.createForm.description}
              @input=${(e: Event) =>
                props.onCreateFormChange("description", (e.target as HTMLTextAreaElement).value)}
            ></textarea>
          </div>
          
          <!-- 优先级 -->
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">
              优先级
            </label>
            <select
              class="input"
              .value=${props.createForm.priority}
              @change=${(e: Event) =>
                props.onCreateFormChange("priority", (e.target as HTMLSelectElement).value)}
            >
              <option value="low">🟢 低</option>
              <option value="medium">🟡 中</option>
              <option value="high">🟠 高</option>
              <option value="urgent">🔴 紧急</option>
            </select>
          </div>
          
          <!-- 截止日期 -->
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">
              截止日期
            </label>
            <input
              type="datetime-local"
              class="input"
              @change=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                props.onCreateFormChange("dueDate", value ? new Date(value).getTime() : null);
              }}
            />
          </div>
          
          <!-- 标签 -->
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">
              标签
            </label>
            <input
              type="text"
              class="input"
              placeholder="输入标签，用逗号分隔"
              @input=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                props.onCreateFormChange("tags", value.split(",").map(t => t.trim()).filter(t => t));
              }}
            />
          </div>
        </div>
        
        <!-- 对话框底部 -->
        <div class="row" style="gap: 8px; justify-content: flex-end; margin-top: 24px;">
          <button
            class="btn"
            @click=${props.onCloseCreateDialog}
            ?disabled=${props.createSaving}
          >
            取消
          </button>
          <button
            class="btn btn--primary"
            @click=${props.onCreateTask}
            ?disabled=${props.createSaving || !props.createForm.title || !props.createForm.description}
          >
            ${props.createSaving ? "创建中..." : "创建任务"}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 辅助函数
// ============================================================================

function getPriorityBadge(priority: TaskPriority) {
  const badges = {
    urgent: html`<span class="badge" style="background: #f44336; color: white;">🔴 紧急</span>`,
    high: html`<span class="badge" style="background: #ff9800; color: white;">🟠 高</span>`,
    medium: html`<span class="badge" style="background: #ffc107; color: black;">🟡 中</span>`,
    low: html`<span class="badge" style="background: #4caf50; color: white;">🟢 低</span>`,
  };
  return badges[priority];
}

function formatDueDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = timestamp - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `⏰ 逾期${Math.abs(diffDays)}天`;
  } else if (diffDays === 0) {
    return "⏰ 今天到期";
  } else if (diffDays === 1) {
    return "⏰ 明天到期";
  } else if (diffDays <= 7) {
    return `⏰ ${diffDays}天后`;
  } else {
    return date.toLocaleDateString("zh-CN");
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
