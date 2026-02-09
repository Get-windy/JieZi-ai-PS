/**
 * Phase 4: 组织层级管理
 *
 * 提供组织层级查询、权限计算、关系分析等功能
 */

import type { Organization } from "./types.js";
import { organizationSystem } from "./organization-system.js";

/**
 * 组织层级管理类
 */
export class OrganizationHierarchy {
  /**
   * 检查两个组织是否有上下级关系
   */
  async isAncestor(ancestorId: string, descendantId: string): Promise<boolean> {
    const ancestors = await organizationSystem.getAncestors(descendantId);
    return ancestors.some((org) => org.id === ancestorId);
  }

  /**
   * 检查两个组织是否为同级
   */
  async isSibling(org1Id: string, org2Id: string): Promise<boolean> {
    const org1 = await organizationSystem.getOrganization(org1Id);
    const org2 = await organizationSystem.getOrganization(org2Id);

    if (!org1 || !org2) {
      return false;
    }

    // 同级定义：有相同的父组织 且 层级相同
    return org1.parentId === org2.parentId && org1.level === org2.level;
  }

  /**
   * 获取两个组织的最近公共祖先
   */
  async getCommonAncestor(org1Id: string, org2Id: string): Promise<Organization | null> {
    const ancestors1 = await organizationSystem.getAncestors(org1Id);
    const ancestors2 = await organizationSystem.getAncestors(org2Id);

    // 将ancestors2转换为Set以便快速查找
    const ancestors2Set = new Set(ancestors2.map((org) => org.id));

    // 从近到远查找第一个共同祖先
    for (const ancestor of ancestors1) {
      if (ancestors2Set.has(ancestor.id)) {
        return ancestor;
      }
    }

    return null;
  }

  /**
   * 计算组织的层级深度（从根节点算起）
   */
  async getDepth(organizationId: string): Promise<number> {
    const ancestors = await organizationSystem.getAncestors(organizationId);
    return ancestors.length;
  }

  /**
   * 获取组织树（从指定组织开始的完整树结构）
   */
  async getTree(rootId: string): Promise<OrganizationTreeNode | null> {
    const root = await organizationSystem.getOrganization(rootId);
    if (!root) {
      return null;
    }

    return await this.buildTree(root);
  }

  /**
   * 递归构建组织树
   */
  private async buildTree(org: Organization): Promise<OrganizationTreeNode> {
    const children = await organizationSystem.getChildren(org.id);
    const childNodes = await Promise.all(children.map((child) => this.buildTree(child)));

    return {
      organization: org,
      children: childNodes,
    };
  }

  /**
   * 获取组织路径（从根到指定组织的路径）
   */
  async getPath(organizationId: string): Promise<Organization[]> {
    const ancestors = await organizationSystem.getAncestors(organizationId);
    const current = await organizationSystem.getOrganization(organizationId);

    if (!current) {
      return [];
    }

    // 反转祖先数组（从根到当前）
    return [...ancestors.reverse(), current];
  }

  /**
   * 获取组织的所有成员（包括子组织的成员）
   */
  async getAllMembers(organizationId: string): Promise<string[]> {
    const org = await organizationSystem.getOrganization(organizationId);
    if (!org) {
      return [];
    }

    const allMembers = new Set<string>(org.memberIds);

    // 递归获取所有子组织的成员
    const descendants = await organizationSystem.getDescendants(organizationId);
    for (const descendant of descendants) {
      descendant.memberIds.forEach((memberId) => allMembers.add(memberId));
    }

    return Array.from(allMembers);
  }

  /**
   * 检查某个智能助手是否属于指定组织（包括子组织）
   */
  async isMember(organizationId: string, agentId: string): Promise<boolean> {
    const allMembers = await this.getAllMembers(organizationId);
    return allMembers.includes(agentId);
  }

  /**
   * 获取智能助手所属的所有组织
   */
  async getAgentOrganizations(agentId: string): Promise<Organization[]> {
    const allOrgs = await organizationSystem.getAllOrganizations();
    return allOrgs.filter((org) => org.memberIds.includes(agentId));
  }

  /**
   * 获取智能助手的主组织（层级最深的组织）
   */
  async getPrimaryOrganization(agentId: string): Promise<Organization | null> {
    const orgs = await this.getAgentOrganizations(agentId);
    if (orgs.length === 0) {
      return null;
    }

    // 计算每个组织的深度
    const orgsWithDepth = await Promise.all(
      orgs.map(async (org) => ({
        org,
        depth: await this.getDepth(org.id),
      })),
    );

    // 返回深度最大的组织
    orgsWithDepth.sort((a, b) => b.depth - a.depth);
    return orgsWithDepth[0].org;
  }

  /**
   * 计算组织的总配额（包括所有子组织）
   */
  async calculateTotalQuota(organizationId: string): Promise<{
    totalMembers: number;
    maxMembers: number | null;
    budgetPerMonth: number | null;
    maxTokensPerDay: number | null;
  }> {
    const org = await organizationSystem.getOrganization(organizationId);
    if (!org) {
      return {
        totalMembers: 0,
        maxMembers: null,
        budgetPerMonth: null,
        maxTokensPerDay: null,
      };
    }

    const descendants = await organizationSystem.getDescendants(organizationId);
    const allOrgs = [org, ...descendants];

    let totalMembers = 0;
    let maxMembers = org.quota?.maxMembers || null;
    let budgetPerMonth = org.quota?.budgetPerMonth || null;
    let maxTokensPerDay = org.quota?.maxTokensPerDay || null;

    for (const descendant of allOrgs) {
      totalMembers += descendant.memberIds.length;

      if (descendant.quota) {
        if (descendant.quota.maxMembers) {
          maxMembers = Math.max(maxMembers || 0, descendant.quota.maxMembers);
        }
        if (descendant.quota.budgetPerMonth) {
          budgetPerMonth = (budgetPerMonth || 0) + descendant.quota.budgetPerMonth;
        }
        if (descendant.quota.maxTokensPerDay) {
          maxTokensPerDay = (maxTokensPerDay || 0) + descendant.quota.maxTokensPerDay;
        }
      }
    }

    return {
      totalMembers,
      maxMembers,
      budgetPerMonth,
      maxTokensPerDay,
    };
  }

  /**
   * 获取组织统计信息
   */
  async getStatistics(organizationId: string): Promise<OrganizationStatistics> {
    const org = await organizationSystem.getOrganization(organizationId);
    if (!org) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    const children = await organizationSystem.getChildren(organizationId);
    const descendants = await organizationSystem.getDescendants(organizationId);
    const allMembers = await this.getAllMembers(organizationId);
    const quota = await this.calculateTotalQuota(organizationId);

    return {
      id: organizationId,
      name: org.name,
      level: org.level,
      directMembers: org.memberIds.length,
      totalMembers: allMembers.length,
      directChildren: children.length,
      totalDescendants: descendants.length,
      depth: await this.getDepth(organizationId),
      quota,
    };
  }
}

/**
 * 组织树节点
 */
export interface OrganizationTreeNode {
  organization: Organization;
  children: OrganizationTreeNode[];
}

/**
 * 组织统计信息
 */
export interface OrganizationStatistics {
  id: string;
  name: string;
  level: string;
  directMembers: number;
  totalMembers: number;
  directChildren: number;
  totalDescendants: number;
  depth: number;
  quota: {
    totalMembers: number;
    maxMembers: number | null;
    budgetPerMonth: number | null;
    maxTokensPerDay: number | null;
  };
}

// 导出单例
export const organizationHierarchy = new OrganizationHierarchy();
