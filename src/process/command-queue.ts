import { AsyncLocalStorage } from "node:async_hooks";
import { diagnosticLogger as diag, logLaneDequeue, logLaneEnqueue } from "../logging/diagnostic.js";
import { CommandLane } from "./lanes.js";
/**
 * Dedicated error type thrown when a queued command is rejected because
 * its lane was cleared.  Callers that fire-and-forget enqueued tasks can
 * catch (or ignore) this specific type to avoid unhandled-rejection noise.
 */
export class CommandLaneClearedError extends Error {
  constructor(lane?: string) {
    super(lane ? `Command lane "${lane}" cleared` : "Command lane cleared");
    this.name = "CommandLaneClearedError";
  }
}

/**
 * Dedicated error type thrown when a new command is rejected because the
 * gateway is currently draining for restart.
 */
export class GatewayDrainingError extends Error {
  constructor() {
    super("Gateway is draining for restart; new tasks are not accepted");
    this.name = "GatewayDrainingError";
  }
}

// Set while gateway is draining for restart; new enqueues are rejected.
let gatewayDraining = false;

// ─── 心跳机制 ────────────────────────────────────────────────────────────────
// 用 AsyncLocalStorage 追踪当前任务上下文，任务内任意位置可调用
// touchHeartbeat() 来告知监控器「我还活着，在等 I/O 返回」。
// 监控器依据心跳距今时长（而非总运行时长）来判断是否真正卡死。

type TaskHeartbeatContext = {
  taskId: number;
  lane: string;
};

const heartbeatStorage = new AsyncLocalStorage<TaskHeartbeatContext>();

// taskId → 上次活跃时间（由 touchHeartbeat / I/O 恢复时自动更新）
const taskHeartbeats = new Map<number, number>();

/**
 * 任务内部主动上报心跳：表示「我还在工作，不是卡死」。
 * 在耗时的 LLM 流式处理、工具调用等关键路径上调用。
 */
export function touchHeartbeat(): void {
  const ctx = heartbeatStorage.getStore();
  if (ctx) {
    taskHeartbeats.set(ctx.taskId, Date.now());
  }
}

// Minimal in-process queue to serialize command executions.
// Default lane ("main") preserves the existing behavior. Additional lanes allow
// low-risk parallelism (e.g. cron jobs) without interleaving stdin / logs for
// the main auto-reply workflow.

type QueueEntry = {
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  enqueuedAt: number;
  warnAfterMs: number;
  onWait?: (waitMs: number, queuedAhead: number) => void;
};

// 超时阈值配置（毫秒）
const TASK_INITIAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟后开始检测
const HEARTBEAT_DEAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟无心跳 → 判定卡死（LLM 单次 streaming 最慢约 5-6 分钟）
const STUCK_TASK_CHECK_INTERVAL_MS = 30 * 1000; // 30 秒巡检一次

type LaneState = {
  lane: string;
  queue: QueueEntry[];
  activeTaskIds: Set<number>;
  maxConcurrent: number;
  draining: boolean;
  generation: number;
  // 性能优化：跟踪任务开始时间，用于检测卡住的任务
  activeTaskStartTimes: Map<number, number>;
};

const lanes = new Map<string, LaneState>();
let nextTaskId = 1;

// 性能优化：启动后台超时检测器
let stuckTaskCheckInterval: NodeJS.Timeout | null = null;

function startStuckTaskMonitoring(): void {
  if (stuckTaskCheckInterval) {
    return;
  }

  stuckTaskCheckInterval = setInterval(() => {
    const now = Date.now();
    for (const [laneName, state] of lanes.entries()) {
      for (const [taskId, startTime] of state.activeTaskStartTimes.entries()) {
        const runningTime = now - startTime;
        // 只有运行超过初始阈值的任务才进入心跳检测
        if (runningTime <= TASK_INITIAL_TIMEOUT_MS) {
          continue;
        }

        const lastHeartbeat = taskHeartbeats.get(taskId) ?? startTime;
        const heartbeatAge = now - lastHeartbeat;

        if (heartbeatAge <= HEARTBEAT_DEAD_TIMEOUT_MS) {
          // 心跳新鲜：任务还在努力工作（等待 I/O 中），仅打警告日志，不干预
          diag.warn(
            `slow task detected: lane=${laneName} taskId=${taskId} runningTime=${runningTime}ms heartbeatAge=${heartbeatAge}ms - still active, waiting`,
          );
          continue;
        }

        // 心跳过期：10 分钟内无任何活动，判定为真卡死，强制释放占位
        diag.warn(
          `stuck task detected: lane=${laneName} taskId=${taskId} runningTime=${runningTime}ms heartbeatAge=${heartbeatAge}ms - forcing cleanup`,
        );
        state.activeTaskIds.delete(taskId);
        state.activeTaskStartTimes.delete(taskId);
        taskHeartbeats.delete(taskId);
        // 修复 bug：清理后必须重置 draining 标志，否则 drainLane 会直接 return
        state.draining = false;
        drainLane(laneName);
      }
    }
  }, STUCK_TASK_CHECK_INTERVAL_MS);

  // 优雅关闭时清理定时器
  process.on("SIGTERM", () => {
    if (stuckTaskCheckInterval) {
      clearInterval(stuckTaskCheckInterval);
      stuckTaskCheckInterval = null;
    }
  });
}

