# Phase 5 Gateway RPC API 规范

本文档定义了Phase 5 Web UI所需的所有Gateway RPC方法。这些API用于支持智能助手管理、组织架构和权限管理功能。

## API概述

Phase 5共需要实现**8个RPC方法**，分为4个功能模块：

1. **Model Accounts API** - 模型账号配置管理
2. **Channel Policies API** - 通道策略配置管理
3. **Organization API** - 组织架构数据管理
4. **Permissions & Approvals API** - 权限和审批管理

---

## 1. Model Accounts API

### 1.1 获取模型账号配置

**方法名：** `agent.modelAccounts.get`

**描述：** 获取指定智能助手的模型账号配置

**请求参数：**

```typescript
{
  agentId: string; // 智能助手ID
}
```

**响应数据：**

```typescript
{
  accounts: string[];                    // 可用的模型账号ID列表
  routingMode: "manual" | "smart";       // 路由模式
  smartRouting?: {                       // 智能路由配置（仅routingMode=smart时）
    enableCostOptimization?: boolean;    // 是否启用成本优化
    complexityWeight?: number;           // 复杂度权重 (0-1)
    capabilityWeight?: number;           // 能力匹配权重 (0-1)
    costWeight?: number;                 // 成本权重 (0-1)
    speedWeight?: number;                // 速度权重 (0-1)
    complexityThresholds?: {             // 复杂度阈值
      simple: number;                    // 简单问题阈值
      medium: number;                    // 中等问题阈值
      complex: number;                   // 复杂问题阈值
    };
  };
  defaultAccountId?: string;             // 默认账号ID
  enableSessionPinning?: boolean;        // 是否启用会话固定
}
```

**错误响应：**

- `404 Not Found` - 智能助手不存在
- `403 Forbidden` - 无权限访问该智能助手的配置
- `500 Internal Server Error` - 服务器内部错误

**实现位置：** `src/gateway/server.ts` 或新建 `src/gateway/rpc/agent-config.ts`

---

### 1.2 更新模型账号配置

**方法名：** `agent.modelAccounts.update`

**描述：** 更新指定智能助手的模型账号配置

**请求参数：**

```typescript
{
  agentId: string;                       // 智能助手ID
  config: {                              // 新的配置（同get响应结构）
    accounts: string[];
    routingMode: "manual" | "smart";
    smartRouting?: { /* ... */ };
    defaultAccountId?: string;
    enableSessionPinning?: boolean;
  };
}
```

**响应数据：**

```typescript
{
  success: true;
}
```

**错误响应：**

- `400 Bad Request` - 配置格式错误或账号ID无效
- `404 Not Found` - 智能助手不存在
- `403 Forbidden` - 无权限修改该智能助手的配置
- `500 Internal Server Error` - 保存失败

**实现位置：** `src/gateway/server.ts` 或 `src/gateway/rpc/agent-config.ts`

---

## 2. Channel Policies API

### 2.1 获取通道策略配置

**方法名：** `agent.channelPolicies.get`

**描述：** 获取指定智能助手的通道策略配置

**请求参数：**

```typescript
{
  agentId: string; // 智能助手ID
}
```

**响应数据：**

```typescript
{
  bindings: Array<{
    channelId: string; // 通道ID
    accountId?: string; // 绑定的账号ID
    policy: ChannelPolicy; // 策略类型
  }>;
  defaultPolicy: ChannelPolicy; // 默认策略
}

// ChannelPolicy类型定义
type ChannelPolicy =
  | "private" // 私密模式
  | "monitor" // 监听模式
  | "listen_only" // 只读模式
  | "filter" // 过滤模式
  | "scheduled" // 定时模式
  | "forward" // 转发模式
  | "smart_route" // 智能路由
  | "broadcast" // 广播模式
  | "round_robin" // 轮询模式
  | "queue" // 队列模式
  | "moderate" // 审核模式
  | "echo"; // 回显模式
```

**错误响应：**

- `404 Not Found` - 智能助手不存在
- `403 Forbidden` - 无权限访问
- `500 Internal Server Error` - 服务器错误

**实现位置：** `src/gateway/rpc/agent-config.ts`

---

### 2.2 更新通道策略配置

**方法名：** `agent.channelPolicies.update`

**描述：** 更新指定智能助手的通道策略配置

**请求参数：**

```typescript
{
  agentId: string;
  config: {
    bindings: Array<{
      channelId: string;
      accountId?: string;
      policy: ChannelPolicy;
    }>;
    defaultPolicy: ChannelPolicy;
  }
}
```

**响应数据：**

```typescript
{
  success: true;
}
```

**错误响应：**

- `400 Bad Request` - 配置格式错误或通道ID无效
- `404 Not Found` - 智能助手不存在
- `403 Forbidden` - 无权限修改
- `500 Internal Server Error` - 保存失败

**实现位置：** `src/gateway/rpc/agent-config.ts`

---

## 3. Organization API

### 3.1 获取组织架构数据

**方法名：** `organization.getAll`

**描述：** 获取完整的组织架构数据，包括组织、团队、智能助手及其关系

