import { html, nothing } from "lit";
import type { SlackStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { formatAgo } from "../format";
import { renderChannelConfigSection } from "./channels.config";
import { t } from "../i18n.js";

export function renderSlackCard(params: {
  props: ChannelsProps;
  slack?: SlackStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, slack, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channel.slack.title")}</div>
      <div class="card-sub">${t("channel.slack.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channel.label.configured")}</span>
          <span>${slack?.configured ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.running")}</span>
          <span>${slack?.running ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_start")}</span>
          <span>${slack?.lastStartAt ? formatAgo(slack.lastStartAt) : t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_probe")}</span>
          <span>${slack?.lastProbeAt ? formatAgo(slack.lastProbeAt) : t("channel.na")}</span>
        </div>
      </div>

      ${
        slack?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${slack.lastError}
          </div>`
          : nothing
      }

      ${
        slack?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${slack.probe.ok ? t("channel.probe.ok") : t("channel.probe.failed")} ·
            ${slack.probe.status ?? ""} ${slack.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "slack", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channel.button.probe")}
        </button>
      </div>
    </div>
  `;
}
