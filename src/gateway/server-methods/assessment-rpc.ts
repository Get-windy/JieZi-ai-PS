/**
 * Assessment RPC 处理器
 *
 * 提供评估相关的RPC方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { assessmentSystem } from "../../lifecycle/assessment-system.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const assessmentHandlers: GatewayRequestHandlers = {
  /**
   * 创建技能评估
   */
  "assessment.skill.create": async ({ params, respond }) => {
    const { agentId, skillIds, assessor, scores, feedback, validDays } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    if (!Array.isArray(skillIds) || skillIds.length === 0) {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing skillIds"));
      return;
    }

    try {
      // 转换 scores 对象为 Map
      const scoresMap = scores ? new Map(Object.entries(scores)) : undefined;

      const assessment = assessmentSystem.createSkillAssessment({
        agentId,
        skillIds,
        assessor: typeof assessor === "string" ? assessor : undefined,
        scores: scoresMap,
        feedback: typeof feedback === "string" ? feedback : undefined,
        validDays: typeof validDays === "number" ? validDays : undefined,
      });

      respond(true, { assessment }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 创建绩效评估
   */
  "assessment.performance.create": async ({ params, respond }) => {
    const {
      agentId,
      assessor,
      score,
      strengths,
      weaknesses,
      recommendations,
      feedback,
      metadata,
      validDays,
    } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    if (!assessor || typeof assessor !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing assessor"));
      return;
    }

    if (typeof score !== "number") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing score"));
      return;
    }

    try {
      const assessment = assessmentSystem.createPerformanceAssessment({
        agentId,
        assessor,
        score,
        strengths: Array.isArray(strengths) ? strengths : undefined,
        weaknesses: Array.isArray(weaknesses) ? weaknesses : undefined,
        recommendations: Array.isArray(recommendations) ? recommendations : undefined,
        feedback: typeof feedback === "string" ? feedback : undefined,
        metadata: typeof metadata === "object" && metadata !== null ? metadata : undefined,
        validDays: typeof validDays === "number" ? validDays : undefined,
      });

      respond(true, { assessment }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 创建360度反馈评估
   */
  "assessment.360feedback.create": async ({ params, respond }) => {
    const { agentId, feedbackData, validDays } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    if (!Array.isArray(feedbackData) || feedbackData.length === 0) {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing feedbackData"));
      return;
    }

    try {
      // 转换数据格式
      const processedFeedback = feedbackData.map((item: any) => ({
        assessor: item.assessor,
        role: item.role,
        scores: new Map(Object.entries(item.scores || {}).map(([k, v]) => [k, Number(v)])),
        feedback: item.feedback,
      }));

      const assessment = assessmentSystem.create360FeedbackAssessment({
        agentId,
        feedbackData: processedFeedback,
        validDays: typeof validDays === "number" ? validDays : undefined,
      });

      respond(true, { assessment }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 创建自我评估
   */
  "assessment.self.create": async ({ params, respond }) => {
    const { agentId, skillIds, selfRatings, strengths, weaknesses, goals, validDays } =
      params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    if (!selfRatings || typeof selfRatings !== "object") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing selfRatings"));
      return;
    }

    try {
      const ratingsMap = new Map(Object.entries(selfRatings));

      const assessment = assessmentSystem.createSelfAssessment({
        agentId,
        skillIds: Array.isArray(skillIds) ? skillIds : undefined,
        selfRatings: ratingsMap,
        strengths: Array.isArray(strengths) ? strengths : undefined,
        weaknesses: Array.isArray(weaknesses) ? weaknesses : undefined,
        goals: Array.isArray(goals) ? goals : undefined,
        validDays: typeof validDays === "number" ? validDays : undefined,
      });

      respond(true, { assessment }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 创建知识评估
   */
  "assessment.knowledge.create": async ({ params, respond }) => {
    const { agentId, courseId, assessor, score, breakdown, feedback, validDays } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    if (typeof score !== "number") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing score"));
      return;
    }

    try {
      const breakdownMap = breakdown ? new Map(Object.entries(breakdown)) : undefined;

      const assessment = assessmentSystem.createKnowledgeAssessment({
        agentId,
        courseId: typeof courseId === "string" ? courseId : undefined,
        assessor: typeof assessor === "string" ? assessor : undefined,
        score,
        breakdown: breakdownMap,
        feedback: typeof feedback === "string" ? feedback : undefined,
        validDays: typeof validDays === "number" ? validDays : undefined,
      });

      respond(true, { assessment }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取评估
   */
  "assessment.get": async ({ params, respond }) => {
    const { assessmentId } = params || {};

    if (!assessmentId || typeof assessmentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing assessmentId"));
      return;
    }

    try {
      const assessment = assessmentSystem.getAssessment(assessmentId);
      if (!assessment) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Assessment not found"));
        return;
      }

      respond(true, { assessment }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取智能助手的所有评估
   */
  "assessment.agent.list": async ({ params, respond }) => {
    const { agentId, type } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      let assessments;

      if (type && typeof type === "string") {
        assessments = assessmentSystem.getAssessmentsByType(agentId, type as any);
      } else {
        assessments = assessmentSystem.getAgentAssessments(agentId);
      }

      respond(true, { assessments, total: assessments.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取有效评估
   */
  "assessment.agent.valid": async ({ params, respond }) => {
    const { agentId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const assessments = assessmentSystem.getValidAssessments(agentId);
      respond(true, { assessments, total: assessments.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取最近评估
   */
  "assessment.agent.latest": async ({ params, respond }) => {
    const { agentId, type } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const assessment = assessmentSystem.getLatestAssessment(
        agentId,
        type && typeof type === "string" ? (type as any) : undefined,
      );

      respond(true, { assessment }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取评估趋势
   */
  "assessment.trend": async ({ params, respond }) => {
    const { agentId, type } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const trend = assessmentSystem.getAssessmentTrend(
        agentId,
        type && typeof type === "string" ? (type as any) : undefined,
      );

      respond(true, { trend }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 比较智能助手评估
   */
  "assessment.compare": async ({ params, respond }) => {
    const { agentIds } = params || {};

    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentIds array"));
      return;
    }

    try {
      const comparison = assessmentSystem.compareAgentAssessments(agentIds);
      respond(true, { comparison }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取评估统计
   */
  "assessment.statistics": async ({ params, respond }) => {
    const { agentId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const statistics = assessmentSystem.getAssessmentStatistics(agentId);
      respond(true, { statistics }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 删除评估
   */
  "assessment.delete": async ({ params, respond }) => {
    const { assessmentId } = params || {};

    if (!assessmentId || typeof assessmentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing assessmentId"));
      return;
    }

    try {
      const deleted = assessmentSystem.deleteAssessment(assessmentId);
      if (!deleted) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Assessment not found"));
        return;
      }

      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取所有评估
   */
  "assessment.list": async ({ respond }) => {
    try {
      const assessments = assessmentSystem.getAllAssessments();
      respond(true, { assessments, total: assessments.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
