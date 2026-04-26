#!/usr/bin/env node

/**
 * 幻觉自动检测工具
 * 
 * 三级治理机制的自动化实施
 * 
 * 使用方式：
 *   node scripts/hallucination-check.mjs --full
 *   node scripts/hallucination-check.mjs --task TASK_ID
 *   node scripts/detect-hallucinations.mjs --type code
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ============ 幻觉模式定义 ============

/**
 * 常见幻觉模式
 */
const HALLUCINATION_PATTERNS = {
  // 1. 无引用的技术声明
  unclaimedTechnicalClaim: {
    pattern: /(should|must|can|will)\s+(be|have|do|use|call)\s+[a-zA-Z]+/i,
    severity: 'medium',
    description: '未引用的技术声明',
  },
  
  // 2. 不确定性词汇
  uncertaintyWords: {
    pattern: /\b(maybe|perhaps|probably|possibly|might|could|think|guess|suppose)\b/i,
    severity: 'low',
    description: '使用不确定性词汇（可能暗示推测）',
  },
  
  // 3. 虚假API调用
  fakeAPICall: {
    pattern: /(?:fetch|call|invoke|request)\s+(?:the\s+)?(?:API\s+)?[a-zA-Z]+/i,
    severity: 'high',
    description: '可能未验证的API调用',
  },
  
  // 4. 过时的信息
  outdatedInfo: {
    pattern: /\b(version\s+1\.|deprecated|legacy|old)\b/i,
    severity: 'medium',
    description: '可能过时的信息',
  },
  
  // 5. 矛盾声明
  contradictoryClaim: {
    pattern: /\b(however|but|although|despite|on the other hand)\b/i,
    severity: 'high',
    description: '可能的矛盾声明',
  },
  
  // 6. 没有证据的断言
  baselessAssertion: {
    pattern: /\b(clearly|obviously|definitely|certainly|undoubtedly)\b/i,
    severity: 'medium',
    description: '没有证据的强断言',
  },
};

// ============ 置信度分析 ============

/**
 * 分析文本的置信度
 */
function analyzeConfidence(text) {
  const highConfidenceIndicators = [
    /according to/i,
    /based on/i,
    /as documented/i,
    /official (documentation|guide|tutorial)/i,
    /source[:\s]/i,
    /reference[:\s]/i,
    /\[https?:\/\//i,
  ];
  
  const lowConfidenceIndicators = [
    /i think/i,
    /i believe/i,
    /maybe/i,
    /perhaps/i,
    /probably/i,
    /possibly/i,
    /might/i,
    /could be/i,
    /i guess/i,
    /not sure/i,
  ];
  
  let confidenceScore = 70; // 默认中等置信度
  
  // 检查高置信度指标
  for (const indicator of highConfidenceIndicators) {
    if (indicator.test(text)) {
      confidenceScore += 5;
    }
  }
  
  // 检查低置信度指标
  for (const indicator of lowConfidenceIndicators) {
    if (indicator.test(text)) {
      confidenceScore -= 10;
    }
  }
  
  // 限制在0-100范围
  return Math.max(0, Math.min(100, confidenceScore));
}

// ============ 检测函数 ============

/**
 * 检测文本中的潜在幻觉
 */
function detectHallucinations(text) {
  const findings = [];
  
  for (const [patternName, patternDef] of Object.entries(HALLUCINATION_PATTERNS)) {
    const matches = text.match(patternDef.pattern);
    
    if (matches) {
      findings.push({
        type: patternName,
        severity: patternDef.severity,
        description: patternDef.description,
        match: matches[0],
        position: text.indexOf(matches[0]),
      });
    }
  }
  
  // 分析置信度
  const confidence = analyzeConfidence(text);
  if (confidence < 70) {
    findings.push({
      type: 'lowConfidence',
      severity: 'high',
      description: `低置信度回答 (${confidence}%)`,
      confidence,
    });
  }
  
  // 检查是否有引用
  const hasCitations = /https?:\/\/|\[.*?\]\(|source|reference|documentation/i.test(text);
  if (!hasCitations && findings.length > 0) {
    findings.push({
      type: 'missingCitation',
      severity: 'medium',
      description: '缺少引用来源',
    });
  }
  
  return findings;
}

// ============ 文件扫描 ============

/**
 * 扫描文件中的幻觉
 */
function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const findings = detectHallucinations(content);
  
  return findings.map(finding => ({
    ...finding,
    file: filePath,
  }));
}

/**
 * 扫描目录中的所有TypeScript文件
 */
function scanDirectory(dirPath) {
  const allFindings = [];
  
  function scan(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // 跳过node_modules等
        if (!['node_modules', '.git', 'dist', 'build'].includes(file)) {
          scan(fullPath);
        }
      } else if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.md')) {
        const findings = scanFile(fullPath);
        allFindings.push(...findings);
      }
    }
  }
  
  scan(dirPath);
  return allFindings;
}

