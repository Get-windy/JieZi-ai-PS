/**
 * 任务系统审计日志（Domain Events / Audit Trail）
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  设计原则（Linear IssueHistory / Jira Changelog 模式）：               ║
 * ║                                                                          ║
 * ║  1. Append-Only：事件只追加，不修改不删除（不可变历史）                 ║
 * ║  2. 字段级 diff：每条事件记录 from→to 的精确变更，不只是"更新了"       ║
 * ║  3. actor 必填：每条事件都记录"谁"在"什么时间"做了"什么"             ║
 * ║  4. 与问责机制集成：accountability.ts 可以直接查询时间线做精准追责    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * 存储格式：JSONL（JSON Lines）— 每行一条事件，天然 append-only，
 * 支持流式读取，磁盘利用率远优于整体 JSON 数组。
 *
 * 文件路径：{STATE_DIR}/tasks/task-events.jsonl
 */

import * as fs from "fs/promises";
import { join } from "node:path";
import { STATE_DIR } from "../../upstream/src/config/paths.js";
import type { TaskStatus, TaskPriority } from "./types.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 所有可追踪的事件类型 */
export type TaskEventType =
  | "task.created" // 任务创建
  | "task.updated" // 字段变更（含多个字段的批量更新）
  | "task.status_changed" // 状态转换（单独记录，便于状态时间线查询）
  | "task.assigned" // 分配执行者
  | "task.unassigned" // 移除执行者
  | "task.priority_changed" // 优先级变更
  | "task.deleted" // 任务删除
  | "task.archived" // 任务归档（冷存储）
  | "meeting.created" // 会议创建
  | "meeting.updated" // 会议更新
  | "meeting.status_changed" // 会议状态变更
  | "meeting.deleted"; // 会议删除

/**
 * 字段级变更记录（Linear IssueHistory 风格）
 */
export interface FieldChange {
  /** 变更的字段名 */
  field: string;
  /** 变更前的值（null 表示之前不存在） */
  from: unknown;
  /** 变更后的值（null 表示被清空） */
  to: unknown;
}

/**
 * 单条审计事件（不可变）
 *
 * 参考 Linear 的 IssueHistory、Jira 的 Changelog：
 * { id, createdAt, actor, fromStatus→toStatus, fromAssignee→toAssignee, ... }
 */
export interface TaskAuditEvent {
  /** 事件 ID（唯一，格式：evt_{timestamp}_{random4}） */
  id: string;
  /** 事件类型 */
  type: TaskEventType;
  /** 关联的任务/会议 ID */
  resourceId: string;
  /** 资源类型 */
  resourceType: "task" | "meeting";
  /** 操作者 ID（Agent ID 或 'human-owner'） */
  actor: string;
  /** 事件发生时间（Unix ms） */
  timestamp: number;
  /** 字段级变更列表（task.updated 事件用） */
  changes?: FieldChange[];
  /** 状态转换（task.status_changed 事件用，冗余存储方便查询） */
  statusTransition?: {
    // oxlint-disable-next-line typescript/no-redundant-type-constituents
    from: TaskStatus | string;
    // oxlint-disable-next-line typescript/no-redundant-type-constituents
    to: TaskStatus | string;
  };
  /** 额外上下文（如删除原因、归档原因等） */
  context?: Record<string, unknown>;
}

// ============================================================================
// 存储路径
// ============================================================================

const TASKS_DIR = join(STATE_DIR, "tasks");
const EVENTS_FILE = join(TASKS_DIR, "task-events.jsonl");

// ============================================================================
// 内部工具
// ============================================================================

/**
 * 生成事件 ID
 */
function genEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `evt_${ts}_${rand}`;
}

/**
 * 确保 tasks 目录存在
 */
async function ensureDir(): Promise<void> {
  await fs.mkdir(TASKS_DIR, { recursive: true });
}

// ============================================================================
// 核心 API
// ============================================================================

/**
 * 追加一条审计事件到 JSONL 文件。
 *
 * 使用 fs.appendFile 的原子性保证（单行写入），避免并发损坏文件。
 * 即使写入失败也不抛出（降级为 warn），不阻断业务操作。
 *
 * @param event - 事件对象（id/timestamp 可省略，自动填充）
 */
export async function appendTaskEvent(
  event: Omit<TaskAuditEvent, "id" | "timestamp"> & { id?: string; timestamp?: number },
): Promise<void> {
  const full: TaskAuditEvent = {
    id: event.id ?? genEventId(),
    timestamp: event.timestamp ?? Date.now(),
    ...event,
  };
  const line = JSON.stringify(full) + "\n";
  try {
    await ensureDir();
    await fs.appendFile(EVENTS_FILE, line, { encoding: "utf-8" });
  } catch (err) {
    // 审计日志写入失败不阻断业务，记录 warn 继续
    console.warn("[AuditLog] Failed to write event:", full.type, full.resourceId, err);
  }
}

/**
 * 读取某个任务/会议的完整事件时间线（按时间升序）。
 *
 * 逐行扫描 JSONL 文件，过滤目标 resourceId。
 * 适合小规模数据（≤10 万条事件），大规模场景应迁移到数据库。
 *
 * @param resourceId - 任务或会议 ID
 */
