/**
 * 通道策略核心接口定义
 *
 * 策略模式：每种策略实现统一的接口，由策略引擎动态调用
 */

import type { ChannelPolicyConfig } from "../../config/types.channel-bindings.js";

/**
 * 消息入站上下文
 */
export type InboundMessageContext = {
  /** 消息ID */
  messageId: string;

  /** 通道ID */
  channelId: string;

  /** 账号ID */
  accountId: string;

  /** 发送者ID */
  from: string;

  /** 接收者ID */
  to?: string;

  /** 消息内容 */
  content: string;

  /** 消息类型 */
  type: "text" | "image" | "file" | "audio" | "video" | "location" | "contact";

  /** 附件信息 */
  attachments?: Array<{
    type: string;
    url: string;
    filename?: string;
    size?: number;
  }>;

  /** 消息元数据 */
  metadata?: Record<string, unknown>;

  /** 时间戳 */
  timestamp: number;
};

/**
 * 消息出站上下文
 */
export type OutboundMessageContext = {
  /** 消息ID */
  messageId: string;

  /** 通道ID */
  channelId: string;

  /** 账号ID */
  accountId: string;

  /** 接收者ID */
  to: string;

  /** 消息内容 */
  content: string;

  /** 消息类型 */
  type: "text" | "image" | "file" | "audio" | "video" | "location" | "contact";

  /** 附件信息 */
  attachments?: Array<{
    type: string;
    url?: string;
    path?: string;
    filename?: string;
  }>;

  /** 消息元数据 */
  metadata?: Record<string, unknown>;

  /** 时间戳 */
  timestamp: number;
};

/**
 * 策略处理结果
 */
export type PolicyResult = {
  /** 是否允许消息通过 */
  allow: boolean;

  /** 拒绝原因（当 allow=false 时） */
  reason?: string;

  /** 自动回复内容（可选） */
  autoReply?: string;

  /** 转换后的消息（可选，用于消息修改场景） */
  transformedMessage?: {
    content?: string;
    type?: string;
    attachments?: Array<{
      type: string;
      url?: string;
      path?: string;
      filename?: string;
    }>;
    metadata?: Record<string, unknown>;
  };

  /** 路由到其他通道（可选，用于消息转发场景） */
  routeTo?: Array<{
    channelId: string;
    accountId: string;
    to?: string;
  }>;

  /** 额外的元数据 */
  metadata?: Record<string, unknown>;
};

/**
 * 策略处理上下文（完整上下文）
 */
export type PolicyProcessContext = {
  /** 消息上下文（入站或出站） */
  message: InboundMessageContext | OutboundMessageContext;

  /** 智能助手ID */
  agentId: string;

  /** 智能助手配置 */
  agentConfig: any; // AgentConfig type

  /** 通道ID */
  channelId: string;

  /** 账号ID */
  accountId: string;

  /** 绑定配置 */
  binding: {
    id: string;
    policy: ChannelPolicyConfig;
    enabled?: boolean;
    priority?: number;
  };

  /** Gateway 上下文 */
  gatewayContext: any;
};

/**
 * 策略处理器接口
 *
 * 所有策略都必须实现这个接口
 */
export interface PolicyHandler {
  /**
   * 策略类型
   */
  readonly type: string;

  /**
   * 处理消息
   *
   * @param context - 策略处理上下文
   * @returns 策略处理结果
   */
  process(context: PolicyProcessContext): Promise<PolicyResult>;

  /**
   * 验证策略配置
   *
   * @param config - 策略配置
   * @returns 验证结果
   */
  validate(config: any): Promise<{
    valid: boolean;
    errors?: string[];
  }>;
}

/**
 * 策略注册表
 *
 * 用于动态注册和查找策略处理器
 */
export class PolicyRegistry {
  private static handlers = new Map<string, PolicyHandler>();

  /**
   * 注册策略处理器
   */
  static register(handler: PolicyHandler): void {
    this.handlers.set(handler.type, handler);
  }

  /**
   * 获取策略处理器
   */
  static get(type: string): PolicyHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * 列出所有已注册的策略类型
   */
  static list(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 检查策略是否已注册
   */
  static has(type: string): boolean {
    return this.handlers.has(type);
  }
}
