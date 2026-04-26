# 工具权限分级规则 (Tool Permission Levels)

> **核心原则：** 根据工具的风险等级实施分级审批

## 📊 权限分级标准

基于OWASP LLM Top 10和业界最佳实践（2025-2026）：

```
风险等级        →  审批者            →  执行方式
────────────────────────────────────────────────
read (只读)     →  Agent自我批准     →  立即执行
write (写入)    →  直接上级Agent     →  审批后执行
irreversible    →  Admin + Human     →  双重确认后执行
  (不可逆)
```

---

## 🛡️ 工具风险分级

### 1. Read-Only（只读）- 无需审批

**特征：** 只读取数据，不修改任何内容

**工具列表：**
```
✅ memory_search      - 搜索记忆
✅ memory_get         - 获取记忆内容
✅ file_read          - 读取文件
✅ task_list          - 列出任务
✅ project_read       - 读取项目信息
✅ code_read          - 读取代码
✅ memory_list        - 列出记忆
✅ skill_list         - 列出技能
```

**执行规则：**
```
Agent 发现需要读取数据
  → 检查工具权限（read）
  → 立即执行
  → 记录审计日志
```

---

### 2. Write（写入）- Medium审批

**特征：** 创建或修改数据，但可撤销

**工具列表：**
```
✅ task_create        - 创建任务
✅ task_update        - 更新任务
✅ file_write         - 写入文件
✅ memory_save        - 保存记忆
✅ project_memory_save - 保存项目记忆
✅ project_create     - 创建项目
✅ project_update     - 更新项目
✅ code_write         - 编写代码
✅ test_run           - 运行测试
✅ bash_execute       - 执行Bash命令（非破坏性）
```

**执行规则：**
```
Agent 需要执行写入操作
  → 检查工具权限（write）
  → 提交审批请求
  → 直接上级Agent审批
  → 通过后执行
  → 记录审计日志
  
如果超时（5分钟）：
  → 降级为上级Agent自动批准
```

---

### 3. Irreversible（不可逆）- Critical审批

**特征：** 删除数据或执行不可撤销的操作

**工具列表：**
```
❌ file_delete        - 删除文件
❌ database_drop      - 删除数据库
❌ payment_execute    - 执行支付
❌ deployment_prod    - 生产环境部署
❌ data_migration     - 数据迁移
❌ user_delete        - 删除用户
❌ project_delete     - 删除项目
```

**执行规则：**
```
Agent 需要执行不可逆操作
  → 检查工具权限（irreversible）
  → 提交审批请求
  → Admin Agent审批
  → 必须人类确认（human-owner）
  → 双重确认后执行
  → 详细记录审计日志
  
如果超时（30分钟）：
  → 不自动降级
  → 通知人类管理员
  → 等待手动处理
```

---

## 🔧 实施实现

### 权限检查流程

```typescript
async function checkToolPermission(
  toolName: string,
  agentId: string,
  riskLevel: ToolRiskLevel
): Promise<PermissionResult> {
  // 1. 查询Agent注册表
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    return { allowed: false, reason: 'Agent not found' };
  }
  
  // 2. 检查权限
  const permissions = agent.permissions;
  
  switch (riskLevel) {
    case 'read':
      // 只读：直接允许
      return { 
        allowed: true, 
        requiresApproval: false,
        auditLog: `Agent ${agentId} read operation`
      };
      
    case 'write':
      // 写入：需要上级审批
      const supervisor = findSupervisor(agentId);
      return {
        allowed: true,
        requiresApproval: true,
        approver: supervisor,
        timeout: 300, // 5分钟
        auditLog: `Agent ${agentId} write operation pending approval`
      };
      
    case 'irreversible':
      // 不可逆：需要Admin + 人类确认
      return {
        allowed: true,
        requiresApproval: true,
        approver: 'admin',
        requiresHumanConfirmation: true,
        timeout: 1800, // 30分钟
        auditLog: `Agent ${agentId} irreversible operation requires human confirmation`
      };
  }
}
```

---

## 📝 审计日志要求

**所有工具调用必须记录：**

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "agentId": "developer",
  "toolName": "file_write",
  "riskLevel": "write",
  "action": "create src/example.ts",
  "approval": {
    "required": true,
    "approvedBy": "coordinator",
    "approvedAt": "2025-01-15T10:30:05Z",
    "approvalReason": "Task implementation"
  },
  "result": "success",
  "duration": 150
}
```

---

## ⚠️ 禁止行为

❌ **绝对禁止：**
1. 跳过权限检查执行工具
2. 未获得审批就执行write操作
3. 未获得人类确认就执行irreversible操作
4. 不记录审计日志
5. 修改权限系统代码（需要人类管理员）

---

## ✅ 示例场景

### 场景1：读取文件（无需审批）

```
Agent: 我需要读取 package.json
System: 检查权限... file_read (read-only)
System: ✅ 允许执行
Agent: 执行 file_read package.json
System: 记录审计日志
```

### 场景2：创建任务（需要审批）

```
Agent: 我需要创建新任务
System: 检查权限... task_create (write)
System: 需要上级审批
System: 发送审批请求给 coordinator
Coordinator: 审批通过
System: ✅ 允许执行
Agent: 执行 task_create
System: 记录审计日志
```

### 场景3：删除文件（需要人类确认）

```
Agent: 我需要删除旧文件
System: 检查权限... file_delete (irreversible)
System: 需要Admin审批 + 人类确认
System: 发送审批请求给 admin
Admin: 审批通过
System: 通知人类管理员确认
Human: 确认删除
System: ✅ 允许执行
Agent: 执行 file_delete
System: 详细记录审计日志
```

---

## 📚 参考资料

- OWASP LLM Top 10: LLM06 Excessive Agency
- Microsoft: AI Agent Governance Best Practices (2026)
- NIST: AI Risk Management Framework (2025)
