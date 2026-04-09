import { html, nothing } from "lit";
import { ConnectErrorDetailCodes } from "../../../../upstream/src/gateway/protocol/connect-error-details.js";
import { t, i18n, SUPPORTED_LOCALES, type Locale, isSupportedLocale } from "../../i18n/index.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../external-link.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import type { GatewayHelloOk } from "../gateway.ts";
import { icons } from "../icons.ts";
import { formatNextRun } from "../presenter.ts";
import type { UiSettings } from "../storage.ts";
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.ts";
import { shouldShowPairingHint } from "./overview-hints.ts";

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  lastErrorCode: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  warnQueryToken?: boolean;
  showGatewayToken?: boolean;
  showGatewayPassword?: boolean;
  // Local-only: workspace management
  workspacesDir: string;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onToggleGatewayTokenVisibility?: () => void;
  onToggleGatewayPasswordVisibility?: () => void;
  onConnect: () => void;
  onRefresh: () => void;
  onWorkspacesDirSave: (newDir: string) => Promise<void>;
  onWorkspaceBackup: (backupDir?: string) => Promise<{ backupDir: string; fileCount: number }>;
  onWorkspaceMigrateAll: (
    newRoot: string,
  ) => Promise<{ oldRoot: string; newRoot: string; filesCopied: number; agentsMigrated: number }>;
};

