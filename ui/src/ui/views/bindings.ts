import { html, nothing } from "lit";
import type { AgentsListResult } from "../types.js";
import { t } from "../i18n.js";

export type BindingEntry = {
  id: string;
  agentId: string;
  match: {
    channel?: string;
    accountId?: string;
    peer?: {
      kind?: "dm" | "group" | "channel";
      id?: string;
    };
    guildId?: string;
    teamId?: string;
  };
};

export type BindingsProps = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  bindings: BindingEntry[];
  agentsList: AgentsListResult | null;
  editingId: string | null;
  editForm: Partial<BindingEntry> | null;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onFormChange: (field: string, value: unknown) => void;
  onRefresh: () => void;
};

const CHANNEL_OPTIONS = [
  { id: "telegram", label: "Telegram" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
  { id: "signal", label: "Signal" },
  { id: "feishu", label: "飞书 (Feishu)" },
  { id: "dingtalk", label: "钉钉 (DingTalk)" },
  { id: "wecom", label: "企业微信 (WeCom)" },
  { id: "googlechat", label: "Google Chat" },
  { id: "imessage", label: "iMessage" },
  { id: "line", label: "LINE" },
  { id: "matrix", label: "Matrix" },
  { id: "msteams", label: "Microsoft Teams" },
  { id: "nostr", label: "Nostr" },
];

const PEER_KIND_OPTIONS = [
  { id: "dm", label: () => t("bindings.peer_kind.dm") },
  { id: "group", label: () => t("bindings.peer_kind.group") },
  { id: "channel", label: () => t("bindings.peer_kind.channel") },
];

function renderBindingCard(
  binding: BindingEntry,
  agentName: string,
  onEdit: () => void,
  onDelete: () => void,
) {
  const { match } = binding;
  const conditions: string[] = [];

  if (match.channel) {
    const channelLabel =
      CHANNEL_OPTIONS.find((c) => c.id === match.channel)?.label || match.channel;
    conditions.push(`${t("bindings.channel")}: ${channelLabel}`);
  }

  if (match.accountId) {
    conditions.push(`${t("bindings.account_id")}: ${match.accountId}`);
  }

  if (match.peer) {
    if (match.peer.kind) {
      const kindLabel =
        PEER_KIND_OPTIONS.find((k) => k.id === match.peer?.kind)?.label() || match.peer.kind;
      conditions.push(`${t("bindings.peer_kind_label")}: ${kindLabel}`);
    }
    if (match.peer.id) {
      conditions.push(`${t("bindings.peer_id")}: ${match.peer.id}`);
    }
  }

  if (match.guildId) {
    conditions.push(`${t("bindings.guild_id")}: ${match.guildId}`);
  }

  if (match.teamId) {
    conditions.push(`${t("bindings.team_id")}: ${match.teamId}`);
  }

  return html`
    <div class="binding-card">
      <div class="binding-header">
        <div class="binding-agent">
          <span class="agent-icon">🤖</span>
          <span class="agent-name">${agentName}</span>
        </div>
        <div class="binding-actions">
          <button class="btn-icon" @click=${onEdit} title=${t("bindings.edit")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
            </svg>
          </button>
          <button class="btn-icon btn-danger" @click=${onDelete} title=${t("bindings.delete")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="binding-conditions">
        ${
          conditions.length > 0
            ? html`
              <div class="condition-list">
                ${conditions.map(
                  (condition) => html`<div class="condition-item">${condition}</div>`,
                )}
              </div>
            `
            : html`<div class="condition-empty">${t("bindings.no_conditions")}</div>`
        }
      </div>
    </div>
  `;
}

function renderEditForm(props: BindingsProps) {
  const { editForm, agentsList, onFormChange, onSave, onCancel } = props;
  if (!editForm) return nothing;

  const agents = agentsList?.agents || [];
  const isNew = !editForm.id;

  return html`
    <div class="binding-edit-overlay" @click=${(e: Event) => e.target === e.currentTarget && onCancel()}>
      <div class="binding-edit-dialog">
        <div class="dialog-header">
          <h2>${isNew ? t("bindings.add_binding") : t("bindings.edit_binding")}</h2>
          <button class="btn-icon" @click=${onCancel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <div class="form-group">
            <label>${t("bindings.agent")}</label>
            <select
              .value=${editForm.agentId || ""}
              @change=${(e: Event) => onFormChange("agentId", (e.target as HTMLSelectElement).value)}
            >
              <option value="">${t("bindings.select_agent")}</option>
              ${agents.map(
                (agent) => html`<option value=${agent.id}>${agent.name || agent.id}</option>`,
              )}
            </select>
          </div>

          <div class="form-group">
            <label>${t("bindings.channel")}</label>
            <select
              .value=${editForm.match?.channel || ""}
              @change=${(e: Event) => onFormChange("match.channel", (e.target as HTMLSelectElement).value)}
            >
              <option value="">${t("bindings.select_channel")}</option>
              ${CHANNEL_OPTIONS.map(
                (channel) => html`<option value=${channel.id}>${channel.label}</option>`,
              )}
            </select>
          </div>

          <div class="form-group">
            <label>${t("bindings.account_id")} <span class="optional">(${t("bindings.optional")})</span></label>
            <input
              type="text"
              .value=${editForm.match?.accountId || ""}
              @input=${(e: Event) => onFormChange("match.accountId", (e.target as HTMLInputElement).value)}
              placeholder="default"
            />
          </div>

          <div class="form-section">
            <h3>${t("bindings.peer_match")} <span class="optional">(${t("bindings.optional")})</span></h3>
            
            <div class="form-group">
              <label>${t("bindings.peer_kind_label")}</label>
              <select
                .value=${editForm.match?.peer?.kind || ""}
                @change=${(e: Event) => onFormChange("match.peer.kind", (e.target as HTMLSelectElement).value)}
              >
                <option value="">${t("bindings.any")}</option>
                ${PEER_KIND_OPTIONS.map(
                  (kind) => html`<option value=${kind.id}>${kind.label()}</option>`,
                )}
              </select>
            </div>

            <div class="form-group">
              <label>${t("bindings.peer_id")}</label>
              <input
                type="text"
                .value=${editForm.match?.peer?.id || ""}
                @input=${(e: Event) => onFormChange("match.peer.id", (e.target as HTMLInputElement).value)}
                placeholder=${t("bindings.peer_id_placeholder")}
              />
            </div>
          </div>

          <div class="form-group">
            <label>${t("bindings.guild_id")} <span class="optional">(Discord ${t("bindings.only")})</span></label>
            <input
              type="text"
              .value=${editForm.match?.guildId || ""}
              @input=${(e: Event) => onFormChange("match.guildId", (e.target as HTMLInputElement).value)}
              placeholder="123456789"
            />
          </div>

          <div class="form-group">
            <label>${t("bindings.team_id")} <span class="optional">(Slack ${t("bindings.only")})</span></label>
            <input
              type="text"
              .value=${editForm.match?.teamId || ""}
              @input=${(e: Event) => onFormChange("match.teamId", (e.target as HTMLInputElement).value)}
              placeholder="T123456"
            />
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-secondary" @click=${onCancel}>
            ${t("bindings.cancel")}
          </button>
          <button 
            class="btn btn-primary" 
            @click=${onSave}
            ?disabled=${!editForm.agentId || !editForm.match?.channel}
          >
            ${t("bindings.save")}
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderBindings(props: BindingsProps) {
  const {
    loading,
    saving,
    error,
    bindings,
    agentsList,
    editingId,
    onAdd,
    onEdit,
    onDelete,
    onRefresh,
  } = props;

  const agents = agentsList?.agents || [];
  const agentMap = new Map(agents.map((a) => [a.id, a.name || a.id]));

  return html`
    <div class="bindings-view">
      <div class="view-header">
        <div class="header-title">
          <h1>${t("bindings.title")}</h1>
          <p class="subtitle">${t("bindings.subtitle")}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click=${onRefresh} ?disabled=${loading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            ${t("bindings.refresh")}
          </button>
          <button class="btn btn-primary" @click=${onAdd}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            ${t("bindings.add")}
          </button>
        </div>
      </div>

      ${error ? html`<div class="error-banner">${error}</div>` : nothing}

      ${
        loading
          ? html`<div class="loading-spinner">${t("bindings.loading")}</div>`
          : bindings.length === 0
            ? html`
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
              <h2>${t("bindings.empty_title")}</h2>
              <p>${t("bindings.empty_description")}</p>
              <button class="btn btn-primary" @click=${onAdd}>
                ${t("bindings.add_first")}
              </button>
            </div>
          `
            : html`
            <div class="bindings-list">
              ${bindings.map((binding) =>
                renderBindingCard(
                  binding,
                  agentMap.get(binding.agentId) || binding.agentId,
                  () => onEdit(binding.id),
                  () => onDelete(binding.id),
                ),
              )}
            </div>
          `
      }

      ${editingId !== null || props.editForm ? renderEditForm(props) : nothing}

      ${saving ? html`<div class="saving-overlay">${t("bindings.saving")}</div>` : nothing}
    </div>

    <style>
      .bindings-view {
        padding: 2rem;
        max-width: 1200px;
        margin: 0 auto;
      }

      .view-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 2rem;
      }

      .header-title h1 {
        margin: 0 0 0.5rem 0;
        font-size: 1.75rem;
        font-weight: 600;
      }

      .subtitle {
        margin: 0;
        color: var(--color-text-secondary);
        font-size: 0.95rem;
      }

      .header-actions {
        display: flex;
        gap: 0.75rem;
      }

      .bindings-list {
        display: grid;
        gap: 1rem;
      }

      .binding-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 1.25rem;
        transition: box-shadow 0.2s;
      }

      .binding-card:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .binding-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }

      .binding-agent {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .agent-icon {
        font-size: 1.5rem;
      }

      .agent-name {
        font-weight: 600;
        font-size: 1.1rem;
      }

      .binding-actions {
        display: flex;
        gap: 0.5rem;
      }

      .condition-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .condition-item {
        background: var(--color-primary-alpha);
        color: var(--color-primary);
        padding: 0.35rem 0.75rem;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 500;
      }

      .condition-empty {
        color: var(--color-text-secondary);
        font-style: italic;
      }

      .empty-state {
        text-align: center;
        padding: 4rem 2rem;
      }

      .empty-state svg {
        width: 64px;
        height: 64px;
        color: var(--color-text-secondary);
        margin-bottom: 1rem;
      }

      .empty-state h2 {
        margin: 0 0 0.5rem 0;
        font-size: 1.5rem;
      }

      .empty-state p {
        margin: 0 0 1.5rem 0;
        color: var(--color-text-secondary);
      }

      .binding-edit-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .binding-edit-dialog {
        background: var(--color-background);
        border-radius: 12px;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      }

      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border);
      }

      .dialog-header h2 {
        margin: 0;
        font-size: 1.25rem;
      }

      .dialog-body {
        padding: 1.5rem;
        overflow-y: auto;
      }

      .form-group {
        margin-bottom: 1.25rem;
      }

      .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        font-size: 0.9rem;
      }

      .optional {
        font-weight: normal;
        color: var(--color-text-secondary);
        font-size: 0.85rem;
      }

      .form-group input,
      .form-group select {
        width: 100%;
        padding: 0.65rem;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        font-size: 0.95rem;
        background: var(--color-surface);
      }

      .form-section {
        margin: 1.5rem 0;
        padding: 1rem;
        background: var(--color-surface);
        border-radius: 6px;
      }

      .form-section h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
      }

      .dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        padding: 1.5rem;
        border-top: 1px solid var(--color-border);
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1.2rem;
        border: none;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn svg {
        width: 18px;
        height: 18px;
      }

      .btn-primary {
        background: var(--color-primary);
        color: white;
      }

      .btn-primary:hover:not(:disabled) {
        background: var(--color-primary-hover);
      }

      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-secondary {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
      }

      .btn-secondary:hover {
        background: var(--color-hover);
      }

      .btn-icon {
        padding: 0.4rem;
        background: transparent;
        border: none;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .btn-icon svg {
        width: 18px;
        height: 18px;
      }

      .btn-icon:hover {
        background: var(--color-hover);
      }

      .btn-danger:hover {
        background: var(--color-danger-alpha);
        color: var(--color-danger);
      }

      .error-banner {
        background: var(--color-danger-alpha);
        color: var(--color-danger);
        padding: 1rem;
        border-radius: 6px;
        margin-bottom: 1rem;
      }

      .loading-spinner,
      .saving-overlay {
        text-align: center;
        padding: 2rem;
        color: var(--color-text-secondary);
      }
    </style>
  `;
}
