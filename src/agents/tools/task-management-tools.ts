/**
 * 任务管理工具
 *
 * 提供创建、查询、更新、完成任务的工具
 * 让智能体能够管理待办事项和任务列表
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../upstream/src/agents/tools/common.js";
import { jsonResult, readStringParam } from "../../../upstream/src/agents/tools/common.js";
import {
  callGatewayTool,
  readGatewayCallOptions,
} from "../../../upstream/src/agents/tools/gateway.js";

/**
 * 任务优先级枚举
 */
const TaskPriority = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("urgent"),
]);

/**
 * 任务状态枚举
 * 工具层别名（pending/in_progress/completed/cancelled）在 RPC 层会自动映射到存储层（todo/in-progress/done/cancelled）
 * 也可直接传入存储层的原始状态名如 todo/in-progress/done/review/blocked
 */
const TaskStatus = Type.Union([
  Type.Literal("pending"), // 待处理（存储层为 todo）
  Type.Literal("in_progress"), // 进行中（存储层为 in-progress）
  Type.Literal("completed"), // 已完成（存储层为 done）
  Type.Literal("cancelled"), // 已取消
  Type.Literal("todo"), // 存储层原始状态
  Type.Literal("in-progress"), // 存储层原始状态
  Type.Literal("done"), // 存储层原始状态
  Type.Literal("review"), // 审查中
  Type.Literal("blocked"), // 被阻塞
]);

/**
 * 工作层次枚举（SAFe/Linear/Jira 五层）
 */
const WorkItemLevel = Type.Union([
  Type.Literal("initiative"), // 战略主题（跨项目顶层，对标 Linear Initiatives）
  Type.Literal("epic"),
  Type.Literal("feature"),
  Type.Literal("story"),
  Type.Literal("task"),
]);

/**
 * task_create 工具参数 schema
 */
const TaskCreateToolSchema = Type.Object({
  /**
   * 任务标题（必填）
   * 简洁描述任务目标，1-200字符。
   * 好的标题示例："实现用户登录页面"、"修复支付模块空指针异常"、"编写 API 接口文档"
   * 不合格示例：空字符串、仅填"任务"、超过200字的长句
   */
  title: Type.String({
    minLength: 1,
    maxLength: 200,
    description:
      '[REQUIRED] Task title (1-200 chars). Must be a clear, actionable summary of what needs to be done. Example: "Implement user login page", "Fix null pointer in payment module"',
  }),
  /**
   * 任务描述（必填）
   * 必须包含：做什么、为什么做、完成标准是什么。
   * 任务驱动模式的前提是任务定义清晰，模糊的描述会导致执行者无法正确完成任务。
   */
  description: Type.String({
    minLength: 1,
    maxLength: 4000,
    description:
      "[REQUIRED] Detailed task description. Must cover: (1) What to do, (2) Why it's needed, (3) Definition of done / acceptance criteria. Vague descriptions cause task failures.",
  }),
  /**
   * 任务作用域（必填）
   * - personal: 私人任务（个人待办、学习计划、个人事项）— 无需 project，结果写入自身私有记忆
   * - project:  项目任务（团队协作、功能开发、交付物）— 必须传入 project，结果写入项目共享记忆
   */
  scope: Type.Union([Type.Literal("personal"), Type.Literal("project")], {
    description:
      '[REQUIRED] "personal" = private todo (no project needed) | "project" = team task (must provide project ID)',
  }),
  /** 任务优先级（可选，默认medium） */
  priority: Type.Optional(TaskPriority),
  /** 截止时间（可选，ISO 8601格式） */
  dueDate: Type.Optional(Type.String()),
  /**
   * 负责人/执行者（可选）
   * 必须是系统中已注册的 agent ID（如 "doc-writer"、"test-agent-1"）。
   * 不填时默认为创建者自己。不可填写不存在的 agent 或人名。
   */
  assignee: Type.Optional(
    Type.String({
      maxLength: 64,
      description:
        'Assignee agent ID (must be a valid registered agent, e.g. "doc-writer", "test-agent-1"). Defaults to self if omitted.',
    }),
  ),
  /** 任务标签（可选） */
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /**
   * 所属项目 ID（scope=project 时必填）
   * scope=personal 时可不传，项目任务必须传入正确的项目 ID
   */
  project: Type.Optional(
    Type.String({
      maxLength: 128,
      description:
        '[REQUIRED when scope="project"] The project ID this task belongs to. Must be an existing project ID.',
    }),
  ),
  /** 所属团队ID（可选） */
  teamId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 所属组织ID（可选） */
  organizationId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 任务类型（可选） */
  type: Type.Optional(
    Type.Union([
      Type.Literal("feature"),
      Type.Literal("bugfix"),
      Type.Literal("research"),
      Type.Literal("documentation"),
      Type.Literal("meeting"),
      Type.Literal("other"),
    ]),
  ),
  /**
   * 预估工时（可选，单位：小时）
   * 有助于任务调度和工作量评估，建议尽量填写
   */
  estimatedHours: Type.Optional(Type.Number({ minimum: 0.5, maximum: 999 })),
  /**
   * 故事点（可选，Sprint 速度计算的基础单位）
   * SAFe/Scrum 最佳实践：每个任务在 Sprint 规划时必须估算故事点。
   * 典型取値：1/2/3/5/8/13（Fibonacci）
   */
  storyPoints: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: "Story points for Sprint velocity tracking. Fibonacci: 1/2/3/5/8/13. Defaults to 1 if omitted.",
    }),
  ),
  /**
   * 工作层次（可选）
   * - initiative: 战略主题（跨项目顶层）
   * - epic:       跨多个 Sprint 的大价値块
   * - feature:    属于 Epic 的功能块
   * - story:      用户故事
   * - task:       技术实现单元（默认）
   */
  level: Type.Optional(WorkItemLevel),
  /** 所属 Epic ID（可选，level=feature/story/task 时建议填写） */
  epicId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 所属 Feature ID（可选，level=story/task 时建议填写） */
  featureId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 关联目标 ID（可选，强烈建议填写）
   * 将此任务与项目 OKR 目标关联，OKR 完成率会自动汇聚。
   */
  objectiveId: Type.Optional(
    Type.String({
      maxLength: 128,
      description: "Link this task to a project OKR objective. Use project_roadmap_view to get active objective IDs.",
    }),
  ),
  /** 关联关键结果 ID（可选） */
  keyResultId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 关联 Initiative ID（可选）
   * 将此任务对齐到某个战略主题。level=initiative 时必填。
   */
  initiativeId: Type.Optional(
    Type.String({
      maxLength: 128,
      description: "Link this task to a strategic initiative. Use project_initiative_list to get active initiative IDs. Required when level=initiative.",
    }),
  ),
  /**
   * 验收标准列表（可选，强烈建议填写）
   * 每条验收标准是一个可独立验证的条件，防止 AI Agent “敷衍式完成”。
   * 示例：["tsc --noEmit 无错误", "单元测试全部通过", "API 返回 200"]
   */
  acceptanceCriteria: Type.Optional(
    Type.Array(
      Type.String({ maxLength: 500 }),
      {
        description: "Acceptance criteria checklist. Each item is a verifiable condition. Task cannot be marked done until all criteria pass.",
      },
    ),
  ),
  /**
   * 父任务ID（可选）
   * 将此任务作为某个复杂任务的子任务，实现任务分解
   */
  parentTaskId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 阻塞此任务的任务ID列表（可选）
   * 声明前置依赖，系统会自动将任务状态标记为 blocked
   */
  blockedBy: Type.Optional(Type.Array(Type.String({ maxLength: 128 }))),
  /**
   * 主管 ID（可选，强烈建议填写）
   *
   * 必须是该任务所属项目的成员，不能填写项目外人员。
   * 候选人（根据任务内容自行判断选择）：
   *   - 你自己（currentAgentId）：你分配给他人但自己负责跟进时
   *   - 项目负责人（ownerId）：需要项目负责人最终验收或决策时
   *   - 其他项目成员：任务属于某个专职角色管辖时（如 qa-lead 管测试任务）
   *
   * 不填时系统将默认设为你自己（任务创建者），确保任务始终有人负责。
   * supervisorId 拥有：查看任务详情、写入工作日志、收到任务完成/阻塞通知的权限。
   */
  supervisorId: Type.Optional(Type.String({ maxLength: 128 })),
});

