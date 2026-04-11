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

  // nav5 修复：父节点已展开时不显示聚合 badge（子节点各自展示）
  // 只有折叠时才在父节点显示汇总未读数（与 Slack 行为一致）
  const showBadge = totalUnread > 0 && (!hasChildren || !expanded);

  return html`
    <div class="chat-nav-root">
      <div
        class="chat-nav-root__header ${isActive ? "chat-nav-root--active" : ""}"
        @click=${() => {
          if (hasChildren) {
            props.onToggleNode(node.id);
          }
          // 根节点始终可点击跳转（展开/折叠同时跳转到该节点的 context）
          // 纯分类容器（nodeType === "category" 且无实际 sessionKey）除外
          props.onSelectContext(node.context);
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
          showBadge
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
  // 部门聊天室 / 部门广播 节点路由到专属渲染器
  if (node.context.type === "dept-room" || node.context.type === "dept-broadcast") {
    return renderDeptNavNode(node, props, level);
  }

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
          // 子节点始终可点击跳转（纯分类容器 nodeType=category 且有子节点时，
          // 仍然跳转到该节点 context，方便聚合视图切换）
          props.onSelectContext(node.context);
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

// ============ 部门节点渲染 ============

/**
 * 渲染部门聊天室入口节点（导航树内嵌入）
 * 防守 A3：跨部门节点加 🔒 锁图标
 */
export function renderDeptNavNode(
  node: ChatNavigationNode,
  props: ChatNavigationTreeProps,
  depth: number = 0,
): TemplateResult {
  const ctx = node.context;
  const isDeptRoom = ctx.type === "dept-room";
  const isDeptBroadcast = ctx.type === "dept-broadcast";
  const isActive = isSameContext(ctx, props.currentContext);

  // 部门成员身份
  const isMember = isDeptRoom && (ctx as { isMember?: boolean }).isMember;
  const isAdmin = isDeptBroadcast && (ctx as { isAdmin?: boolean }).isAdmin;
  const sandboxEnabled = isDeptRoom && (ctx as { sandboxEnabled?: boolean }).sandboxEnabled;

  // 权限标识：非成员显示锁
  const accessIcon =
    !isMember && !isAdmin && (isDeptRoom || isDeptBroadcast)
      ? html`
          <span title="无权访问（非成员）" style="font-size: 0.75em; opacity: 0.6; margin-left: 2px">🔒</span>
        `
      : nothing;

  // 沙箱标识
  const sandboxBadge = sandboxEnabled
    ? html`
        <span
          title="Docker 沙箱隔离已启用"
          style="font-size: 0.65em; color: var(--success, #22c55e); margin-left: 2px"
          >📦</span
        >
      `
    : nothing;

  return html`
    <div class="chat-nav-item chat-nav-item--level-${Math.min(depth, 3)} chat-nav-item--dept">
      <div
        class="chat-nav-item__content ${isActive ? "chat-nav-item--active" : ""}"
        @click=${() => props.onSelectContext(ctx)}
      >
        <span class="chat-nav-item__icon">${node.icon}</span>
        <span class="chat-nav-item__label">${node.label}</span>
        ${accessIcon}
        ${sandboxBadge}
        ${
          node.unreadCount && node.unreadCount > 0
            ? html`<span class="chat-nav-badge">${node.unreadCount > 99 ? "99+" : node.unreadCount}</span>`
            : nothing
        }
      </div>
    </div>
  `;
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
