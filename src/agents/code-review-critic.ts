/**
 * 代码评审Critic Agent
 * 
 * 业界标准（Plan-Execute-Review模式）：
 * - 独立的Critic Agent评审代码
 * - 自动化质量检查
 * - 安全漏洞扫描
 * - 最佳实践检查
 */

// ============ 类型定义 ============

/**
 * 评审结果
 */
export type CodeReviewResult = {
  /** 评审ID */
  reviewId: string;
  /** 评审时间 */
  reviewedAt: string;
  /** 评审者 */
  reviewerId: string;
  /** 代码路径 */
  codePath: string;
  
  // 评审维度
  codeQuality: DimensionScore;
  securityIssues: DimensionScore;
  bestPractices: DimensionScore;
  testCoverage: DimensionScore;
  performance: DimensionScore;
  
  // 总体评分
  overallScore: number;
  passed: boolean;
  
  // 发现的问题
  issues: CodeIssue[];
  
  // 改进建议
  suggestions: string[];
  
  // 评审详情
  details: {
    strengths: string[]; // 优点
    weaknesses: string[]; // 缺点
    criticalIssues: string[]; // 严重问题
  };
};

/**
 * 维度评分
 */
export type DimensionScore = {
  score: number; // 0-100
  passed: boolean;
  issues: string[];
};

/**
 * 代码问题
 */
export type CodeIssue = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  line?: number;
  message: string;
  suggestion: string;
};

// ============ 代码评审规则 ============

/**
 * 代码质量检查规则
 */
const CODE_QUALITY_RULES = {
  // 命名规范
  namingConventions: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      // 检查变量名
      if (/\b[a-z]{1}\b/g.test(code)) {
        issues.push({
          severity: 'low',
          type: 'naming',
          message: '变量名过短，应使用有意义的名称',
          suggestion: '使用描述性变量名，如 `userList` 而不是 `u`',
        });
      }
      
      // 检查常量名（应全大写）
      if (/\bconst\s+[a-z][A-Za-z]+\s*=\s*['"\d]/.test(code)) {
        issues.push({
          severity: 'info',
          type: 'naming',
          message: '常量应使用全大写命名',
          suggestion: '使用 SCREAMING_CASE 命名常量',
        });
      }
      
      return issues;
    },
  },
  
  // 函数复杂度
  functionComplexity: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      // 检查函数长度
      const functionMatches = code.match(/function\s+\w+\s*\([^)]*\)\s*{[\s\S]*?}/g);
      if (functionMatches) {
        functionMatches.forEach(fn => {
          const lines = fn.split('\n').length;
          if (lines > 50) {
            issues.push({
              severity: 'medium',
              type: 'complexity',
              message: `函数过长 (${lines} 行)`,
              suggestion: '将函数拆分为更小的子函数（建议 < 50 行）',
            });
          }
        });
      }
      
      // 检查嵌套深度
      if (/\s{12,}/.test(code)) {
        issues.push({
          severity: 'medium',
          type: 'complexity',
          message: '嵌套过深',
          suggestion: '使用提前返回或提取函数减少嵌套',
        });
      }
      
      return issues;
    },
  },
  
  // 错误处理
  errorHandling: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      // 检查是否有try-catch
      if (/async\s+\w+/.test(code) && !/try\s*{/.test(code)) {
        issues.push({
          severity: 'high',
          type: 'error-handling',
          message: '异步函数缺少错误处理',
          suggestion: '使用 try-catch 或 .catch() 处理错误',
        });
      }
      
      // 检查空的catch块
      if (/catch\s*\([^)]*\)\s*{[\s\n]*}/.test(code)) {
        issues.push({
          severity: 'critical',
          type: 'error-handling',
          message: '空的catch块会吞掉错误',
          suggestion: '至少记录错误日志：console.error(err)',
        });
      }
      
      return issues;
    },
  },
  
  // 代码重复
  codeDuplication: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      // 简单检查重复代码块
      const lines = code.split('\n');
      for (let i = 0; i < lines.length - 5; i++) {
        const block = lines.slice(i, i + 5).join('\n');
        if (code.indexOf(block, i + 1) !== -1) {
          issues.push({
            severity: 'medium',
            type: 'duplication',
            message: '检测到重复代码块',
            suggestion: '提取为函数或使用循环',
          });
          break;
        }
      }
      
      return issues;
    },
  },
};

