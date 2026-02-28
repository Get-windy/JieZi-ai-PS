/**
 * Phase 3 - Channel Policy Bindings Management UI
 * 通道策略绑定管理界面
 * 
 * 功能：
 * - 查看和管理智能助手的通道绑定
 * - 配置每个绑定的策略（Private/Monitor/LoadBalance等）
 * - 启用/禁用绑定
 * - 调整绑定优先级
 */

import { html, nothing, type TemplateResult } from "lit";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 通道账号绑定
 */
export type ChannelAccountBinding = {
  id: string;
  channelId: string;
  accountId: string;
  policy: {
    type: string;
    config: any;
  };
  enabled?: boolean;
  priority?: number;
  description?: string;
};

/**
 * 组件属性
 */
export type ChannelPolicyBindingsProps = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  
  // 智能助手
  selectedAgentId: string;
  agents: Array<{ id: string; name: string }>;
  
  // 绑定数据
  bindings: ChannelAccountBinding[];
  
  // 编辑状态
  editingBinding: ChannelAccountBinding | null;
  showAddDialog: boolean;
  
  // 回调函数
  onAgentChange: (agentId: string) => void;
  onRefresh: () => void;
  onAddBinding: () => void;
  onEditBinding: (binding: ChannelAccountBinding) => void;
  onToggleBinding: (binding: ChannelAccountBinding) => void;
  onDeleteBinding: (binding: ChannelAccountBinding) => void;
  onSaveBinding: () => void;
  onCancelEdit: () => void;
  onBindingFieldChange: (field: string, value: any) => void;
};

/**
 * 策略类型选项
 */
const POLICY_TYPES = [
  { id: "private", label: "Private - 私密通道", description: "只有授权用户可访问" },
  { id: "monitor", label: "Monitor - 监控通道", description: "只读监控，不回复" },
  { id: "listen-only", label: "Listen Only - 只监听", description: "记录消息，不响应" },
  { id: "load-balance", label: "Load Balance - 负载均衡", description: "多账号轮流处理" },
  { id: "queue", label: "Queue - 队列模式", description: "消息排队批量处理" },
  { id: "moderate", label: "Moderate - 审核模式", description: "消息需审核后发送" },
  { id: "echo", label: "Echo - 回声模式", description: "仅记录日志" },
  { id: "filter", label: "Filter - 过滤模式", description: "基于规则过滤消息" },
  { id: "scheduled", label: "Scheduled - 定时模式", description: "根据时间表响应" },
  { id: "forward", label: "Forward - 转发模式", description: "自动转发到其他通道" },
  { id: "broadcast", label: "Broadcast - 广播模式", description: "发送到多个通道" },
  { id: "smart-route", label: "Smart Route - 智能路由", description: "根据内容智能选择" },
];

/**
 * 通道类型选项
 */
