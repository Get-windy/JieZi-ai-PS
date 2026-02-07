/**
 * 上下文优化器
 * 压缩和优化prompt内容，可节省30-70% token
 * 参考业界最佳实践（Markdown优先、schema压缩等）
 */

import type { TokenOptimizationConfig } from "./config.js";

/**
 * 工具Schema压缩结果
 */
export type CompressedSchema = {
  original: Record<string, unknown>;
  compressed: Record<string, unknown>;
  savedTokens: number;
  savedPercentage: number;
};

/**
 * 上下文优化器
 */
export class ContextOptimizer {
  private config: TokenOptimizationConfig;

  constructor(config: TokenOptimizationConfig) {
    this.config = config;
  }

  /**
   * 压缩工具Schema
   * 策略：移除description、examples、default等非必要字段
   */
  compressToolSchemas(schemas: Record<string, unknown>): CompressedSchema {
    if (!this.config.contextOptimization?.compressToolSchemas) {
      return {
        original: schemas,
        compressed: schemas,
        savedTokens: 0,
        savedPercentage: 0,
      };
    }

    const originalJson = JSON.stringify(schemas);
    const originalTokens = this.estimateTokens(originalJson);

    const compressed = this.removeVerboseFields(schemas) as Record<string, unknown>;
    const compressedJson = JSON.stringify(compressed);
    const compressedTokens = this.estimateTokens(compressedJson);

    const savedTokens = originalTokens - compressedTokens;
    const savedPercentage = (savedTokens / originalTokens) * 100;

    return {
      original: schemas,
      compressed,
      savedTokens,
      savedPercentage,
    };
  }

  /**
   * 递归移除冗余字段
   */
  private removeVerboseFields(obj: unknown): unknown {
    if (!obj || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeVerboseFields(item));
    }

    const result: Record<string, unknown> = {};
    const removeExamples = this.config.contextOptimization?.removeSchemaExamples ?? true;
    const aggressiveMode = this.config.contextOptimization?.aggressiveMode ?? false;

    for (const [key, value] of Object.entries(obj)) {
      // 移除示例
      if (removeExamples && (key === "examples" || key === "example")) {
        continue;
      }

      // 激进模式：移除更多字段
      if (aggressiveMode) {
        if (
          key === "description" ||
          key === "title" ||
          key === "default" ||
          key === "$comment" ||
          key === "format" ||
          key === "pattern"
        ) {
          continue;
        }
      }

      // 递归处理嵌套对象
      result[key] = this.removeVerboseFields(value);
    }