// 启动监控器
startStuckTaskMonitoring();

function getLaneState(lane: string): LaneState {
  const existing = lanes.get(lane);
  if (existing) {
    return existing;
  }
  const created: LaneState = {
    lane,
    queue: [],
    activeTaskIds: new Set(),
    maxConcurrent: 1,
    draining: false,
    generation: 0,
    activeTaskStartTimes: new Map(),
  };
  lanes.set(lane, created);
  return created;
}

function completeTask(state: LaneState, taskId: number, taskGeneration: number): boolean {
  if (taskGeneration !== state.generation) {
    return false;
  }
  state.activeTaskIds.delete(taskId);
  state.activeTaskStartTimes.delete(taskId);
  taskHeartbeats.delete(taskId);
  return true;
}

function drainLane(lane: string) {
  const state = getLaneState(lane);
  if (state.draining) {
    if (state.activeTaskIds.size === 0 && state.queue.length > 0) {
      diag.warn(
        `drainLane blocked: lane=${lane} draining=true active=0 queue=${state.queue.length}`,
      );
    }
    return;
  }
  state.draining = true;

  const pump = () => {
    try {
      while (state.activeTaskIds.size < state.maxConcurrent && state.queue.length > 0) {
        const entry = state.queue.shift() as QueueEntry;
        const waitedMs = Date.now() - entry.enqueuedAt;
        if (waitedMs >= entry.warnAfterMs) {
          try {
            entry.onWait?.(waitedMs, state.queue.length);
          } catch (err) {
            diag.error(`lane onWait callback failed: lane=${lane} error="${String(err)}"`);
          }
          diag.warn(
            `lane wait exceeded: lane=${lane} waitedMs=${waitedMs} queueAhead=${state.queue.length}`,
          );
        }
        logLaneDequeue(lane, waitedMs, state.queue.length);
        const taskId = nextTaskId++;
        const taskGeneration = state.generation;
        state.activeTaskIds.add(taskId);
        state.activeTaskStartTimes.set(taskId, Date.now());
        taskHeartbeats.set(taskId, Date.now()); // 初始心跳
        const heartbeatCtx: TaskHeartbeatContext = { taskId, lane };
        void (async () => {
          const startTime = Date.now();
          try {
            const result = await heartbeatStorage.run(heartbeatCtx, () => entry.task());
            const completedCurrentGeneration = completeTask(state, taskId, taskGeneration);
            if (completedCurrentGeneration) {
              diag.debug(
                `lane task done: lane=${lane} durationMs=${Date.now() - startTime} active=${state.activeTaskIds.size} queued=${state.queue.length}`,
              );
              pump();
            }
            entry.resolve(result);
          } catch (err) {
            const completedCurrentGeneration = completeTask(state, taskId, taskGeneration);
            const isProbeLane = lane.startsWith("auth-probe:") || lane.startsWith("session:probe-");
            if (!isProbeLane) {
              diag.error(
                `lane task error: lane=${lane} durationMs=${Date.now() - startTime} error="${String(err)}"`,
              );
            }
            if (completedCurrentGeneration) {
              pump();
            }
            entry.reject(err);
          }
        })();
      }
    } finally {
      state.draining = false;
    }
  };

  pump();
}

/**
 * Mark gateway as draining for restart so new enqueues fail fast with
 * `GatewayDrainingError` instead of being silently killed on shutdown.
 */
export function markGatewayDraining(): void {
  gatewayDraining = true;
}

export function setCommandLaneConcurrency(lane: string, maxConcurrent: number) {
  const cleaned = lane.trim() || CommandLane.Main;
  const state = getLaneState(cleaned);
  state.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
  drainLane(cleaned);
}

