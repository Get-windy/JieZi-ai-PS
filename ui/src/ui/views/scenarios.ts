/**
 * Scenarios View
 * 协作场景管理界面
 */

import { html, nothing } from "lit";
import type {
  CollaborationScenario,
  ScenarioRun,
  ScenarioRecommendation,
} from "../controllers/scenarios.ts";
import { t } from "../i18n.ts";

export type ScenariosSubPanel = "list" | "runs" | "recommendations" | "analytics";

export type ScenariosProps = {
  loading: boolean;
  error: string | null;
  activeSubPanel: ScenariosSubPanel;
  // Scenarios
  scenariosList: CollaborationScenario[];
  scenariosTotal: number;
  selectedScenarioId: string | null;
  editingScenario: CollaborationScenario | null;
  creatingScenario: boolean;
  runningScenarioId: string | null;
  // Runs
  scenarioRunsLoading: boolean;
  scenarioRuns: ScenarioRun[];
  // Recommendations
  recommendationsLoading: boolean;
  recommendations: ScenarioRecommendation[];

  onRefresh: () => void;
  onSelectSubPanel: (panel: ScenariosSubPanel) => void;
  onSelectScenario: (scenarioId: string) => void;
  onCreateScenario: () => void;
  onEditScenario: (scenarioId: string) => void;
  onDeleteScenario: (scenarioId: string) => void;
  onSaveScenario: () => void;
  onCancelEdit: () => void;
  onScenarioFormChange: (field: string, value: any) => void;
  onToggleScenario: (scenarioId: string, enabled: boolean) => void;
  onRunScenario: (scenarioId: string) => void;
  onApplyRecommendation: (scenarioId: string) => void;
};

export function renderScenariosView(props: ScenariosProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">🎯 ${t("collaboration.scenarios.title")}</div>
          <div class="card-sub">${t("collaboration.scenarios.subtitle")}</div>
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

      ${renderScenariosTabs(props)}

      <div style="margin-top: 16px;">
        ${
          props.activeSubPanel === "list"
            ? renderScenariosList(props)
            : props.activeSubPanel === "runs"
              ? renderScenarioRuns(props)
              : props.activeSubPanel === "recommendations"
                ? renderRecommendations(props)
                : renderAnalytics(props)
        }
      </div>
    </section>
  `;
}

function renderScenariosTabs(props: ScenariosProps) {
  const tabs: Array<{ id: ScenariosSubPanel; label: string; icon: string; count?: number }> = [
    { id: "list", label: "场景列表", icon: "📋", count: props.scenariosTotal },
    { id: "runs", label: "执行历史", icon: "⏱️", count: props.scenarioRuns.length },
    { id: "recommendations", label: "智能推荐", icon: "💡", count: props.recommendations.length },
    { id: "analytics", label: "数据分析", icon: "📊" },
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

function renderScenariosList(props: ScenariosProps) {
  if (props.loading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (props.error) {
    return html`
      <div class="empty-state">
        <div style="color: var(--danger-color);">❌ ${props.error}</div>
      </div>
    `;
  }

  if (props.creatingScenario || props.editingScenario) {
    return renderScenarioForm(props);
  }

  if (props.scenariosList.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px;">🎯</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px;">暂无协作场景</div>
        <div class="muted">创建自动化协作场景来提高团队效率</div>
        <button class="btn-primary" @click=${props.onCreateScenario} style="margin-top: 16px;">
          ➕ 创建场景
        </button>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <div class="muted">共 ${props.scenariosTotal} 个场景</div>
        <button class="btn-secondary" @click=${props.onCreateScenario}>
          ➕ 创建场景
        </button>
      </div>

      ${props.scenariosList.map((scenario) => renderScenarioCard(props, scenario))}
    </div>
  `;
}

