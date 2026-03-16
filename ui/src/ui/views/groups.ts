import { html, nothing } from "lit";
import type { GroupFilesListResult } from "../controllers/group-files.ts";
// oxlint-disable-next-line no-unused-vars
import { t } from "../i18n.ts";
import type { AgentsListResult } from "../types.ts";

// 重新导出 GroupFileEntry 供外部使用
export type { GroupFilesListResult } from "../controllers/group-files.ts";

/**
 * 群组成员角色
 */
export type GroupMemberRole = "owner" | "admin" | "member";

/**
 * 群组成员信息
 */
export interface GroupMember {
  agentId: string;
  role: GroupMemberRole;
  joinedAt: number;
  muted?: boolean;
  nickname?: string;
}

/**
 * 群组信息
 */
export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: number;
  members: GroupMember[];
  maxMembers?: number;
  isPublic: boolean;
  tags?: string[];
  // oxlint-disable-next-line typescript/no-explicit-any
  metadata?: Record<string, any>;
  // 项目绑定相关字段
  projectId?: string; // 如果绑定项目，则存储项目 ID
  workspacePath?: string; // 项目工作空间路径 (项目群特有)
}

/**
 * 群组列表结果
 */
export interface GroupsListResult {
  groups: GroupInfo[];
  total: number;
}

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
  createGroup?: boolean; // 创建项目时是否同时创建项目群
}

/**
 * 项目列表结果
 */
export interface ProjectsListResult {
  projects: ProjectInfo[];
  total: number;
}

export type GroupsProps = {
  loading: boolean;
  error: string | null;
  groupsList: GroupsListResult | null;
  selectedGroupId: string | null;
  activePanel: "list" | "members" | "settings" | "files";
  creatingGroup: boolean;
  editingGroup: GroupInfo | null;
  agentsList: AgentsListResult | null;
  onRefresh: () => void;
  onSelectGroup: (groupId: string) => void;
  onSelectPanel: (panel: "list" | "members" | "settings" | "files") => void;
  onCreateGroup: () => void;
  onEditGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSaveGroup: () => void;
  onCancelEdit: () => void;
  // oxlint-disable-next-line typescript/no-explicit-any
  onGroupFormChange: (field: string, value: any) => void;
  onAddMember: (groupId: string, agentId: string, role: GroupMemberRole) => void;
  onRemoveMember: (groupId: string, agentId: string) => void;
  onUpdateMemberRole: (groupId: string, agentId: string, role: GroupMemberRole) => void;
  // 文件管理
  groupFilesLoading: boolean;
  groupFilesError: string | null;
  groupFilesList: GroupFilesListResult | null;
  groupFileActive: string | null;
  groupFileContents: Record<string, string>;
  groupFileDrafts: Record<string, string>;
  groupFileSaving: boolean;
  onLoadGroupFiles: (groupId: string) => void;
  onSelectGroupFile: (name: string) => void;
  onGroupFileDraftChange: (name: string, content: string) => void;
  onGroupFileReset: (name: string) => void;
  onGroupFileSave: (name: string) => void;
  onAddGroupFile: (groupId: string, name: string) => void;
  onDeleteGroupFile: (groupId: string, name: string) => void;
  onOpenGroupFolder: (folderPath: string) => void;
  // 工作空间迁移
  groupWorkspaceMigrating: boolean;
  onMigrateGroupWorkspace: (groupId: string, newDir: string) => void;
  // 项目管理
  projectsList: ProjectsListResult | null;
  projectsLoading: boolean;
  projectsError: string | null;
  selectedProjectId: string | null;
  activeProjectPanel: "list" | "config";
  creatingProject: boolean;
  editingProject: ProjectInfo | null;
  onProjectsRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectProjectPanel: (panel: "list" | "config") => void;
  onCreateProject: () => void;
  onEditProject: (projectId: string) => void;
  onSaveProject: () => void;
  onCancelProjectEdit: () => void;
  // oxlint-disable-next-line typescript/no-explicit-any
  onProjectFormChange: (field: string, value: any) => void;
  // 群组升级
  upgradingGroupToProject: boolean;
  onUpgradeGroupToProject: (groupId: string, projectId: string) => void;
  // 更换群主 / 项目负责人
  onTransferGroupOwner: (groupId: string, newOwnerId: string) => void;
  onTransferProjectOwner: (projectId: string, newOwnerId: string) => void;
};

export function renderGroups(props: GroupsProps) {
  const groups = props.groupsList?.groups ?? [];
  const selectedId = props.selectedGroupId ?? groups[0]?.id ?? null;
  const selectedGroup = selectedId ? (groups.find((g) => g.id === selectedId) ?? null) : null;

  return html`
    <div class="groups-layout">
      ${renderGroupsSidebar(props)}
      ${selectedGroup ? renderGroupContent(props, selectedGroup) : renderProjectsSection(props)}
    </div>

    ${props.creatingGroup || props.editingGroup ? renderGroupEditModal(props) : nothing}
    ${props.creatingProject || props.editingProject ? renderProjectEditModal(props) : nothing}
    ${props.upgradingGroupToProject ? renderUpgradeGroupModal(props) : nothing}
  `;
}

