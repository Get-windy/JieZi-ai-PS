# CLAUDE.md - AI团队开发规则文件

## 🎯 项目上下文

这是一个AI团队开发的软件项目。你是AI开发者，负责创建代码、模块和功能。

**重要：你必须严格遵守以下规则，不要自行改变项目结构！**

## 📁 项目结构规则（必须遵守）

### ❌ 错误做法：把所有东西放到根目录

```
项目根目录/
├── module1.js        ❌ 不应该在根目录
├── module2.js        ❌ 不应该在根目录
├── utils.js          ❌ 不应该在根目录
├── config.json       ❌ 不应该在根目录
├── test1.js          ❌ 不应该在根目录
├── styles.css        ❌ 不应该在根目录
└── ...               ❌ 根目录混乱
```

### ✅ 正确做法：按功能分层组织

```
项目根目录/
├── 📄 项目元数据（必需）
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── 📦 源代码
│   ├── src/
│   │   ├── core/              # 核心业务逻辑
│   │   ├── services/          # 服务层
│   │   ├── utils/             # 工具函数
│   │   ├── config/            # 配置文件
│   │   └── types/             # 类型定义
│   │
│   ├── components/            # UI组件
│   │   ├── common/
│   │   └── feature-specific/
│   │
│   └── api/                   # API路由和处理器
│       ├── routes/
│       └── middleware/
│
├── 🧪 测试
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── e2e/
│
├── 📚 文档
│   └── docs/
│       ├── architecture/
│       ├── guides/
│       └── api/
│
├── 🛠️ 脚本和工具
│   └── scripts/
│       ├── build/
│       ├── deploy/
│       └── maintenance/
│
├── 🎨 静态资源
│   └── assets/
│       ├── images/
│       ├── styles/
│       └── fonts/
│
└── ⚙️ 配置文件
    ├── .env.example
    ├── .eslintrc.js
    └── .prettierrc
```

## 🚫 禁止行为

**你必须遵守以下规则：**

1. **❌ 不要把新文件直接放到根目录**
   - 代码文件 → 放到 `src/` 或对应的功能目录
   - 测试文件 → 放到 `tests/`
   - 文档 → 放到 `docs/`
   - 脚本 → 放到 `scripts/`

2. **❌ 不要创建新的目录层级**
   - 使用现有的目录结构
   - 如果确实需要新目录，先询问用户

3. **❌ 不要混合不同类型的文件**
   - 工具函数放在 `src/utils/`，不要和组件混在一起
   - 配置文件放在 `src/config/`，不要和业务逻辑混在一起
   - 类型定义放在 `src/types/`，不要和使用处混在一起

4. **❌ 不要创建过深的嵌套**
   - 最多 3-4 层目录深度
   - 如果嵌套太深，考虑重构

## ✅ 必须行为

**在创建新文件时：**

1. **先检查目录结构**
   ```bash
   # 查看现有结构
   tree -L 3 或 ls -la
   ```

2. **选择合适的目录**
   - 业务逻辑 → `src/core/` 或 `src/services/`
   - 工具函数 → `src/utils/`
   - 配置 → `src/config/`
   - 类型 → `src/types/`
   - 组件 → `components/`
   - 测试 → `tests/`

3. **使用一致的命名**
   - 文件命名：kebab-case（`user-service.ts`）
   - 组件命名：PascalCase（`UserProfile.tsx`）
   - 工具函数：camelCase（`formatDate.ts`）

4. **创建后验证**
   ```bash
   # 确认文件在正确位置
   git status
   ```

## 📋 开发流程

### 创建新模块时

```bash
# 1. 创建模块目录（在 src/ 下，不是根目录！）
mkdir -p src/services/my-new-module

# 2. 创建模块文件
touch src/services/my-new-module/index.ts
touch src/services/my-new-module/types.ts
touch src/services/my-new-module/service.ts

# 3. 创建测试（在 tests/ 下）
mkdir -p tests/unit/my-new-module
touch tests/unit/my-new-module/service.test.ts

# 4. 验证结构正确
tree src/services/my-new-module
```

### 添加工具函数时

```bash
# ❌ 错误：创建在根目录
touch utils.js

# ✅ 正确：放在 src/utils/
touch src/utils/format.ts
touch src/utils/validators.ts
```

### 添加配置文件时

```bash
# ❌ 错误：创建在根目录
touch config.json

# ✅ 正确：放在 src/config/
touch src/config/database.ts
touch src/config/cache.ts
```

### 创建测试时

```bash
# ❌ 错误：和源码混在一起
touch src/services/user-service.test.ts

# ✅ 正确：放在 tests/ 目录
touch tests/unit/services/user-service.test.ts
```

## 🏗️ 架构分层

**遵循这个层级结构：**

```
应用层 (Application)
  ↓ 依赖
服务层 (Services)
  ↓ 依赖
核心层 (Core)
  ↓ 依赖
工具层 (Utils)
```

**规则：**
- 高层可以依赖低层
- 低层**不能**依赖高层
- 同层之间可以互相依赖

**示例：**

