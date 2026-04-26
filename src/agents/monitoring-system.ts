/**
 * Agent监控与可观测性系统
 * 
 * 业界标准（2025-2026多Agent系统）：
 * - 实时监控所有Agent运行状态
 * - 关键指标收集（成功率/响应时间/成本）
 * - 错误追踪和自动告警
 * - 事故回放和调试
 */

// ============ 类型定义 ============

/**
 * Agent指标类型
 */
export type MetricType = 
  // 性能指标
  | 'response_time_p50'
  | 'response_time_p99'
  | 'success_rate'
  | 'error_rate'
  | 'throughput'
  
  // 成本指标
  | 'token_usage'
  | 'api_cost'
  | 'tool_call_count'
  
  // 质量指标
  | 'hallucination_rate'
  | 'rework_rate'
  | 'human_intervention_rate'
  
  // 业务指标
  | 'tasks_completed'
  | 'tasks_failed'
  | 'active_tasks';

/**
 * 指标数据点
 */
export type MetricDataPoint = {
  timestamp: number;
  agentId: string;
  metric: MetricType;
  value: number;
  tags?: Record<string, string>;
};

/**
 * 告警级别
 */
export type AlertLevel = 'info' | 'warning' | 'critical';

/**
 * 告警
 */
export type Alert = {
  id: string;
  level: AlertLevel;
  agentId: string;
  metric: MetricType;
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
};

/**
 * Agent运行状态快照
 */
export type AgentHealthSnapshot = {
  agentId: string;
  timestamp: number;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  metrics: {
    successRate: number;
    avgResponseTime: number;
    errorRate: number;
    tokenUsage: number;
    activeTasks: number;
  };
  alerts: Alert[];
};

// ============ 指标收集器 ============

/**
 * 指标收集器
 */
class MetricsCollector {
  private dataPoints: MetricDataPoint[] = [];
  private maxDataPoints = 10000; // 最多保留10000个数据点
  
  /**
   * 记录指标
   */
  record(dataPoint: MetricDataPoint): void {
    this.dataPoints.push(dataPoint);
    
    // 限制数据点数量
    if (this.dataPoints.length > this.maxDataPoints) {
      this.dataPoints = this.dataPoints.slice(-this.maxDataPoints);
    }
    
    // 检查是否触发告警
    this.checkAlerts(dataPoint);
  }
  
  /**
   * 获取指标
   */
  getMetrics(options: {
    agentId?: string;
    metric?: MetricType;
    timeRange?: number; // 毫秒
  }): MetricDataPoint[] {
    let metrics = this.dataPoints;
    
    if (options.agentId) {
      metrics = metrics.filter(m => m.agentId === options.agentId);
    }
    if (options.metric) {
      metrics = metrics.filter(m => m.metric === options.metric);
    }
    if (options.timeRange) {
      const cutoff = Date.now() - options.timeRange;
      metrics = metrics.filter(m => m.timestamp >= cutoff);
    }
    
    return metrics;
  }
  
  /**
   * 计算聚合统计
   */
  aggregate(agentId: string, metric: MetricType, timeRange: number = 3600000): {
    avg: number;
    min: number;
    max: number;
    count: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const metrics = this.getMetrics({ agentId, metric, timeRange });
    
    if (metrics.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      avg: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      count: values.length,
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
    };
  }
  
  /**
   * 检查告警
   */
  private checkAlerts(dataPoint: MetricDataPoint): void {
    const alertRules = this.getAlertRules();
    
    for (const rule of alertRules) {
      if (rule.metric !== dataPoint.metric) continue;
      if (rule.condition(dataPoint.value)) {
        alertManager.createAlert({
          level: rule.level,
          agentId: dataPoint.agentId,
          metric: dataPoint.metric,
          message: rule.message,
          currentValue: dataPoint.value,
          threshold: rule.threshold,
        });
      }
    }
  }
  
  /**
   * 告警规则
   */
  private getAlertRules(): Array<{
    metric: MetricType;
    condition: (value: number) => boolean;
    threshold: number;
    level: AlertLevel;
    message: string;
  }> {
    return [
      {
        metric: 'success_rate',
        condition: (v) => v < 0.8,
        threshold: 0.8,
        level: 'critical',
        message: 'Agent成功率低于80%',
      },
      {
        metric: 'success_rate',
        condition: (v) => v < 0.9,
        threshold: 0.9,
        level: 'warning',
        message: 'Agent成功率低于90%',
      },
      {
        metric: 'error_rate',
        condition: (v) => v > 0.2,
        threshold: 0.2,
        level: 'critical',
        message: 'Agent错误率超过20%',
      },
      {
        metric: 'response_time_p99',
        condition: (v) => v > 30000,
        threshold: 30000,
        level: 'warning',
        message: 'Agent P99响应时间超过30秒',
      },
      {
        metric: 'hallucination_rate',
        condition: (v) => v > 0.1,
        threshold: 0.1,
        level: 'critical',
        message: 'Agent幻觉率超过10%',
      },
      {
        metric: 'token_usage',
        condition: (v) => v > 50000,
        threshold: 50000,
        level: 'warning',
        message: '单次调用Token超过50K',
      },
      {
        metric: 'human_intervention_rate',
        condition: (v) => v > 0.3,
        threshold: 0.3,
        level: 'warning',
        message: '人工干预率超过30%',
      },
    ];
  }
}

// ============ 告警管理器 ============

