#!/usr/bin/env node

/**
 * 依赖版本一致性检查和修复工具
 * 
 * 解决的问题：
 * 1. 不同模块使用同一个依赖的不同版本
 * 2. 打包启动时版本冲突
 * 3. 重复依赖导致 bundle 体积增大
 * 4. 运行时找不到正确的依赖
 * 
 * 业界最佳实践：
 * - pnpm: 严格依赖隔离 + workspace 协议
 * - Nx: 版本锁定 + 自动对齐
 * - Turborepo: 依赖提升 + 版本统一
 * 
 * 使用方式：
 *   node scripts/check-dependency-versions.mjs          # 检查模式
 *   node scripts/check-dependency-versions.mjs --fix     # 自动修复
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ============ 依赖分析 ============

/**
 * 扫描所有 package.json 文件
 */
function scanAllPackageJsons() {
  const packages = [];
  const workspaces = [
    'package.json',              // 根
    'packages/*/package.json',   // 包
    'extensions/*/package.json', // 扩展
    'apps/*/package.json',       // 应用
    'ui/package.json',           // UI
  ];

  for (const pattern of workspaces) {
    if (pattern.includes('*')) {
      // 通配符匹配
      const parts = pattern.split('/');
      const baseDir = parts[0];
      const baseDirPath = path.join(ROOT_DIR, baseDir);
      
      if (!fs.existsSync(baseDirPath)) continue;
      
      try {
        const items = fs.readdirSync(baseDirPath);
        for (const item of items) {
          // 跳过隐藏目录和文件
          if (item.startsWith('.')) continue;
          
          const pkgPath = path.join(ROOT_DIR, baseDir, item, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try {
              const content = fs.readFileSync(pkgPath, 'utf-8');
              const pkg = JSON.parse(content);
              packages.push({
                path: pkgPath,
                relativePath: path.relative(ROOT_DIR, pkgPath),
                name: pkg.name || 'unknown',
                dependencies: pkg.dependencies || {},
                devDependencies: pkg.devDependencies || {},
              });
            } catch (error) {
              console.error(`❌ 解析失败: ${pkgPath}`, error.message);
            }
          }
        }
      } catch (error) {
        console.error(`❌ 读取目录失败: ${baseDirPath}`, error.message);
      }
    } else {
      // 直接路径
      const pkgPath = path.join(ROOT_DIR, pattern);
      if (fs.existsSync(pkgPath)) {
        try {
          const content = fs.readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(content);
          packages.push({
            path: pkgPath,
            relativePath: path.relative(ROOT_DIR, pkgPath),
            name: pkg.name || 'unknown',
            dependencies: pkg.dependencies || {},
            devDependencies: pkg.devDependencies || {},
          });
        } catch (error) {
          console.error(`❌ 解析失败: ${pkgPath}`, error.message);
        }
      }
    }
  }

  return packages;
}

/**
 * 分析依赖版本冲突
 */
function analyzeDependencyConflicts(packages) {
  const dependencyMap = new Map(); // depName -> [{package, version, type}]

  // 收集所有依赖
  for (const pkg of packages) {
    // 生产依赖
    for (const [depName, version] of Object.entries(pkg.dependencies)) {
      if (!dependencyMap.has(depName)) {
        dependencyMap.set(depName, []);
      }
      dependencyMap.get(depName).push({
        packageName: pkg.name,
        packagePath: pkg.relativePath,
        version: version,
        type: 'dependencies',
      });
    }

    // 开发依赖
    for (const [depName, version] of Object.entries(pkg.devDependencies)) {
      if (!dependencyMap.has(depName)) {
        dependencyMap.set(depName, []);
      }
      dependencyMap.get(depName).push({
        packageName: pkg.name,
        packagePath: pkg.relativePath,
        version: version,
        type: 'devDependencies',
      });
    }
  }

  // 检测冲突
  const conflicts = [];
  const aligned = [];

  for (const [depName, usages] of dependencyMap) {
    const versions = [...new Set(usages.map(u => u.version))];
    
    if (versions.length > 1) {
      // 有版本冲突
      conflicts.push({
        dependency: depName,
        versions: versions,
        usages: usages,
        severity: getConflictSeverity(depName, versions),
      });
    } else {
      // 版本一致
      aligned.push({
        dependency: depName,
        version: versions[0],
        usageCount: usages.length,
      });
    }
  }

  return {
    totalDependencies: dependencyMap.size,
    conflicts: conflicts.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
    aligned: aligned,
    packages: packages.length,
  };
}

