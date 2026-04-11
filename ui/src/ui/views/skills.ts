import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import type {
  ClawHubSearchResult,
  ClawHubSkillDetail,
  SkillMessageMap,
} from "../controllers/skills.js";
import { clampText } from "../format.js";
import { t } from "../i18n.js";
import { resolveSafeExternalUrl } from "../open-external-url.js";
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.js";
import type { SkillStatusEntry, SkillStatusReport } from "../types.js";
import { groupSkills } from "./skills-grouping.js";
import {
  computeSkillMissing,
  computeSkillReasons,
  renderSkillStatusChips,
} from "./skills-shared.js";

function safeExternalHref(raw?: string): string | null {
  if (!raw) {
    return null;
  }
  return resolveSafeExternalUrl(raw, window.location.href);
}

/**
 * Translate skill description.
 * For built-in skills (openclaw-bundled) and installed skills (openclaw-managed),
 * check if translation exists.
 * For other skills, return original description.
 */
function translateSkillDescription(skill: SkillStatusEntry): string {
  // Translate built-in and installed skills
  if (skill.source !== "openclaw-bundled" && skill.source !== "openclaw-managed") {
    return skill.description;
  }

  const translationKey = `skill.desc.${skill.name}`;
  const translated = t(translationKey);

  // If translation exists and is different from the key, use it
  if (translated !== translationKey) {
    return translated;
  }

  // Fall back to original description
  return skill.description;
}

export type SkillsStatusFilter = "all" | "ready" | "needs-setup" | "disabled";

export type SkillsProps = {
  connected: boolean;
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  statusFilter: SkillsStatusFilter;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  detailKey: string | null;
  clawhubQuery: string;
  clawhubResults: ClawHubSearchResult[] | null;
  clawhubSearchLoading: boolean;
  clawhubSearchError: string | null;
  clawhubDetail: ClawHubSkillDetail | null;
  clawhubDetailSlug: string | null;
  clawhubDetailLoading: boolean;
  clawhubDetailError: string | null;
  clawhubInstallSlug: string | null;
  clawhubInstallMessage: { kind: "success" | "error"; text: string } | null;
  onFilterChange: (next: string) => void;
  onStatusFilterChange: (next: SkillsStatusFilter) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
  onDetailOpen: (skillKey: string) => void;
  onDetailClose: () => void;
  onClawHubQueryChange: (query: string) => void;
  onClawHubDetailOpen: (slug: string) => void;
  onClawHubDetailClose: () => void;
  onClawHubInstall: (slug: string) => void;
  // Advanced features (local-only)
  advancedMode?: boolean;
  selectedSkills?: Set<string>;
  filterSource?: "all" | "workspace" | "built-in" | "installed" | "extra";
  onToggleAdvancedMode?: () => void;
  onSelectSkill?: (skillKey: string, selected: boolean) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onBatchEnable?: () => void;
  onBatchDisable?: () => void;
  onFilterSourceChange?: (source: "all" | "workspace" | "built-in" | "installed" | "extra") => void;
  onShowDependencies?: (skillKey: string) => void;
};

type StatusTabDef = { id: SkillsStatusFilter; label: string };

const STATUS_TABS: StatusTabDef[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "needs-setup", label: "Needs Setup" },
  { id: "disabled", label: "Disabled" },
];

function skillMatchesStatus(skill: SkillStatusEntry, status: SkillsStatusFilter): boolean {
  switch (status) {
    case "all":
      return true;
    case "ready":
      return !skill.disabled && skill.eligible;
    case "needs-setup":
      return !skill.disabled && !skill.eligible;
    case "disabled":
      return skill.disabled;
  }
}

function skillStatusClass(skill: SkillStatusEntry): string {
  if (skill.disabled) {
    return "muted";
  }
  return skill.eligible ? "ok" : "warn";
}

