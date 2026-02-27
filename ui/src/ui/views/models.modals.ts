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

  // 获取原始认证信息（用于重复值检测和显示掩码）
  const originalAuth = !isNew
    ? Object.values(props.snapshot?.auths ?? {})
        .flat()
        .find((a) => a.authId === auth.authId)
    : null;
  const originalMaskedApiKey = originalAuth?.apiKey || ""; // 后端返回的是已掩码的值

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

  // 保存时的验证和提示
  const handleSave = () => {
    if (!auth.name || (isNew && !auth.apiKey)) {
      return;
    }

    // 检查：是否输入了与原掩码值相同的 API Key（重复值检测）
    if (!isNew && auth.apiKey && auth.apiKey === originalMaskedApiKey) {
      alert("请勿输入掩码显示的值，如需修改请输入完整的新 API Key，或留空保持原值不变。");
      return;
    }

    // 检查：编辑时修改 API Key 的警告（只有当用户输入了新值时）
    if (!isNew && auth.apiKey && auth.apiKey !== originalMaskedApiKey) {
      const confirmed = confirm(
        `⚠️ 修改 API Key 将导致使用该认证的所有模型配置失效，需要重新测试连接。\n\n确定要继续修改吗？`,
      );
      if (!confirmed) {
        return;
      }
    }

    props.onSaveAuth(auth);
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
            ${
              !isNew && originalMaskedApiKey
                ? html`
              <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; padding: 6px 10px; background: var(--bg-elevated); border-radius: 4px; font-family: monospace;">
                当前值：${originalMaskedApiKey}
              </div>
            `
                : nothing
            }
            <input 
              type="password" 
              class="input" 
              placeholder="${isNew ? "sk-..." : "留空则保持原密钥不变"}"
              .value=${auth.apiKey}
              @input=${(e: Event) => {
                auth.apiKey = (e.target as HTMLInputElement).value;
              }}
            />
            ${
              isNew
                ? nothing
                : html`
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px">
                      留空则保持原 API Key 不变
                    </div>
                  `
            }
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
            ?disabled=${!auth.name || (isNew && !auth.apiKey)}
            @click=${handleSave}
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
  // 检查是否正在测试
  const isTesting = (props as any).testingAuthId === auth.authId;
  const lastTest = auth.status?.lastChecked
    ? formatAgo(Date.now() - auth.status.lastChecked)
    : null;
  
  // 检测OAuth过期（通过error信息判断）
  const error = auth.status?.error || "";
  const isOAuthExpired = error.toLowerCase().includes("expired") || 
                         error.toLowerCase().includes("refresh") || 
                         error.toLowerCase().includes("invalid access token");
  const isQwenOAuth = auth.apiKey.startsWith("qwen-oauth") || 
                      (auth as any).provider === "qwen-portal";
  
  // 判断认证类型
  const authType = isQwenOAuth ? "oauth" : "api_key";

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
            ${
              lastTest && auth.status
                ? html`
              <div class="card-sub" style="margin-top: 4px; font-size: 11px; color: ${auth.status.valid ? "var(--success)" : "var(--text-secondary)"}">
                ${auth.status.valid ? t("models.test_status_valid") : t("models.test_status_invalid")} · ${t("models.last_test")}: ${lastTest}
                ${auth.status.error ? html` · ${auth.status.error}` : nothing}
              </div>
            `
                : nothing
            }
            ${
              isOAuthExpired && isQwenOAuth
                ? html`
              <div class="card-sub" style="margin-top: 6px; padding: 8px; background: rgba(255, 92, 92, 0.1); border-left: 3px solid #ff5c5c; font-size: 12px; border-radius: 4px;">
                <div style="font-weight: 600; color: #ff5c5c; margin-bottom: 4px;">⚠️ OAuth 认证已过期</div>
                <div style="color: var(--text-secondary); margin-bottom: 8px;">点击下方"重新认证"按钮刷新授权</div>
              </div>
            `
                : nothing
            }
          </div>
        </div>
        <div class="row" style="gap: 10px; flex-shrink: 0;">
          ${isOAuthExpired && authType === "oauth" ? html`
            <button 
              class="btn btn--sm btn--warning" 
              style="padding: 8px 14px; font-size: 13px; background: #ff9800; color: white;"
              @click=${() => (props as any).onReauth?.(auth.authId, auth.provider)}
            >
              🔄 重新认证
            </button>
          ` : authType === "oauth" ? html`
            <button 
              class="btn btn--sm" 
              style="padding: 8px 14px; font-size: 13px; background: #4CAF50; color: white;"
              @click=${() => {
                console.log('[DEBUG] OAuth Debug Button Clicked', { authId: auth.authId, provider: auth.provider });
                (props as any).onReauth?.(auth.authId, auth.provider);
              }}
              title="调试OAuth重认证功能"
            >
              🐛 OAuth调试
            </button>
          ` : nothing}
           <button 
            class="btn btn--sm" 
            style="padding: 8px 14px; font-size: 13px; ${isTesting ? "opacity: 0.6;" : ""}"
            ?disabled=${isTesting}
            @click=${() => (props as any).onTestAuth?.(auth.authId)}
          >
            ${isTesting ? "🔄 " + t("models.testing") : "✅ " + t("models.test")}
          </button>
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
          ${
            auths.length === 0
              ? html`
              <div style="margin-bottom: 32px;">
                <div class="row" style="margin-bottom: 16px; justify-content: space-between; align-items: center;">
                  <h3 style="font-size: 16px; font-weight: 600; margin: 0; color: var(--text-secondary);">
                    🔑 ${t("models.no_auth_yet")}
                  </h3>
                  <div class="row" style="gap: 8px;">
                    <button 
                      class="btn btn--sm" 
                      style="font-size: 13px; padding: 8px 14px;"
                      @click=${() => {
                        // 无认证时，使用供应商默认配置刷新
                        props.onRefreshAuthModels(null);
                      }}
                    >
                      🔄 ${t("models.view_available_models")}
                    </button>
                    <button 
                      class="btn btn--sm btn--primary" 
                      @click=${() => {
                        props.onAddAuth(providerId);
                      }}
                    >
                      ➕ ${t("models.add_auth")}
                    </button>
                  </div>
                </div>
                
                <div class="muted" style="padding: 20px; text-align: center; font-size: 13px; background: var(--bg-secondary); border-radius: 8px;">
                  ${t("models.no_auth_hint")}
                </div>
              </div>
            `
              : auths.map((auth) => {
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
                })
          }
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
      showApiImport?: boolean; // API 示例导入状态
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

  // API 示例导入状态（从 form 中读取）
  const showApiImport = form.showApiImport || false;

  // 添加模式：'code-import' | 'manual'
  const addMode = (form as any).addMode || "code-import";

  // 代码导入步骤：'input' | 'confirm'
  const importStep = (form as any).importStep || "input";

  // 切换添加模式
  const switchAddMode = (mode: "code-import" | "manual") => {
    props.onProviderFormChange({ addMode: mode, importStep: "input" });
  };

  // 切换导入状态
  const toggleApiImport = () => {
    props.onProviderFormChange({ showApiImport: !showApiImport });
  };

  // 解析 API 调用示例（支持 curl 命令）
  const parseApiSample = (sample: string) => {
    try {
      // 提取 URL
      const urlMatch = sample.match(/["']?(https?:\/\/[^\s"']+)["']?/);
      if (!urlMatch) {
        alert("❌ 无法识别 URL，请检查输入的示例代码");
        return;
      }

      const fullUrl = urlMatch[1];
      const url = new URL(fullUrl);

      // 提取 Base URL（保留路径，但去掉最后的端点）
      let baseUrl = `${url.protocol}//${url.host}`;

      // 如果有路径，保留到倒数第二个斜杠
      if (url.pathname && url.pathname !== "/") {
        const pathParts = url.pathname.split("/").filter((p) => p);
        // 移除最后一个路径段（通常是端点名，如 chat/completions、completions 等）
        if (pathParts.length > 0) {
          pathParts.pop(); // 移除最后一段
          if (pathParts.length > 0) {
            baseUrl += "/" + pathParts.join("/");
          }
        }
      }

      // 提取 Provider ID（从域名推断）
      let providerId = "";
      let providerName = "";

      // 常见供应商域名映射
      const domainMap: Record<string, { id: string; name: string; knownModels?: string[] }> = {
        "openai.com": { id: "openai", name: "OpenAI" },
        "api.openai.com": { id: "openai", name: "OpenAI" },
        "anthropic.com": { id: "anthropic", name: "Anthropic" },
        "api.anthropic.com": { id: "anthropic", name: "Anthropic" },
        "bigmodel.cn": {
          id: "zhipu",
          name: "智谱 AI",
          knownModels: [
            "glm-5-plus",
            "glm-5",
            "glm-4-plus",
            "glm-4-0520",
            "glm-4",
            "glm-4-air",
            "glm-4-airx",
            "glm-4-flash",
            "glm-4-flashx",
            "glm-4v-plus",
            "glm-4v",
            "glm-3-turbo",
            "cogview-3-plus",
            "cogview-3",
            "embedding-3",
            "embedding-2",
          ],
        },
        "open.bigmodel.cn": {
          id: "zhipu",
          name: "智谱 AI",
          knownModels: [
            "glm-5-plus",
            "glm-5",
            "glm-4-plus",
            "glm-4-0520",
            "glm-4",
            "glm-4-air",
            "glm-4-airx",
            "glm-4-flash",
            "glm-4-flashx",
            "glm-4v-plus",
            "glm-4v",
            "glm-3-turbo",
            "cogview-3-plus",
            "cogview-3",
            "embedding-3",
            "embedding-2",
          ],
        },
        "deepseek.com": { id: "deepseek", name: "DeepSeek" },
        "api.deepseek.com": { id: "deepseek", name: "DeepSeek" },
        "moonshot.cn": { id: "moonshot", name: "月之暗面" },
        "api.moonshot.cn": { id: "moonshot", name: "月之暗面" },
        "dashscope.aliyuncs.com": { id: "qianwen", name: "阿里千问" },
        "generativelanguage.googleapis.com": { id: "google", name: "Google Gemini" },
      };

      // 查找匹配的供应商
      let knownModels: string[] | undefined;
      for (const [domain, info] of Object.entries(domainMap)) {
        if (url.host.includes(domain)) {
          providerId = info.id;
          providerName = info.name;
          knownModels = info.knownModels;
          break;
        }
      }

      // 如果没有匹配，使用域名作为 ID
      if (!providerId) {
        const hostParts = url.host.split(".");
        providerId = hostParts[hostParts.length - 2] || "custom";
        providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1);
      }

      // 提取 API Key 占位符（从 Authorization header）
      let apiKeyPlaceholder = "请输入API密钥";
      const authMatch = sample.match(/Authorization[:\s]+Bearer\s+([^\s"']+)/);
      if (authMatch) {
        const authValue = authMatch[1];
        if (authValue.startsWith("sk-")) {
          apiKeyPlaceholder = "sk-...";
        } else if (authValue.toLowerCase().includes("key")) {
          apiKeyPlaceholder = "your-api-key";
        }
      }

      // 提取 JSON Body 中的模型名称和默认参数
      let extractedModel: string | undefined;
      let defaultParams: Record<string, any> = {};

      // 尝试解析 JSON 数据
      const jsonMatch = sample.match(/-d\s+['"]({[\s\S]*?})['"]/);
      if (jsonMatch) {
        try {
          // 清理 JSON 字符串（移除多余的空白和换行）
          const jsonStr = jsonMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
          const jsonData = JSON.parse(jsonStr);

          // 提取模型名称
          if (jsonData.model && typeof jsonData.model === "string") {
            extractedModel = jsonData.model;
          }

          // 提取默认参数
          if (jsonData.temperature !== undefined) {
            defaultParams.temperature = jsonData.temperature;
          }
          if (jsonData.max_tokens !== undefined) {
            defaultParams.maxTokens = jsonData.max_tokens;
          }
          if (jsonData.top_p !== undefined) {
            defaultParams.topP = jsonData.top_p;
          }
        } catch (err) {
          console.warn("[parseApiSample] Failed to parse JSON body:", err);
        }
      }

      // 如果提取到了模型名称，将其添加到 knownModels 列表中
      if (extractedModel && knownModels) {
        // 确保提取的模型在列表的首位（推荐使用）
        knownModels = [extractedModel, ...knownModels.filter((m) => m !== extractedModel)];
      } else if (extractedModel) {
        // 如果没有预设的 knownModels，创建一个只包含提取模型的列表
        knownModels = [extractedModel];
      }

      // 更新表单
      form.id = providerId;
      form.name = providerName;
      form.defaultBaseUrl = baseUrl;
      form.apiKeyPlaceholder = apiKeyPlaceholder;
      form.selectedTemplateId = "openai-compatible"; // 默认使用 OpenAI 兼容模板

      props.onProviderFormChange({
        id: providerId,
        name: providerName,
        defaultBaseUrl: baseUrl,
        apiKeyPlaceholder: apiKeyPlaceholder,
        knownModels: knownModels, // 传递已知模型列表
        selectedTemplateId: "openai-compatible", // 设置模板ID
        importStep: "confirm", // 进入确认步骤
      });
    } catch (err) {
      alert(`❌ 解析失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 渲染代码导入模式 - 步骤1：输入
  const renderCodeImportStep1 = () => html`
    <div style="display: grid; gap: 24px;">
      <!-- 使用说明 -->
      <div style="padding: 16px; background: var(--bg-elevated); border-radius: 8px; border-left: 4px solid #ff5c5c;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">
          📝 如何使用？
        </div>
        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.8;">
          1. 从模型供应商官网复制 API 调用示例（curl 命令）<br/>
          2. 粘贴到下方输入框<br/>
          3. 点击“解析并继续”，系统将自动提取：<br/>
          &nbsp;&nbsp;&nbsp;• 供应商基本信息（URL、认证方式）<br/>
          &nbsp;&nbsp;&nbsp;• 模型名称和推荐配置<br/>
          &nbsp;&nbsp;&nbsp;• 默认参数（temperature、max_tokens 等）
        </div>
      </div>
      
      <!-- 供应商名称输入 -->
      <div>
        <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px;">
          🏯 模型供应商名称 <span style="color: #ff5c5c;">*</span>
        </label>
        <input 
          type="text" 
          class="input"
          placeholder="例如：智谱 AI、DeepSeek、月之暗面等"
          .value=${form.name || ""}
          @input=${(e: Event) => {
            const newName = (e.target as HTMLInputElement).value;
            form.name = newName;
            props.onProviderFormChange({ name: newName });
          }}
        />
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
          请输入供应商的显示名称，将用于界面显示
        </div>
      </div>

      <!-- 示例代码输入 -->
      <div>
        <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px;">
          💻 示例代码 <span style="color: #ff5c5c;">*</span>
        </label>
        <textarea
          id="code-import-textarea"
          class="input"
          style="min-height: 180px; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; line-height: 1.5;"
          placeholder="粘贴 curl 命令示例，例如：&#10;&#10;curl -X POST 'https://open.bigmodel.cn/api/paas/v4/chat/completions' \&#10;  -H 'Authorization: Bearer your-api-key' \&#10;  -H 'Content-Type: application/json' \&#10;  -d '{\"model\": \"glm-5\", ...}'"
        ></textarea>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
          支持 curl 命令格式，系统将自动识别 URL、认证方式、模型名称和默认参数
        </div>
      </div>

      <!-- 按钮区域 -->
      <div class="row" style="gap: 12px; justify-content: flex-end;">
        <button 
          class="btn"
          @click=${handleOverlayClick}
        >
          取消
        </button>
        <button 
          class="btn btn--primary"
          style="background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
          @click=${() => {
            if (!form.name || !form.name.trim()) {
              alert("请输入模型供应商名称");
              return;
            }
            const textarea = document.querySelector("#code-import-textarea") as HTMLTextAreaElement;
            if (!textarea || !textarea.value.trim()) {
              alert("请粘贴 API 调用示例代码");
              return;
            }
            parseApiSample(textarea.value);
          }}
        >
          ✨ 解析并继续
        </button>
      </div>
    </div>
  `;

  // 渲染代码导入模式 - 步骤2：确认
  const renderCodeImportStep2 = () => html`
    <div style="display: grid; gap: 20px;">
      <!-- 成功提示 -->
      <div style="padding: 16px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; color: #155724;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">
          ✅ 解析成功！
        </div>
        <div style="font-size: 13px;">
          请确认以下信息是否正确，您可以修改任何字段
        </div>
      </div>

      <!-- 供应商信息表单 -->
      <div style="display: grid; gap: 16px;">
        <!-- 供应商 ID -->
        <div>
          <label style="display: block; margin-bottom: 4px; font-weight: 500;">
            ${t("models.provider_id")} <span style="color: #ff5c5c;">*</span>
          </label>
          <input 
            type="text" 
            class="input" 
            placeholder="${t("models.provider_id_placeholder")}"
            .value=${form.id}
            @input=${(e: Event) => {
              const newId = (e.target as HTMLInputElement).value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "");
              form.id = newId;
              props.onProviderFormChange({ id: newId });
            }}
          />
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
            只能包含小写字母、数字和连字符
          </div>
        </div>

        <!-- 供应商名称 -->
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

        <!-- Base URL -->
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

        <!-- 图标和网站 -->
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
              .value=${form.website || ""}
              @input=${(e: Event) => {
                const newWebsite = (e.target as HTMLInputElement).value;
                form.website = newWebsite;
                props.onProviderFormChange({ website: newWebsite });
              }}
            />
          </div>
        </div>
      </div>

      <!-- 按钮区域 -->
      <div class="row" style="gap: 12px; justify-content: flex-end;">
        <button 
          class="btn"
          @click=${() => {
            props.onProviderFormChange({ importStep: "input" });
          }}
        >
          ← 返回上一步
        </button>
        <button 
          class="btn btn--primary"
          style="background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
          ?disabled=${!form.id || !form.name || !form.defaultBaseUrl}
          @click=${() => {
            if (!form.id || !form.name || !form.defaultBaseUrl) {
              return;
            }
            props.onSaveProvider({
              id: form.id,
              name: form.name,
              icon: form.icon || "🤖",
              website: form.website || "",
              templateId: form.selectedTemplateId || "openai-compatible",
              defaultBaseUrl: form.defaultBaseUrl,
              apiKeyPlaceholder: form.apiKeyPlaceholder || "请输入API密钥",
            });
          }}
        >
          ✔️ 确认添加
        </button>
      </div>
    </div>
  `;

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
          <!-- 标签页切换（仅在新增模式下显示） -->
          ${
            !isEditing
              ? html`
            <div style="margin-bottom: 24px; border-bottom: 2px solid var(--bg-elevated);">
              <div class="row" style="gap: 0;">
                <button
                  class="btn"
                  style="
                    flex: 1;
                    border-radius: 0;
                    border: none;
                    border-bottom: 3px solid ${addMode === "code-import" ? "#ff5c5c" : "transparent"};
                    background: ${addMode === "code-import" ? "var(--bg-elevated)" : "transparent"};
                    font-weight: ${addMode === "code-import" ? "600" : "400"};
                    color: ${addMode === "code-import" ? "var(--text-primary)" : "var(--text-secondary)"};
                    padding: 12px 24px;
                    transition: all 0.2s ease;
                  "
                  @click=${() => switchAddMode("code-import")}
                >
                  💡 通过示例代码导入
                </button>
                <button
                  class="btn"
                  style="
                    flex: 1;
                    border-radius: 0;
                    border: none;
                    border-bottom: 3px solid ${addMode === "manual" ? "#ff5c5c" : "transparent"};
                    background: ${addMode === "manual" ? "var(--bg-elevated)" : "transparent"};
                    font-weight: ${addMode === "manual" ? "600" : "400"};
                    color: ${addMode === "manual" ? "var(--text-primary)" : "var(--text-secondary)"};
                    padding: 12px 24px;
                    transition: all 0.2s ease;
                  "
                  @click=${() => switchAddMode("manual")}
                >
                  ✏️ 手动输入
                </button>
              </div>
            </div>
          `
              : nothing
          }
          
          <!-- 代码导入模式 -->
          ${
            !isEditing && addMode === "code-import"
              ? html`
            ${importStep === "input" ? renderCodeImportStep1() : renderCodeImportStep2()}
          `
              : nothing
          }
          
          <!-- 手动输入模式或编辑模式 -->
          ${
            isEditing || addMode === "manual"
              ? html`
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
          `
              : nothing
          }
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

// ============ OAuth重认证流程弹窗 ============

export function renderOAuthReauthModal(props: ModelsProps) {
  const reauth = (props as any).oauthReauth;
  console.log('[renderOAuthReauthModal] Called with oauthReauth:', reauth);
  if (!reauth) {
    console.log('[renderOAuthReauthModal] No reauth data, returning nothing');
    return nothing;
  }

  const { authId, provider, deviceCode, userCode, verificationUrl, isPolling, error } = reauth;
  console.log('[renderOAuthReauthModal] Rendering modal with:', { authId, provider, userCode, verificationUrl });

  return html`
    <div class="modal-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;" @click=${() => (props as any).onCancelOAuthReauth?.()}>
      <div class="modal-content" style="position: relative; background: var(--bg-primary); border-radius: 12px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>🔐 OAuth 重新认证 - ${provider}</h2>
          <button class="btn-icon" @click=${() => (props as any).onCancelOAuthReauth?.()}>&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 32px; text-align: center;">
          ${error ? html`
            <div style="padding: 16px; background: rgba(255, 92, 92, 0.1); border-left: 3px solid #ff5c5c; border-radius: 4px; margin-bottom: 24px; text-align: left;">
              <div style="font-weight: 600; color: #ff5c5c; margin-bottom: 4px;">⚠️ 认证失败</div>
              <div style="font-size: 13px; color: var(--text-secondary);">${error}</div>
            </div>
          ` : html`
            <div style="margin-bottom: 24px;">
              <div style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">请打开以下链接授权</div>
              <a 
                href="${verificationUrl}" 
                target="_blank" 
                style="display: inline-block; padding: 12px 24px; background: var(--accent); color: white; border-radius: 6px; text-decoration: none; font-weight: 600; margin-bottom: 16px;"
              >
                🔗 打开授权页面
              </a>
              
              <div style="margin: 24px 0;">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">或者手动输入以下验证码：</div>
                <div style="display: inline-block; padding: 16px 32px; background: var(--bg-elevated); border: 2px solid var(--accent); border-radius: 8px; font-size: 32px; font-weight: 700; letter-spacing: 4px; font-family: monospace; color: var(--accent);">
                  ${userCode}
                </div>
              </div>
              
              ${isPolling ? html`
                <div style="margin-top: 24px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
                  <div style="display: inline-block; width: 16px; height: 16px; border: 2px solid var(--accent); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
                  <span style="color: var(--text-secondary);">等待授权完成...</span>
                </div>
                <style>
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                </style>
              ` : html`
                <button 
                  class="btn btn--primary" 
                  style="margin-top: 24px; background: var(--accent); border-color: var(--accent);"
                  @click=${() => (props as any).onStartOAuthPolling?.(authId)}
                >
                  ✅ 我已授权，开始检查
                </button>
              `}
            </div>
          `}
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${() => (props as any).onCancelOAuthReauth?.()}>
            ${error ? "关闭" : "取消"}
          </button>
        </div>
      </div>
    </div>
  `;
}
