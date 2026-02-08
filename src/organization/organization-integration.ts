/**
 * Phase 4: 组织与协作体系 - 集成器
 *
 * 提供4种集成方式：
 * 1. 配置集成（通过 openclaw.json）
 * 2. RPC集成（通过 Gateway RPC）
 * 3. 程序化集成（直接调用API）
 * 4. CLI集成（命令行工具）
 */

import type {
  Organization,
  OrganizationLevel,
  Team,
  TeamType,
  CollaborationRelation,
  CollaborationRelationType,
  MentorshipRelation,
} from "./types.js";
import { collaborationSystem } from "./collaboration-system.js";
import { mentorSystem } from "./mentor-system.js";
import { organizationHierarchy } from "./organization-hierarchy.js";
import { organizationSystem } from "./organization-system.js";
import { teamManagement } from "./team-management.js";

/**
 * ============================================
 * 1. 配置集成
 * ============================================
 */

/**
 * 组织配置结构
 */
export interface OrganizationConfig {
  organizations?: Array<{
    id: string;
    name: string;
    level: OrganizationLevel;
    parentId?: string;
    managerId?: string;
    memberIds?: string[];
    quota?: {
      maxMembers?: number;
      budgetPerMonth?: number;
      maxTokensPerDay?: number;
    };
  }>;
  teams?: Array<{
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
  }>;
  collaborations?: Array<{
    id: string;
    fromAgentId: string;
    toAgentId: string;
    type: CollaborationRelationType;
    organizationId?: string;
    metadata?: Record<string, any>;
    validFrom?: number;
    validUntil?: number;
  }>;
  mentorships?: Array<{
    id: string;
    mentorId: string;
    menteeId: string;
    trainingPlan?: {
      goals: string[];
      skills: string[];
      duration?: number;
    };
  }>;
}

/**
 * 从配置初始化组织体系
 */
export async function initializeFromConfig(
  config: OrganizationConfig,
  createdBy: string = "system",
): Promise<{
  organizations: Organization[];
  teams: Team[];
  collaborations: CollaborationRelation[];
  mentorships: MentorshipRelation[];
}> {
  const results = {
    organizations: [] as Organization[],
    teams: [] as Team[],
    collaborations: [] as CollaborationRelation[],
    mentorships: [] as MentorshipRelation[],
  };

  // 1. 创建组织（按层级顺序）
  if (config.organizations) {
    const levelOrder: OrganizationLevel[] = ["company", "department", "team", "individual"];

    for (const level of levelOrder) {
      const orgsAtLevel = config.organizations.filter((org) => org.level === level);

      for (const orgConfig of orgsAtLevel) {
        try {
          const org = await organizationSystem.createOrganization({
            ...orgConfig,
            memberIds: orgConfig.memberIds || [],
            createdBy,
          });
          results.organizations.push(org);
        } catch (error) {
          console.error(`Failed to create organization ${orgConfig.id}:`, error);
        }
      }
    }
  }

  // 2. 创建团队
  if (config.teams) {
    for (const teamConfig of config.teams) {
      try {
        const team = await teamManagement.createTeam({
          ...teamConfig,
          memberIds: teamConfig.memberIds || [],
          objectives: teamConfig.objectives || [],
          sharedResources: teamConfig.sharedResources || {},
        });
        results.teams.push(team);
      } catch (error) {
        console.error(`Failed to create team ${teamConfig.id}:`, error);
      }
    }
  }

  // 3. 创建协作关系
  if (config.collaborations) {
    for (const collabConfig of config.collaborations) {
      try {
        const collab = await collaborationSystem.createRelation({
          ...collabConfig,
          metadata: collabConfig.metadata || {},
          createdBy,
        });
        results.collaborations.push(collab);
      } catch (error) {
        console.error(`Failed to create collaboration ${collabConfig.id}:`, error);
      }
    }
  }

  // 4. 创建师徒关系
  if (config.mentorships) {
    for (const mentorConfig of config.mentorships) {
      try {
        const mentorship = await mentorSystem.createMentorship({
          ...mentorConfig,
          createdBy,
        });
        results.mentorships.push(mentorship);
      } catch (error) {
        console.error(`Failed to create mentorship ${mentorConfig.id}:`, error);
      }
    }
  }

  return results;
}