export function renderSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];

  const statusCounts: Record<SkillsStatusFilter, number> = {
    all: skills.length,
    ready: 0,
    "needs-setup": 0,
    disabled: 0,
  };
  for (const s of skills) {
    if (s.disabled) {
      statusCounts.disabled++;
    } else if (s.eligible) {
      statusCounts.ready++;
    } else {
      statusCounts["needs-setup"]++;
    }
  }

  const afterStatus =
    props.statusFilter === "all"
      ? skills
      : skills.filter((s) => skillMatchesStatus(s, props.statusFilter));

  const filterText = normalizeLowercaseStringOrEmpty(props.filter);
  let filtered = filterText
    ? afterStatus.filter((skill) =>
        normalizeLowercaseStringOrEmpty(
          [skill.name, skill.description, skill.source].join(" "),
        ).includes(filterText),
      )
    : afterStatus;

  // Advanced source filtering (local-only)
  if (props.advancedMode && props.filterSource && props.filterSource !== "all") {
    filtered = filtered.filter((skill) => {
      const sourceMap: Record<string, string[]> = {
        workspace: ["openclaw-workspace"],
        "built-in": ["openclaw-bundled"],
        installed: ["openclaw-managed"],
        extra: ["openclaw-extra"],
      };
      const sources = sourceMap[props.filterSource!] || [];
      return skill.bundled && props.filterSource === "built-in"
        ? true
        : sources.includes(skill.source);
    });
  }

  const groups = groupSkills(filtered);
  const selectedCount = props.selectedSkills?.size ?? 0;

  const detailSkill = props.detailKey
    ? (skills.find((s) => s.skillKey === props.detailKey) ?? null)
    : null;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("skills.title")}</div>
          <div class="card-sub">${t("skills.subtitle")}</div>
        </div>
        <div class="row" style="gap: 8px;">
          ${
            props.advancedMode
              ? html`
                <button
                  class="btn"
                  ?disabled=${props.loading}
                  @click=${props.onToggleAdvancedMode}
                >
                  ${t("skills.advanced.exit")}
                </button>
              `
              : html`
                <button
                  class="btn"
                  ?disabled=${props.loading}
                  @click=${props.onToggleAdvancedMode}
                >
                  ${t("skills.advanced.enter")}
                </button>
              `
          }
          <button
            class="btn"
            ?disabled=${props.loading || !props.connected}
            @click=${props.onRefresh}
          >
            ${props.loading ? t("skills.loading") : t("skills.refresh")}
          </button>
        </div>
      </div>

      <div class="agent-tabs" style="margin-top: 14px;">
        ${STATUS_TABS.map(
          (tab) => html`
            <button
              class="agent-tab ${props.statusFilter === tab.id ? "active" : ""}"
              @click=${() => props.onStatusFilterChange(tab.id)}
            >
              ${tab.label}<span class="agent-tab-count">${statusCounts[tab.id]}</span>
            </button>
          `,
        )}
      </div>

      <div
        class="filters"
        style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px;"
      >
        <label class="field" style="flex: 1; min-width: 180px;">
          <input
            .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder="${t("skills.filter.placeholder")}"
            autocomplete="off"
            name="skills-filter"
          />
        </label>
        <div class="muted">${t("skills.shown").replace("{count}", String(filtered.length))}</div>
      </div>

      ${
        props.advancedMode
          ? html`
            <div class="row" style="margin-top: 12px; gap: 12px; flex-wrap: wrap;">
              <label class="field" style="min-width: 150px;">
                <span>${t("skills.advanced.filter_source")}</span>
                <select
                  .value=${props.filterSource || "all"}
                  @change=${(e: Event) =>
                    // oxlint-disable-next-line typescript/no-explicit-any
                    props.onFilterSourceChange?.((e.target as HTMLSelectElement).value as any)}
                >
                  <option value="all">${t("skills.advanced.source.all")}</option>
                  <option value="workspace">${t("skills.advanced.source.workspace")}</option>
                  <option value="built-in">${t("skills.advanced.source.built_in")}</option>
                  <option value="installed">${t("skills.advanced.source.installed")}</option>
                  <option value="extra">${t("skills.advanced.source.extra")}</option>
                </select>
              </label>
            </div>
            <div class="row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap;">
              <button
                class="btn"
                ?disabled=${props.loading || filtered.length === 0}
                @click=${props.onSelectAll}
              >
                ${t("skills.advanced.select_all")}
              </button>
              <button
                class="btn"
                ?disabled=${props.loading || selectedCount === 0}
                @click=${props.onDeselectAll}
              >
                ${t("skills.advanced.deselect_all")}
              </button>
              <button
                class="btn primary"
                ?disabled=${props.loading || selectedCount === 0}
                @click=${props.onBatchEnable}
              >
                ${t("skills.advanced.batch_enable")} (${selectedCount})
              </button>
              <button
                class="btn"
                ?disabled=${props.loading || selectedCount === 0}
                @click=${props.onBatchDisable}
              >
                ${t("skills.advanced.batch_disable")} (${selectedCount})
              </button>
            </div>
          `
          : nothing
      }

      <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <div style="font-weight: 600;">ClawHub</div>
          <div class="muted" style="font-size: 13px;">
            ${t("skills.clawhub.subtitle")}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <label class="field" style="flex: 1; min-width: 180px;">
            <input
              .value=${props.clawhubQuery}
              @input=${(e: Event) =>
                props.onClawHubQueryChange((e.target as HTMLInputElement).value)}
              placeholder="${t("skills.clawhub.search.placeholder")}"
              autocomplete="off"
              name="clawhub-search"
            />
          </label>
          ${props.clawhubSearchLoading ? html`<span class="muted">${t("skills.clawhub.searching")}</span>` : nothing}
        </div>
        ${
          props.clawhubSearchError
            ? html`<div class="callout danger" style="margin-top: 8px;">
              ${props.clawhubSearchError}
            </div>`
            : nothing
        }
        ${
          props.clawhubInstallMessage
            ? html`<div
              class="callout ${props.clawhubInstallMessage.kind === "error" ? "danger" : "success"}"
              style="margin-top: 8px;"
            >
              ${props.clawhubInstallMessage.text}
            </div>`
            : nothing
        }
        ${renderClawHubResults(props)}
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        filtered.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">
                ${
                  !props.connected && !props.report
                    ? t("skills.not_connected")
                    : t("skills.no_skills")
                }
              </div>
            `
          : html`
            <div class="agent-skills-groups" style="margin-top: 16px;">
              ${groups.map((group) => {
                return html`
                  <details class="agent-skills-group" open>
                    <summary class="agent-skills-header">
                      <span>${group.label}</span>
                      <span class="muted">${group.skills.length}</span>
                    </summary>
                    <div class="list skills-grid">
                      ${group.skills.map((skill) => renderSkill(skill, props))}
                    </div>
                  </details>
                `;
              })}
            </div>
          `
      }
    </section>

    ${detailSkill ? renderSkillDetail(detailSkill, props) : nothing}
    ${props.clawhubDetailSlug ? renderClawHubDetailDialog(props) : nothing}
  `;
}

