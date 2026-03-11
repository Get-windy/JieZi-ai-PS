/**
 * Plan-and-Execute toolset for structured task planning.
 *
 * Implements the Plan-and-Execute paradigm where an agent:
 * 1. Creates a plan with ordered steps (plan_create)
 * 2. Marks steps complete as it executes (plan_step_done)
 * 3. Closes the plan when all steps are done (plan_complete)
 *
 * The plan is held in a lightweight in-memory registry keyed by planId.
 * If an agent session is lost the plan is also lost — this is intentional;
 * plans are meant to be ephemeral within a single agent run.
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../agent-tool.js";
import { jsonResult } from "../tool-result.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanStep {
  id: string;
  description: string;
  done: boolean;
  completedAt?: number;
  note?: string;
}

interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  createdAt: number;
  completedAt?: number;
  status: "active" | "completed" | "abandoned";
}

// ---------------------------------------------------------------------------
// In-memory registry
// ---------------------------------------------------------------------------

const PLAN_REGISTRY = new Map<string, Plan>();
let planCounter = 0;

function generatePlanId(): string {
  planCounter += 1;
  return `plan_${Date.now()}_${planCounter}`;
}

function generateStepId(index: number): string {
  return `step_${index + 1}`;
}

// ---------------------------------------------------------------------------
// plan_create Tool
// ---------------------------------------------------------------------------

const PlanCreateSchema = Type.Object({
  goal: Type.String({
    description: "High-level goal this plan aims to achieve.",
    minLength: 1,
  }),
  steps: Type.Array(
    Type.String({ description: "A concrete, actionable step description.", minLength: 1 }),
    {
      description:
        "Ordered list of steps to complete the goal. Each step should be specific and independently executable.",
      minItems: 1,
      maxItems: 50,
    },
  ),
});

export function createPlanCreateTool(): AnyAgentTool {
  return {
    label: "Plan Create",
    name: "plan_create",
    description:
      "Create a structured execution plan with ordered steps. Use this at the start of a complex task to decompose it into concrete, actionable steps before executing them one by one. Returns a planId to track progress.",
    parameters: PlanCreateSchema,
    execute: async (_toolCallId, args) => {
      const params = args as { goal: string; steps: string[] };

      if (!params.goal || typeof params.goal !== "string") {
        return jsonResult({ error: "missing_goal", message: "goal is required." });
      }

      const rawSteps = Array.isArray(params.steps) ? params.steps : [];
      if (rawSteps.length === 0) {
        return jsonResult({ error: "missing_steps", message: "At least one step is required." });
      }

      const planId = generatePlanId();
      const steps: PlanStep[] = rawSteps.map((desc, idx) => ({
        id: generateStepId(idx),
        description: typeof desc === "string" ? desc.trim() : String(desc),
        done: false,
      }));

      const plan: Plan = {
        id: planId,
        goal: params.goal.trim(),
        steps,
        createdAt: Date.now(),
        status: "active",
      };

      PLAN_REGISTRY.set(planId, plan);

      return jsonResult({
        planId,
        goal: plan.goal,
        stepCount: steps.length,
        steps: steps.map((s) => ({ id: s.id, description: s.description })),
        message: `Plan created with ${steps.length} step(s). Execute steps in order and call plan_step_done after each.`,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// plan_step_done Tool
// ---------------------------------------------------------------------------

const PlanStepDoneSchema = Type.Object({
  planId: Type.String({ description: "The planId returned by plan_create.", minLength: 1 }),
  stepId: Type.String({
    description: "The stepId to mark as done (e.g. step_1, step_2).",
    minLength: 1,
  }),
  note: Type.Optional(
    Type.String({
      description: "Optional brief note about the outcome or findings from this step.",
    }),
  ),
});

export function createPlanStepDoneTool(): AnyAgentTool {
  return {
    label: "Plan Step Done",
    name: "plan_step_done",
    description:
      "Mark a plan step as completed. Call this after successfully executing each step in your plan. Returns remaining steps so you know what to do next.",
    parameters: PlanStepDoneSchema,
    execute: async (_toolCallId, args) => {
      const params = args as { planId: string; stepId: string; note?: string };

      const plan = PLAN_REGISTRY.get(params.planId);
      if (!plan) {
        return jsonResult({
          error: "plan_not_found",
          message: `No plan found with id "${params.planId}". Create a plan first with plan_create.`,
        });
      }

      if (plan.status === "completed") {
        return jsonResult({
          error: "plan_already_completed",
          message: `Plan "${params.planId}" is already completed.`,
        });
      }

      if (plan.status === "abandoned") {
        return jsonResult({
          error: "plan_abandoned",
          message: `Plan "${params.planId}" has been abandoned.`,
        });
      }

      const step = plan.steps.find((s) => s.id === params.stepId);
      if (!step) {
        return jsonResult({
          error: "step_not_found",
          message: `Step "${params.stepId}" not found in plan "${params.planId}". Valid step ids: ${plan.steps.map((s) => s.id).join(", ")}.`,
        });
      }

      if (step.done) {
        return jsonResult({
          error: "step_already_done",
          message: `Step "${params.stepId}" is already marked as done.`,
        });
      }

      step.done = true;
      step.completedAt = Date.now();
      if (params.note) {
        step.note = params.note.trim();
      }

      const remaining = plan.steps.filter((s) => !s.done);
      const doneCount = plan.steps.filter((s) => s.done).length;
      const allDone = remaining.length === 0;

      if (allDone) {
        plan.status = "completed";
        plan.completedAt = Date.now();
      }

      return jsonResult({
        planId: params.planId,
        stepId: params.stepId,
        stepDescription: step.description,
        progress: `${doneCount}/${plan.steps.length} steps done`,
        allDone,
        remainingSteps: remaining.map((s) => ({ id: s.id, description: s.description })),
        message: allDone
          ? "All steps done! Call plan_complete to finalize the plan."
          : `Step done. ${remaining.length} step(s) remaining.`,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// plan_complete Tool
// ---------------------------------------------------------------------------

const PlanCompleteSchema = Type.Object({
  planId: Type.String({ description: "The planId returned by plan_create.", minLength: 1 }),
  summary: Type.Optional(
    Type.String({
      description:
        "Optional brief summary of what was accomplished. Useful for handing off context.",
    }),
  ),
});

export function createPlanCompleteTool(): AnyAgentTool {
  return {
    label: "Plan Complete",
    name: "plan_complete",
    description:
      "Finalize and close a plan after all steps have been completed. Returns a summary of the executed plan. Use this to signal task completion in a structured way.",
    parameters: PlanCompleteSchema,
    execute: async (_toolCallId, args) => {
      const params = args as { planId: string; summary?: string };

      const plan = PLAN_REGISTRY.get(params.planId);
      if (!plan) {
        return jsonResult({
          error: "plan_not_found",
          message: `No plan found with id "${params.planId}".`,
        });
      }

      const undoneSteps = plan.steps.filter((s) => !s.done);
      if (undoneSteps.length > 0) {
        return jsonResult({
          error: "steps_incomplete",
          message: `Cannot complete plan: ${undoneSteps.length} step(s) not yet done.`,
          pendingSteps: undoneSteps.map((s) => ({ id: s.id, description: s.description })),
        });
      }

      plan.status = "completed";
      plan.completedAt = plan.completedAt ?? Date.now();

      // Clean up from registry after a short delay to avoid use-after-complete bugs
      setTimeout(() => PLAN_REGISTRY.delete(params.planId), 60_000);

      const durationMs = plan.completedAt - plan.createdAt;

      return jsonResult({
        planId: params.planId,
        goal: plan.goal,
        stepCount: plan.steps.length,
        durationMs,
        summary: params.summary?.trim() || undefined,
        steps: plan.steps.map((s) => ({
          id: s.id,
          description: s.description,
          note: s.note || undefined,
        })),
        message: "Plan completed successfully.",
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function createPlanTaskTools(): AnyAgentTool[] {
  return [createPlanCreateTool(), createPlanStepDoneTool(), createPlanCompleteTool()];
}

export const __testing = {
  PLAN_REGISTRY,
} as const;