/**
 * ============================================
 * 2. RPC集成
 * ============================================
 */

/**
 * RPC 方法注册
 *
 * 使用示例：
 * await gateway.call('organization.create', { ... });
 * await gateway.call('team.addMember', { ... });
 */
export const OrganizationRpcMethods = {
  // === 组织管理 ===
  "organization.create": async (params: any) => {
    return await organizationSystem.createOrganization(params);
  },

  "organization.get": async (params: { organizationId: string }) => {
    return await organizationSystem.getOrganization(params.organizationId);
  },

  "organization.update": async (params: any) => {
    return await organizationSystem.updateOrganization(params);
  },

  "organization.delete": async (params: { organizationId: string }) => {
    return await organizationSystem.deleteOrganization(params.organizationId);
  },

  "organization.addMember": async (params: any) => {
    return await organizationSystem.addMember(params);
  },

  "organization.removeMember": async (params: any) => {
    return await organizationSystem.removeMember(params);
  },

  "organization.getChildren": async (params: { organizationId: string }) => {
    return await organizationSystem.getChildren(params.organizationId);
  },

  "organization.getStatistics": async (params: { organizationId: string }) => {
    return await organizationHierarchy.getStatistics(params.organizationId);
  },

  // === 团队管理 ===
  "team.create": async (params: any) => {
    return await teamManagement.createTeam(params);
  },

  "team.get": async (params: { teamId: string }) => {
    return await teamManagement.getTeam(params.teamId);
  },

  "team.update": async (params: any) => {
    return await teamManagement.updateTeam(params);
  },

  "team.delete": async (params: { teamId: string }) => {
    return await teamManagement.deleteTeam(params.teamId);
  },

  "team.addMember": async (params: any) => {
    return await teamManagement.addTeamMember(params);
  },

  "team.removeMember": async (params: any) => {
    return await teamManagement.removeTeamMember(params);
  },

  "team.setLeader": async (params: any) => {
    return await teamManagement.setTeamLeader(params);
  },

  "team.getStatistics": async (params: { teamId: string }) => {
    return await teamManagement.getTeamStatistics(params.teamId);
  },

  // === 协作管理 ===
  "collaboration.create": async (params: any) => {
    return await collaborationSystem.createRelation(params);
  },

  "collaboration.get": async (params: { relationId: string }) => {
    return await collaborationSystem.getRelation(params.relationId);
  },

  "collaboration.delete": async (params: { relationId: string }) => {
    return await collaborationSystem.deleteRelation(params.relationId);
  },

  "collaboration.getByAgent": async (params: { agentId: string }) => {
    return await collaborationSystem.getRelationsByAgent(params.agentId);
  },

  "collaboration.getNetworkStats": async (params: { agentId: string }) => {
    return await collaborationSystem.getNetworkStats(params.agentId);
  },

  // === 师徒管理 ===
  "mentorship.create": async (params: any) => {
    return await mentorSystem.createMentorship(params);
  },

  "mentorship.get": async (params: { mentorshipId: string }) => {
    return await mentorSystem.getMentorship(params.mentorshipId);
  },

  "mentorship.updateProgress": async (params: any) => {
    return await mentorSystem.updateProgress(params);
  },

  "mentorship.complete": async (params: any) => {
    return await mentorSystem.completeMentorship(params);
  },

  "mentorship.cancel": async (params: any) => {
    return await mentorSystem.cancelMentorship(params);
  },

  "mentorship.getMentorStats": async (params: { mentorId: string }) => {
    return await mentorSystem.getMentorStats(params.mentorId);
  },

  "mentorship.getProgressReport": async (params: { mentorshipId: string }) => {
    return await mentorSystem.getProgressReport(params.mentorshipId);
  },
};

/**
 * ============================================
 * 3. 程序化集成（直接API调用）
 * ============================================
 */

/**
 * 组织体系 API 门面
 *
 * 使用示例：
 * import { OrganizationAPI } from './organization-integration';
 * const org = await OrganizationAPI.createOrganization({ ... });
 */
