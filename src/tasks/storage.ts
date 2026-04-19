/**
 * 任务系统存储层
 *
 * 提供任务、会议数据的持久化存储功能
 *
 * 存储后端：SQLite（移植自上游 task-registry.store.sqlite.ts 的 WAL/upsert 模式）
 * - 单文件 tasks.sqlite，WAL 模式，PRAGMA synchronous=NORMAL
 * - 所有实体（任务、会议、评论、附件、工作日志、依赖）均存入同一个库的不同表
 * - 对外 API（createTask / updateTask / listTasks 等）保持不变，上游合并时只需同步此文件
 *
 * 上游引入说明：
 *   SQLite 基础设施代码（WAL/PRAGMA/upsert/withWriteTransaction 模式）移植自
 *   upstream/src/tasks/task-registry.store.sqlite.ts，不在 upstream 目录创建覆盖层，
 *   直接内嵌在本文件以确保上游更新可正常合并。
 */

import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { STATE_DIR } from "../../upstream/src/config/paths.js";
import { createAsyncLock } from "../../upstream/src/infra/json-files.js";
import { requireNodeSqlite } from "../../upstream/src/infra/node-sqlite.js";
import { syncProgressNotesToAgentProgress } from "../agents/agent-progress.js";
import { appendNoteToWorkspaceFile } from "../utils/project-context.js";
import {
  logTaskCreated,
  logTaskUpdated,
  logTaskDeleted,
  logMeetingCreated,
  logMeetingUpdated,
  logMeetingDeleted,
} from "./audit-log.js";
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
  AcceptanceCriterion,
  TaskProgressNote,
  MemberType,
  UpdateCriterionRequest,
  AppendProgressNoteRequest,
} from "./types.js";

// ============================================================================
// SQLite 基础设施层
// 移植自 upstream/src/tasks/task-registry.store.sqlite.ts 的 WAL/upsert 模式
// ============================================================================

const TASKS_DIR = join(STATE_DIR, "tasks");
const TASKS_SQLITE_PATH = join(TASKS_DIR, "tasks.sqlite");
const DB_DIR_MODE = 0o700;
const DB_FILE_MODE = 0o600;
const SQLITE_SIDECAR_SUFFIXES = ["", "-shm", "-wal"] as const;

/**
 * 归档策略：done/cancelled 任务完成超过此天数后自动移入冷存储
 * 参考 Linear/Jira：已完成任务 7 天后归档，不占用热查询
 */
const ARCHIVE_AFTER_DAYS = 7;
const ARCHIVE_AFTER_MS = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

// 异步锁：保护所有写操作，防止并发竞争
const _lock = createAsyncLock();

type TasksDbStatements = {
  // tasks
  selectAllTasks: StatementSync;
  upsertTask: StatementSync;
  deleteTask: StatementSync;
  // meetings
  selectAllMeetings: StatementSync;
  upsertMeeting: StatementSync;
  deleteMeeting: StatementSync;
  // comments
  selectCommentsByTask: StatementSync;
  insertComment: StatementSync;
  deleteCommentsByTask: StatementSync;
  // attachments
  selectAttachmentsByTask: StatementSync;
  insertAttachment: StatementSync;
  deleteAttachmentsByTask: StatementSync;
  // worklogs
  selectWorklogsByTask: StatementSync;
  insertWorklog: StatementSync;
  deleteWorklogsByTask: StatementSync;
  // dependencies
  selectDependenciesByTask: StatementSync;
  insertDependency: StatementSync;
  deleteDependenciesByTask: StatementSync;
  // meeting messages
  selectMessagesByMeeting: StatementSync;
  insertMessage: StatementSync;
  deleteMessagesByMeeting: StatementSync;
};

type TasksDatabase = {
  db: DatabaseSync;
  path: string;
  stmts: TasksDbStatements;
};

let _cachedDb: TasksDatabase | null = null;

function ensureTasksDbPermissions(dbPath: string) {
  mkdirSync(TASKS_DIR, { recursive: true, mode: DB_DIR_MODE });
  try {
    chmodSync(TASKS_DIR, DB_DIR_MODE);
  } catch {
    /* best-effort */
  }
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    const candidate = `${dbPath}${suffix}`;
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      chmodSync(candidate, DB_FILE_MODE);
    } catch {
      /* best-effort */
    }
  }
}

