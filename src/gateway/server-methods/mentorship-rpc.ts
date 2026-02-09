/**
 * 师徒关系管理 Gateway RPC 方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { mentorshipManager, type SkillLevel } from "../../organization/mentorship-manager.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const mentorshipHandlers: GatewayRequestHandlers = {
  /**
   * 创建师徒关系
   */
  "mentorship.create": async ({ params, respond }) => {
    try {
      const mentorId = String(params?.mentorId ?? "").trim();
      const apprenticeId = String(params?.apprenticeId ?? "").trim();
      const goals = params?.goals;

      if (!mentorId || !apprenticeId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "mentorId and apprenticeId are required"),
        );
        return;
      }

      if (!Array.isArray(goals) || goals.length === 0) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "goals array is required"),
        );
        return;
      }

      const mentorship = await mentorshipManager.createMentorship({
        mentorId,
        apprenticeId,
        goals: goals.map((g: any) => ({
          skill: String(g.skill),
          targetLevel: String(g.targetLevel) as SkillLevel,
        })),
        learningPlan: params?.learningPlan,
        domain: params?.domain ? String(params.domain) : undefined,
        mode: params?.mode || "one-on-one",
      });

      respond(true, { mentorship }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create mentorship: ${String(error)}`),
      );
    }
  },

  /**
   * 获取师徒关系详情
   */
  "mentorship.get": async ({ params, respond }) => {
    try {
      const mentorshipId = String(params?.mentorshipId ?? "").trim();

      if (!mentorshipId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "mentorshipId is required"),
        );
        return;
      }

      const mentorship = mentorshipManager.getMentorship(mentorshipId);

      if (!mentorship) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, `Mentorship ${mentorshipId} not found`),
        );
        return;
      }

      respond(true, { mentorship }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get mentorship: ${String(error)}`),
      );
    }
  },

  /**
   * 列出师徒关系
   */
  "mentorship.list": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId).trim() : undefined;
      const role = params?.role as "mentor" | "apprentice" | undefined;

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const mentorships = mentorshipManager.getMentorships(agentId, role);

      respond(true, { mentorships, total: mentorships.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list mentorships: ${String(error)}`),
      );
    }
  },

  /**
   * 添加培训记录
   */
  "mentorship.addSession": async ({ params, respond }) => {
    try {
      const mentorshipId = String(params?.mentorshipId ?? "").trim();
      const session = params?.session;

      if (!mentorshipId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "mentorshipId is required"),
        );
        return;
      }

      if (!session || typeof session !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session is required"));
        return;
      }

      await mentorshipManager.addSession(mentorshipId, {
        topic: String(session.topic),
        duration: Number(session.duration),
        notes: session.notes ? String(session.notes) : undefined,
        skillsPracticed: Array.isArray(session.skillsPracticed)
          ? session.skillsPracticed.map((s: any) => String(s))
          : [],
        rating: session.rating ? Number(session.rating) : undefined,
      });

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to add session: ${String(error)}`),
      );
    }
  },

  /**
   * 添加反馈
   */
  "mentorship.addFeedback": async ({ params, respond }) => {
    try {
      const mentorshipId = String(params?.mentorshipId ?? "").trim();
      const from = String(params?.from ?? "").trim() as "mentor" | "apprentice";
      const content = String(params?.content ?? "");
      const rating = params?.rating ? Number(params.rating) : undefined;

      if (!mentorshipId || !from || !content) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "mentorshipId, from, and content are required"),
        );
        return;
      }

      await mentorshipManager.addFeedback(mentorshipId, from, content, rating);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to add feedback: ${String(error)}`),
      );
    }
  },

  /**
   * 更新师徒关系状态
   */
  "mentorship.updateStatus": async ({ params, respond }) => {
    try {
      const mentorshipId = String(params?.mentorshipId ?? "").trim();
      const status = String(params?.status ?? "").trim() as any;

      if (!mentorshipId || !status) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "mentorshipId and status are required"),
        );
        return;
      }

      await mentorshipManager.updateStatus(mentorshipId, status);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update status: ${String(error)}`),
      );
    }
  },

  /**
   * 完成师徒关系
   */
  "mentorship.complete": async ({ params, respond }) => {
    try {
      const mentorshipId = String(params?.mentorshipId ?? "").trim();

      if (!mentorshipId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "mentorshipId is required"),
        );
        return;
      }

      await mentorshipManager.completeMentorship(mentorshipId);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to complete mentorship: ${String(error)}`),
      );
    }
  },

  /**
   * 获取师徒关系统计
   */
  "mentorship.statistics": async ({ params, respond }) => {
    try {
      const mentorshipId = params?.mentorshipId ? String(params.mentorshipId).trim() : undefined;

      if (mentorshipId) {
        // 获取特定师徒关系的统计
        const stats = mentorshipManager.getStatistics(mentorshipId);
        respond(true, { statistics: stats }, undefined);
      } else {
        // 获取全局统计
        const stats = mentorshipManager.getGlobalStatistics();
        respond(true, { statistics: stats }, undefined);
      }
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get statistics: ${String(error)}`),
      );
    }
  },

  /**
   * 添加技能到技能库
   */
  "mentorship.skills.add": async ({ params, respond }) => {
    try {
      const skill = params?.skill;

      if (!skill || typeof skill !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skill is required"));
        return;
      }

      mentorshipManager.addSkill(skill as any);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to add skill: ${String(error)}`),
      );
    }
  },

  /**
   * 搜索技能
   */
  "mentorship.skills.search": async ({ params, respond }) => {
    try {
      const query = String(params?.query ?? "").trim();
      const category = params?.category ? String(params.category).trim() : undefined;

      if (!query) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query is required"));
        return;
      }

      const skills = mentorshipManager.searchSkills(query, category);

      respond(true, { skills, total: skills.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to search skills: ${String(error)}`),
      );
    }
  },

  /**
   * 获取智能助手的所有徒弟
   */
  "mentorship.apprentices": async ({ params, respond }) => {
    try {
      const mentorId = String(params?.mentorId ?? "").trim();

      if (!mentorId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "mentorId is required"));
        return;
      }

      const apprentices = mentorshipManager.getApprentices(mentorId);

      respond(true, { apprentices, total: apprentices.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get apprentices: ${String(error)}`),
      );
    }
  },

  /**
   * 获取智能助手的所有师傅
   */
  "mentorship.mentors": async ({ params, respond }) => {
    try {
      const apprenticeId = String(params?.apprenticeId ?? "").trim();

      if (!apprenticeId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "apprenticeId is required"),
        );
        return;
      }

      const mentors = mentorshipManager.getMentors(apprenticeId);

      respond(true, { mentors, total: mentors.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get mentors: ${String(error)}`),
      );
    }
  },
};
