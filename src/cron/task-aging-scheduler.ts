/**
 * 任务老化检测定时任务
 *
 * 每小时扫描一次待办池，防止任务长期沉淀
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
    const projectIds = cfg.projects?.map((p) => p.id) ?? [];

    if (projectIds.length === 0) {
      console.log("[Task Aging] No projects configured, skipping aging scheduler");
      return;
    }

    console.log(`[Task Aging] Initializing scheduler for ${projectIds.length} projects...`);

    // 为每个项目启动独立的扫描任务
    for (const projectId of projectIds) {
      startAgingTaskScheduler({
        intervalHours: 1, // 每小时扫描一次
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
