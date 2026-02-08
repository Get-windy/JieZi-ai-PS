/**
 * 协作系统
 *
 * 功能：
 * - 协作关系管理（创建、查询、删除）
 * - 6种协作关系类型支持
 * - 协作网络分析
 * - 关系验证与冲突检测
 */

import type { CollaborationRelation, CollaborationRelationType } from "./types.js";
import { organizationHierarchy } from "./organization-hierarchy.js";
import { organizationSystem } from "./organization-system.js";

/**
 * 协作网络统计信息
 */
export interface CollaborationNetworkStats {
  agentId: string;
  totalRelations: number;
  relationsByType: Record<CollaborationRelationType, number>;
  supervisors: string[];
  subordinates: string[];
  colleagues: string[];
  projectPartners: string[];
  businessPartners: string[];
  mentors: string[];
  mentees: string[];
  monitors: string[];
  monitored: string[];
}

/**
 * 协作路径
 */
export interface CollaborationPath {
  from: string;
  to: string;
  path: Array<{
    agentId: string;
    relationType: CollaborationRelationType;
  }>;
  length: number;
}

/**
 * 协作系统类
 */
export class CollaborationSystem {
  private relations: Map<string, CollaborationRelation> = new Map();

  // 索引：按助手ID快速查询关系
  private relationsByAgent: Map<string, Set<string>> = new Map();