function renderScenarioCard(props: ScenariosProps, scenario: CollaborationScenario) {
  const typeIcons = {
    standup: "🗓️",
    pairing: "👥",
    review: "🔍",
    knowledge: "📚",
    custom: "⚙️",
  };

  return html`
    <div class="card" style="padding: 16px;">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div style="flex: 1;">
          <div class="row" style="align-items: center; gap: 8px;">
            <span style="font-size: 24px;">${typeIcons[scenario.type]}</span>
            <div>
              <div style="font-weight: 500; font-size: 16px;">${scenario.name}</div>
              <div class="muted" style="font-size: 12px; margin-top: 2px;">
                ${scenario.description}
              </div>
            </div>
            ${
              scenario.enabled
                ? html`
                    <span class="badge" style="background: var(--success-color)">启用</span>
                  `
                : html`
                    <span class="badge" style="background: var(--muted-color)">禁用</span>
                  `
            }
          </div>

          ${
            scenario.stats
              ? html`
                  <div class="row" style="gap: 16px; margin-top: 12px; font-size: 13px;">
                    <div class="muted">
                      📊 总运行: <span style="color: var(--text-color);">${scenario.stats.totalRuns}</span>
                    </div>
                    <div class="muted">
                      ✅ 成功: <span style="color: var(--success-color);">${scenario.stats.successRuns}</span>
                    </div>
                    ${
                      scenario.stats.avgDuration
                        ? html`
                            <div class="muted">
                              ⏱️ 平均耗时: <span style="color: var(--text-color);">${(scenario.stats.avgDuration / 1000).toFixed(1)}s</span>
                            </div>
                          `
                        : nothing
                    }
                    ${
                      scenario.stats.lastRunAt
                        ? html`
                            <div class="muted">
                              🕐 最后运行: ${new Date(scenario.stats.lastRunAt).toLocaleString()}
                            </div>
                          `
                        : nothing
                    }
                  </div>
                `
              : nothing
          }

          ${
            scenario.config.trigger
              ? html`
                  <div class="muted" style="font-size: 12px; margin-top: 8px;">
                    🎯 触发: ${scenario.config.trigger.type === "manual" ? "手动" : scenario.config.trigger.type === "scheduled" ? `定时 (${scenario.config.trigger.schedule})` : `事件 (${scenario.config.trigger.event})`}
                  </div>
                `
              : nothing
          }
        </div>

        <div class="row" style="gap: 4px; margin-left: 16px;">
          <button
            class="btn-icon"
            @click=${() => props.onRunScenario(scenario.id)}
            ?disabled=${props.runningScenarioId === scenario.id || !scenario.enabled}
            title="${scenario.enabled ? "运行" : "请先启用场景"}"
          >
            ${props.runningScenarioId === scenario.id ? "⏳" : "▶️"}
          </button>
          <button
            class="btn-icon"
            @click=${() => props.onToggleScenario(scenario.id, !scenario.enabled)}
            title="${scenario.enabled ? "禁用" : "启用"}"
          >
            ${scenario.enabled ? "⏸️" : "✅"}
          </button>
          <button
            class="btn-icon"
            @click=${() => props.onEditScenario(scenario.id)}
            title="编辑"
          >
            ✏️
          </button>
          <button
            class="btn-icon"
            @click=${() => props.onDeleteScenario(scenario.id)}
            title="删除"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderScenarioForm(props: ScenariosProps) {
  const scenario = props.editingScenario;
  const isEdit = !!scenario;

  return html`
    <div class="card" style="padding: 16px;">
      <div style="font-weight: 500; margin-bottom: 16px;">
        ${isEdit ? "编辑场景" : "创建场景"}
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label>场景名称 *</label>
          <input
            type="text"
            placeholder="例如：每日站会"
            .value=${scenario?.name || ""}
            @input=${(e: Event) =>
              props.onScenarioFormChange("name", (e.target as HTMLInputElement).value)}
            style="width: 100%;"
          />
        </div>

        <div>
          <label>描述</label>
          <textarea
            placeholder="描述场景的用途和工作流程"
            .value=${scenario?.description || ""}
            @input=${(e: Event) =>
              props.onScenarioFormChange("description", (e.target as HTMLInputElement).value)}
            style="width: 100%; min-height: 60px;"
          ></textarea>
        </div>

        <div>
          <label>场景类型</label>
          <select
            .value=${scenario?.type || "custom"}
            @change=${(e: Event) =>
              props.onScenarioFormChange("type", (e.target as HTMLSelectElement).value)}
            style="width: 100%;"
          >
            <option value="custom">自定义</option>
            <option value="standup">每日站会</option>
            <option value="pairing">配对编程</option>
            <option value="review">代码评审</option>
            <option value="knowledge">知识沉淀</option>
          </select>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              .checked=${scenario?.enabled !== false}
              @change=${(e: Event) =>
                props.onScenarioFormChange("enabled", (e.target as HTMLInputElement).checked)}
            />
            启用场景
          </label>
        </div>
      </div>

      <div class="row" style="gap: 8px; margin-top: 16px;">
        <button class="btn-primary" @click=${props.onSaveScenario}>
          保存
        </button>
        <button class="btn-secondary" @click=${props.onCancelEdit}>取消</button>
      </div>
    </div>
  `;
}

function renderScenarioRuns(props: ScenariosProps) {
  if (props.scenarioRunsLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (props.scenarioRuns.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">⏱️</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无执行记录</div>
        <div class="muted">运行场景后将在此显示执行历史</div>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="muted" style="margin-bottom: 8px;">共 ${props.scenarioRuns.length} 条记录</div>

      ${props.scenarioRuns.map(
        (run) => html`
          <div class="card" style="padding: 12px;">
            <div class="row" style="justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <div style="font-weight: 500;">
                  执行 #${run.id.split("-")[1]}
                  ${
                    run.status === "running"
                      ? html`
                          <span class="badge" style="background: var(--info-color)">运行中</span>
                        `
                      : run.status === "success"
                        ? html`
                            <span class="badge" style="background: var(--success-color)">成功</span>
                          `
                        : run.status === "failed"
                          ? html`
                              <span class="badge" style="background: var(--danger-color)">失败</span>
                            `
                          : html`
                              <span class="badge" style="background: var(--warning-color)">已取消</span>
                            `
                  }
                </div>
                <div class="muted" style="font-size: 12px; margin-top: 4px;">
                  开始: ${new Date(run.startedAt).toLocaleString()}
                  ${
                    run.completedAt
                      ? html` • 耗时: ${((run.completedAt - run.startedAt) / 1000).toFixed(1)}s`
                      : ""
                  }
                </div>
                ${run.error ? html`<div style="color: var(--danger-color); font-size: 12px; margin-top: 4px;">错误: ${run.error}</div>` : nothing}
              </div>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderRecommendations(props: ScenariosProps) {
  if (props.recommendationsLoading) {
    return html`
      <div class="empty-state">加载中...</div>
    `;
  }

  if (props.recommendations.length === 0) {
    return html`
      <div class="empty-state">
        <div style="font-size: 48px">💡</div>
        <div style="font-size: 18px; font-weight: 500; margin-top: 16px">暂无推荐</div>
        <div class="muted">系统将根据您的使用情况智能推荐合适的场景</div>
      </div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="muted" style="margin-bottom: 8px;">
        基于您的使用情况，我们推荐以下场景
      </div>

      ${props.recommendations.map(
        (rec) => html`
          <div class="card" style="padding: 16px; border-left: 4px solid var(--primary-color);">
            <div class="row" style="justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <div style="font-weight: 500; font-size: 16px;">
                  💡 ${rec.name}
                  <span class="badge" style="margin-left: 8px;">
                    ${(rec.confidence * 100).toFixed(0)}% 匹配
                  </span>
                </div>
                <div class="muted" style="margin-top: 8px;">${rec.reason}</div>
                
                <div style="margin-top: 12px;">
                  <div style="font-weight: 500; font-size: 13px; margin-bottom: 6px;">
                    ✨ 预期收益：
                  </div>
                  <ul style="margin: 0; padding-left: 20px;">
                    ${rec.benefits.map((benefit) => html`<li class="muted">${benefit}</li>`)}
                  </ul>
                </div>
              </div>
              
              <button
                class="btn-primary"
                @click=${() => props.onApplyRecommendation(rec.scenarioId)}
                style="margin-left: 16px;"
              >
                应用推荐
              </button>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderAnalytics(props: ScenariosProps) {
  // 计算统计数据
  const totalRuns = props.scenariosList.reduce((sum, s) => sum + (s.stats?.totalRuns || 0), 0);
  const successRuns = props.scenariosList.reduce((sum, s) => sum + (s.stats?.successRuns || 0), 0);
  const successRate = totalRuns > 0 ? (successRuns / totalRuns) * 100 : 0;
  const enabledScenarios = props.scenariosList.filter((s) => s.enabled).length;

  return html`
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <!-- 统计卡片 -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div class="card" style="padding: 16px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: var(--primary-color);">
            ${props.scenariosTotal}
          </div>
          <div class="muted">总场景数</div>
        </div>

        <div class="card" style="padding: 16px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: var(--success-color);">
            ${enabledScenarios}
          </div>
          <div class="muted">已启用</div>
        </div>

        <div class="card" style="padding: 16px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: var(--info-color);">
            ${totalRuns}
          </div>
          <div class="muted">总执行次数</div>
        </div>

        <div class="card" style="padding: 16px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: ${successRate > 80 ? "var(--success-color)" : "var(--warning-color)"};">
            ${successRate.toFixed(0)}%
          </div>
          <div class="muted">成功率</div>
        </div>
      </div>

      <!-- 场景类型分布 -->
      <div class="card" style="padding: 16px;">
        <div style="font-weight: 500; margin-bottom: 12px;">📊 场景类型分布</div>
        ${renderTypeDistribution(props)}
      </div>

      <!-- 最活跃场景 -->
      <div class="card" style="padding: 16px;">
        <div style="font-weight: 500; margin-bottom: 12px;">🔥 最活跃场景</div>
        ${renderTopScenarios(props)}
      </div>
    </div>
  `;
}

function renderTypeDistribution(props: ScenariosProps) {
  const distribution = new Map<string, number>();
  props.scenariosList.forEach((s) => {
    distribution.set(s.type, (distribution.get(s.type) || 0) + 1);
  });

  const typeLabels: Record<string, string> = {
    standup: "每日站会",
    pairing: "配对编程",
    review: "代码评审",
    knowledge: "知识沉淀",
    custom: "自定义",
  };

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${Array.from(distribution.entries()).map(([type, count]) => {
        const percentage = (count / props.scenariosTotal) * 100;
        return html`
          <div>
            <div class="row" style="justify-content: space-between; margin-bottom: 4px;">
              <span>${typeLabels[type] || type}</span>
              <span>${count} (${percentage.toFixed(0)}%)</span>
            </div>
            <div style="height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
              <div style="width: ${percentage}%; height: 100%; background: var(--primary-color);"></div>
            </div>
          </div>
        `;
      })}
    </div>
  `;
}

function renderTopScenarios(props: ScenariosProps) {
  const sorted = [...props.scenariosList]
    .filter((s) => s.stats && s.stats.totalRuns > 0)
    .sort((a, b) => (b.stats?.totalRuns || 0) - (a.stats?.totalRuns || 0))
    .slice(0, 5);

  if (sorted.length === 0) {
    return html`
      <div class="muted">暂无执行记录</div>
    `;
  }

  return html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${sorted.map(
        (scenario, index) => html`
        <div class="row" style="justify-content: space-between; padding: 8px; background: var(--bg-secondary); border-radius: 4px;">
          <div class="row" style="gap: 8px;">
            <span style="font-weight: bold; color: var(--primary-color);">#${index + 1}</span>
            <span>${scenario.name}</span>
          </div>
          <span class="muted">${scenario.stats?.totalRuns} 次运行</span>
        </div>
      `,
      )}
    </div>
  `;
}
