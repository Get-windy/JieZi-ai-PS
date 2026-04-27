/**
 * 反思洞察仪表盘（Reflection Insights Dashboard）
 * 
 * 可视化展示反思数据，包括：
 * - 反思趋势图
 * - 按结果分类统计
 * - 高频问题词云
 * - 改进效果追踪
 * - 质量评分分布
 */

import { html, nothing } from "lit";
import type { App UIState } from "../app-state";

// ============================================================================
// 类型定义
// ============================================================================

interface ReflectionDashboard Data {
  totalReflections: number;
  reflectionsByOutcome: {
    success: number;
    partial: number;
    failure: number;
  };
  reflectionsByTime: Array<{
    date: string;
    count: number;
    avgQuality: number;
  }>;
  topIssues: Array<{
    keyword: string;
    frequency: number;
    severity: 'high' | 'medium' | 'low';
  }>;
  qualityDistribution: {
    excellent: number; // 80-100
    good: number;      // 60-79
    fair: number;      // 40-59
    poor: number;      // 0-39
  };
  verificationStats: {
    total: number;
    verified: number;
    improved: number;
    pending: number;
  };
  organizationInsights?: {
    crossProjectPatterns: Array<{
      pattern: string;
      frequency: number;
      projects: string[];
    }>;
    bestPractices: Array<{
      title: string;
      adoptionCount: number;
    }>;
  };
}

// ============================================================================
// 主渲染函数
// ============================================================================

/**
 * 渲染反思洞察仪表盘
 */
