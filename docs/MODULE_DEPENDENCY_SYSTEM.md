# 模块依赖关系管理系统

## 📋 问题背景

在开发项目时，我们常遇到以下问题：

1. **模块位置不当** - 每个模块单独开发没问题，但组合在一起时位置配置错误
2. **隐式启动顺序** - 模块A需要先于模块B启动，但配置没有体现
3. **循环依赖** - A依赖B，B依赖C，C又依赖A，导致死锁
4. **难以发现** - 开发者本地运行正常，整体启动时失败

## 🎯 解决方案

本系统提供：

- ✅ **自动检测循环依赖**
- ✅ **拓扑排序生成启动顺序**
- ✅ **分层架构管理**（核心层→基础设施→服务→应用→插件）
- ✅ **启动前验证**（失败即阻止启动）
- ✅ **可视化依赖关系图**

## 🚀 快速开始

### 1. 创建配置文件

在项目根目录创建 `.module-deps-config.json`：

```bash
cp .module-deps-config.example.json .module-deps-config.json
```

### 2. 定义模块

编辑配置文件，定义所有模块及其依赖：

```json
{
  "modules": [
    {
      "id": "config-loader",
      "name": "配置加载器",
      "position": "core",
      "modulePath": "src/config/loader.ts",
      "dependencies": [],
      "description": "加载系统配置文件"
    },
    {
      "id": "database",
      "name": "数据库连接",
      "position": "infrastructure",
      "modulePath": "src/infrastructure/database.ts",
      "dependencies": [
        {
          "moduleName": "config-loader",
          "type": "required",
          "description": "需要数据库配置"
        }
      ]
    }
  ]
}
```

### 3. 运行检查

```bash
# 检查循环依赖
npx tsx src/infra/check-module-deps.ts circular

# 生成启动顺序
npx tsx src/infra/check-module-deps.ts order

# 验证配置
npx tsx src/infra/check-module-deps.ts validate

# 导出依赖图
npx tsx src/infra/check-module-deps.ts graph --output deps.json

# 生成可视化
npx tsx src/infra/check-module-deps.ts visualize --output deps.dot
```

## 📚 架构说明

### 模块层级（从底到顶）

```
┌─────────────────────────────────────┐
│         插件层 (plugin)              │
│   飞书插件、微信插件、扩展插件        │
├─────────────────────────────────────┤
│       应用层 (application)           │
│   API网关、CLI、Web界面              │
├─────────────────────────────────────┤
│        服务层 (service)              │
│   认证服务、API服务、业务逻辑         │
├─────────────────────────────────────┤
│     基础设施层 (infrastructure)      │
│   数据库、缓存、消息队列              │
├─────────────────────────────────────┤
│        核心层 (core)                 │
│   配置加载、日志、工具函数            │
└─────────────────────────────────────┘
```

### 依赖规则

1. **核心层** - 无外部依赖
2. **基础设施层** - 只能依赖核心层
3. **服务层** - 可以依赖核心层和基础设施层
4. **应用层** - 可以依赖以上所有层
5. **插件层** - 可以依赖以上所有层

### 依赖类型

- **required** (强依赖) - 必须存在且先启动
- **optional** (弱依赖) - 可选，存在则使用
- **conditional** (条件依赖) - 满足条件时才需要
- **plugin** (插件依赖) - 动态加载的扩展

## 🔧 API 使用

### 编程方式使用

```typescript
import { 
  ModuleDependencyManager,
  ModulePosition,
  DependencyType
} from "./infra/module-dependency-manager.js";
import { validateStartupBeforeBoot } from "./infra/startup-validator.js";

// 方式1: 使用管理器
const manager = new ModuleDependencyManager();

manager.registerModule({
  id: "my-module",
  name: "我的模块",
  position: ModulePosition.SERVICE,
  modulePath: "src/services/my-module.ts",
  dependencies: [
    {
      moduleName: "database",
      type: DependencyType.REQUIRED,
      description: "需要数据库"
    }
  ]
});

// 检测循环依赖
const cycles = manager.detectCircularDependencies();
if (cycles.length > 0) {
  console.error("发现循环依赖:", cycles);
  process.exit(1);
}

// 生成启动顺序
const order = manager.topologicalSort();
console.log("启动顺序:", order);

// 方式2: 使用验证器（推荐）
const result = await validateStartupBeforeBoot({
  configPath: ".module-deps-config.json",
  strict: true,  // 验证失败即退出
  verbose: true  // 输出详细日志
});

if (!result.valid) {
  console.error("启动验证失败:", result.errors);
  process.exit(1);
}

console.log("✅ 可以安全启动系统");
```

