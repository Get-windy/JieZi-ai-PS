/**
 * P0.4: 组织架构管理完整UI组件
 * 
 * 功能模块：
 * 1. 组织树视图组件 - 展示层级结构，支持拖拽
 * 2. 组织详情面板 - 成员管理、权限配置、资源管理
 * 3. 智能助手招聘向导 - 模板选择、能力配置、审批流程
 * 4. 汇报关系可视化图 - 组织架构图
 */

import { html, nothing, type TemplateResult } from "lit";

// ============================================================================
// 类型定义
// ============================================================================

export type OrganizationManagementProps = {
  loading: boolean;
  error: string | null;
  
  // 视图模式
  viewMode: "tree" | "chart" | "list";
  treeCollapsed: boolean; // 分类树是否折叠（隐藏）
  
  // 组织数据
  organizations: OrganizationNode[];
  selectedOrgId: string | null;
  expandedOrgIds: Set<string>;
  
  // 智能助手招聘
  recruitWizardOpen: boolean;
  recruitWizardStep: "template" | "config" | "position" | "review";
  recruitRequest: RecruitRequestForm | null;
  agentTemplates: AgentTemplate[];
  recruitSaving: boolean;
  recruitError: string | null;
  
  // 成员管理
  members: OrganizationMember[];
  membersLoading: boolean;
  memberDetailOpen: boolean;
  selectedMember: OrganizationMember | null;
  
  // 汇报关系
  relationships: ReportingRelationship[];
  
  // 回调函数
  onRefresh: () => void;
  onViewModeChange: (mode: "tree" | "chart" | "list") => void;
  onToggleTreeCollapse: () => void;
  onSelectOrg: (orgId: string | null) => void;
  onToggleExpand: (orgId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  
  // 组织操作
  onCreateOrg: () => void;
  onEditOrg: (orgId: string) => void;
  onDeleteOrg: (orgId: string) => void;
  
  // 成员操作
  onAddMember: (orgId: string) => void;
  onEditMember: (memberId: string) => void;
  onRemoveMember: (orgId: string, memberId: string) => void;
  onShowMemberDetail: (member: OrganizationMember | null) => void;
  
  // 招聘操作
  onOpenRecruitWizard: () => void;
  onCloseRecruitWizard: () => void;
  onRecruitStepChange: (step: "template" | "config" | "position" | "review") => void;
  onSelectTemplate: (templateId: string) => void;
  onRecruitFormChange: (field: string, value: any) => void;
  onSubmitRecruitRequest: () => void;
  
  // 关系操作
  onCreateRelation: (fromId: string, toId: string, type: string) => void;
  onDeleteRelation: (relationId: string) => void;
};

export type OrganizationNode = {
  id: string;
  name: string;
  type: "company" | "department" | "team" | "project";
  description?: string;
  parentId?: string;
  level: number;
  memberCount: number;
  agentCount: number;
  humanCount: number;
  childOrgs: string[];
  createdAt: number;
};

export type OrganizationMember = {
  id: string;
  name: string;
  type: "human" | "agent";
  role: "owner" | "admin" | "manager" | "lead" | "member" | "observer";
  title?: string;
  organizationId: string;
  reportTo?: string;
  manages?: string[];
  avatar?: string;
  status: "active" | "inactive" | "pending";
  joinedAt: number;
};

export type ReportingRelationship = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  type: "reports_to" | "supervises" | "collaborates_with";
};

export type AgentTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  capabilities: string[];
  recommendedFor: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
};

export type RecruitRequestForm = {
  organizationId: string;
  templateId?: string;
  agentName: string;
  position: string;
  title?: string;
  role: "owner" | "admin" | "manager" | "lead" | "member" | "observer";
  description?: string;
  capabilities?: string[];
  customConfig?: Record<string, any>;
};

// ============================================================================
// 主渲染函数
// ============================================================================

export function renderOrganizationManagement(props: OrganizationManagementProps) {
  return html`
    <div class="org-management-container" style="display: flex; gap: 16px; height: calc(100vh - 120px);">
      <!-- 左侧：组织树（可隐藏） -->
      ${renderLeftPanel(props)}
      
      <!-- 右侧：详情面板 -->
      ${renderRightPanel(props)}
      
      <!-- 智能助手招聘向导（模态对话框） -->
      ${renderRecruitWizard(props)}
      
      <!-- 成员详情对话框 -->
      ${renderMemberDetailDialog(props)}
    </div>
  `;
}

// ============================================================================
// 左侧面板：组织树
// ============================================================================

