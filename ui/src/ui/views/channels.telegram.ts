import { html, nothing } from "lit";
import type { ChannelAccountSnapshot, TelegramStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { formatAgo } from "../format";
import { renderChannelConfigSection } from "./channels.config";
import { t } from "../i18n.js";

export function renderTelegramCard(params: {
  props: ChannelsProps;
  telegram?: TelegramStatus;
  telegramAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, telegram, telegramAccounts, accountCountLabel } = params;
  const hasMultipleAccounts = telegramAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { bot?: { username?: string } } | undefined;
    const botUsername = probe?.bot?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botUsername ? `@${botUsername}` : label}
          </div>
          <div class="account-card-id">${account.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">${t("channel.label.running")}</span>
            <span>${account.running ? t("channel.yes") : t("channel.no")}</span>
          </div>
          <div>
            <span class="label">${t("channel.label.configured")}</span>
            <span>${account.configured ? t("channel.yes") : t("channel.no")}</span>
          </div>
          <div>
            <span class="label">${t("channel.label.last_inbound")}</span>
            <span>${account.lastInboundAt ? formatAgo(account.lastInboundAt) : t("channel.na")}</span>
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
  };

  return html`
    <div class="card">
      <div class="card-title">${t("channel.telegram.title")}</div>
      <div class="card-sub">${t("channel.telegram.subtitle")}</div>
      ${accountCountLabel}

      ${
        hasMultipleAccounts
          ? html`
            <div class="account-card-list">
              ${telegramAccounts.map((account) => renderAccountCard(account))}
            </div>
          `
          : html`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">${t("channel.label.configured")}</span>
                <span>${telegram?.configured ? t("channel.yes") : t("channel.no")}</span>
              </div>
              <div>
                <span class="label">${t("channel.label.running")}</span>
                <span>${telegram?.running ? t("channel.yes") : t("channel.no")}</span>
              </div>
              <div>
                <span class="label">${t("channel.label.mode")}</span>
                <span>${telegram?.mode ?? t("channel.na")}</span>
              </div>
              <div>
                <span class="label">${t("channel.label.last_start")}</span>
                <span>${telegram?.lastStartAt ? formatAgo(telegram.lastStartAt) : t("channel.na")}</span>
              </div>
              <div>
                <span class="label">${t("channel.label.last_probe")}</span>
                <span>${telegram?.lastProbeAt ? formatAgo(telegram.lastProbeAt) : t("channel.na")}</span>
              </div>
            </div>
          `
      }

      ${
        telegram?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${telegram.lastError}
          </div>`
          : nothing
      }

      ${
        telegram?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${telegram.probe.ok ? t("channel.probe.ok") : t("channel.probe.failed")} ·
            ${telegram.probe.status ?? ""} ${telegram.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "telegram", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channel.button.probe")}
        </button>
      </div>
    </div>
  `;
}
