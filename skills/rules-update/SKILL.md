# AI规则更新技能

## 🎯 目的

当项目变化时，更新AI规则文件以保持与项目实际状态一致。

## 📋 触发条件

当以下情况发生时触发：
- 项目技术栈变更
- 项目结构调整
- 开发规范变更
- 添加新的开发要求
- 发现规则与实际不符

## 🔧 核心能力

### 1. 检查规则文件状态

```bash
# 检查规则文件是否存在
node scripts/update-rules.mjs --status

# 查看版本信息
node scripts/update-rules.mjs --version
```

### 2. 更新规则文件

#### 方式1: 交互式更新

```bash
node scripts/update-rules.mjs

# 按提示操作：
# 1. 选择更新类型
# 2. 输入更新内容
# 3. 确认更新
```

#### 方式2: 命令行更新

```bash
# 更新项目信息
node scripts/update-rules.mjs --name=新项目名称 --type=新类型 --tech=新技术栈

# 添加新规则
node scripts/update-rules.mjs --add="新规则内容" --desc="更新说明"

# 添加禁止行为
node scripts/update-rules.mjs --prohibit="不要做XXX" --desc="添加禁止行为"

# 添加必须行为
node scripts/update-rules.mjs --require="必须做XXX" --desc="添加必须行为"

# 完整更新
node scripts/update-rules.mjs \
  --name=项目名称 \
  --type=项目类型 \
  --tech=技术栈 \
  --add="新规则" \
  --desc="完整更新"
```

### 3. 手动编辑规则文件

如果更新工具不满足需求，可以直接编辑：

```bash
# 编辑 CLAUDE.md
code CLAUDE.md  # 或使用任何编辑器

# 编辑 .cursorrules
code .cursorrules

# 编辑 .project-structure-rules.md
code .project-structure-rules.md
```

## 📝 更新场景

### 场景1: 项目技术栈变更

**触发：**
- 从 JavaScript 迁移到 TypeScript
- 从 React 迁移到 Vue
- 添加新的框架或库

**操作：**

```bash
# 更新技术栈信息
node scripts/update-rules.mjs \
  --tech="TypeScript + React 18 + Next.js 14" \
  --desc="技术栈升级到TypeScript和React 18"

# 手动更新 CLAUDE.md 中的相关章节
# 1. 更新技术栈部分
# 2. 更新代码示例
# 3. 更新开发规范
```

### 场景2: 项目结构调整

**触发：**
- 添加新的目录
- 重命名目录
- 改变文件组织方式

**操作：**

```bash
# 添加新规则
node scripts/update-rules.mjs \
  --add="## 新功能模块目录结构

新功能模块放在 src/features/ 目录下:

\`\`\`bash
mkdir -p src/features/feature-name
touch src/features/feature-name/index.ts
touch src/features/feature-name/service.ts
touch src/features/feature-name/types.ts
\`\`\`
" \
  --desc="添加新功能模块目录结构规则"
```

### 场景3: 开发规范变更

**触发：**
- 改变命名约定
- 改变代码风格
- 添加新的代码审查要求

**操作：**

```bash
# 添加必须行为
node scripts/update-rules.mjs \
  --require="## 命名规范更新

所有文件必须使用 kebab-case 命名:
- ✅ user-service.ts
- ✅ order-controller.ts
- ❌ UserService.ts
- ❌ orderController.ts
" \
  --desc="统一命名规范为kebab-case"
```

### 场景4: 添加新的禁止行为

**触发：**
- 发现常见的错误做法
- 需要明确禁止某些行为

**操作：**

```bash
# 添加禁止行为
node scripts/update-rules.mjs \
  --prohibit="## 新增禁止行为

10. **❌ 不要在代码中硬编码配置**
   - 使用环境变量
   - 使用配置文件
   - 不要写死值
" \
  --desc="添加禁止硬编码配置的规则"
```

### 场景5: 添加新的必须行为

**触发：**
- 发现遗漏的重要规范
- 需要强制某些做法

**操作：**

```bash
# 添加必须行为
node scripts/update-rules.mjs \
  --require="## 新增必须行为

8. **✅ 每个API端点必须有错误处理**
   - 使用 try-catch
   - 返回适当的错误响应
   - 记录错误日志
" \
  --desc="添加API错误处理要求"
```

## 🔄 更新工作流

### 标准更新流程

```bash
# 1. 检查当前状态
node scripts/update-rules.mjs --status

# 2. 查看版本信息
node scripts/update-rules.mjs --version

# 3. 执行更新
node scripts/update-rules.mjs --name=... --type=... --add=...

# 4. 验证更新
cat CLAUDE.md | grep -A 5 "新增"

# 5. 提交变更
git add CLAUDE.md .cursorrules .project-structure-rules.md RULES_CHANGELOG.md
git commit -m "docs: 更新AI规则文件"
```

### 定期审查流程

```bash
# 每月审查规则
# 1. 检查规则是否与实际一致
cat CLAUDE.md

# 2. 运行项目分析
node scripts/analyze-project.mjs

# 3. 对比规则与实际
# - 规则说放在 src/，实际是否如此？
# - 规则说用 kebab-case，实际是否一致？

# 4. 更新不一致的地方
node scripts/update-rules.mjs --add="..." --desc="定期审查更新"
```

