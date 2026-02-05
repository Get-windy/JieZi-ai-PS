import { html, nothing } from "lit";
import type { ChannelAccountSnapshot } from "../types.js";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";

/**
 * 获取通道状态
 */
function getChannelStatus(channelId: string, props: ChannelsProps): any {
  const channels = props.snapshot?.channels as Record<string, unknown> | null;
  return channels?.[channelId];
}

/**
 * 在弹窗中渲染通道状态信息
 */
function renderChannelStatusInModal(channelStatus: any) {
  if (!channelStatus) {
    return nothing;
  }

  return html`
    <div class="status-list" style="margin-top: 12px;">
      <div>
        <span class="label">${t("channel.label.configured")}</span>
        <span>${channelStatus.configured ? t("channel.yes") : t("channel.no")}</span>
      </div>
      <div>
        <span class="label">${t("channel.label.running")}</span>
        <span>${channelStatus.running ? t("channel.yes") : t("channel.no")}</span>
      </div>
      ${
        channelStatus.connected !== undefined
          ? html`
        <div>
          <span class="label">${t("channel.label.connected")}</span>
          <span>${channelStatus.connected ? t("channel.yes") : t("channel.no")}</span>
        </div>
      `
          : nothing
      }
      ${
        channelStatus.lastStartAt
          ? html`
        <div>
          <span class="label">${t("channel.label.last_start")}</span>
          <span>${formatAgo(channelStatus.lastStartAt)}</span>
        </div>
      `
          : nothing
      }
      ${
        channelStatus.lastProbeAt
          ? html`
        <div>
          <span class="label">${t("channel.label.last_probe")}</span>
          <span>${formatAgo(channelStatus.lastProbeAt)}</span>
        </div>
      `
          : nothing
      }
    </div>
    
    ${
      channelStatus.lastError
        ? html`
      <div class="callout danger" style="margin-top: 12px;">
        ${channelStatus.lastError}
      </div>
    `
        : nothing
    }
    
    ${
      channelStatus.probe
        ? html`
      <div class="callout" style="margin-top: 12px;">
        ${channelStatus.probe.ok ? t("channel.probe.ok") : t("channel.probe.failed")}
        ${channelStatus.probe.status ? ` · ${channelStatus.probe.status}` : ""}
        ${channelStatus.probe.error ? ` ${channelStatus.probe.error}` : ""}
      </div>
    `
        : nothing
    }
  `;
}

/**
 * 在弹窗中渲染特殊内容（QR 码、Profile 表单等）
 */
function renderChannelExtraContentInModal(
  channelId: string,
  props: ChannelsProps,
  channelStatus: any,
  accounts: ChannelAccountSnapshot[],
) {
  switch (channelId) {
    case "whatsapp":
      // WhatsApp QR 码
      return html`
        ${
          props.whatsappMessage
            ? html`
          <div class="callout" style="margin-top: 12px;">
            ${props.whatsappMessage}
          </div>
        `
            : nothing
        }
        ${
          props.whatsappQrDataUrl
            ? html`
          <div class="qr-wrap" style="margin-top: 12px;">
            <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
          </div>
        `
            : nothing
        }
      `;

    case "nostr":
      // Nostr Profile 表单（在弹窗中显示简化版）
      return renderNostrProfileInModal(props, channelStatus, accounts);

    default:
      return nothing;
  }
}

/**
 * 在弹窗中渲染 Nostr Profile
 */
function renderNostrProfileInModal(
  props: ChannelsProps,
  channelStatus: any,
  accounts: ChannelAccountSnapshot[],
) {
  const primaryAccount = accounts[0];
  const accountId = primaryAccount?.accountId ?? "default";
  const profile = (primaryAccount as { profile?: any })?.profile ?? channelStatus?.profile;

  if (!profile) {
    return nothing;
  }

  const { name, displayName, about, picture } = profile;
  const hasAnyProfileData = name || displayName || about || picture;

  if (!hasAnyProfileData) {
    return nothing;
  }

  return html`
    <div style="margin-top: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
      <div style="font-weight: 500; margin-bottom: 8px;">Nostr Profile</div>
      <div class="status-list">
        ${
          picture
            ? html`
          <div style="margin-bottom: 8px;">
            <img
              src=${picture}
              alt="Profile picture"
              style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);"
              @error=${(e: Event) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        `
            : nothing
        }
        ${name ? html`<div><span class="label">Name</span><span>${name}</span></div>` : nothing}
        ${displayName ? html`<div><span class="label">Display Name</span><span>${displayName}</span></div>` : nothing}
        ${about ? html`<div><span class="label">About</span><span style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${about}</span></div>` : nothing}
      </div>
    </div>
  `;
}

