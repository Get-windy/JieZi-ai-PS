#!/usr/bin/env node

/**
 * AI团队开发辅助工具 - 自动依赖检查和修复
 * 
 * 这个工具专门给AI Agent使用，在开发过程中自动检测和修复依赖问题
 * 
 * 使用场景：
 * 1. AI创建新模块后自动检查
 * 2. AI添加依赖后自动验证
 * 3. AI打包前完整性检查
 * 4. AI遇到启动失败时自动诊断
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ============ 诊断功能 ============

/**
 * 全面诊断项目依赖状态
 */
function diagnose() {
  console.log('🔍 AI依赖诊断工具启动...');
  console.log('=' .repeat(60));
  
  const results = {
    errors: [],
    warnings: [],
    suggestions: [],
  };

  // 1. 检查 package.json 格式
  console.log('\n📦 检查 package.json...');
  checkPackageJson(results);

  // 2. 检查依赖版本冲突
  console.log('\n🔍 检查依赖版本...');
  checkDependencyVersions(results);

  // 3. 检查 pnpm-lock.yaml
  console.log('\n📝 检查锁定文件...');
  checkLockFile(results);

  // 4. 检查 node_modules
  console.log('\n📁 检查 node_modules...');
  checkNodeModules(results);

  // 5. 检查循环依赖（如果有 madge）
  console.log('\n🔄 检查循环依赖...');
  checkCircularDependencies(results);

  // 输出结果
  printDiagnosis(results);
  
  return results;
}

/**
 * 检查 package.json
 */
function checkPackageJson(results) {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    
    console.log('  ✓ package.json 格式正确');
    console.log(`  - 名称: ${pkg.name || '未定义'}`);
    console.log(`  - 依赖数: ${Object.keys(pkg.dependencies || {}).length}`);
    console.log(`  - 开发依赖数: ${Object.keys(pkg.devDependencies || {}).length}`);
    
    // 检查是否有常见错误
    if (!pkg.engines) {
      results.warnings.push('package.json 缺少 engines 字段');
    }
    
    if (!pkg.packageManager && fs.existsSync(path.join(ROOT_DIR, 'pnpm-lock.yaml'))) {
      results.warnings.push('建议添加 packageManager 字段');
    }
    
  } catch (error) {
    results.errors.push(`package.json 解析失败: ${error.message}`);
  }
}

/**
 * 检查依赖版本冲突
 */
function checkDependencyVersions(results) {
  try {
    // 运行依赖版本检查脚本
    const output = execSync(
      'node scripts/check-dependency-versions.mjs 2>&1',
      { cwd: ROOT_DIR, encoding: 'utf-8' }
    );
    
    // 解析输出
    if (output.includes('版本冲突')) {
      const conflicts = output.match(/❌.*版本冲突: (\d+)/);
      if (conflicts) {
        results.errors.push(`发现 ${conflicts[1]} 个依赖版本冲突`);
      }
    } else {
      console.log('  ✓ 所有依赖版本一致');
    }
    
  } catch (error) {
    // 脚本可能返回非零退出码
    const output = error.stdout || '';
    if (output.includes('版本冲突')) {
      const conflicts = output.match(/❌.*版本冲突: (\d+)/);
      if (conflicts) {
        results.errors.push(`发现 ${conflicts[1]} 个依赖版本冲突`);
      }
    }
  }
}

/**
 * 检查锁定文件
 */
function checkLockFile(results) {
  const lockPath = path.join(ROOT_DIR, 'pnpm-lock.yaml');
  
  if (!fs.existsSync(lockPath)) {
    results.errors.push('缺少 pnpm-lock.yaml 文件');
    results.suggestions.push('运行: pnpm install');
    return;
  }
  
  console.log('  ✓ pnpm-lock.yaml 存在');
  
  const stats = fs.statSync(lockPath);
  const age = Date.now() - stats.mtimeMs;
  const ageHours = Math.floor(age / (1000 * 60 * 60));
  
  if (ageHours > 24) {
    results.warnings.push(`锁定文件已超过 ${ageHours} 小时未更新`);
    results.suggestions.push('运行: pnpm install 更新锁定文件');
  } else {
    console.log(`  - 最后更新: ${ageHours} 小时前`);
  }
}

/**
 * 检查 node_modules
 */
function checkNodeModules(results) {
  const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    results.errors.push('node_modules 不存在');
    results.suggestions.push('运行: pnpm install');
    return;
  }
  
  console.log('  ✓ node_modules 存在');
  
  // 检查 .pnpm 目录
  const pnpmPath = path.join(nodeModulesPath, '.pnpm');
  if (fs.existsSync(pnpmPath)) {
    const dirs = fs.readdirSync(pnpmPath).filter(d => !d.startsWith('.'));
    console.log(`  - 已安装 ${dirs.length} 个包`);
  }
  
  // 检查是否有符号链接问题
  try {
    const brokenLinks = findBrokenSymlinks(nodeModulesPath);
    if (brokenLinks.length > 0) {
      results.errors.push(`发现 ${brokenLinks.length} 个损坏的符号链接`);
      results.suggestions.push('运行: pnpm install --force');
    }
  } catch (error) {
    // 忽略符号链接检查错误
  }
}

