/**
 * P2.5: 会议室完整UI组件
 * 
 * 功能模块：
 * 1. 参会者列表 - 在线状态、角色标识
 * 2. 会议讨论区 - 实时消息流、表情回应
 * 3. 议程进度 - 当前议题高亮、时间进度
 * 4. 会议控制 - 开始/结束、议题切换、决策记录
 * 5. 实时会议纪要 - 自动记录、行动项列表
 */

import { html, nothing, type TemplateResult } from "lit";

// ============================================================================
// 类型定义
// ============================================================================

export type MeetingRoomProps = {
  loading: boolean;
  error: string | null;
  
  // 会议信息
  meeting: MeetingInfo | null;
  
  // 参会者
  participants: MeetingParticipant[];
  currentUserId: string; // 当前用户ID
  
  // 会议消息
  messages: MeetingMessage[];
  messageLoading: boolean;
  
  // 议程
  currentAgendaIndex: number;
  agendaItems: AgendaItem[];
  
  // 决策与行动项
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  
  // UI状态
  participantPanelCollapsed: boolean;
  notesPanelCollapsed: boolean;
  
  // 表单状态
  messageInput: string;
  decisionInput: string;
  actionItemInput: string;
  
  // 回调函数
  onRefresh: () => void;
  onToggleParticipantPanel: () => void;
  onToggleNotesPanel: () => void;
  
  // 会议控制
  onStartMeeting: () => void;
  onEndMeeting: () => void;
  onCancelMeeting: () => void;
  onNextAgenda: () => void;
  onPreviousAgenda: () => void;
  
  // 消息操作
  onSendMessage: (content: string) => void;
  onReactToMessage: (messageId: string, emoji: string) => void;
  onReplyToMessage: (messageId: string, content: string) => void;
  
  // 决策与行动项
  onRecordDecision: (content: string) => void;
  onCreateActionItem: (description: string, assigneeId: string) => void;
  onCompleteActionItem: (actionItemId: string) => void;
  
  // 参会者操作
  onInviteParticipant: () => void;
  onRemoveParticipant: (participantId: string) => void;
  
  // 输入变更
  onMessageInputChange: (value: string) => void;
  onDecisionInputChange: (value: string) => void;
  onActionItemInputChange: (value: string) => void;
};

export type MeetingStatus = "scheduled" | "in-progress" | "completed" | "cancelled";
export type MeetingType = "standup" | "review" | "planning" | "brainstorm" | "decision" | "other";

export type MeetingInfo = {
  id: string;
  title: string;
  description?: string;
  type: MeetingType;
  status: MeetingStatus;
  organizerId: string;
  scheduledAt: number;
  startedAt?: number;
  endedAt?: number;
  duration: number; // 分钟
};

export type MeetingParticipant = {
  id: string;
  name: string;
  type: "human" | "agent";
  role: "organizer" | "presenter" | "attendee" | "optional";
  specialRole?: "facilitator" | "notesTaker" | "timekeeper" | "analyst";
  response: "accepted" | "declined" | "tentative" | "no-response";
  online: boolean;
  avatar?: string;
};

export type MeetingMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderType: "human" | "agent";
  content: string;
  messageType: "text" | "decision" | "action-item" | "poll";
  timestamp: number;
  replyToMessageId?: string;
  reactions?: Record<string, string[]>; // {emoji: [userId]}
};

export type AgendaItem = {
  id: string;
  topic: string;
  description?: string;
  duration: number; // 分钟
  presenter?: string;
  status: "pending" | "in-progress" | "completed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  notes?: string;
};

export type MeetingDecision = {
  id: string;
  content: string;
  proposedBy: string;
  proposedByName: string;
  timestamp: number;
  agendaItemId?: string;
  impact?: "high" | "medium" | "low";
};

export type MeetingActionItem = {
  id: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  dueDate?: number;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in-progress" | "completed";
  timestamp: number;
};

