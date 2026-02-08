# Phase 2 & 3 集成指南

本文档说明如何在 OpenClaw 应用中使用 Phase 2（通道绑定与策略）和 Phase 3（权限管理）的集成代码。

## 概述

Phase 2 和 Phase 3 提供了以下功能：

- **Phase 2**: 通道账号绑定与策略系统
- **Phase 3**: 细粒度的工具权限管理和审批工作流

## 应用启动集成

### 1. 配置验证和初始化

在应用启动时，使用配置集成模块验证配置并初始化权限系统：

```typescript
import { loadConfig } from "./config/config.js";
import { initializeAfterConfigLoad } from "./config/phase-integration.js";

// 加载配置
const config = await loadConfig();

// 初始化 Phase 2 & 3 系统
initializeAfterConfigLoad(config);
```

`initializeAfterConfigLoad` 会自动：

- 验证通道绑定配置（检查ID唯一性、必填字段）
- 验证权限配置（检查ID唯一性、规则有效性）
- 初始化权限系统（为每个智能助手创建权限检查器）
- 输出初始化日志和警告

### 2. 消息处理流程集成（Phase 2）

#### 使用策略集成器

```typescript
import { PolicyIntegrator } from "./channels/policy-integration.js";
import type { ChannelAccountBinding } from "./config/types.channel-bindings.js";

const policyIntegrator = new PolicyIntegrator();

// 在消息接收前检查入站策略
async function handleInboundMessage(binding: ChannelAccountBinding, message: any) {
  const result = await policyIntegrator.checkInboundPolicy(binding, message, {});

  if (!result.allow) {
    console.log(`Message blocked by policy: ${result.reason}`);

    // 发送自动回复（如果配置了）
    if (result.autoReply) {
      await policyIntegrator.sendAutoReply(binding, message, result.autoReply);
    }

    // 处理策略路由（如果需要）
    if (result.route) {
      await policyIntegrator.handlePolicyRoute(binding, message, result.route);
    }

    return;
  }

  // 继续处理消息
  await processMessage(message);
}

// 在消息发送前检查出站策略
async function handleOutboundMessage(binding: ChannelAccountBinding, message: any) {
  const result = await policyIntegrator.checkOutboundPolicy(binding, message, {});

  if (!result.allow) {
    console.log(`Outbound message blocked: ${result.reason}`);
    return;
  }

  // 发送消息
  await sendMessage(message);
}
```

#### 使用中间件模式

```typescript
import { createPolicyMiddleware } from "./channels/policy-integration.js";

const policyMiddleware = createPolicyMiddleware();

// 在消息处理管道中使用
async function messageHandler(ctx: any, next: () => Promise<void>) {
  await policyMiddleware(ctx, next);
}
```

#### 使用便捷函数

```typescript
import { checkMessagePolicy } from "./channels/policy-integration.js";

// 简单的策略检查
const result = await checkMessagePolicy(binding, message, "inbound", { timestamp: Date.now() });
```

### 3. 工具执行流程集成（Phase 3）

#### 使用权限集成器

```typescript
import { permissionIntegrator } from "./permissions/integration.js";

// 在工具执行前检查权限
async function executeTool(agentId: string, toolName: string, parameters: any) {
  const result = await permissionIntegrator.checkToolPermission({
    subject: {
      type: "agent",
      id: agentId,
    },
    resource: {
      type: "tool",
      id: toolName,
    },
    action: "execute",
    context: {
      parameters,
      timestamp: Date.now(),
    },
  });

  if (!result.allowed) {
    console.log(`Tool execution blocked: ${result.reason}`);

    // 如果需要审批
    if (result.action === "request_approval") {
      const approvalId = await permissionIntegrator.createApprovalRequest({
        requesterId: agentId,
        toolName,
        parameters,
        reason: "Tool requires approval",
      });

      console.log(`Approval request created: ${approvalId}`);
      return { status: "pending_approval", approvalId };
    }

    return { status: "denied", reason: result.reason };
  }

  // 执行工具
  return await executeToolInternal(toolName, parameters);
}
```

#### 使用便捷函数

```typescript
import { checkToolPermission } from "./permissions/integration.js";

// 简单的权限检查
const result = await checkToolPermission("agent-1", "file_write", { path: "/data/file.txt" });

if (result.allowed) {
  // 执行工具
}
```

#### 使用装饰器模式

```typescript
import { requirePermission } from "./permissions/integration.js";

class ToolExecutor {
  @requirePermission("file_write")
  async writeFile(agentId: string, path: string, content: string) {
    // 装饰器会自动检查权限
    // 这里只需要实现实际的文件写入逻辑
    await fs.writeFile(path, content);
  }

  @requirePermission("file_read")
  async readFile(agentId: string, path: string) {
    return await fs.readFile(path, "utf-8");
  }
}
```

#### 使用中间件模式

```typescript
import { createPermissionMiddleware } from "./permissions/integration.js";

const permissionMiddleware = createPermissionMiddleware();

// 在工具执行管道中使用
async function toolHandler(ctx: any, next: () => Promise<void>) {
  await permissionMiddleware(ctx, next);
}
```

### 4. 审批工作流

```typescript
import { permissionIntegrator } from "./permissions/integration.js";

// 创建审批请求
const approvalId = await permissionIntegrator.createApprovalRequest({
  requesterId: "agent-1",
  toolName: "file_delete",
  parameters: { path: "/important/file.txt" },
  reason: "Deleting important file",
});

// 批准请求
await permissionIntegrator.approveRequest(approvalId, "admin-user");

// 或拒绝请求
await permissionIntegrator.rejectRequest(approvalId, "admin-user", "Too risky");

// 检查审批状态
const status = await permissionIntegrator.getApprovalStatus(approvalId);
```

