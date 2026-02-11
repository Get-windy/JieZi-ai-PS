/**
 * 组织与权限管理 (Organization & Permissions Management)
 * 整合：组织架构、权限配置、审批管理、系统管理
 */

import { html, nothing } from "lit";
import { t } from "../i18n.js";

// ============================================================================
// 类型定义
// ============================================================================

export type OrgPermTab = "organization" | "permissions" | "approvals" | "system";

export type OrganizationPermissionsProps = {
  loading: boolean;
  error: string | null;
  activeTab: OrgPermTab;

  // 组织架构数据
  organizationData: OrganizationData | null;
  selectedNodeId: string | null;
  viewMode: "tree" | "list";
  organizationsLoading: boolean;
  organizationsError: string | null;

  // 权限配置数据
  permissionsConfig: PermissionsConfigData | null;
  permissionsLoading: boolean;
  permissionsSaving: boolean;
  selectedOrgForPermission: string | null;
  selectedRole: string | null;

  // 审批管理数据
  approvalRequests: ApprovalRequest[];
  approvalsLoading: boolean;
  approvalStats: ApprovalStats | null;
  approvalsFilter: ApprovalFilter;
  selectedApprovals: Set<string>;
  selectedApprovalDetail: ApprovalRequest | null;

  // 系统管理数据
  superAdmins: SuperAdmin[];
  superAdminsLoading: boolean;
  superAdminsError: string | null;
  systemRoles: SystemRole[];
  auditLogs: AuditLog[];

  // 回调函数
  onRefresh: () => void;
  onTabChange: (tab: OrgPermTab) => void;

  // 组织架构回调
  onSelectNode: (nodeId: string) => void;
  onViewModeChange: (mode: "tree" | "list") => void;
  onCreateOrganization: () => void;
  onEditOrganization: (orgId: string) => void;
  onDeleteOrganization: (orgId: string) => void;
  onCreateTeam: () => void;
  onEditTeam: (teamId: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onAssignMember: (teamId: string, memberId: string) => void;

  // 权限配置回调
  onSelectOrgForPermission: (orgId: string | null) => void;
  onSelectRole: (roleId: string | null) => void;
  onPermissionChange: (target: string, permission: string, granted: boolean) => void;
  onSavePermissions: () => void;
  onCreateRole: () => void;
  onEditRole: (roleId: string) => void;
  onDeleteRole: (roleId: string) => void;
  onCreateTemplate: () => void;
  onApplyTemplate: (templateId: string, target: string) => void;

  // 审批管理回调
  onApprovalAction: (requestId: string, action: "approve" | "deny", comment?: string) => void;
  onBatchApprove: (requestIds: string[], comment?: string) => void;
  onBatchDeny: (requestIds: string[], reason: string) => void;
  onFilterChange: (filter: Partial<ApprovalFilter>) => void;
  onSelectApproval: (requestId: string, selected: boolean) => void;
  onSelectAllApprovals: () => void;
  onDeselectAllApprovals: () => void;
  onShowApprovalDetail: (request: ApprovalRequest | null) => void;

  // 系统管理回调
  onCreateAdmin: () => void;
  onEditAdmin: (adminId: string) => void;
  onActivateAdmin: (adminId: string) => void;
  onDeactivateAdmin: (adminId: string) => void;
  onCreateSystemRole: () => void;
  onEditSystemRole: (roleId: string) => void;
  onDeleteSystemRole: (roleId: string) => void;
};

// 组织架构类型
export type OrganizationData = {
  organizations: Organization[];
  teams: Team[];
  agents: AgentNode[];
  relationships: Relationship[];
  statistics: Statistics;
};

export type Organization = {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  level: number;
  createdAt: number;
  agentCount: number;
  permissions?: string[];
};

export type Team = {
  id: string;
  name: string;
  organizationId: string;
  description?: string;
  leaderId?: string;
  memberIds: string[];
  createdAt: number;
};

export type AgentNode = {
  id: string;
  name: string;
  organizationId?: string;
  teamId?: string;
  role?: string;
  permissionLevel: number;
  identity?: {
    name?: string;
    emoji?: string;
    avatar?: string;
  };
};

export type Relationship = {
  sourceId: string;
  targetId: string;
  type: "reports_to" | "supervises" | "collaborates_with" | "trains";
};

export type Statistics = {
  totalOrganizations: number;
  totalTeams: number;
  totalAgents: number;
  averageTeamSize: number;
  permissionDistribution: Record<string, number>;
};

// 权限配置类型
export type PermissionsConfigData = {
  organizationPermissions: OrganizationPermission[];
  roles: Role[];
  agentPermissions: AgentPermission[];
  templates: PermissionTemplate[];
};

export type OrganizationPermission = {
  organizationId: string;
  permissions: string[];
  inheritFromParent: boolean;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  level: number;
};

export type AgentPermission = {
  agentId: string;
  permissions: string[];
  role?: string;
  organizationId?: string;
};

export type PermissionTemplate = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  targetType: "organization" | "role" | "agent";
};

