/**
 * Phase 2: 通道策略引擎
 *
 * 核心功能：
 * - 根据配置的策略处理入站和出站消息
 * - 支持12种策略类型
 * - 消息转换、过滤、转发等功能
 */

import type {
  ChannelPolicy,
  ChannelPolicyType,
  PolicyExecutionResult,
  PrivatePolicy,
  MonitorPolicy,
  ListenOnlyPolicy,
  FilterPolicy,
  ScheduledPolicy,
  ForwardPolicy,
  SmartRoutePolicy,
  BroadcastPolicy,
  RoundRobinPolicy,
  QueuePolicy,
  ModeratePolicy,
  EchoPolicy,
} from "../config/types.channel-policies.js";

/**
 * 策略引擎上下文
 */
export interface PolicyContext {
  /** 智能助手ID */
  agentId: string;

  /** 通道ID */
  channelId: string;

  /** 账号ID */
  accountId: string;

  /** 消息内容 */
  message: any;

  /** 发送者ID */
  senderId?: string;

  /** 发送者类型 */
  senderType?: "user" | "bot" | "system";

  /** 是否为群组消息 */
  isGroup?: boolean;

  /** 时间戳 */
  timestamp?: number;

  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 通道策略引擎类
 */
export class ChannelPolicyEngine {
  private policies: Map<string, ChannelPolicy> = new Map();
  private defaultPolicy: ChannelPolicy | null = null;

  /**
   * 构造函数
   */
  constructor(policies?: Record<string, ChannelPolicy>, defaultPolicy?: ChannelPolicy) {
    if (policies) {
      for (const [channelId, policy] of Object.entries(policies)) {
        this.policies.set(channelId, policy);
      }
    }
    if (defaultPolicy) {
      this.defaultPolicy = defaultPolicy;
    }
  }

  /**
   * 设置通道策略
   */
  setPolicy(channelId: string, policy: ChannelPolicy): void {
    this.policies.set(channelId, policy);
  }

  /**
   * 获取通道策略
   */
  getPolicy(channelId: string): ChannelPolicy | null {
    return this.policies.get(channelId) || this.defaultPolicy;
  }

  /**
   * 执行策略
   */
  async execute(context: PolicyContext): Promise<PolicyExecutionResult> {
    const policy = this.getPolicy(context.channelId);

    if (!policy) {
      // 没有配置策略，默认允许
      return {
        allow: true,
        policyType: "private",
        reason: "No policy configured, allowing by default",
      };
    }

    // 检查策略是否启用
    if (policy.enabled === false) {
      return {
        allow: true,
        policyType: policy.type,
        reason: "Policy is disabled",
      };
    }

    // 根据策略类型执行相应的处理
    switch (policy.type) {
      case "private":
        return this.executePrivatePolicy(policy, context);
      case "monitor":
        return this.executeMonitorPolicy(policy, context);
      case "listen-only":
        return this.executeListenOnlyPolicy(policy, context);
      case "filter":
        return this.executeFilterPolicy(policy, context);
      case "scheduled":
        return this.executeScheduledPolicy(policy, context);
      case "forward":
        return this.executeForwardPolicy(policy, context);
      case "smart-route":
        return this.executeSmartRoutePolicy(policy, context);
      case "broadcast":
        return this.executeBroadcastPolicy(policy, context);
      case "round-robin":
        return this.executeRoundRobinPolicy(policy, context);
      case "queue":
        return this.executeQueuePolicy(policy, context);
      case "moderate":
        return this.executeModeratePolicy(policy, context);
      case "echo":
        return this.executeEchoPolicy(policy, context);
      default: {
        const exhaustiveCheck: never = policy;
        console.warn(
          `[Policy Engine] Unsupported policy type: ${(exhaustiveCheck as ChannelPolicy).type}`,
        );
        return {
          allow: true,
          policyType: (exhaustiveCheck as ChannelPolicy).type,
          reason: "Unsupported policy type, allowing by default",
        };
      }
    }
  }

  /**
   * 执行 Private 私有模式策略
   */
  private async executePrivatePolicy(
    policy: PrivatePolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    // 私有模式：直接允许消息通过，不做额外处理
    return {
      allow: true,
      policyType: "private",
      metadata: {
        encryption: policy.encryption,
        allowPeek: policy.allowPeek,
      },
    };
  }

