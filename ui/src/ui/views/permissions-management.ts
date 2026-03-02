/**
 * 权限管理 UI 组件
 * 
 * 提供智能体权限配置的可视化管理界面
 */

import { html, nothing } from "lit";
import { t } from "../i18n.js";
import type { GatewayBrowserClient } from "../gateway.ts";

/**
 * 权限主体类型
 */
export type PermissionSubjectType = "user" | "group" | "role";

/**
 * 权限动作
 */
export type PermissionAction = "allow" | "deny" | "require_approval";

/**
 * 角色信息
 */
export type RoleInfo = {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
};

/**
 * 权限规则
 */
export type PermissionRule = {
  id: string;
  toolName: string;
  action: PermissionAction;
  subjects: Array<{
    type: PermissionSubjectType;
    id: string;
    name?: string;
  }>;
  description?: string;
  enabled?: boolean;
  priority?: number;
};

/**
 * 权限配置
 */
export type PermissionsConfig = {
  defaultAction?: PermissionAction;
  rules: PermissionRule[];
  roles?: RoleInfo[];
  enableAuditLog?: boolean;
};

/**
 * 组件属性
 */
export type PermissionsManagementProps = {
  /** 当前选中的智能体ID */
  agentId: string | null;
  
  /** 智能体列表 */
  agents: Array<{ id: string; name?: string }>;
  
  /** 权限配置 */
  permissionsConfig: PermissionsConfig | null;
  
  /** 加载状态 */
  loading: boolean;
  
  /** 错误信息 */
  error: string | null;
  
  /** 保存状态 */
  saving: boolean;
  
  /** 保存成功标志 */
  saveSuccess: boolean;
  
  /** 可用角色列表 */
  availableRoles: RoleInfo[];
  
  /** 工具类别 */
  toolCategories: Record<string, string[]>;
  
  /** 预定义角色ID */
  predefinedRoles: Record<string, string>;
  
  /** 当前激活的标签页 */
  activeTab: "overview" | "roles" | "rules" | "agents";
  
  /** 选中的目标智能体（用于角色分配） */
  selectedTargetAgent: string | null;
  
  /** 目标智能体的角色列表 */
  targetAgentRoles: RoleInfo[];
  
  /** 目标智能体角色加载状态 */
  targetAgentRolesLoading: boolean;
  
  /** Gateway 客户端 */
  gateway: GatewayBrowserClient;
  
  /** 事件处理器 */
  onInitPermissions: (agentId: string) => Promise<void>;
  onAssignRole: (agentId: string, targetAgentId: string, roleId: string) => Promise<void>;
  onRemoveRole: (agentId: string, targetAgentId: string, roleId: string) => Promise<void>;
  onAddRule: (agentId: string, rule: Partial<PermissionRule>) => Promise<void>;
  onSwitchTab: (tab: "overview" | "roles" | "rules" | "agents") => void;
  onSelectTargetAgent: (agentId: string | null) => void;
  onRefresh: () => void;
};

/**
 * 渲染权限动作徽章
 */
function renderActionBadge(action: PermissionAction) {
  const config = {
    allow: { icon: "✅", color: "var(--success-color)", text: t("permission.action.allow") },
    deny: { icon: "❌", color: "var(--error-color)", text: t("permission.action.deny") },
    require_approval: { icon: "🟡", color: "var(--warning-color)", text: t("permission.action.requireApproval") },
  };
  
  const { icon, color, text } = config[action] || config.allow;
  
  return html`
    <span class="permission-badge" style="color: ${color}; border-color: ${color};">
      <span class="permission-badge-icon">${icon}</span>
      <span class="permission-badge-text">${text}</span>
    </span>
  `;
}

/**
 * 渲染角色徽章
 */
function renderRoleBadge(role: RoleInfo, variant: "small" | "medium" = "medium") {
  const roleIcons: Record<string, string> = {
    "super-admin": "👑",
    "admin": "🔱",
    "manager": "📊",
    "coordinator": "📋",
    "hr-admin": "👥",
    "trainer": "🎓",
    "approver": "✅",
    "senior-engineer": "⭐",
    "developer": "💻",
    "junior-engineer": "🌱",
    "user": "👤",
    "readonly": "👁️",
  };
  
  const icon = roleIcons[role.id] || "🏷️";
  const size = variant === "small" ? "small" : "";
  
  return html`
    <span class="role-badge ${size}" data-role="${role.id}">
      <span class="role-badge-icon">${icon}</span>
      <span class="role-badge-name">${role.name}</span>
    </span>
  `;
}