```typescript
// ✅ 正确：服务层依赖核心层
import { User } from '../core/user';  // 核心层
import { Database } from '../utils/db'; // 工具层

export class UserService {
  // 服务层实现
}

// ❌ 错误：核心层依赖服务层
import { UserService } from '../services/user-service'; // 不允许！

export class User {
  // 核心层不应该依赖服务层
}
```

## 🔍 依赖管理

### 添加新依赖时

```bash
# 1. 检查是否已有类似功能的依赖
cat package.json | grep "关键字"

# 2. 添加到正确的包（根目录或子包）
pnpm add <package-name>

# 3. 更新类型定义
pnpm add -D @types/<package-name>

# 4. 运行依赖检查
pnpm ai:dependency-check
```

### 版本冲突处理

```bash
# 如果发现版本冲突
pnpm check:dep-versions

# 自动修复
pnpm check:dep-versions:fix

# 重新安装
pnpm install
```

## 🧪 测试规范

### 测试文件位置

```
tests/
├── unit/              # 单元测试
│   ├── services/
│   ├── utils/
│   └── core/
├── integration/       # 集成测试
│   └── api/
└── e2e/              # 端到端测试
    └── flows/
```

### 测试命名规范

```typescript
// 文件：tests/unit/services/user-service.test.ts

describe('UserService', () => {
  it('should create user with valid data', () => {
    // 测试实现
  });

  it('should throw error when email is invalid', () => {
    // 测试实现
  });
});
```

## 📝 代码风格

### TypeScript 规范

```typescript
// ✅ 使用明确的类型
const users: User[] = [];

// ✅ 使用接口定义契约
interface UserService {
  createUser(data: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
}

// ✅ 使用 async/await
async function getUser(id: string): Promise<User> {
  const user = await userRepository.findById(id);
  if (!user) throw new Error('User not found');
  return user;
}

// ❌ 避免使用 any
function process(data: any) { } // 不好！

// ✅ 使用联合类型
type Status = 'pending' | 'active' | 'suspended';
```

### 文件组织

```typescript
// 文件顶部：导入
import { Something } from 'library';
import { LocalThing } from '../local';

// 常量定义
const MAX_RETRIES = 3;

// 类型定义
interface Config {
  // ...
}

// 主要实现
export class Service {
  // ...
}

// 辅助函数
function helper() {
  // ...
}
```

## 🚨 常见错误

### 错误1：文件放错位置

```bash
# ❌ 错误：工具函数放到根目录
touch my-utils.js

# ✅ 正确
touch src/utils/my-utils.ts
```

### 错误2：测试和源码混在一起

```bash
# ❌ 错误
touch src/services/user.test.ts

# ✅ 正确
touch tests/unit/services/user.test.ts
```

### 错误3：配置文件散乱

```bash
# ❌ 错误：到处都有配置
touch config.json
touch settings.json
touch .env

# ✅ 正确：统一放到 src/config/
touch src/config/app.ts
```

### 错误4：文档到处乱放

```bash
# ❌ 错误
touch HOW_TO_USE.txt
touch API_NOTES.md

# ✅ 正确：统一放到 docs/
touch docs/guides/getting-started.md
touch docs/api/users.md
```

## 🛠️ 自动检查工具

**在提交代码前，必须运行：**

```bash
# 1. 检查依赖
pnpm ai:dependency-check

# 2. 检查代码质量
pnpm lint

# 3. 运行测试
pnpm test

# 4. 检查根目录整洁性
pnpm check:root-directory
```

## 💡 最佳实践示例

### 创建完整的用户模块

```bash
# 1. 创建模块结构（在 src/ 下！）
mkdir -p src/services/users
touch src/services/users/index.ts
touch src/services/users/user-service.ts
touch src/services/users/user-types.ts
touch src/services/users/user-validation.ts

# 2. 创建测试（在 tests/ 下！）
mkdir -p tests/unit/services/users
touch tests/unit/services/users/user-service.test.ts

# 3. 创建API路由（如果需要）
mkdir -p src/api/routes
touch src/api/routes/users.ts

# 4. 验证结构
tree src/services/users
tree tests/unit/services/users
```

**最终结构：**

```
src/
└── services/
    └── users/
        ├── index.ts              # 导出
        ├── user-service.ts       # 服务实现
        ├── user-types.ts         # 类型定义
        └── user-validation.ts    # 验证逻辑

tests/
└── unit/
    └── services/
        └── users/
            └── user-service.test.ts  # 测试
```

## 📌 总结

### 核心原则

1. **根目录只保留项目元数据和配置文件**
2. **所有代码放到 `src/` 或功能目录**
3. **测试统一放到 `tests/`**
4. **文档统一放到 `docs/`**
5. **脚本统一放到 `scripts/`**
6. **遵循分层架构，不要破坏依赖关系**

### 快速检查清单

在创建文件前问自己：
- [ ] 这个文件应该放在哪个目录？
- [ ] 是否遵循分层架构？
- [ ] 命名是否符合规范？
- [ ] 是否需要创建对应的测试？
- [ ] 是否需要更新文档？

**记住：良好的项目结构让代码更易维护、更易协作！**