function renderClawHubResults(props: SkillsProps) {
  const results = props.clawhubResults;
  if (!results) {
    return nothing;
  }
  if (results.length === 0) {
    return html`<div class="muted" style="margin-top: 8px;">${t("skills.clawhub.no_results")}</div>`;
  }
  return html`
    <div class="list" style="margin-top: 8px;">
      ${results.map(
        (r) => html`
          <div
            class="list-item list-item-clickable"
            @click=${() => props.onClawHubDetailOpen(r.slug)}
          >
            <div class="list-main">
              <div class="list-title">${r.displayName}</div>
              <div class="list-sub">${r.summary ? clampText(r.summary, 120) : r.slug}</div>
            </div>
            <div class="list-meta" style="display: flex; align-items: center; gap: 8px;">
              ${
                r.version
                  ? html`<span class="muted" style="font-size: 12px;">v${r.version}</span>`
                  : nothing
              }
              <button
                class="btn btn--sm"
                ?disabled=${props.clawhubInstallSlug !== null}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  props.onClawHubInstall(r.slug);
                }}
              >
                ${props.clawhubInstallSlug === r.slug ? t("skills.clawhub.installing") : t("skills.clawhub.install")}
              </button>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderClawHubDetailDialog(props: SkillsProps) {
  const detail = props.clawhubDetail;
  const ensureModalOpen = (el?: Element) => {
    if (!(el instanceof HTMLDialogElement) || el.open) {
      return;
    }
    el.showModal();
  };

  return html`
    <dialog
      class="md-preview-dialog"
      ${ref(ensureModalOpen)}
      @click=${(e: Event) => {
        const dialog = e.currentTarget as HTMLDialogElement;
        if (e.target === dialog) {
          dialog.close();
        }
      }}
      @close=${props.onClawHubDetailClose}
    >
      <div class="md-preview-dialog__panel">
        <div class="md-preview-dialog__header">
          <div class="md-preview-dialog__title">
            ${detail?.skill?.displayName ?? props.clawhubDetailSlug}
          </div>
          <button
            class="btn btn--sm"
            @click=${(e: Event) => {
              (e.currentTarget as HTMLElement).closest("dialog")?.close();
            }}
          >
            ${t("skills.dialog.close")}
          </button>
        </div>
        <div class="md-preview-dialog__body" style="display: grid; gap: 16px;">
          ${
            props.clawhubDetailLoading
              ? html`<div class="muted">${t("common.loading")}</div>`
              : props.clawhubDetailError
                ? html`<div class="callout danger">${props.clawhubDetailError}</div>`
                : detail?.skill
                  ? html`
                    <div style="font-size: 14px; line-height: 1.5;">
                      ${detail.skill.summary ?? ""}
                    </div>
                    ${
                      detail.owner?.displayName
                        ? html`<div class="muted" style="font-size: 13px;">
                          ${t("skills.clawhub.by")}
                          ${detail.owner.displayName}${
                            detail.owner.handle ? html` (@${detail.owner.handle})` : nothing
                          }
                        </div>`
                        : nothing
                    }
                    ${
                      detail.latestVersion
                        ? html`<div class="muted" style="font-size: 13px;">
                          ${t("skills.clawhub.latest")}: v${detail.latestVersion.version}
                        </div>`
                        : nothing
                    }
                    ${
                      detail.latestVersion?.changelog
                        ? html`<div
                          style="font-size: 13px; border-top: 1px solid var(--border); padding-top: 12px; white-space: pre-wrap;"
                        >
                          ${detail.latestVersion.changelog}
                        </div>`
                        : nothing
                    }
                    ${
                      detail.metadata?.os
                        ? html`<div class="muted" style="font-size: 12px;">
                          ${t("skills.clawhub.platforms")}: ${detail.metadata.os.join(", ")}
                        </div>`
                        : nothing
                    }
                    <button
                      class="btn primary"
                      ?disabled=${props.clawhubInstallSlug !== null}
                      @click=${() => {
                        if (props.clawhubDetailSlug) {
                          props.onClawHubInstall(props.clawhubDetailSlug);
                        }
                      }}
                    >
                      ${
                        props.clawhubInstallSlug === props.clawhubDetailSlug
                          ? t("skills.clawhub.installing")
                          : `${t("skills.clawhub.install")} ${detail.skill.displayName}`
                      }
                    </button>
                  `
                  : html`<div class="muted">${t("skills.clawhub.not_found")}</div>`
          }
        </div>
      </div>
    </dialog>
  `;
}

