/**
 * Agent-to-Agent 通信工具
 *
 * 功能：
 * - 智能助手之间的点对点通信
 * - 支持消息转发策略（让人类监控）
 * - 支持通道绑定（人类可参与）
 * - 消息历史记录
 */

import type { ChannelAccountBinding } from "../config/types.channel-bindings.js";
import type { OpenClawConfig } from "../config/types.js";

/**
 * Agent-to-Agent 消息类型
 */
export interface Agent2AgentMessage {
  /** 消息ID */
  id: string;

  /** 发送者ID */
  fromAgentId: string;

  /** 接收者ID */
  toAgentId: string;

  /** 消息内容 */
  content: string;

  /** 消息类型 */
  type: "request" | "response" | "notification";

  /** 时间戳 */
  timestamp: number;

  /** 元数据 */
  metadata?: {
    /** 优先级 */
    priority?: "low" | "normal" | "high" | "urgent";

    /** 是否需要回复 */
    requiresResponse?: boolean;

    /** 相关的消息ID（回复时使用） */
    inReplyTo?: string;

    /** 附件 */
    attachments?: Array<{
      type: string;
      content: string;
      filename?: string;
    }>;
  };
}

/**
 * Agent-to-Agent 转发策略
 */
export interface Agent2AgentForwardPolicy {
  /** 是否启用转发 */
  enabled: boolean;

  /** 转发到哪个智能助手 */
  forwardToAgentId?: string;

  /** 转发到哪个通道（让人类监控） */
  forwardToChannel?: {
    channelId: string;
    accountId: string;
  };

  /** 转发模式 */
  mode: "monitor-only" | "full-participation";

  /** 消息前缀 */
  messagePrefix?: string;
}

/**
 * Agent-to-Agent 配置
 */
export interface Agent2AgentConfig {
  /** 允许通信的智能助手对 */
  allowedPairs: Array<{
    agentId1: string;
    agentId2: string;
    bidirectional?: boolean; // 是否双向
  }>;

  /** 转发策略 */
  forwardPolicies?: Map<string, Agent2AgentForwardPolicy>; // key: "agentId1:agentId2"

  /** 消息历史存储路径 */
  historyPath?: string;

  /** 最大消息历史长度 */
  maxHistoryLength?: number;
}

/**
 * Agent-to-Agent 管理器
 */
export class Agent2AgentManager {
  private static instance: Agent2AgentManager;
  private config: Agent2AgentConfig;

  // 消息历史（按对话ID索引）
  private messageHistory = new Map<string, Agent2AgentMessage[]>();

  // 转发回调
  private forwardCallback?: (
    message: Agent2AgentMessage,
    policy: Agent2AgentForwardPolicy,
  ) => Promise<void>;

  private constructor() {
    this.config = {
      allowedPairs: [],
      maxHistoryLength: 1000,
    };
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): Agent2AgentManager {
    if (!Agent2AgentManager.instance) {
      Agent2AgentManager.instance = new Agent2AgentManager();
    }
    return Agent2AgentManager.instance;
  }

  /**
   * 初始化配置
   */
  public initialize(config: Agent2AgentConfig): void {
    this.config = config;
    console.log("[Agent2Agent] Initialized with config:", {
      allowedPairsCount: config.allowedPairs.length,
      forwardPoliciesCount: config.forwardPolicies?.size || 0,
    });
  }

  /**
   * 设置转发回调
   */
  public setForwardCallback(
    callback: (message: Agent2AgentMessage, policy: Agent2AgentForwardPolicy) => Promise<void>,
  ): void {
    this.forwardCallback = callback;
  }

  /**
   * 检查两个智能助手是否允许通信
   */
  public canCommunicate(fromAgentId: string, toAgentId: string): boolean {
    return this.config.allowedPairs.some((pair) => {
      if (pair.bidirectional) {
        return (
          (pair.agentId1 === fromAgentId && pair.agentId2 === toAgentId) ||
          (pair.agentId1 === toAgentId && pair.agentId2 === fromAgentId)
        );
      } else {
        return pair.agentId1 === fromAgentId && pair.agentId2 === toAgentId;
      }
    });
  }

  /**
   * 发送消息
   */
  public async sendMessage(
    message: Omit<Agent2AgentMessage, "id" | "timestamp">,
  ): Promise<Agent2AgentMessage> {
    // 检查权限
    if (!this.canCommunicate(message.fromAgentId, message.toAgentId)) {
      throw new Error(
        `Communication not allowed between ${message.fromAgentId} and ${message.toAgentId}`,
      );
    }

    // 生成完整消息
    const fullMessage: Agent2AgentMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: Date.now(),
    };

    // 存储到历史
    const conversationId = this.getConversationId(message.fromAgentId, message.toAgentId);
    this.addToHistory(conversationId, fullMessage);

    // 检查是否需要转发
    await this.handleForwarding(fullMessage);

    console.log("[Agent2Agent] Message sent:", {
      id: fullMessage.id,
      from: fullMessage.fromAgentId,
      to: fullMessage.toAgentId,
      type: fullMessage.type,
      contentLength: fullMessage.content.length,
    });

