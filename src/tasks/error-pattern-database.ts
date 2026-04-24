/**
 * 错误模式知识库
 * 
 * 用于积累历史错误分析数据，形成可复用的错误模式库
 * 支持：
 * 1. 错误模式匹配
 * 2. 常见错误自动识别
 * 3. 修复建议自动生成
 * 4. 预防策略推荐
 */

import type { ErrorRootCauseReport } from "./error-root-cause-analysis.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 错误模式
 */
export interface ErrorPattern {
  id: string;
  name: string;
  category: "security" | "performance" | "logic" | "ui" | "data" | "integration" | "other";
  severity: "critical" | "high" | "medium" | "low";
  
  // 错误特征
  symptoms: string[];          // 错误症状描述
  keywords: string[];          // 关键词（用于自动匹配）
  codePatterns: string[];      // 代码模式（正则表达式）
  
  // 根源信息
  commonCauses: string[];      // 常见原因
  rootCausePattern: string;    // 根源模式描述
  
  // 修复方案
  fixSuggestions: string[];    // 修复建议
  fixComplexity: "easy" | "medium" | "hard";
  estimatedFixTime: "minutes" | "hours" | "days";
  
  // 预防措施
  preventionMeasures: string[];
  bestPractices: string[];
  
  // 统计信息
  occurrenceCount: number;     // 出现次数
  firstSeen: number;           // 首次发现时间
  lastSeen: number;            // 最后发现时间
  
  // 相关案例
  relatedCases: string[];      // 相关案例 ID
}

/**
 * 错误案例
 */
export interface ErrorCase {
  id: string;
  patternId: string;           // 关联的错误模式
  report: ErrorRootCauseReport; // 完整的根源分析报告
  resolvedAt?: number;         // 解决时间
  resolution: string;          // 解决方案
  lessonLearned: string;       // 经验教训
}

// ============================================================================
// 错误模式库
// ============================================================================

/**
 * 预定义的错误模式库
 */
export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    id: "xss-vulnerability",
    name: "XSS 跨站脚本攻击",
    category: "security",
    severity: "critical",
    symptoms: [
      "用户输入未经转义直接输出到 HTML",
      "JavaScript 代码注入",
      "恶意脚本执行"
    ],
    keywords: ["xss", "跨站", "脚本注入", "innerHTML", "dangerouslySetInnerHTML"],
    codePatterns: [
      "innerHTML\\s*=",
      "dangerouslySetInnerHTML",
      "document\\.write\\(",
      "eval\\("
    ],
    commonCauses: [
      "未对用户输入进行 HTML 转义",
      "直接使用 innerHTML 插入用户数据",
      "缺少内容安全策略（CSP）"
    ],
    rootCausePattern: "输入验证和输出编码不足",
    fixSuggestions: [
      "使用安全的 DOM API（如 textContent）",
      "对所有用户输入进行 HTML 转义",
      "实施内容安全策略（CSP）",
      "使用框架提供的安全机制（如 React 的自动转义）"
    ],
    fixComplexity: "medium",
    estimatedFixTime: "hours",
    preventionMeasures: [
      "代码审查时重点关注用户输入处理",
      "使用自动化安全扫描工具",
      "进行安全培训"
    ],
    bestPractices: [
      "始终假设所有输入都是恶意的",
      "输出编码优于输入验证",
      "使用白名单而非黑名单"
    ],
    occurrenceCount: 0,
    firstSeen: 0,
    lastSeen: 0,
    relatedCases: []
  },
  {
    id: "sql-injection",
    name: "SQL 注入攻击",
    category: "security",
    severity: "critical",
    symptoms: [
      "SQL 查询直接拼接用户输入",
      "数据库异常暴露敏感信息",
      "未使用参数化查询"
    ],
    keywords: ["sql injection", "sql注入", "query", "concatenate", "string interpolation"],
    codePatterns: [
      "query\\(.*\\+.*\\)",
      "query\\(`.*\\$\\{",
      "exec\\(.*\\+"
    ],
    commonCauses: [
      "使用字符串拼接构建 SQL 查询",
      "未使用参数化查询或 ORM",
      "数据库权限配置不当"
    ],
    rootCausePattern: "不安全的数据库查询构建方式",
    fixSuggestions: [
      "使用参数化查询",
      "使用 ORM 框架",
      "实施最小权限原则",
      "对输入进行严格验证"
    ],
    fixComplexity: "medium",
    estimatedFixTime: "hours",
    preventionMeasures: [
      "代码审查强制检查 SQL 查询",
      "使用静态代码分析工具",
      "进行数据库安全培训"
    ],
    bestPractices: [
      "永远不要信任用户输入",
      "始终使用参数化查询",
      "定期审查数据库权限"
    ],
    occurrenceCount: 0,
    firstSeen: 0,
    lastSeen: 0,
    relatedCases: []
  },
  {
    id: "null-reference",
    name: "空引用错误",
    category: "logic",
    severity: "high",
    symptoms: [
      "TypeError: Cannot read property of null",
      "对象属性访问崩溃",
      "未定义变量引用"
    ],
    keywords: ["null", "undefined", "typeerror", "cannot read", "property"],
    codePatterns: [
      "\\.\\w+\\(\\)",
      "\\[\\w+\\]",
      "optional chaining missing"
    ],
    commonCauses: [
      "未检查对象是否为 null/undefined",
      "异步数据未正确加载",
      "API 响应格式变化"
    ],
    rootCausePattern: "缺少空值检查或防御性编程",
    fixSuggestions: [
      "使用可选链操作符（?.）",
      "添加空值合并操作符（??）",
      "在访问前进行类型检查",
      "使用 TypeScript 严格模式"
    ],
    fixComplexity: "easy",
    estimatedFixTime: "minutes",
    preventionMeasures: [
      "启用 TypeScript 严格空值检查",
      "使用 ESLint 规则",
      "编写单元测试覆盖边界情况"
    ],
    bestPractices: [
      "始终假设外部数据可能为空",
      "使用 TypeScript 的类型系统",
      "实施防御性编程"
    ],
    occurrenceCount: 0,
    firstSeen: 0,
    lastSeen: 0,
    relatedCases: []
  }
];

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 匹配错误模式
 */
