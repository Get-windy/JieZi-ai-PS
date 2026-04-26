#!/usr/bin/env node

/**
 * 项目初始化与规则生成工具
 * 
 * 功能：
 * 1. 创建新项目时自动生成AI规则文件
 * 2. 根据项目类型生成适配的规则
 * 3. 设置开发环境和工作流
 * 4. 确保AI团队从一开始就遵循规范
 * 
 * 使用方式：
 *   node scripts/init-project.mjs                    # 交互式
 *   node scripts/init-project.mjs --type=web --name=my-app  # 非交互式
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.cwd();

// ============ 项目类型模板 ============

/**
 * 不同项目类型的规则模板
 */
const PROJECT_TEMPLATES = {
  'web-app': {
    name: 'Web应用',
    description: 'React/Vue/Next.js等前端应用',
    structure: {
      directories: ['src/', 'src/components/', 'src/pages/', 'src/hooks/', 'src/utils/', 'tests/', 'docs/'],
      files: ['src/App.tsx', 'src/main.tsx', 'tests/App.test.tsx']
    },
    rules: {
      codeLocation: '所有代码放在 src/ 目录',
      testLocation: '测试放在 tests/ 目录',
      fileNaming: '组件用 PascalCase，hooks用 camelCase',
      importStyle: '使用相对路径导入',
      techStack: 'TypeScript + React/Vue'
    }
  },
  
  'backend-app': {
    name: '后端应用',
    description: 'Node.js/Express/Fastify等后端服务',
    structure: {
      directories: ['src/', 'src/services/', 'src/routes/', 'src/middleware/', 'src/config/', 'tests/', 'docs/'],
      files: ['src/index.ts', 'src/app.ts', 'tests/app.test.ts']
    },
    rules: {
      codeLocation: '所有代码放在 src/ 目录',
      testLocation: '测试放在 tests/ 目录',
      fileNaming: '使用 kebab-case 命名',
      importStyle: '使用相对路径导入',
      techStack: 'TypeScript + Node.js'
    }
  },
  
  'cli-tool': {
    name: 'CLI工具',
    description: '命令行工具',
    structure: {
      directories: ['src/', 'src/commands/', 'src/utils/', 'tests/', 'docs/'],
      files: ['src/index.ts', 'src/cli.ts', 'tests/cli.test.ts']
    },
    rules: {
      codeLocation: '所有代码放在 src/ 目录',
      testLocation: '测试放在 tests/ 目录',
      fileNaming: '使用 kebab-case 命名命令',
      importStyle: '使用相对路径导入',
      techStack: 'TypeScript + Commander'
    }
  },
  
  'library': {
    name: '库/SDK',
    description: '可复用的库或SDK',
    structure: {
      directories: ['src/', 'src/core/', 'src/utils/', 'tests/', 'docs/', 'examples/'],
      files: ['src/index.ts', 'tests/index.test.ts']
    },
    rules: {
      codeLocation: '所有代码放在 src/ 目录',
      testLocation: '测试放在 tests/ 目录',
      fileNaming: '使用 kebab-case 命名',
      importStyle: '使用相对路径导入',
      techStack: 'TypeScript'
    }
  },
  
  'monorepo': {
    name: 'Monorepo',
    description: '多包Monorepo项目',
    structure: {
      directories: ['apps/', 'packages/', 'docs/', 'scripts/'],
      files: ['pnpm-workspace.yaml']
    },
    rules: {
      codeLocation: '应用放在 apps/，共享包放在 packages/',
      testLocation: '每个包内创建 __tests__/ 或 tests/',
      fileNaming: '遵循各包自己的命名约定',
      importStyle: '使用 workspace: 协议导入',
      techStack: 'pnpm workspace'
    }
  },
  
  'python': {
    name: 'Python项目',
    description: 'Python应用或服务',
    structure: {
      directories: ['src/', 'tests/', 'docs/'],
      files: ['pyproject.toml', 'src/__init__.py']
    },
    rules: {
      codeLocation: '所有代码放在 src/ 目录',
      testLocation: '测试放在 tests/ 目录',
      fileNaming: '使用 snake_case 命名',
      importStyle: '使用相对导入',
      techStack: 'Python'
    }
  }
};

// ============ 规则文件生成 ============

