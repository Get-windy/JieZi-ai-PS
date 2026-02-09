/**
 * Message Queue View
 * 消息队列监控视图
 */

import { html, nothing } from "lit";
import type { QueuedMessage, QueueStats, QueueConfig } from "../controllers/message-queue.ts";
import { t } from "../i18n.ts";

export type MessageQueuePanel = "monitor" | "statistics" | "configuration";

export type MessageQueueProps = {
  activePanel: MessageQueuePanel;
  queueLoading: boolean;
  queueError: string | null;
  queueMessages: QueuedMessage[];
  queueStats: QueueStats | null;
  queueStatsLoading: boolean;
  queueConfig: QueueConfig | null;
  queueConfigLoading: boolean;
  queueConfigSaving: boolean;
  onSelectPanel: (panel: MessageQueuePanel) => void;
  onRefresh: () => void;
  onClearQueue: () => void;
  onSaveConfig: (config: Partial<QueueConfig>) => void;
};

/**
 * 渲染消息队列主页面
 */
export function renderMessageQueue(props: MessageQueueProps) {
  return html`
    <div class="message-queue-layout">
      <section class="card">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <div class="card-title">${t("messageQueue.title")}</div>
            <div class="card-sub">${t("messageQueue.subtitle")}</div>
          </div>
          <button class="btn btn--sm" ?disabled=${props.queueLoading} @click=${props.onRefresh}>
            ${props.queueLoading ? t("messageQueue.loading") : t("messageQueue.refresh")}
          </button>
        </div>

        ${
          props.queueError
            ? html`<div class="callout danger" style="margin-top: 12px;">${props.queueError}</div>`
            : nothing
        }

        ${renderMessageQueueTabs(props.activePanel, props.onSelectPanel)}

        <div style="margin-top: 20px;">
          ${
            props.activePanel === "monitor"
              ? renderQueueMonitor(props)
              : props.activePanel === "statistics"
                ? renderQueueStatistics(props)
                : renderQueueConfiguration(props)
          }
        </div>
      </section>
    </div>
  `;
}

/**
 * 渲染 Tab 切换
 */
