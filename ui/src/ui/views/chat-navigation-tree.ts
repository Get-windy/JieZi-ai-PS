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
import type {
  ChatConversationContext,
  ChatNavigationNode,
  ChatNavigationTreeProps,
} from "../types.ts";
import { isSameContext, filterNavigationNodes } from "../controllers/chat-navigation.ts";

// ============ 主渲染函数 ============

export function renderChatNavigationTree(props: ChatNavigationTreeProps) {
  // 加载中状态
  if (props.loading) {
    return html`
      <div class="chat-nav-tree">
        <div class="chat-nav-loading">
          <span class="chat-nav-loading__spinner">⏳</span>
          <span>加载中...</span>
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
          <span class="chat-nav-error__message">加载失败: ${props.error}</span>
          ${props.onRetry
            ? html`
                <button class="chat-nav-error__retry" type="button" @click=${props.onRetry}>
                  重试
                </button>
              `
            : nothing}
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
          placeholder="搜索对话..."
          .value=${props.searchQuery}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            props.onSearchChange(target.value);
          }}
        />
        ${props.searchQuery
          ? html`
              <button
                class="chat-nav-search__clear"
                type="button"
                @click=${() => props.onSearchChange("")}
                title="清除搜索"
              >
                ✕
              </button>
            `
          : nothing}
      </div>

      <!-- 通道观察模式提示 -->
      ${renderChannelModeIndicator(props)}

      <!-- 导航树节点 -->
      <div class="chat-nav-nodes">
        ${displayNodes.length === 0
          ? renderEmptyState(props)
          : displayNodes.map((node) => renderRootNode(node, props))}
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
          // 点击根节点时也选中其 context（包括智能体节点）
          props.onSelectContext(node.context);
        }}
      >
        ${hasChildren
          ? html`<span class="chat-nav-toggle">${expanded ? "▼" : "▶"}</span>`
          : html`<span class="chat-nav-toggle-placeholder"></span>`}
        <span class="chat-nav-root__icon">${node.icon}</span>
        <span class="chat-nav-root__label">${node.label}</span>
        ${totalUnread > 0
          ? html`<span class="chat-nav-badge">${totalUnread > 99 ? "99+" : totalUnread}</span>`
          : nothing}
      </div>

      ${expanded && hasChildren
        ? html`
            <div class="chat-nav-children">
              ${node.children!.map((child) => renderChildNode(child, props, 1))}
            </div>
          `
        : nothing}
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
    <div class="chat-nav-item chat-nav-item--level-${Math.min(level, 3)}">
      <div
        class="chat-nav-item__content ${isActive ? "chat-nav-item--active" : ""}"
        @click=${() => {
          if (hasChildren) {
            props.onToggleNode(node.id);
          }
          props.onSelectContext(node.context);
        }}
      >
        ${hasChildren
          ? html`<span class="chat-nav-toggle chat-nav-toggle--sm"
              >${expanded ? "▼" : "▶"}</span
            >`
          : nothing}
        <span class="chat-nav-item__icon">${node.icon}</span>
        <span class="chat-nav-item__label">${node.label}</span>
        ${node.unreadCount && node.unreadCount > 0
          ? html`<span class="chat-nav-badge"
              >${node.unreadCount > 99 ? "99+" : node.unreadCount}</span
            >`
          : nothing}
      </div>

      ${expanded && hasChildren
        ? html`
            <div class="chat-nav-children">
              ${node.children!.map((child) => renderChildNode(child, props, level + 1))}
            </div>
          `
        : nothing}
    </div>
  `;
}

// ============ 通道观察模式指示器 ============

function renderChannelModeIndicator(props: ChatNavigationTreeProps) {
  const ctx = props.currentContext;
  if (!ctx || ctx.type !== "channel-observe") {return nothing;}

  return html`
    <div
      class="chat-nav-channel-mode ${props.channelForceJoined ? "chat-nav-channel-mode--joined" : ""}"
    >
      ${props.channelForceJoined
        ? html`
            <div class="chat-nav-channel-mode__text">
              <span>🔧</span>
              <span>强行接入模式</span>
            </div>
            <button
              class="chat-nav-channel-mode__btn chat-nav-channel-mode__btn--exit"
              type="button"
              @click=${props.onChannelForceJoinToggle}
            >
              退出接入
            </button>
          `
        : html`
            <div class="chat-nav-channel-mode__text">
              <span>👀</span>
              <span>只读观察</span>
            </div>
            <button
              class="chat-nav-channel-mode__btn"
              type="button"
              @click=${props.onChannelForceJoinToggle}
            >
              强行接入
            </button>
          `}
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
        <span class="chat-nav-empty__text">无匹配结果</span>
        <button
          class="chat-nav-empty__action"
          type="button"
          @click=${() => props.onSearchChange("")}
        >
          清除搜索
        </button>
      </div>
    `;
  }

  // 没有任何数据
  return html`
    <div class="chat-nav-empty">
      <span class="chat-nav-empty__icon">💭</span>
      <span class="chat-nav-empty__text">暂无对话</span>
      <span class="chat-nav-empty__hint">切换到其他标签页配置智能体和通道</span>
    </div>
  `;
}
