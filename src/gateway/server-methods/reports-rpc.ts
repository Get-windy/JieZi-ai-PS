/**
 * Reports RPC 处理器
 *
 * 提供系统报表、数据分析和统计功能
 */

import type { GatewayRequestHandlers } from "./types.js";
import { lifecycleManager } from "../../lifecycle/lifecycle-manager.js";
import { skillManagement } from "../../lifecycle/skill-management.js";
import { trainingSystem } from "../../lifecycle/training-system.js";
import { organizationHierarchy } from "../../organization/organization-hierarchy.js";
import { organizationSystem } from "../../organization/organization-system.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 报表类型
 */
type ReportType =
  | "organization"
  | "lifecycle"
  | "training"
  | "skills"
  | "collaboration"
  | "performance"
  | "comprehensive";

/**
 * 时间范围
 */
interface TimeRange {
  startDate: number;
  endDate: number;
}

/**
 * 组织报表数据
 */
interface OrganizationReport {
  type: "organization";
  generatedAt: number;
  timeRange?: TimeRange;
  summary: {
    totalOrganizations: number;
    totalMembers: number;
    byLevel: Record<string, number>;
    avgMembersPerOrg: number;
  };
  topOrganizations: Array<{
    id: string;
    name: string;
    memberCount: number;
    level: string;
  }>;
}

/**
 * 生命周期报表数据
 */