function renderLeftPanel(props: OrganizationManagementProps) {
  if (props.treeCollapsed) {
    // 隐藏状态：仅显示展开按钮
    return html`
      <div style="width: 48px; display: flex; flex-direction: column; gap: 8px;">
        <button
          class="btn btn--sm"
          style="width: 100%; height: 48px; padding: 0;"
          title="展开组织树"
          @click=${props.onToggleTreeCollapse}
        >
          ▶️
        </button>
      </div>
    `;
  }

  return html`
    <div class="org-tree-panel" style="width: 360px; display: flex; flex-direction: column; gap: 12px;">
      <!-- 树头部：操作按钮 -->
      ${renderTreeHeader(props)}
      
      <!-- 组织树 -->
      ${renderOrganizationTree(props)}
    </div>
  `;
}

function renderTreeHeader(props: OrganizationManagementProps) {
  return html`
    <div class="card" style="padding: 12px;">
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-weight: 600; font-size: 0.95rem;">🏢 组织架构</div>
        <button
          class="btn btn--sm"
          style="padding: 4px 8px;"
          title="隐藏组织树"
          @click=${props.onToggleTreeCollapse}
        >
          ◀️
        </button>
      </div>
      
      <!-- 操作按钮（仅图标，悬停显示提示） -->
      <div class="row" style="gap: 8px; justify-content: flex-end;">
        <button
          class="btn btn--sm"
          style="padding: 6px;"
          title="创建组织"
          @click=${props.onCreateOrg}
        >
          ➕
        </button>
        <button
          class="btn btn--sm"
          style="padding: 6px;"
          title="招聘智能助手"
          @click=${props.onOpenRecruitWizard}
        >
          🤖
        </button>
        <button
          class="btn btn--sm"
          style="padding: 6px;"
          title="展开全部"
          @click=${props.onExpandAll}
        >
          📂
        </button>
        <button
          class="btn btn--sm"
          style="padding: 6px;"
          title="折叠全部"
          @click=${props.onCollapseAll}
        >
          📁
        </button>
        <button
          class="btn btn--sm"
          style="padding: 6px;"
          title="刷新"
          @click=${props.onRefresh}
          ?disabled=${props.loading}
        >
          🔄
        </button>
      </div>
    </div>
  `;
}

function renderOrganizationTree(props: OrganizationManagementProps) {
  if (props.loading) {
    return html`
      <div class="card" style="padding: 24px; text-align: center;">
        <div class="loading">加载中...</div>
      </div>
    `;
  }

  if (props.error) {
    return html`
      <div class="card" style="padding: 16px;">
        <div class="error">❌ ${props.error}</div>
      </div>
    `;
  }

  const rootOrgs = props.organizations.filter((org) => !org.parentId);

  if (rootOrgs.length === 0) {
    return html`
      <div class="card" style="padding: 24px; text-align: center;">
        <div class="muted" style="margin-bottom: 16px;">暂无组织</div>
        <button class="btn btn--sm btn--primary" @click=${props.onCreateOrg}>
          ➕ 创建第一个组织
        </button>
      </div>
    `;
  }

  return html`
    <div class="card" style="padding: 12px; flex: 1; overflow-y: auto;">
      ${rootOrgs.map((org) => renderTreeNode(org, props, 0))}
    </div>
  `;
}

function renderTreeNode(
  org: OrganizationNode,
  props: OrganizationManagementProps,
  depth: number,
): TemplateResult {
  const isSelected = props.selectedOrgId === org.id;
  const isExpanded = props.expandedOrgIds.has(org.id);
  const hasChildren = org.childOrgs.length > 0;
  const children = props.organizations.filter((o) => o.parentId === org.id);

  const indent = depth * 16;

  return html`
    <div style="margin-bottom: 4px;">
      <!-- 节点本身 -->
      <div
        class="list-item ${isSelected ? "selected" : ""}"
        style="
          padding: 8px 8px 8px ${indent + 8}px;
          cursor: pointer;
          border-radius: 6px;
          background: ${isSelected ? "var(--bg-2)" : "transparent"};
          transition: background 0.2s;
        "
        @click=${() => props.onSelectOrg(org.id)}
        @mouseenter=${(e: MouseEvent) => {
          const target = e.currentTarget as HTMLElement;
          if (!isSelected) {
            target.style.background = "var(--bg-1)";
          }
        }}
        @mouseleave=${(e: MouseEvent) => {
          const target = e.currentTarget as HTMLElement;
          if (!isSelected) {
            target.style.background = "transparent";
          }
        }}
      >
        <div class="row" style="gap: 8px; align-items: center;">
          <!-- 展开/折叠图标 -->
          ${
            hasChildren
              ? html`
                <span
                  style="cursor: pointer; user-select: none; width: 16px; text-align: center;"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    props.onToggleExpand(org.id);
                  }}
                >
                  ${isExpanded ? "▼" : "▶"}
                </span>
              `
              : html`<span style="width: 16px;"></span>`
          }
          
          <!-- 组织图标和名称 -->
          <span style="flex: 1; font-size: 0.9rem;">
            ${getOrgIcon(org.type)} ${org.name}
          </span>
          
          <!-- 成员数量 -->
          <span class="muted" style="font-size: 0.8rem;">
            👥 ${org.memberCount}
          </span>
        </div>
      </div>

      <!-- 子节点（仅展开时显示） -->
      ${
        isExpanded && hasChildren
          ? html`
            <div>
              ${children.map((child) => renderTreeNode(child, props, depth + 1))}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

