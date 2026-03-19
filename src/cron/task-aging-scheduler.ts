/**
 * 任务老化检测定时任务
 *
 * Agent 系统全年无休！每 10 分钟扫描一次待办池，确保任务不会沉淀超过几小时
 *
 * 新增功能：防敷衍汇报机制（Outcome-Based Accountability）
 */

import { loadConfig } from "../../upstream/src/config/config.js";
import { t } from "../i18n/index.js";
import { startAgingTaskScheduler } from "../tasks/task-aging.js";

/**
 * 初始化任务老化检测系统
 *
 * 在项目启动时自动运行，定期扫描待办任务
 *
 * ⚠️ 注意：需要在主程序中调用此函数才能启用定时任务
 * 示例：
 * ```typescript
 * import { initTaskAgingScheduler } from './cron/task-aging-scheduler.js';
 * import { initAgentActivityMonitor } from './cron/agent-activity-scheduler.js';
 *
 * // 在系统启动时调用
 * initTaskAgingScheduler();
 * initAgentActivityMonitor();
 * ```
 */
export function initTaskAgingScheduler(): void {
  try {
    const cfg = loadConfig();

    // 从配置中读取项目列表（使用 agents.list 作为项目/团队 ID）
    const projectIds: string[] = [];

    if (cfg.agents?.list && Array.isArray(cfg.agents.list)) {
      for (const agent of cfg.agents.list) {
        if (agent.id) {
          projectIds.push(agent.id);
        }
      }
    }

    if (projectIds.length === 0) {
      console.log(t("task.aging.init_no_projects"));
      return;
    }

    console.log(t("task.aging.init_starting", { count: String(projectIds.length) }));

    // 为每个项目启动独立的扫描任务，每 10 分钟一次
    for (const projectId of projectIds) {
      startAgingTaskScheduler({
        intervalMinutes: 10,
        projectId,
        enableReminders: true,
        enableEscalation: true,
        enableArchive: false,
      });

      console.log(t("task.aging.init_project_started", { projectId }));
    }

    console.log(t("task.aging.init_done"));
  } catch (error) {
    console.error(t("task.aging.init_failed"), error);
  }
}