const CHANNEL_TYPES = [
  { id: "telegram", label: "Telegram" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
  { id: "signal", label: "Signal" },
  { id: "feishu", label: "飞书" },
  { id: "dingtalk", label: "钉钉" },
  { id: "wecom", label: "企业微信" },
];

// ============================================================================
// 渲染函数
// ============================================================================

/**
 * 渲染绑定卡片
 */
function renderBindingCard(
  binding: ChannelAccountBinding,
  onEdit: () => void,
  onToggle: () => void,
  onDelete: () => void,
): TemplateResult {
  const policyInfo = POLICY_TYPES.find((p) => p.id === binding.policy.type);
  const channelInfo = CHANNEL_TYPES.find((c) => c.id === binding.channelId);

  return html`
    <div class="binding-card ${binding.enabled ? "" : "disabled"}">
      <div class="binding-header">
        <div class="binding-info">
          <div class="binding-title">${channelInfo?.label || binding.channelId}</div>
          <div class="binding-subtitle">账号: ${binding.accountId}</div>
          <span class="binding-badge ${binding.enabled ? "badge-enabled" : "badge-disabled"}">
            ${binding.enabled ? "已启用" : "已禁用"}
          </span>
        </div>
        <div class="binding-actions">
          <button
            class="btn-icon"
            @click=${onToggle}
            title=${binding.enabled ? "禁用" : "启用"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${
                binding.enabled
                  ? html`<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line>`
                  : html`<circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line>`
              }
            </svg>
          </button>
          <button class="btn-icon" @click=${onEdit} title="编辑">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
            </svg>
          </button>
          <button class="btn-icon" @click=${onDelete} title="删除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="binding-details">
        <div class="detail-row">
          <span class="detail-label">策略类型</span>
          <span class="policy-badge">${policyInfo?.label || binding.policy.type}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">优先级</span>
          <span class="detail-value">${binding.priority || "-"}</span>
        </div>
        ${
          binding.description
            ? html`
              <div class="detail-row">
                <span class="detail-label">描述</span>
                <span class="detail-value">${binding.description}</span>
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

/**
 * 渲染编辑对话框
 */
function renderEditDialog(props: ChannelPolicyBindingsProps): TemplateResult | typeof nothing {
  if (!props.showAddDialog || !props.editingBinding) return nothing;

  const isNew = !props.editingBinding.id;
  const { editingBinding, onBindingFieldChange, onSaveBinding, onCancelEdit } = props;

  return html`
    <div class="dialog-overlay" @click=${(e: Event) => e.target === e.currentTarget && onCancelEdit()}>
      <div class="dialog">
        <div class="dialog-header">
          <h2 class="dialog-title">${isNew ? "添加通道绑定" : "编辑通道绑定"}</h2>
          <button class="btn-icon" @click=${onCancelEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>通道类型 *</label>
            <select
              .value=${editingBinding.channelId}
              @change=${(e: Event) =>
                onBindingFieldChange("channelId", (e.target as HTMLSelectElement).value)}
            >
              <option value="">请选择通道</option>
              ${CHANNEL_TYPES.map(
                (channel) => html`<option value=${channel.id}>${channel.label}</option>`,
              )}
            </select>
          </div>

          <div class="form-group">
            <label>账号 ID *</label>
            <input
              type="text"
              .value=${editingBinding.accountId}
              @input=${(e: Event) =>
                onBindingFieldChange("accountId", (e.target as HTMLInputElement).value)}
              placeholder="default"
            />
            <div class="form-help">通道账号的唯一标识</div>
          </div>

          <div class="form-group">
            <label>策略类型 *</label>
            <select
              .value=${editingBinding.policy.type}
              @change=${(e: Event) =>
                onBindingFieldChange("policy.type", (e.target as HTMLSelectElement).value)}
            >
              ${POLICY_TYPES.map(
                (policy) =>
                  html`<option value=${policy.id} title=${policy.description}>
                    ${policy.label}
                  </option>`,
              )}
            </select>
            <div class="form-help">
              ${POLICY_TYPES.find((p) => p.id === editingBinding.policy.type)?.description}
            </div>
          </div>

          <div class="form-group">
            <label>优先级</label>
            <input
              type="number"
              .value=${String(editingBinding.priority || 5)}
              @input=${(e: Event) =>
                onBindingFieldChange("priority", parseInt((e.target as HTMLInputElement).value))}
              min="0"
              max="100"
            />
            <div class="form-help">数字越大优先级越高（0-100）</div>
          </div>

          <div class="form-group">
            <label>描述</label>
            <textarea
              .value=${editingBinding.description || ""}
              @input=${(e: Event) =>
                onBindingFieldChange("description", (e.target as HTMLTextAreaElement).value)}
              placeholder="简要描述此绑定的用途"
            ></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" @click=${onCancelEdit}>取消</button>
          <button class="btn btn-primary" @click=${onSaveBinding} ?disabled=${props.saving}>
            ${isNew ? "添加" : "保存"}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 主渲染函数
 */
export function renderChannelPolicyBindings(props: ChannelPolicyBindingsProps): TemplateResult {
  const {
    loading,
    selectedAgentId,
    agents,
    bindings,
    onAgentChange,
    onRefresh,
    onAddBinding,
    onEditBinding,
    onToggleBinding,
    onDeleteBinding,
  } = props;

  return html`
    <style>
      .channel-policy-bindings {
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
        color: #1a1a1a;
      }

      .header-actions {
        display: flex;
        gap: 12px;
      }

      .agent-selector {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
        padding: 16px;
        background: #f8f9fa;
        border-radius: 8px;
      }

      .agent-selector label {
        font-weight: 500;
        color: #495057;
      }

      .agent-selector select {
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 6px;
        font-size: 14px;
        min-width: 200px;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-primary {
        background: #0d6efd;
        color: white;
      }

      .btn-primary:hover:not(:disabled) {
        background: #0b5ed7;
      }

      .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .btn-secondary {
        background: #6c757d;
        color: white;
      }

      .bindings-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      }

      .binding-card {
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 16px;
        transition: box-shadow 0.2s;
      }

      .binding-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .binding-card.disabled {
        opacity: 0.6;
        background: #f8f9fa;
      }

      .binding-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }

      .binding-info {
        flex: 1;
      }

      .binding-title {
        font-weight: 600;
        font-size: 16px;
        color: #212529;
        margin-bottom: 4px;
      }

      .binding-subtitle {
        font-size: 13px;
        color: #6c757d;
      }

      .binding-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        margin-top: 4px;
      }

      .badge-enabled {
        background: #d1e7dd;
        color: #0f5132;
      }

      .badge-disabled {
        background: #f8d7da;
        color: #842029;
      }

      .binding-actions {
        display: flex;
        gap: 8px;
      }

      .btn-icon {
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6c757d;
        transition: all 0.2s;
      }

      .btn-icon:hover {
        background: #f8f9fa;
        color: #212529;
      }

      .btn-icon svg {
        width: 18px;
        height: 18px;
      }

      .binding-details {
        padding-top: 12px;
        border-top: 1px solid #e9ecef;
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 14px;
      }

      .detail-label {
        color: #6c757d;
        font-weight: 500;
      }

      .detail-value {
        color: #212529;
      }

      .policy-badge {
        display: inline-block;
        padding: 4px 12px;
        background: #e7f3ff;
        color: #0056b3;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 500;
      }

      .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #6c757d;
      }

      .empty-state-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }

      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .dialog {
        background: white;
        border-radius: 12px;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .dialog-header {
        padding: 20px 24px;
        border-bottom: 1px solid #dee2e6;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .dialog-title {
        font-size: 20px;
        font-weight: 600;
        margin: 0;
      }

      .dialog-body {
        padding: 24px;
        overflow-y: auto;
      }

      .dialog-footer {
        padding: 16px 24px;
        border-top: 1px solid #dee2e6;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      .form-group {
        margin-bottom: 20px;
      }

      .form-group label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        color: #495057;
      }

      .form-group input,
      .form-group select,
      .form-group textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ced4da;
        border-radius: 6px;
        font-size: 14px;
        font-family: inherit;
      }

      .form-group textarea {
        resize: vertical;
        min-height: 80px;
      }

      .form-help {
        font-size: 13px;
        color: #6c757d;
        margin-top: 4px;
      }

      .loading {
        text-align: center;
        padding: 40px;
        color: #6c757d;
      }
    </style>

    <div class="channel-policy-bindings">
      <div class="header">
        <h1>通道策略绑定管理</h1>
        <div class="header-actions">
          <button
            class="btn btn-primary"
            @click=${onAddBinding}
            ?disabled=${!selectedAgentId}
          >
            ➕ 添加绑定
          </button>
        </div>
      </div>

      <div class="agent-selector">
        <label>选择智能助手：</label>
        <select @change=${(e: Event) => onAgentChange((e.target as HTMLSelectElement).value)} .value=${selectedAgentId}>
          <option value="">请选择智能助手</option>
          ${agents.map(
            (agent) => html`<option value=${agent.id}>${agent.name || agent.id}</option>`,
          )}
        </select>
      </div>

      ${
        loading
          ? html`<div class="loading">加载中...</div>`
          : selectedAgentId
            ? bindings.length > 0
              ? html`
                <div class="bindings-grid">
                  ${bindings.map((binding) =>
                    renderBindingCard(
                      binding,
                      () => onEditBinding(binding),
                      () => onToggleBinding(binding),
                      () => onDeleteBinding(binding),
                    ),
                  )}
                </div>
              `
              : html`
                <div class="empty-state">
                  <div class="empty-state-icon">📭</div>
                  <p>该智能助手还没有配置通道绑定</p>
                  <p>点击"添加绑定"按钮开始配置</p>
                </div>
              `
            : html`
              <div class="empty-state">
                <div class="empty-state-icon">🤖</div>
                <p>请先选择一个智能助手</p>
              </div>
            `
      }

      ${renderEditDialog(props)}
    </div>
  `;
}
