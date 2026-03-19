// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * 项目跨团队协作与交付（Handoff）RPC Handlers
 *
 * 实现项目生命周期中的团队责任转移机制：
 * - 同一项目对不同团队有独立的「参与状态」视图
 * - 团队可以是开发者(dev)、运营(ops)、支撑(support)等不同角色
 * - 交付时转出团队状态变为 support-only，接收团队变为 active
 * - 保留完整的 HandoffRecord 历史
 *
 * RPC 方法：
 * - project.team.assign      - 将团队关联到项目（指定角色和状态）
 * - project.team.remove      - 解除团队与项目的关联
 * - project.team.relations   - 查询项目的所有团队关系
 * - project.team.my-projects - 查询指定团队参与的所有项目
 * - project.handoff          - 执行项目交付（责任转移到另一团队）
 * - project.team.status      - 直接更新某团队在项目中的状态
 */

import { organizationStorage } from "../../organization/storage.js";
import type { ProjectTeamRole, ProjectTeamStatus } from "../../organization/types.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";

const VALID_ROLES: ProjectTeamRole[] = ["dev", "ops", "support", "qa", "observer"];
const VALID_STATUSES: ProjectTeamStatus[] = ["active", "handed-off", "archived", "support-only"];

export const projectHandoffHandlers: GatewayRequestHandlers = {
  /**
   * project.team.assign - 将团队关联到项目
   *
   * 参数：
   * - projectId (required)
   * - teamId    (required)
   * - role      (required): dev | ops | support | qa | observer
   * - status    (optional, default: active)
   * - assignedBy (required)
   * - note      (optional)
   */
  "project.team.assign": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const teamId = params?.teamId ? String(params.teamId) : "";
      const role = params?.role
        ? (String(params.role) as ProjectTeamRole)
        : ("" as ProjectTeamRole);
      const status = params?.status ? (String(params.status) as ProjectTeamStatus) : "active";
      const assignedBy = params?.assignedBy ? String(params.assignedBy) : "system";
      const note = params?.note ? String(params.note) : undefined;

      if (!projectId || !teamId || !role) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId, teamId, role are required"),
        );
        return;
      }

      if (!VALID_ROLES.includes(role)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
          ),
        );
        return;
      }

      if (!VALID_STATUSES.includes(status)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
          ),
        );
        return;
      }

      // 检查是否已有关系（幂等处理：已存在则更新）
      const existing = await organizationStorage.getProjectTeamRelations(projectId, {
        teamId,
      });

      let relation;
      if (existing.length > 0) {
        // 更新现有关系
        relation = await organizationStorage.updateProjectTeamRelation(existing[0].id, {
          role,
          status,
          note,
          updatedBy: assignedBy,
        });
      } else {
        // 创建新关系
        const now = Date.now();
        relation = await organizationStorage.assignTeamToProject({
          id: `ptr_${now}_${Math.random().toString(36).substr(2, 8)}`,
          projectId,
          teamId,
          role,
          status,
          joinedAt: now,
          assignedBy,
          note,
        });
      }

      respond(
        true,
        {
          success: true,
          relation,
          message: `Team ${teamId} ${existing.length > 0 ? "updated in" : "assigned to"} project ${projectId} as ${role} (${status})`,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to assign team to project: ${String(err)}`),
      );
    }
  },

  /**
   * project.team.remove - 解除团队与项目的关联
   */
  "project.team.remove": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const teamId = params?.teamId ? String(params.teamId) : "";

      if (!projectId || !teamId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and teamId are required"),
        );
        return;
      }

      const removed = await organizationStorage.removeTeamFromProject(projectId, teamId);

      respond(
        true,
        {
          success: removed,
          message: removed
            ? `Team ${teamId} removed from project ${projectId}`
            : `Team ${teamId} was not associated with project ${projectId}`,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to remove team from project: ${String(err)}`),
      );
    }
  },

  /**
   * project.team.relations - 查询项目的团队关系列表
   *
   * 参数：
   * - projectId (required)
   * - status    (optional): 过滤特定状态
   * - role      (optional): 过滤特定角色
   */
  "project.team.relations": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const status = params?.status ? (String(params.status) as ProjectTeamStatus) : undefined;
      const role = params?.role ? (String(params.role) as ProjectTeamRole) : undefined;

      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const relations = await organizationStorage.getProjectTeamRelations(projectId, {
        status,
        role,
      });

      respond(
        true,
        {
          projectId,
          relations,
          total: relations.length,
          // 按状态分组统计
          summary: {
            active: relations.filter((r) => r.status === "active").length,
            "support-only": relations.filter((r) => r.status === "support-only").length,
            "handed-off": relations.filter((r) => r.status === "handed-off").length,
            archived: relations.filter((r) => r.status === "archived").length,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get project team relations: ${String(err)}`),
      );
    }
  },

  /**
   * project.team.my-projects - 查询指定团队参与的所有项目
   *
   * 参数：
   * - teamId  (required)
   * - status  (optional): 过滤特定状态（如只看 active，或只看 handed-off 的已交付项目）
   * - role    (optional): 过滤特定角色
   */
  "project.team.my-projects": async ({ params, respond }) => {
    try {
      const teamId = params?.teamId ? String(params.teamId) : "";
      const status = params?.status ? (String(params.status) as ProjectTeamStatus) : undefined;
      const role = params?.role ? (String(params.role) as ProjectTeamRole) : undefined;

      if (!teamId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "teamId is required"));
        return;
      }

      const relations = await organizationStorage.getTeamProjectRelations(teamId, {
        status,
        role,
      });

      respond(
        true,
        {
          teamId,
          projects: relations,
          total: relations.length,
          summary: {
            active: relations.filter((r) => r.status === "active").length,
            "support-only": relations.filter((r) => r.status === "support-only").length,
            "handed-off": relations.filter((r) => r.status === "handed-off").length,
            archived: relations.filter((r) => r.status === "archived").length,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get team project relations: ${String(err)}`),
      );
    }
  },

  /**
   * project.handoff - 执行项目交付（核心操作）
   *
   * 语义：团队 B 完成阶段性工作，将项目 A 交付给团队 C 继续负责。
   *
   * 效果：
   * - B 的状态变为 fromTeamNewStatus（默认 support-only）
   * - C 的状态变为 toTeamNewStatus（默认 active）
   * - 双方的 handoffHistory 均追加一条 HandoffRecord
   * - C 如果不存在关系则自动创建
   *
   * 参数：
   * - projectId         (required)
   * - fromTeamId        (required): 交出方
   * - toTeamId          (required): 接收方
   * - toTeamRole        (optional, default: ops): 接收方在项目中的角色
   * - fromTeamNewStatus (optional, default: support-only)
   * - toTeamNewStatus   (optional, default: active)
   * - operatorId        (required): 执行交付的操作者
   * - note              (optional): 交付说明
   */
  "project.handoff": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const fromTeamId = params?.fromTeamId ? String(params.fromTeamId) : "";
      const toTeamId = params?.toTeamId ? String(params.toTeamId) : "";
      const toTeamRole = params?.toTeamRole
        ? (String(params.toTeamRole) as ProjectTeamRole)
        : "ops";
      const fromTeamNewStatus = params?.fromTeamNewStatus
        ? (String(params.fromTeamNewStatus) as ProjectTeamStatus)
        : "support-only";
      const toTeamNewStatus = params?.toTeamNewStatus
        ? (String(params.toTeamNewStatus) as ProjectTeamStatus)
        : "active";
      const operatorId = params?.operatorId ? String(params.operatorId) : "system";
      const note = params?.note ? String(params.note) : undefined;

      if (!projectId || !fromTeamId || !toTeamId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId, fromTeamId, toTeamId are required"),
        );
        return;
      }

      if (fromTeamId === toTeamId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "fromTeamId and toTeamId must be different"),
        );
        return;
      }

      if (!VALID_ROLES.includes(toTeamRole)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid toTeamRole. Must be one of: ${VALID_ROLES.join(", ")}`,
          ),
        );
        return;
      }

      const result = await organizationStorage.handoffProject({
        projectId,
        fromTeamId,
        toTeamId,
        toTeamRole,
        fromTeamNewStatus,
        toTeamNewStatus,
        operatorId,
        note,
      });

      respond(
        true,
        {
          success: true,
          projectId,
          handoffRecord: result.handoffRecord,
          fromTeam: {
            teamId: fromTeamId,
            newStatus: fromTeamNewStatus,
            relation: result.fromRelation,
          },
          toTeam: {
            teamId: toTeamId,
            newStatus: toTeamNewStatus,
            role: toTeamRole,
            relation: result.toRelation,
          },
          message: `Project ${projectId} handed off from team ${fromTeamId} to team ${toTeamId}. ${fromTeamId} is now ${fromTeamNewStatus}, ${toTeamId} is now ${toTeamNewStatus}.`,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to handoff project: ${String(err)}`),
      );
    }
  },

  /**
   * project.team.status - 直接更新团队在项目中的状态（不记录 HandoffRecord）
   *
   * 用于手动修正状态，不触发交付流程
   */
  "project.team.status": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const teamId = params?.teamId ? String(params.teamId) : "";
      const status = params?.status
        ? (String(params.status) as ProjectTeamStatus)
        : ("" as ProjectTeamStatus);
      const updatedBy = params?.updatedBy ? String(params.updatedBy) : "system";
      const note = params?.note ? String(params.note) : undefined;

      if (!projectId || !teamId || !status) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId, teamId, status are required"),
        );
        return;
      }

      if (!VALID_STATUSES.includes(status)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
          ),
        );
        return;
      }

      const existing = await organizationStorage.getProjectTeamRelations(projectId, { teamId });
      if (existing.length === 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Team ${teamId} is not associated with project ${projectId}`,
          ),
        );
        return;
      }

      const updated = await organizationStorage.updateProjectTeamRelation(existing[0].id, {
        status,
        note,
        updatedBy,
      });

      respond(
        true,
        {
          success: true,
          relation: updated,
          message: `Team ${teamId} status in project ${projectId} updated to ${status}`,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update team status: ${String(err)}`),
      );
    }
  },
};
