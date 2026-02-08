/**
 * Phase 4: 组织系统核心实现
 *
 * 提供组织结构的创建、查询、更新、删除等核心功能
 */

import type { Organization, OrganizationLevel } from "./types.js";

/**
 * 组织系统类
 */
export class OrganizationSystem {
  private organizations: Map<string, Organization> = new Map();

  /**
   * 创建组织
   */
  async createOrganization(params: {
    id: string;
    name: string;
    level: OrganizationLevel;
    parentId?: string;
    managerId?: string;
    memberIds?: string[];
    description?: string;
    industry?: string;
    location?: string;
    quota?: {
      maxMembers?: number;
      budgetPerMonth?: number;
      maxTokensPerDay?: number;
    };
    createdBy: string;
  }): Promise<Organization> {
    const { id, parentId } = params;

    // 检查ID是否已存在
    if (this.organizations.has(id)) {
      throw new Error(`Organization with ID "${id}" already exists`);
    }

    // 检查父组织是否存在
    if (parentId && !this.organizations.has(parentId)) {
      throw new Error(`Parent organization "${parentId}" not found`);
    }

    // 验证层级关系
    if (parentId) {
      const parent = this.organizations.get(parentId)!;
      this.validateHierarchy(params.level, parent.level);
    }

    const organization: Organization = {
      id: params.id,
      name: params.name,
      level: params.level,
      parentId: params.parentId,
      managerId: params.managerId,
      memberIds: params.memberIds || [],
      description: params.description,
      industry: params.industry,
      location: params.location,
      quota: params.quota,
      createdAt: Date.now(),
      createdBy: params.createdBy,
    };

    this.organizations.set(id, organization);
    console.log(`[Organization System] Created organization: ${id} (${params.name})`);

    return organization;
  }

  /**
   * 获取组织
   */
  async getOrganization(id: string): Promise<Organization | null> {
    return this.organizations.get(id) || null;
  }

  /**
   * 更新组织
   */
  async updateOrganization(params: {
    id: string;
    updates: Partial<Omit<Organization, "id" | "createdAt" | "createdBy">>;
    updatedBy: string;
  }): Promise<Organization> {
    const { id, updates, updatedBy } = params;

    const organization = this.organizations.get(id);
    if (!organization) {
      throw new Error(`Organization "${id}" not found`);
    }

    // 如果更新了父组织，验证层级关系
    if (updates.parentId !== undefined && updates.parentId !== organization.parentId) {
      if (updates.parentId) {
        const parent = this.organizations.get(updates.parentId);
        if (!parent) {
          throw new Error(`Parent organization "${updates.parentId}" not found`);
        }
        this.validateHierarchy(organization.level, parent.level);
      }
    }

    const updated: Organization = {
      ...organization,
      ...updates,
      updatedAt: Date.now(),
      updatedBy,
    };

    this.organizations.set(id, updated);
    console.log(`[Organization System] Updated organization: ${id}`);

    return updated;
  }

  /**
   * 删除组织
   */
  async deleteOrganization(id: string): Promise<boolean> {
    const organization = this.organizations.get(id);
    if (!organization) {
      return false;
    }

    // 检查是否有子组织
    const children = Array.from(this.organizations.values()).filter((org) => org.parentId === id);
    if (children.length > 0) {
      throw new Error(
        `Cannot delete organization "${id}": it has ${children.length} child organization(s)`,
      );
    }

    // 检查是否有成员
    if (organization.memberIds.length > 0) {
      throw new Error(
        `Cannot delete organization "${id}": it has ${organization.memberIds.length} member(s)`,
      );
    }

    this.organizations.delete(id);
    console.log(`[Organization System] Deleted organization: ${id}`);

    return true;
  }

  /**
   * 添加成员到组织
   */
  async addMember(params: {
    organizationId: string;
    agentId: string;
    updatedBy: string;
  }): Promise<Organization> {
    const { organizationId, agentId, updatedBy } = params;

    const organization = this.organizations.get(organizationId);
    if (!organization) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    // 检查配额
    if (organization.quota?.maxMembers) {
      if (organization.memberIds.length >= organization.quota.maxMembers) {
        throw new Error(
          `Organization "${organizationId}" has reached max members limit (${organization.quota.maxMembers})`,
        );
      }
    }

    // 检查是否已是成员
    if (organization.memberIds.includes(agentId)) {
      throw new Error(`Agent "${agentId}" is already a member of organization "${organizationId}"`);
    }

    const updated: Organization = {
      ...organization,
      memberIds: [...organization.memberIds, agentId],
      updatedAt: Date.now(),
      updatedBy,
    };

    this.organizations.set(organizationId, updated);
    console.log(`[Organization System] Added member ${agentId} to organization ${organizationId}`);

    return updated;
  }

  /**
   * 从组织移除成员
   */
  async removeMember(params: {
    organizationId: string;
    agentId: string;
    updatedBy: string;
  }): Promise<Organization> {
    const { organizationId, agentId, updatedBy } = params;

    const organization = this.organizations.get(organizationId);
    if (!organization) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    if (!organization.memberIds.includes(agentId)) {
      throw new Error(`Agent "${agentId}" is not a member of organization "${organizationId}"`);
    }

    const updated: Organization = {
      ...organization,
      memberIds: organization.memberIds.filter((id) => id !== agentId),
      updatedAt: Date.now(),
      updatedBy,
    };

    this.organizations.set(organizationId, updated);
    console.log(
      `[Organization System] Removed member ${agentId} from organization ${organizationId}`,
    );

    return updated;
  }

  /**
   * 获取组织的所有子组织
   */
  async getChildren(organizationId: string): Promise<Organization[]> {
    return Array.from(this.organizations.values()).filter((org) => org.parentId === organizationId);
  }

  /**
   * 获取组织的所有祖先（从父到根）
   */
  async getAncestors(organizationId: string): Promise<Organization[]> {
    const ancestors: Organization[] = [];
    let current = this.organizations.get(organizationId);

    while (current?.parentId) {
      const parent = this.organizations.get(current.parentId);
      if (!parent) break;
      ancestors.push(parent);
      current = parent;
    }

    return ancestors;
  }

  /**
   * 获取组织的所有后代（递归）
   */
  async getDescendants(organizationId: string): Promise<Organization[]> {
    const descendants: Organization[] = [];
    const queue: string[] = [organizationId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await this.getChildren(currentId);

      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants;
  }

  /**
   * 获取某层级的所有组织
   */
  async getByLevel(level: OrganizationLevel): Promise<Organization[]> {
    return Array.from(this.organizations.values()).filter((org) => org.level === level);
  }

  /**
   * 获取所有组织
   */
  async getAllOrganizations(): Promise<Organization[]> {
    return Array.from(this.organizations.values());
  }

  /**
   * 验证层级关系是否合法
   */
  private validateHierarchy(childLevel: OrganizationLevel, parentLevel: OrganizationLevel): void {
    const levelOrder: OrganizationLevel[] = ["company", "department", "team", "individual"];
    const childIndex = levelOrder.indexOf(childLevel);
    const parentIndex = levelOrder.indexOf(parentLevel);

    if (childIndex <= parentIndex) {
      throw new Error(`Invalid hierarchy: ${childLevel} cannot be a child of ${parentLevel}`);
    }
  }

  /**
   * 清空所有组织（仅用于测试）
   */
  async clearAll(): Promise<void> {
    this.organizations.clear();
    console.log("[Organization System] Cleared all organizations");
  }
}

// 导出单例
export const organizationSystem = new OrganizationSystem();
