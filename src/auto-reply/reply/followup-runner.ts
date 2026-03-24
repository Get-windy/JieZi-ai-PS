import crypto from "node:crypto";
import { lookupContextTokens } from "../../../upstream/src/agents/context.js";
import { DEFAULT_CONTEXT_TOKENS } from "../../../upstream/src/agents/defaults.js";
import { isFailoverError, isTimeoutError } from "../../../upstream/src/agents/failover-error.js";
import { runWithModelFallback } from "../../../upstream/src/agents/model-fallback.js";
import { runEmbeddedPiAgent } from "../../../upstream/src/agents/pi-embedded.js";
import {
  resolveAgentIdFromSessionKey,
  type SessionEntry,
} from "../../../upstream/src/config/sessions.js";
import type { TypingMode } from "../../../upstream/src/config/types.js";
import { logVerbose } from "../../../upstream/src/globals.js";
import { registerAgentRunContext } from "../../../upstream/src/infra/agent-events.js";
import { defaultRuntime } from "../../../upstream/src/runtime.js";
import { resolveAgentModelFallbacksOverride } from "../../agents/agent-scope.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("followup-runner");
import { stripHeartbeatToken } from "../../../upstream/src/auto-reply/heartbeat.js";
import { resolveReplyToMode } from "../../../upstream/src/auto-reply/reply/reply-threading.js";
import {
  incrementRunCompactionCount,
  persistRunSessionUsage,
} from "../../../upstream/src/auto-reply/reply/session-run-accounting.js";
import { createTypingSignaler } from "../../../upstream/src/auto-reply/reply/typing-mode.js";
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "../../../upstream/src/auto-reply/tokens.js";
import type { GetReplyOptions, ReplyPayload } from "../../../upstream/src/auto-reply/types.js";
import type { OriginatingChannelType } from "../templating.js";
import { resolveRunAuthProfile } from "./agent-runner-utils.js";
import type { FollowupRun } from "./queue/types.js";
import {
  applyReplyThreading,
  filterMessagingToolDuplicates,
  filterMessagingToolMediaDuplicates,
  shouldSuppressMessagingToolReplies,
} from "./reply-payloads.js";
import { isRoutableChannel, routeReply } from "./route-reply.js";
import type { TypingController } from "./typing.js";