function getOrgIcon(type: string): string {
  const icons: Record<string, string> = {
    company: "🏢",
    department: "🏛️",
    team: "👥",
    project: "📁",
  };
  return icons[type] || "📂";
}

// ============================================================================
// 右侧面板：详情
// ============================================================================

function renderRightPanel(props: OrganizationManagementProps) {
  const width = props.treeCollapsed ? "calc(100% - 64px)" : "calc(100% - 376px)";

  return html`
    <div class="org-detail-panel" style="flex: 1; width: ${width}; display: flex; flex-direction: column; gap: 12px;">
      <!-- 头部：视图切换 -->
      ${renderDetailHeader(props)}
      
      <!-- 内容区域 -->
      ${renderDetailContent(props)}
    </div>
  `;
}

function renderDetailHeader(props: OrganizationManagementProps) {
  const viewModes: Array<{ id: "tree" | "chart" | "list"; label: string; icon: string }> = [
    { id: "tree", label: "树形", icon: "🌳" },
    { id: "chart", label: "架构图", icon: "📊" },
    { id: "list", label: "列表", icon: "📋" },
  ];

  return html`
    <div class="card" style="padding: 12px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div style="font-weight: 600;">
          ${props.selectedOrgId ? "组织详情" : "组织架构总览"}
        </div>
        
        <div class="row" style="gap: 4px;">
          ${viewModes.map(
            (mode) => html`
              <button
                class="btn btn--sm ${props.viewMode === mode.id ? "btn--primary" : ""}"
                @click=${() => props.onViewModeChange(mode.id)}
                style="padding: 6px 12px;"
              >
                ${mode.icon}
              </button>
            `,
          )}
        </div>
      </div>
    </div>
  `;
}

function renderDetailContent(props: OrganizationManagementProps) {
  if (!props.selectedOrgId) {
    return renderOverview(props);
  }

  const org = props.organizations.find((o) => o.id === props.selectedOrgId);
  if (!org) {
    return html`
      <div class="card" style="padding: 24px; text-align: center;">
        <div class="muted">未找到组织信息</div>
      </div>
    `;
  }

  return html`
    <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
      ${renderOrgInfo(org, props)}
      ${renderOrgMembers(org, props)}
      ${renderOrgActions(org, props)}
    </div>
  `;
}

function renderOverview(props: OrganizationManagementProps) {
  const totalOrgs = props.organizations.length;
  const totalMembers = props.members.length;
  const totalAgents = props.members.filter((m) => m.type === "agent").length;
  const totalHumans = props.members.filter((m) => m.type === "human").length;

  return html`
    <div class="card" style="padding: 24px;">
      <div class="card-title" style="margin-bottom: 24px;">📊 组织统计</div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div style="text-align: center; padding: 16px; background: var(--bg-1); border-radius: 8px;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 8px;">组织数量</div>
          <div style="font-size: 2rem; font-weight: 600; color: var(--primary);">${totalOrgs}</div>
        </div>
        
        <div style="text-align: center; padding: 16px; background: var(--bg-1); border-radius: 8px;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 8px;">总成员数</div>
          <div style="font-size: 2rem; font-weight: 600;">${totalMembers}</div>
        </div>
        
        <div style="text-align: center; padding: 16px; background: var(--bg-1); border-radius: 8px;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 8px;">智能助手</div>
          <div style="font-size: 2rem; font-weight: 600; color: var(--success);">${totalAgents}</div>
        </div>
        
        <div style="text-align: center; padding: 16px; background: var(--bg-1); border-radius: 8px;">
          <div class="muted" style="font-size: 0.875rem; margin-bottom: 8px;">人类成员</div>
          <div style="font-size: 2rem; font-weight: 600; color: var(--info);">${totalHumans}</div>
        </div>
      </div>
      
      <div style="margin-top: 32px; text-align: center;">
        <button class="btn btn--primary" @click=${props.onOpenRecruitWizard}>
          🤖 招聘智能助手
        </button>
      </div>
    </div>
  `;
}

