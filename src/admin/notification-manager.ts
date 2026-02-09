/**
 * Phase 7: 管理员通知管理器
 *
 * 职责：
 * 1. 管理管理员通知
 * 2. 发送各种类型的通知
 * 3. 通知渠道管理（邮件、Slack、Webhook）
 * 4. 通知历史记录
 */

import type { PermissionSubject } from "../config/types.permissions.js";
import type {
  AdminNotification,
  AdminNotificationType,
  ApprovalPriority,
  AdvancedApprovalRequest,
  EmergencyAccessRequest,
  SuperAdmin,
} from "./types.js";

/**
 * 通知渠道配置
 */
export interface NotificationChannelConfig {
  email?: {
    enabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    from?: string;
  };
  slack?: {
    enabled: boolean;
    webhookUrl?: string;
    channel?: string;
  };
  webhook?: {
    enabled: boolean;
    url?: string;
    headers?: Record<string, string>;
  };
  telegram?: {
    enabled: boolean;
    botToken?: string;
    chatId?: string;
  };
}

/**
 * 通知管理器（单例）
 */
export class NotificationManager {
  private static instance: NotificationManager;
  private notifications: Map<string, AdminNotification> = new Map();
  private channelConfig: NotificationChannelConfig = {};

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  /**
   * 设置渠道配置
   */
  public setChannelConfig(config: NotificationChannelConfig): void {
    this.channelConfig = config;
  }

  /**
   * 获取渠道配置
   */
  public getChannelConfig(): NotificationChannelConfig {
    return this.channelConfig;
  }

  // ========== 通知创建 ==========

  /**
   * 创建通知
   */
  public createNotification(params: {
    type: AdminNotificationType;
    recipientId: string;
    recipientRole: SuperAdmin["role"];
    title: string;
    message: string;
    priority?: ApprovalPriority;
    relatedEntityType?: string;
    relatedEntityId?: string;
    actions?: AdminNotification["actions"];
    expiresIn?: number; // 过期时间（秒）
  }): AdminNotification {
    const now = Date.now();
    const id = `notif-${now}-${Math.random().toString(36).substr(2, 9)}`;

    const notification: AdminNotification = {
      id,
      type: params.type,
      recipientId: params.recipientId,
      recipientRole: params.recipientRole,
      title: params.title,
      message: params.message,
      priority: params.priority || "normal",
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      actions: params.actions,
      isRead: false,
      createdAt: now,
      expiresAt: params.expiresIn ? now + params.expiresIn * 1000 : undefined,
    };

    this.notifications.set(id, notification);

    // 发送到各个渠道
    this.sendToChannels(notification);

    return notification;
  }

  /**
   * 发送到各个渠道
   */
  private async sendToChannels(notification: AdminNotification): Promise<void> {
    const promises: Promise<void>[] = [];

    // 邮件
    if (this.channelConfig.email?.enabled) {
      promises.push(this.sendEmail(notification));
    }

    // Slack
    if (this.channelConfig.slack?.enabled) {
      promises.push(this.sendSlack(notification));
    }

    // Webhook
    if (this.channelConfig.webhook?.enabled) {
      promises.push(this.sendWebhook(notification));
    }

    // Telegram
    if (this.channelConfig.telegram?.enabled) {
      promises.push(this.sendTelegram(notification));
    }

    await Promise.allSettled(promises);
  }

  /**
   * 发送邮件通知
   */
  private async sendEmail(notification: AdminNotification): Promise<void> {
    // 这里应该实现实际的邮件发送逻辑
    console.log("[Email] Sending notification:", {
      to: notification.recipientId,
      subject: notification.title,
      body: notification.message,
    });
  }

