import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
import { icons } from "../icons.ts";
import { detectTextDirection } from "../text-direction.ts";
import type {
  AgentsListResult,
  SessionsListResult,
  ChatNavigationNode,
  ChatConversationContext,
} from "../types.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import { renderChatNavigationTree } from "./chat-navigation-tree.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type FallbackIndicatorStatus = {
  phase?: "active" | "cleared";
  selected: string;
  active: string;
  previous?: string;
  reason?: string;
  attempts: string[];
  occurredAt: number;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionIndicatorStatus | null;
  fallbackStatus?: FallbackIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  // Scroll control
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: () => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  // ============ 导航树相关 ============
  navNodes: ChatNavigationNode[];
  navCurrentContext: ChatConversationContext | null;
  navExpandedNodeIds: Set<string>;
  navSearchQuery: string;
  navChannelForceJoined: boolean;
  navLoading?: boolean;
  navError?: string | null;
  onNavRetry?: () => void;
  onNavSelectContext: (context: ChatConversationContext) => void;
  onNavToggleNode: (nodeId: string) => void;
  onNavSearchChange: (query: string) => void;
  onNavChannelForceJoinToggle: () => void;
  // ============ 参与者列表 ============
  /** 所有 agents 列表，用于渲染参与者头部 */
  agentsList?: AgentsListResult | null;
};

const COMPACTION_TOAST_DURATION_MS = 5000;
const FALLBACK_TOAST_DURATION_MS = 8000;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// ============ 监控视图工具函数 ============

/** 根据 agent id/索引生成一组区分色（周期循环） */
const MONITOR_PALETTE = [
  { bg: "#e8f4fd", border: "#93c5fd", accent: "#2563eb", label: "#1d4ed8" }, // 蓝
  { bg: "#fdf4e8", border: "#fcd34d", accent: "#d97706", label: "#92400e" }, // 黄
  { bg: "#edf7ed", border: "#86efac", accent: "#16a34a", label: "#14532d" }, // 绿
  { bg: "#fdf2f8", border: "#f0abfc", accent: "#9333ea", label: "#581c87" }, // 紫
  { bg: "#fff1f2", border: "#fda4af", accent: "#e11d48", label: "#9f1239" }, // 红
  { bg: "#f0fdfa", border: "#5eead4", accent: "#0d9488", label: "#134e4a" }, // 青
];

const MONITOR_PALETTE_DARK = [
  { bg: "#1e3a5f", border: "#3b82f6", accent: "#60a5fa", label: "#93c5fd" },
  { bg: "#3d2a00", border: "#d97706", accent: "#fbbf24", label: "#fcd34d" },
  { bg: "#0a2e1a", border: "#16a34a", accent: "#4ade80", label: "#86efac" },
  { bg: "#2e1065", border: "#7c3aed", accent: "#a78bfa", label: "#c4b5fd" },
  { bg: "#4c0519", border: "#be123c", accent: "#fb7185", label: "#fda4af" },
  { bg: "#042f2e", border: "#0d9488", accent: "#2dd4bf", label: "#5eead4" },
];

type MonitorColorScheme = { bg: string; border: string; accent: string; label: string };

function getMonitorColor(index: number, isDark = false): MonitorColorScheme {
  const palette = isDark ? MONITOR_PALETTE_DARK : MONITOR_PALETTE;
  return palette[index % palette.length];
}

/** 提取消息中的发送者 id（支持 __interagent / provenance / __group_sender_id） */
function extractMonitorSenderId(msg: unknown): string | null {
  const m = msg as Record<string, unknown>;
  // 群聊消息
  if (typeof m.__group_sender_id === "string") {return m.__group_sender_id;}
  // agent 间通信
  const interagent = m.__interagent as Record<string, unknown> | undefined;
  if (typeof interagent?.senderId === "string") {return interagent.senderId;}
  // provenance
  const prov = m.provenance as Record<string, unknown> | undefined;
  if (prov?.kind === "inter_session" && typeof prov.sourceSessionKey === "string") {
    const parts = prov.sourceSessionKey.split(":");
    return parts[0] === "agent" && parts.length >= 2 ? parts[1] : prov.sourceSessionKey;
  }
  // 普通角色
  return typeof m.role === "string" ? m.role : null;
}

