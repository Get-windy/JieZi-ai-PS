/**
 * 知识沉淀自动触发器
 *
 * 功能：
 * - 监听会话事件，自动触发知识沉淀
 * - 会议纪要自动生成
 * - 决策记录(ADR)自动生成
 * - 最佳实践自动提取
 */

import type { GroupWorkspace } from "./group-workspace.js";

/**
 * 知识沉淀触发条件
 */
export interface KnowledgeSinkTrigger {
  /** 触发类型 */
  type: "meeting_end" | "decision_made" | "problem_solved" | "manual";

  /** 最小消息数量 */
  minMessageCount?: number;

  /** 最小时长（秒） */
  minDuration?: number;

  /** 关键词（包含这些关键词时触发） */
  keywords?: string[];

  /** 是否自动生成 */
  autoGenerate?: boolean;
}

/**
 * 会话上下文
 */
export interface SessionContext {
  /** 会话ID */
  sessionId: string;

  /** 会话类型 */
  type: "group" | "private" | "agent2agent";

  /** 参与者 */
  participants: Array<{
    id: string;
    name: string;
    role?: string;
  }>;

  /** 开始时间 */
  startTime: number;

  /** 结束时间 */
  endTime?: number;

  /** 消息列表 */
  messages: Array<{
    id: string;
    senderId: string;
    content: string;
    timestamp: number;
    type: "text" | "image" | "file" | "code";
  }>;

  /** 元数据 */
  metadata?: {
    topic?: string;
    tags?: string[];
    importance?: "low" | "normal" | "high" | "critical";
  };
}

/**
 * 会议纪要
 */
export interface MeetingNotes {
  /** 会议ID */
  meetingId: string;

  /** 会议标题 */
  title: string;

  /** 日期 */
  date: string;

  /** 参与者 */
  participants: string[];

  /** 会议摘要 */
  summary: string;

  /** 讨论要点 */
  keyPoints: string[];

  /** 决策事项 */
  decisions: Array<{
    title: string;
    description: string;
    owner: string;
    deadline?: string;
  }>;

  /** 行动项 */
  actionItems: Array<{
    title: string;
    assignee: string;
    dueDate?: string;
    status: "pending" | "in_progress" | "done";
  }>;

  /** 相关资源 */
  resources?: Array<{
    type: "link" | "file" | "code";
    url: string;
    title: string;
  }>;
}

/**
 * 架构决策记录 (Architecture Decision Record)
 */
export interface ADR {
  /** ADR ID */
  id: string;

  /** 标题 */
  title: string;

  /** 日期 */
  date: string;

  /** 状态 */
  status: "proposed" | "accepted" | "deprecated" | "superseded";

  /** 背景 */
  context: string;

  /** 决策 */
  decision: string;

  /** 理由 */
  rationale: string;

  /** 后果 */
  consequences: {
    positive: string[];
    negative: string[];
    risks: string[];
  };

  /** 替代方案 */
  alternatives?: Array<{
    title: string;
    description: string;
    whyNotChosen: string;
  }>;

  /** 相关ADR */
  relatedADRs?: string[];
}

/**
 * 知识沉淀自动触发器
 */
export class KnowledgeAutoSink {
  private static instance: KnowledgeAutoSink;

  // 触发条件配置
  private triggers: KnowledgeSinkTrigger[] = [];

  // 会话缓存
  private sessionCache = new Map<string, SessionContext>();

  // 知识库存储
  private knowledgeBase = new Map<string, any>();

  private constructor() {
    // 默认触发条件
    this.triggers = [
      {
        type: "meeting_end",
        minMessageCount: 10,
        minDuration: 300, // 5分钟
        autoGenerate: true,
      },
      {
        type: "decision_made",
        keywords: ["决定", "决策", "采用", "选择", "方案"],
        autoGenerate: true,
      },
      {
        type: "problem_solved",
        keywords: ["解决", "完成", "修复", "实现"],
        minMessageCount: 5,
        autoGenerate: false, // 手动触发
      },
    ];
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): KnowledgeAutoSink {
    if (!KnowledgeAutoSink.instance) {
      KnowledgeAutoSink.instance = new KnowledgeAutoSink();
    }
    return KnowledgeAutoSink.instance;
  }

  /**
   * 添加触发条件
   */
  public addTrigger(trigger: KnowledgeSinkTrigger): void {
    this.triggers.push(trigger);
    console.log("[KnowledgeAutoSink] Added trigger:", trigger.type);
  }

  /**
   * 记录会话消息
   */
  public recordMessage(sessionId: string, message: SessionContext["messages"][0]): void {
    let session = this.sessionCache.get(sessionId);

    if (!session) {
      // 创建新会话
      session = {
        sessionId,
        type: "group",
        participants: [],
        startTime: Date.now(),
        messages: [],
      };
      this.sessionCache.set(sessionId, session);
    }

    session.messages.push(message);

    // 检查是否需要触发知识沉淀
    this.checkTriggers(session);
  }