function renderGroupsSidebar(props: GroupsProps) {
  const groups = props.groupsList?.groups ?? [];
  const selectedId = props.selectedGroupId ?? groups[0]?.id ?? null;

  return html`
    <section class="card groups-sidebar">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">群组管理</div>
          <div class="card-sub">共 ${groups.length} 个群组</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onCreateGroup}>
            创建群组
          </button>
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "加载中..." : "刷新"}
          </button>
        </div>
      </div>
      
      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }
      
      <div class="group-list" style="margin-top: 12px;">
        ${
          groups.length === 0
            ? html`
                <div class="empty">暂无群组</div>
              `
            : groups.map(
                (group) => html`
                  <div
                    class="list-item ${selectedId === group.id ? "active" : ""}"
                    @click=${() => props.onSelectGroup(group.id)}
                    style="cursor: pointer;"
                  >
                    <div style="flex: 1;">
                      <div class="list-title">${group.name}</div>
                      <div class="list-sub">
                        ${group.description || "暂无描述"}
                      </div>
                      <div class="chip-row" style="margin-top: 6px;">
                        <span class="chip">${group.members.length} 成员</span>
                        ${
                          group.isPublic
                            ? html`
                                <span class="chip">公开</span>
                              `
                            : html`
                                <span class="chip">私密</span>
                              `
                        }
                        ${group.tags?.map((tag) => html`<span class="chip">${tag}</span>`)}
                      </div>
                    </div>
                    <div class="list-meta">
                      <button
                        class="btn btn--sm"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          props.onDeleteGroup(group.id);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                `,
              )
        }
      </div>
    </section>
  `;
}

function renderGroupContent(props: GroupsProps, selectedGroup: GroupInfo) {
  const isProjectGroup = !!selectedGroup.projectId;

  return html`
    <section class="card groups-content" style="flex: 1;">
      <div class="group-header">
        <div>
          <div class="card-title">${selectedGroup.name}</div>
          <div class="card-sub">${selectedGroup.description || "暂无描述"}</div>
          ${
            isProjectGroup
              ? html`
          <div class="chip" style="margin-top: 8px; background: var(--color-primary); color: white; padding: 4px 8px; display: inline-block; border-radius: 4px;">
            📁 项目群：${selectedGroup.projectId}
          </div>
          `
              : nothing
          }
        </div>
        <div style="display: flex; gap: 8px;">
          ${
            !isProjectGroup
              ? html`
          <button 
            class="btn btn--sm btn--primary" 
            @click=${() => {
              const projectId = prompt(
                "请输入要绑定的项目 ID:\n\n⚠️ 重要提示：\n1. 升级后群组的工作空间将变更为项目的工作空间\n2. 升级后无法降级！\n\n输入项目 ID:",
              );
              if (projectId && projectId.trim()) {
                props.onUpgradeGroupToProject(selectedGroup.id, projectId.trim());
              }
            }}
          >
            🔄 升级为项目群
          </button>
          `
              : nothing
          }
          <button class="btn btn--sm" @click=${() => props.onEditGroup(selectedGroup.id)}>
            编辑群组
          </button>
        </div>
      </div>

      ${renderGroupTabs(props.activePanel, props.onSelectPanel)}

      ${
        props.activePanel === "list"
          ? renderGroupOverview(selectedGroup)
          : props.activePanel === "members"
            ? renderGroupMembers(selectedGroup, props)
            : props.activePanel === "files"
              ? renderGroupFiles(selectedGroup, props)
              : renderGroupSettings(selectedGroup, props)
      }
    </section>
  `;
}

