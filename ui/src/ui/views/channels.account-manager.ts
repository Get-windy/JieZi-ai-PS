import { html, nothing } from "lit";
import type { ChannelAccountSnapshot } from "../types.js";
import type { ChannelsProps } from "./channels.types.ts";
import { t } from "../i18n.js";

/**
 * 渲染通道账号管理按钮
 */
export function renderAccountManageButton(params: {
  channelId: string;
  accounts: ChannelAccountSnapshot[];
  props: ChannelsProps;
}) {
  const { channelId, accounts, props } = params;

  // 如果没有配置多账号，不显示管理按钮
  if (accounts.length < 2) {
    return nothing;
  }

  return html`
    <button 
      class="btn btn--sm" 
      style="margin-top: 12px;"
      @click=${() => props.onManageAccounts(channelId)}
    >
      ${t("channels.account.manage_accounts")}
    </button>
  `;
}

/**
 * 渲染账号管理弹窗
 */
export function renderAccountManagerModal(props: ChannelsProps) {
  if (!props.managingChannelId) {
    return nothing;
  }

  const channelId = props.managingChannelId;
  const accounts = props.snapshot?.channelAccounts?.[channelId] ?? [];
  const channelLabel = resolveChannelLabel(channelId);

  return html`
    <div class="modal-overlay" @click=${() => props.onManageAccounts("")}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${channelLabel} - ${t("channels.account.manage_title")}</h2>
          <button class="btn-icon" @click=${() => props.onManageAccounts("")}>&times;</button>
        </div>
        
        <div class="modal-body">
          <div class="row" style="margin-bottom: 16px;">
            <button class="btn btn--primary" @click=${() => props.onAddAccount(channelId)}>
              ${t("channels.account.add_account")}
            </button>
          </div>
          
          ${
            accounts.length === 0
              ? html`<div class="muted">${t("channels.account.no_accounts")}</div>`
              : html`
              <div class="account-list">
                ${accounts.map((account: any) => renderAccountCard({ account, channelId, props }))}
              </div>
            `
          }
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${() => props.onManageAccounts("")}>
            ${t("channels.account.close")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染单个账号卡片
 */
function renderAccountCard(params: {
  account: ChannelAccountSnapshot;
  channelId: string;
  props: ChannelsProps;
}) {
  const { account, channelId, props } = params;
  const accountLabel = account.name || account.accountId;

  return html`
    <div class="card" style="margin-bottom: 12px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">${accountLabel}</div>
          <div class="card-sub mono">${account.accountId}</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button 
            class="btn btn--sm" 
            @click=${() => props.onEditAccount(channelId, account.accountId)}
          >
            ${t("channels.account.edit")}
          </button>
          <button 
            class="btn btn--sm btn--danger" 
            @click=${() => {
              if (confirm(t("channels.account.delete_confirm").replace("{id}", accountLabel))) {
                props.onDeleteAccount(channelId, account.accountId);
              }
            }}
          >
            ${t("channels.account.delete")}
          </button>
        </div>
      </div>
      
      <div class="status-list" style="margin-top: 12px;">
        <div>
          <span class="label">${t("channels.account.status.configured")}</span>
          <span>${account.configured ? t("channels.yes") : t("channels.no")}</span>
        </div>
        <div>
          <span class="label">${t("channels.account.status.running")}</span>
          <span>${account.running ? t("channels.yes") : t("channels.no")}</span>
        </div>
        <div>
          <span class="label">${t("channels.account.status.enabled")}</span>
          <span>${account.enabled ? t("channels.yes") : t("channels.no")}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染账号编辑弹窗
 */
export function renderAccountEditModal(props: ChannelsProps) {
  if (!props.editingChannelAccount) {
    return nothing;
  }

  const { channelId, accountId, name, config } = props.editingChannelAccount;
  const isNew = !accountId;
  const channelLabel = resolveChannelLabel(channelId);
  const idPattern = /^[a-z0-9][a-z0-9-]*$/;
  const isValidId = accountId && idPattern.test(accountId);

  return html`
    <div class="modal-overlay" @click=${props.onCancelAccountEdit}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>
            ${
              isNew
                ? t("channels.account.add_title").replace("{channel}", channelLabel)
                : t("channels.account.edit_title").replace("{channel}", channelLabel)
            }
          </h2>
          <button class="btn-icon" @click=${props.onCancelAccountEdit}>&times;</button>
        </div>
        
        <div class="modal-body">
          <div class="form-group">
            <label>${t("channels.account.field.account_id")}</label>
            <input
              type="text"
              class="form-control"
              .value=${accountId || ""}
              ?disabled=${!isNew}
              placeholder=${t("channels.account.field.account_id_placeholder")}
              @input=${(e: Event) => props.onAccountFormChange("accountId", (e.target as HTMLInputElement).value)}
            />
            <small class="form-text">${t("channels.account.field.account_id_help")}</small>
            ${
              !isValidId && accountId
                ? html`
              <small class="form-text text-danger">${t("channels.account.invalid_id")}</small>
            `
                : nothing
            }
          </div>
          
          <div class="form-group">
            <label>${t("channels.account.field.name")}</label>
            <input
              type="text"
              class="form-control"
              .value=${name || ""}
              placeholder=${t("channels.account.field.name_placeholder")}
              @input=${(e: Event) => props.onAccountFormChange("name", (e.target as HTMLInputElement).value)}
            />
          </div>
          
          ${renderChannelSpecificFields(channelId, config, props)}
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${props.onCancelAccountEdit}>
            ${t("channels.account.cancel")}
          </button>
          <button 
            class="btn btn--primary" 
            ?disabled=${!isValidId || props.creatingChannelAccount}
            @click=${props.onSaveAccount}
          >
            ${props.creatingChannelAccount ? t("channels.account.saving") : t("channels.account.save")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染通道特定的配置字段
 */
function renderChannelSpecificFields(
  channelId: string,
  config: Record<string, unknown>,
  props: ChannelsProps,
) {
  switch (channelId) {
    case "feishu":
      return renderFeishuFields(config, props);
    case "dingtalk":
      return renderDingtalkFields(config, props);
    case "wecom":
      return renderWecomFields(config, props);
    default:
      return nothing;
  }
}

/**
 * 渲染飞书特定字段
 */
function renderFeishuFields(config: Record<string, unknown>, props: ChannelsProps) {
  return html`
    <div class="form-group">
      <label>${t("channels.feishu.field.app_id")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.appId as string) || ""}
        placeholder="cli_xxxxx"
        @input=${(e: Event) => props.onAccountFormChange("config.appId", (e.target as HTMLInputElement).value)}
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.feishu.field.app_secret")}</label>
      <input
        type="password"
        class="form-control"
        .value=${(config.appSecret as string) || ""}
        @input=${(e: Event) => props.onAccountFormChange("config.appSecret", (e.target as HTMLInputElement).value)}
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.feishu.field.domain")}</label>
      <select
        class="form-control"
        .value=${(config.domain as string) || "feishu"}
        @change=${(e: Event) => props.onAccountFormChange("config.domain", (e.target as HTMLSelectElement).value)}
      >
        <option value="feishu">飞书 (feishu.cn)</option>
        <option value="lark">Lark (larksuite.com)</option>
      </select>
    </div>
  `;
}

/**
 * 渲染钉钉特定字段
 */
function renderDingtalkFields(config: Record<string, unknown>, props: ChannelsProps) {
  return html`
    <div class="form-group">
      <label>${t("channels.dingtalk.field.app_key")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.appKey as string) || ""}
        placeholder="dingxxxxx"
        @input=${(e: Event) => props.onAccountFormChange("config.appKey", (e.target as HTMLInputElement).value)}
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.dingtalk.field.app_secret")}</label>
      <input
        type="password"
        class="form-control"
        .value=${(config.appSecret as string) || ""}
        @input=${(e: Event) => props.onAccountFormChange("config.appSecret", (e.target as HTMLInputElement).value)}
      />
    </div>
  `;
}

/**
 * 渲染企业微信特定字段
 */
function renderWecomFields(config: Record<string, unknown>, props: ChannelsProps) {
  return html`
    <div class="form-group">
      <label>${t("channels.wecom.field.corpid")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.corpid as string) || ""}
        @input=${(e: Event) => props.onAccountFormChange("config.corpid", (e.target as HTMLInputElement).value)}
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.wecom.field.corpsecret")}</label>
      <input
        type="password"
        class="form-control"
        .value=${(config.corpsecret as string) || ""}
        @input=${(e: Event) => props.onAccountFormChange("config.corpsecret", (e.target as HTMLInputElement).value)}
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.wecom.field.agentid")}</label>
      <input
        type="number"
        class="form-control"
        .value=${(config.agentid as number) || ""}
        @input=${(e: Event) => props.onAccountFormChange("config.agentid", parseInt((e.target as HTMLInputElement).value, 10))}
      />
    </div>
  `;
}

/**
 * 解析通道显示名称
 */
function resolveChannelLabel(channelId: string): string {
  const labels: Record<string, string> = {
    feishu: t("channel.feishu.title"),
    dingtalk: t("channel.dingtalk.title"),
    wecom: t("channel.wecom.title"),
    telegram: t("channel.telegram.title"),
    discord: t("channel.discord.title"),
    slack: t("channel.slack.title"),
    signal: t("channel.signal.title"),
    whatsapp: t("channel.whatsapp.title"),
  };
  return labels[channelId] || channelId;
}