export function matchErrorPattern(
  errorDescription: string,
  codeSnippet?: string
): ErrorPattern | null {
  const searchText = `${errorDescription} ${codeSnippet || ""}`.toLowerCase();
  
  for (const pattern of ERROR_PATTERNS) {
    // 检查关键词匹配
    for (const keyword of pattern.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        return pattern;
      }
    }
    
    // 检查代码模式匹配
    if (codeSnippet) {
      for (const codePattern of pattern.codePatterns) {
        try {
          const regex = new RegExp(codePattern, "i");
          if (regex.test(codeSnippet)) {
            return pattern;
          }
        } catch {
          // 忽略无效正则
        }
      }
    }
  }
  
  return null;
}

/**
 * 记录错误案例
 */
export function recordErrorCase(
  errorCase: ErrorCase
): void {
  // 更新模式的统计信息
  const pattern = ERROR_PATTERNS.find(p => p.id === errorCase.patternId);
  if (pattern) {
    pattern.occurrenceCount++;
    const now = Date.now();
    if (!pattern.firstSeen) {
      pattern.firstSeen = now;
    }
    pattern.lastSeen = now;
    pattern.relatedCases.push(errorCase.id);
  }
  
  // TODO: 实际实现时应保存到数据库或文件
  console.log(`[Error Pattern] Recorded case: ${errorCase.id} for pattern: ${errorCase.patternId}`);
}

/**
 * 获取模式的修复建议
 */
export function getPatternFixSuggestions(patternId: string): string[] {
  const pattern = ERROR_PATTERNS.find(p => p.id === patternId);
  return pattern?.fixSuggestions ?? [];
}

/**
 * 获取模式的预防措施
 */
export function getPatternPreventionMeasures(patternId: string): string[] {
  const pattern = ERROR_PATTERNS.find(p => p.id === patternId);
  return pattern?.preventionMeasures ?? [];
}

/**
 * 生成错误模式统计报告
 */
export function generatePatternReport(): {
  totalPatterns: number;
  totalCases: number;
  topPatterns: Array<{ name: string; count: number }>;
  categoryDistribution: Record<string, number>;
} {
  const totalPatterns = ERROR_PATTERNS.length;
  const totalCases = ERROR_PATTERNS.reduce((sum, p) => sum + p.occurrenceCount, 0);
  
  const topPatterns = ERROR_PATTERNS
    .filter(p => p.occurrenceCount > 0)
    .toSorted((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 5)
    .map(p => ({ name: p.name, count: p.occurrenceCount }));
  
  const categoryDistribution: Record<string, number> = {};
  for (const pattern of ERROR_PATTERNS) {
    categoryDistribution[pattern.category] = 
      (categoryDistribution[pattern.category] || 0) + pattern.occurrenceCount;
  }
  
  return {
    totalPatterns,
    totalCases,
    topPatterns,
    categoryDistribution
  };
}
