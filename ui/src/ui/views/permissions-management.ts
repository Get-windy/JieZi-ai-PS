/**
 * 权限管理 UI 组件
 *
 * 提供智能体权限配置的可视化管理界面
 */

import { html, nothing } from "lit";
import { listCoreToolSections } from "../../../../src/agents/tool-catalog.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import { t } from "../i18n.js";

/**
 * 权限主体类型
 */
export type PermissionSubjectType = "user" | "group" | "role";

/**
 * 权限动作
 */
export type PermissionAction = "allow" | "deny" | "require_approval";

/**
 * 角色信息
 */
export type RoleInfo = {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
};

/**
 * 权限规则（引用全局角色ID）
 */
export type PermissionRule = {
  id: string;
  toolName: string;
  roleIds: string[]; // 引用全局角色ID列表
  action: PermissionAction;
  description?: string;
  enabled?: boolean;
  priority?: number;
};

/**
 * 权限配置
 */
export type PermissionsConfig = {
  defaultAction?: PermissionAction;
  rules: PermissionRule[];
  roles?: RoleInfo[];
  enableAuditLog?: boolean;
};

/**
 * 组件属性
 */
export type PermissionsManagementProps = {
  /** 当前选中的智能体ID */
  agentId: string | null;

  /** 智能体列表 */
  agents: Array<{ id: string; name?: string }>;

  /** 权限配置 */
  permissionsConfig: PermissionsConfig | null;

  /** 加载状态 */
  loading: boolean;

  /** 错误信息 */
  error: string | null;

  /** 保存状态 */
  saving: boolean;

  /** 保存成功标志 */
  saveSuccess: boolean;

  /** 可用角色列表 */
  availableRoles: RoleInfo[];

  /** 工具类别 */
  toolCategories: Record<string, string[]>;

  /** 预定义角色ID */
  predefinedRoles: Record<string, string>;

  /** 当前激活的标签页（移除roles，角色在组织与权限模块管理） */
  activeTab: "overview" | "rules" | "audit";

  /** 选中的目标智能体（用于角色分配） */
  selectedTargetAgent: string | null;

  /** 目标智能体的角色列表 */
  targetAgentRoles: RoleInfo[];

  /** 目标智能体角色加载状态 */
  targetAgentRolesLoading: boolean;

  /** Gateway 客户端 */
  gateway: GatewayBrowserClient;

  /** 事件处理器 */
  onInitPermissions: (agentId: string) => Promise<void>;
  onAddRule: (agentId: string, rule: Partial<PermissionRule>) => Promise<void>;
  onUpdateRule: (
    agentId: string,
    ruleId: string,
    updates: Partial<PermissionRule>,
  ) => Promise<void>;
  onDeleteRule: (agentId: string, ruleId: string) => Promise<void>;
  onToggleRule: (agentId: string, ruleId: string, enabled: boolean) => Promise<void>;
  onSwitchTab: (tab: "overview" | "rules" | "audit") => void;
  onRefresh: () => void;
  /** 审计日志列表（来自 permissions.history API） */
  auditLogs?: Array<{
    id: string;
    timestamp: number;
    user?: { type: string; id: string; name?: string };
    toolName: string;
    toolParams?: Record<string, unknown>;
    result: "allowed" | "denied" | "requires_approval";
    appliedRuleId?: string;
    denialReason?: string;
    approvalId?: string;
    sessionId?: string;
    agentId?: string;
  }>;
  /** 审计日志加载中 */
  auditLoading?: boolean;
  /** 加载审计日志 */
  onLoadAuditLogs?: () => void;
  /**
   * 工具标签页已启用的工具 ID 列表。
   * 若不提供（undefined）则不过滤，全部工具均可配置。
   */
  enabledToolIds?: string[];
  /**
   * 批量替换规则列表（用于分组快捷操作，避免逐条调用产生竞争条件）。
   */
  onBatchSetRules?: (agentId: string, newRules: PermissionRule[]) => void;
};

/**
 * 渲染概览标签页
 */