/**
 * 告警管理器
 */
class AlertManager {
  private alerts: Alert[] = [];
  private alertCounter = 0;
  
  /**
   * 创建告警
   */
  createAlert(options: {
    level: AlertLevel;
    agentId: string;
    metric: MetricType;
    message: string;
    currentValue: number;
    threshold: number;
  }): Alert {
    this.alertCounter++;
    
    const alert: Alert = {
      id: `alert-${Date.now()}-${this.alertCounter}`,
      level: options.level,
      agentId: options.agentId,
      metric: options.metric,
      message: options.message,
      currentValue: options.currentValue,
      threshold: options.threshold,
      timestamp: Date.now(),
      acknowledged: false,
    };
    
    this.alerts.push(alert);
    
    // 输出告警
    const levelEmoji = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🔴',
    };
    
    console.error(
      `${levelEmoji[options.level]} [${options.level.toUpperCase()}] ${options.message}`,
      `\n   Agent: ${options.agentId}`,
      `\n   Current: ${options.currentValue}, Threshold: ${options.threshold}`
    );
    
    return alert;
  }
  
  /**
   * 确认告警
   */
  acknowledgeAlert(alertId: string, userId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.acknowledged) return false;
    
    alert.acknowledged = true;
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = Date.now();
    
    return true;
  }
  
  /**
   * 获取未确认的告警
   */
  getUnacknowledgedAlerts(agentId?: string): Alert[] {
    let alerts = this.alerts.filter(a => !a.acknowledged);
    if (agentId) {
      alerts = alerts.filter(a => a.agentId === agentId);
    }
    return alerts;
  }
  
  /**
   * 获取所有告警
   */
  getAllAlerts(options?: {
    agentId?: string;
    level?: AlertLevel;
    timeRange?: number;
  }): Alert[] {
    let alerts = this.alerts;
    
    if (options?.agentId) {
      alerts = alerts.filter(a => a.agentId === options.agentId);
    }
    if (options?.level) {
      alerts = alerts.filter(a => a.level === options.level);
    }
    if (options?.timeRange) {
      const cutoff = Date.now() - options.timeRange;
      alerts = alerts.filter(a => a.timestamp >= cutoff);
    }
    
    return alerts;
  }
}

// ============ 单例实例 ============

export const metricsCollector = new MetricsCollector();
export const alertManager = new AlertManager();

// ============ 辅助函数 ============

/**
 * 记录Agent开始执行
 */
export function recordAgentStart(agentId: string, taskId: string): number {
  return Date.now();
}

/**
 * 记录Agent完成执行
 */
export function recordAgentComplete(
  agentId: string,
  taskId: string,
  startTime: number,
  success: boolean,
  tokenUsage: number,
  toolCallCount: number
): void {
  const duration = Date.now() - startTime;
  
  // 记录响应时间
  metricsCollector.record({
    timestamp: Date.now(),
    agentId,
    metric: 'response_time_p50',
    value: duration,
    tags: { taskId },
  });
  
  // 记录成功/失败
  metricsCollector.record({
    timestamp: Date.now(),
    agentId,
    metric: success ? 'tasks_completed' : 'tasks_failed',
    value: 1,
    tags: { taskId },
  });
  
  // 记录Token使用
  metricsCollector.record({
    timestamp: Date.now(),
    agentId,
    metric: 'token_usage',
    value: tokenUsage,
    tags: { taskId },
  });
  
  // 记录工具调用
  metricsCollector.record({
    timestamp: Date.now(),
    agentId,
    metric: 'tool_call_count',
    value: toolCallCount,
    tags: { taskId },
  });
}

/**
 * 获取Agent健康状态快照
 */
export function getAgentHealthSnapshot(agentId: string): AgentHealthSnapshot {
  const successAgg = metricsCollector.aggregate(agentId, 'tasks_completed', 3600000);
  const failedAgg = metricsCollector.aggregate(agentId, 'tasks_failed', 3600000);
  const responseAgg = metricsCollector.aggregate(agentId, 'response_time_p50', 3600000);
  const tokenAgg = metricsCollector.aggregate(agentId, 'token_usage', 3600000);
  
  const total = successAgg.count + failedAgg.count;
  const successRate = total > 0 ? successAgg.count / total : 1.0;
  const errorRate = total > 0 ? failedAgg.count / total : 0;
  
  const alerts = alertManager.getUnacknowledgedAlerts(agentId);
  
  // 判断健康状态
  let status: AgentHealthSnapshot['status'] = 'healthy';
  if (successRate < 0.8 || errorRate > 0.2) {
    status = 'unhealthy';
  } else if (successRate < 0.9 || errorRate > 0.1) {
    status = 'degraded';
  }
  
  return {
    agentId,
    timestamp: Date.now(),
    status,
    metrics: {
      successRate,
      avgResponseTime: responseAgg.avg,
      errorRate,
      tokenUsage: tokenAgg.avg,
      activeTasks: 0, // 需要从任务系统获取
    },
    alerts,
  };
}

/**
 * 导出监控数据
 */
export function exportMetrics(filePath: string, timeRange: number = 3600000): void {
  const fs = require('fs');
  
  const data = {
    exportedAt: new Date().toISOString(),
    timeRange,
    metrics: metricsCollector.getMetrics({ timeRange }),
    alerts: alertManager.getAllAlerts({ timeRange }),
  };
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`📊 Metrics exported to ${filePath}`);
}
