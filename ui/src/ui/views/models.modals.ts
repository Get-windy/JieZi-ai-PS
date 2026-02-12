/**
 * 模型管理相关的模态框组件（新架构）
 * 包含：认证管理、模型列表、模型配置
 */

import { html, nothing } from "lit";
import type { ModelsStatusSnapshot, ProviderAuthSnapshot, ModelConfigSnapshot } from "../types.js";
import type { ModelsProps } from "./models.types.js";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import "../components/icon-picker.js"; // 导入图标选择器

// ============ 认证管理模态框 ============

export function renderAuthManagerModal(props: ModelsProps) {
  if (!props.managingAuthProvider) {
    return nothing;
  }

  const providerId = props.managingAuthProvider;
  const providerLabel = resolveProviderLabel(props.snapshot, providerId);
  const auths = props.snapshot?.auths?.[providerId] ?? [];

  return html`
    <div class="modal-overlay" @click=${() => props.onManageAuths("")}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${providerLabel} - ${t("models.auth_management")}</h2>
          <button class="btn-icon" @click=${() => props.onManageAuths("")}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 32px;">
          <div class="row" style="margin-bottom: 20px; justify-content: space-between; align-items: center;">
            <h3 style="font-size: 18px; font-weight: 600; margin: 0;">
              ${t("models.auth_list")}
            </h3>
            <button 
              class="btn btn--primary" 
              style="font-size: 14px; padding: 10px 18px; background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;" 
              @click=${() => props.onAddAuth(providerId)}
            >
              ➕ ${t("models.add_auth")}
            </button>
          </div>
          
          ${
            auths.length === 0
              ? html`<div class="muted" style="padding: 40px; text-align: center;">${t("models.no_auth")}</div>`
              : html`
              <div style="display: grid; gap: 16px;">
                ${auths.map((auth) => renderAuthCard(auth, props))}
              </div>
            `
          }
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${() => props.onManageAuths("")}>
            ${t("models.close")}
          </button>
        </div>
      </div>
    </div>
  `;
}