/**
 * 生成 CLAUDE.md 文件
 */
function generateClaudeMD(projectType, projectName) {
  const template = PROJECT_TEMPLATES[projectType];
  if (!template) {
    throw new Error(`未知的项目类型: ${projectType}`);
  }

  return `# ${projectName} - AI开发规则

## 🎯 项目信息

- **项目名称**: ${projectName}
- **项目类型**: ${template.name}
- **技术栈**: ${template.rules.techStack}
- **描述**: ${template.description}

## 📁 项目结构

\`\`\`
项目根目录/
${generateProjectTree(template.structure)}
\`\`\`

## 🚫 绝对禁止的行为

1. **❌ 不要把新文件直接放到根目录**
   - 代码文件 → 放到 \`${template.rules.codeLocation}\`
   - 测试文件 → 放到 \`${template.rules.testLocation}\`
   - 文档 → 放到 \`docs/\`

2. **❌ 不要改变项目的命名约定**
   - ${template.rules.fileNaming}

3. **❌ 不要混用不同的代码风格**
   - 保持与现有代码一致的风格

4. **❌ 不要创建不必要的目录层级**
   - 最多 3-4 层深度

## ✅ 必须遵守的行为

### 创建新文件时

1. **确认文件位置**
   - ${template.rules.codeLocation}

2. **使用正确的命名**
   - ${template.rules.fileNaming}

3. **遵循导入约定**
   - ${template.rules.importStyle}

4. **创建对应的测试**
   - ${template.rules.testLocation}

### 开发流程

\`\`\`bash
# 1. 创建功能目录
mkdir -p src/services/my-feature

# 2. 创建代码文件
touch src/services/my-feature/index.ts
touch src/services/my-feature/service.ts

# 3. 创建测试
mkdir -p tests/unit/services/my-feature
touch tests/unit/services/my-feature/service.test.ts

# 4. 验证结构
tree src/services/my-feature
\`\`\`

## 📝 代码规范

### TypeScript 规范

\`\`\`typescript
// ✅ 使用明确的类型
const users: User[] = [];

// ✅ 使用接口定义契约
interface UserService {
  findById(id: string): Promise<User | null>;
}

// ✅ 使用 async/await
async function getUser(id: string): Promise<User> {
  const user = await userRepository.findById(id);
  if (!user) throw new Error('User not found');
  return user;
}
\`\`\`

### 测试规范

\`\`\`typescript
import { describe, it, expect } from 'vitest';

describe('UserService', () => {
  it('should find user by id', async () => {
    // 测试实现
  });
});
\`\`\`

## 🔧 开发工具

### 包管理器
使用 \`pnpm\` 管理依赖

### 构建工具
使用项目配置的构建工具

### 测试框架
运行测试：\`pnpm test\`

### 代码检查
运行检查：\`pnpm lint\`

## 📋 提交前检查清单

- [ ] 代码放在正确的目录
- [ ] 遵循命名约定
- [ ] 创建了测试
- [ ] 运行测试通过
- [ ] 运行代码检查通过
- [ ] 更新了文档（如果需要）

## 💡 快速参考

### 文件位置
- **业务逻辑**: \`${template.rules.codeLocation}\`
- **测试**: \`${template.rules.testLocation}\`
- **文档**: \`docs/\`

### 命名约定
- ${template.rules.fileNaming}

### 导入方式
- ${template.rules.importStyle}

---

**重要**: 你是AI开发者，必须遵守以上规则！
`;
}

/**
 * 生成项目树示例
 */
function generateProjectTree(structure) {
  let tree = '├── src/';
  
  if (structure.directories) {
    structure.directories.forEach((dir, index) => {
      if (dir === 'src/' || dir === 'tests/' || dir === 'docs/') return;
      tree += `\n│   ├── ${dir.replace(/\\/g, '')}`;
    });
  }
  
  tree += '\n├── tests/';
  tree += '\n└── docs/';
  
  return tree;
}

/**
 * 生成 .cursorrules 文件
 */
