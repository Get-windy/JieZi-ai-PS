import { html, nothing } from "lit";
import { t } from "../i18n.js";

export type StorageBrowserProps = {
  currentPath: string;
  parentPath: string | null;
  directories: { name: string; path: string }[];
  drives: { path: string; label: string; type: string }[];
  loading: boolean;
  error: string | null;
  onNavigate: (path: string) => void;
  onSelect: (path: string) => void;
  onCancel: () => void;
};

export function renderStorageBrowser(props: StorageBrowserProps) {
  return html`
    <div class="storage-browser">
      <div class="storage-browser-header">
        <div class="storage-browser-title">${t("storage.browser.title")}</div>
        <div class="storage-browser-current-path">${props.currentPath}</div>
      </div>

      ${
        props.error
          ? html`
            <div class="callout danger" style="margin: 12px 0;">
              ${props.error}
            </div>
          `
          : nothing
      }

      <div class="storage-browser-content">
        ${
          props.loading
            ? html`<div class="loading-spinner">${t("storage.browser.loading")}</div>`
            : html`
              <div class="storage-browser-list">
                ${
                  props.drives.length > 0
                    ? html`
                      <div class="storage-browser-section">
                        <div class="storage-browser-section-title">${t("storage.browser.drives")}</div>
                        ${props.drives.map(
                          (drive) => html`
                            <div
                              class="storage-browser-item"
                              @click=${() => props.onNavigate(drive.path)}
                            >
                              <span class="storage-browser-item-icon">💾</span>
                              <span class="storage-browser-item-label">${drive.label}</span>
                            </div>
                          `,
                        )}
                      </div>
                    `
                    : nothing
                }

                ${
                  props.parentPath
                    ? html`
                      <div
                        class="storage-browser-item storage-browser-item--parent"
                        @click=${() => props.onNavigate(props.parentPath!)}
                      >
                        <span class="storage-browser-item-icon">⬆️</span>
                        <span class="storage-browser-item-label">${t("storage.browser.parent")}</span>
                      </div>
                    `
                    : nothing
                }

                ${
                  props.directories.length === 0 && !props.parentPath
                    ? html`<div class="muted">${t("storage.browser.empty")}</div>`
                    : props.directories.map(
                        (dir) => html`
                        <div
                          class="storage-browser-item"
                          @click=${() => props.onNavigate(dir.path)}
                        >
                          <span class="storage-browser-item-icon">📁</span>
                          <span class="storage-browser-item-label">${dir.name}</span>
                        </div>
                      `,
                      )
                }
              </div>
            `
        }
      </div>

      <div class="storage-browser-footer">
        <button class="btn" @click=${() => props.onCancel()}>${t("storage.browser.cancel")}</button>
        <button class="btn btn--primary" @click=${() => props.onSelect(props.currentPath)}>
          ${t("storage.browser.select")}
        </button>
      </div>
    </div>
  `;
}
