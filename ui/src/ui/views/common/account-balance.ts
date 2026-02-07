import { html, nothing } from "lit";
import { t } from "../../i18n.js";

/**
 * 通用的余额和单价显示组件
 * 如果有数据则显示，没有数据则隐藏
 */

export type BalanceInfo = {
  amount: number;
  currency: string;
  lastUpdated: number;
};

export type PricingInfo = {
  inputPer1k: number;
  outputPer1k: number;
  currency: string;
};

export type BalanceDisplayProps = {
  balance?: BalanceInfo | null;
  pricing?: PricingInfo | null;
  providerId?: string;
};

/**
 * 渲染余额信息（有数据显示，无数据隐藏）
 */
export function renderBalance(props: BalanceDisplayProps) {
  if (!props.balance) {
    return nothing;
  }

  const { amount, currency, lastUpdated } = props.balance;
  const timeAgo = formatTimeAgo(lastUpdated);

  return html`
    <div style="margin-top: 8px; padding: 10px; background: var(--bg-accent); border-radius: var(--radius-md); border: 1px solid var(--border);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: var(--muted);">💰 ${t("models.balance")}:</span>
          <span style="font-size: 16px; font-weight: 600; color: var(--text-strong);">
            ${formatCurrency(amount, currency)}
          </span>
        </div>
        <span style="font-size: 11px; color: var(--muted);" title=${new Date(lastUpdated).toLocaleString()}>
          ${timeAgo}
        </span>
      </div>
    </div>
  `;
}

/**
 * 渲染单价信息（有数据显示，无数据隐藏）
 */
export function renderPricing(props: BalanceDisplayProps) {
  if (!props.pricing) {
    return nothing;
  }

  const { inputPer1k, outputPer1k, currency } = props.pricing;

  return html`
    <div style="margin-top: 8px; font-size: 12px; color: var(--muted); line-height: 1.6;">
      <div style="display: flex; gap: 16px;">
        <span>📥 ${t("models.input_price")}: ${formatPrice(inputPer1k, currency)}/1K tokens</span>
        <span>📤 ${t("models.output_price")}: ${formatPrice(outputPer1k, currency)}/1K tokens</span>
      </div>
    </div>
  `;
}

/**
 * 渲染余额和单价组合（智能显示/隐藏）
 */
export function renderBalanceAndPricing(props: BalanceDisplayProps) {
  const hasBalance = !!props.balance;
  const hasPricing = !!props.pricing;

  // 两者都没有，隐藏整个区域
  if (!hasBalance && !hasPricing) {
    return nothing;
  }

  return html`
    <div style="margin-top: 12px;">
      ${renderBalance(props)}
      ${renderPricing(props)}
    </div>
  `;
}

/**
 * 渲染不支持余额查询的提示（只在需要时显示）
 */
export function renderBalanceUnsupportedHint(providerId: string, showHint: boolean = false) {
  if (!showHint) {
    return nothing;
  }

  const consoleUrls: Record<string, string> = {
    openai: "https://platform.openai.com/usage",
    anthropic: "https://console.anthropic.com/settings/billing",
    qianwen: "https://dashscope.console.aliyun.com/dashboard",
    google: "https://console.cloud.google.com/billing",
  };

  const consoleUrl = consoleUrls[providerId];

  if (!consoleUrl) {
    return nothing;
  }

  return html`
    <div style="margin-top: 8px; padding: 8px 12px; background: var(--bg-accent); border-radius: var(--radius-sm); border-left: 3px solid var(--warning); font-size: 12px; color: var(--muted);">
      ℹ️ ${t("models.balance_check_console")}
      <a 
        href=${consoleUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        style="color: var(--accent); text-decoration: none; margin-left: 4px;"
      >
        ${t("models.open_console")} ↗
      </a>
    </div>
  `;
}

// ==================== 辅助函数 ====================

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    CNY: "¥",
    EUR: "€",
  };
  const symbol = symbols[currency] || currency;
  return `${symbol}${amount.toFixed(2)}`;
}

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    CNY: "¥",
    EUR: "€",
  };
  const symbol = symbols[currency] || currency;

  if (price === 0) {
    return t("models.free");
  }

  if (price < 0.001) {
    return `${symbol}${price.toFixed(6)}`;
  }

  if (price < 0.01) {
    return `${symbol}${price.toFixed(5)}`;
  }

  return `${symbol}${price.toFixed(4)}`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} 天前`;
  }
  if (hours > 0) {
    return `${hours} 小时前`;
  }
  if (minutes > 0) {
    return `${minutes} 分钟前`;
  }
  return "刚刚";
}