export function enqueueCommandInLane<T>(
  lane: string,
  task: () => Promise<T>,
  opts?: {
    warnAfterMs?: number;
    onWait?: (waitMs: number, queuedAhead: number) => void;
  },
): Promise<T> {
  if (gatewayDraining) {
    return Promise.reject(new GatewayDrainingError());
  }
  const cleaned = lane.trim() || CommandLane.Main;
  const warnAfterMs = opts?.warnAfterMs ?? 2_000;
  const state = getLaneState(cleaned);
  return new Promise<T>((resolve, reject) => {
    state.queue.push({
      task: () => task(),
      resolve: (value) => resolve(value as T),
      reject,
      enqueuedAt: Date.now(),
      warnAfterMs,
      onWait: opts?.onWait,
    });
    logLaneEnqueue(cleaned, state.queue.length + state.activeTaskIds.size);
    drainLane(cleaned);
  });
}

export function enqueueCommand<T>(
  task: () => Promise<T>,
  opts?: {
    warnAfterMs?: number;
    onWait?: (waitMs: number, queuedAhead: number) => void;
  },
): Promise<T> {
  return enqueueCommandInLane(CommandLane.Main, task, opts);
}

export function getQueueSize(lane: string = CommandLane.Main) {
  const resolved = lane.trim() || CommandLane.Main;
  const state = lanes.get(resolved);
  if (!state) {
    return 0;
  }
  return state.queue.length + state.activeTaskIds.size;
}

export function getTotalQueueSize() {
  let total = 0;
  for (const s of lanes.values()) {
    total += s.queue.length + s.activeTaskIds.size;
  }
  return total;
}

export function clearCommandLane(lane: string = CommandLane.Main) {
  const cleaned = lane.trim() || CommandLane.Main;
  const state = lanes.get(cleaned);
  if (!state) {
    return 0;
  }
  const removed = state.queue.length;
  const pending = state.queue.splice(0);
  for (const entry of pending) {
    entry.reject(new CommandLaneClearedError(cleaned));
  }
  return removed;
}

/**
 * Reset all lane runtime state to idle. Used after SIGUSR1 in-process
 * restarts where interrupted tasks' finally blocks may not run, leaving
 * stale active task IDs that permanently block new work from draining.
 *
 * Bumps lane generation and clears execution counters so stale completions
 * from old in-flight tasks are ignored. Queued entries are intentionally
 * preserved — they represent pending user work that should still execute
 * after restart.
 *
 * After resetting, drains any lanes that still have queued entries so
 * preserved work is pumped immediately rather than waiting for a future
 * `enqueueCommandInLane()` call (which may never come).
 */
export function resetAllLanes(): void {
  gatewayDraining = false;
  const lanesToDrain: string[] = [];
  for (const state of lanes.values()) {
    state.generation += 1;
    state.activeTaskIds.clear();
    state.activeTaskStartTimes.clear();
    state.draining = false;
    if (state.queue.length > 0) {
      lanesToDrain.push(state.lane);
    }
  }
  taskHeartbeats.clear();
  // Drain after the full reset pass so all lanes are in a clean state first.
  for (const lane of lanesToDrain) {
    drainLane(lane);
  }
}

/**
 * Returns the total number of actively executing tasks across all lanes
 * (excludes queued-but-not-started entries).
 */
export function getActiveTaskCount(): number {
  let total = 0;
  for (const s of lanes.values()) {
    total += s.activeTaskIds.size;
  }
  return total;
}

/**
 * Wait for all currently active tasks across all lanes to finish.
 * Polls at a short interval; resolves when no tasks are active or
 * when `timeoutMs` elapses (whichever comes first).
 *
 * New tasks enqueued after this call are ignored — only tasks that are
 * already executing are waited on.
 */
export function waitForActiveTasks(timeoutMs: number): Promise<{ drained: boolean }> {
  // Keep shutdown/drain checks responsive without busy looping.
  const POLL_INTERVAL_MS = 50;
  const deadline = Date.now() + timeoutMs;
  const activeAtStart = new Set<number>();
  for (const state of lanes.values()) {
    for (const taskId of state.activeTaskIds) {
      activeAtStart.add(taskId);
    }
  }

  return new Promise((resolve) => {
    const check = () => {
      if (activeAtStart.size === 0) {
        resolve({ drained: true });
        return;
      }

      let hasPending = false;
      for (const state of lanes.values()) {
        for (const taskId of state.activeTaskIds) {
          if (activeAtStart.has(taskId)) {
            hasPending = true;
            break;
          }
        }
        if (hasPending) {
          break;
        }
      }

      if (!hasPending) {
        resolve({ drained: true });
        return;
      }
      if (Date.now() >= deadline) {
        resolve({ drained: false });
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  });
}
