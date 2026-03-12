# 任务老化与防沉淀机制

## 📋 功能概述

防止待办池中的任务长期积压变成"死任务"，基于业界最佳实践（Jira Automation、Scrum Backlog Grooming）设计的自动化监督系统。

## 🎯 核心机制

### **1. 三级老化预警**

| 老化级别     | 触发条件                       | 自动操作               |
| ------------ | ------------------------------ | ---------------------- |
| **Fresh**    | < 7 天未分配<br/>< 1 天无活动  | 正常状态               |
| **Aging**    | ≥ 7 天未分配<br/>≥ 1 天无活动  | 发送提醒给主管         |
| **Stale**    | ≥ 14 天未分配<br/>≥ 3 天无活动 | 升级通知 + 紧急标记    |
| **Critical** | ≥ 30 天未分配<br/>≥ 7 天无活动 | 自动归档（降低优先级） |

### **2. 特殊状态监控**

- **阻塞任务**：超过 2 天处于 `blocked` 状态 → 重新评估分配
- **进行中任务**：超过 3 天无进展 → 提醒检查是否卡住

---

## ⚙️ 配置参数

在 `src/tasks/task-aging.ts` 中可调整阈值：

```typescript
export const AGING_THRESHOLDS = {
  UNASSIGNED_REMIND: 7 * 24 * 60 * 60 * 1000, // 7 天 - 提醒
  UNASSIGNED_ESCALATE: 14 * 24 * 60 * 60 * 1000, // 14 天 - 升级
  UNASSIGNED_ARCHIVE: 30 * 24 * 60 * 60 * 1000, // 30 天 - 归档
  IN_PROGRESS_STALE: 3 * 24 * 60 * 60 * 1000, // 3 天 - 无进展
  BLOCKED_ESCALATE: 2 * 24 * 60 * 60 * 1000, // 2 天 - 阻塞
} as const;
```

---

## 🚀 使用方法

### **方式 1：手动扫描**

```typescript
import { scanAndProcessAgingTasks } from "./tasks/task-aging.js";

// 扫描所有项目
const stats = await scanAndProcessAgingTasks({
  enableReminders: true,
  enableEscalation: true,
  enableArchive: false, // 建议手动确认后再启用
});

console.log(
  `处理完成：提醒 ${stats.reminded} 个，升级 ${stats.escalated} 个，归档 ${stats.archived} 个`,
);
```

### **方式 2：定时任务（推荐）**

```typescript
import { startAgingTaskScheduler } from "./tasks/task-aging.js";

// 每小时扫描一次
startAgingTaskScheduler({
  intervalHours: 1,
  projectId: "wo-shi-renlei", // 可选：只扫描特定项目
  enableReminders: true,
  enableEscalation: true,
  enableArchive: false,
});
```

### **方式 3：项目启动时自动启用**

在项目启动脚本中添加：

```typescript
import { initTaskAgingScheduler } from "./cron/task-aging-scheduler.js";

// 系统启动时初始化
initTaskAgingScheduler();
```

---

## 📊 消息示例

### **老化提醒（Aging）**

```
⚠️ 任务老化提醒

**任务**: 实现用户登录功能
**ID**: task_1773230323937_kmskg0qwm
**年龄**: 8 天
**最后活动**: 5 天前
**当前状态**: todo
**执行者**: 未分配

该任务已经长时间没有进展，请及时处理：
- 如果是重要任务，请立即分配给合适的执行者
- 如果不再需要，请标记为 cancelled
- 如果需要更多信息，请先更新任务描述
```

### **升级通知（Stale）**

```
🔴 任务升级通知

**紧急**: 有任务长期未得到处理，需要立即关注！

**任务**: 数据库迁移方案
**ID**: task_1773230324289_541mq1i2c
**年龄**: 16 天（已超过 14 天）
**最后活动**: 10 天前
**创建者**: product-manager
**当前执行者**: 无人认领

**建议行动**:
1. 立即审查该任务的必要性
2. 分配给合适的团队成员
3. 或者标记为不再需要

请在 24 小时内处理此任务，否则将自动降低优先级或归档。
```

---

## 🔧 高级功能

### **查询任务老化状态**

```typescript
import { getAgingLevel, getTaskAgeInDays, getDaysSinceLastActivity } from "./tasks/task-aging.js";

const task = await storage.getTask(taskId);

// 获取老化级别
const agingLevel = getAgingLevel(task);
// => "fresh" | "aging" | "stale" | "critical"

// 获取具体数据
const ageInDays = getTaskAgeInDays(task); // 任务年龄（天）
const daysInactive = getDaysSinceLastActivity(task); // 无活动天数
```