/** 渲染单条监控消息气泡 */
function renderMonitorBubble(
  msg: unknown,
  agentColorMap: Map<string, MonitorColorScheme>,
  agentNameMap: Map<string, string>,
  onOpenSidebar?: (content: string) => void,
) {
  const m = msg as Record<string, unknown>;
  const senderId = extractMonitorSenderId(m);
  const role = typeof m.role === "string" ? m.role.toLowerCase() : "assistant";
  const isUser = role === "user" || senderId === "user";
  const isSystem = role === "system" || role === "toolresult";
  if (isSystem) {return nothing;}

  const color = senderId && agentColorMap.has(senderId)
    ? agentColorMap.get(senderId)!
    : { bg: "var(--panel)", border: "var(--border)", accent: "var(--text-muted)", label: "var(--text-muted)" };

  const senderLabel = senderId
    ? (agentNameMap.get(senderId) ?? senderId)
    : isUser ? "👤 用户" : "Agent";

  // 提取文本
  const content = m.content;
  let text = "";
  if (Array.isArray(content)) {
    text = content
      .filter((c: unknown) => (c as Record<string, unknown>).type === "text")
      .map((c: unknown) => (c as Record<string, unknown>).text as string)
      .join("");
  } else if (typeof content === "string") {
    text = content;
  } else if (typeof m.text === "string") {
    text = m.text;
  }
  if (!text.trim()) {return nothing;}

  const ts = typeof m.timestamp === "number" ? m.timestamp : Date.now();
  const timeStr = new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const alignRight = isUser;

  return html`
    <div class="monitor-bubble ${alignRight ? "monitor-bubble--right" : "monitor-bubble--left"}">
      <div class="monitor-bubble__meta" style="color:${color.label}">
        <span class="monitor-bubble__sender">${senderLabel}</span>
        <span class="monitor-bubble__time">${timeStr}</span>
      </div>
      <div
        class="monitor-bubble__body"
        style="background:${color.bg};border-color:${color.border};border-left-color:${isUser ? color.border : color.accent};"
      >
        ${text}
      </div>
    </div>
  `;
}

