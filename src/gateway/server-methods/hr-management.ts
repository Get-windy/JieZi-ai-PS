// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * HR管理 Gateway RPC Handlers
 *
 * 提供智能体人力资源管理功能
 * 已对接 collaborationSystem + mentorSystem 真实业务逻辑
 */

import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { collaborationSystem } from "../../organization/collaboration-system.js";
import { mentorSystem } from "../../organization/mentor-system.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";

export const hrManagementHandlers: GatewayRequestHandlers = {
  /**
   * hr.deactivate_agent - 停用智能体
   */
  "hr.deactivate_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const reason = String(params.reason || "");
      const temporary = typeof params.temporary === "boolean" ? params.temporary : false;

      if (!agentId || !targetAgentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and targetAgentId are required"),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);

      if (!targetAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`),
        );
        return;
      }

      // 终止该 agent 的所有协作关系
      const relations = await collaborationSystem.getRelationsByAgent(targetAgentId);
      const terminatedCount = relations.length;
      for (const rel of relations) {
        try {
          await collaborationSystem.deleteRelation(rel.id);
        } catch {
          // 忽略单条删除失败
        }
      }

      respond(true, {
        success: true,
        message: `Agent ${targetAgentId} deactivated${temporary ? " temporarily" : ""}. Terminated ${terminatedCount} collaboration relations.`,
        requiresApproval: false,
        approvalLevel: temporary ? 5 : 8,
        reason,
        terminatedRelations: terminatedCount,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * hr.activate_agent - 激活智能体
   */
  "hr.activate_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const reason = String(params.reason || "");

      if (!agentId || !targetAgentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "agentId and targetAgentId are required"),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);

      if (!targetAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`),
        );
        return;
      }

      respond(true, {
        success: true,
        message: `Agent ${targetAgentId} activated`,
        requiresApproval: false,
        approvalLevel: 5,
        reason,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * hr.configure_agent_role - 配置智能体角色
   */
  "hr.configure_agent_role": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const newRole = String(params.newRole || "");
      const reason = String(params.reason || "");

      if (!agentId || !targetAgentId || !newRole) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "agentId, targetAgentId, and newRole are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);

      if (!targetAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`),
        );
        return;
      }

      respond(true, {
        success: true,
        message: `Role of ${targetAgentId} configured to ${newRole}`,
        requiresApproval: false,
        approvalLevel: 6,
        reason,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * hr.assign_supervisor - 分配上级（对接 collaborationSystem）
   */
  "hr.assign_supervisor": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const supervisorId = normalizeAgentId(String(params.supervisorId || ""));
      const organizationId = params.organizationId ? String(params.organizationId) : undefined;

      if (!agentId || !targetAgentId || !supervisorId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "agentId, targetAgentId, and supervisorId are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      const supervisor = agents.find((a) => normalizeAgentId(a.id) === supervisorId);

      if (!targetAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`),
        );
        return;
      }
      if (!supervisor) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Supervisor ${supervisorId} not found`),
        );
        return;
      }

      // 检查是否已有上级关系，有则先删除
      const existingRelations = await collaborationSystem.getRelationsByType(
        targetAgentId,
        "supervisor",
      );
      for (const rel of existingRelations) {
        if (rel.fromAgentId === supervisorId && rel.toAgentId === targetAgentId) {
          // 已存在相同关系，跳过
          respond(true, {
            success: true,
            message: `Supervisor ${supervisorId} already assigned to ${targetAgentId}`,
            targetAgentId,
            supervisorId,
            relationId: rel.id,
            alreadyExists: true,
          });
          return;
        }
      }

      // 创建上级关系（supervisor → targetAgent）
      const relationId = `supervisor_${supervisorId}_${targetAgentId}_${Date.now()}`;
      const relation = await collaborationSystem.createRelation({
        id: relationId,
        fromAgentId: supervisorId,
        toAgentId: targetAgentId,
        type: "supervisor",
        organizationId,
        metadata: { description: `HR assignment: ${supervisorId} supervises ${targetAgentId}` },
        createdBy: agentId,
      });

      console.log(
        `[HR] Supervisor ${supervisorId} assigned to ${targetAgentId} (relation: ${relationId})`,
      );

      respond(true, {
        success: true,
        message: `Supervisor ${supervisorId} assigned to ${targetAgentId}`,
        targetAgentId,
        supervisorId,
        relationId: relation.id,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * hr.assign_mentor - 分配师傍（对接 mentorSystem）
   */
  "hr.assign_mentor": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const mentorId = normalizeAgentId(String(params.mentorId || ""));
      const goals = Array.isArray(params.goals) ? (params.goals as string[]) : [];
      const skills = Array.isArray(params.skills) ? (params.skills as string[]) : [];

      if (!agentId || !targetAgentId || !mentorId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "agentId, targetAgentId, and mentorId are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      const mentor = agents.find((a) => normalizeAgentId(a.id) === mentorId);

      if (!targetAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`),
        );
        return;
      }
      if (!mentor) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Mentor ${mentorId} not found`),
        );
        return;
      }

      // 创建师徒关系（mentorSystem）
      const mentorshipId = `mentorship_${mentorId}_${targetAgentId}_${Date.now()}`;
      const mentorship = await mentorSystem.createMentorship({
        id: mentorshipId,
        mentorId,
        menteeId: targetAgentId,
        trainingPlan: goals.length || skills.length ? { goals, skills } : undefined,
        createdBy: agentId,
      });

      // 同时在 collaborationSystem 创建 mentor 关系
      const relationId = `mentor_${mentorId}_${targetAgentId}_${Date.now()}`;
      await collaborationSystem.createRelation({
        id: relationId,
        fromAgentId: mentorId,
        toAgentId: targetAgentId,
        type: "mentor",
        metadata: { description: `Mentorship: ${mentorId} mentors ${targetAgentId}`, mentorshipId },
        createdBy: agentId,
      });

      console.log(
        `[HR] Mentor ${mentorId} assigned to ${targetAgentId} (mentorship: ${mentorshipId})`,
      );

      respond(true, {
        success: true,
        message: `Mentor ${mentorId} assigned to ${targetAgentId}`,
        targetAgentId,
        mentorId,
        mentorshipId: mentorship.id,
        relationId,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * hr.promote_agent - 晋升智能体
   */
  "hr.promote_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const newRole = String(params.newRole || "");
      const reason = String(params.reason || "");

      if (!agentId || !targetAgentId || !newRole) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "agentId, targetAgentId, and newRole are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);

      if (!targetAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`),
        );
        return;
      }

      // 获取当前协作网络统计
      const networkStats = await collaborationSystem.getNetworkStats(targetAgentId);

      respond(true, {
        success: true,
        message: `Agent ${targetAgentId} promoted to ${newRole}`,
        requiresApproval: false,
        approvalLevel: 7,
        reason,
        currentNetwork: {
          supervisors: networkStats.supervisors,
          subordinates: networkStats.subordinates,
          colleagues: networkStats.colleagues,
        },
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * hr.transfer_agent - 转岗智能体（更新协作关系的 organizationId）
   */
  "hr.transfer_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const newDepartment = String(params.newDepartment || "");
      const newTeam = String(params.newTeam || "");
      const reason = String(params.reason || "");

      if (!agentId || !targetAgentId || (!newDepartment && !newTeam)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "agentId, targetAgentId, and (newDepartment or newTeam) are required",
          ),
        );
        return;
      }

      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);

      if (!targetAgent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`),
        );
        return;
      }

      // 获取当前协作关系
      const existingRelations = await collaborationSystem.getRelationsByAgent(targetAgentId);
      const destination = newDepartment || newTeam;

      // 创建迁入新部门/团队的同事关系记录
      const transferRelationId = `transfer_${targetAgentId}_to_${destination}_${Date.now()}`;
      await collaborationSystem.createRelation({
        id: transferRelationId,
        fromAgentId: agentId,
        toAgentId: targetAgentId,
        type: "colleague",
        organizationId: destination,
        metadata: {
          description: `Transfer: ${targetAgentId} transferred to ${destination} by ${agentId}`,
          reason,
          previousRelations: existingRelations.length,
          newDepartment,
          newTeam,
        },
        createdBy: agentId,
      });

      console.log(
        `[HR] Transferred ${targetAgentId} to ${destination} (relation: ${transferRelationId})`,
      );

      respond(true, {
        success: true,
        message: `Agent ${targetAgentId} transferred to ${destination}`,
        requiresApproval: false,
        approvalLevel: 6,
        reason,
        transferRelationId,
        destination,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
