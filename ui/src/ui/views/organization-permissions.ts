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
  if (props.permissionsLoading) {
    return html`
      <div class="card"><div class="loading">加载权限配置...</div></div>
    `;
  }

  return html`
    <div class="permissions-tab">
      ${renderPermissionsHeader(props)}
      ${renderPermissionsContent(props)}
    </div>
  `;
}

function renderPermissionsHeader(props: OrganizationPermissionsProps) {
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">🔐 权限配置管理</div>
          <div class="card-sub">配置组织、角色和智能助手的权限</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm btn--primary" @click=${props.onCreateRole}>
            ➕ 创建角色
          </button>
          <button class="btn btn--sm btn--primary" @click=${props.onCreateTemplate}>
            📋 创建模板
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderPermissionsContent(props: OrganizationPermissionsProps) {
  return html`
    <div class="row" style="gap: 16px; align-items: flex-start;">
      <!-- 左侧：选择区域 -->
      <div style="flex: 0 0 300px;">
        ${renderPermissionsSelector(props)}
      </div>
      
      <!-- 右侧：权限配置区域 -->
      <div style="flex: 1;">
        ${renderPermissionsConfigArea(props)}
      </div>
    </div>
  `;
}

function renderPermissionsSelector(props: OrganizationPermissionsProps) {
  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px;">选择配置对象</div>
      
      <!-- 组织选择 -->
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">🏢 组织</label>
        <select
          class="form-control"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;"
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            props.onSelectOrgForPermission(target.value || null);
          }}
        >
          <option value="">选择组织...</option>
          ${props.organizationData?.organizations.map(
            (org) => html`
              <option value=${org.id} ?selected=${org.id === props.selectedOrgForPermission}>
                ${org.name}
              </option>
            `,
          )}
        </select>
      </div>
      
      <!-- 角色列表 -->
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label style="font-weight: 500;">👤 角色</label>
          <button class="btn btn--xs" @click=${props.onCreateRole} style="font-size: 11px; padding: 2px 8px;">➕</button>
        </div>
        <div style="max-height: 250px; overflow-y: auto;">
          ${props.permissionsConfig?.roles.map(
            (role) => html`
              <div
                class="list-item ${props.selectedRole === role.id ? 'selected' : ''}"
                style="padding: 8px; cursor: pointer; border-radius: 6px; margin-bottom: 4px; background: ${props.selectedRole === role.id ? 'var(--bg-2)' : 'var(--bg-1)'};" 
                @click=${() => props.onSelectRole(role.id)}
              >
                <div style="font-weight: 500; font-size: 0.875rem;">${role.name}</div>
                <div class="muted" style="font-size: 0.75rem; margin-top: 2px;">等级 ${role.level}</div>
              </div>
            `,
          ) || html`<div class="muted" style="text-align: center; padding: 16px;">暂无角色</div>`}
        </div>
      </div>
      
      <!-- 智能助手选择 -->
      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">🤖 智能助手</label>
        <select
          class="form-control"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;"
        >
          <option value="">选择助手...</option>
          ${props.organizationData?.agents.map(
            (agent) => html`
              <option value=${agent.id}>${agent.name}</option>
            `,
          )}
        </select>
      </div>
    </div>
  `;
}

function renderPermissionsConfigArea(props: OrganizationPermissionsProps) {
  if (!props.selectedOrgForPermission && !props.selectedRole) {
    return html`
      <div class="card">
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
          <div>请选择组织或角色以配置权限</div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px;">
        ${props.selectedRole ? `角色权限配置` : '组织权限配置'}
        ${props.selectedRole
          ? html`<span class="muted" style="margin-left: 8px; font-size: 0.875rem;">
              ${props.permissionsConfig?.roles.find((r) => r.id === props.selectedRole)?.name}
            </span>`
          : nothing}
      </div>
      
      ${renderPermissionGroups(props)}
      
      <div class="row" style="gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
        <button
          class="btn btn--primary"
          @click=${props.onSavePermissions}
          ?disabled=${props.permissionsSaving}
        >
          ${props.permissionsSaving ? '保存中...' : '💾 保存权限配置'}
        </button>
        <button class="btn" @click=${() => props.onSelectRole(null)}>
          取消
        </button>
      </div>
    </div>
  `;
}

function renderPermissionGroups(props: OrganizationPermissionsProps) {
  const permissionGroups = [
    {
      id: 'basic',
      label: '基础权限',
      permissions: [
        { id: 'read', label: '读取数据', description: '查看组织和团队信息' },
        { id: 'write', label: '编辑数据', description: '修改组织和团队配置' },
        { id: 'create', label: '创建资源', description: '创建新的组织、团队或智能助手' },
        { id: 'delete', label: '删除资源', description: '删除组织、团队或智能助手' },
      ],
    },
    {
      id: 'tools',
      label: '工具权限',
      permissions: [
        { id: 'exec', label: '执行命令', description: '运行系统命令和脚本' },
        { id: 'file_access', label: '文件访问', description: '读写文件系统' },
        { id: 'web_search', label: '网络搜索', description: '使用网络搜索工具' },
        { id: 'browser', label: '浏览器控制', description: '控制浏览器操作' },
      ],
    },
    {
      id: 'communication',
      label: '通信权限',
      permissions: [
        { id: 'send_message', label: '发送消息', description: '向用户或其他智能助手发送消息' },
        { id: 'receive_message', label: '接收消息', description: '接收来自用户或其他智能助手的消息' },
        { id: 'call_api', label: 'API 调用', description: '调用外部 API 服务' },
      ],
    },
    {
      id: 'admin',
      label: '管理权限',
      permissions: [
        { id: 'manage_users', label: '用户管理', description: '管理用户账号和权限' },
        { id: 'manage_roles', label: '角色管理', description: '创建和修改角色' },
        { id: 'system_config', label: '系统配置', description: '修改系统级配置' },
        { id: 'audit_log', label: '审计日志', description: '查看系统审计日志' },
      ],
    },
  ];

  // 获取当前已选权限
  const currentPermissions = props.selectedRole
    ? props.permissionsConfig?.roles.find((r) => r.id === props.selectedRole)?.permissions || []
    : [];

  return html`
    <div style="display: grid; gap: 24px;">
      ${permissionGroups.map(
        (group) => html`
          <div>
            <div style="font-weight: 600; margin-bottom: 12px; color: var(--text-1);">
              ${group.label}
            </div>
            <div style="display: grid; gap: 12px;">
              ${group.permissions.map(
                (perm) => html`
                  <label
                    class="checkbox-label"
                    style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-radius: 6px; background: var(--bg-1); cursor: pointer;"
                  >
                    <input
                      type="checkbox"
                      style="margin-top: 2px;"
                      ?checked=${currentPermissions.includes(perm.id)}
                      @change=${(e: Event) => {
                        const target = e.target as HTMLInputElement;
                        props.onPermissionChange(props.selectedRole || props.selectedOrgForPermission || '', perm.id, target.checked);
                      }}
                    />
                    <div style="flex: 1;">
                      <div style="font-weight: 500; font-size: 0.875rem;">${perm.label}</div>
                      <div class="muted" style="font-size: 0.75rem; margin-top: 4px;">${perm.description}</div>
                    </div>
                  </label>
                `,
              )}
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

// ============================================================================
// 3. 审批管理标签页
// ============================================================================

function renderApprovalsTab(props: OrganizationPermissionsProps) {
  return html`
    <div class="approvals-tab">
      ${renderApprovalsStats(props)}
      ${renderApprovalsFilter(props)}
      ${renderApprovalsList(props)}
    </div>
  `;
}

function renderApprovalsStats(props: OrganizationPermissionsProps) {
  if (!props.approvalStats) {
    return nothing;
  }

  const stats = props.approvalStats;
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-title" style="margin-bottom: 16px;">📊 审批统计</div>
      <div class="row" style="gap: 16px;">
        <div style="flex: 1; text-align: center; padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">待审批</div>
          <div style="font-size: 1.5rem; font-weight: 600; color: #ff9800;">${stats.totalPending}</div>
        </div>
        <div style="flex: 1; text-align: center; padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">已通过</div>
          <div style="font-size: 1.5rem; font-weight: 600; color: #4caf50;">${stats.totalApproved}</div>
        </div>
        <div style="flex: 1; text-align: center; padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">已拒绝</div>
          <div style="font-size: 1.5rem; font-weight: 600; color: #f44336;">${stats.totalDenied}</div>
        </div>
        <div style="flex: 1; text-align: center; padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">已过期</div>
          <div style="font-size: 1.5rem; font-weight: 600; color: #9e9e9e;">${stats.totalExpired}</div>
        </div>
        ${stats.expiringWithin1Hour > 0
          ? html`
            <div style="flex: 1; text-align: center; padding: 12px; border-radius: 6px; background: #fff3e0; border: 1px solid #ff9800;">
              <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">即将过期</div>
              <div style="font-size: 1.5rem; font-weight: 600; color: #ff9800;">${stats.expiringWithin1Hour}</div>
            </div>
          `
          : nothing}
      </div>
    </div>
  `;
}

function renderApprovalsFilter(props: OrganizationPermissionsProps) {
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="row" style="gap: 12px; align-items: center; flex-wrap: wrap;">
        <!-- 状态筛选 -->
        <div style="flex: 1; min-width: 150px;">
          <label style="display: block; font-size: 0.75rem; margin-bottom: 4px; color: var(--muted);">状态</label>
          <select
            class="form-control"
            style="width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.875rem;"
            .value=${props.approvalsFilter.status}
            @change=${(e: Event) => {
              const target = e.target as HTMLSelectElement;
              props.onFilterChange({ status: target.value as ApprovalFilter['status'] });
            }}
          >
            <option value="all">全部</option>
            <option value="pending">待审批</option>
            <option value="approved">已通过</option>
            <option value="denied">已拒绝</option>
            <option value="expired">已过期</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
        
        <!-- 搜索 -->
        <div style="flex: 2; min-width: 200px;">
          <label style="display: block; font-size: 0.75rem; margin-bottom: 4px; color: var(--muted);">搜索</label>
          <input
            type="text"
            class="form-control"
            style="width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.875rem;"
            placeholder="搜索申请人、目标对象..."
            .value=${props.approvalsFilter.search}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onFilterChange({ search: target.value });
            }}
          />
        </div>
        
        <!-- 批量操作 -->
        ${props.selectedApprovals.size > 0
          ? html`
            <div class="row" style="gap: 8px; margin-left: auto;">
              <button
                class="btn btn--sm btn--primary"
                @click=${() => {
                  const comment = prompt('批准备注（可选）：');
                  props.onBatchApprove(Array.from(props.selectedApprovals), comment || undefined);
                }}
              >
                ✅ 批量通过 (${props.selectedApprovals.size})
              </button>
              <button
                class="btn btn--sm btn--danger"
                @click=${() => {
                  const reason = prompt('拒绝原因：');
                  if (reason) {
                    props.onBatchDeny(Array.from(props.selectedApprovals), reason);
                  }
                }}
              >
                ❌ 批量拒绝 (${props.selectedApprovals.size})
              </button>
              <button
                class="btn btn--sm"
                @click=${props.onDeselectAllApprovals}
              >
                取消选择
              </button>
            </div>
          `
          : nothing}
      </div>
    </div>
  `;
}

function renderApprovalsList(props: OrganizationPermissionsProps) {
  if (props.approvalsLoading) {
    return html`
      <div class="card"><div class="loading">加载审批请求...</div></div>
    `;
  }

  if (props.approvalRequests.length === 0) {
    return html`
      <div class="card">
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
          <div>暂无审批请求</div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="card">
      <!-- 全选 -->
      <div style="padding: 12px; border-bottom: 1px solid var(--border);">
        <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px;">
          <input
            type="checkbox"
            ?checked=${props.selectedApprovals.size === props.approvalRequests.length}
            @change=${props.onSelectAllApprovals}
          />
          <span style="font-weight: 500;">全选</span>
        </label>
      </div>
      
      <!-- 审批列表 -->
      <div style="display: grid; gap: 1px;">
        ${props.approvalRequests.map(
          (request) => renderApprovalCard(request, props),
        )}
      </div>
    </div>
  `;
}

function renderApprovalCard(request: ApprovalRequest, props: OrganizationPermissionsProps) {
  const isSelected = props.selectedApprovals.has(request.id);
  const statusColors = {
    pending: '#ff9800',
    approved: '#4caf50',
    denied: '#f44336',
    timeout: '#9e9e9e',
    cancelled: '#9e9e9e',
  };
  const statusLabels = {
    pending: '待审批',
    approved: '已通过',
    denied: '已拒绝',
    timeout: '已过期',
    cancelled: '已取消',
  };

  const timeRemaining = request.expiresAt - Date.now();
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const isExpiringSoon = request.status === 'pending' && hoursRemaining < 1;

  return html`
    <div
      class="list-item ${isSelected ? 'selected' : ''}"
      style="padding: 16px; border-bottom: 1px solid var(--border); background: ${isSelected ? 'var(--bg-2)' : 'transparent'}; ${isExpiringSoon ? 'border-left: 3px solid #ff9800;' : ''}"
    >
      <div class="row" style="gap: 12px; align-items: flex-start;">
        <!-- 选择框 -->
        ${request.status === 'pending'
          ? html`
            <input
              type="checkbox"
              style="margin-top: 4px;"
              ?checked=${isSelected}
              @change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                props.onSelectApproval(request.id, target.checked);
              }}
            />
          `
          : nothing}
        
        <!-- 内容区域 -->
        <div style="flex: 1;">
          <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div class="row" style="gap: 8px; align-items: center;">
              <span style="font-weight: 600;">${request.type}</span>
              <span
                style="padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background: ${statusColors[request.status]}20; color: ${statusColors[request.status]};"
              >
                ${statusLabels[request.status]}
              </span>
              ${isExpiringSoon
                ? html`
                  <span
                    style="padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background: #ff980020; color: #ff9800;"
                  >
                    ❗ 即将过期
                  </span>
                `
                : nothing}
            </div>
            <div class="muted" style="font-size: 0.75rem;">
              ${new Date(request.createdAt).toLocaleString('zh-CN')}
            </div>
          </div>
          
          <div style="margin-bottom: 8px;">
            <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">
              申请人: <strong>${request.requesterName}</strong> (${request.requesterType === 'agent' ? '智能助手' : '用户'})
            </div>
            ${request.targetName
              ? html`
                <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">
                  目标: <strong>${request.targetName}</strong>
                </div>
              `
              : nothing}
            <div style="font-size: 0.875rem;">
              理由: ${request.reason}
            </div>
          </div>
          
          ${request.approver
            ? html`
              <div style="padding: 8px; border-radius: 6px; background: var(--bg-1); font-size: 0.875rem;">
                <div class="muted">审批人: <strong>${request.approver.name}</strong></div>
                ${request.approver.comment
                  ? html`<div class="muted" style="margin-top: 4px;">备注: ${request.approver.comment}</div>`
                  : nothing}
              </div>
            `
            : nothing}
        </div>
        
        <!-- 操作按钮 -->
        ${request.status === 'pending'
          ? html`
            <div class="row" style="gap: 8px;">
              <button
                class="btn btn--sm btn--primary"
                @click=${() => {
                  const comment = prompt('批准备注（可选）：');
                  props.onApprovalAction(request.id, 'approve', comment || undefined);
                }}
              >
                ✅ 通过
              </button>
              <button
                class="btn btn--sm btn--danger"
                @click=${() => {
                  const reason = prompt('拒绝原因：');
                  if (reason) {
                    props.onApprovalAction(request.id, 'deny', reason);
                  }
                }}
              >
                ❌ 拒绝
              </button>
              <button
                class="btn btn--sm"
                @click=${() => props.onShowApprovalDetail(request)}
              >
                🔍 详情
              </button>
            </div>
          `
          : html`
            <button
              class="btn btn--sm"
              @click=${() => props.onShowApprovalDetail(request)}
            >
              🔍 查看
            </button>
          `}
      </div>
    </div>
  `;
}

// ============================================================================
// 4. 系统管理标签页
// ============================================================================

function renderSystemTab(props: OrganizationPermissionsProps) {
  return html`
    <div class="system-tab">
      ${renderSuperAdminSection(props)}
      ${renderSystemRolesSection(props)}
      ${renderAuditLogSection(props)}
    </div>
  `;
}

function renderSuperAdminSection(props: OrganizationPermissionsProps) {
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <div class="card-title">👑 超级管理员</div>
          <div class="card-sub">管理具有最高权限的超级管理员账户</div>
        </div>
        <button class="btn btn--sm btn--primary" @click=${props.onCreateAdmin}>
          ➕ 添加管理员
        </button>
      </div>
      
      ${props.superAdminsLoading
        ? html`<div class="loading">加载管理员列表...</div>`
        : props.superAdminsError
          ? html`<div class="error">${props.superAdminsError}</div>`
          : html`
            <div style="display: grid; gap: 12px;">
              ${props.superAdmins.map(
                (admin) => html`
                  <div
                    class="list-item"
                    style="padding: 12px; border-radius: 6px; background: var(--bg-1);"
                  >
                    <div class="row" style="justify-content: space-between; align-items: center;">
                      <div class="row" style="gap: 12px; align-items: center; flex: 1;">
                        <!-- 头像 -->
                        <div
                          style="width: 40px; height: 40px; border-radius: 50%; background: ${admin.isActive ? '#4caf50' : '#9e9e9e'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; position: relative;"
                        >
                          ${admin.name.substring(0, 1).toUpperCase()}
                          ${admin.isOnline
                            ? html`
                              <div
                                style="position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; border-radius: 50%; background: #4caf50; border: 2px solid white;"
                              ></div>
                            `
                            : nothing}
                        </div>
                        
                        <!-- 信息 -->
                        <div style="flex: 1;">
                          <div style="font-weight: 600;">
                            ${admin.name}
                            ${admin.mfaEnabled
                              ? html`
                                <span
                                  style="margin-left: 8px; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; background: #4caf5020; color: #4caf50;"
                                >
                                  🔒 MFA
                                </span>
                              `
                              : nothing}
                          </div>
                          <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                            ${admin.email} | ${admin.role}
                            ${admin.lastLoginAt
                              ? html` | 最后登录: ${new Date(admin.lastLoginAt).toLocaleString('zh-CN')}`
                              : nothing}
                          </div>
                        </div>
                        
                        <!-- 状态 -->
                        <div
                          style="padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background: ${admin.isActive ? '#4caf5020' : '#9e9e9e20'}; color: ${admin.isActive ? '#4caf50' : '#9e9e9e'};"
                        >
                          ${admin.isActive ? '激活' : '禁用'}
                        </div>
                      </div>
                      
                      <!-- 操作 -->
                      <div class="row" style="gap: 8px;">
                        <button
                          class="btn btn--sm"
                          @click=${() => props.onEditAdmin(admin.id)}
                        >
                          ⚙️ 配置
                        </button>
                        ${admin.isActive
                          ? html`
                            <button
                              class="btn btn--sm btn--danger"
                              @click=${() => {
                                if (confirm(`确定禁用管理员 "${admin.name}" 吗？`)) {
                                  props.onDeactivateAdmin(admin.id);
                                }
                              }}
                            >
                              🚫 禁用
                            </button>
                          `
                          : html`
                            <button
                              class="btn btn--sm btn--primary"
                              @click=${() => props.onActivateAdmin(admin.id)}
                            >
                              ✅ 激活
                            </button>
                          `}
                      </div>
                    </div>
                  </div>
                `,
              )}
              ${props.superAdmins.length === 0
                ? html`
                  <div style="text-align: center; padding: 40px; color: var(--muted);">
                    <div style="font-size: 48px; margin-bottom: 16px;">👑</div>
                    <div>暂无超级管理员</div>
                  </div>
                `
                : nothing}
            </div>
          `}
    </div>
  `;
}

