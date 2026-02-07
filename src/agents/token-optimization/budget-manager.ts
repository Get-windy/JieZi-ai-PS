/**
 * Token预算管理器
 * 跟踪和控制token使用，防止成本失控
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { TokenOptimizationConfig, TokenUsageStats, MODEL_COSTS } from "./config.js";
import { STATE_DIR } from "../../config/paths.js";

/**
 * 预算使用记录
 */
type BudgetRecord = {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  tokenUsage: {
    input: number;
    output: number;
    total: number;
    cached: number;
  };
  costUsage: {
    input: number;
    output: number;
    cached: number;
    total: number;
  };
  conversationCount: number;
  modelBreakdown: Record<
    string,
    {
      tokens: number;
      cost: number;
      count: number;
    }
  >;
};

/**
 * 预算状态
 */
export type BudgetStatus = {
  dailyUsage: {
    tokens: number;
    cost: number;
    percentage: number;
  };
  monthlyUsage: {
    tokens: number;
    cost: number;
    percentage: number;
  };
  conversationUsage: {
    tokens: number;
    cost: number;
    percentage: number;
  };
  warnings: string[];
  shouldBlock: boolean;
  recommendedAction?: string;
};

/**
 * Token预算管理器
 */
export class BudgetManager {
  private config: TokenOptimizationConfig;
  private budgetFilePath: string;
  private currentConversationTokens = 0;
  private dailyRecord: BudgetRecord | null = null;
  private monthlyRecords: Map<string, BudgetRecord> = new Map();

  constructor(config: TokenOptimizationConfig) {
    this.config = config;
    this.budgetFilePath = path.join(STATE_DIR, "token-budget.json");
    void this.loadRecords();
  }

  /**
   * 加载历史记录
   */
  private async loadRecords(): Promise<void> {
    try {
      const content = await fs.readFile(this.budgetFilePath, "utf-8");
      const data = JSON.parse(content) as {
        daily: BudgetRecord | null;
        monthly: Record<string, BudgetRecord>;
      };

      this.dailyRecord = data.daily;
      this.monthlyRecords = new Map(Object.entries(data.monthly));
    } catch (err) {
      // 文件不存在或解析失败，使用空记录
      this.dailyRecord = null;
      this.monthlyRecords.clear();
    }
  }

