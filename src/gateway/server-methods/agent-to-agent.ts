/**
 * Agent-to-Agent 通信 RPC 方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { agent2AgentManager } from "../../agents/agent-to-agent-tool.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * Agent-to-Agent RPC 方法处理器
 */
export const agent2AgentHandlers: GatewayRequestHandlers = {
  /**
   * agent2agent.send - 发送消息
   */
  "agent2agent.send": async ({ params, respond }) => {
    try {
      const fromAgentId = String(params?.fromAgentId ?? "").trim();
      const toAgentId = String(params?.toAgentId ?? "").trim();
      const content = String(params?.content ?? "");

      if (!fromAgentId || !toAgentId || !content) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "fromAgentId, toAgentId, and content are required",
          ),
        );
        return;
      }

      const type = (params?.type as "request" | "response" | "notification") || "request";
      const priority = (params?.priority as "low" | "normal" | "high" | "urgent") || "normal";

      // 发送消息
      const message = await agent2AgentManager.sendMessage({
        fromAgentId,
        toAgentId,
        content,
        type,
        metadata: {
          priority,
          requiresResponse: params?.requiresResponse !== false,
          inReplyTo: params?.inReplyTo ? String(params.inReplyTo) : undefined,
        },
      });

      respond(true, message, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to send message: ${String(error)}`),
      );
    }
  },

  /**
   * agent2agent.getHistory - 获取对话历史
   */
  "agent2agent.getHistory": ({ params, respond }) => {
    try {
      const agentId1 = String(params?.agentId1 ?? "").trim();
      const agentId2 = String(params?.agentId2 ?? "").trim();
      const limit = typeof params?.limit === "number" ? params.limit : undefined;

      if (!agentId1 || !agentId2) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId1 and agentId2 are required"),
        );
        return;
      }

      const history = agent2AgentManager.getHistory(agentId1, agentId2, limit);

      respond(true, { history }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get history: ${String(error)}`),
      );
    }
  },

  /**
   * agent2agent.allowPair - 允许两个智能助手通信
   */
  "agent2agent.allowPair": ({ params, respond }) => {
    try {
      const agentId1 = String(params?.agentId1 ?? "").trim();
      const agentId2 = String(params?.agentId2 ?? "").trim();
      const bidirectional = params?.bidirectional !== false;

      if (!agentId1 || !agentId2) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId1 and agentId2 are required"),
        );
        return;
      }

      agent2AgentManager.addAllowedPair(agentId1, agentId2, bidirectional);

      respond(true, { ok: true, message: "Pair allowed successfully" }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to allow pair: ${String(error)}`),
      );
    }
  },

  /**
   * agent2agent.setForwardPolicy - 设置转发策略
   */
  "agent2agent.setForwardPolicy": ({ params, respond }) => {
    try {
      const fromAgentId = String(params?.fromAgentId ?? "").trim();
      const toAgentId = String(params?.toAgentId ?? "").trim();
      const policy = params?.policy;

      if (!fromAgentId || !toAgentId || !policy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "fromAgentId, toAgentId, and policy are required"),
        );
        return;
      }

      agent2AgentManager.setForwardPolicy(fromAgentId, toAgentId, policy);

      respond(true, { ok: true, message: "Forward policy set successfully" }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to set forward policy: ${String(error)}`),
      );
    }
  },

  /**
   * agent2agent.getStatistics - 获取统计信息
   */
  "agent2agent.getStatistics": ({ respond }) => {
    try {
      const stats = agent2AgentManager.getStatistics();
      respond(true, stats, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get statistics: ${String(error)}`),
      );
    }
  },

  /**
   * agent2agent.clearHistory - 清除历史
   */
  "agent2agent.clearHistory": ({ params, respond }) => {
    try {
      const agentId1 = params?.agentId1 ? String(params.agentId1).trim() : undefined;
      const agentId2 = params?.agentId2 ? String(params.agentId2).trim() : undefined;

      agent2AgentManager.clearHistory(agentId1, agentId2);

      respond(true, { ok: true, message: "History cleared successfully" }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to clear history: ${String(error)}`),
      );
    }
  },
};
