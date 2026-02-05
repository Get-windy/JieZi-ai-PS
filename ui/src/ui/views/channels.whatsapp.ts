import { html, nothing } from "lit";
import type { WhatsAppStatus } from "../types.js";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import { renderChannelConfigSection } from "./channels.config.ts";
import { formatDuration } from "./channels.shared.ts";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channel.whatsapp.title")}</div>
      <div class="card-sub">${t("channel.whatsapp.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channel.label.configured")}</span>
          <span>${whatsapp?.configured ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.linked")}</span>
          <span>${whatsapp?.linked ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.running")}</span>
          <span>${whatsapp?.running ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.connected")}</span>
          <span>${whatsapp?.connected ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_connect")}</span>
          <span>
            ${whatsapp?.lastConnectedAt ? formatAgo(whatsapp.lastConnectedAt) : t("channel.na")}
          </span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_message")}</span>
          <span>
            ${whatsapp?.lastMessageAt ? formatAgo(whatsapp.lastMessageAt) : t("channel.na")}
          </span>
        </div>
        <div>
          <span class="label">${t("channel.label.auth_age")}</span>
          <span>
            ${whatsapp?.authAgeMs != null ? formatDuration(whatsapp.authAgeMs) : t("channel.na")}
          </span>
        </div>
      </div>

      ${
        whatsapp?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${whatsapp.lastError}
          </div>`
          : nothing
      }

      ${
        props.whatsappMessage
          ? html`<div class="callout" style="margin-top: 12px;">
            ${props.whatsappMessage}
          </div>`
          : nothing
      }

      ${
        props.whatsappQrDataUrl
          ? html`<div class="qr-wrap">
            <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
          </div>`
          : nothing
      }

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

      ${renderChannelConfigSection({ channelId: "whatsapp", props })}
    </div>
  `;
}