function ensureSchema(db: DatabaseSync) {
  // tasks 表：核心字段 + json_blob 存放所有扩展字段（评论/附件等内嵌字段）
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      status        TEXT NOT NULL,
      priority      TEXT NOT NULL,
      creator_id    TEXT NOT NULL,
      level         TEXT,
      project_id    TEXT,
      epic_id       TEXT,
      feature_id    TEXT,
      org_id        TEXT,
      team_id       TEXT,
      parent_task_id TEXT,
      story_points  INTEGER,
      due_date      INTEGER,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER,
      completed_at  INTEGER,
      cancelled_at  INTEGER,
      is_archived   INTEGER NOT NULL DEFAULT 0,
      archived_at   INTEGER,
      json_blob     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id  ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_epic_id     ON tasks(epic_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_feature_id  ON tasks(feature_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_org_id      ON tasks(org_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_team_id     ON tasks(team_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_is_archived ON tasks(is_archived);
    CREATE INDEX IF NOT EXISTS idx_tasks_creator_id  ON tasks(creator_id);
  `);

  // meetings 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      status      TEXT NOT NULL,
      organizer_id TEXT NOT NULL,
      org_id      TEXT,
      team_id     TEXT,
      project_id  TEXT,
      scheduled_at INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER,
      json_blob   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meetings_status     ON meetings(status);
    CREATE INDEX IF NOT EXISTS idx_meetings_project_id ON meetings(project_id);
  `);

  // task_comments
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id       TEXT PRIMARY KEY,
      task_id  TEXT NOT NULL,
      json_blob TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_task_id ON task_comments(task_id);
  `);

  // task_attachments
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id       TEXT PRIMARY KEY,
      task_id  TEXT NOT NULL,
      json_blob TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON task_attachments(task_id);
  `);

  // task_worklogs
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_worklogs (
      id       TEXT PRIMARY KEY,
      task_id  TEXT NOT NULL,
      json_blob TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_worklogs_task_id ON task_worklogs(task_id);
  `);

  // task_dependencies
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id          TEXT PRIMARY KEY,
      task_id     TEXT NOT NULL,
      depends_on  TEXT NOT NULL,
      json_blob   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deps_task_id ON task_dependencies(task_id);
  `);

  // meeting_messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_messages (
      id         TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      json_blob  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_meeting_id ON meeting_messages(meeting_id);
  `);
}

function buildStatements(db: DatabaseSync): TasksDbStatements {
  return {
    // --- tasks ---
    selectAllTasks: db.prepare(
      `SELECT json_blob, is_archived FROM tasks ORDER BY created_at ASC, id ASC`,
    ),
    upsertTask: db.prepare(`
      INSERT INTO tasks
        (id,title,status,priority,creator_id,level,project_id,epic_id,feature_id,
         org_id,team_id,parent_task_id,story_points,due_date,
         created_at,updated_at,completed_at,cancelled_at,is_archived,archived_at,json_blob)
      VALUES
        (@id,@title,@status,@priority,@creator_id,@level,@project_id,@epic_id,@feature_id,
         @org_id,@team_id,@parent_task_id,@story_points,@due_date,
         @created_at,@updated_at,@completed_at,@cancelled_at,@is_archived,@archived_at,@json_blob)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, status=excluded.status, priority=excluded.priority,
        level=excluded.level, project_id=excluded.project_id,
        epic_id=excluded.epic_id, feature_id=excluded.feature_id,
        org_id=excluded.org_id, team_id=excluded.team_id,
        parent_task_id=excluded.parent_task_id, story_points=excluded.story_points,
        due_date=excluded.due_date, updated_at=excluded.updated_at,
        completed_at=excluded.completed_at, cancelled_at=excluded.cancelled_at,
        is_archived=excluded.is_archived, archived_at=excluded.archived_at,
        json_blob=excluded.json_blob
    `),
    deleteTask: db.prepare(`DELETE FROM tasks WHERE id = ?`),
    // --- meetings ---
    selectAllMeetings: db.prepare(
      `SELECT json_blob FROM meetings ORDER BY scheduled_at ASC, id ASC`,
    ),
    upsertMeeting: db.prepare(`
      INSERT INTO meetings
        (id,title,status,organizer_id,org_id,team_id,project_id,scheduled_at,created_at,updated_at,json_blob)
      VALUES
        (@id,@title,@status,@organizer_id,@org_id,@team_id,@project_id,@scheduled_at,@created_at,@updated_at,@json_blob)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, status=excluded.status, organizer_id=excluded.organizer_id,
        org_id=excluded.org_id, team_id=excluded.team_id, project_id=excluded.project_id,
        scheduled_at=excluded.scheduled_at, updated_at=excluded.updated_at,
        json_blob=excluded.json_blob
    `),
    deleteMeeting: db.prepare(`DELETE FROM meetings WHERE id = ?`),
    // --- comments ---
    selectCommentsByTask: db.prepare(`SELECT json_blob FROM task_comments WHERE task_id = ?`),
    insertComment: db.prepare(
      `INSERT OR IGNORE INTO task_comments (id, task_id, json_blob) VALUES (@id, @task_id, @json_blob)`,
    ),
    deleteCommentsByTask: db.prepare(`DELETE FROM task_comments WHERE task_id = ?`),
    // --- attachments ---
    selectAttachmentsByTask: db.prepare(`SELECT json_blob FROM task_attachments WHERE task_id = ?`),
    insertAttachment: db.prepare(
      `INSERT OR IGNORE INTO task_attachments (id, task_id, json_blob) VALUES (@id, @task_id, @json_blob)`,
    ),
    deleteAttachmentsByTask: db.prepare(`DELETE FROM task_attachments WHERE task_id = ?`),
    // --- worklogs ---
    selectWorklogsByTask: db.prepare(`SELECT json_blob FROM task_worklogs WHERE task_id = ?`),
    insertWorklog: db.prepare(
      `INSERT OR IGNORE INTO task_worklogs (id, task_id, json_blob) VALUES (@id, @task_id, @json_blob)`,
    ),
    deleteWorklogsByTask: db.prepare(`DELETE FROM task_worklogs WHERE task_id = ?`),
    // --- dependencies ---
    selectDependenciesByTask: db.prepare(
      `SELECT json_blob FROM task_dependencies WHERE task_id = ?`,
    ),
    insertDependency: db.prepare(
      `INSERT OR IGNORE INTO task_dependencies (id, task_id, depends_on, json_blob) VALUES (@id, @task_id, @depends_on, @json_blob)`,
    ),
    deleteDependenciesByTask: db.prepare(`DELETE FROM task_dependencies WHERE task_id = ?`),
    // --- meeting messages ---
    selectMessagesByMeeting: db.prepare(
      `SELECT json_blob FROM meeting_messages WHERE meeting_id = ?`,
    ),
    insertMessage: db.prepare(
      `INSERT OR IGNORE INTO meeting_messages (id, meeting_id, json_blob) VALUES (@id, @meeting_id, @json_blob)`,
    ),
    deleteMessagesByMeeting: db.prepare(`DELETE FROM meeting_messages WHERE meeting_id = ?`),
  };
}

/**
 * 打开/复用 SQLite 连接（单例，WAL 模式）
 * 移植自 upstream task-registry.store.sqlite.ts openTaskRegistryDatabase()
 */
function openDb(): TasksDatabase {
  if (_cachedDb && _cachedDb.path === TASKS_SQLITE_PATH) {
    return _cachedDb;
  }
  if (_cachedDb) {
    try {
      _cachedDb.db.close();
    } catch {
      /* ignore */
    }
    _cachedDb = null;
  }
  ensureTasksDbPermissions(TASKS_SQLITE_PATH);
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(TASKS_SQLITE_PATH);
  // WAL 模式 + 标准写同步：移植自上游同名配置
  db.exec(`PRAGMA journal_mode = WAL;`);
  db.exec(`PRAGMA synchronous = NORMAL;`);
  db.exec(`PRAGMA busy_timeout = 5000;`);
  ensureSchema(db);
  ensureTasksDbPermissions(TASKS_SQLITE_PATH);
  _cachedDb = { db, path: TASKS_SQLITE_PATH, stmts: buildStatements(db) };
  return _cachedDb;
}

/**
 * 关闭 SQLite 连接（用于测试或进程退出）
 */
export function closeTasksDb(): void {
  if (!_cachedDb) {
    return;
  }
  try {
    _cachedDb.db.close();
  } catch {
    /* ignore */
  }
  _cachedDb = null;
}

/**
 * 带事务的写操作包装（移植自上游 withWriteTransaction）
 */
function withWriteTx(fn: (stmts: TasksDbStatements) => void): void {
  const { db, path, stmts } = openDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    fn(stmts);
    db.exec("COMMIT");
    ensureTasksDbPermissions(path);
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ============================================================================
// 内部辅助：Task ↔ Row 序列化
// ============================================================================

function taskToRow(task: Task, isArchived = false, archivedAt?: number) {
  // Guard: SQLite only accepts string|number|bigint|boolean|null.
  // NOT NULL columns must never receive undefined — coerce to safe defaults.
  // (mirrors upstream bindTaskRecordBase in task-registry.store.sqlite.ts)
  const safeTitle: string = typeof task.title === "string" && task.title ? task.title : task.id;
  const safeStatus: string = typeof task.status === "string" && task.status ? task.status : "todo";
  const safePriority: string =
    typeof task.priority === "string" && task.priority ? task.priority : "medium";
  const safeCreatorId: string =
    typeof task.creatorId === "string" && task.creatorId ? task.creatorId : "system";
  const safeCreatedAt: number = typeof task.createdAt === "number" ? task.createdAt : Date.now();
  return {
    id: task.id,
    title: safeTitle,
    status: safeStatus,
    priority: safePriority,
    creator_id: safeCreatorId,
    level: task.level ?? null,
    project_id: task.projectId ?? null,
    epic_id: task.epicId ?? null,
    feature_id: task.featureId ?? null,
    org_id: task.organizationId ?? null,
    team_id: task.teamId ?? null,
    parent_task_id: task.parentTaskId ?? null,
    story_points: task.storyPoints ?? null,
    due_date: task.dueDate ?? null,
    created_at: safeCreatedAt,
    updated_at: task.updatedAt ?? null,
    completed_at: task.completedAt ?? null,
    cancelled_at: task.cancelledAt ?? null,
    is_archived: isArchived ? 1 : 0,
    archived_at: archivedAt ?? null,
    json_blob: JSON.stringify(task),
  };
}

function rowToTask(row: { json_blob: string }): Task {
  return JSON.parse(row.json_blob) as Task;
}

function meetingToRow(meeting: Meeting) {
  return {
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    organizer_id: meeting.organizerId,
    org_id: meeting.organizationId ?? null,
    team_id: meeting.teamId ?? null,
    project_id: meeting.projectId ?? null,
    scheduled_at: meeting.scheduledAt,
    created_at: meeting.createdAt,
    updated_at: meeting.updatedAt ?? null,
    json_blob: JSON.stringify(meeting),
  };
}

function rowToMeeting(row: { json_blob: string }): Meeting {
  return JSON.parse(row.json_blob) as Meeting;
}

// ============================================================================
// 内存缓存（热任务 + 归档 + 会议 + 关联数据）
// 缓存在首次查询时从 SQLite 填充，写操作同步刷新缓存
// ============================================================================

let tasksCache: Map<string, Task> | null = null;
let tasksArchiveCache: Map<string, Task> | null = null;
let meetingsCache: Map<string, Meeting> | null = null;
let commentsCache: Map<string, TaskComment[]> | null = null;
let attachmentsCache: Map<string, TaskAttachment[]> | null = null;
let worklogsCache: Map<string, AgentWorkLog[]> | null = null;
let dependenciesCache: Map<string, TaskDependency[]> | null = null;
let meetingMessagesCache: Map<string, MeetingMessage[]> | null = null;

/**
 * 加载热任务（活跃 + 近期完成，is_archived=0）到缓存
 * 不含已归档的冷数据，保持调度扫描性能
 */
function loadTasks(): Map<string, Task> {
  if (tasksCache !== null) {
    return tasksCache;
  }
  const { stmts } = openDb();
  const rows = stmts.selectAllTasks.all() as Array<{ json_blob: string; is_archived: number }>;
  tasksCache = new Map();
  tasksArchiveCache = new Map();
  for (const row of rows) {
    const task = rowToTask(row);
    if (row.is_archived) {
      tasksArchiveCache.set(task.id, task);
    } else {
      tasksCache.set(task.id, task);
    }
  }
  return tasksCache;
}

/**
 * 加载归档任务（懒加载）
 */
function loadArchivedTasks(): Map<string, Task> {
  if (tasksArchiveCache !== null) {
    return tasksArchiveCache;
  }
  // 如果 tasksCache 未初始化，调用 loadTasks() 会同时填充归档缓存
  loadTasks();
  return tasksArchiveCache!;
}

/**
 * 自动归档：将 done/cancelled 且超过保留期的任务移入冷存储
 * 在服务启动时调用一次，之后每次任务完成时触发
 * 参考 GTD：完成即归档，活跃清单保持精简
 */
export async function archiveOldTasks(): Promise<{ archived: number }> {
  return _lock(async () => {
    const tasks = loadTasks();
    const now = Date.now();
    const toArchive: string[] = [];

    for (const [id, task] of tasks) {
      if (task.status !== "done" && task.status !== "cancelled") {
        continue;
      }
      const finishedAt = task.completedAt ?? task.cancelledAt ?? task.updatedAt ?? task.createdAt;
      if (now - finishedAt >= ARCHIVE_AFTER_MS) {
        toArchive.push(id);
      }
    }

    if (toArchive.length === 0) {
      return { archived: 0 };
    }

    const archivedAt = now;
    withWriteTx((stmts) => {
      for (const id of toArchive) {
        const task = tasks.get(id)!;
        stmts.upsertTask.run(taskToRow(task, true, archivedAt));
      }
    });

    // 同步缓存
    const archive = loadArchivedTasks();
    for (const id of toArchive) {
      const task = tasks.get(id)!;
      archive.set(id, task);
      tasks.delete(id);
    }

    console.log(
      `[TaskStorage] Archived ${toArchive.length} old task(s) to cold storage (>${ARCHIVE_AFTER_DAYS}d after completion)`,
    );
    return { archived: toArchive.length };
  });
}

/**
 * 加载所有会议到缓存
 */
function loadMeetings(): Map<string, Meeting> {
  if (meetingsCache !== null) {
    return meetingsCache;
  }
  const { stmts } = openDb();
  const rows = stmts.selectAllMeetings.all() as Array<{ json_blob: string }>;
  meetingsCache = new Map(
    rows.map((r) => {
      const m = rowToMeeting(r);
      return [m.id, m];
    }),
  );
  return meetingsCache;
}

/**
 * 加载评论到缓存
 */
function loadComments(taskId?: string): TaskComment[] {
  const { stmts } = openDb();
  if (taskId) {
    const rows = stmts.selectCommentsByTask.all(taskId) as Array<{ json_blob: string }>;
    return rows.map((r) => JSON.parse(r.json_blob) as TaskComment);
  }
  // 全量加载（必要时）
  if (commentsCache !== null) {
    return [];
  }
  commentsCache = new Map();
  return [];
}

/**
 * 加载附件到缓存
 */
function loadAttachments(taskId?: string): TaskAttachment[] {
  const { stmts } = openDb();
  if (taskId) {
    const rows = stmts.selectAttachmentsByTask.all(taskId) as Array<{ json_blob: string }>;
    return rows.map((r) => JSON.parse(r.json_blob) as TaskAttachment);
  }
  if (attachmentsCache !== null) {
    return [];
  }
  attachmentsCache = new Map();
  return [];
}

/**
 * 加载工作日志到缓存
 */
function loadWorklogs(taskId?: string): AgentWorkLog[] {
  const { stmts } = openDb();
  if (taskId) {
    const rows = stmts.selectWorklogsByTask.all(taskId) as Array<{ json_blob: string }>;
    return rows.map((r) => JSON.parse(r.json_blob) as AgentWorkLog);
  }
  if (worklogsCache !== null) {
    return [];
  }
  worklogsCache = new Map();
  return [];
}

/**
 * 加载依赖关系到缓存
 */
function loadDependencies(taskId?: string): TaskDependency[] {
  const { stmts } = openDb();
  if (taskId) {
    const rows = stmts.selectDependenciesByTask.all(taskId) as Array<{ json_blob: string }>;
    return rows.map((r) => JSON.parse(r.json_blob) as TaskDependency);
  }
  if (dependenciesCache !== null) {
    return [];
  }
  dependenciesCache = new Map();
  return [];
}

/**
 * 加载会议消息到缓存
 */
function loadMeetingMessages(meetingId?: string): MeetingMessage[] {
  const { stmts } = openDb();
  if (meetingId) {
    const rows = stmts.selectMessagesByMeeting.all(meetingId) as Array<{ json_blob: string }>;
    return rows.map((r) => JSON.parse(r.json_blob) as MeetingMessage);
  }
  if (meetingMessagesCache !== null) {
    return [];
  }
  meetingMessagesCache = new Map();
  return [];
}

// ============================================================================
// 任务 CRUD 操作
// ============================================================================

// 单个 agent 最多允许的 todo 任务数（超出时拒绝创建新任务）
const MAX_TODO_PER_AGENT = 8;

/**
 * 创建任务
 *
 * 内置去重检查（程序侧，不依赖 agent 自觉）：
 * 1. 同 assignee + 同标题 + active 状态（todo/in-progress/blocked）→ 拒绝创建，返回已有任务
 * 2. 任意 assignee 的 todo 任务已达上限（MAX_TODO_PER_AGENT）→ 拒绝创建并抛出错误
 *
 * 工作层次约束（P1，参考 SAFe / Linear）：
 * - epic    必须关联 projectId（跨 Sprint 大价值块，必须挂在项目下）
 * - feature 必须关联 epicId（功能块，必须属于某 Epic）
 * - story   必须关联 featureId（用户故事，必须属于某 Feature）
 * - task    无强制约束（可独立，也可挂在任意上级）
 */
export async function createTask(
  task: Task,
  options?: { skipDuplicateCheck?: boolean; skipHierarchyCheck?: boolean },
): Promise<Task> {
  return _lock(async () => {
    const tasks = loadTasks();

    // ── 层次约束校验（P1）──
    if (!options?.skipHierarchyCheck) {
      if (task.level === "epic" && !task.projectId) {
        throw new Error(
          `[TaskHierarchy] Epic task "${task.title}" must have a projectId. Epics span multiple Sprints and must belong to a project.`,
        );
      }
      if (task.level === "feature" && !task.epicId) {
        throw new Error(
          `[TaskHierarchy] Feature task "${task.title}" must have an epicId. Features are deliverable increments within an Epic.`,
        );
      }
      if (task.level === "story" && !task.featureId) {
        throw new Error(
          `[TaskHierarchy] Story task "${task.title}" must have a featureId. Stories are user-visible increments within a Feature.`,
        );
      }
    }

    if (!options?.skipDuplicateCheck) {
      if (!task.title || !task.title.trim()) {
        throw new Error(
          `[TaskStorage] Task creation rejected: "title" is required and cannot be empty. Please provide a clear, descriptive title for the task.`,
        );
      }

      const ACTIVE_STATUSES = ["todo", "in-progress", "blocked"] as const;
      const titleLower = task.title.trim().toLowerCase();
      const assigneeIds = (task.assignees ?? []).map((a) => a.id.toLowerCase());

      if (assigneeIds.length > 0) {
        for (const existing of tasks.values()) {
          if (!ACTIVE_STATUSES.includes(existing.status as (typeof ACTIVE_STATUSES)[number])) {
            continue;
          }
          if ((existing.title ?? "").trim().toLowerCase() !== titleLower) {
            continue;
          }
          const existingAssigneeIds = new Set(
            (existing.assignees ?? []).map((a) => a.id.toLowerCase()),
          );
          const hasOverlap = assigneeIds.some((id) => existingAssigneeIds.has(id));
          if (hasOverlap) {
            console.warn(
              `[TaskStorage] Duplicate task rejected: "${task.title}" already exists as ${existing.id} (status=${existing.status})`,
            );
            return existing;
          }
        }

        for (const assigneeId of assigneeIds) {
          let todoCount = 0;
          for (const existing of tasks.values()) {
            if (existing.status !== "todo") {
              continue;
            }
            if ((existing.assignees ?? []).some((a) => a.id.toLowerCase() === assigneeId)) {
              todoCount++;
            }
          }
          if (todoCount >= MAX_TODO_PER_AGENT) {
            throw new Error(
              `[TaskStorage] Task creation rejected: agent "${assigneeId}" already has ${todoCount} todo tasks (limit: ${MAX_TODO_PER_AGENT}). Complete existing tasks before adding new ones.`,
            );
          }
        }
      }
    }

    // 如果 acceptanceCriteria 中有字符串，自动转为 AcceptanceCriterion
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      const hasStringItems = task.acceptanceCriteria.some((c) => typeof c === "string");
      if (hasStringItems) {
        (task as Record<string, unknown>).acceptanceCriteria = normalizeCriteria(
          task.acceptanceCriteria as string[] | AcceptanceCriterion[],
        );
      }
    }

    // 写入 SQLite
    withWriteTx((stmts) => {
      stmts.upsertTask.run(taskToRow(task));
    });
    tasks.set(task.id, task);

    // ── 审计日志（P0：任务创建事件）──
    void logTaskCreated(task.id, task.supervisorId ?? task.creatorId, {
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignees: task.assignees?.map((a) => a.id),
      orgId: task.organizationId,
      teamId: task.teamId,
      projectId: task.projectId,
    });

    return task;
  });
}

/**
 * 获取任务（先查热存储，再查冷存储归档）
 */
export async function getTask(taskId: string): Promise<Task | undefined> {
  const tasks = loadTasks();
  const hot = tasks.get(taskId);
  if (hot) {
    return hot;
  }
  const archive = loadArchivedTasks();
  return archive.get(taskId);
}

/**
 * Task 状态转换允许表（状态机）
 *
 * 业界最佳实践（Linear / Jira）：状态只能按合法路径向前推进，不可随意跳转。
 *
 * 允许的转换路径：
 *   backlog     → todo, cancelled（待排入 Sprint / 直接废弃）
 *   todo        → in-progress, blocked, cancelled
 *   in-progress → review, blocked, done, cancelled
 *   review      → in-progress, done, cancelled
 *   blocked     → todo, in-progress, done, cancelled
 *   done        → (终态)
 *   cancelled   → (终态)
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  backlog: ["todo", "cancelled"],
  todo: ["in-progress", "blocked", "cancelled"],
  "in-progress": ["review", "blocked", "done", "cancelled"],
  review: ["in-progress", "done", "cancelled"],
  blocked: ["todo", "in-progress", "done", "cancelled"], // 修复：blocked 允许直接完成（解除阻塞即完成）
  done: [], // terminal
  cancelled: [], // terminal
};

/**
 * 验证状态转换是否合法。
 * @param from - 当前状态
 * @param to   - 目标状态
 * @returns null 表示合法，否则返回错误信息
 */
function validateStatusTransition(from: string, to: string): string | null {
  if (from === to) {
    return null;
  } // 相同状态直接放行
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return `[TaskStateMachine] Invalid transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none (terminal state)"}. Hint: "done" and "cancelled" are terminal states.`;
  }
  return null;
}

/**
 * 验证将 todo → in-progress 时必须有 assignee。
 * 验证将 in-progress → review 时必须有交付物证据。
 * 验证将 任意状态 → done 时所有验收标准必须通过。
 */
function validateTransitionGuards(task: Task, newStatus: string): string | null {
  // todo → in-progress: 必须有 assignee
  if (task.status === "todo" && newStatus === "in-progress") {
    if (!task.assignees || task.assignees.length === 0) {
      return `[TaskStateMachine] Cannot start task "${task.id}": no assignee. Assign at least one agent before starting.`;
    }
  }

  // in-progress → review: 必须有交付物（附件 / 工作日志 / metadata.deliverableUrl）
  if (task.status === "in-progress" && newStatus === "review") {
    const hasAttachments = task.attachments && task.attachments.length > 0;
    const hasWorkLogs =
      task.workLogs && task.workLogs.filter((l) => l.result === "success").length > 0;
    const hasDeliverableUrl = Boolean(task.metadata?.deliverableUrl);
    if (!hasAttachments && !hasWorkLogs && !hasDeliverableUrl) {
      return `[TaskStateMachine] Cannot move task "${task.id}" to review: no deliverable evidence (attach a file, add a success workLog, or set metadata.deliverableUrl).`;
    }
  }

  // → done: 所有验收标准必须通过（Ralph acceptanceCriteria 实践）
  if (newStatus === "done" && task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    const failing = task.acceptanceCriteria.filter((c) => !c.passes);
    if (failing.length > 0) {
      const descriptions = failing.map((c) => `  - [${c.id}] ${c.description}`).join("\n");
      return (
        `[TaskStateMachine] Cannot mark task "${task.id}" as done: ` +
        `${failing.length} acceptance criteria not yet verified:\n${descriptions}\n` +
        `Use updateCriterion() to verify each criterion before completing the task.`
      );
    }
  }

  return null;
}

/**
 * 更新任务
 */
export async function updateTask(
  taskId: string,
  updates: Partial<Task>,
): Promise<Task | undefined> {
  return _lock(async () => {
    const tasks = loadTasks();
    const task = tasks.get(taskId);

    if (!task) {
      return undefined;
    }

    if (updates.status && updates.status !== task.status) {
      const transitionErr = validateStatusTransition(task.status, updates.status);
      if (transitionErr) {
        throw new Error(transitionErr);
      }
      const guardErr = validateTransitionGuards(task, updates.status);
      if (guardErr) {
        throw new Error(guardErr);
      }
    }

    const updatedTask = {
      ...task,
      ...updates,
      id: taskId,
      updatedAt: Date.now(),
    };

    withWriteTx((stmts) => {
      stmts.upsertTask.run(taskToRow(updatedTask));
    });
    tasks.set(taskId, updatedTask);

    // ── 审计日志（P0：字段级 diff 记录）──
    const auditActor =
      (((updates as Record<string, unknown>)._actorId as string) || updatedTask.supervisorId) ??
      updatedTask.creatorId;
    void logTaskUpdated(
      taskId,
      auditActor,
      task as unknown as Record<string, unknown>,
      updatedTask as unknown as Record<string, unknown>,
    );

    return updatedTask;
  });
}

/**
 * 删除任务
 */
export async function deleteTask(taskId: string, actor?: string): Promise<boolean> {
  return _lock(async () => {
    const tasks = loadTasks();
    const task = tasks.get(taskId);
    const existed = tasks.delete(taskId);

    if (existed) {
      withWriteTx((stmts) => {
        stmts.deleteTask.run(taskId);
        stmts.deleteCommentsByTask.run(taskId);
        stmts.deleteAttachmentsByTask.run(taskId);
        stmts.deleteWorklogsByTask.run(taskId);
        stmts.deleteDependenciesByTask.run(taskId);
      });

      // ── 审计日志（P0：任务删除事件）──
      void logTaskDeleted(taskId, actor ?? task?.supervisorId ?? task?.creatorId ?? "system");
    }

    return existed;
  });
}

/**
 * 强制重置任务状态（绕过状态机，管理员专用）
 *
 * 适用场景：
 * - 任务被误标为 done/cancelled，需重新打开
 * - 任务陷入 blocked 死锁，无法通过正常流转解除
 * - 系统异常导致任务进入错误终态
 *
 * 与 updateTask 的区别：本函数跳过 validateStatusTransition 和 validateTransitionGuards，
 * 直接覆盖状态。会清空 completedAt、重置 timeTracking.lastActivityAt。
 */
export async function forceResetTask(
  taskId: string,
  targetStatus: "todo" | "in-progress" | "blocked",
  actor: string,
  reason?: string,
): Promise<Task | undefined> {
  return _lock(async () => {
    const tasks = loadTasks();
    const task = tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    const now = Date.now();
    const existingTracking = task.timeTracking ?? { timeSpent: 0, lastActivityAt: now };

    const resetTask: Task = {
      ...task,
      status: targetStatus,
      updatedAt: now,
      // 清除终态标记
      completedAt: undefined,
      // 刷新活跃度，防止调度器立即将其超时
      timeTracking: {
        ...existingTracking,
        lastActivityAt: now,
        startedAt:
          targetStatus === "in-progress"
            ? (existingTracking.startedAt ?? now)
            : existingTracking.startedAt,
      },
    };

    withWriteTx((stmts) => {
      stmts.upsertTask.run(taskToRow(resetTask));
    });
    tasks.set(taskId, resetTask);

    // 审计日志
    void logTaskUpdated(
      taskId,
      actor,
      task as unknown as Record<string, unknown>,
      { ...resetTask, _resetReason: reason ?? "force-reset" } as unknown as Record<string, unknown>,
    );

    return resetTask;
  });
}

// ============================================================================
// 验收标准辅助函数
// ============================================================================

/**
 * 将字符串数组转为 AcceptanceCriterion[]，passes 默认 false
 */
export function normalizeCriteria(raw: string[] | AcceptanceCriterion[]): AcceptanceCriterion[] {
  return raw.map((item, idx) => {
    if (typeof item === "string") {
      return {
        id: `ac-${Date.now()}-${idx}`,
        description: item,
        passes: false,
      } satisfies AcceptanceCriterion;
    }
    return item;
  });
}

/**
 * 逐条更新验收标准通过状态（Ralph 的 passes=true 机制）
 *
 * Agent 完成任务时必须调用此函数逐条确认每个验收标准。
 * 人类 reviewr 也可以调用此函数驳回（passes=false）或完成验收。
 */
export async function updateCriterion(req: UpdateCriterionRequest): Promise<Task | undefined> {
  return _lock(async () => {
    const tasks = loadTasks();
    const task = tasks.get(req.taskId);
    if (!task) {
      return undefined;
    }

    const criteria = task.acceptanceCriteria ?? [];
    const idx = criteria.findIndex((c) => c.id === req.criterionId);
    if (idx < 0) {
      throw new Error(
        `[TaskStorage] Criterion "${req.criterionId}" not found in task "${req.taskId}".`,
      );
    }

    const updatedCriteria: AcceptanceCriterion[] = [...criteria];
    updatedCriteria[idx] = {
      ...updatedCriteria[idx],
      passes: req.passes,
      verifiedAt: Date.now(),
      verifiedBy: req.verifiedBy,
      ...(req.note ? { note: req.note } : {}),
    };

    const allPassed = updatedCriteria.length > 0 && updatedCriteria.every((c) => c.passes);

    const updatedTask: Task = {
      ...task,
      acceptanceCriteria: updatedCriteria,
      // allCriteriaPassed 是 readonly 计算属性，存储时尚需写入
      // 用 metadata 传递这个计算值以支持客户端快捷读取
      updatedAt: Date.now(),
    };
    // 写入计算属性（覆盖 readonly 以实现持久化）
    (updatedTask as Record<string, unknown>).allCriteriaPassed =
      updatedCriteria.length > 0 ? allPassed : undefined;

    withWriteTx((stmts) => {
      stmts.upsertTask.run(taskToRow(updatedTask));
    });
    tasks.set(req.taskId, updatedTask);

    return updatedTask;
  });
}

/**
 * 进展笔记最大保留数量
 *
 * 超出此限制时，最早的旧笔记会被压缩为一条摘要笔记，
 * 保留知识精华而非原始全文。
 *
 * 设计考虑：
 * - 每条笔记平均约 200-500 字，20 条约 4-10 KB
 * - 超过 20 条就开始压缩，防止长期项目无限模式增长
 * - 压缩将最早的 COMPACT_BATCH_SIZE 条合并为一条摘要
 */
const MAX_PROGRESS_NOTES = 20;
const COMPACT_BATCH_SIZE = 10; // 每次压缩剥除的条数

/**
 * 将多条旧笔记压缩为一条摘要（纯本地、不依赖 LLM）
 *
 * 压缩策略：提取每条笔记的前 N 字拼接，加时间戳。
 * 功能简单而可靠，不引入外部依赖。
 * 当未来支持 LLM 摘要时，可将此函数替换为调用模型生成摘要。
 */
function compactNotes(
  notes: TaskProgressNote[],
  authorId: string,
  authorType: MemberType,
): TaskProgressNote {
  const EXCERPT_LEN = 120; // 每条笔记取前 N 字作摘要
  const lines: string[] = [`## 压缩摘要（共 ${notes.length} 条笔记）`, ``];
  for (const note of notes) {
    const date = new Date(note.createdAt).toISOString().slice(0, 10);
    const excerpt = note.content.replace(/\s+/g, " ").trim().slice(0, EXCERPT_LEN);
    const suffix = note.content.length > EXCERPT_LEN ? "\u2026" : "";
    lines.push(`- **${date}** (by ${note.authorId}): ${excerpt}${suffix}`);
  }
  return {
    id: `pn-compact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content: lines.join("\n"),
    authorId,
    authorType,
    createdAt: Date.now(),
    compacted: true,
    compactedFrom: notes.length,
  };
}

/**
 * 追加进展笔记（append-only，对应 Ralph 的 progress.txt）
 *
 * 每次工作会话结束后调用，沉淀已完成的事项、发现的模式/陷阱、下步建议。
 * 内容格式为 Markdown。
 *
 * 冗余控制：笔记数超过 MAX_PROGRESS_NOTES 时，自动将最早的
 * COMPACT_BATCH_SIZE 条压缩为一条摘要，防止 json_blob 无限增长。
 *
 * 父任务冒泡：任务有 parentTaskId 时，同步向父任务写一条简短引用摘要笔记，
 * 使 Story → Feature → Epic 层级的上层节点自动积累子任务进展，
 * 无需 Agent 手动维护。冒泡只上冒一层，不递归，避免噪音放大。
 */
export async function appendProgressNote(
  req: AppendProgressNoteRequest,
): Promise<Task | undefined> {
  return _lock(async () => {
    const tasks = loadTasks();
    const task = tasks.get(req.taskId);
    if (!task) {
      return undefined;
    }

    const now = Date.now();
    const note: TaskProgressNote = {
      id: `pn-${now}-${Math.random().toString(36).slice(2, 7)}`,
      content: req.content,
      authorId: req.authorId,
      authorType: req.authorType,
      createdAt: now,
    };

    let notes = [...(task.progressNotes ?? []), note];

    // 冗余控制：超过上限时将最早的 COMPACT_BATCH_SIZE 条压缩为一条摘要
    if (notes.length > MAX_PROGRESS_NOTES) {
      const toCompact = notes.slice(0, COMPACT_BATCH_SIZE);
      const rest = notes.slice(COMPACT_BATCH_SIZE);
      const summary = compactNotes(toCompact, req.authorId, req.authorType);
      notes = [summary, ...rest];
    }

    const updatedTask: Task = {
      ...task,
      progressNotes: notes,
      updatedAt: now,
    };

    withWriteTx((stmts) => {
      stmts.upsertTask.run(taskToRow(updatedTask));
    });
    tasks.set(req.taskId, updatedTask);

    // ── AgentProgress 桥接：将笔记同步到 Agent 进化系统（pitfalls/decisions/nextSessionPlan）──
    // syncProgressNotesToAgentProgress 内部有去重保护（synced note ID 集合），可安全多次调用
    // 仅对有 assignees 的任务触发，且 AgentProgress 不存在时静默跳过（不自动创建）
    try {
      const primaryAssignee = updatedTask.assignees?.[0]?.id;
      if (primaryAssignee) {
        syncProgressNotesToAgentProgress(
          updatedTask.progressNotes ?? [],
          primaryAssignee,
          updatedTask.projectId ?? updatedTask.title,
        );
      }
    } catch {
      // 静默降级：AgentProgress 桥接失败不影响主写入路径
    }

    // ── 父任务冒泡（一层，非递归）──
    // 目的：让 Story/Feature/Epic 等上层节点自动积累子任务进展摘要，
    // 形成层次化的进展视图，无需 Agent 手动汇报。
    if (task.parentTaskId) {
      const parentTask = tasks.get(task.parentTaskId);
      if (parentTask) {
        // 提取笔记前 200 字作为冒泡摘要（避免全文复制造成父任务膨胀）
        const excerpt = req.content.slice(0, 200).replace(/\n+/g, " ");
        const bubbleContent =
          `> **[子任务进展]** \`${task.id}\` ${task.title}\n` +
          `> ${excerpt}${req.content.length > 200 ? "…" : ""}`;

        const bubbleNote: TaskProgressNote = {
          id: `pn-bubble-${now}-${Math.random().toString(36).slice(2, 7)}`,
          content: bubbleContent,
          authorId: req.authorId,
          authorType: req.authorType,
          createdAt: now,
        };

        let parentNotes = [...(parentTask.progressNotes ?? []), bubbleNote];
        if (parentNotes.length > MAX_PROGRESS_NOTES) {
          const toCompact = parentNotes.slice(0, COMPACT_BATCH_SIZE);
          const rest = parentNotes.slice(COMPACT_BATCH_SIZE);
          parentNotes = [compactNotes(toCompact, req.authorId, req.authorType), ...rest];
        }

        const updatedParent: Task = {
          ...parentTask,
          progressNotes: parentNotes,
          updatedAt: now,
        };
        withWriteTx((stmts) => {
          stmts.upsertTask.run(taskToRow(updatedParent));
        });
        tasks.set(task.parentTaskId, updatedParent);

        // 父任务也镜像写入文件（层次信息使用父任务自身的层次属性）
        if (req.workspaceDir) {
          appendNoteToWorkspaceFile({
            workspaceDir: req.workspaceDir,
            taskId: task.parentTaskId,
            taskTitle: parentTask.title,
            hierarchy: {
              epicId: parentTask.epicId,
              featureId: parentTask.featureId,
              parentTaskId: parentTask.parentTaskId,
              level: parentTask.level,
            },
            noteId: bubbleNote.id,
            content: bubbleNote.content,
            authorId: bubbleNote.authorId,
            createdAt: bubbleNote.createdAt,
          });
        }
      }
    }

    // 镜像写入项目工作空间（可选）
    // 失败时静默降级，SQLite 仍保有完整数据
    if (req.workspaceDir) {
      appendNoteToWorkspaceFile({
        workspaceDir: req.workspaceDir,
        taskId: req.taskId,
        taskTitle: req.taskTitle ?? task.title,
        // 优先使用请求中显式传入的 hierarchy，如果没有则从 task 对象自动提取
        hierarchy: req.hierarchy ?? {
          epicId: task.epicId,
          featureId: task.featureId,
          parentTaskId: task.parentTaskId,
          level: task.level,
        },
        noteId: note.id,
        content: note.content,
        authorId: note.authorId,
        createdAt: note.createdAt,
        compacted: note.compacted,
      });
    }

    return updatedTask;
  });
}