export const OrganizationAPI = {
  // === 组织 ===
  organization: {
    create: organizationSystem.createOrganization.bind(organizationSystem),
    get: organizationSystem.getOrganization.bind(organizationSystem),
    update: organizationSystem.updateOrganization.bind(organizationSystem),
    delete: organizationSystem.deleteOrganization.bind(organizationSystem),
    addMember: organizationSystem.addMember.bind(organizationSystem),
    removeMember: organizationSystem.removeMember.bind(organizationSystem),
    getChildren: organizationSystem.getChildren.bind(organizationSystem),
    getAncestors: organizationSystem.getAncestors.bind(organizationSystem),
    getDescendants: organizationSystem.getDescendants.bind(organizationSystem),
  },

  // === 层级 ===
  hierarchy: {
    isAncestor: organizationHierarchy.isAncestor.bind(organizationHierarchy),
    isSibling: organizationHierarchy.isSibling.bind(organizationHierarchy),
    getCommonAncestor: organizationHierarchy.getCommonAncestor.bind(organizationHierarchy),
    getTree: organizationHierarchy.getTree.bind(organizationHierarchy),
    getAllMembers: organizationHierarchy.getAllMembers.bind(organizationHierarchy),
    getStatistics: organizationHierarchy.getStatistics.bind(organizationHierarchy),
  },

  // === 团队 ===
  team: {
    create: teamManagement.createTeam.bind(teamManagement),
    get: teamManagement.getTeam.bind(teamManagement),
    update: teamManagement.updateTeam.bind(teamManagement),
    delete: teamManagement.deleteTeam.bind(teamManagement),
    addMember: teamManagement.addTeamMember.bind(teamManagement),
    removeMember: teamManagement.removeTeamMember.bind(teamManagement),
    setLeader: teamManagement.setTeamLeader.bind(teamManagement),
    addResource: teamManagement.addSharedResource.bind(teamManagement),
    removeResource: teamManagement.removeSharedResource.bind(teamManagement),
    getStatistics: teamManagement.getTeamStatistics.bind(teamManagement),
    getActive: teamManagement.getActiveTeams.bind(teamManagement),
  },

  // === 协作 ===
  collaboration: {
    create: collaborationSystem.createRelation.bind(collaborationSystem),
    get: collaborationSystem.getRelation.bind(collaborationSystem),
    delete: collaborationSystem.deleteRelation.bind(collaborationSystem),
    getByAgent: collaborationSystem.getRelationsByAgent.bind(collaborationSystem),
    getByType: collaborationSystem.getRelationsByType.bind(collaborationSystem),
    getSupervisors: collaborationSystem.getSupervisors.bind(collaborationSystem),
    getSubordinates: collaborationSystem.getSubordinates.bind(collaborationSystem),
    getNetworkStats: collaborationSystem.getNetworkStats.bind(collaborationSystem),
    findPath: collaborationSystem.findCollaborationPath.bind(collaborationSystem),
  },

  // === 师徒 ===
  mentorship: {
    create: mentorSystem.createMentorship.bind(mentorSystem),
    get: mentorSystem.getMentorship.bind(mentorSystem),
    updatePlan: mentorSystem.updateTrainingPlan.bind(mentorSystem),
    updateProgress: mentorSystem.updateProgress.bind(mentorSystem),
    complete: mentorSystem.completeMentorship.bind(mentorSystem),
    cancel: mentorSystem.cancelMentorship.bind(mentorSystem),
    getMentorStats: mentorSystem.getMentorStats.bind(mentorSystem),
    getMenteeStats: mentorSystem.getMenteeStats.bind(mentorSystem),
    getProgressReport: mentorSystem.getProgressReport.bind(mentorSystem),
    suggestMentors: mentorSystem.suggestMentors.bind(mentorSystem),
  },
};

/**
 * ============================================
 * 4. CLI集成
 * ============================================
 */

/**
 * CLI 命令处理器
 *
 * 使用示例：
 * $ openclaw org:create --id=eng --name="Engineering" --level=department
 * $ openclaw team:add-member --team-id=team1 --member-id=agent123
 */
