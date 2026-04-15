// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Projects RPC Methods
 *
 * 项目管理相关的 RPC 方法：
 * - projects.create: 创建项目
 * - projects.list: 列出所有项目（通过扫描工作空间目录）
 * - projects.updateWorkspace: 更新项目工作空间 (同步到项目群)
 * - project.owner.transfer: 更换项目负责人
 */

import { errorShape, ErrorCodes } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { groupManager } from "../../sessions/group-manager.js";
import { getGroupsWorkspaceRoot } from "../../utils/project-context.js";

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
      const path = await import("path");
      const { getGroupsWorkspaceRoot } = await import("../../utils/project-context.js");
      const actualWorkspaceRoot = getGroupsWorkspaceRoot(workspaceRoot);
      const workspacePath = path.join(actualWorkspaceRoot, projectId);

      // codeDir 默认为工作空间内的 src 子目录，而非硬编码到 I:\
      const defaultCodeDir = path.join(workspacePath, "src");

      // ── DoD 门禁：解析调用方传入的验收标准 ──
      // completionGate 参数格式：{ criteria: [{description, verificationType}...], requireHumanSignOff?: boolean }
      // 如果未传入 completionGate，发出警告但不阻止创建（允许后续补充）
      let completionGate:
        | import("../../utils/project-context.js").ProjectCompletionGate
        | undefined;
      const rawGate = params?.completionGate;
      if (
        rawGate &&
        typeof rawGate === "object" &&
        Array.isArray((rawGate as Record<string, unknown>).criteria)
      ) {
        const rawCriteria = (rawGate as Record<string, unknown>).criteria as Array<
          Record<string, unknown>
        >;
        const requireHumanSignOff =
          (rawGate as Record<string, unknown>).requireHumanSignOff !== false; // 默认 true
        completionGate = {
          criteria: rawCriteria.map((c, idx) => ({
            id: `ac_${Date.now()}_${idx}`,
            description: String(c.description ?? ""),
            verificationType: (["manual", "automated", "evidence"].includes(
              String(c.verificationType),
            )
              ? c.verificationType
              : "manual") as "manual" | "automated" | "evidence",
            satisfied: false,
          })),
          requireHumanSignOff,
          scopeFrozen: false,
        };
      }

      const dodWarning = completionGate
        ? undefined
        : "⚠️ [DoD缺失] 项目未定义验收标准（completionGate）。强烈建议在创建项目时通过 completionGate 参数定义完成标准，否则主控无法判断项目何时完成，将导致无尽开发。可在创建后调用 projects.updateProgress 补充。";

      // 这里主要是返回配置信息，实际的目录创建由 Agent 完成
      respond(
        true,
        {
          projectId,
          name,
          description,
          workspacePath,
          codeDir: codeDir || defaultCodeDir,
          ownerId,
          completionGate,
          dodWarning,
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
   * 列出所有项目
   *
   * 通过扫描工作空间目录列出所有项目，
   * 并将内存中已绑定的群组信息合并进来。
   */
  "projects.list": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;

      const { listAvailableProjects, buildProjectContext, getGroupsWorkspaceRoot } =
        await import("../../utils/project-context.js");

      const fsDirs = listAvailableProjects(workspaceRoot);
      const allGroups = groupManager.getAllGroups();

      // 构建所有已知 projectId 的合并集合：
      // 1. 文件系统目录名（原始大小写保留）
      // 2. 群组中存储的 projectId（可能大小写不同）
      // 用 Map<小写key, 原始projectId> 做去重合并，优先保留文件系统目录名
      const projectIdMap = new Map<string, string>();

      for (const dir of fsDirs) {
        projectIdMap.set(dir.toLowerCase(), dir);
      }

      // 过滤掉没有 projectId 的群组
      for (const g of allGroups) {
        if (g.projectId) {
          const key = g.projectId.toLowerCase();
          if (!projectIdMap.has(key)) {
            // 群组有 projectId 但没有对应文件系统目录，仍然纳入列表
            projectIdMap.set(key, g.projectId);
          }
        }
      }

      const projects = Array.from(projectIdMap.values()).map((projectId) => {
        const projectCtx = buildProjectContext(projectId, workspaceRoot);

        // 大小写不敏感匹配群组：群组的 projectId 与当前目录名等价
        const projectIdLower = projectId.toLowerCase();
        const projectGroups = allGroups.filter(
          (g) => g.projectId && g.projectId.toLowerCase() === projectIdLower,
        );

        // 项目负责人：取第一个绑定群的 ownerId
        const ownerId = projectGroups[0]?.ownerId || undefined;

        return {
          projectId,
          // 项目名称：优先读 PROJECT_CONFIG.json 中的 name 字段，如果没有则用 projectId
          name: projectCtx.config?.name || projectId,
          description: projectCtx.config?.description,
          workspacePath: projectCtx.workspacePath,
          codeDir: projectCtx.codeDir,
          docsDir: projectCtx.docsDir,
          requirementsDir: projectCtx.config?.requirementsDir,
          ownerId,
          createdAt: projectCtx.config?.createdAt,
          // ===== 进度管理字段 =====
          status: projectCtx.config?.status,
          // 进度优先由 sprints 自动计算
          progress: (() => {
            const sprints = projectCtx.config?.sprints ?? projectCtx.config?.milestones;
            if (sprints && sprints.length > 0) {
              const allTasks = sprints
                .flatMap((s: import("../../utils/project-context.js").ProjectSprint) => s.tasks)
                .filter(
                  (t: import("../../utils/project-context.js").ProjectTask) =>
                    t.status !== "cancelled",
                );
              if (allTasks.length > 0) {
                const total = allTasks.reduce(
                  (sum: number, t: import("../../utils/project-context.js").ProjectTask) =>
                    sum + (t.storyPoints ?? 1),
                  0,
                );
                const done = allTasks
                  .filter(
                    (t: import("../../utils/project-context.js").ProjectTask) =>
                      t.status === "done",
                  )
                  .reduce(
                    (sum: number, t: import("../../utils/project-context.js").ProjectTask) =>
                      sum + (t.storyPoints ?? 1),
                    0,
                  );
                return total === 0 ? 0 : Math.round((done / total) * 100);
              }
            }
            return projectCtx.config?.progress;
          })(),
          deadline: projectCtx.config?.deadline,
          sprints: projectCtx.config?.sprints,
          milestones: projectCtx.config?.milestones,
          backlog: projectCtx.config?.backlog,
          acceptanceCriteria: projectCtx.config?.acceptanceCriteria,
          progressNotes: projectCtx.config?.progressNotes,
          progressUpdatedAt: projectCtx.config?.progressUpdatedAt,

          groups: projectGroups.map((g) => ({
            groupId: g.id,
            name: g.name,
            description: g.description,
            ownerId: g.ownerId,
            createdAt: g.createdAt,
            memberCount: g.members?.length || 0,
          })),
        };
      });

      respond(true, { projects, total: projects.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list projects: ${String(error)}`),
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
   * 更新项目进度
   *
   * 将进度、状态、截止时间等写入 PROJECT_CONFIG.json
   */
  "projects.updateProgress": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext, readProjectConfig } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      // 读取现有配置，若不存在则新建基础结构
      const existing = readProjectConfig(ctx.workspacePath) ?? {
        projectId,
        workspacePath: ctx.workspacePath,
      };

      // 合并进度字段
      if (params?.progress !== undefined) {
        existing.progress = Number(params.progress);
      }
      if (params?.status !== undefined) {
        existing.status = String(
          params.status,
        ) as import("../../utils/project-context.js").ProjectStatus;
      }
      if (params?.deadline !== undefined) {
        existing.deadline = params.deadline ? Number(params.deadline) : undefined;
      }
      if (params?.acceptanceCriteria !== undefined) {
        existing.acceptanceCriteria = String(params.acceptanceCriteria);
      }
      // 更新完成门禁（completionGate）字段
      if (params?.completionGate !== undefined) {
        existing.completionGate =
          params.completionGate as import("../../utils/project-context.js").ProjectCompletionGate;
      }
      if (params?.progressNotes !== undefined) {
        existing.progressNotes = String(params.progressNotes);
      }
      // 新增：sprint 列表（直接覆盖）
      if (params?.sprints !== undefined) {
        existing.sprints =
          params.sprints as import("../../utils/project-context.js").ProjectSprint[];
        // 自动重算 progress
        const { calcProjectProgress } = await import("../../utils/project-context.js");
        existing.progress = calcProjectProgress(existing.sprints);
      }
      if (params?.backlog !== undefined) {
        existing.backlog = params.backlog as import("../../utils/project-context.js").ProjectTask[];
      }
      // 向后兼容： milestones 字段
      if (params?.milestones !== undefined) {
        existing.milestones =
          params.milestones as import("../../utils/project-context.js").ProjectSprint[];
      }
      existing.progressUpdatedAt = Date.now();

      // ── DoD 完成门禁处理 ──
      // 设计原则（AI 自主开发系统）：
      // 1. 任务全部 done ≠ 项目完成。项目任务是滚动迭代安排的，完成一批后继续安排下一批。
      // 2. Agent 可以自主将项目设为 completed（基于 DoD 判断），也可以自主回退（发现误判时）。
      // 3. 人工可通过前端管理页面将状态回退为 development/active，系统自动解除 scopeFrozen。
      // 4. completed/cancelled 状态自动触发 scopeFrozen，防止范围蔓延；回退状态自动解冻。
      const newStatus = existing.status;
      const prevStatus = existing.status;

      // 状态回退检测：从 completed/cancelled 回退到活跃状态 → 自动解除 scopeFrozen
      const activeStatuses = ["requirements", "design", "planning", "development", "testing", "review", "active", "dev_done", "operating", "maintenance", "paused"];
      const isReactivating = params?.status !== undefined &&
        activeStatuses.includes(String(params.status)) &&
        (prevStatus === "completed" || prevStatus === "cancelled" || existing.completionGate?.scopeFrozen === true);
      if (isReactivating && existing.completionGate?.scopeFrozen) {
        existing.completionGate.scopeFrozen = false;
        delete existing.completionGate.scopeFrozenAt;
        delete existing.completionGate.scopeFrozenReason;
      }

      // completed / cancelled 状态 → 自动冻结范围
      if (newStatus === "completed" || newStatus === "cancelled") {
        if (!existing.completionGate) {
          existing.completionGate = { criteria: [], requireHumanSignOff: false, scopeFrozen: false };
        }
        if (!existing.completionGate.scopeFrozen) {
          existing.completionGate.scopeFrozen = true;
          existing.completionGate.scopeFrozenAt = Date.now();
          existing.completionGate.scopeFrozenReason = newStatus === "completed" ? "completed" : "cancelled";
        }
      }

      // 返回当前 DoD 门禁检查结果，供 coordinator 参考
      let completionGateStatus: Record<string, unknown> | undefined;
      if (existing.completionGate) {
        const { checkCompletionGate } = await import("../../utils/project-context.js");
        const gateResult = checkCompletionGate(existing.completionGate);
        completionGateStatus = {
          progress: gateResult.progress,
          canClose: gateResult.canClose,
          gaps: gateResult.gaps,
          scopeFrozen: existing.completionGate.scopeFrozen,
          // 引导 coordinator 下一步操作
          hint: existing.completionGate.scopeFrozen
            ? "🔒 范围已冻结。如发现误判，可调用 projects.updateProgress 将 status 回退为 development/active 自动解冻"
            : gateResult.canClose
              ? "✅ 所有验收标准已满足，可设为 completed"
              : gateResult.progress.total === 0
                ? "⚠️ 尚未定义验收标准，请通过 completionGate.criteria 补充 DoD"
                : `🛠️ 还有 ${gateResult.unsatisfied.length} 项验收标准未满足，请继续安排任务推进`,
        };
        if (isReactivating) {
          completionGateStatus.reactivated = true;
          completionGateStatus.reactivatedHint = "✅ 项目已重新激活，范围冻结已解除，可继续创建新任务";
        }
      }

      // 确保目录存在
      if (!fs.existsSync(ctx.workspacePath)) {
        fs.mkdirSync(ctx.workspacePath, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(
        true,
        { success: true, projectId, config: existing, completionGateStatus },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update progress: ${String(error)}`),
      );
    }
  },

  /**
   * 保存项目基础信息（名称、描述、目录等）
   */
  "projects.save": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext, readProjectConfig } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath) ?? {
        projectId,
        workspacePath: ctx.workspacePath,
      };

      if (params?.name !== undefined) {
        existing.name = String(params.name);
      }
      if (params?.description !== undefined) {
        existing.description = String(params.description);
      }
      if (params?.codeDir !== undefined) {
        existing.codeDir = String(params.codeDir);
      }
      if (params?.docsDir !== undefined) {
        existing.docsDir = String(params.docsDir);
      }
      if (params?.requirementsDir !== undefined) {
        existing.requirementsDir = String(params.requirementsDir);
      }

      if (!fs.existsSync(ctx.workspacePath)) {
        fs.mkdirSync(ctx.workspacePath, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(true, { success: true, projectId }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to save project: ${String(error)}`),
      );
    }
  },

  /**
   * 更换项目负责人
   *
   * 项目的负责人存储在项目群的 ownerId 上，更换负责人实质是转让群主。
   * 注意：一个项目可能绑定多个群（主群和子群），此操作将同时更换所有绑定群的群主。
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
   * Sprint 回顾报告
   *
   * 基于 Sprint 数据自动生成结构化 Retrospective 报告：
   * - 速度差距分析（实际 vs 预期）
   * - 逾期/被 block/验收失败任务统计
   * - 写入 sprint.retrospective 字段
   * - 提供「下次 Planning」注入建议
   *
   * 对标业界实践：Scrum Retrospective（4L: Liked/Learned/Lacked/Longed For）
   */
  "projects.sprintRetrospective": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const sprintId = params?.sprintId ? String(params.sprintId) : "";

      if (!projectId || !sprintId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and sprintId are required"),
        );
        return;
      }

      const { buildProjectContext, readProjectConfig } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`),
        );
        return;
      }

      const sprints = existing.sprints ?? existing.milestones ?? [];
      const sprint = sprints.find(
        (s: import("../../utils/project-context.js").ProjectSprint) => s.id === sprintId,
      );
      if (!sprint) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Sprint "${sprintId}" not found`),
        );
        return;
      }

      const tasks = sprint.tasks ?? [];
      const now = Date.now();

      // ── 统计各类任务 ──
      const doneTasks = tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) => t.status === "done",
      );
      const cancelledTasks = tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) => t.status === "cancelled",
      );
      const unfinishedTasks = tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) =>
          t.status !== "done" && t.status !== "cancelled",
      );
      const blockedTasks = tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) =>
          t.isBlocked === true ||
          (t as Record<string, unknown>).blockedReason != null,
      );

      // ── 验收标准未全满足的任务 ──
      const failedAcceptanceTasks = tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) => {
          const criteria = (t as Record<string, unknown>).acceptanceCriteria;
          if (!Array.isArray(criteria) || criteria.length === 0) {return false;}
          return criteria.some(
            (c: Record<string, unknown>) => !c.satisfied,
          );
        },
      );

      // ── 逾期任务（有 dueDate 且未在 dueDate 前完成，或仍未完成） ──
      const overdueTasks = tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) => {
          if (!t.dueDate) {return false;}
          if (t.status === "cancelled") {return false;}
          const completedAt = (t as Record<string, unknown>).completedAt as number | undefined;
          if (t.status === "done" && completedAt != null) {
            return completedAt > t.dueDate; // 完成了但晚于截止日
          }
          return Date.now() > t.dueDate; // 还未完成且已过截止日
        },
      );

      // ── Velocity 分析 ──
      const plannedPoints = tasks
        .filter(
          (t: import("../../utils/project-context.js").ProjectTask) => t.status !== "cancelled",
        )
        .reduce(
          (sum: number, t: import("../../utils/project-context.js").ProjectTask) =>
            sum + (t.storyPoints ?? 1),
          0,
        );
      const actualVelocity = sprint.velocity ?? doneTasks.reduce(
        (sum: number, t: import("../../utils/project-context.js").ProjectTask) =>
          sum + (t.storyPoints ?? 1),
        0,
      );
      const velocityGap = plannedPoints - actualVelocity;
      const completionRate = plannedPoints === 0
        ? 100
        : Math.round((actualVelocity / plannedPoints) * 100);

      // ── Sprint 持续时间 ──
      const sprintDays = sprint.startDate && sprint.completedAt
        ? Math.round((sprint.completedAt - sprint.startDate) / 86_400_000)
        : sprint.startDate && sprint.endDate
          ? Math.round((sprint.endDate - sprint.startDate) / 86_400_000)
          : null;

      // ── 生成回顾报告文本（4L 框架） ──
      const lines: string[] = [
        `## Sprint Retrospective — ${sprint.title}`,
        `**日期**: ${new Date(now).toLocaleDateString("zh-CN")}`,
        `**持续时间**: ${sprintDays != null ? sprintDays + " 天" : "未知"}`,
        "",
        "### 📊 交付数据",
        `- 完成任务: ${doneTasks.length}/${tasks.length - cancelledTasks.length}（取消: ${cancelledTasks.length}）`,
        `- 速度: ${actualVelocity} SP / 计划 ${plannedPoints} SP（完成率 ${completionRate}%）`,
        velocityGap > 0
          ? `- ⚠️ 速度缺口: ${velocityGap} SP 未交付`
          : `- ✅ 速度达成${velocityGap < 0 ? `（超出 ${-velocityGap} SP）` : "（100% 完成）"}`,
        "",
      ];

      // 风险事件
      if (blockedTasks.length > 0) {
        lines.push("### 🚧 阻塞问题");
        for (const t of blockedTasks.slice(0, 5)) {
          const reason = (t as Record<string, unknown>).blockedReason as string | undefined;
          lines.push(`- ${t.title}${reason ? `: ${reason}` : ""}`);
        }
        if (blockedTasks.length > 5) {lines.push(`- ...还有 ${blockedTasks.length - 5} 个`);}
        lines.push("");
      }

      if (overdueTasks.length > 0) {
        lines.push("### ⏰ 逾期任务");
        for (const t of overdueTasks.slice(0, 5)) {
          lines.push(`- ${t.title}`);
        }
        if (overdueTasks.length > 5) {lines.push(`- ...还有 ${overdueTasks.length - 5} 个`);}
        lines.push("");
      }

      if (failedAcceptanceTasks.length > 0) {
        lines.push("### ❌ 验收未完全通过");
        for (const t of failedAcceptanceTasks.slice(0, 5)) {
          lines.push(`- ${t.title}`);
        }
        lines.push("");
      }

      if (unfinishedTasks.length > 0) {
        lines.push("### 📦 未完成任务（已移至 Backlog）");
        for (const t of unfinishedTasks.slice(0, 5)) {
          lines.push(`- ${t.title}（${t.status}）`);
        }
        if (unfinishedTasks.length > 5) {lines.push(`- ...还有 ${unfinishedTasks.length - 5} 个`);}
        lines.push("");
      }

      // 下次 Planning 建议
      const planningNotes: string[] = [];
      if (velocityGap > 0) {
        const suggestedSP = Math.round(actualVelocity * 0.9); // 保守估算：下次用 90% 实际速度
        planningNotes.push(`根据本次实际速度，建议下次 Sprint 规划 ≤${suggestedSP} SP`);
      }
      if (blockedTasks.length > 0) {
        planningNotes.push(`需在下次 Planning 前解除 ${blockedTasks.length} 个阻塞任务`);
      }
      if (failedAcceptanceTasks.length > 0) {
        planningNotes.push(`${failedAcceptanceTasks.length} 个任务验收标准未满足，建议优先放入下次 Sprint`);
      }
      if (planningNotes.length > 0) {
        lines.push("### 💡 下次 Planning 建议");
        for (const note of planningNotes) {
          lines.push(`- ${note}`);
        }
      }

      const retrospectiveText = lines.join("\n");

      // ── 写入 sprint.retrospective ──
      const sprintIdx = sprints.findIndex(
        (s: import("../../utils/project-context.js").ProjectSprint) => s.id === sprintId,
      );
      if (sprintIdx >= 0) {
        sprints[sprintIdx] = { ...sprints[sprintIdx], retrospective: retrospectiveText };
        if (existing.sprints) {existing.sprints = sprints;}
        else {existing.milestones = sprints;}
        existing.progressUpdatedAt = now;

        if (!fs.existsSync(ctx.workspacePath)) {
          fs.mkdirSync(ctx.workspacePath, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");
      }

      respond(
        true,
        {
          success: true,
          projectId,
          sprintId,
          retrospective: retrospectiveText,
          stats: {
            totalTasks: tasks.length,
            doneTasks: doneTasks.length,
            cancelledTasks: cancelledTasks.length,
            unfinishedTasks: unfinishedTasks.length,
            blockedTasks: blockedTasks.length,
            overdueTasks: overdueTasks.length,
            failedAcceptanceTasks: failedAcceptanceTasks.length,
            plannedPoints,
            actualVelocity,
            velocityGap,
            completionRate,
          },
          planningNotes,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to generate sprint retrospective: ${String(error)}`),
      );
    }
  },

  /**
   * 完成 Sprint
   *
   * 将指定 Sprint 标记为已完成：
   * - Sprint.status = 'completed'
   * - Sprint.completedAt = now
   * - Sprint.velocity = 已完成任务的 SP 总和
   * - 未完成任务（非 done/cancelled）可选小移入 Backlog 或下一个 Sprint
   */
  "projects.completeSprint": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const sprintId = params?.sprintId ? String(params.sprintId) : "";
      // unfinishedAction: 'backlog'(default) | 'next_sprint'
      const unfinishedAction = params?.unfinishedAction
        ? String(params.unfinishedAction)
        : "backlog";
      const retrospective = params?.retrospective ? String(params.retrospective) : undefined;

      if (!projectId || !sprintId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and sprintId are required"),
        );
        return;
      }

      const { buildProjectContext, readProjectConfig } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`),
        );
        return;
      }

      const sprints = existing.sprints ?? existing.milestones ?? [];
      const sprintIdx = sprints.findIndex(
        (s: import("../../utils/project-context.js").ProjectSprint) => s.id === sprintId,
      );
      if (sprintIdx === -1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Sprint "${sprintId}" not found`),
        );
        return;
      }

      const sprint = sprints[sprintIdx];
      const now = Date.now();

      // 计算 velocity（已完成 SP）
      const doneTasks = sprint.tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) => t.status === "done",
      );
      const velocity = doneTasks.reduce(
        (sum: number, t: import("../../utils/project-context.js").ProjectTask) =>
          sum + (t.storyPoints ?? 1),
        0,
      );

      // 未完成任务（非 done/cancelled）
      const unfinishedTasks = sprint.tasks.filter(
        (t: import("../../utils/project-context.js").ProjectTask) =>
          t.status !== "done" && t.status !== "cancelled",
      );

      // 标记 Sprint 已完成
      sprints[sprintIdx] = {
        ...sprint,
        status: "completed" as import("../../utils/project-context.js").SprintStatus,
        completedAt: now,
        velocity,
        retrospective: retrospective ?? sprint.retrospective,
        // 未完成任务从 Sprint 移出
        tasks: sprint.tasks.filter(
          (t: import("../../utils/project-context.js").ProjectTask) =>
            t.status === "done" || t.status === "cancelled",
        ),
      };

      if (unfinishedTasks.length > 0) {
        if (unfinishedAction === "next_sprint") {
          // 找下一个 Sprint（order 比当前大的最小的）
          const currentOrder = sprint.order;
          const nextSprint = sprints
            .filter(
              (s: import("../../utils/project-context.js").ProjectSprint) =>
                s.order > currentOrder && s.status !== "completed" && s.status !== "cancelled",
            )
            .toSorted(
              (
                a: import("../../utils/project-context.js").ProjectSprint,
                b: import("../../utils/project-context.js").ProjectSprint,
              ) => a.order - b.order,
            )[0];
          if (nextSprint) {
            const nextIdx = sprints.findIndex(
              (s: import("../../utils/project-context.js").ProjectSprint) => s.id === nextSprint.id,
            );
            sprints[nextIdx] = {
              ...nextSprint,
              tasks: [
                ...unfinishedTasks.map(
                  (t: import("../../utils/project-context.js").ProjectTask) => ({
                    ...t,
                    status: "todo" as import("../../utils/project-context.js").TaskStatus,
                  }),
                ),
                ...nextSprint.tasks,
              ],
            };
          } else {
            // 没有下一个 Sprint，回落到 Backlog
            existing.backlog = [
              ...(existing.backlog ?? []),
              ...unfinishedTasks.map((t: import("../../utils/project-context.js").ProjectTask) => ({
                ...t,
                status: "backlog" as import("../../utils/project-context.js").TaskStatus,
              })),
            ];
          }
        } else {
          // 默认：移入 Backlog
          existing.backlog = [
            ...(existing.backlog ?? []),
            ...unfinishedTasks.map((t: import("../../utils/project-context.js").ProjectTask) => ({
              ...t,
              status: "backlog" as import("../../utils/project-context.js").TaskStatus,
            })),
          ];
        }
      }

      // 写回配置
      if (existing.sprints) {
        existing.sprints = sprints;
      } else {
        existing.milestones = sprints;
      }

      // 重算整体进度
      const { calcProjectProgress } = await import("../../utils/project-context.js");
      existing.progress = calcProjectProgress(sprints);
      existing.progressUpdatedAt = now;

      // —— 写入团队 velocity 历史（用于 Sprint 容量预测） ——
      // 通过项目-团队关联查找负责该项目的团队
      try {
        const { organizationStorage } = await import("../../organization/storage.js");
        const teamRelations = await organizationStorage.getProjectTeamRelations(projectId, {
          status: "active",
        });
        const plannedPoints = sprint.tasks
          .filter(
            (t: import("../../utils/project-context.js").ProjectTask) => t.status !== "cancelled",
          )
          .reduce(
            (sum: number, t: import("../../utils/project-context.js").ProjectTask) =>
              sum + (t.storyPoints ?? 1),
            0,
          );
        const completionRate =
          plannedPoints === 0 ? 0 : Math.round((velocity / plannedPoints) * 100);
        const velocityRecord: import("../../organization/types.js").TeamVelocityRecord = {
          sprintId,
          sprintTitle: sprint.title,
          completedPoints: velocity,
          plannedPoints,
          completionRate,
          completedAt: now,
          projectId,
        };
        for (const rel of teamRelations) {
          const team = await organizationStorage.getTeam(rel.teamId);
          if (team) {
            const velocityHistory = [...(team.velocityHistory ?? []), velocityRecord];
            // 保留最近 20 个 Sprint 的记录
            await organizationStorage.updateTeam(rel.teamId, {
              velocityHistory: velocityHistory.slice(-20),
            });
          }
        }
      } catch (velocityErr) {
        // 非致命错误：团队 velocity 更新失败不影响 Sprint 完成主流程
        console.warn(`[completeSprint] velocity update failed: ${String(velocityErr)}`);
      }

      if (!fs.existsSync(ctx.workspacePath)) {
        fs.mkdirSync(ctx.workspacePath, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(
        true,
        {
          success: true,
          projectId,
          sprintId,
          velocity,
          movedToBacklog:
            unfinishedAction === "backlog" ||
            !sprints.find(
              (s: import("../../utils/project-context.js").ProjectSprint) => s.order > sprint.order,
            )
              ? unfinishedTasks.length
              : 0,
          movedToNextSprint: unfinishedAction === "next_sprint" ? unfinishedTasks.length : 0,
          config: existing,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to complete sprint: ${String(error)}`),
      );
    }
  },

  /**
   * 开始 Sprint
   *
   * 将指定 Sprint 标记为 active。
   * 同一项目应只有一个进行中的 Sprint，但不强制限制（可并行）
   */
  "projects.startSprint": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const sprintId = params?.sprintId ? String(params.sprintId) : "";

      if (!projectId || !sprintId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and sprintId are required"),
        );
        return;
      }

      const { buildProjectContext, readProjectConfig } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`),
        );
        return;
      }

      const sprints = existing.sprints ?? existing.milestones ?? [];
      const sprintIdx = sprints.findIndex(
        (s: import("../../utils/project-context.js").ProjectSprint) => s.id === sprintId,
      );
      if (sprintIdx === -1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Sprint "${sprintId}" not found`),
        );
        return;
      }

      const now = Date.now();

      // Sprint Capacity 检查：比较已分配 SP 与容量上限
      const sprintData = sprints[sprintIdx] as Record<string, unknown>;
      const capacityPoints = sprintData["capacityPoints"] as number | undefined;
      const assignedSP = ((sprints[sprintIdx].tasks ?? []) as Array<Record<string, unknown>>)
        .reduce((sum, t) => sum + (Number(t.storyPoints) || 1), 0);
      const capacityWarning = capacityPoints && assignedSP > capacityPoints
        ? "[CAPACITY WARNING] Sprint 已分配 " + assignedSP + " SP 超过容量上限 " + capacityPoints + " SP，建议进行范围缩减再启动。"
        : undefined;

      // Definition of Ready (DoR) 门禁 — Sprint Planning 最佳实践
      // 对标 SAFe PI Planning 和 Linear Sprint Planning 检查清单
      // DoR 三项必备检查：(1) 描述 >= 10字 (2) 验收标准 (3) 故事点估算
      const sprintTaskIds = ((sprints[sprintIdx].tasks ?? []) as Array<Record<string, unknown>>)
        .map((t) => String(t.id ?? t.taskId ?? "")).filter(Boolean);
      const dorNotReadyTasks: Array<{ taskId: string; title?: string; missing: string[] }> = [];
      if (sprintTaskIds.length > 0) {
        try {
          const { listTasks } = await import("../../tasks/storage.js");
          const sprintTasks = await listTasks({ projectId, limit: 500 });
          const sprintTaskMap = new Map(
            sprintTasks.filter((t) => sprintTaskIds.includes(t.id)).map((t) => [t.id, t]),
          );
          for (const tid of sprintTaskIds) {
            const t = sprintTaskMap.get(tid);
            if (!t) {continue;}
            const missing: string[] = [];
            if (!t.description || t.description.trim().length < 10) {missing.push("description(<10chars)");}
            const ac = (t as Record<string, unknown>).acceptanceCriteria as unknown[] | undefined;
            if (!ac || ac.length === 0) {missing.push("acceptanceCriteria(not-set)");}
            const sp = (t as Record<string, unknown>).storyPoints as number | undefined;
            if (sp == null || sp <= 0) {missing.push("storyPoints(not-estimated)");}
            if (missing.length > 0) {dorNotReadyTasks.push({ taskId: tid, title: t.title, missing });}
          }
        } catch {
          // DoR 检查失败不阻塞 Sprint 启动
        }
      }
      const dorWarning = dorNotReadyTasks.length > 0
        ? `[DoR WARNING] ${dorNotReadyTasks.length}/${sprintTaskIds.length} tasks not ready for Sprint. Suggest completing definition before starting: ${
            dorNotReadyTasks.slice(0, 3).map((t) => `"${t.title ?? t.taskId}"(${t.missing.join(",")})`).join("; ")
          }${dorNotReadyTasks.length > 3 ? " ..." : ""}`
        : undefined;

      sprints[sprintIdx] = {
        ...sprints[sprintIdx],
        status: "active" as import("../../utils/project-context.js").SprintStatus,
        startDate: sprints[sprintIdx].startDate ?? now,
      };

      if (existing.sprints) {
        existing.sprints = sprints;
      } else {
        existing.milestones = sprints;
      }
      existing.progressUpdatedAt = now;

      // 如果项目状态还是 planning，自动升级为 active
      if (!existing.status || existing.status === "planning") {
        existing.status = "active";
      }

      if (!fs.existsSync(ctx.workspacePath)) {
        fs.mkdirSync(ctx.workspacePath, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(true, {
        success: true,
        projectId,
        sprintId,
        config: existing,
        capacityCheck: capacityPoints
          ? { capacityPoints, assignedSP, isOverloaded: assignedSP > capacityPoints, utilizationPct: Math.round((assignedSP / capacityPoints) * 100) }
          : undefined,
        ...(capacityWarning ? { capacityWarning } : {}),
        ...(dorWarning ? { dorWarning, dorNotReadyTasks } : {}),
        warnings: [capacityWarning, dorWarning].filter(Boolean),
        tip: capacityWarning ?? dorWarning ?? "Sprint 已启动。团队成员应优先处理 Sprint 内任务，完成后调用 projects.completeSprint 完结本轮迭代。",
      }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to start sprint: ${String(error)}`),
      );
    }
  },

  /**
   * 逐条更新验收标准满足状态
   *
   * 参数:
   * - projectId: 项目 ID
   * - criterionId: 验收标准 ID
   * - satisfied: true/false
   * - evidence: 满足该标准的证据（文件路径/测试输出等）
   * - satisfiedBy: 由谁确认（Agent ID 或 "human"）
   */
  "projects.markCriterionSatisfied": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const criterionId = params?.criterionId ? String(params.criterionId) : "";
      if (!projectId || !criterionId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "projectId and criterionId are required"),
        );
        return;
      }

      const { buildProjectContext, readProjectConfig, checkCompletionGate } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`),
        );
        return;
      }

      if (!existing.completionGate) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Project "${projectId}" has no completionGate defined`,
          ),
        );
        return;
      }

      const criterionIdx = existing.completionGate.criteria.findIndex((c) => c.id === criterionId);
      if (criterionIdx === -1) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Criterion "${criterionId}" not found in project "${projectId}"`,
          ),
        );
        return;
      }

      const satisfied = params?.satisfied !== false; // 默认 true
      const now = Date.now();
      existing.completionGate.criteria[criterionIdx] = {
        ...existing.completionGate.criteria[criterionIdx],
        satisfied,
        satisfiedAt: satisfied ? now : undefined,
        evidence: params?.evidence
          ? String(params.evidence)
          : existing.completionGate.criteria[criterionIdx].evidence,
        satisfiedBy: params?.satisfiedBy
          ? String(params.satisfiedBy)
          : existing.completionGate.criteria[criterionIdx].satisfiedBy,
      };
      existing.progressUpdatedAt = now;

      // 检查验收标准满足情况，但不自动设置 completed
      // 设计原则：项目完成判定需明确由人工或 coordinator 调用 projects.updateProgress(status=completed)
      // 或 projects.humanSignOff 来完成。仅凭验收标准全部满足不能自动关闭，
      // 防止误判（例如验收标准定义不完整时的误触发）
      const gateResult = checkCompletionGate(existing.completionGate);
      const autoCompleted = false; // 不自动关闭，需人工/coordinator 明确确认

      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(
        true,
        {
          success: true,
          projectId,
          criterionId,
          satisfied,
          gateStatus: {
            progress: gateResult.progress,
            canClose: gateResult.canClose,
            gaps: gateResult.gaps,
          },
          autoCompleted,
          // 当所有标准满足时，给出下一步提示
          nextStep: gateResult.canClose
            ? `✅ 所有验收标准已满足。如确认项目已真正完成，可调用 projects.updateProgress(status="completed") 或 projects.humanSignOff 关闭项目。` +
              `\n⚠️ 注意：关闭前请确认：(1) 项目确实不需要再迭代新任务；(2) DoD 验收标准定义完整无遗漏。`
            : undefined,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to mark criterion: ${String(error)}`),
      );
    }
  },

  /**
   * 项目重新激活（解除 scopeFrozen 死锁）
   *
   * 专用于以下场景的快速恢复：
   * 1. Agent 误将项目标记为 completed（任务队列为空时的误判）
   * 2. 项目验收标准不完整导致的提前关闭
   * 3. 人工通过前端协作页面将项目退回活跃状态
   *
   * 执行动作：
   * - 将 status 改回指定活跃状态（默认 development）
   * - 清除 completionGate.scopeFrozen / scopeFrozenAt / scopeFrozenReason
   * - 记录回退原因（reactivateReason）
   *
   * 参数:
   * - projectId: 项目 ID（必填）
   * - status: 回退目标状态，默认 "development"（可选：active/planning/testing/review 等任意活跃状态）
   * - reason: 回退原因说明（可选，建议填写，便于审计）
   * - workspaceRoot: 自定义工作空间根目录（可选）
   */
  "projects.reactivate": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext, readProjectConfig } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`),
        );
        return;
      }

      const prevStatus = existing.status;
      const prevScopeFrozen = existing.completionGate?.scopeFrozen ?? false;

      // 目标活跃状态（默认 development）
      const activeStatuses = ["requirements", "design", "planning", "development", "testing", "review", "active", "dev_done", "operating", "maintenance"];
      const targetStatus = params?.status ? String(params.status) : "development";
      if (!activeStatuses.includes(targetStatus)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid target status "${targetStatus}". Must be one of: ${activeStatuses.join(", ")}`
          ),
        );
        return;
      }

      const reason = params?.reason ? String(params.reason) : "manual reactivation";
      const now = Date.now();

      // 回退状态
      existing.status = targetStatus as import("../../utils/project-context.js").ProjectStatus;

      // 解除 scopeFrozen
      if (existing.completionGate) {
        existing.completionGate.scopeFrozen = false;
        delete existing.completionGate.scopeFrozenAt;
        delete existing.completionGate.scopeFrozenReason;
      }

      // 记录回退元信息（便于审计）
      existing.progressUpdatedAt = now;
      if (!existing.metadata) {
        (existing as unknown as Record<string, unknown>).metadata = {};
      }
      const meta = (existing as unknown as Record<string, unknown>).metadata as Record<string, unknown>;
      meta.lastReactivatedAt = now;
      meta.lastReactivatedReason = reason;
      meta.lastReactivatedFrom = prevStatus;

      if (!fs.existsSync(ctx.workspacePath)) {
        fs.mkdirSync(ctx.workspacePath, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(
        true,
        {
          success: true,
          projectId,
          prevStatus,
          newStatus: targetStatus,
          prevScopeFrozen,
          scopeFrozen: false,
          reason,
          message: `✅ 项目已重新激活：${prevStatus} → ${targetStatus}，范围冻结已解除，可继续创建新任务。`,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to reactivate project: ${String(error)}`),
      );
    }
  },

  /**
   * Agent 签收项目（Agent Sign-Off）
   *
   * 在 AI 自主开发系统中，签收由负责该项目的 Agent（通常为 coordinator）完成。
   * 所有验收标准已就绪且 requireHumanSignOff=true 时，
   * 由项目 ownerId 对应的 Agent 进行最终确认签收。
   *
   * 参数:
   * - projectId: 项目 ID
   * - signOffBy: 签收 Agent ID（可选，默认取项目 ownerId；若无则为 coordinator）
   * - note: 签收备注（可选，Agent 可填写验收总结）
   */
  "projects.humanSignOff": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext, readProjectConfig, checkCompletionGate } =
        await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath);
      if (!existing) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`),
        );
        return;
      }

      if (!existing.completionGate) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Project "${projectId}" has no completionGate defined. Cannot sign off.`,
          ),
        );
        return;
      }

      // 必须先满足所有验收标准才能签收
      const gateCheck = checkCompletionGate(existing.completionGate);
      if (!gateCheck.allSatisfied) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Cannot sign off: ${gateCheck.gaps.join("; ")}`),
        );
        return;
      }

      const now = Date.now();
      existing.completionGate.humanSignOffAt = now;
      // 签收人优先取参数 signOffBy，其次取项目 ownerId，最后回退到 "coordinator"
      existing.completionGate.humanSignOffBy = params?.signOffBy
        ? String(params.signOffBy)
        : ((existing as unknown as { ownerId?: string }).ownerId ?? "coordinator");
      existing.completionGate.humanSignOffNote = params?.note ? String(params.note) : undefined;

      // 签收后自动设置项目状态为 completed
      if (existing.status !== "cancelled") {
        existing.status = "completed";
      }
      if (!existing.completionGate.scopeFrozen) {
        existing.completionGate.scopeFrozen = true;
        existing.completionGate.scopeFrozenAt = now;
        existing.completionGate.scopeFrozenReason = "completed";
      }
      existing.progressUpdatedAt = now;

      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(
        true,
        {
          success: true,
          projectId,
          humanSignOffAt: now,
          humanSignOffBy: existing.completionGate.humanSignOffBy,
          status: existing.status,
          scopeFrozen: existing.completionGate.scopeFrozen,
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to sign off project: ${String(error)}`),
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

      const projectWorkspaceExists = await import("../../utils/project-context.js").then(
        (m) => m.projectWorkspaceExists,
      );

      if (!projectWorkspaceExists(projectId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project "${projectId}" not found`),
        );
        return;
      }

      const buildProjectContext = await import("../../utils/project-context.js").then(
        (m) => m.buildProjectContext,
      );
      const projectCtx = buildProjectContext(projectId);
      const allGroups = groupManager.getAllGroups();
      const projectGroups = allGroups.filter((g) => g.projectId === projectId);

      respond(
        true,
        {
          projectId,
          name: (projectCtx.config as unknown as { name?: string } | null)?.name || projectId,
          description: (projectCtx.config as unknown as { description?: string } | null)
            ?.description,
          workspacePath: projectCtx.workspacePath,
          codeDir: projectCtx.codeDir,
          docsDir: projectCtx.docsDir,
          requirementsDir: projectCtx.config?.requirementsDir,
          status: projectCtx.config?.status,
          completionGate: projectCtx.config?.completionGate,
          objectives: projectCtx.config?.objectives,
          timelineMilestones: projectCtx.config?.timelineMilestones,
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

  // ============================================================================
  // 项目目标管理（Objective CRUD）
  // ============================================================================

  /**
   * projects.objective.upsert - 新增或更新项目战略目标
   */
  "projects.objective.upsert": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext, projectWorkspaceExists } = await import(
        "../../utils/project-context.js"
      );
      if (!projectWorkspaceExists(projectId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Project "${projectId}" not found`),
        );
        return;
      }

      const ctx = buildProjectContext(projectId);
      const configPath = `${ctx.workspacePath}/PROJECT_CONFIG.json`;

      const existing = ctx.config ?? ({ projectId, workspacePath: ctx.workspacePath } as import("../../utils/project-context.js").ProjectConfig);

      if (!existing.objectives) {existing.objectives = [];}

      const now = Date.now();
      const title = params?.title ? String(params.title) : "";
      if (!title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title is required"));
        return;
      }

      const objectiveId = params?.id ? String(params.id) : `obj_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const existingIdx = existing.objectives.findIndex((o) => o.id === objectiveId);

      const timeframe = ["short", "medium", "long"].includes(String(params?.timeframe))
        ? (String(params.timeframe) as import("../../utils/project-context.js").ProjectObjective["timeframe"])
        : ("medium" as const);
      const status = ["not-started", "in-progress", "achieved", "missed", "deferred"].includes(String(params?.status))
        ? (String(params.status) as import("../../utils/project-context.js").ProjectObjective["status"])
        : ("not-started" as const);

      const objective: import("../../utils/project-context.js").ProjectObjective = {
        ...(existingIdx >= 0 ? existing.objectives[existingIdx] : {}),
        id: objectiveId,
        title,
        description: params?.description ? String(params.description) : undefined,
        timeframe,
        status,
        targetDate: params?.targetDate ? Number(params.targetDate) : undefined,
        keyResults: params?.keyResults ? (params.keyResults as import("../../utils/project-context.js").KeyResult[]) : (existingIdx >= 0 ? existing.objectives[existingIdx].keyResults : undefined),
        parentObjectiveId: params?.parentObjectiveId ? String(params.parentObjectiveId) : undefined,
        lastUpdateNote: params?.note ? String(params.note) : undefined,
        createdAt: existingIdx >= 0 ? existing.objectives[existingIdx].createdAt : now,
        updatedAt: now,
      };

      if (existingIdx >= 0) {
        existing.objectives[existingIdx] = objective;
      } else {
        existing.objectives.push(objective);
      }
      existing.progressUpdatedAt = now;

      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(
        true,
        {
          success: true,
          projectId,
          objective,
          action: existingIdx >= 0 ? "updated" : "created",
        },
        undefined,
      );
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to upsert objective: ${String(error)}`),
      );
    }
  },

  /**
   * projects.objective.delete - 删除项目目标
   */
  "projects.objective.delete": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const objectiveId = params?.id ? String(params.id) : "";
      if (!projectId || !objectiveId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId and id are required"));
        return;
      }

      const { buildProjectContext, projectWorkspaceExists } = await import(
        "../../utils/project-context.js"
      );
      if (!projectWorkspaceExists(projectId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Project "${projectId}" not found`));
        return;
      }

      const ctx = buildProjectContext(projectId);
      const configPath = `${ctx.workspacePath}/PROJECT_CONFIG.json`;
      const existing = ctx.config;
      if (!existing) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Project config not found"));
        return;
      }

      const before = existing.objectives?.length ?? 0;
      existing.objectives = (existing.objectives ?? []).filter((o) => o.id !== objectiveId);
      const deleted = before > (existing.objectives?.length ?? 0);

      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");
      respond(true, { success: true, projectId, objectiveId, deleted }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete objective: ${String(error)}`));
    }
  },

  // ============================================================================
  // 里程碑管理（Timeline Milestone CRUD）
  // ============================================================================

  /**
   * projects.milestone.upsert - 新增或更新里程碑
   */
  "projects.milestone.upsert": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext, projectWorkspaceExists } = await import(
        "../../utils/project-context.js"
      );
      if (!projectWorkspaceExists(projectId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Project "${projectId}" not found`));
        return;
      }

      const ctx = buildProjectContext(projectId);
      const configPath = `${ctx.workspacePath}/PROJECT_CONFIG.json`;
      const existing = ctx.config ?? ({ projectId, workspacePath: ctx.workspacePath } as import("../../utils/project-context.js").ProjectConfig);

      if (!existing.timelineMilestones) {existing.timelineMilestones = [];}

      const now = Date.now();
      const title = params?.title ? String(params.title) : "";
      if (!title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title is required"));
        return;
      }

      const milestoneId = params?.id ? String(params.id) : `ms_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const existingIdx = existing.timelineMilestones.findIndex((m) => m.id === milestoneId);

      const validTypes = ["release", "phase", "checkpoint", "deliverable", "other"];
      const validStatuses = ["upcoming", "in-progress", "completed", "missed", "cancelled"];
      const msType = validTypes.includes(String(params?.type)) ? String(params.type) as import("../../utils/project-context.js").ProjectMilestoneEntry["type"] : "phase" as const;
      const msStatus = validStatuses.includes(String(params?.status)) ? String(params.status) as import("../../utils/project-context.js").ProjectMilestoneEntry["status"] : "upcoming" as const;

      const milestone: import("../../utils/project-context.js").ProjectMilestoneEntry = {
        ...(existingIdx >= 0 ? existing.timelineMilestones[existingIdx] : {}),
        id: milestoneId,
        title,
        description: params?.description ? String(params.description) : undefined,
        type: msType,
        status: msStatus,
        targetDate: params?.targetDate ? Number(params.targetDate) : undefined,
        completedAt: msStatus === "completed" && params?.completedAt ? Number(params.completedAt) : (msStatus === "completed" && existingIdx < 0 ? now : (existingIdx >= 0 ? existing.timelineMilestones[existingIdx].completedAt : undefined)),
        objectiveId: params?.objectiveId ? String(params.objectiveId) : undefined,
        sprintIds: params?.sprintIds ? (params.sprintIds as string[]) : (existingIdx >= 0 ? existing.timelineMilestones[existingIdx].sprintIds : undefined),
        ownerId: params?.ownerId ? String(params.ownerId) : undefined,
        createdAt: existingIdx >= 0 ? existing.timelineMilestones[existingIdx].createdAt : now,
        updatedAt: now,
      };

      if (existingIdx >= 0) {
        existing.timelineMilestones[existingIdx] = milestone;
      } else {
        existing.timelineMilestones.push(milestone);
      }
      existing.progressUpdatedAt = now;

      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(
        true,
        {
          success: true,
          projectId,
          milestone,
          action: existingIdx >= 0 ? "updated" : "created",
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to upsert milestone: ${String(error)}`));
    }
  },

  /**
   * projects.milestone.delete - 删除里程碑
   */
  "projects.milestone.delete": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const milestoneId = params?.id ? String(params.id) : "";
      if (!projectId || !milestoneId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId and id are required"));
        return;
      }

      const { buildProjectContext, projectWorkspaceExists } = await import(
        "../../utils/project-context.js"
      );
      if (!projectWorkspaceExists(projectId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Project "${projectId}" not found`));
        return;
      }

      const ctx = buildProjectContext(projectId);
      const configPath = `${ctx.workspacePath}/PROJECT_CONFIG.json`;
      const existing = ctx.config;
      if (!existing) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Project config not found"));
        return;
      }

      const before = existing.timelineMilestones?.length ?? 0;
      existing.timelineMilestones = (existing.timelineMilestones ?? []).filter((m) => m.id !== milestoneId);
      const deleted = before > (existing.timelineMilestones?.length ?? 0);

      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");
      respond(true, { success: true, projectId, milestoneId, deleted }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete milestone: ${String(error)}`));
    }
  },

  /**
   * projects.sprint.upsert — 创建或更新 Sprint
   *
   * 这是 Sprint 管理闭环的入口：
   * 1. AI coordinator 在接手项目时，先通过 project_objective_upsert 定义三层目标
   * 2. 再通过 project_milestone_upsert 建立里程碑时间轴
   * 3. 最后通过此方法将里程碑分解为具体的 Sprint 迭代周期
   *
   * 参数:
   * - projectId: 项目 ID（必填）
   * - title: Sprint 标题（必填）
   * - goal: Sprint 目标（强烈推荐，类似 Scrum Sprint Goal）
   * - order: 排序序号，默认自动追加到末尾
   * - startDate: 开始时间（Unix ms）
   * - endDate: 截止时间（Unix ms）
   * - objectiveId: 关联的战略目标 ID（推荐填写，强化目标对齐）
   * - milestoneId: 关联的里程碑 ID
   * - id: Sprint ID（更新时传入）
   * - status: 状态（planning/active/completed/cancelled）
   */
  "projects.sprint.upsert": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const title = params?.title ? String(params.title) : "";
      if (!projectId || !title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId and title are required"));
        return;
      }

      const { buildProjectContext, readProjectConfig } = await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath) ?? { projectId, workspacePath: ctx.workspacePath };

      // 初始化 sprints 数组
      if (!existing.sprints) {existing.sprints = existing.milestones ?? [];}

      const now = Date.now();
      const sprintId = params?.id ? String(params.id) : `sprint_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const existingIdx = existing.sprints.findIndex(
        (s: import("../../utils/project-context.js").ProjectSprint) => s.id === sprintId,
      );

      // 自动计算 order：新建时追加到末尾
      const maxOrder = existing.sprints.reduce(
        (m: number, s: import("../../utils/project-context.js").ProjectSprint) => Math.max(m, s.order ?? 0),
        0,
      );
      const order = params?.order ? Number(params.order) : (existingIdx >= 0 ? existing.sprints[existingIdx].order : maxOrder + 1);

      const sprint: import("../../utils/project-context.js").ProjectSprint = {
        ...(existingIdx >= 0 ? existing.sprints[existingIdx] : {}),
        id: sprintId,
        title,
        goal: params?.goal ? String(params.goal) : (existingIdx >= 0 ? existing.sprints[existingIdx].goal : undefined),
        order,
        status: params?.status
          ? (String(params.status) as import("../../utils/project-context.js").SprintStatus)
          : (existingIdx >= 0 ? existing.sprints[existingIdx].status : "planning"),
        startDate: params?.startDate ? Number(params.startDate) : (existingIdx >= 0 ? existing.sprints[existingIdx].startDate : undefined),
        endDate: params?.endDate ? Number(params.endDate) : (existingIdx >= 0 ? existing.sprints[existingIdx].endDate : undefined),
        tasks: existingIdx >= 0 ? existing.sprints[existingIdx].tasks : [],
        // 扩展字段：存入 metadata
        ...(params?.objectiveId || params?.milestoneId ? {
          retrospective: existingIdx >= 0 ? existing.sprints[existingIdx].retrospective : undefined,
        } : {}),
      };

      // 将 objectiveId / milestoneId 存入配置的扩展字段
      // （ProjectSprint 无这两个字段，通过 JSON 宽松存储）
      const sprintWithMeta = sprint as Record<string, unknown>;
      if (params?.objectiveId) {sprintWithMeta["objectiveId"] = String(params.objectiveId);}
      if (params?.milestoneId) {sprintWithMeta["milestoneId"] = String(params.milestoneId);}
      // Sprint Capacity 容量（业界标准：Jira/Linear 在规划时设置团队可承载的故事点上限）
      if (params?.capacityPoints !== undefined) {
        sprintWithMeta["capacityPoints"] = Number(params.capacityPoints);
      }

      if (existingIdx >= 0) {
        existing.sprints[existingIdx] = sprintWithMeta as import("../../utils/project-context.js").ProjectSprint;
      } else {
        existing.sprints.push(sprintWithMeta as import("../../utils/project-context.js").ProjectSprint);
      }

      // 同步到 milestones（向后兼容）
      existing.milestones = existing.sprints;
      existing.progressUpdatedAt = now;

      if (!fs.existsSync(ctx.workspacePath)) {fs.mkdirSync(ctx.workspacePath, { recursive: true });}
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(true, {
        success: true,
        projectId,
        sprint: sprintWithMeta,
        action: existingIdx >= 0 ? "updated" : "created",
        capacityCheck: sprintWithMeta["capacityPoints"]
          ? { capacityPoints: sprintWithMeta["capacityPoints"], note: "\u5bb9\u91cf\u5df2\u8bbe\u7f6e\uff0c\u542f\u52a8 Sprint \u65f6\u4f1a\u81ea\u52a8\u68c0\u67e5\u5df2\u5206\u914d SP \u662f\u5426\u8d85\u8fc7\u5bb9\u91cf\u3002" }
          : { note: "\u5efa\u8bae\u901a\u8fc7 capacityPoints \u8bbe\u7f6e\u56e2\u961f\u6548\u8083\uff0c\u9632\u6b62 Sprint \u8fc7\u8f7d\uff08\u53c2\u8003\u5386\u53f2 velocity \u8bbe\u4e3a capacityPoints \u5373\u53ef\uff09\u3002" },
        tip: sprint.goal
          ? "Sprint \"" + title + "\" \u5df2" + (existingIdx >= 0 ? "\u66f4\u65b0" : "\u521b\u5efa") + "\u3002\u7528 projects.sprint.addTask \u5411 Sprint \u52a0\u5165\u4efb\u52a1\uff0c\u51c6\u5907\u597d\u540e\u8c03\u7528 projects.startSprint \u542f\u52a8\u3002"
          : "\u26a0\ufe0f \u5efa\u8bae\u4e3a Sprint \u8bbe\u7f6e goal\uff08Sprint\u76ee\u6807\uff09\uff0c\u8ba9\u56e2\u961f\u6e05\u6670\u77e5\u9053\u672c\u8f6e\u8fed\u4ee3\u8981\u8fbe\u6210\u4ec0\u4e48\u3002",
      }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to upsert sprint: ${String(error)}`));
    }
  },

  /**
   * projects.sprint.addTask — 向 Sprint 中添加或移除任务引用
   *
   * Sprint 中的任务是对 SQLite Task 系统的引用快照（task ID + 基础信息）。
   * 任务的权威状态仍在 SQLite，Sprint 中存储快照用于进度计算。
   *
   * action:
   * - "add": 将任务加入 Sprint（必填 taskId + title）
   * - "remove": 从 Sprint 移除任务（仅需 taskId）
   * - "update": 更新 Sprint 内任务状态（通常由任务完成时触发）
   */
  "projects.sprint.addTask": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const sprintId = params?.sprintId ? String(params.sprintId) : "";
      const taskId = params?.taskId ? String(params.taskId) : "";
      const action = params?.action ? String(params.action) : "add";

      if (!projectId || !sprintId || !taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId, sprintId, and taskId are required"));
        return;
      }

      const { buildProjectContext, readProjectConfig } = await import("../../utils/project-context.js");
      const path = await import("path");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const configPath = path.join(ctx.workspacePath, "PROJECT_CONFIG.json");

      const existing = readProjectConfig(ctx.workspacePath);
      if (!existing) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`));
        return;
      }

      const sprints = existing.sprints ?? existing.milestones ?? [];
      const sprintIdx = sprints.findIndex(
        (s: import("../../utils/project-context.js").ProjectSprint) => s.id === sprintId,
      );
      if (sprintIdx === -1) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Sprint "${sprintId}" not found`));
        return;
      }

      const now = Date.now();
      const sprint = sprints[sprintIdx];

      if (action === "remove") {
        sprints[sprintIdx] = { ...sprint, tasks: sprint.tasks.filter((t) => t.id !== taskId) };
      } else if (action === "update") {
        // 更新 Sprint 内任务状态快照
        const taskIdx = sprint.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx >= 0) {
          const newStatus = params?.status ? String(params.status) : sprint.tasks[taskIdx].status;
          const updatedTask = {
            ...sprint.tasks[taskIdx],
            status: newStatus as import("../../utils/project-context.js").TaskStatus,
            updatedAt: now,
            ...(newStatus === "done" ? { completedAt: now } : {}),
          };
          const newTasks = [...sprint.tasks];
          newTasks[taskIdx] = updatedTask;
          sprints[sprintIdx] = { ...sprint, tasks: newTasks };
        } else {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Task "${taskId}" not found in sprint`));
          return;
        }
      } else {
        // action === "add"
        const alreadyIn = sprint.tasks.some((t) => t.id === taskId);
        if (alreadyIn) {
          respond(true, { success: true, projectId, sprintId, taskId, action: "already_in", message: "任务已在 Sprint 中" }, undefined);
          return;
        }
        const title = params?.title ? String(params.title) : taskId;
        const newTask: import("../../utils/project-context.js").Task = {
          id: taskId,
          title,
          scope: "project",
          status: (params?.status ? String(params.status) : "todo") as import("../../utils/project-context.js").TaskStatus,
          priority: (params?.priority ? String(params.priority) : "medium") as import("../../utils/project-context.js").TaskPriority,
          type: (params?.taskType ? String(params.taskType) : "other") as import("../../utils/project-context.js").TaskType,
          projectId,
          storyPoints: params?.storyPoints ? Number(params.storyPoints) : undefined,
          timeTracking: { timeSpent: 0 },
          createdAt: now,
          updatedAt: now,
          objectiveId: params?.objectiveId ? String(params.objectiveId) : undefined,
        };
        sprints[sprintIdx] = { ...sprint, tasks: [...sprint.tasks, newTask] };
      }

      if (existing.sprints) {
        existing.sprints = sprints;
      } else {
        existing.milestones = sprints;
      }
      existing.progressUpdatedAt = now;

      // 重算进度
      const { calcProjectProgress } = await import("../../utils/project-context.js");
      existing.progress = calcProjectProgress(sprints);

      if (!fs.existsSync(ctx.workspacePath)) {fs.mkdirSync(ctx.workspacePath, { recursive: true });}
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      const updatedSprint = sprints[sprintIdx];
      const { calcSprintProgress } = await import("../../utils/project-context.js");
      respond(true, {
        success: true,
        projectId,
        sprintId,
        taskId,
        action,
        sprintTaskCount: updatedSprint.tasks.length,
        sprintProgress: calcSprintProgress(updatedSprint),
      }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to update sprint task: ${String(error)}`));
    }
  },

  /**
   * 物理删除项目
   *
   * 删除项目包含：
   * 1. 删除 Task 系统中该项目的所有任务（物理删除，不是标记删除）
   * 2. 删除/解绑项目绑定的所有群组
   * 3. 删除工作空间目录（包括 PROJECT_CONFIG.json 和所有子目录）
   *
   * 注意：这是不可逆操作，前端必须先进行二次确认才调用此接口。
   */
  "projects.delete": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      // 删除选项（默认不删除，即保留）
      const deleteWorkspace = params?.deleteWorkspace === true;
      const deleteTasks = params?.deleteTasks === true;
      const deleteGroups = params?.deleteGroups === true;

      const { buildProjectContext } = await import("../../utils/project-context.js");
      const fs = await import("fs");
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const ctx = buildProjectContext(projectId, workspaceRoot);

      const summary: {
        tasksDeleted: number;
        groupsRemoved: string[];
        workspaceDeleted: boolean;
        errors: string[];
      } = {
        tasksDeleted: 0,
        groupsRemoved: [],
        workspaceDeleted: false,
        errors: [],
      };

      // ① 删除 Task 系统中该项目的所有任务（物理删除）
      if (deleteTasks) {
        try {
          const { listTasks, deleteTask } = await import("../../tasks/storage.js");
          const tasks = await listTasks({ projectId });
          for (const task of tasks) {
            await deleteTask(task.id);
          }
          summary.tasksDeleted = tasks.length;
        } catch (taskErr) {
          summary.errors.push(`删除任务失败: ${String(taskErr)}`);
        }
      }

      // ② 删除/解绑项目绑定的所有群组
      if (deleteGroups) {
        try {
          const allGroups = groupManager.getAllGroups();
          const projectGroups = allGroups.filter(
            (g) => g.projectId && g.projectId.toLowerCase() === projectId.toLowerCase(),
          );
          for (const group of projectGroups) {
            try {
              await groupManager.deleteGroup(group.id);
              summary.groupsRemoved.push(group.id);
            } catch (groupErr) {
              summary.errors.push(`删除群组 ${group.id} 失败: ${String(groupErr)}`);
            }
          }
        } catch (groupsErr) {
          summary.errors.push(`删除群组失败: ${String(groupsErr)}`);
        }
      }

      // ③ 删除工作空间目录（物理删除）
      if (deleteWorkspace) {
        try {
          const wsPath = ctx.workspacePath;
          if (wsPath && fs.existsSync(wsPath)) {
            fs.rmSync(wsPath, { recursive: true, force: true });
            summary.workspaceDeleted = true;
          }
        } catch (fsErr) {
          summary.errors.push(`删除工作空间失败: ${String(fsErr)}`);
        }
      }

      respond(true, {
        success: true,
        projectId,
        ...summary,
        message: [
          `项目 "${projectId}" 删除操作完成。`,
          `- 删除任务: ${deleteTasks ? `${summary.tasksDeleted} 个` : '已跳过（保留）'}`,
          `- 删除群组: ${deleteGroups ? `${summary.groupsRemoved.length} 个 (${summary.groupsRemoved.join(", ") || "无"})` : '已跳过（保留）'}`,
          `- 工作空间: ${deleteWorkspace ? (summary.workspaceDeleted ? "已删除" : "不存在/删除跳过") : '已跳过（保留）'}`,
          summary.errors.length > 0 ? `- 警告: ${summary.errors.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete project: ${String(error)}`),
      );
    }
  },

  /**
   * projects.sprintBurndown — Sprint 逐日进度快照（Burndown 数据）
   *
   * 返回 Sprint 期间每日的剩余故事点 vs 理想燃尽线。
   * 业界标准（Jira/GitHub Projects）：每日生成一个进度数据点，供趋势分析。
   */
  "projects.sprintBurndown": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const sprintId = params?.sprintId ? String(params.sprintId) : "";
      if (!projectId || !sprintId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId and sprintId are required"));
        return;
      }
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const { buildProjectContext } = await import("../../utils/project-context.js");
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const config = ctx.config;
      if (!config) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Project config not found"));
        return;
      }
      // 查找目标 Sprint
      const sprints = config.sprints ?? config.milestones ?? [];
      type SprintLike = Record<string, unknown>;
      const sprint = sprints.find((s: SprintLike) => s.id === sprintId || s.name === sprintId) as SprintLike | undefined;
      if (!sprint) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Sprint not found: " + sprintId));
        return;
      }
      // 获取 Sprint 任务列表
      const { listTasks } = await import("../../tasks/storage.js");
      const sprintTaskIds = new Set((sprint.tasks as SprintLike[] ?? []).map((t: SprintLike) => String(t.id ?? t.taskId ?? "")).filter(Boolean));
      const allProjectTasks = await listTasks({ projectId, limit: 2000 });
      const sprintTasks = allProjectTasks.filter((t) => sprintTaskIds.has(t.id));
      // 计算 Sprint 时间范围
      const sprintStart = Number(sprint.startDate ?? sprint.createdAt ?? Date.now());
      const sprintEnd = Number(sprint.endDate ?? sprint.dueDate ?? (sprintStart + 14 * 24 * 3600 * 1000));
      const totalSP = sprintTasks.reduce((sum, t) => sum + ((t as Record<string, unknown>).storyPoints as number ?? 1), 0);
      // 生成逐日燃尽数据点
      const dayMs = 24 * 60 * 60 * 1000;
      const totalDays = Math.max(1, Math.round((sprintEnd - sprintStart) / dayMs));
      const dataPoints: Array<{ date: string; remainingSP: number; idealSP: number; completedTasks: number }> = [];
      for (let day = 0; day <= totalDays; day++) {
        const dayTs = sprintStart + day * dayMs;
        const completedByDay = sprintTasks.filter(
          (t) => t.completedAt && t.completedAt <= dayTs,
        );
        const completedSP = completedByDay.reduce(
          (sum, t) => sum + ((t as Record<string, unknown>).storyPoints as number ?? 1),
          0,
        );
        const remainingSP = Math.max(0, totalSP - completedSP);
        const idealSP = Math.max(0, Math.round(totalSP * (1 - day / totalDays) * 10) / 10);
        dataPoints.push({
          date: new Date(dayTs).toISOString().split("T")[0],
          remainingSP,
          idealSP,
          completedTasks: completedByDay.length,
        });
      }
      // 当前状态
      const today = Date.now();
      const currentDayIdx = Math.min(totalDays, Math.max(0, Math.round((today - sprintStart) / dayMs)));
      const currentPoint = dataPoints[currentDayIdx];
      const isOnTrack = currentPoint ? currentPoint.remainingSP <= currentPoint.idealSP : null;
      respond(true, {
        projectId,
        sprintId,
        sprintName: String(sprint.name ?? sprintId),
        sprintStart: new Date(sprintStart).toISOString(),
        sprintEnd: new Date(sprintEnd).toISOString(),
        totalStoryPoints: totalSP,
        totalTasks: sprintTasks.length,
        dataPoints,
        currentProgress: currentPoint,
        isOnTrack,
        trend: isOnTrack === null ? "数据不足" : isOnTrack ? "🟢 进度正常" : "🔴 当前滞后于理想进度，需加速",
      }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to get sprint burndown: " + String(error)));
    }
  },

  /**
   * projects.portfolioHealth — 多项目汇总健康看板
   *
   * 跨项目汇总各项目的健康状态，一眼看全局。
   * 返回每个项目的：overallHealth、创建任务数、完成率、超期任务数、OKR完成率。
   */
  "projects.portfolioHealth": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const projectIds = Array.isArray(params?.projectIds)
        ? (params.projectIds as string[])
        : undefined;
      const { listAvailableProjects, buildProjectContext } = await import("../../utils/project-context.js");
      const allProjectIds = projectIds ?? listAvailableProjects(workspaceRoot);
      const { listTasks } = await import("../../tasks/storage.js");
      const now = Date.now();
      const results = await Promise.allSettled(
        allProjectIds.map(async (pid) => {
          const ctx = buildProjectContext(pid, workspaceRoot);
          const tasks = await listTasks({ projectId: pid, limit: 2000 });
          const activeTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
          const doneTasks = tasks.filter((t) => t.status === "done");
          const overdueTasks = activeTasks.filter((t) => t.dueDate && t.dueDate < now);
          const blockedTasks = activeTasks.filter((t) => t.status === "blocked");
          const completionRate = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
          const techDebtCount = activeTasks.filter((t) =>
            (t.tags ?? []).some((tag) => ["tech-debt", "technical-debt", "技术债"].includes(tag)),
          ).length;
          // OKR 完成率
          let okrAvgProgress: number | undefined;
          try {
            const { loadOkrStore, calcOkrProgress } = await import("../../tasks/okr-manager.js");
            const store = loadOkrStore(ctx.workspacePath);
            const objectives = store?.objectives ?? [];
            if (objectives.length > 0) {
              const taskStats = new Map();
              for (const t of doneTasks) {
                const oid = (t as Record<string, unknown>).objectiveId as string | undefined;
                if (!oid) {continue;}
                const stat = taskStats.get(oid) ?? { total: 0, completed: 0 };
                stat.total++; stat.completed++;
                taskStats.set(oid, stat);
              }
              const progress = calcOkrProgress(objectives, taskStats);
              const allProgress = Object.values(progress).map((p) => (p as Record<string, unknown>).completionRate as number ?? 0);
              okrAvgProgress = allProgress.length > 0 ? Math.round(allProgress.reduce((a, b) => a + b, 0) / allProgress.length) : undefined;
            }
          } catch { /* OKR 模块可能未初始化 */ }
          // 健康状态评判
          const issues: string[] = [];
          if (overdueTasks.length > 0) {issues.push("超期 " + overdueTasks.length + " 个");}
          if (blockedTasks.length > 0) {issues.push("阻塞 " + blockedTasks.length + " 个");}
          if (techDebtCount > activeTasks.length * 0.2) {issues.push("技术债 " + techDebtCount + " 个");}
          const overallHealth = issues.length === 0 ? "🟢 健康" : issues.length <= 1 ? "🟡 需关注" : "🔴 需干预";
          return {
            projectId: pid,
            projectName: ctx.config?.name ?? pid,
            status: ctx.config?.status ?? "unknown",
            overallHealth,
            issues,
            stats: {
              total: tasks.length,
              active: activeTasks.length,
              done: doneTasks.length,
              overdue: overdueTasks.length,
              blocked: blockedTasks.length,
              techDebt: techDebtCount,
              completionRate: completionRate + "%",
            },
            okrAvgProgress: okrAvgProgress !== undefined ? okrAvgProgress + "%" : undefined,
          };
        }),
      );
      const projects = results
        .map((r, i) => r.status === "fulfilled" ? r.value : { projectId: allProjectIds[i], error: String((r).reason) })
        .filter(Boolean);
      const healthCounts = { green: 0, yellow: 0, red: 0 };
      for (const p of projects) {
        const h = String((p as Record<string, unknown>).overallHealth ?? "");
        if (h.includes("🟢")) {healthCounts.green++;}
        else if (h.includes("🟡")) {healthCounts.yellow++;}
        else if (h.includes("🔴")) {healthCounts.red++;}
      }
      respond(true, {
        totalProjects: projects.length,
        healthSummary: healthCounts,
        overallPortfolioHealth: healthCounts.red > 0 ? "🔴 多项目异常" : healthCounts.yellow > 0 ? "🟡 部分项目需关注" : "🟢 整体健康",
        projects,
        generatedAt: new Date(now).toISOString(),
      }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to get portfolio health: " + String(error)));
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // Initiative 战略主题管理 RPC（对标 Linear 2025 Initiatives）
  // ──────────────────────────────────────────────────────────────────

  /**
   * projects.initiative.upsert — 创建或更新 Initiative
   *
   * 战略主题是层次最高层：Initiative > Project > Sprint/Epic > Task
   * 对标 Linear Initiatives、SAFe Portfolio Epic
   */
  "projects.initiative.upsert": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const { upsertInitiative } = await import("../../tasks/initiative-manager.js");
      const initiative = upsertInitiative(root, {
        id: params?.id ? String(params.id) : undefined,
        title: params?.title ? String(params.title) : "",
        description: params?.description ? String(params.description) : undefined,
        health: (params?.health ? String(params.health) : "on-track") as import("../../tasks/initiative-manager.js").InitiativeHealth,
        ownerId: params?.ownerId ? String(params.ownerId) : undefined,
        projectIds: Array.isArray(params?.projectIds) ? params.projectIds.map(String) : [],
        targetDate: params?.targetDate ? Number(params.targetDate) : undefined,
        objectiveId: params?.objectiveId ? String(params.objectiveId) : undefined,
        priority: ([1, 2, 3, 4].includes(Number(params?.priority)) ? Number(params.priority) : undefined) as 1 | 2 | 3 | 4 | undefined,
        tags: Array.isArray(params?.tags) ? params.tags.map(String) : undefined,
        createdBy: params?.createdBy ? String(params.createdBy) : "system",
      });
      if (!initiative.title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title is required"));
        return;
      }
      respond(true, { success: true, initiative }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to upsert initiative: " + String(error)));
    }
  },

  /**
   * projects.initiative.list — 列出所有 Initiative 及其健康状态摘要
   */
  "projects.initiative.list": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const { listInitiatives, calcInitiativeHealthSummary } = await import("../../tasks/initiative-manager.js");
      const filter = {
        health: params?.health ? String(params.health) as import("../../tasks/initiative-manager.js").InitiativeHealth : undefined,
        ownerId: params?.ownerId ? String(params.ownerId) : undefined,
        objectiveId: params?.objectiveId ? String(params.objectiveId) : undefined,
        projectId: params?.projectId ? String(params.projectId) : undefined,
      };
      const initiatives = listInitiatives(root, filter);
      const summary = calcInitiativeHealthSummary(initiatives);
      respond(true, {
        initiatives,
        total: initiatives.length,
        healthSummary: summary,
      }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to list initiatives: " + String(error)));
    }
  },

  /**
   * projects.initiative.get — 获取单个 Initiative 详情
   */
  "projects.initiative.get": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const id = params?.id ? String(params.id) : "";
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const { getInitiative } = await import("../../tasks/initiative-manager.js");
      const initiative = getInitiative(root, id);
      if (!initiative) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Initiative not found: " + id));
        return;
      }
      respond(true, { initiative }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to get initiative: " + String(error)));
    }
  },

  /**
   * projects.initiative.delete — 删除 Initiative
   */
  "projects.initiative.delete": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const id = params?.id ? String(params.id) : "";
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const { deleteInitiative } = await import("../../tasks/initiative-manager.js");
      const deleted = deleteInitiative(root, id);
      respond(true, { success: deleted, id, message: deleted ? `Initiative ${id} deleted` : `Initiative ${id} not found` }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to delete initiative: " + String(error)));
    }
  },

  /**
   * projects.initiative.addProject — 将项目关联到 Initiative
   */
  "projects.initiative.addProject": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const initiativeId = params?.initiativeId ? String(params.initiativeId) : "";
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!initiativeId || !projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "initiativeId and projectId are required"));
        return;
      }
      const { linkProjectToInitiative } = await import("../../tasks/initiative-manager.js");
      const initiative = linkProjectToInitiative(root, initiativeId, projectId);
      if (!initiative) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Initiative not found: " + initiativeId));
        return;
      }
      respond(true, { success: true, initiative }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to add project to initiative: " + String(error)));
    }
  },

  /**
   * projects.initiative.removeProject — 从 Initiative 移除项目关联
   */
  "projects.initiative.removeProject": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const initiativeId = params?.initiativeId ? String(params.initiativeId) : "";
      const projectId = params?.projectId ? String(params.projectId) : "";
      if (!initiativeId || !projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "initiativeId and projectId are required"));
        return;
      }
      const { unlinkProjectFromInitiative } = await import("../../tasks/initiative-manager.js");
      const initiative = unlinkProjectFromInitiative(root, initiativeId, projectId);
      if (!initiative) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Initiative not found: " + initiativeId));
        return;
      }
      respond(true, { success: true, initiative }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to remove project from initiative: " + String(error)));
    }
  },

  /**
   * projects.initiative.addUpdate — 向 Initiative 添加进展更新
   * 对标 Linear 2025 initiative updates（append-only 更新历史）
   */
  "projects.initiative.addUpdate": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const initiativeId = params?.initiativeId ? String(params.initiativeId) : "";
      const content = params?.content ? String(params.content) : "";
      const health = (params?.health ? String(params.health) : "on-track") as import("../../tasks/initiative-manager.js").InitiativeHealth;
      const authorId = params?.authorId ? String(params.authorId) : "system";
      if (!initiativeId || !content) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "initiativeId and content are required"));
        return;
      }
      const { addInitiativeUpdate } = await import("../../tasks/initiative-manager.js");
      const update = addInitiativeUpdate(root, initiativeId, { content, health, authorId });
      if (!update) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Initiative not found: " + initiativeId));
        return;
      }
      respond(true, { success: true, update, initiativeId }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to add initiative update: " + String(error)));
    }
  },

  // =========================================================================
  // B3: Velocity Trend — 多Sprint 速度趋势分析（对标 Linear Sprint 分析面板）
  // =========================================================================
  "projects.velocityTrend": async ({ params, respond }) => {
    try {
      const projectId = params?.projectId ? String(params.projectId) : "";
      const limitSprints = params?.limit ? Number(params.limit) : 5; // 默认最近 5 个 Sprint
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      if (!projectId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId is required"));
        return;
      }

      const { buildProjectContext, readProjectConfig } = await import("../../utils/project-context.js");
      const ctx = buildProjectContext(projectId, workspaceRoot);
      const config = readProjectConfig(ctx.workspacePath);
      if (!config) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Project config not found for "${projectId}"`));
        return;
      }

      // 收集已完成的 Sprint（从 sprints 或 milestones 中过滤）
      const allSprints = (config.sprints ?? config.milestones ?? []) as Array<Record<string, unknown>>;
      const completedSprints = allSprints
        .filter((s) => s["status"] === "completed" || s["completedAt"])
        .toSorted((a, b) => Number(b["completedAt"] ?? 0) - Number(a["completedAt"] ?? 0))
        .slice(0, limitSprints)
        .toReversed();

      if (completedSprints.length === 0) {
        respond(true, {
          projectId,
          sprints: [],
          velocityTrend: [],
          avgVelocity: 0,
          predictedNextVelocity: 0,
          tip: "No completed sprints found. Velocity trend requires at least 1 completed sprint.",
        }, undefined);
        return;
      }

      // 计算每个 Sprint 的速度（完成任务的 storyPoints 之和）
      const { listTasks } = await import("../../tasks/storage.js");
      const velocityTrend: Array<{ sprintId: string; sprintName: string; completedSP: number; completedTasks: number; completedAt: number }> = [];

      for (const sprint of completedSprints) {
        const sprintId = String(sprint["id"] ?? sprint["sprintId"] ?? "");
        const sprintName = String(sprint["name"] ?? sprint["title"] ?? sprintId);
        const completedAt = Number(sprint["completedAt"] ?? 0);
        const startedAt = Number(sprint["startDate"] ?? sprint["startedAt"] ?? 0);

        // 查询在此 Sprint 期间完成的任务
        const sprintTasks = await listTasks({
          projectId,
          status: "done",
          limit: 1000,
        });

        // 过滤在 sprint 时间段内完成的任务
        const inSprintTasks = sprintTasks.filter((t) => {
          const completedAtT = (t as Record<string, unknown>).completedAt as number | undefined;
          if (!completedAtT) {return false;}
          if (startedAt && completedAtT < startedAt) {return false;}
          if (completedAt && completedAtT > completedAt) {return false;}
          return true;
        });

        const completedSP = inSprintTasks.reduce((sum, t) => sum + (Number((t as Record<string, unknown>).storyPoints) || 1), 0);
        velocityTrend.push({ sprintId, sprintName, completedSP, completedTasks: inSprintTasks.length, completedAt });
      }

      const avgVelocity = velocityTrend.length > 0
        ? Math.round(velocityTrend.reduce((s, v) => s + v.completedSP, 0) / velocityTrend.length * 10) / 10
        : 0;

      // 简单线性预测（加权移动平均，最近两个 Sprint 权重更高）
      let predictedNextVelocity = avgVelocity;
      if (velocityTrend.length >= 2) {
        const last = velocityTrend[velocityTrend.length - 1].completedSP;
        const prev = velocityTrend[velocityTrend.length - 2].completedSP;
        predictedNextVelocity = Math.round((last * 0.6 + prev * 0.3 + avgVelocity * 0.1) * 10) / 10;
      }

      // 趋势方向判断
      const trend = velocityTrend.length >= 2
        ? velocityTrend[velocityTrend.length - 1].completedSP > velocityTrend[velocityTrend.length - 2].completedSP
          ? "improving" : "declining"
        : "stable";

      respond(true, {
        projectId,
        sprintCount: velocityTrend.length,
        velocityTrend,
        avgVelocity,
        predictedNextVelocity,
        trend,
        summary: `Velocity trend (last ${velocityTrend.length} sprints): avg=${avgVelocity} SP, predicted=${predictedNextVelocity} SP, trend=${trend}`,
      }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to compute velocity trend: " + String(error)));
    }
  },

  // =========================================================================
  // B5: 项目健康更新到期检测 — 对标 Linear 2026 对已过期未更新项目发起提醒
  // =========================================================================
  "projects.checkHealthUpdateDue": async ({ params, respond }) => {
    try {
      const workspaceRoot = params?.workspaceRoot ? String(params.workspaceRoot) : undefined;
      const thresholdDays = params?.thresholdDays ? Number(params.thresholdDays) : 7; // 默认 7 天未更新视为过期
      const root = getGroupsWorkspaceRoot(workspaceRoot);
      const fs = await import("fs");
      const path = await import("path");
      const { readProjectConfig } = await import("../../utils/project-context.js");

      const now = Date.now();
      void thresholdDays; // referenced below

      // 扫描工作空间内所有项目目录
      const overdue: Array<{ projectId: string; name?: string; lastHealthUpdateAt?: number; daysSinceUpdate: number }> = [];
      let scannedCount = 0;

      if (fs.existsSync(root)) {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) {continue;}
          const projectId = entry.name;
          const configPath = path.join(root, projectId, "PROJECT_CONFIG.json");
          if (!fs.existsSync(configPath)) {continue;}
          const config = readProjectConfig(path.join(root, projectId));
          if (!config) {continue;}
          // 只检查 active 项目
          const status = config.status ?? "active";
          if (status === "completed" || status === "archived" || status === "cancelled") {continue;}
          scannedCount++;

          const lastHealthAt = (config as Record<string, unknown>).lastHealthUpdateAt as number | undefined
            ?? (config as Record<string, unknown>).progressUpdatedAt as number | undefined;

          const daysSince = lastHealthAt
            ? Math.floor((now - lastHealthAt) / (24 * 60 * 60 * 1000))
            : 999;

          if (daysSince >= thresholdDays) {
            overdue.push({
              projectId,
              name: config.name,
              lastHealthUpdateAt: lastHealthAt,
              daysSinceUpdate: daysSince,
            });
          }
        }
      }

      overdue.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

      respond(true, {
        thresholdDays,
        scannedCount,
        overdueCount: overdue.length,
        overdue,
        summary: overdue.length > 0
          ? `[HEALTH UPDATE OVERDUE] ${overdue.length}/${scannedCount} active projects have not posted a health update in >${thresholdDays} days: ${overdue.slice(0, 3).map((p) => `"${p.name ?? p.projectId}"(${p.daysSinceUpdate}d)`).join(", ")}${overdue.length > 3 ? " ..." : ""}`
          : `All ${scannedCount} active projects are up to date (within ${thresholdDays} days).`,
      }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to check health update due: " + String(error)));
    }
  },
};

