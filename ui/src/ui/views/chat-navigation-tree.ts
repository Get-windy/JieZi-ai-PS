/**
 * 聊天导航树渲染组件
 *
 * 渲染左侧导航树，支持四种顶级分类：
 * - 我的对话（管理员模式）
 * - 通道观察（只读模式，可强行接入）
 * - 团队协作（群聊）
 * - 好友对话
 *
 * 基于 Lit html 模板，使用函数式渲染风格，复用项目现有 CSS 变量。
 */

import { html, nothing, type TemplateResult } from "lit";
import { isSameContext, filterNavigationNodes } from "../controllers/chat-navigation.ts";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";
import type { ChatNavigationNode, ChatNavigationTreeProps } from "../types.ts";

// ============ 主渲染函数 ============

export function renderChatNavigationTree(props: ChatNavigationTreeProps) {
  // 加载中状态
  if (props.loading) {
    return html`
      <div class="chat-nav-tree">
        <div class="chat-nav-loading">
          <span class="chat-nav-loading__spinner"></span>
          <span>${t("chat.nav.loading")}</span>
        </div>
      </div>
    `;
  }

  // 错误状态
  if (props.error) {
    return html`
      <div class="chat-nav-tree">
        <div class="chat-nav-error">
          <span class="chat-nav-error__icon">⚠️</span>
          <span class="chat-nav-error__message">${t("chat.nav.error_prefix", { error: props.error })}</span>
          ${
            props.onRetry
              ? html`
                <button class="chat-nav-error__retry" type="button" @click=${props.onRetry}>
                  ${t("chat.nav.retry")}
                </button>
              `
              : nothing
          }
        </div>
      </div>
    `;
  }

  const displayNodes = props.searchQuery.trim()
    ? filterNavigationNodes(props.nodes, props.searchQuery)
    : props.nodes;

  return html`
    <div class="chat-nav-tree">
      <!-- 搜索框 -->
      <div class="chat-nav-search">
        <input
          type="text"
          class="chat-nav-search__input"
          placeholder=${t("chat.nav.search_placeholder")}
          .value=${props.searchQuery}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            props.onSearchChange(target.value);
          }}
        />
        ${
          props.searchQuery
            ? html`
              <button
                class="chat-nav-search__clear"
                type="button"
                @click=${() => props.onSearchChange("")}
                title=${t("chat.nav.search_clear")}
              >
                ✕
              </button>
            `
            : nothing
        }
      </div>

      <!-- 通道观察模式提示 -->
      ${renderChannelModeIndicator(props)}

      <!-- 导航树节点 -->
      <div class="chat-nav-nodes">
        ${
          displayNodes.length === 0
            ? renderEmptyState(props)
            : displayNodes.map((node) => renderRootNode(node, props))
        }
      </div>
    </div>
  `;
}

// ============ 根节点渲染 ============