function renderProjectsSection(props: GroupsProps) {
  const projects = props.projectsList?.projects ?? [];
  const selectedId = props.selectedProjectId ?? projects[0]?.projectId ?? null;
  const selectedProject = selectedId
    ? (projects.find((p) => p.projectId === selectedId) ?? null)
    : null;

  return html`
    <section class="card groups-sidebar" style="width: 400px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">项目管理</div>
          <div class="card-sub">共 ${projects.length} 个项目</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn--sm" ?disabled=${props.projectsLoading} @click=${props.onCreateProject}>
            创建项目
          </button>
          <button class="btn btn--sm" ?disabled=${props.projectsLoading} @click=${props.onProjectsRefresh}>
            ${props.projectsLoading ? "加载中..." : "刷新"}
          </button>
        </div>
      </div>
      
      ${
        props.projectsError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.projectsError}</div>`
          : nothing
      }
      
      <div class="group-list" style="margin-top: 12px;">
        ${
          projects.length === 0
            ? html`
                <div class="empty">暂无项目</div>
              `
            : projects.map(
                (project) => html`
                  <div
                    class="list-item ${selectedId === project.projectId ? "active" : ""}"
                    @click=${() => props.onSelectProject(project.projectId)}
                    style="cursor: pointer;"
                  >
                    <div style="flex: 1;">
                      <div class="list-title">${project.name}</div>
                      <div class="list-sub mono" style="font-size: 12px;">
                        ${project.projectId}
                      </div>
                      <div class="chip-row" style="margin-top: 6px;">
                        <span class="chip" title="工作空间">💼 工作空间</span>
                        <span class="chip" title="代码目录">💻 代码</span>
                      </div>
                    </div>
                    <div class="list-meta">
                      <button
                        class="btn btn--sm"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          props.onEditProject(project.projectId);
                        }}
                      >
                        配置
                      </button>
                    </div>
                  </div>
                `,
              )
        }
      </div>
    </section>

    <section class="card groups-content" style="flex: 1;">
      ${
        selectedProject
          ? html`
              <div class="group-header">
                <div>
                  <div class="card-title">${selectedProject.name}</div>
                  <div class="card-sub mono" style="font-size: 12px;">
                    ID: ${selectedProject.projectId}
                  </div>
                </div>
                <button class="btn btn--sm" @click=${() => props.onEditProject(selectedProject.projectId)}>
                  配置项目
                </button>
              </div>

              ${renderProjectTabs(props.activeProjectPanel, props.onSelectProjectPanel)}

              ${
                props.activeProjectPanel === "list"
                  ? renderProjectOverview(selectedProject)
                  : renderProjectConfig(selectedProject)
              }
            `
          : html`
              <div class="empty">请选择一个项目</div>
            `
      }
    </section>
  `;
}

function renderGroupTabs(
  active: "list" | "members" | "settings" | "files",
  onSelect: (panel: "list" | "members" | "settings" | "files") => void,
) {
  const tabs = [
    { id: "list" as const, label: "概览" },
    { id: "members" as const, label: "成员管理" },
    { id: "files" as const, label: "文件管理" },
    { id: "settings" as const, label: "群组设置" },
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
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderProjectTabs(
  active: "list" | "config",
  onSelect: (panel: "list" | "config") => void,
) {
  const tabs = [
    { id: "list" as const, label: "项目概览" },
    { id: "config" as const, label: "路径配置" },
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
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderGroupOverview(group: GroupInfo) {
  const isProjectGroup = !!group.projectId;

  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="card-title">群组概览</div>
      
      ${
        isProjectGroup
          ? html`
      <div class="callout info" style="margin-bottom: 16px;">
        <strong>📁 项目群</strong>
        <p style="margin: 8px 0 0 0;">
          此群组已绑定项目 <strong>${group.projectId}</strong>，共享工作空间与项目同步。
        </p>
      </div>
      `
          : html`
              <div class="callout warn" style="margin-bottom: 16px">
                <strong>💡 普通群</strong>
                <p style="margin: 8px 0 0 0">此群组未绑定项目，可以升级为项目群以获得项目管理功能。</p>
              </div>
            `
      }
      
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">群组 ID</div>
          <div class="mono">${group.id}</div>
        </div>
        <div class="agent-kv">
          <div class="label">群主</div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="mono">${group.ownerId}</span>
            <button
              class="btn btn--sm"
              @click=${() => {
                const agents = props.agentsList?.agents ?? [];
                const newOwner = prompt(
                  `请输入新群主 ID（当前群主：${group.ownerId}\n可选内容：${agents.map((a) => a.id).join(", ") || "暂无可选"})`,
                  group.ownerId,
                );
                if (newOwner && newOwner.trim() && newOwner.trim() !== group.ownerId) {
                  props.onTransferGroupOwner(group.id, newOwner.trim());
                }
              }}
            >
              🔄 更换群主
            </button>
          </div>
        </div>
        <div class="agent-kv">
          <div class="label">创建时间</div>
          <div>${new Date(group.createdAt).toLocaleString()}</div>
        </div>
        <div class="agent-kv">
          <div class="label">成员数量</div>
          <div>${group.members.length}${group.maxMembers ? ` / ${group.maxMembers}` : ""}</div>
        </div>
        <div class="agent-kv">
          <div class="label">群组类型</div>
          <div>${isProjectGroup ? "📁 项目群" : "👥 普通群"}</div>
        </div>
        ${
          isProjectGroup
            ? html`
        <div class="agent-kv">
          <div class="label">绑定项目</div>
          <div class="mono">${group.projectId}</div>
        </div>
        <div class="agent-kv">
          <div class="label">工作空间</div>
          <div class="mono" style="font-size: 12px;">${group.workspacePath || "未配置"}</div>
        </div>
        `
            : nothing
        }
        <div class="agent-kv">
          <div class="label">群组类型</div>
          <div>${group.isPublic ? "公开群组" : "私密群组"}</div>
        </div>
        <div class="agent-kv">
          <div class="label">群组标签</div>
          <div>${group.tags?.join(", ") || "无"}</div>
        </div>
      </div>
      
      ${
        !isProjectGroup
          ? html`
              <div class="callout" style="margin-top: 16px">
                <strong>🔄 升级项目群:</strong>
                <p style="margin: 8px 0 0 0">将此普通群升级为项目群，绑定到指定项目。</p>
                <p style="margin: 8px 0 0 0; color: var(--color-warn)">
                  <strong>⚠️ 重要：升级后群组的工作空间将统一为项目的工作空间，且无法降级！</strong>
                </p>
                <ul style="margin: 8px 0 0 20px">
                  <li><strong>工作空间统一：</strong>共享工作空间将迁移到项目工作空间路径</li>
                  <li><strong>双向绑定：</strong>项目工作空间更新时，群工作空间自动同步</li>
                  <li><strong>项目协作：</strong>群聊将成为项目群聊，可以使用项目的代码目录和文档</li>
                  <li><strong>不可逆操作：</strong>项目群不能降级为普通群</li>
                </ul>
              </div>
            `
          : nothing
      }
    </section>
  `;
}