export async function getTaskTimeline(resourceId: string): Promise<TaskAuditEvent[]> {
  try {
    const content = await fs.readFile(EVENTS_FILE, { encoding: "utf-8" });
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const events: TaskAuditEvent[] = [];
    for (const line of lines) {
      try {
        const ev: TaskAuditEvent = JSON.parse(line);
        if (ev.resourceId === resourceId) {
          events.push(ev);
        }
      } catch {
        // 跳过损坏的行
      }
    }
    // 按时间升序
    events.sort((a, b) => a.timestamp - b.timestamp);
    return events;
  } catch {
    return [];
  }
}

/**
 * 查询最近 N 条事件（全局，用于监控/告警）
 *
 * @param limit - 返回条数（默认 50）
 * @param filter - 可选过滤：eventType / actor / since
 */
export async function getRecentEvents(
  limit = 50,
  filter?: {
    type?: TaskEventType;
    actor?: string;
    since?: number;
  },
): Promise<TaskAuditEvent[]> {
  try {
    const content = await fs.readFile(EVENTS_FILE, { encoding: "utf-8" });
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const events: TaskAuditEvent[] = [];
    for (const line of lines) {
      try {
        const ev: TaskAuditEvent = JSON.parse(line);
        if (filter?.type && ev.type !== filter.type) {
          continue;
        }
        if (filter?.actor && ev.actor !== filter.actor) {
          continue;
        }
        if (filter?.since && ev.timestamp < filter.since) {
          continue;
        }
        events.push(ev);
      } catch {
        // 跳过损坏的行
      }
    }
    // 返回最新 N 条
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events.slice(0, limit);
  } catch {
    return [];
  }
}

// ============================================================================
// 便捷工厂函数（减少调用方样板代码）
// ============================================================================

/**
 * 记录任务创建事件
 */
export function logTaskCreated(
  taskId: string,
  actor: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  return appendTaskEvent({
    type: "task.created",
    resourceId: taskId,
    resourceType: "task",
    actor,
    context: { snapshot },
  });
}

/**
 * 记录任务更新事件（自动计算字段 diff）
 *
 * @param taskId  - 任务 ID
 * @param actor   - 操作者
 * @param before  - 更新前的任务快照（部分字段）
 * @param after   - 更新后的任务快照（部分字段）
 */
export function logTaskUpdated(
  taskId: string,
  actor: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (key === "updatedAt") {
      continue;
    } // 跳过时间戳本身
    const fromVal = before[key];
    const toVal = after[key];
    if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
      changes.push({ field: key, from: fromVal ?? null, to: toVal ?? null });
    }
  }
  if (changes.length === 0) {
    return Promise.resolve();
  } // 无实际变更不记录

  // 单独记录状态转换（方便查询）
  const statusChange = changes.find((c) => c.field === "status");
  const priorityChange = changes.find((c) => c.field === "priority");

  const promises: Promise<void>[] = [
    appendTaskEvent({
      type: "task.updated",
      resourceId: taskId,
      resourceType: "task",
      actor,
      changes,
    }),
  ];

  if (statusChange) {
    promises.push(
      appendTaskEvent({
        type: "task.status_changed",
        resourceId: taskId,
        resourceType: "task",
        actor,
        statusTransition: {
          from: statusChange.from as TaskStatus,
          to: statusChange.to as TaskStatus,
        },
      }),
    );
  }

  if (priorityChange) {
    promises.push(
      appendTaskEvent({
        type: "task.priority_changed",
        resourceId: taskId,
        resourceType: "task",
        actor,
        changes: [priorityChange],
        context: {
          from: priorityChange.from as TaskPriority,
          to: priorityChange.to as TaskPriority,
        },
      }),
    );
  }

  return Promise.all(promises).then(() => undefined);
}

/**
 * 记录任务删除事件
 */
export function logTaskDeleted(taskId: string, actor: string, reason?: string): Promise<void> {
  return appendTaskEvent({
    type: "task.deleted",
    resourceId: taskId,
    resourceType: "task",
    actor,
    context: { reason },
  });
}

/**
 * 记录会议创建事件
 */
export function logMeetingCreated(meetingId: string, actor: string): Promise<void> {
  return appendTaskEvent({
    type: "meeting.created",
    resourceId: meetingId,
    resourceType: "meeting",
    actor,
  });
}

/**
 * 记录会议更新事件
 */
export function logMeetingUpdated(
  meetingId: string,
  actor: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (key === "updatedAt") {
      continue;
    }
    const fromVal = before[key];
    const toVal = after[key];
    if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
      changes.push({ field: key, from: fromVal ?? null, to: toVal ?? null });
    }
  }
  if (changes.length === 0) {
    return Promise.resolve();
  }

  const promises: Promise<void>[] = [
    appendTaskEvent({
      type: "meeting.updated",
      resourceId: meetingId,
      resourceType: "meeting",
      actor,
      changes,
    }),
  ];

  const statusChange = changes.find((c) => c.field === "status");
  if (statusChange) {
    promises.push(
      appendTaskEvent({
        type: "meeting.status_changed",
        resourceId: meetingId,
        resourceType: "meeting",
        actor,
        statusTransition: { from: statusChange.from as string, to: statusChange.to as string },
      }),
    );
  }

  return Promise.all(promises).then(() => undefined);
}

/**
 * 记录会议删除事件
 */
export function logMeetingDeleted(meetingId: string, actor: string): Promise<void> {
  return appendTaskEvent({
    type: "meeting.deleted",
    resourceId: meetingId,
    resourceType: "meeting",
    actor,
  });
}