/**
 * 列出任务
 * @param filter.includeArchived - 为 true 时同时检索冷存储归档（默认 false，保持性能）
 */
export async function listTasks(
  filter?: TaskFilter & { includeArchived?: boolean },
): Promise<Task[]> {
  const tasks = loadTasks();
  let results = Array.from(tasks.values());

  if (filter?.includeArchived) {
    const archive = loadArchivedTasks();
    for (const [id, task] of archive) {
      if (!tasks.has(id)) {
        results.push(task);
      }
    }
  }

  if (!filter) {
    return results;
  }

  // 应用筛选条件
  if (filter.assigneeId) {
    // 大小写不敏感匹配：agentId 经过 normalizeAgentId 会统一转小写，
    // 但历史数据可能存了大写，用 toLowerCase 兼容两侧格式
    const filterIdLower = filter.assigneeId.toLowerCase();
    results = results.filter((task) =>
      (task.assignees ?? []).some(
        (assignee) =>
          assignee.id === filter.assigneeId || assignee.id.toLowerCase() === filterIdLower,
      ),
    );
  }

  if (filter.assigneeType) {
    results = results.filter((task) =>
      (task.assignees ?? []).some((assignee) => assignee.type === filter.assigneeType),
    );
  }

  if (filter.supervisorId) {
    const supIdLower = filter.supervisorId.toLowerCase();
    results = results.filter(
      (task) =>
        task.supervisorId === filter.supervisorId ||
        task.supervisorId?.toLowerCase() === supIdLower,
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

  // ── 层次过滤（P1 新增）──
  if (filter.level) {
    const levels = Array.isArray(filter.level) ? filter.level : [filter.level];
    results = results.filter((task) => task.level && levels.includes(task.level));
  }
  if (filter.epicId) {
    results = results.filter((task) => task.epicId === filter.epicId);
  }
  if (filter.featureId) {
    results = results.filter((task) => task.featureId === filter.featureId);
  }

  if (filter.dueDateBefore) {
    results = results.filter((task) => task.dueDate && task.dueDate < filter.dueDateBefore!);
  }

  // excludeStatus: 排除指定状态（配合 overdueOnly 使用）
  const excludeStatus = (filter as Record<string, unknown>).excludeStatus as string[] | undefined;
  if (excludeStatus && excludeStatus.length > 0) {
    results = results.filter((task) => !excludeStatus.includes(task.status));
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

  // 分页截断：
  // - first/after 是 cursor-based 分页（优先）
  // - limit 是简单截断（向后兼容）
  const pageSize = filter.first ?? filter.limit;
  if (filter.after) {
    // 找到 cursor 位置，取其之后的数据
    const cursorIdx = results.findIndex((t) => t.id === filter.after);
    if (cursorIdx >= 0) {
      results = results.slice(cursorIdx + 1);
    }
  }
  if (pageSize && pageSize > 0) {
    results = results.slice(0, pageSize);
  }

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
  return _lock(async () => {
    withWriteTx((s) => {
      s.insertComment.run({
        id: comment.id,
        task_id: comment.taskId,
        json_blob: JSON.stringify(comment),
      });
    });

    // 更新任务的最后活动时间
    const tasks = loadTasks();
    const task = tasks.get(comment.taskId);
    if (task) {
      const updatedTask = {
        ...task,
        updatedAt: Date.now(),
        timeTracking: { ...task.timeTracking, lastActivityAt: Date.now() },
      };
      withWriteTx((s) => {
        s.upsertTask.run(taskToRow(updatedTask));
      });
      tasks.set(comment.taskId, updatedTask);
    }
    return comment;
  });
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  return loadComments(taskId);
}

/**
 * 添加任务附件
 */
export async function addTaskAttachment(attachment: TaskAttachment): Promise<TaskAttachment> {
  return _lock(async () => {
    withWriteTx((s) => {
      s.insertAttachment.run({
        id: attachment.id,
        task_id: attachment.taskId,
        json_blob: JSON.stringify(attachment),
      });
    });
    return attachment;
  });
}

export async function getTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  return loadAttachments(taskId);
}

/**
 * 添加工作日志
 */
export async function addWorklog(worklog: AgentWorkLog): Promise<AgentWorkLog> {
  return _lock(async () => {
    withWriteTx((s) => {
      s.insertWorklog.run({
        id: worklog.id,
        task_id: worklog.taskId,
        json_blob: JSON.stringify(worklog),
      });
    });

    // 更新任务的时间追踪
    const tasks = loadTasks();
    const task = tasks.get(worklog.taskId);
    if (task && worklog.duration) {
      const updatedTask = {
        ...task,
        updatedAt: Date.now(),
        timeTracking: {
          ...task.timeTracking,
          timeSpent: task.timeTracking.timeSpent + worklog.duration,
          lastActivityAt: Date.now(),
        },
      };
      withWriteTx((s) => {
        s.upsertTask.run(taskToRow(updatedTask));
      });
      tasks.set(worklog.taskId, updatedTask);
    }

    return worklog;
  });
}

export async function getTaskWorklogs(taskId: string): Promise<AgentWorkLog[]> {
  return loadWorklogs(taskId);
}

/**
 * 添加任务依赖
 */
export async function addTaskDependency(dependency: TaskDependency): Promise<TaskDependency> {
  return _lock(async () => {
    withWriteTx((s) => {
      s.insertDependency.run({
        id: dependency.id,
        task_id: dependency.taskId,
        depends_on: dependency.dependsOnTaskId,
        json_blob: JSON.stringify(dependency),
      });
    });
    return dependency;
  });
}

export async function getTaskDependencies(taskId: string): Promise<TaskDependency[]> {
  return loadDependencies(taskId);
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
      return true;
    }
    if (visited.has(currentTaskId)) {
      continue;
    }
    visited.add(currentTaskId);
    const deps = loadDependencies(currentTaskId);
    for (const dep of deps) {
      if (dep.dependencyType === "blocks" || dep.dependencyType === "is-blocked-by") {
        queue.push(dep.dependsOnTaskId);
      }
    }
  }

  return false;
}

