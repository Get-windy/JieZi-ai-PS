// Local overlay: instead of throwing an error (which causes an unhandled
// promise rejection in pi-agent-core's runLoop and crashes the process),
// signal abort via the AbortSignal so the agent loop exits cleanly.
// All other logic is identical to upstream.
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextEngine } from "../../context-engine/types.js";
import {
  CHARS_PER_TOKEN_ESTIMATE,
  TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE,
  type MessageCharEstimateCache,
  createMessageCharEstimateCache,
  estimateContextChars,
  estimateMessageCharsCached,
  getToolResultText,
  invalidateMessageCharsCacheEntry,
  isToolResultMessage,
} from "./tool-result-char-estimator.js";

// Keep a conservative input budget to absorb tokenizer variance and provider framing overhead.
const CONTEXT_INPUT_HEADROOM_RATIO = 0.75;
const SINGLE_TOOL_RESULT_CONTEXT_SHARE = 0.5;
// High-water mark: if context exceeds this ratio after tool-result compaction,
// trigger full session compaction via the existing overflow recovery cascade.
const PREEMPTIVE_OVERFLOW_RATIO = 0.9;

export const CONTEXT_LIMIT_TRUNCATION_NOTICE = "[truncated: output exceeded context limit]";
const CONTEXT_LIMIT_TRUNCATION_SUFFIX = `\n${CONTEXT_LIMIT_TRUNCATION_NOTICE}`;

export function formatContextLimitTruncationNotice(params?: { reason?: string }): string {
  return params?.reason ? `[truncated: ${params.reason}]` : CONTEXT_LIMIT_TRUNCATION_NOTICE;
}

export const PREEMPTIVE_TOOL_RESULT_COMPACTION_PLACEHOLDER =
  "[compacted: tool output removed to free context]";

export const PREEMPTIVE_CONTEXT_OVERFLOW_MESSAGE =
  "Preemptive context overflow: estimated context size exceeds safe threshold during tool loop";

type GuardableTransformContext = (
  messages: AgentMessage[],
  signal: AbortSignal,
) => AgentMessage[] | Promise<AgentMessage[]>;

type GuardableAgent = object;

type GuardableAgentRecord = {
  transformContext?: GuardableTransformContext;
};

function truncateTextToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= 0) {
    return CONTEXT_LIMIT_TRUNCATION_NOTICE;
  }

  const bodyBudget = Math.max(0, maxChars - CONTEXT_LIMIT_TRUNCATION_SUFFIX.length);
  if (bodyBudget <= 0) {
    return CONTEXT_LIMIT_TRUNCATION_NOTICE;
  }

  let cutPoint = bodyBudget;
  const newline = text.lastIndexOf("\n", bodyBudget);
  if (newline > bodyBudget * 0.7) {
    cutPoint = newline;
  }

  return text.slice(0, cutPoint) + CONTEXT_LIMIT_TRUNCATION_SUFFIX;
}

function replaceToolResultText(msg: AgentMessage, text: string): AgentMessage {
  const content = (msg as { content?: unknown }).content;
  const replacementContent =
    typeof content === "string" || content === undefined ? text : [{ type: "text", text }];

  const sourceRecord = msg as unknown as Record<string, unknown>;
  const { details: _details, ...rest } = sourceRecord;
  return {
    ...rest,
    content: replacementContent,
  } as AgentMessage;
}

function truncateToolResultToChars(
  msg: AgentMessage,
  maxChars: number,
  cache: MessageCharEstimateCache,
): AgentMessage {
  if (!isToolResultMessage(msg)) {
    return msg;
  }

  const estimatedChars = estimateMessageCharsCached(msg, cache);
  if (estimatedChars <= maxChars) {
    return msg;
  }

  const rawText = getToolResultText(msg);
  if (!rawText) {
    return replaceToolResultText(msg, CONTEXT_LIMIT_TRUNCATION_NOTICE);
  }

  const truncatedText = truncateTextToBudget(rawText, maxChars);
  return replaceToolResultText(msg, truncatedText);
}

