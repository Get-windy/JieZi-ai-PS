export * from "../../upstream/src/infra/heartbeat-wake.js";

import { requestHeartbeat } from "../../upstream/src/infra/heartbeat-wake.js";

export function requestHeartbeatNow(opts?: {
  reason?: string;
  agentId?: string;
  sessionKey?: string;
}) {
  requestHeartbeat({
    source: "manual",
    intent: "immediate",
    reason: opts?.reason ?? "manual",
    agentId: opts?.agentId,
    sessionKey: opts?.sessionKey,
  });
}