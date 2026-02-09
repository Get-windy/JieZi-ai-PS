/**
 * Phase 4: 组织与协作体系 - 集成测试
 *
 * 测试场景：
 * 1. 组织层级管理
 * 2. 团队管理
 * 3. 协作关系管理
 * 4. 师徒系统
 * 5. 完整集成流程
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { collaborationSystem } from "../src/organization/collaboration-system.js";
import { mentorSystem } from "../src/organization/mentor-system.js";
import { organizationHierarchy } from "../src/organization/organization-hierarchy.js";
import {
  initializeFromConfig,
  type OrganizationConfig,
} from "../src/organization/organization-integration.js";
import { organizationSystem } from "../src/organization/organization-system.js";
import { teamManagement } from "../src/organization/team-management.js";

describe("Phase 4: Organization System Integration Tests", () => {
  beforeEach(() => {
    // 清空所有数据（测试环境）
    (organizationSystem as any).organizations.clear();
    (teamManagement as any).teams.clear();
    (collaborationSystem as any).relations.clear();
    (collaborationSystem as any).relationsByAgent.clear();
    (mentorSystem as any).mentorships.clear();
    (mentorSystem as any).mentorshipsByMentor.clear();
    (mentorSystem as any).mentorshipsByMentee.clear();
  });

  describe("组织层级管理", () => {
    it("应该成功创建四级组织结构", async () => {
      // 1. 创建公司
      const company = await organizationSystem.createOrganization({
        id: "company1",
        name: "TechCorp",
        level: "company",
        createdBy: "system",
      });

      expect(company.id).toBe("company1");
      expect(company.level).toBe("company");

      // 2. 创建部门
      const department = await organizationSystem.createOrganization({
        id: "dept1",
        name: "Engineering",
        level: "department",
        parentId: "company1",
        createdBy: "system",
      });

      expect(department.parentId).toBe("company1");

      // 3. 创建团队
      const team = await organizationSystem.createOrganization({
        id: "team1",
        name: "Backend Team",
        level: "team",
        parentId: "dept1",
        createdBy: "system",
      });

      expect(team.parentId).toBe("dept1");

      // 4. 创建个人
      const individual = await organizationSystem.createOrganization({
        id: "agent1",
        name: "John Doe",
        level: "individual",
        parentId: "team1",
        memberIds: ["agent1"],
        createdBy: "system",
      });

      expect(individual.parentId).toBe("team1");
    });

    it("应该验证层级关系的合法性", async () => {
      await organizationSystem.createOrganization({
        id: "company1",
        name: "TechCorp",
        level: "company",
        createdBy: "system",
      });

      // 尝试创建非法层级：team 作为 company 的直接子级
      await expect(
        organizationSystem.createOrganization({
          id: "team1",
          name: "Invalid Team",
          level: "team",
          parentId: "company1",
          createdBy: "system",
        }),
      ).rejects.toThrow();
    });

    it("应该正确获取组织树结构", async () => {
      // 创建完整组织结构
      await organizationSystem.createOrganization({
        id: "company1",
        name: "TechCorp",
        level: "company",
        createdBy: "system",
      });

      await organizationSystem.createOrganization({
        id: "dept1",
        name: "Engineering",
        level: "department",
        parentId: "company1",
        createdBy: "system",
      });

      await organizationSystem.createOrganization({
        id: "team1",
        name: "Backend Team",
        level: "team",
        parentId: "dept1",
        createdBy: "system",
      });

      const tree = await organizationHierarchy.getTree("company1");

      expect(tree).not.toBeNull();
      expect(tree!.organization.id).toBe("company1");
      expect(tree!.children.length).toBe(1);
      expect(tree!.children[0].organization.id).toBe("dept1");
      expect(tree!.children[0].children.length).toBe(1);
      expect(tree!.children[0].children[0].organization.id).toBe("team1");
    });

    it("应该正确获取组织统计信息", async () => {
      await organizationSystem.createOrganization({
        id: "dept1",
        name: "Engineering",
        level: "department",
        memberIds: ["agent1", "agent2"],
        createdBy: "system",
      });

      await organizationSystem.createOrganization({
        id: "team1",
        name: "Backend Team",
        level: "team",
        parentId: "dept1",
        memberIds: ["agent3", "agent4"],
        createdBy: "system",
      });

      const stats = await organizationHierarchy.getStatistics("dept1");

      expect(stats.directMembers).toBe(2);
      expect(stats.totalMembers).toBe(4);
      expect(stats.directChildren).toBe(1);
      expect(stats.totalDescendants).toBe(1);
    });
  });

  describe("团队管理", () => {
    beforeEach(async () => {
      await organizationSystem.createOrganization({
        id: "org1",
        name: "Organization",
        level: "department",
        memberIds: ["agent1", "agent2", "agent3"],
        createdBy: "system",
      });
    });

    it("应该成功创建团队", async () => {
      const team = await teamManagement.createTeam({
        id: "team1",
        name: "Project Alpha",
        organizationId: "org1",
        leaderId: "agent1",
        memberIds: ["agent2", "agent3"],
        type: "project",
        objectives: ["Launch product", "Increase revenue"],
      });

      expect(team.id).toBe("team1");
      expect(team.memberIds).toContain("agent1");
      expect(team.memberIds).toContain("agent2");
      expect(team.memberIds).toContain("agent3");
      expect(team.objectives.length).toBe(2);
    });

    it("应该验证团队成员属于组织", async () => {
      await expect(
        teamManagement.createTeam({
          id: "team1",
          name: "Invalid Team",
          organizationId: "org1",
          leaderId: "agent1",
          memberIds: ["nonexistent"],
          type: "permanent",
        }),
      ).rejects.toThrow();
    });

    it("应该成功添加和移除团队成员", async () => {
      const team = await teamManagement.createTeam({
        id: "team1",
        name: "Team",
        organizationId: "org1",
        leaderId: "agent1",
        type: "permanent",
      });

      const updated = await teamManagement.addTeamMember({
        teamId: "team1",
        memberId: "agent2",
      });

      expect(updated.memberIds).toContain("agent2");

      const removed = await teamManagement.removeTeamMember({
        teamId: "team1",
        memberId: "agent2",
      });

      expect(removed.memberIds).not.toContain("agent2");
    });

    it("应该管理共享资源", async () => {
      await teamManagement.createTeam({
        id: "team1",
        name: "Team",
        organizationId: "org1",
        leaderId: "agent1",
        type: "permanent",
      });

      let team = await teamManagement.addSharedResource({
        teamId: "team1",
        resourceType: "workspaces",
        resourceId: "workspace1",
      });

      expect(team.sharedResources.workspaces).toContain("workspace1");

      team = await teamManagement.addSharedResource({
        teamId: "team1",
        resourceType: "knowledgeBases",
        resourceId: "kb1",
      });

      expect(team.sharedResources.knowledgeBases).toContain("kb1");

      team = await teamManagement.removeSharedResource({
        teamId: "team1",
        resourceType: "workspaces",
        resourceId: "workspace1",
      });

      expect(team.sharedResources.workspaces).not.toContain("workspace1");
    });

    it("应该正确处理团队有效期", async () => {
      const now = Date.now();
      const future = now + 30 * 24 * 60 * 60 * 1000; // 30天后

      const team = await teamManagement.createTeam({
        id: "team1",
        name: "Temporary Team",
        organizationId: "org1",
        leaderId: "agent1",
        type: "temporary",
        validFrom: now,
        validUntil: future,
      });

      expect(teamManagement.isTeamActive(team)).toBe(true);

      const stats = await teamManagement.getTeamStatistics("team1");
      expect(stats.isActive).toBe(true);
      expect(stats.daysRemaining).toBeGreaterThan(25);
    });
  });

  describe("协作关系管理", () => {
    beforeEach(async () => {
      await organizationSystem.createOrganization({
        id: "org1",
        name: "Organization",
        level: "department",
        memberIds: ["agent1", "agent2", "agent3"],
        createdBy: "system",
      });
    });

    it("应该成功创建协作关系", async () => {
      const relation = await collaborationSystem.createRelation({
        id: "rel1",
        fromAgentId: "agent1",
        toAgentId: "agent2",
        type: "colleague",
        organizationId: "org1",
        createdBy: "system",
      });

      expect(relation.id).toBe("rel1");
      expect(relation.type).toBe("colleague");
    });

    it("应该防止自我关系", async () => {
      await expect(
        collaborationSystem.createRelation({
          id: "rel1",
          fromAgentId: "agent1",
          toAgentId: "agent1",
          type: "colleague",
          createdBy: "system",
        }),
      ).rejects.toThrow();
    });

    it("应该正确获取上下级关系", async () => {
      await collaborationSystem.createRelation({
        id: "rel1",
        fromAgentId: "agent1",
        toAgentId: "agent2",
        type: "supervisor",
        createdBy: "system",
      });

      const supervisors = await collaborationSystem.getSupervisors("agent2");
      expect(supervisors).toContain("agent1");

      const subordinates = await collaborationSystem.getSubordinates("agent1");
      expect(subordinates).toContain("agent2");
    });

    it("应该生成协作网络统计", async () => {
      await collaborationSystem.createRelation({
        id: "rel1",
        fromAgentId: "agent1",
        toAgentId: "agent2",
        type: "supervisor",
        createdBy: "system",
      });

      await collaborationSystem.createRelation({
        id: "rel2",
        fromAgentId: "agent1",
        toAgentId: "agent3",
        type: "colleague",
        createdBy: "system",
      });

      const stats = await collaborationSystem.getNetworkStats("agent1");

      expect(stats.totalRelations).toBe(2);
      expect(stats.subordinates.length).toBe(1);
      expect(stats.colleagues.length).toBe(1);
    });

    it("应该找到协作路径", async () => {
      await collaborationSystem.createRelation({
        id: "rel1",
        fromAgentId: "agent1",
        toAgentId: "agent2",
        type: "colleague",
        createdBy: "system",
      });

      await collaborationSystem.createRelation({
        id: "rel2",
        fromAgentId: "agent2",
        toAgentId: "agent3",
        type: "colleague",
        createdBy: "system",
      });

      const path = await collaborationSystem.findCollaborationPath("agent1", "agent3");

      expect(path).not.toBeNull();
      expect(path!.length).toBe(2);
      expect(path!.path[0].agentId).toBe("agent2");
      expect(path!.path[1].agentId).toBe("agent3");
    });
  });

  describe("师徒系统", () => {
    it("应该成功创建师徒关系", async () => {
      const mentorship = await mentorSystem.createMentorship({
        id: "mentorship1",
        mentorId: "agent1",
        menteeId: "agent2",
        trainingPlan: {
          goals: ["Learn TypeScript", "Build REST API"],
          skills: ["TypeScript", "Node.js", "Express"],
          duration: 90 * 24 * 60 * 60 * 1000, // 90天
        },
        createdBy: "system",
      });

      expect(mentorship.id).toBe("mentorship1");
      expect(mentorship.status).toBe("active");
      expect(mentorship.trainingPlan?.goals.length).toBe(2);
      expect(mentorship.trainingPlan?.skills.length).toBe(3);
    });

    it("应该防止自我师徒关系", async () => {
      await expect(
        mentorSystem.createMentorship({
          id: "mentorship1",
          mentorId: "agent1",
          menteeId: "agent1",
          createdBy: "system",
        }),
      ).rejects.toThrow();
    });

    it("应该正确更新培训进度", async () => {
      await mentorSystem.createMentorship({
        id: "mentorship1",
        mentorId: "agent1",
        menteeId: "agent2",
        trainingPlan: {
          goals: ["Goal 1", "Goal 2"],
          skills: ["Skill 1", "Skill 2"],
        },
        createdBy: "system",
      });

      const updated = await mentorSystem.updateProgress({
        mentorshipId: "mentorship1",
        completedGoals: ["Goal 1"],
        acquiredSkills: ["Skill 1"],
        updatedBy: "agent1",
      });

      expect(updated.progress?.completedGoals).toContain("Goal 1");
      expect(updated.progress?.acquiredSkills).toContain("Skill 1");
      expect(updated.progress?.progressRate).toBe(50);
    });

    it("应该在进度达到100%时自动完成", async () => {
      await mentorSystem.createMentorship({
        id: "mentorship1",
        mentorId: "agent1",
        menteeId: "agent2",
        trainingPlan: {
          goals: ["Goal 1"],
          skills: ["Skill 1"],
        },
        createdBy: "system",
      });

      const updated = await mentorSystem.updateProgress({
        mentorshipId: "mentorship1",
        completedGoals: ["Goal 1"],
        acquiredSkills: ["Skill 1"],
        updatedBy: "agent1",
      });

      expect(updated.status).toBe("completed");
      expect(updated.progress?.progressRate).toBe(100);
    });

    it("应该生成师父统计信息", async () => {
      await mentorSystem.createMentorship({
        id: "mentorship1",
        mentorId: "agent1",
        menteeId: "agent2",
        trainingPlan: {
          goals: ["Goal 1", "Goal 2"],
          skills: ["Skill 1"],
        },
        createdBy: "system",
      });

      await mentorSystem.updateProgress({
        mentorshipId: "mentorship1",
        completedGoals: ["Goal 1"],
        acquiredSkills: ["Skill 1"],
        updatedBy: "agent1",
      });

      const stats = await mentorSystem.getMentorStats("agent1");

      expect(stats.totalMentees).toBe(1);
      expect(stats.activeMentees).toBe(1);
      expect(stats.totalGoalsSet).toBe(2);
      expect(stats.totalGoalsCompleted).toBe(1);
      expect(stats.totalSkillsTaught).toBe(1);
    });

    it("应该生成培训进度报告", async () => {
      await mentorSystem.createMentorship({
        id: "mentorship1",
        mentorId: "agent1",
        menteeId: "agent2",
        trainingPlan: {
          goals: ["Goal 1", "Goal 2"],
          skills: ["Skill 1", "Skill 2"],
          duration: 90 * 24 * 60 * 60 * 1000,
        },
        createdBy: "system",
      });

      await mentorSystem.updateProgress({
        mentorshipId: "mentorship1",
        completedGoals: ["Goal 1"],
        updatedBy: "agent1",
      });

      const report = await mentorSystem.getProgressReport("mentorship1");

      expect(report.progress.goalsProgress.total).toBe(2);
      expect(report.progress.goalsProgress.completed).toBe(1);
      expect(report.progress.goalsProgress.rate).toBe(50);
      expect(report.progress.skillsProgress.total).toBe(2);
      expect(report.progress.overallProgress).toBe(25);
    });
  });

  describe("完整集成流程", () => {
    it("应该支持从配置初始化整个组织体系", async () => {
      const config: OrganizationConfig = {
        organizations: [
          {
            id: "company1",
            name: "TechCorp",
            level: "company",
          },
          {
            id: "dept1",
            name: "Engineering",
            level: "department",
            parentId: "company1",
            memberIds: ["agent1", "agent2", "agent3"],
          },
        ],
        teams: [
          {
            id: "team1",
            name: "Backend Team",
            organizationId: "dept1",
            leaderId: "agent1",
            memberIds: ["agent2"],
            type: "permanent",
            objectives: ["Build API"],
          },
        ],
        collaborations: [
          {
            id: "collab1",
            fromAgentId: "agent1",
            toAgentId: "agent2",
            type: "supervisor",
            organizationId: "dept1",
          },
        ],
        mentorships: [
          {
            id: "mentor1",
            mentorId: "agent1",
            menteeId: "agent3",
            trainingPlan: {
              goals: ["Learn Backend"],
              skills: ["Node.js"],
            },
          },
        ],
      };

      const result = await initializeFromConfig(config, "system");

      expect(result.organizations.length).toBe(2);
      expect(result.teams.length).toBe(1);
      expect(result.collaborations.length).toBe(1);
      expect(result.mentorships.length).toBe(2); // 1 直接创建 + 1 由协作系统自动创建
    });
  });
});
