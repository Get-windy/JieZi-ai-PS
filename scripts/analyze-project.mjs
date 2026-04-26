#!/usr/bin/env node

/**
 * 项目结构分析工具
 * 
 * 功能：
 * 1. 自动分析项目结构
 * 2. 识别项目类型和约定
 * 3. 生成开发规范建议
 * 4. 给AI团队提供参考
 * 
 * 使用方式：
 *   node scripts/analyze-project.mjs          # 分析当前项目
 *   node scripts/analyze-project.mjs /path     # 分析指定路径
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = process.argv[2] || process.cwd();

// ============ 项目分析 ============

/**
 * 分析项目结构
 */
function analyzeProjectStructure(targetDir) {
  const result = {
    path: targetDir,
    name: path.basename(targetDir),
    type: 'unknown',
    structure: {},
    conventions: {},
    tools: {},
    recommendations: {},
  };

  // 1. 分析目录结构
  result.structure = analyzeDirectories(targetDir);

  // 2. 识别项目类型
  result.type = identifyProjectType(targetDir, result.structure);

  // 3. 分析命名约定
  result.conventions = analyzeConventions(targetDir);

  // 4. 识别工具链
  result.tools = identifyTools(targetDir);

  // 5. 生成建议
  result.recommendations = generateRecommendations(result);

  return result;
}

/**
 * 分析目录结构
 */
function analyzeDirectories(targetDir) {
  const structure = {
    hasSrc: fs.existsSync(path.join(targetDir, 'src')),
    hasTests: false,
    testDir: null,
    hasDocs: fs.existsSync(path.join(targetDir, 'docs')),
    hasScripts: fs.existsSync(path.join(targetDir, 'scripts')),
    hasComponents: fs.existsSync(path.join(targetDir, 'components')),
    hasModules: fs.existsSync(path.join(targetDir, 'modules')),
    hasPackages: fs.existsSync(path.join(targetDir, 'packages')),
    hasApps: fs.existsSync(path.join(targetDir, 'apps')),
    srcStructure: {},
  };

  // 检查测试目录
  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  for (const dir of testDirs) {
    if (fs.existsSync(path.join(targetDir, dir))) {
      structure.hasTests = true;
      structure.testDir = dir;
      break;
    }
  }

  // 分析 src/ 内部结构
  if (structure.hasSrc) {
    const srcDir = path.join(targetDir, 'src');
    try {
      const srcContents = fs.readdirSync(srcDir, { withFileTypes: true });
      
      for (const entry of srcContents) {
        if (entry.isDirectory()) {
          structure.srcStructure[entry.name] = {
            type: 'directory',
            fileCount: countFiles(path.join(srcDir, entry.name), '*.ts') +
                      countFiles(path.join(srcDir, entry.name), '*.js'),
          };
        }
      }
    } catch (error) {
      // 忽略读取错误
    }
  }

  return structure;
}

/**
 * 识别项目类型
 */
function identifyProjectType(targetDir, structure) {
  // Monorepo
  if (structure.hasApps && structure.hasPackages) {
    return 'monorepo';
  }

  // 模块化项目
  if (structure.hasModules) {
    return 'modular';
  }

  // 前端项目
  if (structure.hasComponents && structure.hasSrc) {
    const hasPages = fs.existsSync(path.join(targetDir, 'src', 'pages')) ||
                     fs.existsSync(path.join(targetDir, 'src', 'views'));
    return hasPages ? 'frontend-app' : 'frontend-lib';
  }

  // Node.js后端
  if (structure.hasSrc) {
    const hasControllers = fs.existsSync(path.join(targetDir, 'src', 'controllers')) ||
                          fs.existsSync(path.join(targetDir, 'src', 'routes'));
    return hasControllers ? 'backend-app' : 'backend-lib';
  }

  // CLI工具
  if (fs.existsSync(path.join(targetDir, 'bin')) ||
      fs.existsSync(path.join(targetDir, 'src', 'commands'))) {
    return 'cli-tool';
  }

  // 扁平结构
  const files = fs.readdirSync(targetDir);
  const codeFiles = files.filter(f => /\.(ts|js|py)$/.test(f));
  if (codeFiles.length > 0 && !structure.hasSrc) {
    return 'flat';
  }

  return 'unknown';
}

/**
 * 分析命名约定
 */
