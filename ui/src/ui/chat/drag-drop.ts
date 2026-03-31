import type { ChatAttachment } from "../ui-types.ts";
/**
 * Drag-drop image upload — overlay + file handling for the chat compose area.
 *
 * Shows a visual dropzone overlay when the user drags files over the chat,
 * and processes dropped images into ChatAttachments.
 */
import { generateAttachmentId } from "../views/chat-compose.ts";

/**
 * Handle the `dragover` event on the chat wrapper.
 * Activates the dropzone overlay.
 */
export function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "copy";
  }

  // Show the dropzone overlay
  const zone = (e.currentTarget as HTMLElement).querySelector(".chat-dropzone");
  zone?.classList.add("chat-dropzone--active");
}

/**
 * Handle the `dragleave` event — hide the dropzone overlay.
 */
export function handleDragLeave(e: DragEvent): void {
  e.preventDefault();
  e.stopPropagation();

  // Only hide when leaving the actual container, not entering a child
  const related = e.relatedTarget as Node | null;
  const current = e.currentTarget as HTMLElement;
  if (related && current.contains(related)) {
    return;
  }

  const zone = current.querySelector(".chat-dropzone");
  zone?.classList.remove("chat-dropzone--active");
}

/**
 * Handle the `drop` event — process dropped image files and add to attachments.
 */
export function handleDrop(
  e: DragEvent,
  currentAttachments: ChatAttachment[],
  onAttachmentsChange: ((attachments: ChatAttachment[]) => void) | undefined,
): void {
  e.preventDefault();
  e.stopPropagation();

  // Hide overlay
  const zone = (e.currentTarget as HTMLElement).querySelector(".chat-dropzone");
  zone?.classList.remove("chat-dropzone--active");

  if (!onAttachmentsChange || !e.dataTransfer?.files?.length) {
    return;
  }

  const files = Array.from(e.dataTransfer.files);

  // 对抗-P2：只过滤图片是强假设计——拖放的 PDF/文档等也应当被接收
  // 支持的类型：图片 + PDF + 纯文本 + Markdown
  const ALLOWED_TYPES = /^(image\/|application\/pdf$|text\/)/;
  const acceptedFiles = files.filter((f) => ALLOWED_TYPES.test(f.type) || f.name.endsWith(".md"));

  if (acceptedFiles.length === 0) {
    return;
  }

  const updatedAttachments = [...currentAttachments];

  for (const file of acceptedFiles) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
        fileName: file.name,  // 对抗-P2：保留文件名供预览显示
      };
      updatedAttachments.push(newAttachment);
      // Fire callback after each file loads
      onAttachmentsChange([...updatedAttachments]);
    });
    reader.readAsDataURL(file);
  }
}
