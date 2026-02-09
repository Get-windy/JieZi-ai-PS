/**
 * Monitor RPC 处理器
 *
 * 协作监控 - 实时监控智能助手之间的协作活动
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 活动会话信息
 */
interface ActiveSession {
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

/**
 * 消息流统计
 */
interface MessageFlow {
  fromAgentId: string;
  toAgentId: string;
  channelId: string;
  count: number;
  lastMessageAt: number;
  avgResponseTime: number;
}

/**
 * 通道转发规则
 */
interface ForwardingRule {
  id: string;
  name: string;
  sourceChannelId: string;
  targetChannelId: string;
  sourceAgentId?: string;
  targetAgentId?: string;
  enabled: boolean;
  createdAt: number;
}

/**
 * 性能指标
 */
interface PerformanceMetrics {
  totalMessages: number;
  totalSessions: number;
  avgResponseTime: number;
  errorRate: number;
  uptime: number;
  lastUpdated: number;
}

/**
 * 异常告警
 */
interface Alert {
  id: string;
  type: "error" | "warning" | "info";
  message: string;
  agentId?: string;
  channelId?: string;
  timestamp: number;
  acknowledged: boolean;
}

// 内存存储（生产环境应使用数据库）
const activeSessions = new Map<string, ActiveSession>();
const messageFlows = new Map<string, MessageFlow>();
const forwardingRules = new Map<string, ForwardingRule>();
const alerts = new Map<string, Alert>();
let performanceMetrics: PerformanceMetrics = {
  totalMessages: 0,
  totalSessions: 0,
  avgResponseTime: 0,
  errorRate: 0,
  uptime: Date.now(),
  lastUpdated: Date.now(),
};

export const monitorHandlers: GatewayRequestHandlers = {
  /**
   * 获取活动会话列表
   */
  "monitor.sessions": async ({ respond }) => {
    try {
      const sessions = Array.from(activeSessions.values());
      respond(true, { sessions, total: sessions.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取消息流统计
   */
  "monitor.messageFlows": async ({ respond }) => {
    try {
      const flows = Array.from(messageFlows.values());
      respond(true, { flows, total: flows.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取通道转发规则
   */
  "monitor.forwardingRules": async ({ respond }) => {
    try {
      const rules = Array.from(forwardingRules.values());
      respond(true, { rules, total: rules.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 添加通道转发规则
   */
  "monitor.addForwardingRule": async ({ params, respond }) => {
    const { name, sourceChannelId, targetChannelId, sourceAgentId, targetAgentId, enabled } =
      params || {};

    if (!name || typeof name !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing name"));
      return;
    }
    if (!sourceChannelId || typeof sourceChannelId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing sourceChannelId"));
      return;
    }
    if (!targetChannelId || typeof targetChannelId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing targetChannelId"));
      return;
    }

    try {
      const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const rule: ForwardingRule = {
        id: ruleId,
        name,
        sourceChannelId,
        targetChannelId,
        sourceAgentId: typeof sourceAgentId === "string" ? sourceAgentId : undefined,
        targetAgentId: typeof targetAgentId === "string" ? targetAgentId : undefined,
        enabled: enabled !== false,
        createdAt: Date.now(),
      };

      forwardingRules.set(ruleId, rule);
      respond(true, { rule }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 更新通道转发规则
   */
  "monitor.updateForwardingRule": async ({ params, respond }) => {
    const { ruleId, updates } = params || {};

    if (!ruleId || typeof ruleId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing ruleId"));
      return;
    }

    try {
      const rule = forwardingRules.get(ruleId);
      if (!rule) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Rule not found"));
        return;
      }

      if (updates && typeof updates === "object") {
        Object.assign(rule, updates);
      }

      respond(true, { rule }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 删除通道转发规则
   */
  "monitor.deleteForwardingRule": async ({ params, respond }) => {
    const { ruleId } = params || {};

    if (!ruleId || typeof ruleId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing ruleId"));
      return;
    }

    try {
      const deleted = forwardingRules.delete(ruleId);
      if (!deleted) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Rule not found"));
        return;
      }

      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取性能指标
   */
  "monitor.metrics": async ({ respond }) => {
    try {
      // 更新指标
      performanceMetrics.lastUpdated = Date.now();
      performanceMetrics.totalSessions = activeSessions.size;

      respond(true, { metrics: performanceMetrics }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取告警列表
   */
  "monitor.alerts": async ({ params, respond }) => {
    const { unacknowledgedOnly } = params || {};

    try {
      let alertsList = Array.from(alerts.values());

      if (unacknowledgedOnly) {
        alertsList = alertsList.filter((a) => !a.acknowledged);
      }

      respond(true, { alerts: alertsList, total: alertsList.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 确认告警
   */
  "monitor.acknowledgeAlert": async ({ params, respond }) => {
    const { alertId } = params || {};

    if (!alertId || typeof alertId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing alertId"));
      return;
    }

    try {
      const alert = alerts.get(alertId);
      if (!alert) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Alert not found"));
        return;
      }

      alert.acknowledged = true;
      respond(true, { alert }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 清除所有告警
   */
  "monitor.clearAlerts": async ({ respond }) => {
    try {
      alerts.clear();
      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取实时性能监控数据
   */
  "monitor.realtime": async ({ respond }) => {
    try {
      const now = Date.now();
      const realtimeData = {
        timestamp: now,
        activeSessions: activeSessions.size,
        activeFlows: messageFlows.size,
        recentMessages: performanceMetrics.totalMessages,
        unacknowledgedAlerts: Array.from(alerts.values()).filter((a) => !a.acknowledged).length,
        systemUptime: now - performanceMetrics.uptime,
      };

      respond(true, { data: realtimeData }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取会话详细信息
   */
  "monitor.sessionDetail": async ({ params, respond }) => {
    const { sessionId } = params || {};

    if (!sessionId || typeof sessionId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing sessionId"));
      return;
    }

    try {
      const session = activeSessions.get(sessionId);
      if (!session) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Session not found"));
        return;
      }

      // 查找相关的消息流
      const relatedFlows = Array.from(messageFlows.values()).filter(
        (flow) => flow.fromAgentId === session.agentId || flow.toAgentId === session.agentId,
      );

      const detail = {
        session,
        relatedFlows,
        duration: Date.now() - session.startedAt,
        avgMessageInterval:
          session.messageCount > 1
            ? (session.lastActivityAt - session.startedAt) / (session.messageCount - 1)
            : 0,
      };

      respond(true, { detail }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取智能助手监控数据
   */
  "monitor.agentStats": async ({ params, respond }) => {
    const { agentId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const agentSessions = Array.from(activeSessions.values()).filter(
        (s) => s.agentId === agentId,
      );

      const sentFlows = Array.from(messageFlows.values()).filter((f) => f.fromAgentId === agentId);

      const receivedFlows = Array.from(messageFlows.values()).filter(
        (f) => f.toAgentId === agentId,
      );

      const agentAlerts = Array.from(alerts.values()).filter((a) => a.agentId === agentId);

      const stats = {
        agentId,
        activeSessions: agentSessions.length,
        totalMessagesSent: sentFlows.reduce((sum, f) => sum + f.count, 0),
        totalMessagesReceived: receivedFlows.reduce((sum, f) => sum + f.count, 0),
        avgResponseTime:
          sentFlows.length > 0
            ? sentFlows.reduce((sum, f) => sum + f.avgResponseTime, 0) / sentFlows.length
            : 0,
        activeAlerts: agentAlerts.filter((a) => !a.acknowledged).length,
        totalAlerts: agentAlerts.length,
        lastActivityAt: Math.max(...agentSessions.map((s) => s.lastActivityAt), 0),
      };

      respond(true, { stats }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取通道监控数据
   */
  "monitor.channelStats": async ({ params, respond }) => {
    const { channelId } = params || {};

    if (!channelId || typeof channelId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing channelId"));
      return;
    }

    try {
      const channelSessions = Array.from(activeSessions.values()).filter(
        (s) => s.channelId === channelId,
      );

      const channelFlows = Array.from(messageFlows.values()).filter(
        (f) => f.channelId === channelId,
      );

      const channelAlerts = Array.from(alerts.values()).filter((a) => a.channelId === channelId);

      const stats = {
        channelId,
        activeSessions: channelSessions.length,
        totalMessages: channelFlows.reduce((sum, f) => sum + f.count, 0),
        activeFlows: channelFlows.length,
        avgResponseTime:
          channelFlows.length > 0
            ? channelFlows.reduce((sum, f) => sum + f.avgResponseTime, 0) / channelFlows.length
            : 0,
        activeAlerts: channelAlerts.filter((a) => !a.acknowledged).length,
        forwardingRules: Array.from(forwardingRules.values()).filter(
          (r) => r.sourceChannelId === channelId || r.targetChannelId === channelId,
        ).length,
      };

      respond(true, { stats }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取系统健康状态
   */
  "monitor.healthStatus": async ({ respond }) => {
    try {
      const now = Date.now();
      const uptime = now - performanceMetrics.uptime;

      // 计算健康指标
      const idleSessions = Array.from(activeSessions.values()).filter(
        (s) => s.status === "idle",
      ).length;

      const errorSessions = Array.from(activeSessions.values()).filter(
        (s) => s.status === "error",
      ).length;

      const unacknowledgedAlerts = Array.from(alerts.values()).filter(
        (a) => !a.acknowledged,
      ).length;

      const criticalAlerts = Array.from(alerts.values()).filter(
        (a) => a.type === "error" && !a.acknowledged,
      ).length;

      // 计算健康分数（0-100）
      let healthScore = 100;

      if (activeSessions.size > 0) {
        healthScore -= (errorSessions / activeSessions.size) * 30;
        healthScore -= (idleSessions / activeSessions.size) * 10;
      }

      healthScore -= criticalAlerts * 5;
      healthScore -= unacknowledgedAlerts * 2;

      healthScore = Math.max(0, Math.min(100, healthScore));

      const status = {
        healthy: healthScore >= 80,
        score: Math.round(healthScore),
        uptime,
        metrics: {
          totalSessions: activeSessions.size,
          activeSessions: activeSessions.size - idleSessions - errorSessions,
          idleSessions,
          errorSessions,
          totalAlerts: alerts.size,
          unacknowledgedAlerts,
          criticalAlerts,
        },
        recommendations: generateHealthRecommendations(
          healthScore,
          errorSessions,
          unacknowledgedAlerts,
          criticalAlerts,
        ),
      };

      respond(true, { status }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 记录自定义指标
   */
  "monitor.recordMetric": async ({ params, respond }) => {
    const { metricName, value, tags } = params || {};

    if (!metricName || typeof metricName !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing metricName"));
      return;
    }

    if (value === undefined || typeof value !== "number") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Invalid value"));
      return;
    }

    try {
      // 这里简化处理，实际应该存储到时序数据库
      const metric = {
        name: metricName,
        value,
        tags: tags || {},
        timestamp: Date.now(),
      };

      respond(true, { metric, recorded: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};

/**
 * 生成健康建议
 */
function generateHealthRecommendations(
  healthScore: number,
  errorSessions: number,
  unacknowledgedAlerts: number,
  criticalAlerts: number,
): string[] {
  const recommendations: string[] = [];

  if (healthScore < 60) {
    recommendations.push("系统健康度较低，需要立即关注");
  }

  if (errorSessions > 0) {
    recommendations.push(`存在 ${errorSessions} 个错误会话，建议排查问题`);
  }

  if (criticalAlerts > 0) {
    recommendations.push(`有 ${criticalAlerts} 个严重告警未处理，请立即处理`);
  } else if (unacknowledgedAlerts > 5) {
    recommendations.push(`有 ${unacknowledgedAlerts} 个未确认告警，建议及时处理`);
  }

  if (recommendations.length === 0) {
    recommendations.push("系统运行正常");
  }

  return recommendations;
}
export function recordActiveSession(session: ActiveSession): void {
  activeSessions.set(session.id, session);
  performanceMetrics.totalMessages += session.messageCount;
}

/**
 * 辅助函数：记录消息流
 */
export function recordMessageFlow(flow: MessageFlow): void {
  const key = `${flow.fromAgentId}-${flow.toAgentId}-${flow.channelId}`;
  messageFlows.set(key, flow);
}

/**
 * 辅助函数：添加告警
 */
export function addAlert(alert: Omit<Alert, "id">): void {
  const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  alerts.set(alertId, { ...alert, id: alertId });
}
