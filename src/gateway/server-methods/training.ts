/**
 * 培训系统 Gateway RPC Handlers
 * 
 * 提供智能体培训、技能转移、评估功能
 */

import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";

/**
 * 培训记录
 */
interface TrainingRecord {
  id: string;
  trainerId: string;
  traineeId: string;
  topic: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  startedAt?: number;
  completedAt?: number;
  progress?: number;
  feedback?: string;
}

/**
 * 培训课程
 */
interface TrainingCourse {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  duration: number;
  prerequisites?: string[];
  topics: string[];
  createdAt: number;
}

/**
 * 评估结果
 */
interface AssessmentResult {
  id: string;
  assessorId: string;
  targetId: string;
  skills: Record<string, number>; // skill name -> score (0-100)
  overallScore: number;
  feedback: string;
  assessedAt: number;
}

// 内存存储（生产环境应持久化）
const trainingRecords = new Map<string, TrainingRecord>();
const trainingCourses = new Map<string, TrainingCourse>();
const assessmentResults = new Map<string, AssessmentResult>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const trainingHandlers: GatewayRequestHandlers = {
  /**
   * training.train - 开始培训智能体
   */
  "training.train": async ({ params, respond }) => {
    try {
      const trainerId = normalizeAgentId(String(params.trainerId || ""));
      const traineeId = normalizeAgentId(String(params.traineeId || ""));
      const topic = String(params.topic || "");
      
      if (!trainerId || !traineeId || !topic) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "trainerId, traineeId, and topic are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const trainer = agents.find((a) => normalizeAgentId(a.id) === trainerId);
      const trainee = agents.find((a) => normalizeAgentId(a.id) === traineeId);
      
      if (!trainer || !trainee) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Trainer or trainee not found"));
        return;
      }
      
      const trainingId = generateId("training");
      const record: TrainingRecord = {
        id: trainingId,
        trainerId,
        traineeId,
        topic,
        status: "scheduled",
      };
      
      trainingRecords.set(trainingId, record);
      
      respond(true, {
        success: true,
        trainingId,
        message: `Training "${topic}" scheduled for ${traineeId} by ${trainerId}`,
        record,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * training.start - 开始培训
   */
  "training.start": async ({ params, respond }) => {
    try {
      const trainingId = String(params.trainingId || "");
      
      if (!trainingId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "trainingId is required"));
        return;
      }
      
      const record = trainingRecords.get(trainingId);
      if (!record) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Training ${trainingId} not found`));
        return;
      }
      
      if (record.status !== "scheduled") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Training ${trainingId} is already ${record.status}`));
        return;
      }
      
      record.status = "in_progress";
      record.startedAt = Date.now();
      record.progress = 0;
      
      trainingRecords.set(trainingId, record);
      
      respond(true, {
        success: true,
        message: `Training ${trainingId} started`,
        record,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * training.complete - 完成培训
   */
  "training.complete": async ({ params, respond }) => {
    try {
      const trainingId = String(params.trainingId || "");
      const feedback = String(params.feedback || "");
      
      if (!trainingId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "trainingId is required"));
        return;
      }
      
      const record = trainingRecords.get(trainingId);
      if (!record) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Training ${trainingId} not found`));
        return;
      }
      
      if (record.status !== "in_progress") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Training ${trainingId} is not in progress`));
        return;
      }
      
      record.status = "completed";
      record.completedAt = Date.now();
      record.progress = 100;
      record.feedback = feedback;
      
      trainingRecords.set(trainingId, record);
      
      respond(true, {
        success: true,
        message: `Training ${trainingId} completed`,
        record,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * training.assess - 评估智能体
   */
  "training.assess": async ({ params, respond }) => {
    try {
      const assessorId = normalizeAgentId(String(params.assessorId || ""));
      const targetId = normalizeAgentId(String(params.targetId || ""));
      const skills = (params.skills as Record<string, number>) || {};
      const feedback = String(params.feedback || "");
      
      if (!assessorId || !targetId || Object.keys(skills).length === 0) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "assessorId, targetId, and skills are required"));
        return;
      }
      
      const scores = Object.values(skills);
      const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      
      const assessmentId = generateId("assessment");
      const result: AssessmentResult = {
        id: assessmentId,
        assessorId,
        targetId,
        skills,
        overallScore,
        feedback,
        assessedAt: Date.now(),
      };
      
      assessmentResults.set(assessmentId, result);
      
      respond(true, {
        success: true,
        assessmentId,
        message: `Assessment completed for ${targetId}`,
        result,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * training.course.create - 创建培训课程
   */
  "training.course.create": async ({ params, respond }) => {
    try {
      const creatorId = normalizeAgentId(String(params.creatorId || ""));
      const name = String(params.name || "");
      const description = String(params.description || "");
      const duration = typeof params.duration === "number" ? params.duration : 0;
      const topics = (params.topics as string[]) || [];
      const prerequisites = (params.prerequisites as string[]) || [];
      
      if (!creatorId || !name || topics.length === 0) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "creatorId, name, and topics are required"));
        return;
      }
      
      const courseId = generateId("course");
      const course: TrainingCourse = {
        id: courseId,
        name,
        description,
        creatorId,
        duration,
        prerequisites,
        topics,
        createdAt: Date.now(),
      };
      
      trainingCourses.set(courseId, course);
      
      respond(true, {
        success: true,
        courseId,
        message: `Training course "${name}" created`,
        course,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * training.course.assign - 分配培训课程
   */
  "training.course.assign": async ({ params, respond }) => {
    try {
      const courseId = String(params.courseId || "");
      const traineeId = normalizeAgentId(String(params.traineeId || ""));
      const trainerId = normalizeAgentId(String(params.trainerId || ""));
      
      if (!courseId || !traineeId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "courseId and traineeId are required"));
        return;
      }
      
      const course = trainingCourses.get(courseId);
      if (!course) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Course ${courseId} not found`));
        return;
      }
      
      // 为课程中的每个主题创建培训记录
      const trainingIds: string[] = [];
      for (const topic of course.topics) {
        const trainingId = generateId("training");
        const record: TrainingRecord = {
          id: trainingId,
          trainerId: trainerId || course.creatorId,
          traineeId,
          topic,
          status: "scheduled",
        };
        trainingRecords.set(trainingId, record);
        trainingIds.push(trainingId);
      }
      
      respond(true, {
        success: true,
        message: `Course "${course.name}" assigned to ${traineeId}`,
        courseId,
        traineeId,
        trainingIds,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * training.transfer_skill - 技能转移
   */
  "training.transfer_skill": async ({ params, respond }) => {
    try {
      const sourceId = normalizeAgentId(String(params.sourceId || ""));
      const targetId = normalizeAgentId(String(params.targetId || ""));
      const skillName = String(params.skillName || "");
      
      if (!sourceId || !targetId || !skillName) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sourceId, targetId, and skillName are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const source = agents.find((a) => normalizeAgentId(a.id) === sourceId);
      const target = agents.find((a) => normalizeAgentId(a.id) === targetId);
      
      if (!source || !target) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Source or target agent not found"));
        return;
      }
      
      const trainingId = generateId("training");
      const record: TrainingRecord = {
        id: trainingId,
        trainerId: sourceId,
        traineeId: targetId,
        topic: `Skill Transfer: ${skillName}`,
        status: "scheduled",
      };
      
      trainingRecords.set(trainingId, record);
      
      respond(true, {
        success: true,
        trainingId,
        message: `Skill "${skillName}" transfer scheduled from ${sourceId} to ${targetId}`,
        record,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * training.certify_trainer - 认证培训师
   */
  "training.certify_trainer": async ({ params, respond }) => {
    try {
      const trainerId = normalizeAgentId(String(params.trainerId || ""));
      const certifierId = normalizeAgentId(String(params.certifierId || ""));
      const specialties = (params.specialties as string[]) || [];
      
      if (!trainerId || !certifierId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "trainerId and certifierId are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      
      const trainer = agents.find((a) => normalizeAgentId(a.id) === trainerId);
      if (!trainer) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Trainer ${trainerId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Trainer ${trainerId} certified by ${certifierId}`,
        trainerId,
        certifierId,
        specialties,
        certifiedAt: Date.now(),
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
