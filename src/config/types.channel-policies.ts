/**
 * Phase 2: 通道账号策略系统类型定义
 *
 * 为智能助手的通道账号配置不同的消息处理策略
 */

/**
 * 通道策略类型
 */
export type ChannelPolicyType =
  // 核心策略（3种）
  | "private" // 私有模式：智能助手专属通道，不对外暴露
  | "monitor" // 长通模式：接收所有消息，带来源标记，支持转发
  | "listen-only" // 监听模式：只接收消息，不回复
  // 增强策略（3种）
  | "filter" // 过滤模式：基于规则过滤消息
  | "scheduled" // 定时模式：根据时间表响应消息
  | "forward" // 转发模式：自动转发消息到其他通道
  // 高级策略（6种）
  | "smart-route" // 智能路由：根据内容智能选择通道
  | "broadcast" // 广播模式：一条消息发送到多个通道
  | "round-robin" // 轮询模式：多通道负载均衡
  | "queue" // 队列模式：消息排队，批量处理
  | "moderate" // 审核模式：需要审核后才发送
  | "echo"; // 回声模式：记录日志，不处理

/**
 * 通道策略配置基础接口
 */
export interface ChannelPolicyBase {
  /** 策略类型 */
  type: ChannelPolicyType;

  /** 是否启用该策略 */
  enabled?: boolean;

  /** 策略描述 */
  description?: string;

  /** 优先级（数字越大优先级越高） */
  priority?: number;
}

/**
 * Private 私有模式配置
 */
export interface PrivatePolicy extends ChannelPolicyBase {
  type: "private";

  /** 是否允许偷窥（其他智能助手查看） */
  allowPeek?: boolean;

  /** 是否加密存储 */
  encryption?: boolean;
}

/**
 * Monitor 长通模式配置
 */
export interface MonitorPolicy extends ChannelPolicyBase {
  type: "monitor";

  /** 是否在消息前添加来源标记 */
  sourceTagging?: boolean;

  /** 来源标记模板（支持 {channel}, {account}, {peer} 变量） */
  tagTemplate?: string;

  /** 是否转发所有通道的消息到此通道 */
  forwardAllChannels?: boolean;

  /** 转发消息格式模板 */
  forwardFormat?: string;
}

/**
 * Listen-Only 监听模式配置
 */
export interface ListenOnlyPolicy extends ChannelPolicyBase {
  type: "listen-only";

  /** 是否需要提及（@机器人）才记录 */
  mentionRequired?: boolean;

  /** 监听关键词（匹配时才记录） */
  watchKeywords?: string[];

  /** 日志存储路径 */
  logPath?: string;

  /** 是否记录元数据（发送者、时间等） */
  recordMetadata?: boolean;
}

/**
 * Filter 过滤模式配置
 */
export interface FilterPolicy extends ChannelPolicyBase {
  type: "filter";

  /** 允许的关键词列表 */
  allowKeywords?: string[];

  /** 拒绝的关键词列表 */
  denyKeywords?: string[];

  /** 允许的发送者列表 */
  allowSenders?: string[];

  /** 拒绝的发送者列表 */
  denySenders?: string[];

  /** 时间范围过滤 */
  timeRange?: {
    start: string; // HH:mm 格式
    end: string;
    timezone?: string;
  };

  /** 匹配模式（all=所有条件, any=任一条件） */
  matchMode?: "all" | "any";

  /** 过滤后的操作 */
  onFilteredAction?: "drop" | "forward" | "archive" | "notify";

  /** 转发目标（当 action=forward 时） */
  forwardTo?: string[];
}

/**
 * Scheduled 定时模式配置
 */
export interface ScheduledPolicy extends ChannelPolicyBase {
  type: "scheduled";

  /** 工作时间配置 */
  workingHours?: {
    /** 工作日（1-7，1=周一） */
    weekdays?: number[];

    /** 每日工作时段 */
    dailyHours?: {
      start: string; // HH:mm
      end: string;
    };

    /** 时区 */
    timezone?: string;
  };

  /** 节假日配置（ISO日期列表） */
  holidays?: string[];

  /** 非工作时间的自动回复 */
  autoReply?: string;

  /** 非工作时间转发到的目标 */
  forwardTo?: string;
}

/**
 * Forward 转发模式配置
 */
export interface ForwardPolicy extends ChannelPolicyBase {
  type: "forward";

  /** 目标通道列表 */
  targetChannels: string[];

  /** 是否需要格式转换 */
  formatConversion?: boolean;

  /** 转发消息前缀 */
  messagePrefix?: string;

  /** 过滤关键词（仅转发匹配的消息） */
  filterKeywords?: string[];

