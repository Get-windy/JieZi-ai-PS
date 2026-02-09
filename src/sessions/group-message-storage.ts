/**
 * Phase 6: Agent-to-Agent 群组消息持久化系统
 *
 * 功能：
 * - 群组消息存储
 * - 消息历史查询
 * - 消息同步机制
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * 群组消息结构
 */
export interface GroupMessage {
  /** 消息ID */
  id: string;

  /** 群组ID */
  groupId: string;

  /** 发送者智能助手ID */
  senderId: string;

  /** 发送者名称 */
  senderName?: string;

  /** 消息内容 */
  content: string;

  /** 消息类型 */
  type: "text" | "system" | "command" | "file" | "image";

  /** 时间戳 */
  timestamp: number;

  /** 回复的消息ID */
  replyToId?: string;

  /** 附件信息 */
  attachments?: Array<{
    type: string;
    url: string;
    name: string;
    size?: number;
  }>;

  /** 提及的智能助手ID列表 */
  mentions?: string[];

  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 群组会话元数据
 */
export interface GroupSessionMetadata {
  /** 群组ID */
  groupId: string;

  /** 群组名称 */
  groupName: string;

  /** 创建时间 */
  createdAt: number;

  /** 最后活跃时间 */
  lastActiveAt: number;

  /** 消息总数 */
  totalMessages: number;

  /** 成员列表 */
  members: string[];

  /** 是否归档 */
  archived: boolean;
}

/**
 * 群组消息存储管理器
 */
export class GroupMessageStorage {
  private storageDir: string;
  private messageCache: Map<string, GroupMessage[]> = new Map();
  private metadataCache: Map<string, GroupSessionMetadata> = new Map();

  constructor(storageDir?: string) {
    const homedir = require("os").homedir();
    this.storageDir = storageDir || path.join(homedir, ".openclaw", "group-messages");
    this.ensureStorageDir();
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error("[Group Message Storage] Failed to create storage directory:", error);
    }
  }

  /**
   * 获取群组消息存储路径
   */
  private getGroupMessagePath(groupId: string): string {
    return path.join(this.storageDir, `${groupId}.jsonl`);
  }

  /**
   * 获取群组元数据路径
   */
  private getGroupMetadataPath(groupId: string): string {
    return path.join(this.storageDir, `${groupId}-metadata.json`);
  }

  /**
   * 保存消息到群组
   */
  async saveMessage(message: GroupMessage): Promise<void> {
    const messagePath = this.getGroupMessagePath(message.groupId);

    // 追加消息到 JSONL 文件
    const line = JSON.stringify(message) + "\n";
    try {
      await fs.appendFile(messagePath, line, "utf-8");

      // 更新缓存
      const cached = this.messageCache.get(message.groupId) || [];
      cached.push(message);
      this.messageCache.set(message.groupId, cached);

      // 更新元数据
      await this.updateMetadata(message.groupId, {
        lastActiveAt: message.timestamp,
        totalMessages: cached.length,
      });

      console.log(
        `[Group Message Storage] Saved message ${message.id} to group ${message.groupId}`,
      );
    } catch (error) {
      console.error("[Group Message Storage] Failed to save message:", error);
      throw error;
    }
  }

  /**
   * 批量保存消息
   */
  async saveMessages(messages: GroupMessage[]): Promise<void> {
    if (messages.length === 0) return;

    // 按群组ID分组
    const messagesByGroup = new Map<string, GroupMessage[]>();
    for (const message of messages) {
      const group = messagesByGroup.get(message.groupId) || [];
      group.push(message);
      messagesByGroup.set(message.groupId, group);
    }

    // 逐个群组保存
    for (const [groupId, groupMessages] of messagesByGroup) {
      const messagePath = this.getGroupMessagePath(groupId);
      const lines = groupMessages.map((msg) => JSON.stringify(msg) + "\n").join("");

      try {
        await fs.appendFile(messagePath, lines, "utf-8");

        // 更新缓存
        const cached = this.messageCache.get(groupId) || [];
        cached.push(...groupMessages);
        this.messageCache.set(groupId, cached);

        // 更新元数据
        const lastMessage = groupMessages[groupMessages.length - 1];
        await this.updateMetadata(groupId, {
          lastActiveAt: lastMessage.timestamp,
          totalMessages: cached.length,
        });

        console.log(
          `[Group Message Storage] Saved ${groupMessages.length} messages to group ${groupId}`,
        );
      } catch (error) {
        console.error(
          `[Group Message Storage] Failed to save messages to group ${groupId}:`,
          error,
        );
      }
    }
  }

