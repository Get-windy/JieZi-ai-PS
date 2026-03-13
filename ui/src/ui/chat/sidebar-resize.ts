/**
 * Sidebar resize — drag handle logic for the navigation sidebar.
 *
 * Allows the user to drag the right edge of the sidebar to resize it.
 * Width is constrained between 160px and 360px and persisted to localStorage.
 */

const STORAGE_KEY = "chat-nav-sidebar-width";
const MIN_WIDTH = 160;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;

/** Read saved width from localStorage (or return default). */
export function getSavedSidebarWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) {
        return n;
      }
    }
  } catch {
    // localStorage may be unavailable
  }
  return DEFAULT_WIDTH;
}

/** Save width to localStorage. */
function saveSidebarWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // ignore
  }
}

/**
 * Mousedown handler — attach to the `.chat-nav-resize-handle` element.
 *
 * Captures pointer, tracks horizontal movement, and updates the sidebar
 * width via CSS custom property. On mouseup, saves to localStorage.
 */
export function initSidebarResize(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();

  const handle = e.currentTarget as HTMLElement;
  const sidebar = handle.closest(".chat-nav-sidebar");
  if (!sidebar) {
    return;
  }

  handle.classList.add("chat-nav-resize-handle--active");

  const startX = e.clientX;
  const startWidth = sidebar.getBoundingClientRect().width;

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX;
    const newWidth = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta)));
    sidebar!.style.setProperty("--nav-sidebar-width", `${newWidth}px`);
    sidebar!.style.flex = `0 0 ${newWidth}px`;
  }

  function onUp() {
    handle.classList.remove("chat-nav-resize-handle--active");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);

    // Persist final width
    const finalWidth = sidebar!.getBoundingClientRect().width;
    const clamped = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, finalWidth)));
    saveSidebarWidth(clamped);
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}