    return result;
  }

  /**
   * 将内容转换为Markdown格式（比JSON节省70% token）
   */
  convertToMarkdown(data: Record<string, unknown>): string {
    if (!this.config.contextOptimization?.preferMarkdown) {
      return JSON.stringify(data, null, 2);
    }

    const lines: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        lines.push(`## ${key}`);
        lines.push("");
        lines.push(this.objectToMarkdownTable(value as Record<string, unknown>));
      } else if (Array.isArray(value)) {
        lines.push(`## ${key}`);
        lines.push("");
        for (const item of value) {
          lines.push(`- ${typeof item === "object" ? JSON.stringify(item) : item}`);
        }
      } else {
        lines.push(`**${key}:** ${value}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 将对象转换为Markdown表格
   */
  private objectToMarkdownTable(obj: Record<string, unknown>): string {
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return "";
    }

    const lines: string[] = [];
    lines.push("| Key | Value |");
    lines.push("|-----|-------|");

    for (const [key, value] of entries) {
      const valueStr =
        typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
      lines.push(`| ${key} | ${valueStr} |`);
    }

    return lines.join("\n");
  }

  /**
   * 压缩workspace文件内容
   */
  compressWorkspaceFile(
    content: string,
    maxChars?: number,
  ): {
    original: string;
    compressed: string;
    savedTokens: number;
  } {
    if (!this.config.contextOptimization?.compressWorkspaceFiles) {
      return {
        original: content,
        compressed: content,
        savedTokens: 0,
      };
    }

    const originalTokens = this.estimateTokens(content);

    // 策略1：移除多余空行
    let compressed = content.replace(/\n{3,}/g, "\n\n");

    // 策略2：移除注释（保守：只移除明显的注释行）
    if (this.config.contextOptimization?.aggressiveMode) {
      compressed = compressed
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          return !(trimmed.startsWith("//") || trimmed.startsWith("#"));
        })
        .join("\n");
    }

    // 策略3：截断到最大字符数
    if (maxChars && compressed.length > maxChars) {
      compressed = compressed.slice(0, maxChars) + "\n...(truncated)";
    }

    const compressedTokens = this.estimateTokens(compressed);
    const savedTokens = originalTokens - compressedTokens;

    return {
      original: content,
      compressed,
      savedTokens,
    };
  }

  /**
   * 优化消息历史：移除过长的工具结果
   */
  optimizeMessageHistory(messages: Array<{ role: string; content: string }>): {
    original: Array<{ role: string; content: string }>;
    optimized: Array<{ role: string; content: string }>;
    savedTokens: number;
  } {
    const MAX_TOOL_RESULT_CHARS = 2000; // 工具结果最大字符数
    const optimized = messages.map((msg) => {
      if (msg.role === "tool" && msg.content.length > MAX_TOOL_RESULT_CHARS) {
        return {
          ...msg,
          content: msg.content.slice(0, MAX_TOOL_RESULT_CHARS) + "\n...(truncated)",
        };
      }
      return msg;
    });

    const originalTokens = messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
    const optimizedTokens = optimized.reduce(
      (sum, msg) => sum + this.estimateTokens(msg.content),
      0,
    );

    return {
      original: messages,
      optimized,
      savedTokens: originalTokens - optimizedTokens,
    };
  }

  /**
   * 估算token数量
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * 生成优化报告
   */
  generateOptimizationReport(stats: {
    schemaSavedTokens: number;
    filesSavedTokens: number;
    historySavedTokens: number;
    totalOriginalTokens: number;
  }): string {
    const totalSaved = stats.schemaSavedTokens + stats.filesSavedTokens + stats.historySavedTokens;
    const savedPercentage =
      stats.totalOriginalTokens > 0 ? (totalSaved / stats.totalOriginalTokens) * 100 : 0;

    const lines = [
      "🎯 Token优化报告",
      "━━━━━━━━━━━━━━━━━━━━━━",
      `总节省: ${totalSaved.toLocaleString()} tokens (${savedPercentage.toFixed(1)}%)`,
      "",
      "分项节省:",
      `  • Schema压缩: ${stats.schemaSavedTokens.toLocaleString()} tokens`,
      `  • 文件压缩: ${stats.filesSavedTokens.toLocaleString()} tokens`,
      `  • 历史优化: ${stats.historySavedTokens.toLocaleString()} tokens`,
      "",
      `原始大小: ${stats.totalOriginalTokens.toLocaleString()} tokens`,
      `优化后: ${(stats.totalOriginalTokens - totalSaved).toLocaleString()} tokens`,
    ];

    return lines.join("\n");
  }
}

/**
 * 工具Schema简化器（急速简化版）
 */
export function quickCompressToolSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // 只保留必要字段
    if (
      key === "type" ||
      key === "properties" ||
      key === "required" ||
      key === "items" ||
      key === "enum"
    ) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = quickCompressToolSchema(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * 快速估算token节省
 */
export function estimateTokenSavings(
  originalContent: string,
  optimizedContent: string,
): {
  savedTokens: number;
  savedPercentage: number;
  savedCost: number;
} {
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  const originalTokens = estimateTokens(originalContent);
  const optimizedTokens = estimateTokens(optimizedContent);
  const savedTokens = originalTokens - optimizedTokens;
  const savedPercentage = originalTokens > 0 ? (savedTokens / originalTokens) * 100 : 0;

  // 假设平均成本 $0.003/1K tokens
  const savedCost = (savedTokens / 1000) * 0.003;

  return {
    savedTokens,
    savedPercentage,
    savedCost,
  };
}
