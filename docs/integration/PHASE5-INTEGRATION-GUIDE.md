# Phase 5 集成指南：工作空间与文档系统

## 概述

Phase 5 实现了 OpenClaw 的工作空间与文档系统,提供智能助手个人工作空间、群组协作工作空间、Bootstrap文件管理、知识沉淀系统和文件访问控制等核心功能。

## 核心功能

### 1. 双层工作空间体系

#### 1.1 智能助手个人工作空间

- **路径**: `~/.openclaw/workspace-{agentId}/`
- **核心文件**:
  - `AGENTS.md`: 智能助手配置
  - `SOUL.md`: 灵魂档案
  - `TOOLS.md`: 工具清单
  - `IDENTITY.md`: 身份信息
  - `USER.md`: 用户配置
  - `MEMORY.md`: 私密记忆
  - `skills/`: 技能目录

#### 1.2 群组工作空间

- **路径**: `~/.openclaw/groups/{groupId}/`
- **核心文件**:
  - `GROUP_INFO.md`: 群组信息
  - `MEMBERS.md`: 成员列表
  - `SHARED_MEMORY.md`: 共享记忆
  - `RULES.md`: 群组规则
- **目录结构**:
  - `shared/`: 共享文档
  - `history/`: 历史记录
  - `meeting-notes/`: 会议纪要
  - `decisions/`: 决策记录

### 2. Bootstrap 文件系统

Bootstrap 文件在会话开始时自动加载,为智能助手提供上下文。

#### 2.1 个人会话

加载智能助手的所有工作空间文件。

#### 2.2 群组会话

- 加载群组核心文件(GROUP_INFO, MEMBERS, SHARED_MEMORY, RULES)
- 加载成员的专业知识文件(AGENTS, TOOLS, IDENTITY, skills/\*\*)
- 隔离私密记忆文件(MEMORY.md, memory/\*\*)

### 3. 三层访问控制机制

#### 3.1 专业知识共享

在群组中可读取:

- `AGENTS.md`
- `TOOLS.md`
- `IDENTITY.md`
- `skills/` 目录

#### 3.2 私密记忆隔离

在群组中禁止访问:

- `MEMORY.md`
- `memory/` 目录

#### 3.3 跨空间禁止

不能访问其他智能助手的工作空间。

### 4. 知识沉淀系统

自动将重要讨论沉淀为文档。

#### 4.1 触发条件

- 包含关键词(决定、架构、设计等)
- 消息数达到阈值(默认10条)
- 参与人数达到阈值(默认2人)
- 讨论结束(超过30分钟无新消息)

#### 4.2 自动分类

- **decision**: 决策记录
- **meeting-notes**: 会议纪要
- **adr**: 架构决策记录(ADR)
- **shared-doc**: 共享文档

## 快速开始

### 1. 初始化 Phase 5

```typescript
import { initializePhase5 } from "./workspace/phase5-integration";

await initializePhase5({
  // 智能助手工作空间根目录
  agentWorkspaceRoot: "~/.openclaw",

  // 启用文件访问日志
  enableFileAccessLog: true,
  maxLogEntries: 1000,

  // 群组配置
  groups: {
    workspace: {
      root: "~/.openclaw/groups",
      enabled: true,
      knowledgeSedimentation: {
        enabled: true,
        triggers: {
          keywords: ["决定", "决策", "架构", "设计"],
          minMessages: 10,
          minParticipants: 2,
        },
      },
    },
    defaults: {
      memberPermissions: {
        canRead: true,
        canWrite: true,
        canDelete: false,
      },
      enableKnowledgeSedimentation: true,
    },
    groups: [
      {
        id: "tech-team",
        name: "技术团队",
        admins: ["admin-001"],
        members: ["agent-001", "agent-002"],
      },
    ],
  },
});
```

### 2. 加载 Bootstrap 文件

```typescript
import { phase5Integration } from "./workspace/phase5-integration";

// 个人会话
const personalFiles = phase5Integration.loadBootstrapForSession("session-001", "dm", "agent-001");

// 群组会话
const groupFiles = phase5Integration.loadBootstrapForSession(
  "session-002",
  "group",
  "agent-001",
  "tech-team",
);

console.log(`加载了 ${personalFiles.length} 个个人文件`);
console.log(`加载了 ${groupFiles.length} 个群组文件`);
```

### 3. 解析工作空间

```typescript
// 解析个人工作空间
const personalWorkspace = phase5Integration.resolveWorkspace("session-001", "dm", "agent-001");

console.log("工作空间类型:", personalWorkspace.type); // 'agent'
console.log("根目录:", personalWorkspace.rootDir);

// 解析群组工作空间
const groupWorkspace = phase5Integration.resolveWorkspace(
  "session-002",
  "group",
  "agent-001",
  "tech-team",
);

console.log("工作空间类型:", groupWorkspace.type); // 'group'
console.log("群组ID:", groupWorkspace.groupId);
```

### 4. 安全文件操作

