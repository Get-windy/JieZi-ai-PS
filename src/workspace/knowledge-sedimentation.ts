/**
 * Phase 5: 工作空间与文档系统 - 知识沉淀系统
 *
 * 职责:
 * 1. 自动检测重要讨论
 * 2. 将讨论沉淀为文档
 * 3. 自动分类知识文档
 * 4. 管理知识文档的存储和检索
 */

import * as fs from "fs";
import * as path from "path";
import { groupWorkspaceManager } from "./group-workspace";
import {
  KnowledgeCategory,
  KnowledgeSedimentationConfig,
  KnowledgeSedimentationResult,
  Message,
  GroupWorkspace,
} from "./types";

/**
 * 讨论会话（用于知识沉淀）
 */
interface DiscussionSession {
  sessionId: string;
  groupId: string;
  messages: Message[];
  participants: Set<string>;
  startTime: number;
  lastMessageTime: number;
  keywords: Set<string>;
}

/**
 * 知识沉淀系统（单例）
 */
export class KnowledgeSedimentationSystem {
  private static instance: KnowledgeSedimentationSystem;
  private config: KnowledgeSedimentationConfig;
  private sessions: Map<string, DiscussionSession> = new Map();

  private constructor() {
    // 默认配置
    this.config = {
      enabled: true,
      triggers: {
        keywords: [
          "决定",
          "决策",
          "方案",
          "架构",
          "设计",
          "计划",
          "规范",
          "decision",
          "architecture",
          "design",
          "plan",
          "spec",
        ],
        minMessages: 10,
        minParticipants: 2,
      },
      autoClassification: {
        decisionKeywords: ["决定", "决策", "方案", "decision"],
        meetingKeywords: ["会议", "讨论", "总结", "meeting", "discussion"],
        adrKeywords: ["架构", "设计", "技术选型", "architecture", "design", "technical"],
      },
    };
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): KnowledgeSedimentationSystem {
    if (!KnowledgeSedimentationSystem.instance) {
      KnowledgeSedimentationSystem.instance = new KnowledgeSedimentationSystem();
    }
    return KnowledgeSedimentationSystem.instance;
  }

