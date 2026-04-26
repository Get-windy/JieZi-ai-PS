#!/usr/bin/env node

/**
 * AI规则文件管理工具
 * 
 * 功能：
 * 1. 更新现有规则文件
 * 2. 添加新规则
 * 3. 删除过时规则
 * 4. 规则版本管理
 * 5. 规则变更历史
 * 
 * 使用方式：
 *   node scripts/update-rules.mjs                     # 交互式
 *   node scripts/update-rules.mjs --add="新规则内容"   # 添加规则
 *   node scripts/update-rules.mjs --update            # 更新所有规则
 *   node scripts/update-rules.mjs --version           # 查看版本
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.cwd();

// ============ 规则文件管理 ============

/**
 * 规则文件列表
 */
const RULE_FILES = [
  'CLAUDE.md',
  '.cursorrules',
  '.project-structure-rules.md',
];

/**
 * 读取规则文件内容
 */
function readRuleFile(filePath) {
  const fullPath = path.join(ROOT_DIR, filePath);
  
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * 写入规则文件
 */
function writeRuleFile(filePath, content) {
  const fullPath = path.join(ROOT_DIR, filePath);
  fs.writeFileSync(fullPath, content, 'utf-8');
}

/**
 * 检查规则文件是否存在
 */
function checkRuleFiles() {
  const results = {
    existing: [],
    missing: [],
  };
  
  for (const file of RULE_FILES) {
    if (fs.existsSync(path.join(ROOT_DIR, file))) {
      results.existing.push(file);
    } else {
      results.missing.push(file);
    }
  }
  
  return results;
}

// ============ 规则更新 ============

/**
 * 更新 CLAUDE.md
 */
function updateClaudeMD(updates) {
  const content = readRuleFile('CLAUDE.md');
  
  if (!content) {
    console.log('❌ CLAUDE.md 不存在，先创建它');
    return false;
  }
  
  let updated = content;
  
  // 更新项目信息
  if (updates.projectName) {
    updated = updated.replace(
      /- \*\*项目名称\*\*: .+/,
      `- **项目名称**: ${updates.projectName}`
    );
  }
  
  if (updates.projectType) {
    updated = updated.replace(
      /- \*\*项目类型\*\*: .+/,
      `- **项目类型**: ${updates.projectType}`
    );
  }
  
  if (updates.techStack) {
    updated = updated.replace(
      /- \*\*技术栈\*\*: .+/,
      `- **技术栈**: ${updates.techStack}`
    );
  }
  
  // 添加新规则章节
  if (updates.newSection) {
    const sectionMarker = '## 📋 提交前检查清单';
    if (updated.includes(sectionMarker)) {
      updated = updated.replace(
        sectionMarker,
        `${updates.newSection}\n\n${sectionMarker}`
      );
    } else {
      updated += `\n\n${updates.newSection}\n`;
    }
  }
  
  // 添加禁止行为
  if (updates.newProhibitions) {
    const prohibitionMarker = '## 🚫 绝对禁止的行为';
    if (updated.includes(prohibitionMarker)) {
      updated = updated.replace(
        prohibitionMarker,
        `${prohibitionMarker}\n\n${updates.newProhibitions}`
      );
    }
  }
  
  // 添加必须行为
  if (updates.newRequirements) {
    const requirementMarker = '## ✅ 必须遵守的行为';
    if (updated.includes(requirementMarker)) {
      updated = updated.replace(
        requirementMarker,
        `${requirementMarker}\n\n${updates.newRequirements}`
      );
    }
  }
  
  // 更新版本号和日期
  const versionMatch = content.match(/## 📝 版本信息[\s\S]*- 版本: (\d+\.\d+\.\d+)/);
  const currentVersion = versionMatch ? versionMatch[1] : '1.0.0';
  const newVersion = incrementVersion(currentVersion);
  const today = new Date().toISOString().split('T')[0];
  
  // 添加版本历史
  const versionSection = `## 📝 版本信息

- 版本: ${newVersion}
- 最后更新: ${today}
- 更新内容: ${updates.description || '规则更新'}`;
  
  if (updated.includes('## 📝 版本信息')) {
    updated = updated.replace(
      /## 📝 版本信息[\s\S]*$/,
      versionSection
    );
  } else {
    updated += `\n\n${versionSection}\n`;
  }
  
  writeRuleFile('CLAUDE.md', updated);
  console.log('✅ CLAUDE.md 已更新');
  return true;
}

/**
 * 更新 .cursorrules
 */
function updateCursorRules(updates) {
  const content = readRuleFile('.cursorrules');
  
  if (!content) {
    console.log('❌ .cursorrules 不存在');
    return false;
  }
  
  let updated = content;
  
  // 更新项目名
  if (updates.projectName) {
    updated = updated.replace(
      /# 项目: .+/,
      `# 项目: ${updates.projectName}`
    );
  }
  
  // 添加新规则
  if (updates.newRules) {
    updated += `

## 🆕 新增规则 (${new Date().toISOString().split('T')[0]})

${updates.newRules}
`;
  }
  
  writeRuleFile('.cursorrules', updated);
  console.log('✅ .cursorrules 已更新');
  return true;
}

/**
 * 更新 .project-structure-rules.md
 */
function updateStructureRules(updates) {
  const content = readRuleFile('.project-structure-rules.md');
  
  if (!content) {
    console.log('❌ .project-structure-rules.md 不存在');
    return false;
  }
  
  let updated = content;
  
  // 更新项目名
  if (updates.projectName) {
    updated = updated.replace(
      /# .+ - 项目结构规范/,
      `# ${updates.projectName} - 项目结构规范`
    );
  }
  
  // 添加新规则
  if (updates.newRules) {
    updated += `

## 🆕 新增规则 (${new Date().toISOString().split('T')[0]})

${updates.newRules}
`;
  }
  
  writeRuleFile('.project-structure-rules.md', updated);
  console.log('✅ .project-structure-rules.md 已更新');
  return true;
}

// ============ 版本管理 ============

/**
 * 版本号递增
 */
function incrementVersion(version) {
  const parts = version.split('.').map(Number);
  parts[2]++; // 增加补丁号
  return parts.join('.');
}

/**
 * 获取规则文件版本信息
 */
function getRuleVersions() {
  const versions = {};
  
  for (const file of RULE_FILES) {
    const content = readRuleFile(file);
    if (content) {
      const versionMatch = content.match(/版本: (\d+\.\d+\.\d+)/);
      const dateMatch = content.match(/最后更新: (.+)/);
      
      versions[file] = {
        version: versionMatch ? versionMatch[1] : 'unknown',
        lastUpdate: dateMatch ? dateMatch[1] : 'unknown',
      };
    }
  }
  
  return versions;
}

/**
 * 创建规则变更日志
 */
function createChangeLog(updates) {
  const changelogPath = path.join(ROOT_DIR, 'RULES_CHANGELOG.md');
  
  let changelog = '';
  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf-8');
  }
  
  const today = new Date().toISOString().split('T')[0];
  const version = getRuleVersions()['CLAUDE.md']?.version || '1.0.0';
  
  const entry = `## ${today} - v${version}

${updates.description || '规则更新'}

`;
  
  changelog = entry + changelog;
  
  fs.writeFileSync(changelogPath, changelog, 'utf-8');
  console.log('✅ 变更日志已更新');
}

// ============ 交互式更新 ============

/**
 * 交互式问答
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
 * 交互式更新规则
 */
async function interactiveUpdate() {
  console.log('📝 AI规则文件更新工具');
  console.log('=' .repeat(60));
  console.log('');
  
  // 检查现有规则文件
  const status = checkRuleFiles();
  
  console.log('📋 规则文件状态:');
  console.log(`  ✅ 已存在: ${status.existing.join(', ') || '无'}`);
  console.log(`  ❌ 缺失: ${status.missing.join(', ') || '无'}`);
  console.log('');
  
  // 选择更新类型
  console.log('选择更新类型:');
  console.log('  1. 更新项目信息');
  console.log('  2. 添加新规则');
  console.log('  3. 添加禁止行为');
  console.log('  4. 添加必须行为');
  console.log('  5. 更新所有规则文件');
  console.log('  6. 查看版本信息');
  console.log('');
  
  const choice = await prompt('选择 (1-6)', '1');
  
  const updates = {
    description: await prompt('更新说明', ''),
  };
  
  switch (choice) {
    case '1':
      updates.projectName = await prompt('项目名称', '');
      updates.projectType = await prompt('项目类型', '');
      updates.techStack = await prompt('技术栈', '');
      break;
      
    case '2':
      console.log('输入新规则（支持多行，空行结束）:');
      const lines = [];
      while (true) {
        const line = await prompt(`  第${lines.length + 1}行`, '');
        if (line === '') break;
        lines.push(line);
      }
      updates.newSection = lines.join('\n');
      break;
      
    case '3':
      console.log('输入新的禁止行为（支持多行，空行结束）:');
      const lines = [];
      while (true) {
        const line = await prompt(`  第${lines.length + 1}行`, '');
        if (line === '') break;
        lines.push(line);
      }
      updates.newProhibitions = lines.join('\n');
      break;
      
    case '4':
      console.log('输入新的必须行为（支持多行，空行结束）:');
      const lines = [];
      while (true) {
        const line = await prompt(`  第${lines.length + 1}行`, '');
        if (line === '') break;
        lines.push(line);
      }
      updates.newRequirements = lines.join('\n');
      break;
      
    case '5':
      updates.projectName = await prompt('项目名称', '');
      updates.projectType = await prompt('项目类型', '');
      updates.techStack = await prompt('技术栈', '');
      console.log('输入新规则（支持多行，空行结束）:');
      const lines = [];
      while (true) {
        const line = await prompt(`  第${lines.length + 1}行`, '');
        if (line === '') break;
        lines.push(line);
      }
      updates.newSection = lines.join('\n');
      break;
      
    case '6':
      const versions = getRuleVersions();
      console.log('\n📊 规则文件版本:');
      for (const [file, info] of Object.entries(versions)) {
        console.log(`  ${file}: v${info.version} (${info.lastUpdate})`);
      }
      return;
      
    default:
      console.log('❌ 无效选择');
      return;
  }
  
  console.log('');
  console.log('🔧 开始更新...');
  console.log('');
  
  // 执行更新
  if (status.existing.includes('CLAUDE.md')) {
    updateClaudeMD(updates);
  }
  
  if (status.existing.includes('.cursorrules')) {
    updateCursorRules(updates);
  }
  
  if (status.existing.includes('.project-structure-rules.md')) {
    updateStructureRules(updates);
  }
  
  // 创建变更日志
  createChangeLog(updates);
  
  console.log('');
  console.log('✨ 规则更新完成！');
  console.log('');
  console.log('💡 下次更新时，运行:');
  console.log('   node scripts/update-rules.mjs');
  console.log('');
}

// ============ 命令行模式 ============

/**
 * 命令行更新规则
 */
function commandLineUpdate(args) {
  const updates = {};
  
  // 解析参数
  for (const arg of args) {
    if (arg.startsWith('--name=')) {
      updates.projectName = arg.split('=')[1];
    } else if (arg.startsWith('--type=')) {
      updates.projectType = arg.split('=')[1];
    } else if (arg.startsWith('--tech=')) {
      updates.techStack = arg.split('=')[1];
    } else if (arg.startsWith('--add=')) {
      updates.newSection = arg.split('=')[1];
    } else if (arg.startsWith('--prohibit=')) {
      updates.newProhibitions = arg.split('=')[1];
    } else if (arg.startsWith('--require=')) {
      updates.newRequirements = arg.split('=')[1];
    } else if (arg.startsWith('--desc=')) {
      updates.description = arg.split('=')[1];
    }
  }
  
  if (Object.keys(updates).length === 0) {
    console.log('❌ 没有提供更新参数');
    console.log('');
    console.log('用法:');
    console.log('  node scripts/update-rules.mjs --name=新名称');
    console.log('  node scripts/update-rules.mjs --type=新类型');
    console.log('  node scripts/update-rules.mjs --add="新规则内容"');
    console.log('  node scripts/update-rules.mjs --prohibit="新的禁止行为"');
    console.log('  node scripts/update-rules.mjs --require="新的必须行为"');
    console.log('  node scripts/update-rules.mjs --desc="更新说明"');
    return;
  }
  
  // 检查文件状态
  const status = checkRuleFiles();
  
  // 执行更新
  if (status.existing.includes('CLAUDE.md')) {
    updateClaudeMD(updates);
  }
  
  if (status.existing.includes('.cursorrules')) {
    updateCursorRules(updates);
  }
  
  if (status.existing.includes('.project-structure-rules.md')) {
    updateStructureRules(updates);
  }
  
  // 创建变更日志
  createChangeLog(updates);
}

// ============ 主函数 ============

async function main() {
  const args = process.argv.slice(2);
  
  // 查看版本
  if (args.includes('--version') || args.includes('-v')) {
    const versions = getRuleVersions();
    console.log('📊 规则文件版本:');
    for (const [file, info] of Object.entries(versions)) {
      console.log(`  ${file}: v${info.version} (${info.lastUpdate})`);
    }
    return;
  }
  
  // 检查状态
  if (args.includes('--status')) {
    const status = checkRuleFiles();
    console.log('📋 规则文件状态:');
    console.log(`  ✅ 已存在: ${status.existing.join(', ') || '无'}`);
    console.log(`  ❌ 缺失: ${status.missing.join(', ') || '无'}`);
    
    const versions = getRuleVersions();
    if (Object.keys(versions).length > 0) {
      console.log('');
      console.log('📊 版本信息:');
      for (const [file, info] of Object.entries(versions)) {
        console.log(`  ${file}: v${info.version} (${info.lastUpdate})`);
      }
    }
    return;
  }
  
  // 交互式或命令行模式
  if (args.length === 0) {
    await interactiveUpdate();
  } else {
    commandLineUpdate(args);
  }
}

// 运行
main();
