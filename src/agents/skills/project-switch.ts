/**
 * Project Switch Skill
 * 
 * 允许 Agent 在不同项目之间动态切换工作上下文
 * 
 * 使用场景:
 * - 产品分析师需要从 wo-shi-renlei 切换到 PolyVault 写需求文档
 * - QA 负责人需要在不同项目间切换进行测试
 * - 开发人员需要根据任务切换到对应项目的代码目录
 */

import type { SkillDefinition } from '../agents/skills/types.js';
import { buildProjectContext, readProjectSharedMemory, projectWorkspaceExists } from '../utils/project-context.js';
import { Type } from '@sinclair/typebox';

export const projectSwitchSkill: SkillDefinition = {
  id: 'project-switch',
  name: 'Project Switch',
  description: 'Switch between different project workspaces in matrix management mode',
  
  parameters: Type.Object({
    projectId: Type.String({
      description: 'Target project ID (e.g., "wo-shi-renlei", "PolyVault", "LifeMirror")',
    }),
    reason: Type.Optional(Type.String({
      description: 'Reason for switching (for logging and context)',
    })),
  }),
  
  async execute(agentId, params, context) {
    const { projectId, reason } = params;
    
    console.log(`[project-switch] Agent ${agentId} switching to project: ${projectId}${reason ? ` (${reason})` : ''}`);
    
    // 1. Check if project workspace exists
    if (!projectWorkspaceExists(projectId)) {
      return {
        success: false,
        message: `Project workspace not found: ${projectId}. Please check if the project directory exists in H:\\OpenClaw_Workspace\\groups\\`,
      };
    }
    
    // 2. Build project context
    const projectCtx = buildProjectContext(projectId);
    
    // 3. Check if code directory is different from workspace
    const isExternalCode = !projectCtx.codeDir.startsWith(projectCtx.workspacePath);
    const codeDirNote = isExternalCode 
      ? `\n   ⚙️  External Code Directory: ${projectCtx.codeDir}`
      : '';
    
    // 4. Read shared memory if available
    const sharedMemory = readProjectSharedMemory(projectId);
    const memoryNote = sharedMemory 
      ? `\n\n📖 Shared Memory loaded (${projectCtx.sharedMemoryPath}):\n${sharedMemory.substring(0, 500)}${sharedMemory.length > 500 ? '...' : ''}`
      : `\n\n⚠️ No SHARED_MEMORY.md found in project directory`;
    
    // 5. Generate switch instructions
    const instructions = [
      `✅ Successfully switched to project: ${projectId}`,
      ``,
      `📁 Project Workspace: ${projectCtx.workspacePath}`,
      `   - Code Directory: ${projectCtx.codeDir}${codeDirNote}`,
      `   - Docs Directory: ${projectCtx.docsDir}`,
      `   - Decisions Directory: ${projectCtx.decisionsDir}`,
      ``,
      `🎯 Next Steps:`,
      `1. Navigate to workspace: cd "${projectCtx.workspacePath}"`,
      `2. Review shared memory for project context`,
      `3. Check project-specific documentation in docs/`,
      isExternalCode 
        ? `4. Work on code in external directory: ${projectCtx.codeDir}`
        : `4. Start working on your task in src/ directory`,
      memoryNote,
    ].join('\n');
    
    // 5. Log the switch (for audit trail)
    console.log(`[project-switch] ✓ Agent ${agentId} now working on project ${projectId}`);
    console.log(`[project-switch] Workspace: ${projectCtx.workspacePath}`);
    
    return {
      success: true,
      message: instructions,
      data: {
        projectId,
        workspacePath: projectCtx.workspacePath,
        codeDir: projectCtx.codeDir,
        docsDir: projectCtx.docsDir,
        hasSharedMemory: !!sharedMemory,
      },
    };
  },
};
