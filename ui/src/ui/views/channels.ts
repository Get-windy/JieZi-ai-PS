import { html, nothing } from "lit";
import type {
  ChannelAccountSnapshot,
  ChannelUiMetaEntry,
  ChannelsStatusSnapshot,
  NostrProfile,
} from "../types.js";
import type { ChannelKey, ChannelsChannelData, ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import {
  renderAccountManageButton,
  renderAccountManagerModal,
  renderAccountEditModal,
  renderAccountViewModal,
} from "./channels.account-manager.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { channelEnabled, renderChannelAccountCount } from "./channels.shared.ts";

export function renderChannels(props: ChannelsProps) {
  const channels = props.snapshot?.channels as Record<string, unknown> | null;
  const channelOrder = resolveChannelOrder(props.snapshot);

  // 获取隐藏通道列表
  const hiddenChannels = getHiddenChannels();

  // 过滤隐藏的通道
  const visibleChannels = channelOrder.filter((key) => !hiddenChannels.includes(key));

  const orderedChannels = visibleChannels
    .map((key, index) => ({
      key,
      enabled: channelEnabled(key, props),
      order: index,
    }))
    .toSorted((a, b) => {
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1;
      }
      return a.order - b.order;
    });

  return html`
    ${
      hiddenChannels.length > 0
        ? html`
      <div class="channels-header">
        <button 
          class="btn btn--sm" 
          style="margin-left: auto;"
          @click=${props.onToggleAllChannelsModal}
          title="${t("channels.show_hidden")}"
        >
          <span>☰</span> ${t("channels.show_hidden")}
        </button>
      </div>
    `
        : nothing
    }
    
    <section class="grid grid-cols-2">
      ${orderedChannels.map((channel) =>
        renderChannel(channel.key, props, {
          ...channels,
          channelAccounts: props.snapshot?.channelAccounts ?? null,
        }),
      )}
    </section>

    ${renderAccountManagerModal(props)}
    ${renderAccountViewModal(props)}
    ${renderAccountEditModal(props)}
    ${renderAllChannelsModal(props, channelOrder, hiddenChannels)}
    ${renderDebugModal(props)}
    ${renderChannelGlobalConfigModal(props)}
  `;
}

/**
 * 系统内置通道列表（与后端 CHAT_CHANNEL_ORDER 保持一致）
 */
const BUILTIN_CHANNELS = [
  "telegram",
  "whatsapp",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "feishu",
  "dingtalk",
  "wecom",
] as const;

/**
 * 获取隐藏通道列表
 */
