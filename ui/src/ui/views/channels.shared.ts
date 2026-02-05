import { html, nothing } from "lit";
import type { ChannelAccountSnapshot } from "../types.ts";
import type { ChannelKey, ChannelsProps } from "./channels.types.ts";
import { t } from "../i18n.ts";

export function formatDuration(ms?: number | null) {
  if (!ms && ms !== 0) {
    return "n/a";
  }
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.round(min / 60);
  return `${hr}h`;
}

export function channelEnabled(key: ChannelKey, props: ChannelsProps) {
  const snapshot = props.snapshot;
  const channels = snapshot?.channels as Record<string, unknown> | null;
  if (!snapshot || !channels) {
    return false;
  }
  const channelStatus = channels[key] as Record<string, unknown> | undefined;
  const configured = typeof channelStatus?.configured === "boolean" && channelStatus.configured;
  const running = typeof channelStatus?.running === "boolean" && channelStatus.running;
  const connected = typeof channelStatus?.connected === "boolean" && channelStatus.connected;
  const accounts = snapshot.channelAccounts?.[key] ?? [];
  const accountActive = accounts.some(
    (account) => account.configured || account.running || account.connected,
  );
  return configured || running || connected || accountActive;
}

export function getChannelAccountCount(
  key: ChannelKey,
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null,
): number {
  return channelAccounts?.[key]?.length ?? 0;
}

export function renderChannelAccountCount(
  key: ChannelKey,
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null,
) {
  const count = getChannelAccountCount(key, channelAccounts);
  if (count < 2) {
    return nothing;
  }
  return html`<div class="account-count">Accounts (${count})</div>`;
}

/**
 * 渲染通道隐藏按钮
 * @param channelId 通道 ID
 * @param props ChannelsProps
 *
 * 自动判断逻辑：
 * 1. 从 snapshot.channels 中查看通道级别的 configured 状态
 * 2. 从 snapshot.channelAccounts 中查看是否有已配置的账号
 * 3. 只有当通道未配置且没有已配置账号时，才显示隐藏按钮
 */
export function renderChannelHideButton(channelId: ChannelKey, props: ChannelsProps) {
  const snapshot = props.snapshot;
  if (!snapshot) {
    return nothing;
  }

  // 检查通道级别配置状态
  const channels = snapshot.channels as Record<string, unknown> | null;
  const channelStatus = channels?.[channelId] as { configured?: boolean } | undefined;
  const channelConfigured = channelStatus?.configured === true;

  // 检查账号级别配置状态
  const accounts = snapshot.channelAccounts?.[channelId] ?? [];
  const hasConfiguredAccounts = accounts.some((acc) => acc.configured);

  // 只有当通道和账号都未配置时，才显示隐藏按钮
  const isConfigured = channelConfigured || hasConfiguredAccounts;
  if (isConfigured) {
    return nothing;
  }

  return html`
    <button 
      class="btn btn--sm" 
      style="position: absolute; top: 12px; right: 12px; padding: 4px 8px; font-size: 11px; z-index: 1;"
      @click=${() => props.onToggleChannelVisibility(channelId)}
      title="${t("channels.hide")}"
    >
      ${t("channels.hide")}
    </button>
  `;
}
