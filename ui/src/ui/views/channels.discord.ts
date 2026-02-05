import { html, nothing } from "lit";
import type { DiscordStatus } from "../types.js";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channel.discord.title")}</div>
      <div class="card-sub">${t("channel.discord.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channel.label.configured")}</span>
          <span>${discord?.configured ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.running")}</span>
          <span>${discord?.running ? t("channel.yes") : t("channel.no")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_start")}</span>
          <span>${discord?.lastStartAt ? formatAgo(discord.lastStartAt) : t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_probe")}</span>
          <span>${discord?.lastProbeAt ? formatAgo(discord.lastProbeAt) : t("channel.na")}</span>
        </div>
      </div>

      ${
        discord?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${discord.lastError}
          </div>`
          : nothing
      }

      ${
        discord?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${discord.probe.ok ? t("channel.probe.ok") : t("channel.probe.failed")} ·
            ${discord.probe.status ?? ""} ${discord.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "discord", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channel.button.probe")}
        </button>
      </div>
    </div>
  `;
}