export function render ReflectionDashboard(state: App UIState) {
  // 从 state 中获取数据（如果有的话）
  const dashboardData = state.reflectionDashboardData;
  
  if (!dashboardData) {
    return html`
      <div class="reflection-dashboard">
        <div class="dashboard-header">
          <h3>📊 反思洞察仪表盘</h3>
          <p class="subtitle">加载数据中...</p>
        </div>
      </div>
    `;
  }

  return html`
    <div class="reflection-dashboard">
      <div class="dashboard-header">
        <h3>📊 反思洞察仪表盘</h3>
        <p class="subtitle">基于 ${dashboardData.totalReflections} 条反思数据的智能分析</p>
      </div>

      <!-- 概览卡片 -->
      <div class="overview-cards">
        <div class="card total">
          <div class="card-icon">📝</div>
          <div class="card-content">
            <div class="card-value">${dashboardData.totalReflections}</div>
            <div class="card-label">总反思数</div>
          </div>
        </div>
        <div class="card success">
          <div class="card-icon">✅</div>
          <div class="card-content">
            <div class="card-value">${dashboardData.reflectionsByOutcome.success}</div>
            <div class="card-label">成功</div>
          </div>
        </div>
        <div class="card partial">
          <div class="card-icon">⚠️</div>
          <div class="card-content">
            <div class="card-value">${dashboardData.reflectionsByOutcome.partial}</div>
            <div class="card-label">部分完成</div>
          </div>
        </div>
        <div class="card failure">
          <div class="card-icon">❌</div>
          <div class="card-content">
            <div class="card-value">${dashboardData.reflectionsByOutcome.failure}</div>
            <div class="card-label">失败</div>
          </div>
        </div>
      </div>

      <!-- 反思趋势图 -->
      <div class="chart-section">
        <h4>📈 反思趋势</h4>
        <div class="trend-chart">
          ${renderTrendChart(dashboardData.reflectionsByTime)}
        </div>
      </div>

      <!-- 质量评分分布 + 高频问题 -->
      <div class="two-columns">
        <!-- 质量分布 -->
        <div class="chart-section">
          <h4>🎯 质量评分分布</h4>
          <div class="quality-chart">
            ${renderQualityChart(dashboardData.qualityDistribution)}
          </div>
        </div>

        <!-- 高频问题 -->
        <div class="chart-section">
          <h4>⚡ 高频问题 TOP 10</h4>
          <div class="top-issues">
            ${renderTopIssues(dashboardData.topIssues)}
          </div>
        </div>
      </div>

      <!-- 验证闭环统计 -->
      <div class="chart-section">
        <h4>✅ 验证闭环统计</h4>
        <div class="verification-stats">
          ${renderVerificationStats(dashboardData.verificationStats)}
        </div>
      </div>

      <!-- 组织级洞察（如果有） -->
      ${dashboardData.organizationInsights ? html`
        <div class="chart-section">
          <h4>🌐 组织级洞察</h4>
          ${renderOrganizationInsights(dashboardData.organizationInsights)}
        </div>
      ` : nothing}
    </div>

    <style>
      .reflection-dashboard {
        padding: 16px;
        background: var(--card-bg, #fff);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .dashboard-header {
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid var(--border-color, #e5e7eb);
      }

      .dashboard-header h3 {
        margin: 0 0 8px 0;
        font-size: 24px;
        color: var(--text-primary, #111827);
      }

      .subtitle {
        margin: 0;
        font-size: 14px;
        color: var(--text-secondary, #6b7280);
      }

      /* 概览卡片 */
      .overview-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }

      .card {
        padding: 20px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }

      .card.total {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .card.success {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
      }

      .card.partial {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
      }

      .card.failure {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
      }

      .card-icon {
        font-size: 32px;
      }

      .card-content {
        flex: 1;
      }

      .card-value {
        font-size: 32px;
        font-weight: bold;
        margin-bottom: 4px;
      }

      .card-label {
        font-size: 14px;
        opacity: 0.9;
      }

      /* 图表区域 */
      .chart-section {
        margin-bottom: 24px;
      }

      .chart-section h4 {
        margin: 0 0 16px 0;
        font-size: 18px;
        color: var(--text-primary, #111827);
      }

      .two-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 24px;
      }

      @media (max-width: 1024px) {
        .two-columns {
          grid-template-columns: 1fr;
        }
      }

      /* 趋势图 */
      .trend-chart {
        height: 200px;
        background: var(--bg-secondary, #f9fafb);
        border-radius: 8px;
        padding: 16px;
        overflow-x: auto;
      }

      /* 质量分布图 */
      .quality-chart {
        display: flex;
        gap: 12px;
        align-items: flex-end;
        height: 150px;
        padding: 16px;
        background: var(--bg-secondary, #f9fafb);
        border-radius: 8px;
      }

      .quality-bar {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      .quality-bar-fill {
        width: 100%;
        border-radius: 4px;
        transition: height 0.3s ease;
      }

      .quality-bar-label {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }

      .quality-bar-value {
        font-size: 14px;
        font-weight: bold;
      }

      /* 高频问题列表 */
      .top-issues {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 200px;
        overflow-y: auto;
      }

      .issue-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-secondary, #f9fafb);
        border-radius: 6px;
        border-left: 4px solid var(--issue-color, #ccc);
      }

      .issue-rank {
        font-size: 16px;
        font-weight: bold;
        color: var(--text-tertiary, #9ca3af);
        min-width: 30px;
      }

      .issue-keyword {
        flex: 1;
        font-weight: 500;
      }

      .issue-frequency {
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 12px;
        background: var(--issue-color, #ccc);
        color: white;
      }

      /* 验证统计 */
      .verification-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
        padding: 16px;
        background: var(--bg-secondary, #f9fafb);
        border-radius: 8px;
      }

      .verification-item {
        text-align: center;
      }

      .verification-value {
        font-size: 28px;
        font-weight: bold;
        color: var(--primary-color, #3b82f6);
        margin-bottom: 4px;
      }

      .verification-label {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }
    </style>
  `;
}

// ============================================================================
// 辅助渲染函数
// ============================================================================

function renderTrendChart(data: Array<{ date: string; count: number; avgQuality: number }>) {
  if (!data || data.length === 0) {
    return html`<p style="color: var(--text-secondary);">暂无数据</p>`;
  }

  const maxCount = Math.max(...data.map(d => d.count));
  
  return html`
    <div style="display: flex; align-items: flex-end; gap: 8px; height: 100%;">
      ${data.map((item, index) => html`
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
          <div style="font-size: 10px; color: var(--text-secondary);">${item.count}</div>
          <div 
            style="width: 100%; background: linear-gradient(to top, #3b82f6, #60a5fa); 
                   height: ${maxCount > 0 ? (item.count / maxCount * 120) : 0}px; 
                   border-radius: 4px 4px 0 0;
                   min-height: 4px;"
            title="${item.date}: ${item.count} 条反思, 平均质量 ${item.avgQuality.toFixed(1)}"
          ></div>
          <div style="font-size: 10px; color: var(--text-secondary); transform: rotate(-45deg); white-space: nowrap;">
            ${item.date.slice(5)}
          </div>
        </div>
      `)}
    </div>
  `;
}

