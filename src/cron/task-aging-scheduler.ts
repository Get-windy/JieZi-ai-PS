/**
 * 任务老化检测定时任务
 *
 * Agent 系统全年无休！每 10 分钟扫描一次待办池，确保任务不会沉淀超过几小时
 */

import { loadConfig } from "../../config/config.js";
import { startAgingTaskScheduler } from "../../tasks/task-aging.js";

/**
 * 初始化任务老化检测系统
 *
 * 在项目启动时自动运行，定期扫描待办任务
 */
export function initTaskAgingScheduler(): void {
  try {
    const cfg = loadConfig();

    // 从配置中读取项目列表
    const projectIds = cfg.projects?.map((p: { id: string }) => p.id) ?? [];

    if (projectIds.length === 0) {
      console.log("[Task Aging] No projects configured, skipping aging scheduler");
      return;
    }

    console.log(
      `[Task Aging] Initializing scheduler for ${projectIds.length} projects (Agent mode - high frequency!)`,
    );

    // 为每个项目启动独立的扫描任务，每 10 分钟一次（不是人类的 Sprint 节奏！）
    for (const projectId of projectIds) {
      startAgingTaskScheduler({
        intervalMinutes: 10, // 每 10 分钟一次！Agent 全年无休！
        projectId,
        enableReminders: true, // 启用提醒
        enableEscalation: true, // 启用升级
        enableArchive: false, // 默认不自动归档（需手动确认）
      });

      console.log(`[Task Aging] Scheduler started for project: ${projectId}`);
    }

    console.log("[Task Aging] All schedulers initialized successfully");
  } catch (error) {
    console.error("[Task Aging] Failed to initialize scheduler:", error);
  }
}