function renderOrgInfo(org: OrganizationNode, props: OrganizationManagementProps) {
  return html`
    <div class="card" style="padding: 16px;">
      <div class="row" style="justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 8px;">
            ${getOrgIcon(org.type)} ${org.name}
          </div>
          ${
            org.description
              ? html`<div class="muted" style="margin-bottom: 8px;">${org.description}</div>`
              : nothing
          }
          <div class="muted" style="font-size: 0.875rem;">
            创建于 ${new Date(org.createdAt).toLocaleDateString()}
          </div>
        </div>
        
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm" @click=${() => props.onEditOrg(org.id)}>
            ✏️ 编辑
          </button>
          <button
            class="btn btn--sm btn--danger"
            @click=${() => {
              if (confirm(`确定删除组织 "${org.name}" 吗？此操作不可恢复。`)) {
                props.onDeleteOrg(org.id);
              }
            }}
          >
            🗑️ 删除
          </button>
        </div>
      </div>
      
      <div class="row" style="gap: 24px;">
        <div>
          <span class="muted">类型：</span>
          <span>${getOrgTypeName(org.type)}</span>
        </div>
        <div>
          <span class="muted">层级：</span>
          <span>第 ${org.level} 级</span>
        </div>
        <div>
          <span class="muted">总成员：</span>
          <span>${org.memberCount}</span>
        </div>
        <div>
          <span class="muted">智能助手：</span>
          <span>${org.agentCount}</span>
        </div>
        <div>
          <span class="muted">人类：</span>
          <span>${org.humanCount}</span>
        </div>
      </div>
    </div>
  `;
}

function getOrgTypeName(type: string): string {
  const names: Record<string, string> = {
    company: "公司",
    department: "部门",
    team: "团队",
    project: "项目",
  };
  return names[type] || type;
}

function renderOrgMembers(org: OrganizationNode, props: OrganizationManagementProps) {
  const orgMembers = props.members.filter((m) => m.organizationId === org.id);

  return html`
    <div class="card" style="padding: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="font-weight: 600;">👥 成员列表 (${orgMembers.length})</div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm btn--primary" @click=${() => props.onAddMember(org.id)}>
            ➕ 添加成员
          </button>
          <button class="btn btn--sm btn--primary" @click=${props.onOpenRecruitWizard}>
            🤖 招聘助手
          </button>
        </div>
      </div>
      
      ${
        orgMembers.length === 0
          ? html`
            <div class="muted" style="text-align: center; padding: 24px;">
              暂无成员，点击上方按钮添加成员或招聘智能助手
            </div>
          `
          : html`
            <div style="display: grid; gap: 8px;">
              ${orgMembers.map((member) => renderMemberCard(member, props))}
            </div>
          `
      }
    </div>
  `;
}

function renderMemberCard(member: OrganizationMember, props: OrganizationManagementProps) {
  const statusColor: Record<string, string> = {
    active: "var(--success)",
    inactive: "var(--muted)",
    pending: "var(--warning)",
  };

  return html`
    <div
      class="list-item"
      style="padding: 12px; border-radius: 6px; background: var(--bg-1); cursor: pointer;"
      @click=${() => props.onShowMemberDetail(member)}
    >
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div class="row" style="gap: 12px; align-items: center; flex: 1;">
          <!-- 头像 -->
          <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-2); display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
            ${member.type === "agent" ? "🤖" : "👤"}
          </div>
          
          <!-- 信息 -->
          <div style="flex: 1;">
            <div style="font-weight: 500; margin-bottom: 4px;">
              ${member.name}
              ${
                member.title
                  ? html`<span class="muted" style="font-size: 0.875rem; margin-left: 8px;">${member.title}</span>`
                  : nothing
              }
            </div>
            <div class="muted" style="font-size: 0.875rem;">
              ${getRoleName(member.role)} • ${member.type === "agent" ? "智能助手" : "人类"}
              ${
                member.status === "active"
                  ? html`<span style="margin-left: 8px; color: ${statusColor[member.status]};">●</span>`
                  : nothing
              }
            </div>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="row" style="gap: 8px;">
          <button
            class="btn btn--sm"
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onEditMember(member.id);
            }}
          >
            ✏️
          </button>
          <button
            class="btn btn--sm btn--danger"
            @click=${(e: Event) => {
              e.stopPropagation();
              if (confirm(`确定移除成员 "${member.name}" 吗？`)) {
                props.onRemoveMember(member.organizationId, member.id);
              }
            }}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  `;
}

function getRoleName(role: string): string {
  const names: Record<string, string> = {
    owner: "所有者",
    admin: "管理员",
    manager: "经理",
    lead: "组长",
    member: "成员",
    observer: "观察者",
  };
  return names[role] || role;
}