  /**
   * 发送 Slack 通知
   */
  private async sendSlack(notification: AdminNotification): Promise<void> {
    if (!this.channelConfig.slack?.webhookUrl) {
      return;
    }

    try {
      const payload = {
        text: notification.title,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: notification.title,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: notification.message,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Priority: *${notification.priority}* | Type: ${notification.type}`,
              },
            ],
          },
        ],
      };

      // 添加操作按钮
      if (notification.actions && notification.actions.length > 0) {
        payload.blocks.push({
          type: "actions",
          elements: notification.actions.map((action) => ({
            type: "button",
            text: {
              type: "plain_text",
              text: action.label,
            },
            url: action.url,
            value: action.action,
          })),
        } as any);
      }

      // TODO: 实际发送到 Slack
      console.log("[Slack] Sending notification:", payload);
    } catch (error) {
      console.error("[Slack] Failed to send notification:", error);
    }
  }

  /**
   * 发送 Webhook 通知
   */
  private async sendWebhook(notification: AdminNotification): Promise<void> {
    if (!this.channelConfig.webhook?.url) {
      return;
    }

    try {
      const payload = {
        notification,
        timestamp: Date.now(),
      };

      // TODO: 实际发送到 Webhook
      console.log("[Webhook] Sending notification:", payload);
    } catch (error) {
      console.error("[Webhook] Failed to send notification:", error);
    }
  }

  /**
   * 发送 Telegram 通知
   */
  private async sendTelegram(notification: AdminNotification): Promise<void> {
    if (!this.channelConfig.telegram?.botToken || !this.channelConfig.telegram?.chatId) {
      return;
    }

    try {
      const text = `*${notification.title}*

${notification.message}

Priority: ${notification.priority}`;

      // TODO: 实际发送到 Telegram
      console.log("[Telegram] Sending notification:", text);
    } catch (error) {
      console.error("[Telegram] Failed to send notification:", error);
    }
  }

  // ========== 特定类型通知 ==========

  /**
   * 发送审批请求通知
   */
  public notifyApprovalRequest(
    recipient: PermissionSubject,
    request: AdvancedApprovalRequest,
  ): AdminNotification {
    return this.createNotification({
      type: "approval_request",
      recipientId: recipient.id,
      recipientRole: "system-admin", // 需要从用户信息中获取
      title: `New Approval Request: ${request.title}`,
      message: `${request.description}\n\nPriority: ${request.priority}\nRequester: ${request.requester.name || request.requester.id}`,
      priority: request.priority,
      relatedEntityType: "approval_request",
      relatedEntityId: request.id,
      actions: [
        {
          label: "View Details",
          action: "view_approval",
          url: `/admin/approvals/${request.id}`,
        },
        {
          label: "Approve",
          action: "approve",
        },
        {
          label: "Reject",
          action: "reject",
        },
      ],
    });
  }

  /**
   * 发送审批结果通知
   */
  public notifyApprovalResult(
    recipient: PermissionSubject,
    request: AdvancedApprovalRequest,
    approved: boolean,
  ): AdminNotification {
    const type: AdminNotificationType = approved ? "approval_approved" : "approval_rejected";
    const status = approved ? "Approved" : "Rejected";

    return this.createNotification({
      type,
      recipientId: recipient.id,
      recipientRole: "system-admin",
      title: `Approval Request ${status}: ${request.title}`,
      message: `Your approval request has been ${status.toLowerCase()}.\n\nRequest: ${request.description}`,
      priority: request.priority,
      relatedEntityType: "approval_request",
      relatedEntityId: request.id,
      actions: [
        {
          label: "View Details",
          action: "view_approval",
          url: `/admin/approvals/${request.id}`,
        },
      ],
    });
  }

  /**
   * 发送紧急访问通知
   */
  public notifyEmergencyAccess(
    recipient: SuperAdmin,
    request: EmergencyAccessRequest,
  ): AdminNotification {
    return this.createNotification({
      type: "emergency_access",
      recipientId: recipient.id,
      recipientRole: recipient.role,
      title: `Emergency Access Request: ${request.emergencyType}`,
      message: `${request.description}\n\nSeverity: ${request.severity}\nRequester: ${request.requester.name}`,
      priority: request.severity === "critical" ? "emergency" : "urgent",
      relatedEntityType: "emergency_access",
      relatedEntityId: request.id,
      actions: [
        {
          label: "View Details",
          action: "view_emergency_access",
          url: `/admin/emergency-access/${request.id}`,
        },
        {
          label: "Grant Access",
          action: "grant_access",
        },
        {
          label: "Deny",
          action: "deny_access",
        },
      ],
    });
  }

  /**
   * 发送系统警报
   */
  public notifySystemAlert(params: {
    recipientIds: string[];
    title: string;
    message: string;
    severity: "low" | "medium" | "high" | "critical";
    details?: Record<string, any>;
  }): AdminNotification[] {
    const priority: ApprovalPriority =
      params.severity === "critical"
        ? "emergency"
        : params.severity === "high"
          ? "urgent"
          : "normal";

    return params.recipientIds.map((recipientId) =>
      this.createNotification({
        type: "system_alert",
        recipientId,
        recipientRole: "system-admin",
        title: params.title,
        message: params.message,
        priority,
      }),
    );
  }

  /**
   * 发送安全事件通知
   */
  public notifySecurityIncident(params: {
    recipientIds: string[];
    title: string;
    description: string;
    incidentType: string;
    affectedSystems?: string[];
  }): AdminNotification[] {
    return params.recipientIds.map((recipientId) =>
      this.createNotification({
        type: "security_incident",
        recipientId,
        recipientRole: "security-admin",
        title: `Security Incident: ${params.title}`,
        message: `${params.description}\n\nType: ${params.incidentType}${
          params.affectedSystems ? `\nAffected Systems: ${params.affectedSystems.join(", ")}` : ""
        }`,
        priority: "emergency",
      }),
    );
  }

  // ========== 通知管理 ==========

  /**
   * 获取通知
   */
  public getNotification(notificationId: string): AdminNotification | null {
    return this.notifications.get(notificationId) || null;
  }

  /**
   * 获取用户通知列表
   */
  public getUserNotifications(params: {
    recipientId: string;
    unreadOnly?: boolean;
    type?: AdminNotificationType;
    limit?: number;
  }): AdminNotification[] {
    let notifications = Array.from(this.notifications.values()).filter(
      (n) => n.recipientId === params.recipientId,
    );

    // 过滤未读
    if (params.unreadOnly) {
      notifications = notifications.filter((n) => !n.isRead);
    }

    // 过滤类型
    if (params.type) {
      notifications = notifications.filter((n) => n.type === params.type);
    }

    // 过滤过期
    const now = Date.now();
    notifications = notifications.filter((n) => !n.expiresAt || n.expiresAt > now);

    // 排序（最新的在前）
    notifications.sort((a, b) => b.createdAt - a.createdAt);

    // 限制数量
    if (params.limit) {
      notifications = notifications.slice(0, params.limit);
    }

    return notifications;
  }

  /**
   * 标记为已读
   */
  public markAsRead(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      return false;
    }

    notification.isRead = true;
    notification.readAt = Date.now();

    return true;
  }

  /**
   * 批量标记为已读
   */
  public markAllAsRead(recipientId: string): number {
    let count = 0;

    for (const notification of this.notifications.values()) {
      if (notification.recipientId === recipientId && !notification.isRead) {
        notification.isRead = true;
        notification.readAt = Date.now();
        count++;
      }
    }

    return count;
  }

  /**
   * 删除通知
   */
  public deleteNotification(notificationId: string): boolean {
    return this.notifications.delete(notificationId);
  }

  /**
   * 获取未读通知数量
   */
  public getUnreadCount(recipientId: string): number {
    return Array.from(this.notifications.values()).filter(
      (n) => n.recipientId === recipientId && !n.isRead,
    ).length;
  }

  /**
   * 清理过期通知
   */
  public cleanupExpiredNotifications(): number {
    const now = Date.now();
    let count = 0;

    for (const [id, notification] of this.notifications.entries()) {
      if (notification.expiresAt && notification.expiresAt < now) {
        this.notifications.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  public clearAll(): void {
    this.notifications.clear();
  }
}

/**
 * 导出单例实例
 */
export const notificationManager = NotificationManager.getInstance();
