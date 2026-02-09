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
        respond(false, null, errorShape(ErrorCodes.NOT_FOUND, "Rule not found"));
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
        respond(false, null, errorShape(ErrorCodes.NOT_FOUND, "Rule not found"));
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
        respond(false, null, errorShape(ErrorCodes.NOT_FOUND, "Alert not found"));
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
};

/**
 * 辅助函数：记录活动会话
 */
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
