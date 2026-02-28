import type { GatewayBrowserClient } from "../gateway.js";
import type { ChannelPairingRequest } from "../types.js";

export type ChannelPairingState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  pairingLoading: boolean;
  pairingError: string | null;
  pairingRequests: Record<string, ChannelPairingRequest[]>;
};

/**
 * 加载所有通道的配对请求
 */
export async function loadChannelPairingRequests(
  state: ChannelPairingState,
  opts?: { quiet?: boolean },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.pairingLoading) {
    return;
  }

  state.pairingLoading = true;
  if (!opts?.quiet) {
    state.pairingError = null;
  }

  try {
    // 通过 RPC 获取所有通道的配对请求
    // 注意：这可能需要后端实现一个聚合接口
    // 暂时返回空对象，等后端实现后再更新
    state.pairingRequests = {};
  } catch (err) {
    if (!opts?.quiet) {
      state.pairingError = String(err);
    }
  } finally {
    state.pairingLoading = false;
  }
}

/**
 * 批准通道配对请求
 */
export async function approveChannelPairing(
  state: ChannelPairingState,
  params: { channel: string; code: string; accountId?: string },
) {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    // 使用 CLI 命令格式的 RPC 调用
    await state.client.request("send", {
      to: "system",
      text: `openclaw pairing approve ${params.channel} ${params.code}${
        params.accountId ? ` --account ${params.accountId}` : ""
      }`,
    });

    // 刷新配对请求列表
    await loadChannelPairingRequests(state, { quiet: true });
  } catch (err) {
    state.pairingError = String(err);
    throw err;
  }
}

/**
 * 拒绝通道配对请求
 */
export async function rejectChannelPairing(
  state: ChannelPairingState,
  params: { channel: string; code: string },
) {
  if (!state.client || !state.connected) {
    return;
  }

  const confirmed = window.confirm("确定要拒绝此配对请求吗？");
  if (!confirmed) {
    return;
  }

  try {
    // 使用 CLI 命令格式的 RPC 调用
    await state.client.request("send", {
      to: "system",
      text: `openclaw pairing reject ${params.channel} ${params.code}`,
    });

    // 刷新配对请求列表
    await loadChannelPairingRequests(state, { quiet: true });
  } catch (err) {
    state.pairingError = String(err);
    throw err;
  }
}

/**
 * 获取所有待批准的配对请求总数
 */
export function getTotalPendingPairingCount(requests: Record<string, ChannelPairingRequest[]>): number {
  return Object.values(requests).reduce((sum, list) => sum + list.length, 0);
}

/**
 * 获取指定通道的配对请求列表
 */
export function getChannelPairingRequests(
  requests: Record<string, ChannelPairingRequest[]>,
  channelId: string,
): ChannelPairingRequest[] {
  return requests[channelId] || [];
}
