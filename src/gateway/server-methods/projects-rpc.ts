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
      const actualWorkspaceRoot =
        workspaceRoot || process.env.OPENCLAW_GROUPS_ROOT || "H:\\OpenClaw_Workspace\\groups";
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

      const { listAvailableProjects, buildProjectContext } =
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

      respond(true, { success: true, projectId, sprintId, config: existing }, undefined);
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

      if (!existing.objectives) existing.objectives = [];

      const now = Date.now();
      const title = params?.title ? String(params.title) : "";
      if (!title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title is required"));
        return;
      }

      const objectiveId = params?.id ? String(params.id) : `obj_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const existingIdx = existing.objectives.findIndex((o) => o.id === objectiveId);

      const timeframe = ["short", "medium", "long"].includes(String(params?.timeframe))
        ? (String(params!.timeframe) as import("../../utils/project-context.js").ProjectObjective["timeframe"])
        : ("medium" as const);
      const status = ["not-started", "in-progress", "achieved", "missed", "deferred"].includes(String(params?.status))
        ? (String(params!.status) as import("../../utils/project-context.js").ProjectObjective["status"])
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

      if (!existing.timelineMilestones) existing.timelineMilestones = [];

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
      const msType = validTypes.includes(String(params?.type)) ? String(params!.type) as import("../../utils/project-context.js").ProjectMilestoneEntry["type"] : "phase" as const;
      const msStatus = validStatuses.includes(String(params?.status)) ? String(params!.status) as import("../../utils/project-context.js").ProjectMilestoneEntry["status"] : "upcoming" as const;

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
      if (!existing.sprints) existing.sprints = existing.milestones ?? [];

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
      if (params?.objectiveId) sprintWithMeta["objectiveId"] = String(params.objectiveId);
      if (params?.milestoneId) sprintWithMeta["milestoneId"] = String(params.milestoneId);

      if (existingIdx >= 0) {
        existing.sprints[existingIdx] = sprintWithMeta as import("../../utils/project-context.js").ProjectSprint;
      } else {
        existing.sprints.push(sprintWithMeta as import("../../utils/project-context.js").ProjectSprint);
      }

      // 同步到 milestones（向后兼容）
      existing.milestones = existing.sprints;
      existing.progressUpdatedAt = now;

      if (!fs.existsSync(ctx.workspacePath)) fs.mkdirSync(ctx.workspacePath, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

      respond(true, {
        success: true,
        projectId,
        sprint: sprintWithMeta,
        action: existingIdx >= 0 ? "updated" : "created",
        tip: sprint.goal
          ? `Sprint "${title}" 已${existingIdx >= 0 ? "更新" : "创建"}。用 projects.sprint.addTask 向 Sprint 加入任务，准备好后调用 projects.startSprint 启动。`
          : `⚠️ 建议为 Sprint 设置 goal（Sprint目标），让团队清晰知道本轮迭代要达成什么。`,
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

      if (!fs.existsSync(ctx.workspacePath)) fs.mkdirSync(ctx.workspacePath, { recursive: true });
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
};
