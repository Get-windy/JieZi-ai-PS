# Phase 4: 组织与协作体系集成指南

## 概述

Phase 4 实现了完整的组织架构与协作管理系统，包括：

- **组织层级管理**：四级组织结构（company → department → team → individual）
- **团队管理**：三种类型团队（permanent/project/temporary）
- **协作关系**：六种协作类型（supervisor/colleague/project/business/mentor/monitor）
- **师徒系统**：培训计划与进度跟踪

## 核心文件

```
src/organization/
├── types.ts                          # 类型定义（227行）
├── organization-system.ts            # 核心组织系统（312行）
├── organization-hierarchy.ts         # 层级管理（272行）
├── team-management.ts                # 团队管理（482行）
├── collaboration-system.ts           # 协作系统（541行）
├── mentor-system.ts                  # 师徒系统（592行）
└── organization-integration.ts       # 集成器（568行）

src/config/
└── phase-integration.ts              # 扩展了Phase 4配置验证

tests/
└── phase4-integration.test.ts        # 集成测试（581行）
```

**总计**：3,575+ 行代码实现

## 快速开始

### 1. 配置集成方式

在 `openclaw.json` 中添加组织配置：

```json
{
  "organization": {
    "organizations": [
      {
        "id": "company1",
        "name": "TechCorp",
        "level": "company"
      },
      {
        "id": "dept1",
        "name": "Engineering",
        "level": "department",
        "parentId": "company1",
        "memberIds": ["agent1", "agent2", "agent3"],
        "quota": {
          "maxMembers": 50,
          "budgetPerMonth": 10000,
          "maxTokensPerDay": 1000000
        }
      },
      {
        "id": "team1",
        "name": "Backend Team",
        "level": "team",
        "parentId": "dept1",
        "memberIds": ["agent1", "agent2"]
      }
    ],
    "teams": [
      {
        "id": "project_alpha",
        "name": "Project Alpha",
        "organizationId": "dept1",
        "leaderId": "agent1",
        "memberIds": ["agent2", "agent3"],
        "type": "project",
        "objectives": ["Launch product", "Increase revenue"],
        "sharedResources": {
          "workspaces": ["ws1", "ws2"],
          "knowledgeBases": ["kb_engineering"],
          "tools": ["tool1", "tool2"]
        },
        "validUntil": 1735689600000
      }
    ],
    "collaborations": [
      {
        "id": "collab1",
        "fromAgentId": "agent1",
        "toAgentId": "agent2",
        "type": "supervisor",
        "organizationId": "dept1"
      },
      {
        "id": "collab2",
        "fromAgentId": "agent2",
        "toAgentId": "agent3",
        "type": "colleague"
      }
    ],
    "mentorships": [
      {
        "id": "mentor1",
        "mentorId": "agent1",
        "menteeId": "agent3",
        "trainingPlan": {
          "goals": ["Learn Backend Development", "Master TypeScript"],
          "skills": ["TypeScript", "Node.js", "Express", "PostgreSQL"],
          "duration": 7776000000
        }
      }
    ]
  }
}
```

### 2. RPC 集成方式

通过 Gateway RPC 调用：

```typescript
// 创建组织
await gateway.call("organization.create", {
  id: "dept2",
  name: "Sales",
  level: "department",
  parentId: "company1",
  createdBy: "admin",
});

// 创建团队
await gateway.call("team.create", {
  id: "team2",
  name: "Frontend Team",
  organizationId: "dept1",
  leaderId: "agent4",
  type: "permanent",
});

// 创建协作关系
await gateway.call("collaboration.create", {
  id: "collab3",
  fromAgentId: "agent1",
  toAgentId: "agent4",
  type: "project",
  createdBy: "admin",
});

// 创建师徒关系
await gateway.call("mentorship.create", {
  id: "mentor2",
  mentorId: "agent2",
  menteeId: "agent5",
  trainingPlan: {
    goals: ["Master React"],
    skills: ["React", "Redux"],
  },
  createdBy: "admin",
});

// 获取组织统计
const stats = await gateway.call("organization.getStatistics", {
  organizationId: "dept1",
});

// 获取协作网络
const network = await gateway.call("collaboration.getNetworkStats", {
  agentId: "agent1",
});

// 获取培训进度
const progress = await gateway.call("mentorship.getProgressReport", {
  mentorshipId: "mentor1",
});
```