function getHiddenChannels(): string[] {
  try {
    const stored = localStorage.getItem("openclaw.hiddenChannels");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot | null): ChannelKey[] {
  if (!snapshot) {
    return [...BUILTIN_CHANNELS];
  }

  // 收集所有通道 ID（从后端 + 内置列表）
  const ids = new Set<string>([...BUILTIN_CHANNELS]); // 先添加所有内置通道

  // 从 channelOrder 添加（后端返回的顺序）
  for (const id of snapshot.channelOrder ?? []) {
    ids.add(id);
  }

  // 从 channelMeta 添加（插件元数据）
  for (const entry of snapshot.channelMeta ?? []) {
    ids.add(entry.id);
  }

  // 从 channelAccounts 添加（有账号配置的通道）
  for (const id of Object.keys(snapshot.channelAccounts ?? {})) {
    ids.add(id);
  }

  // 按照 channelOrder 或 BUILTIN_CHANNELS 的顺序排列
  const ordered: string[] = [];
  const seed = snapshot.channelOrder?.length ? snapshot.channelOrder : [...BUILTIN_CHANNELS];

  for (const id of seed) {
    if (!ids.has(id)) {
      continue;
    }
    ordered.push(id);
    ids.delete(id);
  }

  // 添加剩余的通道（不在 order 中的）
  for (const id of ids) {
    ordered.push(id);
  }

  return ordered;
}

/**
 * 渲染通道状态信息（动态显示通用字段）
 */
function renderChannelStatusInfo(channelId: ChannelKey, channelStatus: any) {
  if (!channelStatus) {
    return nothing;
  }

  return html`
    <div class="status-list" style="margin-top: 16px;">
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
 * 渲染特殊内容（QR 码、Profile 表单等）
 * 根据通道类型动态加载
 *
 * 显示规则：
 * - WhatsApp QR 码：状态类，在调试弹窗中显示
 * - Nostr Profile：配置类，在配置弹窗中显示
 */
function renderChannelExtraContent(
  channelId: ChannelKey,
  props: ChannelsProps,
  channelStatus: any,
  accounts: ChannelAccountSnapshot[],
) {
  switch (channelId) {
    case "whatsapp":
      // WhatsApp QR 码（状态类，在调试弹窗显示）
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
          <div class="qr-wrap">
            <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
          </div>
        `
            : nothing
        }
      `;

    default:
      return nothing;
  }
}

/**
 * 渲染特殊操作按钮
 * 根据通道类型动态加载
 */
function renderChannelActions(channelId: ChannelKey, props: ChannelsProps, channelStatus: any) {
  switch (channelId) {
    case "whatsapp":
      // WhatsApp 特殊按钮
      return html`
        <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
          <button
            class="btn primary"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(false)}
          >
            ${props.whatsappBusy ? t("channel.whatsapp.button.working") : t("channel.whatsapp.button.show_qr")}
          </button>
          <button
            class="btn"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(true)}
          >
            ${t("channel.whatsapp.button.relink")}
          </button>
          <button
            class="btn"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppWait()}
          >
            ${t("channel.whatsapp.button.wait")}
          </button>
          <button
            class="btn danger"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppLogout()}
          >
            ${t("channel.whatsapp.button.logout")}
          </button>
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channel.button.refresh")}
          </button>
        </div>
      `;

    default:
      // 默认显示探测按钮
      if (channelStatus?.configured) {
        return html`
          <div class="row" style="margin-top: 12px;">
            <button class="btn" @click=${() => props.onRefresh(true)}>
              ${t("channel.button.probe")}
            </button>
          </div>
        `;
      }
      return nothing;
  }
}

/**
 * 渲染 Nostr Profile 区域
 */
function renderNostrProfileSection(
  props: ChannelsProps,
  channelStatus: any,
  accounts: ChannelAccountSnapshot[],
) {
  const primaryAccount = accounts[0];
  const accountId = primaryAccount?.accountId ?? "default";
  const profile =
    (primaryAccount as { profile?: NostrProfile | null })?.profile ?? channelStatus?.profile;
  const showForm = props.nostrProfileAccountId === accountId ? props.nostrProfileFormState : null;

  // 如果显示表单，使用表单组件
  if (showForm) {
    const { renderNostrProfileForm } = require("./channels.nostr-profile-form.ts");
    const profileFormCallbacks = {
      onFieldChange: props.onNostrProfileFieldChange,
      onSave: props.onNostrProfileSave,
      onImport: props.onNostrProfileImport,
      onCancel: props.onNostrProfileCancel,
      onToggleAdvanced: props.onNostrProfileToggleAdvanced,
    };
    return renderNostrProfileForm({
      state: showForm,
      callbacks: profileFormCallbacks,
      accountId,
    });
  }

  // 显示 Profile 信息
  const { name, displayName, about, picture, nip05 } = profile ?? {};
  const hasAnyProfileData = name || displayName || about || picture || nip05;
  const summaryConfigured = channelStatus?.configured ?? primaryAccount?.configured ?? false;

  return html`
    <div style="margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 500;">Profile</div>
        ${
          summaryConfigured
            ? html`
          <button
            class="btn btn-sm"
            @click=${() => props.onNostrProfileEdit(accountId, profile)}
            style="font-size: 12px; padding: 4px 8px;"
          >
            Edit Profile
          </button>
        `
            : nothing
        }
      </div>
      ${
        hasAnyProfileData
          ? html`
        <div class="status-list">
          ${
            picture
              ? html`
            <div style="margin-bottom: 8px;">
              <img
                src=${picture}
                alt="Profile picture"
                style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);"
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
          ${nip05 ? html`<div><span class="label">NIP-05</span><span>${nip05}</span></div>` : nothing}
        </div>
      `
          : html`
              <div style="color: var(--text-muted); font-size: 13px">
                No profile set. Click "Edit Profile" to add your name, bio, and avatar.
              </div>
            `
      }
    </div>
  `;
}

