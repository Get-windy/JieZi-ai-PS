/**
 * 任务阈值持久化配置 + 自适应调整引擎
 *
 * ## 设计目标
 *   1. 提供基于业界实践的初始阈值配置文件（JSON），可由用户手工编辑
 *   2. 系统运行时自动收集实际执行数据（任务完成速率、队列空闲时长等）
 *   3. 每天（可配置）运行一次自适应算法，将阈值调整到更贴近实际负载的水平
 *   4. 所有调整均受人工设定的上下界约束，防止阈值飘走
 *
 * ## 初始值参考依据
 *   - Spotify Squad Model: 每位 engineer 保持 2-3 条在途任务（WIP limit）
 *   - Kanban 实践 (LKU 2023): 每人 WIP≤2，todo buffer≥1.5×WIP
 *   - Microsoft AutoGen GroupChatManager: worker buffer min=1
 *   - Hermes v0.9 FlowControl: minBuffer=1（开发）、minBuffer=2（高压阶段）
 *   - 人类项目实践: 一线开发在 sprint 活跃期平均 todo buffer 2.1 条
 *
 * ## 自适应算法
 *   采用 EWMA（指数加权移动平均）平滑：
 *     newThreshold = round(α × observedAvgTodo + (1 - α) × currentThreshold)
 *   其中 α = 0.2（偏向历史，防止瞬间波动引发大幅调整）
 *   结合 90 天滚动窗口数据，低于最小样本数（30次）时不调整。
 *
 * ## 文件路径
 *   $OPENCLAW_STATE_DIR/tasks/task-thresholds.json
 *   (默认: ~/.openclaw/tasks/task-thresholds.json)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "../../upstream/src/config/paths.js";
import {
  type AgentPhaseThreshold,
  PHASE_TASK_THRESHOLD_MAP,
  registerThresholdLookup,
} from "../utils/project-context.js";

// ============================================================================
// 常量
// ============================================================================

const TASKS_DIR = join(STATE_DIR, "tasks");
const THRESHOLD_CONFIG_PATH = join(TASKS_DIR, "task-thresholds.json");

/** EWMA 平滑系数（0~1，越小越保守） */
const EWMA_ALPHA = 0.2;

/** 触发调整所需的最小历史样本数 */
const MIN_SAMPLES_FOR_ADAPT = 30;

/** 允许自适应调整的最大幅度（每次调整 minTodo 不超过此值） */
const MAX_ADJUST_STEP = 1;

/** 每个角色的全局硬性上下界 */
const GLOBAL_BOUNDS: Record<string, { min: number; max: number }> = {
  "team-member":     { min: 1, max: 5 },
  "qa-lead":         { min: 1, max: 4 },
  "devops-engineer": { min: 1, max: 3 },
  "doc-writer":      { min: 1, max: 3 },
  "product-analyst": { min: 1, max: 4 },
  coordinator:       { min: 1, max: 3 },
  "*":               { min: 0, max: 4 },
};

// ============================================================================
// 类型定义
// ============================================================================

/** 单个角色在某阶段的阈值记录（含学习元数据） */
export interface ThresholdEntry extends AgentPhaseThreshold {
  /** 人工固定：true 时跳过自适应调整 */
  pinned?: boolean;
  /** 元数据：自适应引擎写入，不影响运行逻辑 */
  _meta?: {
    /** 上次自适应调整时间（ms） */
    lastAdaptedAt?: number;
    /** 用于本次 EWMA 计算的历史观测均值 */
    observedAvgTodo?: number;
    /** 纳入计算的样本数 */
    sampleCount?: number;
    /** 上次调整前的值 */
    previousMinTodo?: number;
  };
}

/** 完整配置文件结构 */
export interface ThresholdConfig {
  /** 配置文件版本，用于未来迁移 */
  version: number;
  /** 配置说明（可由用户自由编辑） */
  description?: string;
  /** 上次自适应调整时间（ms） */
  lastAdaptedAt?: number;
  /**
   * 阶段 × 角色 阈值表
   * 格式与 PHASE_TASK_THRESHOLD_MAP 一致，但含持久化 + 学习元数据
   */
  phases: Record<string, Record<string, ThresholdEntry>>;
}

// ============================================================================
// 观测数据收集（内存级，进程重启后重置，本轮数据足够用）
// ============================================================================

/**
 * 观测记录：每次低水位扫描时写入
 * key = `${phase}:${agentRole}`
 * value = 该 key 当次 todo 数量列表
 */
const _observations = new Map<string, number[]>();

/**
 * 记录一次 todo 水位观测
 * 由 agent-task-wake-scheduler.ts 的低水位扫描循环调用
 */