/**
 * task_list 工具参数 schema
 */
const TaskListToolSchema = Type.Object({
  /** 过滤状态（可选） */
  status: Type.Optional(TaskStatus),
  /** 过滤优先级（可选） */
  priority: Type.Optional(TaskPriority),
  /** 过滤负责人（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 只显示今日到期的任务（可选） */
  dueToday: Type.Optional(Type.Boolean()),
  /** 最大返回数量（可选，默认20） */
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  /** 过滤所属项目（可选，如 "wo-shi-renlei"） */
  project: Type.Optional(Type.String({ maxLength: 128 })),
  /** 过滤标签（可选） */
  tag: Type.Optional(Type.String({ maxLength: 32 })),
  /**
   * 只显示分配给自己的任务（可选，默认 false）
   * 设为 true 时等效于 assignee=currentAgentId，适合 worker agent 查询自己的待办
   * 设为 false 时不过滤 assignee，适合 coordinator 查看全局任务
   */
  selfOnly: Type.Optional(Type.Boolean()),
  /**
   * 返回最优先应要处理的下一个任务（可选）
   * 设为 true 时，在返回任务列表的同时，额外返回 nextTask 字段
   * nextTask 是根据优先级/截止日期/依赖关系综合评分之后的最高优先任务
   * 适合 agent 开始工作前查询“我该做什么”的场景
   */
  includeNextTask: Type.Optional(Type.Boolean()),
  /** 只返回逆期任务（可选） */
  overdueOnly: Type.Optional(Type.Boolean()),
  /** 只返回被阻塞的任务（可选） */
  blockedOnly: Type.Optional(Type.Boolean()),
  /**
   * 按工作层次过滤（可选）
   * initiative | epic | feature | story | task
   */
  level: Type.Optional(WorkItemLevel),
  /**
   * 按所属 Epic ID 过滤（可选）
   * 返回某个 Epic 下的所有 Feature/Story/Task。
   */
  epicId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 按所属 Feature ID 过滤（可选）
   * 返回某个 Feature 下的所有 Story/Task。
   */
  featureId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 按关联目标 ID 过滤（可选）
   * 查看某个 OKR 目标下的所有任务。
   */
  objectiveId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 按战略主题 ID 过滤（可选）
   * 查看某个 Initiative 下的所有任务。
   */
  initiativeId: Type.Optional(Type.String({ maxLength: 128 })),
  /**
   * 只返回 backlog 池任务（可选）
   * 设为 true 时等效于 status=backlog，适合 Sprint Grooming 场景。
   */
  backlogOnly: Type.Optional(Type.Boolean()),
});

/**
 * task_update 工具参数 schema
 */
const TaskUpdateToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /** 新标题（可选） */
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  /** 新描述（可选） */
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  /** 新状态（可选） */
  status: Type.Optional(TaskStatus),
  /** 新优先级（可选） */
  priority: Type.Optional(TaskPriority),
  /** 新截止时间（可选） */
  dueDate: Type.Optional(Type.String()),
  /** 新负责人（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 添加标签（可选） */
  addTags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 移除标签（可选） */
  removeTags: Type.Optional(Type.Array(Type.String({ maxLength: 32 }))),
  /** 更新所属项目ID（可选） */
  projectId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新所属团队ID（可选） */
  teamId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新所属组织ID（可选） */
  organizationId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新故事点（可选） */
  storyPoints: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  /** 更新工作层次（可选） */
  level: Type.Optional(WorkItemLevel),
  /** 更新所属 Epic ID（可选） */
  epicId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新所属 Feature ID（可选） */
  featureId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新关联目标 ID（可选） */
  objectiveId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新关联关键结果 ID（可选） */
  keyResultId: Type.Optional(Type.String({ maxLength: 128 })),
  /** 更新关联 Initiative ID（可选） */
  initiativeId: Type.Optional(Type.String({ maxLength: 128, description: "Link task to a strategic initiative." })),
  /**
   * 验收标准（可选，传入字符串数组将全量更新验收标准—替换现有）
   */
  acceptanceCriteria: Type.Optional(
    Type.Array(Type.String({ maxLength: 500 }), {
      description: "Full replace of acceptance criteria. Pass string array to overwrite all existing criteria.",
    }),
  ),
  /**
   * 增加前置阻塞任务 ID（可选）
   * 向 blockedBy 列表中添加一或多个前置依赖。
   * 如果任务当前不是 blocked 状态，系统自动将其标记为 blocked。
   */
  addBlockedBy: Type.Optional(Type.Array(Type.String({ maxLength: 128 }), { description: "Task IDs to add as blockers. Auto-sets status to blocked." })),
  /**
   * 解除前置阻塞任务 ID（可选）
   * 从 blockedBy 列表中移除指定前置依赖。
   * 如果移除后 blockedBy 列表为空且任务当前是 blocked，系统自动将其恢复为 in-progress。
   */
  removeBlockedBy: Type.Optional(Type.Array(Type.String({ maxLength: 128 }), { description: "Task IDs to remove from blockers. Auto-clears blocked status when list becomes empty." })),
});

/**
 * task_complete 工具参数 schema
 */
const TaskCompleteToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /** 完成备注（可选） */
  note: Type.Optional(Type.String({ maxLength: 500 })),
});

/**
 * task_delete 工具参数 schema
 */
const TaskDeleteToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
});

/**
 * task_get 工具参数 schema
 */
const TaskGetToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /**
   * 是否包含评论内容（可选，默认 true）
   * 评论和工作日志是任务上下文的重要来源，建议保持默认开启
   */
  includeComments: Type.Optional(Type.Boolean()),
  /** 是否包含工作日志（可选，默认 true） */
  includeWorkLogs: Type.Optional(Type.Boolean()),
});

/**
 * task_subtask_create 工具参数 schema
 */
const TaskSubtaskCreateToolSchema = Type.Object({
  /** 父任务ID（必填） */
  parentTaskId: Type.String({ minLength: 1 }),
  /**
   * 子任务标题（必填）
   * 建议命名格式：动词 + 对象，如“调研 OpenAI API 鉴权方式”
   */
  title: Type.String({ minLength: 1, maxLength: 256 }),
  /**
   * 子任务描述（必填）
   * 说明这个子任务具体要做什么、如何判断完成
   */
  description: Type.String({ minLength: 1, maxLength: 4000 }),
  /** 子任务优先级（可选，默认继承父任务） */
  priority: Type.Optional(TaskPriority),
  /** 子任务负责人（可选） */
  assignee: Type.Optional(Type.String({ maxLength: 64 })),
  /** 子任务预估工时（可选，单位：小时） */
  estimatedHours: Type.Optional(Type.Number({ minimum: 0.5, maximum: 99 })),
});

/**
 * task_progress_note_append 工具参数 schema
 *
 * 进展笔记与工作日志的區别：
 *   - worklog: 轻量、次数多、记录单一操作；提供可查询的 action/result/duration
 *   - progress_note: 重要、每次工作会话结束时写一条；以 Markdown 记录阶段性成果/发现/陨阱；双轨写入 SQLite + .notes 文件
 */
const TaskProgressNoteAppendToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({
    minLength: 1,
    description: "[REQUIRED] The task ID to append a progress note to.",
  }),
  /**
   * 笔记内容（必填，Markdown格式）
   *
   * 建议包含：
   *   1. 本次会话完成了什么（已完成的事项）
   *   2. 发现的模式或除陷险（方便后续不走弯路）
   *   3. 显著决策与依据（ADR级别的重要变更）
   *   4. 下一步建议（接手者可直接开工的信息）
   */
  content: Type.String({
    minLength: 10,
    maxLength: 8000,
    description:
      "[REQUIRED] Progress note content in Markdown format. Should cover: what was accomplished, " +
      "patterns/pitfalls discovered, significant decisions with rationale, and next-step recommendations.",
  }),
});

/**
 * task_worklog_add 工具参数 schema
 */
