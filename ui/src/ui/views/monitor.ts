/**
 * Monitor View
 * 协作监控界面
 */

import { html, nothing } from "lit";
import type {
  ActiveSession,
  MessageFlow,
  ForwardingRule,
  PerformanceMetrics,
  Alert,
} from "../controllers/monitor.ts";
import { t } from "../i18n.ts";

export type MonitorSubPanel = "sessions" | "flows" | "forwarding" | "metrics" | "alerts";

export type MonitorProps = {
  loading: boolean;
  error: string | null;
  activeSubPanel: MonitorSubPanel;
  // Sessions
  sessionsLoading: boolean;
  sessionsError: string | null;
  activeSessions: ActiveSession[];
  // Message Flows
  messageFlowsLoading: boolean;
  messageFlows: MessageFlow[];
  // Forwarding Rules
  forwardingRulesLoading: boolean;
  forwardingRules: ForwardingRule[];
  editingRule: ForwardingRule | null;
  creatingRule: boolean;
  // Metrics
  metricsLoading: boolean;
  metrics: PerformanceMetrics | null;
  // Alerts
  alertsLoading: boolean;
  alerts: Alert[];

  onRefresh: () => void;
  onSelectSubPanel: (panel: MonitorSubPanel) => void;
  onAddForwardingRule: () => void;
  onEditForwardingRule: (rule: ForwardingRule) => void;
  onDeleteForwardingRule: (ruleId: string) => void;
  onSaveForwardingRule: (rule: Partial<ForwardingRule>) => void;
  onCancelEditRule: () => void;
  onRuleFormChange: (field: string, value: any) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onClearAllAlerts: () => void;
};