### 3. 程序化集成方式

直接调用 API：

```typescript
import { OrganizationAPI } from "./src/organization/organization-integration";

// 组织管理
const org = await OrganizationAPI.organization.create({
  id: "dept3",
  name: "Marketing",
  level: "department",
  parentId: "company1",
  createdBy: "system",
});

await OrganizationAPI.organization.addMember({
  organizationId: "dept3",
  agentId: "agent6",
  updatedBy: "admin",
});

const tree = await OrganizationAPI.hierarchy.getTree("company1");
const allMembers = await OrganizationAPI.hierarchy.getAllMembers("dept1");

// 团队管理
const team = await OrganizationAPI.team.create({
  id: "team3",
  name: "QA Team",
  organizationId: "dept1",
  leaderId: "agent7",
  type: "permanent",
});

await OrganizationAPI.team.addMember({
  teamId: "team3",
  memberId: "agent8",
});

// 协作管理
const collab = await OrganizationAPI.collaboration.create({
  id: "collab4",
  fromAgentId: "agent7",
  toAgentId: "agent8",
  type: "supervisor",
  createdBy: "admin",
});

const supervisors = await OrganizationAPI.collaboration.getSupervisors("agent8");
const path = await OrganizationAPI.collaboration.findPath("agent1", "agent8");

// 师徒管理
const mentorship = await OrganizationAPI.mentorship.create({
  id: "mentor3",
  mentorId: "agent7",
  menteeId: "agent9",
  trainingPlan: {
    goals: ["Learn Testing"],
    skills: ["Jest", "Playwright"],
  },
  createdBy: "admin",
});

await OrganizationAPI.mentorship.updateProgress({
  mentorshipId: "mentor3",
  completedGoals: ["Learn Testing"],
  updatedBy: "agent7",
});

const mentorStats = await OrganizationAPI.mentorship.getMentorStats("agent7");
```

### 4. CLI 集成方式

命令行操作：

```bash
# 组织管理
openclaw org:create --id=dept4 --name="Support" --level=department --parent-id=company1
openclaw org:add-member --org-id=dept4 --member-id=agent10
openclaw org:stats --id=dept4

# 团队管理
openclaw team:create --id=team4 --name="DevOps" --org-id=dept1 --leader-id=agent11 --type=permanent
openclaw team:add-member --team-id=team4 --member-id=agent12
openclaw team:stats --id=team4

# 协作管理
openclaw collab:create --id=collab5 --from=agent11 --to=agent12 --type=supervisor
openclaw collab:network --agent-id=agent11

# 师徒管理
openclaw mentor:create --id=mentor4 --mentor-id=agent11 --mentee-id=agent13 --goals="Learn DevOps" --skills="Docker,Kubernetes"
openclaw mentor:progress --id=mentor4
openclaw mentor:stats --id=agent11 --type=mentor
```

## API 参考

### 组织系统 API

#### 创建组织

```typescript
await organizationSystem.createOrganization({
  id: string;
  name: string;
  level: 'company' | 'department' | 'team' | 'individual';
  parentId?: string;
  managerId?: string;
  memberIds?: string[];
  quota?: {
    maxMembers?: number;
    budgetPerMonth?: number;
    maxTokensPerDay?: number;
  };
  createdBy: string;
});
```

#### 组织查询

```typescript
// 获取组织
await organizationSystem.getOrganization(organizationId);

// 获取子组织
await organizationSystem.getChildren(organizationId);

// 获取祖先组织（从父到根）
await organizationSystem.getAncestors(organizationId);

// 获取后代组织（包括所有子孙）
await organizationSystem.getDescendants(organizationId);

// 获取完整组织树
await organizationHierarchy.getTree(organizationId);

// 获取所有成员（递归）
await organizationHierarchy.getAllMembers(organizationId);

// 获取统计信息
await organizationHierarchy.getStatistics(organizationId);
```

