/**
 * Agent 活动监控与心跳检测
 *
 * 核心理念：通过代码/程序的实际活动判断 Agent 是否真正工作
 * 而非依赖 Agent 的自我汇报（Activity-Based → Process-Based）
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { t } from "../i18n/index.js";
import * as storage from "../tasks/storage.js";

// ============================================================================
// 配置参数
// ============================================================================

/**
 * Agent 活动监控阈值
 */
export const AGENT_ACTIVITY_THRESHOLDS = {
  /** 正常活动间隔：5 分钟（Agent 应该持续工作） */
  HEALTHY_INTERVAL_MS: 5 * 60 * 1000,

  /** 警告阈值：15 分钟无活动 → Warning */
  WARNING_THRESHOLD_MS: 15 * 60 * 1000,

  /** 危险阈值：1 小时无活动 → Critical */
  CRITICAL_THRESHOLD_MS: 60 * 60 * 1000,

  /** 死亡阈值：2 小时无活动 → 判定为死亡/停滞 */
  DEAD_THRESHOLD_MS: 2 * 60 * 60 * 1000,
} as const;

/**
 * Agent 健康状态
 */
export type AgentHealthStatus =
  | "healthy" // ✅ 正常（< 5 分钟无活动）
  | "warning" // ⚠️ 警告（15 分钟无活动）
  | "critical" // 🔴 危险（1 小时无活动）
  | "dead"; // 💀 死亡（2 小时无活动）

// ============================================================================
// 活动证据类型
// ============================================================================

/**
 * Agent 活动证据（代码/程序层面的真实活动）
 */
export interface ActivityEvidence {
  /** 证据类型 */
  type:
    | "file-modified" // 文件修改
    | "code-committed" // 代码提交
    | "test-executed" // 测试执行
    | "api-called" // API 调用
    | "database-query" // 数据库查询
    | "network-request" // 网络请求
    | "process-spawned" // 子进程启动
    | "event-triggered"; // 事件触发

  /** 证据描述 */
  description: string;

  /** 时间戳 */
  timestamp: number;

  /** 相关文件/资源路径 */
  path?: string;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 活动报告
 */
export interface AgentActivityReport {
  /** Agent ID */
  agentId: string;

  /** 是否有工作任务（有关联的任务且任务状态为进行中） */
  hasActiveTasks: boolean;

  /** 关联的任务 ID 列表 */
  assignedTaskIds: string[];

  /** 最后活动时间 */
  lastActivityAt: number;

  /** 无活动时长（毫秒） */
  inactiveDuration: number;

  /** 健康状态（仅在有任务时才有意义） */
  healthStatus: AgentHealthStatus;

  /** 活动证据列表（最近 N 条） */
  recentActivities: ActivityEvidence[];

  /** 活动统计 */
  statistics: {
    /** 过去 1 小时活动次数 */
    activitiesLastHour: number;
    /** 过去 24 小时活动次数 */
    activitiesLastDay: number;
    /** 平均活动间隔（毫秒） */
    averageInterval: number;
  };

