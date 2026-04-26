#!/usr/bin/env node

/**
 * AI团队健康度全面检查工具
 * 
 * 基于业界最佳实践（2025-2026）的全面审计
 * 涵盖：治理、安全、质量保证、监控、协作
 * 
 * 使用方式：
 *   node scripts/ai-team-health-check.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ============ 检查项定义 ============

/**
 * 检查类别
 */
const CHECK_CATEGORIES = {
  governance: {
    name: '治理与规范',
    weight: 0.20,
    checks: [
      {
        id: 'agent-registry',
        name: 'Agent注册表',
        description: '是否有所有Agent的清单和职责定义',
        check: () => checkFileExists('src/agents/agent-registry.json'),
        severity: 'high',
      },
      {
        id: 'role-definitions',
        name: '角色定义清晰度',
        description: '每个Agent是否有明确的角色和职责',
        check: () => checkAgentRoles(),
        severity: 'high',
      },
      {
        id: 'permission-system',
        name: '权限系统',
        description: '是否有完善的权限控制（读/写/执行/审批）',
        check: () => checkFileExists('src/permissions/approval-system.ts'),
        severity: 'critical',
      },
      {
        id: 'audit-logging',
        name: '审计日志',
        description: '所有Agent操作是否有完整日志',
        check: () => checkDirectoryExists('src/audit') || checkDirectoryExists('src/logging'),
        severity: 'high',
      },
    ]
  },
  
  security: {
    name: '安全与合规',
    weight: 0.25,
    checks: [
      {
        id: 'prompt-injection-protection',
        name: '提示注入防护',
        description: '是否有防护Prompt Injection的机制',
        check: () => searchCodeFor('prompt.*injection|sanitize.*input|input.*validation'),
        severity: 'critical',
      },
      {
        id: 'tool-permissions',
        name: '工具权限分级',
        description: '工具是否按风险分级（只读/写入/不可逆）',
        check: () => checkToolPermissionLevels(),
        severity: 'critical',
      },
      {
        id: 'pii-redaction',
        name: '敏感信息脱敏',
        description: '是否有PII（个人身份信息）脱敏机制',
        check: () => searchCodeFor('pii.*redact|redact.*pii|sensitive.*data'),
        severity: 'high',
      },
      {
        id: 'rate-limiting',
        name: '速率限制',
        description: '是否有API调用速率限制',
        check: () => searchCodeFor('rate.*limit|throttle|backoff'),
        severity: 'medium',
      },
      {
        id: 'human-approval',
        name: '人类审批门禁',
        description: '高风险操作是否需要人类审批',
        check: () => checkFileExists('src/permissions/approval-system.ts'),
        severity: 'critical',
      },
    ]
  },
  
  quality: {
    name: '质量保证',
    weight: 0.20,
    checks: [
      {
        id: 'code-review',
        name: '代码评审机制',
        description: '是否有自动代码评审（Critic Agent）',
        check: () => searchCodeFor('critic|review|adversarial'),
        severity: 'high',
      },
      {
        id: 'automated-testing',
        name: '自动化测试',
        description: 'AI生成的代码是否有自动化测试',
        check: () => checkDirectoryExists('test') || checkDirectoryExists('tests'),
        severity: 'high',
      },
      {
        id: 'quality-gates',
        name: '质量门禁',
        description: '是否有质量门禁（完整性/准确性/安全性）',
        check: () => checkFileExists('src/agents/task-quality-evaluator.ts'),
        severity: 'high',
      },
      {
        id: 'hallucination-detection',
        name: '幻觉检测',
        description: '是否有幻觉检测和治理机制',
        check: () => searchCodeFor('hallucination|fact.*check|verification'),
        severity: 'critical',
      },
      {
        id: 'acceptance-criteria',
        name: '验收标准',
        description: '任务是否有明确的验收标准',
        check: () => searchCodeFor('acceptance.*criteria|definition.*done'),
        severity: 'high',
      },
    ]
  },
  
  observability: {
    name: '可观测性',
    weight: 0.20,
    checks: [
      {
        id: 'agent-monitoring',
        name: 'Agent监控',
        description: '是否有Agent运行时监控',
        check: () => searchCodeFor('monitor|observability|telemetry'),
        severity: 'high',
      },
      {
        id: 'metrics-collection',
        name: '指标收集',
        description: '是否收集关键指标（响应时间/成功率/成本）',
        check: () => searchCodeFor('metrics|stats|prometheus'),
        severity: 'high',
      },
      {
        id: 'error-tracking',
        name: '错误追踪',
        description: '是否有错误追踪和告警',
        check: () => searchCodeFor('error.*tracking|sentry|alert'),
        severity: 'high',
      },
      {
        id: 'cost-tracking',
        name: '成本追踪',
        description: '是否有Token和API成本追踪',
        check: () => searchCodeFor('cost|token.*usage|billing'),
        severity: 'medium',
      },
      {
        id: 'incident-replay',
        name: '事故回放',
        description: '是否有事故记录和回放机制',
        check: () => searchCodeFor('replay|incident|postmortem'),
        severity: 'medium',
      },
    ]
  },
  
  collaboration: {
    name: '协作与沟通',
    weight: 0.15,
    checks: [
      {
        id: 'multi-agent-coordination',
        name: '多Agent协调',
        description: '是否有多Agent协调机制',
        check: () => searchCodeFor('orchestrat|coordinat|multi.*agent'),
        severity: 'high',
      },
      {
        id: 'conflict-resolution',
        name: '冲突解决',
        description: '是否有Agent间冲突解决机制',
        check: () => searchCodeFor('conflict|disagree|consensus'),
        severity: 'medium',
      },
      {
        id: 'shared-memory',
        name: '共享记忆',
        description: '是否有项目级共享记忆',
        check: () => searchCodeFor('shared.*memory|project.*memory|SHARED_MEMORY'),
        severity: 'high',
      },
      {
        id: 'handoff-protocol',
        name: '交接协议',
        description: 'Agent间任务交接是否有标准协议',
        check: () => searchCodeFor('handoff|hand.*over|transfer'),
        severity: 'medium',
      },
    ]
  }
};

