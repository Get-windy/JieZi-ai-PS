/**
 * 通道账号绑定配置类型定义
 *
 * 核心理念：智能助手在不同通道使用不同的策略
 * - 支持一个智能助手绑定多个通道账号
 * - 每个绑定可以配置独立的策略（Private/Monitor/LoadBalance等）
 * - 支持细粒度的通道级别控制
 */

/**
 * 通道策略类型
 */
export type ChannelPolicyType =
  | "private" // 私密通道：只有智能助手和指定用户可以访问
  | "monitor" // 监控通道：只读监控，不回复
  | "listen-only" // 只监听：记录消息，不响应，用于数据收集
  | "load-balance" // 负载均衡：多个账号轮流处理消息
  | "queue" // 队列模式：消息排队，批量处理
  | "moderate" // 审核模式：消息需要审核后才发送
  | "echo" // 回声模式：仅记录日志，不处理
  | "filter" // 过滤模式：基于规则过滤消息
  | "scheduled" // 定时模式：根据时间表响应消息
  | "forward" // 转发模式：自动转发消息到其他通道
  | "broadcast" // 广播模式：一条消息发送到多个通道
  | "smart-route"; // 智能路由：根据内容智能选择通道

/**
 * Private 策略配置
 */
export type PrivatePolicyConfig = {
  /** 允许访问的用户ID列表 */
  allowedUsers: string[];

  /** 未授权用户的自动回复消息 */
  unauthorizedReply?: string;
};

/**
 * Monitor 策略配置
 */
export type MonitorPolicyConfig = {
  /** 监控的通道ID列表 */
  monitorChannels: string[];

  /** 是否记录日志 */
  enableLogging?: boolean;

  /** 日志路径（相对于工作空间） */
  logPath?: string;
};

/**
 * ListenOnly 策略配置
 */
export type ListenOnlyPolicyConfig = {
  /** 是否记录日志 */
  enableLogging: boolean;

  /** 日志路径 */
  logPath: string;

  /** 是否触发事件（用于数据分析） */
  triggerEvents?: boolean;
};

/**
 * LoadBalance 策略配置
 */
export type LoadBalancePolicyConfig = {
  /** 参与负载均衡的账号ID列表 */
  accountIds: string[];

  /** 负载均衡算法 */
  algorithm: "round-robin" | "random" | "least-load";

  /** 健康检查配置 */
  healthCheck?: {
    enabled: boolean;
    interval: number; // 秒
    timeout: number; // 秒
  };
};

/**
 * Queue 策略配置
 */
export type QueuePolicyConfig = {
  /** 队列大小限制 */
  maxQueueSize: number;

  /** 批处理间隔（秒） */
  batchInterval: number;

  /** 批处理大小 */
  batchSize: number;

  /** 队列满时的处理方式 */
  overflowAction: "reject" | "drop-oldest" | "drop-newest";
};

/**
 * Moderate 策略配置
 */
export type ModeratePolicyConfig = {
  /** 自动批准规则 */
  autoApproveRules?: {
    /** 允许的发送者ID列表 */
    allowedSenders?: string[];

    /** 允许的消息模式（正则表达式） */
    allowedPatterns?: string[];

    /** 最大消息长度 */
    maxLength?: number;
  };

  /** 敏感词列表 */
  sensitiveWords?: string[];

  /** 审核通知接收者 */
  moderators: string[];

  /** 审核超时时间（秒） */
  timeout?: number;

  /** 超时默认动作 */
  defaultAction?: "approve" | "reject";
};

/**
 * Echo 策略配置
 */
export type EchoPolicyConfig = {
  /** 日志级别 */
  logLevel: "debug" | "info" | "warn" | "error";

  /** 日志路径 */
  logPath: string;
};

/**
 * Filter 策略配置
 */
export type FilterPolicyConfig = {
  /** 允许的关键词列表 */
  allowKeywords?: string[];

  /** 拒绝的关键词列表 */
  denyKeywords?: string[];

  /** 允许的发送者列表 */
  allowSenders?: string[];

  /** 拒绝的发送者列表 */
  denySenders?: string[];

  /** 时间范围（可选） */
  timeRange?: {
    /** 开始时间（HH:mm） */
    start: string;
    /** 结束时间（HH:mm） */
    end: string;
  };

  /** 匹配模式 */
  matchMode?: "all" | "any";

  /** 过滤后的动作 */
  onFilteredAction?: "drop" | "forward" | "archive" | "notify";

  /** 转发目标（当 onFilteredAction=forward 时） */
  forwardTo?: {
    channelId: string;
    accountId: string;
  };
};

/**
 * Scheduled 策略配置
 */
