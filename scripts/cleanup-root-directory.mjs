#!/usr/bin/env node

/**
 * 项目根目录清理工具
 * 
 * 功能：
 * 1. 扫描根目录下的文件
 * 2. 识别应该移动到其他目录的文件
 * 3. 自动归类到正确的目录
 * 4. 生成清理报告
 * 
 * 使用方式：
 *   node scripts/cleanup-root-directory.mjs          # 预览模式
 *   node scripts/cleanup-root-directory.mjs --apply   # 执行清理
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ============ 文件分类规则 ============

/**
 * 文件分类规则表
 * 
 * 根据文件类型和名称，决定应该移动到哪个目录
 */
const FILE_RULES = [
  // 临时文件和日志 -> .tmp/ 或删除
  {
    pattern: /\.(log|tmp|bak|swp)$/,
    category: 'temporary',
    target: '.tmp-root',
    action: 'remove', // 临时文件直接删除
    description: '临时文件/日志'
  },
  
  // 构建输出 -> dist/ 或删除（已被 .gitignore）
  {
    pattern: /^(build-output|debug-.*\.log|gw_.*\.txt)$/,
    category: 'build-output',
    target: '.tmp-root',
    action: 'remove',
    description: '构建输出和调试日志'
  },
  
  // 报告文件 -> docs/reports/
  {
    pattern: /-report\.(md|txt|csv)$/,
    category: 'reports',
    target: 'docs/reports',
    action: 'move',
    description: '项目报告'
  },
  
  // 迁移/合并相关文档 -> docs/migrations/
  {
    pattern: /^(infra-merge|shared-process-merge|infra-diff)/,
    category: 'migrations',
    target: 'docs/migrations',
    action: 'move',
    description: '迁移相关文档'
  },
  
  // 独立脚本 -> scripts/
  {
    pattern: /\.(sh|ps1|py)$/i,
    category: 'scripts',
    target: 'scripts',
    action: 'move',
    description: '脚本文件',
    exceptions: ['install.sh', 'install.ps1', 'init.sh'] // 这些保留在根目录
  },
  
  // 独立的 mjs 工具脚本 -> scripts/
  {
    pattern: /^(_fix_|fix_|expire-|bind-).*\.mjs$/,
    category: 'scripts',
    target: 'scripts',
    action: 'move',
    description: '工具脚本'
  },
  
  // Python 脚本 -> scripts/python/
  {
    pattern: /\.py$/,
    category: 'scripts-python',
    target: 'scripts/python',
    action: 'move',
    description: 'Python 脚本'
  },
  
  // 性能测试 -> test/performance/
  {
    pattern: /^performance_test/,
    category: 'performance-tests',
    target: 'test/performance',
    action: 'move',
    description: '性能测试'
  },
  
  // Docker 环境配置 -> docker/
  {
    pattern: /^openclaw\.podman\.env$/,
    category: 'docker',
    target: 'docker',
    action: 'move',
    description: 'Docker 环境配置'
  },
  
  // 插件相关文件 -> plugins/
  {
    pattern: /^(plugins-list|plugins-status)\.json$/,
    category: 'plugins',
    target: 'plugins',
    action: 'move',
    description: '插件配置'
  },
];

// ============ 保留在根目录的文件 ============

/**
 * 这些文件应该保留在根目录
 */
const KEEP_IN_ROOT = [
  // 隐藏配置文件
  '.git',
  '.gitignore',
  '.gitattributes',
  '.gitmodules',
  '.env.example',
  '.npmrc',
  '.dockerignore',
  '.openclaw.json',
  '.module-deps-config.example.json',
  '.detect-secrets.cfg',
  '.oxlintrc.json',
  '.oxfmtrc.jsonc',
  '.pre-commit-config.yaml',
  '.markdownlint-cli2.jsonc',
  '.shellcheckrc',
  '.secrets.baseline',
  
  // Swift/iOS 配置
  '.swiftformat',
  '.swiftlint.yml',
  '.local-features.json',
  
  // Node.js/TypeScript 配置
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.plugin-sdk.dts.json',
  'tsconfig.ui-only.json',
  'tsdown.config.ts',
  'vitest.config.ts',
  'vitest.*.config.ts',
  
  // 文档（保留在根目录的重要文档）
  'README.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE',
  'NOTICE',
  'VISION.md',
  'INSTALL.zh-CN.md',
  'docs.acp.md',
  
  // Docker 和部署
  'Dockerfile',
  'Dockerfile.sandbox',
  'Dockerfile.sandbox-browser',
  'Dockerfile.sandbox-common',
  'docker-compose.yml',
  'docker-setup.sh',
  'fly.toml',
  'fly.private.toml',
  'render.yaml',
  'appcast.xml',
  
  // 安装和初始化脚本（保留在根目录方便使用）
  'install.sh',
  'install.ps1',
  'init.sh',
  'setup-podman.sh',
  'setup-qoder-skill.ps1',
  
  // 入口文件
  'openclaw.mjs',
  
  // 目录
  'node_modules',
  'dist',
  'dist-working',
  'src',
  'src-local',
  'scripts',
  'docs',
  'test',
  'test-integration',
  'tests',
  'apps',
  'packages',
  'extensions',
  'skills',
  'vendor',
  'assets',
  'ui',
  'upstream',
  'Swabble',
  'examples',
  'i18n',
  'patches',
  'git-hooks',
  
  // 工具目录
  '.git',
  '.github',
  '.vscode',
  '.agent',
  '.agents',
  '.pi',
  '.tmp-root-F7BwbO',
];

// ============ 主函数 ============

/**
 * 扫描并分析根目录
 */
