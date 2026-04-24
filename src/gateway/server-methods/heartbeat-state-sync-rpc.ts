/**
 * 心跳任务状态同步 RPC Handlers
 * 
 * 提供心跳任务与主控之间的状态同步能力
 * 解决信息断链问题，采用分层状态压缩机制
 */

import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import {
  generateHeartbeatSummary,
  generateProgressReport,
  generateFullLog,
  shouldInjectProgressReport,
  buildMasterContext,
  DEFAULT_CONTEXT_CONFIG,
  type HeartbeatStateSummary,
} from "../../tasks/heartbeat-state-compressor.js";
import * as storage from "../../tasks/storage.js";

/**
 * 心跳状态同步 RPC Handlers
 */
export const heartbeatStateSyncHandlers: GatewayRequestHandlers = {
  /**
   * heartbeat.generate_state_summary - 生成心跳状态摘要（Tier 1）
   */
  "heartbeat.generate_state_summary": async ({ params, respond }) => {
    try {
      const taskId = typeof params?.taskId === "string" ? params.taskId : (params?.taskId as string) ?? "";
      const recentChecksCount = typeof params?.recentChecksCount === "number" ? params.recentChecksCount : 10;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const checkHistory = (task.meta?.heartbeatChecks || [])
        .slice(-recentChecksCount)
        .map((check: Record<string, unknown>) => ({
          timestamp: (check.timestamp as number) || 0,
          status: (check.status as string) || "passed",
          findings: (check.findings as unknown[]) || [],
          healthScore: (check.healthScore as number) ?? 100,
        }));
      
      const pendingDecisions = (task.meta?.pendingDecisions || [])
        .filter((d: Record<string, unknown>) => (d.status as string) !== "resolved")
        .slice(0, 5);
      
      const summary = generateHeartbeatSummary(
        task,
        checkHistory,
        pendingDecisions,
        DEFAULT_CONTEXT_CONFIG,
      );
      
      respond(true, summary, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to generate heartbeat state summary: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * heartbeat.generate_progress_report - 生成进度报告（Tier 2）
   */
  "heartbeat.generate_progress_report": async ({ params, respond }) => {
    try {
      const taskId = typeof params?.taskId === "string" ? params.taskId : (params?.taskId as string) ?? "";
      const periodMinutes = typeof params?.periodMinutes === "number" ? params.periodMinutes : 60;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const checkHistory = (task.meta?.heartbeatChecks || [])
        .map((check: Record<string, unknown>) => ({
          id: (check.id as string) || `check-${check.timestamp}`,
          timestamp: (check.timestamp as number) || 0,
          checkType: (check.checkType as string) || "default",
          status: (check.status as string) || "passed",
          findings: (check.findings as unknown[]) || [],
          healthScore: (check.healthScore as number) ?? 100,
        }));
      
      const issuesHandled = (task.meta?.handledIssues || [])
        .map((issue: Record<string, unknown>) => ({
          id: (issue.id as string) || `issue-${issue.detectedAt}`,
          type: (issue.type as string) || "unknown",
          description: (issue.description as string) || "",
          detectedAt: (issue.detectedAt as number) || 0,
          resolution: (issue.resolution as string | undefined) || undefined,
        }));
      
      const report = generateProgressReport(task, checkHistory, issuesHandled, periodMinutes);
      
      respond(true, report, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to generate progress report: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * heartbeat.get_full_log - 获取完整日志（Tier 3）
   */
  "heartbeat.get_full_log": async ({ params, respond }) => {
    try {
      const taskId = typeof params?.taskId === "string" ? params.taskId : (params?.taskId as string) ?? "";
      const maxEntries = typeof params?.maxEntries === "number" ? params.maxEntries : 50;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const checkHistory = (task.meta?.heartbeatChecks || [])
        .map((check: Record<string, unknown>) => ({
          id: (check.id as string) || `check-${check.timestamp}`,
          timestamp: (check.timestamp as number) || 0,
          checkType: (check.checkType as string) || "default",
          status: (check.status as string) || "passed",
          findings: (check.findings as unknown[]) || [],
          healthScore: (check.healthScore as number) ?? 100,
          actions: (check.actions as string[]) || [],
        }));
      
      const issueResolutionChain = (task.meta?.issueResolutionChain || [])
        .map((chain: Record<string, unknown>) => ({
          issueId: (chain.issueId as string) || "",
          timeline: (chain.timeline as unknown[]) || [],
        }));
      
      const fullLog = generateFullLog(task, checkHistory, issueResolutionChain, maxEntries);
      
      respond(true, fullLog, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get full log: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * heartbeat.should_inject_progress - 判断是否应该注入进度报告
   */
  "heartbeat.should_inject_progress": async ({ params, respond }) => {
    try {
      const taskId = typeof params?.taskId === "string" ? params.taskId : (params?.taskId as string) ?? "";
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const recentChecks = (task.meta?.heartbeatChecks || [])
        .slice(-10)
        .map((check: Record<string, unknown>) => ({
          timestamp: (check.timestamp as number) || 0,
          status: (check.status as string) || "passed",
          findings: (check.findings as unknown[]) || [],
          healthScore: (check.healthScore as number) ?? 100,
        }));
      
      const pendingDecisions = (task.meta?.pendingDecisions || [])
        .filter((d: Record<string, unknown>) => (d.status as string) !== "resolved")
        .slice(0, 5);
      
      const summary = generateHeartbeatSummary(task, recentChecks, pendingDecisions, DEFAULT_CONTEXT_CONFIG);
      const shouldInject = shouldInjectProgressReport(summary, DEFAULT_CONTEXT_CONFIG);
      
      respond(true, { shouldInject, reason: getInjectReason(summary) }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to check injection condition: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * heartbeat.build_master_context - 构建主控上下文
   */
  "heartbeat.build_master_context": async ({ params, respond }) => {
    try {
      const taskIdStr = typeof params?.taskId === "string" ? params.taskId : (params?.taskId as string) ?? "";
      const includeProgress = params?.includeProgress === true;
      const periodMinutes = params?.periodMinutes ? Number(params.periodMinutes) : 60;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.getTask(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const recentChecks = (task.meta?.heartbeatChecks || [])
        .slice(-10)
        .map((check: Record<string, unknown>) => ({
          timestamp: (check.timestamp as number) || 0,
          status: (check.status as string) || "passed",
          findings: (check.findings as unknown[]) || [],
          healthScore: (check.healthScore as number) ?? 100,
        }));
      
      const pendingDecisions = (task.meta?.pendingDecisions || [])
        .filter((d: Record<string, unknown>) => (d.status as string) !== "resolved")
        .slice(0, 5);
      
      const summary = generateHeartbeatSummary(task, recentChecks, pendingDecisions, DEFAULT_CONTEXT_CONFIG);
      
      let progressReport;
      if (includeProgress) {
      const checkHistory = (task.meta?.heartbeatChecks || [])
          .map((check: Record<string, unknown>) => ({
            id: (check.id as string) || `check-${check.timestamp}`,
            timestamp: (check.timestamp as number) || 0,
            checkType: (check.checkType as string) || "default",
            status: (check.status as string) || "passed",
            findings: (check.findings as unknown[]) || [],
            healthScore: (check.healthScore as number) ?? 100,
          }));
        
        const issuesHandled = (task.meta?.handledIssues || [])
          .map((issue: Record<string, unknown>) => ({
            id: (issue.id as string) || `issue-${issue.detectedAt}`,
            type: (issue.type as string) || "unknown",
            description: (issue.description as string) || "",
            detectedAt: (issue.detectedAt as number) || 0,
            resolution: (issue.resolution as string | undefined) || undefined,
          }));
        
        progressReport = generateProgressReport(task, checkHistory, issuesHandled, periodMinutes);
      }
      
      const masterContext = buildMasterContext(summary, progressReport, DEFAULT_CONTEXT_CONFIG);
      
      respond(true, { context: masterContext, summary, progressReport }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to build master context: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * heartbeat.record_user_response - 记录用户响应
   */
  "heartbeat.record_user_response": async ({ params, respond }) => {
    try {
      const taskIdStr = typeof params?.taskId === "string" ? params.taskId : (params?.taskId as string) ?? "";
      const decisionIdStr = typeof params?.decisionId === "string" ? params.decisionId : (params?.decisionId as string) ?? "";
      const userChoiceStr = typeof params?.userChoice === "string" ? params.userChoice : (params?.userChoice as string) ?? "";
      
      if (!taskIdStr || !decisionIdStr || !userChoiceStr) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId, decisionId, userChoice 都是必填参数"));
        return;
      }
      
      const task = await storage.getTask(taskIdStr);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const pendingDecisions = task.meta?.pendingDecisions || [];
      const decision = pendingDecisions.find((d: Record<string, unknown>) => (d.id as string) === decisionIdStr);
      
      if (!decision) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `决策 ${decisionIdStr} 不存在`));
        return;
      }
      
      decision.userSelected = userChoiceStr;
      decision.status = "user-responded";
      decision.respondedAt = Date.now();
      
      const updatedMeta = {
        ...(task.meta || {}),
        pendingDecisions,
      };
      
      await storage.updateTask(taskIdStr, {
        meta: updatedMeta,
      });
      
      respond(true, { success: true, decision }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to record user response: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * heartbeat.record_master_decision - 记录主控决策（主控→心跳）
   * 
   * 解决逆向信息断链：主控与用户沟通后，将决策结果通知心跳任务
   */
  "heartbeat.record_master_decision": async ({ params, respond }) => {
    try {
      const taskIdStr = typeof params?.taskId === "string" ? params.taskId : (params?.taskId as string) ?? "";
      const decisionIdStr = typeof params?.decisionId === "string" ? params.decisionId : (params?.decisionId as string) ?? "";
      const masterDecisionStr = typeof params?.masterDecision === "string" ? params.masterDecision : (params?.masterDecision as string) ?? "";
      const reasoning = typeof params?.reasoning === "string" ? params.reasoning : undefined;
      const userCommunication = typeof params?.userCommunication === "string" ? params.userCommunication : undefined;
      const actionInstructions = Array.isArray(params?.actionInstructions) ? (params.actionInstructions as string[]) : [];
      
      if (!taskIdStr || !decisionIdStr || !masterDecisionStr) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId, decisionId, masterDecision 都是必填参数"));
        return;
      }
      
      const task = await storage.getTask(taskIdStr);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      // 更新待决策事项的状态
      const pendingDecisions = task.meta?.pendingDecisions || [];
      const decision = pendingDecisions.find((d: Record<string, unknown>) => (d.id as string) === decisionIdStr);
      
      if (!decision) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `决策 ${decisionIdStr} 不存在`));
        return;
      }
      
      // 更新决策状态
      decision.masterDecision = masterDecisionStr;
      decision.status = "master-decided";
      decision.decidedAt = Date.now();
      
      // 保存主控反馈
      const masterFeedback = {
        lastDecisionAt: Date.now(),
        decision: masterDecisionStr,
        reasoning,
        userCommunication,
        actionInstructions,
        nextCheckpoint: Date.now() + 30 * 60 * 1000, // 30分钟后下次检查
      };
      
      const updatedMeta = {
        ...(task.meta || {}),
        pendingDecisions,
        masterFeedback,
      };
      
      await storage.updateTask(taskIdStr, {
        meta: updatedMeta,
      });
      
      // 通知心跳任务（如果有独立的心跳任务）
      // 心跳任务下次唤醒时会读取 masterFeedback
      
      respond(true, { success: true, decision, masterFeedback }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get master feedback: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },
};

/**
 * 获取注入原因
 */
function getInjectReason(summary: HeartbeatStateSummary): string {
  const reasons: string[] = [];
  
  if (summary.healthStatus.score < 60) {
    reasons.push(`健康度下降 (${summary.healthStatus.score}分)`);
  }
  
  const pendingMasters = summary.pendingDecisions.filter(
    (d: HeartbeatStateSummary["pendingDecisions"][number]) => d.status === "awaiting-master"
  );
  if (pendingMasters.length > 0) {
    reasons.push(`有 ${pendingMasters.length} 个待主控决策的事项`);
  }
  
  const userResponded = summary.pendingDecisions.filter(
    (d: HeartbeatStateSummary["pendingDecisions"][number]) => d.status === "user-responded"
  );
  if (userResponded.length > 0) {
    reasons.push(`用户已响应 ${userResponded.length} 个决策`);
  }
  
  return reasons.join("；") || "周期性总结";
}