/**
 * 安全检查规则
 */
const SECURITY_RULES = {
  // SQL注入
  sqlInjection: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      if (/["'].*SELECT.*FROM.*\+/.test(code) || /["'].*INSERT.*INTO.*\+/.test(code)) {
        issues.push({
          severity: 'critical',
          type: 'security',
          message: '潜在的SQL注入风险',
          suggestion: '使用参数化查询或ORM',
        });
      }
      
      return issues;
    },
  },
  
  // XSS攻击
  xssAttack: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      if (/innerHTML\s*=/.test(code)) {
        issues.push({
          severity: 'high',
          type: 'security',
          message: '使用innerHTML可能导致XSS攻击',
          suggestion: '使用 textContent 或安全的DOM库',
        });
      }
      
      if (/document\.write\(/.test(code)) {
        issues.push({
          severity: 'high',
          type: 'security',
          message: '使用document.write可能导致XSS攻击',
          suggestion: '使用安全的DOM操作方法',
        });
      }
      
      return issues;
    },
  },
  
  // 敏感信息泄露
  sensitiveData: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      // 检查硬编码密码
      if (/\b(password|passwd|pwd)\s*=\s*['"][^'"]+['"]/.test(code)) {
        issues.push({
          severity: 'critical',
          type: 'security',
          message: '硬编码密码',
          suggestion: '使用环境变量或密钥管理服务',
        });
      }
      
      // 检查API密钥
      if (/\b(api[_-]?key|apikey)\s*=\s*['"][^'"]+['"]/.test(code)) {
        issues.push({
          severity: 'critical',
          type: 'security',
          message: '硬编码API密钥',
          suggestion: '使用环境变量或密钥管理服务',
        });
      }
      
      // 检查token
      if (/\b(token|secret)\s*=\s*['"][^'"]+['"]/.test(code)) {
        issues.push({
          severity: 'critical',
          type: 'security',
          message: '硬编码敏感Token',
          suggestion: '使用环境变量或密钥管理服务',
        });
      }
      
      return issues;
    },
  },
  
  // 路径遍历
  pathTraversal: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      if (/fs\.(readFile|writeFile|stat)\s*\([^)]*\+/.test(code)) {
        issues.push({
          severity: 'high',
          type: 'security',
          message: '潜在的路径遍历风险',
          suggestion: '验证和清理文件路径',
        });
      }
      
      return issues;
    },
  },
};

/**
 * 最佳实践检查规则
 */
const BEST_PRACTICES_RULES = {
  // TypeScript类型
  typeSafety: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      if (/:\s*any/.test(code)) {
        issues.push({
          severity: 'medium',
          type: 'best-practice',
          message: '使用any类型失去类型安全',
          suggestion: '使用具体类型或unknown',
        });
      }
      
      // @ts-ignore
      if (/\/\/\s*@ts-ignore/.test(code)) {
        issues.push({
          severity: 'medium',
          type: 'best-practice',
          message: '使用@ts-ignore抑制类型检查',
          suggestion: '修复类型错误而不是抑制',
        });
      }
      
      return issues;
    },
  },
  
  // 异步处理
  asyncHandling: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      // 未await的Promise
      if (/\w+\s*=\s*\w+\(.*\);/.test(code) && !/await/.test(code) && /=\s*async/.test(code)) {
        issues.push({
          severity: 'high',
          type: 'best-practice',
          message: '未await的异步调用',
          suggestion: '添加 await 关键字',
        });
      }
      
      return issues;
    },
  },
  
  // 导入顺序
  importOrder: {
    check: (code: string) => {
      const issues: CodeIssue[] = [];
      
      // 检查是否有混合导入
      const importLines = code.split('\n').filter(line => line.trim().startsWith('import'));
      let lastType = '';
      
      for (const line of importLines) {
        const type = line.includes('node:') ? 'builtin' : 
                     line.includes('.') ? 'relative' : 'external';
        
        if (lastType && type !== lastType) {
          issues.push({
            severity: 'info',
            type: 'best-practice',
            message: '导入应按类型分组',
            suggestion: '顺序：内置模块 → 外部模块 → 相对路径',
          });
          break;
        }
        lastType = type;
      }
      
      return issues;
    },
  },
};

