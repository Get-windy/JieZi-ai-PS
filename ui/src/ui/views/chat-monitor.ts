/**
 * Monitor view module — extracted from chat.ts
 *
 * Renders the read-only "monitor" panel used for contact / all / agent-all contexts.
 * Includes color palette, sender extraction, bubble rendering, and the full monitor view.
 */
import { html, nothing } from "lit";
import { t } from "../i18n.ts";
import type { ChatConversationContext, MessageTrustMeta, MessageSourceKind } from "../types.ts";
import type { ChatProps } from "../types/chat-props.ts";

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

/** 提取消息中的可信元数据（防守 A4/A5/A6） */
function extractTrustMeta(msg: unknown): MessageTrustMeta | null {
  const m = msg as Record<string, unknown>;
  const trust = m.__trustMeta as MessageTrustMeta | undefined;
  if (trust) {
    return trust;
  }
  // 尝试从字段推断来源类型
  const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
  if (role === "user") {
    return { sourceKind: "human" };
  }
  if (role === "system" || role === "toolresult") {
    return { sourceKind: "system" };
  }
  // interagent 信号
  const interagent = m.__interagent as Record<string, unknown> | undefined;
  if (interagent) {
    return {
      sourceKind: "agent-auto",
      senderDeptId: typeof interagent.senderDeptId === "string" ? interagent.senderDeptId : undefined,
      senderDeptName: typeof interagent.senderDeptName === "string" ? interagent.senderDeptName : undefined,
      sandboxed: typeof interagent.sandboxed === "boolean" ? interagent.sandboxed : undefined,
      guardPassed: typeof interagent.guardPassed === "boolean" ? interagent.guardPassed : undefined,
    };
  }
  return { sourceKind: "agent-auto" };
}

/** 渲染消息来源类型标识（防守 A6） */
function renderSourceKindBadge(kind: MessageSourceKind, sandboxed?: boolean) {
  const labels: Record<MessageSourceKind, string> = {
    "human": "👤 人类",
    "agent-auto": "🤖 Agent自动",
    "agent-prompted": "🤖 Agent回复",
    "system": "⚙️ 系统",
    "cross-dept": "🔗 跨部门",
  };
  const colors: Record<MessageSourceKind, string> = {
    "human": "#3b82f6",
    "agent-auto": "#8b5cf6",
    "agent-prompted": "#6366f1",
    "system": "#6b7280",
    "cross-dept": "#f59e0b",
  };
  const label = labels[kind] ?? kind;
  const color = colors[kind] ?? "#6b7280";
  return html`
    <span
      style="font-size:0.65em; padding:1px 4px; border-radius:3px; border:1px solid ${color}; color:${color}; opacity:0.85; margin-left:4px; white-space:nowrap;"
    >${label}${sandboxed ? " 📦" : ""}</span>
  `;
}

