/**
 * Project Management Tools
 * 
 * 项目管理相关工具：
 * - project_create: 创建新项目，包括项目工作空间和 PROJECT_CONFIG.json
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import { callGatewayTool, readGatewayCallOptions } from "../../../upstream/src/agents/tools/gateway.js";

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
      "REQUIRED: You MUST provide ownerId as a real agent ID (e.g. 'main', 'coordinator') — " +
      "NEVER use 'system' as ownerId. " +
      "createGroup defaults to FALSE — only pass createGroup=true when the user or supervisor has explicitly requested a project group to be created. " +
      "Do NOT create projects silently in the background; this tool must only be called after an explicit user/chat instruction.",
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
      const gatewayOpts = readGatewayCallOptions(params);

      // 拦截非法 ownerId
      if (!ownerId || ownerId.toLowerCase() === "system") {
        return jsonResult({
          success: false,
          error:
            '禁止使用 "system" 作为项目负责人。' +
            "必须提供真实的 agent ID（如 \"main\"\u3001\"coordinator\" 等）。" +
            "请先确认项目负责人后再调用此工具。",
        });
      }

      try {
        // 如果没有指定 projectId，使用项目名称生成
        const finalProjectId = projectId || `project-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
        
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
        const actualWorkspaceRoot = workspaceRoot || process.env.OPENCLAW_GROUPS_ROOT || "H:\\OpenClaw_Workspace\\groups";
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
              groupId: groupResponse.id,
              name: groupResponse.name,
              projectId: finalProjectId,
              workspacePath: workspacePath,
            };
          } catch (groupError) {
            // 如果群组创建失败，记录警告但不影响项目创建
            console.warn(`Failed to create project group for project ${finalProjectId}:`, groupError);
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
          `- Code Directory: ${finalCodeDir}`,
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
