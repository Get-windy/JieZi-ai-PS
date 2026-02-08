/**
 * Phase 5 Gateway RPC API - Organization
 * 组织架构管理 API
 *
 * 实现：
 * - organization.getAll - 获取完整的组织架构数据
 */

import type { GatewayServer } from "../server.js";

/**
 * 注册组织架构相关的RPC方法
 */
export function registerOrganizationRpcMethods(server: GatewayServer): void {
  server.registerMethod("organization.getAll", handleGetAllOrganization);
}

/**
 * 获取完整的组织架构数据
 */
async function handleGetAllOrganization(params: {}, context: any): Promise<any> {
  // TODO: 实现组织架构数据获取
  // 1. 权限检查 - 确保操作员有权访问组织架构数据
  // 2. 从组织系统（Phase 4）获取数据
  //    - 使用 src/organization/organization-system.ts
  //    - 使用 src/organization/organization-hierarchy.ts
  //    - 使用 src/organization/team-management.ts
  // 3. 获取智能助手列表和身份信息
  // 4. 获取智能助手之间的关系（汇报、监督、协作、培训）
  // 5. 计算统计数据
  // 6. 过滤当前操作员无权访问的数据

  console.log("[Phase5] Get all organization data");

  // 临时返回空数据结构
  return {
    organizations: [],
    teams: [],
    agents: [],
    relationships: [],
    statistics: {
      totalOrganizations: 0,
      totalTeams: 0,
      totalAgents: 0,
      averageTeamSize: 0,
      permissionDistribution: {},
    },
  };
}

/**
 * 辅助函数：从配置中获取组织数据
 * TODO: 实现完整的组织数据提取逻辑
 */
function extractOrganizationData(config: any): any {
  // 这里应该调用Phase 4的组织系统来获取数据
  // 示例实现：

  // const organizationSystem = new OrganizationSystem(config);
  // const organizations = organizationSystem.getAllOrganizations();
  // const teams = organizationSystem.getAllTeams();
  // const agents = organizationSystem.getAllAgents();
  // const relationships = organizationSystem.getRelationships();

  return {
    organizations: [],
    teams: [],
    agents: [],
    relationships: [],
  };
}

/**
 * 辅助函数：计算统计数据
 */
function calculateStatistics(data: { organizations: any[]; teams: any[]; agents: any[] }): any {
  const totalOrganizations = data.organizations.length;
  const totalTeams = data.teams.length;
  const totalAgents = data.agents.length;

  const averageTeamSize =
    totalTeams > 0
      ? data.teams.reduce((sum, team) => sum + (team.memberIds?.length || 0), 0) / totalTeams
      : 0;

  // 计算权限级别分布
  const permissionDistribution: Record<string, number> = {};
  for (const agent of data.agents) {
    const level = String(agent.permissionLevel || 0);
    permissionDistribution[level] = (permissionDistribution[level] || 0) + 1;
  }

  return {
    totalOrganizations,
    totalTeams,
    totalAgents,
    averageTeamSize,
    permissionDistribution,
  };
}

/**
 * 辅助函数：过滤数据（根据操作员权限）
 */
function filterDataByPermission(data: any, operatorId: string, permissions: any): any {
  // TODO: 实现基于权限的数据过滤
  // 1. 检查操作员的组织访问权限
  // 2. 过滤掉无权访问的组织、团队和智能助手
  // 3. 过滤掉敏感的关系信息

  return data;
}
