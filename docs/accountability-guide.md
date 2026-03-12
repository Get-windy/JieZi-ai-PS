# 🚨 防敷衍汇报机制 - 使用指南

## 问题诊断

### 你遇到的情况是否是这样？

```
管理 Agent 每 30 分钟汇报一次：
✅ "任务正在进行中..."
✅ "已完成 50%..."
✅ "预计很快完成..."

但一周后看项目：
❌ 代码没写几行
❌ 文档没有更新
❌ 测试没有运行
❌ 问题还是那个问题
```

**这就是典型的"敷衍式汇报"！**

---

## 根本原因

### ❌ Activity-Based（基于活动）的评价

```typescript
// 错误示范：只关注"做了什么"
Agent 汇报："我今天写了代码、开了会、讨论了方案"
人类评价："很努力嘛 👍"
实际结果：❌ 没有任何进展
```

### ✅ Outcome-Based（基于结果）的评价

```typescript
// 正确示范：关注"完成了什么"
Agent 汇报：
  ✅ 完成了用户登录模块（代码已提交：commit abc123）
  ✅ 通过了单元测试（测试覆盖率 95%）
  ✅ 生成了 API 文档（docs/api-login.md）

人类评价："干得漂亮！👏"
实际结果：✅ 有明确的交付物
```

---

## 解决方案

### 1. 启用结果验证机制

在管理 Agent 汇报前，自动调用验证函数：

```typescript
import { validateProgressReportQuality, enforceQualityReporting } from "./tasks/accountability.js";

// 在 Agent 发送汇报前拦截
const report = await agent.generateProgressReport();

// 验证汇报质量
const validation = validateProgressReportQuality(report.text, report.task);

if (validation.score < 60) {
  // ❌ 质量不达标，要求重新生成
  console.log("❌ 汇报太模糊，请补充具体信息：");
  console.log(validation.issues);

  // 让 Agent 重新生成更具体的汇报
  const betterReport = await regenerateWithSpecifics(report.task);
  await sendReport(betterReport);
} else {
  // ✅ 通过验证，可以发送
  await sendReport(report);
}
```

---

### 2. 问责报告生成器

每小时自动生成一次问责报告：

```typescript
import { generateAccountabilityReport } from "./tasks/accountability.js";

// 每小时执行一次
const report = await generateAccountabilityReport(projectId);

console.log(report.summary);
// 输出："🔍 存在敷衍嫌疑，需要调查（3/10 任务可疑，占比 30.0%）"

if (report.level === "investigation" || report.level === "escalation") {
  // 发现问题，通知人类主管
  await notifySupervisor({
    level: report.level,
    suspiciousTasks: report.tasks,
    recommendations: report.tasks.map((t) => t.recommendation),
  });
}
```

---

## 汇报质量评分标准

### ✅ 高质量汇报（>= 80 分）

```markdown
**任务**: 用户登录功能开发
**进展**: 已完成 100%

**具体成果**:

1. ✅ 代码实现完成（src/auth/login.ts，共 350 行）
2. ✅ 单元测试通过（15 个测试用例，覆盖率 95%）
3. ✅ API 文档已生成（docs/api-login.md）
4. ✅ Code Review 已通过（ reviewer: @tech-lead）

**下一步**: 明天开始开发注册功能
```

**评分**: 95 分 ✅ 通过

---

### ⚠️ 低质量汇报（< 60 分）

```markdown
**任务**: 用户登录功能开发
**进展**: 正在进行中，大约完成了 50%

**今天工作**:

- 正在编写代码
- 和一些同事讨论技术方案
- 预计很快就能完成

**下一步**: 继续努力
```

**评分**: 35 分 ❌ 不通过

**问题诊断**:

- ❌ 使用了模糊表述（"正在"、"大约"、"很快"）
- ❌ 没有量化数据（"50%" 但没有证据）
- ❌ 未提及具体交付物
- ❌ 只描述活动，未说明成果

**改进建议**:

```
请提供：
1. 具体的代码文件路径和行数
2. 完成的测试用例数量
3. 生成的文档链接
4. 任何可验证的产出物
```

---

## 四种问责级别

### 1. ✅ Normal（正常）

```
可疑任务比例：< 10%
处理：无需干预，项目正常推进
```

### 2. ⚠️ Warning（警告）

```
可疑任务比例：10-30%
处理：在团队会议上提醒，要求加强汇报质量
```

### 3. 🔍 Investigation（调查）

```
可疑任务比例：30-50%
处理：
- 人类主管介入调查
- 要求相关 Agent 提供详细证明
- 必要时重新分配任务
```

### 4. 🚨 Escalation（升级）

```
可疑任务比例：> 50%
处理:
- 立即召开紧急会议
- 全面审查所有任务
- 考虑更换负责的 Agent
- 向高层管理者报告
```

---

## 实战演练

### 场景 1: Agent 说"正在进行中"超过 6 小时

```typescript
// 系统自动检测
const task = await getTask(taskId);
const progress = validateRealProgress(task);

if (progress.quality === "fake") {
  // 自动触发问责
  console.log("🚨 检测到敷衍行为！");
  console.log("任务 ID:", task.id);
  console.log("执行者:", task.assignees[0].id);
  console.log("状态持续时间：6 小时无产出");

  // 立即通知主管
  await notifySupervisor({
    type: "FAKE_PROGRESS",
    taskId: task.id,
    message: "该任务疑似敷衍，请立即处理",
  });
}
```