### 5. 权限诊断和调试

```typescript
import { permissionIntegrator } from "./permissions/integration.js";

// 获取主体的有效权限
const permissions = permissionIntegrator.getEffectivePermissions({
  type: "agent",
  id: "agent-1",
});

console.log("Effective permissions:", permissions);

// 检测权限冲突
const conflicts = permissionIntegrator.detectConflicts({
  type: "agent",
  id: "agent-1",
});

if (conflicts.length > 0) {
  console.warn("Permission conflicts detected:", conflicts);
}

// 检测循环继承
const circular = permissionIntegrator.detectCircularInheritance();
if (circular.length > 0) {
  console.error("Circular inheritance detected:", circular);
}
```

## 配置示例

### Phase 2 配置示例

```json5
{
  agents: {
    list: [
      {
        id: "main-agent",
        channelBindings: {
          bindings: [
            {
              id: "wechat-main",
              channelId: "wechat",
              accountId: "bot-001",
              policy: {
                type: "private",
                config: {
                  allowedUsers: ["user-1", "user-2"],
                },
              },
            },
            {
              id: "discord-support",
              channelId: "discord",
              accountId: "support-bot",
              policy: {
                type: "moderate",
                config: {
                  keywords: ["spam", "abuse"],
                  action: "block",
                },
              },
            },
          ],
        },
      },
    ],
  },
}
```

### Phase 3 配置示例

```json5
{
  agents: {
    list: [
      {
        id: "main-agent",
        permissions: {
          rules: [
            {
              id: "allow-basic-tools",
              subject: { type: "role", id: "basic-user" },
              resource: { type: "tool", id: "file_read" },
              action: "allow",
              effect: "allow",
              priority: 100,
            },
            {
              id: "require-approval-delete",
              subject: { type: "role", id: "basic-user" },
              resource: { type: "tool", id: "file_delete" },
              action: "execute",
              effect: "request_approval",
              priority: 200,
            },
          ],
          roles: [
            {
              id: "basic-user",
              name: "Basic User",
              inherits: [],
            },
            {
              id: "admin",
              name: "Administrator",
              inherits: ["basic-user"],
            },
          ],
          groups: [
            {
              id: "developers",
              name: "Developers",
              members: [
                { type: "agent", id: "dev-agent-1" },
                { type: "agent", id: "dev-agent-2" },
              ],
            },
          ],
          approval: {
            defaultApprovers: [{ type: "user", id: "admin-user" }],
            timeout: 3600000, // 1 hour
          },
        },
      },
    ],
  },
}
```

## 注册策略处理器

如果需要注册自定义策略处理器：

```typescript
import { PolicyRegistry } from "./channels/policies/registry.js";
import type { PolicyHandler } from "./channels/policies/types.js";

// 创建自定义策略处理器
const customPolicyHandler: PolicyHandler = {
  type: "custom",
  async handle(context, config) {
    // 实现自定义策略逻辑
    return {
      allow: true,
      reason: "Custom policy passed",
    };
  },
};

// 注册处理器
PolicyRegistry.register(customPolicyHandler);
```

## 日志输出

集成代码会输出详细的日志，便于调试：

```
[Phase Integration] Initializing Phase 2 & 3 systems...
[Phase Integration] Agent main-agent: channel bindings validated
[Phase Integration] Agent main-agent: permissions initialized
[Phase Integration] Phase 2 & 3 systems initialized successfully
```

策略和权限检查也会输出执行日志：

```
[Policy] Checking inbound policy for binding: wechat-main
[Policy] Policy result - allow: true
[Permission] Checking tool permission: agent-1 -> file_write
[Permission] Permission granted
```

## 错误处理

集成代码提供了完善的错误处理和降级策略：

- 如果策略系统未配置，默认允许所有消息通过
- 如果权限系统未配置，默认允许所有工具执行
- 配置验证失败会输出详细的错误信息，但不会阻止应用启动
- 权限检查失败会返回明确的拒绝原因

## 最佳实践

1. **在应用启动时初始化**：确保在处理任何消息或工具调用之前初始化 Phase 2 & 3 系统
2. **使用中间件模式**：推荐使用中间件模式集成到现有的消息/工具处理管道
3. **记录审批请求**：将审批请求存储到数据库，便于追踪和审计
4. **定期检测冲突**：在开发和测试环境中定期运行冲突检测和循环继承检测
5. **使用明确的权限规则**：避免过于复杂的权限继承关系
6. **提供友好的错误信息**：在拒绝请求时提供清晰的原因说明

## 故障排查

### 策略未生效

1. 检查绑定配置是否正确
2. 检查策略处理器是否已注册
3. 查看策略执行日志

### 权限检查失败

1. 检查权限配置是否正确
2. 确认权限系统已初始化
3. 使用 `getEffectivePermissions` 查看实际生效的权限
4. 使用 `detectConflicts` 检查权限冲突

### 配置验证错误

1. 检查 ID 是否重复
2. 确认必填字段都已提供
3. 查看详细的错误日志

## 进一步阅读

- [Phase 2 设计文档](./PHASE2-DESIGN.md)
- [Phase 3 设计文档](./PHASE3-DESIGN.md)
- [策略系统文档](./POLICY-SYSTEM.md)
- [权限系统文档](./PERMISSION-SYSTEM.md)