  /**
   * 设置配置
   */
  public setConfig(config: Partial<KnowledgeSedimentationConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      triggers: {
        ...this.config.triggers,
        ...config.triggers,
      },
      autoClassification: {
        ...this.config.autoClassification,
        ...config.autoClassification,
      },
    };
  }

  /**
   * 获取配置
   */
  public getConfig(): KnowledgeSedimentationConfig {
    return { ...this.config };
  }

  /**
   * 添加消息到讨论会话
   * @param sessionId 会话ID
   * @param groupId 群组ID
   * @param message 消息
   * @returns 是否触发知识沉淀
   */
  public addMessage(
    sessionId: string,
    groupId: string,
    message: Message,
  ): KnowledgeSedimentationResult | null {
    if (!this.config.enabled) {
      return null;
    }

    // 获取或创建会话
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        groupId,
        messages: [],
        participants: new Set(),
        startTime: message.timestamp,
        lastMessageTime: message.timestamp,
        keywords: new Set(),
      };
      this.sessions.set(sessionId, session);
    }

    // 添加消息
    session.messages.push(message);
    session.participants.add(message.senderId);
    session.lastMessageTime = message.timestamp;

    // 提取关键词
    this.extractKeywords(message, session);

    // 检查是否应该触发知识沉淀
    if (this.shouldTriggerSedimentation(session)) {
      return this.sedimentKnowledge(session);
    }

    return null;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(message: Message, session: DiscussionSession): void {
    const content = message.content.toLowerCase();
    const keywords = this.config.triggers.keywords || [];

    for (const keyword of keywords) {
      if (content.includes(keyword.toLowerCase())) {
        session.keywords.add(keyword);
      }
    }

    // 添加消息元数据中的关键词
    if (message.metadata?.keywords) {
      message.metadata.keywords.forEach((kw) => session.keywords.add(kw));
    }
  }

  /**
   * 判断是否应该触发知识沉淀
   */
  private shouldTriggerSedimentation(session: DiscussionSession): boolean {
    const { minMessages, minParticipants, keywords } = this.config.triggers;

    // 检查消息数量
    if (minMessages && session.messages.length < minMessages) {
      return false;
    }

    // 检查参与人数
    if (minParticipants && session.participants.size < minParticipants) {
      return false;
    }

    // 检查关键词
    if (keywords && keywords.length > 0) {
      if (session.keywords.size === 0) {
        return false;
      }
    }

    // 检查时间间隔（如果超过30分钟没有新消息，认为讨论结束）
    const now = Date.now();
    const timeSinceLastMessage = now - session.lastMessageTime;
    if (timeSinceLastMessage < 30 * 60 * 1000) {
      return false;
    }

    return true;
  }

  /**
   * 沉淀知识
   */
  private sedimentKnowledge(session: DiscussionSession): KnowledgeSedimentationResult {
    // 自动分类
    const category = this.classifyKnowledge(session);

    // 生成文档标题
    const title = this.generateTitle(session, category);

    // 生成文档内容
    const content = this.generateContent(session, category, title);

    // 保存文档
    const documentPath = this.saveDocument(session.groupId, category, title, content);

    // 清理会话
    this.sessions.delete(session.sessionId);

    return {
      documentPath,
      category,
      title,
      participants: Array.from(session.participants),
      messageCount: session.messages.length,
      createdAt: Date.now(),
    };
  }

  /**
   * 自动分类知识
   */
  private classifyKnowledge(session: DiscussionSession): KnowledgeCategory {
    const keywords = Array.from(session.keywords);
    const content = session.messages.map((m) => m.content.toLowerCase()).join(" ");

    const { decisionKeywords, meetingKeywords, adrKeywords } = this.config.autoClassification || {};

    // 检查 ADR 关键词
    if (adrKeywords) {
      for (const keyword of adrKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          return "adr";
        }
      }
    }

    // 检查决策关键词
    if (decisionKeywords) {
      for (const keyword of decisionKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          return "decision";
        }
      }
    }

    // 检查会议关键词
    if (meetingKeywords) {
      for (const keyword of meetingKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          return "meeting-notes";
        }
      }
    }

    // 默认分类为共享文档
    return "shared-doc";
  }

  /**
   * 生成文档标题
   */
  private generateTitle(session: DiscussionSession, category: KnowledgeCategory): string {
    const date = new Date(session.startTime);
    const dateStr = date.toISOString().split("T")[0];

    // 提取主题关键词
    const topKeywords = Array.from(session.keywords).slice(0, 3).join("-");

    const categoryPrefix = {
      decision: "决策",
      "meeting-notes": "会议纪要",
      adr: "ADR",
      "shared-doc": "文档",
    }[category];

    return `${categoryPrefix}-${dateStr}-${topKeywords || "discussion"}`;
  }

  /**
   * 生成文档内容
   */
  private generateContent(
    session: DiscussionSession,
    category: KnowledgeCategory,
    title: string,
  ): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${title}\n`);

    // 元数据
    lines.push("## 元数据\n");
    lines.push(`- **类别**: ${category}`);
    lines.push(`- **创建时间**: ${new Date(session.startTime).toISOString()}`);
    lines.push(`- **参与者**: ${Array.from(session.participants).join(", ")}`);
    lines.push(`- **消息数量**: ${session.messages.length}`);
    lines.push(`- **关键词**: ${Array.from(session.keywords).join(", ")}\n`);

    // 摘要
    lines.push("## 摘要\n");
    lines.push(this.generateSummary(session) + "\n");

    // 讨论内容
    lines.push("## 讨论内容\n");
    for (const message of session.messages) {
      const sender = message.senderId;
      const time = new Date(message.timestamp).toLocaleTimeString();
      const importance = message.metadata?.importance || "medium";
      const importanceEmoji = importance === "high" ? "⭐" : importance === "low" ? "💬" : "📝";

      lines.push(`### ${importanceEmoji} ${sender} (${time})\n`);
      lines.push(`${message.content}\n`);
    }

    // 结论（如果是决策类）
    if (category === "decision" || category === "adr") {
      lines.push("## 决策结论\n");
      lines.push("（请补充决策结论）\n");
    }

    // 行动项
    lines.push("## 行动项\n");
    lines.push("（请补充需要执行的行动项）\n");

    return lines.join("\n");
  }

  /**
   * 生成摘要
   */
  private generateSummary(session: DiscussionSession): string {
    const participants = Array.from(session.participants);
    const keywords = Array.from(session.keywords);
    const duration = session.lastMessageTime - session.startTime;
    const durationMinutes = Math.round(duration / 60000);

    return (
      `${participants.length} 位成员进行了约 ${durationMinutes} 分钟的讨论，` +
      `共 ${session.messages.length} 条消息。` +
      `讨论涉及的主题包括: ${keywords.join(", ")}。`
    );
  }

  /**
   * 保存文档
   */
  private saveDocument(
    groupId: string,
    category: KnowledgeCategory,
    title: string,
    content: string,
  ): string {
    const workspace = groupWorkspaceManager.ensureGroupWorkspace(groupId, groupId, "system");

    // 确定保存目录
    const targetDir = this.getTargetDir(workspace, category);

    // 确保目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 生成文件名
    const fileName = `${title}.md`;
    const filePath = path.join(targetDir, fileName);

    // 保存文件
    fs.writeFileSync(filePath, content, "utf-8");

    return filePath;
  }

  /**
   * 获取目标目录
   */
  private getTargetDir(workspace: GroupWorkspace, category: KnowledgeCategory): string {
    switch (category) {
      case "decision":
        return workspace.decisionsDir;
      case "meeting-notes":
        return workspace.meetingNotesDir;
      case "adr":
        return path.join(workspace.decisionsDir, "adr");
      case "shared-doc":
      default:
        return workspace.sharedDir;
    }
  }

  /**
   * 手动沉淀知识
   * @param groupId 群组ID
   * @param messages 消息列表
   * @param category 类别（可选，自动分类）
   * @param title 标题（可选，自动生成）
   * @returns 沉淀结果
   */
  public manualSediment(
    groupId: string,
    messages: Message[],
    category?: KnowledgeCategory,
    title?: string,
  ): KnowledgeSedimentationResult {
    // 创建临时会话
    const session: DiscussionSession = {
      sessionId: `manual-${Date.now()}`,
      groupId,
      messages,
      participants: new Set(messages.map((m) => m.senderId)),
      startTime: messages[0]?.timestamp || Date.now(),
      lastMessageTime: messages[messages.length - 1]?.timestamp || Date.now(),
      keywords: new Set(),
    };

    // 提取关键词
    for (const message of messages) {
      this.extractKeywords(message, session);
    }

    // 自动分类（如果未指定）
    const finalCategory = category || this.classifyKnowledge(session);

    // 生成标题（如果未指定）
    const finalTitle = title || this.generateTitle(session, finalCategory);

    // 生成内容
    const content = this.generateContent(session, finalCategory, finalTitle);

    // 保存文档
    const documentPath = this.saveDocument(groupId, finalCategory, finalTitle, content);

    return {
      documentPath,
      category: finalCategory,
      title: finalTitle,
      participants: Array.from(session.participants),
      messageCount: session.messages.length,
      createdAt: Date.now(),
    };
  }

  /**
   * 获取知识文档列表
   * @param groupId 群组ID
   * @param category 类别（可选）
   * @returns 文档路径列表
   */
  public getKnowledgeDocuments(groupId: string, category?: KnowledgeCategory): string[] {
    const workspace = groupWorkspaceManager.ensureGroupWorkspace(groupId, groupId, "system");
    const documents: string[] = [];

    const scanDir = (dir: string): void => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (item.endsWith(".md")) {
          documents.push(fullPath);
        }
      }
    };

    if (category) {
      const targetDir = this.getTargetDir(workspace, category);
      scanDir(targetDir);
    } else {
      // 扫描所有目录
      scanDir(workspace.sharedDir);
      scanDir(workspace.decisionsDir);
      scanDir(workspace.meetingNotesDir);
    }

    return documents;
  }

  /**
   * 删除知识文档
   * @param documentPath 文档路径
   * @returns 是否成功
   */
  public deleteKnowledgeDocument(documentPath: string): boolean {
    try {
      if (fs.existsSync(documentPath)) {
        fs.unlinkSync(documentPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`删除知识文档失败: ${documentPath}`, error);
      return false;
    }
  }

  /**
   * 更新知识文档
   * @param documentPath 文档路径
   * @param content 新内容
   * @returns 是否成功
   */
  public updateKnowledgeDocument(documentPath: string, content: string): boolean {
    try {
      if (fs.existsSync(documentPath)) {
        fs.writeFileSync(documentPath, content, "utf-8");
        return true;
      }
      return false;
    } catch (error) {
      console.error(`更新知识文档失败: ${documentPath}`, error);
      return false;
    }
  }

  /**
   * 搜索知识文档
   * @param groupId 群组ID
   * @param query 搜索关键词
   * @returns 匹配的文档路径列表
   */
  public searchKnowledgeDocuments(groupId: string, query: string): string[] {
    const allDocuments = this.getKnowledgeDocuments(groupId);
    const matchedDocuments: string[] = [];
    const lowerQuery = query.toLowerCase();

    for (const docPath of allDocuments) {
      try {
        const content = fs.readFileSync(docPath, "utf-8");
        const lowerContent = content.toLowerCase();
        const fileName = path.basename(docPath).toLowerCase();

        if (lowerContent.includes(lowerQuery) || fileName.includes(lowerQuery)) {
          matchedDocuments.push(docPath);
        }
      } catch (error) {
        console.error(`读取文档失败: ${docPath}`, error);
      }
    }

    return matchedDocuments;
  }

  /**
   * 获取会话统计信息
   * @param sessionId 会话ID
   * @returns 统计信息
   */
  public getSessionStats(sessionId: string): {
    messageCount: number;
    participantCount: number;
    keywordCount: number;
    duration: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      messageCount: session.messages.length,
      participantCount: session.participants.size,
      keywordCount: session.keywords.size,
      duration: session.lastMessageTime - session.startTime,
    };
  }

  /**
   * 清理会话
   * @param sessionId 会话ID
   */
  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * 清理所有会话
   */
  public clearAllSessions(): void {
    this.sessions.clear();
  }
}

/**
 * 导出单例实例
 */
export const knowledgeSedimentation = KnowledgeSedimentationSystem.getInstance();
