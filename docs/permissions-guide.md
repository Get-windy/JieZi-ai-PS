# 权限配置指南

本文档说明如何通过前端或CLI配置智能体的工具使用权限。

## 📋 目录

1. [概览](#概览)
2. [预定义角色](#预定义角色)
3. [工具类别](#工具类别)
4. [配置方式](#配置方式)
5. [常见场景](#常见场景)
6. [API调用示例](#api调用示例)

---

## 概览

权限系统采用**基于角色的访问控制（RBAC）**模型，支持：

- ✅ 角色分配（admin、coordinator、developer、user、readonly）
- ✅ 工具级别的权限控制
- ✅ 三种权限动作（allow、deny、require_approval）
- ✅ 自定义规则
- ✅ 审批工作流

---

## 预定义角色

### 1️⃣ Admin（管理员）
**权限**：所有工具的完全访问权限

**适用于**：系统管理员、超级用户

**工具权限**：
- ✅ 所有生命周期管理工具
- ✅ 所有发现与管理工具
- ✅ 所有任务管理工具
- ✅ 所有组织管理工具
- ✅ 所有权限管理工具

### 2️⃣ Coordinator（项目协调员）
**权限**：可以发现、管理智能体、分配任务，生命周期管理需要审批

**适用于**：项目经理、团队lead

**工具权限**：
- ✅ 智能体发现（agent_discover、agent_inspect、agent_status）
- ✅ 智能体通信（agent_communicate、agent_assign_task）
- ✅ 任务管理（task_*）
- 🟡 生命周期管理（agent_spawn、agent_destroy等，需要审批）

### 3️⃣ Developer（开发者）
**权限**：可以使用基础工具和查看智能体信息

**适用于**：普通开发人员

**工具权限**：
- ✅ 基础工具（sessions_list、web_search等）
- ✅ 查看智能体（agent_discover、agent_inspect）
- ❌ 管理操作（不能创建、删除智能体）

### 4️⃣ User（普通用户）
**权限**：只能使用基础工具

**适用于**：一般用户

**工具权限**：
- ✅ 基础工具（sessions_list、sessions_history、message等）
- ❌ 所有管理工具

### 5️⃣ Readonly（只读用户）
**权限**：只能查看信息

**适用于**：观察者、审计员

**工具权限**：
- ✅ 列表查询（*_list）
- ✅ 查看智能体（agent_discover、agent_inspect）
- ❌ 所有修改操作

---

## 工具类别

### 智能体生命周期管理
- `agent_spawn` - 创建智能体
- `agent_start` - 启动智能体
- `agent_stop` - 停止智能体
- `agent_restart` - 重启智能体
- `agent_configure` - 配置智能体
- `agent_destroy` - 销毁智能体
- `agent_clone` - 克隆智能体

### 智能体发现与管理
- `agent_discover` - 发现智能体
- `agent_inspect` - 检查智能体详情
- `agent_status` - 管理智能体状态
- `agent_capabilities` - 查询智能体能力
- `agent_assign_task` - 分配任务
- `agent_communicate` - 智能体间通信

### 任务管理
- `task_create` - 创建任务
- `task_list` - 列出任务
- `task_update` - 更新任务
- `task_complete` - 完成任务
- `task_delete` - 删除任务

---

## 配置方式

### 方式一：通过 RPC API（推荐）

#### 1. 初始化权限配置

```typescript
// 为智能体初始化权限系统
await gateway.call("permission.init", {
  agentId: "main",  // 哪个智能体的权限配置
  includeAllRoles: true  // 是否包含所有预定义角色
});
```

#### 2. 为智能体分配角色

```typescript
// 为 backend-dev-001 分配 developer 角色
await gateway.call("permission.role.assign", {
  agentId: "main",  // 权限配置所在的智能体
  targetAgentId: "backend-dev-001",  // 要分配角色的智能体
  roleId: "developer"
});
```

#### 3. 查看智能体的角色

```typescript
// 查询 backend-dev-001 的所有角色
const result = await gateway.call("permission.role.list", {
  agentId: "main",
  targetAgentId: "backend-dev-001"
});

console.log(result.roles);
// [{ id: "developer", name: "开发者", description: "..." }]
```

#### 4. 移除角色

```typescript
// 移除 developer 角色
await gateway.call("permission.role.remove", {
  agentId: "main",
  targetAgentId: "backend-dev-001",
  roleId: "developer"
});
```

#### 5. 添加自定义规则

```typescript
// 允许特定智能体使用某个工具
await gateway.call("permission.rule.add", {
  agentId: "main",
  toolName: "agent_spawn",
  agentIds: ["coordinator-001"],  // 允许这些智能体
  action: "allow",
  description: "允许协调员创建智能体"
});
```

---

### 方式二：直接修改 openclaw.config.yaml

```yaml
agents:
  main:
    name: "主智能体"
    model: "openai/gpt-4"
    
    # 权限配置
    permissions:
      defaultAction: deny  # 默认拒绝（白名单模式）
      
      # 角色定义
      roles:
        - id: admin
          name: 管理员
          description: 拥有所有权限
          members:
            - type: user
              id: main
            - type: user
              id: coordinator-001
        
        - id: developer
          name: 开发者
          description: 可以使用基础工具
          members:
            - type: user
              id: backend-dev-001
            - type: user
              id: frontend-dev-001
      
      # 权限规则
      rules:
        # 管理员拥有所有权限
        - id: admin-all-allow
          toolName: "*"
          subjects:
            - type: role
              id: admin
          action: allow
          priority: 1000
        
        # 开发者可以发现智能体
        - id: developer-discover
          toolName: "agent_discover"
          subjects:
            - type: role
              id: developer
          action: allow
          priority: 600
        
        # 禁止开发者使用生命周期管理
        - id: developer-deny-lifecycle
          toolName: "agent_*"
          subjects:
            - type: role
              id: developer
          action: deny
          priority: 900
      
      # 审批配置
      approvalConfig:
        approvers:
          - type: role
            id: admin
        requiredApprovals: 1
        timeout: 300  # 5分钟
        timeoutAction: reject
      
      # 审计日志
      enableAuditLog: true
      auditLogPath: "logs/permissions-audit.jsonl"
```

---

## 常见场景

### 场景1：创建一个协调员团队

```typescript
// 1. 初始化权限
await gateway.call("permission.init", {
  agentId: "main",
  includeAllRoles: true
});

// 2. 为协调员分配角色
const coordinators = ["coordinator-001", "coordinator-002"];
for (const coordinatorId of coordinators) {
  await gateway.call("permission.role.assign", {
    agentId: "main",
    targetAgentId: coordinatorId,
    roleId: "coordinator"
  });
}
```

### 场景2：允许特定智能体使用高级工具

```typescript
// 允许 coordinator-001 直接创建智能体（不需要审批）
await gateway.call("permission.rule.add", {
  agentId: "main",
  toolName: "agent_spawn",
  agentIds: ["coordinator-001"],
  action: "allow",
  description: "允许首席协调员直接创建智能体"
});
```

### 场景3：设置工具需要审批

```typescript
// 所有删除操作需要审批
await gateway.call("permission.rule.add", {
  agentId: "main",
  toolName: "agent_destroy",
  roleIds: ["coordinator"],
  action: "require_approval",
  description: "删除智能体需要管理员审批"
});
```

### 场景4：临时授予权限

```typescript
// 1. 为智能体分配临时角色
await gateway.call("permission.role.assign", {
  agentId: "main",
  targetAgentId: "temp-admin-001",
  roleId: "admin"
});

// 2. 任务完成后移除
await gateway.call("permission.role.remove", {
  agentId: "main",
  targetAgentId: "temp-admin-001",
  roleId: "admin"
});
```

---

## API调用示例

### 获取所有可用角色

```typescript
const result = await gateway.call("permission.roles.available", {
  agentId: "main"
});

console.log(result.roles);
/*
[
  {
    id: "admin",
    name: "管理员",
    description: "拥有所有权限，可以管理智能体和系统配置",
    memberCount: 2
  },
  {
    id: "coordinator",
    name: "项目协调员",
    description: "可以发现、管理智能体、分配任务",
    memberCount: 3
  },
  ...
]
*/
```

### 获取权限系统常量

```typescript
const result = await gateway.call("permission.constants");

console.log(result);
/*
{
  success: true,
  predefinedRoles: {
    ADMIN: "admin",
    COORDINATOR: "coordinator",
    DEVELOPER: "developer",
    USER: "user",
    READONLY: "readonly"
  },
  toolCategories: {
    AGENT_LIFECYCLE: ["agent_spawn", "agent_start", ...],
    AGENT_DISCOVERY: ["agent_discover", "agent_inspect", ...],
    TASK_MANAGEMENT: ["task_create", "task_list", ...],
    ...
  },
  actions: ["allow", "deny", "require_approval"]
}
*/
```

### 获取智能体当前权限配置

```typescript
const result = await gateway.call("permission.get", {
  agentId: "main"
});

console.log(result.permissions);
// 完整的权限配置对象
```

---

## 🔐 安全最佳实践

1. **默认拒绝原则**：设置 `defaultAction: "deny"`，采用白名单模式
2. **最小权限原则**：只授予必要的权限
3. **定期审计**：启用 `enableAuditLog` 记录所有权限操作
4. **审批敏感操作**：对 destroy、configure 等敏感操作设置审批
5. **角色分离**：使用角色而不是直接授予个体权限
6. **及时撤销**：临时权限使用后立即撤销

---

## 📝 配置文件位置

- **权限配置**：在 `openclaw.config.yaml` 的 `agents[].permissions` 字段
- **审计日志**：默认 `logs/permissions-audit.jsonl`
- **权限缓存**：内存缓存，TTL 60秒

---

## 🚀 快速开始

```bash
# 1. 通过CLI初始化权限
openclaw permission init --agent main

# 2. 分配角色
openclaw permission assign --agent main --target backend-dev-001 --role developer

# 3. 查看角色
openclaw permission roles --agent main --target backend-dev-001

# 4. 测试权限（尝试执行工具）
openclaw agent send --agent backend-dev-001 --message "使用 agent_discover 查找其他智能体"
```

---

## ❓ 常见问题

**Q: 如何让某个智能体拥有管理员权限？**

A: 将其添加到 admin 角色的members中：
```typescript
await gateway.call("permission.role.assign", {
  agentId: "main",
  targetAgentId: "target-agent",
  roleId: "admin"
});
```

**Q: 权限配置更新后需要重启吗？**

A: 不需要。权限缓存会在配置更新后自动清除。

**Q: 如何查看某个工具是否被允许？**

A: 查看审计日志 `logs/permissions-audit.jsonl`，或在工具调用时捕获权限错误。

**Q: 审批流程如何工作？**

A: 当工具需要审批时，系统会创建审批请求，通知审批者，等待批准后才执行。

---

## 📚 相关文件

- `src/agents/tools/permission-templates.ts` - 权限模板和辅助函数
- `src/agents/tools/permission-middleware.ts` - 权限检查中间件
- `src/gateway/server-methods/permission.ts` - RPC处理器
- `src/config/types.permissions.ts` - 类型定义

---

## 🎉 总结

通过这个权限系统，你可以：

1. ✅ **细粒度控制**：工具级别的权限管理
2. ✅ **角色管理**：5种预定义角色 + 自定义角色
3. ✅ **审批工作流**：敏感操作需要审批
4. ✅ **灵活配置**：支持YAML配置和RPC API
5. ✅ **安全审计**：完整的操作日志

**开始使用吧！** 🚀
