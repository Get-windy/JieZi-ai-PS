/**
 * 任务系统存储层
 *
 * 提供任务、会议数据的持久化存储功能
 * 使用JSON文件存储（未来可扩展到数据库）
 */

import { join } from "node:path";
import { STATE_DIR } from "../../upstream/src/config/paths.js";
import {
  readJsonFile,
  writeJsonAtomic,
  createAsyncLock,
} from "../../upstream/src/infra/json-files.js";
import type {
  Task,
  TaskFilter,
  TaskStats,
  Meeting,
  MeetingFilter,
  MeetingStats,
  TaskComment,
  TaskAttachment,
  AgentWorkLog,
  TaskDependency,
  MeetingMessage,
  MeetingDecision,
  MeetingActionItem,
  TaskStatus,
  TaskPriority,
  MeetingStatus,
  MeetingType,
} from "./types.js";

// 数据存储目录和文件路径
const TASKS_DIR = join(STATE_DIR, "tasks");
const TASKS_FILE = join(TASKS_DIR, "tasks.json");
const MEETINGS_FILE = join(TASKS_DIR, "meetings.json");
const COMMENTS_FILE = join(TASKS_DIR, "comments.json");
const ATTACHMENTS_FILE = join(TASKS_DIR, "attachments.json");
const WORKLOGS_FILE = join(TASKS_DIR, "worklogs.json");
const DEPENDENCIES_FILE = join(TASKS_DIR, "dependencies.json");
const MEETING_MESSAGES_FILE = join(TASKS_DIR, "meeting-messages.json");

// 异步锁
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _lock = createAsyncLock();

// 内存缓存
let tasksCache: Map<string, Task> | null = null;
let meetingsCache: Map<string, Meeting> | null = null;
let commentsCache: Map<string, TaskComment[]> | null = null;
let attachmentsCache: Map<string, TaskAttachment[]> | null = null;
let worklogsCache: Map<string, AgentWorkLog[]> | null = null;
let dependenciesCache: Map<string, TaskDependency[]> | null = null;
let meetingMessagesCache: Map<string, MeetingMessage[]> | null = null;

/**
 * 从文件加载数据
 */
async function loadFromFile<T>(filePath: string): Promise<Map<string, T>> {
  const data = await readJsonFile<Record<string, T>>(filePath);
  if (!data) {
    return new Map();
  }
  return new Map(Object.entries(data));
}

/**
 * 从文件加载数组数据
 */
async function loadArrayFromFile<T>(filePath: string): Promise<Map<string, T[]>> {
  const data = await readJsonFile<Record<string, T[]>>(filePath);
  if (!data) {
    return new Map();
  }
  return new Map(Object.entries(data));
}

/**
 * 保存数据到文件
 */
async function saveToFile<T>(filePath: string, data: Map<string, T>): Promise<void> {
  const json = Object.fromEntries(data.entries());
  await writeJsonAtomic(filePath, json);
}

/**
 * 保存数组数据到文件
 */
async function saveArrayToFile<T>(filePath: string, data: Map<string, T[]>): Promise<void> {
  const json = Object.fromEntries(data.entries());
  await writeJsonAtomic(filePath, json);
}

/**
 * 加载所有任务到缓存
 */
async function loadTasks(): Promise<Map<string, Task>> {
  if (tasksCache === null) {
    tasksCache = await loadFromFile<Task>(TASKS_FILE);
  }
  return tasksCache;
}

/**
 * 加载所有会议到缓存
 */
async function loadMeetings(): Promise<Map<string, Meeting>> {
  if (meetingsCache === null) {
    meetingsCache = await loadFromFile<Meeting>(MEETINGS_FILE);
  }
  return meetingsCache;
}

/**
 * 加载评论到缓存
 */
async function loadComments(): Promise<Map<string, TaskComment[]>> {
  if (commentsCache === null) {
    commentsCache = await loadArrayFromFile<TaskComment>(COMMENTS_FILE);
  }
  return commentsCache;
}

/**
 * 加载附件到缓存
 */
async function loadAttachments(): Promise<Map<string, TaskAttachment[]>> {
  if (attachmentsCache === null) {
    attachmentsCache = await loadArrayFromFile<TaskAttachment>(ATTACHMENTS_FILE);
  }
  return attachmentsCache;
}

/**
 * 加载工作日志到缓存
 */
async function loadWorklogs(): Promise<Map<string, AgentWorkLog[]>> {
  if (worklogsCache === null) {
    worklogsCache = await loadArrayFromFile<AgentWorkLog>(WORKLOGS_FILE);
  }
  return worklogsCache;
}

