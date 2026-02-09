# Phase 1 智能模型路由系统 - 集成使用指南

本指南详细说明如何将 Phase 1 智能模型路由系统集成到 OpenClaw 项目中。

## 目录

1. [核心概念](#核心概念)
2. [应用启动集成](#应用启动集成)
3. [模型选择集成](#模型选择集成)
4. [集成方式](#集成方式)
5. [配置示例](#配置示例)
6. [故障排除](#故障排除)
7. [最佳实践](#最佳实践)

---

## 1. 核心概念

### 1.1 智能模型路由是什么？

智能模型路由系统允许一个智能助手配置多个模型账号，系统会根据问题复杂度、模型能力、调用成本等因素，自动选择最优的模型账号来处理请求。

### 1.2 核心组件

| 组件     | 文件                                      | 职责                                     |
| -------- | ----------------------------------------- | ---------------------------------------- |
| 路由引擎 | `src/agents/model-routing.ts`             | 评估复杂度、能力匹配、成本计算、综合打分 |
| 集成器   | `src/agents/model-routing-integration.ts` | 提供便捷的集成接口（函数、中间件、实例） |
| 配置验证 | `src/config/phase-integration.ts`         | 验证 modelAccounts 配置                  |
| 配置解析 | `src/agents/agent-scope.ts`               | 解析配置中的 modelAccounts 字段          |
| 模型选择 | `src/agents/model-selection.ts`           | 已集成路由引擎到模型选择流程             |

### 1.3 关键术语

- **modelAccounts**：智能助手的模型账号列表配置（新配置字段）
- **routingMode**：路由模式（`manual` 手动 或 `smart` 智能）
- **defaultAccount**：手动模式下的默认账号
- **scoringWeights**：智能模式下的评分权重
- **Session Pinning**：会话级别账号固定（避免频繁切换）
- **Failover**：故障转移机制

---

## 2. 应用启动集成

### 2.1 自动初始化（推荐）

在应用启动时，调用 `initializePhaseIntegration()` 会自动：

1. 初始化全局模型路由集成器
2. 验证所有智能助手的 `modelAccounts` 配置
3. 打印详细的初始化日志

```typescript
import { initializeAfterConfigLoad } from "./config/phase-integration.js";
import { loadConfig } from "./config/config.js";

// 加载配置
const config = await loadConfig();

// 初始化 Phase 1/2/3 系统
initializeAfterConfigLoad(config);
```

**日志输出示例：**

```
[Phase Integration] Initializing Phase 1/2/3 systems...
[Phase Integration] Model routing integrator initialized
[Phase Integration] Agent code-assistant: model accounts validated
[Phase Integration] Agent general-helper: model accounts validated
[Phase Integration] Phase 1/2/3 systems initialized successfully
```

### 2.2 配置验证

`initializePhaseIntegration()` 会自动验证：

- ✅ `accounts` 是否为非空数组
- ✅ 账号ID是否唯一（无重复）
- ✅ `routingMode` 是否为 `manual` 或 `smart`
- ✅ 手动模式下 `defaultAccount` 是否存在且在 `accounts` 列表中
- ✅ 智能模式下 `scoringWeights` 权重总和是否为 1.0

**错误示例：**

```
[Phase Integration] Initialization failed: [
  "Agent code-assistant: modelAccounts: duplicate account IDs: gpt4-account-2",
  "Agent general-helper: modelAccounts: scoring weights must sum to 1.0, got 0.85"
]
```

---

## 3. 模型选择集成

### 3.1 已集成的入口（无需修改）

`src/agents/model-selection.ts` 中的 `resolveModelAccountForSession()` 函数已经集成了智能路由引擎。

**工作流程：**

1. 检查智能助手是否配置了 `modelAccounts`
2. 如果有配置，调用智能路由引擎
3. 如果没有配置，回退到传统的 `model` 配置

```typescript
// 在 model-selection.ts 中（已实现）
export async function resolveModelAccountForSession(params: {
  cfg: OpenClawConfig;
  agentId: string;
  message: string;
  sessionContext: SessionContext;
  catalog: ModelCatalogEntry[];
}): Promise<{
  accountId: string;
  modelRef: ModelRef;
  reason: string;
} | null> {
  // 1. 检查 modelAccounts 配置
  const modelAccountsConfig = resolveAgentModelAccounts(params.cfg, params.agentId);

  if (!modelAccountsConfig) {
    // 未配置智能路由，回退到传统模式
    return null;
  }

  // 2. 调用智能路由引擎
  const routingResult = await routeToOptimalModelAccount(
    params.message,
    params.sessionContext,
    modelAccountsConfig,
    modelInfoGetter,
  );

  return {
    accountId: routingResult.accountId,
    modelRef,
    reason: routingResult.reason,
  };
}
```

---

## 4. 集成方式

### 4.1 方式一：函数调用（最简单）

适用于简单场景，无需管理实例。

```typescript
import { selectModelAccount } from "./agents/model-routing-integration.js";
import { loadConfig } from "./config/config.js";

const config = await loadConfig();

const result = await selectModelAccount({
  config,
  agentId: "code-assistant",
  sessionId: "session-123",
  message: "帮我写一个排序算法",
  context: { history: [], tools: [] },
  modelInfoGetter: async (accountId) => {
    // 从配置中获取模型信息
    const profile = config.auth.profiles?.find((p) => p.id === accountId);
    return profile
      ? {
          contextWindow: profile.contextWindow || 100000,
          supportsTools: profile.supportsTools ?? true,
          supportsVision: profile.supportsVision ?? false,
          reasoning: profile.reasoning ?? false,
          inputPricePerMToken: profile.inputPricePerMToken || 0,
          outputPricePerMToken: profile.outputPricePerMToken || 0,
        }
      : undefined;
  },
});

if (result) {
  console.log(`Selected account: ${result.accountId}`);
  console.log(`Reason: ${result.reason}`);
}
```

### 4.2 方式二：中间件（推荐用于 Koa/Express）

适用于 Web 应用，自动在中间件链中处理路由。

```typescript
import Koa from "koa";
import { createModelRoutingMiddleware } from "./agents/model-routing-integration.js";
import { loadConfig } from "./config/config.js";

const config = await loadConfig();
const app = new Koa();

// 添加模型路由中间件
app.use(createModelRoutingMiddleware(config, modelInfoGetter));

// 在后续中间件中使用路由结果
app.use(async (ctx, next) => {
  const routingResult = ctx.state.routingResult;

  if (routingResult) {
    console.log(`Using account: ${routingResult.accountId}`);
    // 使用选中的账号执行模型调用
  }

  await next();
});
```

### 4.3 方式三：全局实例（推荐用于大型应用）

适用于需要管理会话固定、故障转移等高级功能的场景。

```typescript
import { modelRoutingIntegrator } from "./agents/model-routing-integration.js";
import { loadConfig } from "./config/config.js";

// 应用启动时初始化（只需一次）
const config = await loadConfig();
modelRoutingIntegrator.initialize(config);

// 在业务代码中使用
const integrator = modelRoutingIntegrator.getInstance();

const result = await integrator.selectModelAccount({
  agentId: "code-assistant",
  sessionId: "session-123",
  message: "帮我优化这段代码",
  context: { history: [], tools: [] },
  modelInfoGetter,
});

console.log(`Selected: ${result.accountId}`);
console.log(`Session pinned: ${integrator.getSessionPinnedAccount("session-123")}`);
```

### 4.4 方式四：实例化（最灵活）

适用于需要完全控制的场景。

```typescript
import { ModelRoutingIntegrator } from "./agents/model-routing-integration.js";
import { loadConfig } from "./config/config.js";

const config = await loadConfig();
const integrator = new ModelRoutingIntegrator(config);

// 选择模型账号
const result = await integrator.selectModelAccount({
  agentId: "code-assistant",
  sessionId: "session-456",
  message: "帮我实现一个二叉树遍历",
  context: { history: [], tools: [] },
  modelInfoGetter,
});

// 处理失败（故障转移）
if (callFailed) {
  const nextAccountId = await integrator.handleAccountFailure({
    agentId: "code-assistant",
    sessionId: "session-456",
    failedAccountId: result.accountId,
    reason: "API rate limit exceeded",
    lastRoutingResult: result,
  });

  if (nextAccountId) {
    console.log(`Failover to: ${nextAccountId}`);
  }
}

// 重置会话固定（强制重新路由）
integrator.resetSessionPinning("session-456");

// 查看失败次数
const failCount = integrator.getAccountFailureCount(result.accountId);
console.log(`Account ${result.accountId} failed ${failCount} times`);
```

---

## 5. 配置示例

### 5.1 基础配置（手动模式）

```json5
{
  agents: {
    list: [
      {
        id: "simple-bot",
        modelAccounts: {
          accounts: ["gpt4-account-1", "claude-account-1"],
          routingMode: "manual",
          defaultAccount: "gpt4-account-1",
        },
      },
    ],
  },
}
```

### 5.2 智能路由配置

```json5
{
  agents: {
    list: [
      {
        id: "code-assistant",
        modelAccounts: {
          accounts: [
            "gpt4-account-1", // GPT-4 Turbo
            "gpt4-account-2", // GPT-4 O
            "claude-account-1", // Claude 3.5 Sonnet
            "deepseek-account-1", // DeepSeek V3
          ],
          routingMode: "smart",
          scoringWeights: {
            complexity: 0.3, // 30% 权重给复杂度匹配
            capability: 0.4, // 40% 权重给能力匹配
            cost: 0.2, // 20% 权重给成本优化
            speed: 0.1, // 10% 权重给响应速度
          },
        },
      },
    ],
  },
  auth: {
    profiles: [
      {
        id: "gpt4-account-1",
        provider: "openai",
        model: "gpt-4-turbo-2024-04-09",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        inputPricePerMToken: 10.0,
        outputPricePerMToken: 30.0,
      },
      {
        id: "deepseek-account-1",
        provider: "deepseek",
        model: "deepseek-chat",
        contextWindow: 64000,
        supportsTools: true,
        supportsVision: false,
        inputPricePerMToken: 0.14,
        outputPricePerMToken: 0.28,
      },
    ],
  },
}
```

### 5.3 复杂场景配置

```json5
{
  agents: {
    list: [
      {
        id: "adaptive-bot",
        modelAccounts: {
          accounts: [
            "gpt4o-mini", // 低成本模型（简单问题）
            "gpt4-turbo", // 中等模型（一般问题）
            "claude-opus", // 高级模型（复杂问题）
            "o1-preview", // 推理模型（逻辑推理）
          ],
          routingMode: "smart",
          scoringWeights: {
            complexity: 0.35, // 优先匹配复杂度
            capability: 0.45, // 其次匹配能力
            cost: 0.15, // 成本控制
            speed: 0.05, // 速度次要
          },
        },
      },
    ],
  },
}
```

---

## 6. 故障排除

### 6.1 常见错误

#### 错误1：`modelAccounts: 'accounts' must be a non-empty array`

**原因：** `accounts` 字段为空或不是数组。

**解决：**

```json5
// ❌ 错误
{
  "modelAccounts": {
    "accounts": []  // 空数组
  }
}

// ✅ 正确
{
  "modelAccounts": {
    "accounts": ["gpt4-account-1", "claude-account-1"]
  }
}
```

#### 错误2：`modelAccounts: duplicate account IDs: gpt4-account-1`

**原因：** `accounts` 列表中存在重复的账号ID。

**解决：**

```json5
// ❌ 错误
{
  "accounts": ["gpt4-account-1", "gpt4-account-1", "claude-account-1"]
}

// ✅ 正确
{
  "accounts": ["gpt4-account-1", "gpt4-account-2", "claude-account-1"]
}
```

#### 错误3：`modelAccounts: scoring weights must sum to 1.0, got 0.85`

**原因：** `scoringWeights` 的4个权重总和不等于 1.0。

**解决：**

```json5
// ❌ 错误
{
  "scoringWeights": {
    "complexity": 0.3,
    "capability": 0.4,
    "cost": 0.1,
    "speed": 0.05  // 总和 = 0.85
  }
}

// ✅ 正确
{
  "scoringWeights": {
    "complexity": 0.3,
    "capability": 0.4,
    "cost": 0.2,
    "speed": 0.1  // 总和 = 1.0
  }
}
```

### 6.2 调试技巧

#### 1. 启用详细日志

```typescript
// 查看初始化日志
const result = initializePhaseIntegration(config);
console.log(result);
// {
//   success: true,
//   errors: [],
//   warnings: []
// }
```

#### 2. 诊断路由决策

```typescript
const integrator = modelRoutingIntegrator.getInstance();

const diagnosis = await integrator.diagnoseRouting({
  agentId: "code-assistant",
  message: "帮我优化这段代码",
  context: { history: [], tools: [] },
  modelInfoGetter,
});

console.log("配置:", diagnosis.config);
console.log("可用账号:", diagnosis.availableAccounts);
console.log("路由结果:", diagnosis.routingResult);
console.log("详细评分:", diagnosis.detailedScores);
```

#### 3. 检查会话固定

```typescript
const integrator = modelRoutingIntegrator.getInstance();

// 查看会话是否已固定到某个账号
const pinnedAccount = integrator.getSessionPinnedAccount("session-123");
if (pinnedAccount) {
  console.log(`Session 123 pinned to ${pinnedAccount}`);
}

// 如果需要强制重新路由
integrator.resetSessionPinning("session-123");
```

---

## 7. 最佳实践

### 7.1 路由模式选择

| 场景                 | 推荐模式 | 原因             |
| -------------------- | -------- | ---------------- |
| 生产环境（成本敏感） | `smart`  | 自动优化成本     |
| 生产环境（性能优先） | `smart`  | 自动选择最快模型 |
| 测试环境             | `manual` | 固定模型便于测试 |
| 开发环境             | `manual` | 避免意外切换     |

### 7.2 评分权重调优

#### 场景1：成本敏感型应用

```json5
{
  scoringWeights: {
    complexity: 0.2,
    capability: 0.3,
    cost: 0.4, // 成本权重最高
    speed: 0.1,
  },
}
```

#### 场景2：性能优先型应用

```json5
{
  scoringWeights: {
    complexity: 0.2,
    capability: 0.4,
    cost: 0.1,
    speed: 0.3, // 速度权重较高
  },
}
```

#### 场景3：能力优先型应用（编程助手）

```json5
{
  scoringWeights: {
    complexity: 0.3,
    capability: 0.5, // 能力权重最高
    cost: 0.1,
    speed: 0.1,
  },
}
```

### 7.3 账号配置策略

#### 策略1：能力分层

```json5
{
  accounts: [
    "gpt4o-mini", // Tier 1: 简单问题（成本$0.15/1M input）
    "gpt4-turbo", // Tier 2: 一般问题（成本$10/1M input）
    "claude-opus", // Tier 3: 复杂问题（成本$15/1M input）
    "o1-preview", // Tier 4: 推理问题（成本$15/1M input）
  ],
}
```

#### 策略2：区域分布

```json5
{
  accounts: [
    "gpt4-us-east", // 北美用户
    "gpt4-eu-west", // 欧洲用户
    "gpt4-asia-east", // 亚洲用户
  ],
}
```

### 7.4 故障转移策略

```typescript
// 自动重试 + 故障转移
async function callModelWithFailover(
  integrator: ModelRoutingIntegrator,
  params: any,
  maxRetries = 3,
): Promise<any> {
  let result = await integrator.selectModelAccount(params);

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 尝试调用模型
      const response = await callModel(result.accountId, params.message);
      return response;
    } catch (err) {
      console.error(`Account ${result.accountId} failed:`, err);

      // 故障转移
      const nextAccountId = await integrator.handleAccountFailure({
        agentId: params.agentId,
        sessionId: params.sessionId,
        failedAccountId: result.accountId,
        reason: err.message,
        lastRoutingResult: result,
      });

      if (!nextAccountId) {
        throw new Error("No available account for failover");
      }

      // 更新 result 为新账号
      result = { ...result, accountId: nextAccountId };
    }
  }

  throw new Error("All retries exhausted");
}
```

### 7.5 监控指标

建议监控以下指标：

1. **账号使用分布**：各账号被选中的次数
2. **平均路由耗时**：选择模型账号的时间
3. **故障转移次数**：每个账号的失败次数
4. **成本统计**：每个账号的总成本
5. **会话固定率**：被固定的会话占比

```typescript
// 示例监控代码
const integrator = modelRoutingIntegrator.getInstance();

setInterval(() => {
  const accounts = ["gpt4-account-1", "claude-account-1", "deepseek-account-1"];

  accounts.forEach((accountId) => {
    const failCount = integrator.getAccountFailureCount(accountId);
    console.log(`[Monitor] ${accountId}: ${failCount} failures`);
  });
}, 60000); // 每分钟检查一次
```

---

## 总结

Phase 1 智能模型路由系统提供了灵活、强大的模型账号管理能力：

✅ **自动初始化**：应用启动时自动验证和初始化  
✅ **多种集成方式**：函数调用、中间件、全局实例、实例化  
✅ **智能路由**：根据复杂度、能力、成本、速度综合评分  
✅ **会话固定**：避免频繁切换模型账号  
✅ **故障转移**：自动切换到备用账号  
✅ **向后兼容**：未配置 `modelAccounts` 时回退到传统模式

**推荐集成方式：**

- 小型项目：使用 **方式一（函数调用）**
- Web 应用：使用 **方式二（中间件）**
- 大型应用：使用 **方式三（全局实例）**

**配置建议：**

- 开发/测试环境：使用 `manual` 模式
- 生产环境：使用 `smart` 模式，根据业务需求调整 `scoringWeights`

如有问题，请参考 [故障排除](#故障排除) 章节或查看源码注释。