function renderOverviewTab(props: PermissionsManagementProps) {
  const { permissionsConfig, agentId } = props;

  if (!permissionsConfig) {
    return html`
      <section class="card">
        <div class="card-title">🔒 ${t("permission.notInitialized")}</div>
        <div class="card-sub">${t("permission.notInitializedDesc")}</div>
        <div style="margin-top: 16px;">
          <button 
            type="button"
            class="btn"
            @click=${() => {
              if (agentId) {
                void props.onInitPermissions(agentId);
              }
            }}
            ?disabled=${props.loading || !agentId}
          >
            ${t("permission.initialize")}
          </button>
        </div>
      </section>
    `;
  }

  const totalRules = permissionsConfig.rules.length;
  const enabledRules = permissionsConfig.rules.filter((r) => r.enabled !== false).length;
  const allowRules = permissionsConfig.rules.filter((r) => r.action === "allow").length;
  const denyRules = permissionsConfig.rules.filter((r) => r.action === "deny").length;
  const approvalRules = permissionsConfig.rules.filter(
    (r) => r.action === "require_approval",
  ).length;
  const defaultAction = permissionsConfig.defaultAction || "deny";

  return html`
    <!-- 配置摘要 -->
    <section class="card">
      <div class="card-title">${t("permission.overview")}</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 12px;">
        <div style="padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.8rem;">${t("permission.totalRules")}</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; margin-top: 4px;">${totalRules}</div>
          <div class="muted" style="font-size: 0.75rem;">${enabledRules} ${t("permission.enabled")}</div>
        </div>
        <div style="padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.8rem;">${t("permission.action.allow")}</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--color-success); margin-top: 4px;">${allowRules}</div>
          <div class="muted" style="font-size: 0.75rem;">${t("permission.rules")}</div>
        </div>
        <div style="padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.8rem;">${t("permission.action.deny")}</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--color-danger); margin-top: 4px;">${denyRules}</div>
          <div class="muted" style="font-size: 0.75rem;">${t("permission.rules")}</div>
        </div>
        <div style="padding: 12px; border-radius: 6px; background: var(--bg-1);">
          <div class="muted" style="font-size: 0.8rem;">${t("permission.action.requireApproval")}</div>
          <div class="mono" style="font-size: 1.5rem; font-weight: 700; color: var(--color-warning); margin-top: 4px;">${approvalRules}</div>
          <div class="muted" style="font-size: 0.75rem;">${t("permission.rules")}</div>
        </div>
      </div>
      <div style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; background: var(--bg-1); display: flex; align-items: center; gap: 8px;">
        <span class="muted" style="font-size: 0.85rem;">${t("permission.defaultAction")}:</span>
        <span class="mono" style="font-size: 0.9rem; font-weight: 600;">${defaultAction}</span>
        <span class="muted" style="font-size: 0.75rem;">（${t("permission.whenNoMatch")}）</span>
      </div>
    </section>
    
    <!-- 角色提示 -->
    <section class="card" style="margin-top: 12px;">
      <div class="card-title">${t("permission.availableRoles")}</div>
      <div class="card-sub" style="margin-top: 4px;">💡 角色在<strong>"组织与权限"</strong>模块中创建和管理，这里仅供查看和引用</div>
    </section>
  `;
}

/**
 * 渲染审计日志标签页
 */