export type ScheduledPolicyConfig = {
  /** 时区 */
  timezone?: string;

  /** 工作时间配置 */
  workingHours?: {
    /** 工作日时间范围 */
    weekdays?: {
      start: string; // HH:mm
      end: string; // HH:mm
    };
    /** 周末时间范围 */
    weekends?: {
      start: string;
      end: string;
    };
  };

  /** 节假日列表 */
  holidays?: string[]; // YYYY-MM-DD

  /** 非工作时间的自动回复 */
  autoReply?: string;

  /** 非工作时间的转发目标 */
  forwardTo?: {
    channelId: string;
    accountId: string;
  };
};

/**
 * Forward 策略配置
 */
export type ForwardPolicyConfig = {
  /** 目标通道列表 */
  targetChannels: Array<{
    channelId: string;
    accountId: string;
    to?: string;
  }>;

  /** 过滤关键词（可选，只转发包含这些关键词的消息） */
  filterKeywords?: string[];

  /** 消息前缀（可选） */
  messagePrefix?: string;

  /** 是否进行格式转换 */
  formatConversion?: boolean;

  /** 延迟（毫秒） */
  delayMs?: number;
};

/**
 * Broadcast 策略配置
 */
export type BroadcastPolicyConfig = {
  /** 目标通道列表 */
  targetChannels: Array<{
    channelId: string;
    accountId: string;
  }>;

  /** 是否并发发送 */
  concurrent?: boolean;

  /** 发送间隔（毫秒，当 concurrent=false 时） */
  intervalMs?: number;

  /** 失败重试次数 */
  retryCount?: number;

  /** 消息格式转换 */
  formatConversion?: boolean;
};

/**
 * SmartRoute 策略配置
 */
export type SmartRoutePolicyConfig = {
  /** 路由规则 */
  routingRules: Array<{
    /** 规则名称 */
    name: string;

    /** 匹配条件 */
    condition: {
      /** 关键词匹配 */
      keywords?: string[];

      /** 情感分析 */
      sentiment?: "positive" | "negative" | "neutral";

      /** 消息长度范围 */
      lengthRange?: {
        min?: number;
        max?: number;
      };

      /** 发送者类型 */
      senderType?: "human" | "bot" | "system";
    };

    /** 目标通道 */
    targetChannel: {
      channelId: string;
      accountId: string;
    };
  }>;

  /** 默认目标（当没有规则匹配时） */
  defaultTarget?: {
    channelId: string;
    accountId: string;
  };
};

/**
 * 通道策略配置（联合类型）
 */
export type ChannelPolicyConfig =
  | { type: "private"; config: PrivatePolicyConfig }
  | { type: "monitor"; config: MonitorPolicyConfig }
  | { type: "listen-only"; config: ListenOnlyPolicyConfig }
  | { type: "load-balance"; config: LoadBalancePolicyConfig }
  | { type: "queue"; config: QueuePolicyConfig }
  | { type: "moderate"; config: ModeratePolicyConfig }
  | { type: "echo"; config: EchoPolicyConfig }
  | { type: "filter"; config: FilterPolicyConfig }
  | { type: "scheduled"; config: ScheduledPolicyConfig }
  | { type: "forward"; config: ForwardPolicyConfig }
  | { type: "broadcast"; config: BroadcastPolicyConfig }
  | { type: "smart-route"; config: SmartRoutePolicyConfig };

/**
 * 通道账号绑定配置
 */
export type ChannelAccountBinding = {
  /** 绑定ID（唯一标识） */
  id: string;

  /** 通道ID（如：telegram、wechat、slack） */
  channelId: string;

  /** 通道账号ID（引用 channels.accounts 中的 ID） */
  accountId: string;

  /** 策略配置 */
  policy: ChannelPolicyConfig;

  /** 是否启用 */
  enabled?: boolean;

  /** 优先级（数字越大优先级越高，用于多绑定场景） */
  priority?: number;

  /** 描述 */
  description?: string;

  /** 元数据 */
  metadata?: {
    createdAt?: number;
    createdBy?: string;
    lastModifiedAt?: number;
    lastModifiedBy?: string;
  };
};

/**
 * 智能助手通道绑定配置
 */
export type AgentChannelBindings = {
  /** 绑定列表 */
  bindings: ChannelAccountBinding[];

  /** 默认策略（当没有匹配的绑定时使用） */
  defaultPolicy?: ChannelPolicyConfig;
};

/**
 * 扩展 AgentConfig，添加通道绑定配置
 */
export type AgentConfigWithChannelBindings = {
  /** 现有字段 */
  id: string;
  name?: string;
  // ... 其他现有字段 ...

  /** 【新增】通道账号绑定配置 */
  channelBindings?: AgentChannelBindings;
};