function renderSystemRolesSection(props: OrganizationPermissionsProps) {
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <div class="card-title">🎭 系统角色</div>
          <div class="card-sub">管理系统级别的角色权限配置</div>
        </div>
        <button class="btn btn--sm btn--primary" @click=${props.onCreateSystemRole}>
          ➕ 创建角色
        </button>
      </div>
      
      <div style="display: grid; gap: 12px;">
        ${props.systemRoles.map(
          (role) => html`
            <div
              class="list-item"
              style="padding: 12px; border-radius: 6px; background: var(--bg-1); ${role.isSystemRole ? 'border-left: 3px solid #2196f3;' : ''}"
            >
              <div class="row" style="justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                  <div style="font-weight: 600;">
                    ${role.name}
                    ${role.isSystemRole
                      ? html`
                        <span
                          style="margin-left: 8px; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; background: #2196f320; color: #2196f3;"
                        >
                          💼 系统角色
                        </span>
                      `
                      : nothing}
                  </div>
                  <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                    ${role.description}
                  </div>
                  <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">
                    ${role.permissions.slice(0, 5).map(
                      (perm) => html`
                        <span
                          style="padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; background: var(--bg-2); color: var(--text-2);"
                        >
                          ${perm}
                        </span>
                      `,
                    )}
                    ${role.permissions.length > 5
                      ? html`
                        <span class="muted" style="font-size: 0.75rem;">
                          +${role.permissions.length - 5} 更多
                        </span>
                      `
                      : nothing}
                  </div>
                </div>
                
                <div class="row" style="gap: 8px;">
                  <button
                    class="btn btn--sm"
                    @click=${() => props.onEditSystemRole(role.id)}
                  >
                    ⚙️ 配置
                  </button>
                  ${!role.isSystemRole
                    ? html`
                      <button
                        class="btn btn--sm btn--danger"
                        @click=${() => {
                          if (confirm(`确定删除角色 "${role.name}" 吗？`)) {
                            props.onDeleteSystemRole(role.id);
                          }
                        }}
                      >
                        🗑️ 删除
                      </button>
                    `
                    : nothing}
                </div>
              </div>
            </div>
          `,
        )}
        ${props.systemRoles.length === 0
          ? html`
            <div style="text-align: center; padding: 40px; color: var(--muted);">
              <div style="font-size: 48px; margin-bottom: 16px;">🎭</div>
              <div>暂无系统角色</div>
            </div>
          `
          : nothing}
      </div>
    </div>
  `;
}

function renderAuditLogSection(props: OrganizationPermissionsProps) {
  return html`
    <div class="card">
      <div class="card-title" style="margin-bottom: 16px;">📋 审计日志</div>
      
      ${props.auditLogs.length === 0
        ? html`
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
            <div>暂无审计日志</div>
          </div>
        `
        : html`
          <div style="max-height: 400px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
              <thead style="position: sticky; top: 0; background: var(--bg-1); z-index: 1;">
                <tr style="border-bottom: 1px solid var(--border);">
                  <th style="padding: 8px; text-align: left; font-weight: 600;">时间</th>
                  <th style="padding: 8px; text-align: left; font-weight: 600;">用户</th>
                  <th style="padding: 8px; text-align: left; font-weight: 600;">操作</th>
                  <th style="padding: 8px; text-align: left; font-weight: 600;">目标</th>
                  <th style="padding: 8px; text-align: center; font-weight: 600;">结果</th>
                </tr>
              </thead>
              <tbody>
                ${props.auditLogs.map(
                  (log) => html`
                    <tr
                      style="border-bottom: 1px solid var(--border); ${log.result === 'failure' ? 'background: #f4433620;' : ''}"
                    >
                      <td style="padding: 8px; color: var(--muted);">
                        ${new Date(log.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style="padding: 8px;">${log.userName}</td>
                      <td style="padding: 8px; font-weight: 500;">${log.action}</td>
                      <td style="padding: 8px; color: var(--muted);">${log.target}</td>
                      <td style="padding: 8px; text-align: center;">
                        <span
                          style="padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background: ${log.result === 'success' ? '#4caf5020' : '#f4433620'}; color: ${log.result === 'success' ? '#4caf50' : '#f44336'};"
                        >
                          ${log.result === 'success' ? '✅ 成功' : '❌ 失败'}
                        </span>
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `}
    </div>
  `;
}
