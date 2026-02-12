/**
 * 审批管理面板
 * 用于待审批请求列表、审批历史、批量操作
 */

import { html, nothing } from "lit";

// 审批请求类型
export type ApprovalRequest = {
  id: string;
  type: "permission" | "access" | "resource";
  title: string;
  description: string;
  requesterId: string;
  requesterName: string;
  targetId: string;
  targetName: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  reviewedAt?: number;
  reviewerId?: string;
  reviewerName?: string;
  reviewComment?: string;
};

export type ApprovalsPanelProps = {
  requests: ApprovalRequest[];
  loading: boolean;
  error: string | null;
  filter: "all" | "pending" | "approved" | "rejected";
  selectedIds: string[];

  // 回调
  onFilterChange: (filter: "all" | "pending" | "approved" | "rejected") => void;
  onSelectRequest: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBatchApprove: (ids: string[]) => void;
  onBatchReject: (ids: string[]) => void;
  onViewDetail: (id: string) => void;
};

/**
 * 渲染审批管理面板
 */
export function renderApprovalsPanel(props: ApprovalsPanelProps) {
  // 过滤请求
  const filteredRequests = props.requests.filter((req) => {
    if (props.filter === "all") {
      return true;
    }
    return req.status === props.filter;
  });

  // 待审批数量统计
  const pendingCount = props.requests.filter((r) => r.status === "pending").length;
  const approvedCount = props.requests.filter((r) => r.status === "approved").length;
  const rejectedCount = props.requests.filter((r) => r.status === "rejected").length;

  // 渲染过滤器
  const renderFilter = () => html`
    <div class="approvals-filter">
      <button
        class="filter-btn ${props.filter === "all" ? "active" : ""}"
        @click=${() => props.onFilterChange("all")}
      >
        全部 (${props.requests.length})
      </button>
      <button
        class="filter-btn ${props.filter === "pending" ? "active" : ""}"
        @click=${() => props.onFilterChange("pending")}
      >
        待审批 (${pendingCount})
      </button>
      <button
        class="filter-btn ${props.filter === "approved" ? "active" : ""}"
        @click=${() => props.onFilterChange("approved")}
      >
        已通过 (${approvedCount})
      </button>
      <button
        class="filter-btn ${props.filter === "rejected" ? "active" : ""}"
        @click=${() => props.onFilterChange("rejected")}
      >
        已拒绝 (${rejectedCount})
      </button>
    </div>
  `;

  // 渲染批量操作
  const renderBatchActions = () => {
    if (props.selectedIds.length === 0) {
      return nothing;
    }

    return html`
      <div class="batch-actions">
        <span>已选择 ${props.selectedIds.length} 项</span>
        <button
          class="btn btn--sm btn--primary"
          @click=${() => props.onBatchApprove(props.selectedIds)}
        >
          批量通过
        </button>
        <button
          class="btn btn--sm btn--danger"
          @click=${() => props.onBatchReject(props.selectedIds)}
        >
          批量拒绝
        </button>
      </div>
    `;
  };

  // 渲染请求列表
  const renderRequests = () => {
    if (props.loading) {
      return html`
        <div class="loading">加载审批请求中...</div>
      `;
    }

    if (props.error) {
      return html`<div class="error">${props.error}</div>`;
    }

    if (filteredRequests.length === 0) {
      return html`
        <div class="empty-state">暂无审批请求</div>
      `;
    }

    return html`
      <div class="requests-list">
        <div class="requests-header">
          <label class="checkbox-label">
            <input
              type="checkbox"
              ?checked=${props.selectedIds.length === filteredRequests.length && filteredRequests.length > 0}
              @change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                props.onSelectAll(target.checked);
              }}
            />
            <span>全选</span>
          </label>
        </div>

        ${filteredRequests.map(
          (request) => html`
            <div class="request-card ${request.status}">
              <div class="request-select">
                <input
                  type="checkbox"
                  ?checked=${props.selectedIds.includes(request.id)}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLInputElement;
                    props.onSelectRequest(request.id, target.checked);
                  }}
                />
              </div>

              <div class="request-content">
                <div class="request-header">
                  <span class="request-type">${getRequestTypeLabel(request.type)}</span>
                  <span class="request-status ${request.status}">${getStatusLabel(request.status)}</span>
                </div>

                <h4 class="request-title">${request.title}</h4>
                <p class="request-description">${request.description}</p>

                <div class="request-meta">
                  <span>申请人: ${request.requesterName}</span>
                  <span>目标: ${request.targetName}</span>
                  <span>时间: ${new Date(request.createdAt).toLocaleString()}</span>
                </div>

                ${
                  request.reviewedAt
                    ? html`
                      <div class="request-review">
                        <span>审批人: ${request.reviewerName}</span>
                        <span>审批时间: ${new Date(request.reviewedAt).toLocaleString()}</span>
                        ${
                          request.reviewComment
                            ? html`<p>审批意见: ${request.reviewComment}</p>`
                            : nothing
                        }
                      </div>
                    `
                    : nothing
                }
              </div>

              <div class="request-actions">
                <button
                  class="btn btn--sm"
                  @click=${() => props.onViewDetail(request.id)}
                >
                  查看详情
                </button>
                ${
                  request.status === "pending"
                    ? html`
                      <button
                        class="btn btn--sm btn--primary"
                        @click=${() => props.onApprove(request.id)}
                      >
                        通过
                      </button>
                      <button
                        class="btn btn--sm btn--danger"
                        @click=${() => props.onReject(request.id)}
                      >
                        拒绝
                      </button>
                    `
                    : nothing
                }
              </div>
            </div>
          `,
        )}
      </div>
    `;
  };

  return html`
    <div class="approvals-panel">
      ${renderFilter()}
      ${renderBatchActions()}
      ${renderRequests()}
    </div>
  `;
}

/**
 * 获取请求类型标签
 */
function getRequestTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    permission: "权限申请",
    access: "访问申请",
    resource: "资源申请",
  };
  return labels[type] || type;
}

/**
 * 获取状态标签
 */
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "待审批",
    approved: "已通过",
    rejected: "已拒绝",
  };
  return labels[status] || status;
}

/**
 * 审批统计信息
 */
export type ApprovalStatistics = {
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  approvalRate: number;
  averageResponseTime: number;
};

export type ApprovalStatisticsProps = {
  statistics: ApprovalStatistics;
  loading: boolean;
};

/**
 * 渲染审批统计信息
 */
export function renderApprovalStatistics(props: ApprovalStatisticsProps) {
  if (props.loading) {
    return html`
      <div class="loading">加载统计信息中...</div>
    `;
  }

  const { statistics } = props;

  return html`
    <div class="approval-statistics">
      <div class="stat-card">
        <div class="stat-value">${statistics.totalRequests}</div>
        <div class="stat-label">总请求数</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">${statistics.pendingRequests}</div>
        <div class="stat-label">待审批</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">${statistics.approvedRequests}</div>
        <div class="stat-label">已通过</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">${statistics.rejectedRequests}</div>
        <div class="stat-label">已拒绝</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">${(statistics.approvalRate * 100).toFixed(1)}%</div>
        <div class="stat-label">通过率</div>
      </div>

      <div class="stat-card">
        <div class="stat-value">${Math.round(statistics.averageResponseTime / 60000)}分钟</div>
        <div class="stat-label">平均响应时间</div>
      </div>
    </div>
  `;
}
