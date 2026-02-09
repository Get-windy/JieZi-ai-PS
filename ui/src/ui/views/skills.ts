import { html, nothing } from "lit";
import type { SkillMessageMap } from "../controllers/skills.js";
import type { SkillStatusEntry, SkillStatusReport } from "../types.js";
import { clampText } from "../format.js";
import { t } from "../i18n.js";

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

const SKILL_SOURCE_GROUPS: Array<{ id: string; label: () => string; sources: string[] }> = [
  { id: "workspace", label: () => t("skills.group.workspace"), sources: ["openclaw-workspace"] },
  { id: "built-in", label: () => t("skills.group.built_in"), sources: ["openclaw-bundled"] },
  { id: "installed", label: () => t("skills.group.installed"), sources: ["openclaw-managed"] },
  { id: "extra", label: () => t("skills.group.extra"), sources: ["openclaw-extra"] },
];

const builtInGroup = SKILL_SOURCE_GROUPS[1]; // built-in group

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) {
    groups.set(def.id, { id: def.id, label: def.label(), skills: [] });
  }
  const other: SkillGroup = { id: "other", label: t("skills.group.other"), skills: [] };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : SKILL_SOURCE_GROUPS.find((group) => group.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = SKILL_SOURCE_GROUPS.map((group) => groups.get(group.id)).filter(
    (group): group is SkillGroup => Boolean(group && group.skills.length > 0),
  );
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
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

export type SkillsProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
  // Advanced features
  advancedMode?: boolean;
  selectedSkills?: Set<string>;
  filterStatus?: "all" | "eligible" | "blocked" | "disabled";
  filterSource?: "all" | "workspace" | "built-in" | "installed" | "extra";
  onToggleAdvancedMode?: () => void;
  onSelectSkill?: (skillKey: string, selected: boolean) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onBatchEnable?: () => void;
  onBatchDisable?: () => void;
  onFilterStatusChange?: (status: "all" | "eligible" | "blocked" | "disabled") => void;
  onFilterSourceChange?: (source: "all" | "workspace" | "built-in" | "installed" | "extra") => void;
  onShowDependencies?: (skillKey: string) => void;
};

export function renderSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();
  let filtered = filter
    ? skills.filter((skill: any) =>
        [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter),
      )
    : skills;

  // Advanced filtering
  if (props.advancedMode && props.filterStatus && props.filterStatus !== "all") {
    filtered = filtered.filter((skill) => {
      if (props.filterStatus === "eligible") return skill.eligible && !skill.disabled;
      if (props.filterStatus === "blocked") return !skill.eligible;
      if (props.filterStatus === "disabled") return skill.disabled;
      return true;
    });
  }

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
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? t("skills.loading") : t("skills.refresh")}
          </button>
        </div>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="flex: 1;">
          <span>${t("skills.filter")}</span>
          <input
            .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder="${t("skills.filter.placeholder")}"
          />
        </label>
        <div class="muted">${t("skills.shown").replace("{count}", String(filtered.length))}</div>
      </div>

      ${
        props.advancedMode
          ? html`
            <div class="row" style="margin-top: 12px; gap: 12px; flex-wrap: wrap;">
              <label class="field" style="min-width: 150px;">
                <span>${t("skills.advanced.filter_status")}</span>
                <select
                  .value=${props.filterStatus || "all"}
                  @change=${(e: Event) =>
                    props.onFilterStatusChange?.((e.target as HTMLSelectElement).value as any)}
                >
                  <option value="all">${t("skills.advanced.status.all")}</option>
                  <option value="eligible">${t("skills.advanced.status.eligible")}</option>
                  <option value="blocked">${t("skills.advanced.status.blocked")}</option>
                  <option value="disabled">${t("skills.advanced.status.disabled")}</option>
                </select>
              </label>
              <label class="field" style="min-width: 150px;">
                <span>${t("skills.advanced.filter_source")}</span>
                <select
                  .value=${props.filterSource || "all"}
                  @change=${(e: Event) =>
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

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        filtered.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">${t("skills.no_skills")}</div>
            `
          : html`
            <div class="agent-skills-groups" style="margin-top: 16px;">
              ${groups.map((group) => {
                const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
                return html`
                  <details class="agent-skills-group" ?open=${!collapsedByDefault}>
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
  `;
}

function renderSkill(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const apiKey = props.edits[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const showBundledBadge = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
  const isSelected = props.selectedSkills?.has(skill.skillKey) ?? false;
  const missing = [
    ...skill.missing.bins.map((b: string) => `bin:${b}`),
    ...skill.missing.env.map((e: string) => `env:${e}`),
    ...skill.missing.config.map((c: string) => `config:${c}`),
    ...skill.missing.os.map((o: string) => `os:${o}`),
  ];
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push(t("skills.reason.disabled"));
  }
  if (skill.blockedByAllowlist) {
    reasons.push(t("skills.reason.blocked_by_allowlist"));
  }
  return html`
    <div class="list-item" style="${props.advancedMode ? "border-left: 3px solid " + (isSelected ? "var(--primary-color, #0066cc)" : "transparent") + ";" : ""}">
      ${
        props.advancedMode
          ? html`
            <label class="row" style="align-items: flex-start; margin-right: 12px;">
              <input
                type="checkbox"
                .checked=${isSelected}
                @change=${(e: Event) =>
                  props.onSelectSkill?.(skill.skillKey, (e.target as HTMLInputElement).checked)}
                style="margin-top: 4px;"
              />
            </label>
          `
          : nothing
      }
      <div class="list-main">
        <div class="list-title">
          ${skill.emoji ? `${skill.emoji} ` : ""}${skill.name}
        </div>
        <div class="list-sub">${clampText(translateSkillDescription(skill), 140)}</div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${skill.source}</span>
          ${
            showBundledBadge
              ? html`
                  <span class="chip">bundled</span>
                `
              : nothing
          }
          <span class="chip ${skill.eligible ? "chip-ok" : "chip-warn"}">
            ${skill.eligible ? t("skills.status.eligible") : t("skills.status.blocked")}
          </span>
          ${
            skill.disabled
              ? html`
                  <span class="chip chip-warn">${t("skills.status.disabled")}</span>
                `
              : nothing
          }
        </div>
        ${
          missing.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                ${t("skills.missing").replace("{items}", missing.join(", "))}
              </div>
            `
            : nothing
        }
        ${
          reasons.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                ${t("skills.reason").replace("{reasons}", reasons.join(", "))}
              </div>
            `
            : nothing
        }
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; flex-wrap: wrap;">
          <button
            class="btn"
            ?disabled=${busy}
            @click=${() => props.onToggle(skill.skillKey, skill.disabled)}
          >
            ${skill.disabled ? t("skills.button.enable") : t("skills.button.disable")}
          </button>
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
            ? html`<div
              class="muted"
              style="margin-top: 8px; color: ${
                message.kind === "error"
                  ? "var(--danger-color, #d14343)"
                  : "var(--success-color, #0a7f5a)"
              };"
            >
              ${message.message}
            </div>`
            : nothing
        }
        ${
          skill.primaryEnv
            ? html`
              <div class="field" style="margin-top: 10px;">
                <span>${t("skills.api_key")}</span>
                <input
                  type="password"
                  .value=${apiKey}
                  @input=${(e: Event) =>
                    props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
                />
              </div>
              <button
                class="btn primary"
                style="margin-top: 8px;"
                ?disabled=${busy}
                @click=${() => props.onSaveKey(skill.skillKey)}
              >
                ${t("skills.button.save_key")}
              </button>
            `
            : nothing
        }
      </div>
    </div>
  `;
}
