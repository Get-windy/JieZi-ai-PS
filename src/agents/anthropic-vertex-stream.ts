// Local overlay: lazy-load @anthropic-ai/vertex-sdk so it becomes a true
// optional dependency — the rest of the application loads fine even when
// the package is not installed.  Install it only when you actually use an
// Anthropic-Vertex model:
//   pnpm add -w @anthropic-ai/vertex-sdk
import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamAnthropic, type AnthropicOptions, type Model } from "@mariozechner/pi-ai";
import {
  resolveAnthropicVertexClientRegion,
  resolveAnthropicVertexProjectId,
} from "../../upstream/src/plugin-sdk/anthropic-vertex.js";

type AnthropicVertexEffort = NonNullable<AnthropicOptions["effort"]>;

// Lazy-loaded singleton — resolved on first call to createAnthropicVertexStreamFn.
let AnthropicVertexClass: (new (opts: Record<string, unknown>) => unknown) | undefined;

async function loadAnthropicVertex(): Promise<new (opts: Record<string, unknown>) => unknown> {
  if (AnthropicVertexClass) {
    return AnthropicVertexClass;
  }
  try {
    const mod = await import("@anthropic-ai/vertex-sdk");
    AnthropicVertexClass = mod.AnthropicVertex as new (opts: Record<string, unknown>) => unknown;
    return AnthropicVertexClass;
  } catch {
    throw new Error(
      "[anthropic-vertex] @anthropic-ai/vertex-sdk is not installed.\n" +
        "Run: pnpm add -w @anthropic-ai/vertex-sdk",
    );
  }
}

function resolveAnthropicVertexMaxTokens(params: {
  modelMaxTokens: number | undefined;
  requestedMaxTokens: number | undefined;
}): number | undefined {
  const modelMax =
    typeof params.modelMaxTokens === "number" &&
    Number.isFinite(params.modelMaxTokens) &&
    params.modelMaxTokens > 0
      ? Math.floor(params.modelMaxTokens)
      : undefined;
  const requested =
    typeof params.requestedMaxTokens === "number" &&
    Number.isFinite(params.requestedMaxTokens) &&
    params.requestedMaxTokens > 0
      ? Math.floor(params.requestedMaxTokens)
      : undefined;

  if (modelMax !== undefined && requested !== undefined) {
    return Math.min(requested, modelMax);
  }
  return requested ?? modelMax;
}

/**
 * Create a StreamFn that routes through pi-ai's `streamAnthropic` with an
 * injected `AnthropicVertex` client.  All streaming, message conversion, and
 * event handling is handled by pi-ai — we only supply the GCP-authenticated
 * client and map SimpleStreamOptions → AnthropicOptions.
 *
 * The SDK is loaded lazily on first invocation so the application starts
 * without errors even when @anthropic-ai/vertex-sdk is not installed.
 */
export function createAnthropicVertexStreamFn(
  projectId: string | undefined,
  region: string,
  baseURL?: string,
): StreamFn {
  // client is created lazily inside the returned StreamFn.
  let clientPromise: Promise<unknown> | undefined;

  const getClient = (): Promise<unknown> => {
    if (!clientPromise) {
      clientPromise = loadAnthropicVertex().then((Cls) => {
        return new Cls({
          region,
          ...(baseURL ? { baseURL } : {}),
          ...(projectId ? { projectId } : {}),
        });
      });
    }
    return clientPromise;
  };

  return (model, context, options) => {
    const maxTokens = resolveAnthropicVertexMaxTokens({
      modelMaxTokens: model.maxTokens,
      requestedMaxTokens: options?.maxTokens,
    });
    const opts: AnthropicOptions = {
      // client is resolved asynchronously and injected below
      client: undefined as unknown as AnthropicOptions["client"],
      temperature: options?.temperature,
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      signal: options?.signal,
      cacheRetention: options?.cacheRetention,
      sessionId: options?.sessionId,
      headers: options?.headers,
      onPayload: options?.onPayload,
      maxRetryDelayMs: options?.maxRetryDelayMs,
      metadata: options?.metadata,
    };

    if (options?.reasoning) {
      const isAdaptive =
        model.id.includes("opus-4-6") ||
        model.id.includes("opus-4.6") ||
        model.id.includes("sonnet-4-6") ||
        model.id.includes("sonnet-4.6");

      if (isAdaptive) {
        opts.thinkingEnabled = true;
        const effortMap: Record<string, AnthropicVertexEffort> = {
          minimal: "low",
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: model.id.includes("opus-4-6") || model.id.includes("opus-4.6") ? "max" : "high",
        };
        opts.effort = effortMap[options.reasoning] ?? "high";
      } else {
        opts.thinkingEnabled = true;
        const budgets = options.thinkingBudgets;
        opts.thinkingBudgetTokens =
          (budgets && options.reasoning in budgets
            ? budgets[options.reasoning as keyof typeof budgets]
            : undefined) ?? 10000;
      }
    } else {
      opts.thinkingEnabled = false;
    }

    // Wrap in a promise chain so the SDK is loaded before streaming starts.
    return getClient().then((client) => {
      opts.client = client as AnthropicOptions["client"];
      return streamAnthropic(model as Model<"anthropic-messages">, context, opts);
    }) as ReturnType<StreamFn>;
  };
}

function resolveAnthropicVertexSdkBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    if (!normalizedPath || normalizedPath === "") {
      url.pathname = "/v1";
      return url.toString().replace(/\/$/, "");
    }
    if (!normalizedPath.endsWith("/v1")) {
      url.pathname = `${normalizedPath}/v1`;
      return url.toString().replace(/\/$/, "");
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

export function createAnthropicVertexStreamFnForModel(
  model: { baseUrl?: string },
  env: NodeJS.ProcessEnv = process.env,
): StreamFn {
  return createAnthropicVertexStreamFn(
    resolveAnthropicVertexProjectId(env),
    resolveAnthropicVertexClientRegion({
      baseUrl: model.baseUrl,
      env,
    }),
    resolveAnthropicVertexSdkBaseUrl(model.baseUrl),
  );
}