const TaskWorklogAddToolSchema = Type.Object({
  /** 任务ID（必填） */
  taskId: Type.String({ minLength: 1 }),
  /**
   * 操作类型（必填）
   * 建议使用语义清晰的动词，如：
   * started, researching, coding, testing, reviewing, debugging,
   * waiting, blocked, resumed, completed, failed
   */
  action: Type.String({ minLength: 1, maxLength: 64 }),
  /**
   * 工作详情（必填）
   * 描述具体做了什么、遇到什么、取得了什么进展
   * 工作日志是任务可追源性的核心，建议尽量详尽
   */
  details: Type.String({ minLength: 1, maxLength: 4000 }),
  /** 本次工作持续时长（可选，单位：毫秒） */
  duration: Type.Optional(Type.Number({ minimum: 0 })),
  /**
   * 操作结果（可选）
   * success: 完全成功
   * failure: 失败，需要说明失败原因
   * partial: 部分完成，需要说明完成了哪些、还剥何未完成
   */
  result: Type.Optional(
    Type.Union([Type.Literal("success"), Type.Literal("failure"), Type.Literal("partial")]),
  ),
  /** 失败时的错误信息（当 result=failure 时建议填写） */
  errorMessage: Type.Optional(Type.String({ maxLength: 1000 })),
});

/**
 * 创建任务创建工具
 */