interface LifecycleReport {
  type: "lifecycle";
  generatedAt: number;
  timeRange?: TimeRange;
  summary: {
    totalAgents: number;
    activeAgents: number;
    suspendedAgents: number;
    byStage: Record<string, number>;
    totalEvents: number;
  };
  stageDistribution: Array<{
    stage: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * 培训报表数据
 */
interface TrainingReport {
  type: "training";
  generatedAt: number;
  timeRange?: TimeRange;
  summary: {
    totalCourses: number;
    totalEnrollments: number;
    completionRate: number;
    avgScore: number;
  };
  topPerformers: Array<{
    agentId: string;
    coursesCompleted: number;
    avgScore: number;
  }>;
  popularCourses: Array<{
    courseId: string;
    courseName: string;
    enrollments: number;
    completionRate: number;
  }>;
}

/**
 * 技能报表数据
 */
interface SkillsReport {
  type: "skills";
  generatedAt: number;
  timeRange?: TimeRange;
  summary: {
    totalSkills: number;
    totalAgentSkills: number;
    certifiedSkills: number;
    byCategory: Record<string, number>;
  };
  skillDistribution: Array<{
    skillId: string;
    skillName: string;
    agentCount: number;
    avgLevel: string;
  }>;
  topExperts: Array<{
    agentId: string;
    skillCount: number;
    expertSkills: number;
  }>;
}

export const reportsHandlers: GatewayRequestHandlers = {
  /**
   * 生成组织报表
   */
  "reports.generate.organization": async ({ params, respond }) => {
    const { startDate, endDate } = params || {};

    try {
      const allOrgs = await organizationSystem.getAllOrganizations();

      const statsByLevel: Record<string, number> = {};
      let totalMembers = 0;

      const orgWithMembers = allOrgs.map((org) => ({
        id: org.id,
        name: org.name,
        memberCount: org.memberIds.length,
        level: org.level,
      }));

      for (const org of allOrgs) {
        statsByLevel[org.level] = (statsByLevel[org.level] || 0) + 1;
        totalMembers += org.memberIds.length;
      }

      // 排序获取前5个组织
      orgWithMembers.sort((a, b) => b.memberCount - a.memberCount);
      const topOrganizations = orgWithMembers.slice(0, 5);

      const report: OrganizationReport = {
        type: "organization",
        generatedAt: Date.now(),
        timeRange:
          startDate && endDate
            ? {
                startDate: Number(startDate),
                endDate: Number(endDate),
              }
            : undefined,
        summary: {
          totalOrganizations: allOrgs.length,
          totalMembers,
          byLevel: statsByLevel,
          avgMembersPerOrg: allOrgs.length > 0 ? totalMembers / allOrgs.length : 0,
        },
        topOrganizations,
      };

      respond(true, { report }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 生成生命周期报表
   */
  "reports.generate.lifecycle": async ({ params, respond }) => {
    const { startDate, endDate } = params || {};

    try {
      const stats = lifecycleManager.getStatistics();

      const stageDistribution = Object.entries(stats.byStage).map(([stage, count]) => ({
        stage,
        count,
        percentage: stats.totalAgents > 0 ? (count / stats.totalAgents) * 100 : 0,
      }));

      const report: LifecycleReport = {
        type: "lifecycle",
        generatedAt: Date.now(),
        timeRange:
          startDate && endDate
            ? {
                startDate: Number(startDate),
                endDate: Number(endDate),
              }
            : undefined,
        summary: stats,
        stageDistribution,
      };

      respond(true, { report }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 生成培训报表
   */
  "reports.generate.training": async ({ params, respond }) => {
    const { startDate, endDate } = params || {};

    try {
      const allCourses = trainingSystem.getAllCourses();
      const allProgresses = trainingSystem.getAllProgresses();

      let totalCompleted = 0;
      let totalScore = 0;
      let scoreCount = 0;

      const agentStats = new Map<
        string,
        { coursesCompleted: number; totalScore: number; scoreCount: number }
      >();

      const courseStats = new Map<
        string,
        { enrollments: number; completions: number; courseName: string }
      >();

      for (const progress of allProgresses) {
        // 初始化课程统计
        if (!courseStats.has(progress.courseId)) {
          const course = allCourses.find((c) => c.id === progress.courseId);
          courseStats.set(progress.courseId, {
            enrollments: 0,
            completions: 0,
            courseName: course?.name || progress.courseId,
          });
        }
        const courseStat = courseStats.get(progress.courseId)!;
        courseStat.enrollments++;

        if (progress.status === "completed") {
          totalCompleted++;
          courseStat.completions++;

          // 统计智能助手
          if (!agentStats.has(progress.agentId)) {
            agentStats.set(progress.agentId, {
              coursesCompleted: 0,
              totalScore: 0,
              scoreCount: 0,
            });
          }
          const agentStat = agentStats.get(progress.agentId)!;
          agentStat.coursesCompleted++;

          if (progress.assessmentScore !== undefined) {
            totalScore += progress.assessmentScore;
            scoreCount++;
            agentStat.totalScore += progress.assessmentScore;
            agentStat.scoreCount++;
          }
        }
      }

      // 生成顶尖表现者列表
      const topPerformers = Array.from(agentStats.entries())
        .map(([agentId, stats]) => ({
          agentId,
          coursesCompleted: stats.coursesCompleted,
          avgScore: stats.scoreCount > 0 ? stats.totalScore / stats.scoreCount : 0,
        }))
        .sort((a, b) => b.coursesCompleted - a.coursesCompleted || b.avgScore - a.avgScore)
        .slice(0, 10);

      // 生成热门课程列表
      const popularCourses = Array.from(courseStats.entries())
        .map(([courseId, stats]) => ({
          courseId,
          courseName: stats.courseName,
          enrollments: stats.enrollments,
          completionRate: stats.enrollments > 0 ? (stats.completions / stats.enrollments) * 100 : 0,
        }))
        .sort((a, b) => b.enrollments - a.enrollments)
        .slice(0, 10);

      const report: TrainingReport = {
        type: "training",
        generatedAt: Date.now(),
        timeRange:
          startDate && endDate
            ? {
                startDate: Number(startDate),
                endDate: Number(endDate),
              }
            : undefined,
        summary: {
          totalCourses: allCourses.length,
          totalEnrollments: allProgresses.length,
          completionRate:
            allProgresses.length > 0 ? (totalCompleted / allProgresses.length) * 100 : 0,
          avgScore: scoreCount > 0 ? totalScore / scoreCount : 0,
        },
        topPerformers,
        popularCourses,
      };

      respond(true, { report }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 生成技能报表
   */
  "reports.generate.skills": async ({ params, respond }) => {
    const { startDate, endDate } = params || {};

    try {
      const globalStats = skillManagement.getGlobalStatistics();
      const allSkills = skillManagement.getAllSkills();

      // 技能分布统计
      const skillUsage = new Map<string, { count: number; levels: string[] }>();

      // 统计每个技能的使用情况
      for (const skill of allSkills) {
        const agentsWithSkill = allSkills.flatMap((s) => {
          // 简化版本：从技能管理系统获取所有智能助手的技能
          const allAgentSkills: any[] = [];
          // 这里简化处理，实际应该有获取技能持有者的方法
          return allAgentSkills.filter((as: any) => as.skillId === skill.id);
        });

        skillUsage.set(skill.id, {
          count: agentsWithSkill.length,
          levels: agentsWithSkill.map((as: any) => as.currentLevel),
        });
      }

      const skillDistribution = Array.from(skillUsage.entries())
        .map(([skillId, usage]) => {
          const skill = allSkills.find((s) => s.id === skillId);
          const avgLevelIndex =
            usage.levels.reduce((sum, level) => {
              const levels = ["novice", "beginner", "intermediate", "advanced", "expert", "master"];
              return sum + levels.indexOf(level);
            }, 0) / usage.levels.length;
          const levels = ["novice", "beginner", "intermediate", "advanced", "expert", "master"];
          return {
            skillId,
            skillName: skill?.name || skillId,
            agentCount: usage.count,
            avgLevel: levels[Math.round(avgLevelIndex)] || "beginner",
          };
        })
        .sort((a, b) => b.agentCount - a.agentCount)
        .slice(0, 15);

      // 顶尖专家（拥有最多技能的智能助手）
      const agentSkillCounts = new Map<string, { total: number; expert: number }>();

      // 简化版本：遍历所有技能统计
      for (const skill of allSkills) {
        // 这里简化处理，实际应该从技能管理系统获取
        const agentSkills: any[] = [];

        for (const agentSkill of agentSkills) {
          if (!agentSkillCounts.has(agentSkill.agentId)) {
            agentSkillCounts.set(agentSkill.agentId, { total: 0, expert: 0 });
          }
          const counts = agentSkillCounts.get(agentSkill.agentId)!;
          counts.total++;
          if (agentSkill.currentLevel === "expert" || agentSkill.currentLevel === "master") {
            counts.expert++;
          }
        }
      }

      const topExperts = Array.from(agentSkillCounts.entries())
        .map(([agentId, counts]) => ({
          agentId,
          skillCount: counts.total,
          expertSkills: counts.expert,
        }))
        .sort((a, b) => b.expertSkills - a.expertSkills || b.skillCount - a.skillCount)
        .slice(0, 10);

      const report: SkillsReport = {
        type: "skills",
        generatedAt: Date.now(),
        timeRange:
          startDate && endDate
            ? {
                startDate: Number(startDate),
                endDate: Number(endDate),
              }
            : undefined,
        summary: {
          totalSkills: globalStats.totalSkillDefinitions,
          totalAgentSkills: globalStats.totalSkillInstances,
          certifiedSkills: 0, // 简化处理
          byCategory: globalStats.skillsByCategory as any,
        },
        skillDistribution,
        topExperts,
      };

      respond(true, { report }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 生成综合报表
   */
  "reports.generate.comprehensive": async ({ params, respond }) => {
    const { startDate, endDate } = params || {};

    try {
      // 组织统计
      const allOrgs = await organizationSystem.getAllOrganizations();
      const orgStats = {
        total: allOrgs.length,
        totalMembers: allOrgs.reduce((sum, org) => sum + org.memberIds.length, 0),
      };

      // 生命周期统计
      const lifecycleStats = lifecycleManager.getStatistics();

      // 培训统计
      const allCourses = trainingSystem.getAllCourses();
      const allProgresses = trainingSystem.getAllProgresses();
      const completedProgresses = allProgresses.filter((p) => p.status === "completed");
      const trainingStats = {
        totalCourses: allCourses.length,
        totalEnrollments: allProgresses.length,
        completionRate:
          allProgresses.length > 0 ? (completedProgresses.length / allProgresses.length) * 100 : 0,
      };

      // 技能统计
      const skillStats = skillManagement.getGlobalStatistics();

      const comprehensiveReport = {
        type: "comprehensive" as const,
        generatedAt: Date.now(),
        timeRange:
          startDate && endDate
            ? {
                startDate: Number(startDate),
                endDate: Number(endDate),
              }
            : undefined,
        organization: orgStats,
        lifecycle: lifecycleStats,
        training: trainingStats,
        skills: skillStats,
        summary: {
          healthScore: calculateHealthScore(lifecycleStats, trainingStats, skillStats),
          recommendations: generateRecommendations(lifecycleStats, trainingStats, skillStats),
        },
      };

      respond(true, { report: comprehensiveReport }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 导出报表
   */
  "reports.export": async ({ params, respond }) => {
    const { reportType, format, startDate, endDate } = params || {};

    if (!reportType || typeof reportType !== "string") {
      respond(false, null, errorShape(ErrorCodes.INVALID_REQUEST, "Missing reportType"));
      return;
    }

    try {
      // 根据类型生成对应报表（这里简化处理）
      const exportFormat = typeof format === "string" ? format : "json";
      const timestamp = Date.now();

      const exportData = {
        reportType,
        format: exportFormat,
        generatedAt: timestamp,
        timeRange:
          startDate && endDate
            ? {
                startDate: Number(startDate),
                endDate: Number(endDate),
              }
            : undefined,
        downloadUrl: `/api/reports/download/${reportType}-${timestamp}.${exportFormat}`,
      };

      respond(true, { export: exportData }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取报表模板列表
   */
  "reports.templates": async ({ respond }) => {
    try {
      const templates = [
        {
          id: "org-summary",
          name: "组织概览报表",
          type: "organization",
          description: "展示组织结构、成员分布等信息",
        },
        {
          id: "lifecycle-dashboard",
          name: "生命周期仪表盘",
          type: "lifecycle",
          description: "智能助手生命周期各阶段分布和统计",
        },
        {
          id: "training-progress",
          name: "培训进度报表",
          type: "training",
          description: "培训课程完成情况和学员表现",
        },
        {
          id: "skills-matrix",
          name: "技能矩阵报表",
          type: "skills",
          description: "团队技能分布和专家识别",
        },
        {
          id: "comprehensive",
          name: "综合分析报表",
          type: "comprehensive",
          description: "系统全面运营状况分析",
        },
      ];

      respond(true, { templates, total: templates.length }, undefined);
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * 获取报表历史
   */
  "reports.history": async ({ params, respond }) => {
    const { reportType, limit } = params || {};

    try {
      // 这里简化处理，实际应该从数据库读取
      const history: Array<{
        id: string;
        type: string;
        generatedAt: number;
        status: string;
      }> = [];

      respond(
        true,
        {
          history,
          total: history.length,
        },
        undefined,
      );
    } catch (err) {
      respond(false, null, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};

/**
 * 计算系统健康分数（0-100）
 */
function calculateHealthScore(lifecycleStats: any, trainingStats: any, skillStats: any): number {
  let score = 100;

  // 生命周期健康度（30分）
  const activeRate =
    lifecycleStats.totalAgents > 0 ? lifecycleStats.activeAgents / lifecycleStats.totalAgents : 0;
  score -= (1 - activeRate) * 30;

  // 培训完成率（35分）
  score -= (1 - trainingStats.completionRate / 100) * 35;

  // 技能认证率（35分）
  const certificationRate =
    skillStats.totalAgentSkills > 0 ? skillStats.certifiedSkills / skillStats.totalAgentSkills : 0;
  score -= (1 - certificationRate) * 35;

  return Math.max(0, Math.round(score));
}

/**
 * 生成改进建议
 */
function generateRecommendations(
  lifecycleStats: any,
  trainingStats: any,
  skillStats: any,
): string[] {
  const recommendations: string[] = [];

  // 生命周期建议
  const activeRate =
    lifecycleStats.totalAgents > 0 ? lifecycleStats.activeAgents / lifecycleStats.totalAgents : 0;
  if (activeRate < 0.7) {
    recommendations.push("激活率较低，建议加强智能助手入职培训和激活流程");
  }

  // 培训建议
  if (trainingStats.completionRate < 70) {
    recommendations.push("培训完成率偏低，建议优化课程内容或调整培训策略");
  }

  // 技能建议
  const certificationRate =
    skillStats.totalAgentSkills > 0 ? skillStats.certifiedSkills / skillStats.totalAgentSkills : 0;
  if (certificationRate < 0.5) {
    recommendations.push("技能认证率较低，建议推动技能评估和认证工作");
  }

  if (recommendations.length === 0) {
    recommendations.push("系统运行状况良好，继续保持！");
  }

  return recommendations;
}