  /**
   * 保存记录
   */
  private async saveRecords(): Promise<void> {
    const data = {
      daily: this.dailyRecord,
      monthly: Object.fromEntries(this.monthlyRecords),
    };

    try {
      await fs.mkdir(path.dirname(this.budgetFilePath), { recursive: true });
      await fs.writeFile(this.budgetFilePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to save budget records:", err);
    }
  }

  /**
   * 记录token使用
   */
  async recordUsage(usage: TokenUsageStats, modelId: string): Promise<void> {
    const today = this.getToday();
    const thisMonth = this.getThisMonth();

    // 初始化今日记录
    if (!this.dailyRecord || this.dailyRecord.date !== today) {
      this.dailyRecord = this.createEmptyRecord(today, thisMonth);
    }

    // 初始化本月记录
    if (!this.monthlyRecords.has(thisMonth)) {
      this.monthlyRecords.set(thisMonth, this.createEmptyRecord(thisMonth, thisMonth));
    }

    const monthlyRecord = this.monthlyRecords.get(thisMonth)!;

    // 更新token使用
    this.dailyRecord.tokenUsage.input += usage.input;
    this.dailyRecord.tokenUsage.output += usage.output;
    this.dailyRecord.tokenUsage.total += usage.total;
    this.dailyRecord.tokenUsage.cached += usage.cached ?? 0;

    monthlyRecord.tokenUsage.input += usage.input;
    monthlyRecord.tokenUsage.output += usage.output;
    monthlyRecord.tokenUsage.total += usage.total;
    monthlyRecord.tokenUsage.cached += usage.cached ?? 0;

    // 更新成本
    const cost = usage.cost ?? 0;
    this.dailyRecord.costUsage.total += cost;
    monthlyRecord.costUsage.total += cost;

    // 更新模型统计
    this.updateModelBreakdown(this.dailyRecord, modelId, usage.total, cost);
    this.updateModelBreakdown(monthlyRecord, modelId, usage.total, cost);

    // 更新当前对话token数
    this.currentConversationTokens += usage.total;

    // 保存
    await this.saveRecords();
  }

  /**
   * 更新模型统计
   */
  private updateModelBreakdown(
    record: BudgetRecord,
    modelId: string,
    tokens: number,
    cost: number,
  ): void {
    if (!record.modelBreakdown[modelId]) {
      record.modelBreakdown[modelId] = { tokens: 0, cost: 0, count: 0 };
    }

    record.modelBreakdown[modelId].tokens += tokens;
    record.modelBreakdown[modelId].cost += cost;
    record.modelBreakdown[modelId].count++;
  }

  /**
   * 创建空记录
   */
  private createEmptyRecord(date: string, month: string): BudgetRecord {
    return {
      date,
      month,
      tokenUsage: {
        input: 0,
        output: 0,
        total: 0,
        cached: 0,
      },
      costUsage: {
        input: 0,
        output: 0,
        cached: 0,
        total: 0,
      },
      conversationCount: 0,
      modelBreakdown: {},
    };
  }

  /**
   * 检查预算状态
   */
  checkBudget(): BudgetStatus {
    const today = this.getToday();
    const thisMonth = this.getThisMonth();

    // 确保记录存在
    if (!this.dailyRecord || this.dailyRecord.date !== today) {
      this.dailyRecord = this.createEmptyRecord(today, thisMonth);
    }

    const monthlyRecord =
      this.monthlyRecords.get(thisMonth) ?? this.createEmptyRecord(today, thisMonth);

    const budgetConfig = this.config.budgetManagement;
    const warnings: string[] = [];
    let shouldBlock = false;
    let recommendedAction: string | undefined;

    // 检查每日预算
    const dailyBudget = budgetConfig?.dailyBudget ?? Infinity;
    const dailyUsagePercentage = (this.dailyRecord.tokenUsage.total / dailyBudget) * 100;

    if (dailyUsagePercentage >= 100) {
      warnings.push(`每日token预算已用尽 (${dailyBudget.toLocaleString()} tokens)`);
      shouldBlock = budgetConfig?.onBudgetExceeded === "block";
      recommendedAction = "建议明天再继续使用，或增加每日预算";
    } else if (dailyUsagePercentage >= (budgetConfig?.warningThreshold ?? 0.8) * 100) {
      warnings.push(`每日token预算即将用尽 (${dailyUsagePercentage.toFixed(1)}%)`);
      recommendedAction = "建议压缩上下文或使用更小的模型";
    }

    // 检查每月预算（基于成本）
    const monthlyBudget = budgetConfig?.costLimits?.monthly ?? Infinity;
    const monthlyUsagePercentage = (monthlyRecord.costUsage.total / monthlyBudget) * 100;

    if (monthlyUsagePercentage >= 100) {
      warnings.push(`每月成本预算已用尽 ($${monthlyBudget})`);
      shouldBlock = shouldBlock || budgetConfig?.onBudgetExceeded === "block";
    } else if (monthlyUsagePercentage >= (budgetConfig?.warningThreshold ?? 0.8) * 100) {
      warnings.push(`每月成本预算即将用尽 (${monthlyUsagePercentage.toFixed(1)}%)`);
    }

    // 检查单次对话预算
    const conversationBudget = budgetConfig?.perConversationBudget ?? Infinity;
    const conversationPercentage = (this.currentConversationTokens / conversationBudget) * 100;

    if (conversationPercentage >= 100) {
      warnings.push(`当前对话token预算已用尽 (${conversationBudget.toLocaleString()} tokens)`);
      recommendedAction = recommendedAction ?? "建议使用 /compact 压缩历史或开启新对话";
    }

    // 建议降级模型
    if (shouldBlock && budgetConfig?.onBudgetExceeded === "fallback-to-smaller-model") {
      recommendedAction = "自动切换到更小的模型以节省成本";
    }

    return {
      dailyUsage: {
        tokens: this.dailyRecord.tokenUsage.total,
        cost: this.dailyRecord.costUsage.total,
        percentage: dailyUsagePercentage,
      },
      monthlyUsage: {
        tokens: monthlyRecord.tokenUsage.total,
        cost: monthlyRecord.costUsage.total,
        percentage: monthlyUsagePercentage,
      },
      conversationUsage: {
        tokens: this.currentConversationTokens,
        cost: 0, // 可以根据模型计算
        percentage: conversationPercentage,
      },
      warnings,
      shouldBlock,
      recommendedAction,
    };
  }

  /**
   * 重置当前对话token计数
   */
  resetConversationTokens(): void {
    this.currentConversationTokens = 0;
  }

  /**
   * 获取今日日期（YYYY-MM-DD）
   */
  private getToday(): string {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * 获取本月（YYYY-MM）
   */
  private getThisMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  /**
   * 生成预算报告
   */
  generateReport(): string {
    const status = this.checkBudget();
    const lines = [
      "💰 Token预算使用报告",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "",
      "📅 今日使用:",
      `  • Tokens: ${status.dailyUsage.tokens.toLocaleString()} (${status.dailyUsage.percentage.toFixed(1)}%)`,
      `  • 成本: $${status.dailyUsage.cost.toFixed(4)}`,
      "",
      "📆 本月使用:",
      `  • Tokens: ${status.monthlyUsage.tokens.toLocaleString()} (${status.monthlyUsage.percentage.toFixed(1)}%)`,
      `  • 成本: $${status.monthlyUsage.cost.toFixed(2)}`,
      "",
      "💬 当前对话:",
      `  • Tokens: ${status.conversationUsage.tokens.toLocaleString()} (${status.conversationUsage.percentage.toFixed(1)}%)`,
    ];

    if (status.warnings.length > 0) {
      lines.push("");
      lines.push("⚠️  警告:");
      for (const warning of status.warnings) {
        lines.push(`  • ${warning}`);
      }
    }

    if (status.recommendedAction) {
      lines.push("");
      lines.push(`💡 建议: ${status.recommendedAction}`);
    }

    if (this.dailyRecord) {
      lines.push("");
      lines.push("📊 模型使用统计:");
      const sortedModels = Object.entries(this.dailyRecord.modelBreakdown).sort(
        ([, a], [, b]) => b.tokens - a.tokens,
      );
      for (const [model, stats] of sortedModels.slice(0, 5)) {
        lines.push(
          `  • ${model}: ${stats.tokens.toLocaleString()} tokens ($${stats.cost.toFixed(4)}) × ${stats.count}次`,
        );
      }
    }

    return lines.join("\n");
  }
}
