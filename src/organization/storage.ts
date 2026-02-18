/**
 * Phase 4: 组织数据持久化存储层
 * 
 * 使用JSON文件存储组织架构数据
 */

import { join } from "node:path";
import type {
  Organization,
  CollaborationRelation,
  OrganizationMember,
  AgentRecruitRequest,
  AgentOnboardingInfo,
} from "./types.js";
import { createAsyncLock, readJsonFile, writeJsonAtomic } from "../infra/json-files.js";
import { STATE_DIR } from "../config/paths.js";

/**
 * 组织存储数据结构
 */
interface OrganizationStorage {
  organizations: Record<string, Organization>;
  relations: Record<string, CollaborationRelation>;
  recruitRequests: Record<string, AgentRecruitRequest>;
  onboardingInfo: Record<string, AgentOnboardingInfo>;
  version: number;
  lastUpdated: number;
}

/**
 * 组织数据存储类
 */
export class OrganizationStorageService {
  private storagePath: string;
  private lock = createAsyncLock();
  private cache: OrganizationStorage | null = null;

  constructor(dataDir: string = STATE_DIR) {
    this.storagePath = join(dataDir, "organization-data.json");
  }

  /**
   * 获取默认存储结构
   */
  private getDefaultStorage(): OrganizationStorage {
    return {
      organizations: {},
      relations: {},
      recruitRequests: {},
      onboardingInfo: {},
      version: 1,
      lastUpdated: Date.now(),
    };
  }

  /**
   * 加载存储数据
   */
  private async load(): Promise<OrganizationStorage> {
    if (this.cache) {
      return this.cache;
    }

    const data = await readJsonFile<OrganizationStorage>(this.storagePath);
    if (!data) {
      this.cache = this.getDefaultStorage();
      return this.cache;
    }

    this.cache = data;
    return data;
  }

  /**
   * 保存存储数据
   */
  private async save(data: OrganizationStorage): Promise<void> {
    data.lastUpdated = Date.now();
    await writeJsonAtomic(this.storagePath, data);
    this.cache = data;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache = null;
  }

  // ==================== 组织 CRUD ====================

  /**
   * 创建组织
   */
  async createOrganization(org: Organization): Promise<Organization> {
    return this.lock(async () => {
      const data = await this.load();

      if (data.organizations[org.id]) {
        throw new Error(`Organization already exists: ${org.id}`);
      }

      data.organizations[org.id] = org;
      await this.save(data);

      return org;
    });
  }

  /**
   * 获取组织
   */
  async getOrganization(id: string): Promise<Organization | null> {
    const data = await this.load();
    return data.organizations[id] || null;
  }

  /**
   * 更新组织
   */
  async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization> {
    return this.lock(async () => {
      const data = await this.load();
      const org = data.organizations[id];

      if (!org) {
        throw new Error(`Organization not found: ${id}`);
      }

      const updated = { ...org, ...updates, id, updatedAt: Date.now() };
      data.organizations[id] = updated;
      await this.save(data);

      return updated;
    });
  }

  /**
   * 删除组织
   */
  async deleteOrganization(id: string): Promise<boolean> {
    return this.lock(async () => {
      const data = await this.load();

      if (!data.organizations[id]) {
        return false;
      }

      delete data.organizations[id];
      await this.save(data);

      return true;
    });
  }

  /**
   * 列出所有组织
   */
  async listOrganizations(filter?: {
    type?: string;
    parentId?: string;
    level?: string;
  }): Promise<Organization[]> {
    const data = await this.load();
    let orgs = Object.values(data.organizations);

    if (filter) {
      if (filter.type) {
        orgs = orgs.filter((o) => o.type === filter.type);
      }
      if (filter.parentId) {
        orgs = orgs.filter((o) => o.parentId === filter.parentId);
      }
      if (filter.level) {
        orgs = orgs.filter((o) => o.level === filter.level);
      }
    }

    return orgs;
  }

  /**
   * 获取子组织
   */
  async getChildOrganizations(parentId: string): Promise<Organization[]> {
    const data = await this.load();
    return Object.values(data.organizations).filter((o) => o.parentId === parentId);
  }