### 集成到入口文件

在 `src/entry.ts` 或 `src/index.ts` 中：

```typescript
import { validateStartupBeforeBoot } from "./infra/startup-validator.js";

// 在主入口最前面调用
await validateStartupBeforeBoot({
  configPath: path.join(process.cwd(), ".module-deps-config.json"),
  strict: true,
  verbose: true
});

// 然后再启动主程序
await startMainApplication();
```

## 📊 命令行工具

### 检查循环依赖

```bash
npx tsx src/infra/check-module-deps.ts circular
```

输出示例：

```
🔍 检查循环依赖...

✅ 未检测到循环依赖！
```

### 生成启动顺序

```bash
npx tsx src/infra/check-module-deps.ts order
```

输出示例：

```
📋 生成启动顺序...

✅ 建议的启动顺序:

  1. config-loader [无依赖]
  2. logging [依赖: config-loader]
  3. database [依赖: config-loader, logging]
  4. auth [依赖: database, cache, logging]
  5. gateway [依赖: auth, api]

📁 按层级分组:

  核心层:
    - config-loader
    - logging

  基础设施层:
    - database
    - cache

  服务层:
    - auth
    - api

  应用层:
    - gateway
```

### 验证配置

```bash
npx tsx src/infra/check-module-deps.ts validate
```

### 生成可视化

```bash
# 生成 DOT 文件
npx tsx src/infra/check-module-deps.ts visualize --output deps.dot

# 使用 Graphviz 转换为图片
dot -Tpng deps.dot -o dependency-graph.png
open dependency-graph.png
```

## 🛡️ 最佳实践

### 1. 定义明确的依赖

❌ 错误示例（循环依赖）：

```json
{
  "modules": [
    {
      "id": "auth",
      "dependencies": [{"moduleName": "api", "type": "required"}]
    },
    {
      "id": "api",
      "dependencies": [{"moduleName": "auth", "type": "required"}]
    }
  ]
}
```

✅ 正确示例（单向依赖）：

```json
{
  "modules": [
    {
      "id": "auth",
      "position": "service",
      "dependencies": []
    },
    {
      "id": "api",
      "position": "application",
      "dependencies": [{"moduleName": "auth", "type": "required"}]
    }
  ]
}
```

### 2. 遵循分层架构

- 核心层不应该依赖其他层
- 基础设施层只依赖核心层
- 服务层只依赖核心层和基础设施层

### 3. 使用依赖注入

```typescript
// ❌ 直接实例化依赖
class AuthService {
  private db = new Database(); // 紧耦合
}

// ✅ 依赖注入
class AuthService {
  constructor(private db: Database) {} // 松耦合
}
```

### 4. 定期检查

在 CI/CD 中添加检查：

```yaml
# .github/workflows/ci.yml
- name: Check Module Dependencies
  run: |
    npx tsx src/infra/check-module-deps.ts circular
    npx tsx src/infra/check-module-deps.ts validate
```

## 🐛 常见问题

### Q: 如何修复循环依赖？

**方法1**: 引入中间层

```
A → B → C → A  (循环)

改为：
A → B → C
A → Core ← C  (通过 Core 解耦)
```

**方法2**: 使用事件总线

```typescript
// 不直接调用，而是通过事件
eventBus.emit("user:created", user);
// 其他模块监听事件
eventBus.on("user:created", handler);
```

### Q: 模块太多怎么办？

使用分组和延迟加载：

```json
{
  "modules": [
    {
      "id": "wechat-plugin",
      "lazy": true,  // 延迟加载
      "position": "plugin"
    }
  ]
}
```

### Q: 如何测试启动顺序？

```bash
# 生成测试配置
npx tsx src/infra/check-module-deps.ts order --config test-deps.json

# 验证特定模块
npx tsx src/infra/check-module-deps.ts check-can-start gateway
```

## 📖 参考资料

- [Nx 依赖图](https://nx.dev/core-features/visualize-dependencies)
- [Turborepo 任务依赖](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [依赖注入模式](https://en.wikipedia.org/wiki/Dependency_injection)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 改进依赖管理系统！