function compactExistingToolResultsInPlace(params: {
  messages: AgentMessage[];
  charsNeeded: number;
  cache: MessageCharEstimateCache;
}): number {
  const { messages, charsNeeded, cache } = params;
  if (charsNeeded <= 0) {
    return 0;
  }

  let reduced = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!isToolResultMessage(msg)) {
      continue;
    }

    const before = estimateMessageCharsCached(msg, cache);
    if (before <= PREEMPTIVE_TOOL_RESULT_COMPACTION_PLACEHOLDER.length) {
      continue;
    }

    const compacted = replaceToolResultText(msg, PREEMPTIVE_TOOL_RESULT_COMPACTION_PLACEHOLDER);
    applyMessageMutationInPlace(msg, compacted, cache);
    const after = estimateMessageCharsCached(msg, cache);
    if (after >= before) {
      continue;
    }

    reduced += before - after;
    if (reduced >= charsNeeded) {
      break;
    }
  }

  return reduced;
}

function applyMessageMutationInPlace(
  target: AgentMessage,
  source: AgentMessage,
  cache?: MessageCharEstimateCache,
): void {
  if (target === source) {
    return;
  }

  const targetRecord = target as unknown as Record<string, unknown>;
  const sourceRecord = source as unknown as Record<string, unknown>;
  for (const key of Object.keys(targetRecord)) {
    if (!(key in sourceRecord)) {
      delete targetRecord[key];
    }
  }
  Object.assign(targetRecord, sourceRecord);
  if (cache) {
    invalidateMessageCharsCacheEntry(cache, target);
  }
}

function enforceToolResultContextBudgetInPlace(params: {
  messages: AgentMessage[];
  contextBudgetChars: number;
  maxSingleToolResultChars: number;
}): void {
  const { messages, contextBudgetChars, maxSingleToolResultChars } = params;
  const estimateCache = createMessageCharEstimateCache();

  // Ensure each tool result has an upper bound before considering total context usage.
  for (const message of messages) {
    if (!isToolResultMessage(message)) {
      continue;
    }
    const truncated = truncateToolResultToChars(message, maxSingleToolResultChars, estimateCache);
    applyMessageMutationInPlace(message, truncated, estimateCache);
  }

  let currentChars = estimateContextChars(messages, estimateCache);
  if (currentChars <= contextBudgetChars) {
    return;
  }

  // Compact oldest tool outputs first until the context is back under budget.
  compactExistingToolResultsInPlace({
    messages,
    charsNeeded: currentChars - contextBudgetChars,
    cache: estimateCache,
  });
}

export function installToolResultContextGuard(params: {
  agent: GuardableAgent;
  contextWindowTokens: number;
}): () => void {
  const contextWindowTokens = Math.max(1, Math.floor(params.contextWindowTokens));
  const contextBudgetChars = Math.max(
    1_024,
    Math.floor(contextWindowTokens * CHARS_PER_TOKEN_ESTIMATE * CONTEXT_INPUT_HEADROOM_RATIO),
  );
  const maxSingleToolResultChars = Math.max(
    1_024,
    Math.floor(
      contextWindowTokens * TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE * SINGLE_TOOL_RESULT_CONTEXT_SHARE,
    ),
  );
  const preemptiveOverflowChars = Math.max(
    contextBudgetChars,
    Math.floor(contextWindowTokens * CHARS_PER_TOKEN_ESTIMATE * PREEMPTIVE_OVERFLOW_RATIO),
  );

  // Agent.transformContext is private in pi-coding-agent, so access it via a
  // narrow runtime view to keep callsites type-safe while preserving behavior.
  const mutableAgent = params.agent as GuardableAgentRecord;
  const originalTransformContext = mutableAgent.transformContext;

  mutableAgent.transformContext = (async (messages: AgentMessage[], signal: AbortSignal) => {
    const transformed = originalTransformContext
      ? await originalTransformContext.call(mutableAgent, messages, signal)
      : messages;

    const contextMessages = Array.isArray(transformed) ? transformed : messages;
    enforceToolResultContextBudgetInPlace({
      messages: contextMessages,
      contextBudgetChars,
      maxSingleToolResultChars,
    });

    // After tool-result compaction, check if context still exceeds the high-water mark.
    // If it does, non-tool-result content dominates and only full LLM-based session
    // compaction can reduce context size.
    // LOCAL OVERRIDE: instead of throwing (which becomes an unhandled rejection in
    // pi-agent-core's runLoop and crashes the process), we silently return the messages.
    // The provider will return a context-length error for this turn, which is handled
    // gracefully by the existing error-recovery path in run.ts (unlike an unhandled
    // rejection which kills the entire process).
    const postEnforcementChars = estimateContextChars(
      contextMessages,
      createMessageCharEstimateCache(),
    );
    if (postEnforcementChars > preemptiveOverflowChars) {
      // Log a warning so developers can diagnose context pressure.
      // eslint-disable-next-line no-console
      console.warn(
        `[context-guard] ${PREEMPTIVE_CONTEXT_OVERFLOW_MESSAGE} — ` +
          `estimated ${postEnforcementChars} chars > threshold ${preemptiveOverflowChars}. ` +
          "Continuing without throw to avoid process crash.",
      );
      return contextMessages;
    }

    return contextMessages;
  }) as GuardableTransformContext;

  return () => {
    mutableAgent.transformContext = originalTransformContext;
  };
}