function renderAuditTab(props: PermissionsManagementProps) {
  const logs = props.auditLogs || [];
  const loading = props.auditLoading || false;

  // 统计数据
  const total = logs.length;
  const allowed = logs.filter((l) => l.result === "allowed").length;
  const denied = logs.filter((l) => l.result === "denied").length;
  const pending = logs.filter((l) => l.result === "requires_approval").length;

  // 时间格式化
  function formatTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  // 结果徽章
  function resultBadge(result: string) {
    if (result === "allowed") {
      return html`
        <span
          style="
            color: var(--color-success, #22c55e);
            font-size: 0.8rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 10px;
            border: 1px solid currentColor;
          "
          >✅ 允许</span
        >
      `;
    }
    if (result === "denied") {
      return html`
        <span
          style="
            color: var(--color-danger, #ef4444);
            font-size: 0.8rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 10px;
            border: 1px solid currentColor;
          "
          >❌ 拒绝</span
        >
      `;
    }
    return html`
      <span
        style="
          color: var(--color-warning, #f59e0b);
          font-size: 0.8rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
          border: 1px solid currentColor;
        "
        >🟡 待审批</span
      >
    `;
  }

  return html`
    <!-- 统计卡片 -->
    <section class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">📋 ${t("permission.auditLog")}</div>
          <div class="card-sub">记录工具权限检查的历史事件，展示每次工具调用的权限检查结果</div>
        </div>
        <button
          type="button"
          class="btn btn--sm"
          ?disabled=${loading}
          @click=${() => props.onLoadAuditLogs?.()}
        >${loading ? "加载中…" : "🔄 刷新"}</button>
      </div>

      <!-- 统计卡 -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 16px;">
        <div style="padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-1); text-align: center;">
          <div class="muted" style="font-size: 0.75rem;">全部记录</div>
          <div class="mono" style="font-size: 1.4rem; font-weight: 700; margin-top: 2px;">${total}</div>
        </div>
        <div style="padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-1); text-align: center;">
          <div class="muted" style="font-size: 0.75rem;">已允许</div>
          <div class="mono" style="font-size: 1.4rem; font-weight: 700; color: var(--color-success, #22c55e); margin-top: 2px;">${allowed}</div>
        </div>
        <div style="padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-1); text-align: center;">
          <div class="muted" style="font-size: 0.75rem;">已拒绝</div>
          <div class="mono" style="font-size: 1.4rem; font-weight: 700; color: var(--color-danger, #ef4444); margin-top: 2px;">${denied}</div>
        </div>
        <div style="padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-1); text-align: center;">
          <div class="muted" style="font-size: 0.75rem;">待审批</div>
          <div class="mono" style="font-size: 1.4rem; font-weight: 700; color: var(--color-warning, #f59e0b); margin-top: 2px;">${pending}</div>
        </div>
      </div>
    </section>

    <!-- 日志列表 -->
    <section class="card" style="margin-top: 12px;">
      ${
        loading
          ? html`
              <div class="loading" style="text-align: center; padding: 32px 0">加载审计日志中…</div>
            `
          : total === 0
            ? html`
        <div style="text-align: center; padding: 48px 16px;">
          <div style="font-size: 2rem; margin-bottom: 12px;">📋</div>
          <div style="font-weight: 600; margin-bottom: 6px;">暂无审计记录</div>
          <div class="muted" style="font-size: 0.875rem; max-width: 360px; margin: 0 auto; line-height: 1.6;">
            当助手调用工具时，权限检查结果将一条条记录在此。
            目前后端审计存储正在建设中，预计下个版本上线。
          </div>
          <button type="button" class="btn btn--sm" style="margin-top: 16px;" @click=${() => props.onLoadAuditLogs?.()}>🔄 重新加载</button>
        </div>
      `
            : html`
        <!-- 日志表格 -->
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border);">
                <th style="text-align: left; padding: 8px 10px; font-weight: 600; white-space: nowrap; color: var(--muted);">时间</th>
                <th style="text-align: left; padding: 8px 10px; font-weight: 600; white-space: nowrap; color: var(--muted);">工具</th>
                <th style="text-align: left; padding: 8px 10px; font-weight: 600; white-space: nowrap; color: var(--muted);">结果</th>
                <th style="text-align: left; padding: 8px 10px; font-weight: 600; white-space: nowrap; color: var(--muted);">Session</th>
                <th style="text-align: left; padding: 8px 10px; font-weight: 600; white-space: nowrap; color: var(--muted);">原因/备注</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(
                (log, i) => html`
                <tr style="border-bottom: 1px solid var(--border); background: ${i % 2 === 0 ? "transparent" : "var(--bg-elevated)"}; transition: background var(--duration-fast);"
                    @mouseenter=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--secondary)";
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.background =
                        i % 2 === 0 ? "transparent" : "var(--bg-elevated)";
                    }}
                >
                  <td style="padding: 8px 10px; white-space: nowrap; font-family: var(--mono); font-size: 0.78rem; color: var(--muted);">${formatTime(log.timestamp)}</td>
                  <td style="padding: 8px 10px;">
                    <span class="mono" style="font-weight: 600;">${log.toolName}</span>
                    ${log.user ? html`<div class="muted" style="font-size: 0.75rem;">${log.user.name || log.user.id}</div>` : nothing}
                  </td>
                  <td style="padding: 8px 10px;">${resultBadge(log.result)}</td>
                  <td style="padding: 8px 10px; font-family: var(--mono); font-size: 0.78rem; color: var(--muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${
                      log.sessionId
                        ? html`<span title=${log.sessionId}>${log.sessionId.slice(0, 12)}&hellip;</span>`
                        : html`
                            <span class="muted">—</span>
                          `
                    }
                  </td>
                  <td style="padding: 8px 10px; color: var(--muted); font-size: 0.8rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${log.denialReason || (log.approvalId ? `审批 #${log.approvalId.slice(0, 8)}` : "—")}
                  </td>
                </tr>
              `,
              )}
            </tbody>
          </table>
        </div>
      `
      }
    </section>
  `;
}

/**
 * 从 tool-catalog.ts 动态构建工具分组（权限规则页展示用）。
 * 以后只需在 tool-catalog.ts 增加工具，此处自动同步，无需手动维护。
 */
function buildToolGroups(): Array<{ label: string; tools: string[] }> {
  return listCoreToolSections().map((section) => ({
    label: t(`agents.tools.section.${section.id}`, section.label),
    tools: section.tools.map((tool) => tool.id),
  }));
}

/**
 * 渲染规则标签页（工具标签页风格：展示所有工具分组，每行直接内联配置）
 */
function renderRulesTab(props: PermissionsManagementProps) {
  const { permissionsConfig, agentId } = props;

  if (!permissionsConfig) {
    return html`
      <section class="card">
        <div class="muted">${t("permission.noConfig")}</div>
      </section>
    `;
  }

  // 建立 toolName → rules[] 索引
  const rulesByTool = new Map<string, PermissionRule[]>();
  for (const rule of permissionsConfig.rules) {
    if (!rulesByTool.has(rule.toolName)) {
      rulesByTool.set(rule.toolName, []);
    }
    rulesByTool.get(rule.toolName)!.push(rule);
  }

  // 返回工具的当前主规则（如果仅有一条规则，直接返回其动作；否则返回 null）
  function getPrimaryAction(toolName: string): PermissionAction | null {
    const toolRules = rulesByTool.get(toolName);
    if (!toolRules || toolRules.length === 0) {
      return null;
    }
    if (toolRules.length === 1) {
      return toolRules[0].action;
    }
    return null; // 多条规则，用独立行展示
  }

  // 处理工具动作变更
  function handleActionChange(toolName: string, newAction: string) {
    if (!agentId) {
      return;
    }
    preserveScroll(() => {
      const toolRules = rulesByTool.get(toolName) || [];
      if (newAction === "default") {
        // 删除所有属于该工具的规则
        for (const r of toolRules) {
          void props.onDeleteRule(agentId, r.id);
        }
      } else if (toolRules.length === 0) {
        // 创建新规则
        void props.onAddRule(agentId, {
          id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          toolName,
          action: newAction as PermissionAction,
          roleIds: [],
          enabled: true,
        });
      } else if (toolRules.length === 1) {
        // 更新已有规则
        void props.onUpdateRule(agentId, toolRules[0].id, {
          action: newAction as PermissionAction,
        });
      }
    }); // end preserveScroll
  }

  // 工具名称本地化：优先读 i18n、无译文则回退到技术 ID
  function toolDisplayName(toolId: string): string {
    return t(`agents.tools.tool.${toolId}`, toolId);
  }

  // 保存并在下一帧恢复滚动位置（防止重渲染后页面回到顶部）
  function preserveScroll(fn: () => void): void {
    const scrollY = window.scrollY;
    fn();
    // 第一个 rAF 等 Lit 完成微任务调度的重渲染，第二个 rAF 确保 DOM 已应用
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - scrollY) > 50) {
          window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
        }
      });
    });
  }

  // 渲染单个工具行
  function renderToolRow(toolName: string) {
    const toolRules = rulesByTool.get(toolName) || [];
    const primaryAction = getPrimaryAction(toolName);
    const hasMultiRules = toolRules.length > 1;
    const singleRule = toolRules.length === 1 ? toolRules[0] : null;
    const selectValue = primaryAction ?? "default";

    return html`
      <div class="agent-tool-row">
        <!-- 工具名称：中文名 + 技术 ID 副标题 -->
        <div style="flex: 1; min-width: 0;">
          <div class="agent-tool-title">${toolDisplayName(toolName)}</div>
          <div class="agent-tool-sub mono">${toolName}</div>
          ${
            hasMultiRules
              ? html`
                  <div class="agent-tool-sub">多条规则，请在下方修改</div>
                `
              : nothing
          }
        </div>

        <!-- 动作选择器（单条规则或无规则时可改）-->
        ${
          !hasMultiRules
            ? html`
          <select
            style="font-size: 0.8rem; padding: 3px 6px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-1); cursor: pointer; flex-shrink: 0;"
            .value=${selectValue}
            @change=${(e: Event) => handleActionChange(toolName, (e.target as HTMLSelectElement).value)}
          >
            <option value="default">◯ 默认</option>
            <option value="allow">✅ 允许</option>
            <option value="deny">❌ 拒绝</option>
            <option value="require_approval">🟡 需审批</option>
          </select>
        `
            : nothing
        }

        <!-- 已有单条规则时显示启用开关 -->
        ${
          singleRule
            ? html`
          <label class="cfg-toggle" title="${singleRule.enabled === false ? "规则已禁用 — 点击启用" : "规则已启用 — 点击禁用"}" style="flex-shrink: 0;">
            <input type="checkbox"
              .checked=${singleRule.enabled !== false}
              @change=${() => agentId && props.onToggleRule(agentId, singleRule.id, singleRule.enabled !== false)}
            />
            <span class="cfg-toggle__track"></span>
          </label>
        `
            : nothing
        }

        <!-- 删除单条规则 -->
        ${
          singleRule
            ? html`
          <button type="button" class="btn btn--sm btn--danger" title="删除规则"
            @click=${() => {
              if (confirm(`确定删除 "${toolName}" 的权限规则吗？`)) {
                if (agentId) {
                  void props.onDeleteRule(agentId, singleRule.id);
                }
              }
            }}
          >✕</button>
        `
            : nothing
        }
      </div>

      <!-- 如果有多条规则，展开显示每条 -->
      ${
        hasMultiRules
          ? html`
        <div style="margin-top: 4px; display: grid; gap: 4px; padding-left: 8px; border-left: 2px solid var(--border);">
          ${toolRules.map(
            (rule) => html`
            <div style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: var(--bg-elevated); border-radius: var(--radius-md);">
              <label class="cfg-toggle" style="flex-shrink: 0;">
                <input type="checkbox" .checked=${rule.enabled !== false}
                  @change=${() => agentId && props.onToggleRule(agentId, rule.id, rule.enabled !== false)} />
                <span class="cfg-toggle__track"></span>
              </label>
              <span class="muted" style="font-size: 0.75rem; flex: 1;">
                ${rule.roleIds.length === 0 ? "所有角色" : rule.roleIds.join(", ")}
              </span>
              <select
                style="font-size: 0.78rem; padding: 2px 5px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-1);"
                .value=${rule.action}
                @change=${(e: Event) => agentId && props.onUpdateRule(agentId, rule.id, { action: (e.target as HTMLSelectElement).value as PermissionAction })}
              >
                <option value="allow">✅ 允许</option>
                <option value="deny">❌ 拒绝</option>
                <option value="require_approval">🟡 审批</option>
              </select>
              <button type="button" class="btn btn--sm btn--danger"
                @click=${() => {
                  if (confirm("确定删除这条规则吗？")) {
                    if (agentId) {
                      void props.onDeleteRule(agentId, rule.id);
                    }
                  }
                }}
              >✕</button>
            </div>
          `,
          )}
        </div>
      `
          : nothing
      }
    `;
  }

  // 批量设置一组工具的权限动作（单次写入，避免竞争条件）
  function handleGroupAction(toolNames: string[], newAction: string) {
    if (!agentId || !permissionsConfig) {
      return;
    }

    preserveScroll(() => {
      if (props.onBatchSetRules) {
        // 有批量接口：一次计算全部变更，单次写入
        let rules = [...permissionsConfig.rules];

        for (const toolName of toolNames) {
          const toolRules = rules.filter((r) => r.toolName === toolName);

          if (newAction === "default") {
            // 删除该工具的所有规则
            rules = rules.filter((r) => r.toolName !== toolName);
          } else if (toolRules.length === 0) {
            // 新增规则
            rules.push({
              id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${toolName}`,
              toolName,
              action: newAction as PermissionAction,
              roleIds: [],
              enabled: true,
            });
          } else if (toolRules.length === 1) {
            // 更新已有规则
            rules = rules.map((r) =>
              r.id === toolRules[0].id ? { ...r, action: newAction as PermissionAction } : r,
            );
          }
          // 多条规则的工具：更新所有条目
          else {
            rules = rules.map((r) =>
              r.toolName === toolName ? { ...r, action: newAction as PermissionAction } : r,
            );
          }
        }

        props.onBatchSetRules(agentId, rules);
      } else {
        // 降级：逐条调用（如果外层未提供批量接口）
        for (const toolName of toolNames) {
          handleActionChange(toolName, newAction);
        }
      }
    }); // end preserveScroll
  }

  // 动态构建工具分组（每次渲染时从 tool-catalog 派生，i18n 随当前语言实时更新）
  const toolGroups = buildToolGroups();
  // 所有已知工具集合
  const knownTools = new Set(toolGroups.flatMap((g) => g.tools));
  // 自定义工具（有规则但不在预置分组中）
  const customToolNames = Array.from(rulesByTool.keys()).filter((n) => !knownTools.has(n));

  // 工具启用过滤：若提供了 enabledToolIds，则只显示已启用工具；
  // 但已有规则的工具即使被禁用也保留显示（带警告）
  const enabledSet = props.enabledToolIds ? new Set(props.enabledToolIds) : null;

  function shouldShowTool(toolName: string): boolean {
    if (!enabledSet) {
      return true;
    } // 无过滤时全部显示
    if (enabledSet.has(toolName)) {
      return true;
    } // 已启用：显示
    // 已禁用但有已配置的规则：保留显示带警告
    return (rulesByTool.get(toolName) ?? []).length > 0;
  }

  function isToolDisabled(toolName: string): boolean {
    return enabledSet !== null && !enabledSet.has(toolName);
  }

  return html`
    <section class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">🛡️ ${t("permission.ruleManagement")}</div>
          <div class="card-sub">按工具直接配置权限，“默认”表示使用全局默认策略</div>
        </div>
        ${
          enabledSet
            ? html`
                <span class="muted" style="font-size: 0.78rem">仅显示已启用工具，禁用工具如有规则则加⚠️标注</span>
              `
            : nothing
        }
      </div>

      <div class="agent-tools-grid" style="margin-top: 16px;">
        ${toolGroups.map((group) => {
          const visibleTools = group.tools.filter((toolName) => shouldShowTool(toolName));
          if (visibleTools.length === 0) {
            return nothing;
          }
          return html`
            <div class="agent-tools-section">
              <div class="agent-tools-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span>${group.label}</span>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                  <button type="button" class="btn btn--sm" title="本组全部允许"
                    @click=${() => handleGroupAction(visibleTools, "allow")}
                    style="font-size: 0.7rem; padding: 1px 6px; color: var(--color-success, #22c55e); border-color: var(--color-success, #22c55e);"
                  >✅ 全允</button>
                  <button type="button" class="btn btn--sm" title="本组全部拒绝"
                    @click=${() => handleGroupAction(visibleTools, "deny")}
                    style="font-size: 0.7rem; padding: 1px 6px; color: var(--color-danger, #ef4444); border-color: var(--color-danger, #ef4444);"
                  >❌ 全拒</button>
                  <button type="button" class="btn btn--sm" title="本组全部需审批"
                    @click=${() => handleGroupAction(visibleTools, "require_approval")}
                    style="font-size: 0.7rem; padding: 1px 6px; color: var(--color-warning, #f59e0b); border-color: var(--color-warning, #f59e0b);"
                  >🟡 审批</button>
                  <button type="button" class="btn btn--sm" title="本组全部重置为默认"
                    @click=${() => handleGroupAction(visibleTools, "default")}
                    style="font-size: 0.7rem; padding: 1px 6px;"
                  >◯ 默认</button>
                </div>
              </div>
              <div class="agent-tools-list">
                ${visibleTools.map((toolName) => {
                  const disabled = isToolDisabled(toolName);
                  return html`
                    <div style="${disabled ? "opacity: 0.5;" : ""}">
                      ${
                        disabled
                          ? html`
                              <div style="font-size: 0.72rem; color: var(--color-warning, #f59e0b); margin-bottom: 2px">
                                ⚠️ 工具已禁用 — 此规则不会生效
                              </div>
                            `
                          : nothing
                      }
                      ${renderToolRow(toolName)}
                    </div>
                  `;
                })}
              </div>
            </div>
          `;
        })}

        ${
          customToolNames.filter((n) => shouldShowTool(n)).length > 0
            ? html`
          <div class="agent-tools-section">
            <div class="agent-tools-header">自定义工具</div>
            <div class="agent-tools-list">
              ${customToolNames
                .filter((n) => shouldShowTool(n))
                .map((toolName) => {
                  const disabled = isToolDisabled(toolName);
                  return html`
                  <div style="${disabled ? "opacity: 0.5;" : ""}">
                    ${
                      disabled
                        ? html`
                            <div style="font-size: 0.72rem; color: var(--color-warning, #f59e0b); margin-bottom: 2px">
                              ⚠️ 工具已禁用
                            </div>
                          `
                        : nothing
                    }
                    ${renderToolRow(toolName)}
                  </div>
                `;
                })}
            </div>
          </div>
        `
            : nothing
        }
      </div>
    </section>
  `;
}

