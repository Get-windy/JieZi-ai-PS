import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";

export const ZalouserToolSchema = Type.Object(
  {
    action: Type.String(),
    message: Type.Optional(Type.String()),
    imageUrl: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export function executeZalouserTool(
  _tool: AnyAgentTool,
  _params: Record<string, unknown>,
  _ctx: OpenClawPluginToolContext,
): Promise<unknown> {
  return Promise.resolve({ ok: false, error: "not implemented" });
}
