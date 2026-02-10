/**
 * Phase 7 Views: 超级管理员与审批系统界面
 * 管理员管理、审批请求、通知中心的UI渲染
 */

import { html } from "lit";
import type { AppViewState } from "../app-view-state.js";
import {
  loadSuperAdmins,
  loadApprovalRequests,
  loadPendingApprovals,
  loadApprovalStatistics,
  loadNotifications,
  processApprovalDecision,
  cancelApprovalRequest,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../controllers/super-admin.js";

/**
 * 渲染超级管理员管理界面
 */
export function renderSuperAdminManagement(state: AppViewState) {
  return html`
    <div class="super-admin-management">
      <div class="section-header">
        <h2>🔐 超级管理员管理</h2>
        <div class="actions">
          <button class="btn btn-primary" @click=${() => loadSuperAdmins(state)}>
            <span class="icon">🔄</span>
            刷新列表
          </button>
          <button class="btn btn-success" @click=${() => showCreateAdminDialog(state)}>
            <span class="icon">➕</span>
            创建管理员
          </button>
        </div>
      </div>

      ${
        state.superAdminsLoading
          ? html`
              <div class="loading">
                <div class="spinner"></div>
                <span>加载管理员列表...</span>
              </div>
            `
          : state.superAdminsError
            ? html`<div class="error-message">❌ ${state.superAdminsError}</div>`
            : html` ${renderAdminsList(state)} `
      }
    </div>
  `;
}

/**
 * 渲染管理员列表
 */
function renderAdminsList(state: AppViewState) {
  const admins = state.superAdmins ?? [];

  if (admins.length === 0) {
    return html`
      <div class="empty-state">
        <span class="icon">👥</span>
        <p>暂无管理员</p>
      </div>
    `;
  }

  return html`
    <div class="admins-table-container">
      <table class="admins-table">
        <thead>
          <tr>
            <th>管理员ID</th>
            <th>姓名</th>
            <th>角色</th>
            <th>邮箱</th>
            <th>状态</th>
            <th>MFA</th>
            <th>在线</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${admins.map((admin: any) => renderAdminRow(state, admin))}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * 渲染单个管理员行
 */
function renderAdminRow(state: AppViewState, admin: any) {
  const roleLabels: Record<string, string> = {
    "system-admin": "系统管理员",
    "security-admin": "安全管理员",
    "compliance-admin": "合规管理员",
    "operations-admin": "运营管理员",
    "audit-viewer": "审计查看员",
  };

  return html`
    <tr class="admin-row">
      <td class="admin-id">${admin.id}</td>
      <td class="admin-name">${admin.name}</td>
      <td class="admin-role">
        <span class="role-badge role-${admin.role}"> ${roleLabels[admin.role] || admin.role} </span>
      </td>
      <td class="admin-email">${admin.email}</td>
      <td class="admin-status">
        <span class="status-badge ${admin.isActive ? "active" : "inactive"}">
          ${admin.isActive ? "✅ 激活" : "⛔ 禁用"}
        </span>
      </td>
      <td class="admin-mfa">
        ${
          admin.mfaEnabled
            ? html`
                <span class="mfa-enabled">🔒 启用</span>
              `
            : html`
                <span class="mfa-disabled">⚠️ 未启用</span>
              `
        }
      </td>
      <td class="admin-online">
        ${
          admin.isOnline
            ? html`
                <span class="online">🟢 在线</span>
              `
            : html`
                <span class="offline">⚪ 离线</span>
              `
        }
      </td>
      <td class="admin-actions">
        <button class="btn-icon" @click=${() => viewAdminDetail(state, admin.id)} title="查看详情">
          👁️
        </button>
        <button class="btn-icon" @click=${() => editAdmin(state, admin.id)} title="编辑">✏️</button>
        ${
          !admin.isActive
            ? html`<button
              class="btn-icon"
              @click=${() => activateAdmin(state, admin.id)}
              title="激活"
            >
              ✅
            </button>`
            : html`<button
              class="btn-icon"
              @click=${() => deactivateAdmin(state, admin.id)}
              title="停用"
            >
              ⛔
            </button>`
        }
      </td>
    </tr>
  `;
}

/**
 * 渲染审批请求管理界面
 */
export function renderApprovalRequests(state: AppViewState) {
  return html`
    <div class="approval-requests">
      <div class="section-header">
        <h2>📝 审批请求管理</h2>
        <div class="actions">
          <button class="btn btn-primary" @click=${() => loadApprovalRequests(state)}>
            <span class="icon">🔄</span>
            刷新列表
          </button>
          <button class="btn btn-success" @click=${() => showCreateRequestDialog(state)}>
            <span class="icon">➕</span>
            创建审批请求
          </button>
        </div>
      </div>

      ${renderApprovalFilters(state)} ${renderApprovalStats(state)}
      ${
        state.approvalRequestsLoading
          ? html`
              <div class="loading">
                <div class="spinner"></div>
                <span>加载审批请求...</span>
              </div>
            `
          : state.approvalRequestsError
            ? html`<div class="error-message">❌ ${state.approvalRequestsError}</div>`
            : html` ${renderApprovalRequestsList(state)} `
      }
    </div>
  `;
}

/**
 * 渲染审批过滤器
 */
function renderApprovalFilters(state: AppViewState) {
  return html`
    <div class="approval-filters">
      <div class="filter-group">
        <label>状态：</label>
        <select class="filter-select">
          <option value="">全部</option>
          <option value="pending">待审批</option>
          <option value="approved">已批准</option>
          <option value="rejected">已拒绝</option>
          <option value="expired">已过期</option>
        </select>
      </div>
      <div class="filter-group">
        <label>优先级：</label>
        <select class="filter-select">
          <option value="">全部</option>
          <option value="emergency">🔴 紧急</option>
          <option value="urgent">🟠 紧迫</option>
          <option value="high">🟡 高</option>
          <option value="normal">🔵 普通</option>
          <option value="low">⚪ 低</option>
        </select>
      </div>
    </div>
  `;
}

/**
 * 渲染审批统计
 */
function renderApprovalStats(state: AppViewState) {
  const stats = state.approvalStats;
  if (!stats) {
    return html``;
  }

  return html`
    <div class="approval-stats">
      <div class="stat-card">
        <div class="stat-value">${stats.totalRequests || 0}</div>
        <div class="stat-label">总请求数</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-value">${stats.pendingRequests || 0}</div>
        <div class="stat-label">待审批</div>
      </div>
      <div class="stat-card approved">
        <div class="stat-value">${stats.approvedRequests || 0}</div>
        <div class="stat-label">已批准</div>
      </div>
      <div class="stat-card rejected">
        <div class="stat-value">${stats.rejectedRequests || 0}</div>
        <div class="stat-label">已拒绝</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">
          ${((stats.averageApprovalTime || 0) / 1000 / 60).toFixed(1)} 分钟
        </div>
        <div class="stat-label">平均审批时间</div>
      </div>
    </div>
  `;
}

/**
 * 渲染审批请求列表
 */
function renderApprovalRequestsList(state: AppViewState) {
  const requests = state.approvalRequests ?? [];

  if (requests.length === 0) {
    return html`
      <div class="empty-state">
        <span class="icon">📋</span>
        <p>暂无审批请求</p>
      </div>
    `;
  }

  return html`
    <div class="requests-grid">
      ${requests.map((request: any) => renderApprovalRequestCard(state, request))}
    </div>
  `;
}

/**
 * 渲染审批请求卡片
 */
function renderApprovalRequestCard(state: AppViewState, request: any) {
  const priorityIcons: Record<string, string> = {
    emergency: "🔴",
    urgent: "🟠",
    high: "🟡",
    normal: "🔵",
    low: "⚪",
  };

  const statusLabels: Record<string, string> = {
    pending: "⏳ 待审批",
    approved: "✅ 已批准",
    rejected: "❌ 已拒绝",
    expired: "⌛ 已过期",
    cancelled: "🚫 已取消",
  };

  return html`
    <div class="request-card status-${request.status}">
      <div class="request-header">
        <div class="request-priority">
          ${priorityIcons[request.priority]} ${request.priority.toUpperCase()}
        </div>
        <div class="request-status">${statusLabels[request.status]}</div>
      </div>

      <div class="request-body">
        <h3 class="request-title">${request.title}</h3>
        <p class="request-description">${request.description}</p>

        <div class="request-meta">
          <div class="meta-item">
            <span class="meta-label">请求人：</span>
            <span class="meta-value">${request.requester.name}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">操作类型：</span>
            <span class="meta-value">${request.requestedAction}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">创建时间：</span>
            <span class="meta-value">${formatTime(request.createdAt)}</span>
          </div>
        </div>

        <div class="request-approvers">
          <div class="approvers-label">审批者（${request.approvals.length}/${request.requiredApprovals}）：</div>
          <div class="approvers-list">
            ${request.approvers.map(
              (approver: any) => html`
                <span class="approver-badge">${approver.name}</span>
              `,
            )}
          </div>
        </div>
      </div>

      <div class="request-footer">
        ${
          request.status === "pending"
            ? html`
              <button
                class="btn btn-success btn-sm"
                @click=${() => approveRequest(state, request.id)}
              >
                ✅ 批准
              </button>
              <button
                class="btn btn-danger btn-sm"
                @click=${() => rejectRequest(state, request.id)}
              >
                ❌ 拒绝
              </button>
              <button
                class="btn btn-secondary btn-sm"
                @click=${() => cancelApprovalRequest(state, request.id)}
              >
                🚫 取消
              </button>
            `
            : html``
        }
        <button
          class="btn btn-outline btn-sm"
          @click=${() => viewRequestDetail(state, request.id)}
        >
          👁️ 查看详情
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染通知中心
 */
export function renderNotificationCenter(state: AppViewState) {
  return html`
    <div class="notification-center">
      <div class="section-header">
        <h2>🔔 通知中心</h2>
        <div class="actions">
          <button class="btn btn-primary" @click=${() => loadNotifications(state)}>
            <span class="icon">🔄</span>
            刷新
          </button>
          <button
            class="btn btn-outline"
            @click=${() => markAllNotificationsAsRead(state, getCurrentUserId(state))}
          >
            ✅ 全部标记已读
          </button>
        </div>
      </div>

      ${
        state.notificationsLoading
          ? html`
              <div class="loading">
                <div class="spinner"></div>
                <span>加载通知...</span>
              </div>
            `
          : state.notificationsError
            ? html`<div class="error-message">❌ ${state.notificationsError}</div>`
            : html` ${renderNotificationsList(state)} `
      }
    </div>
  `;
}

/**
 * 渲染通知列表
 */
function renderNotificationsList(state: AppViewState) {
  const notifications = state.notifications ?? [];

  if (notifications.length === 0) {
    return html`
      <div class="empty-state">
        <span class="icon">🔔</span>
        <p>暂无通知</p>
      </div>
    `;
  }

  return html`
    <div class="notifications-list">
      ${notifications.map((notification: any) => renderNotificationItem(state, notification))}
    </div>
  `;
}

/**
 * 渲染单个通知项
 */
function renderNotificationItem(state: AppViewState, notification: any) {
  const typeIcons: Record<string, string> = {
    approval_request: "📝",
    approval_result: "✅",
    emergency_access: "🚨",
    system_alert: "⚠️",
    security_event: "🔒",
  };

  return html`
    <div class="notification-item ${notification.isRead ? "read" : "unread"}">
      <div class="notification-icon">${typeIcons[notification.type] || "📬"}</div>
      <div class="notification-content">
        <div class="notification-header">
          <h4 class="notification-title">${notification.title}</h4>
          <span class="notification-time">${formatTime(notification.createdAt)}</span>
        </div>
        <p class="notification-message">${notification.message}</p>
        ${
          notification.actions && notification.actions.length > 0
            ? html`
              <div class="notification-actions">
                ${notification.actions.map(
                  (action: any) => html`
                    <button class="btn-link" @click=${() => handleNotificationAction(state, action)}>
                      ${action.label}
                    </button>
                  `,
                )}
              </div>
            `
            : html``
        }
      </div>
      ${
        !notification.isRead
          ? html`
            <button
              class="notification-mark-read"
              @click=${() => markNotificationAsRead(state, notification.id)}
              title="标记为已读"
            >
              ✓
            </button>
          `
          : html``
      }
    </div>
  `;
}

// ==================== 辅助函数 ====================

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "刚刚";
  }
  if (diffMins < 60) {
    return `${diffMins}分钟前`;
  }
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }
  if (diffDays < 7) {
    return `${diffDays}天前`;
  }

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCurrentUserId(state: AppViewState): string {
  return state.adminSession?.adminId || "";
}

