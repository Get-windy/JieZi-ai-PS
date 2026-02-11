import { html, nothing } from "lit";

/**
 * 渲染模型账号配置对话框
 */
export function renderModelAccountConfigDialog(params: {
  accountId: string | null;
  currentConfig: any;
  onSave: (accountId: string, config: any) => void;
  onCancel: () => void;
}) {
  if (!params.accountId) {
    return nothing;
  }

  const config = params.currentConfig || {};
  const enabled = config.enabled !== false;
  const priority = config.priority ?? 0;

  // 定时配置
  const scheduleEnabled = !!config.schedule?.enabled;
  const scheduleStartHour = config.schedule?.startHour ?? 0;
  const scheduleEndHour = config.schedule?.endHour ?? 24;

  // 用量限制
  const usageLimitEnabled = !!config.usageLimit?.enabled;
  const dailyLimit = config.usageLimit?.daily ?? 0;
  const monthlyLimit = config.usageLimit?.monthly ?? 0;

  // 健康检查
  const healthCheckEnabled = !!config.healthCheck?.enabled;
  const healthCheckInterval = config.healthCheck?.intervalSeconds ?? 300;

  // 状态管理（使用局部变量，实际应该使用状态管理）
  let formData = {
    enabled,
    priority,
    scheduleEnabled,
    scheduleStartHour,
    scheduleEndHour,
    usageLimitEnabled,
    dailyLimit,
    monthlyLimit,
    healthCheckEnabled,
    healthCheckInterval,
  };

  const handleSave = () => {
    const newConfig: any = {
      enabled: formData.enabled,
      priority: formData.priority,
    };

    if (formData.scheduleEnabled) {
      newConfig.schedule = {
        enabled: true,
        startHour: formData.scheduleStartHour,
        endHour: formData.scheduleEndHour,
      };
    }

    if (formData.usageLimitEnabled) {
      newConfig.usageLimit = {
        enabled: true,
        daily: formData.dailyLimit,
        monthly: formData.monthlyLimit,
      };
    }

    if (formData.healthCheckEnabled) {
      newConfig.healthCheck = {
        enabled: true,
        intervalSeconds: formData.healthCheckInterval,
      };
    }

    params.onSave(params.accountId!, newConfig);
  };

  return html`
    <div class="modal-overlay" @click=${params.onCancel}>
      <div
        class="modal-dialog"
        style="max-width: 600px; max-height: 80vh; overflow-y: auto; background: var(--bg); border: 1px solid var(--border);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="modal-header">
          <h3 class="modal-title">模型账号配置</h3>
          <button class="modal-close" @click=${params.onCancel}>&times;</button>
        </div>

        <div class="modal-body">
          <!-- 账号信息 -->
          <div style="margin-bottom: 20px;">
            <div class="label">模型账号</div>
            <div class="mono" style="font-size: 1rem; color: var(--text-2); margin-top: 4px;">
              ${params.accountId}
            </div>
          </div>

          <!-- 基本配置 -->
          <div style="margin-bottom: 24px;">
            <h4 style="margin-bottom: 12px;">基本配置</h4>

            <!-- 启用/禁用 -->
            <div style="margin-bottom: 16px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input
                  type="checkbox"
                  ?checked=${formData.enabled}
                  @change=${(e: Event) => {
                    formData.enabled = (e.target as HTMLInputElement).checked;
                    e.target?.dispatchEvent(
                      new CustomEvent("update", { bubbles: true, composed: true }),
                    );
                  }}
                />
                <span>启用此模型账号</span>
              </label>
              <div class="muted" style="margin-top: 4px; font-size: 0.875rem;">
                禁用后将不会使用此模型账号
              </div>
            </div>

            <!-- 优先级 -->
            <div style="margin-bottom: 16px;">
              <label class="form-label">优先级</label>
              <input
                type="number"
                class="form-control"
                min="0"
                max="100"
                .value=${String(formData.priority)}
                @input=${(e: Event) => {
                  formData.priority = parseInt((e.target as HTMLInputElement).value) || 0;
                }}
                style="max-width: 150px;"
              />
              <div class="muted" style="margin-top: 4px; font-size: 0.875rem;">
                数值越大优先级越高（0-100）
              </div>
            </div>
          </div>

          <!-- 定时配置 -->
          <div style="margin-bottom: 24px;">
            <h4 style="margin-bottom: 12px;">定时配置</h4>

            <div style="margin-bottom: 16px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input
                  type="checkbox"
                  ?checked=${formData.scheduleEnabled}
                  @change=${(e: Event) => {
                    formData.scheduleEnabled = (e.target as HTMLInputElement).checked;
                  }}
                />
                <span>启用定时控制</span>
              </label>
              <div class="muted" style="margin-top: 4px; font-size: 0.875rem;">
                在指定时间段内自动启用/停用
              </div>
            </div>

            ${
              formData.scheduleEnabled
                ? html`
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label">开始时间（小时）</label>
                        <input
                          type="number"
                          class="form-control"
                          min="0"
                          max="23"
                          .value=${String(formData.scheduleStartHour)}
                          @input=${(e: Event) => {
                            formData.scheduleStartHour =
                              parseInt((e.target as HTMLInputElement).value) || 0;
                          }}
                        />
                      </div>
                      <div>
                        <label class="form-label">结束时间（小时）</label>
                        <input
                          type="number"
                          class="form-control"
                          min="0"
                          max="24"
                          .value=${String(formData.scheduleEndHour)}
                          @input=${(e: Event) => {
                            formData.scheduleEndHour =
                              parseInt((e.target as HTMLInputElement).value) || 24;
                          }}
                        />
                      </div>
                    </div>
                  `
                : nothing
            }
          </div>

          <!-- 用量限制 -->
          <div style="margin-bottom: 24px;">
            <h4 style="margin-bottom: 12px;">用量限制</h4>

            <div style="margin-bottom: 16px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input
                  type="checkbox"
                  ?checked=${formData.usageLimitEnabled}
                  @change=${(e: Event) => {
                    formData.usageLimitEnabled = (e.target as HTMLInputElement).checked;
                  }}
                />
                <span>启用用量控制</span>
              </label>
              <div class="muted" style="margin-top: 4px; font-size: 0.875rem;">
                达到限额后自动停用
              </div>
            </div>

            ${
              formData.usageLimitEnabled
                ? html`
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label">每日限额（token数）</label>
                        <input
                          type="number"
                          class="form-control"
                          min="0"
                          .value=${String(formData.dailyLimit)}
                          @input=${(e: Event) => {
                            formData.dailyLimit =
                              parseInt((e.target as HTMLInputElement).value) || 0;
                          }}
                        />
                      </div>
                      <div>
                        <label class="form-label">每月限额（token数）</label>
                        <input
                          type="number"
                          class="form-control"
                          min="0"
                          .value=${String(formData.monthlyLimit)}
                          @input=${(e: Event) => {
                            formData.monthlyLimit =
                              parseInt((e.target as HTMLInputElement).value) || 0;
                          }}
                        />
                      </div>
                    </div>
                  `
                : nothing
            }
          </div>

          <!-- 健康检查 -->
          <div style="margin-bottom: 24px;">
            <h4 style="margin-bottom: 12px;">健康检查</h4>

            <div style="margin-bottom: 16px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input
                  type="checkbox"
                  ?checked=${formData.healthCheckEnabled}
                  @change=${(e: Event) => {
                    formData.healthCheckEnabled = (e.target as HTMLInputElement).checked;
                  }}
                />
                <span>启用健康检查</span>
              </label>
              <div class="muted" style="margin-top: 4px; font-size: 0.875rem;">
                定期检查模型可用性
              </div>
            </div>

            ${
              formData.healthCheckEnabled
                ? html`
                    <div>
                      <label class="form-label">检查间隔（秒）</label>
                      <input
                        type="number"
                        class="form-control"
                        min="60"
                        .value=${String(formData.healthCheckInterval)}
                        @input=${(e: Event) => {
                          formData.healthCheckInterval =
                            parseInt((e.target as HTMLInputElement).value) || 300;
                        }}
                        style="max-width: 150px;"
                      />
                    </div>
                  `
                : nothing
            }
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn" @click=${params.onCancel}>取消</button>
          <button class="btn btn--primary" @click=${handleSave}>保存</button>
        </div>
      </div>
    </div>
  `;
}