### 团队管理 API

#### 创建团队

```typescript
await teamManagement.createTeam({
  id: string;
  name: string;
  organizationId: string;
  leaderId: string;
  memberIds?: string[];
  type: 'permanent' | 'project' | 'temporary';
  objectives?: string[];
  sharedResources?: {
    workspaces?: string[];
    knowledgeBases?: string[];
    tools?: string[];
  };
  validFrom?: number;
  validUntil?: number;
});
```

#### 团队操作

```typescript
// 添加成员
await teamManagement.addTeamMember({ teamId, memberId });

// 移除成员
await teamManagement.removeTeamMember({ teamId, memberId });

// 设置领导
await teamManagement.setTeamLeader({ teamId, newLeaderId });

// 添加共享资源
await teamManagement.addSharedResource({
  teamId,
  resourceType: "workspaces" | "knowledgeBases" | "tools",
  resourceId,
});

// 获取活跃团队
await teamManagement.getActiveTeams();

// 获取团队统计
await teamManagement.getTeamStatistics(teamId);
```

### 协作系统 API

#### 创建协作关系

```typescript
await collaborationSystem.createRelation({
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: 'supervisor' | 'colleague' | 'project' | 'business' | 'mentor' | 'monitor';
  organizationId?: string;
  metadata?: Record<string, any>;
  validFrom?: number;
  validUntil?: number;
  createdBy: string;
});
```

#### 关系查询

```typescript
// 获取助手的所有关系
await collaborationSystem.getRelationsByAgent(agentId);

// 获取特定类型关系
await collaborationSystem.getRelationsByType(agentId, type);

// 获取上级
await collaborationSystem.getSupervisors(agentId);

// 获取下属
await collaborationSystem.getSubordinates(agentId);

// 获取同事
await collaborationSystem.getColleagues(agentId);

// 获取网络统计
await collaborationSystem.getNetworkStats(agentId);

// 查找协作路径
await collaborationSystem.findCollaborationPath(fromAgentId, toAgentId, maxDepth);
```

### 师徒系统 API

#### 创建师徒关系

```typescript
await mentorSystem.createMentorship({
  id: string;
  mentorId: string;
  menteeId: string;
  trainingPlan?: {
    goals: string[];
    skills: string[];
    duration?: number;
  };
  createdBy: string;
});
```

#### 进度管理

```typescript
// 更新培训计划
await mentorSystem.updateTrainingPlan({
  mentorshipId,
  goals,
  skills,
  duration,
  updatedBy,
});

// 更新进度
await mentorSystem.updateProgress({
  mentorshipId,
  completedGoals,
  acquiredSkills,
  updatedBy,
});

// 完成师徒关系
await mentorSystem.completeMentorship({ mentorshipId, updatedBy });

// 取消师徒关系
await mentorSystem.cancelMentorship({ mentorshipId, reason, updatedBy });
```

#### 统计与报告

```typescript
// 获取师父统计
await mentorSystem.getMentorStats(mentorId);

// 获取徒弟统计
await mentorSystem.getMenteeStats(menteeId);

// 获取进度报告
await mentorSystem.getProgressReport(mentorshipId);

// 推荐师父
await mentorSystem.suggestMentors({
  menteeId,
  requiredSkills,
  organizationId,
});
```

## 数据结构

### 组织结构

```typescript
interface Organization {
  id: string;
  name: string;
  level: "company" | "department" | "team" | "individual";
  parentId?: string;
  managerId?: string;
  memberIds: string[];
  quota?: {
    maxMembers?: number;
    budgetPerMonth?: number;
    maxTokensPerDay?: number;
  };
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
}
```

### 团队结构

