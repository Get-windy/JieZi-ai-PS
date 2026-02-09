/**
 * Organization Hierarchy RPC 处理器
 *
 * 提供组织层级分析、统计、成员管理等功能
 */

import type { GatewayRequestHandlers } from "./types.js";
import { organizationHierarchy } from "../../organization/organization-hierarchy.js";
import { organizationSystem } from "../../organization/organization-system.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const organizationHierarchyHandlers: GatewayRequestHandlers = {
  /**
   * 检查两个组织的上下级关系
   */
  "org.hierarchy.isAncestor": async ({ params, respond }) => {
    const { ancestorId, descendantId } = params || {};

    if (!ancestorId || typeof ancestorId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing ancestorId"));
      return;
    }
    if (!descendantId || typeof descendantId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing descendantId"));
      return;
    }

    try {
      const isAncestor = await organizationHierarchy.isAncestor(ancestorId, descendantId);
      respond(true, { isAncestor }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 检查两个组织是否为同级
   */
  "org.hierarchy.isSibling": async ({ params, respond }) => {
    const { org1Id, org2Id } = params || {};

    if (!org1Id || typeof org1Id !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing org1Id"));
      return;
    }
    if (!org2Id || typeof org2Id !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing org2Id"));
      return;
    }

    try {
      const isSibling = await organizationHierarchy.isSibling(org1Id, org2Id);
      respond(true, { isSibling }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取最近公共祖先
   */
  "org.hierarchy.commonAncestor": async ({ params, respond }) => {
    const { org1Id, org2Id } = params || {};

    if (!org1Id || typeof org1Id !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing org1Id"));
      return;
    }
    if (!org2Id || typeof org2Id !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing org2Id"));
      return;
    }

    try {
      const ancestor = await organizationHierarchy.getCommonAncestor(org1Id, org2Id);
      respond(true, { ancestor }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取组织深度
   */
  "org.hierarchy.depth": async ({ params, respond }) => {
    const { organizationId } = params || {};

    if (!organizationId || typeof organizationId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing organizationId"));
      return;
    }

    try {
      const depth = await organizationHierarchy.getDepth(organizationId);
      respond(true, { depth, organizationId }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取组织树
   */
  "org.hierarchy.tree": async ({ params, respond }) => {
    const { rootId } = params || {};

    if (!rootId || typeof rootId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing rootId"));
      return;
    }

    try {
      const tree = await organizationHierarchy.getTree(rootId);
      if (!tree) {
        respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Root organization not found"));
        return;
      }

      respond(true, { tree }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取组织路径（从根到当前）
   */
  "org.hierarchy.path": async ({ params, respond }) => {
    const { organizationId } = params || {};

    if (!organizationId || typeof organizationId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing organizationId"));
      return;
    }

    try {
      const path = await organizationHierarchy.getPath(organizationId);
      respond(true, { path, length: path.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取组织所有成员（包括子组织）
   */
  "org.hierarchy.allMembers": async ({ params, respond }) => {
    const { organizationId } = params || {};

    if (!organizationId || typeof organizationId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing organizationId"));
      return;
    }

    try {
      const memberIds = await organizationHierarchy.getAllMembers(organizationId);
      respond(true, { memberIds, total: memberIds.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 检查智能助手是否属于组织
   */
  "org.hierarchy.isMember": async ({ params, respond }) => {
    const { organizationId, agentId } = params || {};

    if (!organizationId || typeof organizationId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing organizationId"));
      return;
    }
    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const isMember = await organizationHierarchy.isMember(organizationId, agentId);
      respond(true, { isMember, organizationId, agentId }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取智能助手所属的所有组织
   */
  "org.hierarchy.agentOrganizations": async ({ params, respond }) => {
    const { agentId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const organizations = await organizationHierarchy.getAgentOrganizations(agentId);
      respond(true, { organizations, total: organizations.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取智能助手的主组织
   */
  "org.hierarchy.primaryOrganization": async ({ params, respond }) => {
    const { agentId } = params || {};

    if (!agentId || typeof agentId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing agentId"));
      return;
    }

    try {
      const organization = await organizationHierarchy.getPrimaryOrganization(agentId);
      respond(true, { organization }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 计算组织总配额
   */
  "org.hierarchy.totalQuota": async ({ params, respond }) => {
    const { organizationId } = params || {};

    if (!organizationId || typeof organizationId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing organizationId"));
      return;
    }

    try {
      const quota = await organizationHierarchy.calculateTotalQuota(organizationId);
      respond(true, { quota }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取组织统计信息
   */
  "org.hierarchy.statistics": async ({ params, respond }) => {
    const { organizationId } = params || {};

    if (!organizationId || typeof organizationId !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing organizationId"));
      return;
    }

    try {
      const statistics = await organizationHierarchy.getStatistics(organizationId);
      respond(true, { statistics }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 批量获取多个组织的统计信息
   */
  "org.hierarchy.batchStatistics": async ({ params, respond }) => {
    const { organizationIds } = params || {};

    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing organizationIds array"));
      return;
    }

    try {
      const statisticsMap: Record<string, any> = {};

      for (const orgId of organizationIds) {
        if (typeof orgId === "string") {
          try {
            const statistics = await organizationHierarchy.getStatistics(orgId);
            statisticsMap[orgId] = statistics;
          } catch (err) {
            statisticsMap[orgId] = { error: String(err) };
          }
        }
      }

      respond(
        true,
        { statistics: statisticsMap, total: Object.keys(statisticsMap).length },
        undefined,
      );
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取全局组织统计
   */
  "org.hierarchy.globalStatistics": async ({ respond }) => {
    try {
      const allOrgs = await organizationSystem.getAllOrganizations();

      const statsByLevel: Record<string, number> = {};
      let totalMembers = 0;
      let totalOrganizations = allOrgs.length;

      for (const org of allOrgs) {
        statsByLevel[org.level] = (statsByLevel[org.level] || 0) + 1;
        totalMembers += org.memberIds.length;
      }

      const statistics = {
        totalOrganizations,
        totalMembers,
        byLevel: statsByLevel,
        avgMembersPerOrg: totalOrganizations > 0 ? totalMembers / totalOrganizations : 0,
      };

      respond(true, { statistics }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