  /**
   * 执行 Monitor 长通模式策略
   */
  private async executeMonitorPolicy(
    policy: MonitorPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    let transformedMessage = context.message;
    const forwardTargets: string[] = [];

    // 添加来源标记
    if (policy.sourceTagging && policy.tagTemplate) {
      const tag = this.formatTemplate(policy.tagTemplate, {
        channel: context.channelId,
        account: context.accountId,
        peer: context.senderId || "unknown",
      });

      if (typeof transformedMessage === "string") {
        transformedMessage = `${tag} ${transformedMessage}`;
      } else if (transformedMessage && typeof transformedMessage === "object") {
        transformedMessage = {
          ...transformedMessage,
          sourceTag: tag,
        };
      }
    }

    // 转发所有通道的消息（如果配置了）
    if (policy.forwardAllChannels) {
      // 这里需要获取其他通道列表，暂时返回空数组
      // 实际实现需要集成到通道系统中
      console.log("[Monitor Policy] forwardAllChannels is enabled");
    }

    return {
      allow: true,
      policyType: "monitor",
      transformedMessage,
      forwardTargets: forwardTargets.length > 0 ? forwardTargets : undefined,
      metadata: {
        sourceTagging: policy.sourceTagging,
      },
    };
  }

  /**
   * 执行 Listen-Only 监听模式策略
   */
  private async executeListenOnlyPolicy(
    policy: ListenOnlyPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    let shouldRecord = true;

    // 检查是否需要提及
    if (policy.mentionRequired) {
      // 简化实现：检查消息中是否包含@机器人
      const messageText =
        typeof context.message === "string" ? context.message : context.message?.text || "";

      if (!messageText.includes("@") && !messageText.includes(context.agentId)) {
        shouldRecord = false;
      }
    }

    // 检查关键词
    if (shouldRecord && policy.watchKeywords && policy.watchKeywords.length > 0) {
      const messageText =
        typeof context.message === "string" ? context.message : context.message?.text || "";

      const hasKeyword = policy.watchKeywords.some((keyword) =>
        messageText.toLowerCase().includes(keyword.toLowerCase()),
      );

      if (!hasKeyword) {
        shouldRecord = false;
      }
    }

    // 记录日志
    if (shouldRecord && policy.logPath) {
      const logEntry = {
        timestamp: context.timestamp || Date.now(),
        channelId: context.channelId,
        accountId: context.accountId,
        senderId: context.senderId,
        message: context.message,
        metadata: policy.recordMetadata ? context.metadata : undefined,
      };

      // 实际实现需要写入文件系统
      console.log("[Listen-Only Policy] Would log:", logEntry);
    }

    // 监听模式：不允许回复
    return {
      allow: false,
      policyType: "listen-only",
      reason: "Listen-only mode: message recorded but no reply",
      metadata: {
        recorded: shouldRecord,
      },
    };
  }

  /**
   * 执行 Filter 过滤模式策略
   */
  private async executeFilterPolicy(
    policy: FilterPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    const messageText =
      typeof context.message === "string" ? context.message : context.message?.text || "";

    const checks: boolean[] = [];

    // 检查拒绝关键词
    if (policy.denyKeywords && policy.denyKeywords.length > 0) {
      const hasDenyKeyword = policy.denyKeywords.some((keyword) =>
        messageText.toLowerCase().includes(keyword.toLowerCase()),
      );
      if (hasDenyKeyword) {
        checks.push(false);
      }
    }

    // 检查允许关键词
    if (policy.allowKeywords && policy.allowKeywords.length > 0) {
      const hasAllowKeyword = policy.allowKeywords.some((keyword) =>
        messageText.toLowerCase().includes(keyword.toLowerCase()),
      );
      checks.push(hasAllowKeyword);
    }

    // 检查发送者黑名单
    if (policy.denySenders && context.senderId) {
      if (policy.denySenders.includes(context.senderId)) {
        checks.push(false);
      }
    }

    // 检查发送者白名单
    if (policy.allowSenders && context.senderId) {
      checks.push(policy.allowSenders.includes(context.senderId));
    }

    // 检查时间范围
    if (policy.timeRange) {
      const inTimeRange = this.isInTimeRange(
        context.timestamp || Date.now(),
        policy.timeRange.start,
        policy.timeRange.end,
        policy.timeRange.timezone,
      );
      checks.push(inTimeRange);
    }

    // 根据匹配模式决定结果
    let allow = true;
    if (checks.length > 0) {
      if (policy.matchMode === "all") {
        allow = checks.every((check) => check);
      } else {
        allow = checks.some((check) => check);
      }
    }

    // 处理过滤后的操作
    let forwardTargets: string[] | undefined;
    if (!allow && policy.onFilteredAction === "forward" && policy.forwardTo) {
      forwardTargets = policy.forwardTo;
    }

    return {
      allow,
      policyType: "filter",
      reason: allow ? undefined : "Message filtered by policy rules",
      forwardTargets,
      metadata: {
        matchMode: policy.matchMode,
        checksRun: checks.length,
      },
    };
  }

