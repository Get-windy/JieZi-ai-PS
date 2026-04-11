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
    // 调用 projects.list RPC 获取完整项目数据（包含 sprints/progress/status 等进度字段）
    // 注意：不能用 groups.list，群组数据缺少 PROJECT_CONFIG.json 中的进度字段
    const response = await client.request("projects.list", {});
    // oxlint-disable-next-line typescript/no-explicit-any
    const raw = response as unknown as any;
    const projects = Array.isArray(raw?.projects) ? (raw.projects as unknown[]) : [];

    app.projectsList = {
      projects: projects as ProjectInfo[],
      total: typeof raw?.total === "number" ? raw.total : projects.length,
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

/**
 * 标记单条验收标准状态（满足或不满足）
 *
 * @param criterionId - 验收标准 ID
 * @param satisfied   - true=已满足, false=需验证
 * @param evidence    - 证据描述（可选）
 * @param satisfiedBy - 确认人（可选）
 */
export async function markCriterionSatisfied(
  app: App,
  client: GatewayClient,
  projectId: string,
  criterionId: string,
  satisfied: boolean,
  evidence?: string,
  satisfiedBy?: string,
): Promise<void> {
  app.projectsError = null;
  try {
    await client.request("projects.markCriterionSatisfied", {
      projectId,
      criterionId,
      satisfied,
      evidence,
      satisfiedBy: satisfiedBy ?? "coordinator",
    });
    // 刷新项目列表以获取最新状态
    await loadProjects(app, client);
  } catch (error) {
    console.error("[Projects] Failed to mark criterion:", error);
    app.projectsError = String(error);
    throw error;
  }
}

/**
 * Agent 签收项目（所有验收标准已满足后的最终确认）
 *
 * 在 AI 自主开发系统中，签收由项目负责 Agent（coordinator / ownerId）完成。
 *
 * @param signOffBy - 签收 Agent ID（不传则取项目 ownerId，再备退到 coordinator）
 * @param note      - 签收备注（可选）
 */
export async function humanSignOff(
  app: App,
  client: GatewayClient,
  projectId: string,
  signOffBy: string,
  note?: string,
): Promise<void> {
  app.projectsError = null;
  try {
    await client.request("projects.humanSignOff", {
      projectId,
      signOffBy,
      note,
    });
    await loadProjects(app, client);
  } catch (error) {
    console.error("[Projects] Failed to sign off project:", error);
    app.projectsError = String(error);
    throw error;
  }
}