  /**
   * 批量创建组织
   */
  async createOrganizationsBatch(orgs: Organization[]): Promise<Organization[]> {
    return this.lock(async () => {
      const data = await this.load();

      for (const org of orgs) {
        if (data.organizations[org.id]) {
          throw new Error(`Organization already exists: ${org.id}`);
        }
        data.organizations[org.id] = org;
      }

      await this.save(data);
      return orgs;
    });
  }

  // ==================== 成员管理 ====================

  /**
   * 添加组织成员
   */
  async addMember(
    organizationId: string,
    member: OrganizationMember,
  ): Promise<Organization> {
    return this.lock(async () => {
      const data = await this.load();
      const org = data.organizations[organizationId];

      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      // 添加到memberIds
      if (!org.memberIds.includes(member.id)) {
        org.memberIds.push(member.id);
      }

      // 添加到详细成员列表
      if (!org.members) {
        org.members = [];
      }

      const existingIndex = org.members.findIndex((m) => m.id === member.id);
      if (existingIndex >= 0) {
        org.members[existingIndex] = member;
      } else {
        org.members.push(member);
      }

      org.updatedAt = Date.now();
      await this.save(data);

      return org;
    });
  }

  /**
   * 更新组织成员
   */
  async updateMember(
    organizationId: string,
    memberId: string,
    updates: Partial<OrganizationMember>,
  ): Promise<Organization> {
    return this.lock(async () => {
      const data = await this.load();
      const org = data.organizations[organizationId];

      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      if (!org.members) {
        throw new Error(`No members in organization: ${organizationId}`);
      }

      const memberIndex = org.members.findIndex((m) => m.id === memberId);
      if (memberIndex < 0) {
        throw new Error(`Member not found: ${memberId}`);
      }

      org.members[memberIndex] = {
        ...org.members[memberIndex],
        ...updates,
      };
      org.updatedAt = Date.now();
      await this.save(data);

      return org;
    });
  }

  /**
   * 移除组织成员
   */
  async removeMember(organizationId: string, memberId: string): Promise<Organization> {
    return this.lock(async () => {
      const data = await this.load();
      const org = data.organizations[organizationId];

      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      // 从memberIds移除
      org.memberIds = org.memberIds.filter((id) => id !== memberId);

      // 从详细成员列表移除
      if (org.members) {
        org.members = org.members.filter((m) => m.id !== memberId);
      }

      org.updatedAt = Date.now();
      await this.save(data);

      return org;
    });
  }

  /**
   * 获取组织成员
   */
  async getMembers(organizationId: string): Promise<OrganizationMember[]> {
    const data = await this.load();
    const org = data.organizations[organizationId];

    if (!org) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    return org.members || [];
  }

  // ==================== 关系管理 ====================

  /**
   * 创建关系
   */
  async createRelation(relation: CollaborationRelation): Promise<CollaborationRelation> {
    return this.lock(async () => {
      const data = await this.load();

      if (data.relations[relation.id]) {
        throw new Error(`Relation already exists: ${relation.id}`);
      }

      data.relations[relation.id] = relation;
      await this.save(data);

      return relation;
    });
  }

  /**
   * 获取关系
   */
  async getRelation(id: string): Promise<CollaborationRelation | null> {
    const data = await this.load();
    return data.relations[id] || null;
  }

  /**
   * 删除关系
   */
  async deleteRelation(id: string): Promise<boolean> {
    return this.lock(async () => {
      const data = await this.load();

      if (!data.relations[id]) {
        return false;
      }

      delete data.relations[id];
      await this.save(data);

      return true;
    });
  }

  /**
   * 列出关系
   */
  async listRelations(filter?: {
    type?: string;
    fromAgentId?: string;
    toAgentId?: string;
    organizationId?: string;
  }): Promise<CollaborationRelation[]> {
    const data = await this.load();
    let relations = Object.values(data.relations);

    if (filter) {
      if (filter.type) {
        relations = relations.filter((r) => r.type === filter.type);
      }
      if (filter.fromAgentId) {
        relations = relations.filter((r) => r.fromAgentId === filter.fromAgentId);
      }
      if (filter.toAgentId) {
        relations = relations.filter((r) => r.toAgentId === filter.toAgentId);
      }
      if (filter.organizationId) {
        relations = relations.filter((r) => r.organizationId === filter.organizationId);
      }
    }

    return relations;
  }

