/**
 * 组织管理对话框
 * 用于创建和编辑组织
 */

import { html, nothing } from "lit";

export type OrganizationDialogProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  organization: {
    id?: string;
    name: string;
    description: string;
    parentId: string;
  };
  organizations: Array<{ id: string; name: string; level: number }>;
  saving: boolean;
  error: string | null;
  onSave: (org: { id?: string; name: string; description: string; parentId: string }) => void;
  onCancel: () => void;
  onChange: (field: string, value: string) => void;
};

/**
 * 渲染组织管理对话框
 */
export function renderOrganizationDialog(props: OrganizationDialogProps) {
  if (!props.isOpen) {
    return nothing;
  }

  const isEdit = props.mode === "edit";
  const title = isEdit ? "编辑组织" : "创建组织";

  // 过滤可选的父组织（编辑时排除自己和子孙组织）
  const availableParents = props.organizations.filter((org) => {
    if (!isEdit) {
      return true;
    }
    return org.id !== props.organization.id;
  });

  return html`
    <div class="modal-overlay" @click=${props.onCancel}>
      <div
        class="modal-dialog"
        style="max-width: 500px; background: var(--bg); border: 1px solid var(--border);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="card">
          <div class="card-title" style="margin-bottom: 16px;">
            🏢 ${title}
          </div>

          ${
            props.error
              ? html`
                <div class="callout error" style="margin-bottom: 16px;">
                  ❌ ${props.error}
                </div>
              `
              : nothing
          }

          <form
            @submit=${(e: Event) => {
              e.preventDefault();
              props.onSave(props.organization);
            }}
          >
            <!-- 组织名称 -->
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                组织名称 <span style="color: var(--error);">*</span>
              </label>
              <input
                type="text"
                class="input"
                style="width: 100%;"
                placeholder="请输入组织名称"
                value=${props.organization.name}
                @input=${(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  props.onChange("name", target.value);
                }}
                required
                ?disabled=${props.saving}
              />
            </div>

            <!-- 组织描述 -->
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                组织描述
              </label>
              <textarea
                class="input"
                style="width: 100%; min-height: 80px; resize: vertical;"
                placeholder="请输入组织描述（可选）"
                .value=${props.organization.description}
                @input=${(e: Event) => {
                  const target = e.target as HTMLTextAreaElement;
                  props.onChange("description", target.value);
                }}
                ?disabled=${props.saving}
              ></textarea>
            </div>

            <!-- 父组织 -->
            <div style="margin-bottom: 24px;">
              <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                父组织
              </label>
              <select
                class="input"
                style="width: 100%;"
                .value=${props.organization.parentId}
                @change=${(e: Event) => {
                  const target = e.target as HTMLSelectElement;
                  props.onChange("parentId", target.value);
                }}
                ?disabled=${props.saving}
              >
                <option value="">无（顶级组织）</option>
                ${availableParents.map(
                  (org) => html`
                    <option value=${org.id}>
                      ${"　".repeat(org.level)}${org.name}
                    </option>
                  `,
                )}
              </select>
              <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                选择此组织的上级组织，留空则为顶级组织
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="row" style="gap: 8px; justify-content: flex-end;">
              <button
                type="button"
                class="btn btn--sm"
                @click=${props.onCancel}
                ?disabled=${props.saving}
              >
                取消
              </button>
              <button
                type="submit"
                class="btn btn--sm btn--primary"
                ?disabled=${props.saving || !props.organization.name.trim()}
              >
                ${props.saving ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}
