/**
 * Memory Hygiene Scheduler — 工作空间卫生定时任务
 *
 * 业界实践参考：OpenAI Agents SDK「Memory Hygiene Job」/ MemOS 定期压缩
 *
 * 触发时机：
 * 1. 系统启动时立即执行一次（发现遗留问题）
 * 2. 每 24 小时定时执行一次（持续守护）
 *
 * 检查内容（由 workspace-hygiene.ts 实现）：
 * - MEMORY.md 大小超限预警
 * - 个人工作空间根目录杂项文件
 * - 幻觉项目目录（groups/ 下未注册的目录）
 * - AGENTS.md 路径声明一致性
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../upstream/src/config/paths.js";
import { pruneStaleReflections } from "../gateway/server-methods/evolve-rpc.js";
import { runAndCacheHygiene, type HygieneReport } from "../workspace/workspace-hygiene.js";

// ============================================================================
// 配置
// ============================================================================

/** 定时自检间隔：24 小时 */
const HYGIENE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 启动后延迟执行首次自检（等系统完全就绪）：30 秒 */
const STARTUP_DELAY_MS = 30 * 1000;

let hygieneInterval: NodeJS.Timeout | null = null;
let startupTimeout: NodeJS.Timeout | null = null;

// ============================================================================
// 核心逻辑
// ============================================================================

/**
 * 执行一次工作空间卫生检查，并将关键问题输出到控制台
 */
async function runHygieneCheck(): Promise<HygieneReport> {
  console.log("[MemoryHygiene] 开始定期工作空间自检...");
  const report = runAndCacheHygiene();

  // 关键问题汇总（error 级别才推送显著提示）
  const errors = report.issues.filter((i) => i.level === "error");
  if (errors.length > 0) {
    console.error(`[MemoryHygiene] ❌ 发现 ${errors.length} 个需要立即处理的问题：`);
    for (const issue of errors) {
      console.error(`  - [${issue.category}] ${issue.message}`);
      if (issue.suggestion) {
        console.error(`    建议: ${issue.suggestion}`);
      }
    }
  }

  // 反思库 GC：逐个 Agent 清理低价值反思
  try {
    const stateDir = resolveStateDir(process.env);
    const evolveBase = path.join(stateDir, "self-evolve");
    if (fs.existsSync(evolveBase)) {
      const agentDirs = fs.readdirSync(evolveBase).filter((d) => {
        return fs.statSync(path.join(evolveBase, d)).isDirectory() && d !== "_shared";
      });
      let totalRemoved = 0;
      for (const agentId of agentDirs) {
        try {
          const result = pruneStaleReflections(agentId);
          if (result.removed > 0) {
            totalRemoved += result.removed;
            console.log(
              `[MemoryHygiene] 反思 GC [${agentId}]: ${result.before} → ${result.after}，删除 ${result.removed} 条低价值条目`,
            );
          }
        } catch {
          /* 单个 Agent GC 失败不影响其他 */
        }
      }
      if (totalRemoved > 0) {
        console.log(`[MemoryHygiene] 反思 GC 完成，共删除 ${totalRemoved} 条低价值/超龄反思`);
      } else {
        console.log("[MemoryHygiene] 反思 GC: 无需清理");
      }
    }
  } catch {
    /* 反思 GC 失败不影响主流程 */
  }

  return report;
}

// ============================================================================
// 启停接口
// ============================================================================

/**
 * 启动工作空间卫生定时任务
 *
 * 调用时机：系统入口启动时（entry.ts 或 lifecycle 初始化）
 */
export function startMemoryHygieneScheduler(): void {
  console.log(
    `[MemoryHygiene] 卫生调度器启动，将在 ${STARTUP_DELAY_MS / 1000}s 后执行首次自检，之后每 ${HYGIENE_INTERVAL_MS / 3600000}h 定期执行`,
  );

  // 延迟执行首次自检（避免系统启动时抢占资源）
  startupTimeout = setTimeout(() => {
    void runHygieneCheck();
  }, STARTUP_DELAY_MS);

  // 定时执行
  hygieneInterval = setInterval(() => {
    void runHygieneCheck();
  }, HYGIENE_INTERVAL_MS);
}

/**
 * 停止工作空间卫生定时任务
 */
export function stopMemoryHygieneScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (hygieneInterval) {
    clearInterval(hygieneInterval);
    hygieneInterval = null;
    console.log("[MemoryHygiene] 卫生调度器已停止");
  }
}

/**
 * 立即触发一次工作空间自检（供外部手动调用 / RPC 接口调用）
 */
export async function triggerHygieneNow(): Promise<HygieneReport> {
  return runHygieneCheck();
}

/**
 * 初始化并注册进程退出钩子（在项目启动时调用）
 */
export function initMemoryHygieneScheduler(): void {
  startMemoryHygieneScheduler();

  // 优雅关闭
  process.on("SIGINT", () => {
    stopMemoryHygieneScheduler();
  });
  process.on("SIGTERM", () => {
    stopMemoryHygieneScheduler();
  });
}
