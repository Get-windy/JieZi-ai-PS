/**
 * Phase 5: 任务与会议系统 - 类型定义
 * 
 * 定义任务协作、会议管理等核心类型
 * P2.1: 任务协作系统数据模型
 */

import type { MemberType } from "../organization/types.js";

// ============================================================================
// 任务系统类型定义
// ============================================================================

/**
 * 任务状态
 */
export type TaskStatus = "todo" | "in-progress" | "review" | "blocked" | "done" | "cancelled";

/**
 * 任务优先级
 */
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/**
 * 任务类型
 */
export type TaskType = "feature" | "bugfix" | "research" | "documentation" | "meeting" | "other";

/**
 * 任务协作者
 */
export interface TaskAssignee {
  id: string; // 执行者ID（人类或助手）
  type: MemberType; // 执行者类型
  role: "owner" | "assignee" | "reviewer" | "observer"; // 在任务中的角色
  assignedAt: number; // 分配时间
  assignedBy: string; // 分配者ID
}

/**
 * 任务评论
 */
export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string; // 评论者ID
  authorType: MemberType; // 评论者类型
  content: string; // 评论内容
  attachments?: string[]; // 附件
  replyToCommentId?: string; // 回复的评论ID
  createdAt: number;
  updatedAt?: number;
}

/**
 * 任务附件
 */
export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number; // 字节
  fileType: string; // MIME type
  fileUrl: string; // 文件路径或URL
  uploadedBy: string; // 上传者ID
  uploadedAt: number;
}

/**
 * 智能助手工作日志
 */
export interface AgentWorkLog {
  id: string;
  taskId: string;
  agentId: string;
  action: string; // 操作类型：started, paused, resumed, blocked, completed等
  details: string; // 详细说明
  duration?: number; // 操作持续时间（毫秒）
  result?: "success" | "failure" | "partial"; // 操作结果
  errorMessage?: string; // 错误信息（如果失败）
  metadata?: Record<string, any>; // 额外元数据
  createdAt: number;
}

/**
 * 任务依赖关系
 */
export interface TaskDependency {
  id: string;
  taskId: string; // 当前任务ID
  dependsOnTaskId: string; // 依赖的任务ID
  dependencyType: "blocks" | "is-blocked-by" | "relates-to" | "duplicates"; // 依赖类型
  description?: string; // 依赖关系说明
  createdAt: number;
  createdBy: string;
}

/**
 * 任务时间追踪
 */
export interface TaskTimeTracking {
  estimatedHours?: number; // 预估工时
  actualHours?: number; // 实际工时
  startedAt?: number; // 开始时间
  completedAt?: number; // 完成时间
  lastActivityAt?: number; // 最后活动时间
  timeSpent: number; // 已花费时间（毫秒）
}

/**
 * 任务（完整定义）
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  
  // 创建者信息
  creatorId: string; // 创建者ID
  creatorType: MemberType; // 创建者类型
  
  // 分配信息
  assignees: TaskAssignee[]; // 执行者列表（支持人类和智能助手）
  
  // 任务属性
  status: TaskStatus;
  priority: TaskPriority;
  type?: TaskType;
  
  // 组织归属
  organizationId?: string; // 所属组织
  teamId?: string; // 所属团队ID
  projectId?: string; // 所属项目ID
  
  // 任务关系
  parentTaskId?: string; // 父任务ID（用于子任务）
  dependencies?: string[]; // 依赖的任务ID列表
  blockedBy?: string[]; // 阻塞此任务的任务ID列表
  subtasks?: string[]; // 子任务ID列表
  
  // 时间管理
  dueDate?: number; // 截止时间
  timeTracking: TaskTimeTracking; // 时间追踪
  
  // 协作内容
  comments?: TaskComment[]; // 评论列表
  attachments?: TaskAttachment[]; // 附件列表
  workLogs?: AgentWorkLog[]; // 智能助手工作日志
  
  // 标签与分类
  tags?: string[]; // 标签
  labels?: string[]; // 标签（颜色编码）
  
  // 元数据
  createdAt: number;
  updatedAt?: number;
  completedAt?: number; // 完成时间
  cancelledAt?: number; // 取消时间
  cancelReason?: string; // 取消原因
}

/**
 * 任务看板列
 */
