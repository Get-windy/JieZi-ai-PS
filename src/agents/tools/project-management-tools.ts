/**
 * Project Management Tools
 *
 * 项目管理相关工具：
 * - project_create: 创建新项目，包括项目工作空间和 PROJECT_CONFIG.json
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";
import { getProjectStatusMeta } from "../../utils/project-context.js";

/**
 * project_create 工具参数 schema
 */
const ProjectCreateToolSchema = Type.Object({
  /** 项目名称（必填） */
  name: Type.String({ minLength: 1, maxLength: 128 }),
  /**
   * 项目负责人 Agent ID（必填）
   * 必须是具体的 agent ID（如 "main"、"coordinator" 等），
   * 禁止使用 "system"，必须是真实存在且有权限的 agent。
   */
  ownerId: Type.String({ minLength: 1 }),
  /** 项目 ID（可选，不传则自动生成） */
  projectId: Type.Optional(Type.String()),
  /** 项目描述（可选） */
  description: Type.Optional(Type.String()),
  /** 项目代码目录路径（可选，完整绝对路径，优先级高于 codeRoot） */
  codeDir: Type.Optional(Type.String()),
  /**
   * 项目代码根目录（可选）。
   * 如果用户在项目管理页面设置了代码根目录，将该值传入，
   * 新项目的 codeDir 将自动计算为 codeRoot\\projectName。
   * 若 codeDir 和 codeRoot 都未提供，工具将返回错误，
   * 提示用户先在项目管理页面设置代码根目录。
   */
  codeRoot: Type.Optional(Type.String()),
  /** 项目工作空间根目录（可选，默认 H:\\OpenClaw_Workspace\\groups） */
  workspaceRoot: Type.Optional(Type.String()),
  /**
   * 是否同时创建项目群（默认 false）
   * 必须明确传 true 且在用户/上级明确要求时才创建，
   * 不得在没有明确指令的情况下自动创建。
   */
  createGroup: Type.Optional(Type.Boolean()),
  /**
   * 用户明确授权的确认令牌。
   * 调用此工具前，必须先向用户展示将要创建的项目信息，
   * 并要求用户回复 "CONFIRM_CREATE_PROJECT_<projectId>" 作为确认。
   * 将用户的原始确认文本原样填入此字段。
   */
  userConfirmation: Type.String({ minLength: 1 }),
});

/**
 * 创建项目创建工具
 */
