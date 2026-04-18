/**
 * 主控仪表盘快照（Leader Context Snapshot）
 *
 * 设计原则（参考 Claude Code 泄露源码 + Codex CLI 最佳实践）：
 *
 * 1. 主控是「指挥官」而非「秘书」：只看地图（指针索引），不存档全量历史
 * 2. 状态外置：子 agent 状态写入 task storage，主控被唤醒时重新读取快照，
 *    而不是靠堆积的 [TASK REPORT] / [ALERT] 消息来感知状态
 * 3. 快照替换：每次唤醒注入一份当前状态的「仪表盘快照」，替代追加历史消息
 * 4. 上下文预算：快照总长度严格控制在 MAX_SNAPSHOT_CHARS 以内
 *
 * 触发时机：
 * - 任何子 agent 完成任务并通知主控时（agent.task.report）
 * - 调度器检测到 agent 超时/重置/低水位时
 * - compaction 后主控 session 恢复
 */

import { loadConfig } from "../../upstream/src/config/config.js";
import {
  loadSessionStore,
  resolveAgentMainSessionKey,
  resolveStorePath,
} from "../../upstream/src/config/sessions.js";
import { requestHeartbeatNow } from "../../upstream/src/infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../upstream/src/infra/system-events.js";
import { normalizeAgentId } from "../routing/session-key.js";
import * as taskStorage from "../tasks/storage.js";
import { listAgentIds } from "./agent-scope.js";

// ─── 快照尺寸预算 ────────────────────────────────────────────────────────────
// 严格控制注入主控上下文的字符数，防止单次注入撑爆上下文窗口
// Claude Code AutoCompact 预留 13K token buffer，我们以 char 估算（1 token ≈ 4 chars）
// 整份快照不超过 4K token = 16,000 chars
const MAX_SNAPSHOT_CHARS = 16_000;
// 每条任务行最多显示的字符（标题截断）
const MAX_TASK_TITLE_CHARS = 50;
// 每个 agent 最多展示 in-progress 任务数
const MAX_IN_PROGRESS_PER_AGENT = 2;
// 最多展示异常 agent 数（blocked / stuck）
const MAX_ALERT_AGENTS = 8;
// 全局 todo 积压预警阈值
const BACKLOG_WARN_THRESHOLD = 5;

/**
 * Validation Gate 阈值（借鉴 Praetorian Platform 确定性 Hook 模式）：
 * 主控收到 task_blocked 快照后，若超过此时间仍未调用 triage 处理阻塞任务，
 * 系统在下次仪表盘快照中将该任务从普通告警升级为「强制处理项」
 *
 * 业界依据：Augment Code Supervisor Pattern — "Output validation gates:
 * evaluates outcomes before any output advances the workflow"
 */
const BLOCKED_ESCALATION_THRESHOLD_MS = 30 * 60 * 1_000; // 30 分钟未处理 → 升级
const BLOCKED_CRITICAL_THRESHOLD_MS = 2 * 60 * 60 * 1_000; // 2 小时未处理 → 危急

// ─── 快照缓存（防止同一批事件多次重建快照）────────────────────────────────────
// 使用 agentId+时间戳 做 debounce，2s 内同一主控只生成一次快照
const snapshotDebounceMs = 2_000;
const lastSnapshotAtMap = new Map<string, number>();