function renderGroupMembers(group: GroupInfo, props: GroupsProps) {
  const getRoleBadge = (role: GroupMemberRole) => {
    const badges = {
      owner: { text: "群主", color: "var(--color-primary)" },
      admin: { text: "管理员", color: "var(--color-info)" },
      member: { text: "成员", color: "var(--color-muted)" },
    };
    const badge = badges[role];
    return html`<span class="chip" style="background: ${badge.color};">${badge.text}</span>`;
  };

  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between; margin-bottom: 16px;">
        <div class="card-title">成员管理</div>
        <button class="btn btn--sm" @click=${() => {
          const agentId = prompt("请输入要添加的智能助手ID：");
          if (agentId) {
            props.onAddMember(group.id, agentId.trim(), "member");
          }
        }}>
          添加成员
        </button>
      </div>

      <div class="list">
        ${group.members.map(
          (member) => html`
            <div class="list-item">
              <div style="flex: 1;">
                <div class="list-title mono">${member.agentId}</div>
                ${member.nickname ? html`<div class="list-sub">${member.nickname}</div>` : nothing}
                <div class="chip-row" style="margin-top: 6px;">
                  ${getRoleBadge(member.role)}
                  ${
                    member.muted
                      ? html`
                          <span class="chip chip-warn">已禁言</span>
                        `
                      : nothing
                  }
                  <span class="chip muted">加入于 ${new Date(member.joinedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="list-meta" style="display: flex; gap: 8px;">
                ${
                  member.role !== "owner"
                    ? html`
                        <select
                          @change=${(e: Event) => {
                            const target = e.target as HTMLSelectElement;
                            props.onUpdateMemberRole(
                              group.id,
                              member.agentId,
                              target.value as GroupMemberRole,
                            );
                          }}
                        >
                          <option value="member" ?selected=${member.role === "member"}>成员</option>
                          <option value="admin" ?selected=${member.role === "admin"}>管理员</option>
                        </select>
                        <button
                          class="btn btn--sm btn--danger"
                          @click=${() => {
                            if (confirm(`确定要移除成员 ${member.agentId} 吗？`)) {
                              props.onRemoveMember(group.id, member.agentId);
                            }
                          }}
                        >
                          移除
                        </button>
                      `
                    : nothing
                }
              </div>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

// oxlint-disable-next-line no-unused-vars
function renderGroupSettings(group: GroupInfo, props: GroupsProps) {
  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="card-title">群组设置</div>
      <div style="margin-top: 16px;">
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">群组名称</label>
          <input
            type="text"
            class="form-control"
            .value=${group.name}
            placeholder="输入群组名称"
            disabled
          />
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">群组描述</label>
          <textarea
            class="form-control"
            .value=${group.description || ""}
            placeholder="输入群组描述"
            rows="3"
            disabled
          ></textarea>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">最大成员数</label>
          <input
            type="number"
            class="form-control"
            .value=${String(group.maxMembers || "")}
            placeholder="不限制"
            disabled
          />
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="cfg-toggle">
            <input type="checkbox" .checked=${group.isPublic} disabled />
            <span class="cfg-toggle__track"></span>
            <span style="margin-left: 8px;">公开群组（允许任何人加入）</span>
          </label>
        </div>

        <div class="callout" style="margin-top: 16px;">
          提示：群组设置修改功能正在开发中
        </div>
      </div>
    </section>
  `;
}

function renderProjectOverview(project: ProjectInfo) {
  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="card-title">项目概览</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">项目 ID</div>
          <div class="mono">${project.projectId}</div>
        </div>
        <div class="agent-kv">
          <div class="label">项目名称</div>
          <div>${project.name}</div>
        </div>
        <div class="agent-kv">
          <div class="label">工作空间</div>
          <div class="mono" style="font-size: 12px;">${project.workspacePath}</div>
        </div>
        <div class="agent-kv">
          <div class="label">代码目录</div>
          <div class="mono" style="font-size: 12px;">${project.codeDir}</div>
        </div>
        ${
          project.docsDir
            ? html`
        <div class="agent-kv">
          <div class="label">文档目录</div>
          <div class="mono" style="font-size: 12px;">${project.docsDir}</div>
        </div>
        `
            : nothing
        }
        ${
          project.ownerId
            ? html`
        <div class="agent-kv">
          <div class="label">负责人</div>
          <div class="mono">${project.ownerId}</div>
        </div>
        `
            : nothing
        }
        ${
          project.createdAt
            ? html`
        <div class="agent-kv">
          <div class="label">创建时间</div>
          <div>${new Date(project.createdAt).toLocaleString()}</div>
        </div>
        `
            : nothing
        }
      </div>
      
      <div class="callout info" style="margin-top: 16px;">
        <strong>💡 提示:</strong>
        <ul style="margin: 8px 0 0 20px;">
          <li>项目 ID 初始化后不可修改</li>
          <li>工作空间和代码目录可以重新配置</li>
          <li>PROJECT_CONFIG.json 会自动同步更新</li>
        </ul>
      </div>
    </section>
  `;
}

function renderProjectConfig(project: ProjectInfo) {
  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="card-title">路径配置</div>
      <div class="callout warn" style="margin-top: 16px;">
        <strong>⚠️ 重要提醒:</strong>
        <ul style="margin: 8px 0 0 20px;">
          <li><strong>项目 ID</strong> 初始化后不可修改，如需修改请删除后重新创建</li>
          <li>修改路径前请确保新路径存在且包含正确的项目文件</li>
          <li>修改后 PROJECT_CONFIG.json 会自动更新</li>
          <li>错误的配置可能导致项目无法正常工作</li>
        </ul>
      </div>
      
      <div style="margin-top: 20px;">
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">项目 ID (不可修改)</label>
          <input
            type="text"
            class="form-control"
            .value=${project.projectId}
            disabled
            style="background: var(--color-muted); opacity: 0.5;"
          />
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">项目名称</label>
          <input
            type="text"
            class="form-control"
            .value=${project.name}
            placeholder="例：我是人类论坛"
            disabled
          />
          <small class="form-text muted">项目名称暂不支持修改，需重新创建项目</small>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">工作空间路径</label>
          <input
            type="text"
            class="form-control"
            .value=${project.workspacePath}
            placeholder="H:\\OpenClaw_Workspace\\groups\\{projectId}"
            disabled
          />
          <small class="form-text muted">工作空间路径暂不支持修改</small>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">代码目录</label>
          <input
            type="text"
            class="form-control"
            .value=${project.codeDir}
            placeholder="I:\\{projectName}"
            disabled
          />
          <small class="form-text muted">代码目录暂不支持修改，可通过 PROJECT_CONFIG.json 调整</small>
        </div>

        ${
          project.docsDir
            ? html`
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">文档目录</label>
          <input
            type="text"
            class="form-control"
            .value=${project.docsDir}
            disabled
          />
        </div>
        `
            : nothing
        }

        ${
          project.requirementsDir
            ? html`
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">需求目录</label>
          <input
            type="text"
            class="form-control"
            .value=${project.requirementsDir}
            disabled
          />
        </div>
        `
            : nothing
        }

        ${
          project.qaDir
            ? html`
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">QA 目录</label>
          <input
            type="text"
            class="form-control"
            .value=${project.qaDir}
            disabled
          />
        </div>
        `
            : nothing
        }

        ${
          project.testsDir
            ? html`
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">测试目录</label>
          <input
            type="text"
            class="form-control"
            .value=${project.testsDir}
            disabled
          />
        </div>
        `
            : nothing
        }

        <div class="callout" style="margin-top: 16px;">
          <strong>💡 如何修改配置:</strong>
          <ol style="margin: 8px 0 0 20px;">
            <li>编辑项目工作空间中的 <code>PROJECT_CONFIG.json</code> 文件</li>
            <li>修改对应的路径配置</li>
            <li>保存后刷新项目列表即可生效</li>
          </ol>
        </div>
      </div>
    </section>
  `;
}

function renderGroupFiles(group: GroupInfo, props: GroupsProps) {
  const list = props.groupFilesList?.groupId === group.id ? props.groupFilesList : null;
  const files = list?.files ?? [];
  const active = props.groupFileActive ?? null;
  const activeEntry = active ? (files.find((f) => f.name === active) ?? null) : null;
  const baseContent = active ? (props.groupFileContents[active] ?? "") : "";
  const draft = active ? (props.groupFileDrafts[active] ?? baseContent) : "";
  const isDirty = active ? draft !== baseContent : false;
  const fmt = (size: number) =>
    size < 1024
      ? `${size} B`
      : size < 1048576
        ? `${(size / 1024).toFixed(1)} KB`
        : `${(size / 1048576).toFixed(1)} MB`;

  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">\u7fa4\u7ec4\u6587\u4ef6</div>
          <div class="card-sub">\u7fa4\u7ec4\u5171\u4eab\u5de5\u4f5c\u7a7a\u95f4\u6587\u4ef6\u7ba1\u7406</div>
        </div>
        <div class="row" style="gap: 8px;">
          ${
            list
              ? html`
            <button class="btn btn--sm" @click=${() => props.onOpenGroupFolder(list.workspace)}>
              \u{1F4C2} \u5728\u6587\u4ef6\u5939\u4e2d\u6253\u5f00
            </button>
            <button
              class="btn btn--sm"
              ?disabled=${props.groupWorkspaceMigrating}
              @click=${() => {
                const newPath = prompt(
                  `\u5c06\u7fa4\u7ec4\u5de5\u4f5c\u7a7a\u95f4\u8fc1\u79fb\u5230\u65b0\u76ee\u5f55\uff1a\n\u5f53\u524d\u8def\u5f84\uff1a${list.workspace}`,
                  list.workspace,
                );
                if (newPath?.trim() && newPath.trim() !== list.workspace) {
                  props.onMigrateGroupWorkspace(group.id, newPath.trim());
                }
              }}
            >
              ${props.groupWorkspaceMigrating ? "\u8fc1\u79fb\u4e2d..." : "\u{1F4E6} \u8fc1\u79fb\u76ee\u5f55"}
            </button>
          `
              : nothing
          }
          <button
            class="btn btn--sm"
            ?disabled=${props.groupFilesLoading}
            @click=${() => {
              const n = prompt("\u8bf7\u8f93\u5165\u65b0\u6587\u4ef6\u540d\uff1a");
              if (n?.trim()) {
                props.onAddGroupFile(group.id, n.trim());
              }
            }}
          >+ \u6dfb\u52a0\u6587\u4ef6</button>
          <button class="btn btn--sm" ?disabled=${props.groupFilesLoading} @click=${() => props.onLoadGroupFiles(group.id)}>
            ${props.groupFilesLoading ? "\u52a0\u8f7d\u4e2d..." : "\u5237\u65b0"}
          </button>
        </div>
      </div>
      ${list ? html`<div class="muted mono" style="margin-top: 8px;">\u5de5\u4f5c\u7a7a\u95f4\uff1a${list.workspace}</div>` : nothing}
      ${props.groupFilesError ? html`<div class="callout danger" style="margin-top: 12px;">${props.groupFilesError}</div>` : nothing}
      ${
        !list
          ? html`
              <div class="callout info" style="margin-top: 12px">
                \u70b9\u51fb\u300c\u5237\u65b0\u300d\u52a0\u8f7d\u7fa4\u7ec4\u5de5\u4f5c\u7a7a\u95f4\u6587\u4ef6\u5217\u8868\u3002
              </div>
            `
          : html`
            <div class="agent-files-grid" style="margin-top: 16px;">
              <div class="agent-files-list">
                ${
                  files.length === 0
                    ? html`
                        <div class="muted">\u6682\u65e0\u6587\u4ef6\u3002</div>
                      `
                    : files.map(
                        (file) => html`
                      <button type="button" class="agent-file-row ${active === file.name ? "active" : ""}" @click=${() => props.onSelectGroupFile(file.name)}>
                        <div>
                          <div class="agent-file-name mono">${file.name}</div>
                          <div class="agent-file-meta">${file.missing ? "\u6587\u4ef6\u4e22\u5931" : `${fmt(file.size)} \u00b7 ${file.updatedAtMs ? new Date(file.updatedAtMs).toLocaleString() : "-"}`}</div>
                        </div>
                        ${
                          file.missing
                            ? html`
                                <span class="agent-pill warn">\u4e22\u5931</span>
                              `
                            : nothing
                        }
                      </button>`,
                      )
                }
              </div>
              <div class="agent-files-editor">
                ${
                  !activeEntry
                    ? html`
                        <div class="muted">\u9009\u62e9\u4e00\u4e2a\u6587\u4ef6\u8fdb\u884c\u7f16\u8f91\u3002</div>
                      `
                    : html`
                      <div class="agent-file-header">
                        <div>
                          <div class="agent-file-title mono">${activeEntry.name}</div>
                          <div class="agent-file-sub mono">${activeEntry.path}</div>
                        </div>
                        <div class="agent-file-actions">
                          <button class="btn btn--sm btn--danger" @click=${() => {
                            if (
                              confirm(
                                `\u786e\u5b9a\u8981\u5220\u9664\u6587\u4ef6 ${activeEntry.name} \u5417\uff1f`,
                              )
                            ) {
                              props.onDeleteGroupFile(group.id, activeEntry.name);
                            }
                          }}>\u5220\u9664</button>
                          <button class="btn btn--sm" ?disabled=${!isDirty} @click=${() => props.onGroupFileReset(activeEntry.name)}>\u91cd\u7f6e</button>
                          <button class="btn btn--sm primary" ?disabled=${props.groupFileSaving || !isDirty} @click=${() => props.onGroupFileSave(activeEntry.name)}>
                            ${props.groupFileSaving ? "\u4fdd\u5b58\u4e2d..." : "\u4fdd\u5b58"}
                          </button>
                        </div>
                      </div>
                      <label class="field" style="margin-top: 12px;">
                        <span>\u6587\u4ef6\u5185\u5bb9</span>
                        <textarea
                          rows="20"
                          .value=${draft}
                          @input=${(e: Event) => props.onGroupFileDraftChange(activeEntry.name, (e.target as HTMLTextAreaElement).value)}
                        ></textarea>
                      </label>
                    `
                }
              </div>
            </div>
          `
      }
    </section>
  `;
}

function renderGroupEditModal(props: GroupsProps) {
  const isNew = props.creatingGroup;
  const group = props.editingGroup || {
    id: "",
    name: "",
    description: "",
    maxMembers: undefined,
    isPublic: false,
    tags: [],
  };
  const agents = props.agentsList?.agents ?? [];
  const defaultOwnerId = props.agentsList?.defaultId ?? "";

  return html`
    <div class="modal-overlay" @click=${props.onCancelEdit}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="max-width: 600px;">
        <div class="card" style="margin: 0;">
          <div class="card-title">${isNew ? "创建群组" : "编辑群组"}</div>
          <div class="card-sub">配置群组基本信息</div>

          <div style="margin-top: 20px;">
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">群组ID ${isNew ? "" : "(不可修改)"}</label>
              <input
                type="text"
                class="form-control"
                .value=${group.id}
                ?disabled=${!isNew}
                placeholder="例：team-alpha, project-x"
                @input=${(e: Event) =>
                  props.onGroupFormChange("id", (e.target as HTMLInputElement).value)}
              />
              <small class="form-text muted">仅支持小写字母、数字和连字符</small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">群组名称</label>
              <input
                type="text"
                class="form-control"
                .value=${group.name}
                placeholder="例：Alpha 团队"
                @input=${(e: Event) =>
                  props.onGroupFormChange("name", (e.target as HTMLInputElement).value)}
              />
            </div>

            ${
              isNew
                ? html`
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">群主（创建者）</label>
              ${
                agents.length > 0
                  ? html`<select
                    class="form-control"
                    .value=${(group as GroupInfo).ownerId || defaultOwnerId}
                    @change=${(e: Event) =>
                      props.onGroupFormChange("ownerId", (e.target as HTMLSelectElement).value)}
                  >
                    ${agents.map(
                      (a) => html`
                      <option
                        value=${a.id}
                        ?selected=${((group as GroupInfo).ownerId || defaultOwnerId) === a.id}
                      >${a.id}${a.id === defaultOwnerId ? " (默认)" : ""}</option>
                    `,
                    )}
                  </select>`
                  : html`<input
                    type="text"
                    class="form-control"
                    .value=${(group as GroupInfo).ownerId || defaultOwnerId}
                    placeholder="智能助手ID，例：main"
                    @input=${(e: Event) =>
                      props.onGroupFormChange("ownerId", (e.target as HTMLInputElement).value)}
                  />`
              }
              <small class="form-text muted">群主拥有群组的最高权限</small>
            </div>`
                : nothing
            }

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">群组描述（可选）</label>
              <textarea
                class="form-control"
                .value=${group.description || ""}
                placeholder="简要描述群组用途"
                rows="3"
                @input=${(e: Event) =>
                  props.onGroupFormChange("description", (e.target as HTMLTextAreaElement).value)}
              ></textarea>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">最大成员数（可选）</label>
              <input
                type="number"
                class="form-control"
                .value=${String(group.maxMembers || "")}
                placeholder="不限制"
                min="1"
                @input=${(e: Event) => {
                  const value = (e.target as HTMLInputElement).value;
                  props.onGroupFormChange("maxMembers", value ? parseInt(value) : undefined);
                }}
              />
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
              <label class="cfg-toggle">
                <input
                  type="checkbox"
                  .checked=${group.isPublic}
                  @change=${(e: Event) =>
                    props.onGroupFormChange("isPublic", (e.target as HTMLInputElement).checked)}
                />
                <span class="cfg-toggle__track"></span>
                <span style="margin-left: 8px;">公开群组</span>
              </label>
              <small class="form-text muted" style="display: block; margin-top: 4px;">
                公开群组允许任何智能助手加入
              </small>
            </div>

            ${
              isNew
                ? html`
            <div class="callout info" style="margin-top: 16px;">
              <strong>📁 项目群组（可选）</strong>
              <p style="margin: 8px 0 0 0;">
                如果绑定项目，此群组将成为项目群，共享工作空间与项目同步。
              </p>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">绑定项目 ID（可选）</label>
              <input
                type="text"
                class="form-control"
                .value=${(group as GroupInfo).projectId || ""}
                placeholder="例：wo-shi-renlei, PolyVault, LifeMirror"
                @input=${(e: Event) =>
                  props.onGroupFormChange("projectId", (e.target as HTMLInputElement).value)}
              />
              <small class="form-text muted">
                留空则为普通群，填写项目 ID 后群组将成为项目群
              </small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">项目工作空间路径（可选）</label>
              <input
                type="text"
                class="form-control"
                .value=${(group as GroupInfo).workspacePath || ""}
                placeholder="H:\\OpenClaw_Workspace\\groups\\{projectId}"
                @input=${(e: Event) =>
                  props.onGroupFormChange("workspacePath", (e.target as HTMLInputElement).value)}
              />
              <small class="form-text muted">
                项目群的共享工作空间路径，留空则自动生成
              </small>
            </div>
            `
                : nothing
            }
          </div>

          <div class="row" style="gap: 8px; margin-top: 20px;">
            <button class="btn" @click=${props.onCancelEdit}>取消</button>
            <button
              class="btn btn--primary"
              ?disabled=${!group.id || !group.name || (isNew && !((group as GroupInfo).ownerId || defaultOwnerId))}
              @click=${props.onSaveGroup}
            >
              ${isNew ? "创建" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderProjectEditModal(props: GroupsProps) {
  const isNew = props.creatingProject;
  const project = props.editingProject || {
    projectId: "",
    name: "",
    description: "",
    workspacePath: "",
    codeDir: "",
    docsDir: "",
    requirementsDir: "",
    qaDir: "",
    testsDir: "",
    createGroup: true, // 默认勾选创建项目群
  };

  return html`
    <div class="modal-overlay" @click=${props.onCancelProjectEdit}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="max-width: 700px;">
        <div class="card" style="margin: 0;">
          <div class="card-title">${isNew ? "创建项目" : "配置项目"}</div>
          <div class="card-sub">管理项目工作空间和代码目录配置</div>

          <div class="callout warn" style="margin-top: 16px;">
            <strong>⚠️ 重要提醒:</strong>
            ${
              isNew
                ? "项目 ID 创建后不可修改，请谨慎填写！其他配置可在创建后调整。"
                : "项目 ID 不可修改，如需修改请删除后重新创建。"
            }
          </div>

          <div style="margin-top: 20px;">
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">项目 ID ${isNew ? "" : "(不可修改)"}</label>
              <input
                type="text"
                class="form-control"
                .value=${project.projectId}
                ?disabled=${!isNew}
                placeholder="例：wo-shi-renlei, PolyVault"
                @input=${(e: Event) =>
                  props.onProjectFormChange("projectId", (e.target as HTMLInputElement).value)}
              />
              <small class="form-text muted">唯一标识符，仅支持小写字母、数字和连字符</small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">项目名称</label>
              <input
                type="text"
                class="form-control"
                .value=${project.name}
                placeholder="例：我是人类论坛"
                ?disabled=${!isNew}
                @input=${(e: Event) =>
                  props.onProjectFormChange("name", (e.target as HTMLInputElement).value)}
              />
              ${
                !isNew
                  ? html`
                      <small class="form-text muted">项目名称暂不支持修改</small>
                    `
                  : nothing
              }
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">项目描述（可选）</label>
              <textarea
                class="form-control"
                .value=${project.description || ""}
                placeholder="简要描述项目"
                rows="3"
                @input=${(e: Event) =>
                  props.onProjectFormChange("description", (e.target as HTMLTextAreaElement).value)}
              ></textarea>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">工作空间根目录（可选）</label>
              <input
                type="text"
                class="form-control"
                .value=${project.workspacePath || ""}
                placeholder="H:\\OpenClaw_Workspace\\groups"
                ?disabled=${!isNew}
                @input=${(e: Event) =>
                  props.onProjectFormChange("workspaceRoot", (e.target as HTMLInputElement).value)}
              />
              <small class="form-text muted">默认为 H:\\OpenClaw_Workspace\\groups，可从配置文件或环境变量读取</small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">代码目录（可选）</label>
              <input
                type="text"
                class="form-control"
                .value=${project.codeDir || ""}
                placeholder="I:\\{projectName}"
                @input=${(e: Event) =>
                  props.onProjectFormChange("codeDir", (e.target as HTMLInputElement).value)}
              />
              <small class="form-text muted">默认为 I:\\{projectName}，可自定义到其他位置</small>
            </div>

            ${
              isNew
                ? html`
            <div class="callout info" style="margin-top: 16px;">
              <strong>👥 项目群组（可选）</strong>
              <p style="margin: 8px 0 0 0;">
                创建项目时可以选择同时创建一个关联的项目群，用于项目协作和沟通。
              </p>
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
              <label class="cfg-toggle">
                <input
                  type="checkbox"
                  .checked=${project.createGroup !== false}
                  @change=${(e: Event) =>
                    props.onProjectFormChange(
                      "createGroup",
                      (e.target as HTMLInputElement).checked,
                    )}
                />
                <span class="cfg-toggle__track"></span>
                <span style="margin-left: 8px;">同时创建项目群</span>
              </label>
              <small class="form-text muted" style="display: block; margin-top: 4px;">
                勾选后会自动创建一个名为「${project.name} 项目组」的项目群，共享工作空间与项目同步
              </small>
            </div>
            `
                : nothing
            }

            ${
              !isNew
                ? html`
                    <div class="callout info" style="margin-top: 16px">
                      <strong>💡 更多配置:</strong>
                      <p style="margin: 8px 0">文档目录、QA 目录等高级配置请在 PROJECT_CONFIG.json 中手动添加</p>
                    </div>
                  `
                : nothing
            }
          </div>

          <div class="row" style="gap: 8px; margin-top: 20px;">
            <button class="btn" @click=${props.onCancelProjectEdit}>取消</button>
            <button
              class="btn btn--primary"
              ?disabled=${!project.projectId || !project.name}
              @click=${props.onSaveProject}
            >
              ${isNew ? "创建" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
