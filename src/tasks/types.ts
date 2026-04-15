/**
 * 任务与会议系统 - 类型定义（唯一数据源）
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  SINGLE SOURCE OF TRUTH — 任务系统唯一类型定义文件          ║
 * ║                                                              ║
 * ║  本系统只维护一套 Task 类型，请勿在其他文件中重新定义        ║
 * ║  ProjectTask / Sprint 任务 全部使用本文件的 Task 接口        ║
 * ║                                                              ║
 * ║  历史说明：原 utils/project-context.ts 中存在独立的          ║
 * ║  ProjectTask 接口（状态用下划线：in_progress/in_review），   ║
 * ║  已于统一重构时废弃并移除，所有引用已迁移至此。              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 定义任务协作、会议管理等核心类型
 */

import type { MemberType } from "../organization/types.js";

// ============================================================================
// 任务系统类型定义
// ============================================================================

/**
 * 任务状态
 *
 * backlog     = 已记录但尚未排入 Sprint（Backlog 池）
 * todo        = 已排入 Sprint，待开始
 * in-progress = 执行中（注意：连字符，不是下划线）
 * review      = 待评审
 * blocked     = 被阻塞
 * done        = 已完成（终态）
 * cancelled   = 已取消（终态）
 *
 * 注意：历史 ProjectTask 使用 "in_progress" / "in_review"（下划线），
 * 统一后一律使用连字符形式，读取旧数据时通过 normalizeTaskStatus() 自动转换。
 */
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "review"
  | "blocked"
  | "done"
  | "cancelled";

/**
 * 任务优先级
 * none = 未分配优先级（规划层 Backlog 任务常用）
 */
export type TaskPriority = "low" | "medium" | "high" | "urgent" | "none";

/**
 * 将旧版 ProjectTask 的下划线状态标识符统一转换为当前连字符形式。
 * 读取 PROJECT_CONFIG.json 中的历史 Sprint 任务数据时调用此函数。
 *
 * 映射关系：
 *   in_progress → in-progress
 *   in_review   → review
 *   backlog     → backlog（保持不变）
 *   其余值      → 原样返回（已是正确格式）
 */
export function normalizeTaskStatus(raw: string): TaskStatus {
  const map: Record<string, TaskStatus> = {
    in_progress: "in-progress",
    in_review: "review",
  };
  return map[raw] ?? raw;
}

/**
 * 任务层次（借鉴 SAFe / Linear / Jira 工作层次）
 *
 * Initiative → Epic → Feature → Story → Task
 *
 * 层级约束：
 * - epic:    跨多个 Sprint 的大价値块，必须关联 projectId
 * - feature: 属于 Epic 的功能块，必须关联 epicId
 * - story:   用户故事，属于 Feature，必须关联 featureId
 * - task:    技术实现单元，可属于 story / feature / epic / 独立
 * - initiative: 战略主题级（跨多个项目的顶层工作项，对标 Linear Initiatives / SAFe Portfolio Epic）
 */
export type WorkItemLevel = "epic" | "feature" | "story" | "task" | "initiative";

/**
 * 任务类型
 */
export type TaskType =
  | "epic" // 巧屙上线的大块工作（跨周期）
  | "feature" // 用户可感知的功能模块
  | "story" // 用户故事（一个 feature 内的可交付单元）
  | "bugfix" // 缺陷修复
  | "research" // 技术调研 / Spike
  | "documentation" // 文档编写
  | "meeting" // 会议
  | "other"; // 其他

/**
 * 任务作用域
 * - personal: 私人任务（个人待办、学习、个人事项），结果写入 agent 私有记忆，不需要 projectId
 * - project:  项目任务（团队协作、有项目归属），必须携带 projectId，结果写入项目共享记忆
 */
export type TaskScope = "personal" | "project";

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
  metadata?: Record<string, unknown>; // 额外元数据
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
 * 验收标准条目（借鉴 Ralph 的 acceptanceCriteria 实践）
 *
 * 每条验收标准是一个可独立检查的条件，只有所有标准都通过，任务才能标记为 done。
 * 这是防止 AI Agent "敷衍式完成" 的核心机制：必须逐条验证，而非自行宣布完成。
 *
 * 示例：
 * - "typecheck 通过（tsc --noEmit 无错误）"
 * - "单元测试全部通过"
 * - "在浏览器中验证 UI 功能正常"
 * - "API 返回正确的 HTTP 状态码 200"
 */
