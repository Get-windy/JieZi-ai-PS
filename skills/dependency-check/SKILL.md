# 依赖管理检查技能

AI团队在开发软件时，自动检查和修复依赖问题的技能。

## 触发条件

当AI执行以下操作时自动触发：
- 创建新的模块/包
- 修改 package.json
- 添加新的依赖
- 准备打包/构建
- 模块启动失败

## 核心能力

### 1. 依赖版本冲突检测

```bash
# 检查所有模块的依赖版本是否一致
node scripts/check-dependency-versions.mjs
```

**AI应该：**
1. 在添加依赖后立即检查
2. 发现版本不一致时警告用户
3. 建议统一的版本

### 2. 循环依赖检测

```bash
# 检测模块间是否存在循环依赖
npx madge --circular src/
```

**AI应该：**
1. 在创建模块依赖关系时检查
2. 发现循环依赖时立即重构
3. 使用依赖注入模式解耦

### 3. 启动顺序验证

```bash
# 验证模块启动顺序是否正确
node src/infra/module-dependency-manager.ts
```

**AI应该：**
1. 定义清晰的模块依赖关系
2. 按拓扑排序顺序启动
3. 启动前验证所有依赖已就绪

### 4. 打包前完整性检查

在打包前必须检查：
- [ ] 所有依赖版本一致
- [ ] 无循环依赖
- [ ] 启动顺序正确
- [ ] package.json 格式正确
- [ ] pnpm-lock.yaml 已更新

## 使用示例

### 场景1: AI添加新依赖时

```typescript
// ❌ 错误做法：直接添加依赖
{
  "dependencies": {
    "express": "^4.18.2"  // 可能与其他模块版本不同
  }
}

// ✅ 正确做法：先检查现有版本
// 1. 检查根目录使用的版本
// 2. 使用 workspace: 协议或相同版本
{
  "dependencies": {
    "express": "workspace:*"  // 使用共享版本
  }
}
```

### 场景2: AI创建新模块时

```typescript
// 1. 定义模块元数据和依赖关系
const moduleMetadata = {
  id: "my-new-module",
  name: "我的新模块",
  position: "service",  // 明确层级
  dependencies: [
    { moduleName: "database", type: "required" },
    { moduleName: "cache", type: "optional" }
  ]
};

// 2. 注册到依赖管理器
manager.registerModule(moduleMetadata);

// 3. 验证依赖关系
const validation = manager.validateStartup();
if (!validation.valid) {
  console.error("依赖验证失败:", validation.errors);
  // 修复问题后再继续
}

// 4. 按正确顺序启动
const startupOrder = manager.topologicalSort();
for (const moduleId of startupOrder) {
  await startModule(moduleId);
}
```

### 场景3: AI遇到启动失败时

```bash
# 诊断步骤：

# 1. 检查依赖版本冲突
pnpm check:dep-versions

# 2. 检查循环依赖
pnpm check:module-deps:circular

# 3. 查看启动顺序
pnpm check:module-deps:order

# 4. 自动修复
pnpm check:dep-versions:fix
pnpm install

# 5. 重新构建
pnpm build
```

## 最佳实践规则

### 规则1: 依赖版本统一

```yaml
# ✅ 使用 pnpm overrides 强制统一版本
overrides:
  express: "^4.18.2"
  typescript: "^5.0.0"
```

### 规则2: 明确模块层级

```
核心层 (core)
  ↓
基础设施层 (infrastructure)
  ↓
服务层 (service)
  ↓
应用层 (application)
  ↓
插件层 (plugin)
```

**高层可以依赖低层，低层不能依赖高层**

### 规则3: 使用 workspace 协议

```json
{
  "dependencies": {
    "zod": "workspace:*",     // ✅ 使用工作区版本
    "express": "^4.18.2"      // ❌ 硬编码版本
  }
}
```

### 规则4: 提交前检查

AI在提交代码前必须：
1. 运行 `pnpm check:dep-versions`
2. 运行 `pnpm check:module-deps`
3. 确保所有检查通过
4. 提交 pnpm-lock.yaml

## 自动修复策略

当AI发现问题时：

1. **版本冲突** → 使用最新版本或 overrides
2. **循环依赖** → 引入中间层解耦
3. **启动顺序错误** → 使用拓扑排序
4. **缺失依赖** → 添加到 package.json

## 集成到开发流程

```yaml
# AI开发工作流

1. 创建模块
   ↓
2. 定义依赖关系
   ↓
3. 运行检查工具 ← 自动
   ↓
4. 修复问题（如果有）
   ↓
5. 编写代码
   ↓
6. 本地测试
   ↓
7. 再次检查依赖 ← 自动
   ↓
8. 提交代码
```

## 常见错误和解决方案

### 错误1: "Cannot find module 'xxx'"

**原因**: 依赖未安装或版本不对
**解决**: 
```bash
pnpm install
pnpm check:dep-versions
```

### 错误2: "Circular dependency detected"

**原因**: 模块A依赖B，B又依赖A
**解决**:
1. 运行 `pnpm check:module-deps:circular`
2. 识别循环链
3. 引入事件总线或中间层解耦

### 错误3: "Module startup failed"

**原因**: 启动顺序错误或依赖未就绪
**解决**:
```bash
# 查看正确的启动顺序
pnpm check:module-deps:order

# 验证依赖是否满足
node src/infra/startup-validator.ts
```

### 错误4: "Duplicate dependencies in bundle"

**原因**: 多个版本被打包
**解决**:
```bash
# 统一版本
pnpm check:dep-versions:fix
pnpm install
```

## AI检查清单

每次开发完成后，AI应该自动检查：

- [ ] 所有依赖版本一致 (`pnpm check:dep-versions`)
- [ ] 无循环依赖 (`pnpm check:module-deps:circular`)
- [ ] 启动顺序正确 (`pnpm check:module-deps:order`)
- [ ] 模块层级合理 (遵循分层架构)
- [ ] pnpm-lock.yaml 已更新
- [ ] 构建成功 (`pnpm build`)
- [ ] 启动成功 (`pnpm start`)

## 工具命令速查

```bash
# 检查类
pnpm check:dep-versions              # 依赖版本检查
pnpm check:module-deps               # 模块依赖验证
pnpm check:module-deps:circular      # 循环依赖检测
pnpm check:module-deps:order         # 启动顺序查看

# 修复类
pnpm check:dep-versions:fix          # 自动修复版本冲突
pnpm check:root-directory:fix        # 清理根目录

# 构建类
pnpm install                         # 安装依赖
pnpm build                           # 构建项目
pnpm start                           # 启动项目
```