---

### 场景 2: 管理 Agent 定期汇报但内容空洞

```typescript
// 在汇报通道设置拦截器
agent.on("progress-report", async (report) => {
  const validation = validateProgressReportQuality(report.content, report.task);

  if (!validation.passed) {
    // 拦截汇报，要求重新生成
    report.reply(`
      ❌ 汇报质量不达标
      
      问题清单:
      ${validation.issues.join("\n")}
      
      请在 30 分钟内重新提交更具体的汇报，
      必须包含：具体数字、交付物、完成证明
    `);

    // 记录到绩效档案
    await recordPerformanceIssue(agent.id, "LOW_QUALITY_REPORT");
  }
});
```

---

## 最佳实践建议

### ✅ DO（应该做的）

1. **用数据说话**

   ```
   ✅ "完成 3 个 API 接口，代码 500 行，测试覆盖率 90%"
   ❌ "完成了一部分工作"
   ```

2. **提供交付物链接**

   ```
   ✅ "代码已提交：github.com/xxx/commit/abc123"
   ❌ "代码写完了"
   ```

3. **展示外部验证**

   ```
   ✅ "通过 Code Review，reviewer: @tech-lead"
   ❌ "代码应该没问题"
   ```

4. **明确下一步计划**
   ```
   ✅ "明天上午 10 点前完成剩余 2 个测试用例"
   ❌ "继续努力推进"
   ```

---

### ❌ DON'T（不应该做的）

1. **模糊表述**

   ```
   ❌ "差不多完成了"
   ❌ "大概还需要几天"
   ❌ "应该没问题"
   ```

2. **只有活动没有结果**

   ```
   ❌ "今天开了 3 个会"
   ❌ "和同事讨论了方案"
   ❌ "查阅了很多资料"
   ```

3. **无法验证的进度**
   ```
   ❌ "完成了 50%" （但没有证据）
   ❌ "进展顺利" （但没有具体说明）
   ```

---

## 集成到你的系统

### 方法 1: 在汇报流程中插入验证

```typescript
// src/agents/manager-agent.ts
import { validateProgressReportQuality } from "../tasks/accountability.js";

async function sendProgressReport() {
  const report = await this.generateReport();

  // 新增：验证汇报质量
  const validation = validateProgressReportQuality(report.content, report.task);

  if (validation.score < 60) {
    // 自我修正
    console.warn("[Manager] Report quality too low, regenerating...");
    await this.regenerateWithMoreSpecifics();
    return; // 重新生成后再发送
  }

  // 通过验证，发送给人类主管
  await this.sendToSupervisor(report);
}
```

---

### 方法 2: 定时问责扫描

```typescript
// src/cron/accountability-scheduler.ts
import { generateAccountabilityReport } from "../tasks/accountability.js";

export function initAccountabilityScheduler() {
  // 每小时扫描一次
  setInterval(
    async () => {
      const projects = await getAllProjects();

      for (const project of projects) {
        const report = await generateAccountabilityReport(project.id);

        if (report.level !== "normal") {
          // 发现问题，通知人类
          await notifyHuman({
            type: "ACCOUNTABILITY_ALERT",
            project: project.name,
            level: report.level,
            details: report.tasks,
          });
        }
      }
    },
    60 * 60 * 1000,
  ); // 1 小时
}
```

---

## 效果对比

### 使用前（Activity-Based）

```
周一：Agent A 开始任务
周二：汇报"正在进行"
周三：汇报"正在进行"
周四：汇报"快完成了"
周五：汇报"遇到一些问题"
→ 一周过去，实际进展：0%
```

### 使用后（Outcome-Based）

```
周一：Agent A 开始任务
     → 系统要求：请定义明确的完成标准和交付物

周二：汇报"完成需求分析文档（3 页），已提交到 docs/requirements.md"
     → 系统验证：✅ 有具体交付物，通过

周三：汇报"完成核心算法实现（代码 200 行），通过单元测试（5/5）"
     → 系统验证：✅ 有代码和测试证明，通过

周四：汇报"完成 API 接口开发，通过 Code Review"
     → 系统验证：✅ 有外部验证，通过

周五：汇报"任务完成，部署到测试环境，链接：xxx"
     → 系统验证：✅ 可访问验证，通过

→ 一周过去，实际进展：100% ✅
```

---

## 核心原则

> **Trust, but verify!** （信任，但要验证）

我们相信每个 Agent 都在努力工作，但**没有验证的信任就是放纵**。

通过建立透明的问责机制：

- ✅ 对认真工作的 Agent 更公平（成果被看见）
- ✅ 及时发现和纠正敷衍行为
- ✅ 提高整个团队的执行力
- ✅ 让人类主管真正放心

---

## 参考资料

- TechTarget: [7 best practices for leading and managing agentic teams](https://www.techtarget.com/searchEnterpriseAI/tip/Best-practices-for-leading-and-managing-agentic-teams)
- Electric Mind: [7 Best Practices for Building a Responsible AI Agent Governance Framework](https://www.electricmind.com/whats-on-our-mind/7-best-practices-for-building-a-responsible-ai-agent-governance-framework)
- TalkK.ai: [Agent Evaluation Metrics — From Intent to Outcome Success](https://talkk.ai/blogs/agent-evaluation-metrics-from-intent-to-outcome-success)
