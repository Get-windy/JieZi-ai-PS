/**
 * Chat header module — extracted from chat.ts
 *
 * Contains conversation info resolution, inline participant rendering,
 * and compaction / fallback indicator toasts.
 */
import { html, nothing } from "lit";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";
import type { AgentsListResult, ChatConversationContext } from "../types.ts";
import type {
  ChatProps,
  CompactionIndicatorStatus,
  FallbackIndicatorStatus,
} from "../types/chat-props.ts";

// ============ Indicator constants ============

const COMPACTION_TOAST_DURATION_MS = 5000;
const FALLBACK_TOAST_DURATION_MS = 8000;

// ============ Conversation info resolver ============

/**
 * 解析当前对话的标题和参与者列表
 */
export function resolveConversationInfo(
  context: ChatConversationContext | null,
  agentsList: AgentsListResult | null | undefined,
  assistantName: string,
): {
  title: string;
  icon: string;
  participants: Array<{ id: string; label: string; emoji: string; isUser?: boolean }>;
} {
  const allAgents = agentsList?.agents ?? [];

  function getAgentLabel(agentId: string): string {
    const found = allAgents.find((a) => a.id === agentId);
    return found?.identity?.name ?? found?.name ?? agentId;
  }

  function getAgentEmoji(agentId: string): string {
    const found = allAgents.find((a) => a.id === agentId);
    return found?.identity?.emoji ?? "🤖";
  }

  const youParticipant = { id: "__you__", label: t("chat.you"), emoji: "👤", isUser: true };

  if (!context) {
    return {
      title: assistantName,
      icon: "🤖",
      participants: [{ id: "main", label: assistantName, emoji: "🤖" }, youParticipant],
    };
  }

  switch (context.type) {
    case "agent-direct":
    case "agent-all": {
      const name = context.agentName ?? getAgentLabel(context.agentId);
      const emoji = context.agentEmoji ?? getAgentEmoji(context.agentId);
      return {
        title: name,
        icon: emoji,
        participants: [{ id: context.agentId, label: name, emoji }, youParticipant],
      };
    }
    case "channel-observe": {
      const agentName = context.agentName ?? getAgentLabel(context.agentId);
      const emoji = getAgentEmoji(context.agentId);
      const channelLabel = context.channelName ?? context.channelId;
      return {
        title: `${agentName} · ${channelLabel}`,
        icon: "📡",
        participants: [{ id: context.agentId, label: agentName, emoji }, youParticipant],
      };
    }
    case "group": {
      const memberIds = context.memberAgentIds ?? [];
      const participants = memberIds.map((id) => ({
        id,
        label: getAgentLabel(id),
        emoji: getAgentEmoji(id),
      }));
      // 如果没有成员列表，尝试从所有已知 agents 取
      if (participants.length === 0 && allAgents.length > 0) {
        allAgents.forEach((a) => {
          participants.push({ id: a.id, label: getAgentLabel(a.id), emoji: getAgentEmoji(a.id) });
        });
      }
      participants.push(youParticipant);
      return {
        title: context.groupName ?? t("chat.header.group_unnamed", { groupId: context.groupId }),
        icon: "👥",
        participants,
      };
    }
    case "contact": {
      const contactName = context.contactAgentName ?? getAgentLabel(context.contactAgentId);
      const contactEmoji = getAgentEmoji(context.contactAgentId);
      const agentName = getAgentLabel(context.agentId);
      const agentEmoji = getAgentEmoji(context.agentId);
      return {
        title: `${agentName} ↔️ ${contactName}`,
        icon: "💬",
        participants: [
          { id: context.agentId, label: agentName, emoji: agentEmoji },
          { id: context.contactAgentId, label: contactName, emoji: contactEmoji },
          youParticipant,
        ],
      };
    }
    case "all": {
      const participants = allAgents.map((a) => ({
        id: a.id,
        label: getAgentLabel(a.id),
        emoji: getAgentEmoji(a.id),
      }));
      participants.push(youParticipant);
      return { title: t("chat.header.all_conversations"), icon: "🌐", participants };
    }
    case "channels-all": {
      const name = context.agentName ?? getAgentLabel(context.agentId);
      const emoji = getAgentEmoji(context.agentId);
      return {
        title: t("chat.header.all_channels_title", { name }),
        icon: "📡",
        participants: [{ id: context.agentId, label: name, emoji }, youParticipant],
      };
    }
    case "session-history": {
      return {
        title: context.displayName ?? context.sessionKey,
        icon: "📜",
        participants: [youParticipant],
      };
    }
    default:
      return { title: assistantName, icon: "🤖", participants: [youParticipant] };
  }
}

// ============ Inline participants ============

/**
 * 渲染参与者信息（内联紧凑版，用于顶部 header 控制栏）
 */
export function renderChatParticipantsInline(props: ChatProps) {
  const { title, icon, participants } = resolveConversationInfo(
    props.navCurrentContext,
    props.agentsList,
    props.assistantName,
  );

  const MAX_VISIBLE = 4;
  const visible = participants.slice(0, MAX_VISIBLE);
  const overflow = participants.length - MAX_VISIBLE;

  return html`
    <div class="chat-participants-inline">
      <span class="chat-participants-inline__icon">${icon}</span>
      <span class="chat-participants-inline__name">${title}</span>
      <span class="chat-participants-inline__sep">·</span>
      <div class="chat-participants-inline__avatars">
        ${visible.map(
          (p) => html`
            <div
              class="chat-participant-avatar-sm ${p.isUser ? "chat-participant-avatar-sm--you" : ""}"
              title=${p.label}
            >${p.emoji}</div>
          `,
        )}
        ${
          overflow > 0
            ? html`<div class="chat-participant-avatar-sm chat-participant-avatar-sm--overflow" title=${t("chat.participants.overflow", { count: overflow })}>+${overflow}</div>`
            : nothing
        }
      </div>
    </div>
  `;
}

// ============ Compaction / Fallback indicators ============

export function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="compaction-indicator compaction-indicator--active" role="status" aria-live="polite">
        ${icons.loader} ${t("chat.compacting")}
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="compaction-indicator compaction-indicator--complete" role="status" aria-live="polite">
          ${icons.check} ${t("chat.compacted")}
        </div>
      `;
    }
  }

  return nothing;
}

export function renderFallbackIndicator(status: FallbackIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  const phase = status.phase ?? "active";
  const elapsed = Date.now() - status.occurredAt;
  if (elapsed >= FALLBACK_TOAST_DURATION_MS) {
    return nothing;
  }
  const details = [
    t("chat.fallback.selected", { model: status.selected }),
    phase === "cleared"
      ? t("chat.fallback.current", { model: status.selected })
      : t("chat.fallback.current", { model: status.active }),
    phase === "cleared" && status.previous
      ? t("chat.fallback.previous", { model: status.previous })
      : null,
    status.reason ? t("chat.fallback.reason", { reason: status.reason }) : null,
    status.attempts.length > 0
      ? t("chat.fallback.attempts", { attempts: status.attempts.slice(0, 3).join(" | ") })
      : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const message =
    phase === "cleared"
      ? t("chat.fallback.cleared", { model: status.selected })
      : t("chat.fallback.active", { model: status.active });
  const className =
    phase === "cleared"
      ? "compaction-indicator compaction-indicator--fallback-cleared"
      : "compaction-indicator compaction-indicator--fallback";
  const icon = phase === "cleared" ? icons.check : icons.brain;
  return html`
    <div
      class=${className}
      role="status"
      aria-live="polite"
      title=${details}
    >
      ${icon} ${message}
    </div>
  `;
}