  /**
   * 加载群组消息历史
   */
  async loadMessages(
    groupId: string,
    options?: {
      limit?: number;
      before?: number;
      after?: number;
    },
  ): Promise<GroupMessage[]> {
    // 检查缓存
    if (this.messageCache.has(groupId)) {
      return this.filterMessages(this.messageCache.get(groupId)!, options);
    }

    const messagePath = this.getGroupMessagePath(groupId);

    try {
      const content = await fs.readFile(messagePath, "utf-8");
      const lines = content.trim().split("\n");
      const messages: GroupMessage[] = [];

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            messages.push(message);
          } catch (error) {
            console.warn("[Group Message Storage] Failed to parse message line:", line);
          }
        }
      }

      // 缓存消息
      this.messageCache.set(groupId, messages);

      return this.filterMessages(messages, options);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // 文件不存在，返回空数组
        return [];
      }
      console.error("[Group Message Storage] Failed to load messages:", error);
      throw error;
    }
  }

  /**
   * 过滤消息
   */
  private filterMessages(
    messages: GroupMessage[],
    options?: {
      limit?: number;
      before?: number;
      after?: number;
    },
  ): GroupMessage[] {
    if (!options) {
      return messages;
    }

    let filtered = messages;

    // 时间过滤
    if (options.before) {
      filtered = filtered.filter((msg) => msg.timestamp < options.before!);
    }
    if (options.after) {
      filtered = filtered.filter((msg) => msg.timestamp > options.after!);
    }

    // 数量限制
    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * 获取群组元数据
   */
  async getMetadata(groupId: string): Promise<GroupSessionMetadata | null> {
    // 检查缓存
    if (this.metadataCache.has(groupId)) {
      return this.metadataCache.get(groupId)!;
    }

    const metadataPath = this.getGroupMetadataPath(groupId);

    try {
      const content = await fs.readFile(metadataPath, "utf-8");
      const metadata = JSON.parse(content);
      this.metadataCache.set(groupId, metadata);
      return metadata;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return null;
      }
      console.error("[Group Message Storage] Failed to load metadata:", error);
      throw error;
    }
  }

  /**
   * 更新群组元数据
   */
  async updateMetadata(groupId: string, updates: Partial<GroupSessionMetadata>): Promise<void> {
    const metadataPath = this.getGroupMetadataPath(groupId);

    // 加载现有元数据
    let metadata = await this.getMetadata(groupId);

    if (!metadata) {
      // 创建新元数据
      metadata = {
        groupId,
        groupName: groupId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        totalMessages: 0,
        members: [],
        archived: false,
      };
    }

    // 应用更新
    Object.assign(metadata, updates);

    // 保存
    try {
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
      this.metadataCache.set(groupId, metadata);
    } catch (error) {
      console.error("[Group Message Storage] Failed to update metadata:", error);
      throw error;
    }
  }

  /**
   * 搜索消息
   */
  async searchMessages(
    groupId: string,
    query: string,
    options?: {
      limit?: number;
      caseSensitive?: boolean;
    },
  ): Promise<GroupMessage[]> {
    const messages = await this.loadMessages(groupId);
    const caseSensitive = options?.caseSensitive ?? false;
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    const results = messages.filter((msg) => {
      const content = caseSensitive ? msg.content : msg.content.toLowerCase();
      return content.includes(searchQuery);
    });

    if (options?.limit) {
      return results.slice(-options.limit);
    }

    return results;
  }

  /**
   * 获取智能助手在群组的消息统计
   */
  async getAgentStats(
    groupId: string,
    agentId: string,
  ): Promise<{
    totalMessages: number;
    firstMessageAt?: number;
    lastMessageAt?: number;
  }> {
    const messages = await this.loadMessages(groupId);
    const agentMessages = messages.filter((msg) => msg.senderId === agentId);

    if (agentMessages.length === 0) {
      return { totalMessages: 0 };
    }

    return {
      totalMessages: agentMessages.length,
      firstMessageAt: agentMessages[0].timestamp,
      lastMessageAt: agentMessages[agentMessages.length - 1].timestamp,
    };
  }

  /**
   * 归档群组（将消息移动到归档目录）
   */
  async archiveGroup(groupId: string): Promise<void> {
    const archiveDir = path.join(this.storageDir, "archived");
    await fs.mkdir(archiveDir, { recursive: true });

    const messagePath = this.getGroupMessagePath(groupId);
    const metadataPath = this.getGroupMetadataPath(groupId);
    const archivedMessagePath = path.join(archiveDir, `${groupId}.jsonl`);
    const archivedMetadataPath = path.join(archiveDir, `${groupId}-metadata.json`);

    try {
      // 移动文件
      await fs.rename(messagePath, archivedMessagePath);
      await fs.rename(metadataPath, archivedMetadataPath);

      // 清除缓存
      this.messageCache.delete(groupId);
      this.metadataCache.delete(groupId);

      console.log(`[Group Message Storage] Archived group ${groupId}`);
    } catch (error) {
      console.error("[Group Message Storage] Failed to archive group:", error);
      throw error;
    }
  }

  /**
   * 删除群组消息（谨慎使用）
   */
  async deleteGroup(groupId: string): Promise<void> {
    const messagePath = this.getGroupMessagePath(groupId);
    const metadataPath = this.getGroupMetadataPath(groupId);

    try {
      await fs.unlink(messagePath).catch(() => {});
      await fs.unlink(metadataPath).catch(() => {});

      // 清除缓存
      this.messageCache.delete(groupId);
      this.metadataCache.delete(groupId);

      console.log(`[Group Message Storage] Deleted group ${groupId}`);
    } catch (error) {
      console.error("[Group Message Storage] Failed to delete group:", error);
      throw error;
    }
  }

  /**
   * 清除消息缓存
   */
  clearCache(): void {
    this.messageCache.clear();
    this.metadataCache.clear();
  }
}

/**
 * 全局群组消息存储实例
 */
export const groupMessageStorage = new GroupMessageStorage();
