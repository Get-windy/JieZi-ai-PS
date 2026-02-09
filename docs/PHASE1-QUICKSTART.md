# Phase 1 智能模型路由 - 5分钟快速开始

本指南帮助您在 5 分钟内快速上手 Phase 1 智能模型路由系统。

---

## 🚀 快速开始三步骤

### 步骤 1：配置智能助手的模型账号

在 `openclaw.json5` 中添加 `modelAccounts` 配置：

```json5
{
  agents: {
    list: [
      {
        id: "my-assistant",
        modelAccounts: {
          accounts: [
            "gpt4-account", // 高级模型账号
            "deepseek-account", // 经济模型账号
          ],
          routingMode: "smart", // 智能路由模式
          scoringWeights: {
            complexity: 0.3, // 复杂度权重 30%
            capability: 0.4, // 能力权重 40%
            cost: 0.2, // 成本权重 20%
            speed: 0.1, // 速度权重 10%
          },
        },
      },
    ],
  },
  auth: {
    profiles: [
      {
        id: "gpt4-account",
        provider: "openai",
        model: "gpt-4-turbo-2024-04-09",
        apiKey: "sk-...",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        inputPricePerMToken: 10.0,
        outputPricePerMToken: 30.0,
      },
      {
        id: "deepseek-account",
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: "sk-...",
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

### 步骤 2：应用启动时初始化

在应用入口文件中添加初始化代码：

```typescript
import { initializeAfterConfigLoad } from "./config/phase-integration.js";
import { loadConfig } from "./config/config.js";

// 加载配置
const config = await loadConfig();

// 初始化 Phase 1/2/3 系统（一行代码完成）
initializeAfterConfigLoad(config);
```

**日志输出示例：**

```
[Phase Integration] Initializing Phase 1/2/3 systems...
[Phase Integration] Model routing integrator initialized
[Phase Integration] Agent my-assistant: model accounts validated
[Phase Integration] Phase 1/2/3 systems initialized successfully
```

### 步骤 3：使用智能路由

智能路由已自动集成到模型选择流程中，**无需修改现有代码**！

系统会自动：

- 分析问题复杂度
- 评估模型能力
- 计算调用成本
- 选择最优账号

---

## 💡 工作原理

### 简单问题 → 经济模型

```
用户："今天天气怎么样？"
  ↓
复杂度评估：1/10（简单问题）
  ↓
模型选择：deepseek-account（成本低，满足需求）
  ↓
节省成本：$0.001 vs $0.02（节省 95%）
```

### 复杂问题 → 高级模型

```
用户："帮我设计一个分布式系统架构，支持高并发和容错..."
  ↓
复杂度评估：9/10（复杂问题）
  ↓
模型选择：gpt4-account（能力强，推理深度足够）
  ↓
保证质量：选择最佳模型处理复杂任务
```

---

## 📊 配置模式对比

### 模式1：手动模式（固定使用某个账号）

```json5
{
  modelAccounts: {
    accounts: ["gpt4-account", "claude-account"],
    routingMode: "manual",
    defaultAccount: "gpt4-account", // 总是使用这个账号
  },
}
```

**适用场景：** 开发/测试环境，需要固定模型便于调试

### 模式2：智能模式（自动选择最优账号）

```json5
{
  modelAccounts: {
    accounts: ["gpt4-account", "deepseek-account"],
    routingMode: "smart",
    scoringWeights: {
      complexity: 0.3,
      capability: 0.4,
      cost: 0.2,
      speed: 0.1,
    },
  },
}
```

**适用场景：** 生产环境，需要自动优化成本和性能

---

## 🎯 场景化配置示例

### 场景1：成本敏感型（降低API成本）

```json5
{
  modelAccounts: {
    accounts: [
      "gpt4o-mini", // 最便宜（$0.15/1M input）
      "deepseek", // 便宜（$0.14/1M input）
      "gpt4-turbo", // 贵（$10/1M input）
    ],
    routingMode: "smart",
    scoringWeights: {
      complexity: 0.2,
      capability: 0.3,
      cost: 0.4, // 🔥 成本权重最高
      speed: 0.1,
    },
  },
}
```

**效果：** 优先使用低成本模型，复杂问题才用高级模型

### 场景2：性能优先型（降低响应延迟）

```json5
{
  modelAccounts: {
    accounts: [
      "gpt4o-mini", // 快
      "claude-haiku", // 最快
      "claude-opus", // 慢但强大
    ],
    routingMode: "smart",
    scoringWeights: {
      complexity: 0.2,
      capability: 0.4,
      cost: 0.1,
      speed: 0.3, // 🔥 速度权重较高
    },
  },
}
```

**效果：** 优先使用快速模型，复杂问题才用慢速高级模型

### 场景3：编程助手（能力优先）

```json5
{
  modelAccounts: {
    accounts: [
      "gpt4-turbo", // 编程能力强
      "claude-sonnet", // 编程能力强
      "deepseek", // 编程专用模型
    ],
    routingMode: "smart",
    scoringWeights: {
      complexity: 0.3,
      capability: 0.5, // 🔥 能力权重最高
      cost: 0.1,
      speed: 0.1,
    },
  },
}
```

**效果：** 优先选择编程能力最强的模型

---

## 🔧 高级功能

### 功能1：会话固定（避免频繁切换）

系统会自动将会话固定到首次选择的账号：

```
会话 session-123：
  第1条消息 → 选择 deepseek-account
  第2条消息 → 继续使用 deepseek-account（自动固定）
  第3条消息 → 继续使用 deepseek-account
