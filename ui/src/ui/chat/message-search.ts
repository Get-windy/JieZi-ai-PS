/**
 * PinchChat-style in-chat message search.
 *
 * Implements Ctrl+F search bar that highlights matching text in the
 * currently rendered chat thread and supports Up/Down navigation.
 *
 * Works by scanning `.chat-text` elements in the `.chat-thread` container
 * for text nodes matching the query, wrapping matches in <mark class="chat-search-hit">.
 * Previous matches are unwrapped before each new search.
 */

const HIGHLIGHT_CLASS = "chat-search-hit";
const ACTIVE_CLASS = "chat-search-hit--active";

/** Currently active search state (module-level singleton per chat thread). */
let _query = "";
let _matches: HTMLElement[] = [];
let _currentIdx = -1;
let _inputEl: HTMLInputElement | null = null;
let _barEl: HTMLElement | null = null;

/** Escape special regex characters in user input. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Walk all text nodes inside root and collect all ranges matching query. */
function findTextMatches(
  root: Element,
  re: RegExp,
): Array<{ node: Text; start: number; end: number }> {
  const results: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const text = node as Text;
    // Skip nodes inside existing marks to avoid double-wrapping
    if ((text.parentElement?.tagName ?? "") === "MARK") {
      continue;
    }
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text.nodeValue ?? "")) !== null) {
      results.push({ node: text, start: m.index, end: m.index + m[0].length });
    }
  }
  return results;
}

/**
 * Apply highlight marks inside a target container.
 * Returns array of created <mark> elements.
 */
function applyHighlights(container: Element, query: string): HTMLElement[] {
  if (!query.trim()) {
    return [];
  }
  const re = new RegExp(escapeRegex(query), "gi");
  const textMatches = findTextMatches(container, re);
  const marks: HTMLElement[] = [];

  // Process in reverse order so slicing doesn't shift offsets
  for (let i = textMatches.length - 1; i >= 0; i--) {
    const { node, start, end } = textMatches[i];
    try {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      range.surroundContents(mark);
      marks.unshift(mark);
    } catch {
      // surroundContents fails if range crosses element boundaries — skip
    }
  }
  return marks;
}

/** Remove all <mark> highlights from the container. */
function clearHighlights(container: Element): void {
  const marks = container.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT_CLASS}`);
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) {
      return;
    }
    while (m.firstChild) {
      parent.insertBefore(m.firstChild, m);
    }
    parent.removeChild(m);
    // Normalize adjacent text nodes
    parent.normalize();
  });
}

/** Scroll to and activate a match by index. */
function activateMatch(idx: number): void {
  if (_matches.length === 0) {
    return;
  }
  // Clamp
  _currentIdx = ((idx % _matches.length) + _matches.length) % _matches.length;
  _matches.forEach((m, i) => {
    m.classList.toggle(ACTIVE_CLASS, i === _currentIdx);
  });
  _matches[_currentIdx].scrollIntoView({ behavior: "smooth", block: "center" });
}

/** Run a search in the given chat thread container. */
function runSearch(thread: Element, query: string): void {
  clearHighlights(thread);
  _matches = [];
  _currentIdx = -1;
  _query = query;
  if (!query.trim()) {
    updateBarCount(0, 0);
    return;
  }
  _matches = applyHighlights(thread, query);
  if (_matches.length > 0) {
    activateMatch(0);
  }
  updateBarCount(_currentIdx + 1, _matches.length);
}

function updateBarCount(current: number, total: number): void {
  const countEl = _barEl?.querySelector<HTMLElement>(".chat-search-bar__count");
  if (!countEl) {
    return;
  }
  countEl.textContent = total === 0 ? "无匹配" : `${current} / ${total}`;
}

/**
 * Initialize the search bar for a chat thread.
 * Returns a cleanup function to remove the bar and event listeners.
 */
export function initMessageSearch(
  chatMainArea: HTMLElement,
  getThread: () => Element | null,
): () => void {
  // Remove any existing bar
  chatMainArea.querySelector(".chat-search-bar")?.remove();

  // Create bar
  const bar = document.createElement("div");
  bar.className = "chat-search-bar";
  bar.setAttribute("role", "search");
  bar.setAttribute("aria-label", "Search messages");
  bar.innerHTML = `
    <input
      class="chat-search-bar__input"
      type="search"
      placeholder="搜索消息…"
      autocomplete="off"
      spellcheck="false"
    />
    <span class="chat-search-bar__count"></span>
    <button class="chat-search-bar__nav" data-dir="-1" type="button" title="上一个 (Shift+Enter)" aria-label="Previous match">▲</button>
    <button class="chat-search-bar__nav" data-dir="1" type="button" title="下一个 (Enter)" aria-label="Next match">▼</button>
    <button class="chat-search-bar__close" type="button" title="关闭 (Esc)" aria-label="Close search">✕</button>
  `;
  chatMainArea.insertBefore(bar, chatMainArea.firstChild);
  _barEl = bar;

  const input = bar.querySelector<HTMLInputElement>(".chat-search-bar__input")!;
  _inputEl = input;
  input.focus();

  const close = () => {
    const thread = getThread();
    if (thread) {
      clearHighlights(thread);
    }
    bar.remove();
    _barEl = null;
    _inputEl = null;
    _matches = [];
    _query = "";
    _currentIdx = -1;
    document.removeEventListener("keydown", globalKeyHandler, true);
  };

  input.addEventListener("input", () => {
    const thread = getThread();
    if (!thread) {
      return;
    }
    runSearch(thread, input.value);
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      activateMatch(_currentIdx + dir);
      updateBarCount(_currentIdx + 1, _matches.length);
    }
    if (e.key === "Escape") {
      close();
    }
  });

  bar.querySelectorAll<HTMLButtonElement>(".chat-search-bar__nav").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = Number(btn.dataset.dir ?? "1");
      activateMatch(_currentIdx + dir);
      updateBarCount(_currentIdx + 1, _matches.length);
    });
  });

  bar.querySelector(".chat-search-bar__close")!.addEventListener("click", close);

  const globalKeyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && _barEl) {
      close();
    }
  };
  document.addEventListener("keydown", globalKeyHandler, true);

  return close;
}

/** Returns true if search bar is currently open. */
export function isSearchOpen(): boolean {
  return Boolean(_barEl?.isConnected);
}

/** Toggle the search bar focus if open, or re-focus the input. */
export function focusSearchBar(): void {
  _inputEl?.focus();
}