## 💡 最佳实践

### 1. 保持规则与实际一致

```bash
# ✅ 好的做法：定期检查和更新
# 每月审查规则，确保与实际一致

# ❌ 坏的做法：规则过时不更新
# 规则说用JavaScript，实际已迁移到TypeScript
```

### 2. 记录变更原因

```bash
# ✅ 好的做法：提供详细的更新说明
node scripts/update-rules.mjs \
  --add="..." \
  --desc="迁移到TypeScript，更新所有相关规则"

# ❌ 坏的做法：不写更新说明
node scripts/update-rules.mjs --add="..."
```

### 3. 小步更新

```bash
# ✅ 好的做法：每次更新一个主题
node scripts/update-rules.mjs --add="命名规范" --desc="更新命名规范"
node scripts/update-rules.mjs --prohibit="禁止硬编码" --desc="添加禁止规则"

# ❌ 坏的做法：一次性更新所有内容
# 难以追踪变更和回滚
```

### 4. 审查变更日志

```bash
# 查看变更历史
cat RULES_CHANGELOG.md

# 了解规则演进过程
# 确认变更是否合理
```

## 🚨 常见错误

### 错误1: 规则过时不更新

```bash
# ❌ 错误：项目已迁移到TypeScript，但规则还说用JavaScript
# CLAUDE.md: "使用JavaScript开发"
# 实际项目: 全部使用TypeScript

# ✅ 正确：及时更新规则
node scripts/update-rules.mjs \
  --tech="TypeScript" \
  --desc="项目已迁移到TypeScript"
```

### 错误2: 规则过于严格

```bash
# ❌ 错误：禁止所有默认导出（但Next.js页面必须用）
"❌ 不要使用默认导出"

# ✅ 正确：合理的规则
"❌ 不要在组件中使用默认导出，Next.js页面除外"
```

### 错误3: 规则过于宽松

```bash
# ❌ 错误：没有具体指导
"保持代码整洁"

# ✅ 正确：具体的规则
"每个文件最多200行代码"
"每个函数最多20行代码"
```

## 📋 更新检查清单

在更新规则前，确认：

- [ ] 已检查规则文件状态
- [ ] 已确认需要更新的内容
- [ ] 已准备好更新说明
- [ ] 已备份现有规则（如果需要）
- [ ] 了解更新后的影响

更新后，确认：

- [ ] 规则文件语法正确
- [ ] 更新内容清晰明确
- [ ] 变更日志已更新
- [ ] 已提交到版本控制
- [ ] 已通知团队成员

## 🎓 AI学习要点

### AI必须掌握的能力

1. **识别规则过时的情况**
   - 规则与实际不一致
   - 项目结构变更
   - 技术栈变更

2. **选择合适的更新方式**
   - 使用更新工具
   - 手动编辑
   - 交互式或命令行

3. **编写清晰的规则**
   - 具体明确
   - 可执行
   - 可验证

4. **记录变更原因**
   - 详细的更新说明
   - 更新变更日志
   - 便于后续追踪

### AI不应该做的

1. ❌ 不要使用过时的规则
2. ❌ 不要忽略规则与实际的差异
3. ❌ 不要创建模糊的规则
4. ❌ 不要忘记记录变更

## 💻 自动化示例

### CI/CD 中检查规则一致性

```yaml
# .github/workflows/check-rules.yml
name: Check AI Rules

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check-rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check rules exist
        run: |
          test -f CLAUDE.md || echo "❌ CLAUDE.md missing"
          test -f .cursorrules || echo "❌ .cursorrules missing"
      
      - name: Check rules are up to date
        run: |
          # 检查规则是否与实际一致
          node scripts/analyze-project.mjs
          # 对比分析报告和规则文件
```

### 定期提醒更新

```yaml
# .github/workflows/reminder-rules-update.yml
name: Reminder - Update AI Rules

on:
  schedule:
    - cron: '0 9 1 * *'  # 每月1号9点

jobs:
  reminder:
    runs-on: ubuntu-latest
    steps:
      - name: Create Issue
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '📝 月度AI规则审查',
              body: `
## 任务

审查并更新AI规则文件：

- [ ] 检查 CLAUDE.md 是否与实际一致
- [ ] 检查 .cursorrules 是否与实际一致
- [ ] 检查 .project-structure-rules.md 是否与实际一致
- [ ] 更新变更的规则
- [ ] 更新 RULES_CHANGELOG.md

## 工具

\`\`\`bash
# 检查状态
node scripts/update-rules.mjs --status

# 分析项目
node scripts/analyze-project.mjs

# 更新规则
node scripts/update-rules.mjs --add="..." --desc="..."
\`\`\`
              `
            })
```

## 📚 相关资源

- [项目初始化技能](./project-init-rules/SKILL.md) - 如何创建规则
- [自适应开发技能](./adaptive-development/SKILL.md) - 如何遵循规则
- [规则更新工具](../../scripts/update-rules.mjs) - 更新规则文件
- [项目分析工具](../../scripts/analyze-project.mjs) - 分析项目结构

---

**记住：规则必须保持最新，与实际一致！**
