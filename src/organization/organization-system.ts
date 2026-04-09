/**
 * Phase 4: 组织系统核心实现
 *
 * 提供组织结构的创建、查询、更新、删除等核心功能
 */

import { organizationStorage } from "./storage.js";
import type {
  Organization,
  OrganizationLevel,
  OrganizationMember,
  MemberRole,
  MemberType,
} from "./types.js";

/**
 * 组织系统类
 */
export class OrganizationSystem {
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
    const existing = await organizationStorage.getOrganization(id);
    if (existing) {
      throw new Error(`Organization with ID "${id}" already exists`);
    }

    // 检查父组织是否存在
    if (parentId) {
      const parent = await organizationStorage.getOrganization(parentId);
      if (!parent) {
        throw new Error(`Parent organization "${parentId}" not found`);
      }
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

    await organizationStorage.createOrganization(organization);
    console.log(`[Organization System] Created organization: ${id} (${params.name})`);

    return organization;
  }

  /**
   * 获取组织
   */
  async getOrganization(id: string): Promise<Organization | null> {
    return organizationStorage.getOrganization(id);
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

    const organization = await organizationStorage.getOrganization(id);
    if (!organization) {
      throw new Error(`Organization "${id}" not found`);
    }

    // 如果更新了父组织，验证层级关系
    if (updates.parentId !== undefined && updates.parentId !== organization.parentId) {
      if (updates.parentId) {
        const parent = await organizationStorage.getOrganization(updates.parentId);
        if (!parent) {
          throw new Error(`Parent organization "${updates.parentId}" not found`);
        }
        this.validateHierarchy(organization.level, parent.level);
      }
    }

    const updated = await organizationStorage.updateOrganization(id, { ...updates, updatedBy });
    console.log(`[Organization System] Updated organization: ${id}`);

    return updated;
  }

  /**
   * 删除组织
   */
  async deleteOrganization(id: string): Promise<boolean> {
    const organization = await organizationStorage.getOrganization(id);
    if (!organization) {
      return false;
    }

    // 检查是否有子组织
    const children = await organizationStorage.getChildOrganizations(id);
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

    const deleted = await organizationStorage.deleteOrganization(id);
    if (deleted) {
      console.log(`[Organization System] Deleted organization: ${id}`);
    }

    return deleted;
  }

  /**
   * 添加成员到组织
   *
   * P1 双轨合并：同步写入 memberIds（兼容旧版）+ members[]（含角色）
   * 推荐改用 addMemberWithRole() 明确指定角色；
   * 此方法保留向后兼容，默认角色 = "member"。
   */
  async addMember(params: {
    organizationId: string;
    agentId: string;
    updatedBy: string;
    /** 可选角色，默认 member */
    role?: MemberRole;
    /** 成员类型，默认 agent */
    memberType?: MemberType;
  }): Promise<Organization> {
    const { organizationId, agentId, updatedBy, role = "member", memberType = "agent" } = params;

    const organization = await organizationStorage.getOrganization(organizationId);
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

    // P1 双轨合并：同时维护 memberIds（旧）和 members[]（新）
    const newMember: OrganizationMember = {
      id: agentId,
      type: memberType,
      role,
      joinedAt: Date.now(),
    };
    const updatedMembers = [...(organization.members ?? []), newMember];

    const updated = await organizationStorage.updateOrganization(organizationId, {
      memberIds: [...organization.memberIds, agentId],
      members: updatedMembers,
      updatedBy,
    });
    console.log(
      `[Organization System] Added member ${agentId} (role=${role}) to organization ${organizationId}`,
    );

    return updated;
  }

  /**
   * 添加成员并明确指定角色（推荐方式）
   *
   * 相比 addMember，此方法语义更清晰，支持完整的 OrganizationMember 结构。
   */
  async addMemberWithRole(params: {
    organizationId: string;
    agentId: string;
    role: MemberRole;
    updatedBy: string;
    memberType?: MemberType;
    title?: string;
    reportTo?: string;
    responsibilities?: string[];
  }): Promise<Organization> {
    return this.addMember({
      organizationId: params.organizationId,
      agentId: params.agentId,
      updatedBy: params.updatedBy,
      role: params.role,
      memberType: params.memberType ?? "agent",
    });
  }

  /**
   * 从组织移除成员
   *
   * P1 双轨合并：同时从 memberIds（旧）和 members[]（新）移除
   */
  async removeMember(params: {
    organizationId: string;
    agentId: string;
    updatedBy: string;
  }): Promise<Organization> {
    const { organizationId, agentId, updatedBy } = params;

    const organization = await organizationStorage.getOrganization(organizationId);
    if (!organization) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    if (!organization.memberIds.includes(agentId)) {
      throw new Error(`Agent "${agentId}" is not a member of organization "${organizationId}"`);
    }

    // P1 双轨合并：同时从 members[] 移除
    const updatedMembers = (organization.members ?? []).filter((m) => m.id !== agentId);

    const updated = await organizationStorage.updateOrganization(organizationId, {
      memberIds: organization.memberIds.filter((id) => id !== agentId),
      members: updatedMembers,
      updatedBy,
    });
    console.log(
      `[Organization System] Removed member ${agentId} from organization ${organizationId}`,
    );

    return updated;
  }

  /**
   * 获取组织的所有子组织
   */
  async getChildren(organizationId: string): Promise<Organization[]> {
    return organizationStorage.getChildOrganizations(organizationId);
  }

  /**
   * 获取组织的所有祖先（从父到根）
   */
  async getAncestors(organizationId: string): Promise<Organization[]> {
    const ancestors: Organization[] = [];
    let current = await organizationStorage.getOrganization(organizationId);

    while (current?.parentId) {
      const parent = await organizationStorage.getOrganization(current.parentId);
      if (!parent) {
        break;
      }
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
    return organizationStorage.listOrganizations({ level });
  }

  /**
   * 获取所有组织
   */
  async getAllOrganizations(): Promise<Organization[]> {
    return organizationStorage.listOrganizations();
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
    const orgs = await organizationStorage.listOrganizations();
    for (const org of orgs) {
      await organizationStorage.deleteOrganization(org.id);
    }
    organizationStorage.clearCache();
    console.log("[Organization System] Cleared all organizations");
  }
}

// 导出单例
export const organizationSystem = new OrganizationSystem();
