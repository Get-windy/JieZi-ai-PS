import { html, nothing } from "lit";
import { t } from "../i18n.ts";
import type { AgentsListResult } from "../types.ts";

/**
 * 项目信息
 */
export interface ProjectInfo {
  projectId: string;
  name: string;
  description?: string;
  workspacePath: string;
  codeDir: string;
  docsDir?: string;
  requirementsDir?: string;
  qaDir?: string;
  testsDir?: string;
  ownerId?: string;
  createdAt?: number;
  groups?: Array<{
    groupId: string;
    name: string;
    description?: string;
    ownerId: string;
    createdAt: number;
    memberCount: number;
  }>;
}

/**
 * 项目列表结果
 */
export interface ProjectsListResult {
  projects: ProjectInfo[];
  total: number;
}

export type ProjectsProps = {
  loading: boolean;
  error: string | null;
  projectsList: ProjectsListResult | null;
  selectedProjectId: string | null;
  activePanel: "list" | "config" | "members" | "progress";
  creatingProject: boolean;
  editingProject: ProjectInfo | null;
  agentsList: AgentsListResult | null;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectPanel: (panel: "list" | "config" | "members" | "progress") => void;
  onCreateProject: () => void;
  onEditProject: (projectId: string) => void;
  onSaveProject: () => void;
  onCancelProjectEdit: () => void;
  onProjectFormChange: (field: string, value: any) => void;
  onAddMember: (projectId: string, agentId: string, role: string) => void;
  onRemoveMember: (projectId: string, agentId: string) => void;
  onUpdateMemberRole: (projectId: string, agentId: string, role: string) => void;
  onUpdateProgress: (projectId: string, progress: number, notes: string) => void;
};

export function renderProjects(props: ProjectsProps) {
  const projects = props.projectsList?.projects ?? [];
  const selectedId = props.selectedProjectId ?? projects[0]?.projectId ?? null;
  const selectedProject = selectedId ? (projects.find((p) => p.projectId === selectedId) ?? null) : null;

  return html`
    <div class="projects-layout">
      ${renderProjectsSidebar(props)}
      ${selectedProject ? renderProjectContent(props, selectedProject) : renderEmptyState(props)}
    </div>

    ${props.creatingProject || props.editingProject ? renderProjectEditModal(props) : nothing}
  `;
}

function renderProjectsSidebar(props: ProjectsProps) {
  const projects = props.projectsList?.projects ?? [];
  const selectedId = props.selectedProjectId ?? projects[0]?.projectId ?? null;

  return html`
    <section class="card projects-sidebar">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("projects.title")}</div>
          <div class="card-sub">共 ${projects.length} 个项目</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button 
            class="btn btn--sm" 
            ?disabled=${props.loading} 
            @click=${props.onCreateProject}
          >
            创建项目
          </button>
          <button 
            class="btn btn--sm" 
            ?disabled=${props.loading} 
            @click=${props.onRefresh}
          >
            ${props.loading ? "加载中..." : "刷新"}
          </button>
        </div>
      </div>
      
      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }
      
      <div class="project-list" style="margin-top: 12px;">
        ${
          projects.length === 0
            ? html`<div class="empty">暂无项目</div>`
            : projects.map(
                (project) => html`
                  <div
                    class="list-item ${selectedId === project.projectId ? "active" : ""}"
                    @click=${() => props.onSelectProject(project.projectId)}
                    style="cursor: pointer;"
                  >
                    <div style="flex: 1;">
                      <div class="list-title">${project.name}</div>
                      <div class="list-sub">
                        ${project.description || "暂无描述"}
                      </div>
                      <div class="chip-row" style="margin-top: 6px;">
                        <span class="chip">${project.groups?.length || 0} 个群组</span>
                        ${project.ownerId ? html`<span class="chip">管理员：${project.ownerId}</span>` : nothing}
                      </div>
                    </div>
                  </div>
                `,
              )
        }
      </div>
    </section>
  `;
}

function renderProjectContent(props: ProjectsProps, project: ProjectInfo) {
  return html`
    <section class="card project-content">
      ${renderProjectTabs(props.activePanel, props.onSelectPanel)}
      
      <div style="margin-top: 16px;">
        ${
          props.activePanel === "list"
            ? renderProjectOverview(props, project)
            : props.activePanel === "config"
              ? renderProjectConfig(props, project)
              : props.activePanel === "members"
                ? renderProjectMembers(props, project)
                : renderProjectProgress(props, project)
        }
      </div>
    </section>
  `;
}