// 认证编辑/添加模态框
export function renderAuthEditModal(props: ModelsProps) {
  if (!props.editingAuth) {
    return nothing;
  }

  const auth = props.editingAuth;
  const isNew = !auth.authId;
  const providerLabel = resolveProviderLabel(props.snapshot, auth.provider);

  // 检查是否有未保存的内容
  const hasUnsavedContent = auth.name || auth.apiKey || auth.baseUrl;

  const handleCancelAuth = () => {
    if (hasUnsavedContent && isNew) {
      if (confirm("您有未保存的内容，确定要关闭吗？")) {
        props.onCancelAuthEdit();
      }
    } else {
      props.onCancelAuthEdit();
    }
  };

  return html`
    <div class="modal-overlay" @click=${handleCancelAuth}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${providerLabel} - ${isNew ? t("models.add_auth_title") : t("models.edit_auth")}</h2>
          <button class="btn-icon" @click=${handleCancelAuth}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 24px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">${t("models.auth_name")}</label>
            <input 
              type="text" 
              class="input" 
              placeholder="${t("models.auth_name_placeholder")}"
              .value=${auth.name}
              @input=${(e: Event) => {
                auth.name = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">${t("models.api_key")}</label>
            <input 
              type="password" 
              class="input" 
              placeholder="sk-..."
              .value=${auth.apiKey}
              @input=${(e: Event) => {
                auth.apiKey = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">${t("models.base_url")}</label>
            <input 
              type="text" 
              class="input" 
              placeholder="${t("models.base_url_placeholder")}"
              .value=${auth.baseUrl || ""}
              @input=${(e: Event) => {
                auth.baseUrl = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${handleCancelAuth}>
            ${t("models.cancel")}
          </button>
          <button
            class="btn btn--primary"
            style="background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
            ?disabled=${!auth.name || !auth.apiKey}
            @click=${() => {
              if (auth.name && auth.apiKey) {
                props.onSaveAuth(auth);
              }
            }}
          >
            ${t("models.save")}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderAuthCard(auth: ProviderAuthSnapshot, props: ModelsProps) {
  const statusColor = auth.status?.valid ? "green" : "gray";

  return html`
    <div class="card" style="padding: 20px;">
      <div class="row" style="justify-content: space-between; align-items: center; gap: 16px;">
        <div class="row" style="align-items: center; gap: 16px; flex: 1;">
          <span 
            class="status-indicator status-indicator--${statusColor}" 
            style="width: 12px; height: 12px; flex-shrink: 0;"
            title="${auth.status?.valid ? t("models.valid") : t("models.unverified")}"
          ></span>
          <div style="flex: 1; min-width: 0;">
            <div class="card-title" style="font-size: 16px; margin-bottom: 6px;">
              ${auth.name} ${
                auth.isDefault
                  ? html`
                      <span style="color: var(--accent)">⭐</span>
                    `
                  : nothing
              }
            </div>
            <div class="card-sub mono" style="font-size: 12px; opacity: 0.7;">
              ${auth.apiKey.substring(0, 20)}...
            </div>
            ${
              auth.balance
                ? html`
              <div class="card-sub" style="margin-top: 4px; font-size: 12px;">
                ${t("models.balance")}: ${auth.balance.currency} ${auth.balance.amount.toFixed(2)}
              </div>
            `
                : nothing
            }
          </div>
        </div>
        <div class="row" style="gap: 10px; flex-shrink: 0;">
           <button 
            class="btn btn--sm" 
            style="padding: 8px 14px; font-size: 13px;"
            @click=${() => props.onEditAuth(auth.authId)}
          >
            ✏️ ${t("models.edit")}
          </button>
          ${
            !auth.isDefault
              ? html`
            <button 
              class="btn btn--sm" 
              style="padding: 8px 14px; font-size: 13px;"
              @click=${() => props.onSetDefaultAuth(auth.authId)}
            >
              ⭐ ${t("models.set_default")}
            </button>
          `
              : nothing
          }
          <button 
            class="btn btn--sm btn--danger" 
            style="padding: 8px 14px; font-size: 13px;"
            @click=${() => {
              if (confirm(`${t("models.delete_auth_confirm").replace("{name}", auth.name)}`)) {
                props.onDeleteAuth(auth.authId);
              }
            }}
          >
            🗑️ ${t("models.delete")}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============ 模型列表模态框 ============

export function renderModelsListModal(props: ModelsProps) {
  if (!props.managingModelsProvider) {
    return nothing;
  }

  const providerId = props.managingModelsProvider;
  const providerLabel = resolveProviderLabel(props.snapshot, providerId);
  const auths = props.snapshot?.auths?.[providerId] ?? [];
  const modelConfigs = props.snapshot?.modelConfigs?.[providerId] ?? [];

  return html`
    <div class="modal-overlay" @click=${() => props.onCloseModelsList()}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${providerLabel} - ${t("models.model_list")}</h2>
          <button class="btn-icon" @click=${() => props.onCloseModelsList()}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 32px;">
          ${auths.map((auth) => {
            const authModels = modelConfigs.filter((m) => m.authId === auth.authId);
            return html`
              <div style="margin-bottom: 32px;">
                <div class="row" style="margin-bottom: 16px; justify-content: space-between; align-items: center;">
                  <h3 style="font-size: 16px; font-weight: 600; margin: 0;">
                    🔑 ${auth.name}
                  </h3>
                  <div class="row" style="gap: 8px;">
                    <button 
                      class="btn btn--sm" 
                      style="font-size: 13px; padding: 8px 14px;"
                      @click=${() => {
                        props.onRefreshAuthModels(auth.authId);
                      }}
                    >
                      🔄 ${t("models.refresh_models")}
                    </button>
                    <button 
                      class="btn btn--sm" 
                      @click=${() => {
                        // 打开添加模型表单
                        props.onAddModelConfig(auth.authId, "");
                      }}
                    >
                      ➕ ${t("models.add_model")}
                    </button>
                  </div>
                </div>
                
                ${
                  authModels.length === 0
                    ? html`<div class="muted" style="padding: 20px; text-align: center; font-size: 13px;">${t("models.no_models")}</div>`
                    : html`
                    <div style="display: grid; gap: 12px;">
                      ${authModels.map((model) => renderModelCard(model, props))}
                    </div>
                  `
                }
              </div>
            `;
          })}
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${() => props.onCloseModelsList()}>
            ${t("models.close")}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderModelCard(model: ModelConfigSnapshot, props: ModelsProps) {
  const isDeprecated = (model as any).deprecated === true;
  const statusColor = isDeprecated ? "red" : model.enabled ? "green" : "gray";
  const displayName = model.nickname || model.modelName;

  return html`
    <div class="card" style="padding: 16px; ${isDeprecated ? "opacity: 0.7; background: var(--bg-secondary);" : ""}">
      <div class="row" style="justify-content: space-between; align-items: center; gap: 16px;">
        <div class="row" style="align-items: center; gap: 12px; flex: 1;">
          <span 
            class="status-indicator status-indicator--${statusColor}" 
            style="width: 10px; height: 10px; flex-shrink: 0;"
            title="${isDeprecated ? t("models.deprecated") : model.enabled ? t("models.enabled") : t("models.disabled")}"
          ></span>
          <div style="flex: 1; min-width: 0;">
            <div class="card-title" style="font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>${displayName}</span>
              ${
                isDeprecated
                  ? html`
                <span style="font-size: 11px; padding: 2px 6px; background: #ff5c5c; color: #fff; border-radius: 3px;">
                  ⚠️ ${t("models.deprecated")}
                </span>
              `
                  : html`
                <span style="font-size: 11px; padding: 2px 6px; background: ${model.enabled ? "rgba(34, 197, 94, 0.15)" : "var(--bg-muted)"}; color: ${model.enabled ? "#22c55e" : "var(--text-secondary)"}; border-radius: 3px; font-weight: 500;">
                  ${model.enabled ? `✓ ${t("models.status_enabled")}` : `○ ${t("models.status_disabled")}`}
                </span>
              `
              }
            </div>
            <div class="card-sub" style="font-size: 11px; opacity: 0.7;">${model.modelName}</div>
            ${
              model.pricing
                ? html`
              <div class="card-sub" style="margin-top: 4px; font-size: 11px;">
                💵 ${t("models.input_per_1k")}: $${model.pricing.inputPer1k.toFixed(4)}/1K · ${t("models.output_per_1k")}: $${model.pricing.outputPer1k.toFixed(4)}/1K
              </div>
            `
                : nothing
            }
          </div>
        </div>
        <div class="row" style="gap: 8px; flex-shrink: 0;">
          <button 
            class="btn btn--sm" 
            style="padding: 6px 12px; font-size: 12px;"
            @click=${() => props.onEditModelConfig(model.configId)}
          >
            ⚙️ ${t("models.configure")}
          </button>
          ${
            !isDeprecated
              ? html`
            <button 
              class="btn btn--sm" 
              style="padding: 6px 12px; font-size: 12px;"
              @click=${() => props.onToggleModelConfig(model.configId, !model.enabled)}
            >
              ${model.enabled ? `🔴 ${t("models.disable")}` : `🟢 ${t("models.enable")}`}
            </button>
          `
              : html`
            <button 
              class="btn btn--sm" 
              style="padding: 6px 12px; font-size: 12px; cursor: not-allowed; opacity: 0.5;"
              disabled
              title="${t("models.deprecated_cannot_enable")}"
            >
              ⚠️ ${t("models.deprecated")}
            </button>
          `
          }
          <button 
            class="btn btn--sm btn--danger" 
            style="padding: 6px 12px; font-size: 12px;"
            @click=${() => {
              if (confirm(t("models.delete_model_confirm").replace("{name}", displayName))) {
                props.onDeleteModelConfig(model.configId);
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

// ============ 模型配置模态框 ============

export function renderModelConfigModal(props: ModelsProps) {
  if (!props.editingModelConfig) {
    return nothing;
  }

  const config = props.editingModelConfig;
  const isNewModel = !config.configId; // 新增模型
  const availableAuths = props.snapshot?.auths?.[config.provider] || [];
  const selectedAuth = availableAuths.find((a) => a.authId === config.authId);
  const hasAuth = !!config.authId && !!selectedAuth;

  // 检查是否可以启用：必须有认证
  const canEnable = hasAuth;
  const enableWarning = !hasAuth ? t("models.enable_requires_auth") : "";

  // 新增模型时，检查是否填写了模型名称
  const canSave = isNewModel ? hasAuth && config.modelName.trim().length > 0 : true;

  // 检查是否有未保存的内容
  const hasUnsavedContent = isNewModel && (config.modelName || config.authId || config.nickname);

  const handleCancelModelConfig = () => {
    if (hasUnsavedContent) {
      if (confirm("您有未保存的内容，确定要关闭吗？")) {
        props.onCancelModelConfigEdit();
      }
    } else {
      props.onCancelModelConfigEdit();
    }
  };

  return html`
    <div class="modal-overlay" @click=${handleCancelModelConfig}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${isNewModel ? t("models.add_model") : `${t("models.model_config")} - ${config.modelName}`}</h2>
          <button class="btn-icon" @click=${handleCancelModelConfig}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 24px;">
          <!-- 认证选择 -->
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">
              ${t("models.auth")} <span style="color: #ff5c5c;">*</span>
            </label>
            <select 
              class="input" 
              .value=${config.authId || ""}
              @change=${(e: Event) => {
                const newAuthId = (e.target as HTMLSelectElement).value;
                config.authId = newAuthId || "";
                // 如果没有认证，自动禁用模型
                if (!newAuthId) {
                  config.enabled = false;
                }
              }}
              style="cursor: pointer;"
            >
              <option value="">${t("models.select_auth_none")}</option>
              ${availableAuths.map(
                (auth) => html`
                <option value="${auth.authId}" ?selected=${auth.authId === config.authId}>
                  ${auth.name} ${auth.isDefault ? "⭐" : ""}
                </option>
              `,
              )}
            </select>
            ${
              !hasAuth
                ? html`
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                ${t("models.auth_required_hint")}
              </div>
            `
                : nothing
            }
          </div>
          
          <!-- 模型名称输入（仅新增模型时显示） -->
          ${
            isNewModel
              ? html`
            <div style="margin-bottom: 16px;">
              <label style="display: block; margin-bottom: 4px; font-weight: 500;">
                ${t("models.model_name")} <span style="color: #ff5c5c;">*</span>
              </label>
              <input 
                type="text" 
                class="input" 
                placeholder="${t("models.model_name_placeholder")}"
                .value=${config.modelName}
                @input=${(e: Event) => {
                  config.modelName = (e.target as HTMLInputElement).value;
                }}
              />
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                ${t("models.model_name_hint")}
              </div>
            </div>
          `
              : nothing
          }
          
          <!-- 启用开关 -->
          <div style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: ${canEnable ? "pointer" : "not-allowed"};">
              <input 
                type="checkbox" 
                .checked=${config.enabled}
                ?disabled=${!canEnable}
                @change=${(e: Event) => {
                  if (!canEnable) {
                    (e.target as HTMLInputElement).checked = false;
                    alert(enableWarning);
                    return;
                  }
                  config.enabled = (e.target as HTMLInputElement).checked;
                }}
                style="width: 18px; height: 18px; cursor: ${canEnable ? "pointer" : "not-allowed"};"
              />
              <span style="font-weight: 500;">${t("models.enable_model")}</span>
            </label>
            ${
              !canEnable && enableWarning
                ? html`
              <div style="font-size: 11px; color: #ff5c5c; margin-top: 4px;">
                ⚠️ ${enableWarning}
              </div>
            `
                : nothing
            }
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">${t("models.model_nickname")}</label>
            <input 
              type="text" 
              class="input" 
              placeholder="${t("models.model_nickname_placeholder")}"
              .value=${config.nickname || ""}
              @input=${(e: Event) => {
                config.nickname = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          
          <h3 style="font-size: 14px; font-weight: 600; margin: 20px 0 12px;">${t("models.content_control")}</h3>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Temperature (0-2)</label>
            <input 
              type="number" 
              class="input" 
              min="0" 
              max="2" 
              step="0.1"
              placeholder="0.7"
              .value=${config.temperature?.toString() || ""}
              @input=${(e: Event) => {
                const val = (e.target as HTMLInputElement).value;
                config.temperature = val ? parseFloat(val) : undefined;
              }}
            />
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Top P (0-1)</label>
            <input 
              type="number" 
              class="input" 
              min="0" 
              max="1" 
              step="0.1"
              placeholder="0.9"
              .value=${config.topP?.toString() || ""}
              @input=${(e: Event) => {
                const val = (e.target as HTMLInputElement).value;
                config.topP = val ? parseFloat(val) : undefined;
              }}
            />
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Max Tokens</label>
            <input 
              type="number" 
              class="input" 
              placeholder="4096"
              .value=${config.maxTokens?.toString() || ""}
              @input=${(e: Event) => {
                const val = (e.target as HTMLInputElement).value;
                config.maxTokens = val ? parseInt(val) : undefined;
              }}
            />
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${handleCancelModelConfig}>
            ${t("models.cancel")}
          </button>
          <button
            class="btn btn--primary"
            style="background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
            ?disabled=${!canSave}
            @click=${() => {
              if (canSave) {
                props.onSaveModelConfig(config);
              }
            }}
          >
            ${t("models.save")}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============ 辅助函数 ============

function resolveProviderLabel(snapshot: ModelsStatusSnapshot | null, providerId: string): string {
  const meta = snapshot?.providerMeta?.find((m) => m.id === providerId);
  return meta?.label ?? snapshot?.providerLabels?.[providerId] ?? providerId;
}

// ============ 导入模型模态框 ============

export function renderImportModelsModal(
  props: ModelsProps & {
    importableModels: Array<{
      modelName: string;
      isConfigured: boolean;
      isEnabled: boolean;
      configId?: string;
    }> | null;
    importingAuthId: string | null;
    importingProvider: string | null;
    selectedImportModels: Set<string>;
    onToggleImportModel: (modelName: string) => void;
    onCancelImport: () => void;
  },
) {
  if (!props.importableModels || !props.importingAuthId) {
    return nothing;
  }

  const providerLabel = resolveProviderLabel(props.snapshot, props.importingProvider || "");
  const auth = props.snapshot?.auths?.[props.importingProvider || ""]?.find(
    (a) => a.authId === props.importingAuthId,
  );

  // 只显示未配置的模型
  const newModels = props.importableModels.filter((m) => !m.isConfigured);
  const configuredModels = props.importableModels.filter((m) => m.isConfigured);

  return html`
    <div class="modal-overlay" @click=${() => props.onCancelImport()}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${providerLabel} - ${t("models.import_models_title")}</h2>
          <button class="btn-icon" @click=${() => props.onCancelImport()}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 32px;">
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">
              🔑 ${auth?.name || ""}
            </h3>
            <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
              ${t("models.import_models_description")}
            </p>
          </div>
          
          ${
            newModels.length === 0
              ? html`
            <div class="muted" style="padding: 40px; text-align: center;">
              ${t("models.no_new_models")}
            </div>
          `
              : html`
            <div style="margin-bottom: 20px;">
              <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--accent);">
                ✨ ${t("models.new_models")} (${newModels.length})
              </h4>
              <div style="display: grid; gap: 8px; max-height: 300px; overflow-y: auto; padding: 4px;">
                ${newModels.map(
                  (model) => html`
                  <label 
                    class="card" 
                    style="padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s;"
                    @mouseover=${(e: Event) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                    }}
                    @mouseout=${(e: Event) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <input 
                      type="checkbox" 
                      .checked=${props.selectedImportModels.has(model.modelName)}
                      @change=${() => props.onToggleImportModel(model.modelName)}
                      style="width: 18px; height: 18px; cursor: pointer;"
                    />
                    <span style="flex: 1; font-size: 14px; font-weight: 500;">${model.modelName}</span>
                    <span style="font-size: 11px; padding: 4px 8px; background: var(--accent); color: #fff; border-radius: 4px;">
                      ${t("models.new")}
                    </span>
                  </label>
                `,
                )}
              </div>
            </div>
          `
          }
          
          ${
            configuredModels.length > 0
              ? html`
            <div>
              <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary);">
                ✅ ${t("models.configured_models")} (${configuredModels.length})
              </h4>
              <div style="display: grid; gap: 8px; max-height: 200px; overflow-y: auto; padding: 4px;">
                ${configuredModels.map(
                  (model) => html`
                  <div class="card" style="padding: 12px 16px; display: flex; align-items: center; gap: 12px; opacity: 0.6;">
                    <span style="flex: 1; font-size: 14px;">${model.modelName}</span>
                    <span style="font-size: 11px; padding: 4px 8px; background: var(--text-secondary); color: #fff; border-radius: 4px;">
                      ${model.isEnabled ? t("models.enabled") : t("models.disabled")}
                    </span>
                  </div>
                `,
                )}
              </div>
            </div>
          `
              : nothing
          }
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${() => props.onCancelImport()}>
            ${t("models.cancel")}
          </button>
          <button
            class="btn btn--primary"
            style="background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
            ?disabled=${props.selectedImportModels.size === 0}
            @click=${() => {
              if (props.selectedImportModels.size > 0 && props.importingAuthId) {
                props.onImportModels(props.importingAuthId, Array.from(props.selectedImportModels));
              }
            }}
          >
            ✨ ${t("models.import_selected")} (${props.selectedImportModels.size})
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============ 供应商管理模态框 ============

export function renderAddProviderModal(
  props: ModelsProps & {
    addingProvider: boolean;
    providerForm: {
      selectedTemplateId: string | null;
      id: string;
      name: string;
      icon: string;
      website: string;
      defaultBaseUrl: string;
      apiKeyPlaceholder: string;
      isEditing?: boolean; // 是否为编辑模式
      originalId?: string; // 编辑时的原始 ID
    } | null;
  },
) {
  if (!props.addingProvider || !props.providerForm) {
    return nothing;
  }

  const form = props.providerForm;
  const isEditing = form.isEditing || false;
  const apiTemplates = (props.snapshot as any)?.apiTemplates || [];
  const selectedTemplate = apiTemplates.find((t: any) => t.id === form.selectedTemplateId);

  // 检查是否有未保存的内容
  const hasUnsavedContent =
    form.id || form.name || form.website || (form.defaultBaseUrl && form.defaultBaseUrl !== "");

  const handleOverlayClick = () => {
    if (hasUnsavedContent) {
      if (confirm("您有未保存的内容，确定要关闭吗？")) {
        props.onCancelProviderEdit();
      }
    } else {
      props.onCancelProviderEdit();
    }
  };

  return html`
    <div class="modal-overlay" @click=${handleOverlayClick}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${isEditing ? `✏️ ${t("models.edit_provider")}` : `➕ ${t("models.add_provider")}`}</h2>
          <button class="btn-icon" @click=${handleOverlayClick}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 32px;">
          <!-- 模板选择 -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">${t("models.select_template")}</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
              ${apiTemplates.map(
                (template: any) => html`
                <div 
                  class="card" 
                  style="
                    padding: 16px; 
                    cursor: pointer; 
                    border: 2px solid ${form.selectedTemplateId === template.id ? "var(--accent)" : "transparent"};
                    background: ${form.selectedTemplateId === template.id ? "var(--bg-elevated)" : "var(--bg-secondary)"};
                    transition: all 0.15s ease;
                  "
                  @click=${() => props.onTemplateSelect(template.id)}
                >
                  <div style="font-weight: 600; margin-bottom: 4px;">${template.name}</div>
                  ${
                    template.description
                      ? html`
                    <div style="font-size: 12px; color: var(--text-secondary);">${template.description}</div>
                  `
                      : nothing
                  }
                </div>
              `,
              )}
            </div>
          </div>

          <!-- 供应商信息 -->
          <div style="display: grid; gap: 16px;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 500;">
                ${t("models.provider_id")} <span style="color: #ff5c5c;">*</span>
              </label>
              <input 
                type="text" 
                class="input" 
                placeholder="${t("models.provider_id_placeholder")}"
                .value=${form.id}
                ?disabled=${isEditing}
                @input=${(e: Event) => {
                  if (!isEditing) {
                    const newId = (e.target as HTMLInputElement).value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "");
                    form.id = newId;
                    props.onProviderFormChange({ id: newId });
                  }
                }}
                style="${isEditing ? "background: var(--bg-muted); cursor: not-allowed; opacity: 0.7;" : ""}"
              />
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                ${isEditing ? "供应商 ID 不可修改" : "只能包含小写字母、数字和连字符"}
              </div>
            </div>

            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 500;">
                ${t("models.provider_name")} <span style="color: #ff5c5c;">*</span>
              </label>
              <input 
                type="text" 
                class="input" 
                placeholder="${t("models.provider_name_placeholder")}"
                .value=${form.name}
                @input=${(e: Event) => {
                  const newName = (e.target as HTMLInputElement).value;
                  form.name = newName;
                  props.onProviderFormChange({ name: newName });
                }}
              />
            </div>

            <div class="row" style="gap: 16px; align-items: flex-start;">
              <div style="flex: 1; max-width: 200px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">
                  ${t("models.provider_icon")}
                </label>
                <icon-picker
                  .value=${form.icon || "🤖"}
                  .onChange=${(value: string) => {
                    form.icon = value;
                    props.onProviderFormChange({ icon: value });
                  }}
                ></icon-picker>
              </div>
              <div style="flex: 1;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">
                  ${t("models.provider_website")}
                </label>
                <input 
                  type="url" 
                  class="input" 
                  placeholder="${t("models.provider_website_placeholder")}"
                  .value=${form.website}
                  @input=${(e: Event) => {
                    const newWebsite = (e.target as HTMLInputElement).value;
                    form.website = newWebsite;
                    props.onProviderFormChange({ website: newWebsite });
                  }}
                />
              </div>
            </div>

            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 500;">
                ${t("models.provider_base_url")} <span style="color: #ff5c5c;">*</span>
              </label>
              <input 
                type="url" 
                class="input" 
                placeholder="${t("models.provider_base_url_placeholder")}"
                .value=${form.defaultBaseUrl}
                @input=${(e: Event) => {
                  const newBaseUrl = (e.target as HTMLInputElement).value;
                  form.defaultBaseUrl = newBaseUrl;
                  props.onProviderFormChange({ defaultBaseUrl: newBaseUrl });
                }}
              />
            </div>

            <!-- 认证管理提示 -->
            <div style="
              padding: 16px;
              background: var(--bg-elevated);
              border-left: 4px solid var(--accent);
              border-radius: 8px;
              margin-top: 8px;
            ">
              <div style="display: flex; align-items: start; gap: 12px;">
                <span style="font-size: 20px; flex-shrink: 0;">🔐</span>
                <div>
                  <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">
                    认证信息配置
                  </div>
                  <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
                    API Key、Base URL 等鉴权信息请前往 <strong style="color: var(--accent);">「认证管理」</strong> 页面进行配置和管理。<br/>
                    每个供应商可以添加多个认证账号，方便切换和管理。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${handleOverlayClick}>
            ${t("models.cancel")}
          </button>
          <button
            class="btn btn--primary"
            style="background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
            ?disabled=${!form.id || !form.name || !form.defaultBaseUrl}
            @click=${() => {
              if (form.id && form.name && form.defaultBaseUrl) {
                props.onSaveProvider({
                  id: form.id,
                  name: form.name,
                  icon: form.icon,
                  website: form.website,
                  templateId: form.selectedTemplateId || undefined,
                  defaultBaseUrl: form.defaultBaseUrl,
                  apiKeyPlaceholder: form.apiKeyPlaceholder,
                });
              }
            }}
          >
            ${isEditing ? `✓ ${t("models.save")}` : `➕ ${t("models.add_provider")}`}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============ 查看供应商模态框（只读） ============

export function renderViewProviderModal(
  props: ModelsProps & {
    viewingProviderId: string | null;
  },
) {
  if (!props.viewingProviderId) {
    return nothing;
  }

  const providerId = props.viewingProviderId;
  // 从 providerInstances 读取完整的供应商信息
  const providerInstance = (props.snapshot?.providerInstances as any[])?.find(
    (p: any) => p.id === providerId,
  );
  const providerLabel = props.snapshot?.providerLabels?.[providerId] || providerId;
  const auths = props.snapshot?.auths?.[providerId] ?? [];
  const modelConfigs = props.snapshot?.modelConfigs?.[providerId] ?? [];
  const apiTemplates = (props.snapshot as any)?.apiTemplates || [];
  const selectedTemplate = apiTemplates.find((t: any) => t.id === providerInstance?.templateId);

  return html`
    <div class="modal-overlay" @click=${() => props.onCancelProviderView()}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>🔍 ${providerInstance?.name || providerLabel}</h2>
          <button class="btn-icon" @click=${() => props.onCancelProviderView()}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 32px;">
          <!-- 基本信息 -->
          <div style="margin-bottom: 32px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">基本信息</h3>
            <div style="display: grid; gap: 16px;">
              <div class="row" style="gap: 16px;">
                <div style="flex: 1;">
                  <label style="display: block; margin-bottom: 4px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">
                    ${t("models.provider_id")}
                  </label>
                  <div style="padding: 10px 12px; background: var(--bg-muted); border-radius: var(--radius-sm); font-family: monospace; font-size: 14px;">
                    ${providerId}
                  </div>
                </div>
                <div style="flex: 1;">
                  <label style="display: block; margin-bottom: 4px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">
                    ${t("models.provider_name")}
                  </label>
                  <div style="padding: 10px 12px; background: var(--bg-muted); border-radius: var(--radius-sm); font-size: 14px;">
                    ${providerInstance?.name || providerLabel}
                  </div>
                </div>
              </div>

              <div class="row" style="gap: 16px;">
                <div style="flex: 1;">
                  <label style="display: block; margin-bottom: 4px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">
                    ${t("models.provider_icon")}
                  </label>
                  <div style="padding: 10px 12px; background: var(--bg-muted); border-radius: var(--radius-sm); font-size: 24px;">
                    ${providerInstance?.icon || "🤖"}
                  </div>
                </div>
                <div style="flex: 1;">
                  <label style="display: block; margin-bottom: 4px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">
                    ${t("models.provider_website")}
                  </label>
                  <div style="padding: 10px 12px; background: var(--bg-muted); border-radius: var(--radius-sm); font-size: 14px;">
                    ${
                      providerInstance?.website
                        ? html`
                      <a href="${providerInstance.website}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none;">
                        ${providerInstance.website}
                      </a>
                    `
                        : html`
                            <span style="color: var(--text-secondary)">未设置</span>
                          `
                    }
                  </div>
                </div>
              </div>

              ${
                selectedTemplate
                  ? html`
                <div>
                  <label style="display: block; margin-bottom: 4px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">
                    ${t("models.select_template")}
                  </label>
                  <div style="padding: 10px 12px; background: var(--bg-muted); border-radius: var(--radius-sm); font-size: 14px;">
                    ${selectedTemplate.name}
                    ${selectedTemplate.description ? html`<span style="color: var(--text-secondary); margin-left: 8px;">- ${selectedTemplate.description}</span>` : nothing}
                  </div>
                </div>
              `
                  : nothing
              }

              <div>
                <label style="display: block; margin-bottom: 4px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">
                  ${t("models.provider_base_url")}
                </label>
                <div style="padding: 10px 12px; background: var(--bg-muted); border-radius: var(--radius-sm); font-family: monospace; font-size: 13px; word-break: break-all;">
                  ${providerInstance?.defaultBaseUrl || "未设置"}
                </div>
              </div>

              <div>
                <label style="display: block; margin-bottom: 4px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">
                  ${t("models.api_key_placeholder_label")}
                </label>
                <div style="padding: 10px 12px; background: var(--bg-muted); border-radius: var(--radius-sm); font-family: monospace; font-size: 13px;">
                  ${providerInstance?.apiKeyPlaceholder || "sk-..."}
                </div>
              </div>
            </div>
          </div>

          <!-- 统计信息 -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">统计信息</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
              <div style="padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md);">
                <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">${t("models.auth_count")}</div>
                <div style="font-size: 24px; font-weight: 600; color: var(--accent);">${auths.length}</div>
              </div>
              <div style="padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md);">
                <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">${t("models.model_count")}</div>
                <div style="font-size: 24px; font-weight: 600; color: var(--accent);">${modelConfigs.length}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${() => props.onCancelProviderView()}>
            ${t("models.close")}
          </button>
          <button
            class="btn btn--primary"
            style="background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
            @click=${() => {
              props.onCancelProviderView();
              props.onEditProvider(providerId);
            }}
          >
            ✏️ ${t("models.edit_provider")}
          </button>
        </div>
      </div>
    </div>
  `;
}
