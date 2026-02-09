/**
 * 技能管理 Gateway RPC 方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { skillManagement } from "../../lifecycle/skill-management.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const skillManagementHandlers: GatewayRequestHandlers = {
  /**
   * 添加技能定义
   */
  "skills.definition.add": async ({ params, respond }) => {
    try {
      const skill = params?.skill;

      if (!skill || typeof skill !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skill is required"));
        return;
      }

      skillManagement.addSkill(skill as any);

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
   * 获取技能定义
   */
  "skills.definition.get": async ({ params, respond }) => {
    try {
      const skillId = String(params?.skillId ?? "").trim();

      if (!skillId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skillId is required"));
        return;
      }

      const skill = skillManagement.getSkill(skillId);

      if (!skill) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Skill not found: ${skillId}`),
        );
        return;
      }

      respond(true, { skill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get skill: ${String(error)}`),
      );
    }
  },

  /**
   * 列出所有技能定义
   */
  "skills.definition.list": async ({ params, respond }) => {
    try {
      const category = params?.category ? String(params.category) : undefined;

      const skills = category
        ? skillManagement.getSkillsByCategory(category as any)
        : skillManagement.getAllSkills();

      respond(true, { skills, total: skills.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list skills: ${String(error)}`),
      );
    }
  },

  /**
   * 更新技能定义
   */
  "skills.definition.update": async ({ params, respond }) => {
    try {
      const skillId = String(params?.skillId ?? "").trim();
      const updates = params?.updates;

      if (!skillId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skillId is required"));
        return;
      }

      if (!updates || typeof updates !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "updates is required"));
        return;
      }

      const skill = skillManagement.updateSkill(skillId, updates);

      respond(true, { skill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update skill: ${String(error)}`),
      );
    }
  },

  /**
   * 删除技能定义
   */
  "skills.definition.delete": async ({ params, respond }) => {
    try {
      const skillId = String(params?.skillId ?? "").trim();

      if (!skillId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skillId is required"));
        return;
      }

      const success = skillManagement.deleteSkill(skillId);

      respond(true, { success }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete skill: ${String(error)}`),
      );
    }
  },

  /**
   * 授予智能助手技能
   */
  "skills.agent.grant": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();
      const level = String(params?.level ?? "novice").trim();
      const acquiredFrom = params?.acquiredFrom ? String(params.acquiredFrom) : undefined;

      if (!agentId || !skillId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and skillId are required"),
        );
        return;
      }

      const agentSkill = skillManagement.grantSkill({
        agentId,
        skillId,
        level: level as any,
        acquiredFrom,
      });

      respond(true, { agentSkill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to grant skill: ${String(error)}`),
      );
    }
  },

  /**
   * 升级智能助手技能
   */
  "skills.agent.levelUp": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();

      if (!agentId || !skillId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and skillId are required"),
        );
        return;
      }

      const agentSkill = skillManagement.levelUpSkill(agentId, skillId);

      respond(true, { agentSkill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to level up skill: ${String(error)}`),
      );
    }
  },

  /**
   * 获取智能助手的技能
   */
  "skills.agent.get": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();

      if (!agentId || !skillId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and skillId are required"),
        );
        return;
      }

      const agentSkill = skillManagement.getAgentSkill(agentId, skillId);

      if (!agentSkill) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Agent skill not found: ${agentId}/${skillId}`),
        );
        return;
      }

      respond(true, { agentSkill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get agent skill: ${String(error)}`),
      );
    }
  },

  /**
   * 列出智能助手的所有技能
   */
  "skills.agent.list": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();

      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }

      const agentSkills = skillManagement.getAgentSkills(agentId);

      respond(true, { skills: agentSkills, total: agentSkills.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list agent skills: ${String(error)}`),
      );
    }
  },

  /**
   * 认证智能助手技能
   */
  "skills.agent.certify": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();
      const expiresIn = params?.expiresIn ? Number(params.expiresIn) : undefined;

      if (!agentId || !skillId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and skillId are required"),
        );
        return;
      }

      const agentSkill = skillManagement.certifySkill({
        agentId,
        skillId,
        expiryDuration: expiresIn,
      });

      respond(true, { agentSkill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to certify skill: ${String(error)}`),
      );
    }
  },

  /**
   * 评估智能助手技能
   */
  "skills.agent.assess": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();
      const score = Number(params?.score ?? 0);

      if (!agentId || !skillId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and skillId are required"),
        );
        return;
      }

      const agentSkill = skillManagement.assessSkill(agentId, skillId, score);

      respond(true, { agentSkill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to assess skill: ${String(error)}`),
      );
    }
  },

  /**
   * 记录技能使用
   */
  "skills.agent.recordUsage": async ({ params, respond }) => {
    try {
      const agentId = String(params?.agentId ?? "").trim();
      const skillId = String(params?.skillId ?? "").trim();

      if (!agentId || !skillId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and skillId are required"),
        );
        return;
      }

      const agentSkill = skillManagement.recordSkillUsage(agentId, skillId);

      respond(true, { agentSkill }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to record skill usage: ${String(error)}`),
      );
    }
  },

  /**
   * 获取技能统计信息
   */
  "skills.statistics": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId).trim() : undefined;

      const stats = agentId
        ? skillManagement.getAgentSkillStatistics(agentId)
        : skillManagement.getGlobalStatistics();

      respond(true, { statistics: stats }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get statistics: ${String(error)}`),
      );
    }
  },
};