/**
 * 在弹窗中渲染特殊操作按钮
 */
function renderChannelActionsInModal(channelId: string, props: ChannelsProps, channelStatus: any) {
  switch (channelId) {
    case "whatsapp":
      // WhatsApp 特殊按钮
      return html`
        <div class="row" style="margin-top: 12px; flex-wrap: wrap; gap: 8px;">
          <button
            class="btn btn--sm"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(false)}
          >
            ${props.whatsappBusy ? t("channel.whatsapp.button.working") : t("channel.whatsapp.button.show_qr")}
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(true)}
          >
            ${t("channel.whatsapp.button.relink")}
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppWait()}
          >
            ${t("channel.whatsapp.button.wait")}
          </button>
          <button
            class="btn btn--sm btn--danger"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppLogout()}
          >
            ${t("channel.whatsapp.button.logout")}
          </button>
        </div>
      `;

    default:
      // 默认显示探测按钮
      if (channelStatus?.configured) {
        return html`
          <div class="row" style="margin-top: 12px;">
            <button class="btn btn--sm" @click=${() => props.onRefresh(true)}>
              ${t("channel.button.probe")}
            </button>
          </div>
        `;
      }
      return nothing;
  }
}

/**
 * 渲染通道账号管理按钮
 * 始终显示，允许用户添加和管理账号
 */
export function renderAccountManageButton(params: {
  channelId: string;
  accounts: ChannelAccountSnapshot[];
  props: ChannelsProps;
}) {
  const { channelId, props } = params;

  return html`
    <button 
      class="btn btn--primary btn--sm" 
      style="margin-top: 12px;"
      @click=${() => props.onManageAccounts(channelId)}
    >
      ${t("channels.account.manage_accounts")}
    </button>
  `;
}

/**
 * 根据通道ID和显示名称生成账号 ID
 * 注意：这个函数需要与后端 src/routing/session-key.ts 中的 generateChannelAccountId 保持一致
 * 格式：通道名-时间戳 (例如: feishu-1k2m3n4p)
 */
