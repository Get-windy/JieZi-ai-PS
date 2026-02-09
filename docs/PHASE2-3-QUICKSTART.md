# Phase 2 & 3 快速开始指南

## 🚀 5分钟快速上手

### 步骤 1: 在应用启动时初始化

在你的主入口文件（如 `src/index.ts` 或 `src/gateway/boot.ts`）中添加：

```typescript
import { loadConfig } from "./config/config.js";
import { initializeAfterConfigLoad } from "./config/phase-integration.js";

// 加载配置
const config = await loadConfig();

// 初始化 Phase 2 & 3 系统（一行代码！）
initializeAfterConfigLoad(config);
```

就这么简单！系统会自动验证配置并初始化所有功能。

---

### 步骤 2: 在消息处理中使用策略检查

#### 方式 A: 使用便捷函数（推荐）

```typescript
import { checkMessagePolicy } from "./channels/policy-integration.js";

// 检查入站消息
const result = await checkMessagePolicy(binding, message, "inbound");
if (!result.allow) {
  console.log(`消息被拒绝: ${result.reason}`);
  return;
}
```

#### 方式 B: 使用中间件

```typescript
import { createPolicyMiddleware } from "./channels/policy-integration.js";

const policyMiddleware = createPolicyMiddleware();

// 在中间件链中使用
app.use(policyMiddleware);
```

---

### 步骤 3: 在工具执行中使用权限检查

#### 方式 A: 使用便捷函数（推荐）

```typescript
import { checkToolPermission } from "./permissions/integration.js";

// 检查工具权限
const result = await checkToolPermission("agent-1", "file_write", { path: "/data/file.txt" });
if (!result.allowed) {
  console.log(`工具执行被拒绝: ${result.reason}`);
  return;
}
```

#### 方式 B: 使用装饰器（最优雅）

```typescript
import { requirePermission } from "./permissions/integration.js";

class MyTools {
  @requirePermission("file_write")
  async writeFile(agentId: string, path: string, content: string) {
    // 权限检查自动完成！
    await fs.writeFile(path, content);
  }
}
```

---

## 📝 配置示例

### 最小配置

```json5
{
  agents: {
    list: [
      {
        id: "my-agent",
        // Phase 2: 通道绑定（可选）
        channelBindings: {
          bindings: [
            {
              id: "wechat-bot",
              channelId: "wechat",
              accountId: "bot-001",
            },
          ],
        },
        // Phase 3: 权限配置（可选）
        permissions: {
          rules: [
            {
              id: "allow-read",
              subject: { type: "agent", id: "my-agent" },
              resource: { type: "tool", id: "file_read" },
              action: "execute",
              effect: "allow",
              priority: 100,
            },
          ],
        },
      },
    ],
  },
}
```

### 完整配置示例

查看 `docs/PHASE2-3-INTEGRATION-GUIDE.md` 中的详细配置示例。

---

## ✅ 检查是否工作

启动应用后，你应该看到以下日志：

```
[Phase Integration] Initializing Phase 2 & 3 systems...
[Phase Integration] Agent my-agent: channel bindings validated
[Phase Integration] Agent my-agent: permissions initialized
[Phase Integration] Phase 2 & 3 systems initialized successfully
```

如果看到这些日志，说明一切正常！ 🎉

---

## 🔍 常见问题

### Q: 我没有配置策略，会有问题吗？

**A**: 不会！未配置策略时，系统默认允许所有消息通过。

### Q: 我没有配置权限，会有问题吗？

**A**: 不会！未配置权限时，系统默认允许所有工具执行。

### Q: 配置验证失败会阻止应用启动吗？

**A**: 不会！配置验证失败只会输出警告日志，不会阻止应用启动。

### Q: 如何调试策略/权限不生效的问题？

**A**: 查看日志输出，所有策略和权限检查都有详细的日志记录。

---

## 📚 进一步学习

- **完整指南**: `docs/PHASE2-3-INTEGRATION-GUIDE.md`
- **完成总结**: `docs/PHASE2-3-INTEGRATION-COMPLETE.md`
- **检查清单**: `docs/PHASE2-3-CHECKLIST.md`

---

## 🎯 最佳实践

1. ✅ 在应用启动时初始化
2. ✅ 使用中间件模式集成到现有管道
3. ✅ 使用装饰器简化权限控制
4. ✅ 查看日志了解执行情况
5. ✅ 从简单配置开始，逐步完善

---

## 🚀 开始使用

现在你已经了解了基础知识，可以开始使用 Phase 2 & 3 的强大功能了！

如果遇到问题，请查看完整的集成指南或检查日志输出。

**祝你使用愉快！** 🎉
