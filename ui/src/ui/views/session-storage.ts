import { html, nothing } from "lit";
import { t } from "../i18n.js";
import { renderStorageBrowser, type StorageBrowserProps } from "./storage-browser.js";

export type SessionStorageProps = {
  connected: boolean;
  currentPath: string | null;
  newPath: string;
  loading: boolean;
  migrating: boolean;
  error: string | null;
  success: string | null;
  showBrowser: boolean;
  browserProps: StorageBrowserProps | null;
  onNewPathChange: (path: string) => void;
  onBrowse: () => void;
  onValidate: () => void;
  onMigrate: (moveFiles: boolean) => void;
  onRefreshCurrentPath: () => void;
};

export function renderSessionStorage(props: SessionStorageProps) {
  const isValidPath = props.newPath.trim().length > 0;
  const isDifferentPath = props.newPath.trim() !== props.currentPath;

  return html`
    <div class="card">
      <div class="card-title">${t("storage.title")}</div>
      <div class="card-sub">${t("storage.subtitle")}</div>

      ${
        !props.connected
          ? html`
            <div class="callout warn" style="margin-top: 16px;">
              ${t("storage.connect_first")}
            </div>
          `
          : html`
            <div class="form-grid" style="margin-top: 16px;">
              <div class="field">
                <label class="form-label">${t("storage.current_path")}</label>
                <div class="row" style="gap: 8px;">
                  <input
                    type="text"
                    class="form-control"
                    .value=${props.currentPath ?? t("storage.loading")}
                    readonly
                    style="flex: 1;"
                  />
                  <button
                    class="btn btn--sm"
                    @click=${props.onRefreshCurrentPath}
                    ?disabled=${props.loading}
                  >
                    ${t("storage.refresh")}
                  </button>
                </div>
              </div>

              <div class="field">
                <label class="form-label">${t("storage.new_path")}</label>
                <div class="row" style="gap: 8px;">
                  <input
                    type="text"
                    class="form-control"
                    .value=${props.newPath}
                    @input=${(e: Event) =>
                      props.onNewPathChange((e.target as HTMLInputElement).value)}
                    placeholder=${t("storage.new_path_placeholder")}
                    style="flex: 1;"
                  />
                  <button
                    class="btn btn--sm"
                    @click=${props.onBrowse}
                    ?disabled=${props.loading}
                  >
                    ${t("storage.browse")}
                  </button>
                  <button
                    class="btn btn--sm"
                    @click=${props.onValidate}
                    ?disabled=${props.loading || !isValidPath}
                  >
                    ${t("storage.validate")}
                  </button>
                </div>
                <small class="form-text muted">
                  ${t("storage.new_path_help")}
                </small>
              </div>
            </div>

            ${
              props.error
                ? html`
                  <div class="callout danger" style="margin-top: 12px;">
                    ${props.error}
                  </div>
                `
                : nothing
            }
            ${
              props.success
                ? html`
                  <div class="callout success" style="margin-top: 12px;">
                    ${props.success}
                  </div>
                `
                : nothing
            }

            <div class="row" style="margin-top: 14px; gap: 8px;">
              <button
                class="btn"
                @click=${() => props.onMigrate(false)}
                ?disabled=${props.migrating || !isValidPath || !isDifferentPath}
                title=${t("storage.copy_hint")}
              >
                ${props.migrating ? t("storage.migrating") : t("storage.copy")}
              </button>
              <button
                class="btn btn--danger"
                @click=${() => props.onMigrate(true)}
                ?disabled=${props.migrating || !isValidPath || !isDifferentPath}
                title=${t("storage.move_hint")}
              >
                ${props.migrating ? t("storage.migrating") : t("storage.move")}
              </button>
              <span class="muted">
                ${props.migrating ? t("storage.migrate_wait") : t("storage.migrate_note")}
              </span>
            </div>
          `
      }

      ${
        props.showBrowser && props.browserProps
          ? html`
            <div class="storage-browser-overlay">
              ${renderStorageBrowser(props.browserProps)}
            </div>
          `
          : nothing
      }
    </div>
  `;
}