### **自定义自动化规则**

```typescript
import { shouldTriggerAutoAction, sendAgingReminder } from "./tasks/task-aging.js";

const task = await storage.getTask(taskId);

// 检查是否应该触发特定操作
if (shouldTriggerAutoAction(task, "remind")) {
  await sendAgingReminder(task, supervisorId);
}

// 可以扩展更多自定义规则
```

---

## 💡 最佳实践建议

### **1. 定期审查会议**

配合系统的自动化机制，建议每周召开**Backlog Grooming Meeting**：

```typescript
// 每周一上午 9 点自动提醒召开会议
const weeklyReviewReminder = {
  schedule: "0 9 * * MON",
  action: async () => {
    const staleTasks = await task_list({
      projectId: "wo-shi-renlei",
      status: ["todo", "pending"],
    });

    const agingTasks = staleTasks.filter(
      (t) => (Date.now() - t.createdAt) / (1000 * 60 * 60 * 24) > 7,
    );

    if (agingTasks.length > 0) {
      await agent_communicate({
        targetAgentId: "project-manager",
        messageType: "notification",
        message: `本周有待审查的积压任务：${agingTasks.length} 个`,
      });
    }
  },
};
```

### **2. Definition of Ready (DoR)**

为防止模糊任务进入待办池，建议设置准入标准：

```typescript
// 创建任务时的检查清单
function validateTaskReady(task) {
  return {
    hasClearTitle: task.title?.length >= 5,
    hasDescription: task.description?.length >= 20,
    hasAssigneeOrPlan: task.assignees?.length > 0 || task.metadata?.reviewDate,
    hasPriority: ["low", "medium", "high", "urgent"].includes(task.priority),
    hasProject: !!task.projectId,
  };
}
```

### **3. 项目隔离策略**

为每个项目配置独立的扫描器：

```typescript
const projectIds = ["project-a", "project-b", "wo-shi-renlei"];

for (const projectId of projectIds) {
  startAgingTaskScheduler({
    intervalHours: 1,
    projectId,
    enableReminders: true,
    enableEscalation: true,
  });
}
```

---

## ⚠️ 注意事项

### **1. 自动归档谨慎启用**

```typescript
// ❌ 不建议默认启用
enableArchive: true

// ✅ 建议先手动审查
enableArchive: false

// 或者配置更长的缓冲期
AGING_THRESHOLDS.UNASSIGNED_ARCHIVE: 60 * 24 * 60 * 60 * 1000 // 60 天
```

### **2. 避免重复提醒**

系统会自动记录 `lastRemindedAt` 和 `lastEscalatedAt`，防止同一任务被重复通知。

### **3. 权限控制**

提醒和升级消息只会发送给：

- 任务的 `metadata.supervisorId`
- 任务创建者 `creatorId`
- 项目主管（可从配置读取）

---

## 📈 效果评估

### **关键指标**

定期生成报告，追踪：

```typescript
interface AgingReport {
  totalTasks: number;
  freshTasks: number;
  agingTasks: number;
  staleTasks: number;
  criticalTasks: number;

  avgTaskAge: number;
  avgCompletionTime: number;

  remindedCount: number;
  escalatedCount: number;
  archivedCount: number;
}
```

### **健康度评分**

```typescript
function calculateBacklogHealth(tasks: Task[]): number {
  const agingLevels = tasks.map(getAgingLevel);

  const weights = {
    fresh: 100,
    aging: 70,
    stale: 30,
    critical: 0,
  };

  const scores = agingLevels.map((level) => weights[level]);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  return Math.round(avgScore); // 0-100 分
}
```

---

## 🎓 业界参考

本机制参考了以下业界最佳实践：

1. **Atlassian Jira Automation**
   - 自动升级过期 Issue
   - 定时扫描未分配任务

2. **Scrum Backlog Grooming**
   - 定期审查待办事项
   - Definition of Ready (DoR)

3. **Kanban WIP Limits**
   - 限制进行中任务数量
   - 防止任务积压

4. **Agile Task Aging**
   - 任务年龄可视化
   - 累积流程图（CFD）

---

## 🔮 未来扩展

计划增加的功能：

- [ ] 任务健康度仪表盘
- [ ] Slack/钉钉集成通知
- [ ] 自动重新分配算法（基于能力匹配）
- [ ] 任务依赖关系分析
- [ ] 工作量平衡建议

---

**最后更新**: 2026-03-11  
**维护者**: JieZi-ai-PS Team