**请求参数：**

```typescript
{
} // 无参数
```

**响应数据：**

```typescript
{
  organizations: Array<{
    id: string;
    name: string;
    description?: string;
    parentId?: string; // 父组织ID
    level: number; // 组织层级
    createdAt: number; // 创建时间（毫秒时间戳）
    agentCount: number; // 智能助手数量
  }>;

  teams: Array<{
    id: string;
    name: string;
    organizationId: string; // 所属组织ID
    description?: string;
    leaderId?: string; // 团队负责人ID
    memberIds: string[]; // 成员ID列表
    createdAt: number;
  }>;

  agents: Array<{
    id: string;
    name: string;
    organizationId?: string; // 所属组织ID
    teamId?: string; // 所属团队ID
    role?: string; // 角色
    permissionLevel: number; // 权限级别
    identity?: {
      name?: string;
      emoji?: string;
      avatar?: string;
    };
  }>;

  relationships: Array<{
    sourceId: string; // 源智能助手ID
    targetId: string; // 目标智能助手ID
    type:
      | "reports_to" // 汇报关系
      | "supervises" // 监督关系
      | "collaborates_with" // 协作关系
      | "trains"; // 培训关系
  }>;

  statistics: {
    totalOrganizations: number;
    totalTeams: number;
    totalAgents: number;
    averageTeamSize: number;
    permissionDistribution: Record<string, number>; // 权限级别分布
  }
}
```

**错误响应：**

- `403 Forbidden` - 无权限访问组织架构数据
- `500 Internal Server Error` - 服务器错误

**实现位置：** 新建 `src/gateway/rpc/organization.ts`，集成Phase 4的组织系统

**注意事项：**

- 此API应调用Phase 4实现的组织系统（`src/organization/organization-system.ts`）
- 需要过滤当前用户无权访问的组织和智能助手
- 返回的数据应该是当前操作员可见的范围

---

## 4. Permissions & Approvals API

### 4.1 获取权限配置

**方法名：** `permissions.get`

**描述：** 获取权限配置，可选择性地指定智能助手

**请求参数：**

```typescript
{
  agentId?: string;  // 可选，智能助手ID。如果不提供，返回所有智能助手的权限
}
```

**响应数据：**

```typescript
{
  agentId?: string;                  // 如果请求指定了agentId，此处返回
  permissions: Array<{
    id: string;
    name: string;                    // 权限名称
    description: string;             // 权限描述
    category: string;                // 权限类别（如：file、network、tool等）
    granted: boolean;                // 是否已授予
    requiredLevel: number;           // 所需权限级别
    inheritedFrom?: string;          // 继承自哪个角色/组（如果有）
  }>;
  scope: string[];                   // 权限范围
  constraints: Array<{               // 约束条件
    id: string;
    type: "time"                     // 时间约束
        | "location"                 // 位置约束
        | "resource"                 // 资源约束
        | "operation";               // 操作约束
    description: string;
    active: boolean;
  }>;
}
```

**错误响应：**

- `404 Not Found` - 指定的智能助手不存在
- `403 Forbidden` - 无权限查看权限配置
- `500 Internal Server Error` - 服务器错误

**实现位置：** 新建 `src/gateway/rpc/permissions.ts`，集成Phase 3的权限系统

---

### 4.2 更新权限配置

**方法名：** `permissions.update`

**描述：** 更新单个权限的授予状态

**请求参数：**

```typescript
{
  agentId: string; // 智能助手ID
  permission: string; // 权限ID或名称
  granted: boolean; // 是否授予
}
```

**响应数据：**

```typescript
{
  success: true;
}
```

**错误响应：**

- `400 Bad Request` - 权限ID无效
- `404 Not Found` - 智能助手不存在
- `403 Forbidden` - 无权限修改权限配置（需要超级管理员权限）
- `409 Conflict` - 权限修改需要审批，已自动创建审批请求
- `500 Internal Server Error` - 保存失败

**特殊行为：**

- 如果修改的权限需要人类超级管理员审批，应返回`409 Conflict`，并自动创建审批请求
- 审批请求的ID应在响应中返回：`{ success: false, requiresApproval: true, requestId: string }`

**实现位置：** `src/gateway/rpc/permissions.ts`，调用 `src/permissions/checker.ts`

---

### 4.3 获取审批请求列表

**方法名：** `approvals.list`

**描述：** 获取所有待审批和历史审批请求

**请求参数：**

```typescript
{
  status?: "pending"                 // 可选，筛选状态
         | "approved"
         | "denied"
         | "timeout"
         | "cancelled";
  limit?: number;                    // 可选，返回数量限制（默认100）
  offset?: number;                   // 可选，分页偏移量
}
```

**响应数据：**

