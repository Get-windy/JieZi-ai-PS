# 项目初始化与规则创建技能

## 🎯 目的

当创建新项目时，自动生成AI规则文件，确保AI团队从一开始就遵循规范。

## 📋 触发条件

当执行以下操作时触发：
- 创建新项目
- 初始化新仓库
- 搭建项目脚手架
- 开始新的开发任务

## 🔧 核心能力

### 1. 项目类型识别

在创建项目前，先确定项目类型：

```bash
# 可选的项目类型
- web-app: Web前端应用（React/Vue/Next.js）
- backend-app: 后端服务（Node.js/Express）
- cli-tool: 命令行工具
- library: 可复用的库/SDK
- monorepo: Monorepo项目
- python: Python项目
```

### 2. 自动生成规则文件

**必须创建3个规则文件：**

#### 文件1: CLAUDE.md（主要规则文件）

```bash
# 在项目根目录创建
cat > CLAUDE.md << 'EOF'
# [项目名称] - AI开发规则

## 🎯 项目信息
- 项目名称: [自动填充]
- 项目类型: [自动填充]
- 技术栈: [自动填充]

## 📁 项目结构
[根据项目类型生成]

## 🚫 禁止行为
1. 不要把文件放到根目录
2. 不要改变命名约定
3. 不要混用代码风格

## ✅ 必须行为
1. 遵循项目结构
2. 创建对应的测试
3. 保持代码一致性
EOF
```

#### 文件2: .cursorrules（AI编辑器规则）

```bash
# 在项目根目录创建
cat > .cursorrules << 'EOF'
# AI代码生成规则
# 项目: [项目名称]

## 📁 文件位置指南
- 代码: [根据项目类型]
- 测试: [根据项目类型]
- 文档: docs/

## 🚫 禁止行为
- 不要放到根目录
- 不要改变约定

## ✅ 必须行为
- 遵循项目结构
- 保持一致性
EOF
```

#### 文件3: .project-structure-rules.md（结构规范）

```bash
# 在项目根目录创建
cat > .project-structure-rules.md << 'EOF'
# [项目名称] - 项目结构规范

## 📁 标准目录结构
[根据项目类型生成]

## 📍 文件位置参考
[根据项目类型生成]

## 🚫 禁止行为
- 不要违反结构规范
EOF
```

### 3. 使用项目初始化工具

**推荐方式：使用 init-project.mjs 脚本**

```bash
# 交互式创建
node scripts/init-project.mjs

# 非交互式创建
node scripts/init-project.mjs --type=web-app --name=my-project

# 不生成规则文件
node scripts/init-project.mjs --type=web-app --name=my-project --no-rules
```

## 📝 工作流程

### 步骤1: 确定项目类型

```bash
# 询问用户或使用默认值
echo "选择项目类型:"
echo "1. web-app (Web前端应用)"
echo "2. backend-app (后端服务)"
echo "3. cli-tool (命令行工具)"
echo "4. library (库/SDK)"
echo "5. monorepo (Monorepo)"
echo "6. python (Python项目)"
```

### 步骤2: 创建项目结构

根据项目类型创建目录：

```bash
# Web应用示例
mkdir -p src/components
mkdir -p src/pages
mkdir -p src/hooks
mkdir -p src/utils
mkdir -p tests
mkdir -p docs

# 后端应用示例
mkdir -p src/services
mkdir -p src/routes
mkdir -p src/middleware
mkdir -p src/config
mkdir -p tests
mkdir -p docs
```

### 步骤3: 生成规则文件

```bash
# 使用工具自动生成
node scripts/init-project.mjs --type=<type> --name=<name>

# 或手动创建（如果没有工具）
# 参考下面的模板
```

### 步骤4: 验证规则文件

```bash
# 检查文件是否创建成功
ls -la CLAUDE.md
ls -la .cursorrules
ls -la .project-structure-rules.md

# 检查内容是否正确
cat CLAUDE.md | head -20
```

### 步骤5: 提交到版本控制

```bash
# 添加规则文件
git add CLAUDE.md .cursorrules .project-structure-rules.md

# 提交
git commit -m "chore: 添加AI开发规则文件"
```

## 📋 项目类型模板

### Web应用 (web-app)

```bash
# 目录结构
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── utils/
│   └── App.tsx
├── tests/
├── docs/
└── package.json

# 规则重点
- 组件用 PascalCase
- hooks 用 camelCase
- 代码放在 src/
- 测试放在 tests/
```

### 后端应用 (backend-app)

```bash
# 目录结构
├── src/
│   ├── services/
│   ├── routes/
│   ├── middleware/
│   ├── config/
│   └── index.ts
├── tests/
├── docs/
└── package.json

# 规则重点
- 使用 kebab-case 命名
- 代码放在 src/
- 测试放在 tests/
- 遵循 RESTful 规范
```

### CLI工具 (cli-tool)

```bash
# 目录结构
├── src/
│   ├── commands/
│   ├── utils/
│   └── cli.ts
├── tests/
├── docs/
└── package.json

# 规则重点
- 命令用 kebab-case
- 代码放在 src/
- 测试放在 tests/
- 遵循 CLI 规范
```

### 库/SDK (library)