function generateCursorRules(projectType, projectName) {
  const template = PROJECT_TEMPLATES[projectType];
  
  return `# AI代码生成规则
# 项目: ${projectName}
# 类型: ${template.name}

## 🎯 角色

你是一个专业的软件工程师，正在开发 ${projectName} 项目。
**你必须严格遵守项目结构规范。**

## 📁 文件位置指南

### 代码文件
- 位置: ${template.rules.codeLocation}
- 命名: ${template.rules.fileNaming}

### 测试文件
- 位置: ${template.rules.testLocation}
- 命名: 与源码同名，添加 .test 后缀

### 文档
- 位置: docs/
- 命名: kebab-case

## 🚫 禁止行为

1. 不要把新文件放到项目根目录
2. 不要改变命名约定
3. 不要混用代码风格
4. 不要创建过深的目录层级

## ✅ 必须行为

1. 创建文件前确认正确位置
2. 遵循项目的命名约定
3. 保持与现有代码一致
4. 为每个功能创建对应的测试

## 📋 快速决策

\`\`\`
这个文件是什么类型？
│
├─ 业务逻辑？ → ${template.rules.codeLocation}
├─ 测试？ → ${template.rules.testLocation}
├─ 文档？ → docs/
└─ 配置？ → src/config/ 或根目录（如果是项目配置）
\`\`\`

## 💡 示例

\`\`\`bash
# ✅ 正确：创建服务
mkdir -p src/services
touch src/services/user-service.ts

# ✅ 正确：创建测试
mkdir -p tests/unit/services
touch tests/unit/services/user-service.test.ts

# ❌ 错误：不要放到根目录
touch user-service.ts  # 错误！
\`\`\`
`;
}

/**
 * 生成 .project-structure-rules.md 文件
 */
function generateStructureRules(projectType, projectName) {
  const template = PROJECT_TEMPLATES[projectType];
  
  return `# ${projectName} - 项目结构规范

## 🎯 目的

本文件定义 ${projectName} 项目的目录结构规范。

**所有新文件必须遵循本规范！**

## 📁 标准目录结构

\`\`\`
项目根目录/
${generateProjectTree(template.structure)}
\`\`\`

## 📍 文件位置参考

| 文件类型 | 目录 | 示例 |
|---------|------|------|
| 业务代码 | ${template.rules.codeLocation} | src/services/user-service.ts |
| 测试 | ${template.rules.testLocation} | tests/unit/services/user-service.test.ts |
| 文档 | docs/ | docs/guides/setup.md |
| 配置 | 根目录或 src/config/ | package.json, tsconfig.json |

## 🚫 禁止行为

- ❌ 将代码文件放到根目录
- ❌ 创建新的顶级目录
- ❌ 改变命名约定
- ❌ 混用代码风格

## ✅ 正确做法

参考项目中的现有代码结构和命名方式。

---

**适用范围**: 所有新文件和模块
`;
}

// ============ 交互式提问 ============

/**
 * 创建交互式问答
 */
async function prompt(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question}${defaultValue ? ` (默认: ${defaultValue})` : ''}: `, (answer) => {
      rl.close();
      resolve(answer || defaultValue);
    });
  });
}

/**
 * 交互式收集项目信息
 */
async function collectProjectInfo() {
  console.log('🚀 项目初始化向导');
  console.log('=' .repeat(60));
  console.log('');

  // 1. 选择项目类型
  console.log('📦 选择项目类型:');
  const types = Object.entries(PROJECT_TEMPLATES);
  types.forEach(([key, value], index) => {
    console.log(`  ${index + 1}. ${value.name} - ${value.description}`);
  });
  console.log('');

  const typeChoice = await prompt('选择项目类型 (1-6)', '2');
  const projectType = types[parseInt(typeChoice) - 1]?.[0] || 'web-app';

  // 2. 项目名称
  const projectName = await prompt('输入项目名称', 'my-project');

  // 3. 是否生成规则文件
  const generateRules = await prompt('是否生成AI规则文件？(Y/n)', 'Y');

  console.log('');
  console.log('📋 项目信息:');
  console.log(`  名称: ${projectName}`);
  console.log(`  类型: ${PROJECT_TEMPLATES[projectType].name}`);
  console.log(`  生成规则: ${generateRules.toLowerCase() === 'y' ? '是' : '否'}`);
  console.log('');

  const confirmed = await prompt('确认创建？(Y/n)', 'Y');
  
  if (confirmed.toLowerCase() !== 'y') {
    console.log('❌ 取消创建');
    process.exit(0);
  }

  return {
    projectType,
    projectName,
    generateRules: confirmed.toLowerCase() === 'y' && generateRules.toLowerCase() === 'y'
  };
}

// ============ 项目创建 ============

/**
 * 创建项目结构
 */
function createProjectStructure(projectType, projectName) {
  const template = PROJECT_TEMPLATES[projectType];
  
  console.log('📁 创建项目结构...');
  
  // 创建目录
  for (const dir of template.structure.directories) {
    const dirPath = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`  ✓ 创建目录: ${dir}`);
    }
  }

  // 创建占位文件
  for (const file of template.structure.files) {
    const filePath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `// ${projectName} - ${file}\n`, 'utf-8');
      console.log(`  ✓ 创建文件: ${file}`);
    }
  }
}