// 审批管理类型
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

// 系统管理类型
export type SuperAdmin = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  isOnline: boolean;
  lastLoginAt?: number;
};

export type SystemRole = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystemRole: boolean;
};

export type AuditLog = {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  action: string;
  target: string;
  result: "success" | "failure";
  details?: string;
};

// ============================================================================
// 主渲染函数
// ============================================================================

export function renderOrganizationPermissions(props: OrganizationPermissionsProps) {
  return html`
    <div class="org-perm-container">
      ${renderHeader(props)}
      ${renderTabs(props)}
      ${renderTabContent(props)}
    </div>
  `;
}

// ============================================================================
// 页面头部
// ============================================================================

function renderHeader(props: OrganizationPermissionsProps) {
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">📋 组织与权限管理</div>
          <div class="card-sub">统一管理组织架构、权限配置、审批流程和系统设置</div>
        </div>
        <button
          class="btn btn--sm"
          @click=${props.onRefresh}
          ?disabled=${props.loading}
        >
          ${props.loading ? "刷新中..." : "🔄 刷新"}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// 标签页导航
// ============================================================================

function renderTabs(props: OrganizationPermissionsProps) {
  const tabs: Array<{ id: OrgPermTab; label: string; icon: string }> = [
    { id: "organization", label: "组织架构", icon: "📊" },
    { id: "permissions", label: "权限配置", icon: "🔐" },
    { id: "approvals", label: "审批管理", icon: "📝" },
    { id: "system", label: "系统管理", icon: "👑" },
  ];

  return html`
    <div class="card" style="margin-bottom: 16px; padding: 8px;">
      <div class="row" style="gap: 4px;">
        ${tabs.map(
          (tab) => html`
            <button
              class="btn ${props.activeTab === tab.id ? "btn--primary" : ""}"
              style="flex: 1;"
              @click=${() => props.onTabChange(tab.id)}
            >
              ${tab.icon} ${tab.label}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

// ============================================================================
// 标签页内容
// ============================================================================

function renderTabContent(props: OrganizationPermissionsProps) {
  if (props.loading) {
    return html`
      <div class="card"><div class="loading">加载中...</div></div>
    `;
  }

  if (props.error) {
    return html`<div class="card"><div class="error">${props.error}</div></div>`;
  }

  switch (props.activeTab) {
    case "organization":
      return renderOrganizationTab(props);
    case "permissions":
      return renderPermissionsTab(props);
    case "approvals":
      return renderApprovalsTab(props);
    case "system":
      return renderSystemTab(props);
    default:
      return nothing;
  }
}

// ============================================================================
// 1. 组织架构标签页
// ============================================================================

function renderOrganizationTab(props: OrganizationPermissionsProps) {
  return html`
    <div class="org-tab">
      ${renderOrgActions(props)}
      ${renderOrgStatistics(props)}
      ${renderOrgContent(props)}
    </div>
  `;
}

function renderOrgActions(props: OrganizationPermissionsProps) {
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div class="row" style="gap: 8px;">
          <button
            class="btn btn--sm ${props.viewMode === "tree" ? "btn--primary" : ""}"
            @click=${() => props.onViewModeChange("tree")}
          >
            🌳 树形视图
          </button>
          <button
            class="btn btn--sm ${props.viewMode === "list" ? "btn--primary" : ""}"
            @click=${() => props.onViewModeChange("list")}
          >
            📋 列表视图
          </button>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm btn--primary" @click=${props.onCreateOrganization}>
            ➕ 创建组织
          </button>
          <button class="btn btn--sm btn--primary" @click=${props.onCreateTeam}>
            ➕ 创建团队
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderOrgStatistics(props: OrganizationPermissionsProps) {
  if (!props.organizationData) {
    return nothing;
  }

  const stats = props.organizationData.statistics;
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="row" style="gap: 16px;">
        <div style="flex: 1; text-align: center;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">组织数量</div>
          <div style="font-size: 1.5rem; font-weight: 600;">${stats.totalOrganizations}</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">团队数量</div>
          <div style="font-size: 1.5rem; font-weight: 600;">${stats.totalTeams}</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">助手数量</div>
          <div style="font-size: 1.5rem; font-weight: 600;">${stats.totalAgents}</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">平均团队规模</div>
          <div style="font-size: 1.5rem; font-weight: 600;">${stats.averageTeamSize.toFixed(1)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderOrgContent(props: OrganizationPermissionsProps) {
  if (props.organizationsLoading) {
    return html`
      <div class="card"><div class="loading">加载组织数据...</div></div>
    `;
  }

  if (props.organizationsError) {
    return html`<div class="card"><div class="error">${props.organizationsError}</div></div>`;
  }

  if (!props.organizationData) {
    return html`
      <div class="card"><div class="muted">暂无组织数据</div></div>
    `;
  }

  return props.viewMode === "tree" ? renderOrgTreeView(props) : renderOrgListView(props);
}

function renderOrgTreeView(props: OrganizationPermissionsProps) {
  const data = props.organizationData!;
  const rootOrgs = data.organizations.filter((org) => !org.parentId);

  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px;">🌳 组织架构树</div>
      <div style="padding-left: 16px;">
        ${rootOrgs.map((org) => renderOrgTreeNode(org, data, props, 0))}
      </div>
    </div>
  `;
}

function renderOrgTreeNode(
  org: Organization,
  data: OrganizationData,
  props: OrganizationPermissionsProps,
  depth: number,
) {
  const children = data.organizations.filter((o) => o.parentId === org.id);
  const teams = data.teams.filter((t) => t.organizationId === org.id);
  const isSelected = props.selectedNodeId === org.id;

  return html`
    <div style="margin-bottom: 8px;">
      <div
        class="list-item ${isSelected ? "selected" : ""}"
        style="padding: 12px; cursor: pointer; border-radius: 6px; background: ${isSelected ? "var(--bg-2)" : "var(--bg-1)"};"
        @click=${() => props.onSelectNode(org.id)}
      >
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 500;">
              ${"  ".repeat(depth)}🏢 ${org.name}
              ${org.description ? html`<span class="muted" style="margin-left: 8px; font-size: 0.875rem;">${org.description}</span>` : nothing}
            </div>
            <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
              ${"  ".repeat(depth)}助手: ${org.agentCount} | 团队: ${teams.length}
            </div>
          </div>
          <div class="row" style="gap: 8px;">
            <button
              class="btn btn--sm"
              @click=${(e: Event) => {
                e.stopPropagation();
                props.onEditOrganization(org.id);
              }}
            >
              ✏️ 编辑
            </button>
            <button
              class="btn btn--sm btn--danger"
              @click=${(e: Event) => {
                e.stopPropagation();
                if (confirm(`确定删除组织 "${org.name}" 吗？`)) {
                  props.onDeleteOrganization(org.id);
                }
              }}
            >
              🗑️ 删除
            </button>
          </div>
        </div>
      </div>

      ${
        teams.length > 0
          ? html`
            <div style="padding-left: 32px; margin-top: 8px;">
              ${teams.map((team) => renderTeamNode(team, props))}
            </div>
          `
          : nothing
      }
      
      ${
        children.length > 0
          ? html`
            <div style="padding-left: 32px; margin-top: 8px;">
              ${children.map((child) => renderOrgTreeNode(child, data, props, depth + 1))}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

function renderTeamNode(team: Team, props: OrganizationPermissionsProps) {
  const isSelected = props.selectedNodeId === team.id;

  return html`
    <div
      class="list-item ${isSelected ? "selected" : ""}"
      style="padding: 10px; cursor: pointer; border-radius: 6px; background: ${isSelected ? "var(--bg-2)" : "var(--bg-1)"}; margin-bottom: 8px;"
      @click=${() => props.onSelectNode(team.id)}
    >
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 500;">👥 ${team.name}</div>
          <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
            成员: ${team.memberIds.length}
            ${team.leaderId ? html` | 负责人: ${team.leaderId}` : nothing}
          </div>
        </div>
        <div class="row" style="gap: 8px;">
          <button
            class="btn btn--sm"
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onEditTeam(team.id);
            }}
          >
            ✏️ 编辑
          </button>
          <button
            class="btn btn--sm btn--danger"
            @click=${(e: Event) => {
              e.stopPropagation();
              if (confirm(`确定删除团队 "${team.name}" 吗？`)) {
                props.onDeleteTeam(team.id);
              }
            }}
          >
            🗑️ 删除
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderOrgListView(props: OrganizationPermissionsProps) {
  const data = props.organizationData!;

  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px;">📋 组织列表</div>
      
      <div style="margin-bottom: 24px;">
        <div style="font-weight: 500; margin-bottom: 12px;">🏢 组织</div>
        ${
          data.organizations.length === 0
            ? html`
                <div class="muted">暂无组织</div>
              `
            : html`
              <div style="display: grid; gap: 8px;">
                ${data.organizations.map(
                  (org) => html`
                    <div class="list-item" style="padding: 12px; border-radius: 6px; background: var(--bg-1);">
                      <div class="row" style="justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                          <div style="font-weight: 500;">${org.name}</div>
                          <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                            ${org.description || "无描述"} | 助手: ${org.agentCount}
                          </div>
                        </div>
                        <div class="row" style="gap: 8px;">
                          <button class="btn btn--sm" @click=${() => props.onEditOrganization(org.id)}>✏️</button>
                          <button
                            class="btn btn--sm btn--danger"
                            @click=${() => {
                              if (confirm(`确定删除组织 "${org.name}" 吗？`)) {
                                props.onDeleteOrganization(org.id);
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  `,
                )}
              </div>
            `
        }
      </div>

      <div>
        <div style="font-weight: 500; margin-bottom: 12px;">👥 团队</div>
        ${
          data.teams.length === 0
            ? html`
                <div class="muted">暂无团队</div>
              `
            : html`
              <div style="display: grid; gap: 8px;">
                ${data.teams.map(
                  (team) => html`
                    <div class="list-item" style="padding: 12px; border-radius: 6px; background: var(--bg-1);">
                      <div class="row" style="justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                          <div style="font-weight: 500;">${team.name}</div>
                          <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                            ${team.description || "无描述"} | 成员: ${team.memberIds.length}
                          </div>
                        </div>
                        <div class="row" style="gap: 8px;">
                          <button class="btn btn--sm" @click=${() => props.onEditTeam(team.id)}>✏️</button>
                          <button
                            class="btn btn--sm btn--danger"
                            @click=${() => {
                              if (confirm(`确定删除团队 "${team.name}" 吗？`)) {
                                props.onDeleteTeam(team.id);
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  `,
                )}
              </div>
            `
        }
      </div>
    </div>
  `;
}

// ============================================================================
// 2. 权限配置标签页
// ============================================================================

function renderPermissionsTab(props: OrganizationPermissionsProps) {
  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px">🔐 权限配置（开发中）</div>
      <div class="muted">
        <p>此功能正在开发中，将包含：</p>
        <ul style="margin-top: 8px; padding-left: 20px">
          <li>组织级权限配置</li>
          <li>角色权限管理</li>
          <li>助手权限配置</li>
          <li>权限模板管理</li>
        </ul>
      </div>
    </div>
  `;
}

// ============================================================================
// 3. 审批管理标签页
// ============================================================================

function renderApprovalsTab(props: OrganizationPermissionsProps) {
  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px">📝 审批管理（开发中）</div>
      <div class="muted">
        <p>此功能正在开发中，将包含：</p>
        <ul style="margin-top: 8px; padding-left: 20px">
          <li>待审批请求列表</li>
          <li>审批历史记录</li>
          <li>审批统计信息</li>
          <li>批量审批操作</li>
        </ul>
      </div>
    </div>
  `;
}

// ============================================================================
// 4. 系统管理标签页
// ============================================================================

function renderSystemTab(props: OrganizationPermissionsProps) {
  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px">👑 系统管理（开发中）</div>
      <div class="muted">
        <p>此功能正在开发中，将包含：</p>
        <ul style="margin-top: 8px; padding-left: 20px">
          <li>超级管理员管理</li>
          <li>系统角色配置</li>
          <li>安全策略设置</li>
          <li>审计日志查看</li>
        </ul>
      </div>
    </div>
  `;
}
