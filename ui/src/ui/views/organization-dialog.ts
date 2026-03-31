/**
 * 组织管理对话框
 * 用于创建和编辑组织，支持配置部门沙箱隔离
 */

import { html, nothing } from "lit";

export type SandboxFormConfig = {
  enabled: boolean;
  containerPrefixHint: string;
  workspaceRoot: string;
  network: string;
  image: string;
  memory: string;
  cpus: string;
  pidsLimit: string;
};

export const DEFAULT_SANDBOX_FORM: SandboxFormConfig = {
  enabled: false,
  containerPrefixHint: "",
  workspaceRoot: "",
  network: "",
  image: "",
  memory: "",
  cpus: "",
  pidsLimit: "",
};

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
  /** 沙箱隔离配置（只对 type=department 生效） */
  sandboxConfig?: SandboxFormConfig;
  /** 是否是部门（显示沙箱配置表单） */
  isDepartment?: boolean;
  onSave: (org: { id?: string; name: string; description: string; parentId: string }) => void;
  onCancel: () => void;
  onChange: (field: string, value: string) => void;
  onSandboxChange?: (field: keyof SandboxFormConfig, value: string | boolean) => void;
};

/**
 * 渲染组织管理对话框
 */
export function renderOrganizationDialog(props: OrganizationDialogProps) {
  if (!props.isOpen) {
    return nothing;
  }

  const isEdit = props.mode === "edit";
  const title = isEdit ? "编辑组织" : (props.isDepartment ? "创建部门" : "创建组织");

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
            <div style="margin-bottom: ${props.isDepartment ? '16px' : '24px'};">
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

            <!-- 部门沙箱隔离配置 -->
            ${props.isDepartment && props.sandboxConfig && props.onSandboxChange
              ? renderSandboxConfigSection(props.sandboxConfig, props.saving, props.onSandboxChange)
              : nothing
            }

            <!-- 操作按鈕 -->
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

/**
 * 渲染沙箱隔离配置表单区域
 */
function renderSandboxConfigSection(
  config: SandboxFormConfig,
  saving: boolean,
  onSandboxChange: NonNullable<OrganizationDialogProps["onSandboxChange"]>,
) {
  const inp = (field: keyof SandboxFormConfig, label: string, placeholder: string, hint?: string) => html`
    <div style="margin-bottom: 12px;">
      <label style="display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 4px;">
        ${label}
      </label>
      <input
        type="text"
        class="input"
        style="width: 100%; font-size: 0.875rem;"
        placeholder=${placeholder}
        .value=${(config[field] as string) ?? ""}
        @input=${(e: Event) => onSandboxChange(field, (e.target as HTMLInputElement).value)}
        ?disabled=${saving}
      />
      ${hint ? html`<div class="muted" style="font-size: 0.8rem; margin-top: 2px;">${hint}</div>` : nothing}
    </div>
  `;

  return html`
    <!-- 沙箱隔离开关 -->
    <div style="margin-bottom: 16px; padding: 12px; border: 1px solid var(--border); border-radius: 8px;">
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600; font-size: 0.9rem;">📦 Docker 沙箱隔离</div>
          <div class="muted" style="font-size: 0.8rem; margin-top: 2px;">
            启用后该部门的 Agent 将运行在独立的 Docker 容器中
          </div>
        </div>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input
            type="checkbox"
            .checked=${config.enabled}
            @change=${(e: Event) => onSandboxChange("enabled", (e.target as HTMLInputElement).checked)}
            ?disabled=${saving}
          />
          <span style="font-size: 0.875rem; font-weight: 500;">
            ${config.enabled ? html`<span style="color: var(--success, #22c55e);">\u5df2启用</span>` : html`<span class="muted">未启用</span>`}
          </span>
        </label>
      </div>

      ${config.enabled ? html`
        <div style="padding-top: 8px; border-top: 1px solid var(--border);">
          <!-- 容器命名提示 -->
          ${inp("containerPrefixHint", "容器前缀提示", "如 finance、delivery（系统自动附加部门 hash）", "实际前缀格式：openclaw-dept-<hint>-<hash8>-，不能被覆盖")}
          <!-- 工作区目录 -->
          ${inp("workspaceRoot", "工作区目录", "~/.openclaw/sandboxes/dept-finance", "留空使用默认路径：~/.openclaw/sandboxes/dept-<id>")}
          <!-- Docker 网络 -->
          ${inp("network", "Docker 网络", "openclaw-net-finance", "部门专属网络，Agent 无法覆盖（安全设计）")}
          <!-- Docker 镜像 -->
          ${inp("image", "Docker 镜像", "openclaw-sandbox:bookworm-slim", "留空使用默认镜像，Agent 可进一步定制")}

          <!-- 资源配额 -->
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
            <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 8px; color: var(--muted);">\u8d44源配额（留空不限制）</div>
            <div class="row" style="gap: 8px;">
              <div style="flex: 1;">
                <label style="display: block; font-size: 0.8rem; margin-bottom: 2px;">内存</label>
                <input type="text" class="input" style="width: 100%; font-size: 0.8rem;"
                  placeholder="512m / 2g"
                  .value=${config.memory}
                  @input=${(e: Event) => onSandboxChange("memory", (e.target as HTMLInputElement).value)}
                  ?disabled=${saving}
                />
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-size: 0.8rem; margin-bottom: 2px;">CPU 核数</label>
                <input type="text" class="input" style="width: 100%; font-size: 0.8rem;"
                  placeholder="0.5 / 1.0"
                  .value=${config.cpus}
                  @input=${(e: Event) => onSandboxChange("cpus", (e.target as HTMLInputElement).value)}
                  ?disabled=${saving}
                />
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-size: 0.8rem; margin-bottom: 2px;">进程数限制</label>
                <input type="text" class="input" style="width: 100%; font-size: 0.8rem;"
                  placeholder="256"
                  .value=${config.pidsLimit}
                  @input=${(e: Event) => onSandboxChange("pidsLimit", (e.target as HTMLInputElement).value)}
                  ?disabled=${saving}
                />
              </div>
            </div>
          </div>
        </div>
      ` : nothing}
    </div>
  `;
}