/** 监控视图：用于 contact/all/agent-all 等只读类型 */
function renderMonitorView(props: ChatProps) {
  const context = props.navCurrentContext;
  const allAgents = props.agentsList?.agents ?? [];

  // 建立 sender → 颜色/名称 映射
  const agentColorMap = new Map<string, MonitorColorScheme>();
  const agentNameMap = new Map<string, string>();
  // user 始终占最后一个颜色
  allAgents.forEach((a, i) => {
    agentColorMap.set(a.id, getMonitorColor(i));
    agentNameMap.set(a.id, a.identity?.name || a.name || a.id);
  });
  agentColorMap.set("user", { bg: "var(--panel)", border: "var(--border)", accent: "#64748b", label: "#64748b" });
  agentNameMap.set("user", "👤 用户");

  // 解析对话主题
  let monitorTitle = "协作监控";
  let monitorDesc = "";
  if (context?.type === "contact") {
    const agentName = allAgents.find((a) => a.id === context.agentId)?.identity?.name || context.agentId;
    const contactName = context.contactAgentName || context.contactAgentId;
    monitorTitle = `${agentName} ↔ ${contactName}`;
    monitorDesc = "实时监控 Agent 间通信，只读模式";
  } else if (context?.type === "all") {
    monitorTitle = "所有 Agent 通信流";
    monitorDesc = "或聚展示所有智能体的消息动态，实时更新";
  } else if (context?.type === "agent-all") {
    const agentName = allAgents.find((a) => a.id === (context as { agentId: string }).agentId)?.identity?.name
      || (context as { agentId: string }).agentId;
    monitorTitle = `${agentName} 全部消息`;
    monitorDesc = "该智能体所有通道和对话的消息聚展，实时更新";
  }

  const messages = Array.isArray(props.messages) ? props.messages : [];

  // 参与者信息栏
  const participants = [...agentColorMap.entries()].filter(([id]) => {
    if (id === "user") {return false;}
    return messages.some((m) => {
      const sid = extractMonitorSenderId(m);
      return sid === id || (m as Record<string, unknown>).role === "assistant";
    });
  });

  return html`
    <div class="monitor-view">
      <!-- 顶部标题条 -->
      <div class="monitor-header">
        <div class="monitor-header__left">
          <span class="monitor-header__icon">👁</span>
          <div>
            <div class="monitor-header__title">${monitorTitle}</div>
            ${monitorDesc ? html`<div class="monitor-header__desc">${monitorDesc}</div>` : nothing}
          </div>
        </div>
        <div class="monitor-header__participants">
          <span class="monitor-polling-badge">⚫️ 实时监控中</span>
          ${allAgents.slice(0, 6).map((a, i) => {
            const color = getMonitorColor(i);
            return html`<span
              class="monitor-participant-badge"
              style="background:${color.bg};border-color:${color.border};color:${color.label}"
              title="${a.identity?.name || a.id}"
            >${a.identity?.emoji || "🤖"} ${a.identity?.name || a.id}</span>`;
          })}
          <span class="monitor-participant-badge monitor-participant-badge--you" title="你">👤 用户</span>
        </div>
      </div>

      <!-- 消息流 -->
      <div class="monitor-thread" @scroll=${props.onChatScroll}>
        ${props.loading ? html`<div class="muted" style="text-align:center;padding:24px">加载中...</div>` : nothing}
        ${messages.length === 0 && !props.loading
          ? html`<div class="monitor-empty">
              <span class="monitor-empty__icon">👁</span>
              <div>暂无通信记录</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Agent 开始协作后消息将实时显示在这里</div>
            </div>`
          : nothing
        }
        ${messages.map((msg) => renderMonitorBubble(msg, agentColorMap, agentNameMap, props.onOpenSidebar))}
        ${props.stream ? html`
          <div class="monitor-bubble monitor-bubble--left">
            <div class="monitor-bubble__meta" style="color:var(--text-muted)">
              <span class="monitor-bubble__sender">智能体</span>
              <span class="monitor-bubble__time">回复中...</span>
            </div>
            <div class="monitor-bubble__body" style="background:var(--panel);border-color:var(--border)">
              <div class="chat-reading-indicator" aria-hidden="true">
                <span class="chat-reading-indicator__dots"><span></span><span></span><span></span></span>
              </div>
            </div>
          </div>
        ` : nothing}
      </div>

      ${props.showNewMessages
        ? html`<button class="btn chat-new-messages" type="button" @click=${props.onScrollToBottom}>
            新消息 ↓
          </button>`
        : nothing}

      <!-- 监控视图默认只读，无输入框 -->
      <div class="monitor-readonly-tip">
        👁 监控模式：只读，如需参与请切换到对应群组或直接对话
      </div>
    </div>
  `;
}


type MentionCandidate = { id: string; label: string; emoji: string };

/** 从光标位置向前找最近的未完成 @xxx token，返回 { token, start } 或 null */
function detectMentionToken(
  text: string,
  cursor: number,
): { token: string; start: number } | null {
  // 只在光标前扫描，找最近的 @ 且 @ 后面没有空格
  const before = text.slice(0, cursor);
  const idx = before.lastIndexOf("@");
  if (idx === -1) {return null;}
  const after = before.slice(idx + 1);
  // 如果 @ 之后有空格，说明已经完成了一个 mention
  if (/\s/.test(after)) {return null;}
  return { token: after.toLowerCase(), start: idx };
}

/** 关闭 mention 下拉 */
function closeMentionDropdown(container: HTMLElement) {
  const existing = container.querySelector(".chat-mention-dropdown");
  if (existing) {existing.remove();}
}

