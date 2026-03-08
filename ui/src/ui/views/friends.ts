/**
 * Friends View
 * 好友关系管理界面
 */

import { html, nothing } from "lit";
import type { Friend, FriendRequest } from "../controllers/friends.ts";
import { t } from "../i18n.ts";

export type FriendsSubPanel = "list" | "requests";

export type FriendsProps = {
  loading: boolean;
  error: string | null;
  friendsList: Friend[];
  friendsTotal: number;
  friendRequestsLoading: boolean;
  friendRequestsList: FriendRequest[];
  selectedFriendId: string | null;
  activeSubPanel: FriendsSubPanel;

  onRefresh: () => void;
  onSelectSubPanel: (panel: FriendsSubPanel) => void;
  onSelectFriend: (friendId: string) => void;
  onAddFriend: (toAgentId: string, message?: string) => void;
  onRemoveFriend: (friendId: string) => void;
  onConfirmFriend: (friendId: string, accept: boolean) => void;
  /** 导航到聊天页面的好友节点，传入目标 agent ID，让用户在聊天页程查看通信记录 */
  onNavigateToChatFriend?: (friendAgentId: string) => void;
};

export function renderFriendsView(props: FriendsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">💬 ${t("collaboration.friends.title")}</div>
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
        ${props.activeSubPanel === "list" ? renderFriendsList(props) : renderFriendRequests(props)}
      </div>
    </section>
  `;
}

function renderFriendsTabs(props: FriendsProps) {
  const tabs: Array<{ id: FriendsSubPanel; label: string; icon: string; count?: number }> = [
    { id: "list", label: "直接会话列表", icon: "💬", count: props.friendsTotal },
    {
      id: "requests",
      label: "连接请求",
      icon: "📬",
      count: props.friendRequestsList.filter((r) => r.status === "pending").length,
    },
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
        <div style="font-size: 48px;">💬</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px;">暂无直接会话</div>
        <div class="muted">添加连接开始协作</div>
        <button class="btn-primary" @click=${() => showAddFriendDialog(props)} style="margin-top: 16px;">
          ➕ 添加连接
        </button>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <div class="muted">共 ${props.friendsTotal} 个直接连接</div>
        <button class="btn-secondary" @click=${() => showAddFriendDialog(props)}>
          ➕ 添加连接
        </button>
      </div>
      
      ${props.friendsList.map(
        (friend) => html`
          <div
            class="card"
            style="padding: 12px;"
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
                    props.onNavigateToChatFriend?.(friend.agentId);
                  }}
                  title="在聊天页查看会话记录"
                >
                  💬
                </button>
                <button
                  class="btn-icon"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    props.onRemoveFriend(friend.id);
                  }}
                  title="移除连接"
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
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无连接请求</div>
        <div class="muted">收到的连接请求会显示在这里</div>
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

function showAddFriendDialog(props: FriendsProps) {
  const toAgentId = prompt("请输入要连接的 Agent ID:");
  if (toAgentId) {
    const message = prompt("请输入连接请求的附言（可选）:", "你好，我想与你建立直接会话");
    props.onAddFriend(toAgentId, message || undefined);
  }
}