export function renderOverview(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | {
        uptimeMs?: number;
        policy?: { tickIntervalMs?: number };
        authMode?: "none" | "token" | "password" | "trusted-proxy";
      }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationHuman(snapshot.uptimeMs) : t("common.na");
  const tickIntervalMs = props.hello?.policy?.tickIntervalMs ?? snapshot?.policy?.tickIntervalMs;
  const tick = tickIntervalMs
    ? `${(tickIntervalMs / 1000).toFixed(tickIntervalMs % 1000 === 0 ? 0 : 1)}s`
    : t("common.na");
  const authMode = snapshot?.authMode;
  const isTrustedProxy = authMode === "trusted-proxy";

  // 工作空间目录本地状态（可编辑框）
  let workspacesDirInput = props.workspacesDir;

  const pairingHint = (() => {
    if (!shouldShowPairingHint(props.connected, props.lastError, props.lastErrorCode)) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.pairing.hint")}
        <div style="margin-top: 6px">
          <span class="mono">openclaw devices list</span><br />
          <span class="mono">openclaw devices approve &lt;requestId&gt;</span>
        </div>
        <div style="margin-top: 6px; font-size: 12px;">
          ${t("overview.pairing.mobileHint")}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#device-pairing-first-connection"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Device pairing docs (opens in new tab)"
            >Docs: Device pairing</a
          >
        </div>
      </div>
    `;
  })();

  const authHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    const authRequiredCodes = new Set<string>([
      ConnectErrorDetailCodes.AUTH_REQUIRED,
      ConnectErrorDetailCodes.AUTH_TOKEN_MISSING,
      ConnectErrorDetailCodes.AUTH_PASSWORD_MISSING,
      ConnectErrorDetailCodes.AUTH_TOKEN_NOT_CONFIGURED,
      ConnectErrorDetailCodes.AUTH_PASSWORD_NOT_CONFIGURED,
    ]);
    const authFailureCodes = new Set<string>([
      ...authRequiredCodes,
      ConnectErrorDetailCodes.AUTH_UNAUTHORIZED,
      ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH,
      ConnectErrorDetailCodes.AUTH_PASSWORD_MISMATCH,
      ConnectErrorDetailCodes.AUTH_DEVICE_TOKEN_MISMATCH,
      ConnectErrorDetailCodes.AUTH_RATE_LIMITED,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_IDENTITY_MISSING,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_PROXY_MISSING,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_WHOIS_FAILED,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_IDENTITY_MISMATCH,
    ]);
    const authFailed = props.lastErrorCode
      ? authFailureCodes.has(props.lastErrorCode)
      : lower.includes("unauthorized") || lower.includes("connect failed");
    if (!authFailed) {
      return null;
    }
    const hasToken = Boolean(props.settings.token.trim());
    const hasPassword = Boolean(props.password.trim());
    const isAuthRequired = props.lastErrorCode
      ? authRequiredCodes.has(props.lastErrorCode)
      : !hasToken && !hasPassword;
    if (isAuthRequired) {
      return html`
        <div class="muted" style="margin-top: 8px">
          ${t("overview.auth.required")}
          <div style="margin-top: 6px">
            <span class="mono">openclaw dashboard --no-open</span> → tokenized URL<br />
            <span class="mono">openclaw doctor --generate-gateway-token</span> → set token
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://docs.openclaw.ai/web/dashboard"
              target=${EXTERNAL_LINK_TARGET}
              rel=${buildExternalLinkRel()}
              title="Control UI auth docs (opens in new tab)"
              >Docs: Control UI auth</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.auth.failed", { command: "openclaw dashboard --no-open" })}
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/dashboard"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Control UI auth docs (opens in new tab)"
            >Docs: Control UI auth</a
          >
        </div>
      </div>
    `;
  })();

  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    const insecureContextCode =
      props.lastErrorCode === ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED ||
      props.lastErrorCode === ConnectErrorDetailCodes.DEVICE_IDENTITY_REQUIRED;
    if (
      !insecureContextCode &&
      !lower.includes("secure context") &&
      !lower.includes("device identity required")
    ) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.insecure.hint", { url: "http://127.0.0.1:18789" })}
        <div style="margin-top: 6px">
          ${t("overview.insecure.stayHttp", { config: "gateway.controlUi.allowInsecureAuth: true" })}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/gateway/tailscale"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Tailscale Serve docs (opens in new tab)"
            >Docs: Tailscale Serve</a
          >
          <span class="muted"> · </span>
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#insecure-http"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Insecure HTTP docs (opens in new tab)"
            >Docs: Insecure HTTP</a
          >
        </div>
      </div>
    `;
  })();

  const queryTokenHint = (() => {
    if (props.connected || !props.lastError || !props.warnQueryToken) {
      return null;
    }
    const lower = normalizeLowercaseStringOrEmpty(props.lastError);
    const authFailed = lower.includes("unauthorized") || lower.includes("device identity required");
    if (!authFailed) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        Auth token must be passed as a URL fragment:
        <span class="mono">#token=&lt;token&gt;</span>. Query parameters (<span class="mono">?token=</span
        >) may appear in server logs.
      </div>
    `;
  })();

  const currentLocale = isSupportedLocale(props.settings.locale)
    ? props.settings.locale
    : i18n.getLocale();

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">${t("overview.access.title")}</div>
        <div class="card-sub">${t("overview.access.subtitle")}</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>${t("overview.access.wsUrl")}</span>
            <input
              .value=${props.settings.gatewayUrl}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, gatewayUrl: v });
              }}
              placeholder="ws://100.x.y.z:18789"
            />
          </label>
          ${
            isTrustedProxy
              ? ""
              : html`
                <label class="field">
                  <span>${t("overview.access.token")}</span>
                  <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <input
                      type=${props.showGatewayToken ? "text" : "password"}
                      autocomplete="off"
                      style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;"
                      .value=${props.settings.token}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        props.onSettingsChange({ ...props.settings, token: v });
                      }}
                      placeholder="OPENCLAW_GATEWAY_TOKEN"
                    />
                    ${
                      props.onToggleGatewayTokenVisibility
                        ? html`<button
                          type="button"
                          class="btn btn--icon ${props.showGatewayToken ? "active" : ""}"
                          style="flex-shrink: 0; width: 36px; height: 36px; box-sizing: border-box;"
                          title=${props.showGatewayToken ? "Hide token" : "Show token"}
                          aria-label="Toggle token visibility"
                          aria-pressed=${props.showGatewayToken}
                          @click=${props.onToggleGatewayTokenVisibility}
                        >
                          ${props.showGatewayToken ? icons.eye : icons.eyeOff}
                        </button>`
                        : nothing
                    }
                  </div>
                </label>
                <label class="field">
                  <span>${t("overview.access.password")}</span>
                  <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <input
                      type=${props.showGatewayPassword ? "text" : "password"}
                      autocomplete="off"
                      style="flex: 1 1 0%; min-width: 0; width: 100%; box-sizing: border-box;"
                      .value=${props.password}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        props.onPasswordChange(v);
                      }}
                      placeholder=${t("overview.access.passwordPlaceholder")}
                    />
                    ${
                      props.onToggleGatewayPasswordVisibility
                        ? html`<button
                          type="button"
                          class="btn btn--icon ${props.showGatewayPassword ? "active" : ""}"
                          style="flex-shrink: 0; width: 36px; height: 36px; box-sizing: border-box;"
                          title=${props.showGatewayPassword ? "Hide password" : "Show password"}
                          aria-label="Toggle password visibility"
                          aria-pressed=${props.showGatewayPassword}
                          @click=${props.onToggleGatewayPasswordVisibility}
                        >
                          ${props.showGatewayPassword ? icons.eye : icons.eyeOff}
                        </button>`
                        : nothing
                    }
                  </div>
                </label>
              `
          }
          <label class="field">
            <span>${t("overview.access.sessionKey")}</span>
            <input
              .value=${props.settings.sessionKey}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSessionKeyChange(v);
              }}
            />
          </label>
          <label class="field">
            <span>${t("overview.access.language")}</span>
            <select
              .value=${currentLocale}
              @change=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value as Locale;
                void i18n.setLocale(v);
                props.onSettingsChange({ ...props.settings, locale: v });
              }}
            >
              ${SUPPORTED_LOCALES.map((loc) => {
                const key = loc.replace(/-([a-zA-Z])/g, (_, c) => c.toUpperCase());
                return html`<option value=${loc} ?selected=${currentLocale === loc}>
                  ${t(`languages.${key}`)}
                </option>`;
              })}
            </select>
          </label>
        </div>
        <div class="row" style="margin-top: 14px;">
          <button class="btn" @click=${() => props.onConnect()}>${t("common.connect")}</button>
          <button class="btn" @click=${() => props.onRefresh()}>${t("common.refresh")}</button>
          <span class="muted">${
            isTrustedProxy ? t("overview.access.trustedProxy") : t("overview.access.connectHint")
          }</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("overview.snapshot.title")}</div>
        <div class="card-sub">${t("overview.snapshot.subtitle")}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.status")}</div>
            <div class="stat-value ${props.connected ? "ok" : "warn"}">
              ${props.connected ? t("common.ok") : t("common.offline")}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.uptime")}</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.tickInterval")}</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.lastChannelsRefresh")}</div>
            <div class="stat-value">
              ${props.lastChannelsRefresh ? formatRelativeTimestamp(props.lastChannelsRefresh) : t("common.na")}
            </div>
          </div>
        </div>
        ${
          props.lastError
            ? html`<div class="callout danger" style="margin-top: 14px;">
              <div>${props.lastError}</div>
              ${pairingHint ?? ""}
              ${authHint ?? ""}
              ${insecureContextHint ?? ""}
              ${queryTokenHint ?? ""}
            </div>`
            : html`
                <div class="callout" style="margin-top: 14px">
                  ${t("overview.snapshot.channelsHint")}
                </div>
              `
        }
      </div>
    </section>

    <section class="grid grid-cols-3" style="margin-top: 18px;">
      <div class="card stat-card">
        <div class="stat-label">${t("overview.stats.instances")}</div>
        <div class="stat-value">${props.presenceCount}</div>
        <div class="muted">${t("overview.stats.instancesHint")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("overview.stats.sessions")}</div>
        <div class="stat-value">${props.sessionsCount ?? t("common.na")}</div>
        <div class="muted">${t("overview.stats.sessionsHint")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("overview.stats.cron")}</div>
        <div class="stat-value">
          ${props.cronEnabled == null ? t("common.na") : props.cronEnabled ? t("common.enabled") : t("common.disabled")}
        </div>
        <div class="muted">${t("overview.stats.cronNext", { time: formatNextRun(props.cronNext) })}</div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("overview.notes.title")}</div>
      <div class="card-sub">${t("overview.notes.subtitle")}</div>
      <div class="note-grid" style="margin-top: 14px;">
        <div>
          <div class="note-title">${t("overview.notes.tailscaleTitle")}</div>
          <div class="muted">
            ${t("overview.notes.tailscaleText")}
          </div>
        </div>
        <div>
          <div class="note-title">${t("overview.notes.sessionTitle")}</div>
          <div class="muted">${t("overview.notes.sessionText")}</div>
        </div>
        <div>
          <div class="note-title">${t("overview.notes.cronTitle")}</div>
          <div class="muted">${t("overview.notes.cronText")}</div>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">📂 系统工作空间设置</div>
      <div class="card-sub">所有智能助手的个人工作空间和群组工作空间均在此目录下自动创建</div>

      <div class="form-grid" style="margin-top: 16px;">
        <label class="field">
          <span>工作空间根目录</span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input
              style="flex: 1;"
              .value=${workspacesDirInput}
              @input=${(e: Event) => {
                workspacesDirInput = (e.target as HTMLInputElement).value;
              }}
              placeholder="例如: H:\\OpenClaw_Workspace"
            />
          </div>
        </label>
      </div>
      <div class="callout" style="margin-top: 12px; font-size: 12px;">
        📦 目录结构：
        <code style="display: block; margin-top: 6px; padding: 8px; background: var(--bg2, #f5f5f5); border-radius: 4px; font-family: monospace;">
          {workspacesDir}/<br/>
          &nbsp;&nbsp;{agentId}/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&larr; 个人助手工作空间<br/>
          &nbsp;&nbsp;groups/{groupId}/&nbsp;&larr; 群组工作空间
        </code>
      </div>

      <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 12px;">

        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <strong style="font-size: 13px; min-width: 80px;">⚙️ 修改</strong>
          <button
            class="btn btn-primary"
            ?disabled=${!props.connected}
            @click=${async () => {
              const newDir = workspacesDirInput.trim();
              if (!newDir) {
                alert("请输入工作空间目录");
                return;
              }
              if (newDir === props.workspacesDir) {
                alert("路径未变化");
                return;
              }
              try {
                await props.onWorkspacesDirSave(newDir);
                alert("✅ 配置已更新，不复制文件。如需迁移数据请使用「迁移」功能。");
              } catch (err) {
                alert("❌ 保存失败：" + (err instanceof Error ? err.message : String(err)));
              }
            }}
          >修改根目录</button>
          <span class="muted" style="font-size: 12px;">仅更新配置，不移动历史文件</span>
        </div>

        <div style="border-top: 1px solid var(--border, #e0e0e0); padding-top: 12px; display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
          <strong style="font-size: 13px; min-width: 80px; padding-top: 2px;">📦 备份</strong>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <button
                class="btn"
                ?disabled=${!props.connected}
                @click=${async () => {
                  if (!props.workspacesDir) {
                    alert("请先设置工作空间根目录");
                    return;
                  }
                  const customDir = prompt("备份目录（留空自动生成）:");
                  if (customDir === null) {
                    return;
                  }
                  try {
                    const result = await props.onWorkspaceBackup(customDir.trim() || undefined);
                    alert(
                      "✅ 备份完成！\n备份目录: " +
                        result.backupDir +
                        "\n已复制: " +
                        result.fileCount +
                        " 个文件",
                    );
                  } catch (err) {
                    alert("❌ 备份失败：" + (err instanceof Error ? err.message : String(err)));
                  }
                }}
              >备份工作空间</button>
              <span class="muted" style="font-size: 12px;">将整个工作空间复制到备份位置</span>
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border, #e0e0e0); padding-top: 12px; display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
          <strong style="font-size: 13px; min-width: 80px; padding-top: 2px;">🚚 迁移</strong>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="font-size: 12px; color: var(--fg2, #888);">将当前工作空间的所有文件复制到新目录，并更新所有 Agent + 群组配置路径。建议先备份。</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button
                class="btn"
                ?disabled=${!props.connected}
                @click=${async () => {
                  if (!props.workspacesDir) {
                    alert("请先设置当前工作空间根目录");
                    return;
                  }
                  const newRoot = prompt("新的工作空间目录:");
                  if (!newRoot || !newRoot.trim()) {
                    return;
                  }
                  if (
                    !confirm(
                      "确认将整个工作空间迁移到: " +
                        newRoot.trim() +
                        "\n\n这不会删除原目录。建议先备份。",
                    )
                  ) {
                    return;
                  }
                  try {
                    const result = await props.onWorkspaceMigrateAll(newRoot.trim());
                    alert(
                      "✅ 迁移完成！\n原目录: " +
                        result.oldRoot +
                        "\n新目录: " +
                        result.newRoot +
                        "\n已复制: " +
                        result.filesCopied +
                        " 个文件\n已更新 Agent: " +
                        result.agentsMigrated +
                        " 个",
                    );
                  } catch (err) {
                    alert("❌ 迁移失败：" + (err instanceof Error ? err.message : String(err)));
                  }
                }}
              >迁移工作空间</button>
              <span class="muted" style="font-size: 12px;">复制文件 + 更新配置路径</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  `;
}