// ============================================================================
// 会议 CRUD 操作
// ============================================================================

/**
 * 创建会议
 */
export async function createMeeting(meeting: Meeting): Promise<Meeting> {
  return _lock(async () => {
    const meetings = loadMeetings();
    withWriteTx((s) => {
      s.upsertMeeting.run(meetingToRow(meeting));
    });
    meetings.set(meeting.id, meeting);
    void logMeetingCreated(meeting.id, meeting.organizerId);
    return meeting;
  });
}

export async function getMeeting(meetingId: string): Promise<Meeting | undefined> {
  const meetings = loadMeetings();
  return meetings.get(meetingId);
}

export async function updateMeeting(
  meetingId: string,
  updates: Partial<Meeting>,
): Promise<Meeting | undefined> {
  return _lock(async () => {
    const meetings = loadMeetings();
    const meeting = meetings.get(meetingId);
    if (!meeting) {
      return undefined;
    }

    const updatedMeeting = { ...meeting, ...updates, id: meetingId, updatedAt: Date.now() };
    withWriteTx((s) => {
      s.upsertMeeting.run(meetingToRow(updatedMeeting));
    });
    meetings.set(meetingId, updatedMeeting);

    void logMeetingUpdated(
      meetingId,
      ((updates as Record<string, unknown>)._actorId as string) || meeting.organizerId,
      meeting as unknown as Record<string, unknown>,
      updatedMeeting as unknown as Record<string, unknown>,
    );

    return updatedMeeting;
  });
}