function scanRootDirectory() {
  const files = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
  
  const result = {
    totalFiles: files.length,
    totalDirectories: 0,
    totalFilesCount: 0,
    keepInRoot: [],
    toMove: [],
    toRemove: [],
    unknown: [],
  };
  
  for (const file of files) {
    // 跳过隐藏文件（除了重要的配置）
    if (file.name.startsWith('.') && !KEEP_IN_ROOT.includes(file.name)) {
      continue;
    }
    
    if (file.isDirectory()) {
      result.totalDirectories++;
      if (KEEP_IN_ROOT.includes(file.name)) {
        result.keepInRoot.push({ name: file.name, type: 'directory' });
      } else {
        result.unknown.push({ name: file.name, type: 'directory' });
      }
    } else {
      result.totalFilesCount++;
      
      // 检查是否应该保留
      if (KEEP_IN_ROOT.includes(file.name)) {
        result.keepInRoot.push({ name: file.name, type: 'file' });
        continue;
      }
      
      // 应用规则
      let matched = false;
      for (const rule of FILE_RULES) {
        if (rule.pattern.test(file.name)) {
          // 检查是否在例外列表中
          if (rule.exceptions && rule.exceptions.includes(file.name)) {
            result.keepInRoot.push({ name: file.name, type: 'file', reason: '例外保留' });
          } else {
            result.toMove.push({
              name: file.name,
              type: 'file',
              target: rule.target,
              action: rule.action,
              category: rule.category,
              description: rule.description,
            });
          }
          matched = true;
          break;
        }
      }
      
      // 未匹配任何规则
      if (!matched) {
        result.unknown.push({ name: file.name, type: 'file' });
      }
    }
  }
  
  return result;
}

/**
 * 打印分析报告
 */
function printReport(analysis) {
  console.log('\n📊 项目根目录分析报告');
  console.log('=' .repeat(60));
  console.log(`\n总计: ${analysis.totalFiles} 个项目`);
  console.log(`  - 目录: ${analysis.totalDirectories}`);
  console.log(`  - 文件: ${analysis.totalFilesCount}`);
  
  console.log(`\n✅ 保留在根目录 (${analysis.keepInRoot.length}):`);
  const dirs = analysis.keepInRoot.filter(x => x.type === 'directory');
  const files = analysis.keepInRoot.filter(x => x.type === 'file');
  console.log(`  - 目录 (${dirs.length}): ${dirs.map(d => d.name).join(', ')}`);
  console.log(`  - 文件 (${files.length}): ${files.slice(0, 10).map(f => f.name).join(', ')}${files.length > 10 ? '...' : ''}`);
  
  if (analysis.toMove.length > 0) {
    console.log(`\n📦 建议移动 (${analysis.toMove.length}):`);
    const grouped = groupBy(analysis.toMove, 'target');
    for (const [target, items] of Object.entries(grouped)) {
      console.log(`\n  📁 ${target}/ (${items.length}):`);
      for (const item of items.slice(0, 5)) {
        console.log(`    - ${item.name} (${item.description})`);
      }
      if (items.length > 5) {
        console.log(`    ... 还有 ${items.length - 5} 个文件`);
      }
    }
  }
  
  if (analysis.toRemove.length > 0) {
    console.log(`\n🗑️  建议删除 (${analysis.toRemove.length}):`);
    for (const item of analysis.toRemove) {
      console.log(`  - ${item.name} (${item.description})`);
    }
  }
  
  if (analysis.unknown.length > 0) {
    console.log(`\n❓ 未分类 (${analysis.unknown.length}):`);
    for (const item of analysis.unknown) {
      console.log(`  - ${item.name} (${item.type})`);
    }
    console.log('\n  💡 这些文件需要手动分类，请添加到清理规则中');
  }
  
  console.log('\n' + '=' .repeat(60));
}

/**
 * 执行清理操作
 */
function applyCleanup(analysis, dryRun = true) {
  if (dryRun) {
    console.log('\n🔍 预览模式（未执行实际移动）');
    console.log('💡 使用 --apply 参数执行实际清理');
    return;
  }
  
  console.log('\n🚀 开始清理根目录...\n');
  
  let movedCount = 0;
  let removedCount = 0;
  
  for (const item of analysis.toMove) {
    const sourcePath = path.join(ROOT_DIR, item.name);
    const targetDir = path.join(ROOT_DIR, item.target);
    const targetPath = path.join(targetDir, item.name);
    
    try {
      // 确保目标目录存在
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // 移动文件
      fs.renameSync(sourcePath, targetPath);
      console.log(`✅ 已移动: ${item.name} -> ${item.target}/`);
      movedCount++;
    } catch (error) {
      console.error(`❌ 移动失败: ${item.name}`, error.message);
    }
  }
  
  for (const item of analysis.toRemove) {
    const filePath = path.join(ROOT_DIR, item.name);
    
    try {
      fs.unlinkSync(filePath);
      console.log(`🗑️  已删除: ${item.name}`);
      removedCount++;
    } catch (error) {
      console.error(`❌ 删除失败: ${item.name}`, error.message);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log(`\n✨ 清理完成！`);
  console.log(`  - 移动了 ${movedCount} 个文件`);
  console.log(`  - 删除了 ${removedCount} 个文件`);
  console.log('\n💡 建议:');
  console.log('  1. 检查移动后的文件是否正常');
  console.log('  2. 更新相关的引用路径');
  console.log('  3. 提交到版本控制');
}

/**
 * 辅助函数：按字段分组
 */
function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

// ============ 命令行入口 ============

const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');

try {
  const analysis = scanRootDirectory();
  printReport(analysis);
  applyCleanup(analysis, !shouldApply);
} catch (error) {
  console.error('❌ 执行失败:', error);
  process.exit(1);
}