function renderSkill(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const isSelected = props.selectedSkills?.has(skill.skillKey) ?? false;

  return html`
    <div
      class="list-item list-item-clickable"
      style="${props.advancedMode ? "border-left: 3px solid " + (isSelected ? "var(--primary-color, #0066cc)" : "transparent") + ";" : ""}"
      @click=${() => !props.advancedMode && props.onDetailOpen(skill.skillKey)}
    >
      ${
        props.advancedMode
          ? html`
          <label class="row" style="align-items: flex-start; margin-right: 12px;" @click=${(e: Event) => e.stopPropagation()}>
            <input
              type="checkbox"
              .checked=${isSelected}
              ?disabled=${busy}
              @change=${(e: Event) => {
                e.stopPropagation();
                props.onSelectSkill?.(skill.skillKey, (e.target as HTMLInputElement).checked);
              }}
              style="margin-top: 4px;"
            />
          </label>
        `
          : nothing
      }
      <div class="list-main">
        <div class="list-title" style="display: flex; align-items: center; gap: 8px;">
          <span class="statusDot ${skillStatusClass(skill)}"></span>
          ${skill.emoji ? html`<span>${skill.emoji}</span>` : nothing}
          <span>${skill.name}</span>
        </div>
        <div class="list-sub">${clampText(translateSkillDescription(skill), 140)}</div>
      </div>
      <div
        class="list-meta"
        style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;"
      >
        <label class="skill-toggle-wrap" @click=${(e: Event) => e.stopPropagation()}>
          <input
            type="checkbox"
            class="skill-toggle"
            .checked=${!skill.disabled}
            ?disabled=${busy}
            @change=${(e: Event) => {
              e.stopPropagation();
              props.onToggle(skill.skillKey, skill.disabled);
            }}
          />
        </label>
      </div>
    </div>
  `;
}