function renderOrgActions(org: OrganizationNode, props: OrganizationManagementProps) {
  return html`
    <div class="card" style="padding: 16px;">
      <div style="font-weight: 600; margin-bottom: 12px;">⚡ 快捷操作</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px;">
        <button class="btn btn--sm" @click=${props.onOpenRecruitWizard}>
          🤖 招聘助手
        </button>
        <button class="btn btn--sm" @click=${() => props.onAddMember(org.id)}>
          ➕ 添加成员
        </button>
        <button class="btn btn--sm" @click=${() => props.onEditOrg(org.id)}>
          ✏️ 编辑组织
        </button>
        <button class="btn btn--sm" @click=${() => {}}>
          🔐 权限配置
        </button>
        <button class="btn btn--sm" @click=${() => {}}>
          📊 查看统计
        </button>
        <button class="btn btn--sm" @click=${() => {}}>
          📤 导出数据
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// 智能助手招聘向导
// ============================================================================

function renderRecruitWizard(props: OrganizationManagementProps) {
  if (!props.recruitWizardOpen) {
    return nothing;
  }

  const steps: Array<{ id: string; label: string; icon: string }> = [
    { id: "template", label: "选择模板", icon: "📋" },
    { id: "config", label: "能力配置", icon: "⚙️" },
    { id: "position", label: "职位设置", icon: "💼" },
    { id: "review", label: "确认提交", icon: "✅" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === props.recruitWizardStep);

  return html`
    <div class="modal-overlay" @click=${props.onCloseRecruitWizard}>
      <div
        class="modal-dialog"
        style="max-width: 700px; max-height: 85vh; overflow-y: auto; background: var(--bg); border: 1px solid var(--border);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="card" style="margin: 0;">
          <!-- 向导头部 -->
          <div style="padding: 20px; border-bottom: 1px solid var(--border);">
            <div class="card-title" style="margin-bottom: 16px;">🤖 招聘智能助手</div>
            
            <!-- 步骤指示器 -->
            <div class="row" style="gap: 8px; justify-content: space-between;">
              ${steps.map(
                (step, index) => html`
                  <div
                    class="row"
                    style="
                      flex: 1;
                      align-items: center;
                      padding: 8px 12px;
                      border-radius: 6px;
                      background: ${index === currentStepIndex ? "var(--primary)" : "var(--bg-1)"};
                      color: ${index === currentStepIndex ? "white" : "inherit"};
                      opacity: ${index > currentStepIndex ? 0.5 : 1};
                      cursor: ${index < currentStepIndex ? "pointer" : "default"};
                    "
                    @click=${() => {
                      if (index < currentStepIndex) {
                        props.onRecruitStepChange(step.id as any);
                      }
                    }}
                  >
                    <span style="margin-right: 6px;">${step.icon}</span>
                    <span style="font-size: 0.875rem;">${step.label}</span>
                  </div>
                  ${
                    index < steps.length - 1
                      ? html`<div style="width: 16px; text-align: center;">→</div>`
                      : nothing
                  }
                `,
              )}
            </div>
          </div>

          <!-- 向导内容 -->
          <div style="padding: 20px;">
            ${renderRecruitStep(props)}
          </div>

          <!-- 向导底部：操作按钮 -->
          <div style="padding: 16px 20px; border-top: 1px solid var(--border); display: flex; justify-content: space-between;">
            <button
              class="btn btn--sm"
              @click=${props.onCloseRecruitWizard}
              ?disabled=${props.recruitSaving}
            >
              取消
            </button>
            
            <div class="row" style="gap: 8px;">
              ${
                currentStepIndex > 0
                  ? html`
                    <button
                      class="btn btn--sm"
                      @click=${() => props.onRecruitStepChange(steps[currentStepIndex - 1].id as any)}
                      ?disabled=${props.recruitSaving}
                    >
                      ← 上一步
                    </button>
                  `
                  : nothing
              }
              
              ${
                currentStepIndex < steps.length - 1
                  ? html`
                    <button
                      class="btn btn--sm btn--primary"
                      @click=${() => props.onRecruitStepChange(steps[currentStepIndex + 1].id as any)}
                      ?disabled=${!canProceedToNextStep(props)}
                    >
                      下一步 →
                    </button>
                  `
                  : html`
                    <button
                      class="btn btn--sm btn--primary"
                      @click=${props.onSubmitRecruitRequest}
                      ?disabled=${props.recruitSaving || !canSubmitRecruit(props)}
                    >
                      ${props.recruitSaving ? "提交中..." : "提交招聘请求"}
                    </button>
                  `
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderRecruitStep(props: OrganizationManagementProps) {
  switch (props.recruitWizardStep) {
    case "template":
      return renderTemplateStep(props);
    case "config":
      return renderConfigStep(props);
    case "position":
      return renderPositionStep(props);
    case "review":
      return renderReviewStep(props);
    default:
      return nothing;
  }
}

// 步骤 1: 选择模板
function renderTemplateStep(props: OrganizationManagementProps) {
  const categories = Array.from(new Set(props.agentTemplates.map((t) => t.category)));

  return html`
    <div>
      <div style="font-weight: 600; margin-bottom: 16px;">选择智能助手模板</div>
      
      ${
        props.recruitError
          ? html`
            <div class="callout error" style="margin-bottom: 16px;">
              ❌ ${props.recruitError}
            </div>
          `
          : nothing
      }
      
      ${categories.map(
        (category) => html`
          <div style="margin-bottom: 24px;">
            <div style="font-weight: 500; margin-bottom: 12px; color: var(--primary);">
              ${category}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
              ${props.agentTemplates
                .filter((t) => t.category === category)
                .map(
                  (template) => html`
                    <div
                      class="list-item ${props.recruitRequest?.templateId === template.id ? "selected" : ""}"
                      style="
                        padding: 16px;
                        cursor: pointer;
                        border-radius: 8px;
                        background: ${props.recruitRequest?.templateId === template.id ? "var(--bg-2)" : "var(--bg-1)"};
                        border: 2px solid ${props.recruitRequest?.templateId === template.id ? "var(--primary)" : "transparent"};
                      "
                      @click=${() => props.onSelectTemplate(template.id)}
                    >
                      <div style="font-size: 2rem; margin-bottom: 8px;">${template.emoji}</div>
                      <div style="font-weight: 600; margin-bottom: 8px;">${template.name}</div>
                      <div class="muted" style="font-size: 0.875rem; margin-bottom: 12px;">
                        ${template.description}
                      </div>
                      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${template.capabilities.slice(0, 3).map(
                          (cap) => html`
                            <span style="font-size: 0.75rem; padding: 2px 8px; background: var(--bg-2); border-radius: 4px;">
                              ${cap}
                            </span>
                          `,
                        )}
                        ${
                          template.capabilities.length > 3
                            ? html`<span style="font-size: 0.75rem;">+${template.capabilities.length - 3}</span>`
                            : nothing
                        }
                      </div>
                    </div>
                  `,
                )}
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

// 步骤 2: 能力配置
function renderConfigStep(props: OrganizationManagementProps) {
  const selectedTemplate = props.agentTemplates.find((t) => t.id === props.recruitRequest?.templateId);

  if (!selectedTemplate) {
    return html`<div class="muted">请先选择模板</div>`;
  }

  return html`
    <div>
      <div style="font-weight: 600; margin-bottom: 16px;">配置智能助手能力</div>
      
      <!-- 基本信息 -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">
          助手名称 <span style="color: var(--error);">*</span>
        </label>
        <input
          type="text"
          class="input"
          style="width: 100%;"
          placeholder="给你的助手起个名字"
          value=${props.recruitRequest?.agentName || ""}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            props.onRecruitFormChange("agentName", target.value);
          }}
        />
      </div>

      <!-- 能力选择 -->
      <div style="margin-bottom: 24px;">
        <div style="font-weight: 500; margin-bottom: 12px;">核心能力（可多选）</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
          ${selectedTemplate.capabilities.map(
            (cap) => html`
              <label style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-1); border-radius: 6px; cursor: pointer;">
                <input
                  type="checkbox"
                  ?checked=${props.recruitRequest?.capabilities?.includes(cap)}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLInputElement;
                    const current = props.recruitRequest?.capabilities || [];
                    const updated = target.checked
                      ? [...current, cap]
                      : current.filter((c) => c !== cap);
                    props.onRecruitFormChange("capabilities", updated);
                  }}
                />
                <span style="font-size: 0.9rem;">${cap}</span>
              </label>
            `,
          )}
        </div>
      </div>

      <!-- 描述 -->
      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">
          职责描述
        </label>
        <textarea
          class="input"
          style="width: 100%; min-height: 100px; resize: vertical;"
          placeholder="描述这个智能助手的具体职责和工作内容"
          .value=${props.recruitRequest?.description || ""}
          @input=${(e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            props.onRecruitFormChange("description", target.value);
          }}
        ></textarea>
      </div>
    </div>
  `;
}