export interface KanbanColumn {
  id: string;
  title: string;
  status: TaskStatus; // 对应的任务状态
  order: number; // 显示顺序
  limit?: number; // WIP限制（Work In Progress）
  color?: string; // 列颜色
}

/**
 * 任务看板
 */
export interface TaskKanban {
  id: string;
  name: string;
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  columns: KanbanColumn[]; // 看板列定义
  taskIds: string[]; // 任务ID列表
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
}

/**
 * 任务筛选条件
 */
export interface TaskFilter {
  assigneeId?: string; // 执行者ID
  assigneeType?: MemberType; // 执行者类型
  creatorId?: string; // 创建者ID
  status?: TaskStatus | TaskStatus[]; // 状态
  priority?: TaskPriority | TaskPriority[]; // 优先级
  type?: TaskType | TaskType[]; // 类型
  organizationId?: string; // 组织ID
  teamId?: string; // 团队ID
  projectId?: string; // 项目ID
  tags?: string[]; // 标签
  dueDateBefore?: number; // 截止日期之前
  dueDateAfter?: number; // 截止日期之后
  keyword?: string; // 关键词搜索
}

/**
 * 任务统计信息
 */
export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdue: number; // 逾期任务数
  completedThisWeek: number;
  completedThisMonth: number;
  averageCompletionTime?: number; // 平均完成时间（小时）
}

// ============================================================================
// 会议系统类型定义
// ============================================================================

/**
 * 会议类型
 */
export type MeetingType = "standup" | "review" | "planning" | "brainstorm" | "decision" | "other";

/**
 * 会议状态
 */
export type MeetingStatus = "scheduled" | "in-progress" | "completed" | "cancelled";

/**
 * 参会者响应状态
 */
export type MeetingResponse = "accepted" | "declined" | "tentative" | "no-response";

/**
 * 会议参会者
 */
export interface MeetingParticipant {
  id: string; // 参会者ID
  type: MemberType; // 参会者类型
  role: "organizer" | "presenter" | "attendee" | "optional"; // 会议中的角色
  response: MeetingResponse; // 响应状态
  respondedAt?: number; // 响应时间
  specialRole?: "facilitator" | "notesTaker" | "timekeeper" | "analyst"; // 智能助手特殊角色
}

/**
 * 会议议程项
 */
export interface MeetingAgendaItem {
  id: string;
  topic: string; // 议题
  description?: string; // 议题描述
  duration: number; // 预计时长（分钟）
  presenter?: string; // 主讲人ID
  status: "pending" | "in-progress" | "completed" | "skipped"; // 议题状态
  startedAt?: number; // 开始时间
  completedAt?: number; // 完成时间
  notes?: string; // 议题笔记
  decisions?: string[]; // 此议题的决策
  actionItems?: string[]; // 此议题的行动项ID
}

/**
 * 会议决策
 */
export interface MeetingDecision {
  id: string;
  meetingId: string;
  content: string; // 决策内容
  proposedBy: string; // 提议人ID
  approvedBy?: string[]; // 批准人ID列表
  agendaItemId?: string; // 关联的议程项ID
  impact?: "high" | "medium" | "low"; // 影响程度
  createdAt: number;
}

/**
 * 会议行动项
 */
export interface MeetingActionItem {
  id: string;
  meetingId: string;
  description: string; // 行动项描述
  assigneeId: string; // 负责人ID
  assigneeType: MemberType;
  dueDate?: number; // 截止时间
  priority: TaskPriority;
  status: "pending" | "in-progress" | "completed";
  relatedTaskId?: string; // 转换为任务后的任务ID
  agendaItemId?: string; // 关联的议程项ID
  createdAt: number;
  completedAt?: number;
}

/**
 * 会议消息
 */
export interface MeetingMessage {
  id: string;
  meetingId: string;
  senderId: string; // 发送者ID
  senderType: MemberType;
  content: string;
  messageType: "text" | "decision" | "action-item" | "poll" | "file";
  replyToMessageId?: string; // 回复的消息ID
  attachments?: string[];
  reactions?: Record<string, string[]>; // 表情回应 {emoji: [userId]}
  createdAt: number;
}

/**
 * 会议（完整定义）
 */
export interface Meeting {
  id: string;
  title: string;
  description?: string;
  
  // 组织者信息
  organizerId: string; // 组织者ID
  organizerType: MemberType;
  
