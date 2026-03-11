/**
 * Agent 活动监控定时任务
 *
 * 每 5 分钟扫描一次所有 Agent 的代码/程序活动
 * 检测失联、停滞、假死的 Agent
 */

import { loadConfig } from "../config/config.js";
import { chatHandlers } from "../gateway/server-methods/chat.js";
import type { GatewayRequestHandlerOptions } from "../gateway/server-methods/types.js";
import { generateAgentAlert, monitorAllAgentsActivity } from "./agent-activity-monitor.js";

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
  console.log("[Agent Activity] Starting activity monitoring system...");

  // 立即执行一次
  void runActivityMonitoring();

  // 定时执行
  monitoringInterval = setInterval(() => {
    void runActivityMonitoring();
  }, MONITORING_INTERVAL_MS);

  console.log(
    `[Agent Activity] Monitoring started (interval: ${MONITORING_INTERVAL_MS / 60000} minutes)`,
  );
}

/**
 * 停止监控
 */
export function stopAgentActivityMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log("[Agent Activity] Monitoring stopped");
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
    if (cfg.agents && Array.isArray(cfg.agents)) {
      for (const agent of cfg.agents as unknown[]) {
        const maybeAgent = agent as { id?: unknown } | null | undefined;
        if (maybeAgent && typeof maybeAgent.id === "string") {
          agentIds.push(maybeAgent.id);
        }
      }
    }

    if (agentIds.length === 0) {
      console.log("[Agent Activity] No agents configured, skipping monitoring");
      return;
    }

    console.log(`[Agent Activity] Scanning ${agentIds.length} agents...`);

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
            `⚠️ [Agent Activity] ${agentId}: Warning (${(report.inactiveDuration / 60000).toFixed(1)} min inactive)`,
          );
          break;
        case "critical":
          criticalCount++;
          console.log(
            `🔴 [Agent Activity] ${agentId}: Critical (${(report.inactiveDuration / 3600000).toFixed(1)} hours inactive)`,
          );
          break;
        case "dead":
          deadCount++;
          console.log(
            `💀 [Agent Activity] ${agentId}: DEAD (${(report.inactiveDuration / 3600000).toFixed(1)} hours inactive)`,
          );
          break;
      }

      // 生成告警并发送给管理员
      const alert = generateAgentAlert(report);
      if (alert) {
        await sendAlertToAdmin(agentId, alert);
      }
    }

    console.log(
      `[Agent Activity] Scan complete. Healthy: ${healthyCount}, Warning: ${warningCount}, Critical: ${criticalCount}, Dead: ${deadCount}`,
    );
  } catch (error) {
    console.error("[Agent Activity] Monitoring failed:", error);
  }
}

// ============================================================================
// 发送告警
// ============================================================================

/**
 * 向人类管理员发送告警通知
 */
async function sendAlertToAdmin(
  agentId: string,
  alert: ReturnType<typeof generateAgentAlert>,
): Promise<void> {
  if (!alert) {
    return;
  }

  try {
    // 获取管理员 ID（从配置中读取或默认）
    const adminId = "admin"; // TODO: 从配置中读取

    const sessionKey = `agent:${adminId}:main`;

    const alertMessage = [
      `${alert.title}`,
      ``,
      `**Agent**: ${agentId}`,
      `**,详情**: ${alert.message}`,
      ``,
      `**建议操作**:`,
      ...alert.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`),
      ``,
      `请立即检查该 Agent 的工作状态！`,
    ].join("\n");

    // 通过 chat.send 发送告警
    await new Promise<void>((resolve) => {
      (chatHandlers["chat.send"] as unknown as (opts: GatewayRequestHandlerOptions) => void)({
        params: {
          sessionKey,
          message: alertMessage,
          idempotencyKey: `agent-activity-alert-${agentId}-${Date.now()}`,
        },
        respond: () => resolve(),
      } as unknown as GatewayRequestHandlerOptions);
    });

    console.log(`[Agent Activity] Alert sent to admin for agent ${agentId}`);
  } catch (error) {
    console.error(`[Agent Activity] Failed to send alert for ${agentId}:`, error);
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
