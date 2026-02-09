/**
 * Phase 6: 技能转移工具
 *
 * 允许培训师将技能文件从导师工作空间复制到学员工作空间
 */

import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { LifecycleManager } from "../../lifecycle/lifecycle-manager.js";
import { TrainingSystem } from "../../lifecycle/training-system.js";
import { jsonResult, readStringParam } from "./common.js";

/**
 * skill_transfer 工具参数 schema
 */
const SkillTransferToolSchema = Type.Object({
  /** 学员智能助手ID */
  studentAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 导师智能助手ID */
  mentorAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 技能文件路径（相对于导师工作空间） */
  skillFilePath: Type.String({ minLength: 1 }),
  /** 可选：目标路径（默认与源路径相同） */
  targetPath: Type.Optional(Type.String()),
  /** 可选：是否覆盖已存在的文件 */
  overwrite: Type.Optional(Type.Boolean()),
});

/**
 * 创建技能转移工具
 */
export function createSkillTransferTool(opts?: {
  /** 当前工具调用者的智能助手ID */
  trainerAgentId?: string;
  /** 工作空间根目录 */
  workspaceRoot?: string;
}): AnyAgentTool {
  return {
    label: "Skill Transfer",
    name: "skill_transfer",
    description:
      "Transfer skill files from mentor's workspace to student's workspace. Useful for sharing configurations, templates, or knowledge files during training.",
    parameters: SkillTransferToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const studentAgentId = readStringParam(params, "studentAgentId", { required: true });
      const mentorAgentId = readStringParam(params, "mentorAgentId", { required: true });
      const skillFilePath = readStringParam(params, "skillFilePath", { required: true });
      const targetPath = readStringParam(params, "targetPath");
      const overwrite = typeof params.overwrite === "boolean" ? params.overwrite : false;

      const cfg = loadConfig();
      const trainingSystem = TrainingSystem.getInstance();
      const lifecycleManager = LifecycleManager.getInstance();

      // 1. 验证培训师权限
      const trainerAgentId = opts?.trainerAgentId;
      if (!trainerAgentId) {
        return jsonResult({
          success: false,
          error: "Trainer agent ID not available",
        });
      }

      // 2. 验证学员和导师
      const studentAgent = cfg.agents?.list?.find((a) => a.id === studentAgentId);
      if (!studentAgent) {
        return jsonResult({
          success: false,
          error: `Student agent not found: ${studentAgentId}`,
        });
      }

      const mentorAgent = cfg.agents?.list?.find((a) => a.id === mentorAgentId);
      if (!mentorAgent) {
        return jsonResult({
          success: false,
          error: `Mentor agent not found: ${mentorAgentId}`,
        });
      }

      // 3. 检查学员是否在培训中
      const studentLifecycle = lifecycleManager.getLifecycleState(studentAgentId);
      if (!studentLifecycle) {
        return jsonResult({
          success: false,
          error: `Student lifecycle not initialized: ${studentAgentId}`,
        });
      }

      // 可选：检查是否在培训阶段
      // if (studentLifecycle.currentStage !== "training" && studentLifecycle.currentStage !== "onboarding") {
      //   return jsonResult({
      //     success: false,
      //     error: `Student is not in training stage: ${studentLifecycle.currentStage}`,
      //   });
      // }

      // 4. 确定工作空间路径
      const workspaceRoot = opts?.workspaceRoot || path.join(process.cwd(), "workspace");
      const mentorWorkspace = path.join(workspaceRoot, mentorAgentId);
      const studentWorkspace = path.join(workspaceRoot, studentAgentId);

      // 5. 构造源文件和目标文件路径
      const sourcePath = path.join(mentorWorkspace, skillFilePath);
      const destPath = path.join(studentWorkspace, targetPath || skillFilePath);

      // 安全检查：确保路径不会逃出工作空间
      const normalizedSource = path.normalize(sourcePath);
      const normalizedDest = path.normalize(destPath);

      if (!normalizedSource.startsWith(path.normalize(mentorWorkspace))) {
        return jsonResult({
          success: false,
          error: "Source path escapes mentor workspace",
        });
      }

      if (!normalizedDest.startsWith(path.normalize(studentWorkspace))) {
        return jsonResult({
          success: false,
          error: "Destination path escapes student workspace",
        });
      }

      // 6. 复制文件
      try {
        // 检查源文件是否存在
        try {
          await fs.access(sourcePath, fs.constants.R_OK);
        } catch {
          return jsonResult({
            success: false,
            error: `Source file not found: ${skillFilePath}`,
          });
        }

        // 检查目标文件是否已存在
        let destExists = false;
        try {
          await fs.access(destPath);
          destExists = true;
        } catch {
          // 文件不存在，可以继续
        }

        if (destExists && !overwrite) {
          return jsonResult({
            success: false,
            error: `Destination file already exists: ${targetPath || skillFilePath}. Set overwrite=true to replace.`,
          });
        }

        // 确保目标目录存在
        const destDir = path.dirname(destPath);
        await fs.mkdir(destDir, { recursive: true });

        // 复制文件
        await fs.copyFile(sourcePath, destPath);

        // 获取文件信息
        const stats = await fs.stat(destPath);

        // 记录技能转移事件
        lifecycleManager.recordEvent({
          agentId: studentAgentId,
          eventType: "skill_acquired",
          triggeredBy: trainerAgentId,
          metadata: {
            skillFile: skillFilePath,
            mentorAgentId,
            fileSize: stats.size,
          },
        });

        return jsonResult({
          success: true,
          message: `Skill file transferred successfully from ${mentorAgentId} to ${studentAgentId}`,
          transfer: {
            studentAgentId,
            mentorAgentId,
            sourceFile: skillFilePath,
            targetFile: targetPath || skillFilePath,
            fileSize: stats.size,
            transferredAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to transfer skill file: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
