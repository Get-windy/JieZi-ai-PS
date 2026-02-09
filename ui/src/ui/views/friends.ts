/**
 * Friends View
 * 好友关系管理界面
 */

import { html, nothing } from "lit";
import type { Friend, FriendRequest, DirectMessage } from "../controllers/friends.ts";
import { t } from "../i18n.ts";

export type FriendsSubPanel = "list" | "requests" | "chat";

export type FriendsProps = {
  loading: boolean;
  error: string | null;
  friendsList: Friend[];
  friendsTotal: number;
  friendRequestsLoading: boolean;
  friendRequestsList: FriendRequest[];
  selectedFriendId: string | null;
  messagesLoading: boolean;
  messagesList: DirectMessage[];
  sendingMessage: boolean;
  activeSubPanel: FriendsSubPanel;
  draftMessage: string;

  onRefresh: () => void;
  onSelectSubPanel: (panel: FriendsSubPanel) => void;
  onSelectFriend: (friendId: string) => void;
  onAddFriend: (toAgentId: string, message?: string) => void;
  onRemoveFriend: (friendId: string) => void;
  onConfirmFriend: (friendId: string, accept: boolean) => void;
  onSendMessage: (content: string) => void;
  onDraftMessageChange: (content: string) => void;
};

export function renderFriendsView(props: FriendsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">🤝 ${t("collaboration.friends.title")}</div>
          <div class="card-sub">${t("collaboration.friends.subtitle")}</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button
            class="btn-icon"
            @click=${props.onRefresh}
            ?disabled=${props.loading}
            title="刷新"
          >
            🔄
          </button>
        </div>
      </div>

      ${renderFriendsTabs(props)}

      <div style="margin-top: 16px;">
        ${
          props.activeSubPanel === "list"
            ? renderFriendsList(props)
            : props.activeSubPanel === "requests"
              ? renderFriendRequests(props)
              : renderChat(props)
        }
      </div>
    </section>
  `;
}

function renderFriendsTabs(props: FriendsProps) {
  const tabs: Array<{ id: FriendsSubPanel; label: string; icon: string; count?: number }> = [
    { id: "list", label: "好友列表", icon: "👥", count: props.friendsTotal },
    {
      id: "requests",
      label: "好友请求",
      icon: "📬",
      count: props.friendRequestsList.filter((r) => r.status === "pending").length,
    },
    { id: "chat", label: "聊天", icon: "💬" },
  ];

  return html`
    <div class="agent-tabs" style="margin-top: 16px;">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${props.activeSubPanel === tab.id ? "active" : ""}"
            type="button"
            @click=${() => props.onSelectSubPanel(tab.id)}
          >
            <span style="margin-right: 6px;">${tab.icon}</span>
            ${tab.label}
            ${
              tab.count && tab.count > 0
                ? html`<span class="badge" style="margin-left: 6px;">${tab.count}</span>`
                : nothing
            }
          </button>
        `,
      )}
    </div>
  `;
}