export interface AcceptanceCriterion {
  /** 唯一 ID（用于逐条追踪） */
  id: string;
  /** 验收条件描述（明确、可验证） */
  description: string;
  /** 是否已通过（false = 待验证，true = 已验证通过） */
  passes: boolean;
  /** 验证时间 */
  verifiedAt?: number;
  /** 验证人 ID（人类或 Agent） */
  verifiedBy?: string;
  /** 验证备注（失败原因 / 通过说明） */
  note?: string;
}

/**
 * 进展笔记（append-only，借鉴 Ralph 的 progress.txt 机制）
 *
 * 每次迭代/工作会话结束后追加一条记录，沉淀上下文和学习内容。
 * 这些笔记是跨会话的知识传递媒介，让后续 Agent 实例和人类开发者
 * 都能快速理解任务历史和已发现的模式/陷阱。
 *
 * 对应 Ralph 的 progress.txt "append-only learnings" 设计。
 * 内容格式：Markdown（支持标题、列表、代码块）。
 *
 * 冗余控制：超过 MAX_PROGRESS_NOTES 上限时，最早的旧笔记会被压缩为
 * 一条 compacted=true 的摘要笔记，保留知识精华而非原始全文。
 */
export interface TaskProgressNote {
  /** 唯一 ID */
  id: string;
  /** 笔记内容（Markdown 格式：已完成的工作 + 学到的经验 + 下步建议） */
  content: string;
  /** 记录者 ID */
  authorId: string;
  /** 记录者类型 */
  authorType: MemberType;
  /** 创建时间 */
  createdAt: number;
  /**
   * 是否为压缩摘要（由系统自动生成，非原始笔记）
   * true 时表示此条是多条旧笔记被合并压缩后的摘要。
   * 消费方（如 prompt 注入）应优先展示 compacted=true 的摘要 + 最近几条原始笔记。
   */
  compacted?: boolean;
  /** 此摘要压缩了多少条原始笔记（compacted=true 时有效） */
  compactedFrom?: number;
}

/**
 * 任务（完整定义）
 */
export interface Task {
  id: string;
  title: string;
  description: string;

  /**
   * 验收标准列表（借鉴 Ralph acceptanceCriteria 实践）
   *
   * 每条是独立可检查的条件。任务标记为 done 前必须逐条验证。
   * Agent 完成任务时须对每条 criterion 填写 passes=true 并附上 verifiedBy。
   * 人类在 review 阶段可补充或驳回验收结果。
   */
  acceptanceCriteria?: AcceptanceCriterion[];

  /**
   * 进展笔记（append-only，对应 Ralph 的 progress.txt）
   *
   * 每次工作会话结束后追加，记录已完成的事项、发现的模式和坑、
   * 以及下一步建议。跨迭代/跨 Agent 实例传递上下文。
   */
  progressNotes?: TaskProgressNote[];

  // 创建者信息
  creatorId: string; // 创建者ID
  creatorType: MemberType; // 创建者类型

  // 分配信息
  assignees: TaskAssignee[]; // 执行者列表（支持人类和智能助手）
  supervisorId?: string; // 上级管理者ID（coordinator/parent agent）—— 可以读写此任务的工作日志，但不参与执行

  // 流程属性
  status: TaskStatus;
  priority: TaskPriority;
  weight?: number; // 任务权重，默认 0，越大越优先（同优先级内细分排序）
  type?: TaskType;
  /**
   * 工作层次（对应 WorkItemLevel）
   * 层次约束：
   * - epic    必须关联 projectId
   * - feature 必须关联 epicId
   * - story   必须关联 featureId
   * - task    可独立、可属下任意上级
   */
  level?: WorkItemLevel;
  /**
   * 所属 Epic ID（level=feature 或 level=story 时填写）
   */
  epicId?: string;
  /**
   * 所属 Feature ID（level=story 时填写）
   */
  featureId?: string;
  /**
   * 任务作用域（默认 project）
   * - personal: 私人任务，不需要 projectId，结果写入 agent 私有记忆
   * - project:  项目任务，必须携带 projectId，结果写入项目共享记忆
   */
  scope?: TaskScope;

  // 组织归属
  organizationId?: string; // 所属组织
  teamId?: string; // 所属团队ID
  projectId?: string; // 所属项目ID

  // 任务关系
  parentTaskId?: string; // 父任务ID（用于子任务）
  dependencies?: string[]; // 依赖的任务ID列表
  blockedBy?: string[]; // 阻塞此任务的任务ID列表
  subtasks?: string[]; // 子任务ID列表