// ============ 评审引擎 ============

/**
 * 执行代码评审
 */
export async function reviewCode(
  code: string,
  codePath: string,
  reviewerId: string = 'reviewer'
): Promise<CodeReviewResult> {
  const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  // 执行所有检查
  const allIssues: CodeIssue[] = [];
  
  // 代码质量检查
  for (const rule of Object.values(CODE_QUALITY_RULES)) {
    allIssues.push(...rule.check(code));
  }
  
  // 安全检查
  for (const rule of Object.values(SECURITY_RULES)) {
    allIssues.push(...rule.check(code));
  }
  
  // 最佳实践检查
  for (const rule of Object.values(BEST_PRACTICES_RULES)) {
    allIssues.push(...rule.check(code));
  }
  
  // 计算各维度分数
  const codeQuality = calculateDimensionScore(allIssues, ['naming', 'complexity', 'duplication']);
  const securityIssues = calculateDimensionScore(allIssues, ['security']);
  const bestPractices = calculateDimensionScore(allIssues, ['best-practice', 'error-handling']);
  const testCoverage = { score: 0, passed: false, issues: ['未检测到测试文件'] }; // 需要额外检查
  const performance = calculateDimensionScore(allIssues, ['performance']);
  
  // 计算总体分数
  const overallScore = Math.round(
    codeQuality.score * 0.3 +
    securityIssues.score * 0.3 +
    bestPractices.score * 0.2 +
    testCoverage.score * 0.1 +
    performance.score * 0.1
  );
  
  // 判断是否通过
  const passed = overallScore >= 70 && 
                 securityIssues.score >= 80 && 
                 !allIssues.some(i => i.severity === 'critical');
  
  // 生成建议
  const suggestions = generateSuggestions(allIssues);
  
  // 分类问题
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const criticalIssues: string[] = [];
  
  if (codeQuality.score >= 80) strengths.push('代码质量良好');
  if (securityIssues.score >= 90) strengths.push('安全性优秀');
  if (bestPractices.score >= 80) strengths.push('遵循最佳实践');
  
  if (codeQuality.score < 70) weaknesses.push('代码质量需要改进');
  if (securityIssues.score < 80) weaknesses.push('存在安全风险');
  if (bestPractices.score < 70) weaknesses.push('未遵循最佳实践');
  
  allIssues.filter(i => i.severity === 'critical').forEach(i => {
    criticalIssues.push(i.message);
  });
  
  return {
    reviewId,
    reviewedAt: new Date().toISOString(),
    reviewerId,
    codePath,
    codeQuality,
    securityIssues,
    bestPractices,
    testCoverage,
    performance,
    overallScore,
    passed,
    issues: allIssues,
    suggestions,
    details: {
      strengths,
      weaknesses,
      criticalIssues,
    },
  };
}

/**
 * 计算维度分数
 */
function calculateDimensionScore(
  issues: CodeIssue[],
  types: string[]
): DimensionScore {
  const dimensionIssues = issues.filter(i => types.includes(i.type));
  
  let score = 100;
  for (const issue of dimensionIssues) {
    switch (issue.severity) {
      case 'critical':
        score -= 20;
        break;
      case 'high':
        score -= 10;
        break;
      case 'medium':
        score -= 5;
        break;
      case 'low':
        score -= 2;
        break;
      case 'info':
        score -= 1;
        break;
    }
  }
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    passed: score >= 70,
    issues: dimensionIssues.map(i => i.message),
  };
}

/**
 * 生成改进建议
 */
function generateSuggestions(issues: CodeIssue[]): string[] {
  const suggestions: string[] = [];
  const uniqueSuggestions = new Set<string>();
  
  for (const issue of issues) {
    if (!uniqueSuggestions.has(issue.suggestion)) {
      uniqueSuggestions.add(issue.suggestion);
      suggestions.push(issue.suggestion);
    }
  }
  
  return suggestions.slice(0, 10); // 最多10条建议
}
