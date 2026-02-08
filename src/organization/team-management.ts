/**
 * 团队管理系统
 *
 * 功能：
 * - 团队生命周期管理（创建、更新、删除）
 * - 成员管理（添加、移除、设置领导）
 * - 资源共享管理（工作区、知识库、工具）
 * - 团队查询与统计
 * - 有效期管理（项目制团队）
 */

import type { Team, TeamType } from "./types.js";
import { organizationSystem } from "./organization-system.js";

/**
 * 团队统计信息
 */
export interface TeamStatistics {
  id: string;
  name: string;
  type: TeamType;
  memberCount: number;
  sharedResourcesCount: {
    workspaces: number;
    knowledgeBases: number;
    tools: number;
  };
  isActive: boolean;
  daysRemaining?: number;
  createdAt: number;
}

/**
 * 团队管理系统类
 */
export class TeamManagement {
  private teams: Map<string, Team> = new Map();

  /**
   * 创建团队
   */
  async createTeam(params: {
    id: string;
    name: string;
    organizationId: string;
    leaderId: string;
    memberIds?: string[];
    type: TeamType;
    objectives?: string[];
    sharedResources?: {
      workspaces?: string[];
      knowledgeBases?: string[];
      tools?: string[];
    };
    validFrom?: number;
    validUntil?: number;
  }): Promise<Team> {
    const {
      id,
      name,
      organizationId,
      leaderId,
      memberIds = [],
      type,
      objectives = [],
      sharedResources = {},
      validFrom,
      validUntil,
    } = params;

    // 检查ID是否已存在
    if (this.teams.has(id)) {
      throw new Error(`Team with ID "${id}" already exists`);
    }

    // 验证组织是否存在
    const organization = await organizationSystem.getOrganization(organizationId);
    if (!organization) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    // 验证领导者是否是组织成员
    if (!organization.memberIds.includes(leaderId)) {
      throw new Error(`Leader "${leaderId}" is not a member of organization "${organizationId}"`);
    }

    // 验证所有成员是否是组织成员
    for (const memberId of memberIds) {
      if (!organization.memberIds.includes(memberId)) {
        throw new Error(`Member "${memberId}" is not a member of organization "${organizationId}"`);
      }
    }

    // 确保领导者在成员列表中
    const allMemberIds = new Set([leaderId, ...memberIds]);

    // 验证有效期（项目制和临时团队）
    if ((type === "project" || type === "temporary") && validUntil) {
      if (validFrom && validFrom >= validUntil) {
        throw new Error("validFrom must be earlier than validUntil");
      }
      if (validUntil <= Date.now()) {
        throw new Error("validUntil must be in the future");
      }
    }

    const team: Team = {
      id,
      name,
      organizationId,
      leaderId,
      memberIds: Array.from(allMemberIds),
      type,
      objectives,
      sharedResources: {
        workspaces: sharedResources.workspaces || [],
        knowledgeBases: sharedResources.knowledgeBases || [],
        tools: sharedResources.tools || [],
      },
      validFrom,
      validUntil,
      createdAt: Date.now(),
      createdBy: "system",
    };

    this.teams.set(id, team);
    return team;
  }

  /**
   * 获取团队
   */
  async getTeam(teamId: string): Promise<Team | null> {
    return this.teams.get(teamId) || null;
  }

  /**
   * 更新团队
   */
  async updateTeam(params: {
    teamId: string;
    name?: string;
    objectives?: string[];
    validFrom?: number;
    validUntil?: number;
  }): Promise<Team> {
    const { teamId, name, objectives, validFrom, validUntil } = params;

    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    // 验证有效期
    if (validFrom !== undefined && validUntil !== undefined) {
      if (validFrom >= validUntil) {
        throw new Error("validFrom must be earlier than validUntil");
      }
    }

    const updated: Team = {
      ...team,
      ...(name !== undefined && { name }),
      ...(objectives !== undefined && { objectives }),
      ...(validFrom !== undefined && { validFrom }),
      ...(validUntil !== undefined && { validUntil }),
    };

    this.teams.set(teamId, updated);
    return updated;
  }