```typescript
{
  requests: Array<{
    id: string;
    type: string; // 请求类型（如：permission_change）
    requesterId: string; // 请求者ID
    requesterName: string; // 请求者名称
    requesterType: "agent" | "human"; // 请求者类型
    targetId: string; // 目标智能助手ID
    targetName?: string; // 目标智能助手名称
    reason: string; // 请求原因
    status:
      | "pending" // 状态
      | "approved"
      | "denied"
      | "timeout"
      | "cancelled";
    createdAt: number; // 创建时间（毫秒时间戳）
    expiresAt: number; // 过期时间
    respondedAt?: number; // 响应时间
    approver?: {
      // 审批者信息
      id: string;
      name: string;
      decision: "approve" | "deny";
      comment?: string;
    };
  }>;
  total: number; // 总数
}
```

**错误响应：**

- `403 Forbidden` - 无权限查看审批请求
- `500 Internal Server Error` - 服务器错误

**实现位置：** `src/gateway/rpc/approvals.ts`，调用 `src/permissions/approval.ts`

---

### 4.4 处理审批请求

**方法名：** `approvals.respond`

**描述：** 批准或拒绝审批请求

**请求参数：**

```typescript
{
  requestId: string;                 // 审批请求ID
  action: "approve" | "deny";        // 操作：批准或拒绝
  comment?: string;                  // 可选，审批意见
}
```

**响应数据：**

```typescript
{
  success: true;
}
```

**错误响应：**

- `400 Bad Request` - 请求ID无效或action无效
- `404 Not Found` - 审批请求不存在
- `403 Forbidden` - 无权限审批（需要人类超级管理员权限）
- `409 Conflict` - 审批请求已被处理或已过期
- `500 Internal Server Error` - 处理失败

**实现位置：** `src/gateway/rpc/approvals.ts`

---

### 4.5 获取权限变更历史

**方法名：** `permissions.history`

**描述：** 获取权限变更历史记录

**请求参数：**

```typescript
{
  agentId?: string;                  // 可选，筛选指定智能助手的历史
  limit?: number;                    // 可选，返回数量限制（默认100）
  offset?: number;                   // 可选，分页偏移量
}
```

**响应数据：**

```typescript
{
  history: Array<{
    id: string;
    agentId: string; // 智能助手ID
    agentName: string; // 智能助手名称
    permission: string; // 权限名称
    action:
      | "grant" // 操作类型
      | "revoke"
      | "modify";
    oldValue?: any; // 旧值（如果是modify）
    newValue?: any; // 新值
    changedBy: string; // 修改者ID
    changedByName: string; // 修改者名称
    timestamp: number; // 修改时间（毫秒时间戳）
    reason?: string; // 修改原因
  }>;
  total: number; // 总数
}
```

**错误响应：**

- `403 Forbidden` - 无权限查看历史记录
- `500 Internal Server Error` - 服务器错误

**实现位置：** `src/gateway/rpc/permissions.ts`

---

## 实现建议

### 1. 文件组织

建议在 `src/gateway/rpc/` 目录下创建以下文件：

```
src/gateway/rpc/
├── agent-config.ts       # Model Accounts & Channel Policies API
├── organization.ts       # Organization API
├── permissions.ts        # Permissions API
└── approvals.ts          # Approvals API
```

### 2. 权限检查

所有API都应该进行权限检查：

- 使用 `src/permissions/checker.ts` 中的 `PermissionChecker`
- 检查当前操作员（operator）的权限级别
- 对于敏感操作，要求 `operator.admin` 权限

### 3. 数据持久化

配置数据应该持久化到：

- **模型账号配置**：存储在智能助手配置文件中（`agents.list[].modelAccounts`）
- **通道策略配置**：存储在智能助手配置文件中（`agents.list[].channelPolicies`）
- **组织架构数据**：使用Phase 4的组织系统
- **权限配置**：使用Phase 3的权限系统

### 4. 集成现有系统

- **Model Accounts**：集成 Phase 1 的智能路由引擎（`src/agents/model-routing.ts`）
- **Channel Policies**：集成 Phase 2 的通道策略系统（`src/channels/policies/`）
- **Organization**：集成 Phase 4 的组织系统（`src/organization/`）
- **Permissions**：集成 Phase 3 的权限系统（`src/permissions/`）

### 5. 错误处理

所有API应该返回统一的错误格式：

```typescript
{
  error: {
    code: string;           // 错误代码（如：NOT_FOUND）
    message: string;        // 错误消息
    details?: any;          // 错误详情
  }
}
```

### 6. 日志记录

所有配置修改操作都应该记录日志：

- 使用 OpenClaw 的日志系统
- 记录操作者、操作时间、修改内容
- 用于审计和故障排查

---

## 测试建议

1. **单元测试**：为每个RPC方法编写单元测试
2. **集成测试**：测试API与前端的集成
3. **权限测试**：测试不同权限级别的访问控制
4. **错误处理测试**：测试各种错误场景

---

## 开发优先级

建议按以下顺序实现：

1. **优先级1（核心功能）**：
   - `agent.modelAccounts.get/update`
   - `permissions.get/update`

2. **优先级2（管理功能）**：
   - `agent.channelPolicies.get/update`
   - `approvals.list/respond`

3. **优先级3（高级功能）**：
   - `organization.getAll`
   - `permissions.history`

---

## 更新日志

- **2026-02-08**：初始版本，定义了8个RPC方法的完整规范
