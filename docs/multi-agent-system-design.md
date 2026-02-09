# Multi-Agent System Design Overview

本文档概述了多智能助手系统的三个核心功能设计。

## Phase 1: 智能模型账号路由 🤖

### 核心理念

为每个智能助手配置多个 LLM 账号，根据问题复杂度、模型能力、成本等因素智能选择最优账号。

### 关键特性

- **智能路由**: 根据复杂度评估自动选择合适的模型
- **成本优化**: 在满足能力要求的前提下优先选择低成本账号
- **故障转移**: 自动切换到备用账号，确保服务可用性
- **健康检查**: 定期检测账号状态

### 配置示例

```json
{
  "modelAccounts": {
    "accounts": [
      {
        "id": "openai-premium",
        "provider": "openai",
        "model": "gpt-4",
        "capabilities": ["text", "image", "code", "reasoning"],
        "costPerToken": 0.00003,
        "priority": 100
      }
    ],
    "routing": {
      "strategy": "capability-cost",
      "enableFailover": true
    }
  }
}
```

### 核心文件

- `src/config/types.model-accounts.ts` - 类型定义
- `src/agents/routing/model-routing.ts` - 路由引擎
- `src/agents/agent-scope.ts` - 配置解析
- `src/agents/model-catalog.ts` - 模型解析集成

---

## Phase 2: 通道账号绑定与策略 📡

### 核心理念

智能助手在不同通道（Telegram、微信、Slack等）使用不同的策略，实现灵活的多通道管理。

### 六种核心策略

#### 1. Private (私密通道)

只允许指定用户访问，其他用户自动拒绝。

```json
{
  "policy": {
    "type": "private",
    "config": {
      "allowedUsers": ["user_123", "user_456"],
      "unauthorizedReply": "此通道仅限授权用户使用。"
    }
  }
}
```

#### 2. Monitor (监控模式)

只读监控，记录消息但不回复。

```json
{
  "policy": {
    "type": "monitor",
    "config": {
      "monitorChannels": ["channel_123"],
      "enableLogging": true,
      "logPath": "./logs/monitor.jsonl"
    }
  }
}
```

#### 3. ListenOnly (只监听)

记录消息用于数据收集，不响应。

```json
{
  "policy": {
    "type": "listen-only",
    "config": {
      "enableLogging": true,
      "logPath": "./logs/listen.jsonl",
      "triggerEvents": true
    }
  }
}
```

#### 4. LoadBalance (负载均衡)

多个账号轮流处理消息，支持多种算法。

```json
{
  "policy": {
    "type": "load-balance",
    "config": {
      "accountIds": ["bot-1", "bot-2", "bot-3"],
      "algorithm": "least-load",
      "healthCheck": {
        "enabled": true,
        "interval": 60
      }
    }
  }
}
```

#### 5. Queue (队列模式)

消息排队，批量处理。

```json
{
  "policy": {
    "type": "queue",
    "config": {
      "maxQueueSize": 100,
      "batchInterval": 30,
      "batchSize": 10,
      "overflowAction": "drop-oldest"
    }
  }
}
```

#### 6. Moderate (审核模式)

消息需要审核后才发送。

```json
{
  "policy": {
    "type": "moderate",
    "config": {
      "moderators": ["admin_1", "admin_2"],
      "autoApproveRules": {
        "allowedSenders": ["trusted_user"],
        "maxLength": 100
      },
      "timeout": 3600,
      "defaultAction": "reject"
    }
  }
}
```

### 核心文件

- `src/config/types.channel-bindings.ts` - 类型定义
- `src/channels/policies/types.ts` - 策略接口
- `src/channels/policies/*.ts` - 各策略实现
- `src/channels/bindings/resolver.ts` - 绑定解析器

---

## Phase 3: 权限管理系统 🔐

### 核心理念

细粒度的工具权限管理，支持用户/组/角色，权限继承，审批工作流。

### 关键特性

#### 1. 多层级权限控制

- **用户**: 个体用户权限
- **组**: 用户组管理
- **角色**: 角色继承

#### 2. 工具级权限

支持通配符匹配：

- `*` - 所有工具
- `file.*` - 所有文件工具
- `code.execute` - 特定工具