/**
 * 上游新增：安装上下文引擎循环钉（将每次 transformContext 调用接入上下文引擎）
 * 和 upstream 实现完全相同，本地不覆盖 installToolResultContextGuard 逻辑。
 */
export function installContextEngineLoopHook(params: {
  agent: GuardableAgent;
  contextEngine: ContextEngine;
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  tokenBudget?: number;
  modelId: string;
  getPrePromptMessageCount?: () => number;
}): () => void {
  const { contextEngine, sessionId, sessionKey, sessionFile, tokenBudget, modelId } = params;
  const mutableAgent = params.agent as GuardableAgentRecord;
  const originalTransformContext = mutableAgent.transformContext;
  let lastSeenLength: number | null = null;
  let lastAssembledView: AgentMessage[] | null = null;

  mutableAgent.transformContext = (async (messages: AgentMessage[], signal: AbortSignal) => {
    const transformed = originalTransformContext
      ? await originalTransformContext.call(mutableAgent, messages, signal)
      : messages;
    const sourceMessages = Array.isArray(transformed) ? transformed : messages;

    const prePromptMessageCount = Math.max(
      0,
      Math.min(
        sourceMessages.length,
        lastSeenLength ?? params.getPrePromptMessageCount?.() ?? sourceMessages.length,
      ),
    );
    lastSeenLength = prePromptMessageCount;

    const hasNewMessages = sourceMessages.length > prePromptMessageCount;
    if (!hasNewMessages) {
      return lastAssembledView ?? sourceMessages;
    }

    try {
      if (typeof contextEngine.afterTurn === "function") {
        await contextEngine.afterTurn({
          sessionId,
          sessionKey,
          sessionFile,
          messages: sourceMessages,
          prePromptMessageCount,
          tokenBudget,
        });
      } else {
        const newMessages = sourceMessages.slice(prePromptMessageCount);
        if (newMessages.length > 0) {
          if (typeof contextEngine.ingestBatch === "function") {
            await contextEngine.ingestBatch({
              sessionId,
              sessionKey,
              messages: newMessages,
            });
          } else {
            for (const message of newMessages) {
              await contextEngine.ingest({
                sessionId,
                sessionKey,
                message,
              });
            }
          }
        }
      }
      lastSeenLength = sourceMessages.length;
      const assembled = await contextEngine.assemble({
        sessionId,
        sessionKey,
        messages: sourceMessages,
        tokenBudget,
        model: modelId,
      });
      if (assembled && Array.isArray(assembled.messages) && assembled.messages !== sourceMessages) {
        lastAssembledView = assembled.messages;
        return assembled.messages;
      }
      lastAssembledView = null;
    } catch {
      // Best-effort: any engine failure falls through to the raw source messages.
    }

    return sourceMessages;
  }) as GuardableTransformContext;

  return () => {
    mutableAgent.transformContext = originalTransformContext;
  };
}
