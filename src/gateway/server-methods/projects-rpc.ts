// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Projects RPC Methods
 *
 * 项目管理相关的 RPC 方法：
 * - projects.create: 创建项目
 * - projects.updateWorkspace: 更新项目工作空间 (同步到项目群)
 * - project.owner.transfer: 更换项目负责人
 */

import { groupManager } from "../../sessions/group-manager.js";
import { errorShape, ErrorCodes } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const projectsHandlers: GatewayRequestHandlers = {
  /**
   * 创建项目
   */
  "projects.create": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const name = params?.name ? String(params.name) : "";
      const description = params?.description ? String(params.description) : undefined;
      const codeDir = params?.codeDir ? String(params.codeDir) : undefined;
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ownerId = params?.ownerId ? String(params.ownerId) : undefined;

      if (!projectId || !name) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and name are required"),
        );
        return;
      }

      // 计算工作空间路径
      const actualWorkspaceRoot =
        workspaceRoot || process.env.OPENCLAW_GROUPS_ROOT || "H:\\OpenClaw_Workspace\\groups";
      const workspacePath = `${actualWorkspaceRoot}\\${projectId}`;

      // 这里主要是返回配置信息，实际的目录创建由 Agent 完成
      respond(
        true,
        {
          projectId,
          name,
          description,
          workspacePath,
          codeDir: codeDir || `I:\\${name}`,
          ownerId,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create project: ${String(error)}`),
      );
    }
  },

  /**
   * 更新项目工作空间路径
   *
   * 当项目工作空间发生变化时，同步更新所有绑定的项目群的工作空间
   */
  "projects.updateWorkspace": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const newWorkspacePath = params?.workspacePath ? String(params.workspacePath) : "";

      if (!projectId || !newWorkspacePath) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and workspacePath are required"),
        );
        return;
      }

      // 查找所有绑定到该项目的群组
      const allGroups = groupManager.getAllGroups();
      const projectGroups = allGroups.filter((g) => g.projectId === projectId);

      if (projectGroups.length === 0) {
        // 没有关联的项目群，只记录日志
        console.log(
          `[Project Workspace Update] Project ${projectId} workspace updated to ${newWorkspacePath}, but no project groups found.`,
        );
        respond(
          true,
          {
            success: true,
            projectId,
            workspacePath: newWorkspacePath,
            syncedGroups: 0,
            message: "项目工作空间已更新，但没有关联的项目群",
          },
          undefined,
        );
        return;
      }

      // 同步更新所有项目群的工作空间
      const groupWorkspaceManager = await import("../../workspace/group-workspace.js").then((m) =>
        m.GroupWorkspaceManager.getInstance(),
      );

      const syncedGroups: Array<{ groupId: string; name: string }> = [];

      for (const group of projectGroups) {
        try {
          // 更新群组信息
          await groupManager.updateGroup(group.id, {
            workspacePath: newWorkspacePath,
          });

          // 更新群组工作空间映射
          groupWorkspaceManager.updateGroupWorkspaceDir(group.id, newWorkspacePath);

          syncedGroups.push({
            groupId: group.id,
            name: group.name,
          });

          console.log(
            `[Project Workspace Sync] Group ${group.id} (${group.name}) workspace synced to ${newWorkspacePath}`,
          );
        } catch (groupError) {
          console.error(`[Project Workspace Sync] Failed to sync group ${group.id}:`, groupError);
        }
      }

      // 发送系统消息通知所有项目群
      for (const group of projectGroups) {
        await groupManager.sendSystemMessage(
          group.id,
          `📢 项目工作空间已更新

项目：${projectId}
新工作空间：${newWorkspacePath}

💡 项目群工作空间已自动同步。`,
        );
      }

      respond(
        true,
        {
          success: true,
          projectId,
          workspacePath: newWorkspacePath,
          syncedGroups: syncedGroups.length,
          groups: syncedGroups,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update project workspace: ${String(error)}`),
      );
    }
  },

  /**
   * 更换项目负责人
   *
   * 项目的负责人存储在项目群的 ownerId 上，更换负责人实质是转让群主
   */
  "project.owner.transfer": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const newOwnerId = params?.newOwnerId ? String(params.newOwnerId) : "";

      if (!projectId || !newOwnerId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and newOwnerId are required"),
        );
        return;
      }

      // 查找项目绑定的群组
      const allGroups = groupManager.getAllGroups();
      const projectGroups = allGroups.filter((g) => g.projectId === projectId);

      if (projectGroups.length === 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `No groups bound to project "${projectId}". Please bind a group first.`,
          ),
        );
        return;
      }

      // 更换所有项目群的群主（主群组和子群组）
      const results: Array<{ groupId: string; name: string; success: boolean; error?: string }> =
        [];
      for (const group of projectGroups) {
        try {
          // 新负责人必须是该群组成员，如果不是则先添加
          const isMember = group.members.some((m) => m.agentId === newOwnerId);
          if (!isMember) {
            await groupManager.addMember(group.id, newOwnerId, "admin");
          }
          await groupManager.transferOwner(group.id, newOwnerId);
          results.push({ groupId: group.id, name: group.name, success: true });
        } catch (groupErr) {
          results.push({
            groupId: group.id,
            name: group.name,
            success: false,
            error: String(groupErr),
          });
        }
      }

      const allSucceeded = results.every((r) => r.success);
      respond(true, { success: allSucceeded, projectId, newOwnerId, groups: results }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to transfer project owner: ${String(error)}`),
      );
    }
  },

  /**
   * 获取项目信息及其关联的群组
   */
  "projects.get": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";

      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      // 验证项目是否存在
      const projectWorkspaceExists = await import("../../utils/project-context.js").then(
        (m) => m.projectWorkspaceExists,
      );

      if (!projectWorkspaceExists(projectId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, `Project "${projectId}" not found`),
        );
        return;
      }

      // 获取项目上下文
      const buildProjectContext = await import("../../utils/project-context.js").then(
        (m) => m.buildProjectContext,
      );
      const projectCtx = buildProjectContext(projectId);

      // 查找所有绑定到该项目的群组
      const allGroups = groupManager.getAllGroups();
      const projectGroups = allGroups.filter((g) => g.projectId === projectId);

      respond(
        true,
        {
          projectId,
          name: projectCtx.name || projectId,
          workspacePath: projectCtx.workspacePath,
          codeDir: projectCtx.codeDir,
          docsDir: projectCtx.docsDir,
          requirementsDir: projectCtx.requirementsDir,
          qaDir: projectCtx.qaDir,
          testsDir: projectCtx.testsDir,
          groups: projectGroups.map((g) => ({
            groupId: g.id,
            name: g.name,
            description: g.description,
            ownerId: g.ownerId,
            createdAt: g.createdAt,
            memberCount: g.members?.length || 0,
          })),
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get project: ${String(error)}`),
      );
    }
  },
};