  /**
   * 结束会话
   */
  public async endSession(sessionId: string): Promise<void> {
    const session = this.sessionCache.get(sessionId);

    if (!session) {
      console.warn(`[KnowledgeAutoSink] Session not found: ${sessionId}`);
      return;
    }

    session.endTime = Date.now();

    // 检查会议结束触发条件
    const meetingEndTrigger = this.triggers.find((t) => t.type === "meeting_end");

    if (meetingEndTrigger && this.shouldTrigger(session, meetingEndTrigger)) {
      console.log(
        `[KnowledgeAutoSink] Triggering meeting notes generation for session: ${sessionId}`,
      );
      await this.generateMeetingNotes(session);
    }

    // 从缓存中移除
    this.sessionCache.delete(sessionId);
  }

  /**
   * 检查触发条件
   */
  private checkTriggers(session: SessionContext): void {
    for (const trigger of this.triggers) {
      if (trigger.type === "meeting_end") continue; // 会议结束在 endSession 中处理

      if (trigger.autoGenerate && this.shouldTrigger(session, trigger)) {
        console.log(`[KnowledgeAutoSink] Trigger matched: ${trigger.type}`);

        if (trigger.type === "decision_made") {
          this.generateADR(session);
        } else if (trigger.type === "problem_solved") {
          this.generateBestPractice(session);
        }
      }
    }
  }

  /**
   * 判断是否应该触发
   */
  private shouldTrigger(session: SessionContext, trigger: KnowledgeSinkTrigger): boolean {
    // 检查消息数量
    if (trigger.minMessageCount && session.messages.length < trigger.minMessageCount) {
      return false;
    }

    // 检查时长
    if (trigger.minDuration) {
      const duration = (session.endTime || Date.now()) - session.startTime;
      if (duration < trigger.minDuration * 1000) {
        return false;
      }
    }

    // 检查关键词
    if (trigger.keywords && trigger.keywords.length > 0) {
      const hasKeyword = session.messages.some((msg) =>
        trigger.keywords!.some((keyword) => msg.content.includes(keyword)),
      );

      if (!hasKeyword) {
        return false;
      }
    }

    return true;
  }

  /**
   * 生成会议纪要
   */
  public async generateMeetingNotes(session: SessionContext): Promise<MeetingNotes> {
    console.log(`[KnowledgeAutoSink] Generating meeting notes for session: ${session.sessionId}`);

    // 这里应该调用 LLM 来生成会议纪要
    // 简化版本：提取关键信息

    const notes: MeetingNotes = {
      meetingId: session.sessionId,
      title: session.metadata?.topic || `会议 ${new Date().toISOString().split("T")[0]}`,
      date: new Date(session.startTime).toISOString(),
      participants: session.participants.map((p) => p.name),
      summary: this.extractSummary(session),
      keyPoints: this.extractKeyPoints(session),
      decisions: this.extractDecisions(session),
      actionItems: this.extractActionItems(session),
    };

    // 存储到知识库
    this.knowledgeBase.set(`meeting_${session.sessionId}`, notes);

    console.log(`[KnowledgeAutoSink] Meeting notes generated:`, {
      title: notes.title,
      keyPointsCount: notes.keyPoints.length,
      decisionsCount: notes.decisions.length,
      actionItemsCount: notes.actionItems.length,
    });

    return notes;
  }

  /**
   * 生成架构决策记录 (ADR)
   */
  public async generateADR(session: SessionContext): Promise<ADR> {
    console.log(`[KnowledgeAutoSink] Generating ADR for session: ${session.sessionId}`);

    const adr: ADR = {
      id: `ADR-${Date.now()}`,
      title: `决策：${session.metadata?.topic || "未命名"}`,
      date: new Date().toISOString().split("T")[0],
      status: "proposed",
      context: this.extractContext(session),
      decision: this.extractDecision(session),
      rationale: this.extractRationale(session),
      consequences: {
        positive: [],
        negative: [],
        risks: [],
      },
    };

    // 存储到知识库
    this.knowledgeBase.set(`adr_${adr.id}`, adr);

    console.log(`[KnowledgeAutoSink] ADR generated:`, adr.id);

    return adr;
  }

  /**
   * 生成最佳实践
   */
  private async generateBestPractice(session: SessionContext): Promise<void> {
    console.log(`[KnowledgeAutoSink] Generating best practice for session: ${session.sessionId}`);

    const practice = {
      id: `practice_${Date.now()}`,
      title: session.metadata?.topic || "最佳实践",
      description: this.extractSummary(session),
      steps: this.extractSteps(session),
      tips: this.extractTips(session),
    };

    this.knowledgeBase.set(practice.id, practice);
  }