/**
 * 加载依赖关系到缓存
 */
async function loadDependencies(): Promise<Map<string, TaskDependency[]>> {
  if (dependenciesCache === null) {
    dependenciesCache = await loadArrayFromFile<TaskDependency>(DEPENDENCIES_FILE);
  }
  return dependenciesCache;
}

/**
 * 加载会议消息到缓存
 */
async function loadMeetingMessages(): Promise<Map<string, MeetingMessage[]>> {
  if (meetingMessagesCache === null) {
    meetingMessagesCache = await loadArrayFromFile<MeetingMessage>(MEETING_MESSAGES_FILE);
  }
  return meetingMessagesCache;
}

// ============================================================================
// 任务 CRUD 操作
// ============================================================================

/**
 * 创建任务
 */
export async function createTask(task: Task): Promise<Task> {
  const tasks = await loadTasks();
  tasks.set(task.id, task);
  await saveToFile(TASKS_FILE, tasks);
  return task;
}

/**
 * 获取任务
 */
export async function getTask(taskId: string): Promise<Task | undefined> {
  const tasks = await loadTasks();
  return tasks.get(taskId);
}

/**
 * 更新任务
 */
export async function updateTask(
  taskId: string,
  updates: Partial<Task>,
): Promise<Task | undefined> {
  const tasks = await loadTasks();
  const task = tasks.get(taskId);

  if (!task) {
    return undefined;
  }

  const updatedTask = {
    ...task,
    ...updates,
    id: taskId, // 确保ID不被修改
    updatedAt: Date.now(),
  };

  tasks.set(taskId, updatedTask);
  await saveToFile(TASKS_FILE, tasks);
  return updatedTask;
}

/**
 * 删除任务
 */
export async function deleteTask(taskId: string): Promise<boolean> {
  const tasks = await loadTasks();
  const deleted = tasks.delete(taskId);

  if (deleted) {
    await saveToFile(TASKS_FILE, tasks);

    // 清理关联数据
    const comments = await loadComments();
    comments.delete(taskId);
    await saveArrayToFile(COMMENTS_FILE, comments);

    const attachments = await loadAttachments();
    attachments.delete(taskId);
    await saveArrayToFile(ATTACHMENTS_FILE, attachments);

    const worklogs = await loadWorklogs();
    worklogs.delete(taskId);
    await saveArrayToFile(WORKLOGS_FILE, worklogs);

    const dependencies = await loadDependencies();
    dependencies.delete(taskId);
    await saveArrayToFile(DEPENDENCIES_FILE, dependencies);
  }

  return deleted;
}

/**
 * 列出任务
 */
export async function listTasks(filter?: TaskFilter): Promise<Task[]> {
  const tasks = await loadTasks();
  let results = Array.from(tasks.values());

  if (!filter) {
    return results;
  }

  // 应用筛选条件
  if (filter.assigneeId) {
    results = results.filter((task) =>
      (task.assignees ?? []).some((assignee) => assignee.id === filter.assigneeId),
    );
  }

  if (filter.assigneeType) {
    results = results.filter((task) =>
      (task.assignees ?? []).some((assignee) => assignee.type === filter.assigneeType),
    );
  }

  if (filter.creatorId) {
    results = results.filter((task) => task.creatorId === filter.creatorId);
  }

  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    results = results.filter((task) => statuses.includes(task.status));
  }

  if (filter.priority) {
    const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
    results = results.filter((task) => priorities.includes(task.priority));
  }

  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    results = results.filter((task) => task.type && types.includes(task.type));
  }

  if (filter.organizationId) {
    results = results.filter((task) => task.organizationId === filter.organizationId);
  }

  if (filter.teamId) {
    results = results.filter((task) => task.teamId === filter.teamId);
  }

  if (filter.projectId) {
    results = results.filter((task) => task.projectId === filter.projectId);
  }

  if (filter.tags && filter.tags.length > 0) {
    results = results.filter(
      (task) => task.tags && filter.tags!.some((tag) => task.tags!.includes(tag)),
    );
  }

  if (filter.dueDateBefore) {
    results = results.filter((task) => task.dueDate && task.dueDate < filter.dueDateBefore!);
  }

  if (filter.dueDateAfter) {
    results = results.filter((task) => task.dueDate && task.dueDate > filter.dueDateAfter!);
  }

  if (filter.keyword) {
    const keyword = filter.keyword.toLowerCase();
    results = results.filter(
      (task) =>
        task.title.toLowerCase().includes(keyword) ||
        (task.description ?? "").toLowerCase().includes(keyword),
    );
  }

  // 排序规则：优先级（urgent > high > medium > low）→ 权重（越大越高）→ 加入任务时间（早的在前）
  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  results.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) {
      return pa - pb;
    }
    // 同优先级：权重大的先执行（默认 0）
    const wa = a.weight ?? 0;
    const wb = b.weight ?? 0;
    if (wa !== wb) {
      return wb - wa;
    }
    // 同优先级同权重：按加入时间升序（先入先出）
    return a.createdAt - b.createdAt;
  });

  return results;
}