// 步骤 3: 职位设置
function renderPositionStep(props: OrganizationManagementProps) {
  const roles: Array<{ id: string; name: string; description: string }> = [
    { id: "member", name: "成员", description: "基础权限，参与日常工作" },
    { id: "lead", name: "组长", description: "带领小组，协调任务" },
    { id: "manager", name: "经理", description: "管理团队，制定计划" },
    { id: "admin", name: "管理员", description: "完整管理权限" },
  ];

  return html`
    <div>
      <div style="font-weight: 600; margin-bottom: 16px;">设置职位和角色</div>
      
      <!-- 选择组织 -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">
          所属组织 <span style="color: var(--error);">*</span>
        </label>
        <select
          class="input"
          style="width: 100%;"
          .value=${props.recruitRequest?.organizationId || ""}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            props.onRecruitFormChange("organizationId", target.value);
          }}
        >
          <option value="">请选择组织</option>
          ${props.organizations.map(
            (org) => html`
              <option value=${org.id}>
                ${"　".repeat(org.level)}${getOrgIcon(org.type)} ${org.name}
              </option>
            `,
          )}
        </select>
      </div>

      <!-- 职位名称 -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">
          职位名称 <span style="color: var(--error);">*</span>
        </label>
        <input
          type="text"
          class="input"
          style="width: 100%;"
          placeholder="例如：技术总监助手"
          value=${props.recruitRequest?.position || ""}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            props.onRecruitFormChange("position", target.value);
          }}
        />
      </div>

      <!-- 职务头衔 -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">
          职务头衔（可选）
        </label>
        <input
          type="text"
          class="input"
          style="width: 100%;"
          placeholder="例如：高级技术顾问"
          value=${props.recruitRequest?.title || ""}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            props.onRecruitFormChange("title", target.value);
          }}
        />
      </div>

      <!-- 角色选择 -->
      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 12px;">
          权限角色 <span style="color: var(--error);">*</span>
        </label>
        <div style="display: grid; gap: 12px;">
          ${roles.map(
            (role) => html`
              <label
                style="
                  display: flex;
                  gap: 12px;
                  padding: 12px;
                  background: ${props.recruitRequest?.role === role.id ? "var(--bg-2)" : "var(--bg-1)"};
                  border: 2px solid ${props.recruitRequest?.role === role.id ? "var(--primary)" : "transparent"};
                  border-radius: 8px;
                  cursor: pointer;
                "
              >
                <input
                  type="radio"
                  name="role"
                  value=${role.id}
                  ?checked=${props.recruitRequest?.role === role.id}
                  @change=${() => props.onRecruitFormChange("role", role.id)}
                />
                <div style="flex: 1;">
                  <div style="font-weight: 500; margin-bottom: 4px;">${role.name}</div>
                  <div class="muted" style="font-size: 0.875rem;">${role.description}</div>
                </div>
              </label>
            `,
          )}
        </div>
      </div>
    </div>
  `;
}

