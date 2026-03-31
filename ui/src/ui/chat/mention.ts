/**
 * Mention 提及逻辑模块
 *
 * 从 chat.ts 中抽取的 @mention 功能：
 * - detectMentionToken: 检测光标位置附近的 @xxx token
 * - openMentionDropdown: 打开候选列表下拉菜单
 * - closeMentionDropdown: 关闭下拉菜单
 */

export type MentionCandidate = { id: string; label: string; emoji: string };

/** 从光标位置向前找最近的未完成 @xxx token，返回 { token, start } 或 null */
export function detectMentionToken(
  text: string,
  cursor: number,
): { token: string; start: number } | null {
  // 只在光标前扫描，找最近的 @ 且 @ 后面没有空格
  const before = text.slice(0, cursor);
  const idx = before.lastIndexOf("@");
  if (idx === -1) {
    return null;
  }
  const after = before.slice(idx + 1);
  // 如果 @ 之后有空格，说明已经完成了一个 mention
  if (/\s/.test(after)) {
    return null;
  }
  return { token: after.toLowerCase(), start: idx };
}

/** 关闭 mention 下拉，并清理所有相关监听器 */
export function closeMentionDropdown(container: HTMLElement | Element) {
  const existing = container.querySelector(".chat-mention-dropdown");
  if (existing) {
    // 对抗-P1：触发自定义事件让 textarea 层的监听器知道要清理自己
    // 通过 dropdown 上的 dataset 存储清理函数引用
    const cleanup = (existing as HTMLElement & { _mentionCleanup?: () => void })._mentionCleanup;
    cleanup?.();
    existing.remove();
  }
}

/** 渲染 mention 下拉列表，选中后把 @label 插入 textarea */
export function openMentionDropdown(
  container: HTMLElement | Element,
  textarea: HTMLTextAreaElement,
  candidates: MentionCandidate[],
  mentionStart: number,
  onInsert: (newDraft: string) => void,
  adjustTextareaHeight?: (el: HTMLTextAreaElement) => void,
) {
  closeMentionDropdown(container);
  if (candidates.length === 0) {
    return;
  }

  const dropdown = document.createElement("div");
  dropdown.className = "chat-mention-dropdown";

  candidates.forEach((c, i) => {
    const item = document.createElement("div");
    item.className = "chat-mention-item";
    if (i === 0) {
      item.classList.add("chat-mention-item--active");
    }
    item.textContent = `${c.emoji} ${c.label}`;
    item.addEventListener("mousedown", (ev) => {
      ev.preventDefault(); // 防止 textarea 失焦
      const cur = textarea.selectionStart ?? textarea.value.length;
      const before = textarea.value.slice(0, mentionStart);
      const after = textarea.value.slice(cur);
      const inserted = `@${c.label} `;
      const newVal = before + inserted + after;
      onInsert(newVal);
      // 把光标移到插入文字末尾
      const newCursor = mentionStart + inserted.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
        adjustTextareaHeight?.(textarea);
      });
      closeMentionDropdown(container);
    });
    dropdown.appendChild(item);
  });

  // 对抗-P1：统一在一个 cleanup 函数中移除所有监听器
  // 原实现 Escape 路径只移除了 keydown，onClickOutside 在 Escape 后继续存活
  let cleaned = false;
  const cleanupAll = () => {
    if (cleaned) return;
    cleaned = true;
    textarea.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("mousedown", onClickOutside);
  };

  // 键盘导航
  const onKeydown = (e: KeyboardEvent) => {
    const items = dropdown.querySelectorAll<HTMLElement>(".chat-mention-item");
    const activeIdx = Array.from(items).findIndex((el) =>
      el.classList.contains("chat-mention-item--active"),
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (activeIdx + 1) % items.length;
      items[activeIdx]?.classList.remove("chat-mention-item--active");
      items[next]?.classList.add("chat-mention-item--active");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (activeIdx - 1 + items.length) % items.length;
      items[activeIdx]?.classList.remove("chat-mention-item--active");
      items[prev]?.classList.add("chat-mention-item--active");
    } else if (e.key === "Enter" || e.key === "Tab") {
      const active = items[activeIdx];
      if (active) {
        e.preventDefault();
        e.stopImmediatePropagation();
        active.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
    } else if (e.key === "Escape") {
      closeMentionDropdown(container);
      cleanupAll(); // 对抗-P1：Escape 时统一清理
    }
  };
  textarea.addEventListener("keydown", onKeydown, true);

  // 点击外部关闭
  const onClickOutside = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node)) {
      closeMentionDropdown(container);
      cleanupAll(); // 对抗-P1：点击外部时统一清理
    }
  };
  setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);

  // 对抗-P1：将清理函数挂在 dropdown 元素上，供 closeMentionDropdown 主动调用
  (dropdown as HTMLElement & { _mentionCleanup?: () => void })._mentionCleanup = cleanupAll;

  container.appendChild(dropdown);
}
