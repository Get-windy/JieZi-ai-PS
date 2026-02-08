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

  // 变更历史
  changeHistory: PermissionChange[];
  historyLoading: boolean;

  // 回调函数
  onRefresh: () => void;
  onTabChange: (tab: "config" | "approvals" | "history") => void;
  onPermissionChange: (agentId: string, permission: string, granted: boolean) => void;
  onSaveConfig: () => void;
  onApprovalAction: (requestId: string, action: "approve" | "deny", comment?: string) => void;
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

  const pendingRequests = props.approvalRequests.filter((r) => r.status === "pending");
  const processedRequests = props.approvalRequests.filter((r) => r.status !== "pending");

  return html`
    <div class="approvals-tab">
      ${
        pendingRequests.length > 0
          ? html`
        <section class="approvals-section">
          <h2>${t("permissions_management.approvals.pending")}</h2>
          <div class="approvals-list">
            ${pendingRequests.map((request) => renderApprovalRequest(request, props, true))}
          </div>
        </section>
      `
          : html`
        <div class="empty-pending">
          ${t("permissions_management.approvals.no_pending")}
        </div>
      `
      }

      ${
        processedRequests.length > 0
          ? html`
        <section class="approvals-section">
          <h2>${t("permissions_management.approvals.processed")}</h2>
          <div class="approvals-list">
            ${processedRequests.map((request) => renderApprovalRequest(request, props, false))}
          </div>
        </section>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染审批请求
 */
function renderApprovalRequest(
  request: ApprovalRequest,
  props: PermissionsManagementProps,
  allowActions: boolean,
) {
  const timeRemaining = request.expiresAt - Date.now();
  const isExpiring = timeRemaining < 3600000; // 少于1小时

  return html`
    <div class="approval-request ${request.status} ${isExpiring ? "expiring" : ""}">
      <div class="request-header">
        <div class="request-type">
          <span class="type-badge">${t(`permissions_management.approval_type.${request.type}`)}</span>
          <span class="status-badge status-${request.status}">
            ${t(`permissions_management.approval_status.${request.status}`)}
          </span>
        </div>
        <div class="request-time">
          ${formatTimestamp(request.createdAt)}
        </div>
      </div>

      <div class="request-body">
        <div class="requester-info">
          <span class="requester-type ${request.requesterType}">
            ${request.requesterType === "human" ? "👤" : "🤖"}
          </span>
          <span class="requester-name">${request.requesterName}</span>
          ${
            request.targetName
              ? html`
            <span class="request-arrow">→</span>
            <span class="target-name">${request.targetName}</span>
          `
              : nothing
          }
        </div>
        <div class="request-reason">${request.reason}</div>

        ${
          isExpiring && request.status === "pending"
            ? html`
          <div class="expiring-warning">
            ⚠️ ${t("permissions_management.approvals.expiring_soon")}: ${formatDuration(timeRemaining)}
          </div>
        `
            : nothing
        }
      </div>

      ${
        allowActions
          ? html`
        <div class="request-actions">
          <button
            class="btn-approve"
            @click=${() => handleApprovalAction(request.id, "approve", props)}
          >
            ${t("permissions_management.approvals.approve")}
          </button>
          <button
            class="btn-deny"
            @click=${() => handleApprovalAction(request.id, "deny", props)}
          >
            ${t("permissions_management.approvals.deny")}
          </button>
        </div>
      `
          : request.approver
            ? html`
        <div class="approval-result">
          <div class="approver-info">
            <span>${t("permissions_management.approvals.approver")}: ${request.approver.name}</span>
            <span>${formatTimestamp(request.respondedAt!)}</span>
          </div>
          ${
            request.approver.comment
              ? html`
            <div class="approver-comment">${request.approver.comment}</div>
          `
              : nothing
          }
        </div>
      `
            : nothing
      }
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