  /** 转发延迟（毫秒） */
  delayMs?: number;
}

/**
 * Smart-Route 智能路由配置
 */
export interface SmartRoutePolicy extends ChannelPolicyBase {
  type: "smart-route";

  /** 路由规则 */
  routingRules: Array<{
    /** 规则名称 */
    name: string;

    /** 匹配条件 */
    condition: {
      /** 关键词匹配 */
      keywords?: string[];

      /** 情感分析（positive/negative/neutral） */
      sentiment?: "positive" | "negative" | "neutral";

      /** 消息长度范围 */
      lengthRange?: { min?: number; max?: number };

      /** 发送者类型 */
      senderType?: "user" | "bot" | "system";
    };

    /** 路由到的目标通道 */
    targetChannel: string;

    /** 优先级 */
    priority?: number;
  }>;

  /** 默认通道（无匹配规则时） */
  defaultChannel?: string;
}

/**
 * Broadcast 广播模式配置
 */
export interface BroadcastPolicy extends ChannelPolicyBase {
  type: "broadcast";

  /** 目标通道列表 */
  targetChannels: string[];

  /** 是否并发发送 */
  concurrent?: boolean;

  /** 失败重试次数 */
  retryAttempts?: number;

  /** 每个通道的延迟（毫秒） */
  delayPerChannel?: number;
}

/**
 * Round-Robin 轮询模式配置
 */
export interface RoundRobinPolicy extends ChannelPolicyBase {
  type: "round-robin";

  /** 参与轮询的通道列表 */
  channels: string[];

  /** 轮询模式 */
  mode?: "sequential" | "weighted" | "least-busy";

  /** 通道权重（仅 mode=weighted 时有效） */
  weights?: Record<string, number>;

  /** 状态持久化路径 */
  statePath?: string;
}

/**
 * Queue 队列模式配置
 */
export interface QueuePolicy extends ChannelPolicyBase {
  type: "queue";

  /** 队列最大容量 */
  maxSize?: number;

  /** 批处理大小 */
  batchSize?: number;

  /** 批处理间隔（秒） */
  batchIntervalSeconds?: number;

  /** 队列存储路径 */
  queuePath?: string;

  /** 消息过期时间（秒） */
  messageExpireSeconds?: number;
}

/**
 * Moderate 审核模式配置
 */
export interface ModeratePolicy extends ChannelPolicyBase {
  type: "moderate";

  /** 自动批准规则 */
  autoApproveRules?: Array<{
    /** 规则名称 */
    name: string;

    /** 发送者白名单 */
    senders?: string[];

    /** 内容关键词 */
    keywords?: string[];
  }>;

  /** 敏感词列表 */
  sensitiveWords?: string[];

  /** 审核通知发送到的通道 */
  notifyChannel?: string;

  /** 审核超时时间（秒） */
  approvalTimeoutSeconds?: number;

  /** 超时后的默认操作 */
  onTimeout?: "approve" | "reject";
}

/**
 * Echo 回声模式配置
 */
export interface EchoPolicy extends ChannelPolicyBase {
  type: "echo";

  /** 日志级别 */
  logLevel?: "info" | "debug" | "verbose";

  /** 日志文件路径 */
  logPath?: string;

  /** 是否包含消息内容 */
  includeContent?: boolean;

  /** 是否包含元数据 */
  includeMetadata?: boolean;
}

/**
 * 通道策略配置联合类型
 */
export type ChannelPolicy =
  | PrivatePolicy
  | MonitorPolicy
  | ListenOnlyPolicy
  | FilterPolicy
  | ScheduledPolicy
  | ForwardPolicy
  | SmartRoutePolicy
  | BroadcastPolicy
  | RoundRobinPolicy
  | QueuePolicy
  | ModeratePolicy
  | EchoPolicy;

/**
 * 智能助手的通道账号策略配置
 */
export interface AgentChannelPolicies {
  /** 智能助手ID */
  agentId: string;

  /** 通道策略列表（按通道ID键入） */
  policies: Record<string, ChannelPolicy>;

  /** 默认策略（未配置的通道使用此策略） */
  defaultPolicy?: ChannelPolicy;
}

/**
 * 策略执行结果
 */
export interface PolicyExecutionResult {
  /** 是否允许消息通过 */
  allow: boolean;

  /** 应用的策略类型 */
  policyType: ChannelPolicyType;

  /** 拒绝原因（当 allow=false 时） */
  reason?: string;

  /** 消息转换后的内容 */
  transformedMessage?: any;

  /** 转发目标列表 */
  forwardTargets?: string[];

  /** 额外的元数据 */
  metadata?: Record<string, any>;
}