function renderRootNode(node: ChatNavigationNode, props: ChatNavigationTreeProps) {
  const expanded = props.expandedNodeIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const totalUnread = computeTotalUnread(node);
  const isActive = isSameContext(node.context, props.currentContext);

  return html`
    <div class="chat-nav-root">
      <div
        class="chat-nav-root__header ${isActive ? "chat-nav-root--active" : ""}"
        @click=${() => {
          if (hasChildren) {
            props.onToggleNode(node.id);
          }
          // 分类节点（有子节点）只展开/折叠，不跳转
          if (!hasChildren) {
            props.onSelectContext(node.context);
          }
        }}
      >
        ${
          hasChildren
            ? html`<span class="chat-nav-toggle ${expanded ? "chat-nav-toggle--expanded" : ""}">${icons.chevronRight}</span>`
            : html`
                <span class="chat-nav-toggle-placeholder"></span>
              `
        }
        <span class="chat-nav-root__icon">${node.icon}</span>
        <span class="chat-nav-root__label">${node.label}</span>
        ${
          totalUnread > 0
            ? html`<span class="chat-nav-badge">${totalUnread > 99 ? "99+" : totalUnread}</span>`
            : nothing
        }
      </div>

      ${
        expanded && hasChildren
          ? html`
            <div class="chat-nav-children">
              ${node.children!.map((child) => renderChildNode(child, props, 1))}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

// ============ 子节点渲染（递归） ============

function renderChildNode(
  node: ChatNavigationNode,
  props: ChatNavigationTreeProps,
  level: number,
): TemplateResult {
  const expanded = props.expandedNodeIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const isActive = isSameContext(node.context, props.currentContext);

  return html`
    <div class="chat-nav-item chat-nav-item--level-${Math.min(level, 3)} ${node.nodeType ? `chat-nav-item--${node.nodeType}` : ""}">
      <div
        class="chat-nav-item__content ${isActive ? "chat-nav-item--active" : ""}"
        @click=${() => {
          if (hasChildren) {
            props.onToggleNode(node.id);
          }
          // 分类节点（有子节点）只展开/折叠，不跳转
          if (!hasChildren) {
            props.onSelectContext(node.context);
          }
        }}
      >
        ${
          hasChildren
            ? html`<span class="chat-nav-toggle chat-nav-toggle--sm ${expanded ? "chat-nav-toggle--expanded" : ""}"
              >${icons.chevronRight}</span
            >`
            : nothing
        }
        <span class="chat-nav-item__icon">${node.icon}</span>
        <span class="chat-nav-item__label">${node.label}</span>
        ${
          node.unreadCount && node.unreadCount > 0
            ? html`<span class="chat-nav-badge"
              >${node.unreadCount > 99 ? "99+" : node.unreadCount}</span
            >`
            : nothing
        }
      </div>

      ${
        expanded && hasChildren
          ? html`
            <div class="chat-nav-children">
              ${node.children!.map((child) => renderChildNode(child, props, level + 1))}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

// ============ 通道观察模式指示器 ============

function renderChannelModeIndicator(props: ChatNavigationTreeProps) {
  const ctx = props.currentContext;
  if (!ctx || ctx.type !== "channel-observe") {
    return nothing;
  }

  return html`
    <div
      class="chat-nav-channel-mode ${props.channelForceJoined ? "chat-nav-channel-mode--joined" : ""}"
    >
      ${
        props.channelForceJoined
          ? html`
            <div class="chat-nav-channel-mode__text">
              <span>🔧</span>
              <span>${t("chat.nav.channel.force_joined")}</span>
            </div>
            <button
              class="chat-nav-channel-mode__btn chat-nav-channel-mode__btn--exit"
              type="button"
              @click=${props.onChannelForceJoinToggle}
            >
              ${t("chat.nav.channel.exit")}
            </button>
          `
          : html`
            <div class="chat-nav-channel-mode__text">
              <span>👀</span>
              <span>${t("chat.nav.channel.readonly")}</span>
            </div>
            <button
              class="chat-nav-channel-mode__btn"
              type="button"
              @click=${props.onChannelForceJoinToggle}
            >
              ${t("chat.nav.channel.force_join")}
            </button>
          `
      }
    </div>
  `;
}

// ============ 工具函数 ============

function computeTotalUnread(node: ChatNavigationNode): number {
  let total = node.unreadCount ?? 0;
  if (node.children) {
    for (const child of node.children) {
      total += computeTotalUnread(child);
    }
  }
  return total;
}

// ============ 空状态渲染 ============

function renderEmptyState(props: ChatNavigationTreeProps) {
  // 有搜索条件但无结果
  if (props.searchQuery.trim()) {
    return html`
      <div class="chat-nav-empty">
        <span class="chat-nav-empty__icon">🔍</span>
        <span class="chat-nav-empty__text">${t("chat.nav.no_results")}</span>
        <button
          class="chat-nav-empty__action"
          type="button"
          @click=${() => props.onSearchChange("")}
        >
          ${t("chat.nav.search_clear")}
        </button>
      </div>
    `;
  }

  // 没有任何数据
  return html`
    <div class="chat-nav-empty">
      <span class="chat-nav-empty__icon">💭</span>
      <span class="chat-nav-empty__text">${t("chat.nav.empty")}</span>
      <span class="chat-nav-empty__hint">${t("chat.nav.empty_hint")}</span>
    </div>
  `;
}
