import { html, nothing } from "lit";
import type { IMessageStatus } from "../types.js";
import type { ChannelsProps } from "./channels.types";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import { renderChannelConfigSection } from "./channels.config";

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channel.imessage.title")}</div>
      <div class="card-sub">${t("channel.imessage.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channel.label.configured")}</span>
          <span>${imessage?.configured ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.running")}</span>
          <span>${imessage?.running ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_start")}</span>
          <span>${imessage?.lastStartAt ? formatAgo(imessage.lastStartAt) : t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_probe")}</span>
          <span>${imessage?.lastProbeAt ? formatAgo(imessage.lastProbeAt) : t("channel.na")}</span>
        </div>
      </div>

      ${
        imessage?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${imessage.lastError}
          </div>`
          : nothing
      }

      ${
        imessage?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${imessage.probe.ok ? t("channel.probe.ok") : t("channel.probe.failed")} ·
            ${imessage.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "imessage", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channel.button.probe")}
        </button>
      </div>
    </div>
  `;
}