/**
 * 获取任务统计信息
 */
export async function getTaskStats(filter?: TaskFilter): Promise<TaskStats> {
  const tasks = await listTasks(filter);

  const byStatus: Record<TaskStatus, number> = {
    todo: 0,
    "in-progress": 0,
    review: 0,
    blocked: 0,
    done: 0,
    cancelled: 0,
  };

  const byPriority: Record<TaskPriority, number> = {
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
  };

  let overdue = 0;
  let completedThisWeek = 0;
  let completedThisMonth = 0;
  const completionTimes: number[] = [];

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  for (const task of tasks) {
    byStatus[task.status]++;
    byPriority[task.priority]++;

    if (
      task.dueDate &&
      task.dueDate < now &&
      task.status !== "done" &&
      task.status !== "cancelled"
    ) {
      overdue++;
    }

    if (task.completedAt) {
      if (task.completedAt > weekAgo) {
        completedThisWeek++;
      }
      if (task.completedAt > monthAgo) {
        completedThisMonth++;
      }

      if (task.timeTracking.startedAt) {
        const completionTime = (task.completedAt - task.timeTracking.startedAt) / (1000 * 60 * 60); // 小时
        completionTimes.push(completionTime);
      }
    }
  }

  const averageCompletionTime =
    completionTimes.length > 0
      ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
      : undefined;

  return {
    total: tasks.length,
    byStatus,
    byPriority,
    overdue,
    completedThisWeek,
    completedThisMonth,
    averageCompletionTime,
  };
}

// ============================================================================
// 任务协作操作
// ============================================================================

/**
 * 添加任务评论
 */
export async function addTaskComment(comment: TaskComment): Promise<TaskComment> {
  const comments = await loadComments();
  const taskComments = comments.get(comment.taskId) || [];
  taskComments.push(comment);
  comments.set(comment.taskId, taskComments);
  await saveArrayToFile(COMMENTS_FILE, comments);

  // 更新任务的最后活动时间
  await updateTask(comment.taskId, {
    timeTracking: {
      ...(await getTask(comment.taskId))!.timeTracking,
      lastActivityAt: Date.now(),
    },
  });

  return comment;
}

/**
 * 获取任务评论列表
 */
export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const comments = await loadComments();
  return comments.get(taskId) || [];
}

/**
 * 添加任务附件
 */
export async function addTaskAttachment(attachment: TaskAttachment): Promise<TaskAttachment> {
  const attachments = await loadAttachments();
  const taskAttachments = attachments.get(attachment.taskId) || [];
  taskAttachments.push(attachment);
  attachments.set(attachment.taskId, taskAttachments);
  await saveArrayToFile(ATTACHMENTS_FILE, attachments);
  return attachment;
}

/**
 * 获取任务附件列表
 */
export async function getTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const attachments = await loadAttachments();
  return attachments.get(taskId) || [];
}

/**
 * 添加工作日志
 */
export async function addWorklog(worklog: AgentWorkLog): Promise<AgentWorkLog> {
  const worklogs = await loadWorklogs();
  const taskWorklogs = worklogs.get(worklog.taskId) || [];
  taskWorklogs.push(worklog);
  worklogs.set(worklog.taskId, taskWorklogs);
  await saveArrayToFile(WORKLOGS_FILE, worklogs);

  // 更新任务的时间追踪
  const task = await getTask(worklog.taskId);
  if (task && worklog.duration) {
    await updateTask(worklog.taskId, {
      timeTracking: {
        ...task.timeTracking,
        timeSpent: task.timeTracking.timeSpent + worklog.duration,
        lastActivityAt: Date.now(),
      },
    });
  }

  return worklog;
}

/**
 * 获取任务工作日志
 */
export async function getTaskWorklogs(taskId: string): Promise<AgentWorkLog[]> {
  const worklogs = await loadWorklogs();
  return worklogs.get(taskId) || [];
}

/**
 * 添加任务依赖
 */
