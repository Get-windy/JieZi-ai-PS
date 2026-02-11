/**
 * 团队管理对话框
 * 用于创建和编辑团队
 */

import { html, nothing } from "lit";

export type TeamDialogProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  team: {
    id?: string;
    name: string;
    description: string;
    organizationId: string;
    leaderId: string;
  };
  organizations: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
  saving: boolean;
  error: string | null;
  onSave: (team: {
    id?: string;
    name: string;
    description: string;
    organizationId: string;
    leaderId: string;
  }) => void;
  onCancel: () => void;
  onChange: (field: string, value: string) => void;
};

/**
 * 渲染团队管理对话框
 */
export function renderTeamDialog(props: TeamDialogProps) {
  if (!props.isOpen) {
    return nothing;
  }

  const isEdit = props.mode === "edit";
  const title = isEdit ? "编辑团队" : "创建团队";

  return html`
    <div class="modal-overlay" @click=${props.onCancel}>
      <div
        class="modal-dialog"
        style="max-width: 500px; background: var(--bg); border: 1px solid var(--border);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="card">
          <div class="card-title" style="margin-bottom: 16px;">
            👥 ${title}
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
              props.onSave(props.team);
            }}
          >
            <!-- 团队名称 -->
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                团队名称 <span style="color: var(--error);">*</span>
              </label>
              <input
                type="text"
                class="input"
                style="width: 100%;"
                placeholder="请输入团队名称"
                value=${props.team.name}
                @input=${(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  props.onChange("name", target.value);
                }}
                required
                ?disabled=${props.saving}
              />
            </div>

            <!-- 团队描述 -->
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                团队描述
              </label>
              <textarea
                class="input"
                style="width: 100%; min-height: 80px; resize: vertical;"
                placeholder="请输入团队描述（可选）"
                .value=${props.team.description}
                @input=${(e: Event) => {
                  const target = e.target as HTMLTextAreaElement;
                  props.onChange("description", target.value);
                }}
                ?disabled=${props.saving}
              ></textarea>
            </div>

            <!-- 所属组织 -->
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                所属组织 <span style="color: var(--error);">*</span>
              </label>
              <select
                class="input"
                style="width: 100%;"
                .value=${props.team.organizationId}
                @change=${(e: Event) => {
                  const target = e.target as HTMLSelectElement;
                  props.onChange("organizationId", target.value);
                }}
                required
                ?disabled=${props.saving}
              >
                <option value="">请选择组织</option>
                ${props.organizations.map(
                  (org) => html`
                    <option value=${org.id}>${org.name}</option>
                  `,
                )}
              </select>
              <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                选择此团队所属的组织
              </div>
            </div>

            <!-- 团队负责人 -->
            <div style="margin-bottom: 24px;">
              <label style="display: block; font-weight: 500; margin-bottom: 8px;">
                团队负责人
              </label>
              <select
                class="input"
                style="width: 100%;"
                .value=${props.team.leaderId}
                @change=${(e: Event) => {
                  const target = e.target as HTMLSelectElement;
                  props.onChange("leaderId", target.value);
                }}
                ?disabled=${props.saving}
              >
                <option value="">无（暂不指定）</option>
                ${props.agents.map(
                  (agent) => html`
                    <option value=${agent.id}>${agent.name}</option>
                  `,
                )}
              </select>
              <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
                指定团队的负责人，可以稍后再设置
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
                ?disabled=${props.saving || !props.team.name.trim() || !props.team.organizationId}
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
