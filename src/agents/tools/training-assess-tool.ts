/**
 * Phase 6: 培训评估工具
 *
 * 允许培训师评估学员的培训成果并颁发证书
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { LifecycleManager } from "../../lifecycle/lifecycle-manager.js";
import { TrainingSystem } from "../../lifecycle/training-system.js";
import { jsonResult, readStringParam } from "./common.js";

/**
 * training_assess 工具参数 schema
 */
const TrainingAssessToolSchema = Type.Object({
  /** 学员智能助手ID */
  studentAgentId: Type.String({ minLength: 1, maxLength: 64 }),
  /** 课程ID */
  courseId: Type.String({ minLength: 1, maxLength: 128 }),
  /** 评估分数（0-100） */
  assessmentScore: Type.Number({ minimum: 0, maximum: 100 }),
  /** 可选：评估备注 */
  comments: Type.Optional(Type.String()),
  /** 可选：是否颁发证书 */
  issueCertificate: Type.Optional(Type.Boolean()),
  /** 可选：证书有效期（天数） */
  certificateValidDays: Type.Optional(Type.Number({ minimum: 1 })),
});

/**
 * 创建培训评估工具
 */
export function createTrainingAssessTool(opts?: {
  /** 当前工具调用者的智能助手ID */
  trainerAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Training Assess",
    name: "training_assess",
    description:
      "Assess a student's training progress and optionally issue a certificate. The trainer can evaluate course completion, provide scores, and certify skills.",
    parameters: TrainingAssessToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const studentAgentId = readStringParam(params, "studentAgentId", { required: true });
      const courseId = readStringParam(params, "courseId", { required: true });
      const comments = readStringParam(params, "comments");
      const issueCert =
        typeof params.issueCertificate === "boolean" ? params.issueCertificate : true;
      const validDays =
        typeof params.certificateValidDays === "number" ? params.certificateValidDays : undefined;

      // 验证分数
      const assessmentScore =
        typeof params.assessmentScore === "number" ? params.assessmentScore : null;
      if (assessmentScore === null) {
        return jsonResult({
          success: false,
          error: "assessmentScore is required and must be a number between 0 and 100",
        });
      }

      if (assessmentScore < 0 || assessmentScore > 100) {
        return jsonResult({
          success: false,
          error: "assessmentScore must be between 0 and 100",
        });
      }

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

      const trainerAgent = cfg.agents?.list?.find((a) => a.id === trainerAgentId);
      if (!trainerAgent) {
        return jsonResult({
          success: false,
          error: `Trainer agent not found: ${trainerAgentId}`,
        });
      }

      // 2. 验证学员
      const studentAgent = cfg.agents?.list?.find((a) => a.id === studentAgentId);
      if (!studentAgent) {
        return jsonResult({
          success: false,
          error: `Student agent not found: ${studentAgentId}`,
        });
      }

      // 3. 检查课程
      const course = trainingSystem.getCourse(courseId);
      if (!course) {
        return jsonResult({
          success: false,
          error: `Course not found: ${courseId}`,
        });
      }

      // 4. 检查培训进度
      const progress = trainingSystem.getProgress(studentAgentId, courseId);
      if (!progress) {
        return jsonResult({
          success: false,
          error: `No training progress found for student ${studentAgentId} on course ${courseId}`,
        });
      }

      if (progress.status === "completed") {
        return jsonResult({
          success: false,
          error: `Training already completed for student ${studentAgentId} on course ${courseId}`,
          progress: {
            status: progress.status,
            passed: progress.passed,
            assessmentScore: progress.assessmentScore,
            completedAt: progress.completedAt,
          },
        });
      }

      // 5. 完成课程评估
      try {
        const updatedProgress = trainingSystem.completeCourse({
          agentId: studentAgentId,
          courseId,
          assessmentScore,
        });

        const passed = updatedProgress.passed ?? false;

        // 6. 记录评估事件
        lifecycleManager.recordEvent({
          agentId: studentAgentId,
          eventType: passed ? "training_completed" : "skill_acquired",
          triggeredBy: trainerAgentId,
          metadata: {
            courseId,
            score: assessmentScore,
            passed,
            comments,
          },
        });

        // 7. 颁发证书
        let certificate = null;
        if (passed && issueCert) {
          const expiresAt = validDays ? Date.now() + validDays * 24 * 60 * 60 * 1000 : undefined;

          certificate = trainingSystem.issueCertificate({
            agentId: studentAgentId,
            type: "course-completion",
            courseId,
            title: `${course.name} - 课程完成证书`,
            expiresAt,
          });
        }

        return jsonResult({
          success: true,
          message: `Training assessment completed for student ${studentAgentId}`,
          assessment: {
            studentAgentId,
            courseId,
            courseName: course.name,
            assessmentScore,
            passed,
            status: updatedProgress.status,
            overallProgress: updatedProgress.overallProgress,
            completedAt: updatedProgress.completedAt,
            totalTimeSpent: updatedProgress.totalTimeSpent,
            comments,
          },
          certificate: certificate
            ? {
                id: certificate.id,
                title: certificate.title,
                verificationCode: certificate.verificationCode,
                issuedAt: certificate.issuedAt,
                expiresAt: certificate.expiresAt,
              }
            : null,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to complete assessment: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