export type LeaderWakeReason =
  | { type: "task_done"; taskId: string; reporterId: string; summary: string }
  | {
      type: "task_blocked";
      taskId: string;
      reporterId: string;
      errorMsg: string;
      /** 任务标题（供快照详情区展示，无需主控再查） */
      taskTitle?: string;
      /** 最近 worklog 条目（已在上报侧读取，注入快照作为证据链） */
      recentWorklogs?: Array<{
        action: string;
        details: string;
        result: string;
        createdAt: number;
      }>;
      /**
       * 快照派发时间戳 — Validation Gate 后置验证所需
       * 若主控收到快照后超过阈值时间尚未处理，下次快照中会升级告警
       * （将在下一次构建快照时从 task metadata.snapshotSentAt 读取）
       */
      priorSnapshotSentAt?: number;
    }
  | {
      type: "dep_blocked";
      taskId: string;
      taskTitle: string;
      agentId: string;
      blockedBy: Array<{ id: string; title: string; priority: string; assigneeId?: string }>;
    }
  | { type: "task_timeout"; agentId: string; taskId: string; stuckMinutes: number }
  | { type: "task_reset"; agentId: string; taskId: string; stuckMinutes: number }
  | { type: "low_watermark"; agentId: string; todoCount: number; minTodo: number }
  | { type: "kpi_reassign"; taskId: string; fromAgent: string; toAgent: string }
  | { type: "overdue"; taskId: string; title: string; overdueMinutes: number }
  | { type: "backlog"; agentId: string; queueSize: number }
  | { type: "compaction_restore" }
  /**
   * 幻觉防护 — 空闲疑似幻觉告警
   * 当 in-progress 任务超过 30 分钟无任何 worklog 记录时触发，
   * 提示主控该 agent 可能产生工具执行幻觉（假报进展但未实际操作）
   */
  | {
      type: "suspicion_idle";
      agentId: string;
      taskId: string;
      taskTitle: string;
      idleMinutes: number; // 距上次 worklog 或 startedAt 已过去的分钟数
      lastWorklogAt: number | null; // 最后一次 worklog 时间戳（null=从未记录）
    }
  /**
   * 幻觉防护 — 空 worklog 完成报告被系统降级
   * agent 试图以 done 汇报但 worklog 为空，系统拒绝并降为 review
   */
  | {
      type: "hallucination_suspected";
      agentId: string;
      taskId: string;
      taskTitle: string;
      reason: string; // 拒绝原因描述
    };

/**
 * 构建并注入主控仪表盘快照
 *
 * 替代原来的多行 enqueueSystemEvent 散射，统一走此函数：
 * - 从 task storage 实时读取状态（而非依赖历史消息）
 * - 生成一份结构化但紧凑的快照（预算 ≤ 16K chars）
 * - 通过 contextKey 去重（同一 contextKey 不重复注入）
 * - debounce 2s 防止批量事件引发多次快照重建
 */
export async function injectLeaderSnapshot(params: {
  leaderId: string;
  wakeReason: LeaderWakeReason;
  coalesceMs?: number;
}): Promise<boolean> {
  const { leaderId, wakeReason, coalesceMs = 5_000 } = params;
  const normalizedLeader = normalizeAgentId(leaderId);

  // 校验 leader 存在
  const cfg = loadConfig();
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(normalizedLeader)) {
    return false;
  }

  // debounce：2s 内同一主控不重复构建快照（除非是 compaction_restore）
  if (wakeReason.type !== "compaction_restore") {
    const lastAt = lastSnapshotAtMap.get(normalizedLeader) ?? 0;
    if (Date.now() - lastAt < snapshotDebounceMs) {
      // 仍然触发心跳唤醒，只是不重建快照
      requestHeartbeatNow({
        reason: buildContextKey(wakeReason),
        sessionKey: `agent:${normalizedLeader}:main`,
        agentId: normalizedLeader,
        coalesceMs,
      });
      return true;
    }
  }
  lastSnapshotAtMap.set(normalizedLeader, Date.now());

  try {
    // 从 session store 读取主控连续无操作次数，注入快照让主控自我感知
    // 业界最佳实践（LangGraph interrupt_count）：在 state 中携带连续中断次数，LLM 能意识到自己反复无操作
    let noActionCount = 0;
    try {
      const cfg2 = loadConfig();
      const storePath2 = resolveStorePath(cfg2);
      const sessionKey2 = resolveAgentMainSessionKey({ cfg: cfg2, agentId: normalizedLeader });
      const store2 = loadSessionStore(storePath2);
      const entry2 = store2[sessionKey2];
      const raw = (entry2 as Record<string, unknown> | undefined)?.noActionCount;
      if (typeof raw === "number" && raw > 0) {
        noActionCount = raw;
      }
    } catch {
      // 读取失败静默，不影响快照生成
    }

    const snapshot = await buildLeaderSnapshot(normalizedLeader, wakeReason, noActionCount);
    if (!snapshot) {
      return false;
    }

    const leaderSession = `agent:${normalizedLeader}:main`;
    const contextKey = buildContextKey(wakeReason);

    enqueueSystemEvent(snapshot, {
      sessionKey: leaderSession,
      contextKey,
    });
    requestHeartbeatNow({
      reason: contextKey,
      sessionKey: leaderSession,
      agentId: normalizedLeader,
      coalesceMs,
    });

    return true;
  } catch (err) {
    console.warn(
      `[leader-snapshot] Failed to build snapshot for ${normalizedLeader}: ${String(err)}`,
    );
    return false;
  }
}