/**
 * 生成规则文件
 */
function generateRuleFiles(projectType, projectName, shouldGenerate) {
  if (!shouldGenerate) {
    console.log('⏭️  跳过规则文件生成');
    return;
  }

  console.log('📝 生成AI规则文件...');

  // 1. CLAUDE.md
  const claudePath = path.join(ROOT_DIR, 'CLAUDE.md');
  fs.writeFileSync(claudePath, generateClaudeMD(projectType, projectName), 'utf-8');
  console.log('  ✓ 生成 CLAUDE.md');

  // 2. .cursorrules
  const cursorPath = path.join(ROOT_DIR, '.cursorrules');
  fs.writeFileSync(cursorPath, generateCursorRules(projectType, projectName), 'utf-8');
  console.log('  ✓ 生成 .cursorrules');

  // 3. .project-structure-rules.md
  const structurePath = path.join(ROOT_DIR, '.project-structure-rules.md');
  fs.writeFileSync(structurePath, generateStructureRules(projectType, projectName), 'utf-8');
  console.log('  ✓ 生成 .project-structure-rules.md');
}

/**
 * 初始化 package.json（如果没有）
 */
function initializePackageJson(projectName) {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  
  if (!fs.existsSync(pkgPath)) {
    console.log('📦 初始化 package.json...');
    
    const pkg = {
      name: projectName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: '',
      main: 'src/index.ts',
      scripts: {
        dev: 'tsx watch src/index.ts',
        build: 'tsc',
        test: 'vitest',
        lint: 'eslint src/'
      },
      dependencies: {},
      devDependencies: {
        typescript: '^5.0.0',
        tsx: '^4.0.0',
        vitest: '^1.0.0'
      }
    };
    
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log('  ✓ 创建 package.json');
  }
}

// ============ 主函数 ============

/**
 * 主函数
 */
async function main() {
  try {
    // 检查命令行参数
    const args = process.argv.slice(2);
    let projectType = null;
    let projectName = null;

    for (const arg of args) {
      if (arg.startsWith('--type=')) {
        projectType = arg.split('=')[1];
      } else if (arg.startsWith('--name=')) {
        projectName = arg.split('=')[1];
      }
    }

    // 如果没有提供参数，使用交互式
    if (!projectType || !projectName) {
      const info = await collectProjectInfo();
      projectType = info.projectType;
      projectName = info.projectName;
    }

    console.log('');
    console.log(`🚀 开始创建项目: ${projectName}`);
    console.log('');

    // 1. 创建项目结构
    createProjectStructure(projectType, projectName);

    // 2. 初始化 package.json
    initializePackageJson(projectName);

    // 3. 生成规则文件
    const shouldGenerate = !args.includes('--no-rules');
    generateRuleFiles(projectType, projectName, shouldGenerate);

    // 4. 完成
    console.log('');
    console.log('=' .repeat(60));
    console.log('✨ 项目初始化完成！');
    console.log('');
    console.log('📁 项目结构已创建');
    console.log('📝 AI规则文件已生成（如果选择）');
    console.log('');
    console.log('🎯 下一步:');
    console.log('  1. 安装依赖: pnpm install');
    console.log('  2. 开始开发: pnpm dev');
    console.log('  3. 运行测试: pnpm test');
    console.log('');
    console.log('💡 AI团队会自动读取规则文件并遵守规范！');
    console.log('');

  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    process.exit(1);
  }
}

// 运行
main();
