/**
 * Phase 6: Training System RPC Methods
 * 培训系统 RPC 方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { lifecycleManager } from "../../lifecycle/lifecycle-manager.js";
import { skillManagement } from "../../lifecycle/skill-management.js";
import { trainingSystem } from "../../lifecycle/training-system.js";

/**
 * 培训系统 RPC 方法处理器
 */
export const trainingMethods: GatewayRequestHandlers = {
  /**
   * 获取课程列表
   */
  "training.courses.list": ({ params, respond }) => {
    try {
      const type = params?.type as string | undefined;

      let courses = trainingSystem.getAllCourses();

      // 按类型筛选
      if (type && type !== "all") {
        courses = trainingSystem.getCoursesByType(type as any);
      }

      // 转换为前端格式
      const formattedCourses = courses.map((course) => ({
        id: course.id,
        title: course.name, // 后端使用 name
        description: course.description,
        type: course.type,
        level: course.difficulty, // 后端使用 difficulty
        duration: course.estimatedDuration, // 后端使用 estimatedDuration
        modules: course.modules,
        hasAssessment: course.hasAssessment,
        passingScore: course.passingScore,
        prerequisites: course.prerequisites,
        tags: course.tags,
        createdAt: course.createdAt,
        createdBy: course.createdBy,
        updatedAt: course.updatedAt,
      }));

      respond(true, { courses: formattedCourses }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_COURSES_LIST_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 获取培训进度列表
   */
  "training.progresses.list": ({ params, respond }) => {
    try {
      const agentId = params?.agentId as string | undefined;

      let progresses = agentId
        ? trainingSystem.getAgentProgresses(agentId)
        : trainingSystem.getAllProgresses();

      // 转换为前端格式
      const formattedProgresses = progresses.map((progress: any) => ({
        id: progress.id,
        agentId: progress.agentId,
        courseId: progress.courseId,
        status: progress.status,
        overallProgress: progress.overallProgress,
        moduleProgress: (Array.from(progress.moduleProgress.entries()) as Array<[string, any]>).map(
          ([moduleId, mp]) => ({
            moduleId,
            started: mp.started,
            completed: mp.completed,
            startedAt: mp.startedAt,
            completedAt: mp.completedAt,
            timeSpent: mp.timeSpent,
          }),
        ),
        exerciseResults: (
          Array.from(progress.exerciseResults.entries()) as Array<[string, any]>
        ).map(([exerciseId, result]) => ({
          exerciseId,
          score: result.score,
          totalPoints: result.totalPoints,
          passed: result.passed,
          attemptCount: result.attemptCount,
          lastAttemptAt: result.lastAttemptAt,
        })),
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        totalTimeSpent: progress.totalTimeSpent,
        passed: progress.passed,
        assessmentScore: progress.assessmentScore,
      }));

      respond(true, { progresses: formattedProgresses }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_PROGRESSES_LIST_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 获取证书列表
   */
  "training.certificates.list": ({ params, respond }) => {
    try {
      const agentId = params?.agentId as string | undefined;

      let certificates = agentId
        ? trainingSystem.getAgentCertificates(agentId)
        : trainingSystem.getAllCertificates();

      // 转换为前端格式
      const formattedCertificates = certificates.map((cert: any) => ({
        id: cert.id,
        agentId: cert.agentId,
        courseId: cert.courseId,
        type: cert.type,
        title: cert.title,
        description: cert.description,
        level: cert.level,
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
        verificationCode: cert.verificationCode,
      }));

      respond(true, { certificates: formattedCertificates }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_CERTIFICATES_LIST_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 开始课程学习
   */
  "training.course.start": ({ params, respond }) => {
    try {
      const courseId = params?.courseId as string;
      const agentId = params?.agentId as string;

      if (!courseId || !agentId) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "缺少必需参数：courseId 和 agentId",
        });
        return;
      }

      const progress = trainingSystem.startCourse({ agentId, courseId });

      respond(
        true,
        {
          progress: {
            id: progress.id,
            agentId: progress.agentId,
            courseId: progress.courseId,
            status: progress.status,
            overallProgress: progress.overallProgress,
            startedAt: progress.startedAt,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_COURSE_START_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 完成模块
   */
  "training.module.complete": ({ params, respond }) => {
    try {
      const agentId = params?.agentId as string;
      const courseId = params?.courseId as string;
      const moduleId = params?.moduleId as string;
      const timeSpent = (params?.timeSpent as number) || 0;

      if (!agentId || !courseId || !moduleId) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "缺少必需参数：agentId, courseId 和 moduleId",
        });
        return;
      }

      const progress = trainingSystem.completeModule({
        agentId,
        courseId,
        moduleId,
        timeSpent,
      });

      respond(
        true,
        {
          progress: {
            id: progress.id,
            overallProgress: progress.overallProgress,
            totalTimeSpent: progress.totalTimeSpent,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_MODULE_COMPLETE_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 完成课程
   */
  "training.course.complete": ({ params, respond }) => {
    try {
      const agentId = params?.agentId as string;
      const courseId = params?.courseId as string;
      const assessmentScore = params?.assessmentScore as number | undefined;

      if (!agentId || !courseId) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "缺少必需参数：agentId 和 courseId",
        });
        return;
      }

      const progress = trainingSystem.completeCourse({
        agentId,
        courseId,
        assessmentScore,
      });

      respond(
        true,
        {
          progress: {
            id: progress.id,
            status: progress.status,
            passed: progress.passed,
            assessmentScore: progress.assessmentScore,
            completedAt: progress.completedAt,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_COURSE_COMPLETE_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 创建课程
   */
  "training.course.create": ({ params, respond }) => {
    try {
      const courseData = params as any;

      if (!courseData.id || !courseData.title || !courseData.type) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "缺少必需参数：id, title 和 type",
        });
        return;
      }

      const course = trainingSystem.createCourse({
        id: courseData.id,
        name: courseData.title, // 前端传 title，后端用 name
        description: courseData.description || "",
        type: courseData.type,
        difficulty: courseData.level || "beginner", // 前端传 level，后端用 difficulty
        estimatedDuration: courseData.duration || 60, // 前端传 duration
        modules: courseData.modules || [],
        hasAssessment: courseData.hasAssessment || false,
        passingScore: courseData.passingScore,
        prerequisites: courseData.prerequisites,
        tags: courseData.tags,
        createdBy: courseData.createdBy || "system",
      });

      respond(true, { course }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_COURSE_CREATE_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 获取课程详情
   */
  "training.course.get": ({ params, respond }) => {
    try {
      const courseId = params?.courseId as string;

      if (!courseId) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "缺少必需参数：courseId",
        });
        return;
      }

      const course = trainingSystem.getCourse(courseId);

      if (!course) {
        respond(false, undefined, {
          code: "COURSE_NOT_FOUND",
          message: `课程不存在：${courseId}`,
        });
        return;
      }

      respond(true, { course }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_COURSE_GET_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 获取培训统计
   */
  "training.stats": ({ params, respond }) => {
    try {
      const stats = trainingSystem.getStatistics();

      respond(true, { stats }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_STATS_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },

  /**
   * 提交练习答案
   */
  "training.exercise.submit": ({ params, respond }) => {
    try {
      const agentId = params?.agentId as string;
      const courseId = params?.courseId as string;
      const exerciseId = params?.exerciseId as string;
      const answers = params?.answers;

      if (!agentId || !courseId || !exerciseId || !answers) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "缺少必需参数：agentId, courseId, exerciseId 和 answers",
        });
        return;
      }

      const result = trainingSystem.submitExercise({
        agentId,
        courseId,
        exerciseId,
        answers,
      });

      respond(true, { result }, undefined);
    } catch (err) {
      respond(false, undefined, {
        code: "TRAINING_EXERCISE_SUBMIT_ERROR",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  },
};
