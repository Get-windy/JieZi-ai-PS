/**
 * Phase 4: 组织数据持久化存储层
 *
 * 使用JSON文件存储组织架构数据
 */

import { join } from "node:path";
import { STATE_DIR } from "../../upstream/src/config/paths.js";
import { createAsyncLock, readJsonFile, writeJsonAtomic } from "../../upstream/src/infra/json-files.js";
import type {
  Organization,
  CollaborationRelation,
  OrganizationMember,
  AgentRecruitRequest,
  AgentOnboardingInfo,
  ProjectTeamRelation,
  HandoffRecord,
} from "./types.js";

/**
 * 组织存储数据结构
 */
interface OrganizationStorage {
  organizations: Record<string, Organization>;
  relations: Record<string, CollaborationRelation>;
  recruitRequests: Record<string, AgentRecruitRequest>;
  onboardingInfo: Record<string, AgentOnboardingInfo>;
  /** 项目-团队关系（关系ID → ProjectTeamRelation） */
  projectTeamRelations: Record<string, ProjectTeamRelation>;
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
      projectTeamRelations: {},
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

    // 兼容旧版本数据（projectTeamRelations 字段不存在时补充默认值）
    if (!data.projectTeamRelations) {
      data.projectTeamRelations = {};
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
  async addMember(organizationId: string, member: OrganizationMember): Promise<Organization> {
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
  async getOnboardingInfo(
    agentId: string,
    organizationId: string,
  ): Promise<AgentOnboardingInfo | null> {
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

  // ==================== 项目-团队关系 CRUD ====================

  /**
   * 将团队分配到项目（创建或更新 ProjectTeamRelation）
   */
  async assignTeamToProject(
    relation: Omit<ProjectTeamRelation, "handoffHistory"> & { handoffHistory?: HandoffRecord[] },
  ): Promise<ProjectTeamRelation> {
    return this.lock(async () => {
      const data = await this.load();
      const full: ProjectTeamRelation = {
        ...relation,
        handoffHistory: relation.handoffHistory ?? [],
      };
      data.projectTeamRelations[full.id] = full;
      await this.save(data);
      return full;
    });
  }

  /**
   * 获取项目的所有团队关系
   */
  async getProjectTeamRelations(
    projectId: string,
    filter?: {
      teamId?: string;
      status?: ProjectTeamRelation["status"];
      role?: ProjectTeamRelation["role"];
    },
  ): Promise<ProjectTeamRelation[]> {
    const data = await this.load();
    let relations = Object.values(data.projectTeamRelations).filter(
      (r) => r.projectId === projectId,
    );
    if (filter?.teamId) {
      relations = relations.filter((r) => r.teamId === filter.teamId);
    }
    if (filter?.status) {
      relations = relations.filter((r) => r.status === filter.status);
    }
    if (filter?.role) {
      relations = relations.filter((r) => r.role === filter.role);
    }
    return relations;
  }

  /**
   * 获取团队参与的所有项目关系
   */
  async getTeamProjectRelations(
    teamId: string,
    filter?: { status?: ProjectTeamRelation["status"]; role?: ProjectTeamRelation["role"] },
  ): Promise<ProjectTeamRelation[]> {
    const data = await this.load();
    let relations = Object.values(data.projectTeamRelations).filter((r) => r.teamId === teamId);
    if (filter?.status) {
      relations = relations.filter((r) => r.status === filter.status);
    }
    if (filter?.role) {
      relations = relations.filter((r) => r.role === filter.role);
    }
    return relations;
  }

  /**
   * 执行项目交付：将责任从一个团队移交到另一个团队
   *
   * - fromTeam 状态变为 fromTeamNewStatus（默认 support-only）
   * - toTeam 状态变为 toTeamNewStatus（默认 active）
   * - 双方都记录 HandoffRecord
   */
  async handoffProject(params: {
    projectId: string;
    fromTeamId: string;
    toTeamId: string;
    toTeamRole: ProjectTeamRelation["role"];
    fromTeamNewStatus: ProjectTeamRelation["status"];
    toTeamNewStatus: ProjectTeamRelation["status"];
    operatorId: string;
    note?: string;
    toTeamAssignedBy?: string;
  }): Promise<{
    fromRelation: ProjectTeamRelation;
    toRelation: ProjectTeamRelation;
    handoffRecord: HandoffRecord;
  }> {
    return this.lock(async () => {
      const data = await this.load();
      const now = Date.now();

      // 找到 fromTeam 关系
      const fromRelation = Object.values(data.projectTeamRelations).find(
        (r) => r.projectId === params.projectId && r.teamId === params.fromTeamId,
      );
      if (!fromRelation) {
        throw new Error(
          `Team ${params.fromTeamId} is not associated with project ${params.projectId}`,
        );
      }

      // 构建交付记录
      const handoffRecord: HandoffRecord = {
        id: `handoff_${now}_${Math.random().toString(36).substr(2, 8)}`,
        fromTeamId: params.fromTeamId,
        toTeamId: params.toTeamId,
        note: params.note,
        operatorId: params.operatorId,
        handoffAt: now,
        fromTeamNewStatus: params.fromTeamNewStatus,
        toTeamNewStatus: params.toTeamNewStatus,
      };

      // 更新 fromTeam 关系
      const updatedFrom: ProjectTeamRelation = {
        ...fromRelation,
        status: params.fromTeamNewStatus,
        updatedAt: now,
        updatedBy: params.operatorId,
        handoffHistory: [...fromRelation.handoffHistory, handoffRecord],
      };
      data.projectTeamRelations[fromRelation.id] = updatedFrom;

      // 查找或创建 toTeam 关系
      const existingTo = Object.values(data.projectTeamRelations).find(
        (r) => r.projectId === params.projectId && r.teamId === params.toTeamId,
      );

      let updatedTo: ProjectTeamRelation;
      if (existingTo) {
        updatedTo = {
          ...existingTo,
          role: params.toTeamRole,
          status: params.toTeamNewStatus,
          updatedAt: now,
          updatedBy: params.operatorId,
          handoffHistory: [...existingTo.handoffHistory, handoffRecord],
        };
        data.projectTeamRelations[existingTo.id] = updatedTo;
      } else {
        const toRelId = `ptr_${now}_${Math.random().toString(36).substr(2, 8)}`;
        updatedTo = {
          id: toRelId,
          projectId: params.projectId,
          teamId: params.toTeamId,
          role: params.toTeamRole,
          status: params.toTeamNewStatus,
          joinedAt: now,
          assignedBy: params.toTeamAssignedBy ?? params.operatorId,
          updatedAt: now,
          updatedBy: params.operatorId,
          handoffHistory: [handoffRecord],
        };
        data.projectTeamRelations[toRelId] = updatedTo;
      }

      await this.save(data);
      return { fromRelation: updatedFrom, toRelation: updatedTo, handoffRecord };
    });
  }

  /**
   * 更新项目-团队关系的状态（直接更新，不记录交付记录）
   */
  async updateProjectTeamRelation(
    relationId: string,
    updates: Partial<Pick<ProjectTeamRelation, "status" | "role" | "note" | "updatedBy">>,
  ): Promise<ProjectTeamRelation> {
    return this.lock(async () => {
      const data = await this.load();
      const rel = data.projectTeamRelations[relationId];
      if (!rel) {
        throw new Error(`ProjectTeamRelation not found: ${relationId}`);
      }
      const updated: ProjectTeamRelation = { ...rel, ...updates, updatedAt: Date.now() };
      data.projectTeamRelations[relationId] = updated;
      await this.save(data);
      return updated;
    });
  }

  /**
   * 删除项目-团队关系
   */
  async removeTeamFromProject(projectId: string, teamId: string): Promise<boolean> {
    return this.lock(async () => {
      const data = await this.load();
      const rel = Object.values(data.projectTeamRelations).find(
        (r) => r.projectId === projectId && r.teamId === teamId,
      );
      if (!rel) {
        return false;
      }
      delete data.projectTeamRelations[rel.id];
      await this.save(data);
      return true;
    });
  }
}

/**
 * 全局存储实例
 */
export const organizationStorage = new OrganizationStorageService();