function renderFriendsList(props: FriendsProps) {
  if (props.loading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (props.error) {
    return html`
      <div class="empty-state">
        <div style="color: var(--danger-color);">❌ ${props.error}</div>
        <button class="btn-secondary" @click=${props.onRefresh} style="margin-top: 16px;">
          重试
        </button>
      </div>
    `;
  }

  if (props.friendsList.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px;">👥</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px;">暂无好友</div>
        <div class="muted">添加好友开始协作</div>
        <button class="btn-primary" @click=${() => showAddFriendDialog(props)} style="margin-top: 16px;">
          ➕ 添加好友
        </button>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <div class="muted">共 ${props.friendsTotal} 个好友</div>
        <button class="btn-secondary" @click=${() => showAddFriendDialog(props)}>
          ➕ 添加好友
        </button>
      </div>
      
      ${props.friendsList.map(
        (friend) => html`
          <div
            class="card"
            style="padding: 12px; cursor: pointer; ${
              props.selectedFriendId === friend.id ? "border: 2px solid var(--primary-color);" : ""
            }"
            @click=${() => {
              props.onSelectFriend(friend.id);
              props.onSelectSubPanel("chat");
            }}
          >
            <div class="row" style="justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 500;">${friend.agentName || friend.agentId}</div>
                <div class="muted" style="font-size: 12px;">
                  ${
                    friend.status === "online"
                      ? "🟢 在线"
                      : friend.status === "busy"
                        ? "🟡 忙碌"
                        : "⚫ 离线"
                  }
                  ${
                    friend.lastActive
                      ? `• 最后活跃: ${new Date(friend.lastActive).toLocaleString()}`
                      : ""
                  }
                </div>
              </div>
              <div class="row" style="gap: 4px;">
                <button
                  class="btn-icon"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    props.onSelectFriend(friend.id);
                    props.onSelectSubPanel("chat");
                  }}
                  title="发送消息"
                >
                  💬
                </button>
                <button
                  class="btn-icon"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    props.onRemoveFriend(friend.id);
                  }}
                  title="删除好友"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderFriendRequests(props: FriendsProps) {
  if (props.friendRequestsLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  const pendingRequests = props.friendRequestsList.filter((r) => r.status === "pending");

  if (pendingRequests.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">📬</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无好友请求</div>
        <div class="muted">收到的好友请求会显示在这里</div>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="muted" style="margin-bottom: 8px;">共 ${pendingRequests.length} 个待处理请求</div>
      
      ${pendingRequests.map(
        (request) => html`
          <div class="card" style="padding: 12px;">
            <div class="row" style="justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <div style="font-weight: 500;">
                  ${request.fromAgentName || request.fromAgentId}
                </div>
                ${
                  request.message
                    ? html`<div class="muted" style="margin-top: 4px;">${request.message}</div>`
                    : nothing
                }
                <div class="muted" style="font-size: 12px; margin-top: 4px;">
                  ${new Date(request.createdAt).toLocaleString()}
                </div>
              </div>
              <div class="row" style="gap: 4px;">
                <button
                  class="btn-primary"
                  @click=${() => props.onConfirmFriend(request.fromAgentId, true)}
                >
                  ✓ 接受
                </button>
                <button
                  class="btn-danger"
                  @click=${() => props.onConfirmFriend(request.fromAgentId, false)}
                >
                  ✗ 拒绝
                </button>
              </div>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderChat(props: FriendsProps) {
  if (!props.selectedFriendId) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">💬</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">选择一个好友开始聊天</div>
        <div class="muted">从好友列表中选择要聊天的好友</div>
      </div>
    `;
  }

  const friend = props.friendsList.find((f) => f.id === props.selectedFriendId);

  return html`
    <div style="display: flex; flex-direction: column; height: 600px;">
      <div style="padding: 12px; border-bottom: 1px solid var(--border-color);">
        <div style="font-weight: 500;">${friend?.agentName || props.selectedFriendId}</div>
        <div class="muted" style="font-size: 12px;">
          ${
            friend?.status === "online"
              ? "🟢 在线"
              : friend?.status === "busy"
                ? "🟡 忙碌"
                : "⚫ 离线"
          }
        </div>
      </div>

      <div style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
        ${
          props.messagesLoading
            ? html`
                <div class="empty-state">加载消息中...</div>
              `
            : props.messagesList.length === 0
              ? html`
                  <div class="empty-state">暂无消息</div>
                `
              : props.messagesList.map(
                  (msg) => html`
                    <div
                      style="
                        max-width: 70%;
                        ${
                          msg.fromAgentId === props.selectedFriendId
                            ? "align-self: flex-start;"
                            : "align-self: flex-end;"
                        }
                      "
                    >
                      <div
                        class="card"
                        style="
                          padding: 8px 12px;
                          ${
                            msg.fromAgentId === props.selectedFriendId
                              ? "background: var(--background-secondary);"
                              : "background: var(--primary-color); color: white;"
                          }
                        "
                      >
                        ${msg.content}
                      </div>
                      <div class="muted" style="font-size: 10px; margin-top: 2px;">
                        ${new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  `,
                )
        }
      </div>

      <div style="padding: 12px; border-top: 1px solid var(--border-color);">
        <div class="row" style="gap: 8px;">
          <textarea
            style="flex: 1; min-height: 60px; resize: vertical;"
            placeholder="输入消息..."
            .value=${props.draftMessage}
            @input=${(e: Event) =>
              props.onDraftMessageChange((e.target as HTMLTextAreaElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (props.draftMessage.trim()) {
                  props.onSendMessage(props.draftMessage);
                }
              }
            }}
          ></textarea>
          <button
            class="btn-primary"
            @click=${() => {
              if (props.draftMessage.trim()) {
                props.onSendMessage(props.draftMessage);
              }
            }}
            ?disabled=${props.sendingMessage || !props.draftMessage.trim()}
          >
            ${props.sendingMessage ? "发送中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function showAddFriendDialog(props: FriendsProps) {
  const toAgentId = prompt("请输入要添加的好友ID:");
  if (toAgentId) {
    const message = prompt("请输入好友请求消息（可选）:", "你好，我想添加你为好友");
    props.onAddFriend(toAgentId, message || undefined);
  }
}
