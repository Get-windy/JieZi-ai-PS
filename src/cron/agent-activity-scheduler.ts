/**
 * Agent 活动监控定时任务 *
 * 每 5 分钟扫描一次所有 Agent 的代码/程序活动
 * 检测失联、停滞、假死的 Agent
 */

import { loadConfig } from "../../upstream/src/config/config.js";
import { t } from "../i18n/index.js";
import {
  generateAgentAlert,
  monitorAllAgentsActivity,
} from "../monitoring/agent-activity-monitor.js";

// ============================================================================
// 配置
// ============================================================================

const MONITORING_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟检查一次

let monitoringInterval: NodeJS.Timeout | null = null;

// ============================================================================
// 初始化监控器
// ============================================================================

/**
 * 启动 Agent 活动监控系统
 */
export function startAgentActivityMonitoring(): void {
  console.log(t("monitor.agent.starting"));

  // 立即执行一次
  void runActivityMonitoring();

  // 定时执行
  monitoringInterval = setInterval(() => {
    void runActivityMonitoring();
  }, MONITORING_INTERVAL_MS);

  console.log(t("monitor.agent.started", { interval: String(MONITORING_INTERVAL_MS / 60000) }));
}

/**
 * 停止监控
 */
export function stopAgentActivityMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log(t("monitor.agent.stopped"));
  }
}

// ============================================================================
// 执行监控
// ============================================================================

/**
 * 运行一次完整的活动检测
 */
async function runActivityMonitoring(): Promise<void> {
  try {
    const cfg = loadConfig();
    const agentIds: string[] = [];
    const agentList = cfg.agents?.list;
    if (Array.isArray(agentList)) {
      for (const agent of agentList as unknown[]) {
        const maybeAgent = agent as { id?: unknown } | null | undefined;
        if (maybeAgent && typeof maybeAgent.id === "string") {
          agentIds.push(maybeAgent.id);
        }
      }
    }

    if (agentIds.length === 0) {
      console.log(t("monitor.agent.no_agents"));
      return;
    }

    console.log(t("monitor.agent.scanning", { count: String(agentIds.length) }));

    // 批量检测所有 Agent
    const reports = await monitorAllAgentsActivity(agentIds, process.cwd());

    // 分析结果
    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let deadCount = 0;

    for (const [agentId, report] of reports) {
      // 统计健康状态
      switch (report.healthStatus) {
        case "healthy":
          healthyCount++;
          break;
        case "warning":
          warningCount++;
          console.log(
            t("monitor.agent.warning", {
              agentId,
              minutes: (report.inactiveDuration / 60000).toFixed(1),
            }),
          );
          break;
        case "critical":
          criticalCount++;
          console.log(
            t("monitor.agent.critical", {
              agentId,
              hours: (report.inactiveDuration / 3600000).toFixed(1),
            }),
          );
          break;
        case "dead":
          deadCount++;
          console.log(
            t("monitor.agent.dead", {
              agentId,
              hours: (report.inactiveDuration / 3600000).toFixed(1),
            }),
          );
          break;
      }

      // 生成告警并记录日志
      const alert = generateAgentAlert(report);
      if (alert) {
        console.warn(`[Agent Monitor] ${agentId}: ${alert.title} - ${alert.message}`);
      }
    }

    console.log(
      t("monitor.agent.scan_complete", {
        healthy: String(healthyCount),
        warning: String(warningCount),
        critical: String(criticalCount),
        dead: String(deadCount),
      }),
    );
  } catch (error) {
    console.error(t("monitor.agent.monitor_failed"), error);
  }
}

// ============================================================================
// 导出给系统启动时使用
// ============================================================================

/**
 * 初始化 Agent 活动监控系统（在项目启动时调用）
 */
export function initAgentActivityMonitor(): void {
  startAgentActivityMonitoring();

  // 优雅关闭
  process.on("SIGINT", () => {
    stopAgentActivityMonitoring();
  });

  process.on("SIGTERM", () => {
    stopAgentActivityMonitoring();
  });
}