```bash
# 目录结构
├── src/
│   ├── core/
│   ├── utils/
│   └── index.ts
├── tests/
├── docs/
├── examples/
└── package.json

# 规则重点
- 代码放在 src/
- 提供完整的类型定义
- 包含使用示例
- 详细的文档
```

### Monorepo (monorepo)

```bash
# 目录结构
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── shared/
│   └── ui/
├── docs/
├── scripts/
└── pnpm-workspace.yaml

# 规则重点
- 应用放在 apps/
- 共享包放在 packages/
- 使用 workspace: 协议
- 每个包独立测试
```

### Python项目 (python)

```bash
# 目录结构
├── src/
│   └── package_name/
│       ├── __init__.py
│       ├── models.py
│       └── services.py
├── tests/
├── docs/
└── pyproject.toml

# 规则重点
- 使用 snake_case
- 代码放在 src/
- 测试放在 tests/
- 遵循 PEP 8
```

## 💡 最佳实践

### 1. 项目创建时立即生成规则

```bash
# ✅ 好的做法：创建项目时一起生成规则
mkdir my-project
cd my-project
node scripts/init-project.mjs --type=web-app --name=my-project

# ❌ 坏的做法：忘记生成规则
mkdir my-project
cd my-project
# 开始写代码... 但没有规则文件！
```

### 2. 规则要具体明确

```bash
# ✅ 好的规则：具体明确
"代码文件放在 src/ 目录"
"使用 kebab-case 命名"
"测试放在 tests/ 目录"

# ❌ 坏的规则：模糊不清
"保持代码整洁"
"遵循最佳实践"
"合理组织代码"
```

### 3. 规则要可执行

```bash
# ✅ 可执行的规则
"不要将文件放到根目录"
"每个函数必须有测试"
"使用 TypeScript strict 模式"

# ❌ 不可执行的规则
"写好代码"
"注意质量"
"保持规范"
```

### 4. 规则要易于遵循

```bash
# ✅ 易于遵循的规则
# 提供具体的目录路径
"业务逻辑 → src/services/"
"测试 → tests/unit/services/"

# ❌ 难以遵循的规则
# 没有具体指导
"合理组织代码"
"放到合适的地方"
```

## 🚨 常见错误

### 错误1: 忘记创建规则文件

```bash
# ❌ 错误：直接开始开发
mkdir my-project
cd my-project
# 开始写代码...

# ✅ 正确：先创建规则
mkdir my-project
cd my-project
node scripts/init-project.mjs
# 然后开始开发
```

### 错误2: 规则过于通用

```bash
# ❌ 错误：通用规则
"遵循最佳实践"
"保持代码整洁"

# ✅ 正确：具体规则
"代码放在 src/ 目录"
"使用 kebab-case 命名"
"测试放在 tests/ 目录"
```

### 错误3: 规则与实际不符

```bash
# ❌ 错误：规则说一套，实际做一套
# 规则说: "使用 TypeScript"
# 实际: 写了 JavaScript

# ✅ 正确：规则与实际一致
# 规则说: "使用 TypeScript"
# 实际: 全部使用 TypeScript
```

## 📌 检查清单

创建项目时，必须完成：

- [ ] 确定项目类型
- [ ] 创建项目结构
- [ ] 生成 CLAUDE.md
- [ ] 生成 .cursorrules
- [ ] 生成 .project-structure-rules.md
- [ ] 验证规则文件内容
- [ ] 提交到版本控制
- [ ] 告知团队规则位置

## 🎓 AI学习要点

### AI必须掌握的能力

1. **识别项目类型**
   - 根据项目特征判断类型
   - 不确定时询问用户

2. **生成适配的规则**
   - 根据项目类型生成规则
   - 不要使用通用模板

3. **创建完整的规则文件**
   - 必须创建3个文件
   - 内容要具体明确

4. **持续遵循规则**
   - 开发过程中遵守规则
   - 不要忘记或忽略规则

### AI不应该做的

1. ❌ 不要假设项目结构
2. ❌ 不要使用通用规则
3. ❌ 不要忘记创建规则文件
4. ❌ 不要创建与实际不符的规则

## 💻 自动化脚本

### 完整的项目创建流程

```bash
#!/bin/bash

# 项目初始化脚本
PROJECT_NAME=$1
PROJECT_TYPE=$2

if [ -z "$PROJECT_NAME" ] || [ -z "$PROJECT_TYPE" ]; then
  echo "用法: ./init.sh <项目名称> <项目类型>"
  echo "项目类型: web-app, backend-app, cli-tool, library, monorepo, python"
  exit 1
fi

# 创建项目目录
mkdir -p $PROJECT_NAME
cd $PROJECT_NAME

# 生成规则文件
node scripts/init-project.mjs --type=$PROJECT_TYPE --name=$PROJECT_NAME

# 初始化 git
git init
git add .
git commit -m "feat: 初始化项目"

echo "✨ 项目初始化完成！"
echo "📁 目录: $(pwd)"
echo "📝 规则文件: CLAUDE.md, .cursorrules, .project-structure-rules.md"
```

## 📚 相关资源

- [自适应开发技能](../adaptive-development/SKILL.md) - 如何适应不同项目
- [依赖管理技能](../dependency-check/SKILL.md) - 依赖检查规范
- [项目分析工具](../../scripts/analyze-project.mjs) - 自动分析项目结构

---

**记住：每个项目都应该有规则文件，从第一天开始！**