function renderQualityChart(data: { excellent: number; good: number; fair: number; poor: number }) {
  const total = data.excellent + data.good + data.fair + data.poor;
  if (total === 0) {
    return html`<p style="color: var(--text-secondary);">暂无数据</p>`;
  }

  const categories = [
    { label: '优秀 (80-100)', value: data.excellent, color: '#10b981' },
    { label: '良好 (60-79)', value: data.good, color: '#3b82f6' },
    { label: '一般 (40-59)', value: data.fair, color: '#f59e0b' },
    { label: '待改进 (0-39)', value: data.poor, color: '#ef4444' },
  ];

  return html`
    ${categories.map(cat => {
      const percentage = total > 0 ? (cat.value / total * 100) : 0;
      return html`
        <div class="quality-bar">
          <div class="quality-bar-value">${cat.value}</div>
          <div 
            class="quality-bar-fill" 
            style="height: ${percentage * 1.2}px; background: ${cat.color};"
          ></div>
          <div class="quality-bar-label">${cat.label}</div>
        </div>
      `;
    })}
  `;
}

function renderTopIssues(issues: Array<{ keyword: string; frequency: number; severity: string }>) {
  if (!issues || issues.length === 0) {
    return html`<p style="color: var(--text-secondary);">暂无数据</p>`;
  }

  const severityColors = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
  };

  return html`
    ${issues.slice(0, 10).map((issue, index) => html`
      <div class="issue-item" style="--issue-color: ${severityColors[issue.severity] || '#ccc'}">
        <div class="issue-rank">#${index + 1}</div>
        <div class="issue-keyword">${issue.keyword}</div>
        <div class="issue-frequency">${issue.frequency} 次</div>
      </div>
    `)}
  `;
}

function renderVerificationStats(stats: { total: number; verified: number; improved: number; pending: number }) {
  const improvementRate = stats.verified > 0 ? (stats.improved / stats.verified * 100) : 0;
  
  return html`
    <div class="verification-item">
      <div class="verification-value">${stats.total}</div>
      <div class="verification-label">总验证任务</div>
    </div>
    <div class="verification-item">
      <div class="verification-value" style="color: #10b981;">${stats.verified}</div>
      <div class="verification-label">已验证</div>
    </div>
    <div class="verification-item">
      <div class="verification-value" style="color: #3b82f6;">${stats.pending}</div>
      <div class="verification-label">待验证</div>
    </div>
    <div class="verification-item">
      <div class="verification-value" style="color: #f59e0b;">${improvementRate.toFixed(1)}%</div>
      <div class="verification-label">改进率</div>
    </div>
  `;
}

function renderOrganizationInsights(insights: { 
  crossProjectPatterns: Array<{ pattern: string; frequency: number; projects: string[] }>;
  bestPractices: Array<{ title: string; adoptionCount: number }>;
}) {
  return html`
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div>
        <h5 style="margin: 0 0 12px 0; font-size: 14px;">跨项目问题模式</h5>
        ${insights.crossProjectPatterns.slice(0, 5).map(pattern => html`
          <div style="padding: 8px; background: var(--bg-secondary); border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
            <div style="font-weight: 500; margin-bottom: 4px;">${pattern.pattern}</div>
            <div style="color: var(--text-secondary);">
              出现 ${pattern.frequency} 次 · 影响 ${pattern.projects.length} 个项目
            </div>
          </div>
        `)}
      </div>
      <div>
        <h5 style="margin: 0 0 12px 0; font-size: 14px;">最佳实践</h5>
        ${insights.bestPractices.slice(0, 5).map(bp => html`
          <div style="padding: 8px; background: var(--bg-secondary); border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
            <div style="font-weight: 500; margin-bottom: 4px;">${bp.title}</div>
            <div style="color: var(--text-secondary);">
              已被 ${bp.adoptionCount} 个项目采用
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}