// ============================================================================
// 主渲染函数
// ============================================================================

export function renderMeetingRoom(props: MeetingRoomProps) {
  if (props.loading) {
    return html`
      <div class="card" style="padding: 48px; text-align: center;">
        <div class="spinner"></div>
        <div style="margin-top: 12px; color: var(--text-muted);">加载会议中...</div>
      </div>
    `;
  }

  if (props.error) {
    return html`
      <div class="card" style="padding: 48px; text-align: center;">
        <div style="color: var(--error); margin-bottom: 12px;">❌ ${props.error}</div>
        <button class="btn btn--sm" @click=${props.onRefresh}>重试</button>
      </div>
    `;
  }

  if (!props.meeting) {
    return html`
      <div class="card" style="padding: 48px; text-align: center;">
        <div style="color: var(--text-muted);">未找到会议信息</div>
      </div>
    `;
  }

  return html`
    <div class="meeting-room-container" style="display: flex; gap: 16px; height: calc(100vh - 120px);">
      <!-- 左侧：参会者面板（可折叠） -->
      ${renderParticipantPanel(props)}
      
      <!-- 中间：主会议区 -->
      <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0;">
        <!-- 会议头部 -->
        ${renderMeetingHeader(props)}
        
        <!-- 议程进度 -->
        ${renderAgendaProgress(props)}
        
        <!-- 消息讨论区 -->
        ${renderDiscussionArea(props)}
        
        <!-- 消息输入框 -->
        ${renderMessageInput(props)}
      </div>
      
      <!-- 右侧：会议纪要面板（可折叠） -->
      ${renderNotesPanel(props)}
    </div>
  `;
}

// ============================================================================
// 会议头部
// ============================================================================

