/**
 * Monitor Controller
 * 协作监控控制器
 */

import type { OpenClawApp } from "../app.ts";

export interface ActiveSession {
  id: string;
  agentId: string;
  agentName: string;
  channelId: string;
  peerId: string;
  startedAt: number;
  lastActivityAt: number;
  messageCount: number;
  status: "active" | "idle" | "error";
}

export interface MessageFlow {
  fromAgentId: string;
  toAgentId: string;
  channelId: string;
  count: number;
  lastMessageAt: number;
  avgResponseTime: number;
}

export interface ForwardingRule {
  id: string;
  name: string;
  sourceChannelId: string;
  targetChannelId: string;
  sourceAgentId?: string;
  targetAgentId?: string;
  enabled: boolean;
  createdAt: number;
}

export interface PerformanceMetrics {
  totalMessages: number;
  totalSessions: number;
  avgResponseTime: number;
  errorRate: number;
  uptime: number;
  lastUpdated: number;
}

export interface Alert {
  id: string;
  type: "error" | "warning" | "info";
  message: string;
  agentId?: string;
  channelId?: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface MonitorState {
  monitorLoading: boolean;
  monitorError: string | null;
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
  ruleFormData: Partial<ForwardingRule>;
  // Metrics
  metricsLoading: boolean;
  metrics: PerformanceMetrics | null;
  // Alerts
  alertsLoading: boolean;
  alerts: Alert[];
  monitorActiveSubPanel: "sessions" | "flows" | "forwarding" | "metrics" | "alerts";
}

/**
 * 加载活动会话
 */
export async function loadActiveSessions(host: OpenClawApp): Promise<void> {
  host.monitorSessionsLoading = true;
  host.monitorSessionsError = null;

  try {
    const result = (await host.client?.request("monitor.sessions", {})) as {
      sessions?: ActiveSession[];
    } | null;
    host.monitorActiveSessions = result?.sessions || [];
  } catch (err) {
    host.monitorSessionsError = err instanceof Error ? err.message : String(err);
  } finally {
    host.monitorSessionsLoading = false;
  }
}

/**
 * 加载消息流
 */
export async function loadMessageFlows(host: OpenClawApp): Promise<void> {
  host.monitorMessageFlowsLoading = true;

  try {
    const result = (await host.client?.request("monitor.messageFlows", {})) as {
      flows?: MessageFlow[];
    } | null;
    host.monitorMessageFlows = result?.flows || [];
  } catch (err) {
    console.error("Failed to load message flows:", err);
  } finally {
    host.monitorMessageFlowsLoading = false;
  }
}

/**
 * 加载转发规则
 */
export async function loadForwardingRules(host: OpenClawApp): Promise<void> {
  host.monitorForwardingRulesLoading = true;

  try {
    const result = (await host.client?.request("monitor.forwardingRules", {})) as {
      rules?: ForwardingRule[];
    } | null;
    host.monitorForwardingRules = result?.rules || [];
  } catch (err) {
    console.error("Failed to load forwarding rules:", err);
  } finally {
    host.monitorForwardingRulesLoading = false;
  }
}

/**
 * 添加转发规则
 */
export async function addForwardingRule(
  host: OpenClawApp,
  rule: Omit<ForwardingRule, "id" | "createdAt">,
): Promise<void> {
  await host.client?.request("monitor.addForwardingRule", rule);
  await loadForwardingRules(host);
  host.monitorCreatingRule = false;
}

/**
 * 更新转发规则
 */
export async function updateForwardingRule(
  host: OpenClawApp,
  ruleId: string,
  updates: Partial<ForwardingRule>,
): Promise<void> {
  await host.client?.request("monitor.updateForwardingRule", { ruleId, updates });
  await loadForwardingRules(host);
  host.monitorEditingRule = null;
}

/**
 * 删除转发规则
 */
export async function deleteForwardingRule(host: OpenClawApp, ruleId: string): Promise<void> {
  await host.client?.request("monitor.deleteForwardingRule", { ruleId });
  await loadForwardingRules(host);
}

/**
 * 加载性能指标
 */
export async function loadMetrics(host: OpenClawApp): Promise<void> {
  host.monitorMetricsLoading = true;

  try {
    const result = (await host.client?.request("monitor.metrics", {})) as {
      metrics?: PerformanceMetrics;
    } | null;
    host.monitorMetrics = result?.metrics || null;
  } catch (err) {
    console.error("Failed to load metrics:", err);
  } finally {
    host.monitorMetricsLoading = false;
  }
}

/**
 * 加载告警列表
 */
export async function loadAlerts(host: OpenClawApp, unacknowledgedOnly = false): Promise<void> {
  host.monitorAlertsLoading = true;

  try {
    const result = (await host.client?.request("monitor.alerts", { unacknowledgedOnly })) as {
      alerts?: Alert[];
    } | null;
    host.monitorAlerts = result?.alerts || [];
  } catch (err) {
    console.error("Failed to load alerts:", err);
  } finally {
    host.monitorAlertsLoading = false;
  }
}

/**
 * 确认告警
 */
export async function acknowledgeAlert(host: OpenClawApp, alertId: string): Promise<void> {
  await host.client?.request("monitor.acknowledgeAlert", { alertId });
  await loadAlerts(host);
}

/**
 * 清除所有告警
 */
export async function clearAllAlerts(host: OpenClawApp): Promise<void> {
  await host.client?.request("monitor.clearAlerts", {});
  await loadAlerts(host);
}

/**
 * 加载所有 Monitor 数据
 */
export async function loadMonitorData(host: OpenClawApp): Promise<void> {
  // oxlint-disable-next-line typescript/no-explicit-any
  const h = host as any;
  h.monitorLoading = true;
  h.monitorError = null;

  try {
    await Promise.all([
      loadActiveSessions(host),
      loadMessageFlows(host),
      loadForwardingRules(host),
      loadMetrics(host),
      loadAlerts(host),
    ]);
  } catch (err) {
    h.monitorError = err instanceof Error ? err.message : String(err);
  } finally {
    h.monitorLoading = false;
  }
}