function renderProjectTabs(
  active: ProjectsProps["activePanel"],
  onSelect: (panel: ProjectsProps["activePanel"]) => void,
) {
  const tabs = [
    { id: "list" as const, label: "项目概况", icon: "📊" },
    { id: "config" as const, label: "项目配置", icon: "⚙️" },
    { id: "members" as const, label: "成员管理", icon: "👥" },
    { id: "progress" as const, label: "项目进度", icon: "📈" },
  ];

  return html`
    <div class="agent-tabs" style="margin-top: 16px;">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            <span style="margin-right: 6px;">${tab.icon}</span>
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderProjectOverview(props: ProjectsProps, project: ProjectInfo) {
  return html`
    <div class="project-overview">
      <h3>项目概况</h3>
      
      <div class="info-grid">
        <div class="info-item">
          <label>项目 ID</label>
          <div>${project.projectId}</div>
        </div>
        <div class="info-item">
          <label>项目名称</label>
          <div>${project.name}</div>
        </div>
        <div class="info-item">
          <label>描述</label>
          <div>${project.description || "暂无描述"}</div>
        </div>
        <div class="info-item">
          <label>工作空间</label>
          <div>${project.workspacePath || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>代码目录</label>
          <div>${project.codeDir || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>文档目录</label>
          <div>${project.docsDir || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>测试目录</label>
          <div>${project.testsDir || "未设置"}</div>
        </div>
        <div class="info-item">
          <label>关联群组</label>
          <div>${project.groups?.length || 0} 个</div>
        </div>
      </div>

      ${
        project.groups && project.groups.length > 0
          ? html`
            <div style="margin-top: 24px;">
              <h4>关联的群组</h4>
              <div class="group-list">
                ${project.groups.map(
                  (group) => html`
                    <div class="list-item">
                      <div style="flex: 1;">
                        <div class="list-title">${group.name}</div>
                        <div class="list-sub">${group.description || "暂无描述"}</div>
                        <div class="chip-row" style="margin-top: 6px;">
                          <span class="chip">${group.memberCount} 名成员</span>
                          <span class="chip">ID: ${group.groupId}</span>
                        </div>
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : html`
            <div class="callout info" style="margin-top: 24px;">
              暂无关联群组
            </div>
          `
      }

      <div style="margin-top: 24px; display: flex; gap: 8px;">
        <button class="btn" @click=${() => props.onEditProject(project.projectId)}>
          编辑项目
        </button>
        <button class="btn btn--primary" @click=${() => {}}>
          打开工作空间
        </button>
      </div>
    </div>
  `;
}

function renderProjectConfig(props: ProjectsProps, project: ProjectInfo) {
  return html`
    <div class="project-config">
      <h3>项目配置</h3>
      
      <div class="form-group">
        <label>项目 ID</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.projectId}"
          disabled
        />
        <small>项目唯一标识符，创建后不可修改</small>
      </div>

      <div class="form-group">
        <label>项目名称</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.name}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("name", target.value);
          }}
        />
      </div>

      <div class="form-group">
        <label>描述</label>
        <textarea 
          class="form-control"
          rows="3"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLTextAreaElement;
            props.onProjectFormChange("description", target.value);
          }}
        >${project.description || ""}</textarea>
      </div>

      <div class="form-group">
        <label>工作空间路径</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.workspacePath || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("workspacePath", target.value);
          }}
        />
        <small>项目工作空间根目录，将同步到所有项目群</small>
      </div>

      <div class="form-group">
        <label>代码目录</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.codeDir || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("codeDir", target.value);
          }}
        />
      </div>

      <div class="form-group">
        <label>文档目录</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.docsDir || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("docsDir", target.value);
          }}
        />
      </div>

      <div class="form-group">
        <label>测试目录</label>
        <input 
          type="text" 
          class="form-control" 
          value="${project.testsDir || ""}"
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            props.onProjectFormChange("testsDir", target.value);
          }}
        />
      </div>

      <div style="margin-top: 24px; display: flex; gap: 8px;">
        <button 
          class="btn btn--primary" 
          @click=${props.onSaveProject}
        >
          保存配置
        </button>
        <button class="btn" @click=${props.onCancelProjectEdit}>
          取消
        </button>
      </div>
    </div>
  `;
}

function renderProjectMembers(props: ProjectsProps, project: ProjectInfo) {
  const agents = props.agentsList?.agents ?? [];
  
  return html`
    <div class="project-members">
      <h3>成员管理</h3>
      
      <div class="callout info" style="margin-bottom: 16px;">
        管理项目组成员和权限。项目管理员可以管理项目配置、分配任务和审批变更。
      </div>

      <div class="member-section">
        <h4>添加成员</h4>
        <div class="form-group">
          <label>选择智能助手</label>
          <select 
            class="form-control"
            @change=${(e: Event) => {
              const target = e.target as HTMLSelectElement;
              if (target.value) {
                props.onAddMember(project.projectId, target.value, "member");
              }
            }}
          >
            <option value="">请选择智能助手</option>
            ${agents.map(
              (agent) => html`
                <option value="${agent.id}">${agent.name || agent.id}</option>
              `,
            )}
          </select>
        </div>
      </div>

      <div style="margin-top: 24px;">
        <h4>项目管理员设置</h4>
        <div class="form-group">
          <label>项目负责人 (Owner)</label>
          <input 
            type="text" 
            class="form-control" 
            value="${project.ownerId || ""}"
            @input=${(e: InputEvent) => {
              const target = e.target as HTMLInputElement;
              props.onProjectFormChange("ownerId", target.value);
            }}
          />
          <small>设置或更换项目负责人，负责人拥有最高管理权限</small>
        </div>
        
        <div class="form-group" style="margin-top: 16px;">
          <label>授予 Agent 管理员权限</label>
          <div style="margin-top: 8px;">
            ${agents.filter(a => a.id !== project.ownerId).map(
              (agent) => html`
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                  <input 
                    type="checkbox" 
                    id="admin-${agent.id}"
                    ?checked=${false}
                    @change=${(e: Event) => {
                      const target = e.target as HTMLInputElement;
                      if (target.checked) {
                        props.onUpdateMemberRole(project.projectId, agent.id, "admin");
                      } else {
                        props.onUpdateMemberRole(project.projectId, agent.id, "member");
                      }
                    }}
                  />
                  <label for="admin-${agent.id}" style="cursor: pointer;">
                    ${agent.name || agent.id} - 授予管理员权限
                  </label>
                </div>
              `,
            )}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderProjectProgress(props: ProjectsProps, project: ProjectInfo) {
  return html`
    <div class="project-progress">
      <h3>项目进度</h3>
      
      <div class="progress-section">
        <div class="form-group">
          <label>当前进度</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value="0"
            class="form-control"
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onUpdateProgress(project.projectId, parseInt(target.value), "");
            }}
          />
          <div style="text-align: center; margin-top: 8px; font-size: 24px; font-weight: bold;">
            0%
          </div>
        </div>

        <div class="form-group">
          <label>进度说明</label>
          <textarea 
            class="form-control"
            rows="4"
            placeholder="输入当前进度的详细说明、里程碑完成情况等"
            @input=${(e: InputEvent) => {
              const target = e.target as HTMLTextAreaElement;
              props.onUpdateProgress(project.projectId, 0, target.value);
            }}
          ></textarea>
        </div>

        <div style="margin-top: 16px;">
          <button class="btn btn--primary" @click=${() => {}}>
            更新进度
          </button>
        </div>
      </div>

      <div style="margin-top: 24px;">
        <h4>进度历史</h4>
        <div class="callout info">
          暂无进度记录
        </div>
      </div>
    </div>
  `;
}