export function createProjectCreateTool(): AnyAgentTool {
  return {
    label: "Project Create",
    name: "project_create",
    description:
      "Create a new project with workspace and configuration. " +
      "THIS TOOL REQUIRES EXPLICIT USER CONFIRMATION BEFORE EXECUTION. " +
      "BEFORE calling this tool you MUST: " +
      "1) Show the user a clear summary of the project to be created (name, projectId, codeDir, ownerId, whether to create group). " +
      "2) Ask the user to confirm by explicitly typing \"CONFIRM_CREATE_PROJECT_<projectId>\". " +
      "3) Pass the user's exact confirmation text in the userConfirmation field. " +
      "DO NOT create projects silently or based on vague instructions. " +
      "REQUIRED: ownerId MUST be a real agent ID (e.g. 'main') — NEVER use 'system'. " +
      "createGroup defaults to FALSE.",
    parameters: ProjectCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const name = readStringParam(params, "name", { required: true });
      const ownerId = readStringParam(params, "ownerId", { required: true });
      const projectId = readStringParam(params, "projectId"); // 可选，自动生成
      const description = readStringParam(params, "description");
      const codeDir = readStringParam(params, "codeDir");
      const codeRoot = readStringParam(params, "codeRoot");
      const workspaceRoot = readStringParam(params, "workspaceRoot");
      const createGroup = typeof params.createGroup === "boolean" ? params.createGroup : false; // 默认不创建群组
      const userConfirmation = readStringParam(params, "userConfirmation", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      // 拦截非法 ownerId
      if (!ownerId || ownerId.toLowerCase() === "system") {
        return jsonResult({
          success: false,
          error:
            '禁止使用 "system" 作为项目负责人。' +
            '必须提供真实的 agent ID（如 "main"\u3001"coordinator" 等）。' +
            "请先确认项目负责人后再调用此工具。",
        });
      }

      // 先确定 finalProjectId（令牌校验需要它）
      const finalProjectId =
        projectId || `project-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

      // 强制校验用户确认令牌
      const expectedToken = `CONFIRM_CREATE_PROJECT_${finalProjectId}`;
      if (!userConfirmation.includes(expectedToken)) {
        const previewCodeDir = codeDir || (codeRoot ? `${codeRoot.replace(/[\/\\]+$/, "")}\\${name}` : "未设置");
        return jsonResult({
          success: false,
          blocked: true,
          pendingConfirmation: true,
          projectPreview: {
            projectId: finalProjectId,
            name,
            description,
            ownerId,
            codeDir: previewCodeDir,
            createGroup,
          },
          error:
            `操作被阻止：未收到有效的用户授权确认。` +
            `\n\n请向用户展示以下将要创建的项目信息，并等待确认：` +
            `\n- 项目名称：${name}` +
            `\n- 项目 ID：${finalProjectId}` +
            `\n- 负责人：${ownerId}` +
            `\n- 描述：${description || '无'}` +
            `\n- 代码目录：${previewCodeDir}` +
            `\n- 创建项目群：${createGroup ? '是' : '否'}` +
            `\n\n请用户回复以下确认令牌：\n  ${expectedToken}` +
            `\n\n收到确认后，将用户原始回复文本填入 userConfirmation 字段再次调用。`,
          requiredConfirmationToken: expectedToken,
        });
      }

      try {
        // codeDir 优先级：显式传入的 codeDir > codeRoot + name 拼接 > 报错
        let finalCodeDir: string | undefined;
        if (codeDir) {
          finalCodeDir = codeDir;
        } else if (codeRoot) {
          // 拼接：去掉末尾斜杠后加项目名称
          const root = codeRoot.replace(/[\\/]+$/, "");
          finalCodeDir = `${root}\\${name}`;
        } else {
          // 既没有 codeDir 也没有 codeRoot，拒绝创建
          return jsonResult({
            success: false,
            error:
              "未设置项目代码目录根路径。" +
              "请在项目管理页面顶部设置「项目代码根目录」（如 I:\\），" +
              "新项目的代码目录将自动创建为 <根目录>\\<项目名称>。" +
              "或者在调用此工具时直接传入 codeDir（完整路径）。",
          });
        }

        // 计算工作空间路径 (从配置、环境变量或默认值)
        const actualWorkspaceRoot =
          workspaceRoot || process.env.OPENCLAW_GROUPS_ROOT || "H:\\OpenClaw_Workspace\\groups";
        const workspacePath = `${actualWorkspaceRoot}\\${finalProjectId}`;

        // 调用后端创建项目 (如果后端有 project.create RPC)
        // 注意：目前可能没有 project.create RPC，我们直接返回配置信息
        // 让 Agent 手动创建目录和配置文件
        let response;
        try {
          response = await callGatewayTool("project.create", gatewayOpts, {
            projectId: finalProjectId,
            name,
            description,
            codeDir: finalCodeDir,
            workspacePath,
            ownerId,
          });
        } catch {
          // 如果后端不支持 project.create，返回配置信息让 Agent 手动创建
          response = {
            projectId: finalProjectId,
            name,
            description,
            codeDir: finalCodeDir,
            workspacePath,
            ownerId,
          };
        }

        // 自动创建关联的项目群（仅当 createGroup === true 且 ownerId 已确认时）
        let groupInfo = null;
        if (createGroup) {
          try {
            const groupName = `${name} 项目组`;
            const groupResponse = await callGatewayTool("groups.create", gatewayOpts, {
              id: `group-${finalProjectId}`,
              name: groupName,
              ownerId: ownerId, // 已在前面验证，此处必定是真实 agent ID
              description: `项目「${name}」的专属群组，负责项目的协作和沟通`,
              initialMembers: [],
              isPublic: false,
              projectId: finalProjectId,
              workspacePath: workspacePath,
            });

            groupInfo = {
              groupId: (groupResponse.id as string | undefined) ?? "",
              name: (groupResponse.name as string | undefined) ?? "",
              projectId: finalProjectId,
              workspacePath: workspacePath,
            };
          } catch (groupError) {
            // 如果群组创建失败，记录警告但不影响项目创建
            console.warn(
              `Failed to create project group for project ${finalProjectId}:`,
              groupError,
            );
          }
        }

        // 生成 PROJECT_CONFIG.json 内容
        const projectConfig = {
          projectId: finalProjectId,
          workspacePath,
          codeDir: finalCodeDir,
          docsDir: `${workspacePath}\\docs`,
          requirementsDir: `${workspacePath}\\requirements`,
          qaDir: `${workspacePath}\\qa`,
          testsDir: `${workspacePath}\\tests`,
        };

        // 生成创建项目的详细指令
        const instructions = [
          `✅ Project "${name}" created successfully!`,
          ``,
          `📋 Project Configuration:`,
          `- Project ID: ${finalProjectId}`,
          `- Owner: ${ownerId}`,
          `- Workspace: ${workspacePath}`,
          `- Code Directory: ${finalCodeDir ?? ""}`,
          ``,
        ];

        // 如果创建了项目群，添加群组信息
        if (groupInfo) {
          instructions.push(
            `👥 Project Group Created:`,
            `- Group ID: ${groupInfo.groupId}`,
            `- Group Name: ${groupInfo.name}`,
            `- Workspace: ${groupInfo.workspacePath} (与项目共享)`,
            ``,
            `💡 The group is now a project group with shared workspace synchronized with the project.`,
            ``,
          );
        }

        const nextSteps = [
          `🔧 Next Steps:`,
          `1. Create project workspace directory:`,
          `   \`\`\`bash`,
          `   mkdir "${workspacePath}"`,
          `   \`\`\``,
          ``,
          `2. Create PROJECT_CONFIG.json in workspace:`,
          `   \`\`\`json`,
          JSON.stringify(projectConfig, null, 2),
          `   \`\`\``,
          ``,
          `3. Initialize project structure:`,
          `   \`\`\`bash`,
          `   cd "${workspacePath}"`,
          `   mkdir shared history meeting-notes decisions docs requirements qa tests`,
          `   \`\`\``,
          ``,
          `4. Create SHARED_MEMORY.md:`,
          `   \`\`\`bash`,
          `   echo "# ${name} Shared Memory" > SHARED_MEMORY.md`,
          `   echo "" >> SHARED_MEMORY.md`,
          `   echo "## Project Introduction" >> SHARED_MEMORY.md`,
          `   echo "(Add project description here)" >> SHARED_MEMORY.md`,
          `   \`\`\``,
          ``,
          `5. Create code directory if not exists:`,
          `   \`\`\`bash`,
          `   if not exist "${finalCodeDir}" mkdir "${finalCodeDir}"`,
          `   \`\`\``,
        ];

        instructions.push(...nextSteps);

        const instructionsText = instructions.join("\n");

        return jsonResult({
          success: true,
          message: instructionsText,
          project: {
            projectId: finalProjectId,
            name: response.name || name,
            workspacePath,
            codeDir: finalCodeDir,
            config: projectConfig,
          },
          group: groupInfo, // 返回关联的群组信息
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create project: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_list 工具
 * 列出所有项目，返回 projectId、名称、状态、状态标签、允许工作类型、推荐角色、进度、负责人和成员列表等完整信息。
 */
export function createProjectListTool(): AnyAgentTool {
  return {
    label: "Project List",
    name: "project_list",
    description:
      "List all projects with complete info: IDs, names, status (Chinese label), progress, " +
      "allowedWork (what tasks fit this phase), recommendedRoles (which agent roles should work on it), " +
      "owner and project group members. " +
      "ALWAYS call this tool first before assigning tasks to any agent, " +
      "to get real project IDs, current phase, and member lists. " +
      "NEVER hardcode project IDs or make up project names.",
    parameters: {},
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const response = await callGatewayTool("projects.list", gatewayOpts, {});
        const projects = (response.projects ?? []) as Array<Record<string, unknown>>;
        // 为每个项目补充状态元信息（中文标签 + 允许工作 + 推荐角色）
        const enriched = projects.map((p) => {
          const meta = getProjectStatusMeta(p.status as string | undefined);
          const members: string[] = [];
          if (Array.isArray(p.groups)) {
            for (const g of p.groups as Array<Record<string, unknown>>) {
              if (Array.isArray(g.members)) {
                for (const m of g.members as Array<Record<string, unknown>>) {
                  const mid = String(
                    (m.agentId ?? m.id ?? "") as string | number | boolean | null | undefined,
                  );
                  if (mid && !members.includes(mid)) {
                    members.push(mid);
                  }
                }
              }
            }
          }
          const ownerIdStr = String(p.ownerId as string | number | boolean | null | undefined);
          if (p.ownerId && !members.includes(ownerIdStr)) {
            members.unshift(ownerIdStr);
          }
          return {
            ...p,
            statusLabel: meta.label,
            isActive: meta.isActive,
            allowedWork: meta.allowedWork,
            recommendedRoles: meta.recommendedRoles,
            members,
          };
        });
        return jsonResult({
          success: true,
          projects: enriched,
          total: enriched.length,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_update_status 工具参数 schema
 */
const ProjectUpdateStatusSchema = Type.Object({
  /** 项目 ID（必填） */
  projectId: Type.String({ minLength: 1 }),
  /** 新状态 */
  status: Type.Union([
    Type.Literal("requirements"),
    Type.Literal("design"),
    Type.Literal("planning"),
    Type.Literal("development"),
    Type.Literal("testing"),
    Type.Literal("review"),
    Type.Literal("active"),
    Type.Literal("dev_done"),
    Type.Literal("operating"),
    Type.Literal("maintenance"),
    Type.Literal("paused"),
    Type.Literal("completed"),
    Type.Literal("deprecated"),
    Type.Literal("cancelled"),
  ]),
  /** 状态变更备注（可选，建议填写原因，会写入项目共享记忆） */
  notes: Type.Optional(Type.String({ maxLength: 500 })),
  /** 项目整体进度 0-100（可选） */
  progress: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

/**
 * project_update_status 工具
 * 更新项目生命周期状态，并将状态变更记录到项目共享记忆。
 */
export function createProjectUpdateStatusTool(): AnyAgentTool {
  return {
    label: "Project Update Status",
    name: "project_update_status",
    description:
      "Update a project's lifecycle status (e.g. requirements→design→development→testing→completed). " +
      "Valid statuses: requirements, design, planning, development, testing, review, active, dev_done, operating, maintenance, paused, completed, deprecated, cancelled. " +
      "Always provide 'notes' to explain why the status changed — this is written to project shared memory as a progress log. " +
      "Call this when a project phase transition happens so coordinators and all team members know the current phase.",
    parameters: ProjectUpdateStatusSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "projectId", { required: true });
      const status = readStringParam(params, "status", { required: true });
      const notes = readStringParam(params, "notes");
      const progress = typeof params.progress === "number" ? params.progress : undefined;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        // 1. 更新 PROJECT_CONFIG.json 中的状态和进度
        await callGatewayTool("projects.updateProgress", gatewayOpts, {
          projectId,
          status,
          progress,
          progressNotes: notes,
        });
        // 2. 将状态变更写入项目共享记忆（全队可见）
        const meta = getProjectStatusMeta(status);
        const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const memoryContent = [
          `[${timestamp}] 项目状态变更为「${meta.label}」`,
          notes ? `原因：${notes}` : null,
          `当前阶段工作方向：${meta.allowedWork.join("、") || "无（项目已笯止）"}`,
        ]
          .filter(Boolean)
          .join("\n");
        await callGatewayTool("memory.project.save", gatewayOpts, {
          content: memoryContent,
          section: "项目状态变更日志",
          projectId,
        });
        return jsonResult({
          success: true,
          projectId,
          status,
          statusLabel: meta.label,
          allowedWork: meta.allowedWork,
          recommendedRoles: meta.recommendedRoles,
          isActive: meta.isActive,
          message: `项目 [${projectId}] 状态已更新为「${meta.label}」，已记录到项目共享记忆。`,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update project status: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}


/**
 * project_roadmap_view 工具
 *
 * 这是 AI 团队"看懂地图"的核心工具。
 * 一键返回项目完整路线图视图：战略目标 → 里程碑 → Sprint → 进度
 * 让 AI 在开始工作前就知道：我在做什么、为什么做、做到哪一步了。
 */
export function createProjectRoadmapViewTool(): AnyAgentTool {
  return {
    label: "Project Roadmap View",
    name: "project_roadmap_view",
    description:
      "Get the complete roadmap for a project: strategic objectives (short/medium/long term), " +
      "timeline milestones, active Sprint, and overall progress. " +
      "ALWAYS call this before starting work on a project to understand: " +
      "(1) What are the current goals? (2) What phase are we in? (3) What should I work on? " +
      "This is the most important tool for aligning AI work with project direction.",
    parameters: Type.Object({
      projectId: Type.String({ description: "The project ID to get roadmap for" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      if (!projectId) {
        return jsonResult({ success: false, error: "projectId is required" });
      }
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        // 获取完整项目信息
        const projectData = await callGatewayTool("projects.get", gatewayOpts, { projectId }) as Record<string, unknown>;

        const { buildActiveObjectivesSummary, formatObjectivesSummaryForPrompt, getProjectStatusMeta } = await import("../../utils/project-context.js");

        const summary = buildActiveObjectivesSummary(projectId);
        const meta = getProjectStatusMeta(projectData?.status as string | undefined);

        // 构建路线图视图
        const roadmap = {
          projectId,
          projectName: String(projectData?.name ?? projectId),
          currentPhase: projectData?.status,
          currentPhaseLabel: meta.label,
          allowedWorkTypes: meta.allowedWork,
          isActive: meta.isActive,
          // 目标层
          objectives: (projectData?.objectives as unknown[]) ?? [],
          objectivesSummary: summary ? formatObjectivesSummaryForPrompt(summary) : null,
          // 里程碑时间轴
          timelineMilestones: (projectData?.timelineMilestones as unknown[]) ?? [],
          // DoD 完成门禁
          completionGate: projectData?.completionGate ?? null,
          // 路线图字符串（方便直接注入提示）
          formattedRoadmap: summary ? formatObjectivesSummaryForPrompt(summary, 80) : null,
        };

        // 构建 AI 可直接阅读的纯文本路线图
        const lines: string[] = [
          `# 🗺️ 项目路线图：${roadmap.projectName}`,
          `当前阶段：${roadmap.currentPhaseLabel}${!roadmap.isActive ? " ⚠️（已暂停/终止）" : ""}`,
          `本阶段工作方向：${roadmap.allowedWorkTypes.join("、") || "（暂停，不分配新任务）"}`,
          "",
        ];

        if (summary?.activeSprint) {
          const s = summary.activeSprint;
          lines.push(
            `## 当前 Sprint：${s.title}`,
            s.goal ? `Sprint目标：${s.goal}` : "",
            `进度：${s.progress}% (${s.doneCount}/${s.taskCount} 任务完成)`,
            s.endDate ? `截止：${new Date(s.endDate).toLocaleDateString("zh-CN")}` : "",
            "",
          );
        }

        const allObjs = (projectData?.objectives as Array<Record<string, unknown>>) ?? [];
        if (allObjs.length > 0) {
          lines.push("## 战略目标");
          const timeframeLabel: Record<string, string> = { short: "短期（2-4周）", medium: "中期（1-3月）", long: "长期（3月+）" };
          const statusEmoji: Record<string, string> = { "not-started": "⬜", "in-progress": "🔥", achieved: "✅", missed: "❌", deferred: "⏸️" };
          for (const o of allObjs) {
            const tf = String(o.timeframe ?? "medium");
            const st = String(o.status ?? "not-started");
            lines.push(`${statusEmoji[st] ?? "⬜"} [${timeframeLabel[tf] ?? tf}] **${String(o.title ?? "")}**`);
            if (o.description) lines.push(`   ${String(o.description)}`);
          }
          lines.push("");
        }

        const milestones = (projectData?.timelineMilestones as Array<Record<string, unknown>>) ?? [];
        if (milestones.length > 0) {
          lines.push("## 时间轴里程碑");
          const msStatusEmoji: Record<string, string> = { upcoming: "📅", "in-progress": "🔄", completed: "✅", missed: "❌", cancelled: "⛔" };
          for (const m of milestones) {
            const dateStr = m.targetDate ? ` | 预计 ${new Date(Number(m.targetDate)).toLocaleDateString("zh-CN")}` : "";
            lines.push(`${msStatusEmoji[String(m.status ?? "upcoming")] ?? "📅"} ${String(m.title ?? "")}${dateStr}`);
          }
          lines.push("");
        }

        const gate = projectData?.completionGate as Record<string, unknown> | undefined;
        if (gate?.criteria && Array.isArray(gate.criteria)) {
          const total = gate.criteria.length;
          const done = (gate.criteria as Array<Record<string, unknown>>).filter((c) => c.satisfied).length;
          lines.push(`## DoD 完成门禁：${done}/${total} 已满足 (${total > 0 ? Math.round((done / total) * 100) : 0}%)`);
          if (gate.scopeFrozen) lines.push("⛔ 范围已冻结（项目已完成/取消）");
          lines.push("");
        }

        lines.push(
          "---",
          "**使用指南**：",
          "- 创建任务前确认服务于哪个目标（设置 objectiveId）",
          "- Sprint 任务优先处理，避免开发与当前目标无关的远期功能",
          "- 里程碑是阶段性交付物检查点，完成后更新其状态",
        );

        return jsonResult({
          success: true,
          projectId,
          roadmap,
          formattedText: lines.filter((l) => l !== null && l !== undefined).join("\n"),
          actionableAdvice: {
            currentFocus: summary?.shortTermObjectives.map((o) => o.title) ?? [],
            nextMilestone: summary?.nextMilestone?.title,
            phaseAllowedWork: roadmap.allowedWorkTypes,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to get roadmap: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_objective_upsert 工具
 *
 * 让 AI 能够直接创建和更新项目目标（短期/中期/长期 OKR）。
 * 这是"AI理解项目方向"的写入侧：AI 可以在接手项目时，
 * 先用此工具明确项目的三层目标，再开始任务分配。
 */
export function createProjectObjectiveUpsertTool(): AnyAgentTool {
  return {
    label: "Project Objective Upsert",
    name: "project_objective_upsert",
    description:
      "Create or update a strategic objective for a project (short/medium/long term OKR). " +
      "Use this to define WHAT the project aims to achieve before assigning tasks. " +
      "REQUIRED: projectId, title, timeframe (short=2-4 weeks / medium=1-3 months / long=3+ months). " +
      "BEST PRACTICE: Define 1-2 short-term, 1-2 medium-term, and 1 long-term objectives when starting a project. " +
      "Then link all tasks to an objectiveId so the team knows WHY each task is done.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      title: Type.String({ description: "[REQUIRED] Objective title (clear, outcome-focused)" }),
      timeframe: Type.Optional(Type.Union([
        Type.Literal("short"),
        Type.Literal("medium"),
        Type.Literal("long"),
      ], { description: "short=2-4 weeks | medium=1-3 months | long=3+ months" })),
      description: Type.Optional(Type.String({ description: "Why this objective matters" })),
      status: Type.Optional(Type.Union([
        Type.Literal("not-started"),
        Type.Literal("in-progress"),
        Type.Literal("achieved"),
        Type.Literal("missed"),
        Type.Literal("deferred"),
      ], { description: "Objective status (default: not-started)" })),
      targetDate: Type.Optional(Type.Number({ description: "Target completion timestamp (Unix ms)" })),
      id: Type.Optional(Type.String({ description: "Objective ID for update (omit for create)" })),
      keyResults: Type.Optional(Type.Array(Type.Unknown(), { description: "Measurable key results (OKR). Each: { id, description, target?, current?, unit?, achieved }" })),
      note: Type.Optional(Type.String({ description: "Update note" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const title = String(params.title ?? "");
      if (!projectId || !title) {
        return jsonResult({ success: false, error: "projectId and title are required" });
      }
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("projects.objective.upsert", gatewayOpts, {
          projectId,
          id: params.id ? String(params.id) : undefined,
          title,
          description: params.description ? String(params.description) : undefined,
          timeframe: params.timeframe ?? "medium",
          status: params.status ?? "not-started",
          targetDate: params.targetDate ? Number(params.targetDate) : undefined,
          keyResults: params.keyResults,
          note: params.note ? String(params.note) : undefined,
        });
        return jsonResult({
          success: true,
          ...(result as Record<string, unknown>),
          tip: "Objective saved. Link tasks to this objective via objectiveId to track alignment.",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to upsert objective: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_milestone_upsert 工具
 *
 * 管理项目时间轴里程碑（Timeline Milestone）。
 * 里程碑是路线图上的重要节点——一个阶段性交付物或关键检查点。
 */
export function createProjectMilestoneUpsertTool(): AnyAgentTool {
  return {
    label: "Project Milestone Upsert",
    name: "project_milestone_upsert",
    description:
      "Create or update a timeline milestone for a project roadmap. " +
      "A milestone represents a key deliverable or phase checkpoint, linked to an objective. " +
      "Types: release (版本发布) | phase (阶段完成) | checkpoint (检查点) | deliverable (可交付物) | other. " +
      "Best practice: create milestones for each major phase, link them to objectives via objectiveId.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      title: Type.String({ description: "[REQUIRED] Milestone title" }),
      type: Type.Optional(Type.Union([
        Type.Literal("release"),
        Type.Literal("phase"),
        Type.Literal("checkpoint"),
        Type.Literal("deliverable"),
        Type.Literal("other"),
      ], { description: "Milestone type" })),
      description: Type.Optional(Type.String({ description: "What this milestone represents" })),
      targetDate: Type.Optional(Type.Number({ description: "Target date (Unix ms)" })),
      objectiveId: Type.Optional(Type.String({ description: "Linked objective ID" })),
      sprintIds: Type.Optional(Type.Array(Type.String(), { description: "Linked Sprint IDs" })),
      status: Type.Optional(Type.Union([
        Type.Literal("upcoming"),
        Type.Literal("in-progress"),
        Type.Literal("completed"),
        Type.Literal("missed"),
        Type.Literal("cancelled"),
      ])),
      id: Type.Optional(Type.String({ description: "Milestone ID for update" })),
      ownerId: Type.Optional(Type.String({ description: "Responsible agent ID" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const title = String(params.title ?? "");
      if (!projectId || !title) {
        return jsonResult({ success: false, error: "projectId and title are required" });
      }
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("projects.milestone.upsert", gatewayOpts, {
          projectId,
          id: params.id ? String(params.id) : undefined,
          title,
          description: params.description ? String(params.description) : undefined,
          type: params.type ?? "phase",
          status: params.status ?? "upcoming",
          targetDate: params.targetDate ? Number(params.targetDate) : undefined,
          objectiveId: params.objectiveId ? String(params.objectiveId) : undefined,
          sprintIds: params.sprintIds,
          ownerId: params.ownerId ? String(params.ownerId) : undefined,
        });
        return jsonResult({ success: true, ...(result as Record<string, unknown>) });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to upsert milestone: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

// ============================================================================
// Sprint 管理工具组
//
// AI 团队工作周期管理闭环：
//   project_sprint_upsert  — 创建/更新 Sprint（包含目标、时间范围、关联目标）
//   project_sprint_add_task — 向 Sprint 加入任务并同步快照
//   project_sprint_start    — 启动 Sprint（进入 active 状态）
//   project_sprint_complete — 完成 Sprint，未完成任务可进入 Backlog 或下个 Sprint
// ============================================================================

/**
 * project_sprint_upsert 工具
 *
 * 创建或更新一个 Sprint。
 * 与目标对齐的闭环：
 *   1. 先定义项目目标（project_objective_upsert）
 *   2. 建立里程碑时间轴（project_milestone_upsert）
 *   3. 创建 Sprint 并关联目标 / 里程碑（此工具）
 *   4. 加入任务（project_sprint_add_task）
 *   5. 启动 Sprint（project_sprint_start）
 */
export function createProjectSprintUpsertTool(): AnyAgentTool {
  return {
    label: "Project Sprint Upsert",
    name: "project_sprint_upsert",
    description:
      "Create or update a Sprint for a project. " +
      "A Sprint is a time-boxed iteration (usually 1-2 weeks) with a clear goal. " +
      "REQUIRED: projectId, title. RECOMMENDED: goal (Sprint Goal, the single most important outcome), " +
      "objectiveId (link to strategic objective), endDate (deadline). " +
      "WORKFLOW: 1) Define objectives first (project_objective_upsert), " +
      "2) Create milestones (project_milestone_upsert), 3) Create Sprint linked to objective/milestone (this tool), " +
      "4) Add tasks (project_sprint_add_task), 5) Start Sprint (project_sprint_start).",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      title: Type.String({ description: "[REQUIRED] Sprint title (e.g. Sprint 1: 基础架构搭建)" }),
      goal: Type.Optional(Type.String({ description: "[STRONGLY RECOMMENDED] Sprint Goal — the single most important outcome this Sprint delivers." })),
      objectiveId: Type.Optional(Type.String({ description: "Link to strategic objective ID (for OKR alignment)" })),
      milestoneId: Type.Optional(Type.String({ description: "Link to milestone ID" })),
      startDate: Type.Optional(Type.Number({ description: "Start date (Unix ms)" })),
      endDate: Type.Optional(Type.Number({ description: "End date / deadline (Unix ms)" })),
      order: Type.Optional(Type.Number({ description: "Sprint order number (auto-assigned if omitted)" })),
      status: Type.Optional(Type.Union([
        Type.Literal("planning"),
        Type.Literal("active"),
        Type.Literal("completed"),
        Type.Literal("cancelled"),
      ], { description: "Sprint status (default: planning)" })),
      id: Type.Optional(Type.String({ description: "Sprint ID for update (omit for create)" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const title = String(params.title ?? "");
      if (!projectId || !title) {
        return jsonResult({ success: false, error: "projectId and title are required" });
      }
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("projects.sprint.upsert", gatewayOpts, {
          projectId,
          id: params.id ? String(params.id) : undefined,
          title,
          goal: params.goal ? String(params.goal) : undefined,
          objectiveId: params.objectiveId ? String(params.objectiveId) : undefined,
          milestoneId: params.milestoneId ? String(params.milestoneId) : undefined,
          startDate: params.startDate ? Number(params.startDate) : undefined,
          endDate: params.endDate ? Number(params.endDate) : undefined,
          order: params.order ? Number(params.order) : undefined,
          status: params.status ?? "planning",
        });
        return jsonResult({ success: true, ...(result as Record<string, unknown>) });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to upsert sprint: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_sprint_add_task 工具
 *
 * 向 Sprint 中加入、移除或更新任务快照。
 * Sprint 内的任务快照用于进度计算，权威状态仍在 SQLite task 表。
 */
export function createProjectSprintAddTaskTool(): AnyAgentTool {
  return {
    label: "Project Sprint Add Task",
    name: "project_sprint_add_task",
    description:
      "Add, remove, or update a task snapshot in a Sprint. " +
      "Sprint task snapshots are used for progress calculation (burndown). " +
      "The authoritative task status is still in the task system (task_update). " +
      "action: 'add' (default) | 'remove' | 'update' (sync status snapshot). " +
      "REQUIRED for add: projectId, sprintId, taskId, title. " +
      "Best practice: link tasks to objectiveId when adding to Sprint.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      sprintId: Type.String({ description: "[REQUIRED] Sprint ID" }),
      taskId: Type.String({ description: "[REQUIRED] Task ID" }),
      action: Type.Optional(Type.Union([
        Type.Literal("add"),
        Type.Literal("remove"),
        Type.Literal("update"),
      ], { description: "Action (default: add)" })),
      title: Type.Optional(Type.String({ description: "Task title (required for add)" })),
      status: Type.Optional(Type.String({ description: "Task status for snapshot (todo/in-progress/done/cancelled)" })),
      storyPoints: Type.Optional(Type.Number({ description: "Story points (Fibonacci: 1,2,3,5,8,13)" })),
      objectiveId: Type.Optional(Type.String({ description: "Link to objective ID" })),
      priority: Type.Optional(Type.String({ description: "Priority (low/medium/high/urgent)" })),
      taskType: Type.Optional(Type.String({ description: "Task type (feature/bugfix/research/etc.)" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const sprintId = String(params.sprintId ?? "");
      const taskId = String(params.taskId ?? "");
      if (!projectId || !sprintId || !taskId) {
        return jsonResult({ success: false, error: "projectId, sprintId, and taskId are required" });
      }
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("projects.sprint.addTask", gatewayOpts, {
          projectId, sprintId, taskId,
          action: params.action ?? "add",
          title: params.title ? String(params.title) : taskId,
          status: params.status ? String(params.status) : undefined,
          storyPoints: params.storyPoints ? Number(params.storyPoints) : undefined,
          objectiveId: params.objectiveId ? String(params.objectiveId) : undefined,
          priority: params.priority ? String(params.priority) : undefined,
          taskType: params.taskType ? String(params.taskType) : undefined,
        });
        return jsonResult({ success: true, ...(result as Record<string, unknown>) });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update sprint task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_sprint_start 工具
 *
 * 启动一个 Sprint—将其状态改为 active。
 * 开始前确认 Sprint 已加入足够任务且 goal 清晰。
 */
export function createProjectSprintStartTool(): AnyAgentTool {
  return {
    label: "Project Sprint Start",
    name: "project_sprint_start",
    description:
      "Start a Sprint (set status to active). " +
      "Before starting: confirm the Sprint has a clear goal and enough tasks loaded. " +
      "Only one Sprint should be active at a time per project (recommended). " +
      "REQUIRED: projectId, sprintId.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      sprintId: Type.String({ description: "[REQUIRED] Sprint ID to start" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const sprintId = String(params.sprintId ?? "");
      if (!projectId || !sprintId) {
        return jsonResult({ success: false, error: "projectId and sprintId are required" });
      }
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("projects.startSprint", gatewayOpts, { projectId, sprintId });
        return jsonResult({ success: true, ...(result as Record<string, unknown>), tip: "已启动 Sprint。团队成员应优先处理 Sprint 内任务，完成后调用 project_sprint_complete 完结本轮迭代。" });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to start sprint: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_sprint_complete 工具
 *
 * 完成一个 Sprint。未完成任务可指定移入 Backlog 或下个 Sprint。
 */
export function createProjectSprintCompleteTool(): AnyAgentTool {
  return {
    label: "Project Sprint Complete",
    name: "project_sprint_complete",
    description:
      "Complete a Sprint. Calculates velocity (story points done). " +
      "Unfinished tasks can be moved to: 'backlog' (default) or 'next_sprint'. " +
      "After completing: hold a retrospective, update objective progress, then plan the next Sprint. " +
      "REQUIRED: projectId, sprintId.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      sprintId: Type.String({ description: "[REQUIRED] Sprint ID to complete" }),
      unfinishedAction: Type.Optional(Type.Union([
        Type.Literal("backlog"),
        Type.Literal("next_sprint"),
      ], { description: "Where to move unfinished tasks (default: backlog)" })),
      retrospective: Type.Optional(Type.String({ description: "Sprint retrospective notes" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const sprintId = String(params.sprintId ?? "");
      if (!projectId || !sprintId) {
        return jsonResult({ success: false, error: "projectId and sprintId are required" });
      }
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("projects.completeSprint", gatewayOpts, {
          projectId,
          sprintId,
          unfinishedAction: params.unfinishedAction ?? "backlog",
          retrospective: params.retrospective ? String(params.retrospective) : undefined,
        });
        return jsonResult({
          success: true,
          ...(result as Record<string, unknown>),
          tip: "本轮 Sprint 已完成。建议：回顾目标达成情况、更新 objective 状态，再谄划下一个 Sprint。",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to complete sprint: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

// ============================================================================
// project_decompose — 目标分解向导工具
//
// 核心设计：不是 AI 自动创建一切，而是生成一份「可执行分解方案」，
// 让 coordinator 审阅后再逐步创建目标/里程碑/Sprint。
// 这可防止【AI 盲目自动生成大量无为の目标结构】。
// ============================================================================

/**
 * project_decompose 工具
 *
 * 将宏观项目描述分解为可执行的路线图结构。
 * 还可用于对存在的项目进行【到位分析】：读取现有目标/里程碑/Sprint，
 * 读取尊重任务状态，详心评估当前进度与缺口。
 *
 * 输出是一份结构化的「分解布局方案」，包含：
 * - 建议的短/中/长期目标
 * - 对应的里程碑
 * - 每个里程碑对应的 Sprint 建议
 * - 每个 Sprint 的核心技能清单（Epic 级）
 */
export function createProjectDecomposeTool(): AnyAgentTool {
  return {
    label: "Project Decompose",
    name: "project_decompose",
    description:
      "Analyze a project and generate a structured decomposition plan: " +
      "strategic objectives (short/medium/long) → milestones → Sprints → Epic-level feature list. " +
      "If the project already has objectives/sprints, this tool reads existing data and produces a " +
      "gap analysis + recommended next actions. " +
      "OUTPUT: A ready-to-execute decomposition plan. Review it, then create objectives/milestones/sprints " +
      "using the respective upsert tools. " +
      "USE WHEN: Starting a new project, re-planning after scope change, or when the team feels lost about direction.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID to decompose" }),
      context: Type.Optional(Type.String({ description: "Additional context about the project (what it is, target users, constraints)" })),
      focusArea: Type.Optional(Type.Union([
        Type.Literal("full"),
        Type.Literal("short_term"),
        Type.Literal("next_sprint"),
        Type.Literal("gap_analysis"),
      ], { description: "What to focus on: full (full roadmap), short_term (next 2-4 weeks), next_sprint, gap_analysis" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      if (!projectId) {
        return jsonResult({ success: false, error: "projectId is required" });
      }
      const focusArea = String(params.focusArea ?? "full");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 读取现有项目状态
        const projectData = await callGatewayTool("projects.get", gatewayOpts, { projectId }) as Record<string, unknown>;
        const { buildActiveObjectivesSummary, getProjectStatusMeta } = await import("../../utils/project-context.js");
        const summary = buildActiveObjectivesSummary(projectId);
        const meta = getProjectStatusMeta(projectData?.status as string | undefined);

        const projectName = String(projectData?.name ?? projectId);
        const currentPhase = meta.label;
        const allObjectives = (projectData?.objectives as Array<Record<string, unknown>>) ?? [];
        const milestones = (projectData?.timelineMilestones as Array<Record<string, unknown>>) ?? [];
        const sprints = summary?.activeSprint;

        // 生成分解向导文本
        const plan: string[] = [
          `# 📀 项目分解方案：${projectName}`,
          `当前阶段：${currentPhase} | 分解靠点：${focusArea}`,
          ``,
        ];

        // ① 现状评估
        plan.push("## 一、项目现状评估");
        if (allObjectives.length === 0) {
          plan.push("⚠️ 未定义任何战略目标——团队无法知道工作服务于什么。【第一优先级：定义目标】");
        } else {
          plan.push(`✅ 已有 ${allObjectives.length} 个战略目标`);
        }
        if (milestones.length === 0) {
          plan.push("⚠️ 未定义里程碑——没有干系时间节点，团队不知道何时交付什么。");
        } else {
          plan.push(`✅ 已有 ${milestones.length} 个里程碑`);
        }
        if (!sprints) {
          plan.push("⚠️ 没有进行中的 Sprint——团队可能没有清晰的迭代重点。");
        } else {
          plan.push(`✅ 当前 Sprint：${sprints.title} （进度 ${sprints.progress}%）`);
        }
        plan.push("");

        // ② 分解方案模板
        if (focusArea === "gap_analysis") {
          plan.push("## 二、缺口分析与建议操作");
          if (allObjectives.length === 0) {
            plan.push(
              "▶ **第1步**：定义三层目标",
              "  调用 `project_objective_upsert` 三次：",
              "  - 短期（2-4周）：当前迭代周期最重要的一件事",
              "  - 中期（1-3月）：本阶段要完成的核心功能集",
              "  - 长期（3月+）：产品的战略定位／最终愿景",
            );
          }
          if (milestones.length === 0 && allObjectives.length > 0) {
            plan.push(
              "",
              "▶ **第2步**：建立里程碑时间轴",
              "  调用 `project_milestone_upsert`，为每个目标添加一个验收里程碑，设置预期完成日期。",
            );
          }
          if (!sprints) {
            plan.push(
              "",
              "▶ **第3步**：创建并启动第一个 Sprint",
              "  调用 `project_sprint_upsert`（设置 goal、endDate、关联 objectiveId）",
              "  调用 `task_create` 创建本轮 Sprint 的具体任务（每个任务必须关联 objectiveId）",
              "  调用 `project_sprint_add_task` 将任务加入 Sprint",
              "  调用 `project_sprint_start` 启动 Sprint",
            );
          }
        } else {
          // full / short_term / next_sprint 模式
          plan.push("## 二、建议分解结构");
          plan.push("");
          plan.push("### 层次架构（参考 SAFe + Scrum）");
          plan.push("```");
          plan.push(`战略目标（Objective）  — 为什么要做，默认 1短期 + 1中期 + 1长期`);
          plan.push(`  └─ 里程碑（Milestone）  — 一个阶段性交付物，带截止日期`);
          plan.push(`       └─ Sprint（迭代）        — 1-2周迭代，带明确 Sprint Goal`);
          plan.push(`            └─ Epic / Task   — 可实施的工作单元`);
          plan.push("```");
          plan.push("");

          plan.push("### 具体操作步骤");
          plan.push("");
          plan.push("▶ **第1步 — 定义三层目标**（如未定义）");
          plan.push("  ```");
          plan.push("  project_objective_upsert(projectId, title, timeframe=short, goal=\"2周内让核心功能可演示\")");
          plan.push("  project_objective_upsert(projectId, title, timeframe=medium, goal=\"3月内达到首批用户可用\")");
          plan.push("  project_objective_upsert(projectId, title, timeframe=long, goal=\"6月内商业化上线\")");
          plan.push("  ```");
          plan.push("");

          plan.push("▶ **第2步 — 添加里程碑**（对应每个目标）");
          plan.push("  ```");
          plan.push("  project_milestone_upsert(projectId, title=\"核心功能可演示\", objectiveId, type=phase, targetDate)");
          plan.push("  ```");
          plan.push("");

          plan.push("▶ **第3步 — 创建并启动 Sprint**");
          plan.push("  ```");
          plan.push("  project_sprint_upsert(projectId, title=\"Sprint 1\", goal=\"这个 Sprint 要实现...\", objectiveId, endDate)");
          plan.push("  —— 然后创建具体任务并关联 objectiveId");
          plan.push("  task_create(..., objectiveId=...) × N");
          plan.push("  project_sprint_add_task(projectId, sprintId, taskId) × N");
          plan.push("  project_sprint_start(projectId, sprintId)");
          plan.push("  ```");

          if (focusArea === "next_sprint" && summary?.nextMilestone) {
            plan.push("");
            plan.push(`▶ **下一个建议 Sprint**（对齐里程碑：${summary.nextMilestone.title}）`);
            plan.push(`  建议 Sprint 目标：完成里程碑「${summary.nextMilestone.title}」所需的核心工作`);
            if (summary.nextMilestone.targetDate) {
              plan.push(`  里程碑截止日期：${new Date(summary.nextMilestone.targetDate).toLocaleDateString("zh-CN")}`);
            }
          }
        }

        plan.push("");
        plan.push("---");
        plan.push("ℹ️ **执行说明**");
        plan.push("以上是分解建议，不是自动执行。请审阅分解方案后，按顺序调用对应工具创建实际数据。");
        plan.push("重要：每个任务必须关联到 objectiveId，确保工作对齐目标。");

        return jsonResult({
          success: true,
          projectId,
          projectName,
          focusArea,
          currentState: {
            phase: currentPhase,
            objectivesCount: allObjectives.length,
            milestonesCount: milestones.length,
            hasActiveSprint: !!sprints,
          },
          decompositionPlan: plan.join("\n"),
          hasObjectives: allObjectives.length > 0,
          hasMilestones: milestones.length > 0,
          hasActiveSprint: !!sprints,
          nextActions: [
            allObjectives.length === 0 ? "project_objective_upsert 定义短/中/长期目标" : null,
            milestones.length === 0 ? "project_milestone_upsert 建立里程碑" : null,
            !sprints ? "project_sprint_upsert 创建 Sprint" : null,
            !sprints ? "project_sprint_add_task 加入任务" : null,
            !sprints ? "project_sprint_start 启动 Sprint" : null,
          ].filter(Boolean),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to decompose project: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

// ── 任务检查点工具（Task Checkpoint Tools）────────────────────────────────────
// 参考 LangGraph Checkpointing + Mastra Rewind & Replay。
// AI 开展长期复杂任务时，在关键步骤后保存进度快照，下次会话可直接从断点继续。

/**
 * project_checkpoint_save — 保存任务步骤检查点
 */
export function createProjectCheckpointSaveTool(): AnyAgentTool {
  return {
    label: "Project Checkpoint Save",
    name: "project_checkpoint_save",
    description:
      "Save a task step checkpoint for long-running complex tasks. " +
      "Use this PROACTIVELY at key milestones: after completing a sub-goal, before going offline, or when hitting a blocker. " +
      "The checkpoint records what was done, what's next, and any blockers. " +
      "On the NEXT session, load this checkpoint first with project_checkpoint_load to resume seamlessly. " +
      "\n\nREQUIRED: projectId, taskId, stepName, stepIndex, resultSummary, nextStepPlan. " +
      "\nBEST PRACTICE: Save checkpoints every 2-3 significant steps. Do NOT skip this for tasks > 30 minutes.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      taskId: Type.String({ description: "[REQUIRED] Task ID" }),
      stepName: Type.String({ description: "[REQUIRED] Step name (e.g. API design complete, DB tables created)" }),
      stepIndex: Type.Number({ description: "[REQUIRED] Step number (starts from 1)" }),
      totalSteps: Type.Optional(Type.Number({ description: "Total steps in the task (if known)" })),
      resultSummary: Type.String({ description: "[REQUIRED] What was accomplished in this step (max 500 chars)" }),
      nextStepPlan: Type.String({ description: "[REQUIRED] What to do next (entry point for resuming)" }),
      blockers: Type.Optional(Type.Array(Type.String(), { description: "Unresolved blockers or items needing human confirmation" })),
      artifacts: Type.Optional(Type.Array(Type.String(), { description: "Key intermediate outputs (file paths, links, IDs)" })),
      agentId: Type.Optional(Type.String({ description: "Agent ID saving this checkpoint" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const taskId = String(params.taskId ?? "");
      const stepName = String(params.stepName ?? "");
      const stepIndex = Number(params.stepIndex ?? 1);
      const resultSummary = String(params.resultSummary ?? "");
      const nextStepPlan = String(params.nextStepPlan ?? "");
      if (!projectId || !taskId || !stepName || !resultSummary || !nextStepPlan) {
        return jsonResult({
          success: false,
          error: "projectId, taskId, stepName, resultSummary, nextStepPlan are all required",
        });
      }
      try {
        const { saveTaskCheckpoint } = await import("../../utils/project-context.js");
        const saved = saveTaskCheckpoint(projectId, {
          projectId,
          taskId,
          stepName,
          stepIndex,
          totalSteps: params.totalSteps ? Number(params.totalSteps) : undefined,
          resultSummary,
          nextStepPlan,
          blockers: Array.isArray(params.blockers)
            ? (params.blockers as unknown[]).map(String)
            : undefined,
          artifacts: Array.isArray(params.artifacts)
            ? (params.artifacts as unknown[]).map(String)
            : undefined,
          agentId: params.agentId ? String(params.agentId) : undefined,
        });
        return jsonResult({
          success: true,
          checkpointId: saved.id,
          stepName: saved.stepName,
          stepIndex: saved.stepIndex,
          savedAt: new Date(saved.createdAt).toLocaleString("zh-CN"),
          tip: `检查点已保存。下次恢复时调用 project_checkpoint_load(projectId="${projectId}", taskId="${taskId}") 获取进度。`,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to save checkpoint: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_checkpoint_load — 加载任务检查点，恢复工作进度
 */
export function createProjectCheckpointLoadTool(): AnyAgentTool {
  return {
    label: "Project Checkpoint Load",
    name: "project_checkpoint_load",
    description:
      "Load a task checkpoint to resume work from where it was left off. " +
      "Call this at the START of a new session when continuing a long-running task. " +
      "Returns the last saved step, what was done, what to do next, and any blockers. " +
      "Without a checkpointId, returns the LATEST checkpoint for the task. " +
      "Use listMode=true to get all checkpoints (for reviewing history or rewinding). " +
      "\n\nREQUIRED: projectId, taskId.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      taskId: Type.String({ description: "[REQUIRED] Task ID" }),
      checkpointId: Type.Optional(Type.String({ description: "Specific checkpoint ID to load (omit for latest)" })),
      listMode: Type.Optional(Type.Boolean({ description: "If true, list all checkpoints instead of loading one" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = String(params.projectId ?? "");
      const taskId = String(params.taskId ?? "");
      if (!projectId || !taskId) {
        return jsonResult({ success: false, error: "projectId and taskId are required" });
      }
      try {
        const { loadTaskCheckpoint, listTaskCheckpoints } = await import("../../utils/project-context.js");
        if (params.listMode === true) {
          const all = listTaskCheckpoints(projectId, taskId);
          if (all.length === 0) {
            return jsonResult({
              success: true,
              found: false,
              message: `任务 ${taskId} 尚无任何检查点。每完成一个子目标后调用 project_checkpoint_save 保存进度。`,
            });
          }
          return jsonResult({
            success: true,
            found: true,
            totalCheckpoints: all.length,
            checkpoints: all.map((c) => ({
              id: c.id,
              stepIndex: c.stepIndex,
              stepName: c.stepName,
              savedAt: new Date(c.createdAt).toLocaleString("zh-CN"),
              nextStepPlan: c.nextStepPlan,
            })),
          });
        }
        const ckpt = loadTaskCheckpoint(
          projectId,
          taskId,
          params.checkpointId ? String(params.checkpointId) : undefined,
        );
        if (!ckpt) {
          return jsonResult({
            success: true,
            found: false,
            message: `任务 ${taskId} 尚无任何检查点。从第一步开始即可。`,
          });
        }
        return jsonResult({
          success: true,
          found: true,
          checkpoint: {
            id: ckpt.id,
            stepIndex: ckpt.stepIndex,
            totalSteps: ckpt.totalSteps,
            stepName: ckpt.stepName,
            resultSummary: ckpt.resultSummary,
            nextStepPlan: ckpt.nextStepPlan,
            blockers: ckpt.blockers ?? [],
            artifacts: ckpt.artifacts ?? [],
            savedAt: new Date(ckpt.createdAt).toLocaleString("zh-CN"),
            agentId: ckpt.agentId,
          },
          tip: `从【第 ${ckpt.stepIndex} 步：${ckpt.stepName}】继续。下一步计划：${ckpt.nextStepPlan}`,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to load checkpoint: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

// =============================================================================
// task_dependency_add — 添加任务依赖关系
// =============================================================================

const TaskDependencyAddSchema = Type.Object({
  /** 被阻塞的任务 ID（需要等待另一个任务完成） */
  taskId: Type.String({ minLength: 1 }),
  /**
   * 依赖类型：
   * - blocks：当前任务阻塞目标任务（当前任务完成后，目标任务才能开始）
   * - blocked-by：当前任务被目标任务阻塞（目标任务完成后，当前任务才能开始）
   * - relates-to：普通关联关系，无顺序约束
   * - duplicates：当前任务是目标任务的重复
   */
  dependencyType: Type.Union([
    Type.Literal("blocks"),
    Type.Literal("blocked-by"),
    Type.Literal("relates-to"),
    Type.Literal("duplicates"),
  ]),
  /** 目标任务 ID（与 taskId 之间建立依赖关系） */
  targetTaskId: Type.String({ minLength: 1 }),
  /** 可选备注（依赖原因说明） */
  note: Type.Optional(Type.String()),
});

/**
 * task_dependency_add — 在两个任务之间建立依赖关系
 * 后端内置循环依赖检测，若存在循环则返回错误。
 */
export function createTaskDependencyAddTool(): AnyAgentTool {
  return {
    label: "Task Dependency Add",
    name: "task_dependency_add",
    description:
      "Add a dependency relationship between two tasks. " +
      "Use 'blocked-by' when THIS task cannot start until TARGET task is complete. " +
      "Use 'blocks' when THIS task must complete before TARGET task can start. " +
      "The backend automatically detects circular dependencies and will return an error if a cycle is detected. " +
      "After adding dependencies, use task_blockers_view to see the full dependency graph.",
    parameters: TaskDependencyAddSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const targetTaskId = readStringParam(params, "targetTaskId", { required: true });
      const dependencyType = readStringParam(params, "dependencyType", { required: true }) as
        | "blocks"
        | "blocked-by"
        | "relates-to"
        | "duplicates";
      const note = readStringParam(params, "note");
      const gatewayOpts = readGatewayCallOptions(params);

      if (taskId === targetTaskId) {
        return jsonResult({
          success: false,
          error: "任务不能依赖自身，请检查 taskId 和 targetTaskId。",
        });
      }

      try {
        const result = await callGatewayTool("task.dependency.add", gatewayOpts, {
          taskId,
          targetTaskId,
          dependencyType,
          note,
        });

        const typeLabel: Record<string, string> = {
          "blocks": "阻塞",
          "blocked-by": "被阻塞",
          "relates-to": "关联",
          "duplicates": "重复",
        };

        return jsonResult({
          success: true,
          message: `✅ 依赖关系已建立：任务 ${taskId} [${typeLabel[dependencyType] ?? dependencyType}] 任务 ${targetTaskId}`,
          dependency: result,
          tip: "使用 task_blockers_view 查看任务的完整依赖关系图。",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isCircular =
          msg.toLowerCase().includes("circular") || msg.includes("循环依赖");
        return jsonResult({
          success: false,
          error: isCircular
            ? `❌ 检测到循环依赖！添加此依赖会造成环路，已拒绝。请检查任务依赖链：${msg}`
            : `Failed to add dependency: ${msg}`,
        });
      }
    },
  };
}

// =============================================================================
// task_blockers_view — 查看任务的依赖/阻塞关系
// =============================================================================

const TaskBlockersViewSchema = Type.Object({
  /** 要查询依赖关系的任务 ID */
  taskId: Type.String({ minLength: 1 }),
  /**
   * 是否同时获取被此任务阻塞的下游任务列表（默认 true）
   * 设为 false 可只看上游阻塞（当前任务等待哪些任务完成）
   */
  includeDownstream: Type.Optional(Type.Boolean()),
});

/**
 * task_blockers_view — 查看任务的完整依赖/阻塞关系图
 * 返回上游阻塞方（当前任务被哪些任务阻塞）和下游被阻塞方（当前任务阻塞哪些任务）
 */
export function createTaskBlockersViewTool(): AnyAgentTool {
  return {
    label: "Task Blockers View",
    name: "task_blockers_view",
    description:
      "View the full dependency/blocker graph for a specific task. " +
      "Shows both upstream blockers (tasks that must complete before this task) " +
      "and downstream dependents (tasks that are waiting for this task). " +
      "Blocked tasks are marked with 🔒 in the output.",
    parameters: TaskBlockersViewSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const includeDownstream = params.includeDownstream !== false; // 默认 true
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 获取任务详情（含 dependencies 字段）
        const task = await callGatewayTool("task.get", gatewayOpts, { taskId });

        const taskTitle = (task.title as string | undefined) ?? taskId;
        const taskStatus = (task.status as string | undefined) ?? "unknown";
        const dependencies = (task.dependencies as Array<{
          id: string;
          taskId: string;
          targetTaskId: string;
          dependencyType: string;
          note?: string;
        }> | undefined) ?? [];
        const blockedBy = (task.blockedBy as string[] | undefined) ?? [];

        // 区分上游阻塞（blocked-by）和下游关联（blocks）
        const upstreamBlockers = dependencies.filter(
          (d) => d.dependencyType === "blocked-by" || d.taskId === taskId && d.dependencyType === "blocked-by"
        );
        const downstreamBlocked = includeDownstream
          ? dependencies.filter((d) => d.dependencyType === "blocks")
          : [];
        const related = dependencies.filter(
          (d) => d.dependencyType === "relates-to" || d.dependencyType === "duplicates"
        );

        const isBlocked = blockedBy.length > 0 || upstreamBlockers.length > 0;

        const lines: string[] = [
          `📋 任务依赖关系 — ${isBlocked ? "🔒 " : ""}${taskTitle}`,
          `状态：${taskStatus}${isBlocked ? "（被阻塞，等待上游任务完成）" : ""}`,
          "",
        ];

        if (blockedBy.length > 0) {
          lines.push("⬆️ 上游阻塞（必须先完成）：");
          for (const bid of blockedBy) {
            lines.push(`  🔒 ${bid}`);
          }
          lines.push("");
        }

        if (upstreamBlockers.length > 0) {
          lines.push("⬆️ 依赖上游任务（blocked-by）：");
          for (const dep of upstreamBlockers) {
            const other = dep.taskId === taskId ? dep.targetTaskId : dep.taskId;
            lines.push(`  🔒 ${other}${dep.note ? ` — ${dep.note}` : ""}`);
          }
          lines.push("");
        }

        if (downstreamBlocked.length > 0) {
          lines.push("⬇️ 下游等待（当前任务完成后可解锁）：");
          for (const dep of downstreamBlocked) {
            const other = dep.taskId === taskId ? dep.targetTaskId : dep.taskId;
            lines.push(`  ⏳ ${other}${dep.note ? ` — ${dep.note}` : ""}`);
          }
          lines.push("");
        }

        if (related.length > 0) {
          lines.push("🔗 关联任务：");
          for (const dep of related) {
            const other = dep.taskId === taskId ? dep.targetTaskId : dep.taskId;
            const typeLabel = dep.dependencyType === "duplicates" ? "重复" : "关联";
            lines.push(`  [${typeLabel}] ${other}${dep.note ? ` — ${dep.note}` : ""}`);
          }
          lines.push("");
        }

        if (dependencies.length === 0 && blockedBy.length === 0) {
          lines.push("✅ 此任务无任何依赖关系，可独立执行。");
        }

        return jsonResult({
          success: true,
          taskId,
          taskTitle,
          taskStatus,
          isBlocked,
          summary: lines.join("\n"),
          blockedBy,
          dependencies,
          dependencyCount: dependencies.length,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to view task blockers: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

// =============================================================================
// project_report_generate — 生成项目进度报告（Markdown 格式）
// =============================================================================

const ProjectReportGenerateSchema = Type.Object({
  /** 项目 ID（必填） */
  projectId: Type.String({ minLength: 1 }),
  /**
   * 报告类型：
   * - daily：日报（仅统计今日更新）
   * - weekly：周报（近 7 天）
   * - monthly：月报（近 30 天）
   * - snapshot：当前快照（不限时间范围，全量统计）
   */
  reportType: Type.Optional(
    Type.Union([
      Type.Literal("daily"),
      Type.Literal("weekly"),
      Type.Literal("monthly"),
      Type.Literal("snapshot"),
    ])
  ),
  /** 报告标题（可选，默认自动生成） */
  title: Type.Optional(Type.String()),
  /** 是否包含未完成任务列表（默认 true） */
  includeOpenTasks: Type.Optional(Type.Boolean()),
  /** 是否包含已完成任务列表（默认 false，仅统计数量） */
  includeCompletedTasks: Type.Optional(Type.Boolean()),
  /** 是否包含超期任务专项（默认 true） */
  includeOverdue: Type.Optional(Type.Boolean()),
});

/**
 * project_report_generate — 自动生成项目进度报告（Markdown 格式）
 * 汇总任务完成率、延期率、按状态/优先级分布，支持日报/周报/月报/快照四种模式。
 */
export function createProjectReportGenerateTool(): AnyAgentTool {
  return {
    label: "Project Report Generate",
    name: "project_report_generate",
    description:
      "Generate a project progress report in Markdown format. " +
      "Includes task completion rate, overdue rate, status distribution, priority breakdown. " +
      "Supports daily/weekly/monthly/snapshot report types. " +
      "The generated Markdown can be directly sent to team members or saved as a file.",
    parameters: ProjectReportGenerateSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "projectId", { required: true });
      const reportType = (readStringParam(params, "reportType") ?? "snapshot") as
        | "daily"
        | "weekly"
        | "monthly"
        | "snapshot";
      const customTitle = readStringParam(params, "title");
      const includeOpenTasks = params.includeOpenTasks !== false; // 默认 true
      const includeCompletedTasks = params.includeCompletedTasks === true; // 默认 false
      const includeOverdue = params.includeOverdue !== false; // 默认 true
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 1. 获取项目基本信息
        const projectMeta = await getProjectStatusMeta(projectId).catch(() => null);

        // 2. 获取任务统计数据
        const stats = await callGatewayTool("task.stats", gatewayOpts, {
          projectId,
        });

        // 3. 获取任务列表（用于详细报告）
        const taskListResult = await callGatewayTool("task.list", gatewayOpts, {
          projectId,
          limit: 200,
        }).catch(() => ({ tasks: [] }));

        const tasks = (taskListResult.tasks as Array<{
          id: string;
          title: string;
          status: string;
          priority?: string;
          dueDate?: string | number | null;
          assigneeId?: string;
          updatedAt?: number;
        }> | undefined) ?? [];

        // 4. 按报告类型过滤时间范围
        const now = Date.now();
        const rangeMs: Record<string, number> = {
          daily: 86_400_000,
          weekly: 7 * 86_400_000,
          monthly: 30 * 86_400_000,
          snapshot: Infinity,
        };
        const cutoff = now - (rangeMs[reportType] ?? Infinity);
        const recentTasks =
          reportType === "snapshot"
            ? tasks
            : tasks.filter((t) => (t.updatedAt ?? 0) >= cutoff);

        // 5. 聚合统计
        const byStatus = (stats.byStatus as Record<string, number> | undefined) ?? {};
        const byPriority = (stats.byPriority as Record<string, number> | undefined) ?? {};
        const overdueCount = (stats.overdue as number | undefined) ?? 0;
        const totalCount = Object.values(byStatus).reduce((a, b) => a + b, 0);
        const doneCount = (byStatus["done"] ?? 0) + (byStatus["completed"] ?? 0);
        const inProgressCount = byStatus["in-progress"] ?? byStatus["in_progress"] ?? 0;
        const completionRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
        const overdueRate = totalCount > 0 ? Math.round((overdueCount / totalCount) * 100) : 0;

        // 6. 拆分开放/完成任务列表
        const openTasks = recentTasks.filter(
          (t) => !["done", "completed", "cancelled"].includes(t.status)
        );
        const completedTasks = recentTasks.filter((t) =>
          ["done", "completed"].includes(t.status)
        );
        const overdueTasks = includeOverdue
          ? tasks.filter((t) => {
              if (!t.dueDate) return false;
              const due = typeof t.dueDate === "number" ? t.dueDate : new Date(t.dueDate).getTime();
              return due < now && !["done", "completed", "cancelled"].includes(t.status);
            })
          : [];

        // 7. 生成报告标题和日期
        const reportTypeLabel: Record<string, string> = {
          daily: "日报",
          weekly: "周报",
          monthly: "月报",
          snapshot: "进度快照",
        };
        const dateStr = new Date(now).toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const projectName = projectMeta?.name ?? projectId;
        const reportTitle =
          customTitle ??
          `📊 ${projectName} ${reportTypeLabel[reportType] ?? "报告"} — ${dateStr}`;

        // 8. 拼接 Markdown
        const md: string[] = [
          `# ${reportTitle}`,
          "",
          `> 生成时间：${new Date(now).toLocaleString("zh-CN")}  `,
          `> 项目 ID：\`${projectId}\``,
          "",
          "---",
          "",
          "## 📈 总体进度",
          "",
          `| 指标 | 数值 |`,
          `|------|------|`,
          `| 总任务数 | ${totalCount} |`,
          `| 已完成 | ${doneCount} (${completionRate}%) |`,
          `| 进行中 | ${inProgressCount} |`,
          `| 未开始 | ${(byStatus["todo"] ?? byStatus["pending"] ?? 0)} |`,
          `| 超期任务 | ${overdueCount} (${overdueRate}%) |`,
          "",
        ];

        // 优先级分布
        if (Object.keys(byPriority).length > 0) {
          md.push("## 🎯 优先级分布", "");
          const priorityLabel: Record<string, string> = {
            critical: "🔴 紧急",
            high: "🟠 高",
            medium: "🟡 中",
            low: "🟢 低",
          };
          for (const [p, cnt] of Object.entries(byPriority).sort(([a], [b]) => {
            const order = ["critical", "high", "medium", "low"];
            return order.indexOf(a) - order.indexOf(b);
          })) {
            md.push(`- ${priorityLabel[p] ?? p}：${cnt} 个任务`);
          }
          md.push("");
        }

        // 超期任务专项
        if (includeOverdue && overdueTasks.length > 0) {
          md.push("## ⚠️ 超期任务", "");
          for (const t of overdueTasks.slice(0, 20)) {
            const dueStr = t.dueDate
              ? new Date(
                  typeof t.dueDate === "number" ? t.dueDate : t.dueDate
                ).toLocaleDateString("zh-CN")
              : "";
            md.push(`- 🔴 **${t.title}** \`${t.id}\` — 截止：${dueStr}`);
          }
          if (overdueTasks.length > 20) {
            md.push(`- ...以及另外 ${overdueTasks.length - 20} 个超期任务`);
          }
          md.push("");
        }

        // 开放任务列表
        if (includeOpenTasks && openTasks.length > 0) {
          md.push(
            reportType === "snapshot"
              ? "## 📋 待处理任务"
              : `## 📋 ${reportTypeLabel[reportType] ?? ""}内待处理任务`,
            ""
          );
          for (const t of openTasks.slice(0, 30)) {
            const statusIcon: Record<string, string> = {
              "in-progress": "🔄",
              "in_progress": "🔄",
              todo: "⬜",
              pending: "⬜",
              blocked: "🔒",
            };
            const icon = statusIcon[t.status] ?? "📌";
            md.push(`- ${icon} **${t.title}** \`${t.id}\`${t.assigneeId ? ` @${t.assigneeId}` : ""}`);
          }
          if (openTasks.length > 30) {
            md.push(`- ...以及另外 ${openTasks.length - 30} 个任务`);
          }
          md.push("");
        }

        // 已完成任务列表
        if (includeCompletedTasks && completedTasks.length > 0) {
          md.push(
            reportType === "snapshot"
              ? "## ✅ 已完成任务"
              : `## ✅ ${reportTypeLabel[reportType] ?? ""}内已完成任务`,
            ""
          );
          for (const t of completedTasks.slice(0, 20)) {
            md.push(`- ✅ ~~${t.title}~~ \`${t.id}\``);
          }
          if (completedTasks.length > 20) {
            md.push(`- ...以及另外 ${completedTasks.length - 20} 个已完成任务`);
          }
          md.push("");
        }

        md.push("---");
        md.push(`*本报告由 AI 自动生成 · ${new Date(now).toLocaleString("zh-CN")}*`);

        const markdown = md.join("\n");

        return jsonResult({
          success: true,
          reportType,
          projectId,
          projectName,
          generatedAt: new Date(now).toISOString(),
          stats: {
            total: totalCount,
            done: doneCount,
            inProgress: inProgressCount,
            overdue: overdueCount,
            completionRate: `${completionRate}%`,
            overdueRate: `${overdueRate}%`,
          },
          markdown,
          tip: "Markdown 报告已就绪，可直接发送到聊天群组或保存为 .md 文件。",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to generate report: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * project_delete 工具参数 schema
 */
const ProjectDeleteToolSchema = Type.Object({
  /** 项目 ID（必填） */
  projectId: Type.String({ minLength: 1 }),
  /**
   * 用户明确授权的确认令牌。
   * 调用此工具前，必须先向用户明确说明将要删除的内容，
   * 并要求用户回复 "CONFIRM_DELETE_<projectId>" 作为确认。
   * 将用户的原始确认文本原样填入此字段。
   */
  userConfirmation: Type.String({ minLength: 1 }),
  /** 是否同时物理删除工作空间目录（默认 false，即保留） */
  deleteWorkspace: Type.Optional(Type.Boolean()),
  /** 是否同时物理删除 Task 系统中该项目的所有任务（默认 false，即保留） */
  deleteTasks: Type.Optional(Type.Boolean()),
  /** 是否同时删除该项目绑定的所有群组（默认 false，即保留） */
  deleteGroups: Type.Optional(Type.Boolean()),
});

/**
 * 创建项目删除工具
 *
 * ⚠️ 高危操作：此工具用于物理删除项目及其关联数据，必须在用户明确授权后才能调用。
 */
export function createProjectDeleteTool(): AnyAgentTool {
  return {
    label: "Project Delete",
    name: "project_delete",
    description:
      "⚠️ DANGEROUS: Permanently deletes a project and optionally its workspace directory, tasks, and groups. " +
      "THIS TOOL MUST ONLY BE CALLED AFTER EXPLICIT USER AUTHORIZATION. " +
      "BEFORE calling this tool you MUST: " +
      "1) Clearly inform the user what will be deleted (project name, which of workspace/tasks/groups will be removed based on the flags). " +
      "2) Ask the user to confirm by explicitly typing \"CONFIRM_DELETE_<projectId>\". " +
      "3) Pass the user's exact confirmation text in the userConfirmation field. " +
      "DO NOT call this tool based on vague instructions like 'clean up' or 'remove old projects'. " +
      "DO NOT infer consent — only proceed when the user has given an unambiguous, project-specific confirmation. " +
      "All three delete flags (deleteWorkspace, deleteTasks, deleteGroups) default to false (preserve). " +
      "Only set them to true when the user has explicitly requested deletion of that specific content.",
    parameters: ProjectDeleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "projectId", { required: true });
      const userConfirmation = readStringParam(params, "userConfirmation", { required: true });
      const deleteWorkspace = params.deleteWorkspace === true;
      const deleteTasks = params.deleteTasks === true;
      const deleteGroups = params.deleteGroups === true;
      const gatewayOpts = readGatewayCallOptions(params);

      // 强制校验用户确认令牌
      const expectedToken = `CONFIRM_DELETE_${projectId}`;
      if (!userConfirmation.includes(expectedToken)) {
        return jsonResult({
          success: false,
          blocked: true,
          error:
            `操作被阻止：未收到有效的用户授权确认。` +
            `\n请先向用户展示将要删除的内容，然后要求用户明确回复 "${expectedToken}" 来授权此操作。` +
            `\n收到确认后，将用户的原始回复文本填入 userConfirmation 字段再重新调用。`,
          requiredConfirmationToken: expectedToken,
        });
      }

      try {
        const result = await callGatewayTool("projects.delete", gatewayOpts, {
          projectId,
          deleteWorkspace,
          deleteTasks,
          deleteGroups,
        });

        return jsonResult({
          success: true,
          projectId,
          deleteWorkspace,
          deleteTasks,
          deleteGroups,
          result,
          tip: "项目已删除。如有需要，请通知相关成员。",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `删除项目失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}