export function renderMonitorView(props: MonitorProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">📊 ${t("collaboration.monitor.title")}</div>
          <div class="card-sub">${t("collaboration.monitor.subtitle")}</div>
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

      ${renderMonitorTabs(props)}

      <div style="margin-top: 16px;">
        ${
          props.activeSubPanel === "sessions"
            ? renderSessions(props)
            : props.activeSubPanel === "flows"
              ? renderMessageFlows(props)
              : props.activeSubPanel === "forwarding"
                ? renderForwardingRules(props)
                : props.activeSubPanel === "metrics"
                  ? renderMetrics(props)
                  : renderAlerts(props)
        }
      </div>
    </section>
  `;
}

function renderMonitorTabs(props: MonitorProps) {
  const tabs: Array<{ id: MonitorSubPanel; label: string; icon: string; count?: number }> = [
    { id: "sessions", label: "活动会话", icon: "💬", count: props.activeSessions.length },
    { id: "flows", label: "消息流", icon: "🔀", count: props.messageFlows.length },
    { id: "forwarding", label: "转发规则", icon: "📡", count: props.forwardingRules.length },
    { id: "metrics", label: "性能指标", icon: "📈" },
    {
      id: "alerts",
      label: "告警",
      icon: "🔔",
      count: props.alerts.filter((a) => !a.acknowledged).length,
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

function renderSessions(props: MonitorProps) {
  if (props.sessionsLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (props.sessionsError) {
    return html`
      <div class="empty-state">
        <div style="color: var(--danger-color);">❌ ${props.sessionsError}</div>
      </div>
    `;
  }

  if (props.activeSessions.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">💬</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无活动会话</div>
        <div class="muted">当前没有正在进行的协作会话</div>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="muted" style="margin-bottom: 8px;">共 ${props.activeSessions.length} 个活动会话</div>

      ${props.activeSessions.map(
        (session) => html`
          <div class="card" style="padding: 12px;">
            <div class="row" style="justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <div style="font-weight: 500;">
                  ${session.agentName || session.agentId}
                  <span class="muted" style="font-weight: normal;">@ ${session.channelId}</span>
                </div>
                <div class="muted" style="font-size: 12px; margin-top: 4px;">
                  对话ID: ${session.peerId} • ${session.messageCount} 条消息 •
                  ${
                    session.status === "active"
                      ? "🟢 活跃"
                      : session.status === "idle"
                        ? "🟡 空闲"
                        : "🔴 错误"
                  }
                </div>
                <div class="muted" style="font-size: 11px; margin-top: 2px;">
                  开始: ${new Date(session.startedAt).toLocaleString()} • 最后活动:
                  ${new Date(session.lastActivityAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderMessageFlows(props: MonitorProps) {
  if (props.messageFlowsLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (props.messageFlows.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">🔀</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无消息流数据</div>
        <div class="muted">还没有记录智能助手之间的消息流动</div>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="muted" style="margin-bottom: 8px;">共 ${props.messageFlows.length} 条消息流</div>

      ${props.messageFlows.map(
        (flow) => html`
          <div class="card" style="padding: 12px;">
            <div class="row" style="justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <div style="font-weight: 500;">
                  ${flow.fromAgentId} → ${flow.toAgentId}
                  <span class="muted" style="font-weight: normal;">via ${flow.channelId}</span>
                </div>
                <div class="muted" style="font-size: 12px; margin-top: 4px;">
                  ${flow.count} 条消息 • 平均响应时间: ${flow.avgResponseTime.toFixed(0)}ms
                </div>
                <div class="muted" style="font-size: 11px; margin-top: 2px;">
                  最后消息: ${new Date(flow.lastMessageAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderForwardingRules(props: MonitorProps) {
  if (props.forwardingRulesLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (props.creatingRule || props.editingRule) {
    return renderForwardingRuleForm(props);
  }

  if (props.forwardingRules.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px;">📡</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px;">暂无转发规则</div>
        <div class="muted">创建转发规则以在通道间转发消息</div>
        <button class="btn-primary" @click=${props.onAddForwardingRule} style="margin-top: 16px;">
          ➕ 添加转发规则
        </button>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <div class="muted">共 ${props.forwardingRules.length} 条转发规则</div>
        <button class="btn-secondary" @click=${props.onAddForwardingRule}>
          ➕ 添加规则
        </button>
      </div>

      ${props.forwardingRules.map(
        (rule) => html`
          <div class="card" style="padding: 12px;">
            <div class="row" style="justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <div style="font-weight: 500;">
                  ${rule.name}
                  ${
                    rule.enabled
                      ? html`
                          <span class="badge" style="background: var(--success-color)">启用</span>
                        `
                      : html`
                          <span class="badge" style="background: var(--muted-color)">禁用</span>
                        `
                  }
                </div>
                <div class="muted" style="font-size: 12px; margin-top: 4px;">
                  ${rule.sourceChannelId} → ${rule.targetChannelId}
                </div>
                ${
                  rule.sourceAgentId || rule.targetAgentId
                    ? html`
                        <div class="muted" style="font-size: 11px; margin-top: 2px;">
                          ${rule.sourceAgentId ? `从: ${rule.sourceAgentId}` : ""}
                          ${rule.targetAgentId ? ` 到: ${rule.targetAgentId}` : ""}
                        </div>
                      `
                    : nothing
                }
                <div class="muted" style="font-size: 11px; margin-top: 2px;">
                  创建于: ${new Date(rule.createdAt).toLocaleString()}
                </div>
              </div>
              <div class="row" style="gap: 4px;">
                <button
                  class="btn-icon"
                  @click=${() => props.onToggleRule(rule.id, !rule.enabled)}
                  title="${rule.enabled ? "禁用" : "启用"}"
                >
                  ${rule.enabled ? "⏸️" : "▶️"}
                </button>
                <button
                  class="btn-icon"
                  @click=${() => props.onEditForwardingRule(rule)}
                  title="编辑"
                >
                  ✏️
                </button>
                <button
                  class="btn-icon"
                  @click=${() => props.onDeleteForwardingRule(rule.id)}
                  title="删除"
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

function renderForwardingRuleForm(props: MonitorProps) {
  const rule = props.editingRule;
  const isEdit = !!rule;

  return html`
    <div class="card" style="padding: 16px;">
      <div style="font-weight: 500; margin-bottom: 16px;">
        ${isEdit ? "编辑转发规则" : "创建转发规则"}
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label>规则名称 *</label>
          <input
            type="text"
            placeholder="例如：Telegram to Discord"
            .value=${rule?.name || ""}
            @input=${(e: Event) =>
              props.onRuleFormChange("name", (e.target as HTMLInputElement).value)}
            style="width: 100%;"
          />
        </div>

        <div>
          <label>源通道 ID *</label>
          <input
            type="text"
            placeholder="telegram"
            .value=${rule?.sourceChannelId || ""}
            @input=${(e: Event) =>
              props.onRuleFormChange("sourceChannelId", (e.target as HTMLInputElement).value)}
            style="width: 100%;"
          />
        </div>

        <div>
          <label>目标通道 ID *</label>
          <input
            type="text"
            placeholder="discord"
            .value=${rule?.targetChannelId || ""}
            @input=${(e: Event) =>
              props.onRuleFormChange("targetChannelId", (e.target as HTMLInputElement).value)}
            style="width: 100%;"
          />
        </div>

        <div>
          <label>源智能助手 ID（可选）</label>
          <input
            type="text"
            placeholder="留空表示所有智能助手"
            .value=${rule?.sourceAgentId || ""}
            @input=${(e: Event) =>
              props.onRuleFormChange("sourceAgentId", (e.target as HTMLInputElement).value)}
            style="width: 100%;"
          />
        </div>

        <div>
          <label>目标智能助手 ID（可选）</label>
          <input
            type="text"
            placeholder="留空表示所有智能助手"
            .value=${rule?.targetAgentId || ""}
            @input=${(e: Event) =>
              props.onRuleFormChange("targetAgentId", (e.target as HTMLInputElement).value)}
            style="width: 100%;"
          />
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              .checked=${rule?.enabled !== false}
              @change=${(e: Event) =>
                props.onRuleFormChange("enabled", (e.target as HTMLInputElement).checked)}
            />
            启用规则
          </label>
        </div>
      </div>

      <div class="row" style="gap: 8px; margin-top: 16px;">
        <button class="btn-primary" @click=${() => props.onSaveForwardingRule(rule || {})}>
          保存
        </button>
        <button class="btn-secondary" @click=${props.onCancelEditRule}>取消</button>
      </div>
    </div>
  `;
}

function renderMetrics(props: MonitorProps) {
  if (props.metricsLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (!props.metrics) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">📈</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无性能数据</div>
      </div>
    `;
  }

  const metrics = props.metrics;
  const uptimeHours = Math.floor((Date.now() - metrics.uptime) / (1000 * 60 * 60));

  return html`
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 16px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold; color: var(--primary-color);">
          ${metrics.totalMessages}
        </div>
        <div class="muted">总消息数</div>
      </div>

      <div class="card" style="padding: 16px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold; color: var(--primary-color);">
          ${metrics.totalSessions}
        </div>
        <div class="muted">总会话数</div>
      </div>

      <div class="card" style="padding: 16px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold; color: var(--primary-color);">
          ${metrics.avgResponseTime.toFixed(0)}ms
        </div>
        <div class="muted">平均响应时间</div>
      </div>

      <div class="card" style="padding: 16px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold; color: ${metrics.errorRate > 0.1 ? "var(--danger-color)" : "var(--success-color)"};">
          ${(metrics.errorRate * 100).toFixed(1)}%
        </div>
        <div class="muted">错误率</div>
      </div>

      <div class="card" style="padding: 16px; text-align: center;">
        <div style="font-size: 32px; font-weight: bold; color: var(--primary-color);">
          ${uptimeHours}h
        </div>
        <div class="muted">运行时长</div>
      </div>

      <div class="card" style="padding: 16px; text-align: center;">
        <div style="font-size: 14px; color: var(--muted-color);">
          最后更新: ${new Date(metrics.lastUpdated).toLocaleTimeString()}
        </div>
      </div>
    </div>
  `;
}

function renderAlerts(props: MonitorProps) {
  if (props.alertsLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  const unacknowledgedAlerts = props.alerts.filter((a) => !a.acknowledged);

  if (props.alerts.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">🔔</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无告警</div>
        <div class="muted">系统运行正常，没有告警信息</div>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <div class="muted">
          共 ${props.alerts.length} 条告警（${unacknowledgedAlerts.length} 条未确认）
        </div>
        ${
          props.alerts.length > 0
            ? html`
                <button class="btn-danger" @click=${props.onClearAllAlerts}>清除所有告警</button>
              `
            : nothing
        }
      </div>

      ${props.alerts.map(
        (alert) => html`
          <div
            class="card"
            style="
              padding: 12px;
              border-left: 4px solid ${
                alert.type === "error"
                  ? "var(--danger-color)"
                  : alert.type === "warning"
                    ? "var(--warning-color)"
                    : "var(--info-color)"
              };
              ${alert.acknowledged ? "opacity: 0.6;" : ""}
            "
          >
            <div class="row" style="justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <div style="font-weight: 500;">
                  ${alert.type === "error" ? "❌" : alert.type === "warning" ? "⚠️" : "ℹ️"}
                  ${alert.message}
                  ${
                    alert.acknowledged
                      ? html`
                          <span class="badge">已确认</span>
                        `
                      : nothing
                  }
                </div>
                ${
                  alert.agentId || alert.channelId
                    ? html`
                        <div class="muted" style="font-size: 12px; margin-top: 4px;">
                          ${alert.agentId ? `助手: ${alert.agentId}` : ""}
                          ${alert.channelId ? ` • 通道: ${alert.channelId}` : ""}
                        </div>
                      `
                    : nothing
                }
                <div class="muted" style="font-size: 11px; margin-top: 2px;">
                  ${new Date(alert.timestamp).toLocaleString()}
                </div>
              </div>
              ${
                !alert.acknowledged
                  ? html`
                      <button
                        class="btn-secondary"
                        @click=${() => props.onAcknowledgeAlert(alert.id)}
                        style="margin-left: 8px;"
                      >
                        确认
                      </button>
                    `
                  : nothing
              }
            </div>
          </div>
        `,
      )}
    </div>
  `;
}
