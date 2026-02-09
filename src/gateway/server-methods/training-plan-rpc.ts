/**
 * Training Plan RPC 处理器
 *
 * 提供培训计划管理的RPC方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { trainingSystem } from "../../lifecycle/training-system.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const trainingPlanHandlers: GatewayRequestHandlers = {
  /**
   * 创建培训计划
   */
  "trainingPlan.create": async ({ params, respond }) => {
    const {
      agentId,
      name,
      description,
      courses,
      targetSkills,
      targetRole,
      startDate,
      endDate,
      createdBy,
    } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    if (!name || typeof name !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing name"));
      return;
    }

    if (!Array.isArray(courses) || courses.length === 0) {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing courses array"));
      return;
    }

    try {
      const planId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const plan = trainingSystem.createTrainingPlan({
        id: planId,
        agentId,
        name,
        description: typeof description === "string" ? description : undefined,
        courses,
        targetSkills: Array.isArray(targetSkills) ? targetSkills : undefined,
        targetRole: typeof targetRole === "string" ? targetRole : undefined,
        startDate: typeof startDate === "number" ? startDate : Date.now(),
        endDate: typeof endDate === "number" ? endDate : undefined,
        createdBy: typeof createdBy === "string" ? createdBy : "system",
      });

      respond(true, { plan }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取培训计划
   */
  "trainingPlan.get": async ({ params, respond }) => {
    const { planId } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    try {
      const plan = trainingSystem.getTrainingPlan(planId);
      if (!plan) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Plan not found"));
        return;
      }

      respond(true, { plan }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 更新培训计划
   */
  "trainingPlan.update": async ({ params, respond }) => {
    const { planId, updates } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    if (!updates || typeof updates !== "object") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing updates"));
      return;
    }

    try {
      const plan = trainingSystem.updateTrainingPlan(planId, updates);
      respond(true, { plan }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 删除培训计划
   */
  "trainingPlan.delete": async ({ params, respond }) => {
    const { planId } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    try {
      const deleted = trainingSystem.deleteTrainingPlan(planId);
      if (!deleted) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Plan not found"));
        return;
      }

      respond(true, { success: true }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取智能助手的培训计划
   */
  "trainingPlan.agent.list": async ({ params, respond }) => {
    const { agentId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const plans = trainingSystem.getAgentTrainingPlans(agentId);
      respond(true, { plans, total: plans.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 激活培训计划
   */
  "trainingPlan.activate": async ({ params, respond }) => {
    const { planId } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    try {
      const plan = trainingSystem.updateTrainingPlan(planId, { status: "active" });
      respond(true, { plan }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 取消培训计划
   */
  "trainingPlan.cancel": async ({ params, respond }) => {
    const { planId } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    try {
      const plan = trainingSystem.updateTrainingPlan(planId, { status: "cancelled" });
      respond(true, { plan }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取培训计划进度
   */
  "trainingPlan.progress": async ({ params, respond }) => {
    const { planId } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    try {
      const plan = trainingSystem.updateTrainingPlanProgress(planId);
      respond(true, { plan, progress: plan.overallProgress }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 添加课程到计划
   */
  "trainingPlan.addCourse": async ({ params, respond }) => {
    const { planId, courseId, order, isRequired, deadline } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    if (!courseId || typeof courseId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing courseId"));
      return;
    }

    try {
      const plan = trainingSystem.getTrainingPlan(planId);
      if (!plan) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Plan not found"));
        return;
      }

      const newCourse = {
        courseId,
        order: typeof order === "number" ? order : plan.courses.length + 1,
        isRequired: isRequired !== false,
        deadline: typeof deadline === "number" ? deadline : undefined,
      };

      plan.courses.push(newCourse);
      plan.updatedAt = Date.now();

      respond(true, { plan }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 从计划中移除课程
   */
  "trainingPlan.removeCourse": async ({ params, respond }) => {
    const { planId, courseId } = params || {};

    if (!planId || typeof planId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing planId"));
      return;
    }

    if (!courseId || typeof courseId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing courseId"));
      return;
    }

    try {
      const plan = trainingSystem.getTrainingPlan(planId);
      if (!plan) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Plan not found"));
        return;
      }

      plan.courses = plan.courses.filter((c) => c.courseId !== courseId);
      plan.completedCourses = plan.completedCourses.filter((id) => id !== courseId);
      plan.updatedAt = Date.now();

      respond(true, { plan }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取所有培训计划
   */
  "trainingPlan.list": async ({ params, respond }) => {
    const { status } = params || {};

    try {
      const allPlans = trainingSystem.getAllTrainingPlans();

      let plans = allPlans;
      if (status && typeof status === "string") {
        plans = allPlans.filter((p: any) => p.status === status);
      }

      respond(true, { plans, total: plans.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 生成推荐培训计划
   */
  "trainingPlan.recommend": async ({ params, respond }) => {
    const { agentId, targetRole, targetSkills } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      // 简化版本：基于目标角色和技能推荐课程
      const allCourses = trainingSystem.getAllCourses();

      const recommendedCourses: Array<{
        courseId: string;
        order: number;
        isRequired: boolean;
        reason: string;
      }> = [];

      // 根据目标技能推荐课程
      if (Array.isArray(targetSkills) && targetSkills.length > 0) {
        allCourses.forEach((course, index) => {
          if (course.requiredSkills) {
            const hasMatchingSkill = course.requiredSkills.some((skillId) =>
              targetSkills.includes(skillId),
            );

            if (hasMatchingSkill) {
              recommendedCourses.push({
                courseId: course.id,
                order: recommendedCourses.length + 1,
                isRequired: course.type === "onboarding" || course.type === "compliance",
                reason: `Required for skills: ${course.requiredSkills.join(", ")}`,
              });
            }
          }
        });
      }

      // 如果没有推荐课程，添加基础课程
      if (recommendedCourses.length === 0) {
        const basicCourses = allCourses
          .filter((c) => c.difficulty === "beginner" || c.type === "onboarding")
          .slice(0, 3);

        basicCourses.forEach((course, index) => {
          recommendedCourses.push({
            courseId: course.id,
            order: index + 1,
            isRequired: course.type === "onboarding",
            reason: "Beginner course recommended for starting",
          });
        });
      }

      const recommendation = {
        agentId,
        targetRole,
        targetSkills,
        recommendedCourses,
        estimatedDuration: recommendedCourses.length * 30, // 简化估算
        confidence: recommendedCourses.length > 0 ? 0.85 : 0.5,
      };

      respond(true, { recommendation }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