  /**
   * 批量创建关系
   */
  async createRelationsBatch(relations: CollaborationRelation[]): Promise<CollaborationRelation[]> {
    return this.lock(async () => {
      const data = await this.load();

      for (const relation of relations) {
        if (data.relations[relation.id]) {
          throw new Error(`Relation already exists: ${relation.id}`);
        }
        data.relations[relation.id] = relation;
      }

      await this.save(data);
      return relations;
    });
  }

  // ==================== 招聘请求管理 ====================

  /**
   * 创建招聘请求
   */
  async createRecruitRequest(request: AgentRecruitRequest): Promise<AgentRecruitRequest> {
    return this.lock(async () => {
      const data = await this.load();

      if (data.recruitRequests[request.id]) {
        throw new Error(`Recruit request already exists: ${request.id}`);
      }

      data.recruitRequests[request.id] = request;
      await this.save(data);

      return request;
    });
  }

  /**
   * 获取招聘请求
   */
  async getRecruitRequest(id: string): Promise<AgentRecruitRequest | null> {
    const data = await this.load();
    return data.recruitRequests[id] || null;
  }

  /**
   * 更新招聘请求
   */
  async updateRecruitRequest(
    id: string,
    updates: Partial<AgentRecruitRequest>,
  ): Promise<AgentRecruitRequest> {
    return this.lock(async () => {
      const data = await this.load();
      const request = data.recruitRequests[id];

      if (!request) {
        throw new Error(`Recruit request not found: ${id}`);
      }

      const updated = { ...request, ...updates, id, updatedAt: Date.now() };
      data.recruitRequests[id] = updated;
      await this.save(data);

      return updated;
    });
  }

  /**
   * 列出招聘请求
   */
  async listRecruitRequests(filter?: {
    organizationId?: string;
    status?: string;
  }): Promise<AgentRecruitRequest[]> {
    const data = await this.load();
    let requests = Object.values(data.recruitRequests);

    if (filter) {
      if (filter.organizationId) {
        requests = requests.filter((r) => r.organizationId === filter.organizationId);
      }
      if (filter.status) {
        requests = requests.filter((r) => r.status === filter.status);
      }
    }

    return requests;
  }

  // ==================== 入职管理 ====================

  /**
   * 创建入职信息
   */
  async createOnboardingInfo(info: AgentOnboardingInfo): Promise<AgentOnboardingInfo> {
    return this.lock(async () => {
      const data = await this.load();
      const key = `${info.agentId}_${info.organizationId}`;

      data.onboardingInfo[key] = info;
      await this.save(data);

      return info;
    });
  }

  /**
   * 获取入职信息
   */
  async getOnboardingInfo(agentId: string, organizationId: string): Promise<AgentOnboardingInfo | null> {
    const data = await this.load();
    const key = `${agentId}_${organizationId}`;
    return data.onboardingInfo[key] || null;
  }

  /**
   * 更新入职信息
   */
  async updateOnboardingInfo(
    agentId: string,
    organizationId: string,
    updates: Partial<AgentOnboardingInfo>,
  ): Promise<AgentOnboardingInfo> {
    return this.lock(async () => {
      const data = await this.load();
      const key = `${agentId}_${organizationId}`;
      const info = data.onboardingInfo[key];

      if (!info) {
        throw new Error(`Onboarding info not found for agent ${agentId} in org ${organizationId}`);
      }

      const updated = { ...info, ...updates };
      data.onboardingInfo[key] = updated;
      await this.save(data);

      return updated;
    });
  }

  // ==================== 统计和查询 ====================

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    totalOrganizations: number;
    totalRelations: number;
    totalRecruitRequests: number;
    organizationsByType: Record<string, number>;
    relationsByType: Record<string, number>;
  }> {
    const data = await this.load();
    const orgs = Object.values(data.organizations);
    const relations = Object.values(data.relations);

    const organizationsByType: Record<string, number> = {};
    for (const org of orgs) {
      const type = org.type || org.level;
      organizationsByType[type] = (organizationsByType[type] || 0) + 1;
    }

    const relationsByType: Record<string, number> = {};
    for (const rel of relations) {
      relationsByType[rel.type] = (relationsByType[rel.type] || 0) + 1;
    }

    return {
      totalOrganizations: orgs.length,
      totalRelations: relations.length,
      totalRecruitRequests: Object.keys(data.recruitRequests).length,
      organizationsByType,
      relationsByType,
    };
  }
}

/**
 * 全局存储实例
 */
export const organizationStorage = new OrganizationStorageService();