/**
 * 主渲染函数
 */
export function renderPermissionsManagement(props: PermissionsManagementProps) {
  const { agentId, loading, error, activeTab, saveSuccess } = props;

  if (!agentId) {
    return html`
      <section class="card">
        <div class="muted">${t("permission.noAgentSelected")}</div>
      </section>
    `;
  }

  return html`
    <div class="perm-panel">
      <!-- 错误提示 -->
      ${
        error
          ? html`
        <div class="callout danger" style="margin-bottom: 12px;">
          ⚠️ ${error}
        </div>
      `
          : nothing
      }
      
      ${
        saveSuccess
          ? html`
        <div class="callout success" style="margin-bottom: 12px;">
          ✓ ${t("permission.saveSuccess")}
        </div>
      `
          : nothing
      }
      
      <!-- 子标签页导航 -->
      <div class="perm-tabs">
        <button 
          type="button"
          class="perm-tab ${activeTab === "overview" ? "active" : ""}"
          @click=${() => props.onSwitchTab("overview")}
        >
          ${t("permission.overview")}
        </button>
        <button 
          type="button"
          class="perm-tab ${activeTab === "rules" ? "active" : ""}"
          @click=${() => props.onSwitchTab("rules")}
        >
          ${t("permission.rules")}
        </button>
        <button 
          type="button"
          class="perm-tab ${activeTab === "audit" ? "active" : ""}"
          @click=${() => props.onSwitchTab("audit")}
        >
          ${t("permission.audit")}
        </button>
      </div>
      
      <!-- 标签页内容 -->
      <div style="${loading ? "opacity: 0.5; pointer-events: none;" : ""}">
        ${loading ? html`<section class="card"><div class="loading">${t("common.loading")}</div></section>` : nothing}
        
        ${!loading && activeTab === "overview" ? renderOverviewTab(props) : nothing}
        ${!loading && activeTab === "rules" ? renderRulesTab(props) : nothing}
        ${!loading && activeTab === "audit" ? renderAuditTab(props) : nothing}
      </div>
    </div>
  `;
}