  /** 是否需要告警（仅在有任务且失联时才告警） */
  needsAlert: boolean;
}

// ============================================================================
// 活动检测器
// ============================================================================

/**
 * 检查 Agent 是否有正在执行的任务
 */
async function checkAgentTaskAssignment(
  agentId: string,
  projectId?: string,
): Promise<{
  hasActiveTasks: boolean;
  taskIds: string[];
}> {
  try {
    const allTasks = await storage.listTasks({
      projectId,
      status: ["in-progress", "blocked"], // 进行中和阻塞的任务
    });

    // 筛选出分配给该 Agent 的任务
    const assignedTasks = allTasks.filter((task) => task.assignees?.some((a) => a.id === agentId));

    return {
      hasActiveTasks: assignedTasks.length > 0,
      taskIds: assignedTasks.map((task) => task.id),
    };
  } catch (error) {
    console.error(t("monitor.agent.task_check_failed", { agentId }), error);
    return {
      hasActiveTasks: false,
      taskIds: [],
    };
  }
}

/**
 * 检测 Agent 的代码/程序活动
 *
 * @param agentId Agent 标识
 * @param workspaceRoot 工作区根目录
 * @param options 可选配置
 */
export async function detectAgentActivity(
  agentId: string,
  workspaceRoot: string,
  options?: {
    /** 是否检查任务关联（默认 true） */
    checkTaskAssignment?: boolean;
    /** 项目 ID（用于查询任务） */
    projectId?: string;
  },
): Promise<AgentActivityReport> {
  const now = Date.now();
  const evidence: ActivityEvidence[] = [];

  // 检查 Agent 是否有工作任务
  let hasActiveTasks = false;
  let assignedTaskIds: string[] = [];

  if (options?.checkTaskAssignment !== false) {
    const taskAssignment = await checkAgentTaskAssignment(agentId, options?.projectId);
    hasActiveTasks = taskAssignment.hasActiveTasks;
    assignedTaskIds = taskAssignment.taskIds;
  }

  // 如果没有工作任务，Agent 不需要工作，直接返回"健康"状态
  if (!hasActiveTasks) {
    return {
      agentId,
      hasActiveTasks: false,
      assignedTaskIds: [],
      lastActivityAt: now, // 视为"正在休息"，无活动
      inactiveDuration: 0,
      healthStatus: "healthy", // 休息中，健康状态
      recentActivities: [],
      statistics: {
        activitiesLastHour: 0,
        activitiesLastDay: 0,
        averageInterval: 0,
      },
      needsAlert: false, // 不需要告警
    };
  }

  // 检测维度 1: 文件系统活动（最近修改的文件）
  const fileActivities = await detectFileSystemActivity(agentId, workspaceRoot);
  evidence.push(...fileActivities);

  // 检测维度 2: Git 提交活动
  const gitActivities = await detectGitActivity(agentId, workspaceRoot);
  evidence.push(...gitActivities);

  // 检测维度 3: 进程活动（Node.js 进程）
  const processActivities = await detectProcessActivity(agentId);
  evidence.push(...processActivities);

  // 检测维度 4: 日志文件活动
  const logActivities = await detectLogActivity(agentId, workspaceRoot);
  evidence.push(...logActivities);

  // 找出最新活动时间
  const lastActivityAt = evidence.length > 0 ? Math.max(...evidence.map((e) => e.timestamp)) : 0;

  const inactiveDuration = now - lastActivityAt;
  const healthStatus = calculateHealthStatus(inactiveDuration);

  // 计算统计数据
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const activitiesLastHour = evidence.filter((e) => e.timestamp > oneHourAgo).length;
  const activitiesLastDay = evidence.filter((e) => e.timestamp > oneDayAgo).length;

  const sortedEvidence = evidence.toSorted((a, b) => b.timestamp - a.timestamp);
  const recent20 = sortedEvidence.slice(0, 20);

  // 计算平均间隔
  let averageInterval = 0;
  if (recent20.length >= 2) {
    const totalInterval = recent20[0].timestamp - recent20[recent20.length - 1].timestamp;
    averageInterval = totalInterval / (recent20.length - 1);
  }

  // 判断是否需要告警
  const needsAlert =
    healthStatus === "warning" || healthStatus === "critical" || healthStatus === "dead";

  return {
    agentId,
    hasActiveTasks: true, // 有任务才到达这里
    assignedTaskIds,
    lastActivityAt,
    inactiveDuration,
    healthStatus,
    recentActivities: recent20,
    statistics: {
      activitiesLastHour,
      activitiesLastDay,
      averageInterval,
    },
    needsAlert,
  };
}

/**
 * 检测文件系统活动
 */
async function detectFileSystemActivity(
  agentId: string,
  workspaceRoot: string,
): Promise<ActivityEvidence[]> {
  const evidence: ActivityEvidence[] = [];

  try {
    // Agent 的工作目录
    const agentWorkDir = join(workspaceRoot, ".agent-workspace", agentId);

    if (!existsSync(agentWorkDir)) {
      return evidence;
    }

    // 检查最近修改的文件（简化版，实际应该递归扫描）
    const files = [
      join(agentWorkDir, "output.txt"),
      join(agentWorkDir, "result.json"),
      join(agentWorkDir, "work.log"),
    ];

    for (const filePath of files) {
      if (existsSync(filePath)) {
        const stats = await readFile(filePath, "utf-8").then(() =>
          require("fs").statSync(filePath),
        );

        evidence.push({
          type: "file-modified",
          description: `文件被修改：${filePath}`,
          timestamp: stats.mtimeMs,
          path: filePath,
        });
      }
    }
  } catch (error) {
    console.error(t("monitor.agent.fs_activity_failed", { agentId }), error);
  }

  return evidence;
}

/**
 * 检测 Git 提交活动
 */
async function detectGitActivity(
  agentId: string,
  workspaceRoot: string,
): Promise<ActivityEvidence[]> {
  const evidence: ActivityEvidence[] = [];

  try {
    // 执行 git log 查看最近提交
    const gitLogPromise = new Promise<string>((resolve, reject) => {
      const child = spawn(
        "git",
        ["log", `--author=${agentId}`, "--since=24 hours ago", "--oneline", "-n", "10"],
        {
          cwd: workspaceRoot,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Git exited with code ${code}`));
        }
      });

      child.on("error", reject);
    });

    const gitOutput = await gitLogPromise;
    const lines = gitOutput.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const [commitHash, ...messageParts] = line.split(" ");
      evidence.push({
        type: "code-committed",
        description: `代码提交：${messageParts.join(" ")}`,
        timestamp: Date.now(), // Git 时间解析较复杂，这里简化
        metadata: {
          commitHash,
          message: messageParts.join(" "),
        },
      });
    }
  } catch {
    // Git 命令失败时忽略（可能没有 git 或没有提交）
    console.debug(t("monitor.agent.no_git_activity", { agentId }));
  }

  return evidence;
}

/**
 * 检测进程活动
 */
async function detectProcessActivity(agentId: string): Promise<ActivityEvidence[]> {
  const evidence: ActivityEvidence[] = [];

  try {
    // 检查是否有 Node.js 进程正在运行该 Agent 的代码
    const processCheckPromise = new Promise<string>((resolve, reject) => {
      const child = spawn("tasklist", ["/FI", `IMAGENAME eq node.exe`, "/FO", "CSV"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.on("close", (_code) => {
        resolve(output);
      });

      child.on("error", reject);
    });

    const processOutput = await processCheckPromise;

    // 如果检测到 Node 进程，说明 Agent 正在运行
    if (processOutput.includes("node.exe")) {
      evidence.push({
        type: "process-spawned",
        description: "Agent 进程正在运行",
        timestamp: Date.now(),
        metadata: {
          processName: "node.exe",
        },
      });
    }
  } catch {
    console.debug(t("monitor.agent.process_check_failed", { agentId }));
  }

  return evidence;
}

/**
 * 检测日志文件活动
 */
async function detectLogActivity(
  agentId: string,
  workspaceRoot: string,
): Promise<ActivityEvidence[]> {
  const evidence: ActivityEvidence[] = [];

  try {
    const logFilePath = join(workspaceRoot, "logs", `${agentId}.log`);

    if (existsSync(logFilePath)) {
      const stats = require("fs").statSync(logFilePath);
      const lastModified = stats.mtimeMs;

      evidence.push({
        type: "event-triggered",
        description: "日志文件被更新",
        timestamp: lastModified,
        path: logFilePath,
      });
    }
  } catch {
    console.debug(t("monitor.agent.no_log_activity", { agentId }));
  }

  return evidence;
}

// ============================================================================
// 健康状态计算
// ============================================================================

/**
 * 根据无活动时长计算健康状态
 */
export function calculateHealthStatus(inactiveDuration: number): AgentHealthStatus {
  if (inactiveDuration < AGENT_ACTIVITY_THRESHOLDS.HEALTHY_INTERVAL_MS) {
    return "healthy"; // ✅ < 5 分钟
  }

  if (inactiveDuration < AGENT_ACTIVITY_THRESHOLDS.WARNING_THRESHOLD_MS) {
    return "warning"; // ⚠️ < 15 分钟
  }

  if (inactiveDuration < AGENT_ACTIVITY_THRESHOLDS.CRITICAL_THRESHOLD_MS) {
    return "critical"; // 🔴 < 1 小时
  }

  return "dead"; // 💀 > 2 小时
}

// ============================================================================
// 批量监控
// ============================================================================

/**
 * 批量检测所有 Agent 的活动状态
 *
 * @param agentIds Agent ID 列表
 * @param workspaceRoot 工作区根目录
 */
export async function monitorAllAgentsActivity(
  agentIds: string[],
  workspaceRoot: string,
): Promise<Map<string, AgentActivityReport>> {
  const reports = new Map<string, AgentActivityReport>();

  for (const agentId of agentIds) {
    try {
      const report = await detectAgentActivity(agentId, workspaceRoot);
      reports.set(agentId, report);
    } catch (error) {
      console.error(t("monitor.agent.monitor_single_failed", { agentId }), error);
    }
  }

  return reports;
}

// ============================================================================
// 告警生成器
// ============================================================================

/**
 * 生成 Agent 失联告警
 */
export function generateAgentAlert(report: AgentActivityReport): {
  level: "warning" | "critical" | "emergency";
  title: string;
  message: string;
  suggestions: string[];
} | null {
  // 关键改进：没有工作任务时不告警！
  if (!report.hasActiveTasks) {
    return null; // Agent 在休息，不需要告警
  }

  if (!report.needsAlert) {
    return null;
  }

  const hoursInactive = (report.inactiveDuration / (1000 * 60 * 60)).toFixed(1);

  if (report.healthStatus === "dead") {
    return {
      level: "emergency",
      title: `🚨 Agent 失联警报`,
      message: `Agent "${report.agentId}" 已经超过 ${hoursInactive} 小时没有任何代码/程序活动！`,
      suggestions: [
        "立即检查 Agent 进程是否仍在运行",
        "查看系统资源使用情况（CPU、内存）",
        "检查是否有死锁或无限循环",
        "考虑重启 Agent 或重新分配任务",
      ],
    };
  }

  if (report.healthStatus === "critical") {
    return {
      level: "critical",
      title: `🔴 Agent 活动异常`,
      message: `Agent "${report.agentId}" 已经 ${hoursInactive} 小时没有活动`,
      suggestions: [
        "询问 Agent 当前工作状态",
        "检查任务是否遇到技术难题",
        "查看日志文件获取更多信息",
      ],
    };
  }

  if (report.healthStatus === "warning") {
    return {
      level: "warning",
      title: `⚠️ Agent 活动减少`,
      message: `Agent "${report.agentId}" 活动频率下降（${hoursInactive} 小时无活动）`,
      suggestions: ["关注 Agent 后续活动", "确认是否在思考或等待外部响应"],
    };
  }

  return null;
}

// ============================================================================
// 奖惩与信誉系统（基于业界最佳实践）
// ============================================================================

/**
 * Agent 信誉积分接口
 *
 * 基于业界最佳实践：
 * - 多层评估：结构层、任务层、语义层、行为层、质量层
 * - 结果导向：不仅看是否完成，还要看完成质量
 * - 防止作弊：平衡速度、质量、成本等多个维度
 */
export interface AgentReputation {
  /** Agent ID */
  agentId: string;

  /** 基础信誉分 (0-1000) */
  baseScore: number;

  /** 等级：bronze/silver/gold/diamond */
  level: "bronze" | "silver" | "gold" | "diamond";

  /** 声誉系数（影响任务分配优先级） */
  priorityMultiplier: number;

  /** 惩罚计数 */
  penaltyCount: number;

  /** 奖励计数 */
  rewardCount: number;

  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 应用惩罚（针对失联、敷衍等行为）
 */
export function applyPenalty(
  currentReputation: AgentReputation,
  reason: "inactive" | "low_quality" | "failed_task" | "safety_violation",
  severity: "light" | "medium" | "heavy",
): AgentReputation {
  const penaltyPoints = {
    light: 10, // 轻微：扣 10 分
    medium: 30, // 中等：扣 30 分
    heavy: 100, // 严重：扣 100 分
  };

  const newBaseScore = Math.max(0, currentReputation.baseScore - penaltyPoints[severity]);

  // 重新计算等级和优先级系数
  let newLevel: AgentReputation["level"];
  let newPriorityMultiplier: number;

  if (newBaseScore >= 800) {
    newLevel = "diamond";
    newPriorityMultiplier = 2.0;
  } else if (newBaseScore >= 600) {
    newLevel = "gold";
    newPriorityMultiplier = 1.5;
  } else if (newBaseScore >= 400) {
    newLevel = "silver";
    newPriorityMultiplier = 1.0;
  } else {
    newLevel = "bronze";
    newPriorityMultiplier = 0.5;
  }

  console.log(
    t("reputation.penalty_applied", {
      agentId: currentReputation.agentId,
      severity,
      points: String(penaltyPoints[severity]),
      reason,
      score: String(newBaseScore),
    }),
  );

  return {
    ...currentReputation,
    baseScore: newBaseScore,
    level: newLevel,
    priorityMultiplier: newPriorityMultiplier,
    penaltyCount: currentReputation.penaltyCount + 1,
    lastUpdated: Date.now(),
  };
}

/**
 * 应用奖励（针对高质量完成任务）
 */
export function applyReward(
  currentReputation: AgentReputation,
  reason: "high_quality" | "early_completion" | "exceptional_performance",
  bonusPoints: number,
): AgentReputation {
  const newBaseScore = Math.min(1000, currentReputation.baseScore + bonusPoints);

  // 重新计算等级和优先级系数
  let newLevel: AgentReputation["level"];
  let newPriorityMultiplier: number;

  if (newBaseScore >= 800) {
    newLevel = "diamond";
    newPriorityMultiplier = 2.0;
  } else if (newBaseScore >= 600) {
    newLevel = "gold";
    newPriorityMultiplier = 1.5;
  } else if (newBaseScore >= 400) {
    newLevel = "silver";
    newPriorityMultiplier = 1.0;
  } else {
    newLevel = "bronze";
    newPriorityMultiplier = 0.5;
  }

  console.log(
    t("reputation.reward_applied", {
      agentId: currentReputation.agentId,
      points: String(bonusPoints),
      reason,
      score: String(newBaseScore),
    }),
  );

  return {
    ...currentReputation,
    baseScore: newBaseScore,
    level: newLevel,
    priorityMultiplier: newPriorityMultiplier,
    rewardCount: currentReputation.rewardCount + 1,
    lastUpdated: Date.now(),
  };
}