// 步骤 4: 确认提交
function renderReviewStep(props: OrganizationManagementProps) {
  if (!props.recruitRequest) {
    return html`<div class="muted">请完成前面的步骤</div>`;
  }

  const template = props.agentTemplates.find((t) => t.id === props.recruitRequest?.templateId);
  const org = props.organizations.find((o) => o.id === props.recruitRequest?.organizationId);

  return html`
    <div>
      <div style="font-weight: 600; margin-bottom: 16px;">确认招聘信息</div>
      
      ${
        props.recruitError
          ? html`
            <div class="callout error" style="margin-bottom: 16px;">
              ❌ ${props.recruitError}
            </div>
          `
          : nothing
      }
      
      <div class="card" style="padding: 16px; background: var(--bg-1); margin-bottom: 16px;">
        <div style="display: grid; gap: 16px;">
          <!-- 基本信息 -->
          <div>
            <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">智能助手名称</div>
            <div style="font-weight: 600; font-size: 1.1rem;">${props.recruitRequest.agentName}</div>
          </div>

          <div style="border-top: 1px solid var(--border);"></div>

          <!-- 模板 -->
          ${
            template
              ? html`
                <div>
                  <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">使用模板</div>
                  <div>${template.emoji} ${template.name}</div>
                </div>
              `
              : nothing
          }

          <!-- 组织 -->
          ${
            org
              ? html`
                <div>
                  <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">所属组织</div>
                  <div>${getOrgIcon(org.type)} ${org.name}</div>
                </div>
              `
              : nothing
          }

          <!-- 职位 -->
          <div>
            <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">职位</div>
            <div>
              ${props.recruitRequest.position}
              ${
                props.recruitRequest.title
                  ? html` <span class="muted">• ${props.recruitRequest.title}</span>`
                  : nothing
              }
            </div>
          </div>

          <!-- 角色 -->
          <div>
            <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">权限角色</div>
            <div>${getRoleName(props.recruitRequest.role)}</div>
          </div>

          <!-- 能力 -->
          ${
            props.recruitRequest.capabilities && props.recruitRequest.capabilities.length > 0
              ? html`
                <div>
                  <div class="muted" style="font-size: 0.875rem; margin-bottom: 8px;">核心能力</div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${props.recruitRequest.capabilities.map(
                      (cap) => html`
                        <span style="padding: 4px 12px; background: var(--bg-2); border-radius: 6px; font-size: 0.875rem;">
                          ${cap}
                        </span>
                      `,
                    )}
                  </div>
                </div>
              `
              : nothing
          }

          <!-- 描述 -->
          ${
            props.recruitRequest.description
              ? html`
                <div>
                  <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">职责描述</div>
                  <div style="white-space: pre-wrap;">${props.recruitRequest.description}</div>
                </div>
              `
              : nothing
          }
        </div>
      </div>

      <div class="callout info">
        💡 提交后将创建招聘请求，需要组织管理员审批后才会正式创建智能助手。
      </div>
    </div>
  `;
}

