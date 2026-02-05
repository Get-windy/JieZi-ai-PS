import { html, nothing } from "lit";
import type { GoogleChatStatus } from "../types.js";
import type { ChannelsProps } from "./channels.types";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import { renderChannelConfigSection } from "./channels.config";

export function renderGoogleChatCard(params: {
  props: ChannelsProps;
  googleChat?: GoogleChatStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, googleChat, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channel.googlechat.title")}</div>
      <div class="card-sub">${t("channel.googlechat.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channel.label.configured")}</span>
          <span>${googleChat ? (googleChat.configured ? t("channel.yes") : t("channel.no")) : t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.running")}</span>
          <span>${googleChat ? (googleChat.running ? t("channel.yes") : t("channel.no")) : t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.googlechat.label.credential")}</span>
          <span>${googleChat?.credentialSource ?? t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.googlechat.label.audience")}</span>
          <span>
            ${
              googleChat?.audienceType
                ? `${googleChat.audienceType}${googleChat.audience ? ` · ${googleChat.audience}` : ""}`
                : t("channel.na")
            }
          </span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_start")}</span>
          <span>${googleChat?.lastStartAt ? formatAgo(googleChat.lastStartAt) : t("channel.na")}</span>
        </div>
        <div>
          <span class="label">${t("channel.label.last_probe")}</span>
          <span>${googleChat?.lastProbeAt ? formatAgo(googleChat.lastProbeAt) : t("channel.na")}</span>
        </div>
      </div>

      ${
        googleChat?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${googleChat.lastError}
          </div>`
          : nothing
      }

      ${
        googleChat?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${googleChat.probe.ok ? t("channel.probe.ok") : t("channel.probe.failed")} ·
            ${googleChat.probe.status ?? ""} ${googleChat.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "googlechat", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channel.button.probe")}
        </button>
      </div>
    </div>
  `;
}