  /**
   * 执行 Scheduled 定时模式策略
   */
  private async executeScheduledPolicy(
    policy: ScheduledPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    const timestamp = context.timestamp || Date.now();
    const date = new Date(timestamp);

    // 检查是否在工作时间
    let inWorkingHours = true;

    if (policy.workingHours) {
      const { weekdays, dailyHours, timezone } = policy.workingHours;

      // 检查工作日
      if (weekdays) {
        const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ...
        const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // 转换为 1-7
        inWorkingHours = weekdays.includes(normalizedDay);
      }

      // 检查每日时段
      if (inWorkingHours && dailyHours) {
        inWorkingHours = this.isInTimeRange(timestamp, dailyHours.start, dailyHours.end, timezone);
      }
    }

    // 检查节假日
    if (inWorkingHours && policy.holidays) {
      const dateStr = date.toISOString().split("T")[0];
      if (policy.holidays.includes(dateStr)) {
        inWorkingHours = false;
      }
    }

    // 如果不在工作时间
    if (!inWorkingHours) {
      const result: PolicyExecutionResult = {
        allow: false,
        policyType: "scheduled",
        reason: "Outside working hours",
        metadata: {
          autoReply: policy.autoReply,
        },
      };

      // 转发到指定目标
      if (policy.forwardTo) {
        result.forwardTargets = [policy.forwardTo];
      }

      return result;
    }

    return {
      allow: true,
      policyType: "scheduled",
      metadata: {
        inWorkingHours: true,
      },
    };
  }

  /**
   * 执行 Forward 转发模式策略
   */
  private async executeForwardPolicy(
    policy: ForwardPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    // 检查关键词过滤
    if (policy.filterKeywords && policy.filterKeywords.length > 0) {
      const messageText =
        typeof context.message === "string" ? context.message : context.message?.text || "";

      const hasKeyword = policy.filterKeywords.some((keyword) =>
        messageText.toLowerCase().includes(keyword.toLowerCase()),
      );

      if (!hasKeyword) {
        return {
          allow: true,
          policyType: "forward",
          reason: "Message does not match filter keywords, not forwarding",
        };
      }
    }

    // 转换消息内容
    let transformedMessage = context.message;
    if (policy.messagePrefix) {
      if (typeof transformedMessage === "string") {
        transformedMessage = `${policy.messagePrefix} ${transformedMessage}`;
      }
    }

    return {
      allow: true,
      policyType: "forward",
      transformedMessage,
      forwardTargets: policy.targetChannels,
      metadata: {
        delayMs: policy.delayMs,
        formatConversion: policy.formatConversion,
      },
    };
  }

  /**
   * 执行 Smart-Route 智能路由策略
   */
  private async executeSmartRoutePolicy(
    policy: SmartRoutePolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    const messageText =
      typeof context.message === "string" ? context.message : context.message?.text || "";

    // 根据规则进行路由
    let selectedChannel: string | null = null;

    if (policy.routingRules && policy.routingRules.length > 0) {
      for (const rule of policy.routingRules) {
        let matches = true;

        // 检查关键词匹配
        if (rule.condition.keywords && rule.condition.keywords.length > 0) {
          matches = rule.condition.keywords.some((keyword: string) =>
            messageText.toLowerCase().includes(keyword.toLowerCase()),
          );
        }

        // 检查发送者类型
        if (matches && rule.condition.senderType && context.senderType) {
          matches = rule.condition.senderType === context.senderType;
        }

        // 检查消息长度
        if (matches && rule.condition.lengthRange) {
          const length = messageText.length;
          if (
            rule.condition.lengthRange.min !== undefined &&
            length < rule.condition.lengthRange.min
          ) {
            matches = false;
          }
          if (
            rule.condition.lengthRange.max !== undefined &&
            length > rule.condition.lengthRange.max
          ) {
            matches = false;
          }
        }

        if (matches) {
          selectedChannel = rule.targetChannel;
          break;
        }
      }
    }

    // 如果没有匹配的规则，使用默认通道
    if (!selectedChannel) {
      selectedChannel = policy.defaultChannel || null;
    }

    return {
      allow: true,
      policyType: "smart-route",
      forwardTargets: selectedChannel ? [selectedChannel] : undefined,
      metadata: {
        routedTo: selectedChannel,
        fallbackToDefault: !policy.routingRules || policy.routingRules.length === 0,
      },
    };
  }