  /**
   * 提取摘要
   */
  private extractSummary(session: SessionContext): string {
    // 简化版本：返回前几条消息的拼接
    const firstMessages = session.messages
      .slice(0, 3)
      .map((m) => m.content)
      .join(" ");
    return firstMessages.length > 200 ? firstMessages.substring(0, 200) + "..." : firstMessages;
  }

  /**
   * 提取关键要点
   */
  private extractKeyPoints(session: SessionContext): string[] {
    // 简化版本：查找包含关键词的消息
    const keywords = ["重要", "关键", "核心", "主要", "必须"];
    return session.messages
      .filter((m) => keywords.some((k) => m.content.includes(k)))
      .map((m) => m.content)
      .slice(0, 5);
  }

  /**
   * 提取决策
   */
  private extractDecisions(session: SessionContext): MeetingNotes["decisions"] {
    const decisionKeywords = ["决定", "决策", "采用", "选择"];
    return session.messages
      .filter((m) => decisionKeywords.some((k) => m.content.includes(k)))
      .map((m, idx) => ({
        title: `决策 ${idx + 1}`,
        description: m.content,
        owner: m.senderId,
      }))
      .slice(0, 5);
  }

  /**
   * 提取行动项
   */
  private extractActionItems(session: SessionContext): MeetingNotes["actionItems"] {
    const actionKeywords = ["需要", "要", "应该", "必须", "TODO"];
    return session.messages
      .filter((m) => actionKeywords.some((k) => m.content.includes(k)))
      .map((m, idx) => ({
        title: `行动项 ${idx + 1}`,
        assignee: m.senderId,
        status: "pending" as const,
      }))
      .slice(0, 5);
  }

  /**
   * 提取背景
   */
  private extractContext(session: SessionContext): string {
    return session.messages
      .slice(0, 5)
      .map((m) => m.content)
      .join("\n");
  }

  /**
   * 提取决策内容
   */
  private extractDecision(session: SessionContext): string {
    const decisionMessages = session.messages.filter((m) =>
      ["决定", "决策", "采用"].some((k) => m.content.includes(k)),
    );

    return decisionMessages.length > 0 ? decisionMessages[0].content : "待补充";
  }

  /**
   * 提取理由
   */
  private extractRationale(session: SessionContext): string {
    const rationaleMessages = session.messages.filter((m) =>
      ["因为", "由于", "基于", "理由"].some((k) => m.content.includes(k)),
    );

    return rationaleMessages.length > 0 ? rationaleMessages[0].content : "待补充";
  }

  /**
   * 提取步骤
   */
  private extractSteps(session: SessionContext): string[] {
    const stepMessages = session.messages.filter((m) =>
      /第?\s*[一二三四五六七八九十\d]+\s*[步、.]/.test(m.content),
    );

    return stepMessages.map((m) => m.content).slice(0, 10);
  }

  /**
   * 提取提示
   */
  private extractTips(session: SessionContext): string[] {
    const tipMessages = session.messages.filter((m) =>
      ["注意", "提示", "建议", "推荐"].some((k) => m.content.includes(k)),
    );

    return tipMessages.map((m) => m.content).slice(0, 5);
  }

  /**
   * 获取知识库项
   */
  public getKnowledge(id: string): any {
    return this.knowledgeBase.get(id);
  }

  /**
   * 列出所有知识
   */
  public listKnowledge(type?: "meeting" | "adr" | "practice"): Array<{ id: string; data: any }> {
    const result: Array<{ id: string; data: any }> = [];

    for (const [id, data] of this.knowledgeBase.entries()) {
      if (!type || id.startsWith(type)) {
        result.push({ id, data });
      }
    }

    return result;
  }

  /**
   * 获取统计信息
   */
  public getStatistics(): {
    totalSessions: number;
    totalKnowledge: number;
    meetingNotesCount: number;
    adrCount: number;
    practiceCount: number;
  } {
    let meetingNotesCount = 0;
    let adrCount = 0;
    let practiceCount = 0;

    for (const id of this.knowledgeBase.keys()) {
      if (id.startsWith("meeting_")) meetingNotesCount++;
      else if (id.startsWith("adr_")) adrCount++;
      else if (id.startsWith("practice_")) practiceCount++;
    }

    return {
      totalSessions: this.sessionCache.size,
      totalKnowledge: this.knowledgeBase.size,
      meetingNotesCount,
      adrCount,
      practiceCount,
    };
  }
}

/**
 * 全局实例
 */
export const knowledgeAutoSink = KnowledgeAutoSink.getInstance();
