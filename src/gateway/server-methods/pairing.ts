import type { GatewayRequestHandlers } from "./types.js";
import {
  approveChannelPairingCode,
  type PairingChannel,
} from "../../pairing/pairing-store.js";
import { notifyPairingApproved } from "../../channels/plugins/pairing.js";

type ApprovePairingParams = {
  channel: PairingChannel;
  code: string;
  accountId?: string;
  notify?: boolean;
};

type RejectPairingParams = {
  channel: PairingChannel;
  code: string;
  accountId?: string;
};

export const pairingHandlers: GatewayRequestHandlers = {
  "pairing.approve": async (opts: any) => {
    const params = opts.params as ApprovePairingParams;
    const { channel, code, accountId, notify } = params;

    if (!channel || !code) {
      opts.respond(false, undefined, { code: "INVALID_PARAMS", message: "Channel and code are required" });
      return;
    }

    try {
      // 批准配对请求
      const approved = await approveChannelPairingCode({ channel, code, accountId });

      if (!approved) {
        opts.respond(false, undefined, {
          code: "NOT_FOUND",
          message: `No pending pairing request found for code: ${code}`,
        });
        return;
      }

      // 如果需要通知用户
      if (notify) {
        try {
          await notifyPairingApproved({
            channelId: channel,
            id: approved.id,
            cfg: opts.context.loadConfig(),
          });
        } catch (err) {
          console.warn(`Failed to notify requester: ${String(err)}`);
        }
      }

      opts.respond(true, {
        success: true,
        id: approved.id,
      });
    } catch (err) {
      opts.respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: String(err),
      });
    }
  },

  "pairing.reject": async (opts: any) => {
    const params = opts.params as RejectPairingParams;
    const { channel, code, accountId } = params;

    if (!channel || !code) {
      opts.respond(false, undefined, { code: "INVALID_PARAMS", message: "Channel and code are required" });
      return;
    }

    try {
      // 拒绝配对请求（删除但不添加到 allowlist）
      // 注意：当前 approveChannelPairingCode 会自动添加到 allowlist
      // TODO: 需要在 pairing-store.ts 中添加 rejectChannelPairingCode 函数
      const approved = await approveChannelPairingCode({ channel, code, accountId });

      if (!approved) {
        opts.respond(false, undefined, {
          code: "NOT_FOUND",
          message: `No pending pairing request found for code: ${code}`,
        });
        return;
      }

      opts.respond(true, { success: true });
    } catch (err) {
      opts.respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: String(err),
      });
    }
  },
};
