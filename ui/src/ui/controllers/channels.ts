import { ChannelsStatusSnapshot } from "../types.ts";
import type { ChannelsState } from "./channels.types.ts";
import {
  formatMissingOperatorReadScopeMessage,
  isMissingOperatorReadScopeError,
} from "./scope-errors.ts";

export type { ChannelsState };

export async function loadChannels(state: ChannelsState, probe: boolean) {
  // 调试日志
  if (typeof window !== "undefined" && (window as unknown as { __DEBUG_UI__?: boolean }).__DEBUG_UI__) {
    console.log("[DEBUG:Channels:loadChannels] called:", {
      hasClient: !!state.client,
      connected: state.connected,
      alreadyLoading: state.channelsLoading,
      probe,
    });
  }

  if (!state.client || !state.connected) {
    console.warn("[DEBUG:Channels:loadChannels] skipped: no client or not connected");
    return;
  }
  if (state.channelsLoading) {
    console.warn("[DEBUG:Channels:loadChannels] skipped: already loading");
    return;
  }
  state.channelsLoading = true;
  state.channelsError = null;
  try {
    console.log("[DEBUG:Channels:loadChannels] requesting channels.status...");
    const res = await state.client.request<ChannelsStatusSnapshot | null>("channels.status", {
      probe,
      timeoutMs: 8000,
    });
    console.log("[DEBUG:Channels:loadChannels] received response:", {
      channelsCount: Object.keys(res?.channels ?? {}).length,
      channelOrderCount: res?.channelOrder?.length ?? 0,
      channelMetaCount: res?.channelMeta?.length ?? 0,
      channelAccountsCount: Object.keys(res?.channelAccounts ?? {}).length,
    });
    state.channelsSnapshot = res;
    state.channelsLastSuccess = Date.now();
  } catch (err) {
    console.error("[DEBUG:Channels:loadChannels] error:", err);
    if (isMissingOperatorReadScopeError(err)) {
      state.channelsSnapshot = null;
      state.channelsError = formatMissingOperatorReadScopeMessage("channel status");
    } else {
      state.channelsError = String(err);
    }
  } finally {
    state.channelsLoading = false;
    console.log("[DEBUG:Channels:loadChannels] loading finished");
  }
}

export async function startWhatsAppLogin(state: ChannelsState, force: boolean) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    const res = await state.client.request<{ message?: string; qrDataUrl?: string }>(
      "web.login.start",
      {
        force,
        timeoutMs: 30000,
      },
    );
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginQrDataUrl = res.qrDataUrl ?? null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function waitWhatsAppLogin(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    const res = await state.client.request<{ message?: string; connected?: boolean }>(
      "web.login.wait",
      {
        timeoutMs: 120000,
      },
    );
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginConnected = res.connected ?? null;
    if (res.connected) {
      state.whatsappLoginQrDataUrl = null;
    }
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function logoutWhatsApp(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    await state.client.request("channels.logout", { channel: "whatsapp" });
    state.whatsappLoginMessage = "Logged out.";
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
  } finally {
    state.whatsappBusy = false;
  }
}