/** 渲染部门隔离徽章（防守 A4） */
function renderDeptBadge(deptName?: string, guardPassed?: boolean) {
  if (!deptName) {
    return nothing;
  }
  const guardIcon = guardPassed === false
    ? html`<span title="跨部门防守未通过" style="color:#ef4444;"> ⚠️</span>`
    : nothing;
  return html`
    <span
      style="font-size:0.65em; padding:1px 4px; border-radius:3px; background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); color:#6366f1; margin-left:3px; white-space:nowrap;"
    >🏢 ${deptName}${guardIcon}</span>
  `;
}
/** 提取消息中的发送者 id（支持 __interagent / provenance / __group_sender_id） */
function extractMonitorSenderId(msg: unknown): string | null {
  const m = msg as Record<string, unknown>;
  // 群聊消息
  if (typeof m.__group_sender_id === "string") {
    return m.__group_sender_id;
  }
  // agent 间通信
  const interagent = m.__interagent as Record<string, unknown> | undefined;
  if (typeof interagent?.senderId === "string") {
    return interagent.senderId;
  }
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
  _onOpenSidebar?: (content: string) => void,
) {
  const m = msg as Record<string, unknown>;
  const senderId = extractMonitorSenderId(m);
  const role = typeof m.role === "string" ? m.role.toLowerCase() : "assistant";
  const isUser = role === "user" || senderId === "user";
  const isSystem = role === "system" || role === "toolresult";
  if (isSystem) {
    return nothing;
  }

  // 提取可信元数据（防守 A4/A5/A6）
  const trust = extractTrustMeta(m);

  const color =
    senderId && agentColorMap.has(senderId)
      ? agentColorMap.get(senderId)!
      : {
          bg: "var(--panel)",
          border: "var(--border)",
          accent: "var(--text-muted)",
          label: "var(--text-muted)",
        };

  const senderLabel = senderId
    ? (agentNameMap.get(senderId) ?? senderId)
    : isUser
      ? t("chat.monitor.user")
      : "Agent";

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
  if (!text.trim()) {
    return nothing;
  }

  const ts = typeof m.timestamp === "number" ? m.timestamp : Date.now();
  const timeStr = new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const alignRight = isUser;

  return html`
    <div class="monitor-bubble ${alignRight ? "monitor-bubble--right" : "monitor-bubble--left"}">
      <div class="monitor-bubble__meta" style="color:${color.label}">
        <span class="monitor-bubble__sender">${senderLabel}</span>
        ${trust ? renderSourceKindBadge(trust.sourceKind, trust.sandboxed) : nothing}
        ${trust ? renderDeptBadge(trust.senderDeptName, trust.guardPassed) : nothing}
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
export function renderMonitorView(props: ChatProps) {
  const context = props.navCurrentContext;
  const allAgents = props.agentsList?.agents ?? [];

  // 对抗-P1 修复：将 agentColorMap/agentNameMap 构建提升到渲染之前，且只构建一次
  // 原实现在消息气泡内部每条消息渲染时都会 find()—O(N) 的毅性配色逻辑
  // 现在：统一在 renderMonitorView 构建 Map，传入气泡渲染器—O(1) 查询
  const agentColorMap = new Map<string, MonitorColorScheme>();
  const agentNameMap = new Map<string, string>();
  allAgents.forEach((a, i) => {
    agentColorMap.set(a.id, getMonitorColor(i));
    agentNameMap.set(a.id, a.identity?.name || a.name || a.id);
  });
  agentColorMap.set("user", {
    bg: "var(--panel)",
    border: "var(--border)",
    accent: "#64748b",
    label: "#64748b",
  });
  agentNameMap.set("user", t("chat.monitor.user"));

  // 对抗-P1 修复：补齐 dept-room/dept-broadcast 的 monitorTitle/monitorDesc
  // 原实现对这两种 context 没有处理，导致内容显示默认文本（监控视图标题）
  let monitorTitle = t("chat.monitor.title");
  let monitorDesc = "";
  if (context?.type === "contact") {
    const agentName =
      allAgents.find((a) => a.id === context.agentId)?.identity?.name || context.agentId;
    const contactName = context.contactAgentName || context.contactAgentId;
    monitorTitle = t("chat.monitor.contact_title", { agent: agentName, contact: contactName });
    monitorDesc = t("chat.monitor.contact_desc");
  } else if (context?.type === "all") {
    monitorTitle = t("chat.monitor.all_title");
    monitorDesc = t("chat.monitor.all_desc");
  } else if (context?.type === "agent-all") {
    const agentName =
      allAgents.find((a) => a.id === (context as { agentId: string }).agentId)?.identity?.name ||
      (context as { agentId: string }).agentId;
    monitorTitle = t("chat.monitor.agent_all_title", { agent: agentName });
    monitorDesc = t("chat.monitor.agent_all_desc");
  } else if (context?.type === "dept-room") {
    // 对抗-P1：补齐部门聊天室的监控标题
    const deptName = context.deptName ?? context.deptId;
    const sandboxNote = context.sandboxEnabled ? " (Docker 沙笲隔离已启用)" : "";
    monitorTitle = `🏢 ${deptName}${sandboxNote}`;
    monitorDesc = context.isMember === false
      ? "您不是该部门成员，只读观察模式"
      : `部门聊天室 · 共 ${context.memberAgentIds?.length ?? 0} 个 Agent 成员`;
  } else if (context?.type === "dept-broadcast") {
    // 对抗-P1：补齐部门广播频道的监控标题
    const deptName = context.deptName ?? context.deptId;
    monitorTitle = `📢 ${deptName} · 广播频道`;
    monitorDesc = context.isAdmin
      ? "您是管理员，可发布广播消息"
      : "只读广播，只有管理员可发言";
  }

  const messages = Array.isArray(props.messages) ? props.messages : [];

  // 参与者信息栏（仅用于过滤已出现的 sender，渲染在 header badges 区域）
  // const participants = ...

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
          <span class="monitor-polling-badge">${t("chat.monitor.polling")}</span>
          ${allAgents.slice(0, 6).map((a, i) => {
            const color = getMonitorColor(i);
            return html`<span
              class="monitor-participant-badge"
              style="background:${color.bg};border-color:${color.border};color:${color.label}"
              title="${a.identity?.name || a.id}"
            >${a.identity?.emoji || "🤖"} ${a.identity?.name || a.id}</span>`;
          })}
          <span class="monitor-participant-badge monitor-participant-badge--you" title=${t("chat.you")}>${t("chat.monitor.user")}</span>
        </div>
      </div>

      <!-- 消息流 -->
      <div class="monitor-thread" @scroll=${props.onChatScroll}>
        ${props.loading ? html`<div class="muted" style="text-align:center;padding:24px">${t("chat.monitor.loading")}</div>` : nothing}
        ${
          messages.length === 0 && !props.loading
            ? html`<div class="monitor-empty">
              <span class="monitor-empty__icon">👁</span>
              <div>${t("chat.monitor.empty")}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${t("chat.monitor.empty_hint")}</div>
            </div>`
            : nothing
        }
        ${messages.map((msg) => renderMonitorBubble(msg, agentColorMap, agentNameMap, props.onOpenSidebar))}
        ${
          props.stream
            ? html`
          <div class="monitor-bubble monitor-bubble--left">
            <div class="monitor-bubble__meta" style="color:var(--text-muted)">
              <span class="monitor-bubble__sender">${t("chat.monitor.agent_label")}</span>
              <span class="monitor-bubble__time">${t("chat.monitor.responding")}</span>
            </div>
            <div class="monitor-bubble__body" style="background:var(--panel);border-color:var(--border)">
              <div class="chat-reading-indicator" aria-hidden="true">
                <span class="chat-reading-indicator__dots"><span></span><span></span><span></span></span>
              </div>
            </div>
          </div>
        `
            : nothing
        }
      </div>

      ${
        props.showNewMessages
          ? html`<button class="btn chat-new-messages" type="button" @click=${props.onScrollToBottom}>
            ${t("chat.new_messages")} ↓
          </button>`
          : nothing
      }

      <!-- 监控视图默认只读，无输入框 -->
      <div class="monitor-readonly-tip">
        ${t("chat.monitor.readonly_tip")}
      </div>
    </div>
  `;
}

/** 判断当前 context 是否应使用监控视图（只读/不可输入） */
export function isMonitorContext(context: ChatConversationContext | null): boolean {
  if (!context) {
    return false;
  }
  return (
    context.type === "contact" ||
    context.type === "all" ||
    context.type === "agent-all" ||
    // 部门广播和非成员的部门聊天室也进监控视图
    context.type === "dept-broadcast" ||
    (context.type === "dept-room" && context.isMember === false)
  );
}