  /**
   * 删除团队
   */
  async deleteTeam(teamId: string): Promise<boolean> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    return this.teams.delete(teamId);
  }

  /**
   * 添加团队成员
   */
  async addTeamMember(params: { teamId: string; memberId: string }): Promise<Team> {
    const { teamId, memberId } = params;

    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    // 检查成员是否已在团队中
    if (team.memberIds.includes(memberId)) {
      throw new Error(`Member "${memberId}" is already in team "${teamId}"`);
    }

    // 验证成员是否是组织成员
    const organization = await organizationSystem.getOrganization(team.organizationId);
    if (!organization) {
      throw new Error(`Organization "${team.organizationId}" not found`);
    }

    if (!organization.memberIds.includes(memberId)) {
      throw new Error(
        `Member "${memberId}" is not a member of organization "${team.organizationId}"`,
      );
    }

    const updated: Team = {
      ...team,
      memberIds: [...team.memberIds, memberId],
    };

    this.teams.set(teamId, updated);
    return updated;
  }

  /**
   * 移除团队成员
   */
  async removeTeamMember(params: { teamId: string; memberId: string }): Promise<Team> {
    const { teamId, memberId } = params;

    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    // 不能移除领导者
    if (team.leaderId === memberId) {
      throw new Error(`Cannot remove team leader. Please set a new leader first`);
    }

    // 检查成员是否在团队中
    if (!team.memberIds.includes(memberId)) {
      throw new Error(`Member "${memberId}" is not in team "${teamId}"`);
    }

    const updated: Team = {
      ...team,
      memberIds: team.memberIds.filter((id) => id !== memberId),
    };

    this.teams.set(teamId, updated);
    return updated;
  }

  /**
   * 设置团队领导
   */
  async setTeamLeader(params: { teamId: string; newLeaderId: string }): Promise<Team> {
    const { teamId, newLeaderId } = params;

    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    // 检查新领导者是否在团队中
    if (!team.memberIds.includes(newLeaderId)) {
      throw new Error(`New leader "${newLeaderId}" is not a member of team "${teamId}"`);
    }

    const updated: Team = {
      ...team,
      leaderId: newLeaderId,
    };

    this.teams.set(teamId, updated);
    return updated;
  }

  /**
   * 添加共享资源
   */
  async addSharedResource(params: {
    teamId: string;
    resourceType: "workspaces" | "knowledgeBases" | "tools";
    resourceId: string;
  }): Promise<Team> {
    const { teamId, resourceType, resourceId } = params;

    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    // 检查资源是否已存在
    if (team.sharedResources[resourceType].includes(resourceId)) {
      throw new Error(`Resource "${resourceId}" already exists in ${resourceType}`);
    }

    const updated: Team = {
      ...team,
      sharedResources: {
        ...team.sharedResources,
        [resourceType]: [...team.sharedResources[resourceType], resourceId],
      },
    };

    this.teams.set(teamId, updated);
    return updated;
  }

  /**
   * 移除共享资源
   */
  async removeSharedResource(params: {
    teamId: string;
    resourceType: "workspaces" | "knowledgeBases" | "tools";
    resourceId: string;
  }): Promise<Team> {
    const { teamId, resourceType, resourceId } = params;

    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    // 检查资源是否存在
    if (!team.sharedResources[resourceType].includes(resourceId)) {
      throw new Error(`Resource "${resourceId}" not found in ${resourceType}`);
    }

    const updated: Team = {
      ...team,
      sharedResources: {
        ...team.sharedResources,
        [resourceType]: team.sharedResources[resourceType].filter((id) => id !== resourceId),
      },
    };

    this.teams.set(teamId, updated);
    return updated;
  }

  /**
   * 获取组织的所有团队
   */
  async getTeamsByOrganization(organizationId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter((team) => team.organizationId === organizationId);
  }

  /**
   * 获取团队成员列表
   */
  async getTeamMembers(teamId: string): Promise<string[]> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }
    return [...team.memberIds];
  }

  /**
   * 检查团队是否活跃（未过期）
   */
  isTeamActive(team: Team): boolean {
    // 永久团队始终活跃
    if (team.type === "permanent") {
      return true;
    }

    // 检查有效期
    const now = Date.now();

    if (team.validFrom && now < team.validFrom) {
      return false;
    }

    if (team.validUntil && now > team.validUntil) {
      return false;
    }

    return true;
  }

  /**
   * 获取所有活跃团队
   */
  async getActiveTeams(): Promise<Team[]> {
    return Array.from(this.teams.values()).filter((team) => this.isTeamActive(team));
  }

  /**
   * 获取团队统计信息
   */
  async getTeamStatistics(teamId: string): Promise<TeamStatistics> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team "${teamId}" not found`);
    }

    const isActive = this.isTeamActive(team);
    let daysRemaining: number | undefined;

    if (team.validUntil) {
      const msRemaining = team.validUntil - Date.now();
      daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
    }

    return {
      id: team.id,
      name: team.name,
      type: team.type,
      memberCount: team.memberIds.length,
      sharedResourcesCount: {
        workspaces: team.sharedResources.workspaces.length,
        knowledgeBases: team.sharedResources.knowledgeBases.length,
        tools: team.sharedResources.tools.length,
      },
      isActive,
      daysRemaining,
      createdAt: team.validFrom || 0,
    };
  }

  /**
   * 批量获取团队统计信息
   */
  async getAllTeamsStatistics(): Promise<TeamStatistics[]> {
    const statistics: TeamStatistics[] = [];

    for (const team of this.teams.values()) {
      const stats = await this.getTeamStatistics(team.id);
      statistics.push(stats);
    }

    return statistics;
  }

  /**
   * 获取即将过期的团队（7天内）
   */
  async getExpiringTeams(daysThreshold: number = 7): Promise<Team[]> {
    const now = Date.now();
    const threshold = now + daysThreshold * 24 * 60 * 60 * 1000;

    return Array.from(this.teams.values()).filter((team) => {
      if (!team.validUntil) return false;
      return team.validUntil > now && team.validUntil <= threshold;
    });
  }

  /**
   * 清理过期团队
   */
  async cleanupExpiredTeams(): Promise<string[]> {
    const expiredTeamIds: string[] = [];

    for (const team of this.teams.values()) {
      if (!this.isTeamActive(team)) {
        this.teams.delete(team.id);
        expiredTeamIds.push(team.id);
      }
    }

    return expiredTeamIds;
  }

  /**
   * 获取所有团队
   */
  async getAllTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }
}

// 导出单例实例
export const teamManagement = new TeamManagement();
