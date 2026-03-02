/**
 * 培训系统工具
 * 
 * 提供智能体培训、技能转移、评估功能
 */

import { Type } from "@sinclair/typebox";
import { jsonResult } from "./common.js";
import type { AnyAgentTool } from "./common.js";
import { callGatewayTool } from "./gateway.js";

export function createTrainAgentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Train Agent",
    name: "train_agent",
    description: "Start training an agent on a specific topic. Requires trainer role.",
    parameters: Type.Object({
      traineeId: Type.String({ description: "The ID of the agent to train" }),
      topic: Type.String({ description: "The training topic" }),
    }),
    execute: async (_toolCallId, args) => {
      const { traineeId, topic } = args as { traineeId: string; topic: string };
      const response = await callGatewayTool("training.train", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        trainerId: opts?.currentAgentId || "system",
        traineeId,
        topic,
      });
      return jsonResult(response);
    },
  };
}

export function createTrainingStartTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Training Start",
    name: "training_start",
    description: "Start a scheduled training session.",
    parameters: Type.Object({
      trainingId: Type.String({ description: "The ID of the training session" }),
    }),
    execute: async (_toolCallId, args) => {
      const { trainingId } = args as { trainingId: string };
      const response = await callGatewayTool("training.start", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        trainingId,
      });
      return jsonResult(response);
    },
  };
}

export function createTrainingCompleteTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Training Complete",
    name: "training_complete",
    description: "Mark a training session as complete with feedback.",
    parameters: Type.Object({
      trainingId: Type.String({ description: "The ID of the training session" }),
      feedback: Type.Optional(Type.String({ description: "Training feedback" })),
    }),
    execute: async (_toolCallId, args) => {
      const { trainingId, feedback } = args as { trainingId: string; feedback?: string };
      const response = await callGatewayTool("training.complete", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        trainingId,
        feedback: feedback || "",
      });
      return jsonResult(response);
    },
  };
}

export function createAssessAgentTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Assess Agent",
    name: "assess_agent",
    description: "Assess an agent's skills and provide scores.",
    parameters: Type.Object({
      targetId: Type.String({ description: "The ID of the agent to assess" }),
      skills: Type.Record(Type.String(), Type.Number({ minimum: 0, maximum: 100 }), {
        description: "Skill name to score mapping (0-100)",
      }),
      feedback: Type.Optional(Type.String({ description: "Assessment feedback" })),
    }),
    execute: async (_toolCallId, args) => {
      const { targetId, skills, feedback } = args as {
        targetId: string;
        skills: Record<string, number>;
        feedback?: string;
      };
      const response = await callGatewayTool("training.assess", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        assessorId: opts?.currentAgentId || "system",
        targetId,
        skills,
        feedback: feedback || "",
      });
      return jsonResult(response);
    },
  };
}

export function createCreateTrainingCourseTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Create Training Course",
    name: "create_training_course",
    description: "Create a new training course with multiple topics.",
    parameters: Type.Object({
      name: Type.String({ description: "Course name" }),
      description: Type.String({ description: "Course description" }),
      topics: Type.Array(Type.String(), { description: "List of topics covered" }),
      duration: Type.Optional(Type.Number({ description: "Course duration in minutes" })),
      prerequisites: Type.Optional(Type.Array(Type.String(), { description: "Required prerequisites" })),
    }),
    execute: async (_toolCallId, args) => {
      const { name, description, topics, duration, prerequisites } = args as {
        name: string;
        description: string;
        topics: string[];
        duration?: number;
        prerequisites?: string[];
      };
      const response = await callGatewayTool("training.course.create", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        creatorId: opts?.currentAgentId || "system",
        name,
        description,
        topics,
        duration: duration || 60,
        prerequisites: prerequisites || [],
      });
      return jsonResult(response);
    },
  };
}

export function createAssignTrainingTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Assign Training",
    name: "assign_training",
    description: "Assign a training course to an agent.",
    parameters: Type.Object({
      courseId: Type.String({ description: "The ID of the training course" }),
      traineeId: Type.String({ description: "The ID of the agent to assign training to" }),
      trainerId: Type.Optional(Type.String({ description: "Optional trainer ID" })),
    }),
    execute: async (_toolCallId, args) => {
      const { courseId, traineeId, trainerId } = args as {
        courseId: string;
        traineeId: string;
        trainerId?: string;
      };
      const response = await callGatewayTool("training.course.assign", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        courseId,
        traineeId,
        trainerId: trainerId || opts?.currentAgentId || "system",
      });
      return jsonResult(response);
    },
  };
}

export function createTransferSkillTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Transfer Skill",
    name: "transfer_skill",
    description: "Transfer a specific skill from one agent to another.",
    parameters: Type.Object({
      targetId: Type.String({ description: "The ID of the agent to receive the skill" }),
      skillName: Type.String({ description: "The name of the skill to transfer" }),
    }),
    execute: async (_toolCallId, args) => {
      const { targetId, skillName } = args as { targetId: string; skillName: string };
      const response = await callGatewayTool("training.transfer_skill", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        sourceId: opts?.currentAgentId || "system",
        targetId,
        skillName,
      });
      return jsonResult(response);
    },
  };
}

export function createCertifyTrainerTool(opts?: {
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Certify Trainer",
    name: "certify_trainer",
    description: "Certify an agent as a trainer with specific specialties.",
    parameters: Type.Object({
      trainerId: Type.String({ description: "The ID of the agent to certify as trainer" }),
      specialties: Type.Optional(Type.Array(Type.String(), { description: "Training specialties" })),
    }),
    execute: async (_toolCallId, args) => {
      const { trainerId, specialties } = args as { trainerId: string; specialties?: string[] };
      const response = await callGatewayTool("training.certify_trainer", opts?.currentAgentId ? { agentId: opts.currentAgentId } : undefined, {
        trainerId,
        certifierId: opts?.currentAgentId || "system",
        specialties: specialties || [],
      });
      return jsonResult(response);
    },
  };
}