export function recordTodoObservation(
  projectPhase: string | undefined,
  agentRole: string,
  todoCount: number,
): void {
  if (!projectPhase) return;
  const key = `${projectPhase}:${agentRole}`;
  const arr = _observations.get(key) ?? [];
  arr.push(todoCount);
  // 限制内存：每个 key 最多保留 200 条
  if (arr.length > 200) arr.splice(0, arr.length - 200);
  _observations.set(key, arr);
}

// ============================================================================
// 配置文件读写
// ============================================================================

let _configCache: ThresholdConfig | null = null;
let _configCacheLoadedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟内不重新读文件

/**
 * 生成初始配置（首次运行时写入文件）
 *
 * 初始值完全来自 PHASE_TASK_THRESHOLD_MAP 硬编码表，
 * 同时加入 description 和版本号，方便用户手工编辑。
 */
function buildInitialConfig(): ThresholdConfig {
  const phases: Record<string, Record<string, ThresholdEntry>> = {};
  for (const [phase, roleMap] of Object.entries(PHASE_TASK_THRESHOLD_MAP)) {
    phases[phase] = {};
    for (const [role, thr] of Object.entries(roleMap)) {
      phases[phase][role] = { ...thr };
    }
  }
  return {
    version: 1,
    description:
      "任务阈值配置文件 — 由系统自动生成，可手工编辑。\n" +
      "字段说明：minTodo=最小待办任务数，required=是否强制要求，allowIdle=是否允许完全空闲。\n" +
      "pinned=true 可固定某条配置，阻止自适应引擎修改。\n" +
      "初始值参考：Spotify Squad Model / Kanban LKU 2023 / Microsoft AutoGen / Hermes v0.9。",
    phases,
  };
}

/** 确保目录存在 */
function ensureDir(): void {
  if (!existsSync(TASKS_DIR)) {
    mkdirSync(TASKS_DIR, { recursive: true, mode: 0o700 });
  }
}