function renderChannel(key: ChannelKey, props: ChannelsProps, data: ChannelsChannelData) {
  // 所有通道统一使用通用渲染（组件化架构）
  return renderGenericChannelCard(key, props, data);
}

function renderGenericChannelCard(
  key: ChannelKey,
  props: ChannelsProps,
  data: ChannelsChannelData,
) {
  const label = resolveChannelLabel(props.snapshot, key);
  const channelAccounts = data.channelAccounts ?? {};
  const accounts = channelAccounts[key] ?? [];
  const accountCountLabel = renderChannelAccountCount(key, channelAccounts);

  // 获取通道级别状态
  const channelStatus = (data as any)[key];

  // 计算整体状态
  const statusSummary = calculateChannelStatus(accounts);

  // 判断是否已配置（有账号且至少一个已配置，或通道级别已配置）
  const channelConfigured = channelStatus?.configured === true;
  const hasConfiguredAccounts = accounts.some((acc) => acc.configured);
  const isConfigured = channelConfigured || hasConfiguredAccounts;
  const hasAnyAccounts = accounts.length > 0;

  return html`
    <div class="card" style="position: relative;">
      <!-- 隐藏按钮（仅未配置通道显示） -->
      ${
        !isConfigured
          ? html`
        <button 
          class="btn btn--sm" 
          style="position: absolute; top: 12px; right: 12px; padding: 4px 8px; font-size: 11px;"
          @click=${() => props.onToggleChannelVisibility(key)}
          title="${t("channels.hide")}"
        >
          ${t("channels.hide")}
        </button>
      `
          : nothing
      }
      
      <div class="card-title">${label}</div>
      <div class="card-sub">${t("channels.card.subtitle")}</div>
      ${accountCountLabel}

      <!-- 账号操作按钮和状态指示器 -->
      <div class="row" style="margin-top: 16px; align-items: center; gap: 12px;">
        ${
          hasAnyAccounts
            ? html`
            <button 
              class="btn btn--primary btn--sm" 
              style="margin-top: 12px;"
              @click=${() => props.onManageAccounts(key)}
            >
              ${t("channels.account.manage_accounts")}
            </button>
          `
            : html`
            <button 
              class="btn btn--primary btn--sm" 
              style="margin-top: 12px;"
              @click=${() => props.onAddAccount(key)}
            >
              ${t("channels.account.add_account")}
            </button>
          `
        }
        ${statusSummary.hasAccounts ? renderChannelStatusIndicators(statusSummary) : nothing}
      </div>
    </div>
  `;
}

/**
 * 计算通道的整体状态
 */
function calculateChannelStatus(accounts: ChannelAccountSnapshot[]) {
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;

  accounts.forEach((account) => {
    const hasError = Boolean(account.lastError);
    const isConfigured = account.configured;
    const isRunning = account.running;
    const isConnected = account.connected;

    if (!isConfigured) {
      // 未配置算灰色，不计入统计
      return;
    }

    if (hasError || !isRunning) {
      redCount++;
    } else if (isRunning && !isConnected) {
      yellowCount++;
    } else if (isRunning && isConnected) {
      greenCount++;
    }
  });

  return {
    hasAccounts: accounts.length > 0,
    greenCount,
    yellowCount,
    redCount,
  };
}

/**
 * 渲染通道状态指示器组
 */
