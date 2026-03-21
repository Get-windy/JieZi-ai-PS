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
  /** 项目 ID（可选，不传则自动生成） */
  projectId: Type.Optional(Type.String()),
  /** 项目描述（可选） */
  description: Type.Optional(Type.String()),
  /** 项目代码目录路径（可选，默认在 I:\{projectName}） */
  codeDir: Type.Optional(Type.String()),
  /** 项目工作空间根目录（可选，默认 H:\\OpenClaw_Workspace\\groups） */
  workspaceRoot: Type.Optional(Type.String()),
  /** 项目负责人 ID（可选） */
  ownerId: Type.Optional(Type.String()),
  /** 是否同时创建项目群（可选，默认 true） */
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
      "Create a new project with workspace and configuration. Automatically creates project workspace directory, PROJECT_CONFIG.json, and initial structure. Returns project ID and configuration.",
    parameters: ProjectCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const name = readStringParam(params, "name", { required: true });
      const projectId = readStringParam(params, "projectId"); // 可选，自动生成
      const description = readStringParam(params, "description");
      const codeDir = readStringParam(params, "codeDir"); // 可选，默认 I:\{projectName}
      const workspaceRoot = readStringParam(params, "workspaceRoot"); // 可选，从配置或环境变量读取
      const ownerId = readStringParam(params, "ownerId");
      const createGroup = typeof params.createGroup === "boolean" ? params.createGroup : true; // 默认创建项目群
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 如果没有指定 projectId，使用项目名称生成
        const finalProjectId = projectId || `project-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
        
        // 如果没有指定 codeDir，默认在 I:\{projectName}
        const finalCodeDir = codeDir || `I:\\${name}`;
        
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

        // 自动创建关联的项目群
        let groupInfo = null;
        if (createGroup) {
          try {
            const groupName = `${name} 项目组`;
            const groupResponse = await callGatewayTool("groups.create", gatewayOpts, {
              id: `group-${finalProjectId}`,
              name: groupName,
              ownerId: ownerId || "system",
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
          `5. Verify code directory exists:`,
          `   \`\`\`bash`,
          `   if not exist "${finalCodeDir}" (`,
          `     echo "⚠️ Code directory does not exist: ${finalCodeDir}"`,
          `     echo "Please create it or update PROJECT_CONFIG.json"`,
          `   )`,
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