// ============ 报告生成 ============

/**
 * 生成检测报告
 */
function generateReport(findings, options = {}) {
  const {
    outputFile = '.hallucination-report.json',
    verbose = false,
  } = options;
  
  // 按严重程度统计
  const severityCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  
  for (const finding of findings) {
    severityCount[finding.severity] = (severityCount[finding.severity] || 0) + 1;
  }
  
  // 生成报告
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFindings: findings.length,
      bySeverity: severityCount,
      riskLevel: severityCount.critical > 0 ? 'CRITICAL' :
                 severityCount.high > 5 ? 'HIGH' :
                 severityCount.medium > 10 ? 'MEDIUM' : 'LOW',
    },
    findings: findings.slice(0, 100), // 最多显示100个
  };
  
  // 输出报告
  if (verbose) {
    console.log('\n🔍 幻觉检测报告');
    console.log('=' .repeat(70));
    console.log(`\n总计发现: ${findings.length} 个潜在问题`);
    console.log(`\n按严重程度:`);
    console.log(`  🔴 Critical: ${severityCount.critical}`);
    console.log(`  ❌ High: ${severityCount.high}`);
    console.log(`  ⚠️  Medium: ${severityCount.medium}`);
    console.log(`  📝 Low: ${severityCount.low}`);
    console.log(`\n风险等级: ${report.summary.riskLevel}`);
    
    if (findings.length > 0) {
      console.log('\n前10个问题:');
      findings.slice(0, 10).forEach((finding, index) => {
        console.log(`\n${index + 1}. [${finding.severity.toUpperCase()}] ${finding.description}`);
        if (finding.file) {
          console.log(`   文件: ${finding.file}`);
        }
        if (finding.match) {
          console.log(`   匹配: "${finding.match}"`);
        }
      });
    }
  }
  
  // 保存到文件
  const outputPath = path.join(ROOT_DIR, outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n📝 详细报告已保存到: ${outputPath}`);
  
  return report;
}

// ============ 主函数 ============

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍 幻觉检测工具

用法：
  node scripts/hallucination-check.mjs [选项]

选项：
  --full                    完整扫描项目
  --type <type>             扫描特定类型 (code|docs|output)
  --file <path>             扫描特定文件
  --task <id>               检查特定任务的输出
  --verbose                 详细输出
  --output <path>           输出报告路径

示例：
  node scripts/hallucination-check.mjs --full --verbose
  node scripts/hallucination-check.mjs --type code
  node scripts/hallucination-check.mjs --file src/example.ts
    `);
    return;
  }
  
  let findings = [];
  
  if (args.includes('--full')) {
    console.log('🔍 开始完整扫描...');
    findings = scanDirectory(path.join(ROOT_DIR, 'src'));
    console.log(`扫描完成，发现 ${findings.length} 个潜在问题`);
  } else if (args.includes('--type')) {
    const typeIndex = args.indexOf('--type') + 1;
    const type = args[typeIndex];
    
    if (type === 'code') {
      console.log('🔍 扫描代码文件...');
      findings = scanDirectory(path.join(ROOT_DIR, 'src'));
    } else if (type === 'docs') {
      console.log('🔍 扫描文档文件...');
      findings = scanDirectory(path.join(ROOT_DIR, 'docs'));
    }
  } else if (args.includes('--file')) {
    const fileIndex = args.indexOf('--file') + 1;
    const filePath = path.resolve(ROOT_DIR, args[fileIndex]);
    console.log(`🔍 扫描文件: ${filePath}`);
    findings = scanFile(filePath);
  } else {
    console.log('❌ 请指定扫描目标（使用 --help 查看帮助）');
    process.exit(1);
  }
  
  const verbose = args.includes('--verbose');
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex > 0 ? args[outputIndex + 1] : '.hallucination-report.json';
  
  generateReport(findings, { outputFile, verbose });
  
  // 如果发现严重问题，返回非零退出码
  const hasCritical = findings.some(f => f.severity === 'critical' || f.severity === 'high');
  process.exit(hasCritical ? 2 : 0);
}

main();