// ─── 快照构建核心 ─────────────────────────────────────────────────────────────

async function buildLeaderSnapshot(
  leaderId: string,
  wakeReason: LeaderWakeReason,
  noActionCount = 0,
): Promise<string | null> {
  // === 1. 读取触发事件的单行摘要（置顶，让主控第一眼看到触发原因）===
  const triggerLine = buildTriggerLine(wakeReason);

  // === 2. 读取所有 agent 的任务状态（仅读指标，不展开详情）===
  const cfg = loadConfig();
  const agentIds = listAgentIds(cfg).map(normalizeAgentId);

  const agentRows: string[] = [];
  const alertRows: string[] = [];
  let totalInProgress = 0;
  let totalTodo = 0;
  let totalBlocked = 0;

  for (const agentId of agentIds) {
    try {
      const [inProgress, todo, blocked] = await Promise.all([
        taskStorage.listTasks({ assigneeId: agentId, status: ["in-progress"] }),
        taskStorage.listTasks({ assigneeId: agentId, status: ["todo"] }),
        taskStorage.listTasks({ assigneeId: agentId, status: ["blocked"] }),
      ]);

      totalInProgress += inProgress.length;
      totalTodo += todo.length;
      totalBlocked += blocked.length;

      // 只显示有活跃任务的 agent
      if (inProgress.length === 0 && todo.length === 0 && blocked.length === 0) {
        continue;
      }

      // 每个 agent 一行摘要
      const statusParts: string[] = [];
      if (inProgress.length > 0) {
        // 带 projectId 标注：让主控明确区分各任务属于哪个项目，避免跨项目变更被归纳合并
        const titles = inProgress
          .slice(0, MAX_IN_PROGRESS_PER_AGENT)
          .map((t) => {
            const projTag = t.projectId ? `[${t.projectId}] ` : "";
            return `"${projTag}${t.title.slice(0, MAX_TASK_TITLE_CHARS)}"`;
          })
          .join(", ");
        statusParts.push(
          `🔵 ${inProgress.length}进行中: ${titles}${inProgress.length > MAX_IN_PROGRESS_PER_AGENT ? "…" : ""}`,
        );
      }
      if (blocked.length > 0) {
        statusParts.push(`🔴 ${blocked.length}阻塞`);
        // 阻塞任务加入告警区（带 projectId + blockReason + 阻塞时长升级标识）
        if (alertRows.length < MAX_ALERT_AGENTS) {
          const bt = blocked[0];
          const projTag = bt.projectId ? `[${bt.projectId}] ` : "";
          // 优先读取 blockReason（agent 上报阻塞时写入的具体原因）
          const blockReason =
            typeof bt.metadata?.blockReason === "string" && bt.metadata.blockReason
              ? ` | 阻塞原因: ${bt.metadata.blockReason.slice(0, 60)}`
              : "";
          // Validation Gate 升级逻辑：检查 snapshotSentAt 判断主控是否长时间欠健处理
          // 借鉴 Praetorian Platform 确定性 Hook 模式：Validation 在 LLM 上下文外强制执行
          const snapshotSentAt =
            typeof bt.metadata?.snapshotSentAt === "number" ? bt.metadata.snapshotSentAt : null;
          const now2 = Date.now();
          let escalationTag = "";
          let blockAgeStr = "";
          if (snapshotSentAt) {
            const ageMs = now2 - snapshotSentAt;
            const ageMin = Math.floor(ageMs / 60_000);
            if (ageMs >= BLOCKED_CRITICAL_THRESHOLD_MS) {
              escalationTag = ` ⛔[危急未处理 ${ageMin}min]`;
            } else if (ageMs >= BLOCKED_ESCALATION_THRESHOLD_MS) {
              escalationTag = ` 🚨[超时未处理 ${ageMin}min]`;
            } else {
              blockAgeStr = ` (快照已发出 ${ageMin}min前)`;
            }
          }
          alertRows.push(
            `  ${escalationTag || "⚠️"} ${agentId} blocked ${projTag}[${bt.id}] "${bt.title.slice(0, MAX_TASK_TITLE_CHARS)}"${blockReason}${blockAgeStr}${escalationTag ? " — 必须立即调用 agent.task.triage 处理" : " — use agent.task.triage to resolve"}`,
          );
        }
      }
      if (todo.length > 0) {
        statusParts.push(`⚪ ${todo.length}待办`);
      }

      agentRows.push(`  ${agentId}: ${statusParts.join(" | ")}`);

      // 积压预警
      if (todo.length >= BACKLOG_WARN_THRESHOLD && alertRows.length < MAX_ALERT_AGENTS) {
        alertRows.push(`  📥 ${agentId} backlog=${todo.length} — consider reassigning`);
      }
    } catch {
      // 单个 agent 查询失败不影响其他
    }
  }

  // === 3. 组装快照 ===
  const lines: string[] = [];

  // 触发原因（单行，必须置顶）
  // 若有连续无操作历史，在标题行用醒目标记提示主控自我感知（LangGraph interrupt_count 模式）
  const noActionBadge =
    noActionCount >= 3
      ? ` ⛔[你已连续 ${noActionCount} 次只汇报未操作 — 系统强制要求立即行动]`
      : noActionCount === 2
        ? ` 🚨[上次心跳仍无工具调用，共 2 次 — 请立即处理]`
        : noActionCount === 1
          ? ` ⚠️[上次心跳无工具操作]`
          : "";
  lines.push(
    `[LEADER DASHBOARD] ${new Date().toLocaleTimeString()} — ${triggerLine}${noActionBadge}`,
  );
  lines.push("");
  // 必题规则：跟踪各项目独立标注，禁止将不同项目的变更合并描述
  lines.push(
    "⚠️ 注意：每个任务均已标注所属项目 ID（[projectId]）。汇报时必须按项目独立描述，禁止以「与XX项目共享相同变更」代替具体内容。",
  );
  lines.push(
    "⚠️ 项目隔离规则：处理 A 项目的任务时，不得将 B 项目的情况混入回复。每个项目的业务空间（codeDir）和项目空间均相互独立。",
  );
  lines.push("");

  // ── 幻觉防护告警块（suspicion_idle / hallucination_suspected）──
  if (wakeReason.type === "suspicion_idle") {
    lines.push(
      `🕵️ 幻觉预警 — Agent [${wakeReason.agentId}] 执行任务 [${wakeReason.taskId}] "${wakeReason.taskTitle.slice(0, 50)}" 已 ${wakeReason.idleMinutes} 分钟无 worklog：`,
    );
    lines.push(
      wakeReason.lastWorklogAt
        ? `  最后活动: ${new Date(wakeReason.lastWorklogAt).toLocaleTimeString()} (${wakeReason.idleMinutes}min ago)`
        : `  ⚠️ 自任务开始从未写入 worklog`,
    );
    lines.push("");
    lines.push("💡 建议行动（AI 幻觉事中监督）:");
    lines.push("  1. 用 agent_communicate 询问 agent 当前实际操作状态");
    lines.push("  2. 若 agent 无法提供具体操作证据 → 用 agent.task.manage action=reset 重置任务");
    lines.push("  3. 检查 agent 最近 worklog，确认每步操作均有记录");
    lines.push("  4. 若确认幻觉，将案例记录到项目共享记忆（hallucination_cases）");
    lines.push("");
  }

  if (wakeReason.type === "hallucination_suspected") {
    lines.push(
      `🚨 幻觉拦截 — Agent [${wakeReason.agentId}] 任务 [${wakeReason.taskId}] "${wakeReason.taskTitle.slice(0, 50)}" 完成报告已被系统降级为 review：`,
    );
    lines.push(`  拒绝原因: ${wakeReason.reason}`);
    lines.push("");
    lines.push("💡 建议行动（AI 幻觉事后管控）:");
    lines.push("  1. 进入 review 状态 — 核实 agent 是否真实完成了任务");
    lines.push("  2. 检查代码仓库 git log / 文件变更，验证工作成果");
    lines.push("  3. 若确认完成 → 用 agent.task.manage action=approve 批准");
    lines.push("  4. 若确认幻觉 → 用 agent.task.manage action=reset 重置，要求重做");
    lines.push("  5. 将此案例记录到共享记忆，作为事后管控证据");
    lines.push("");
  }

  // ── task_blocked 专属：阻塞详情 + 证据链 + 强制验证决策流程 ──
  // 核心原则：主控不能只看标题就「汇报已解决」，必须核实原因真实性后再行动
  if (wakeReason.type === "task_blocked") {
    // Validation Gate 后置检查：该任务是否有历史快照已派发但主控没有处理的记录
    let validationGateWarn = "";
    if (wakeReason.priorSnapshotSentAt) {
      const ageMs = Date.now() - wakeReason.priorSnapshotSentAt;
      const ageMin = Math.floor(ageMs / 60_000);
      if (ageMs >= BLOCKED_CRITICAL_THRESHOLD_MS) {
        validationGateWarn = `\n  ⛔ [Validation Gate 危急] 该任务属于备押性第二次上报！快照已发出 ${ageMin} 分钟但主控一直未调用 triage 处理。`;
        validationGateWarn += `\n  ❗️ 业界最佳实践（Augment Code Supervisor Pattern）：Validation Gate 要求主控对每个 blocked 任务实际执行处理操作才能升级工作流，不能仅靠口头汇报。`;
      } else if (ageMs >= BLOCKED_ESCALATION_THRESHOLD_MS) {
        validationGateWarn = `\n  🚨 [Validation Gate 超时] 快照已发出 ${ageMin} 分钟，主控说「已处理」但未调用 triage 工具。`;
        validationGateWarn += `\n  系统将在下次快照中将此任务升级为 🚨[超时未处理]，请立即采取行动。`;
      }
    }

    lines.push(
      `🔴 阻塞详情 — Agent [${wakeReason.reporterId}] 任务 [${wakeReason.taskId}]${
        wakeReason.taskTitle ? ` "${wakeReason.taskTitle.slice(0, 50)}"` : ""
      } 主动上报阻塞：${validationGateWarn}`,
    );
    if (wakeReason.errorMsg) {
      lines.push(`  上报原因: ${wakeReason.errorMsg}`);
    } else {
      lines.push(`  上报原因: (未填写)`);
    }
    lines.push("");

    // 证据链：注入最近的 worklog 条目，让主控看到「agent 真正做了什么」
    if (wakeReason.recentWorklogs && wakeReason.recentWorklogs.length > 0) {
      lines.push(`📋 最近工作记录（核实证据）：`);
      for (const wl of wakeReason.recentWorklogs) {
        const timeStr = new Date(wl.createdAt).toLocaleTimeString();
        lines.push(
          `  [${timeStr}] [${wl.action}] ${wl.details.slice(0, 150)}${
            wl.result ? ` → ${wl.result}` : ""
          }`,
        );
      }
      lines.push("");
    } else {
      lines.push(`📋 工作记录: ⚠️ 无 worklog — agent 可能未实际执行即上报阻塞（高度疑似幻觉）`);
      lines.push("");
    }

    lines.push("🔍 强制验证决策流程（主控必须按此步骤处理，不得跳过）:");
    lines.push(`  Step 1 [核实真实性]: 检查上方 worklog，判断阻塞原因是否真实存在`);
    lines.push(
      `    - 若 worklog 空 或 操作记录与阻塞原因无关 → 疑似幻觉，用 agent_communicate 追问具体证据`,
    );
    lines.push(`    - 若有充分工作记录 → 阻塞原因可信，进入 Step 2`);
    lines.push(
      `  Step 2 [分类决策]: 根据阻塞类型选择处理方式（resolutionType “[ ]” 为必填枚举值）：`,
    );
    lines.push(`    A) [external_unready] 外部依赖未就绪 (API Key缺失/环境问题/权限不足等)`);
    lines.push(
      `       → 用 agent_communicate 与相关方协调，再 agent.task.triage action=reset resolutionType=external_unready`,
    );
    lines.push(`    B) [dep_incomplete] 前置任务未完成 (等待其他 agent 的工作产出)`);
    lines.push(
      `       → 用 agent.task.triage action=mark-dependency resolutionType=dep_incomplete 标记依赖，系统自动在依赖完成后解除`,
    );
    lines.push(`    C) [unclear_scope] 任务描述不清/范围过大 (agent 无法理解或执行)`);
    lines.push(
      `       → 拆分任务或补充说明，再 agent.task.triage action=reassign|reset resolutionType=unclear_scope`,
    );
    lines.push(`    D) [capability_gap] 技术障碍确实无法解决 (当前 agent 能力不足)`);
    lines.push(
      `       → agent.task.triage action=reassign resolutionType=capability_gap 换分配给更合适的 agent`,
    );
    lines.push(`    E) [hallucination] agent 阻塞声明为幻觉 (worklog 不支撑其说法)`);
    lines.push(
      `       → agent.task.triage action=reset resolutionType=hallucination + 向 agent 明确要求充分记录 worklog`,
    );
    lines.push(`    F) [requirement_change] 需求已变更/任务已无必要`);
    lines.push(
      `       → agent.task.triage action=cancel resolutionType=requirement_change 并说明原因`,
    );
    lines.push(
      `  Step 3 [行动记录]: 处理完毕后，用 agent.task.triage action=add-note 记录你的决策原因`,
    );
    lines.push(`  ⚠️ 严禁行为: 看完仪表盘后直接「汇报已解决」而不执行以上任何操作！`);
    lines.push("");
  }

  // dep_blocked 专属：前置任务明细 + 行动指引（紧跟触发行，让主控第一眼看到该做什么）
  if (wakeReason.type === "dep_blocked") {
    lines.push(
      `📋 阻塞详情 — 任务 [${wakeReason.taskId}] "${wakeReason.taskTitle.slice(0, 50)}" (执行者: ${wakeReason.agentId}) 因前置未完成已退回等待:`,
    );
    for (const dep of wakeReason.blockedBy) {
      const assigneePart = dep.assigneeId ? ` | 负责人: ${dep.assigneeId}` : " | ⚠️ 未分配";
      lines.push(
        `  🔒 [${dep.id}] "${dep.title.slice(0, 50)}" (优先级: ${dep.priority}${assigneePart})`,
      );
    }
    lines.push("");
    lines.push("💡 建议行动:");
    lines.push("  1. 检查上方前置任务是否已分配给合适成员");
    lines.push("  2. 若未分配 → 用 agent.assign_task 立即分配并设为 urgent");
    lines.push("  3. 若已分配但卡住 → 用 agent.task.triage 分诊处理");
    lines.push("  4. 前置任务完成后，系统会自动解除阻塞并重新调度");
    lines.push("");
  }

  // 全局指标行（极度紧凑，1 行）
  lines.push(
    `📊 全局: ${totalInProgress}进行中 / ${totalBlocked}阻塞 / ${totalTodo}待办 (${agentIds.length} agents)`,
  );
  lines.push("");

  // Agent 状态矩阵（只显示有任务的 agent）
  if (agentRows.length > 0) {
    lines.push("👥 Agent 状态:");
    lines.push(...agentRows);
    lines.push("");
  }

  // ── 有效 Agent 列表（防幽灵 agent 机制）──
  // 明确列出系统中所有已注册的有效 agent，防止主控凭记忆幻觉出不存在的 agent ID
  lines.push(
    "🔒 系统有效 Agent 列表（ONLY use agents from this list — do NOT invent agent IDs from memory or context）:",
  );
  lines.push(`  ${agentIds.join(" | ")}`);
  lines.push(
    "  ⚠️ 严禁使用不在此列表中的任何 agent 名称！若列表中找不到合适 agent，请用 agent_discover 工具重新查询，不得自行构造。",
  );
  lines.push("");

  // 告警区（需要主控关注的事项）
  if (alertRows.length > 0) {
    lines.push("🚨 需关注:");
    lines.push(...alertRows);
    lines.push("");
  }

  // 操作提示 + 强制行动指令
  lines.push(
    "📌 常用操作: agent.task.triage(批量分诊) | agent.task.manage(cancel/reset/extend/split) | agent.task.list | agent_communicate",
  );

  // ── 强制行动指令（有阻塞任务时）──────────────────────────────────────────
  // 业界最佳实践（OpenHands Orchestrator + LangGraph Supervisor Pattern）：
  // 仪表盘快照结尾强制说明「工具操作先于汇报文字」，
  // 防止主控读完快照后只生成一段分析报告而不执行任何工具调用。
  if (totalBlocked > 0 || alertRows.length > 0) {
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("🔴 强制行动要求（ACTION REQUIRED — 非可选建议，必须执行）:");
    lines.push(
      "  1. 你现在必须对上方阻塞/告警任务执行至少一次工具调用（triage / manage / communicate）。",
    );
    lines.push("  2. 工具调用完成后，才允许生成面向用户的汇报文字。");
    lines.push("  3. 严禁路径：读完仪表盘 → 直接生成分析报告 → 结束。这等同于什么都没做。");
    lines.push(
      `  4. 本仪表盘显示 ${totalBlocked} 个阻塞任务，若你本次心跳未调用任何工具，系统将在下次快照中标记「主控无操作」并升级告警。`,
    );
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  const snapshot = lines.join("\n");

  // 预算保护：超出则截断并提示
  if (snapshot.length > MAX_SNAPSHOT_CHARS) {
    return (
      snapshot.slice(0, MAX_SNAPSHOT_CHARS) +
      "\n…[snapshot truncated — use agent.task.list for full view]"
    );
  }

  return snapshot;
}

// ─── 触发行构建 ──────────────────────────────────────────────────────────────

function buildTriggerLine(reason: LeaderWakeReason): string {
  switch (reason.type) {
    case "task_done":
      return `✅ ${reason.reporterId} 完成 [${reason.taskId}]${reason.summary ? ` — ${reason.summary.slice(0, 80)}` : ""}`;
    case "task_blocked":
      return `⚠️ ${reason.reporterId} 阻塞 [${reason.taskId}]${reason.errorMsg ? ` — ${reason.errorMsg.slice(0, 80)}` : ""}`;
    case "dep_blocked":
      return `🔒 ${reason.agentId} 任务 [${reason.taskId}] 因前置未完成已退回 — 前置: ${reason.blockedBy.map((d) => d.id).join(", ")}，请立即安排`;
    case "task_timeout":
      return `⏱️ ${reason.agentId} 超时 [${reason.taskId}] ${reason.stuckMinutes}min — 已重唤醒`;
    case "task_reset":
      return `🔄 ${reason.agentId} [${reason.taskId}] 卡顿 ${reason.stuckMinutes}min → 已重置为 todo`;
    case "low_watermark":
      return `📉 ${reason.agentId} 待办不足 ${reason.todoCount}/${reason.minTodo} — 需补充任务`;
    case "kpi_reassign":
      return `♻️ [${reason.taskId}] 从 ${reason.fromAgent} 重分配至 ${reason.toAgent}`;
    case "overdue":
      return `⏰ [${reason.taskId}] "${reason.title.slice(0, 40)}" 逾期 ${reason.overdueMinutes}min → 已升级为 urgent`;
    case "backlog":
      return `📥 ${reason.agentId} 积压 ${reason.queueSize} 条任务 — 建议重分配或取消`;
    case "compaction_restore":
      return "🔄 compaction 后恢复 — 当前任务状态如下";
    case "suspicion_idle":
      return `🕵️ ${reason.agentId} 任务 [${reason.taskId}] 已 ${reason.idleMinutes}min 无 worklog — 疑似幻觉，请介入核查`;
    case "hallucination_suspected":
      return `🚨 ${reason.agentId} 任务 [${reason.taskId}] 完成报告被拒 — worklog 为空，已降为 review 等待审核`;
    default:
      return "状态更新";
  }
}

function buildContextKey(reason: LeaderWakeReason): string {
  switch (reason.type) {
    case "task_done":
    case "task_blocked":
    case "dep_blocked":
      return `leader:snapshot:task:${reason.taskId}`;
    case "task_timeout":
    case "task_reset":
      return `leader:snapshot:agent:${reason.agentId}:${reason.taskId}`;
    case "low_watermark":
      return `leader:snapshot:lwm:${reason.agentId}`;
    case "kpi_reassign":
      return `leader:snapshot:kpi:${reason.taskId}`;
    case "overdue":
      return `leader:snapshot:overdue:${reason.taskId}`;
    case "backlog":
      return `leader:snapshot:backlog:${reason.agentId}`;
    case "compaction_restore":
      return `leader:snapshot:compaction:${Date.now()}`;
    case "suspicion_idle":
    case "hallucination_suspected":
      return `leader:snapshot:hallucination:${reason.taskId}`;
    default:
      return `leader:snapshot:${Date.now()}`;
  }
}
