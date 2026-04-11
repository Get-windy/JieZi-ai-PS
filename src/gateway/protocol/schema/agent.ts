// Local overlay: extends upstream AgentParamsSchema to allow `spawnedBy` in RPC params.
// The upstream schema uses additionalProperties: false, which blocks spawnedBy.
// Re-export everything from upstream except AgentParamsSchema, which we override below.
export {
  AgentInternalEventSchema,
  AgentEventSchema,
  MessageActionToolContextSchema,
  MessageActionParamsSchema,
  SendParamsSchema,
  PollParamsSchema,
  AgentIdentityParamsSchema,
  AgentIdentityResultSchema,
  AgentWaitParamsSchema,
  WakeParamsSchema,
} from "../../../../upstream/src/gateway/protocol/schema/agent.js";

import { Type } from "@sinclair/typebox";
import AjvPkg from "ajv";
import { AgentInternalEventSchema } from "../../../../upstream/src/gateway/protocol/schema/agent.js";
import {
  InputProvenanceSchema,
  NonEmptyString,
  SessionLabelString,
} from "../../../../upstream/src/gateway/protocol/schema/primitives.js";

// Extended schema that adds `spawnedBy` on top of the upstream definition.
// Keep all upstream fields in sync manually when upgrading upstream.
export const AgentParamsSchema = Type.Object(
  {
    message: NonEmptyString,
    agentId: Type.Optional(NonEmptyString),
    to: Type.Optional(Type.String()),
    replyTo: Type.Optional(Type.String()),
    sessionId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
    deliver: Type.Optional(Type.Boolean()),
    attachments: Type.Optional(Type.Array(Type.Unknown())),
    channel: Type.Optional(Type.String()),
    replyChannel: Type.Optional(Type.String()),
    accountId: Type.Optional(Type.String()),
    replyAccountId: Type.Optional(Type.String()),
    threadId: Type.Optional(Type.String()),
    groupId: Type.Optional(Type.String()),
    groupChannel: Type.Optional(Type.String()),
    groupSpace: Type.Optional(Type.String()),
    timeout: Type.Optional(Type.Integer({ minimum: 0 })),
    bestEffortDeliver: Type.Optional(Type.Boolean()),
    lane: Type.Optional(Type.String()),
    extraSystemPrompt: Type.Optional(Type.String()),
    internalEvents: Type.Optional(Type.Array(AgentInternalEventSchema)),
    inputProvenance: Type.Optional(InputProvenanceSchema),
    idempotencyKey: NonEmptyString,
    label: Type.Optional(SessionLabelString),
    // Local extension: allows spawnedBy to be passed as an RPC param.
    // Upstream reads spawnedBy only from the session store (entry.spawnedBy).
    spawnedBy: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const ajv = new (AjvPkg as unknown as new (opts?: object) => import("ajv").default)({
  allErrors: true,
  strict: false,
  removeAdditional: false,
});

export const validateAgentParams = ajv.compile(AgentParamsSchema);