    return fullMessage;
  }

  /**
   * 获取消息历史
   */
  public getHistory(agentId1: string, agentId2: string, limit?: number): Agent2AgentMessage[] {
    const conversationId = this.getConversationId(agentId1, agentId2);
    const history = this.messageHistory.get(conversationId) || [];

    if (limit) {
      return history.slice(-limit);
    }

    return history;
  }

  /**
   * 添加允许的通信对
   */
  public addAllowedPair(agentId1: string, agentId2: string, bidirectional: boolean = true): void {
    this.config.allowedPairs.push({
      agentId1,
      agentId2,
      bidirectional,
    });

    console.log("[Agent2Agent] Added allowed pair:", {
      agentId1,
      agentId2,
      bidirectional,
    });
  }

  /**
   * 设置转发策略
   */
  public setForwardPolicy(
    fromAgentId: string,
    toAgentId: string,
    policy: Agent2AgentForwardPolicy,
  ): void {
    if (!this.config.forwardPolicies) {
      this.config.forwardPolicies = new Map();
    }

    const key = this.getPolicyKey(fromAgentId, toAgentId);
    this.config.forwardPolicies.set(key, policy);

    console.log("[Agent2Agent] Set forward policy:", {
      key,
      enabled: policy.enabled,
      mode: policy.mode,
    });
  }

  /**
   * 获取转发策略
   */
  public getForwardPolicy(
    fromAgentId: string,
    toAgentId: string,
  ): Agent2AgentForwardPolicy | undefined {
    if (!this.config.forwardPolicies) return undefined;

    const key = this.getPolicyKey(fromAgentId, toAgentId);
    return this.config.forwardPolicies.get(key);
  }

  /**
   * 处理消息转发
   */
  private async handleForwarding(message: Agent2AgentMessage): Promise<void> {
    const policy = this.getForwardPolicy(message.fromAgentId, message.toAgentId);

    if (!policy || !policy.enabled) {
      return; // 没有转发策略或未启用
    }

    if (this.forwardCallback) {
      await this.forwardCallback(message, policy);
    } else {
      console.warn("[Agent2Agent] Forward callback not set, message not forwarded:", message.id);
    }
  }

  /**
   * 生成对话ID
   */
  private getConversationId(agentId1: string, agentId2: string): string {
    // 排序保证一致性
    const sorted = [agentId1, agentId2].sort();
    return `${sorted[0]}:${sorted[1]}`;
  }

  /**
   * 生成策略键
   */
  private getPolicyKey(fromAgentId: string, toAgentId: string): string {
    return `${fromAgentId}:${toAgentId}`;
  }

  /**
   * 添加到历史
   */
  private addToHistory(conversationId: string, message: Agent2AgentMessage): void {
    if (!this.messageHistory.has(conversationId)) {
      this.messageHistory.set(conversationId, []);
    }

    const history = this.messageHistory.get(conversationId)!;
    history.push(message);

    // 限制历史长度
    const maxLength = this.config.maxHistoryLength || 1000;
    if (history.length > maxLength) {
      history.splice(0, history.length - maxLength);
    }
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取统计信息
   */
  public getStatistics(): {
    totalConversations: number;
    totalMessages: number;
    allowedPairsCount: number;
    forwardPoliciesCount: number;
  } {
    let totalMessages = 0;
    for (const history of this.messageHistory.values()) {
      totalMessages += history.length;
    }

    return {
      totalConversations: this.messageHistory.size,
      totalMessages,
      allowedPairsCount: this.config.allowedPairs.length,
      forwardPoliciesCount: this.config.forwardPolicies?.size || 0,
    };
  }

  /**
   * 清除历史
   */
  public clearHistory(agentId1?: string, agentId2?: string): void {
    if (agentId1 && agentId2) {
      // 清除特定对话
      const conversationId = this.getConversationId(agentId1, agentId2);
      this.messageHistory.delete(conversationId);
      console.log(`[Agent2Agent] Cleared history for conversation: ${conversationId}`);
    } else {
      // 清除所有历史
      this.messageHistory.clear();
      console.log("[Agent2Agent] Cleared all message history");
    }
  }
}

/**
 * 全局实例
 */
export const agent2AgentManager = Agent2AgentManager.getInstance();

/**
 * 便捷函数：发送 Agent-to-Agent 消息
 */
export async function sendAgent2AgentMessage(params: {
  fromAgentId: string;
  toAgentId: string;
  content: string;
  type?: "request" | "response" | "notification";
  priority?: "low" | "normal" | "high" | "urgent";
  requiresResponse?: boolean;
  inReplyTo?: string;
}): Promise<Agent2AgentMessage> {
  return await agent2AgentManager.sendMessage({
    fromAgentId: params.fromAgentId,
    toAgentId: params.toAgentId,
    content: params.content,
    type: params.type || "request",
    metadata: {
      priority: params.priority || "normal",
      requiresResponse: params.requiresResponse !== false,
      inReplyTo: params.inReplyTo,
    },
  });
}

/**
 * 便捷函数：获取对话历史
 */
export function getAgent2AgentHistory(
  agentId1: string,
  agentId2: string,
  limit?: number,
): Agent2AgentMessage[] {
  return agent2AgentManager.getHistory(agentId1, agentId2, limit);
}

/**
 * 便捷函数：允许两个智能助手通信
 */
export function allowAgent2AgentCommunication(
  agentId1: string,
  agentId2: string,
  bidirectional: boolean = true,
): void {
  agent2AgentManager.addAllowedPair(agentId1, agentId2, bidirectional);
}