export function createFollowupRunner(params: {
  opts?: GetReplyOptions;
  typing: TypingController;
  typingMode: TypingMode;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  defaultModel: string;
  agentCfgContextTokens?: number;
}): (queued: FollowupRun) => Promise<void> {
  const {
    opts,
    typing,
    typingMode,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    defaultModel,
    agentCfgContextTokens,
  } = params;
  const typingSignals = createTypingSignaler({
    typing,
    mode: typingMode,
    isHeartbeat: opts?.isHeartbeat === true,
  });

  /**
   * Sends followup payloads, routing to the originating channel if set.
   *
   * When originatingChannel/originatingTo are set on the queued run,
   * replies are routed directly to that provider instead of using the
   * session's current dispatcher. This ensures replies go back to
   * where the message originated.
   */
  const sendFollowupPayloads = async (payloads: ReplyPayload[], queued: FollowupRun) => {
    // Check if we should route to originating channel.
    const { originatingChannel, originatingTo } = queued;
    const shouldRouteToOriginating = isRoutableChannel(originatingChannel) && originatingTo;

    if (!shouldRouteToOriginating && !opts?.onBlockReply) {
      logVerbose("followup queue: no onBlockReply handler; dropping payloads");
      return;
    }

    for (const payload of payloads) {
      if (!payload?.text && !payload?.mediaUrl && !payload?.mediaUrls?.length) {
        continue;
      }
      if (
        isSilentReplyText(payload.text, SILENT_REPLY_TOKEN) &&
        !payload.mediaUrl &&
        !payload.mediaUrls?.length
      ) {
        continue;
      }
      await typingSignals.signalTextDelta(payload.text);

      // Route to originating channel if set, otherwise fall back to dispatcher.
      if (shouldRouteToOriginating) {
        const result = await routeReply({
          payload,
          channel: originatingChannel,
          to: originatingTo,
          sessionKey: queued.run.sessionKey,
          accountId: queued.originatingAccountId,
          threadId: queued.originatingThreadId,
          cfg: queued.run.config,
        });
        if (!result.ok) {
          // Log error and fall back to dispatcher if available.
          const errorMsg = result.error ?? "unknown error";
          logVerbose(`followup queue: route-reply failed: ${errorMsg}`);
          // Fallback: try the dispatcher if routing failed.
          if (opts?.onBlockReply) {
            await opts.onBlockReply(payload);
          }
        }
      } else if (opts?.onBlockReply) {
        await opts.onBlockReply(payload);
      }
    }
  };

  return async (queued: FollowupRun) => {
    try {
      const runId = crypto.randomUUID();
      if (queued.run.sessionKey) {
        registerAgentRunContext(runId, {
          sessionKey: queued.run.sessionKey,
          verboseLevel: queued.run.verboseLevel,
        });
      }
      let autoCompactionCompleted = false;
      let runResult: Awaited<ReturnType<typeof runEmbeddedPiAgent>>;
      let fallbackProvider = queued.run.provider;
      let fallbackModel = queued.run.model;
      try {
        const fallbackResult = await runWithModelFallback({
          cfg: queued.run.config,
          provider: queued.run.provider,
          model: queued.run.model,
          agentDir: queued.run.agentDir,
          fallbacksOverride: (() => {
            const merged = [
              // 1. 首选：智能路由动态返回的次优候选（当首选模型超时/失败时自动切换）
              ...(queued.run.smartRoutingFallbacks ?? []),
              // 2. 如果尚有静态配置的 fallbacks，也一并追加作为备选
              ...(resolveAgentModelFallbacksOverride(
                queued.run.config,
                resolveAgentIdFromSessionKey(queued.run.sessionKey),
              ) ?? []),
            ].filter((v, i, arr) => arr.indexOf(v) === i);
            // 只有当合并后有内容时才传入，避免空数组覆盖默认 fallback 配置
            return merged.length > 0 ? merged : undefined;
          })(),
          run: (provider, model) => {
            const authProfile = resolveRunAuthProfile(queued.run, provider);
            // 每个 agent 使用独立的 global lane，避免共享 CommandLane.Main 造成软死锁
            const agentRunLane = queued.run.agentId ? `agent-run:${queued.run.agentId}` : undefined;
            return runEmbeddedPiAgent({
              sessionId: queued.run.sessionId,
              sessionKey: queued.run.sessionKey,
              agentId: queued.run.agentId,
              messageProvider: queued.run.messageProvider,
              agentAccountId: queued.run.agentAccountId,
              messageTo: queued.originatingTo,
              messageThreadId: queued.originatingThreadId,
              groupId: queued.run.groupId,
              groupChannel: queued.run.groupChannel,
              groupSpace: queued.run.groupSpace,
              senderId: queued.run.senderId,
              senderName: queued.run.senderName,
              senderUsername: queued.run.senderUsername,
              senderE164: queued.run.senderE164,
              senderIsOwner: queued.run.senderIsOwner,
              sessionFile: queued.run.sessionFile,
              agentDir: queued.run.agentDir,
              workspaceDir: queued.run.workspaceDir,
              config: queued.run.config,
              skillsSnapshot: queued.run.skillsSnapshot,
              prompt: queued.prompt,
              extraSystemPrompt: queued.run.extraSystemPrompt,
              ownerNumbers: queued.run.ownerNumbers,
              enforceFinalTag: queued.run.enforceFinalTag,
              provider,
              model,
              lane: agentRunLane,
              ...authProfile,
              thinkLevel: queued.run.thinkLevel,
              verboseLevel: queued.run.verboseLevel,
              reasoningLevel: queued.run.reasoningLevel,
              suppressToolErrorWarnings: opts?.suppressToolErrorWarnings,
              execOverrides: queued.run.execOverrides,
              bashElevated: queued.run.bashElevated,
              timeoutMs: queued.run.timeoutMs,
              runId,
              blockReplyBreak: queued.run.blockReplyBreak,
              // 当外层有动态 fallback 候选时，通知内层认为 fallbackConfigured=true
              // 这样超时时会抛 FailoverError 而不是 surface_error
              hasDynamicFallbacks: (queued.run.smartRoutingFallbacks?.length ?? 0) > 0,
              onAgentEvent: (evt) => {
                if (evt.stream !== "compaction") {
                  return;
                }
                const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
                if (phase === "end") {
                  autoCompactionCompleted = true;
                }
              },
            });
          },
        });
        runResult = fallbackResult.result;
        fallbackProvider = fallbackResult.provider;
        fallbackModel = fallbackResult.model;
        // 如果实际使用的模型与首选不同，说明发生了 fallback 切换，在带内容的回复前预置一条切换通知
        const didFallback =
          fallbackResult.provider !== queued.run.provider ||
          fallbackResult.model !== queued.run.model;
        if (didFallback) {
          const fromLabel = `${queued.run.provider}/${queued.run.model}`;
          const toLabel = `${fallbackResult.provider}/${fallbackResult.model}`;
          log.info(`[model-fallback] switched from ${fromLabel} to ${toLabel} (timeout/failure)`);
          // 在 runResult.payloads 前插入一条通知内容
          if (runResult.payloads && runResult.payloads.length > 0) {
            runResult = {
              ...runResult,
              payloads: [
                { text: `⚡ 模型 ${fromLabel} 超时，已自动切换到备用模型 ${toLabel} 继续处理。` },
                ...runResult.payloads,
              ],
            };
          }
        }
      } catch (err) {
        const isTimeout =
          isTimeoutError(err) ||
          (isFailoverError(err) && (err as { reason?: string }).reason === "timeout") ||
          (err instanceof Error && /timed? ?out/i.test(err.message));
        const hasFallbacks = (queued.run.smartRoutingFallbacks?.length ?? 0) > 0;
        if (isTimeout && !hasFallbacks) {
          // agent 只绑定了一个模型，超时后无可用备用模型，发出明确错误提示
          const modelLabel = `${queued.run.provider}/${queued.run.model}`;
          defaultRuntime.error?.(`Followup agent timed out, no fallback: ${modelLabel}`);
          const errorPayload = {
            text: `⏱️ 请求超时：模型 ${modelLabel} 未在规定时间内响应。\n该 Agent 仅绑定了一个模型，无法自动切换备用模型。\n请稍后重试，或在 Agent 配置中绑定多个模型以启用自动故障转移。`,
            isError: true as const,
          };
          await sendFollowupPayloads([errorPayload], queued);
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        defaultRuntime.error?.(`Followup agent failed before reply: ${message}`);
        return;
      }

      const usage = runResult.meta?.agentMeta?.usage;
      const promptTokens = runResult.meta?.agentMeta?.promptTokens;
      const modelUsed = runResult.meta?.agentMeta?.model ?? fallbackModel ?? defaultModel;
      const contextTokensUsed =
        agentCfgContextTokens ??
        lookupContextTokens(modelUsed) ??
        sessionEntry?.contextTokens ??
        DEFAULT_CONTEXT_TOKENS;

      if (storePath && sessionKey) {
        await persistRunSessionUsage({
          storePath,
          sessionKey,
          usage,
          lastCallUsage: runResult.meta?.agentMeta?.lastCallUsage,
          promptTokens,
          modelUsed,
          providerUsed: fallbackProvider,
          contextTokensUsed,
          logLabel: "followup",
        });
      }

      const payloadArray = runResult.payloads ?? [];
      if (payloadArray.length === 0) {
        return;
      }

      // 检测内层 run 直接返回的超时错误 payload（surface_error 路径，无 fallback 时发生）
      // 当 agent 只绑定了一个模型且超时时，修就错误提示为用户可读的中文提示
      const hasFallbacksForTimeout = (queued.run.smartRoutingFallbacks?.length ?? 0) > 0;
      if (!hasFallbacksForTimeout && payloadArray.length === 1) {
        const singlePayload = payloadArray[0];
        if (
          singlePayload?.isError === true &&
          singlePayload?.text &&
          /timed? ?out/i.test(singlePayload.text)
        ) {
          const modelLabel = `${queued.run.provider}/${queued.run.model}`;
          const errorPayload = {
            text: `⏱️ 请求超时：模型 ${modelLabel} 未在规定时间内响应。\n该 Agent 仅绑定了一个模型，无法自动切换备用模型。\n请稍后重试，或在 Agent 配置中绑定多个模型以启用自动故障转移。`,
            isError: true as const,
          };
          await sendFollowupPayloads([errorPayload], queued);
          return;
        }
      }
      const sanitizedPayloads = payloadArray.flatMap((payload) => {
        const text = payload.text;
        if (!text || !text.includes("HEARTBEAT_OK")) {
          return [payload];
        }
        const stripped = stripHeartbeatToken(text, { mode: "message" });
        const hasMedia = Boolean(payload.mediaUrl) || (payload.mediaUrls?.length ?? 0) > 0;
        if (stripped.shouldSkip && !hasMedia) {
          return [];
        }
        return [{ ...payload, text: stripped.text }];
      });
      const replyToChannel =
        queued.originatingChannel ??
        (queued.run.messageProvider?.toLowerCase() as OriginatingChannelType | undefined);
      const replyToMode = resolveReplyToMode(
        queued.run.config,
        replyToChannel,
        queued.originatingAccountId,
        queued.originatingChatType,
      );

      const replyTaggedPayloads: ReplyPayload[] = applyReplyThreading({
        payloads: sanitizedPayloads,
        replyToMode,
        replyToChannel,
      });

      const dedupedPayloads = filterMessagingToolDuplicates({
        payloads: replyTaggedPayloads,
        sentTexts: runResult.messagingToolSentTexts ?? [],
      });
      const mediaFilteredPayloads = filterMessagingToolMediaDuplicates({
        payloads: dedupedPayloads,
        sentMediaUrls: runResult.messagingToolSentMediaUrls ?? [],
      });
      const suppressMessagingToolReplies = shouldSuppressMessagingToolReplies({
        messageProvider: queued.run.messageProvider,
        messagingToolSentTargets: runResult.messagingToolSentTargets,
        originatingTo: queued.originatingTo,
        accountId: queued.run.agentAccountId,
      });
      const finalPayloads = suppressMessagingToolReplies ? [] : mediaFilteredPayloads;

      if (finalPayloads.length === 0) {
        return;
      }

      if (autoCompactionCompleted) {
        const count = await incrementRunCompactionCount({
          sessionEntry,
          sessionStore,
          sessionKey,
          storePath,
          lastCallUsage: runResult.meta?.agentMeta?.lastCallUsage,
          contextTokensUsed,
        });
        if (queued.run.verboseLevel && queued.run.verboseLevel !== "off") {
          const suffix = typeof count === "number" ? ` (count ${count})` : "";
          finalPayloads.unshift({
            text: `🧹 Auto-compaction complete${suffix}.`,
          });
        }
      }

      await sendFollowupPayloads(finalPayloads, queued);
    } finally {
      typing.markRunComplete();
    }
  };
}