function renderMeetingHeader(props: MeetingRoomProps) {
  const meeting = props.meeting!;
  const isOrganizer = meeting.organizerId === props.currentUserId;

  return html`
    <div class="card" style="padding: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <!-- 左侧：会议信息 -->
        <div>
          <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 4px;">
            ${getMeetingTypeEmoji(meeting.type)} ${meeting.title}
          </div>
          <div style="font-size: 0.9rem; color: var(--text-muted);">
            ${getMeetingStatusBadge(meeting.status)}
            ${meeting.scheduledAt
              ? html`<span style="margin-left: 12px;">
                  📅 ${new Date(meeting.scheduledAt).toLocaleString("zh-CN")}
                </span>`
              : nothing}
            ${meeting.duration
              ? html`<span style="margin-left: 12px;">⏱️ ${meeting.duration}分钟</span>`
              : nothing}
          </div>
        </div>
        
        <!-- 右侧：会议控制按钮 -->
        <div class="row" style="gap: 8px;">
          ${meeting.status === "scheduled" && isOrganizer
            ? html`
                <button class="btn btn--primary" @click=${props.onStartMeeting}>
                  ▶️ 开始会议
                </button>
                <button class="btn" @click=${props.onCancelMeeting}>
                  取消会议
                </button>
              `
            : nothing}
          
          ${meeting.status === "in-progress" && isOrganizer
            ? html`
                <button class="btn btn--primary" @click=${props.onEndMeeting}>
                  ⏹️ 结束会议
                </button>
              `
            : nothing}
          
          <button class="btn btn--sm" @click=${props.onRefresh} title="刷新">
            🔄
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 议程进度
// ============================================================================

function renderAgendaProgress(props: MeetingRoomProps) {
  const meeting = props.meeting!;
  
  if (props.agendaItems.length === 0) {
    return nothing;
  }

  const currentAgenda = props.agendaItems[props.currentAgendaIndex];
  const totalDuration = props.agendaItems.reduce((sum, item) => sum + item.duration, 0);
  const elapsedDuration = props.agendaItems
    .slice(0, props.currentAgendaIndex)
    .reduce((sum, item) => sum + item.duration, 0);
  const progress = (elapsedDuration / totalDuration) * 100;

  return html`
    <div class="card" style="padding: 16px;">
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-weight: 600;">📋 会议议程</div>
        <div style="font-size: 0.9rem; color: var(--text-muted);">
          ${props.currentAgendaIndex + 1} / ${props.agendaItems.length}
        </div>
      </div>
      
      <!-- 进度条 -->
      <div style="height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
        <div
          style="
            height: 100%;
            background: var(--primary);
            width: ${progress}%;
            transition: width 0.3s;
          "
        ></div>
      </div>
      
      <!-- 当前议题 -->
      ${currentAgenda
        ? html`
            <div style="padding: 12px; border-radius: 6px; background: var(--primary)10; border-left: 3px solid var(--primary);">
              <div style="font-weight: 600; margin-bottom: 4px;">
                ${currentAgenda.topic}
              </div>
              ${currentAgenda.description
                ? html`<div style="font-size: 0.9rem; color: var(--text-muted);">${currentAgenda.description}</div>`
                : nothing}
              <div class="row" style="justify-content: space-between; margin-top: 8px;">
                <span style="font-size: 0.85rem; color: var(--text-muted);">
                  ⏱️ ${currentAgenda.duration}分钟
                  ${currentAgenda.presenter ? ` | 👤 ${currentAgenda.presenter}` : ""}
                </span>
                ${meeting.status === "in-progress"
                  ? html`
                      <div class="row" style="gap: 8px;">
                        <button
                          class="btn btn--sm"
                          @click=${props.onPreviousAgenda}
                          ?disabled=${props.currentAgendaIndex === 0}
                        >
                          ⬅️ 上一个
                        </button>
                        <button
                          class="btn btn--sm btn--primary"
                          @click=${props.onNextAgenda}
                          ?disabled=${props.currentAgendaIndex === props.agendaItems.length - 1}
                        >
                          下一个 ➡️
                        </button>
                      </div>
                    `
                  : nothing}
              </div>
            </div>
          `
        : nothing}
      
      <!-- 议程列表（折叠显示） -->
      <details style="margin-top: 12px;">
        <summary style="cursor: pointer; color: var(--text-muted); font-size: 0.9rem;">
          查看完整议程
        </summary>
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
          ${props.agendaItems.map((item, index) => renderAgendaItem(item, index, props))}
        </div>
      </details>
    </div>
  `;
}

function renderAgendaItem(item: AgendaItem, index: number, props: MeetingRoomProps): TemplateResult {
  const isCurrent = index === props.currentAgendaIndex;
  const statusIcon = {
    pending: "⏸️",
    "in-progress": "▶️",
    completed: "✅",
    skipped: "⏭️",
  }[item.status];

  return html`
    <div
      style="
        padding: 8px;
        border-radius: 4px;
        background: ${isCurrent ? "var(--primary)10" : "var(--bg-secondary)"};
        ${isCurrent ? "border-left: 3px solid var(--primary);" : ""}
      "
    >
      <div class="row" style="justify-content: space-between;">
        <div class="row" style="gap: 8px; align-items: center;">
          <span>${statusIcon}</span>
          <span style="font-weight: ${isCurrent ? "600" : "400"};">${item.topic}</span>
        </div>
        <span style="font-size: 0.85rem; color: var(--text-muted);">
          ⏱️ ${item.duration}分钟
        </span>
      </div>
    </div>
  `;
}

// ============================================================================
// 参会者面板
// ============================================================================

function renderParticipantPanel(props: MeetingRoomProps) {
  if (props.participantPanelCollapsed) {
    return html`
      <div style="width: 48px;">
        <button
          class="btn btn--sm"
          style="width: 100%; height: 48px; padding: 0;"
          title="展开参会者列表"
          @click=${props.onToggleParticipantPanel}
        >
          ▶️
        </button>
      </div>
    `;
  }

  const onlineCount = props.participants.filter((p) => p.online).length;

  return html`
    <div class="card" style="width: 280px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <!-- 头部 -->
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div style="font-weight: 600;">
          👥 参会者 (${onlineCount}/${props.participants.length})
        </div>
        <button
          class="btn btn--sm"
          style="padding: 4px 8px;"
          title="折叠"
          @click=${props.onToggleParticipantPanel}
        >
          ◀️
        </button>
      </div>
      
      <!-- 参会者列表 -->
      <div style="flex: 1; overflow-y: auto;">
        ${props.participants.map((participant) => renderParticipantItem(participant, props))}
      </div>
      
      <!-- 邀请按钮 -->
      <button class="btn btn--sm" @click=${props.onInviteParticipant}>
        ➕ 邀请参会者
      </button>
    </div>
  `;
}

function renderParticipantItem(participant: MeetingParticipant, props: MeetingRoomProps) {
  const isCurrentUser = participant.id === props.currentUserId;

  return html`
    <div
      style="
        padding: 8px;
        border-radius: 6px;
        margin-bottom: 8px;
        background: ${isCurrentUser ? "var(--primary)10" : "transparent"};
        border: 1px solid ${isCurrentUser ? "var(--primary)" : "transparent"};
      "
    >
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <div class="row" style="gap: 8px; align-items: center;">
          <!-- 头像 -->
          <div
            style="
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: ${participant.type === "human" ? "#4CAF50" : "#2196F3"};
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 0.9rem;
              position: relative;
            "
          >
            ${participant.type === "human" ? "👤" : "🤖"}
            <!-- 在线状态指示器 -->
            ${participant.online
              ? html`
                  <div
                    style="
                      position: absolute;
                      bottom: 0;
                      right: 0;
                      width: 10px;
                      height: 10px;
                      border-radius: 50%;
                      background: #4CAF50;
                      border: 2px solid var(--bg);
                    "
                  ></div>
                `
              : nothing}
          </div>
          
          <!-- 名称 -->
          <div>
            <div style="font-weight: 500; font-size: 0.9rem;">
              ${participant.name}
              ${isCurrentUser ? html`<span style="color: var(--text-muted); font-size: 0.8rem;">(你)</span>` : nothing}
            </div>
            ${participant.role !== "attendee"
              ? html`<div style="font-size: 0.75rem; color: var(--text-muted);">${getRoleLabel(participant.role)}</div>`
              : nothing}
          </div>
        </div>
        
        <!-- 特殊角色标识 -->
        ${participant.specialRole
          ? html`<span title="${getSpecialRoleLabel(participant.specialRole)}">${getSpecialRoleEmoji(participant.specialRole)}</span>`
          : nothing}
      </div>
      
      <!-- 响应状态 -->
      ${participant.response !== "accepted"
        ? html`
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              ${getResponseLabel(participant.response)}
            </div>
          `
        : nothing}
    </div>
  `;
}

// ============================================================================
// 消息讨论区
// ============================================================================

function renderDiscussionArea(props: MeetingRoomProps) {
  return html`
    <div class="card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
      <!-- 消息列表 -->
      <div
        id="messages-container"
        style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;"
      >
        ${props.messageLoading
          ? html`<div style="text-align: center; padding: 24px; color: var(--text-muted);">加载消息中...</div>`
          : props.messages.length === 0
          ? html`<div style="text-align: center; padding: 24px; color: var(--text-muted);">暂无消息</div>`
          : props.messages.map((message) => renderMessage(message, props))}
      </div>
    </div>
  `;
}

function renderMessage(message: MeetingMessage, props: MeetingRoomProps) {
  const isCurrentUser = message.senderId === props.currentUserId;

  return html`
    <div
      style="
        display: flex;
        flex-direction: column;
        align-items: ${isCurrentUser ? "flex-end" : "flex-start"};
      "
    >
      <!-- 发送者信息 -->
      ${!isCurrentUser
        ? html`
            <div class="row" style="gap: 8px; align-items: center; margin-bottom: 4px;">
              <span>${message.senderType === "human" ? "👤" : "🤖"}</span>
              <span style="font-size: 0.85rem; font-weight: 500;">${message.senderName}</span>
            </div>
          `
        : nothing}
      
      <!-- 消息气泡 -->
      <div
        style="
          max-width: 70%;
          padding: 12px;
          border-radius: 12px;
          background: ${isCurrentUser ? "var(--primary)" : "var(--bg-secondary)"};
          color: ${isCurrentUser ? "white" : "inherit"};
          ${message.messageType === "decision"
            ? "border-left: 4px solid #ffc107;"
            : message.messageType === "action-item"
            ? "border-left: 4px solid #f44336;"
            : ""}
        "
      >
        <!-- 消息类型标识 -->
        ${message.messageType === "decision"
          ? html`<div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 4px;">📝 决策记录</div>`
          : message.messageType === "action-item"
          ? html`<div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 4px;">✅ 行动项</div>`
          : nothing}
        
        <!-- 消息内容 -->
        <div style="line-height: 1.5; white-space: pre-wrap;">
          ${message.content}
        </div>
        
        <!-- 时间戳 -->
        <div
          style="
            font-size: 0.75rem;
            margin-top: 4px;
            opacity: 0.7;
          "
        >
          ${new Date(message.timestamp).toLocaleTimeString("zh-CN")}
        </div>
        
        <!-- 表情回应 -->
        ${message.reactions && Object.keys(message.reactions).length > 0
          ? html`
              <div class="row" style="gap: 4px; margin-top: 8px; flex-wrap: wrap;">
                ${Object.entries(message.reactions).map(([emoji, users]) => html`
                  <span
                    style="
                      padding: 2px 8px;
                      border-radius: 12px;
                      background: rgba(255,255,255,0.2);
                      font-size: 0.85rem;
                      cursor: pointer;
                    "
                    @click=${() => props.onReactToMessage(message.id, emoji)}
                  >
                    ${emoji} ${users.length}
                  </span>
                `)}
              </div>
            `
          : nothing}
      </div>
    </div>
  `;
}

// ============================================================================
// 消息输入框
// ============================================================================

function renderMessageInput(props: MeetingRoomProps) {
  const meeting = props.meeting!;
  
  if (meeting.status !== "in-progress") {
    return html`
      <div class="card" style="padding: 16px; text-align: center; color: var(--text-muted);">
        会议尚未开始或已结束
      </div>
    `;
  }

  return html`
    <div class="card" style="padding: 12px;">
      <div class="row" style="gap: 8px; align-items: flex-end;">
        <textarea
          class="input"
          placeholder="输入消息..."
          rows="2"
          style="flex: 1; resize: none;"
          .value=${props.messageInput}
          @input=${(e: Event) => props.onMessageInputChange((e.target as HTMLTextAreaElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (props.messageInput.trim()) {
                props.onSendMessage(props.messageInput.trim());
              }
            }
          }}
        ></textarea>
        <button
          class="btn btn--primary"
          @click=${() => {
            if (props.messageInput.trim()) {
              props.onSendMessage(props.messageInput.trim());
            }
          }}
          ?disabled=${!props.messageInput.trim()}
        >
          发送
        </button>
      </div>
      
      <!-- 快捷操作 -->
      <div class="row" style="gap: 8px; margin-top: 8px;">
        <button class="btn btn--sm" title="表情">😊</button>
        <button class="btn btn--sm" title="附件">📎</button>
        <button class="btn btn--sm" title="投票">📊</button>
      </div>
    </div>
  `;
}

// ============================================================================
// 会议纪要面板
// ============================================================================

function renderNotesPanel(props: MeetingRoomProps) {
  if (props.notesPanelCollapsed) {
    return html`
      <div style="width: 48px;">
        <button
          class="btn btn--sm"
          style="width: 100%; height: 48px; padding: 0;"
          title="展开会议纪要"
          @click=${props.onToggleNotesPanel}
        >
          ◀️
        </button>
      </div>
    `;
  }

  return html`
    <div class="card" style="width: 320px; padding: 16px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;">
      <!-- 头部 -->
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div style="font-weight: 600;">📝 会议纪要</div>
        <button
          class="btn btn--sm"
          style="padding: 4px 8px;"
          title="折叠"
          @click=${props.onToggleNotesPanel}
        >
          ▶️
        </button>
      </div>
      
      <!-- 决策记录 -->
      ${renderDecisionsSection(props)}
      
      <!-- 行动项 -->
      ${renderActionItemsSection(props)}
    </div>
  `;
}

function renderDecisionsSection(props: MeetingRoomProps) {
  return html`
    <div>
      <div style="font-weight: 500; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span>📝 决策 (${props.decisions.length})</span>
      </div>
      
      <!-- 决策列表 -->
      ${props.decisions.length === 0
        ? html`<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">暂无决策</div>`
        : html`
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
              ${props.decisions.map((decision) => html`
                <div style="padding: 10px; border-radius: 6px; background: var(--bg-secondary); border-left: 3px solid #ffc107;">
                  <div style="font-size: 0.9rem; line-height: 1.4; margin-bottom: 4px;">
                    ${decision.content}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">
                    👤 ${decision.proposedByName} | ${new Date(decision.timestamp).toLocaleTimeString("zh-CN")}
                  </div>
                  ${decision.impact
                    ? html`<div style="font-size: 0.75rem; margin-top: 4px;">${getImpactBadge(decision.impact)}</div>`
                    : nothing}
                </div>
              `)}
            </div>
          `}
      
      <!-- 添加决策 -->
      ${props.meeting?.status === "in-progress"
        ? html`
            <div>
              <textarea
                class="input"
                placeholder="记录决策..."
                rows="2"
                style="width: 100%; resize: vertical; margin-bottom: 8px;"
                .value=${props.decisionInput}
                @input=${(e: Event) => props.onDecisionInputChange((e.target as HTMLTextAreaElement).value)}
              ></textarea>
              <button
                class="btn btn--sm btn--primary"
                style="width: 100%;"
                @click=${() => {
                  if (props.decisionInput.trim()) {
                    props.onRecordDecision(props.decisionInput.trim());
                  }
                }}
                ?disabled=${!props.decisionInput.trim()}
              >
                ➕ 记录决策
              </button>
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderActionItemsSection(props: MeetingRoomProps) {
  return html`
    <div>
      <div style="font-weight: 500; margin-bottom: 8px;">
        ✅ 行动项 (${props.actionItems.length})
      </div>
      
      <!-- 行动项列表 -->
      ${props.actionItems.length === 0
        ? html`<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">暂无行动项</div>`
        : html`
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
              ${props.actionItems.map((item) => html`
                <div style="padding: 10px; border-radius: 6px; background: var(--bg-secondary); border-left: 3px solid ${item.status === "completed" ? "#4CAF50" : "#f44336"};">
                  <div class="row" style="justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <div style="flex: 1; font-size: 0.9rem; line-height: 1.4;">
                      ${item.description}
                    </div>
                    ${item.status !== "completed"
                      ? html`
                          <button
                            class="btn btn--sm"
                            style="padding: 2px 6px; font-size: 0.7rem;"
                            @click=${() => props.onCompleteActionItem(item.id)}
                          >
                            ✓
                          </button>
                        `
                      : html`<span style="color: #4CAF50;">✅</span>`}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">
                    👤 ${item.assigneeName}
                    ${item.dueDate ? ` | ⏰ ${new Date(item.dueDate).toLocaleDateString("zh-CN")}` : ""}
                  </div>
                  ${item.priority !== "medium"
                    ? html`<div style="margin-top: 4px; font-size: 0.75rem;">${getPriorityBadge(item.priority)}</div>`
                    : nothing}
                </div>
              `)}
            </div>
          `}
      
      <!-- 添加行动项 -->
      ${props.meeting?.status === "in-progress"
        ? html`
            <div>
              <textarea
                class="input"
                placeholder="添加行动项..."
                rows="2"
                style="width: 100%; resize: vertical; margin-bottom: 8px;"
                .value=${props.actionItemInput}
                @input=${(e: Event) => props.onActionItemInputChange((e.target as HTMLTextAreaElement).value)}
              ></textarea>
              <button
                class="btn btn--sm btn--primary"
                style="width: 100%;"
                @click=${() => {
                  if (props.actionItemInput.trim()) {
                    // TODO: 需要选择负责人
                    props.onCreateActionItem(props.actionItemInput.trim(), props.currentUserId);
                  }
                }}
                ?disabled=${!props.actionItemInput.trim()}
              >
                ➕ 添加行动项
              </button>
            </div>
          `
        : nothing}
    </div>
  `;
}

// ============================================================================
// 辅助函数
// ============================================================================

function getMeetingTypeEmoji(type: MeetingType): string {
  const emojis = {
    standup: "🏃",
    review: "🔍",
    planning: "📅",
    brainstorm: "💡",
    decision: "🎯",
    other: "📋",
  };
  return emojis[type] || "📋";
}

function getMeetingStatusBadge(status: MeetingStatus) {
  const badges = {
    scheduled: html`<span class="badge" style="background: #2196F3; color: white;">📅 已安排</span>`,
    "in-progress": html`<span class="badge" style="background: #4CAF50; color: white;">▶️ 进行中</span>`,
    completed: html`<span class="badge" style="background: #9E9E9E; color: white;">✅ 已完成</span>`,
    cancelled: html`<span class="badge" style="background: #f44336; color: white;">❌ 已取消</span>`,
  };
  return badges[status];
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    organizer: "组织者",
    presenter: "主讲人",
    attendee: "参会者",
    optional: "可选参会者",
  };
  return labels[role] || role;
}

function getSpecialRoleEmoji(role: string): string {
  const emojis: Record<string, string> = {
    facilitator: "🎤",
    notesTaker: "📝",
    timekeeper: "⏱️",
    analyst: "📊",
  };
  return emojis[role] || "";
}

function getSpecialRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    facilitator: "主持人",
    notesTaker: "记录员",
    timekeeper: "计时员",
    analyst: "分析师",
  };
  return labels[role] || role;
}

function getResponseLabel(response: string): string {
  const labels: Record<string, string> = {
    accepted: "✅ 已接受",
    declined: "❌ 已拒绝",
    tentative: "⚠️ 待定",
    "no-response": "⏸️ 未响应",
  };
  return labels[response] || response;
}

function getImpactBadge(impact: string) {
  const badges: Record<string, TemplateResult> = {
    high: html`<span class="badge" style="background: #f44336; color: white;">高影响</span>`,
    medium: html`<span class="badge" style="background: #ff9800; color: white;">中影响</span>`,
    low: html`<span class="badge" style="background: #4caf50; color: white;">低影响</span>`,
  };
  return badges[impact] || nothing;
}

function getPriorityBadge(priority: string) {
  const badges: Record<string, TemplateResult> = {
    urgent: html`<span class="badge" style="background: #f44336; color: white;">🔴 紧急</span>`,
    high: html`<span class="badge" style="background: #ff9800; color: white;">🟠 高</span>`,
    medium: html`<span class="badge" style="background: #ffc107; color: black;">🟡 中</span>`,
    low: html`<span class="badge" style="background: #4caf50; color: white;">🟢 低</span>`,
  };
  return badges[priority] || nothing;
}
