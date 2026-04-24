/**
 * Sprint 批量回溯和修正机制
 * 
 * 功能：
 * 当发现某个历史 Sprint（如 Sprint 2）存在问题时，
 * 从该 Sprint 开始逐步向后排查并创建修正任务。
 * 
 * 工作流程：
 * 1. 获取指定项目的所有 Sprint 历史
 * 2. 从 startSprintNumber 开始，逐个分析每个 Sprint 的任务
 * 3. 识别有问题的任务（基于提供的筛选条件）
 * 4. 为每个问题任务创建修正任务
 * 5. 可选：重新打开所有问题任务
 * 6. 生成完整的回溯报告
 * 
 * 使用场景：
 * - 当前在 Sprint 28，发现 Sprint 2 有架构缺陷
 * - 需要从 Sprint 2 开始，逐个 Sprint 向后排查
 * - 为每个有问题的任务创建修正任务
 * - 形成完整的修正链条和追溯历史
 */

import type { Task } from "../../tasks/types.js";
import * as storage from "../../tasks/storage.js";

/**
 * Sprint 批量回溯和修正
 */
export async function batchRetrospectAndCorrect(params: {
  projectId: string;
  startSprintNumber: number;
  endSprintNumber?: number;
  problemReason: string;
  correctionType?: "bugfix" | "rework" | "improvement";
  reopenOriginals?: boolean;
  autoCreateCorrections?: boolean;
  requesterId?: string;
  taskFilter?: {
    status?: string[];
    types?: string[];
    tags?: string[];
  };
}): Promise<{
  success: boolean;
  totalSprintsAnalyzed: number;
  totalTasksScanned: number;
  problematicTasksFound: number;
  correctionsCreated: number;
  corrections: Array<{
    originalTaskId: string;
    originalTaskTitle: string;
    sprintNumber: number;
    correctionTaskId?: string;
    reason: string;
  }>;
  report: {
    projectId: string;
    retrospectScope: {
      startSprint: number;
      endSprint: number;
      totalSprintsAnalyzed: number;
      sprintNumbers: number[];
    };
    statistics: {
      totalTasksScanned: number;
      problematicTasksFound: number;
      correctionsCreated: number;
      correctionsSkipped: number;
    };
    problematicTasksBySprint: Array<{
      sprintNumber: number;
      taskCount: number;
      taskIds: string[];
    }>;
    recommendation: string;
  };
  message: string;
}> {
  const {
    projectId,
    startSprintNumber,
    endSprintNumber: endSprintNumberParam,
    problemReason,
    correctionType = "rework",
    reopenOriginals = true,
    autoCreateCorrections = true,
    requesterId = "system",
    taskFilter = {},
  } = params;

  // 获取项目的所有任务（不限制数量）
  const allProjectTasks = await storage.listTasks({ projectId, limit: 10000 });

  if (allProjectTasks.length === 0) {
    throw new Error(`项目 ${projectId} 没有找到任何任务`);
  }

  // 从任务元数据中提取 Sprint 信息并分组
  const sprintTasksMap = new Map<number, Task[]>();

  for (const task of allProjectTasks) {
    // 从 metadata.sprintNumber 提取 Sprint 编号
    const sprintNumber = (task.metadata as Record<string, unknown>)?.sprintNumber as
      | number
      | undefined;
    if (sprintNumber) {
      if (!sprintTasksMap.has(sprintNumber)) {
        sprintTasksMap.set(sprintNumber, []);
      }
      sprintTasksMap.get(sprintNumber)!.push(task);
    }
  }

  if (sprintTasksMap.size === 0) {
    throw new Error(
      "没有找到带 Sprint 信息的任务。请确保任务已关联 sprintNumber 元数据。",
    );
  }

  // 确定 Sprint 范围
  const sprintNumbers = Array.from(sprintTasksMap.keys()).toSorted((a, b) => a - b);
  const actualEndSprint = endSprintNumberParam ?? sprintNumbers[sprintNumbers.length - 1];

  if (startSprintNumber > actualEndSprint) {
    throw new Error(
      `startSprintNumber (${startSprintNumber}) 不能大于 endSprintNumber (${actualEndSprint})`,
    );
  }

  // 筛选目标 Sprint 范围
  const targetSprints = sprintNumbers.filter(
    (n) => n >= startSprintNumber && n <= actualEndSprint,
  );

  // 分析每个 Sprint 的任务，识别问题任务
  const problematicTaskIds: string[] = [];
  const corrections: Array<{
    originalTaskId: string;
    originalTaskTitle: string;
    sprintNumber: number;
    correctionTaskId?: string;
    reason: string;
  }> = [];

  let totalTasksScanned = 0;
  const filterStatuses = taskFilter.status ?? ["done"]; // 默认只检查已完成任务
  const filterTypes = taskFilter.types;
  const filterTags = taskFilter.tags;

  for (const sprintNum of targetSprints) {
    const sprintTasks = sprintTasksMap.get(sprintNum) ?? [];
    totalTasksScanned += sprintTasks.length;

    for (const task of sprintTasks) {
      // 应用筛选条件
      if (filterStatuses.length > 0 && !filterStatuses.includes(task.status)) {
        continue; // 状态不匹配，跳过
      }
      if (filterTypes && filterTypes.length > 0 && task.type && !filterTypes.includes(task.type)) {
        continue; // 类型不匹配，跳过
      }
      if (filterTags && filterTags.length > 0) {
        const taskTags = task.tags ?? [];
        const hasMatchingTag = filterTags.some((tag) => taskTags.includes(tag));
        if (!hasMatchingTag) {
          continue; // 标签不匹配，跳过
        }
      }

      // 此任务符合筛选条件，标记为问题任务
      problematicTaskIds.push(task.id);

      // 自动创建修正任务（如果启用）
      let correctionTaskId: string | undefined;
      if (autoCreateCorrections) {
        try {
          const correctionTaskId_gen = `task-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          const now = Date.now();

          const correctionTask: Task = {
            id: correctionTaskId_gen,
            title: `[Sprint${sprintNum} 回溯修正] ${task.title || task.id} - ${correctionType === "bugfix" ? "缺陷修复" : correctionType === "rework" ? "返工" : "改进"}`,
            description: `## Sprint 回溯发现的问题

${problemReason}

## 原任务信息

- 原任务 ID: ${task.id}
- 原任务标题: ${task.title || "无标题"}
- 所属 Sprint: ${sprintNum}
- 原任务状态: ${task.status}
- 原任务类型: ${task.type || "未指定"}
- 发现时间: ${new Date().toISOString()}

## 修正目标

请修复上述问题，并确保不引入新的问题。

## 回溯说明

此任务是批量回溯修正机制自动创建的。当前项目进展到 Sprint ${actualEndSprint}，但发现从 Sprint ${startSprintNumber} 开始存在问题。需要从 Sprint ${startSprintNumber} 开始逐步排查并修正。`,
            creatorId: requesterId,
            creatorType: "human",
            assignees: [],
            status: "todo",
            priority: "high", // 回溯修正任务默认高优先级
            type: correctionType === "bugfix" ? "bugfix" as const : "other" as const,
            scope: task.scope,
            projectId: task.projectId,
            organizationId: task.organizationId,
            teamId: task.teamId,
            parentTaskId: task.parentTaskId,
            dependencies: [task.id],
            tags: [...(task.tags ?? []), "sprint-retrospect", "correction", correctionType, `sprint-${sprintNum}`],
            labels: [...(task.labels ?? []), "needs-fixing", "retrospective"],
            timeTracking: { timeSpent: 0 },
            createdAt: now,
            correctionOf: task.id,
            metadata: {
              sprintNumber: sprintNum,
              retrospectStartSprint: startSprintNumber,
              retrospectEndSprint: actualEndSprint,
              correctionReason: problemReason,
              originalTaskStatus: task.status,
              correctionType,
              batchCorrection: true,
            },
          };

          await storage.createTask(correctionTask);
          correctionTaskId = correctionTaskId_gen;

          // 更新原任务：添加修正任务关联和重新打开历史
          const correctionTasks = task.correctionTasks ?? [];
          correctionTasks.push(correctionTaskId);

          const updates: Partial<Task> = {
            correctionTasks,
          };

          // 如果需要重新打开原任务
          if (
            reopenOriginals &&
            (task.status === "done" || task.status === "cancelled")
          ) {
            const reopenRecord = {
              id: `reopen-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
              reason: `Sprint ${startSprintNumber}-${actualEndSprint} 回溯发现质量问题，已创建修正任务 ${correctionTaskId}`,
              previousStatus: task.status,
              newStatus: "needs-rework" as const,
              reopenedBy: requesterId,
              reopenedByType: "human" as const,
              reopenedAt: now,
              correctionTaskId,
              notes: problemReason,
            };

            const reopenHistory = task.reopenHistory ?? [];
            reopenHistory.push(reopenRecord);

            updates.status = "needs-rework";
            updates.reopenHistory = reopenHistory;
            updates.reopenCount = (task.reopenCount ?? 0) + 1;
          }

          await storage.updateTask(task.id, updates);
        } catch (err) {
          console.error(
            `[Batch Retrospect] Failed to create correction task for ${task.id}:`,
            err,
          );
          // 继续处理下一个任务，不中断整个流程
        }
      }

      corrections.push({
        originalTaskId: task.id,
        originalTaskTitle: task.title || "无标题",
        sprintNumber: sprintNum,
        correctionTaskId,
        reason: problemReason,
      });
    }
  }

  // 生成回溯报告
  const report = {
    projectId,
    retrospectScope: {
      startSprint: startSprintNumber,
      endSprint: actualEndSprint,
      totalSprintsAnalyzed: targetSprints.length,
      sprintNumbers: targetSprints,
    },
    statistics: {
      totalTasksScanned,
      problematicTasksFound: problematicTaskIds.length,
      correctionsCreated: corrections.filter((c) => c.correctionTaskId).length,
      correctionsSkipped: corrections.filter((c) => !c.correctionTaskId).length,
    },
    problematicTasksBySprint: targetSprints.map((sprintNum) => ({
      sprintNumber: sprintNum,
      taskCount: corrections.filter((c) => c.sprintNumber === sprintNum).length,
      taskIds: corrections
        .filter((c) => c.sprintNumber === sprintNum)
        .map((c) => c.originalTaskId),
    })),
    recommendation: problematicTaskIds.length > 0
      ? `发现 ${problematicTaskIds.length} 个需要修正的任务。建议立即分配给相关 Agent 执行修正任务。`
      : "未发现问题任务，项目历史质量良好。",
  };

  return {
    success: true,
    totalSprintsAnalyzed: targetSprints.length,
    totalTasksScanned,
    problematicTasksFound: problematicTaskIds.length,
    correctionsCreated: corrections.filter((c) => c.correctionTaskId).length,
    corrections,
    report,
    message: `Sprint ${startSprintNumber}-${actualEndSprint} 回溯完成，发现 ${problematicTaskIds.length} 个需要修正的任务，已创建 ${corrections.filter((c) => c.correctionTaskId).length} 个修正任务。`,
  };
}