  /**
   * Story Point 估算（Fibonacci: 1,2,3,5,8,13）
   * Sprint 进度计算（calcSprintProgress）依赖此字段，缺失时按 1 计算。
   */
  storyPoints?: number;

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

  // OKR 对齐
  /** 关联的 OKR 目标 ID（小任务通过此字段对齐上级目标） */
  objectiveId?: string;
  /** 关联的 OKR 关键结果 ID */
  keyResultId?: string;
  /**
   * 关联的 Initiative ID（战略主题 ID）
   * level=initiative 时必填；其他层次可选填以将任务对齐到战略主题
   */
  initiativeId?: string;

  // 元数据
  createdAt: number;
  updatedAt?: number;
  completedAt?: number; // 完成时间
  cancelledAt?: number; // 取消时间
  cancelReason?: string; // 取消原因
  metadata?: Record<string, unknown>; // 扩展元数据（如 supervisorId、assignedVia 等）

  /**
   * 快捷访问：所有验收标准是否全部通过（计算属性辅助读取）
   * undefined = 无验收标准（不阻塞完成）
   * true       = 全部通过
   * false      = 仍有未通过项
   */
  readonly allCriteriaPassed?: boolean;
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
  supervisorId?: string; // 上级管理者ID（查询 coordinator 分配出去的所有任务）
  creatorId?: string; // 创建者ID
  status?: TaskStatus | TaskStatus[]; // 状态
  priority?: TaskPriority | TaskPriority[]; // 优先级
  type?: TaskType | TaskType[]; // 类型
  organizationId?: string; // 组织ID
  teamId?: string; // 团队ID
  projectId?: string; // 项目ID
  /** 层次过滤：epic/feature/story/task */
  level?: WorkItemLevel | WorkItemLevel[];
  /** 过滤特定 epic 下的所有子任务 */
  epicId?: string;
  /** 过滤特定 feature 下的所有子任务 */
  featureId?: string;
  tags?: string[]; // 标签
  dueDateBefore?: number; // 截止日期之前
  dueDateAfter?: number; // 截止日期之局
  keyword?: string; // 关键词搜索
  limit?: number; // 最多返回条数（兴趣截断，建议用 first 代替）
  /**
   * Cursor-based 分页（Linear/GitHub GraphQL 标准模式）
   * after: 上一页最后一条的 taskId，从它之后开始返回
   * first: 返回条数（与 limit 相互兼容，优先级更高）
   */
  after?: string;
  first?: number;
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
  /**
   * 验收标准（创建时可预先定义，字符串列表会自动转为 AcceptanceCriterion[]）
   * 传字符串数组时每条自动分配 id，passes 默认 false。
   */
  acceptanceCriteria?: string[] | AcceptanceCriterion[];
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
  /** 追加或更新验收标准 */
  acceptanceCriteria?: AcceptanceCriterion[];
}

/**
 * 验收标准操作请求（逐条更新通过状态）
 */
export interface UpdateCriterionRequest {
  taskId: string;
  criterionId: string;
  passes: boolean;
  verifiedBy: string;
  note?: string;
}

/**
 * 追加进展笔记请求
 */
export interface AppendProgressNoteRequest {
  taskId: string;
  content: string;
  authorId: string;
  authorType: MemberType;
  /**
   * 项目工作空间目录（可选）
   *
   * 提供时，笔记会同步镜像写入 `{workspaceDir}/.notes/{hierarchy}/{taskId}.md`。
   * 这让人类和 AI 都能直接 `cat` 读取，无需查询数据库。
   * SQLite 仍是权威数据源，文件是只读镜像。
   *
   * 对应项目上下文：buildProjectContext(projectId).workspacePath
   */
  workspaceDir?: string;
  /** 任务标题（写入文件头部，方便人类阅读，无需再查 DB） */
  taskTitle?: string;
  /**
   * 任务层次信息（可选）
   *
   * 提供时，文件镜像按任务树结构存放：
   *   .notes/{epicId}/{featureId}/{parentId}/{taskId}.md
   *
   * 不提供则回退到扁平目录（向后兼容）。
   * 字段直接使用 Task 对象的同名字段：
   *   { epicId: task.epicId, featureId: task.featureId,
   *     parentTaskId: task.parentTaskId, level: task.level }
   */
  hierarchy?: {
    epicId?: string;
    featureId?: string;
    parentTaskId?: string;
    level?: string;
  };
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