#### 3. 三种权限动作

- `allow` - 允许执行
- `deny` - 拒绝执行
- `require_approval` - 需要审批

#### 4. 条件约束

```json
{
  "conditions": {
    "timeRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "ipWhitelist": ["192.168.1.0/24"],
    "parameterConstraints": {
      "path": "./allowed/**"
    }
  }
}
```

#### 5. 角色继承

```json
{
  "roles": [
    {
      "id": "admin",
      "name": "管理员",
      "permissions": ["rule_allow_all"]
    },
    {
      "id": "developer",
      "name": "开发者",
      "inheritsFrom": ["basic_user"],
      "permissions": ["rule_code_tools"]
    },
    {
      "id": "basic_user",
      "name": "基础用户",
      "permissions": ["rule_basic_tools"]
    }
  ]
}
```

#### 6. 权限委托

临时授权其他用户使用特定工具。

```json
{
  "delegations": [
    {
      "id": "delegation_1",
      "delegator": { "type": "user", "id": "admin" },
      "delegate": { "type": "user", "id": "temp_admin" },
      "tools": ["file.*", "code.*"],
      "expiresAt": 1735689600000
    }
  ]
}
```

#### 7. 审批工作流

```json
{
  "approvalConfig": {
    "approvers": [{ "type": "user", "id": "admin_1" }],
    "requiredApprovals": 1,
    "timeout": 3600,
    "timeoutAction": "reject",
    "notificationMethods": ["slack", "email"]
  }
}
```

#### 8. 审计日志

自动记录所有权限检查结果，用于安全审计。

### 核心文件

- `src/config/types.permissions.ts` - 类型定义
- `src/permissions/checker.ts` - 权限检查引擎
- `src/permissions/hierarchy.ts` - 层级管理
- `src/permissions/approval.ts` - 审批工作流

---

## 完整配置示例

参见 `examples/multi-agent-complete-config.json`

## 使用流程

### 1. 智能模型路由

```typescript
import { ModelRoutingEngine } from "./agents/routing/model-routing";

const engine = new ModelRoutingEngine(config.modelAccounts);
const account = engine.selectAccount({
  messageContent: "复杂的代码问题...",
  requiredCapabilities: ["code", "reasoning"],
});
```

### 2. 通道策略应用

```typescript
import { channelBindingResolver } from "./channels/bindings/resolver";

const binding = channelBindingResolver.resolveBinding(
  agentConfig.channelBindings,
  "telegram",
  "bot-1",
);

const result = await channelBindingResolver.applyPolicy({
  message,
  binding,
  agentId,
  agentConfig,
  channelId,
  accountId,
  gatewayContext,
});
```

### 3. 权限检查

```typescript
import { PermissionChecker } from "./permissions/checker";

const checker = new PermissionChecker(config.permissions);
const result = await checker.check({
  subject: { type: "user", id: "user_123" },
  toolName: "file.write",
  toolParams: { path: "./data.json" },
  sessionId,
  agentId,
});

if (result.requiresApproval) {
  // 创建审批请求
  const workflow = new ApprovalWorkflow(config.permissions);
  await workflow.createRequest(context, result.approvalId);
}
```

---

## 架构优势

### 1. 模块化设计

三个功能模块完全独立，可单独启用或禁用。

### 2. 扩展性

- 新增策略：实现 `PolicyHandler` 接口
- 新增路由策略：扩展 `ModelRoutingEngine`
- 自定义权限检查：实现条件约束

### 3. 性能优化

- 权限结果缓存
- 角色继承预计算
- 健康检查异步执行

### 4. 安全性

- 审计日志完整记录
- 权限检查细粒度
- 审批流程可追溯

---

## 未来扩展

### 待集成功能

- Gateway RPC 方法集成
- 单元测试和集成测试
- 实时监控和告警
- Web UI 管理界面

### 可能的增强

- 机器学习驱动的路由优化
- 自适应负载均衡
- 基于行为的权限动态调整
- 跨智能助手协作

---

## 总结

本设计实现了一个功能完整、架构清晰、易于扩展的多智能助手管理系统，涵盖了模型路由、通道策略、权限控制三大核心功能，为复杂场景下的智能助手应用提供了坚实的基础架构。
