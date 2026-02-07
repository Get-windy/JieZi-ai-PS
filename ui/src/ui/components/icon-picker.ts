/**
 * 图标选择器组件
 * 提供图标选择功能，支持 Emoji 和 SVG 图标
 */

import { html, css, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface IconOption {
  value: string;
  label: string;
  type: "emoji" | "svg";
  category?: string;
}

// 预定义图标库
export const ICON_LIBRARY: IconOption[] = [
  // AI & 技术类
  { value: "🤖", label: "机器人", type: "emoji", category: "ai" },
  { value: "🧠", label: "大脑", type: "emoji", category: "ai" },
  { value: "💡", label: "灯泡", type: "emoji", category: "ai" },
  { value: "⚡", label: "闪电", type: "emoji", category: "ai" },
  { value: "🔮", label: "水晶球", type: "emoji", category: "ai" },
  { value: "✨", label: "星星", type: "emoji", category: "ai" },

  // 自然类
  { value: "🌊", label: "海浪", type: "emoji", category: "nature" },
  { value: "☁️", label: "云朵", type: "emoji", category: "nature" },
  { value: "🌙", label: "月亮", type: "emoji", category: "nature" },
  { value: "🌟", label: "闪亮星", type: "emoji", category: "nature" },
  { value: "🔥", label: "火焰", type: "emoji", category: "nature" },
  { value: "🌈", label: "彩虹", type: "emoji", category: "nature" },
  { value: "🏔️", label: "雪山", type: "emoji", category: "nature" },

  // 符号类
  { value: "🔍", label: "放大镜", type: "emoji", category: "symbol" },
  { value: "🎓", label: "学士帽", type: "emoji", category: "symbol" },
  { value: "🛒", label: "购物车", type: "emoji", category: "symbol" },
  { value: "🐧", label: "企鹅", type: "emoji", category: "symbol" },
  { value: "🚀", label: "火箭", type: "emoji", category: "symbol" },
  { value: "💎", label: "钻石", type: "emoji", category: "symbol" },
  { value: "🎯", label: "靶心", type: "emoji", category: "symbol" },
  { value: "🔒", label: "锁", type: "emoji", category: "symbol" },
  { value: "🔑", label: "钥匙", type: "emoji", category: "symbol" },

  // 人物类
  { value: "👤", label: "人物", type: "emoji", category: "people" },
  { value: "👥", label: "多人", type: "emoji", category: "people" },
  { value: "👨‍💻", label: "程序员", type: "emoji", category: "people" },
  { value: "🧑‍🚀", label: "宇航员", type: "emoji", category: "people" },
  { value: "🦸", label: "超级英雄", type: "emoji", category: "people" },

  // 动物类
  { value: "🦊", label: "狐狸", type: "emoji", category: "animal" },
  { value: "🐱", label: "猫", type: "emoji", category: "animal" },
  { value: "🐶", label: "狗", type: "emoji", category: "animal" },
  { value: "🦁", label: "狮子", type: "emoji", category: "animal" },
  { value: "🐉", label: "龙", type: "emoji", category: "animal" },
  { value: "🦅", label: "鹰", type: "emoji", category: "animal" },
];

const CATEGORY_LABELS: Record<string, string> = {
  ai: "AI & 技术",
  nature: "自然",
  symbol: "符号",
  people: "人物",
  animal: "动物",
};

@customElement("icon-picker")
export class IconPicker extends LitElement {
  @property() value = "🤖";
  @property() onChange?: (value: string) => void;

  @state() private isOpen = false;
  @state() private searchQuery = "";
  @state() private selectedCategory = "all";

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }

    .trigger {
      width: 100%;
      min-width: 120px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 24px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.15s ease;
      padding: 0 12px;
      position: relative;
    }

    .trigger::after {
      content: "▼";
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      color: var(--text-secondary);
      opacity: 0.6;
    }

    .trigger:hover {
      border-color: var(--accent);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .trigger:hover::after {
      opacity: 1;
      color: var(--accent);
    }

    .trigger.open {
      border-color: var(--accent);
    }

    .trigger.open::after {
      transform: translateY(-50%) rotate(180deg);
    }

    .icon-display {
      font-size: 28px;
    }

    .placeholder {
      color: var(--text-secondary);
      font-size: 13px;
      margin-left: 4px;
    }

    .dropdown {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: 360px;
      max-height: 400px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .search-box {
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .search-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 14px;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .categories {
      padding: 8px 12px;
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--border-color);
      overflow-x: auto;
    }

    .category-btn {
      padding: 4px 12px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .category-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .category-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .icons-grid {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 8px;
    }

    .icon-option {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .icon-option:hover {
      background: var(--bg-secondary);
      border-color: var(--accent);
      transform: scale(1.1);
    }

    .icon-option.selected {
      background: var(--accent);
      border-color: var(--accent);
    }
  `;

  render() {
    const filteredIcons = this.getFilteredIcons();

    return html`
      <div class="trigger ${this.isOpen ? "open" : ""}" @click=${() => (this.isOpen = !this.isOpen)}>
        <span class="icon-display">${this.value}</span>
        <span class="placeholder">点击选择</span>
      </div>

      ${
        this.isOpen
          ? html`
        <div class="dropdown" @click=${(e: Event) => e.stopPropagation()}>
          <div class="search-box">
            <input
              type="text"
              class="search-input"
              placeholder="搜索图标..."
              .value=${this.searchQuery}
              @input=${(e: Event) => (this.searchQuery = (e.target as HTMLInputElement).value)}
            />
          </div>

          <div class="categories">
            <button
              class="category-btn ${this.selectedCategory === "all" ? "active" : ""}"
              @click=${() => (this.selectedCategory = "all")}
            >
              全部
            </button>
            ${Object.entries(CATEGORY_LABELS).map(
              ([key, label]) => html`
              <button
                class="category-btn ${this.selectedCategory === key ? "active" : ""}"
                @click=${() => (this.selectedCategory = key)}
              >
                ${label}
              </button>
            `,
            )}
          </div>

          <div class="icons-grid">
            ${filteredIcons.map(
              (icon) => html`
              <div
                class="icon-option ${this.value === icon.value ? "selected" : ""}"
                @click=${() => this.selectIcon(icon.value)}
                title=${icon.label}
              >
                ${icon.value}
              </div>
            `,
            )}
          </div>
        </div>
      `
          : ""
      }
    `;
  }

  private getFilteredIcons(): IconOption[] {
    let icons = ICON_LIBRARY;

    // 按分类筛选
    if (this.selectedCategory !== "all") {
      icons = icons.filter((icon) => icon.category === this.selectedCategory);
    }

    // 按搜索词筛选
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      icons = icons.filter(
        (icon) => icon.label.toLowerCase().includes(query) || icon.value.includes(query),
      );
    }

    return icons;
  }

  private selectIcon(value: string) {
    this.value = value;
    this.isOpen = false;
    this.onChange?.(value);
    this.dispatchEvent(new CustomEvent("change", { detail: { value } }));
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.handleClickOutside);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this.handleClickOutside);
  }

  private handleClickOutside = () => {
    this.isOpen = false;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "icon-picker": IconPicker;
  }
}
