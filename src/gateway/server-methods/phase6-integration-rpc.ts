/**
 * Phase 6 集成 Gateway RPC 方法
 * 提供完整生命周期工作流程的高级接口
 */

import type { GatewayRequestHandlers } from "./types.js";
import {
  phase6Integration,
  type Phase6IntegrationConfig,
} from "../../lifecycle/phase6-integration.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const phase6IntegrationHandlers: GatewayRequestHandlers = {
  /**
   * 初始化 Phase 6
   */
  "phase6.initialize": async ({ params, respond }) => {
    try {
      const config = params?.config as Phase6IntegrationConfig | undefined;

      await phase6Integration.initialize(config);

      respond(true, { success: true, initialized: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to initialize Phase 6: ${String(error)}`),
      );
    }
  },

  /**
   * 获取 Phase 6 状态
   */
  "phase6.status": async ({ params, respond }) => {
    try {
      const initialized = phase6Integration.isInitialized();
      const config = phase6Integration.getConfig();
      const health = phase6Integration.healthCheck();

      respond(
        true,
        {
          initialized,
          config,
          health,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get Phase 6 status: ${String(error)}`),
      );
    }
  },

  /**
   * 执行完整的入职流程
   */
  "phase6.workflow.onboarding": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const triggeredBy = String(params?.triggeredBy ?? "").trim();
      const mandatoryCourses = Array.isArray(params?.mandatoryCourses)
        ? params.mandatoryCourses.map((c: any) => String(c))
        : [];
      const initialSkills = Array.isArray(params?.initialSkills) ? params.initialSkills : [];

      if (!agentId || !triggeredBy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and triggeredBy are required"),
        );
        return;
      }

      const result = await phase6Integration.onboardingWorkflow({
        agentId,
        triggeredBy,
        mandatoryCourses,
        initialSkills,
      });

      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to execute onboarding workflow: ${String(error)}`,
        ),
      );
    }
  },

  /**
   * 执行晋升流程
   */
  "phase6.workflow.promotion": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const triggeredBy = String(params?.triggeredBy ?? "").trim();
      const newRole = String(params?.newRole ?? "").trim();
      const requiredSkills = Array.isArray(params?.requiredSkills)
        ? params.requiredSkills.map((s: any) => String(s))
        : [];

      if (!agentId || !triggeredBy || !newRole) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId, triggeredBy, and newRole are required"),
        );
        return;
      }

      const result = await phase6Integration.promotionWorkflow({
        agentId,
        triggeredBy,
        newRole,
        requiredSkills,
      });

      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to execute promotion workflow: ${String(error)}`,
        ),
      );
    }
  },

  /**
   * 创建智能助手（含生命周期初始化）
   */
  "phase6.agent.create": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const createdBy = String(params?.createdBy ?? "").trim();

      if (!agentId || !createdBy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and createdBy are required"),
        );
        return;
      }

      const lifecycleState = phase6Integration.createAgent({ agentId, createdBy });

      respond(true, { lifecycleState }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create agent: ${String(error)}`),
      );
    }
  },

  /**
   * 激活智能助手
   */
  "phase6.agent.activate": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const triggeredBy = params?.triggeredBy ? String(params.triggeredBy) : undefined;

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const lifecycleState = phase6Integration.activateAgent({ agentId, triggeredBy });

      respond(true, { lifecycleState }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to activate agent: ${String(error)}`),
      );
    }
  },

  /**
   * 开始培训
   */
  "phase6.agent.startTraining": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const triggeredBy = params?.triggeredBy ? String(params.triggeredBy) : undefined;

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const lifecycleState = phase6Integration.startTraining({ agentId, triggeredBy });

      respond(true, { lifecycleState }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to start training: ${String(error)}`),
      );
    }
  },

  /**
   * 分配培训课程
   */
  "phase6.training.assignCourse": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const courseId = String(params?.courseId ?? "").trim();

      if (!agentId || !courseId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and courseId are required"),
        );
        return;
      }

      const progress = phase6Integration.assignCourse({ agentId, courseId });

      respond(true, { progress }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to assign course: ${String(error)}`),
      );
    }
  },

  /**
   * 完成课程
   */
  "phase6.training.completeCourse": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const courseId = String(params?.courseId ?? "").trim();
      const assessmentScore = params?.assessmentScore ? Number(params.assessmentScore) : undefined;

      if (!agentId || !courseId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and courseId are required"),
        );
        return;
      }

      const progress = phase6Integration.completeCourse({ agentId, courseId, assessmentScore });

      respond(true, { progress }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to complete course: ${String(error)}`),
      );
    }
  },

  /**
   * 为智能助手添加技能
   */
  "phase6.skills.addToAgent": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();
      const initialLevel = params?.initialLevel ? String(params.initialLevel) : undefined;
      const acquiredFrom = params?.acquiredFrom ? String(params.acquiredFrom) : undefined;

      if (!agentId || !skillId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and skillId are required"),
        );
        return;
      }

      const skill = phase6Integration.addSkillToAgent({
        agentId,
        skillId,
        initialLevel: initialLevel as any,
        acquiredFrom,
      });

      respond(true, { skill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to add skill to agent: ${String(error)}`),
      );
    }
  },

  /**
   * 升级技能
   */
  "phase6.skills.upgrade": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();
      const newLevel = String(params?.newLevel ?? "").trim();

      if (!agentId || !skillId || !newLevel) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId, skillId, and newLevel are required"),
        );
        return;
      }

      const skill = phase6Integration.upgradeSkill({
        agentId,
        skillId,
        newLevel: newLevel as any,
      });

      respond(true, { skill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to upgrade skill: ${String(error)}`),
      );
    }
  },

  /**
   * 技能差距分析
   */
  "phase6.skills.analyzeGap": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const targetSkills = Array.isArray(params?.targetSkills)
        ? params.targetSkills.map((s: any) => String(s))
        : [];

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const analysis = phase6Integration.analyzeSkillGap({ agentId, targetSkills });

      respond(true, analysis, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to analyze skill gap: ${String(error)}`),
      );
    }
  },

  /**
   * 获取培训统计
   */
  "phase6.training.getStats": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const stats = phase6Integration.getTrainingStats(agentId);

      respond(true, { statistics: stats }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get training stats: ${String(error)}`),
      );
    }
  },

  /**
   * Health check
   */
  "phase6.healthCheck": async ({ params, respond }) => {
    try {
      const health = phase6Integration.healthCheck();

      respond(true, health, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to perform health check: ${String(error)}`),
      );
    }
  },
};