  /**
   * 创建协作关系
   */
  async createRelation(params: {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    type: CollaborationRelationType;
    organizationId?: string;
    metadata?: Record<string, any>;
    validFrom?: number;
    validUntil?: number;
    createdBy: string;
  }): Promise<CollaborationRelation> {
    const {
      id,
      fromAgentId,
      toAgentId,
      type,
      organizationId,
      metadata = {},
      validFrom,
      validUntil,
      createdBy,
    } = params;

    // 检查ID是否已存在
    if (this.relations.has(id)) {
      throw new Error(`Collaboration relation with ID "${id}" already exists`);
    }

    // 不能与自己建立关系
    if (fromAgentId === toAgentId) {
      throw new Error("Cannot create collaboration relation with self");
    }

    // 验证有效期
    if (validFrom && validUntil && validFrom >= validUntil) {
      throw new Error("validFrom must be earlier than validUntil");
    }

    // 验证组织成员关系
    if (organizationId) {
      const org = await organizationSystem.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization "${organizationId}" not found`);
      }

      const allMembers = await organizationHierarchy.getAllMembers(organizationId);
      if (!allMembers.includes(fromAgentId)) {
        throw new Error(
          `Agent "${fromAgentId}" is not a member of organization "${organizationId}"`,
        );
      }
      if (!allMembers.includes(toAgentId)) {
        throw new Error(`Agent "${toAgentId}" is not a member of organization "${organizationId}"`);
      }
    }

    // 验证关系类型特定规则
    await this.validateRelationType(fromAgentId, toAgentId, type, organizationId);

    const relation: CollaborationRelation = {
      id,
      fromAgentId,
      toAgentId,
      type,
      organizationId,
      metadata,
      validFrom,
      validUntil,
      createdAt: Date.now(),
      createdBy,
    };

    this.relations.set(id, relation);
    this.addToIndex(fromAgentId, id);
    this.addToIndex(toAgentId, id);

    return relation;
  }

  /**
   * 验证关系类型特定规则
   */
  private async validateRelationType(
    fromAgentId: string,
    toAgentId: string,
    type: CollaborationRelationType,
    organizationId?: string,
  ): Promise<void> {
    switch (type) {
      case "supervisor":
        // 上下级关系：检查是否已存在相反的上下级关系
        const reverseSupervision = await this.getRelationBetween(
          toAgentId,
          fromAgentId,
          "supervisor",
        );
        if (reverseSupervision) {
          throw new Error(
            "Reverse supervision relation already exists (would create circular hierarchy)",
          );
        }

        // 检查是否在同一组织层级
        if (organizationId) {
          const fromOrgs = await this.getAgentOrganizations(fromAgentId);
          const toOrgs = await this.getAgentOrganizations(toAgentId);

          const commonOrg = fromOrgs.find((org) => toOrgs.includes(org));
          if (!commonOrg) {
            throw new Error("Supervisor and subordinate must be in the same organization");
          }
        }
        break;

      case "monitor":
        // 监督关系：检查权限（通常需要额外验证）
        // 这里可以添加更多的监督权限验证逻辑
        break;

      default:
        // 其他关系类型暂无特殊限制
        break;
    }
  }

  /**
   * 获取助手所在的所有组织
   */
  private async getAgentOrganizations(agentId: string): Promise<string[]> {
    const allOrgs = await organizationSystem.getAllOrganizations();
    return allOrgs.filter((org: any) => org.memberIds.includes(agentId)).map((org: any) => org.id);
  }

  /**
   * 获取协作关系
   */
  async getRelation(relationId: string): Promise<CollaborationRelation | null> {
    return this.relations.get(relationId) || null;
  }

  /**
   * 获取两个助手之间的特定类型关系
   */
  async getRelationBetween(
    fromAgentId: string,
    toAgentId: string,
    type?: CollaborationRelationType,
  ): Promise<CollaborationRelation | null> {
    const relations = await this.getRelationsByAgent(fromAgentId);

    for (const relation of relations) {
      if (relation.fromAgentId === fromAgentId && relation.toAgentId === toAgentId) {
        if (!type || relation.type === type) {
          return relation;
        }
      }
    }

    return null;
  }

  /**
   * 删除协作关系
   */
  async deleteRelation(relationId: string): Promise<boolean> {
    const relation = this.relations.get(relationId);
    if (!relation) {
      throw new Error(`Collaboration relation "${relationId}" not found`);
    }

    this.removeFromIndex(relation.fromAgentId, relationId);
    this.removeFromIndex(relation.toAgentId, relationId);
    return this.relations.delete(relationId);
  }

  /**
   * 更新协作关系元数据
   */
  async updateRelationMetadata(params: {
    relationId: string;
    metadata: Record<string, any>;
    updatedBy: string;
  }): Promise<CollaborationRelation> {
    const { relationId, metadata, updatedBy } = params;

    const relation = this.relations.get(relationId);
    if (!relation) {
      throw new Error(`Collaboration relation "${relationId}" not found`);
    }

    const updated: CollaborationRelation = {
      ...relation,
      metadata: { ...relation.metadata, ...metadata },
      updatedAt: Date.now(),
      updatedBy,
    };

    this.relations.set(relationId, updated);
    return updated;
  }

  /**
   * 获取助手的所有协作关系
   */
  async getRelationsByAgent(agentId: string): Promise<CollaborationRelation[]> {
    const relationIds = this.relationsByAgent.get(agentId);
    if (!relationIds) return [];

    return Array.from(relationIds)
      .map((id) => this.relations.get(id))
      .filter((rel): rel is CollaborationRelation => rel !== undefined);
  }

  /**
   * 获取特定类型的协作关系
   */
  async getRelationsByType(
    agentId: string,
    type: CollaborationRelationType,
  ): Promise<CollaborationRelation[]> {
    const allRelations = await this.getRelationsByAgent(agentId);
    return allRelations.filter((rel) => rel.type === type);
  }

  /**
   * 获取助手的上级（supervisors）
   */
  async getSupervisors(agentId: string): Promise<string[]> {
    const relations = await this.getRelationsByType(agentId, "supervisor");
    return relations.filter((rel) => rel.toAgentId === agentId).map((rel) => rel.fromAgentId);
  }

  /**
   * 获取助手的下属（subordinates）
   */
  async getSubordinates(agentId: string): Promise<string[]> {
    const relations = await this.getRelationsByType(agentId, "supervisor");
    return relations.filter((rel) => rel.fromAgentId === agentId).map((rel) => rel.toAgentId);
  }

  /**
   * 获取助手的同事
   */
  async getColleagues(agentId: string): Promise<string[]> {
    const relations = await this.getRelationsByType(agentId, "colleague");
    return relations.map((rel) => (rel.fromAgentId === agentId ? rel.toAgentId : rel.fromAgentId));
  }

  /**
   * 获取协作网络统计信息
   */
  async getNetworkStats(agentId: string): Promise<CollaborationNetworkStats> {
    const allRelations = await this.getRelationsByAgent(agentId);

    const relationsByType: Record<CollaborationRelationType, number> = {
      supervisor: 0,
      colleague: 0,
      project: 0,
      business: 0,
      mentor: 0,
      monitor: 0,
    };

    const supervisors: string[] = [];
    const subordinates: string[] = [];
    const colleagues: string[] = [];
    const projectPartners: string[] = [];
    const businessPartners: string[] = [];
    const mentors: string[] = [];
    const mentees: string[] = [];
    const monitors: string[] = [];
    const monitored: string[] = [];

    for (const relation of allRelations) {
      relationsByType[relation.type]++;

      const isFrom = relation.fromAgentId === agentId;
      const otherId = isFrom ? relation.toAgentId : relation.fromAgentId;

      switch (relation.type) {
        case "supervisor":
          if (isFrom) {
            subordinates.push(otherId);
          } else {
            supervisors.push(otherId);
          }
          break;
        case "colleague":
          colleagues.push(otherId);
          break;
        case "project":
          projectPartners.push(otherId);
          break;
        case "business":
          businessPartners.push(otherId);
          break;
        case "mentor":
          if (isFrom) {
            mentees.push(otherId);
          } else {
            mentors.push(otherId);
          }
          break;
        case "monitor":
          if (isFrom) {
            monitored.push(otherId);
          } else {
            monitors.push(otherId);
          }
          break;
      }
    }

    return {
      agentId,
      totalRelations: allRelations.length,
      relationsByType,
      supervisors,
      subordinates,
      colleagues,
      projectPartners,
      businessPartners,
      mentors,
      mentees,
      monitors,
      monitored,
    };
  }

  /**
   * 查找协作路径（广度优先搜索）
   */
  async findCollaborationPath(
    fromAgentId: string,
    toAgentId: string,
    maxDepth: number = 5,
  ): Promise<CollaborationPath | null> {
    if (fromAgentId === toAgentId) {
      return {
        from: fromAgentId,
        to: toAgentId,
        path: [],
        length: 0,
      };
    }

    const queue: Array<{
      agentId: string;
      path: Array<{ agentId: string; relationType: CollaborationRelationType }>;
    }> = [{ agentId: fromAgentId, path: [] }];

    const visited = new Set<string>([fromAgentId]);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length >= maxDepth) continue;

      const relations = await this.getRelationsByAgent(current.agentId);

      for (const relation of relations) {
        const nextAgentId =
          relation.fromAgentId === current.agentId ? relation.toAgentId : relation.fromAgentId;

        if (visited.has(nextAgentId)) continue;

        const newPath = [...current.path, { agentId: nextAgentId, relationType: relation.type }];

        if (nextAgentId === toAgentId) {
          return {
            from: fromAgentId,
            to: toAgentId,
            path: newPath,
            length: newPath.length,
          };
        }

        visited.add(nextAgentId);
        queue.push({ agentId: nextAgentId, path: newPath });
      }
    }

    return null;
  }

  /**
   * 检查是否存在循环依赖（用于supervisor关系）
   */
  async hasCircularDependency(fromAgentId: string, toAgentId: string): Promise<boolean> {
    const path = await this.findCollaborationPath(toAgentId, fromAgentId);
    return path !== null;
  }

  /**
   * 获取组织内的所有协作关系
   */
  async getRelationsByOrganization(organizationId: string): Promise<CollaborationRelation[]> {
    return Array.from(this.relations.values()).filter(
      (rel) => rel.organizationId === organizationId,
    );
  }

  /**
   * 获取活跃的协作关系
   */
  async getActiveRelations(agentId: string): Promise<CollaborationRelation[]> {
    const allRelations = await this.getRelationsByAgent(agentId);
    const now = Date.now();

    return allRelations.filter((rel) => {
      if (rel.validFrom && now < rel.validFrom) return false;
      if (rel.validUntil && now > rel.validUntil) return false;
      return true;
    });
  }

  /**
   * 批量创建协作关系
   */
  async createRelationsBatch(
    relations: Array<{
      id: string;
      fromAgentId: string;
      toAgentId: string;
      type: CollaborationRelationType;
      organizationId?: string;
      metadata?: Record<string, any>;
    }>,
    createdBy: string,
  ): Promise<CollaborationRelation[]> {
    const created: CollaborationRelation[] = [];

    for (const params of relations) {
      const relation = await this.createRelation({
        ...params,
        createdBy,
      });
      created.push(relation);
    }

    return created;
  }

  /**
   * 获取所有协作关系
   */
  async getAllRelations(): Promise<CollaborationRelation[]> {
    return Array.from(this.relations.values());
  }

  // === 私有方法：索引管理 ===

  private addToIndex(agentId: string, relationId: string): void {
    if (!this.relationsByAgent.has(agentId)) {
      this.relationsByAgent.set(agentId, new Set());
    }
    this.relationsByAgent.get(agentId)!.add(relationId);
  }

  private removeFromIndex(agentId: string, relationId: string): void {
    const relations = this.relationsByAgent.get(agentId);
    if (relations) {
      relations.delete(relationId);
      if (relations.size === 0) {
        this.relationsByAgent.delete(agentId);
      }
    }
  }
}

// 导出单例实例
export const collaborationSystem = new CollaborationSystem();
