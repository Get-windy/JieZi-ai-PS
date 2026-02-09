import { html, nothing } from "lit";
import { t } from "../i18n.ts";

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
  activePanel: "list" | "members" | "settings";
  creatingGroup: boolean;
  editingGroup: GroupInfo | null;
  onRefresh: () => void;
  onSelectGroup: (groupId: string) => void;
  onSelectPanel: (panel: "list" | "members" | "settings") => void;
  onCreateGroup: () => void;
  onEditGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSaveGroup: () => void;
  onCancelEdit: () => void;
  onGroupFormChange: (field: string, value: any) => void;
  onAddMember: (groupId: string, agentId: string, role: GroupMemberRole) => void;
  onRemoveMember: (groupId: string, agentId: string) => void;
  onUpdateMemberRole: (groupId: string, agentId: string, role: GroupMemberRole) => void;
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
  active: "list" | "members" | "settings",
  onSelect: (panel: "list" | "members" | "settings") => void,
) {
  const tabs = [
    { id: "list" as const, label: "概览" },
    { id: "members" as const, label: "成员管理" },
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
              ?disabled=${!group.id || !group.name}
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