function renderChannelStatusIndicators(summary: {
  greenCount: number;
  yellowCount: number;
  redCount: number;
}) {
  return html`
    <div class="channel-status-indicators">
      ${
        summary.greenCount > 0
          ? html`
        <div class="status-indicator-group">
          <span class="status-indicator status-indicator--green"></span>
          <span class="status-indicator-count">${summary.greenCount}</span>
        </div>
      `
          : nothing
      }
      ${
        summary.yellowCount > 0
          ? html`
        <div class="status-indicator-group">
          <span class="status-indicator status-indicator--yellow"></span>
          <span class="status-indicator-count">${summary.yellowCount}</span>
        </div>
      `
          : nothing
      }
      ${
        summary.redCount > 0
          ? html`
        <div class="status-indicator-group">
          <span class="status-indicator status-indicator--red"></span>
          <span class="status-indicator-count">${summary.redCount}</span>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

function resolveChannelMetaMap(
  snapshot: ChannelsStatusSnapshot | null,
): Record<string, ChannelUiMetaEntry> {
  if (!snapshot?.channelMeta?.length) {
    return {};
  }
  return Object.fromEntries(snapshot.channelMeta.map((entry: any) => [entry.id, entry]));
}

function resolveChannelLabel(snapshot: ChannelsStatusSnapshot | null, key: string): string {
  const meta = resolveChannelMetaMap(snapshot)[key];
  return meta?.label ?? snapshot?.channelLabels?.[key] ?? key;
}

const RECENT_ACTIVITY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function hasRecentActivity(account: ChannelAccountSnapshot): boolean {
  if (!account.lastInboundAt) {
    return false;
  }
  return Date.now() - account.lastInboundAt < RECENT_ACTIVITY_THRESHOLD_MS;
}

function deriveRunningStatus(account: ChannelAccountSnapshot): string {
  if (account.running) {
    return t("channels.status.yes");
  }
  // If we have recent inbound activity, the channel is effectively running
  if (hasRecentActivity(account)) {
    return t("channels.status.active");
  }
  return t("channels.status.no");
}

function deriveConnectedStatus(account: ChannelAccountSnapshot): string {
  if (account.connected === true) {
    return t("channels.status.yes");
  }
  if (account.connected === false) {
    return t("channels.status.no");
  }
  // If connected is null/undefined but we have recent activity, show as active
  if (hasRecentActivity(account)) {
    return t("channels.status.active");
  }
  return t("channels.status.na");
}

function renderGenericAccount(account: ChannelAccountSnapshot, channelId?: string) {
  const runningStatus = deriveRunningStatus(account);
  const connectedStatus = deriveConnectedStatus(account);
  const displayName = account.name || account.accountId;
  const displayId = channelId ? `${channelId}:${account.accountId}` : account.accountId;

  return html`
    <div class="account-card">
      <div class="account-card-header">
        <div class="account-card-title">${displayName}</div>
        <div class="account-card-id">${displayId}</div>
      </div>
      <div class="status-list account-card-status">
        <div>
          <span class="label">${t("channels.status.running")}</span>
          <span>${runningStatus}</span>
        </div>
        <div>
          <span class="label">${t("channels.status.configured")}</span>
          <span>${account.configured ? t("channels.status.yes") : t("channels.status.no")}</span>
        </div>
        <div>
          <span class="label">${t("channels.status.connected")}</span>
          <span>${connectedStatus}</span>
        </div>
        <div>
          <span class="label">${t("channels.account.last_inbound")}</span>
          <span>${account.lastInboundAt ? formatAgo(account.lastInboundAt) : t("channels.status.na")}</span>
        </div>
        ${
          account.lastError
            ? html`
              <div class="account-card-error">
                ${account.lastError}
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

/**
 * 渲染显示所有通道弹窗
 */
function renderAllChannelsModal(
  props: ChannelsProps,
  allChannels: string[],
  hiddenChannels: string[],
) {
  if (!props.showAllChannelsModal) {
    return nothing;
  }

  // 只显示隐藏的通道
  const hiddenChannelsList = allChannels.filter((id) => hiddenChannels.includes(id));

  return html`
    <div class="modal-overlay" @click=${props.onToggleAllChannelsModal}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="min-width: 400px;">
        <div class="modal-header">
          <h2>${t("channels.hidden_channels")}</h2>
          <button class="btn-icon" @click=${props.onToggleAllChannelsModal}>&times;</button>
        </div>
        
        <div class="modal-body">
          ${
            hiddenChannelsList.length === 0
              ? html`
            <p class="muted">${t("channels.no_hidden_channels")}</p>
          `
              : html`
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${hiddenChannelsList.map((channelId) => {
                const label = resolveChannelLabel(props.snapshot, channelId);
                return html`
                  <div class="card" style="padding: 12px;">
                    <div class="row" style="justify-content: space-between; align-items: center;">
                      <span>${label}</span>
                      <button 
                        class="btn btn--sm"
                        @click=${() => props.onToggleChannelVisibility(channelId)}
                        title="${t("channels.unhide")}"
                      >
                        ${t("channels.unhide")}
                      </button>
                    </div>
                  </div>
                `;
              })}
            </div>
          `
          }
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${props.onToggleAllChannelsModal}>
            ${t("channels.account.close")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染调试弹窗
 */
function renderDebugModal(props: ChannelsProps) {
  if (!props.debuggingChannel) {
    return nothing;
  }

  const { channelId, accountId } = props.debuggingChannel;
  const channelLabel = resolveChannelLabel(props.snapshot, channelId);

  // 获取调试数据
  let debugData: any = null;
  let title = "";
  let isChannelDebug = false;

  if (accountId) {
    // 账号调试
    const accounts = props.snapshot?.channelAccounts?.[channelId] ?? [];
    const account = accounts.find((a) => a.accountId === accountId);
    debugData = account;
    const displayName = account?.name || accountId;
    title = `${channelLabel} - ${displayName} (${channelId}:${accountId}) - ${t("channels.debug.title")}`;
  } else {
    // 通道调试
    const channelData = (props.snapshot?.channels as Record<string, unknown> | null)?.[channelId];
    debugData = channelData;
    title = `${channelLabel} - ${t("channels.debug.title")}`;
    isChannelDebug = true;
  }

  // 获取通道账号列表（用于 Nostr Profile）
  const accounts = props.snapshot?.channelAccounts?.[channelId] ?? [];

  return html`
    <div class="modal-overlay" @click=${props.onCloseDebug}>
      <div class="modal-content modal-content--large" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="btn-icon" @click=${props.onCloseDebug}>&times;</button>
        </div>
        
        <div class="modal-body">
          ${
            isChannelDebug && debugData
              ? html`
            <!-- 通道状态信息 -->
            <div class="card" style="background: var(--bg-elevated); margin-bottom: 16px;">
              <div class="card-title" style="font-size: 14px; margin-bottom: 12px;">
                ${t("channels.debug.status_info")}
              </div>
              ${renderChannelStatusInfo(channelId, debugData)}
            </div>
            
            <!-- 特殊内容（QR 码、Profile 表单等） -->
            ${renderChannelExtraContent(channelId, props, debugData, accounts)}
            
            <!-- 特殊操作按钮 -->
            ${renderChannelActions(channelId, props, debugData)}
          `
              : nothing
          }
          
          ${
            debugData
              ? html`
            <div class="card" style="background: var(--bg-elevated); margin-top: ${isChannelDebug ? "16px" : "0"};">
              <div class="card-title" style="font-size: 12px; margin-bottom: 8px;">
                ${t("channels.debug.raw_data")}
              </div>
              <pre style="
                background: var(--bg);
                padding: 12px;
                border-radius: 4px;
                overflow: auto;
                max-height: 500px;
                font-size: 11px;
                line-height: 1.5;
              ">${JSON.stringify(debugData, null, 2)}</pre>
            </div>
          `
              : html`
            <div class="muted">${t("channels.debug.no_data")}</div>
          `
          }
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${props.onCloseDebug}>
            ${t("channels.account.close")}
          </button>
          <button class="btn btn--primary" @click=${() => props.onRefresh(true)}>
            🔄 ${t("channels.debug.refresh")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染通道全局配置弹窗
 */
function renderChannelGlobalConfigModal(props: ChannelsProps) {
  if (!props.editingChannelGlobalConfig) {
    return nothing;
  }

  const channelId = props.editingChannelGlobalConfig;
  const channelLabel = resolveChannelLabel(props.snapshot, channelId);

  // 获取当前通道的配置
  const channelsConfig = (props.configForm?.channels as Record<string, unknown>) ?? {};
  const channelConfig = (channelsConfig[channelId] as Record<string, unknown>) ?? {};

  // 通用配置字段
  const enabled = channelConfig.enabled !== false; // 默认启用
  const dmPolicy = (channelConfig.dmPolicy as string) ?? "allow";
  const groupPolicy = (channelConfig.groupPolicy as string) ?? "allow";
  const markdown = channelConfig.markdown !== false; // 默认启用
  const tools = channelConfig.tools !== false; // 默认启用

  const handleConfigChange = (field: string, value: unknown) => {
    const path = ["channels", channelId, field];
    props.onConfigPatch(path, value);
  };

  // 获取通道状态和账号（用于 Nostr Profile）
  const channelStatus = (props.snapshot?.channels as Record<string, unknown> | null)?.[channelId];
  const accounts = props.snapshot?.channelAccounts?.[channelId] ?? [];

  return html`
    <div class="modal-overlay" @click=${props.onCancelChannelGlobalConfig}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${channelLabel} - ${t("channels.global.config_title")}</h2>
          <button class="btn-icon" @click=${props.onCancelChannelGlobalConfig}>&times;</button>
        </div>
        
        <div class="modal-body">
          <!-- Nostr Profile 编辑表单（配置类内容） -->
          ${channelId === "nostr" ? renderNostrProfileSection(props, channelStatus, accounts) : nothing}
          
          ${
            channelId === "nostr"
              ? html`
                  <div style="margin: 20px 0; border-top: 1px solid var(--border)"></div>
                `
              : nothing
          }
          
          <div class="form-group">
            <label>
              <input
                type="checkbox"
                .checked=${enabled}
                @change=${(e: Event) => handleConfigChange("enabled", (e.target as HTMLInputElement).checked)}
              />
              ${t("channels.global.field.enabled")}
            </label>
            <small class="form-text">${t("channels.global.field.enabled_help")}</small>
          </div>
          
          <div class="form-group">
            <label>${t("channels.global.field.dm_policy")}</label>
            <select
              class="form-control"
              .value=${dmPolicy}
              @change=${(e: Event) => handleConfigChange("dmPolicy", (e.target as HTMLSelectElement).value)}
            >
              <option value="allow">${t("channels.global.policy.allow")}</option>
              <option value="deny">${t("channels.global.policy.deny")}</option>
              <option value="ignore">${t("channels.global.policy.ignore")}</option>
            </select>
            <small class="form-text">${t("channels.global.field.dm_policy_help")}</small>
          </div>
          
          <div class="form-group">
            <label>${t("channels.global.field.group_policy")}</label>
            <select
              class="form-control"
              .value=${groupPolicy}
              @change=${(e: Event) => handleConfigChange("groupPolicy", (e.target as HTMLSelectElement).value)}
            >
              <option value="allow">${t("channels.global.policy.allow")}</option>
              <option value="deny">${t("channels.global.policy.deny")}</option>
              <option value="ignore">${t("channels.global.policy.ignore")}</option>
            </select>
            <small class="form-text">${t("channels.global.field.group_policy_help")}</small>
          </div>
          
          <div class="form-group">
            <label>
              <input
                type="checkbox"
                .checked=${markdown}
                @change=${(e: Event) => handleConfigChange("markdown", (e.target as HTMLInputElement).checked)}
              />
              ${t("channels.global.field.markdown")}
            </label>
            <small class="form-text">${t("channels.global.field.markdown_help")}</small>
          </div>
          
          <div class="form-group">
            <label>
              <input
                type="checkbox"
                .checked=${tools}
                @change=${(e: Event) => handleConfigChange("tools", (e.target as HTMLInputElement).checked)}
              />
              ${t("channels.global.field.tools")}
            </label>
            <small class="form-text">${t("channels.global.field.tools_help")}</small>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${props.onCancelChannelGlobalConfig}>
            ${t("channels.account.cancel")}
          </button>
          <button 
            class="btn btn--primary" 
            ?disabled=${props.configSaving}
            @click=${props.onSaveChannelGlobalConfig}
          >
            ${props.configSaving ? t("channels.account.saving") : t("channels.account.save")}
          </button>
        </div>
      </div>
    </div>
  `;
}
