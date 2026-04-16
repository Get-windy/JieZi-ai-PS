"""
在 agents-management.ts 末尾（}; 之前）插入 agent.task.triage RPC
"""

filepath = r"i:\JieZI\JieZi-ai-PS\src\gateway\server-methods\agents-management.ts"
with open(filepath, encoding="utf-8") as f:
    content = f.read()

# 锚点：找文件末尾的  };\n 并在它前面插入新 RPC
END_MARKER = "\n    respond(true, { agentId, written, workspaceDir }, undefined);\n  },\n};"

if END_MARKER not in content:
    print("ERROR: end marker not found")
    import sys; sys.exit(1)

TRIAGE_RPC = r"""

  /**
   * agent.task.triage — 批量分诊阻塞任务
   *
   * 设计背景（参考 Praetorian Platform Triage Phase 最佳实践）：
   * 主控每次只能用 agent.task.manage 处理 1 个任务，21 个阻塞任务需要 21 次调用，
   * 每次调用消耗大量上下文，主控很快就因上下文耗尽而"忘记"前面的决策。
   *
   * 此工具允许主控一次性传入多个操作指令，程序批量执行，大幅降低上下文消耗。
   *
   * 支持的操作（action）：
   * - reset:            重置回 todo，重新排队（适用于：技术方案确认后可继续的任务）
   * - cancel:           直接取消（适用于：需求已变更、不再需要的任务）
   * - mark-dependency:  标记为依赖阻塞（设置 blockedBy），当依赖完成时程序自动解除
   * - reassign:         重新分配给另一个 agent
   * - add-note:         仅添加阻塞说明注释（不改变状态，记录阻塞原因供后续参考）
   */
  "agent.task.triage": async ({ params, respond }) => {
    const p = params as {
      operations: Array<{
        taskId: string;
        action: "reset" | "cancel" | "mark-dependency" | "reassign" | "add-note";
        reason?: string;
        blockedByTaskIds?: string[];
        newAssigneeId?: string;
        operatorId?: string;
      }>;
    };

    const operations = Array.isArray(p?.operations) ? p.operations : [];
    if (operations.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "operations array is required and must not be empty"),
      );
      return;
    }

    const results: Array<{
      taskId: string;
      action: string;
      success: boolean;
      error?: string;
    }> = [];
    const now = Date.now();

    for (const op of operations) {
      const taskId = String(op.taskId ?? "").trim();
      const action = String(op.action ?? "").trim();
      const reason = String(op.reason ?? "").trim();
      const operatorId = String(op.operatorId ?? "system").trim();

      if (!taskId) {
        results.push({ taskId: "(empty)", action, success: false, error: "taskId is required" });
        continue;
      }

      try {
        const task = await taskStorage.getTask(taskId);
        if (!task) {
          results.push({ taskId, action, success: false, error: `Task ${taskId} not found` });
          continue;
        }

        if (action === "reset") {
          // 重置回 todo，清除阻塞标记
          await taskStorage.updateTask(taskId, {
            status: "todo",
            blockedBy: [],
            timeTracking: { ...task.timeTracking, startedAt: undefined, lastActivityAt: now },
          });
          await taskStorage.addWorklog({
            id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
            taskId,
            agentId: operatorId,
            action: "reset",
            details: `[Triage] Reset to todo. ${reason || "Blocker resolved or will be bypassed."}`,
            result: "partial",
            createdAt: now,
          });
          const assigneeId = task.assignees?.[0]?.id;
          if (assigneeId) {
            const normalizedAssignee = normalizeAgentId(assigneeId);
            enqueueSystemEvent(
              [
                `[TASK UNBLOCKED] Your task has been unblocked and reset to queue by supervisor.`,
                `Task ID: ${taskId}`,
                `Title: ${task.title}`,
                reason ? `Note from supervisor: ${reason}` : null,
                ``,
                `The task will be picked up by the next scheduling cycle.`,
              ].filter(Boolean).join("\n"),
              { sessionKey: `agent:${normalizedAssignee}:main`, contextKey: `triage:reset:${taskId}` },
            );
            await scheduleNextTaskForAgent(normalizedAssignee, taskId, task.projectId);
          }
          results.push({ taskId, action, success: true });

        } else if (action === "cancel") {
          await taskStorage.updateTask(taskId, {
            status: "cancelled",
            cancelledAt: now,
            cancelReason: reason || "Cancelled during blocked task triage",
          });
          await taskStorage.addWorklog({
            id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
            taskId,
            agentId: operatorId,
            action: "cancelled",
            details: `[Triage] Cancelled. ${reason || "Task deemed unresolvable during triage."}`,
            result: "failure",
            createdAt: now,
          });
          const assigneeId = task.assignees?.[0]?.id;
          if (assigneeId) {
            const normalizedAssignee = normalizeAgentId(assigneeId);
            enqueueSystemEvent(
              [
                `[TASK CANCELLED] Task cancelled by supervisor during triage.`,
                `Task ID: ${taskId}`,
                `Title: ${task.title}`,
                reason ? `Reason: ${reason}` : null,
              ].filter(Boolean).join("\n"),
              { sessionKey: `agent:${normalizedAssignee}:main`, contextKey: `triage:cancel:${taskId}` },
            );
            await scheduleNextTaskForAgent(normalizedAssignee, taskId, task.projectId);
          }
          results.push({ taskId, action, success: true });

        } else if (action === "mark-dependency") {
          // 标记依赖阻塞：blockedBy 记录依赖任务ID，task-aging 自动在依赖完成时解除
          const blockedByTaskIds = Array.isArray(op.blockedByTaskIds)
            ? op.blockedByTaskIds.map(String).filter(Boolean)
            : [];
          if (blockedByTaskIds.length === 0) {
            results.push({ taskId, action, success: false, error: "blockedByTaskIds is required for mark-dependency" });
            continue;
          }
          await taskStorage.updateTask(taskId, {
            status: "blocked",
            blockedBy: blockedByTaskIds,
            metadata: {
              ...task.metadata,
              blockReason: reason || "Waiting for dependency tasks",
              blockType: "dependency",
              lastBlockedAt: now,
            },
          });
          await taskStorage.addWorklog({
            id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
            taskId,
            agentId: operatorId,
            action: "blocked",
            details: `[Triage] Dependency-blocked. Waiting for: ${blockedByTaskIds.join(", ")}. ${reason}`,
            result: "partial",
            createdAt: now,
          });
          results.push({ taskId, action, success: true });

        } else if (action === "reassign") {
          const newAssigneeId = String(op.newAssigneeId ?? "").trim();
          if (!newAssigneeId) {
            results.push({ taskId, action, success: false, error: "newAssigneeId is required for reassign" });
            continue;
          }
          const normalizedNew = normalizeAgentId(newAssigneeId);
          const cfgForTriage = loadConfig();
          const knownIds = new Set(listAgentIds(cfgForTriage).map(normalizeAgentId));
          if (!knownIds.has(normalizedNew)) {
            results.push({ taskId, action, success: false, error: `Agent ${newAssigneeId} not found` });
            continue;
          }
          const oldAssigneeId = task.assignees?.[0]?.id ?? "";
          await taskStorage.updateTask(taskId, {
            status: "todo",
            blockedBy: [],
            assignees: [{ id: normalizedNew, type: "agent" as const, role: "assignee" as const, assignedAt: now, assignedBy: operatorId }],
            timeTracking: { ...task.timeTracking, startedAt: undefined, lastActivityAt: now },
          });
          await taskStorage.addWorklog({
            id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
            taskId,
            agentId: operatorId,
            action: "reassigned",
            details: `[Triage] Reassigned from ${oldAssigneeId || "(unassigned)"} to ${normalizedNew}. ${reason}`,
            result: "partial",
            createdAt: now,
          });
          enqueueSystemEvent(
            [
              `[TASK REASSIGNED] A task has been reassigned to you during triage.`,
              `Task ID: ${taskId}`,
              `Title: ${task.title}`,
              `Priority: ${task.priority}`,
              task.description ? `Description: ${task.description.slice(0, 200)}` : null,
              reason ? `Note: ${reason}` : null,
            ].filter(Boolean).join("\n"),
            { sessionKey: `agent:${normalizedNew}:main`, contextKey: `triage:reassign:${taskId}` },
          );
          requestHeartbeatNow({
            reason: `triage:reassign:${taskId}`,
            sessionKey: `agent:${normalizedNew}:main`,
            agentId: normalizedNew,
            coalesceMs: 5000,
          });
          results.push({ taskId, action, success: true });

        } else if (action === "add-note") {
          // 仅追加阻塞说明注释，不改变状态
          await taskStorage.addWorklog({
            id: `wl_${now}_${Math.random().toString(36).slice(2, 9)}`,
            taskId,
            agentId: operatorId,
            action: "note",
            details: `[Triage Note] ${reason || "No note provided."}`,
            result: "partial",
            createdAt: now,
          });
          results.push({ taskId, action, success: true });

        } else {
          results.push({ taskId, action, success: false, error: `Unknown action: ${action}` });
        }
      } catch (err) {
        results.push({ taskId, action, success: false, error: String(err) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;
    respond(
      true,
      {
        processed: results.length,
        succeeded: successCount,
        failed: failCount,
        results,
      },
      undefined,
    );
  },
"""

# 在 END_MARKER 中的 "  },\n};" 前插入
INSERT_BEFORE = "\n};"
insert_pos = content.rfind(INSERT_BEFORE)
print(f"Insert position: {insert_pos}")

new_content = content[:insert_pos] + TRIAGE_RPC.rstrip() + "\n" + content[insert_pos:]

with open(filepath, "w", encoding="utf-8") as f:
    f.write(new_content)

print(f"Done. New length: {len(new_content)}")
