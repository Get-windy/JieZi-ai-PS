/**
 * 知识沉淀 RPC 方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { knowledgeAutoSink } from "../../workspace/knowledge-auto-sink.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 知识沉淀 RPC 方法处理器
 */
export const knowledgeSinkHandlers: GatewayRequestHandlers = {
  /**
   * knowledge.recordMessage - 记录会话消息
   */
  "knowledge.recordMessage": ({ params, respond }) => {
    try {
      const sessionId = String(params?.sessionId ?? "").trim();
      const message = params?.message;

      if (!sessionId || !message) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and message are required"),
        );
        return;
      }

      knowledgeAutoSink.recordMessage(sessionId, message as any);

      respond(true, { ok: true, message: "Message recorded successfully" }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to record message: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.endSession - 结束会话并触发知识沉淀
   */
  "knowledge.endSession": async ({ params, respond }) => {
    try {
      const sessionId = String(params?.sessionId ?? "").trim();

      if (!sessionId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId is required"));
        return;
      }

      await knowledgeAutoSink.endSession(sessionId);

      respond(true, { ok: true, message: "Session ended and knowledge sink triggered" }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to end session: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.generateMeetingNotes - 生成会议纪要
   */
  "knowledge.generateMeetingNotes": async ({ params, respond }) => {
    try {
      const sessionContext = params?.sessionContext;

      if (!sessionContext) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionContext is required"),
        );
        return;
      }

      const notes = await knowledgeAutoSink.generateMeetingNotes(sessionContext as any);

      respond(true, notes, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to generate meeting notes: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.generateADR - 生成架构决策记录
   */
  "knowledge.generateADR": async ({ params, respond }) => {
    try {
      const sessionContext = params?.sessionContext;

      if (!sessionContext) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionContext is required"),
        );
        return;
      }

      const adr = await knowledgeAutoSink.generateADR(sessionContext as any);

      respond(true, adr, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to generate ADR: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.get - 获取知识库项
   */
  "knowledge.get": ({ params, respond }) => {
    try {
      const id = String(params?.id ?? "").trim();

      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }

      const knowledge = knowledgeAutoSink.getKnowledge(id);

      if (!knowledge) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Knowledge not found: ${id}`));
        return;
      }

      respond(true, knowledge, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get knowledge: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.list - 列出所有知识
   */
  "knowledge.list": ({ params, respond }) => {
    try {
      const type = params?.type as "meeting" | "adr" | "practice" | undefined;

      const knowledge = knowledgeAutoSink.listKnowledge(type);

      respond(true, { knowledge }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list knowledge: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.statistics - 获取统计信息
   */
  "knowledge.statistics": ({ respond }) => {
    try {
      const stats = knowledgeAutoSink.getStatistics();
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
   * knowledge.addTrigger - 添加触发条件
   */
  "knowledge.addTrigger": ({ params, respond }) => {
    try {
      const trigger = params?.trigger;

      if (!trigger || typeof trigger !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "trigger is required"));
        return;
      }

      knowledgeAutoSink.addTrigger(trigger as any);

      respond(true, { ok: true, message: "Trigger added successfully" }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to add trigger: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.removeTrigger - 移除触发条件
   */
  "knowledge.removeTrigger": ({ params, respond }) => {
    try {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "removeTrigger method not yet implemented"),
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to remove trigger: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.export - 导出知识库
   */
  "knowledge.export": async ({ params, respond }) => {
    try {
      const type = params?.type as "meeting" | "adr" | "practice" | undefined;
      const knowledge = knowledgeAutoSink.listKnowledge(type);

      respond(true, { knowledge, total: knowledge.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to export knowledge: ${String(error)}`),
      );
    }
  },

  /**
   * knowledge.search - 搜索知识库
   */
  "knowledge.search": ({ params, respond }) => {
    try {
      const query = String(params?.query ?? "").trim();
      const type = params?.type as "meeting" | "adr" | "practice" | undefined;

      if (!query) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query is required"));
        return;
      }

      // 简单搜索实现：列出所有知识并过滤
      const allKnowledge = knowledgeAutoSink.listKnowledge(type);
      const results = allKnowledge.filter((k: any) => {
        const searchText = JSON.stringify(k).toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      respond(true, { results, total: results.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to search knowledge: ${String(error)}`),
      );
    }
  },
};
