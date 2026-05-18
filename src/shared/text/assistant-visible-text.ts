import { findCodeRegions, isInsideCode } from "./code-regions.js";
import { stripReasoningTagsFromText } from "./reasoning-tags.js";

const MEMORY_TAG_RE = /<\s*(\/?)\s*relevant[-_]memories\b[^<>]*>/gi;
const MEMORY_TAG_QUICK_RE = /<\s*\/?\s*relevant[-_]memories\b/i;

function stripRelevantMemoriesTags(text: string): string {
  if (!text || !MEMORY_TAG_QUICK_RE.test(text)) {
    return text;
  }
  MEMORY_TAG_RE.lastIndex = 0;

  const codeRegions = findCodeRegions(text);
  let result = "";
  let lastIndex = 0;
  let inMemoryBlock = false;

  for (const match of text.matchAll(MEMORY_TAG_RE)) {
    const idx = match.index ?? 0;
    if (isInsideCode(idx, codeRegions)) {
      continue;
    }

    const isClose = match[1] === "/";
    if (!inMemoryBlock) {
      result += text.slice(lastIndex, idx);
      if (!isClose) {
        inMemoryBlock = true;
      }
    } else if (isClose) {
      inMemoryBlock = false;
    }

    lastIndex = idx + match[0].length;
  }

  if (!inMemoryBlock) {
    result += text.slice(lastIndex);
  }

  return result;
}

export function stripAssistantInternalScaffolding(text: string): string {
  const withoutReasoning = stripReasoningTagsFromText(text, { mode: "preserve", trim: "start" });
  return stripRelevantMemoriesTags(withoutReasoning).trimStart();
}

export function sanitizeAssistantVisibleTextWithProfile(
  text: string,
  profile: "delivery" | "history" | "internal-scaffolding" = "delivery",
): string {
  if (profile === "internal-scaffolding") {
    return stripAssistantInternalScaffolding(text);
  }
  // For "history" and "delivery": strip reasoning tags fully and memories tags
  const withoutReasoning = stripReasoningTagsFromText(text, { mode: "strict", trim: "start" });
  return stripRelevantMemoriesTags(withoutReasoning).trimStart();
}

export function sanitizeAssistantVisibleText(text: string): string {
  return sanitizeAssistantVisibleTextWithProfile(text, "delivery");
}

/**
 * Strip malformed Minimax tool invocations that leak into text content.
 */
export function stripMinimaxToolCallXml(text: string): string {
  if (!text || !/minimax:tool_call/i.test(text)) {
    return text;
  }
  let cleaned = text.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
  cleaned = cleaned.replace(/<\/?minimax:tool_call>/gi, "");
  return cleaned;
}

/**
 * Strip downgraded tool call text representations.
 */
