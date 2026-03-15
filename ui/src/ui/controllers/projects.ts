/**
 * Projects Controller
 * 
 * 项目管理相关控制器：
 * - 加载项目列表
 * - 创建项目
 * - 更新项目配置
 * - 升级群组为项目群
 * - 获取项目详情
 * - 更新项目工作空间
 */

import type { App } from "../app.js";
import type { GatewayClient } from "../gateway.js";
import type { ProjectInfo } from "../views/groups.js";

/**
 * 加载项目列表
 */
export async function loadProjects(app: App, client: GatewayClient): Promise<void> {
  app.projectsLoading = true;
  app.projectsError = null;

  try {
    // 调用 groups.list RPC 获取所有群组 (包括项目群)
    const response = await client.request("groups.list", {});
    // oxlint-disable-next-line typescript/no-explicit-any
    const groups = Array.isArray((response as unknown as any)?.groups) ? (response as unknown as any).groups as unknown[] : [];
    
    // 过滤出项目群
    const projectGroups = groups.filter((g) => (g as Record<string, unknown>).projectId);
    
    // 转换为项目列表格式
    const projects = projectGroups.map((g) => { const gr = g as Record<string, unknown>; return {
      projectId: gr.projectId,
      name: gr.name,
      description: gr.description,
      workspacePath: gr.workspacePath,
      // 优先从 metadata.codeDir 读取
      codeDir: (gr.metadata as Record<string, unknown> | undefined)?.codeDir ?? undefined,
      ownerId: gr.ownerId,
      createdAt: gr.createdAt,
    }; });
    
    // 去重 (多个群可能绑定同一个项目)
    const uniqueProjects = Array.from(
      new Map(projects.map((p) => [(p as Record<string, unknown>).projectId, p])).values()
    );
    
    app.projectsList = {
      projects: uniqueProjects,
      total: uniqueProjects.length,
    };
  } catch (error) {
    console.error("[Projects] Failed to load projects:", error);
    app.projectsError = String(error);
  } finally {
    app.projectsLoading = false;
  }
}

/**
 * 创建项目 (包括项目群)
 */
export async function createProject(
  app: App,
  client: GatewayClient,
  projectData: {
    projectId: string;
    name: string;
    description?: string;
    workspaceRoot?: string;
    codeDir?: string;
    createGroup?: boolean;
  },
): Promise<void> {
  app.creatingProject = true;
  app.projectsError = null;

  try {
    // 调用 projects.create RPC
    await client.request("projects.create", {
      projectId: projectData.projectId,
      name: projectData.name,
      description: projectData.description,
      workspaceRoot: projectData.workspaceRoot,
      codeDir: projectData.codeDir,
      createGroup: projectData.createGroup !== false, // 默认创建项目群
    });
    
    console.log("[Projects] Project created:", projectData);
    
    // 刷新项目列表
    await loadProjects(app, client);
  } catch (error) {
    console.error("[Projects] Failed to create project:", error);
    app.projectsError = String(error);
    throw error;
  } finally {
    app.creatingProject = false;
  }
}

/**
 * 升级群组为项目群
 */
export async function upgradeGroupToProject(
  app: App,
  client: GatewayClient,
  groupId: string,
  projectId: string,
): Promise<void> {
  app.upgradingGroupToProject = true;
  app.projectsError = null;

  try {
    // 调用 groups.upgradeToProject RPC
    const response = await client.request("groups.upgradeToProject", {
      groupId,
      projectId,
    });
    
    console.log("[Projects] Group upgraded to project:", response);
    
    // 刷新项目列表和群组列表
    await loadProjects(app, client);
    
    // 也需要刷新群组列表 (可以导入 groups controller)
    const { loadGroups } = await import("./groups.js");
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Projects] Failed to upgrade group to project:", error);
    app.projectsError = String(error);
    throw error;
  } finally {
    app.upgradingGroupToProject = false;
  }
}

/**
 * 获取项目详情
 */
export async function getProject(
  app: App,
  client: GatewayClient,
  projectId: string,
): Promise<ProjectInfo | null> {
  app.projectsError = null;

  try {
    const response = await client.request("projects.get", {
      projectId,
    });
    
    console.log("[Projects] Project details loaded:", response);
    return response as unknown as ProjectInfo;
  } catch (error) {
    console.error("[Projects] Failed to get project details:", error);
    app.projectsError = String(error);
    throw error;
  }
}

/**
 * 更新项目工作空间 (同步到所有项目群)
 */
export async function updateProjectWorkspace(
  app: App,
  client: GatewayClient,
  projectId: string,
  newWorkspacePath: string,
): Promise<void> {
  app.projectsLoading = true;
  app.projectsError = null;

  try {
    const response = await client.request("projects.updateWorkspace", {
      projectId,
      workspacePath: newWorkspacePath,
    });
    
    console.log("[Projects] Project workspace updated:", response);
    
    // 刷新项目列表和群组列表
    await loadProjects(app, client);
    const { loadGroups } = await import("./groups.js");
    await loadGroups(app, client);
  } catch (error) {
    console.error("[Projects] Failed to update project workspace:", error);
    app.projectsError = String(error);
    throw error;
  } finally {
    app.projectsLoading = false;
  }
}