/** 读取配置文件，不存在时自动生成 */
export function loadThresholdConfig(forceRefresh = false): ThresholdConfig {
  const now = Date.now();
  if (!forceRefresh && _configCache && now - _configCacheLoadedAt < CONFIG_CACHE_TTL_MS) {
    return _configCache;
  }

  ensureDir();

  if (!existsSync(THRESHOLD_CONFIG_PATH)) {
    const initial = buildInitialConfig();
    saveThresholdConfig(initial);
    _configCache = initial;
    _configCacheLoadedAt = now;
    console.log(`[ThresholdConfig] Created initial config at ${THRESHOLD_CONFIG_PATH}`);
    return initial;
  }

  try {
    const raw = readFileSync(THRESHOLD_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as ThresholdConfig;
    // 合并新增阶段（硬编码中有但配置文件中没有的）
    const merged = mergeWithDefaults(parsed);
    _configCache = merged;
    _configCacheLoadedAt = now;
    return merged;
  } catch (err) {
    console.warn(
      `[ThresholdConfig] Failed to parse ${THRESHOLD_CONFIG_PATH}: ${String(err)}. Using defaults.`,
    );
    const fallback = buildInitialConfig();
    _configCache = fallback;
    _configCacheLoadedAt = now;
    return fallback;
  }
}

/** 保存配置文件 */
export function saveThresholdConfig(config: ThresholdConfig): void {
  ensureDir();
  try {
    writeFileSync(THRESHOLD_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
    _configCache = config;
    _configCacheLoadedAt = Date.now();
  } catch (err) {
    console.warn(`[ThresholdConfig] Failed to save config: ${String(err)}`);
  }
}

/**
 * 合并：将硬编码中存在但配置文件中缺失的阶段/角色补入
 * 保留用户手工修改的值
 */
function mergeWithDefaults(existing: ThresholdConfig): ThresholdConfig {
  const defaults = buildInitialConfig();
  let dirty = false;

  for (const [phase, roleMap] of Object.entries(defaults.phases)) {
    if (!existing.phases[phase]) {
      existing.phases[phase] = roleMap;
      dirty = true;
    } else {
      for (const [role, thr] of Object.entries(roleMap)) {
        if (!existing.phases[phase][role]) {
          existing.phases[phase][role] = thr;
          dirty = true;
        }
      }
    }
  }

  if (dirty) {
    saveThresholdConfig(existing);
  }
  return existing;
}

// ============================================================================
// 缺失配置通知机制
// ============================================================================

/**
 * 缺失记录：phase:role → 首次发现时间（ms）
 * 防止同一缺失条目重复通知（每 24h 通知一次）
 */
const _missingConfigNotifiedAt = new Map<string, number>();
const MISSING_NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h 冷却

/**
 * 外部注册的通知回调，由调度器注入
 * 参数：message 消息内容，contextKey 去重 key
 */
let _missingNotifyFn:
  | ((message: string, contextKey: string) => void)
  | null = null;

/**
 * 由调度器（agent-task-wake-scheduler.ts）在启动时注册，
 * 将 enqueueSystemEvent + requestHeartbeatNow 能力注入进来
 */
export function registerMissingThresholdNotifier(
  fn: (message: string, contextKey: string) => void,
): void {
  _missingNotifyFn = fn;
}

/**
 * 当 lookupThreshold 查不到配置时，通知主控 agent 补充
 * 内部有 24h 冷却，同一 phase:role 不重复轰炸
 */
function notifyMissingThreshold(projectPhase: string, agentRole: string): void {
  if (!_missingNotifyFn) return;
  const key = `${projectPhase}:${agentRole}`;
  const now = Date.now();
  const lastAt = _missingConfigNotifiedAt.get(key);
  if (lastAt && now - lastAt < MISSING_NOTIFY_COOLDOWN_MS) return;
  _missingConfigNotifiedAt.set(key, now);

  const msg = [
    `[THRESHOLD CONFIG MISSING] 检测到缺失的阶段阈值配置，需要主控 agent 补充`,
    ``,
    `缺失条目：项目阶段="${projectPhase}"，角色/AgentID="${agentRole}"`,
    `当前已回退到系统默认阈值（minTodo=1，required=false，allowIdle=false）`,
    ``,
    `请执行以下操作之一：`,
    `  1. 手工编辑配置文件 task-thresholds.json，添加 phases["${projectPhase}"]["${agentRole}"] 条目`,
    `  2. 或在 phases["${projectPhase}"]["*"] 设置该阶段的通配符默认值`,
    `  3. 若该阶段本不需要此角色有任务，可设置 allowIdle=true 以消除本告警`,
    ``,
    `配置文件路径：$OPENCLAW_STATE_DIR/tasks/task-thresholds.json`,
  ].join("\n");

  try {
    _missingNotifyFn(msg, `threshold:missing:${key}`);
    console.warn(`[ThresholdConfig] Missing config notified: ${key}`);
  } catch {
    // 通知失败不影响主流程
  }
}


/**
 * 从配置文件中查询阈值，fallback 到 PHASE_TASK_THRESHOLD_MAP
 *
 * 匹配优先级：
 *   1. phases[phase][agentRole] 精确匹配
 *   2. phases[phase][key] 其中 agentRole.startsWith(key)（前缀匹配）
 *   3. phases[phase]["*"] 阶段通配符
 *   4. 硬编码 DEFAULT_THRESHOLD
 */
export function lookupThreshold(
  projectPhase: string | undefined,
  agentRole: string,
): AgentPhaseThreshold | undefined {
  if (!projectPhase) return undefined;

  try {
    const cfg = loadThresholdConfig();
    const phaseMap = cfg.phases[projectPhase];
    if (!phaseMap) {
      // 配置文件中没有此阶段，通知主控补充
      notifyMissingThreshold(projectPhase, agentRole);
      return undefined;
    }

    // 精确匹配
    const exact = phaseMap[agentRole];
    if (exact) return stripMeta(exact);

    // 前缀匹配
    for (const key of Object.keys(phaseMap)) {
      if (key !== "*" && agentRole.startsWith(key)) {
        return stripMeta(phaseMap[key]!);
      }
    }

    // 通配符（用于未知角色，不触发漏配通知）
    if (phaseMap["*"]) return stripMeta(phaseMap["*"]);

    // 匹配到阶段下无对应角色且无通配符：通知主控补充角色配置
    notifyMissingThreshold(projectPhase, agentRole);
    return undefined;
  } catch {
    return undefined;
  }
}

function stripMeta(entry: ThresholdEntry): AgentPhaseThreshold {
  return {
    minTodo: entry.minTodo,
    required: entry.required,
    allowIdle: entry.allowIdle,
  };
}

// ============================================================================
// 自适应调整引擎
// ============================================================================

/** 防重入标记 */
let _adaptRunning = false;
/** 上次运行时间 */
let _lastAdaptAt = 0;
/** 自适应最短间隔：24 小时 */
const ADAPT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 自适应阈值调整
 *
 * 策略：
 *   - 对每个 phase:role 组合收集本轮（进程内）的 todo 水位观测
 *   - 计算 observedAvgTodo（观测平均值）
 *   - 用 EWMA 融合历史值：newMinTodo = α × observedAvg + (1-α) × currentMinTodo
 *   - 四舍五入到整数，且受全局 bounds 约束
 *   - pinned=true 的条目跳过
 *   - 样本不足 MIN_SAMPLES_FOR_ADAPT 的跳过
 *
 * 调用时机：每天运行一次（由 agent-task-wake-scheduler.ts 计时触发）
 */
export async function adaptThresholds(): Promise<{
  adjusted: number;
  skipped: number;
  details: string[];
}> {
  if (_adaptRunning) return { adjusted: 0, skipped: 0, details: ["[skip] already running"] };
  const now = Date.now();
  if (now - _lastAdaptAt < ADAPT_INTERVAL_MS) {
    return { adjusted: 0, skipped: 0, details: ["[skip] interval not reached"] };
  }

  _adaptRunning = true;
  _lastAdaptAt = now;

  const stats = { adjusted: 0, skipped: 0, details: [] as string[] };

  try {
    const cfg = loadThresholdConfig(true); // 强制刷新
    let dirty = false;

    for (const [key, observations] of _observations.entries()) {
      if (observations.length < MIN_SAMPLES_FOR_ADAPT) {
        stats.skipped++;
        continue;
      }

      const [phase, ...roleParts] = key.split(":");
      const role = roleParts.join(":");
      if (!phase || !role) continue;

      const phaseMap = cfg.phases[phase];
      if (!phaseMap) continue;

      // 找到配置项（精确或前缀）
      let configKey: string | undefined;
      if (phaseMap[role]) {
        configKey = role;
      } else {
        for (const k of Object.keys(phaseMap)) {
          if (k !== "*" && role.startsWith(k)) {
            configKey = k;
            break;
          }
        }
        if (!configKey && phaseMap["*"]) configKey = "*";
      }
      if (!configKey) continue;

      const entry = phaseMap[configKey]!;

      // pinned 跳过
      if (entry.pinned) {
        stats.skipped++;
        continue;
      }

      // 计算观测均值（只取最后 90 条防止太旧数据影响）
      const recentObs = observations.slice(-90);
      const observedAvg = recentObs.reduce((a, b) => a + b, 0) / recentObs.length;

      // EWMA 融合
      const rawNew = EWMA_ALPHA * observedAvg + (1 - EWMA_ALPHA) * entry.minTodo;
      let newMinTodo = Math.round(rawNew);

      // 限制单次调整幅度
      const delta = newMinTodo - entry.minTodo;
      if (Math.abs(delta) > MAX_ADJUST_STEP) {
        newMinTodo = entry.minTodo + Math.sign(delta) * MAX_ADJUST_STEP;
      }

      // 全局 bounds 约束
      const bounds = GLOBAL_BOUNDS[configKey] ?? GLOBAL_BOUNDS["*"]!;
      newMinTodo = Math.max(bounds.min, Math.min(bounds.max, newMinTodo));

      if (newMinTodo === entry.minTodo) {
        stats.skipped++;
        continue;
      }

      const prev = entry.minTodo;
      entry.minTodo = newMinTodo;
      entry._meta = {
        lastAdaptedAt: now,
        observedAvgTodo: Math.round(observedAvg * 100) / 100,
        sampleCount: recentObs.length,
        previousMinTodo: prev,
      };
      dirty = true;
      stats.adjusted++;
      stats.details.push(
        `[adapt] ${phase}:${configKey} minTodo ${prev}→${newMinTodo} (observedAvg=${observedAvg.toFixed(2)}, n=${recentObs.length})`,
      );
    }

    if (dirty) {
      cfg.lastAdaptedAt = now;
      saveThresholdConfig(cfg);
      console.log(
        `[ThresholdConfig] Adapted ${stats.adjusted} threshold(s): ${stats.details.join("; ")}`,
      );
    }
  } finally {
    _adaptRunning = false;
  }

  return stats;
}

/**
 * 获取配置摘要（供 supervisor / admin 查询使用）
 */
export function getThresholdConfigSummary(): {
  configPath: string;
  lastAdaptedAt: string | null;
  totalEntries: number;
  pinnedEntries: number;
  phases: string[];
} {
  const cfg = loadThresholdConfig();
  let totalEntries = 0;
  let pinnedEntries = 0;

  for (const roleMap of Object.values(cfg.phases)) {
    for (const entry of Object.values(roleMap)) {
      totalEntries++;
      if (entry.pinned) pinnedEntries++;
    }
  }

  return {
    configPath: THRESHOLD_CONFIG_PATH,
    lastAdaptedAt: cfg.lastAdaptedAt ? new Date(cfg.lastAdaptedAt).toISOString() : null,
    totalEntries,
    pinnedEntries,
    phases: Object.keys(cfg.phases),
  };
}

// ============================================================================
// 模块初始化：自动将 lookupThreshold 注入 project-context.ts
// 必须放在文件末尾（所有函数定义完成后）
// ============================================================================
registerThresholdLookup(lookupThreshold);