export function stripDowngradedToolCallText(text: string): string {
  if (!text) {
    return text;
  }
  if (!/\[Tool (?:Call|Result)/i.test(text) && !/\[Historical context/i.test(text)) {
    return text;
  }
  let cleaned = text.replace(/\[Tool Call:[^\]]*\][\s\S]*?(?=\n*\[Tool |\n*$)/gi, "");
  cleaned = cleaned.replace(/\[Tool Result for ID[^\]]*\]\n?[\s\S]*?(?=\n*\[Tool |\n*$)/gi, "");
  cleaned = cleaned.replace(/\[Historical context:[^\]]*\]\n?/gi, "");
  return cleaned.trim();
}

const LEGACY_BRACKET_TOOL_BLOCK_QUICK_RE = /\[\s*\/?\s*TOOL_(?:CALL|RESULT)\s*\]/i;

export function stripLegacyBracketToolCallBlocks(text: string): string {
  if (!text || !LEGACY_BRACKET_TOOL_BLOCK_QUICK_RE.test(text)) {
    return text;
  }

  const codeRegions = findCodeRegions(text);
  let result = "";
  let cursor = 0;
  while (cursor < text.length) {
    const openMatch = /\[\s*TOOL_(CALL|RESULT)\s*\]/gi.exec(text.slice(cursor));
    if (!openMatch?.[0]) {
      result += text.slice(cursor);
      break;
    }
    const blockKind = openMatch[1]?.toUpperCase();
    const openStart = cursor + (openMatch.index ?? 0);
    const payloadStart = openStart + openMatch[0].length;
    if (isInsideCode(openStart, codeRegions)) {
      result += text.slice(cursor, payloadStart);
      cursor = payloadStart;
      continue;
    }

    const closeRe =
      blockKind === "RESULT" ? /\[\s*\/\s*TOOL_RESULT\s*\]/gi : /\[\s*\/\s*TOOL_CALL\s*\]/gi;
    const closeMatch = closeRe.exec(text.slice(payloadStart));
    const closeStart =
      closeMatch?.[0] && !isInsideCode(payloadStart + (closeMatch.index ?? 0), codeRegions)
        ? payloadStart + (closeMatch.index ?? 0)
        : -1;
    const payloadEnd = closeStart >= 0 ? closeStart : text.length;
    const payload = text.slice(payloadStart, payloadEnd);
    const hasJsonLikePayload = /^\s*[[{]/.test(payload);
    const shouldStrip = hasJsonLikePayload;
    if (!shouldStrip) {
      result += text.slice(cursor, payloadStart);
      cursor = payloadStart;
      continue;
    }

    result += text.slice(cursor, openStart);
    cursor = closeStart >= 0 ? closeStart + (closeMatch?.[0].length ?? 0) : text.length;
  }

  return result;
}

export function sanitizeAssistantVisibleTextWithOptions(
  text: string,
  options?: { trim?: "none" | "both" },
): string {
  const profile = options?.trim === "none" ? "history" : "delivery";
  return sanitizeAssistantVisibleTextWithProfile(text, profile);
}

const TOOL_CALL_QUICK_RE =
  /<\s*\/?\s*(?:tool_call|tool_result|function_calls?|function_response|function|tool_calls)\b/i;

export function stripToolCallXmlTags(
  text: string,
  options: {
    stripFunctionCallsXmlPayloads?: boolean;
    stripFunctionResponseAfterPluralToolCalls?: boolean;
  } = {},
): string {
  if (!text || !TOOL_CALL_QUICK_RE.test(text)) {
    return text;
  }

  const codeRegions = findCodeRegions(text);
  let result = "";
  let lastIndex = 0;
  let inToolCallBlock = false;
  let toolCallBlockContentStart = 0;

  for (let idx = 0; idx < text.length; idx += 1) {
    if (text[idx] !== "<") {
      continue;
    }
    if (!inToolCallBlock && isInsideCode(idx, codeRegions)) {
      continue;
    }

    const tagEnd = text.indexOf(">", idx);
    if (tagEnd === -1) {
      continue;
    }
    const tagText = text.slice(idx, tagEnd + 1);
    const tagMatch = tagText.match(/<\s*(\/?)\s*(\w+)/i);
    if (!tagMatch) {
      continue;
    }

    const isClose = tagMatch[1] === "/";
    const tagName = tagMatch[2].toLowerCase();
    const toolCallTagNames = new Set(["tool_call", "tool_result", "function_call", "function_calls", "function_response", "function", "tool_calls"]);
    
    if (!toolCallTagNames.has(tagName)) {
      continue;
    }

    if (!inToolCallBlock) {
      result += text.slice(lastIndex, idx);
      if (!isClose && !tagText.includes("/>")) {
        inToolCallBlock = true;
        toolCallBlockContentStart = tagEnd + 1;
      }
      lastIndex = tagEnd + 1;
    } else if (isClose && tagName === "tool_call") {
      inToolCallBlock = false;
      lastIndex = tagEnd + 1;
    }
  }

  if (!inToolCallBlock) {
    result += text.slice(lastIndex);
  }

  return result;
}
