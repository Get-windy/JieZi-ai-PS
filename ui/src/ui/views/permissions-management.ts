/**
 * 权限管理界面 (Permissions Management)
 * Phase 5: Web UI - 权限配置与审批管理
 */

import { html, nothing } from "lit";
import { t } from "../i18n.js";

export type PermissionsManagementProps = {
  loading: boolean;
  error: string | null;
  activeTab: "config" | "approvals" | "history";

  // 权限配置
  permissionsConfig: PermissionsConfig | null;
  configLoading: boolean;
  configSaving: boolean;

  // 审批请求
  approvalRequests: ApprovalRequest[];
  approvalsLoading: boolean;
  approvalStats: ApprovalStats | null;
  approvalsFilter: ApprovalFilter;
  selectedApprovals: Set<string>;
  selectedApprovalDetail: ApprovalRequest | null; // 选中查看详情的审批请求

  // 变更历史
  changeHistory: PermissionChange[];
  historyLoading: boolean;

  // 回调函数
  onRefresh: () => void;
  onTabChange: (tab: "config" | "approvals" | "history") => void;
  onPermissionChange: (agentId: string, permission: string, granted: boolean) => void;
  onSaveConfig: () => void;
  onApprovalAction: (requestId: string, action: "approve" | "deny", comment?: string) => void;
  onBatchApprove: (requestIds: string[], comment?: string) => void;
  onBatchDeny: (requestIds: string[], reason: string) => void;
  onFilterChange: (filter: Partial<ApprovalFilter>) => void;
  onSelectApproval: (requestId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onShowApprovalDetail: (request: ApprovalRequest | null) => void; // 显示/隐藏详情弹窗
};

export type ApprovalStats = {
  totalPending: number;
  totalApproved: number;
  totalDenied: number;
  totalExpired: number;
  avgResponseTime: number;
  highPriorityCount: number;
  expiringWithin1Hour: number;
};

export type ApprovalFilter = {
  status: "all" | "pending" | "approved" | "denied" | "expired" | "cancelled";
  priority: "all" | "low" | "normal" | "high" | "urgent";
  type: "all" | string;
  requester: "all" | string;
  search: string;
};

export type PermissionsConfig = {
  agentId: string;
  permissions: Permission[];
  scope: string[];
  constraints: Constraint[];
};

export type Permission = {
  id: string;
  name: string;
  description: string;
  category: string;
  granted: boolean;
  requiredLevel: number;
  inheritedFrom?: string;
};

export type Constraint = {
  id: string;
  type: "time" | "location" | "resource" | "operation";
  description: string;
  active: boolean;
};

export type ApprovalRequest = {
  id: string;
  type: string;
  requesterId: string;
  requesterName: string;
  requesterType: "agent" | "human";
  targetId: string;
  targetName?: string;
  reason: string;
  status: "pending" | "approved" | "denied" | "timeout" | "cancelled";
  createdAt: number;
  expiresAt: number;
  respondedAt?: number;
  approver?: {
    id: string;
    name: string;
    decision: "approve" | "deny";
    comment?: string;
  };
};

export type PermissionChange = {
  id: string;
  agentId: string;
  agentName: string;
  permission: string;
  action: "grant" | "revoke" | "modify";
  oldValue?: any;
  newValue?: any;
  changedBy: string;
  changedByName: string;
  timestamp: number;
  reason?: string;
};

/**
 * 渲染权限管理界面
 */
export function renderPermissionsManagement(props: PermissionsManagementProps) {
  return html`
    <div class="permissions-management-container">
      ${renderHeader(props)}
      ${renderTabs(props)}
      ${renderContent(props)}
      ${renderApprovalDetailModal(props)}
    </div>
  `;
}

/**
 * 渲染页面标题
 */
function renderHeader(props: PermissionsManagementProps) {
  return html`
    <div class="permissions-management-header">
      <div class="header-title">
        <h1>${t("permissions_management.title")}</h1>
        <p class="subtitle">${t("permissions_management.subtitle")}</p>
      </div>
      <div class="header-actions">
        <button
          class="btn-refresh"
          @click=${props.onRefresh}
          ?disabled=${props.loading}
        >
          ${t("permissions_management.refresh")}
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染标签页
 */
function renderTabs(props: PermissionsManagementProps) {
  const tabs: Array<{ id: "config" | "approvals" | "history"; label: string; count?: number }> = [
    { id: "config", label: t("permissions_management.tab.config") },
    {
      id: "approvals",
      label: t("permissions_management.tab.approvals"),
      count: props.approvalRequests.filter((r) => r.status === "pending").length,
    },
    { id: "history", label: t("permissions_management.tab.history") },
  ];

  return html`
    <div class="permissions-tabs">
      ${tabs.map(
        (tab) => html`
        <button
          class="tab ${props.activeTab === tab.id ? "active" : ""}"
          @click=${() => props.onTabChange(tab.id)}
        >
          ${tab.label}
          ${tab.count && tab.count > 0 ? html`<span class="tab-badge">${tab.count}</span>` : nothing}
        </button>
      `,
      )}
    </div>
  `;
}

/**
 * 渲染主要内容区域
 */
function renderContent(props: PermissionsManagementProps) {
  if (props.loading) {
    return html`<div class="loading">${t("permissions_management.loading")}</div>`;
  }

  if (props.error) {
    return html`<div class="error">${props.error}</div>`;
  }

  switch (props.activeTab) {
    case "config":
      return renderConfigTab(props);
    case "approvals":
      return renderApprovalsTab(props);
    case "history":
      return renderHistoryTab(props);
    default:
      return nothing;
  }
}

/**
 * 渲染权限配置标签页
 */
function renderConfigTab(props: PermissionsManagementProps) {
  if (props.configLoading) {
    return html`<div class="loading">${t("permissions_management.config.loading")}</div>`;
  }

  if (!props.permissionsConfig) {
    return html`<div class="empty">${t("permissions_management.config.no_config")}</div>`;
  }

  const config = props.permissionsConfig;
  const permissionsByCategory = groupPermissionsByCategory(config.permissions);

  return html`
    <div class="config-tab">
      <div class="config-header">
        <h2>${t("permissions_management.config.title")}</h2>
        <button
          class="btn-save"
          @click=${props.onSaveConfig}
          ?disabled=${props.configSaving}
        >
          ${
            props.configSaving
              ? t("permissions_management.config.saving")
              : t("permissions_management.config.save")
          }
        </button>
      </div>

      <div class="permissions-grid">
        ${Object.entries(permissionsByCategory).map(([category, permissions]) =>
          renderPermissionCategory(category, permissions, config, props),
        )}
      </div>

      ${
        config.constraints.length > 0
          ? html`
        <div class="constraints-section">
          <h3>${t("permissions_management.config.constraints")}</h3>
          <div class="constraints-list">
            ${config.constraints.map((constraint) => renderConstraint(constraint))}
          </div>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 按分类分组权限
 */
function groupPermissionsByCategory(permissions: Permission[]): Record<string, Permission[]> {
  return permissions.reduce(
    (acc, permission) => {
      if (!acc[permission.category]) {
        acc[permission.category] = [];
      }
      acc[permission.category].push(permission);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );
}

/**
 * 渲染权限分类
 */
function renderPermissionCategory(
  category: string,
  permissions: Permission[],
  config: PermissionsConfig,
  props: PermissionsManagementProps,
) {
  return html`
    <div class="permission-category">
      <h3 class="category-title">
        ${t(`permissions_management.category.${category}`)}
      </h3>
      <div class="permissions-list">
        ${permissions.map((permission) => renderPermissionItem(permission, config, props))}
      </div>
    </div>
  `;
}

/**
 * 渲染权限项
 */
function renderPermissionItem(
  permission: Permission,
  config: PermissionsConfig,
  props: PermissionsManagementProps,
) {
  return html`
    <div class="permission-item ${permission.granted ? "granted" : "denied"}">
      <div class="permission-toggle">
        <label class="switch">
          <input
            type="checkbox"
            ?checked=${permission.granted}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onPermissionChange(config.agentId, permission.id, target.checked);
            }}
          />
          <span class="slider"></span>
        </label>
      </div>
      <div class="permission-info">
        <div class="permission-name">${permission.name}</div>
        <div class="permission-description">${permission.description}</div>
        <div class="permission-meta">
          <span class="required-level">
            ${t("permissions_management.config.required_level")}: ${permission.requiredLevel}
          </span>
          ${
            permission.inheritedFrom
              ? html`
            <span class="inherited">
              ${t("permissions_management.config.inherited_from")}: ${permission.inheritedFrom}
            </span>
          `
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染约束条件
 */
function renderConstraint(constraint: Constraint) {
  return html`
    <div class="constraint-item ${constraint.active ? "active" : "inactive"}">
      <span class="constraint-icon">${getConstraintIcon(constraint.type)}</span>
      <div class="constraint-info">
        <div class="constraint-type">
          ${t(`permissions_management.constraint.type.${constraint.type}`)}
        </div>
        <div class="constraint-description">${constraint.description}</div>
      </div>
      <span class="constraint-status">
        ${
          constraint.active
            ? t("permissions_management.constraint.active")
            : t("permissions_management.constraint.inactive")
        }
      </span>
    </div>
  `;
}

/**
 * 获取约束图标
 */
function getConstraintIcon(type: string): string {
  switch (type) {
    case "time":
      return "🕒";
    case "location":
      return "📍";
    case "resource":
      return "📦";
    case "operation":
      return "⚙️";
    default:
      return "🔒";
  }
}

/**
 * 渲染审批请求标签页
 */
function renderApprovalsTab(props: PermissionsManagementProps) {
  if (props.approvalsLoading) {
    return html`<div class="loading">${t("permissions_management.approvals.loading")}</div>`;
  }

  // 应用过滤器
  const filteredRequests = filterApprovalRequests(props.approvalRequests, props.approvalsFilter);
  const pendingRequests = filteredRequests.filter((r) => r.status === "pending");
  const processedRequests = filteredRequests.filter((r) => r.status !== "pending");
  const selectedCount = props.selectedApprovals.size;

  return html`
    <div class="approvals-tab">
      <!-- 统计卡片 -->
      ${renderApprovalStats(props.approvalStats)}

      <!-- 过滤器和操作栏 -->
      <div class="approvals-toolbar">
        <div class="filters-row">
          ${renderApprovalFilters(props)}
        </div>
        ${selectedCount > 0 ? renderBatchActions(props, selectedCount) : nothing}
      </div>

      <!-- 待审批列表 -->
      ${
        pendingRequests.length > 0
          ? html`
        <section class="approvals-section">
          <div class="section-header">
            <h2>${t("permissions_management.approvals.pending")} (${pendingRequests.length})</h2>
            <div class="select-controls">
              <button class="btn-text" @click=${props.onSelectAll}>
                ${t("permissions_management.approvals.select_all")}
              </button>
              <button class="btn-text" @click=${props.onDeselectAll}>
                ${t("permissions_management.approvals.deselect_all")}
              </button>
            </div>
          </div>
          <div class="approvals-list">
            ${pendingRequests.map((request) => renderApprovalRequestCard(request, props, true))}
          </div>
        </section>
      `
          : html`
        <div class="empty-pending">
          <div class="empty-icon">✓</div>
          <div class="empty-text">${t("permissions_management.approvals.no_pending")}</div>
        </div>
      `
      }

      <!-- 已处理列表 -->
      ${
        processedRequests.length > 0
          ? html`
        <section class="approvals-section processed">
          <h2>${t("permissions_management.approvals.processed")} (${processedRequests.length})</h2>
          <div class="approvals-list">
            ${processedRequests.map((request) => renderApprovalRequestCard(request, props, false))}
          </div>
        </section>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染统计卡片
 */
function renderApprovalStats(stats: ApprovalStats | null) {
  if (!stats) return nothing;

  const cards = [
    {
      label: t("permissions_management.approvals.stats.pending"),
      value: stats.totalPending,
      icon: "⏳",
      variant: "pending",
    },
    {
      label: t("permissions_management.approvals.stats.approved"),
      value: stats.totalApproved,
      icon: "✓",
      variant: "approved",
    },
    {
      label: t("permissions_management.approvals.stats.denied"),
      value: stats.totalDenied,
      icon: "✗",
      variant: "denied",
    },
    {
      label: t("permissions_management.approvals.stats.high_priority"),
      value: stats.highPriorityCount,
      icon: "⚠️",
      variant: "urgent",
    },
    {
      label: t("permissions_management.approvals.stats.expiring_soon"),
      value: stats.expiringWithin1Hour,
      icon: "⏰",
      variant: "warning",
    },
    {
      label: t("permissions_management.approvals.stats.avg_response"),
      value: formatDuration(stats.avgResponseTime),
      icon: "⏱️",
      variant: "info",
    },
  ];

  return html`
    <div class="approval-stats-grid">
      ${cards.map(
        (card) => html`
        <div class="stats-card ${card.variant}">
          <div class="stats-icon">${card.icon}</div>
          <div class="stats-content">
            <div class="stats-label">${card.label}</div>
            <div class="stats-value">${card.value}</div>
          </div>
        </div>
      `,
      )}
    </div>
  `;
}

/**
 * 渲染过滤器
 */
function renderApprovalFilters(props: PermissionsManagementProps) {
  return html`
    <div class="approval-filters">
      <!-- 搜索框 -->
      <div class="filter-item filter-search">
        <input
          type="text"
          class="search-input"
          placeholder="${t("permissions_management.approvals.search_placeholder")}"
          .value=${props.approvalsFilter.search}
          @input=${(e: Event) => {
            const value = (e.target as HTMLInputElement).value;
            props.onFilterChange({ search: value });
          }}
        />
      </div>

      <!-- 状态过滤 -->
      <div class="filter-item">
        <label>${t("permissions_management.approvals.filter.status")}</label>
        <select
          .value=${props.approvalsFilter.status}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value as ApprovalFilter["status"];
            props.onFilterChange({ status: value });
          }}
        >
          <option value="all">${t("permissions_management.approvals.filter.all")}</option>
          <option value="pending">${t("permissions_management.approvals.filter.pending")}</option>
          <option value="approved">${t("permissions_management.approvals.filter.approved")}</option>
          <option value="denied">${t("permissions_management.approvals.filter.denied")}</option>
          <option value="expired">${t("permissions_management.approvals.filter.expired")}</option>
        </select>
      </div>

      <!-- 优先级过滤 -->
      <div class="filter-item">
        <label>${t("permissions_management.approvals.filter.priority")}</label>
        <select
          .value=${props.approvalsFilter.priority}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value as ApprovalFilter["priority"];
            props.onFilterChange({ priority: value });
          }}
        >
          <option value="all">${t("permissions_management.approvals.filter.all")}</option>
          <option value="low">${t("permissions_management.approvals.filter.low")}</option>
          <option value="normal">${t("permissions_management.approvals.filter.normal")}</option>
          <option value="high">${t("permissions_management.approvals.filter.high")}</option>
          <option value="urgent">${t("permissions_management.approvals.filter.urgent")}</option>
        </select>
      </div>

      <!-- 类型过滤 -->
      <div class="filter-item">
        <label>${t("permissions_management.approvals.filter.type")}</label>
        <select
          .value=${props.approvalsFilter.type}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            props.onFilterChange({ type: value });
          }}
        >
          <option value="all">${t("permissions_management.approvals.filter.all")}</option>
          <option value="create_agent">${t("permissions_management.approval_type.create_agent")}</option>
          <option value="delete_agent">${t("permissions_management.approval_type.delete_agent")}</option>
          <option value="grant_permission">${t("permissions_management.approval_type.grant_permission")}</option>
          <option value="trainer_certification">${t("permissions_management.approval_type.trainer_certification")}</option>
        </select>
      </div>
    </div>
  `;
}

/**
 * 渲染批量操作栏
 */
function renderBatchActions(props: PermissionsManagementProps, selectedCount: number) {
  return html`
    <div class="batch-actions-bar">
      <div class="batch-info">
        <span class="selected-count">
          ${t("permissions_management.approvals.selected")}: ${selectedCount}
        </span>
      </div>
      <div class="batch-buttons">
        <button
          class="btn btn-approve"
          @click=${() => handleBatchApprove(props)}
        >
          ${t("permissions_management.approvals.batch_approve")}
        </button>
        <button
          class="btn btn-deny"
          @click=${() => handleBatchDeny(props)}
        >
          ${t("permissions_management.approvals.batch_deny")}
        </button>
        <button
          class="btn btn-text"
          @click=${props.onDeselectAll}
        >
          ${t("permissions_management.approvals.cancel_selection")}
        </button>
      </div>
    </div>
  `;
}

/**
 * 过滤审批请求
 */
function filterApprovalRequests(
  requests: ApprovalRequest[],
  filter: ApprovalFilter,
): ApprovalRequest[] {
  return requests.filter((request) => {
    // 状态过滤
    if (filter.status !== "all" && request.status !== filter.status) {
      return false;
    }

    // 优先级过滤（假设 ApprovalRequest 有 priority 字段）
    if (filter.priority !== "all" && (request as any).priority !== filter.priority) {
      return false;
    }

    // 类型过滤
    if (filter.type !== "all" && request.type !== filter.type) {
      return false;
    }

    // 请求者过滤
    if (filter.requester !== "all" && request.requesterId !== filter.requester) {
      return false;
    }

    // 搜索过滤
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const matchesSearch =
        request.requesterName.toLowerCase().includes(searchLower) ||
        request.reason.toLowerCase().includes(searchLower) ||
        request.type.toLowerCase().includes(searchLower) ||
        (request.targetName && request.targetName.toLowerCase().includes(searchLower));
      if (!matchesSearch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 处理批量批准
 */
function handleBatchApprove(props: PermissionsManagementProps) {
  const comment = prompt(t("permissions_management.approvals.batch_approve_comment_prompt"));
  if (comment !== null) {
    const requestIds = Array.from(props.selectedApprovals);
    props.onBatchApprove(requestIds, comment || undefined);
  }
}

/**
 * 处理批量拒绝
 */
function handleBatchDeny(props: PermissionsManagementProps) {
  const reason = prompt(t("permissions_management.approvals.batch_deny_reason_prompt"));
  if (reason) {
    const requestIds = Array.from(props.selectedApprovals);
    props.onBatchDeny(requestIds, reason);
  }
}

/**
 * 渲染审批请求卡片（增强版）
 */
function renderApprovalRequestCard(
  request: ApprovalRequest,
  props: PermissionsManagementProps,
  allowActions: boolean,
) {
  const timeRemaining = request.expiresAt - Date.now();
  const isExpiring = timeRemaining < 3600000; // 少于1小时
  const isSelected = props.selectedApprovals.has(request.id);
  const priority = (request as any).priority || "normal";

  return html`
    <div class="approval-request-card ${request.status} ${isExpiring ? "expiring" : ""} ${isSelected ? "selected" : ""}">
      <!-- 选择框 -->
      ${
        allowActions
          ? html`
        <div class="card-checkbox">
          <input
            type="checkbox"
            .checked=${isSelected}
            @change=${(e: Event) => {
              const checked = (e.target as HTMLInputElement).checked;
              props.onSelectApproval(request.id, checked);
            }}
          />
        </div>
      `
          : nothing
      }

      <div class="card-content">
        <!-- 头部 -->
        <div class="request-header">
          <div class="request-meta">
            <span class="type-badge badge-${request.type}">
              ${t(`permissions_management.approval_type.${request.type}`)}
            </span>
            <span class="status-badge status-${request.status}">
              ${t(`permissions_management.approval_status.${request.status}`)}
            </span>
            <span class="priority-badge priority-${priority}">
              ${getPriorityIcon(priority)} ${t(`permissions_management.approval_priority.${priority}`)}
            </span>
          </div>
          <div class="request-time">
            ${formatTimestamp(request.createdAt)}
          </div>
        </div>

        <!-- 请求信息 -->
        <div class="request-body">
          <div class="requester-info">
            <span class="requester-type ${request.requesterType}">
              ${request.requesterType === "human" ? "👤" : "🤖"}
            </span>
            <span class="requester-name">${request.requesterName}</span>
            <span class="requester-id muted">(${request.requesterId})</span>
            ${
              request.targetName
                ? html`
              <span class="request-arrow">→</span>
              <span class="target-name">${request.targetName}</span>
              <span class="target-id muted">(${request.targetId})</span>
            `
                : nothing
            }
          </div>

          <div class="request-reason">
            <div class="reason-label">${t("permissions_management.approvals.reason")}:</div>
            <div class="reason-text">${request.reason}</div>
          </div>

          <!-- 过期警告 -->
          ${
            isExpiring && request.status === "pending"
              ? html`
            <div class="expiring-warning">
              <span class="warning-icon">⚠️</span>
              <span class="warning-text">
                ${t("permissions_management.approvals.expiring_soon")}: ${formatDuration(timeRemaining)}
              </span>
            </div>
          `
              : nothing
          }
        </div>

        <!-- 操作按钮或审批结果 -->
        ${
          allowActions
            ? html`
          <div class="request-actions">
            <button
              class="btn btn-approve"
              @click=${() => handleApprovalAction(request.id, "approve", props)}
            >
              <span class="btn-icon">✓</span>
              ${t("permissions_management.approvals.approve")}
            </button>
            <button
              class="btn btn-deny"
              @click=${() => handleApprovalAction(request.id, "deny", props)}
            >
              <span class="btn-icon">✗</span>
              ${t("permissions_management.approvals.deny")}
            </button>
            <button
              class="btn btn-secondary"
              @click=${() => showApprovalDetails(request, props)}
            >
              ${t("permissions_management.approvals.view_details")}
            </button>
          </div>
        `
            : request.approver
              ? html`
          <div class="approval-result">
            <div class="approver-info">
              <span class="approver-label">${t("permissions_management.approvals.approver")}:</span>
              <span class="approver-name">${request.approver.name}</span>
              <span class="approval-time">${formatTimestamp(request.respondedAt!)}</span>
            </div>
            ${
              request.approver.comment
                ? html`
              <div class="approver-comment">
                <div class="comment-label">${t("permissions_management.approvals.comment")}:</div>
                <div class="comment-text">${request.approver.comment}</div>
              </div>
            `
                : nothing
            }
          </div>
        `
              : nothing
        }
      </div>
    </div>
  `;
}

/**
 * 获取优先级图标
 */
function getPriorityIcon(priority: string): string {
  switch (priority) {
    case "urgent":
      return "🔴";
    case "high":
      return "🟠";
    case "normal":
      return "🟢";
    case "low":
      return "🔵";
    default:
      return "";
  }
}

/**
 * 显示审批详情
 */
function showApprovalDetails(request: ApprovalRequest, props: PermissionsManagementProps) {
  props.onShowApprovalDetail(request);
}

/**
 * 渲染审批详情弹窗
 */
function renderApprovalDetailModal(props: PermissionsManagementProps) {
  if (!props.selectedApprovalDetail) {
    return nothing;
  }

  const request = props.selectedApprovalDetail;
  const timeRemaining = request.expiresAt - Date.now();
  const isExpiring = timeRemaining < 3600000;
  const priority = (request as any).priority || "normal";

  return html`
    <div class="modal-overlay" @click=${() => props.onShowApprovalDetail(null)}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <!-- 弹窗头部 -->
        <div class="modal-header">
          <h2>
            ${t("permissions_management.approval_detail.title")}
            <span class="status-badge status-${request.status}">
              ${t(`permissions_management.approval_status.${request.status}`)}
            </span>
          </h2>
          <button class="btn-icon" @click=${() => props.onShowApprovalDetail(null)}>&times;</button>
        </div>

        <!-- 弹窗主体 -->
        <div class="modal-body" style="padding: 24px;">
          <!-- 基本信息卡片 -->
          <div class="detail-section">
            <h3 class="section-title">
              ${t("permissions_management.approval_detail.basic_info")}
            </h3>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.request_id")}:</span>
                <span class="info-value mono">${request.id}</span>
              </div>
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.type")}:</span>
                <span class="info-value">
                  <span class="type-badge badge-${request.type}">
                    ${t(`permissions_management.approval_type.${request.type}`)}
                  </span>
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.priority")}:</span>
                <span class="info-value">
                  <span class="priority-badge priority-${priority}">
                    ${getPriorityIcon(priority)} ${t(`permissions_management.approval_priority.${priority}`)}
                  </span>
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.created_at")}:</span>
                <span class="info-value">${new Date(request.createdAt).toLocaleString()}</span>
              </div>
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.expires_at")}:</span>
                <span class="info-value ${isExpiring ? "text-warning" : ""}">
                  ${new Date(request.expiresAt).toLocaleString()}
                  ${isExpiring ? html`<span class="expiring-label">⚠️ ${formatDuration(timeRemaining)}</span>` : nothing}
                </span>
              </div>
            </div>
          </div>

          <!-- 请求者信息 -->
          <div class="detail-section">
            <h3 class="section-title">
              ${t("permissions_management.approval_detail.requester_info")}
            </h3>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.requester_type")}:</span>
                <span class="info-value">
                  ${request.requesterType === "human" ? "👤 人类" : "🤖 智能助手"}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.requester_name")}:</span>
                <span class="info-value">${request.requesterName}</span>
              </div>
              <div class="info-item">
                <span class="info-label">${t("permissions_management.approval_detail.requester_id")}:</span>
                <span class="info-value mono">${request.requesterId}</span>
              </div>
              ${
                request.targetName
                  ? html`
                <div class="info-item">
                  <span class="info-label">${t("permissions_management.approval_detail.target_name")}:</span>
                  <span class="info-value">${request.targetName}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">${t("permissions_management.approval_detail.target_id")}:</span>
                  <span class="info-value mono">${request.targetId}</span>
                </div>
              `
                  : nothing
              }
            </div>
          </div>

          <!-- 请求原因 -->
          <div class="detail-section">
            <h3 class="section-title">
              ${t("permissions_management.approval_detail.request_reason")}
            </h3>
            <div class="reason-box">
              ${request.reason}
            </div>
          </div>

          <!-- 审批结果（如果已审批） -->
          ${
            request.approver
              ? html`
            <div class="detail-section">
              <h3 class="section-title">
                ${t("permissions_management.approval_detail.approval_result")}
              </h3>
              <div class="approval-result-box ${request.approver.decision}">
                <div class="result-header">
                  <span class="result-icon">
                    ${request.approver.decision === "approve" ? "✓" : "✗"}
                  </span>
                  <span class="result-text">
                    ${t(`permissions_management.approval_detail.${request.approver.decision}d`)}
                  </span>
                  <span class="result-time">
                    ${new Date(request.respondedAt!).toLocaleString()}
                  </span>
                </div>
                <div class="info-grid" style="margin-top: 12px;">
                  <div class="info-item">
                    <span class="info-label">${t("permissions_management.approval_detail.approver")}:</span>
                    <span class="info-value">${request.approver.name}</span>
                  </div>
                  ${
                    request.approver.comment
                      ? html`
                    <div class="info-item" style="grid-column: 1 / -1;">
                      <span class="info-label">${t("permissions_management.approval_detail.comment")}:</span>
                      <div class="comment-text">${request.approver.comment}</div>
                    </div>
                  `
                      : nothing
                  }
                </div>
              </div>
            </div>
          `
              : nothing
          }
        </div>

        <!-- 弹窗底部操作 -->
        <div class="modal-footer">
          ${
            request.status === "pending"
              ? html`
            <button
              class="btn btn--primary"
              style="background: #4caf50; border-color: #4caf50;"
              @click=${() => {
                props.onShowApprovalDetail(null);
                handleApprovalAction(request.id, "approve", props);
              }}
            >
              <span class="btn-icon">✓</span>
              ${t("permissions_management.approvals.approve")}
            </button>
            <button
              class="btn btn--danger"
              style="background: #f44336; border-color: #f44336; color: #fff;"
              @click=${() => {
                props.onShowApprovalDetail(null);
                handleApprovalAction(request.id, "deny", props);
              }}
            >
              <span class="btn-icon">✗</span>
              ${t("permissions_management.approvals.deny")}
            </button>
          `
              : nothing
          }
          <button class="btn" @click=${() => props.onShowApprovalDetail(null)}>
            ${t("permissions_management.approval_detail.close")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 处理审批操作
 */
function handleApprovalAction(
  requestId: string,
  action: "approve" | "deny",
  props: PermissionsManagementProps,
) {
  const comment = prompt(t(`permissions_management.approvals.${action}_comment_prompt`));
  props.onApprovalAction(requestId, action, comment || undefined);
}

/**
 * 渲染变更历史标签页
 */
function renderHistoryTab(props: PermissionsManagementProps) {
  if (props.historyLoading) {
    return html`<div class="loading">${t("permissions_management.history.loading")}</div>`;
  }

  if (props.changeHistory.length === 0) {
    return html`<div class="empty">${t("permissions_management.history.no_history")}</div>`;
  }

  return html`
    <div class="history-tab">
      <h2>${t("permissions_management.history.title")}</h2>
      <div class="history-timeline">
        ${props.changeHistory.map((change) => renderHistoryEntry(change))}
      </div>
    </div>
  `;
}

/**
 * 渲染历史记录条目
 */
function renderHistoryEntry(change: PermissionChange) {
  return html`
    <div class="history-entry">
      <div class="entry-timestamp">${formatTimestamp(change.timestamp)}</div>
      <div class="entry-content">
        <div class="entry-action ${change.action}">
          ${getActionIcon(change.action)}
          <span class="action-text">
            ${t(`permissions_management.history.action.${change.action}`)}
          </span>
        </div>
        <div class="entry-details">
          <div class="entry-subject">
            <span class="agent-name">${change.agentName}</span>
            <span class="permission-name">${change.permission}</span>
          </div>
          <div class="entry-actor">
            ${t("permissions_management.history.changed_by")}: ${change.changedByName}
          </div>
          ${
            change.reason
              ? html`
            <div class="entry-reason">${change.reason}</div>
          `
              : nothing
          }
          ${
            change.oldValue !== undefined && change.newValue !== undefined
              ? html`
            <div class="entry-change">
              <span class="old-value">${JSON.stringify(change.oldValue)}</span>
              <span class="change-arrow">→</span>
              <span class="new-value">${JSON.stringify(change.newValue)}</span>
            </div>
          `
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * 获取操作图标
 */
function getActionIcon(action: string): string {
  switch (action) {
    case "grant":
      return "✓";
    case "revoke":
      return "✗";
    case "modify":
      return "✎";
    default:
      return "•";
  }
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return t("permissions_management.time.just_now");
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} ${t("permissions_management.time.minutes")} ${t("permissions_management.time.ago")}`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} ${t("permissions_management.time.hours")} ${t("permissions_management.time.ago")}`;
  } else {
    return date.toLocaleString();
  }
}

/**
 * 格式化时长
 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours} ${t("permissions_management.time.hours")}`;
  } else {
    return `${minutes} ${t("permissions_management.time.minutes")}`;
  }
}