/**
 * 渲染概览标签页
 */
function renderOverviewTab(props: PermissionsManagementProps) {
  const { permissionsConfig, availableRoles, agents, agentId } = props;
  
  if (!permissionsConfig) {
    return html`
      <div class="permissions-empty-state">
        <div class="empty-state-icon">🔒</div>
        <h3>${t("permission.notInitialized")}</h3>
        <p>${t("permission.notInitializedDesc")}</p>
        <button 
          class="button-primary"
          @click=${() => agentId && props.onInitPermissions(agentId)}
          ?disabled=${props.loading || !agentId}
        >
          ${t("permission.initialize")}
        </button>
      </div>
    `;
  }
  
  const totalRules = permissionsConfig.rules.length;
  const enabledRules = permissionsConfig.rules.filter(r => r.enabled !== false).length;
  const allowRules = permissionsConfig.rules.filter(r => r.action === "allow").length;
  const denyRules = permissionsConfig.rules.filter(r => r.action === "deny").length;
  const approvalRules = permissionsConfig.rules.filter(r => r.action === "require_approval").length;
  
  return html`
    <div class="permissions-overview">
      <!-- 统计卡片 -->
      <div class="permissions-stats">
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <div class="stat-label">${t("permission.totalRules")}</div>
            <div class="stat-value">${totalRules}</div>
            <div class="stat-sub">${enabledRules} ${t("permission.enabled")}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">🎭</div>
          <div class="stat-content">
            <div class="stat-label">${t("permission.roles")}</div>
            <div class="stat-value">${availableRoles.length}</div>
            <div class="stat-sub">${t("permission.available")}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">🤖</div>
          <div class="stat-content">
            <div class="stat-label">${t("permission.agents")}</div>
            <div class="stat-value">${agents.length}</div>
            <div class="stat-sub">${t("permission.total")}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">📝</div>
          <div class="stat-content">
            <div class="stat-label">${t("permission.defaultAction")}</div>
            <div class="stat-value">${permissionsConfig.defaultAction || "deny"}</div>
            <div class="stat-sub">${t("permission.whenNoMatch")}</div>
          </div>
        </div>
      </div>
      
      <!-- 规则分布 -->
      <div class="permissions-distribution">
        <h3>${t("permission.ruleDistribution")}</h3>
        <div class="distribution-chart">
          <div class="distribution-item" style="flex: ${allowRules};">
            <div class="distribution-bar" style="background: var(--success-color);"></div>
            <div class="distribution-label">
              <span>${t("permission.action.allow")}</span>
              <strong>${allowRules}</strong>
            </div>
          </div>
          <div class="distribution-item" style="flex: ${denyRules};">
            <div class="distribution-bar" style="background: var(--error-color);"></div>
            <div class="distribution-label">
              <span>${t("permission.action.deny")}</span>
              <strong>${denyRules}</strong>
            </div>
          </div>
          <div class="distribution-item" style="flex: ${approvalRules};">
            <div class="distribution-bar" style="background: var(--warning-color);"></div>
            <div class="distribution-label">
              <span>${t("permission.action.requireApproval")}</span>
              <strong>${approvalRules}</strong>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 角色列表 -->
      <div class="permissions-roles-preview">
        <h3>${t("permission.availableRoles")}</h3>
        <div class="roles-grid">
          ${availableRoles.map(role => html`
            <div class="role-card">
              ${renderRoleBadge(role)}
              ${role.description ? html`<p class="role-description">${role.description}</p>` : nothing}
              <div class="role-members">${role.memberCount || 0} ${t("permission.members")}</div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染角色管理标签页
 */
function renderRolesTab(props: PermissionsManagementProps) {
  const { availableRoles, predefinedRoles } = props;
  
  return html`
    <div class="permissions-roles">
      <div class="roles-header">
        <h3>${t("permission.roleManagement")}</h3>
        <p class="roles-description">${t("permission.roleManagementDesc")}</p>
      </div>
      
      <div class="roles-list">
        ${availableRoles.map(role => {
          const isPredefined = Object.values(predefinedRoles).includes(role.id);
          
          return html`
            <div class="role-item ${isPredefined ? 'predefined' : 'custom'}">
              <div class="role-item-header">
                ${renderRoleBadge(role, "medium")}
                ${isPredefined ? html`<span class="role-tag">${t("permission.predefined")}</span>` : nothing}
              </div>
              
              <div class="role-item-body">
                ${role.description ? html`<p class="role-item-description">${role.description}</p>` : nothing}
                
                <div class="role-item-stats">
                  <span class="role-stat">
                    <span class="role-stat-icon">👥</span>
                    <span>${role.memberCount || 0} ${t("permission.members")}</span>
                  </span>
                </div>
              </div>
              
              <div class="role-item-actions">
                <button 
                  class="button-secondary button-sm"
                  @click=${() => {
                    props.onSwitchTab("agents");
                    // 可以触发选择该角色进行分配
                  }}
                >
                  ${t("permission.assignToAgents")}
                </button>
              </div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

/**
 * 渲染规则管理标签页
 */
function renderRulesTab(props: PermissionsManagementProps) {
  const { permissionsConfig, toolCategories } = props;
  
  if (!permissionsConfig) {
    return html`<div class="permissions-empty">${t("permission.noConfig")}</div>`;
  }
  
  // 按工具名称分组规则
  const rulesByTool = new Map<string, PermissionRule[]>();
  permissionsConfig.rules.forEach(rule => {
    const existing = rulesByTool.get(rule.toolName) || [];
    existing.push(rule);
    rulesByTool.set(rule.toolName, existing);
  });
  
  return html`
    <div class="permissions-rules">
      <div class="rules-header">
        <h3>${t("permission.ruleManagement")}</h3>
        <button class="button-primary button-sm" @click=${() => {
          // 触发添加规则对话框
          alert(t("permission.addRuleDialogComingSoon"));
        }}>
          + ${t("permission.addRule")}
        </button>
      </div>
      
      <div class="rules-list">
        ${Array.from(rulesByTool.entries()).map(([toolName, rules]) => html`
          <div class="rule-group">
            <div class="rule-group-header">
              <h4>${toolName}</h4>
              <span class="rule-count">${rules.length} ${t("permission.rules")}</span>
            </div>
            
            <div class="rule-group-items">
              ${rules.map(rule => html`
                <div class="rule-item ${rule.enabled === false ? 'disabled' : ''}">
                  <div class="rule-item-header">
                    ${renderActionBadge(rule.action)}
                    <span class="rule-priority">P${rule.priority || 500}</span>
                  </div>
                  
                  <div class="rule-item-body">
                    ${rule.description ? html`<p class="rule-description">${rule.description}</p>` : nothing}
                    
                    <div class="rule-subjects">
                      <span class="rule-label">${t("permission.appliesTo")}:</span>
                      ${rule.subjects.map(subject => html`
                        <span class="subject-tag">
                          ${subject.type === "role" ? "🎭" : "👤"} ${subject.name || subject.id}
                        </span>
                      `)}
                    </div>
                  </div>
                  
                  <div class="rule-item-actions">
                    <button class="button-icon" title="${t("permission.editRule")}">✏️</button>
                    <button class="button-icon" title="${t("permission.deleteRule")}">🗑️</button>
                  </div>
                </div>
              `)}
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}

/**
 * 渲染智能体角色管理标签页
 */
function renderAgentsTab(props: PermissionsManagementProps) {
  const { 
    agents, 
    availableRoles, 
    selectedTargetAgent, 
    targetAgentRoles,
    targetAgentRolesLoading,
    agentId,
  } = props;
  
  return html`
    <div class="permissions-agents">
      <div class="agents-split-view">
        <!-- 左侧：智能体列表 -->
        <div class="agents-list-panel">
          <h3>${t("permission.selectAgent")}</h3>
          <div class="agents-list">
            ${agents.map(agent => html`
              <div 
                class="agent-list-item ${selectedTargetAgent === agent.id ? 'selected' : ''}"
                @click=${() => props.onSelectTargetAgent(agent.id)}
              >
                <span class="agent-icon">🤖</span>
                <span class="agent-name">${agent.name || agent.id}</span>
                <span class="agent-id">${agent.id}</span>
              </div>
            `)}
          </div>
        </div>
        
        <!-- 右侧：角色管理 -->
        <div class="agent-roles-panel">
          ${!selectedTargetAgent ? html`
            <div class="empty-state">
              <div class="empty-state-icon">👈</div>
              <p>${t("permission.selectAgentToManageRoles")}</p>
            </div>
          ` : html`
            <div class="agent-roles-content">
              <div class="agent-roles-header">
                <h3>${t("permission.rolesFor")} ${agents.find(a => a.id === selectedTargetAgent)?.name || selectedTargetAgent}</h3>
                <button 
                  class="button-secondary button-sm"
                  @click=${() => props.onRefresh()}
                  ?disabled=${targetAgentRolesLoading}
                >
                  🔄 ${t("common.refresh")}
                </button>
              </div>
              
              ${targetAgentRolesLoading ? html`
                <div class="loading-state">
                  <div class="spinner"></div>
                  <p>${t("common.loading")}</p>
                </div>
              ` : html`
                <!-- 当前角色 -->
                <div class="current-roles">
                  <h4>${t("permission.currentRoles")}</h4>
                  ${targetAgentRoles.length === 0 ? html`
                    <p class="text-muted">${t("permission.noRolesAssigned")}</p>
                  ` : html`
                    <div class="roles-badges">
                      ${targetAgentRoles.map(role => html`
                        <div class="role-badge-with-remove">
                          ${renderRoleBadge(role, "medium")}
                          <button 
                            class="button-icon-danger button-sm"
                            @click=${() => agentId && selectedTargetAgent && props.onRemoveRole(agentId, selectedTargetAgent, role.id)}
                            title="${t("permission.removeRole")}"
                          >
                            ✕
                          </button>
                        </div>
                      `)}
                    </div>
                  `}
                </div>
                
                <!-- 可分配角色 -->
                <div class="available-roles-assign">
                  <h4>${t("permission.assignRole")}</h4>
                  <div class="assign-roles-grid">
                    ${availableRoles
                      .filter(role => !targetAgentRoles.find(r => r.id === role.id))
                      .map(role => html`
                        <div class="assign-role-card">
                          ${renderRoleBadge(role, "medium")}
                          ${role.description ? html`<p class="assign-role-desc">${role.description}</p>` : nothing}
                          <button 
                            class="button-primary button-sm"
                            @click=${() => agentId && selectedTargetAgent && props.onAssignRole(agentId, selectedTargetAgent, role.id)}
                            ?disabled=${props.saving}
                          >
                            + ${t("permission.assign")}
                          </button>
                        </div>
                      `)}
                  </div>
                </div>
              `}
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

/**
 * 主渲染函数
 */
export function renderPermissionsManagement(props: PermissionsManagementProps) {
  const { agentId, loading, error, activeTab, saveSuccess } = props;
  
  if (!agentId) {
    return html`
      <div class="permissions-container">
        <div class="permissions-no-agent">
          <div class="empty-state-icon">🔒</div>
          <h3>${t("permission.noAgentSelected")}</h3>
          <p>${t("permission.selectAgentFromList")}</p>
        </div>
      </div>
    `;
  }
  
  return html`
    <div class="permissions-container">
      <!-- 头部 -->
      <div class="permissions-header">
        <div class="permissions-title">
          <h2>🔒 ${t("permission.management")}</h2>
          <p class="permissions-subtitle">${t("permission.managementDesc")}</p>
        </div>
        
        ${saveSuccess ? html`
          <div class="save-success-toast">
            ✅ ${t("permission.saveSuccess")}
          </div>
        ` : nothing}
      </div>
      
      <!-- 错误提示 -->
      ${error ? html`
        <div class="alert alert-error">
          <span class="alert-icon">⚠️</span>
          <span class="alert-message">${error}</span>
        </div>
      ` : nothing}
      
      <!-- 标签页导航 -->
      <div class="permissions-tabs">
        <button 
          class="tab-button ${activeTab === "overview" ? "active" : ""}"
          @click=${() => props.onSwitchTab("overview")}
        >
          📊 ${t("permission.overview")}
        </button>
        <button 
          class="tab-button ${activeTab === "roles" ? "active" : ""}"
          @click=${() => props.onSwitchTab("roles")}
        >
          🎭 ${t("permission.roles")}
        </button>
        <button 
          class="tab-button ${activeTab === "rules" ? "active" : ""}"
          @click=${() => props.onSwitchTab("rules")}
        >
          📋 ${t("permission.rules")}
        </button>
        <button 
          class="tab-button ${activeTab === "agents" ? "active" : ""}"
          @click=${() => props.onSwitchTab("agents")}
        >
          🤖 ${t("permission.agents")}
        </button>
      </div>
      
      <!-- 标签页内容 -->
      <div class="permissions-content ${loading ? 'loading' : ''}">
        ${loading ? html`
          <div class="loading-overlay">
            <div class="spinner"></div>
            <p>${t("common.loading")}</p>
          </div>
        ` : nothing}
        
        ${activeTab === "overview" ? renderOverviewTab(props) : nothing}
        ${activeTab === "roles" ? renderRolesTab(props) : nothing}
        ${activeTab === "rules" ? renderRulesTab(props) : nothing}
        ${activeTab === "agents" ? renderAgentsTab(props) : nothing}
      </div>
    </div>
    
    <style>
      .permissions-container {
        padding: 24px;
        max-width: 1400px;
        margin: 0 auto;
      }
      
      .permissions-header {
        margin-bottom: 24px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      
      .permissions-title h2 {
        margin: 0 0 8px 0;
        font-size: 28px;
      }
      
      .permissions-subtitle {
        color: var(--text-secondary);
        margin: 0;
      }
      
      .save-success-toast {
        background: var(--success-color);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        animation: slideInRight 0.3s ease;
      }
      
      .permissions-tabs {
        display: flex;
        gap: 8px;
        border-bottom: 2px solid var(--border-color);
        margin-bottom: 24px;
      }
      
      .tab-button {
        padding: 12px 24px;
        background: none;
        border: none;
        border-bottom: 3px solid transparent;
        cursor: pointer;
        font-size: 15px;
        transition: all 0.2s;
        margin-bottom: -2px;
      }
      
      .tab-button:hover {
        background: var(--hover-bg);
      }
      
      .tab-button.active {
        border-bottom-color: var(--primary-color);
        font-weight: 600;
      }
      
      .permissions-content {
        position: relative;
        min-height: 400px;
      }
      
      .permissions-content.loading {
        opacity: 0.5;
        pointer-events: none;
      }
      
      /* 概览页面样式 */
      .permissions-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        margin-bottom: 32px;
      }
      
      .stat-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 20px;
        display: flex;
        gap: 16px;
        align-items: center;
      }
      
      .stat-icon {
        font-size: 36px;
      }
      
      .stat-label {
        color: var(--text-secondary);
        font-size: 13px;
        margin-bottom: 4px;
      }
      
      .stat-value {
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      
      .stat-sub {
        color: var(--text-tertiary);
        font-size: 12px;
      }
      
      .permissions-distribution {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 32px;
      }
      
      .distribution-chart {
        display: flex;
        gap: 12px;
        height: 80px;
        margin-top: 16px;
      }
      
      .distribution-item {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      
      .distribution-bar {
        flex: 1;
        border-radius: 8px;
        transition: transform 0.3s;
      }
      
      .distribution-bar:hover {
        transform: scaleY(1.1);
      }
      
      .distribution-label {
        text-align: center;
        font-size: 12px;
        margin-top: 8px;
      }
      
      .distribution-label strong {
        display: block;
        font-size: 18px;
      }
      
      .roles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
      }
      
      .role-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 16px;
      }
      
      .role-description {
        font-size: 13px;
        color: var(--text-secondary);
        margin: 8px 0;
      }
      
      .role-members {
        font-size: 12px;
        color: var(--text-tertiary);
        margin-top: 8px;
      }
      
      /* 角色和规则徽章 */
      .role-badge, .permission-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        background: var(--badge-bg);
        border: 1px solid var(--border-color);
      }
      
      .role-badge.small {
        padding: 4px 8px;
        font-size: 12px;
      }
      
      .permission-badge {
        border-width: 2px;
      }
      
      /* 智能体列表 */
      .agents-split-view {
        display: grid;
        grid-template-columns: 300px 1fr;
        gap: 24px;
        height: 600px;
      }
      
      .agents-list-panel {
        border-right: 1px solid var(--border-color);
        padding-right: 24px;
        overflow-y: auto;
      }
      
      .agent-list-item {
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: background 0.2s;
      }
      
      .agent-list-item:hover {
        background: var(--hover-bg);
      }
      
      .agent-list-item.selected {
        background: var(--primary-light);
        border-left: 3px solid var(--primary-color);
      }
      
      .agent-roles-panel {
        overflow-y: auto;
      }
      
      .role-badge-with-remove {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 8px;
      }
      
      .assign-roles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }
      
      .assign-role-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 16px;
      }
      
      .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: var(--text-secondary);
      }
      
      .empty-state-icon {
        font-size: 64px;
        margin-bottom: 16px;
      }
    </style>
  `;
}