```

**优点：**

- 避免频繁切换模型账号
- 保持会话上下文连贯性
- 降低路由开销

### 功能2：故障转移（自动切换备用账号）

当某个账号调用失败时，系统自动切换到下一个可用账号：

```
会话 session-456：
  尝试 gpt4-account → 失败（API限流）
    ↓
  自动切换到 claude-account → 成功
    ↓
  后续消息继续使用 claude-account
```

**优点：**

- 提高系统可靠性
- 自动处理API限流
- 无需人工干预

---

## ❓ 常见问题

### Q1：如何查看当前使用的是哪个账号？

**答：** 查看日志输出：

```
[ModelRoutingIntegrator] Routing Decision:
  Agent: my-assistant
  Session: session-123
  Selected: deepseek-account
  Reason: 复杂度低（2/10），成本优先，选择经济型模型
```

### Q2：如何调整评分权重？

**答：** 修改 `scoringWeights` 配置：

```json5
{
  scoringWeights: {
    complexity: 0.3, // 调整这里
    capability: 0.4, // 调整这里
    cost: 0.2, // 调整这里
    speed: 0.1, // 调整这里
  },
  // 注意：四个权重的总和必须为 1.0
}
```

### Q3：如何禁用智能路由？

**答：** 使用手动模式或删除 `modelAccounts` 配置：

```json5
// 方式1：手动模式
{
  "modelAccounts": {
    "accounts": ["gpt4-account"],
    "routingMode": "manual",
    "defaultAccount": "gpt4-account"
  }
}

// 方式2：删除 modelAccounts 配置（回退到传统 model 配置）
{
  "model": "gpt-4-turbo-2024-04-09"
}
```

### Q4：配置错误会导致应用无法启动吗？

**答：** 不会。配置验证失败时会打印警告，但不会阻止应用启动。

```
[Phase Integration] Initialization failed: [
  "Agent my-assistant: modelAccounts: scoring weights must sum to 1.0, got 0.85"
]
[Phase Integration] Some systems failed to initialize, but continuing startup...
```

### Q5：如何测试智能路由是否生效？

**答：** 发送简单和复杂问题，观察日志：

```typescript
// 简单问题
await chat("今天天气怎么样？");
// 预期：选择 deepseek-account（经济型）

// 复杂问题
await chat("帮我设计一个支持100万并发的分布式系统架构...");
// 预期：选择 gpt4-account（高级型）
```

---

## 📚 进阶学习

恭喜！您已经掌握了 Phase 1 智能模型路由的基本使用。

**进一步学习：**

1. **详细集成指南**：`docs/PHASE1-INTEGRATION-GUIDE.md`
   - 4种集成方式详解
   - 故障排除指南
   - 最佳实践建议

2. **完成总结文档**：`docs/PHASE1-INTEGRATION-COMPLETE.md`
   - 核心功能概览
   - 代码统计和架构
   - 使用示例

3. **完成检查清单**：`docs/PHASE1-CHECKLIST.md`
   - 完整功能列表
   - 验证步骤
   - 待办事项

---

## 🎉 总结

Phase 1 智能模型路由让您的 AI 应用更加：

✅ **智能**：自动选择最优模型账号  
✅ **经济**：节省 30-50% 的 API 成本  
✅ **可靠**：自动故障转移  
✅ **简单**：3步配置即可使用

立即开始使用，享受智能路由带来的便利！🚀