export async function addTaskDependency(dependency: TaskDependency): Promise<TaskDependency> {
  const dependencies = await loadDependencies();
  const taskDependencies = dependencies.get(dependency.taskId) || [];
  taskDependencies.push(dependency);
  dependencies.set(dependency.taskId, taskDependencies);
  await saveArrayToFile(DEPENDENCIES_FILE, dependencies);
  return dependency;
}

/**
 * 获取任务依赖列表
 */
export async function getTaskDependencies(taskId: string): Promise<TaskDependency[]> {
  const dependencies = await loadDependencies();
  return dependencies.get(taskId) || [];
}

/**
 * 检查循环依赖
 */
export async function checkCircularDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [dependsOnTaskId];

  while (queue.length > 0) {
    const currentTaskId = queue.shift()!;

    if (currentTaskId === taskId) {
      return true; // 发现循环依赖
    }

    if (visited.has(currentTaskId)) {
      continue;
    }

    visited.add(currentTaskId);

    const dependencies = await getTaskDependencies(currentTaskId);
    for (const dep of dependencies) {
      if (dep.dependencyType === "blocks" || dep.dependencyType === "is-blocked-by") {
        queue.push(dep.dependsOnTaskId);
      }
    }
  }

  return false; // 没有循环依赖
}

// ============================================================================
// 会议 CRUD 操作
// ============================================================================

/**
 * 创建会议
 */
export async function createMeeting(meeting: Meeting): Promise<Meeting> {
  const meetings = await loadMeetings();
  meetings.set(meeting.id, meeting);
  await saveToFile(MEETINGS_FILE, meetings);
  return meeting;
}

/**
 * 获取会议
 */
export async function getMeeting(meetingId: string): Promise<Meeting | undefined> {
  const meetings = await loadMeetings();
  return meetings.get(meetingId);
}

/**
 * 更新会议
 */
export async function updateMeeting(
  meetingId: string,
  updates: Partial<Meeting>,
): Promise<Meeting | undefined> {
  const meetings = await loadMeetings();
  const meeting = meetings.get(meetingId);

  if (!meeting) {
    return undefined;
  }

  const updatedMeeting = {
    ...meeting,
    ...updates,
    id: meetingId,
    updatedAt: Date.now(),
  };

  meetings.set(meetingId, updatedMeeting);
  await saveToFile(MEETINGS_FILE, meetings);
  return updatedMeeting;
}

/**
 * 删除会议
 */
export async function deleteMeeting(meetingId: string): Promise<boolean> {
  const meetings = await loadMeetings();
  const deleted = meetings.delete(meetingId);

  if (deleted) {
    await saveToFile(MEETINGS_FILE, meetings);

    // 清理会议消息
    const messages = await loadMeetingMessages();
    messages.delete(meetingId);
    await saveArrayToFile(MEETING_MESSAGES_FILE, messages);
  }

  return deleted;
}

/**
 * 列出会议
 */
export async function listMeetings(filter?: MeetingFilter): Promise<Meeting[]> {
  const meetings = await loadMeetings();
  let results = Array.from(meetings.values());

  if (!filter) {
    return results;
  }

  // 应用筛选条件
  if (filter.organizerId) {
    results = results.filter((meeting) => meeting.organizerId === filter.organizerId);
  }

  if (filter.participantId) {
    results = results.filter((meeting) =>
      meeting.participants.some((p) => p.id === filter.participantId),
    );
  }

  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    results = results.filter((meeting) => statuses.includes(meeting.status));
  }

  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    results = results.filter((meeting) => types.includes(meeting.type));
  }

  if (filter.organizationId) {
    results = results.filter((meeting) => meeting.organizationId === filter.organizationId);
  }

  if (filter.teamId) {
    results = results.filter((meeting) => meeting.teamId === filter.teamId);
  }

  if (filter.projectId) {
    results = results.filter((meeting) => meeting.projectId === filter.projectId);
  }

  if (filter.scheduledAfter) {
    results = results.filter((meeting) => meeting.scheduledAt > filter.scheduledAfter!);
  }

  if (filter.scheduledBefore) {
    results = results.filter((meeting) => meeting.scheduledAt < filter.scheduledBefore!);
  }

  if (filter.keyword) {
    const keyword = filter.keyword.toLowerCase();
    results = results.filter(
      (meeting) =>
        meeting.title.toLowerCase().includes(keyword) ||
        (meeting.description && meeting.description.toLowerCase().includes(keyword)),
    );
  }

  return results;
}

/**
 * 获取会议统计信息
 */