```typescript
interface Team {
  id: string;
  name: string;
  organizationId: string;
  leaderId: string;
  memberIds: string[];
  type: "permanent" | "project" | "temporary";
  objectives: string[];
  sharedResources: {
    workspaces: string[];
    knowledgeBases: string[];
    tools: string[];
  };
  validFrom?: number;
  validUntil?: number;
}
```

### 协作关系

```typescript
interface CollaborationRelation {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: "supervisor" | "colleague" | "project" | "business" | "mentor" | "monitor";
  organizationId?: string;
  metadata: Record<string, any>;
  validFrom?: number;
  validUntil?: number;
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
}
```

### 师徒关系

```typescript
interface MentorshipRelation {
  id: string;
  mentorId: string;
  menteeId: string;
  trainingPlan?: {
    goals: string[];
    skills: string[];
    duration?: number;
  };
  progress?: {
    completedGoals: string[];
    acquiredSkills: string[];
    progressRate: number;
    lastUpdated: number;
  };
  status: "active" | "completed" | "cancelled";
  metadata?: Record<string, any>;
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
}
```

## 功能特性

### 1. 组织层级验证

- **四级层级严格验证**：company → department → team → individual
- **防止非法层级关系**：team 不能是 company 的直接子级
- **递归查询**：支持获取所有祖先和后代组织

### 2. 团队类型管理

- **永久团队**（permanent）：长期稳定的团队
- **项目团队**（project）：有明确目标和期限的项目团队
- **临时团队**（temporary）：短期任务团队

### 3. 协作关系类型

1. **supervisor**：上下级关系
2. **colleague**：同事关系
3. **project**：项目协作
4. **business**：业务关联
5. **mentor**：师徒关系
6. **monitor**：监督关系

### 4. 师徒系统功能

- **培训计划**：设定目标和技能
- **进度跟踪**：记录完成的目标和掌握的技能
- **自动完成**：进度达到 100% 时自动标记为完成
- **师父推荐**：基于技能匹配推荐合适的师父

### 5. 资源配额管理

- **成员配额**：限制组织最大成员数
- **预算配额**：月度预算限制
- **Token 配额**：日最大 Token 使用量
- **递归累加**：统计包含所有子组织的总配额

### 6. 统计与分析

- **组织统计**：直接成员、总成员、子组织数量、深度
- **团队统计**：成员数、共享资源数、活跃状态、剩余天数
- **协作网络**：关系总数、各类型数量、连接的助手列表
- **师徒进度**：目标完成率、技能习得率、总体进度

## 测试

运行集成测试：

```bash
npm test tests/phase4-integration.test.ts
```

测试覆盖：

- ✅ 组织层级管理（创建、验证、树结构、统计）
- ✅ 团队管理（创建、成员管理、资源管理、有效期）
- ✅ 协作关系管理（创建、查询、路径查找、网络统计）
- ✅ 师徒系统（创建、进度更新、统计、报告）
- ✅ 完整集成流程（配置初始化）

## 最佳实践

1. **组织结构设计**
   - 按业务逻辑划分组织层级
   - 合理设置配额限制
   - 定期清理过期团队

2. **团队管理**
   - 为项目团队设置明确的有效期
   - 定期审查团队成员和资源
   - 使用共享资源提高协作效率

3. **协作关系**
   - 避免循环依赖（特别是 supervisor 关系）
   - 定期更新关系元数据
   - 使用协作路径分析团队连接

4. **师徒系统**
   - 设定清晰的培训目标和技能列表
   - 定期更新进度
   - 利用推荐系统匹配合适的师徒

## 完成总结

Phase 4 组织与协作体系已完整实现，包括：

✅ **6个核心模块**（types, organization-system, organization-hierarchy, team-management, collaboration-system, mentor-system）
✅ **1个集成器**（organization-integration）提供 4 种集成方式
✅ **配置验证**（扩展 phase-integration.ts）
✅ **集成测试**（phase4-integration.test.ts）
✅ **完整文档**（本文档）

**代码统计**：

- 核心代码：2,994 行
- 集成器：568 行
- 测试代码：581 行
- **总计**：4,143+ 行

系统已就绪，可以开始使用！
