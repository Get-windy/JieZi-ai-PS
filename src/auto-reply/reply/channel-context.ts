// 覆盖 upstream/src/auto-reply/reply/channel-context.ts
// 补充上游已移除的 surface 判断 helper 函数（本地功能需要）

export {
  resolveCommandSurfaceChannel,
  resolveChannelAccountId,
} from "../../../upstream/src/auto-reply/reply/channel-context.js";

type SurfaceParams = {
  ctx: {
    OriginatingChannel?: string;
    Surface?: string;
    Provider?: string;
  };
  command?: {
    channel?: string;
  };
};

export function isDiscordSurface(params: SurfaceParams): boolean {
  const channel =
    params.ctx.OriginatingChannel ??
    params.command?.channel ??
    params.ctx.Surface ??
    params.ctx.Provider;
  return (
    String(channel ?? "")
      .trim()
      .toLowerCase() === "discord"
  );
}

export function isTelegramSurface(params: SurfaceParams): boolean {
  const channel =
    params.ctx.OriginatingChannel ??
    params.command?.channel ??
    params.ctx.Surface ??
    params.ctx.Provider;
  return (
    String(channel ?? "")
      .trim()
      .toLowerCase() === "telegram"
  );
}

export function isMatrixSurface(params: SurfaceParams): boolean {
  const channel =
    params.ctx.OriginatingChannel ??
    params.command?.channel ??
    params.ctx.Surface ??
    params.ctx.Provider;
  return (
    String(channel ?? "")
      .trim()
      .toLowerCase() === "matrix"
  );
}

type DiscordAccountParams = {
  cfg: unknown;
  ctx: {
    OriginatingChannel?: string;
    Surface?: string;
    Provider?: string;
    AccountId?: string;
  };
  command?: {
    channel?: string;
  };
};

export function resolveDiscordAccountId(params: DiscordAccountParams): string {
  const accountId = typeof params.ctx.AccountId === "string" ? params.ctx.AccountId.trim() : "";
  return accountId || "default";
}