  /**
   * 执行 Broadcast 广播策略
   */
  private async executeBroadcastPolicy(
    policy: BroadcastPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    const targets = [...policy.targetChannels];

    // 应用消息模板
    let transformedMessage = context.message;

    return {
      allow: true,
      policyType: "broadcast",
      transformedMessage,
      forwardTargets: targets,
      metadata: {
        broadcastCount: targets.length,
        delayMs: policy.delayPerChannel,
        concurrent: policy.concurrent,
      },
    };
  }

  /**
   * 执行 Round-Robin 轮询策略
   */
  private async executeRoundRobinPolicy(
    policy: RoundRobinPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    if (!policy.channels || policy.channels.length === 0) {
      return {
        allow: false,
        policyType: "round-robin",
        reason: "No channels configured for round-robin",
      };
    }

    // 简单的轮询实现：使用时间戳模运算
    const timestamp = context.timestamp || Date.now();
    const index = Math.floor(timestamp / 1000) % policy.channels.length;
    const selectedChannel = policy.channels[index];

    return {
      allow: true,
      policyType: "round-robin",
      forwardTargets: [selectedChannel],
      metadata: {
        selectedIndex: index,
        totalChannels: policy.channels.length,
        mode: policy.mode,
      },
    };
  }

  /**
   * 执行 Queue 队列策略
   */
  private async executeQueuePolicy(
    policy: QueuePolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    // 队列策略需要外部状态管理，这里只返回元数据
    // 实际实现需要与消息队列系统集成
    return {
      allow: true,
      policyType: "queue",
      metadata: {
        maxSize: policy.maxSize,
        batchSize: policy.batchSize,
        batchIntervalSeconds: policy.batchIntervalSeconds,
        queueAction: "enqueue", // 标记消息需要入队
      },
    };
  }

  /**
   * 执行 Moderate 审核策略
   */
  private async executeModeratePolicy(
    policy: ModeratePolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    const messageText =
      typeof context.message === "string" ? context.message : context.message?.text || "";

    // 检查敏感词
    if (policy.sensitiveWords && policy.sensitiveWords.length > 0) {
      const foundWords = policy.sensitiveWords.filter((word: string) =>
        messageText.toLowerCase().includes(word.toLowerCase()),
      );

      if (foundWords.length > 0) {
        // 需要人工审核
        return {
          allow: false,
          policyType: "moderate",
          reason: "Message requires manual moderation",
          metadata: {
            requiresModeration: true,
            foundSensitiveWords: foundWords,
            notifyChannel: policy.notifyChannel,
          },
        };
      }
    }

    // 检查自动批准规则
    if (policy.autoApproveRules && policy.autoApproveRules.length > 0) {
      for (const rule of policy.autoApproveRules) {
        if (rule.senders && context.senderId && rule.senders.includes(context.senderId)) {
          return {
            allow: true,
            policyType: "moderate",
            reason: "Sender is in auto-approve list",
          };
        }
      }
    }

    // 默认允许
    return {
      allow: true,
      policyType: "moderate",
      metadata: {
        requiresModeration: false,
      },
    };
  }

  /**
   * 执行 Echo 回声测试策略
   */
  private async executeEchoPolicy(
    policy: EchoPolicy,
    context: PolicyContext,
  ): Promise<PolicyExecutionResult> {
    const messageText =
      typeof context.message === "string" ? context.message : context.message?.text || "";

    // Echo 策略直接返回消息，记录日志
    console.log(`[Echo Policy] ${policy.logLevel || "info"}: ${messageText}`);

    return {
      allow: true,
      policyType: "echo",
      transformedMessage: context.message,
      metadata: {
        includeMetadata: policy.includeMetadata,
        logLevel: policy.logLevel,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * 检查是否在时间范围内
   */
  private isInTimeRange(
    timestamp: number,
    startTime: string,
    endTime: string,
    timezone?: string,
  ): boolean {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const startTotalMinutes = startHours * 60 + startMinutes;

    const [endHours, endMinutes] = endTime.split(":").map(Number);
    const endTotalMinutes = endHours * 60 + endMinutes;

    // 处理跨天的情况
    if (endTotalMinutes < startTotalMinutes) {
      return currentMinutes >= startTotalMinutes || currentMinutes <= endTotalMinutes;
    }

    return currentMinutes >= startTotalMinutes && currentMinutes <= endTotalMinutes;
  }

  /**
   * 格式化模板
   */
  private formatTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
    return result;
  }
}

/**
 * 创建策略引擎实例
 */
export function createPolicyEngine(
  policies?: Record<string, ChannelPolicy>,
  defaultPolicy?: ChannelPolicy,
): ChannelPolicyEngine {
  return new ChannelPolicyEngine(policies, defaultPolicy);
}