// ==================== 对话框和操作函数 ====================

async function showCreateAdminDialog(state: AppViewState) {
  // TODO: 实现创建管理员对话框
  console.log("[Phase7] Show create admin dialog");
}

async function viewAdminDetail(state: AppViewState, adminId: string) {
  console.log("[Phase7] View admin detail:", adminId);
}

async function editAdmin(state: AppViewState, adminId: string) {
  console.log("[Phase7] Edit admin:", adminId);
}

async function activateAdmin(state: AppViewState, adminId: string) {
  console.log("[Phase7] Activate admin:", adminId);
}

async function deactivateAdmin(state: AppViewState, adminId: string) {
  console.log("[Phase7] Deactivate admin:", adminId);
}

async function showCreateRequestDialog(state: AppViewState) {
  console.log("[Phase7] Show create request dialog");
}

async function approveRequest(state: AppViewState, requestId: string) {
  await processApprovalDecision(state, {
    requestId,
    approver: { type: "user", id: getCurrentUserId(state), name: "Current User" },
    decision: "approve",
    timestamp: Date.now(),
  });
}

async function rejectRequest(state: AppViewState, requestId: string) {
  await processApprovalDecision(state, {
    requestId,
    approver: { type: "user", id: getCurrentUserId(state), name: "Current User" },
    decision: "reject",
    timestamp: Date.now(),
  });
}

