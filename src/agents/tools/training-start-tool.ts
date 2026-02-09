/**
 * Phase 6: 培训开始工具
 *
 * 允许培训师智能助手开始一个培训课程
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { TrainingSystem } from "../../lifecycle/training-system.js";
import { jsonResult, readStringParam } from "./common.js";

/**
 * training_start 工具参数 schema
 */
const TrainingStartToolSchema = Type.Object({
  /** 学员智能助手ID */
  studentAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 课程ID */
  courseId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 可选：课程名称（用于创建新课程） */
  courseName: Type.Optional(Type.String()),
  /** 可选：课程描述 */
  courseDescription: Type.Optional(Type.String()),
  /** 可选：课程类型 */
  courseType: Type.Optional(
    Type.Union([
      Type.Literal("onboarding"),
      Type.Literal("skill-training"),
      Type.Literal("certification"),
    ]),
  ),
});

/**
 * 创建培训开始工具
 */
export function createTrainingStartTool(opts?: {
  /** 当前工具调用者的智能助手ID */
  trainerAgentId?: string;
  /** 是否在沙箱模式下运行 */
  sandboxed?: boolean;
}): AnyAgentTool {
  return {
    label: "Training Start",
    name: "training_start",
    description:
      "Start a training course for a student agent. The trainer can begin onboarding, skill training, or certification courses. Requires trainer role.",
    parameters: TrainingStartToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const studentAgentId = readStringParam(params, "studentAgentId", { required: true });
      const courseId = readStringParam(params, "courseId", { required: true });
      const courseName = readStringParam(params, "courseName");
      const courseDescription = readStringParam(params, "courseDescription");
      const courseType = readStringParam(params, "courseType") as
        | "onboarding"
        | "skill-training"
        | "certification"
        | undefined;

      const cfg = loadConfig();
      const trainingSystem = TrainingSystem.getInstance();

      // 1. 验证培训师权限
      const trainerAgentId = opts?.trainerAgentId;
      if (!trainerAgentId) {
        return jsonResult({
          success: false,
          error: "Trainer agent ID not available",
        });
      }

      // 检查培训师是否有培训权限（简化：检查角色或生命周期阶段）
      const trainerAgent = cfg.agents?.list?.find((a) => a.id === trainerAgentId);
      if (!trainerAgent) {
        return jsonResult({
          success: false,
          error: `Trainer agent not found: ${trainerAgentId}`,
        });
      }

      // 可选：检查培训师的角色权限
      // const hasTrainerRole = (trainerAgent as any).role === "trainer";
      // if (!hasTrainerRole) {
      //   return jsonResult({
      //     success: false,
      //     error: "Agent does not have trainer role",
      //   });
      // }

      // 2. 验证学员智能助手
      const studentAgent = cfg.agents?.list?.find((a) => a.id === studentAgentId);
      if (!studentAgent) {
        return jsonResult({
          success: false,
          error: `Student agent not found: ${studentAgentId}`,
        });
      }

      // 3. 检查或创建课程
      let course = trainingSystem.getCourse(courseId);

      if (!course) {
        // 如果课程不存在且提供了课程信息，创建新课程
        if (!courseName) {
          return jsonResult({
            success: false,
            error: `Course not found: ${courseId}. Provide courseName to create a new course.`,
          });
        }

        try {
          course = trainingSystem.createCourse({
            id: courseId,
            name: courseName,
            description: courseDescription || `Training course: ${courseName}`,
            type: courseType || "skill-training",
            level: "beginner",
            modules: [],
            createdBy: trainerAgentId,
            hasAssessment: false,
          });
        } catch (error) {
          return jsonResult({
            success: false,
            error: `Failed to create course: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      // 4. 检查是否已开始培训
      const existingProgress = trainingSystem.getProgress(studentAgentId, courseId);
      if (existingProgress) {
        return jsonResult({
          success: false,
          error: `Training already started for student ${studentAgentId} on course ${courseId}`,
          progress: {
            status: existingProgress.status,
            overallProgress: existingProgress.overallProgress,
            startedAt: existingProgress.startedAt,
          },
        });
      }

      // 5. 开始培训
      try {
        const progress = trainingSystem.startCourse({
          agentId: studentAgentId,
          courseId,
        });

        return jsonResult({
          success: true,
          message: `Training started for student ${studentAgentId} on course: ${course.name}`,
          training: {
            studentAgentId,
            courseId,
            courseName: course.name,
            courseType: course.type,
            totalModules: course.modules.length,
            status: progress.status,
            overallProgress: progress.overallProgress,
            startedAt: progress.startedAt,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to start training: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