export async function deleteMeeting(meetingId: string, actor?: string): Promise<boolean> {
  return _lock(async () => {
    const meetings = loadMeetings();
    const meeting = meetings.get(meetingId);
    const existed = meetings.delete(meetingId);

    if (existed) {
      withWriteTx((s) => {
        s.deleteMeeting.run(meetingId);
        s.deleteMessagesByMeeting.run(meetingId);
      });
      void logMeetingDeleted(meetingId, actor ?? meeting?.organizerId ?? "system");
    }

    return existed;
  });
}

/**
 * 列出会议
 */
export async function listMeetings(filter?: MeetingFilter): Promise<Meeting[]> {
  const meetings = loadMeetings();
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
  return _lock(async () => {
    withWriteTx((s) => {
      s.insertMessage.run({
        id: message.id,
        meeting_id: message.meetingId,
        json_blob: JSON.stringify(message),
      });
    });
    return message;
  });
}

export async function getMeetingMessages(meetingId: string): Promise<MeetingMessage[]> {
  return loadMeetingMessages(meetingId);
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
 * 清空内存缓存（用于测试或重新加载）
 */
export function clearCache(): void {
  tasksCache = null;
  tasksArchiveCache = null;
  meetingsCache = null;
  commentsCache = null;
  attachmentsCache = null;
  worklogsCache = null;
  dependenciesCache = null;
  meetingMessagesCache = null;
  // 关闭 SQLite 连接，下次请求时重建
  closeTasksDb();
}

// ============================================================================
// Epic 进度聚合（P1）
// ============================================================================

/**
 * Epic 进度摘要
 */
export interface EpicProgress {
  /** Epic 任务 ID */
  epicId: string;
  /** Epic 标题 */
  title: string;
  /** 所有子任务数 */
  totalTasks: number;
  /** 已完成子任务数（done） */
  doneTasks: number;
  /** 完成率ﾈ0-100） */
  progressPercent: number;
  /** 总 Story Points */
  totalStoryPoints: number;
  /** 已完成 Story Points */
  doneStoryPoints: number;
  /** 显示层次划分：feature/story/task 子任务统计 */
  byLevel: {
    features: { total: number; done: number };
    stories: { total: number; done: number };
    tasks: { total: number; done: number };
  };
}

/**
 * 计算 Epic 的进度（子任务完成率加权聚合）
 *
 * 算法：
 * - 直接子任务：epicId === epicTaskId
 * - 途径子任务：featureId 指向本 epic 的 feature，还没有 story 层
 * - Story Points 缺失时按 1 计算
 *
 * @param epicTaskId - Epic 任务的 ID
 * @param includeArchived - 是否包含已归档任务（默认 false）
 */
export async function calcEpicProgress(
  epicTaskId: string,
  includeArchived = false,
): Promise<EpicProgress | undefined> {
  const epic = await getTask(epicTaskId);
  if (!epic) {
    return undefined;
  }

  // 查找所有直接/间接归属此 epic 的子任务
  const children = await listTasks({ epicId: epicTaskId, includeArchived });

  const byLevel = {
    features: { total: 0, done: 0 },
    stories: { total: 0, done: 0 },
    tasks: { total: 0, done: 0 },
  };

  let totalPoints = 0;
  let donePoints = 0;

  for (const child of children) {
    const pts = child.storyPoints ?? 1;
    if (child.level === "feature") {
      byLevel.features.total++;
      if (child.status === "done") {
        byLevel.features.done++;
        donePoints += pts;
      }
    } else if (child.level === "story") {
      byLevel.stories.total++;
      if (child.status === "done") {
        byLevel.stories.done++;
        donePoints += pts;
      }
    } else {
      byLevel.tasks.total++;
      if (child.status === "done") {
        byLevel.tasks.done++;
        donePoints += pts;
      }
    }
    totalPoints += pts;
  }

  const totalTasks = children.length;
  const doneTasks = children.filter((t) => t.status === "done").length;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return {
    epicId: epicTaskId,
    title: epic.title,
    totalTasks,
    doneTasks,
    progressPercent,
    totalStoryPoints: totalPoints,
    doneStoryPoints: donePoints,
    byLevel,
  };
}

// ============================================================================
// Sprint 容量规划（P2）
// ============================================================================

/**
 * Sprint 容量计算结果
 */
export interface SprintCapacityResult {
  /** Sprint 关联的项目 ID */
  projectId: string;
  /** 包含的任务数 */
  totalTasks: number;
  /** 总负载（Story Points） */
  totalLoad: number;
  /** 按优先级分布 */
  byPriority: Record<string, { count: number; points: number }>;
  /** 负载率（负载 / 团队历史平均速度） */
  loadRate?: number;
  /** 是否超载（loadRate > 0.8） */
  overloaded: boolean;
  /** 超载预警消息 */
  warning?: string;
}

/**
 * 计算 Sprint 负载和容量并预警超载
 *
 * 业界做法（Asana Capacity Planning / Linear Cycles）：
 *   团队容量 = 历史平均速度（completedPoints / sprint）
 *   Sprint 负载 = 所有 active 任务的 storyPoints 之和
 *   负载率 = 负载 / 容量  → > 80% 预警
 *
 * @param projectId - 项目或 Sprint ID（作为过滤维度）
 * @param teamVelocityAvg - 团队历史平均速度（可选，来自 TeamVelocityRecord）
 */
export async function calcSprintCapacity(
  projectId: string,
  teamVelocityAvg?: number,
): Promise<SprintCapacityResult> {
  const activeTasks = await listTasks({
    projectId,
    status: ["todo", "in-progress", "blocked", "review"],
  });

  let totalLoad = 0;
  const byPriority: Record<string, { count: number; points: number }> = {};

  for (const task of activeTasks) {
    const pts = task.storyPoints ?? 1;
    totalLoad += pts;
    const p = task.priority;
    if (!byPriority[p]) {
      byPriority[p] = { count: 0, points: 0 };
    }
    byPriority[p].count++;
    byPriority[p].points += pts;
  }

  const loadRate = teamVelocityAvg && teamVelocityAvg > 0 ? totalLoad / teamVelocityAvg : undefined;

  const overloaded = loadRate !== undefined ? loadRate > 0.8 : false;
  let warning: string | undefined;
  if (overloaded) {
    warning = `[SprintCapacity] Project "${projectId}" is overloaded: load=${totalLoad}pts, velocity=${teamVelocityAvg}pts, rate=${(loadRate! * 100).toFixed(1)}%. Consider deferring low-priority tasks.`;
    console.warn(warning);
  }

  return {
    projectId,
    totalTasks: activeTasks.length,
    totalLoad,
    byPriority,
    loadRate,
    overloaded,
    warning,
  };
}