async function viewRequestDetail(state: AppViewState, requestId: string) {
  console.log("[Phase7] View request detail:", requestId);
}

async function handleNotificationAction(state: AppViewState, action: any) {
  console.log("[Phase7] Handle notification action:", action);
  if (action.url) {
    window.open(action.url, "_blank");
  }
}

/**
 * 超级管理员主渲染函数
 * 根据 activeTab 渲染不同的子界面
 */
export function renderSuperAdmin(props: {
  loading: boolean;
  error: string | null;
  activeTab: "management" | "approvals" | "notifications";
  superAdminsList: any[];
  superAdminsLoading: boolean;
  approvalRequests: any[];
  approvalsLoading: boolean;
  notifications: any[];
  notificationsLoading: boolean;
  onRefresh: () => void;
  onTabChange: (tab: "management" | "approvals" | "notifications") => void;
  onAddSuperAdmin: (agentId: string) => void;
  onRemoveSuperAdmin: (agentId: string) => void;
  onApprovalAction: (requestId: string, action: "approve" | "deny", comment?: string) => void;
  onMarkNotificationRead: (notificationId: string) => void;
}) {
  // 创建一个临时的 state 对象用于内部函数
  const tempState: Partial<AppViewState> = {
    superAdmins: props.superAdminsList,
    superAdminsLoading: props.superAdminsLoading,
    superAdminsError: props.error,
    approvalRequests: props.approvalRequests,
    approvalRequestsLoading: props.approvalsLoading,
    approvalRequestsError: props.error,
    notifications: props.notifications,
    notificationsLoading: props.notificationsLoading,
    notificationsError: props.error,
  };

  return html`
    <div class="super-admin-container">
      <div class="tab-navigation">
        <button
          class="tab-btn ${props.activeTab === "management" ? "active" : ""}"
          @click=${() => props.onTabChange("management")}
        >
          🔐 管理员管理
        </button>
        <button
          class="tab-btn ${props.activeTab === "approvals" ? "active" : ""}"
          @click=${() => props.onTabChange("approvals")}
        >
          📋 审批请求
        </button>
        <button
          class="tab-btn ${props.activeTab === "notifications" ? "active" : ""}"
          @click=${() => props.onTabChange("notifications")}
        >
          🔔 通知中心
        </button>
      </div>

      <div class="tab-content">
        ${
          props.activeTab === "management"
            ? renderSuperAdminManagement(tempState as AppViewState)
            : props.activeTab === "approvals"
              ? renderApprovalRequests(tempState as AppViewState)
              : renderNotificationCenter(tempState as AppViewState)
        }
      </div>
    </div>
  `;
}
