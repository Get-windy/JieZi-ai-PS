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
      const taskId = params?.taskId ? String(params.taskId) : "";
      const recentChecksCount = params?.recentChecksCount ? Number(params.recentChecksCount) : 10;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const checkHistory = (task.meta?.heartbeatChecks || [])
        .slice(-recentChecksCount)
        .map((check: any) => ({
          timestamp: check.timestamp || 0,
          status: check.status || "passed",
          findings: check.findings || [],
          healthScore: check.healthScore ?? 100,
        }));
      
      const pendingDecisions = (task.meta?.pendingDecisions || [])
        .filter((d: any) => d.status !== "resolved")
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
      const taskId = params?.taskId ? String(params.taskId) : "";
      const periodMinutes = params?.periodMinutes ? Number(params.periodMinutes) : 60;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const checkHistory = (task.meta?.heartbeatChecks || [])
        .map((check: any) => ({
          id: check.id || `check-${check.timestamp}`,
          timestamp: check.timestamp || 0,
          checkType: check.checkType || "default",
          status: check.status || "passed",
          findings: check.findings || [],
          healthScore: check.healthScore ?? 100,
        }));
      
      const issuesHandled = (task.meta?.handledIssues || [])
        .map((issue: any) => ({
          id: issue.id || `issue-${issue.detectedAt}`,
          type: issue.type || "unknown",
          description: issue.description || "",
          detectedAt: issue.detectedAt || 0,
          resolution: issue.resolution,
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
      const taskId = params?.taskId ? String(params.taskId) : "";
      const maxEntries = params?.maxEntries ? Number(params.maxEntries) : 50;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const checkHistory = (task.meta?.heartbeatChecks || [])
        .map((check: any) => ({
          id: check.id || `check-${check.timestamp}`,
          timestamp: check.timestamp || 0,
          checkType: check.checkType || "default",
          status: check.status || "passed",
          findings: check.findings || [],
          healthScore: check.healthScore ?? 100,
          actions: check.actions || [],
        }));
      
      const issueResolutionChain = (task.meta?.issueResolutionChain || [])
        .map((chain: any) => ({
          issueId: chain.issueId,
          timeline: chain.timeline || [],
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
      const taskId = params?.taskId ? String(params.taskId) : "";
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const recentChecks = (task.meta?.heartbeatChecks || [])
        .slice(-10)
        .map((check: any) => ({
          timestamp: check.timestamp || 0,
          status: check.status || "passed",
          findings: check.findings || [],
          healthScore: check.healthScore ?? 100,
        }));
      
      const pendingDecisions = (task.meta?.pendingDecisions || [])
        .filter((d: any) => d.status !== "resolved")
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
      const taskId = params?.taskId ? String(params.taskId) : "";
      const includeProgress = params?.includeProgress ? Boolean(params.includeProgress) : false;
      const periodMinutes = params?.periodMinutes ? Number(params.periodMinutes) : 60;
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const recentChecks = (task.meta?.heartbeatChecks || [])
        .slice(-10)
        .map((check: any) => ({
          timestamp: check.timestamp || 0,
          status: check.status || "passed",
          findings: check.findings || [],
          healthScore: check.healthScore ?? 100,
        }));
      
      const pendingDecisions = (task.meta?.pendingDecisions || [])
        .filter((d: any) => d.status !== "resolved")
        .slice(0, 5);
      
      const summary = generateHeartbeatSummary(task, recentChecks, pendingDecisions, DEFAULT_CONTEXT_CONFIG);
      
      let progressReport;
      if (includeProgress) {
        const checkHistory = (task.meta?.heartbeatChecks || [])
          .map((check: any) => ({
            id: check.id || `check-${check.timestamp}`,
            timestamp: check.timestamp || 0,
            checkType: check.checkType || "default",
            status: check.status || "passed",
            findings: check.findings || [],
            healthScore: check.healthScore ?? 100,
          }));
        
        const issuesHandled = (task.meta?.handledIssues || [])
          .map((issue: any) => ({
            id: issue.id || `issue-${issue.detectedAt}`,
            type: issue.type || "unknown",
            description: issue.description || "",
            detectedAt: issue.detectedAt || 0,
            resolution: issue.resolution,
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
      const taskId = params?.taskId ? String(params.taskId) : "";
      const decisionId = params?.decisionId ? String(params.decisionId) : "";
      const userChoice = params?.userChoice ? String(params.userChoice) : "";
      
      if (!taskId || !decisionId || !userChoice) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId, decisionId, userChoice 都是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const pendingDecisions = task.meta?.pendingDecisions || [];
      const decision = pendingDecisions.find((d: any) => d.id === decisionId);
      
      if (!decision) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `决策 ${decisionId} 不存在`));
        return;
      }
      
      decision.userSelected = userChoice;
      decision.status = "user-responded";
      decision.respondedAt = Date.now();
      
      task.meta = task.meta || {};
      task.meta.pendingDecisions = pendingDecisions;
      
      await storage.save(task);
      
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
      const taskId = params?.taskId ? String(params.taskId) : "";
      const decisionId = params?.decisionId ? String(params.decisionId) : "";
      const masterDecision = params?.masterDecision ? String(params.masterDecision) : "";
      const reasoning = params?.reasoning ? String(params.reasoning) : undefined;
      const userCommunication = params?.userCommunication ? String(params.userCommunication) : undefined;
      const actionInstructions = params?.actionInstructions ? (params.actionInstructions as string[]) : [];
      
      if (!taskId || !decisionId || !masterDecision) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId, decisionId, masterDecision 都是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      // 更新待决策事项的状态
      const pendingDecisions = task.meta?.pendingDecisions || [];
      const decision = pendingDecisions.find((d: any) => d.id === decisionId);
      
      if (!decision) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `决策 ${decisionId} 不存在`));
        return;
      }
      
      // 更新决策状态
      decision.masterDecision = masterDecision;
      decision.status = "master-decided";
      decision.decidedAt = Date.now();
      
      // 保存主控反馈
      const masterFeedback = {
        lastDecisionAt: Date.now(),
        decision: masterDecision,
        reasoning,
        userCommunication,
        actionInstructions,
        nextCheckpoint: Date.now() + 30 * 60 * 1000, // 30分钟后下次检查
      };
      
      task.meta = task.meta || {};
      task.meta.pendingDecisions = pendingDecisions;
      task.meta.masterFeedback = masterFeedback;
      
      await storage.save(task);
      
      // 通知心跳任务（如果有独立的心跳任务）
      // 心跳任务下次唤醒时会读取 masterFeedback
      
      respond(true, { success: true, decision, masterFeedback }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to record master decision: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * heartbeat.get_master_feedback - 获取主控反馈（心跳→读取主控决策）
   * 
   * 心跳任务唤醒时调用，获取主控的最新决策和指示
   */
  "heartbeat.get_master_feedback": async ({ params, respond }) => {
    try {
      const taskId = params?.taskId ? String(params.taskId) : "";
      
      if (!taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId 是必填参数"));
        return;
      }
      
      const task = await storage.loadOne(taskId);
      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `任务 ${taskId} 不存在`));
        return;
      }
      
      const masterFeedback = task.meta?.masterFeedback || null;
      const pendingDecisions = task.meta?.pendingDecisions || [];
      
      // 过滤出已有主控决策的事项
      const masterDecisions = pendingDecisions.filter(
        (d: any) => d.status === "master-decided" || d.status === "resolved"
      );
      
      respond(true, {
        masterFeedback,
        masterDecisions,
        hasNewFeedback: masterFeedback !== null,
        lastDecisionAt: masterFeedback?.lastDecisionAt || null,
      }, undefined);
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
function getInjectReason(summary: any): string {
  const reasons: string[] = [];
  
  if (summary.healthStatus.score < 60) {
    reasons.push(`健康度下降 (${summary.healthStatus.score}分)`);
  }
  
  const pendingMasters = summary.pendingDecisions.filter((d: any) => d.status === "awaiting-master");
  if (pendingMasters.length > 0) {
    reasons.push(`有 ${pendingMasters.length} 个待主控决策的事项`);
  }
  
  const userResponded = summary.pendingDecisions.filter((d: any) => d.status === "user-responded");
  if (userResponded.length > 0) {
    reasons.push(`用户已响应 ${userResponded.length} 个决策`);
  }
  
  return reasons.join("；") || "周期性总结";
}