function analyzeConventions(targetDir) {
  const conventions = {
    fileNaming: 'unknown',  // kebab-case, camelCase, PascalCase, snake_case
    importStyle: 'unknown', // relative, absolute, alias
    exportStyle: 'unknown', // default, named, mixed
    codeStyle: 'unknown',   // class, function, mixed
  };

  // 分析文件命名风格
  const srcDir = path.join(targetDir, 'src');
  if (fs.existsSync(srcDir)) {
    const files = getAllFiles(srcDir, '*.ts');
    
    if (files.length > 0) {
      const styles = {
        kebab: 0,
        camel: 0,
        pascal: 0,
        snake: 0,
      };

      for (const file of files.slice(0, 20)) {
        const name = path.basename(file).replace(/\.(ts|js|tsx|jsx)$/, '');
        
        if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
          styles.kebab++;
        } else if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {
          styles.camel++;
        } else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
          styles.pascal++;
        } else if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) {
          styles.snake++;
        }
      }

      const maxStyle = Object.entries(styles).reduce((a, b) => a[1] > b[1] ? a : b);
      conventions.fileNaming = maxStyle[1] > 0 ? maxStyle[0] : 'mixed';
    }
  }

  // 分析导入风格
  if (fs.existsSync(srcDir)) {
    const files = getAllFiles(srcDir, '*.ts');
    const imports = {
      relative: 0,
      absolute: 0,
      alias: 0,
    };

    for (const file of files.slice(0, 10)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const importLines = content.match(/import.*from\s+['"].*['"]/g) || [];
        
        for (const line of importLines) {
          if (line.includes("'../") || line.includes("'./") ||
              line.includes('"../') || line.includes('"./')) {
            imports.relative++;
          } else if (line.includes("'@/") || line.includes('"@/')) {
            imports.alias++;
          } else if (!line.includes("node_modules")) {
            imports.absolute++;
          }
        }
      } catch (error) {
        // 忽略读取错误
      }
    }

    const maxImport = Object.entries(imports).reduce((a, b) => a[1] > b[1] ? a : b);
    conventions.importStyle = maxImport[1] > 0 ? maxImport[0] : 'unknown';
  }

  return conventions;
}

/**
 * 识别工具链
 */
function identifyTools(targetDir) {
  const tools = {
    packageManager: 'unknown',
    buildTool: 'unknown',
    testFramework: 'unknown',
    linter: 'unknown',
    formatter: 'unknown',
  };

  // 包管理器
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml'))) {
    tools.packageManager = 'pnpm';
  } else if (fs.existsSync(path.join(targetDir, 'yarn.lock'))) {
    tools.packageManager = 'yarn';
  } else if (fs.existsSync(path.join(targetDir, 'package-lock.json'))) {
    tools.packageManager = 'npm';
  }

  // 构建工具
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = Object.values(pkg.scripts || {}).join(' ');
      
      if (scripts.includes('vite')) tools.buildTool = 'vite';
      else if (scripts.includes('webpack')) tools.buildTool = 'webpack';
      else if (scripts.includes('rollup')) tools.buildTool = 'rollup';
      else if (scripts.includes('tsup')) tools.buildTool = 'tsup';
      else if (scripts.includes('esbuild')) tools.buildTool = 'esbuild';
    } catch (error) {
      // 忽略解析错误
    }
  }

  // 测试框架
  if (fs.existsSync(path.join(targetDir, 'vitest.config.ts')) ||
      fs.existsSync(path.join(targetDir, 'vitest.config.js'))) {
    tools.testFramework = 'vitest';
  } else if (fs.existsSync(path.join(targetDir, 'jest.config.js')) ||
             fs.existsSync(path.join(targetDir, 'jest.config.ts'))) {
    tools.testFramework = 'jest';
  } else if (fs.existsSync(path.join(targetDir, 'mocha.opts'))) {
    tools.testFramework = 'mocha';
  }

  // 代码检查
  if (fs.existsSync(path.join(targetDir, '.eslintrc.js')) ||
      fs.existsSync(path.join(targetDir, '.eslintrc.json')) ||
      fs.existsSync(path.join(targetDir, 'eslint.config.js'))) {
    tools.linter = 'eslint';
  }

  // 格式化
  if (fs.existsSync(path.join(targetDir, '.prettierrc')) ||
      fs.existsSync(path.join(targetDir, '.prettierrc.js'))) {
    tools.formatter = 'prettier';
  }

  return tools;
}

/**
 * 生成建议
 */
function generateRecommendations(analysis) {
  const recommendations = {
    whereToPutCode: '',
    whereToPutTests: '',
    fileNaming: '',
    importStyle: '',
    notes: [],
  };

  // 代码位置
  if (analysis.structure.hasSrc) {
    recommendations.whereToPutCode = 'src/ 目录下';
  } else {
    recommendations.whereToPutCode = '项目根目录（该项目使用扁平结构）';
  }

  // 测试位置
  if (analysis.structure.hasTests) {
    recommendations.whereToPutTests = `${analysis.structure.testDir}/ 目录下`;
  } else {
    recommendations.whereToPutTests = '建议创建 tests/ 目录，或与源码放在一起';
  }

  // 文件命名
  recommendations.fileNaming = `使用 ${analysis.conventions.fileNaming} 命名风格`;

  // 导入风格
  recommendations.importStyle = `使用 ${analysis.conventions.importStyle} 导入路径`;

  // 注意事项
  if (analysis.type === 'monorepo') {
    recommendations.notes.push('这是 Monorepo 项目，注意区分 apps/ 和 packages/');
  }

  if (analysis.type === 'flat') {
    recommendations.notes.push('项目使用扁平结构，可以直接在根目录创建文件');
  }

  if (!analysis.structure.hasTests) {
    recommendations.notes.push('项目没有测试目录，建议添加测试');
  }

  return recommendations;
}

