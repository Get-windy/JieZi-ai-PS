/**
 * 组织架构图 (Organization Chart)
 * Phase 5: Web UI - 组织架构可视化
 */

import { html, nothing } from "lit";
import { t } from "../i18n.js";

export type OrganizationChartProps = {
  loading: boolean;
  error: string | null;
  organizationData: OrganizationData | null;
  selectedNodeId: string | null;
  viewMode: "tree" | "list";

  // 回调函数
  onRefresh: () => void;
  onSelectNode: (nodeId: string) => void;
  onViewModeChange: (mode: "tree" | "list") => void;
};

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

/**
 * 渲染组织架构图
 */
export function renderOrganizationChart(props: OrganizationChartProps) {
  return html`
    <div class="organization-chart-container">
      ${renderHeader(props)}
      ${renderContent(props)}
    </div>
  `;
}

/**
 * 渲染页面标题
 */
function renderHeader(props: OrganizationChartProps) {
  return html`
    <div class="organization-chart-header">
      <div class="header-title">
        <h1>${t("organization_chart.title")}</h1>
        <p class="subtitle">${t("organization_chart.subtitle")}</p>
      </div>
      <div class="header-actions">
        <div class="view-mode-toggle">
          <button
            class="btn-view-mode ${props.viewMode === "tree" ? "active" : ""}"
            @click=${() => props.onViewModeChange("tree")}
          >
            ${t("organization_chart.view_mode.tree")}
          </button>
          <button
            class="btn-view-mode ${props.viewMode === "list" ? "active" : ""}"
            @click=${() => props.onViewModeChange("list")}
          >
            ${t("organization_chart.view_mode.list")}
          </button>
        </div>
        <button
          class="btn-refresh"
          @click=${props.onRefresh}
          ?disabled=${props.loading}
        >
          ${t("organization_chart.refresh")}
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染主要内容区域
 */
function renderContent(props: OrganizationChartProps) {
  if (props.loading) {
    return html`<div class="loading">${t("organization_chart.loading")}</div>`;
  }

  if (props.error) {
    return html`<div class="error">${props.error}</div>`;
  }

  if (!props.organizationData) {
    return html`<div class="empty">${t("organization_chart.no_data")}</div>`;
  }

  return html`
    <div class="organization-chart-content">
      ${renderStatistics(props.organizationData.statistics)}
      ${props.viewMode === "tree" ? renderTreeView(props) : renderListView(props)}
    </div>
  `;
}

/**
 * 渲染统计信息
 */
function renderStatistics(stats: Statistics) {
  return html`
    <div class="statistics-panel">
      <div class="stat-card">
        <div class="stat-label">${t("organization_chart.stats.organizations")}</div>
        <div class="stat-value">${stats.totalOrganizations}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("organization_chart.stats.teams")}</div>
        <div class="stat-value">${stats.totalTeams}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("organization_chart.stats.agents")}</div>
        <div class="stat-value">${stats.totalAgents}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("organization_chart.stats.avg_team_size")}</div>
        <div class="stat-value">${stats.averageTeamSize.toFixed(1)}</div>
      </div>
    </div>
  `;
}

/**
 * 渲染树形视图
 */
function renderTreeView(props: OrganizationChartProps) {
  const data = props.organizationData!;

  // 构建组织树
  const rootOrganizations = data.organizations.filter((org) => !org.parentId);

  return html`
    <div class="tree-view">
      <div class="tree-container">
        ${rootOrganizations.map((org) => renderOrganizationNode(org, data, props))}
      </div>
    </div>
  `;
}

/**
 * 渲染组织节点
 */
function renderOrganizationNode(
  org: Organization,
  data: OrganizationData,
  props: OrganizationChartProps,
): ReturnType<typeof html> {
  const isSelected = org.id === props.selectedNodeId;
  const childOrgs = data.organizations.filter((o) => o.parentId === org.id);
  const teams = data.teams.filter((t) => t.organizationId === org.id);
  const agents = data.agents.filter((a) => a.organizationId === org.id && !a.teamId);

  return html`
    <div class="tree-node organization-node ${isSelected ? "selected" : ""}">
      <div
        class="node-content"
        @click=${() => props.onSelectNode(org.id)}
      >
        <span class="node-icon">🏢</span>
        <div class="node-info">
          <div class="node-name">${org.name}</div>
          <div class="node-meta">
            <span class="agent-count">${org.agentCount} ${t("organization_chart.agents")}</span>
            ${org.description ? html`<span class="node-description">${org.description}</span>` : nothing}
          </div>
        </div>
      </div>
      
      ${
        childOrgs.length > 0 || teams.length > 0 || agents.length > 0
          ? html`
        <div class="node-children">
          ${childOrgs.map((childOrg) => renderOrganizationNode(childOrg, data, props))}
          ${teams.map((team) => renderTeamNode(team, data, props))}
          ${agents.map((agent) => renderAgentNode(agent, props))}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染团队节点
 */
function renderTeamNode(team: Team, data: OrganizationData, props: OrganizationChartProps) {
  const isSelected = team.id === props.selectedNodeId;
  const members = data.agents.filter((a) => a.teamId === team.id);
  const leader = team.leaderId ? data.agents.find((a) => a.id === team.leaderId) : null;

  return html`
    <div class="tree-node team-node ${isSelected ? "selected" : ""}">
      <div
        class="node-content"
        @click=${() => props.onSelectNode(team.id)}
      >
        <span class="node-icon">👥</span>
        <div class="node-info">
          <div class="node-name">${team.name}</div>
          <div class="node-meta">
            <span class="member-count">${members.length} ${t("organization_chart.members")}</span>
            ${leader ? html`<span class="team-leader">${t("organization_chart.leader")}: ${leader.name}</span>` : nothing}
          </div>
        </div>
      </div>
      
      ${
        members.length > 0
          ? html`
        <div class="node-children">
          ${members.map((agent) => renderAgentNode(agent, props))}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染智能助手节点
 */
function renderAgentNode(agent: AgentNode, props: OrganizationChartProps) {
  const isSelected = agent.id === props.selectedNodeId;

  return html`
    <div
      class="tree-node agent-node ${isSelected ? "selected" : ""}"
      @click=${() => props.onSelectNode(agent.id)}
    >
      <div class="node-content">
        <div class="agent-avatar">
          ${
            agent.identity?.avatar
              ? html`<img src="${agent.identity.avatar}" alt="${agent.name}" />`
              : html`<span class="avatar-placeholder">${agent.identity?.emoji || "🤖"}</span>`
          }
        </div>
        <div class="node-info">
          <div class="node-name">${agent.name}</div>
          <div class="node-meta">
            ${agent.role ? html`<span class="agent-role">${agent.role}</span>` : nothing}
            <span class="permission-level">
              ${t("organization_chart.permission_level")}: ${agent.permissionLevel}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染列表视图
 */
function renderListView(props: OrganizationChartProps) {
  const data = props.organizationData!;

  return html`
    <div class="list-view">
      ${
        data.organizations.length > 0
          ? html`
        <section class="list-section">
          <h2>${t("organization_chart.organizations")}</h2>
          <div class="list-container">
            ${data.organizations.map((org) => renderOrganizationListItem(org, props))}
          </div>
        </section>
      `
          : nothing
      }

      ${
        data.teams.length > 0
          ? html`
        <section class="list-section">
          <h2>${t("organization_chart.teams")}</h2>
          <div class="list-container">
            ${data.teams.map((team) => renderTeamListItem(team, data, props))}
          </div>
        </section>
      `
          : nothing
      }

      ${
        data.agents.length > 0
          ? html`
        <section class="list-section">
          <h2>${t("organization_chart.agents")}</h2>
          <div class="list-container">
            ${data.agents.map((agent) => renderAgentListItem(agent, data, props))}
          </div>
        </section>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染组织列表项
 */
function renderOrganizationListItem(org: Organization, props: OrganizationChartProps) {
  const isSelected = org.id === props.selectedNodeId;

  return html`
    <div
      class="list-item organization-item ${isSelected ? "selected" : ""}"
      @click=${() => props.onSelectNode(org.id)}
    >
      <span class="item-icon">🏢</span>
      <div class="item-info">
        <div class="item-name">${org.name}</div>
        <div class="item-meta">
          <span>${t("organization_chart.level")}: ${org.level}</span>
          <span>${org.agentCount} ${t("organization_chart.agents")}</span>
          ${org.description ? html`<span class="item-description">${org.description}</span>` : nothing}
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染团队列表项
 */
function renderTeamListItem(team: Team, data: OrganizationData, props: OrganizationChartProps) {
  const isSelected = team.id === props.selectedNodeId;
  const organization = data.organizations.find((o) => o.id === team.organizationId);
  const leader = team.leaderId ? data.agents.find((a) => a.id === team.leaderId) : null;

  return html`
    <div
      class="list-item team-item ${isSelected ? "selected" : ""}"
      @click=${() => props.onSelectNode(team.id)}
    >
      <span class="item-icon">👥</span>
      <div class="item-info">
        <div class="item-name">${team.name}</div>
        <div class="item-meta">
          ${organization ? html`<span>${organization.name}</span>` : nothing}
          <span>${team.memberIds.length} ${t("organization_chart.members")}</span>
          ${leader ? html`<span>${t("organization_chart.leader")}: ${leader.name}</span>` : nothing}
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染智能助手列表项
 */
function renderAgentListItem(
  agent: AgentNode,
  data: OrganizationData,
  props: OrganizationChartProps,
) {
  const isSelected = agent.id === props.selectedNodeId;
  const organization = agent.organizationId
    ? data.organizations.find((o) => o.id === agent.organizationId)
    : null;
  const team = agent.teamId ? data.teams.find((t) => t.id === agent.teamId) : null;

  return html`
    <div
      class="list-item agent-item ${isSelected ? "selected" : ""}"
      @click=${() => props.onSelectNode(agent.id)}
    >
      <div class="agent-avatar">
        ${
          agent.identity?.avatar
            ? html`<img src="${agent.identity.avatar}" alt="${agent.name}" />`
            : html`<span class="avatar-placeholder">${agent.identity?.emoji || "🤖"}</span>`
        }
      </div>
      <div class="item-info">
        <div class="item-name">${agent.name}</div>
        <div class="item-meta">
          ${organization ? html`<span>${organization.name}</span>` : nothing}
          ${team ? html`<span>${team.name}</span>` : nothing}
          ${agent.role ? html`<span>${agent.role}</span>` : nothing}
          <span>${t("organization_chart.permission_level")}: ${agent.permissionLevel}</span>
        </div>
      </div>
    </div>
  `;
}
