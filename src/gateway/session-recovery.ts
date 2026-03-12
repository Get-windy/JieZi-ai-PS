/**
 * 网关启动时会话恢复机制
 *
 * 功能：在网关重启后，自动扫描所有活跃会话并发送重启通知
 * 场景：进程崩溃、系统重启、意外终止等非优雅重启情况
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveAnnounceTargetFromKey } from "../../auto-reply/announce-target.js";
import { deliverOutboundPayloads } from "../../auto-reply/deliver-outbound.js";
import { resolveOutboundTarget } from "../../auto-reply/outbound-target.js";
import { resolveSessionAgentId } from "../../config/agents.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveAgentSessionDirs } from "../../config/sessions/dirs.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { normalizeChannelId } from "../../utils/channel.js";
import { deliveryContextFromSession } from "../../utils/delivery-context.js";

const log = createSubsystemLogger("gateway/session-recovery");

const RECOVERY_CONFIG = {
  // 活跃会话判定阈值：最近 30 分钟内有活动
  activeThresholdMs: 30 * 60 * 1000,
  // 延迟执行：等待其他启动流程完成
  delayMs: 2000,
};

type SessionRecoveryResult = {
  totalSessions: number;
  activeSessions: number;
  notifiedSessions: number;
  failedSessions: number;
};

/**
 * 检查会话是否活跃（最近 N 分钟内有活动）
 */
function isActiveSession(entry: { updatedAt?: number }, now: number): boolean {
  const updatedAt = entry.updatedAt ?? 0;
  return now - updatedAt <= RECOVERY_CONFIG.activeThresholdMs;
}

/**
 * 构建重启通知消息
 */
function buildRecoveryMessage(now: number, lastActiveAt: number): string {
  const minutesAgo = Math.round((now - lastActiveAt) / 60000);

  if (minutesAgo < 1) {
    return "🔄 **系统已恢复**\n\n检测到您刚刚正在使用本会话，系统已自动重启。如有未完成的任务，请继续。";
  }

  if (minutesAgo < 5) {
    return `🔄 **系统已恢复**\n\n检测到您在 ${minutesAgo} 分钟前正在使用本会话，系统已自动重启。如有未完成的任务，请继续。`;
  }

  return `🔄 **系统已恢复**

检测到您在 ${minutesAgo} 分钟前有活跃会话，系统已自动重启。
- 最后活跃时间：${new Date(lastActiveAt).toLocaleString()}

如需开始新会话，请使用 /new 命令。`;
}

/**
 * 为单个会话发送重启通知
 */
async function notifySessionRecovery(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  entry: { updatedAt?: number; sessionId?: string };
}): Promise<boolean> {
  const { cfg, sessionKey, entry } = params;
  const now = Date.now();

  try {
    const sessionDeliveryContext = deliveryContextFromSession(entry);
    const parsedTarget = resolveAnnounceTargetFromKey(sessionKey);

    const origin = sessionDeliveryContext || parsedTarget;
    if (!origin) {
      log.warn(`无法解析会话 ${sessionKey} 的投递目标，跳过通知`);
      return false;
    }

    const channelRaw = origin.channel;
    const channel = channelRaw ? normalizeChannelId(channelRaw) : null;
    const to = origin.to;

    if (!channel || !to) {
      log.warn(`会话 ${sessionKey} 缺少 channel 或 to 信息，跳过通知`);
      return false;
    }

    const resolved = resolveOutboundTarget({
      channel,
      to,
      cfg,
      accountId: origin.accountId,
      mode: "implicit",
    });

    if (!resolved.ok) {
      log.warn(`无法解析会话 ${sessionKey} 的投递路径：${resolved.error}`);
      return false;
    }

    const message = buildRecoveryMessage(now, entry.updatedAt ?? 0);

    await deliverOutboundPayloads({
      cfg,
      channel,
      to: resolved.to,
      accountId: origin.accountId,
      threadId: origin.threadId != null ? String(origin.threadId) : undefined,
      payloads: [{ text: message }],
      agentId: resolveSessionAgentId({ sessionKey, config: cfg }),
      bestEffort: true,
    });

    log.info(`✓ 已通知会话恢复：${sessionKey}`);
    return true;
  } catch (err) {
    log.error(
      `✗ 通知会话恢复失败：${sessionKey} - ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * 主函数：扫描并通知所有活跃会话
 */
export async function recoverActiveSessionsAfterRestart(params: {
  cfg: OpenClawConfig;
  defaultWorkspaceDir: string;
}): Promise<SessionRecoveryResult> {
  const { cfg, defaultWorkspaceDir } = params;
  const now = Date.now();

  const result: SessionRecoveryResult = {
    totalSessions: 0,
    activeSessions: 0,
    notifiedSessions: 0,
    failedSessions: 0,
  };

  try {
    // 遍历所有 Agent 的会话目录
    const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(defaultWorkspaceDir, ".openclaw");
    const sessionDirs = await resolveAgentSessionDirs(stateDir);

    for (const sessionsDir of sessionDirs) {
      const sessionFiles = await fs.readdir(sessionsDir).catch(() => [] as string[]);

      for (const file of sessionFiles) {
        if (!file.endsWith(".json")) {
          continue;
        }

        const sessionStorePath = path.join(sessionsDir, file);
        let store: Record<string, { updatedAt?: number; sessionId?: string }>;

        try {
          const content = await fs.readFile(sessionStorePath, "utf-8");
          store = JSON.parse(content);
        } catch (err) {
          log.warn(
            `读取会话存储失败 ${sessionStorePath}: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        // 遍历该存储中的所有会话
        for (const [sessionKey, entry] of Object.entries(store)) {
          result.totalSessions++;

          // 检查是否为活跃会话
          if (!isActiveSession(entry, now)) {
            continue;
          }

          result.activeSessions++;

          // 发送重启通知
          const success = await notifySessionRecovery({
            cfg,
            sessionKey,
            entry,
          });

          if (success) {
            result.notifiedSessions++;
          } else {
            result.failedSessions++;
          }
        }
      }
    }

    if (result.activeSessions > 0) {
      log.info(
        `会话恢复完成：总计 ${result.totalSessions}, 活跃 ${result.activeSessions}, ` +
          `已通知 ${result.notifiedSessions}, 失败 ${result.failedSessions}`,
      );
    } else {
      log.debug("未发现活跃会话，跳过恢复通知");
    }
  } catch (err) {
    log.error(`会话恢复流程失败：${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