export async function getMeetingStats(filter?: MeetingFilter): Promise<MeetingStats> {
  const meetings = await listMeetings(filter);

  const byStatus: Record<MeetingStatus, number> = {
    scheduled: 0,
    "in-progress": 0,
    completed: 0,
    cancelled: 0,
  };

  const byType: Record<MeetingType, number> = {
    standup: 0,
    review: 0,
    planning: 0,
    brainstorm: 0,
    decision: 0,
    other: 0,
  };

  let upcomingThisWeek = 0;
  let completedThisWeek = 0;
  const durations: number[] = [];
  const participantCounts: number[] = [];
  let totalDecisions = 0;
  let totalActionItems = 0;

  const now = Date.now();
  const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  for (const meeting of meetings) {
    byStatus[meeting.status]++;
    byType[meeting.type]++;

    if (meeting.status === "scheduled" && meeting.scheduledAt < weekFromNow) {
      upcomingThisWeek++;
    }

    if (meeting.status === "completed" && meeting.endedAt && meeting.endedAt > weekAgo) {
      completedThisWeek++;
    }

    if (meeting.endedAt && meeting.startedAt) {
      const actualDuration = (meeting.endedAt - meeting.startedAt) / (1000 * 60); // 分钟
      durations.push(actualDuration);
    }

    participantCounts.push(meeting.participants.length);
    totalDecisions += meeting.decisions.length;
    totalActionItems += meeting.actionItems.length;
  }

  const averageDuration =
    durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : undefined;

  const averageParticipants =
    participantCounts.length > 0
      ? participantCounts.reduce((sum, c) => sum + c, 0) / participantCounts.length
      : undefined;

  return {
    total: meetings.length,
    byStatus,
    byType,
    upcomingThisWeek,
    completedThisWeek,
    averageDuration,
    averageParticipants,
    totalDecisions,
    totalActionItems,
  };
}

// ============================================================================
// 会议交互操作
// ============================================================================

/**
 * 添加会议消息
 */
export async function addMeetingMessage(message: MeetingMessage): Promise<MeetingMessage> {
  const messages = await loadMeetingMessages();
  const meetingMessages = messages.get(message.meetingId) || [];
  meetingMessages.push(message);
  messages.set(message.meetingId, meetingMessages);
  await saveArrayToFile(MEETING_MESSAGES_FILE, messages);
  return message;
}

/**
 * 获取会议消息列表
 */
export async function getMeetingMessages(meetingId: string): Promise<MeetingMessage[]> {
  const messages = await loadMeetingMessages();
  return messages.get(meetingId) || [];
}

/**
 * 添加会议决策
 */
export async function addMeetingDecision(decision: MeetingDecision): Promise<MeetingDecision> {
  const meeting = await getMeeting(decision.meetingId);
  if (!meeting) {
    throw new Error(`Meeting not found: ${decision.meetingId}`);
  }

  meeting.decisions.push(decision);
  await updateMeeting(decision.meetingId, { decisions: meeting.decisions });
  return decision;
}

/**
 * 添加会议行动项
 */
export async function addMeetingActionItem(
  actionItem: MeetingActionItem,
): Promise<MeetingActionItem> {
  const meeting = await getMeeting(actionItem.meetingId);
  if (!meeting) {
    throw new Error(`Meeting not found: ${actionItem.meetingId}`);
  }

  meeting.actionItems.push(actionItem);
  await updateMeeting(actionItem.meetingId, { actionItems: meeting.actionItems });
  return actionItem;
}

/**
 * 更新议程项状态
 */
export async function updateAgendaItemStatus(
  meetingId: string,
  agendaItemId: string,
  status: "pending" | "in-progress" | "completed" | "skipped",
): Promise<Meeting | undefined> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) {
    return undefined;
  }

  const agendaIndex = meeting.agenda.findIndex((item) => item.id === agendaItemId);
  if (agendaIndex === -1) {
    return undefined;
  }

  meeting.agenda[agendaIndex].status = status;

  if (status === "in-progress") {
    meeting.agenda[agendaIndex].startedAt = Date.now();
    meeting.currentAgendaIndex = agendaIndex;
  } else if (status === "completed" || status === "skipped") {
    meeting.agenda[agendaIndex].completedAt = Date.now();
  }

  return await updateMeeting(meetingId, {
    agenda: meeting.agenda,
    currentAgendaIndex: meeting.currentAgendaIndex,
  });
}

/**
 * 清空缓存（用于测试或重新加载）
 */
export function clearCache(): void {
  tasksCache = null;
  meetingsCache = null;
  commentsCache = null;
  attachmentsCache = null;
  worklogsCache = null;
  dependenciesCache = null;
  meetingMessagesCache = null;
}
