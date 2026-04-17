/**
 * Chat Participants Panel — Discord Members Panel 风格
 *
 * 在群组 / dept-room 聊天右上角显示参与者折叠面板。
 * - 每个 Agent 显示颜色 dot + 名称 + emoji
 * - 人类用户固定显示在顶部
 * - 支持 active/idle/offline 三种状态（由外部传入 activeIds）
 * - 点击面板 toggle 按钮折叠/展开
 *
 * 设计参考：Discord Members Panel + AutoGen Studio Agent Card
 */

import { html, nothing } from "lit";
import type { AgentsListResult, ChatConversationContext } from "../types.ts";

// ── Palette: 与 grouped-render.ts 中 GROUP_SENDER_PALETTE_RGB 完全一致 ─────
const PALETTE_RGB = [
  "37,99,235", // blue
  "217,119,6", // amber
  "22,163,74", // green
  "147,51,234", // purple
  "225,29,72", // rose
  "13,148,136", // teal
  "234,88,12", // orange
  "6,182,212", // cyan
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

function getSenderRgb(id: string): string {
  return PALETTE_RGB[hashString(id) % PALETTE_RGB.length];
}

export type ParticipantStatus = "active" | "idle" | "offline";

export type ParticipantInfo = {
  id: string;
  name: string;
  emoji?: string;
  isUser?: boolean;
  status?: ParticipantStatus;
};

/** 从消息列表中提取已出现的 sender id（群聊快速去重） */
export function extractActiveSenderIds(messages: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const m of messages) {
    const msg = m as Record<string, unknown>;
    const sid = msg.__group_sender_id;
    if (typeof sid === "string") {
      ids.add(sid);
    }
    const interagent = msg.__interagent as Record<string, unknown> | undefined;
    if (typeof interagent?.senderId === "string") {
      ids.add(interagent.senderId);
    }
    const prov = msg.provenance as Record<string, unknown> | undefined;
    if (prov?.kind === "inter_session" && typeof prov.sourceSessionKey === "string") {
      const parts = prov.sourceSessionKey.split(":");
      if (parts[0] === "agent" && parts.length >= 2) {
        ids.add(parts[1]);
      }
    }
  }
  return ids;
}

/** 从 context 和 agentsList 构建参与者列表 */
export function buildParticipants(
  context: ChatConversationContext | null,
  agentsList: AgentsListResult | null | undefined,
): ParticipantInfo[] {
  const participants: ParticipantInfo[] = [];

  // 人类用户永远在首位
  participants.push({ id: "user", name: "我", emoji: "👤", isUser: true });

  if (!agentsList?.agents) {
    return participants;
  }

  // dept-room: 使用 memberAgentIds 筛选
  if (context?.type === "dept-room" && context.memberAgentIds) {
    const memberIds = new Set(context.memberAgentIds);
    for (const agent of agentsList.agents) {
      if (memberIds.has(agent.id)) {
        participants.push({
          id: agent.id,
          name: agent.identity?.name || agent.name || agent.id,
          emoji: agent.identity?.emoji,
        });
      }
    }
    return participants;
  }

  // group context: 所有 agents
  if (context?.type === "group") {
    for (const agent of agentsList.agents) {
      participants.push({
        id: agent.id,
        name: agent.identity?.name || agent.name || agent.id,
        emoji: agent.identity?.emoji,
      });
    }
    return participants;
  }

  // 其他：返回当前 default agent
  const defaultAgent = agentsList.agents.find((a) => a.id === agentsList.defaultId);
  if (defaultAgent) {
    participants.push({
      id: defaultAgent.id,
      name: defaultAgent.identity?.name || defaultAgent.name || defaultAgent.id,
      emoji: defaultAgent.identity?.emoji,
    });
  }
  return participants;
}

/** Render the floating participants panel toggle button + panel */
export function renderParticipantsPanel(
  participants: ParticipantInfo[],
  activeSenderIds: Set<string>,
  streamingSenderIds: Set<string>,
) {
  if (participants.length <= 1) {
    return nothing;
  }

  const total = participants.length;

  const togglePanel = (e: Event) => {
    const btn = e.currentTarget as HTMLElement;
    const container = btn.closest(".chat-participants-container") as HTMLElement | null;
    if (!container) {
      return;
    }
    const expanded = container.dataset.expanded === "1";
    container.dataset.expanded = expanded ? "0" : "1";
  };

  return html`
    <div class="chat-participants-container" data-expanded="0">
      <!-- Toggle button: member count pill -->
      <button
        class="chat-participants-toggle"
        type="button"
        title="参与者 (${total})"
        @click=${togglePanel}
      >
        <span class="chat-participants-toggle__dots">
          ${participants.slice(0, 3).map((p) => {
            const rgb = p.isUser ? "100,116,139" : getSenderRgb(p.id);
            const isActive = p.isUser || activeSenderIds.has(p.id) || streamingSenderIds.has(p.id);
            return html`<span
              class="chat-participants-toggle__dot ${isActive
                ? "chat-participants-toggle__dot--active"
                : ""}"
              style="background:rgba(${rgb},${isActive
                ? "0.85"
                : "0.35"});border-color:rgba(${rgb},0.5)"
            ></span>`;
          })}
        </span>
        <span class="chat-participants-toggle__count">${total}</span>
      </button>

      <!-- Expandable panel -->
      <div class="chat-participants-panel">
        <div class="chat-participants-panel__header">
          <span class="chat-participants-panel__title">参与者 · ${total}</span>
        </div>
        <div class="chat-participants-panel__list">
          ${participants.map((p) => {
            const rgb = p.isUser ? "100,116,139" : getSenderRgb(p.id);
            const isStreaming = streamingSenderIds.has(p.id);
            const isActive = p.isUser || activeSenderIds.has(p.id) || isStreaming;
            const statusClass = isStreaming
              ? "chat-participant-status--streaming"
              : isActive
                ? "chat-participant-status--active"
                : "chat-participant-status--offline";
            const statusTitle = isStreaming ? "正在输入…" : isActive ? "活跃" : "离线";
            return html`
              <div class="chat-participant-row">
                <span
                  class="chat-participant-avatar"
                  style="background:rgba(${rgb},0.15);color:rgb(${rgb});border-color:rgba(${rgb},0.3)"
                  >${p.emoji ?? p.name.charAt(0).toUpperCase()}</span
                >
                <span class="chat-participant-name">${p.name}</span>
                <span class="chat-participant-status ${statusClass}" title="${statusTitle}"></span>
                ${isStreaming ? html`<span class="chat-participant-typing">✦</span>` : nothing}
              </div>
            `;
          })}
        </div>
      </div>
    </div>
  `;
}