function generateAccountId(name: string, existingIds: string[], channelId?: string): string {
  // 生成基于时间戳的唯一后缀（8位36进制）
  const timestamp = Date.now().toString(36).slice(-8);

  let baseId: string;

  if (channelId?.trim()) {
    // 使用通道ID作为前缀
    baseId = `${channelId.trim()}-${timestamp}`;
  } else if (name?.trim()) {
    // 如果没有通道ID，使用名称生成
    let nameId = name
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
      .replace(/^-+|-+$/g, "");

    // 处理中文
    if (/[\u4e00-\u9fa5]/.test(nameId)) {
      nameId = nameId.replace(/[\u4e00-\u9fa5]/g, "");
    }

    if (!nameId || nameId.length < 2) {
      nameId = "account";
    }

    // 限制长度
    if (nameId.length > 15) {
      nameId = nameId.slice(0, 15);
    }

    baseId = `${nameId}-${timestamp}`;
  } else {
    // 完全随机
    baseId = `account-${timestamp}`;
  }

  // 确保以字母或数字开头
  if (!/^[a-z0-9]/.test(baseId)) {
    baseId = `acc-${baseId}`;
  }

  // 检查重复（理论上时间戳应该不会重复，但保险起见）
  let finalId = baseId;
  let counter = 1;
  while (existingIds.includes(finalId)) {
    finalId = `${baseId}-${counter}`;
    counter++;
  }

  return finalId;
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
          <!-- 通道全局操作按钮栏 -->
          <div class="row" style="gap: 8px; margin-bottom: 20px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md);">
            <button class="btn btn--sm" @click=${() => props.onEditChannelGlobalConfig(channelId)}>
              🛠️ ${t("channels.global.config")}
            </button>
            <button class="btn btn--sm" @click=${() => props.onDebugChannel(channelId)}>
              🐞 ${t("channels.global.debug")}
            </button>
          </div>

          <!-- 账号区域 -->
          <div class="account-section">
            <div class="row" style="margin-bottom: 16px; justify-content: space-between; align-items: center;">
              <h3 style="font-size: 16px; font-weight: 600;">
                ${t("channels.accounts.title")}
              </h3>
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
 * 点击卡片查看，点击编辑按钮编辑
 */
function renderAccountCard(params: {
  account: ChannelAccountSnapshot;
  channelId: string;
  props: ChannelsProps;
}) {
  const { account, channelId, props } = params;
  // 优先显示名称，如果没有名称则显示账号ID
  const displayName = account.name || account.accountId;
  // 副标题显示：通道:账号ID
  const displaySubtitle = `${channelId}:${account.accountId}`;

  // 判断状态
  const hasError = Boolean(account.lastError);
  const isConfigured = account.configured;
  const isRunning = account.running;
  const isConnected = account.connected;

  // 状态灯颜色
  let statusColor = "gray"; // 灰色：未配置
  if (isConfigured) {
    if (hasError || !isRunning) {
      statusColor = "red"; // 红色：故障
    } else if (isRunning && !isConnected) {
      statusColor = "yellow"; // 黄色：异常
    } else if (isRunning && isConnected) {
      statusColor = "green"; // 绿色：正常
    }
  }

  return html`
    <div 
      class="card card--clickable" 
      style="margin-bottom: 12px;"
      @click=${() => props.onViewAccount(channelId, account.accountId)}
    >
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div class="row" style="align-items: center; gap: 12px;">
          <!-- 状态灯 -->
          <span 
            class="status-indicator status-indicator--${statusColor}" 
            title="${statusColor === "green" ? "正常" : statusColor === "yellow" ? "异常" : statusColor === "red" ? "故障" : "未配置"}"
          ></span>
          <div>
            <div class="card-title">${displayName}</div>
            <div class="card-sub mono">${displaySubtitle}</div>
          </div>
        </div>
        <div class="row" style="gap: 8px;">
          <button 
            class="btn btn--sm" 
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onEditAccount(channelId, account.accountId);
            }}
            title="${t("channels.account.edit")}"
          >
            ✏️ ${t("channels.account.edit")}
          </button>
          <button 
            class="btn btn--sm" 
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onDebugChannel(channelId, account.accountId);
            }}
            title="${t("channels.account.debug")}"
          >
            🐞 ${t("channels.account.debug")}
          </button>
        </div>
      </div>
      
      ${
        hasError
          ? html`
        <div class="callout danger" style="margin-top: 12px;">
          ${account.lastError}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染账号查看弹窗（只读模式）
 */
export function renderAccountViewModal(props: ChannelsProps) {
  if (!props.viewingChannelAccount) {
    return nothing;
  }

  const { channelId, accountId } = props.viewingChannelAccount;
  const accounts = props.snapshot?.channelAccounts?.[channelId] ?? [];
  const account = accounts.find((a) => a.accountId === accountId);

  if (!account) {
    return nothing;
  }

  const channelLabel = resolveChannelLabel(channelId);
  const displayName = account.name || account.accountId;
  const displaySubtitle = `${channelId}:${accountId}`;
  const config = extractAccountConfig(channelId, accountId, props);

  // 判断状态
  const hasError = Boolean(account.lastError);
  const isConfigured = account.configured;
  const isRunning = account.running;
  const isConnected = account.connected;

  let statusColor = "gray";
  let statusText = "未配置";
  if (isConfigured) {
    if (hasError || !isRunning) {
      statusColor = "red";
      statusText = "故障";
    } else if (isRunning && !isConnected) {
      statusColor = "yellow";
      statusText = "异常";
    } else if (isRunning && isConnected) {
      statusColor = "green";
      statusText = "正常";
    }
  }

  return html`
    <div class="modal-overlay" @click=${props.onCancelAccountView}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${channelLabel} - ${t("channels.account.view_title")}</h2>
          <button class="btn-icon" @click=${props.onCancelAccountView}>&times;</button>
        </div>
        
        <div class="modal-body">
          <!-- 状态区域 -->
          <div class="card" style="margin-bottom: 16px; background: var(--bg-elevated);">
            <div class="row" style="align-items: center; gap: 12px; margin-bottom: 12px;">
              <span class="status-indicator status-indicator--${statusColor}"></span>
              <div>
                <div class="card-title">${displayName}</div>
                <div class="card-sub mono">${displaySubtitle}</div>
              </div>
            </div>
            <div class="status-list">
              <div>
                <span class="label">${t("channels.account.status.status")}</span>
                <span>${statusText}</span>
              </div>
              <div>
                <span class="label">${t("channels.account.status.configured")}</span>
                <span>${isConfigured ? t("channels.yes") : t("channels.no")}</span>
              </div>
              <div>
                <span class="label">${t("channels.account.status.running")}</span>
                <span>${isRunning ? t("channels.yes") : t("channels.no")}</span>
              </div>
              <div>
                <span class="label">${t("channels.account.status.connected")}</span>
                <span>${isConnected ? t("channels.yes") : t("channels.no")}</span>
              </div>
            </div>
            ${
              hasError
                ? html`
              <div class="callout danger" style="margin-top: 12px;">
                ${account.lastError}
              </div>
            `
                : nothing
            }
          </div>

          <!-- 配置信息（只读） -->
          <div class="form-group">
            <label>${t("channels.account.field.account_id")}</label>
            <input
              type="text"
              class="form-control"
              .value=${accountId}
              disabled
            />
          </div>
          
          <div class="form-group">
            <label>${t("channels.account.field.name")}</label>
            <input
              type="text"
              class="form-control"
              .value=${account.name || ""}
              disabled
            />
          </div>
          
          ${renderChannelSpecificFieldsReadOnly(channelId, config)}
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${props.onCancelAccountView}>
            ${t("channels.account.close")}
          </button>
          <button 
            class="btn" 
            @click=${() => {
              props.onCancelAccountView();
              props.onDebugChannel(channelId, accountId);
            }}
          >
            🐞 ${t("channels.account.debug")}
          </button>
          <button 
            class="btn btn--primary" 
            @click=${() => {
              props.onCancelAccountView();
              props.onEditAccount(channelId, accountId);
            }}
          >
            ✏️ ${t("channels.account.edit")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染通道特定字段（只读）
 */
function renderChannelSpecificFieldsReadOnly(channelId: string, config: Record<string, unknown>) {
  switch (channelId) {
    case "feishu":
      return renderFeishuFieldsReadOnly(config);
    case "dingtalk":
      return renderDingtalkFieldsReadOnly(config);
    case "wecom":
      return renderWecomFieldsReadOnly(config);
    default:
      return nothing;
  }
}

function renderFeishuFieldsReadOnly(config: Record<string, unknown>) {
  return html`
    <div class="form-group">
      <label>${t("channels.feishu.field.app_id")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.appId as string) || ""}
        disabled
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.feishu.field.app_secret")}</label>
      <input
        type="password"
        class="form-control"
        .value=${(config.appSecret as string) ? "**********" : ""}
        disabled
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.feishu.field.domain")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.domain as string) === "lark" ? "Lark (larksuite.com)" : "飞书 (feishu.cn)"}
        disabled
      />
    </div>
  `;
}

function renderDingtalkFieldsReadOnly(config: Record<string, unknown>) {
  return html`
    <div class="form-group">
      <label>${t("channels.dingtalk.field.app_key")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.appKey as string) || ""}
        disabled
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.dingtalk.field.app_secret")}</label>
      <input
        type="password"
        class="form-control"
        .value=${(config.appSecret as string) ? "**********" : ""}
        disabled
      />
    </div>
  `;
}

function renderWecomFieldsReadOnly(config: Record<string, unknown>) {
  return html`
    <div class="form-group">
      <label>${t("channels.wecom.field.corpid")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.corpid as string) || ""}
        disabled
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.wecom.field.corpsecret")}</label>
      <input
        type="password"
        class="form-control"
        .value=${(config.corpsecret as string) ? "**********" : ""}
        disabled
      />
    </div>
    
    <div class="form-group">
      <label>${t("channels.wecom.field.agentid")}</label>
      <input
        type="text"
        class="form-control"
        .value=${(config.agentid as number) || ""}
        disabled
      />
    </div>
  `;
}

/**
 * 提取账号配置
 */
function extractAccountConfig(
  channelId: string,
  accountId: string,
  props: ChannelsProps,
): Record<string, unknown> {
  const cfg = props.configForm;
  if (!cfg) return {};

  const channelsConfig = cfg.channels as Record<string, unknown> | undefined;
  const channelConfig = channelsConfig?.[channelId] as Record<string, unknown> | undefined;
  const accountsConfig = channelConfig?.accounts as Record<string, unknown> | undefined;
  const accountConfig = accountsConfig?.[accountId] as Record<string, unknown> | undefined;

  return accountConfig || {};
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
  const hasName = Boolean(name && name.trim());
  const canSave = isValidId && hasName;

  // 获取已存在的账号 ID 列表
  const accounts = props.snapshot?.channelAccounts?.[channelId] ?? [];
  const existingIds = accounts.map((a) => a.accountId);

  // 自动生成 ID 的处理函数
  const handleNameChange = (newName: string) => {
    props.onAccountFormChange("name", newName);

    // 如果是新账号且用户没有手动修改过 ID，则自动生成
    if (isNew && newName.trim()) {
      const generatedId = generateAccountId(newName, existingIds, channelId);
      props.onAccountFormChange("accountId", generatedId);
    }
  };

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
            <label>
              ${t("channels.account.field.name")}
              <span class="text-danger">*</span>
            </label>
            <input
              type="text"
              class="form-control"
              .value=${name || ""}
              placeholder=${t("channels.account.field.name_placeholder")}
              @input=${(e: Event) => handleNameChange((e.target as HTMLInputElement).value)}
            />
            <small class="form-text">${t("channels.account.field.name_help")}</small>
            ${
              !hasName && name !== undefined
                ? html`
              <small class="form-text text-danger">${t("channels.account.name_required")}</small>
            `
                : nothing
            }
          </div>
          
          <div class="form-group">
            <label>
              ${t("channels.account.field.account_id")}
              ${
                isNew
                  ? html`
                      <span class="text-muted" style="font-weight: normal; font-size: 12px"> (自动生成，可修改)</span>
                    `
                  : ""
              }
            </label>
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
          
          ${renderChannelSpecificFields(channelId, config, props)}
        </div>
        
        <div class="modal-footer">
          ${
            !isNew
              ? html`
            <button 
              class="btn btn--danger" 
              style="margin-right: auto;"
              ?disabled=${props.deletingChannelAccount}
              @click=${(e: Event) => {
                e.stopPropagation();
                const accountLabel = name || accountId;
                if (confirm(t("channels.account.delete_confirm").replace("{id}", accountLabel))) {
                  props.onDeleteAccount(channelId, accountId);
                }
              }}
            >
              ${t("channels.account.delete")}
            </button>
          `
              : nothing
          }
          <button class="btn" @click=${props.onCancelAccountEdit}>
            ${t("channels.account.cancel")}
          </button>
          ${
            !isNew
              ? html`
            <button 
              class="btn" 
              @click=${() => {
                props.onCancelAccountEdit();
                props.onDebugChannel(channelId, accountId);
              }}
            >
              🐞 ${t("channels.account.debug")}
            </button>
          `
              : nothing
          }
          <button 
            class="btn btn--primary" 
            ?disabled=${!canSave || props.creatingChannelAccount}
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