/**
 * 获取冲突严重程度
 */
function getConflictSeverity(depName, versions) {
  // 核心依赖冲突 = error
  const criticalDeps = [
    'react', 'react-dom', 'typescript', 'vue', 'next',
    'express', 'fastify', 'webpack', 'vite', 'rollup',
    'pnpm', 'npm', 'yarn',
  ];
  
  if (criticalDeps.includes(depName)) {
    return 'error';
  }

  // 主版本不同 = error
  const majorVersions = [...new Set(versions.map(v => {
    const match = v.match(/\^?(\d+)\./);
    return match ? match[1] : null;
  }).filter(Boolean))];
  
  if (majorVersions.length > 1) {
    return 'error';
  }

  // 次版本不同 = warning
  return 'warning';
}

// ============ 报告生成 ============

/**
 * 打印分析报告
 */
function printReport(analysis) {
  console.log('\n📊 依赖版本一致性分析报告');
  console.log('=' .repeat(70));
  
  console.log(`\n总计: ${analysis.packages} 个包, ${analysis.totalDependencies} 个唯一依赖`);
  console.log(`  ✅ 版本一致: ${analysis.aligned.length}`);
  console.log(`  ❌ 版本冲突: ${analysis.conflicts.length}`);
  
  if (analysis.conflicts.length > 0) {
    console.log('\n' + '=' .repeat(70));
    console.log('❌ 发现依赖版本冲突:');
    console.log('=' .repeat(70));
    
    const errors = analysis.conflicts.filter(c => c.severity === 'error');
    const warnings = analysis.conflicts.filter(c => c.severity === 'warning');
    
    if (errors.length > 0) {
      console.log(`\n🔴 严重错误 (${errors.length}):`);
      for (const conflict of errors) {
        console.log(`\n  依赖: ${conflict.dependency}`);
        console.log(`  版本: ${conflict.versions.join(', ')}`);
        console.log(`  使用情况:`);
        for (const usage of conflict.usages) {
          console.log(`    - ${usage.packagePath}: ${usage.version}`);
        }
        console.log(`  💡 影响: 可能导致打包失败或运行时错误`);
      }
    }
    
    if (warnings.length > 0) {
      console.log(`\n🟡 警告 (${warnings.length}):`);
      for (const conflict of warnings.slice(0, 10)) {
        console.log(`\n  依赖: ${conflict.dependency}`);
        console.log(`  版本: ${conflict.versions.join(', ')}`);
        console.log(`  使用情况:`);
        for (const usage of conflict.usages.slice(0, 3)) {
          console.log(`    - ${usage.packagePath}: ${usage.version}`);
        }
        if (conflict.usages.length > 3) {
          console.log(`    ... 还有 ${conflict.usages.length - 3} 个`);
        }
      }
      if (warnings.length > 10) {
        console.log(`\n  ... 还有 ${warnings.length - 10} 个警告`);
      }
    }
  }
  
  if (analysis.aligned.length > 0) {
    console.log('\n' + '=' .repeat(70));
    console.log('✅ 版本一致的依赖 (Top 20):');
    console.log('=' .repeat(70));
    
    const topAligned = analysis.aligned
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 20);
    
    for (const dep of topAligned) {
      console.log(`  ✓ ${dep.dependency}@${dep.version} (${dep.usageCount} 个包使用)`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
}

// ============ 自动修复 ============

/**
 * 生成统一的依赖版本
 */
function resolveDependencyVersions(analysis) {
  const resolved = {};
  
  // 对于每个冲突的依赖，选择最合适的版本
  for (const conflict of analysis.conflicts) {
    const { dependency, usages } = conflict;
    
    // 策略：选择使用最多的版本
    const versionCount = {};
    for (const usage of usages) {
      versionCount[usage.version] = (versionCount[usage.version] || 0) + 1;
    }
    
    const sortedVersions = Object.entries(versionCount)
      .sort((a, b) => b[1] - a[1]);
    
    resolved[dependency] = sortedVersions[0][0]; // 选择最多的
  }
  
  return resolved;
}

/**
 * 自动修复依赖版本
 */
function fixDependencyVersions(resolved, packages) {
  console.log('\n🔧 开始自动修复依赖版本...\n');
  
  let fixedCount = 0;
  
  for (const [depName, targetVersion] of Object.entries(resolved)) {
    console.log(`📦 统一 ${depName} -> ${targetVersion}`);
    
    for (const pkg of packages) {
      // 检查生产依赖
      if (pkg.dependencies[depName] && pkg.dependencies[depName] !== targetVersion) {
        const oldVersion = pkg.dependencies[depName];
        pkg.dependencies[depName] = targetVersion;
        console.log(`  ✓ ${pkg.relativePath}: ${oldVersion} -> ${targetVersion}`);
        fixedCount++;
      }
      
      // 检查开发依赖
      if (pkg.devDependencies[depName] && pkg.devDependencies[depName] !== targetVersion) {
        const oldVersion = pkg.devDependencies[depName];
        pkg.devDependencies[depName] = targetVersion;
        console.log(`  ✓ ${pkg.relativePath} (dev): ${oldVersion} -> ${targetVersion}`);
        fixedCount++;
      }
    }
  }
  
  // 写回文件
  for (const pkg of packages) {
    const content = fs.readFileSync(pkg.path, 'utf-8');
    const updated = JSON.stringify(pkg, null, 2) + '\n';
    
    if (content !== updated) {
      fs.writeFileSync(pkg.path, updated, 'utf-8');
      console.log(`💾 已更新: ${pkg.relativePath}`);
    }
  }
  
  console.log(`\n✨ 修复完成！共修改 ${fixedCount} 处依赖版本`);
  console.log('💡 建议运行: pnpm install');
}

// ============ 生成配置建议 ============

/**
 * 生成 pnpm workspace 配置建议
 */
function generateWorkspaceConfig(analysis) {
  const suggestions = {
    packages: [
      '.',
      'ui',
      'packages/*',
      'extensions/*',
    ],
    peerDependencyRules: {
      allowAny: [],
      ignoreMissing: [],
    },
    overrides: {}, // 强制统一的版本
  };
  
  // 对于严重冲突的依赖，添加到 overrides
  const errorConflicts = analysis.conflicts.filter(c => c.severity === 'error');
  for (const conflict of errorConflicts) {
    suggestions.overrides[conflict.dependency] = resolveDependencyVersions(
      { conflicts: [conflict] }
    )[conflict.dependency];
  }
  
  return suggestions;
}

// ============ 命令行入口 ============

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

try {
  console.log('🔍 扫描项目依赖...\n');
  
  const packages = scanAllPackageJsons();
  console.log(`✅ 找到 ${packages.length} 个包\n`);
  
  const analysis = analyzeDependencyConflicts(packages);
  printReport(analysis);
  
  if (analysis.conflicts.length > 0) {
    if (shouldFix) {
      const resolved = resolveDependencyVersions(analysis);
      fixDependencyVersions(resolved, packages);
      
      // 生成 pnpm 配置建议
      const config = generateWorkspaceConfig(analysis);
      if (Object.keys(config.overrides).length > 0) {
        console.log('\n📝 建议在 pnpm-workspace.yaml 中添加:');
        console.log('');
        console.log('overrides:');
        for (const [dep, version] of Object.entries(config.overrides)) {
          console.log(`  ${dep}: "${version}"`);
        }
      }
    } else {
      console.log('\n💡 运行以下命令自动修复:');
      console.log('   node scripts/check-dependency-versions.mjs --fix');
      console.log('\n或者在 pnpm-workspace.yaml 中添加 overrides 强制统一版本');
    }
  } else {
    console.log('\n🎉 所有依赖版本一致！');
  }
  
  console.log('');
} catch (error) {
  console.error('❌ 执行失败:', error);
  process.exit(1);
}