```typescript
// 安全读取文件
const readResult = phase5Integration.readFileSecure(
  "/path/to/file.txt",
  "session-001",
  "dm",
  "agent-001",
);

if (readResult.success) {
  console.log("文件内容:", readResult.data);
} else {
  console.error("读取失败:", readResult.error);
  if (readResult.redirectedPath) {
    console.log("建议路径:", readResult.redirectedPath);
  }
}

// 安全写入文件
const writeResult = phase5Integration.writeFileSecure(
  "/path/to/file.txt",
  "New content",
  "session-001",
  "dm",
  "agent-001",
);

if (writeResult.success) {
  console.log("写入成功");
} else {
  console.error("写入失败:", writeResult.error);
}
```

### 5. 群组管理

```typescript
// 创建群组
const workspace = phase5Integration.createGroup("new-group", "New Group", "admin-001");

// 添加成员
phase5Integration.addGroupMember("new-group", "agent-002", "admin-001");

// 获取成员列表
const members = phase5Integration.getGroupMembers("new-group");
console.log("成员:", members);

// 移除成员
phase5Integration.removeGroupMember("new-group", "agent-002", "admin-001");
```

### 6. 知识沉淀

```typescript
import type { Message } from "./workspace/types";

// 手动沉淀知识
const messages: Message[] = [
  {
    id: "msg-001",
    senderId: "agent-001",
    content: "我们需要决定使用哪个架构方案",
    timestamp: Date.now(),
    metadata: { importance: "high", keywords: ["决定", "架构"] },
  },
  {
    id: "msg-002",
    senderId: "agent-002",
    content: "我建议使用微服务架构",
    timestamp: Date.now() + 1000,
  },
];

const result = phase5Integration.manualSedimentKnowledge(
  "tech-team",
  messages,
  "decision",
  "架构决策-微服务",
);

console.log("文档路径:", result.documentPath);
console.log("类别:", result.category);
console.log("参与者:", result.participants);

// 搜索知识文档
const docs = phase5Integration.searchKnowledge("tech-team", "架构");
console.log("找到文档:", docs);

// 获取决策文档
const decisions = phase5Integration.getKnowledgeDocuments("tech-team", "decision");
console.log("决策文档:", decisions);
```

## 配置说明

### 群组配置

```typescript
interface GroupsConfig {
  workspace?: {
    root?: string; // 群组工作空间根目录
    enabled?: boolean; // 是否启用
    archival?: {
      enabled: boolean; // 是否启用自动归档
      intervalDays: number; // 归档间隔(天)
    };
    knowledgeSedimentation?: {
      enabled: boolean;
      triggers?: {
        keywords?: string[]; // 触发关键词
        minMessages?: number; // 最小消息数
        minParticipants?: number; // 最小参与人数
      };
    };
  };

  defaults?: {
    memberPermissions?: {
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    };
    enableKnowledgeSedimentation?: boolean;
    enableAutoArchival?: boolean;
    archivalIntervalDays?: number;
  };

  groups?: GroupDefinition[]; // 预定义群组
}
```

### 群组定义

```typescript
interface GroupDefinition {
  id: string;
  name: string;
  description?: string;
  admins?: string[];
  members?: string[];
  config?: {
    knowledgeSedimentation?: {
      enabled: boolean;
      triggers?: {
        keywords?: string[];
        minMessages?: number;
        minParticipants?: number;
      };
    };
    permissions?: {
      memberCanRead: boolean;
      memberCanWrite: boolean;
      memberCanDelete: boolean;
      memberCanInvite: boolean;
    };
    bootstrap?: {
      loadMemberKnowledge: boolean;
      customFiles?: string[];
    };
  };
}
```

## API 参考

### Phase5Integration

#### 初始化

- `initialize(config?: Phase5IntegrationConfig): Promise<void>`
- `isInitialized(): boolean`
- `reloadConfig(config: Phase5IntegrationConfig): Promise<void>`
- `shutdown(): void`

#### Bootstrap 文件

- `loadBootstrapForSession(sessionKey, sessionType, agentId, groupId?): BootstrapFile[]`

#### 工作空间

- `resolveWorkspace(sessionKey, sessionType, agentId, groupId?): WorkspaceResolution`

#### 群组管理

- `createGroup(groupId, groupName, creatorId): GroupWorkspace`
- `addGroupMember(groupId, agentId, operatorId): boolean`
- `removeGroupMember(groupId, agentId, operatorId): boolean`
- `getGroupMembers(groupId): string[]`
- `getAllGroups(): GroupWorkspace[]`

#### 文件操作

- `readFileSecure(filePath, sessionKey, sessionType, agentId, groupId?)`
- `writeFileSecure(filePath, content, sessionKey, sessionType, agentId, groupId?)`
- `getFileAccessStats(agentId?)`

#### 知识沉淀

