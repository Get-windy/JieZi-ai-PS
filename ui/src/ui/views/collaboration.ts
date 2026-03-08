import { html } from "lit";
import { t } from "../i18n.ts";
import { renderFriendsView, type FriendsProps } from "./friends.ts";
import { renderGroups, type GroupsProps } from "./groups.ts";
import { renderMonitorView, type MonitorProps } from "./monitor.ts";
import { renderScenariosView, type ScenariosProps } from "./scenarios.ts";

/**
 * Collaboration 协作管理页面
 *
 * 包含四个子面板：
 * - Groups: 群组管理
 * - Friends: 好友关系
 * - Monitor: 协作监控
 * - Scenarios: 协作场景
 */

export type CollaborationPanel = "groups" | "friends" | "monitor" | "scenarios";

export type CollaborationProps = {
  activePanel: CollaborationPanel;
  onSelectPanel: (panel: CollaborationPanel) => void;

  // Groups 群组管理 Props
  groupsProps: GroupsProps;

  // Friends 好友关系 Props
  friendsProps: FriendsProps;

  // Monitor 协作监控 Props
  monitorProps: MonitorProps;

  // Scenarios 协作场景 Props
  scenariosProps: ScenariosProps;
};

export function renderCollaboration(props: CollaborationProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("tab.collaboration")}</div>
          <div class="card-sub">${t("tab.collaboration.subtitle")}</div>
        </div>
      </div>

      ${renderCollaborationTabs(props.activePanel, props.onSelectPanel)}

      <div style="margin-top: 16px;">
        ${
          props.activePanel === "groups"
            ? renderGroups(props.groupsProps)
            : props.activePanel === "friends"
              ? renderFriendsView(props.friendsProps)
              : props.activePanel === "monitor"
                ? renderMonitorView(props.monitorProps)
                : renderScenariosView(props.scenariosProps)
        }
      </div>
    </section>
  `;
}

function renderCollaborationTabs(
  active: CollaborationPanel,
  onSelect: (panel: CollaborationPanel) => void,
) {
  const tabs = [
    { id: "groups" as const, label: "群组管理", icon: "👥" },
    { id: "friends" as const, label: "直接会话", icon: "💬" },
    { id: "monitor" as const, label: "协作监控", icon: "📊" },
    { id: "scenarios" as const, label: "协作场景", icon: "🎯" },
  ];

  return html`
    <div class="agent-tabs" style="margin-top: 16px;">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            <span style="margin-right: 6px;">${tab.icon}</span>
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}