  // 参会者
  participants: MeetingParticipant[]; // 参会者列表
  
  // 会议属性
  type: MeetingType;
  status: MeetingStatus;
  
  // 时间安排
  scheduledAt: number; // 计划开始时间
  duration: number; // 预计时长（分钟）
  startedAt?: number; // 实际开始时间
  endedAt?: number; // 实际结束时间
  
  // 组织归属
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  
  // 议程
  agenda: MeetingAgendaItem[]; // 议程列表
  currentAgendaIndex?: number; // 当前进行的议程索引
  
  // 会议记录
  transcript?: string; // 会议记录/对话记录
  notes?: string; // 会议笔记
  decisions: MeetingDecision[]; // 决策列表
  actionItems: MeetingActionItem[]; // 行动项列表
  
  // 会议消息
  messages?: MeetingMessage[]; // 会议中的消息
  
  // 会议资源
  meetingRoomUrl?: string; // 会议室链接
  recordingUrl?: string; // 录制链接
  attachments?: string[]; // 附件
  
  // 重复会议
  isRecurring?: boolean; // 是否为重复会议
  recurrenceRule?: string; // 重复规则（如：每周一 10:00）
  parentMeetingId?: string; // 如果是重复会议，指向系列会议的ID
  
  // 元数据
  createdAt: number;
  updatedAt?: number;
  cancelledAt?: number;
  cancelReason?: string;
}

/**
 * 会议纪要
 */
export interface MeetingSummary {
  meetingId: string;
  title: string;
  date: number; // 会议日期
  duration: number; // 实际时长（分钟）
  
  // 参会者信息
  attendees: Array<{
    id: string;
    type: MemberType;
    attended: boolean; // 是否实际参加
  }>;
  
  // 内容摘要
  summary: string; // AI生成的会议摘要
  keyPoints: string[]; // 关键要点
  
  // 议程回顾
  agendaReview: Array<{
    topic: string;
    completed: boolean;
    notes?: string;
  }>;
  
  // 决策与行动
  decisions: MeetingDecision[]; // 会议决策
  actionItems: MeetingActionItem[]; // 行动项
  
  // 下次会议
  nextMeeting?: {
    scheduledAt: number;
    topics: string[];
  };
  
  // 生成信息
  generatedAt: number;
  generatedBy?: string; // 生成者ID（通常是智能助手）
}

/**
 * 会议筛选条件
 */
export interface MeetingFilter {
  organizerId?: string;
  participantId?: string; // 参会者ID
  status?: MeetingStatus | MeetingStatus[];
  type?: MeetingType | MeetingType[];
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  scheduledAfter?: number; // 计划开始时间之后
  scheduledBefore?: number; // 计划开始时间之前
  keyword?: string; // 关键词搜索
}

/**
 * 会议统计信息
 */
export interface MeetingStats {
  total: number;
  byStatus: Record<MeetingStatus, number>;
  byType: Record<MeetingType, number>;
  upcomingThisWeek: number;
  completedThisWeek: number;
  averageDuration?: number; // 平均时长（分钟）
  averageParticipants?: number; // 平均参会人数
  totalDecisions: number;
  totalActionItems: number;
}

// ============================================================================
// RPC 请求/响应类型
// ============================================================================

/**
 * 创建任务请求
 */
export interface CreateTaskRequest {
  title: string;
  description: string;
  assigneeIds?: string[]; // 执行者ID列表
  priority?: TaskPriority;
  type?: TaskType;
  dueDate?: number;
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  parentTaskId?: string;
  tags?: string[];
}

/**
 * 更新任务请求
 */
export interface UpdateTaskRequest {
  taskId: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: number;
  tags?: string[];
}

/**
 * 创建会议请求
 */
export interface CreateMeetingRequest {
  title: string;
  description?: string;
  participantIds: string[]; // 参会者ID列表
  type: MeetingType;
  scheduledAt: number;
  duration: number;
  agenda: Array<{
    topic: string;
    description?: string;
    duration: number;
    presenter?: string;
  }>;
  organizationId?: string;
  teamId?: string;
  projectId?: string;
}

/**
 * 更新会议请求
 */
export interface UpdateMeetingRequest {
  meetingId: string;
  title?: string;
  description?: string;
  scheduledAt?: number;
  duration?: number;
  agenda?: MeetingAgendaItem[];
}
