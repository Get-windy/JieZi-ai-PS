import { html, nothing } from "lit";
import { t } from "../i18n.ts";
import type { GroupFilesListResult } from "../controllers/group-files.ts";
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
  metadata?: Record<string, any>;
}

/**
 * 群组列表结果
 */
export interface GroupsListResult {
  groups: GroupInfo[];
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
};

export function renderGroups(props: GroupsProps) {
  const groups = props.groupsList?.groups ?? [];
  const selectedId = props.selectedGroupId ?? groups[0]?.id ?? null;
  const selectedGroup = selectedId ? (groups.find((g) => g.id === selectedId) ?? null) : null;

  return html`
    <div class="groups-layout">
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

      <section class="card groups-content" style="flex: 1;">
        ${
          selectedGroup
            ? html`
                <div class="group-header">
                  <div>
                    <div class="card-title">${selectedGroup.name}</div>
                    <div class="card-sub">${selectedGroup.description || "暂无描述"}</div>
                  </div>
                  <button class="btn btn--sm" @click=${() => props.onEditGroup(selectedGroup.id)}>
                    编辑群组
                  </button>
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
              `
            : html`
                <div class="empty">请选择一个群组</div>
              `
        }
      </section>
    </div>

    ${props.creatingGroup || props.editingGroup ? renderGroupEditModal(props) : nothing}
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

function renderGroupOverview(group: GroupInfo) {
  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="card-title">群组概览</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">群组ID</div>
          <div class="mono">${group.id}</div>
        </div>
        <div class="agent-kv">
          <div class="label">创建者</div>
          <div class="mono">${group.ownerId}</div>
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
          <div>${group.isPublic ? "公开群组" : "私密群组"}</div>
        </div>
        <div class="agent-kv">
          <div class="label">群组标签</div>
          <div>${group.tags?.join(", ") || "无"}</div>
        </div>
      </div>
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

function renderGroupFiles(group: GroupInfo, props: GroupsProps) {
  const list =
    props.groupFilesList?.groupId === group.id ? props.groupFilesList : null;
  const files = list?.files ?? [];
  const active = props.groupFileActive ?? null;
  const activeEntry = active ? (files.find((f) => f.name === active) ?? null) : null;
  const baseContent = active ? (props.groupFileContents[active] ?? "") : "";
  const draft = active ? (props.groupFileDrafts[active] ?? baseContent) : "";
  const isDirty = active ? draft !== baseContent : false;
  const fmt = (size: number) =>
    size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;

  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">\u7fa4\u7ec4\u6587\u4ef6</div>
          <div class="card-sub">\u7fa4\u7ec4\u5171\u4eab\u5de5\u4f5c\u7a7a\u95f4\u6587\u4ef6\u7ba1\u7406</div>
        </div>
        <div class="row" style="gap: 8px;">
          ${list ? html`
            <button class="btn btn--sm" @click=${() => props.onOpenGroupFolder(list.workspace)}>
              \u{1F4C2} \u5728\u6587\u4ef6\u5939\u4e2d\u6253\u5f00
            </button>
            <button
              class="btn btn--sm"
              ?disabled=${props.groupWorkspaceMigrating}
              @click=${() => {
                const newPath = prompt(
                  `\u5c06\u7fa4\u7ec4\u5de5\u4f5c\u7a7a\u95f4\u8fc1\u79fb\u5230\u65b0\u76ee\u5f55\uff1a\n\u5f53\u524d\u8def\u5f84\uff1a${list.workspace}`,
                  list.workspace
                );
                if (newPath?.trim() && newPath.trim() !== list.workspace) {
                  props.onMigrateGroupWorkspace(group.id, newPath.trim());
                }
              }}
            >
              ${props.groupWorkspaceMigrating ? '\u8fc1\u79fb\u4e2d...' : '\u{1F4E6} \u8fc1\u79fb\u76ee\u5f55'}
            </button>
          ` : nothing}
          <button
            class="btn btn--sm"
            ?disabled=${props.groupFilesLoading}
            @click=${() => {
              const n = prompt("\u8bf7\u8f93\u5165\u65b0\u6587\u4ef6\u540d\uff1a");
              if (n?.trim()) {props.onAddGroupFile(group.id, n.trim());}
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
          ? html`<div class="callout info" style="margin-top: 12px;">\u70b9\u51fb\u300c\u5237\u65b0\u300d\u52a0\u8f7d\u7fa4\u7ec4\u5de5\u4f5c\u7a7a\u95f4\u6587\u4ef6\u5217\u8868\u3002</div>`
          : html`
            <div class="agent-files-grid" style="margin-top: 16px;">
              <div class="agent-files-list">
                ${files.length === 0
                  ? html`<div class="muted">\u6682\u65e0\u6587\u4ef6\u3002</div>`
                  : files.map((file) => html`
                      <button type="button" class="agent-file-row ${active === file.name ? "active" : ""}" @click=${() => props.onSelectGroupFile(file.name)}>
                        <div>
                          <div class="agent-file-name mono">${file.name}</div>
                          <div class="agent-file-meta">${file.missing ? "\u6587\u4ef6\u4e22\u5931" : `${fmt(file.size)} \u00b7 ${file.updatedAtMs ? new Date(file.updatedAtMs).toLocaleString() : "-"}`}</div>
                        </div>
                        ${file.missing ? html`<span class="agent-pill warn">\u4e22\u5931</span>` : nothing}
                      </button>`)
                }
              </div>
              <div class="agent-files-editor">
                ${!activeEntry
                  ? html`<div class="muted">\u9009\u62e9\u4e00\u4e2a\u6587\u4ef6\u8fdb\u884c\u7f16\u8f91\u3002</div>`
                  : html`
                      <div class="agent-file-header">
                        <div>
                          <div class="agent-file-title mono">${activeEntry.name}</div>
                          <div class="agent-file-sub mono">${activeEntry.path}</div>
                        </div>
                        <div class="agent-file-actions">
                          <button class="btn btn--sm btn--danger" @click=${() => {
                            if (confirm(`\u786e\u5b9a\u8981\u5220\u9664\u6587\u4ef6 ${activeEntry.name} \u5417\uff1f`))
                              {props.onDeleteGroupFile(group.id, activeEntry.name);}
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

            ${isNew ? html`
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">群主（创建者）</label>
              ${agents.length > 0
                ? html`<select
                    class="form-control"
                    .value=${(group as GroupInfo).ownerId || defaultOwnerId}
                    @change=${(e: Event) =>
                      props.onGroupFormChange("ownerId", (e.target as HTMLSelectElement).value)}
                  >
                    ${agents.map((a) => html`
                      <option
                        value=${a.id}
                        ?selected=${((group as GroupInfo).ownerId || defaultOwnerId) === a.id}
                      >${a.id}${a.id === defaultOwnerId ? " (默认)" : ""}</option>
                    `)}
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
            </div>` : nothing}

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
