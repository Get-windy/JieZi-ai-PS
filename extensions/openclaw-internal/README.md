# OpenClaw Internal Tools

统一的内部工具注册中心，用于管理我们团队开发的所有自定义工具。

## 📁 目录结构

```
extensions/openclaw-internal/
├── index.ts              # 主插件文件，所有工具在这里注册
├── TOOL_TEMPLATE.ts      # 工具添加模板
└── openclaw.plugin.json  # 插件配置
```

## 🛠️ 工具分类

### 已实现的工具

#### Groups.\* - 群组工作空间管理

- `groups.files.list` - 列出群组工作空间文件
- `groups.files.get` - 读取文件内容
- `groups.files.set` - 写入/创建文件
- `groups.files.delete` - 删除文件
- `groups.workspace.getDir` - 获取工作空间路径

#### Project.\* - 项目管理工具

- `project.create` - 创建新项目
- `project.list` - 列出所有项目

#### Team.\* - 团队协作工具

- `team.notify` - 发送通知给团队成员
- `team.list` - 列出团队成员

#### Task.\* - 任务管理工具

- `task.create` - 创建新任务
- `task.list` - 列出任务

### 计划中的工具类别

- **project.\*** - 项目管理工具
- **team.\*** - 团队协作工具
- **code.\*** - 代码审查和开发工具
- **deploy.\*** - 部署和 DevOps 工具
- **notify.\*** - 通知工具
- **report.\*** - 报告和分析工具

## ➕ 如何添加新工具

### 步骤 1: 复制模板

打开 `TOOL_TEMPLATE.ts`，复制其中一个示例部分。

### 步骤 2: 实现工具逻辑

在 `index.ts` 的 `// ADD YOUR TOOLS ABOVE THIS LINE` 上方粘贴模板并修改：

```typescript
api.registerTool({
  name: "your.tool.name",
  description: "Clear description of what this tool does",
  parameters: Type.Object({
    // Define your parameters
  }),
  async execute(_toolCallId, args) {
    // Your implementation here
    return {
      content: [{ type: "text", text: "Result" }],
    };
  },
});
```

### 步骤 3: 测试工具

重启 Gateway 后，Agent 就可以通过 `tools.catalog` 看到并使用新工具。

## 📝 命名规范

- **使用点号分隔**：`category.action` (如 `project.create`)
- **动词开头**：使用动作词（create, delete, update, list, get）
- **清晰描述**：名称应该一目了然地表达功能
- **避免冲突**：不要与现有核心工具或其他插件工具重名

## 🔧 启用/禁用

在 `~/.openclaw/openclaw.json` 中配置：

```json
{
  "plugins": {
    "entries": {
      "openclaw-internal": {
        "enabled": true // 设置为 false 禁用所有内部工具
      }
    }
  }
}
```

## 💡 最佳实践

1. **错误处理**：始终用 try-catch 包裹执行逻辑
2. **日志记录**：使用 `log.info()` 记录重要操作
3. **参数验证**：使用 Typebox 定义清晰的参数 schema
4. **用户友好**：返回清晰的 success/error 消息
5. **文档完善**：为每个工具提供详细的 description

## 🎯 示例场景

### 场景 1: 创建新项目

```typescript
// 用户说："创建一个新项目叫 PolyVault"
// Agent 调用：project.create({ projectName: "PolyVault" })
```

### 场景 2: 代码审查

```typescript
// 用户说："帮我审查一下这个文件"
// Agent 调用：code.review({ filePath: "src/main.ts" })
```

### 场景 3: 团队通知

```typescript
// 用户说："通知团队成员明天开会"
// Agent 调用：team.notify({ message: "明天开会...", priority: "high" })
```

## 🚀 开发流程

1. **需求分析**：确定工具的功能和参数
2. **实现原型**：在 `index.ts` 中添加基础版本
3. **本地测试**：手动测试工具是否正常工作
4. **文档更新**：更新此文件和模板
5. **团队评审**：确保符合命名和规范
6. **合并上线**：集成到生产环境

## 📞 联系方式

有任何问题或建议，请在团队会议中讨论或联系开发负责人。