// ============ 工具函数 ============

/**
 * 统计文件数量
 */
function countFiles(dir, pattern) {
  try {
    const files = fs.readdirSync(dir);
    return files.filter(f => {
      const ext = pattern.replace('*', '');
      return f.endsWith(ext);
    }).length;
  } catch (error) {
    return 0;
  }
}

/**
 * 获取所有匹配的文件
 */
function getAllFiles(dir, pattern) {
  const files = [];
  
  function scan(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = pattern.replace('*', '');
          if (entry.name.endsWith(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // 忽略错误
    }
  }
  
  scan(dir);
  return files;
}

// ============ 输出报告 ============

/**
 * 打印分析报告
 */
function printReport(analysis) {
  console.log('\n📊 项目结构分析报告');
  console.log('=' .repeat(70));
  
  console.log(`\n项目名称: ${analysis.name}`);
  console.log(`项目路径: ${analysis.path}`);
  console.log(`项目类型: ${analysis.type}`);
  
  console.log('\n📁 目录结构:');
  console.log(`  ${analysis.structure.hasSrc ? '✅' : '❌'} src/ 目录`);
  console.log(`  ${analysis.structure.hasTests ? '✅' : '❌'} 测试目录 (${analysis.structure.testDir || '无'})`);
  console.log(`  ${analysis.structure.hasDocs ? '✅' : '❌'} docs/ 目录`);
  console.log(`  ${analysis.structure.hasScripts ? '✅' : '❌'} scripts/ 目录`);
  console.log(`  ${analysis.structure.hasComponents ? '✅' : '❌'} components/ 目录`);
  
  if (Object.keys(analysis.structure.srcStructure).length > 0) {
    console.log('\n  src/ 内部结构:');
    for (const [name, info] of Object.entries(analysis.structure.srcStructure)) {
      console.log(`    - ${name}/ (${info.fileCount} 个文件)`);
    }
  }
  
  console.log('\n📝 命名约定:');
  console.log(`  文件命名: ${analysis.conventions.fileNaming}`);
  console.log(`  导入方式: ${analysis.conventions.importStyle}`);
  
  console.log('\n🛠️  工具链:');
  console.log(`  包管理器: ${analysis.tools.packageManager}`);
  console.log(`  构建工具: ${analysis.tools.buildTool}`);
  console.log(`  测试框架: ${analysis.tools.testFramework}`);
  console.log(`  代码检查: ${analysis.tools.linter}`);
  console.log(`  代码格式化: ${analysis.tools.formatter}`);
  
  console.log('\n💡 开发建议:');
  console.log(`  代码位置: ${analysis.recommendations.whereToPutCode}`);
  console.log(`  测试位置: ${analysis.recommendations.whereToPutTests}`);
  console.log(`  文件命名: ${analysis.recommendations.fileNaming}`);
  console.log(`  导入风格: ${analysis.recommendations.importStyle}`);
  
  if (analysis.recommendations.notes.length > 0) {
    console.log('\n  注意事项:');
    for (const note of analysis.recommendations.notes) {
      console.log(`    - ${note}`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('\n📋 AI开发指南:');
  console.log('');
  console.log('基于以上分析，你应该:');
  console.log(`  1. 把新代码放在 ${analysis.recommendations.whereToPutCode}`);
  console.log(`  2. 把测试放在 ${analysis.recommendations.whereToPutTests}`);
  console.log(`  3. 使用 ${analysis.recommendations.fileNaming}`);
  console.log(`  4. 使用 ${analysis.recommendations.importStyle}`);
  console.log('');
  console.log('重要: 遵循项目现有的约定，不要引入自己的习惯！');
  console.log('');
}

// ============ 命令行入口 ============

try {
  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`❌ 目录不存在: ${TARGET_DIR}`);
    process.exit(1);
  }

  const analysis = analyzeProjectStructure(TARGET_DIR);
  printReport(analysis);
  
  // 输出JSON供程序使用
  const outputFile = path.join(TARGET_DIR, '.project-analysis.json');
  fs.writeFileSync(outputFile, JSON.stringify(analysis, null, 2));
  console.log(`\n📝 详细分析已保存到: ${outputFile}`);
  
} catch (error) {
  console.error('❌ 分析失败:', error.message);
  process.exit(1);
}