function renderEmptyState(props: ProjectsProps) {
  return html`
    <section class="card">
      <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
        <h3>暂无项目</h3>
        <p>创建第一个项目来开始协作管理</p>
        <button 
          class="btn btn--primary" 
          style="margin-top: 16px;"
          @click=${props.onCreateProject}
        >
          创建第一个项目
        </button>
      </div>
    </section>
  `;
}

function renderProjectEditModal(props: ProjectsProps) {
  const project = props.editingProject || { 
    projectId: "", 
    name: "", 
    description: "",
    workspacePath: "",
    codeDir: "",
    docsDir: "",
    testsDir: "",
  };

  return html`
    <div class="modal-overlay" @click=${props.onCancelProjectEdit}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>${props.editingProject ? "编辑项目" : "创建项目"}</h3>
          <button class="modal-close" @click=${props.onCancelProjectEdit}>×</button>
        </div>
        
        <div class="modal-body">
          <div class="form-group">
            <label>项目 ID</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.projectId}"
              ?disabled=${!!props.editingProject}
              placeholder="例如：project-alpha"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("projectId", target.value);
              }}
            />
            <small>项目唯一标识符，创建后不可修改</small>
          </div>

          <div class="form-group">
            <label>项目名称</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.name}"
              placeholder="例如：Alpha 项目"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("name", target.value);
              }}
            />
          </div>

          <div class="form-group">
            <label>描述</label>
            <textarea 
              class="form-control"
              rows="3"
              placeholder="项目描述..."
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLTextAreaElement;
                props.onProjectFormChange("description", target.value);
              }}
            >${project.description || ""}</textarea>
          </div>

          <div class="form-group">
            <label>工作空间根目录</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.workspacePath || ""}"
              placeholder="例如：H:\\OpenClaw_Workspace\\groups\\project-alpha"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("workspacePath", target.value);
              }}
            />
          </div>

          <div class="form-group">
            <label>代码目录</label>
            <input 
              type="text" 
              class="form-control" 
              value="${project.codeDir || ""}"
              placeholder="例如：I:\\Alpha_Project\\code"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onProjectFormChange("codeDir", target.value);
              }}
            />
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${props.onCancelProjectEdit}>
            取消
          </button>
          <button 
            class="btn btn--primary" 
            @click=${props.onSaveProject}
            ?disabled=${!project.projectId || !project.name}
          >
            ${props.editingProject ? "保存修改" : "创建项目"}
          </button>
        </div>
      </div>
    </div>
  `;
}