- `processMessage(sessionId, groupId, message): KnowledgeSedimentationResult | null`
- `manualSedimentKnowledge(groupId, messages, category?, title?): KnowledgeSedimentationResult`
- `searchKnowledge(groupId, query): string[]`
- `getKnowledgeDocuments(groupId, category?): string[]`

#### 工具函数

- `healthCheck()`
- `clearCache(): void`

## 最佳实践

### 1. 工作空间设计

```typescript
// 为不同会话类型使用不同的工作空间
function getWorkspaceForSession(sessionType: SessionType, agentId: string, groupId?: string) {
  return phase5Integration.resolveWorkspace(generateSessionKey(), sessionType, agentId, groupId);
}

// DM 会话 -> 个人工作空间
const dmWorkspace = getWorkspaceForSession("dm", "agent-001");

// 群组会话 -> 群组工作空间
const groupWorkspace = getWorkspaceForSession("group", "agent-001", "tech-team");
```

### 2. Bootstrap 文件管理

```typescript
// 缓存 Bootstrap 文件以提高性能
const files = phase5Integration.loadBootstrapForSession(sessionKey, sessionType, agentId, groupId);

// 合并为单一上下文
import { bootstrapLoader } from "./workspace/bootstrap-loader";
const context = bootstrapLoader.mergeBootstrapContent(files);

// 传递给 AI
const response = await callAI(userMessage, context);
```

### 3. 访问控制

```typescript
// 使用安全文件操作而不是直接 fs 操作
// ❌ 不要这样做
const content = fs.readFileSync(filePath, "utf-8");

// ✅ 应该这样做
const result = phase5Integration.readFileSecure(
  filePath,
  sessionKey,
  sessionType,
  agentId,
  groupId,
);

if (result.success) {
  const content = result.data;
} else {
  // 处理访问被拒绝的情况
  console.error(result.error);
}
```

### 4. 知识沉淀

```typescript
// 在群组讨论中自动触发
class GroupSessionManager {
  private sessionId: string;
  private groupId: string;

  async handleMessage(message: Message) {
    // 处理消息
    await this.processMessage(message);

    // 检查是否触发知识沉淀
    const result = phase5Integration.processMessage(this.sessionId, this.groupId, message);

    if (result) {
      console.log(`知识已沉淀: ${result.title}`);
      console.log(`文档路径: ${result.documentPath}`);

      // 通知群组成员
      await this.notifyMembers(`新文档已创建: ${result.title}`);
    }
  }
}
```

### 5. 错误处理

```typescript
// 使用 try-catch 捕获初始化错误
try {
  await initializePhase5(config);
} catch (error) {
  console.error("Phase 5 初始化失败:", error);
  // 降级处理
  await fallbackInitialization();
}

// 检查健康状态
const health = phase5HealthCheck();
if (!health.healthy) {
  console.warn("Phase 5 健康检查失败");
  // 触发告警
  await alertAdmin("Phase 5 system unhealthy");
}
```

## 常见问题

### Q1: 如何处理文件访问被拒绝?

A: 使用 `readFileSecure` 等安全方法,检查返回的 `success` 字段。如果被拒绝,可以使用 `suggestedPath` 字段获取建议的替代路径。

### Q2: 如何自定义知识沉淀规则?

A: 在初始化时配置 `groups.workspace.knowledgeSedimentation`,设置自定义的触发条件和分类关键词。

### Q3: 如何管理群组权限?

A: 群组创建者自动成为管理员。管理员可以添加/移除成员。使用 `addGroupMember` 和 `removeGroupMember` 方法。

### Q4: Bootstrap 文件的加载顺序?

A: 按照 `priority` 字段排序。数字越小优先级越高。默认顺序:

1. GROUP_INFO / AGENTS (priority: 1)
2. MEMBERS / SOUL (priority: 2)
3. SHARED_MEMORY / TOOLS (priority: 3)
4. RULES / IDENTITY (priority: 4)

### Q5: 如何备份工作空间数据?

A: 工作空间是标准的文件系统目录,可以使用常规的备份工具。推荐定期备份 `~/.openclaw` 目录。

## 集成检查清单

- [ ] 初始化 Phase 5 并验证健康状态
- [ ] 配置群组工作空间和默认权限
- [ ] 预定义常用群组
- [ ] 测试 Bootstrap 文件加载
- [ ] 测试文件访问控制
- [ ] 测试知识沉淀触发
- [ ] 配置文件访问日志
- [ ] 实现错误处理和降级逻辑
- [ ] 编写集成测试
- [ ] 更新部署文档

## 下一步

- 继续实现 Phase 6: 多租户系统
- 优化 Bootstrap 文件缓存策略
- 实现工作空间归档功能
- 添加知识图谱支持
- 实现更细粒度的权限控制

## 技术支持

如有问题,请查阅:

- [设计文档](../../.qoder/quests/system-design-and-code-integration.md)
- [API 文档](./PHASE5-API.md)
- [示例代码](../../examples/phase5-examples/)

---

**Phase 5 集成完成** ✅

Created: 2026-02-08
Version: 1.0.0