function renderMessageQueueTabs(
  active: MessageQueuePanel,
  onSelect: (panel: MessageQueuePanel) => void,
) {
  const tabs: Array<{ id: MessageQueuePanel; label: string }> = [
    { id: "monitor", label: t("messageQueue.tab.monitor") },
    { id: "statistics", label: t("messageQueue.tab.statistics") },
    { id: "configuration", label: t("messageQueue.tab.configuration") },
  ];

  return html`
    <div class="agent-tabs" style="margin-top: 16px;">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

/**
 * 渲染监控面板
 */
function renderQueueMonitor(props: MessageQueueProps) {
  const stats = props.queueStats;

  return html`
    <div>
      <!-- 统计卡片区域 -->
      ${
        stats
          ? html`
            <div
              style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;"
            >
              <div class="stat-card">
                <div class="stat-label">${t("messageQueue.stats.pending")}</div>
                <div class="stat-value" style="color: var(--accent-orange);">${stats.pending}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">${t("messageQueue.stats.processing")}</div>
                <div class="stat-value" style="color: var(--accent-blue);">${stats.processing}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">${t("messageQueue.stats.completed")}</div>
                <div class="stat-value" style="color: var(--accent-green);">${stats.completed}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">${t("messageQueue.stats.failed")}</div>
                <div class="stat-value" style="color: var(--accent-red);">${stats.failed}</div>
              </div>
            </div>
          `
          : nothing
      }

      <!-- 操作按钮 -->
      <div style="margin-bottom: 16px; display: flex; gap: 8px;">
        <button
          class="btn btn--sm btn--danger"
          @click=${() => {
            if (confirm(t("messageQueue.clear_confirm"))) {
              props.onClearQueue();
            }
          }}
          ?disabled=${props.queueLoading || props.queueMessages.length === 0}
        >
          ${t("messageQueue.clear_queue")}
        </button>
      </div>

      <!-- 消息列表 -->
      <div class="label" style="margin-bottom: 8px;">
        ${t("messageQueue.messages")} (${props.queueMessages.length})
      </div>

      ${
        props.queueMessages.length === 0
          ? html`<div class="muted" style="padding: 24px; text-align: center;">
            ${t("messageQueue.no_messages")}
          </div>`
          : html`
            <div style="overflow-x: auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>${t("messageQueue.table.id")}</th>
                    <th>${t("messageQueue.table.priority")}</th>
                    <th>${t("messageQueue.table.created")}</th>
                    <th>${t("messageQueue.table.expires")}</th>
                    <th>${t("messageQueue.table.retry")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.queueMessages.map((msg) => renderMessageRow(msg))}
                </tbody>
              </table>
            </div>
          `
      }
    </div>
  `;
}

/**
 * 渲染消息行
 */
function renderMessageRow(msg: QueuedMessage) {
  const priorityColors: Record<string, string> = {
    urgent: "var(--accent-red)",
    high: "var(--accent-orange)",
    normal: "var(--accent-blue)",
    low: "var(--text-3)",
  };

  const createdTime = new Date(msg.createdAt).toLocaleString();
  const expiresTime = msg.expiresAt ? new Date(msg.expiresAt).toLocaleString() : "-";
  const isExpired = msg.expiresAt && msg.expiresAt < Date.now();

  return html`
    <tr>
      <td><span class="mono" style="font-size: 0.875rem;">${msg.id.slice(0, 12)}...</span></td>
      <td>
        <span class="agent-pill" style="background: ${priorityColors[msg.priority]}20; color: ${priorityColors[msg.priority]};">
          ${msg.priority}
        </span>
      </td>
      <td style="font-size: 0.875rem;">${createdTime}</td>
      <td style="font-size: 0.875rem; ${isExpired ? "color: var(--accent-red);" : ""}">${expiresTime}</td>
      <td>
        <span class="mono">${msg.retryCount} / ${msg.maxRetries}</span>
      </td>
    </tr>
  `;
}

/**
 * 渲染统计图表
 */
function renderQueueStatistics(props: MessageQueueProps) {
  const stats = props.queueStats;

  if (!stats) {
    return html`
      <div class="muted" style="padding: 24px; text-align: center;">
        ${t("messageQueue.no_stats")}
      </div>
    `;
  }

  const avgTimeSeconds = (stats.avgProcessingTime / 1000).toFixed(2);
  const total = stats.pending + stats.processing + stats.completed + stats.failed;
  const successRate = total > 0 ? ((stats.completed / total) * 100).toFixed(1) : "0";

  return html`
    <div>
      <!-- 关键指标卡片 -->
      <div
        style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 32px;"
      >
        <div class="stat-card-large">
          <div class="stat-label">${t("messageQueue.stats.avg_time")}</div>
          <div class="stat-value-large">${avgTimeSeconds}s</div>
          <div class="stat-desc">${t("messageQueue.stats.avg_time_desc")}</div>
        </div>
        <div class="stat-card-large">
          <div class="stat-label">${t("messageQueue.stats.success_rate")}</div>
          <div class="stat-value-large" style="color: var(--accent-green);">${successRate}%</div>
          <div class="stat-desc">${t("messageQueue.stats.success_rate_desc")}</div>
        </div>
        <div class="stat-card-large">
          <div class="stat-label">${t("messageQueue.stats.total_processed")}</div>
          <div class="stat-value-large">${total}</div>
          <div class="stat-desc">${t("messageQueue.stats.total_processed_desc")}</div>
        </div>
      </div>

      <!-- 状态分布 -->
      <div class="label" style="margin-bottom: 12px;">${t("messageQueue.stats.distribution")}</div>
      <div
        style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;"
      >
        <div style="padding: 16px; border-radius: 6px; background: var(--bg-1);">
          <div style="font-size: 0.875rem; color: var(--text-2);">
            ${t("messageQueue.stats.pending")}
          </div>
          <div style="font-size: 1.5rem; font-weight: 600; margin-top: 4px; color: var(--accent-orange);">
            ${stats.pending}
          </div>
        </div>
        <div style="padding: 16px; border-radius: 6px; background: var(--bg-1);">
          <div style="font-size: 0.875rem; color: var(--text-2);">
            ${t("messageQueue.stats.processing")}
          </div>
          <div style="font-size: 1.5rem; font-weight: 600; margin-top: 4px; color: var(--accent-blue);">
            ${stats.processing}
          </div>
        </div>
        <div style="padding: 16px; border-radius: 6px; background: var(--bg-1);">
          <div style="font-size: 0.875rem; color: var(--text-2);">
            ${t("messageQueue.stats.completed")}
          </div>
          <div style="font-size: 1.5rem; font-weight: 600; margin-top: 4px; color: var(--accent-green);">
            ${stats.completed}
          </div>
        </div>
        <div style="padding: 16px; border-radius: 6px; background: var(--bg-1);">
          <div style="font-size: 0.875rem; color: var(--text-2);">
            ${t("messageQueue.stats.failed")}
          </div>
          <div style="font-size: 1.5rem; font-weight: 600; margin-top: 4px; color: var(--accent-red);">
            ${stats.failed}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染配置面板
 */
function renderQueueConfiguration(props: MessageQueueProps) {
  if (props.queueConfigLoading) {
    return html`
      <div style="padding: 24px; text-align: center;">
        ${t("messageQueue.config.loading")}
      </div>
    `;
  }

  const config = props.queueConfig;
  if (!config) {
    return html`
      <div class="muted" style="padding: 24px; text-align: center;">
        ${t("messageQueue.config.no_config")}
      </div>
    `;
  }

  return html`
    <div style="max-width: 600px;">
      <div class="label" style="margin-bottom: 16px;">${t("messageQueue.config.title")}</div>

      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Batch Size -->
        <div>
          <label class="label" style="display: block; margin-bottom: 6px;">
            ${t("messageQueue.config.batch_size")}
          </label>
          <input
            type="number"
            class="input"
            id="batchSize"
            value="${config.batchSize}"
            min="1"
            max="100"
            style="width: 100%;"
          />
          <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
            ${t("messageQueue.config.batch_size_desc")}
          </div>
        </div>

        <!-- Interval -->
        <div>
          <label class="label" style="display: block; margin-bottom: 6px;">
            ${t("messageQueue.config.interval")}
          </label>
          <input
            type="number"
            class="input"
            id="intervalMs"
            value="${config.intervalMs}"
            min="100"
            max="60000"
            step="100"
            style="width: 100%;"
          />
          <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
            ${t("messageQueue.config.interval_desc")}
          </div>
        </div>

        <!-- Max Retries -->
        <div>
          <label class="label" style="display: block; margin-bottom: 6px;">
            ${t("messageQueue.config.max_retries")}
          </label>
          <input
            type="number"
            class="input"
            id="maxRetries"
            value="${config.maxRetries}"
            min="0"
            max="10"
            style="width: 100%;"
          />
          <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
            ${t("messageQueue.config.max_retries_desc")}
          </div>
        </div>

        <!-- Persistence -->
        <div>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input
              type="checkbox"
              id="persistenceEnabled"
              ?checked=${config.persistenceEnabled}
            />
            <span class="label">${t("messageQueue.config.persistence")}</span>
          </label>
          <div class="muted" style="font-size: 0.875rem; margin-top: 4px; margin-left: 28px;">
            ${t("messageQueue.config.persistence_desc")}
          </div>
        </div>

        <!-- Save Button -->
        <div style="margin-top: 8px;">
          <button
            class="btn"
            ?disabled=${props.queueConfigSaving}
            @click=${() => {
              const batchSize = parseInt(
                (document.getElementById("batchSize") as HTMLInputElement).value,
              );
              const intervalMs = parseInt(
                (document.getElementById("intervalMs") as HTMLInputElement).value,
              );
              const maxRetries = parseInt(
                (document.getElementById("maxRetries") as HTMLInputElement).value,
              );
              const persistenceEnabled = (
                document.getElementById("persistenceEnabled") as HTMLInputElement
              ).checked;

              props.onSaveConfig({
                batchSize,
                intervalMs,
                maxRetries,
                persistenceEnabled,
              });
            }}
          >
            ${
              props.queueConfigSaving
                ? t("messageQueue.config.saving")
                : t("messageQueue.config.save")
            }
          </button>
        </div>
      </div>
    </div>
  `;
}
