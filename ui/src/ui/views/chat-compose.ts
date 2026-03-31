/**
 * Chat compose helpers — extracted from chat.ts
 *
 * Textarea auto-height, clipboard paste for images, and attachment preview rendering.
 */
import { html, nothing } from "lit";
import { icons } from "../icons.ts";
import type { ChatProps } from "../types/chat-props.ts";
import type { ChatAttachment } from "../ui-types.ts";

/** 对抗-P2：textarea 高度自适应，使用视口高度比例而不是纯硬编码
 * 最大高度为视口的 30%，但不少于 150px
 */
export function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const maxHeight = Math.max(150, Math.floor(window.innerHeight * 0.3));
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
}

export function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  // 对抗-P2：原实现只接受图片类型。现在同时支持 PDF / 纯文本类型的粘贴。
  const ALLOWED_TYPES = /^(image\/|application\/pdf$|text\/)/;
  const acceptedItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (ALLOWED_TYPES.test(item.type)) {
      acceptedItems.push(item);
    }
  }

  if (acceptedItems.length === 0) {
    return;
  }

  e.preventDefault();

  for (const item of acceptedItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
        fileName: file.name || undefined,  // 对抗-P2：保留文件名
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

export function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => {
          const isImage = att.mimeType.startsWith("image/");
          // 对抗-P2：非图片附件（PDF/文本）显示图标 + 文件名预览
          return html`
          <div class="chat-attachment ${isImage ? "" : "chat-attachment--file"}">
            ${isImage
              ? html`<img
                  src=${att.dataUrl}
                  alt=${att.fileName ?? "Attachment"}
                  class="chat-attachment__img"
                />`
              : html`<div class="chat-attachment__file-icon" aria-hidden="true">
                  ${att.mimeType === "application/pdf" ? "📄" : "📝"}
                </div>
                <span class="chat-attachment__file-name" title=${att.fileName ?? att.mimeType}>
                  ${att.fileName ?? att.mimeType}
                </span>`
            }
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `;
        },
      )}
    </div>
  `;
}