export const OrganizationCLI = {
  /**
   * 组织命令
   */
  "org:create": async (args: Record<string, string>) => {
    return await organizationSystem.createOrganization({
      id: args.id,
      name: args.name,
      level: args.level as OrganizationLevel,
      parentId: args.parentId,
      managerId: args.managerId,
      memberIds: args.memberIds ? args.memberIds.split(",") : [],
      createdBy: args.createdBy || "cli",
    });
  },

  "org:get": async (args: Record<string, string>) => {
    return await organizationSystem.getOrganization(args.id);
  },

  "org:list": async () => {
    return await organizationSystem.getAllOrganizations();
  },

  "org:delete": async (args: Record<string, string>) => {
    return await organizationSystem.deleteOrganization(args.id);
  },

  "org:add-member": async (args: Record<string, string>) => {
    return await organizationSystem.addMember({
      organizationId: args.orgId,
      agentId: args.memberId,
      updatedBy: args.updatedBy || "cli",
    });
  },

  "org:stats": async (args: Record<string, string>) => {
    return await organizationHierarchy.getStatistics(args.id);
  },

  /**
   * 团队命令
   */
  "team:create": async (args: Record<string, string>) => {
    return await teamManagement.createTeam({
      id: args.id,
      name: args.name,
      organizationId: args.orgId,
      leaderId: args.leaderId,
      memberIds: args.memberIds ? args.memberIds.split(",") : [],
      type: args.type as TeamType,
      objectives: args.objectives ? args.objectives.split(",") : [],
    });
  },

  "team:get": async (args: Record<string, string>) => {
    return await teamManagement.getTeam(args.id);
  },

  "team:list": async () => {
    return await teamManagement.getAllTeams();
  },

  "team:delete": async (args: Record<string, string>) => {
    return await teamManagement.deleteTeam(args.id);
  },

  "team:add-member": async (args: Record<string, string>) => {
    return await teamManagement.addTeamMember({
      teamId: args.teamId,
      memberId: args.memberId,
    });
  },

  "team:stats": async (args: Record<string, string>) => {
    return await teamManagement.getTeamStatistics(args.id);
  },

  /**
   * 协作命令
   */
  "collab:create": async (args: Record<string, string>) => {
    return await collaborationSystem.createRelation({
      id: args.id,
      fromAgentId: args.from,
      toAgentId: args.to,
      type: args.type as CollaborationRelationType,
      organizationId: args.orgId,
      createdBy: args.createdBy || "cli",
    });
  },

  "collab:get": async (args: Record<string, string>) => {
    return await collaborationSystem.getRelation(args.id);
  },

  "collab:list": async (args: Record<string, string>) => {
    return await collaborationSystem.getRelationsByAgent(args.agentId);
  },

  "collab:delete": async (args: Record<string, string>) => {
    return await collaborationSystem.deleteRelation(args.id);
  },

  "collab:network": async (args: Record<string, string>) => {
    return await collaborationSystem.getNetworkStats(args.agentId);
  },

  /**
   * 师徒命令
   */
  "mentor:create": async (args: Record<string, string>) => {
    const trainingPlan =
      args.goals || args.skills
        ? {
            goals: args.goals ? args.goals.split(",") : [],
            skills: args.skills ? args.skills.split(",") : [],
            duration: args.duration ? parseInt(args.duration) : undefined,
          }
        : undefined;

    return await mentorSystem.createMentorship({
      id: args.id,
      mentorId: args.mentorId,
      menteeId: args.menteeId,
      trainingPlan,
      createdBy: args.createdBy || "cli",
    });
  },

  "mentor:get": async (args: Record<string, string>) => {
    return await mentorSystem.getMentorship(args.id);
  },

  "mentor:progress": async (args: Record<string, string>) => {
    return await mentorSystem.getProgressReport(args.id);
  },

  "mentor:complete": async (args: Record<string, string>) => {
    return await mentorSystem.completeMentorship({
      mentorshipId: args.id,
      updatedBy: args.updatedBy || "cli",
    });
  },

  "mentor:stats": async (args: Record<string, string>) => {
    if (args.type === "mentor") {
      return await mentorSystem.getMentorStats(args.id);
    } else {
      return await mentorSystem.getMenteeStats(args.id);
    }
  },
};

/**
 * ============================================
 * 导出所有集成接口
 * ============================================
 */
export {
  // 核心系统实例
  organizationSystem,
  organizationHierarchy,
  teamManagement,
  collaborationSystem,
  mentorSystem,
};