/** 渲染 mention 下拉列表，选中后把 @label 插入 textarea */
function openMentionDropdown(
  container: HTMLElement,
  textarea: HTMLTextAreaElement,
  candidates: MentionCandidate[],
  mentionStart: number,
  onInsert: (newDraft: string) => void,
) {
  closeMentionDropdown(container);
  if (candidates.length === 0) {return;}

  const dropdown = document.createElement("div");
  dropdown.className = "chat-mention-dropdown";

  candidates.forEach((c, i) => {
    const item = document.createElement("div");
    item.className = "chat-mention-item";
    if (i === 0) {item.classList.add("chat-mention-item--active");}
    item.textContent = `${c.emoji} ${c.label}`;
    item.addEventListener("mousedown", (ev) => {
      ev.preventDefault(); // 防止 textarea 失焦
      const cur = textarea.selectionStart ?? textarea.value.length;
      const before = textarea.value.slice(0, mentionStart);
      const after = textarea.value.slice(cur);
      const inserted = `@${c.label} `;
      const newVal = before + inserted + after;
      onInsert(newVal);
      // 把光标移到插入文字末尾
      const newCursor = mentionStart + inserted.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
        adjustTextareaHeight(textarea);
      });
      closeMentionDropdown(container);
    });
    dropdown.appendChild(item);
  });

  // 键盘导航
  const onKeydown = (e: KeyboardEvent) => {
    const items = dropdown.querySelectorAll<HTMLElement>(".chat-mention-item");
    const activeIdx = Array.from(items).findIndex((el) => el.classList.contains("chat-mention-item--active"));
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (activeIdx + 1) % items.length;
      items[activeIdx]?.classList.remove("chat-mention-item--active");
      items[next]?.classList.add("chat-mention-item--active");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (activeIdx - 1 + items.length) % items.length;
      items[activeIdx]?.classList.remove("chat-mention-item--active");
      items[prev]?.classList.add("chat-mention-item--active");
    } else if (e.key === "Enter" || e.key === "Tab") {
      const active = items[activeIdx];
      if (active) {
        e.preventDefault();
        e.stopImmediatePropagation();
        active.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
    } else if (e.key === "Escape") {
      closeMentionDropdown(container);
      textarea.removeEventListener("keydown", onKeydown, true);
    }
  };
  textarea.addEventListener("keydown", onKeydown, true);

  // 点击外部关闭
  const onClickOutside = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node)) {
      closeMentionDropdown(container);
      document.removeEventListener("mousedown", onClickOutside);
      textarea.removeEventListener("keydown", onKeydown, true);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);

  container.appendChild(dropdown);
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="compaction-indicator compaction-indicator--active" role="status" aria-live="polite">
        ${icons.loader} Compacting context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="compaction-indicator compaction-indicator--complete" role="status" aria-live="polite">
          ${icons.check} Context compacted
        </div>
      `;
    }
  }

  return nothing;
}

function renderFallbackIndicator(status: FallbackIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  const phase = status.phase ?? "active";
  const elapsed = Date.now() - status.occurredAt;
  if (elapsed >= FALLBACK_TOAST_DURATION_MS) {
    return nothing;
  }
  const details = [
    `Selected: ${status.selected}`,
    phase === "cleared" ? `Active: ${status.selected}` : `Active: ${status.active}`,
    phase === "cleared" && status.previous ? `Previous fallback: ${status.previous}` : null,
    status.reason ? `Reason: ${status.reason}` : null,
    status.attempts.length > 0 ? `Attempts: ${status.attempts.slice(0, 3).join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const message =
    phase === "cleared"
      ? `Fallback cleared: ${status.selected}`
      : `Fallback active: ${status.active}`;
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

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) {
    return;
  }

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img"
            />
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

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

  const youParticipant = { id: "__you__", label: "You", emoji: "👤", isUser: true };

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
        title: context.groupName ?? `群组·${context.groupId}`,
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
      return { title: "所有对话", icon: "🌐", participants };
    }
    case "channels-all": {
      const name = context.agentName ?? getAgentLabel(context.agentId);
      const emoji = getAgentEmoji(context.agentId);
      return {
        title: `${name} · 所有通道`,
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
            ? html`<div class="chat-participant-avatar-sm chat-participant-avatar-sm--overflow" title="还有${overflow}位">+${overflow}</div>`
            : nothing
        }
      </div>
    </div>
  `;
}

/** 判断当前 context 是否应使用监控视图（只读/不可输入） */
function isMonitorContext(context: ChatConversationContext | null): boolean {
  if (!context) {return false;}
  return context.type === "contact" || context.type === "all" || context.type === "agent-all";
}

export function renderChat(props: ChatProps) {
  // 监控视图路由：contact / all / agent-all 使用专属监控面板
  if (isMonitorContext(props.navCurrentContext)) {
    return html`
      <section class="card chat">
        <div class="chat-with-nav">
          <!-- 左侧导航树 -->
          <div class="chat-nav-sidebar">
            ${renderChatNavigationTree({
              nodes: props.navNodes,
              currentContext: props.navCurrentContext,
              expandedNodeIds: props.navExpandedNodeIds,
              searchQuery: props.navSearchQuery,
              channelForceJoined: props.navChannelForceJoined,
              loading: props.navLoading,
              error: props.navError,
              onRetry: props.onNavRetry,
              onSelectContext: props.onNavSelectContext,
              onToggleNode: props.onNavToggleNode,
              onSearchChange: props.onNavSearchChange,
              onChannelForceJoinToggle: props.onNavChannelForceJoinToggle,
            })}
          </div>
          <!-- 右侧监控面板 -->
          <div class="chat-main-area">
            ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
            ${renderMonitorView(props)}
          </div>
        </div>
      </section>
    `;
  }

  const isChannelObserve = props.navCurrentContext?.type === "channel-observe";
  const isContactView = props.navCurrentContext?.type === "contact";
  const isReadOnly = (isChannelObserve && !props.navChannelForceJoined) || isContactView;

  const canCompose = props.connected && !isReadOnly;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : "Message (↩ to send, Shift+↩ for line breaks, paste images)"
    : "Connect to the gateway to start chatting…";

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
    >
      ${
        props.loading
          ? html`
              <div class="muted">Loading chat…</div>
            `
          : nothing
      }
      ${repeat(
        buildChatItems(props),
        (item) => item.key,
        (item) => {
          if (item.kind === "divider") {
            return html`
              <div class="chat-divider" role="separator" data-ts=${String(item.timestamp)}>
                <span class="chat-divider__line"></span>
                <span class="chat-divider__label">${item.label}</span>
                <span class="chat-divider__line"></span>
              </div>
            `;
          }

          if (item.kind === "reading-indicator") {
            return renderReadingIndicatorGroup(assistantIdentity);
          }

          if (item.kind === "stream") {
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
            );
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              showReasoning,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
            });
          }

          return nothing;
        },
      )}
    </div>
  `;

  return html`
    <section class="card chat">
      <div class="chat-with-nav">
        <!-- 左侧导航树 -->
        <div class="chat-nav-sidebar">
          ${renderChatNavigationTree({
            nodes: props.navNodes,
            currentContext: props.navCurrentContext,
            expandedNodeIds: props.navExpandedNodeIds,
            searchQuery: props.navSearchQuery,
            channelForceJoined: props.navChannelForceJoined,
            loading: props.navLoading,
            error: props.navError,
            onRetry: props.onNavRetry,
            onSelectContext: props.onNavSelectContext,
            onToggleNode: props.onNavToggleNode,
            onSearchChange: props.onNavSearchChange,
            onChannelForceJoinToggle: props.onNavChannelForceJoinToggle,
          })}
        </div>

        <!-- 右侧聊天主区域 -->
        <div class="chat-main-area">
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      ${
        props.focusMode
          ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
          : nothing
      }

      ${
        isContactView
          ? html`
            <div class="chat-readonly-bar">
              <span>💬 直接会话（只读）：正在查看与 ${
                (props.navCurrentContext as { contactAgentName?: string } | null)
                  ?.contactAgentName ?? "Agent"
              } 的直接会话记录。如需发送消息，请由 Agent 调用 <code>agent_communicate</code> 工具。</span>
            </div>
          `
          : nothing
      }

      ${
        isReadOnly && isChannelObserve
          ? html`
            <div class="chat-readonly-bar">
              <span>👁️ 通道观察模式（只读）：正在观察 ${(props.navCurrentContext as { channelName?: string } | null)?.channelName ?? "通道"} 的消息</span>
              <button
                class="btn btn--sm"
                type="button"
                @click=${props.onNavChannelForceJoinToggle}
              >
                🔧 强行接入
              </button>
            </div>
          `
          : nothing
      }

      ${
        isChannelObserve && props.navChannelForceJoined
          ? html`
            <div class="chat-force-joined-bar">
              <span>⚠️ 您正在以管理员身份直接回复通道消息，请谨慎操作</span>
              <button
                class="btn btn--sm"
                type="button"
                @click=${props.onNavChannelForceJoinToggle}
              >
                退出接入
              </button>
            </div>
          `
          : nothing
      }

      <div
        class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}"
      >
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${
          sidebarOpen
            ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                  },
                })}
              </div>
            `
            : nothing
        }
      </div>

      ${
        props.queue.length
          ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">Queued (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${
                          item.text ||
                          (item.attachments?.length ? `Image (${item.attachments.length})` : "")
                        }
                      </div>
                      <button
                        class="btn chat-queue__remove"
                        type="button"
                        aria-label="Remove queued message"
                        @click=${() => props.onQueueRemove(item.id)}
                      >
                        ${icons.x}
                      </button>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : nothing
      }

      ${renderFallbackIndicator(props.fallbackStatus)}
      ${renderCompactionIndicator(props.compactionStatus)}

      ${
        props.showNewMessages
          ? html`
            <button
              class="btn chat-new-messages"
              type="button"
              @click=${props.onScrollToBottom}
            >
              New messages ${icons.arrowDown}
            </button>
          `
          : nothing
      }

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>Message</span>
            <div class="chat-compose__mention-wrap" style="position:relative">
            <textarea
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              dir=${detectTextDirection(props.draft)}
              ?disabled=${!canCompose}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") {
                  return;
                }
                if (e.isComposing || e.keyCode === 229) {
                  return;
                }
                if (e.shiftKey) {
                  return;
                } // Allow Shift+Enter for line breaks
                if (!canCompose) {
                  return;
                }
                e.preventDefault();
                if (canCompose) {
                  props.onSend();
                }
              }}
              @input=${(e: Event) => {
                const target = e.target as HTMLTextAreaElement;
                adjustTextareaHeight(target);
                props.onDraftChange(target.value);
                // @ mention 提及逻辑（仅在群聊 context）
                const isGroupCtx = props.navCurrentContext?.type === "group";
                const wrap = target.closest(".chat-compose__mention-wrap");
                if (isGroupCtx && wrap) {
                  const cursor = target.selectionStart ?? target.value.length;
                  const mention = detectMentionToken(target.value, cursor);
                  if (mention) {
                    const { participants } = resolveConversationInfo(
                      props.navCurrentContext,
                      props.agentsList,
                      props.assistantName,
                    );
                    const filtered = participants
                      .filter((p) => !p.isUser)
                      .filter((p) =>
                        mention.token === "" ||
                        p.label.toLowerCase().includes(mention.token) ||
                        p.id.toLowerCase().includes(mention.token),
                      ) as MentionCandidate[];
                    openMentionDropdown(
                      wrap,
                      target,
                      filtered,
                      mention.start,
                      (newDraft) => props.onDraftChange(newDraft),
                    );
                  } else {
                    closeMentionDropdown(wrap);
                  }
                }
              }}
              @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
              placeholder=${composePlaceholder}
            ></textarea>
            </div>
          </label>
          <div class="chat-compose__actions">
            <button
              class="btn"
              ?disabled=${!canCompose || (!canAbort && props.sending)}
              @click=${canAbort ? props.onAbort : props.onNewSession}
            >
              ${canAbort ? "Stop" : "New session"}
            </button>
            <button
              class="btn primary"
              ?disabled=${!canCompose}
              @click=${props.onSend}
            >
              ${isBusy ? "Queue" : "Send"}<kbd class="btn-kbd">↵</kbd>
            </button>
          </div>
        </div>
      </div>
        </div><!-- .chat-main-area -->
      </div><!-- .chat-with-nav -->
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    // Extract group chat sender info from __group_sender_id / __group_sender_name
    const rawMsg = item.message as Record<string, unknown>;
    const groupSenderId = typeof rawMsg.__group_sender_id === "string" ? rawMsg.__group_sender_id : undefined;
    const groupSenderName = typeof rawMsg.__group_sender_name === "string" ? rawMsg.__group_sender_name : undefined;

    // Break group when role changes OR when group sender changes (different agents in group chat)
    const senderChanged = groupSenderId !== undefined &&
      currentGroup?.groupSenderId !== groupSenderId;

    if (!currentGroup || currentGroup.role !== role || senderChanged) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
        groupSenderId,
        groupSenderName,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);
    const raw = msg as Record<string, unknown>;
    const marker = raw.__openclaw as Record<string, unknown> | undefined;
    if (marker && marker.kind === "compaction") {
      items.push({
        kind: "divider",
        key:
          typeof marker.id === "string"
            ? `divider:compaction:${marker.id}`
            : `divider:compaction:${normalized.timestamp}:${i}`,
        label: "Compaction",
        timestamp: normalized.timestamp ?? Date.now(),
      });
      continue;
    }

    if (!props.showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  if (props.showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