/**
 * 查找损坏的符号链接
 */
function findBrokenSymlinks(dir) {
  const broken = [];
  
  function scan(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isSymbolicLink()) {
        try {
          fs.accessSync(fs.realpathSync(fullPath));
        } catch {
          broken.push(fullPath);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        scan(fullPath);
      }
    }
  }
  
  try {
    scan(dir);
  } catch (error) {
    // 忽略扫描错误
  }
  
  return broken;
}

/**
 * 检查循环依赖
 */
function checkCircularDependencies(results) {
  try {
    // 尝试使用 madge
    execSync('npx madge --version', { cwd: ROOT_DIR, stdio: 'ignore' });
    
    const output = execSync(
      'npx madge --circular src/ 2>&1',
      { cwd: ROOT_DIR, encoding: 'utf-8' }
    );
    
    if (output.includes('No circular dependency found')) {
      console.log('  ✓ 无循环依赖');
    } else {
      results.warnings.push('可能存在循环依赖');
      results.suggestions.push('运行: pnpm check:module-deps:circular');
    }
    
  } catch (error) {
    // madge 未安装，使用内置检查
    console.log('  ⚠ madge 未安装，使用内置检查');
    results.suggestions.push('安装 madge: pnpm add -D madge');
  }
}

/**
 * 输出诊断结果
 */
function printDiagnosis(results) {
  console.log('\n' + '=' .repeat(60));
  console.log('📊 诊断结果:');
  console.log('=' .repeat(60));
  
  if (results.errors.length > 0) {
    console.log(`\n❌ 错误 (${results.errors.length}):`);
    for (const error of results.errors) {
      console.log(`  - ${error}`);
    }
  }
  
  if (results.warnings.length > 0) {
    console.log(`\n⚠️  警告 (${results.warnings.length}):`);
    for (const warning of results.warnings) {
      console.log(`  - ${warning}`);
    }
  }
  
  if (results.suggestions.length > 0) {
    console.log(`\n💡 建议 (${results.suggestions.length}):`);
    for (const suggestion of results.suggestions) {
      console.log(`  - ${suggestion}`);
    }
  }
  
  if (results.errors.length === 0 && results.warnings.length === 0) {
    console.log('\n✅ 一切正常！');
  }
  
  console.log('\n' + '=' .repeat(60));
}

// ============ 自动修复 ============

/**
 * 自动修复所有问题
 */
function autoFix() {
  console.log('🔧 开始自动修复...\n');
  
  // 1. 修复依赖版本
  console.log('📦 修复依赖版本...');
  try {
    execSync('node scripts/check-dependency-versions.mjs --fix', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('❌ 依赖版本修复失败');
  }
  
  // 2. 重新安装
  console.log('\n📥 重新安装依赖...');
  try {
    execSync('pnpm install', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('❌ pnpm install 失败');
    return;
  }
  
  // 3. 清理缓存
  console.log('\n🧹 清理缓存...');
  try {
    execSync('pnpm store prune', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
  } catch (error) {
    // 忽略清理错误
  }
  
  console.log('\n✅ 自动修复完成！');
  console.log('💡 建议运行: pnpm build');
}

// ============ 打包前检查 ============

/**
 * 打包前完整性检查
 */
function preBuildCheck() {
  console.log('📋 执行打包前检查...\n');
  
  const results = diagnose();
  
  if (results.errors.length > 0) {
    console.log('\n❌ 发现错误，无法打包！');
    console.log('💡 请先修复以上错误');
    process.exit(1);
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  有警告，但仍可打包');
    console.log('💡 建议处理警告后再打包');
  }
  
  console.log('\n✅ 打包前检查通过！');
  console.log('🚀 可以运行: pnpm build');
}

// ============ 命令行入口 ============

const args = process.argv.slice(2);
const command = args[0] || 'diagnose';

try {
  switch (command) {
    case 'diagnose':
    case 'check':
      diagnose();
      break;
      
    case 'fix':
      autoFix();
      break;
      
    case 'pre-build':
      preBuildCheck();
      break;
      
    default:
      console.log('用法:');
      console.log('  node ai-dependency-check.mjs diagnose  # 诊断问题');
      console.log('  node ai-dependency-check.mjs fix        # 自动修复');
      console.log('  node ai-dependency-check.mjs pre-build  # 打包前检查');
      break;
  }
} catch (error) {
  console.error('❌ 执行失败:', error.message);
  process.exit(1);
}