// 辅助函数：检查是否可以进入下一步
function canProceedToNextStep(props: OrganizationManagementProps): boolean {
  if (!props.recruitRequest) return false;

  switch (props.recruitWizardStep) {
    case "template":
      return !!props.recruitRequest.templateId;
    case "config":
      return !!props.recruitRequest.agentName && props.recruitRequest.agentName.trim().length > 0;
    case "position":
      return (
        !!props.recruitRequest.organizationId &&
        !!props.recruitRequest.position &&
        props.recruitRequest.position.trim().length > 0 &&
        !!props.recruitRequest.role
      );
    default:
      return true;
  }
}

// 辅助函数：检查是否可以提交招聘
function canSubmitRecruit(props: OrganizationManagementProps): boolean {
  if (!props.recruitRequest) return false;
  
  return (
    !!props.recruitRequest.templateId &&
    !!props.recruitRequest.agentName &&
    props.recruitRequest.agentName.trim().length > 0 &&
    !!props.recruitRequest.organizationId &&
    !!props.recruitRequest.position &&
    props.recruitRequest.position.trim().length > 0 &&
    !!props.recruitRequest.role
  );
}

// ============================================================================
// 成员详情对话框
// ============================================================================

function renderMemberDetailDialog(props: OrganizationManagementProps) {
  if (!props.memberDetailOpen || !props.selectedMember) {
    return nothing;
  }

  const member = props.selectedMember;
  const org = props.organizations.find((o) => o.id === member.organizationId);

  return html`
    <div class="modal-overlay" @click=${() => props.onShowMemberDetail(null)}>
      <div
        class="modal-dialog"
        style="max-width: 500px; background: var(--bg); border: 1px solid var(--border);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="card" style="margin: 0;">
          <div style="padding: 20px;">
            <!-- 头像和基本信息 -->
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="width: 80px; height: 80px; margin: 0 auto 16px; border-radius: 50%; background: var(--bg-2); display: flex; align-items: center; justify-content: center; font-size: 2.5rem;">
                ${member.type === "agent" ? "🤖" : "👤"}
              </div>
              <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 8px;">
                ${member.name}
              </div>
              ${
                member.title
                  ? html`<div class="muted" style="margin-bottom: 8px;">${member.title}</div>`
                  : nothing
              }
              <div style="display: inline-block; padding: 4px 12px; background: var(--bg-2); border-radius: 6px; font-size: 0.875rem;">
                ${getRoleName(member.role)}
              </div>
            </div>

            <!-- 详细信息 -->
            <div style="display: grid; gap: 16px;">
              <div>
                <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">类型</div>
                <div>${member.type === "agent" ? "🤖 智能助手" : "👤 人类成员"}</div>
              </div>

              ${
                org
                  ? html`
                    <div>
                      <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">所属组织</div>
                      <div>${getOrgIcon(org.type)} ${org.name}</div>
                    </div>
                  `
                  : nothing
              }

              <div>
                <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">状态</div>
                <div>
                  ${member.status === "active" ? "🟢 活跃" : member.status === "inactive" ? "⚫ 不活跃" : "🟡 待确认"}
                </div>
              </div>

              <div>
                <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">加入时间</div>
                <div>${new Date(member.joinedAt).toLocaleString()}</div>
              </div>

              ${
                member.reportTo
                  ? html`
                    <div>
                      <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">汇报给</div>
                      <div>${member.reportTo}</div>
                    </div>
                  `
                  : nothing
              }

              ${
                member.manages && member.manages.length > 0
                  ? html`
                    <div>
                      <div class="muted" style="font-size: 0.875rem; margin-bottom: 4px;">管理成员</div>
                      <div>${member.manages.length} 人</div>
                    </div>
                  `
                  : nothing
              }
            </div>

            <!-- 操作按钮 -->
            <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
              <div class="row" style="gap: 8px; justify-content: flex-end;">
                <button
                  class="btn btn--sm"
                  @click=${() => props.onShowMemberDetail(null)}
                >
                  关闭
                </button>
                <button
                  class="btn btn--sm btn--primary"
                  @click=${() => {
                    props.onEditMember(member.id);
                    props.onShowMemberDetail(null);
                  }}
                >
                  ✏️ 编辑
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
