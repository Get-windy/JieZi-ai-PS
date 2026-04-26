# 🚀 模块依赖管理系统 - 快速开始

## 📦 安装完成！

恭喜！你已经拥有了完整的模块依赖管理系统。

## 🎯 5分钟快速上手

### 第1步：复制示例配置

```bash
# 在项目根目录执行
cp .module-deps-config.example.json .module-deps-config.json
```

### 第2步：运行第一个检查

```bash
# 验证配置
pnpm check:module-deps
```

你会看到类似输出：

```
🔍 开始启动前依赖验证...
============================================================
📂 加载配置文件: I:\JieZI\JieZi-ai-PS\.module-deps-config.json
✅ 执行依赖验证...

✅ 配置验证通过！

📊 模块启动依赖图
============================================================

✅ 建议的启动顺序:
  1. config-loader
  2. logging [依赖: config-loader]
  3. utils
  4. database [依赖: config-loader, logging]
  ...
```

### 第3步：检查循环依赖

```bash
# 检测循环依赖
pnpm check:module-deps:circular
```

### 第4步：生成启动顺序

```bash
# 查看建议的启动顺序
pnpm check:module-deps:order
```

## 🛠️ 常用命令

### 基础检查

```bash
# 验证所有依赖配置
pnpm check:module-deps

# 检查循环依赖
pnpm check:module-deps:circular

# 查看启动顺序
pnpm check:module-deps:order
```

### 可视化

```bash
# 导出依赖图（JSON）
pnpm check:module-deps:graph

# 生成 DOT 可视化文件
pnpm check:module-deps:visualize --output deps.dot

# 使用 Graphviz 转换为图片
dot -Tpng deps.dot -o dependency-graph.png
```

## 📝 定义你的模块

编辑 `.module-deps-config.json`，添加你的模块：

```json
{
  "modules": [
    {
      "id": "my-module",
      "name": "我的模块",
      "position": "service",
      "modulePath": "src/my-module.ts",
      "dependencies": [
        {
          "moduleName": "database",
          "type": "required",
          "description": "需要数据库访问"
        }
      ],
      "description": "这是我自己定义的模块",
      "startupTimeout": 30000
    }
  ]
}
```

### 模块位置（position）

选择合适的层级：

- `core` - 核心层（配置、日志、工具）
- `infrastructure` - 基础设施层（数据库、缓存、队列）
- `service` - 服务层（业务逻辑、认证、API）
- `application` - 应用层（网关、CLI、Web界面）
- `plugin` - 插件层（扩展、通道集成）

### 依赖类型（type）

- `required` - 必须存在且先启动
- `optional` - 可选，存在则使用
- `conditional` - 条件依赖
- `plugin` - 插件依赖

## 🔍 实际案例

### 案例1：添加新的通道插件

```json
{
  "id": "dingtalk-plugin",
  "name": "钉钉插件",
  "position": "plugin",
  "modulePath": "src/plugins/dingtalk/index.ts",
  "dependencies": [
    {
      "moduleName": "gateway",
      "type": "required",
      "description": "需要网关"
    },
    {
      "moduleName": "auth",
      "type": "required",
      "description": "需要认证"
    }
  ],
  "description": "钉钉通道集成",
  "version": "1.0.0",
  "owner": "channel-team"
}
```

### 案例2：修复循环依赖

**❌ 错误示例（有循环依赖）**：

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

运行 `pnpm check:module-deps:circular` 会报错：

```
❌ 发现 1 个循环依赖链:
  1. auth -> api -> auth
```

**✅ 修复方法（引入中间层）**：

```json
{
  "modules": [
    {
      "id": "auth",
      "position": "service",
      "dependencies": [
        {"moduleName": "database", "type": "required"}
      ]
    },
    {
      "id": "api",
      "position": "application",
      "dependencies": [
        {"moduleName": "auth", "type": "required"},
        {"moduleName": "database", "type": "required"}
      ]
    },
    {
      "id": "database",
      "position": "infrastructure",
      "dependencies": []
    }
  ]
}
```

## 🤖 集成到 CI/CD

在 `.github/workflows/ci.yml` 中添加：

```yaml
- name: Check Module Dependencies
  run: |
    pnpm check:module-deps
    pnpm check:module-deps:circular
```

这样每次 PR 都会自动检查依赖关系！

## 📊 生成可视化图表

```bash
# 1. 生成 DOT 文件
pnpm check:module-deps:visualize --output deps.dot

# 2. 安装 Graphviz
# macOS: brew install graphviz
# Windows: choco install graphviz
# Linux: apt install graphviz

# 3. 生成图片
dot -Tpng deps.dot -o dependency-graph.png

# 4. 查看
open dependency-graph.png  # macOS
start dependency-graph.png  # Windows
```

## 🎓 学习更多

完整文档：[MODULE_DEPENDENCY_SYSTEM.md](./MODULE_DEPENDENCY_SYSTEM.md)

### 推荐阅读顺序

1. ✅ 快速开始（本文档）
2. 📘 [完整文档](./MODULE_DEPENDENCY_SYSTEM.md) - 深入了解架构
3. 🔧 查看示例配置 - `.module-deps-config.example.json`
4. 🧪 运行测试 - `pnpm test src/infra/module-dependency-manager.test.ts`

## 💡 最佳实践

### 1. 遵循分层架构

```
插件层 → 应用层 → 服务层 → 基础设施层 → 核心层
```

高层可以依赖低层，反之不行。

### 2. 定期检查

```bash
# 添加到开发流程
pnpm check:module-deps
```

### 3. 及时更新配置

每次添加新模块时，同步更新 `.module-deps-config.json`。

### 4. 使用可视化

复杂项目一定要生成依赖图可视化，帮助团队理解架构。

## 🐛 常见问题

### Q: 配置文件在哪里？

A: 项目根目录的 `.module-deps-config.json`

### Q: 如何添加新模块？

A: 在配置文件的 `modules` 数组中添加新对象。

### Q: 循环依赖怎么修复？

A: 
1. 运行 `pnpm check:module-deps:circular` 查看循环链
2. 重构代码，引入中间层
3. 使用依赖注入模式

### Q: 启动顺序可以自定义吗？

A: 可以！在配置文件中定义 `phases` 字段，或让系统自动生成。

## 🎉 开始使用

现在你已经准备好了！运行第一个检查：

```bash
pnpm check:module-deps
```

如果遇到任何问题，查看完整文档或提交 Issue。

祝使用愉快！ 🚀