// ============ 检查函数 ============

function checkFileExists(filePath) {
  return fs.existsSync(path.join(ROOT_DIR, filePath));
}

function checkDirectoryExists(dirPath) {
  return fs.existsSync(path.join(ROOT_DIR, dirPath));
}

function searchCodeFor(pattern) {
  try {
    const result = execSync(`grep -r -i "${pattern}" src/ --include="*.ts" --include="*.js" | head -5`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function checkAgentRoles() {
  // 检查system-prompt.ts是否有角色定义
  const systemPromptPath = path.join(ROOT_DIR, 'src/agents/system-prompt.ts');
  if (!fs.existsSync(systemPromptPath)) return false;
  
  const content = fs.readFileSync(systemPromptPath, 'utf-8');
  return content.includes('role') && (content.includes('planner') || content.includes('executor') || content.includes('critic'));
}

async function checkToolPermissionLevels() {
  // 检查工具是否有权限分级
  const permissionPath = path.join(ROOT_DIR, 'src/permissions');
  if (!fs.existsSync(permissionPath)) return false;
  
  const files = fs.readdirSync(permissionPath);
  return files.some(f => f.includes('permission') || f.includes('approval'));
}

// ============ 执行检查 ============

async function runAllChecks() {
  console.log('🔍 AI团队健康度全面检查');
  console.log('=' .repeat(70));
  console.log('基于业界最佳实践（2025-2026）\n');
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    categories: {}
  };
  
  for (const [categoryKey, category] of Object.entries(CHECK_CATEGORIES)) {
    console.log(`\n📊 ${category.name} (权重: ${(category.weight * 100).toFixed(0)}%)`);
    console.log('-'.repeat(70));
    
    const categoryResults = {
      total: category.checks.length,
      passed: 0,
      failed: 0,
      critical: 0,
      checks: []
    };
    
    for (const check of category.checks) {
      process.stdout.write(`  ${check.name}... `);
      
      try {
        const passed = await check.check();
        
        if (passed) {
          console.log('✅ 通过');
          categoryResults.passed++;
        } else {
          const severity = check.severity;
          if (severity === 'critical') {
            console.log('🔴 严重缺失');
            categoryResults.critical++;
          } else if (severity === 'high') {
            console.log('❌ 缺失');
            categoryResults.failed++;
          } else {
            console.log('⚠️  警告');
            categoryResults.failed++;
          }
        }
        
        categoryResults.checks.push({
          ...check,
          passed,
          severity: check.severity
        });
      } catch (error) {
        console.log(`❌ 检查失败: ${error.message}`);
        categoryResults.failed++;
      }
    }
    
    results.categories[categoryKey] = categoryResults;
    results.total += categoryResults.total;
    results.passed += categoryResults.passed;
    results.failed += categoryResults.failed;
    results.warnings += categoryResults.critical;
  }
  
  return results;
}

// ============ 生成报告 ============

function generateReport(results) {
  console.log('\n' + '=' .repeat(70));
  console.log('📈 健康度报告');
  console.log('=' .repeat(70));
  
  // 总分计算
  let totalScore = 0;
  for (const [categoryKey, categoryResult] of Object.entries(results.categories)) {
    const category = CHECK_CATEGORIES[categoryKey];
    const score = (categoryResult.passed / categoryResult.total) * 100;
    totalScore += score * category.weight;
    
    console.log(`\n${category.name}:`);
    console.log(`  得分: ${score.toFixed(0)}% (${categoryResult.passed}/${categoryResult.total})`);
    console.log(`  权重: ${(category.weight * 100).toFixed(0)}%`);
    
    if (categoryResult.critical > 0) {
      console.log(`  🔴 严重问题: ${categoryResult.critical} 个`);
    }
  }
  
  console.log(`\n🎯 总得分: ${totalScore.toFixed(0)}/100`);
  
  // 评级
  let grade, color;
  if (totalScore >= 90) {
    grade = 'A+';
    color = '🟢';
  } else if (totalScore >= 80) {
    grade = 'A';
    color = '🟢';
  } else if (totalScore >= 70) {
    grade = 'B';
    color = '🟡';
  } else if (totalScore >= 60) {
    grade = 'C';
    color = '🟠';
  } else {
    grade = 'D';
    color = '🔴';
  }
  
  console.log(`${color} 评级: ${grade}`);
  
  // 关键问题
  console.log('\n' + '=' .repeat(70));
  console.log('⚠️  需要立即解决的问题');
  console.log('=' .repeat(70));
  
  let issueCount = 0;
  for (const [categoryKey, categoryResult] of Object.entries(results.categories)) {
    const category = CHECK_CATEGORIES[categoryKey];
    
    for (const check of categoryResult.checks) {
      if (!check.passed && (check.severity === 'critical' || check.severity === 'high')) {
        issueCount++;
        console.log(`\n${issueCount}. [${category.name}] ${check.name}`);
        console.log(`   严重程度: ${check.severity.toUpperCase()}`);
        console.log(`   ${check.description}`);
      }
    }
  }
  
  if (issueCount === 0) {
    console.log('\n✅ 没有严重问题！');
  }
  
  // 改进建议
  console.log('\n' + '=' .repeat(70));
  console.log('💡 改进建议（基于业界最佳实践）');
  console.log('=' .repeat(70));
  
  const suggestions = generateSuggestions(results);
  suggestions.forEach((suggestion, index) => {
    console.log(`\n${index + 1}. ${suggestion.title}`);
    console.log(`   优先级: ${suggestion.priority}`);
    console.log(`   ${suggestion.description}`);
    if (suggestion.implementation) {
      console.log(`   实施方案: ${suggestion.implementation}`);
    }
  });
  
  console.log('\n' + '=' .repeat(70));
}

function generateSuggestions(results) {
  const suggestions = [];
  
  // 检查幻觉检测
  const qualityChecks = results.categories.quality?.checks || [];
  const hasHallucinationDetection = qualityChecks.find(c => c.id === 'hallucination-detection');
  if (!hasHallucinationDetection?.passed) {
    suggestions.push({
      title: '🔴 建立三级幻觉治理机制',
      priority: 'P0 - 立即',
      description: '业界标准：事前预防 + 事中监督 + 事后管控',
      implementation: '创建 skills/hallucination-governance/SKILL.md'
    });
  }
  
  // 检查Agent注册表
  const governanceChecks = results.categories.governance?.checks || [];
  const hasAgentRegistry = governanceChecks.find(c => c.id === 'agent-registry');
  if (!hasAgentRegistry?.passed) {
    suggestions.push({
      title: '🟡 创建Agent注册表',
      priority: 'P1 - 本周',
      description: '维护所有Agent的清单、职责、权限',
      implementation: '创建 .agent-registry.json'
    });
  }
  
  // 检查监控
  const observabilityChecks = results.categories.observability?.checks || [];
  const hasMonitoring = observabilityChecks.find(c => c.id === 'agent-monitoring');
  if (!hasMonitoring?.passed) {
    suggestions.push({
      title: '🟡 建立Agent监控体系',
      priority: 'P1 - 本周',
      description: '实时监控Agent运行状态、成功率、成本',
      implementation: '集成 Prometheus + Grafana 或类似方案'
    });
  }
  
  // 检查成本追踪
  const hasCostTracking = observabilityChecks.find(c => c.id === 'cost-tracking');
  if (!hasCostTracking?.passed) {
    suggestions.push({
      title: '🟢 实施成本追踪',
      priority: 'P2 - 本月',
      description: '追踪每个Agent的Token使用和API成本',
      implementation: '添加 token-usage 监控和告警'
    });
  }
  
  // 检查冲突解决
  const collaborationChecks = results.categories.collaboration?.checks || [];
  const hasConflictResolution = collaborationChecks.find(c => c.id === 'conflict-resolution');
  if (!hasConflictResolution?.passed) {
    suggestions.push({
      title: '🟢 建立冲突解决机制',
      priority: 'P2 - 本月',
      description: '当Agent意见不一致时，如何达成共识',
      implementation: '实现投票/共识算法或升级机制'
    });
  }
  
  return suggestions;
}

// ============ 主函数 ============

async function main() {
  try {
    const results = await runAllChecks();
    generateReport(results);
    
    // 保存报告
    const reportPath = path.join(ROOT_DIR, '.ai-team-health-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📝 详细报告已保存到: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ 检查失败:', error);
    process.exit(1);
  }
}

main();
