import { html, nothing } from "lit";
import type { SignalStatus } from "../types.js";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channel.signal.title")}</div>
      <div class="card-sub">${t("channel.signal.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channel.label.configured")}</span>
          <span>${signal?.configured ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.running")}</span>
          <span>${signal?.running ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.base_url")}</span>
          <span>${signal?.baseUrl ?? t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_start")}</span>
          <span>${signal?.lastStartAt ? formatAgo(signal.lastStartAt) : t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_probe")}</span>
          <span>${signal?.lastProbeAt ? formatAgo(signal.lastProbeAt) : t("channel.na")}</span>
        </div>
      </div>

      ${
        signal?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${signal.lastError}
          </div>`
          : nothing
      }

      ${
        signal?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${signal.probe.ok ? t("channel.probe.ok") : t("channel.probe.failed")} ·
            ${signal.probe.status ?? ""} ${signal.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "signal", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channel.button.probe")}
        </button>
      </div>
    </div>
  `;
}