export function createTaskCreateTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Create",
    name: "task_create",
    description:
      "Create a new task.\n\n" +
      "REQUIRED fields:\n" +
      '  - title: Clear task title (1-200 chars), e.g. "Implement login page"\n' +
      "  - description: What to do + why + done criteria (cannot be empty or vague)\n" +
      '  - scope: "personal" (private todo, no project needed) | "project" (team task, must provide project ID)\n\n' +
      "CONDITIONAL:\n" +
      '  - project: REQUIRED when scope="project". Must be a valid existing project ID.\n\n' +
      "OPTIONAL (highly recommended):\n" +
      '  - storyPoints: Fibonacci (1/2/3/5/8/13), required for Sprint velocity tracking\n' +
      '  - acceptanceCriteria: string[] of verifiable conditions\n' +
      '  - level: initiative | epic | feature | story | task (default: task)\n' +
      '  - epicId / featureId / initiativeId / objectiveId / keyResultId: hierarchy links\n' +
      '  - assignee: Must be a valid registered agent ID. Defaults to self.\n' +
      "  - priority: low | medium (default) | high | urgent\n" +
      "  - supervisorId: Must be a project member. Defaults to self (creator).\n\n" +
      "RULES:\n" +
      "  - Do NOT omit title. A task with no title will be rejected.\n" +
      "  - Do NOT create duplicate tasks (same title + same assignee already exists as active).\n" +
      "  - Personal task results → agent private memory. Project task results → project shared memory.",
    parameters: TaskCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const title = readStringParam(params, "title", { required: true });
      const description = readStringParam(params, "description", { required: true });
      const priority = readStringParam(params, "priority") || "medium";
      const dueDate = readStringParam(params, "dueDate");
      const assignee = readStringParam(params, "assignee") || opts?.currentAgentId;
      const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];
      const project = readStringParam(params, "project");
      const scope = params?.scope === "personal" ? "personal" : "project";
      const teamId = readStringParam(params, "teamId");
      const organizationId = readStringParam(params, "organizationId");
      const type = readStringParam(params, "type");
      const estimatedHours =
        typeof params.estimatedHours === "number" ? params.estimatedHours : undefined;
      const parentTaskId = readStringParam(params, "parentTaskId");
      const blockedBy = Array.isArray(params.blockedBy) ? params.blockedBy.map(String) : undefined;
      // P1 新增字段
      const storyPoints = typeof params.storyPoints === "number" ? params.storyPoints : undefined;
      const level = readStringParam(params, "level");
      const epicId = readStringParam(params, "epicId");
      const featureId = readStringParam(params, "featureId");
      const objectiveId = readStringParam(params, "objectiveId");
      const keyResultId = readStringParam(params, "keyResultId");
      const initiativeId = readStringParam(params, "initiativeId");
      const acceptanceCriteria = Array.isArray(params.acceptanceCriteria)
        ? (params.acceptanceCriteria as string[]).filter((s) => typeof s === "string" && s.length > 0)
        : undefined;
      // supervisorId：若 AI 未显式传入，自动用当前 agent 自身作为主管（主控分配子任务场景）
      // supervisorId：AI 应根据任务内容从项目成员中选择；未指定时默认为创建者自己
      const supervisorId = readStringParam(params, "supervisorId") || opts?.currentAgentId;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // ── DoD 范围冻结检查：如果项目已完成/范围冻结，拒绝创建任务 ──
        if (scope === "project" && project) {
          try {
            const projectCtx = await callGatewayTool("projects.get", gatewayOpts, {
              projectId: project,
            });
            const projectData = projectCtx as Record<string, unknown> | null;
            // projects.get 直接返回项目顶层字段，not nested under config
            const completionGate = projectData?.completionGate as
              | Record<string, unknown>
              | undefined;
            const projectStatus = projectData?.status as string | undefined;

            // 检查范围已冻结（completed 或 cancelled 状态自动触发）
            if (completionGate?.scopeFrozen === true) {
              const reason = completionGate.scopeFrozenReason as string | undefined;
              const isCancelled = reason === "cancelled" || projectStatus === "cancelled";
              return jsonResult({
                success: false,
                error: isCancelled
                  ? `❌ [项目已取消] 项目 "${project}" 已取消，禁止创建新任务。` +
                    `\n如判断为误操作，可调用 projects.reactivate(projectId="${project}") 解除冻结。`
                  : `🔒 [范围已冻结] 项目 "${project}" 已设为 completed，范围已冻结。` +
                    `\n\n▶ 如该冻结属于误判（例如：任务队列为空但项目实际未完成），请立即执行：` +
                    `\n  方案A（推荐）：调用 projects.reactivate(projectId="${project}", reason="误判为完成，实际需继续迭代")，一键解除冻结` +
                    `\n  方案B：调用 projects.updateProgress(projectId="${project}", status="development")，系统自动解除冻结` +
                    `\n\n⚠️ 核心原则：任务全部完成 ≠ 项目完成。项目应根据进展持续安排新任务，直到 DoD 验收标准全部满足。`,
                blockedReason: "scope_frozen",
                projectId: project,
              });
            }
            if (projectStatus === "cancelled") {
              return jsonResult({
                success: false,
                error: `❌ [项目已取消] 项目 "${project}" 已取消，不允许创建新任务。`,
                blockedReason: "project_cancelled",
                projectId: project,
              });
            }
          } catch {
            // 读取项目配置失败不阻止任务创建（项目可能尚未设置 ProjectConfig）
          }
        }


        // ── Phase Gate 检查 + 目标对齐提示 ──
        if (scope === "project" && project) {
          try {
            const { buildActiveObjectivesSummary, checkPhaseGate } = await import(
              "../../utils/project-context.js"
            );
            // Phase Gate：检查当前阶段是否允许该任务类型
            if (type) {
              const projectCtxForGate = await callGatewayTool("projects.get", gatewayOpts, {
                projectId: project,
              }).catch(() => null);
              const projectStatus = (projectCtxForGate as Record<string, unknown> | null)?.status as string | undefined;
              const gateResult = checkPhaseGate(
                projectStatus as import("../../utils/project-context.js").ProjectStatus | undefined,
                type,
              );
              if (gateResult.blocked) {
                return jsonResult({ success: false, error: gateResult.message, blockedReason: "phase_gate", projectId: project });
              }
              // 警告：继续执行但附加提示
              if (gateResult.message) {
                // 将警告附到后续返回中（通过 _phaseGateWarning 临时变量）
                (params as Record<string, unknown>)._phaseGateWarning = gateResult.message;
              }
            }
            // 目标对齐提示：如果项目有活跃目标但任务未关联 objectiveId，发出建议
            const objectiveId = (params as Record<string, unknown>).objectiveId as string | undefined;
            if (!objectiveId) {
              const summary = buildActiveObjectivesSummary(project);
              if (summary && (summary.shortTermObjectives.length > 0 || summary.mediumTermObjectives.length > 0)) {
                const activeObjs = [...summary.shortTermObjectives, ...summary.mediumTermObjectives];
                (params as Record<string, unknown>)._objectiveAlignmentHint =
                  `提示：项目有 ${activeObjs.length} 个活跃目标（${activeObjs.map((o) => `"${o.title}"`).join("、")}）。` +
                  `建议在任务描述中说明此任务服务于哪个目标，或通过 objectiveId 字段关联。`;
              }
            }
          } catch {
            // 目标对齐检查失败不阻止任务创建
          }
        }
        // 生成唯一任务ID
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 调用 task.create RPC
        await callGatewayTool("task.create", gatewayOpts, {
          id: taskId,
          title,
          description,
          priority,
          dueDate,
          assignee,
          tags,
          type: type || undefined,
          status: "pending",
          createdAt: Date.now(),
          projectId: project || undefined,
          scope,
          teamId: teamId || undefined,
          organizationId: organizationId || undefined,
          parentTaskId: parentTaskId || undefined,
          estimatedHours,
          blockedBy: blockedBy || undefined,
          supervisorId: supervisorId || undefined,
          // P1 新增字段
          storyPoints: storyPoints ?? undefined,
          level: level || undefined,
          epicId: epicId || undefined,
          featureId: featureId || undefined,
          objectiveId: objectiveId || undefined,
          keyResultId: keyResultId || undefined,
          initiativeId: initiativeId || undefined,
          acceptanceCriteria: acceptanceCriteria && acceptanceCriteria.length > 0
            ? acceptanceCriteria.map((text, i) => ({
                id: `ac_${taskId}_${i}`,
                description: text,
                passes: false,
                createdAt: Date.now(),
              }))
            : undefined,
          // creatorId：自动填入当前 agent，确保 creatorId 不会变成不存在的 "system"
          creatorId: opts?.currentAgentId || undefined,
          creatorType: "agent",
        });

        // 如果有子任务关系，更新父任务的 subtasks 列表
        if (parentTaskId) {
          try {
            await callGatewayTool("task.update", gatewayOpts, {
              id: parentTaskId,
              addSubtask: taskId,
            });
          } catch {
            // 更新父任务失败不影响主任务创建
          }
        }

        return jsonResult({
          success: true,
          message: `Task created: "${title}"`,
          task: {
            id: taskId,
            title,
            description,
            status: blockedBy && blockedBy.length > 0 ? "blocked" : "pending",
            priority,
            dueDate,
            assignee,
            tags,
            type: type || undefined,
            project: project || undefined,
            teamId: teamId || undefined,
            organizationId: organizationId || undefined,
            parentTaskId: parentTaskId || undefined,
            estimatedHours,
            blockedBy: blockedBy || [],
            createdAt: Date.now(),
          },
          tips: [
            parentTaskId ? `已将此任务添加为任务 ${parentTaskId} 的子任务` : null,
            blockedBy && blockedBy.length > 0
              ? `此任务正在等待 ${blockedBy.length} 个前置任务完成`
              : null,
            (params as Record<string, unknown>)._phaseGateWarning as string | null ?? null,
            (params as Record<string, unknown>)._objectiveAlignmentHint as string | null ?? null,
          ].filter(Boolean),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务列表查询工具
 */
export function createTaskListTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task List",
    name: "task_list",
    description:
      "List tasks with optional filters: status, priority, assignee, tag, dueToday, project, selfOnly (true = only my tasks), includeNextTask (true = also return the single highest-priority task you should work on next), overdueOnly, blockedOnly. Returns tasks sorted by priority+weight+creation time.",
    parameters: TaskListToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const status = readStringParam(params, "status");
      const priority = readStringParam(params, "priority");
      const assignee = readStringParam(params, "assignee");
      const tag = readStringParam(params, "tag");
      const dueToday = typeof params.dueToday === "boolean" ? params.dueToday : undefined;
      const limit = typeof params.limit === "number" ? params.limit : 20;
      const project = readStringParam(params, "project");
      const selfOnly = typeof params.selfOnly === "boolean" ? params.selfOnly : false;
      const includeNextTask =
        typeof params.includeNextTask === "boolean" ? params.includeNextTask : false;
      const overdueOnly = typeof params.overdueOnly === "boolean" ? params.overdueOnly : false;
      const blockedOnly = typeof params.blockedOnly === "boolean" ? params.blockedOnly : false;
      const level = readStringParam(params, "level");
      const epicId = readStringParam(params, "epicId");
      const featureId = readStringParam(params, "featureId");
      const objectiveId = readStringParam(params, "objectiveId");
      const initiativeId = readStringParam(params, "initiativeId");
      const backlogOnly = typeof params.backlogOnly === "boolean" ? params.backlogOnly : false;
      const gatewayOpts = readGatewayCallOptions(params);

      const resolvedAssignee =
        assignee || (selfOnly && opts?.currentAgentId ? opts.currentAgentId : undefined);

      try {
        const response = await callGatewayTool("task.list", gatewayOpts, {
          status: backlogOnly ? "backlog" : status,
          priority,
          assignee: resolvedAssignee,
          tag,
          dueToday,
          limit,
          projectId: project || undefined,
          overdueOnly: overdueOnly || undefined,
          blockedOnly: blockedOnly || undefined,
          level: level || undefined,
          epicId: epicId || undefined,
          featureId: featureId || undefined,
          objectiveId: objectiveId || undefined,
          initiativeId: initiativeId || undefined,
        });

        const resp = response as { tasks?: unknown[]; total?: number } | unknown[] | null;
        const tasks = Array.isArray(resp)
          ? resp
          : resp && typeof resp === "object" && "tasks" in resp && Array.isArray(resp.tasks)
            ? resp.tasks
            : [];

        // 计算 nextTask：取未完成且未被阻塞的第一个（已经按优先级排序）
        let nextTask: unknown = null;
        if (includeNextTask) {
          const activeTasks = (tasks as Record<string, unknown>[]).filter(
            (t) => t.status !== "done" && t.status !== "cancelled" && t.status !== "blocked",
          );
          nextTask = activeTasks[0] || null;
        }

        return jsonResult({
          success: true,
          count: tasks.length,
          tasks,
          ...(includeNextTask
            ? {
                nextTask,
                nextTaskTip: nextTask
                  ? `建议优先处理: "${String((nextTask as Record<string, unknown>).title)}" (优先级: ${String((nextTask as Record<string, unknown>).priority)})`
                  : "暂无待处理任务",
              }
            : {}),
          filters: {
            status,
            priority,
            assignee: resolvedAssignee,
            tag,
            dueToday,
            project: project || undefined,
            selfOnly,
            overdueOnly,
            blockedOnly,
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务更新工具
 */
export function createTaskUpdateTool(_opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Update",
    name: "task_update",
    description:
      "Update an existing task. Supports: title, description, status, priority, dueDate, assignee, addTags/removeTags, projectId, teamId, organizationId, storyPoints, level (initiative|epic|feature|story|task), epicId, featureId, objectiveId, keyResultId, initiativeId, acceptanceCriteria (full replace), addBlockedBy, removeBlockedBy. At least one field must be provided.",
    parameters: TaskUpdateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const title = readStringParam(params, "title");
      const description = readStringParam(params, "description");
      const status = readStringParam(params, "status");
      const priority = readStringParam(params, "priority");
      const dueDate = readStringParam(params, "dueDate");
      const assignee = readStringParam(params, "assignee");
      const addTags = Array.isArray(params.addTags) ? params.addTags.map(String) : undefined;
      const removeTags = Array.isArray(params.removeTags)
        ? params.removeTags.map(String)
        : undefined;
      const projectId = readStringParam(params, "projectId");
      const teamId = readStringParam(params, "teamId");
      const organizationId = readStringParam(params, "organizationId");
      // P1 新增字段
      const storyPoints = typeof params.storyPoints === "number" ? params.storyPoints : undefined;
      const level = readStringParam(params, "level");
      const epicId = readStringParam(params, "epicId");
      const featureId = readStringParam(params, "featureId");
      const objectiveId = readStringParam(params, "objectiveId");
      const keyResultId = readStringParam(params, "keyResultId");
      const initiativeId = readStringParam(params, "initiativeId");
      const acceptanceCriteria = Array.isArray(params.acceptanceCriteria)
        ? (params.acceptanceCriteria as string[]).filter((s) => typeof s === "string" && s.length > 0)
        : undefined;
      // P2: blockedBy 动态更新
      const addBlockedBy = Array.isArray(params.addBlockedBy) ? (params.addBlockedBy as string[]) : undefined;
      const removeBlockedBy = Array.isArray(params.removeBlockedBy) ? (params.removeBlockedBy as string[]) : undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      // 检查是否至少提供了一个更新字段
      if (
        !title &&
        !description &&
        !status &&
        !priority &&
        !dueDate &&
        !assignee &&
        !addTags &&
        !removeTags &&
        !projectId &&
        !teamId &&
        !organizationId &&
        storyPoints === undefined &&
        !level &&
        !epicId &&
        !featureId &&
        !objectiveId &&
        !keyResultId &&
        !initiativeId &&
        !acceptanceCriteria &&
        !addBlockedBy &&
        !removeBlockedBy
      ) {
        return jsonResult({
          success: false,
          error: "At least one field must be provided for update",
        });
      }

      try {
        // 调用 task.update RPC
        const response = await callGatewayTool("task.update", gatewayOpts, {
          id: taskId,
          title,
          description,
          status,
          priority,
          dueDate,
          assignee,
          addTags,
          removeTags,
          projectId: projectId || undefined,
          teamId: teamId || undefined,
          organizationId: organizationId || undefined,
          updatedAt: Date.now(),
          // P1 新增字段
          storyPoints: storyPoints ?? undefined,
          level: level || undefined,
          epicId: epicId || undefined,
          featureId: featureId || undefined,
          objectiveId: objectiveId || undefined,
          keyResultId: keyResultId || undefined,
          initiativeId: initiativeId || undefined,
          acceptanceCriteria: acceptanceCriteria && acceptanceCriteria.length > 0
            ? acceptanceCriteria.map((text, i) => ({
                id: `ac_${taskId}_${i}`,
                description: text,
                passes: false,
                createdAt: Date.now(),
              }))
            : undefined,
          // P2: blockedBy 动态更新（增加/移除阻塞源，自动同步 status）
          addBlockedBy: addBlockedBy && addBlockedBy.length > 0 ? addBlockedBy : undefined,
          removeBlockedBy: removeBlockedBy && removeBlockedBy.length > 0 ? removeBlockedBy : undefined,
        });

        return jsonResult({
          success: true,
          message: `Task "${taskId}" updated successfully`,
          task: response,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务完成工具
 */
export function createTaskCompleteTool(opts?: {
  /** 当前操作者的智能助手ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Complete",
    name: "task_complete",
    description:
      "Mark a task as completed. Optionally add a completion note. This is a convenience method that sets status to 'completed' and records completion time.",
    parameters: TaskCompleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const note = readStringParam(params, "note");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // AC 门禁检查（warn 不 block）
        let acWarning: string | null = null;
        try {
          const taskData = await callGatewayTool("task.get", gatewayOpts, { taskId, requesterId: opts?.currentAgentId });
          const ac = (taskData as Record<string, unknown>)?.acceptanceCriteria as Array<{ passes?: boolean; description?: string }> | undefined;
          if (ac && ac.length > 0) {
            const failed = ac.filter((c) => !c.passes);
            if (failed.length > 0) {
              acWarning = `[DoD WARNING] ${failed.length}/${ac.length} acceptance criteria not yet verified: ${failed.map((c) => c.description ?? "(unnamed)").slice(0, 3).join("; ")}${failed.length > 3 ? " ..." : ""}. It is strongly recommended to verify all criteria before marking complete.`;
            }
          }
        } catch {
          // AC 检查失败不阻塞完成流程
        }

        // 调用 task.complete RPC
        const response = await callGatewayTool("task.complete", gatewayOpts, {
          id: taskId,
          completedBy: opts?.currentAgentId,
          completedAt: Date.now(),
          note,
        });

        return jsonResult({
          success: true,
          message: `Task "${taskId}" marked as completed`,
          task: response,
          completedBy: opts?.currentAgentId,
          completedAt: Date.now(),
          note,
          ...(acWarning ? { acWarning } : {}),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务删除工具
 */
export function createTaskDeleteTool(opts?: {
  /** 当前操作者的智能助手 ID */
  currentAgentId?: string;
}): AnyAgentTool {
  return {
    label: "Task Delete",
    name: "task_delete",
    description:
      "Delete a task permanently. CAUTION: This is a destructive operation and cannot be undone.",
    parameters: TaskDeleteToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        // 调用 task.delete RPC
        await callGatewayTool("task.delete", gatewayOpts, {
          id: taskId,
          deletedBy: opts?.currentAgentId,
          deletedAt: Date.now(),
        });

        return jsonResult({
          success: true,
          message: `Task "${taskId}" deleted successfully`,
          deleted: {
            taskId,
            deletedBy: opts?.currentAgentId,
            deletedAt: Date.now(),
          },
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建任务详情查询工具
 * AI agent 在执行任务前，应先调用此工具获取任务完整上下文（描述/评论/工作日志）
 */
export function createTaskGetTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Get",
    name: "task_get",
    description:
      "Get full details of a task including description, assignees, time tracking, comments and work logs. RECOMMENDED: call this before starting work on a task to understand full context, history, and any blockers noted in comments.",
    parameters: TaskGetToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("task.get", gatewayOpts, {
          taskId,
          requesterId: opts?.currentAgentId,
        });

        if (!response) {
          return jsonResult({
            success: false,
            error: `Task not found: ${taskId}`,
          });
        }

        const task = response;
        const comments = (task.comments as unknown[]) || [];
        const workLogs = (task.workLogs as unknown[]) || [];
        const progressNotes = (task.progressNotes as unknown[]) || [];

        return jsonResult({
          success: true,
          task,
          summary: {
            commentCount: comments.length,
            workLogCount: workLogs.length,
            progressNoteCount: progressNotes.length,
            status: task.status,
            priority: task.priority,
            estimatedHours: task.timeTracking
              ? (task.timeTracking as Record<string, unknown>).estimatedHours
              : undefined,
            timeSpentMs: task.timeTracking
              ? (task.timeTracking as Record<string, unknown>).timeSpent
              : 0,
          },
          // 建议 agent 在开始工作之前先阅读最近的评论，了解任务最新进展
          latestComment: comments.length > 0 ? comments[comments.length - 1] : null,
          latestWorkLog: workLogs.length > 0 ? workLogs[workLogs.length - 1] : null,
          // 最近一条进展笔记（接手者第一时间应看这里了解历史导向、陷阱、下步计划）
          latestProgressNote:
            progressNotes.length > 0 ? progressNotes[progressNotes.length - 1] : null,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * 创建子任务创建工具
 * 实现任务驱动工作模式的核心：复杂任务分解为可执行的子任务
 */
export function createTaskSubtaskCreateTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Subtask Create",
    name: "task_subtask_create",
    description:
      "Create a subtask under a parent task. Use this to decompose complex tasks into smaller, actionable pieces. Each subtask MUST have a clear description of what to do and how to verify completion. The subtask inherits project/team/org from the parent.",
    parameters: TaskSubtaskCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const parentTaskId = readStringParam(params, "parentTaskId", { required: true });
      const title = readStringParam(params, "title", { required: true });
      const description = readStringParam(params, "description", { required: true });
      const priority = readStringParam(params, "priority");
      const assignee = readStringParam(params, "assignee") || opts?.currentAgentId;
      const estimatedHours =
        typeof params.estimatedHours === "number" ? params.estimatedHours : undefined;
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("task.subtask.create", gatewayOpts, {
          parentTaskId,
          title,
          description,
          priority: priority || undefined,
          assigneeIds: assignee ? [assignee] : [],
          creatorId: opts?.currentAgentId || "system",
          estimatedHours,
        });

        return jsonResult({
          success: true,
          message: `Subtask created under parent task ${parentTaskId}: "${title}"`,
          subtask: response,
          tip: "子任务创建后，请第一时间将状态更新为 in-progress 并开始执行",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to create subtask: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

/**
 * 创建工作日志添加工具
 * 主要供 AI agent 在执行任务过程中持续记录工作进展，实现任务可追源性
 * 最佳实践：开始工作时记录 "started"，完成时记录 "completed"，遇到隐贾时记录 "blocked"
 */
export function createTaskWorklogAddTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Worklog Add",
    name: "task_worklog_add",
    description:
      "Record a work log entry for a task. Can be called by the task's assignee (worker agent) OR its supervisor (coordinator/parent agent who created the task). BEST PRACTICES: (1) log 'started' when you begin working, (2) log progress periodically for long-running tasks, (3) log 'completed' or 'failed' when done, (4) always log 'blocked' with details when you cannot proceed. This creates an audit trail essential for task-driven work.",
    parameters: TaskWorklogAddToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const action = readStringParam(params, "action", { required: true });
      const details = readStringParam(params, "details", { required: true });
      const duration = typeof params.duration === "number" ? params.duration : undefined;
      const result = readStringParam(params, "result");
      const errorMessage = readStringParam(params, "errorMessage");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const worklogId = `worklog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const response = await callGatewayTool("task.worklog.add", gatewayOpts, {
          taskId,
          agentId: opts?.currentAgentId || "system",
          action,
          details,
          duration,
          result: result || undefined,
          errorMessage: errorMessage || undefined,
          id: worklogId,
          createdAt: Date.now(),
        });

        // 如果 action 是 blocked，提醒同时更新任务状态
        const blockingActions = ["blocked", "stuck", "waiting", "cannot-proceed"];
        const isBlocking = blockingActions.some((a) => action.toLowerCase().includes(a));

        return jsonResult({
          success: true,
          message: `Work log recorded for task ${taskId}: [${action}]`,
          worklog: response || {
            id: worklogId,
            taskId,
            agentId: opts?.currentAgentId,
            action,
            details,
            duration,
            result,
          },
          reminder: isBlocking
            ? "任务被阻塞时，建议同时调用 task_update 将任务状态更新为 blocked，并添加阻塞原因注释"
            : undefined,
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to add work log: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

/**
 * task_progress_note_append 工具
 *
 * 非常重要：工作会话结束时必须调用，将阶段性工作成果沉淀下来。
 * 效果：同步写入 SQLite（权威）+ .notes/{taskId}.md（人类可读文件）双轨。
 */
export function createTaskProgressNoteAppendTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Progress Note",
    name: "task_progress_note_append",
    description:
      "Append a structured progress note to a task at the END of each work session. " +
      "Unlike worklogs (fine-grained action records), progress notes are session-level summaries in Markdown — " +
      "written once per session to capture: accomplished items, discovered patterns/pitfalls, key decisions with rationale, and next-step recommendations. " +
      "Data is written to BOTH SQLite (authoritative, with auto-compaction at 20 notes) AND a hierarchical .notes/{epic}/{feature}/{story}/{taskId}.md file in the project workspace (human-readable, with auto-archival). " +
      "Notes are also auto-synced to AgentProgress (pitfalls/decisions/nextSessionPlan) for cross-session learning. " +
      "WHEN TO CALL: At the end of every work session before handing off or resting. " +
      "CONTENT FORMAT: Markdown. Include headers like ## Accomplished, ## Findings, ## Decisions, ## Next Steps.",
    parameters: TaskProgressNoteAppendToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const content = readStringParam(params, "content", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const response = await callGatewayTool("task.progress_note.append", gatewayOpts, {
          taskId,
          agentId: opts?.currentAgentId || "system",
          content,
          authorType: "agent",
        });

        const res = response as Record<string, unknown> | null;
        return jsonResult({
          success: true,
          message: res?.message ?? `Progress note appended to task ${taskId}`,
          taskId,
          noteCount: res?.noteCount,
          fileWritten: res?.fileWritten ?? false,
          tip: "进展笔记已写入 SQLite，下次我来或其他 Agent 接手时可通过 task_get 或阅读 .notes/ 目录获取完整进展记录。",
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to append progress note: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

/**
 * task_ping_activity 工具
 *
 * 借鉴 Hermes Agent v0.8.0 「活动感知超时」设计：
 * Agent 在执行长时间任务时，只要调用此工具就刷新 lastActivityAt，
 * 就能防止被调度器误判为僵尸任务而触发重新活化。
 *
 * 使用场景：执行耗时超过 5 分钟的操作（如大文件写入、复杂计算、网络请求等）
 * 中途定期 ping，告知系统我还在活跃工作中。
 */
export function createTaskPingActivityTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Ping Activity",
    name: "task_ping_activity",
    description:
      "Refresh the activity timestamp of an in-progress task to prevent it from being misidentified as a stuck/zombie task by the scheduler. " +
      "WHEN TO USE: Call this every 5-10 minutes during long-running operations (file writes, computations, network requests, etc.) " +
      "to signal that you are actively working. This implements Hermes-style inactivity-based timeout: " +
      "only truly idle agents time out — actively working agents are never killed.",
    parameters: Type.Object({
      taskId: Type.String({
        minLength: 1,
        description: "[REQUIRED] The task ID to refresh activity for.",
      }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        await callGatewayTool("task.ping", gatewayOpts, {
          taskId,
          agentId: opts?.currentAgentId || "system",
        });

        return jsonResult({
          success: true,
          message: `Activity refreshed for task ${taskId}. Inactivity timeout reset.`,
          taskId,
          refreshedAt: new Date().toISOString(),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to ping task activity: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

/**
 * task_reset - 强制重置任务状态（绕过状态机）
 *
 * 适用场景：
 * - 任务被误标为 done/cancelled，需重新打开
 * - 任务陷入 blocked 死锁，无法通过正常流转解除
 * - 系统异常导致任务进入错误状态
 */
export function createTaskResetTool(opts?: { currentAgentId?: string }): AnyAgentTool {
  return {
    label: "Task Reset",
    name: "task_reset",
    description:
      "Force-reset a task to a non-terminal status, bypassing the state machine. " +
      "USE THIS WHEN: a task is stuck in done/cancelled by mistake, blocked in a deadlock, " +
      "or entered an incorrect terminal state due to a system error. " +
      "This is an administrative action — it skips all transition guards. " +
      "Target statuses: todo (default), in-progress, blocked.",
    parameters: Type.Object({
      taskId: Type.String({
        minLength: 1,
        description: "[REQUIRED] The task ID to reset.",
      }),
      targetStatus: Type.Optional(
        Type.Union([
          Type.Literal("todo"),
          Type.Literal("in-progress"),
          Type.Literal("blocked"),
        ], {
          description: "Target status after reset. Defaults to 'todo'.",
        }),
      ),
      reason: Type.Optional(
        Type.String({
          description: "Reason for the forced reset (for audit log).",
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const targetStatus = (readStringParam(params, "targetStatus") ?? "todo") as
        | "todo"
        | "in-progress"
        | "blocked";
      const reason = readStringParam(params, "reason");
      const gatewayOpts = readGatewayCallOptions(params);

      try {
        const result = await callGatewayTool("task.reset", gatewayOpts, {
          taskId,
          targetStatus,
          reason: reason ?? "通过 task_reset 工具手动重置",
          actor: opts?.currentAgentId ?? "system",
        });

        return jsonResult({
          success: true,
          message: `Task ${taskId} reset from "${(result as Record<string, unknown>)?.previousStatus}" to "${targetStatus}".`,
          ...((result as Record<string, unknown>) ?? {}),
        });
      } catch (error) {
        return jsonResult({
          success: false,
          error: `Failed to reset task: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 下面是工具层加强功能工具（Flow 度量 / 关键路径 / 健康度 / OKR / AC 验证 / 搜索 / 时间线 / CI 质量门禁）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flow 度量工具 — 计算 CycleTime/LeadTime/Throughput/FlowEfficiency
 * 对标 Linear 的 Insights 面板和 DORA 四大度量
 */
export function createTaskFlowMetricsTool(): AnyAgentTool {
  return {
    label: "Task Flow Metrics",
    name: "task_flow_metrics",
    description:
      "Calculate Flow Metrics for a project: CycleTime (in-progress→done), LeadTime (created→done), Throughput (tasks/week), FlowEfficiency (active vs wait time). " +
      "Based on DORA 2024 and Mik Kersten Flow Framework. Use this to diagnose delivery bottlenecks and identify improvement areas. " +
      "Returns p50/p85/p95 percentiles for cycle and lead time, WIP snapshot, and health insights.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID to calculate metrics for" }),
      fromDays: Type.Optional(Type.Number({ description: "Lookback window in days (default 30)", minimum: 1, maximum: 365 })),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "projectId", { required: true });
      const fromDays = typeof params.fromDays === "number" ? params.fromDays : 30;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("tasks.flowMetrics", gatewayOpts, {
          projectId,
          fromDays,
          workspaceRoot: readStringParam(params, "workspaceRoot"),
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to get flow metrics: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * 关键路径分析工具 — 识别项目中不能延迟的任务链
 * 对标 Linear Dependencies 视图和 Jira Advanced Roadmaps
 */
export function createTaskCriticalPathTool(): AnyAgentTool {
  return {
    label: "Task Critical Path",
    name: "task_critical_path",
    description:
      "Analyze the critical path of a project using CPM (Critical Path Method). " +
      "Identifies tasks that cannot be delayed without impacting the project end date. " +
      "Also highlights near-critical tasks (float < 8h) and detects circular dependencies. " +
      "Provide projectId. Returns criticalPath[], projectDurationHours, nearCriticalTaskIds.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      includeCompleted: Type.Optional(Type.Boolean({ description: "Include completed tasks in analysis (default false)" })),
      hoursPerSP: Type.Optional(Type.Number({ description: "Hours per story point for duration estimation (default 4)" })),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "projectId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("tasks.criticalPath", gatewayOpts, {
          projectId,
          includeCompleted: params.includeCompleted,
          hoursPerSP: params.hoursPerSP,
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to get critical path: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * 任务健康度检查工具 — 一次识别项目所有高风险任务
 * 对标 Linear Task Health 和 Jira Issue Health Score
 */
export function createTaskHealthCheckTool(): AnyAgentTool {
  return {
    label: "Task Health Check",
    name: "task_health_check",
    description:
      "Evaluate health scores for all tasks in a project. Returns green/yellow/red ratings based on aging, " +
      "acceptance criteria coverage, due date proximity, blocked status, and dependency risk. " +
      "Use this daily or at sprint start to identify tasks that need immediate attention. " +
      "Filter by level=red to see only critical issues.",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Project ID to check (or omit for personal tasks)" })),
      scope: Type.Optional(Type.Union([Type.Literal("personal"), Type.Literal("project")], { description: "personal or project (default project)" })),
      levelFilter: Type.Optional(Type.Union([Type.Literal("green"), Type.Literal("yellow"), Type.Literal("red")], { description: "Filter results by health level" })),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "projectId");
      const scope = readStringParam(params, "scope") || "project";
      const levelFilter = readStringParam(params, "levelFilter");
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("tasks.health", gatewayOpts, {
          projectId,
          scope,
          levelFilter,
          workspaceRoot: readStringParam(params, "workspaceRoot"),
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to get task health: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * OKR 目标列表工具 — 查看项目 OKR 目标和完成率
 * 对标 Linear Roadmap Goals 和 Google OKR 主题
 */
export function createTaskOkrListTool(): AnyAgentTool {
  return {
    label: "Task OKR List",
    name: "task_okr_list",
    description:
      "List all OKR objectives and key results for a project with completion percentages. " +
      "Shows how many tasks are linked to each objective and their completion rate. " +
      "Use this to check progress toward strategic goals and identify unlinked tasks. " +
      "RECOMMENDED: run this at Sprint Review to report OKR progress to stakeholders.",
    parameters: Type.Object({
      projectId: Type.String({ description: "[REQUIRED] Project ID" }),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "projectId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("tasks.okr.list", gatewayOpts, {
          projectId,
          workspaceRoot: readStringParam(params, "workspaceRoot"),
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to list OKR: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * AC 逐条确认工具 — 验收标准逐条打分
 * 防止 AI Agent “敷衍式完成” 的核心保障
 */
export function createTaskAcVerifyTool(): AnyAgentTool {
  return {
    label: "Task AC Verify",
    name: "task_ac_verify",
    description:
      "Verify individual acceptance criteria for a task. Mark specific criteria as passed/failed with evidence. " +
      "This prevents 'checkbox completion' — AI Agents MUST call this tool to prove each criterion is actually met before marking tasks done. " +
      "Provide criteriaUpdates array: [{ criterionId, passes, note }]. Use task_get first to get criterion IDs.",
    parameters: Type.Object({
      taskId: Type.String({ description: "[REQUIRED] Task ID" }),
      criteriaUpdates: Type.Array(
        Type.Object({
          criterionId: Type.String({ description: "AC criterion ID" }),
          passes: Type.Boolean({ description: "true = criterion met, false = not met" }),
          note: Type.Optional(Type.String({ description: "Evidence or reason" })),
        }),
        { description: "List of criteria to verify" },
      ),
      verifiedBy: Type.Optional(Type.String({ description: "Verifier agent ID (defaults to current agent)" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const criteriaUpdates = Array.isArray(params.criteriaUpdates) ? params.criteriaUpdates : [];
      const verifiedBy = readStringParam(params, "verifiedBy");
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("task.ac.verify", gatewayOpts, {
          taskId,
          criteriaUpdates,
          verifiedBy,
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to verify AC: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * 任务搜索工具 — 全文/关键词搜索
 * 对标 Linear Quick Search 和 GitHub Issues 搜索
 */
export function createTaskSearchTool(): AnyAgentTool {
  return {
    label: "Task Search",
    name: "task_search",
    description:
      "Search tasks by keyword across title, description, and tags. Results are ranked by relevance (title match > tag match > description match). " +
      "Supports filtering by projectId, status, assigneeId, tag, and level. " +
      "Use this instead of task_list when you need to find tasks by content rather than structured filters.",
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: "Search keyword (searches title, description, tags)" })),
      projectId: Type.Optional(Type.String()),
      status: Type.Optional(TaskStatus),
      assigneeId: Type.Optional(Type.String()),
      tag: Type.Optional(Type.String()),
      level: Type.Optional(WorkItemLevel),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: "Max results (default 20)" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const keyword = readStringParam(params, "keyword");
      const projectId = readStringParam(params, "projectId");
      const status = readStringParam(params, "status");
      const assigneeId = readStringParam(params, "assigneeId");
      const tag = readStringParam(params, "tag");
      const level = readStringParam(params, "level");
      const limit = typeof params.limit === "number" ? params.limit : 20;
      const gatewayOpts = readGatewayCallOptions(params);
      if (!keyword && !projectId && !status && !assigneeId && !tag) {
        return jsonResult({ success: false, error: "At least one of keyword/projectId/status/assigneeId/tag is required" });
      }
      try {
        const result = await callGatewayTool("task.search", gatewayOpts, {
          keyword, projectId, status, assigneeId, tag, level, limit,
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to search tasks: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * 任务生命周期时间线工具 — 查看任务各阶段持续时长
 * 对标 Linear Cycle Time Breakdown
 */
export function createTaskTimelineTool(): AnyAgentTool {
  return {
    label: "Task Timeline",
    name: "task_timeline",
    description:
      "Get the lifecycle timeline of a task: how long it spent in each status (todo→in-progress→review→done). " +
      "Returns leadTimeHours (created→done), cycleTimeHours (started→done), and per-stage durations. " +
      "Use this to identify which stage caused the most delay, especially for tasks that missed their due date.",
    parameters: Type.Object({
      taskId: Type.String({ description: "[REQUIRED] Task ID" }),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("task.timeline", gatewayOpts, { taskId });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to get task timeline: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * CI 质量门禁回写工具 — CI/CD 结果自动回写 AC passes 状态
 * 这是“产出好代码”配套管理的核心：代码质量验证与任务状态双向同步
 */
export function createTaskQualityGateUpdateTool(): AnyAgentTool {
  return {
    label: "Task Quality Gate Update",
    name: "task_quality_gate_update",
    description:
      "Write CI/CD build and test results back to task acceptance criteria (AC). " +
      "Pass gates=[ { gateName, passed, detail } ] to automatically match and update relevant AC items. " +
      "Built-in keyword mapping: tsc→type checking AC, tests→unit test AC, lint→code style AC, build→build AC. " +
      "If no matching AC exists, autoAppend=true (default) will create new AC items. " +
      "If all gates pass and autoTransitionToReview=true, task status automatically moves to 'review'. " +
      "RECOMMENDED: call this in your CI pipeline after each build run.",
    parameters: Type.Object({
      taskId: Type.String({ description: "[REQUIRED] Task ID" }),
      gates: Type.Array(
        Type.Object({
          gateName: Type.String({ description: "Gate name: tsc | tests | lint | build | coverage | e2e | custom" }),
          passed: Type.Boolean({ description: "Whether the gate passed" }),
          detail: Type.Optional(Type.String({ description: "Result detail / error message" })),
          matchCriterionKeywords: Type.Optional(Type.Array(Type.String(), { description: "Extra keywords to match against AC descriptions" })),
        }),
        { description: "List of CI gate results" },
      ),
      actor: Type.Optional(Type.String({ description: "Actor ID (default: \"ci\")" })),
      autoAppend: Type.Optional(Type.Boolean({ description: "Auto-create AC items for unmatched gates (default true)" })),
      autoTransitionToReview: Type.Optional(Type.Boolean({ description: "Move task to review when all gates pass (default false)" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const gates = Array.isArray(params.gates) ? params.gates : [];
      const actor = readStringParam(params, "actor") || "ci";
      const autoAppend = typeof params.autoAppend === "boolean" ? params.autoAppend : true;
      const autoTransitionToReview = typeof params.autoTransitionToReview === "boolean" ? params.autoTransitionToReview : false;
      const gatewayOpts = readGatewayCallOptions(params);
      if (gates.length === 0) {
        return jsonResult({ success: false, error: "gates[] array is required and must not be empty" });
      }
      try {
        const result = await callGatewayTool("task.quality_gate_update", gatewayOpts, {
          taskId, gates, actor, autoAppend, autoTransitionToReview,
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to update quality gate: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * B0: task_triage_auto — Triage Intelligence
 * 对标 Linear 2026 Triage Intelligence：基于标题/描述/类型自动评估建议优先级/标签
 */
export function createTaskTriageAutoTool(): AnyAgentTool {
  return {
    label: "Task Triage Auto",
    name: "task_triage_auto",
    description:
      "Automatically assess task priority and suggest labels using keyword analysis (Triage Intelligence). " +
      "Pass taskId to analyze an existing task, or pass title+description for a new task. " +
      "Returns suggestedPriority, suggestedLabels, matchedKeywords, and rationale. " +
      "RECOMMENDED: Run this on every new task before Sprint Planning to catch under-prioritized bugs/incidents. " +
      "If priorityUpgraded=true, update task priority accordingly with task_update.",
    parameters: Type.Object({
      taskId: Type.Optional(Type.String({ description: "Existing task ID to analyze" })),
      title: Type.Optional(Type.String({ description: "Task title (if not using taskId)" })),
      description: Type.Optional(Type.String({ description: "Task description" })),
      type: Type.Optional(Type.String({ description: "Task type (bugfix/feature/etc.)" })),
      priority: Type.Optional(Type.String({ description: "Current priority for comparison" })),
      tags: Type.Optional(Type.Array(Type.String())),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("task.triage", gatewayOpts, {
          taskId: readStringParam(params, "taskId"),
          title: readStringParam(params, "title"),
          description: readStringParam(params, "description"),
          type: readStringParam(params, "type"),
          priority: readStringParam(params, "priority"),
          tags: params.tags,
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to triage: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * B2: task_sla_check — SLA 违约检查
 * 对标 Linear 2026 Issue SLA 追踪：urgent=4h/high=24h/medium=72h/low=168h
 */
export function createTaskSlaCheckTool(): AnyAgentTool {
  return {
    label: "Task SLA Check",
    name: "task_sla_check",
    description:
      "Check which in-progress tasks have breached or are at-risk of breaching SLA (Service Level Agreement). " +
      "SLA standards: urgent=4h, high=24h, medium=72h, low=168h since task started. " +
      "Returns two lists: 'breached' (already overdue) and 'atRisk' (remaining time < 25%). " +
      "RECOMMENDED: Run at the start of each session to catch SLA violations early. " +
      "Take immediate action on 'urgent' breached tasks.",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Filter by project ID" })),
      assigneeId: Type.Optional(Type.String({ description: "Filter by assignee agent ID" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("task.sla.check", gatewayOpts, {
          projectId: readStringParam(params, "projectId"),
          assigneeId: readStringParam(params, "assigneeId"),
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to check SLA: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * B4: task_template_upsert — 创建/更新任务模板
 * 对标 Linear 2026 Issue Templates
 */
export function createTaskTemplateUpsertTool(): AnyAgentTool {
  return {
    label: "Task Template Upsert",
    name: "task_template_upsert",
    description:
      "Create or update a reusable task template. Templates pre-fill common fields (description, type, priority, tags, storyPoints, acceptanceCriteria). " +
      "Best practice: create templates for recurring task types like 'Bug Report', 'Feature Implementation', 'Code Review', 'Documentation Update'. " +
      "Use task_template_apply to apply a template when creating new tasks.",
    parameters: Type.Object({
      name: Type.String({ description: "[REQUIRED] Template name" }),
      id: Type.Optional(Type.String({ description: "Template ID (auto-generated if omitted)" })),
      description: Type.Optional(Type.String({ description: "Template description" })),
      useCases: Type.Optional(Type.String({ description: "When to use this template" })),
      fields: Type.Object({
        title: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        type: Type.Optional(Type.String()),
        priority: Type.Optional(Type.String()),
        level: Type.Optional(Type.String()),
        tags: Type.Optional(Type.Array(Type.String())),
        estimatedHours: Type.Optional(Type.Number()),
        storyPoints: Type.Optional(Type.Number()),
        acceptanceCriteria: Type.Optional(Type.Array(Type.String())),
      }, { description: "Fields to pre-fill when template is applied" }),
      createdBy: Type.Optional(Type.String()),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("task.template.upsert", gatewayOpts, {
          id: readStringParam(params, "id"),
          name: readStringParam(params, "name"),
          description: readStringParam(params, "description"),
          useCases: readStringParam(params, "useCases"),
          fields: params.fields,
          createdBy: readStringParam(params, "createdBy"),
          workspaceRoot: readStringParam(params, "workspaceRoot"),
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to upsert template: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * B4: task_template_list — 列出任务模板
 */
export function createTaskTemplateListTool(): AnyAgentTool {
  return {
    label: "Task Template List",
    name: "task_template_list",
    description:
      "List all available task templates, sorted by usage frequency. " +
      "Use this before creating a task to find applicable templates. " +
      "Filter by keyword to find templates for specific scenarios.",
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: "Filter keyword" })),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("task.template.list", gatewayOpts, {
          keyword: readStringParam(params, "keyword"),
          workspaceRoot: readStringParam(params, "workspaceRoot"),
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to list templates: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}

/**
 * B4: task_template_apply — 应用任务模板
 * 返回合并后的字段，直接传入 task_create
 */
export function createTaskTemplateApplyTool(): AnyAgentTool {
  return {
    label: "Task Template Apply",
    name: "task_template_apply",
    description:
      "Apply a task template to get pre-filled fields for task creation. " +
      "Returns mergedFields that can be directly used as parameters for task_create. " +
      "Pass overrides to customize specific fields while keeping template defaults. " +
      "Workflow: task_template_list -> task_template_apply -> task_create(mergedFields).",
    parameters: Type.Object({
      templateId: Type.String({ description: "[REQUIRED] Template ID from task_template_list" }),
      overrides: Type.Optional(Type.Object({
        title: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        type: Type.Optional(Type.String()),
        priority: Type.Optional(Type.String()),
        tags: Type.Optional(Type.Array(Type.String())),
        acceptanceCriteria: Type.Optional(Type.Array(Type.String())),
        storyPoints: Type.Optional(Type.Number()),
      }, { description: "Override specific fields from the template" })),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayOpts = readGatewayCallOptions(params);
      try {
        const result = await callGatewayTool("task.template.apply", gatewayOpts, {
          templateId: readStringParam(params, "templateId"),
          overrides: params.overrides,
          workspaceRoot: readStringParam(params, "workspaceRoot"),
        });
        return jsonResult({ success: true, ...((result as Record<string, unknown>) ?? {}) });
      } catch (error) {
        return jsonResult({ success: false, error: `Failed to apply template: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  };
}