function renderSkillDetail(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const apiKey = props.edits[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const showBundledBadge = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
  const missing = computeSkillMissing(skill);
  const reasons = computeSkillReasons(skill);
  const ensureModalOpen = (el?: Element) => {
    if (!(el instanceof HTMLDialogElement) || el.open) {
      return;
    }
    el.showModal();
  };

  return html`
    <dialog
      class="md-preview-dialog"
      ${ref(ensureModalOpen)}
      @click=${(e: Event) => {
        const dialog = e.currentTarget as HTMLDialogElement;
        if (e.target === dialog) {
          dialog.close();
        }
      }}
      @close=${props.onDetailClose}
    >
      <div class="md-preview-dialog__panel">
        <div class="md-preview-dialog__header">
          <div
            class="md-preview-dialog__title"
            style="display: flex; align-items: center; gap: 8px;"
          >
            <span class="statusDot ${skillStatusClass(skill)}"></span>
            ${skill.emoji ? html`<span style="font-size: 18px;">${skill.emoji}</span>` : nothing}
            <span>${skill.name}</span>
          </div>
          <button
            class="btn btn--sm"
            @click=${(e: Event) => {
              (e.currentTarget as HTMLElement).closest("dialog")?.close();
            }}
          >
            ${t("skills.dialog.close")}
          </button>
        </div>
        <div class="md-preview-dialog__body" style="display: grid; gap: 16px;">
          <div>
            <div style="font-size: 14px; line-height: 1.5; color: var(--text);">
              ${translateSkillDescription(skill)}
            </div>
            ${renderSkillStatusChips({ skill, showBundledBadge })}
          </div>

          ${
            missing.length > 0
              ? html`
                <div
                  class="callout"
                  style="border-color: var(--warn-subtle); background: var(--warn-subtle); color: var(--warn);"
                >
                  <div style="font-weight: 600; margin-bottom: 4px;">${t("skills.missing.title")}</div>
                  <div>${missing.join(", ")}</div>
                </div>
              `
              : nothing
          }
          ${
            reasons.length > 0
              ? html`
                <div class="muted" style="font-size: 13px;">${t("skills.reason.label")}: ${reasons.join(", ")}</div>
              `
              : nothing
          }

          <div style="display: flex; align-items: center; gap: 12px;">
            <label class="skill-toggle-wrap">
              <input
                type="checkbox"
                class="skill-toggle"
                .checked=${!skill.disabled}
                ?disabled=${busy}
                @change=${() => props.onToggle(skill.skillKey, skill.disabled)}
              />
            </label>
            <span style="font-size: 13px; font-weight: 500;">
              ${skill.disabled ? t("skills.button.enable") : t("skills.button.disable")}
            </span>
            ${
              canInstall
                ? html`<button
                  class="btn"
                  ?disabled=${busy}
                  @click=${() => props.onInstall(skill.skillKey, skill.name, skill.install[0].id)}
                >
                  ${busy ? t("skills.button.installing") : skill.install[0].label}
                </button>`
                : nothing
            }
          </div>

          ${
            message
              ? html`<div class="callout ${message.kind === "error" ? "danger" : "success"}">
                ${message.message}
              </div>`
              : nothing
          }
          ${
            skill.primaryEnv
              ? html`
                <div style="display: grid; gap: 8px;">
                  <div class="field">
                    <span
                      >${t("skills.api_key")}
                      <span class="muted" style="font-weight: normal; font-size: 0.88em;"
                        >(${skill.primaryEnv})</span
                      ></span
                    >
                    <input
                      type="password"
                      .value=${apiKey}
                      @input=${(e: Event) =>
                        props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  ${(() => {
                    const href = safeExternalHref(skill.homepage);
                    return href
                      ? html`<div class="muted" style="font-size: 13px;">
                          ${t("skills.api_key.get")}:
                          <a href="${href}" target="_blank" rel="noopener noreferrer"
                            >${skill.homepage}</a
                          >
                        </div>`
                      : nothing;
                  })()}
                  <button
                    class="btn primary"
                    ?disabled=${busy}
                    @click=${() => props.onSaveKey(skill.skillKey)}
                  >
                    ${t("skills.button.save_key")}
                  </button>
                </div>
              `
              : nothing
          }

          <div
            style="border-top: 1px solid var(--border); padding-top: 12px; display: grid; gap: 6px; font-size: 12px; color: var(--muted);"
          >
            <div><span style="font-weight: 600;">${t("skills.source.label")}:</span> ${skill.source}</div>
            <div style="font-family: var(--mono); word-break: break-all;">${skill.filePath}</div>
            ${(() => {
              const safeHref = safeExternalHref(skill.homepage);
              return safeHref
                ? html`<div>
                    <a href="${safeHref}" target="_blank" rel="noopener noreferrer"
                      >${skill.homepage}</a
                    >
                  </div>`
                : nothing;
            })()}
          </div>
        </div>
      </div>
    </dialog>
  `;
}
