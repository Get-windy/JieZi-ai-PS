/**
 * 权限配置面板
 * 用于组织级权限配置、角色权限管理、助手权限配置和权限模板管理
 */

import { html, nothing } from "lit";

// 权限类型定义
export type PermissionItem = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type PermissionCategory = {
  id: string;
  label: string;
  permissions: PermissionItem[];
};

export type PermissionsConfigPanelProps = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  configType: "organization" | "role" | "agent" | "template";

  // 组织级权限
  selectedOrganizationId?: string;
  organizations?: Array<{ id: string; name: string }>;

  // 角色权限
  selectedRoleId?: string;
  roles?: Array<{ id: string; name: string }>;

  // 助手权限
  selectedAgentId?: string;
  agents?: Array<{ id: string; name: string }>;

  // 权限数据
  permissionCategories: PermissionCategory[];

  // 回调
  onOrganizationSelect?: (orgId: string) => void;
  onRoleSelect?: (roleId: string) => void;
  onAgentSelect?: (agentId: string) => void;
  onPermissionToggle: (categoryId: string, permissionId: string, enabled: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * 渲染权限配置面板
 */
export function renderPermissionsConfigPanel(props: PermissionsConfigPanelProps) {
  // 渲染选择器（组织/角色/助手）
  const renderSelector = () => {
    switch (props.configType) {
      case "organization":
        return html`
          <div class="form-group">
            <label>选择组织</label>
            <select
              class="form-control"
              .value=${props.selectedOrganizationId || ""}
              @change=${(e: Event) => {
                const target = e.target as HTMLSelectElement;
                props.onOrganizationSelect?.(target.value);
              }}
            >
              <option value="">请选择组织</option>
              ${props.organizations?.map(
                (org) => html`
                  <option value=${org.id} ?selected=${org.id === props.selectedOrganizationId}>
                    ${org.name}
                  </option>
                `,
              )}
            </select>
          </div>
        `;

      case "role":
        return html`
          <div class="form-group">
            <label>选择角色</label>
            <select
              class="form-control"
              .value=${props.selectedRoleId || ""}
              @change=${(e: Event) => {
                const target = e.target as HTMLSelectElement;
                props.onRoleSelect?.(target.value);
              }}
            >
              <option value="">请选择角色</option>
              ${props.roles?.map(
                (role) => html`
                  <option value=${role.id} ?selected=${role.id === props.selectedRoleId}>
                    ${role.name}
                  </option>
                `,
              )}
            </select>
          </div>
        `;

      case "agent":
        return html`
          <div class="form-group">
            <label>选择助手</label>
            <select
              class="form-control"
              .value=${props.selectedAgentId || ""}
              @change=${(e: Event) => {
                const target = e.target as HTMLSelectElement;
                props.onAgentSelect?.(target.value);
              }}
            >
              <option value="">请选择助手</option>
              ${props.agents?.map(
                (agent) => html`
                  <option value=${agent.id} ?selected=${agent.id === props.selectedAgentId}>
                    ${agent.name}
                  </option>
                `,
              )}
            </select>
          </div>
        `;

      case "template":
        return nothing;
    }
  };

  // 渲染权限列表
  const renderPermissions = () => {
    if (props.loading) {
      return html`
        <div class="loading">加载权限配置中...</div>
      `;
    }

    if (props.error) {
      return html`<div class="error">${props.error}</div>`;
    }

    return html`
      <div class="permissions-list">
        ${props.permissionCategories.map(
          (category) => html`
            <div class="permission-category">
              <h4>${category.label}</h4>
              <div class="permission-items">
                ${category.permissions.map(
                  (permission) => html`
                    <div class="permission-item">
                      <label class="checkbox-label">
                        <input
                          type="checkbox"
                          ?checked=${permission.enabled}
                          @change=${(e: Event) => {
                            const target = e.target as HTMLInputElement;
                            props.onPermissionToggle(category.id, permission.id, target.checked);
                          }}
                        />
                        <span class="permission-label">${permission.label}</span>
                      </label>
                      ${
                        permission.description
                          ? html`<p class="permission-description">${permission.description}</p>`
                          : nothing
                      }
                    </div>
                  `,
                )}
              </div>
            </div>
          `,
        )}
      </div>
    `;
  };

  return html`
    <div class="permissions-config-panel">
      ${renderSelector()}
      ${renderPermissions()}
      
      <div class="panel-actions">
        <button
          class="btn btn--primary"
          ?disabled=${props.saving}
          @click=${props.onSave}
        >
          ${props.saving ? "保存中..." : "保存配置"}
        </button>
        <button
          class="btn"
          ?disabled=${props.saving}
          @click=${props.onCancel}
        >
          取消
        </button>
      </div>
    </div>
  `;
}

/**
 * 权限模板列表
 */
export type PermissionTemplate = {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, string[]>;
  createdAt: number;
};

export type PermissionTemplatesProps = {
  templates: PermissionTemplate[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onEdit: (templateId: string) => void;
  onDelete: (templateId: string) => void;
  onApply: (templateId: string) => void;
};

/**
 * 渲染权限模板列表
 */
export function renderPermissionTemplates(props: PermissionTemplatesProps) {
  if (props.loading) {
    return html`
      <div class="loading">加载权限模板中...</div>
    `;
  }

  if (props.error) {
    return html`<div class="error">${props.error}</div>`;
  }

  return html`
    <div class="permission-templates">
      <div class="templates-header">
        <h3>权限模板管理</h3>
        <button class="btn btn--primary" @click=${props.onCreate}>
          + 创建模板
        </button>
      </div>

      <div class="templates-list">
        ${
          props.templates.length === 0
            ? html`
                <div class="empty-state">暂无权限模板</div>
              `
            : props.templates.map(
                (template) => html`
                <div class="template-card">
                  <div class="template-header">
                    <h4>${template.name}</h4>
                    <div class="template-actions">
                      <button
                        class="btn btn--sm"
                        @click=${() => props.onApply(template.id)}
                      >
                        应用
                      </button>
                      <button
                        class="btn btn--sm"
                        @click=${() => props.onEdit(template.id)}
                      >
                        编辑
                      </button>
                      <button
                        class="btn btn--sm btn--danger"
                        @click=${() => props.onDelete(template.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  ${
                    template.description
                      ? html`<p class="template-description">${template.description}</p>`
                      : nothing
                  }
                  <div class="template-meta">
                    创建时间: ${new Date(template.createdAt).toLocaleString()}
                  </div>
                </div>
              `,
              )
        }
      </div>
    </div>
  `;
}
