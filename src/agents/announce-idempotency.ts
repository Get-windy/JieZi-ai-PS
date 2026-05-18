export {
  buildAnnounceIdFromChildRun,
  buildAnnounceIdempotencyKey,
} from "../../upstream/src/agents/announce-idempotency.js";

export function resolveQueueAnnounceId(params: {
  announceId?: string;
  sessionKey: string;
  enqueuedAt: number;
}): string {
  return params.announceId ?? `${params.sessionKey}:${params.enqueuedAt}`;
}